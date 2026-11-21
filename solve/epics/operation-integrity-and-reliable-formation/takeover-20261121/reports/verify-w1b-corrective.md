# Re-verification: W1b corrective round (`work/placement-outcome-format-20261121` @ aa0f6f1cc)

Verifier: independent subagent, read-only. Git reads (`show`, `diff`, `grep`, `merge-base`) and the retained lab outputs only. No test executed, no `merge-tree`, nothing written in any worktree.
Subject: `git diff 054971a7d aa0f6f1cc -- src test` (d9289d64d, 87a2e83b8, 1472e704d, aa0f6f1cc).
Labels: **VERIFIED** = read in source at the named ref, or present in a retained lab output. **INFERRED** = reasoned from reading, not executed.

## Verdict

**APPROVE-WITH-CONDITIONS** for merging aa0f6f1cc into the integration line after the retained-repair branch.

The four fixes do what they say. The deletion of the census settlement is sound for safety, the format decision is single, the lab evidence matches the record, and F8 is not a merge blocker on the retained-repair writer's current branch. No defect found that corrupts state. The conditions concern one mis-stated release condition with a cluster-wide effect (N1), a test that still pins nothing (N4), and a merge note that is stale for the stated merge order (N8).

Conditions:

1. **N1**: owner ruling on a blocked RELEASE attempt (its intent can never change, and it stops every placement pass), and a named operator action. Record both in the work record. Not a code change in this slice unless the owner rules for automatic replacement.
2. **N4**: either pin the DEFINITE list literally in F11, or record the lead's ruling that the `src` declaration is the pin. As written, round-1 condition 3 is not met.
3. **N8**: recompute the merge note against integration plus 1ede7a19d (merge base becomes 0993265e5), and run the tip's 17 files plus the retained-repair witnesses on the merged tree. No merged tree has been run.
4. **N6**: hand F7 to the snapshot owner as an owned item, with the forward constraint that any edit of the outcome table's `CREATE_TABLE` text is now a format break.
5. Record N2, N3, N5, N7 as owned follow-ups.

## Findings

### N1. A blocked RELEASE attempt has no release condition and halts all placement (VERIFIED read; reachability INFERRED corruption-only)

- `replica-placement-owner.js:452-459` `submitHoldRelease`: attempt key `release:<operationId>`, intent key = `operationId`. The intent of a release never changes, so "released when the intent changes" (`replica-placement-owner-attempts.js:14-18`, record section 19 F6) cannot happen for this kind. Only "an operator acts" remains.
- Effect on other work: `submitReleaseIfCopyIdle` gets `BYTES`, the ledger move keeps `LEDGER_AWAITING_COPY_IDLE`, `ledgerIncomplete` stays true, and `shouldStopPlacementPass` (`replica-placement-owner.js:218-222`) breaks at the first candidate. Every pass admits nothing, for every partition, until an operator intervenes.
- Interleaving: (1) leader admits ledger move O with the hold; (2) release attempt R under entry X is persisted; (3) any other record exists under `entry:X`; (4) each pass: prelude answers `BYTES`, the attempt is kept, the hold stays, the pass stops.
- A blocked ADMIT attempt is narrower: `proposeOrderedCandidate` returns null and the loop continues, so only that partition's current intent is blocked.
- Reachability: entry ids are `placement-owner:<node>:<kind>:<target>:<uuid>`, repair ids `retained-repair:<op>:<uuid>`. A record of anything else under such a key needs corruption, a forged forwarded write, or an SQL write with a caller-chosen entry id. I found no legitimate second producer. `settleReservedCommittedStatement` writes no outcome row, and a placement apply failure rolls back, so neither creates a foreign record under a placement key. Not enumerated: every SQL writer on `replica_operations-p1`.
- No operator action is defined anywhere: nothing under `docs/` names the state or the remedy.
- A safe automatic release exists (INFERRED): outcome rows are never deleted, so `OTHER_RECORD` is permanent and the command under X can never take effect (request answers `BYTES`, apply throws). Replacing the attempt with a fresh entry id, keeping the typed collision state visible, cannot double-apply. The lead ruled "nothing retires it"; that ruling should be restated knowing the release-kind consequence.
- Before this branch (0993265e5) the existence check falsely discharged the attempt at the next leadership start and the owner self-healed. The corrective round makes the stuck state visible; it does not bound it.

