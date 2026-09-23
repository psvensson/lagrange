# Verdict r1: reroute-carries-the-entry-id (attempt A1, head f4482c7e3)

Head verified: f4482c7e35b6cba3c8fc9599ec8d355f3ff71330 (worktree
/mnt/data/peter/projects/lagrange/.claude/worktrees/q-reroute). `git status --short` at start and end (unchanged by
me): ` M solve/quests/reroute-carries-the-entry-id/log.ndjson` (the lead's A1 attempt entry, an appended last line;
append-only clean). I edited no repository file and ran no git write command (git archive only, into scratch). Every
scratch script and output lives under scratchpad/verify-reroute/r1/ (paths below are relative to it), each run under
`timeout`; the sealed head 2ee6e0c4e is the archive r1/sealed-head (git archive + node_modules symlink), the head is
r1/head-archive for the per-clause reverts. Thermal gate before the receipts ("ok cpu 50C nvme 68C") and before the
suite batch ("ok cpu 51C"); the batch ran at `--test-concurrency=2` (load average 0.35 at start: the machine was
idle). `ps` at the end: 0 children of mine; no temp directory of mine survives.

## Verdict: REJECT (three blocking items; the five sealed receipts hold 5/5 on the head and 0/5 on the sealed head for the right reasons; the reroute-with-the-id, exactly-once and wire clauses hold under fresh measurement, including F-at through a real 3-replica group)

