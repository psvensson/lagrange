# Pin: run1 coverage-fence call site

## Short verdict

The degraded readiness trace at `data/examples/service-data-affinity-demo/node-0.log:7110`, `:9788`, and `:11073` is produced by the **owner-membership driver call site**, not by the admin control-snapshot serve path fixed by CL-022. In current code this is the successor of the historical `stage-2.js:905` shape: `MembershipPublicationCoordinatorReconcile.driveOwnerMembershipReconcile` builds `handoffContract` with `nodeRows`, `readinessByNodeId`, `publicationConvergence: {publicationEpoch, publishedActiveNodeIds}`, and `ownerAckCompletionPendingNodeIds`, but it passes **no** `activeNodeViews` and no `snapshotCoverage` (`src/control-plane/membership-publication-coordinator-reconcile.js:614-619`).

That omission is exactly why the fence's snapshot-coverage evidence is empty: the fence only accepts `options.snapshotCoverage` or `options.activeNodeViews` as its snapshot-coverage source (`src/control-plane/publication-active-gate-handoff-contract-fence.js:151-160`), and then reads `nodeIds`, `coveredNodeIds`, `snapshotCoverageNodeIds`, or `effectiveActiveNodeIds` from that source (`src/control-plane/publication-active-gate-handoff-contract-fence.js:163-188`). `nodeRows` can help expected-node and presence evidence (`src/control-plane/publication-active-gate-handoff-contract-evidence.js:302-320`; `src/control-plane/publication-active-gate-handoff-contract-fence.js:269-277`), but it is not a snapshot-coverage source.

CL-022 fixed the admin served-snapshot rebuild, not this owner-driver call. The fixed admin serve path translates the serialized summary dialect (`effectiveNodeIds`, `publishedNodeIds`, `projectedNodeIds`, `authoritativeNodeIds`) back into resolver-shaped `*ActiveNodeIds` fields (`src/admin/admin-control-snapshot-local-build-base.js:799-831`) before calling `owner.resolvePublicationActiveGateHandoffContract` with `activeNodeViews` (`src/admin/admin-control-snapshot-local-build-base.js:856-867`). The owner-driver call in `membership-publication-coordinator-reconcile.js:614-619` never enters that translator.

## 1. Call-site trace

### Coordinator trace producer

The logged fields are copied from the `handoffContract` by `_buildPublicationReadinessTraceFields`: `contractState`, `contractReason`, `fenceState`, `fencePromotionAllowed`, `fenceMissingProofReasons`, and snapshot/durable/presence sub-evidence (`src/control-plane/membership-publication-coordinator-reconcile.js:481-523`). `driveOwnerMembershipReconcile` obtains a planning snapshot, extracts `publicationEpoch` and `publishedActiveNodeIds` (`src/control-plane/membership-publication-coordinator-reconcile.js:598-607`), resolves owner pending acks (`src/control-plane/membership-publication-coordinator-reconcile.js:608-613`), and builds the contract here:

- `nodeRows: planningSnapshot.nodeRows`
- `readinessByNodeId: planningSnapshot.readinessByNodeId`
- `publicationConvergence: {publicationEpoch, publishedActiveNodeIds}`
- `ownerAckCompletionPendingNodeIds`

There is no `activeNodeViews` and no `snapshotCoverage` in that call (`src/control-plane/membership-publication-coordinator-reconcile.js:614-619`). The trace is emitted on the no-deficit skip path (`src/control-plane/membership-publication-coordinator-reconcile.js:620-650`) or after a driven reconcile (`src/control-plane/membership-publication-coordinator-reconcile.js:679-694`).

### Fence mechanics

`buildPublicationActiveGateHandoffContract` always builds an `activeGateCatchupFence` by forwarding the call-site options plus `expectedNodeIds` (`src/control-plane/publication-active-gate-handoff-contract.js:203-259`). The fence computes durable-publication evidence, snapshot-coverage evidence, and presence evidence (`src/control-plane/publication-active-gate-handoff-contract-fence.js:383-399`), then denies promotion unless snapshot coverage and presence prove enough target coverage (`src/control-plane/publication-active-gate-handoff-contract-decision.js:153-190`). When the decision table itself would allow runtime promotion but the fence denies, the handoff contract is downgraded to `degraded` and aliases the reason to `published_active_coverage_incomplete` (`src/control-plane/publication-active-gate-handoff-contract.js:278-303`).

