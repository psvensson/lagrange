# Verdict r5: raft-rs-single-path-partition-cutover (attempts A1-A11 integrated, landing round)

Head verified: 48ec6f3d64f53471470570ee02623c3900097141 (worktree
/mnt/data/peter/projects/lagrange/.claude/worktrees/raft-rs-write-path). `git status --short` at my start:
` M solve/quests/raft-rs-single-path-partition-cutover/log.ndjson`, `?? .../verification-round-3.md`,
`?? .../verification-round-4.md`. During the round a fourth entry appeared:
` M solve/quests/raft-rs-single-path-partition-cutover/evidence/receipt.json` (mtime 16:40:08 local, content
`status: fail -> pass, generatedAt 2026-09-23T14:40:08Z`): that is the probe's receipt written by the lead's
`solve probe` before my first static run (16:54); no script of mine references that path and I changed no
repository file and ran no git write command. The previous head c203c85dc was exercised from a read-only
`git archive` copy under scratchpad/verify/r5/prev-head (node_modules symlinked; the six A11 test files copied
in for the controlled negative; removed after this report). The sealed-head archive scratchpad/verify/sealed-head
(19507fb7f tree) served the sealed receipts' red control. Every scratch script lives under scratchpad/verify/r5/
(round-1..4 scripts re-run in place from their own directories with outputs written into r5/), each under
`timeout`; `pgrep` at the end: 0 children of mine; no temp directory of mine survives. Thermal gate
`scripts/checks/wait-for-thermal-headroom.js` before the receipts ("headroom OK (cpu 48C, nvme 67.85C)") and
before the suite batch ("headroom OK (cpu 43C ...)"); the batch ran at `--test-concurrency=2`; another
verifier's cone (`run-classified-test-files.js --keep-going`, `run-test-files.js --jobs=2` on the main checkout)
ran concurrently for part of the round.

## Verdict: APPROVE

