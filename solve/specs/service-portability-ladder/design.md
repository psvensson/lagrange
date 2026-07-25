# Service Portability Ladder Design

## Deployment ladder

The program's shape follows the three-rung deployment goal (requirements
"Program result"): rung 1 — an unchanged pg-talking OCI container becomes a
managed, data-affinity-placed service (phases 0–2); rung 2 — Lagrange-aware
callbacks on one unified surface with a shared service context (phase 5,
epic-stage); rung 3 — genuine WASM components through the same install surface
(phase 3). Each rung trades developer effort for efficiency: rung 1 moves the
service near the data, rung 2 moves the compute into the partition owners,
rung 3 makes that compute portable and sandboxed.

## Rung 2 sketch (epic-stage)

Today rung 2 is two surfaces sharing one `run(ctx)` contract: embedded
`runtime.run(fn)` (the function is serialized and shipped) and the uploaded
callback module driven by its manifest `SELECT`. The unification direction is
one callback-module unit with ad-hoc and installed execution as artifact
properties, not separate APIs.

Cross-replica state is deliberately **not** closure capture: a **shared
service context** — a redis-like keyed store scoped to the service, shared
across its replicas, accessed through `ctx` — is the contract the
Lagrange-aware developer writes against. Callback code stays stateless and
serialization-safe; the store's consistency, lifecycle, bounds, and identity
scoping are the K1 decision. Storage preference is existing replication
machinery (a replicated, SQL-visible system table per service) over a second
KV mechanism. Open questions and options live in
[`solve/epics/lagrange-aware-callback-shared-context.md`](../../epics/lagrange-aware-callback-shared-context.md).

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
| OCI execution | Runtime driver plus one selected provider | Production composition root binds the provider. |
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

component ABI/engine/invocation decision
  -> genuine component execution -> OCI artifact activation -> template

all paths
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

## Identity flow

```text
installation revision
  -> replica credential issuance
  -> authenticated PG session principal
  -> server-derived issuingServiceId
  -> canonical SqlRequest
  -> service_partition_access owner
  -> placement evidence input
```

Stop/remove revokes a replica credential. Replacement rotates it. Reports and
logs redact it. This is workload identity for core attribution, not enterprise
authorization or tenancy.

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

## WASM invocation

The engine decision must define both the host ABI and the externally supported
invocation surface. A component is not proven by magic bytes or by invoking a
test adapter directly. The installed revision must be selected by the catalog,
activated by the production driver, called through the supported service surface,
and return an application-visible result.

The old JavaScript-envelope mechanism may remain only if renamed and isolated as
an internal rehearsal path. It cannot be a fallback from the supported component
runtime.

## Example journey

The canonical fixture is a small Node/`pg` HTTP service with a pure deterministic
ranking operation that can later be extracted. Its stages are:

1. external application plus PostgreSQL baseline;
2. unchanged external application plus Lagrange PG wire;
3. same image installed as a Lagrange-managed OCI service;
4. optional embedded `native_js` extraction rehearsal, excluded from deployment
   and size claims; and
5. genuine OCI-packaged WASM component invoked through the install surface.

MovieLens remains an advanced successor after its current Quest reaches an honest
terminal. It does not block the small evaluator path.

## Acceptance fidelity

The live harness records a unique run identity and source fingerprint, rejects
stale or unlabelled artifacts, starts shipped entrypoints, and inspects actual
runtime objects. Recovery acceptance names the killed instance and the distinct
replacement. Attribution acceptance watermarks the triggering request and reads
only later access rows. Cold/warm timing verifies cache/image preconditions and
records every sample.
