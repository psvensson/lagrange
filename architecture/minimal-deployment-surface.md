# Minimal Deployment Surface

This document owns the selected architecture for collapsing Lagrange's
mechanism-first deployment surfaces into three nouns: **Artifact**, **Binding**,
and **Cell**. It is the contract boundary for roadmap row
`RM-2.0-minimal-deployment-surface`; executable work remains in linked Quests.

## Scope and edition boundary

The artifact, binding, reconciliation, placement, and runtime substrate are
Community/AGPL work. Paid services, entitlement, tenant isolation, secrets/KMS,
and commercial policy implementations remain external consumers, not work
defined by this contract.

## Selected model

### Artifact

An Artifact separates immutable deployment declaration identity from OCI payload
identity. The bindable declaration is the installed `package_id` plus the
SHA-256 digest of its exact canonical normalized manifest; the manifest pins the
OCI object by its own digest. Runtime kind selects an execution strategy; it does
not select a packaging or catalog path. An artifact exposes stateless handlers.
The external manifest declares, for every export:

- one unique export name;
- one stable interface identifier.

The interface identifier types the artifact boundary without prescribing which
Binding source may call it; source-to-interface compatibility belongs to the
Binding contract. Replication, placement, and table authorization are not
Artifact properties. The sole Artifact contract is schema v3. Ingress,
normalization, durable catalog replay, scaffolding, and runtime binding all use
that same contract; other schema versions are not decoded.

Manifest fields are the runtime-neutral canonical vehicle for executable
identity and interfaces. A future WIT adapter may compile component metadata
into the same fields, but must not become a second declaration authority.
Schema v3 carries only executable identity and interfaces.

### Runtime access policy

Table authorization is durable control-plane configuration managed separately
from Artifacts and Bindings. It may be changed without rebuilding an Artifact,
rewriting a Binding, generating a lock file, or running an ingestion pipeline.
The policy owner resolves the authenticated tenant, principal/service identity,
operation, and canonical table identity at the point of access and fails closed
when no rule authorizes it.

Observed reads and writes are not authority. The existing runtime access metrics
path publishes direct, time-bounded observations that the existing
runtime-service policy converts into data-affinity weights. Those observations
may decay, move placement, and improve locality, but they never generate or
promote manifests, Bindings, or access-policy rows.

### Binding

A Binding is the only durable user declaration of execution intent. Its
canonical target stores the three-part declaration identity:

```text
on <source> run <package-id>@<manifest-digest>#<export>
```

OCI-digest shorthand is not part of the Binding contract. Any future shorthand must first
receive an authenticated set of eligible installed package identities, fail
closed when more than one eligible declaration matches, and persist only the
canonical three-part identity above.

It is immutable, versioned, replicated, and carries source-typed invocation
configuration, budgets, and owner-derived capabilities. It carries neither
table authorization nor Cell replica shape. The closed source vocabulary is
`request`, `change`, `call`, `pushdown`, `time`, `once`, and `boot`; each source
has one fixed execution semantic. `call` and `pushdown` Bindings are durable
registrations, while individual statement calls and query plans are transient
invocations rather than Bindings.

The sole Binding contract is schema v2. Its exact root is `schema_version`,
`name`, `target`, `source`, and `budgets`; unknown fields are invalid at ingress
and durable replay. Its source is one of these closed variants, with one fixed
compatible Artifact interface:

| Source | Exact source fields | Artifact interface |
| --- | --- | --- |
| `request` | `kind`, `method` in `DELETE|GET|PATCH|POST|PUT`, exact static `path` | `request_v1` |
| `change` | `kind`, lexical unique `operations`, lexical unique `tables` | `change_v1` |
| `call` | `kind`, registration `name` | `call_v1` |
| `pushdown` | `kind`, registration `name` | `pushdown_v1` |
| `time` | `kind`, `interval_ms` in `1..86400000` | `time_v1` |
| `once` | `kind` | `once_v1` |
| `boot` | `kind` | `boot_v1` |

Change-source `tables` select which change events invoke the handler; they do
not authorize handler reads or writes. Artifact capabilities are derived and
stored lexically by the owner, never accepted as caller authority. Budgets are a
closed set of safe-integer limits: CPU `1..60000` ms, wall time `1..300000` ms
and not below CPU, memory `1..1073741824` bytes, input/output `0..16777216`
bytes each, and context `0..67108864` bytes.

