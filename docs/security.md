# Security

This page describes the current security boundary, including the parts that
must be supplied by the surrounding deployment. Lagrange is alpha software and
should be evaluated inside a controlled private network.

## Trust model

Treat a Lagrange cluster as one trusted administrative and network domain.

The current implementation has authenticated application ingress and a narrow
WASM capability boundary, but node-to-node transport and the admin WebSocket do
not form a hardened zero-trust perimeter.

```text
untrusted clients
  -> authenticated TLS ingress supplied or configured correctly
  -> Lagrange request / PostgreSQL-wire adapters
  -> server-derived tenant and principal context
  -> declared service capabilities
  -> trusted private cluster network
```

## PostgreSQL-wire ingress

The PostgreSQL-wire runtime requires an explicit authentication mode and TLS
mode.

- `trust` is a loopback-only development mode.
- `password` performs PostgreSQL cleartext-password authentication before a
  session exists.
- `disable`, `prefer`, and `require` TLS modes exist.
- External password deployments should use `require`.
- Server key and certificate material is loaded from configured paths.
- Clients remain responsible for CA and hostname verification.
- SCRAM is not implemented.

Lifecycle SQL such as `INSTALL SERVICE`, `CREATE BINDING`, and `CALL BINDING`
uses action-specific authorization. Tenant, principal, and role identity are
derived by the server; a payload cannot claim them.

Cleartext-password authentication is acceptable only inside a correctly
verified TLS session. Do not use password mode over plaintext on an untrusted
network.

## HTTP service ingress

Request Bindings currently use HTTP Basic authentication backed by the same
configured credential verifier and database/tenant value as PostgreSQL wire.

This is a functional authentication boundary, not a complete identity platform.
No OIDC, OAuth, SAML, client-certificate, or external policy-provider
integration is claimed by the current public repository.

Put production-like evaluations behind a reverse proxy or gateway that provides
TLS termination, request limits, logging, and the identity integration required
by the environment. The gateway does not replace Lagrange's own Basic check;
plan how credentials are supplied safely.

## Service capability boundary

Externally authored services run as WASI components. The component receives a
small host interface rather than arbitrary database credentials and open
network access.

- Request handlers receive declared table slots and authorized distributed-call
  descriptors.
- Distributed partition functions receive their bounded row batch and `emit`.
- An absent access policy grants nothing.
- A call target not declared for the handler fails before dispatch.
- An undeclared table slot fails at the component boundary.
- Budgets bound CPU time, wall time, memory, input, output, and context size.

Observed access affects placement only. It never grants authority.

WASM isolation reduces the authority of service code. It does not make the
host process, runtime, dependency chain, or cluster transport trustworthy by
itself.

## Artifact integrity

Service installation pins the manifest and component payload by digest.
Verified component bytes are stored in replicated Lagrange tables and are
reverified when reconstructed on a node. Local filesystem copies are caches,
not the canonical artifact.

This protects immutable identity and accidental or unauthorized byte drift
inside the installation path. It is not a complete software-supply-chain
program. No public signature-transparency, provenance-policy, vulnerability
scanning, or customer KMS integration is claimed.

## Node-to-node transport

The current message router listens with plain WebSockets. Peer identification
and cluster identity are protocol fields, not cryptographic peer
authentication. The listener does not provide mTLS or transport encryption.

Consequences:

- bind it only on a private, trusted network;
- use network policy or host firewalls to restrict the transport port to known
  cluster nodes;
- do not route it across the public internet;
- do not treat node IDs as proof of machine identity; and
- assume a network attacker inside the cluster segment can interfere with
  transport traffic.

Cryptographically authenticated and encrypted node transport is a production
blocker, not an optional hardening note.

## Admin WebSocket

The admin WebSocket is unauthenticated. It binds to loopback by default.

External binding requires the explicit
`ADMIN_ALLOW_INSECURE_EXTERNAL_BIND=true` opt-in. That flag does not add
authentication. It only confirms that the operator accepts the insecure bind.

Keep the listener on loopback whenever possible. When remote administration is
required, place authenticated, encrypted ingress in front of it and restrict
network reachability. The Helm chart deliberately keeps the admin listener
pod-local and does not publish it through a Service.

## Data isolation and tenancy

Runtime requests carry server-derived tenant, principal, and role fields, and
catalog lookups are tenant-scoped. These are useful security primitives.

They are not, by themselves, a claim that the current release is suitable for
hostile multi-tenant workloads. No published isolation certification, tenant
resource fairness contract, customer-managed RBAC surface, or cross-tenant
penetration-test result exists.

Use one administrative trust domain per evaluation cluster.

## Secrets

Current credential and TLS configuration uses environment variables and mounted
files. Avoid storing secrets in service manifests, Binding payloads, logs, or
repository configuration.

No supported secrets manager or KMS integration is claimed. Supply secret
rotation, file permissions, process isolation, and deployment-time injection
through the surrounding platform.

## Logging and audit

The runtime carries correlation, principal, tenant, and action context through
several control paths, and administrative operations have internal audit
records and metrics.

There is no published, supported audit export, retention policy, tamper-evident
log, or SIEM integration contract. Treat logs as diagnostic output until those
requirements are implemented and tested.

## Current control matrix

| Control | Current state |
| --- | --- |
| PostgreSQL-wire password authentication | Implemented |
| PostgreSQL-wire TLS | Implemented |
| SCRAM | Not implemented |
| HTTP Basic authentication | Implemented |
| OIDC / SSO | Not implemented as a public product surface |
| WASM capability-limited host interface | Implemented |
| Digest-pinned component installation | Implemented |
| Admin WebSocket authentication | Not implemented |
| Node-to-node encryption | Not implemented |
| Node-to-node cryptographic authentication | Not implemented |
| Customer-managed RBAC | No supported public surface claimed |
| Secrets/KMS integration | Not implemented as a public product surface |
| Hardened hostile multi-tenancy | Not claimed |

## Minimum safe evaluation posture

- Use an isolated private network.
- Expose only the ingress ports needed by the test.
- Require verified TLS for PostgreSQL-wire access.
- Put HTTP service ingress behind a controlled gateway when it leaves localhost.
- Keep admin access on loopback.
- Firewall node transport to cluster members.
- Use disposable credentials and non-sensitive data.
- Do not make the cluster the only copy of valuable data.
- Record every accepted security exception as a pilot blocker or explicit risk.

Continue with [Operations readiness](operations-readiness.md) and
[Current capabilities and limitations](current-capabilities-and-limitations.md).