Because this call site supplies no snapshot-coverage source, `resolvePublicationActiveGateHandoffSnapshotCoverageSource` returns `null` (`src/control-plane/publication-active-gate-handoff-contract-fence.js:151-160`), the snapshot node list is empty (`src/control-plane/publication-active-gate-handoff-contract-fence.js:163-188`), and the evidence state becomes `unavailable` with missing target ids (`src/control-plane/publication-active-gate-handoff-contract-fence.js:227-266`). The missing proof reason is then `snapshot_coverage_unavailable` (`src/control-plane/publication-active-gate-handoff-contract-fence.js:322-380`).

### CL-022 coverage

CL-021 already recorded this owner-driver shape as no-`activeNodeViews`: the instrumentation note says the owner-driver call shape had no `snapshotCoverage`/`activeNodeViews`, while the admin-snapshot site can pass `activeNodeViews` (`solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-021.md:45-54`). CL-021 later classified the owner-driver sub-mode as structural/diagnostic-only and deferred cleanup (`solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-021.md:130-142`). CL-022 corrected the earlier admin-load-bearing path, explicitly noting that the admin serve rebuild dropped the `Active` infix and that fix `2a3b3c2b` translates summary keys back to resolver-shaped keys (`solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-022.md:151-171`). CL-022 also says the owner-driver and admin call-site shapes can produce the same unprovable fence, but the admin one was the load-bearing instance in that earlier mode=load harness failure (`solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-022.md:136-147`).

## 2. Consumer census / load-bearing verdict

### A. Demo settle loop

`waitForControlPlaneSettling` reads only `replica_operations` and `partitions`: it queries `operation_id, completed_at` from `replica_operations`, counts in-flight/completed rows, queries `partition_id` from `partitions`, and returns based on in-flight operations, stable partition count, and progress/stall timers (`examples/service-data-affinity/run-affinity-demo.js:215-278`). There is no active-gate field, no admin snapshot handoff, and no `runtimePromotionAllowed` in this loop.

**Verdict for the demo settle loop:** not load-bearing. If this owner-driver fence became provable, the settle loop's inputs and exit condition would not change.

### B. Coordinator / rebalancer / planner

The coordinator owner driver uses `missingPublishedCount` and `ownerAckCompletionPendingNodeIds` to decide whether to skip or drive; on no deficit it emits the degraded trace and returns false (`src/control-plane/membership-publication-coordinator-reconcile.js:620-650`). It does not branch on `contractState`, `contractReason`, `fenceState`, or `runtimePromotionAllowed` on that path. When there is an actual missing published node, the driver reconciles because of the missing count, not because of the fence (`src/control-plane/membership-publication-coordinator-reconcile.js:652-694`). The artifact shows that: node-3 drove a reconcile with `missingPublishedCount:1`, `contractState:"pending"`, `fenceState:"catchup_pending"`, and `snapshot_coverage_unavailable` still present (`data/examples/service-data-affinity-demo/node-3.log:650-651`).

The only production control-plane consumer that routes on this handoff is active-gate membership-publication reconcile. It resolves a target from `publicationActiveGateHandoff` (`src/control-plane/membership-publication-active-gate-reconcile.js:667-674`), but `resolvePublicationActiveGateMembershipPublicationTarget` returns an empty target when the selected handoff is merely `observe_owner_handoff` with `missingPublishedCount === 0` (`src/control-plane/publication-active-gate-handoff-contract.js:636-702`). `hasPublicationActiveGateOwnerReconcileSignal` only treats reconcile next-action, owner-recovery wait, or pending-reconcile debt as a signal (`src/control-plane/publication-active-gate-handoff-contract.js:704-743`). Thus the no-deficit degraded fence does not re-trigger publication reconcile.

