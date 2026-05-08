# Load-Lane Serve-Readiness Freshness Cutover

## Why

The latest representative rerun moved `node-join-under-load` past priority
recovery publication closure and exposed a new dominant blocker:

1. `dominantReason = nodeAdmissionBlocked`
2. load-lane admin queries still saw
   `serveEligible = false` with
   `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
3. later bundle snapshots showed the canonical readiness owner had already
   reached:
   - `serveEligible = true`
   - `repairEligible = true`
   - `publicationRecoveryGate.ready = true`

That points at a caller-contract drift, not a new readiness grammar.

The load lane is a hard serve-admission boundary. It must not reuse a recent
ineligible readiness snapshot while merely scheduling a background refresh.
That reuse policy is acceptable for observation or soft degradation, but it is
not acceptable for a hard admission decision that is supposed to follow the
canonical readiness owner.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## Dominant Blocker

`node-join-under-load` still fails after publication closure moved to
`steady_published` because the load lane keeps denying queries from stale
ineligible `serveEligible` evidence instead of forcing a fresh readiness owner
evaluation before rejecting traffic.

## In Scope

1. Prove the load-lane admin caller still requests readiness in
   background-refresh mode for ineligible snapshots.
2. Cut that caller over to the existing `requireFreshOnIneligible` contract.
3. Keep the change inside the existing readiness/admin grammar.
4. Rerun the representative scenario and record blocker movement explicitly.

## Out Of Scope

1. A new readiness snapshot type.
2. Harness-side exemptions that bypass the load lane.
3. Changing the canonical `serveEligible` decision model itself unless the
   focused proof shows the owner contract is still wrong.

## Shared Boundary Contract

- Semantic owner:
  `ControlPlaneReadinessService` serve-admission decision.
- Canonical contract:
  hard serve-admission consumers may reuse fresh eligible snapshots, but must
  force a fresh owner evaluation before rejecting on a recent ineligible
  snapshot when authoritative refresh is available.
- Allowed consumers:
  `AdminWebSocketAPI` load lane and other hard serve-admission call sites.
- Prohibited reinterpretations:
  background-refresh reuse of cached `serveEligible = false` at a hard
  rejection boundary.
- Primary proof:
  admin websocket tests, readiness tests, and the sprint-level representative
  scenario rerun.

## Hotspots

1. `src/admin/admin-websocket-api-segment-2.js`
2. `test/admin/admin-websocket-api.test-part-2.js`
3. `src/control-plane/control-plane-readiness-service-segment-1.js`
4. `src/control-plane/control-plane-readiness-service-segment-2.js`
5. `architecture/current-owner-maps.md`

## Detection / Analysis Tasks

- [x] Prove the load lane currently asks for background refresh on ineligible
      readiness instead of fresh rejection proof.
- [x] Prove the readiness owner already exposes a canonical fresh-on-ineligible
      contract that the load lane can reuse.
- [x] Confirm whether the representative scenario moves once the load lane
      stops reusing stale negative serve snapshots.

## Implementation Tasks

- [x] Add a focused failing admin regression for stale ineligible
      serve-readiness reuse.
- [x] Cut the load lane over to `requireFreshOnIneligible`.
- [x] Update shared boundary notes if the caller contract changes durably.
- [x] Rerun the representative scenario and record blocker movement.

## Residual Closure Inventory

- [x] Owner path: hard serve-admission callers use fresh rejection proof.
- [x] Tail consumers: admin/load-lane diagnostics still preserve runtime
      authority details when admission is blocked.
- [x] Superseded path: load-lane serve rejection does not rely on
      background-refresh reuse of cached ineligible snapshots.
- [x] Proof: focused admin/readiness tests and representative scenario rerun.

## Progress Notes

1. The load-lane admin boundary now requests readiness with
   `requireFreshOnIneligible: true`, so hard serve rejection cannot reuse a
   recent cached `serveEligible = false` snapshot while only scheduling a
   background refresh.
2. Added focused stale-ineligible regressions and completed the shard-local
   helper coverage in `test/admin/admin-websocket-api.test-part-2.js`.
3. Validation passed:
   `npx tap test/admin/admin-websocket-api.test-part-2.js`,
   `npx tap test/control-plane/control-plane-readiness-service.test-part-4.js`,
   and `npm run test:metrics`.
4. Representative rerun on April 23, 2026 still fails on
   `dominantReason = nodeAdmissionBlocked`, but publication gate readiness is
   `true` and blocked or unresolved priority partitions are `0`. The stale
   cached ineligible serve snapshot misuse is no longer the dominant blocker.

## Validation

1. `npx tap test/admin/admin-websocket-api.test-part-2.js`
2. `npx tap test/control-plane/control-plane-readiness-service.test-part-3.js`
3. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

## Done When

1. The load lane uses the canonical fresh-on-ineligible readiness contract.
2. Hard serve-admission rejection is based on fresh owner evidence rather than
   recent stale negative snapshots.
3. The representative scenario either passes or exposes the next blocker
   explicitly.
