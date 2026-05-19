# Topology Publication No-Debt Snapshot Timeout Causal Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-19",
  "closed": "2026-05-19",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Closed as owner-boundary migration: publicationConvergence is reported ready in the scenario error, pendingAck=0, missingPublished=0, pendingReconcile=0, priority residual witnesses=0, active=4/5, and snapshotCoverage=0/5. Generic route still labels unknown/no-revision publication evidence, but focused handoff and owner-file probes select startup_active_gate_owner / snapshot_coverage because the concrete remaining blocker is selected snapshot source timeout.",
  "nextAction": "Continue in work/packages/active-20260519-startup-active-gate-selected-snapshot-source-timeout-runtime.md and run required runtime-owner-boundary subagent sequencing before runtime edits.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --handoff-probe",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
  ],
  "writeScope": [
    "work/packages/done-20260519-topology-publication-no-debt-snapshot-timeout-causal-gate.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json",
    "work/packages/done-20260519-topology-publication-open-owner-reconcile-runtime.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/active-node-projection.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js"
  ],
  "commitScope": [
    "work/packages/done-20260519-topology-publication-no-debt-snapshot-timeout-causal-gate.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --handoff-probe",
      "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Continue in the startup active-gate selected snapshot source timeout runtime successor."
  },
  "causalGovernance": {
    "hypothesis": "The predecessor drained publication-owner missing-published and owner-reconcile debt; the remaining representative blocker is active-gate snapshot coverage at 0/5 because selected snapshot source timeout prevents coverage from forming.",
    "stopConditionCheck": "Use route-after-rerun, evidence summary, topology handoff probe, npm run analyze:causal-model, distributed failure summary, owner-files, and focused proof before runtime edits in the successor.",
    "expectedCausalModelChange": "Successor must reduce selected_snapshot_source_timeout, improve snapshot coverage above 0/5, migrate to a new owner boundary, or turn representative rolling-restart green.",
    "representativeOutcome": "migrated",
    "causalDebt": "Publication-owner debt is zero: pendingAck=0, missingPublished=0, pendingReconcile=0, priority residual witnesses=0, and scenario error reports publicationConvergence=ready. Remaining debt is startup active-gate snapshot coverage at 0/5 with selected snapshot source timeout.",
    "crossBoundaryReview": "Do not reopen topology publication, operation workflow, active-gate admission, timeout budgets, or readiness support unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart no-debt publication_pending after owner reconcile",
    "phaseChain": [
      "predecessor routed active-gate owner-reconcile handoff through the publication owner",
      "representative rerun reduced missingPublished, pendingReconcile, priority residuals, and active-gate disagreement to zero",
      "generic route still reports publication_pending on unknown/no-revision evidence",
      "focused handoff and owner-file probes select startup active-gate snapshot coverage"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out in test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json.",
    "knownDownstreamBlockers": [
      "startup active-gate snapshot coverage timed out at 0/5",
      "selected snapshot source timeout on node 11601fe0-72d6-5853-8590-ec2881853e72",
      "one seed node readiness probe timed out while four nodes reached active"
    ],
    "missingCausalEdge": "Selected snapshot source timeout prevents active-gate snapshot coverage before handoff evidence can form.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --handoff-probe",
    "boundedProgressProof": "The causal gate has no runtime write scope; bounded progress is the owner-boundary migration to a runtime successor that owns selected snapshot source timeout.",
    "boundedProgressProofArtifact": "work/packages/done-20260519-topology-publication-no-debt-snapshot-timeout-causal-gate.md and test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json",
    "expectedObservableTransition": "Active successor reduces selected_snapshot_source_timeout, improves snapshot coverage above 0/5, migrates owner boundary, or turns representative rolling-restart green.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage selected-source timeout slice",
    "sameFrontierFallback": "If successor focused tests pass but representative evidence remains at selected snapshot source timeout with coverage 0/5 and no metric movement, stop as same-frontier instead of widening into frozen owners.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage unless selected source timeout reduces and canonical evidence selects a new owner boundary",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-remaining-owner-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-topology-publication-same-frontier-architecture-gate.md / topology_publication_owner / publication_convergence / same-frontier successor-selected",
      "work/packages/done-20260519-topology-publication-open-owner-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "This successor is allowed because the predecessor produced concrete metric reduction; unchanged same-frontier without a new decision forces architecture or human escalation.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, active-gate admission, publication truth, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "fresh route keeps topology_publication_owner / publication_convergence / publication_pending",
      "handoff probe detects publication_ack_to_active_gate_reconcile_missing",
      "publication-owner debt metrics are zero after predecessor",
      "active-gate snapshot coverage times out at 0/5"
    ],
    "choices": [
      {
        "id": "bounded-publication-owner-runtime-successor",
        "summary": "Classify and repair the no-debt publication_pending owner edge if focused proof identifies a local owner move.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --handoff-probe",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json"
        ]
      },
      {
        "id": "owner-boundary-migration-startup-active-gate-snapshot-coverage",
        "summary": "Migrate to startup_active_gate_owner / snapshot_coverage because publication-owner debt is zero and the remaining concrete blocker is selected snapshot source timeout.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --handoff-probe",
          "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
        ]
      }
    ],
    "selectedChoice": "owner-boundary-migration-startup-active-gate-snapshot-coverage",
    "nextAction": "Continue in work/packages/active-20260519-startup-active-gate-selected-snapshot-source-timeout-runtime.md and run required runtime-owner-boundary sequencing before runtime edits."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "publication owner debt is zero while active-gate snapshot coverage blocks on selected snapshot source timeout",
    "evidence": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --handoff-probe",
      "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
    ]
  },
  "successor": "work/packages/active-20260519-startup-active-gate-selected-snapshot-source-timeout-runtime.md",
  "commitAndPushLedgerRequired": true
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the fresh artifact has frontier oscillation and contradictory producer/consumer evidence, so this package must decide whether the next move is local owner work, owner-boundary migration, or architecture contract work before runtime edits.
- Escalation trigger to a heavier lane: human-only policy decision, inability to distinguish stale publication evidence from active-gate snapshot ownership, or representative evidence contradiction.

