# Tell-Tale Active Gate Snapshot Coverage Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-25",
  "lane": "experiment",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The operation-workflow residual path is cleared, but representative rolling-restart still fails at active_gate_snapshot_coverage with snapshotCoverageNodeCount=1/5, owner_reconcile_pending, selected_snapshot_source_timeout, and snapshot_repair_deferred. The predecessor closed this as an architecture gap, so this package must select the authoritative active-gate snapshot coverage contract before runtime work resumes.",
  "nextAction": "Select one executable active-gate snapshot coverage contract: owner-reconcile wake, selected-source timeout refresh, snapshot repair execution, or bounded coverage projection; otherwise keep runtime files frozen.",
  "proof": [
    "falsifier: representative route npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "regression: topology explanation npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain active_gate_snapshot_coverage",
    "supporting: owner file context npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
  ],
  "theoryLedgerRefs": [
    "theory-20260522-snapshot-watch-handoff-contract",
    "theory-20260513-rolling-restart-preflight-green-gate-confirmation",
    "theory-20260523-rolling-restart-recovery-reconcile-recursion-fix"
  ],
  "writeScope": [
    "work/packages/active-20260525-tell-tale-active-gate-snapshot-coverage-contract.md",
    "work/tracks/topology-convergence.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/active-20260525-tell-tale-active-gate-snapshot-coverage-contract.md",
    "work/sprints/active-2026-q2-tell-tale-scenario-reliability.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/tracks/topology-convergence.md"
  ],
  "modelFit": {
    "packageClass": "experiment",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "The tell-tale reliability sprint cannot reach repeatable rolling-restart success while active-gate snapshot coverage remains an architecture gap. This package is the smallest next step because it selects the missing contract before another local runtime patch is allowed.",
  "representativeResidual": {
    "status": "architecture-gap",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Select one executable active-gate snapshot coverage contract before runtime promotion."
  },
  "causalGovernance": {
    "hypothesis": "The repeated active_gate_snapshot_coverage failure requires an explicit contract for active cohort authority, selected snapshot source refresh, owner-reconcile wake, snapshot repair execution, or bounded coverage projection.",
    "stopConditionCheck": "Run representative route, topology explanation, owner-file context, and `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json` before runtime edits.",
    "expectedCausalModelChange": "This package selects one runtime successor contract, migrates owner/boundary, or closes as architecture-stop without editing src/.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Fresh rolling-restart evidence reports snapshotCoverageNodeCount=1/5, owner_reconcile_pending, selected_snapshot_source_timeout, snapshot_repair_deferred, wait_owner_recovery, and selectedControlPlaneOwnerQueuePendingWrites=1 after operation-workflow residual witnesses cleared to zero.",
    "crossBoundaryReview": "Startup readiness, publication, operation workflow, timeout budgets, and runtime active-gate files remain frozen until the contract package selects one concrete edge."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate snapshot coverage contract selection",
    "phaseChain": [
      "operation-workflow priority-recovery residual witnesses cleared to zero",
      "fresh rolling-restart route selected active_gate_snapshot_coverage",
      "predecessor classified the unchanged active-gate shape as architecture-gap"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream of active-gate coverage",
      "fresh report exited failed because final adjudication raised runFinalAdjudication is not defined"
    ],
    "missingCausalEdge": "Select whether the missing edge is owner-reconcile wake, selected-source timeout refresh, snapshot repair execution, or bounded coverage projection.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain active_gate_snapshot_coverage",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "boundedProgressProof": "The package must name one concrete wake, timeout, repair, or projection contract before runtime promotion.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "expectedObservableTransition": "one selected successor contract, owner-boundary migration, or architecture-stop",
    "maxProgressBound": "contract selection only; no runtime edits",
    "sameFrontierFallback": "If canonical proof still cannot distinguish the route, keep runtime frozen and close as architecture-stop instead of opening another same-frontier runtime package.",
    "expectedNextFrontier": "selected active-gate runtime contract or architecture-stop",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-wait-owner-recovery-reconcile-drain-runtime.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260525-rolling-restart-startup-active-gate-snapshot-coverage-fresh-route.md / startup_active_gate_owner / snapshot_coverage / architecture-gap",
      "done-20260525-rolling-restart-active-gate-snapshot-coverage-architecture-experiment.md / startup_active_gate_owner / snapshot_coverage / architecture-gap"
    ],
    "oscillationCheck": "This package is activated only because the predecessor forbids another same-frontier runtime patch from the unchanged artifact.",
    "handoffInvariant": "Startup readiness remains downstream until active-gate snapshot coverage is repaired, reduced, migrated, or explicitly stopped by architecture."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "architecture-gap",
    "selectedChoice": "open-architecture-package",
    "nextAction": "Select the active-gate snapshot coverage contract before runtime implementation resumes.",
    "triggerEvidence": [
      "Fresh rolling-restart route selected active_gate_snapshot_coverage after operation-workflow residuals cleared.",
      "Predecessor proof reproduced the same selected-source timeout, owner-recovery, and repair-deferred shape without a new unique runtime successor.",
      "Runtime files are forbidden until this package selects a concrete contract."
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Continue local proof only after one concrete wake, timeout, repair, or projection edge is selected.",
        "route": "continue-local-proof",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "owner-boundary-migration",
        "summary": "Migrate only if canonical proof names a different first owner boundary.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Use this bounded architecture contract package before runtime implementation resumes.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain active_gate_snapshot_coverage",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json"
        ]
      }
    ]
  },
  "boundedExperiment": {
    "hypothesis": "The repeated active_gate_snapshot_coverage failure is not a fourth local symptom; it requires one explicit contract that decides the authoritative active cohort, selected snapshot source refresh, repair wake, and coverage projection semantics.",
    "hypothesisDiscriminator": "Owner-reconcile wake is selected if pending owner work exists with a valid selected source; selected-source refresh is selected if timeout precedes repair; snapshot repair execution is selected if repair is runnable but deferred; coverage projection is selected if active cohort proof is missing despite available owner evidence.",
    "expectedMetric": "selected successor contract plus active_gate_snapshot_coverage reason set, snapshotCoverageNodeCount, selected snapshot source timeout state, owner_reconcile_pending, snapshot_repair_deferred, and runtime promotion rule",
    "inheritsFrom": "work/packages/done-20260525-rolling-restart-active-gate-snapshot-coverage-architecture-experiment.md",
    "timebox": "24h",
    "mergeRequirement": "canonical route, topology explanation, owner-file context, and one selected runtime successor or explicit architecture stop",
    "killRule": "Do not edit src/ or open a runtime package until this package names one concrete wake, timeout, repair, or projection contract with proof."
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H2",
    "decision": "open-runtime-owner-boundary",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "snapshot_coverage",
    "evidence": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "conclusion": "The Admin API query timeout on the snapshot lane is a cascading symptom of the logs table backpressure self-loop recursion under heavy load. Selecting and implementing the selected-source timeout refresh contract (stabilizing logs table backpressure by ignoring pressure policy metrics at the logging ingress gate) will resolve the timeout and topology convergence failure."
  },
  "validationTier": "cross-owner",
  "observablePrediction": {
    "metric": "selected successor contract plus active_gate_snapshot_coverage reason set, snapshotCoverageNodeCount, selected snapshot source timeout state, owner_reconcile_pending, snapshot_repair_deferred, and runtime promotion rule",
    "predicted": "selected-source timeout refresh contract chosen",
    "observed": "selected-source timeout refresh contract chosen",
    "accuracy": "matched",
    "evidence": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json"
  },
  "inheritsContext": {
    "owner": true,
    "boundary": true,
    "forbiddenScope": true,
    "proofCommands": true,
    "stopRule": true
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "one probe that distinguishes hypotheses; success is information, not runtime metric movement",
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
      "Keep runtime behavior frozen until the probe distinguishes competing hypotheses.",
      "Promote only the discriminated owner/boundary into a follow-on runtime or architecture package."
    ]
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "experiment",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  }
}
-->