No item blocks. The six A11 corrections (F-aa, F-z, F-ae, F-af, F-ag, F-ad) hold under fresh adversarial
measurement on this head, each with a controlled negative on c203c85dc red at the named behavioural assertion;
the six sealed receipts are 6/6 on the head and 0/6 on the sealed head for the census reasons; the
374-file suite batch (the implementer's 236 files + round 4's 86 + the 46 touched tests + the 131 test/scripts suites) is 8279 tests / 8240 pass / 8 fail / 31 skipped in 225 s, where all 8 reds are the four rows of test/scripts/run-test-files.test.js and test/scripts/test-timeout-declarations.test.js - files outside the change set that spawn `scripts/run-test-files.js` fixtures and report `no assertions executed / test process exited 1` under a bare nested `node --test` (my invocation), while through the repository's own runner (`node scripts/run-test-files.js --jobs=1 <both files>`) they pass 53/53 (r5/rerun-scripts-via-runner.out, exit 0); every file in the change set is green; every static gate and ratchet is green (complexity 1814/1814, cognitive 159/159 after the ratchet
commit, file size 27/27 + 21/21, unused exports 1437/1437, metadata current at 2162, impact registry PASS 39/16,
quest log append-only clean, eslint on the 106 changed js files clean, boundary audit violations=0). The
round-1..4 scratch attacks re-run on this head differ from round 4 only by the A11 shapes (typed codes and the
recovery text, the new `runtimeGeneration` field, and the time-decided hold). Four new findings are recorded
below; none drops an acknowledged obligation, acknowledges an unapplied write, grows a durable log, or touches
another group. Two of them (F-ah, F-aj) deserve the lead's explicit weighing before landing because they are
severe in their own owners: a store read failure during reconstruction escapes as an uncaught exception on the
port's tick timer (F-ah, runtime owner, not A11-introduced, recorded under the record-not-absorb constraint),
and the query executor's reroute of a released write carries no entryId, so a write honestly answered
`partition_write_outcome_unknown` is applied a second time when rerouted (F-aj, query executor; pre-existing
because the old "No leader available" release text was rerouted by the same four consumers - the A11 diff
replaced `includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE)` with `isReroutableWriteError` at each site - so A11
does not change reachability; by the lead's own criterion "can now be applied twice" it is not a regression).

### Blocking

None.

## Round-5 specifics, item by item (the lead's list), with fresh evidence

1. F-aa (time-decided persisting failure; bound ceil(span/window)+1 for every class). Mechanism read at
   src/raft/raft-rs-runtime-owner.js:216-248 (`failurePersists` = `now - heldAt < window`; `groupFailed`
   renews the record when persisting, else `freshRecovery` with `retryNotBefore = now`), :522-546
   (`reconstructGroup` sets `heldAt = attemptedAt`, `attempts + 1`), :491-511 (`settleReconstruction` keeps the
   record on success with `heldAt = now`), :550-555 (`forgetExpiredRecovery`, clock read only with a record),
   :559-571 (`ensureExecution`). Structural argument: `attempts` increments only after `insideRetryWindow` is
   false; a persisting failure sets `retryNotBefore = now + window`; a fresh record is possible only when
   `now - heldAt >= window`; hence consecutive reconstruction starts are >= window apart, so over any span S
   at most floor(S/window)+1 <= ceil(S/window)+1 (the stated bound is true, slightly loose). Measured:
   - r5-aa1.out (exit 0), lone leader, alternating classes on one group at a 1000 ms window: persistence
     (fresh, reconstructed at once at 7 ms) -> apply at 328 ms inside the window (held, `attempts 1`, `phase
     application`, `durableProgress observed 4/3`) -> after the window the re-applied entry fails inside the
     drain (held, `attempts 2`, `retryAfterMs 973`) -> healed at 2346 ms (rows b0,b1: the committed entry
     applied once) -> persistence failure inside that window (held, `attempts 3`, `phase ready-persistence`,
     `dp 5/5`) -> after the window reconstructed -> a whole quiet window -> persistence failure fresh
     (reconstructed at once, then held with `attempts 1`). `createNodes 6`, `bound 7` for `spanMs 5590`,
     create_node instants [7, 1339, 2346, 3408, 4539, 5555] (every gap >= 1000 ms); sibling `+0 term/entries/gen`;
     the broken group's own cost is +1 term and +1 empty entry per reconstruction (sole-voter re-campaign,
     `term 6, entries 9`), as round 4 noted.
   - r5-aa2.out (exit 0), lone leader, oversized proposals at 20/s for 3040 ms: `clientCalls 60`,
     `createNodes 3 <= bound 5`, `termGrowth 3`, `logGrowth 3`, no acknowledgement, codes
     `consensus_host_failure 4 / consensus_recovery_required 56`, `retryAfterMs` 39..950; sibling +0;
     heal-to-first-success 42 ms (round 4: 38 reconstructions for the same load).
   - r5-aa3.out (exit 0), the clock source: a partition on a `VirtualTimeSource` (production option
     `timeSource`, `providedTimeSource === clock`, plumbed through `hostedConsensusSubstrate` ->
     `resolveTimeSource(request[SUBSTRATE])` -> `request.timers` -> `group.timers`): held with
     `retryAfterMs 1000` exactly; a 1200 ms wall-clock sleep leaves it at 1000 (the record never reads
     Date.now); `advance(window-1)` -> 1; `advance(1)` -> reconstructed. Window edge: a failure exactly
     `window` after the last held instant is FRESH (reconstructed at once, `<` at :218); at `window-1` it
     persists (`attempts 2`). `durableProgress` equals the independent record (commit 3 / applied 3).
   - r4-c2b.out re-run (exit 0), the round-4 shape (three replicas, follower store full, leader serving 60 KB
     writes for 2 s, production jitter window 2660 ms): `followerReconstructions 1` (round 4: 28),
     `reconstructionsPerSecond 0.5`, `followerAnnouncementsEmitted 3` (55), `attemptsSeen [1]`,
     `retryAfterPositiveSeen [true]`, leader `term 1 gen 1`, `leaderWritesServed 496`; catch-up after the heal
     1415 ms (round 4: 730 ms: the post-heal cost is one window, see F-al). Leader apply-class failure:
     `attempts 19` over 3095 ms at a 160 ms window (bound 21), failover at 3.1 s (F-ac unchanged).
   - r4-c1.out re-run (exit 0): 10 attempts / 10 s at both test-default and production timing (bound 11),
     deferred election 2 (only my reads drive it); the failure-class change (apply healed, then an oversized
     append inside the window) is now HELD with the record carrying the latest class and accumulated attempts
     (`ready-persistence/database or disk is full`, `attempts 11`; round 4: reconstructed at once,
     `attempts null`): the mixed record round 4 could not observe.
   - r4-s1-heal.mjs re-run apply/persist (exit 0): heal-to-first-write 1006/1002 ms (apply), 1/1017 ms
     (persist), typed codes throughout; the second cycle's failure inside the window of the previous success
     accumulates (`attempts 2`).
   - r4-c2.out re-run: `followerAttempts 6` over an outage of ~15.3 s (the script's `waitFor` for the literal
     'host-failure' never matches and spends its 10 s budget, then samples 2 x window) at a 2660 ms window,
     bound 7; leader term/gen untouched; catch-up 954 ms.
   - The tuning comment (src/raft/raft-rs-runtime-tuning.js:40-49) and the impact-contract sentence
     (test/shards/impact-contracts.json `raft-rs-runtime-application-transaction`) state exactly the proven
     bound and the fresh-after-a-window rule; `forgetExpiredRecovery` under a session is reached only through
     READ_STATUS (`perform` :1112-1120 answers every other command before `ensureExecution`), reads the clock
     only with a record, and enters no core (r5-af `coreEntriesForGroup 0`).
