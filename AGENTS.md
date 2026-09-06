---
audience: agent
requires:
  - docs/steering/rules.md
  - docs/steering/router.md
---

# AGENTS

This repository uses the **Quest** workflow. This file is the single steering
entry point and the only document that prescribes a load order.

## Steering Load Order

1. Read this file.
2. Read [`rules.md`](docs/steering/rules.md): twenty-five cross-cutting
   invariants you can violate merely by not knowing them.
3. Consult [`router.md`](docs/steering/router.md) for the owner of whatever
   the work touches. Nothing else is read by default, and no rule holds the
   detail its owner holds.

That is the whole always-loaded surface. Every other document is conditional
material the router names, or an owner's own authority.

## Choose The Work Unit

Create a Quest for work likely to need more than one measured attempt, or for a
change to an owner-boundary contract. A single-sitting fix, documentation edit,
or mechanical change with an obvious proof may be done and committed directly.
The binding threshold is in
[`solver-quests.md`](docs/steering/workflow-guidelines/solver-quests.md).

## Quest Happy Path

```sh
node scripts/solve.js start --id <id>      # seals against a red probe
node scripts/solve.js note --id <id> --attempt "<what changed>"
node scripts/solve.js probe --id <id>
node scripts/solve.js land --id <id>       # guards, npm test, commit; never pushes
```

A quest is `solve/quests/<id>/quest.json` (statement, epic, `doneWhen`
probe) plus an append-only `log.ndjson` of findings, attempts, verifications
and one terminal entry. Stop for exactly four owner decisions: judgment,
independent verification, audit repair, or terminal landing. Source changes
require an independent verifier (`note --verification ... --verifier
subagent:<id> --verdict approve`). Solver commits only reviewed Quest scope
and never pushes.

After every intended Quest commit has landed, publish the exact committed HEAD:

```sh
npm run publish
```

The publisher gates a clean temporary worktree, writes a HEAD-bound receipt,
checks fast-forward eligibility and the remote SHA, and never stages, commits,
amends, force-pushes, or sweeps the caller's worktree.

## Find The Right Surface

| Need | Read / run |
| --- | --- |
| The owner of a concern | [`router.md`](docs/steering/router.md) |
| Quest rules and guardrails | [`solver-quests.md`](docs/steering/workflow-guidelines/solver-quests.md) |
| Examples, Git, recovery, component commands | [`solver-runbook.md`](docs/development/solver-runbook.md) |
| Available project commands | `npm run commands` |
| Open epics and quests | `node scripts/solve.js board` |

Before writing an ad-hoc shell command for a repository task, look for the
script that already does it: `npm run commands` is the curated quickstart and
the generated tools index is the complete list.

Ratchet baselines are one-way: fix, de-export, extract, or simplify instead of
raising them; tighten a baseline when its checker prints the hint.
