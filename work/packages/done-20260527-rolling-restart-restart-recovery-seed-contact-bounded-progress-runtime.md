# Rolling Restart Restart Recovery Seed Contact Bounded Progress Runtime

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
    "playback": "none",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "seed_contact_bounded_progress",
    "currentState": "The H1 discriminator selected restarted durable rejoin stuck in contacting_seed with no bootstrap response before the 120000ms restart recovery gate.",
    "nextAction": "Repair bootstrap seed-contact/request bounded progress so durable rejoin receives a bootstrap response or retryable bootstrap-not-ready before the rolling-restart recovery gate expires.",
    "predecessor": "work/packages/done-20260527-rolling-restart-restart-recovery-seed-contact-readiness-experiment.md",
    "closed": "2026-05-27",
    "successor": "work/packages/done-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260527-rolling-restart-restart-recovery-seed-contact-bounded-progress-runtime.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md",
      "work/packages/done-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md",
      "work/packages/done-20260527-rolling-restart-restart-recovery-seed-contact-readiness-experiment.md",
      "src/bootstrap/owners/bootstrap-request-owner-handler.js",
      "test/bootstrap/bootstrap-request-execution-timeout.test.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/bootstrap/owners/bootstrap-request-owner-handler.js",
      "src/bootstrap/phases/contact-seed-phase.js",
      "src/bootstrap/owners/bootstrap-request-owner.js",
      "test/bootstrap/bootstrap-request-execution-timeout.test.js"
    ],
    "commitScope": [
      "work/packages/active-20260527-rolling-restart-restart-recovery-seed-contact-bounded-progress-runtime.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md",
      "work/packages/done-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md",
      "work/packages/done-20260527-rolling-restart-restart-recovery-seed-contact-readiness-experiment.md",
      "src/bootstrap/owners/bootstrap-request-owner-handler.js",
      "test/bootstrap/bootstrap-request-execution-timeout.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/bootstrap/bootstrap-request-execution-timeout.test.js (contract fixture: pre-admission client-deadline budget transitions seed contact to deferred BOOTSTRAP_NOT_READY before joiner timeout)",
        "regression: npm test -- test/bootstrap/node-joining-service.test-part-7.js test/bootstrap/node-joining-service.test-part-8.js (affected consumer proof: contact-seed consumer preserves retryable deferred bootstrap-not-ready/timeout evidence)",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason seed_contact_bounded_progress",
        "supporting: npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json"
      ]
    }
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.",
      "Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.",
      "Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.",
      "Keep cross-file owner runtime integration in this package unless it contracts to one runtime file."
    ]
  },
  "representativeResidual": {
    "status": "active",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
    "frontier": "startup_readiness_owner / startup_support_evidence",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "seed_contact_bounded_progress",
    "nextAction": "Repair bootstrap request pre-admission bounded progress so durable rejoin seed contact receives a response or retryable deferred outcome before the recovery gate expires."
  },
  "observablePrediction": {
    "metric": "pre-admission bootstrap request client-deadline bounded progress",
    "predicted": "Focused fixture returns canonical BOOTSTRAP_NOT_READY with CLIENT_ATTEMPT_DEADLINE_EXHAUSTED before the failsafe while no admission slot or downstream assignment work is claimed; affected contact-seed consumer proof remains retryable/deferred.",
    "observed": "Focused bootstrap request fixture returned canonical BOOTSTRAP_NOT_READY with CLIENT_ATTEMPT_DEADLINE_EXHAUSTED before the failsafe and the affected node-joining consumer proof passed; fresh rolling-restart still failed and migrated to active_gate_snapshot_coverage evidence_missing.",
    "accuracy": "partial",
    "evidence": "npm test -- test/bootstrap/bootstrap-request-execution-timeout.test.js; npm test -- test/bootstrap/node-joining-service.test-part-7.js test/bootstrap/node-joining-service.test-part-8.js; test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json"
  },
  "causalGovernance": {
    "hypothesis": "The restarted durable rejoin remains in contacting_seed because bootstrap request pre-admission readiness work can outlive the joiner client attempt deadline, so the seed does not return a canonical retryable bootstrap-not-ready response before the rolling-restart recovery gate expires.",
    "stopConditionCheck": "The predecessor experiment selected H1 from canonical evidence, `npm run analyze:causal-model -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json`, and playback logs; before runtime edits, this package must prove the pre-admission deadline contract with a focused bootstrap request fixture and affected contact-seed consumer proof.",
    "expectedCausalModelChange": "Durable rejoin seed contact should move from no bootstrap response before recovery timeout to a bounded bootstrap response or retryable BOOTSTRAP_NOT_READY/deferred owner outcome; the representative rerun should pass, reduce, or migrate to a new named frontier.",
    "representativeOutcome": "migrated",
    "causalDebt": "Rolling restart still fails with restarted-node admin_reachability_refused while the node is alive by bootstrap health but stuck in INIT/contacting_seed with control_snapshot_authority_unavailable.",
    "crossBoundaryReview": "Only bootstrap request pre-admission bounded progress is promoted here; active-gate report attachment, heartbeat publication, operation workflow, transport, and generic timeout budgets stay frozen unless fresh proof migrates ownership."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart restarted durable rejoin seed contact",
    "phaseChain": [
      "startup readiness support proof passed locally",
      "fresh rolling-restart still failed restarted-node admin readiness",
      "bounded experiment selected H1 seed-contact/no bootstrap response before readiness heartbeat publication or report attachment"
    ],
    "currentFirstFrontier": "startup_readiness_owner / startup_support_evidence / seed_contact_bounded_progress",
    "knownDownstreamBlockers": [
      "active-gate report coverage remains incomplete in the canonical report",
      "restarted node remains reachable by bootstrap health but not admin-ready"
    ],
    "missingCausalEdge": "Bootstrap request pre-admission work must honor the joiner client attempt deadline and return canonical retryable BOOTSTRAP_NOT_READY instead of letting contact-seed consume the recovery gate without a response.",
    "missingCausalEdgeProbe": "npm test -- test/bootstrap/bootstrap-request-execution-timeout.test.js",
    "falsifyingProbe": "npm test -- test/bootstrap/bootstrap-request-execution-timeout.test.js",
    "boundedProgressProof": "Focused bootstrap request execution fixture proves client-deadline timeout/deferred retry behavior, plus node-joining contact-seed consumer proof.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
    "expectedObservableTransition": "Durable rejoin receives a bounded bootstrap response or retryable bootstrap-not-ready before the joiner HTTP/restart recovery gate expires.",
    "maxProgressBound": "one bootstrap request pre-admission bounded-progress runtime slice",
    "sameFrontierFallback": "If fresh rolling-restart returns the same seed-contact/admin-refused frontier with no concrete reduction, open/select an autonomous architecture experiment before another startup readiness runtime patch.",
    "expectedNextFrontier": "representative-green, reduced startup readiness support, or a new named owner boundary",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-startup-readiness-admin-reachability-support.md / startup_readiness_owner / startup_support_evidence / migrated",
      "done-20260527-rolling-restart-startup-readiness-admin-reachability-refused-runtime.md / startup_readiness_owner / startup_support_evidence / migrated",
      "done-20260527-rolling-restart-restart-recovery-seed-contact-readiness-experiment.md / startup_readiness_owner / startup_support_evidence / migrated"
    ],
    "oscillationCheck": "Allowed only under causal-escalation because the predecessor experiment selected a narrower H1 seed-contact mechanism and this package names one focused runtime slice.",
    "handoffInvariant": "Do not change active-gate, heartbeat publication, operation workflow, transport, or generic timeout policy in this package."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json",
    "routeOwner": "startup_readiness_owner",
    "routeBoundary": "startup_support_evidence",
    "routeDominantReason": "seed_contact_bounded_progress",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "causal-escalation",
    "expectedDelta": "Durable rejoin seed contact receives a bounded bootstrap response or retryable bootstrap-not-ready before the joiner HTTP/restart recovery gate expires; focused proof covers pre-admission client deadline budget.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason seed_contact_bounded_progress",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason evidence_missing",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the frontier has oscillated through startup readiness, but the predecessor experiment selected one narrower seed-contact bounded-progress mechanism and this package names the focused runtime contract and proof ladder.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_readiness_owner / startup_support_evidence emits the package outcome for seed_contact_bounded_progress.
