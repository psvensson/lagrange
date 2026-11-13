---
audience: agent
requires:
  - docs/steering/rules.md
  - docs/steering/router.md
---

# AGENTS

## Steering Load Order

1. Read this file.
2. Read [`rules.md`](docs/steering/rules.md): the cross-cutting invariants you
   can violate merely by not knowing them.
3. Consult [`router.md`](docs/steering/router.md) for the owner of whatever
   the work touches. Nothing else is read by default, and no rule holds the
   detail its owner holds.

On starting or resuming, identify the rule-set revision, source commit and loaded
instruction sources; reconcile older handoffs with the current owners.

## Choose The Work Unit

Create a Quest when work is likely to need more than one measured attempt or to
change an owner-boundary contract. Red and green observations within one cycle
are one attempt. Bounded work with an obvious proof may use the direct route under
[`solver-quests.md`](docs/steering/workflow-guidelines/solver-quests.md).

## Quest Records

A Quest has `solve/quests/<id>/quest.json` (statement, epic or `class: fix`, `doneWhen`)
and an append-only `log.ndjson` of findings, attempts, verifications and a terminal
entry. Assigned agents own judgment, independent verification, audit repair and
landing within existing authority. Ask the user only for a missing decision or
authority; the workflow owner defines continuation responsibilities. Source and
proof/acceptance changes require independent verification under
[`solver-quests.md`](docs/steering/workflow-guidelines/solver-quests.md)
(`note --verification ... --verifier subagent:<id> --verdict approve`). Review
the actual collected candidate and isolate unrelated changes before landing;
Solver does not select an assignment from a mixed worktree and never pushes.

A bounded repair, a representative service milestone and full release acceptance
are separate claims. Record the remaining service blocker after a repair closes;
do not enlarge the repair merely to make the whole milestone green.

After the intended commits land, publish the exact HEAD with `npm run publish`
within the task and destination's existing authority. The
[workflow](docs/steering/workflow-guidelines/solver-quests.md#publication-authority)
owns that boundary; the [runbook](docs/development/solver-runbook.md) describes
clean-candidate checks, inert-data rebasing and GitHub post-merge proof.

## Find The Right Surface

| Need | Read / run |
| --- | --- |
| The owner of a concern | [`router.md`](docs/steering/router.md) |
| Quest rules and guardrails | [`solver-quests.md`](docs/steering/workflow-guidelines/solver-quests.md) |
| Examples, Git, recovery, component commands | [`solver-runbook.md`](docs/development/solver-runbook.md) |
| Available project commands | `npm run commands` |
| Open epics and quests | `node scripts/solve.js board` |

Before inventing an operational or proof command, search the
[tools index](docs/steering/generated/tools-index.md); prefer the existing owner.
Ordinary source reads and Git inspection do not require a command-index detour.

Ratchet baselines are one-way: fix, de-export, extract, or simplify instead of
raising them; tighten a baseline when its checker prints the hint.
