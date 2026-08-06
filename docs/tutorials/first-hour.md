# First Hour With Lagrange

The fastest way to understand Lagrange is to run the current code-first service
path, inspect the source, and then scaffold the same project shape yourself.

## Prerequisites

- Node.js 22.12 or newer
- npm
- a source checkout

## 1. Install dependencies

```bash
git clone https://github.com/psvensson/lagrange
cd lagrange
npm install
```

## 2. Read the authored service

Open:

```text
examples/call-binding-account-summary/lagrange.service.js
```

It contains:

- two HTTP handlers;
- one `distributed()` operation;
- one literal SQL selector;
- a partition-local `run()` function;
- a `reduce()` function; and
- no hand-authored Binding name, package ID, manifest digest, or access-policy
  JSON.

The compiler derives those records from object-key identity and the handlers'
`calls` declarations.

## 3. Run the proof

```bash
npm run demo:account-summary
```

The runner:

1. compiles the JavaScript service into a genuine WASI component;
2. generates and validates the manifest, request Bindings, call Binding, and
   outbound-call policy;
3. starts a disposable local node;
4. creates and loads an `account_activity` table;
5. forces one split so the data spans two partitions;
6. deploys the generated records over lifecycle SQL;
7. calls `POST /accounts/summary`;
8. calls the same distributed operation directly over authenticated
   PostgreSQL wire;
9. proves that an undeclared call target is refused before dispatch;
10. repeats the HTTP request with the same idempotency key and proves replay;
    and
11. shuts the node down.

A successful report includes the account summary and the number of contributing
shards.

## 4. Trace the request

```text
POST /accounts/summary
  -> accountSummary handler
  -> call(summarizeAccountActivity, {accountId})
  -> run() over partition 1's local batch
  -> run() over partition 2's local batch
  -> numeric count/total/largest/flagged partials
  -> reduce()
  -> one JSON response
```

The handler and both distributed functions are authored together. Runtime
placement and fan-out are not source-level deployment units.

## 5. Understand what the demo proves

It proves:

- the current code-first authoring model;
- real WASM component compilation and invocation;
- generated deployment records;
- request-to-distributed-call composition;
- two-partition planning and reduction;
- fail-closed outbound-call policy; and
- idempotent outer-request replay.

It does not prove:

- multi-node performance;
- quorum behavior;
- replica recovery;
- large-shard input;
- a production SLO; or
- compatibility with an arbitrary PostgreSQL application.

Both partitions are on one node, the table is small, and the default public
call path accepts at most 4,096 selected rows per shard batch. Treat it as a
functional proof, not a scale result.

## 6. Scaffold your own service

Install the CLI:

```bash
npm install --global lagrange-server
```

Create a project:

```bash
lagrange service init my-service
cd my-service
npm test
```

The scaffold separates ordinary handler logic into a host-testable module and
keeps the service descriptor in `lagrange.service.js`.

Generate and build:

```bash
lagrange service generate .
lagrange service build .
```

Generation writes the component entry, deployment records, deployment plan, and
typings under `.lagrange/`. Build produces `.lagrange/component.wasm` and the
local OCI layout used as installation input.

To deploy to a running cluster:

```bash
lagrange service deploy . \
  --layout .lagrange/oci \
  --idempotency-key <unique-key>
```

Deployment requires the PostgreSQL-wire connection and credential environment
described by the generated project and CLI help.

## 7. Inspect a node separately

To start a source-checkout node:

```bash
cp .env.example .env
npm start
```

Readiness endpoints:

```bash
curl -s http://127.0.0.1:8080/livez
curl -s http://127.0.0.1:8080/startupz
curl -s http://127.0.0.1:8080/readyz
```

Open the admin client in another terminal:

```bash
npm run cli -- localhost:8081
```

The admin listener is unauthenticated and should remain on loopback. The
single-node process is useful for inspection, but it cannot prove a normal
three-voter replica shape.

## Continue

- [Programming model](../native-programming-model.md)
- [Execution semantics](../execution-semantics.md)
- [Evaluating Lagrange](../evaluate.md)
- [Migration and adoption](../migration.md)
- [Architecture](../../architecture/INDEX.md)
