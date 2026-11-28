# Design note: remove two redundant progress writes from the transaction path

Quest `transaction-redundant-progress-writes`, stage 0 (no `src` change). Template:
`docs/development/verification-templates/design-note-template.md`. Code at
`ab347e962`; **[V]** verified (read or measured), **[I]** inferred. Companion
records: `reader-census.md`, `seals-and-contracts.md` (same directory).
Measurements: `/mnt/data/peter/projects/lagrange-oltp-perf-20261128/lab/td-stage0/`.

## Verdict

| Removal | Verdict |
| --- | --- |
| **(a)** ACTIVE row on `sql_transaction_participants` at the first write to a table (R1 W4a) | **Safe**, provided the in-memory ACTIVE transition of the participant record is kept (it gates re-BEGIN, `distributed-transaction-participant-set.js:286-288`). That is a constraint on how the write is removed, not an extra mechanism. |
| **(b)** `status = PREPARED` on `sql_transactions` (R1 C4) | **Safe only with one named additional change**: the live recovery sweep must select the commit protocol by the commit-point fact, not by the PREPARED label (`distributed-transaction-recovery.js:134-155`). Without it the durable outcome stays correct, but the sweep reports a committed transaction as a failed rollback (measured, below). |

Neither removal needs a flag, a mode or a compatibility path: each deletes a
write at its one producer, and the one routing decision that read the label
moves to the owner's existing typed fact.

## Claim, scope and current evidence

- **Invariant.** Every admitted participant of a write transaction reaches
  the one recorded decision. A COMMIT is decided only with complete retained
  PREPARE evidence, and a crash at any point ends in exactly one outcome with
  no orphaned participant session. (`architecture/postgres-wire.md:315-347`.)
- **Claim of this quest.** The two writes carry no information a reader
  needs: (a) the manifest names every admitted participant before any
  participant request; (b) nothing decides from PREPARED. Removing them cuts P + 1
  consensus rounds from a write transaction's critical path (where the
  participant leader is nearer than a round) and P + 1 proposals and CDC
  obligations: new_order 36 -> 30 proposals, payment 30 -> 25.
- **Real entry path.** PG-wire `BEGIN` / statements / `COMMIT` / `ROLLBACK`
  -> `SQLQueryEngine` -> `DistributedTransactionCoordinator` (R1 sections 1.2-1.7).
- **Separate claims.** This note supports the bounded repair only. The
  physical latency claim belongs to the successor epic's certification
  (ruling 26: before/after on a clean substrate). Release acceptance is not
  claimed.
- **Observed today [V].** The world of the new witnesses reproduces the known
  counts exactly: 10 coordinator-table writes for a one-table COMMIT (the
  pinned `tx-metadata` witness), 14 for two tables (`6 + 4P`), 8 for a
  one-table ROLLBACK. The red witnesses fail only on the two writes. Under a
  scratch simulation of both removals they are green, five of six recovery
  witnesses stay green, and the live in-doubt sweep witness turns red
  (`*-simulated-removals.tap`).
- **First failing artifact if the claim is wrong.** A recovery witness in
  `test/query/transaction-redundant-progress-writes-recovery.test.js`, or the
  guard's preservation properties.

## Transition record (solver-quests.md, contract-first checklist)

1. **Producer and consumer symbols.** (a) Producer:
   `enlistParticipantsOwned` -> `persistActiveParticipants` ->
   `workflowCoordinator.upsertParticipant` -> coordinator `persistParticipant`
   wrapper -> `SQLQueryEngine.persistDistributedTransactionParticipantRow`
   (`distributed-transaction-participant-set.js:285-317`,
   `distributed-transaction-statement.js:174-204`,
   `durable-workflow-coordinator.js:254-288`,
   `distributed-transaction-coordinator.js:191-210`,
   `sql-query-engine-transaction-persistence-methods.js:580-613`).
   `upsertParticipant` has one `src` caller (`participant-set.js:301`).
   (b) Producer: `prepareEnlistedParticipantsForDecision` ->
   `setTransactionStatus` -> `persistTransactionRecord` ->
   `persistDistributedTransactionRow` (`distributed-transaction-decision-protocol.js:228-230`,
   `distributed-transaction-protocol.js:284-297`). Consumers: every reader in
   `reader-census.md` (26 classified readers; 53 `src` files searched).