### N2. F4: deletion is sound for safety; one kind of attempt is now kept for ever, invisibly (VERIFIED read)

- Deletion argument holds. `applyPlacementCommand` (`partition-placement-admission.js:246-262`) writes the ledger rows (`decide`) and the outcome row in one application transaction. No statement deletes from `_partition_statement_outcomes` anywhere in `src` (grep). The image scrub drops only `_raft_*` tables for a partition (`snapshot-application-content.js` `scrubRaftRsCheckpointPayload`), so both tables travel together. A prior-format store is refused at open.
- No existence-only settlement remains: `isSettledInCensus` and `isSettledInStatementOutcomes` are gone, and no `SELECT 1 ... WHERE entry_key` exists at the tip. `reconcilePlacementAttempts` (`replica-placement-owner-attempts.js:180-192`) decides only through `readSettledOwnerCommandIn`.
- States where a ledger row exists without the attempt's outcome row:
  - Another record class under the key: `OTHER_RECORD`, kept and listed blocked (N1).
  - A release attempt that never committed, whose hold was released by another leader's release under a different entry id: `UNSETTLED`, kept. Nothing calls `submitHoldRelease` for that operation again, so the attempt is never re-driven, never settled, not in `blockedAttempts`, and its durable row stays. The deleted census rule discharged exactly this case. Interleaving: leader a proposes release under X1, outcome unknown, entry lost; leader b releases under X2; a regains leadership and hydrates `release:O` (X1). No safety effect; one leaked row per event, also carried into partition images (the attempts table is not `_raft_`-prefixed). The witness `attempts-exact-settlement` #2 asserts this "kept" as intended.
  - Future outcome-table compaction (the constants comment assigns it to the snapshot/log-bound quest): a compacted record reads `UNSETTLED` and the attempt would be re-proposed. That quest must retire attempts before compacting their outcomes (INFERRED).
- A blocked state whose intent disappears (the planner stops yielding that partition) stays listed until an answer arrives for that attempt key: a stale diagnostic, not a blocked effect.

### N3. `BYTES` without a colliding record is kept and not visible (VERIFIED read; reachability INFERRED low)

- `observePlacementAttemptAnswer` (`replica-placement-owner-attempts.js:155-170`) lists an attempt only when the store holds another record. `BYTES` is also answered for a body that builds no command (`requestPlacementCommand`) and for a pending write of another digest under the entry (`ownerCommandPrelude`). In both, the attempt is kept, re-requested each pass, and absent from `blockedAttempts`.
- The pending-digest case is transient, yet `BYTES` is declared DEFINITE. With the retained-repair branch merged, a `BYTES` there retires the record (N5), which is the safe direction.
- New call site: `attemptSettlementOf` now runs on every `BYTES` answer, not only at leadership start. A fixture whose ledger `db` lacks the outcome table and whose `admitPlacement` double answers `BYTES` now throws inside the pass.

### N4. F3: the test still proves only self-consistency (VERIFIED)

- `test/rebalancer/replica-placement-owner-clearing-triggers.test.js:95-130` asserts: every vocabulary code has a row; null rows equal `PLACEMENT_DEFINITE_ANSWER_CODES`; no code in both maps; every waiting code names a declared trigger. All four compare the table with the two declarations it is built from.
- A code wrongly moved into the DEFINITE list passes every assertion. The killed mutant (`BACKPRESSURE` mapped to null inside the waiting map) is caught only because it bypasses the list. Moving `BACKPRESSURE` into the list would survive.
- What would kill a wrong declaration: a literal pinned list in the test, or one behavioural witness per DEFINITE code (the same request repeated after each trigger still answers that code). Only `CUTOVER_PAUSED` has a behavioural witness today.
- Gain that is real: the classification is one named list with reasons, so a change is a visible diff.
- Composition with b92a5d6ce: its edit is one line plus a comment on the `LEADER_UNKNOWN` row (`SERVICES_CHANGED` to `PARTITIONS_CHANGED`). The subject does not touch that line, so it merges without a conflict and lands inside `PLACEMENT_WAITING_CLEARING_TRIGGER`. `LEADER_UNKNOWN` must not be added to the DEFINITE list. Result: `PLACEMENT_CLEARING_TRIGGER[LEADER_UNKNOWN] === PARTITIONS_CHANGED`; F11 stays green (`PARTITIONS_CHANGED` is declared and has a source). b92a5d6ce's new `TERM_START_APPLIED` trigger is unused as a clearing trigger and F11 checks only used ones.

