# W1b transition record: placement settled-outcome replay and its persisted format

Status: STAGE 1 (facts, witnesses, recommendation). No source change made.
Stage 2 waits for the lead's ruling (section 6).

- Worktree / branch: `/mnt/data/peter/projects/.worktrees/placement-outcome-format-20261121`,
  `work/placement-outcome-format-20261121`, created at `0993265e5`.
- Witness commits (pushed): `645c70cf1d13d2510d27c8a0715f433c4b48ff5a`,
  `5cac30b6ef6a1e906778ed857c9f1a7f98de50e8` (witness correction).
- Steering loaded: `CLAUDE.md`, `docs/steering/rules.md` (rule set revision 5,
  last_reviewed 2026-11-13), `docs/steering/router.md`,
  `architecture/contracts/authority-and-recovery.md`,
  `docs/steering/workflow-guidelines/solver-quests.md` (Contract-first owner work +
  checklist), `test/guidelines/INDEX.md`.
- Labels: **[exec]** = executed (where, sha); **[read]** = read-only (source,
  git history, docs).

## 1. Facts

### 1.1 Where the outcome row lives [read]

- There is no placement-owned table or column. The row is one row of the
  shared committed-statement outcome table `_partition_statement_outcomes`,
  owned by the committed-statement outcome owner:
  `src/partition/partition-committed-statement-outcome-constants.js:22-51`
  (`entry_key TEXT PRIMARY KEY, outcome, log_index, term, failure_code,
  failure_message, changes INTEGER, last_insert_rowid INTEGER,
  owner_result_text TEXT`, all result columns nullable).
- The key is `entry:<entryId>` for every committed command on the partition
  (`partition-committed-statement-outcome.js:86-89`): SQL statements,
  placement commands, CDC/participant/formation/coordinator commands all share
  the namespace of one partition.
