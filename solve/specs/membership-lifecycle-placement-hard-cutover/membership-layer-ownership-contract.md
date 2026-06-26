# Membership layer-ownership contract (cutover plan §5 step 1)

Status: **enforced** by `test/control-plane/membership-layer-boundary.guard.test.js`
(2026-06-21). This is the structural-guard half of §5 step 1 ("name the layers");
the prose here is the named contract the guard pins.

Membership is the classic **group membership problem** — consensus-hard (FLP 1985),
requiring a failure detector (Chandra–Toueg 1996). It is therefore NOT a local
function; it is three layers, each with one owner. See
`single-owner-cutover-completion-plan.md` §1–§3 for the theory and §8 for the
implementation-contact findings that produced this contract.

## The three layers and their owners

| Layer | Owner (today) | Responsibility |
|---|---|---|
| **1. Failure detector (evidence)** | the readiness/liveness guards + transport-liveness gates (currently scattered; Lever #2 will name them) | suspect/confirm liveness from heartbeats, leases, transport connectivity |
| **2. Membership agreement (view install)** | `control_plane_publications` row + `publication_epoch`, written client→leader→Raft | a totally-ordered, **monotonic** sequence of installed views |
| **3. View computation + dissemination** | `active-node-projection.js` (`resolveActiveNodeViews` / `resolveCanonicalActiveNodeIds`) | integrate FD evidence with the installed view; observers READ the result |

## The rule the guard enforces

**Only the layer-3 owner and its sanctioned planners may call the projection entry
points. Everyone else READS the installed published view.**

- Projection entry points (FD + view computation): `resolveActiveNodeViews`,
  `resolveCanonicalActiveNodeIds` — both in `src/control-plane/active-node-projection.js`.
- Installed-view READ API (the path non-owner code must use):
  - `resolvePublishedActiveNodeIds()` / `resolveLatestPublishedPublicationRow()`
    (`src/control-plane/active-node-publication-snapshots.js`)
  - `getLatestPublishedMembershipRow()` (rebalancer cache read of the published row)
  - `MembershipPublicationCoordinatorReads.getLatestPublishedClusterPublicationSync()`

### Allowlist (the only sanctioned projection callers)

`resolveActiveNodeViews`:
- `src/control-plane/active-node-projection.js` — defines it
- `src/control-plane/membership-publication-planning-evidence.js` — planning gap evidence
- `src/control-plane/membership-publication-candidate-derivation.js` — recovery/liveness candidate derivation
- `src/admin/admin-control-snapshot-node-view-projection.js` — operator "why-not-ready" diagnostics

`resolveCanonicalActiveNodeIds`:
- `src/control-plane/active-node-projection.js` — defines it
- `src/bootstrap/owners/bootstrap-cluster-view-owner.js` — startup authority (recovery-eligible cohort)

Each of these genuinely needs the FD/readiness overlay (planning, recovery cohort,
operator diagnostics, bootstrap). They are NOT "who is active" reads — those go to the
read API above. A 21-file consumer audit (plan §8) confirmed **zero** other callers and
**zero** ad-hoc membership-truth re-derivers at the time of writing, so the guard landed
GREEN with no pre-existing violators to fix.

## Changing the allowlist

If a new caller genuinely needs the full projection (FD overlay), add it to BOTH this
contract and the `*_ALLOWED` set in the guard test, with a one-line justification. If you
only need "who is active," use the read API instead — that is the default and the guard
will (correctly) reject a new projection call.

## What this is NOT

- Not a deletion of the projection (refuted — plan §7) and not a deletion of the
  readiness guards (they ARE the FD evidence — inventory rev 2).
- Lever #2 (fold the FD evidence + transport-liveness gates into one *named* detector)
  and view-change formalization (plan §5 steps 3–4) are the larger, later work; this
  contract just fixes the layer boundary so they have a stable base.
