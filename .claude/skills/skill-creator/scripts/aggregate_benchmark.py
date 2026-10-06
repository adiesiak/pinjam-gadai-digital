#!/usr/bin/env python3
"""Aggregate one iteration's runs into benchmark.json and benchmark.md.

    python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>

Reads, for every eval directory inside the iteration:

    <eval-dir>/<configuration>/grading.json
    <eval-dir>/<configuration>/timing.json

and writes `benchmark.json` + `benchmark.md` into the iteration directory. The
JSON shape is the contract in `references/schemas.md`; the viewer reads it by
field name, so don't rename things here without updating that file too.

Design notes worth knowing:

- An eval directory with no `grading.json` is *ungraded*, not failed. Those runs
  are excluded from the pass-rate mean and counted separately, because treating
  "we never checked" as "it failed" silently corrupts every comparison.
- `stddev` is the sample standard deviation. With one run it is 0.0, which is
  honest: a single sample says nothing about variance, and reporting 0.0 as though
  it meant "perfectly stable" would be a lie. The observations call that out.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import re
import statistics
import sys
from pathlib import Path
from typing import Any

# Configuration names are fixed by references/schemas.md.
CONFIGS = ("with_skill", "without_skill", "old_skill")
BASELINE_PREFERENCE = ("without_skill", "old_skill")
NON_EVAL_DIRS = {"skill-snapshot", "__pycache__"}


def baca_json(path: Path) -> dict[str, Any] | None:
    """Read a JSON file, returning None if it's absent or unparseable.

    A corrupt grading.json is reported by the caller rather than crashing the
    whole aggregation — one broken run shouldn't cost you the whole benchmark.
    """
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        print(f"  ! skipped {path}: {exc}", file=sys.stderr)
        return None


def ambil_ekspektasi(grading: dict[str, Any]) -> list[dict[str, Any]]:
    """Pull the expectation list, tolerating the older field names.

    The canonical name is `expectations` with `text`/`passed`/`evidence`
    (schemas.md). We still accept `assertions`/`results` and `name`/`met` so a
    hand-written grading file gives a usable number instead of silently zero.
    """
    raw = grading.get("expectations") or grading.get("assertions") or grading.get("results") or []
    keluar: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        keluar.append(
            {
                "text": item.get("text") or item.get("name") or item.get("assertion") or "(tanpa teks)",
                "passed": bool(item.get("passed", item.get("met", False))),
                "evidence": item.get("evidence") or item.get("details") or "",
            }
        )
    return keluar


def stat(nilai: list[float]) -> dict[str, float]:
    """Mean and sample stddev, with stddev 0.0 when there's only one sample."""
    if not nilai:
        return {"mean": 0.0, "stddev": 0.0}
    if len(nilai) == 1:
        return {"mean": float(nilai[0]), "stddev": 0.0}
    return {"mean": float(statistics.fmean(nilai)), "stddev": float(statistics.stdev(nilai))}


def waktu_dari(timing: dict[str, Any] | None) -> tuple[float | None, float | None]:
    """(seconds, tokens) from a timing.json, deriving seconds if only ms is set."""
    if not timing:
        return None, None
    detik = timing.get("total_duration_seconds")
    if detik is None and timing.get("duration_ms") is not None:
        detik = float(timing["duration_ms"]) / 1000.0
    token = timing.get("total_tokens")
    return (
        float(detik) if isinstance(detik, (int, float)) else None,
        float(token) if isinstance(token, (int, float)) else None,
    )


def temukan_eval(iter_dir: Path) -> list[Path]:
    """Eval directories directly inside the iteration directory."""
    hasil = []
    for anak in sorted(iter_dir.iterdir()):
        if not anak.is_dir() or anak.name in NON_EVAL_DIRS:
            continue
        hasil.append(anak)
    return hasil


def konfigurasi_di(eval_dir: Path) -> list[str]:
    """Configuration directories present for one eval.

    Named configs win; otherwise any subdirectory that actually holds run data is
    accepted, so a custom baseline name doesn't vanish from the table.
    """
    ditemukan = [c for c in CONFIGS if (eval_dir / c).is_dir()]
    if ditemukan:
        return ditemukan
    return [
        a.name
        for a in sorted(eval_dir.iterdir())
        if a.is_dir() and ((a / "grading.json").is_file() or (a / "outputs").is_dir())
    ]


def pilih_baseline(configs: list[str]) -> str | None:
    for kandidat in BASELINE_PREFERENCE:
        if kandidat in configs:
            return kandidat
    non_with = [c for c in configs if c != "with_skill"]
    return non_with[0] if non_with else None


