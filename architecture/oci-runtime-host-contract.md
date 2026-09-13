---
audience: development
documentClass: compatibility
---

# OCI Runtime Host Contract Pointer

OCI container execution is an internal runtime capability and compatibility
path. Managed long-running OCI services let existing applications keep their
ordinary runtime and PostgreSQL-facing behavior while Lagrange owns lifecycle
and placement.

A separate planned capability, [Native OCI Call Cells](native-oci-call-cells.md),
lets a Lagrange-aware service expose named functions from that same OCI image so
the existing Call Cell owner can invoke them on selected partition hosts. That
future data plane reuses `ServiceRuntimeLifecycle.invoke()` and the registered
runtime driver. It does **not** add `invoke` to the Docker host-agent operation
surface or make the host agent a scheduler, router, or retry owner.

Today the `oci_container` runtime kind is scaffold-only: descriptor validation
and an in-memory lifecycle scaffold exist, while real managed container
activation and native OCI Call Cell invocation remain unsupported. Current
runtime support is defined by
[`docs/service-portability-capabilities.json`](../docs/service-portability-capabilities.json).

The selected but not fully implemented OCI host-agent design is planning
material. Its canonical location is
[`solve/specs/service-portability-ladder/oci-runtime-host-contract.md`](../solve/specs/service-portability-ladder/oci-runtime-host-contract.md).
