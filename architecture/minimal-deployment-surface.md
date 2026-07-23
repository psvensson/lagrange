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
A schema-v2 external manifest declares, for every export:

- one unique export name;
- one stable interface identifier; and
- explicit exact table read and write sets.

Access references use canonical lowercase `table:global.<table>` identities.
They are sets: normalized order is lexical, duplicates and wildcards are
invalid, and empty access is written as `[]`, never inferred from absence.
The interface identifier types the artifact boundary without prescribing which
Binding source may call it; source-to-interface compatibility belongs to the
Binding contract.

Manifest fields are the runtime-neutral canonical vehicle. A future WIT adapter
may compile component metadata into the same fields, but must not become a
second declaration authority. Manifest v1 remains readable under its existing
contract; v2 is the default for new scaffolds and the first analyzable artifact
contract. A future Binding may require v2 without reinterpreting v1.

### Binding

A Binding is the only durable user declaration of execution intent. Its
canonical target stores the three-part declaration identity:

```text
on <source> run <package-id>@<manifest-digest>#<export>
```

OCI-digest shorthand is not part of Binding v0. Any future shorthand must first
receive an authenticated set of eligible installed package identities, fail
closed when more than one eligible declaration matches, and persist only the
canonical three-part identity above.

It is immutable, versioned, replicated, and carries source-typed configuration,
context namespaces, budgets, capabilities, and elasticity policy. The closed
source vocabulary is `request`, `change`, `call`, `pushdown`, `time`, `once`,
and `boot`; each source has one fixed execution semantic. `call` and `pushdown`
Bindings are durable registrations, while individual statement calls and query
plans are transient invocations rather than Bindings.

Binding schema v0 is an exact object with `schema_version`, `name`, `target`,
`source`, `contexts`, `budgets`, and `elasticity`; unknown fields are invalid.
Its source is one of these closed variants, with one fixed compatible Artifact
interface:

| Source | Exact source fields | Artifact interface |
| --- | --- | --- |
| `request` | `kind`, `method` in `DELETE|GET|PATCH|POST|PUT`, exact static `path` | `request_v1` |
| `change` | `kind`, lexical unique `operations`, lexical unique `tables` | `change_v1` |
| `call` | `kind`, registration `name` | `call_v1` |
| `pushdown` | `kind`, registration `name` | `pushdown_v1` |
| `time` | `kind`, `interval_ms` in `1..86400000` | `time_v1` |
| `once` | `kind` | `once_v1` |
| `boot` | `kind` | `boot_v1` |

`contexts` is a lexical unique subset of the selected export's exact read/write
sets; change-source tables obey the same bound. Artifact capabilities are
derived and stored lexically by the owner, never accepted as caller authority.
Budgets are a closed set of safe-integer limits: CPU `1..60000` ms, wall time
`1..300000` ms and not below CPU, memory `1..1073741824` bytes, input/output
`0..16777216` bytes each, and context `0..67108864` bytes. Elasticity is an odd
fixed voter count `3..9` plus independently bounded learners
`0 <= min_learners <= max_learners <= 32`; Artifact replication fields do not
become Binding authority.

V0 is create-only. `DeploymentBindingOwner` derives one tenant-scoped logical
identity and immutable generation 1, stores a digest of the canonical Binding,
and permits only byte-identical replay. Replacement and removal will append
later generations; no mutable `active` flag, update, or delete path exists in
v0. Authenticated `CREATE BINDING $1` is the only v0 ingress. The
`service_bindings` table is internally CDC-propagated declaration state so a
later reconciler can wake from replicated changes, but v0 does not compile a
runtime service.

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
level-triggers each existing inactive request-derived row to `status = active`
and `replica_count = binding.elasticity.voters`, preserving its service
identity, pinned runtime descriptor, Binding lineage, and canonical projection.
The runtime-service owner then stops excluding that request lineage and drives
the existing placement path. The other six Binding sources remain inactive and
at zero replicas until their own activation Quests. This transition is
owner-controlled derived state; it does not add mutable Binding ingress.

