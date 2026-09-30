---
id: critical-topology-readiness-under-source-change
roadmapRow: RM-0.2-five-node-convergence
status: active
graduatesTo: null
---

# Critical-topology readiness read under a pending source change

## Symptom (measured, 2026-09-05)

`npm run check:formation` (five local node processes, formation-only) FAILS
`node_ready_lease_incomplete` with the seed NOT starved: 13-15 event-loop gaps
and 3.2-5.3 s unexplained inside a 64 s formation window, yet the critical
system-topology settling blocker logs 138-410 waits with up to five nodes
unready and the seed itself unready in 131-403 of them; the priority spread
drains 12 -> 1 and never closes; schema admission times out. The same chain
on GCP (run 2026-09-05T19-10-11, head 103786ef3) adds 50 s of seed
starvation on top. Last full MovieLens pass on GCP: 2026-08-30.

## Owner hypothesis

`src/rebalancer/unified-rebalancer-critical-topology-methods.js`
`isCriticalNodeReady` reads
`controlPlaneReadinessService.getNodeReadinessSync(nodeId,
{allowStaleOnCacheChange: false})`. During cold formation the readiness
planning owner's classification barrier is saturated (an unclassified
source change is pending on ~99 % of reads; measured for Quest 2), and a read
that refuses a stale-on-cache-change answer is served the DEFERRED snapshot
(every dimension false) or null. `classifyCriticalNode` then returns
`UNREADY_ACTIVE` for every ACTIVE node, the seed included, so
`buildTransitionalNodeBlocker` reports `node_ready_lease_incomplete` and
critical rebalancing never plans. This is the read-shape the routed-read
bridge (`readiness-routing-cache-lag-bridge`) rescued for QUERY routing only
(participationKind ROUTED_READ); the critical-topology read is not routed.

Falsifier: a deterministic witness with the real readiness service under a
pending unclassified source change and an ACTIVE node row holding a current
ready lease. If the classification is READY there, the owner is elsewhere
(candidates: `isReadinessDimensionSatisfied` on the recovery-eligible
dimension, the startup-authority constraint, or the formation-cohort
spread-cure target exclusion).

## Bounded change

Serve the critical-topology read from the readiness owner's completed
record under the same sealed reuse class the bridge uses (node-table-only
token advance or nodes-only unclassified change, node row present, stored
liveness current, node row serve-admissible), through a typed participation
kind for the critical-topology reading rather than a blanket
`allowStaleOnCacheChange: true`. A node whose lease lapsed, or whose row is
STOPPED, DISCONNECTED or FAILED, must still read unready. No budget, timeout
or cadence changes.

## Witnesses

1. Deterministic: real `ControlPlaneReadinessService` + real
   `SystemTableCache` rig (as in `readiness-routing-heartbeat-window.test.js`),
   an unclassified services-table change pending, ACTIVE node rows with
   current ready leases -> `classifyCriticalNode` READY for every node and
   `buildTransitionalNodeBlocker` null; the same rig with one lease lapsed /
   one STOPPED row -> that node UNREADY_ACTIVE, blocker
   `node_ready_lease_incomplete` naming only it. Red on revert.
2. The registered pair `readiness-freshness-macrotask-bound` witnesses stay
   green if any readiness-owner path is touched (owner-interaction template).
3. Live: `npm run check:formation` PASS three consecutive times on the
   candidate with the formation verdict reporting the seed not starved.
