# Raft-rs operation-port boundary design

This design starts at `fe6e04c3d`, the independently verified phases-1-through-5
integration. The stopped `raft-rs-runtime-boundaries` branch is evidence and a
possible donor of isolated provenance code only. Its node/control objects,
`partitionControlOf`, object-graph crawler, gate-crossing counter, and helpers
that merely bury a RawNode are excluded.

## 1. Exact public operation contract

The partition owns a deeply frozen, null-prototype `RaftPort` containing frozen
bound functions and immutable scalar identity metadata only. Measured current
partition/provider call sites require:

| Operation | Meaning | Result |
| --- | --- | --- |
| `subscribe(event, listener)` | subscribe only to `leader`, `follower`, `candidate`, `leader-change`, `term-change`, `commit`, or `committed-prefix-divergence` | frozen unsubscribe closure; every payload is a deep-frozen copy |
| `step(envelope)` | deliver one already validated Raft envelope | frozen operation result |
| `propose(bytes)` | propose application bytes | frozen operation result |
| `proposeConfChange(change)` | propose a measured membership change | frozen operation result |
| `probePeerProgress(peerAddress)` | best-effort materialization/observation of follower replication progress without exposing log/message internals | frozen operation result |
| `tick()` | advance the Raft clock once | frozen operation result |
| `campaign()` | request election | frozen operation result |
| `readStatus()` | read role, term, leader, commit index, committed membership and backend-owned follower progress | deeply frozen snapshot by value |
| `configureTick(intervalMs)` | configure local scheduling interval | frozen host result |
| `startScheduling()` / `stopScheduling()` | own local timer lifetime | frozen host result |
| `close()` | idempotently close this port | frozen result |

This whitelist is generated from a partition-only AST call census and pinned in
the capability ledger. The final implementation may delete an operation shown
unnecessary by that census, but may not silently add one. `PartitionService` stores
only this port. Scheduling receives `tick`; future transport receives `step`.
The default liferaft implementation is adapted to the same port so partition
code cannot depend on node fields. Message-group construction remains liferaft
only; the raft-rs provider refuses that unsupported capability rather than
recreating `createNodeClass` or a node facade.

No port operation returns a node, provider, facade, handle, runtime owner,
group record, lifecycle record, database, store, mutable collection, callback
context or eligibility answer. Function objects, unsubscribe functions,
snapshots and result values are themselves frozen and have no attached
implementation properties. The provider is stateless after construction: it
may import the narrow port constructor, but retains no per-group WeakMap,
runtime, core, lifecycle object or control accessor.

Retirement semantics cover the whole whitelist. `tick`, `step`, `propose`,
`proposeConfChange`, `probePeerProgress`, `campaign`, `readStatus`, `configureTick` and
`startScheduling` refuse as `CORE_REFUSED/retired` before enqueue or entry.
`stopScheduling` and `close` remain idempotent passive cleanup and cancel any
timer without core entry; a retired close never frees its quarantined handle.
`subscribe` may register/unregister a frozen listener but can produce no later
active event. Every one of these calls leaves the core-entry sequence unchanged
after retirement, and a restarted retired port cannot arm a timer.

## 2. Private owners and impact contracts

| Owner boundary | Sole responsibility | Coupled-pair witness |
| --- | --- | --- |
| `RaftRsRuntimeOwner` | import/instantiate the binding, own runtime and handles, invoke RawNode, process Ready, count actual entry, reconstruct groups | runtime generation + durable reconstruction receipt |
| `RaftRsReplicaLifecycleOwner` | own `execute(identity, semanticCommand)`, create the explicit lifecycle row, decide eligibility, serialize retirement against operations, and write terminal retirement | retirement/core-entry race receipt |
| `RaftRsApplicationTransactionOwner` | compose application SQL, raft-rs applied progress and ConfState into one real SQLite transaction | rollback/commit receipt using the production database |
| partition/port adapter | translate partition calls and events without exposing implementation state | partition-only call census + public capability ledger |

Only the runtime-owner implementation loads the binding or holds a facade.
The loader is folded into that module, so there is no separately importable
facade factory. Existing facade-taking group and Ready helpers are folded into
the owner or converted to pure data transforms. The operation-port constructor
is the runtime owner's only production importer. It creates a private dispatcher
and calls it only from inside `lifecycleOwner.execute`; neither value crosses the
returned port. This gives one production call graph: `port closure ->
lifecycleOwner.execute -> runtime dispatcher -> binding wrapper`. Static checks
make a second importer or direct primitive invocation red. Only the lifecycle
owner contains lifecycle SQL. A separate lifecycle administration
module exports semantic commands such as `retireReplica(identity, reason)` and
is imported only by `src/node/replica-handler-remove-execution-methods.js`, the
existing owner that makes the durable REMOVE decision. It returns results, not
records. Identity creation/registration is construction-time private work, not
a data-plane port operation. Tests invoke the same separate administration
command through their fixture; production callers do not receive it through the
port. There is no generic provider control API.

