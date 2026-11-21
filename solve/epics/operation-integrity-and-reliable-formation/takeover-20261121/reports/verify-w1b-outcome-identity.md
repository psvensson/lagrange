# Verification: W1b committed-outcome command identity (`work/placement-outcome-format-20261121` @ 054971a7d)

Verifier: independent subagent, read-only (git reads and retained lab outputs only; no test executed, nothing written in any worktree).
Subject: `git diff 0993265e5 054971a7d` (8 commits: 645c70cf1, 5cac30b6e, 38708b6fa, 6d3a0c4f6, b213e5e79, 080223004, 7652bb014, 054971a7d).
Labels: **VERIFIED** = read in source at the named ref or confirmed in a retained lab output; **INFERRED** = reasoned from reading, not executed.

## Verdict

**APPROVE-WITH-CONDITIONS** for a true merge into `work/core-integration-20261121` (23344cddc).

The core change is sound: the identity is derived from committed bytes, the apply verdict is deterministic, both mutants are real and killed, the lab evidence matches the author's table. The conditions concern what the merge carries besides the reviewed diff (F1), one unwitnessed behaviour change in another owner (F2), and one weakened test (F3).

Conditions:

1. **F1**: decide explicitly on the 14 WIP commits a true merge carries, and run the witnesses plus a cone on the merged result before landing. No run of the merged tree exists.
2. **F2**: obtain the retained-repair owner's ruling (or an executed witness) for the five new `null` trigger rows as consumed by `retainUncommittedRepairAnswer`, before merge.
3. **F3**: restore a pinned null-set assertion in F11 (updated list), instead of no assertion.
4. Record F4, F5, F6, F7 as owned follow-ups in the work record (none blocks the merge on its own).

## Findings

### F1. A true merge carries 14 unreviewed WIP commits and has never been run (VERIFIED)

- `git merge-base 054971a7d 23344cddc` = `812dd3a1b`. `rev-list --left-right --count` = 22 / 294. The 22 are the 8 subject commits plus 14 WIP commits `812dd3a1b..0993265e5` (8be166a84 .. 0993265e5, all 2026-11-21 10:50-11:05).
- Those 14 change 17 `src` files (+352/-289): `replica-operation-repository-retained-placement-repair.js` (191 lines), `replica-operation-retained-repair-ingress.js`, `-authority.js`, `-record.js`, `-read-retry.js` (new file), `replica-placement-owner-transport.js`, `rebalance-coordinator-operation-creation-support.js`, and `partition-placement-admission.js` (155 lines: the "old-format debt" WIP ad4ea3610/4833ab4dc that the subject then deletes). They are outside the reviewed diff and outside this verdict.
- The integration line holds partial parallel versions of the same work: `retained-placement-repair.js` 52 changed lines against 191, ingress 20 against 31, and `partition-placement-admission.js` still carries the pre-fingerprint heuristic (`matchesPreFingerprintAdmittedResult` / `isPreFingerprintCommandReplay`, 23344cddc:144-183) and the capability probe (23344cddc:298).
- Expected textual conflicts: `partition-placement-admission.js` (`proposePlacementCommand`; resolve to the subject side, the heuristic must not survive), `replica-operation-repository-retained-placement-repair.js`, `replica-operation-retained-repair-ingress.js`. `partition-committed-statement-outcome.js` should merge cleanly (integration only adds `entryId` to two failed-statement answers).
- Expected semantic conflicts (INFERRED, unrun):
  - fixtures added or changed on the integration line (16300e756, 7a3170ab2, d45486283, b29eed7fd) whose `workflowOwner.repository` double lacks `acceptRetainedPlacementRepairRequest` now throw a TypeError where they got `OWNER_UNAVAILABLE` (probe removed, `partition-placement-admission.js:133-147`);
  - any fixture whose ledger `db` has no `_partition_statement_outcomes` table now throws in `reconcilePlacementAttempts` (the table-presence probe is deleted, `replica-placement-owner-attempts.js:89-96`);
  - any test that hand-inserts an outcome row with `owner_result_text` and no digest now fails the CHECK;
  - the integration line's retained-repair changes consume the trigger table (F2).
