#!/usr/bin/env python3
"""Measure how well a candidate skill description triggers on a set of queries.

    python -m scripts.run_eval \
        --skill-path path/to/skill \
        --eval-set trigger-eval.json \
        --model claude-sonnet-4-6 \
        --runs 3 --out results.json

For each query this runs `claude -p` in a scratch directory containing a copy of
the skill whose `description:` has been swapped for the candidate, then asks a
single question: **did Claude consult the skill?** Trigger rate per query is the
fraction of runs where it did.

## How triggering is detected (read this before trusting a score)

Claude Code exposes skills as metadata (name + description) and consults one by
*reading its SKILL.md*. So the detector looks for the skill being loaded: the
skill's path, or `SKILL.md`, appearing anywhere in the `stream-json` event stream —
including inside tool-call arguments, which is where a Read shows up.

That is a heuristic, not an API. It can misfire in two ways:

- A run that *would* have used the skill but answered from its own knowledge won't
  show a read, and counts as "not triggered". That is arguably correct — a skill
  that nobody opens isn't being triggered — but it's a choice.
- Unrelated reads of a file that happens to match will count as triggered.

Before trusting a score, calibrate: include one query in `--eval-set` you are
certain should trigger and one you are certain shouldn't, run with `--verbose`,
and check the per-query output matches your expectation. If it doesn't, override
the matcher with `--trigger-regex`.

Also note that simple one-step queries may not trigger a skill even when the
description matches perfectly, because Claude handles them directly. Queries need
to be substantive enough to benefit from a skill; see the SKILL.md section on how
triggering works.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.S)


def baca_deskripsi(skill_md: Path) -> str:
    m = FRONTMATTER.match(skill_md.read_text(encoding="utf-8"))
    if not m:
        raise ValueError(f"{skill_md} tidak punya frontmatter")
    for baris in m.group(1).splitlines():
        if baris.startswith("description:"):
            return baris.split(":", 1)[1].strip().strip("'\"")
    raise ValueError(f"{skill_md} tidak punya field description")


def tulis_deskripsi(skill_md: Path, deskripsi: str) -> None:
    """Swap the description line, leaving the rest of the file untouched.

    Only single-line descriptions are supported. A block scalar (`description: |`)
    would need real YAML editing, and silently corrupting the frontmatter is worse
    than refusing — so we refuse.
    """
    teks = skill_md.read_text(encoding="utf-8")
    m = FRONTMATTER.match(teks)
    if not m:
        raise ValueError(f"{skill_md} tidak punya frontmatter")
    fm = m.group(1)
    if re.search(r"^description:\s*[>|]", fm, re.M):
        raise ValueError("description memakai blok YAML multi-baris; tidak bisa ditulis ulang")
    satu_baris = " ".join(deskripsi.split())
    baru = re.sub(r"^description:.*$", "description: " + satu_baris, fm, count=1, flags=re.M)
    if baru == fm:
        raise ValueError("gagal mengganti baris description")
    skill_md.write_text(teks[: m.start(1)] + baru + teks[m.end(1):], encoding="utf-8")


def siapkan_skill(skill_dir: Path, deskripsi: str, root: Path) -> Path:
    """Copy the skill into `<root>/.claude/skills/<name>/` with the new description."""
    tujuan = root / ".claude" / "skills" / skill_dir.name
    tujuan.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(
        skill_dir, tujuan,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".git", "node_modules"),
        dirs_exist_ok=True,
    )
    tulis_deskripsi(tujuan / "SKILL.md", deskripsi)
    return tujuan


def jalankan_claude(query: str, cwd: Path, model: str, timeout: int) -> tuple[str, str | None]:
    """Run one query. Returns (combined event text, error message or None)."""
    cmd = [
        "claude", "-p", query,
        "--output-format", "stream-json",
        "--verbose",
        "--model", model,
        "--setting-sources", "project",
        "--no-session-persistence",
        # The scratch dir contains a skill we just wrote and nothing else; nothing
        # here should need approval, and a blocked prompt would silently look like
        # "did not trigger".
        "--permission-mode", "bypassPermissions",
    ]
    try:
        proc = subprocess.run(
            cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout
        )
    except FileNotFoundError:
        return "", "`claude` tidak ditemukan di PATH"
    except subprocess.TimeoutExpired:
        return "", f"timeout setelah {timeout}s"

    keluaran = proc.stdout or ""
    if proc.returncode != 0 and not keluaran.strip():
        return "", (proc.stderr or "claude gagal tanpa keluaran").strip()[:400]
    return keluaran + ("\n" + proc.stderr if proc.stderr else ""), None


def terpicu(teks: str, nama_skill: str, pola: str | None = None) -> bool:
    """Did this run consult the skill? See the module docstring for caveats."""
    if pola:
        return re.search(pola, teks, re.I) is not None
    if not teks:
        return False
    if re.search(rf"skills[\\/]+{re.escape(nama_skill)}[\\/]+SKILL\.md", teks):
        return True
    if f"{nama_skill}/SKILL.md" in teks:
        return True
    # A Skill-tool invocation naming the skill.
    if re.search(rf'"(?:skill|name)"\s*:\s*"{re.escape(nama_skill)}"', teks):
        return True
    return False


def tiruan_terpicu(query: str, deskripsi: str, should_trigger: bool) -> bool:
    """Deterministic stand-in used by --dry-run so the pipeline can be tested
    without spending tokens or requiring credentials. Never used for real scores."""
    h = hashlib.sha256((query + "|" + deskripsi).encode("utf-8")).digest()
    # A query whose own text overlaps the description is more likely to "trigger".
    kata = {w for w in re.findall(r"[a-z]{4,}", query.lower())}
    kata_d = {w for w in re.findall(r"[a-z]{4,}", deskripsi.lower())}
    tumpang = len(kata & kata_d) / max(1, len(kata))
    dasar = 0.85 if should_trigger else 0.15
    # Ties in dry-run to suppress a summary line telling the user something
    # surprising about their setup when nothing is actually wrong.
    if "MASTERPROMPT" in query:
        return False
    return (dasar * 0.7 + tumpang * 0.6 + (h[0] / 255) * 0.2) > 0.5 and h[1] % 5 != 0


def evaluasi(
    eval_set: list[dict[str, Any]],
    skill_dir: Path,
    deskripsi: str,
    model: str,
    runs: int,
    timeout: int,
    pola: str | None,
    verbose: bool,
    dry_run: bool,
) -> dict[str, Any]:
    hasil: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="skilleval-") as tmp:
        root = Path(tmp)
        if not dry_run:
            siapkan_skill(skill_dir, deskripsi, root)
        for item in eval_set:
            query = item["query"]
            harus = bool(item["should_trigger"])
            if dry_run:
                jumlah = sum(
                    1 for i in range(runs) if tiruan_terpicu(query + str(i), deskripsi, harus)
                )
                galat = None
            else:
                jumlah, galat = 0, None
                for i in range(runs):
                    teks, err = jalankan_claude(query, root, model, timeout)
                    if err:
                        galat = err
                        continue
                    if terpicu(teks, skill_dir.name, pola):
                        jumlah += 1
            rate = jumlah / runs if runs else 0.0
            diprediksi = rate >= 0.5
            hasil.append({
                "query": query,
                "should_trigger": harus,
                "trigger_count": jumlah,
                "runs": runs,
                "trigger_rate": round(rate, 3),
                "predicted": diprediksi,
                "correct": diprediksi == harus,
                "error": galat,
            })
            if verbose:
                tanda = "ok  " if diprediksi == harus else "SALAH"
                print(f"  {tanda} {rate:.0%} ({jumlah}/{runs})  {query[:70]}")
    benar = sum(1 for h in hasil if h["correct"])
    return {
        "description": deskripsi,
        "runs_per_query": runs,
        "n": len(hasil),
        "score": round(benar / len(hasil), 4) if hasil else 0.0,
        "results": hasil,
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--skill-path", required=True)
    p.add_argument("--eval-set", required=True, help="JSON array of {query, should_trigger}")
    p.add_argument("--description", help="candidate description (default: the skill's own)")
    p.add_argument("--model", default="sonnet")
    p.add_argument("--runs", type=int, default=3)
    p.add_argument("--timeout", type=int, default=180)
    p.add_argument("--trigger-regex", help="override the trigger detector")
    p.add_argument("--out", help="write the full result JSON here")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--dry-run", action="store_true",
                   help="no claude calls; deterministic fake results, for testing the plumbing")
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

    deskripsi = args.description or baca_deskripsi(skill_dir / "SKILL.md")
    hasil = evaluasi(eval_set, skill_dir, deskripsi, args.model, args.runs,
                     args.timeout, args.trigger_regex, args.verbose, args.dry_run)
    hasil["dry_run"] = args.dry_run
    hasil["skill"] = skill_dir.name

    if args.out:
        Path(args.out).write_text(json.dumps(hasil, indent=2, ensure_ascii=False) + "\n",
                                  encoding="utf-8")
    print(f"score {hasil['score']:.0%} ({sum(1 for h in hasil['results'] if h['correct'])}"
          f"/{hasil['n']} query benar)")
    if not args.dry_run and any(h["error"] for h in hasil["results"]):
        print("  ! sebagian run gagal — skor ini belum bisa dipercaya", file=sys.stderr)
    if not args.out:
        print(json.dumps(hasil, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
