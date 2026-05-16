# Startup Active Gate Authoritative Repair Participant Failure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused fixture separates the four proposed causes. Bad snapshot-source selection is not selected because all active probe witnesses fail the same authoritative nodes query path; forced repair participant/query failures now defer only through a metric-moving local snapshot, and inherited readiness support remains downstream. Latest representative remains red with snapshotCoverageNodeCount=0/5, but discovery_node_coverage_gap and selected_snapshot_source_timeout are absent, publication ACK and priority recovery are satisfied, and the selected edge is authoritative control snapshot nodes query timeout after 3000ms.",
  "nextAction": "Close this package as reduced: the metric-moving proof target is discovery_node_coverage_gap disappearing. Open the successor for authoritative control snapshot nodes query pressure without reopening publication ACK, priority recovery, timeout budget increases, or active-gate admission.",
  "proof": [
    "npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "node --test test/admin/admin-control-snapshot.test.js",
    "node --test test/control-plane/control-plane-snapshot-owner.test.js",
    "./node_modules/.bin/eslint src/admin/admin-control-snapshot-class-part-2.js src/control-plane/control-plane-snapshot-owner.js test/admin/admin-control-snapshot.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-participant-failure-repair-20260516T215635Z.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-participant-failure-repair-20260516T215635Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-participant-failure-repair-20260516T215635Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-participant-failure-repair-20260516T215635Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-participant-failure-repair-20260516T215635Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-participant-failure-repair-20260516T215635Z.report.json",
    "node --test test/control-plane/control-plane-snapshot-owner.test.js",
    "node --check src/admin/admin-control-snapshot-class-part-2.js && node --check test/admin/admin-control-snapshot.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-class-part-2.js src/control-plane/control-plane-snapshot-owner.js test/admin/admin-control-snapshot.test.js",
    "node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-class-part-2.js src/control-plane/control-plane-snapshot-owner.js",
    "node scripts/check-guideline-constant-names.js src/admin/admin-control-snapshot-class-part-2.js src/control-plane/control-plane-snapshot-owner.js test/admin/admin-control-snapshot.test.js",
    "npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-2.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/control-plane-snapshot-owner.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-forced-query-timeout-budget-reserved-20260516T222900Z.report.json --verbose",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --markdown",
    "rg -n \"discovery_node_coverage_gap\" test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
    "rg -n \"selected_snapshot_source_timeout\" test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
    "npm run work:model-ledger -- record --package work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md --model gpt-5.3-codex --reasoning-effort high --output-profile medium --task-class runtime-owner-boundary --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason same-boundary-authoritative-query-pressure-selected --outcome reduced --validation-status focused-pass-representative-reduced --correction-loops 4 --review-findings 0 --notes \"Metric-moving proof target met by removing discovery_node_coverage_gap while representative remains red; next owner is authoritative control snapshot nodes query pressure.\""
  ],
  "writeScope": [
    "work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md",
    "test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json",
    "test-output/reports/rolling-restart-after-participant-failure-repair-20260516T215635Z.report.json",
    "test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-service-discovery-repair-methods.js",
    "src/admin/admin-service-discovery-readiness-methods.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/cluster-segment-2.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-service-discovery.test.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate-reduced-subcause",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "The four-cause replay selects authoritative control snapshot nodes query pressure. Open the successor on that owner path without reopening publication ACK, priority recovery, timeout budget increases, or active-gate admission."
  },
  "causalGovernance": {
    "hypothesis": "The representative frontier is no longer a selected snapshot-source timeout or discovery coverage gap. The four-cause replay selected authoritative control snapshot nodes query pressure: every active source probe reaches the same nodes query timeout after the forced repair path is bounded, while inherited readiness support remains downstream.",
    "stopConditionCheck": "Run entry validation, handoff/snapshot probe, focused admin snapshot tests, selected owner tests, npm run analyze:causal-model on fresh evidence, static guardrails, and one representative rolling-restart rerun.",
    "expectedCausalModelChange": "discovery_node_coverage_gap disappears, snapshotCoverage improves above 2/5, the representative frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "reduced",
    "causalDebt": "Publication ACK and priority recovery are satisfied. Active-gate snapshot coverage remains incomplete at 0/5; discovery_node_coverage_gap and selected_snapshot_source_timeout are absent. The remaining selected error is authoritative control snapshot repair failing on nodes due to Query timeout after 3000ms.",
    "crossBoundaryReview": "Do not reopen publication ACK, priority recovery, timeout budgets, or active-gate admission unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after direct authoritative repair probe",
    "phaseChain": [
      "consume reduced selected-source timeout proof",
      "build the narrow authoritative repair participant replay/probe",
      "separate participant connection failure from inherited readiness no-progress",
      "separate participant connection failure from authoritative nodes query pressure",
      "promote only the selected owner runtime file after the proof selects one",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied by canonical evidence",
      "priority_recovery_partition_progress is satisfied by canonical evidence",
      "snapshotCoverageNodeCount is 0 and expectedNodeCount is 5",
      "selected_snapshot_source_timeout is absent from canonical reasons",
      "discovery_node_coverage_gap is absent from the latest representative report",
      "selected snapshot error is authoritative control snapshot repair failure on nodes due to Query timeout after 3000ms",
      "all active source probe witnesses fail the same authoritative nodes query path",
      "readiness support remains inherited_active_gate_no_progress with no_progress_terminal evidence"
    ],
    "missingCausalEdge": "Reduce the authoritative control snapshot nodes query pressure path after the four-cause replay selected it over source selection, forced repair stall, and inherited readiness support.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "The latest bounded forced-repair retry is metric-moving because discovery_node_coverage_gap disappeared and the four-cause split selected authoritative nodes query pressure.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
    "expectedObservableTransition": "discovery_node_coverage_gap disappeared and the selected successor subcause is authoritative control snapshot nodes query timeout after 3000ms.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage package slice after required subagent sequencing",
    "sameFrontierFallback": "Close as reduced because the same-frontier rerun moved the target metric by removing discovery_node_coverage_gap; continue only in a successor focused on authoritative nodes query pressure.",
    "expectedNextFrontier": "representative green, improved active-gate snapshot coverage above 2/5, or authoritative control snapshot nodes query pressure reduced to a narrower owner boundary",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md / startup_active_gate_owner / snapshot_coverage / same-frontier"
    ],
    "oscillationCheck": "This successor is allowed because representative evidence changed the selected subcause from selected_snapshot_source_timeout and discovery_node_coverage_gap to authoritative control snapshot nodes query pressure.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, and active-gate admission remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md"
}
-->

