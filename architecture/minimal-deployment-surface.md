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
plans are transient invocations rather than Bindings. Exact source schemas and
interface compatibility are deliberately deferred to the Binding Quest.

### Cell

A Cell is a derived running actual: a placed, disposable instance of a stateless
handler plus a local materialization of its table-backed context. Users never
declare cells. One reconciliation and replica substrate owns placement,
recovery, snapshot, handoff, and readiness for partitions and handlers while
preserving kind-specific data-plane fast paths.

Service state is context-as-table. A service is a request Binding plus
co-replicated context. Elastic learners may add handler/context capacity without
changing the fixed odd voter set. Partitions are built-in services at the cell
contract layer; bootstrap creates only the minimal axiomatic cells needed to
reach the binding reconciler fixed point.

## Existing owners to extend

| Concern | Existing authority | Contract action |
| --- | --- | --- |
| External artifact shape | `external-service-manifest.js` | Extend with versioned export declarations. |
| Artifact resolution | Installable OCI artifact resolver | Reuse unchanged. |
| Immutable bindable Artifact identity | `ServiceInstallCatalogOwner` / `service_packages` | Derive and verify `manifest_digest` from the exact immutable `normalized_manifest`; never select a declaration by OCI digest ordering. |
| Lifecycle ingress | Authenticated lifecycle SQL, consumed by the CLI | Reuse unchanged; no binding-specific side channel. |
| Desired runtime service | `service_definitions` and its reconciler | Compile from Binding during the cutover, then retire declaration writes here. |
| Placement and replica lifecycle | `UnifiedRebalancer` and shared replica owners | Extend to derived Cells; do not fork a cell scheduler. |
| Handler context | Replicated tables and existing KV/timer primitives | Reuse; do not introduce a second state store. |

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
   analyzable v2 artifacts for newly authored Bindings.
4. Compile request Bindings into the existing desired-service lifecycle and
   make Binding the declaration authority; delete direct competing declaration
   writes in the same cutover.
5. Move `change`, `call`, `pushdown`, `time`, `once`, and `boot` ingress to the
   same Binding owner one source at a time, deleting superseded surfaces.
6. Name the derived Cell state and reconcile it through the existing placement
   and replica owners before consolidating partition/service lifecycle code.

Each step must engage the new owner in the production path it claims. Merely
adding a table, validator, adapter, or feature flag is not completion.

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
- No feature flag or parallel fallback path survives a landing session.

## First executable slice

Quest `minimal-deployment-artifact-export-contract` completed step 1. Quest
`minimal-deployment-artifact-binding-identity` advances step 2. Its real
observable is the authenticated SQL `INSTALL SERVICE` path plus catalog-owned
reads: the exact immutable `normalized_manifest` yields `manifest_digest`,
`package_id` plus that digest returns one v2 declaration, and OCI-digest
ambiguity, schema v1, or durable corruption fails closed. The Quest does not
create Bindings, runtime declarations, or Cells.
