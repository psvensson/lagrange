# Active Gate Snapshot Witness Diagnostics

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "lightweight-maintenance",
  "scenario": "network-partition-split-brain",
  "artifact": "test-output/report.json",
  "playback": "none",
  "owner": "diagnostics_owner",
  "boundary": "topology_convergence_evidence",
  "dominantReason": "evidence_incomplete",
  "currentState": "The active-gate snapshot architecture probe closed as evidence-incomplete because canonical extractors do not expose selected snapshot admin reachability or alternative witness absence strongly enough to distinguish H1/H2/H3.",
  "nextAction": "Add focused topology diagnostics for selected snapshot source reachability and alternative witness availability without changing runtime behavior.",
  "proof": [
    "npm run work:evidence-summary -- test-output/report.json",
    "npm run analyze:topology-convergence -- test-output/report.json --handoff-probe",
    "npm test -- test/diagnostics/topology-convergence-graph.test.js"
  ],
  "writeScope": [
    "work/packages/done-20260522-active-gate-snapshot-witness-diagnostics.md",
    "scripts/analyze-topology-convergence.js",
    "test/diagnostics/topology-convergence-graph.test.js"
  ],
  "handoffFiles": [
    "test-output/report.json",
    "work/packages/done-20260522-network-partition-split-brain-active-gate-snapshot-architecture-probe.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-2.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
  ],
  "commitScope": [
    "work/packages/done-20260522-active-gate-snapshot-witness-diagnostics.md",
    "scripts/analyze-topology-convergence.js",
    "test/diagnostics/topology-convergence-graph.test.js"
  ],
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The previous architecture experiment could not distinguish H1/H2/H3 because canonical topology evidence hides selected snapshot source reachability details and whether alternative snapshot witnesses are available or absent.",
    "stopConditionCheck": "Run npm --silent run analyze:causal-model -- test-output/report.json to confirm the representative blocker remains active_gate_snapshot_coverage_incomplete while this package changes only diagnostics extraction.",
    "expectedCausalModelChange": "The diagnostics package should not change the representative causal model; it should expose selected source reachability and alternative-witness availability for the follow-on architecture/runtime decision.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Current representative evidence selects startup_active_gate_owner / snapshot_coverage with selected_snapshot_source_timeout, selectedSnapshotAdminReady=true in the raw report, selected snapshot observation unknown, and no canonical alternative-witness availability signal.",
    "crossBoundaryReview": "Runtime ownership remains frozen; diagnostics_owner owns only canonical evidence extraction for the architecture-gap handoff."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "network-partition-split-brain active_gate_snapshot_coverage evidence-incomplete handoff",
    "phaseChain": [
      "publication ACK and priority recovery are satisfied in current representative evidence",
      "startup active-gate runtime fix focused proof passed but representative evidence returned same-frontier",
      "architecture probe closed as evidence-incomplete because canonical extractors lacked H1/H2/H3 discriminator fields",
      "diagnostics package must expose selected-source reachability and alternative-witness availability without runtime changes"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out remains the representative runtime frontier; diagnostics_owner owns the evidence-incomplete extraction boundary for this package.",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains deferred under active-gate no progress",
      "runtime patching is blocked until evidence distinguishes transport, selected-source selection, or cross-node owner/watch contract"
    ],
    "missingCausalEdge": "Canonical topology probe must show whether the selected snapshot source is admin-reachable and whether alternative snapshot witnesses or owner/watch queue state are present, absent, or unknown.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/report.json --handoff-probe",
    "falsifyingProbe": "npm --silent run analyze:causal-model -- test-output/report.json",
    "boundedProgressProof": "Bounded diagnostics advance exposes selected source reachability and alternative witness availability in the topology handoff probe.",
    "boundedProgressProofArtifact": "test-output/report.json",
    "expectedObservableTransition": "canonical topology handoff probe shows selectedSnapshotAdminReady, selectedSnapshotReachableBy, and alternative witness availability or absence.",
    "maxProgressBound": "one lightweight diagnostics package before follow-on architecture/runtime selection",
    "sameFrontierFallback": "If canonical diagnostics still cannot expose the discriminator fields, close as evidence-incomplete and escalate to architecture-contract or human evidence gap.",
    "expectedNextFrontier": "follow-on package can choose H1 transport, H2 selected-source selection, H3 owner/watch contract, or evidence-incomplete escalation from canonical evidence",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "diagnostics_owner",
    "toBoundary": "topology_convergence_evidence",
    "reason": "The representative runtime frontier remains startup_active_gate_owner / snapshot_coverage, but the predecessor closed as evidence-incomplete because the canonical diagnostic extractor lacks the fields needed to select the next runtime or architecture contract.",
    "evidence": "test-output/report.json"
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "bounded local edit after owner, scope, proof, and forbidden files are named",
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
      "Prefer mechanical-maintenance for docs/templates/schema-only edits.",
      "Prefer test-only-proof for tests that do not change runtime behavior.",
      "Prefer bounded-experiment for one same-owner hypothesis with inherited context."
    ]
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/report.json",
    "routeOwner": "diagnostics_owner",
    "routeBoundary": "topology_convergence_evidence",
    "routeDominantReason": "evidence_incomplete",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "experiment",
    "expectedDelta": "Canonical topology handoff probe exposes selectedSnapshotAdminReady, selectedSnapshotReachableBy, and explicit alternative snapshot witness availability/absence for the current report.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/report.json --owner diagnostics_owner --boundary topology_convergence_evidence --dominant-reason evidence_incomplete",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260522-network-partition-active-gate-selected-source-alternative-witness.md"
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `test-output/report.json`
- Expected delta: Canonical topology handoff probe exposes selectedSnapshotAdminReady, selectedSnapshotReachableBy, and explicit alternative snapshot witness availability/absence for the current report.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/report.json`
- Route owner: `diagnostics_owner`
- Route boundary: `topology_convergence_evidence`
- Route dominant reason: `evidence_incomplete`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
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

1. work/packages/done-20260522-active-gate-snapshot-witness-diagnostics.md
2. scripts/analyze-topology-convergence.js
3. test/diagnostics/topology-convergence-graph.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/done-20260522-active-gate-snapshot-witness-diagnostics.md`, `scripts/analyze-topology-convergence.js`, `test/diagnostics/topology-convergence-graph.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/report.json`, `npm run analyze:topology-convergence -- test-output/report.json --handoff-probe`, `npm test -- test/diagnostics/topology-convergence-graph.test.js`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: bounded local edit after owner, scope, proof, and forbidden files are named
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Prefer mechanical-maintenance for docs/templates/schema-only edits.
2. Prefer test-only-proof for tests that do not change runtime behavior.
3. Prefer bounded-experiment for one same-owner hypothesis with inherited context.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: `npm run work:package:doctor -- --suggest work/packages/done-20260522-active-gate-snapshot-witness-diagnostics.md`, `npm run work:validate -- --pre-impl work/packages/done-20260522-active-gate-snapshot-witness-diagnostics.md`, `npm run work:evidence-summary -- test-output/report.json`, `npm run analyze:topology-convergence -- test-output/report.json --handoff-probe`; parent revalidated focused proof: yes; next: verification.
- [x] verification-fix: status: validated; evidence: `npm test -- test/diagnostics/topology-convergence-graph.test.js` and `npm run work:validate -- --closure work/packages/done-20260522-active-gate-snapshot-witness-diagnostics.md`; changed files: `scripts/analyze-topology-convergence.js`, `test/diagnostics/topology-convergence-graph.test.js`, `work/packages/done-20260522-active-gate-snapshot-witness-diagnostics.md`; parent revalidated focused proof: yes; next: closure or successor action.
- [x] repair: status: not_needed; evidence: no repair package was required; package scoped exclusively to diagnostics extraction and test assertion additions in declared files; parent revalidated focused proof: yes; next: none.

Fallback note:
Canonical commands exposed handoff probe shape and representative artifact summary but did not enumerate selected snapshot admin/reachability and explicit alternative witness keys as a package-level intent; I used `rg -n "selectedSnapshotAdminReady|selectedSnapshotReachableBy|witness"` on `test-output/report.json` to confirm existing raw field availability before implementing script-layer enrichment.

## Validation

1. npm run work:evidence-summary -- test-output/report.json
2. npm run analyze:topology-convergence -- test-output/report.json --handoff-probe
3. npm test -- test/diagnostics/topology-convergence-graph.test.js

## Commit And Push Ledger

1. Focused package commit: a692743a52975fe2d7911cb45de14e94defe8819
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
