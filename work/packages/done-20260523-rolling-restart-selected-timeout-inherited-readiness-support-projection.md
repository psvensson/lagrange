# Rolling Restart Selected Timeout Inherited Readiness Support Projection

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "selected_timeout_inherited_readiness_support_projection_contract",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Causal escalation selected the next executable edge: selected-timeout owner-recovery evidence is bounded, but the remaining inactive readiness-timeout node is different from the selected pending recovery node. Startup active-gate needs an inherited readiness-support projection so partial selected-timeout owner-recovery convergence can proceed without runtime promotion.",
  "nextAction": "Focused proof passed and the fresh representative migrated to topology_publication_owner / publication_convergence / missing_published_nodes_present; close this package as migrated and continue in the publication-convergence successor.",
  "stabilityCredit": "representative-migrated",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "The predecessor local projection was falsified at representative level and the causal package selected this smaller runtime edge. Moving activeByStatus beyond 4/5 is the next measurable gate before snapshot partial convergence can take effect.",
  "theoryLedgerRefs": [
    "theory-20260522-snapshot-watch-handoff-contract"
  ],
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "missing_published_nodes_present",
    "nextAction": "Open and activate the topology_publication_owner / publication_convergence successor for the publication_ack_convergence frontier."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "active_gate_same_frontier_causal_escalation",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "selected_timeout_inherited_readiness_support_projection_contract",
    "reason": "The causal escalation selected readiness-support projection as the missing bounded edge after the selected owner-recovery node was not the remaining inactive readiness-timeout node.",
    "evidence": "test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json"
  },
  "causalGovernance": {
    "hypothesis": "When selected-timeout owner-recovery evidence is bounded and runtimePromotionAllowed remains false, startup active-gate can project readiness timeouts inherited from active-gate no-progress as degraded bounded progress even when the timed-out readiness node is not the selected pending recovery node.",
    "stopConditionCheck": "Run focused startup active-gate proof, static guardrails, npm run analyze:causal-model on the fresh representative, and a rolling-restart representative rerun before closure.",
    "expectedCausalModelChange": "The focused proof should project the inherited readiness-timeout node, and the representative should move activeNodeCount beyond 4/5, snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass rolling-restart.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh artifact test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json moved the first frontier to publication_ack_convergence / topology_publication_owner / publication_convergence / missing_published_nodes_present. The active-gate successor remains a downstream blocked edge, but it is no longer the first critical path owner.",
    "crossBoundaryReview": "Keep src/ and runtime promotion rules frozen. This package only changes startup active-gate projection and focused harness tests."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart selected_timeout_inherited_readiness_support_projection_contract",
    "phaseChain": [
      "selected-timeout owner-recovery focused proof passed",
      "representative stayed active=4/5 coverage=1/5",
      "causal escalation selected inherited readiness-support projection",
      "partial coverage convergence already accepts bounded selected-timeout owner-recovery once activeByStatus is true"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / selected_timeout_inherited_readiness_support_projection_contract / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "snapshot coverage remains incomplete until active gate progress moves",
      "runtime promotion remains unsafe while selected-timeout repair is deferred"
    ],
    "missingCausalEdge": "Startup active-gate must project inherited readiness-support timeouts under bounded selected-timeout owner-recovery evidence without promoting runtime state.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # inherited readiness-support contract fixture and affected consumer proof",
    "boundedProgressProof": "Focused proof must show a bounded projection mechanism for timeout-shaped inherited readiness support under wait_owner_recovery evidence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json",
    "expectedObservableTransition": "Fresh representative should move activeNodeCount beyond 4/5, snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass rolling-restart.",
    "maxProgressBound": "one runtime-owner-boundary package before representative rerun",
    "sameFrontierFallback": "If fresh representative evidence remains unchanged same-frontier with no metric movement, stop for causal escalation rather than another local projection patch.",
    "expectedNextFrontier": "active count movement, coverage movement, owner/boundary migration, or rolling-restart green",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-startup-active-gate-owner-snapshot-coverage / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260523-rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract / startup_active_gate_owner / selected_snapshot_timeout_owner_recovery_projection_contract / same-frontier",
      "active-20260523-rolling-restart-active-gate-same-frontier-causal-escalation / startup_active_gate_owner / active_gate_same_frontier_causal_escalation / selected"
    ],
    "oscillationCheck": "This package is the concrete successor selected by causal escalation, not another generic snapshot_coverage patch.",
    "handoffInvariant": "wait_owner_recovery and selected-source timeout evidence must not imply runtime promotion until snapshot coverage completes."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "The same-frontier causal escalation selected inherited readiness-support projection.",
      "The remaining inactive node is a readiness timeout that differs from the selected pending recovery node.",
      "Partial selected-timeout convergence can proceed after activeByStatus becomes true."
    ],
    "selectedChoice": "continue-local-proof",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Execute the selected inherited readiness-support projection contract.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js"
        ]
      },
      {
        "id": "owner-boundary-migration",
        "summary": "Migrate to startup_readiness_owner if focused proof shows readiness support cannot be projected by startup active-gate.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Use only if focused proof or canonical evidence contradicts the selected causal edge.",
        "route": "human-escalation",
        "proof": [
          "blocked or contradictory tool evidence"
        ]
      }
    ],
    "nextAction": "Use the topology_publication_owner / publication_convergence successor before additional startup active-gate work."
  },
  "observablePrediction": {
    "metric": "rolling-restart active-gate activeNodeCount and snapshotCoverageNodeCount",
    "predicted": "The focused contract should project the inherited readiness-timeout node and the fresh representative should move activeNodeCount beyond 4/5, snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass.",
    "observed": "migrated: fresh representative first frontier is publication_ack_convergence / topology_publication_owner / publication_convergence / missing_published_nodes_present",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json",
    "metricDelta": 1
  },
  "proof": [
    "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # inherited readiness-support contract fixture and affected consumer proof",
    "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js",
    "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js",
    "npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json --fast-local --verbose"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js"
  ],
  "commitScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "work/packages/done-20260523-rolling-restart-selected-timeout-inherited-readiness-support-projection.md",
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
      "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js",
      "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js",
      "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "missing_published_nodes_present",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Fresh representative migrated to publication_ack_convergence / topology_publication_owner / publication_convergence / missing_published_nodes_present, so the next package owns publication convergence.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json --owner startup_active_gate_owner --boundary selected_timeout_inherited_readiness_support_projection_contract --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-23",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260523-rolling-restart-publication-handoff-selected-coverage-projection.md"
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