Schema v2 is create-only. `DeploymentBindingOwner` derives one tenant-scoped logical
identity and immutable generation 1, stores a digest of the canonical Binding,
and permits only byte-identical replay. Replacement and removal will append
later generations; no mutable `active` flag, update, or delete path exists in
the contract. Authenticated `CREATE BINDING $1` is the only Binding ingress. The
`service_bindings` table is internally CDC-propagated declaration state so a
later reconciler can wake from replicated changes. Binding compilation derives
desired state; it does not directly execute a runtime service.

### Cell

A Cell is a derived running actual: a placed, disposable instance of a stateless
handler plus a local materialization of its table-backed context. Users never
declare Cells. A Binding-derived `service_definitions` row is desired state, not
a Cell; its placed `services` rows are replica actuals, and the name Cell applies
only when the existing runtime lifecycle has made such an actual ready and
running. This distinction prevents planning or placement alone from being
reported as runtime activation.

The existing `service_definitions-p1` leader remains the single planning owner.
It reconciles immutable Binding lineage into desired state through
`ServiceDefinitionsOwner`; `RuntimeServiceRebalancerOwner` admits active desired
rows, instantiates one `UnifiedRebalancer` per admitted service, and that
rebalancer owns placement into `services`. `ServiceRuntimeLifecycle` and
`RuntimeDriverRegistry` remain the only runtime-start boundary. Cell vocabulary
does not add a table, scheduler, replica owner, or runtime lifecycle.

The first cutover admits only request Binding lineage. The planning owner
level-triggers each existing inactive request-derived row to `status = active`,
preserving its service identity, pinned runtime descriptor, Binding lineage, and
canonical projection. Its stored `replica_count = 0` is a non-authoritative
sentinel. The runtime-service policy recognizes Binding lineage and
derives target, minimum, maximum, topology, capacity, and data affinity directly
from system policy. One shared projection exposes that effective target to the
rebalancer, admin, CLI, and discovery readers without writing a generated count
back to desired state. The other six Binding sources remain inactive until
their own activation Quests.

Service state is context-as-table. The first placement cutover does not invent a
per-Cell store or claim local context materialization before a genuine runtime
is ready. Cell capacity is a policy output, not application intent. Changes to
Cell capacity do not alter partition/message-group quorum ownership; partition
replication remains governed by its existing kind-specific policy.

### Invocation partitioning

Invocation partitioning is independent of Cell capacity. A transport-specific,
control-plane-managed key extractor may derive a canonical actor key from the
already normalized invocation—for HTTP, for example, a configured path
parameter or authenticated claim. A transport-neutral assignment policy then
selects from the ready actuals already admitted by
`RequestBindingRouteResolver`; it does not create Cells or bypass the existing
dispatcher and runtime owners.

The first pluggable assignment candidate is rendezvous hashing over stable
replica identities because it supports arbitrary replica membership and
minimizes remapping when capacity changes. Hashing provides affinity, not an
absolute ownership guarantee: a failed or removed actual cannot remain the
destination. If per-actor single ownership across topology changes is required
for correctness, the reusable next layer is a fixed logical-shard namespace
with epoch-fenced ownership and handoff through existing replicated metadata
owners. No separate scheduler or replica lifecycle is selected.

The axiomatic bootstrap set is exactly the existing bootstrap-owned
system-table/message-group partition actuals plus the built-in
`sys-admin-meta`, `sys-wasm-meta`, and `sys-postgres-wire` runtime services.
These already provide the replicated catalog, Binding/desired-state tables,
planning leadership, and authenticated ingress needed to reach the reconciler
fixed point. The Cell cutover adds no seed registry, no new built-in, and no
Binding-derived user Cell to that axiomatic set. Partitions remain built-in
services at the Cell contract layer while preserving their existing
kind-specific data-plane path.

## Selected owner map

