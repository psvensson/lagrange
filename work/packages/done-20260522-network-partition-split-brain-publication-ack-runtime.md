# Network Partition Split Brain Publication Ack Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "runtime-owner-boundary",
  "scenario": "network-partition-split-brain",
  "artifact": "test-output/report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "pending_acks_present",
  "currentState": "Focused proof is green and the fresh network-partition-split-brain representative rerun moved publication_ack_convergence to satisfied: pendingAckCount=0 and pendingAckNodeIds is empty. The first frontier migrated to startup_active_gate_owner / snapshot_coverage with active_gate_timed_out.",
  "nextAction": "Close this topology_publication_owner / publication_convergence package as migrated, then activate a startup_active_gate_owner / snapshot_coverage successor for active_gate_timed_out from the refreshed representative artifact.",
  "proof": [
    "npm run work:evidence-summary -- test-output/report.json",
    "npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence",
    "npm run analyze:topology-convergence -- test-output/report.json",
    "npm --silent run analyze:causal-model -- test-output/report.json",
    "PROOF=focused-contract-fixture-and-affected-consumer npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-owner-stream.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "writeScope": [
    "work/packages/done-20260522-network-partition-split-brain-publication-ack-runtime.md",
    "work/sprints/active-2026-q2-universal-owner-contract-completion.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260522-network-partition-split-brain-topology-publication-owner-pub.md",
    "work/packages/done-20260522-split-brain-scenario-safety-invariants.md",
    "test-output/report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/workflow/owner-key-reconcile-queue.js",
    "test/workflow/owner-key-reconcile-queue.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260522-network-partition-split-brain-publication-ack-runtime.md",
    "work/sprints/active-2026-q2-universal-owner-contract-completion.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 2,
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
      "npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence",
      "npm run analyze:topology-convergence -- test-output/report.json",
      "npm --silent run analyze:causal-model -- test-output/report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "pending_acks_present",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Focused proof should clear pendingAckCount/pendingAckNodeIds for the healed epoch-2 publication, reduce publication_ack_convergence to a later owner boundary, turn representative evidence green, or record architecture/human stop with concrete evidence.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "observablePrediction": {
    "metric": "publication_ack_convergence pending acknowledgement state",
    "predicted": "Focused publication-owner proof should either reduce pendingAckCount/pendingAckNodeIds for epoch 2 or expose structured retry/reconcile state owned by topology_publication_owner.",
    "observed": "fresh representative rerun satisfied publication_ack_convergence with pendingAckCount=0 and pendingAckNodeIds empty; first frontier migrated to active_gate_snapshot_coverage.",
    "accuracy": "partial",
    "evidence": "test-output/report.json",
    "metricDelta": 1
  },
  "causalGovernance": {
    "hypothesis": "The healed network-partition split-brain artifact is blocked by a topology publication acknowledgement that remains OPEN with pendingAckNodeIds containing 11601fe0-72d6-5853-8590-ec2881853e72 even though partition-safety checks passed.",
    "stopConditionCheck": "Before runtime edits, run npm --silent run analyze:causal-model -- test-output/report.json and confirm the failed invariant remains publication_ack_closed under topology_publication_owner / publication_convergence.",
    "expectedCausalModelChange": "The bounded runtime slice should clear or structurally explain the pending acknowledgement without editing downstream active-gate, readiness, operation-workflow, admission, or timeout paths.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh artifact now reports publication_ack_convergence satisfied with pendingAckCount=0, pendingAckNodeIds empty, recoveryProtocolState=unpublished_observation, publicationOwnerAckState=not_required, and priority recovery satisfied. The remaining first frontier is active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with active_gate_timed_out.",
    "crossBoundaryReview": "Architecture/local-proof gate selected one bounded publication owner runtime slice after the classifier; fresh representative evidence migrated ownership to startup_active_gate_owner / snapshot_coverage."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "network-partition-split-brain publication_ack_convergence pending ACK after heal",
    "phaseChain": [
      "split-brain partition safety passed focused scenario proof",
      "representative rerun migrated to topology publication acknowledgement convergence",
      "classification proof selected publication owner runtime work",
      "runtime successor must move the epoch-2 pending ACK state"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "pending ack node 11601fe0-72d6-5853-8590-ec2881853e72",
      "publicationStatus=OPEN",
      "publicationOwnerAckState=waiting_for_ack",
      "publicationOwnerFreshnessFence=ack_lag",
      "priority recovery edge is satisfied"
    ],
    "missingCausalEdge": "The publication owner must either observe the healed node acknowledgement or retain a structured retry/reconcile outcome for the epoch-2 pending ACK.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/report.json",
    "boundedProgressProof": "Focused owner tests must prove the publication ACK state machine, recovery gate, or owner evidence path clears the pending node or emits structured retry/reconcile state before representative rerun.",
    "boundedProgressProofArtifact": "test-output/report.json",
    "falsifyingProbe": "npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-owner-stream.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "expectedObservableTransition": "pendingAckCount/pendingAckNodeIds reduce, publication_ack_convergence migrates, representative evidence greens, or architecture/human stop is recorded with concrete evidence.",
    "maxProgressBound": "one selected runtime-owner-boundary package before rerun or renewed causal escalation",
    "sameFrontierFallback": "If focused proof cannot move or structurally explain the pending ACK state, stop before patching downstream active-gate or readiness symptoms.",
    "expectedNextFrontier": "startup active-gate snapshot coverage successor",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260522-network-partition-split-brain-topology-publication-owner-pub.md / topology_publication_owner / publication_convergence / classification-only",
      "work/packages/done-20260522-split-brain-scenario-safety-invariants.md / distributed_harness_scenario_owner / split_brain_partition_safety / migrated"
    ],
    "oscillationCheck": "This runtime package is allowed only because the classification package selected a bounded local-proof route for the stable topology_publication_owner / publication_convergence frontier.",
    "handoffInvariant": "Do not edit startup active-gate, startup readiness, operation-workflow, admission, timeout, or split-brain scenario files unless fresh representative evidence migrates ownership."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "Focused publication-owner proof preserved structured deferred/retry publication rows, and the fresh representative rerun satisfied publication_ack_convergence with pendingAckCount=0 before selecting active_gate_snapshot_coverage as the first frontier.",
    "evidence": [
      "PROOF=focused-contract-fixture-and-affected-consumer npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-owner-stream.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js",
      "node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain --contract split_brain_partition_safety",
      "npm run work:evidence-summary -- test-output/report.json",
      "npm run analyze:topology-convergence -- test-output/report.json",
      "npm --silent run analyze:causal-model -- test-output/report.json"
    ]
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "classifier selected runtime-owner-boundary successor",
      "topology-convergence first frontier remains publication_ack_convergence",
      "causal model failed invariant is publication_ack_closed",
      "priority recovery edge is satisfied"
    ],
    "choices": [
      {
        "id": "publication-ack-runtime-successor",
        "summary": "Implement one bounded publication owner ACK/retry/reconcile proof for the epoch-2 pending node.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence",
          "npm run analyze:topology-convergence -- test-output/report.json",
          "npm --silent run analyze:causal-model -- test-output/report.json"
        ]
      },
      {
        "id": "architecture-or-human-stop",
        "summary": "Stop if focused proof cannot distinguish publication-owner ACK debt from a contract or evidence gap.",
        "route": "human-escalation",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/report.json"
        ]
      }
    ],
    "selectedChoice": "publication-ack-runtime-successor",
    "nextAction": "Run required implementation and verifier-fixer sequencing, then implement the bounded publication ACK runtime slice."
  },
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260522-network-partition-split-brain-startup-active-gate-owner-snap.md"
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

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for pending_acks_present.
- Inputs/signals: test-output/report.json; npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence; npm run analyze:topology-convergence -- test-output/report.json; npm --silent run analyze:causal-model -- test-output/report.json; PROOF=focused-contract-fixture-and-affected-consumer npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-owner-stream.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps pending_acks_present and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / pending_acks_present | topology_publication_owner owns this decision before downstream consumers reinterpret it | Implement one bounded topology_publication_owner / publication_convergence fix so the OPEN epoch-2 publication either clears pending acknowledgement for node 11601fe0-72d6-5853-8590-ec2881853e72 after heal or preserves structured retry/reconcile state without patching downstream active-gate, readiness, operation-workflow, admission, or timeout paths. | Focused proof should clear pendingAckCount/pendingAckNodeIds for the healed epoch-2 publication, reduce publication_ack_convergence to a later owner boundary, turn representative evidence green, or record architecture/human stop with concrete evidence. | npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence`
- Competing explanations: At minimum compare pending_acks_present against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own pending_acks_present, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: pending_acks_present is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence`
- Success metrics: Focused proof should clear pendingAckCount/pendingAckNodeIds for the healed epoch-2 publication, reduce publication_ack_convergence to a later owner boundary, turn representative evidence green, or record architecture/human stop with concrete evidence.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/report.json`
- Expected delta: Focused proof should clear pendingAckCount/pendingAckNodeIds for the healed epoch-2 publication, reduce publication_ack_convergence to a later owner boundary, turn representative evidence green, or record architecture/human stop with concrete evidence.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `pending_acks_present`
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

1. work/packages/done-20260522-network-partition-split-brain-publication-ack-runtime.md
2. work/sprints/active-2026-q2-universal-owner-contract-completion.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/control-plane/publication-recovery-evidence.js
7. src/control-plane/publication-recovery-gate.js
8. src/control-plane/publication-owner-evidence.js
9. src/control-plane/publication-owner-decision.js
10. src/control-plane/membership-publication-coordinator-class-stage-2.js
11. src/control-plane/membership-publication-coordinator-class-stage-3.js
12. test/control-plane/publication-recovery-evidence.test.js
13. test/control-plane/publication-recovery-gate.test.js
14. test/control-plane/publication-owner-stream.test.js
15. test/control-plane/membership-publication-coordinator-main-stage-2.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260522-network-partition-split-brain-publication-ack-runtime.md`, `work/sprints/active-2026-q2-universal-owner-contract-completion.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-recovery-evidence.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `src/control-plane/membership-publication-coordinator-class-stage-3.js`, `test/control-plane/publication-recovery-evidence.test.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/membership-publication-coordinator-main-stage-2.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence`, `npm run analyze:topology-convergence -- test-output/report.json`, `npm --silent run analyze:causal-model -- test-output/report.json`, `PROOF=focused-contract-fixture-and-affected-consumer npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-owner-stream.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js`
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

- [x] implementation: status: validated; evidence: preserved the active-gate membership publication row through deferred/readback error paths in `src/control-plane/membership-publication-coordinator-class-stage-2.js`; `PROOF=focused-contract-fixture-and-affected-consumer npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-owner-stream.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js` passed 684/684; parent revalidated focused proof: yes; next: representative rerun and successor action.
- [x] verification-fix: status: validated; evidence: separate verifier-fixer replaced the new deferred-row `null` control sentinel with the existing `ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_OUTCOME` sentinel; changed files: `src/control-plane/membership-publication-coordinator-class-stage-2.js`; verifier reran the focused proof with 684/684 pass; parent revalidated focused proof: yes; next: closure or successor action.
- [x] representative-rerun: status: validated; evidence: `node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain --contract split_brain_partition_safety` failed 0/1 after 165.2s but moved publication ACK to satisfied; `npm run work:evidence-summary -- test-output/report.json`, `npm run analyze:topology-convergence -- test-output/report.json`, and `npm --silent run analyze:causal-model -- test-output/report.json` route the first frontier to `active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out`; next: activate successor package.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card from the migrated representative route; next: validation.

## Validation

1. npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence
2. npm run analyze:topology-convergence -- test-output/report.json
3. npm --silent run analyze:causal-model -- test-output/report.json
4. PROOF=focused-contract-fixture-and-affected-consumer npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-owner-stream.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js
5. node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain --contract split_brain_partition_safety
6. npm run work:scenario-route -- test-output/report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage

## Commit And Push Ledger

1. Focused package commit: a692743a52975fe2d7911cb45de14e94defe8819
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
