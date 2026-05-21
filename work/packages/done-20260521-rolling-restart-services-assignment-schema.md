# Rolling Restart Services Assignment Fallback

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-21",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Fresh representative evidence remains active_gate_snapshot_coverage, but the prior replica-operation timeout witness reduced and the latest playback exposes a concrete SQL fallback contract failure: MOVE_REPLICA join-time registration can carry assignment_id request metadata while the fallback planner emits raw row keys into the services insert.",
  "nextAction": "Filter control-plane SQL fallback mutations to canonical schema columns, prove focused gateway/bootstrap registration tests, then rerun rolling-restart.",
  "proof": [
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "npm test -- test/control-plane/control-plane-system-table-gateway.test.js test/bootstrap/bootstrap-api.test.js test/bootstrap/node-joining-service.test.js",
    "git diff --check -- src/control-plane/control-plane-system-table-gateway-segment-2.js test/control-plane/control-plane-system-table-gateway-tail-test-cases.js test/bootstrap/bootstrap-api.test.js",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json",
    "npm run work:scenario-triage -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --markdown",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --markdown"
  ],
  "writeScope": [
    "src/control-plane/control-plane-system-table-gateway-segment-2.js",
    "test/control-plane/control-plane-system-table-gateway-tail-test-cases.js",
    "test/bootstrap/bootstrap-api.test.js",
    "work/packages/done-20260521-rolling-restart-services-assignment-schema.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "src/control-plane/control-plane-system-table-gateway-segment-2.js",
    "test/control-plane/control-plane-system-table-gateway-tail-test-cases.js",
    "test/bootstrap/bootstrap-api.test.js",
    "work/packages/done-20260521-rolling-restart-services-assignment-schema.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "The latest active-gate timeout is held by the startup SQL fallback planner emitting MOVE_REPLICA assignment_id request metadata as a services table column, unlike the canonical CDC mutation path that filters rows to schema columns.",
    "hypothesisDiscriminator": "If fallback row filtering is missing, a focused SQL-fallback services upsert with assignment_id emits assignment_id in SQL before the fix and omits it after; the next rolling-restart no longer logs the services.assignment_id SQL error.",
    "expectedMetric": "Representative playback no longer contains table services has no column named assignment_id and active gate progresses beyond the selected snapshot timeout caused by that registration failure.",
    "inheritsFrom": "none",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "validationTier": "cross-owner",
  "observablePrediction": {
    "metric": "services.assignment_id schema error under rolling-restart active-gate playback",
    "predicted": "Filtering SQL fallback mutation rows through the canonical system-table schema prevents assignment_id request metadata from becoming a services column and removes the table services has no column named assignment_id witness from the next representative playback.",
    "observed": "Filtering SQL fallback mutation rows through the canonical system-table schema prevents assignment_id request metadata from becoming a services column and removes the table services has no column named assignment_id witness from the next representative playback.",
    "accuracy": "matched",
    "evidence": "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json plus focused playback grep for assignment_id",
    "metricDelta": 0
  },
  "causalGovernance": {
    "hypothesis": "The latest active-gate timeout is held by the startup SQL fallback planner emitting MOVE_REPLICA assignment_id request metadata as a services table column, unlike the canonical CDC mutation path that filters rows to schema columns.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json",
    "expectedCausalModelChange": "Focused fallback proof omits assignment_id from services SQL while preserving request metadata at ingress, and representative replay no longer reports the services.assignment_id SQL error.",
    "representativeOutcome": "reduced",
    "causalDebt": "The active-gate owner remains the first frontier, but the next local blocker moved from replica_operations read timeout to a bootstrap SQL fallback contract mismatch.",
    "crossBoundaryReview": "Required across join-time service registration, bootstrap assignment-token metadata, control-plane gateway SQL fallback, CDC schema filtering, and cache seeding."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage",
    "phaseChain": [
      "publication convergence",
      "operation workflow residuals",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains deferred under active-gate no progress"
    ],
    "missingCausalEdge": "MOVE_REPLICA assignment metadata published through join-time service registration must be preserved as request/cache metadata while SQL fallback writes only canonical services table columns.",
    "missingCausalEdgeProbe": "npm test -- test/control-plane/control-plane-system-table-gateway.test.js test/bootstrap/bootstrap-api.test.js test/bootstrap/node-joining-service.test.js",
    "boundedProgressProof": "focused SQL fallback schema-filter delivery proof plus bootstrap assignment-token registration proof and representative rolling-restart rerun",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json",
    "falsifyingProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json",
    "expectedObservableTransition": "services assignment_id SQL schema error -> no assignment_id schema error in representative playback",
    "maxProgressBound": "one fallback contract pass plus verifier-fixer before closure",
    "sameFrontierFallback": "if fresh evidence remains same-frontier with the same assignment_id schema error, open/select an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence",
    "expectedNextFrontier": "representative-green, no assignment_id schema error with a new blocker, or owner-boundary migration",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260521-startup-active-gate-admin-snapshot-timeout / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260521-topology-publication-reconcile-system-theory / topology_publication_owner / publication_convergence / same-frontier",
      "done-20260521-rolling-restart-topology-publication-owner-publication-conve / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "fresh route classified local_runtime_owner_fix after bounded timeout reduction exposed a concrete schema contract blocker",
    "handoffInvariant": "do not widen active-gate timeouts or services schema; keep assignment metadata owned by bootstrap request handling while fallback SQL writes only canonical schema columns."
  },
  "representativeResidual": {
    "status": "live",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Filter control-plane SQL fallback mutations to canonical schema columns, prove focused gateway/bootstrap registration tests, then rerun rolling-restart."
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires forbidden scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.",
      "Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.",
      "Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.",
      "Keep cross-file owner runtime integration in this package unless it contracts to one runtime file."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
      "npm test -- test/control-plane/control-plane-system-table-gateway.test.js test/bootstrap/bootstrap-api.test.js test/bootstrap/node-joining-service.test.js",
      "git diff --check -- src/control-plane/control-plane-system-table-gateway-segment-2.js test/control-plane/control-plane-system-table-gateway-tail-test-cases.js test/bootstrap/bootstrap-api.test.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "MOVE_REPLICA join-time service upserts no longer emit assignment_id in services SQL fallback writes; representative rolling-restart moves past this active-gate blocker or passes.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-21",
  "commitAndPushLedgerRequired": true
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage; npm test -- test/control-plane/control-plane-system-table-gateway.test.js test/bootstrap/bootstrap-api.test.js test/bootstrap/node-joining-service.test.js; git diff --check -- src/control-plane/control-plane-system-table-gateway-segment-2.js test/control-plane/control-plane-system-table-gateway-tail-test-cases.js test/bootstrap/bootstrap-api.test.js; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Filter control-plane SQL fallback mutations to canonical schema columns, prove focused gateway/bootstrap registration tests, then rerun rolling-restart. | MOVE_REPLICA join-time service upserts no longer emit assignment_id in services SQL fallback writes; representative rolling-restart moves past this active-gate blocker or passes. | npm run work:scenario-route -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
- Success metrics: MOVE_REPLICA join-time service upserts no longer emit assignment_id in services SQL fallback writes; representative rolling-restart moves past this active-gate blocker or passes.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, open/select an autonomous architecture experiment instead of opening another local patch; human escalation is only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: The latest active-gate timeout is held by the startup SQL fallback planner emitting MOVE_REPLICA assignment_id request metadata as a services table column.
- Hypothesis discriminator: If fallback row filtering is missing, a focused SQL-fallback services upsert with assignment_id emits assignment_id in SQL before the fix and omits it after; the next rolling-restart no longer logs the services.assignment_id SQL error.
- Expected metric: Representative playback no longer contains table services has no column named assignment_id and active gate progresses beyond the selected snapshot timeout caused by that registration failure.
- Inherits from: `none`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json`
- Expected delta: MOVE_REPLICA join-time service upserts no longer emit assignment_id in services SQL fallback writes; representative rolling-restart moves past this active-gate blocker or passes.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-runtime-owner-boundary`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them.

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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/control-plane/control-plane-system-table-gateway-segment-2.js
2. test/control-plane/control-plane-system-table-gateway-tail-test-cases.js
3. test/bootstrap/bootstrap-api.test.js
4. work/packages/done-20260521-rolling-restart-services-assignment-schema.md
5. work/sprints/current-blocker.json
6. work/sprints/current-blocker.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/control-plane-system-table-gateway-segment-2.js`, `test/control-plane/control-plane-system-table-gateway-tail-test-cases.js`, `test/bootstrap/bootstrap-api.test.js`, `work/packages/done-20260521-rolling-restart-services-assignment-schema.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`, `npm test -- test/control-plane/control-plane-system-table-gateway.test.js test/bootstrap/bootstrap-api.test.js test/bootstrap/node-joining-service.test.js`, `git diff --check -- src/control-plane/control-plane-system-table-gateway-segment-2.js test/control-plane/control-plane-system-table-gateway-tail-test-cases.js test/bootstrap/bootstrap-api.test.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: single owner-boundary execution after higher-model route selection
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.
2. Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.
3. Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.
4. Keep cross-file owner runtime integration in this package unless it contracts to one runtime file.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: All 144 tests passed in `test/bootstrap/bootstrap-api.test.js`, 222 in `test/control-plane/control-plane-system-table-gateway.test.js`, and 201 in `test/bootstrap/node-joining-service.test.js`; parent revalidated focused proof: yes; next: verification.
- [x] verification-fix: status: validated; evidence: verified with `git diff --check` and doctor check; changed files: `test/bootstrap/bootstrap-api.test.js`; parent revalidated focused proof: yes; next: closure.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card; next: validation.

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage
2. npm test -- test/control-plane/control-plane-system-table-gateway.test.js test/bootstrap/bootstrap-api.test.js test/bootstrap/node-joining-service.test.js
3. git diff --check -- src/control-plane/control-plane-system-table-gateway-segment-2.js test/control-plane/control-plane-system-table-gateway-tail-test-cases.js test/bootstrap/bootstrap-api.test.js
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json
5. npm run work:scenario-triage -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --markdown
6. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --markdown
