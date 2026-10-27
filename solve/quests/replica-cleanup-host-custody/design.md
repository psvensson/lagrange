# Host custody across failed release — bounded continuation

Input: published cleanup source 3ea4dd5053c5 plus the current per-instance
reconciliation in startup-refusal-cleanup-custody. This is a distinct host/object
lifetime boundary, not a second per-instance cleanup engine or competing branch.

## Consumed surfaces and transition

ReplicaHandler's fenceFailedReplicaCreateRuntime (runtime-methods:78-110) catches
shutdown failure and drops both routable references. Its shutdown (:636-689)
also swallows release failures and clears all references. CREATE's catch paths
(create-methods:472-541) can discard unpublished or boot-refused services. The
existing failed-create restart invokes that fence (create-status-methods:375).

WasmServiceLifecycle uses activeReplicas (lifecycle:180,435-460). It deliberately
permits one new instance while the old one is STOPPING. A later error leaves the
old instance CLEANUP_REQUIRED but absent from the active map. stopReplica and
shutdownAll must retain/consume that old instance independently of the successor.
The per-instance owner still decides handler/port/KV/DB order and terminal state.

## Facts and ownership

Host-held unfinished shutdown is an exact-object resource obligation. It is
NOT active service membership, successful native retirement or durable cleanup
authority. Each host stores that obligation before invoking shutdown and removes
it only after successful shutdown. Its existing shutdown/fence method is the
only retry driver; no timer, durable table, generic coordinator or independent
release algorithm is added. The active slot may change without erasing custody.

ReplicaHandler owns pendingRuntimeShutdowns keyed by exact service object, with
replicaId/partitionId for matching a later failed-create retry. Failed fencing
throws the original primary plus actual secondary error using the existing pure
composition helper. A CREATE retry first asks the same fence to settle retained matching cleanup.
Failure is a typed CLEANUP_IN_PROGRESS with the exact primary/secondary cause;
only successful release allows the unchanged identity/status admission to run.
Different-partition debt refuses without being retargeted. The current FAILED-retry fence can resolve retained debt even if routing
no longer tracks the service. Node shutdown attempts all owned service releases,
reports failure, retains debt and remains retryable; it cannot clear authority
and claim completion while any service release failed.

WASM's retiringReplicas is exact-object custody inside its existing lifecycle
owner. A stop snapshots its target(s); it never retargets a newly installed
successor after await. Retry through stopReplica/shutdownAll includes old debt.
Create permits the existing one STOPPING predecessor plus one successor, but
refuses another replacement while an earlier different predecessor remains or
when any predecessor has failed cleanup. This bounds failed-instance accumulation
per service without changing normal successful replacement or exact transport
retirement. An old retry never releases a current successor's serviceId port.

## Failure edges and limits

Shutdown failure: typed error / visible secondary; object retained; retry via
same fence, stopReplica, or whole-host shutdown. Never infer release from a caught
error. Concurrent per-instance close is already serialized by the preceding
reconciliation. Successful predecessor: release exact debt and compare active
identity before deletion. FAILED retirement does not authorize file deletion.
A pending factory that has not returned its service remains its factory's owned
obligation; these tests do not prove arbitrary factory internals or all durable
CREATE transitions. External whole-host callers must retain rejected hosts.

Tests exercise actual services and SQLite closes through actual host methods,
plus named controlled registry succession. They do not simulate a full remote
CREATE state transition, multi-host formation, or all shutdown callbacks.
Independent review must inspect caller propagation, bounded admission, failure
before registry publication, exact successor protection, all-settlement behavior
and the reachable retained-debt retry. Both Quest receipts remain held until
those and the global gates are satisfied.
