#!/usr/bin/env python3
"""Read-only verification of this checkpoint's committed evidence objects."""

import hashlib
import json
from pathlib import PurePosixPath
import subprocess
import sys


def git(*args):
    return subprocess.check_output(["git", *args])


def digest(data):
    return hashlib.sha256(data).hexdigest()


commit = git("rev-parse", sys.argv[1] if len(sys.argv) > 1 else "HEAD").decode().strip()
prefixes = [
    "solve/epics/raft-rs-full-cutover/evidence/insight-execution-2026-10-20",
    "solve/quests/participant-control-refusal-provenance/evidence",
    "solve/quests/participant-release-deadline-recovery-witness/evidence",
    "solve/quests/wasm-creation-genesis/evidence/recovery-20261017/bound-stop-native-positive-20261020",
    "solve/quests/wasm-creation-genesis/evidence/recovery-20261017/bound-stop-native-negatives-20261020",
]
tracked = set(git("ls-tree", "-r", "--name-only", commit, "--", *prefixes).decode().splitlines())


def blob(path):
    assert str(path) in tracked, f"Missing committed evidence: {path}"
    return git("show", f"{commit}:{path}")


def decoded(path):
    value = json.loads(blob(path))
    assert value["schema"] == "verbatim-utf8-evidence/1", path
    data = value["utf8Text"].encode("utf8")
    assert len(data) == value["bytes"] and digest(data) == value["sha256"], path
    return data


checked = 0
manifests = 0
for name in sorted(tracked):
    path = PurePosixPath(name)
    if path.name != "SHA256SUMS":
        continue
    manifests += 1
    for line in blob(path).decode().splitlines():
        expected, relative = line.split(maxsplit=1)
        relative = relative.lstrip("*")
        assert ".." not in PurePosixPath(relative).parts, relative
        target = str(path.parent / relative)
        data = blob(target) if target in tracked else decoded(target + ".json")
        assert digest(data) == expected, target
        checked += 1

encoded = 0
for name in sorted(tracked):
    path = PurePosixPath(name)
    if path.name != "encoded-logs.json":
        continue
    for original, entry in json.loads(blob(path))["files"].items():
        payload = path.parent / entry["encodedPath"]
        value = json.loads(blob(payload))
        assert value["originalPath"] == original, payload
        data = decoded(payload)
        assert digest(data) == entry["sha256"] and len(data) == entry["bytes"], payload
        encoded += 1

inputs = json.loads(blob(prefixes[0] + "/execution-inputs.json"))
for path, identity in inputs["runtimeFiles"].items():
    data = git("show", f"{commit}:{path}")
    assert digest(data) == identity["sha256"], path
    actual = git("rev-parse", f"{commit}:{path}").decode().strip()
    assert actual == identity["gitBlob"], path
runtime_diff = git(
    "diff", "--name-only", inputs["measuredCandidate"], commit, "--",
    "src", "test", "scripts", "package.json", "package-lock.json"
).decode().strip()
assert runtime_diff == "", runtime_diff
print(json.dumps({
    "status": "pass",
    "commit": commit,
    "checksumManifests": manifests,
    "checkedManifestEntries": checked,
    "losslessRawOutputs": encoded,
    "boundRuntimeFiles": len(inputs["runtimeFiles"]),
    "measuredCandidate": inputs["measuredCandidate"],
    "runtimeDiff": [],
    "acceptance": "artifact integrity only; no product, Quest, corpus or release verdict",
}, indent=2))
