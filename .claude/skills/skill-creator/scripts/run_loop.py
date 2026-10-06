#!/usr/bin/env python3
"""Optimize a skill's `description:` field against a trigger eval set.

    python -m scripts.run_loop \\
        --eval-set trigger-eval.json \\
        --skill-path path/to/skill \\
        --model claude-sonnet-4-6 \\
        --max-iterations 5 --verbose

The loop:

1. splits the eval set 60/40 into **train** and **held-out test**, stratified so
   both sides keep their proportion of should-trigger / should-not-trigger queries;
2. scores the skill's current description on both sides (each query run 3x, so a
   single flaky run cannot decide a query);
3. shows Claude the train failures and asks for a few improved descriptions;
4. re-scores every proposal on **train and test**;
5. carries the best-by-train description into the next iteration, repeating up to
   `--max-iterations`;
6. returns JSON whose `best_description` is the highest **test** scorer seen, not
   the highest train scorer — a description tuned until it memorises train is
   exactly the failure mode this split exists to catch.

Writes an HTML report of every iteration and opens it, unless `--no-open`.

## Honesty rules baked in

- A query whose runs error out is *not* counted as a correct prediction, and the
  script shouts at the end if any run failed. A score from a broken run is noise.
- `--dry-run` never calls Claude. It substitutes deterministic fake trigger
  outcomes so the plumbing (split, loop, report, JSON) can be exercised on a
  machine with no credentials. Those numbers mean nothing as a description score.
- Every reported score carries its split size. "100%" off two queries is not a
  result, and the report says so.

The trigger detector itself is `run_eval.terpicu` — read its docstring: it is a
heuristic over the `claude -p` event stream and needs calibration per project.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import random
import re
import subprocess
import sys
import tempfile
import webbrowser
from pathlib import Path
from typing import Any

try:
    from .run_eval import baca_deskripsi, evaluasi
except ImportError:  # dijalankan langsung, bukan lewat `python -m scripts.run_loop`
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from scripts.run_eval import baca_deskripsi, evaluasi  # type: ignore

DEFAULT_PROPOSALS = 3


# --------------------------------------------------------------------------- #
# Pembagian eval set
# --------------------------------------------------------------------------- #

def bagi_train_test(
    eval_set: list[dict[str, Any]], rasio: float = 0.6, seed: int = 0
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Stratified 60/40 split. Deterministic for a given `seed`.

    Stratified by `should_trigger` so a split cannot accidentally hand all the
    near-miss negatives to one side — that would make the test score swing on
    composition rather than on description quality.
    """
    rng = random.Random(seed)
    positif = [q for q in eval_set if q.get("should_trigger")]
    negatif = [q for q in eval_set if not q.get("should_trigger")]
    train: list[dict[str, Any]] = []
    test: list[dict[str, Any]] = []
    for kelompok in (positif, negatif):
        campur = list(kelompok)
        rng.shuffle(campur)
        n_train = round(len(campur) * rasio)
        if len(campur) > 1:
            # Sisakan minimal satu query di tiap sisi kalau memungkinkan.
            n_train = max(1, min(len(campur) - 1, n_train))
        train.extend(campur[:n_train])
        test.extend(campur[n_train:])
    rng.shuffle(train)
    rng.shuffle(test)
    return train, test


# --------------------------------------------------------------------------- #
# Meminta usulan deskripsi ke Claude
# --------------------------------------------------------------------------- #

PROMPT_USULAN = """You are tuning the `description:` field in a Claude Code skill's YAML frontmatter. That description is the ONLY thing Claude sees when deciding whether to open this skill.

Skill name: {nama}

Current description:
\"\"\"
{deskripsi}
\"\"\"

Trigger test results on {n} queries ({runs} runs each). Triggering is measured as "did Claude actually read this skill's SKILL.md".

FAILING rows (these are what to fix):
{kegagalan}

Passing rows: {n_lulus} queries, left out here to keep this prompt short.

Write {jumlah} alternative descriptions that:
1. fix the failing rows above;
2. keep the passing rows passing;
3. stay 1-3 sentences, plain English, no first person;
4. state what the skill does AND when to use it, including the signals that distinguish it from similar skills or from just doing the task directly;
5. pay special attention to rows marked "must NOT trigger" — a description that is merely keyword-rich will pull those in.

Reply with ONLY this JSON, no prose and no markdown fences:
{{"descriptions": ["first alternative", "second alternative"]}}
"""


