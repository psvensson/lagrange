# Service Portability Ladder Requirements

## Program result

The deployment story is a three-rung ladder, ordered by how much of Lagrange's
data-local execution model the developer adopts:

- **Rung 1 - bring your container (Lagrange-unaware).** An unchanged
  PostgreSQL-talking application in an OCI container becomes a
  Lagrange-managed service whose replicas are placed near the data they
  access. Expected to be the most common first adoption path.
- **Rung 2 - native OCI Call Cells.** The same OCI image exposes named
  distributed functions from the developer's normal language/runtime. Lagrange
  invokes those functions on Cells placed at the selected partition replicas,
  supplies the normal bounded call context, and keeps the customer's native
  library ecosystem available. Functions are installed with the image; they are
  not serialized closures shipped per call.
- **Rung 3 - WASM components.** The same distributed-operation model is packaged
  as a portable, sandboxed, digest-pinned WebAssembly component through the
  same Artifact / Binding / Cell surface.

A developer evaluating Lagrange can follow one progressive, reproducible path:

1. run an ordinary Dockerized PostgreSQL application against Lagrange by changing
   connection and security configuration only (rung 1, first half);
2. install the exact same digest-pinned OCI image as a Lagrange-managed,
   long-running service with real lifecycle, health, logs, recovery, and
   authenticated service identity (rung 1, second half);
3. expose one bounded hot path from that same program as a native OCI Call Cell
   and observe Lagrange execute it at the selected partition replicas while it
   uses an ordinary native dependency (rung 2); and
4. where portability, density, or stronger sandboxing is worth the tradeoff,
   package the same operation shape as a genuine WebAssembly component and run
   it through the same call surface (rung 3).

The live managed OCI prerequisite and the complete rung-2 terminal are assigned
to roadmap version **0.6**. The AGPL roadmap rows are
`RM-0.6-managed-oci-activation` and `RM-0.6-native-oci-call-cells` respectively.
This version assignment is part of the program contract, not merely explanatory
prose in the human roadmap.

The canonical native-OCI execution boundary is
[`architecture/native-oci-call-cells.md`](../../../architecture/native-oci-call-cells.md).
The superseded callback/shared-context exploration is historical context only;
it is not the implementation path for rung 2.

The program reports exact artifacts and raw measurements. It does not promise
that WASM is universally smaller or faster, nor that native OCI execution has
WASM-equivalent isolation.

## Scope

This specification is limited to Community/AGPL substrate identified by
`edition-matrix.md`: cluster deployment experience, PostgreSQL compatibility,
developer workflow, advanced runtime services, the external kernel platform API,
and the installable service ecosystem core.

The program does not implement enterprise tenancy or RBAC, commercial
entitlements, KMS/secrets providers, data-local AI behavior, or paid operator
surfaces.

## Required adoption stages

### R1 - Truthful capability contract

- Documentation and examples must distinguish current behavior, internal
  rehearsal machinery, and production-supported external service behavior.
- JavaScript source bytes executed through `new Function` or equivalent must not
  be described as a compiled WASM module or component.
- `native_js` must remain kernel-internal and must be rejected by external
  install manifests.
- Managed long-running OCI endpoints and planned native OCI Call Cell invocation
  are distinct capabilities. Until R8 is proven, documentation must continue to
  report OCI Call Cell invocation as unsupported.

### R2 - Existing application portability

- The fixture must use an ordinary application request handler, the real `pg`
  driver and pool, parameterized values, deterministic multi-row ordering, and a
  deliberately supported transaction/schema operation.
- PostgreSQL and Lagrange stages must use identical source, Dockerfile,
  entrypoint, command, and immutable application image digest.
- Differences are limited to connection, credential, TLS, and Lagrange service
  metadata.
- A separate application container must authenticate over TLS; loopback trust
  must never be widened to satisfy the example.
- The example must state its supported PostgreSQL slice and must not claim
  arbitrary ORM compatibility.

### R3 - One install and control plane

- One authenticated service-control transport must own lifecycle mutation.
- The CLI must consume that transport rather than introducing a parallel state
  mutation path.