def bangun_observasi(
    configs: dict[str, dict[str, Any]],
    per_assertion: dict[str, dict[str, list[bool]]],
    deltas: list[dict[str, Any]],
) -> list[str]:
    """Mechanical findings. The analyst pass adds judgement on top of these."""
    obs: list[str] = []
    nama = list(configs)

    # Non-discriminating assertions: they'd pass with or without the skill, so they
    # inflate the headline pass rate without measuring anything.
    for teks, per_config in per_assertion.items():
        rates = []
        for cfg, hasil in per_config.items():
            if hasil:
                rates.append((cfg, sum(hasil) / len(hasil)))
        if len(rates) < 2:
            continue
        if all(r == 1.0 for _, r in rates):
            obs.append(
                f"Assertion selalu lulus di semua konfigurasi — tidak membedakan: \"{teks}\""
            )
        elif all(r == 0.0 for _, r in rates):
            obs.append(f"Assertion tidak pernah lulus di konfigurasi mana pun: \"{teks}\"")

    # Cost signals.
    for cfg in nama:
        info = configs[cfg]
        if info["ungraded_runs"]:
            obs.append(
                f"{cfg}: {info['ungraded_runs']} run tanpa grading.json — "
                f"pass rate dihitung dari {info['graded_runs']} run saja."
            )
        if info["graded_runs"] and not info["timing_runs"]:
            obs.append(f"{cfg}: tidak ada timing.json — kolom waktu & token kosong.")

    # High variance, only meaningful with more than one sample.
    for cfg in nama:
        info = configs[cfg]
        if info["graded_runs"] > 1 and info["pass_rate"]["mean"] > 0:
            rasio = info["pass_rate"]["stddev"] / info["pass_rate"]["mean"]
            if rasio > 0.25:
                obs.append(
                    f"{cfg}: sebaran pass rate tinggi (stddev {info['pass_rate']['stddev']:.2f} "
                    f"vs mean {info['pass_rate']['mean']:.2f}) — hasil kemungkinan tidak stabil."
                )

    # A delta smaller than the spread isn't a result.
    for d in deltas:
        base = configs.get(d["baseline"], {})
        atas = configs.get(d["configuration"], {})
        sebar = max(
            atas.get("pass_rate", {}).get("stddev", 0.0),
            base.get("pass_rate", {}).get("stddev", 0.0),
        )
        if abs(d["pass_rate_delta"]) <= sebar:
            obs.append(
                f"selisih pass rate {d['configuration']} vs {d['baseline']} "
                f"({d['pass_rate_delta']:+.2f}) tidak lebih besar dari sebarannya "
                f"({sebar:.2f}) — jangan dibaca sebagai kemenangan."
            )

    if not obs:
        obs.append("Tidak ada pola mekanis yang mencolok pada iterasi ini.")
    return obs


