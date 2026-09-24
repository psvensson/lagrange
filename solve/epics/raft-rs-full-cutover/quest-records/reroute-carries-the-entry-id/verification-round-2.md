# Verdict r2: reroute-carries-the-entry-id (attempt A2, head 037c650c0)

Head verified: 037c650c029a6453c8b517053e7e6d179da57166 (worktree
/mnt/data/peter/projects/lagrange/.claude/worktrees/q-reroute). `git status --short` at start and end (unchanged by
me): ` M solve/quests/reroute-carries-the-entry-id/log.ndjson` (the lead's A2 attempt entry, an appended last line;
`check-quest-log-append-only` clean). I edited no repository file and ran no git write command (`git archive` into
scratch only). Every scratch script and output lives under scratchpad/verify-reroute/r2/ (paths below are relative to
it); every run under `timeout`; the sealed head 2ee6e0c4e is the r1/sealed-head archive (verified file-by-file against
`git show 2ee6e0c4e:` over the 58 changed paths: only its receipt.json differs, rewritten by the r1 producer run); the
head is r2/head-archive (git archive of 037c650c0) for the mutants. Thermal gate before every batch (static "ok cpu
73C", receipts "66C", mutants "63C", suites "68C"; a formation-sim test of another verifier shared the machine, load
1.1-1.8); suites at `--test-concurrency=2`. `pgrep -P` at the end of every runner: 0 children; no temp directory of
mine survives outside the scratchpad.

## Verdict: REJECT (one blocking item, mechanical: the committed import-graph seal and owner-debt inventory do not bind the head's sources, and the land guard refuses exactly that; every substantive clause of the quest - B1/B2/B3 re-attacked, F2/F3/F4/F5/F6/F12, the eleven mutants, the five sealed receipts, F-at live, the wire, every role's replay - holds under fresh measurement)

What holds (measured, not read):

- Receipts: head 5/5 (receipts-head.tap, 6 s); sealed archive 0/5 (receipts-sealed.tap) and the evidence producer in
  the sealed archive `status fail`, five `passed:false` (producer-sealed.out); the committed receipt's
  `testFileDigests` equals `sha256sum test/query/write-identity-end-to-end.test.js` (ac727c13...), and that witness
  file is unchanged since the seal (`git log -1` = 2ee6e0c4e).
- The A2 witnesses: head 110/110 across loops + replay-answers + lane + kernel (witnesses-head.tap); on the sealed
  archive 0/10, each red for the pre-quest reason (witnesses-sealed.tap): S2/S4-sql/S4-row "the mutation applied
  once ... 2 !== 1" under two `dwrite-participant-*` entryIds; S3 "sent again ... [null]" (no identity at all);
  B1 "the re-issue is answered from the outcome row" fails (the sealed engine drops the key); F4 "the reused key is
  refused" fails with `success:true, affectedRows:1` (the first statement's replay); F3 fails before the assertion
  (`no such column` - the sealed schema has no changes column); the lane test cannot load (the module is new).
- B1 re-attacked through the REAL engine answer and the REAL admin envelope on a real 3-replica rs-raft group
  (r2-receipt-replay.out): the keyed re-issue's plan mints a fresh operationId (`sameOperationId false`), its answer is
  a replay (`idempotentReplay true, replayOfLogIndex 5, changes 1, changesKnown true`) and the envelope's receipt is
  `complete true, witnessed 1, missing []`, bound to the first answer's entry (`sameEntry/sameIndex/sameTerm true`);
  after the proposer's shutdown the re-issue answered by the NEW leader (node-2) is complete and its witness names the
  proposer (`leaderReplicaId r2-receipt-r1, leaderNodeId node-1`, `witnessNamesProposerNotAnswerer true`); NOT
  complete: a witness naming another entry, a forged replayOfLogIndex, the replay flag dropped, a non-replay under
  another operationId, a fresh answer lying `idempotentReplay`, a key mismatch (all `false`); applications [1,1].
  r2-replay-roles.out: leader wire / follower direct (forward) / new leader wire replays all `complete true`, the
  engine's own re-issue receipt `complete true, witnessed 1` (R1's B1 output was `complete false, witnessed 0`).
