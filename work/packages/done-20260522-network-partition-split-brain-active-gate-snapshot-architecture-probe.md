# Architecture Probe - active gate snapshot source timeout

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "experiment",
  "scenario": "network-partition-split-brain",
  "artifact": "test-output/report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Scaffolded from representative evidence for active_gate_snapshot_coverage.",
  "nextAction": "Run an autonomous architecture experiment to distinguish whether same-frontier selected snapshot source timeout is caused by admin snapshot transport, selected-source selection, or a missing cross-node snapshot owner/watch contract before any further local runtime patch.",
  "proof": [
    "npm run work:evidence-summary -- test-output/report.json",
    "npm run analyze:topology-convergence -- test-output/report.json",
    "npm --silent run analyze:causal-model -- test-output/report.json"
  ],
  "writeScope": [
    "work/packages/done-20260522-network-partition-split-brain-active-gate-snapshot-architecture-probe.md"
  ],
  "handoffFiles": [
    "test-output/report.json",
    "work/packages/done-20260522-network-partition-split-brain-startup-active-gate-owner-snap.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
  ],
  "commitScope": [
    "work/packages/done-20260522-network-partition-split-brain-active-gate-snapshot-architecture-probe.md"
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
  "boundedExperiment": {
    "hypothesis": "H1: selected admin snapshot transport times out before owner observation can surface; H2: selected-source selection keeps choosing a node with no viable snapshot witness despite possible alternatives; H3: active-gate snapshot coverage needs a cross-node snapshot owner/watch contract instead of repeated per-node admin query repair.",
    "hypothesisDiscriminator": "H1 predicts probe witnesses show adminReady/reachable with query timeout and observation unknown for the selected node; H2 predicts at least one non-selected node has fresher coverage or deferred owner observation but loses selection; H3 predicts all per-node admin queries fail to provide coverage/owner state while internal owner queues or diagnostics show pending retry state.",
    "expectedMetric": "selectedSnapshotObservation fields, probeWitnesses coverage/error shape, selected-source choice versus alternative witnesses, and any owner queue/deferred retry state.",
    "inheritsFrom": "work/packages/done-20260522-network-partition-split-brain-startup-active-gate-owner-snap.md",
    "timebox": "24h",
    "mergeRequirement": "Experiment must distinguish H1/H2/H3 or close as evidence-incomplete before any further runtime-owner-boundary package.",
    "killRule": "If the probe cannot distinguish the selected-source architecture cause, stop runtime edits and escalate to architecture-contract or human evidence gap."
  },
  "validationTier": "cross-owner",
  "observablePrediction": {
    "metric": "selectedSnapshotObservation fields, probeWitnesses coverage/error shape, selected-source choice versus alternative witnesses, and any owner queue/deferred retry state.",
    "predicted": "selectedSnapshotObservation fields, probeWitnesses coverage/error shape, selected-source choice versus alternative witnesses, and any owner queue/deferred retry state.",
    "observed": "test-output/report.json confirms selected_snapshot_source_timeout on selected node 11601fe0-72d6-5853-8590-ec2881853e72 with snapshotCoverageNodeCount=0/3; selectedSnapshotObservation and owner/watch fields remain unknown.",
    "accuracy": "partial",
    "evidence": "test-output/report.json",
    "metricDelta": 0
  },
  "causalGovernance": {
    "hypothesis": "The post-runtime-fix representative artifact is no longer a safe local runtime patch target until an architecture probe distinguishes selected admin snapshot transport timeout, selected-source choice, or missing cross-node snapshot owner/watch contract.",
    "stopConditionCheck": "Run npm --silent run analyze:causal-model -- test-output/report.json and keep the package in experiment mode while the dominant failure class remains active_gate_snapshot_coverage_incomplete.",
    "expectedCausalModelChange": "The experiment should classify the missing owner edge as admin snapshot transport, selected-source selection, cross-node owner/watch contract, or evidence-incomplete without changing runtime behavior.",
    "representativeOutcome": "architecture-gap",
    "causalDebt": "Fresh post-fix representative evidence stayed same-frontier with snapshotCoverageNodeCount=0/3, selected_snapshot_source_timeout, selected snapshot observation fields unknown, selectedSnapshotRepairDeferred=false, publication ACK satisfied, and priority recovery satisfied.",
    "crossBoundaryReview": "Runtime files stay candidate-only until the probe records which owner or contract must move; no further local runtime patch is allowed from the unchanged same-frontier evidence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "network-partition-split-brain active_gate_snapshot_coverage selected snapshot source architecture probe",
    "phaseChain": [
      "publication ACK package satisfied the publication convergence frontier",
      "startup active-gate runtime package preserved structured deferred retry state in focused proof",
      "fresh representative rerun returned same-frontier active_gate_snapshot_coverage with no snapshot coverage movement",
      "architecture experiment must classify the selected snapshot source cause before another runtime package"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains deferred under active-gate no progress",
      "scenario_duration and active_gate_timeout budgets remain downstream exhausted budgets after active-gate no progress"
    ],
    "missingCausalEdge": "The selected snapshot source timeout lacks a proven owner edge that distinguishes admin query transport, selected-source witness choice, and cross-node snapshot owner/watch state.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/report.json",
    "falsifyingProbe": "npm --silent run analyze:causal-model -- test-output/report.json",
    "boundedProgressProof": "Bounded experiment proof must classify the timeout, retry, or owner-watch mechanism before any further runtime advance.",
    "boundedProgressProofArtifact": "test-output/report.json",
    "expectedObservableTransition": "architecture-gap classification identifies admin snapshot transport, selected-source selection, cross-node snapshot owner/watch contract, or evidence-incomplete.",
    "maxProgressBound": "one autonomous architecture experiment before runtime promotion",
    "sameFrontierFallback": "If the probe cannot distinguish H1/H2/H3 from the existing artifact and focused extractors, escalate to architecture-contract or human evidence gap instead of another local patch.",
    "expectedNextFrontier": "classified architecture route for the active-gate snapshot source timeout",
    "resultClassification": "architecture-gap",
    "stopCondition": "architecture-gap-stop"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "architecture-gap",
    "triggerEvidence": [
      "The predecessor runtime package reran representative split-brain evidence after a focused active-gate repair and returned the same active_gate_snapshot_coverage frontier.",
      "snapshotCoverageNodeCount stayed 0/3 and selected snapshot observation fields stayed unknown, so another local runtime patch is blocked until an architecture experiment distinguishes the cause."
    ],
    "selectedChoice": "open-architecture-package",
    "choices": [
      {
        "id": "open-architecture-package",
        "summary": "Run this bounded autonomous architecture experiment before any further runtime package.",
        "route": "architecture-package",
        "proof": [
          "npm run work:evidence-summary -- test-output/report.json",
          "npm run analyze:topology-convergence -- test-output/report.json",
          "npm --silent run analyze:causal-model -- test-output/report.json"
        ]
      }
    ],
    "nextAction": "Execute the active-gate snapshot architecture probe and record whether the next route is transport, selected-source selection, cross-node owner/watch contract, or evidence-incomplete."
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "evidence-incomplete",
    "decision": "evidence-incomplete",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "snapshot_coverage",
    "evidence": "test-output/report.json"
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
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/report.json",
      "npm run analyze:topology-convergence -- test-output/report.json",
      "npm --silent run analyze:causal-model -- test-output/report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-architecture-experiment",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "architecture_gap",
    "nextLane": "experiment",
    "expectedDelta": "Distinguish the architecture route for same-frontier active_gate_snapshot_coverage after no metric reduction: admin snapshot transport, selected-source selection, cross-node snapshot owner/watch contract, or evidence-incomplete.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260522-active-gate-snapshot-witness-diagnostics.md"
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: success criterion is information from a bounded hypothesis discriminator, not runtime metric movement.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.



## Bounded Experiment

- Hypothesis: H1: selected admin snapshot transport times out before owner observation can surface; H2: selected-source selection keeps choosing a node with no viable snapshot witness despite possible alternatives; H3: active-gate snapshot coverage needs a cross-node snapshot owner/watch contract instead of repeated per-node admin query repair.
- Hypothesis discriminator: H1 predicts probe witnesses show adminReady/reachable with query timeout and observation unknown for the selected node; H2 predicts at least one non-selected node has fresher coverage or deferred owner observation but loses selection; H3 predicts all per-node admin queries fail to provide coverage/owner state while internal owner queues or diagnostics show pending retry state.
- Expected metric: selectedSnapshotObservation fields, probeWitnesses coverage/error shape, selected-source choice versus alternative witnesses, and any owner queue/deferred retry state.
- Inherits from: `work/packages/done-20260522-network-partition-split-brain-startup-active-gate-owner-snap.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: Experiment must distinguish H1/H2/H3 or close as evidence-incomplete before any further runtime-owner-boundary package.
- Kill rule: If the probe cannot distinguish the selected-source architecture cause, stop runtime edits and escalate to architecture-contract or human evidence gap.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.

## Observable Prediction

- Metric: selectedSnapshotObservation fields, probeWitnesses coverage/error shape, selected-source choice versus alternative witnesses, and any owner queue/deferred retry state.
- Predicted: selectedSnapshotObservation fields, probeWitnesses coverage/error shape, selected-source choice versus alternative witnesses, and any owner queue/deferred retry state.
- Observed: `test-output/report.json` now confirms a selected admin snapshot source timeout on node `11601fe0-72d6-5853-8590-ec2881853e72` with 0/3 snapshot coverage; however, `selectedSnapshotObservation*` and owner/watch/deferred-retry fields remain `unknown`.
- Accuracy: `partial` for H1 signal (`selected_snapshot_source_timeout`) and `insufficient` for H2/H3 discrimination.
- Evidence: canonical outputs are `npm run work:evidence-summary -- test-output/report.json`; `npm run analyze:topology-convergence -- test-output/report.json`; `npm --silent run analyze:causal-model -- test-output/report.json`.
- Closure compares predicted vs observed before the package can close.

## Experiment Outcome

- Classification: `evidence-incomplete`
- Result: canonical evidence narrows toward `H1` (admin snapshot transport timeout on selected source) but cannot exclude `H2` or `H3` because there is no per-node alternative-source witness comparison and all `selectedSnapshotObservation*`/owner-watch fields are `unknown`.
- Blocker: need a focused follow-up artifact that exposes alternative witness states or cross-node snapshot owner/watch contract signals; no runtime scope changes are made in this package.

## Expected Representative Delta

- Baseline artifact: `test-output/report.json`
- Expected delta: Distinguish the architecture route for same-frontier active_gate_snapshot_coverage after no metric reduction: admin snapshot transport, selected-source selection, cross-node snapshot owner/watch contract, or evidence-incomplete.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `architecture_gap`
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

1. work/packages/done-20260522-network-partition-split-brain-active-gate-snapshot-architecture-probe.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/done-20260522-network-partition-split-brain-active-gate-snapshot-architecture-probe.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/report.json`, `npm run analyze:topology-convergence -- test-output/report.json`, `npm --silent run analyze:causal-model -- test-output/report.json`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: one probe that distinguishes hypotheses; success is information, not runtime metric movement
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Keep runtime behavior frozen until the probe distinguishes competing hypotheses.
2. Promote only the discriminated owner/boundary into a follow-on runtime or architecture package.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: `npm run work:package:doctor -- --suggest work/packages/done-20260522-network-partition-split-brain-active-gate-snapshot-architecture-probe.md` (pass), `npm run work:evidence-summary -- test-output/report.json` (pass), `npm run analyze:topology-convergence -- test-output/report.json` (pass), `npm --silent run analyze:causal-model -- test-output/report.json` (pass), `npm run work:validate -- --pre-impl work/packages/done-20260522-network-partition-split-brain-active-gate-snapshot-architecture-probe.md` (pass); classification: `evidence-incomplete`; changed files: `work/packages/done-20260522-network-partition-split-brain-active-gate-snapshot-architecture-probe.md`; parent revalidated focused proof: yes; next: keep in architecture experiment lane, route successor after adding an evidence-boosting artifact.
- [x] verification-fix: status: validated; evidence: `npm run work:package:doctor -- --suggest work/packages/done-20260522-network-partition-split-brain-active-gate-snapshot-architecture-probe.md` (pass), `npm run work:evidence-summary -- test-output/report.json` (pass), `npm run analyze:topology-convergence -- test-output/report.json` (pass), `npm --silent run analyze:causal-model -- test-output/report.json` (pass), `npm run work:validate -- --closure work/packages/done-20260522-network-partition-split-brain-active-gate-snapshot-architecture-probe.md` (pass); changed files: `work/packages/done-20260522-network-partition-split-brain-active-gate-snapshot-architecture-probe.md`; parent revalidated focused proof: yes; next: closure or successor action.
- [x] implementation falsification: status: validated; evidence: `npm run work:evidence-summary -- test-output/report.json`, `npm run analyze:topology-convergence -- test-output/report.json`, and `npm --silent run analyze:causal-model -- test-output/report.json` all keep `startup_active_gate_owner / snapshot_coverage / active_gate_timed_out`; last checkpoint: discriminator preserved and wrong-slice signal checked; wrong-slice evidence would be canonical outputs reselecting a different owner/boundary/dominant reason or providing a concrete H2/H3 discriminator; next: `Evidence-incomplete` requires architectural follow-up package.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card after recording evidence-incomplete experiment outcome; next: validation.

## Validation

1. PASS - `npm run work:evidence-summary -- test-output/report.json`
2. PASS - `npm run analyze:topology-convergence -- test-output/report.json`
3. PASS - `npm --silent run analyze:causal-model -- test-output/report.json`
4. PASS - `npm run work:package:doctor -- --suggest work/packages/done-20260522-network-partition-split-brain-active-gate-snapshot-architecture-probe.md`
5. PASS - `npm run work:validate -- --pre-impl work/packages/done-20260522-network-partition-split-brain-active-gate-snapshot-architecture-probe.md`

## Commit And Push Ledger

1. Focused package commit: a692743a52975fe2d7911cb45de14e94defe8819
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
