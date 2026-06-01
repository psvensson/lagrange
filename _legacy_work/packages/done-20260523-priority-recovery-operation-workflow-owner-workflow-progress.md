# Priority Recovery operation_workflow_owner workflow_progress Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Focused proof validated the stale-progress remote-owner wake edge, but the fresh rolling-restart representative stayed same-frontier with four operation_workflow_owner / workflow_progress witnesses on operation 197653d6-8154-4c05-819e-be1a138605e0 plus the rebalancer_leader / operation_scheduling split. Causal analysis classified the wait as backpressure, so this package stops local workflow-progress patching and migrates to an autonomous architecture experiment.",
  "nextAction": "Supersede this local runtime package with work/packages/done-20260523-rolling-restart-priority-recovery-event-wait-architecture-experiment.md before opening another runtime patch.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "This advances the current first frontier priority_recovery_partition_progress for the active rolling-restart sprint: the current artifact has a single operation id holding the first four priority-recovery witnesses and their serial waits. Proving the owner wake edge is the smallest runtime slice that can reduce those witnesses before addressing the remaining rebalancer_leader / operation_scheduling split.",
  "codeQualityAdmission": {
    "reason": "prevents-regression",
    "evidence": "The focused proof must preserve typed stale-progress owner outcomes while making the remote-owned stale progress path wake the remote operation owner instead of silently retaining publication progress locally."
  },
  "proof": [
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js test/rebalancer/operation-workflow-owner-decision.test.js",
    "npm run audit:guideline:literals -- src/rebalancer/operation-lifecycle.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-recovery-reconcile.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js ./test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js ./test/rebalancer/operation-workflow-owner-adapter.test.js ./test/rebalancer/operation-workflow-owner-decision.test.js",
    "npm run audit:guideline:decision-boundaries -- src/rebalancer/operation-lifecycle.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-recovery-reconcile.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/operation-lifecycle.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-recovery-reconcile.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json --fast-local --verbose"
  ],
  "writeScope": [
    "src/rebalancer/operation-lifecycle.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-recovery-reconcile.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "work/packages/done-20260523-priority-recovery-operation-workflow-owner-workflow-progress.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-constants.js",
    "src/rebalancer/operation-workflow-recovery-reconcile.js"
  ],
  "commitScope": [
    "src/rebalancer/operation-lifecycle.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-recovery-reconcile.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "work/packages/done-20260523-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
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
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "planning and route selection; split executable children before implementation",
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
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children once execution is unambiguous.",
      "Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json",
      "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js test/rebalancer/operation-workflow-owner-decision.test.js"
    ],
    "decisionRecord": "Keep this package on the operation_workflow_owner / workflow_progress residual unless fresh representative evidence removes it, reduces it, or promotes a different owner boundary.",
    "successorAction": "update-current-package",
    "runtimePromotionRule": "If the stale-progress wake proof is green but the representative artifact remains same-frontier with no witness reduction, stop for autonomous architecture experiment rather than another local workflow-progress patch."
  },
  "requiredPreImplProbe": {
    "command": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json",
    "artifact": "test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json",
    "reason": "Residual extraction identifies the selected operation_workflow_owner / workflow_progress witness group and the downstream rebalancer_leader split before runtime edits."
  },
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Open/select an autonomous architecture experiment before another local workflow-progress runtime package."
  },
  "observablePrediction": {
    "metric": "operation_workflow_owner / workflow_progress witnessCount",
    "predicted": "count 4 -> 0 or migration to rebalancer_leader / operation_scheduling, active_gate_snapshot_coverage, or representative green after remote-owner stale-progress wake proof",
    "observed": "same-frontier no reduction; witnessCount stayed 4 for operation_workflow_owner / workflow_progress and rolling-restart stayed red",
    "accuracy": "missed",
    "evidence": "test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json",
    "metricDelta": 0
  },
  "causalGovernance": {
    "hypothesis": "A stale dispatch-pending workflow progress event for a remote-owned operation is reconciled locally instead of waking the remote operation owner. That leaves control_plane_publications-p1 persisted_not_dispatched and holds three serial wait witnesses behind operation b993e0f0-72f1-481e-a36a-2c02b7895063.",
    "stopConditionCheck": "Focused proof must show stale progress resolves to the stale-progress canonical outcome while dispatching the remote-owner wake effect. Fresh representative evidence must reduce the four workflow_progress witnesses, migrate to the rebalancer_leader split, or pass rolling-restart; `npm run analyze:causal-model` on the fresh artifact must not classify unchanged same-frontier evidence as another local workflow-progress patch.",
    "expectedCausalModelChange": "The focused owner proof should produce RECONCILE_STALE_PROGRESS_COMMAND and remote owner wake delivery for non-local stale progress. The representative rerun should reduce operation_workflow_owner / workflow_progress witnessCount below 4, migrate to rebalancer_leader / operation_scheduling, expose active_gate_snapshot_coverage as next frontier, or pass rolling-restart.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Fresh residual still has witnessCount=5 and splitRequired=true: four operation_workflow_owner / workflow_progress witnesses on control_plane_publications-p1 and serial waits for operation 197653d6-8154-4c05-819e-be1a138605e0, plus one rebalancer_leader / operation_scheduling eligible_but_no_operation_created witness. Causal analysis selected accept_classified_backpressure.",
    "crossBoundaryReview": "Keep publication convergence, startup active-gate snapshot coverage, owner queue bounded-defer behavior, readiness support, rebalancer leader operation creation, timeout ceilings, and guardrail scan scope frozen. This package only changes operation workflow stale-progress effect dispatch and the owner-port reconciliation path."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after selected transport-closed observation contract",
    "phaseChain": [
      "selected transport-closed observation contract improved snapshotCoverageNodeCount from 1/5 to 2/5",
      "publication_ack_convergence is satisfied",
      "priority_recovery_partition_progress is the first frontier",
      "control_plane_publications-p1 persisted_not_dispatched holds three serial wait witnesses",
      "one rebalancer_leader / operation_scheduling split remains behind the workflow-progress group"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "rebalancer_leader / operation_scheduling has replica_operations-p1 eligible_but_no_operation_created",
      "startup_active_gate_owner / snapshot_coverage remains incomplete with snapshotCoverageNodeCount=2/5 after priority recovery closes",
      "startup_readiness_owner / startup_support_evidence inherits the active-gate no-progress state"
    ],
    "missingCausalEdge": "Stale workflow-progress reconciliation must preserve the canonical stale-progress outcome while waking the remote operation owner when the selected operation is not locally owned.",
    "missingCausalEdgeProbe": "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js test/rebalancer/operation-workflow-owner-decision.test.js",
    "falsifyingProbe": "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js test/rebalancer/operation-workflow-owner-decision.test.js",
    "boundedProgressProof": "Focused tests must show stale progress maps to RECONCILE_STALE_PROGRESS_COMMAND, remote-owned stale progress schedules/delivers a remote owner wake, and local stale progress still reconciles through the owner.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json",
    "expectedObservableTransition": "operation_workflow_owner / workflow_progress witnessCount drops below 4, owner boundary migrates to rebalancer_leader / operation_scheduling or active_gate_snapshot_coverage, snapshotCoverageNodeCount increases beyond 2/5, or rolling-restart passes.",
    "maxProgressBound": "one operation workflow stale-progress remote wake edge; no timeout widening, no active-gate promotion, and no rebalancer leader scheduling changes in this package",
    "sameFrontierFallback": "If fresh representative evidence remains operation_workflow_owner / workflow_progress with witnessCount=4 and no concrete metric movement, stop for autonomous architecture experiment instead of another local runtime patch.",
    "expectedNextFrontier": "rebalancer_leader / operation_scheduling, startup_active_gate_owner / snapshot_coverage, reduced operation_workflow_owner / workflow_progress, or rolling-restart green",
    "resultClassification": "same-frontier",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-selected-transport-closed-observation-contract / startup_active_gate_owner / selected_transport_closed_observation_contract / migrated",
      "done-20260523-rolling-restart-wait-owner-recovery-reconcile-drain-runtime / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260519-operation-workflow-progress-advance-existing-operation-runtime / operation_workflow_owner / workflow_progress / same-frontier"
    ],
    "oscillationCheck": "Allowed because the fresh representative artifact changed the selected witness shape from the older single-witness workflow-progress proof to a four-witness serial wait chain after an intervening architecture experiment.",
    "handoffInvariant": "Callers consume operation workflow owner outcomes and effects; caches and diagnostics do not decide whether stale progress is local or remote-owned."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Residual extraction reports four operation_workflow_owner / workflow_progress witnesses sharing operation b993e0f0-72f1-481e-a36a-2c02b7895063.",
      "The same artifact also reports one rebalancer_leader / operation_scheduling split, so the workflow-progress group must reduce before the leader split is promoted.",
      "Focused tests already expose the stale progress remote-owner delivery gap."
    ],
    "selectedChoice": "architecture-package",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Prove stale workflow-progress reconcile wakes the remote owner while preserving local stale-progress reconciliation.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js test/rebalancer/operation-workflow-owner-decision.test.js"
        ]
      },
      {
        "id": "architecture-package",
        "summary": "Use if focused proof cannot represent or reduce the remote-owned stale-progress edge.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json"
        ]
      }
    ],
    "nextAction": "Open the priority recovery event-wait architecture experiment before runtime implementation resumes."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_progress_blocked",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "experiment",
    "expectedDelta": "Focused proof passed, but the representative rerun remained same-frontier with no workflow-progress witness reduction, so the next package is an autonomous architecture experiment.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_progress_blocked",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl work/packages/done-20260523-priority-recovery-operation-workflow-owner-workflow-progress.md"
    ]
  },
  "closed": "2026-05-23",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260523-rolling-restart-priority-recovery-event-wait-architecture-experiment.md"
}
-->

