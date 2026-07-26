# Lagrange Kernel Platform API v0 Design

This document defines the **minimal kernel platform APIs** required to
support installable replicated services in Lagrange.

The goal is to keep the **kernel surface area small and stable** while
allowing a rich ecosystem of services (both open-source and commercial)
to run on top of the platform.

Design principle:

> Small kernel API, large service freedom.

Services should rely only on **stable platform APIs**, never on internal
implementation details such as planner internals, storage layout, or
Raft structures.

------------------------------------------------------------------------

# Architecture Overview

Lagrange is structured into three layers.

    Kernel (AGPL)
        ├─ storage / raft / partitions
        ├─ SQL engine
        ├─ CDC pipeline
        ├─ service runtime host
        └─ platform APIs

    Installable Services
        ├─ observability-pack
        ├─ backup-manager
        ├─ audit-service
        ├─ schema-migrator
        ├─ vector-service
        └─ tenant-manager

    Service Registries
        ├─ public community registry
        ├─ enterprise registry
        └─ private customer registries

The **kernel owns invariants**, while services implement higher-level
capabilities such as backup orchestration, observability, or policy
logic.

------------------------------------------------------------------------

# AGPL Scope Boundary

This document defines the AGPL-owned service-platform substrate, not the
implementation plan for every example service named here.

Examples such as `backup-manager`, `tenant-manager`, RBAC, tenant isolation,
KMS, secrets, PITR, and commercial entitlement flows are external consumer
examples unless the roadmap and edition matrix explicitly map the work to the
AGPL repo.

For this repository:

-   in scope: manifest registration, lifecycle hooks, service-owned replicated
    state, CDC subscriptions, admin-surface registration, capability checks,
    topology/snapshot/event substrate when backed by
    `docs/steering/agpl-feature-map.md`
-   out of scope: backup/PITR behavior, tenant isolation, RBAC policy,
    commercial license activation, entitlement checks, KMS integration, and
    secret-provider implementations
-   extension-point only: policy-provider and secrets/external-reference
    shapes may be documented as future integration seams, but must not become
    AGPL implementation tasks without an edition-matrix change

------------------------------------------------------------------------

# Artifact Packaging Model

All installable services are packaged and distributed as **OCI
artifacts**, regardless of runtime kind. OCI is the universal packaging
and distribution format — it provides registries, tags, digests,
signatures, mirroring, and authentication.

The **runtime kind** declared in the manifest determines how the kernel
executes the artifact, not how it is packaged:

-   `wasm_component` — the OCI artifact contains a WASM binary
    (media type `application/wasm`). The kernel extracts the binary
    and loads it in-process for data-local execution with
    sub-millisecond cold start and full debugging support.
-   `oci_container` — the OCI artifact is a standard container image.
    The kernel hands it to a container runtime for process-isolated
    execution.
-   `native_js` — kernel-internal only. Used for built-in system
    services (SQL engine, admin handlers). Not user-installable via
    the service registry.

This separation means:

-   One packaging format for all services (OCI).
-   One registry, one fetch path, one trust/verification pipeline.
-   Runtime kind is an execution strategy choice, not a packaging
    choice.
-   The reconciler's artifact fetch is runtime-kind-agnostic; only
    the final activation step branches by `runtime.kind`.

------------------------------------------------------------------------

# The 12 Core Kernel APIs

## 1. Service Manifest Registration

Defines how services declare their identity and runtime requirements.

The manifest includes:

-   name
-   version
-   runtime kind
-   entrypoint
-   configuration schema
-   required capabilities
-   compatibility constraints

The manifest carries no replica or replication declaration: Cell capacity and
placement are system-policy output, never a caller request. The authoritative
manifest contract is
[`lagrange-service-manifest.md`](../../../architecture/lagrange-service-manifest.md), and the
deployment declaration surface (Artifact / Binding / Cell, `INSTALL SERVICE`,
`CREATE BINDING`, `CONFIGURE SERVICE ACCESS`) is owned by
[`minimal-deployment-surface.md`](../../../architecture/minimal-deployment-surface.md).

Example:

``` json
{
  "name": "backup-manager",
  "version": "1.2.0",
  "artifact": {
    "type": "oci",
    "ref": "registry.lagrange.dev/services/backup-manager:1.2.0",
    "digest": "sha256:abc123",
    "media_type": "application/wasm"
  },
  "runtime": {
    "kind": "wasm_component",
    "entrypoint": "backup-manager.wasm"
  },
  "capabilities": [
    "cdc.subscribe",
    "snapshot.read",
    "admin.surface"
  ]
}
```

Installation is declarative through the landed SQL surface: `INSTALL SERVICE`
takes the manifest and artifact source as its single JSON bind parameter (see
`minimal-deployment-surface.md` for the exact payload).

------------------------------------------------------------------------

## 2. Service Lifecycle API

Services receive lifecycle callbacks:

    onInstall()
    onStart()
    onStop()
    onUpgrade(fromVersion, toVersion)
    onUninstall()

These hooks allow services to initialize state, drain workloads, and
migrate data safely.

