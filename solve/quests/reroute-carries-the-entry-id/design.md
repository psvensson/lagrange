# Design F-aj: every reroute of a partition write carries the original entryId

Read-only design on worktree `.claude/worktrees/raft-rs-write-path` at fe70eb76e (R1 head, A13 pending after the
round-6 reject). All paths below are relative to that worktree; `probe-f-aj-envelope.out` beside this file is the
one node probe run (stubbed `this`, no service, no db). Baseline assumption to re-read at quest start (R25): A13
lands the lead's round-6 judgment (log.ndjson 16:40:59 finding) - `outcome_unknown` is never reroutable by TEXT,
the code predicate admits it only for a consumer that carries the entryId, and the control-plane classifier keys on
the errors owner's code predicate (B7). This quest is the src/query half that judgment names.

## 0. What the verifier measured, and what it actually shows

r5-g2-dup (verify/r6/r5-g2-released.mjs:49-53, output r5-g2-dup.out) re-sent the UPDATE/INSERT to the healed
leader through `applyWrite` with `entryId: undefined`; `buildPartitionWriteEntry` then mints a UUID
(src/partition/partition-write-kernel.js:121-123,130) so no outcome row matches (`getCommittedEntryKey`,
partition-service-cdc-stream-base.js:369-373 keys `entry:<entryId>`) and the statement runs again (`doubleApplied
true`; INSERT answered SQLITE_CONSTRAINT although row-A exists). With the id the retry is answered from the row
(`idempotentReplay`, write-metrics-base.js:693 -> :635-650; or at apply, entry-apply-base.js:1071-1075).
The premise "src/query carries none" is only half true. The executor's OWN reroute loop re-invokes one request
builder per candidate (query-executor-partition-delivery.js:301, :382) and that builder stamps
`executionOptions.entryId` (query-executor-partition-request-builders.js:81-82); the distributed write coordinator
mints that id once per plan participant as a digest of `{idempotencyKey, partitionId}`
(distributed-write-coordinator.js:548-577) and the partition's QUERY handler forwards it into `executeQuery`
(partition-service-entry-apply-base.js:660-668, :736-739; probe: `entryId forwarded = true`). The engine's
INSERT/UPDATE/DELETE all go through that coordinator (sql-query-engine-write-execution.js:231,400,568), and
test/query/write-path-internal-pacing.test.js:476-491 already witnesses one stable id across the in-call retry.
So the r5-g2-dup shape is NOT reachable from the executor's in-call reroute. It is reachable from every loop that
re-issues `executeQuery` (a fresh plan identity per call) and from the paths that send with no id at all (census
below), and - the load-bearing gap - the wire back to the executor drops every typed field of a write answer:
`handleRemoteQuery` returns an explicit field list (entry-apply-base.js:750-766); probe: an OUTCOME_UNKNOWN answer
loses `failureCode, consensus, entryId`; a BACKPRESSURE answer loses `failureCode, retryAfterMs, entryId`; a
replay loses `idempotentReplay, logIndex, replayOfLogIndex`. `grep failureCode src/query`: 0 hits. Hence the
executor is text-only by construction (query-executor-write-retry-routing.js:388-408: `isReroutableWriteError`
plus five transport texts; the only code it reads is ROUTER_CONNECTION_CLOSED), a replay reaches the client as
`success:true, changes:0` (partition-committed-statement-outcome.js:186-190; `affectedRows` sums `changes`,
rendering.js:353-356 - R07 misreport), and the client never sees the entryId the error text tells it to retry with
(errors.js:13-15). Post-A13, without this quest, the executor treats an honest unknown as a client-decided
failure, and every loop below that classified it retryable by text stops retrying it: system-table writes fail
terminally on each leadership-lost/deadline/shutdown release mid-proposal (the interim cost, R12).

## 1. Census: every reroute/retry site of a partition write

