#!/usr/bin/env python3
"""Build the human review page for one iteration's eval results.

    # serve it (normal use — opens a browser)
    python eval-viewer/generate_review.py <workspace>/iteration-1 \\
        --skill-name my-skill --benchmark <workspace>/iteration-1/benchmark.json

    # headless / no display — write a standalone file instead
    python eval-viewer/generate_review.py <workspace>/iteration-1 \\
        --static /tmp/review.html

Two tabs:

- **Outputs** — one test case at a time: the prompt, the artifacts the skill
  produced, the previous iteration's artifacts for comparison, the formal grades,
  and a feedback box. Arrow keys or the prev/next buttons move between cases.
- **Benchmark** — the quantitative table from `benchmark.json`, with per-eval
  breakdown and the observations.

Get this page in front of the human *before* revising the skill. Their read on the
outputs is the signal the whole loop depends on, and it is much cheaper to look at
real artifacts than to argue from a pass rate.

The page is a single self-contained HTML file: no CDN, no fonts to fetch, works
offline. Files are inlined as text or base64, with per-file and total size caps so
a run full of large binaries can't produce an unusable page — anything over the cap
is still listed, just not rendered.

`--static` writes the file and tells the user where it is. Server mode serves the
same page and accepts feedback via POST, writing `feedback.json` into the
iteration directory. In both modes "Submit All Reviews" also falls back to a
browser download of `feedback.json`, so the page still works when opened directly
from disk (file:// blocks the POST).
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

CONFIGS = ("with_skill", "without_skill", "old_skill")
BASELINE_PREFERENCE = ("without_skill", "old_skill")
NON_EVAL_DIRS = {"skill-snapshot", "__pycache__"}
TEMPLATE = Path(__file__).with_name("template.html")

# Inlining caps. Beyond these the file is listed with its size instead of being
# embedded — a review page that takes a minute to parse is a review page nobody
# uses.
MAX_TEXT_CHARS = 200_000
MAX_IMAGE_BYTES = 2_000_000
MAX_TOTAL_INLINE_BYTES = 25_000_000

TEKS_EXT = {".txt", ".md", ".csv", ".tsv", ".json", ".yaml", ".yml", ".log",
            ".py", ".ts", ".tsx", ".js", ".jsx", ".sh", ".sql", ".xml", ".toml", ".ini", ".cfg"}
GAMBAR_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"}


def baca_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def ekspektasi(grading: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Canonical `text`/`passed`/`evidence`, tolerating older key names."""
    if not grading:
        return []
    raw = grading.get("expectations") or grading.get("assertions") or grading.get("results") or []
    keluar = []
    for it in raw:
        if not isinstance(it, dict):
            continue
        keluar.append({
            "text": it.get("text") or it.get("name") or it.get("assertion") or "(tanpa teks)",
            "passed": bool(it.get("passed", it.get("met", False))),
            "evidence": it.get("evidence") or it.get("details") or "",
        })
    return keluar


def kumpulkan_output(run_dir: Path, anggaran: list[int]) -> list[dict[str, Any]]:
    """Everything under `outputs/`, inlined where it's sensible to do so."""
    out_dir = run_dir / "outputs"
    if not out_dir.is_dir():
        return []

    hasil: list[dict[str, Any]] = []
    for f in sorted(p for p in out_dir.rglob("*") if p.is_file()):
        if "__pycache__" in f.parts or f.name in {".DS_Store", "Thumbs.db"}:
            continue
        rel = str(f.relative_to(out_dir))
        try:
            ukuran = f.stat().st_size
        except OSError:
            continue
        ext = f.suffix.lower()
        item: dict[str, Any] = {"name": rel, "size": ukuran, "kind": "binary"}

        sisa = anggaran[0]
        if ext in GAMBAR_EXT and ukuran <= MAX_IMAGE_BYTES and ukuran <= sisa:
            try:
                data = base64.b64encode(f.read_bytes()).decode("ascii")
            except OSError:
                data = None
            if data is not None:
                mime = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
                item.update(kind="image", data_uri=f"data:{mime};base64,{data}")
                anggaran[0] -= ukuran
        elif ext in TEKS_EXT or ext == ".html":
            boleh = min(MAX_TEXT_CHARS, max(0, sisa))
            if boleh > 0:
                try:
                    teks = f.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    teks = None
                if teks is not None:
                    dipotong = len(teks) > boleh
                    isi = teks[:boleh]
                    item.update(
                        kind="html" if ext == ".html" else "text",
                        content=isi,
                        truncated=dipotong,
                    )
                    anggaran[0] -= len(isi.encode("utf-8", errors="replace"))

        if item["kind"] == "binary" and ukuran > 0:
            item["note"] = "tidak dirender (biner atau terlalu besar)"
        hasil.append(item)
    return hasil