What holds (measured, not read): the coordinator's `deriveParticipantEntryId` is the one derivation and the engine
passes a client key into it (r1-replay-roles.out `entryIdIsTheDerivation true`; r1-cdc-lane.out
`derivationMatchesCoordinator true`, `entryIdSameAsLane true`); a same-entryId retry is answered from the outcome row
with the original affected rows by the proposer, by a follower's forward, by the new leader after the proposer's
shutdown and after a restart (r1-replay-roles.out `leaderWireReplay`, `followerDirectReplay`,
`newLeaderWireReplay`, `lone_restartReplay_direct`: `idempotentReplay true, changes 1, replayOfLogIndex 5`); the
replay's witness names the proposer's replica and node, never the answering replica (`newLeaderWireReplay.witness
leaderReplicaId r1-roles-r1, leaderNodeId node-1` answered by node-2); an unwitnessed replay (the log row at the
replay index gone, or the proposer's services row unknown) carries no witness and its receipt is NOT complete
(`unwitnessed_logRowGone`, `unwitnessed_proposerRowUnknown`: `witness null, receipt.complete false`); F-at through a
real group: the leader's own application fails SQLITE_FULL after the commit, it answers
`partition_committed_statement_environment_failed` WITH its entryId on the wire, the executor sends the write again
under that one entryId only (37 deliveries, every one `E`), the new leader answers the replay, the client is told
success/replay, and after the heal every replica holds exactly one application (r1-fat-env-failure.out
`fat_afterHeal applications [1,1,1]`, `fat_reissueAfterHeal applications [1,1,1]`); every typed field of a success
answer and of a NOT_LEADER refusal crosses handleRemoteQuery (`wire_success droppedOnTheWire []`,
`wire_refusalWhileHeld droppedOnTheWire []`; the sealed witness covers replay/backpressure/unknown); reroute admission
at the executor is by code with carriesEntryId (r1-classify.out `executorIsLeaderUnavailable`: unknown and
environmental only `withId`, host failure never, NO write text without a code, the four transport texts yes); the
classifier walks cause / participantFailures / participantResults / firstFailedParticipant for every kernel answer
(`classifier` table); red-on-revert per clause in a head archive (revert-clauses.out: wire 5 red, engine pass-through
W2+W5, receipt W6, outcome row W1+W5+W6, admission+errors owner W1+W2+W7/8, rendering W1+W2+W5; head control 5/5
before and after); budgets unchanged (30 s `PENDING_REQUEST_TIMEOUT_MS`, CDC `RETRY_MAX_ATTEMPTS 6`, rebalancer
`OPERATION_PERSIST_RETRY_TIMEOUT_MS 15 s`, files untouched by the diff); the UNIQUE-collision patch in place
(replica-operation-repository-mutation-persistence-methods.js:120-160, untouched); boundary audit `violations=0`;
every ratchet green but the pre-existing test-duplication red (below); eslint on the 42 changed files clean.

### Blocking

1. **The admin receipt of a keyed client re-issue is not complete on production's own input (attack 7 + 5).** The
   admin envelope builds the receipt from the ENGINE's answer (admin-query-result-message-envelope.js:148
   `buildAdminWriteReceipt(result)`). A client that re-issues under its idempotency key (the W5 shape the quest adds)
   gets a plan with a FRESH operationId (createWritePlan: `operationId = options.operationId || createOperationId()`,
   distributed-write-coordinator.js:114), the replay's witness carries the ORIGINAL submission's operationId (from the
   durable command), and `witnessMatchesParticipant` (admin-write-receipt.js:44-57) binds by operationId before the
   replay binding is ever consulted: `commitWitnessComplete false, witnessedParticipantCount 0,
   missingCommitWitnessPartitions [P]` although the participant answer carries `idempotentReplay true` and a witness
   naming the proposer. Substituting the first operationId, or removing it, makes the same answer complete; a client
   that supplies both identities is complete. Evidence: r1-receipt-identity.out (`secondKeyOnly ... sameOperationId
   false, receipt {complete false, witnessed 0, missing [r1-receipt], replay true}`,
   `secondWithFirstOperationIdSubstituted complete true`, `secondWithoutOperationId complete true`,
   `bothIdentitiesSupplied ... complete true`); r1-replay-roles.out `engineReplayReceipt {complete false, witnessed
   0, replay true}` and `engineAfterReceipt complete false` over a 3-replica group. The sealed clause "binds a replayed
   answer by (partitionId, entryId, term, logIndex) and the replay flag" does not hold: it also binds by an operationId
   that a keyed re-issue does not share. The W6 witness hands the receipt `original.operationId` by hand (a stand-in
   for the envelope's input; harness-fidelity 2). Owner decision: either the receipt binds a replay by the key/entry
   (not the operationId), or the engine keeps one operationId per key (one-minting-boundary: today one logical write
   has a stable entryId and a fresh operationId per submission - two identities).
2. **The CDC routed mutation (S2), the CDC local lane (S3) and the rebalancer mutation gateway (S4) identity has no
   repository witness and no red falsifier (epic contract items 2 and 4; constraint one-minting-boundary).** No file
   under test/ or scripts/ names `resolveRoutedMutationIdempotencyKey`, `routedMutationLocalWriteOptions`,
   `sendLocalSystemTableWrite`, `cdc-local-system-table-write-lane`, `buildSystemTableMutationExecutionOptions` or
   `mintOperationMutationIdempotencyKey` (static-census.out, section "repository witnesses naming"); no test under
   test/rebalancer, test/cdc or test/control-plane mentions `idempotencyKey`; the five sealed receipts all run through
   the engine. The attempt entry's "red-on-revert per contract" has nothing to be red for these three loops, and the
   design's own Red-on-revert clause names "a per-loop variant of W1 red through cdcIntegrationService.executeSQL and
   the rebalancer gateway". My live probe (r1-cdc-lane.out) shows S3 and the derivation hold on the head (the lane
   sends under `deriveParticipantEntryId(key, partitionId)`, a second send is a replay, the routed engine path under the
   same key is the same entryId, applications 1), and the gateway options / mutation helpers carry the key
   (`gatewayOptions {write gw-k, query gq-k}`, `mutationExecutionOptions.key x`); the S2 attempt loop and the two S4
   loops were read (one mint outside each loop, every attempt carries it), not driven. R19: the claim "once per
   logical mutation for the CDC and rebalancer loops" has no declared proof; a witness that is red on the sealed head
   for each of the three loops is the missing falsifier.
