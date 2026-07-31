---
audience: human
documentClass: compatibility
---

# WASM Services Guide

This former combined guide has been split so supported external deployment is
not mixed with the older callback rehearsal or with future native invocation
APIs.

Choose the document that matches your question:

- [The Lagrange Native Programming Model](native-programming-model.md) explains
  why deploying a portable artifact and rewriting a hot path are different,
  introduces the current context API, and marks the selector/call direction as
  not yet public.
- [Service Deployment Guide](service-deployment-guide.md) installs an Artifact,
  creates a request Binding, declares table access, waits for a Cell, and
  invokes it.
- [Rewrite A Hot Path For Lagrange](tutorials/rewrite-a-hot-path.md) compares a
  strong grouped-SQL baseline with partition-local application policy and
  bounded reduction.
- [Current Capabilities And Limitations](current-capabilities-and-limitations.md)
  is the authoritative runtime and API status page.

The supported deployment model is Artifact / Binding / Cell. Request Bindings
run genuine WASI components. The current public component context provides
`read`, `write`, and `capability` imports.

The legacy `js_wasm_component_v1` callback envelope is JavaScript and is not a
WebAssembly binary or component. Accepted `call` and `pushdown` Binding source
kinds do not yet have public invocation adapters, and managed OCI container
activation is unsupported.
