---
audience: human
documentClass: current
---

# Rewrite A Hot Path For Lagrange

This tutorial shows the difference between merely deploying an artifact and
rewriting one operation for Lagrange's data-local execution model.

The example is a movie-ranking endpoint over the MovieLens 100k dataset. It is
useful because it has a strong conventional implementation: a database can
compute `AVG` and `COUNT` per movie efficiently, and an application service can
apply a Bayesian confidence adjustment and choose the top ten. The comparison
therefore does not depend on an intentionally bad baseline.

The same workload is runnable in
[`examples/service-data-affinity`](../../examples/service-data-affinity/README.md).
That demo currently uses the internal `native_js` query-loop substrate because
public invocation adapters for `call` and `pushdown` Bindings are not yet
implemented. The execution shape and transfer bounds are real; the external
selector API shown below is directional pseudocode.

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

A reasonable implementation asks the database to group first. It does not pull
all raw ratings into Node.js.

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

The application receives many candidates that it immediately discards. It also
owns a database pool and executes the policy at whichever service replica
happened to receive the request.

## Merely Deploying The Same Service

The service can be compiled to WASM, and OCI execution is a future runtime
option. This improves packaging, isolation, lifecycle, and policy-controlled
placement.

It does **not** automatically change the algorithm. If the deployed service
still issues the same grouped query and receives every movie aggregate, the
same result set crosses the database/service boundary.

This distinction matters:

> Portable deployment changes where an existing program can run. A native
> rewrite changes what must move between storage and computation.

## Choose The Extraction Boundary

Do not rewrite the whole API service. Keep concerns that are not data-local in
the outer application:

