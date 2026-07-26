# S5 Design — Retention and Proof-Gated Compaction

Scope: quest `raft-snapshot-retention-compaction` (R4 retention/compaction
clauses). Two halves: (1) bounded generation retention whose cleanup can
never remove a pinned or sole recovery source; (2) the compaction cutover —
`compactCommittedEntries` gains a proof-gated physical-removal path while
the PROOFLESS call keeps returning the exact `snapshot_protocol_unavailable`
refusal (the authoring bar: the gated-compaction guard is retained and must
stay byte-green; the new protocol is proven before removal is enabled).

## Retention (`src/raft/snapshot-retention.js`)

`sweepCheckpointGenerations({checkpointsRoot, retainedGenerationCount,
pinnedGenerationIndexes})` — typed report {kept, removed, pinnedKept,
soleSourceKept}:

- Complete generations only (descriptor present — S1 publication-token
  semantics); `install/` and `transfer/` dirs and staging files are never
  candidates (non-numeric names are already invisible to
  `listCheckpointGenerations`).
- NEVER removed: (a) any pinned generation; (b) the NEWEST complete
  generation (the sole recovery source — R4's "cleanup shall never remove
  the sole recovery source for an admitted transfer" floor holds even when
  every pin is forgotten); (c) enough newest generations to satisfy the
  bounded count (default constant 2).
- Pins are the union of (verifier-corrected): the S2 install marker's
  `generationIndex` for marker states staging/staged/installed (a REJECTED
  marker is not an "active install" per R4 and does not pin; its
  generation stays protected only by the newest/bounded rules — recorded
  lifetime rule); the S3 transfer progress marker's `generationIndex`
  whenever the TRANSFER DIR/MARKER exists (field verified present; the pin
  condition is marker existence, NOT staging-payload-file existence, so
  the publish window rename→descriptor stays covered); and caller-supplied
  in-process pins from the S4 dispatcher — whose single-flight registry
  TODAY records only a boolean and needs the additive change to store the
  resolved generation index, recorded SYNCHRONOUSLY with generation
  selection (no await between select and pin). EVERY sweep invocation —
  including the S4 create-if-none fallback path through
  `createSqliteStateMachineCheckpoint` — receives the full pin set.
- Half-removed (descriptor-less) numeric dirs: the sweep re-checks
  descriptor presence per candidate and GCs descriptor-less dirs EXCEPT
  when a transfer marker for that index exists (the receiver's legitimate
  payload-only publish instant). Single-process ownership of a
  checkpointsRoot is an explicit assumption (sweep vs receiver-publish are
  same-process; cross-process sweeps would be TOCTOU-unsafe) — documented.
- Removal is directory-scoped rm of the generation dir (payload before
  descriptor is NOT required for deletion — the descriptor IS the
  publication token, so deleting it FIRST makes a crash-interrupted removal
  read as `partial`, never as a valid generation; sweep deletes
  `checkpoint.json` first, then the payload, then the dir).
- The sweep is caller-invoked (S6 wires cadence); S5 ships the mechanism
  and invokes it opportunistically after a successful checkpoint creation
  (the one production-adjacent moment S1 owns) behind the same bounded
  constants. Policy answer to the epic's open question 3: thresholds and
  generation counts are RETENTION-module policy constants; the protocol
  surface (compaction, transfer, install) takes only explicit indexes and
  durable proof — policy never leaks into protocol semantics.

## Proof-gated compaction (the cutover)

`SQLiteLogAdapter.compactCommittedEntries(request)` decision table:

| Case | Outcome |
| --- | --- |
| no request / no `{toIndex, proof}` (every existing caller) | the EXACT existing frozen `snapshot_protocol_unavailable` refusal — gated-compaction guards assert with deep-equality against the two-field literal, so the result object stays byte-identical |
| non-`isValidRaftLogIndex(toIndex)` (NaN, strings, floats, <=0) | typed `invalid_compaction_index` — no coercion, per the repo's INVALID_TRUNCATION_INDEXES contract (MUST-CHANGE) |
| `toIndex <= existing boundary` | typed `already_compacted` no-op — the boundary keys are NEVER written downward (monotonicity, MUST-CHANGE) |
| `proof.checkpointDir` missing/invalid (`readCheckpoint` non-VALID structural read) | typed `snapshot_proof_missing` |
| proof valid but `descriptor.lastIncludedIndex < toIndex` | typed `snapshot_proof_stale` |
| proof valid but `descriptor.lastIncludedTerm` disagrees with the live log's term at that index (row still present pre-compaction) | typed `snapshot_proof_term_conflict` — term-anchors the identity-free structural read against foreign checkpoints (verifier SHOULD, adopted) |
| `toIndex > committedIndex` | typed `beyond_committed_refusal` (physical removal never outruns the durable watermark, let alone proof) |
| valid proof, `toIndex <= min(committedIndex, proof.lastIncludedIndex)` | COMPACT |

COMPACT (one SQLite transaction, then cache invalidation):

