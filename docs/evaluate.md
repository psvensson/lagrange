# Evaluating Lagrange

This page is the technical decision brief. It answers the questions that should
be settled before anyone treats Lagrange as more than an interesting prototype.

## What it is

Lagrange combines two things that are normally separated:

- a partitioned SQL storage layer, with SQLite-backed replicas and Raft
  consensus; and
- a WASM service runtime that can execute parts of one service invocation on
  the nodes holding the relevant partitions.

The application-facing object is a service. A service exposes HTTP handlers and
may declare distributed operations. Each operation has a fixed data selector, a
partition function, and a reducer.

Lagrange is not:

- an extension installed into an existing PostgreSQL server;
- a scheduler that reaches into arbitrary external databases;
- a transparent performance layer for unchanged applications;
- complete PostgreSQL; or
- production-supported software today.

PostgreSQL-wire compatibility is an ingress and migration aid. The rows used by
data-local execution live in Lagrange's own partitions.

## The mechanism worth evaluating

```text
one endpoint request
  -> one handler
  -> one declared distributed operation
       -> run() beside partition A
       -> run() beside partition B
       -> run() beside partition C
  -> bounded partials
  -> reduce()
  -> one response
```

The economic and latency case depends on the ratio:

```text
data scanned or transformed >> result returned
```

When that ratio is small, Lagrange may add complexity without removing much
work. When it is large, the partition functions can eliminate intermediate
transfer and central merge work.

## What changes in an existing system

| Area | What can stay | What changes |
| --- | --- | --- |
| External API | Existing application may keep its public API | It calls a Lagrange HTTP endpoint for the extracted operation |
| Service code | Authentication, third-party calls, and unrelated routes can stay outside | The selected handler, partition function, and reducer are authored as one WASM service |
| Database client | A bounded PostgreSQL client path can be tested unchanged | The relevant schema and data must exist in Lagrange |
| Shard logic | Application no longer needs partition maps or per-shard pools for the extracted path | The Binding selector and cluster routing choose partitions |
| Fan-out and merge | Application-specific orchestration can disappear | Lagrange dispatches bounded shard work and coordinates reduction |
| Failure handling | Domain policy remains application code | Routing retries, movement fences, deadlines, and result visibility follow Lagrange's execution contract |

The smallest sensible adoption unit is one expensive operation, not the whole
application.

## Current public service path

The recommended source model is code-first:

- `defineService()` declares the service;
- `http.get()` and `http.post()` declare handlers;
- `distributed()` declares a partition function and reducer;
- `sql` declares the operation's literal single-table selector;
- a handler receives `call(descriptor, arguments)` and `json(...)` helpers;
- a partition function receives rows plus `emit(key, numericPartial)`; and
- the compiler generates manifests, Bindings, access policy, component entry
  code, typings, and deployment records.

The generated Artifact / Binding / Cell records remain the runtime contract.
They are not the normal source-authoring interface.

## Hard boundaries that affect a pilot

| Concern | Current behavior |
| --- | --- |
| Selector | One literal, single-table `SELECT` fixed when the operation is deployed |
| Per-call filtering | Arguments reach `run()`; they do not change the SQL selector |
| Shard input | Bounded local batch; 4,096 rows by default |
| Partials | Finite numbers keyed by strings |
| Key overlap | The same partial key from two shards fails the invocation |
| Emit budget | 64 calls by default |
| Coordinated partial cap | 1,024 entries by default |
| Parallelism | Eight shard runs by default; runs sharing one host serialize |
| Nested calls | One distributed call from one HTTP request |
| Cross-partition consistency | Independent shard reads, not one global snapshot |
| Writes from call operations | The current call path is read-only against user tables |
| Cancellation | Caller disconnect does not cancel in-flight work |
| Direct-call idempotency | No caller-supplied idempotency key on direct PostgreSQL-wire calls |
| HTTP authentication | Basic authentication using the configured PostgreSQL-wire credential tuple |
| Node transport | Plain WebSocket on a trusted private network; no mTLS |
| PostgreSQL compatibility | Measured subset, not arbitrary SQL or ORM compatibility |

A workload that exceeds these boundaries should not be forced into the current
surface. Treat the mismatch as a product requirement, not as a tuning problem.

## Evidence available today

### Public code-first service proof

`npm run demo:account-summary` uses the current source model, compiles a genuine
WASI component, generates deployment records, splits a table into two
partitions, invokes the HTTP and direct call paths, and checks authorization and
replay.