def muat_run(eval_dir: Path, cfg: str, anggaran: list[int]) -> dict[str, Any] | None:
    run_dir = eval_dir / cfg
    if not run_dir.is_dir():
        return None
    grading = baca_json(run_dir / "grading.json")
    g = ekspektasi(grading)
    return {
        "run_id": f"{eval_dir.name}-{cfg}",
        "outputs": kumpulkan_output(run_dir, anggaran),
        "grades": g,
        "graded": grading is not None,
        "pass_rate": (sum(1 for e in g if e["passed"]) / len(g)) if g else None,
        "timing": baca_json(run_dir / "timing.json"),
    }


def muat_feedback(iter_dir: Path) -> dict[str, str]:
    raw = baca_json(iter_dir / "feedback.json") or {}
    return {
        r.get("run_id", ""): r.get("feedback", "")
        for r in raw.get("reviews", [])
        if isinstance(r, dict)
    }


def bangun_payload(iter_dir: Path, prev_dir: Path | None, benchmark_path: Path | None) -> dict[str, Any]:
    anggaran = [MAX_TOTAL_INLINE_BYTES]
    evals: list[dict[str, Any]] = []
    configs: list[str] = []

    for ed in sorted(p for p in iter_dir.iterdir() if p.is_dir()):
        if ed.name in NON_EVAL_DIRS:
            continue
        meta = baca_json(ed / "eval_metadata.json") or {}
        nama_cfg = [c for c in CONFIGS if (ed / c).is_dir()]
        if not nama_cfg:
            nama_cfg = [
                a.name for a in sorted(ed.iterdir())
                if a.is_dir() and ((a / "grading.json").is_file() or (a / "outputs").is_dir())
            ]
        if not nama_cfg:
            continue

        runs: dict[str, Any] = {}
        for cfg in nama_cfg:
            r = muat_run(ed, cfg, anggaran)
            if r:
                runs[cfg] = r
                if cfg not in configs:
                    configs.append(cfg)

        prev = None
        if prev_dir and (prev_dir / ed.name).is_dir():
            prev = {}
            for cfg in nama_cfg:
                r = muat_run(prev_dir / ed.name, cfg, anggaran)
                if r:
                    prev[cfg] = r

        evals.append({
            "eval_name": ed.name,
            "prompt": meta.get("prompt", ""),
            "expected_output": meta.get("expected_output", ""),
            "assertions": meta.get("assertions", []),
            "runs": runs,
            "previous": prev,
        })

    # with_skill first, then the rest, then the baseline — matching the benchmark.
    urut = [c for c in configs if c == "with_skill"]
    urut += [c for c in configs if c != "with_skill" and c not in BASELINE_PREFERENCE]
    urut += [c for c in BASELINE_PREFERENCE if c in configs]

    return {
        "skill_name": iter_dir.parent.name.removesuffix("-workspace"),
        "iteration": iter_dir.name,
        "configs": urut,
        "evals": evals,
        "benchmark": baca_json(benchmark_path) if benchmark_path else baca_json(iter_dir / "benchmark.json"),
        "previous_benchmark": baca_json(prev_dir / "benchmark.json") if prev_dir else None,
        "feedback": muat_feedback(iter_dir),
        "previous_feedback": muat_feedback(prev_dir) if prev_dir else {},
    }


def render(payload: dict[str, Any]) -> str:
    if not TEMPLATE.is_file():
        raise FileNotFoundError(f"template tidak ditemukan: {TEMPLATE}")
    teks = TEMPLATE.read_text(encoding="utf-8")
    data = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    return teks.replace("__DATA_PLACEHOLDER__", data)


