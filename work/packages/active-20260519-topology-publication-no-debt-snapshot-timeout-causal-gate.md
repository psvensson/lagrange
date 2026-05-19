# Topology Publication No-Debt Snapshot Timeout Causal Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-19",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Fresh rerun after the open-owner-reconcile fix is red but reduced: publicationConvergence is reported ready in the scenario error, pendingAck=0, missingPublished=0, pendingReconcile=0, priority residual witnesses=0, active=4/5, and snapshotCoverage=0/5. Generic route still reports topology_publication_owner / publication_convergence / publication_pending on unknown/no-revision evidence; handoff probe detects publication_ack_to_active_gate_reconcile_missing with selected snapshot source timeout.",
  "nextAction": "Run the causal-escalation gate, then classify and fix the no-debt publication_pending versus active-gate snapshot-timeout contract shape without another local patch unless focused proof identifies the exact owner move.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json",
    "npm run work:scenario-triage -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --markdown",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260519-topology-publication-no-debt-snapshot-timeout-causal-gate.md",
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
    "work/packages/active-20260519-topology-publication-no-debt-snapshot-timeout-causal-gate.md",
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
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --markdown"
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
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Classify and fix the no-debt publication_pending versus active-gate snapshot-timeout contract shape."
  },
  "causalGovernance": {
    "hypothesis": "The predecessor drained the publication-owner missing-published and owner-reconcile debt, but fresh evidence still labels publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending because publication observation is unknown/no-revision while active-gate snapshot coverage times out at 0/5.",
    "stopConditionCheck": "Use route-after-rerun, evidence summary, topology handoff probe, npm run analyze:causal-model, distributed failure summary, and focused proof before runtime edits. If focused proof cannot identify a local publication-owner move, classify architecture/owner-boundary migration instead of patching symptoms.",
    "expectedCausalModelChange": "Successor must reduce or remove the no-debt publication_pending label, build the missing publication-to-active-gate handoff contract, migrate to startup_active_gate_owner / snapshot_coverage, or turn representative rolling-restart green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh artifact reports active=4/5, snapshotCoverage=0/5, publication convergence ready in the scenario error, pendingAck=0, missingPublished=0, pendingReconcile=0, priority residual witnesses=0, and selected snapshot source timeout. Handoff probe detects publication_ack_to_active_gate_reconcile_missing and absent handoff contract.",
    "crossBoundaryReview": "Required before implementation: review must decide whether this is still a local topology publication owner route, a handoff contract gap, or an owner-boundary migration to startup active-gate snapshot coverage."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart no-debt publication_pending after owner reconcile",
    "phaseChain": [
      "predecessor routed active-gate owner-reconcile handoff through the publication owner",
      "representative rerun reduced missingPublished, pendingReconcile, priority residuals, and active-gate disagreement to zero",
      "generic route still reports publication_pending on unknown/no-revision evidence",
      "handoff probe detects missing publication-to-active-gate reconcile edge and active-gate snapshot timeout"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json.",
    "knownDownstreamBlockers": [
      "startup active-gate snapshot coverage timed out at 0/5",
      "selected snapshot source timeout on node 11601fe0-72d6-5853-8590-ec2881853e72",
      "one seed node readiness probe timed out while four nodes reached active"
    ],
    "missingCausalEdge": "Resolve whether no-debt publication_pending is stale owner evidence, a missing handoff contract, or active-gate snapshot coverage ownership.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --handoff-probe",
    "boundedProgressProof": "Run classification probes and only promote runtime files after the owner/contract decision has a concrete bounded progress mechanism: reconcile the missing handoff, advance stale publication evidence, or classify the snapshot timeout owner migration.",
    "boundedProgressProofArtifact": "work/packages/active-20260519-topology-publication-no-debt-snapshot-timeout-causal-gate.md and test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json",
    "expectedObservableTransition": "Reduce no-debt publication_pending, build the missing handoff, migrate to snapshot coverage, or turn representative rolling-restart green.",
    "maxProgressBound": "one focused successor before architecture or human escalation if the no-debt publication_pending shape is unchanged",
    "sameFrontierFallback": "If fresh representative evidence returns publication_pending with no concrete metric or shape reduction, stop for architecture or human escalation instead of another local patch.",
    "expectedNextFrontier": "resolved no-debt publication_pending, migrated active-gate snapshot coverage, representative green, or architecture/human escalation",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-remaining-owner-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-topology-publication-same-frontier-architecture-gate.md / topology_publication_owner / publication_convergence / same-frontier successor-selected",
      "work/packages/done-20260519-topology-publication-open-owner-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "This successor is allowed because the predecessor produced concrete metric reduction; unchanged same-frontier without a new decision forces architecture or human escalation.",
    "handoffInvariant": "Do not edit startup active-gate, operation workflow, readiness, admission, handoff architecture, or timeout files unless focused proof selects owner-boundary migration or architecture work."
  },
  "architectureDecisionGate": {
    "status": "watching",
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
      }
    ],
    "selectedChoice": "bounded-publication-owner-runtime-successor",
    "nextAction": "Run required review/fix/implementation sequencing before runtime edits."
  }
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

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for publication_pending.
- Inputs/signals: test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --markdown.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_pending and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | topology_publication_owner owns this decision before downstream consumers reinterpret it | Triage publication_ack_convergence with combined scenario evidence before runtime edits. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion. | npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.

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

1. Runtime ownership changes.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Progress And Attempt Ledger

Required when subagent sequencing is required. Each real subagent appends one checked checkpoint after every completed subtask; this combined ledger satisfies both Progress and Attempt proof when the item includes status, last checkpoint, parent action, evidence, and next or blocker.
Review agents may directly fix metadata-only package, sprint, tracker, current-blocker, ledger, or handoff findings and record `review-fixed-metadata-only`; runtime, test, script, report, or non-metadata fixes still require a separate fix subagent.

- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: started; last checkpoint: context loaded; parent action: pending; evidence: package, sprint, and handoff files read; next: first focused probe.
- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: running; last checkpoint: probe complete; parent action: pending; evidence: command and result; next: edit, validate, or blocker handoff.
- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: validated; last checkpoint: package proof refreshed; parent action: revalidated; evidence: commands and results; next: final handoff or successor action.
- [ ] Agent <name> (<agent-id>) <role> recovery: status: superseded; last checkpoint: replaced interrupted or partial-unvalidated attempt; parent action: superseded; evidence: superseding proof; next: continue from clean checkpoint.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-open-owner-reconcile-20260519T060754Z.report.json --markdown
