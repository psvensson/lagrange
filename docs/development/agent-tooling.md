---
audience: development
---

# Project agent tooling

This owner integrates selected skills and two MCP services with the existing
Quest workflow. Read AGENTS, rules and router first. The
[profile](../../scripts/agent-tooling/profile.json) is the single owner of pinned
inputs and allowed capabilities. The [epic](../../solve/epics/quest-agent-tooling-integration.md)
records current acceptance and remaining work; configuration alone is never live proof.

## Scope and authority

The five repository skills in `.agents/skills/` cover source navigation,
systematic investigation, independent review, verified learning and external
library documentation. They follow the current Quest owners. Selected Superpowers
and Compound Engineering instructions are adapted and attributed in
[NOTICE.md](../../scripts/agent-tooling/NOTICE.md). Their independent task pipelines,
approval loops, memory stores and baseline update behavior are not activated.

Initial support targets the pinned Codex CLI, Node and uv versions on Linux. JavaScript source
navigation uses Serena's TypeScript backend. Rust and other hosts require their
own measured journey. No source, durability, formation, release or comparative
performance claim follows from tooling acceptance.

## Setup and invocation

From the intended worktree, with the pinned executables on PATH:

```sh
node scripts/agent-tooling/cli.js setup
node scripts/agent-tooling/cli.js status
codex
```

Setup uses a project `.codex/config.toml` block and `.serena/project.yml`, plus a
private worktree-local Serena home and Context7 npm installation under
`.codex/quest-tooling`. These are ignored projections. Personal config, credentials
and memory are untouched. Setup checks the actual host configuration reader and
package integrity; live tool invocation remains a separate check.

Codex must load this project's configuration through its normal trusted-project
mechanism. `--ignore-user-config` also removes the trust information needed in the
observed host; a configuration-listing command does not prove tools reached the
agent. Do not invent a CLI trust override or modify a global profile to hide a
missing capability. Use a normal client session and inspect actual MCP calls.

Invoke the relevant skill explicitly or let normal project skill discovery select
it. Serena exposes only the profile's navigation tools. Its project is fixed to
this worktree. Context7 exposes library resolution and documentation queries.
Check returned versions and source URLs against the installed dependency. A pinned
Context7 client does not freeze the remote corpus. Exact-version absence stays
`exact-version-unavailable`, even when a generic response is useful.

## Identity and resource lifetime

Record the worktree, commit, relevant dirty-file digests, profile, client and
backend versions with investigations. Restart the owned service after switching
worktrees or source identity; verify returned bodies against source. Empty or
partial references do not prove completeness, especially for prototype composition
and dynamic dispatch. Cross-check those paths through their actual owners.

The client owns each MCP session. Each service has one lock per worktree and a
bounded shutdown grace. Cancellation terminates the owned child process group.
Concurrent activation or removal while a lock exists refuses. After a hard crash,
inspect the lock's owner and the actual process tree before removing that specific
stale lock; PID existence alone cannot authorize killing another process.
Recovery refuses while any lifecycle or service lock remains. There is no automatic
stale-lock reclamation: two recoverers must never delete a newly acquired lock.

## Evidence and independent review

Capture an actual command or Codex JSON session through the existing Quest evidence
surface. Use a unique attempt id; the producer refuses to overwrite observations.

```sh
node scripts/quest-evidence/quest-agent-tooling.js setup-proof candidate -- node scripts/agent-tooling/cli.js setup
node scripts/quest-evidence/quest-agent-tooling.js navigation-proof candidate -- codex --no-daemon -a never exec --json -s read-only "Use quest-navigate to trace the relevant producer, decoder and consumer."
```

The capture records invocation, timestamps, real output, exit, source before/after
and digests. Keep queries and captured output free of credentials. Raw observations
belong in the existing evidence store. Upload them with `solve.js evidence add`,
which re-downloads and hashes the asset before appending its finding. Then use
`node scripts/agent-tooling/cli.js materialize <quest-id>` to populate the hash-verified
local cache from those findings. The compact Quest receipt references the verified
objects and explains coverage per sealed check; it never embeds raw transcripts.
Retain failed attempts, including output whose post-execution identity is unavailable.

The capture phases are `candidate`, `control`, `baseline`, `authoring` and `landing`.
Only candidate observations establish positive tool capability. Controls exercise
the validator, historical baselines retain failures, authoring retains actual changed
bytes, and landing permits only the canonical Solver commit transition. Original
observations are immutable. The applicability owner binds each component to its
runtime and capability files; unrelated skill/test edits do not require another
live session. Q4 and Q8 additionally bind the current proof machinery and composition.

The real lifecycle producer runs in a separate Git worktree created beneath
`test-output/agent-tooling/`. Invoke it with the pinned Serena Python environment:

```sh
uv tool run --from git+https://github.com/oraios/serena@6e5c3776d4e67befaab7c290bc29b0279c98d1ed python scripts/quest-evidence/quest-agent-tooling-lifecycle.py "$PWD/test-output/agent-tooling/lifecycle-<unique-attempt>"
```

It retains actual CLI/SDK outputs, checks worktree and changed-source navigation,
interrupts its own setup, inspects its own stopped processes before stale-lock
cleanup, and removes its own configuration. It leaves the test worktree for review.

The [read-only checker](../../scripts/checks/quest-agent-tooling-acceptance.js)
consumes the same artifact declaration as Solver. It validates source and output
digests, client/tool events, check references and independent review of the exact
receipt bytes. The verifier reviews semantic coverage, not just the existence of
an output stream. Record its actual verdict with Solver and include
`tooling-receipt-sha256:<digest>` in the verification text. Self-review, changed
receipts and unsupported claims are refused. No manual passed flag establishes a
result. Sealing directly observed absent implementation is distinct from missing
execution evidence, which remains non-measuring.

Capture verified lessons at the existing prevention owner before landing. Terminal
Quest logs remain closed; corrections go into an open successor with a link to the
original. A separate later session must check source applicability before reuse.
No mock, fake or emulated information may be created, used or generated during
comparative systems measurements. Isolated validator controls are never campaign
observations, and this tooling integration does not run comparative workloads.

## Lifecycle

Repeated setup is idempotent. Altered owned content and colliding server entries
refuse; unrelated settings are preserved byte for byte. For a reviewed update,
change the immutable pins and licenses in the profile, inspect instruction/API
changes, then run `upgrade` and repeat affected live proof. No moving version or
silent downgrade is selected.

`remove` removes matching owned configuration and leaves inactive dependency/index
caches and historical evidence. It does not delete user files or change ordinary
Quest operation. `recover` restores a pending transaction's recorded original bytes
only when no conflicting edit occurred; otherwise it names the conflict. Tool loss,
startup failure, unsupported host and stale configuration remain typed unavailable
states. Continue independent authorized work while the missing claim stays open.
