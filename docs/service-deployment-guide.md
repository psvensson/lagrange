# Building And Deploying A Service

The recommended path starts from one code-first `lagrange.service.js`. The
compiler generates the WASM entry, manifest, Bindings, access policies, and
deployment records.

Most service authors should not hand-write Artifact or Binding JSON.

## Scaffold

```bash
lagrange service init account-summary
cd account-summary
npm test
```

The generated project contains ordinary unit-testable handler code, the service
definition, vendored authoring helpers, and editor types.

## Author

```js
import {defineService} from './authoring/define-service.js';
import {distributed} from './authoring/distributed-operation.js';
import {http} from './authoring/request-handler.js';
import {sql} from './authoring/sql-template.js';

const summarizeAmounts = distributed({
  statement: sql`SELECT id, amount_cents FROM account_activity`,
  run(rows, _arguments, {emit}) {
    const shardKey = rows[0]?.id;
    if (shardKey !== undefined) {
      emit(`total:${shardKey}`, rows.reduce(
        (total, row) => total + Number(row.amount_cents ?? 0), 0));
    }
    return {scanned: rows.length};
  },
  reduce(partials) {
    return {
      totalCents: partials.reduce((total, [_key, value]) => total + value, 0),
    };
  },
});

export default defineService({
  name: 'account-summary',
  version: '1.0.0',
  operations: {summarizeAmounts},
  handlers: {
    amountSummary: http.post('/amounts/summary', {
      calls: [summarizeAmounts],
      handle(_request, {call, json}) {
        return json(call(summarizeAmounts, {}));
      },
    }),
  },
});
```

The `calls` reference is both source wiring and least-authority declaration.
The compiler uses it to generate the handler's outbound-call policy.

## Generate

```bash
lagrange service generate .
```

Generation validates the source model and creates deterministic files under
`.lagrange/`:

- component entry code;
- deployment plan;
- service manifest;
- request and call Bindings;
- access policies; and
- updated runtime typings.

The generated names are implementation output. Source code calls operation
descriptors, not durable Binding-name strings.

## Build

```bash
lagrange service build .
```

Build componentizes the generated entry into `.lagrange/component.wasm` and
creates a local OCI layout as immutable installation input. OCI is the artifact
transport here; the running service is a WASI component Cell, not a managed
container.

## Deploy

```bash
lagrange service deploy . \
  --layout .lagrange/oci \
  --idempotency-key <unique-key>
```

Deploy sends the generated records through authenticated PostgreSQL-wire
lifecycle SQL. The cluster stores verified component bytes in replicated
artifact tables before a Cell depends on them.

The lower-level sequence is:

```sql
INSTALL SERVICE $1;
CREATE BINDING $1;
CONFIGURE SERVICE ACCESS $1;
```

A composed service normally has one request Binding per HTTP handler and one
call Binding per distributed operation. The current pre-v2 compiler supports
multiple HTTP routes but one distributed operation per component.

## Invoke

A request Binding is reached through an authenticated HTTP route:

```text
POST /amounts/summary
Authorization: Basic ...
Content-Type: application/json
```

A call Binding also has a direct authenticated PostgreSQL-wire surface:

```sql
CALL BINDING $1;
```

That direct interface is useful for testing and integrations. Application code
inside a request handler normally calls the operation descriptor through its
context.

## Observe readiness

The deployment records describe desired state. A service is ready only when a
matching Cell actual is running and its endpoint has been published.

Use the administration surfaces to inspect:

- installed service package and manifest digest;
- Binding lineage;
- desired service definition;
- ready Cell actuals;
- service endpoint rows;
- activation leases; and
- typed lifecycle failures.

Do not infer activation merely because `INSTALL SERVICE` or `CREATE BINDING`
returned successfully.

## Upgrade and removal

The lifecycle grammar also accepts:

```sql
UPGRADE SERVICE $1;
REMOVE SERVICE $1;
SHOW SERVICE $1;
SHOW SERVICES;
```

Every mutation carries an idempotency key. `0.x` has no general backward-
compatibility or supported rolling-upgrade guarantee. Rehearse the exact
version pair and preserve a rollback path before changing a pilot cluster.

## Security rules

- External lifecycle control uses password-authenticated PostgreSQL wire with
  TLS; trust mode is loopback development policy.
- HTTP request routes currently use Basic authentication against the configured
  PostgreSQL-wire credential verifier.
- The component receives only declared host capabilities.
- Node transport is plain WebSocket and must stay on a trusted private network.
- The admin WebSocket is unauthenticated and loopback-only by default.

Read [Security](security.md) before exposing any listener.

## Current call limits

Before choosing a workload, account for:

- one literal single-table `SELECT` fixed at deployment;
- no SQL interpolation or per-call selector parameter;
- 4,096 rows per shard by default, plus byte and deadline bounds;
- finite numeric partials with shard-disjoint keys;
- 64 emits and 1,024 coordinated partial entries by default;
- eight concurrent shard runs by default, with same-host serialization;
- one nested distributed call per request; and
- no global snapshot across independently read shards.

A shard that exceeds its bound fails. The public path does not silently stream
or page it.

## Current reference example

Run:

```bash
npm run demo:account-summary
```

Then inspect:

- [`examples/call-binding-account-summary/lagrange.service.js`](../examples/call-binding-account-summary/lagrange.service.js)
- [the example walkthrough](../examples/call-binding-account-summary/README.md)
- [programming model](native-programming-model.md)
- [execution semantics](execution-semantics.md)