| # | Site (file:line) | Retries on | Carries the original entryId | Duplicate possible today |
| --- | --- | --- | --- | --- |
| S1 | Query executor delivery loop: outer attempts query-executor-partition-delivery.js:127, candidate loop :277-300, request rebuilt :301 and on leader redirect :382, admission `isLeaderUnavailable` at :480,:531,:624 and query-executor-partition-failure.js:42 | TEXT only: write-retry-routing.js:388-408 (`isReroutableWriteError` = errors.js:41-61 fragments, + message timeout / no handler / connection closed / no connection / failed to forward); code only for ROUTER_CONNECTION_CLOSED | YES when `executionOptions.entryId` is set: coordinator path (DWC :548-577 -> builders :81-82); split mirror (partition-split-routing.js:218-232 copies entryId/operationId/idempotencyKey). NO for the transaction ops path (sql-query-engine.js:539-575: custom `buildRequest`, no id; BEGIN/PREPARE/COMMIT/ROLLBACK, session-keyed - out of scope, S7) and migration-coordinator.js:595 (DDL migration, `executeMigrationAlterQuery`, no outcome row - out of scope) | No for the coordinator path (row answers the retry). Yes only via S7/S8 shapes |
| S2 | CDC routed system-table mutation loop: cdc-routed-mutation-readiness.js:529-670, per attempt `sqlQueryEngine.executeQuery(sql, params, queryOptions)` :579-583 | `shouldRetryRoutedSystemTableMutationFailure` :707 -> `isTransientCdcError` :684-704: classifier, code (inert: never on the wire), TEXT (`isReroutableWriteError` :695 + routing texts) | NO: `baseQueryOptions` :500-523 carries no identity; each attempt is a new `createWritePlan` -> new operationId -> new participant entryId (DWC :95-96, :563-575) | YES (r5-g2-dup shape: attempt 1 released unknown, commits after the heal, attempt 2 applies again) |
| S3 | CDC local system-table write: cdc-routed-mutation-readiness.js:100-165, `partitionService.executeQuery(sql, params)` :143, called from the loop :567 | code :149 (`isReroutableWriteFailureCode`, live here: the answer is held) or text -> `continue` to the next local service; `handled:false` then falls to S2 | NO: no options at all -> the partition mints a UUID per send (kernel :121-123) | YES (unknown on service A -> re-sent to B and then to S2 under fresh ids) |
| S4 | Rebalancer operation mutation retry: replica-operation-repository-mutation-gateway-methods.js:49-93 and :95-160, per attempt `controlPlaneSystemTableGateway.executeQuery` :59-63 (a new engine/CDC call each time) | `isRetryableOperationPersistError` :239-259: classifier, code (inert on the routed path), TEXT (`isReroutableWriteError` :249, fragments); route repair :382-400 | NO: `buildOperationMutationQueryOptions` :506-545 carries timeout, coalescingKey, deliverySource, session rotation, priority - no idempotencyKey/entryId | YES for content-dependent statements; the INSERT case was symptom-patched (UNIQUE collision read as already-applied, quest replica-operation-insert-retry-idempotency) - R04 says retire the patch with the owner fix |
| S5 | Control-plane "retry later" consumers of `isRetryableControlPlaneError` (54 files; e.g. operation-workflow-transition-retry.js:152, sql-query-engine.js:302-306, replica-dispatch-retry-scheduling.js:35) | classifier text/deferRetry/retryAfterMs (control-plane-error-classification.js:228-251, B7 -> A13) | NO: a retried operation re-issues its statements as new writes | Same class as S4; identity must be minted per logical mutation by the S4 options owner, not here |
| S6 | Partition-internal forward: FORWARD_WRITE from a follower to the leader, write-metrics-base.js:499-505 (`operation: entry`) | not a retry | YES (the built entry, id included) | No |
| S7 | Session writes: `executeTransactionWrite` write-metrics-base.js:193-230 stages with the entryId; the TRANSACTION_COMMIT marker carries `operations[].entryId` (F-ai residue) but outcome rows key only SQL commands (entry-apply-base.js:1063-1075 vs :1122-1147) | n/a | carried but unkeyed | Out of scope: transaction idempotency is the session/transaction owner's (`_transaction_outcomes`); record, do not absorb (R17) |
| S8 | The client-facing boundary: `SQLQueryEngine.executeQuery(sql, params, options)` sql-query-engine-statement-execution.js:348 documents only `sessionId`; `createWritePlan` receives `{sessionId}` / `{sessionId, partitionIds}` (write-execution.js:183-187, :348-355, :516-523) although the coordinator honours `options.idempotencyKey` (:96; pacing test :538-556) | the client's own re-issue | NO: a supplied key is dropped at the engine; and the entryId never reaches the client (wire) | YES by design for a keyless client; a keyed client cannot be idempotent today |

