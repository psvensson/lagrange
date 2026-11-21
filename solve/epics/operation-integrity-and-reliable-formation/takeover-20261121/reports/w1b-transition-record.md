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
| 2 | `6d3a0c4f67d63ac6ae19a98a918783e9608459bb` + `b213e5e79b5f03e357e42bb88872824553d6f8a7` + `080223004532d0bd380602a88c175932c3885698` (two boundary-witness fixture repairs) | owner identity column `command_digest` + CHECK, typed store-open format refusal (ADD COLUMN loop deleted), exact-settlement owner function for placement/formation/coordinator/attempts, one owner-command prelude for placement and formation |
| 3 | `7652bb014c693a1d940090deaaf3f82e18238edf` | coupled pairs + contract in `test/shards/impact-contracts.json` (selects the whole corpus; not run by me) |
| 2 (follow-up) | `054971a7db5ca06cfc92004f73bea4f5f24c5e41` | `settled-replay-preserves-result` W5 rewritten to the typed store-open refusal (found red by the step-2 cone); lands after the pair commit, so the pair commit is not the tip |
| C1 (corrective, red) | `d9289d64dccad8532306c22573e0366410df9848` | red witnesses: census near miss (F4), blocked attempt (F6), owner columns without the CHECK (F9) |
| C2 (corrective, fix) | `87a2e83b863a66f5f2726c8e438bbbae9270c4ca` | F4 census settlement deleted; F6 typed blocked attempts; F9 one definition-based format decider; F3 owner-declared DEFINITE set + waiting map |
| C3 (corrective, red) | `1472e704d1bb127ae82686effc9a8922c475c1f4` | F7 red witness: the refusal's message names its code, and the refusal carries partitionId |
| C4 (corrective, fix, branch tip) | `aa0f6f1cc4446a26960b2fe5819178505b4d3de5` | F7 my side: refusal message leads with the typed code, carries partitionId, describes the definition decision |

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
| 3 | placement unresolved attempts (`replica-placement-owner-attempts.js` `attemptSettlementOf`, was `isSettledInStatementOutcomes`) | deletes a durable unresolved attempt | NONE: any row (`SELECT 1 ... WHERE entry_key = ?`, hand-built key) | digest of the attempt's own command (`placementBodyDigestOf(type of its kind, body)`) through `readSettledOwnerCommandIn`; only SAME_COMMAND discharges; OTHER_RECORD keeps it as typed blocked work (F6) | `replica-placement-owner-attempts-exact-settlement` #1 (SQL record, other body, other command type: kept and listed blocked with their record class; exact admit/release: discharged) |
| 3b | placement unresolved attempts, ledger census (`isSettledInCensus`, `replica-placement-owner-attempts.js` ~:98-103 at `054971a7d`; DELETED in `87a2e83b8`) | deleted a durable unresolved attempt when a `replica_operations` row's `admission.entryId` equalled the attempt's entry id, or a release's hold was no longer engaged | NONE: entry-id equality / hold state | removed: the census cannot carry the identity (a ledger row names only the entry id its admission ran under; a hold's state names no release command), so the census never discharges. Ledger rows and the outcome row commit in the same apply transaction, so the exact settlement needs no census | `replica-placement-owner-attempts-exact-settlement` #2 (an outcome row of another command under the attempt's entry + a census row naming that entry: kept; an unsettled release whose hold is released: kept). Red at `d9289d64d`, green at `87a2e83b8` |
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
fresh attempt and entryId). Nothing retires such an attempt (lead ruling,
corrective round): it is now VISIBLE as typed blocked work (section 19, F6).

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

## 17. Stage-2 lab results [exec, adams-gamla]

Output directories under `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/`
(console in `<dir>.console.log`). A `-aN` suffix is the N-th attempt of the
retry helper; earlier attempts of the same label ended "no lab machine is
ready" / "not a ready lab machine" / lab setup exit 97 (no test result).

