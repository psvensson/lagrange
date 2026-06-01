# Topology Publication Projection Reconciliation

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-14",
  "closed": "2026-05-14",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-publication-classification-db66.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_projection_cohort",
  "dominantReason": "missing_published_nodes_present",
  "currentState": "Classification-only closure: tools now classify PUBLISHED plus missing published active nodes as a topology_publication_owner frontier and expose current-vs-best publication progress; fresh representative evidence remains red.",
  "nextAction": "Continue with tooling observability by executing the failure-gate harness package; do not fix rolling-restart runtime behavior in this sprint segment.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-classification-db66.report.json --explain publication_ack_convergence",
    "npm run analyze:owner-files -- topology_publication_owner publication_projection_cohort --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260514-topology-publication-projection-reconciliation.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "src/diagnostics/topology-convergence-graph.js",
    "src/diagnostics/failure-class-taxonomy.js",
    "src/diagnostics/stop-condition-decision.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/diagnostics/failure-class-taxonomy.test.js",
    "test/diagnostics/stop-condition-decision.test.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260514-topology-publication-convergence-after-active-gate-owner-truth.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-state.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/membership-publication-planning.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260514-topology-publication-projection-reconciliation.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "src/diagnostics/topology-convergence-graph.js",
    "src/diagnostics/failure-class-taxonomy.js",
    "src/diagnostics/stop-condition-decision.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/diagnostics/failure-class-taxonomy.test.js",
    "test/diagnostics/stop-condition-decision.test.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "causalGovernance": {
    "hypothesis": "topology_publication_owner / publication_projection_cohort proof should reduce, migrate, or classify missing_published_nodes_present without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-classification-db66.report.json",
    "expectedCausalModelChange": "missing_published_nodes_present becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "classification-only",
    "causalDebt": "The publication projection residual is now classified as a topology_publication_owner local blocker instead of healthy/ask_human. Fresh evidence improved best observed publication progress to publishedActive=4/5 and missingPublished=1, but the terminal sample still regressed to publishedActive=1/5 and missingPublished=4; this package deliberately does not fix rolling-restart runtime behavior.",
    "crossBoundaryReview": "Required before closure through the runtime-owner-boundary subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / topology_publication_owner / publication_projection_cohort",
    "phaseChain": [
      "canonical evidence extraction",
      "topology_publication_owner / publication_projection_cohort focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "package-local frontier topology_publication_owner / publication_projection_cohort; causal analysis now classifies the current artifact as publication_ack_blocked / continue_local_fix instead of healthy / ask_human",
    "knownDownstreamBlockers": [
      "rolling-restart representative active-gate snapshot coverage remains red until green or migrated",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven topology_publication_owner / publication_projection_cohort causal edge for missing_published_nodes_present",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-classification-db66.report.json --explain publication_ack_convergence",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for topology_publication_owner / publication_projection_cohort.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-publication-classification-db66.report.json",
    "expectedObservableTransition": "missing_published_nodes_present resolves to green evidence, a reduced residual, same-frontier evidence, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep topology_publication_owner / publication_projection_cohort active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "representative green evidence or a narrower owner-boundary blocker selected by canonical evidence",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop"
  }
}
-->

## Why

The representative evidence shows publication convergence as satisfied while
the active-gate handoff still sees only `1/5` published active nodes and four
missing published node IDs. Publication status and active projection have
therefore drifted apart, and active-gate code can observe a cache-like
`PUBLISHED` status without durable cohort convergence.

This package owns the topology publication owner projection boundary. It must
make publication authority explicit and prevent `PUBLISHED` from coexisting
with missing active nodes unless the owner emits a typed degraded placement or
publication reason.

## Scope Basis

AGPL topology convergence item: make active-gate convergence owner-truth based
and avoid treating cache publication as durable convergence. It follows the
prior publication convergence focused package and composes with the active-gate
owner cohort package.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the work is limited to
  `topology_publication_owner / publication_projection_cohort` and focused
  publication/admin snapshot tests.
- Escalation trigger to a heavier lane: the projection gap requires changing
  active-gate admission semantics, membership epoch fencing, or failure repair
  intent consumption.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Compare publication owner decision, evidence, state, recovery gate, and
   membership publication planning for the rolling-restart artifact.
