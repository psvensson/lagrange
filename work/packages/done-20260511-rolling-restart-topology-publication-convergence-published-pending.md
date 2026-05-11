# Rolling Restart Topology Publication Convergence Published Pending

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-11",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-publication-convergence-fix-v2/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_event_driven_wait",
  "currentState": "The publication convergence package fixed failure-bundle classification so PUBLISHED publication evidence with pendingAckCount=0, blockedNodeCount=0, prioritySpreadPending=true, and no canonical missing-active publication debt no longer fronts as publication ACK convergence. The representative rolling-restart rerun still failed 0/1, but publication_ack_convergence is satisfied/non-frontier with publicationPending=false and recoveryProtocolState=priority_spread_pending. The first frontier migrated to priority_recovery_partition_progress under operation_workflow_owner / workflow_progress, state retryable, dominant reason priority_recovery_event_driven_wait, with sql_write_operations-p1 recovering_in_flight, persisted_not_dispatched, event_driven, and advance_existing_operation.",
  "nextAction": "Commit and push this focused publication-convergence slice, then open the next focused package on operation_workflow_owner / workflow_progress for the priority_recovery_event_driven_wait retryable frontier.",
  "proof": [
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix.report.json --explain publication_ack_convergence",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix.report.json",
    "TMPDIR=\"$PWD/test-output/tmp\" npm test -- --grep='keeps published priority-spread recovery out of publication-pending' test/distributed/harness/__tests__/failure-bundle.test.js",
    "TMPDIR=\"$PWD/test-output/tmp\" npm test -- test/distributed/harness/__tests__/failure-bundle.test.js test/control-plane/publication-recovery-evidence.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-owner-stream.test.js",
    "node scripts/check-guideline-literals.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js",
    "node scripts/check-guideline-decision-boundaries.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js",
    "npm run audit:runtime-grammar:file -- test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json --fast-local --verbose",
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json --explain publication_ack_convergence",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json",
    "npm run work:model-ledger -- record --package work/packages/done-20260511-rolling-restart-topology-publication-convergence-published-pending.md --model gpt-5.3-codex --reasoning-effort high --task-class implementation --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/cross-boundary-causal-edge --escalated false --bailout-reason none --outcome migrated --validation-status passed --correction-loops 2 --review-findings 0 --notes ...",
    "npm run work:current-blocker",
    "npm run work:validate",
    "git diff --check"
  ],
  "touchedFiles": [
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js",
    "work/packages/done-20260511-rolling-restart-topology-publication-convergence-published-pending.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/cross-boundary-causal-edge",
    "escalationTriggers": [
      "publication convergence evidence requires changes outside topology publication ownership or priority recovery publication evidence",
      "representative proof restores operation_workflow_owner or startup_active_gate_owner as the direct blocker",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If publication convergence is repaired or classified, publication_ack_convergence should reduce or migrate away from topology_publication_owner / publication_convergence before startup active-gate snapshot coverage is treated as direct.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix.report.json",
    "expectedCausalModelChange": "The PUBLISHED plus publication_pending evidence either converges, reduces to classified retryable publication spread, or migrates to a new named owner boundary.",
    "representativeOutcome": "migrated",
    "causalDebt": "Publication ACK convergence is satisfied/non-frontier in the closure rerun; the remaining rolling-restart debt belongs to operation_workflow_owner / workflow_progress and must be opened as a successor package before implementation continues.",
    "crossBoundaryReview": "Required before implementing the successor because the representative rerun migrated from topology_publication_owner / publication_convergence back to operation_workflow_owner / workflow_progress."
  },
  "predecessor": "work/packages/done-20260511-rolling-restart-operation-workflow-progress-sql-write-operations-serial-wait.md",
  "closed": "2026-05-11",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/todo-20260511-rolling-restart-operation-workflow-progress-event-driven-wait.md"
}
-->