| Run dir | Sha | Files | Result |
| --- | --- | --- | --- |
| `w1b-step1-witnesses` | `38708b6fa` | W1, W2, apply, F11 | no result: "no lab machine is ready" (formation run) |
| `w1b-step1-witnesses-r2` | `38708b6fa0ae54f04c1c5f8c516154bd2c482844` | W1, W2, apply, F11 | files 3/4 pass; only W2 #3 (prior-format store refused at open) red, as expected before step 2; W1 2/2, W2 #1/#2, apply 9/9, F11 4/4 green |
| `w1b-step1-baseline-core-formation` | `38708b6fa` | `replica-placement-owner-core`, `dt-formation-declared-size-latch` | core #20 and dt-formation #4/#6 red |
| `w1b-base-0993265e5-core-formation` | `0993265e53601cba4a6a41baa08158725cfcea7f` | same two | the SAME reds at the base: pre-existing, not caused by steps 1-2 |
| `w1b-step2-witnesses` | `6d3a0c4f67d63ac6ae19a98a918783e9608459bb` | 13 files | 10/13 pass. Red: boundary (fixture: `createSqliteStateMachineCheckpoint` -> `apply_watermark_divergence` on the controllable port, repaired in `b213e5e79`), core #20 and dt-formation #4/#6 (pre-existing, above). Green: W1, W2 4/4, formation replay, coordinator exact, attempts exact, apply 9/9, F11, `committed-statement-outcome` 20, `seed-retained-effects` 169, `partition-coordinator-settlement` 4 |
| `w1b-step2b-witnesses-r2-a3` | `b213e5e79b5f03e357e42bb88872824553d6f8a7` | 8 witness files | 7/8 pass; boundary: the store-REOPEN half passed for placement and formation; the image half failed in the fixture (`origin_replication_pending`), repaired in `080223004` |
| `w1b-mutant-ordering-r2-a12` | `6a23e4abd5d59f2816abe90b4ad17f48e6ac00b6` (detached mutant of `6d3a0c4f6`: pause before settled replay in `ownerCommandPrelude`; local ref `probe/w1b-mutant-ordering`) | W1, formation replay | KILLED: 0/2 files; W1 #1 and formation #1 red (E0 answered the pause, not its receipt); both leadership-first cases pass in either order |
| `w1b-mutant-identity-r2-a1` | `daa0281a81c9832da6ef598c1032b700f7634af9` (detached mutant: any record settles, `readSettledOwnerCommandIn`; local ref `probe/w1b-mutant-identity`) | W2, coordinator exact, attempts exact, formation replay, apply | KILLED: 0/5 files; coordinator 2/2 red (`coordinator_settlement_result_unavailable`), W2 #1/#2 red (`placement_admission_result_unavailable`), attempts red (near misses discharged), formation near miss red, apply F5 red; W2 #3/#4 (not identity-dependent) pass |
| `w1b-step1-cone` | `38708b6fa` | cone vs `0993265e5`: 819 files | 685 pass / 134 fail = 58 red files + 76 "no result: deadline" (the runner's one-hour deadline terminated the run) |
| `w1b-step2c-witnesses-r2-a1` | `080223004532d0bd380602a88c175932c3885698` (final step-2 head) | boundary, W2, W1, formation replay | 4/4 files green (10 tests): boundary placement + formation (reopen and image), W2 4/4, W1 2/2, formation 2/2 |
| `w1b-step1-cone-remainder-r2-a1` | `38708b6fa` | the 76 deadline files of the step-1 cone | 72 pass / 4 red: `test/scripts/select-change-tests.test.js`, `test/integration/control-plane-rebalance.integration.test.js`, `test/integration/lagrange-server-npm-package.integration.test.js`, `test/rebalancer/message-group-operation-routing.integration.test.js` |
| `w1b-base-attribution-step1-fails-r2-a1` | `0993265e53601cba4a6a41baa08158725cfcea7f` (base) | the 57 step-1 cone reds that exist at the base | 57/57 red at the base too: every step-1 cone red is pre-existing; the 58th, `placement-outcome-format`, was the expected W2 #3 red before step 2 |
| `w1b-step2-cone-r2-chunk00-a1` | `080223004` | step-2 cone vs `0993265e5`, part 1 of 3 (573 of 1742) | 562 pass / 11 red. 3 reds known pre-existing (dt-formation latch, joint-admission release liveness, placement-owner formation drain); 8 `test/control-plane/replica-dispatch-*` reds not in the step-1 cone: attribution at the base queued (`w1b-base-attribution-cone2-c00-*`) |
| `w1b-step2-cone-r2-chunk01-a1` | `080223004` | part 2 of 3 (572) | 522 pass / 14 red / 36 no result (runner deadline). New reds: `test/partition/settled-replay-preserves-result.test.js` W5 - CAUSED BY STEP 2 (the test planted a pre-result-column table through ALTER ... DROP COLUMN, which the CHECK now forbids, and asserted the deleted ADD COLUMN migration); rewritten to the typed store-open refusal. Others queued for base attribution: `replica-image-checkpoint-transfer`, `fresh-create-resumed-syncing-claim`, `message-group-learner-join.integration`, `rolling-restart-acknowledged-write-durability-visibility` |
| `w1b-step2-cone-r2-chunk02-a1` | `080223004` | part 3 of 3 (584 listed; 597 results incl. sub-files) | 548 pass / 49 red. 48 reds are files already red in the step-1 cone (pre-existing at the base); 1 new: `test/raft/snapshot-dispatcher-wiring.test.js` ("ReplicaHandlerSetup requires systemTableCache") |
| `w1b-step2-cone-r2-chunk01-remainder-a2` | `080223004` | the 36 deadline files of part 2 | 35 pass / 1 red: `test/raft/raft-rs-backend/initialization-shutdown-serialization.integration.test.js` (`work.owner.ownsPhysicalWorker is not a function`) |
| `w1b-base-attribution-cone2-c01-a1` | base `0993265e5` | the 4 other new part-2 reds | 4/4 red at the base: pre-existing |
| `w1b-base-attribution-cone2-c02-a6` | base | `snapshot-dispatcher-wiring` | red at the base: pre-existing |
| `w1b-base-attribution-cone2-c01-remainder-a9` | base | `initialization-shutdown-serialization.integration` | red at the base: pre-existing |
| `w1b-base-attribution-remainder-fails-a46` | base | the 4 step-1 remainder reds | 4/4 red at the base: pre-existing |
| `w1b-w5-fix-a13` | `054971a7db5ca06cfc92004f73bea4f5f24c5e41` (W5 rewrite, after the pair commit) | `settled-replay-preserves-result`, boundary, `placement-outcome-format` | 3/3 green (12 tests) |
| `w1b-base-attribution-cone2-c00-a41` | base | the 8 `replica-dispatch-*` part-1 reds | 8/8 red at the base: pre-existing |

Cone totals [exec]:
- Step 1 (`38708b6fa`, 819 files): 685 + 72 (deadline remainder) = 757 pass; 62 red files =
  58 (main run) + 4 (remainder). All 61 that exist at the base are red at the base too; the 62nd,
  `placement-outcome-format`, was the expected W2 #3 red before step 2.
- Step 2 (`080223004`, 1742 files in three parts + one deadline remainder): 562 + 522 + 548 + 35
  pass; reds 11 + 14 + 49 + 1. Every red except `settled-replay-preserves-result` W5 is either a
  step-1 cone red (pre-existing at the base) or was run at the base and is red there too.
  `settled-replay-preserves-result` W5 was caused by step 2 and is green at `054971a7d`.
- Attribution is per FILE (red at the base), not per failing subtest.

## 18. Not green, and why

- Pre-existing reds at the base `0993265e5` (not caused by this work; other writers' areas):
  formation convergence (`dt-formation-declared-size-latch` #4/#6, joint-admission release
  liveness, placement-owner formation drain), `replica-placement-owner-core` #20 ("requires a
  control-plane mutation ingress"), the retained-repair/coordinator fixture family
  (`placement-create-bootstrap-binding`, `placement-creation-terminal-replay`,
  `placement-founding-and-runtime-service-admission`, `placement-retained-row-repair` ...),
  the rebalancer operation-workflow family, `replica-dispatch-*`, `snapshot-dispatcher-wiring`,
  `initialization-shutdown-serialization`, `replica-image-checkpoint-transfer`,
  `fresh-create-resumed-syncing-claim`, `message-group-learner-join`, the rolling-restart
  durability harness, `select-change-tests`, `control-plane-rebalance`, npm-package,
  `message-group-operation-routing`. Full lists: the cone and attribution run directories.
- The step-3 pair commit selects the whole corpus: not run (lead to schedule). The exact branch
  tip `054971a7d` was run only for the three files above; the cones were run at `38708b6fa` and
  `080223004`.
- The boundary witness crosses the snapshot boundary through the producer's payload scrub and
  the store-open step, not through the checkpoint watermark gate or the install marker protocol
  (the controllable port has no raft-rs checkpoint boundary).

## 19. Corrective round (verify-w1b-outcome-identity.md, APPROVE-WITH-CONDITIONS)

Commits C1-C4 (section 10), on `work/placement-outcome-format-20261121`, pushed;
tip `aa0f6f1cc4446a26960b2fe5819178505b4d3de5`. Red-first: C1 and C3 carry only
witnesses; C2 and C4 carry the repairs.

### F3 (BLOCKING): the DEFINITE set is the owner's declaration [exec]

- `src/rebalancer/replica-placement-owner-constants.js`: one classification in
  one owner place. `PLACEMENT_DEFINITE_ANSWER_CODES` (frozen list, each code
  with its reason in the comment above it) and
  `PLACEMENT_WAITING_CLEARING_TRIGGER` (code -> declared trigger).
  `PLACEMENT_CLEARING_TRIGGER`, the table every consumer reads, is built from
  the two (DEFINITE -> null); no consumer changed.
- F11 (`replica-placement-owner-clearing-triggers.test.js`) imports the
  declaration, no hand list: (a) every code of every admission-path vocabulary
  has a row (unchanged enumeration); (b) the codes whose row is null are
  exactly `PLACEMENT_DEFINITE_ANSWER_CODES`, declared once; no code is both
  DEFINITE and waiting; every waiting code names a declared
  `PLACEMENT_TRIGGER` (never null).
- Mutant `b6a89872e1be457eba07cbebfaa09fca5f078cec` (detached, local ref
  `probe/w1b-mutant-definite`: `WRITE_REFUSAL.BACKPRESSURE` mapped to null in
  the waiting map): KILLED, `lab/w1b-mutant-definite-a1`, F11 #1 red "the null
  rows are exactly the declared DEFINITE codes".

### F4 (BLOCKING): the census never discharges [exec]

- Which: the census CANNOT carry the identity, so it must not discharge. A
  `replica_operations` row's admission metadata names only the entry id its
  admission ran under (no command type, no body digest); a release attempt
  could only be matched by "hold no longer engaged", which names no command
  at all. Ledger rows and the outcome row are written in the same apply
  transaction, so any command whose effect the census shows has its exact
  outcome record; the census adds no settlement, only false positives.
- `isSettledInCensus` deleted; `reconcilePlacementAttempts(db, uncertain,
  blockedAttempts)` decides only by `attemptSettlementOf` ->
  `readSettledOwnerCommandIn` (the function replay uses). The owner's
  leadership-start caller passes its blocked-attempt registry instead of the
  refreshed census (it still returns the refreshed census to its own caller).
- Near-miss witness: `replica-placement-owner-attempts-exact-settlement` #2
  (an outcome row of another command under the attempt's entry plus a census
  row naming that entry: kept; an unsettled release whose hold is released:
  kept). Red at C1 (`lab/w1b-corr-red-a1`), green at C2
  (`lab/w1b-corr-green-a1`). Consumer table: row 3b (section 12).

### F6: a kept, colliding attempt is visible blocked work [exec]

- Outcome owner: `PARTITION_COMMITTED_RECORD_CLASS {OWNER_COMMAND, STATEMENT,
  STATEMENT_FAILURE}`; `readSettledOwnerCommandIn` returns OTHER_RECORD with
  `recordClass` (named, not inferred by the caller).
- Attempts module: `PLACEMENT_ATTEMPT_STATE.BLOCKED_ON_KEY_COLLISION`;
  `createBlockedPlacementAttempts(logger)` holds one frozen state per attempt
  key `{state, attemptKey, entryId, recordClass}`; one `warn` per
  (attempt key, entry id), not per pass; `observePlacementAttemptAnswer`
  records it when a submitted attempt is answered `BYTES` and its entry key
  holds another record, forgets it when the attempt commits or is replaced
  (another entry id); leadership-start reconcile records it for every kept
  attempt that meets OTHER_RECORD.
- Owner: `blockedPlacementAttempts()` and `blockedAttempts` in both
  `lastPassSnapshot` shapes (the diagnostic).
- Release condition (no automatic retirement): the intent changes (a fresh
  attempt and entry id replaces the blocked one and drops its state), or an
  operator acts on the conflicting record or entry. The durable attempt row
  stays.
- Witness `replica-placement-owner-blocked-attempt.test.js` (real
  `replica_operations-p1` partition and admission request; an SQL statement
  settles first under the attempt's entry; two passes): both answers `BYTES`,
  one typed blocked state with entry id and `statement` class, exactly one
  warning, durable row kept. Red at C1 (missing capability), green at C2.

### F9: one format decider [exec]

- `detectCommittedStatementOutcomeFormat` now decides with the cold census's
  own rule (`partition-retained-store-observation.js`
  `retainedStoreTableExistsIn` + `readRetainedStoreRowsIn` with a zero-row
  probe and the owner's `CREATE_TABLE`: normalized CREATE text, no trigger, no
  stray index), inside one read transaction: absent -> ABSENT, the owner's
  definition -> CURRENT, any retained-store refusal -> UNSUPPORTED (other
  errors propagate). Column names are kept only for the refusal text.
- The decision runs once: store open (`partition-service-raft-init-base.js`)
  calls only `createCommittedStatementOutcomeTable(db, partitionId)` and
  closes its handle on the typed refusal.
- Witness `placement-outcome-format` #4 (the ten owner columns without the
  identity CHECK): red at C1 (opened), green at C2 (refused typed).

### F7: refusal after the destructive install [read; my side exec]

Call order (not my files; not edited):
1. `src/bootstrap/shared/snapshot-catchup-wiring.js:195-247` `orchestrate`
   -> `orchestrateSnapshotCatchupInstall`.
2. `src/raft/snapshot-catchup.js:353-358` receive the transfer;
   `:359-366` `service.shutdown()`.
3. `:367-378` `requestSnapshotInstall` -> `src/raft/snapshot-install.js:606-610`
   staging digest check, `:611-617` open staging DB + `populateStagedInstallDb`,
   `:619` `commitPreparedInstall` (the destructive swap of the replica store),
   `:625` INSTALLED. The checkpoint validation
   (`snapshot-checkpoint-store.js:481` `validateRaftRsPayloadTables`) does not
   look at the outcome table.
4. `snapshot-catchup.js:380-382` `options.createPartitionService` ->
   wiring `:226-238` -> partition initialize -> init-base throws the typed
   `partition_statement_outcome_format_unsupported`; wiring `retireOpening`
   (`:205-212`) rethrows the same error object (code intact).
5. `snapshot-catchup.js:384-388` returns `RECREATE_FAILED` with only
   `detail: error.message`: `error.code` is dropped here.

Smallest change for the snapshot owner: in `requestSnapshotInstall`, on the
staging DB it already opens (`snapshot-install.js:611`), before
`populateStagedInstallDb`/`commitPreparedInstall`, call
`detectCommittedStatementOutcomeFormat(stagingDb)` and on UNSUPPORTED
`rejectInstall(checkpointsRoot, marker, <new REJECTION code>)`, leaving the
replica store untouched; and add `code: error.code` to the RECREATE_FAILED
result (`snapshot-catchup.js:384-388`).

My side (C3 red, C4 fix): the refusal carries `code` and `partitionId`, and its
message leads with the code (`partition_statement_outcome_format_unsupported:
... is not the owner's definition ...`), so the message-only RECREATE_FAILED
detail still names it. Witness `placement-outcome-format` #3: red at C3
(`lab/w1b-f7-red-a1`), green at the tip.

Not done (documentation, other owner): `src/partition/README.md` does not
list this refusal; the remedy is in the error text and the constants comment.

### F5 (report only) [read]

Unchanged: the generic SQL replay (`answerSettledWrite`,
`settleRecordedCommittedStatement`, `isSettledRedelivery`) settles on any
record under the key. Proposed witness kept (section 12 row 7): settle a
placement or coordinator command under entry X; an SQL write under X must be
refused, and a committed SQL entry under X must not be consumed as REPLAYED.

### F8 (report only) [read]

- Where the PLACEMENT_REPAIR text is pinned:
  `partition-placement-admission-command.js:46` ->
  `canonicalRetainedPlacementRepair` (`partition-placement-retained-repair.js:37-53`)
  -> `{operation: copyOperationOutcomeData(operation), copyPolicy}`
  (`copyOperationOutcomeData` = `structuredClone` + freeze,
  `replica-operation-update-outcome.js:109-118`: the input's key order is
  kept); `bodyText = JSON.stringify(canonical.statement)` (`:72`), checked at
  apply against the same function (`:94`). So the text depends on the
  operation object's key order.
- Can the retained-repair owner produce a second text under one entry? Not at
  this head: it mints the entry id together with the body
  (`replica-operation-repository-retained-placement-repair.js:185-188`,
  `entryId = retained-repair:<op>:<uuid>` right after `attempt.body =
  preparation.body`) and re-presents that same object for that entry
  (`:224`); the remote path forwards the payload as JSON
  (`rebalance-coordinator-operation-creation-support.js:290-299`), which keeps
  key order; attempts are volatile, so a restart mints a new entry id. A
  second text would need a producer that rebuilds the body under a kept entry
  id. The ingress would not stop that (`replica-operation-retained-repair-ingress.js:42,68`
  compare with `isDeepStrictEqual`, which ignores key order); the partition
  then answers `BYTES` and apply fails closed. Checked at this head only, not
  on the retained-repair writer's current branch.

### F10 (report only) [read]

`partition-coordinator-settlement.js:58-83` keeps its own order (leadership,
admission, exact settlement, pending join) and joins a pending write by entry
id only (`:74-75`). Its entry id is content-addressed (prefix + sha256 of the
settlement), so a pending write under that id is a settlement of the same
content unless another owner proposes under that id; it is not moved onto
`ownerCommandPrelude` in this slice.

### Merge note (integration `23344cddc`, merge base `812dd3a1b`) [exec: `git merge-tree`, read-only]

- The merge base carries the 14 WIP commits `812dd3a1b..0993265e5` (not mine;
  the retained-repair writer's). This branch merges after the retained-repair
  branch.
- My files changed on both sides: two.
  - `src/partition/partition-placement-admission.js`: one textual conflict,
    `proposePlacementCommand` (ours: `ownerCommandPrelude`; theirs: the inline
    leadership -> admission -> `isSameCommandReplay` -> pause ->
    `commandFingerprintOf` pending join). Resolve to ours. The other hunks
    merge without a conflict: the pre-fingerprint heuristic
    (`matchesPreFingerprintAdmittedResult`, `isPreFingerprintCommandReplay`)
    and the capability probe are unchanged on the integration side since the
    base, so our deletions win; `observedLedgerAppliedIndex` for FOUND is kept
    in our `recordedRequestAnswer`. `applyPlacementCommand` and
    `requestPlacementRepair` merge cleanly (to ours).
  - `src/partition/partition-committed-statement-outcome.js`: merges cleanly
    (the integration side adds `entryId: command.entryId` to the two
    STATEMENT_FAILED answers).
- Other both-side conflicts are the retained-repair writer's
  (`replica-operation-repository-retained-placement-repair.js`, `-repository.js`,
  `-retained-repair-authority/-ingress/-observation/-record.js`,
  `placement-retained-*` tests), the generated `INDEX.md` files and the
  `test/shards/*` generated classes (regenerate).
- Semantic risk after the merge (unrun): the integration line's fixtures whose
  ledger has no outcome table or whose repository double lacks
  `acceptRetainedPlacementRepairRequest` (verifier F1); the integration line's
  consumers of `PLACEMENT_CLEARING_TRIGGER` read the same table.

### Lab results (corrective round) [exec, adams-gamla]

| Run dir | Sha | Files | Result |
| --- | --- | --- | --- |
| `w1b-corr-red-a1` | `d9289d64d` (C1) | attempts exact, blocked attempt, outcome format | 0/3: census near miss #2 red, blocked-attempt red (no capability), outcome format #4 red (opened without the CHECK) |
| `w1b-corr-green-a1` | `87a2e83b8` (C2) | 14 files | 13/14 green; `replica-placement-owner-core` #20 red with the same error as at the base (`w1b-base-0993265e5-core-formation`: "ReplicaOperationRepository requires a control-plane mutation ingress"), pre-existing |
| `w1b-mutant-definite-a1` | `b6a89872e` (mutant of C2) | F11 | KILLED |
| `w1b-f7-red-a1` | `1472e704d` (C3) | outcome format | #3 red (message did not name the code) |
| `w1b-corr-tip-a1` | `aa0f6f1cc4446a26960b2fe5819178505b4d3de5` (tip) | 17 files: every witness above, the boundary, W5, `committed-statement-outcome`, `seed-retained-effects`, apply, cutover pause, formation replay, both coordinator files, snapshot compaction catch-up, owner core, growth-promote, formation-barrier census | 15/17 green (497 assertions). Red: `replica-placement-owner-core` #20 (same error as at the base) and `growth-promote-authoritative-completion-and-progress` #7 subtests 40/42 (same subtests red at the base, `w1b-base-attribution-step1-fails-r2-a1`): both pre-existing |

Not rerun for C2-C4: the change cone vs `0993265e5` (C2-C4 touch the step-2 owner files plus
`replica-placement-owner.js`), and the pair commit's whole-corpus selection: lead to schedule.

## 20. Round 3 (verify-w1b-corrective.md): N1, F4 residue, N4, the real blocked-attempt red, hand-offs

Commits on `work/placement-outcome-format-20261121`, pushed:

| Commit | Kind | Content |
| --- | --- | --- |
| R1 `ce2d8e18f74fc17edbe0d0fb1b0ebced931cf482` | red tests | `replica-placement-owner-blocked-release.test.js` (idempotence proof, N1, F4 residue); F11 literal DEFINITE pin |
| R2 `ec1b2f77c85c39940aa856bba0ad2a7548a75b98` | fix | N1 re-drive, F4-residue retirement, one engaged-hold predicate, snapshot fields; unit witness adapted. The R1 witness read the snapshot field `retiredAttempts`; the pre-commit navigability rule forbids `retired` in an identifier, so the field is `supersededAttempts` and R2 renames that read (no assertion changed) |

### N1: branch (i) taken, with the idempotence evidence [exec]

- Idempotence by operation identity [read + exec]: `decideHoldRelease`
  (`partition-placement-admission-decision.js`) finds the hold by
  `release.operationId`; a lifted hold answers a committed
  `REFUSED HOLD_NOT_HELD` with no rows (`isEngagedLedgerHold`, now the one
  predicate). The hold is set only at admission (`operationOf`, a new row whose
  id `pl-<partition>-<logIndex>-<n>` is minted from the admitting log index)
  and lifted only by a release; no owner deletes `replica_operations` rows.
  Witness `blocked-release` #1 (real partition): release under `release-first`
  -> RELEASED, hold lifted; release under `release-second` -> committed,
  `REFUSED HOLD_NOT_HELD`, the row byte-identical to after the first, both
  outcome records settled; `PLACEMENT_CLEARING_TRIGGER[HOLD_NOT_HELD] === null`.
  Green at R1 (`w1b-r3-red-a1`) and at R2.
- Re-drive: `submitHoldRelease` -> `redrivenReleaseAttempt`
  (`replica-placement-owner-attempts.js`): only when the answer is `BYTES`
  AND the outcome owner reads `OTHER_RECORD` under the attempt's entry key. The
  fresh entry id is minted by the attempt owner exactly as every attempt's:
  `placement-owner:<nodeId>:release:<operationId>:<uuid>` (`nextEntryId`). The
  fresh attempt replaces the old one in memory and in the durable attempt row
  (same `attempt_key`, upsert) BEFORE it is submitted, so a crash re-drives the
  fresh id, never the dead one. The colliding id can never succeed (outcome rows
  are never deleted), so nothing is lost by abandoning it; the fresh id cannot
  double-apply (idempotence above).
- Visible: the blocked record moves to a bounded history (32) as
  `{state: REDRIVEN_UNDER_FRESH_ENTRY, attemptKey, entryId, recordClass,
  redrivenEntryId}` in `blockedAttempts`; one `warn` when it is first blocked,
  one `info` when it is re-driven. A blocked ADMIT keeps
  `BLOCKED_ON_KEY_COLLISION` (released when its intent changes; it stops only
  its own partition's intent).
- Witness `blocked-release` #2 (real partition, real owner passes, foreign
  committed SQL record planted under the first RELEASE entry and the first
  ADMIT entry): red at R1, `w1b-r3-red-a1`: "placement proceeds for the
  partition that is not blocked: admitted []" (the hold stayed engaged, the
  ledger move never left PENDING, every pass stopped). Green at R2: the hold is
  released, the ledger move completes, the unblocked user partition is admitted;
  it READS `lastPassSnapshot.blockedAttempts` for the RELEASE (REDRIVEN, naming
  the fresh entry, whose outcome record is RELEASED) and for the ADMIT
  (BLOCKED, durable row kept); one warning per blocked entry.

### F4 residue: superseded by ledger state [exec]

- Rule: an uncertain RELEASE attempt whose hold the committed ledger no longer
  holds engaged retires as `PLACEMENT_ATTEMPT_RETIREMENT.SUPERSEDED_BY_LEDGER`.
  The receipt (`readSettledOwnerCommandIn`) and the hold
  (`readEngagedLedgerHoldIn`) are read in ONE read transaction on the ledger
  leader's own store (`attemptDecisionIn`). SAME_COMMAND is checked first and
  is the only settlement; superseded is a separate branch that deletes the
  attempt, never marks the command applied, and lists it once in
  `supersededAttempts` (bounded history) with one `info` line. RELEASE only;
  hold absence only; ADMIT attempts never use it.
- When: all attempts at leadership start (`reconcilePlacementAttempts`), and
  the RELEASE attempts on every pass (`reconcileReleaseAttempts`), because a
  release is re-driven only while its hold is engaged.
- Transient absence: none found. A hold, once lifted, is never re-engaged
  under the same operation id: set only on insert at admission (fresh id per
  log index), cleared only by release; no owner deletes a ledger row, so a
  retained repair (`decideRetainedPlacementRepair`, which inserts only an ABSENT
  row) cannot re-create the row with a retained hold inside one ledger lineage.
  Not traced exhaustively: a writer that rewrites `steps_history` from a stale
  copy of a held, never-dispatched operation (the expected-step CAS would not
  stop it). Even then retirement is safe: the release obligation is re-derived
  from the census on every pass (`submitReleaseIfCopyIdle` mints a fresh
  attempt for an engaged hold), and a late commit of the retired entry is a
  release of the same hold (idempotent).
- Witness `blocked-release` #3 (real partition: leader a's lost release under
  `...:lost` persisted, leader b releases, a regains leadership): red at R1
  (attempt kept); green at R2 (attempt row gone, `supersededAttempts` lists it
  once across two passes, its entry UNSETTLED, one info line).
  `attempts-exact-settlement` #3 pins the same at unit level (lifted hold
  retires, engaged hold kept).

