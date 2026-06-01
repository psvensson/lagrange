# Rolling Restart Single Inactive Snapshot Coverage Architecture Experiment

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The prior package removed the admin_not_ready residual and improved rolling-restart from active=2/5 to active=4/5. The remaining failure is active_gate_snapshot_coverage with one readiness_probe_timeout inactive node, selected_transport_closed snapshot evidence, and pending owner recovery.",
  "nextAction": "Close this architecture package as successor-selected and activate the selected transport-closed owner-recovery projection contract.",
  "stabilityCredit": "representative-reduced",
  "representativeRerunCadence": "architecture-stop-reason",
  "whyHighestLeverageNow": "The direct runtime-owner-boundary successor was rejected for frontier oscillation, but the latest representative moved the metric. The next highest-leverage step is to select the exact missing producer-consumer edge before another local active-gate patch.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json",
    "npm run work:scenario-triage -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown"
  ],
  "writeScope": [],
  "handoffFiles": [
    "test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [],
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
    "hypothesis": "After admin availability support moved the residual to active=4/5, the remaining active_gate_snapshot_coverage failure is either selected snapshot transport recovery debt, single-node readiness timeout debt, or stale active-gate evidence; choose the next owner boundary before another local runtime patch.",
    "hypothesisDiscriminator": "If selected snapshot transport recovery owns it, selectedSnapshotObservation remains repair_deferred with selected_transport_closed and pending owner recovery while only one node is inactive; if readiness owns it, readiness_probe_timeout is the critical blocker independent of selected source; if evidence is stale, canonical summaries will disagree on frontier or progress shape.",
    "expectedMetric": "Architecture experiment selects one next owner/boundary with focused proof, or records architecture-gap/human escalation only for contradictory evidence.",
    "inheritsFrom": "work/packages/done-20260523-rolling-restart-startup-readiness-admin-availability-support-contract.md",
    "timebox": "24h",
    "mergeRequirement": "canonical evidence-summary, distributed-failure, topology-convergence, causal-model, and scenario-route classification",
    "killRule": "If canonical evidence cannot distinguish owner boundary, open an architecture-gap package instead of another local runtime patch."
  },
  "validationTier": "cross-owner",
  "representativeResidual": {
    "status": "successor-selected",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "selected_transport_closed_owner_recovery_projection_contract",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Activate the selected transport-closed owner-recovery projection contract successor."
  },
  "causalGovernance": {
    "hypothesis": "After admin availability support moved the residual to active=4/5, the remaining active_gate_snapshot_coverage failure is either selected snapshot transport recovery debt, single-node readiness timeout debt, or stale active-gate evidence.",
    "stopConditionCheck": "Run canonical evidence-summary, distributed-failure, topology-convergence, `npm run analyze:causal-model`, and scenario-route classification before opening another runtime patch.",
    "expectedCausalModelChange": "The architecture experiment selected one next owner/boundary: selected_transport_closed must be accepted by the bounded owner-recovery projection path that already handles selected_timeout.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh package evidence has active=4/5, snapshotCoverage=1/5, one readiness_probe_timeout inactive node, selected_transport_closed snapshot observation, pending owner recovery, ownerQueue=1, publication active=5/5, pendingAck=0, and no priority residuals. Code inspection after canonical proof showed the selected transport-closed observation is already truthful, but the owner-recovery projection predicate only accepts selected_timeout.",
    "crossBoundaryReview": "Do not edit runtime files in this package. Keep timeout budgets, runtime promotion, publication convergence, priority recovery, and src/ frozen until the architecture decision selects a successor."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart single inactive snapshot coverage architecture experiment",
    "phaseChain": [
      "startup readiness/admin availability support projection passed locally",
      "representative moved from active=2/5 to active=4/5",
      "publication convergence remains closed with pendingAck=0",
      "priority recovery residuals are absent",
      "active_gate_snapshot_coverage remains blocked by selected_transport_closed/pending owner recovery plus one readiness_probe_timeout inactive node"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "snapshot coverage remains incomplete at 1/5",
      "runtime promotion remains unsafe while selected snapshot transport recovery is pending",
      "one readiness_probe_timeout inactive node remains after admin availability support"
    ],
    "missingCausalEdge": "The selected transport-closed repair-deferred observation must feed the same bounded owner-recovery projection path as selected timeout before startup readiness timeout diagnostics can be projected safely.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --explain active_gate_snapshot_coverage",
    "falsifyingProbe": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json",
    "boundedProgressProof": "Canonical classification must select one owner/boundary with a bounded retry, reconcile, timeout, or advance mechanism, or record architecture-gap before another runtime patch.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json",
    "expectedObservableTransition": "Architecture proof selected startup_active_gate_owner / selected_transport_closed_owner_recovery_projection_contract.",
    "maxProgressBound": "one causal-escalation architecture package before another runtime package",
    "sameFrontierFallback": "If classification cannot distinguish a missing edge, open an architecture-gap package instead of another local patch.",
    "expectedNextFrontier": "selected transport-closed owner-recovery projection runtime successor",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-wait-owner-recovery-reconcile-drain-runtime / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260523-rolling-restart-startup-active-gate-owner-snapshot-coverage / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260523-rolling-restart-single-inactive-admin-probe-snapshot-residual / startup_active_gate_owner / snapshot_coverage / same-frontier"
    ],
    "oscillationCheck": "Direct runtime-owner-boundary activation was rejected because this frontier returned to a recently closed active-gate snapshot coverage boundary; causal-escalation must prove the missing edge before runtime work resumes.",
    "handoffInvariant": "The architecture package may select the next owner, but it must not change runtime promotion, timeout budgets, publication convergence, priority recovery, or src/."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "The previous readiness support package reduced inactive nodes from three to one but did not green rolling-restart.",
      "The direct runtime-owner-boundary successor was rejected for frontier oscillation.",
      "Canonical evidence still reports active_gate_snapshot_coverage with selected_transport_closed and pending owner recovery."
    ],
    "selectedChoice": "runtime-successor",
    "choices": [
      {
        "id": "architecture-package",
        "summary": "Run causal classification before another active-gate local patch.",
        "route": "architecture-package",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --explain active_gate_snapshot_coverage",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json"
        ]
      },
      {
        "id": "runtime-successor",
        "summary": "Open a runtime owner-boundary successor only after architecture proof names the missing edge.",
        "route": "continue-local-proof",
        "proof": [
          "focused contract fixture selected by this package"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Use only for contradictory canonical evidence or blocked tooling.",
        "route": "human-escalation",
        "proof": [
          "blocked or contradictory evidence"
        ]
      }
    ],
    "nextAction": "Open the selected transport-closed owner-recovery projection runtime successor."
  },
  "observablePrediction": {
    "metric": "selected next owner/boundary for the remaining active_gate_snapshot_coverage residual",
    "predicted": "Canonical evidence will distinguish selected snapshot transport recovery from the single readiness timeout residual without runtime edits.",
    "observed": "Canonical evidence selected active_gate_snapshot_coverage with selected_transport_closed, pending owner recovery, and one readiness timeout. Source inspection after canonical proof found selected_transport_closed is emitted, but the owner-recovery projection only accepts selected_timeout repair-deferred evidence.",
    "accuracy": "partial",
    "evidence": "npm run work:evidence-summary; npm run work:scenario-triage -- --markdown; npm run analyze:priority-recovery-residuals -- --markdown; npm run analyze:topology-convergence -- --explain active_gate_snapshot_coverage; npm --silent run analyze:causal-model; npm run analyze:distributed-failure",
    "metricDelta": 0
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H1",
    "decision": "open-runtime-owner-boundary",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "selected_transport_closed_owner_recovery_projection_contract",
    "evidence": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --explain active_gate_snapshot_coverage; test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json; source check in test/distributed/harness/cluster-segment-7-class-4.js found `hasSelectedSnapshotTimeoutRepairDeferredEvidence` requires selected_timeout."
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
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Focused proof should allow selected_transport_closed repair-deferred evidence to satisfy the bounded owner-recovery projection without runtime promotion or timeout widening; fresh representative should reduce the single readiness timeout residual, increase snapshot coverage, migrate owner/boundary, or pass rolling-restart.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-23",
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
- Inputs/signals: test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Run an autonomous architecture experiment to distinguish remaining single-inactive readiness timeout from selected snapshot transport recovery before any further active-gate local patch. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: After admin availability support moved the residual to active=4/5, the remaining active_gate_snapshot_coverage failure is either selected snapshot transport recovery debt, single-node readiness timeout debt, or stale active-gate evidence; choose the next owner boundary before another local runtime patch.
- Hypothesis discriminator: If selected snapshot transport recovery owns it, selectedSnapshotObservation remains repair_deferred with selected_transport_closed and pending owner recovery while only one node is inactive; if readiness owns it, readiness_probe_timeout is the critical blocker independent of selected source; if evidence is stale, canonical summaries will disagree on frontier or progress shape.
- Expected metric: Architecture experiment selects one next owner/boundary with focused proof, or records architecture-gap/human escalation only for contradictory evidence.
- Inherits from: `work/packages/done-20260523-rolling-restart-startup-readiness-admin-availability-support-contract.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: canonical evidence-summary, distributed-failure, topology-convergence, causal-model, and scenario-route classification
- Kill rule: If canonical evidence cannot distinguish owner boundary, open an architecture-gap package instead of another local runtime patch.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `experiment`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-architecture-experiment`
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

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260523-rolling-restart-single-inactive-snapshot-coverage-architecture-experiment.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown`
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

- [x] implementation: status: validated; evidence: canonical classification ran `npm run work:evidence-summary`, `npm run work:scenario-triage -- --markdown`, `npm run analyze:priority-recovery-residuals -- --markdown`, `npm run analyze:topology-convergence -- --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model`, `npm run analyze:distributed-failure`, and `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`; selected successor is `startup_active_gate_owner / selected_transport_closed_owner_recovery_projection_contract`; parent revalidated focused proof: yes; next: closure and successor action.
- [x] verification-fix: status: validated; evidence: classification-only fast path changed no runtime/test/script/report files; canonical commands above selected the same active-gate frontier and a narrower owner-recovery projection contract; changed files: none; parent revalidated focused proof: yes; next: closure and successor action.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card after package activation; next: closure validation.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-admin-availability-support-contract-20260523T083000Z.report.json --markdown
