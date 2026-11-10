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
  - scripts/publish-head.js
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
  - solve/quests/quest-tooling-*
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
- Current unit: implementation in the isolated worktree
  `/mnt/data/peter/projects/.worktrees/quest-agent-tooling-20261110`, branch
  `work/quest-agent-tooling-20261110`. Q1 landed as `f9da7b04a`; the current
  integration commit is `15be1890a`, including the independently reviewed remote
  formation trend row. All eight Quests
  were sealed against directly observed absent capabilities. The bounded design
  has independent approval. The first canonical landing refused inline values,
  implicit decisions and mutable checker calls before committing. Their owners
  are repaired without baseline changes; independent source review approves the
  updated candidate. Q1 receipt review and canonical landing are complete;
  remaining component closure and composed acceptance remain open.
- Implemented candidate: pinned profile, five project skills, local configuration
  and service lifecycle, real observation capture and shared read-only admission.
  Actual Codex sessions invoked both Serena and Context7. The first host invocation
  omitted project MCP tools; a later run exposed incomplete generated Serena settings.
  Those failures are retained and the configuration producer has been corrected.
  The daemon restart updated Codex to 0.167.1; the old pin refused that host and
  an explicit reviewed profile update now governs current execution. Original
  0.167.0 authoring sessions remain historical, without relabeling.
- Current executed proof: 174 assertions across seven canonical files; real
  setup/configuration-reader evidence; real setup, repeat, upgrade, interruption,
  recovery, worktree/source refresh, service cancellation, removal and ordinary
  Solver execution in a separate Lagrange worktree. Unrelated configuration is
  unchanged and no observed owned process remains alive. The independent reviewer
  also independently passed 48 focused assertions. Changed-path landing audits
  and fast static checks pass. The final actual authoring continuation changed
  only the process owner; its complete source and outputs are retained.
  Raw evidence uses the existing verified release store; compact receipts and
  canonical closure are being completed, not inferred from these counts.
- Integration responsibility: the agent assigned this epic owns its composition;
  existing product Quest owners retain their source and evidence responsibilities.
  No unattended coordinator or scheduler is installed.
- Publication blocker: the exact `15be1890a` publisher gate refused the existing
  duplication ratchets (source/scripts 45 groups and 1,342 lines versus 35/1,109;
  tests 632/23,582 versus 623/23,339). No push occurred. The retained clone reports
  contain no pair involving this epic's changed files. That attribution does not
  waive the full gate or establish publishability of the inherited candidate.
- Next action: finish exact component receipts, canonical landings and separate
  lesson reuse. Q8 retains its real publication requirement; no publication or
  epic completion is inferred from the implemented source or focused proof.
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
- 2026-11-10: implementation scope explicitly includes this epic's eight Quest
  records and the publisher's read-only receipt accessor. The first integration
  landing can retain the remaining open component records without declaring their
  acceptance; only each component's actual canonical landing can solve it.
