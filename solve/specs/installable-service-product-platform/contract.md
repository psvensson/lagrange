# Installable Service Product Platform Contract

Status: architecture/specification target. This document defines the shared
product contract required for separately released services to be installed and
operated as first-class Lagrange services. It does **not** claim that every
surface described here is implemented today.

The current implementation truth remains
[`docs/current-capabilities-and-limitations.md`](../../../docs/current-capabilities-and-limitations.md).
Current package/catalog behavior is described by
[`architecture/lagrange-service-registry.md`](../../../architecture/lagrange-service-registry.md),
and the external manifest shape by
[`architecture/lagrange-service-manifest.md`](../../../architecture/lagrange-service-manifest.md).

## Purpose

A separately released service must not require a customer to run a second
service manager beside Lagrange.

The product target is:

```text
signed service release
        |
        v
Lagrange service lifecycle
        |
        +-- verify package and compatibility
        +-- validate configuration and dependencies
        +-- apply edition/commercial policy through declared extension points
        +-- record immutable revision and desired state
        +-- activate through the unified runtime lifecycle
        +-- gate readiness on declared health
        +-- expose typed diagnostics
        +-- upgrade / roll back through the same owner path
        `-- remove without orphan runtime state
```

Lagrange AI is the first intended acceptance consumer, but nothing in this
contract is AI-specific. Backup, observability, migration, indexing, integration
or third-party services should consume the same substrate.

## Product invariant

```text
one package model
one install catalog
one lifecycle owner
one runtime activation path per runtime kind
one upgrade/rollback workflow
one diagnostics contribution contract
one support-bundle framework
```

A first-party or commercial service may extend the platform through declared
interfaces. It must not introduce a parallel installer, daemon supervisor,
secret store, telemetry transport, support collector, or updater merely because
a generic platform surface is incomplete.

## Scope and edition boundary

This specification crosses edition boundaries, so implementation ownership must
remain explicit.

### Community / AGPL substrate

The AGPL repository may own shared mechanisms whose implementation home is
already Community in [`edition-matrix.md`](../../../edition-matrix.md),
including:

- external service manifest structure and validation;
- OCI artifact acquisition, digest/signature verification and immutable package
  identity;
- package/revision/install catalog state;
- unified service desired/actual lifecycle;
- managed runtime activation for supported runtime kinds;
- compatibility and dependency preflight as a generic service-platform rule;
- configuration-schema evaluation as a generic service-platform rule;
- health/readiness contribution to ordinary service readiness;
- generic typed lifecycle failures;
- generic diagnostics and support-bundle contribution interfaces;
- local/customer-controlled telemetry contribution plumbing;
- upgrade/rollout/rollback orchestration;
- air-gapped/mirrored artifact support where assigned to the Community service
  ecosystem.

### Commercial implementations

The current edition matrix keeps these implementations outside the AGPL repo:

- commercial entitlement/license policy;
- paid exporters and advanced observability products;
- Enterprise secret-provider/KMS implementations;
- Enterprise policy-provider implementations.

The AGPL substrate may define narrow extension points required to consume those
services, but must not implement the paid policy itself unless the edition
matrix is changed explicitly.

### Service-owned behavior

Each installable service owns its own:

- service-specific configuration semantics above the generic schema contract;
- service-specific readiness checks;
- service-specific typed diagnostic facts;
- service-owned state/configuration migrations;
- entitlement feature names and limits consumed from the commercial assertion
  boundary;
- redacted service support snapshot;
- workload semantics and data-plane APIs.

## Existing mechanisms to reuse

This contract extends existing owners; it does not replace them.

| Concern | Existing owner / contract | Product-platform role |
| --- | --- | --- |
| External declaration | `external-service-manifest.js`, manifest schema v3 | Immutable service identity, runtime, compatibility, config, upgrade, dependency and health declarations |
| Artifact verification | `InstallableServiceArtifactResolver` | Single verified OCI acquisition path |
| Package/revision/install state | `ServiceInstallCatalogOwner` | Durable immutable identities, desired rollout state and typed failures |
| Install convergence | `ServiceInstallationReconciler` | Desired-vs-actual installation progression |
| Runtime lifecycle | `ServiceLifecycleManager` + `RuntimeDriverRegistry` | Only create/start/stop/restart owner for runtime actuals |
| Runtime actuals | `service_definitions`, `services`, `service_endpoints` owners | Running state, placement, endpoint and readiness truth |
| WASM deployment | Artifact / Binding / Cell | In-process component execution and declared authority |
| OCI runtime | `oci_container` runtime driver family | Process-isolated managed service execution; must graduate from scaffold to real activation |
| Lifecycle ingress | authenticated lifecycle SQL / CLI adapter | One external service-management path |

A new product concern must first answer whether one of these owners can be
extended. Creating a second owner requires an explicit architecture decision.

## Package, revision, installation and runtime identities

These identities must remain distinct:

```text
package
    immutable normalized manifest + verified artifact identity