def _kegagalan_untuk_prompt(hasil: dict[str, Any], maks: int = 14) -> str:
    baris = []
    for r in hasil.get("results", []):
        if r["correct"]:
            continue
        harus = "must TRIGGER" if r["should_trigger"] else "must NOT trigger"
        baris.append(
            f'- [{harus}, got {r["trigger_count"]}/{r["runs"]}] {r["query"]}'
        )
    if not baris:
        baris.append("(none — every row passed; propose alternatives that stay close but read more cleanly)")
    if len(baris) > maks:
        baris = baris[:maks] + [f"- ...and {len(baris) - maks} more failing rows"]
    return "\n".join(baris)


def panggil_claude_teks(prompt: str, model: str, timeout: int, cwd: Path) -> tuple[str, str | None]:
    """One plain text-generation call. Returns (text, error or None)."""
    cmd = [
        "claude", "-p", prompt,
        "--output-format", "json",
        "--model", model,
        "--setting-sources", "project",
        "--no-session-persistence",
        "--permission-mode", "bypassPermissions",
    ]
    try:
        proc = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        return "", "`claude` tidak ditemukan di PATH"
    except subprocess.TimeoutExpired:
        return "", f"timeout setelah {timeout}s"
    if proc.returncode != 0 and not (proc.stdout or "").strip():
        return "", (proc.stderr or "claude gagal tanpa keluaran").strip()[:400]

    mentah = (proc.stdout or "").strip()
    # `--output-format json` membungkus jawaban: {"result": "..."}
    if mentah.startswith("{"):
        try:
            terbungkus = json.loads(mentah)
            if isinstance(terbungkus, dict) and isinstance(terbungkus.get("result"), str):
                return terbungkus["result"], None
        except json.JSONDecodeError:
            pass
    return mentah, None


def _ekstrak_array_json(teks: str) -> list[str] | None:
    """Pull the first JSON array out of a reply, tolerating fences and prose."""
    teks = re.sub(r"```(?:json)?", "", teks)
    mulai = teks.find("[")
    while mulai != -1:
        kedalaman = 0
        for i in range(mulai, len(teks)):
            if teks[i] == "[":
                kedalaman += 1
            elif teks[i] == "]":
                kedalaman -= 1
                if kedalaman == 0:
                    try:
                        isi = json.loads(teks[mulai : i + 1])
                    except json.JSONDecodeError:
                        break
                    if isinstance(isi, list) and all(isinstance(x, str) for x in isi):
                        return isi
                    break
        mulai = teks.find("[", mulai + 1)
    return None


def ekstrak_deskripsi(teks: str) -> tuple[list[str], str | None]:
    """Accept `{"descriptions": [...]}` or a bare array; reject anything else."""
    for kandidat in (teks, teks[teks.find("{") :] if "{" in teks else ""):
        if not kandidat:
            continue
        awal, akhir = kandidat.find("{"), kandidat.rfind("}")
        if awal != -1 and akhir > awal:
            try:
                obj = json.loads(kandidat[awal : akhir + 1])
            except json.JSONDecodeError:
                obj = None
            if isinstance(obj, dict) and isinstance(obj.get("descriptions"), list):
                bersih = [x.strip() for x in obj["descriptions"] if isinstance(x, str) and x.strip()]
                if bersih:
                    return bersih, None
    arr = _ekstrak_array_json(teks)
    if arr:
        return [x.strip() for x in arr if x.strip()], None
    return [], "jawaban model bukan JSON yang bisa dibaca"


def usulan_tiruan(deskripsi: str, iterasi: int, jumlah: int) -> list[str]:
    """Deterministic fake proposals for --dry-run. Exercises the loop; scores nothing."""
    out = []
    for i in range(jumlah):
        h = hashlib.sha256(f"{iterasi}|{i}|{deskripsi}".encode("utf-8")).hexdigest()
        ekor = " ".join(f"v{h[j : j + 3]}" for j in range(0, 9, 3))
        out.append(f"{deskripsi} (dry-run variant {i + 1} {ekor})")
    return out


