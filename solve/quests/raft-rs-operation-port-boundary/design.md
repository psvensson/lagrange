# Raft-rs operation-port boundary design

This design starts at `fe6e04c3d`, the independently verified phases-1–5
integration. The stopped `raft-rs-runtime-boundaries` tree is evidence and a
possible source of small isolated algorithms only. Its node/control objects,
`partitionControlOf`, object-graph crawler, gate-crossing counter, and helpers
that merely bury a RawNode are excluded.

## 1. Consumed surfaces

- `PartitionService` currently stores exactly what
  `createPartitionNode(request)` returns (`src/partition/partition-service-raft-init-base.js:425`).
  That is the boundary to replace with `createPartitionPort(request)`; the
  partition will hold operations, not a node.
- The current raft-rs provider exposes `partitionControlOf`, retirement,
  scheduling, core reads, and node shutdown (`src/raft/raft-rs-provider.js:112`,
  `src/raft/raft-rs-provider.js:129`, `src/raft/raft-rs-provider.js:160`,
  `src/raft/raft-rs-provider.js:180`). These control paths are deletion
  targets, not a starting API.
- The current node exposes the runtime host, durable store, group identity,
  peer identity, and runtime key as live fields
  (`src/raft/raft-rs-node.js:125`). This is the rejected graph.
- The partition's measured needs are event subscription, inbound delivery,
  proposal, election scheduling, shutdown, and immutable reads of role, term,
  leader, committed membership and commit index. Current call sites are
  mechanically enumerated by
  `test/raft/raft-rs-backend/production-raft-call-census.js:1`; the new port
  test will enumerate the smaller partition-only call set from production.
- `RaftRsRuntimeHost.run` is the current common dispatch point but accepts an
  arbitrary callback over `(core, handle)` and classifies thrown values
  (`src/raft/raft-rs-runtime-health.js:174`). It is replaced, not exported.
- `drainReady` currently executes send, persistence, application, and core
  calls in one callback (`src/raft/raft-rs-ready-loop.js:111`). A thrown host
  failure can therefore leave a taken Ready unadvanced. The new runtime owner
  owns the explicit staged cycle.
- The durable record already stores HardState, entries, applied progress,
  ConfState, snapshots and retirement in the replica SQLite database
  (`src/raft/raft-rs-durable-store.js:57`). Storage tables remain reusable;
  live store/database objects do not cross the port.
- The core loader is currently imported by both provider and partition-node
  modules (`src/raft/raft-rs-provider.js:17`,
  `src/raft/raft-rs-partition-node.js:30`). The static owner check reduces this
  to one private runtime-owner import.

Surfaces to create:

1. `raft-rs-operation-port.js`: the narrow constructor imported by the
   provider. It returns a frozen null-prototype record of bound semantic
   closures and immutable scalar identity metadata only.
2. `raft-rs-runtime-owner.js`: the sole binding importer and core invoker. Its
   runtime, handles, group records, lifecycle decisions and counters are
   module-private.
3. `raft-rs-replica-lifecycle-owner.js`: the sole writer and reader used for
   durable retirement decisions. Its administrative command surface contains
   operations, never a record or database.
4. A partition-side operation adapter for liferaft so `PartitionService`
   consumes one operation contract while liferaft remains behaviorally
   unchanged and default.

## 2. Typed failure edges

| Edge | Outcome | Recovery domain |
| --- | --- | --- |
| Durable retirement or closed port | `CORE_REFUSED` with semantic reason, before core entry | Logical lifecycle; terminal for that identity |
| Core returns a refusal | `CORE_REFUSED` | Call only; runtime stays healthy |
| WASM trap/fatal | `CORE_FATAL` | Shared runtime unhealthy; rebuild runtime/groups from durable state; identity unchanged |
| SQLite, send, address resolution, or application callback failure | `HOST_FAILURE` | Group becomes `recovery-required`; runtime and lifecycle unchanged |
| Group marked `recovery-required` at next operation | Reconstruct first, then either operation result or `HOST_FAILURE` if reconstruction cannot read coherent durable state | Group execution instance only |
| Runtime unavailable during replacement | `CORE_REFUSED`/typed runtime-unavailable reason | Temporary execution unavailability; not retirement |
| Missing/invalid public argument | `HOST_FAILURE` before core invocation | Caller/input boundary |
| Close repeated | immutable closed snapshot / idempotent completion | Port resource lifetime |

All edges fail closed. No eligibility result object crosses the port. The
core-entry counter increments immediately around every facade call, including
construction, restoration, status, Ready, advance and free; it is test
instrumentation read only through a test-owned observer supplied at private
owner construction, not a public port member.

## 3. Cached-view audit

The design introduces no public lifecycle cache. Retirement eligibility is
read by the lifecycle owner from the durable row at construction and before
each operation that can enter the core. If a private in-memory memo is used,
retirement commands synchronously invalidate it and tests mutate the durable
row through the authorized command only. A stale cached `active` answer may
never admit a core call after retirement.

The runtime owner keeps private execution records: identity, current handle,
health and `usable|recovery-required`. They are not durable authority. A host
failure changes only the execution record to `recovery-required`; the next
operation discards the stale handle and reconstructs from the durable Raft
record before any other call on that group.

Immutable `readStatus()` snapshots are copied and deeply frozen. A caller can
retain a stale snapshot, but it cannot mutate the decision inputs or be passed
back as authority.

## 4. Identity anchoring

Every private group record is anchored by logical replica identity, raft peer
id (exact decimal string), group id, and the replica's own durable SQLite
record. Reconstruction reuses all four. Address is resolved only for outbound
delivery and is never identity authority. A runtime trap or host failure may
replace a handle and runtime instance but may not change group id, logical
replica id, or peer id.

Ready-cycle recovery is anchored to the durable HardState/entries/snapshot,
ConfState and applied index already owned by the store. Application effects and
the applied-progress advance share the partition's real SQLite transaction;
if either fails, neither commits. A configuration change stores ConfState with
its applied index in the same statement. If a failure phase cannot reconstruct
safely from those anchors, the quest stops and records the exact phase.

## Structural acceptance order

The verifier first searches importable production capabilities for any route
to invoke the binding or mutate lifecycle decision state outside the approved
ports. It next proves every actual core call crosses the private lifecycle
owner. It then injects host failures after Ready acquisition and proves no
ordinary operation re-enters the stale RawNode. A failure of any question is a
rejection; property-name patching is not an allowed response.
