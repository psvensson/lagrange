---
audience: human
documentClass: current
---

# Related Systems And Familiar Ideas

Lagrange combines partitioned SQL storage with service functions that execute
beside selected partitions. The individual ideas have precedents. These
comparisons explain the design; they are not feature-equivalence, maturity, or
performance claims.

## PostgreSQL functions: application logic beside stored data

[PostgreSQL user-defined functions][postgres] are a useful starting point:
application logic can execute inside the database rather than retrieving every
intermediate row into an application process.

Lagrange makes the distributed shape explicit in the service source. An
operation declares a selector, a `run()` function for each selected partition,
and a `reduce()` function for the combined answer. The cluster places and
routes that work.

**Where the analogy stops:** Lagrange is not a PostgreSQL extension. It owns
SQLite-backed partitions and exposes only a subset of the PostgreSQL client
protocol and SQL behavior. An existing PostgreSQL function cannot simply be
installed unchanged as a Lagrange service.

Start with the [complete account-summary service][account-source]. Its sums and
counts could also be expressed in SQL. The example makes execution observable;
it does not prove an advantage over a good grouped query.

## TiDB and TiKV: push work down rather than pull rows up

TiDB's [predicate pushdown examples][tikv-pushdown] show filtering executing in
the TiKV coprocessor. Doing selection near stored data can reduce the rows sent
back to the SQL layer. The execution plan makes the placement visible as
`cop[tikv]` rather than a root-side operation.

The shared principle is reducing intermediate data movement. Lagrange exposes
an explicitly authored service operation: its partition function can apply
application filtering, scoring, or validation and emit bounded numeric
partials. Those functions are deployed as WASM component code.

**Where the analogy stops:** this is not a claim that Lagrange has TiDB's SQL
coverage, optimizer, transaction guarantees, or operating maturity. It is also
not a claim that storage-side computation is new. Evaluate whether exposing
that mechanism as one service is useful for a particular application.

In the current Lagrange [selector contract](native-programming-model.md#the-data-selector),
per-call arguments affect `run()`, not SQL planning. The account-summary example
therefore does not automatically prune partitions by `accountId`.

## Durable Objects: colocating code and state

[Cloudflare Durable Objects][durable-objects] combine an addressable object with
private durable storage and colocated computation. That is a useful reference
for why code placement and state location should be designed together.

**Where the analogy stops:** a Lagrange Cell is not a durable object or an
application-owned shard. It is a replaceable running component instance and has
no per-service Raft log. Durable state lives in ordinary partitioned tables.
A single operation can run across several table partitions and then reduce the
results. The application does not choose one Cell for each business entity.

See [Vocabulary](vocabulary.md#service-deployment-hierarchy) and the
[execution contract](execution-semantics.md).

## WebAssembly components: a portable execution boundary

The [Component Model][components] describes binaries with typed imports and
exports. [WIT][wit] describes those interfaces; it does not contain the
implementation. WASI supplies standard interfaces, while Lagrange adds its own
service and data-access interfaces.

**Where the analogy stops:** a portable component format is not automatic
support for every language, library, operating-system API, or permission.
JavaScript is Lagrange's current supported code-first authoring path. A build
produces a component, not an ordinary Node.js process. An OCI installation
layout is packaging, not a promise of managed container execution.

The [security guide](security.md) explains which authority the host supplies.

## Feature stores: an application area, not the same product

[Hopsworks' architecture][hopsworks] distinguishes feature groups from feature
views and offers both low-latency online feature retrieval and an offline path
for training and batch data. That is a broader application contract than a
storage-and-execution mechanism.

A question worth testing is whether one expensive request-time feature
calculation could operate on bounded local rows and return small numeric
partials. This is a proposed workload, not a Hopsworks integration or a shipped
feature-store capability. Keep the current fixed-selector, input-bound, and
independent-read limits visible when evaluating it.

**Where the analogy stops:** Lagrange does not thereby supply feature lineage,
training-serving consistency, point-in-time feature joins, model management, or
a replacement for Hopsworks' online store. When a precomputed feature lookup
already returns a small answer cheaply, distributed computation may add no
value. Start with a measured operation, not a platform replacement.

## The practical comparison

For any of these reference points, ask three questions: what work moves beside
data, which bytes disappear from the request path, and which correctness and
operational guarantees the workload needs. A smaller exchange is a mechanism,
not a measured speedup. Use the [evaluation brief](evaluate.md) to test both the
benefit and the remaining gaps.

[postgres]: https://www.postgresql.org/docs/current/xfunc.html
[tikv-pushdown]: https://docs.pingcap.com/tidb/stable/predicate-push-down/
[durable-objects]: https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/
[components]: https://component-model.bytecodealliance.org/design/components.html
[wit]: https://component-model.bytecodealliance.org/design/wit.html
[hopsworks]: https://docs.hopsworks.ai/latest/concepts/fs/
[account-source]: ../examples/call-binding-account-summary/lagrange.service.js
