# Priority Failed Replace Active-Target Recovery Closure Under Load

April 26 update: This package owned the load-readiness
regression exposed after the source-visibility fix. The failing recovery row was
not missing a target anymore: the latest priority `REPLACE` target was already
`active_operational`, while the operation was terminal failed and priority
recovery still reported unresolved progress.

Latest representative evidence:

1. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-stop-phase-source-visibility.report.json`
2. failure point: load readiness before rolling restart begins
3. readiness timeout: `Cluster load readiness did not stabilize within
   300000ms`
4. partition: `control_plane_publications-p1`
5. operation: failed priority `REPLACE`
6. target visibility: `active_operational`
7. residual labels: `eligible_but_no_operation_created` /
   `blocked_unclassified`
8. pressure evidence: outbound delivery saturation, CDC forward-to-leader
   rejection, WebSocket timeout churn, and retryable system-table write
   failures

## April 26 Closure Update

The execution slice closed this owner boundary in the priority recovery
snapshot:

1. terminal failed priority `REPLACE` rows now satisfy recovery when the
   replacement target is `active_operational` on an eligible node
2. the failed replacement no longer emits
   `eligible_but_no_operation_created`
3. the partition leaves `needs_operation` and uses the shared
   `spread_satisfied_in_flight` state
4. focused control-plane coverage confirms the active-target failed
   replacement path
5. the representative rerun migrated from `control_plane_publications-p1` to
   `sql_write_operations-p1`

Migrated evidence:

1. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-failed-replace-active-target.report.json`
2. `control_plane_publications-p1` is now `spread_satisfied_in_flight`
3. `sql_write_operations-p1` is the only unresolved priority partition
4. unresolved class: `eligible_but_no_operation_created`
5. semantic state: `needs_operation`
6. next required action: `create_recovery_operation`

The active handoff is:
[Priority operation creation local mutation gate under load](./done-20260426-priority-operation-creation-local-mutation-gate-under-load.md).

## Why

The previous priority-spread package closed the missing operation creation path.
The source-visibility slice then prevented ordinary source-removal completion
responses from terminalizing `REPLACE` source removal before visibility
converges. The representative path now fails earlier, with a more precise
state:

1. the latest operation is terminal failed
2. the replacement target is already active and operational
3. priority spread still has a gap or unresolved classification
4. the owner outcome drifts between missing-operation and unclassified blockers

This is a decision-boundary problem. A terminal failed priority `REPLACE` whose
target is already operational must emit exactly one canonical outcome:
recovery closed, cleanup remove, retry or follow-up operation, or
pressure-deferred.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Priority spread recovery operation creation under load](./done-20260426-priority-spread-recovery-operation-creation-under-load.md)
2. [Rolling restart operation transition pressure and over-target trim](./active-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)
3. [Critical recovery pressure reserve and admission contract](./done-20260424-critical-recovery-pressure-reserve-and-admission-contract.md)

## In Scope

1. Define one owner decision for terminal failed priority `REPLACE` rows whose
   target visibility is `active_operational`.
2. Ensure priority recovery classification does not report
   `eligible_but_no_operation_created` when the latest relevant operation and
   active target are already visible.
3. Emit either closure, cleanup, retry, follow-up operation creation, or
   pressure-deferred as the canonical result.
4. Add focused tests for the failed-`REPLACE` active-target decision table.
5. Rerun the targeted audits and record whether `rolling-restart` returns to
   the post-active over-target barrier or migrates again.

## Out Of Scope

1. Increasing readiness or convergence timeouts.
2. Harness-only classification changes that hide owner-visible recovery debt.
3. Broad matrix execution before the 5-node representative path stabilizes.
4. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  priority recovery snapshot and unified rebalancer follow-up admission.
- Canonical contract:
  one failed-`REPLACE` active-target snapshot names operation terminality,
  target visibility, source visibility, spread state, pressure state, and the
  next required action.
- Allowed consumers:
  priority recovery observation, membership publication readiness diagnostics,
  unified rebalancer operation admission, and harness reporting.
- Prohibited reinterpretations:
  treating an active operational target as missing target work, treating a
  terminal failed operation as absence of an operation, or emitting
  `blocked_unclassified` when the operation/visibility evidence is sufficient
  to choose a canonical action.

## Progress Grammar

1. `failed_replace_target_satisfies_recovery` means the failed replacement's
   target is active operational and the priority voter target is satisfied.
2. `failed_replace_cleanup_pending` means the active target is valid but stale
   source or over-target membership still requires a cleanup remove.
3. `failed_replace_followup_required` means the failed operation target cannot
   satisfy recovery and one follow-up operation must be admitted or retried.
4. `failed_replace_pressure_deferred` means owner evidence chooses a concrete
   next action, but write or delivery pressure delays it.
5. `closed` means priority recovery has no unresolved semantic states for the
   partition.

## Residual Closure Inventory

- [x] Failed priority `REPLACE` with `active_operational` target is classified
      by one decision table.
- [x] `eligible_but_no_operation_created` is not emitted for partitions with a
      latest terminal failed operation plus active operational replacement
      target.
- [x] Active-target closure uses the explicit shared
      `spread_satisfied_in_flight` outcome; follow-up and pressure-deferred
      operation creation are owned by the migrated local mutation gate package.
- [x] Focused control-plane or rebalancer tests cover the active-target failed
      replacement path.
- [x] The representative rerun either reaches post-active convergence again or
      migrates to a newly named owner boundary.

## Validation

1. `npm test -- test/control-plane/priority-recovery-snapshot.test.js`
2. `npm test -- test/rebalancer/unified-rebalancer.test.js`
3. `npm run audit:guideline:decision-boundaries`
4. `npm run audit:guideline:literals`
5. `npm run test:metadata-gateway:audit`
6. `npm run audit:guideline:boundary-mode-contracts`
7. `npm run audit:runtime-grammar`
8. `git diff --check`
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260426-codex-failed-replace-active-target.report.json --verbose`

Known validation note:

1. the focused control-plane suite passes
2. the static audits pass with no new audit violations
3. the representative rerun migrated to the local mutation gate package
4. the stale unified-rebalancer budget owner-read subtest was migrated to the
   metadata gateway owner contract during follow-up sprint review

## Done When

1. The failed-`REPLACE` active-target path emits one canonical owner outcome.
2. `rolling-restart` no longer fails load readiness with
   `control_plane_publications-p1` stuck between
   `eligible_but_no_operation_created` and `blocked_unclassified`, or the
   blocker migrates to a new named owner boundary with this package inventory
   updated.
