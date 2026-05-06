# Priority Operation Creation Local Mutation Gate Under Load

April 26 update: This package owned the migrated
`rolling-restart` load-readiness blocker after failed priority `REPLACE`
active-target recovery stopped reopening missing operation work.

Latest representative evidence:

1. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-failed-replace-active-target.report.json`
2. failure point: load readiness before rolling restart begins
3. readiness timeout: `Cluster load readiness did not stabilize within
   300000ms`
4. publication epoch `5` is `PUBLISHED`
5. pending ACK count is `0`
6. `control_plane_publications-p1`, `replica_operations-p1`,
   `sql_transaction_participants-p1`, and `sql_transactions-p1` are
   `spread_satisfied_in_flight`
7. `sql_write_operations-p1` remains `needs_operation`
8. blocker: `eligible_but_no_operation_created`
9. next required action: `create_recovery_operation`
10. operation identity: `operation_unknown`
11. pressure evidence includes local mutation/readiness degradation,
    owner-query pressure, delivery-source saturation, and authoritative
    discovery repair timeouts

## April 26 Closure Update

The local mutation readiness gate now lets required priority recovery operation
creation reach rebalance evaluation. The representative rerun moved past load
readiness and through the restart cycle:

1. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-local-mutation-priority-creation.report.json`
2. failure point moved to post-restart convergence timeout after `120000ms`
3. priority recovery blocked partition count is `0`
4. priority recovery unresolved partition count is `0`
5. `eligible_but_no_operation_created` is empty in the final report evidence
6. `needs_operation` is empty in the final report evidence
7. priority spread is not pending
8. `sql_write_operations-p1` created `REPLACE` operation rows and the target
   replica reached active state

The active handoff is:
[Rolling restart operation transition pressure and over-target trim](./todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).

Migrated evidence:

1. convergence timeout after `120000ms`
2. in-flight replica operations: `3`
3. in-flight statuses: `active=5`, `removed=7`, `failed=1`, `creating=3`
4. over-target partitions: `replica_operations-p1` and
   `sql_write_operations-p1`
5. voter counts: both over-target partitions are at `4`
6. post-rebalance blockers: `operation_drain_open`,
   `membership_trim_open`, `publication_visible_open`, and
   `no_over_target_open`
7. publication epoch `8` is `ACK_PENDING` with pending ACK node
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`

## Why

The failed-`REPLACE` active-target package closed the misleading
`control_plane_publications-p1` missing-operation classification. The
representative path then migrated to a cleaner owner boundary:
`sql_write_operations-p1` has enough priority recovery evidence to create one
recovery operation, but planning can still be parked by broad local mutation
readiness before the priority operation-creation path reaches evaluation.

This package owns that decision boundary. Local mutation readiness may still
defer ordinary planning, but it must not suppress a priority control-plane
partition whose canonical recovery snapshot says one operation must be created.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Priority failed replace active-target recovery closure under load](./done-20260426-priority-failed-replace-active-target-recovery-closure-under-load.md)
2. [Priority spread recovery operation creation under load](./done-20260426-priority-spread-recovery-operation-creation-under-load.md)
3. [Rolling restart operation transition pressure and over-target trim](./todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)

## In Scope

1. Add one local mutation readiness planning state table that distinguishes
   ordinary mutation blocking from required priority recovery operation
   creation.
2. Let the current priority partition reach rebalance evaluation when its
   recovery snapshot says `needs_operation` with
   `create_recovery_operation`.
3. Preserve ordinary local mutation readiness deferral for non-priority work
   and priority partitions that do not own required operation creation.
4. Keep transport backpressure bypass and priority spread bypass semantics
   unchanged.
5. Add focused rebalancer coverage for the local mutation bypass.
6. Rerun targeted audits and then rerun the representative path to confirm
   whether the blocker closes or migrates.

## Out Of Scope

1. Increasing readiness or convergence timeouts.
2. Harness-only classification changes that hide owner-visible recovery debt.
3. Changing budget owner routing outside the metadata gateway contract.
4. Broad matrix execution before the 5-node representative path stabilizes.
5. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  unified rebalancer planning gates and priority recovery operation admission.
- Canonical contract:
  one local mutation readiness planning snapshot names local readiness
  evidence, priority operation-creation requirement, planning state, planning
  action, partition id, scope, and defer decision.
- Allowed consumers:
  `checkRebalance` planning gates, priority operation admission, diagnostics,
  and harness failure triage.
- Prohibited reinterpretations:
  treating local mutation pressure as a blanket priority recovery stop when
  the current priority partition requires operation creation, or treating
  required creation as ordinary background planning.

## Progress Grammar

1. `local_mutation_blocked` means local mutation readiness owns the defer
   decision.
2. `priority_recovery_operation_creation_required` means local mutation
   readiness evidence exists, but priority recovery operation creation owns
   the next action and planning must continue.
3. `clear` means no local mutation readiness blocker exists.
4. `allow_planning` means the planning gate returns no defer decision.
5. `defer_planning` means the planning gate schedules the existing
   priority-aware retry cadence.

## Residual Closure Inventory

- [x] Local mutation readiness planning uses one explicit state table.
- [x] Required priority recovery operation creation bypasses local mutation
      readiness deferral for the current priority partition.
- [x] Bypass diagnostics preserve operation-creation requirement, partition id,
      and scope.
- [x] Focused rebalancer test covers the bypass path through
      `checkRebalance`.
- [x] Guideline literal and decision-boundary audits pass with no new debt.
- [x] Representative `rolling-restart` rerun confirms the blocker closes or
      migrates to the next named owner boundary.

## Validation

1. `npm test -- test/rebalancer/unified-rebalancer.test.js --grep "priority operation creation bypass local"`
2. `npm run audit:guideline:decision-boundaries`
3. `npm run audit:guideline:literals`
4. `npm run test:metadata-gateway:audit`
5. `npm run audit:guideline:boundary-mode-contracts`
6. `npm run audit:runtime-grammar`
7. `git diff --check`
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260426-codex-local-mutation-priority-creation.report.json --verbose`

Follow-up review note:

1. The stale budget owner-read subtest was migrated to assert the metadata
   gateway owner contract. Gateway authoritative reads still delegate to the
   CDC owner implementation when configured, while runtime callers stay on the
   canonical gateway ingress.

## Done When

1. Local mutation readiness no longer prevents required priority recovery
   operation creation from reaching rebalance evaluation.
2. `rolling-restart` no longer fails load readiness with
   `sql_write_operations-p1` stuck at `needs_operation` /
   `eligible_but_no_operation_created`, or the blocker migrates to a newly
   named owner boundary with this package inventory updated.