2. **Owner-defined shape.** No shape changes. The participant row schema,
   the transaction row schema and the status vocabulary stay. Only the
   instances of `participant.status = ACTIVE` rows and `status = PREPARED`
   updates stop. `TRANSACTION_STATUS.PREPARED` remains the participant
   vocabulary (`PARTICIPANT_STATUS === TRANSACTION_STATUS`,
   `distributed-transaction-coordinator-constants.js:14`).
3. **Identity and generation.** Unchanged: transaction id, epoch, session id,
   participant id = `transactionId:partitionId`, manifest text (CAS
   generation of the admitted set), decision digest, prepared digest. The
   manifest append is still the first durable act for a participant identity
   and still precedes its BEGIN (witness `kept: each participant is appended
   to the manifest ...`).
4. **Ordering.** Today: manifest append -> participant BEGIN -> (ACTIVE row ||
   QUERY) -> ... -> freeze+PREPARING -> PREPARE -> PREPARED rows -> PREPARED
   status -> decision+COMMITTING -> COMMIT -> COMMITTED rows -> COMMITTED.
   After: the two writes leave this order and nothing is reordered. The
   per-owner fences are the same: the manifest CAS, the `decision IS NULL`
   guard, and FROZEN plus exact manifest text on the decision. The PREPARED
   evidence still precedes the decision, which still precedes fan-out
   (witness `kept: every participant's PREPARED evidence row precedes ...`).
5. **Absent versus unavailable.** A missing participant row is already a
   legitimate, typed "member without evidence" (restored FAILED,
   `distributed-transaction-recovery-authority.js:99-110`; TX1 design
   `design-query-begin-uncertain-insert-resolution-2026-10-11.md:2132-2137`).
   An unreadable participant page stays UNAVAILABLE and holds the obligation
   (`sql-query-engine-transaction-set-methods.js:51-53`). The removal adds no
   inference from absence. "No row before PREPARED" is the normal state, and
   recovery never treats it as "not admitted" (the manifest decides).
6. **Durable commit.** Unchanged: the commit point is the decision write
   (`persistDistributedTransactionDecision`, guarded on FROZEN, exact
   manifest text and `decision IS NULL`). The PREPARED status was never part
   of it (`:459-498`).
7. **Retained obligations.** Participant volatile sessions are owned by the
   participant leader and ended by a bound decision (or the hold sweep). The
   manifest member list, not the ACTIVE row, is what makes recovery send that
   bound decision. PREPARED reservations are released by the decision. CDC
   obligations: P + 1 fewer per transaction are created, and none of the
   remaining ones is dropped. Write-operation rows are unchanged.
8. **Canonical wake and cleanup.** Unchanged triggers: the client's
   COMMIT/ROLLBACK, the startup replay and the periodic sweep (discovery waits
   for the persisted deadline for undecided rows, immediately for decided
   ones). One change, under (b): the live sweep's choice between the commit
   and rollback protocols for an undecided live transaction reads
   `commitPointReached` and COMMITTING instead of PREPARED and COMMITTING
   (named change B1). Settlement, `endTransaction`, the ended-transaction
   record and the read-only release are unchanged.

## Contract and failure analysis

1. **Consumed surfaces.** All are cited in `reader-census.md`. No new
   surface is consumed or added.