2. F-z (one release path; PROPOSED -> outcome-unknown, QUEUED -> not-leader). Mechanism:
   src/partition/proposal-queue.js:94-119 (`enqueue` marks QUEUED, `markProposal` false once released),
   :180-208 (`release(answerOf)`, `clear` delegates to it), partition-write-kernel.js:205-219
   (`buildReleasedPendingWriteAnswer`), partition-service-raft-lifecycle-wiring.js:32-33,70,81 (both demotion
   sites call one `releasePendingWrites`), partition-service-raft-write-commit.js:40-59 (`markProposal(PROPOSED)`
   before `propose`, back to QUEUED on the user-transaction deferral), :99-108 (`unansweredWriteResult`
   precedence: port refusal, release answer, failure).
   - r4-g.out re-run (exit 0): A `partition_write_outcome_unknown` with `entryId e-A` (no logIndex: the
     release happens before any commit, honestly absent), B `partition_write_consensus_host_failure` with
     `consensus {reason, phase ready-persistence, retryable true}`; `aOnLeaderDisk true`, after the heal
     `aLandedAnywhere true` on all three replicas, a same-entryId retry `idempotentReplay true`.
   - r5-z2.out (exit 0), a write released while its proposal is in flight (marked PROPOSED, queued behind a
     busy tail; a higher-term heartbeat stepped ahead of it demotes the leader): A and the earlier W0 are both
     answered `outcome_unknown` with their entryIds; A's propose then enters the core on a follower
     (`aProposedToCore true`) whose leader is the unreserved foreign peer, so raft-rs forwards it into the void
     (`aOnOldLeaderDisk false`, `aLandedAnywhere false`); W0 (replicated before the demotion) lands on all
     three; a retry of A with its entryId is applied once (`rowACount 1`). The answer is honest for both.
   - r5-g2-dup.out (exit 0), reroute after an honest unknown: see F-aj (measured double application without an
     entryId; idempotent with one).
   - r5-g2-shutdown.out (exit 0): a PROPOSED write on the leader's disk at `shutdown()` is answered
     `{success:false, error:'Partition service shutdown', partitionId}` - untyped, no entryId, no failureCode
     (`clear(reason)`, src/partition/partition-service-lifecycle-methods.js:147); in-bar for the same owner and
     the same R07 decision, minor (F-ak).
   - The A11 witness for the QUEUED release (partition-service-write-commit.test.js "answers a queued write
     released on demotion NOT_LEADER and never proposes it afterwards") runs on the controllable port (a role
     change cannot happen while a session holds the connection on the production runtime, as the test says);
     `proposals.length` unchanged after the release is the "never proposed afterwards" claim. Note that a write
     already handed to `raft.propose` (PROPOSED) can still enter the core after the release (r5-z2): that is
     exactly why PROPOSED is answered unknown, so the claim holds for the QUEUED state it is made about.
   - One text owner: `grep` (r5 consumer grep) shows the old text produced only for NOT_LEADER
     (partition-write-kernel.js:179, :211), the transport handlers' "not leader here" answers
     (partition-service-entry-apply-base.js:712,827, merge-replication-methods.js:219, write-metrics-base.js:487,556)
     and the query executor's own routing (`query-executor-partition-delivery.js:192,219`); the recovery case is
     built only by `recoveryRefusalMessage` (:162-167); the four consumers classify through
     `isReroutableWriteError` / `REROUTABLE_WRITE_ERROR_FRAGMENTS` (src/constants/errors.js:23-44). Test
     consumers of the old text (nine files) test the query executor's routing, not the recovery case.
3. F-ae (recovery refusal text; host failures typed). r4-s1 apply re-run: `writeDuringOutage error
   "Consensus recovery in progress on this replica: recovery-deferred (phase application); retry after 999 ms"`,
   `failureCode partition_write_consensus_recovery_required`; rerun-r2-s3b-full-apply/iterator: the post-heal
   in-window refusal carries the same text (round 4: "No leader available"); r5-ae.out and r5-g2/z2: the
   remaining write-result shapes with `failureCode null` on the write path are (a) the pending-commit deadline
   (30 s, r5-g2-timeout.out), (b) the shutdown release (r5-g2-shutdown.out), (c) backpressure
   (`"Proposal queue at capacity — backpressure applied"`, r5-ae and r5-g2-backpressure), (d) the deferral-budget
   expiry (typed by `deferRetry: true`, r5-ae `afterMs 2000`), (e) a CORE_REFUSED/CORE_FATAL proposal
   (`buildPartitionWriteProposalRefusal` :227-229 -> `buildPartitionWriteFailureResult`, by code reading; the
   ProposalDropped case needs a leaderless follower, which I could not stage because raft-rs forwards to the
   announced leader instead). STATEMENT_FAILED carries the SQLite code (`SQLITE_CONSTRAINT_PRIMARYKEY`) with
   logIndex and witness. Recorded as F-ak; none is a wrong acknowledgement.
4. F-af (`user-transaction-open` with the poll interval). r4-e2.out re-run: reads
   `HOST_FAILURE/user-transaction-open/a1`, write `partition_write_consensus_session_open`,
   `consensusReason user-transaction-open`, `coreEntriesForGroupInSession 0`, `recordUnchanged true`, after
   ROLLBACK `CORE_OK/leader` and the write lands. r5-af.out (exit 0), a caller retrying on `retryAfterMs`
   across a 5008 ms session: `calls 388 <= 501` (session / 10 ms), `retryAfterSeen [999, 10]` (the first refusal
   is the window's, every later one the poll interval's), `coreEntriesForGroup 0`, `recordUnchanged true`,
   `readShapes` synchronous objects only; after ROLLBACK the first read reconstructs and the write lands.
5. F-ag (recovery status fields). r5-aa3 `durableProgress {observed, 3, 3}` equals the independent record;
   r5-aa1 `dp observed:4/3` names the committed-but-unapplied entry while held; `readDurableProgress`
   (src/raft/raft-rs-durable-store.js:333-352) is two lookups, never the log; `groupId`, `replicaIdentity`,
   `peerId`, `runtimeGeneration` present (r4-c2b `gens [1,1,1]`, round 4 `[null,1,1]`). UNREADABLE: reachable
   only when the record cannot be read at all, which on this head also escapes as a throw before the next
   status is built (F-ah) - so UNREADABLE is unobservable in practice; the witness reads the fields directly:
   `grep '??'` in partition-runtime-reconstruction-leadership.test.js hits only a record-reader helper (:192)
   and two message strings (:611, :946), no assertion fallback.
