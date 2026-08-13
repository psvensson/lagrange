# AGENTS

This repository uses the **Quest** workflow. This file is the single steering
entry point and the only document that prescribes a load order.

## Choose The Work Unit

Create a Quest for work likely to need more than one measured attempt, or for a
change to an owner-boundary contract. A single-sitting fix, documentation edit,
or mechanical change with an obvious proof may be done and committed directly.
The binding threshold is in
[`solver-quests.md`](docs/steering/workflow-guidelines/solver-quests.md).

## Quest Happy Path

```sh
node scripts/solve.js start --id <id>
node scripts/solve.js continue --id <id>
# make and test the bounded change
node scripts/solve.js continue --id <id> --summary "<what changed>"
node scripts/solve.js land --id <id>
```

`continue` executes only a trusted structured action. Automation dispatches on
`action.code` and validated `action.payload`, never rendered command text. Stop
for exactly four owner decisions: judgment, independent verification, audit
repair, or terminal landing. Source changes require an independent verifier.
Solver commits only reviewed Quest scope and never pushes.

After every intended Quest commit has landed, publish the exact committed HEAD:

```sh
npm run publish
```

The publisher gates a clean temporary worktree, writes a HEAD-bound receipt,
checks fast-forward eligibility and the remote SHA, and never stages, commits,
amends, force-pushes, or sweeps the caller's worktree. Red-main repair, runner
routing, direct Git escape hatches, and recovery commands live in the
[`Solver operator runbook`](docs/development/solver-runbook.md).

## Steering Load Order

1. Read this file.
2. Read [`core.md`](docs/steering/llm/core.md).
3. Read [`boot.md`](docs/steering/llm/boot.md).
4. Load only the relevant complete domain pack(s):
   [`architecture`](docs/steering/llm/architecture.md),
   [`testing`](docs/steering/llm/testing.md),
   [`style`](docs/steering/llm/style.md), or
   [`governance`](docs/steering/llm/governance.md). Cross-cutting work loads
   each intersecting pack.
5. Let Solver own attempts, findings, evidence, verification, and handoff.
6. Consult source steering only for cited detail or pack repair. After editing a
   configured steering source, run `npm run steering:llm:pack`.

For distributed-harness or convergence work, first read the canonical
[`operational ground truth`](docs/steering/operational-ground-truth.md).
For roadmap scope or a `roadmapRow`, directly load the
[`AGPL feature map`](docs/steering/agpl-feature-map.md).
The domain packs are complete selective surfaces. Optional early-stage planning
under `solve/epics/` is for bounded decision memos, never a mandatory waypoint.

## Find The Right Surface

| Need | Read / run |
| --- | --- |
| Quest rules and guardrails | [`solver-quests.md`](docs/steering/workflow-guidelines/solver-quests.md) |
| Examples, Git, recovery, component commands | [`solver-runbook.md`](docs/development/solver-runbook.md) |
| Available project commands | `npm run commands` |
| Rule lookup | `npm run rule -- --id <ID>` |
| Architecture tree | [`architecture/INDEX.md`](architecture/INDEX.md) |
| Adversarial verification templates | [`verification-templates`](docs/steering/verification-templates/INDEX.md) |
| Cross-layer trace | `node scripts/solve.js trace --quest <id>` |

Ratchet baselines are one-way: fix, de-export, extract, or simplify instead of
raising them; tighten a baseline when its checker prints the hint.