### N4: the DEFINITE set pinned in the test [exec]

`replica-placement-owner-clearing-triggers.test.js` carries
`PINNED_DEFINITE_ANSWERS`, 13 codes each with its reason, and asserts equality
with `PLACEMENT_DEFINITE_ANSWER_CODES`; the structural assertions stay.
Mutant `probe/w1b-mutant-definite-moved` (BACKPRESSURE moved into the DEFINITE
declaration and out of the waiting map: consistent with every structural
assertion): see the run table.

### Item 4: the real blocked-attempt red [exec]

Mutant `probe/w1b-mutant-blocked-invisible` on R2 (the registry never records
a blocked state and lists nothing; the attempt is kept silently; re-drive
itself untouched): see the run table. The witnesses that must kill it:
`replica-placement-owner-blocked-attempt` (ADMIT, `blockedPlacementAttempts()`)
and `blocked-release` #2 (reads `lastPassSnapshot.blockedAttempts`).

### Hand-off (a): snapshot catch-up / install owner (not implemented here)

1. Validate the outcome-table format on the STAGING database before the
   destructive swap: in `requestSnapshotInstall`
   (`src/raft/snapshot-install.js`, staging DB opened at ~:611, before
   `populateStagedInstallDb` and `commitPreparedInstall` ~:619), call the
   outcome owner's `detectCommittedStatementOutcomeFormat(stagingDb)`; on
   UNSUPPORTED, `rejectInstall(checkpointsRoot, marker, <new REJECTION code,
   e.g. OUTCOME_FORMAT_UNSUPPORTED>)`, leaving the replica store untouched.
   Alternative earlier site: `validateRaftRsPayloadTables`
   (`snapshot-checkpoint-store.js:481`), before any marker. Also trace whether
   the boot-time `resolvePendingSnapshotInstall` (`snapshot-install.js:693`) can
   complete a staged install that never passed the check. More than two lines:
   a new rejection code and a witness.
