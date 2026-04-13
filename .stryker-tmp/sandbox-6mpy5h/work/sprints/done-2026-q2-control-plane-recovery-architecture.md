# Control-Plane Recovery Architecture Sprint

## Goal

Eliminate the remaining five-node restart and load-recovery deadlocks by
turning the current recovery loop and its remaining fallback surface into
explicit owner-owned paths with clear boundaries.

## Status

Closed on 2026-04-11. The fallback-inventory and owner-path cleanup batch
landed, and the remaining useful work was split forward into later runtime
convergence and runtime-completion sprints.

## Why This Sprint Exists

The previous simplification sprint improved local ownership and reduced
duplicate logic, but the partial harness verify still produced the same higher-
level failure family:

1. `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
2. `publication_convergence_blocked`
3. published active membership stuck narrow under five-node restart pressure
4. admin snapshot coverage collapsing when the same control-plane path is under
   load

The remaining problems are now clearly architectural rather than local.

The fallback inventory is now complete, so this sprint also owns the full
package set required to remove or convert every classified fallback concern in
this workstream.

## Sprint Umbrella

This file is the umbrella for the current recovery-architecture workstream.

1. Package files remain the execution owners.
2. This sprint file groups them, sequences them, and keeps the full set
   visible so the second half does not disappear behind "top items first"
   reasoning.

## Completed Packages

1. [Codebase fallback inventory and owner-path unification](../packages/done-20260410-codebase-fallback-inventory-and-owner-path-unification.md)
2. [Membership publication fetch and ack fallback collapse](../packages/done-20260410-membership-publication-fetch-and-ack-fallback-collapse.md)
3. [Observation/repair separation and authoritative read shaping](../packages/done-20260409-observation-repair-separation-and-authoritative-read-shaping.md)
4. [Local distributed harness timing budget reduction](../packages/done-20260409-local-distributed-harness-timing-budget-reduction.md)
5. [Priority recovery completion and topology-settling invariants](../packages/done-20260409-priority-recovery-completion-and-topology-settling.md)
6. [Recovery protocol and node participation state machine](../packages/done-20260409-recovery-protocol-and-node-participation-state-machine.md)
7. [Control-plane planning snapshot fallback collapse](../packages/done-20260410-control-plane-planning-snapshot-fallback-collapse.md)
8. [Node-state update decoupling and control-plane pressure relief](../packages/done-20260409-node-state-update-decoupling-and-control-plane-pressure-relief.md)
9. [Authoritative control-plane ingress and admin snapshot rationalization](../packages/done-20260410-authoritative-control-plane-ingress-and-admin-snapshot-rationalization.md)
10. [Control-plane mutation ingress bridge removal](../packages/done-20260410-control-plane-mutation-ingress-bridge-removal.md)
11. [Bootstrap runtime-surface bridge removal](../packages/done-20260410-bootstrap-runtime-surface-bridge-removal.md)
12. [Bootstrap topology snapshot owner cutover](../packages/done-20260410-bootstrap-topology-snapshot-owner-cutover.md)
13. [Bootstrap join ingress and peer-mesh fallback reduction](../packages/done-20260410-bootstrap-join-ingress-and-peer-mesh-fallback-reduction.md)
14. [Rebalancer read-model fallback policy collapse](../packages/done-20260410-rebalancer-read-model-fallback-policy-collapse.md)
15. [Rebalancer recovery-path guardrail cleanup](../packages/done-20260410-rebalancer-recovery-path-guardrail-cleanup.md)
16. [Critical partition classification owner cutover](../packages/done-20260410-critical-partition-classification-owner-cutover.md)
17. [Query provisioning cohort unification](../packages/done-20260410-query-provisioning-cohort-unification.md)
18. [Partition-service owner-dependency fallback removal](../packages/done-20260410-partition-service-owner-dependency-fallback-removal.md)
19. [CDC grouped-delivery safe fallback review](../packages/done-20260410-cdc-grouped-delivery-safe-fallback-review.md)
20. [Transport reconnect authority cleanup](../packages/done-20260410-transport-reconnect-authority-cleanup.md)

## Active Packages

None. Closed.

## Queued Packages

### Existing Recovery Packages

### Inventory-Driven Fallback Packages

None. All queued work was either completed here or split forward into later
runtime-focused sprints.

## Current Systemic Findings

1. Publication reconciliation prefers the expensive authoritative path exactly
   when priority spread is unresolved.
2. Some observation paths still trigger repair or reconcile work inline.
3. Publication, readiness, bootstrap, and priority recovery still answer
   overlapping questions about node participation.
4. In-flight priority recovery operations can remain `ACTIVE` while spread is
   still unsatisfied, with no single completion invariant owner.
5. `NODE_STATE_UPDATE` is still both a liveness signal and a durable metadata
   write path, so rejoin storms continue to amplify pressure.
6. The fallback inventory now shows the remaining work is not just
   control-plane-local; bootstrap, rebalancer, query, partition, CDC, and
   transport still carry bridges or caller-policy fallbacks tied to the same
   recovery architecture.

## Inventory Coverage

1. [Fallback register](../fallback-inventory/fallback-register.csv)
2. [Fallback coverage ledger](../fallback-inventory/file-coverage.csv)
3. [Fallback rollout mapping](../fallback-inventory/rollout-packages.md)

Every classified fallback ID in the inventory is now assigned to exactly one
package under this sprint umbrella.

## Rollout Order

1. Define one explicit recovery protocol and node participation model.
2. Finish the priority-recovery/topology-settling invariant work that consumes
   that shared protocol.
3. Separate observation from repair and narrow authoritative reads under load.
4. Collapse the highest-confidence control-plane and bootstrap fallback
   violations.
5. Collapse rebalancer, query, and partition fallback policy leaks.
6. Clean up the remaining transport, CDC, and compatibility bridges.

## Exit Check

Closed. The inventory-driven recovery cleanup landed, and the remaining
runtime instability was split into later sprints with narrower ownership.