revision
    immutable package + configuration/dependency resolution input

installation
    durable desired presence and rollout state in one cluster

service definition
    desired runtime-service declaration derived from an installation

service actual
    one running/starting/stopped runtime instance on one node
```

Therefore:

```text
package != revision
revision != installation
installation != runtime actual
runtime process/container id != durable service identity
```

The product UX may present a convenient aggregate status, but that status is a
projection over these owners and must never become a competing source of truth.

## Manifest contract

Schema-v3 service manifests already preserve the structural fields needed by
this platform:

```text
compatibility
config_schema
upgrade
dependencies
health
capabilities
```

The platform should pressure and version these existing fields rather than add a
second product manifest.

The manifest remains immutable package input. Customer-specific configuration,
resolved dependency instances, secret values, entitlement state, node
placement, runtime process handles and live health do not belong in it.

## Installation flow

The target installation sequence is:

```text
operator request
    |
    v
1. authenticated lifecycle ingress
    |
2. normalize request + idempotency identity
    |
3. resolve and verify pinned OCI artifact
    |
4. normalize/validate manifest
    |
5. compatibility + dependency preflight
    |
6. configuration-schema validation
    |
7. declared commercial-policy extension checks, when configured
    |
8. record immutable package/revision + desired installation
    |
9. installation reconciler derives desired runtime state
    |
10. ServiceLifecycleManager selects runtime driver
    |
11. managed runtime activation
    |
12. startup/readiness health evaluation
    |
13. ready actual + endpoint/diagnostic projection
```

No later phase may silently redo an earlier semantic decision. In particular:

- the runtime driver does not re-decide artifact trust;
- the service process does not re-decide Lagrange compatibility;
- a diagnostics reader does not repair install state;
- commercial policy does not own runtime activation;
- CLI presentation does not infer readiness from process existence.

### Preflight is fail-closed

Before any new revision can become an active actual, the platform must have one
canonical preflight outcome containing all applicable reasons.

At minimum the evidence snapshot covers:

- manifest schema and runtime/media compatibility;
- artifact verification/signature policy;
- declared Lagrange/kernel compatibility;
- declared platform API/capability availability;
- declared service dependencies;
- configuration schema and required values;
- external reference/secret reference *shape* when that extension is enabled;
- commercial entitlement assertion when required by the package/edition;
- runtime-kind availability on eligible nodes.

A failure is typed and observable. The system must not partially activate a
revision and then discover a preflight condition that was already knowable.

## Compatibility contract

Compatibility is a platform decision, not a service convention.

A package may declare constraints against versioned, named contracts such as:

- minimum/maximum supported Lagrange release range;
- required external kernel API versions;
- required runtime kinds/features;
- required capability/interface versions;
- required service dependencies and compatible version ranges.

The compatibility owner evaluates the declaration against one cluster evidence
snapshot and produces:

```text
compatible
incompatible(reason[])
unknown(reason[])
```

`unknown` fails closed for activation unless the declaration explicitly permits
the unknown dimension. A service entrypoint must never need to parse the
Lagrange binary version and make its own activation decision.

## Configuration contract

Customer configuration is revision input, not package identity and not ambient
process environment.

The target flow is:

```text
manifest config_schema
       +
operator configuration
       +
cluster-owned reference bindings
       |
       v
canonical configuration validation
       |
       v
immutable service revision
```

Rules:

1. Structural validation occurs before a revision is eligible for activation.
2. Service-specific semantic validation may add typed reasons but may not
   mutate cluster policy.
3. Credentials and secret values must not be embedded in the normalized
   manifest, catalog projections, diagnostic packets or ordinary logs.
4. Where an external-reference/secret extension exists, the durable revision
   stores references/identities, not resolved secret bytes.
5. Resolved secret material is runtime-local, bounded by lifecycle and
   authority, and is not copied into Lagrange-owned diagnostic state.

## Managed OCI activation

A customer-installed `oci_container` service is a Lagrange runtime actual, not a
hand-managed sidecar.

The target driver contract is:

```text
ServiceLifecycleManager
    -> OCI runtime driver
        -> acquire verified immutable image by digest
        -> create bounded runtime resources
        -> inject only declared configuration/reference material
        -> start
        -> report runtime-local identity/readiness evidence
        -> stop / kill on bounded shutdown escalation
        -> destroy runtime-local resources
