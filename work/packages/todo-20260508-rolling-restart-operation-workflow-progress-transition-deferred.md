# Rolling Restart Operation Workflow Progress Transition Deferred

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-20260508T194848Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-20260508T194848Z/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_workflow_progress_transition_deferred",
  "currentState": "Fresh rolling-restart release-gate artifact failed the active gate with active=2/5, snapshotCoverage=3/5, publication=PUBLISHED, pendingAck=0, prioritySpread=pending, and priorityRecoveryInvariants=passed; normalized topology evidence selects operation_workflow_owner / workflow_progress with blocked partitions control_plane_publications-p1, sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1, while startup_active_gate_owner / snapshot_coverage remains downstream.",
  "nextAction": "Freeze the workflow-progress witness and implement the smallest owner-path probe or fix for priority_recovery_workflow_progress_transition_deferred before rerunning rolling-restart.",
  "proof": [
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-20260508T194848Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-20260508T194848Z.report.json --explain priority_recovery_partition_progress",
    "Focused operation_workflow_owner workflow_progress regression or blocker probe",
    "Touched-file static guardrails selected by the implementation boundary",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-next.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/packages/todo-20260508-rolling-restart-operation-workflow-progress-transition-deferred.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-core-topology-legacy-path-deletion-and-proof.md"
}
-->

Opened on May 8, 2026 after the completed core topology control-plane rewrite
package instructed the next representative harness rerun to open a fresh
package only if a new owner-boundary blocker appeared. The rerun did expose a
new blocker: `operation_workflow_owner / workflow_progress /
priority_recovery_workflow_progress_transition_deferred`.

## Current Evidence

1. Representative command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-20260508T194848Z.report.json --fast-local --verbose`
2. Representative report:
   `test-output/reports/rolling-restart-current-release-gate-20260508T194848Z.report.json`.
3. Playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-20260508T194848Z/rolling-restart/`.
4. Result: failed after `132623ms`.
5. Active gate: `2/5` nodes reached ACTIVE within `120000ms`.
6. Reported progress snapshot: `snapshotCoverage=3/5`,
   `publication=PUBLISHED`, `pendingAck=0`, `prioritySpread=pending`.
7. Priority recovery invariants: `passed`.
8. Frontier edge: `priority_recovery_partition_progress`.
9. Owner and boundary: `operation_workflow_owner / workflow_progress`.
10. Dominant reason:
    `priority_recovery_workflow_progress_transition_deferred`.
11. Reasons:
    `priority_recovery_event_driven_wait` and
    `priority_recovery_progress_blocked`.
12. Blocked partitions: `control_plane_publications-p1`,
    `sql_transaction_participants-p1`, `sql_transactions-p1`, and
    `sql_write_operations-p1`.
13. Priority recovery classes:
    `priority_operation_serial_wait` for
    `sql_transaction_participants-p1`, `sql_transactions-p1`, and
    `sql_write_operations-p1`.
14. Semantic states: `needs_operation` and `recovering_in_flight`.
15. Witness detail:
    `control_plane_publications-p1` is `recovering_in_flight` with
    `persisted_not_dispatched` and `dispatch_pending`; the SQL transaction
    partitions and write-operation partition are `transition_deferred` in
    `event_driven` wait for `wait_for_operation_progress`, with serial-wait
    operation ids present on some witnesses.
16. Next expected frontier after priority progress closes:
    `startup_active_gate_owner / snapshot_coverage`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance and release-gate closure
scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo.

## In Scope

1. Freeze the current report and playback witness for
   `operation_workflow_owner / workflow_progress`.
2. Preserve the generated owner evidence block and explain output as the
   canonical blocker snapshot.
3. Add one focused owner-path probe or regression for the selected
   priority-recovery workflow-progress transition-deferred seam.
4. Repair or classify why `wait_for_operation_progress` remains
   event-driven/deferred for the blocked priority partitions.
5. Prove that priority workflow progress either advances or migrates to a new
   named owner boundary with representative evidence.
6. Keep the final representative rerun on `rolling-restart --fast-local`.

## Out Of Scope

1. Runtime code changes during this tracker-artifact creation slice.
2. Reopening the core topology control-plane rewrite unless fresh evidence
   restores that owner as the first frontier.