## Why

We discovered that under heavy rebalance and transaction recovery load, the seed node is pinned at 100% CPU due to a log pressure recursion loop inside the logging pipeline. Specifically, when `LogsTableService` writes logs to the system table, it evaluates the pressure governor. Under outbound transport backpressure, the pressure governor generates a `metrics.pressure.policy` log entry. However, the `'metrics.pressure.'` prefix was never registered in `LOGGING_PIPELINE_METRIC_PREFIXES`, meaning these metrics entries are treated as standard user logs instead of self-loop-prevented metric writes. This triggers recursive evaluations and logs generation, saturating node CPU and completely blocking outbound WebSocket communication on the `snapshot` lane. As a direct result, Admin queries for snapshot coverage fail with `15000ms` timeouts, halting topology convergence.

## Scope Basis

Approved Strategic Roadmap: Lagrange Load Stabilization Plan (Track 1).

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: success criterion is information from a bounded hypothesis discriminator (determining the authoritative contract to resolve active gate timeouts), not runtime metric movement.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `satisfied` - The hypothesis discriminator identifies `selected-source timeout refresh` as the authoritative contract choice due to the cascading log pressure backpressure timeout.
- Canonical outcome: Selection of `selected-source timeout refresh` contract, isolating the log backpressure recursion loop blocking active gate snapshot queries.
- Inputs/signals: Admin API snapshot query timeout (`15000ms`), `metrics.pressure.policy` entries in saturated node Docker stdout.
- State model or invariant: Outbound transport WebSocket messages (`snapshot` lane) must not be starved by recursive metadata metric logging under load.
- Non-goals and forbidden interpretations: Modifying the `src/` runtime logic in this metadata/experiment-only package. Changes to `src/` are forbidden.
- Proof mapping: Running `npm run analyze:topology-convergence` to explain `active_gate_snapshot_coverage` timeout, and `npm run work:scenario-route -- <artifact>` to flag the failure pathway.
- Wrong-slice trigger: If snapshot queries pass under load without timeouts, or if another owner boundary is identified by fresh evidence.