- Inputs/signals: test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json; falsifier: npm test -- test/bootstrap/bootstrap-request-execution-timeout.test.js (contract fixture: pre-admission client-deadline budget transitions seed contact to deferred BOOTSTRAP_NOT_READY before joiner timeout); regression: npm test -- test/bootstrap/node-joining-service.test-part-7.js test/bootstrap/node-joining-service.test-part-8.js (affected consumer proof: contact-seed consumer preserves retryable deferred bootstrap-not-ready/timeout evidence); supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason seed_contact_bounded_progress; supporting: npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json; supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json.
- State model or invariant: The startup_readiness_owner / startup_support_evidence decision table in the Causal Decision Contract maps seed_contact_bounded_progress and route evidence to one emitted outcome: pending-before-rerun.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_readiness_owner / startup_support_evidence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_readiness_owner / startup_support_evidence / seed_contact_bounded_progress | startup_readiness_owner owns this decision before downstream consumers reinterpret it | Repair bootstrap seed-contact/request bounded progress so durable rejoin receives a bootstrap response or retryable bootstrap-not-ready before the rolling-restart recovery gate expires. | Durable rejoin seed contact receives a bounded bootstrap response or retryable bootstrap-not-ready before the joiner HTTP/restart recovery gate expires; focused proof covers pre-admission client deadline budget. | falsifier: npm test -- test/bootstrap/bootstrap-request-execution-timeout.test.js (contract fixture: pre-admission client-deadline budget transitions seed contact to deferred BOOTSTRAP_NOT_READY before joiner timeout) |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_readiness_owner / startup_support_evidence directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm test -- test/bootstrap/bootstrap-request-execution-timeout.test.js` (contract fixture: pre-admission client-deadline budget transitions seed contact to deferred BOOTSTRAP_NOT_READY before joiner timeout)
- Competing explanations: At minimum compare seed_contact_bounded_progress against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_readiness_owner / startup_support_evidence still own seed_contact_bounded_progress, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: seed_contact_bounded_progress is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm test -- test/bootstrap/bootstrap-request-execution-timeout.test.js` (contract fixture: pre-admission client-deadline budget transitions seed contact to deferred BOOTSTRAP_NOT_READY before joiner timeout)
- Success metrics: Durable rejoin seed contact receives a bounded bootstrap response or retryable bootstrap-not-ready before the joiner HTTP/restart recovery gate expires; focused proof covers pre-admission client deadline budget.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason seed_contact_bounded_progress`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json`
- Expected delta: Durable rejoin seed contact receives a bounded bootstrap response or retryable bootstrap-not-ready before the joiner HTTP/restart recovery gate expires; focused proof covers pre-admission client deadline budget.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json`
- Route owner: `startup_readiness_owner`
- Route boundary: `startup_support_evidence`
- Route dominant reason: `seed_contact_bounded_progress`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/packages/active-20260527-rolling-restart-restart-recovery-seed-contact-bounded-progress-runtime.md
2. work/sprints/current-blocker.md
3. work/sprints/current-blocker.json
4. work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md
5. src/bootstrap/owners/bootstrap-request-owner-handler.js
6. test/bootstrap/bootstrap-request-execution-timeout.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260527-rolling-restart-restart-recovery-seed-contact-bounded-progress-runtime.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md`, `src/bootstrap/owners/bootstrap-request-owner-handler.js`, `test/bootstrap/bootstrap-request-execution-timeout.test.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/bootstrap/bootstrap-request-execution-timeout.test.js` (contract fixture: pre-admission client-deadline budget transitions seed contact to deferred BOOTSTRAP_NOT_READY before joiner timeout), `regression: npm test -- test/bootstrap/node-joining-service.test-part-7.js test/bootstrap/node-joining-service.test-part-8.js` (affected consumer proof: contact-seed consumer preserves retryable deferred bootstrap-not-ready/timeout evidence), `supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason seed_contact_bounded_progress`, `supporting: npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json`, `supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: single owner-boundary execution after higher-model route selection
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.
2. Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.
3. Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.
4. Keep cross-file owner runtime integration in this package unless it contracts to one runtime file.

## Execution Evidence

theory-ledger: not-needed

theory-ledger not-applicable: related historical startup readiness theories are advisory; this package implements the freshly distinguished H1 seed-contact bounded-progress edge from the current artifact and will record a new theory only if representative evidence after the fix supports or falsifies this mechanism.

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: src/bootstrap/owners/bootstrap-request-owner-handler.js,test/bootstrap/bootstrap-request-execution-timeout.test.js; validation: npm test -- test/bootstrap/bootstrap-request-execution-timeout.test.js passed; npm test -- test/bootstrap/node-joining-service.test-part-7.js test/bootstrap/node-joining-service.test-part-8.js passed; static guardrails passed; representative rerun test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json migrated to startup_active_gate_owner/snapshot_coverage evidence_missing; parent revalidated focused proof: yes; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: Verifier pass rechecked focused tests, guardrails, and canonical route; no additional in-scope fixes after migration result; parent revalidated focused proof: yes; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json,work/sprints/current-blocker.md; validation: npm run work:repair; parent revalidated focused proof: yes; outcome: validated.

## Validation

1. falsifier: npm test -- test/bootstrap/bootstrap-request-execution-timeout.test.js (contract fixture: pre-admission client-deadline budget transitions seed contact to deferred BOOTSTRAP_NOT_READY before joiner timeout)
2. regression: npm test -- test/bootstrap/node-joining-service.test-part-7.js test/bootstrap/node-joining-service.test-part-8.js (affected consumer proof: contact-seed consumer preserves retryable deferred bootstrap-not-ready/timeout evidence)
3. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason seed_contact_bounded_progress
4. supporting: npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json
5. supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-reachability-refused-20260527T144728Z.report.json

## Commit And Push Ledger

1. Focused package commit: 3b2bc6bd6d31e034f3c9a10ec60144842593c562
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
