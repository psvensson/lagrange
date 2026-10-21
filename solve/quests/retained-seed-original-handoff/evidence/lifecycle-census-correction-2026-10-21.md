---
audience: development
documentClass: current
---

# Lifecycle source-census correction

Parent: 5fb184fc8d68a9cbdf3305d48deb8efd1bf34e2d. Self-review only;
this preservation is neither independent approval nor landing.

The inherited RED in lab #624 was also present on parent8b3638233 in
lab #625. Diagnostic-only source a2a4b8362b52dcc4a5056236a730d5305a05ec9a,
lab #633, identified the exact two matches. The native retirement in
src/node/replica-handler-remove-execution-methods.js supplies the captured
service.raft. The other is WasmServiceLifecycle.retireReplica(origin) in
src/runtime/wasm-component-driver-consensus.js:150: its distinct owner
consumes the retained creation, not the native administration signature.

The source census now parses imports and direct native administration calls.
It follows named import renames and literal computed access, fails closed on
unsupported escaping/destructuring/dynamic/shadowed bindings, and checks for
an explicit runtime property that cannot be overwritten by a later spread.
Unrelated owners, comments and string literals are not native retirements.
The existing five runtime-generation behavioral cases are unchanged.
The guard's added controls remove the actual production runtime argument in
an in-memory source variant and require the same census to reject it.

No production source, sealed acceptance, deadline, ratchet or receipt changed.
The diagnostic-only file is not part of this correction. A locked retry-0
native run is still required for this exact candidate; passing the guard
would not prove original startup wiring or the public cold handoff.