- External manifests are versioned and accept only `oci_container` and
  `wasm_component` runtime kinds.
- All installable artifacts use OCI packaging and mandatory digest verification.
  Signature enforcement follows an explicit policy.
- Desired catalog state owns package, revision, installation, rollout, and typed
  failure state only. Existing service-instance and endpoint tables remain the
  actual-state owners.
- Unsupported activation records a durable `recorded_not_running` outcome; it
  must not be reported as a running installation.

### R4 - Real OCI supervision

- The first live milestone selects exactly one production runtime provider.
- The shipped composition root, not the demo runner, binds the provider.
- The provider must pull, create, start, inspect, probe, read logs, stop, and
  remove a real digest-pinned container.
- Lifecycle resources must be labelled with service, revision, and instance
  identity and reconciled after failure.
- Killing a named active instance must result in that exact instance stopping
  and one distinct replacement becoming ready without persistent over-replication.
- Generic Cell request continuity, stale-route recovery, and duplicate-effect
  prevention are owned by
  `solve/specs/request-invocation-partitioning/requirements.md`. OCI acceptance
  consumes that terminal and adds provider-specific container, probe, endpoint,
  log, and restart evidence; it does not implement a second routing/failover
  mechanism.
- Kubernetes/containerd support is a separate provider milestone and is not
  implied by a Docker-based first proof.

### R5 - Authenticated service identity and placement

- A service credential has explicit issuance, rotation, revocation, and
  redaction semantics.
- The server derives `issuingServiceId` from the authenticated session; clients
  cannot choose or spoof it.
- Fresh application requests produce fresh `service_partition_access` evidence
  through the existing owner.
- Placement composes data affinity, image presence/activation cost, load/spread,
  movement cost, and hysteresis in the existing placement owner.
- Live evidence must identify the production decision owner and compare its
  result with an independent oracle; an oracle reimplementation alone is not
  engagement proof.

### R6 - Genuine WASM component

- A pinned component-model-capable engine and toolchain must define the runtime
  and invocation contract.
- If the selected artifact is a core module rather than a component, the runtime
  contract must be renamed instead of retaining `wasm_component`.
- Validation must distinguish component encoding from merely checking the core
  WASM magic bytes.
- Installation and invocation must pass through the catalog and public runtime
  surface; direct runner construction of an engine adapter is not acceptance.
- Engine validation, compilation, instantiation, invocation, capability
  enforcement, and SQL/service identity propagation must be observable.
- No JavaScript-envelope or `new Function` fallback may remain on the supported
  path.

### R7 - Reproducible evaluator proof

- One command, `npm run demo:service-portability`, drives the documented journey
  from a fresh clone.
- Every Lagrange, application, OCI, and WASM artifact is built from the recorded
  HEAD in a unique run namespace and carries a source fingerprint.
- Pre-existing containers, networks, volumes, ports, databases, service IDs, and
  access rows cannot satisfy acceptance.
- The runner invokes the real application or supported service surface with a
  per-run nonce.
- Reports include immutable digests, inspected configuration, exact outputs,
  artifact sizes, raw cold/warm samples, runtime witnesses, identity/access
  evidence, placement inputs and decision, recovery evidence, environment,
  security conditions, and caveats.
- Negative cases cover wrong digest, wrong media type, external `native_js`,
  spoofed identity, bad or revoked credentials, TLS downgrade, unhealthy
  containers, and the legacy JavaScript envelope.
- Teardown removes run-owned resources. A second run must pass without consuming
  the first run's runtime or access evidence.

### R8 - Native OCI Call Cells (rung 2)

Rung 2 extends the existing Call Cell runtime at exactly one provider boundary.
Its detailed architecture is
[`architecture/native-oci-call-cells.md`](../../../architecture/native-oci-call-cells.md).
R8 and its K0-K6 executable rows are roadmap 0.6 work and must use
`RM-0.6-native-oci-call-cells` when authored. The following requirements are
binding for any implementation quests:

- **One distributed execution owner.** `CallCellInvoker` and its existing
  collaborators continue to own Binding resolution, partition fanout, host
  choice, activation demand, bounded parallelism, partial coordination, reduce,
  retries, and result visibility. No OCI-specific callback scheduler, partition
  router, or durable callback registry is allowed.
- **One runtime transition.** Destination admission and local shard reads remain
  in the existing runtime-service Call Cell handler; provider-specific behavior
  starts only at `ServiceRuntimeLifecycle.invoke()` and the selected runtime
  driver.
- **Installed code, explicit call data.** Native function source, bytecode,
  closure state, and interpreter heaps are never serialized in an invocation.
  The pinned OCI image/revision already contains the code and dependencies;
  calls carry only immutable operation identity, explicit arguments, bounded
  partition-local input, context, and results.
- **Manifest authority.** The external manifest remains the sole durable export
  declaration. A managed native process registers its available exports as
  readiness evidence and must exactly satisfy the pinned manifest/interface
  contract; registration cannot create a new executable export.
- **Same-program authoring without deployment identity leakage.** An idiomatic
  language SDK may let the endpoint handler call a local operation descriptor,
  but packaging must compile that descriptor into the existing Artifact,
  Binding, and outbound-call-policy owners. Runtime calls do not carry arbitrary
  caller-selected module paths or service IDs.
- **Service-originated calls re-enter the existing owner.** An ordinary handler
  sends only its generated operation handle and explicit arguments over the
  lifecycle-authenticated process channel. The broker derives caller identity,
  enforces generated outbound-call policy, and hands an admitted request to the
  existing Call Cell ingress. It cannot choose a partition, worker, or retry
  policy from its native-worker registration state.
- **Data remains local.** The destination node revalidates the partition fence
  and executes the Binding-declared statement against its local replica before
  handing the bounded batch to the native process. Rows must not cross the
  cluster network merely because the execution provider is OCI.
- **Context parity.** The native SDK projects the same bounded Call Cell
  semantics for emit, nested call, deadlines, budgets, identity, and typed
  failure as the equivalent WASM call context. Language wrappers may be
  idiomatic but cannot strengthen or fork the semantic contract.
- **Application-initiated invocation channel.** A managed process opens an
  authenticated long-lived channel to a node-local broker; no public callback
  port is required. The OCI host agent provisions lifecycle/connectivity only
  and never becomes an invocation router.
- **Lifecycle-bound identity.** The broker derives cluster, node, service,
  revision, and Cell replica identity from lifecycle-issued credentials. Guest
  code cannot choose or spoof those identities or the target partition.
- **Process state is cache.** Module globals, VM heaps, loaded models, and native
  libraries may remain warm, but replacement, retry, movement, or scale-to-zero
  may discard them. Durable cross-invocation state must use existing Lagrange
  state/table owners; transparent distributed closure capture is not supported.
- **Honest retry semantics.** Native callback execution is not exactly-once.
  Lagrange may provide exactly-once-visible managed results through the existing
  journal/reduce owners, but arbitrary external side effects require
  application idempotency. The stable invocation ID must be exposed to SDK code
  for that purpose.
- **Real native-value proof.** Rung-2 acceptance must exercise at least one
  genuine native dependency that the current WASM path does not provide, so a
  JSON echo container cannot satisfy the product claim.
- **Language neutrality proof.** After the first SDK path is terminal, a second
  materially different runtime must consume the same broker/context semantics
  without adding a language-specific Lagrange routing path.

## Program completion

The base portability program is complete only when the production-path live
acceptance proves rungs 1 and 3 and their negative cases from a fresh clone.
Unit-only, adapter-only, or hand-authored oracle evidence cannot close that
product result.

Rung 2 (R8) receives its own Phase 5 live terminal because it depends on real
managed OCI activation and adds a new runtime-provider execution capability. It
must not silently widen the existing E3 terminal. When Phase 5 closes, roadmap
0.6's native Call Cell result is proven and the full three-rung journey is
available: unchanged OCI application -> native OCI Call Cell -> WASM Call Cell.
