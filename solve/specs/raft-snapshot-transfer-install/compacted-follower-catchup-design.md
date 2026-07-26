# S4 Design — Compacted-Follower Catch-up

Scope: quest `raft-snapshot-compacted-follower-catchup` (R4 + the S2/S3
recorded inputs). A follower behind a leader's retained prefix installs the
newest eligible snapshot and resumes AppendEntries exactly after it —
proven from a leader whose prefix is GENUINELY absent (pre-S5, that is a
leader that was itself snapshot-installed: compacted-empty log + boundary).

## What already works (S2 — verified by trace, do not re-implement)

An installed follower resuming against a full-log leader converges today:
boundary-aware `getLastInfo`/`has`/`getEntryBefore`, the COMPACTED guard
outcome, the strict `<` stale-batch guard, truncation clamps, HLC warm.
S4's guard suite pins this scenario as a regression test but changes none
of it.

## The livelock (verified, two variants) and the leader dispatch hook

A fresh follower against an INSTALLED leader (boundary M):
- b1: leader computes `startIndex = 1`, `getRange(1, 64)` returns empty
  (all ≤ M compacted) → silent `write()` drop, forever.
- b2 (M < endIndex): batch at M+1 carries `last = {M, termM}`; the fresh
  follower cannot accept (`has(M)` false, no boundary) → APPEND_FAIL{M} →
  leader `get(M)` null → silent drop, forever.

Fix — one decision, three liferaft.js call sites, dispatch injected:

1. After `startIndex` is computed (`handleLeaderAppendFailBatch`): when
   `boundary > 0 && startIndex <= boundary` (via
   `raft.log.getSnapshotBoundary?.()`), emit the typed catch-up decision
   `install_snapshot` for `packet.address` instead of reading the range.
2. The unrecoverable-entry branch (leader branch ONLY — the second
   unrecoverable check in the non-leader dispatch path is NOT touched):
   `boundary > 0 && failedIndex <= boundary` → same decision (otherwise
   keep the existing drop).
3. Empty `readCatchupEntries`: with `boundary > 0 && startIndex <=
   boundary` this is redundant once site 1 exists; the remaining empty-read
   cases (boundary-0 gaps, above-boundary torn logs) are LOG CORRUPTION and
   emit a DISTINCT typed decision `catchup_range_empty` — never
   `install_snapshot`, so the orchestrator's create-if-none fallback cannot
   mint a checkpoint that papers over corruption (design-verifier
   MUST-CHANGE).

Injection (verifier-corrected): partition raft does NOT flow through
`createRaftInstanceForReplica` (that is the wasm-replica path) and neither
construction site passes unknown options through — the callback is added
explicitly to the RaftNode options at the partition construction site in
`partition-service-raft-init-base.js` and stashed on the instance per the
`_catchupTimeSource` precedent. `liferaft.js` emits decisions; it never
imports transfer/install code. Absent callback = typed no-op decision
recorded on the instance (observable), never a throw. The in-memory
adapter has no `getSnapshotBoundary`, so message-group raft is
structurally unaffected. (Naming precision: base `appendPacket` consults
`getEntryInfoBefore`, not `getEntryBefore`.)