1. Read `term(toIndex)` from the live log (or the existing boundary when
   `toIndex` equals it) BEFORE deletion — the last-included term/index
   consistency boundary is preserved by writing
   `snapshotLastIncludedIndex/Term = {toIndex, term(toIndex)}` in the SAME
   transaction as `DELETE FROM _raft_log WHERE log_index <= toIndex`.
   A missing term row for `toIndex` (already-compacted floor) reuses the
   boundary keys; a genuinely absent term is a typed
   `boundary_term_unresolvable` refusal — never a guess.
2. `committedIndex` and `lastAppliedIndex` are untouched (>= boundary by
   construction). `maxCommittedHlc` is NOT untouched (verifier
   MUST-CHANGE): the same transaction folds
   `max(existing key, max HLC over the rows being deleted)` into the key —
   otherwise a never-installed leader deletes the rows carrying its HLC
   evidence and a later checkpoint seals a REGRESSED clock.
3. Invalidate the instance boundary cache — AND (verifier REFUTATION of
   the stale-facade-is-safe claim): the boundary cache adopts the
   refresh-on-decision discipline the committed-index cache already has.
   A stale-LOW boundary on another facade over the same db is NOT safe
   once rows are deleted (has() would answer false for compacted indexes —
   resurrecting the S4 b2 livelock; getEntryInfoBefore would degrade to
   {0, term} disabling the prev-log check or to a stale boundary creating
   a committed hole; resolveEntryWrite would throw false conflicts;
   getLastInfo could break the CL-042 compacted-empty answer). Fix:
   `getSnapshotBoundary` re-reads from `_raft_state` at the row-miss
   decision sites — has()/get-last/entry-before/resolveEntryWrite refresh
   the cached boundary whenever a row is ABSENT at or below the current
   committedIndex before answering (mirroring
   `refreshCommittedIndexCacheFromStore`). S2's "boundary only changes at
   the closed-handle install" note is amended: compaction is the second,
   live-adapter writer.
4. Typed result {outcome: compacted, removedEntryCount, boundary}.

The witness interplay: `recordCommittedTruncationBlock` fires only in
(boundary, committedIndex) — after compaction the boundary rises, so
truncation requests at or below the NEW boundary are witness-silent, in
(newBoundary, committedIndex) still trip. The gated-compaction malformed
and catchup guards are unaffected (no-proof path unchanged).

Post-compaction integration (the S4 loop closes): a leader compacted at K
serves snapshot catch-up for followers below K via the S4 dispatch —
integration-tested; adapter reads (getLastInfo on emptied-below-K log with
surviving suffix, has(), getEntryInfoBefore at K+1) answer from the
advanced boundary.

In-memory adapter: refusal unchanged (S1 decision). Retention of the
`raft-snapshot-gated-compaction` quest: its guard files run unweakened in
the S5 scenario.

## Placement and callers

- `src/raft/snapshot-retention.js` + constants (either in-file or
  `snapshot-retention-constants.js`).
- Adapter changes: `compactCommittedEntries` decision table + boundary
  cache invalidation; the typed-outcome vocabulary extends
  `compaction-policy.js` (new outcomes ADDED next to
  `SNAPSHOT_PROTOCOL_UNAVAILABLE`; the frozen refusal result object and
  `unsupportedRaftCompactionResult()` stay byte-identical).
- No auto-trigger wiring (S6): no production caller invokes COMPACT yet;
  the opportunistic post-creation retention sweep is the only new
  production-adjacent invocation and touches only checkpoint directories,
  never the log.

## Proof (scenario `raft-snapshot-retention-compaction`)

- `test/raft/snapshot-retention-sweep.test.js`: bounded count; pinned
  (install-marker, transfer-marker, in-process) generations survive; the
  newest ALWAYS survives even unpinned/over-count; descriptor-first
  deletion (crash mid-removal reads partial, never valid); non-generation
  dirs untouched; opportunistic post-creation sweep engages.
- `test/raft/snapshot-proof-gated-compaction.test.js`: the full decision
  table (each typed refusal; the proofless call returns the byte-identical
  frozen refusal — asserted by identity against
  `unsupportedRaftCompactionResult()`); COMPACT round trip — rows <= K
  gone, suffix intact, boundary advanced to {K, term K}, committed/applied
  untouched, cache invalidated (getLastInfo/has answer post-compaction),
  witness window shifted; red direction: compaction WITHOUT proof cannot
  remove rows (the CL-040-class loss is structurally unreachable).
- `test/raft/snapshot-compaction-catchup-integration.test.js`: leader
  compacts at K with proof, a follower below K draws install_snapshot and
  completes the S4 loop (dispatch → transfer → install → resume at K+1);
  ordinary above-K catch-up still batches; a SECOND facade over the
  compacted db answers correctly after refresh-on-miss (the refuted
  stale-boundary scenario, pinned); post-compaction checkpoint creation
  seals a non-regressed maxCommittedHlc; the prepared-2PC gate's
  transitive soundness post-compaction is asserted.
- Runner re-runs the S1-S4 suites + all three gated-compaction files.

## Out of scope (S6)

Auto-compaction triggers/cadence, scale-profile threshold calibration
against the declared envelope, production ReplicaHandler wiring, live
rebuild certification.
