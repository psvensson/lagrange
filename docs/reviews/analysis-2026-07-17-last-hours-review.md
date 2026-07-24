# Review of work from 2026-07-17 (~09:18–13:10) — committed quests + uncommitted WIP

Scope: commits `bc5d3945..ae838465` (local-leadership tenure binding, admin event-loop
discriminator, formation priority-spread checkpoints) plus the uncommitted working tree
(priority-placement observation, node-joining ready-signal barrier, follow-up gates).
Produced by three parallel review passes (committed source, uncommitted source, tests +
evidence hygiene), each finding verified against actual code; the tests pass also ran the
suspect tests.

Overall verdict: the substance is sound — the evidence trail is honest (no green-washed
dt-prove records; failures recorded as failures), the core TOCTOU fence in the safety read
genuinely holds, and the new tests mostly exercise real production seams. But the reviews
surfaced two real bugs, one currently-red test, and a stack of worthwhile cleanups.

Caveat: files were changing on disk during the review (the formation dt test was edited at
15:34, mid-review). Working-tree findings describe a moving snapshot.

## Real bugs worth fixing

### 1. Committed — supersession path leaves stale leader-claim annotations on the cached row
`src/partition/partition-service-metadata-delivery-methods.js:276`

When a strictly-newer successor row arrives, the observation is marked `superseded` but the
row's `leader_claim_node_id` / `leader_claim_raft_term` are never cleared — the demotion path
got exactly this residual-claim clear, the supersession path didn't. The cache's UPDATE merge
preserves the lingering fields, so a later UPDATE-shaped CDC delivery naming this node (its
own lagging durable leader publication with a skewed-newer `updated_at`) can restore
`leader_node_id = self` next to a live-looking claim, and the safety preference fires against
an acknowledged-superseded tenure — the exact split-brain window the tenure-binding quest was
built to close. The comment in `src/rebalancer/priority-publication-safety-rows.js:120` even
promises "nulled on demotion, supersession, and teardown".

Fix: mirror the demotion path's `applyLocalLeaderClaimAnnotationClear` in the
`successorIsStrictlyNewer` branch — and add a supersession-path test, which is currently the
only lifecycle leg with zero coverage in `dt-local-leader-seed-safety-merge.test.js`.

### 2. Uncommitted — join barrier can't escape stale cache evidence
`src/bootstrap/node-joining-ready-signal-readiness.js:470-492`

The authoritative placement read runs only when the cache does *not* claim concentration, so
when a stale CDC cache still shows the pre-cure concentrated placement, the
`authoritativePlacement.complete ? ...` override branch is unreachable in exactly the
direction it was written for. The joiner sits in `WAITING_SPREAD` on cache evidence alone for
the full 2-minute timeout and then fails the join.

Fix: also fetch the authoritative read when the cache reports concentrated (or after N
consecutive `WAITING_SPREAD` polls), and let complete authoritative evidence decide in both
directions.

### 3. Working tree — `test/convergence/dt-formation-priority-placement-before-active.test.js` is currently red
2/62 assertions fail (verified by running it). The third test expects
`[REPLACE, ADD, REMOVE]` but the harness's `applyRow` upserts a colliding `replicaId` over
the seeded r3 instead of adding r4, so spread completes without the REMOVE. All 7 dt-prove
records for this test predate the 15:34 edit, so the recorded red-on-revert proof no longer
describes the file — it needs re-proving once green.

## Likely-unintended behavior changes (confirm intent)

- **Quorum filter silently dropped** — `src/rebalancer/unified-rebalancer-priority-readiness.js:418`:
  the spread blocker used to engage only when some partition was below
  `requiredQuorumDistinctNodeCount`; now *any* spread gap or missing leader holds the gate for
  all non-priority planning, and the quorum threshold is dead as a decision input. If
  full-spread-before-admission is intended, document it and mark the field diagnostic-only.
- **Leader-missing partitions synthesized with misleading spread data** — same file ~line 405:
  they get `spreadGap: 0` and full `readyDistinctNodeCount`, so the planning-gate log reports
  "largestSpreadGap: 0" alongside blocked partitions. Use `null` for unknowns and let
  `missingActiveLeader: true` carry the reason.