2. **Typed failure edges.** The two writes have their own failure edges
   today, and removal deletes them:
   - A rejected or lost ACTIVE upsert fails the statement
     (`distributed-transaction-statement.js:199-201`). A late rejection was
     the "Finding 1B" hazard (`transaction-participant-set-authority.test.js:709-881`).
     After the change, a `sql_transaction_participants-p1` outage cannot fail
     a statement before PREPARE.
   - A rejected or lost PREPARED-status answer throws out of COMMIT with the
     in-memory status restored to PREPARING (`distributed-transaction-protocol.js:290-296`)
     and `commitPointReached: false`. The client is answered 25P04 and the
     transaction is later rolled back. After the change, the next
     coordinator-table write is the decision, whose unknown outcome is the
     in-doubt path (witness `live in-doubt decision`).
3. **Cached views.** System-cache rows of both tables only drive discovery
   and the cache-row restore; the authoritative read replaces the restored
   participant map before any decision (`distributed-transaction-recovery-authority.js:184-198`).
   With fewer cached rows there is nothing stale to veto progress. The
   in-memory participant registry remains the live authority for "already
   begun" (reader 19).
4. **Identity and representation.** No adapter, no encoding change; the
   PG-wire answer's `engine_stage` detail on an in-doubt COMMIT after
   PREPARE reads PREPARING instead of PREPARED (diagnostic text, no branch
   reads it).

## Crash tables

Durable evidence is the state on `sql_transactions` (T), `sql_transaction_participants`
(PR) and the participant's own partition. "Rec." is what recovery does.
Discovery acts on an undecided row only after its persisted deadline, and on
a decided row at once (`distributed-transaction-recovery.js:86-98`).
Row-discovered recovery is the authority path (`...-recovery-authority.js:207-235`).

### Removal (a): ACTIVE participant row

| Point | Coordinator crash | Participant-leader change | Coordinator-table leader change |
| --- | --- | --- | --- |
| BEGIN row inserted, no write yet | T ACTIVE/OPEN `[]`. Rec.: after the deadline, freeze, ROLLBACK, nothing to fan out. Same without (a). [V code] | n/a | Unknown INSERT outcome is resolved by readback (`...-persistence-methods.js:371-426`). Unchanged. |
| Manifest append landed, BEGIN not sent | T OPEN with P named; PR none in either tree. Rec.: after the deadline, bound ROLLBACK to P, which tombstones a participant that never saw BEGIN. Identical. [V code] | n/a | A lost CAS answer is read back; on failure the tx becomes a recovery obligation (`participant-set.js:182-193`). Unchanged. |
| BEGIN done, statement QUERY staged, ACTIVE row in flight or landed (today) / absent (after) | Today PR ACTIVE (restored as FAILED) or nothing; after: nothing. Rec.: identical, bound ROLLBACK to every manifest member. **Witnessed** both with rows and without rows (`restart after the manifest append ...`, 2 cases, green). [V] | The volatile session is lost on the leader; the next statement or PREPARE is refused and the coordinator decides ROLLBACK. The ACTIVE row plays no part. [I from the volatile-staging design, R1 9; not witnessed here] | Today: an ACTIVE upsert failure fails the statement (client error, tx stays OPEN). After: no write on this table before PREPARE, so this edge disappears. [V] |
| Freeze landed (FROZEN, PREPARING), no PREPARE | T FROZEN; PR: today ACTIVE, after none. Rec.: after the deadline, not prepared, ROLLBACK. Identical. [V code; partial-evidence variant witnessed] | PREPARE is refused, ROLLBACK. Unchanged. [I] | Unchanged. |
| PREPARE done on k of P, PREPARED rows for some | PR: today PREPARED for some and ACTIVE for the rest; after, PREPARED for some and nothing for the rest. Rec.: not every member has evidence, so ROLLBACK after the deadline. **Witnessed** (`restart with PREPARE evidence retained for one participant only`, green). [V] | A PREPARED reservation is durable on the participant group and survives. Unchanged. | A PREPARED-row write failure fails COMMIT (witness P2 in `transaction-participant-set-authority.test.js:883`). Unchanged. |
| All PREPARED rows, decision, fan-out, settlement | Not affected by (a). Witnessed (`... before the decision`, `... after the decision`, green). [V] | Unchanged. | Unchanged. |
| ROLLBACK path X1-X5 | Rec. drives the recorded ROLLBACK to every manifest member; the ROLLED_BACK row is written for every member whether or not an ACTIVE row existed (`decision-protocol.js:576-587`). [V] Measured: one-table ROLLBACK 8 -> 7 writes. | Unchanged. | Unchanged. |