def bangun_markdown(bench: dict[str, Any]) -> str:
    baris = [
        f"# Benchmark — {bench['skill_name']} (iterasi {bench['iteration']})",
        "",
        f"Dibuat: {bench['generated_at']}",
        "",
        "| Konfigurasi | Run dinilai | Pass rate | Waktu (s) | Token |",
        "|---|---|---|---|---|",
    ]
    for c in bench["configs"]:
        pr, w, t = c["pass_rate"], c["time_seconds"], c["tokens"]
        baris.append(
            f"| {c['configuration']} | {c['graded_runs']}/{len(c['runs'])} | "
            f"{pr['mean']:.0%} ± {pr['stddev']:.2f} | "
            f"{w['mean']:.1f} ± {w['stddev']:.1f} | "
            f"{t['mean']:.0f} ± {t['stddev']:.0f} |"
        )
    if bench["deltas"]:
        baris += ["", "## Selisih terhadap baseline", "",
                  "| Konfigurasi | vs | Pass rate | Waktu (s) | Token |", "|---|---|---|---|---|"]
        for d in bench["deltas"]:
            baris.append(
                f"| {d['configuration']} | {d['baseline']} | {d['pass_rate_delta']:+.2f} | "
                f"{d['time_seconds_delta']:+.1f} | {d['tokens_delta']:+.0f} |"
            )
    baris += ["", "## Per eval", ""]
    for e in bench["evals"]:
        isi = ", ".join(
            f"{cfg}: {v['pass_rate']:.0%}" for cfg, v in e["configs"].items()
        )
        baris.append(f"- **{e['eval_name']}** — {isi}")
    baris += ["", "## Observasi", ""]
    baris += [f"- {o}" for o in bench["observations"]]
    return "\n".join(baris) + "\n"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("iteration_dir", help="e.g. my-skill-workspace/iteration-1")
    p.add_argument("--skill-name", required=True)
    p.add_argument("--baseline", help="override which configuration is the baseline")
    args = p.parse_args(argv)

    iter_dir = Path(args.iteration_dir).resolve()
    if not iter_dir.is_dir():
        print(f"error: {iter_dir} is not a directory", file=sys.stderr)
        return 2

    m = re.search(r"iteration-(\d+)", iter_dir.name)
    iterasi = int(m.group(1)) if m else 1

    eval_dirs = temukan_eval(iter_dir)
    if not eval_dirs:
        print(f"error: no eval directories inside {iter_dir}", file=sys.stderr)
        return 2

    kumpulan: dict[str, dict[str, Any]] = {}
    per_eval: list[dict[str, Any]] = []
    per_assertion: dict[str, dict[str, list[bool]]] = {}

    for ed in eval_dirs:
        configs = konfigurasi_di(ed)
        if not configs:
            continue
        entri: dict[str, Any] = {"eval_name": ed.name, "configs": {}}
        for cfg in configs:
            run_dir = ed / cfg
            run_id = f"{ed.name}-{cfg}"
            grading = baca_json(run_dir / "grading.json")
            timing = baca_json(run_dir / "timing.json")
            detik, token = waktu_dari(timing)

            slot = kumpulan.setdefault(
                cfg,
                {"runs": [], "pass_rates": [], "times": [], "tokens": [],
                 "graded_runs": 0, "ungraded_runs": 0, "timing_runs": 0},
            )
            slot["runs"].append(run_id)
            if token is not None or detik is not None:
                slot["timing_runs"] += 1
            if detik is not None:
                slot["times"].append(detik)
            if token is not None:
                slot["tokens"].append(token)

            if grading is None:
                slot["ungraded_runs"] += 1
                entri["configs"][cfg] = {"pass_rate": None, "time_seconds": detik, "tokens": token}
            else:
                eksp = ambil_ekspektasi(grading)
                rate = (
                    sum(1 for e in eksp if e["passed"]) / len(eksp) if eksp else 0.0
                )
                slot["graded_runs"] += 1
                slot["pass_rates"].append(rate)
                entri["configs"][cfg] = {"pass_rate": rate, "time_seconds": detik, "tokens": token}
                for e in eksp:
                    per_assertion.setdefault(e["text"], {}).setdefault(cfg, []).append(e["passed"])
        per_eval.append(entri)

    if not kumpulan:
        print(f"error: no runs found under {iter_dir}", file=sys.stderr)
        return 2

    baseline = args.baseline or pilih_baseline(list(kumpulan))
    urutan = ([c for c in kumpulan if c == "with_skill"]
              + [c for c in kumpulan if c != "with_skill" and c != baseline]
              + ([] if baseline is None else [baseline]))

    configs_out = []
    for cfg in urutan:
        s = kumpulan[cfg]
        configs_out.append({
            "configuration": cfg,
            "runs": s["runs"],
            "graded_runs": s["graded_runs"],
            "ungraded_runs": s["ungraded_runs"],
            "timing_runs": s["timing_runs"],
            "pass_rate": stat(s["pass_rates"]),
            "time_seconds": stat(s["times"]),
            "tokens": stat(s["tokens"]),
        })

    deltas = []
    if baseline and baseline in kumpulan:
        b = kumpulan[baseline]
        for cfg in urutan:
            if cfg == baseline:
                continue
            a = kumpulan[cfg]
            deltas.append({
                "configuration": cfg,
                "baseline": baseline,
                "pass_rate_delta": round(
                    stat(a["pass_rates"])["mean"] - stat(b["pass_rates"])["mean"], 4
                ),
                "time_seconds_delta": round(
                    stat(a["times"])["mean"] - stat(b["times"])["mean"], 2
                ),
                "tokens_delta": round(
                    stat(a["tokens"])["mean"] - stat(b["tokens"])["mean"], 1
                ),
            })

    by_cfg = {c["configuration"]: c for c in configs_out}
    observations = bangun_observasi(by_cfg, per_assertion, deltas)

    bench = {
        "skill_name": args.skill_name,
        "iteration": iterasi,
        "generated_at": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "configs": configs_out,
        "deltas": deltas,
        "evals": per_eval,
        "observations": observations,
    }

    (iter_dir / "benchmark.json").write_text(
        json.dumps(bench, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (iter_dir / "benchmark.md").write_text(bangun_markdown(bench), encoding="utf-8")

    print(f"benchmark.json + benchmark.md -> {iter_dir}")
    for c in configs_out:
        pr = c["pass_rate"]
        print(f"  {c['configuration']:<15} {c['graded_runs']}/{len(c['runs'])} dinilai, "
              f"pass rate {pr['mean']:.0%} ± {pr['stddev']:.2f}, "
              f"{c['time_seconds']['mean']:.1f}s, {c['tokens']['mean']:.0f} token")
    for d in deltas:
        print(f"  delta {d['configuration']} vs {d['baseline']}: "
              f"pass {d['pass_rate_delta']:+.2f}, waktu {d['time_seconds_delta']:+.1f}s, "
              f"token {d['tokens_delta']:+.0f}")
    for o in observations:
        print(f"  ! {o}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