- **Fail-open silence in the new barrier** — `node-joining-ready-signal-readiness.js:613` and
  `:707`: a missing readiness service skips the whole invariant with no log line, and the 5s
  formation-discovery window races the ~28s post-arm cache catch-up documented in the same
  file — a `BYPASSED_INSUFFICIENT_COHORT` bypass is indistinguishable from "evidence never
  arrived". Log both paths with candidate/pre-ready counts; consider keying discovery on the
  join session's known cohort instead of cache visibility.
- **Freshness check mismatch** — the demo gate requires `capturedAt === snapshot.capturedAt`
  while the builder does `Math.floor(capturedAt)`
  (`src/control-plane/current-priority-placement-observation.js:157`) — fine under
  `Date.now()`, permanently `SNAPSHOT_LANE_UNAVAILABLE` under a fractional virtual clock.
- **Missing cache guard** — `node-joining-ready-signal-readiness.js:284-298` calls
  `systemTableCache.filter(...)` unguarded (its sibling checks
  `typeof .filter !== 'function'`), so an odd cache becomes a raw TypeError out of
  `signalReadyForReplicas` instead of a retryable barrier outcome.

## Duplication and dead code (mechanical cleanups)

- `resolveCurrentTermSafe` duplicated verbatim: `src/raft/raft-replica-base.js:475` and
  `src/partition/partition-service-raft-init-base.js:56` — consolidate into one exported
  helper.
- Joiner placement-eligibility predicate (`node-joining-ready-signal-readiness.js:233`)
  mirrors `isStartupAuthorityControlPlanePlacementEligibleNode`
  (`unified-rebalancer-available-nodes.js:260`) and has already drifted (self-inclusion,
  transport-check fallback). Extract one shared predicate with `{includeSelf}`.
- Concentration formula duplicated inside `operation-ledger-quorum-concentration.js`
  (~128 vs ~1013) — factor `isConcentratedVoterPlacement(voterRows)`.
- Spread-totals math re-implemented in `current-priority-placement-observation.js:88` when
  `priority-recovery-observation-normalization.js:444` already owns it.
- Dead code: the `term` parameter threaded to `queueLeaderNodeUpdate` is ignored by every
  sink (fossil of rejected attempt-1); `LEADER_CLAIM_MINTED_AGAINST_UPDATED_AT` is stamped
  and nulled but never read; `getPriorityPlacementFormationCandidateNodeIds` has no callers.
- Two identical status-set constants in `rebalance-coordinator-topology-guard-methods.js:50`
  (both `{FAILED, REMOVED}`).
- Hardcoded `'local_partition_replica'` / `'owner_rpc_lane'` strings
  (`node-joining-ready-signal-readiness.js:338`) — import
  `AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE`; also decide explicitly whether `MIXED` counts as
  authoritative (today it silently keeps the barrier waiting).
- Hardcoded `` `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1` `` at line 438 instead of
  `INITIAL_PARTITION_IDS[...]`.
- Safety merge reads claim columns via raw string literals while the producer uses the
  `COLUMN.LEADER_CLAIM_*` constants introduced in the same commit
  (`priority-publication-safety-rows.js:127`) — a rename now fails silently as "preference
  never fires". Also consider stripping the local-only `leader_claim_*` fields from the
  returned merged row after the preference decision.
- The "unavailable placement" object literal is repeated four times in
  `node-joining-ready-signal-readiness.js` — hoist one frozen module constant.
- Naming split for one mechanism: `priorityPlacementFormation*` vs
  `OPERATION_LEDGER_FORMATION_BARRIER*` — pick one prefix for grep-ability.

## Test-quality issues

- Two assertions in the formation dt test **cannot fail**: `terminalAtPhysicalSpread` checks
  terminality on a freshly-created operation (always `PENDING`, so always false), and
  `joinersPublicReady` reads a lease field nothing in the fixture ever writes
  (`dt-formation-priority-placement-before-active.test.js:478-485`).
- Catch-path resurrection: `priority-publication-safety-rows.js:181` returns
  `... || cachedRow`, resurrecting the pre-await row when the post-await cache is null under
  error — contradicting its own TOCTOU comment. Drop `|| cachedRow` or justify it.
- The new admin-snapshot producer test asserts only `typeof === 'object'` (passes for `null`
  and shape drift) while the demo gate hard-requires `state === 'available'` +
  `leaderCoverage` (`admin-websocket-api-diagnostics-and-control-snapshot.test.js:361`).
  Assert `state`, `satisfied`, `leaderCoverage.satisfied`.
