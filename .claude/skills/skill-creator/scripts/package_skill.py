#!/usr/bin/env python3
"""Package a skill folder into a distributable `<name>.skill` file.

    python -m scripts.package_skill <path/to/skill-folder> [--out-dir DIR]

The archive is a zip named after the skill's own `name` frontmatter field, so the
original name is preserved (an edited copy of `research-helper` still packages as
`research-helper.skill`, never `research-helper-v2`).

Two details that matter in practice:

- The archive is built in a temp directory and then moved into place. Some install
  locations are read-only or only writable via a rename, and writing a partial
  zip straight to the destination leaves a corrupt file behind when it fails.
- Only the skill directory is archived, with the directory itself as the top-level
  entry, so extracting it produces a drop-in skill folder.

Stdlib only — no PyYAML, no third-party deps, so this runs anywhere Python does.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.S)
SKIP_DIRS = {"__pycache__", ".git", "node_modules", ".venv", "venv", ".mypy_cache", ".ruff_cache"}
SKIP_FILES = {".DS_Store", "Thumbs.db"}
SKIP_SUFFIX = {".pyc", ".pyo"}


def baca_frontmatter(skill_md: Path) -> dict[str, str]:
    """Minimal frontmatter reader: `key: value` on one line per key.

    Deliberately not a full YAML parser. Skill frontmatter is two scalar fields,
    and pulling in PyYAML would make this script fail on machines that don't have
    it — a bad trade for the small amount of parsing it would save.
    """
    teks = skill_md.read_text(encoding="utf-8")
    m = FRONTMATTER.match(teks)
    if not m:
        raise ValueError("SKILL.md tidak diawali frontmatter `---` … `---`")
    hasil: dict[str, str] = {}
    for baris in m.group(1).splitlines():
        if not baris.strip() or baris.lstrip().startswith("#"):
            continue
        if ":" not in baris:
            continue
        kunci, _, nilai = baris.partition(":")
        nilai = nilai.strip()
        if nilai in (">", "|", ">-", "|-"):
            raise ValueError(
                f"field `{kunci.strip()}` memakai blok YAML multi-baris; "
                "tulis `name`/`description` sebagai satu baris agar bisa dibaca"
            )
        hasil[kunci.strip()] = nilai.strip().strip("'\"")
    return hasil


def entri_arsip(root: Path) -> list[Path]:
    """Files to include, skipping caches and OS junk."""
    keluar: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for nama in filenames:
            if nama in SKIP_FILES or Path(nama).suffix in SKIP_SUFFIX:
                continue
            keluar.append(Path(dirpath) / nama)
    return sorted(keluar)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("skill_dir", help="folder containing SKILL.md")
    p.add_argument("--out-dir", default=".", help="where to write <name>.skill (default: cwd)")
    p.add_argument("--json", action="store_true", help="print a machine-readable result")
    args = p.parse_args(argv)

    skill_dir = Path(args.skill_dir).resolve()
    if not skill_dir.is_dir():
        print(f"error: {skill_dir} bukan direktori", file=sys.stderr)
        return 2
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        print(f"error: {skill_md} tidak ada — folder skill wajib punya SKILL.md", file=sys.stderr)
        return 2

    try:
        fm = baca_frontmatter(skill_md)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    nama = fm.get("name", "").strip()
    deskripsi = fm.get("description", "").strip()
    masalah: list[str] = []
    if not nama:
        print("error: frontmatter tidak punya `name`", file=sys.stderr)
        return 2
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", nama):
        print(
            f"error: `name` harus huruf kecil, angka, dan tanda hubung (dapat: {nama!r})",
            file=sys.stderr,
        )
        return 2
    if not deskripsi:
        masalah.append("frontmatter tidak punya `description` — skill tidak akan terpicu otomatis")

    # Warnings, not errors: these are quality signals for the author, and refusing
    # to package over them would block a legitimate deliberate choice.
    baris_skill = skill_md.read_text(encoding="utf-8").count("\n")
    if baris_skill > 500:
        masalah.append(f"SKILL.md {baris_skill} baris (>500) — pertimbangkan references/")
    if nama != skill_dir.name:
        masalah.append(f"nama frontmatter ({nama}) beda dengan nama folder ({skill_dir.name})")

    berkas = entri_arsip(skill_dir)
    if not berkas:
        print("error: tidak ada berkas untuk dikemas", file=sys.stderr)
        return 2

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    tujuan = out_dir / f"{nama}.skill"

    # Build in a temp dir, then move: a failed write must not leave a truncated
    # archive sitting at the destination looking installed.
    with tempfile.TemporaryDirectory(prefix="skillpkg-") as tmp:
        sementara = Path(tmp) / f"{nama}.skill"
        with zipfile.ZipFile(sementara, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in berkas:
                zf.write(f, arcname=str(Path(skill_dir.name) / f.relative_to(skill_dir)))
        try:
            shutil.move(str(sementara), str(tujuan))
        except OSError as exc:
            print(f"error: tidak bisa menulis {tujuan}: {exc}", file=sys.stderr)
            print(f"       arsip sementara ada di {sementara} (salin manual bila perlu)", file=sys.stderr)
            return 2

    hasil = {
        "name": nama,
        "description_chars": len(deskripsi),
        "path": str(tujuan),
        "files": len(berkas),
        "bytes": tujuan.stat().st_size,
        "warnings": masalah,
    }
    if args.json:
        print(json.dumps(hasil, indent=2, ensure_ascii=False))
    else:
        print(f"Dikemas: {tujuan}")
        print(f"  {len(berkas)} berkas, {tujuan.stat().st_size / 1024:.1f} KiB")
        for w in masalah:
            print(f"  ! {w}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