- B2 re-attacked: the four per-loop witnesses drive production loops (`CDCIntegrationService.executeSQLViaQueryEngine`,
  the same with the lane in front, `ReplicaOperationRepository.executeOperationMutationWithRetry`, and
  `executeReplicaOperationGatewayMutationWithRetry` through `ControlPlaneSystemTableGateway.submitMutation` and the
  CDC row mutation) in front of a production `SQLQueryEngine`/coordinator/`QueryExecutor` whose router delivers to the
  replica's own `handleRemoteQuery` by address; the replica is a production `PartitionService` on the controllable
  port (`createRaftOperationPort` with a test core; `commit` applies through `applyCommittedEntryTransaction`, the
  production application owner) with its own virtual clock; the release is the typed commit-deadline release
  (`PENDING_REQUEST_TIMEOUT_MS` advanced on the replica's clock), then the held proposal commits - the design's W3
  shape. The S3 stub (`resolveLocalSystemTableServices = () => [replica.service]`) is shape-faithful: production
  returns `PartitionService` instances from the node's segment map filtered to local leaders
  (cdc-integration-service-local-system-table-routing.js:148-189). Mutants (mutants.out; control 10/10 before and
  after; each mutant restored and `cmp`-verified): M1 S2 key minted per attempt -> S2, S3, S4-row red; M2 lane sends
  no identity -> S3 red; M3 lane derives from another key -> S3 red; M4 rebalancer key per attempt -> both S4 red; M5
  gateway drops the key (both option builders) -> both S4 red; M6 row helpers drop the key -> S4-row red; M7 receipt as
  sealed -> B1 red; M8 lane as A1 -> B3 red; M9 no statement binding -> both F4 red; M10 count always known -> F3 red;
  M11 mismatched entry reported committed -> F4-apply red. Eleven mutants, eleven red in the file that claims them.
- B3 re-attacked (r2-classify.out `lane.*`, r2-cdc-lane.out): the lane's thrown and returned decisions agree row by
  row for every kernel answer - unknown/environmental only with the key (`thrownNoKey rethrown`, `thrownKey
  sent-on`), not-leader/recovery/backpressure/shutdown sent on with or without key, host failure / constraint / the
  mismatch refusal never; an UNCODED failure is never sent on without the key (an unknown text without key
  `rethrown`, a transport text without key `answered`), and with the key only when the CDC integration names it
  transient (opaque text with key `answered`/`rethrown`). r2-cdc-lane (a real partition second): B3's three R1
  shapes now `thrown_unknownText_withoutKey` rethrown, the others by code.
- F4 (r2-digest.out): the digest survives the proposal codec round trip for plain/number/-0/1e21/null/undefined/absent
  params/Buffer/Uint8Array/Date/nested/unicode/bool (`same` everywhere; a BigInt param is refused by the codec before
  proposal, `proposal_unencodable`); a keyed re-issue with another statement is refused typed before proposal
  (`partition_write_entry_id_statement_mismatch`, one delivery - not rerouted, not retried; value unchanged, 0
  applications, no new outcome row) and the same statement afterwards is still a replay; the mismatch code is not a
  kernel write failure code (`isPartitionWriteFailureCode false`, not retryable, not reroutable, classifier `no/no/no`
  in every linked shape, executor and widening `false`, CDC transient `false`). At apply: the sealed F4-apply witness
  (a second proposal under the entryId with another statement committed through the port) shows the statement not
  applied and no ENTRY_COMMITTED for it; mutant M11 confirms the guard is the `answer.success !== true` clause.
- F3 (r2-digest.out `afterRestart`): after a restart of a lone partition whose row lost its count, the same-statement
  replay answers `changes null, changesKnown false`; the engine `affectedRows null, affectedRowsKnown false`; the admin
  envelope the same; the receipt stays `complete true`. r2-replay-roles `lone_nullChanges_*`: affectedRows null (R1: 0).
- F2 (kernel test F2 green in the batch; r2-classify `envTextParity`): the environmental text is owned by errors.js,
  the partition constants alias it (`kernelOwnsSameText true`), `isRetryableWriteError(text) true`.
- F-at live through a real 3-replica group (r2-fat-env-failure.out): the leader's application fails after the
  commit, answers `partition_committed_statement_environment_failed` WITH the entryId on the wire, every re-delivery
  carries that one entryId (`E` on all), the client is answered success/replay in 2.9 s, and after the heal every
  replica holds exactly one application (`[1,1,1]`, `proposalsOfE [1,1,1]`); a re-issue after the heal is a replay,
  still `[1,1,1]`. `wire_success` and `wire_refusalWhileHeld` drop nothing.
- Reroute admission (r2-classify.out): executor `isLeaderUnavailable` by code with carriesEntryId (unknown and
  environmental `withId` only; host failure, constraint, mismatch never; text-only never; the four transport texts
  yes); the system-table widening (`services-p1`) the same table; the classifier's linked walk over cause /
  participantFailures / firstFailedParticipant / participantResults agrees column by column.
- Replay on every role (r2-replay-roles.out): leader wire, follower (redirects, then its own forward), engine
  re-issue, new leader after the proposer's shutdown, restart of a lone partition - all `idempotentReplay true` with
  the proposer's witness; an unwitnessed replay (proposer's services row unknown / log row gone) carries no witness and
  its receipt is `complete false` (r2-unwitnessed.out, asked with the real statement).