- The placement owner writes its result as `owner_result_text` and its
  command identity ("fingerprint") into the GENERIC `last_insert_rowid`
  column: `src/partition/partition-placement-admission.js:296-299`
  (`result: {changes: rows.length, lastInsertRowid: commandFingerprintOf(command)}`).
  The fingerprint is the first 48 bits of `sha256("<type>:<bodyText>")`
  (`partition-placement-admission.js:59-64`). The generic owner's contract for
  that column is the nullable insert-result contract
  (`partition-committed-statement-outcome.js:35-46`: "a consumer reads null as
  'no inserted-row identity', never as a row id"). The formation owner
  overloads the same column the same way
  (`src/control-plane/membership-publication-formation-transition-command.js:470-475, 713-722`).
- Store-open steps today (`src/partition/partition-service-raft-init-base.js:242-252`):
  `detectLegacyPartitionConsensusState` (read-only, typed refusal to start on
  retired-backend content), then `createCommittedStatementOutcomeTable`
  (`partition-committed-statement-outcome.js:123-134`: `CREATE TABLE IF NOT
  EXISTS` plus an `ADD COLUMN` presence loop for `changes`,
  `last_insert_rowid`, `owner_result_text` that leaves old rows NULL; added in
  `54dd2d7ce`, 0.2.6), then `openParticipantTransactionStore`.
- Snapshot install adopts an image by creating a replacement PartitionService
  on the same `dbPath` (`src/raft/snapshot-catchup.js:379-391`,
  `src/partition/partition-reopen-options.js`), so it passes the same store-open
  steps. Images carry `_partition_statement_outcomes`
  (`src/raft/snapshot-application-content.js:86-96`).

### 1.2 History of the identity column [read]

| Commit | Date (+0100) | Fact |
| --- | --- | --- |
| `54dd2d7ce` | 2026-10-27 | 0.2.6: outcome table gains `changes`, `last_insert_rowid`, `owner_result_text` via ADD COLUMN; `PARTITION_SETTLED_REPLAY.OUTCOME_NOT_RETAINED` for old NULL rows. |
| `73c06f635` | 2026-11-19 09:45 | `PLACEMENT_ADMIT` apply and `CLUSTER_FORMAT_REVISION = 1` introduced. Placement rows written as `changes NULL, last_insert_rowid NULL, owner_result_text JSON` (pre-fingerprint). |
| `8b7b0ad5b`, `6349f4bc8`, `da526999f`, `0970ab012` | 2026-11-19 10:58-14:08 | Same pre-fingerprint writer (`0970ab012:src/partition/partition-placement-admission.js:204-205`). |
| `114bd4200` | 2026-11-19 16:57 | Fingerprint introduced (written into `last_insert_rowid`); exact replay or BYTES. |
| `ab901b40f` | 2026-11-19 19:14 | Review repair adds the pre-fingerprint heuristic (`matchesPreFingerprintAdmittedResult`/`isPreFingerprintCommandReplay`) AND a durable backfill `UPDATE _partition_statement_outcomes SET last_insert_rowid = ? WHERE entry_key = ? AND last_insert_rowid IS NULL` with the replaying command's fingerprint. |
| `4ef9423c0` | 2026-11-19 20:41 | Backfill removed (heuristic kept, extended later). Backfill existed in `ab901b40f`, `d504b4acf`, `58e420741`, `fa22c2438` (19:14-20:11). |
| `ad4ea3610`, `4833ab4dc` | 2026-11-21 10:54-10:55 | WIP: heuristic deleted; NULL fingerprint -> `OUTCOME_IDENTITY_UNAVAILABLE`. |

Release exposure:

- Tags `v0.1.0` .. `v0.4.0` (latest `v0.4.0` = `07206ba1c`, 2026-10-31): none
  contains `73c06f635` or any later commit above (`git tag --contains`
  empty). `git grep` of `PLACEMENT_ADMIT|applyPlacementCommand` is empty at
  `v0.4.0` and at `origin/main` (`0dbed1718`). No released version and no main
  head ever wrote a placement outcome row, with or without a fingerprint.
- The five pre-fingerprint commits are ancestors only of `candidate/*`,
  `wip/*` and `preserve/*` branches; every remote branch containing
  `73c06f635` also contains `114bd4200` (no branch tip inside the window).
- Whether any long-lived lab/GCP data directory was founded by one of the
  five window builds (or touched by the backfill build) and still exists is
  NOT verified (no filesystem-wide scan was made).

### 1.3 Persisted-format and upgrade owners that exist [read]

- **Cluster format revision** (support-envelope owner,
  `src/bootstrap/owners/support-envelope-owner.js:15-24`;
  `docs/operations-readiness.md:214-276`): release-keyed, write-once in the
  seed's original allocation; an absent or different revision is refused at
  join (`OUTSIDE_SUPPORT_ENVELOPE`) and at seed start
  (`ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED`); no in-place upgrade or
  downgrade across a revision; remedy is re-founding on empty data
  directories. "Revision 1 is the release that ships ... the placement
  owner"; introduced in the same `73c06f635`, unreleased. Every released store
  carries no revision and is refused by every revision-1 build. Window
  stores carry revision 1 and are NOT distinguished by this fence.
- **Legacy consensus detector** (`src/partition/partition-legacy-consensus-state.js`):
  the existing precedent of a read-only, content-based, typed refusal at store
  open.
- **Snapshot payload version** (`src/raft/snapshot-checkpoint-constants.js:33-36`):
  `raft_rs_replica_image` = 2 since 0.2.6, unchanged through the window, so
  it does not distinguish window images either.
- No partition-store schema version or `user_version` marker exists. The
  support envelope declares a policy id `schemaBoundary: raft-sqlite-schema-v1`
  (`docs/support-envelope.json:6`), which is not an executable store marker.
- No supported upgrade contract exists on 0.x
  (`docs/operations-readiness.md:189-199`, `architecture/INDEX.md:147`,
  `docs/current-capabilities-and-limitations.md:158,206`).
- Precedent for an unreleased format change: the committed learner-origin
  contract (`architecture/contracts/message-group-committed-learner-origin.md:210-217`)
  makes the old UNRELEASED version "explicitly unsupported ..., not silently
  treated as containing proof. No supported upgrade claim is made."

### 1.4 Row states for `entry:<id>` on `replica_operations-p1` today [read]

Rows are written only at terminal settlement inside the apply transaction;
there is no "reserved / no result yet" row in this table.

| State | Shape | Current writer | Replay at HEAD |
| --- | --- | --- | --- |
| S0 UNSETTLED | no row (proposed, pending, parked by a reservation, rolled back) | none; pending fingerprints are in memory (`pendingPlacementCommandFingerprints`), unresolved attempts in `_placement_owner_unresolved_attempts` | proposal / pending join |
| S1 placement, current | `applied`, `changes = rows.length`, `last_insert_rowid = fingerprint`, `owner_result_text` JSON (ADMITTED/RELEASED/REFUSED incl. CDC_CAPACITY) | `applyPlacementCommand` (`partition-placement-admission.js:295-299`) | equal -> original receipt; else `BYTES` (request) / throw `BYTES` (apply) |
| S2 placement, pre-fingerprint | `applied`, `changes NULL`, `last_insert_rowid NULL`, `owner_result_text` JSON | none at HEAD; only window builds `73c06f635`..`0970ab012`; enters a HEAD store only by reopening a window data dir or installing a window image | `OUTCOME_IDENTITY_UNAVAILABLE` (request refusal; apply returns REPLAYED and resolves that refusal) |
| S2b backfilled | looks like S1, but its fingerprint was inferred from mutable operation rows by the heuristic and written back | none at HEAD; only the four backfill builds (`ab901b40f`..`fa22c2438`) | indistinguishable from S1 |
| S3 foreign, current | another owner's row under the same key: generic SQL `applied` (`last_insert_rowid` NULL for UPDATE/DELETE/DO UPDATE/zero-row statements, `owner_result_text` NULL; `partition-service-entry-apply-base.js:748-754`) or `statement_failed` (all result columns NULL; `partition-committed-statement-outcome.js:372-378`) | generic SQL apply | NULL rowid -> `OUTCOME_IDENTITY_UNAVAILABLE` (**misclassified as S2**); non-NULL rowid -> `BYTES` |
| S4 corrupt | e.g. `owner_result_text` not a placement result | none | `retainedResult` throws `RESULT` |

(Coordinator-settlement rows exist only on `sql_transactions` partitions;
participant operation rows use `txop:` keys.)

### 1.5 Every reader of the NULL condition [read]

Direct (decides on `lastInsertRowid === null`):

1. `recordedReplayRefusal` `partition-placement-admission.js:66-73`
   - request path: `recordedRequestAnswer` `:106-113` <- `proposePlacementCommand`
     `:127-131` <- `requestPlacementCommand` <- `requestPlacementAdmission`,
     `requestPlacementHoldRelease`, and `requestPlacementRepair` via
     `replica-operation-retained-repair-ingress.js:56-58` (SETTLED delegates to
     native) - the retained-repair writer's files consume it unchanged;
   - apply path: `applyPlacementCommand` `:281-290` (NULL -> REPLAYED with the
     refusal as the committed write's answer).

Readers of the same record that decide without command identity:

2. `isSettledInStatementOutcomes` (`src/rebalancer/replica-placement-owner-attempts.js:76-80, 90-96`):
   any row under `entry:<attempt.entryId>` (hand-built key) deletes the
   durable unresolved attempt; an S2 or S3 row discharges an obligation it does
   not identify.
3. Generic `settledAppliedResult` (`partition-committed-statement-outcome.js:198-207`):
   `changes === null` -> `OUTCOME_NOT_RETAINED` (NULL-means-old-format, 0.2.6);
   a SQL command colliding with an S1 key is answered the placement
   fingerprint as `lastInsertRowid` with `OUTCOME_RETAINED`.
4. `readCommittedStatementCensusIn` (`partition-committed-statement-outcome.js:92-114`)
   reports the fingerprint as `lastInsertRowid`.

## 2. Defects

- **D1** S3 with a NULL rowid (a current-format record of another owner,
  including a statement failure, which retains no result) is classified as an
  old placement format: request answers `OUTCOME_IDENTITY_UNAVAILABLE`
  instead of the collision; apply consumes the committed placement entry as
  REPLAYED instead of failing closed like every other collision.
- **D2** The NULL branch is a permanent hot-path compatibility branch: no
  persisted format marker, no migration, no owner/event/operator action that
  ever retires it; the outcome table is not compacted ("grows one row per
  committed statement", `partition-committed-statement-outcome-constants.js` header).
- **D3** `OUTCOME_IDENTITY_UNAVAILABLE` has no `PLACEMENT_CLEARING_TRIGGER`
  row, nor do `ORIGIN`, `BYTES`, `REMOVE_INTENT_UNSCOPED`, `TARGET`, `RESULT`.
- **D4** The identity lives in another owner's column (`last_insert_rowid`),
  so absence cannot be made impossible per owner at the schema boundary, and
  generic readers reinterpret it (section 1.5 items 3-4). R08/R06.
- **D5** (pause) `d1ad6aea7` moved `pausedWriteAnswerOf` after the settled
  check for all placement commands; it had no witness. The generic SQL write
  path already answers settled redeliveries before the pause
  (`startAdmittedPartitionWrite`, `partition-service-raft-write-commit.js:433-450`);
  the formation owner keeps pause-before-settled
  (`membership-publication-formation-transition-command.js:520-537`).

## 3. Contract-first checklist

1. **Producer/consumer symbols**: producer `applyPlacementCommand` ->
   `recordCommittedStatementOutcome`; consumers `proposePlacementCommand`,
   `applyPlacementCommand`, retained-repair ingress (delegates),
   `reconcilePlacementAttempts`/`isSettledInStatementOutcomes`, generic
   `settledAppliedResult`, `readCommittedStatementCensusIn`.
2. **Owner-defined shape**: today none (identity borrowed from the generic
   `last_insert_rowid`). Option (i) below defines it in the outcome owner.
3. **Identity/generation**: subject = entry key `entry:<entryId>` on one
   partition; identity = digest of `(type, bodyText)`; timestamps/proposer are
   excluded so a new leader's rebuilt command is the same command. Cluster
   format revision 1 is the store's format generation; there is no finer one.
4. **Ordering**: the row is written in the apply transaction at the entry's
   log index; leadership -> committed-command admission -> settled replay ->
   cutover pause -> pending join -> proposal (`proposePlacementCommand`).
5. **Absent vs unavailable**: an absent row is `UNSETTLED` (named). A settled
   row without identity is not "unavailable identity": in a supported store
   it cannot exist (i), so meeting one is a typed format refusal at open, and
   a foreign row is the collision.
6. **Durable commit**: the outcome row and ledger rows commit in
   `applyCommittedEntrySliceTransaction` with the applied index.
7. **Retained obligations**: unresolved attempts
   (`_placement_owner_unresolved_attempts`), pending in-memory fingerprints,
   parked reserved writes; none is stored in the outcome table.
8. **Wake/cleanup**: a refusal's wake is its `PLACEMENT_CLEARING_TRIGGER`
   row; a store refused at open is retired by re-founding (support-envelope
   procedure), not by any runtime event.

## 4. Options

### (i) No supported persisted store can contain pre-fingerprint rows (RECOMMENDED)

Why it holds: no release and no main head ever wrote a placement row; every
released store is refused by the revision-1 fence; 0.x has no supported
upgrade; revision 1 is unreleased and the repository's precedent makes an
unreleased old format "explicitly unsupported". The only stores that can
hold S2/S2b are data directories of nine development builds of 2026-11-19
(five pre-fingerprint writers, four backfill builds).

Shape (stage 2):

1. Placement replay identity is exact equality; delete the NULL branch and
   `OUTCOME_IDENTITY_UNAVAILABLE`. A settled record that is not this command
   (S3, any shape) is the collision `BYTES` at request and at apply (D1). At
   apply that is the existing fail-closed throw (F5/P4): a committed same-key
   collision stops the group's application on every replica; this record keeps
   that contract and does not change it.
2. Identity required at the schema/write boundary: the outcome owner gains an
   owner-identity column (e.g. `command_digest TEXT`, full digest), with
   `CHECK (owner_result_text IS NULL OR command_digest IS NOT NULL)` in its
   `CREATE TABLE`; `recordCommittedStatementOutcome` refuses an owner result
   without a digest. `last_insert_rowid` returns to its single generic meaning
   (D4); every owner that writes `owner_result_text` writes `command_digest`:
   placement, formation, and coordinator settlement (which already carries a
   `settlementDigest` and a content-addressed entryId).
3. Format boundary: `createCommittedStatementOutcomeTable` (already the
   store-open step, also reached by snapshot install) refuses typed, read-only,
   a table that lacks `command_digest`, instead of migrating it (no ADD COLUMN
   path). Because every supported table then carries the CHECK, no row can
   violate it; the existing 0.2.6 ADD COLUMN loop and
   `OUTCOME_NOT_RETAINED` become unreachable in supported stores and are
   deleted with it.

Durable outstanding data: a pre-stage-2 development data directory (S1, S2,
S2b alike) is refused typed at open, with nothing rewritten; its ledger rows
and unresolved attempts stay on disk, unadopted. Retirement: re-founding on
empty data directories, the support-envelope owner's documented remedy for a
store outside the build's format. Released stores were already refused by the
revision fence. No code path remains for the old format.

Cost: every development data directory written before stage 2 must be
re-founded (not only window stores), because current S1 rows carry no
`command_digest`. S2b (heuristically backfilled) rows are refused rather than
trusted.

### (ii) Such rows can exist: one-time transition at store open (NOT recommended)

`createCommittedStatementOutcomeTable` would give each S2 row a named format
state at open. There is no defined terminal treatment that is safe:
answering a named refusal for those keys forever keeps a hot-path branch;
deleting the rows makes the entry key UNSETTLED and lets a re-proposed entry
execute again (R14); the table has no compaction owner that could retire them.
S2b rows cannot be distinguished from S1 at all. Durable outstanding data:
ledger rows already admitted proceed under the ledger; only their receipts
stay unanswerable. Retirement: none exists. This option cannot reach "no NULL
branch" without inventing a retention owner.

## 5. Witnesses (stage 1)

Commits `645c70cf1d13d2510d27c8a0715f433c4b48ff5a` and
`5cac30b6ef6a1e906778ed857c9f1a7f98de50e8` (tests only; the pre-commit hook
also regenerated derived metadata: owner-debt inventory, impact-graph seal,
shard classes).

- `test/partition/placement-settled-replay-cutover-pause.test.js` (W1):
  settled E0 under the cutover pause answers its original receipt (the
  committed fields success/partitionId/placementResult/committed/logIndex/term;
  frozen result), new E1 and unresolved E1u stay `CUTOVER_PAUSED` with E1u
  neither resolved nor dropped, a changed command under E0 is `BYTES`, a
  committed duplicate of E0 is a no-effect replay, nothing is proposed; a
  demoted leader answers `NOT_LEADER` for E0.
- `test/partition/placement-outcome-format.test.js` (W2): D1 for an applied
  SQL row and a statement-failure row under the same key (request and apply);
  D2 as "an S2 row is refused typed when its store opens".
- `test/partition/placement-admission-trigger-coverage.test.js` (W3): every
  code of `PLACEMENT_ADMISSION_ERROR`, `PLACEMENT_REFUSAL`,
  `PARTITION_WRITE_LEADERSHIP_REFUSAL` has a row; a probe proves an added code
  is reported.

Lab results: see section 8.

## 6. Rulings needed from the lead

1. Select (i) (recommended) or (ii).
2. Widen stage-2 scope to the outcome owner
   (`partition-committed-statement-outcome.js`, `-constants.js`), its store-open
   caller only if needed (`partition-service-raft-init-base.js`), and the
   formation owner's recorder/replay
   (`membership-publication-formation-transition-command.js`) and the
   coordinator-settlement recorder (`partition-coordinator-settlement.js`), so
   the identity column is required at the schema boundary (D4). Without this widening, only
   step 1 of (i) fits the writable set, and absence stays possible.
3. Accept that all pre-stage-2 development data directories are re-founded.
4. Trigger rows for the six unmapped codes (proposal: `BYTES`, `ORIGIN`,
   `TARGET`, `REMOVE_INTENT_UNSCOPED`, `RESULT` -> `null` definite answers;
   `OUTCOME_IDENTITY_UNAVAILABLE` deleted under (i)). The existing F11 test
   `test/rebalancer/replica-placement-owner-clearing-triggers.test.js`
   hard-lists the null set and is outside this writable set.
5. Delete WIP test F5b in `test/partition/placement-admission-apply.test.js`
   (it pins `OUTCOME_IDENTITY_UNAVAILABLE`) under (i).
6. Whether the formation owner's pause-before-settled ordering should follow
   the placement/generic ordering (separate owner).
7. Confirm W2's apply expectation: a committed placement command meeting a
   foreign record under its key fails closed with `BYTES`, the same as a
   fingerprint collision (current F5/P4 contract), rather than being consumed.

## 7. Siblings (listed, not fixed) [read]

- Generic outcome owner: `createCommittedStatementOutcomeTable` ADD COLUMN loop
  plus `PARTITION_SETTLED_REPLAY.OUTCOME_NOT_RETAINED`
  (`partition-committed-statement-outcome.js:123-134, 198-207`,
  `-constants.js:58-79`): NULL `changes` means "written before results were
  retained" (released in 0.2.6). Under revision 1 a revision-less store is
  refused at join/seed start, so this is dead compatibility; option (i) step 3
  deletes it.
- Formation owner (`src/control-plane/membership-publication-formation-transition-command.js`):
  overloads `last_insert_rowid` with its fingerprint (D4); its replay has no
  NULL branch (NULL -> `INVALID_COMMAND`, the shape (i) asks for); it keeps
  pause-before-settled ordering (`:520-537`), unlike placement and the generic
  write path.
- Kernel ordering differs per owner: generic SQL `applyWrite`
  (`partition-service-write-metrics-base.js:701-740`) joins a pending write and
  answers a settled entry without a leadership check, then the pause
  (`startAdmittedPartitionWrite`); placement checks leadership, settled, pause,
  pending; formation checks pause before settled. Generic settled replays also
  stamp a fresh `acceptingNodeId`/`acknowledgedAtMs` (`:660-672`); placement
  replays carry none (no placement consumer reads them).
- Participant `operationResultsOf` (`partition-participant-transaction-apply.js:380-394`):
  `recorded.changes ?? null` reads an UNSETTLED (absent) record as a null
  result (absent inferred, R07).
- `replica-placement-owner-attempts.js:76-96` (rebalancer): any row under a
  hand-built `entry:<id>` key discharges a durable unresolved attempt without
  identity.
- Coordinator settlement is NOT a sibling defect: its entryId is
  `settlement prefix + sha256(commandText)`
  (`src/query/distributed/distributed-transaction-settlement.js:128-130`), so
  the key is the identity. Placement cannot adopt that: F4 requires the same
  body under a fresh attempt id.
- Trigger tables: only the placement owner has one; F11
  (`test/rebalancer/replica-placement-owner-clearing-triggers.test.js`) is red at
  `645c70cf1` because the retained-repair WIP added three `null` rows
  (`retained_identity_changed`, `retained_row_changed`,
  `retained_admission_required`) without updating its hard-listed null set.

## 8. Lab results [exec, adams-gamla, base 0dbed1718]

Output directories under `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/`
(each with `selection.json`, `exit.json`, host `.log/.err`, and
`test-results.ndjson` where produced; console in `<dir>.console.log`).

| Run dir | Sha | Files | Result | First failure per failing case |
| --- | --- | --- | --- | --- |
| `w1b-head-witnesses` | `645c70cf1d13d2510d27c8a0715f433c4b48ff5a` | W1, W2, W3, `placement-admission-apply.test.js`, `replica-placement-owner-clearing-triggers.test.js` | files 1 pass / 4 fail; tests 15 pass / 6 fail | W1#1: witness over-specified (the first answer's `acceptingNodeId`/`acknowledgedAtMs` delivery stamp, `partition-service-raft-write-commit.js:399-403`, is absent on a replay) - verifier defect, corrected in `5cac30b6e`; W1#2 pass. W2#1/#2: request answered `placement_outcome_identity_unavailable` for another owner's applied / statement_failed record (D1). W2#3: store opened; hot path answers `placement_outcome_identity_unavailable`, clearing-trigger row: false (D2/D3). W3#1: six unmapped codes `ORIGIN, BYTES, OUTCOME_IDENTITY_UNAVAILABLE, REMOVE_INTENT_UNSCOPED, TARGET, RESULT` (D3); W3#2 pass. `placement-admission-apply.test.js` 10/10 pass (F5b pins the WIP semantics). F11 #1 red: null set gained `retained_admission_required`, `retained_identity_changed`, `retained_row_changed` (pre-existing, retained-repair WIP); F11 #2-#4 pass. |
| `w1b-head2-witnesses` | `5cac30b6ef6a1e906778ed857c9f1a7f98de50e8` | W1, W2, W3 | files 1 pass / 2 fail; tests 3 pass / 4 fail | W1 2/2 pass. W2#1 and #2: `{request: placement_outcome_identity_unavailable, apply: null (consumed as REPLAYED), appliedIndexAdvance: 1}` vs expected `{BYTES, BYTES, 0}`. W2#3 as above. W3#1 as above. |
| `w1b-mutation-pause-first` | `2e0b33342e5eb7775dd594f3ca12db207a31c39f` (plumbing mutation, stale seal) | W1 | no result (exit 97) | lab placement refused: "the commit's generated metadata is stale; regenerate and commit test/shards/impact-graph-seal.json". Not a test result. |
| `w1b-mutation2-pause-first` | `ed90e745834f87d1d91841497c23212b6915c2ec` (detached mutation of `5cac30b6e`: pause before settled replay, hook-regenerated metadata; local ref `probe/w1b-mutation-pause-first`, not pushed) | W1 | 0 pass / 1 fail | W1#1 red: E0 replay answered `success: false` with no receipt (the pause refuses it); W1#2 (leadership first) pass in both orderings. W1 therefore discriminates the ordering change. |

Local [exec, controller, niced]: eslint clean on the three new files;
`node --test test/partition/placement-admission-trigger-coverage.test.js` at
`645c70cf1` working tree: 1 pass / 1 fail with the same six codes.

---

# STAGE 2 (lead rulings of 2026-11-21: option (i), widened scope)

Labels as above: **[exec]** executed (where, sha), **[read]** read-only.

## 10. Commits (branch `work/placement-outcome-format-20261121`, pushed)

| Step | Sha | Content |
| --- | --- | --- |
| 1 | `38708b6fa0ae54f04c1c5f8c516154bd2c482844` | exact placement replay identity (NULL branch and `OUTCOME_IDENTITY_UNAVAILABLE` deleted), repair capability probe removed, trigger rows for `ORIGIN`/`BYTES`/`TARGET`/`REMOVE_INTENT_UNSCOPED`/`RESULT` (null = definite), F11 enumerates the vocabularies (W3 folded in), F5b deleted |
| 2 | `6d3a0c4f67d63ac6ae19a98a918783e9608459bb` + `b213e5e79b5f03e357e42bb88872824553d6f8a7` (boundary witness fix) | owner identity column `command_digest` + CHECK, typed store-open format refusal (ADD COLUMN loop deleted), exact-settlement owner function for placement/formation/coordinator/attempts, one owner-command prelude for placement and formation |
| 3 | STEP3_SHA | coupled pairs + contract in `test/shards/impact-contracts.json` (selects the whole corpus; not run by me) |

## 11. The owned receipt identity (reviewer's completion criterion)

- Definition, stated once at the outcome owner
  (`src/partition/partition-committed-statement-outcome-constants.js`
  `committedCommandDigest`): `sha256` over the UTF-8 text
  `"<command type>:<canonical text>"`, hex-encoded, full width (64 hex
  characters). Canonical text = the pinned `bodyText` of a placement or
  formation command, the `settlementText` of a coordinator settlement.
  Timestamp, proposer and address are excluded, so a new leader's rebuilt
  command under the same entry is the same command.
- Stored in its own column `command_digest TEXT`; the table CHECK
  `(owner_result_text IS NULL) = (command_digest IS NULL)` and
  `recordCommittedStatementOutcome` (typed `partition_statement_outcome_owner_identity_invalid`)
  make an owner result without its identity, or the reverse, impossible.
  Owner rows now write `last_insert_rowid = NULL`; that column is only an SQL
  statement's inserted-row identity again. The 48-bit truncation in
  `last_insert_rowid` is gone from placement and formation.
- One owner function decides settlement for both answering a replay and
  retiring retained work: `readSettledOwnerCommandIn(db, {entryId, commandDigest})`
  -> `UNSETTLED | SAME_COMMAND (record) | OTHER_RECORD`; the entry key comes
  from the owner's `committedStatementEntryKey` (no hand-built `entry:` key).

## 12. Exact-settlement consumers of `_partition_statement_outcomes`

"A durable outcome settles only the exact entry it proves."

| # | Consumer | Settles what | Identity checked BEFORE stage 2 | AFTER | Near-miss witness |
| --- | --- | --- | --- | --- | --- |
| 1 | placement replay, request (`proposePlacementCommand` -> `ownerCommandPrelude`) | answers E0's receipt | 48-bit fingerprint in `last_insert_rowid`; NULL branch (WIP) | full digest via `readSettledOwnerCommandIn`; OTHER_RECORD -> `BYTES` | `placement-outcome-format` #1/#2 (SQL applied, statement_failed), boundary near miss, `placement-admission-apply` F5/P4 |
| 2 | placement replay, apply (`applyPlacementCommand`) | REPLAYED without effect | same as 1 | same; OTHER_RECORD -> throw `BYTES` (fail closed) | same |
| 3 | placement unresolved attempts (`replica-placement-owner-attempts.js` `isSettledInStatementOutcomes`) | deletes a durable unresolved attempt | NONE: any row (`SELECT 1 ... WHERE entry_key = ?`, hand-built key) | digest of the attempt's own command (`placementBodyDigestOf(type of its kind, body)`) through `readSettledOwnerCommandIn`; only SAME_COMMAND discharges | `replica-placement-owner-attempts-exact-settlement` (SQL record, other body, other command type: kept; exact admit/release: discharged) |
| 4 | formation replay, request and apply | answers / REPLAYED | 48-bit fingerprint; pause before settled | full digest through the prelude; `INVALID_COMMAND` / fail closed | `formation-transition-settled-replay`, boundary near miss |
| 5 | coordinator settlement, request and apply | answers / REPLAYED | NONE: any record under the key (entryId is content-addressed, so only another owner's record can collide) | digest of `type:settlementText`; `BYTES` / fail closed | `coordinator-settlement-exact-settlement` (SQL record; another command's owner record) |
| 6 | retained-repair ingress (`replica-operation-retained-repair-ingress.js:56-58`, other writer) | nothing: a SETTLED record only routes to native submission | any row | unchanged; native submission (= consumer 1) applies the exact check | covered by 1 |
| 7 | generic SQL replay (`settleRecordedCommittedStatement`, `answerSettledStatement`/`settledAppliedResult`, `answerSettledWrite`, `isSettledRedelivery`) | answers an SQL write's receipt / consumes a committed SQL entry as REPLAYED | NONE: any row | unchanged (lead: do not change the generic SQL path in this slice) | PROPOSED: settle a placement/coordinator command under entryId X; an SQL write under X must be refused (today: success with `OUTCOME_RETAINED`/`OUTCOME_NOT_RETAINED`), and a committed SQL entry under X must not be consumed as REPLAYED |
| 8 | cold census `readCommittedStatementCensusIn` (seed retained effects) | observation, not settlement | n/a | now validates the identity pairing and exposes `commandDigest` | `seed-retained-effects` (foreign owner result planted with an identity) |
| 9 | mirror replay cursor `isAppliedStatementAtLogIndex` | an applied entry at a log index | entry key + APPLIED + `log_index` (position, not command) | unchanged | PROPOSED: a different command's APPLIED record at the same index under the key must not count |
| 10 | participant `operationResultsOf` (`txop:` keys) | COMMIT answer results | reads an UNSETTLED (absent) record as `{changes: null, lastInsertRowid: null}` | unchanged (its owner) | PROPOSED: a COMMIT whose operation outcome row is absent must answer a typed missing-result state, not null counts |

Near-miss consequence for consumer 3 [read]: the attempt stays durable and
unresolved. On each owner pass `resolveAttempt` returns the same attempt
(same intent) and `submitPlacementAttempt` re-requests under the same
entryId; the prelude finds OTHER_RECORD and answers `BYTES` (a definite
answer, trigger row null). `BYTES` is not `committed`, so the attempt is
neither deleted nor replaced: that intent's admission stays blocked, without
any invented effect, until the intent changes (a different intent creates a
fresh attempt and entryId). Nothing retires such an attempt today; whether a
definite collision should retire it is a lead/owner decision (the original
command can never apply successfully: its committed apply would fail closed,
see section 13).

## 13. "Fails closed at apply" (ruling 7) [read]

Path: `applyPlacementCommand` / `applyFormationTransitionCommand` /
`applyCoordinatorSettlement` throw inside
`applyCommittedEntrySliceTransaction`
(`src/raft/raft-rs-application-transaction-owner.js:140-185`): the whole
slice's SQLite transaction rolls back, every `afterRollback` effect runs
(`rejectCommittedWrite` for the proposer), and the error is rethrown. The
runtime (`src/raft/raft-rs-runtime-owner.js` `applyEntrySliceDurablyOrFailure`
-> `applyEntrySliceFailure` -> `groupFailed`, lines 195-216 and 1150-1185)
records a host failure `{phase: APPLICATION, reason: <the code text>}`, sets
the group's health to `RECOVERY_REQUIRED`, announces no role (a leader steps
down) and schedules recovery after the retry window.

- Applied index: does not advance (the applied state is written inside the
  rolled-back transaction). Witnessed: W2 #1/#2 and the coordinator witness
  assert `appliedIndexAdvance: 0`.
- Determinism: the verdict is a pure function of the committed command bytes
  (type + canonical text -> digest; `isPinned*Command`) and the outcome row
  under its entry key, which is replicated state-machine state (written in
  the same apply transaction on every replica, carried in snapshot images, and
  a store of another format is refused at open). Every replica applying that
  entry reaches the same verdict. No leader-local state (pending maps) takes
  part in apply.
- What an operator sees: the partition group held `RECOVERY_REQUIRED` with
  failure phase `application` and reason `placement_admission_bytes_invalid`
  / `FORMATION_INVALID_COMMAND` / `coordinator_settlement_bytes_invalid`;
  writes to the partition answer `partition_write_consensus_recovery_required`
  (`buildPartitionWriteLeadershipRefusal`, held host failure). Recovery
  re-delivers the same committed entry and reaches the same verdict: it is a
  partition-halting condition until the conflicting record or entry is dealt
  with by an operator. It can only arise when a command under an entry key
  that already holds another command's record is COMMITTED (the request path
  refuses it before proposal), i.e. a proposer defect or a forged entry.

## 14. Sibling dispositions

- ADD COLUMN loop (`PARTITION_COMMITTED_STATEMENT_RESULT_COLUMNS`) DELETED
  [read evidence]: the table first appears in a release at `v0.2.6`, and every
  released `CREATE TABLE` (`v0.2.6` .. `v0.4.0`) already has `changes`,
  `last_insert_rowid`, `owner_result_text`; no release predates the table
  (`git grep _partition_statement_outcomes v0.2.5` empty). The loop served
  only pre-release development tables. After step 2 any table of another
  column set is refused at open before any DDL. The seed-retained-effects
  "old-owner ALTER upgrade" case for this table was removed accordingly.
- `PARTITION_SETTLED_REPLAY.OUTCOME_NOT_RETAINED` KEPT, exposure reported:
  the necessity argument fails. Released builds (`v0.2.6`..) and the current
  format write APPLIED coordinator-settlement rows with NULL `changes`
  (an owner result, no statement result). The state is reachable in a
  supported store only through consumer 7 (a generic SQL replay settling on
  another owner's record); its comment now says so instead of "written
  before results were retained". Removing it belongs with the consumer-7 fix.
- Released stores: every released store has a table without
  `command_digest` and is now ALSO refused at partition open (it was
  already refused at seed start / join by the revision-1 fence).
- Every development data directory written before step 2 must be re-founded
  (lead ruling 3; in the step-2 commit message).

## 15. Findings for other owners

- Generic SQL write path (ruling 6) [read]: `applyWrite`
  (`src/partition/partition-service-write-metrics-base.js:701-740`) joins a
  pending write and answers a settled entry before any leadership check; the
  pause and leadership come later in `startAdmittedPartitionWrite`
  (`partition-service-raft-write-commit.js:446-463`). This looks deliberate:
  the outcome owner's contract (`partition-committed-statement-outcome.js`
  header) says a retry of a settled key "in process, on another replica, or
  after a restart" is answered from the row, and an immutable committed
  record grants no permission. It differs from the owner-command prelude
  (leadership first). Proposed witness for its owner: on a three-replica
  group, a FOLLOWER answers a settled SQL entry's replay with the original
  receipt (`replayOfLogIndex`) and refuses an unsettled one `NOT_LEADER`;
  if the owner decides leadership-first, the same witness flips.
- Retained-repair consumers of the new null rows [read]: `BYTES`,
  `ORIGIN`, `TARGET`, `REMOVE_INTENT_UNSCOPED`, `RESULT` now have rows, so
  `retainUncommittedRepairAnswer`
  (`replica-operation-repository-retained-placement-repair.js:242-249`) sets
  `clearingTrigger = null` for such an uncommitted answer instead of leaving
  the default `LEDGER_COMMIT`: the attempt is no longer re-driven on every
  ledger commit and stays in `retainedPlacementRepairs` with no wake (the
  committed-refusal path deletes on null; this one does not). The ingress can
  answer `BYTES` for a cross-node custody conflict
  (`replica-operation-retained-repair-ingress.js:61-68`). For the
  retained-repair writer to rule on.
- `requestPlacementRepair`: the method-existence probe is gone; an absent
  attached owner (no sink / workflowOwner / repository before
  `ensureReplicaPlacementOwnerAttached`) still answers typed
  `OWNER_UNAVAILABLE` (LEADERSHIP_START), because that absence is a runtime
  state, not a construction defect.

## 16. Coupled pairs (step 3)

Contract `committed-outcome-command-identity` (owners: the outcome owner's two
files, stem `src/partition/partition-placement-admission`, the formation
transition command, `partition-coordinator-settlement.js`,
`replica-placement-owner-attempts.js`, `partition-service-raft-init-base.js`;
tests: the boundary witness, `placement-outcome-format`,
`placement-settled-replay-cutover-pause`, `placement-admission-apply`,
`formation-transition-settled-replay`, `coordinator-settlement-exact-settlement`,
`replica-placement-owner-attempts-exact-settlement`,
`committed-statement-outcome`).

| Pair | Endpoint A | Endpoint B | Witness tests |
| --- | --- | --- | --- |
| `committed-outcome-owner-placement-admission` | `partition-committed-statement-outcome.js`, `-constants.js` | stem `src/partition/partition-placement-admission` | boundary, `placement-outcome-format`, `placement-settled-replay-cutover-pause` |
| `committed-outcome-owner-formation-transition` | same | `src/control-plane/membership-publication-formation-transition-command.js` | boundary, `formation-transition-settled-replay` |

Selection: the proof cone (`scripts/select-proof-cone.js`) selects a pair's
witnesses when either endpoint changes; `npm test` selection selects the
contract's `tests` by owner path. The step-3 commit changes
`impact-contracts.json`, a selector self-path, so it selects the whole corpus:
left for the lead to schedule.