- The exact tip 054971a7d was run for three files only; the contract commit 7652bb014 selects the whole corpus and was not run (author states both).

### F2. The new `null` trigger rows change retained-repair behaviour, unwitnessed (VERIFIED by reading)

- `replica-placement-owner-constants.js:181-185` adds `ORIGIN`, `BYTES`, `TARGET`, `REMOVE_INTENT_UNSCOPED`, `RESULT` -> `null`.
- Consumer: `replica-operation-repository-retained-placement-repair.js:242-249` (`retainUncommittedRepairAnswer`). Before: no row, early return, the attempt keeps its default `LEDGER_COMMIT` (`replica-operation-retained-repair-record.js:19`) and is re-driven on every ledger commit. After: `clearingTrigger = null`; `shouldWake` (`:41-44`) returns false for anything but `LEDGER_COMMIT`; the uncommitted path does not delete the attempt (only the committed path does, `:273-275`).
- Interleaving: node N holds retained repair A for operation O. It requests the ledger leader. The leader's ingress holds its own volatile attempt for O with a different operation snapshot and answers `BYTES` uncommitted (`replica-operation-retained-repair-ingress.js:61-63`, a comparison against volatile leader memory). A is now parked in `retainedPlacementRepairs` with no wake and no retirement.
- The author discloses this (record section 15) and defers it to the retained-repair writer. It is a behaviour change outside the stated scope with no executed witness, against "a repair only where an executed witness demonstrates the defect" and R13 (a retained obligation without a release condition). The integration line carries the same consumer, so the effect lands with the merge.

### F3. F11 was weakened: the pinned null-set assertion was deleted, not updated (VERIFIED)

- `test/rebalancer/replica-placement-owner-clearing-triggers.test.js`: the assertion that exactly five named reasons map to `null` is removed. The replacement checks that every code has a row, every row has a code, and a probe code is reported.
- Gain: `PLACEMENT_ADMISSION_ERROR` is now enumerated; stale rows are caught.
- Loss: which codes are "definite" (never re-driven) is no longer pinned. Mapping any retryable reason to `null` now passes F11. At the tip 13 codes are `null`. The list was already red at the base (three retained-repair rows), and the change makes it green by deletion. F2 shows why this classification needs a pin.

### F4. A second settlement decider still uses no owned identity (VERIFIED)

