---
id: service-portability-ladder
status: open
proof: certification
roadmapRow: null
graduatesTo: null
quests:
  - oci-container-driver-live-activation-protocol-admission
  - oci-container-driver-live-activation-durable-state
  - oci-container-driver-live-activation-engine-translation
  - oci-container-driver-live-activation-owner-handoff
  - oci-container-driver-live-activation-production-engagement
  - oci-container-driver-live-activation
authorizes:
  - src/runtime
  - architecture/oci-runtime-host-contract.md
  - docs/service-portability-capabilities.json
  - test
  - solve/specs/service-portability-ladder
doneWhen:
  probe: scenario-harness
  args:
    scenario: oci-container-driver-live-activation
    consecutive: 3
    reportDir: test-output/reports/oci-container-driver-live-activation
---

# Service portability ladder

Services run under the OCI container driver on a live host; the spec lives in solve/specs/service-portability-ladder/.

Derived by the solve-v2 migration from the quests listed above (amendment 7).
The operator seals `doneWhen` and `authorizes` before new quests start here;
until then the epic is `legacy: true` and its scope is unenforced.

## Sealed acceptance

Sealed 2026-09-07 from the derived-epic packet in
`solve/epics/solve-v2/derived-epic-sealing-packets.md`.

`consecutive: 3` is deliberate. The parent quest carried it and the migration's
per-frontier metrics dropped it, so both surviving frontiers would otherwise
close on one run while their own `deterministic-first-live-terminal` constraint
demands three distinct measuring live passes. Restoring three returns the claim
to what it was rather than tightening it.

A pass means a digest-pinned OCI installation traverses shipped seed and join
composition to an authenticated Docker host agent which pulls, creates, starts,
inspects, stops and removes the exact fully labelled real container; that
security, receipt, fence, identity and configuration failures are typed
fail-closed; and that no managed resource remains.

**What this does not demonstrate.** Anything about runtimes other than OCI, and
nothing new about the three frontiers already landed - those are provenance, not
evidence. The capability flip of `realContainerActivation` and the removal of
the mutable feature gate must happen in the same terminal aggregate; a pass that
leaves the gate in place has not demonstrated the claim.

It also does not demonstrate native OCI Call Cell invocation. That is a
separate, downstream Phase 5 capability defined by
`architecture/native-oci-call-cells.md` and the portability spec. It reuses this
epic's real managed-container lifecycle but must enter through the existing
Call Cell owner and `ServiceRuntimeLifecycle.invoke()` rather than widening the
Docker host-agent control surface.

**Open question inherited from the parent's triage.** Mint a narrower successor
covering only the two frontiers never attempted, citing the three landed ones as
provenance, or keep the five-frontier seal open until the OCI lane is scheduled.
The scenario both surviving frontiers name does not exist in the tree, so either
answer requires building it.
