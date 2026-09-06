---
id: service-portability-ladder
status: open
proof: certification
legacy: true
roadmapRow: null
graduatesTo: null
quests:
  - oci-container-driver-live-activation-protocol-admission
  - oci-container-driver-live-activation-durable-state
  - oci-container-driver-live-activation-engine-translation
  - oci-container-driver-live-activation-owner-handoff
  - oci-container-driver-live-activation-production-engagement
  - oci-container-driver-live-activation
authorizes: []
---

# Service portability ladder

Services run under the OCI container driver on a live host; the spec lives in solve/specs/service-portability-ladder/.

Derived by the solve-v2 migration from the quests listed above (amendment 7).
The operator seals `doneWhen` and `authorizes` before new quests start here;
until then the epic is `legacy: true` and its scope is unenforced.
