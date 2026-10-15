---
audience: development
documentClass: current
---

# SDK Host Conformance Fixture Inventory

A read-only preparatory tool for the planned WASM/native SDK parity acceptance.
This **does not run application code** and must never be cited as successful
SDK conformance or as evidence that OCI Call Cells are available.

Run from the repository root:

```sh
node scripts/inspect-sdk-host-conformance.js
```

The tool consumes the canonical [WIT](../../wit/world.wit) through the
[WIT inventory](../../scripts/inspect-wit-host-surface.js), fixture scenarios
under [`test/fixtures/sdk-host-conformance-cases.json`](../../test/fixtures/sdk-host-conformance-cases.json),
and the current [provider status](../service-portability-capabilities.json).
It emits a provider/world/mode matrix with **no passing states**:

- `requires-runtime-evidence`: the runtime may be available, but the scenario
  still needs an exact-head live witness.
- `provider-unavailable`: the selected provider is not yet runnable.

The cases describe intended admitted and refused behavior for host imports.
They do not define the signatures, privileges, error codes, budgets, retry
policy, or executable component identity. Those remain with the WIT contract
and established runtime/invocation owners.

In particular, the combined service worlds declare both context imports,
but only capabilities for the currently admitted Binding mode are live.
Refusal cases explicitly protect that boundary. A planned accepted
`call-bounded` case is **not** evidence that arbitrary nested native calls
work today.

## Next proof step

A provider-specific acceptance adapter must drive the actual installed
operation through the production owner path and record exact binary/revision,
Binding, invocation world/mode, expected vs actual result and denial, deadline,
budgets, and host/runtime identity. The canonical case IDs should be shared
between WASM and native SDKs. An absent or unsupported provider is not a skip
or a pass. A runtime error cannot be rewritten as a success by the adapter.

The tool deliberately does not accept handwritten `passed` flags or a
manually selected provider override. Only the real execution tests and
independently reviewed receipts can close the portability acceptance ladder.

See [Native OCI Call Cells](../../architecture/native-oci-call-cells.md),
[Execution semantics](../execution-semantics.md), and the
[programming model](../native-programming-model.md) for
the operating context.
