# Service Portability Ladder Design

## Deployment ladder

The program's shape follows the three-rung deployment goal (requirements
"Program result"):

1. rung 1 - an unchanged pg-talking OCI container becomes a managed,
   data-affinity-placed service (phases 0-2);
2. rung 2 - the same language/runtime and OCI image expose native Call Cell
   functions that Lagrange executes at selected partition replicas (phase 5);
3. rung 3 - the same distributed-operation model is packaged as genuine WASM
   components through the same install surface (phase 3).

The Phase 2 live-managed-OCI prerequisite and Phase 5 native Call Cell work are
both assigned to roadmap **0.6**. Phase 2 advances
`RM-0.6-managed-oci-activation`; Phase 5 advances
`RM-0.6-native-oci-call-cells`. This keeps the delivery dependency visible
without collapsing lifecycle ownership and distributed-call ownership into one
implementation concern.

Each rung trades implementation constraints for execution properties. Rung 1
moves a long-running service near the data. Rung 2 moves a selected function to
the partition host while retaining the customer's ordinary runtime and native
libraries. Rung 3 keeps that data-local shape but gains WASM portability,
density, and capability isolation.

## Rung 2 selected model: native OCI Call Cells

The canonical architecture is
[`architecture/native-oci-call-cells.md`](../../../architecture/native-oci-call-cells.md).
The old embedded/uploaded JavaScript callback unification and shared-service-
context direction is superseded; it must not be revived as the implementation
path.

Rung 2 reuses the current code-first Call Cell model. A language SDK may expose
an idiomatic local function/operation handle, but deployment compiles it into the
same immutable Artifact, call Binding, and outbound-call policy that the public
WASM path uses. Runtime calls identify that installed operation; they never
serialize source, bytecode, closures, module heaps, or native library state.

The installed OCI image already contains the developer's language runtime,
native extensions, models, and libraries. When `CallCellInvoker` selects a
partition host, the existing activation-lease path makes a Cell of that exact
service revision ready on the host if needed. The destination Call Cell handler
revalidates the partition fence and builds the bounded batch from its local
partition replica. Only after that provider-neutral admission does
`ServiceRuntimeLifecycle.invoke()` dispatch to `OciContainerDriver.invoke()`.

The OCI driver talks to a node-local Native Call Cell broker. The managed
process opens an authenticated long-lived stream to that broker and registers
the manifest-declared call exports it can serve. Registration is readiness
evidence, not a second export authority. The OCI host agent remains lifecycle-
only and never becomes a callback router.

That same authenticated process stream also provides the adapter for an
ordinary handler in the managed program to initiate `ctx.call(operationHandle,
args)`. The SDK sends only the generated operation identity and explicit
arguments. The broker derives the caller's service/revision identity from the
channel, checks the generated outbound-call policy, and hands an admitted call
to the existing Call Cell ingress. It does not resolve a partition or select a
worker. The existing `CallCellInvoker` owns those decisions and, after remote
admission, the selected OCI worker receives the invocation through the other
direction of the same broker.

Native `ctx` is a language projection of the existing Call Cell semantics:
bounded emit, bounded nested call, deadlines, budgets, server-derived identity,
invocation identity, and typed failures. Process-local state may stay warm as a
cache but is never durable or location-stable. Arbitrary external side effects
remain retry/idempotency concerns; exactly-once-visible Lagrange results do not
mean exactly-once native code execution.

## Ownership map

The program extends existing owners rather than introducing feature-local
alternatives.

| Concern | Canonical owner | Program rule |
| --- | --- | --- |
| PostgreSQL authentication | PG wire descriptor/session authentication owner | Authentication precedes external exposure. |
| PostgreSQL transport security | PG wire TLS ingress policy | TLS follows the authentication cutover. |
| Lifecycle mutation | Selected authenticated service-control transport | CLI is a client, never a second mutation owner. |
| Desired installation | Cluster service catalog | Stores package/revision/install/rollout/failure intent only. |
| Running instances | Existing service lifecycle and `services` truth | Catalog references; it does not copy replica truth. |
| Endpoints | Existing `service_endpoints` owner | Runtime drivers publish through the canonical writer. |
| Artifact resolution | Shared OCI artifact owner | Both runtime kinds use one digest-verifying path. |
| OCI lifecycle execution | `OciContainerDriver` plus one selected host provider | Production composition root binds the provider; host agent owns engine translation only. |
| Service-originated native call ingress | Node-local Native Call Cell broker as adapter to generated outbound-call policy + existing Call Cell ingress | Derive caller identity from the process channel and admit/refuse the generated operation; never choose partition, node, replica, fanout, or retry policy. |
| Call Cell fanout/placement demand/reduce | Existing `CallCellInvoker` and collaborators | Provider-neutral; OCI cannot add a scheduler or route owner. |
| Destination shard admission | Existing runtime-service Call Cell handler | Revalidate route and partition fence, then build the bounded batch from the local replica. |
| Runtime invocation | `ServiceRuntimeLifecycle.invoke()` | Sole provider transition for both WASM and OCI Call Cells. |
| Native process invocation transport | Node-local Native Call Cell broker | Authenticate exact replica/revision, correlate admitted calls/results and project `ctx`; no placement, fanout, reduce, or autonomous retries. |
| WASM execution | Component runtime driver plus pinned engine | Public installed-service invocation only. |
| SQL request identity | Authenticated PG session and canonical `SqlRequest` | Client input cannot set `issuingServiceId`. |
| Access attribution | Existing `service_partition_access` owner | Evidence is fresh and request-caused. |
| Placement | Existing placement/rebalancer decision owner | Affinity and activation evidence are composed inputs. |

## Dependency graph

```text
truth contract
  -> reusable onboarding slices
  -> PG authentication -> PG TLS -> external application comparator

control transport
  -> external manifest -> shared artifact owner
  -> desired catalog -> installation reconciler -> CLI

one OCI provider
  -> live activation -> health/endpoints/logs/recovery
  -> credential lifecycle -> authenticated SQL attribution
  -> activation evidence + composed placement objective + live engagement
  -> native invocation contract
       -> OCI driver invoke + broker
       -> first code-first native SDK
       -> data-local multi-node fanout/reduce
       -> native-library + recovery proof
       -> second-language conformance

component ABI/engine/invocation decision
  -> genuine component execution -> OCI artifact activation -> template

all base paths
  -> versioned fixture -> isolated runner/report -> live acceptance
```

The external Compose psql/application terminal follows authentication and TLS.
The existing `lagrange-devops-onboarding` Quest may contribute valid image,
cluster, and service-visibility slices, but its terminal state is not assumed to
mean success. If its sealed external-connectivity premise is invalid, the Quest
must record that evidence and end honestly before bounded successors consume the
valid work.

## Control transport

Phase 1 selects first-class lifecycle SQL over authenticated PG wire. The CLI is
a stateless client of that surface. PG wire owns TLS and credential ingress; SQL
classifies lifecycle statements and enforces lifecycle-specific authorization;
the cluster service catalog and reconciler remain the mutation and convergence
owners. The complete boundary and rejected alternative are recorded in
[`architecture/service-control-transport.md`](../../../architecture/service-control-transport.md).

The node-local admin WebSocket remains a loopback compatibility/diagnostics
adapter. It is not the production CLI transport and is never a fallback when the
lifecycle SQL surface is unavailable. A downstream bounded Quest implements the
SQL grammar, server-derived security-context propagation, action authorization,
and typed owner outcome after the desired catalog owner exists.

## OCI provider milestone

The first provider target is Docker Compose using a bounded host runtime agent.
Lagrange node containers do not receive an unrestricted Docker socket. The
agent exposes only the runtime operations and identity labels required by the
driver, authenticates callers, and owns engine-specific translation.

The selected contract is recorded in
[`oci-runtime-host-contract.md`](oci-runtime-host-contract.md).
It uses a private authenticated Unix-domain control socket, agent-derived
resource labels, a closed operation/result grammar, and one production
construction route through seed and join startup into `createRuntimeStartupWiring`.
The decision is `selected_not_implemented`; C1 owns the provider/agent/Compose
implementation, receipt/fence restart safety, and live binding proof, while C2
owns probes, logs, endpoints, kill/replacement, and managed-instance/node
restart recovery.

Fresh agent receipt state is enrolled through a TPM-monotonic host record, and
replacement enrollment requires durable prior-incarnation retirement plus a
distinct empty Engine data root. A mutation unresolved across agent restart
quarantines that incarnation; runtime evidence cannot clear it.

The first live activation accepts only an immutable remote OCI digest derived
from the artifact owner. A local OCI layout must be published to an accessible
registry before activation; neither the provider nor agent trusts a CLI or
node-local filesystem path.

The first live milestone explicitly does not claim Kubernetes support. A future
Kubernetes provider requires an independent Quest covering controller/CRI
authority, network publication, privilege, recovery, and live composition-root
engagement.

## Native Call Cell provider boundary

Native Call Cells consume the live OCI provider but do not extend the host
agent's operation grammar with `invoke`. Invocation is a data-plane concern and
uses a separate node-local broker whose Lagrange-side provider consumer is the
OCI runtime driver and whose service-originated side is only an adapter into the
existing Call Cell ingress.

The topology is application-initiated: the managed process opens and maintains
an authenticated stream to the broker. The container therefore needs no public
callback listener. The lifecycle owner issues or provisions the connection
identity, and the broker accepts registrations only for the exact local Cell
replica and pinned service revision.

The wire technology is decided in Phase 5 K0 after measuring the SDK languages
that matter. gRPC, a small framed protocol, or a WIT/wRPC projection are
acceptable candidates; transport choice cannot change the owner map or guest
semantics.

A native worker reports the set of call exports it registered. The broker
compares that evidence with the installed manifest. Missing, additional, or
interface-incompatible exports keep the Cell unready. The worker never names a
partition or chooses where it should execute.

On invocation the destination node has already built the batch from its local
partition replica. The driver sends only the admitted export identity, explicit
arguments, bounded batch/partials, deadline/budgets, invocation identity and
context. Nested calls return to Lagrange and re-enter the ordinary Binding/Call
Cell owner; workers never call one another directly.

For a normal handler-originated call, the direction is reversed only as a
transport matter: the broker authenticates the process, resolves its generated
outbound-call authority, and forwards the operation identity and explicit
arguments to the normal Call Cell ingress. From there the ordinary owner route
is identical to direct `CALL BINDING`. The broker never turns its local worker
registry into a partition or service route table.

## Identity flow

For ordinary OCI SQL access:

```text
installation revision
  -> replica credential issuance
  -> authenticated PG session principal
  -> server-derived issuingServiceId
  -> canonical SqlRequest
  -> service_partition_access owner
  -> placement evidence input
```

For native Call Cell execution:

```text
installation revision + Cell replica
  -> lifecycle-issued broker identity
  -> authenticated process registration
  -> manifest export match
  -> ServiceRuntimeLifecycle.invoke
  -> one admitted native invocation
  -> SDK ctx bound to invocation/service/partition identity
```

For an ordinary handler initiating a native distributed call:

```text
installed service revision + handler
  -> generated operation handle
  -> authenticated process channel
  -> generated outbound-call policy admission
  -> existing Call Cell ingress
  -> CallCellInvoker
```

Stop/remove revokes the relevant replica credentials. Replacement rotates them.
Reports and logs redact them. This is workload identity for core attribution and
invocation admission, not enterprise authorization or tenancy.

## Placement slices

The activation-cost work remains downstream of real OCI activation and is split
into independently measured concerns:

1. image-presence/activation evidence owner;
2. composed placement-objective decision;
3. movement trigger and hysteresis;
4. deterministic red-on-revert proof; and
5. live affinity/activation engagement proof.

The fixture begins non-optimal when it intends to demonstrate movement. When it
is already optimal, acceptance records `already_optimal` and still proves the
production owner consumed fresh affinity and activation evidence.

Native Call Cells reuse this evidence. A call may prefer an eligible partition
replica whose host already has the image or a warm Cell, but only the existing
placement/invocation owners may make that choice. Warmth is a cost input, never
an authority to run on a node that does not satisfy the partition/consistency
contract.

## WASM invocation

The engine decision must define both the host ABI and the externally supported
invocation surface. A component is not proven by magic bytes or by invoking a
test adapter directly. The installed revision must be selected by the catalog,
activated by the production driver, called through the supported service surface,
and return an application-visible result.

The old JavaScript-envelope mechanism may remain only if renamed and isolated as
an internal rehearsal path. It cannot be a fallback from the supported component
runtime.

Native OCI Call Cells are not a fallback from a failed WASM invocation either.
Runtime kind is part of the installed Artifact identity and a call remains pinned
to its selected revision/provider. A service can compose separate OCI and WASM
Artifacts/Bindings when it wants both providers, but one installed revision never
changes runtime kind in response to failure or placement cost.

## Example journey

The canonical fixture begins as a small ordinary application and grows one
capability at a time:

1. external application plus PostgreSQL baseline;
2. unchanged external application plus Lagrange PG wire;
3. same image installed as a Lagrange-managed OCI service;
4. one source-level distributed operation exposed from the same program as a
   native OCI Call Cell, using at least one genuine native dependency;
5. the same logical operation expressed as a genuine OCI-packaged WASM
   component; and
6. side-by-side report of correctness, cold/warm activation, transfer shape,
   failure/retry semantics, and runtime caveats.

The native rung must prove that the function runs on the nodes that hold the
selected partition replicas, not merely in the long-running service replica that
received the outer request. Killing a named native Cell during execution must
produce the documented typed ambiguous/retry behavior and replacement revision
identity.

MovieLens remains an advanced successor after its current Quest reaches an honest
terminal. It is a natural higher-scale consumer once the small native Call Cell
fixture is terminal, particularly for Python/native-library or model-loading
experiments.

## Acceptance fidelity

The live harness records a unique run identity and source fingerprint, rejects
stale or unlabelled artifacts, starts shipped entrypoints, and inspects actual
runtime objects. Recovery acceptance names the killed instance and the distinct
replacement. Attribution acceptance watermarks the triggering request and reads
only later access rows. Cold/warm timing verifies cache/image preconditions and
records every sample.

Native Call Cell acceptance additionally records:

- exact OCI image, package, manifest, revision, Cell replica and export identity;
- the ordinary handler's authenticated service/revision identity and generated
  outbound-call policy decision before a service-originated call enters the
  existing Call Cell owner;
- partition id and destination node selected by the ordinary Call Cell owner;
- proof that the destination node held the admitted partition replica and built
  the batch locally;
- broker registration identity and exact manifest-export match;
- driver/provider witness showing `ServiceRuntimeLifecycle.invoke()` reached the
  OCI runtime rather than a test adapter;
- native dependency identity/version from inside the managed image;
- invocation id across retry/replacement; and
- explicit classification of any external side effect as outside Lagrange's
  exactly-once-visible result guarantee.

A harness that calls the broker's worker-delivery path or
`OciContainerDriver.invoke()` directly is a provider test, not product
acceptance. The handler-originated path likewise is not accepted unless the
broker hands it to the normal Call Cell ingress and the existing
`CallCellInvoker` makes the distributed decisions.