Recorded disposition (verifier item): a DIVERGENT boundary term (leader's
row at N carries a different term than the follower's boundary) is refused
by the existing wrong-term-at-boundary check and settles into a
heartbeat-driven typed-refusal livelock with NO dispatch (the full-log
leader's boundary is 0). This is deliberate safety-over-liveness: the
state is unreachable for honest committed history (Leader Completeness)
and indicates corruption or forgery. Guarded as refusal + no-dispatch.

## Catch-up orchestrator (`src/raft/snapshot-catchup.js`)

- **Leader side** `dispatchSnapshotCatchup`: resolve the follower nodeId
  from the unified address; select the NEWEST eligible generation
  (`listCheckpointGenerations`, newest with index >= leader boundary —
  R4's "newest eligible"); if none, create one via S1 creation (an
  installed leader can re-checkpoint at its own boundary thanks to S2's
  fallback); serve via `serveSnapshotTransfer` over an injected
  channel/socket provider (S3's bulk registry in production; in-process
  duplex in guards). Per-follower single-flight with typed refusal.
- **Follower side** `orchestrateSnapshotCatchupInstall`: after
  `receiveSnapshotTransfer` publishes the generation — `service.shutdown()`
  (the established closed-handle boundary) → `requestSnapshotInstall` →
  construct a NEW PartitionService over the same dbPath via the injected
  `createPartitionService` factory (the production repair/create seam;
  NEVER re-`initialize()` a shutdown instance — `isShutdown` is one-way —
  and NEVER the remove path, which deletes the db). Typed outcomes at every
  stage; a failed install boots the old state (S2 marker semantics).
  Registry handoff (MUST-CHANGE): the orchestrator takes an explicit
  `registerReplacementService` callback and invokes it with the new
  service — it never mutates ReplicaHandler/bootstrap maps itself;
  production wiring must swap `localServices`/`localReplicas` (bypassing
  that leaves remove/status flows on a dead instance) and owns CDC
  subscriber idempotency across factory re-runs (both recorded for the S6
  production wiring). The e2e guard injects its own factory (the
  production factory derives dbPath deterministically and ignores the
  option — recorded coupling).

## Resume-exactly-after proof obligation

After install + recreate, the follower answers `getLastInfo() = {N,
termN}`; the leader's next fail-batch computes `startIndex = N+1` and the
S2 acceptance path applies entries from N+1 — the guard asserts the FIRST
post-install append applied is exactly N+1 and that state-machine rows
converge with the leader.

## Identity pinning (recorded S1-S3 deferral, resolved here)

- `raftGroupId = partitionId`, `entity = {kind: ENTITY_TYPE.PARTITION,
  id: tableName}` — supplied by the service (verified available).
- `clusterId`: NO durable cluster identity exists anywhere (verified
  repo-wide). S4 pins it to deployment configuration: a config key
  (default constant) threaded to the orchestrator. Real cross-cluster
  isolation is parity-bound to the unauthenticated transport (nodeId is
  self-declared) and stays with future authenticated-transport work —
  recorded, not silently widened.
- `membershipEpoch`: bound to the membership publication epoch
  (`control_plane_publications.publication_epoch` via
  membership-epoch-contract), read from the system-table cache at the
  orchestrator seam via a NEW small exported selector (none exists today —
  verifier gap); 0 when unavailable (bootstrap) — sound under the
  descriptor->=receiver match direction. NOT `active_partition_version`
  (that fences splits, not membership).
- Eligible-generation rule is strictly `index >= leader boundary`
  (verifier-confirmed: pre-install generations below the boundary can
  exist since retention is S5, and serving one is an unbounded
  install-dispatch loop, not benign).

## Recorded-gap closures included in this quest

1. Live raft term boot-seeding (pre-existing defect, S2-recorded): after
   constructing the raft node, seed `raft.term` from the durable
   `currentTerm` row when > 0. Production blast radius is exactly installed
   replicas (nothing else persists the row today) — guard-tested.
2. Boot-time sweep of stale transfer staging: `cleanupStaleTransferStaging`
   wired at the same closed-handle boot boundary as
   `resolvePendingSnapshotInstall` (S3's recorded deferral).
3. Typed below-floor result for `getEntriesFrom`/`getRange` callers is NOT
   generalized here; the one confused caller (readCatchupEntries) is fixed
   by the dispatch decision above, `reconstructPreparedState` is protected
   by the S2 creation gate, and the rest are safe (verified) — recorded as
   S5-adjacent debt rather than widened scope.
4. Five untested lines pinned by new guards: wrong-term-at-boundary refusal
   (liferaft validateCommittedPrevLogIdentity boundary branch), truncation
   witness TRIP inside (boundary, committedIndex), stale target-sidecar
   deletion in swapStagingIntoReplica, per-socket maxPayload on the bulk
   dial, stale-staging cleanup at accept.

## Proof (scenario `raft-snapshot-compacted-follower-catchup`)

- `test/raft/snapshot-catchup-dispatch.test.js`: the three liferaft
  decision sites (b1/b2 fixtures over real adapters: installed leader,
  fresh follower) emit the typed decision exactly when startIndex/
  failedIndex <= boundary; absent-callback no-op; non-boundary paths
  unchanged (existing catch-up still batches).
- `test/raft/snapshot-catchup-end-to-end.test.js`: real PartitionService
  leader (installed from a checkpoint, genuinely absent prefix) + fresh
  follower service; full loop — dispatch → transfer (in-process seam) →
  shutdown → install → recreate via injected factory → FIRST applied entry
  is boundary+1 → state-machine convergence; plus installed-follower
  regression (scenario a) and term-seeding assertion. Harness
  (verifier-recommended, deterministic): the two-service/one-router
  skeleton from the raft message-delivery property test with
  `deferElection` on both sides and MANUAL leader promotion (the
  production single-replica promotion precedent) — no live election
  timers, no DT seam threading.
- `test/raft/snapshot-recorded-gaps.test.js`: the five pinned lines above.
- Runner re-runs the S1/S2/S3 suites + gated-compaction (unweakened).

## Out of scope (S5/S6)

Retention/pinning and compaction enablement; live rebuild under foreground
writes with the scale report schema; real-ws bulk dial in production
topology; receive-side admission; authenticated transport.
