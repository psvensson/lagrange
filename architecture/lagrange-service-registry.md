# Service Installation Catalog

This document describes the current external service artifact and installation
owners. The cluster can validate and record installable artifacts, expose
catalog state through authenticated lifecycle SQL and the CLI, and feed
installed WASM artifacts into the separate Artifact / Binding / Cell
deployment surface. A catalog installation is not evidence that a runtime
instance is running.

## External Ingress

The supported external control route is:

```text
CLI or PostgreSQL client
  -> authenticated PostgreSQL wire
  -> action-specific lifecycle authorization
  -> lifecycle SQL command owner
  -> artifact resolver and install catalog owner
  -> typed operation and catalog projection
```

The lifecycle grammar is:

```sql
INSTALL SERVICE $1;
UPGRADE SERVICE $1;
REMOVE SERVICE $1;
SHOW SERVICE $1;
SHOW SERVICES;
CONFIGURE SERVICE ACCESS $1;
CREATE BINDING $1;
```

Mutation payloads carry the caller's requested artifact, configuration, and
idempotency input. Tenant, principal, roles, signature policy, durable owner
identity, and owner outcomes come from the server and are not accepted as
payload authority. The node-local admin WebSocket is a compatibility and
diagnostics adapter, not a fallback lifecycle transport.

## Artifact Acquisition

[`InstallableServiceArtifactResolver`](../src/service/installable-service-artifact-resolver.js)
is the single verification owner for remote OCI descriptors and local OCI image
layouts. Both sources converge on the same checks:

1. validate the external manifest;
2. bound and parse the selected OCI descriptor;
3. recompute the pinned SHA-256 digest and descriptor size;
4. verify image-manifest media shape;
5. require container media or exactly one `application/wasm` layer according
   to the manifest runtime; and
6. apply the explicit signature policy.

Signature policy has exactly three modes: `required`,
`verify_if_present`, and `disabled`. Detached Ed25519 signatures cover the
domain-separated artifact digest. The resolver returns verified normalized
metadata; it does not persist desired state or activate a runtime.

Local layouts are produced by
[`ServiceLocalOciLayoutBuilder`](../src/service/service-local-oci-layout-builder.js).
It emits and validates a content-addressed OCI directory graph. The builder
does not compile WASM, write catalog rows, or activate a runtime.

## Catalog Ownership

[`ServiceInstallCatalogOwner`](../src/control-plane/owners/service-install-catalog-owner.js)
owns four replicated system tables through the control-plane table gateway:

| Table | Current authority |
| --- | --- |
| `service_packages` | Immutable normalized manifest and verified OCI artifact identity |
| `service_revisions` | Immutable package/configuration revisions |
| `service_installations` | Desired install state, rollout state, stable operation identity, and optional `service_definition_id` correlation |
| `service_install_failures` | Immutable typed failure facts |

The catalog accepts no running-instance, endpoint, node, process, or health
fields. Those remain owned by `service_definitions`, `services`, and
`service_endpoints`. Package, revision, installation, operation, and failure
identities are idempotent and immutable; conflicting replay returns a typed
identity error. Rollout updates use compare-and-swap fencing so stale writers
cannot overwrite a newer state.

One OCI payload digest may back more than one installed declaration. Binding
therefore identifies an Artifact by installed `package_id` plus the SHA-256 of
its exact normalized manifest, never by globally selecting a package from OCI
digest order.

## Installation Reconciliation

[`ServiceInstallationReconciler`](../src/service/service-installation-reconciler.js)
is leader-scoped, periodic, generation-fenced, and single-flight per
installation. Its current activation behavior is deliberately bounded:

- supported external runtime kinds are recognized;
- unsupported direct activation is recorded as the typed non-retryable
  `activation_unsupported` failure;
- the durable rollout state settles at `recorded_not_running`; and
- never-activated installations can transition idempotently through
  `removing` to `removed`.

It does not currently fetch and start a real OCI container, publish endpoints,
or report a catalog installation as a running actual. Genuine WASI component
execution is reached through `CREATE BINDING` and the Artifact / Binding / Cell
path documented in
[`minimal-deployment-surface.md`](minimal-deployment-surface.md).

## Runtime Support

The machine-readable implementation claim is
[`docs/service-portability-capabilities.json`](../docs/service-portability-capabilities.json).
At present:

- `wasm_component` supports external installation and genuine WASI Cell
  execution;
- `native_js` is kernel-internal; and
- `oci_container` supports descriptor validation and an in-memory lifecycle
  scaffold, but not real container activation.

Registry search, registry configuration, air-gapped mirror management,
entitlements, commercial package policy, and the external kernel API are not
current catalog surfaces. Their work belongs in the roadmap and
`solve/specs/`, not this architecture contract.