```text
HTTP API service
  ├─ authentication
  ├─ request validation
  ├─ response caching policy
  ├─ external calls
  └─ rank movies against the ratings data
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

## Partition-Local Function

Each participating shard can compute its own best candidates. The following is
**directional pseudocode** for the richer external context, not the current
three-function WIT interface:

```js
export async function rankMovies(ctx, policy) {
  const rows = await ctx.sql`
    SELECT movie_id,
           AVG(rating) AS average,
           COUNT(*) AS rating_count
    FROM ratings
    GROUP BY movie_id
  `;

  const candidates = [];

  for (const row of rows) {
    const average = Number(row.average);
    const count = Number(row.rating_count);
    const bayesianMean =
      (average * count + policy.priorMean * policy.priorWeight) /
      (count + policy.priorWeight);
    const score =
      bayesianMean - policy.confidencePenalty / Math.sqrt(count);

    candidates.push({
      movieId: row.movie_id,
      average,
      count,
      score,
    });
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates.slice(0, policy.limit);
}
```

The SQL executes against the local shard context. The function returns only its
top ten, not every grouped movie.

In production code, a bounded heap would avoid sorting every local candidate.
It is omitted here so the data-flow difference remains easy to see.

## Reducer

The reducer receives only the bounded shard results:

```js
export function mergeTopMovies(partials, policy) {
  return partials
    .flat()
    .sort((left, right) => right.score - left.score)
    .slice(0, policy.limit);
}
```

With `R` participating shards and a requested limit `K`, the reducer receives
at most `R × K` candidates.

The runnable MovieLens demo uses two service replicas and `K = 10`, so each
replica publishes at most ten candidates and the merge sees at most twenty.
The grouped-SQL paths return one aggregate per movie.

## Selector-Driven Invocation

The outer service should identify the data and operation, not a Cell or node.
Again, this is **directional pseudocode**:

```js
export async function topMovies(lagrange, policy) {
  return lagrange.call({
    data: {
      table: 'ratings',
      where: {movieId: {all: true}},
    },
    function: 'rank-movies',
    arguments: policy,
    reduce: 'merge-top-movies',
  });
}
```

The intended kernel work is:

1. resolve the table selector to current partitions;
2. choose candidate replicas under consistency and locality policy;
3. ensure the pinned function Artifact is ready beside those replicas;
4. invoke the partition-local function in parallel;
5. collect bounded partials; and
6. run the reducer and return the final ten.

The caller does not know how many partitions exist, which nodes lead them, or
whether a split happened since the previous request.

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

### Native data-local path

```text
request
  → selector resolves current partitions
  → rankMovies runs beside each shard
      → local AVG and COUNT
      → local policy scoring
      → local top ten
  → at most shards × ten candidates cross the exchange
  → mergeTopMovies
  → ten results
```

Raft and distributed routing still exist. The improvement is not magical local
execution; it is the removal of avoidable intermediate movement and the
application/database boundary around each shard's useful work.

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

For top-ten ranking, `K` is fixed even as the dataset grows. `R` grows with the
partition shape, while `N` and usually `M` grow with the data.

### Latency

The rewrite can reduce latency when:

- service-to-database network time is material;
- per-shard work can run concurrently;
- intermediate result serialization is significant;
- the reducer input is much smaller than the grouped result; and
- execution is placed on or near suitable replicas.

It can fail to help when the dataset is tiny, one indexed query already returns
only ten rows, startup dominates, or the partition-local code consumes more CPU
than the transfer it removes.

Do not present a speedup ratio from the local demo. PostgreSQL and Lagrange use
different startup, topology, storage, and process arrangements there. The demo
compares correctness, transfer shape, and placement evidence. Performance
claims require repeated steady-state samples on controlled deployments.

### Operations

The outer service no longer needs to know:

- shard endpoints;
- partition maps;
- leader locations;
- the number of service workers matching the data layout; or
- how to redeploy those workers after splits and moves.

The function Artifact is immutable, the Binding defines invocation intent, and
Cells are system-policy output.

### Security

The function receives only declared capabilities. It does not inherit a broad
network environment and a database credential capable of reaching unrelated
tables.

The current public request-component context demonstrates this already:
undeclared table-slot access is denied at the component boundary. A richer
native context should preserve that model rather than become an unrestricted
client library.

### Failure semantics

A generic service process may fail after an unknown set of external side
effects. A kernel-mediated invocation can carry stronger identity and policy:

- invocation ID;
- deadline and cancellation;
- retry attempt;
- transaction scope;
- idempotency key; and
- permitted external effects.

Not all of these are exposed in the current public component API. They explain
why the context should grow as a kernel contract rather than as a collection of
convenience helpers.

## How Placement Learns

Current Lagrange already attributes successful service-issued statements to the
partitions they actually execute against.

That evidence is aggregated into placement weights:

- a read credits every node with an active replica because any can potentially
  serve it locally;
- a write credits the leader's node because the write must reach the leader; and
- latency-group weights provide a coarser "avoid crossing this domain" signal.

The rebalancer applies the weights with an incumbent-retention term so small
changes do not cause constant movement. This is a slow topology decision.
Read-locality routing is a separate fast per-query decision.

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
3. a replicated Lagrange service performing disjoint-shard scoring and bounded
   reduction.

It verifies that all three produce the same ordered top ten. It also records
placement evidence and the service's convergence toward the data it accesses.

The service phase currently drives the internal placement substrate directly
and uses a kernel-internal `native_js` query-loop module. It is not yet an
example of externally installing this operation as a `call` or `pushdown`
Binding. That limitation is important: the demo proves the execution and
placement shape, while the public native invocation surface remains roadmap
work.

## Use The Public API Today

To learn the current external component API rather than the internal reduction
substrate, run:

```sh
node examples/js-request-binding-deployment/run-js-request-binding-deployment.js
```

That example shows:

- JavaScript compiled to a genuine WASI component;
- `lagrange:cell/context` imports;
- Artifact installation;
- request Binding creation;
- table access declarations;
- a ready Cell invoked over HTTP; and
- capability denial for undeclared data.

Read [The Lagrange Native Programming Model](../native-programming-model.md) for
the current WIT interface and status boundary.

## A Migration Checklist

For one candidate hot path:

1. Record the existing SQL calls, returned rows, transferred bytes, and latency.
2. Identify the smallest operation whose inputs and output form a stable
   contract.
3. Keep authentication, external calls, and presentation logic outside.
4. Determine whether the operation is single-partition or can return bounded
   partials per partition.
5. Rewrite data access through the Lagrange context rather than direct database
   endpoints.
6. Declare the minimum table and capability access.
7. Compare correctness against the existing implementation.
8. Measure warm steady-state p50, p95, p99, bytes moved, CPU, and retries.
9. Inspect placement evidence and decision dimensions rather than assuming
   co-location.
10. Migrate another hot path only when the first one shows a meaningful win.

This incremental approach makes Lagrange adoption a sequence of measurable
extractions, not an all-or-nothing application rewrite.