2. Carry `error.code` in `RECREATE_FAILED` (`src/raft/snapshot-catchup.js:384-388`,
   today `detail: error.message` only).
3. Format identity: today it is the normalized `CREATE_TABLE` text (F9), so ANY
   edit of that text is an unfenced format break. Proposal, owned by the
   outcome owner: a declared integer
   `PARTITION_COMMITTED_STATEMENT_FORMAT_REVISION` (current = 1) in
   `partition-committed-statement-outcome-constants.js`, written by
   `createCommittedStatementOutcomeTable` into a one-row owner table
   (`_partition_statement_outcome_format(revision INTEGER NOT NULL)`) in the
   same DDL, and decided by `detectCommittedStatementOutcomeFormat` (revision
   equal AND definition equal; the CREATE text stays the integrity check). A
   test pins `sha256(CREATE_TABLE)` to the revision, so editing the text without
   bumping the revision fails. Checked at: store open (init-base, through the
   one decider), the staging-DB check of item 1, and the cluster format fence
   (`support-envelope-owner.js:24` `CLUSTER_FORMAT_REVISION`), which a revision
   bump must raise so mixed builds refuse at join, not at snapshot install.
4. Exposure: cross-build only. Between nodes of one build it is theoretical:
   the producer opened its table through the same decider and text, nothing
   alters it after, and the image is a byte copy.

