#!/usr/bin/env python3
"""Prepend one idempotent release entry to an OBS .changes file."""

import argparse
from datetime import datetime, timezone
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--notes", required=True, type=Path)
    args = parser.parse_args()

    if not args.tag.replace(".", "").isalnum():
        parser.error("tag must contain only letters, digits, and dots")

    old = args.file.read_text(encoding="utf-8") if args.file.exists() else ""
    marker = f"GitHub release {args.tag}"
    if marker in old:
        print(f"Changelog already contains {marker}; leaving it unchanged")
        return

    notes = args.notes.read_text(encoding="utf-8").strip()
    lines = [marker]
    if notes:
        lines.extend(f"- {line.strip()}" for line in notes.splitlines() if line.strip())
    else:
        lines.append("- Automated OBS package update")

    timestamp = datetime.now(timezone.utc).strftime("%a %b %d %H:%M:%S UTC %Y")
    entry = "\n".join(
        [
            "-------------------------------------------------------------------",
            f"{timestamp} - GitHub Actions <actions@github.com>",
            "",
            *lines,
            "",
        ]
    )
    args.file.parent.mkdir(parents=True, exist_ok=True)
    args.file.write_text(entry + old.lstrip("\n"), encoding="utf-8")


if __name__ == "__main__":
    main()
