---
audience: human
documentClass: compatibility
---

# Service Runtime Guide

This former combined guide has been split. A Lagrange service - endpoints,
partition functions, and reducers authored together - is documented across
the pages below. WASM is the current supported execution provider; provider
choice is not a separate service API.

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

The accepted `pushdown`, `change`, `time`, `once`, and `boot` Binding
source kinds are declared-only today. Managed OCI container activation is
unsupported. The OCI provider is a future execution option for the same
Artifact / Binding / Cell and service-call semantics, not a second programming
model.
