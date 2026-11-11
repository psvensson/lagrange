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

- Governing rules: revision 5, initially inspected at source
  `103f132c13268321445369d3b4c1183ca2c39c66`. Implementation remains isolated in
  `/mnt/data/peter/projects/.worktrees/quest-agent-tooling-20261110`, branch
  `work/quest-agent-tooling-20261110`. Unrelated primary-worktree changes are preserved.
- Q1-Q7 canonically landed through
  `c7c7acd89351dda62ef527df53ad1b18556d95bc`. Those closures record their actual
  reviewed source bytes. The later
  [failure-retention repair](../quests/tooling-cleanup-failure-observation-retention/quest.json)
  changes the shared runtime and evidence boundary; the closed component receipts
  remain historical and do not establish current-source acceptance. Q8 remains open.
  Initial source integration landed in `f9da7b04a`; `15be1890a` reconciled the
  existing remote formation trend row without altering tooling source.
- Implemented: five project skills, a pinned profile, worktree-local Serena and
  Context7 configuration/services, explicit setup/upgrade/recovery/removal,
  actual observation capture, verified evidence-store custody and shared read-only
  receipt admission. Existing Quest owners retain workflow and publication authority.
- Executed proof: 174 assertions across seven canonical files, independently
  rechecked 48 focused assertions, actual Codex MCP navigation/documentation,
  and the real SDK/CLI lifecycle in a separate Lagrange worktree. Canonical
  component landings also passed their selected proof. A distinct later session
  retrieved the closed Q1 lesson, inspected current prevention owners and rejected
  stale guidance without rewriting history or creating another memory store.
  The Q7 landing passed 89 selected files and 1,968 runner-reported assertions.
  A further distinct session reused Q7's lesson and found the failure-retention
  gap described below. These counts describe separate executions, not unique or
  cumulative coverage.
- Observed limits remain explicit: JavaScript reference results are partial;
  Context7 did not establish exact-version coverage for installed ws8.21.0;
  lifecycle upgrade proof covers configuration/profile transition, not a new
  upstream dependency version. Other clients and Rust backends remain unmeasured.
- Actual first failures remain retained: missing client tool exposure, incomplete
  generated Serena configuration, process lifetime/invocation defects, and the
  host update to Codex0.167.1. The Q2 landing also caught the added router row
  exceeding the 360-line steering budget by one. Shorter introductory prose
  restored 360; the existing 20-assertion check and full selected proof passed.
  No baseline or acceptance requirement was weakened.
- The successor repair preserves actual command output when process-group cleanup
  refuses and represents native unavailable streams as null with null digests.
  Real permission-denial, timeout and missing-executable controls reproduced the
  original losses. Its current focused proof passed 54 assertions across three
  files; the full capture CLI retained the real native failure and refused positive
  admission. Actual setup and the append-only audit passed. The nested authoring
  session's Git spawn failure remains retained; it did not reproduce in the
  coordinating host's canonical run. Exact review, custody and landing status
  belong to the successor Quest, not to a rewritten closed component.
- Publication remains open: the exact `15be1890a` and `c7c7acd89` publisher gates refused the
  existing duplication ratchets (source/scripts 45 groups and 1,342 lines versus
  35/1,109; tests 632/23,582 versus 623/23,339). No push occurred. Independent
  review confirmed the retained clone reports contain no pair involving this
  epic's changed files. This attribution does not waive the composed gate.
- Remaining for Q8: a publishable composed candidate, fresh affected capability
  proof with explicit reviewed supersession of historical evidence, and an actual
  authoring-to-landing-to-publication journey on that source. The later lesson
  session and failed publication attempts are retained in Q8's evidence store.
  Q8 cannot close without an actual publisher-owned receipt for its pilot commit.
  Source fixes cannot relabel the earlier pilot or its evidence. Product formation,
  durability, release and comparative measurements retain their existing owners;
  this integration has run no comparative system campaign.

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