- `replica-placement-owner-attempts.js:98-103` `isSettledInCensus`: `row.admission?.entryId === attempt.entryId` (an entry id read from a mutable ledger row's step history, `partition-placement-admission-decision.js:242`), or for a release the hold no longer being `LEDGER_AWAITING_COPY_IDLE`. It is OR-ed with the exact check at `:108-109`.
- The author's consumer table (section 12, row 3) lists only `isSettledInStatementOutcomes`. The attempts witness passes an empty census ("No services (no census rows)"), so this path is not exercised against a near miss.
- Consequence: the completion criterion ("deciding that retained work is settled uses the same owned receipt identity") holds for one of two deciders. Interleaving: another admit with body B commits under entry X and writes a ledger row carrying X; the attempt for body A under X is discharged by the census although `readSettledOwnerCommandIn` answers OTHER_RECORD. Reachability is the same low class as the collisions the change defends against (entry ids carry a UUID).

### F5. Generic SQL replay still settles on any record (VERIFIED read; reachability INFERRED low)

- Request: `partition-service-write-metrics-base.js:660-672, 716-727`. Apply: `partition-service-entry-apply-base.js:724-729`.
- Interleaving: placement command E commits under entry id X on `replica_operations-p1`. An SQL write `{entryId: X, sql}` arrives on any replica. `answerSettledWrite` answers `success: true`, `changes = rows.length` of the placement, `OUTCOME_RETAINED`; the statement never runs. At apply a committed SQL entry under X is consumed as REPLAYED. On `sql_transactions` the same holds against a coordinator-settlement record, answered `OUTCOME_NOT_RETAINED`.
- Who chooses entry ids: the caller (`resolveEntryId`, `partition-write-kernel.js:243-245`; a random UUID only when absent). Placement ids are `placement-owner:<node>:<kind>:<target>:<uuid>`, settlement ids are a prefix plus sha256, so a collision needs a proposer defect or a forged forwarded write. The reverse direction (owner command under an SQL key) is now closed.
- Mirror cursor (`partition-mirror-replay-cursor.js:120-128`): not a defect. A record whose `log_index` equals the entry's index can only have been written by applying that entry. The author's proposed witness for it describes an impossible state.
- Unlisted reader: `partition-participant-transaction-constants.js:300-311` counts ordinary applied entries with a hand-built `entry:%` pattern and a `LIKE` on `owner_result_text`. Observation, not settlement; unaffected by the column.

### F6. The kept attempt is bounded but invisible (VERIFIED read)

- `replica-placement-owner.js:428-441`: `BYTES` is not `committed`, so the attempt stays. `proposeOrderedCandidate` (`:653-681`) returns null and the pass moves to the next candidate: other partitions are not blocked, and there is no spin beyond the pass cadence.
- It blocks that partition for as long as the planner yields the same intent key; a different intent overwrites `admit:<partitionId>` and retires it.
- Operator visibility: none found. The answer is dropped at `:677-678`; no log, no pass-snapshot field.
- Before the change any row falsely discharged the attempt and liveness self-healed. Now it fails closed and silently. Acceptable as a safety choice; "nothing retires it" is an unowned release condition under R13 and needs an owner decision and a typed, visible state.
- Side observation (pre-existing): `_placement_owner_unresolved_attempts` is not `_raft_`-prefixed, so `scrubRaftRsCheckpointPayload` keeps this leader-local table in partition images.

### F7. Store-open refusal, snapshots and mixed builds (VERIFIED read; mixed-build behaviour INFERRED)

- Same-build clusters: sound. An image is a scrubbed SQLite copy with its schema, CHECK included; a new-format image cannot carry a violating row; `partition-snapshot-compaction-catchup.test.js` (the real checkpoint and install path) is green at 080223004 in the cone (68 assertions). The boundary witness's stated gap (watermark gate, install marker) is therefore not material for the supported case.
- The format check runs after the destructive install: `snapshot-catchup.js` `orchestrateSnapshotCatchupInstall` installs, then `createPartitionService` fails with `RECREATE_FAILED` and only `detail: error.message` (the typed code is not carried). `validateRaftRsPayloadTables` does not check the outcome table. An image of another format leaves the replica's store replaced and unopenable: a down replica, not corruption.
- No fence separates the pre-change and post-change builds: both are cluster format revision 1. In a mixed cluster the halt is not uniform. For an SQL record with a NULL rowid under a placement key, a base-build replica consumes the committed placement entry as REPLAYED (base `recordedReplayRefusal`), while a tip-build replica throws `BYTES` and holds RECOVERY_REQUIRED. A base-build replica that installs a tip image fails every owner-row insert on the CHECK and halts. No state corruption found; liveness and replica availability are lost. This is acceptable only because both builds are unreleased; it is not stated in any contract or operator document.
- Documentation: no file under `docs/` or `architecture/` changes. `partition_statement_outcome_format_unsupported` appears nowhere outside `src` and tests; `src/partition/README.md` documents the legacy-consensus refusal but not this one. The constants comment cites `docs/operations-readiness.md`, which describes re-founding generically only.
- Released stores: VERIFIED. `v0.2.6`, `v0.3.3`, `v0.4.0` create nine columns, no `command_digest`; `v0.2.5` has no such table; `CLUSTER_FORMAT_REVISION` is absent at `v0.4.0` and present at the tip (`support-envelope-owner.js:24`). Released stores are now refused at partition open as well as by the revision fence. I confirmed the fence sites by grep, not by tracing every start path.

### F8. Identity soundness (VERIFIED read)

- Placement and formation: the digest input `"<type>:<bodyText>"` is identical to the former fingerprint input; only width (48 bits to 256) and the column changed. No new canonicality risk.
- Request and apply cannot differ: request digests the built command's `bodyText`; that string is the log entry; apply digests `command.bodyText` after `isPinned*Command` proved it equals `JSON.stringify(canonical(body))`. Coordinator: `isPinnedCoordinatorSettlementCommand` binds `settlementText`, `settlementDigest` and the content-addressed `entryId`.
- Locale: no `localeCompare` or locale formatting in any canonical path; key order is fixed lists, `positions` keys and formation id lists use default code-unit `.sort()`; values are text, safe integers, booleans, null. sv_SE cannot change the text.
- Defect (pre-existing, other writer): `PLACEMENT_REPAIR` is not key-order canonical. `canonicalRetainedPlacementRepair` (`partition-placement-retained-repair.js:37-53`) pins `copyOperationOutcomeData(operation)`, a `structuredClone` (`replica-operation-update-outcome.js:109-118`). The same operation built with another property order yields another `bodyText` and digest, so a legitimate re-request under the same entry answers `BYTES`. It fails closed.
- Formation bodies carry `declaredAt` / `formedAt` / `*ByNodeId`, so the record's statement that timestamps and proposer are excluded holds for the envelope only. Whether formation retries reuse an entry id with a rebuilt body was not verified.

### F9. Two format deciders for one table (VERIFIED)

- Store open decides by column-name set (`partition-committed-statement-outcome.js` `detectCommittedStatementOutcomeFormat`). The cold census decides by normalized CREATE SQL equality (`partition-retained-store-observation.js:52`). A table with the ten columns and no CHECK passes the first and fails the second.
- The claim "no row can violate the CHECK in a supported store" rests on the CHECK being present, which store open does not verify. Not reachable from any build (the column and the CHECK arrived together in 6d3a0c4f6), and the hot reader fails closed on an unpaired row.
- The decision also runs twice in sequence (`partition-service-raft-init-base.js:253-262`, then inside `createCommittedStatementOutcomeTable`).

### F10. "One prelude" covers two of three owner commands (VERIFIED)

- `partition-coordinator-settlement.js:58-83` keeps its own order (leadership, admission, exact settlement, pending join, observe) and joins a pending write without an identity check (`:74-75`).
- Leadership: the owner prelude refuses a settled replay on a non-leader; the generic SQL path answers it on any replica. The difference is stated only in the author's record (section 15), not in code comments or a contract.

### F11. Minor (VERIFIED)

- `ENTRY_KIND_ADMIT = 'admit'` is newly duplicated (`replica-placement-owner-attempts.js:15`, `replica-placement-owner.js:50`); the attempt's command type is derived by parsing the attempt key rather than stored with the attempt. A third kind added later would never be settled by outcomes (fails closed).

## Attack points with no defect found

- **Deterministic apply** (VERIFIED read): the verdict depends on the committed command bytes and the outcome row only. No clock, node id or leader-local map takes part. Throw -> slice rollback (`raft-rs-application-transaction-owner.js:131-140, 168-184`) -> `groupHostFailure(APPLICATION)` -> `RECOVERY_REQUIRED`, no role (`raft-rs-runtime-owner.js:199-216, 1145-1170`). The applied index is written inside the rolled-back transaction. A multi-entry slice rolls back whole, so replicas may stop one entry apart, never past the failing entry.
- **Formation prelude reorder** (VERIFIED read): the pause contract is "paused new mutation admission ... the write was not proposed" (`partition-write-kernel.js:45-48`). The release census counts proposals, pending outcomes, open transactions, staging and prepared rows (`partition-participant-transaction-pause.js:56-71`); a settled replay touches none. No effect leaks. One side effect moves: `pausedWriteAnswerOf` also invalidates a stale release admission, and a replay no longer triggers that; every mutation still does.
- **Deletions**: the NULL branch and the ADD COLUMN loop have no released exposure (F7).

## Tests: deleted or rewritten

| Test | Before | After | Judgement |
| --- | --- | --- | --- |
| F5b (`placement-admission-apply.test.js`) | pinned `OUTCOME_IDENTITY_UNAVAILABLE` for NULL-rowid rows, two replicas | deleted | Acceptable: the behaviour is deleted by ruling; W2 #3 replaces it. The two-replica convergence assertion is lost; F5 remains. |
| W5 (`settled-replay-preserves-result.test.js`) | reopened a pre-result table, expected ADD COLUMN migration and `OUTCOME_NOT_RETAINED` | typed store-open refusal, table unchanged | Acceptable: follows the deleted migration. The not-retained answer is still witnessed on a real partition by `test/query/settled-replay-sql-surface.test.js` W4/W5. |
| F11 null-set list | exact list of `null` reasons | enumeration of vocabularies | **Weakened** (F3). |
| `seed-retained-effects` ALTER-upgrade case for the outcome table | migration kept schema compatible | removed | Acceptable: no migration exists. |
| `seed-retained-effects` "foreign owner result" | `owner_result_text = '{}'` | plus `command_digest = 'foreign'` | Acceptable: required by the CHECK; same expected reason. |

The new witnesses use known-bad inputs (SQL applied row, statement-failure row, other body, other command type, prior-format table, result-only, digest-only and empty-digest records). They cannot pass with a no-op identity check: the identity mutant turns five files red.

## Lab outputs confirmed (VERIFIED from retained `selection.json`, `exit.json`, results)

| Run | Sha | Result |
| --- | --- | --- |
| `w1b-step2c-witnesses-r2-a1` | 080223004532... | 4/4 files, 10 tests, exit 0 |
| `w1b-w5-fix-a13` | 054971a7db5c... | 3/3 files, 12 tests, exit 0 |
| `w1b-mutant-ordering-r2-a12` | 6a23e4abd5d5... | 0/2 files; mutant diff is the pause moved before the settled replay |
| `w1b-mutant-identity-r2-a1` | daa0281a81c9... | 0/5 files; mutant diff makes any record SAME_COMMAND |
| step-2 cone chunk00 / chunk01 / chunk02 / remainder | 080223004532... | 562/11, 522/14 (log only, no ndjson), 548/49 of 597 selected, 35/1 |
| step-1 cone / remainder | 38708b6fa0ae... | 685/58 (log only, no ndjson), 72/4 of 76 selected |
| base attribution runs | 0993265e5360... | 57/57, 8/8, 4/4, 1/1, 1/1, 4/4 red |

- Chunk02 and the step-1 remainder hold 21 and 20 extra result lines (`test-output/tap-timeout-fixtures/*`, a runner self-test); the selected-file counts match the author's.
- Spot check per failing subtest, change against base, 14 files: `placement-retained-row-repair` (6), `placement-founding-and-runtime-service-admission` (1), `placement-create-bootstrap-binding` (3), `placement-creation-terminal-replay` (2), `replica-placement-owner-core` (1), `replica-image-checkpoint-transfer` (1), `dt-formation-declared-size-latch` (2), `snapshot-dispatcher-wiring` (2), `fresh-create-resumed-syncing-claim` (2), `replica-dispatch-reservation-identity` (1), `replace-real-group-native-ledger-recovery` (2), `replica-operation-repository` (2), `schema-provisioning-native-admission` (20), `committed-membership-census` (2). Identical failing subtest sets in every one (names differ only in the timing suffix).

## Author claims not confirmed

- "Every red is also red at the base": confirmed per file from the retained outputs and per subtest for 14 files, not per subtest for all.
- The coordinator and attempts defects were not shown red at the true base; the identity mutant stands in for the base behaviour.
- The cone at the exact tip, the contract commit's corpus selection, and the merged tree: never run.
- Fence coverage of every start path for a released store: confirmed by grep only.
- Whether any pre-change development data directory still exists: unverified (the author says the same).
- `transactionSettlementBytes` canonicality and formation entry-id reuse: not read.
- `placement-settled-replay-cutover-pause.test.js` (W1): not read line by line; its formation twin was, and W1 is green and mutant-killed in the lab.
