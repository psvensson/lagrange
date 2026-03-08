# Lagrange Service Registry and Installation Model

This document defines how services are **published, discovered,
installed, upgraded, and removed** in Lagrange.

The key design principle is:

> Services are distributed from registries, but installed state is owned
> by the cluster.

This means:

-   a registry answers **what artifacts exist**
-   the cluster catalog answers **what this cluster wants installed**
-   the reconciler answers **how desired state becomes running state**

------------------------------------------------------------------------

# Goals

The installation model must support:

-   public community services
-   private commercial services
-   customer-private registries
-   local development workflows
-   upgrades and rollbacks
-   air-gapped deployments
-   deterministic recovery after node failure

------------------------------------------------------------------------

# Core Concepts

## 1. Artifact Registry

A registry stores service artifacts and associated manifests.

Recommended primary transport:

-   OCI registry

Reasons:

-   existing distribution ecosystem
-   tags and digests
-   authentication
-   mirroring
-   enterprise familiarity
-   compatibility with OCI containers and WASM-oriented artifacts

Example references:

``` text
registry.lagrange.dev/services/backup-manager:1.2.0
registry.example.com/acme/custom-audit:2.4.1
```

------------------------------------------------------------------------

## 2. Cluster Service Catalog

The registry is not the source of truth for installation state.

The cluster stores desired and actual service state in replicated system
tables.

The catalog tracks:

-   configured registries
-   known packages
-   desired installations
-   resolved revisions
-   running instances
-   failures and rollout state

This ensures the cluster can recover deterministically even if the
upstream registry is temporarily unavailable.

------------------------------------------------------------------------

## 3. Reconciler

A service installation reconciler watches desired state and performs
actions:

-   fetch artifact
-   verify digest/signature
-   validate compatibility
-   allocate runtime placement
-   start instances
-   stop instances
-   roll forward
-   roll back

This follows the same pattern as other Lagrange control-plane workflows.

------------------------------------------------------------------------

# Installation Sources

Lagrange should support multiple artifact sources under one install
model.

## Remote OCI registry

Primary production path.

## Local artifact path

Development path.

Example:

``` bash
lagrange service dev-install ./dist/backup-manager
```

## Local mirror / air-gapped registry

Enterprise path.

Example:

``` bash
lagrange registry add registry.internal.example.com
```

The user experience should remain uniform regardless of source.

------------------------------------------------------------------------

# Recommended CLI

``` bash
lagrange registry add registry.lagrange.dev
lagrange registry list
lagrange service search backup
lagrange service install lagrange/backup-manager@1.2.0
lagrange service upgrade lagrange/backup-manager@1.3.0
lagrange service remove lagrange/backup-manager
lagrange service list
lagrange service status backup-manager
```

------------------------------------------------------------------------

# Recommended SQL / Admin Surface

``` sql
INSTALL SERVICE 'lagrange/backup-manager' VERSION '1.2.0';
UPGRADE SERVICE 'lagrange/backup-manager' VERSION '1.3.0';
REMOVE SERVICE 'lagrange/backup-manager';
SHOW SERVICES;
SHOW SERVICE REVISIONS;
SHOW SERVICE INSTANCES;
```

The exact SQL syntax can evolve, but the model should expose service
lifecycle as a first-class cluster operation.

------------------------------------------------------------------------

# Installation Lifecycle

## 1. Discover

The user selects a package and version from one or more registries.

## 2. Resolve

The cluster resolves:

-   canonical package identity
-   version/tag
-   artifact digest
-   manifest
-   dependencies

## 3. Validate

The cluster validates:

-   manifest schema
-   kernel API compatibility
-   edition/license constraints
-   capability permissions
-   configuration schema
-   dependency satisfaction

## 4. Record desired state

The cluster writes desired install state into system tables.

At this point the operation is durable and recoverable.

## 5. Reconcile

The reconciler fetches and activates the service.

## 6. Observe

The cluster records health, rollout progress, and failures.

------------------------------------------------------------------------

# Remove Lifecycle

Removal should also be declarative.

1.  desired state becomes `absent`
2.  reconciler drains/stops instances
3.  service-owned runtime processes terminate
4.  retained data is either preserved or removed per policy
5.  catalog marks installation removed

This allows safe uninstall without ad hoc host cleanup.

------------------------------------------------------------------------

# Upgrade Lifecycle

Upgrade should be versioned and rollback-capable.

1.  user sets desired target version
2.  cluster validates compatibility
3.  reconciler starts rollout according to manifest strategy
4.  health checks monitor activation
5.  success marks new revision active
6.  failure triggers rollback or pause

Supported strategies should include:

-   rolling
-   canary
-   all-at-once

------------------------------------------------------------------------

# Rollback Model

The cluster should preserve service revision history.

A rollback is conceptually just:

-   change desired active revision
-   reconcile to prior known-good artifact/config pair

This is far safer than reinstalling manually from memory.

------------------------------------------------------------------------

# Registry Configuration

A cluster should support multiple registries.

Registry metadata includes:

-   name
-   URL / endpoint
-   auth reference
-   trust policy
-   priority / search order
-   mirror-of relationship

This allows:

-   official public registry
-   official commercial registry
-   customer-private registry
-   local mirror

------------------------------------------------------------------------

# Trust and Verification

Before activation the cluster should verify, where applicable:

-   artifact digest
-   manifest digest
-   signature
-   publisher identity
-   allowed capability set

A trust policy can determine whether unsigned or untrusted packages are
allowed.

This is especially important once third-party services exist.

------------------------------------------------------------------------

# Licensing Hooks

The installation platform itself belongs in the open-source kernel.

However, services may still declare edition requirements such as:

-   `community`
-   `pro`
-   `enterprise`

The cluster may then require a valid license token or entitlement before
activating certain packages.

This keeps the **mechanism open** while allowing **content and
entitlement** to remain commercial.

------------------------------------------------------------------------

# Failure Handling

The reconciler should record structured failure state, including:

-   artifact fetch failed
-   digest mismatch
-   manifest invalid
-   incompatible kernel API
-   capability denied
-   health check failed
-   rollout timed out

Failures should be durable and queryable, not just logged.

------------------------------------------------------------------------

# Development Workflow

Even with a registry-first model, local development must remain fast.

Recommended flow:

1.  build service locally
2.  publish to local registry or dev source
3.  install into dev cluster using the normal install path
4.  inspect instances and logs
5.  repeat

This preserves one conceptual model for both development and production.

------------------------------------------------------------------------

# Suggested System Table Families

The service platform likely needs a small number of core tables:

-   `sys_service_repositories`
-   `sys_service_packages`
-   `sys_service_installations`
-   `sys_service_revisions`
-   `sys_service_instances`
-   `sys_service_failures`

Optional later additions:

-   `sys_service_dependencies`
-   `sys_service_entitlements`
-   `sys_service_secrets_refs`

------------------------------------------------------------------------

# Open vs Commercial Boundary

Open-source kernel provides:

-   registry support
-   install/remove/upgrade machinery
-   system catalog
-   reconciliation
-   capability enforcement

Commercial layers provide:

-   commercial service artifacts
-   commercial registries
-   commercial entitlements
-   premium service implementations

This is the clean platform boundary.

------------------------------------------------------------------------

# Expected Outcome

A registry-first installation model gives Lagrange:

-   cleaner architecture than file-based loading
-   easier install/remove UX
-   stronger cluster consistency
-   better upgrade safety
-   better commercial packaging
-   a plausible future service ecosystem
