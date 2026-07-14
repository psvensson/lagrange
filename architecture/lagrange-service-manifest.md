# Lagrange Service Manifest

This document defines the **service package manifest** format for
installable replicated services in Lagrange.

The manifest is the contract between:

-   the artifact registry
-   the cluster service catalog
-   the runtime host
-   the kernel capability model

The manifest must be **declarative**, versioned, and stable enough to
support:

-   install
-   upgrade
-   rollback
-   validation
-   compatibility checks
-   auditing

------------------------------------------------------------------------

# AGPL Scope Boundary

This document defines the manifest substrate for installable services. Example
services such as `backup-manager` and example edition metadata such as `pro`
show how external services may consume the substrate; they do not authorize
AGPL implementation of backup/PITR, commercial licensing, entitlement checks,
RBAC, tenancy, KMS, or secret-provider behavior.

------------------------------------------------------------------------

# Goals

The manifest should let the kernel answer these questions before
installation:

-   What is this service?
-   Which runtime executes it?
-   Which artifact should be fetched?
-   Which capabilities does it require?
-   How many replicas should run?
-   How should it be upgraded?
-   Which kernel API versions does it support?
-   Which configuration fields are valid?
-   Does it depend on other services?

------------------------------------------------------------------------

# Design Principles

1.  **Declarative over imperative**\
    The manifest describes desired behavior rather than startup scripts.

2.  **Stable identity**\
    A service must have a canonical name and version.

3.  **Capability-gated**\
    Privileged operations must be requested explicitly.

4.  **Runtime-neutral**\
    The same schema supports `wasm_component` and `oci_container`
    for user-installable services. `native_js` is kernel-internal
    only and not exposed through the registry.

5.  **OCI-first packaging**\
    All installable service artifacts are packaged as OCI artifacts.
    The `artifact.media_type` field distinguishes payload kind (WASM
    binary vs container image). Runtime kind determines execution
    strategy, not packaging format.

6.  **Cluster-safe**\
    The kernel must be able to reject manifests that are incompatible,
    unsafe, or under-specified.

------------------------------------------------------------------------

# Canonical Fields

## Identity

-   `schema_version` --- currently `1`
-   `name`
-   `version`
-   `display_name`
-   `publisher`
-   `description`

Example:

``` json
{
  "schema_version": 1,
  "name": "backup-manager",
  "version": "1.2.0",
  "display_name": "Backup Manager",
  "publisher": "Lagrange Systems",
  "description": "Cluster backup and restore orchestration"
}
```

------------------------------------------------------------------------

## Artifact

Defines where the executable payload is located.

All installable service artifacts use OCI as the packaging and
distribution format. The `media_type` field tells the kernel what
the OCI artifact contains so it can route to the correct activation
path.

Fields:

-   `type` --- always `oci` for installable services
-   `ref` --- OCI registry reference
-   `digest` --- immutable artifact digest (required for remote refs)
-   `media_type` --- payload kind inside the OCI artifact:
    -   `application/vnd.oci.image.manifest.v1+json` — container image
        (activated via container runtime)
    -   `application/wasm` — WASM component binary (extracted and
        loaded in-process)
-   `size_bytes`
-   `signature` --- optional signature metadata

Example (WASM component packaged as OCI):

``` json
{
  "artifact": {
    "type": "oci",
    "ref": "registry.lagrange.dev/services/backup-manager:1.2.0",
    "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "media_type": "application/wasm",
    "size_bytes": 2487311
  }
}
```

Example (container image):

``` json
{
  "artifact": {
    "type": "oci",
    "ref": "registry.lagrange.dev/services/analytics-worker:3.0.0",
    "digest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "media_type": "application/vnd.oci.image.manifest.v1+json",
    "size_bytes": 89200000
  }
}
```

------------------------------------------------------------------------

## Runtime

Defines how the artifact is executed. Runtime kind is an execution
strategy, not a packaging choice — all artifacts are OCI-packaged.

Fields:

-   `kind` --- `wasm_component` or `oci_container` for installable
    services. `native_js` is kernel-internal only and not accepted
    from external manifests.
-   `entrypoint`
-   `runtime_options`

Example (WASM component):

``` json
{
  "runtime": {
    "kind": "wasm_component",
    "entrypoint": "backup-manager.wasm"
  }
}
```

Example (OCI container):

``` json
{
  "runtime": {
    "kind": "oci_container",
    "runtime_options": {
      "memoryLimitMb": 512,
      "cpuLimit": 1.0
    }
  }
}
```

------------------------------------------------------------------------

## Replication

Defines how the service runs in the cluster.

Fields:

-   `mode` --- `replicated_service`, `singleton`, `sharded`, future
    modes
-   `replicas`
-   `placement`
-   `failover_policy`

Example:

``` json
{
  "replication": {
    "mode": "replicated_service",
    "replicas": 3,
    "placement": {
      "regions": ["eu-north-1"],
      "avoid_same_host": true
    }
  }
}
```

------------------------------------------------------------------------

## Capabilities

Capabilities requested by the service.

Examples:

-   `cdc.subscribe`
-   `snapshot.read`
-   `topology.read`
-   `admin.surface`
-   `policy.provider`
-   `events.emit`
-   `state.kv`
-   `secret.read`

Example:

``` json
{
  "capabilities": [
    "cdc.subscribe",
    "snapshot.read",
    "admin.surface",
    "state.kv"
  ]
}
```

The kernel must deny installation or activation if required capabilities
are not allowed by cluster policy or edition.

------------------------------------------------------------------------

## Compatibility

Defines required versions and platform expectations.

Fields:

-   `kernel_api`
-   `cluster_min_version`
-   `cluster_max_version`
-   `requires_features`
-   `edition`

Example:

``` json
{
  "compatibility": {
    "kernel_api": ">=0.1.0 <0.2.0",
    "cluster_min_version": "0.8.0",
    "edition": "pro"
  }
}
```

------------------------------------------------------------------------

## Configuration Schema

Defines the user-provided configuration contract.

Recommended fields:

-   `schema_version`
-   `format`
-   `schema`

Example:

``` json
{
  "config_schema": {
    "schema_version": 1,
    "format": "json-schema",
    "schema": {
      "type": "object",
      "properties": {
        "bucket": { "type": "string" },
        "retention_days": { "type": "integer", "minimum": 1 }
      },
      "required": ["bucket"]
    }
  }
}
```

------------------------------------------------------------------------

## Upgrade Strategy

Defines safe rollout semantics.

Fields:

-   `strategy` --- `rolling`, `canary`, `all_at_once`
-   `max_unavailable`
-   `requires_drain`
-   `requires_data_migration`

Example:

``` json
{
  "upgrade": {
    "strategy": "rolling",
    "max_unavailable": 1,
    "requires_drain": true
  }
}
```

------------------------------------------------------------------------

## Health and Probes

Defines service health criteria.

Fields:

-   `startup_probe`
-   `readiness_probe`
-   `liveness_probe`

This allows the rollout controller to decide whether activation or
upgrade was successful.

------------------------------------------------------------------------

## Dependencies

Lists other services or kernel features required.

Example:

``` json
{
  "dependencies": [
    {
      "type": "service",
      "name": "audit-service",
      "version": ">=1.0.0 <2.0.0"
    }
  ]
}
```

------------------------------------------------------------------------

# Full Example Manifest

The example below uses a backup service to exercise the manifest shape. It is a
commercial consumer example only under the current edition matrix.

``` json
{
  "schema_version": 1,
  "name": "backup-manager",
  "version": "1.2.0",
  "display_name": "Backup Manager",
  "publisher": "Lagrange Systems",
  "description": "Cluster backup and restore orchestration",
  "artifact": {
    "type": "oci",
    "ref": "registry.lagrange.dev/services/backup-manager:1.2.0",
    "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "media_type": "application/wasm",
    "size_bytes": 2487311
  },
  "runtime": {
    "kind": "wasm_component",
    "entrypoint": "backup-manager.wasm"
  },
  "replication": {
    "mode": "replicated_service",
    "replicas": 3,
    "placement": {
      "avoid_same_host": true
    }
  },
  "capabilities": [
    "cdc.subscribe",
    "snapshot.read",
    "admin.surface",
    "state.kv",
    "events.emit"
  ],
  "compatibility": {
    "kernel_api": ">=0.1.0 <0.2.0",
    "cluster_min_version": "0.8.0",
    "edition": "pro"
  },
  "config_schema": {
    "schema_version": 1,
    "format": "json-schema",
    "schema": {
      "type": "object",
      "properties": {
        "bucket": { "type": "string" },
        "retention_days": { "type": "integer", "minimum": 1 }
      },
      "required": ["bucket"]
    }
  },
  "upgrade": {
    "strategy": "rolling",
    "max_unavailable": 1,
    "requires_drain": true
  },
  "dependencies": [],
  "health": {
    "readiness_probe": {
      "type": "service_status",
      "timeout_ms": 5000
    }
  }
}
```

------------------------------------------------------------------------

# Validation Rules

The kernel should validate at least the following before activation:

-   required fields present
-   manifest `schema_version` is supported
-   version format valid
-   artifact type is `oci`
-   artifact reference valid
-   artifact digest present for remote references
-   artifact `media_type` recognized and consistent with `runtime.kind`
-   runtime kind is `wasm_component` or `oci_container` (reject
    `native_js` from external manifests)
-   capabilities recognized
-   compatibility range satisfied
-   configuration schema parseable
-   upgrade strategy valid
-   dependency graph satisfiable

------------------------------------------------------------------------

# Install-Time Resolution

At install time the cluster resolves:

1.  manifest validity
2.  artifact authenticity
3.  capability permissions
4.  dependency satisfaction
5.  compatibility with current cluster version
6.  config validity

Only then may desired state move to `installed` or `active`.

------------------------------------------------------------------------

# Relationship to System Tables

The manifest is stored in normalized form across service system tables,
not just as an opaque blob.

Typical mapping:

-   manifest identity and verified artifact refs → `service_packages`
-   immutable configuration revisions → `service_revisions`
-   desired install and rollout state → `service_installations`
-   typed install failures → `service_install_failures`
-   runtime deployment intent → existing `service_definitions`
-   runtime instances and endpoints → existing `services` and
    `service_endpoints`

The catalog stores the normalized manifest for audit/debugging. Its only durable
runtime link is `service_definition_id`; node, replica, address, health,
endpoint, process, and running state stay with the existing actual-state owners.
An installation is initially `recorded_not_running`, including when its desired
state is `active`. Only the downstream reconciler may move rollout state after
consulting and mutating the canonical runtime owners.

------------------------------------------------------------------------

# Stability Policy

The manifest schema should evolve using explicit schema versions.

Rules:

-   additive changes are preferred
-   breaking changes require a new manifest schema version
-   unknown optional fields may be ignored
-   unknown required fields must fail validation

------------------------------------------------------------------------

# Expected Outcome

A stable manifest format gives Lagrange:

-   registry interoperability
-   clean service install UX
-   safe upgrades
-   auditable commercial service delivery
-   a credible third-party ecosystem
