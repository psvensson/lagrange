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

## Future - 2.0 Deeper Distributed Execution

Once the bounded call path and its operating contract are stable, deeper
execution can add:

- multi-stage plans with streaming exchange and backpressure;
- deeper call composition;
- concurrent invocations on one Cell instance;
- query-planner-initiated pushdown;
- typed language SDKs and generated operation handles; and
- an installable service ecosystem with dependency and upgrade handling.

These extend the same model rather than introducing a second product:
applications call one service, and Lagrange runs the relevant functions where
the data lives.