- The older donor (r2-digest `olderDonor`): a table lacking BOTH widening columns gains `changes` and
  `statement_digest` at init; legacy rows read NULL.
- Budgets and the patch: `PENDING_REQUEST_TIMEOUT_MS` 30 s, CDC `RETRY_MAX_ATTEMPTS 6`, rebalancer
  `OPERATION_PERSIST_RETRY_TIMEOUT_MS` 15 s unchanged; the UNIQUE-collision patch untouched
  (replica-operation-repository-mutation-persistence-methods.js:130).
- Minting census on the head (static-census in this record, item 1): `entryId:` is assigned in src only by the
  coordinator's derivation (:593), the CDC selection's same derivation (:39) and the kernel's last-resort
  `resolveEntryId` (:232); the uuid mints in the write paths are the coordinator's operationId (:570), the CDC routed key
  (once per call, outside the loop), the rebalancer's key (once per `execute*WithRetry`, :520) and session ids (:635,
  readiness :333). No second derivation; A2 added none.
- Suites (chain2-suites.out): 852 files (query, partition, cdc, admin, control-plane, rebalancer 231 in full, raft-rs
  backend 22, integration leader-routable 1, convergence dt* 56 incl. dt-movielens and dt6) at `--test-concurrency=2`:
  27825 tests / 27741 pass / 0 fail / 0 cancelled / 84 skipped, 278 s, exit 0 (suites.tap: 6402 ok, 0 not ok).
- Static (static-r2.out): complexity 1812/1812, cognitive 159/159, unused exports 1433/1433, file-size 27 + 21,
  duplication `[src+scripts] 55/55, 1775/1775` OK, no tightening hint printed by any ratchet; legacy naming clean;
  curated shards current; primary/resource/subsystem classes `--check` 2171 tests current; impact-contract-registry
  PASS 40/17; quest-log append-only clean; raft-rs boundary audit exit 0; eslint on the 48 changed .js files clean;
  `check-fast-static` ok (12.9 s); `audit:guidelines` 0 new violations; closure ledger 43 records 0 drift;
  `test:unused` (knip) exit 0 with two pre-existing configuration hints unrelated to this change (node-fetch in
  ignoreDependencies; the `test-part` entry pattern).

