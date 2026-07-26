---
audience: human
documentClass: compatibility
---

# WASM Services Guide

This former combined guide has been split so supported external deployment is
not mixed with the older callback rehearsal.

- For new service deployments, use the
  [Service Deployment Guide](service-deployment-guide.md).
- For the older embedded/uploaded JavaScript callback surface, use the
  [Legacy Callback Guide](legacy-callback-guide.md).
- For authoritative runtime support and limitations, use
  [Current Capabilities And Limitations](current-capabilities-and-limitations.md).

The supported deployment model is Artifact / Binding / Cell. Request Bindings
run genuine WASI components. The legacy `js_wasm_component_v1` callback
envelope is JavaScript and is not a WebAssembly binary or component.
