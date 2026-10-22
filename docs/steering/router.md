---
audience: agent
last_reviewed: 2026-10-22
---

# Owner router

This table maps each [`rules.md`](rules.md) owner key to its authority; changing
an implementation changes its row, not the rule. Consult only relevant owners.

| Key | Authority | Consult when |
| --- | --- | --- |
| `architecture` | [`architecture/INDEX.md`](../../architecture/INDEX.md) | deciding who owns a concern, or which owners a change touches |
| `owner-interactions` | `coupledPairs` in [`impact-contracts.json`](../../test/shards/impact-contracts.json) and its named witness tests | a change spans two owners |
| `contracts` | [`architecture/contracts/`](../../architecture/contracts/) | changing a boundary's shape, lifecycle, pressure or retry behaviour |
| `generated-artifacts` | the producer named in the artifact's own header; `npm run commands` lists the generators | an artifact looks stale, wrong, or worth editing by hand |
| `guideline-audits` | `npm run audit:guidelines` and the checker each violation names | naming a value, encoding an outcome, or a guideline audit fails |
| `sealed-acceptance` | the quest's own `quest.json` and [`solve-commands.md`](generated/solve-commands.md) | sealing a claim, or judging whether evidence proves one |
| `quest-lifecycle` | the landing guard in [`guards.js`](../../scripts/solve/guards.js), plus [`solve-commands.md`](generated/solve-commands.md) and [`solver-quests.md`](workflow-guidelines/solver-quests.md) | starting, recording, scoping or landing a unit of work |
| `terminal-proof` | `npm run audit:closed-quest-shape` | closing a unit, or deciding what a closed unit keeps |
| `record-history` | `npm run audit:quest-log-append-only` and [`documentation-lifecycle.md`](../development/documentation-lifecycle.md) | correcting recorded evidence or maintaining its current summary |
| `publication` | [`solver-runbook.md`](../development/solver-runbook.md) | landing, publishing, or repairing a red shared branch |
| `action-authority` | [`action-authority.js`](../../scripts/action-authority.js) | taking an action that cannot be taken back, or that leaves this repository |
| `solve-probes` | [`probes.js`](../../scripts/solve/probes.js) and [`probe-guard.js`](../../src/test-helpers/probe-guard.js) | writing a `doneWhen` probe, or a harness that must refuse to run under one |
| `steering` | [`rules.md`](rules.md), this router, `npm run audit:steering-diet` and `npm run audit:rule-set` | adding, moving or removing steering material |

## Conditional material

Load these owners only for the work named. `npm run audit:doc-audience` owns
which paths a public reader may be sent to.

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
| resuming or coordinating a service milestone | the active epic's current summary, using [`documentation-lifecycle.md`](../development/documentation-lifecycle.md) and [`quest-subagents.md`](../development/quest-subagents.md) |
| choosing a physical test runner or continuing a queued run | [`home-lab.md`](../development/home-lab.md) |

## Known owner gap

Repository code asks the action owner and refuses unregistered actions. Workflow
YAML's container publication and public release actions remain registered but
unasked; the push hook decides shared-branch redness separately. No code here
performs force or release-tag pushes, and no guard refuses them.

## When authorities disagree

A person's instruction and the safety limits they set outrank every document
here; nothing in this repository authorises an action they have not. Below
that, the owner named for the concern wins over any document that describes it,
including this one. A generated artifact never wins over its producer. If two
owners both claim a concern, that is an R01 defect: fix the ownership before
the code.

Do not average two authorities or split the difference. State the
contradiction where the work is recorded, then follow the order above.

Current source and receipts establish what exists and what was measured. Steering
establishes required conduct and acceptance. A policy revision does not make an
unimplemented capability available or a missing proof green.