2. Define the durable publication projection contract used by active-gate
   snapshot coverage.
3. Ensure publication status cannot be `PUBLISHED` for the active cohort when
   `missingPublishedNodeIds` is non-empty unless a degraded reason is explicit.
4. Add or update focused publication/admin snapshot tests.
5. Record whether the publication fix removes the active-gate missing-published
   frontier or hands off a narrower active-gate blocker.

## Out Of Scope

1. active-gate-runtime-changes-without-fresh-frontier-evidence
2. harness-timeout-increases
3. Priority recovery operation workflow changes.
4. Placement capacity policy changes unrelated to publication projection.

## Entry Evidence

1. `publication_ack_convergence` is marked satisfied in the latest
   rolling-restart report.
2. Active-gate handoff still reports `publishedActive=1/5`.
3. Active-gate handoff reports `missingPublished=4`.
4. The owner must reconcile whether this is stale cache publication, missing
   durable publication, or a typed degraded state.

## Owner Contract To Prove

`topology_publication_owner` must be the authority for active publication
projection. A publication snapshot must distinguish:

1. Durable publication decision state.
2. Cache/projection freshness.
3. Active node cohort included in the publication.
4. Missing active nodes and exact owner reason.
5. Pending repair or retry work with bounded next attempt.
6. Terminal degraded reason when publication cannot be made complete.

## Activation Contract

Required before this package moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/done-20260514-topology-publication-projection-reconciliation.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. Promote only proven owner-file candidates into `writeScope` and
   `commitScope` after owner-file proof. Current promoted diagnostics files:
   `src/diagnostics/topology-convergence-graph.js`,
   `test/diagnostics/topology-convergence-graph.test.js`.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/rolling-restart-publication-classification-db66.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a runtime owner-boundary
package.

- [x] Review subagent recorded: Agent Codex (019e2697-b890-7833-87e4-14148e79270b) reviewed work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md; result clean.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent Codex
   (019e269c-7b47-7081-b77f-f30cfcce13e2) implemented
   work/packages/done-20260514-topology-publication-projection-reconciliation.md.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260514-topology-publication-projection-reconciliation.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `src/diagnostics/topology-convergence-graph.js`, `src/diagnostics/failure-class-taxonomy.js`, `src/diagnostics/stop-condition-decision.js`, `test/diagnostics/topology-convergence-graph.test.js`, `test/diagnostics/failure-class-taxonomy.test.js`, `test/diagnostics/stop-condition-decision.test.js`, `test/distributed/harness/failure-bundle-segment-4.js`, `test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js`, `test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`