### Hand-off (b): merger

- `git merge-base ec1b2f77c 1ede7a19d` = `0993265e5` (retained-repair tip; the
  14 WIP commits arrive through it). This branch merges after the
  retained-repair branch.
- The placement-owner repair branch (`work/placement-owner-repair-20261121`,
  b92a5d6ce and later, tip seen 87a34cb4d) rewrites
  `src/rebalancer/replica-placement-owner.js` (pass object, tenure,
  `submitPlacementAttempt(attempt, submitFn, pass)`, `placementPassSnapshot` in
  `replica-placement-owner-pass-observation.js`). My owner hunks vs
  `0993265e5`, to re-apply by hand there:
  1. imports from `./replica-placement-owner-attempts.js`: add
     `createBlockedPlacementAttempts`, `observePlacementAttemptAnswer`,
     `reconcileReleaseAttempts`, `redrivenReleaseAttempt`.
  2. constructor: `this.blockedAttempts = createBlockedPlacementAttempts(this.logger);`
     next to `this.uncertainEntryIds`.
  3. new method `blockedPlacementAttempts()` returning
     `this.blockedAttempts.list()` (the diagnostic API).
  4. `submitPlacementAttempt`: after the committed-answer deletion, call
     `observePlacementAttemptAnswer(db, this.blockedAttempts, attempt, answer)`;
     on the repair branch place it AFTER the `isPassCurrent(pass)` early
     return (an obsolete continuation records nothing).
  5. `submitHoldRelease`: after the submit, `redrivenReleaseAttempt(db, this,
     attempt, answer, () => this.nextEntryId(ENTRY_KIND_RELEASE, operationId))`
     and submit the fresh attempt when non-null; on the repair branch pass
     `pass` through and re-drive only while `isPassCurrent(pass)` (after its
     `BEFORE_HOLD_RELEASE` checkpoint).
  6. `reconcileUnresolvedAttemptsOnLeadershipStart`: the third argument of
     `reconcilePlacementAttempts` is `this.blockedAttempts` (no longer the
     refreshed census).
  7. `runPass` (repair branch: `runPassSteps`, after the leadership-start
     reconcile at ~:688): `reconcileReleaseAttempts(db, this.uncertainEntryIds,
     this.blockedAttempts)` on every pass.
  8. both pass snapshots: `...this.blockedAttempts.snapshot()` (adds
     `blockedAttempts` and `supersededAttempts`). On the repair branch:
     `this.lastPassSnapshot = Object.freeze({...placementPassSnapshot(pass,
     PLACEMENT_CLEARING_TRIGGER), ...this.blockedAttempts.snapshot()})`, or add
     it inside `placementPassSnapshot`. Without it F6/N1 visibility is lost
     silently (the witnesses read `lastPassSnapshot.blockedAttempts`).
