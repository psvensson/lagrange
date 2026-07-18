---
id: formation-complexity-consolidation
roadmapRow: null
status: discussing
graduatesTo: null
---

# Epic: Formation complexity consolidation (verified 2026-07-18 deep review)

## Intent (why now)

A deep review of the 2026-07-17/18 formation quest chain (ledger self-move cost,
leader-pin loss, readiness-snapshot coupling, JOINING phase fence — range
`0d46d934..HEAD` + working tree) found that the day's bugs and most of its added
code share three root causes: core facts have no single authoritative
representation, authority intent is hand-threaded as optional flags, and the
batch planner needs suppression valves for costs it creates itself. Every claim
below was **adversarially verified against source by an independent subagent on
2026-07-18** (verdicts noted). This epic is the durable home for those findings
so consolidation can be quested instead of re-derived.

Companion history that BOUNDS this epic (do not re-litigate):

- `membership-single-owner-cutover.md` — "delete the active-membership
  projection / single-owner cutover" is REFUTED. Nothing here reopens it: the
  phase proposal below changes what `nodes.status` means, not how the
  projection integrates liveness evidence.
- `membership-lifecycle-placement-hard-cutover/readiness-and-reconcile-simplification-inventory.md`
  — readiness guards are an ad-hoc failure detector; consolidation not
  deletion. Lever #3 (rebalancer reconcile/accounting consolidation) is named
  there as the highest-confidence simplification target; findings F7–F9 below
  are the concrete evidence for it.
- `hysteresis-consolidation.md` — the release-tracker debounce (F10) belongs to
  that epic's primitive inventory.

## Verified findings inventory

Read-path / gateway (control-plane):

- **F1 (CONFIRMED, fixed 2026-07-18).** `buildExecuteQueryKey` omitted
  `preferLeader` from the executeQuery coalescing identity while the engine
  consumes it for leader routing
  (`control-plane-system-table-gateway-options.js:49-51`,
  `sql-query-engine-select-execution.js:220-257`) — the live remnant of the
  leader-pin coalescing bug class fixed on the read path. The other authority
  fields (`authoritativeReadMode`, `preferOwnerRpcReadLeader`,
  `localReadConsistency`, `phaseScope`) are dropped by
  `buildGatewayQueryOptions` before the engine, so they are latent there.
- **F2 (CONFIRMED, fixed 2026-07-18).** `getOperationByIdVisibilityObservation`
  did not forward `preferOwnerRpcReadLeader` though the inner query honors it;
  latent (no current caller passes it), same drop shape as the two live
  incidents of 2026-07-18.
- **F3 (CONFIRMED).** `allowPressureDegrade` defaults diverge: `!== false`
  (default-allow) in the read pressure contract vs `=== true` (default-deny) in
  the executeQuery pressure contract
  (`control-plane-system-table-gateway-query-execution.js:77,115` vs
  `182,225`). Unifying is a BEHAVIOR change — needs a decision, not a cleanup.
- **F4 (CONFIRMED).** Authority/freshness intent exists in ~12 representations
  (strategy enum; `authoritativeReadMode` enum derived from 4 booleans then
  re-expanded to 5; bare leader-pin boolean ending as positional arg #5 of
  `executeOnPartition`; readProfile macros; receipts; watermark pairs;
  invalidation markers; result-side outcome fields). All three 2026-07-18
  read-path incidents were hand-re-enumeration drops of optional flags at layer
  boundaries.
- **F5 (CONFIRMED, nuanced).** The readiness snapshot store combines ~7
  invalidation/reuse mechanisms in its own reuse predicate (capture/build-start
  back-stamping, node-heartbeat watermark compare, per-node
  `{atMs, independentAtMs}` marker, cluster-wide invalidation, ready-lease
  expiry, heartbeat max-age, 4-field transport-drift compare), plus the
  planning source revision counter compared in the adjacent planning-snapshot
  predicates (`control-plane-readiness-snapshot-store.js`).
- **F6 (CONFIRMED, with limits).** The complete-table observation receipts are
  identity-bound (WeakMap-of-WeakMaps + rows-array identity + per-row snapshot
  compare, single-use) and reconciliation re-indexes the table in three passes.
  A per-table monotonic version counter WOULD subsume the concurrent-change
  detection (pre/post-apply passes → one version CAS) and the snapshot store's
  marker zoo (F5), but would NOT subsume three receipt properties: gateway
  provenance, caller rows-array mutation detection, anti-replay. Receipts stay;
  the version counter shrinks everything around them.

