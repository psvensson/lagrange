---
audience: human
documentClass: compatibility
---

# WASM Services Guide

This former combined guide has been split. A Lagrange service - endpoints,
partition functions, and reducers authored together and deployed as WASM -
is documented across the pages below.

Choose the document that matches your question:

- [The Lagrange Native Programming Model](native-programming-model.md)
  explains the service programming model: endpoints, partition functions,
  reducers, and the context API.
- [Service Deployment Guide](service-deployment-guide.md) packages a
  service, installs the Artifact, creates request and call Bindings,
  declares table access, waits for a Cell, and invokes it.
- [Execution Semantics](execution-semantics.md) states the retry,
  idempotency, movement, and reduction contract a caller can rely on.
- [Rewrite A Hot Path For Lagrange](tutorials/rewrite-a-hot-path.md)
  compares a strong grouped-SQL baseline with partition-local application
  policy and bounded reduction.
- [Current Capabilities And Limitations](current-capabilities-and-limitations.md)
  is the authoritative runtime and API status page.

The deployment model is Artifact / Binding / Cell. Request Bindings run
genuine WASI components behind authenticated HTTP endpoints. Call Bindings
run a partition function on the partitions of a declared table and a
reducer over the partial results, invoked over authenticated pgwire with
`CALL BINDING $1` - or from a request handler in the same Artifact through
the policy-authorized `callBinding` host import.

The legacy `js_wasm_component_v1` callback envelope is JavaScript, not a
WebAssembly component. The accepted `pushdown`, `change`, `time`, `once`,
and `boot` Binding source kinds are declared-only today. Managed OCI
container activation is unsupported; OCI exists as a compatibility
scaffold, not a peer of the WASM path.
