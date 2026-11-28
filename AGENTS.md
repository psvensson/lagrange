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

Use the [workflow](docs/steering/workflow-guidelines/solver-quests.md) before changing
behavior or proof meaning, including optimizations, filters, caches and defaults.
It owns the Quest threshold, bounded direct route, transition record and proof.
Name the affected decision and production or proof path in the existing work record.

## Quest Records

A Quest has `solve/quests/<id>/quest.json` (statement, epic or `class: fix`, `doneWhen`)
and an append-only `log.ndjson` of findings, attempts, verifications and a terminal
entry. Follow the workflow for assignment, independent source/proof review,
landing and continuation within existing authority. Review the complete candidate
and isolate unrelated changes; Solver collects all changes and never pushes.
Keep [repair, service and release claims separate](test/guidelines/release-gate.md#separate-acceptance-claims).

Publish the intended commits within the task and destination's existing authority.
Use `npm run publish` for normal publication or the runbook's
[documentation-only PR route](docs/development/solver-runbook.md#documentation-only-publication)
when that proof scope applies. The
[workflow](docs/steering/workflow-guidelines/solver-quests.md#publication-authority)
owns that boundary; the [runbook](docs/development/solver-runbook.md) describes
clean-candidate checks, fast-forward-only publication and GitHub post-merge proof.

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