### N5. F8 is not a merge blocker on 1ede7a19d (VERIFIED read at 1ede7a19d)

- No path rebuilds the body under a kept entry id. The entry id and body are one frozen pair: `pinnedEntry(entryId, body)` (`replica-operation-retained-repair-record.js`). `prepareRetainedRepairAttempt` returns early while PINNED; `pinPreparedRetainedRepair` always mints a new uuid; `settledEntry` drops the entry id, so a settled entry is never presented again.
- Restart: records are volatile, a new record mints a new id. Custody transfer and handoff: `joinRetainedRepairDecision` and `retryRetainedRepairDecision` present the same pinned object to the new binding. Receiver: the ingress stores the incoming `(payload.entryId, payload.body)` pair and re-presents that pair.
- The sender now enforces order itself: `validatePreparedRepair` (`replica-placement-owner-retained-repair-routing.js:36-48`) requires `JSON.stringify(canonical.statement.operation) === JSON.stringify(operation)`.
- Composition: at 1ede7a19d `retainUncommittedRepairAnswer` retires the record on a null row ("definitely refused", logged at error) and the next arrival starts a fresh entry. `BYTES` has no row at 1ede7a19d (falls to re-present for ever); the subject's row makes it retire. The two branches need each other here, and the combination is unexecuted.
- Not verified: that the transport codec preserves key order and `undefined`-valued properties between a local and a later remote presentation of one pinned entry.

### N6. F9 and F7: one decider; the destructive-install hazard is cross-build only (VERIFIED read)

- One decider: `detectCommittedStatementOutcomeFormat` uses `readRetainedStoreRowsIn` with the owner's `CREATE_TABLE`, the rule the cold census uses. Store open calls only `createCommittedStatementOutcomeTable` (`partition-service-raft-init-base.js:254-260`) and closes the handle on any throw. No second decider or heuristic found; the column list serves the refusal text only.
- Minor: `retainedStoreTableExistsIn` is called outside the `try` in `outcomeTableFormatIn`, so a view or index of that name escapes as `partition_retained_store_schema_contrary`, not the owner's code. The column `PRAGMA` runs outside the read transaction.
- The author's F7 trace is correct: `requestSnapshotInstall` (`snapshot-install.js:580-626`) swaps the store before any format check, `validateRaftRsPayloadTables` ignores the outcome table, and `orchestrateSnapshotCatchupInstall` (`snapshot-catchup.js:379-389`) keeps only `error.message`.
- Severity: a follower can replace its store with an image it then refuses to open. The replica is down; the data survives on the image and the other replicas. Several followers catching up at once could lose quorum.
- Reachability: not between nodes of one build. The producer opened its own table through the same function and the same text, nothing alters the table afterwards, and the image is a byte copy (`VACUUM` keeps the schema text). `partition-snapshot-compaction-catchup` is green under the new decider at 87a2e83b8 and at the tip (68 assertions). Across builds it is real, and F9 widens it: format identity is now the normalized `CREATE_TABLE` text, so any future edit of that text is a format break with no cluster-format fence.
- The proposed change is right: check the staging database before `populateStagedInstallDb`, reject, and carry `error.code`. It is more than two lines (a new rejection code and a witness). `validateRaftRsPayloadTables` is an alternative site that rejects before any marker is written. Not covered by it: an old-build receiver, and whether the boot-time `resolvePendingSnapshotInstall` can complete a staged install that never passed the check (not traced).
- Node-level effect of a refusal at open: not traced. No consumer handles this code or the sibling legacy-consensus code; both leave `initialize` as a thrown error. No document names the refusal.

