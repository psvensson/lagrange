# Topology Publication Active Gate Handoff Oscillation

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Fresh representative evidence after the active-gate forced-snapshot refresh-debt fallback is still red and moves first frontier back to publication_ack_convergence under topology_publication_owner / publication_convergence with publication_pending. Active-gate snapshot coverage is now downstream with snapshotCoverage=0/5 and a forced authoritative snapshot repair error. The sprint re-entry gate requires one cross-boundary causal package before more tactical runtime edits.",
  "nextAction": "Use the fresh oscillation artifact to build a replayable publication-to-active-gate handoff probe before promoting more runtime files; explain why publication_ack_convergence returns to first frontier after active-gate forced repair wakes authoritative snapshot repair.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain publication_ack_convergence",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260515-topology-publication-active-gate-handoff-oscillation.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md",
    "work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "test/distributed/harness/cluster-segment-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js"
  ],
  "commitScope": [
    "work/packages/active-20260515-topology-publication-active-gate-handoff-oscillation.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-causal-escalation",
    "escalationTriggers": [
      "runtime files are promoted before a replayable missing-edge probe is named",
      "fresh evidence stops oscillating and selects one owner boundary with monotonic reduction",
      "operation_workflow_owner becomes the canonical first frontier"
    ]
  },
  "representativeResidual": {
    "status": "live-red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Build a replayable missing-edge probe for the publication-to-active-gate handoff before promoting runtime files."
  },
  "causalGovernance": {
    "hypothesis": "Publication convergence and active-gate snapshot coverage are not independent residuals; the missing edge is the handoff that should make publication ACK state, authoritative snapshot repair, and active-gate coverage move monotonically in the same representative run.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "expectedCausalModelChange": "publication_ack_convergence and active_gate_snapshot_coverage become a single replayable handoff fixture with a named missing edge, or the package classifies why no bounded runtime fix should proceed.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The frontier has oscillated between topology_publication_owner / publication_convergence and startup_active_gate_owner / snapshot_coverage across successive focused fixes. The latest active-gate fix removed stale repair-deferred evidence but exposed publication_pending again, with active-gate coverage downstream at 0/5.",
    "crossBoundaryReview": "Review/fix/implementation subagent sequencing is required before implementation. Runtime files remain candidates only until the package records a replayable missing-edge probe."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / publication-to-active-gate handoff after forced snapshot refresh-debt fallback",
    "phaseChain": [
      "publication owner-stream migration proof",
      "active-gate forced snapshot fallback proof",
      "fresh oscillation artifact extraction",
      "publication-to-active-gate missing-edge probe",
      "focused handoff repair or architecture-gap classification"
    ],
    "currentFirstFrontier": "publication_ack_convergence under topology_publication_owner / publication_convergence with publication_pending in test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "knownDownstreamBlockers": [
      "active_gate_snapshot_coverage remains blocked downstream with activeGate=timed_out, snapshotCoverage=0/5, and forced authoritative snapshot repair error",
      "readiness_startup_support is deferred as inherited_active_gate_no_progress",
      "scenario_duration and active_gate_timeout budgets are exhausted",
      "priority_recovery_partition_progress remains classified as satisfied"
    ],
    "missingCausalEdge": "Publication ACK convergence, forced authoritative snapshot repair, and active-gate coverage do not produce a monotonic handoff in the same representative run.",
    "missingCausalEdgeProbe": "Initial extractor proof is npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain publication_ack_convergence; replayable publication-to-active-gate handoff probe remains pending-before-runtime-promotion and must be constructed before runtime files are promoted.",
    "boundedProgressProof": "Pending implementation; first proof must name a replayable wake/retry/reconcile/advance handoff probe before runtime files are promoted.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "expectedObservableTransition": "The package either creates a replayable handoff probe and reduces the oscillation, or closes as architecture-gap/classification-only with a named missing-edge reason.",
    "maxProgressBound": "one cross-boundary causal package slice with canonical extractors, subagent sequencing, focused missing-edge probe, and representative result classification",
    "sameFrontierFallback": "If fresh evidence still selects publication_ack_convergence with the same downstream active-gate forced repair error, keep this package active rather than creating another publication-only successor.",
    "expectedNextFrontier": "a named publication-to-active-gate missing-edge probe, not another tactical owner-only package",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md / startup_active_gate_owner / snapshot_coverage / migrated-to-publication",
      "work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md / topology_publication_owner / publication_convergence / migrated-to-active-gate",
      "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md / startup_active_gate_owner / snapshot_coverage / migrated-to-publication"
    ],
    "oscillationCheck": "This package exists because the frontier returned from active_gate_snapshot_coverage to publication_ack_convergence after focused active-gate repair. Do not split again unless canonical evidence stops oscillating or a new first-frontier owner appears.",
    "handoffInvariant": "No runtime implementation starts until the package records a replayable publication-to-active-gate handoff probe or explicitly classifies why the probe cannot be built."
  },
  "predecessor": "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md"
}
-->

## Why

The last two focused runtime packages alternated the representative first
frontier between publication convergence and active-gate snapshot coverage. The
latest active-gate package fixed a real local symptom: forced snapshot repair
now escalates repair-deferred refresh debt instead of reusing stale local
snapshot evidence. The fresh representative artifact still fails, but it fails
earlier at publication convergence while active-gate coverage is downstream.

This package owns the cross-boundary handoff. Its first deliverable is not a
runtime patch; it is a replayable missing-edge probe that explains why
publication ACK state, forced authoritative snapshot repair, and active-gate
coverage do not move monotonically in one run.

## Scope Basis

AGPL topology convergence release-gate closure. The work is bounded to the
rolling-restart causal chain and may promote runtime files only after the
missing-edge probe names the exact owner boundary and write scope.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the representative evidence now spans two
  runtime owners and the sprint re-entry gate requires cross-boundary causal
  proof before more tactical runtime edits.
- Escalation trigger to a heavier lane: the missing-edge probe cannot be built
  from existing artifacts, or fresh evidence promotes operation workflow to the
  canonical first frontier.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260515-topology-publication-active-gate-handoff-oscillation.md
2. work/sprints/active-2026-q2-topology-convergence-residual-closure.md
3. work/model-ledger.jsonl

## Out Of Scope

1. Runtime ownership changes before replayable missing-edge proof exists.
2. Another single-owner publication or active-gate package unless canonical
   evidence stops oscillating.

## Subagent Sequencing Ledger

Required before implementation because this causal package spans runtime owner
boundaries.

- [x] Review subagent recorded:
      Agent Singer (019e2ab2-1507-7f71-b478-50b0861eafc7) reviewed work/packages/active-20260515-topology-publication-active-gate-handoff-oscillation.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed:
      Agent Plato (019e2ab5-acfe-76e2-9138-eec7ae823b7d) fixed work/packages/active-20260515-topology-publication-active-gate-handoff-oscillation.md
- [ ] Implementation subagent recorded:
      pending-before-implementation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-causal-escalation`
- Owned files: `work/packages/active-20260515-topology-publication-active-gate-handoff-oscillation.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/model-ledger.jsonl`
- Forbidden files: runtime files until the missing-edge probe promotes exact paths into write scope
- Frozen decisions: active-gate forced snapshot refresh-debt fallback is closed; current frontier oscillation must be handled cross-boundary.
- Escalation triggers: runtime files promoted before probe, fresh evidence selects operation_workflow_owner first, or the handoff cannot be replayed from available artifacts.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain publication_ack_convergence`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain publication_ack_convergence
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain active_gate_snapshot_coverage
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json
5. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json
6. npm run work:validate -- --entry