```

Required invariants:

- only `ServiceLifecycleManager` owns create/start/stop/restart;
- artifact identity is digest-pinned verified input from the package path;
- one activation attempt has explicit operation identity;
- retries cannot create untracked duplicate containers;
- process/container IDs remain transient actual identity;
- local container filesystem is not durable service state unless a separately
  declared storage contract says otherwise;
- runtime resources have explicit bounds and cleanup;
- normal shutdown, failed startup, node recovery and removal all converge
  through the same owner path;
- a dead or missing container is observed as an actual-state fact and repaired
  by reconciliation, not by a second watchdog.

The OCI driver may use Docker, containerd, Podman or another implementation
behind its adapter. Concrete engine choice is not part of service semantics.

## Health and readiness

Opening a socket or starting a process is not service readiness.

A service manifest may declare generic startup/liveness/readiness probe shape.
The runtime adapter owns concrete probe execution. The service may contribute
service-specific semantic readiness through the stable service contract.

Readiness is a conjunction of relevant evidence:

```text
runtime actual exists
AND runtime is load-ready
AND declared startup completed
AND declared readiness succeeds
AND required dependencies are ready enough for the declared mode
```

A failing service-specific health check cannot mutate catalog truth directly. It
publishes evidence; the lifecycle/reconciliation owner decides the canonical
outcome.

## Upgrade and rollback contract

Upgrade is a transition to a new immutable revision, never mutation of the
running revision in place.

```text
revision N (known good)
      |
      +-- preflight revision N+1
      |
      +-- persist upgrade operation + target revision
      |
      +-- activate target according to declared/supported strategy
      |
      +-- gate progress on readiness
      |
      +-- cut traffic/ownership to target
      |
      `-- retain rollback edge until terminal success policy is satisfied
```

Supported strategy vocabulary may include `rolling`, `canary`, and
`all-at-once`, as already anticipated by the manifest/platform design. Strategy
names do not imply implementation readiness.

### Upgrade requirements

Every upgrade operation must have:

- stable idempotency/operation identity;
- source and target immutable revision IDs;
- selected strategy and its normalized bounds;
- preflight evidence bound to the target revision;
- explicit current step and next step;
- readiness gates;
- typed failure reason;
- deterministic recovery after coordinator/node restart;
- a defined rollback edge while rollback remains safe.

### Service-owned migration

If a service needs to migrate its own durable state/configuration, the service
declares that requirement through the lifecycle/platform API. The platform owns
sequencing; the service owns migration semantics.

A migration declaration must say whether rollback across the migration is safe.
The platform must not advertise automatic rollback after an irreversible
service migration. An irreversible edge instead requires explicit operator
policy and a typed non-rollbackable state before cutover.

### Automatic rollback

Automatic rollback is appropriate only when all of these are true:

- the prior revision remains available;
- the service declares rollback compatibility for the reached migration stage;
- the failure occurs inside the configured rollout/observation window;
- the rollback itself passes required compatibility/preflight checks.

Otherwise the operation stops in a typed failed/degraded state with the
prior/target revisions explicit.

## Removal contract

Removal is durable desired-state convergence, not `docker rm` or deletion of a
catalog row.

The target sequence is:

```text
request removal
 -> stop accepting new work
 -> drain/bound in-flight work according to service contract
 -> stop all actuals through ServiceLifecycleManager
 -> destroy runtime-local resources
 -> revoke runtime-only secret/reference material
 -> remove published endpoints/actual declarations
 -> perform service-owned uninstall cleanup where declared and safe
 -> mark installation removed
```

Removal must be replay-safe after crashes. A successfully removed service has no
unmanaged process/container and no live runtime-only credential copy owned by
Lagrange.

Durable service-owned business data is not silently destroyed unless the
service's uninstall contract explicitly declares and authorizes that operation.

## Diagnostics contribution contract

The platform needs one versioned interface by which any installed service can
contribute bounded diagnostics without gaining a private support channel.

The exact wire/API shape is deferred, but the semantic contract is:

```text
service diagnostics contribution
    identity
    health facts
    bounded metrics snapshot
    recent typed failure facts
    service-specific safe configuration summary
    optional topology/provider/resource observations
```