### N7. F5 and F10 are safe to leave for this merge (VERIFIED read, unchanged from round 1)

- F5 (generic SQL replay settles on any record) is pre-existing, needs a forged or caller-chosen entry id, and is the only producer path for the N1 collision. Owned follow-up.
- F10: the coordinator settlement's entry id is content-addressed, so its pending join by id is a join of the same content.

### N8. Merge note: "resolve to ours" drops nothing, but the note is stale for the stated order (VERIFIED read)

- Integration's only change to `partition-placement-admission.js` since 812dd3a1b is the cutover pause moved after the settled replay (`git diff 812dd3a1b 23344cddc`). `ownerCommandPrelude` has that order (leadership, admission, settled or collision, pause, pending join), and `recordedRequestAnswer` keeps `observedLedgerAppliedIndex` for FOUND. Taking ours replaces no newer fix.
- One ordering difference inside ours: integration sets the pending fingerprint before `startPartitionRaftWriteCommit`; ours sets the digest after that call returns (argument evaluation in `trackPendingOwnerCommand`). No re-entrant path found; not executed.
- `merge-base aa0f6f1cc 1ede7a19d` = 0993265e5. After the retained-repair branch merges, the 14 WIP commits of round-1 F1 arrive through it, and of the subject's files 1ede7a19d changed only `replica-placement-owner.js` since that base (`setLeader` and collaborator validation; the subject's five hunks are elsewhere).
- If b92a5d6ce also lands: it rewrites `replica-placement-owner.js` (595 lines; `submitPlacementAttempt(attempt, submitFn, pass)`, snapshot built by `placementPassSnapshot`). The subject's owner hunks must be re-applied by hand, and `blockedAttempts` must be added to that snapshot builder or F6's visibility is lost silently. The record does not mention this.

### N9. Lab evidence (VERIFIED from `selection.json`, logs, `.err`)

| Run | Sha | Confirmed |
| --- | --- | --- |
| `w1b-corr-red-a1` | d9289d64dcca... | 0/3. Attempts #2 red ("a census row is never the exact record"), format #4 red (store opened without the CHECK). Blocked-attempt: 0 assertions, `SyntaxError` on a missing export |
| `w1b-corr-green-a1` | 87a2e83b863a... | 13/14. Red: `replica-placement-owner-core` #20 |
| `w1b-mutant-definite-a1` | b6a89872e1be... | F11 #1 red, "the null rows are exactly the declared DEFINITE codes" |
| `w1b-f7-red-a1` | 1472e704d1bb... | format #3 red (message lacks the code) |
| `w1b-corr-tip-a1` | aa0f6f1cc444... | 15/17, 324 + 173 = 497 assertions. Red: core #20; growth-promote #7 subtests 40 and 42 |
| `w1b-base-attribution-step1-fails-r2-a1` | 0993265e5360... | same two files red |

- Both tip reds are identical at the base: core #20 with "ReplicaOperationRepository requires a control-plane mutation ingress"; growth-promote #7 subtest 40 (line 904, expected `waiting`, actual `refused`) and 42 (line 906, expected `reinserted`, actual `refused`).
- The blocked-attempt "red" is an import failure. It shows the capability was absent, not that the assertions fail without the fix.

## Author claims not confirmed

- "Visible in both pass-snapshot shapes": true in source (`replica-placement-owner.js:734, 762`); no test reads `lastPassSnapshot.blockedAttempts`. The witness reads `blockedPlacementAttempts()` only, for an admit, never a release.
- Release of a blocked state when the intent changes, and the leadership-start listing: read, not witnessed in the outputs I opened.
- "Only `partition-placement-admission.js` conflicts textually": not re-executed (no `merge-tree` run); consistent with the diffs read.
- Transport key-order fidelity for F8; the node-level effect of the open refusal; the reparked-write and pending-digest interplay: not traced.
- The change cone for C2-C4, the pair commit's corpus selection, and any merged tree: never run (the author says the same).