3. Reopening old publication, operation-scheduling, or workflow-timeout
   residual packages unless a fresh artifact restores their owner boundary as
   the first frontier.
4. Harness timeout increases, report relabeling, or analyzer changes that hide
   the workflow-progress blocker.
5. Phase `0.5`, Phase `1.0`, Pro, or Enterprise work.

## Invariants

1. `operation_workflow_owner` remains the only owner that decides whether
   operation workflow progress can advance, defer, retry, or block.
2. `workflow_progress` evidence must not be reinterpreted from raw cache
   timing, elapsed time alone, admin reachability, or startup active-gate
   symptoms.
3. `transition_deferred`, `event_driven`, `wait_for_operation_progress`,
   `priority_operation_serial_wait`, `needs_operation`, and
   `recovering_in_flight` must retain one canonical meaning across analyzer,
   failure-bundle, diagnostics, and owner-path tests.
4. `startup_active_gate_owner / snapshot_coverage` remains downstream until
   priority workflow progress closes or migrates.
5. No domain/runtime scalar, absence state, or independent branch lattice may
   be introduced while fixing the owner-path boundary.

## Hotspots

1. `src/rebalancer/operation-workflow-owner.js`
2. `src/rebalancer/operation-workflow-owner-shared.js`
3. `src/rebalancer/operation-workflow-owner-segment-5*.js`
4. `src/rebalancer/operation-workflow-owner-segment-7*.js`
5. `src/control-plane/priority-recovery-snapshot*.js`
6. `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
7. `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
8. `test/control-plane/priority-recovery-snapshot*.js`
9. `test/distributed/harness/failure-bundle*.js`
10. `test/distributed/harness/__tests__/failure-bundle-core-*.js`
11. `scripts/analyze-topology-convergence.js`

Dirty-worktree caution: do not touch unrelated existing edits in
`test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`,
`test/distributed/harness/failure-bundle-segment-4.js`, or unrelated tracker
and export files unless the implementation package explicitly adopts that
scope.

## Shared Boundary Contract

Semantic owner: `operation_workflow_owner`.

Canonical contract shape / vocabulary:

1. `workflow_progress` is the boundary for priority partitions that already
   have operation-workflow evidence but still require canonical operation
   progress before the active gate can close.
2. `transition_deferred` is a retryable/deferred workflow outcome, not a
   terminal failure and not a startup active-gate result.
3. `event_driven` wait means progress requires a canonical operation-owner
   event, durable state transition, or owner re-entry, not a harness timeout
   extension.
4. `priority_operation_serial_wait` identifies serial dependency evidence that
   must remain attached to the operation owner until the dependency advances or
   is classified.

Allowed consumers: priority recovery snapshots, topology convergence analyzer,
distributed failure bundles, diagnostics/admin surfaces, owner-path tests, and
the `rolling-restart` harness gate.

Prohibited reinterpretations:

1. Consumers must not convert workflow-progress blockers into generic startup
   active-gate timeout text.
2. Consumers must not demote serial-wait blockers to operation scheduling
   unless the owner evidence says no operation exists.
3. Consumers must not treat `null`, `undefined`, missing cache rows, or
   admin reachability gaps as semantic workflow-progress states.
4. Consumers must not choose independent publication, startup, scheduling, and
   workflow reasons when one owner-decision snapshot names the direct frontier.

Primary diagnostics / proof surfaces: generated owner evidence block, topology
owner explain output, focused owner-path regression, affected failure-bundle or
analyzer presentation tests if the contract surface changes, touched-file
static guardrails, and one representative `rolling-restart --fast-local`
rerun.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: not-needed (`first-package-in-sprint`).
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded:
      Agent Descartes (`019e0927-6e73-7310-990b-e1d7f39bc260`) implemented
      `work/packages/todo-20260508-rolling-restart-operation-workflow-progress-transition-deferred.md`.

## Static Drift Ledger

Preflight:

- [x] Tracker-only creation slice selected no runtime or test source edits.
- [x] Existing unrelated dirty files classified as out of scope for this
      tracker slice.
- [x] Current blocker evidence recorded from the report and generated owner
      evidence block.