## Why

Fresh rolling-restart evidence routes the first priority-recovery frontier to
`operation_workflow_owner / workflow_progress`. Four witnesses are blocked by
one persisted-not-dispatched `control_plane_publications-p1` operation, so the
highest-leverage local slice is the stale workflow-progress owner wake path.

## Scope Basis

AGPL rolling-restart release-gate work from `roadmap.md`; scoped to the
operation workflow owner boundary selected by the representative residual.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: stale workflow progress still emits the
  `RECONCILE_STALE_PROGRESS` owner outcome, and its effect is
  `RECONCILE_STALE_PROGRESS_COMMAND`.
- Inputs/signals: the selected transport-closed artifact, residual extraction
  for `control_plane_publications-p1`, operation locality from the workflow
  owner repository, and the existing workflow owner port dispatch table.
- State model or invariant: local stale progress reconciles through the
  operation owner; remote-owned stale progress wakes the remote operation
  owner through the existing remote-owner handoff path. Callers consume the
  owner outcome/effect and do not infer locality themselves.
- Non-goals and forbidden interpretations: do not change rebalancer leader
  operation scheduling, startup active-gate behavior, publication convergence,
  timeout ceilings, or guardrail scope.
- Proof mapping: focused owner tests must cover the stale-progress command,
  local reconciliation, and remote-owner wake delivery before the
  representative rerun is meaningful.