## Why

The prior package removed `selected_snapshot_source_timeout` from the
representative rolling-restart evidence. This package built the next narrow
decision and separated the four named causes: bad snapshot-source selection,
forced repair path stalls, authoritative control snapshot nodes query pressure,
and inherited readiness support.

The representative gate is still red with
`snapshotCoverageNodeCount=0/5`, but the proof is metric-moving:
`discovery_node_coverage_gap` is gone from the latest representative report.
The remaining selected error is authoritative control snapshot repair failing
while querying nodes with `Query timeout after 3000ms`. Publication ACK and
priority recovery remain satisfied, and readiness support remains downstream
of active-gate snapshot coverage.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically rolling-restart topology
workflow stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red after
  a metric-moving owner-boundary reduction and now requires a focused causal
  replay/probe before another runtime edit.
- Escalation trigger to a heavier lane: runtime ownership expands beyond the
  listed candidate files, a frozen decision must be reopened, or
  representative evidence contradicts the selected owner boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Sartre (019e32b9-c60c-78e3-902c-f3cf79dc4d77) reviewed work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Hypatia (019e32bc-a407-7ad2-bbf9-471fc72acc72) fixed work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md.
- [x] Implementation subagent recorded: Agent Maxwell (019e32c0-8cb0-7bf0-840c-52f9133efee0) implemented work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

Fallback note: `work:evidence-summary`, `analyze:topology-convergence
--explain`, `--handoff-probe`, `analyze:causal-model`, and
`analyze:distributed-failure` selected the representative frontier and selected
error, but did not expose per-source probe witness parity. A focused report
inspection was used only to prove the absence of `discovery_node_coverage_gap`
and `selected_snapshot_source_timeout`, and playback witness inspection showed
all active source probes failing the same authoritative nodes query timeout
after `3000ms`.

## In Scope

1. work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/admin/admin-control-snapshot-class-part-2.js
7. src/control-plane/control-plane-snapshot-owner.js
8. test/admin/admin-control-snapshot.test.js

## Out Of Scope

