---
audience: agent
requires:
  - docs/steering/rules.md
  - docs/steering/router.md
---

# AGENTS

This is the single steering entry point and load order for the **Quest** workflow.

## Steering Load Order

1. Read this file.
2. Read [`rules.md`](docs/steering/rules.md): the cross-cutting invariants you
   can violate merely by not knowing them.
3. Consult [`router.md`](docs/steering/router.md) for the owner of whatever
   the work touches. Nothing else is read by default, and no rule holds the
   detail its owner holds.

Only this file, the rules and router load by default. On starting or resuming,
identify the rule-set revision and source commit; reconcile older handoffs with
the current owners before continuing.

## Choose The Work Unit

Create a Quest for work likely to need more than one measured attempt or to change
an owner-boundary contract. A single-sitting fix, documentation edit or mechanical
change with an obvious proof may be committed directly; see the binding threshold
in [`solver-quests.md`](docs/steering/workflow-guidelines/solver-quests.md).

## Quest Happy Path

```sh
node scripts/solve.js start --id <id>      # seals against a red probe
node scripts/solve.js note --id <id> --attempt "<what changed>"
node scripts/solve.js probe --id <id>
node scripts/solve.js land --id <id>       # guards, npm test, commit; never pushes
```

A Quest has `solve/quests/<id>/quest.json` (statement, epic or `class: fix`, `doneWhen`)
and an append-only `log.ndjson` of findings, attempts, verifications and a terminal
entry. Assigned agents own judgment, independent verification, audit repair and
landing within existing authority. Ask the user only for a missing decision or
authority; the workflow owner defines continuation responsibilities. Source changes
require independent verification (`note --verification ... --verifier subagent:<id>
--verdict approve`). Solver commits only reviewed Quest scope and never pushes.

A bounded repair, a representative service milestone and full release acceptance
are separate claims. Record the remaining service blocker after a repair closes;
do not enlarge the repair merely to make the whole milestone green.

After every intended Quest commit has landed, publish the exact committed HEAD:

```sh
npm run publish
```

The publisher verifies a clean candidate and remote eligibility, then records
HEAD-bound evidence. Its inert-data rebase exception and GitHub post-merge proof
requirements are owned by the [runbook](docs/development/solver-runbook.md).

## Find The Right Surface

| Need | Read / run |
| --- | --- |
| The owner of a concern | [`router.md`](docs/steering/router.md) |
| Quest rules and guardrails | [`solver-quests.md`](docs/steering/workflow-guidelines/solver-quests.md) |
| Examples, Git, recovery, component commands | [`solver-runbook.md`](docs/development/solver-runbook.md) |
| Available project commands | `npm run commands` |
| Open epics and quests | `node scripts/solve.js board` |

Before an ad-hoc repository command, check `npm run commands` and the complete
generated tools index for an existing script.

Ratchet baselines are one-way: fix, de-export, extract, or simplify instead of
raising them; tighten a baseline when its checker prints the hint.
