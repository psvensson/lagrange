# Bugfix Requirements Document

## Introduction

After rolling restarts of a 5-node cluster, the cluster fails to converge due to three interrelated bugs that survived the first round of fixes (`.kiro/specs/restart-convergence-fixes/`). The primary failure mode is a circular dependency between join readiness and rebalance operations: warming nodes cannot complete join readiness because non-self-targeted in-flight replica operations never reach zero, and those operations cannot complete because their targets are also warming nodes. Two secondary bugs amplify the failure: CDC propagation closures retain full event payloads causing seed node memory pressure, and concurrent replica_operations writes produce transaction conflicts that slow operation lifecycle progression.

Observed in `rolling-restart-5n-fix14`: 2 of 5 nodes stuck warming at CONTROL_READY with reason LEADER_METADATA_INCOMPLETE, 9 in-flight replica operations at timeout (5 in PENDING/SENDING), no message group leaders in final snapshot, seed node memory growing at 24MB/min.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the rebalance coordinator creates ADD/REPLACE operations targeting nodes that are in CONTROL_READY (warming) state THEN the system dispatches those operations via `messageRouter.deliver` to target nodes that cannot process replica operations because they have not completed join readiness, causing the operations to fail with timeout after the per-step timeout expires (30s)

1.2 WHEN a rebalance operation targeting a warming node is failed by `reconcileTimeoutOperation` THEN `queryExistingInFlightOperation` no longer finds a matching non-terminal operation for that entity/node pair, so the rebalancer immediately creates a replacement operation on the next rebalance cycle, which also targets the same warming node and also times out, keeping the in-flight operation count perpetually above zero

1.3 WHEN `evaluateCanonicalJoinTopologyReadiness` checks in-flight replica operations for a warming node THEN it counts all non-self-targeted in-flight operations from the system table cache (operations targeting OTHER warming nodes), and since those operations are continuously recreated after timeout (per 1.2), the in-flight count never reaches zero, blocking ALL warming nodes from completing join readiness

1.4 WHEN multiple warming nodes each block on the other's in-flight operations THEN a cluster-wide circular dependency forms: node A cannot join because operations targeting node B are in-flight, and node B cannot join because operations targeting node A are in-flight, and neither set of operations can complete because both targets are warming

1.5 WHEN CDC propagation events fail delivery during the rolling restart window THEN `scheduleBackgroundRetry` captures the full `options` object (including the `data` field containing the CDC event payload) in the setTimeout closure, and even with the bounded attempt cap, the accumulated closures from many concurrent CDC events before they exhaust their attempts cause significant memory pressure on the seed node (observed: 24MB/min growth, 50% heap increase over test duration)

1.6 WHEN the `checkTimeouts` loop and the `dispatchOperation` path execute concurrently for different operations that target the same `replica_operations` partition THEN the system produces "Transaction already active" errors because the SQL transaction layer does not support concurrent transactions on the same partition, slowing operation lifecycle progression and contributing to operations remaining in PENDING/SENDING state longer than necessary

### Expected Behavior (Correct)

2.1 WHEN the rebalance coordinator evaluates whether to dispatch an operation targeting a specific node THEN the system SHALL check whether the target node is in a ready state (repair-eligible) before attempting message delivery, and SHALL defer dispatch of operations targeting nodes that are not yet ready rather than sending messages that will fail

2.2 WHEN a rebalance operation is failed due to timeout and the target node is still in a warming/not-ready state THEN the system SHALL NOT immediately recreate a replacement operation for the same entity and target node; instead it SHALL apply a backoff or suppression period that prevents operation recreation while the target remains not-ready

2.3 WHEN `evaluateCanonicalJoinTopologyReadiness` checks in-flight replica operations THEN the system SHALL exclude operations whose target nodes are in a warming/not-ready state from the blocking in-flight count, since those operations cannot make progress until the targets complete joining and therefore should not block the evaluating node's own join readiness

2.4 WHEN all remaining in-flight replica operations target nodes that are warming/not-ready THEN the system SHALL declare the in-flight operations dimension as satisfied (ready=true), breaking the circular dependency and allowing warming nodes to complete join readiness independently

2.5 WHEN `scheduleBackgroundRetry` creates a closure for deferred CDC delivery retry THEN the system SHALL NOT capture the full CDC event payload (`data` field) in the closure; instead it SHALL extract only the minimal fields needed for retry scheduling (table name, operation type, target identifiers) and release the payload reference, limiting per-closure memory to metadata only

2.6 WHEN concurrent replica_operations mutations produce "Transaction already active" errors THEN the system SHALL serialize conflicting operations through the existing `operationWorkflowRunExclusive` single-flight mechanism scoped to the target partition, preventing concurrent SQL transactions on the same partition from conflicting

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the rebalance coordinator creates operations targeting nodes that ARE in a ready state (repair-eligible, fully joined) THEN the system SHALL CONTINUE TO dispatch those operations immediately without deferral or suppression

3.2 WHEN a rebalance operation fails due to timeout and the target node IS in a ready state THEN the system SHALL CONTINUE TO allow the rebalancer to create a replacement operation on the next rebalance cycle as it does today

3.3 WHEN `evaluateCanonicalJoinTopologyReadiness` encounters in-flight operations targeting nodes that are fully joined and ready THEN the system SHALL CONTINUE TO count those operations as blocking and require them to complete before declaring topology ready

3.4 WHEN no in-flight replica operations exist at all THEN the system SHALL CONTINUE TO declare the in-flight operations dimension as ready

3.5 WHEN self-targeted in-flight operations exist (targeting the evaluating node itself) THEN the system SHALL CONTINUE TO exclude them from the blocking count as implemented in the first fix round

3.6 WHEN CDC propagation deliveries succeed on the first attempt THEN the system SHALL CONTINUE TO deliver without scheduling any background retries and without any change to payload handling

3.7 WHEN CDC background retries eventually succeed within the bounded attempt limit THEN the system SHALL CONTINUE TO deliver the full event payload to the target, preserving CDC consistency

3.8 WHEN a single replica_operations mutation executes without concurrent conflicts THEN the system SHALL CONTINUE TO persist the mutation without additional serialization overhead

3.9 WHEN the `checkTimeouts` loop processes operations sequentially THEN the system SHALL CONTINUE TO use the existing per-operation single-flight key to prevent concurrent reconciliation of the same operation