Service state is context-as-table. The first placement cutover does not invent a
per-Cell store or claim local context materialization before a genuine runtime
is ready. Fixed voters are sequenced first: `elasticity.voters` alone determines
the initial runtime-service placement target. Persisted `min_learners` and
`max_learners` remain non-authoritative for placement until a later learner
capacity Quest uses the same replica substrate; adding learners must not change
the fixed odd voter set or consensus quorum.

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
| External artifact shape | `external-service-manifest.js` | Extend with versioned export declarations. |
| Artifact resolution | Installable OCI artifact resolver | Reuse unchanged. |
| Immutable bindable Artifact identity | `ServiceInstallCatalogOwner` / `service_packages` | Derive and verify `manifest_digest` from the exact immutable `normalized_manifest`; never select a declaration by OCI digest ordering. |
| Lifecycle ingress | Authenticated lifecycle SQL, consumed by the CLI | Extend with parameterized `CREATE BINDING $1`; no binding-specific side channel. |
| Immutable Binding declarations | `DeploymentBindingOwner` / `service_bindings` | Validate and persist one canonical tenant-scoped v0 generation; expose no generic mutation path. |
| Desired runtime service | `service_definitions` and its existing planning leader | Compile supported Bindings as lineage-bound inactive zero-replica desired rows; retire direct user declaration writes here, and leave activation to the Cell cutover. |
| Request Cell desired-state activation | `ServiceDefinitionsOwner` under the existing `service_definitions-p1` planning leader | Level-trigger only request-derived rows to active desired state with target count equal to fixed voters; preserve immutable Binding lineage and keep other sources inactive. |
| Placement and replica lifecycle | `RuntimeServiceRebalancerOwner`, `UnifiedRebalancer`, shared replica owners, and `ServiceRuntimeLifecycle` | Admit request lineage through the existing `services` actual and runtime path; do not fork a Cell scheduler or call a placed-but-not-running actual a Cell. |
| Handler context | Replicated tables and existing KV/timer primitives | Reuse; local materialization and handoff must engage the existing owners after genuine runtime execution exists, without a second state store. |
| Request data-plane ingress | One node HTTP adapter plus canonical security-context validation | Authenticate into a server-derived context and normalize a request; do not select a target, trust client-supplied owner identity, or dispatch directly. |
| Request Binding route resolution | `RequestBindingRouteResolver` | Resolve one tenant-scoped immutable method/path declaration to its exact Binding version and a current ready actual; fail closed on ambiguity or stale state and do not repair owner state. |
| Request invocation delivery | `ServiceDispatcher`, `MessageRouter`, and the runtime invocation owner established by Cell readiness | Translate the resolved invocation into one canonical `Service_Message`, revalidate at the receiver, and require processed component-response evidence; do not add direct-local, endpoint-bypass, or acknowledged-only success paths. |

`code`, `module_manifests`, `service_definitions`, stored functions, CDC
subscriptions, and callback registrations are migration inputs, not new peers of
Artifact/Binding/Cell. Compatibility adapters may compile old ingress into the
single owners only when their removal is explicit and structurally guarded.

## Migration sequence

1. Make new artifact manifests analyzable: schema v2 exports carry canonical
   interface and table access declarations through the live install/catalog
   path while v1 compatibility remains unchanged.
2. Establish the bindable Artifact identity as installed `package_id` plus the
   digest of exact canonical `normalized_manifest`; make digest-only ambiguity,
   schema-v1 input, and durable corruption fail closed in the catalog owner.
3. Seal Binding schema v0 and its single validator/persistence owner. Require
   analyzable v2 artifacts for newly authored Bindings. Quest
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
   1. activate request-derived desired state at the fixed voter count and engage
      the existing runtime-service placement path;
   2. make a placed request actual genuinely ready through a real runtime engine
      and the existing lifecycle, with table-backed context;
   3. route request invocation to that ready Cell; and
   4. activate the remaining sources and elastic learners through the same
      owners, one executable concern at a time.

Each step must engage the new owner in the production path it claims. Merely
adding a table, validator, adapter, or feature flag is not completion.
Placement is evidence of the first Cell cutover slice, but it is not evidence of
a running Cell while `wasm_component` remains only a lifecycle scaffold.

## Permanent invariants

- OCI payload bytes and normalized manifest declarations have distinct immutable
  digests. A Binding pins `package_id` plus `manifest_digest`; in-flight work
  remains pinned to its starting version.
- Code is stateless. Durable state and synchronization live in declared tables.
- Binding is intent, Cell is actual, and neither is reconstructed from the other
  by readers.
- One validator owns each normalized boundary. DDL, CLI, and compatibility
  syntax compile to that owner rather than re-validating locally.
- Read/write sets are exact declarations suitable for dependency analysis; a
  wildcard or omitted set is never treated as safe.
- Reconciliation wakes from canonical replicated change notification and is
  level-triggered, idempotent, and eventually stable.
- Scaling capacity does not silently change consensus quorum.
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
step 6: the request-only transition to active fixed-voter desired state and
engagement of the existing `RuntimeServiceRebalancerOwner` /
`UnifiedRebalancer` placement path.

Quest `minimal-deployment-request-cell-runtime-readiness` owns the second slice:
genuine component execution through the existing runtime registry, driver, and
lifecycle owners, including declared table-backed context and the transition
from placed actual to ready/running Cell. It does not own external HTTP request
routing.

Quest `minimal-deployment-request-cell-routing` is serialized after runtime
readiness and owns the third slice: one canonical HTTP request ingress resolves
an immutable request Binding through `RequestBindingRouteResolver` to a ready
actual and delivers the canonical `Service_Message` through
`ServiceDispatcher` and `MessageRouter` to the runtime invocation owner.
Neither Quest activates the remaining six sources or elastic learners.