Membership identity has a separate frozen operation-only administration port.
Its only state-changing command is
`reservePeerIdentity({groupId, localReplicaIdentity, joiningReplicaIdentity})`.
`src/partition/partition-service-raft-membership-administration.js` is its sole
coordinator importer and the membership workflow calls that owner before
proposing an add change. The command uses the existing append-only durable
logical-identity/decimal-peer-id registry: the same identity is idempotent and
a hash collision is rejected. Runtime address resolution reads that private
registry by value. Existing peer-identity restart tests prove deterministic
identity reuse. No registry object or lookup accessor crosses either port.

## 3. Durable lifecycle and linearization

Lifecycle storage has an explicit row keyed by the immutable tuple
`{groupId, peerId, replicaIdentity}` with state `active|retired`; retirement
also records reason and timestamp. Absence is never proof of active:

- constructing the lifecycle owner may create `active` only when no lifecycle
  row and no durable Raft state exist; that constructor is the sole active-row
  INSERT path;
- durable Raft state with a missing, unreadable or identity-mismatched lifecycle
  row refuses activation;
- `retired` is terminal and cannot be changed back to `active`;
- reconstruction and restart must match the complete tuple.

The sole lifecycle owner keeps the authoritative in-process state for its tuple
after validating or creating the durable row. Because no other production
writer exists, that cached state and the row cannot diverge. Every operation
increments a private active-operation count before invoking its closure and
decrements it on synchronous or asynchronous completion. Retirement first
marks the owner `retiring`, so no later operation can start, waits for the
active count to reach zero, writes `retired`, then publishes terminal state. It
therefore linearizes before an operation (zero core entries) or after its
complete unit. Queue-only inbound `step` admission executes the lifecycle check
but only enqueues copied input; the worker's next ordinary operation enters
`execute` again before draining that queue. A retirement between admission and
drain therefore refuses without a core entry. No eligibility token is
observable. This is an in-process semantic ownership rule, not a security
system.

## 4. Provenance and immutable outcomes

Every operation is staged as:

`host preparation -> lifecycle lease -> private core invocation -> host persistence/send/apply`

Only the invocation boundary constructs `CORE_OK`, `CORE_REFUSED` or
`CORE_FATAL`. Host work constructs `HOST_FAILURE`; generic exception type is
never inspected to guess origin. Results are deeply frozen values containing
at least `{outcome, reason, phase, retryable, recoveryRequired}` plus a copied
value/detail where needed:

| Outcome | Example reason/phase | Effect |
| --- | --- | --- |
| `CORE_OK` | `accepted` / `step` | runtime remains usable |
| `CORE_REFUSED` | `retired`, `closed`, `runtime-replacing`, binding-declared refusal | no inference of fatality; terminality comes from reason |
| `CORE_FATAL` | genuine Rust/WASM trap / named core phase | shared runtime becomes unhealthy; logical lifecycle remains active |
| `HOST_FAILURE` | input, storage, resolve, send, or apply / exact host phase | lifecycle and shared runtime unchanged; post-Ready failure marks only the group recovery-required |

Consumers branch on the immutable reason, not only the outcome. `retired` and
`closed` are terminal for that port; retirement has no release event and only a
new logical replica identity can become active. `runtime-replacing`, storage,
resolve, delivery and application reasons are transient under the caller's
existing budget. Binding refusal is call-local unless its tagged reason says
otherwise. Invalid input is a pre-Ready `HOST_FAILURE` with
`recoveryRequired:false`; post-Ready host phases set it true. Every diagnostic
copies the exact tuple, durable lifecycle state and phase actually examined.

If ordinary Rust `Result::Err` and a trap are not structurally distinguishable,
the binding makes the smallest change needed to throw a tagged binding-created
refusal. Panics/traps remain untagged fatal core failures. There is no general
error framework.

The actual-core counter increments in the single lowest-level wrapper
immediately around every binding/facade call, independent of method name. It
counts construction, restoration, Ready access, advance, status and free as
actual entries. Tests import test-only observation functions directly from the
private owner; those functions are never reachable through the provider or
port, and the production ownership audit forbids any second production
importer. The hook receives only deeply frozen
`{sequence, operation, groupId, runtimeGeneration}` observations and exposes no
facade or handle. Eligibility checks are not counted. The behavioral proof
drives an ordinary port operation and observes a positive count, retires and
restarts, drives every active operation and observes an unchanged count, then
uses a test-only direct-dispatch mutant and observes the counter increase and
the retired replica's disruptive term change.

## 5. Ready recovery, serialization and delivery

