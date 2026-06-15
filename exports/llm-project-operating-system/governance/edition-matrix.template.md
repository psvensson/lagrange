> EXAMPLE — illustrative only. Replace with this project's own content.

# Edition Matrix (Template)

This document is the canonical mapping from feature area to edition and
implementation home. It is the **scope gate**: it decides what may drive work in
*this* repository versus what is visibility-only here.

Replace the rows below with your project's real feature areas, editions, and
implementation homes. The rows shipped here are neutral placeholders so the table
is editable from a known-good starting point.

Implementation rule (load-bearing — keep it):
- Only rows whose `Implementation home` is **this repo** may drive specs, tasks,
  or code in this repository.
- Rows mapped to an external/commercial home are **visibility-only** here: they
  may be referenced as context, but they do not define implementation work in
  this repository unless a Quest is explicitly scoped to local-owned substrate
  that excludes the external-only behavior.

| Feature area | Edition | Implementation home | Canonical roadmap or backlog | May drive work in this repo? | Notes |
|--------------|---------|---------------------|------------------------------|------------------------------|-------|
| Core API | Open | This repo | `../steering/roadmap.md` | Yes | Core capability owned here |
| Core data model | Open | This repo | `../steering/roadmap.md` | Yes | Core capability owned here |
| Operational visibility basics | Open | This repo | `../steering/roadmap.md` | Yes | Metrics, diagnostics, admin visibility |
| Developer workflow and debugging | Open | This repo | `../steering/roadmap.md` | Yes | Local developer experience |
| Shared service foundations | Open | This repo | `../steering/roadmap.md` | Yes | Shared substrate stays in scope here even when it enables paid services |
| Billing | Paid | External / commercial | external paid backlog | No | First-party paid service, owned elsewhere |
| Advanced analytics | Paid | External / commercial | external paid backlog | No | Dashboards, advanced reporting, owned elsewhere |
| Security and tenancy | Enterprise | External / commercial | external paid backlog | No | Tenant isolation, RBAC, enterprise controls |
| Licensing and edition gating | Paid / Enterprise | External / commercial | external paid backlog | No | Commercial activation and entitlement checks |
| Experimental capability | TBD | Not yet classified | visibility backlog only | No | Do not implement until edition and implementation home are assigned |

## How To Edit This Table

1. One row per feature area. Keep feature areas coarse enough to be stable, fine
   enough to make a clear in-scope / out-of-scope call.
2. Set `Implementation home` to **this repo** only when the work is genuinely
   owned and implemented here.
3. Set `May drive work in this repo?` to `Yes` only when the implementation home
   is this repo. An external home is always `No` here.
4. A feature whose edition or implementation home is not yet decided stays
   `Not yet classified` / `No` until it is assigned — never default an
   unclassified area into scope.

The companion rule of how this gate is enforced lives in
[`scope-discipline.md`](scope-discipline.md).