6. F-ad (entryId). r5-ad.out (exit 0): direct and FORWARD_WRITE alike: number / '' / object ->
   `partition_write_entry_id_invalid`, `entriesAdded 0`, no outcome row; null and absent -> minted and applied;
   'client-1' kept end to end (retry `idempotentReplay true`); r4-b5 re-run agrees. `executeTransactionWrite`
   keeps a supplied invalid id as-is (write-metrics-base.js:107 `options.entryId || null`): the session with
   `entryId: 42` stages and commits (`rowPresent 1`), and the TRANSACTION_COMMIT marker carries
   `operations[].entryId = 42` into the durable log (`lastEntries ... ops:[42]`); nothing keys by it today
   (`grep entryId` in partition-service-transaction-base.js: none; outcome rows unchanged) - recorded as F-ai.
   The guard at partition-service-cdc-stream-base.js:262-263 (`Promise.reject(NO_LEADER_AVAILABLE_FOR_WRITE)`
   for a non-string entryId) is reachable only by a direct call (`directGuard` in r5-ad): the write path
   refuses ENTRY_ID_INVALID before `startPartitionRaftWriteCommit`; in-bar residue of the same owner file,
   minor: the text is a lie for the state it guards; delete it or type it (`rejectCommittedWrite` :341-343 keeps
   the same non-string guard).
