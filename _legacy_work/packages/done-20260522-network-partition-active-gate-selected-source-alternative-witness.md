# Network Partition Active Gate Selected Source Alternative Witness

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "runtime-owner-boundary",
  "scenario": "network-partition-split-brain",
  "artifact": "test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused selected-source alternative witness proof passed, but the fresh representative rerun remains same-frontier: selected_snapshot_source_timeout persists with snapshotCoverageNodeCount=0/3 while selectedSnapshotAdminReady=true and alternativeSnapshotWitnessAvailable=true.",
  "nextAction": "Stop local runtime patching for this same-frontier edge and activate an autonomous architecture experiment to distinguish selected-source fallback debt from a deeper snapshot/watch owner handoff gap.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe",
    "PROOF=focused-contract-fixture-and-affected-consumer npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "node scripts/check-guideline-literals.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
  ],
  "writeScope": [
    "work/packages/done-20260522-network-partition-active-gate-selected-source-alternative-witness.md",
    "work/sprints/active-2026-q2-universal-owner-contract-completion.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
  ],
  "handoffFiles": [
    "test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json",
    "test-output/report.json",
    "work/packages/done-20260522-active-gate-snapshot-witness-diagnostics.md",
    "work/packages/done-20260522-network-partition-split-brain-active-gate-snapshot-architecture-probe.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/control-plane/control-plane-snapshot-owner.js"
  ],
  "commitScope": [
    "work/packages/done-20260522-network-partition-active-gate-selected-source-alternative-witness.md",
    "work/sprints/active-2026-q2-universal-owner-contract-completion.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
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
  "observablePrediction": {
    "metric": "selected_snapshot_source_timeout and snapshotCoverageNodeCount for active_gate_snapshot_coverage",
    "predicted": "Focused proof should preserve or use an alternative snapshot witness when the selected admin-reachable snapshot source times out; representative evidence should clear selected_snapshot_source_timeout, increase snapshotCoverageNodeCount above 0/3, migrate frontier, or record concrete architecture stop evidence.",
    "observed": "Focused proof passed (9/9) including alternative-witness fallback. Fresh representative rerun `test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json` returned same-frontier: `active_gate_snapshot_coverage` / `startup_active_gate_owner` / `snapshot_coverage` with `selected_snapshot_source_timeout`, snapshotCoverageNodeCount=0/3, selectedSnapshotAdminReady=true, and alternativeSnapshotWitnessAvailable=true. The package stop is now an architecture experiment before more local runtime patching.",
    "accuracy": "partial",
    "evidence": "node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain --output test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --fast-local --verbose; npm run work:evidence-summary -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json; npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe; npm --silent run analyze:causal-model -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json; npm run work:package:route-after-rerun -- --artifact test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
    "metricDelta": 0
  },
  "causalGovernance": {
    "hypothesis": "The same-frontier active-gate snapshot blocker persists because selected-source handling burns the snapshot lane on an admin-reachable selected node even though the canonical diagnostics now expose an alternative snapshot witness.",
    "stopConditionCheck": "After focused proof and fresh representative rerun, run npm --silent run analyze:causal-model -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json and confirm whether the dominant failure class moved.",
    "expectedCausalModelChange": "The bounded selected-source fallback should remove selected_snapshot_source_timeout, increase snapshotCoverageNodeCount above 0/3, migrate the first frontier, or expose a concrete architecture stop without editing publication ACK, readiness, priority recovery, or diagnostics-only code.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Fresh representative rerun shows selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, selected_snapshot_source_timeout on node 11601fe0-72d6-5853-8590-ec2881853e72, alternativeSnapshotWitnessAvailable=true, owner/watch state absent, publication ACK satisfied, priority recovery satisfied, and snapshotCoverageNodeCount still 0/3.",
    "crossBoundaryReview": "Diagnostics and publication/readiness/priority owners remain frozen for this package; unchanged same-frontier evidence requires an autonomous architecture experiment before another startup_active_gate_owner local runtime patch."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "network-partition-split-brain selected snapshot source alternative witness",
    "phaseChain": [
      "publication ACK package satisfied publication convergence",
      "startup active-gate runtime package preserved deferred handoff state in focused proof but representative evidence returned same-frontier",
      "architecture probe closed evidence-incomplete",
      "diagnostics package exposed selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, and alternativeSnapshotWitnessAvailable=true",
      "this package owns one bounded selected-source runtime proof"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains deferred under active-gate no progress",
      "scenario_duration and active_gate_timeout budgets remain downstream exhausted after active-gate no progress"
    ],
    "missingCausalEdge": "Selected-source snapshot coverage must avoid exhausting active-gate coverage on one admin-reachable selected snapshot timeout when a canonical alternative snapshot witness is available.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe",
    "falsifyingProbe": "PROOF=focused-contract-fixture-and-affected-consumer npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "boundedProgressProof": "Bounded selected-source fallback proof must show retry, alternate witness use, timeout preservation, or concrete architecture stop before representative rerun.",
    "boundedProgressProofArtifact": "test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json",
    "expectedObservableTransition": "selected_snapshot_source_timeout clears, snapshotCoverageNodeCount increases above 0/3, active_gate_snapshot_coverage migrates, representative evidence greens, or architecture stop is recorded with concrete evidence.",
    "maxProgressBound": "one selected-source runtime-owner-boundary package before rerun",
    "sameFrontierFallback": "If focused proof passes but representative evidence returns same-frontier with snapshotCoverageNodeCount=0/3 and selected_snapshot_source_timeout unchanged, stop local patching and reopen architecture contract or human evidence gap.",
    "expectedNextFrontier": "autonomous architecture experiment for the snapshot/watch owner handoff gap before runtime promotion",
    "resultClassification": "same-frontier",
    "stopCondition": "architecture-gap-stop"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Recent same-frontier runtime work returned to startup_active_gate_owner / snapshot_coverage.",
      "The intervening architecture and diagnostics packages produced new discriminator evidence: selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, and alternativeSnapshotWitnessAvailable=true.",
      "This selected route was one bounded local proof for the newly exposed selected-source alternative witness; the fresh representative rerun stayed same-frontier."
    ],
    "selectedChoice": "open-architecture-package",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Execute one bounded selected-source alternative witness proof inside startup_active_gate_owner / snapshot_coverage.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe",
          "PROOF=focused-contract-fixture-and-affected-consumer npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Stop local runtime work if the selected local proof cannot move the selected-source evidence.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe"
        ]
      }
    ],
    "nextAction": "Fresh representative evidence returned unchanged same-frontier after focused proof; activate `work/packages/done-20260522-network-partition-active-gate-snapshot-architecture-experiment.md` before any further local runtime patch."
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
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "same-frontier",
    "stopMode": "architecture-gap-stop",
    "nextLane": "experiment",
    "expectedDelta": "Same-frontier active-gate snapshot evidence must be resolved by an autonomous architecture experiment that distinguishes selected-source fallback gaps from a deeper snapshot/watch owner contract gap before another local runtime patch.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "activate the architecture experiment successor and update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260522-network-partition-active-gate-snapshot-architecture-experiment.md"
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

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json; npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe; npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js; node scripts/check-guideline-literals.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js; npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: same-frontier with architecture-gap stop.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Stop local runtime patching and activate the autonomous architecture experiment successor. | Focused proof passed, but fresh representative evidence stayed same-frontier with selected_snapshot_source_timeout and snapshotCoverageNodeCount=0/3. | npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run analyze:topology-convergence -- test-output/report.json --handoff-probe`
- Success metrics: Focused proof should show selected source timeout can preserve or use an alternative snapshot witness; representative evidence should clear selected_snapshot_source_timeout, increase snapshotCoverageNodeCount above 0/3, migrate frontier, or stop with concrete architecture evidence.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json`
- Expected delta: Focused proof should show selected source timeout can preserve or use an alternative snapshot witness; representative evidence should clear selected_snapshot_source_timeout, increase snapshotCoverageNodeCount above 0/3, migrate frontier, or stop with concrete architecture evidence.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `same-frontier`
- Stop mode: `architecture-gap-stop`
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