Rebalancer / placement:

- **F7 (CONFIRMED).** The spread requirement is derived by five different
  formulas at five sites with no shared helper:
  `min(3, ready)` (`move-planner-state-methods.js:544`),
  `min(3, max(ready, cohort))` (`unified-rebalancer-priority-readiness.js:626`),
  `min(currentDistinct, requiredDistinct)`
  (`operation-workflow-remove-safety-evaluator.js:71`),
  `min(target, targetDistinct)` (`replica-placement-cure-policy.js:219,252,318`),
  and the majority-concentration formula duplicated inline in two variants
  (`operation-ledger-quorum-concentration.js:157-160` vs `~343-346`).
- **F8 (CONFIRMED).** `classifyLedgerExpandForSpreadCureCondition` is a
  10-conjunct exact-state test over planner-intermediate values, with four
  sibling classifiers whose conjunct sets differ subtly, and the cure functions
  mutate the caller's move arrays in place
  (`replica-placement-cure-policy.js:184-329`,
  `move-planner-priority-spread-cure.js:69-70,107-108,157-164`). Fails closed:
  a `calculateMoves` refactor silently un-matches the cure and the 85–110s
  exclusive self-move cost returns with no test failing.
- **F9 (CONFIRMED).** The recent-ledger-self-move lease is wall-clock only:
  `completionAgeMs <= PRIORITY_RECENT_INTENT_TTL_MS` (2 min), no
  settle-evidence gate (`rebalance-coordinator-replica-identity-methods.js:249-261`,
  `rebalance-coordinator-shared.js:195`), unlike the sibling replace-target
  lease which does consult placement-lease-released evidence.
- **F10.** Five one-way valves fix "planner re-mints work from lagging or
  differently-counted state": REPLACE serialization cap, deferred-unpaired-ADD
  block, over-creation cap, spread-vs-count reconcile, follow-up
  `OVER_REPLICATION_SUPPRESSED` — each using a different replica count
  (`activeCount` / `activeVoterCount` / `max` of both / `deficitEffectiveCount`
  / `creationEffectiveCount` / drain-inclusive vs -exclusive in-flight).

Lifecycle / membership:

- **F11 (CONFIRMED).** The scenario harness defines formation-complete as the
  count of `nodes.status === 'active'` rows
  (`examples/service-data-affinity/cluster-harness.js:92`), which is why
  registration-writes-ACTIVE consumed the stability window before the JOINING
  fence work.
- **F12 (CONFIRMED — resolved to an ordering-only guarantee).**
  Defaults-to-active writers exist
  (`replica-dispatch-state-publication.js:355-361`,
  `node-registration-owner-durable-rejoin-methods.js:71-72`); the `|| ACTIVE`
  fallbacks cannot overwrite a truthy `'joining'`, but the READY-promotion and
  heartbeat-only revive path (`shouldReviveHeartbeatOnlyNodeStatus`, lines
  309-317, 375-386) stamp ACTIVE on any non-active status — `'joining'`
  included — whenever a READY heartbeat arrives. Traced 2026-07-18: the
  steady-state HeartbeatService writes `status: ACTIVE, connection_state:
  READY` + fresh ready lease on every tick with NO phase check
  (`heartbeat-service-publication-methods.js:101-107`), but it is started only
  by `completeSuccessfulJoin()` → `activateSteadyStateRuntimeHandoff`
  (`node-joining-admission-readiness.js:230-247`), which runs AFTER the
  barrier-gated `signalReadyForReplicas()`. So the JOINING fence holds today
  **by implicit start ordering only** — nothing enforces it. Two loaded
  footguns: the unreferenced legacy `ControlPlaneSetup.registerNode`
  (`control-plane-setup.js:540-591`) starts the heartbeat immediately after
  registration and would bypass the fence if ever re-wired; and any in-process
  rejoin path that re-enters JOINING while the heartbeat service keeps running
  would be silently re-stamped ACTIVE. The fence should become an explicit
  phase guard in the heartbeat publication (refuse READY/ACTIVE while the
  local lifecycle is pre-READY), not an ordering convention.
- **F13 (PARTIALLY-CONFIRMED).** "JOINING but placement-eligible" has two
  independent predicate implementations —
  `deriveFormationPlacementNodeIds`
  (`membership-publication-candidate-derivation.js:215-243`) vs
  `isStartupAuthorityControlPlanePlacementEligibleNode`
  (`startup-authority-placement-eligibility.js:45-72`) — with different
  criteria; the rebalancer sites are wrappers over the second.
