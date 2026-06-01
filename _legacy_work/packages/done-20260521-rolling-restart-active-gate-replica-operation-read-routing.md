# Rolling Restart Active Gate Replica Operation Read Routing

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-21",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-replica-operation-read-routing-20260521T140906Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Fresh representative evidence remains active_gate_snapshot_coverage after replica-preferred read intent was preserved through the repository and gateway. The nodes path stayed reduced, but playback shows replica_operations owner reads can still spend 11002ms on a stopped seed via cold reconnect before returning ROUTER_CONNECTION_CLOSED, so this package now owns the narrower control-plane recovery read reconnect budget.",
  "nextAction": "Bound disconnected control-plane recovery read candidates so replica_operations owner reads fail fast on stopped seeds, verify focused owner tests, then rerun rolling-restart.",
  "proof": [
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-replica-operation-read-routing-20260521T140906Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "npm test -- test/rebalancer/replica-operation-repository.test.js",
    "npm test -- test/control-plane/control-plane-system-table-gateway.test.js",
    "npm test -- test/query/query-executor.test-part-6.js",
    "git diff --check -- src/admin/admin-websocket-api-segment-3.js test/admin/admin-websocket-api.test.js src/cdc/cdc-integration-service-owner-rpc-read-execution.js test/cdc/authoritative-owner-rpc-sql-fallback.test.js src/query/sql-query-engine-segment-6.js test/query/sql-query-engine.test.js src/query/query-executor-segment-2-part-1.js test/query/query-executor.test-part-6.js src/control-plane/control-plane-system-table-gateway-segment-1.js test/control-plane/control-plane-system-table-gateway.test.js src/rebalancer/replica-operation-repository.js test/rebalancer/replica-operation-repository.test.js"
  ],
  "writeScope": [
    "src/admin/admin-websocket-api-segment-3.js",
    "test/admin/admin-websocket-api.test.js",
    "src/cdc/cdc-integration-service-owner-rpc-read-execution.js",
    "test/cdc/authoritative-owner-rpc-sql-fallback.test.js",
    "src/query/sql-query-engine-segment-6.js",
    "test/query/sql-query-engine.test.js",
    "src/query/query-executor-segment-2-part-1.js",
    "test/query/query-executor.test-part-6.js",
    "src/control-plane/control-plane-system-table-gateway-segment-1.js",
    "test/control-plane/control-plane-system-table-gateway.test.js",
    "src/rebalancer/replica-operation-repository.js",
    "test/rebalancer/replica-operation-repository.test.js",
    "work/packages/todo-20260521-rolling-restart-active-gate-replica-operation-read-routing.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-replica-operation-read-routing-20260521T140906Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "src/admin/admin-websocket-api-segment-3.js",
    "test/admin/admin-websocket-api.test.js",
    "src/cdc/cdc-integration-service-owner-rpc-read-execution.js",
    "test/cdc/authoritative-owner-rpc-sql-fallback.test.js",
    "src/query/sql-query-engine-segment-6.js",
    "test/query/sql-query-engine.test.js",
    "src/query/query-executor-segment-2-part-1.js",
    "test/query/query-executor.test-part-6.js",
    "src/control-plane/control-plane-system-table-gateway-segment-1.js",
    "test/control-plane/control-plane-system-table-gateway.test.js",
    "src/rebalancer/replica-operation-repository.js",
    "test/rebalancer/replica-operation-repository.test.js",
    "work/packages/todo-20260521-rolling-restart-active-gate-replica-operation-read-routing.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "architecture-experiment-ladder/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "The remaining selected snapshot source timeout is caused by replica_operations owner reads attempting a cold reconnect to the stopped seed under the control-plane recovery read budget.",
    "hypothesisDiscriminator": "If disconnected recovery read candidates are the blocker, focused tests will show a disconnected single read candidate receives a reconnect-defer delivery budget and the representative replay will reduce replica_operations seed participant duration; if not, the active gate will remain same-frontier with no participant-duration reduction.",
    "expectedMetric": "replica_operations firstFailedParticipant duration drops below the 11002ms cold-reconnect witness or the representative frontier moves away from replica_operations participant timeouts.",
    "inheritsFrom": "work/packages/done-20260521-rolling-restart-frontier-oscillation-handoff.md",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement discards the experiment or escalates"
  },
  "validationTier": "cross-owner",
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
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-replica-operation-read-routing-20260521T140906Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
      "npm test -- test/rebalancer/replica-operation-repository.test.js",
      "npm test -- test/control-plane/control-plane-system-table-gateway.test.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-replica-operation-read-routing-20260521T140906Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Replica-operation visibility reads no longer spend a cold-reconnect budget on the stopped seed; representative rolling-restart either passes or reports reduced replica_operations participant duration under active_gate_snapshot_coverage.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-replica-operation-read-routing-20260521T140906Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "observablePrediction": {
    "metric": "replica_operations participant timeout class under active_gate_snapshot_coverage",
    "predicted": "Preserving replica-preferred read intent through the control-plane gateway prevents replica_operations visibility reads from spending the full participant budget on the stopped seed.",
    "observed": "rolling-restart-after-replica-operation-read-routing-20260521T140906Z remained active_gate_snapshot_coverage; nodes repair remained reduced but replica_operations firstFailedParticipant still spent 11002ms on the stopped seed with ROUTER_CONNECTION_CLOSED.",
    "accuracy": "missed",
    "evidence": "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-replica-operation-read-routing-20260521T140906Z.report.json plus focused playback grep after canonical tools omitted participant duration",
    "metricDelta": 0
  },
  "causalGovernance": {
    "hypothesis": "The active-gate snapshot timeout persists because selected snapshot observation is waiting on control-plane reads that still route replica_operations visibility queries leader-first to the stopped seed.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-replica-operation-read-routing-20260521T140906Z.report.json",
    "expectedCausalModelChange": "Focused runtime proof bounds disconnected control-plane recovery read candidates; representative rerun either passes, reduces replica_operations participant duration, or moves to the next owner boundary.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh evidence remains active_gate_snapshot_coverage. The nodes repair timeout stayed bounded, but replica_operations owner reads still burned 11002ms on a stopped-seed cold reconnect; the replica-preferred intent hypothesis alone was insufficient.",
    "crossBoundaryReview": "Required across startup active gate, replica operation visibility, control-plane gateway query options, SQL system-table routing, and QueryExecutor candidate timeout accounting."
  },
  "representativeResidual": {
    "status": "live",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-replica-operation-read-routing-20260521T140906Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Bound disconnected control-plane recovery read candidate delivery and rerun rolling-restart."
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
    "missingCausalEdge": "replica_operations visibility reads must treat disconnected control-plane recovery read candidates as deferred reconnect outcomes so selected snapshot observation does not burn the active-gate budget on a stopped seed.",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-after-replica-operation-read-routing-20260521T140906Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "focused repository/gateway/query timeout-delivery proof plus representative rolling-restart rerun",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-replica-operation-read-routing-20260521T140906Z.report.json",
    "falsifyingProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-replica-operation-read-routing-20260521T140906Z.report.json",
    "expectedObservableTransition": "replica_operations stopped-seed cold-reconnect timeout -> deferred reconnect read failure or owner-boundary migration",
    "maxProgressBound": "one local runtime pass plus verifier-fixer before closure",
    "sameFrontierFallback": "if fresh evidence remains same-frontier with no replica_operations participant-duration reduction, stop for architecture or owner migration rather than another local patch",
    "expectedNextFrontier": "representative-green, reduced participant timeout, or migrated owner boundary",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260521-startup-active-gate-admin-snapshot-timeout / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260521-topology-publication-reconcile-system-theory / topology_publication_owner / publication_convergence / same-frontier",
      "done-20260521-rolling-restart-topology-publication-owner-publication-conve / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "fresh route classified local_runtime_owner_fix after bounded timeout reduction",
    "handoffInvariant": "do not widen timeouts or active-gate admission; preserve owner read intent through one canonical gateway/query path"
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

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage; npm test -- test/rebalancer/replica-operation-repository.test.js; npm test -- test/control-plane/control-plane-system-table-gateway.test.js; npm test -- test/query/query-executor.test-part-6.js; git diff --check -- src/admin/admin-websocket-api-segment-3.js test/admin/admin-websocket-api.test.js src/cdc/cdc-integration-service-owner-rpc-read-execution.js test/cdc/authoritative-owner-rpc-sql-fallback.test.js src/query/sql-query-engine-segment-6.js test/query/sql-query-engine.test.js src/query/query-executor-segment-2-part-1.js test/query/query-executor.test-part-6.js src/control-plane/control-plane-system-table-gateway-segment-1.js test/control-plane/control-plane-system-table-gateway.test.js src/rebalancer/replica-operation-repository.js test/rebalancer/replica-operation-repository.test.js; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Finish replica-preferred control-plane read routing for replica_operations, preserve read intent through the control-plane gateway, verify focused owner tests, then rerun rolling-restart. | Replica-operation visibility reads no longer spend a full per-candidate budget on the stopped seed; representative rolling-restart either passes or moves away from replica_operations participant timeouts under active_gate_snapshot_coverage. | npm run work:scenario-route -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
- Success metrics: Replica-operation visibility reads no longer spend a full per-candidate budget on the stopped seed; representative rolling-restart either passes or moves away from replica_operations participant timeouts under active_gate_snapshot_coverage.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.

## Bounded Experiment

- Hypothesis: State the experiment hypothesis before implementation.
- Hypothesis discriminator: Predict the different observable under H1 vs H2 vs H3 before implementation.
- Expected metric: Name the count, frontier, route, or representative result expected to move.
- Inherits from: `none`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement discards the experiment or escalates
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json`
- Expected delta: Replica-operation visibility reads no longer spend a full per-candidate budget on the stopped seed; representative rolling-restart either passes or moves away from replica_operations participant timeouts under active_gate_snapshot_coverage.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json`
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

1. src/admin/admin-websocket-api-segment-3.js
2. test/admin/admin-websocket-api.test.js
3. src/cdc/cdc-integration-service-owner-rpc-read-execution.js
4. test/cdc/authoritative-owner-rpc-sql-fallback.test.js
5. src/query/sql-query-engine-segment-6.js
6. test/query/sql-query-engine.test.js
7. src/query/query-executor-segment-2-part-1.js
8. test/query/query-executor.test-part-6.js
9. src/control-plane/control-plane-system-table-gateway-segment-1.js
10. test/control-plane/control-plane-system-table-gateway.test.js
11. src/rebalancer/replica-operation-repository.js
12. test/rebalancer/replica-operation-repository.test.js
13. work/packages/todo-20260521-rolling-restart-active-gate-replica-operation-read-routing.md
14. work/sprints/current-blocker.json
15. work/sprints/current-blocker.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/admin/admin-websocket-api-segment-3.js`, `test/admin/admin-websocket-api.test.js`, `src/cdc/cdc-integration-service-owner-rpc-read-execution.js`, `test/cdc/authoritative-owner-rpc-sql-fallback.test.js`, `src/query/sql-query-engine-segment-6.js`, `test/query/sql-query-engine.test.js`, `src/query/query-executor-segment-2-part-1.js`, `test/query/query-executor.test-part-6.js`, `src/control-plane/control-plane-system-table-gateway-segment-1.js`, `test/control-plane/control-plane-system-table-gateway.test.js`, `src/rebalancer/replica-operation-repository.js`, `test/rebalancer/replica-operation-repository.test.js`, `work/packages/todo-20260521-rolling-restart-active-gate-replica-operation-read-routing.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`, `npm test -- test/rebalancer/replica-operation-repository.test.js`, `npm test -- test/control-plane/control-plane-system-table-gateway.test.js`, `npm test -- test/query/query-executor.test-part-6.js`, `git diff --check -- src/admin/admin-websocket-api-segment-3.js test/admin/admin-websocket-api.test.js src/cdc/cdc-integration-service-owner-rpc-read-execution.js test/cdc/authoritative-owner-rpc-sql-fallback.test.js src/query/sql-query-engine-segment-6.js test/query/sql-query-engine.test.js src/query/query-executor-segment-2-part-1.js test/query/query-executor.test-part-6.js src/control-plane/control-plane-system-table-gateway-segment-1.js test/control-plane/control-plane-system-table-gateway.test.js src/rebalancer/replica-operation-repository.js test/rebalancer/replica-operation-repository.test.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json --markdown`
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

- [x] implementation: status: validated; evidence: `npm test -- test/query/query-executor.test-part-6.js` passed 79 tests; `git diff --check -- src/query/query-executor-segment-2-part-1.js test/query/query-executor.test-part-6.js` passed; `node scripts/check-guideline-literals.js src/query/query-executor-segment-2-part-1.js` passed; `node scripts/check-guideline-decision-boundaries.js src/query/query-executor-segment-2-part-1.js` passed; representative rerun `test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json` reduced priority residuals to 0 and exposed the services assignment schema blocker; parent revalidated focused proof: yes; next: successor action.
- [x] verification-fix: status: validated; evidence: verifier `019e4b0c-1275-7a01-abbe-f1937ce16617` ran `npm test -- test/query/query-executor.test-part-6.js` and passed 79 tests; changed files: none; parent revalidated focused proof: yes; next: successor action.
- [x] repair: status: validated; evidence: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-recovery-connected-ack-budget-20260521T150001Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out` selected successor package `work/packages/done-20260521-rolling-restart-services-assignment-schema.md`; next: validation.

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage
2. npm test -- test/rebalancer/replica-operation-repository.test.js
3. npm test -- test/control-plane/control-plane-system-table-gateway.test.js
4. npm test -- test/query/query-executor.test-part-6.js
5. git diff --check -- src/admin/admin-websocket-api-segment-3.js test/admin/admin-websocket-api.test.js src/cdc/cdc-integration-service-owner-rpc-read-execution.js test/cdc/authoritative-owner-rpc-sql-fallback.test.js src/query/sql-query-engine-segment-6.js test/query/sql-query-engine.test.js src/query/query-executor-segment-2-part-1.js test/query/query-executor.test-part-6.js src/control-plane/control-plane-system-table-gateway-segment-1.js test/control-plane/control-plane-system-table-gateway.test.js src/rebalancer/replica-operation-repository.js test/rebalancer/replica-operation-repository.test.js
6. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json
7. npm run work:scenario-triage -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json --markdown
8. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-read-budget-reserve-20260521T135041Z.report.json --markdown
