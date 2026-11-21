# Independent verification: owner-fact read (`work/owner-fact-read-20261121`, b638284d1..ee58d307f)

Verifier: independent subagent, read-only (git show/diff/grep and the retained lab outputs; no test run, no
write in any worktree). Date 2026-11-21. Marking: **[V]** read in code at ee58d307f, **[X]** read in a
retained lab output (directory named), **[I]** inferred (reasoning, or knowledge of raft-rs 0.7.0 that the
tree does not vendor).

## Verdict

| Question | Verdict |
| --- | --- |
| (i) Merge ee58d307f into the integration line | **APPROVE-WITH-CONDITIONS** (C1-C4 below) |
| (ii) Migrate the absence-dependent topology guard onto it | **REJECT as it stands** (path to approval: R1-R6 below) |

Why they differ. The slice only adds refusals to the existing strict read (a non-leader no longer ships rows;
`readOwnerFact` additionally refuses a fresh leader), so merging it makes no existing consumer less safe. But
the read is not yet what the owner's requirement asks for before an absence-dependent consumer may rely on it:
the receiver's "still leader" decision and its "witness = snapshot read" claim both rest on a status read that
is not always the core's current state (F1, F2), and the recipe proposed for the guard (floors 0, no effect
fence) leaves a stale-but-complete inventory able to authorize a placement (F9).

Conditions for (i):
- C1. The red-by-design test must not enter the corpus as an ordinary red (F8).
- C2. Correct the contract paragraph and the two code comments that state more than the code does (F1, F2, F7).
- C3. Finish the mutation table and resolve m01, which **survived** its declared killers (F10); run the change
  cone. My approval of (i) depends on the cone run showing no regression in the other 37 leader-REQUIRED
  consumers (they now receive typed receiver refusals and, with no published leader, are routed to every
  routable replica); I could not confirm that from retained output.
- C4. Put `ownerFactFloor` in the gateway's single-flight key, or exclude owner facts from coalescing (F4): the
  gateway's own rule at `control-plane-system-table-gateway-query-execution.js:105-108` requires it.

Required before (ii):
- R1. The receiver decides on a status that is the core's state at that instant, or refuses when it is not (F1/F2).
- R2. The receiver refuses when its connection is inside a transaction it did not open, or the statement owner
  shows that cannot happen on a system-table partition (F3).
- R3. C4, plus the answer must prove which request it answers (F4, F5).
- R4. Floors are typed by partition, and the guard's floor is a SERVICES-partition position (F6).
- R5. The effect fence of section 9 exists.
- R6. Executed kills for m05, m07, m10, m11 and a new witness for the F1 interleaving.

## Findings