def usulkan(
    deskripsi: str,
    hasil_train: dict[str, Any],
    nama_skill: str,
    model: str,
    runs: int,
    jumlah: int,
    timeout: int,
    iterasi: int,
    dry_run: bool,
    verbose: bool,
) -> tuple[list[str], str | None]:
    if dry_run:
        return usulan_tiruan(deskripsi, iterasi, jumlah), None
    prompt = PROMPT_USULAN.format(
        nama=nama_skill,
        deskripsi=deskripsi,
        n=hasil_train.get("n", 0),
        runs=runs,
        kegagalan=_kegagalan_untuk_prompt(hasil_train),
        n_lulus=sum(1 for r in hasil_train.get("results", []) if r["correct"]),
        jumlah=jumlah,
    )
    with tempfile.TemporaryDirectory(prefix="skillloop-") as tmp:
        teks, galat = panggil_claude_teks(prompt, model, timeout, Path(tmp))
    if galat:
        return [], galat
    if verbose:
        print(f"    usulan mentah: {len(teks)} karakter")
    return ekstrak_deskripsi(teks)


# --------------------------------------------------------------------------- #
# Laporan HTML
# --------------------------------------------------------------------------- #

GAYA = """
:root{--bg:#faf7f2;--fg:#2a2520;--mut:#7a7168;--line:#e2dbd0;--ok:#3f6b4a;--bad:#8f3b2f;--acc:#8a6a3b;--card:#fffdf9}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 ui-serif,Georgia,serif}
main{max-width:900px;margin:0 auto;padding:40px 20px 80px}
h1{font-size:27px;margin:0 0 4px}
h2{font-size:19px;margin:34px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}
.sub{color:var(--mut);margin:0 0 22px}
.best{background:#f3efe4;border-left:4px solid var(--acc);padding:14px 16px;border-radius:0 8px 8px 0;margin:0 0 26px}
.best p{margin:4px 0}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:0 0 14px}
.card.hl{border-color:var(--acc);box-shadow:0 0 0 2px #8a6a3b22}
.row{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
.tag{font:12px ui-monospace,monospace;background:#efe9dd;border-radius:999px;padding:2px 9px;color:var(--mut)}
.sc{font-family:ui-monospace,monospace;font-size:14px}
.ok{color:var(--ok)}.bad{color:var(--bad)}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
td.q{font-family:ui-monospace,monospace;font-size:12px;max-width:430px}
details{margin-top:8px}summary{cursor:pointer;color:var(--mut);font-size:13px}
.bar{display:inline-block;height:8px;background:var(--line);border-radius:4px;width:80px;vertical-align:middle;overflow:hidden}
.bar i{display:block;height:100%}
.note{color:var(--mut);font-size:13px;margin-top:8px}
"""


def _bar(rate: float, harus: bool) -> str:
    warna = "#3f6b4a" if harus else "#8f3b2f"
    return f'<span class="bar"><i style="width:{rate * 100:.0f}%;background:{warna}"></i></span>'


def _tabel(hasil: dict[str, Any]) -> str:
    if not hasil or not hasil.get("results"):
        return '<p class="note">Tidak ada hasil.</p>'
    baris = []
    for r in hasil["results"]:
        kelas = "ok" if r["correct"] else "bad"
        tanda = "harus" if r["should_trigger"] else "tidak"
        baris.append(
            f'<tr><td class="q">{html.escape(r["query"])}</td>'
            f'<td>{tanda}</td>'
            f'<td>{_bar(r["trigger_rate"], r["should_trigger"])} '
            f'{r["trigger_count"]}/{r["runs"]}</td>'
            f'<td class="{kelas}">{"lulus" if r["correct"] else "gagal"}</td></tr>'
        )
    return (
        '<table><thead><tr><th>query</th><th>harus</th><th>tingkat picu</th>'
        "<th></th></tr></thead><tbody>" + "".join(baris) + "</tbody></table>"
    )