- [ ] Before runtime implementation starts, run file-scoped or boundary-scoped
      baseline guardrails for the selected owner files.
- [ ] Before runtime implementation starts, record inherited touched-file debt
      and decide whether any oversized owner segment extraction is in scope.

Closure:

- [ ] Rerun the same guardrails after implementation.
- [ ] No relevant guardrail count increases.
- [ ] No new touched-file owner-path, decision-boundary, runtime-grammar,
      literal-owner, metadata-gateway, or diff hygiene violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.
- [ ] Package-owned changes are committed as one focused slice.
- [ ] The focused package slice is pushed before the next package starts.

## Failure Migration / Contraction

Current dominant blocker:
`priority_recovery_workflow_progress_transition_deferred`.

Current semantic owner:
`operation_workflow_owner`.

Current boundary:
`workflow_progress`.

Generated evidence block:

```text
Source artifact: test-output/reports/rolling-restart-current-release-gate-20260508T194848Z.report.json
Scenario: rolling-restart
Frontier edge: priority_recovery_partition_progress
Current semantic owner: operation_workflow_owner
Current boundary: workflow_progress
Frontier state: blocked
Dominant reason: priority_recovery_workflow_progress_transition_deferred
Evidence path: report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness
Reasons: priority_recovery_event_driven_wait, priority_recovery_progress_blocked
Next explain command: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-20260508T194848Z.report.json --explain priority_recovery_partition_progress
```

Owner explain command:
`npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-20260508T194848Z.report.json --explain priority_recovery_partition_progress`.

Owner explain summary:

1. Evidence inputs: `unresolvedSemanticStateIds` and
   `priorityBlockedPartitionCount`.
2. Source unresolved semantic states:
   `needs_operation,recovering_in_flight`.
3. Source blocked partitions:
   `control_plane_publications-p1,sql_transaction_participants-p1,sql_transactions-p1,sql_write_operations-p1`.
4. Decision outcome: `blocked`, frontier `true`.
5. Decision table states: satisfied when there are no unresolved semantic
   states; blocked when partitions are blocked; retryable when
   `recovering_in_flight` is present; blocked when unresolved semantic states
   remain without in-flight recovery.

Historical migrations that are evidence only:

1. The core topology control-plane rewrite is closed and remains predecessor
   proof.
2. Archived rolling-restart publication, operation-scheduling,
   workflow-timeout, and startup active-gate packages remain historical
   evidence unless a fresh artifact restores one as the first frontier.
3. This fresh artifact is not a timestamp-only rerun; it has a new
   owner-boundary snapshot after the predecessor's next action.

Representative rerun migration:

1. Source artifact:
   `test-output/reports/rolling-restart-current-release-gate-next.report.json`.
