# Implement or classify the publication-recovery producer transition for unpublished_observation / no_revision / not_started

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-20",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Causal-escalation gate selected this bounded runtime successor. Fresh evidence still reports publicationStatus=unknown, publicationPending=true, recoveryProtocolState=unpublished_observation, publicationOwnerFreshnessFence=no_revision, publicationOwnerRecoveryOutcome=not_started, publicationOwnerRevisionState=unavailable, and publicationOwnerStreamOutcome=not_started.",
  "nextAction": "Implement the bounded publication-recovery producer transition for unpublished_observation / no_revision / not_started in publicationConvergence, keeping downstream active-gate/readiness scope frozen.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --explain publication_ack_convergence",
    "node --test test/control-plane/publication-recovery-evidence.test.js",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json",
    "npm run work:scenario-triage -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --markdown",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260519-topology-publication-recovery-producer-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-recovery-evidence.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260519-topology-publication-unpublished-observation-producer-runtime.md",
    "test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-owner-state.js",
    "src/control-plane/priority-recovery-observation-snapshot-stage-4.js"
  ],
  "commitScope": [
    "work/packages/active-20260519-topology-publication-recovery-producer-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-recovery-evidence.test.js"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The publication owner producer is emitting unpublished_observation / no_revision / not_started even after the source handoff outcome projection is present. The smallest selected runtime successor is the publication-recovery producer path that builds publicationConvergence.",
    "stopConditionCheck": "Before runtime edits, run npm run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json and npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --explain publication_ack_convergence, then confirm the current action remains publication-recovery producer work rather than downstream active-gate/readiness work.",
    "expectedCausalModelChange": "Focused owner proof should move publicationConvergence producer fields away from unknown / unpublished_observation / no_revision / not_started, or explicitly classify that state as an intentional bounded owner outcome.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh evidence still reports publicationStatus=unknown, publicationPending=true, recoveryProtocolState=unpublished_observation, publicationOwnerFreshnessFence=no_revision, publicationOwnerRecoveryOutcome=not_started, publicationOwnerRevisionState=unavailable, publicationOwnerStreamOutcome=not_started, while active-gate source now carries membershipPublicationHandoffOutcomeState=write_deferred.",
    "crossBoundaryReview": "The predecessor causal gate selected src/control-plane/publication-recovery-evidence.js as the primary owner producer. Startup active-gate, startup readiness, operation workflow, admission, and timeout stay frozen."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after publication owner handoff outcome source projection",
    "phaseChain": [
      "queue drain runtime preserved retryable owner queue drain state and reduced priority residual witnesses to 0",
      "diagnostics package surfaced publication_active_gate_handoff_contract_pending and write_deferred / owner_reconcile_pending",
      "owner-outcome runtime package made fresh source reports carry membershipPublicationHandoffOutcomeState=write_deferred",
      "causal-escalation gate selected publication-recovery producer runtime work for unpublished_observation / no_revision / not_started"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json.",
    "knownDownstreamBlockers": [
      "activeGateState=timed_out",
      "snapshotCoverageNodeCount=0/5",
      "selectedSnapshotSourceCause=selected_snapshot_source_timeout",
      "publicationActiveGateHandoffState=pending",
      "membershipPublicationHandoffOutcome=write_deferred / owner_reconcile_pending",
      "runtimePromotionAllowed=false"
    ],
    "missingCausalEdge": "publication-recovery producer still reports unpublished_observation / no_revision / not_started after the handoff outcome projection reduced.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --explain publication_ack_convergence",
    "boundedProgressProof": "Move or classify the publication-recovery producer reconcile/progress state without touching downstream owners.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json",
    "expectedObservableTransition": "publicationConvergence producer fields move away from unknown / unpublished_observation / no_revision / not_started, or the owner emits an explicit bounded state.",
    "maxProgressBound": "one runtime-owner-boundary source package before downstream active-gate/readiness edits",
    "sameFrontierFallback": "If focused proof cannot change or classify the producer state, stop for architecture or human escalation instead of adding another local patch.",
    "expectedNextFrontier": "publication producer state reduced, owner-boundary migration, architecture stop, or human stop",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260519-topology-publication-unpublished-observation-producer-runtime.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260519-topology-publication-active-gate-handoff-owner-outcome-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-topology-publication-active-gate-handoff-outcome-diagnostics-runtime.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "Runtime work is allowed only because the causal-escalation gate selected the publication-recovery producer successor from fresh route, explain, causal-model, and Hume source-slice proof.",
    "handoffInvariant": "The publication owner emits one typed publication convergence producer state before downstream active-gate/readiness consumers reinterpret the residual."
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Publication convergence producer fields move away from publicationStatus=unknown, recoveryProtocolState=unpublished_observation, publicationOwnerFreshnessFence=no_revision, and publicationOwnerRecoveryOutcome=not_started, or focused proof classifies that state as intentional bounded owner output.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-20",
  "commitAndPushLedgerRequired": true
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

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for publication_pending.
- Inputs/signals: test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --markdown.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_pending and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | topology_publication_owner owns this decision before downstream consumers reinterpret it | Implement or classify the publication-recovery producer transition for unpublished_observation / no_revision / not_started. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion. | npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json`
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
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --markdown`
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

Preferred closure evidence for new packages. Agent identity is optional provenance; implementation proof, scope, status, and parent revalidation are blocking.
Use legacy subagent ledgers only when the package explicitly requires sequenced subagents.
If review directly fixes metadata-only findings, record `review-fixed-metadata-only` as execution evidence and continue without a separate fix package.

- [x] review: status: not-needed; evidence: clean; next: next.
- [x] implementation: status: validated; evidence: node --test test/control-plane/publication-recovery-evidence.test.js passed all 220 unit tests successfully.; parent revalidated focused proof: yes; next: closure.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed; next: validation.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-owner-outcome-20260519T193101Z.report.json --markdown