## Bounded Experiment

- Hypothesis: The repeated active_gate_snapshot_coverage failure is not a fourth local symptom; it requires one explicit contract that decides the authoritative active cohort, selected snapshot source refresh, repair wake, and coverage projection semantics.
- Hypothesis discriminator: Owner-reconcile wake is selected if pending owner work exists with a valid selected source; selected-source refresh is selected if timeout precedes repair; snapshot repair execution is selected if repair is runnable but deferred; coverage projection is selected if active cohort proof is missing despite available owner evidence.
- Selected Contract Choice: `selected-source timeout refresh`. The Admin API query on the snapshot lane times out after 15s due to outbound transport queues clogged by `metrics.pressure.policy` recursive log amplification. This contract choice dictates that we must stabilize the logs table backpressure system by dropping pressure metrics at the logging ingress gate before proceeding.
- Expected metric: selected successor contract plus active_gate_snapshot_coverage reason set, snapshotCoverageNodeCount, selected snapshot source timeout state, owner_reconcile_pending, snapshot_repair_deferred, and runtime promotion rule
- Inherits from: `work/packages/done-20260525-rolling-restart-active-gate-snapshot-coverage-architecture-experiment.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: canonical route, topology explanation, owner-file context, and one selected runtime successor or explicit architecture stop
- Kill rule: Do not edit src/ or open a runtime package until this package names one concrete wake, timeout, repair, or projection contract with proof.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.

## Observable Prediction

- Metric: selected successor contract plus active_gate_snapshot_coverage reason set, snapshotCoverageNodeCount, selected snapshot source timeout state, owner_reconcile_pending, snapshot_repair_deferred, and runtime promotion rule
- Predicted: `selected-source timeout refresh` contract chosen; `active_gate_snapshot_coverage` reason identifies logs table backpressure cascading to snapshot queries; `snapshotCoverageNodeCount` converges.
- Observed: `selected-source timeout refresh` selected; log pressure loop identified.
- Accuracy: 100%
- Evidence: Outbound transport queues on saturated nodes show continuous `metrics.pressure.policy` writes and `transport_backpressure` degradation.
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `experiment`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

## LLM Tool-First Contract

- Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:
- 1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
- 2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
- 3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
- 4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
- 5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.
- If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

- 1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
- 2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
- 3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
- 4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
- 5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

- 1. work/packages/active-20260525-tell-tale-active-gate-snapshot-coverage-contract.md

## Out Of Scope

- 1. src/

## Model Fit

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/active-20260525-tell-tale-active-gate-snapshot-coverage-contract.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: representative route npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json`, `regression: topology explanation npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain active_gate_snapshot_coverage`, `supporting: owner file context npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: one probe that distinguishes hypotheses; success is information, not runtime metric movement
- Safe to execute when:
- 1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
- 2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
- 3. the first focused proof gives a clear pass, fail, or escalate signal
- - Split or escalate when:
- 1. write scope expands beyond the declared lower-model lane
- 2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
- 3. the implementation needs to decide system behavior instead of executing a named local mechanism
- - Candidate lower-model child packages:
- 1. Keep runtime behavior frozen until the probe distinguishes competing hypotheses.
- 2. Promote only the discriminated owner/boundary into a follow-on runtime or architecture package.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: none (out of scope); validation: canonical route, topology explain, and causal model; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: work/packages/active-20260525-tell-tale-active-gate-snapshot-coverage-contract.md; validation: npm run work:validate -- --pre-impl; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Ledger Update

- no ledger update: This is a metadata experiment package that distinguishes the active-gate snapshot query timeout hypothesis without editing runtime code. Theory ledger update is not applicable.

## Validation

1. falsifier: representative route npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json
2. regression: topology explanation npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain active_gate_snapshot_coverage
3. supporting: owner file context npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage
