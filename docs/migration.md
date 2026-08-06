# Migration And Adoption

Lagrange is easiest to adopt one operation at a time. The goal is not to move an
entire system before learning whether data-local execution pays. The goal is to
prove one useful path while preserving a clean rollback.

## Start with the product boundary

Lagrange owns the partitions on which its distributed functions run. It does
not install functions into an existing PostgreSQL cluster and it does not route
partition functions into an arbitrary external database.

PostgreSQL-wire compatibility can reduce application changes, but it does not
remove the data move. The relevant schema and rows must be present in Lagrange.

## Three adoption stages

### 1. Test SQL portability

Run one unchanged PostgreSQL client or small service against Lagrange's
PostgreSQL-wire listener.

This stage answers:

- Can the driver connect with password authentication and verified TLS?
- Which statements, parameter styles, transactions, and result types work?
- Which ORM or driver behavior is unsupported?
- How does the application handle Lagrange's readiness and typed failures?

The shipped
[service-portability example](../examples/service-portability/README.md) proves
one Node.js `pg` slice. It is not a blanket compatibility claim.

This stage does not prove the Lagrange service model or reduce data movement.

### 2. Deploy one request-shaped WASM service

Package a small endpoint as a code-first service without introducing a
distributed operation yet.

This stage proves:

- the `lagrange service init -> generate -> build -> deploy` workflow;
- immutable component installation;
- request routing;
- Basic-authenticated HTTP ingress;
- declared table and outbound-call capabilities; and
- Cell activation and replacement.

If the endpoint still issues the same queries and receives the same results,
its data movement has not changed. This is a lifecycle and isolation step.

### 3. Extract one data-heavy operation

Move the part that scans, filters, scores, aggregates, validates, or transforms
data into a `distributed()` descriptor with `run()` and `reduce()`.

Keep unrelated work outside:

```text
existing API service
  |- authentication and external API policy
  |- third-party calls
  |- caching and response policy
  `- call one Lagrange endpoint for the extracted operation
```

The extraction is valuable when each shard can produce a bounded partial and
the caller needs only the reduced answer.

## Choose a viable first operation

A current operation must fit all of these constraints:

- one literal single-table selector;
- a bounded shard batch;
- finite numeric partials;
- shard-disjoint partial keys;
- no global cross-partition snapshot requirement;
- no caller cancellation requirement; and
- one nested distributed call per request.

Reject the candidate early when it requires streaming, joins in the selector,
per-call SQL interpolation, structured sketches, or unbounded scans. Those are
product gaps, not documentation details.

## Data loading

There is no supported PostgreSQL-to-Lagrange migration or CDC product surface
today. Plan data movement explicitly.

A controlled pilot normally needs:

1. a schema compatibility review;
2. an initial export from the current source of truth;
3. a deterministic load into Lagrange;
4. row counts, checksums, and domain-level parity checks;
5. a method for covering changes that occur during the load; and
6. a final cutover window.

The change-capture method is currently external to Lagrange. Depending on the
workload, use a maintenance window, an application-owned dual write, or an
existing source-database CDC pipeline. Do not describe any of these as a
built-in Lagrange feature.

## Cutover workflow

A safe cutover keeps the old path available until the new one has proved
correctness under representative load.

### Before shadowing

- Freeze the exact input and output contract.
- Record a baseline of latency, bytes, CPU, retries, and error behavior.
- Define an independent result oracle.
- Define which side effects are allowed during comparison.
- Define an explicit rollback trigger.

### Shadow phase

Invoke Lagrange beside the current path without making it authoritative.
Compare:

- full result equality or a documented tolerance;
- missing and duplicate records;
- timeout and retry behavior;
- load on both systems;
- partition fan-out and selected batch size; and
- partial volume.

For mutating operations, do not shadow by performing the same side effect
blindly in both systems. Use a dry-run contract, an idempotent test tenant, or a
separate reconciliation design.

### Limited traffic

Route a small, named cohort to Lagrange. Keep the current implementation as the
fallback, but do not hide ambiguous outcomes by automatically retrying both
systems. Record which path produced every response.

### Authority switch

Switch only when:

- parity holds for the agreed window;
- the data-load lag is bounded and visible;
- a node-loss drill has succeeded;
- all listeners meet the security assumptions;
- operators can diagnose a failed invocation; and
- rollback has been rehearsed.

## Rollback

Rollback must be possible without interpreting partial Lagrange results as
committed business state.

For a read-only extracted operation, rollback is normally routing the endpoint
back to the previous implementation.

For writes, define which system is authoritative before the pilot begins. The
current distributed call path does not write user tables, but request handlers
can use declared write capabilities. A dual-write design therefore needs an
application-owned reconciliation and idempotency contract.

Do not rely on a caller disconnect to cancel work. A distributed call continues
until its deadline or completion.

## Exit planning

An early infrastructure product should be evaluated with an exit path.

Keep:

- the authored service source;
- the schema and data export procedure;
- the baseline implementation or a reproducible replacement;
- independent tests for the result contract; and
- a record of generated deployment inputs.

Because no supported backup/restore/PITR surface exists today, do not make
Lagrange the sole copy of valuable data during an evaluation. Verify that the
chosen tables can be exported through the SQL surface within the required time
and that the export can be loaded elsewhere.

## Pilot completion gate

A migration pilot is complete only when it has produced:

- a compatibility inventory;
- a measured before/after result;
- a data-load and change-capture procedure;
- a successful cutover and rollback rehearsal;
- a security review;
- a one-node failure drill;
- a list of product gaps with owners; and
- a decision to stop, extend the pilot, or make the path authoritative.

Continue with [Evaluating Lagrange](evaluate.md),
[Security](security.md), and
[Operations readiness](operations-readiness.md).