3. **The CDC local lane decides a THROWN partition answer by its text, ignoring the code it holds (constraint
   no-text-fallback-for-partition-answers).** cdc-local-system-table-write-lane.js:66-68 hands
   `cdc.isTransientCdcError(error?.message || EMPTY)` the message alone. Measured with a real partition second in the
   list (r1-cdc-lane.out): a thrown error carrying `failureCode partition_write_outcome_unknown` with an opaque text,
   WITH the key, is rethrown - the write is not sent on although a caller carrying the id may route an unknown outcome
   (`thrown_unknownCodeOpaqueText_withKey {threw opaque, failureCode partition_write_outcome_unknown}`); a thrown
   error whose text is the unknown text, WITHOUT a key, is sent on (`thrown_unknownText_withoutKey routedOn true`),
   which the module's own header rules out ("without a key it is sent on only after an answer that never proposed
   it"); a typed NOT_LEADER throw is sent on by its text (`thrown_typedNotLeader routedOn true`, the same decision the
   code gives). Not a double-apply on the head (the only caller, the S2 loop, always mints a key, so the re-send is
   idempotent), but a text consumer of a partition answer that holds the code, moved into a new module by this
   attempt. Fix: classify `error` (the classifier reads `failureCode` on the candidate), or the kernel predicate with
   carriesEntryId, as the answer branch does.

## Attack surface, items 1-11 (the brief), with evidence

1. A second minting site: static-census.out "entryId minting sites": `entryId:` is assigned in src only by the
   coordinator (:589, the derivation), the CDC selection (:39, the same derivation), the partition's own QUERY handler
   forwarding (entry-apply-base :742), write-metrics-base (:110 forwarding options), raft-write-commit (:134, the
   built entry's own id) and the worker's CDC replication command (message-group-worker-service-cdc-methods.js:193, a
   message-group entry, not a partition write); `uuidv4()/randomUUID()` in the write paths: the coordinator's
   operationId (:566), the CDC routed key (once per call, outside the loop, :469), the rebalancer's key (once per
   `execute*WithRetry`, :53/:107), the kernel's last-resort mint (`resolveEntryId`, reached only by a caller that sends
   no id: the bootstrap direct lane and the keyless local lane). The split mirror is a plan participant
   (`appendMirrorParticipant`, role mirror) and takes its id from the one derivation. The transaction-control messages
   (sql-query-engine.js:551 `buildRequest`) and the migration DDL path (migration-coordinator.js:595
   `executeOnPartition`) send no id (design S7 / DDL: out of scope, recorded). No second derivation.
2. A reroute without the id: the executor stamps `executionOptions.entryId` on every rebuilt request (builders :84) and
   admits a partition answer only by `isReroutableWriteFailureCode(code, {carriesEntryId: request.entryId present})`
   (r1-classify.out `describePartitionAnswer`, `executorIsLeaderUnavailable`); the leader-redirect failure branch
   (delivery.js:424-468) continues to the next candidate WITHOUT any admission predicate (pre-existing; under the same
   entryId for kernel paths, so idempotent - measured in F-at: 37 deliveries all `E`); the noHandler branch's
   `isLeaderUnavailable` call (:489) is dead (both arms `continue`); the thrown-transport branch (:643) classifies
   without a partition answer (a router that throws a partition answer would not be rerouted - conservative). S2:
   `isTransientCdcError` = the classifier (retryable includes the unknown) under one key per call - every attempt
   carries it (read). S3: measured (`truth_unknown_withKey routedOn true`, `truth_unknown_withoutKey routedOn false`,
   the environmental failure the same). S4: `isOperationMutationRouteRepairCandidate` asserts `carriesEntryId: true`
   and is consumed only by the session-rotation decision (:430); the retry itself is `isRetryableOperationPersistError`
   (the classifier); both loops mint the key outside the loop and `buildOperationMutationQueryOptions` carries it
   (read; the gateway copies it, r1-cdc-lane.out `gatewayOptions`). The bootstrap direct lane
   (`executeSQLDirectToLocalPartition`, cdc-routed-mutation-readiness.js:159-270) sends no identity and, on ANY
   failure of its raft-lane attempt (an unknown outcome included), falls back to `executeLocalQuery` on each local
   replica OUTSIDE the raft log - an identity-less re-issue after an unknown outcome, bootstrap-only and pre-existing
   (finding F8).
