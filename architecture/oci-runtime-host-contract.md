---
documentClass: compatibility
---

# OCI Runtime Host Contract Pointer

The selected but not fully implemented OCI host-agent design is planning
material. Its canonical location is
[`solve/specs/service-portability-ladder/oci-runtime-host-contract.md`](../solve/specs/service-portability-ladder/oci-runtime-host-contract.md).

Current runtime support is defined by
[`docs/service-portability-capabilities.json`](../docs/service-portability-capabilities.json):
`oci_container` has descriptor validation and an in-memory lifecycle scaffold,
while real container activation remains false.
