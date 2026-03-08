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
    The same schema should support `native_js`, `wasm_component`, and
    `oci_container`.

5.  **Cluster-safe**\
    The kernel must be able to reject manifests that are incompatible,
    unsafe, or under-specified.

------------------------------------------------------------------------

# Canonical Fields

## Identity

-   `name`
-   `version`
-   `display_name`
-   `publisher`
-   `description`

Example:

``` json
{
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

Fields:

-   `type` --- `oci`, `wasm`, `bundle`, or future formats
-   `ref` --- registry reference or local source reference
-   `digest` --- immutable artifact digest
-   `size_bytes`
-   `signature` --- optional signature metadata

Example:

``` json
{
  "artifact": {
    "type": "oci",
    "ref": "registry.lagrange.dev/services/backup-manager:1.2.0",
    "digest": "sha256:abc123",
    "size_bytes": 2487311
  }
}
```

------------------------------------------------------------------------

## Runtime

Defines how the artifact is executed.

Fields:

-   `kind` --- `native_js`, `wasm_component`, `oci_container`
-   `entrypoint`
-   `runtime_options`

Example:

``` json
{
  "runtime": {
    "kind": "native_js",
    "entrypoint": "./index.js"
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

``` json
{
  "name": "backup-manager",
  "version": "1.2.0",
  "display_name": "Backup Manager",
  "publisher": "Lagrange Systems",
  "description": "Cluster backup and restore orchestration",
  "artifact": {
    "type": "oci",
    "ref": "registry.lagrange.dev/services/backup-manager:1.2.0",
    "digest": "sha256:abc123",
    "size_bytes": 2487311
  },
  "runtime": {
    "kind": "native_js",
    "entrypoint": "./index.js"
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
-   version format valid
-   artifact reference valid
-   artifact digest present for remote references
-   runtime kind supported
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

-   manifest identity → `sys_service_packages`
-   artifact refs → `sys_service_packages`
-   desired install state → `sys_service_installations`
-   resolved revisions → `sys_service_revisions`
-   runtime instances → `sys_service_instances`

A raw manifest blob may still be preserved for audit/debugging.

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
