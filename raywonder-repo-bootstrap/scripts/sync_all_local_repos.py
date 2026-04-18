#!/usr/bin/env python3
"""Refresh Raywonder repo enrollment and optionally pull all tracked repos."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        text=True,
        capture_output=True,
        check=False,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--no-enroll",
        action="store_true",
        help="Skip enrollment refresh and use existing manifest.",
    )
    parser.add_argument(
        "--pull",
        action="store_true",
        help="Run `git pull --ff-only` for each enrolled local Raywonder repo.",
    )
    args = parser.parse_args()

    base = Path(__file__).resolve().parents[1]
    enroll_script = base / "scripts" / "enroll_raywonder_repos.py"
    manifest_path = base / "state" / "raywonder_repo_inventory.json"

    if not args.no_enroll:
        proc = run([sys.executable, str(enroll_script)])
        if proc.returncode != 0:
            sys.stderr.write(proc.stderr or proc.stdout)
            return proc.returncode
        if proc.stdout:
            print(proc.stdout.strip())

    if not manifest_path.exists():
        print(f"Manifest not found: {manifest_path}")
        return 1

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    repos: list[dict] = manifest.get("enrolled_local_repos", [])
    if not repos:
        print("No enrolled local Raywonder repos found.")
        return 0

    print(f"Tracked local Raywonder repos: {len(repos)}")
    print(f"Remote Raywonder repos missing locally: {len(manifest.get('remote_repos_missing_locally', []))}")

    if not args.pull:
        return 0

    failures: list[str] = []
    for repo in repos:
        name = repo.get("name", "unknown")
        path = Path(repo.get("path", ""))
        print(f"[pull] {name} -> {path}")
        proc = run(["git", "pull", "--ff-only"], cwd=path)
        if proc.returncode != 0:
            failures.append(name)
            print((proc.stderr or proc.stdout).strip())

    if failures:
        print(f"Pull failures: {', '.join(failures)}")
        return 1

    print("All tracked repos pulled successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
