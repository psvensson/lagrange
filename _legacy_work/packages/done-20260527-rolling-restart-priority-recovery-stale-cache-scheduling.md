# Rolling restart priority recovery stale cache scheduling

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json",
    "playback": "none",
    "owner": "rebalancer_leader",
    "boundary": "operation_scheduling",
    "dominantReason": "priority_recovery_progress_blocked",
    "currentState": "Fresh rolling-restart evidence selected rebalancer_leader / operation_scheduling / priority_recovery_progress_blocked after benchmark load admission; this package closes the stale local-node-cache scheduling edge.",
    "nextAction": "Allow priority recovery operation creation to bypass empty local node-cache admission when the publication planning snapshot already proves eligible active nodes."
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260527-rolling-restart-priority-recovery-stale-cache-scheduling.md",
      "src/rebalancer/rebalancer-evaluation-methods.js",
      "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/sprints/done-2026-q2-rolling-restart-priority-recovery-resolution.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/active-20260527-rolling-restart-priority-recovery-stale-cache-scheduling.md",
      "src/rebalancer/rebalancer-evaluation-methods.js",
      "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/sprints/done-2026-q2-rolling-restart-priority-recovery-resolution.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the rolling-restart priority recovery resolution sprint by moving the representative frontier past eligible_but_no_operation_created into the next concrete active-gate contract edge."
  },
  "modelFit": {
    "packageClass": "causal-escalation",
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
    "theoryLedgerRefs": [
      "theory-20260526-rolling-restart-rebalancer-outbound-saturation"
    ],
    "theoryLedger": "no ledger update: This package bypasses empty available-node cache during priority recovery operation scheduling; no new theory was added.",
    "proof": {
      "commands": [
        "falsifier: node --test-name-pattern \"checkRebalance lets priority recovery operation creation bypass empty local node cache\" test/rebalancer/unified-rebalancer.test-part-5-2.js # test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
        "regression: node --test test/rebalancer/unified-rebalancer.test-part-5-2.js # test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json",
        "representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --verbose",
        "npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json",
        "npm run work:scenario-triage -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json --markdown",
        "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json --markdown"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "src/rebalancer/rebalancer-evaluation-methods.js",
        "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
  },
  "observablePrediction": {
    "metric": "replica_operations-p1 status",
    "predicted": "replica_operations-p1 moves past eligible_but_no_operation_created and priority recovery operation is scheduled",
    "observed": "replica_operations-p1 successfully moves past eligible_but_no_operation_created and schedules/creates a priority recovery operation; downstream rebalance coordination begins but times out waiting for table partition visibility",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json",
    "metricDelta": 1
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "planning and route selection; split executable children before implementation",
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
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children once execution is unambiguous.",
      "Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected."
    ]
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json",
    "routeOwner": "rebalancer_leader",
    "routeBoundary": "operation_scheduling",
    "routeDominantReason": "priority_recovery_progress_blocked",
    "routeCausalOutcome": "ask_human",
    "stopMode": "insufficient_evidence",
    "nextLane": "causal-escalation",
    "expectedDelta": "rolling-restart setup moves past eligible_but_no_operation_created for replica_operations-p1 and either reaches scenario load or migrates to the next concrete frontier",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json --owner rebalancer_leader --boundary operation_scheduling --dominant-reason priority_recovery_progress_blocked",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "rebalancer_leader",
    "boundary": "operation_scheduling",
    "dominantReason": "priority_recovery_progress_blocked",
    "nextAction": "Prove priority recovery operation creation is admitted from publication planning evidence even when the local node cache is empty or stale."
  },
  "causalGovernance": {
    "hypothesis": "Rolling-restart startup can strand priority recovery at eligible_but_no_operation_created when the rebalancer checks the local available-node cache before consulting the publication-derived priority recovery planning snapshot.",
    "stopConditionCheck": "Run npm run analyze:causal-model to verify the causal model outcomes and that focused proof fails before fix and passes after moving priority recovery operation-creation ahead of local node-cache skip.",
    "expectedCausalModelChange": "The rebalancer_leader operation-scheduling path treats publication-planning eligible nodes as sufficient to enter priority recovery operation creation, instead of waiting for local cache hydration.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh rolling-restart setup evidence reports replica_operations-p1 with effectiveEligibleNodeCount=2, operationCount=0, local snapshot reasons cache_stale_watermark and stale_replica_operations_in_flight, and active wait no progress.",
    "crossBoundaryReview": "Do not change startup readiness, active gate, publication convergence, operation workflow handoff, timeout budgets, or harness behavior from this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart priority recovery stale-cache operation scheduling",
    "phaseChain": [
      "benchmark load admission proof moved rolling-restart past zero-success load admission",
      "fresh representative setup failed before scenario body with priority_recovery_partition_progress",
      "topology evidence selects rebalancer_leader / operation_scheduling with create_recovery_operation required"
    ],
    "currentFirstFrontier": "rebalancer_leader / operation_scheduling / priority_recovery_progress_blocked",
    "knownDownstreamBlockers": [
      "active_gate_snapshot_coverage remains blocked until priority recovery operation creation progresses",
      "startup_readiness_owner inherits active gate no-progress"
    ],
    "missingCausalEdge": "Priority recovery operation creation must bypass the empty local available-node cache when publication planning evidence already supplies eligible active nodes for the blocked priority partition.",
    "missingCausalEdgeProbe": "node --test-name-pattern \"checkRebalance lets priority recovery operation creation bypass empty local node cache\" test/rebalancer/unified-rebalancer.test-part-5-2.js",
    "falsifyingProbe": "node --test-name-pattern \"checkRebalance lets priority recovery operation creation bypass empty local node cache\" test/rebalancer/unified-rebalancer.test-part-5-2.js",
    "boundedProgressProof": "Focused rebalancer proof creates a priority follow-up operation via the bounded progress dispatch mechanism despite empty cache.",
    "boundedProgressProofArtifact": "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "expectedObservableTransition": "replica_operations-p1 no longer remains eligible_but_no_operation_created solely because local available nodes are empty while publication planning has eligible nodes.",
    "maxProgressBound": "one rebalancer_leader / operation_scheduling runtime slice before representative rerun",
    "sameFrontierFallback": "If fresh representative evidence returns the same operation_scheduling frontier with no metric reduction, open/select an autonomous architecture experiment before another local patch.",
    "expectedNextFrontier": "scenario body starts, representative green, or a new concrete frontier after operation creation progresses",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-benchmark-load-admission-runtime.md / startup_readiness_owner / startup_support_evidence / migrated",
      "done-20260527-rolling-restart-diagnostic-dispatch-pending-owner-reentry.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "This package is allowed because fresh evidence moved to a new rebalancer_leader operation-scheduling edge after the load-admission runtime proof.",
    "handoffInvariant": "Operation scheduling may use publication-derived priority recovery eligibility, but must not weaken owner workflow, active-gate, or startup readiness contracts."
  }
}
-->