- Constants: the repair branch's `LEADER_UNKNOWN` row (`SERVICES_CHANGED` ->
  `PARTITIONS_CHANGED`) belongs in `PLACEMENT_WAITING_CLEARING_TRIGGER` with
  trigger `PARTITIONS_CHANGED` and must never join
  `PLACEMENT_DEFINITE_ANSWER_CODES` (the F11 literal pin would fail).
  `TERM_START_APPLIED` is a trigger, not a clearing row.

### Round-3 lab runs [exec, adams-gamla]

| Run dir | Sha | Files | Result |
| --- | --- | --- | --- |
| `w1b-r3-red-a1` | `ce2d8e18f` (R1) | blocked-release, F11 | blocked-release #1 green (idempotence), #2 red ("admitted []"), #3 red (attempt kept); F11 green (pin equals the declaration) |
| `w1b-r3-green-a1` | `ec1b2f77c85c39940aa856bba0ad2a7548a75b98` (R2, branch tip) | 12 files: blocked-release, F11, attempts-exact-settlement, blocked-attempt, owner core, copy-occupancy, apply, outcome format, boundary, growth-promote, found, retained-row-repair | 9/12 green: all round-3 witnesses (blocked-release 3/3, F11, attempts 3/3, blocked-attempt). Red, identical at base `0993265e5`: owner core #20; growth-promote #7 subtests 40/42; `placement-retained-row-repair` #15, #33-#36, #44 (same six subtests red in `w1b-base-attribution-step1-fails-r2-a1`) |
| `w1b-mutant-blocked-invisible-a1` | `8b1cd678654c937d1c4ccc46516ca62af6bad6f9` (mutant of R2, local ref `probe/w1b-mutant-blocked-invisible`) | blocked-attempt, blocked-release, attempts-exact-settlement | KILLED: 0/3 files. blocked-attempt #1 "the blocked attempt is a typed, named state"; blocked-release #2 at the snapshot read (the REDRIVEN entry is absent; its behaviour assertions, the release and the other partition's admission, pass); attempts #1/#2 at the blocked-work assertions. F4 residue #3 passes (not visibility-dependent) |
