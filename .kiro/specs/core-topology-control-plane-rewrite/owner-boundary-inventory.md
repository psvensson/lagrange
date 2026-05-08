# Core Topology Owner Boundary Inventory

## Boundary Map

| Runtime path | Current owner evidence | Canonical boundary | Notes |
| --- | --- | --- | --- |
| Boot | `src/bootstrap/rejoin-hints.js` builds seed/join/fail startup decisions from hints, durable `nodes` rows, peer probes, and incarnation fence evidence. | Membership | Boot must emit membership admission or blocked startup state. Seed contact and durable row discovery are inputs, not admission. |
| Join | `src/control-plane/membership-lifecycle-controller.js` converts startup mode into `JOIN_ADMISSION` intent and lifecycle summary. | Membership | Join must end at a membership outcome consumed by publication and readiness, not direct readiness promotion. |
| Rejoin | `src/bootstrap/rejoin-hints.js` selects durable rejoin peers and `src/control-plane/membership-lifecycle-controller.js` maps durable rejoin to `RESTART_REENTRY`. | Membership | Durable hints, durable `nodes` rows, and peer reachability are evidence for the membership owner only. |
| Partitioning | `src/rebalancer/move-planner.js` owns replica target state and target nodes for partitions, message groups, and runtime services. | Placement | Placement emits intent and policy reasons. It must not complete operation progress or readiness. |
| Rebalancing | `src/rebalancer/unified-rebalancer.js`, `src/rebalancer/rebalance-coordinator.js`, and `src/rebalancer/operation-workflow-owner.js` split orchestration, coordinator rows, and workflow re-entry. | Placement and operation | `UnifiedRebalancer` may request coordinator work. `OperationWorkflowOwner` owns retry/resume/timeout grammar. |
| Publication | `src/control-plane/membership-publication-coordinator.js`, `src/control-plane/control-plane-publication-merge.js`, and `src/control-plane/publication-recovery-gate.js` own publication rows, ACK status, and recovery gate state. | Publication | Publication must produce one canonical membership projection stream with freshness/ACK state. |
| Projection | `src/control-plane/active-node-projection.js` combines published membership, readiness dimensions, runtime authority, transport, services, and liveness fallback into active-node views. | Projection/readiness | This is the largest duplicated decision surface; it must become a consumer of canonical owner outcomes. |
| Readiness | `src/control-plane/control-plane-readiness-service.js`, readiness segment 4, `startup-authority-snapshot-owner.js`, and `storage-admission-service.js` emit planning, startup authority, recovery, and provisioning eligibility. | Projection/readiness | Readiness should expose named internal, repair, and serve states and stop being recomputed by rebalancer/harness callers. |
| Diagnostics and harness | `test/distributed/harness/*` reads bootstrap readiness, active gates, publication convergence, workflow admissions, and readiness transitions. | Bounded observation consumer | Harness may format owner outcomes; it must not derive alternate admission, placement, publication, or readiness truth. |

## Duplicated Decision Paths

1. Boot/rejoin currently derives startup mode from both rejoin hints and durable `nodes` rows, then probes peer reachability before selecting join or seed behavior. The canonical membership owner should consume that evidence once and emit admission, re-entry, or blocked startup state.
2. `active-node-projection.js` reads publication rows, readiness dimensions, runtime authority, transport, endpoint/service rows, heartbeat/ready lease liveness, and liveness fallback flags in one decision surface. That mixes publication and projection/readiness.
3. Priority recovery planning is consumed by rebalancer paths through planning snapshots and active-node cohorts. `UnifiedRebalancerSegment3` also has sync/async variants for non-blocking priority operation decisions, which are transitional until operation/readiness contracts are canonical.
4. Operation retry and safety re-entry are mostly centralized in `OperationWorkflowOwner`, but deferred visibility fallbacks still need to be named as operation-owner outcomes instead of caller-local cache-lag interpretation.
5. Harness failure bundles and active gates observe startup readiness, publication convergence, workflow admission, and readiness transitions. They are diagnostics-only and must not become a second classifier for owner truth.

## Forbidden Reinterpretations

1. Seed contact, peer probe success, or recovered peer address must not equal membership admission.
2. Durable `nodes` row visibility must not equal active membership or lifecycle handoff completion.
3. Published active node IDs, readiness dimensions, transport connectivity, service rows, heartbeat freshness, and ready lease freshness must not be recombined outside the projection/readiness contract.
4. Placement policy must not be rewritten by rebalancer pressure, survivor sets, or priority recovery fallback branches.
5. Cache visibility must not complete operation workflow progress, publication convergence, or executor acknowledgement.
6. Publication ACK count, required ACK node lists, and recovery gate state must not be inferred from diagnostics-only evidence.
7. Harness/reporting code may normalize and display owner evidence only; it must not classify readiness, admission, placement, or publication from raw logs or probes.

## Successor Sequence

1. Boot Join Rejoin Kernel: define membership owner outcomes for boot, join, rejoin, drain, removal, and blocked startup; cut startup/rejoin hints and membership lifecycle intents to that contract.
2. Partitioning Rebalancing Kernel: define placement intent and operation lifecycle contracts; move rebalancer priority-spread, coordinator, retry, and timeout decisions behind those owner outputs.
3. Publication Projection Boundary: make publication owner rows and ACK/freshness state the only publication stream consumed by projection/readiness.
4. Projection Readiness Contract: define internal, repair, and serve readiness states; cut readiness, diagnostics, admin, harness, and runtime readers over to the canonical projection snapshot.
5. Legacy Path Deletion And Proof: remove transitional fallbacks, add structural guards, and run the representative Phase 0.1 proof ladder.