| Concern | Selected authority | Contract action |
| --- | --- | --- |
| External artifact shape | `external-service-manifest.js` | Carry executable identity and typed export interfaces in the sole schema-v3 contract; reject caller-owned Cell replication and table access declarations. |
| Artifact resolution | Installable OCI artifact resolver | Reuse unchanged. |
| Immutable bindable Artifact identity | `ServiceInstallCatalogOwner` / `service_packages` | Derive and verify `manifest_digest` from the exact immutable `normalized_manifest`; never select a declaration by OCI digest ordering. |
| Lifecycle ingress | Authenticated lifecycle SQL, consumed by the CLI | Extend with parameterized `CREATE BINDING $1`; no binding-specific side channel. |
| Immutable Binding declarations | `DeploymentBindingOwner` / `service_bindings` | Validate target, invocation trigger, and budgets; carry no table authorization or replica intent and expose no generic mutation path. |
| Runtime table authorization | One direct control-plane access-policy owner | Authorize exact runtime accesses from durable policy configured independently of Artifact and Binding lifecycles; do not generate declaration files from observations. |
| Observed service-to-data affinity | Existing service partition access metrics/publisher and runtime-service policy | Feed fresh, decaying read/write observations directly into placement weights; observations never become authorization. |
| Desired runtime service | `service_definitions` and its existing planning leader | Compile supported Bindings as lineage-bound inactive zero-replica desired rows; retire direct user declaration writes here, and leave activation to the Cell cutover. |
| Request Cell desired-state activation | `ServiceDefinitionsOwner` under the existing `service_definitions-p1` planning leader | Level-trigger only request-derived rows to active desired state without writing a target count; preserve immutable Binding lineage and keep other sources inactive. |
| Placement and replica lifecycle | `RuntimeServiceRebalancerOwner`, `UnifiedRebalancer`, shared replica owners, and `ServiceRuntimeLifecycle` | Derive Binding Cell shape from the existing runtime-service policy and admit request lineage through the existing `services` actual/runtime path; do not fork a scheduler. |
| Effective replica reporting | Shared runtime-service policy projection | Reuse the placement decision in admin, CLI, and discovery views; do not snapshot generated policy output into Binding desired state. |
| Handler context | Replicated tables and existing KV/timer primitives | Reuse; local materialization and handoff must engage the existing owners after genuine runtime execution exists, without a second state store. |
| Request data-plane ingress | One node HTTP adapter plus canonical security-context validation | Authenticate into a server-derived context and normalize a request; do not select a target, trust client-supplied owner identity, or dispatch directly. |
| Request Binding route resolution | `RequestBindingRouteResolver` | Resolve one tenant-scoped immutable method/path declaration to its exact Binding version and a current ready actual; fail closed on ambiguity or stale state and do not repair owner state. |
| Optional invocation partitioning | Transport key extractors plus one transport-neutral assignment policy inside the existing route resolver | Extract a canonical actor key from normalized invocation properties and select among current ready actuals; no replica-count or lifecycle authority. |
| Request invocation delivery | `ServiceDispatcher`, `MessageRouter`, and the runtime invocation owner established by Cell readiness | Translate the resolved invocation into one canonical `Service_Message`, revalidate at the receiver, and require processed component-response evidence; do not add direct-local, endpoint-bypass, or acknowledged-only success paths. |

`code`, `module_manifests`, `service_definitions`, stored functions, CDC
subscriptions, and callback registrations are migration inputs, not new peers of
Artifact/Binding/Cell. They do not create alternate Artifact or Binding
contracts.

## Migration sequence

1. Make Artifact manifests analyzable: the sole schema-v3 contract carries
   canonical interface declarations through the live install/catalog path.
2. Establish the bindable Artifact identity as installed `package_id` plus the
   digest of exact canonical `normalized_manifest`; make digest-only ambiguity,
   non-current input, and durable corruption fail closed in the catalog owner.
3. Seal Binding schema v2 and its single validator/persistence owner. Require
   current analyzable artifacts for every Binding. Quest
   `minimal-deployment-binding-v0-declaration` owns this step.
4. Compile request Bindings into the existing desired-service lifecycle as
   inactive zero-replica rows and make Binding the declaration authority;
   delete direct competing declaration writes in the same cutover. Quest
   `minimal-deployment-request-binding-compilation` owns this step without
   activating runtimes or naming Cells.
5. Move `change`, `call`, `pushdown`, `time`, `once`, and `boot` ingress to the
   same Binding owner one source at a time, deleting superseded surfaces.
   `change`, `time`, `once`, `boot`, and `call` are complete; Quest
   `minimal-deployment-pushdown-binding-compilation` owns the final source as a
   durable named registration without installing query pushdown, invoking the
   Artifact, or activating a runtime.
