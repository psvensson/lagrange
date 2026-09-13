# Native OCI Call Cells

Target architecture for running data-local Call Cell functions in a customer's
ordinary language runtime and native library ecosystem while preserving the
existing Artifact / Binding / Cell execution model.

> **Status:** approved direction, not current capability. Managed OCI activation
> is still incomplete and `OciContainerDriver` does not currently implement
> runtime invocation. Current implementation status remains authoritative in
> [`docs/current-capabilities-and-limitations.md`](../docs/current-capabilities-and-limitations.md).

## Customer outcome

A developer should be able to author one service in the language and runtime
that they already use, keep libraries that do not compile cleanly to WebAssembly,
and still mark bounded functions for Lagrange to execute beside the partition
replicas that hold the relevant data.

Illustrative Python-shaped source:

```python
@lagrange.distributed(statement="SELECT id, features FROM observations")
def score(ctx, rows, options):
    import numpy
    import proprietary_native_library

    for key, partial in proprietary_native_library.score(rows, options):
        ctx.emit(key, partial)

@lagrange.handler("/score", calls=[score])
async def handle(ctx, request):
    return await ctx.call(score, {"model": "v3"})
```

The exact SDK spelling is language-specific and is not selected here. The
semantics are not: `score` is an authored operation descriptor that deployment
compiles into the existing Artifact and Binding contracts. The function object,
closure, interpreter heap, and native library state are never serialized as the
runtime call payload.

The installed OCI image carries the implementation and its dependencies once.
At invocation time Lagrange moves only the stable operation identity, explicit
arguments, bounded partition-local input, invocation context, and result data.

## Product position

Native OCI Call Cells are the middle step between two existing service shapes:

1. an unchanged OCI application talks to Lagrange through ordinary PostgreSQL
   and can be placed near the data it tends to access;
2. a Lagrange-aware OCI application exposes named Call Cell functions from the
   same image and Lagrange invokes those functions at selected partition
   replicas; and
3. a WASM component exposes the same distributed-operation semantics in a
   smaller, portable, capability-bounded runtime.

WASM remains the preferred fine-grained sandbox and the cheapest unit to
materialize widely. Native OCI Call Cells exist because language ecosystems,
C/C++ extensions, JVM/.NET libraries, Python packages, accelerator libraries,
and proprietary dependencies are often more valuable than WASM portability.
The two providers must share one execution model rather than becoming separate
products.

## Existing substrate to reuse

The current Call Cell path already owns nearly all distributed semantics needed
for this feature:

- `CallCellInvoker` is the sole orchestration owner. It resolves the durable
  call Binding, resolves shard hosts, bounds parallel shard dispatch, requests
  activation on a shard host when no ready Cell exists, coordinates emitted
  partials, and invokes the reducer.
- `RuntimeServiceHandler` revalidates the selected Cell and partition topology
  at the destination node. For a data-local run it executes the
  Binding-declared statement against that node's local partition replica and
  constructs the bounded batch before runtime invocation.
- `ServiceRuntimeLifecycle.invoke()` is already runtime-kind neutral. It
  resolves the registered driver and calls `driver.invoke(...)` under the
  existing durable invocation fence when an invocation identity is present.
- the WASM component driver implements the runtime-specific execution boundary.
- `OciContainerDriver` currently owns only scaffold lifecycle behavior and has
  no `invoke()` implementation.

The architecture therefore extends the last runtime-specific edge and adds an
authenticated native-process adapter into the already-existing call ingress. It
does not introduce a new planner, fanout engine, partition router, callback
scheduler, reduce coordinator, or durable callback registry.

## Non-negotiable owner invariant

A native callback is a Call Cell whose execution provider happens to be OCI.
The ordinary distributed-call owner route remains authoritative regardless of
where a call originates.

An externally issued call or an already-admitted nested call follows:

```text
CALL BINDING / existing call bridge
          |
          v
    CallCellInvoker                 sole fanout/orchestration owner
          |
          +-- resolve partition host
          +-- demand existing Cell activation on that host
          +-- coordinate emit/reduce
          |
          v
 RuntimeServiceHandler              destination admission + local batch owner
          |
          v
 ServiceRuntimeLifecycle.invoke     sole runtime invocation boundary
          |
          +-----------------------+
          |                       |
          v                       v
 wasm_component driver       oci_container driver
          |                       |
 canonical ABI              native invocation broker
          |                       |
 WASM component             managed OCI process
```

A call initiated by an ordinary handler in the managed OCI process first crosses
one additional adapter boundary:

```text
managed OCI handler
     |
     | ctx.call(operation-handle, arguments)
     v
language SDK
     |
     v
node-local Native Call Cell broker
     |
     | authenticate service/revision/replica
     | enforce generated outbound-call authority
     | translate operation handle -> durable Binding identity
     v
existing Call Cell call ingress
     |
     v
CallCellInvoker
```

The broker never resolves a partition, picks a replica, activates a Cell,
coordinates a reduce, or autonomously retries a distributed call. It only
projects a closed native-process protocol onto existing owners.

The OCI host agent remains a lifecycle provider. It may create the container,
mount or provision its invocation channel, inspect it, stop it, and remove it.
It must not become a Call Cell router or execute Lagrange scheduling policy.

## Artifact and Binding identity

The external service manifest remains the sole durable executable declaration.
Its existing export list already separates the export name from its interface
identifier. Native Call Cells use the same `call_v1` / successor interface
identity as the equivalent WASM operation; runtime kind chooses execution, not
call semantics.

The managed process must prove at startup that the expected exports are
registered, but that registration is runtime evidence rather than a second
source of truth. A worker advertising an unknown export, omitting a required
call export, or advertising an incompatible interface fails readiness.

The exact installed package, normalized manifest digest, runtime kind, service
revision, and export name identify executable code. Invocation never contains
source text, bytecode, a serialized language function, or an arbitrary module
path supplied by the caller.

For code-first SDKs, a local function reference is only an authoring handle. The
compiler/scaffold derives the same immutable Artifact, call Binding, and
outbound-call policy already used by the JavaScript component path. At runtime
the SDK maps the local operation handle to that generated immutable operation /
Binding identity. The caller cannot replace it with an arbitrary Binding name,
service ID, module path, or export string.

This preserves the rule that Binding is the only durable user declaration of
execution intent and that outbound call authority is compiled from reviewed
source declarations rather than chosen by a running process.

## Native process model

One OCI image revision may expose ordinary service endpoints and native Call
Cell exports from the same program. A placed Cell actual starts the exact
pinned image through the ordinary service lifecycle. The process then registers
its native call exports with the node-local invocation broker.

The selected topology is **application-initiated**:

```text
managed OCI process
       |
       | authenticated long-lived stream opened by the process
       v
node-local Native Call Cell broker
       |
       +-- process -> Lagrange: start authorized ctx.call / nested ctx call
       +-- Lagrange -> process: invoke exact admitted export
       +-- process -> Lagrange: emit / result / typed failure
```

The container does not need a public callback port. The host agent provisions
the connection material and process identity but does not receive invocation
payloads. The broker authenticates the exact cluster, node, service, revision,
and Cell replica identity established by the lifecycle owner.

The process-to-broker connection is bidirectional but the authority is
asymmetric. A process may request an outbound call only through its generated
outbound-call policy and may answer only invocations addressed to its exact
registered revision/replica/export. It cannot claim a different service
identity, choose a target partition, register new durable exports, or manufacture
an invocation context.

The wire technology is deliberately not selected by this architecture
contract. The first implementation quest must compare a small closed framed
protocol, gRPC, and WIT/wRPC-style projection against the required language
SDKs. Whatever is selected must preserve the semantics in this document and
remain replaceable behind the broker owner; transport is not an application
API.

A process may keep language runtime state and expensive initialized libraries
warm across invocations. Such process-local state is cache only: replacement,
movement, retry, or scale-to-zero may discard it at any time.

## Call initiation from the ordinary service handler

The same-program value depends on the outer application handler being able to
call a distributed function without dropping down to deployment identifiers.
The SDK therefore exposes an idiomatic operation handle created by the source
compiler/scaffold.

For the illustrative source above, `ctx.call(score, args)` means:

1. the SDK resolves `score` to the immutable operation identity generated when
   this exact service revision was packaged;
2. the SDK sends that identity and explicit arguments over the authenticated
   broker channel;
3. the broker derives the caller's service/revision/replica identity from the
   channel, not from payload fields;
4. the broker/bridge verifies that the generated outbound-call policy allows
   this operation and hands the request to the existing Call Cell ingress; and
5. `CallCellInvoker` takes over all partition resolution, activation, fanout,
   result coordination, and retry classification.

A direct external `CALL BINDING` for the same operation enters at step 5 through
the existing SQL surface. These are two ingress adapters to one execution owner,
not two distributed-call implementations.

Inside a native Call Cell invocation, `ctx.call(...)` repeats the same path with
the active invocation identity and nested-call budget attached. The broker must
not call another native process directly.

## Data locality and replica choice

