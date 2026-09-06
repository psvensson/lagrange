---
audience: agent
last_reviewed: 2026-09-06
---

# Owner router

Every rule in [`rules.md`](rules.md) names an owner key. This table is the
only place a key becomes a path, so renaming or replacing an implementation
changes one row here and no rule. Consult an owner when the work touches it;
nothing below is read by default.

| Key | Authority | Consult when |
| --- | --- | --- |
| `architecture` | [`architecture/INDEX.md`](../../architecture/INDEX.md) | deciding who owns a concern, or which owners a change touches |
| `owner-interactions` | `coupledPairs` in [`impact-contracts.json`](../../test/shards/impact-contracts.json) and its named witness tests | a change spans two owners |
| `contracts` | [`architecture/contracts/`](../../architecture/contracts/) | changing a boundary's shape, lifecycle, pressure or retry behaviour |
| `generated-artifacts` | the producer named in the artifact's own header; `npm run commands` lists the generators | an artifact looks stale, wrong, or worth editing by hand |
| `guideline-audits` | `npm run audit:guidelines` and the checker each violation names | naming a value, encoding an outcome, or a guideline audit fails |
| `sealed-acceptance` | the quest's own `quest.json` and [`solve-commands.md`](generated/solve-commands.md) | sealing a claim, or judging whether evidence proves one |
| `quest-lifecycle` | [`solve-commands.md`](generated/solve-commands.md) and [`solver-quests.md`](workflow-guidelines/solver-quests.md) | starting, recording, scoping or landing a unit of work |
| `terminal-proof` | `npm run audit:closed-quest-shape` | closing a unit, or deciding what a closed unit keeps |
| `record-history` | `npm run audit:quest-log-append-only` | correcting something already recorded |
| `publication` | [`solver-runbook.md`](../development/solver-runbook.md) | landing, publishing, or repairing a red shared branch |
| `steering` | [`rules.md`](rules.md), this router, and `npm run audit:steering-diet` | adding, moving or removing steering material |

## Conditional material

Loaded only for the work named, never by default. Owner detail lives with its
owner, so these paths sit under `docs/development`, `architecture`, `test/` and
the source tree rather than here. Which of them a public reader may be sent to
is owned by `npm run audit:doc-audience`, not by this table.

| Work | Read |
| --- | --- |
| roadmap scope or a `roadmapRow` | [`agpl-feature-map.md`](../development/agpl-feature-map.md) |
| distributed harness or convergence | [`operational-ground-truth.md`](../../test/distributed/operational-ground-truth.md) |
| writing or changing tests | [`test/guidelines/`](../../test/guidelines/INDEX.md) |
| verifying someone else's change | [`verification-templates/`](../development/verification-templates/INDEX.md) |
| runtime, control-plane or partition behaviour | [`runtime-contracts.md`](../../architecture/runtime-contracts.md) |
| code style, file size, naming | [`code-style.md`](../development/code-style.md) |
| recording, closing or auditing a quest's artifacts | [`quest-artifacts.md`](../development/quest-artifacts.md), [`quest-lifecycle.md`](../development/quest-lifecycle.md), [`quest-closure.md`](../development/quest-closure.md), [`quest-validators.md`](../development/quest-validators.md), [`quest-subagents.md`](../development/quest-subagents.md) |
| proposing or changing roadmap policy | [`roadmap-policy.md`](../development/roadmap-policy.md) |

## When authorities disagree

A person's instruction and the safety limits they set outrank every document
here; nothing in this repository authorises an action they have not. Below
that, the owner named for the concern wins over any document that describes it,
including this one. A generated artifact never wins over its producer. If two
owners both claim a concern, that is an R01 defect: fix the ownership before
the code.

Do not average two authorities or split the difference. State the
contradiction where the work is recorded, then follow the order above.