Text-only consumers of the fragment list today: S1 (:394), S2 (:695), S4 (:249,:398), the CDC handoff list
(cdc-integration-service-shared-constants.js:45 -> cdc-integration-service-shared.js:420-428), and the kernel test's
code/text parity clause (test/partition/partition-write-kernel.test.js:234-283, :302-381). After A13 the classifier
is a code consumer. F-w consumer: src/admin/admin-write-receipt.js:59-79 - `complete` requires a witness-bound
`durableCommitWitness` with `witness.leaderNodeId === acceptingNodeId`; a replay answer attests the ANSWERING
replica as leader (partition-committed-statement-outcome.js:192-199) while the original attests the proposer
(entry-apply-base.js:989-1003), so a follower-answered replay is "complete" under a false leader (round 3 F-w).

## 2. The contract (one owner mints, everyone carries, the row answers)

C1. Identity is minted once per logical write at the client-facing boundary. `SQLQueryEngine.executeQuery`
accepts `options.idempotencyKey` (and `operationId`) and passes them into `createWritePlan` at the three call
sites (:183, :348, :516); the coordinator keeps its one derivation (DWC :95-96, :563-575) so the participant
entryId is a pure function of (idempotencyKey, partitionId). A client without a key gets a fresh identity per
submission, as today (pacing test :508-520 stays green); a client with a key gets the same entryId on re-issue.
`createParticipantExecutionOptions` remains the only minting site; `resolveEntryId` in the kernel (:121-123)
stays as the last-resort mint for direct partition callers and is never reached by a routed write.
C2. Every downstream retry or reroute carries it unchanged: S1 already does (builders :81-82); S2 mints the key
once per `executeSQL` call outside the attempt loop and puts it in `baseQueryOptions` (:500-523); S3 passes the
same identity to `partitionService.executeQuery` (:143); S4 mints one key per `execute*MutationWithRetry` call in
`buildOperationMutationQueryOptions` (:506-545) - every attempt of one logical mutation shares it, a new call
does not; the S4 UNIQUE-collision patch is retired once its witness is red-on-revert only through the key.
C3. The partition answers a same-entryId retry from the durable outcome row - exists (write-metrics-base.js
:635-650, :693; apply :1071-1075). Two additions in the outcome owner: the row records `changes` so a replay
answers the original affected rows (today `changes: 0`, outcome.js:188-189), and the replay answer carries
`idempotentReplay`/`replayOfLogIndex` to the wire (C4). `_partition_statement_outcomes` DDL
(partition-committed-statement-outcome-constants.js:20-27) gains `changes INTEGER` (F-r growth unchanged).
C4. One canonical shape across the wire (R08): `handleRemoteQuery` (entry-apply-base.js:750-766) returns the
write answer's typed fields whole - `failureCode`, `entryId`, `consensus`, `retryAfterMs`, `deferRetry`,
`logIndex`, `idempotentReplay`, `replayOfLogIndex` - beside the fields it returns today; the executor's thrown
Error (rendering.js:277-291) carries `failureCode` and `entryId`; the coordinator's participant failure
(DWC :396-424) and the engine's summary keep them, so the classifier's linked-failure walk
(classification.js:189-207, :232-250) sees the code the kernel typed. No consumer re-derives it (R03).
C5. Reroute admission is the code predicate with carriesEntryId true, and nothing else, for a partition answer:
`isLeaderUnavailable` splits into (a) transport-owned predicates for failures that carry no partition answer
(no handler, message timeout, connection closed/reconnecting, failed to forward; unchanged texts of the transport
owner) and (b) `isReroutableWriteFailureCode(response.failureCode, {carriesEntryId: request.entryId present})`
(A13's shape) for a partition answer. Then `REROUTABLE_WRITE_ERROR_FRAGMENTS`/`isReroutableWriteError`
(errors.js:32-61,71) and their consumers (S1 :2,:394; S2 :2,:695; S4 :1,:249,:398; cdc shared-constants :2,:45;
kernel test parity) are deleted - only when the census of text-only consumers is zero, proven by W8. Texts that
are not write answers (`PARTITION_SERVICE_NOT_FOUND`, `NO_ACTIVE_SERVICE_FOR_PARTITION`, `QUERY_ROUTING_FAILED`)
belong to the routing owner and are out of scope. `retryAfterMs` of BACKPRESSURE now reaches
`resolveControlPlaneWriteRetryDecision` (delivery.js:490-495), closing the verifier's unmeasured item.
C6. F-w as an interaction, not a redesign: a replay's witness names the proposer's replica (`command.proposedBy`
is in the durable command, kernel :132-135) and marks itself a replay; the receipt owner (admin-write-receipt.js
:59-79) treats a replay as complete when witness-bound by (partitionId, entryId, term, logIndex) and
`idempotentReplay` is set, and never by `leaderNodeId === acceptingNodeId` alone. The proposer's node id is not
in the command; if the receipt needs it, that is the outcome owner's own follow-up (record).
Out of scope, recorded: S7 (session/transaction identity), the migration DDL path, routing-owner texts, B7 (A13).

## 3. Witness plan (red first), through a node: engine -> executor -> wire -> partition

Harness: `formAdmittedGroup` (test/partition/partition-admitted-group-fixture.js:40-118; three real replicas,
production admission, `services/dbFileOf/addressOf/waitFor/dispose`, `r1.transport` drop-able as in
r5-g2-released.mjs:29-31) in front of a real `QueryExecutor` + `SQLQueryEngine`/coordinator whose router delivers
to `service.handleRemoteQuery(message)` by address (the shape of write-path-internal-pacing.test.js:170-205,
:429-445). Every expectation is read from the replicas' databases, the outcome rows, and the answers; no literal
from the code under test. Releases are staged as the A11/A12 witnesses stage them (typed-releases test :184-251).
W1 r5-g2-dup through a node: A1 `UPDATE value = value || '+'` and A2 `INSERT row-A` submitted via
`sqlQueryEngine.executeQuery`, pending on a leader whose outgoing is dropped, released OUTCOME_UNKNOWN by B's
persistence failure, commit after the heal; expect: the executor reroutes with the same entryId (router log),
`doubleApplied false` (row-0 = 'v+' on all three), row-A once, both statements answered success with
`affectedRows 1` and `idempotentReplay true` visible at the engine. Red today: post-A13 the unknown is not rerouted
(client answered failure); pre-A13 rerouted but `affectedRows 0` and no replay flag (wire drops them).
W2 leadership-lost release (r4-g/r5-z2 shape): same harness, expect exactly-once and success; also the
in-flight A forwarded into the void (r5-z2) applies once through the retry.
W3 deadline release: controllable port + virtual clock (typed-releases :184-207) behind the executor; the client
budget shorter than 30 s: expect the client answered the typed unknown WITH its entryId and `consensus.reason
commit-deadline-exceeded`; a re-issue with the same idempotencyKey after the commit applies once (W5 shape).
W4 shutdown release: PROPOSED at `leader.shutdown()` (typed-releases :212-251), rerouted to a survivor, once.
W5 client-supplied key: `executeQuery(sql, params, {idempotencyKey: K})` twice -> one application, second answer
a replay with the original `affectedRows`; without K twice -> two applications (pacing :508-520 semantics). Red:
the engine drops K (write-execution.js:183-187).
W6 admin receipt on a replayed answer: a replay answered by a FOLLOWER (router pinned to a follower, the r3-s3
shape) -> receipt `complete` true only by entryId binding, and the witness names the proposer's replica, not the
follower. Red today: `complete true` with `leaderNodeId` = the follower (round 3/4 F-w outputs).
W7 backpressure through the wire: `proposalQueue.maxCapacity = 1` (r5-g2 backpressure mode) -> the executor's
retry decision sees `retryAfterMs 100` and waits it, then the write applies once. Red: retryAfterMs dropped.
W8 deletion census (static, in the kernel test): no `src` consumer of `REROUTABLE_WRITE_ERROR_FRAGMENTS`,
`isReroutableWriteError` or `isLeaderUnavailable`-by-fragment remains; every kernel answer carries `failureCode`
and, when the entry existed, `entryId`; the unused-exports ratchet is tightened, not raised.
Red-on-revert per C1..C5: revert the engine pass-through (W5 red), the wire (W1/W7 red), the S2/S3/S4 identity
(a per-loop variant of W1 red through `cdcIntegrationService.executeSQL` and the rebalancer gateway), the admission
(W1 red post-A13). Restart: W1's replay after a leader restart (partition-rs-raft-restart-fixture.js) answers from
the restored row. Not covered: S7, DDL migration, GCP timing.

## 4. Receipts and filing

Quest id `reroute-carries-the-entry-id` (no collision in solve/quests), class product, templates
admission-gating / recovery-replay / owner-interaction, one witness file
`test/query/write-identity-end-to-end.test.js` plus the kernel test's W8 clause, and one evidence producer in the
R1 style (scripts/quest-evidence/reroute-carries-the-entry-id.js -> `runQuestEvidenceHarness`, receipts by
`^name$` patterns, output `solve/quests/reroute-carries-the-entry-id/evidence/receipt.json`; probe `test-receipt`).
1. `rerouted-write-after-outcome-unknown-applies-once-and-answers-success` (W1; sealed-head red: not rerouted
   post-A13 / affectedRows 0 pre-A13).
2. `every-release-cause-reroutes-with-the-entry-id` (W2+W3+W4 as one test over the three causes; red: id absent
   from the client answer, deadline/shutdown re-issue applies twice via S2/S3).
3. `a-client-idempotency-key-makes-resubmission-idempotent` (W5; red: key dropped at the engine).
4. `write-answers-cross-the-wire-whole-and-reroute-admission-is-by-code` (W7 + W8; red: fields dropped, text
   consumers > 0).
5. `admin-receipt-binds-a-replayed-answer-by-entry-id` (W6; red: complete under a false leader).
Constraints to seal: no text fallback survives for a partition answer; identity minted at exactly one boundary
per path (engine; S2/S3/S4 per logical mutation); no budget raised (30 s deadline, CDC/rebalancer attempts);
S7/DDL/routing texts recorded not absorbed; the S4 UNIQUE-collision patch retired only red-on-revert; F-w handled
per C6; independent adversarial verification (attacks: a second minting site, a reroute without the id, a replay
that re-executes, a text consumer left behind, a stand-in router instead of `handleRemoteQuery`).
Epic: `raft-rs-full-cutover`, under R5 "proposal/apply/rollback semantics on current production path"
(solve/epics/raft-rs-full-cutover.md:299-313; authorizes src and test :12-22; the lead's round-6 judgment keeps
F-aj as "its src/query quest"). Not `core-architecture-convergence`: it is explicitly blocked until the cutover
epic closes and Q0 re-measures READY (core-architecture-convergence.md:76-79), so filing there parks the fix while
the interim cost of the A13 narrowing (section 0) is live. Sequence: after A13/R1 lands, before R2.
