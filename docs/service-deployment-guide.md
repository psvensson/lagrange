---
audience: human
documentClass: current
---

# Service Deployment Guide

This guide describes the supported external service model:
**Artifact / Binding / Cell**. It does not use the older uploaded JavaScript
callback rehearsal.

## The Three Objects

- An **Artifact** is an installed immutable manifest and digest-pinned payload.
- A **Binding** is immutable desired execution intent: one Artifact export, one
  source kind, budgets, and no caller-selected replica count.
- A **Cell** is a ready running actual derived from the Binding. The cluster
  chooses capacity and placement.

Cells are disposable compute. Durable service state belongs in ordinary tables.

## Current Invocation Boundary

The catalog accepts `request`, `change`, `time`, `once`, `boot`, `call`, and
`pushdown` Binding sources. Only `request` currently has a public invocation
adapter. Other sources can converge to placed Cells but are not yet publicly
invocable.

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

1. Package a component and a schema-v3 manifest.
2. Use `INSTALL SERVICE` with an artifact source and idempotency key.
3. Record the returned immutable `package_id` and `manifest_digest`.
4. Use `CREATE BINDING` to pin an export and source to that Artifact.
5. Use `CONFIGURE SERVICE ACCESS` to declare allowed tables and modes.
6. Observe desired state in `service_definitions`.
7. Wait until a matching actual row is ready and running; that actual is a Cell.
8. Invoke the request route using an authenticated HTTP request.

The manifest format is documented in
[Lagrange Service Manifest](../architecture/lagrange-service-manifest.md). The
owner and convergence model is
[Minimal Deployment Surface](../architecture/minimal-deployment-surface.md).

## Run The Complete Example

Prerequisites are Node.js 22.12+, installed repository dependencies, and
`wasm-tools` on `PATH`.

```sh
node examples/request-binding-deployment/run-request-binding-deployment.js
```

The example builds a real component, boots a disposable node, performs
lifecycle SQL, waits for a ready Cell, invokes it over HTTP, verifies declared
table access, and cleans up.

See the
[request-binding-deployment README](../examples/request-binding-deployment/README.md)
for the exact assertions and expected output.

## Write The Service In JavaScript

Services can be authored in any language with a WASI-component toolchain.
For JavaScript, [ComponentizeJS](https://github.com/bytecodealliance/ComponentizeJS)
compiles a plain JavaScript module into a genuine WASI component; the runtime
deploys and executes it identically to a component built from any other
source. No `wasm-tools` binary is needed for this path.

```sh
node examples/js-request-binding-deployment/run-js-request-binding-deployment.js
```

The [js-request-binding-deployment README](../examples/js-request-binding-deployment/README.md)
shows the committed JavaScript source, the WIT world it targets
(`lagrange:cell/context` imports plus a `run` export), and the identical
lifecycle SQL.

## Runtime Status

- `wasm_component`: externally installable and runs genuine WASI component
  Cells.
- `native_js`: kernel-internal, not externally installable.
- `oci_container`: descriptor and in-memory lifecycle scaffold only; managed
  container activation is unsupported.

Use [Current Capabilities And Limitations](current-capabilities-and-limitations.md)
as the authoritative status page.
