# Service Control Transport

## Current Transport

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

The executable grammar is parameterized and closed:

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

## Current Boundary

The control surface implements lifecycle SQL ingress, action authorization,
server-context propagation, and command composition over the manifest,
artifact, Binding, access-policy, and desired-state catalog owners. It does not
own reconciliation or runtime activation. The CLI is a stateless client of this
surface.

The admin WebSocket remains a bounded loopback compatibility and diagnostics
adapter and requires an explicit insecure-bind opt-in for external exposure. It
is not a fallback when lifecycle SQL is unavailable.