- Forbidden files: `active-gate-runtime-changes-without-fresh-frontier-evidence`, `harness-timeout-increases`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-classification-db66.report.json --explain publication_ack_convergence`, `npm run analyze:owner-files -- topology_publication_owner publication_projection_cohort --markdown`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/done-20260514-topology-publication-projection-reconciliation.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/done-20260514-topology-publication-projection-reconciliation.md
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-classification-db66.report.json --explain publication_ack_convergence
4. npm run analyze:owner-files -- topology_publication_owner publication_projection_cohort --markdown
5. node --test test/diagnostics/topology-convergence-graph.test.js
6. node --test test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js
7. node scripts/check-guideline-literals.js src/diagnostics/topology-convergence-graph.js src/diagnostics/failure-class-taxonomy.js src/diagnostics/stop-condition-decision.js test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js
8. node scripts/check-guideline-decision-boundaries.js src/diagnostics/topology-convergence-graph.js src/diagnostics/failure-class-taxonomy.js src/diagnostics/stop-condition-decision.js test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js
9. npm run audit:runtime-grammar:file -- src/diagnostics/topology-convergence-graph.js src/diagnostics/failure-class-taxonomy.js src/diagnostics/stop-condition-decision.js test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js
10. node --test test/distributed/harness/__tests__/failure-bundle.test.js
11. node scripts/check-guideline-literals.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js
12. node scripts/check-guideline-decision-boundaries.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js
13. npm run audit:runtime-grammar:file -- test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js
14. npm run work:validate -- --entry work/packages/done-20260514-topology-publication-projection-reconciliation.md
15. npm run work:validate -- --pre-impl work/packages/done-20260514-topology-publication-projection-reconciliation.md
16. npm run work:validate -- --closure work/packages/done-20260514-topology-publication-projection-reconciliation.md
17. git diff --check -- work/packages/done-20260514-topology-publication-projection-reconciliation.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md src/diagnostics/topology-convergence-graph.js src/diagnostics/failure-class-taxonomy.js src/diagnostics/stop-condition-decision.js test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js
18. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If active-gate code consumes publication incorrectly after publication owner
   proof is clean, split back to the active-gate cohort package.
2. If stale projection is caused by missing topology epoch fencing, split an
   epoch package instead of weakening publication semantics.
3. If missing nodes reflect real capacity or placement unavailability, split to
   placement/degraded reason ownership.

## Acceptance Criteria

1. Focused tests prove `PUBLISHED` cannot mean durable active cohort complete
   when missing published nodes remain.
2. Publication owner diagnostics include durable state, projection freshness,
   missing nodes, pending work, and degraded reason.
3. Active-gate representative evidence reaches `missingPublished=0` after
   composed rerun, or this package records a narrower owner/boundary blocker.

## Implementation Proof

- Implementation subagent: Agent Codex
  (019e269c-7b47-7081-b77f-f30cfcce13e2) implemented this package.
- Focused change: `src/diagnostics/topology-convergence-graph.js` now treats
  `PUBLISHED` plus positive `missingPublishedCount` or non-empty
  `missingPublishedNodeIds` as publication-owner deferred evidence unless
  `prioritySpreadPending` supplies the stronger modeled owner reason.
- Focused tests: `node --test test/diagnostics/topology-convergence-graph.test.js`
  passed with the current report artifact covered.
- Extractor proof: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-classification-db66.report.json --explain publication_ack_convergence`
  now reports `publication_ack_convergence` as `deferred`, `frontier: true`,
  and dominant reason `missing_published_nodes_present` under
  `topology_publication_owner`.
- Classification slice commit: ae5f5e59798d1344a0b589a1b63970b4f659dc8c.
  The current artifact is no longer collapsed to `publication_published`; it
  remains a topology publication frontier until runtime evidence changes.
- Raw JSON fallback note: canonical `work:evidence-summary`,
  `analyze:topology-convergence`, `analyze:priority-recovery-residuals`, and
  `analyze:distributed-failure` did not expose the nested owner stream omission,
  so focused Node inspection compared the same artifact's raw
  `publicationConvergence` summary with canonical publication recovery evidence.
- Harness presentation repair: `failure-bundle-segment-4.js` now surfaces the
  canonical `publicationOwnerStream` and `publicationRecoveryGate` on
  publication convergence summaries. The current artifact replay exposes
  `streamOutcome=stale`, `ackState=acknowledged`,
  `freshnessFence=consumer_lag`, `recoveryOutcome=waiting_for_consumer`, and
  `publicationRecoveryGate.state=consumer_lag` while preserving the existing
  convergence-open `publicationPending` contract.
- Causal taxonomy repair: `failure-class-taxonomy.js` classifies deferred
  publication ACK frontiers as `publication_ack_blocked`, and
  `stop-condition-decision.js` reports `continue_local_fix` with
  `local_runtime_owner_blocker` instead of `healthy` / `ask_human`.
- Focused tests:
  `node --test test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js`
  and `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
  pass.
- Result classification: `classification-only`. The package removed the false
  healthy/ask-human and hidden publication projection states, but it does not
  claim representative green; fresh runtime evidence must still reach
  `missingPublished=0` or split to a narrower consumer-lag owner blocker.
- Fresh representative comparison:
  `test-output/reports/rolling-restart-publication-classification-db66.report.json`
  still fails at `publication_ack_convergence` with
  `publication_ack_blocked / continue_local_fix`. The terminal sample reports
  `publishedActive=1/5` and `missingPublished=4`; the best observed progress
  reached `publishedActive=4/5` and `missingPublished=1`. This is retained as
  observability evidence only and does not authorize a rolling-restart runtime
  fix inside this sprint segment.

## Commit And Push Ledger

Required at closure.

1. [x] Focused package commit: db66a0203928712a6776a36462d7c0ea6a36c0ed.
2. [x] Pushed to: origin/codex/pending-ack-eligibility-filter.
3. [x] Commit contains only package-owned files/package-status/allowed sprint handoff: yes.
