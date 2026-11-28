# Design note: remove the ACTIVE participant row from the transaction path

Quest `transaction-redundant-progress-writes`, stage 0b (no `src` change). Template:
`docs/development/verification-templates/design-note-template.md`. Code at
`ab347e962`; **[V]** verified (read, or measured with the path named), **[I]**
inferred. Measurements: `/mnt/data/peter/projects/lagrange-oltp-perf-20261128/lab/td-stage0b/`
(this stage) and `lab/td-stage0/`, `lab/td-design-review/` (earlier).

Scope: the independent design review (`reports/td-design-review.md`) approved both
removals with conditions; the lead ruled that only removal (a) proceeds. The
`status = PREPARED` write stays; its analysis, change B1, the reviewer's S1-S4 and
conditions C2-C4 are in `deferred-prepared-status-removal.md`.

## Verdict

**Safe**, under three conditions this note makes concrete:

- **C1:** the participant's in-memory ACTIVE transition stays. It is the begin gate:
  a participant already begun is never begun again. It is safety-critical, not
  redundant (participant-leader change, below), and it is witnessed and probed in
  forms a defective implementation cannot satisfy (measured).
- **C6:** everything the removal leaves without a caller is deleted in the same
  change (section C6, with the paths).
- **C5:** every assertion of another record the change contradicts is superseded
  explicitly (`seals-and-contracts.md` section 5), and the transaction cone shows no
  other change of result (section "C5 confirmation").

## Claim, scope and current evidence

- **Invariant.** Every admitted participant of a write transaction reaches the one
  recorded decision with exactly the writes its statements staged. A crash at any
  point ends in one outcome with no orphaned participant session
  (`architecture/postgres-wire.md:315-347`).
- **Claim.** The ACTIVE row carries no information a reader needs: the manifest names
  the admitted participant before any participant request, recovery restores
  participants from the manifest and reads an ACTIVE row exactly as a missing one,
  and nothing else reads it (`reader-census.md`). Removing it takes P proposals and P
  CDC obligations off every write transaction and, where the participant leader is
  nearer than a consensus round, P sequential rounds off its critical path:
  new_order 19 -> 14 rounds and 36 -> 31 proposals, payment 17 -> 13 and 30 -> 26 (the
  lead's ruling; R1 sections 1.4, 2).
- **Entry path.** PG-wire statements -> `SQLQueryEngine` -> `executeWriteStatement` ->
  `enlistParticipantsOwned` (R1 1.4).
- **Separate claims.** Bounded repair only. The physical latency claim is the
  successor epic's certification (ruling 26). Release acceptance is not claimed.
- **Observed [V].** The witnesses' world reproduces the pinned counts of the
  unchanged tree. Under the retained simulation of the change
  (`simulate-removal-a.mjs`) the red witnesses pass, the recovery net passes, and the
  guard measures 0. Under the reviewer's defective variant (the in-memory transition
  dropped), the guard measures 2 and three witnesses fail.

## Transition record (solver-quests.md, contract-first checklist)