Opened after the serial-wait package reduced
`priority_recovery_partition_progress` to retryable/non-frontier and exposed
`publication_ack_convergence` as the first rolling-restart frontier.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix/rolling-restart/`.
3. Frontier edge: `publication_ack_convergence`.
4. Owner and boundary: `topology_publication_owner / publication_convergence`.
5. Dominant reason: `publication_published`.
6. Publication status: `PUBLISHED`.
7. Pending acknowledgements: `0`.
8. Blocked publication nodes: `0`.
9. Missing published count: `2`.
10. Publication pending: `true`.
11. Recovery protocol state: `publication_pending`.
12. Priority spread pending: `true`.
13. Published active nodes: `3/5`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` under AGPL-owned rows:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo.

## In Scope

1. Freeze the current publication convergence witness and explain output.
2. Add or extend the smallest topology-publication owner regression or blocker
   probe for `PUBLISHED` plus `publication_pending`.
3. Repair or classify why missing published nodes remain while pending ACKs and
   blocked publication nodes are zero.
4. Preserve priority recovery as retryable/non-frontier unless fresh evidence
   restores it as the first frontier.
5. Rerun representative `rolling-restart --fast-local`.

## Out Of Scope

1. Reopening operation workflow, workflow timeout, rebalancer handoff, operation
   scheduling, or startup active-gate packages unless fresh evidence restores
   one as the first frontier.
2. Harness timeout increases or presentation-only relabeling.
3. Phase `0.5`, Phase `1.0`, Pro, or Enterprise work.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/cross-boundary-causal-edge`
- Owned files: topology publication owner logic, priority recovery publication
  evidence if required, focused publication tests, this package file,
  sprint/current-blocker handoff files, and model-ledger evidence.
- Forbidden files: startup active-gate owner implementation, harness timeout
  configuration, unrelated archived rolling-restart packages, Pro or Enterprise
  surfaces.
- Frozen decisions: this package targets publication convergence only; startup
  snapshot coverage remains downstream until publication convergence closes or
  migrates.
- Escalation triggers: publication convergence evidence requires changes outside
  topology publication ownership or priority recovery publication evidence;
  representative proof restores operation-workflow or startup active-gate
  ownership as the direct blocker; runtime implementation would need Pro or
  Enterprise features.
- Focused proof: topology explain for `publication_ack_convergence`,
  distributed-failure analysis, focused topology publication owner regression,
  touched-file guardrails, and one representative rolling-restart rerun.

## Causal Governance

- Causal hypothesis: if publication convergence is repaired or classified,
  `publication_ack_convergence` should reduce or migrate away from
  `topology_publication_owner / publication_convergence` before startup
  active-gate snapshot coverage is treated as direct.
- Stop-condition check:
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix.report.json`.
- Expected causal-model change: the `PUBLISHED` plus `publication_pending`
  evidence converges, reduces to classified retryable publication spread, or
  migrates to a new named owner boundary.
- Representative outcome: `migrated`.
- Causal debt: publication ACK convergence is satisfied/non-frontier in the
  closure rerun; remaining rolling-restart debt belongs to
  `operation_workflow_owner / workflow_progress` and must be opened as a
  successor package before implementation continues.
- Cross-boundary review: required before implementing the successor because the
  representative rerun migrated from topology publication convergence back to
  operation workflow progress.

## Hotspots

1. `src/control-plane/*publication*.js`
2. `src/control-plane/*priority-recovery*.js`
3. `test/control-plane/*publication*.js`
4. `test/distributed/harness/*publication*.js`
5. `test/distributed/harness/__tests__/*publication*.js`
6. `scripts/analyze-topology-convergence.js` only if presentation evidence is
   proven stale.

## Boundary Contract

Semantic owner:
`topology_publication_owner / publication_convergence`.

Canonical evidence:
`publication_ack_convergence`, `publicationStatus=PUBLISHED`,
`pendingAckCount=0`, `blockedNodeCount=0`, `missingPublishedCount=2`,
`publicationPending=true`, `recoveryProtocolState=publication_pending`,
`prioritySpreadPending=true`, and `publishedActiveNodeIds=3`.

Allowed consumers:
topology publication owner, priority recovery diagnostics, topology convergence
analysis, distributed failure summary, failure-bundle/reporting surfaces, and
the rolling-restart release gate.

