---
audience: development
documentClass: compatibility
---

# OCI Runtime Host Contract Pointer

OCI container execution is an internal runtime capability and compatibility
path. It is not part of Lagrange's main programming model: services are
authored and deployed as WASM components, and OCI exists as a possible
escape hatch for code that cannot yet run as WASM. OCI workloads do not
receive the distributed, function-level, data-local execution model.

Today the `oci_container` runtime kind is scaffold-only: descriptor
validation and an in-memory lifecycle scaffold exist, while real managed
container activation remains unsupported. Current runtime support is
defined by
[`docs/service-portability-capabilities.json`](../docs/service-portability-capabilities.json).

The selected but not fully implemented OCI host-agent design is planning
material. Its canonical location is
[`solve/specs/service-portability-ladder/oci-runtime-host-contract.md`](../solve/specs/service-portability-ladder/oci-runtime-host-contract.md).
