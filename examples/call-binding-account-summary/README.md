# Account summary: one endpoint, distributed execution

This is the current code-first public-path example.

An application sends one authenticated HTTP request. The service handler calls
one declared distributed operation. Lagrange runs the operation beside each
selected partition, coordinates the emitted partials, runs the reducer, and
returns one JSON response.

```text
POST /accounts/summary
  -> handler
  -> run() on partition A
  -> run() on partition B
  -> bounded numeric partials
  -> reduce()
  -> HTTP response
```

The authored service is one file:
[`lagrange.service.js`](lagrange.service.js).

## What the developer writes

```js
import {defineService} from '../../src/authoring/define-service.js';
import {distributed} from '../../src/authoring/distributed-operation.js';
import {http} from '../../src/authoring/request-handler.js';
import {sql} from '../../src/authoring/sql-template.js';

const summarizeAccountActivity = distributed({
  statement: sql`SELECT id, account_id, amount_cents, flagged FROM account_activity`,
  run: summarizeRun,
  reduce: summarizeReduce,
});

export default defineService({
  name: 'account-sumary',
  version: '1.0.0',
  operations: {summarizeAccountActivity},
  handlers: {
    accountSummary: http.post('/accounts/summary', {
      calls: [summarizeAccountActivity],
      handle: handleAccountSummary,
    }),
    accountHealth: http.get('/accounts/health', {
      handle: handleAccountHealth,
    }),
  },
});
```

Object keys provide the source identities. The compiler derives the component
entry, manifest, request Bindings, call Binding, and outbound-call policy.
There is no package ID, manifest digest, or durable Binding-name string in the
authored service.

The full file contains the partition function, reducer, HTTP Handlers, typed
failure mapping, and the denial probe used by the runner.

## Run it

Requirements: Node.js 22.12 or newer and repository dependencies.

```bash
npm install
npm run demo:account-summary
```

The runner:

1. builds the service into a genuine WASI component;
2. generates the deployment records from `lagrange.service.js`;
3. starts one disposable Lagrange node;
4. creates and fills `account_activity`;
5. forces the table into two partitions;
6. deploys the generated Artifact, Bindings, and access policy;
7. invokes the HTTP summary and health routes;
8. invokes the direct `CALL BINDING` surface;
9. proves an undeclared call target is refused before dispatch;
10. proves an HTTP replay with the same idempotency key does not rerun the
    nested distributed call; and
11. prints a machine-readable report and shuts down.

## What the application sees

```text
POST /accounts/summary
Authorization: Basic ...
Content-Type: application/json

[{"accountId":202}
```

Response:

```json
{
  "accountId": 202,
  "transactions": 50,
  "totalCents": 535775,
  "largestCents": 17991,
  "meanCents": 10716,
  "flagged": 12,
  "contributingShards": 2
}
```

The same component also serves `GET /accounts/health`. That route declares no
distributed calls, so the compiler emits no outbound-call policy for it.

## What runs where

For the summary route:

```text
request Cell
  -> call(summarizeAccountActivity, {accountId})
  -> fixed SELECT resolves two partitions
  -> each partition host reads its local bounded row batch
  -> run() filters account 202 and emits four numeric partials
  -> reduce() combines the complete partial set
  -> handler returns JSON
```

Only emitted partials enter the distributed exchange. The selected rows are
read on their partition host.

The runner uses one physical node, so both partition runs serialize on that
node. Multi-node integration tests exercise host-local row reads and overlapping
runs when partitions live on different nodes, but this command is not itself a
multi-node proof.

## Why this is useful

The example makes the source model concrete:

- endpoint, distributed operation, and reducer are reviewed together;
- the handler calls an operation descriptor rather than deployment wiring;
- the compiler derives least-authority call policy;
- the runtime owns partition resolution, activation, fan-out, retries, and
  reduction; and
- the application receives one ordinary HTTP response.

It also proves the difference between code-first authoring and the lower-level
Artifact / Binding / Cell runtime contract. Most developers should use the
former and let the compiler produce the latter.

## Boundaries of the proof

This example is intentionally small. It proves the functional path, not an
unbounded scan or a production scale claim.

Current limits that matter here:

- the selector is a literal single-table `SELECT` fixed at deployment;
- the `accountId` argument is applied inside `run()`, not pushed into the SQL
  selector;
- one shard batch is limited to 4,096 rows by default and also has byte and
  deadline bounds;
- the public path does not stream or page a partition that exceeds those
  bounds;
- partial values must be finite numbers with shard-disjoint keys;
- one request may make one nested distributed call;
- the pre-v2 compiler supports one distributed operation per component;
- up to eight shard runs are dispatched concurrently by default, but one
  component instance executes one invocation at a time; and
- independently read partitions do not form one global snapshot.

Do not extrapolate from 150 rows to millions of rows per partition. A workload
that exceeds the bounded selector contract needs narrower selection or a future
streaming/paging surface.

## The refusal and replay checks

The denial probe asks the handler to name an operation that its generated
access policy does not allow. The host rejects it before route resolution or
execution; the handler maps the typed failure to HTTP 403.

The replay probe sends the same POST twice with one `Idempotency-Key`. The
second outer response is served from the durable invocation journal, and the
nested distributed call keeps one coordination result. This is exactly-once
visibility for the request result, not a universal exactly-once side-effect
claim.

## Continue

- [Programming model](../../docs/native-programming-model.md)
- [Execution semantics](../../docs/execution-semantics.md)
- [Technical evaluation](../../docs/evaluate.md)
- [MovieLens comparison](../service-data-affinity/README.md), which uses a
  larger multi-process workload but an internal service runtime rather than
  this public code-first path
