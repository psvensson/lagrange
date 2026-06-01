# Priority Recovery rebalancer_leader operation_scheduling Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json",
  "playback": "none",
  "owner": "rebalancer_leader",
  "boundary": "operation_scheduling",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Focused proof and verifier-fixer validated that current replica_operations-p1 needs_operation work is prepended ahead of unrelated calculated priority moves. The fresh rolling-restart representative reduced priority recovery residuals to zero and migrated the first frontier to startup_active_gate_owner / snapshot_coverage with active_gate_timed_out.",
  "nextAction": "Close this package as migrated and activate the startup_active_gate_owner / snapshot_coverage successor from test-output/reports/rolling-restart-rebalancer-leader-operation-scheduling-20260523T033000Z.report.json.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "The latest same-frontier workflow package hit its stop rule, and the architecture discriminator selected the rebalancer leader create_recovery_operation witness as the executable edge. Creating or advancing the replica_operations-p1 recovery operation is now the smallest owner-boundary runtime slice that can reduce the serial wait chain before active-gate work resumes.",
  "codeQualityAdmission": {
    "reason": "preserves-owner-outcomes",
    "evidence": "The rebalancer leader owns operation scheduling; this package must create or advance the recovery operation through the owner path instead of reproducing scheduling logic in workflow-progress callers."
  },
  "proof": [
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json",
    "npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js # focused contract fixture and affected consumer proof",
    "npm run audit:guideline:literals -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js ./test/rebalancer/unified-rebalancer-part-5-2-stage-2.js ./test/rebalancer/unified-rebalancer-core-05-test-cases.js",
    "npm run audit:guideline:decision-boundaries -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-rebalancer-leader-operation-scheduling-20260523T033000Z.report.json --fast-local --verbose"
  ],
  "writeScope": [
    "src/rebalancer/unified-rebalancer-segment-5.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-shared.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "test/rebalancer/unified-rebalancer-core-05-test-cases.js",
    "work/packages/done-20260523-priority-recovery-rebalancer-leader-operation-scheduling.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/unified-rebalancer-segment-5.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-shared.js"
  ],
  "commitScope": [
    "src/rebalancer/unified-rebalancer-segment-5.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-shared.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "test/rebalancer/unified-rebalancer-core-05-test-cases.js",
    "work/packages/done-20260523-priority-recovery-rebalancer-leader-operation-scheduling.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "rebalancer_leader",
    "boundary": "operation_scheduling",
    "dominantReason": "eligible_but_no_operation_created",
    "nextAction": "Own replica_operations-p1 create_recovery_operation."
  },
  "observablePrediction": {
    "metric": "rebalancer_leader / operation_scheduling witnessCount and priority_recovery_partition_progress frontier",
    "predicted": "count 1 -> 0 for rebalancer_leader / operation_scheduling, frontier migration to operation_workflow_owner, active_gate_snapshot_coverage, or representative green",
    "observed": "count 1 -> 0 for rebalancer_leader / operation_scheduling; priority recovery residual witnessCount 0; first frontier migrated to startup_active_gate_owner / snapshot_coverage with active_gate_timed_out",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-rebalancer-leader-operation-scheduling-20260523T033000Z.report.json",
    "metricDelta": 1
  },
  "causalGovernance": {
    "hypothesis": "If rebalancer_leader / operation_scheduling creates or advances the replica_operations-p1 recovery operation selected by residual extraction, the serial operation_workflow_owner waits behind control_plane_publications-p1 can reduce, migrate, or expose the next true frontier.",
    "stopConditionCheck": "Run `npm run analyze:causal-model -- test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json` before edits and rerun the fresh representative plus route-after-rerun after focused proof.",
    "expectedCausalModelChange": "The fresh representative should reduce the rebalancer_leader / operation_scheduling witness, reduce the four workflow-progress serial waits, migrate to active_gate_snapshot_coverage, or pass rolling-restart.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh residual has five witnesses and splitRequired=true: four operation_workflow_owner / workflow_progress witnesses serially waiting on operation 197653d6-8154-4c05-819e-be1a138605e0, plus one direct rebalancer_leader / operation_scheduling witness on replica_operations-p1 with nextRequiredAction create_recovery_operation.",
    "crossBoundaryReview": "Keep operation workflow stale-progress wake behavior, publication convergence, startup active-gate snapshot coverage, readiness support, timeout ceilings, and diagnostics grammar frozen. This package only changes rebalancer leader operation scheduling and focused tests."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after stale-progress remote-owner wake and priority recovery event-wait architecture experiment",
    "phaseChain": [
      "publication_ack_convergence is satisfied",
      "stale workflow-progress remote wake focused proof passed",
      "architecture experiment selected rebalancer_leader / operation_scheduling",
      "replica_operations-p1 remains needs_operation / eligible_but_no_operation_created",
      "operation_workflow_owner witnesses are serial waits behind control_plane_publications-p1"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / rebalancer_leader / operation_scheduling / eligible_but_no_operation_created",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / workflow_progress serial waits on control_plane_publications-p1",
      "startup_active_gate_owner / snapshot_coverage remains incomplete with snapshotCoverageNodeCount 2/5",
      "startup_readiness_owner / startup_support_evidence inherits active-gate no-progress state"
    ],
    "missingCausalEdge": "Rebalancer leader operation scheduling must create or advance the recovery operation for replica_operations-p1 when priority recovery reports eligible_but_no_operation_created.",
    "missingCausalEdgeProbe": "npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js",
    "falsifyingProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json",
    "boundedProgressProof": "Focused proof must show the rebalancer leader can create, dispatch, or advance a priority recovery operation for replica_operations-p1 instead of leaving eligible_but_no_operation_created as an event-driven wait.",
    "boundedProgressProofArtifact": "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "expectedObservableTransition": "replica_operations-p1 create_recovery_operation witness reduces, migrates to operation workflow progress, active_gate_snapshot_coverage, or rolling-restart green",
    "maxProgressBound": "one rebalancer leader operation-scheduling cycle for the selected replica_operations-p1 witness",
    "sameFrontierFallback": "If fresh representative evidence remains rebalancer_leader / operation_scheduling with eligible_but_no_operation_created and no concrete movement, stop for architecture instead of another local scheduling patch.",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress reduced/migrated, startup_active_gate_owner / snapshot_coverage, or rolling-restart green",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-priority-recovery-event-wait-architecture-experiment / operation_workflow_owner / workflow_progress / migrated",
      "done-20260512-rolling-restart-rebalancer-leader-operation-scheduling-priority-recovery / rebalancer_leader / operation_scheduling / migrated"
    ],
    "oscillationCheck": "Allowed because the active architecture experiment selected the rebalancer leader create_recovery_operation witness after the workflow-progress package hit its stop rule.",
    "handoffInvariant": "The rebalancer leader owns scheduling and creation of recovery operations; workflow-progress callers only observe or wait for owner outcomes."
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
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json",
      "npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js",
      "npm run audit:guideline:literals -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js ./test/rebalancer/unified-rebalancer-part-5-2-stage-2.js ./test/rebalancer/unified-rebalancer-core-05-test-cases.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "rerun-representative-evidence",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json",
    "routeOwner": "rebalancer_leader",
    "routeBoundary": "operation_scheduling",
    "routeDominantReason": "priority_recovery_progress_blocked",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json --owner rebalancer_leader --boundary operation_scheduling --dominant-reason priority_recovery_progress_blocked",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  }
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

