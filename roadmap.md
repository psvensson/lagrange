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

## After 0.2 - 0.25 Semantic Core Hardening: protect what the core means

Phase 0.2 has repeatedly exposed a particular class of defect: a locally
reasonable change silently redefines a system-wide fact. Examples include the
difference between an unbound membership epoch and epoch zero, desired
replication policy versus current replica identity, time-dependent node
liveness, replica terminal outcomes, and planning/readiness generations.

Before adding another layer of query and index semantics, Phase 0.25 turns that
knowledge into structural protection. It does not freeze Lagrange or move the
whole control plane into a library. It identifies a small high-blast-radius
semantic nucleus and makes changes to that nucleus visibly different from
ordinary implementation changes.

The milestone includes:

- a ranked inventory of the highest-risk semantic facts, their authoritative
  owners, and the owners of interactions between them;
- a small deterministic semantic-kernel boundary for pure decoding,
  projection, transition, and fencing logic, with stateful lifecycle remaining
  in its existing owners;
- mechanical guards that prevent consumers from independently interpreting
  protected raw fields once a canonical owner/kernel surface exists;
- a machine-readable protected-core manifest and content-bound change protocol
  so an ordinary agent edit cannot silently modify protected semantics or the
  guard that protects them;
- differential and mutation proof that extraction preserves existing meaning
  unless a change explicitly declares that meaning is changing; and
- boundary-stability evidence used to decide whether a later separately
  writable package/repository with read-only normal-agent credentials would
  reduce risk rather than introduce version skew and shadow semantics.

A separate repository is deliberately not an exit requirement for 0.25. The
boundary should first prove that legitimate semantic changes are rare, narrow,
and do not usually require atomic edits with stateful owners. Repository-local
checks are also not described as a security boundary against credentials that
can rewrite the checks themselves; literal write prevention needs an external
ruleset or credential boundary.

The architecture and threat model are specified in
[Protected Semantic Core](architecture/protected-semantic-core.md).

## Next - 0.3 Queryable Core: normal SQL access paths and live results

A credible distributed database should not require callers to understand its
physical partition key before ordinary queries become efficient. Phase 0.3
makes keys, ordered access paths, secondary indexes, and continuing query
observation coherent core capabilities rather than collections of planner or
adapter exceptions.

The existing live-query runtime already contains useful grouping and CDC-driven
pieces, but its generic data-plane contract is not complete. Phase 0.3 promotes
live queries into a push-backed core primitive: normal `SqlCore` planning owns
query semantics and partition dependencies, relevant partition CDC drives
changes, equivalent local interests are coalesced, and the snapshot-to-stream
boundary is gap-free. Distributed change detection by polling is not an
acceptable implementation path. The target owner map and migration boundary are
specified in [Live Query Data Plane](architecture/live-query-data-plane.md).

The milestone includes:

- one type-aware total order for persisted partition keys and indexed tuples;
- primary-key and compound-primary-key partition narrowing beyond an implicit
  `id` convention;
- ordinary and compound local `CREATE INDEX` / `DROP INDEX` support using one
  well-defined ordered B-tree index family;
- correct left-prefix and equality-prefix-plus-range semantics for compound
  indexes, with unsupported index kinds or access paths failing closed;
- non-unique global secondary and compound indexes represented as
  system-managed, partitioned, Raft-replicated datasets;
- resumable backfill, restart-safe lifecycle, durable failure state, and safe
  fallback to scatter-gather when an index is unavailable or not readable;
- planner integration and `EXPLAIN DISTRIBUTED` output that show which index was
  selected, or why an available index was rejected;
- generic push-backed live queries over ordinary application tables/queries,
  routed only to partitions that can affect the result and multiplexed across
  equivalent node-local consumers;
- one gap-free initial-snapshot/frontier contract using the existing committed
  CDC handshake/replay substrate rather than repeated reads; and
- incremental row deltas where the normal plan can be safely maintained, with
  event-triggered normal-query re-execution/reset for more complex plans rather
  than polling.

