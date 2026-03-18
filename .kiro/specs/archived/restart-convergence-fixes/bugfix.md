# Bugfix Requirements Document

## Introduction

During rolling restart of a 5-node cluster, the cluster fails to converge within the 120-second timeout. Two related bugs prevent restarted nodes from reaching ACTIVE state:

1. A memory leak caused by unbounded CDC propagation background retries to unreachable nodes, which accumulate timer callbacks and message router connection entries without limit.
2. A join readiness deadlock where `evaluateCanonicalJoinTopologyReadiness` requires zero in-flight replica operations before declaring topology ready, but counts operations targeting the joining node itself — operations that cannot complete until the node finishes joining.

Together these bugs cause the distributed test `rolling-restart-5n-fix14` to fail with "Not all nodes reached ACTIVE state within 120000ms".

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a node is unreachable during rolling restart AND CDC propagation deliveries fail to that node THEN the system schedules unbounded recursive background retries via `scheduleBackgroundRetry` with no maximum attempt limit, causing each failed delivery to spawn a new timer that re-attempts delivery and spawns another timer on failure indefinitely

1.2 WHEN CDC background retries continuously target an unreachable node THEN the system accumulates `backgroundRetryTimers` entries and message router connection objects in `nodeConnections` without cleanup, producing sustained memory growth (observed: 28MB/min on node 7493b0ab, 9MB/min on node ebc4aa0b)

1.3 WHEN a node restarts and begins the join readiness evaluation THEN `evaluateCanonicalJoinTopologyReadiness` requires `inFlightReplicaOperations === 0` before declaring topology ready

1.4 WHEN the rebalance coordinator dispatches ADD operations targeting the restarting node THEN `collectCanonicalInFlightReplicaOperationDetails` counts ALL in-flight operations from the system table cache including operations where `targetNodeId` is the joining node itself

1.5 WHEN the joining node has self-targeted in-flight operations THEN the node cannot complete join readiness (blocked by non-zero in-flight operations) AND the operations cannot complete (blocked by the node not being joined) creating a circular dependency deadlock

### Expected Behavior (Correct)

2.1 WHEN CDC propagation background retries to an unreachable node exceed a maximum attempt threshold THEN the system SHALL stop scheduling further background retries for that delivery, log the exhaustion, and release the associated resources

2.2 WHEN CDC background retries are bounded THEN the system SHALL NOT accumulate unbounded timer callbacks or connection entries for unreachable nodes, keeping memory growth stable during rolling restart scenarios

2.3 WHEN `evaluateCanonicalJoinTopologyReadiness` evaluates in-flight replica operations for a joining node THEN the system SHALL exclude operations where the `targetNodeId` matches the joining node's own node ID from the in-flight count

2.4 WHEN the only remaining in-flight replica operations target the joining node itself THEN the system SHALL declare topology readiness as satisfied (ready=true for the in-flight operations dimension), allowing the join to proceed

2.5 WHEN the joining node completes its join after self-targeted operations are excluded THEN the self-targeted operations SHALL be able to proceed and complete normally through the rebalance coordinator

### Unchanged Behavior (Regression Prevention)

3.1 WHEN CDC propagation deliveries fail to a temporarily unreachable node that later becomes reachable THEN the system SHALL CONTINUE TO retry delivery within the bounded attempt limit and succeed when the node recovers

3.2 WHEN CDC propagation deliveries succeed on the first attempt THEN the system SHALL CONTINUE TO deliver without scheduling any background retries

3.3 WHEN `evaluateCanonicalJoinTopologyReadiness` encounters in-flight replica operations that do NOT target the joining node THEN the system SHALL CONTINUE TO require those operations to complete before declaring topology ready

3.4 WHEN a joining node has both self-targeted and non-self-targeted in-flight operations THEN the system SHALL CONTINUE TO block join readiness on the non-self-targeted operations

3.5 WHEN no in-flight replica operations exist at all THEN the system SHALL CONTINUE TO declare the in-flight operations dimension as ready

3.6 WHEN the message router reconnects to a node that becomes reachable again THEN the system SHALL CONTINUE TO establish the connection and resume message delivery normally

3.7 WHEN the CDC propagation service is stopped THEN the system SHALL CONTINUE TO clear all background retry timers via `clearBackgroundRetryTimers`