- Canonical outcome: `rebalancer_leader / operation_scheduling` creates or advances the selected priority recovery operation for `replica_operations-p1` when residual evidence reports `eligible_but_no_operation_created`.
- Inputs/signals: fresh residual extraction, the selected `replica_operations-p1` witness, existing rebalancer leader scheduling state, and focused unified rebalancer tests.
- State model or invariant: operation scheduling owns recovery operation creation; workflow-progress witnesses wait for the scheduled operation and must not create recovery work themselves.
- Non-goals and forbidden interpretations: do not change operation workflow stale-progress wake behavior, active-gate snapshot coverage, publication convergence, scenario timeouts, or diagnostics labels.
- Proof mapping: focused rebalancer tests prove create/dispatch/advance behavior, static guardrails protect owner code, and the representative rerun proves reduction, migration, or green.
- Wrong-slice trigger: stop or split if the focused proof requires operation workflow owner, startup active-gate, publication owner, timeout, or diagnostics changes.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| residual extraction | `replica_operations-p1` is `eligible_but_no_operation_created` | rebalancer leader owns `create_recovery_operation` | schedule, create, dispatch, or advance recovery operation | witness reduces, migrates, or representative passes | npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js |
| serial wait chain | workflow-progress witnesses wait on another operation | workflow owner should not reproduce scheduling logic | preserve workflow wait semantics | workflow witnesses reduce only after scheduling progresses | npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json |

- Anti-symptom rationale: this package changes the selected scheduling owner path, not the downstream workflow-progress serial waits or active-gate symptoms.
- Falsifying focused probe: `npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js`
- Competing explanations: workflow wake delivery still fails despite focused proof; residual diagnostics over-promote the rebalancer split; active-gate timeout hides earlier progress.
- Systemic interaction scan: check publication events, priority recovery selection, operation scheduling admission, operation persistence/dispatch, workflow wait consumers, and residual evidence.
- Ping-pong stop rule: unchanged rebalancer_leader / operation_scheduling with no movement after focused proof opens an architecture experiment instead of another local scheduling patch.
- Oscillation guard: the active architecture experiment selected this owner boundary after the same-frontier workflow package; another unchanged representative cannot bounce straight back to workflow-progress implementation.

## Decision Experiment Gate

