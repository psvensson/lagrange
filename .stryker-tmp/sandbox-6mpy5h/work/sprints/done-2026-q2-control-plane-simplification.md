# Control-Plane Simplification Sprint

## Goal

Reduce repeated control-plane failures by collapsing duplicated decision paths
into explicit owner-owned models.

## Status

Closed after the local simplification batch and a partial distributed harness
verify pass.

## Completed Packages

1. [Priority recovery admission unification](../packages/done-20260409-priority-recovery-admission-unification.md)
2. [Active membership and recovery cohort unification](../packages/done-20260409-active-membership-and-recovery-cohort-unification.md)
3. [Operation progression owner-path unification](../packages/done-20260409-operation-progression-owner-path-unification.md)
4. [Transport late-response lifecycle unification](../packages/done-20260409-transport-late-response-lifecycle-unification.md)

## Outcome

1. A canonical priority-recovery admission plan now exists and is consumed by
   both rebalancer entry points.
2. Active-membership and recovery-cohort projection now flow through one shared
   snapshot owner.
3. Operation progression now re-enters through one owner-path model instead of
   several direct execution paths.
4. Late service responses now use one explicit disposition model instead of
   generic orphan-warning behavior.

## Partial Harness Result

1. `10` scenarios passed before the run was stopped.
2. `2` scenarios failed:
   `rolling-restart` on `local.json` and `seed-restart-under-load` on
   `local.json`.
3. `1` further scenario, `sustained-write-throughput`, was interrupted after it
   started showing the same live failure signature.

## Residual Systemic Problems

1. Publication, readiness, bootstrap, and priority recovery still form one
   coupled recovery loop under five-node restart pressure.
2. Observation still triggers repair/reconcile work on some read paths.
3. In-flight priority recovery operations can remain `ACTIVE` while published
   spread is still unresolved, with no single owner for the completion
   invariant.
4. `NODE_STATE_UPDATE` traffic and residual unmatched-response churn still add
   control-plane pressure during rejoin/restart storms.

## Follow-On Sprint

1. [Control-Plane Recovery Architecture Sprint](./done-2026-q2-control-plane-recovery-architecture.md)

## Exit Check

Closed. The simplification batch landed and the remaining failures have been
split into a new recovery-architecture sprint.