Forbidden reinterpretations:

1. Do not treat publication convergence as startup active-gate snapshot coverage
   while publication ACK convergence remains the frontier.
2. Do not demote the blocker to priority recovery unless fresh owner evidence
   restores priority recovery as the frontier.
3. Do not hide the blocker with a harness timeout or presentation relabel.
4. Do not implement Pro or Enterprise behavior.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent publication-review (`019e0c01-7ad5-7a5f-8e2d-6dd6744edbb0`) reviewed
      `work/packages/done-20260511-rolling-restart-operation-workflow-progress-sql-write-operations-serial-wait.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent publication-fix-retry (`019e0c05-7e2d-710a-bc38-c2d6162052f1`) fixed
      `work/packages/done-20260511-rolling-restart-operation-workflow-progress-sql-write-operations-serial-wait.md`.
- [x] Implementation subagent recorded:
      Agent publication-implement (`019e0c09-38af-755d-9722-3665e5f7fd81`) implemented
      `work/packages/done-20260511-rolling-restart-topology-publication-convergence-published-pending.md`.

## Static Drift Ledger

Preflight:

1. Baseline artifact analysis confirms the current frontier is
   `topology_publication_owner / publication_convergence`.
2. Review subagent required predecessor touched-file metadata repair before this
   package started.
3. Fix subagent added `work/model-ledger.jsonl` to predecessor touched-file
   evidence and current-blocker handoff.
4. Runtime/test touched-file guardrails must be run before and after any runtime
   implementation.

Closure:

1. Focused failure-bundle and publication owner-path tests passed.
2. Touched-file literal, decision-boundary, and runtime-grammar guardrails
   passed for the changed harness/test files.
3. Representative `rolling-restart --fast-local` rerun migrated from
   `publication_ack_convergence` to retryable
   `priority_recovery_partition_progress` under
   `operation_workflow_owner / workflow_progress`.

## Commit And Push Ledger

1. Focused package commit: `fe7ae399`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

Required implementation validation:

1. Baseline evidence:
   `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix.report.json`.
2. Baseline topology explain:
   `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix.report.json --explain publication_ack_convergence`.
3. Baseline distributed-failure analysis:
   `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix.report.json`.
4. Focused topology-publication convergence regression or blocker probe.
5. Touched-file syntax, literal, decision-boundary, runtime-grammar, and diff
   hygiene guardrails.
6. `npm run work:current-blocker`.
7. `npm run work:validate`.
8. Representative
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix.report.json --fast-local --verbose`.

Validation notes:

1. Added a focused failure-bundle regression proving published priority-spread
   recovery with zero ACK debt and no canonical missing-active publication debt
   stays out of `publicationPending`.
2. Preserved existing missing-active publication debt regressions so canonical
   missing-active publication witnesses still front as publication convergence.
3. Focused tests passed for failure-bundle and publication owner-path coverage.
4. Static literal, decision-boundary, and runtime-grammar guardrails passed for
   the two changed harness/test files.
5. Representative rerun command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json --fast-local --verbose`.
   Result: failed `0/1` after `131804ms`, but
   `publication_ack_convergence` is `satisfied`/non-frontier with
   `publicationPending=false` and `recoveryProtocolState=priority_spread_pending`.
6. Closure evidence block names `priority_recovery_partition_progress` as the
   first frontier, owner `operation_workflow_owner`, boundary
   `workflow_progress`, state `retryable`, dominant reason
   `priority_recovery_event_driven_wait`.

## Done When

1. The publication convergence witness has a focused regression or replayable
   blocker probe.
2. `topology_publication_owner / publication_convergence` either converges,
   emits one canonical reason it remains blocked/retryable, or migrates to a new
   named owner boundary.
3. Representative `rolling-restart --fast-local` is rerun and the outcome is
   recorded as green, same-frontier, or migrated.
4. Required focused tests, static guardrails, work validation, and diff hygiene
   pass.
5. The package has a truthful Commit And Push Ledger before closure.
