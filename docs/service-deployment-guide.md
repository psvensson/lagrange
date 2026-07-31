---
audience: human
documentClass: current
---

# Service Deployment Guide

This guide describes the supported external service-deployment model:
**Artifact / Binding / Cell**.

Deployment is only one part of the Lagrange model. Packaging existing code as a
WASI component gives you lifecycle, isolation, restart, declared capabilities,
and policy-controlled placement. The larger data-local wins appear when the
service uses the Lagrange context instead of direct database endpoints and,
as the public API matures, when a hot path is invoked against a data selector
with partition-local work and reduction.

Read [The Lagrange Native Programming Model](native-programming-model.md) before
choosing an application boundary. It explains what is public today, what is
product direction, and what a rewrite can save.

This guide does not use the older uploaded JavaScript callback rehearsal.

## Decide What You Are Deploying

There are three distinct cases:

| Case | Appropriate first step |
| --- | --- |
| Existing portable service | Package it as a WASI component and create a request Binding |
| Service that should follow the data it reads | Use the injected context and declare the minimum table access so reads and writes are attributable |
| Data-intensive hot path | Design the function and reduction contract first; use the current request surface where it fits and track `call` / `pushdown` invocation as a current limitation |

Do not assume that moving an unchanged service into the cluster changes its data
movement. If it still retrieves the same rows or aggregates into the same
service process, the algorithm and boundary remain the same.

## The Four Objects At The Boundary

### Artifact

An **Artifact** is installed immutable code plus a schema-v3 manifest and a
digest-pinned payload.

### Binding

A **Binding** is immutable desired execution intent: one Artifact export, one
source kind, budgets, and no caller-selected replica count.

The catalog accepts `request`, `change`, `time`, `once`, `boot`, `call`, and
`pushdown` sources. Only `request` currently has a public invocation adapter.
The others can converge to placed Cells but are not yet a public application
surface.

### Cell

A **Cell** is a ready running actual derived from a Binding. The cluster chooses
capacity and placement. Cells are disposable compute; durable service state
belongs in ordinary partitioned and replicated tables.

### Context

The **context** is the capability-controlled host interface available to the
component. It is the application/kernel boundary and the source of attributed
service data access.

The current request-component context is:

```wit
interface context {
  read: func(table: u32, key: u32) -> s32;
  write: func(table: u32, key: u32, value: s32);
  capability: func(capability: u32) -> s32;
}
```

Table numbers are capability slots resolved through the service-access
declaration. A component must not contain a database endpoint, connection pool,
partition map, or node-selection policy.

## What Lagrange Can Learn From Context Access

Successful statements issued with the service identity are attributed to the
partitions they actually execute against. That evidence can influence:

- slow topology-time placement of runtime-service Cells;
- node and latency-group affinity weights;
- local or same-latency-group read candidate ordering; and
- diagnostics explaining why a Cell was placed where it was.

This is why using the context is not merely syntactic. Direct external database
connections lose the execution identity and partition-access evidence that
makes automatic data affinity possible.

See [Process: Data Affinity](../architecture/process-data-affinity.md) for the
full mechanism.

## Lifecycle SQL

Lifecycle commands use one JSON bind parameter so code, configuration,
idempotency, and authenticated identity stay separate:

```sql
INSTALL SERVICE $1;
UPGRADE SERVICE $1;
REMOVE SERVICE $1;
SHOW SERVICE $1;
SHOW SERVICES;
CONFIGURE SERVICE ACCESS $1;
CREATE BINDING $1;
```

External lifecycle control uses authenticated PostgreSQL wire ingress. Trust
mode is loopback-only development policy and is not accepted for external
lifecycle control.

## Deployment Sequence