def tulis_feedback(iter_dir: Path, body: bytes) -> dict[str, Any]:
    """Persist a posted review set. Keeps the exact schema in references/schemas.md."""
    data = json.loads(body.decode("utf-8"))
    reviews = data.get("reviews", [])
    bersih = [
        {
            "run_id": str(r.get("run_id", "")),
            "feedback": str(r.get("feedback", "")),
            "timestamp": str(r.get("timestamp", "")),
        }
        for r in reviews
        if isinstance(r, dict)
    ]
    keluar = {"reviews": bersih, "status": "complete"}
    (iter_dir / "feedback.json").write_text(
        json.dumps(keluar, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return keluar


def jalankan_server(html: str, iter_dir: Path, port: int) -> None:
    halaman = html.encode("utf-8")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args: Any) -> None:  # quieter default logging
            if os.environ.get("SKILL_CREATOR_VIEWER_DEBUG"):
                super().log_message(*args)

        def do_GET(self) -> None:  # noqa: N802 (http.server API)
            if self.path in ("/", "/index.html"):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(halaman)))
                self.end_headers()
                self.wfile.write(halaman)
            else:
                self.send_error(404)

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/save":
                self.send_error(404)
                return
            try:
                panjang = int(self.headers.get("Content-Length", "0"))
                hasil = tulis_feedback(iter_dir, self.rfile.read(panjang))
            except Exception as exc:  # surfaced to the page so the user sees why
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(exc)}).encode())
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "saved": str(iter_dir / "feedback.json"),
                                          "reviews": len(hasil["reviews"])}).encode())

    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{srv.server_address[1]}/"
    print(f"Reviewer jalan di {url}")
    print("Tekan Ctrl+C untuk berhenti. Feedback tersimpan ke "
          f"{iter_dir / 'feedback.json'}")
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        webbrowser.open(url)
    except Exception:
        print("(tidak bisa membuka peramban otomatis — buka URL di atas manual)")
    try:
        while True:
            threading.Event().wait(3600)
    except KeyboardInterrupt:
        print("\nBerhenti.")
    finally:
        srv.shutdown()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("iteration_dir")
    p.add_argument("--skill-name", help="ditampilkan di halaman (opsional)")
    p.add_argument("--benchmark", help="path benchmark.json (default: di dalam iteration dir)")
    p.add_argument("--previous-workspace", help="iteration sebelumnya, untuk perbandingan")
    p.add_argument("--static", help="tulis HTML mandiri ke path ini, jangan jalankan server")
    p.add_argument("--port", type=int, default=0, help="port server (0 = pilih otomatis)")
    args = p.parse_args(argv)

    iter_dir = Path(args.iteration_dir).resolve()
    if not iter_dir.is_dir():
        print(f"error: {iter_dir} bukan direktori", file=sys.stderr)
        return 2
    prev_dir = Path(args.previous_workspace).resolve() if args.previous_workspace else None
    if prev_dir and not prev_dir.is_dir():
        print(f"error: --previous-workspace {prev_dir} bukan direktori", file=sys.stderr)
        return 2

    payload = bangun_payload(
        iter_dir, prev_dir, Path(args.benchmark).resolve() if args.benchmark else None
    )
    if args.skill_name:
        payload["skill_name"] = args.skill_name
    if not payload["evals"]:
        print(f"error: tidak ada direktori eval di {iter_dir}", file=sys.stderr)
        return 2

    html = render(payload)

    if args.static:
        tujuan = Path(args.static).resolve()
        tujuan.parent.mkdir(parents=True, exist_ok=True)
        tujuan.write_text(html, encoding="utf-8")
        print(f"Reviewer statis ditulis ke {tujuan}")
        print(f"  {len(payload['evals'])} eval, {len(payload['configs'])} konfigurasi, "
              f"{tujuan.stat().st_size / 1024:.0f} KiB")
        print("  Buka berkas itu di peramban. Tombol \"Submit All Reviews\" akan "
              "mengunduh feedback.json — salin ke folder iteration.")
        return 0

    jalankan_server(html, iter_dir, args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