- Wrong-slice trigger: if the focused proof requires leader scheduling,
  active-gate, publication owner, timeout, or diagnostics changes, stop and
  split or open an architecture experiment.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| residual extraction | four workflow_progress witnesses for one persisted_not_dispatched operation | workflow owner owns progress or wake for the selected operation | stale progress reconcile command plus remote wake when non-local | witnessCount drops below 4, owner migrates, or scenario passes | npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js test/rebalancer/operation-workflow-owner-decision.test.js |
| operation locality | repository reports operation is not locally owned | remote owner must be woken through the owner port; local caller must not retain publication as a substitute | wake remote owner via reconcile stale progress effect | remote wake delivery is observed by focused tests | npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js |
| local operation | repository reports operation is locally owned | existing local reconcile behavior remains the owner path | local reconcile lifecycle call | adapter/decision proof stays green | npm test -- test/rebalancer/operation-workflow-owner-adapter.test.js test/rebalancer/operation-workflow-owner-decision.test.js |

- Anti-symptom rationale: the edit stays inside operation workflow owner
  outcome/effect dispatch and the owner port; it does not patch active-gate or
  publication symptoms.
- Falsifying focused probe: `npm test --
  test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
  test/rebalancer/operation-workflow-owner-adapter.test.js
  test/rebalancer/operation-workflow-owner-decision.test.js`
- Competing explanations: downstream active-gate lag, the remaining
  rebalancer_leader / operation_scheduling split, stale diagnostic
  classification, or wrong owner locality.
