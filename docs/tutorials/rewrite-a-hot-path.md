---
audience: human
documentClass: current
---

# Rewrite A Hot Path For Lagrange

You have a service that pulls rows out of the database to compute a small
answer. This tutorial moves that hot path into a Lagrange service — a
partition function and a reducer authored together in one component — and
invokes it through the CALL binding, today's public data-local invocation
surface.

The example is a movie-ranking endpoint over the MovieLens 100k dataset. It
is useful because it has a strong conventional implementation: a database can
compute `AVG` and `COUNT` per movie efficiently, and an application service
can apply a Bayesian confidence adjustment and choose the top ten. The
comparison therefore does not depend on an intentionally bad baseline.

## The Requirement

For each movie, calculate:

```text
bayesianMean = (average × count + priorMean × priorWeight)
               / (count + priorWeight)
score = bayesianMean - confidencePenalty / sqrt(count)
```

Return the ten movies with the highest score.

The formula deliberately mixes data operations and application policy:

- `AVG` and `COUNT` are natural database work;
- the prior and confidence penalty are application choices;
- the formula should be versioned, tested, and deployed like code; and
- only the top candidates need to leave each shard.

## Baseline: A Good Conventional Service

A reasonable implementation asks the database to group first. It does not
pull all raw ratings into Node.js.

```js
export async function topMovies(pool, policy) {
  const {rows} = await pool.query(`
    SELECT movie_id,
           AVG(rating) AS average,
           COUNT(*) AS rating_count
    FROM ratings
    GROUP BY movie_id
  `);

  return rows
    .map((row) => {
      const average = Number(row.average);
      const count = Number(row.rating_count);
      const bayesianMean =
        (average * count + policy.priorMean * policy.priorWeight) /
        (count + policy.priorWeight);
      const score =
        bayesianMean - policy.confidencePenalty / Math.sqrt(count);

      return {movieId: row.movie_id, count, average, score};
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, policy.limit);
}
```

This is already much better than transferring every rating. The database
returns one aggregate per movie rather than one row per rating.

But the boundary is still fixed:

```text
all database partitions
  → grouped aggregate for every movie
  → one application process
  → score every movie
  → sort all candidates
  → keep ten
```

The application receives many candidates that it immediately discards. It
also owns a database pool and executes the policy at whichever service
replica happened to receive the request.

## Packaging Alone Does Not Change This

The same service can be compiled to WASM and deployed on Lagrange. That
improves packaging, isolation, lifecycle, and policy-controlled placement.

It does **not** automatically change the algorithm. If the deployed service
still issues the same grouped query and receives every movie aggregate, the
same result set crosses the database/service boundary.

This distinction matters:

> Portable deployment changes where an existing program can run. A hot-path
> rewrite changes what must move between storage and computation.

## Choose The Extraction Boundary

Do not rewrite the whole API service. Keep concerns that are not data-local
in the outer application:

```text
HTTP API service
  ├─ authentication
  ├─ request validation
  ├─ response caching policy
  ├─ external calls
  └─ rank movies against the ratings data   ← extract this
```

Extract only the final operation. Its contract is small:

```js
{
  priorMean: 3.5,
  priorWeight: 25,
  confidencePenalty: 0.5,
  limit: 10
}
```

The output is at most ten ranked candidates.

On today's surface, the split falls out of the Binding contract:

- the **data selector** is a single-table SELECT declared once, on the
  Binding — not per call;
- the **policy** rides in the `arguments` of each invocation;
- the **result** is whatever the reducer returns.

## The Service You Author

One component, two exports, side by side in one source file. This code
matches the shipped `call-cell` WIT ABI — the same world exercised by the
repository's live call-path integration tests. (The world file currently
lives at `test/wasm-service/fixtures/call-cell-world/wit/world.wit`;
publishing it as an authoring artifact is an open item.)

### Partition function

`run` receives the Binding statement's rows for one shard, as a typed batch,
fetched locally on the node hosting that shard. It groups, scores, and emits
only its local top candidates:

```js
import {emit} from 'lagrange:cell/call-context';

function col(row, name) {
  for (const column of row.columns) {
    if (column.name === name) return column.val;
  }
  return {tag: 'null-value'};
}

export function run(batch, argumentsJson) {
  const policy = JSON.parse(argumentsJson);

  // Group this shard's raw ratings by movie.
  const groups = new Map();
  for (const row of batch) {
    const movieId = col(row, 'movie_id');
    const rating = col(row, 'rating');
    if (movieId.tag !== 'integer' || rating.tag !== 'real') continue;
    const key = String(movieId.val);
    const group = groups.get(key) ?? {sum: 0, count: 0};
    group.sum += rating.val;
    group.count += 1;
    groups.set(key, group);
  }

  // Apply the application policy locally.
  const candidates = [];
  for (const [movieId, {sum, count}] of groups) {
    const average = sum / count;
    const bayesianMean =
      (average * count + policy.priorMean * policy.priorWeight) /
      (count + policy.priorWeight);
    const score =
      bayesianMean - policy.confidencePenalty / Math.sqrt(count);
    candidates.push({movieId, score});
  }
  candidates.sort((left, right) => right.score - left.score);

  // Publish only the local top K as numeric partials.
  for (const {movieId, score} of candidates.slice(0, policy.limit)) {
    emit(movieId, JSON.stringify(score));
  }
  return JSON.stringify({considered: candidates.length});
}
```

Partials leave through `emit(key, partialJson)`, not the return value. Two
contract rules shape the code:

