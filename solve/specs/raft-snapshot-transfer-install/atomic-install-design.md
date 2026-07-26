# S2 Design — Raft Snapshot Atomic Install

Scope: quest `raft-snapshot-atomic-install` (R3). Staged validation, one
atomic install transition at the closed-handle boundary, local `_raft_log`/
`_raft_state` reconstruction with an explicit term/votedFor rule, a durable
restart-state machine, and the adapter boundary READS that make the
reconstructed state observable. The live protocol continuation that USES the
boundary (leader catch-up start index, stale-batch guard, send-snapshot
trigger — the researched livelock) is S4 scope and is recorded there.

## Boundary metadata (the durable pair)

Install writes, in ONE SQLite transaction on the staged copy:

- `_raft_state.snapshotLastIncludedIndex = N`, `snapshotLastIncludedTerm =
  termN` (new keys; follower-local, auto-scrubbed from payloads by the
  existing `_raft_state` exclusion).
- `committedIndex = N` (direct row write in the staged copy — the staged copy
  has no live adapter cache; the monotonic clamp concern applies only to live
  handles, and the install path never runs against one).
- `lastAppliedIndex = N` and NO `appliedGapMarker`/`directApplyMarker` —
  otherwise `loadAppliedWatermark` poisons the replica on next boot
  (verified trap).
- `maxCommittedHlc` (see HLC below).
- `currentTerm` / `votedFor` per the rule below.

## Term / votedFor rule (R3, explicit)