def tulis_laporan(
    path: Path,
    nama_skill: str,
    riwayat: list[dict[str, Any]],
    terbaik: dict[str, Any],
    split: dict[str, Any],
    model: str,
    runs: int,
    dry_run: bool,
    catatan: list[str],
) -> None:
    kartu = []
    for rec in riwayat:
        kls = " hl" if rec is terbaik else ""
        asal = "deskripsi awal" if rec["iterasi"] == 0 else f"usulan iterasi {rec['iterasi']}"
        kartu.append(
            f'<div class="card{kls}"><div class="row">'
            f'<span class="tag">#{rec["iterasi"]}</span>'
            f'<span class="tag">{html.escape(asal)}</span>'
            f'<span class="sc">train <b>{rec["train_score"]:.0%}</b> '
            f'<span class="tag">n={rec["n_train"]}</span></span>'
            f'<span class="sc">test <b>{rec["test_score"]:.0%}</b> '
            f'<span class="tag">n={rec["n_test"]}</span></span>'
            + ('<span class="tag">TERPILIH</span>' if rec is terbaik else "")
            + "</div><details><summary>description</summary>"
            f'<p class="mono">{html.escape(rec["description"])}</p></details>'
            f'<details><summary>hasil per query (train)</summary>{_tabel(rec["train"])}</details>'
            f'<details><summary>hasil per query (test)</summary>{_tabel(rec["test"])}</details>'
            "</div>"
        )
    gagal = [c for c in catatan if c]
    blok_catatan = (
        "<h2>Catatan</h2><ul>" + "".join(f"<li>{html.escape(c)}</li>" for c in gagal) + "</ul>"
        if gagal
        else ""
    )
    peringatan = (
        '<p class="note bad">Mode dry-run: angka di halaman ini berasal dari tiruan '
        "deterministik, bukan dari menjalankan Claude. Jangan dipakai untuk memilih "
        "deskripsi.</p>"
        if dry_run
        else ""
    )
    dokumen = f"""<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Optimasi deskripsi — {html.escape(nama_skill)}</title>
<style>{GAYA}</style></head><body><main>
<h1>Optimasi deskripsi: {html.escape(nama_skill)}</h1>
<p class="sub">model {html.escape(model)} · {runs} run per query ·
train {split['n_train']} query · test {split['n_test']} query · seed {split['seed']}</p>
{peringatan}
<div class="best">
<p><b>Deskripsi terpilih</b> (skor test tertinggi, iterasi #{terbaik['iterasi']})</p>
<p class="mono">{html.escape(terbaik['description'])}</p>
<p class="sc">train {terbaik['train_score']:.0%} · test {terbaik['test_score']:.0%}</p>
</div>
<h2>Riwayat</h2>
{''.join(kartu)}
{blok_catatan}
<p class="note">Skor = porsi query yang prediksinya benar (terpicu jika trigger rate
&ge; 50%). Deskripsi dipilih memakai skor <b>test</b>; skor train hanya dipakai
untuk memilih kandidat yang dibawa ke iterasi berikutnya.</p>
</main></body></html>
"""
    path.write_text(dokumen, encoding="utf-8")


# --------------------------------------------------------------------------- #
# Loop utama
# --------------------------------------------------------------------------- #

