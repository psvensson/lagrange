# Recovery checkpoint interaction review — round 2

Reviewer: `subagent:/root/review_checkpoint_composition`  
Author: `checkpoint_implementation_56`  
Date: 2026-10-11

## Verdict

**F1–F4 are corrected at their bounded source interaction. Reject this exact composition as an approved recovery foundation until F6 is corrected; F7 also fails the requested timer-lifetime check.** The new durable CDC lane exposes a transient-read failure with neither a recovery wake nor a retained typed hold, and creates an unhandled rejection. This is a newly composed owner interaction, separate from the accepted open activation/resource work.

The F5 canonical-terminal correction remains approved at its exact two files. The previously approved two snapshot-marker branches remain unchanged and retain their narrow approval. Neither approval establishes normal startup, physical recovery or merge readiness.

The 24 activation reds remain **open production integration evidence**, not harmless test failures. The normal startup trace below reaches the same closed mutation admission and finds no production caller of the resume owner. The origin-only case additionally contains an obsolete expectation that an origin alone opens admission. Fix the shared authorization/startup owner before changing broad fixtures; do not force admission open.

No source, test, metadata, index or Quest-log edits; no commit, merge, publication, cluster run or raw SSH. Only central ignored review artifacts were written.

## Exact reviewed source

W = `/mnt/data/peter/projects/.worktrees/rs-raft-recovery-chain-20261011`.

- Base/HEAD: `10c2f0610f2924b8e7773497b03ac95fa4f42e58`.
- Source snapshot: `a9c9290bae4e4a882e0317d9a79bd856b9ffc268`.
- Snapshot tree: `ef0a6d84e01eec3ffd7c512a9e39b6daf1521209`.
- Index remains `be8cd676baf918aa39e721ebde2678930e93ca4a` (65 paths). The current overlay is not that index.
- All **102** live full-manifest entries independently passed `sha256sum -c`.
- `E = W/test-output/recovery-checkpoint-20261011/f1-f4-owned-interaction`.
- Full manifest SHA256: `2456062883aa365acf0978a5f548ebbd0e8f72e4c0cc84957cf184930b194f24`.
- Correction `changed-manifest.sha256` (45 paths): `003e107643554d0bb7fdda6bab6cd758fa6aa8f75b5ff2e1445881dada62a2cb`.
- `correction.patch`: `98fa3a0e9dbf8e6471fb0a96bfd21933ee4ec28c6d56e9b5a82c1aeee31eebcd`.
- `README.md`: `5a7b0da40437f73a6d235d9c6520414809b73ce00c79a40483b5cdb68b449b15`.

The 45-path overlay comprises the approved F5 two files, 36 exact a01 owner-chain files, restored preproposal envelope validation, one durable-CDC test expectation and five metadata files. Exact a01 provenance is not blanket approval of its surrounding implementation. Durable CDC obligations are distinct from the rejected C17 cache-hydration implementation.

Earlier independent reports read and retained:

- Initial composition review: `review-recovery-checkpoint-composition.md`, SHA256 `44acde2fbf47c9e45b22ee5ca69c0b3741da1c00046e1358abb792fa637fa963`.
- F5 correction: `review-checkpoint-release-terminal-correction.md`, SHA256 `b5d07f499e83d15ff5c0648bb3f944cc3bd739186df06f524077046ec0d8d906`.
- Historical source binding approval: a01, nineteen exact files, review `cc6b0e9809ee1b9ed522e0869899602b03f3d77d748d1a5bf9a19b92a5dbf08c`; historical test-only supplement 20b, review `6a6ca0381274eed44877f5cea3fe5cacc0cb69649c0226512e6303abc8679c17`. Their original scopes remain separate.

F5 source/test still hash `904da2c331f1fc522623769c1def7683a108e2b49e1715f3e02778b6c580527c` / `bc67711f88234c158d858fd1a0ad637b5e2207c5e4f7d2c9e6b04574273f32b8`. Marker source/test remain `bab76ee45d80cbdd274ca83cf5856bf36013f6c62d570aa45bc95cc57c458bdc` / `5fc0eae78abea99b07e2d807cf2c21b53ea51338b7146e46b1ce463d2ec352f4`. Candidate C2 raft/rebalancer bytes are not changed by this correction.

## Independent execution

P = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/checkpoint-interaction-round2-review`.
Commands run from W:

1. `node --test test/partition/participant-decision-canonical-record.test.js test/partition/partition-cdc-obligation.test.js test/partition/partition-coordinator-settlement.test.js test/query/transaction-coordinator-settlement.test.js test/query/transaction-schema-enforcement.test.js`: **44/44**, `P/owners.log`, SHA256 `e2444f1ba498f4c08b0acba90ffec12636a4367bf8a41c0300943b2a8f7281d6`.
2. Original independent `checkpoint-composition-review/owner-probe.mjs`: actual schema/origin/INSERT, command admission and message dispatcher. `P/owner-probe.json`, SHA256 `63fd216b5b20bd9f7f0c15a28d906ead6606e8087ae04fa07d18293ea6a4619c`.
3. `node --test --test-name-pattern='admission owner admits every|execution envelope on the wire' test/partition/partition-participant-transaction-apply.test.js`: **one selected test**, pass, `P/f2-f4.log`, SHA256 `61e20e03174fd4f2809d30c28228460dd085e7a2ec0001997054aac0fccedf2a`. The second alternative selects nothing in that file; it is not counted as two tests.
4. `node --test --test-name-pattern='TX1 v3 W20' test/partition/partition-transaction-replicated-apply-v3.test.js`: **one selected test**, pass, `P/envelope-apply.log`, SHA256 `f8fa54aa077ef80a52f544dd954ae167f5147aee614279d7c8689518d50160c2`.
5. `node --test test/query/transaction-review-adversarial.test.js test/query/transaction-coordinator-participant-protocol.test.js test/query/transaction-release-settlement.test.js test/query/transaction-evidence-binding-production.test.js`: **51/51 reported tests**, `P/binding-f5.log`, SHA256 `ba90e5b64192c943b29ec444e731ce90ca19e65430906896e25cc3b7184cd770`.
6. `node --test test/partition/partition-write-kernel.test.js`: **97/97**, `P/kernel.log`, SHA256 `ee923d629eb8d6a819e135f9a0e6385010e6fcbe08c71ec4220d44e78ab73112`.
7. `npm run audit:impact-contracts`: pass, 63 contracts/34 pairs, registry digest `fb506cf179239221c03330852db204b2224dfccf7a52cf30b52314da61e82ade`; `P/impact.log`. `npm run audit:shards`: pass and all three generated classifications current, 2353 tests; `P/shards.log`. `git diff --check`: pass. Seal remains `c1716257408793daeb2c6c738ccf23af37263d7bd08c340c2a694dcc87624a3b`.
8. The diagnostic scripts below each ran against the same source. Their commands are `node P/<name>.mjs`. They use actual PartitionService initialization/application, real SQLite, controlled consensus ordering and explicit fault injection. They are review counterexamples, not registered acceptance tests or full node startup.

The author logs, commands, manifests, source interaction diffs, old red reports and new witnesses were examined; the complete correction patch is fingerprinted above. Reported greens do not subsume the retained 24 reds or the new counterexamples.

## F1–F5 disposition

| Finding | Disposition and decisive source/state |
|---|---|
| F1 missing origin installer | Corrected. `partition-participant-transaction-apply.js:576-596` installs the canonical coordinator schema guard in the origin application transaction, including replay, before reading/recording origin. Actual probe: origin 2, trigger `sql_transactions_initial_lineage_v1`, valid initial INSERT applies, durable row ACTIVE. Prior exact 65-path probe had origin 2/no trigger/environment failure/no row; base INSERT also succeeded. Schema tests cover malformed initial rows, altered enforcement and outer application failure. |
| F2 removed pinned envelope | Corrected. `partition-participant-transaction-bytes.js:323-340` requires `isExecutionEnvelope` for PREPARE and DECISION before proposal while retaining canonical decision validation. Same original probe now refuses missing PREPARE envelope and empty decision sqliteVersion, with the valid control admitted. Prior exact composition admitted both invalid commands. W20 independently verifies an already committed mismatched envelope applies and diagnoses; it does not stall or reinterpret the sealed contract. |
| F3 absent settlement receiver | Corrected. `partition-service-entry-apply-base.js:290-398,1041-1045` now dispatches and applies the fixed owner command. `partition-coordinator-settlement.js:45-117` supplies leader admission, canonical query-owner observation, deterministic entry identity, pending join, committed CAS, retained typed result and replay. The actual dispatcher probe now gives typed nonleader refusal rather than unknown-message. Four actual receiver tests pass: freeze/rollback while ordinary writes are closed, forbidden new COMMIT, an enlist conflict retained unchanged, and applied-index failure rolling back row and retained result together. |
| F4 incompatible fixture status | Corrected. `controllable-consensus-port.js` now supplies the status/configuration/applied/lifecycle fields consumed by release facts. Actual pinned-admission assertions run instead of failing in fixture setup. The fixture obtains release facts and consumes the existing resume predicate; this is a controlled single-replica fixture, not a production authorization consumer or remote census proof. |
| F5 weak release terminal tuple | Exact approved correction preserved. Release invokes the same `committedAnswerOf`/`rolledBackAnswerOf` as normal coordination after expected-request capture. Independent 51-test run keeps invalid/foreign replies pending with durable COMMIT and identity unchanged, then valid redrive completes; durable REFUSED/NOT_COMMITTED rollback recovery remains valid. The earlier F5 review's scripted delivery ceiling remains. Actual F3 receiver coverage is additional, not a claim that all release/startup wiring is complete. |

## New findings — complete batch

### F6 — transient durable-CDC read failure strands the wake and emits an unhandled rejection

`partition-cdc-obligation-delivery.js:565-610` reads the ledger before the per-event refusal handler. When `readOwedCdcTail` or `readOwedCdcObligations` throws, the outer catch logs and rethrows; it does not schedule the existing retry, retain a typed drive hold or consume a queued rerun. The finally clears `inFlight`. `partition-cdc-delivery.js:141-147,676-677` tracks the drive and catches the returned subscription promise, but `partition-service-cdc-stream-base.js:225-233` creates and discards `promise.finally(...)`. Its returned rejected promise is unhandled. Leader-election callers also do not handle the drive's own rejection.

This is a new caller/owner composition exposure of an inherited tracking-helper weakness. It is reachable with a transient SQLite read failure, independent of missing activation authority, cache hydration size or BEGIN classification.

Reproducer: `P/cdc-read-failure.mjs`, SHA256 `680894bc117ca2f33a1e595d4cae27bdbca261da2a8aa185cd640bfee2055a97`; final result `P/cdc-read-failure-settled.json`, SHA256 `5bf34402c16c51f90edde442091f274b99fa82de4dc7d73d6ecd0ff46b71c3be`.

The script settles initial fixture leadership first, commits a real ordinary INSERT and its obligation, then injects one `SQLITE_BUSY` throw at the database prepare seam for the ledger SELECT on the **normal public subscription handshake**. It immediately restores normal reads, advances the injected clock 60 seconds and measures durable state and lane state. A listener records the otherwise unhandled rejection so the observation can finish; no production error handler is replaced. This is fault injection, not a claim to have induced a physical SQLite lock.

| Boundary | SQL row / durable debt / emitted work |
|---|---|
| After committed INSERT | Row `row-1/value-1`; owed 1, delivered 0; no subscriber delivery. |
| Subscription wake read fails | Received 0; owed 1, delivered 0; no ACK batch/proposal; `retryArmed:false`, `held:null`; lastDrive misleadingly remains the prior `no_subscribers`. Error is logged. |
| Reads restored, 60 seconds later | Still received 0, owed 1, delivered 0; no retry armed; one captured unhandled `SQLITE_BUSY` rejection. |
| Explicit canonical-owner wake control | Original `entry:read-failure` delivered once without SQL rerun; normal ACK proposed and committed; owed 0, delivered 1; original SQL row remains. |

An earlier retained diagnostic (`P/cdc-read-failure.json`) let the fixture's initially delayed LEADER_ELECTED occur after the fault, which rescued delivery. It is **not** the stranding witness and is excluded from that conclusion. The final settled-start version removes that unrelated future event; both executions expose the unhandled rejection.

Required bounded repair: the existing obligation owner must retain/re-drive a recoverable read failure with the same event/ACK identities, normal backoff, lane/tenure fences and pressure limits. Promise tracking/callers must consume exceptional completion without manufacturing an unhandled rejected promise. Permanent corrupt evidence may stop with an explicit owned hold; do not treat missing/unreadable rows as no debt. Add this read-failure/recovery witness through the existing metadata mechanism. No new recovery framework or alternate owner is needed.

### F7 — new CDC flush and retry timers remain referenced

`partition-cdc-obligation-delivery.js:225-229,441-450` schedules host timers without `unref?.()`. `RealTimeSource.setTimeout` delegates directly to the host (`src/time/time-source.js:44-45`). The existing prepared-hold sweep explicitly unrefs its host handle (`partition-service-transaction-base.js:540-542`).

`P/cdc-timer-refs.mjs`, SHA256 `5537b305ef929c10914ab6daeb77e98a5614ce72e1d083d8434a6fffa92373cf`, exercises actual delivery with RealTimeSource. Result `P/cdc-timer-refs.json`, SHA256 `b0c797273912ff9359c6653fb216d4c31fc1f7d3ef86baec47d533fabf352fda`: accepted delivery gives `flushTimer.hasRef() === true`; refused subscriber gives `retryTimer.hasRef() === true`. The latter can rearm indefinitely for owed work and keep an otherwise idle process alive. Shutdown reset does cancel the handles; this is a timer-lifetime defect, not lost durable data. Preserve injected-clock operation while making host timers obey the existing unref convention.

## Retained activation reds: normal startup dependency classification

This is a source trace plus a real initialized partition boundary witness, **not a successful normal node startup test**.

1. The ordinary seed workflow builds `createSeedStartupPlan` in `bootstrap-service-seed-workflow.js`; `pipeline/seed-startup-plan.js:34-43` orders registration before cache hydration. `owners/seed-phase-owners.js` dispatches REGISTRATION to `SeedRegistrationPhase.phaseRegistration`.
2. `phases/seed-registration-phase.js:107-128` waits for leadership, enables BootstrapSystemTableWriter, then performs message-group/service/table/config/epoch/cluster-identity writes. Its `persistCurrentEpochIfMissing` and `persistClusterIdIfMissing` read existing CONFIG then require an upsert if absent (`:597-678`). These are real startup dependencies.
3. `bootstrap/system-table-writer.js:20-38` delegates to CDC mutation ownership; `cdc-integration-service-mutations.js:204` uses executeSQL; the bootstrap strategy in `cdc-integration-service-lifecycle.js:325-332` calls the direct SQL owner. `cdc-bootstrap-direct-sql.js:137-165` first uses the replica's normal executeQuery, then its inherited local fallback on failure.
4. Both candidate paths are now fenced: `startAdmittedPartitionWrite` calls `pausedWriteAnswerOf`; `executeLocalQuery` invokes `fenceLegacyLocalMutation` (`partition-service-write-metrics-base.js:196-199`). That fence refuses while CLOSED before origin, and permanently refuses local mutation after origin (`partition-participant-transaction-legacy-fence.js:180-185`). There is no repair by falling through to local SQL.
5. `partition-participant-transaction-pause.js:14-25` starts every service lifetime CLOSED. A source-tree search for `resumeParticipantCutoverAdmission` finds its definition/export only; it has no production caller. A search for `enableParticipantTransactionAdmission` likewise finds no production caller. Fixture `startLeader` supplies its own one-replica release census; that is not a supported production activation path.

`P/startup-admission-boundary.mjs` (SHA256 `1ef2586df448cfb6cff8879e1635fd0c805ca9aa2a8845c176c41f2151a9888c`) starts the real initialized service with a controlled leader port and no test origin/release. The normal SELECT succeeds. Ordinary INSERT refuses `partition_write_cutover_paused`; local INSERT and legacy BEGIN refuse `participant_transaction_cutover_paused`; no proposal is emitted, origin stays null and SQL rows remain empty. Result `P/startup-admission-boundary.json` hashes `16d4e5ce127f64bf8635c6b097c80ba8ec2f042fef167be8df4ba3d68751e2c6`. This confirms the traced shared boundary without forcing it open.

Classification:

- **23 broad ordinary-write reds:** retain as activation/startup integration blockers. Their fixtures lack the new release facts, but the production path lacks a resume consumer too. They cannot currently be called merely fixtures missing a supported production activation. Repair the common owner interaction before updating individual fixtures; rerun their actual downstream assertions afterward.
- **One origin-only red:** the old expectation “origin applied ⇒ BEGIN succeeds” is obsolete under the new authorization boundary. Its replacement must independently prove origin and authorized resume; simply loosening expected success or inserting a force-open flag would conceal the production gap.
- The former 24th broad red was the volatile CDC side-effect expectation; its intentional durable-obligation replacement is independently green (97 assertions). It is not part of the retained 23+1 population.

This shared dependency prevents any present claim that the checkpoint offers usable normal startup. Preserving source on a non-main branch is possible only with that limitation recorded; approval of fresh-storage authority, existing-data operator authorization, full remote census, restart identity and one carried deadline remains absent.

## Resource and recovery ceilings retained

The newly composed CDC lane has meaningful **count and ACK bounds**, not a complete process-memory bound:

- One drive per partition/lane, one ledger page per turn; `readOwedCdcObligations` uses `.all(...limit:256)` before mapping. All 256 event JSON strings are materialized. One event is decoded for sequential subscriber delivery, and wrappers/sliding-window retention create further copies/references.
- ACK groups are bounded to 256 events and 64 KiB; at most two outstanding commands, plus the current batch and pending identity map. ACK digests keep command size independent of long event IDs; the pending map still retains those IDs. Drive checks ACK backpressure before each event. Retry starts at 50 ms, doubles to a 10-second cap; one lane timer and same-command replay avoid parallel retry amplification.
- Capture retains the events of a whole participant operation batch until its application transaction completes. Stage limits are 256 operations / 1 MiB command input, which do not bound expanded row/event bytes. A page count does not bound a large supported event, decoded data, string copies, or 256 retained recent events.
- No process-wide active-partition/byte budget was established here. Memory scales with concurrent partition lanes and event/key sizes. Owed retention and delivered-row reclamation also remain outside this review. No finite aggregate memory ceiling, >16 MiB event transport proof, hydration concurrency/ACK reconciliation proof, or manifest byte-bound approval is inferred.

Existing obligations survive normal callback refusal, leadership change, unknown ACK and restart in the tested paths. O8/O9 use real database close/reopen and ordinary subscribe/LEADER_ELECTED hooks with a controlled port; they manually establish fixture leadership. They do not prove the full startup orchestrator invokes snapshot/authorization/discovery/CDC in a non-circular order. F6 shows an additional local failure that must be fixed even before that broader acceptance.

Uncertain-BEGIN collision classification remains open. The accepted immutable matching/progress preservation correction and its test-only supplement do not authorize a remint on a generic constraint, timeout, stale read or unavailable outcome. No BEGIN redesign or classification closure is part of this review.

## Category-complete review (63 items)

Paths below are relative to W unless prefixed P/E. Short names: **Apply** = `src/partition/partition-participant-transaction-apply.js`; **Request** = corresponding `...-request.js`; **Bytes** = corresponding `...-bytes.js`; **Settlement** = `src/partition/partition-coordinator-settlement.js`; **QuerySettlement** = `src/query/distributed/distributed-transaction-settlement.js`; **Lane** = `src/partition/partition-cdc-obligation-delivery.js`; **Ledger** = `...-ledger.js`; **Hook** = `src/partition/partition-cdc-obligation.js`; **Wire** = `src/query/sql-query-engine-participant-wire.js`. PASS is bounded evidence; OPEN is not waived.

### A — admission (7)

| Item | Disposition and evidence |
|---|---|
| A1 | PASS F1/F2 closure: origin installer in Apply:576-596, Bytes:323-340, actual owner probe and W20. |
| A2 | PASS bounded tuple/refusal: Wire:220-306; exact F5; Settlement:45-117 and actual closed-admission receiver tests refuse new COMMIT but preserve existing decisions. Activation remains OPEN. |
| A3 | PASS unchanged budgets: write commit's `proposeWithinDeferralBudget`/pending queue remain canonical; CDC unknown-ACK O14 retains exact command across the existing 30-second request timeout. No startup total-budget claim. |
| A4 | PASS F3: deterministic settlement command, canonical result before retention/replay; `partition-coordinator-settlement.test.js` actual handleApplicationMessage, four cases. |
| A5 | OPEN activation: fixture resume consumes existing owner and permits real accepted work; production source has no resume caller. Startup trace above. |
| A6 | PASS bounded binding: Request decision/session/row checks, Bytes canonical decision, F5 expected-request snapshot; pause owner final generation check has no intervening await. Remote authorization scope remains OPEN. |
| A7 | PASS transaction/partition identity in refusals and retained results; FAIL F6 diagnostic lane state remains prior no_subscribers after failed read. P/read-failure result. |

### Y — retry (7)

| Item | Disposition and evidence |
|---|---|
| Y1 | FAIL F6. Normal leader/subscription wake and ACK retry exist (delivery:129-132,676; Lane:429-449; O8/O9/O14), but transient ledger-read failure drops the wake. |
| Y2 | FAIL F6 read-unavailable handling; it neither clears debt nor declares completion, but has no retained retry/hold. Existing finite write deadlines remain unchanged; CDC owed work itself is not expired. |
| Y3 | FAIL F6 exception exit; other preconditions are named shutdown/not_leader/no_subscribers and ACK refused/unknown/held/backpressure (Lane:305-419,478-489). |
| Y4 | PASS bounded owner dependency: fixed settlement and CDC ACK use internal committed path while ordinary admission is CLOSED. Actual receiver and O8/O9 cover it. Normal startup authorization dependencies remain OPEN. |
| Y5 | PARTIAL/OPEN resource ceiling: Lane single-flight/page 256/two outstanding ACKs/backoff 50 ms→10 s. No global partition or event-byte bound; see resource section. |
| Y6 | PASS: actual settlement retained replay; Hook ACK positional/digest validation and delivered conditional write; O7/O9/O14 replay same identity, no SQL rerun. |
| Y7 | PASS: unknown ACK keeps frozen command; request timeout does not delete owed debt; F5 preserves durable COMMIT and original transaction. Uncertain-BEGIN remint classification remains OPEN. |

### T — transport (5)

| Item | Disposition and evidence |
|---|---|
| T1 | PASS: real settlement answers only after committed application or retained result, transport ACK alone is insufficient; F5 canonical terminal consumer unchanged. |
| T2 | PASS: foreign transaction/participant/operation replies refused in binding-f5; CDC O7 wrong partition/position/digest refuses whole ACK; O11 rejects old-tenure subscriber completion. |
| T3 | PASS canonical query settlement result and wire tuple classification; callback-level undefined success is the existing subscriber contract, explicit semantic false refuses (O15), provisional remains owed (O17–O19). |
| T4 | PASS bounded receiver nonleader refusal in original owner probe; unknown/failed proposal preserves pending/debt. F6 is the separate exception-path defect, not a transport success. |
| T5 | PASS stated ceiling: actual PartitionService/SQLite/request/committed application and controlled port status. Query binding tests script remote answers; no actual network/quorum/startup certification. |

### S — timers and authority (5)

| Item | Disposition and evidence |
|---|---|
| S1 | FAIL F7: injected now/timers are used, but new host ACK/retry timers remain referenced. RealTimeSource hasRef witness. Existing prepared hold sweep stays unref'd. |
| S2 | PASS: Lane:103-117,354-377 gates current tenure around await; Hook proposer uses canonical leadership refusal. O11 exercises tenure switch. No participant self-rollback added. |
| S3 | PASS bounded restart: O8/O9 close/reopen DB, recreate JS lane, recover same ledger identities through subscribe/leadership hooks. Not full startup. |
| S4 | PASS: prepared durable state is not a lease; existing sweep only reports; O14 unknown ACK and F5 COMMIT retain obligations beyond request settlement. |
| S5 | PASS owner paths: fixed settlement and ACK use `startPartitionRaftWriteCommit`, not ordinary `startAdmittedPartitionWrite`; data/ACK apply remains reachable while admission is closed. Startup dependency classified above. |

### R — recovery (5)

| Item | Disposition and evidence |
|---|---|
| R1 | PASS: Apply:399-444 + Hook capture/record execute inside application transaction with participant row, operation outcomes, generation and applied index. O1/O16 and settlement applied-index failure roll back effects together. |
| R2 | PASS bounded discriminator: durable origin preserved on replay; `partition-reopen-options.js` requests durable membership, not genesis. Helper has no production consumer in this snapshot; no reopen/startup approval. |
| R3 | PASS: actual transaction/CDC witnesses have nonempty operations and debt; F5 tests nonempty participant manifests. Settlement empty-set freeze/ROLLBACK is deliberate, and empty COMMIT is refused. Missing/invalid manifests do not become completion. |
| R4 | PASS: participant COMMIT replay returns row outcome without re-execution; CDC O7/O9/O12 retain exact event identity/payload; settlement replay returns retained result without rewriting advanced row. |
| R5 | PASS safety, FAIL F6 progress: unavailable read does not delete debt or prove absence. QuerySettlement distinguishes absent/unavailable/refused. Known BEGIN uncertainty remains OPEN. |

### C — concurrency (5)

| Item | Disposition and evidence |
|---|---|
| C1 | PASS existing ownership: committed apply serializes SQL; prepared reservation parks writes; write queue bounds pending proposals; one CDC drive per tenure. Source: write-commit handoffs/park/re-admit; Lane:590-610. |
| C2 | PASS: settlement observes before proposal and revalidates canonical CAS at apply; enlist-between test retains conflict. Lane checks tenure and current subscriber set after await (:461-468); pause resumes after final synchronous generation check. |
| C3 | PASS: QuerySettlement fixed WHERE binds row identity/manifest/decision; command digest pins one retained result; ACK marks each delivered flag once only after full positional judgment. |
| C4 | PASS tested interleavings O10/O11/O14/O18; lane identity and pending map prevent old completion settling a new tenure. F6 shows exception wake loss; broader hydration-scan/ACK concurrency remains OPEN. |
| C5 | PASS keys: partition request owner + transaction/participant identity, entry outcome key, ledger unique logIndex/ordinal and event digest, current subscriber set. No new global lock or second queue introduced. |

### F — startup/formation interaction (5)

| Item | Disposition and evidence |
|---|---|
| F1 | PASS bounded inventory: origin writes guard+generation; participant apply writes data/outcome/debt; settlement writes fixed coordinator row/result; ACK writes delivered flags; ordinary SQL records durable CDC. Actual owners.log and probe. |
| F2 | PARTIAL: Lane reads SQLite ledger directly, not an unhydrated cache; valid subscription/leader wake drives it. FAIL F6 when that read is unavailable. |
| F3 | OPEN production startup: traced seed registration mutations encounter CLOSED ordinary/local paths; no production resume consumer. Startup-admission-boundary witness confirms refusal/no proposal. Admitted fixture success does not waive this. |
| F4 | OPEN normal startup/recovery order: no new global readiness barrier introduced, but no full snapshot/auth/census/CDC startup proof. Same candidate and one inherited request budget kept. |
| F5 | PASS no new escape hatch: original direct local fallback is also fenced; no trigger disabling, fabricated ACK or origin-only resume in production. Controlled fixture authority is explicitly limited. |

### H — harness fidelity (6)

| Item | Disposition and evidence |
|---|---|
| H1 | PASS: prior exact source probe records semantic F1/F2/F3 reds separately from F4 setup failure. Current identical probe reverses those outcomes. F6 has a real owner failure and explicit valid control. |
| H2 | PASS stated composition: actual PartitionService, real SQLite, actual message dispatch/commit hook; controlled Raft ordering and scripted query remote answers remain explicit limits. |
| H3 | PASS bounded scheduling: O8/O9 recreate service/DB; F6 settles initial leadership before fault and preserves the earlier rescued run separately. No compressed deadline falsely classified as a durable outcome. |
| H4 | PASS full fixture status/configuration/lifecycle fields restored; PREPARE/decision bytes and row/debt flags asserted. No claim that one-replica census proves remote population authority. |
| H5 | PASS nonvacuous observations: actual initial coordinator row; actual COMMIT operation/debt rows O1/O2; F5 before/after COMMIT rows and fanout; F6 SQL row + owed/delivered + ACK control. |
| H6 | PASS exact 102-path manifest and scope accounting; 44,51,97 and the two one-test runs are separate populations. 24 activation reds, F6/F7 and no full-startup/main acceptance remain explicit. |

### O — owners (10)

| Item | Disposition and evidence |
|---|---|
| O1 | PASS: query owns decision/CAS; Wire owns accepted reply tuple; participant committed apply owns data and debt; delivery owner owns ACK proposal; ledger apply alone marks delivered. Diagnostics do not settle debt. |
| O2 | PASS F1–F4 closure: origin/guard, command admission, receiver/application/retained result now compose. FAIL F6 adjacent delivery/tracking exception interaction. |
| O3 | PASS bounded paired witnesses: invalid pinned commands + valid control; actual settlement forbidden COMMIT + valid rollback; F5 bad reply preserves durable decision then valid retry succeeds. |
| O4 | PASS O11 stale tenure and O14 unknown→same-command recovery; F5 bad→current valid reply. FAIL F6 transient read→available does not itself reenter. |
| O5 | PARTIAL/OPEN: existing ACK backpressure retained, no raised global limit; actual aggregate event/manifest memory budget remains unproved. No claim of >16 MiB boundary closure. |
| O6 | FAIL F6; leader, subscribe and ACK-commit hooks exist, but an exception can lose the only pending wake. Normal valid O8/O9 hooks do not excuse it. |
| O7 | PASS: projection counters/lastDrive never mark ledger delivered or authorize COMMIT. F6's stale diagnostic is recorded as a defect, not consumed as authority. |
| O8 | PASS treatment identity: prior frozen65 semantic probe and current102 probe, exact manifests; expected negatives and first rescued F6 experiment separated from positive certification. No reviewer source revert/edit performed. |
| O9 | PASS bounded search: actual settlement receiver now present; old volatile postcommit CDC emission is suppressed where durable Hook records debt; generic write cannot propose ACK/settlement owner commands. No raw Raft fallback added. Existing bootstrap local path remains fenced. |
| O10 | PASS current metadata generation/registry audits and explicit expanded transaction contract test list; source seal matches. New F6/F7 corrective tests must be registered with their source repair. Full static/corpus gates remain unresolved. |

### J — input boundaries (8)

| Item | Disposition and evidence |
|---|---|
| J1 | PASS existing numeric domains: Wire prepare indexes/terms; Ledger:286-314 safe positive logIndex/nonnegative ordinal and digest; QuerySettlement canonical epoch. No new budget arithmetic domain. Aggregate resources remain OPEN. |
| J2 | PASS at external transaction/settlement boundary: `copyStrictOwnDataRecord`, dense arrays and expected-request capture. ACK objects are internal owner output and committed JSON, with ordinary-origin ingress refused; no new arbitrary-object ACK API claimed. |
| J3 | PASS external evidence capture before canonical consume (F5); command builder canonicalizes settlement once into frozen data. Revalidation reads canonical copies. Existing internal participant/ACK object operations are not a new hostile-accessor surface. |
| J4 | PASS unchanged strict prototypes at Wire/QuerySettlement/decision-record boundaries; dense canonical records/arrays retained. No blanket prototype-hardening claim for all trusted internal helpers. |
| J5 | PASS primitive booleans/enums and durable tuple in Wire; typed strings/digests/canonical epochs in QuerySettlement; numeric/digest ACK checks. No truthy success shortcut introduced at transaction terminal consumer. |
| J6 | N/A to new arbitrary host-intrinsic mutation guarantees: this correction preserves the existing strict-input helper contract and trusted module/runtime model; it does not expose a sandbox running hostile JS. The declared input checks above remain required and reviewed. |
| J7 | PASS: settlement digest over canonical command text; participant decision/prepared digest canonical bytes; ACK event key digest and deterministic groups pin event/log/ordinal. O2/O9/O12 and canonical-decision tests verify retained bytes and identity. |
| J8 | PARTIAL/OPEN resource scope: external participant/decision arrays use dense canonical capture; ACK groups/count/bytes checked and internally built; Ledger `.all(256)` and event/manifest materialization are not byte or process bounds. No resource proposal approved. |

## Next bounded work

Repair F6 at the existing CDC obligation/tracking interaction and F7 at its timers, with refusal + restored-read delivery + same-event committed ACK proof and no unhandled rejection. Preserve the F1–F5 and marker bytes/scopes. Then wire and prove the normal authorized startup/recovery path before treating the 23 broad fixture reds as fixture maintenance. BEGIN uncertainty, activation authority/remote evidence/deadline, whole-operation resource bounds, full startup, two FreshMG replacements, seed-loss SQL/CDC/cache recovery, and exact-candidate static/corpus/physical gates all remain open.