Research finding: term/votedFor durability does not exist today — nothing
calls `persistTerm`/`persistVotedFor` in production and `raft.term` boots at
0. The install rule therefore operates on the DURABLE rows and never imports
sender values (the payload was scrubbed of `_raft_state` at creation; install
reconstructs from the RECEIVER's prior durable rows):

- `currentTerm := max(localDurableCurrentTerm, lastIncludedTerm)` — the local
  term never regresses below the snapshot's included term, and a higher local
  term is preserved.
- `votedFor := localDurableVotedFor` iff `currentTerm` is unchanged by the
  install; if the install RAISED the term, `votedFor` is cleared (a new term
  has no vote yet — the only Raft-safe reset point). Never imported.
- The boot-seeding gap (raft.term always starts at 0 in memory regardless of
  durable rows) is a PRE-EXISTING defect independent of snapshots, recorded
  as a finding and assigned to the S4 ladder work, not silently fixed here.
- Precision (design-verifier correction): durable `currentTerm` IS consumed
  today — `PartitionRaftStorage.appendEntry` stamps entry terms with it and
  status reporting reads it — so the correct claim is "nothing seeds the
  LIVE raft election state from durable rows", and the quest statement
  scopes R3's term/votedFor clause explicitly to the durable `_raft_state`
  rows (the SHALL is otherwise unsatisfiable while every replica boots at
  in-memory term 0).

## Install state machine (durable marker, restart-distinguishable)

Marker file `install-state.json` (canonical JSON, atomic durable writes) in
`{checkpointsRoot}/install/` — a non-`.db` name in a subdirectory, because
bootstrap rejoin-hints opens every `*.db` beside the replica. States exactly
per R3:

| State | Meaning | On restart |
| --- | --- | --- |
| (no marker) | no install | normal boot |
| `staging` | staged copy being prepared; swap NOT reached | discard staging, boot old state |
| `staged` | staged copy complete + validated; swap not yet performed | complete the swap, then boot |
| `installed` | swap performed | clear marker after verifying main DB matches; boot |
| `rejected` | validation refused (typed outcome recorded in marker) | boot old state; marker retained for diagnosis |

The marker transitions are the ONLY progress publication. The commit
watermark cannot run ahead of installed state because the new `committedIndex`
row exists only inside the staged copy until the atomic rename.

## The atomic transition (closed-handle window)

Precondition: no open handle on the replica DB (install runs in the
`initialize()` window after mkdir and before `new Database` — a new AWAITED
hook `resolvePendingSnapshotInstall({dbPath, checkpointsRoot, identity})` in
`partition-service-raft-init-base.js` immediately before the open; the
existing `reportInitializationStage(OPENING_DB)` seam is synchronous and
error-swallowing, so it cannot serve). That file is at 799/800 lines —
`warmHlcFromCommittedLog` is extracted into its own module in the same
change to make room (design-verifier MUST-CHANGE #5). Install support is
scoped to the PartitionService init path ONLY: the worker path
(`partition-worker-service.js` via `SQLiteStore`) never runs this
`initialize()` and install requests for worker-path replicas are a typed
refusal until S4 decides otherwise (MUST-CHANGE #6).

1. Read `install-state.json`; dispatch per the table above (marker IO uses
   `writeAtomicDurable`/`readCanonicalJson` from the durable-files toolkit,
   exactly as the S1 store does).
2. Staging (marker `staging`): copy the checkpoint payload into
   `install/staging-payload`, re-digest the copied bytes DIRECTLY against
   the generation descriptor (digest re-validation is only meaningful BEFORE
   reconstruction — afterwards the copy legitimately diverges); then create
   `_raft_log`/`_raft_state` in the staged copy via a throwaway
   `SQLiteLogAdapter` (the ONLY DDL owner whose `_raft_log` shape passes the
   boot-time legacy-schema tripwire — MUST-CHANGE #1), and apply the
   reconstruction transaction: boundary keys, watermarks, term/votedFor, a
   fresh random `snapshotInstallId` (also recorded in the marker), and
   `maxCommittedHlc` from the descriptor. Marker → `staged`.
3. Identity/epoch gate at install time: `matchCheckpointIdentity` against the
   receiver's CURRENT identity; `stale_epoch`/foreign outcomes → marker
   `rejected` with the typed outcome. An epoch change between staging and
   install is thereby an abort (R3's abort-on-epoch-change at the install
   boundary).
4. Swap: delete stale `{replicaDb}-wal`/`-shm` (path-keyed WAL sidecars are
   the corruption vector — verified), `renameSync(stagedCopy, replicaDb)`,
   fsync directory, marker → `installed`, fsync.
5. Boot proceeds: `new Database`, adapter, storage. `loadPersistedState` sees
   aligned watermarks (no gap marker). Marker cleared → (no marker) once the
   opened DB's `snapshotInstallId` matches the marker.

Crash healing is decided by the INSTALL NONCE, not by boundary keys —
boundary keys + committedIndex cannot distinguish "rename done, marker
update lost" from "rename not yet run over a previously-installed DB of the
same generation" (design-verifier refutation). The `staged` handler's
decision procedure:

1. Open main DB read-only; read `snapshotInstallId`.
2. Matches the marker's id → rename already happened → marker → `installed`;
   remove leftover staging; boot.
3. Differs AND staging file present → run the swap suffix (step 4 above).
4. Differs AND staging file missing → typed marker `rejected`
   (reason `staging_lost`); boot old state — safe because the new
   `committedIndex` only ever existed inside the staged copy.
5. Matches AND staging present — unreachable under atomic rename; typed
   `install_state_conflict`, fail closed (boot refused pending diagnosis).

## Adapter boundary reads (S2 makes the reconstruction OBSERVABLE)

`src/raft/snapshot-boundary.js` (new leaf module) owns
`readSnapshotBoundary(db)` → `{lastIncludedIndex, lastIncludedTerm}` (0/0
when keys absent = virgin log; CL-042's zero stays load-bearing for genuinely
empty logs). Adapter changes are minimal deltas that keep
`sqlite-log-adapter.js` under the 800 cap (moving read helpers into the
existing callback-api mixin if needed):

1. `getLastInfo`/`getLastEntry`/callback variant: empty log + boundary
   present → `{N, termN}` (else the CL-042 zero). This is vote-path adjacent:
   the CL-041/042 standing-invariant repros must stay green (they exercise
   virgin logs; the boundary keys are absent there).
2. `has(index)` → true for `0 < index <= N` (known-present, compacted;
   `has(0)` stays false — `isValidRaftLogIndex` discipline, CL-042's zero
   stays load-bearing); `get(index)` still returns no row — callers that
   need bytes get nothing, callers that test lineage get truth. Complete
   caller sweep verified safe (no unguarded has→get().term pattern); the
   `PartitionRaftStorage.getLastEntry` null window post-install is
   documented, consumers today are only `truncateFrom`'s refuse-all guard
   and status reporting. (S4 revisits the protocol users.)
3. `getEntryBefore`/`getEntryInfoBefore`: floor at `{N, termN}` instead of
   the degraded `{0, 0}` (which silently DISABLES the prev-log check).
4. Truncation clamps floor at `max(committedIndex, boundary)`; a request
   entirely at-or-below the boundary is a typed no-op that does NOT trip the
   committed-truncation error witness (`removeFrom(<=N)` today would delete
   the whole retained suffix — the sharpest data-loss edge found).
5. `guardCommittedEntryWrite` gains `lastIncludedIndex` and a third typed
   outcome `COMPACTED` (idempotent no-op) so `resolveEntryWrite` and
   `validateCommittedPrevLogIdentity` stop throwing on indexes <= N.

## HLC continuity

`warmHlcFromCommittedLog` scans `_raft_log` from 1 and would not warm after
install (clock regression risk). Creation computes the max committed HLC as
`max(scan of the copy's _raft_log command.timestamp strings, the copy's own
_raft_state.maxCommittedHlc key)` — the second term so a checkpoint OF an
installed replica does not regress the sealed HLC (MUST-CHANGE #7) — and
seals it in the descriptor (envelope field `maxCommittedHlc`, string HLC in
the `physical-logical-nodeId` format or `'0'` for none; `'0'` is safely
unparseable by `HLCTimestamp.tryFromString` and is skipped by the warm.
Amending envelope v1 in place is safe pre-adoption: descriptor
producers/consumers are exactly the S1 modules + guard tests, updated in the
same change; recorded as a finding). Install writes it to
`_raft_state.maxCommittedHlc`; `warmHlcFromCommittedLog` (extracted module)
takes `max(log scan, that key)`.

## S1 creation amendments in this quest

- `readLastIncludedTerm` falls back to the boundary keys when the log row at
  `committedIndex` is absent (MUST-CHANGE #3) — otherwise a freshly
  installed replica is refused (`missing_log_entry`) until its first
  post-install commit and can never re-checkpoint at its own boundary.
- `maxCommittedHlc` sealing as above.
- Prepared-2PC gate (below).

## Prepared-2PC fail-closed creation gate

`reconstructPreparedState` replays the log from 1 to rebuild
prepared-but-undecided transactions; a checkpoint at N cannot carry them.
Creation therefore scans the COPY's own full log (pre-scrub) and refuses
with typed creation outcome `prepared_transactions_pending` when any session
has a PREPARE at or below the boundary with no terminal outcome at or below
the boundary (PREPAREs strictly above the boundary are uncommitted and
irrelevant). `reconstructPreparedState` itself is instance-coupled and not
importable; the gate is a ~15-20 line structurally distinct scan over raw
`_raft_log` rows importing only `PARTITION_SERVICE_OPERATION` constants
(acyclic; below the jscpd clone floor). Fail-closed; releasing this
restriction is S4+ scope.

## Out of scope (recorded for S4)

Leader catch-up start index + stale-batch guard boundary awareness + the
send-snapshot trigger (today a snapshot-installed follower livelocks against
a live leader — S4's core), `getEntriesFrom` typed below-floor result,
raft.term boot seeding, message-group/in-memory adapters (no checkpoint
support by S1 decision).
