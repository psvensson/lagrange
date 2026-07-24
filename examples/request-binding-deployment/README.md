# Request Binding deployment

This example shows how to deploy a real WASI component through Lagrange's
Artifact / Binding / Cell surface and invoke it over HTTP. One command builds
[`component.wat`](component.wat), boots a local seed node, runs the lifecycle
SQL, sends authenticated requests, and shuts everything down.

## Prerequisites

- Node.js 22.12 or newer;
- repository dependencies installed with `npm install`; and
- [`wasm-tools`](https://github.com/bytecodealliance/wasm-tools) on `PATH`
  (the runner uses `wasm-tools parse` to build the committed WAT source).

## Run it

From the repository root:

```sh
node examples/request-binding-deployment/run-request-binding-deployment.js
```

The command prints a JSON report and exits non-zero if any check fails. It
uses a temporary data directory and OCI image layout, so no generated
component binary or opaque image is committed or left behind.

## What to expect

- A matching `POST /examples/request-binding` request reaches the genuine
  component and returns status `202`, header
  `x-lagrange-cell: request-binding-example`, and body
  `component wrote audit key 7`.
- The component reads its declared table context and writes `{key: 7,
  value: 42}` through slot 0.
- A second matched request that reads undeclared slot 1 is denied at the
  component boundary and cannot change the declared table.
- An unmatched static path returns `404` with `invoked: false`, produces no
  table effect, and records zero component invocations.

## Under the hood

The deployment goes through the authenticated PostgreSQL adapter and uses the
same parameterized lifecycle statements you would send from a PostgreSQL
client:

```sql
INSTALL SERVICE $1;
CREATE BINDING $1;
CONFIGURE SERVICE ACCESS $1;
```

The install payload points at the reproducible OCI layout built during the
run. `INSTALL SERVICE` returns the immutable `package_id`; the Binding pins
that value with the canonical `manifest_digest` and the `run` export. The access
declaration grants slot 0 read/write on `table:global.request_binding_audit`.

The runner boots the real seed owners and an HTTP listener on an ephemeral
loopback port. Lifecycle SQL runs through the production authenticated
PostgreSQL adapter in-process — no separate PostgreSQL TCP listener is opened.
The HTTP requests do cross the live node's REST listener and route only to a
ready Cell.

Scope: one request Binding, one local seed node. The example does not claim
dynamic routes, a complete PostgreSQL compatibility surface, or multi-node
placement behavior.