- **Numeric partials only.** The coordination gate accepts one finite number
  per group key. The Bayesian score is exactly that. A partial carrying
  `{sum, count}` structs is future work — see
  [What Is Not Yet There](#what-is-not-yet-there).
- **Shard-disjoint group keys.** All ratings for one movie must live on one
  shard (here: ratings partitioned by movie id). Two shards emitting the
  same movie id is a typed refusal, never a silent double count.

### Reducer

`reduce` is the second export in the same component. It receives every
shard's published partials — already validated for completeness and merged
deterministically — and picks the winners:

```js
export function reduce(partials, argumentsJson) {
  const policy = JSON.parse(argumentsJson);
  return JSON.stringify(
    partials
      .map(([movieId, partial]) => ({movieId, score: JSON.parse(partial)}))
      .sort((left, right) => right.score - left.score)
      .slice(0, policy.limit));
}
```

With `R` participating shards and a requested limit `K`, the reducer
receives at most `R × K` candidates. The grouped-SQL baseline returns one
aggregate per movie.

## Install, Bind, Invoke

The lifecycle rides the same authenticated pgwire session used for ordinary
SQL. Build the component (ComponentizeJS compiles the JavaScript above
against the `call-cell` world), then:

```sql
INSTALL SERVICE $1;   -- $1 = the manifest JSON (digest-pinned artifact)
CREATE BINDING $1;    -- $1 = the binding JSON below
```

The Binding declares the data selector and budgets:

```json
{
  "schema_version": 2,
  "name": "rank-movies",
  "target": {
    "package_id": "<derived from manifest>",
    "manifest_digest": "sha256:…",
    "export_name": "run"
  },
  "source": {
    "kind": "call",
    "name": "rank-movies",
    "statement": "SELECT movie_id, rating FROM ratings"
  },
  "budgets": {
    "cpu_time_ms": 1000,
    "wall_time_ms": 10000,
    "memory_bytes": 67108864,
    "input_bytes": 65536,
    "output_bytes": 65536,
    "context_bytes": 4096
  }
}
```

The statement must be a single-table SELECT; a call Binding without a
statement registers durably but refuses invocation typed
(`call_cell_not_invocable`).

The outer service — or any client on an authenticated pgwire session with
the `pgwire.binding.call` action — then invokes it with one literal
statement and one JSON string parameter:

```sql
CALL BINDING $1
```

```json
{
  "schema_version": 2,
  "name": "rank-movies",
  "arguments": {
    "priorMean": 3.5,
    "priorWeight": 25,
    "confidencePenalty": 0.5,
    "limit": 10
  }
}
```

The response is one row `{name, result}` where `result` is the reducer's
JSON — the final ten. Unknown payload fields are refused; tenant identity
comes from the session, never the payload.

Two honest operational notes:

- **Batch bounds are real.** Each shard batch is bounded (default 4096
  rows, per-deployment tunable). A full 100k-rating scan needs raised
  tunables or narrower selection; an oversized batch refuses typed
  (`call_cell_batch_bound_exceeded`) rather than degrading.
- **Emit budget is real.** Default 64 `emit` calls per invocation — which
  is why the partition function emits its top `K`, not every movie.

## Before And After

### Conventional grouped-query path

```text
request
  → arbitrary service replica
  → database coordinator
  → all relevant partitions compute AVG and COUNT
  → one aggregate per movie crosses into the service
  → service scores and sorts every movie
  → ten results
```

### Data-local call path

```text
CALL BINDING $1
  → the Binding statement resolves to current partitions (no rows fetched)
  → run() executes on each partition-host node
      → local grouping over the shard's own replica
      → local policy scoring
      → emits local top ten
  → at most shards × ten numeric partials cross the exchange
  → completeness gate, then reduce() once under a dedicated lease
  → one atomic snapshot → ten results
```

Raft and distributed routing still exist. The improvement is not magical
local execution; it is the removal of avoidable intermediate movement and
the application/database boundary around each shard's useful work. In the
two-node integration proof of this path, shard-table rows crossing the wire
measure exactly zero — the network carries partials and the result.

## What Exactly Improves

### Transfer shape

Let:

- `N` be the number of matching raw rows;
- `M` be the number of grouped movies;
- `R` be the number of participating shards; and
- `K` be the requested result count.

Then the dominant boundary shapes are:

| Implementation | Values crossing the main database/service boundary |
| --- | ---: |
| Naive application aggregation | approximately `N` rows |
| Good grouped SQL baseline | approximately `M` aggregates |
| Data-local function and bounded reduce | at most `R × K` candidates |

For top-ten ranking, `K` is fixed even as the dataset grows. `R` grows with
the partition shape, while `N` and usually `M` grow with the data.

### Latency

The rewrite can reduce latency when:

- service-to-database network time is material;
- per-shard work is substantial relative to coordination;
- intermediate result serialization is significant;
- the reducer input is much smaller than the grouped result; and
- execution is placed on or near suitable replicas.

It can fail to help when the dataset is tiny, one indexed query already
returns only ten rows, startup dominates, or the partition-local code
consumes more CPU than the transfer it removes. Note also that shard
dispatch is currently sequential, not parallel — concurrency across shards
is future work, so today's latency win comes from transfer shape and
locality, not parallel fan-out.

Do not present a speedup ratio from the local demo. PostgreSQL and Lagrange
use different startup, topology, storage, and process arrangements there.
The demo compares correctness, transfer shape, and placement evidence.
Performance claims require repeated steady-state samples on controlled
deployments.

### Operations

The outer service no longer needs to know:

- shard endpoints;
- partition maps;
- leader locations;
- the number of service workers matching the data layout; or
- how to redeploy those workers after splits and moves.

The function Artifact is immutable, the Binding defines invocation intent,
and Cells are system-policy output. When an invocation targets a partition
whose node has no ready Cell, the invoker publishes a bounded activation
lease and the placement planner pins compute there — activation is a
mechanism, not an error.

### Security

The partition function receives only declared capabilities. It does not
inherit a broad network environment and a database credential capable of
reaching unrelated tables.

On the call path, the security context (tenant, principal, frozen roles) is
derived from the authenticated pgwire session on the server side; the
payload cannot claim an identity, and unknown payload fields are refused.
Undeclared access is denied at the component boundary.

### Failure semantics

A generic service process may fail after an unknown set of external side
effects. The call path carries its contract explicitly today:

- a minted invocation identity, fanned out per shard and reduce with a
  durable idempotency fence — a replayed dispatch never re-executes;
- a caller deadline enforced end to end, re-checked inside the component
  invoke barrier;
- typed failure codes classified `terminal | retryable | ambiguous`;
  retries happen only for retryable failures where the component provably
  did not run;
- partition and replica movement surfacing as the typed retryable
  `call_cell_target_stale` — never a wrong result; and
- exactly-once **visibility**: one atomic result snapshot per complete
  partial set, with a witness naming the contributing replicas.

The full contract is in [Execution Semantics](../execution-semantics.md).

## How Placement Learns

Lagrange attributes successful service-issued statements to the partitions
they actually execute against. That evidence is aggregated into placement
weights:

- a read credits every node with an active replica because any can
  potentially serve it locally;
- a write credits the leader's node because the write must reach the
  leader; and
- latency-group weights provide a coarser "avoid crossing this domain"
  signal.

The rebalancer applies the weights with an incumbent-retention term so
small changes do not cause constant movement. This is a slow topology
decision. Read-locality routing is a separate fast per-query decision. The
call path adds a direct fast mechanism on top: activation leases pin
compute onto the exact nodes an invocation needs, and an expired lease
stops pinning so the normal surplus cure reclaims the replica.

The full mechanism is documented in
[Process: Data Affinity](../../architecture/process-data-affinity.md).

## Run The Existing Proof

From the repository root:

```sh
npm install
npm run demo:movielens
```

The comparison runs:

1. PostgreSQL grouped SQL;
2. Lagrange distributed grouped SQL; and
3. a replicated Lagrange service performing disjoint-shard scoring and
   bounded reduction.

It verifies that all three produce the same ordered top ten. It also
records placement evidence and the service's convergence toward the data it
accesses.

The demo predates the public call path: its service phase drives the
internal placement substrate directly through a kernel-internal `native_js`
module rather than an installed call Binding. It remains the best proof of
the execution and placement *shape*; the public route to the same shape is
the CALL binding shown above. Check the
[examples index](../../examples/README.md) for the current runnable
call-path example, and see
[`examples/js-request-binding-deployment`](../../examples/js-request-binding-deployment/README.md)
for the smallest end-to-end deployment of a ComponentizeJS-built component
through the identical lifecycle SQL.

## A Migration Checklist

For one candidate hot path:

1. Record the existing SQL calls, returned rows, transferred bytes, and
   latency.
2. Identify the smallest operation whose inputs and output form a stable
   contract.
3. Keep authentication, external calls, and presentation logic outside.
4. Check the operation fits today's contract: a single-table SELECT as the
   selector, one finite number per group key as the partial, group keys
   disjoint across shards, batches within the configured bounds.
5. Author `run` and `reduce` together in one component against the
   `call-cell` world; declare the selector on the Binding.
6. Declare the minimum table and capability access.
7. Compare correctness against the existing implementation.
8. Measure warm steady-state p50, p95, p99, bytes moved, CPU, and retries.
9. Inspect placement evidence and decision dimensions rather than assuming
   co-location.
10. Migrate another hot path only when the first one shows a meaningful
    win.

This incremental approach makes Lagrange adoption a sequence of measurable
extractions, not an all-or-nothing application rewrite.

## What Is Not Yet There

Intended API, honestly labeled — none of this is a supported surface today:

- **Per-call data selection.** The selector is fixed on the Binding. A
  caller cannot narrow it per invocation (`WHERE movie_id BETWEEN $a AND
  $b`); today you vary `arguments`, not the SQL.
- **Structured partials.** One finite number per group key. Emitting
  `{sum, count}` and computing the average in the reducer is future work.
- **Parallel shard fan-out.** Dispatch is a sequential loop today.
- **A `ctx.call()`-style client.** The intended in-process sugar
  (`lagrange.call({data, function, reduce, arguments})`) does not exist;
  the surface is `CALL BINDING $1` over pgwire.
- **Nested calls.** `call-bounded` is declared in the WIT world but always
  denied by the host.
- **`pushdown`.** Declared-only; no routing surface can select it.

## Continue

- [Execution Semantics](../execution-semantics.md) — the invocation
  contract in full: retries, idempotency, budgets, movement, visibility.
- [The Lagrange Native Programming Model](../native-programming-model.md)
  — the concepts behind this tutorial.
- [Minimal Deployment Surface](../../architecture/minimal-deployment-surface.md)
  — the sealed design contract for Artifact, Binding, Cell, and the call
  surface.
- [Process: Data Affinity](../../architecture/process-data-affinity.md) —
  how placement follows access evidence.