3. A replay that re-executes: none found. Leader / follower-forward / new leader / restart all answer from the row
   (r1-replay-roles.out; `proposalsOfE [.,1,1]`, `applications insert [.,1,1]` - the leader's own db shows 0 only
   because I deleted its log row for the unwitnessed probe afterwards); a follower that knows a leader REDIRECTS a
   replay request over the wire (`followerWire redirect LEADER_REDIRECT`) and answers it only through its own forward.
   A row recorded before the column existed: the column is re-added at init (`lone_olderDonorColumn afterInit` has
   `changes`; the old rows read `null`) and the replay answers `changes null` (finding F3). A key reused for a
   DIFFERENT statement is answered as the first statement's replay: the UPDATE "succeeds" with affectedRows 1, the
   value is unchanged and nothing is applied (`keyReusedForDifferentStatement`; finding F4).
4. A text consumer left behind: the W8 names have zero src consumers (static-census.out; the witness's census agrees);
   `isRetryableWriteError` has one consumer (the classifier, for a candidate without a code). Remaining text
   decisions on partition-answer texts: the local lane's catch (blocking 3); `CDC_OWNER_HANDOFF_ROUTING_ERROR_FRAGMENTS`
   keeps `ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE` (r1-classify.out `cdcHandoff notLeader byTextOnly true`; the same
   decision as the code); write-metrics-base.js:499 throws an untyped NO_LEADER text into the forward path (wrapped as
   `forwardWriteFailed`, a transport fragment); the executor's own no-routable-leader failure (delivery.js:194/221)
   carries the NO_LEADER text without a code. None reroutes an unknown outcome by text. The constraint asks that a
   remaining text consumer be a recorded finding: the log holds none (the attempt entry says "text census zero", true
   of the two deleted names only) - record F1.
5. A stand-in router: the sealed witness's router delivers by address to the replicas' loopback transport, whose
   handler is the production dispatch (`handleAdmittedApplicationMessage` case QUERY -> `handleRemoteQuery`,
   entry-apply-base :359); my probes use the same shape. The receipt witness (W6) is the stand-in: it builds the
   receipt by hand with the first submission's identity (blocking 1).
6. The wire: r1-fat-env-failure.out `wire_success` and `wire_refusalWhileHeld` drop nothing; the sealed W7 covers
   replay, backpressure and the released unknown (receipts-head.tap). The not-leader early answer (:714) is typed
   NOT_LEADER; the epoch rejections and the redirect carry no kernel code (not partition write answers).
7. The receipt: a replay binds by (entryId, replayOfLogIndex) and the replay flag, and the witness's term is bound
   inside the outcome owner (`replayedCommitWitness` refuses a log row whose term differs from the row's); an
   unwitnessed replay is not complete (measured). The production input binds by operationId too (blocking 1).
8. F-at: measured through a real group (above); the code is retryable and reroutable only with the id
   (r1-classify.out `envFailed reroutableNoId false, reroutableWithId true`); its TEXT is not in
   `RETRYABLE_WRITE_ERROR_FRAGMENTS` (`textRetryable false`, `errorOfText no/no/no`) - finding F2.
9. The outcome-row widening: `changes INTEGER` in the DDL, `ADD COLUMN` at init when absent (measured by dropping
   the column: `dropped` lacks it, `afterInit` has it), NULL for STATEMENT_FAILED and legacy rows, read as `null`.
10. Budgets and the patch: unchanged (above).
11. Registry: the pair `partition-write-answer-retry-classification` names every consumer of the classification
    predicates (static-census.out vs the registry's owners: kernel, errors, classifier, rebalancer gateway methods,
    CDC shared + constants, executor routing, the new lane); impact-contract-registry PASS 40/17; classes and seal
    current (`--check` exit 0 x3, curated shards current). Its description now claims "a write answer crosses every
    boundary whole" but none of the eight carriers of `pickPartitionWriteAnswerFields` (entry-apply-base, coordinator,
    parallel outcomes, execution budget, delivery, failure, request builders, rendering) is an owner of any contract,
    and `cdc-routed-mutation-readiness.js` stays an owner though it no longer consumes the predicates (finding F5).

## Findings (in-bar, non-blocking; record per R17)

- F1. Remaining text decisions on partition-answer texts (item 4): the CDC handoff list's NO_LEADER text, the
  untyped NO_LEADER throw at write-metrics-base.js:499, the executor's own no-leader failure without a code. Decision
  parity with the codes; needs a log entry.
- F2. `STATEMENT_ENVIRONMENT_FAILED`'s text is absent from `RETRYABLE_WRITE_ERROR_FRAGMENTS`: by code the classifier
  retries it, by text it is failed-for-good (r1-classify.out `envFailed`), against the kernel comment "the errors
  owner keeps each code's text"; the kernel test's code/text parity clause covers releases and refusals only.
- F3. A legacy outcome row (NULL `changes`) replays `changes null`: the client's UPDATE replay answers affectedRows 0
  (the R07 misreport the quest set out to fix, for rows recorded before the widening); the INSERT replay's affectedRows
  1 is the AST fallback (r1-replay-roles.out `lone_nullChanges_*`). Documented in the constants; a named state
  (R07) would be honest.
- F4. A key reused for a different statement replays the first statement (item 3): the outcome row binds no statement
  digest; a client that reuses a key is told a lie. Outcome owner's follow-up.
- F5. Registry: the wire-shape carriers are unowned by any contract; a stale owner in the pair (item 11).
- F6. `check-complexity` prints the tightening hint (1814 -> 1812); the repository instruction says tighten on the
  hint (CLAUDE.md); not done in A1.
- F7. Test duplication ratchet red on this branch base: head 794/30542 vs baseline 793/30519 (static-duplication.out);
  sealed archive (dup-sealed.out) [test] 794/30542 - identical to the head, so this change adds no clone group and no duplicated line; [src+scripts] 56/1815 on the sealed head vs 56/1812 on the head (tightened); the src+scripts target holds 56/1812 as tightened.
- F8. The bootstrap direct lane's identity-less fan-out after any failure (item 2): pre-existing, bootstrap-only,
  outside the raft log; not in the constraint's path list; record for the CDC owner.
- F9. The leader-redirect failure branch reroutes without an admission predicate (item 2; the implementer's own
  evidence finding names its 480-delivery consequence for a constraint failure).
- F10. The receipt does not bind the term itself (the participant answer carries none); the binding lives in the
  outcome owner's witness construction. Acceptable as the interaction; the design's C6 wording says term.
- F11. `replicaNodeIdOf` names the witness's `leaderNodeId` from the services row in the answering replica's
  system-table cache (a projection, R10); it fails closed (no row -> unwitnessed, measured), so a hint, not an
  authority - note.
- F12. `PARTITION_WRITE_ANSWER_FIELDS` is not exported by the kernel; the witness (and my probes) keep the eight names
  as the contract's literals.
- F13. The attempt entry claims "integration+backend+dt 66": the branch's dt set is 40 dt6 files + 1 dt-movielens + 1
  leader-routable + 22 backend files (64; two of the dt* names I ran are not in that count); immaterial.

## Out of bar (recorded, not absorbed)

- The S5 outer retry loops (54 `isRetryableControlPlaneError` consumers) re-issue an operation under fresh identity
  after an unknown or environmental answer (design S5; the owner is the S4 options owner).
- Transaction-control and migration DDL requests carry no entryId (design S7 / DDL).

## Templates

### admission-gating
1 Precheck-predicts-enforcement: the executor's admission (`isLeaderUnavailable` with `describePartitionAnswer`) and
the CDC lane's `isLocalSystemTableWriteRoutedOn` consult the same kernel predicate the classifier's
`hasReroutableWriteFailure` consults (r1-classify.out tables agree column by column); the receipt's precheck
(`witnessMatchesParticipant`) predicts a different thing than the replay binding enforces (blocking 1).
2 Transient vs terminal: unknown and environmental are transient-with-id, terminal-without-id at every router
(measured at the executor and the lane); host failure and a constraint failure terminal everywhere; the environmental
text is terminal by omission (F2).
3 Which budget governs: unchanged (30 s pending-commit deadline; CDC 6 attempts; rebalancer 15 s persist retry; the
client's own `timeoutMs`); F-at reached the new leader in 4.4 s within the 12 s client budget.
4 Reason shape: `failureCode` + `entryId` on the wire for the environmental failure (measured), NOT_LEADER typed at the
early return; the redirect and epoch answers carry no kernel code.
5 Hold release: the held leader answers NOT_LEADER (`fat_r1StatusWhileHeld role null, outcome HOST_FAILURE`) until the
heal; after the heal it applies the committed entry once (`fat_afterHeal`).
6 Freshness: the outcome row is read per retry (pre-proposal and at apply); the replay's witness re-reads the durable
log at the row's index each time.
7 Message honesty: the environmental answer names the host failure and the entry; the replay names the proposer; the
init refusal no longer says "phase undefined" (partition-port-refusal-outcomes.test.js clause, in the batch).

### recovery-replay
1 Never clobber live with stale: the replay answer never re-executes (all roles, restart); a legacy row is widened, not
rewritten (`rowsNow` NULL kept).
2 Restart vs live discrimination: the restart replay reads the restored row and the restored log (lone partition,
`lone_restartReplay_direct` with the witness); the new leader's replay reads its own row after the proposer's
shutdown.
3 Lost-enlistment refusal: not exercised (untouched).
4 Replay idempotence: measured on every role and across the F-at reroute (`applications [1,1,1]`); the keyless local
lane applies twice by design (`lane_withoutKey applications 2`), the keyed lane once.
5 Absence proves nothing: an unwitnessed replay (log row gone / proposer unknown) answers success but carries no
witness and its receipt stays incomplete (measured) - honest.

### owner-interaction
1 Single owner: the kernel's code lists; the errors owner's texts for the classifier's text-only candidates; the
coordinator's one derivation; consumed by the executor, the lane, the rebalancer (via the classifier) and the CDC
handoff - but the lane's catch classifies by text with the code in hand (blocking 3).
2 Typed boundary: `isReroutableWriteFailureCode(code, {carriesEntryId})`, `pickPartitionWriteAnswerFields`,
`deriveParticipantEntryId`, `hasReroutableWriteFailure(value, {carriesEntryId})`, `readCommittedEntryAtIn`.
3 Paired invariants in one witness: W1 holds "sent again under one entryId" and "applied once on every replica" and
"answered success as a replay with the original rows" in one test over one real group; W2 the three release causes;
red-on-revert per clause reproduced (revert-clauses.out).
4 Stale-then-fresh: the F-at bounce (redirect to a held leader, NOT_LEADER, next candidate ... new leader) converges
under one id.
5 Pressure/backoff: `retryAfterMs` reaches the retry decision (sealed W7 green; wire unchanged in my probes); no new
delay.
6 Wake/release: the held leader's heal applies the committed entry (`fat_afterHeal converged true`).
7 Projection authority: the replay witness's proposer node comes from the services cache (F11); the receipt's
operationId binding takes a per-submission mint as identity (blocking 1).
8 Controlled negative: receipts 0/5 on the sealed archive for the stated reasons (receipts-sealed.tap: not rerouted
post-A13 -> client failure; key dropped -> 2 applications; 8 fields dropped; receipt names r2); head 5/5 twice
(receipts-head.tap, revert-clauses control).
9 No local escape hatch: none at the executor/classifier/rebalancer; the lane's catch is the one (blocking 3); the
bootstrap direct lane is a pre-existing identity-less path (F8).
10 Contract + registry + proof aligned: the pair names the classification consumers; the wire carriers and the three
loops' identity are unowned by any contract and unproven by any witness (blocking 2, F5).

### harness-fidelity
1 Red for the right reason: sealed 0/5 with the pre-quest behaviours as the diagnostics (receipts-sealed.tap lines
9-16, 43-50, 74-80, 98-110, 158-166); per-clause reverts red on the clause's own receipts.
2 Stub honesty: the sealed router is the replicas' loopback by address; W6's hand-built receipt input hides the
operationId binding (blocking 1). My lane probe uses fake first services with the kernel's own answers and the real
partition second, stated in the file.
3 Time fidelity: group timing 20/150-300 ms; F-at converged in 4.4 s; the deadline case advances the partition's own
virtual clock by exactly `PENDING_REQUEST_TIMEOUT_MS` (sealed W3).
4 Field fidelity: the eight wire fields compared by JSON value inside vs wire (nothing dropped, three probes + W7).
5 Vacuous assertions: "sent again" asserts `sent.length > 1`; "applied once" counts proposals with an outcome row on
each replica's independent connection; my `applications` reads the same.
6 Live binding: the sealed receipts run production PartitionService replicas, admission, engine, coordinator,
executor; the three CDC/rebalancer loops are bound to nothing (blocking 2).

## Commands run (counts, exit codes)
- Static (static-r1.out, every exit 0 but duplication): check-complexity 1812/1814 (hint: tighten to 1812);
  check-cognitive-complexity 159/159; check-unused-exports 1433/1433; check-file-size-thresholds 27/27 + 21/21;
  check-duplication exit 1 ([src+scripts] 56/1812 OK; [test] 794/30542 > 793/30519, pre-existing on the branch base);
  check-no-legacy-naming; check-curated-test-shards; generate-test-{primary,resource,subsystem}-classes --check (2168);
  impact-contract-registry PASS 40/17; check-quest-log-append-only clean; eslint on the 42 changed js files (0 lines,
  re-run with `time`: 0.77 s, `--format json` proves it lints); audit:guidelines 0 new violations;
  audit:closure-ledger 43 records 0 drift; raft-rs-operation-boundary-audit via the r2 runner `violations=0`
  (boundary-audit.out).
- Receipts (chain1-receipts.out): head 5/5 exit 0 (4.6 s); sealed archive 0/5 exit 1; the evidence producer in the
  sealed archive: status fail, five `passed:false`.
- Reverts (revert-clauses.out, 8 witness runs, each 4-7 s): as listed above.
- Probes (run-r1-attacks.out + reruns, each exit 0 after scratch-script fixes): r1-classify, r1-cdc-lane,
  r1-replay-roles (5 s), r1-fat-env-failure (6 s), r1-receipt-identity.
- Suites (chain2-suites.out): 849 files (test/query 149, test/partition 110, test/cdc 39, test/admin 59, test/control-plane 182, test/rebalancer 231, test/raft/raft-rs-backend 22, integration leader-routable 1, test/convergence/dt* 56) at --test-concurrency=2 behind the thermal gate: 27764 tests / 27680 pass / 0 fail / 0 cancelled / 84 skipped, 280.4 s, suites exit=0; ok lines 6390, not-ok 0 (suites.tap).
- Hygiene: `git status --short` unchanged by me; children 0 at the end of every runner; temp directories removed by
  the scripts.

## Not verified
- The S2 attempt loop and the two S4 loops driven live under a released write (read only; blocking 2 asks for the
  witness).
- The split mirror participant under a client key; the CDC handoff's outer consumers; GCP timing; the whole corpus.
- A follower's own restart over its db inside a live group (the lone-partition restart and the new-leader replay were
  measured instead).
- The executor's system-table widening branch by code (my stub cache has no system partition; read only).
- `solve probe` itself (it writes the receipt; I read the committed file and re-ran the witness directly).