## Core Logic Brief

- Canonical outcome: topology_publication_owner / publication_convergence is closed as migrated to startup_active_gate_owner / snapshot_coverage.
- Inputs/signals: test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json; `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json`; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --handoff-probe`; `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`.
- State model or invariant: If publication debt metrics are zero and the concrete remaining blocker is active-gate snapshot coverage with selected snapshot source timeout, topology publication must not receive another local runtime patch; the causal gate emits `migrated`.
- Non-goals and forbidden interpretations: Do not reopen publication ACK, priority recovery, operation workflow, active-gate admission, timeout budgets, publication truth, or readiness support without fresh canonical evidence.
- Proof mapping: The evidence summary proves no remaining publication debt; the handoff probe identifies active-gate snapshot timeout; owner-files identifies startup active-gate snapshot coverage as the runtime successor boundary.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending with zero publication debt | topology_publication_owner has no remaining bounded local debt on this artifact | migrate to startup_active_gate_owner / snapshot_coverage | successor owns selected snapshot source timeout | npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --handoff-probe |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package classifies topology_publication_owner / publication_convergence directly and stops local publication patching once focused evidence selects startup active-gate snapshot coverage.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending after publication debt drains to zero?
- Architecture review: Selected route is owner-boundary migration to startup_active_gate_owner / snapshot_coverage.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; startup active-gate snapshot coverage owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json`
- Success metrics: Owner-boundary migration from topology_publication_owner / publication_convergence to startup_active_gate_owner / snapshot_coverage, with successor runtime package active; no runtime edits are made in this causal gate.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If successor focused proof and representative rerun remain at selected snapshot source timeout with coverage 0/5 and no metric movement, stop as same-frontier instead of widening frozen owners.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `publication_pending`
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

## In Scope

1. Focused package-owned edit.

## Out Of Scope

1. Runtime edits inside this causal gate.
2. Reopening frozen owners without fresh canonical evidence.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --handoff-probe`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`
- Model ledger advisory: `escalate`

## Owner Boundary Migration Proof

1. `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json`: publication debt metrics are zero while active-gate snapshot coverage is 0/5.
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --handoff-probe`: missing edge is downstream of publication and selected snapshot source timeout blocks coverage.
3. `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`: successor file set is the startup active-gate snapshot coverage owner boundary.

## Subagent Sequencing

Not required: pure classification causal gate with no runtime, test, script, or report write scope. Subagent sequencing resumes in `work/packages/active-20260519-startup-active-gate-selected-snapshot-source-timeout-runtime.md`.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --handoff-probe
3. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage
