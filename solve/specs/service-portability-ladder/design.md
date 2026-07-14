# Service Portability Ladder Design

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

The control-transport Quest selects one of these existing-owner extensions:

1. first-class lifecycle SQL over authenticated PG wire; or
2. authenticated private admin RPC consumed by the CLI.

The public UX may hide transport envelopes, but it must not hide the security
boundary. An unauthenticated externally bound admin WebSocket is not an allowed
production control plane.

## OCI provider milestone

The first provider target is Docker Compose using a bounded host runtime agent.
Lagrange node containers do not receive an unrestricted Docker socket. The
agent exposes only the runtime operations and identity labels required by the
driver, authenticates callers, and owns engine-specific translation.

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

