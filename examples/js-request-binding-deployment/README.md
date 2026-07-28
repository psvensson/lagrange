# JavaScript service as a WASI component

This example shows the full JavaScript path: write a service in plain
JavaScript ([`service.js`](service.js)), compile it into a genuine WASI
component with [ComponentizeJS](https://github.com/bytecodealliance/ComponentizeJS),
and deploy it through the same Artifact / Binding / Cell surface as any other
component. One command builds the component, boots a local seed node, runs the
lifecycle SQL, sends authenticated requests, and shuts everything down.

Unlike the older JavaScript-envelope callback rehearsal, the artifact deployed
here is a real WebAssembly component: the JavaScript source is embedded with a
WebAssembly build of the SpiderMonkey engine, and the node executes it exactly
as it executes the WAT-built component in
[`request-binding-deployment`](../request-binding-deployment/README.md).

## Prerequisites

- Node.js 22.12 or newer; and
- repository dependencies installed with `npm install` (this pulls in
  `@bytecodealliance/componentize-js`; no `wasm-tools` binary is needed).

## Run it

From the repository root:

```sh
node examples/js-request-binding-deployment/run-js-request-binding-deployment.js
```

The command prints a JSON report and exits non-zero if any check fails. It
uses a temporary data directory and OCI image layout, so no generated
component binary or opaque image is committed or left behind.

## How the JavaScript becomes a component

[`service.js`](service.js) imports the host interface directly:

```js
import {read, write} from 'lagrange:cell/context';

export function run(request) { /* ... */ }
```

The world it targets is committed as [`wit/world.wit`](wit/world.wit):
`lagrange:cell/context` provides `read`, `write`, and `capability`, and the
component exports `run: func(request: string) -> string`. The build step calls
`componentize()` with `random`, `stdio`, `clocks`, `http`, and `fetch-event`
disabled, so the produced component imports nothing except
`lagrange:cell/context` — the same import surface the Cell runtime provides to
every request component.

## What to expect

The service keeps a running-total ledger. Each request posts
`{"key": <n>, "amount": <m>}`; the component reads the previous request's row,
adds the new amount, and records the total under the request's own key.
(Request Cell writes are inserts of new keys — the effect writer issues
`INSERT` statements — so each request writes a fresh row instead of updating
a prior one.)

- `POST /examples/js-request-binding` with `{"key": 1, "amount": 10}` returns
  status `202`, header `x-lagrange-cell: js-request-binding-example`, and body
  `stored 10 at key 1`; the write lands in
  `global.js_request_binding_ledger` as `{key: 1, value: 10}`.
- A second request with `{"key": 2, "amount": 5}` reads the committed first
  row through slot 0 and returns `stored 15 at key 2` — the JavaScript
  observed durable state written by the previous invocation.
- A request whose body is `"deny"` makes the component read undeclared slot 1;
  the read is denied at the component boundary and the ledger is unchanged.

## Under the hood

The deployment is identical to the WAT example — the runtime does not know or
care that the component was produced from JavaScript:

```sql
INSTALL SERVICE $1;
CREATE BINDING $1;
CONFIGURE SERVICE ACCESS $1;
```

The install payload points at the reproducible OCI layout built during the
run. `INSTALL SERVICE` returns the immutable `package_id`; the Binding pins
that value with the canonical `manifest_digest` and the `run` export. The
access declaration grants slot 0 read/write on
`table:global.js_request_binding_ledger`.

Scope: one request Binding, one local seed node. The example does not claim
dynamic routes, a complete PostgreSQL compatibility surface, or multi-node
placement behavior.
