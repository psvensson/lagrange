# The Lagrange Programming Model

A Lagrange service is one source-level unit containing HTTP handlers,
distributed operations, and reducers. The compiler turns that source into a
WASM component plus the immutable deployment records the runtime needs.

> Colocated in source. Distributed in execution.

## Recommended source model

A scaffolded project starts with:

```bash
lagrange service init account-summary
```

The project contains:

```text
account-summary/
  lagrange.service.js       authored service definition
  src/handler.js            ordinary unit-testable handler code
  test/handler.test.js      host-side tests; no WASM required
  authoring/                guest-safe descriptor helpers
  runtime-types.d.ts        generated editor types
  .lagrange/                generated entry, records, component, OCI layout
```

The four source helpers are:

- `defineService({name, version, operations, handlers})`;
- `distributed({statement, run, reduce})`;
- `http.get(path, route)` and `http.post(path, route)`; and
- the interpolation-free `sql` template tag.

## One service

```js
import {defineService} from './authoring/define-service.js';
import {distributed} from './authoring/distributed-operation.js';
import {http} from './authoring/request-handler.js';
import {sql} from './authoring/sql-template.js';

const summarizeAccountActivity = distributed({
  statement: sql`SELECT id, account_id, amount_cents FROM account_activity`,
  run: summarizeRun,
  reduce: summarizeReduce,
});

export default defineService({
  name: 'account-summary',
  version: '1.0.0',
  operations: {summarizeAccountActivity},
  handlers: {
    accountSummary: http.post('/accounts/summary', {
      calls: [summarizeAccountActivity],
      handle: handleAccountSummary,
    }),
  },
});
```

Object keys are identities. The compiler derives durable request and call
Binding names from `accountSummary` and `summarizeAccountActivity`. Source code
does not contain package IDs, manifest digests, or Binding-name strings.

The pre-v2 compiler currently permits multiple HTTP handlers but exactly one
distributed operation per component. That restriction is enforced rather than
hidden behind generated tags.

## HTTP handlers

A handler receives a normalized request and a context containing only the
helpers it is allowed to use.

```js
function handleAccountSummary(request, {call, json}) {
  const accountId = request.body?.accountId ?? null;
  const summary = call(summarizeAccountActivity, {accountId});
  return json(summary);
}
```

The handler can call only operations listed in its `calls` declaration. The
compiler emits the durable outbound-call access policy from that reference. An
absent policy or undeclared operation fails before dispatch.

The current request ingress uses HTTP Basic authentication. The server derives
tenant, principal, and roles from its configured credential verifier; request
payloads cannot claim identity.

## The data selector

A distributed operation declares one SQL statement:

```js
statement: sql`SELECT id, account_id, amount_cents FROM account_activity`
```

Current rules:

- it must be a literal single-table `SELECT`;
- SQL template interpolation is rejected;
- the selector is fixed when the operation is deployed;
- per-call variation goes in the arguments passed to `call()`; and
- those arguments filter or affect policy inside `run()`, not in SQL planning.

This distinction matters for scale. If the selector chooses every row in a
large partition and `run()` filters most of them, the complete selected batch
must still fit the shard row and byte bounds. The current public call path is
not an unbounded streaming scan.

## Partition functions

`run(rows, arguments, context)` executes once per selected partition on the
node hosting that partition's leader replica.

```js
function summarizeRun(rows, {accountId}, {emit}) {
  let count = 0;
  let totalCents = 0;
  let shardKey = null;

  for (const row of rows) {
    if (row.account_id !== accountId) continue;
    count += 1;
    totalCents += row.amount_cents;
    shardKey = shardKey === null ? row.id : Math.min(shardKey, row.id);
  }

  if (shardKey !== null) {
    emit(`count:${shardKey}`, count);
    emit(`total:${shardKey}`, totalCents);
  }
  return {matched: count};
}
```

The return value is per-shard bookkeeping. Coordinated output leaves through
`emit(key, value)`.

Current partial rules:

- every value must be a finite number;
- keys must be disjoint across shards;
- duplicate keys fail the complete invocation;
- default emit budget is 64; and
- default coordinated partial cap is 1,024 entries.

Derive the key suffix from data whose ownership is partition-local. Do not use
a constant key such as `total`, because two shards would overlap.

## Reducers

`reduce(partials, arguments)` lives in the same source and component as the
partition function.

```js
function summarizeReduce(partials, {accountId}) {
  let transactions = 0;
  let totalCents = 0;

  for (const [key, value] of partials) {
    if (key.startsWith('count:')) transactions += value;
    if (key.startsWith('total:')) totalCents += value;
  }

  return {accountId, transactions, totalCents};
}
```

The coordinator calls the reducer only after every expected shard slot is
present, fresh, bounded, and disjoint. It publishes one atomic result snapshot.
The guarantee is exactly-once visibility, not exactly-once execution.

## Generated deployment contract

Run:

```bash
lagrange service generate .
lagrange service build .
lagrange service deploy . --layout .lagrange/oci --idempotency-key <key>
```

`generate` normalizes the source and produces:

- a generated component entry;
- an immutable service manifest;
- one request Binding per handler;
- one call Binding for the distributed operation;
- one outbound-call policy per handler that declares calls;
- a deterministic deployment plan; and
- editor typings.

`build` componentizes the generated entry and creates the local OCI layout used
as installation input. `deploy` replays the generated records through the
existing authenticated lifecycle SQL owners.

Artifact, Binding, and Cell remain useful runtime terms:

- **Artifact** - immutable component bytes plus manifest;
- **Binding** - one invocation source, target, and budget declaration; and
- **Cell** - a ready running instance placed by the cluster.

They are compiler and runtime concepts. Most service authors should not hand
write their JSON.

## Runtime flow

```text
POST /accounts/summary
  -> request Binding selects handler
  -> handler calls operation descriptor
  -> durable policy authorizes the call
  -> fixed SELECT resolves partitions
  -> bounded local row batch on each partition host
  -> run() emits numeric partials
  -> completeness gate
  -> reduce() under one lease
  -> one result snapshot
  -> handler response
```

If a partition host has no ready Cell, the invocation creates a time-limited
activation lease. Placement starts one on that host and dispatch waits within
the caller deadline.

Shard dispatch is bounded and parallel across hosts. The default is eight
concurrent shard runs. A single component instance executes one invocation at a
time, so shards on the same host serialize.

## Failure and state rules

- Treat `run()` as a pure function of rows and arguments.
- Put coordinated output in `emit`, not in the return value.
- Do not depend on cross-shard arrival order.
- Do not assume all shard reads share one global timestamp.
- Keep Cell-local memory disposable; durable state belongs in tables.
- Design non-coordinated side effects to tolerate re-execution after ambiguous
  failures.
- A caller disconnect does not cancel a running distributed call.

The complete contract is [Execution semantics](execution-semantics.md).

## Choosing an operation

Strong candidates:

- large input, bounded result;
- shard-local filtering or policy;
- top-K, counts, sums, scoring, or validation;
- several sequential round trips against the same partition key; and
- application-owned fan-out and reduction.

Weak candidates:

- one cheap indexed query;
- external API dominated work;
- a selector that cannot fit the shard batch bound;
- cross-partition snapshot transactions;
- structured partials or streaming exchange; and
- deep nested call graphs.

The [account-summary example](../examples/call-binding-account-summary/README.md)
is the current source-level reference. The
[low-level service deployment guide](service-deployment-guide.md) documents the
generated contract and lifecycle SQL.
