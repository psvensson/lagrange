# Split Brain Scenario Safety Invariants

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "scenario-release-gate",
  "scenario": "network-partition-split-brain",
  "artifact": "test-output/report.json",
  "playback": "none",
  "owner": "distributed_harness_scenario_owner",
  "boundary": "split_brain_partition_safety",
  "dominantReason": "post_heal_consistency_does_not_prove_partition_safety",
  "currentState": "Split-brain scenario safety invariants implemented and verified; representative rerun migrated to topology_publication_owner / publication_convergence.",
  "nextAction": "Open successor route for topology_publication_owner / publication_convergence / pending_acks_present without widening this package into runtime ownership.",
  "proof": [
    "node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain --contract split_brain_partition_safety",
    "npm run work:evidence-summary -- test-output/report.json",
    "npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence",
    "npm test -- test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js",
    "npm run work:validate -- --pre-impl work/packages/done-20260522-split-brain-scenario-safety-invariants.md"
  ],
  "writeScope": [
    "test/distributed/scenarios/network-partition-split-brain.js",
    "test/distributed/harness/assertions-segment-2.js",
    "test/distributed/harness/assertions-segment-3.js",
    "test/distributed/harness/topology-failure-gate-matrix.js"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "test/distributed/scenarios/network-partition-split-brain.js",
    "test/distributed/harness/assertions-segment-2.js",
    "test/distributed/harness/assertions-segment-3.js",
    "test/distributed/harness/topology-failure-gate-matrix.js",
    "work/packages/done-20260522-split-brain-scenario-safety-invariants.md"
  ],
  "modelFit": {
    "packageClass": "scenario-release-gate",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "split-brain-scenario-contract",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "planning and route selection; split executable children before implementation",
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
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children once execution is unambiguous.",
      "Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected."
    ]
  },
  "predecessor": "work/packages/done-20260522-topology-gate-matrix-executable-contracts.md",
  "rerunDecision": {
    "sourceArtifact": "review:distributed-harness-analysis-20260522",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "pending_acks_present",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "diagnostic-classification",
    "expectedDelta": "The split-brain scenario now proves partition-time safety before post-heal convergence; fresh representative evidence migrated to publication convergence pending acknowledgements.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/report.json --package work/packages/done-20260522-split-brain-scenario-safety-invariants.md --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence",
      "npm run work:package:new -- --from-artifact test-output/report.json --lane diagnostic-classification --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --route-causal-outcome migrate_owner_boundary --route-stop-mode owner_boundary_migration --successor-action rerun-representative-evidence",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "network-partition-split-brain",
    "artifact": "test-output/report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "pending_acks_present",
    "nextAction": "Open successor route for topology_publication_owner / publication_convergence / pending_acks_present."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "distributed_harness_scenario_owner",
    "fromBoundary": "split_brain_partition_safety",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "The representative run exercised the strengthened split-brain safety checks, then failed at the post-heal publication convergence frontier with pending acknowledgements rather than split-brain safety evidence.",
    "evidence": "node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain --contract split_brain_partition_safety; npm run work:evidence-summary -- test-output/report.json; npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence"
  },
  "observablePrediction": {
    "metric": "split-brain partition safety frontier for network-partition-split-brain",
    "predicted": "Adding partition-time leader and write invariants makes unsafe split-brain behavior fail before post-heal convergence can mask it; if partition safety is clean, the representative route should move to the next actual frontier.",
    "observed": "Fresh representative run failed after 166.2s and canonical route moved to publication_ack_convergence / topology_publication_owner / publication_convergence / pending_acks_present.",
    "accuracy": "partial",
    "evidence": "test-output/report.json; npm run work:evidence-summary -- test-output/report.json; npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence",
    "metricDelta": 1
  },
  "causalGovernance": {
    "hypothesis": "The split-brain scenario could pass falsely by proving only post-heal consistency while missing partition-time minority acceptance, competing write leaders, or acknowledged write loss.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/report.json",
    "expectedCausalModelChange": "The split-brain safety gate is no longer the representative frontier; the next causal edge is publication acknowledgement convergence after heal.",
    "representativeOutcome": "migrated",
    "causalDebt": "Remaining red evidence is pending publication acknowledgement convergence, outside this scenario-safety package.",
    "crossBoundaryReview": "Do not patch topology_publication_owner runtime in this package; open or activate a successor for publication_convergence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "network-partition-split-brain split_brain_partition_safety",
    "phaseChain": [
      "partition-time leader safety",
      "minority write rejection",
      "majority acknowledged write durability",
      "post-heal publication convergence"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / pending_acks_present",
    "knownDownstreamBlockers": [
      "pending ack node 11601fe0-72d6-5853-8590-ec2881853e72 in test-output/report.json"
    ],
    "missingCausalEdge": "publication convergence must clear pending acknowledgements after the partition heals",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence",
    "boundedProgressProof": "scenario-local split-brain safety invariants are enforced before heal and before post-heal consistency is accepted; remaining publication convergence requires retry or reconcile progress in the successor owner",
    "boundedProgressProofArtifact": "test-output/report.json",
    "falsifyingProbe": "node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain --contract split_brain_partition_safety",
    "expectedObservableTransition": "post_heal_consistency_does_not_prove_partition_safety -> topology_publication_owner/publication_convergence/pending_acks_present",
    "maxProgressBound": "one scenario-harness pass plus verifier-fixer before successor activation",
    "sameFrontierFallback": "if fresh evidence returns split_brain_partition_safety with no concrete reduction, stop for an architecture experiment rather than another local scenario patch",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260522-network-partition-split-brain-topology-publication-owner-pub.md"
}
-->

## Why

The split-brain scenario currently proves post-heal convergence more strongly
than partition-time safety. A system can converge later after allowing unsafe
minority writes or competing leaders during the partition. This package owns
the scenario-specific safety proof so the release gate fails on that class of
false green.

## Scope Basis

AGPL roadmap scope: failure simulations and production guarantees. This package
is limited to the split-brain scenario and reusable assertion helpers needed to
prove partition-time safety.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: distributed_harness_scenario_owner / split_brain_partition_safety emits the package outcome for post_heal_consistency_does_not_prove_partition_safety.
- Inputs/signals: node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain; npm test -- test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js; npm run work:validate -- --pre-impl work/packages/done-20260522-split-brain-scenario-safety-invariants.md.
- State model or invariant: The distributed_harness_scenario_owner / split_brain_partition_safety decision table in the Causal Decision Contract maps post_heal_consistency_does_not_prove_partition_safety and route evidence to one emitted outcome: pending-before-rerun.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the distributed_harness_scenario_owner / split_brain_partition_safety invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | distributed_harness_scenario_owner / split_brain_partition_safety / post_heal_consistency_does_not_prove_partition_safety | distributed_harness_scenario_owner owns this decision before downstream consumers reinterpret it | Strengthen network-partition-split-brain so the scenario proves no unsafe minority acceptance, no competing write leaders, and no acknowledged write loss during and after the partition. | The split-brain scenario fails on unsafe partition-time behavior even if post-heal consistency later converges, and only passes when partition safety plus post-heal convergence are both proven. | node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies distributed_harness_scenario_owner / split_brain_partition_safety directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain`
- Competing explanations: At minimum compare post_heal_consistency_does_not_prove_partition_safety against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does distributed_harness_scenario_owner / split_brain_partition_safety still own post_heal_consistency_does_not_prove_partition_safety, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: post_heal_consistency_does_not_prove_partition_safety is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain`
- Success metrics: The split-brain scenario fails on unsafe partition-time behavior even if post-heal consistency later converges, and only passes when partition safety plus post-heal convergence are both proven.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: The split-brain scenario fails on unsafe partition-time behavior even if post-heal consistency later converges, and only passes when partition safety plus post-heal convergence are both proven.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `review:distributed-harness-analysis-20260522`
- Route owner: `distributed_harness_scenario_owner`
- Route boundary: `split_brain_partition_safety`
- Route dominant reason: `post_heal_consistency_does_not_prove_partition_safety`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `scenario-release-gate`
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

1. test/distributed/scenarios/network-partition-split-brain.js
2. test/distributed/harness/assertions-segment-2.js
3. test/distributed/harness/assertions-segment-3.js
4. test/distributed/harness/topology-failure-gate-matrix.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `scenario-release-gate`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `split-brain-scenario-contract`
- Output profile: `medium`
- Owned files: `test/distributed/scenarios/network-partition-split-brain.js`, `test/distributed/harness/assertions-segment-2.js`, `test/distributed/harness/assertions-segment-3.js`, `test/distributed/harness/topology-failure-gate-matrix.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain --contract split_brain_partition_safety`, `npm run work:evidence-summary -- test-output/report.json`, `npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence`, `npm test -- test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js`, `npm run work:validate -- --pre-impl work/packages/done-20260522-split-brain-scenario-safety-invariants.md`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: planning and route selection; split executable children before implementation
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Use this package for route selection, owner/boundary decisions, and stop rules.
2. Create Spark-safe mechanical or test-only children once execution is unambiguous.
3. Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: strengthened `network-partition-split-brain` with partition-time leader safety, minority write rejection, and post-heal acknowledged-write durability checks; `npm test -- test/distributed/harness/__tests__/network-partition-split-brain-scenario.test.js` pass; `npm test -- test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js` pass; `git diff --check -- test/distributed/scenarios/network-partition-split-brain.js test/distributed/harness/assertions-segment-2.js test/distributed/harness/assertions-segment-3.js test/distributed/harness/topology-failure-gate-matrix.js work/packages/done-20260522-split-brain-scenario-safety-invariants.md` pass; `node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain --contract split_brain_partition_safety` failed 0/1 after 166.2s and wrote `test-output/report.json`; `npm run work:evidence-summary -- test-output/report.json` and `npm run work:scenario-route -- test-output/report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason pending_acks_present --explain publication_ack_convergence` pass and classify the representative result as migrated to topology_publication_owner / publication_convergence / pending_acks_present; parent revalidated focused proof: yes; next: verifier validation and successor action.
- [x] verification-fix: status: validated; evidence: separate verifier-fixer `Gauss` (`019e4e77-615b-7430-aad4-4ecb90a7fee4`) reviewed the in-scope split-brain safety implementation and reported no further fixes needed; verifier reran `npm test -- test/distributed/harness/__tests__/network-partition-split-brain-scenario.test.js` pass, `npm test -- test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js` pass, `git diff --check -- test/distributed/scenarios/network-partition-split-brain.js test/distributed/harness/assertions-segment-2.js test/distributed/harness/assertions-segment-3.js test/distributed/harness/topology-failure-gate-matrix.js work/packages/done-20260522-split-brain-scenario-safety-invariants.md` pass, and `npm run work:validate -- --pre-impl work/packages/done-20260522-split-brain-scenario-safety-invariants.md` pass; changed files: none; parent revalidated focused proof: yes; next: repair generated blocker state and validate closure.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, and Current Edge Card; next: closure validation.

## Validation

1. node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario network-partition-split-brain --contract split_brain_partition_safety
2. npm test -- test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js
3. npm run work:validate -- --pre-impl work/packages/done-20260522-split-brain-scenario-safety-invariants.md

## Commit And Push Ledger

1. Focused package commit: a692743a52975fe2d7911cb45de14e94defe8819
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
