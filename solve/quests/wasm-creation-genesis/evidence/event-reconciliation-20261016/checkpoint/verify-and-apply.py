#!/usr/bin/env python3
"""Check, or apply, the checkpoint only in a clean isolated exact-base worktree.

No network, dependency installation, test execution, commit, push or main merge.
Default is check-only. --apply stages exactly the reviewed patch after validation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(checkout: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(checkout), *args], capture_output=True, timeout=60, check=False
    )
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace").strip() or "Git command failed")
    return result.stdout


def checked_path(checkout: Path, relative: str) -> Path:
    path = Path(relative)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise RuntimeError(f"Unsafe checkpoint path: {relative}")
    if path.parts[0] not in {"src", "test", "solve"}:
        raise RuntimeError(f"Unexpected checkpoint scope: {relative}")
    target = checkout / path
    if not target.resolve().is_relative_to(checkout):
        raise RuntimeError(f"Path leaves checkout: {relative}")
    return target


def run(checkout: Path, apply: bool) -> dict:
    package = Path(__file__).resolve().parent
    manifest = json.loads((package / "MANIFEST.json").read_text())
    patch = package / "changes.patch"
    if digest(patch.read_bytes()) != manifest["patchSha256"]:
        raise RuntimeError("Patch checksum mismatch")
    checkout = checkout.resolve(strict=True)
    if Path(git(checkout, "rev-parse", "--show-toplevel").decode().strip()).resolve() != checkout:
        raise RuntimeError("Pass the worktree root, not a subdirectory")
    branch = git(checkout, "rev-parse", "--abbrev-ref", "HEAD").decode().strip()
    if branch in {"main", "master"}:
        raise RuntimeError("Refusing a main/master checkout; create an isolated worktree")
    actual_base = git(checkout, "rev-parse", "HEAD").decode().strip()
    if actual_base != manifest["baseRemote"]:
        raise RuntimeError(f"Expected exact base {manifest['baseRemote']}; found {actual_base}")
    if git(checkout, "status", "--porcelain", "--untracked-files=all").strip():
        raise RuntimeError("Worktree/index is not clean; no changes made")
    for name, key in (("src", "baseSourceTree"), ("test", "baseTestTree")):
        if git(checkout, "rev-parse", f"HEAD:{name}").decode().strip() != manifest[key]:
            raise RuntimeError(f"Baseline {name} subtree mismatch")
    for relative, record in manifest["files"].items():
        target = checked_path(checkout, relative)
        if record["beforeSha256"] is None:
            if target.exists() or target.is_symlink():
                raise RuntimeError(f"New path already exists: {relative}")
        elif not target.is_file() or digest(target.read_bytes()) != record["beforeSha256"]:
            raise RuntimeError(f"Preimage mismatch: {relative}")
    git(checkout, "apply", "--check", "--index", str(patch))
    if not apply:
        return {"status": "PATCH_CHECKED_NOT_APPLIED", "base": actual_base}
    git(checkout, "apply", "--index", str(patch))
    # Keep unexpected post-application failures visible; never reset or erase evidence.
    changed = set(git(checkout, "diff", "--cached", "--name-only").decode().splitlines())
    if changed != set(manifest["files"]):
        raise RuntimeError("Staged scope mismatch; leave worktree intact for inspection")
    for relative, record in manifest["files"].items():
        if digest(checked_path(checkout, relative).read_bytes()) != record["afterSha256"]:
            raise RuntimeError(f"Postimage mismatch; inspect worktree: {relative}")
    tree = git(checkout, "write-tree").decode().strip()
    for name, key in (("src", "candidateSourceTree"), ("test", "candidateTestTree")):
        if git(checkout, "rev-parse", f"{tree}:{name}").decode().strip() != manifest[key]:
            raise RuntimeError(f"Candidate {name} subtree mismatch; inspect worktree")
    return {
        "status": "PATCH_APPLIED_AND_STAGED_NOT_COMMITTED",
        "base": actual_base,
        "sourceTree": manifest["candidateSourceTree"],
        "testTree": manifest["candidateTestTree"],
        "testsExecuted": False,
        "published": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("checkout", type=Path, help="Clean isolated worktree at the exact published base")
    parser.add_argument("--apply", action="store_true", help="Apply and stage after validation; default only checks")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.checkout, args.apply), indent=2))
        return 0
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"REFUSED: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