- **F14 (CONFIRMED).** `NODE_STATE.ACTIVE` and `SERVICE_STATUS.ACTIVE` are two
  namespaces for the string `'active'`, and the documented split is violated on
  the `nodes.status` write path (writes use SERVICE_STATUS, reads/eligibility
  use NODE_STATE, registration writes NODE_STATE.JOINING).
- **F15 (CONFIRMED).** Two independent heartbeat-staleness thresholds over
  overlapping liveness concerns: 60s projection grace
  (`active-node-projection.js:39`) vs 30s cluster-member stale max-age
  (`control-plane-readiness-constants.js:127`).
- **F16 (CONFIRMED, caveat).** Latest live run
  (`movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z`):
  `totalSpreadGap: 0` but schema admission denied on `control_plane_pressure` /
  `snapshot_query_error`, `observationState: snapshot_lane_unavailable` — the
  admin snapshot lane is the current blocker. Caveat: with the lane unavailable
  for one table, spread-gap 0 is supported but not independently proven.

## Options under discussion

- **O1 — ReadAuthority token.** One frozen object (strategy, mode, leader pin,
  consistency, readiness dimension, observation scope) built once at gateway
  ingress, threaded structurally, serialized verbatim into every coalescing
  key; `executeOnPartition` takes the token instead of positional booleans.
  Makes the F1/F2/F4 drop class unrepresentable; deletes the flags↔enum
  bidirectional mapping and both hand-built key builders. Trade-off: wide
  mechanical touch across gateway/CDC/repository call sites.
- **O2 — Per-table monotonic cache version.** Bump on every apply (CDC +
  reconciliation). Snapshot reuse = stored per-table versions unchanged;
  observation publish = version CAS. Deletes most of F5's marker zoo and F6's
  pre/post-apply passes; receipts retained for provenance/mutation/replay.
- **O3 — EffectivePlacement + serial goal-state priority planner.** One
  per-partition projection (services ⋈ replica_operations, drain-aware, one
  accounting) and at-most-one-move-per-tick precedence planner for priority
  partitions (failed-remove > deficit ADD > spread ADD > safe REMOVE >
  REPLACE). Expand-then-drain falls out structurally; deletes the cure
  classifiers (F8) and the five valves (F10). Aligns with lever #3 of the
  hard-cutover spec inventory.
- **O4 — Ledger episode state machine.** `IDLE → SELF_MOVE_EXCLUSIVE →
  SETTLING → IDLE`, SETTLING ends on placement evidence not wall-clock;
  subsumes F9's TTL lease, the two-hold split, and most of the background
  release tracker debounce; the join barrier reads episode state instead of
  re-deriving drain from raw rows.
- **O5 — One `spreadFloor(partitionId)` helper** consumed by all five F7 sites.
  Smallest of the placement options; large drift-risk reduction.