### Removal (b): `status = PREPARED`

| Point | Coordinator crash | Participant-leader change | Coordinator-table leader change |
| --- | --- | --- | --- |
| BEGIN to freeze | Not affected. | Not affected. | Not affected. |
| All PREPARED rows landed, before C4 (today) / before C5 (after) | T FROZEN PREPARING; PR PREPARED with evidence. Rec.: after the deadline, prepared, COMMIT. Identical in both trees. [V] | Unchanged. | Unchanged. |
| C4 landed, before C5 (today only) | T FROZEN **PREPARED**. Rec.: the restored status is PREPARING (`recovery-authority.js:159-161`); discovery waits for the deadline exactly as for PREPARING. **Measured**: a crash at the decision write leaves PREPARED and `totalRecovered: 0` before the deadline, then COMMIT after it. The state disappears after the change. [V] | Unchanged. | Today a lost C4 answer fails COMMIT with `commitPointReached: false`, then ROLLBACK. After the change the edge does not exist. [V] |
| Decision write with unknown outcome (lost answer, read unavailable) | Live tx: IN_DOUBT, commit point reached, in-memory status PREPARED (today) / PREPARING (after). Rec. (live sweep after the budget): today, the commit protocol adopts and completes COMMIT, and the sweep reports success. **After the change without B1**: the rollback protocol adopts COMMIT and completes it, but returns `TRANSACTION_COMMIT_DECIDED` failure: durable outcome right, report wrong. **Measured** (`live in-doubt decision`, red under simulation). With B1, identical to today. A crashed coordinator in this state is found by discovery at once (decision recorded, COMMITTING) and completed (witness `after the decision`). [V] | Unchanged. | This is the leader-change case of the decision write itself; covered by the same witness. |
| Decision recorded, fan-out, COMMITTED rows, COMMITTED status | Not affected (status already COMMITTING via the decision UPDATE). [V] | Unchanged. | Unchanged. |
| ROLLBACK path | PREPARED is never written on ROLLBACK. Not affected. [V] | | |

## Contention

The row-key claim of a transaction lasts from its first staged write to
its COMMIT apply (C6) (R1 section 4). Removal (a) takes P rounds out of the
statement path wherever the coordinator-table round is longer than the
participant hop. Removal (b) takes one round out between C3 and C5.
Both shorten the holder's remaining hold, and with it the wasted 2.3 s waits
of section 4. The wait policy is unchanged (it belongs to
`locking-read-authoritative-reservations`, ruling 25). [I: not measured]

## CDC obligations

Every committed write on either table records an obligation
(`cdc-table-policy.js:187-205,548-551`), acknowledged later by `CDC_DELIVERED`
proposals and counted against the 4096 owed bound
(`partition-cdc-owed-admission.js:43-77`). Removing P + 1 writes removes P + 1
obligations and their acknowledgements per write transaction (new_order 6,
payment 5). No obligation that is still created is dropped (R12). [V policy, I load effect]

## Named changes for the implementation stage (after design review)

- **A1 (shape of removal a).** Delete the durable ACTIVE write at its
  producer. `enlistParticipantsOwned` marks the registry record ACTIVE in
  memory (the same record `tx.participants` holds) and no longer calls
  `upsertParticipant`. Then delete `persistActiveParticipants`,
  `deferActivePersistence` and the three-way `allSettled` in
  `executeWriteStatement`. Recommended over the alternative of adding
  ACTIVE to `TRANSIENT_PARTICIPANT_STATUSES`
  (`sql-query-engine-transaction-persistence-methods.js:63-67`): that would
  keep an awaited no-op persist, an "elided" telemetry counter and the
  overlap machinery whose only purpose was this write. Decision: reviewer
  and lead.
