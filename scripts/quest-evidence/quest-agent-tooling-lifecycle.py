"""Actual lifecycle witness in a separately created Lagrange Git worktree.

Run with the pinned Serena Python environment (which owns the MCP SDK). This
producer uses real CLI commands and stdio services, never replayed responses.
It leaves its worktree and raw observations for inspection, including failures.
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SOURCE = Path.cwd().resolve()
PROJECT = Path(sys.argv[1]).resolve()
CLI = [shutil.which("node"), "scripts/agent-tooling/cli.js"]
PROFILE = Path("scripts/agent-tooling/profile.json")
SUBJECT = Path("src/rebalancer/replica-operation-repository-row-methods.js")
record = {"schema": "quest-tooling-lifecycle-observation/1", "root": str(PROJECT),
          "sourceRoot": str(SOURCE), "phases": []}
all_owned = {}


def stamp():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def phase(name, observations):
    record["phases"].append({"phase": name, "observations": observations})


def command(args, root=PROJECT, expected=0):
    started = stamp()
    result = subprocess.run(args, cwd=root, capture_output=True, text=True,
                            timeout=180, stdin=subprocess.DEVNULL, check=False)
    observed = {"command": args, "cwd": str(root), "startedAt": started,
                "endedAt": stamp(), "exitCode": result.returncode,
                "stdout": result.stdout, "stderr": result.stderr}
    if result.returncode != expected:
        phase("failed-command", [observed])
        raise RuntimeError(f"unexpected command exit: {args}: {result.returncode}")
    return observed


def processes():
    found = {}
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            stat = (entry / "stat").read_text()
            fields = stat[stat.rfind(")") + 2:].split()
            found[int(entry.name)] = {"pid": int(entry.name), "ppid": int(fields[1]),
                                      "group": int(fields[2]), "state": fields[0],
                                      "start": fields[19]}
        except (FileNotFoundError, ProcessLookupError):
            continue
    return found


def descendants(pid):
    found = processes()
    selected = {pid}
    while True:
        more = {key for key, value in found.items() if value["ppid"] in selected}
        if more <= selected:
            break
        selected |= more
    result = [found[key] for key in selected if key in found]
    for item in result:
        all_owned[(item["pid"], item["start"])] = item
    return result


def still_live(identities):
    current = processes()
    return [item for item in identities if item["pid"] in current and
            current[item["pid"]]["start"] == item["start"] and
            current[item["pid"]]["state"] not in ("Z", "X")]


async def stopped(identities):
    deadline = time.monotonic() + 12
    while still_live(identities) and time.monotonic() < deadline:
        await asyncio.sleep(0.05)
    if still_live(identities):
        raise RuntimeError("owned service processes remain alive")


async def navigate(root, mutate=False, cancel=False):
    observations = []
    original = (root / SUBJECT).read_bytes()
    changed = None
    if mutate and root != PROJECT:
        raise RuntimeError("source mutation requires the exclusively owned test worktree")
    lock = root / ".codex/quest-tooling/quest_serena.lock/owner.json"
    parameters = StdioServerParameters(command=CLI[0], args=[CLI[1], "serve", "quest_serena"],
                                      cwd=str(root), env=dict(os.environ))
    identities = []
    try:
        async with stdio_client(parameters) as (read, write):
            async with ClientSession(read, write) as session:
                initialized = await session.initialize()
                listed = await session.list_tools()
                observations.append({"initialize": initialized.model_dump(mode="json", by_alias=True),
                                     "tools": listed.model_dump(mode="json", by_alias=True),
                                     "root": str(root)})
                pid = json.loads(lock.read_text())["pid"]
                identities = descendants(pid)
                if not identities:
                    raise RuntimeError("service identity missing")

                async def symbol(label):
                    args = {"relative_path": str(SUBJECT), "name_path_pattern": "rowToOperation",
                            "substring_matching": True, "include_body": True}
                    result = await session.call_tool("find_symbol", args)
                    observations.append({"tool": "find_symbol", "arguments": args,
                                         "result": result.model_dump(mode="json", by_alias=True),
                                         "label": label,
                                         "sourceSha256": digest((root / SUBJECT).read_bytes())})
                    if result.is_error:
                        raise RuntimeError("real symbol query failed")
                    symbols = json.loads("\n".join(part.text for part in result.content
                                                   if part.type == "text"))
                    if not symbols or not all(item.get("body") for item in symbols):
                        raise RuntimeError("symbol body unavailable")
                    return symbols

                initial = await symbol("initial")
                if not all(item["body"] in original.decode() for item in initial):
                    raise RuntimeError("initial response does not match actual worktree")
                if mutate:
                    marker = "// Actual isolated worktree navigation observation."
                    changed = original.decode().replace("rowToOperation(row) {",
                                                        "rowToOperation(row) {\n      " + marker, 1)
                    if changed == original.decode():
                        raise RuntimeError("navigation subject shape changed")
                    (root / SUBJECT).write_text(changed)
                    observations.append({"sourceChange": {"path": str(SUBJECT),
                                                          "before": original.decode(),
                                                          "after": changed}})
                    observed = await symbol("source-changed-before-restart")
                    observations.append({"sourceChangeObserved": all(marker in item["body"]
                                                                     for item in observed)})
                    restarted = await session.call_tool("restart_language_server", {})
                    observations.append({"tool": "restart_language_server",
                                         "result": restarted.model_dump(mode="json", by_alias=True)})
                    refreshed = await symbol("after-explicit-restart")
                    if not all(marker in item["body"] and item["body"] in changed
                               for item in refreshed):
                        raise RuntimeError("restarted index does not match changed source")
                identities = descendants(pid)
                observations.append({"ownedProcessesBeforeClose": identities})
                if cancel:
                    os.kill(pid, signal.SIGTERM)
                    observations.append({"signal": "SIGTERM", "pid": pid, "at": stamp()})
                    await stopped(identities)
    finally:
        if changed is not None:
            if (root / SUBJECT).read_bytes() != changed.encode():
                raise RuntimeError("navigation subject changed outside the witness; preserved conflict")
            (root / SUBJECT).write_bytes(original)
        if identities:
            await stopped(identities)
        observations.append({"liveOwnedProcessesAfter": still_live(identities),
                             "lockAfter": lock.exists()})
        phase("cancel" if cancel else "restart", observations)
    if lock.exists():
        raise RuntimeError("service lock was not released")


def interrupt_upgrade():
    output = PROJECT / "test-output/tooling-interruption.stdout"
    error = PROJECT / "test-output/tooling-interruption.stderr"
    output.parent.mkdir(parents=True, exist_ok=True)
    pending = PROJECT / ".codex/quest-tooling/pending.json"
    started = stamp()
    with output.open("wb") as out, error.open("wb") as err:
        child = subprocess.Popen(CLI + ["upgrade"], cwd=PROJECT, stdout=out, stderr=err,
                                 stdin=subprocess.DEVNULL, start_new_session=True)
        deadline = time.monotonic() + 120
        while not pending.exists() and child.poll() is None and time.monotonic() < deadline:
            time.sleep(0.001)
        if not pending.exists():
            child.terminate()
            child.wait(timeout=10)
            raise RuntimeError("no interruptible transaction was observed")
        child.send_signal(signal.SIGSTOP)
        owned = descendants(child.pid)
        child.kill()
        child.wait(timeout=10)
        # Only this producer's observed test processes may be cleaned after its
        # deliberate hard interruption. Production recovery never guesses PIDs.
        for identity in still_live(owned):
            os.kill(identity["pid"], signal.SIGKILL)
    phase("interrupt", [{"command": CLI + ["upgrade"], "startedAt": started,
                         "endedAt": stamp(), "exitCode": child.returncode,
                         "stdout": output.read_text(), "stderr": error.read_text(),
                         "pendingDigest": digest(pending.read_bytes()), "owned": owned}])
    return owned


async def main():
    if SOURCE == PROJECT or PROJECT.parent != SOURCE / "test-output/agent-tooling":
        raise RuntimeError("requires a separate owned lifecycle worktree")
    if PROJECT.exists():
        raise RuntimeError("retain previous worktree; choose a new attempt path")
    prepared = command(["git", "worktree", "add", "--detach", str(PROJECT), "HEAD"], root=SOURCE)
    source_files = json.loads(command([CLI[0], "--input-type=module", "-e",
        "import {sourceFiles} from './scripts/agent-tooling/evidence.js'; "
        "console.log(JSON.stringify(sourceFiles(process.cwd())))"], root=SOURCE)["stdout"])
    for relative in source_files:
        destination = PROJECT / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SOURCE / relative, destination)
    (PROJECT / "node_modules").symlink_to((SOURCE / "node_modules").resolve(), target_is_directory=True)
    (PROJECT / ".codex").mkdir(exist_ok=True)
    config = PROJECT / ".codex/config.toml"
    config.write_text('[shell_environment_policy]\ninherit = "core"\n')
    record["unrelatedBefore"] = digest(config.read_bytes())
    record["sourceCommit"] = command(["git", "rev-parse", "HEAD"], root=SOURCE)["stdout"].strip()
    record["subject"] = {"path": str(SUBJECT), "sha256": digest((SOURCE / SUBJECT).read_bytes())}
    profile_bytes = (PROJECT / PROFILE).read_bytes()
    phase("setup", [prepared, command(CLI + ["setup"])])
    phase("repeat", [command(CLI + ["setup"])])
    profile = json.loads(profile_bytes)
    profile["servers"]["quest_serena"]["toolTimeoutSeconds"] += 1
    upgraded_bytes = (json.dumps(profile, indent=2) + "\n").encode()
    (PROJECT / PROFILE).write_bytes(upgraded_bytes)
    phase("upgrade", [command(CLI + ["setup"], expected=1), command(CLI + ["upgrade"])])
    entry = PROJECT / (".codex/quest-tooling/context7/" + profile["upstreams"]["context7"]["version"] +
                       "/node_modules/@upstash/context7-mcp/dist/index.js")
    absent = entry.with_suffix(".intentionally-absent")
    entry.rename(absent)
    try:
        phase("tool-loss", [command(CLI + ["serve", "quest_context7"], expected=1)])
    finally:
        absent.rename(entry)
    profile["servers"]["quest_serena"]["toolTimeoutSeconds"] += 1
    (PROJECT / PROFILE).write_text(json.dumps(profile, indent=2) + "\n")
    owned = interrupt_upgrade()
    await stopped(owned)
    lock = PROJECT / ".codex/quest-tooling/lifecycle.lock"
    owner = json.loads((lock / "owner.json").read_text())
    if owner["pid"] != owned[0]["pid"] and owner["pid"] not in [item["pid"] for item in owned]:
        raise RuntimeError("interrupted lock custody changed")
    phase("recover", [command(CLI + ["recover"], expected=1),
                      {"inspectedDeadTestOwner": owner, "live": still_live(owned)}])
    shutil.rmtree(lock)  # Explicit inspected cleanup of this exclusive test profile.
    recovered = command(CLI + ["recover"])
    (PROJECT / PROFILE).write_bytes(upgraded_bytes)
    phase("recover", [recovered, command(CLI + ["status"])])
    await navigate(SOURCE)
    await navigate(PROJECT, mutate=True)
    await navigate(PROJECT, cancel=True)
    (PROJECT / PROFILE).write_bytes(profile_bytes)
    phase("upgrade", [command(CLI + ["upgrade"])])
    phase("remove", [command(CLI + ["remove"])])
    phase("ordinary-quest", [command([CLI[0], "scripts/solve.js", "board"])])
    status = command(CLI + ["status"])
    record["configurationAfter"] = json.loads(status["stdout"])["status"]
    record["unrelatedAfter"] = digest(config.read_bytes())
    record["liveOwnedProcessesAfter"] = still_live(list(all_owned.values()))
    if record["unrelatedBefore"] != record["unrelatedAfter"]:
        raise RuntimeError("unrelated configuration changed")
    if record["liveOwnedProcessesAfter"] or record["configurationAfter"] != "absent":
        raise RuntimeError("lifecycle cleanup incomplete")


try:
    asyncio.run(main())
except BaseException as failure:
    record["failure"] = {"type": type(failure).__name__, "message": str(failure)}
    print(json.dumps(record))
    raise
else:
    print(json.dumps(record))
