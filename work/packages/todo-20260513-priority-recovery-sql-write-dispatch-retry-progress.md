# Priority Recovery SQL Write Dispatch Retry Progress

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "intent": {
    "opened": "2026-05-13",
    "lane": "scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "The representative rerun after focused ready-node dispatch retry proof remains red on the same first frontier: priority_recovery_partition_progress under operation_workflow_owner / workflow_progress. The residual changed from one persisted_not_dispatched SQL write witness to retry_deferred / recovering_in_flight coordinator-created remote handoff ACK failures across replica_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1; the residual extractor also reports a rebalancer_handoff split group. Active gate remains downstream at active=2/5 and snapshotCoverage=2/5.",
    "nextAction": "Parked because the rolling-restart sprint closed as failed on May 13, 2026. Do not continue this package unless a new strategy or successor sprint explicitly reactivates the priority-recovery remote handoff ACK/retry line.",
    "predecessor": "work/packages/done-20260513-rolling-restart-active-gate-snapshot-coverage-after-readiness-support-reduction.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md",
      "work/sprints/archived/done-2026-q2-phase-0-1-rolling-restart-release-gate-closure-failed.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/model-ledger.jsonl",
      "src/control-plane/replica-dispatch-service-segment-2.js",
      "src/control-plane/replica-dispatch-service-segment-3.js",
      "src/control-plane/replica-dispatch-service-segment-4.js",
      "test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
      "test/control-plane/replica-dispatch-node-state-update.test-part-3.js",
      "test/control-plane/replica-dispatch-node-state-update.test-part-4.js"
    ],
    "handoffFiles": [
      "work/packages/done-20260513-rolling-restart-active-gate-snapshot-coverage-after-readiness-support-reduction.md",
      "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress.md",
      "test-output/reports/rolling-restart-green-gate-after-active-gate-register-service-timeout.report.json",
      "test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [
      "src/control-plane/replica-dispatch-service-segment-2.js",
      "src/control-plane/replica-dispatch-service-segment-3.js",
      "src/control-plane/replica-dispatch-service-segment-4.js"
    ],
    "commitScope": [
      "work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md",
      "work/sprints/archived/done-2026-q2-phase-0-1-rolling-restart-release-gate-closure-failed.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/model-ledger.jsonl",
      "src/control-plane/replica-dispatch-service-segment-2.js",
      "src/control-plane/replica-dispatch-service-segment-3.js",
      "src/control-plane/replica-dispatch-service-segment-4.js",
      "test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
      "test/control-plane/replica-dispatch-node-state-update.test-part-3.js",
      "test/control-plane/replica-dispatch-node-state-update.test-part-4.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The representative rerun after focused ready-node dispatch retry proof remains red on the same first frontier: priority_recovery_partition_progress under operation_workflow_owner / workflow_progress. The residual changed from one persisted_not_dispatched SQL write witness to retry_deferred / recovering_in_flight coordinator-created remote handoff ACK failures across replica_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1; the residual extractor also reports a rebalancer_handoff split group. Active gate remains downstream at active=2/5 and snapshotCoverage=2/5."
  },
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "fresh canonical evidence promotes startup active gate, publication convergence, readiness support, or another owner ahead of priority recovery workflow progress",
      "the fix requires writes outside the owned control-plane dispatch retry path",
      "runtime implementation requires broader operation workflow ownership changes than dispatch retry progress",
      "scenario remains red after focused dispatch retry proof and one representative rerun"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run work:package:doctor -- --suggest work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md",
        "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json",
        "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --markdown",
        "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --explain priority_recovery_partition_progress",
        "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json",
        "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json",
        "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown",
        "npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown",
        "node --test test/control-plane/replica-dispatch-node-state-update.test-part-2.js test/control-plane/replica-dispatch-node-state-update.test-part-3.js test/control-plane/replica-dispatch-node-state-update.test-part-4.js",
        "node scripts/check-guideline-literals.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-segment-3.js src/control-plane/replica-dispatch-service-segment-4.js",
        "node scripts/check-guideline-decision-boundaries.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-segment-3.js src/control-plane/replica-dispatch-service-segment-4.js",
        "npm run audit:runtime-grammar:file -- src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-segment-3.js src/control-plane/replica-dispatch-service-segment-4.js",
        "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --fast-local --verbose",
        "npm run work:current-blocker",
        "npm run work:validate -- --entry work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md",
        "npm run work:validate -- --pre-impl work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md"
      ]
    }
  },
  "causalGovernance": {
    "hypothesis": "If operation_workflow_owner / workflow_progress owns the latest priority recovery residual, ready-node dispatch retry must rediscover the persisted_not_dispatched sql_write_operations-p1 operation and dispatch or advance it through one bounded owner path instead of waiting only for event-driven progress.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json",
    "expectedCausalModelChange": "priority_recovery_partition_progress either converges, reduces to a narrower workflow-progress or rebalancer-handoff edge, or migrates to a fresh owner boundary after focused ready-node dispatch retry proof and one representative rerun.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Latest evidence remains red same-frontier after focused control-plane dispatch retry proof. The prior persisted_not_dispatched SQL write witness advanced to retry_deferred / recovering_in_flight coordinator-created remote handoff ACK failures: operation 0668b124-2977-4133-98a0-89ece2f4bc68 on replica_operations-p1, fdee7c84-41f0-4d42-bef3-cd378e12f78f on sql_transaction_participants-p1, e3ec7f62-cd2f-423a-a8a7-6500265be8d1 on sql_transactions-p1, and 643459cb-76a9-4058-a84b-8bc1262e076c on sql_write_operations-p1. Active gate remains downstream/projected at active=2/5 and snapshotCoverage=2/5.",
    "crossBoundaryReview": "Review proof is Agent Socrates (019e2272-f38b-7191-9028-735ec3b2f23c) on the active-gate predecessor with result fixes-required; fix and implementation proof are recorded in the Subagent Sequencing Ledger."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative report after focused SQL write dispatch retry proof",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation workflow progress",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress remains retryable under operation_workflow_owner / workflow_progress with dominant reason priority_recovery_event_driven_wait after focused control-plane dispatch retry proof.",
    "knownDownstreamBlockers": [
      "active_gate_snapshot_coverage is downstream/projected with active=2/5 and snapshotCoverage=2/5 and depends on priority_recovery_partition_progress",
      "startup readiness support remains downstream of active-gate progress",
      "publication convergence is PUBLISHED with pendingAck=0 but still reports missingPublished=3 as downstream presentation evidence while priority progress is open",
      "priority recovery residuals now split between operation_workflow_owner / workflow_progress and operation_workflow_owner / rebalancer_handoff, all recovering_in_flight"
    ],
    "missingCausalEdge": "Coordinator-created remote handoff retry/ACK progress must move retry_deferred recovering_in_flight operations through one bounded dispatch, delivery, ACK, timeout, or reconcile path.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --markdown",
    "boundedProgressProof": "Focused control-plane tests proved ready-node dispatch retry rediscovery and re-enqueue behavior; successor proof must target operation workflow remote handoff ACK/retry progress before another representative rerun.",
    "boundedProgressProofArtifact": "test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
    "expectedObservableTransition": "Focused control-plane proof moved the residual from persisted_not_dispatched visibility to retry_deferred remote handoff evidence, but the representative first frontier stayed priority_recovery_partition_progress.",
    "maxProgressBound": "one ready-node dispatch retry owner cycle plus one representative rolling-restart rerun after focused tests passed; this package has exhausted that bound",
    "sameFrontierFallback": "same-frontier observed; keep operation_workflow_owner / workflow_progress ahead of active-gate work and split to a focused handoff/progress successor rather than broadening this package",
    "expectedNextFrontier": "a narrower operation_workflow_owner successor for coordinator_created_remote_handoff retry/ACK progress, then active_gate_snapshot_coverage only after priority progress closes",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

## Sprint Closure Note

The rolling-restart release-gate sprint closed as failed on May 13, 2026. This
package is parked as `todo` so it no longer advertises active execution, while
preserving the same-frontier evidence and focused control-plane proof for any
future strategy.

The package started from the active-gate register-service-timeout artifact,
where canonical evidence moved the sprint back to
`priority_recovery_partition_progress` under
`operation_workflow_owner / workflow_progress`.

The focused control-plane proof is green: ready-node dispatch retry now
rediscovers the specific priority recovery operation id named by
`priorityRecoveryPartitionWitnesses` instead of treating partition-level cache
visibility as enough coverage.

The representative rerun remains red on the same first frontier. The residual
changed from one `persisted_not_dispatched` SQL write witness to
`retry_deferred` / `recovering_in_flight` coordinator-created remote handoff
ACK failures across `replica_operations-p1`,
`sql_transaction_participants-p1`, `sql_transactions-p1`, and
`sql_write_operations-p1`. Active gate remains downstream/projected at
`active=2/5` and `snapshotCoverage=2/5`.

## Scope Basis

AGPL rolling-restart release-gate work from `roadmap.md` Phase `0.1 -
Internal Coherence`: topology workflow stabilization, failure simulations, and
production guarantees.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the work targets one representative gate with a
  named workflow-progress owner boundary, focused ready-node dispatch retry
  proof, and one representative rerun after implementation.
- Escalation trigger to a heavier lane: fresh evidence promotes another owner,
  the fix requires writes outside the owned control-plane dispatch retry path,
  or the same frontier remains red after one bounded dispatch retry proof.

## Predecessor And Migration Handoff

The predecessor is
`work/packages/done-20260513-rolling-restart-active-gate-snapshot-coverage-after-readiness-support-reduction.md`.
Socrates reviewed that predecessor and found metadata fixes required before
this package can start implementation.

The migration handoff is evidence-driven: the predecessor artifact
`test-output/reports/rolling-restart-green-gate-after-active-gate-register-service-timeout.report.json`
promotes `priority_recovery_partition_progress` back to the first frontier and
projects active-gate snapshot coverage behind priority progress. This package
therefore owns the priority-recovery SQL write dispatch retry progress repair,
while active-gate runtime work waits for canonical evidence to promote it
again.

The post-proof representative artifact
`test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`
keeps the same first frontier but changes the next concrete residual to
coordinator-created remote handoff retry/ACK progress. That is outside this
package's control-plane dispatch retry write scope, so this package records the
same-frontier result and hands off to a focused successor instead of broadening.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Subagent Sequencing Ledger

Review/fix proof is recorded before implementation starts. Focused
implementation proof is recorded for this package; the parent representative
rerun has now been executed and classified as same-frontier.

- [x] Review subagent recorded:
      Agent Socrates (019e2272-f38b-7191-9028-735ec3b2f23c) reviewed work/packages/done-20260513-rolling-restart-active-gate-snapshot-coverage-after-readiness-support-reduction.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed:
      Agent Leibniz (019e2277-74bf-72c1-9ba3-283be58c0380) fixed work/packages/done-20260513-rolling-restart-active-gate-snapshot-coverage-after-readiness-support-reduction.md
- [x] Implementation subagent recorded:
      Agent Gauss (019e2281-159e-7cb3-a423-085003544e3b) implemented work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md

## In Scope

1. Metadata and tracker handoff repair for this package.
2. Ready-node dispatch retry progress in the owned control-plane dispatch
   candidate files.
3. Focused control-plane tests and guardrails selected by the implementation
   worker.
4. One representative `rolling-restart` rerun after focused tests pass and
   same-frontier classification if the first frontier remains open.

## Out Of Scope

1. Operation workflow remote handoff runtime changes in this package.
2. Harness timeout increases.
3. Startup active-gate runtime changes without fresh first-frontier evidence.
4. Publication convergence runtime changes without fresh first-frontier
   evidence.
5. Pro behavior.
6. Enterprise behavior.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md`, `work/sprints/archived/done-2026-q2-phase-0-1-rolling-restart-release-gate-closure-failed.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `work/model-ledger.jsonl`, `src/control-plane/replica-dispatch-service-segment-2.js`, `src/control-plane/replica-dispatch-service-segment-3.js`, `src/control-plane/replica-dispatch-service-segment-4.js`, `test/control-plane/replica-dispatch-node-state-update.test-part-2.js`, `test/control-plane/replica-dispatch-node-state-update.test-part-3.js`, `test/control-plane/replica-dispatch-node-state-update.test-part-4.js`
- Forbidden files: operation workflow remote handoff runtime changes in this package, harness timeout increases, startup active-gate runtime changes without fresh first-frontier evidence, publication convergence runtime changes without fresh first-frontier evidence, Pro behavior, Enterprise behavior.
- Frozen decisions: latest canonical evidence owns the current first frontier at `operation_workflow_owner / workflow_progress`; active gate is downstream/projected until priority progress closes; same-frontier remote handoff evidence must move to a focused successor instead of broadening this control-plane package.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --explain priority_recovery_partition_progress`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`, `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown`, `node --test test/control-plane/replica-dispatch-node-state-update.test-part-2.js test/control-plane/replica-dispatch-node-state-update.test-part-3.js test/control-plane/replica-dispatch-node-state-update.test-part-4.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --fast-local --verbose`
- Model ledger advisory: `escalate`

## Causal Governance

- Causal hypothesis: if `operation_workflow_owner / workflow_progress` owns
  the latest priority recovery residual, ready-node dispatch retry must
  rediscover the persisted SQL write operation and dispatch or advance it
  through one bounded owner path.
- Stop-condition check:
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`
- Expected causal-model change: priority recovery converges, reduces to a
  narrower workflow-progress or rebalancer-handoff edge, or migrates to a
  fresh owner boundary after focused dispatch retry proof and one
  representative rerun.
- Representative outcome: `same-frontier`.
- Causal debt: latest evidence remains red with retry-deferred
  coordinator-created remote handoff ACK failures for operations
  `0668b124-2977-4133-98a0-89ece2f4bc68`,
  `fdee7c84-41f0-4d42-bef3-cd378e12f78f`,
  `e3ec7f62-cd2f-423a-a8a7-6500265be8d1`, and
  `643459cb-76a9-4058-a84b-8bc1262e076c`; active gate is still
  downstream/projected at `active=2/5` and `snapshotCoverage=2/5`.
- Cross-boundary review: Socrates reviewed the active-gate predecessor and
  found fixes required; this package records the requested fix proof and the
  focused implementation proof.

## Scenario Causal Closure

- Reference scenario/probe: `rolling-restart` representative report after
  focused SQL write dispatch retry proof.
- Phase chain: publication convergence, priority recovery operation workflow
  progress, startup active-gate snapshot coverage, startup readiness support
  evidence.
- Current first frontier: `priority_recovery_partition_progress` remains under
  `operation_workflow_owner / workflow_progress`.
- Known downstream blockers: active-gate snapshot coverage is projected
  downstream with `active=2/5` and `snapshotCoverage=2/5`; startup readiness
  support remains downstream of active-gate progress; publication convergence
  is `PUBLISHED` with `pendingAck=0` but still has `missingPublished=3` while
  priority progress is open.
- Missing causal edge: coordinator-created remote handoff retry/ACK progress
  must move retry-deferred operations through one bounded dispatch, delivery,
  ACK, timeout, or reconcile path.
- Missing causal edge probe:
  `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --markdown`
- Bounded progress proof: focused control-plane tests proved ready-node
  dispatch retry rediscovery and re-enqueue behavior; successor proof must
  target operation workflow remote handoff ACK/retry progress.
- Bounded progress proof artifact:
  `test/control-plane/replica-dispatch-node-state-update.test-part-2.js`
- Expected observable transition: the focused control-plane proof moved the
  residual from persisted-not-dispatched visibility to retry-deferred remote
  handoff evidence, but the representative first frontier stayed
  `priority_recovery_partition_progress`.
- Max progress bound: one ready-node dispatch retry owner cycle plus one
  representative `rolling-restart` rerun after focused tests pass; this package
  has exhausted that bound.
- Same-frontier fallback: keep
  `operation_workflow_owner / workflow_progress` ahead of active-gate work and
  split to a focused handoff/progress successor rather than broadening this
  package.
- Expected next frontier: a narrower operation-workflow successor for
  coordinator-created remote handoff retry/ACK progress, then active-gate
  snapshot coverage only after priority progress closes.
- Result classification: `same-frontier`.
- Stop condition: `continue-local-fix`.

## Validation

1. npm run work:package:doctor -- --suggest work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --markdown
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --explain priority_recovery_partition_progress
5. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json
6. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json
7. npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown
8. npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown
9. node --test test/control-plane/replica-dispatch-node-state-update.test-part-2.js test/control-plane/replica-dispatch-node-state-update.test-part-3.js test/control-plane/replica-dispatch-node-state-update.test-part-4.js
10. node scripts/check-guideline-literals.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-segment-3.js src/control-plane/replica-dispatch-service-segment-4.js
11. node scripts/check-guideline-decision-boundaries.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-segment-3.js src/control-plane/replica-dispatch-service-segment-4.js
12. npm run audit:runtime-grammar:file -- src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-segment-3.js src/control-plane/replica-dispatch-service-segment-4.js
13. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --fast-local --verbose
14. npm run work:current-blocker
15. npm run work:validate -- --entry work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md
16. npm run work:validate -- --pre-impl work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md

## Implementation Result

- Focused owner proof: ready-node priority recovery rediscovery now treats
  specific partition-witness operation ids as required cache coverage. A
  partition-visible cached row no longer masks the blocked SQL write operation
  named by `priorityRecoveryPartitionWitnesses`.
- Regression added:
  `ReplicaDispatchService ready-node retry rediscovers the priority witness operation when its partition is cache-visible`.
- Representative rerun:
  `test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`
  remains red, same-frontier at `priority_recovery_partition_progress` under
  `operation_workflow_owner / workflow_progress`.
- Same-frontier handoff: the next bounded residual is coordinator-created
  remote handoff retry/ACK progress, not additional control-plane dispatch
  retry coverage in this package.

## Raw Fallback Notes

Canonical extractors used first:
`work:evidence-summary`,
`analyze:priority-recovery-residuals --markdown`,
`analyze:topology-convergence --explain priority_recovery_partition_progress`,
`analyze:causal-model`, `analyze:distributed-failure`, and
`analyze:owner-files` for both `workflow_progress` and `rebalancer_handoff`.

Fallback reason: the canonical extractors identified the same first frontier
and split owner/boundary groups, but they did not expose the operation-level
remote handoff ACK failures. Raw inspection of the generated triage summary,
failure bundle, `events.ndjson`, and node logs showed repeated
`coordinator_created_remote_handoff` dispatch failures with
`Message not acknowledged` for the operations listed in the causal debt.