7. Suites and receipts. Receipts (r5/receipts-head.tap) 6 pass / 0 fail, exit 0, 8.4 s; sealed-head archive
   (r5/receipts-sealed.tap) 0 pass / 6 fail, exit 1, with the census reasons ("135/135 system partition
   replicas ... lacks the rs-raft runtime fields", "naming \"liferaft\" constructed and initialized a partition",
   `durable logs after 3 acknowledged writes: {"rsRaftPayloadEntries":0,"legacyLogRows":{"_raft_log":3}}`,
   "after restart: commitIndex=0", the legacy-state db initialized). Suite batch: r5/suites-r5.tap, exit 1 from the 8 artefact rows only: 8279 tests, 8240 pass, 8 fail (test/scripts/run-test-files.test.js rows 2467/2471 and test/scripts/test-timeout-declarations.test.js rows 2619/2620, outside the change set, green 53/53 through `scripts/run-test-files.js`: r5/rerun-scripts-via-runner.out), 0 cancelled, 31 skipped, 224.9 s; incl. the six A11 witnesses, W-B6-1..5, the boundary witness, dt-movielens*, dt6*, test/transaction/*. Static:
   r5/static-r5.out, every check exit 0 (complexity 1814/1814, cognitive 159/159 - the ratchet commit's
   `BASELINE_COUNT = 159` at scripts/check-cognitive-complexity.js:36, file size 27/27 and 21/21 with no hint,
   no-legacy-naming clean, curated shards current, primary/resource/subsystem `--check` 2162, impact registry
   PASS 39 contracts / 16 pairs, quest-log append-only clean, boundary audit exit 0 and r2/audit-runner
   `violations=0`, eslint on 106 changed files 0 lines). Controlled negative (r5/a11-witnesses-prev-head.tap,
   c203c85dc + the six A11 test files): 144 pass / 26 fail, exit 1, red at the named assertions: F-aa (35 sub
   1/2/4: reconstructions > bound, no held status, no fresh record; 36 sub 1/3; 37), F-z (38 sub 1/2:
   `OUTCOME_UNKNOWN` vs "No leader available", B untyped; 43 sub 7/8; 50 sub 2-4 by a 500 ms timeout at the
   named comparison), F-ae (28 "the answer carries the environmental failure code", 29/30 "names consensus
   recovery ... not a missing leader (No leader available for write operation)", 36 sub 3, 57 sub 1), F-ag (31
   "the recovery status carries the runtime generation" expected 1), F-ad (25), F-af (39 expected
   'user-transaction-open'). Non-proof reds, noted: `Cannot read properties of undefined (reading 'PROPOSED')`
   (5 sub 2, 57 sub 2: the constant does not exist on the old head) and 40 (the transition-evidence stub renamed
   `clearPendingCommittedWrites` -> `releasePendingCommittedWrites`); the behavioural reds above carry the proof.
8. Still-open list and new findings: below.

## Attack surface, items 1-10 (this head)

1. Old-backend fallback: rerun-s8-closure identical to round 4 up to listing order (627-module closure, no
   legacy basename, no non-literal dynamic import); rerun-r2-s12-selection identical (every `raftBackend` /
   `raftProvider` spelling `partition_consensus_backend_selection_refused`; env/nested/uppercase and an
   options-supplied `createOperationPort` ignored); rerun-s2-durable-logs: `_raft_log`/`_raft_state` null at
   every step, one payload entry per proposal, restart serves (unchanged).
2. Alternate constructor/test seam: as above; partition-construction-seam in the batch.
3. Raw core reachability: twelve operations (raft-operation-port.js `RAFT_OPERATION_PORT_METHODS` unchanged in
   the A11 diff); audit violations=0; rerun-r2-audit-mutants identical (M3/M6/M8 undetected: F-s open).
4. Stale durable-state reuse / second log: rerun-s1-detector identical (13 cases; F-k edges, F-u residue open);
   no `_raft_log` row anywhere (s2); B6's healthy-group log growth stays 0 (r4-c1 sibling `entries 2->2`).
5. Test stand-in: the A11 witnesses run production PartitionService on file dbs with real `max_page_count`
   injection and the production admission fixture; reconstructions are counted at the runtime owner's core-entry
   observer (`create_node`), the window is asked of the tuning owner, statuses are the port's, records the
   store owner's reader on an independent connection. The QUEUED-release witness uses the controllable port
   for the port's own deferral answer (stated in the test; the production runtime cannot produce a role change
   during a session). The CDC and kernel unit witnesses take their inputs from the kernel's builders (the
   producer), not literals.
6. Acknowledgement: rerun-r2-s3-ack identical (ack after the applied transaction; same-entryId retries answered
   from the row in process and after restart; CDC once); nothing acknowledged during any outage (r5-aa2
   `anyAcknowledged false`; r4-s1 `rowB2 0`); a released write is never acknowledged (r4-g, r5-z2, r5-g2).
7. Session isolation layer 1: rerun-s4-session identical (tick/campaign/probe typed `user-transaction-open`;
   `readStatus` `CORE_OK` without draining; markers after COMMIT/ROLLBACK; F-d peer identity still erased;
   the 2 s deferral budget F-j); r5-af and r4-e2 above; rerun-s5b-demotion: new leader at round 16 (~160 ms in
   the harness; round 4: 44) - F13 as designed, a finding not a rejection.
8. readStatus synchrony: rerun-s6-readstatus identical (busy queue, follower, user transaction, closed, retired:
   all `sync`); r4-e re-run: inside-announcement, busy RECOVERY_REQUIRED (531 samples, `promises 0, throws 0`),
   closed-failed group all synchronous. NEW: a group whose durable record cannot be read THROWS from
   `readStatus()` (F-ah).
9. Runtime failure isolation: rerun-r2-s10-delivery: per-peer delivery failures isolated, `leaderDuring gen 1`,
   `leaderAfterFollowerOp gen 1 usable`; the follower's persistence failure is now HELD for a window
   (`followerStatus HOST_FAILURE`, `followerTick recovery-deferred`), so the script's short post-heal budget
   reports `followerRecoveredAfterHeal false` (round 4: true; the cost is F-al, the follower does catch up after
   its window: r4-c2b `caughtUp true` in 1415 ms); only a core trap replaces the runtime (W-B6-5 in the batch).
   NEW: an unreadable durable record during reconstruction is not isolated (F-ah).
10. Recovery/replay: r5-aa1 `dp 4/3` while held then rows b0,b1 after (the committed gap re-delivered once);
    rerun-s7 identical (HLC warm-up; F-a prepared state lost across restart); r4-b5 restart refusal typed with
    `dbReleased true`.

## Findings (new this round), grouped by category

recovery-replay / runtime isolation (in-bar mechanism, recorded for the runtime owner under the quest's
record-not-absorb constraint "runtime blast radius"):
- F-ah. A store read failure inside a reconstruction escapes as a raw exception. `createNodeArguments`
  (src/raft/raft-rs-runtime-owner.js:336-358) calls `group.store.readDurableRecord` twice with no
  host-failure containment; a throw propagates through `reconstructGroup` -> `ensureExecution` -> `perform` ->
  `enqueue` -> `lifecycle.execute` (src/raft/raft-rs-replica-lifecycle-owner.js:98-113 rethrows) to the port's
  caller. Measured, r5-ag.out (exit 0; the first run of the script died): a held lone leader whose
  `_raft_rs_applied_state` table is dropped on its own connection answers typed inside the window
  (`HOST_FAILURE/recovery-deferred`, `dp observed 3/2`), then after the window `readStatus()` THROWS
  `no such table: _raft_rs_applied_state`, `applyWrite` THROWS (no result object), `tick()` THROWS, and the
  port's scheduled tick raises an UNCAUGHT exception every 20 ms (`uncaughtDuringWindowWait 3`, 18 before
  shutdown) - process-fatal without a handler. The injection is a DROP TABLE, but a real SQLITE_IOERR or
  SQLITE_CORRUPT on read takes the same site. Not A11-introduced (the lines are A10's, unchanged by fbfc5631e);
  a corrupt or unreadable record on one of 135 partitions would take the node down. Owner: the runtime owner's
  reconstruction: contain the record read in `openGroupInCurrentRuntime` as a typed host failure of a restore
  phase so the group stays held and every entry point answers typed; a witness that drops/corrupts the record.
  Not blocking the sealed statement (no production write path produces an unreadable rs-raft record; init on
  such a db fails as a thrown error rather than a hang).

owner-interaction / R14 (out-of-bar: the query executor's reroute owner, src/query untouched by the quest
except the fragment consumer; recorded because F-z's honest answer makes it load-bearing):
- F-aj. A rerouted write without an entryId is applied twice. r5-g2-dup.out (exit 0), three replicas: A1
  `UPDATE v_rows SET value = value || '+' WHERE id='row-0'` and A2 `INSERT row-A`, both pending on a leader
  whose outgoing is dropped, released `partition_write_outcome_unknown` (with entryIds) when B's persistence
  fails; after the heal both commit on all three replicas (`row0Value "v+"`, `rowAEverywhere true`). The
  reroute the query executor performs - the same statement re-sent to the current leader with no entryId
  (`grep entryId src/query`: only the distributed coordinator mints one; `buildPartitionWriteEntry` mints a
  fresh UUID for an absent id, partition-write-kernel.js:57-59) - is applied again: `row0ValueNow "v++"` on all
  three (`doubleApplied true`); the INSERT is answered `SQLITE_CONSTRAINT_PRIMARYKEY` (success false) although
  row-A exists. A retry WITH the entryId is idempotent (`replayOfLogIndex`, `idempotentReplay`). Pre-existing:
  the old release text was rerouted by the same consumers (the A11 diff at
  src/query/query-executor-write-retry-routing.js:394, src/cdc/cdc-routed-mutation-readiness.js:687,
  src/cdc/cdc-integration-service-shared-constants.js:45,
  src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:244,386 replaced
  `includes(NO_LEADER_AVAILABLE_FOR_WRITE)`), so A11 changes the text, not the reroute. By the lead's
  criterion ("can NOW be applied twice") not a blocker; by R14 a defect of the reroute owner: a rerouted write
  must carry the original entryId (or the executor must derive a deterministic one per statement attempt).

admission-gating / R07 (in-bar-adjacent, write-path owner; the F-z class at the other two releases):
- F-ak. Untyped answers of writes this replica did not take: (a) the pending-commit deadline: r5-g2-timeout.out
  (exit 0), a leader whose transport is dropped in both directions keeps `CORE_OK/leader` for the whole 30 s
  (`RAFT_RS_GROUP_TUNING.CHECK_QUORUM false`, src/raft/raft-rs-group-constants.js:17) and answers the PROPOSED
  write at 30000 ms `{success:false, error:"Raft write commit timed out after 30000ms", partitionId}` -
  `failureCode null`, no entryId - while its entry is on the leader's disk and may commit when the partition
  heals; not in `REROUTABLE_WRITE_ERROR_FRAGMENTS`, so a router treats it as a hard failure (or the query
  executor retries without an entryId, F-aj). (b) the shutdown release (above). (c) backpressure
  (`proposal-queue.js:98-100` -> `waitForCommittedWrite` throw -> `buildPartitionWriteFailureResult`), no
  router retries that text (grep: no consumer). (d) CORE_REFUSED/CORE_FATAL proposals (code reading). The
  no-role release the lead scoped for F-z is typed; these are the same R07 gap at the deadline, shutdown and
  refusal paths. Not blocking: no acknowledgement is wrong.

admission-gating (minor, in-bar-adjacent, transaction owner):
- F-ai. The transaction owner stages a supplied invalid entryId unvalidated (`options.entryId || null`,
  write-metrics-base.js:107) and the TRANSACTION_COMMIT marker carries it in `operations[].entryId` into the
  durable log (r5-ad `lastEntries ... ops:[42]`); nothing keys by it today (outcome rows unchanged; the apply
  records only the session outcome), but layer 2 (replicated operations) would inherit an id the admission
  owner refuses on the write path. Two owners, two rules for one field (R08).

by design, recorded as a cost (owner-interaction, in-bar):
- F-al. The post-heal latency of the time-decided hold: a group healed inside its window serves only after the
  window (heal-to-first-write 1002-1017 ms at a 1000 ms window, r4-s1; a follower under leader load catches up
  1415-1564 ms after the heal at the 2660 ms production-jitter window, r4-c2b, versus 730 ms in round 4), and a
  lone leader's every reconstruction still costs +1 term and +1 empty entry. Neither the tuning comment nor the
  contract sentence names the latency; state it where the bound is stated.

out-of-bar hygiene, noted:
- `hostedConsensusSubstrate` (src/partition/partition-service-raft-init-base.js:99-101) still says "hands to
  liferaft"; pre-existing (blame 3f953614a, not in the branch diff); "liferaft" appears in comments of five
  partition files (grep -li) under the no-legacy-naming guard.
- A deterministic statement failure (duplicate primary key) is logged at error level "Failed to apply committed
  entry" (r5-ae, r5-g2-dup, rerun-r3-s3): noise for a client error, pre-existing (A7.2).
- An isolated leader keeps leading indefinitely (no check_quorum): R5 election settings (F-ac class).

## Still-open findings from rounds 1-4, status with fresh evidence

- F-a prepared 2PC session lost across restart: open (rerun-s7-recovery identical to round 4, diff 0).
- F-b/F13 leader demotion under a long session: open, by design (rerun-s5b round 16 / ~160 ms; round 4: 44).
- F-d/F12 peer-identity reservation erased by a session ROLLBACK: open (rerun-s4 identical, diff 0).
- F-e/F10 db handle on a refused init: the campaign-refusal path releases it (r4-b5 re-run `dbReleased true`);
  the warm-up undecodable-entry path still by code reading: open for that path.
- F-g S31 startup names the retired provider: open (`src/lagrange-runtime-startup.js` not in the branch diff,
  2 references to `ensureLiferaftProviderForRuntime`).
- F-j 2 s inner deferral budget: open (r5-ae `deferralBudgetExpiry afterMs 2000`, `deferRetry true`).
- F-k detector edges, F-u init-refusal DDL residue: open (rerun-s1 identical: `legacy-beside-rs-record
  tablesAddedByAttempt` non-empty).
- F-q stale-address REMOVE_PEER refused by shape: open (rerun-r2-s3c identical).
- F-r `_partition_statement_outcomes` growth: open; healthy-group `_raft_rs_log` growth 0 holds.
- F-s audit strength (M3/M6/M8): open (rerun-r2-audit-mutants identical).
- F-u, F-v (QUEUED counted current): open (files untouched for this).
- F-w self-attested leader identity in a replay answer: open (rerun-r3-s3 identical up to timestamps).
- F-ab deferred sole voter demoted by an unreserved sender never re-campaigns: open (r4-b-head re-run
  `deferred-higher-term calls 146, firstSuccessAfterMs null`); r5-z2 shows the same admission lets an unreserved
  "leader" swallow forwarded proposals.
- F-ac failover 2.7-5.3 s under production jitter: open (r4-c2b re-run 3095 ms).
- F-aa, F-z, F-ae, F-af, F-ag, F-ad: FIXED as measured above, with the residues F-ai/F-ak/F-al recorded.

## Templates

### admission-gating
1 Precheck-predicts-enforcement: the write path asks the admission owner before consensus
(write-metrics-base.js:670-678) with the entry the builder produced (:649-653: the supplied entryId kept, an
absent one minted), and the application applies exactly what was admitted (r5-ad: refused shapes add no entry
and no outcome row; admitted shapes apply once). The session path does not ask (F-ai). Leadership is read from
the port per decision (:693-699) and the kernel's refusal names the port's own reason and retry time (:173-199).
2 Transient vs terminal: `consensus_recovery_required` (retryAfterMs = the window's remainder) and
`consensus_session_open` (retryAfterMs = 10) are retryable and rerouted by text; `outcome_unknown` is rerouted
by text (retry idempotent only with the entryId: F-aj); `not_leader` rerouted; `consensus_host_failure`
carries `retryable` from the port and is not rerouted by text (the client decides); `entry_id_invalid` and
the other admission refusals terminal; the deadline/shutdown/backpressure answers untyped (F-ak).
3 Which budget governs: the retry window = one election timeout of the tuning owner (1000 ms test/production,
2660 ms under the fixture's production jitter); the admission poll 10 ms; the write deferral 2 s (F-j); the
pending-commit deadline 30 s (PENDING_REQUEST_TIMEOUT_MS); no budget raised.
4 Reason shape: recovery outcomes are objects with `reason/phase/failure/retryAfterMs/attempts/durableProgress`;
write results carry `failureCode` strings plus `consensus {reason, phase, retryAfterMs | retryable}`; released
answers carry `entryId` (+`logIndex` when known); the routers match texts through one owned list (errors.js).
5 Hold release: the heal + the next operation after `retryNotBefore` (1002-1017 ms measured); the session end
for the layer-1 deferral (r5-af after ROLLBACK the first read reconstructs); a whole quiet window clears the
record (r5-aa1 phase 6); no timer drives a deferred-election partition (r4-c1 deferred: 2 attempts).
6 Freshness: `group.timers.now()` per decision on the group's supplied clock (r5-aa3); `persistenceAdmitted` per
attempt; the durable record re-read per attempt.
7 Message honesty: the recovery text names the reason, phase and retry time (r4-s1); the released answers name
the state and the entry; the deadline/shutdown/backpressure texts do not (F-ak); the cdc-stream guard text lies
for its state but is unreachable from the write path (item 6).

### recovery-replay
1 Never clobber live with stale: `reconstructGroup` restores only the failing group; `replaceRuntime` only on a
core fatal (W-B6-5 in the batch); single-flight through the group's queue (r4-e busy queue 531 samples);
handles never reused (r4-d re-run identical).
2 Restart vs live discrimination: `hasDurableRecord` at open; a reconstruction restores as a restart would and
re-delivers the committed gap once (r5-aa1 `dp 4/3` -> rows b0,b1); the "same failure" discriminator is now
time (`failurePersists`), measured for both classes and across the class change (r4-c1 `attempts 11`).
3 Lost-enlistment refusal: F-a open.
4 Replay idempotence: the durable outcome row keyed by the client's entryId (r5-ad, r4-g, r5-g2 `replayOfLogIndex`);
a reroute without the id is not idempotent (F-aj); a rolled-back apply leaves no key.
5 Absence proves nothing: a released PROPOSED write is answered unknown, not failed (r4-g, r5-z2); the deadline
release still answers failure for an unknown outcome (F-ak).

### owner-interaction
1 Single owner: "does the failure persist" is decided by the runtime owner's record alone (time-decided); "what
became of my write" by the write kernel from the queue's own state; "which texts are rerouted" by the errors
owner's list; no consumer re-derives them (grep).
2 Typed boundary: `PROPOSAL_QUEUE_PROPOSAL_STATE`, `PARTITION_WRITE_LEADERSHIP_REFUSAL` (five codes),
`DURABLE_PROGRESS_OBSERVATION`, `RUNTIME_REASON.USER_TRANSACTION_OPEN` as a recovery reason,
`REROUTABLE_WRITE_ERROR_FRAGMENTS`; the release carries its answer on the rejection (`error.answer`); the
shutdown `clear` is a second interpretation of the release (F-ak b).
3 Paired invariants in one witness: the F-aa follower witness holds "reconstructed at most once per window" +
"held statuses count attempts with a positive retryAfterMs" + "the leader served every write and kept its
term/generation" + "catches up after the heal" + "a failure after a quiet window starts afresh" in one
deterministic witness with real injection, red on c203c85dc at sub-assertions 1/2/4; the F-z witness pairs A's
unknown answer with B's typed host failure and the idempotent retry, red at 1/2.
4 Stale-then-fresh: a record held across a class change carries the latest failure (r4-c1); a whole quiet
window clears it (r5-aa1, r5-aa3); a settled row answers a later retry after a release (r4-g).
5 Pressure/backoff: 20/s client retries cost 3 reconstructions in 3 s (r5-aa2); 388 in-session retries cost no
core entry (r5-af); the follower loop under leader load costs 1 reconstruction per 2 s (r4-c2b); repeated reads
never amplify (rerun-r3-s1b 0.0 ms).
6 Wake/release: the heal is observed by the next operation after the window; the session end by the next read;
the tick drives it on scheduled partitions, the caller on deferred ones.
7 Projection authority: `isLeader` follows the port (r4-b-head re-run); the recovery status is the port's typed
state with the durable record as an observation, never a claim.
8 Controlled negative: receipts 0/6 on the sealed head; the A11 witnesses 26 red on c203c85dc, the behavioural
ones at their named assertions (item 7 above); the implementer's mutants (a11/mutants.tap: 6 red at the
reroute-fragment and fresh-record assertions) are consistent with mine but I did not reproduce them.
9 No local escape hatch: no options-supplied port; one release path; one text list; no `??` fallback in the
witnesses; the shutdown `clear` and the deadline timer bypass the typed release answer (F-ak).
10 Contract + registry + proof aligned: impact-contracts.json's two descriptions changed with the mechanism
(the bound sentence and the release sentence), the graph seal and subsystem classes regenerated (`--check`
clean), registry PASS; the bound sentence is exactly what I measured.

### harness-fidelity
1 Red for the right reason: item 7 above (named assertions on c203c85dc; the two `PROPOSED` import-gap reds
and the stub-rename red are non-proofs and are not relied on).
2 Stub honesty: the F-aa/F-z/F-af/F-ad witnesses use no stub (real `max_page_count`, real dropped transport,
real sessions); the QUEUED-release witness's controllable port answers the port's own deferral shape
(`HOST_FAILURE / user-transaction-open / recoveryRequired false`), which rerun-s4 shows is the production shape.
3 Time fidelity: group witnesses heartbeat 20 / election 150-300 + production jitter 2500 per replica -> window
2660 ms for a follower, 160 ms for the leader in the failover shape; lone partitions 1000 ms; ordering
tick < heartbeat < window = election < jittered follower timeouts < budgets preserved; the client retry
interval (50 ms) and the leader write interval (25 ms) are well inside the window.
4 Field fidelity: entries carry entryId/proposedBy/proposedAt; the recovery status carries every field the
witness reads; released answers carry entryId.
5 Vacuous assertions: the bound assertions depend on the tuning owner's window being sane (measured 1000/2660
independently); the "held statuses" assertion needs at least one deferral (the load guarantees it); the F-ad
witness's `nothing entered consensus` compares whole records; the QUEUED witness's `proposals.length` is the
controllable port's count, which is the claim.
6 Live binding: receipt 1 is the live seed (6/6 on the head); the F-aa follower witness binds the live runtime
owner with real SQLITE_FULL under real leader load.

## Commands run (counts, exit codes)
- Static (r5/static-r5.out): check-complexity 1814/1814 exit 0; check-cognitive-complexity 159/159 exit 0;
  check-unused-exports 1437/1437 exit 0; check-file-size-thresholds 27/27 + 21/21 exit 0; check-no-legacy-naming
  exit 0; check-curated-test-shards exit 0; generate-test-{primary,resource,subsystem}-classes --check exit 0
  (2162); impact-contract-registry PASS 39/16 exit 0; check-quest-log-append-only exit 0;
  raft-rs-operation-boundary-audit exit 0 (silent on success); eslint on 106 changed js files exit 0 (0 lines);
  r2/audit-runner on the head `violations=0` exit 0.
- Receipts (r5/chain-r5.out): head 6 pass / 0 fail exit 0 (r5/receipts-head.tap); sealed-head archive 0 pass /
  6 fail exit 1 (r5/receipts-sealed.tap).
- Suites (r5/chain-r5.sh, thermal gate OK, `--test-concurrency=2`): 374 files (r5/suite-files-r5.txt): 8279 tests, 8240 pass, 8 fail (all in the two test/scripts runner suites, invocation artefact, green via the repository runner 53/53), 0 cancelled, 31 skipped, exit 1, 224.9 s (r5/suites-r5.tap); the two runner suites again via `node scripts/run-test-files.js --jobs=1` exit 0.
- A11 witnesses on the c203c85dc archive: 144 pass / 26 fail, exit 1 (r5/a11-witnesses-prev-head.tap).
- Scratch (r5/run-r5.out, all exit 0 after the r5-ag rewrite): r5-aa1-classes, r5-aa2-lone-storm 3000,
  r5-aa3-virtual-clock, r5-af-hotloop 5000, r5-ag-unreadable (v2), r5-ad-entryid, r5-ae-shapes,
  r5-g2-released dup/shutdown/backpressure/timeout, r5-z2-inflight.
- Round-4 re-runs on this head (r5/chain-r5.out, all exit 0): r4-s1-heal apply/persist, r4-b-demotion head,
  r4-b5-transport, r4-d-stale, r4-e-readstatus, r4-e2-session-hold, r4-g-released, r4-c2-follower,
  r4-c2b-follower-loop, r4-c1-attempts 10000.
- Rounds 1-3 re-runs (all exit 0): s1-detector, s2-durable-logs, s4-session, s6-readstatus, s7-recovery,
  s5b-demotion, s8-closure, s9-inert, r2-s3-ack, r2-s3b x3, r2-s3c-group, r2-s10-delivery, r2-s9-inert,
  r2-s12-selection, r2-audit-mutants, r3-s7-tick-storm, r3-s1-storm apply/persist, r3-s1b-scale, r3-s2-shapes,
  r3-s2b-poison, r3-s3-follower-retry, r3-s4-double, r3-s5-group-outage, r3-s6-resume-session; normalized diffs
  against the round-4 outputs differ only by timestamps/pids, the F-ae text, the F-ag `gen` field, the held
  follower in r2-s10 and s5b's round count.
- Hygiene: `git status --short` unchanged by me (the receipt.json entry is the lead's probe output);
  `pgrep` 0 children of mine; the prev-head archive removed after this report; one /tmp directory left by the first (crashed) r5-ag run (/tmp/r5ag1-*) was removed, nothing else of mine in /tmp.

## Not verified
- The whole corpus on this head (374 files run: the implementer's 236 + round 4's 86 + the touched 46 +
  test/scripts; no corpus run in this round).
- The CORE_REFUSED proposal answer shape (leaderless follower) by measurement: raft-rs forwarded the proposal
  to the announced (unreserved) leader instead, so only the code path is cited.
- UNREADABLE as a status value: unobservable on this head because the same read throws first (F-ah).
- The implementer's mutant controls (a11/mutants.tap) were not reproduced; my controlled negative is the
  c203c85dc archive.
- The query executor's reroute end to end through a node (F-aj was measured at the partition boundary with the
  reroute's shape - the same statement without an entryId - and the executor's minting by grep).
- Main debt sea-bundle-smoke and production-scheduling-defaults: out-of-bar, not run.
