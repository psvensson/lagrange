# Accepted Boundaries

This file lists classified fallback situations that are currently retained
because they represent real owner-controlled recovery or degrade boundaries
rather than duplicated caller policy.

## Retained For Now

| Fallback ID | Boundary | Why It Is Retained For Now | Revisit Trigger |
| --- | --- | --- | --- |
| `FB-AD-001` | Admin authoritative snapshot degradation | Admin diagnostics are observation-only and intentionally degrade instead of blocking runtime progression. | Revisit if admin surfaces begin to drive progression or mutation authority. |
| `FB-BS-003` | Async probe diagnostics to sync readiness snapshot | Probe handlers need a bounded answer even when async diagnostics stall under pressure. | Revisit when probes can consume one precomputed async-safe snapshot. |
| `FB-BS-005` | Seed websocket to peer mesh bootstrap fallback | Bootstrap still needs a bounded degraded transport mode when the preferred websocket lane is unavailable. | Revisit when join bootstrap has one converged transport/discovery ingress. |
| `FB-CDC-001` | Authoritative control-plane read ingress ladder | The ladder already lives behind one owner-controlled ingress and is used as an explicit authoritative read lane. | Revisit after the ingress option surface is narrowed further. |
| `FB-CDC-002` | Cache visibility repair lane | This is an explicit owner-controlled recovery path for cache visibility gaps rather than a caller-local second path. | Revisit if repair logic leaks back out to callers. |
| `FB-CP-004` | Async published-summary repair vs sync consumption | The async path can enter the publication owner lane while sync callers cannot do owner-lane async work today. | Revisit when sync callers are replaced or precomputed snapshots exist. |
| `FB-CP-005` | Canonical authoritative control-plane read ingress | Multiple internal lanes exist but they are hidden behind one owner ingress rather than repeated at call sites. | Revisit when the option surface can be collapsed further. |
| `FB-CP-007` | Explicit liveness-based recovery projection | The degraded-evidence path is now explicit and single-sourced in the shared recovery protocol snapshot. | Revisit when readiness evidence dissemination can fully replace liveness rescue. |
| `FB-RB-003` | Reservation cleanup SQL recovery sweep | This is an explicit internal recovery sweep rather than a second steady-state coordinator path. | Revisit if similar SQL fallback starts appearing in steady-state coordinator logic. |
| `FB-RB-004` | Legacy operation owner fallback | Legacy rows still need a bounded compatibility bridge until the row shape is converged. | Revisit after legacy rows are backfilled or deleted. |
| `FB-RB-006` | Older readiness snapshot compatibility | This is a bounded snapshot-shape compatibility bridge rather than a live duplicate owner path. | Revisit after all producers emit the newer snapshot shape. |
| `FB-TP-001` | Grouped CDC delivery safe-fanout fallback | The dissemination owner already owns the degraded mode under one surface. | Revisit if more grouped-delivery bugs suggest the boundary should shrink further. |
| `FB-TR-001` | Router local-handler to remote-path handoff | The transport owner keeps the special-handler handoff inside one router surface. | Revisit if callers start reproducing the same routing fallback outside MessageRouter. |
| `FB-TR-002` | Reconnect authority/address ladder | Reconnect fallback resolution is still owned by the transport layer itself. | Revisit when bootstrap-only fallback hosts can be removed. |

## Notes

1. Retained does not mean permanent.
2. A retained boundary still requires one explicit justification in the
   register.
3. Rows marked `unclear` in the register are not automatically accepted
   boundaries; they need either justification or follow-on package work.
