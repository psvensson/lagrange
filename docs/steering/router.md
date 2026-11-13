---
audience: agent
last_reviewed: 2026-11-13
---

# Owner router

Policy and declared contracts state what is required; enforcement implements
checks, and references explain usage. Consult only the relevant concern.

| Key | Policy or declared contract | Enforcement / reference | Consult when |
| --- | --- | --- | --- |
| `architecture` | [`architecture/INDEX.md`](../../architecture/INDEX.md) | named runtime owners | choosing an owner or affected interaction |
| `owner-interactions` | [`runtime-contracts.md`](../../architecture/runtime-contracts.md) and `coupledPairs` in [`impact-contracts.json`](../../test/shards/impact-contracts.json) | named witness tests | a change affects an interaction |
| `contracts` | [`architecture/contracts/`](../../architecture/contracts/) | the contract's implementation and witnesses | changing boundary semantics |
| `generated-artifacts` | the producer named in the artifact's header under [`documentation-lifecycle.md`](../development/documentation-lifecycle.md) | `npm run commands` lists generators | inspecting or correcting generated material |
| `guideline-audits` | [`code-style.md`](../development/code-style.md) and [`test/guidelines/`](../../test/guidelines/INDEX.md) | `npm run audit:guidelines` and the named checker | naming values, encoding outcomes or repairing an audit |
| `sealed-acceptance` | the quest's `quest.json` and [`release-gate.md`](../../test/guidelines/release-gate.md) | [`quest-validators.md`](../development/quest-validators.md) | sealing or evaluating a claim |
| `quest-lifecycle` | [`solver-quests.md`](workflow-guidelines/solver-quests.md) | [`guards.js`](../../scripts/solve/guards.js), [`solve-commands.md`](generated/solve-commands.md) | starting, recording, scoping or landing work |
| `terminal-proof` | [`quest-closure.md`](../development/quest-closure.md), [`quest-artifacts.md`](../development/quest-artifacts.md) | `npm run audit:closed-quest-shape` | closing work or retaining its evidence |
| `record-history` | [`documentation-lifecycle.md`](../development/documentation-lifecycle.md) | `npm run audit:quest-log-append-only` | correcting evidence or updating a current summary |
| `publication` | [`solver-quests.md`](workflow-guidelines/solver-quests.md#landing-publication-and-continuation) | [`solver-runbook.md`](../development/solver-runbook.md) | landing, publishing or repairing a red shared branch |
| `action-authority` | [`solver-quests.md`](workflow-guidelines/solver-quests.md#publication-authority) under R26 | [`action-authority.js`](../../scripts/action-authority.js) | taking an outward or irreversible action |
| `solve-probes` | [`quest-validators.md`](../development/quest-validators.md) under R27 | [`probes.js`](../../scripts/solve/probes.js), [`src/test-helpers/INDEX.md`](../../src/test-helpers/INDEX.md) | defining a probe or guarded harness |
| `steering` | [`rules.md`](rules.md), this router and [`documentation-lifecycle.md`](../development/documentation-lifecycle.md) | `npm run audit:steering-diet`, `npm run audit:rule-set` | revising steering |

## Conditional material

Load only relevant owners; `npm run audit:doc-audience` governs public links.

| Work | Read |
| --- | --- |
| roadmap scope or a `roadmapRow` | [`agpl-feature-map.md`](../development/agpl-feature-map.md) |
| distributed harness or convergence | [`operational-ground-truth.md`](../../test/distributed/operational-ground-truth.md) |
| writing or changing tests | [`test/guidelines/`](../../test/guidelines/INDEX.md) |
| verifying someone else's change | [`verification-templates/`](../development/verification-templates/INDEX.md) |
| runtime, control-plane or partition behaviour; workflow authority, permits, recovery or a new state store | [`runtime-contracts.md`](../../architecture/runtime-contracts.md); [`authority-and-recovery.md`](../../architecture/contracts/authority-and-recovery.md) |
| code style, file size, naming | [`code-style.md`](../development/code-style.md) |
| recording or retaining Quest artifacts | [`quest-artifacts.md`](../development/quest-artifacts.md) |
| interpreting Quest statuses or preparing a handoff | [`quest-lifecycle.md`](../development/quest-lifecycle.md) |
| closing a Quest or recording blocked, exhausted or superseded work | [`quest-closure.md`](../development/quest-closure.md) |
| choosing probes, validating acceptance or reusing evidence | [`quest-validators.md`](../development/quest-validators.md) |
| delegating work, coordinating roles or arranging independent review | [`quest-subagents.md`](../development/quest-subagents.md) |
| project agent skills, Serena navigation, Context7 documentation, installation or tooling evidence | [`agent-tooling.md`](../development/agent-tooling.md); existing Quest owners retain workflow authority |
| proposing or changing roadmap policy | [`roadmap-policy.md`](../development/roadmap-policy.md) |
| resuming a milestone or selecting the next cutover unit | the active epic's current summary under [`documentation-lifecycle.md`](../development/documentation-lifecycle.md); current correction coordination: [`operation-integrity-and-reliable-formation.md`](../../solve/epics/operation-integrity-and-reliable-formation.md). Follow dated plans only as linked rationale, not live assignments. |
| choosing a physical test runner or continuing a queued run | [`home-lab.md`](../development/home-lab.md) |

## Known owner gap

Guarded repository entrypoints ask the action owner. Workflow YAML's container
publication and public release actions remain registered but unasked; the push
hook decides shared-branch redness separately. Force and release-tag pushes lack
a guard. Command success does not establish operator authorization.

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