6. Introduce Cell semantics before consolidating partition/service lifecycle
   code, in closure-gated slices:
   1. activate request-derived desired state and engage the existing
      system-policy-owned runtime-service placement path;
   2. make a placed request actual genuinely ready through a real runtime engine
      and the existing lifecycle, with table-backed context;
   3. route request invocation to that ready Cell; and
   4. activate the remaining sources through the same owners, one executable
      concern at a time.
7. Move table authorization from Artifact export and Binding context
   declarations to directly managed runtime access policy. Keep the existing
   observed access publisher as live affinity telemetry; do not generate or
   ingest declarations from it.
8. Add optional actor-key invocation partitioning inside the existing route
   resolver. Start with a transport-key extractor and rendezvous assignment over
   ready actuals; add fixed logical shards and epoch-fenced handoff only if
   strict single ownership is selected as a correctness requirement.

Each step must engage the new owner in the production path it claims. Merely
adding a table, validator, adapter, or feature flag is not completion.
Placement is evidence of the first Cell cutover slice, but it is not evidence of
a running Cell while `wasm_component` remains only a lifecycle scaffold.

## Permanent invariants

- OCI payload bytes and normalized manifest declarations have distinct immutable
  digests. A Binding pins `package_id` plus `manifest_digest`; in-flight work
  remains pinned to its starting version.
- Code is stateless. Durable state and synchronization live in tables.
- Binding is intent, Cell is actual, and neither is reconstructed from the other
  by readers.
- One validator owns each normalized boundary. DDL and CLI syntax compile to
  that owner rather than re-validating locally.
- Runtime table authorization comes only from directly managed access policy.
  Observed access is affinity telemetry and never grants authority.
- Reconciliation wakes from canonical replicated change notification and is
  level-triggered, idempotent, and eventually stable.
- Cell capacity is a system-policy output and does not change
  partition/message-group consensus quorum.
- Exactly one existing runtime-service rebalancer owns placement for each active
  Binding-derived service; Cell activation cannot introduce a parallel planner.
- A Binding-derived actual is not called a Cell until the existing runtime
  lifecycle reports it ready and running.
- No feature flag or parallel fallback path survives a landing session.

## First executable slice

Quest `minimal-deployment-artifact-export-contract` completed step 1,
`minimal-deployment-artifact-binding-identity-replacement` completed step 2,
`minimal-deployment-binding-v0-declaration` completed step 3, and
`minimal-deployment-request-binding-compilation` completed step 4. Quest
`minimal-deployment-change-binding-compilation` completed the first source in
step 5, followed by `minimal-deployment-time-binding-compilation` and
`minimal-deployment-once-binding-compilation` and
`minimal-deployment-boot-binding-compilation` and
`minimal-deployment-call-binding-compilation` and
`minimal-deployment-pushdown-binding-compilation` completed step 5. All seven
sources now compile through the same `service_definitions` planning leader, and
all derived rows remain inactive with zero replicas.

Quest `minimal-deployment-request-cell-placement` completed the first slice of
step 6. Quest `minimal-deployment-system-owned-cell-replication` corrects that
slice so request activation carries no caller-owned replica shape and the
existing `RuntimeServiceRebalancerOwner` / `UnifiedRebalancer` policy is the
sole Cell-capacity authority.

Quest `minimal-deployment-request-cell-runtime-readiness` completed the second
slice: genuine component execution through the existing runtime registry,
driver, and lifecycle owners, including declared table-backed context and the
transition from placed actual to ready/running Cell.

Quest `minimal-deployment-request-cell-routing-shutdown-fence` completed the
third slice: one canonical HTTP request ingress resolves an immutable request
Binding through `RequestBindingRouteResolver` to a ready actual and delivers the
canonical `Service_Message` through `ServiceDispatcher` and `MessageRouter` to
the runtime invocation owner. Its durable invocation journal prevents duplicate
component effects, and bounded shutdown cancels and drains active ingress while
retiring correlated transport waiters.

Step 7 is complete: schema-v3 Artifacts and schema-v2 Bindings carry no access
declarations. Authenticated `CONFIGURE SERVICE ACCESS $1` directly updates the
existing durable config path; SQL and Component invocation resolve that policy
at access time and fail closed, while observed access remains affinity-only
telemetry. Quest `minimal-deployment-single-version-contract-cutover` removes
all alternate Artifact and Binding decoders before the remaining Cell
activation work. Next, activate the other six Binding sources through
the same desired-state, replica, and runtime owners. Actor-key partitioning
remains an explicit routing-policy design choice, not a Cell replica request.