Each group has one private promise FIFO and health
`usable|recovery-required`; timers and direct calls enqueue through it. No
runtime lock is held across persistence, application or transport awaits.
Inbound `step` validates lifecycle and the envelope, copies and enqueues it,
and acknowledges local queue acceptance without entering the core. The next
worker operation re-enters the lifecycle owner and drains admitted input before
its own command. This prevents reciprocal local delivery from waiting behind
the sender's unadvanced Ready.

Runtime replacement is fenced by a monotonically increasing generation. A
trap marks the current runtime unhealthy. A host failure after Ready acquisition
marks that group recovery-required. Before every core call, including every
post-await continuation, the owner checks group health, runtime health and the
captured runtime generation. A mismatch returns a host failure without entering
the stale handle. The next ordinary operation replaces the WASM instance,
increments the generation, and reconstructs every active durable group before
performing the requested operation. Ready processing has ordered phases:

1. take Ready through the private invocation boundary;
2. durably persist required Raft state;
3. resolve destinations and await every supplied delivery hook; thrown
   resolution/send failures and returned `noHandler`, `deferRetry`,
   `acknowledged:false`, or `error` results are host failures;
4. run committed application work in the application transaction owner;
5. advance Ready through the private invocation boundary only after all required
   host phases succeeded.

There are no internal retry loops and no new timeout; the partition supplies
the existing delivery behavior. A host failure after Ready acquisition
synchronously marks that group `recovery-required`. The stale handle is
quarantined: no operation, including status, advance, close or free, may enter
it again. The next ordinary operation performs one synchronous reconstruction
attempt from durable state. To avoid freeing an unadvanced RawNode, recovery
replaces the whole WASM instance and reconstructs every durable active group at
runtime generation `n+1`. This is a healthy execution-container replacement,
not runtime poisoning; logical lifecycle remains active. Per-group FIFO
serialization prevents concurrent reconstruction for one group, and generation
checks stop an older operation that was awaiting host delivery from re-entering
the replacement runtime.

The cross-group witness holds A in outbound delivery while B traps. B replaces
the runtime; after A's delivery resolves, A observes the changed generation and
returns without advancing any reconstructed handle. The enqueue-only ingress
witness separately proves local admission can return without core entry.

Restart construction (`origin: restart`) and live recovery
(`origin: ready-host-failure`) are distinct inputs and test observations. Both
reuse group id, peer id and replica identity. A core fatal instead marks the
shared runtime unhealthy; runtime replacement reconstructs all active groups
from their own durable state and preserves every identity. Temporary storage,
transport or address unavailability does neither retirement nor runtime poison.

## 6. Atomic application invariant

Before `persist_ready`, snapshot, entry-suffix replacement and HardState are one
better-sqlite3 transaction. Table-level trigger faults at snapshot, log and
HardState writes prove the whole Ready persistence unit rolls back. Only after
that commit does the owner invoke the core's `persist_ready` for the same data.
Successful outbound messages sent before this durability point may duplicate
after recovery, which Raft tolerates; application commands are not treated as
equally duplicate-safe.

The current split call (`applyCommittedEntry` followed by
`recordAppliedAdvance`) is insufficient. The application transaction owner
uses the production better-sqlite3 connection and one transaction to perform:

1. the synchronous application callback's SQL effects;
2. the raft-rs durable applied index;
3. ConfState at the same applied index when applicable.

The owner rejects asynchronous callbacks because they cannot participate in a
better-sqlite3 transaction. A real application table plus an injected applied-
progress failure proves effects and Raft applied progress commit together or
both roll back. Reconstruction then replays the unapplied entry once. The
partition's existing callback remains the application-semantics owner; this
module owns only transaction composition.

## 7. Mechanical ownership and capability proofs

An AST/dependency audit scans all production `src/**`, including imports,
re-exports, aliases, computed members and dynamic imports. It proves:

- only the runtime owner contains the exact vendor package/artifact tokens,
  `createRequire`/binding load and primitive facade calls; unresolved dynamic
  loading is forbidden in every raft-rs production module;
- only the operation-port constructor imports the runtime owner in production;
- only the port and lifecycle administration modules import the lifecycle
  owner, and only the approved removal owner imports lifecycle administration;
- exactly one module contains lifecycle table write SQL, and only the approved
  lifecycle coordinator imports the retirement command;
- no production export exposes the durable store database handle;
- provider and partition expose no control accessor or retained live group.

The reusable audit is `scripts/checks/raft-rs-operation-boundary-audit.js`. It
parses every production JavaScript module, folds literal/template/concatenated
import and SQL strings, recognizes primitive aliases and computed calls, and
returns typed violations. Tests run that audit against temporary mutated trees
covering direct/aliased binding access, runtime-owner bypass, lifecycle and
membership command bypass, and assembled lifecycle SQL. Each mutant makes the
same production audit red.