The existing invocation owner continues to decide where each shard run occurs.
For a run targeted at partition `P`, the eligible hosts are derived from current
partition topology and the operation's existing consistency/role requirements.
The OCI provider cannot choose a different partition or node.

If the selected host has no ready Cell for the service revision,
`CallCellInvoker` uses the existing activation-lease path and waits within the
bounded activation window. Runtime-service placement remains owned by the
existing rebalancer. Image presence, warm process state, activation cost, load,
and movement hysteresis may become inputs to that existing placement policy;
they do not create an OCI scheduler.

The destination node revalidates both Cell identity and the partition fence
before reading data. The Binding-declared statement is executed against the
local partition replica and only then is the bounded batch handed across the
local process boundary to the OCI runtime. Raw shard rows therefore do not
cross the cluster network merely because the function uses a native runtime.

Reduce placement remains the existing reduce-lease decision. A native reducer
runs only after the normal complete-partial-set gate and has the same
exactly-once-visible final result contract as a WASM reducer; this is not a
claim of exactly-once native code execution.

## Native `ctx` semantics

The language SDK presents an idiomatic object corresponding to the canonical
Call Cell/service-call context. It is backed by the authenticated
process-to-node stream and inherits, rather than redefines, existing semantics:

- an ordinary handler may make only generated/authorized outbound calls and
  those calls enter the existing Call Cell owner;
- bounded `emit(key, partial)` during a shard invocation publishes through the
  current partial/reduce coordination owner;
- bounded nested `call` / `call-bounded` re-enters the existing Binding and
  Call Cell invocation owner rather than calling another worker directly;
- invocation identity, deadline, budgets, service identity, tenant/security
  context, and partition identity are supplied by Lagrange and cannot be
  selected by guest code; and
- failures use the existing typed Call Cell failure classifications at the
  application boundary.

The SDK may offer idiomatic language wrappers, but those wrappers are generated
or handwritten projections of one semantic contract. A Python, Java, Go,
JavaScript, or .NET SDK cannot invent stronger retry, consistency, routing, or
side-effect guarantees.

General table access is not added implicitly to the callback API. Partition
input continues to come from the Binding-declared statement and existing access
policy. Additional typed capabilities require their own canonical owner rather
than a convenient broker method.

## Same-program semantics

"Same program" means source-level composition and one revision identity, not a
distributed shared heap.

Allowed and expected:

- the endpoint handler and distributed function live in the same source tree;
- both use the same language packages and OCI filesystem;
- module/process initialization may load large read-only models or native
  libraries independently in every worker;
- explicit invocation arguments move with the call; and
- durable shared state lives behind Lagrange-owned table/state interfaces.

Not promised:

- transparent capture of arbitrary closures;
- migration of interpreter or VM heap objects;
- identity-preserving references to process-local mutable objects;
- one global singleton across worker processes; or
- execution on the same physical worker on a later invocation.

SDKs must fail early when their authoring model would imply unsupported closure
capture rather than silently snapshotting language-specific state.

## Retry, replay, and side effects

A native process can execute user code and fail before its completion becomes
observable. Lagrange therefore does not promise exactly-once native execution.

The existing durable invocation identity and result fence remain authoritative.
Operations performed through `ctx` can participate in Lagrange's bounded,
replay-aware semantics. The SDK exposes the stable invocation identity so code
that talks to external systems can provide its own idempotency key.

Arbitrary external effects such as sending mail, charging a card, or mutating an
uncoordinated remote service are at-least-once risks under retry. Documentation
and SDKs must say so directly. A retry after an ambiguous worker failure may
execute the function again on another eligible replica with the same installed
revision.

## Security boundary

WASM and OCI have deliberately different isolation strength. Native Call Cells
therefore require a stricter container profile than "arbitrary managed daemon"
by default:

- no Docker/CRI socket or host control API in the workload;
- no host namespace or privileged-mode escalation;
- bounded CPU and memory inherited from the runtime lifecycle contract;
- no public callback listener requirement;
- broker authentication bound to a lifecycle-issued replica identity;
- callback registration accepted only for the pinned revision and manifest
  exports;
- outbound call identity and authorization derived from the authenticated
  channel and generated policy rather than guest-selected strings;
- no caller-supplied service, revision, partition, or authorization identity;
- network egress governed independently from `ctx` capabilities; and
- secrets remain referenced through the service platform rather than copied
  into invocation payloads or diagnostics.

A native process is still arbitrary native code inside its container. The
product must not describe this boundary as equivalent to WASM capability
isolation.

## Owner map

| Concern | Authority | Rule |
| --- | --- | --- |
| Source-level operation descriptors | Language SDK/compiler | Produce runtime-neutral deployment records and operation handles; never become a runtime scheduler. |
| Durable executable exports | External service manifest / Artifact owner | Manifest export + interface is authority; worker registration is evidence only. |
| Durable execution intent | Binding owner | Same call Binding contract for WASM and OCI. |
| Native service-originated call ingress | Node-local broker + existing outbound-call policy bridge | Derive caller identity, map generated operation handle to Binding identity, then hand off to the existing call owner; no target resolution. |
| Partition fanout, host choice, activation demand, reduce | `CallCellInvoker` and existing collaborators | Provider-neutral; no OCI branch may re-own these decisions. |
| Destination admission and local batch build | `RuntimeServiceHandler` Call Cell path | Revalidate Cell + partition fence and read the local shard before runtime invocation. |
| Cell placement | Existing runtime-service rebalancer/activation lease owners | May consume OCI activation evidence; no native-worker scheduler. |
| Runtime invocation | `ServiceRuntimeLifecycle.invoke()` | Sole transition from provider-neutral Cell semantics to a runtime driver. |
| OCI execution adaptation | `OciContainerDriver.invoke()` | Translate one admitted invocation to the exact managed replica; no routing policy. |
| Process invocation transport | Node-local Native Call Cell broker | Authenticate stream, correlate call/invocation/result, project `ctx`; no placement, fanout, reduce, or autonomous retries. |
| Container lifecycle | OCI host agent/provider | Pull/create/start/inspect/stop/remove and provision broker connectivity only. |
| Retry/result visibility | Existing invocation journal/fence and reduce coordination owners | Native provider reports typed outcome; it does not invent autonomous retry loops. |

## Implementation ladder

The implementation should proceed only after real managed OCI activation is
available; a fake/in-memory container cannot prove this feature.

1. **N0 - native invocation contract.** Seal process registration, exact export
   matching, service-originated call ingress, invocation/result envelopes,
   `ctx` projection, authentication, generated outbound-call authorization,
   deadlines, bounded payloads, disconnect/ambiguous outcomes, and the selected
   bidirectional transport. Prove that no new route/placement owner is added.
2. **N1 - OCI driver invocation.** Add `OciContainerDriver.invoke()` backed by
   the node-local broker and the exact live replica handle. A direct driver test
   is necessary but not acceptance.
3. **N2 - code-first SDK projection.** One language SDK compiles a direct
   function/operation descriptor into the existing manifest + Binding model,
   lets an ordinary handler call that operation through the broker into the
   existing Call Cell owner, registers the export from the managed process, and
   performs `ctx.emit` plus a nested bounded call without function
   serialization.
4. **N3 - data-local multi-node proof.** A real service-originated or direct
   `CALL BINDING` call fans out to partitions on different nodes; each
   destination reads its local replica, executes the same pinned OCI revision,
   emits partials, and completes through the existing reducer. Reverting host
   restriction, partition-fence admission, outbound policy admission, or the
   ordinary Cell activation route must turn the proof red.
5. **N4 - native-library and recovery proof.** The fixture uses at least one
   genuine native dependency unavailable on the current WASM path, kills a
   named worker during an invocation, proves typed ambiguous/retry behavior and
   revision identity on replacement, and demonstrates that external side
   effects are not misreported as exactly-once.
6. **N5 - second-language conformance.** A second materially different runtime
   consumes the same broker/context semantics without a Lagrange execution-path
   fork. This is the proof that the protocol is language-neutral rather than a
   Node-specific convenience API.

Every source-changing rung requires a deterministic red-on-revert proof before
its live acceptance. Live proof from an ordinary OCI handler must traverse the
SDK/broker call ingress, the existing `CallCellInvoker`, the destination Call
Cell handler, `ServiceRuntimeLifecycle.invoke()`, and the production OCI driver.
A direct `CALL BINDING` proof may enter at `CallCellInvoker`; a harness that
invokes the broker's delivery side or driver directly cannot close the feature.

## Non-goals

The first release does not attempt to provide:

- arbitrary remote closure execution;
- general Ray-style object-store semantics;
- a second shared service-context database;
- arbitrary code upload outside installed immutable Artifacts;
- container-to-container direct invocation bypassing Lagrange;
- OCI-specific query planning;
- exactly-once external side effects; or
- parity between OCI and WASM isolation/startup cost.

Those exclusions preserve the valuable part of the model: customers keep their
language and libraries while Lagrange continues to own where distributed work
runs and what data/context that work is allowed to see.