It proves the current authoring and invocation chain. It does not prove
multi-node throughput or large-shard behavior: both partitions run on one node
and the dataset is deliberately small.

### Multi-node call-path tests

The integration suite exercises shard work on partition-host nodes, verifies
that selected rows are read locally rather than delivered across the message
router, and exercises overlap when shards are on different nodes.

That is useful engineering evidence. It is not yet a published buyer-grade
benchmark with named hardware, steady-state latency distributions, resource
measurements, and failure drills.

### MovieLens comparison

`npm run demo:movielens` compares a strong PostgreSQL grouped-query baseline,
Lagrange distributed SQL, and shard-local policy with bounded reduction over
100,000 ratings. It reports correctness, transfer shape, and placement evidence.

The service phase uses the kernel-internal `native_js` substrate rather than the
current public code-first WASM path. It demonstrates the execution shape, not a
complete current-product benchmark. It deliberately does not print a speedup
ratio.

### Replica rebuild evidence

SQLite partition snapshot creation, transfer, installation, and proof-gated log
compaction are active runtime paths and have a five-node live-rebuild test under
foreground writes. This is stronger than a unit test, but it is still release
evidence rather than a published support, RPO, or RTO commitment.

## What is not yet proven publicly

There is no published maximum for:

- nodes;
- partitions;
- database size;
- sustained request rate;
- simultaneous distributed calls;
- recovery time by replica size;
- supported network latency between nodes; or
- a production SLO for latency, availability, convergence, or durability.

There is also no one-command example that combines the code-first public path,
multiple nodes, a representative large workload, a strong baseline, resource
measurements, and a node-loss drill.

## Security decision

The current system can be evaluated safely only inside a controlled private
network:

- PostgreSQL-wire ingress supports password authentication and TLS;
- HTTP service ingress uses Basic credentials backed by the same configured
  credential verifier;
- WASM components receive narrow declared host capabilities;
- admin WebSocket access is unauthenticated and must remain loopback-only or sit
  behind authenticated ingress; and
- node-to-node transport is not cryptographically authenticated or encrypted.

Do not expose the transport or admin listeners to an untrusted network. Do not
interpret tenant and role fields in the runtime as a hardened multi-tenant
product boundary. Read [Security](security.md) before deploying outside a local
machine.

## Operations decision

The partition recovery path is more mature than the product operations surface:

- replica snapshot rebuild is implemented for SQLite partitions;
- message-group logs remain in memory and use full replay;
- learner promotion is time-based rather than progress-based;
- no supported backup, restore, or point-in-time recovery surface is published;
- no rolling-upgrade or downgrade contract is published for `0.x`; and
- no supported cross-region durability contract is published.

Read [Operations readiness](operations-readiness.md) before choosing a pilot
topology.

## A credible pilot

Choose one operation with a measurable baseline and a bounded result. Keep the
existing system of record in place.

Before building anything, capture:

- request rate and concurrency;
- p50, p95, and p99 latency;
- sequential database round trips;
- rows and bytes returned by each statement;
- service-tier and database-tier CPU and memory;
- cross-zone or cross-region transfer;
- retry and timeout rates; and
- the current failure and rollback procedure.

The pilot should then prove all of the following:

1. result parity against an independent oracle;
2. the exact selected rows and partitions;
3. bounded partial exchange rather than raw-row movement;
4. steady-state latency and resource use after warm-up;
5. behavior when one node stops during load;
6. data load, cutover, and rollback;
7. security controls for every exposed listener; and
8. a complete inventory of unsupported requirements.

Do not proceed because a local demo is fast. Proceed when the chosen workload
has a measured mechanism of improvement and the remaining operational gaps are
acceptable for the pilot.

## Decision summary

Lagrange is worth evaluating when a team already owns a distributed-data
problem and substantial application infrastructure exists mainly to move,
filter, or merge that data. The core idea is real and the implementation has
meaningful failure-oriented engineering behind it.

It is not ready to be treated as a general production database or a drop-in
replacement. The current decision is narrower: whether one bounded,
data-intensive operation is valuable enough to justify a controlled pilot and
to help close the missing product guarantees.

Continue with:

- [Current capabilities and limitations](current-capabilities-and-limitations.md)
- [Migration and adoption](migration.md)
- [Security](security.md)
- [Operations readiness](operations-readiness.md)
- [Performance and cost measurement](performance-and-cost-estimation.md)
- [Architecture](../architecture/INDEX.md)