A reproducible generator walks the constructed provider and partition port;
the before ledger is pinned from the named integration base and the after
ledger is generated in the test. The ledger is restricted to the partition's
reachable Raft boundary and records all eight requested categories: public
methods, public data properties, mutable public values, core-access paths,
lifecycle-state mutation paths, SQLite handles, provider/control accessors and
runtime object types. It recursively inspects own properties of objects and
functions, descriptors and prototypes without invoking getters. Separate
surface assertions inspect returned snapshots. The after ledger must contain
only frozen semantic closures and immutable snapshots, with no increase in any
category and a strict total capability reduction from the pinned base ledger.

## 8. Executable receipt plan and falsifiers

No receipt is certified by source keywords. The final tests drive:

- production-shaped one- and three-replica clusters whose core-entry observer is held
  by the fixture, never discovered through the port;
- durable retirement through the fixture's separate lifecycle command, close,
  database reopen and port reconstruction, followed by every operation in the
  exact whitelist and assertions of zero new entries, zero messages and stable
  term;
- real Ready cycles with persistence, address-resolution, send and application
  faults, followed by an ordinary operation and observed reconstruction;
- a two-group case where A's delivery is held while B traps, proving the old
  continuation cannot enter the replacement generation;
- production better-sqlite3 with a real application table and an applied-state
  trigger fault, proving the application effect and applied progress roll back
  together and reconstruction replays once;
- binding-declared refusal, genuine trap and host throws at each phase, with
  immutable outcome/reason/phase assertions rather than exception heuristics;
- the selected migrated phase-1-through-5 integration tests, run as a child
  Node test suite by `operation-port-regression.test.js`.

Ready durability tests fault snapshot, log and HardState tables. The retirement
test enumerates all twelve public operations: active operations
refuse, passive cleanup/subscription semantics hold, no timer fires, and no
call increments actual entry.

The owner-interaction registry gains exactly three pairs with same-witness tests:

1. `raft-rs-runtime-lifecycle-entry` (lifecycle lease and invocation wrapper);
2. `raft-rs-runtime-application-transaction` (Ready owner and typed partition
   callback/effects transaction composition);
3. `partition-raft-operation-port` (PartitionService and both provider adapters).

`PartitionService` remains the application-semantics owner while the
transaction owner owns only atomic composition. The three impact contracts and
paired witnesses ensure edits to either owner select the shared evidence.

## 9. Stopping rules

The evidence suite is non-vacuous: production modules and runtime hooks must
exist before a receipt can pass. It includes three explicit negative controls:

1. a synthetic import/invocation bypass increments actual core entry without a
   lifecycle lease and fails the ownership/counter checks;
2. a lifecycle-owner bypass after durable retirement restores the old message
   emission/term disturbance and fails the zero-entry retirement test;
3. a stale-Ready mutant permits the next ordinary operation to touch the old
   handle and reproduces the panic/runtime poisoning.

Persistence, address-resolution, awaited-send and application failures are
driven at real Ready phases. Each must report `HOST_FAILURE`, leave retirement
false and the shared runtime healthy, quarantine the stale generation,
reconstruct once from the production durable record, resume the same tuple and
allow the cluster to continue. Retirement is also driven through close,
restart, reconstruction and stale self-containing ConfState; every active
operation refuses before core entry, emits no messages and changes no term.

Verification stops immediately and rejects the design if any public/importable
production capability can invoke core or mutate lifecycle state outside the
approved operation ports, if any core invocation can bypass lifecycle
serialization, or if an ordinary operation can enter a stale RawNode after a
Ready host failure. No property-name repair round follows such a finding.
Transport remains blocked until an independent verifier approves all structural
questions and the landed Quest.
## Implementation discovery — peer progress (2026-09-22)

The implementation census found one pre-existing partition semantic that the
initial eleven-operation design had hidden behind LifeRaft internals:
learner-promotion liveness reads the leader's follower match index and, when
that observation is absent/behind, asks the Raft backend to materialize progress
once. Before this boundary, that request reached through `raft.log`,
`appendPacket` and `message` directly.

That is not retained as an implementation escape. The public contract gains the
single semantic operation `probePeerProgress(peerAddress)`. LifeRaft implements
it with the previous last-entry resend. raft-rs projects its native Progress
tracker through `readStatus().followerProgress`; the probe is therefore an
observation when progress is already present and otherwise advances one normal
Raft tick through the same lifecycle/core gate. The partition no longer sees a
log, message primitive, RawNode, peer object or backend-specific progress type.

This supersedes only the design note's count of eleven operations; the sealed
quest statement and its evidence receipts are unchanged. The exact frozen
surface test and terminal-retirement test now enumerate all twelve operations,
so the additional capability is measured rather than implicit.

