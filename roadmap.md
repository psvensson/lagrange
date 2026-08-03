---
audience: human
documentClass: planning
---

# Lagrange Roadmap

Lagrange is a distributed runtime for data-intensive services. It is growing
from a distributed-systems research project into one product that people can
evaluate, operate, and extend without first learning its internals: services
whose partition functions and reducers run on the nodes holding the data,
backed by a replicated SQL storage core.

This roadmap describes product direction rather than promising dates. For what
works in the current tree, including important limitations, see
[Current Capabilities And Limitations](docs/current-capabilities-and-limitations.md).
Released changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## Recently completed — 0.1 Internal Coherence

The first phase established the database foundations:

- distributed transactions with snapshot isolation and recovery;
- schema migrations with backfill, cutover, rollback, and restart recovery;
- health, diagnostics, metrics, and administrative visibility;
- deterministic and distributed failure testing; and
- stable ownership for replica movement and other topology changes.

These capabilities make the system substantially easier to reason about under
failure. They are the base for the release and usability work that follows.

## Now — 0.2 Stable Core

Version 0.2 is intentionally narrow. Its purpose is to make the existing core
cluster credible as a release without presenting unfinished platform features
as supported product capabilities.

The release target is:

- a five-node cluster forms, creates tables, and places its initial services
  without manual recovery or stalled operations;
- replica movement and recovery retain their safety guarantees;
- a follower that falls behind compacted Raft history can catch up from the
  snapshot foundations already integrated into the core;
- an enforcing memory soak finds no sustained leak; and
- release checks are green and remaining limitations are documented.

Version 0.2 will not claim complete snapshot recovery for large live rebuilds,
automatic data-affinity placement, distributed-reduce certification, or OCI
container execution unless their acceptance work finishes before the release
cutoff.

## Next — 0.5 Easy To Try

The next phase focuses on the first experience of using Lagrange:

- initialize, start, and join cluster nodes through a coherent CLI;
- run a representative local cluster with Docker Compose;
- publish, deploy, and scale WASM services from the CLI;
- provide a short getting-started path from installation to a useful query;
- shorten the edit, test, debug, and redeploy loop for service authors; and
- make logs and diagnostics approachable without knowledge of the internals.

The goal is for a developer to run a cluster, connect with `psql`, create
tables, deploy a WASM service, run distributed execution, and inspect the
result within 30 minutes.

## Later — 1.0 Production Ready

The 1.0 phase turns the usable system into one that teams can operate with
clear expectations:

- documented failover, durability, recovery, balance, and scale guarantees;
- bounded Raft history with complete snapshot recovery;
- broader PostgreSQL compatibility;
- stable service installation and lifecycle APIs;
- enforceable resource and capability boundaries; and
- representative certification on named hardware and workload profiles.

The emphasis is explicit guarantees backed by repeatable evidence, rather than
adding features without an operational contract.

## Future — 2.0 Deeper Distributed Execution

The core of data-local execution is already shipped: call Bindings run
partition functions on the partition-host nodes and reduce their partials
under coordination leases, with placement following demand. The 2.0
direction deepens that surface:

- multi-stage distributed plans with streaming exchange and backpressure;
- structured partials, pushdown invocation, and concurrent invocations on
  a single Cell instance (cross-node shard fan-out is already bounded
  parallel);
- a stable external kernel API and a published authoring WIT world;
- an installable service ecosystem with dependency and upgrade handling; and
- a native artifact store for large, immutable content.

These directions build on the storage core rather than replacing it:
distributed execution remains grounded in strong storage, ownership, and
failure semantics.
