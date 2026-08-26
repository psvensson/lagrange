---
audience: human
documentClass: planning
---

# Lagrange Roadmap

Lagrange is becoming one product: a distributed runtime for data-intensive
services, backed by partitioned and replicated SQL storage.

This page describes direction, not current support. The checked-in status
authority is [Current Capabilities And Limitations](docs/current-capabilities-and-limitations.md).
Released changes belong in [CHANGELOG.md](CHANGELOG.md).

## Recently completed - 0.1 Internal Coherence

The first phase established the database foundations and the split/merge
transition-integrity ladder: distributed transactions with snapshot isolation
and recovery; schema migrations with backfill, cutover, rollback, and restart
recovery; typed split-key comparison; durable dissolution witnesses; fenced
abort parity; batched merge backfill; the durable split/merge overlap guard;
and one configuration authority for split/merge thresholds.

## Now - 0.2 Stable Core: make the existing public path credible

The service compiler and public HTTP-to-distributed-call path exist. The next
work is to make their useful envelope larger and their evidence easier to trust:

- run the code-first WASM service path across a genuine multi-node dataset;
- publish a controlled comparison against a strong conventional baseline;
- support safe selector narrowing from call arguments;
- process inputs larger than one bounded shard batch through an explicit
  streaming or paging contract;
- support bounded structured partials rather than finite numbers only;
- complete multi-operation service dispatch beyond the current one-operation
  component limit; and
- bind every externally visible performance claim to reproducible evidence.

## Next - 0.5 Easy To Try: pilot-ready operations

A serious pilot needs a complete operational boundary, not just successful
queries:

- cryptographically authenticated and encrypted node transport;
- progress-proven learner promotion;
- documented data load, shadowing, cutover, rollback, and exit tooling;
- named PostgreSQL-driver and SQL compatibility certification;
- an upgrade and downgrade rehearsal for supported release pairs;
- a supported topology and capacity envelope; and
- one operational view that ties requests, shard runs, partials, placement,
  retries, and failures together.

Backup/restore/PITR, enterprise identity controls, secrets/KMS integration, and
cross-region durability are separate product areas and must follow their edition
and implementation-home decisions.

## Cross-cutting milestone - Installable Service Product Platform

Before first-party paid services such as Lagrange AI can be shipped to customers,
Lagrange needs a coherent product boundary for installing and operating a
service. This milestone draws together existing service-platform work that was
previously spread across runtime, registry, external-kernel, observability and
commercial-control tracks. It does not change edition ownership: shared service
substrate remains Community/AGPL where assigned there, while paid-only
entitlements, advanced telemetry and secrets/KMS behavior remain in their
commercial implementation homes.

The architecture/specification target is
[Installable Service Product Platform Contract](solve/specs/installable-service-product-platform/contract.md).
It defines the shared owner boundaries, lifecycle, compatibility, configuration,
managed OCI activation, upgrade/rollback, diagnostics, support-bundle, telemetry,
commercial-extension and acceptance-consumer contracts without claiming those
surfaces are implemented today.

The customer-facing target is that a signed service can be installed into an
existing cluster without a repository checkout or a second service manager.
The shared platform therefore needs:

- signed, immutable OCI package/revision identity and verified acquisition;
- real managed OCI service activation, restart and desired-state reconciliation;
- kernel/service compatibility and dependency preflight before activation;
- declarative configuration and health/readiness contracts;
- one install/status/remove/upgrade surface with idempotent operations;
- health-gated rollout and rollback to a prior known-good revision;
- a stable service diagnostics/metrics contribution contract;
- a customer-inspectable, redacted support-bundle format to which services can
  contribute diagnostics;
- customer-controlled telemetry/export plumbing that never doubles as a
  licensing requirement;
- air-gapped/mirrored artifact operation; and
- clean integration points for commercial entitlement checks and
  cluster-resolved secret references where the customer's edition provides them.

The first acceptance consumer should be a real separately released service,
with Lagrange AI a natural candidate. The proof is not merely that `INSTALL
SERVICE` records a package: the service must become ready under Lagrange
ownership, survive restart, expose useful diagnostics, upgrade and roll back
through the supported lifecycle, and remove without leaving unmanaged runtime
state.

Implementation scope and sequencing remain governed by the AGPL feature map and
edition matrix; this milestone is the product-level convergence gate those rows
must satisfy together.

## Later - 1.0 Production Ready: production support

A production-supported release requires explicit, evidence-backed guarantees:

- documented durability, availability, consistency, recovery, and balance
  contracts;
- backup, restore, and disaster-recovery procedures with measured RPO/RTO;
- stable service, SQL, and upgrade compatibility policies;
- security controls suitable for the declared network and tenancy model;
- representative certification on named hardware and workloads; and
- support boundaries that distinguish implemented, tested, certified, and
  commercially supported behavior.

A commercially supported installable service additionally depends on the
Installable Service Product Platform milestone above; first-party services
should consume that common lifecycle rather than introducing product-specific
installers, telemetry transports, support collectors, secret stores, or
upgraders.

## Future - 2.0 Deeper Distributed Execution

Once the bounded call path and its operating contract are stable, deeper
execution can add:

- multi-stage plans with streaming exchange and backpressure;
- deeper call composition;
- concurrent invocations on one Cell instance;
- query-planner-initiated pushdown; and
- typed language SDKs and generated operation handles.

The installable-service platform is no longer treated as an optional 2.0
addition: its foundational product lifecycle is a prerequisite for separately
released customer services. Phase 2.0 can deepen the external service API and
placement model once that common lifecycle is usable.

These extend the same model rather than introducing a second product:
applications call one service, and Lagrange runs the relevant functions where
the data lives.