- Canonical outcome: startup_active_gate_owner / selected_timeout_inherited_readiness_support_projection_contract emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json; npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js; npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js; npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js; npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js; node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json --fast-local --verbose.
- State model or invariant: The startup_active_gate_owner / selected_timeout_inherited_readiness_support_projection_contract decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / selected_timeout_inherited_readiness_support_projection_contract invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / selected_timeout_inherited_readiness_support_projection_contract / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Implement selected-timeout inherited readiness-support projection so startup active-gate can treat readiness timeouts caused by active-gate no-progress as bounded progress when owner-recovery evidence is bounded and runtime promotion remains false. | Focused proof should project the inherited readiness-timeout node under bounded selected-timeout owner-recovery evidence; the fresh representative should move activeNodeCount beyond 4/5, snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass rolling-restart. | npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / selected_timeout_inherited_readiness_support_projection_contract directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # inherited readiness-support contract fixture and affected consumer proof`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / selected_timeout_inherited_readiness_support_projection_contract still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # inherited readiness-support contract fixture and affected consumer proof`
- Success metrics: Focused proof should project the inherited readiness-timeout node under bounded selected-timeout owner-recovery evidence; the fresh representative should move activeNodeCount beyond 4/5, snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass rolling-restart.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json --owner startup_active_gate_owner --boundary selected_timeout_inherited_readiness_support_projection_contract --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json`
- Expected delta: Focused proof should project the inherited readiness-timeout node under bounded selected-timeout owner-recovery evidence; the fresh representative should move activeNodeCount beyond 4/5, snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass rolling-restart.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `selected_timeout_inherited_readiness_support_projection_contract`
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

1. test/distributed/harness/cluster-segment-7-class-4.js
2. test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js
3. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
4. test/distributed/harness/__tests__/cluster.test-part-4.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `test/distributed/harness/__tests__/cluster.test-part-4.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # inherited readiness-support contract fixture and affected consumer proof`, `npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js`, `npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js`, `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json --fast-local --verbose`
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

- [x] implementation: status: validated; evidence: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js` PASS (13 tests) after adding the inherited readiness-support fixture; `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js` PASS (53 tests); `npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js` PASS; `npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js` PASS; `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js` PASS; `git diff --check -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js work/packages/done-20260523-rolling-restart-selected-timeout-inherited-readiness-support-projection.md work/sprints/current-blocker.md work/sprints/current-blocker.json` PASS; `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json --fast-local --verbose` FAIL with migrated frontier `publication_ack_convergence / topology_publication_owner / publication_convergence / missing_published_nodes_present`; `npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json`, and `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json` all route the fresh blocker to topology publication convergence; parent revalidated focused proof: yes; next: close as migrated and activate topology publication successor.
- [x] verification-fix: status: validated; evidence: verifier reran `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js` PASS (53 tests); parent reran the same focused proof PASS (53 tests) after verifier metadata fixes; `npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json` PASS with first frontier `publication_ack_convergence / topology_publication_owner / publication_convergence / missing_published_nodes_present`; `npm run work:scenario-route -- test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json` PASS and routes to topology publication convergence; `npm run work:package:doctor -- --suggest work/packages/done-20260523-rolling-restart-selected-timeout-inherited-readiness-support-projection.md` PASS; `npm run work:validate -- --pre-impl` initially FAIL due stale current-blocker (package `none`), then repaired and PASS; `npm run work:validate -- --closure work/packages/done-20260523-rolling-restart-selected-timeout-inherited-readiness-support-projection.md` initially FAIL due open verification-fix/repair items; changed files: work/packages/done-20260523-rolling-restart-selected-timeout-inherited-readiness-support-projection.md, work/sprints/current-blocker.json, work/sprints/current-blocker.md; parent revalidated focused proof: yes; next: closure validation and successor activation.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # inherited readiness-support contract fixture and affected consumer proof
2. npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js
3. npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js
4. npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js
5. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-timeout-inherited-readiness-support-projection-20260523T052500Z.report.json --fast-local --verbose

## Commit And Push Ledger

1. Focused package commit: 899123964649ae70d8b85498157a00068c574f8b
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