1. work/packages/done-20260522-network-partition-active-gate-selected-source-alternative-witness.md
2. work/sprints/active-2026-q2-universal-owner-contract-completion.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. test/distributed/harness/cluster-segment-7-class-5.js
7. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260522-network-partition-active-gate-selected-source-alternative-witness.md`, `work/sprints/active-2026-q2-universal-owner-contract-completion.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:topology-convergence -- test-output/report.json --handoff-probe`, `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `node scripts/check-guideline-literals.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
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

- [x] implementation: status: validated; evidence: `npm run work:evidence-summary -- test-output/report.json` (frontier remains `active_gate_snapshot_coverage`), `npm run analyze:topology-convergence -- test-output/report.json --handoff-probe` (pre-edit falsification reconfirmed selected admin-ready timeout plus alternative witness), `PROOF=focused-contract-fixture-and-affected-consumer npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js` (pass, 9/9 including alternative witness fallback case), `node scripts/check-guideline-literals.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js` (pass, 0 new violations), `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js` (pass, 0 violations), `npm --silent run analyze:causal-model -- test-output/report.json` (dominant failure class remains `active_gate_snapshot_coverage_incomplete`); parent revalidated focused proof: yes; next: verification.
- [x] verification-fix: status: validated; evidence: `npm run work:package:doctor -- --suggest work/packages/done-20260522-network-partition-active-gate-selected-source-alternative-witness.md` (pass, validation ok), `npm run work:validate -- --pre-impl work/packages/done-20260522-network-partition-active-gate-selected-source-alternative-witness.md` (pass), `npm run work:evidence-summary -- test-output/report.json` (pass, frontier remains `active_gate_snapshot_coverage` with `selected_snapshot_source_timeout`), `npm run analyze:topology-convergence -- test-output/report.json --handoff-probe` (pass, confirms `alternativeSnapshotWitnessAvailable=true` with selected timeout source), `PROOF=focused-contract-fixture-and-affected-consumer npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js` (pass, 9/9 including alternative-witness fallback), `node scripts/check-guideline-literals.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js` (pass, 0 new violations), `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js` (pass, 0 violations); changed files: `work/packages/done-20260522-network-partition-active-gate-selected-source-alternative-witness.md`; parent revalidated focused proof: yes; next: closure.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed `work/sprints/current-blocker.json` and `work/sprints/current-blocker.md`; next: validation.
- [x] implementation falsification: status: validated; evidence: `npm run analyze:topology-convergence -- test-output/report.json --handoff-probe` (pre-edit) reports `selectedSnapshotAdminReady=true`, `selectedSnapshotReachableBy=admin_health`, `selected_snapshot_source_timeout`, and `alternativeSnapshotWitnessAvailable=true`; next: bounded selected-source fallback implementation.
- [x] representative rerun: status: same-frontier; evidence: `node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain --output test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --fast-local --verbose` (fail, 0/1; snapshotCoverage=0/3 at selected admin-ready node), `npm run work:evidence-summary -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json` (same frontier `active_gate_snapshot_coverage` with `selected_snapshot_source_timeout`), `npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe` (selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, alternativeSnapshotWitnessAvailable=true), `npm --silent run analyze:causal-model -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json` (dominant failure class remains `active_gate_snapshot_coverage_incomplete`), `npm run work:package:route-after-rerun -- --artifact test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out` (route remains startup_active_gate_owner / snapshot_coverage); parent revalidated focused proof: yes; next: architecture successor.

## Validation

1. npm run work:evidence-summary -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --handoff-probe
3. PROOF=focused-contract-fixture-and-affected-consumer npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
4. node scripts/check-guideline-literals.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
5. npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
6. npm run work:package:route-after-rerun -- --artifact test-output/reports/network-partition-split-brain-selected-source-alt-witness-20260522T083921Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out

## Commit And Push Ledger

1. Focused package commit: a692743a52975fe2d7911cb45de14e94defe8819
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