A Phase 0.3 live query should be able to remain idle with zero repeated data
reads used to discover change, then receive a remote committed mutation as an
unsolicited update. Split/merge/leader transitions must update the subscription
footprint through existing topology owners without exposing physical partitions
to the consumer.

Global uniqueness is intentionally not part of 0.3. A secondary index in this
milestone is an access path: losing or rejecting it may make a query slower, but
must never make base-table results incorrect.

## Then - 0.5 Easy To Try: pilot-ready operations

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

The 0.5 developer/operator surface should expose the 0.3 capabilities cleanly:
index definitions and state should be inspectable through normal SQL/catalog
surfaces, build/backfill progress and failures should be diagnosable, and the
getting-started path should demonstrate indexed access without requiring
cluster-internal knowledge. Live-query diagnostics should likewise show the
query identity, current dependency/partition footprint, coalesced consumer
count, frontier/resume state, and whether maintenance is incremental or
re-execution based without exposing transport mechanics as application policy.

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

The architecture and specification target defines the shared owner boundaries,
lifecycle, compatibility, configuration, managed OCI activation,
upgrade/rollback, diagnostics, support-bundle, telemetry, commercial-extension
and acceptance-consumer contracts without claiming those surfaces are
implemented today.

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

## Later - 1.0 Production Ready: production support and relational invariants

A production-supported release requires explicit, evidence-backed guarantees:

- documented durability, availability, consistency, recovery, and balance
  contracts;
- backup, restore, and disaster-recovery procedures with measured RPO/RTO;
- stable service, SQL, and upgrade compatibility policies;
- security controls suitable for the declared network and tenancy model;
- representative certification on named hardware and workloads; and
- support boundaries that distinguish implemented, tested, certified, and
  commercially supported behavior.

For indexing, 1.0 is where an access path may also become a relational
invariant. It therefore owns:

- unique global secondary indexes only with a synchronous maintenance mode that
  participates in transaction correctness;
- production guarantees for index rebuild/backfill, restart and failover;
- measured bounds and supported envelopes for index write amplification and
  rebuild pressure; and
- the supported tuple-order, NULL, type and collation contract exposed through
  PostgreSQL-facing metadata and constraint behavior.

A commercially supported installable service additionally depends on the
Installable Service Product Platform milestone above; first-party services
should consume that common lifecycle rather than introducing product-specific
installers, telemetry transports, support collectors, secret stores, or
upgraders.

## Later 1.x - SQL Breadth and Compatibility

Once the ordered-index foundation and production invariants are stable, SQL
breadth can expand without changing the core distributed index architecture.
This is the home for features such as:

- partial and expression indexes;
- `INCLUDE` / covering-index syntax and index-only scans;
- richer collation and operator semantics;
- broader PostgreSQL index catalog and DDL compatibility, including concurrent
  build behavior where Lagrange can support it honestly; and
- other relational conveniences that improve compatibility but are not needed
  to make ordinary indexed access correct.

## Future - 2.0 Deeper Distributed Execution

Once the bounded call path and its operating contract are stable, deeper
execution can add:

- multi-stage plans with streaming exchange and backpressure;
- deeper call composition;
- concurrent invocations on one Cell instance;
- query-planner-initiated pushdown; and
- typed language SDKs and generated operation handles.

The query planner can also become substantially more sophisticated here rather
than pulling optimizer research into 0.3. Phase 2.0 is the natural home for
statistics and cardinality estimates, cost-based index selection, index
intersection/union and bitmap-style access plans, richer query hints, and
index-advisor or recommendation tooling.

Specialized search families should remain distinct from the ordinary ordered
index contract. Vector, full-text, spatial, and similar indexes may be delivered
as specialized services or later access-path families where their semantics and
storage warrant it.

The installable-service platform is no longer treated as an optional 2.0
addition: its foundational product lifecycle is a prerequisite for separately
released customer services. Phase 2.0 can deepen the external service API and
placement model once that common lifecycle is usable.

These extend the same model rather than introducing a second product:
applications call one service, and Lagrange runs the relevant functions where
the data lives.