def jalankan_loop(
    eval_set: list[dict[str, Any]],
    skill_dir: Path,
    deskripsi_awal: str,
    model: str,
    runs: int,
    timeout: int,
    max_iterasi: int,
    jumlah_usulan: int,
    rasio_train: float,
    seed: int,
    pola: str | None,
    verbose: bool,
    dry_run: bool,
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any], list[str]]:
    train, test = bagi_train_test(eval_set, rasio_train, seed)
    catatan: list[str] = []
    if not test:
        catatan.append(
            "Eval set terlalu kecil untuk dipecah: sisi test kosong, jadi skor test "
            "tidak bisa membedakan kandidat. Pakai minimal ~8 query."
        )
    if not train:
        catatan.append("Sisi train kosong — tidak ada yang bisa dijadikan sinyal perbaikan.")

    def nilai(desc: str, label: str) -> tuple[dict[str, Any], dict[str, Any]]:
        if verbose:
            print(f"  [{label}] train…")
        h_train = evaluasi(train, skill_dir, desc, model, runs, timeout, pola, verbose, dry_run)
        if verbose:
            print(f"  [{label}] test…")
        h_test = evaluasi(test, skill_dir, desc, model, runs, timeout, pola, verbose, dry_run)
        return h_train, h_test

    def rekam(iterasi: int, desc: str) -> dict[str, Any]:
        h_train, h_test = nilai(desc, f"iterasi {iterasi}")
        for h in (h_train, h_test):
            for r in h["results"]:
                if r.get("error"):
                    catatan.append(f"iterasi {iterasi}: run gagal — {r['error']}")
        return {
            "iterasi": iterasi,
            "description": desc,
            "train_score": h_train["score"],
            "test_score": h_test["score"],
            "n_train": h_train["n"],
            "n_test": h_test["n"],
            "train": h_train,
            "test": h_test,
        }

    riwayat: list[dict[str, Any]] = []
    saat_ini = rekam(0, deskripsi_awal)
    riwayat.append(saat_ini)
    if verbose:
        print(f"  awal: train {saat_ini['train_score']:.0%} · test {saat_ini['test_score']:.0%}")

    for i in range(1, max_iterasi + 1):
        if verbose:
            print(f"iterasi {i}/{max_iterasi}: meminta usulan…")
        usulan, galat = usulkan(
            saat_ini["description"], saat_ini["train"], skill_dir.name, model, runs,
            jumlah_usulan, timeout, i, dry_run, verbose,
        )
        if galat:
            catatan.append(f"iterasi {i}: gagal mendapat usulan ({galat}); loop dihentikan.")
            break
        if not usulan:
            catatan.append(f"iterasi {i}: model tidak mengembalikan deskripsi yang bisa dipakai; loop dihentikan.")
            break
        # Buang duplikat deskripsi yang sudah pernah dinilai.
        sudah = {r["description"] for r in riwayat}
        usulan = [u for u in usulan if u not in sudah]
        if not usulan:
            catatan.append(f"iterasi {i}: semua usulan duplikat; loop dihentikan.")
            break

        kandidat = [rekam(i, u) for u in usulan]
        riwayat.extend(kandidat)
        kandidat.sort(key=lambda r: (r["train_score"], r["test_score"]), reverse=True)
        pemenang = kandidat[0]
        if verbose:
            print(f"  iterasi {i}: terbaik train {pemenang['train_score']:.0%} "
                  f"(test {pemenang['test_score']:.0%}) dari {len(kandidat)} kandidat")
        saat_ini = pemenang
        if saat_ini["train_score"] >= 1.0 and saat_ini["test_score"] >= 1.0:
            catatan.append(f"iterasi {i}: train dan test sudah sempurna; loop dihentikan lebih awal.")
            break

    terbaik = max(riwayat, key=lambda r: (r["test_score"], r["train_score"], -r["iterasi"]))
    split = {
        "seed": seed,
        "rasio_train": rasio_train,
        "n_train": len(train),
        "n_test": len(test),
        "train_queries": [q["query"] for q in train],
        "test_queries": [q["query"] for q in test],
    }
    return riwayat, terbaik, split, catatan


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--eval-set", required=True, help="JSON array of {query, should_trigger}")
    p.add_argument("--skill-path", required=True)
    p.add_argument("--model", default="sonnet")
    p.add_argument("--max-iterations", type=int, default=5)
    p.add_argument("--proposals", type=int, default=DEFAULT_PROPOSALS,
                   help=f"kandidat baru per iterasi (default {DEFAULT_PROPOSALS})")
    p.add_argument("--runs", type=int, default=3, help="run per query (default 3)")
    p.add_argument("--timeout", type=int, default=180, help="timeout per panggilan claude")
    p.add_argument("--train-ratio", type=float, default=0.6)
    p.add_argument("--seed", type=int, default=0, help="seed pembagian train/test")
    p.add_argument("--trigger-regex", help="override pendeteksi picu")
    p.add_argument("--out", help="tulis JSON hasil ke path ini")
    p.add_argument("--report", help="tulis laporan HTML ke path ini")
    p.add_argument("--no-open", action="store_true", help="jangan buka laporan di browser")
    p.add_argument("--dry-run", action="store_true",
                   help="tanpa panggilan claude; hasil tiruan deterministik untuk menguji alur")
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args(argv)

    skill_dir = Path(args.skill_path).resolve()
    if not (skill_dir / "SKILL.md").is_file():
        print(f"error: {skill_dir}/SKILL.md tidak ada", file=sys.stderr)
        return 2
    try:
        eval_set = json.loads(Path(args.eval_set).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"error: tidak bisa membaca eval set: {exc}", file=sys.stderr)
        return 2
    if not isinstance(eval_set, list) or not eval_set:
        print("error: eval set harus array JSON yang tidak kosong", file=sys.stderr)
        return 2
    for item in eval_set:
        if not isinstance(item, dict) or "query" not in item or "should_trigger" not in item:
            print("error: tiap entri perlu {query, should_trigger}", file=sys.stderr)
            return 2
    if not 0.0 < args.train_ratio < 1.0:
        print("error: --train-ratio harus antara 0 dan 1", file=sys.stderr)
        return 2

    try:
        deskripsi_awal = baca_deskripsi(skill_dir / "SKILL.md")
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(f"mengoptimalkan '{skill_dir.name}' · {len(eval_set)} query · "
          f"model {args.model} · maks {args.max_iterations} iterasi"
          + (" · DRY-RUN" if args.dry_run else ""))
    riwayat, terbaik, split, catatan = jalankan_loop(
        eval_set, skill_dir, deskripsi_awal, args.model, args.runs, args.timeout,
        args.max_iterations, args.proposals, args.train_ratio, args.seed,
        args.trigger_regex, args.verbose, args.dry_run,
    )

    hasil: dict[str, Any] = {
        "skill": skill_dir.name,
        "model": args.model,
        "dry_run": args.dry_run,
        "runs_per_query": args.runs,
        "split": split,
        "initial_description": deskripsi_awal,
        "initial_train_score": riwayat[0]["train_score"],
        "initial_test_score": riwayat[0]["test_score"],
        "best_description": terbaik["description"],
        "best_iteration": terbaik["iterasi"],
        "best_train_score": terbaik["train_score"],
        "best_test_score": terbaik["test_score"],
        # "Improved" means the shipped description would actually score better, not
        # merely that some proposal beat its siblings.
        "improved": terbaik["test_score"] > riwayat[0]["test_score"],
        "iterations": [
            {
                "iteration": r["iterasi"],
                "description": r["description"],
                "train_score": r["train_score"],
                "test_score": r["test_score"],
                "n_train": r["n_train"],
                "n_test": r["n_test"],
                "train_results": r["train"]["results"],
                "test_results": r["test"]["results"],
            }
            for r in riwayat
        ],
        "notes": catatan,
    }

    laporan = Path(args.report) if args.report else (
        Path(tempfile.gettempdir()) / f"run_loop_report_{skill_dir.name}.html"
    )
    tulis_laporan(laporan, skill_dir.name, riwayat, terbaik, split, args.model,
                  args.runs, args.dry_run, catatan)

    if args.out:
        Path(args.out).write_text(json.dumps(hasil, indent=2, ensure_ascii=False) + "\n",
                                  encoding="utf-8")

    print(f"terbaik: iterasi #{terbaik['iterasi']} · "
          f"test {terbaik['test_score']:.0%} (dari awal {riwayat[0]['test_score']:.0%}) · "
          f"train {terbaik['train_score']:.0%}")
    if terbaik["iterasi"] == 0:
        print("  deskripsi awal belum terkalahkan — tidak ada perubahan yang disarankan")
    print(f"laporan: {laporan}")
    for c in catatan:
        print(f"  catatan: {c}", file=sys.stderr)
    if not args.dry_run and any(
        r.get("error") for rec in riwayat for r in rec["train"]["results"] + rec["test"]["results"]
    ):
        print("  ! ada run yang gagal — skor di atas belum bisa dipercaya", file=sys.stderr)
    if args.dry_run:
        print("  (dry-run: angka tiruan, bukan hasil mengukur deskripsi)")

    if not args.no_open and not args.dry_run:
        try:
            webbrowser.open(laporan.as_uri())
        except Exception:  # pragma: no cover - browser tidak selalu tersedia
            pass

    if not args.out:
        print(json.dumps(hasil, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