- Admin event-loop discriminator test is misfiled/mislabeled: lives in `test/convergence/`
  with a `dt-` prefix but runs on real `Date.now()`, real sockets, and three 400ms busy-spins
  with jitter-sensitive margins; threshold comment says 60% while the assertion uses 0.5; its
  response detector hangs on chunked responses. Move to `test/admin/`, drop `dt-`, align
  comment/code, detect end-of-response via Content-Length.
- Hot-path perf hidden by mocks: `getControlPlanePrioritySpreadBlocker` now does full
  PARTITIONS+SERVICES scans plus per-node readiness calls *before* the cheap fast-exit that
  used to come first (`unified-rebalancer-priority-readiness.js:316`). Reorder or memoize per
  `observedAt`. Relatedly it calls `getNodeReadinessSync(nodeId, observedAt)` where the
  production signature takes an options object — the timestamp is silently discarded.
- In-flight-demotion test fixture models the post-demotion cache as a row carrying the
  *successor's* claim annotations — a shape production can never produce locally
  (`dt-local-leader-seed-safety-merge.test.js` ~1040); use the fossil-row shape.
- `clearLocalCanonicalLeaderClaimOnTeardown` has zero test coverage, and it fires a
  null-to-null cache UPDATE (with subscriber notification) on every teardown where any
  observation exists — tighten the guard to require an actual self-claim on the row
  (`partition-service-metadata-delivery-methods.js:175`).
- Term acceptance is finiteness-only (no `> 0` floor, no monotonicity) at
  `partition-service-metadata-delivery-methods.js:96` — low practical risk, one-line guard.
- Copy-paste setup worth small builders: three readiness-service blocks in
  `unified-rebalancer-replica-state-management-node-state-change.test.js`; the ~25-line
  placement-observation fixture duplicated in `movielens-preload-admission-gate.test.js`;
  hand-rolled `Object.create(NodeJoiningReadySignalReadiness.prototype)` stubs in two files.
- Minor: `authoritative-control-plane-view.test.js:312` assertion message claims
  leader-pinning forbids SQL fallback, but the observed behavior derives from the
  `OWNER_RPC_PREFERRED` mode contract; the distinctness test at :419 is
  microtask-count-fragile (loud, not silent).

## Verified clean (for the record)

- Claim columns are genuinely non-durable (absent from the core schema), so the CDC-replay
  fence holds; INSERT-shaped cache applies wipe claims; explicit-null clear projections
  survive the spread-merge.
- The success-path post-await revalidation in `getCriticalPartitionRowForSafety` closes the
  reported TOCTOU, and the dt test discriminates both the pre-fix preference and the
  unrevalidated variant.
- The over-replication follow-up gate is order-safe and fails safe; topology-guard casing and
  row normalization check out; the lease check fails closed; all changed modules import
  cleanly; the admin re-export shim matches the repo's seam convention.
- `recent-completed-replace-target-visibility.test.js` and
  `priority-recovery-follow-up-count-aware-add-gate.test.js` are clean with real seams and
  proven red-on-revert.
- dt-prove evidence corpus is internally consistent — every `red-on-revert-proven` has exits
  fix=0/revert=1/restore=0; genuine failures honestly recorded.

## Process observations

- The formation priority-spread quest consumed 6 theories and 10 failed live-evidence
  ingestions before converging, versus 1–2 attempts for the other two quests. The log shows
  theories falsified by inspection *after* expensive live runs; the cheaper analytic-first
  falsification the quest adopted from 10:30 onward would have saved most of that.
- The same live report is double-ingested within ~60ms at three timestamps (10:38, 12:26,
  13:10) — looks like an ingest-twice quirk in the tooling worth a look.
- One attempt was fully superseded by a lint failure (`attempt-1-lint-superseded.diff`) —
  running lint before evidence capture would have saved the attempt.

## Suggested order of attack

1. Fix the supersession claim-clear (re-opens the window the tenure quest existed to close)
   and add the missing supersession-path test.
2. Get the formation dt test green and re-prove red-on-revert.
3. Make the join-barrier authoritative-read override reachable.
4. Confirm whether the quorum-filter drop was intentional before committing the WIP.
5. Mechanical cleanups (duplication, dead code, constants) as safe follow-ups.