Every contribution is associated with canonical identifiers where applicable:

- package/revision/installation ID;
- service definition ID;
- service actual/node ID;
- operation/invocation correlation ID;
- observed-at timestamp and schema version.

### Diagnostics are observations

Diagnostics never own lifecycle decisions. They serialize the owner outcomes
and relevant evidence that produced them.

### Bounds

A contribution contract must bound:

- encoded bytes;
- number of facts/entries;
- historical window;
- collection deadline;
- per-service collection resource cost.

A misbehaving service cannot make the cluster support path unbounded.

## Telemetry contract

The platform separates three concepts:

```text
service emits structured operational facts
        |
        v
Lagrange local telemetry contribution boundary
        |
        +-- local diagnostics/status
        +-- customer-selected Community/local sinks
        `-- optional paid exporters (Prometheus/OTel/etc.)
```

The local contribution boundary is generic service substrate. Export products
remain in their edition implementation homes.

Telemetry policy requirements:

- customer controls whether and where telemetry leaves the cluster;
- valid licensing/entitlement must not depend on operational telemetry being
  enabled;
- services must not establish an undisclosed vendor telemetry channel;
- exported facts use stable schema/versioning and typed dimensions;
- high-cardinality payload content is not smuggled into metric labels;
- backpressure/drop behavior for telemetry is explicit and may not break
  service correctness.

## Redaction and sensitive-data boundary

Default-safe behavior is mandatory for service diagnostics and support data.

The generic platform must exclude or redact:

- secret values and authentication tokens;
- private keys/certificates where disclosure is unsafe;
- environment variables not explicitly classified as safe;
- raw query/service payloads by default;
- arbitrary service stdout/stderr fragments unless they pass the bounded log
  redaction policy.

Services with domain-sensitive payloads must define additional exclusions. For
Lagrange AI this includes prompts, model responses, source rows, embeddings and
provider credentials by default.

Opting into payload capture, where ever supported, must be explicit,
customer-controlled, bounded, visibly marked in the support artifact and
independent from ordinary telemetry.

## Customer-inspectable support bundle

Support collection is a local product capability before it is a vendor upload
feature.

Conceptual flow:

```text
operator requests support bundle
        |
        v
core collector takes one bounded evidence snapshot
        |
        +-- cluster/build/topology summary
        +-- package/revision/install state
        +-- runtime actual/readiness state
        +-- relevant operation history
        +-- bounded structured logs/metrics
        `-- versioned service contributions
        |
        v
local versioned bundle + manifest
        |
        +-- customer inspects/redacts/retains locally
        `-- optional explicit submission through a separate support channel
```

Required properties:

- local creation works without Internet connectivity;
- bundle format and every section are versioned;
- manifest enumerates included sections, byte sizes and redaction policy;
- collection has a global deadline and per-contributor bounds;
- contributor failure is recorded without aborting the entire bundle;
- no automatic submission is implied by bundle generation;
- submission, encryption and vendor transport are separate policy/product
  concerns.

## Typed error packet

The same structured failure vocabulary should serve lifecycle status,
diagnostics and support bundles. A service must not require free-text log
scraping to identify why it failed.

A generic failure fact should carry the equivalent of:

```text
code                 stable machine code
category             artifact | compatibility | configuration | entitlement |
                     dependency | activation | health | upgrade | rollback |
                     removal | diagnostics | runtime
phase                normalized lifecycle phase
message              bounded operator-safe message
retryable             boolean or typed retry advice
operation_id          when applicable
package_id            when applicable
revision_id           when applicable
installation_id       when applicable
service_definition_id when applicable
node_id               when applicable
observed_at
safe_details          bounded typed/redacted details
```

Concrete field names are implementation detail until a versioned error contract
is sealed. The taxonomy is the invariant: errors are typed, correlated,
redacted and reusable across product surfaces.

## Commercial entitlement extension point

Entitlement verification is a commercial implementation concern under the
current edition matrix, but the service platform requires one narrow assertion
boundary.

The generic lifecycle should consume a result shaped conceptually as:

```text
entitled {
  product
  edition
  features/limits
  valid_from
  valid_until/grace metadata
  assertion identity
}

or