1. **Producer and consumer symbols.** Producer:
   `enlistParticipantsOwned` (`src/query/distributed/distributed-transaction-participant-set.js:264-318`)
   -> `persistActiveParticipants` (`:299-305`) -> `DurableWorkflowCoordinator.upsertParticipant`
   (`src/workflow/durable-workflow-coordinator.js:254-288`, the in-memory registry
   update then `persistParticipant`) -> the coordinator's `persistParticipant` wrapper
   (`distributed-transaction-coordinator.js:191-210`) ->
   `SQLQueryEngine.persistDistributedTransactionParticipantRow`
   (`sql-query-engine-transaction-persistence-methods.js:580-613`). The write overlaps
   the statement in `executeWriteStatement` (`distributed-transaction-statement.js:174-204`,
   `deferActivePersistence`). All callers of `enlistParticipantsOwned`, each reaching the
   same producer:
   - `executeWriteStatement` (deferred persistence);
   - `executeReadStatement`'s `enlist` (`distributed-transaction-statement.js:242-248`),
     with VOLATILE_READ for plain reads and AUTHORITATIVE for a locking read
     (`sql-query-engine-select-execution.js:72-87`);
   - the global-index write path `enlistAndStageIndexOperationsViaTx`
     (`sql-query-engine-global-index-tx1.js:443-450`, AUTHORITATIVE, inline persistence);
   - `bindTransactionToPartition` -> `enlistParticipants`
     (`sql-query-engine.js:379-385`, `distributed-transaction-coordinator.js:433-443`,
     AUTHORITATIVE, inline persistence).

   Consumers: none read the row to decide anything (`reader-census.md`, 26 readers; the
   review's added readers are classified there).
2. **Owner-defined shape.** No shape changes: the participant row schema, its status
   vocabulary and the in-memory participant record stay. Only the ACTIVE instances of
   the row disappear.
3. **Identity and generation.** Unchanged: participant id `transactionId:partitionId`,
   manifest text (the CAS generation of the admitted set), transaction epoch, the
   statement identity each request carries. The manifest append still precedes every
   participant request (witness `kept: each participant is appended ...`).
4. **Ordering.** Today: manifest append -> BEGIN -> (ACTIVE row || QUERY) -> later
   statements -> freeze -> PREPARE -> PREPARED rows -> ... After: the ACTIVE row
   leaves; nothing is reordered. The only ordering the row took part in was "the
   statement answer waits for it", which goes. No fence, CAS guard or ordering barrier
   relied on it (review item 4); participant-row coalescing is per participant key, so
   the PREPARED row becomes the first write under its key.
5. **Absent versus unavailable.** A missing participant row is a typed "member without
   evidence" (`distributed-transaction-recovery-authority.js:99-110`); an unreadable
   participant page is UNAVAILABLE and holds the obligation
   (`sql-query-engine-transaction-set-methods.js:51-53`). No inference from absence is
   added. The begin gate never read the durable row: it reads the in-memory record
   (`participant-set.js:286-288`).
6. **Durable commit.** Unchanged: the decision write, guarded on FROZEN, exact manifest
   text and `decision IS NULL`.
7. **Retained obligations.** The volatile participant session is owned by the participant
   leader and ended by a bound decision or the hold sweep. Recovery sends the bound
   decision to every **manifest** member, a never-begun one included (it becomes a
   tombstone, `partition-participant-transaction-request.js:502-514`). P CDC
   obligations fewer per transaction are created; none that is still created is
   dropped.
8. **Canonical wake and cleanup.** Unchanged: client COMMIT/ROLLBACK, startup replay
   and the periodic sweep. The statement-time contact with
   `sql_transaction_participants-p1` (and its backpressure) moves to COMMIT (review
   item 4) [I].
9. **The one answer that changes (accepted, lead ruling 1, 2026-11-28).** A transaction
   that recovery restored from rows and holds before its first successful authoritative
   refresh reports a participant list: `getRecoveryObligation(id).participants` and
   `.participantDetails`, and `participants` in the in-doubt answer to a client COMMIT
   or ROLLBACK naming it. That list was, and is, built from participant rows, not from
   the manifest. Before, it also named every participant that had only an ACTIVE row.
   Now it names only participants with a row written from PREPARE on (PREPARED,
   FAILED, COMMITTED or ROLLED_BACK), so a participant that was never asked to
   prepare is not listed. No `src` code and no consumer outside tests reads it:
   PG-wire and the application-database facade read other fields of the answer
   (`reader-census.md`, "Held state"). Recovery's decisions are unaffected. Recovery
   acts only after the authoritative refresh, which rebuilds the participants from
   the manifest, where an ACTIVE row and a missing row both read as a member without
   evidence (`distributed-transaction-recovery-authority.js:90-122,184-198`). After the
   refresh both trees list the manifest's participants and resolve identically.
   Witnessed in `test/query/transaction-redundant-progress-writes.test.js` ("held
   obligation") and `seals-and-contracts.md` section 7 (S14).

## Contract and failure analysis

1. **Consumed surfaces.** As in item 1; nothing new.
2. **Typed failure edges removed.** A rejected or lost ACTIVE upsert fails the statement
   today (`distributed-transaction-statement.js:199-201`). A delayed or late-rejected
   one was the "Finding 1B" hazard (`transaction-participant-set-authority.test.js:709-881`,
   `scenario-a-transaction-coordination-fast-path.test.js:1441-1484`). After the
   change a `sql_transaction_participants-p1` fault cannot fail a statement before
   PREPARE. `physical-scenario-a-review-repair/log.ndjson` entry 48 records
   enrollment writes to that group with 12 of 31 deliveries lost on the lab, which is
   that edge in practice (review item 8). No edge is added.
3. **Cached views.** The in-memory participant registry is the live authority for
   "already begun" (gate); the system cache only drives discovery; the authoritative
   read replaces the restored participant map before any decision
   (`recovery-authority.js:184-198`).
4. **Identity and representation.** No adapter or encoding change.

## Crash tables (removal (a) only)

"Rec." is recovery. Discovery acts on an undecided row after its persisted deadline
and at once on a decided one (`distributed-transaction-recovery.js:86-98`). T = the
`sql_transactions` row, PR = participant rows.

### Coordinator crash

| Point | Durable evidence today / after | Rec. today / after |
| --- | --- | --- |
| BEGIN row inserted, nothing else | T ACTIVE/OPEN `[]`, no PR / same | Past the deadline: freeze, ROLLBACK, no fan-out / same [V code] |
| Manifest append landed, BEGIN not delivered | T OPEN naming P, no PR / same | Past the deadline: one bound ROLLBACK to the member, its tombstone. **Witnessed** (`restart after the manifest append and before the participant BEGIN is delivered`, the review's missing witness) / same [V] |
| BEGIN done, QUERY staged; ACTIVE row in flight or landed (today) / absent | PR ACTIVE (read as FAILED) or none / none | Bound ROLLBACK to every manifest member, both trees. **Witnessed** with rows as written and with no row (2 cases) [V] |
| Freeze landed, no PREPARE | PR ACTIVE / none | Past the deadline: not prepared, ROLLBACK [V code] |
| PREPARE evidence for k of P | PR PREPARED for k, ACTIVE for the rest / PREPARED for k only | ROLLBACK past the deadline, both. **Witnessed** (partial evidence) [V] |
| All PREPARED rows, then the decision, fan-out, settlement | not affected by (a) | **Witnessed** (before / after the decision) [V] |
| ROLLBACK path | the ROLLED_BACK row is written for every manifest member either way (`distributed-transaction-decision-protocol.js:576-587`) | unchanged [V] |

### Participant-leader change (the hazard the gate covers)

A participant's staged writes live only in the leader's volatile session
(`partition-participant-transaction-staging.js:1-22`); a leader change loses the
session. What the coordinator does next is decided by the **in-memory** gate, not by the
durable row:

- **Today and after (gate kept):** the registry says ACTIVE, so the next statement sends
  its QUERY without BEGIN; the new leader refuses it (`participant_transaction_not_active`);
  the statement fails, PREPARE is refused, and the transaction rolls back with nothing
  applied. **Witnessed with a real participant**
  (`kept: a participant that lost its session is not begun again ...`;
  `runParticipantSessionLossScenario`, a production `PartitionService` of the TX1
  participant fixture, sessions discarded with `discardParticipantSessions`) [V].
- **If the gate were lost:** a second BEGIN with no durable row and no session opens a
  fresh empty session (`partition-participant-transaction-request.js:266-297`); the
  following writes stage on it and a COMMIT would commit only the writes after the
  loss: silent loss of earlier writes. **Measured** under the reviewer's defective
  variant: 3 BEGINs, and the write after the loss is accepted
  (`lab/td-stage0b/transaction-redundant-progress-writes-reviewer-bad.tap`) [V].
- The durable ACTIVE row never protected against this: nothing reads it before a BEGIN
  [V]. After a coordinator restart the transaction is a recovery obligation and
  accepts no client statement (`recoveryObligationStageRefusal`,
  `distributed-transaction-recovery.js:174-179`), so the gate has no cross-restart role.

### Coordinator-table leader change (`sql_transaction_participants-p1`, `sql_transactions-p1`)

- Before PREPARE: today a lost or refused ACTIVE write fails the statement; after the
  change the group is not written before PREPARE, so this edge goes [V].
- At and after PREPARE: unchanged; the PREPARED, COMMITTED and ROLLED_BACK rows and
  every `sql_transactions` write keep their current edges [V].

## Contention and CDC

The row-key hold of a transaction runs from its first staged write to its COMMIT apply
(R1 section 4); removal (a) takes up to P rounds out of it, shortening other
transactions' waits; the wait policy is unchanged (ruling 25) [I]. Every committed write
on `sql_transaction_participants` records a CDC obligation
(`cdc-table-policy.js:195-205,548-551`); P fewer are created per write transaction
(new_order 5, payment 4) [V policy, I load effect].

## C1: the begin gate, witnessed and probed

| Scenario | Witness and guard property | Today | (a) simulated | Gate dropped (defective) |
| --- | --- | --- | --- | --- |
| three INSERTs into one table | `one-begin-per-participant` (repeatedWrites) | 1 BEGIN | 1 | **3** |
| SELECT then two INSERTs (VOLATILE_READ promoted) | same (readThenWrite) | 1 | 1 | 1 (the promotion sets ACTIVE itself, `participant-set.js:137-140`: this scenario guards the promotion, not this defect) |
| AUTHORITATIVE enlistment then two INSERTs (locking read, global index, `bindTransactionToPartition`) | same (authoritativeEnlistThenWrite) | 1 | 1 | **3** |
| real participant loses its session after two writes | `lost-session-not-reopened-by-begin` | 1 BEGIN, write refused, ROLLBACK, 0 rows | same | **3 BEGINs, write accepted** |

Measured: `lab/td-stage0b/guard-{ab347e962,simulated-a,reviewer-bad}.json`, the
`.tap` files of the same directory, and the guard test's negative control (a candidate
that drops the gate is refused by both properties). **Witnessed only through the
success-only participant double** (`test/test-helpers/participant-protocol-double.js`
answers every request with success): the BEGIN counts of the three double-world
scenarios, every crash and recovery case, and the coordinator-table write sequences.
Only the session-loss case uses a real participant, and it covers the statement path up
to ROLLBACK, not a PREPARE or COMMIT on a real participant.

## C6: what the removal leaves without a caller, and its fate

| Item | Today's callers | Fate | Path (owner) | What breaks |
| --- | --- | --- | --- | --- |
| `persistActiveParticipants` closure and the `deferActivePersistence` option | `executeWriteStatement` | **delete**; the in-memory ACTIVE transition moves into `enlistParticipantsOwned` (set on the registry record after its BEGIN succeeds, as the promotion does at `:139`) | `src/query/distributed/distributed-transaction-participant-set.js` (this quest) | nothing in `src`; tests that wait on the ACTIVE write (supersession list) |
| the ACTIVE overlap in `executeWriteStatement` (`persistActivePromise`, the three-way `allSettled`, the `activePersistSettled` rejection) | itself | **delete**; the write-operation drain stays concurrent with the write | `src/query/distributed/distributed-transaction-statement.js` (this quest) | `transaction-participant-set-authority.test.js:622-707` |
| ACTIVE branch of `resolveParticipantRowPersistPurpose` (`sql-query-engine-transaction-persistence-methods.js:185-187`) | the ACTIVE row only | **delete** | `src/query/sql-query-engine-transaction-persistence-methods.js` (this quest) | nothing |
| `DurableWorkflowCoordinator.upsertParticipant` (`durable-workflow-coordinator.js:248-288`) | one `src` caller, `participant-set.js:301`; tests and a guard that seed generic workflows with it: `scripts/checks/scenario-a-transaction-coordination-fast-path-guard.js:396`, `scenario-a-transaction-coordination-fast-path.test.js:215-216`, `transaction-participant-set-authority.test.js:836` | **delete** (nothing unfed survives); the generic-workflow tests seed participants through `registerWorkflow({participants: Map})`, which `createWorkflowRecord` already accepts (`:565-567`) | `src/workflow/durable-workflow-coordinator.js` (**another owner's path**: needs the assignment) | the fast-path guard's `checkPriority2ConcurrentParticipantPhases` and the fast-path test's generic stage test (supersession, re-seeded), the Finding 1B witness part 2 |
| `enlistedParticipantCount` (incremented only in `upsertParticipant`; read by the empty-registry branch of `executeParticipantStage`, `durable-workflow-coordinator.js:362-377`, and persisted by schema provisioning, `src/query/schema-provisioning-job-repository.js:84,131`) | **already never incremented in production**: transaction participants always exist as placeholders before the upsert (`participant-set.js:214-221`), so `!existing` is false; no other workflow calls `upsertParticipant` [V] | **delete** the counter, its dead empty-registry branch (the missing-key branch `:379-390` and the coordinator's manifest-vs-registry check `participant-set.js:239-244` remain the real lost-enlistment guards) and the schema-provisioning field (old `workflow_record` JSON keeps an ignored key) | `src/workflow/durable-workflow-coordinator.js`; `src/query/schema-provisioning-job-repository.js` (**schema-provisioning owner**); `test/query/schema-provisioning-job-owner.test.js:625` | the schema-provisioning test's key list |
| the managed coordinator's refusal `upsertParticipant()` (`src/partition/managed-workflow-record-coordinator.js:539-542`), `REFUSED_ENTRY.UPSERT_PARTICIPANT` (`:61`) and its mention in the header (`:14`) | refuses a base method that would no longer exist; no test calls it [V] | **delete** | `src/partition/managed-workflow-record-coordinator.js` (**managed-workflow owner**) | nothing |
| telemetry fallback `participantAdmission` for participant-row calls while the transaction is ACTIVE (`distributed-transaction-telemetry.js:142-149`) | only the ACTIVE row reaches it [I] | **re-check after L3**: the telemetry export quest rewrites this file; delete the fallback there if it is still unreachable | `src/query/distributed/distributed-transaction-telemetry.js` (telemetry export quest's file) | telemetry purpose counts (supersession list) |
| stays fed: `TRANSIENT_PARTICIPANT_STATUSES` elision, `noteElidedMetadataMutation`, `executeParticipantOperationWithRetry(..., ACTIVE, ...)` (the BEGIN retry stage label), `persistParticipant` | PREPARING/COMMITTING/ROLLING_BACK stage writes; BEGIN retries; every stage write | keep | | |

**Pre-existing dead code found on the same surface (not created by this removal; R17
finding, or deletion if the lead widens the assignment):**
`DistributedTransactionCoordinator.persistParticipants` / `persistParticipantRecord`
(`distributed-transaction-coordinator.js:720-726`) and their record helpers
(`distributed-transaction-records.js:55-90`) have had no caller since `1b052783c`
(fast-path quest). `DurableWorkflowCoordinator.persistParticipants` (`:312-316`) is
called only by `test/workflow/durable-workflow-coordinator.test.js:76`, and
`persistParticipantState` (`:296-304`) only by those dead paths. The managed
coordinator's refusals of both (`managed-workflow-record-coordinator.js:527-536`) would
follow.

## Complete path list for the implementation assignment

Source (this quest's owner):
- `src/query/distributed/distributed-transaction-participant-set.js`
- `src/query/distributed/distributed-transaction-statement.js`
- `src/query/sql-query-engine-transaction-persistence-methods.js`

Source (other owners' paths, needed for C6):
- `src/workflow/durable-workflow-coordinator.js` (workflow owner)
- `src/partition/managed-workflow-record-coordinator.js` (managed-workflow owner)
- `src/query/schema-provisioning-job-repository.js` (schema-provisioning owner)
- `src/query/distributed/distributed-transaction-telemetry.js` (only for the re-check after L3)
- optional, pre-existing dead code: `src/query/distributed/distributed-transaction-coordinator.js`,
  `src/query/distributed/distributed-transaction-records.js`

Tests and probes superseded or re-seeded:
- `test/query/tx-metadata-pgwire-and-result-representation.test.js` (or, after L3, the
  telemetry export's pinned-sequence fixture and its purpose counts)
- `test/query/transaction-participant-set-authority.test.js`
- `test/query/scenario-a-transaction-coordination-fast-path.test.js`
- `scripts/checks/scenario-a-transaction-coordination-fast-path-guard.js`
- `test/query/schema-provisioning-job-owner.test.js`
- `test/bootstrap/transaction-telemetry-production-defaults.test.js` and its fixture
  (the telemetry export quest's, after L3)
- optional with the dead code: `test/workflow/durable-workflow-coordinator.test.js`

This quest's own files:
- `solve/quests/transaction-redundant-progress-writes/`
- `test/query/transaction-progress-write-witness-support.js`
- `test/query/transaction-redundant-progress-writes.test.js`
- `test/query/transaction-redundant-progress-writes-recovery.test.js`
- `scripts/checks/transaction-redundant-progress-writes-guard.js`
- `test/scripts/transaction-redundant-progress-writes-guard.test.js`

Generated outputs refreshed with the candidate:
- `test/shards/{primary,resource,subsystem}-classes.json`
- `test/shards/impact-graph-seal.json`
- `solve/changes/global-owner-debt-inventory/inventory.json`
- `solve/changes/priority-recovery-owner-inventory/inventory.json`
- `src/**/INDEX.md`

Optional documentation: `architecture/postgres-wire.md:320-323` (a sentence that
participant rows begin with the PREPARE evidence).

## C5 confirmation

See `seals-and-contracts.md` section 6: the transaction cone run under the retained
preload, and its comparison with main's corpus log.

## Evidence and closure

- **Safety:** the recovery net (6 cases, green today and under the simulation), the
  begin-gate witnesses (4) and the guard's preservation properties 4-11; negative
  controls in the guard test (PREPARE evidence dropped; gate dropped).
- **Probe:** guard red **3** at `ab347e962` (properties 1-3), 0 under the retained
  simulation, 2 under the defective variant. Under `LAGRANGE_PROBE=1` it also reads 3.
- **Native and physical:** landing waits for the TX1 three-replica crash witnesses to be
  repaired and pass on the candidate (L1). The physical before/after belongs to the
  successor epic and should count 08007 outcomes (review, non-blocking).

## Open questions for the lead

1. Whether the pre-existing dead participant-persistence helpers are deleted in this
   quest (widening) or routed to their owner.
2. Whether the schema-provisioning field deletion (a persisted JSON key) is taken here or
   by that owner. It is unfed today regardless of this quest.

## Findings for other owners (stage 1)

- **TX1 owner: the held answer's participant list.** Before the authoritative refresh,
  the participant list of a held recovery obligation (`getRecoveryObligation`, the
  in-doubt answer of `buildDecisionInDoubtResult`,
  `distributed-transaction-decision-protocol.js:681-696`) is informational, and is now
  empty for participants that were not asked to prepare: "unknown" is shown as an empty
  list. The options are to drop the field from the held answer or to fill it from the
  manifest of the loaded row (`participant_set_text`, already on the restored
  transaction). Nothing in `src` reads it today (`reader-census.md`, "Held state").
- **TX1 owner: begin gate after a partial BEGIN failure (pre-existing, unchanged).** When
  one sibling's BEGIN fails, `settleAllOrThrow` throws before the siblings that did
  begin are marked ACTIVE in memory (`distributed-transaction-participant-set.js:296-311`;
  the unchanged tree marked them only after every BEGIN succeeded). A later statement
  BEGINs them again, which the participant answers idempotently while the session exists
  (`partition-participant-transaction-request.js:255-264`), and which opens an empty
  session if it was lost in between.