### Blocking

1. **The committed import-graph seal and the owner-debt inventory do not bind the head's sources; the land guard
   refuses exactly that (epic contract item 8; R05, R23).** `test/shards/impact-graph-seal.json` on HEAD carries
   `sourceDigest 2bbc2508...`; the live JavaScript source digest of the HEAD tree is `fea94011...` - identical in the
   worktree and in a clean `git archive HEAD` export (4824 files each, no file only on one side;
   static-inventory-rewrites.out and the node readout in this record). The worktree's untracked
   test-output/analysis/global-owner-debt-import-graph.json matches the committed seal (both 2bbc..., snapshot
   217ac...), i.e. the seal was produced on a tree whose JavaScript differed from what was committed. Measured with
   the producer's own read-only verify in the worktree: `node scripts/generate-global-owner-debt-inventory.js
   --verify-import-graph` exit 1, "import graph does not match the canonical live producer"
   (verify-import-graph.out; generate-global-owner-debt-inventory.js:876-886 rebuilds the canonical graph from the live
   tree and compares the committed seal with `importGraphSeal(expected)`). `solve land` runs that very verify
   (scripts/solve/guards.js:246-247, `canonicalImportGraphProblem`) and refuses on it, and its `canonicalReceiptProblem`
   (:305-309) refuses a `graph.sourceDigest` that differs from `javascriptSourceDigest(root, listJavaScriptFiles(root))`.
   The committed `solve/changes/global-owner-debt-inventory/inventory.json` is likewise A1's: the brief's
   `--refresh` in a clean export (static-inventory-refresh.out exit 0) rewrites, beyond digests: `cloneGroups 56 ->
   55`, `duplicatedLines 1812 -> 1775`, `sourceCloneTouches 112 -> 110`, `moduleCount 4926 -> 4930` (the four new test
   files), `edgeCount 23040 -> 23089`, `sourceSignalCount 2632 -> 2631`, the rendering owner's `duplicatedLines 179 ->
   105`, `score 241.9 -> 234.5` and its position in two owner lists, and the seal's three digests
   (static-inventory-rewrites.out: two REWRITTEN tracked files, six NEW untracked reports under test-output/). The
   attempt entry says "inventory not run - the verifier runs them": run, it is red. Fix (mechanical): `npm run
   test:metadata:refresh` and `node scripts/generate-global-owner-debt-inventory.js --refresh` on the final tree, then
   commit the two regenerated files with the attempt (nothing else in the tree changes; the classes and curated shards
   are already current).

## Attack surface, items 1-11 (the brief), with evidence

1. A second minting site: none (census above; r2-cdc-lane.out `derivationMatchesCoordinator true`,
   `localOptions.withKey.entryId` is the coordinator's derivation; mutants M1-M6 prove each loop's one mint is
   load-bearing).
2. A reroute without the id: executor admission, the widening and the classifier by code with carriesEntryId
   (r2-classify.out); the lane by code, uncoded only with the key (`lane.*`); S2 every attempt spreads one
   `baseQueryOptions.idempotencyKey` (M1 red proves the attempt reads it); S4 both loops mint outside the loop (M4/M5/M6
   red). The leader-redirect branch still continues without an admission predicate (R1 F9, pre-existing; idempotent
   under the kernel paths - F-at's re-deliveries all `E`).
3. A replay that re-executes: none on any role, after restart, after the proposer's shutdown, across F-at; a key
   reused for another statement is refused before proposal and at apply; a legacy NULL-digest row replays (finding F16
   below).
4. A text consumer left behind: W8 names 0 in src; the residual text decisions are R1's F1 set, unchanged
   (delivery.js:194/221 the executor's own no-leader failure without a code; the CDC handoff list's NO_LEADER text,
   cdc-integration-service-shared-constants.js:48; write-metrics-base.js:499's untyped throw) - each with decision parity,
   none reroutes an unknown outcome; recorded durably in the committed round-1 record.
5. A stand-in router: the sealed witness and the A2 harness deliver by address to the replica's loopback transport,
   whose handler dispatches QUERY to `handleRemoteQuery`; the receipt witnesses now build the receipt from the ENGINE's
   answer through `createAdminQueryResultMessageEnvelope` (the envelope's real input; R1's B1 stand-in is gone).
6. The wire: `wire_success` / `wire_refusalWhileHeld` drop nothing; the sealed W7 covers replay / backpressure /
   unknown; `changesKnown` is in `PARTITION_WRITE_ANSWER_FIELDS` and crosses (`p.changesKnown` at the engine's
   participant in r2-digest and r2-replay-roles).
7. The receipt: binds a replay by (entryId, replayOfLogIndex) + the replay flag + the key, ignores the per-submission
   operationId for a replay only (non-replay under another operationId `false`); an unwitnessed replay is not
   complete; the follower/new-leader replay names the proposer.
8. F-at: measured live, once, with the id only (above); its text retryable by the errors owner (F2 closed).
9. The widening: `changes` and `statement_digest` added at init when absent (both dropped -> both restored); legacy
   rows NULL; the replay of a NULL count answers unknown, never 0, end to end.
10. Budgets unchanged; patch in place.
11. Registry: the contract's owners now name the eleven carriers and the three witness files; impact-registry PASS.
    Residual (finding F17): the admin envelope and admin-write-receipt.js (consumers of `idempotentReplay`,
    `replayOfLogIndex`, `affectedRowsKnown`) and the engine's client-identity pass-through
    (sql-query-engine-write-execution.js `buildWritePlanOptions`) are named by no contract for this concern, and the
    pair's `retry-and-reroute-consumers` endpoint still lists only the seven R1-era files (impact-contracts.json:1047-1056).

## Findings (in-bar, non-blocking; record per R17)

- F14 (the implementer's, answered): two CONCURRENT submissions under one key with different statements
  (r2-digest.out `f14_concurrentSameKeyDifferentStatements`): both are answered `success true, affectedRows 1`, neither
  marked a replay or refused, only the first applied (`c1 1, c2 0`, value `c-one`) - the second joins the first's
  pending answer by entryId (`getPendingCommittedWriteOutcome`, write-metrics-base.js:675-678) before the outcome row
  exists. In-bar by exposure: C1 made a client key reachable at the engine for the first time, so a client can now
  reach this join; the owner is the pending-write outcome join (the same binding concept as F4: the join should bind
  the statement, or answer typed). Not a double application. Needs the lead's decision on whether A3 absorbs it.
- F16. A legacy outcome row (NULL `statement_digest`, recorded before the widening) answers a keyed re-issue of a
  DIFFERENT statement as the first statement's replay: `success true, affectedRows 1, idempotentReplay true`, the
  value unchanged, nothing applied (r2-digest.out `legacyNullDigest.otherStatementUnderLegacyKey` and
  `afterRestart.otherStatementOnUnboundRow`). The row's state is a named one internally
  (`PARTITION_COMMITTED_STATEMENT_BINDING.UNRECORDED`) but the ANSWER carries no mark of it: the client cannot tell
  "a replay of your statement" from "a replay of whatever settled this key before the binding existed" (R07). Honest
  only for databases created after the widening; the lead's F4 judgment ("never the first statement's replay") is met
  for bound rows, not for legacy rows. Recommend the answer name the binding (an `unrecorded` marker on the replay answer): the owner cannot
  know the statement of a legacy row, so it must mark, not refuse.
- F17. Registry residual (item 11).
- F18. The engine's top-level summary for a single-participant mismatch refusal carries `failureCode null, entryId
  null` (r2-digest `otherStatement.topLevelFailureCode/topLevelEntryId`); the code and entry ride the participant
  (`participantFailures[0]`), which the classifier walks. C4 says "the engine's summary keeps them"; it keeps them one
  level down. Cosmetic for code consumers; a client reading the top level sees the generic distributed-failure text.
- F7 (unchanged): `[test]` duplication 794/30542 on the head, identical to the sealed archive (r1/dup-sealed.out) - this
  change adds no clone group or line; the branch base is over main's 793/30519 (fixed on main by 89525e7a9); the
  rebase onto main resolves it.
- F1, F8, F9, F10, F11 from round 1 stand unchanged (recorded in the committed round-1 record).

## Out of bar (recorded, not absorbed)

- F15 (the implementer's): `cdc.retryMaxAttempts` / `cdc.retryDelayMs` are keys in cdc-constants.js:20-21 that the
  configuration schema does not admit (src/config/config-schema-constants.js has `messageGroup.retryMaxAttempts` only;
  config-definitions.js:67 / config-key-constants.js:61), so the CDC integration always runs its defaults (6 attempts,
  cdc-integration-service.js:91-94 falls back). Owner: src/config (the configuration schema owner), with the CDC owner
  as the consumer.
- The S5 outer retry loops (54 `isRetryableControlPlaneError` consumers), transaction-control and migration DDL
  requests without an entryId, the bootstrap direct lane's identity-less fan-out (R1 F8): unchanged, recorded.

## Templates

### admission-gating
1 Precheck-predicts-enforcement: the executor's admission, the widening, the classifier's walk and the lane's one
predicate consult the same kernel predicate and agree column by column (r2-classify.out); the receipt's precheck now
predicts the replay binding it enforces (B1 closed).
2 Transient vs terminal: unknown/environmental transient-with-id, terminal-without-id at every router; host failure,
constraint and the mismatch refusal terminal everywhere; the mismatch is typed before proposal AND at apply.
3 Which budget governs: unchanged (30 s / 6 attempts / 15 s / the client's timeoutMs); F-at converged in 2.9 s.
4 Reason shape: `failureCode` + `entryId` on the wire for the environmental failure and the mismatch; `changesKnown`
on the replay; NOT_LEADER typed at the early return.
5 Hold release: the held leader answers NOT_LEADER until the heal, then applies the committed entry once
(`fat_afterHeal converged true`).
6 Freshness: the outcome row is read per retry, pre-proposal and at apply; the digest is computed on the live command
each time, from the codec's bytes.
7 Message honesty: the mismatch names the entry and says the statement was not applied; a legacy row's replay says
nothing of its binding (F16).

### recovery-replay
1 Never clobber live with stale: no replay re-executes; a mismatched entry is consumed without touching the row.
2 Restart vs live discrimination: the restart replay reads the restored row (count unknown -> unknown, receipt
complete via the restored log); both widening columns re-added at init.
3 Lost-enlistment refusal: not exercised (untouched).
4 Replay idempotence: measured on every role, across F-at, across the four production loops (mutants prove each).
5 Absence proves nothing: an unwitnessed replay is not complete; an unbound legacy row is answered as a replay without
saying so (F16).

### owner-interaction
1 Single owner: the kernel's codes and the errors owner's texts (environmental text now the errors owner's); the
coordinator's one derivation, consumed by the CDC selection; the outcome owner binds the statement.
2 Typed boundary: `isReroutableWriteFailureCode(code, {carriesEntryId})`, `pickPartitionWriteAnswerFields`,
`PARTITION_WRITE_ANSWER_FIELDS` (exported, F12), `sumAffectedRows`, `deriveParticipantEntryId`,
`hasReroutableWriteFailure`, `readCommittedEntryAtIn`, `PARTITION_COMMITTED_STATEMENT_BINDING`.
3 Paired invariants in one witness: each loop witness holds "sent again", "one entryId", "applied once", "loop answers
success" over one replica; B1 holds "replay" and "complete" and "binds the first entry".
4 Stale-then-fresh: F-at's bounce converges under one id; the new-leader replay after the proposer's shutdown.
5 Pressure/backoff: unchanged; backpressure reroutable with or without id (retryAfterMs reaches the decision, sealed W7).
6 Wake/release: the heal applies the committed entry once.
7 Projection authority: `replicaNodeIdOf` from the services cache (R1 F11, fails closed - measured again).
8 Controlled negative: sealed 0/5 and 0/10 for the stated reasons; head 5/5 and 110/110; eleven mutants red.
9 No local escape hatch: none at the executor/classifier/rebalancer/lane; the pending join (F14) is the one unbound
answer path.
10 Contract + registry + proof aligned: owners and witnesses registered (F5 closed); the seal is not (blocking 1); the
envelope/receipt/engine pass-through unowned (F17).

### harness-fidelity
1 Red for the right reason: sealed reds are the pre-quest behaviours (two entryIds, no identity, key dropped, replay
of the first statement, missing column); mutant reds name the mutated clause.
2 Stub honesty: the controllable port is the production port shape over a test core with the production application
owner; the S3 stub returns the production service instance; the receipt witnesses use the real envelope; my lane
probes use fake first services with the kernel's own answers and a real partition second.
3 Time fidelity: the release is the replica's own clock advanced by `PENDING_REQUEST_TIMEOUT_MS`; group timing
20/150-300 ms; F-at 2.9 s.
4 Field fidelity: the nine wire fields compared by JSON value inside vs wire; the kernel test F12 pins the sealed
witness's eight against the exported list plus `changesKnown`.
5 Vacuous assertions: "sent again" asserts `entryIds.length > 1`, "applied once" counts committed commands whose index
holds an outcome row on an independent connection; my `applications` reads the same.
6 Live binding: production engine, coordinator, executor, PartitionService, CDCIntegrationService,
ControlPlaneSystemTableGateway, ReplicaOperationRepository; the consensus core of the loop witnesses is the test core
(the design's W3 shape), the receipts' and my probes' is rs-raft.

## Commands run (counts, exit codes)
- Static (static-r2.out; static-*.out): all exit 0 except check-duplication exit 1 ([test] 794/30542 > 793/30519,
  pre-existing, identical to the sealed archive) and the inventory verify (blocking 1); eslint on 45 files 0 lines.
- Receipts and witnesses (chain1-receipts.out): head 5/5 (6 s) + 110/110 (1 s); sealed 0/5 + 0/10; producer sealed
  `fail`.
- Mutants (mutants.out): control 10/10; M1-M11 each red as listed; control-again 10/10; all files restored (cmp).
- Probes (run-probes.out, each exit 0): r2-classify (2 runs), r2-receipt-replay 3 s, r2-digest 1 s, r2-fat-env-failure
  4 s, r2-replay-roles 5 s, r2-cdc-lane 1 s, r2-unwitnessed 1 s.
- Suites (chain2-suites.out): 852 files, 27825 tests, 27741 pass, 0 fail, 84 skipped, 278 s, exit 0.
- Inventory: `--refresh` in a clean export exit 0 (static-inventory-refresh.out); `--verify-import-graph` in the
  worktree exit 1 (verify-import-graph.out).
- Hygiene: `git status --short` unchanged by me; children 0 at the end of every runner; scratch only. Eight empty
  /tmp/write-attempt-* directories dated 22:57 (before this round started at 23:17) belong to an earlier run of the A2
  harness, not mine (my runs of the same witnesses left none); the six `pgrep` matches at the end are the other
  verifier's verify-fp chain, not mine.

## Not verified
- The whole corpus; GCP timing; a follower's own restart inside a live group (the lone restart and the new-leader
  replay were measured instead).
- The pending-join F14 shape across the wire on a 3-replica group (measured on a lone partition through the engine).
- `solve probe` / `solve land` themselves (I ran the guard's verify command directly; land is the lead's).
- The split-mirror participant under a client key; the S5 consumers.