not_entitled {
  typed reason
  retry/advice metadata
}
```

The kernel/service lifecycle consumes the assertion; it does not need the
commercial license format, billing protocol or vendor account API.

Requirements on the extension contract:

- offline-capable signed assertions must be possible;
- no mandatory telemetry phone-home;
- entitlement failure is a typed product outcome, not a crash;
- expiry/grace policy must not silently corrupt service-owned state;
- services receive normalized feature/limit assertions rather than raw license
  tokens;
- entitlement identity and safe status may appear in diagnostics, but license
  secrets/tokens do not.

## External references and secrets extension point

The generic platform may define opaque reference identities and lifecycle
hooks; actual Enterprise secret/KMS providers remain outside AGPL scope under
the current edition matrix.

A service sees only the references it is authorized to resolve. Resolved bytes
are supplied to the runtime through a bounded capability and follow runtime
lifetime. They never become manifest/package identity.

This extension must support local/private and air-gapped providers; cloud KMS is
one possible implementation, not the architecture.

## Air-gapped operation

Customer-installable services must not assume public Internet access.

The product path must admit:

- OCI artifacts acquired from a customer-controlled mirror or verified local
  layout;
- offline signature verification;
- offline commercial entitlement assertions;
- local diagnostics and support-bundle generation;
- customer-local model/provider/dependency endpoints where applicable;
- upgrades from customer-controlled artifacts.

A service may of course depend on an external network service when the customer
configures one. That dependency is service configuration, not a hidden platform
requirement.

## Operator experience

Exact CLI syntax remains a CLI contract, not architecture, but one coherent UX
should be possible:

```text
lagrange service install <package>
lagrange service status <service>
lagrange service upgrade <service>@<revision>
lagrange service rollback <service>
lagrange service remove <service>
lagrange support bundle --service <service>
```

Equivalent lifecycle SQL remains the lower-level authenticated control surface
where applicable.

The important UX invariant is that every command observes or requests work from
the canonical owners. CLI commands do not become a second service manager.

### Status projection

A user-facing status should answer, from canonical owner state:

- what package/revision is desired;
- what revision is currently serving;
- how many actuals are expected/ready/unready;
- whether an install/upgrade/rollback/removal operation is active;
- the dominant typed failure(s), if any;
- whether dependencies/compatibility/entitlement are satisfied;
- what action, if any, the operator can safely take next.

It must distinguish `installed/recorded` from `ready/running`.

## Security properties

The platform contract preserves these security boundaries:

1. Artifact trust is established before activation.
2. External manifests cannot grant themselves cluster authority.
3. Runtime capabilities are explicit and fail closed.
4. Secret values are not package/configuration identity.
5. Runtime egress is not ambient merely because an OCI service can make network
   calls; egress policy/capability should be explicit as the runtime substrate
   matures.
6. Diagnostics and support collection are not authority escalation paths.
7. A service cannot overwrite another service's package/install state.
8. Commercial policy cannot bypass ordinary lifecycle ownership.

## Failure and recovery principles

- All control-plane mutations carry stable operation/idempotency identity.
- State transitions are monotonic or compare-and-swap fenced.
- Recovery re-enters the same owner/workflow used by the original operation.
- Broad polling is recovery, not a second steady-state owner.
- Load may delay installation/upgrade/support collection but may not create
  duplicate unmanaged runtimes or inconsistent catalog/runtime truth.
- A failed diagnostics contributor does not block cluster lifecycle progress.
- A failed telemetry exporter does not fail an otherwise-correct service
  invocation.

## Acceptance consumer contract

At least one separately released service must prove this platform end to end
before the milestone is considered product-complete. Lagrange AI is the first
intended consumer.

A disposable multi-node acceptance cluster must prove all of the following:

### Install and activate

- build/sign an immutable OCI service release;
- install using only supported Lagrange service-management surfaces;
- reject a bad signature;
- reject an incompatible Lagrange version/capability before activation;
- reject invalid configuration before activation;
- activate a real managed OCI runtime;
- reach readiness without hand-managed daemon/process ownership.

### Recovery

- kill a service runtime and observe reconciliation recreate it;
- restart its hosting Lagrange node and recover without duplicate unmanaged
  runtime instances;
- prove package/revision/install identity is unchanged by runtime recovery.

### Diagnostics and support

- expose service-specific health/metrics through the common diagnostics
  contribution contract;
- produce a local support bundle with the service section present;
- prove the bundle stays bounded when the service contributor fails or hangs;
- prove declared sensitive test values do not appear in the ordinary bundle;
- run with outbound telemetry disabled without affecting service readiness or
  entitlement validity.

### Upgrade and rollback

- preflight a second signed revision;
- perform the declared supported rollout strategy;
- inject a readiness failure in the target revision;
- roll back to the prior known-good revision when rollback is declared safe;
- recover an interrupted rollout after node/coordinator restart;
- refuse automatic rollback after a deliberately irreversible service migration.

### Commercial/offline extension

Where the acceptance service is commercial:

- activate with a valid offline entitlement assertion;
- reject an invalid/expired assertion with a typed outcome;
- demonstrate the declared grace/expiry behavior;
- perform install/status/support collection without public Internet access;
- resolve configured secret references without storing secret bytes in the
  manifest/catalog/support bundle.

### Remove

- remove through the supported lifecycle;
- leave no runtime actual, unmanaged container/process or runtime-only secret
  copy;
- retain/delete service-owned durable data only according to the explicit
  uninstall contract.

## Recommended implementation sequence

This is ordering guidance, not active Quest definition.

1. **Seal generic product-state and owner contracts.** Reconcile manifest,
   catalog, lifecycle and runtime actual vocabularies; add the compatibility and
   configuration preflight owner without duplicating existing checks.
2. **Graduate managed OCI activation.** Make `oci_container` a real
   `ServiceLifecycleManager`-owned runtime with idempotent cleanup/recovery.
3. **Add service health/diagnostics contribution.** One bounded versioned
   contract consumed by status and support collection.
4. **Add local support-bundle framework.** Core snapshot + bounded service
   contributors + mandatory redaction manifest.
5. **Add health-gated upgrade/rollback.** Extend the existing installation
   reconciler/catalog/workflow rather than creating a second rollout engine.
6. **Expose commercial extension seams.** Entitlement assertion and opaque
   external-reference boundaries only; paid implementations stay in their
   assigned repositories.
7. **Use Lagrange AI as the acceptance consumer.** Close the milestone against
   the real separately released package, not synthetic unit fixtures alone.

## Explicitly rejected designs

### A separate commercial service manager

Rejected. It would create two owners for package, runtime, upgrade and status
semantics and would make Community vs paid services operationally different.

### Lagrange AI managing its own daemon/container

Rejected. AI-specific code owns inference semantics, not cluster runtime
lifecycle.

### Licensing by mandatory phone-home

Rejected as a platform requirement. It breaks air-gapped customers and couples
license validity to vendor/network availability. Online account services may be
optional commercial conveniences above an offline-capable assertion contract.

### Telemetry as licensing proof

Rejected. Customer observability policy and commercial entitlement are
independent concerns.

### Automatic crash-dump upload

Rejected as the baseline support contract. The baseline is local,
customer-inspectable bundle generation; submission is a separate explicit
operation/policy.

### Secrets embedded in service configuration

Rejected. Durable configuration contains references, not resolved secret
bytes.

### Upgrade by mutating a running artifact/tag in place

Rejected. Upgrades create a new immutable revision and converge toward it.

### Support diagnostics from unbounded raw logs

Rejected. Structured typed bounded diagnostics are primary; bounded redacted
logs are supplemental evidence.

## Relationships to existing contracts

- [`architecture/lagrange-service-manifest.md`](../../../architecture/lagrange-service-manifest.md)
  owns external package declaration structure.
- [`architecture/lagrange-service-registry.md`](../../../architecture/lagrange-service-registry.md)
  owns current verified artifact/catalog behavior and current limitations.
- [`architecture/runtime-lifecycle.md`](../../../architecture/runtime-lifecycle.md)
  owns unified runtime lifecycle and runtime-driver selection.
- [`architecture/minimal-deployment-surface.md`](../../../architecture/minimal-deployment-surface.md)
  owns Artifact / Binding / Cell deployment semantics for Components.
- [`solve/specs/service-portability-ladder/kernel-platform-api-v0.md`](../service-portability-ladder/kernel-platform-api-v0.md)
  defines the broader stable kernel API ladder consumed by installable services.
- [`docs/development/product-roadmap.md`](../../../docs/development/product-roadmap.md)
  carries the cross-edition visibility milestone.
- [`roadmap.md`](../../../roadmap.md) carries the human product milestone.
- [`edition-matrix.md`](../../../edition-matrix.md) remains authoritative for
  implementation home.

## Guardrails

```text
recorded package != running service
package != revision != installation != runtime actual
manifest declaration != granted authority
runtime actual identity != durable installation identity
container process != service owner
service health evidence != lifecycle owner
support bundle != telemetry submission
telemetry enabled != entitlement valid
entitlement extension != lifecycle owner
secret reference != secret value
upgrade target != mutable current artifact
rollback availability must be proven, not assumed
commercial service != second platform lifecycle
```