- Systemic interaction scan: check lifecycle event mapping, owner port command
  dispatch, local/remote locality, affected owner tests, static guardrails, and
  the fresh representative route.
- Ping-pong stop rule: unchanged same-frontier with no witness reduction after
  this proof opens/selects an autonomous architecture experiment.
- Oscillation guard: this is not another same-frontier symptom patch because
  the fresh artifact changed
  the witness shape after the selected transport-closed architecture
  experiment; another unchanged same-frontier result is not allowed to spawn a
  further local workflow-progress patch.

## Decision Experiment Gate

- Decision question: Does stale workflow progress for a remote-owned operation
  wake the remote operation owner while preserving the canonical stale-progress
  outcome?
- Architecture review: selected route is `continue-local-proof` for one owner
  port/lifecycle edge; scheduling, active-gate, publication, and timeout
  behavior remain out of scope.
- Competing hypotheses: remote-owned stale progress is retained locally; the
  residual is only leader scheduling; diagnostics are stale; active-gate is
  still first despite the priority-recovery route.
- Pre-edit focused probe: `npm run analyze:priority-recovery-residuals --
  test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json`
- Success metrics: count reduction or frontier migration is required: focused
  proof passes, workflow-progress witnessCount drops
  below 4, owner boundary migrates, snapshotCoverageNodeCount increases beyond
  2/5, or rolling-restart passes.
- Representative rerun: `node test/distributed/run.js --config
  test/distributed/config/local.json --scenario rolling-restart --output
  test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json
  --fast-local --verbose`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json`
- Expected delta: reduce the four workflow-progress witnesses, migrate to the
  rebalancer leader split or active-gate snapshot coverage, increase
  snapshotCoverageNodeCount beyond 2/5, or pass rolling-restart.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_progress_blocked`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
- Next lane: `experiment`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current
  Edge Card update, current-blocker refresh, verifier-fixer evidence, closure
  validation, and successor or sprint-green action.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
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

1. `src/rebalancer/operation-lifecycle.js`
2. `src/rebalancer/operation-workflow-owner.js`
3. `src/rebalancer/operation-workflow-owner-segment-1.js`
4. `src/rebalancer/operation-workflow-owner-segment-2.js`
5. `src/rebalancer/operation-workflow-owner-ports.js`
6. `src/rebalancer/operation-workflow-recovery-reconcile.js`
7. Focused operation workflow owner tests named in the proof ladder.
8. Active package, current-blocker files, and model ledger evidence.

## Out Of Scope

1. Rebalancer leader operation scheduling.
2. Startup active-gate snapshot coverage behavior.
3. Publication convergence behavior.
4. Scenario timeout or guardrail weakening.
5. Unrelated `src/` files outside the declared rebalancer owner files.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: declared `writeScope` paths in package metadata.
- Forbidden files: unrelated `src/` files outside
  `src/rebalancer/operation-lifecycle.js`,
  `src/rebalancer/operation-workflow-owner.js`,
  `src/rebalancer/operation-workflow-owner-segment-1.js`,
  `src/rebalancer/operation-workflow-owner-segment-2.js`,
  `src/rebalancer/operation-workflow-owner-ports.js`, and
  `src/rebalancer/operation-workflow-recovery-reconcile.js`.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test --
  test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
  test/rebalancer/operation-workflow-owner-adapter.test.js
  test/rebalancer/operation-workflow-owner-decision.test.js`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: planning and route selection; split executable children before implementation
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Use this package for route selection, owner/boundary decisions, and stop rules.
2. Create Spark-safe mechanical or test-only children once execution is unambiguous.
3. Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: focused tests passed 298/298; static literal, decision-boundary, and runtime-grammar audits passed; representative rerun wrote `test-output/reports/rolling-restart-operation-workflow-stale-progress-remote-wake-20260523T023619Z.report.json` and stayed same-frontier; parent revalidated focused proof: yes; next: successor architecture experiment.
- [x] verification-fix: status: validated; evidence: verifier-fixer reran context, focused tests, literal audit, decision-boundary audit, and runtime-grammar audit; changed files: none; parent revalidated focused proof: yes; next: successor architecture experiment.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card before closure routing when needed; next: validation.

## Commit And Push Ledger

1. Focused package commit: 899123964649ae70d8b85498157a00068c574f8b
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. `git diff --check -- <files>`