1. publication-ack-convergence
2. priority_recovery_partition_progress
3. operation_workflow_owner
4. timeout_budgets
5. active_gate_admission

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/admin/admin-control-snapshot-class-part-2.js`, `src/control-plane/control-plane-snapshot-owner.js`, `test/admin/admin-control-snapshot.test.js`
- Forbidden files: `publication-ack-convergence`, `priority_recovery_partition_progress`, `operation_workflow_owner`, `timeout_budgets`, `active_gate_admission`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. PASS - `npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md`
2. PASS - `npm run work:validate -- --pre-impl work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md`
3. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json`
4. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --explain active_gate_snapshot_coverage`
5. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --handoff-probe`
6. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json`
7. PASS - `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
8. PASS - `node --test test/admin/admin-control-snapshot.test.js`
9. PASS - `node --test test/control-plane/control-plane-snapshot-owner.test.js`
10. PASS - `node --test test/admin/admin-service-discovery.test.js`
11. PASS - `node --test test/admin/admin-control-snapshot-response-contract.test.js`
12. PASS - `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-5.js`
13. PASS - `./node_modules/.bin/eslint src/admin/admin-control-snapshot-class-part-2.js src/control-plane/control-plane-snapshot-owner.js test/admin/admin-control-snapshot.test.js`
14. PASS - `node scripts/check-guideline-constant-names.js src/admin/admin-control-snapshot-class-part-2.js src/control-plane/control-plane-snapshot-owner.js test/admin/admin-control-snapshot.test.js`
15. PASS - `git diff --check -- src/admin/admin-control-snapshot-class-part-2.js src/control-plane/control-plane-snapshot-owner.js test/admin/admin-control-snapshot.test.js work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`
16. REDUCED - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-participant-failure-repair-20260516T215635Z.report.json --verbose`; representative remains red with `snapshotCoverageNodeCount=0/5`, but the selected participant connection failure moved to `nodes:Query timeout after 6000ms`.
17. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-participant-failure-repair-20260516T215635Z.report.json`
18. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-participant-failure-repair-20260516T215635Z.report.json --explain active_gate_snapshot_coverage`
19. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-participant-failure-repair-20260516T215635Z.report.json --handoff-probe`
20. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-participant-failure-repair-20260516T215635Z.report.json`
21. PASS - `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-participant-failure-repair-20260516T215635Z.report.json`
22. PASS - `npm run work:model-ledger -- record --package work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md --model gpt-5.3-codex --reasoning-effort high --output-profile medium --task-class runtime-owner-boundary --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason none --outcome reduced --validation-status focused-pass-representative-reduced --correction-loops 2 --review-findings 0`
23. LIMITED - `npm run audit:runtime-grammar:file` reported inherited violations in unrelated runtime files and no touched-file findings.
24. LIMITED - `npm run test:complexity:scoped -- src/admin/admin-control-snapshot-class-part-2.js src/control-plane/control-plane-snapshot-owner.js test/admin/admin-control-snapshot.test.js` exited 0 with inherited scoped complexity findings in touched files.
25. PASS - `node --check src/admin/admin-control-snapshot-class-part-2.js && node --check test/admin/admin-control-snapshot.test.js`
26. PASS - `node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-class-part-2.js src/control-plane/control-plane-snapshot-owner.js test/admin/admin-control-snapshot.test.js`
27. PASS - `node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-class-part-2.js src/control-plane/control-plane-snapshot-owner.js`
28. PASS - `node scripts/check-guideline-constant-names.js src/admin/admin-control-snapshot-class-part-2.js src/control-plane/control-plane-snapshot-owner.js test/admin/admin-control-snapshot.test.js`
29. PASS - `npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-2.js`
30. PASS - `npm run audit:runtime-grammar:file -- src/control-plane/control-plane-snapshot-owner.js`
31. REDUCED - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-forced-query-timeout-budget-reserved-20260516T222900Z.report.json --verbose`; authoritative repair query pressure is bounded to `3000ms` and `selected_snapshot_source_timeout` is absent.
32. REDUCED - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --verbose`; representative remains red with `snapshotCoverageNodeCount=0/5`, but the metric-moving target is met because `discovery_node_coverage_gap` disappears.
33. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json`
34. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --explain active_gate_snapshot_coverage`
35. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --handoff-probe`
36. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json`
37. PASS - `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json`
38. PASS - `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --markdown`
39. ABSENT - `rg -n "discovery_node_coverage_gap" test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json`
40. ABSENT - `rg -n "selected_snapshot_source_timeout" test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json`
41. PASS - `npm run work:model-ledger -- record --package work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md --model gpt-5.3-codex --reasoning-effort high --output-profile medium --task-class runtime-owner-boundary --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason same-boundary-authoritative-query-pressure-selected --outcome reduced --validation-status focused-pass-representative-reduced --correction-loops 4 --review-findings 0 --notes "Metric-moving proof target met by removing discovery_node_coverage_gap while representative remains red; next owner is authoritative control snapshot nodes query pressure."`
