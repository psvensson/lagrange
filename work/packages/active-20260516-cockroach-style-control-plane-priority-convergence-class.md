# Cockroach Style Control Plane Priority Convergence Class

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "control_plane_priority_convergence_class",
  "dominantReason": "control_plane_progress_competes_with_ordinary_repair",
  "currentState": "Control-plane publication and active-gate convergence can be delayed by the same pressure and repair machinery used by broader diagnostics. This package makes critical topology convergence an explicit priority class with typed pressure outcomes.",
  "nextAction": "Create a control-plane convergence class with stricter admission and pressure semantics for publication and active-gate critical work.",
  "proof": [
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/admin/admin-control-snapshot-class-part-2.js"
  ],
  "writeScope": [
    "work/packages/active-20260516-cockroach-style-control-plane-priority-convergence-class.md",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/control-plane/control-plane-error-classification.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-websocket-api-segment-3.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/admin/admin-control-snapshot.test.js",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/tracks/topology-convergence.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/control-plane/control-plane-error-classification.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-websocket-api-segment-3.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-cockroach-style-control-plane-priority-convergence-class.md",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/control-plane/control-plane-error-classification.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-websocket-api-segment-3.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/admin/admin-control-snapshot.test.js",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/follow-on",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_ack_blocked",
    "nextAction": "Keep the active package bounded to the control-plane priority convergence class while representative evidence remains fronted by publication ACK convergence; priority-recovery evidence is subordinate unless fresh canonical extraction promotes it."
  },
  "causalGovernance": {
    "hypothesis": "A distinct control-plane priority convergence class should reduce or migrate publication_ack_convergence by making critical publication, ACK, active-gate handoff, and owner-recovery wake work observable under typed pressure semantics instead of ordinary repair deferral.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "expectedCausalModelChange": "After implementation proof, representative evidence should reduce, migrate, or remain same-frontier at publication_ack_convergence with priority-recovery residuals kept subordinate unless canonical extractors promote them.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Pauli review fixes only repaired representative metadata and track notes; no runtime implementation has started and the live representative residual remains publication_ack_convergence.",
    "crossBoundaryReview": "Review subagent Pauli (019e3065-9e5a-70c1-a43a-a279ba9836da) required metadata and track-note fixes before implementation; separate implementation proof is still required."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / topology_publication_owner publication_convergence",
    "phaseChain": [
      "repair package representative metadata from Pauli review",
      "classify subordinate priority-recovery residual evidence",
      "implement bounded control-plane priority convergence class only after sequencing proof"
    ],
    "currentFirstFrontier": "Package-local frontier topology_publication_owner / control_plane_priority_convergence_class is the bounded support role for the representative publication_ack_convergence first frontier in test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json under topology_publication_owner / publication_convergence with dominant reason publication_ack_blocked.",
    "knownDownstreamBlockers": [
      "priority-recovery residual extraction reports operation_workflow_owner / rebalancer_handoff as subordinate evidence",
      "active-gate owner reconcile is drained with pendingReconcileCount=0 in the current handoff"
    ],
    "missingCausalEdge": "The package must prove whether typed critical admission and bounded retry/wake semantics let publication ACK convergence advance before ordinary repair deferral evidence can hide critical control-plane progress.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, reconcile, or dispatch behavior for critical publication and active-gate handoff work without treating ordinary repair deferral as success.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "expectedObservableTransition": "No transition claimed by this fix-only pass; implementation proof should reduce, migrate, or preserve same-frontier publication_ack_convergence with explicit priority-class evidence.",
    "maxProgressBound": "one runtime-owner-boundary package slice; no user-visible priority controls, Pro or Enterprise policy, unlimited queues, or hidden retries",
    "sameFrontierFallback": "If focused proof leaves publication_ack_convergence at topology_publication_owner / publication_convergence, keep the same representative frontier and do not promote subordinate priority-recovery evidence without fresh canonical extraction.",
    "expectedNextFrontier": "publication_ack_convergence reduced or migrated after priority-class implementation; otherwise same-frontier publication convergence evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

CockroachDB gives system ranges stronger resilience expectations than ordinary
ranges. The local analogue is not CockroachDB range replication. The useful
idea is that metadata needed for cluster correctness should not compete on the
same terms as ordinary or diagnostic work.

This package applies that idea to control-plane publication, active-gate
handoff, and owner recovery. Critical convergence work may still defer under
pressure, but it must receive a stricter admission contract and typed outcome
instead of disappearing behind ordinary repair backoff.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, production guarantees and topology
workflow stabilization. External reference: CockroachDB system range
resilience docs, `https://www.cockroachlabs.com/docs/stable/alter-range`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: a shared pressure/admission class can be added
  without changing user-facing features or edition scope.
- Escalation trigger to a heavier lane: the package needs new user controls,
  broad scheduler policy, or Pro/Enterprise behavior.

## Shared Boundary Contract

- Semantic owner: `topology_publication_owner` owns publication convergence
  class semantics; `startup_active_gate_owner` consumes the class for handoff
  and admission evidence.
- Canonical evidence inputs: control-plane pressure state, owner queue depth,
  publication ACK state, handoff target, retry-after, and bounded progress
  mechanism.
- Canonical state vocabulary: `critical_admitted`, `critical_deferred`,
  `critical_rejected`, `ordinary_deferred`, `diagnostic_deferred`.
- Allowed consumers: publication owner, admin snapshot, active-gate handoff,
  topology convergence graph, and distributed harness.
- Forbidden reinterpretations: no consumer may treat ordinary diagnostic
  repair deferral as critical publication progress.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Add a named critical convergence class for membership publication, control
   plane publication ACK, active-gate handoff, and owner recovery wake work.
2. Route those operations through the existing owner/admission machinery with a
   stricter bounded contract: bounded queue, retry-after, owner key, and typed
   pressure outcome.
3. Keep diagnostics and broad repair on the ordinary class.
4. Add pressure tests proving critical convergence is not silently dropped and
   ordinary diagnostics can defer without blocking the owner command.
5. Update reports to distinguish critical defer from ordinary repair defer.

## Out Of Scope

1. User-visible priority controls.
2. Pro or Enterprise scheduling policy.
3. Unlimited queues or hidden retries.
4. Treating pressure as success.

## Subagent Sequencing Ledger

Required before implementation because this is a runtime-owner-boundary
package. The review subagent must review
`work/packages/done-20260516-tikv-pd-style-topology-operator-step-witness-ledger.md`
and this package's active metadata before implementation starts.

- [x] Review subagent recorded: Agent Pauli (019e3065-9e5a-70c1-a43a-a279ba9836da) reviewed work/packages/active-20260516-cockroach-style-control-plane-priority-convergence-class.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed: Agent Hubble (019e3069-1773-75a1-85d6-3dfe7f3a576c) fixed work/packages/active-20260516-cockroach-style-control-plane-priority-convergence-class.md
- [x] Implementation subagent recorded: Agent Rawls (019e306d-a608-79b0-bc46-670b8125bb73) implemented work/packages/active-20260516-cockroach-style-control-plane-priority-convergence-class.md

## Borrowing Details

What is borrowed:

1. Critical metadata gets a distinct resilience/admission class.
2. The class is stricter for correctness traffic than for ordinary diagnostic
   traffic.
3. Failure under pressure is typed and observable.

What is not borrowed:

1. CockroachDB range replication.
2. SQL zone configuration.
3. Operator-facing control surfaces.

Local implementation shape:

1. Define a constant-owned convergence class vocabulary.
2. Add one decision table mapping owner command plus pressure evidence to
   critical outcome.
3. Thread the class through existing publication owner and admin snapshot
   options.
4. Add focused pressure tests with injected failure/latency, not real delay.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/follow-on`
- Output profile: `medium`
- Owned files: this package file until activation; candidate runtime files may
  be promoted only after owner-files proof selects the critical convergence
  class path.
- Forbidden files: non-candidate runtime files, user-visible priority controls,
  unlimited queues, and Pro or Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/admin/admin-control-snapshot-class-part-2.js`
- Model ledger advisory: `escalate`

## Validation

1. npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown
2. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
3. node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/admin/admin-control-snapshot-class-part-2.js

## Implementation Evidence

- Added `critical_convergence` / ordinary diagnostic convergence vocabulary and
  threaded critical convergence metadata through membership publication,
  publication ACK, active-gate handoff, and owner recovery wake paths.
- Critical owner wake enqueue now records owner key, bounded queue size,
  retry-after, queue outcome, and typed pressure outcome; saturated bounded
  queues return `critical_rejected` instead of silently dropping work.
- Admin control snapshots and query results now expose
  `controlPlaneConvergence`, `criticalConvergenceDeferred`, and
  `ordinaryRepairDeferred` so repair deferral is not confused with critical
  convergence pressure.

## Validation Results

- PASS: `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown`
- PASS: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- PASS: `node --check src/control-plane/membership-publication-coordinator-class-stage-2.js`
- PASS: `node --check src/control-plane/membership-publication-coordinator-class-stage-3.js`
- PASS: `node --check src/admin/admin-control-snapshot-class-part-2.js`
- PASS: `node --check src/admin/admin-websocket-api-segment-3.js`
- PASS: `node test/control-plane/membership-publication-coordinator-main-stage-2.js`
- PASS: `npm test -- --grep "AdminControlSnapshot distinguishes critical convergence defer from ordinary repair defer" test/admin/admin-control-snapshot.test.js`
- PASS: `node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/control-plane/membership-publication-coordinator-class-stage-3.js src/admin/admin-control-snapshot-class-part-2.js`
- PASS: `node scripts/check-guideline-literals.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/control-plane/membership-publication-coordinator-class-stage-3.js src/control-plane/control-plane-error-classification.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-websocket-api-segment-3.js`
- PASS: `npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-coordinator-class-stage-2.js src/control-plane/membership-publication-coordinator-class-stage-3.js src/control-plane/control-plane-error-classification.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-websocket-api-segment-3.js`
- PASS: `npm run guard:guideline:constant-names:file -- src/control-plane/membership-publication-coordinator-class-stage-2.js src/control-plane/membership-publication-coordinator-class-stage-3.js src/control-plane/control-plane-error-classification.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-websocket-api-segment-3.js`
- PASS: `npm run work:validate -- --pre-impl work/packages/active-20260516-cockroach-style-control-plane-priority-convergence-class.md`
- PASS: `git diff --check -- work/packages/active-20260516-cockroach-style-control-plane-priority-convergence-class.md src/control-plane/membership-publication-coordinator-class-stage-2.js src/control-plane/membership-publication-coordinator-class-stage-3.js src/control-plane/control-plane-error-classification.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-websocket-api-segment-3.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/admin/admin-control-snapshot.test.js work/model-ledger.jsonl`
- RED: `node test/admin/admin-control-snapshot.test.js` remains red in
  pre-existing priority-recovery tail assertions unrelated to this package's
  critical convergence assertions; failing subtests include
  `AdminControlSnapshot exports publication convergence gate from live priority
  recovery readiness` and several
  `AdminControlSnapshot ... priority-recovery decision snapshots ...` tail
  cases.