## Why

Fresh rolling-restart evidence reached `rebalancer_leader / operation_scheduling`
with `priority_recovery_progress_blocked`: publication planning had eligible
active nodes, but the local available-node cache was empty or stale. This
package owns that edge because operation scheduling decides whether eligible
publication-planning evidence is sufficient to create the priority recovery
operation before downstream active-gate evidence is interpreted.

## Scope Basis

Closed successor from the Rolling Restart Priority Recovery Resolution sprint
after benchmark load admission exposed the stale-cache scheduling blocker.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: rebalancer_leader / operation_scheduling creates a priority recovery operation from publication-planning eligibility even when the local node cache is empty for priority_recovery_progress_blocked.
- Inputs/signals: test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json; falsifier: node --test-name-pattern "checkRebalance lets priority recovery operation creation bypass empty local node cache" test/rebalancer/unified-rebalancer.test-part-5-2.js; regression: node --test test/rebalancer/unified-rebalancer.test-part-5-2.js; supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json; representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --verbose; npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json --markdown.
- State model or invariant: The rebalancer_leader / operation_scheduling decision table in the Causal Decision Contract maps priority_recovery_progress_blocked and route evidence to one emitted outcome: allow priority recovery operation creation from publication planning when local cache is empty.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the rebalancer_leader / operation_scheduling invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | rebalancer_leader / operation_scheduling / priority_recovery_progress_blocked | rebalancer_leader owns this decision before downstream consumers reinterpret it | Allow priority recovery operation creation to bypass empty local node-cache admission when the publication planning snapshot already proves eligible active nodes. | rolling-restart setup moves past eligible_but_no_operation_created for replica_operations-p1 and either reaches scenario load or migrates to the next concrete frontier | falsifier: node --test-name-pattern "checkRebalance lets priority recovery operation creation bypass empty local node cache" test/rebalancer/unified-rebalancer.test-part-5-2.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies rebalancer_leader / operation_scheduling directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: node --test-name-pattern "checkRebalance lets priority recovery operation creation bypass empty local node cache" test/rebalancer/unified-rebalancer.test-part-5-2.js`
- Competing explanations: At minimum compare priority_recovery_progress_blocked against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does rebalancer_leader / operation_scheduling still own priority_recovery_progress_blocked, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: priority_recovery_progress_blocked is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: node --test-name-pattern "checkRebalance lets priority recovery operation creation bypass empty local node cache" test/rebalancer/unified-rebalancer.test-part-5-2.js`
- Success metrics: rolling-restart setup moves past eligible_but_no_operation_created for replica_operations-p1 and either reaches scenario load or migrates to the next concrete frontier; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json --owner rebalancer_leader --boundary operation_scheduling --dominant-reason priority_recovery_progress_blocked`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json`
- Expected delta: rolling-restart setup moves past eligible_but_no_operation_created for replica_operations-p1 and either reaches scenario load or migrates to the next concrete frontier
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json`
- Route owner: `rebalancer_leader`
- Route boundary: `operation_scheduling`
- Route dominant reason: `priority_recovery_progress_blocked`
- Route causal outcome: `ask_human`
- Stop mode: `insufficient_evidence`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/done-20260527-rolling-restart-priority-recovery-stale-cache-scheduling.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/done-20260527-rolling-restart-priority-recovery-stale-cache-scheduling.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- rebalancer_leader operation_scheduling`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/done-20260527-rolling-restart-priority-recovery-stale-cache-scheduling.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/rebalancer/rebalancer-evaluation-methods.js
2. test/rebalancer/unified-rebalancer-part-5-2-stage-2.js
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/sprints/done-2026-q2-rolling-restart-priority-recovery-resolution.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/rebalancer/rebalancer-evaluation-methods.js`, `test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/sprints/done-2026-q2-rolling-restart-priority-recovery-resolution.md`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: node --test-name-pattern "checkRebalance lets priority recovery operation creation bypass empty local node cache" test/rebalancer/unified-rebalancer.test-part-5-2.js`, `regression: node --test test/rebalancer/unified-rebalancer.test-part-5-2.js`, `supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json`, `representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: planning and route selection; split executable children before implementation
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Use this package for route selection, owner/boundary decisions, and stop rules.
2. Create Spark-safe mechanical or test-only children once execution is unambiguous.
3. Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected.

## Execution Evidence

theory-ledger: not-needed

no ledger update: This package bypasses empty available-node cache during priority recovery operation scheduling; no new theory was added.

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation falsification; owner: rebalancer_leader; files-changed: none; validation: wrong-slice evidence would be a change in owner/boundary or failure to route; outcome: validated.
- [x] action: implementation; owner: rebalancer_leader; files-changed: src/rebalancer/rebalancer-evaluation-methods.js, test/rebalancer/unified-rebalancer-part-5-2-stage-2.js; validation: falsifier and regression proof; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: rebalancer_leader; files-changed: none; validation: local verification proof; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; parent revalidated focused proof: yes; outcome: validated.

## Validation

1. falsifier: node --test-name-pattern "checkRebalance lets priority recovery operation creation bypass empty local node cache" test/rebalancer/unified-rebalancer.test-part-5-2.js
2. regression: node --test test/rebalancer/unified-rebalancer.test-part-5-2.js
3. supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json
4. representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --verbose
5. npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json
6. npm run work:scenario-triage -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json --markdown
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-benchmark-load-admission-capped-warmup-20260527.report.json --markdown
