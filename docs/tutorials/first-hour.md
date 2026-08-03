---
audience: human
documentClass: current
---

# First Hour With Lagrange

Lagrange is a distributed runtime for data-intensive services: you write one
service - endpoints, partition functions, and reducers together - deploy it
as WASM, and call it like any other service.

In this first hour you start one local node, perform a SQL round trip, see
how a row maps to a partition, and deploy and invoke a genuine WASI service
through a request Binding. That is the deployment half of the story; the
final section points at the data-local call path that builds on it.

## Prerequisites

- Node.js 22.12 or newer
- npm
- the repository checked out locally
- `wasm-tools` on `PATH` for the service-deployment section

## 1. Install And Configure

From the repository root:

```sh
npm install
cp .env.example .env
```

For a first local node, leave `NODE_ID` and `SEED_NODE_ADDRESS` unset. The
node mints and persists its identity; no seed address means this node creates
the cluster.

## 2. Start One Node

```sh
npm start
```

The default listeners are:

- REST API: `8080`
- admin WebSocket: `8081`
- node transport: `8082`

In another terminal, distinguish process startup from traffic readiness:

```sh
curl -s http://127.0.0.1:8080/livez
curl -s http://127.0.0.1:8080/startupz
curl -s http://127.0.0.1:8080/readyz
```

`/livez` answers only whether the process is alive. Wait for `/startupz` and
`/readyz` to return successful responses before querying.

## 3. Run A SQL Round Trip

Open the terminal administration client:

```sh
npm run cli -- localhost:8081
```

Press `6` for the SQL view. Run each statement with `Ctrl+Enter`:

```sql
CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT);
```

Table creation records durable intent before every configured replica has
necessarily converged. The response may therefore be an owner envelope with
`contractState: "pending"` and `nextAction: "wait"` or `"retry"`. That is
progress, not a terminal failure, and you should not resubmit `CREATE TABLE`.

Use a read-only routing check as the deterministic handoff:

```sql
SELECT id
FROM users
WHERE id = '__readiness__';
```

If that check returns a pending or deferred envelope, wait its `retryAfterMs`
value (or one second when no delay is supplied) and run the same check again.
Continue only after it returns a normal successful row set; an empty row set
is expected.

```sql
INSERT INTO users (id, name)
VALUES ('alice', 'Alice'), ('bob', 'Bob');
```

```sql
SELECT id, name
FROM users
WHERE id = 'alice';
```

Then inspect routing:

```sql
EXPLAIN DISTRIBUTED
SELECT id, name
FROM users
WHERE id = 'alice';
```

The `id` predicate can narrow to the owning partition. Compare it with a
query on `name`: a predicate the partition resolver cannot use may fan out
instead of failing.

## 4. Inspect The Physical Model

In the same CLI:

1. Press `3` for Tables.
2. Select `users`.
3. Open its Partitions view.
4. Inspect the partition id, key range, replica count, and leader.

A new table begins with one unbounded partition. In this single-node
tutorial, writes can use direct mode because no remote leader exists. The
configured multi-node replica policy does not mean this one-node exercise has
already demonstrated quorum replication.

Partitions matter beyond storage: they are where Lagrange runs your service's
partition functions. The routing you just inspected is the same machinery
that decides where data-local service code executes.

## 5. Deploy And Invoke A Service

Stop the manually started node before running this self-contained example;
the example starts and stops its own disposable local node.

```sh
node examples/request-binding-deployment/run-request-binding-deployment.js
```

If you would rather author the component in plain JavaScript instead of WAT,
run the
[js-request-binding-deployment example](../../examples/js-request-binding-deployment/README.md)
afterwards - it deploys a ComponentizeJS-built component through the
identical lifecycle SQL and needs no `wasm-tools` binary.

The runner:

1. builds the committed WAT component with `wasm-tools`;
2. installs an immutable Artifact;
3. creates a request Binding;
4. configures declared table access;
5. waits for a ready Cell;
6. invokes the Cell over HTTP; and
7. proves matched, denied, and unmatched request behavior.

Expect a JSON report showing a `202` response for the matching request and
the body `component wrote audit key 7`. The example exits non-zero if any
assertion fails.

## 6. Where The Call Path Fits

The request Binding you just invoked is one of two live endpoint kinds. The
second is the **call endpoint**: a Binding that declares a single-table
SELECT as its data selector, a partition function (`run`) that executes
beside each relevant partition, and a reducer (`reduce`) that folds the
bounded partials into one result. A client invokes it with one statement
over authenticated pgwire:

```sql
CALL BINDING $1
```

That is the data-local half of the product story - the part where a single
endpoint invocation fans out across the nodes holding the data and only
compact partials cross the network. Check the
[examples index](../../examples/README.md) for the current runnable
call-path example, and read
[Rewrite A Hot Path For Lagrange](rewrite-a-hot-path.md) for the full
walkthrough.

## 7. What You Have And Have Not Proven

You have exercised:

- node startup and readiness;
- SQL table creation, writes, reads, and routing diagnostics;
- the Table → Partition relationship; and
- genuine Artifact → Binding → Cell deployment with an HTTP endpoint.

You have not exercised leader failover, quorum loss, learner catch-up,
multi-node rebalancing, cross-node Cell placement, or a multi-node
data-local call. Continue with the
[distributed-systems primer](../distributed-systems-primer.md) and the
[examples index](../../examples/README.md) before drawing conclusions about
those behaviors.

## Continue

- [The Lagrange Native Programming Model](../native-programming-model.md) -
  service, endpoints, partition functions, reducers, data-local execution.
- [Rewrite A Hot Path For Lagrange](rewrite-a-hot-path.md) - extract one
  data-intensive operation into a Lagrange service.
- [Execution Semantics](../execution-semantics.md) - the invocation
  contract: retries, idempotency, budgets, movement.
- [Service Deployment Guide](../service-deployment-guide.md) - the lifecycle
  SQL in operational detail.