### F1. "Still leader" is decided on a cached status while a core turn is pending [V] — defect
`answerLeaderQualifiedRead` (`src/partition/partition-service-remote-query-methods.js:304, :316`,
`leaderReadRefusalAfter` :272-282) takes both observations through `readOwnRaftStatus()` ->
`raft.readStatus()` -> `readStatusNow` -> `readStatusObserved` (`src/raft/raft-rs-runtime-owner.js:1560-1578`).
That function returns a fresh core read only when the group is idle with nothing delivered (:1561-1563).
Otherwise it returns `group.statusObservation`, "the status of the last completed core entry" (:1509-1511,
:1573-1577), which is recorded only by `announce` at the end of a drain (:1340, :1404).
A turn is pending whenever a Ready has outbound messages: `finishReady` awaits `sendMessages` (:1234-1238,
`raft-rs-peer-delivery.js:161-182`; the transport's promise) and then, possibly, the persistence admission
(`raft-rs-persistence-admission.js:44-72`, bound 120 000 ms, `raft-rs-runtime-owner-constants.js:240`).

Minimal interleaving (deposed-and-aware leader answers READY):
1. L leads term T; last announced observation O = {leader, T, commit = applied = X, no pending conf change}.
2. An append or heartbeat from successor N (term T+1) is in L's inbound queue; the group is idle.
3. Owner-fact read arrives. `before = readOwnRaftStatus()`: inbound is non-empty, so the read enqueues a
   READ_STATUS turn (:1565-1567), which runs at once, steps N's message (the core is now a follower at T+1),
   takes the Ready and awaits the send of its response. The turn is pending, so the read returns O (:1573).
4. The predicate passes on O; the statement runs.
5. `after = readOwnRaftStatus()`: the turn is still pending, so it returns O again: leader, T, applied X.
6. READY, witness "leader, term T", from a replica whose core already follows T+1.

The post-read re-check is therefore ineffective in exactly the case it exists for. The author's statement
"the role and the indices come from ONE source, the raft core's current state" (record 16.1) and the
contract's "on one observation of its own raft-rs core" are not true on this path. Severity: same class as
the documented residual (a stale leader's applied state), but the window is no longer "has not yet learned
of its successor"; it adds the length of a pending turn (peer send, or up to 120 s of persistence admission).
The executed test "leadership moving while the leader reads" does not reach it: the fixture's loopback
transport settles and announces before the held statement is released.

### F2. The witness is a lower bound of the snapshot read, not its position [V] — defect against owner item 2
Same cause. In `finishReady` the Ready's committed entries are applied (:1239, SQLite transaction and
`recordAppliedEntry`) and then the light Ready's messages are sent (:1261-1262, pending) before the drain
announces. In that window SQLite holds entries the cached observation does not report.
Interleaving: O says applied = 100; the pending turn applies 101 and awaits the light-Ready send; the read
takes `before` = O (100), reads rows at 101, takes `after` = O (100): "unmoved", READY with
`witness.appliedIndex = 100` for a snapshot at 101.
"Unchanged applied index" compares the same cached object twice. Consequences: rows are never older than the
witness (so floors stay sound and err toward refusal), but a consumer that treats `witness.appliedIndex` as
the position of the rows (the retained-repair owner's planned custody tenure) is wrong by the entries applied
inside the pending turn. The lead's ruling accepted "at least as new as the witness"; the owner's requirement
and the contract text ("the rows are read at that applied position") say more than that.
The adjacency argument itself holds [V]: no await between the observation and the statement
(`executeRemoteQuery` :129-154 -> `executeQuery` READ branch `partition-service-write-metrics-base.js:178-210`
-> `executeAdmittedReadQuery` :131-175 -> `collectBoundedTypedRowSet`, `query-result-budget.js:130-185`,
synchronous `statement.iterate`, throws rather than truncates), and the rows come from SQLite only, no cache.
What fails is that the observation is not always current.
Starvation: [I] unlikely; between statement and re-check there are only microtasks, and a false
`owner_fact_read_point_moved` needs a turn to finish in that gap.

### F3. A read on a connection inside a foreign transaction sees uncommitted rows [I] — unverified risk
`partition-statement-admission.js:278-283` states that while a legacy session holds `BEGIN` on the shared
connection "that connection also reads the session's uncommitted rows", and
`raft-rs-persistence-admission.js:3-12` that such a session holds it "across round trips". The READ admission
(:350-374) does not look at `db.inTransaction`, and neither does the receiver. If such a session can exist on
a system-table partition, an owner fact can contain staged, never-committed rows or miss a row a staged
DELETE removed (false absence), and the raft store defers persistence meanwhile, which is the pending-turn
state of F1. I did not establish whether legacy sessions can open on the SERVICES or ledger partition (the
fixture does drive a participant-transaction cutover on the ledger group). The "one connection, one
transaction" argument of record 16.3 covers the apply transaction only.

### F4. The single-flight key omits the floor and the deadline [V] — defect (rule the author's own file states)
`buildImplicitReadRequestKey` / `buildExplicitReadRequestKey`
(`control-plane-system-table-gateway-query-execution.js:139-156`) key on table, sql, params, the read-authority
token and the pressure contract. `buildControlPlaneReadAuthority`
(`control-plane-system-table-gateway-read-contracts.js:302-326`) has neither `ownerFactFloor` nor a timeout,
and `runSingleFlight` hands a joiner the first caller's promise
(`control-plane-system-table-gateway-request-coalescing.js:114-119`). So an owner-fact read joins a plain
`OWNER_RPC_REQUIRED` + `REQUIRED` read of the same statement (the retained-repair owner's present read is
exactly that shape), or an owner-fact read with other floors. Then:
- the receiver never made the owner-fact decision for the joiner; only the caller-side predicate did, on the
  pre-read witness. That is safe as far as the witness is truthful (F1/F2), and the joiner's own floors are
  applied (`ownerFactAnswerOf`, `control-plane-owner-fact-read.js:190-206`), but it is not "the receiver
  decides";
- the joiner's read point can precede its own call (it joined a read already executed at the leader), so
  READY does not mean "read after I asked";
- the joiner waits on the first caller's deadline, not its own: "within the ORIGINAL request deadline" does
  not hold for a joiner;
- joiners share the same row objects (F7).
The author recorded the first bullet as a liveness residual (16.10); the other three are not recorded.

### F5. `readOwnerFact` cannot tell which path produced its answer [V] — hardening, required for (ii)
The draft cannot weaken the read (unknown fields refused; mutant m02 killed [X]). But the reader port is the
caller's function, and READY is decided from the witness alone. Every read path now builds a witness with
the same fields: the non-qualified QUERY path (`handleRemoteQuery` :488-496, any role, rows shipped) and the
`OWNER_LOCAL_*` path, whose witness is built after an awaited read
(`cdc-integration-service-local-system-table-routing.js:46-62`, the shape the ruling told the author not to
copy). A port that overrides the mode, a request built by a caller-supplied `executionOptions.buildRequest`
(`query-executor-partition-request-builders.js:212-222`, which skips the `leaderRead` stamp), or a coalesced
answer all yield a witness that passes. No such port exists in this slice. The fix is small: the receiver
echoes the decided `leaderRead` in the witness and the caller requires it.

### F6. Floors are bare integers of an unnamed raft group [V] — defect for the first consumer
`minimumIndex` / `minimumTerm` are compared with the serving partition's applied index and term
(`control-plane-owner-fact-read-contract.js:126-131`). The guard reads SERVICES (its own partition) while its
writes go to the ledger (another group). "Floors 0 or its last committed write's index/term" (record 16.11
item 6) therefore invites passing a ledger position as a SERVICES floor: a meaningless bound, with no way
for the function to notice.
What the floors protect [I]: an index floor guarantees the answer contains the caller's committed write
(committed entries are unique per index, and a leader applies only committed entries); a term floor refuses
any leader older than one the caller has already seen, which closes the deposed-leader window for that
caller. Both are supplied by the consumer and only help if it has a position in the same partition.

### F7. Smaller points [V]
- Rows: `Object.freeze([...answer.rows])` freezes the array, not the row objects, and joiners of one flight
  receive the same objects; one consumer's mutation reaches another.
- The brand is a private class field, so no plain object, spread copy, proxy or `Object.create` passes
  `ownerFactRows`. It is forgeable only deliberately: `new (anyIssuedAnswer.constructor)({state: 'ready',
  rows})`, because the class is reachable through an issued answer's prototype. Not an accident path.
- `confChangePending` is computed as `BigInt(status.pendingConfIndex ?? 0) > BigInt(status.applied ?? 0)`
  (`raft-rs-status-observation.js:145-146`): a status without either field reads as "election log applied".
  The binding always supplies both (`vendor/raft-rs-wasm/src/lib.rs:719-720`), so this is not reachable
  today; it is a silent default the safety decision now depends on, where `currentTermApplied` (:106-113)
  fails closed.
- A follower's witness has `electionLogApplied: true` (raft-rs resets the pending index to 0 on becoming
  follower): the role check is the only thing between a follower and that flag.
- Refusals carry no rows on every path I traced: `leaderReadRefusal` (:260-266),
  `enforceRequiredLeaderReadAuthority` (strips `rowSet`, `rawRows`, `columns`,
  `cdc-integration-service-owner-rpc-read-execution.js:122-131`), `inProcessReadResult` (:527-531), and
  UNAVAILABLE answers have no `rows` field. Reasons: the nine of `OWNER_FACT_UNAVAILABLE_REASON`; anything
  else maps to `owner_fact_read_failed`. `APPLY_BEHIND_COMMIT` and `INCOMPLETE_ROW_SET` appear in no test.

### F8. The red finding is registered as an ordinary corpus test [V] — condition C1
`test/cdc/cdc-leader-required-fresh-leader-absence.test.js` is added to `test/shards/primary-classes.json`
(class `unit`) and the two other shard files; I found no known-red or quarantine mechanism in `test/shards`,
`scripts/lab`, `scripts/checks`, `src/test-helpers` or `docs/steering`. It is red at b3b18beeb and ee58d307f
[X] on its named assertion, so the corpus is red by design from this merge on.
What it asserts: one read of the shared plain path (`OWNER_RPC_REQUIRED` + `REQUIRED`) against a fresh leader
that holds, unapplied, a row its predecessor committed, answers success with an empty row set. It is one
witness for the shared path, not per consumer, and its header is inaccurate: it turns green when the plain
kind itself refuses that read point (or is deleted), not as consumers migrate one by one.
Its value: together with read-point test 1 it is executed differential evidence that the election-log
condition is the operative refusal (same fixture state, where commit = applied already holds, fixture
:448-452).

### F9. Readiness for the topology guard — see section 9

### F10. Mutation evidence as of about 17:40 local (runs in progress) [X]
| Mutant | Directory | Result |
| --- | --- | --- |
| m01 predicate drops the leader-role check (3de15e2c6) | `s0-mutant-m01-accept-follower-witness-sealed` | **SURVIVED**: exit 0, witnesses 2 and 3 both pass (18 + 32 assertions) |
| m02 draft spread over token (59ef438d0) | `...-m02-...-sealed` | killed, witness 4 ("authoritativeReadMode=owner_local_only: typed refusal") |
| m04 identity by shape (717eb0dee) | `...-m04-...-sealed` | killed, witness 4 ("a hint carries no owner-fact identity") |
| m06 witness after read (6f4ba10d5) | `...-m06-...-sealed` | killed, read-point file ("afterRead: the witness names the applied position") |
| m03, m05 | `...-sealed` | not run ("adams-gamla is not a ready lab machine") |
| m07 | `...-sealed` | no exit record yet |
| m08-m11 | none | not run |

m01 survives because the receiver has the role check twice: once in the shared predicate and once in
`leaderReadRefusalAfter` (:274). With the predicate's check removed a follower executes the statement and is
refused afterwards, so witnesses 2 and 3 still pass. The declared kill ("m01: witnesses 2+3", record 16.9) is
falsified. [I] The fifth case of the read-point file (a follower's witness on a successful empty answer)
should kill it, since a follower's witness passes every other owner-fact check; that file was not run
against m01.

## Answers to the attack list

1. **Receiver decision.** One QUERY entry (`partition-service-entry-apply-base.js:480-481`). A request with
   `leaderRead` returns rows only through `answerLeaderQualifiedRead` (pre-check, statement, post-check). A
   request without the field still gets rows from any role (:488-496); the caller-side check refuses a
   non-leader witness, but see F5. The field is stamped by the one default builder for every read whose
   token says leader REQUIRED (`query-executor-partition-request-builders.js:120-126`), including the
   redirect hop and the in-process arm; a caller-supplied `buildRequest` skips it. A participant-session
   request is answered before the leader decision (:473-484); owner-fact requests carry no transaction
   identity. Coalescing: F4. No SQL fallback and no local read in `OWNER_RPC_REQUIRED`
   (`read-contracts.js:191-199`, `owner-rpc-read-execution.js:194-196`, read flow :622-642) [V].
2. **Read point.** [I for raft.rs, which the tree does not vendor; V for the binding]
   (a) Sufficient. `become_leader` sets the pending index to the last log index L before appending its empty
   entry (at L+1), and the leader only raises it. Core applied >= L means the whole election-time log is
   applied; a replica applies only committed entries, and leader completeness puts every earlier-committed
   entry at an index <= L. This holds even when the commit index at election already equals L, without any
   own-term commit. A log "shorter than a committed entry" cannot win an election. The flag uses the core's
   applied index, which trails the runtime's, so it errs toward refusal.
   (b) `commit === applied` does not close the gap: a fresh leader at commit = applied = X with X+1..Y
   committed by its predecessor passes it; `electionLogApplied` refuses exactly that case (X < L). The
   equality only adds conservatism for the leader's own term and has no test.
   (c) F6.
   (d) Open after this: a deposed leader that has not learned of its successor, plus F1. `check_quorum` and
   `pre_vote` are on (`raft-rs-group-constants.js:21-22`). raft-rs checks quorum contact once per election
   timeout over the activity since the previous check, so step-down takes between one and two election
   timeouts, not "within one" as the contract says: with defaults (`raft.electionTimeoutMinMs` 1000,
   heartbeat 50 ms, tick 16 ms, `raft-rs-runtime-tuning.js:26-37`) up to about 2 s plus per-replica jitter.
   The bound is counted in the leader's own delivered ticks, so an event-loop stall extends it in wall time.
   A leadership transfer opens the window with no follower lease protecting it. The contract paragraph does
   say "not linearizable" and names the residual, but its bound and its "one observation" wording need
   correction.
3. **Witness and snapshot.** F1, F2, F3.
4. **Local = remote.** The in-process arm builds the request with the routed arm's builder and calls
   `handleRemoteQuery` (`owner-rpc-read-execution.js:556-586`); a NOT_LEADER answer falls through to the
   transport; the result passes the same caller-side enforcement. No local shortcut in this slice [V].
   `OWNER_LOCAL_*`, `OWNER_RPC_PREFERRED_SQL_FALLBACK` and `replicaFallbackConsistency` still exist for other
   callers; `readOwnerFact` forces the strict token through its draft but not through its port (F5).
5. **Redirects.** Each hop's options come from `buildRouterDeliveryOptions`
   (`query-executor-partition-attempt-budget.js:318-367`), which returns null once the execution budget is
   spent; one redirect is followed per candidate and a redirecting redirect target counts as that
   candidate's failure, so A->B->A ends typed at the deadline [V; X green in the redirect-deadline file at
   ee58d307f]. The target is the refusing replica's own known leader at its committed address
   (`partition-service-core-base.js:568-579`); it is a hint, re-qualified by the next receiver, and must be
   an eligible candidate (`query-executor-recovery-read-delivery.js:131-149`). "Widening" is: with no usable
   published leader, every routable replica of the projection, own node first
   (`query-executor-partition-routing-candidates.js:177-194`); each still decides at its receiver, so a
   non-leader does not answer. Deadline for a coalesced joiner: F4.
6. **Typed unavailability.** F7.
7. **Red finding.** F8.
8. **Tests by sha** [X]:
   - Witness 1 and 2 red at 8d4fd93d7 (`s0-witnesses-red-8d4fd93d7`: routing file "the node hosting the
     leader gets its owner fact (today: unavailable)"; stale-leader file "the strict read reaches the replica
     that leads"), green at 9a6d3da52-try4, b3b18beeb, ee58d307f.
   - Witnesses 3 and 4: 0 assertions at 8d4fd93d7 (import failure), green from 9a6d3da52-try4. Without kills
     they prove nothing about the product; m02 and m04 now give witness 4 two executed kills, witness 3 has
     none (m01 survived it, m07 pending).
   - First routing test red at base (`s0-base-routing-b638284d1`, "not ok 3 - should be equal"), green from
     fc37b8d1a-try2. The record's "76 leaf assertions" does not match the retained 83.
   - Hosted-replica, redirect/deadline and the pinned lifetime test: green at 9a6d3da52-try4, b3b18beeb and
     ee58d307f; none has a red-before (new files, or unchanged behaviour).
   - `s0-witnesses-ee58d307f` exists: 8 of 9 green, only the finding red. The record's "not yet re-run" is
     out of date.

   | Mechanism | Test that should fail if removed | Executed proof |
   | --- | --- | --- |
   | Receiver refuses a non-leader | stale-leader file; read-point "one receiver contract" | m05 not run; m01 shows the pre-read role check is not covered by witnesses 2 and 3 |
   | Election-log read point | read-point tests 1 and 2 | differential with the red finding (F8); m10 not run |
   | commit === applied | none | none, and no mutant planned |
   | Floors | witness 3 (index, term, pin) | m07 pending |
   | Read-point-moved re-check | read-point test 4 | m11 not run; the test's holds are synthetic and cannot reach F2 |
   | Redirect budget | redirect-deadline file | no mutant planned |
   | Hint/fact separation | witness 4 | m04 killed |
   | Draft cannot weaken the mode | witness 4 | m02 killed |
   | Local arm through the handler | no discriminating test found: the in-process half of read-point test 1 would also pass on a caller-side refusal | m09 (registry source, a different mechanism) not run |

## 9. Readiness for the first consumer

The guard (`rebalance-coordinator-topology-guard-methods.js:346-390`,
`priority-surplus-remove-placement-fence.js:94-145`) is not only absence-dependent: it counts the SERVICES
rows of a partition, so a stale **complete** inventory is as dangerous as a missing row (an already-removed
replica still listed reads as a surplus and allows a second REMOVE).

As implemented, the read protects the guard against a follower's rows and against a fresh leader that has
not applied its election log. It does not protect against:
- a deposed leader that has not learned of its successor: up to about two election timeouts of its own ticks;
- a deposed leader that has learned, while a core turn is pending (F1);
- a read point that precedes the guard's call (F4);
- uncommitted session rows, if F3 is reachable.

With floors 0 and "every UNAVAILABLE keeps the turn scheduled", as record 16.11 proposes, an answer from any
of those windows is READY and the guard acts on it. For the window to be harmless the EFFECT must be fenced
on the ledger, where placements are admitted:
1. The admission is a conditional committed ledger write that fails unless the ledger still shows the state
   the guard decided on: no other non-terminal operation for the partition, and the same last terminal
   operation.
2. That last terminal operation's record carries the SERVICES-partition (index, term) of its inventory
   write, and the guard passes it as the floor of its SERVICES read. A SERVICES leader that has applied past
   that index holds every inventory effect the ledger ever admitted for the partition; one that has not is
   refused by the floor, deposed or not.
3. Inventory changes that do not pass through the ledger (registration after restart, failure and cleanup
   retirement) stay outside this fence: they must either go through the ledger or be treated as hints by
   the guard.
A conditional write on the ledger alone does not revalidate a SERVICES predicate; items 1 and 2 together do,
for ledger-driven changes.

## Author claims I could not confirm
- raft-0.7.0 `raft.rs` 1227-1232 and 2077: the tree vendors only `lib.rs`, `raft_log.rs`, `raw_node.rs`; my
  agreement on the pending-index behaviour is from knowledge of the crate.
- "Read in the same synchronous step as one core observation" and "role and indices from the core's current
  state": contradicted (F1, F2).
- "m01 killed by witnesses 2+3": contradicted by the retained run (F10).
- The change cone and m03, m05, m07-m11: not run when I read the directories.
- "Worktree clean, pushed": not checked (the branch ref resolves to ee58d307f).
- "76 leaf assertions, 59 pass, 17 fail" at base: retained output says 83 assertions.
- Whether the default reader always carries a deadline: `buildControlPlaneQueryOptions` resolves one; I did
  not read `resolveControlPlaneQueryTimeoutMs`.
