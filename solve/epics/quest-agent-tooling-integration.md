---
id: quest-agent-tooling-integration
status: open
proof: certification
roadmapRow: null
graduatesTo: solve/specs/quest-agent-tooling-integration/implementation-plan.md
doneWhen:
  probe: script
  args:
    command: node scripts/checks/quest-agent-tooling-acceptance.js --metric
quests:
  - quest-tooling-owner-and-profile
  - quest-tooling-serena-navigation
  - quest-tooling-systematic-investigation
  - quest-tooling-review-and-evidence
  - quest-tooling-verified-learning
  - quest-tooling-versioned-documentation
  - quest-tooling-lifecycle-and-upgrades
  - quest-tooling-real-pilot-acceptance
authorizes:
  - .agents/skills/quest-*
  - .codex
  - scripts/agent-tooling
  - scripts/quest-evidence
  - scripts/checks/quest-agent-tooling-*
  - scripts/solve
  - test/scripts
  - test/solve
  - test/shards
  - docs/development/agent-tooling.md
  - docs/development/verification-templates
  - docs/development/documentation-lifecycle.md
  - docs/steering/router.md
  - docs/steering/tool-descriptions.json
  - docs/steering/generated
  - solve/epics/README.md
  - solve/specs/quest-agent-tooling-integration
  - package.json
  - package-lock.json
  - .gitignore
---

# Quest agent tooling integration

Improve how agents understand code, investigate failures, review changes and reuse
verified lessons by integrating selected Superpowers and Compound Engineering
skills with Serena and Context7. Epics and Quests retain scope, history,
acceptance, independent review and publication authority. The implementation
contract is the [detailed plan](../specs/quest-agent-tooling-integration/implementation-plan.md);
this epic owns coordination and its current summary.

## Current integration summary

- Governing rules: revision 5, inspected at source
  `103f132c13268321445369d3b4c1183ca2c39c66`, branch
  `work/canonical-authority-epic-20261110`, 2026-11-10T20:22:07Z.
  The working tree contains unrelated runtime and evidence work; it is preserved.
- Current unit: planning. Eight linked Quest records are unsealed drafts.
  No plugin installation, activation, implementation, pilot or acceptance result
  is established by this planning change.
- First demonstrated gap: no measured project integration is supplied with this
  plan. The declared composed checker is proposed work in Q4 and does not exist
  yet; the epic probe is non-measuring, never accepted, until that work exists.
- Integration responsibility: the agent assigned this epic owns its composition;
  existing product Quest owners retain their source and evidence responsibilities.
  No background agent, installation or run has been scheduled.
- Next action: Q1's implementation owner inventories the actual host and upstream
  revisions, reviews the bounded integration contract, prepares a real negative
  witness and seals Q1 through the current Solver. Other drafts are refined and
  sealed only when their proof machinery can measure the declared claim.
- Scope and lifecycle follow current `scripts/solve/schema.js`, AGENTS and routed
  owners. The older epic README describes retired commands and a contradictory
  no-status format; Q1 reconciles that guidance with the current owners.

## Work packages and dependency order

| Quest | Result | Depends on | Relative difficulty |
| --- | --- | --- | --- |
| [Q1](../quests/quest-tooling-owner-and-profile/quest.json) | Owned, pinned project integration | None | Medium |
| [Q2](../quests/quest-tooling-serena-navigation/quest.json) | Real symbol and reference navigation | Q1 | Medium |
| [Q3](../quests/quest-tooling-systematic-investigation/quest.json) | Systematic, contract-first investigation | Q1, Q2 | Medium |
| [Q4](../quests/quest-tooling-review-and-evidence/quest.json) | Independent review and evidence admission | Q1 | High |
| [Q5](../quests/quest-tooling-verified-learning/quest.json) | Verified lesson capture and later reuse | Q3, Q4 | Medium |
| [Q6](../quests/quest-tooling-versioned-documentation/quest.json) | Version-bound external documentation | Q1 | Medium |
| [Q7](../quests/quest-tooling-lifecycle-and-upgrades/quest.json) | Setup, update, failure and removal behavior | Q2-Q6 | Medium |
| [Q8](../quests/quest-tooling-real-pilot-acceptance/quest.json) | Actual Quest journey and composed acceptance | Q1-Q7 | High |

After Q1, Q2, Q4 and Q6 can progress on independent interactions. Q3 follows Q2;
Q5 follows Q3 and Q4; Q7 precedes the final Q8 pilot. One writer owns shared
configuration, evidence admission and any changed interaction. These dependencies
are coordination instructions, not a new scheduler. Missing external execution
does not stop other authorized work or become an invented pass.

## Acceptance boundary

The epic checker must revalidate retained component and pilot evidence, reject
missing or inconsistent provenance, and print zero only when the complete
[acceptance contract](../specs/quest-agent-tooling-integration/implementation-plan.md#composed-acceptance-and-evidence)
holds. It reads local retained artifacts only; it never launches agents, MCP
services, tests, network requests or lab runs. Live work belongs to attempts.

A real supported-client journey, a later lesson-reuse session, independent review
and the applicable canonical gates are required. Installation, prompt wording,
test counts, receipt flags and a plugin's own approval cannot establish acceptance.
This certifies the tooling workflow; formation, native durability, release and
comparative system performance retain their existing separate proof owners.

## Existing work and authority

Reuse [contract-first authoring](../quests/contract-first-authoring-and-producer-fidelity/quest.json),
[content-bound review](../quests/content-bound-review-and-interaction-proof/quest.json)
and the [code navigation initiative](code-navigability-and-mistake-resistance.md).
The [earlier workflow landscape](continuous-ai-workflow-landscape.md) is historical
research, not evidence of present plugin support or performance. Product repairs,
repository-wide legacy/fallback removal and benchmark readiness remain with their
current owners.

## Decision log

- 2026-11-10: user requested this detailed implementation epic after the plugin
  assessment. Create planning records and proof obligations; do not install or
  activate integrations as part of drafting.
- 2026-11-10: use selected capabilities under the existing Quest workflow; adapt
  conflicting upstream approval, task-ledger, baseline and memory behavior.
  Initial end-to-end acceptance targets Codex CLI. Additional clients require
  separately measured support; upstream compatibility claims are insufficient.
- 2026-11-10: retain the absolute prohibition on mock, fake or emulated comparative
  system measurements. Do not create placeholder results or bootstrap receipts.
  Any benefit comparison of the tooling itself must also use actual observations.