2. Representative command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-next.report.json --fast-local --verbose`.
3. Result: failed after `134525ms`; the package did not close the
   rolling-restart active gate.
4. Migrated owner and boundary:
   `operation_workflow_owner / rebalancer_handoff`.
5. Dominant reason:
   `priority_recovery_rebalancer_handoff_retry_scheduled`.
6. Reasons:
   `priority_recovery_event_driven_wait` and
   `priority_recovery_progress_blocked`.
7. Blocked partitions:
   `control_plane_publications-p1`, `replica_operations-p1`,
   `sql_transaction_participants-p1`, and `sql_write_operations-p1`.
8. Unresolved semantic states:
   `needs_operation`, `operation_stalled`, and `recovering_in_flight`.
9. Next action is a successor `rebalancer_handoff` package; this
   workflow-progress package does not implement that successor boundary.

Replayable owner-decision fixture or blocker probe:

1. Reconstruct the `priority_recovery_partition_progress` dominant witness
   with `control_plane_publications-p1`,
   `sql_transaction_participants-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1`.
2. Preserve the `persisted_not_dispatched`, `dispatch_pending`,
   `priority_operation_serial_wait`, `transition_deferred`,
   `event_driven`, and `wait_for_operation_progress` signals.
3. Assert one canonical `operation_workflow_owner / workflow_progress`
   outcome and reasons before any representative rerun.

Presentation surfaces that must consume the decision contract:

1. Topology convergence analyzer.
2. Distributed failure report summary.
3. Failure-bundle priority recovery summary.
4. Startup active-gate progress text after priority progress closes.

Decision table / glossary proof:

1. `npm run analyze:owner-decisions`
2. `npm run analyze:owner-glossary`

## Residual Closure Inventory

- [x] Fresh representative report and playback are named.
- [x] Current owner, boundary, dominant reason, reasons, and blocked
      partitions are recorded.
- [x] Previous completed package is named as predecessor evidence.
- [x] Temporary implementation marker is replaced with the real agent
      identity.
- [ ] Focused owner-decision fixture or blocker probe is committed.
- [x] Direct workflow-progress owner path is repaired or classified.
- [ ] Failure-bundle/analyzer consumers are updated only if the owner contract
      shape changes.
- [ ] Touched-file static guardrails pass.
- [x] Representative `rolling-restart --fast-local` rerun passes or migrates
      to one named owner boundary.
- [ ] Model ledger is recorded before closure if the implementation adds
      useful model-fit evidence.
- [ ] Commit and push ledger is added before this package is renamed to
      `done-...`.

Inventory notes:

1. Focused workflow-progress classification exists in
   `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`;
   commit remains pending, so the committed-probe item stays unchecked.
2. The representative rerun migrated from `workflow_progress` to
   `rebalancer_handoff`; successor implementation is intentionally out of
   scope for this package.

## Validation

Tracker creation evidence:

1. `npm run work:context` passed before tracker edits and identified the
   predecessor next action: open a new package if the next representative
   harness rerun exposes a fresh owner-boundary blocker.
2. `npm run work:model-ledger -- summary` recommended escalation for
   distributed-runtime work.
3. Report path and playback directory were confirmed present.
4. `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-20260508T194848Z.report.json`
   selected `operation_workflow_owner / workflow_progress`.
5. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-20260508T194848Z.report.json --explain priority_recovery_partition_progress`
   selected the same owner boundary and decision outcome.
6. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-20260508T194848Z.report.json`
   selected dominant reason
   `priority_recovery_workflow_progress_transition_deferred`.
7. `npm run work:current-blocker` passed after subagent ledger finalization.
8. `npm run work:validate` passed after subagent ledger finalization.
9. `git diff --check` on package-owned tracker files passed after subagent
   ledger finalization.

Implementation and migration evidence:

1. `node test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
   passed with `39` assertions.
2. Representative
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-next.report.json --fast-local --verbose`
   failed after `134525ms` and migrated to
   `operation_workflow_owner / rebalancer_handoff`.
3. `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-next.report.json`
   selected `operation_workflow_owner / rebalancer_handoff` with dominant
   reason `priority_recovery_rebalancer_handoff_retry_scheduled`.
4. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-next.report.json --explain priority_recovery_partition_progress`
   selected the same migrated owner boundary and blocked decision outcome.
5. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-next.report.json`
   selected dominant reason
   `priority_recovery_rebalancer_handoff_retry_scheduled`.

Required implementation validation:

1. Focused owner-path regression or replayable blocker probe for the current
   witness.
2. Focused tests for the touched owner files.
3. Affected analyzer, diagnostics, or failure-bundle tests if the consumer
   contract changes.
4. Touched-file literal, decision-boundary, runtime-grammar, and diff hygiene
   guardrails.
5. `npm run work:current-blocker`.
6. `npm run work:validate`.
7. `git diff --check`.
8. Representative
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-next.report.json --fast-local --verbose`.

## Done When

1. The temporary implementation marker has been replaced with a real agent
   name and agent id.
2. The current workflow-progress witness has a focused regression or
   replayable blocker probe.
3. `operation_workflow_owner / workflow_progress` either advances priority
   recovery or emits one canonical reason it remains blocked.
4. `startup_active_gate_owner / snapshot_coverage` is reached only after
   priority progress closes, or a new package names the migrated owner
   boundary.
5. Required focused tests, static guardrails, work validation, and diff hygiene
   pass.
6. A representative `rolling-restart --fast-local` rerun passes or is recorded
   as a named owner-boundary migration.
7. The package has a truthful Commit And Push Ledger before closure.
