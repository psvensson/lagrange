# Service Portability Ladder Requirements

## Program result

A developer evaluating Lagrange can follow one progressive, reproducible path:

1. run an ordinary Dockerized PostgreSQL application against Lagrange by changing
   connection and security configuration only;
2. install the exact same digest-pinned OCI image as a Lagrange-managed,
   long-running service with real lifecycle, health, logs, recovery, and
   authenticated service identity; and
3. extract one bounded hot path into a genuine WebAssembly component, package it
   as an OCI artifact, install it through the same service surface, and observe
   affinity-aware placement from authenticated data access.

The program reports exact artifacts and raw measurements. It does not promise
that WASM is universally smaller or faster.

## Scope

This specification is limited to Community/AGPL substrate identified by
`edition-matrix.md`: cluster deployment experience, PostgreSQL compatibility,
developer workflow, advanced runtime services, the external kernel platform API,
and the installable service ecosystem core.

The program does not implement enterprise tenancy or RBAC, commercial
entitlements, KMS/secrets providers, data-local AI behavior, or paid operator
surfaces.

## Required adoption stages

### R1 — Truthful capability contract

- Documentation and examples must distinguish current behavior, internal
  rehearsal machinery, and production-supported external service behavior.
- JavaScript source bytes executed through `new Function` or equivalent must not
  be described as a compiled WASM module or component.
- `native_js` must remain kernel-internal and must be rejected by external
  install manifests.
- Managed long-running OCI endpoints must remain distinct from the unsupported
  OCI callback invocation protocol.

### R2 — Existing application portability

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

### R3 — One install and control plane

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

### R4 — Real OCI supervision

- The first live milestone selects exactly one production runtime provider.
- The shipped composition root, not the demo runner, binds the provider.
- The provider must pull, create, start, inspect, probe, read logs, stop, and
  remove a real digest-pinned container.
- Lifecycle resources must be labelled with service, revision, and instance
  identity and reconciled after failure.
- Killing a named active instance must result in that exact instance stopping
  and one distinct replacement becoming ready without persistent over-replication.
- Kubernetes/containerd support is a separate provider milestone and is not
  implied by a Docker-based first proof.

### R5 — Authenticated service identity and placement

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

### R6 — Genuine WASM component

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

### R7 — Reproducible evaluator proof

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

## Program completion

The program is complete only when the production-path live acceptance proves all
three adoption stages and their negative cases from a fresh clone. Unit-only,
adapter-only, or hand-authored oracle evidence cannot close this product result.