- **O6 — Decouple the quiescence observation channel** from the control plane
  under pressure (serve placement observation from cache watermarks made
  trustworthy by O2, or isolate the admin snapshot lane's event loop). Directly
  addresses F16, today's live blocker.
- **O7 — Canonical node phase.** Persist one phase
  (`REGISTERED → FORMATION_PLACEABLE → PLACEMENT_READY → ACTIVE`) with a single
  transition owner; liveness stays orthogonal evidence (explicitly NOT the
  refuted projection cutover). Collapses F13's dual predicates, F12's forgery
  paths, F14's namespace split. Largest option; prerequisite work: single
  writer for status transitions, legacy-row inference.

## Open questions

- **F12 follow-up: should the JOINING fence become an explicit phase guard in
  heartbeat publication** (refuse READY/ACTIVE while lifecycle is pre-READY)
  rather than the current implicit start-ordering? Candidate first quest for
  this epic — small, provable, closes both named footguns.
- F3: which `allowPressureDegrade` default is intended? (Behavior decision.)
- O3 sequencing: before or after the current live quest closes? The cure
  classifiers (F8) are load-bearing for the quest's measured outcome; O3
  replaces them wholesale.
- Does O6 belong inside the current quest (its blocker is F16) or as a sibling?

## Decision log

- 2026-07-18 (implementation session 2) — O1 core SHIPPED:
  `buildControlPlaneReadAuthority` (read-contracts) builds the frozen token
  once at `executeRead` ingress; both read coalescing key forms serialize the
  token (which also newly binds `authoritativeObservationScope` into the
  identity — receipt-requesting reads can no longer coalesce with generic
  reads); requestOptions carries `readAuthority`; the CDC owner-RPC executor
  consumes the token for leader pin and readiness dimension with legacy
  fallback; `executionOptions.readAuthority` reaches partition execution.
  Regression `test/control-plane/control-plane-read-authority-token.test.js`
  proves token-only leader pinning (legacy boolean absent) and per-field key
  distinction; red-on-revert proven. Quest tail: convert remaining flag
  consumers, then delete `resolveAuthoritativeReadModeContract` re-expansion
  and the legacy booleans.
  O2 core SHIPPED: `SystemTableCache.mutationVersionByTableName` bumped at
  both apply commit points; `getTableMutationVersion` accessor; readiness
  snapshot store captures the services version at store time and refuses
  reuse on any mismatch (`getServicesTableMutationVersionForSnapshotReuse`),
  fail-open when versions are unavailable, mid-build applies still covered by
  the kept-marker TOCTOU path. Regression
  `test/control-plane/readiness-snapshot-services-version-arbitration.test.js`
  proves marker-free invalidation of the incident-(c) class; red-on-revert
  proven; quest suite readiness-per-change-reuse stays green (26/26). Quest
  tail: migrate publication/cluster invalidation to versions, convert
  reconciliation post-apply verify to version CAS, then delete the marker
  zoo — driven by the quest against live evidence since that code is
  load-bearing for the active fence quest.
  O6 EVIDENCE-BOUND, implementation deferred to its quest: the
  admin-event-loop-isolation discriminator (8/8 green on current bytes)
  already measured the failure family — PRE-DISPATCH MAIN-LOOP STARVATION on
  the seed (1.2–4.1s event-loop gaps), and the existing control-snapshot
  fallback has NO resource isolation (fallbackSharesLoop=true). The
  placement-observation contributor itself is a pure synchronous function
  over captured rows, so contributor restructuring is ruled out; gate
  softening and timeout increases are ruled out by prior findings. The fix
  direction is therefore genuine resource isolation for the snapshot lane
  (worker-isolated serving from a read-only cache replica with honest
  capturedAt staleness), which changes the ControlPlaneSnapshotOwner
  ownership contract — quest-with-verifier work, not landable blind.
  Combined sweep over all epic implementation areas: 956/956 green.

- 2026-07-18 (later) — Epic implementation started. (1) F12 phase guard
  SHIPPED: `sendHeartbeat` now defers to the durable own-node row — while it
  is JOINING the heartbeat publishes CONNECTED liveness-only (status
  preserved, ready lease untouched), so a heartbeat can never self-promote a
  pre-activation node; regression
  `test/control-plane/heartbeat-joining-fence-preservation.test.js` proven
  red-on-revert (9/9 → 3 fail on revert → 9/9); guard is a no-op in every
  currently-correct start ordering. (2) O5 first step SHIPPED: the
  quorum-concentration majority formula deduplicated into
  `isQuorumConcentratedPlacement` inside
  `operation-ledger-quorum-concentration.js` (both sites verified
  semantically identical first). (3) Quest drafts authored for the
  quest-sized options: `read-authority-structural-threading` (O1),
  `per-table-cache-version-consolidation` (O2),
  `quiescence-observation-lane-decoupling` (O6) — all lint-pass, sealed on
  first attempt per workflow. O3/O4 deliberately NOT quested yet: the cure
  classifiers they delete are load-bearing for the active
  formation-joining-ready-phase-fence-live quest (see Open questions). O7
  remains discussion-stage pending the O1/O2 experience. Combined suite over
  all touched areas: 785/785 green.

- 2026-07-18 — Deep review + independent adversarial verification of 16
  findings (three analysis subagents + one verifier; all claims CONFIRMED or
  PARTIALLY-CONFIRMED, refinements folded in above). Immediate verified-safe
  fixes applied to the working tree: dead branch removed from
  `isReadinessDimensionSatisfied` in `replica-dispatch-readiness-capture.js`
  and `priority-publication-safety-topology.js` (both-paths-return-false);
  duplicated `typeof` probes deduplicated in
  `unified-rebalancer-available-nodes.js`; `preferLeader` added to both
  branches of `buildExecuteQueryKey` (F1); `preferOwnerRpcReadLeader`
  forwarded in `getOperationByIdVisibilityObservation` (F2). Targeted suites
  green: gateway 252/252, replica-operation-repository 316/316, rebalancer
  readiness/remove-safety 92/92.
