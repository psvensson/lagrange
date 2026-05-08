# Rolling Restart Readiness Gate Priority Operation Creation Reentry

Opened and closed by migration on May 4, 2026 after
[Rolling Restart Startup Publication Membership Priority Recovery Coordination](./done-20260504-rolling-restart-startup-publication-membership-priority-recovery-coordination.md)
reached a clean publication / priority-spread owner boundary.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-startup-publication-membership-priority-recovery-coordination-20260504-codex.report.json`
2. Result: failed, `0/1` passed after `174.7s`.
3. Publication was `PUBLISHED`, published active membership was `5/5`,
   pending ACK count was `0`, missing published active nodes were `0`, and
   selected snapshot coverage was `5/5`.
4. Terminal closure witness:
   `CL-003` / `publication_converged_priority_spread_pending`.
5. Priority recovery blocker:
   `sql_write_operations-p1` was `eligible_but_no_operation_created` /
   `needs_operation`.
6. The operation-creation lane had to pass startup topology, traffic-readiness,
   and local-serve readiness planning gates without waiting for unrelated
   readiness stabilization.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Let priority recovery operation creation pass startup topology-settling
   blockers when the blocker is not protecting in-flight topology operations.
2. Let priority recovery operation creation pass startup traffic-readiness
   planning blockers.
3. Let priority recovery operation creation pass startup local-serve readiness
   planning blockers.
4. Preserve the existing in-flight topology operation invariant.
5. Re-run focused rebalancer tests and the representative
   `rolling-restart --fast-local` scenario.

## Out Of Scope

1. Broad changes to priority recovery admission.
2. Bypassing topology-settling for in-flight topology operations.
3. Post-active over-target trim.
4. Broad matrix reruns before the representative path passes or migrates.
5. Pro or Enterprise behavior.

## Closure Evidence

1. Added regression coverage in
   `test/rebalancer/unified-rebalancer.test-part-5-2.js`.
2. `src/rebalancer/unified-rebalancer-segment-5.js` now applies the existing
   priority operation-creation bypass snapshot to topology-settling,
   traffic-readiness, and local-serve readiness gates.
3. Topology-settling still defers when the blocker reason is
   `topology_operations_in_flight`.
4. Focused red/green proof:
   `npm test -- test/rebalancer/unified-rebalancer.test-part-5-2.js` failed
   before the runtime patch on the three new readiness-gate assertions, then
   passed after the patch.

## Migration Evidence

1. Representative rerun:
   `test-output/reports/rolling-restart-load-readiness-priority-operation-creation-reentry-20260504-codex.report.json`
2. Result: failed, `0/1` passed after `129.9s`.
3. All five nodes reached active state in node diagnostics.
4. Publication convergence was reported ready, priority recovery invariants
   passed, and the earlier coordination mismatch did not return.
5. New active blocker:
   selected snapshot coverage remained `3/5`, published active membership in
   the selected snapshot remained `3/5`, missing published active nodes were
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `8be8d30f-4499-5eed-865c-71b4d529a67a`, and priority recovery still had
   `eligible_but_no_operation_created` on `sql_transactions-p1` and
   `sql_write_operations-p1` while `sql_transaction_participants-p1` was in an
   operation-progress state.
6. Follow-up package:
   [Rolling Restart Startup Snapshot Coverage And Serial Priority Progress](./done-20260504-rolling-restart-startup-snapshot-coverage-serial-priority-progress.md).

## Residual Closure Inventory

- [x] Topology, traffic, and local-serve readiness planning gates have focused
      regression coverage for priority operation creation.
- [x] In-flight topology operation blockers still defer planning.
- [x] Representative rerun no longer sits at the original clean-publication
      `sql_write_operations-p1` readiness-gate-only boundary.
- [x] Remaining startup snapshot coverage and serialized priority-progress
      blocker is split into a fresh active package.

## Validation

1. `npm test -- test/rebalancer/unified-rebalancer.test-part-5-2.js`
2. `npm test -- test/rebalancer/unified-rebalancer.test.js`
3. `node --check src/rebalancer/unified-rebalancer-segment-5.js`
4. `node --check test/rebalancer/unified-rebalancer.test-part-5-2.js`
5. `git diff --check`
6. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`

## Execution Log

1. Focused regression failed before the runtime patch:
   topology-settling, traffic-readiness, and local-serve readiness all kept
   evaluation at `0` calls.
2. `npm test -- test/rebalancer/unified-rebalancer.test-part-5-2.js` passed
   after the patch.
3. `npm test -- test/rebalancer/unified-rebalancer.test.js` passed.
4. `node --check src/rebalancer/unified-rebalancer-segment-5.js` passed.
5. `node --check test/rebalancer/unified-rebalancer.test-part-5-2.js`
   passed.
6. `git diff --check` passed before package-ledger edits.
7. Representative `rolling-restart --fast-local` rerun failed by migration to
   startup snapshot coverage plus serialized priority progress.