The rebalancer/planner path does not consume active-gate handoff fields. Its operation-workflow publication fence is a separate operation-progress fence that is currently built as `CURRENT` unconditionally (`src/rebalancer/operation-workflow-owner-ports.js:448-460`), and lifecycle resolution treats stale/incomplete operation publication-fence states as `PUBLICATION_ACCEPTED`, not as an active-gate block (`src/rebalancer/operation-lifecycle-event-resolution.js:84-93`). Provisioning admission gates on local control-plane mutation readiness and storage admission (`src/rebalancer/provisioning-admission-policy.js:210-238`, `:376-405`, `:454-473`), not on `publicationActiveGateHandoff`.

The artifact confirms the degraded fence is not blocking rebalancer/planner execution: immediately after the no-deficit degraded trace at `node-0.log:11073`, storage admission allows all candidate nodes (`data/examples/service-data-affinity-demo/node-0.log:11074-11078`), the rebalancer plans with `preExecutionHandoffState:"ready_to_execute"` and `preExecuteReturnState:"continue"` (`data/examples/service-data-affinity-demo/node-0.log:11079-11081`), and the priority-recovery planning diagnostic reports `winningGate:"none"` and `operationCreationRequired:false` (`data/examples/service-data-affinity-demo/node-0.log:11083`).

**Verdict for coordinator/rebalancer/planner:** the owner-driver handoff is load-bearing only for real owner-reconcile debt (`missingPublishedCount > 0`, pending ack/recovery/reconcile). The observed no-deficit degraded fence is diagnostic-only for the demo's rebalancer/planner behavior.

### C. Table provisioning / CREATE TABLE admission / voter promotion

`createTable` writes table and partition metadata and then calls `provisionInitialPartition`; it returns a table-creation completion result from metadata visibility plus provisioning summary (`src/query/table-creation-service-create-table.js:135-213`). `provisionInitialPartition` invokes the configured partition provisioner with quorum/default minimum-routable semantics (`src/query/table-creation-service-partition-provisioning.js:30-85`, `:87-109`). The configured provisioner is `engine.provisionInitialTablePartition` when a rebalance coordinator exists (`src/query/sql-query-engine-instance-initializer.js:210-224`). That provisioning path waits for target-node/admission convergence, calls `rebalanceCoordinator.checkProvisioningAdmission`, creates ADD operations, then persists/executes or dispatches them and waits for routability (`src/query/sql-query-engine-initial-partition-provisioning.js:127-235`, `:260-330`, `:401-420`, `:543-670`). None of these cited paths reads `publicationActiveGateHandoff`, `activeGateCatchupFence`, or `runtimePromotionAllowed`.

Voter promotion similarly does not read the active-gate contract. Learner promotion gates on role, leader discovery, active voter count, learner count, target replica count, critical-partition priority-recovery overflow budget, and odd/even voter arithmetic (`src/partition/partition-service-learner-promotion-methods.js:445-564`). Replica activation's voter-ready gate is keyed to critical partitions and ADD/REMOVE-like replica operations, then waits until the local replica role is non-learner and routable (`src/node/replica-handler-voter-readiness-methods.js:27-89`, `:138-210`).

**Verdict for DDL/voter promotion:** not load-bearing. If this fence were provable, CREATE TABLE admission, initial partition provisioning, and learner/voter promotion would continue to be governed by metadata visibility, provisioning admission, storage admission, and voter-readiness rules, not by this contract.

### What would change if `covered=true` here?

For the owner-driver trace, the reported handoff would stop aliasing to `degraded/published_active_coverage_incomplete`; with the decision-table already complete and the fence provable, the trace would move toward `contractState:"complete"`, `contractReason:"owner_cohort_complete"`, `contractNextAction:"admit_active_gate"`, `fenceState:"promotion_allowed"`, and `fencePromotionAllowed:true` (per `src/control-plane/publication-active-gate-handoff-contract.js:278-303` and `src/control-plane/publication-active-gate-handoff-contract-decision.js:125-130`, `:184-189`).

In this demo run, that would change diagnostics/owner-outcome projection only. It would not change the settle loop, rebalancer planning, operation creation, CREATE TABLE provisioning, or voter promotion paths above. The artifact already shows those paths proceeding while the owner-driver fence is denied (`data/examples/service-data-affinity-demo/node-0.log:11073-11083`).

## 3. Artifact correlation

### Coordinator transitions

I parsed the five fresh node logs for `msg:"convergence decision trace"` records carrying `contractState`:

- `node-0.log`: 65/65 such records are `contractState:"degraded"` with `fenceState:"promotion_denied"`, `fenceSnapshotCoverageState:"unavailable"`, missing count 5, and `snapshot_coverage_unavailable`. Representative first/current/last records: `data/examples/service-data-affinity-demo/node-0.log:1664`, `:7110`, `:9788`, `:11073`, and `:11348`.
- `node-3.log`: 30 degraded records plus one `pending` record. The pending record is the real-reconcile case with `missingPublishedCount:1` and durable-publication incomplete (`data/examples/service-data-affinity-demo/node-3.log:650-651`); the no-deficit records still show snapshot coverage unavailable (`data/examples/service-data-affinity-demo/node-3.log:610`, `:666`).
- `node-1.log`, `node-2.log`, and `node-4.log` have convergence traces, but none with a `contractState` field in the parsed records.

I saw no coordinator trace in any node log transition to `complete`/`ready` or `fencePromotionAllowed:true`. The late seed trace remains degraded at `17:53:44Z` (`data/examples/service-data-affinity-demo/node-0.log:11348`).

### Admin path in this artifact

The artifact proves admin clients connected to the seed (`data/examples/service-data-affinity-demo/node-0.log:1159`, `:1193-1194`), but these node logs do not serialize full admin control snapshots or the served `publicationActiveGateHandoff`/`activeGateCatchupFence` payloads. I therefore do **not** claim artifact evidence that the seed's admin path reported coverage correctly in this run. The code shows the post-CL-022 admin path is a distinct instance that passes/translates `activeNodeViews` (`src/admin/admin-control-snapshot-node-view-projection.js:204-213`, `src/admin/admin-control-snapshot-local-build-base.js:474-491`, `:610-627`, `:799-831`, `:856-867`), while the coordinator trace instance does not (`src/control-plane/membership-publication-coordinator-reconcile.js:614-619`). In this run's logs, only the coordinator instance is directly observable.

## 4. Final mechanism and fix direction

**Mechanism:** `MembershipPublicationCoordinatorReconcile.driveOwnerMembershipReconcile` leaves snapshot-coverage evidence empty by building the handoff contract without `activeNodeViews` or `snapshotCoverage` (`src/control-plane/membership-publication-coordinator-reconcile.js:614-619`). The fence owner cannot infer snapshot coverage from `nodeRows`; it only reads `snapshotCoverage` or `activeNodeViews` (`src/control-plane/publication-active-gate-handoff-contract-fence.js:151-188`). The resulting empty coverage source produces `snapshotCoverage.state:"unavailable"`, `missingNodeCount:5`, `missingProofReasons:["snapshot_coverage_unavailable"]`, `promotionAllowed:false`, and the handoff alias `degraded/published_active_coverage_incomplete` (`src/control-plane/publication-active-gate-handoff-contract-fence.js:227-266`, `:322-435`; `src/control-plane/publication-active-gate-handoff-contract.js:278-303`).

**Load-bearing verdict for this demo:** diagnostic-only for the observed no-deficit degraded records. The only behavioral change from making this owner-driver fence provable would be cleaner diagnostics/owner-outcome projection. It would not unblock the demo settle loop or the DDL/rebalancer/voter-promotion paths; those paths do not consume this no-deficit fence decision and are observed proceeding while it is denied (`data/examples/service-data-affinity-demo/node-0.log:11073-11083`).

**Minimal owner-boundary fix direction:** do not weaken the fence and do not reinterpret empty coverage as success. If cleanup is desired, extend the owner-driver call site to pass a provable coverage source built by the appropriate owner/resolver: e.g. derive a resolver-shaped `activeNodeViews`/`snapshotCoverage` record from the same planning snapshot coverage it is about to use (`nodeRows`, readiness, endpoint rows, publication rows / latest published row, and a snapshot revision if available), then pass that into `buildPublicationActiveGateHandoffContract` at `src/control-plane/membership-publication-coordinator-reconcile.js:614-619`. The shape must include resolver keys such as `effectiveActiveNodeIds`/`publishedActiveNodeIds` or explicit `snapshotCoverage.nodeIds`/revision, mirroring CL-022's rule to pass a provable coverage source rather than relaxing the catchup fence (`solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-022.md:142-147`, `:169-171`).
