#!/usr/bin/env python3
"""Enroll local Raywonder repos with per-OS sync template and manifest."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass
class LocalRepo:
    name: str
    path: Path
    remote: str


def run(cmd: list[str], cwd: Path | None = None) -> str:
    proc = subprocess.run(cmd, cwd=str(cwd) if cwd else None, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{proc.stderr.strip()}")
    return proc.stdout.strip()


def discover_local_repos(apps_root: Path) -> list[LocalRepo]:
    repos: list[LocalRepo] = []
    for child in apps_root.iterdir():
        if not child.is_dir():
            continue
        if child.name == ".GITHUB":
            continue
        candidates: list[Path] = []
        if (child / ".git").exists():
            candidates.append(child)
        nested_same_name = child / child.name
        if (nested_same_name / ".git").exists():
            candidates.append(nested_same_name)
        if not candidates:
            continue

        selected: LocalRepo | None = None
        for candidate in candidates:
            try:
                remotes = run(["git", "remote"], cwd=candidate).splitlines()
            except Exception:
                continue

            matched_remote = ""
            for remote_name in remotes:
                if not remote_name.strip():
                    continue
                try:
                    remote_url = run(["git", "remote", "get-url", remote_name.strip()], cwd=candidate)
                except Exception:
                    continue
                if "raywonder" in remote_url.lower():
                    matched_remote = remote_url
                    break

            if matched_remote:
                selected = LocalRepo(name=child.name, path=candidate, remote=matched_remote)
                break

        if not selected:
            continue
        repos.append(selected)
    return sorted(repos, key=lambda r: r.name.lower())


def list_remote_repos(owner: str) -> list[dict]:
    out = run([
        "gh",
        "repo",
        "list",
        owner,
        "--limit",
        "200",
        "--json",
        "name,nameWithOwner,isPrivate,defaultBranchRef,url,updatedAt",
    ])
    return json.loads(out)


def ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def copy_template_tree(source_root: Path, target_root: Path):
    ensure_dir(target_root)
    for entry in source_root.iterdir():
        src = entry
        dst = target_root / entry.name
        if src.is_dir():
            if not dst.exists():
                shutil.copytree(src, dst)
            else:
                for sub in src.rglob("*"):
                    if sub.is_dir():
                        continue
                    rel = sub.relative_to(src)
                    out = dst / rel
                    out.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(sub, out)
        else:
            shutil.copy2(src, dst)


def apply_template(repo: LocalRepo, template_root: Path, shared_templates_root: Path):
    target = repo.path / ".raywonder-sync"
    copy_template_tree(template_root, target)
    copy_template_tree(shared_templates_root, target / "shared-templates")


def main() -> int:
    home = Path.home()
    apps_root = Path(os.environ.get("RAY_APPS_ROOT", str(home / "DEV" / "APPS"))).resolve()
    dotgithub_root = Path(__file__).resolve().parents[2]
    template_root = dotgithub_root / "raywonder-repo-bootstrap" / "templates" / "project-sync"
    shared_templates_root = dotgithub_root / "templates"
    state_dir = dotgithub_root / "raywonder-repo-bootstrap" / "state"
    ensure_dir(state_dir)

    remote_repos = list_remote_repos("Raywonder")
    local_repos = discover_local_repos(apps_root)

    remote_by_name = {r["name"].lower(): r for r in remote_repos}

    enrolled: list[dict] = []
    for repo in local_repos:
        apply_template(repo, template_root, shared_templates_root)
        remote_meta = remote_by_name.get(repo.name.lower())
        enrolled.append(
            {
                "name": repo.name,
                "path": str(repo.path),
                "remote": repo.remote,
                "in_remote_inventory": remote_meta is not None,
                "remote_repo": remote_meta["nameWithOwner"] if remote_meta else None,
            }
        )

    local_names = {r.name.lower() for r in local_repos}
    missing_locally = [
        r
        for r in remote_repos
        if r["name"].lower() not in local_names and r["name"].lower() != ".github"
    ]

    manifest = {
        "owner": "Raywonder",
        "apps_root": str(apps_root),
        "dotgithub_root": str(dotgithub_root),
        "remote_repo_count": len(remote_repos),
        "local_raywonder_repo_count": len(local_repos),
        "enrolled_local_repos": enrolled,
        "remote_repos_missing_locally": missing_locally,
    }

    out = state_dir / "raywonder_repo_inventory.json"
    out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote manifest: {out}")
    print(f"Enrolled {len(local_repos)} local Raywonder repos.")
    print(f"Remote repos missing locally: {len(missing_locally)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
