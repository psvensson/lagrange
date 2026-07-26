---
audience: human
documentClass: current
---

# Legacy Callback Guide

This page isolates the older embedded/uploaded callback surface so it is not
confused with supported Artifact / Binding / Cell service deployment.

## What It Is

The callback runtime accepts an async `run(ctx)` function. The context can issue
SQL, emit rows, and use distributed-query movement primitives such as lookup,
emit, and broadcast.

Two forms exist:

- **Embedded:** application or test code calls the runtime directly.
- **Uploaded rehearsal:** JavaScript source and a manifest are stored in the
  legacy `code` and `module_manifests` tables and invoked by the example runner.

The uploaded `wasm_component` callback artifact is a
`js_wasm_component_v1` JavaScript envelope evaluated as JavaScript. It is not a
WebAssembly binary or component.

## What It Is Not

- It is not the external service installation surface.
- It does not create an Artifact, Binding, or Cell.
- It is not evidence that arbitrary WebAssembly callbacks are compiled or run.
- OCI callback invocation remains unsupported.

Use the [service deployment guide](service-deployment-guide.md) for new
externally deployed services.

## When To Use It

Use this surface when studying or maintaining the distributed-query callback
examples:

```sh
npm start
node scripts/examples/build-upload-run.js \
  --target ws://127.0.0.1:8081/api/admin/stream
```

The individual examples under `examples/distributed-sql/` cover iterator,
stage, plan, movement, and callback-lifecycle behavior. Their JavaScript files
are modules loaded by the runner; invoking an individual `index.js` directly
does not run the scenario.

## State Rule

Treat callback closure state as disposable. A callback may execute on different
nodes or more than once. Durable shared state belongs in tables, and external
side effects require application-level idempotency.