- Decision question: Does the rebalancer leader schedule/create the recovery operation required by the selected `replica_operations-p1` witness?
- Architecture review: the previous architecture experiment selected this runtime owner boundary; implementation stays local to rebalancer scheduling unless focused proof falsifies the owner.
- Competing hypotheses: scheduling does not create the operation; scheduling creates it but workflow dispatch stalls; diagnostics are stale; active-gate timeout dominates after scheduling progresses.
- Pre-edit focused probe: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json`
- Success metrics: `rebalancer_leader / operation_scheduling` witness count goes `1 -> 0`, the first frontier moves to workflow progress or active-gate, or `rolling-restart` reaches representative green.
- Representative rerun: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-rebalancer-leader-operation-scheduling-20260523T033000Z.report.json --fast-local --verbose`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json`
- Route owner: `rebalancer_leader`
- Route boundary: `operation_scheduling`
- Route dominant reason: `priority_recovery_progress_blocked`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `rerun-representative-evidence`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

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

1. src/rebalancer/unified-rebalancer-segment-5.js
2. src/rebalancer/unified-rebalancer-segment-4-stage-shared.js
3. test/rebalancer/unified-rebalancer-part-5-2-stage-2.js
4. test/rebalancer/unified-rebalancer-core-05-test-cases.js
5. work/packages/done-20260523-priority-recovery-rebalancer-leader-operation-scheduling.md

## Out Of Scope

1. Operation workflow stale-progress wake behavior.
2. Startup active-gate snapshot coverage behavior.
3. Publication convergence behavior.
4. Scenario timeout or guardrail weakening.
5. Unrelated `src/` files outside the declared rebalancer leader scheduling files.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/rebalancer/unified-rebalancer-segment-5.js`, `src/rebalancer/unified-rebalancer-segment-4-stage-shared.js`, `test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`, `test/rebalancer/unified-rebalancer-core-05-test-cases.js`, `work/packages/done-20260523-priority-recovery-rebalancer-leader-operation-scheduling.md`
- Forbidden files: unrelated `src/` files outside `src/rebalancer/unified-rebalancer-segment-5.js` and `src/rebalancer/unified-rebalancer-segment-4-stage-shared.js`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js`
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

- [x] implementation falsification: status: validated; wrong-slice evidence would be a fresh representative that keeps `rebalancer_leader / operation_scheduling` at `eligible_but_no_operation_created` after focused proof shows `replica_operations-p1` is selected ahead of serial-wait priority candidates; evidence: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json` found one direct `replica_operations-p1` create-recovery witness plus four serial workflow waits, and `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json` reported priority recovery operation scheduling event-driven with write-backlog pressure; parent revalidated focused proof: yes; next: add focused regression for independent replica-operations scheduling ahead of serial-wait candidates.
- [x] implementation: status: partial-unvalidated; evidence: `npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js` pass (34 pass, 1 skip), `npm run audit:guideline:literals -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js ./test/rebalancer/unified-rebalancer-part-5-2-stage-2.js ./test/rebalancer/unified-rebalancer-core-05-test-cases.js` pass, `npm run audit:guideline:decision-boundaries -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js` pass, `npm run audit:runtime-grammar:file -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js` pass; files: `src/rebalancer/unified-rebalancer-segment-5.js`, `test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`; parent revalidated focused proof: yes; next: superseded by validated representative migration.
- [x] implementation: status: validated; evidence: parent revalidated `npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js` pass (34 pass, 1 skip), static guardrails pass, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-rebalancer-leader-operation-scheduling-20260523T033000Z.report.json --fast-local --verbose` failed but migrated, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rebalancer-leader-operation-scheduling-20260523T033000Z.report.json` reported witnessCount 0, and `npm run work:evidence-summary -- test-output/reports/rolling-restart-rebalancer-leader-operation-scheduling-20260523T033000Z.report.json` selected startup_active_gate_owner / snapshot_coverage; parent revalidated focused proof: yes; next: close migrated package and open successor.
- [x] verification-fix: status: validated; evidence: `npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js` pass (34 pass, 1 skip), `npm run audit:guideline:literals -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js ./test/rebalancer/unified-rebalancer-part-5-2-stage-2.js ./test/rebalancer/unified-rebalancer-core-05-test-cases.js` pass, `npm run audit:guideline:decision-boundaries -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js` pass, `npm run audit:runtime-grammar:file -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js` pass; changed files: `work/packages/done-20260523-priority-recovery-rebalancer-leader-operation-scheduling.md`; parent revalidated focused proof: yes; next: closure or successor action.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; parent revalidated focused proof: yes; next: closure validation.

## Validation

1. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json
2. npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js
3. npm run audit:guideline:literals -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js ./test/rebalancer/unified-rebalancer-part-5-2-stage-2.js ./test/rebalancer/unified-rebalancer-core-05-test-cases.js
4. npm run audit:guideline:decision-boundaries -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js
5. npm run audit:runtime-grammar:file -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js
6. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-rebalancer-leader-operation-scheduling-20260523T033000Z.report.json --fast-local --verbose