- **B1 (required for removal b).** In `redriveRecoveredTransaction`, an
  undecided live transaction continues the commit protocol when
  `tx[COMMIT_POINT_REACHED_FIELD]` is set or its status is COMMITTING, and
  otherwise rolls back. `runCommitProtocol` already treats that field like
  COMMITTING (`decision-protocol.js:397-405`). The only behavioural difference
  from today is a live transaction past PREPARE whose decision record
  could not be built: it now rolls back instead of re-attempting COMMIT. That
  is the authority's own rule for incomplete evidence. [I: such a state is
  unreachable with complete in-memory digests]
- **B2.** Delete the dead in-memory branches: PREPARED in
  `RECOVERY_COMMIT_TRANSACTION_STATUS`, `PREPARE_SENT_TRANSACTION_STATUS`,
  `resolveTransactionRowPersistPurpose`. **Keep** the durable-row readers'
  acceptance of PREPARED (release census `:43-60`, recovery inputs). They
  read rows an earlier build may have left, and the census set is part of
  the release semantic `tx1-query-set-v1`. Open question 2.
- **Supersessions** (`seals-and-contracts.md` section 5), each recorded as a
  finding naming the original assertion: the fast-path guard and witnesses,
  the `tx-metadata` counts, the participant-set overlap and Finding 1B
  witnesses, and the TX1 leg-a and restart hold points (with the TX1 owners;
  both files are already red on main).
- **Assignment paths needed beyond this stage:** `src/query/distributed/distributed-transaction-{participant-set,statement,decision-protocol,recovery,coordinator-constants}.js`,
  `src/query/sql-query-engine-transaction-persistence-methods.js`, the test
  files above, `scripts/checks/scenario-a-transaction-coordination-fast-path-guard.js`,
  optionally `architecture/postgres-wire.md:320-323`.

## Evidence and closure

- **Safety:** the recovery witnesses (6 cases, green today; written to stay
  green) and the guard's preservation properties 5-10 (met today). One
  negative control: the guard refuses a candidate that stops retaining
  PREPARE evidence (`test/scripts/transaction-redundant-progress-writes-guard.test.js`).
- **Progress:** each crash case ends in exactly one decision applied by
  every participant, with no open session, once the persisted deadline has passed
  (undecided) or at once (decided).
- **Resource bounds:** P + 1 fewer proposals and CDC obligations; no new
  retained state.
- **Deterministic proof:** the guard (`doneWhen`, target 0, red 4 today), the
  new witnesses and the existing owners' focused suites on the lab from the
  candidate. **Physical proof:** the successor epic's before/after run, not
  this quest.
- **Fidelity limit:** the in-process world uses the gateway double (one
  SQLite store, no replication) and a participant ledger double. The TX1
  three-replica witnesses that would add native evidence for the crash
  points are red on main for pre-existing reasons (`seals-and-contracts.md`).

## Open questions for the design review

1. Shape of removal (a): A1 (producer removal, recommended) or elision at the
   persistence owner.
2. Should the durable-row readers' PREPARED acceptance be narrowed? Narrowing
   changes the release census contract (`tx1-query-set-v1`), so the
   recommendation is no.
3. Sequencing with the telemetry export quest: both edit the
   `tx-metadata` witness and `distributed-transaction-statement.js`/telemetry.
   The brief orders the export first.
4. The TX1 witnesses `transaction-leg-a-three-replica.test.js` (A5) and
   `transaction-coordinator-restart.integration.test.js` are red on main.
   Their repair belongs to the TX1 owner, but this quest's supersession of
   their hold points must land with or after it.