1. Identify the smallest service or hot-path boundary you want to deploy.
2. Package a component and schema-v3 manifest.
3. Use `INSTALL SERVICE` with an artifact source and idempotency key.
4. Record the returned immutable `package_id` and `manifest_digest`.
5. Use `CREATE BINDING` to pin an export and source to that Artifact.
6. Use `CONFIGURE SERVICE ACCESS` to grant the minimum table slots and modes.
7. Observe desired state in `service_definitions`.
8. Wait until a matching actual row is ready and running; that actual is a Cell.
9. Invoke the request route with an authenticated HTTP request.
10. Verify allowed access, denied access, durable effects, and placement evidence.

The manifest format is documented in
[Lagrange Service Manifest](../architecture/lagrange-service-manifest.md). The
owner and convergence model is
[Minimal Deployment Surface](../architecture/minimal-deployment-surface.md).

## JavaScript Component Example

Services can be authored in any language with a WASI-component toolchain. For
JavaScript, ComponentizeJS compiles a plain module into a genuine WASI
component.

```js
import {read, write} from 'lagrange:cell/context';

const LEDGER = 0;

export function run(requestJson) {
  const request = JSON.parse(requestJson);
  const {key, amount} = request.body;
  const total = read(LEDGER, key - 1) + amount;

  write(LEDGER, key, total);

  return JSON.stringify({
    status: 202,
    headers: [['content-type', 'text/plain']],
    body: `stored ${total} at key ${key}`,
  });
}
```

The build disables random, stdio, clocks, HTTP, and fetch-event imports, so the
component imports only `lagrange:cell/context`. The access declaration maps
slot `0` to the ledger table with read/write permission. An attempt to use an
undeclared slot is denied at the component boundary.

Run the complete example:

```sh
node examples/js-request-binding-deployment/run-js-request-binding-deployment.js
```

The
[JavaScript request-binding README](../examples/js-request-binding-deployment/README.md)
explains the source, WIT world, lifecycle SQL, expected output, and denial case.

## Source-Built WAT Example

To build a component from the committed WAT source instead:

```sh
node examples/request-binding-deployment/run-request-binding-deployment.js
```

Prerequisites are Node.js 22.12+, installed repository dependencies, and
`wasm-tools` on `PATH`.

The example builds a genuine component, boots a disposable node, performs
lifecycle SQL, waits for a ready Cell, invokes it over HTTP, verifies declared
table access, and cleans up.

See the
[request-binding-deployment README](../examples/request-binding-deployment/README.md)
for exact assertions and expected output.

## From Deployment To A Native Rewrite

After the first component works, inspect the operation rather than immediately
moving more services.

Ask:

- How many database statements does one request execute?
- How many rows or aggregates cross into the service?
- Do several statements touch the same partition key?
- Can each partition return a bounded partial result?
- Which code is application policy that should remain versioned code?
- Which external calls must stay outside the data-local function?

A good extraction keeps authentication and third-party I/O in the outer service
and moves only the data-intensive operation.

The detailed MovieLens walkthrough in
[Rewrite A Hot Path For Lagrange](tutorials/rewrite-a-hot-path.md) compares a
strong grouped-SQL baseline with shard-local scoring and bounded top-N
reduction. It also states exactly which parts are runnable today and which API
calls are directional pseudocode.

## Current Invocation Boundary

Current public support:

- externally installed genuine WASI components;
- request Bindings invoked through authenticated HTTP;
- `read`, `write`, and `capability` context imports;
- declared table-slot access and capability denial;
- service identity attribution and data-affinity placement; and
- Artifact / Binding / Cell lifecycle through authenticated SQL.

Not yet public:

- invocation adapters for `change`, `time`, `once`, `boot`, `call`, and
  `pushdown` sources;
- a richer external selector and partition-local SQL context;
- a public fan-out and reduction API; and
- managed OCI container activation.

Use [Current Capabilities And Limitations](current-capabilities-and-limitations.md)
as the authoritative status page.

## Runtime Status

- `wasm_component`: externally installable and runs genuine WASI component
  Cells.
- `native_js`: kernel-internal, not externally installable.
- `oci_container`: descriptor and in-memory lifecycle scaffold only; managed
  container activation is unsupported.