------------------------------------------------------------------------

## 3. Replicated Service State API

Services require durable replicated storage.

Example interface:

    ctx.state.get(key)
    ctx.state.put(key, value)
    ctx.state.delete(key)
    ctx.state.scan(prefix)

Backed by a service-owned replicated KV space.

Used by:

-   backup checkpoints
-   migration progress
-   observability cursors
-   audit offsets

------------------------------------------------------------------------

## 4. CDC Subscription API

Services can subscribe to data change streams.

Example:

    ctx.cdc.subscribe({
        table: "orders",
        from: "cursor"
    })

Used by:

-   incremental backup
-   audit services
-   cache invalidation
-   streaming analytics

------------------------------------------------------------------------

## 5. Consistent Snapshot API

Allows services to obtain cluster-consistent snapshots.

Example:

    const barrier = await ctx.snapshot.acquireBarrier()
    const rows = await ctx.snapshot.scanTable("orders", { barrier })

Required for:

-   backups
-   verification jobs
-   analytics scans
-   migration backfills

------------------------------------------------------------------------

## 6. Topology API

Provides cluster topology information.

Example:

    ctx.topology.listNodes()
    ctx.topology.listPartitions()
    ctx.topology.getLeaders()

Used by:

-   observability services
-   placement policies
-   load analysis
-   rebalancing advisors

------------------------------------------------------------------------

## 7. Admin Surface Registration

Services may expose SQL, CLI, or HTTP control interfaces.

Example:

    ctx.admin.registerCommand("SHOW BACKUPS", handler)
    ctx.admin.registerHttpRoute("/admin/backups", handler)

Allows services to integrate with operator tooling without modifying the
kernel.

------------------------------------------------------------------------

## 8. Capability Enforcement

Services request capabilities in their manifest.

Examples:

-   `cdc.subscribe`
-   `snapshot.read`
-   `admin.surface`
-   `topology.read`

Kernel enforces capability access:

    ctx.capabilities.require("snapshot.read")

This ensures kernel capability isolation. Edition and entitlement control live
outside the AGPL implementation unless explicitly reclassified in
`edition-matrix.md`.

------------------------------------------------------------------------

## 9. Policy Provider API (External Extension Point)

Some services define policies that the kernel enforces.

Examples:

-   RBAC
-   tenant isolation
-   quotas
-   placement rules

Example:

    registerPolicyProvider("authz", provider)

The kernel queries policy providers when enforcing actions.

This is an external extension point in this repository. RBAC, tenant isolation,
and enterprise policy-provider implementations are not AGPL implementation
tasks.

------------------------------------------------------------------------

## 10. Event Emission API

Kernel and services emit structured events.

Example:

    ctx.events.emit("backup.started", {...})
    ctx.events.emit("service.installed", {...})

Used by:

-   observability
-   audit logging
-   debugging
-   usage tracking

------------------------------------------------------------------------

## 11. Upgrade / Rollout API

Defines safe service upgrade strategies.

Example strategies:

-   rolling
-   canary
-   all-at-once

Example:

    ctx.rollout.begin({
        strategy: "rolling",
        maxUnavailable: 1
    })

This prevents unsafe cluster-wide upgrades.

------------------------------------------------------------------------

## 12. Secrets and External References (External Extension Point)

Services may reference external credentials or systems.

Example:

    ctx.secrets.get("s3-backup-prod")
    ctx.external.getConnection("kms-main")

Secrets are resolved by the cluster rather than embedded directly in
service configuration.

This is an external extension point in this repository. Secret-provider, KMS,
and credential-management implementations are not AGPL implementation tasks.

------------------------------------------------------------------------

# Implementation Phases

## Phase A (initial platform)

Implement:

1.  service manifests
2.  lifecycle hooks
3.  replicated state
4.  CDC subscriptions
5.  admin registration
6.  capability enforcement

This enables early services such as:

-   observability-pack
-   audit-service
-   external backup-manager prototype as a consumer example only

------------------------------------------------------------------------

## Phase B (production services)

Add:

7.  consistent snapshot API
8.  topology API
9.  event emission
10. upgrade orchestration

Enables:

-   PITR
-   migration services
-   cluster analytics

------------------------------------------------------------------------

## Phase C (external/commercial platform extensions)

Add:

11. policy provider API
12. secrets / external reference API

Enables:

-   RBAC
-   tenant isolation
-   KMS integration
-   compliance tooling

Phase C is not AGPL implementation scope under the current edition matrix.

------------------------------------------------------------------------

# Stability Rules

Services **must never depend on**:

-   internal Raft state
-   planner internals
-   storage engine structures
-   partition ownership mechanics

Only the defined platform APIs are stable.

This ensures the kernel can evolve without breaking services.

------------------------------------------------------------------------

# Expected Outcomes

With these APIs in place Lagrange becomes:

    distributed database
    + distributed compute runtime
    + distributed service platform

This allows:

-   installable replicated services
-   commercial service packs
-   third‑party ecosystem development
-   cleaner open‑core separation
