# Service Control Transport

## Decision

The external service lifecycle control transport is first-class lifecycle SQL
over authenticated PostgreSQL wire. The CLI is a client of that SQL surface; it
does not own mutation semantics and does not use the node-local admin WebSocket
as a production control plane.

This is an ingress decision, not a mutation-owner decision. Lifecycle statements
submit authenticated intent to the cluster service catalog and lifecycle owners.
Those owners decide and persist desired state; SQL, PG wire, and the CLI only
normalize, authorize, submit, and project owner outcomes.

## Security boundary

The supported external path has one ordered boundary:

1. the PG wire listener applies its declared TLS policy before credentials;
2. the PG wire credential verifier derives the principal and tenant context;
3. the SQL ingress classifies lifecycle statements before execution;
4. lifecycle reads and mutations require distinct, action-specific authorization
   rather than the generic `pgwire.execute_query` permission alone;
5. the canonical request carries the server-derived security context to the
   lifecycle command owner; and
6. the command owner returns a typed durable operation or failure outcome.

External lifecycle control may not use PG wire trust mode. Trust mode remains a
loopback-only database-development policy. A client-supplied tenant, principal,
role, service identity, or owner outcome is never authoritative.

The initial executable grammar is deliberately parameterized and closed:

```sql
INSTALL SERVICE $1;
UPGRADE SERVICE $1;
REMOVE SERVICE $1;
SHOW SERVICE $1;
SHOW SERVICES;
```

The first four forms accept exactly one JSON object bind parameter. Install and
upgrade require `manifest`, `artifact_source`, and `idempotency_key`, with
optional `config`; remove requires `service_name` and `idempotency_key`; the
single-service read requires `service_name`. Tenant, principal, roles,
signature policy, durable identifiers, and owner outcomes are never payload
fields. This narrow envelope keeps JSON and configuration out of SQL text while
allowing the SQL ingress to classify the action before parsing the payload.

## Owner route

```text
CLI or PostgreSQL client
  -> PG wire TLS and credential owners
  -> action-specific lifecycle authorization
  -> canonical SQL request / lifecycle command normalization
  -> cluster service catalog owner
  -> installation reconciler and existing runtime lifecycle owner
  -> typed operation/status projection
```

The route preserves these boundaries:

| Concern | Owner |
| --- | --- |
| Connection authentication and TLS | PG wire authentication and TLS owners |
| Lifecycle statement grammar and command normalization | SQL ingress owner |
| Package/revision/install/rollout intent | Cluster service catalog owner |
| Convergence from desired to actual | Installation reconciler |
| Running instances and endpoints | Existing service lifecycle, `services`, and `service_endpoints` owners |
| User experience | CLI as a stateless SQL client |

Retries use the caller's opaque idempotency key only as input to an
owner-derived operation identity bound to action, tenant, and principal. The
CLI must not infer success from a disconnected session, and the SQL layer must
not mutate catalog tables directly to bypass the command owner. Artifact
signature policy is server-configured and explicit; a command payload cannot
weaken it.

## Reused, extended, and new

- **REUSED:** the production PG wire listener, TLS policy, credential verifier,
  session authorization hook, canonical SQL request ingress, SQL execution
  owner, and existing service/meta-service lifecycle owners.
- **EXTENDED:** PG wire/SQL authorization gains lifecycle-specific actions; the
  canonical request carries server-derived security context; SQL gains the
  lifecycle statement family and typed operation projection.
- **NEW:** no network transport, authentication protocol, or CLI mutation path.
  The desired-state catalog and reconciler are new downstream semantic owners
  already assigned to separate Phase 1 Quests.

## Rejected alternative

An authenticated private admin RPC is rejected for the Phase 1 production
surface. The existing admin WebSocket is documented and wired as a node-local
compatibility and diagnostics adapter; externally binding it currently requires
an explicit insecure-bind opt-in. Promoting it would add a second external
protocol, duplicate PG wire authentication/TLS work, make cluster-global intent
look node-addressed, and encourage the CLI to depend on a compatibility adapter.

The admin adapter may continue to serve bounded loopback diagnostics and legacy
compatibility. It must not become a fallback when lifecycle SQL is unavailable.

## Downstream proof obligations

- `service-lifecycle-sql-control-surface` proves unauthenticated, generically
  authorized, and client-spoofed lifecycle commands fail closed, while an
  authenticated action-authorized command reaches the catalog owner.
- `service-install-catalog-owner` proves SQL does not become a desired-state or
  actual-state owner.
- `service-install-lifecycle-cli` proves install, list, status, and remove use
  this SQL path and contain no admin-WebSocket or direct-table mutation fallback.
- Live Phase 1 acceptance must inspect the authenticated session, action verdict,
  stable operation identity, catalog row, and canonical actual-state projection.

## Non-goals

The Phase 1 control surface now implements lifecycle SQL ingress, action
authorization, server-context propagation, and command composition over the
manifest, artifact, and desired-state catalog owners. It still does not own
reconciliation, runtime activation, or CLI commands; those remain separate
owner-boundary Quests. This decision does not select an OCI runtime provider
and does not introduce enterprise RBAC or tenancy.
