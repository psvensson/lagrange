---
audience: development
documentClass: evidence
---

# VERIFY partition-admission-fixtures r1 (2026-10-24)

## Verdict: APPROVE for commit

The staged code can be committed as it is. The implementer's classification of the residual reds is NOT approved as written. Several reds called "dead" are behaviour that still exists on this lineage and needs a test rewrite, not a deletion (finding F3). That correction belongs in the quest record and the reds triage. It does not change the staged files.

## Identity

- Worktree: `/mnt/data/peter/projects/.worktrees/partition-admission-fixtures-20261024`, branch `work/partition-admission-fixtures-20261024`.
- HEAD: `8c51246e2`.
- Staged tree: `git write-tree` = `9ce335257900ad425aadb0484366f288d94352b0`. 18 files, +333/-14.
- No unstaged or untracked changes (only ignored `node_modules`, `test-output/`).
- Lab snapshot `refs/wip/lab-pfix-2` = `cfc8a6115`. Its parent is `8c51246e2` and its tree is `9ce335257…`, the same as the staged tree. So the lab results apply to exactly this staged content.
- origin/main at verification time: `40795f7d2`.

## Per-file table

Assertion counts are `t.*(`/`assert*(` call sites, HEAD vs index. My counts come from my own local runs.

| File | Change | Assertions (HEAD→staged) | Tests | Mine (local) | Implementer (local) | Lab cfc8a6115 |
|---|---|---|---|---|---|---|
| migration/migration-partition-alter-routing | cache + resume after CREATE TABLE, before ALTER | 7→7 | 1→1 | 7/7 | 7/7 | ok |
| partition-consensus-hold-log | cache + resume after init; 2nd resume after runtime reconstruction, before healed write | 17→17 | 1→1 | 1/1 | 1/1 | ok |
| partition-replication-restart-attempt-handoff | cache + resume after `campaign()`, before target writes | 74→74 | 11→11 | not run | 104/104 | ok |
| partition-service-raft-noop-cdc-placement | cache + resume after `setRole(LEADER)`, before subscribe/write | 10→10 | 2→2 | 10/10 | 10/10 | ok |
| partition-service-raft-propose-metrics | cache + resume x4 after init | 29→29 | 5→5 | not run | 29/29 | ok |
| partition-service-size-split-transport | cache + resume in 2 tests | 81→81 | 24→24 | 76/83 (fail 2,14,15,16) | 76/83 | fail on #2 (residual) |
| partition-service-sqlite-metrics | cache + resume x2 | 13→13 | 4→4 | not run | 13/13 | ok |
| partition-service-stale-topology-write-guard | cache + resume x5 | 16→16 | 6→6 | not run | 16/16 | ok |
| partition-service | cache + resume in 8 tests; direct `enableParticipantTransactionAdmission` replaced by the fixture; resume on restart | 102→102 | 31→31 | 87/97 (fail 25,27,28,29,30) | 87/97 | fail (residual) |
| partition-statement-admission | A4 released by real owners | 11→11 | 11→11 | 10/11 (fail A2) | 10/11 | fail A2 (residual) |
| partition-write-leadership-transfer-committed | real owners release before setup write | 23→23 | 2→2 | 2/2 | (local summary in pfix/after shows 0/2: older run) | ok |
| partition-write-leadership-transfer | real owners release; transferee-drop override moved after release, still before the setup write | 9→9 | 2→2 | 2/2 | (older local 0/2) | ok |
| settled-replay-preserves-result | lone: cache + resume per lifetime; W3: real owners | 39→39 | 6→6 | 5/6 (fail W1-race) | 5/6 | fail W1-race (residual) |
| split-backfill-internal-pacing | cache + resume for source/left/right | 14→14 | 2→2 | 14/14 | 14/14 | ok |
| table-partition-structure.property | cache + resume after init | 3→3 | 3→3 | 3/3 | 3/3 | ok |
| test-helpers/participant-transaction-fixture.js | +`invalidateParticipantReleaseAdmission(leader)` before the facts read | – | – | – | – | – |
| test/shards/subsystem-classes.json, impact-graph-seal.json | regenerated | – | – | `generate-test-subsystem-classes.js --check` OK | – | – |

The `-U0` removals are only: the `enableParticipantTransactionAdmission` import and call in partition-service.test.js (replaced by the fixture, which calls the same function), the `network.deliver` override block in partition-write-leadership-transfer.test.js (moved, not removed), and the fixture's import line (rewritten to add `invalidate…`). No assertion or test was deleted or weakened.

## Findings

### F1. The fixture does not forge admission (question 1): PASS

`resumeFixtureParticipantAdmission` (`test/test-helpers/participant-transaction-fixture.js:488-534`) does four things:

1. On a ControllableConsensusPort only (`:490-502`), it installs a committed-membership answer `[leader.replicaId]` through `committedMembershipHandler`. That is the port's own documented seam: `test/test-helpers/controllable-consensus-port.js:254-259` says "The fake holds no committed configuration; a test that needs one answers through committedMembershipHandler." This is a double of a port the test already fakes. It is not a release fact. The release facts are still computed by production `readParticipantReleaseFactsAssessment` (`src/partition/partition-participant-transaction-pause.js:132-171`) and checked by production `releaseCensusDefect` (`partition-participant-release-contract.js:158-192`). On real raft-rs services (most call sites) there is no override at all.
2. If there is no origin (`:503-517`), it calls the production `enableParticipantTransactionAdmission`. This is the same writer the ENABLE action invokes (`src/node/replica-handler-participant-release.js:204-212`). The fixture skips that action's leader-role and `originRequired:false` census pre-check. This shortcut predates this diff.
3. It calls the new `invalidateParticipantReleaseAdmission(leader)` (`:524`). This call is necessary, not cosmetic. `readParticipantReleaseFactsAssessment` captures `generation = replicaGenerationOf(...)`, including `admissionGeneration` (`pause.js:161`), before `participantCutoverPauseOf` invalidates a stale OPEN admission (`:165`, `:205-211`). So without the prior invalidate, the census would carry the old `admissionGeneration`, and `releaseCensusDefect`'s own-generation check (`release-contract.js:189-191`) answers STALE. The call mirrors `src/node/replica-handler-release-recovery.js:191`.
4. It calls production `resumeParticipantCutoverAdmission` (`pause.js:252-282`) with census `[facts]`. The OPEN state is written only there (`:276-281`), with proof `{term, leaderId, configurationKey, membershipGenerationIndex, runtimeGeneration, lifecycleIncarnation}` taken from `service.raft.readStatus()`. These are exactly the production proof fields. Nothing in the fixture writes the `ADMISSIONS` WeakMap.

Judged against `test/guidelines/fixtures.md`: no `src/` change, no test-only production branch, no flag. The fixture exercises the real ENABLE writer and the real RESUME and census contract. It is acceptable.

Two caveats (advisory):

- (a) The fixture's `handler` is a plain object `{nodeId, ownerIncarnation: 1, localServices: Map}`, not a ReplicaHandler. So the `refuseStaleResume` lifecycle check (`pause.js:236-245`) passes trivially.
- (b) In `partition-service-raft-noop-cdc-placement.test.js:135-148` the service is built with three `replicaIds` (`services-test-r1..r3`), and the fixture fakes a ONE-member committed membership. This breaks the stated "single-member cohorts only" precondition. The fake membership contradicts the service's configured topology, and the census passes only because the fake says one member. Nothing in that test reads membership, so it is harmless to the test's intent. Recommended fix (not blocking): build that service with one `replicaId`, or document the deliberate mismatch. Either way the fixture should assert or document its single-member precondition.

### F2. Placement and intent (question 2): PASS

- Every resume call sits after `initialize()` plus, where applicable, leadership (`campaign()`, `startElection()`, `setRole(LEADER)`), and before the first write. This holds per the diff, and the green tests confirm it.
- The multi-member tests (partition-statement-admission A4, partition-write-leadership-transfer, partition-write-leadership-transfer-committed, settled-replay W3) use `attachPartitionReleaseOwners` correctly. The members have distinct nodeIds (`node-1..3`, `committed-node-1..3`), and the fixture builds one ReplicaHandler per nodeId (`partition-release-fixture.js:36-48`). It adds a real `sql_transactions` control partition (`:50-57`, campaigned leader `:84-87`) and runs the operator release through `participantReleaseRecovery.releaseOperator` (`:100-111`) until CUT_OVER. `owners.dispose()` runs before `group.dispose()` in each `finally`.
- In partition-write-leadership-transfer, moving the transferee-drop override after `release` is required so the release can reach r3. The override is still installed before the setup write, so intent is unchanged.
- Intent caveat (advisory): the second resume in partition-consensus-hold-log and the restart resume in partition-service now prove "serves after an explicit resume". They no longer prove the production property "serves again because release recovery resumed it". The comments say so honestly. The production-faithful form is the owners composition and waiting for `reconcile`.

### F3. Dead-behaviour classifications (question 3): PARTLY WRONG

Nothing below exists on origin/main. `git cat-file -e origin/main:` fails for `partition-participant-transaction-pause.js`, `partition-local-mutation-admission.js` and `partition-cdc-obligation-constants.js`, and `assertSubscriberAcceptance` is absent from origin/main's `partition-cdc-delivery.js`. Both the admission pause and the CDC obligation contract were added by `4151a3ab4`.

What is really retired: writes no longer feed the volatile path. `emitCdcEntry` is always `null` (`src/partition/partition-write-kernel.js:543,566`, `partition-service-raft-write-commit.js:216`). On origin/main, `partition-write-kernel.js:435` sets `emitCdcEntry: executedEntry`. So `generateCDCEvent` and `cdcEventBuffer` are no longer fed by writes. CDC now flows through durable obligations. A durable event is accepted only on a committed CDC outcome (`assertSubscriberAcceptance`, `src/partition/partition-cdc-delivery.js:79-89`); a plain callback that returns `undefined` is "refused" and redelivered.

CDC generation on UPDATE/DELETE/UPSERT, retry/replay after subscriber failure, and unsubscribe still exist. I proved this with probes (scripts in `scratchpad/pfix-verify/probe-*.mjs`, on the staged tree, after the fixture resume):

- `probe-ack.mjs`: a subscriber returning `buildCommittedCdcOutcome([e], g, {index, term})` receives UPDATE (asynchronously) and DELETE carrying `data.id = 'cdc-1'`.
- `probe-sizesplit.mjs`: a throwing subscriber gets the event redelivered with the payload intact about 75 ms after recovery, while `cdcEventBuffer.size()` stays 0.

Per residual:

| Residual | Implementer | My verdict |
|---|---|---|
| partition-service #25, #27-#30 (CDC on update/delete/upsert/INSERT OR REPLACE/nested DELETE) | dead | **REWRITE, not dead.** They fail because the plain callback is refused, an earlier obligation stays held, and delivery is async. Fix: add the resume, an acknowledging subscriber, and await `pendingCDCEventDeliveries`. This belongs to a CDC-obligation-contract cluster, not P. |
| size-split #2 (buffers on subscriber failure, replays) | dead | **Mixed.** The `cdcEventBuffer.size() === 1` assertion is dead (volatile buffer). The retry-and-replay property is alive (probe). Rewrite it to assert redelivery through obligations. |
| size-split #14 (unsubscribe) | dead | **REWRITE.** `subscribeToCDC` is fire-and-forget (`partition-cdc-delivery.js:723-730`), and the first event now arrives later (`probe-t14.mjs`: plain 0 sync / 2 later; awaited handshake 1 sync). The unsubscribe property still exists. |
| size-split #15, #16 | cluster H | Consistent: the failure is "Replica transport handler left registered…" (`src/node/replica-transport-handler-identity.js:33`), not admission. |
| statement-admission A2 | dead | **Agree.** The replica-0 disturbance `executeLocalQuery(TOP_THEN_ALLOCATE)` must reach ROWID_CEILING in `runAdmittedPartitionStatement`, which comes after the `unreplicatedLocalMutationRefusal` fence (`src/partition/partition-service-write-metrics-base.js:184-187`). Production cannot pass that fence (see F4). Rewrite to expect the fence refusal, or drop the replica-0 disturbance. |
| settled-replay W1-race | dead | **Agree for its stated property.** The retry lands on the reconstructed runtime, whose admission proof no longer matches, so it is refused `partition_write_cutover_paused` with `deferRetry` (my tap). "Proposed while the runtime is being replaced" no longer holds. The "answered applied, never UNIQUE" property is covered by W1 at `:253` (green). Delete or rewrite as paused → resume → retry. |
| cdc-generation.property (untouched) | dead/unknown | **REWRITE.** Same plain-callback `subscribeToCDC` shape (`probe3`: 0 sync, redeliveries later). CDC generation exists. |
| cdc-subscription-catchup (untouched) | dead/unknown | **Likely dead as written.** It expects `catchup.mode === backfill`, which requires `cdcEventBuffer` events at handshake (`partition-cdc-delivery.js:572-576`), and writes no longer feed that buffer. Obligation catch-up exists, so a rewrite is possible. Not run by me. |
| seed-teardown-pending-cdc-delivery (untouched) | dead/unknown | **UNKNOWN, not proven dead.** Obligation delivery still registers in `pendingCDCEventDeliveries` (`partition-cdc-obligation.js:167`, `partition-cdc-obligation-delivery.js:137`), so "teardown with a pending delivery in the batch window" is still a meaningful property. The implementer's probe (`pfix/seedprobe.txt`) shows the write succeeding after resume but no batch entry in 10 turns. Cause not determined. |

Side observation: partition-service #22 ("generates CDC events on insert", now green) passes on the FIRST, refused, delivery attempt of a plain callback. The obligation keeps redelivering until shutdown. It is green, but it does not prove an accepted delivery. It should get the same acknowledging subscriber as the rewrite.

### F4. Bootstrap-admitted null branch (question 4): UNREACHABLE in production

The branch is `src/partition/partition-local-mutation-admission.js:26-32`: it returns `null` only when origin is `null` and admission is not CLOSED (OPEN).

- OPEN is written only by `resumeParticipantCutoverAdmission` (`pause.js:276`).
- That function calls `releaseCensusDefect` without `originRequired:false`. So `sameOrigin` requires `originEqual(facts.origin, local.origin)` (`release-contract.js:167-168`), and `originEqual` rejects `null` (`:98-102`).
- The only `originRequired:false` callers are the ENABLE action (`replica-handler-participant-release.js:207`) and the coordinator's pre-ENABLE census (`replica-handler-participant-cutover.js:336`). Neither opens admission.
- The origin is written once (`… WHERE singleton = 1 AND origin_index IS NULL`, `partition-participant-transaction-constants.js:262-263`) and is never cleared in `src`.

So OPEN implies an origin, and the branch is unreachable. The function collapses to "always refuse". Consequently the whole admitted LOCAL-mutation tail after the fence (`write-metrics-base.js:188-197`) is unreachable in production. Remaining unknown: whether a snapshot install could replace `_partition_write_generation` under a live OPEN lifetime without bumping `runtimeGeneration`. I did not trace that.

R11 deletion candidates for the partition owner (report only): the null branch plus that LOCAL mutation tail. Also, with `emitCdcEntry` always null, the `generateCDCEvent` call in `applyWriteSideEffectPlan` (`write-metrics-base.js:691-702`) is unreachable from writes. Only tests call `generateCDCEvent` directly.

### F5. The two release fixtures (question 5)

- **`resumeFixtureParticipantAdmission(service)`**: one service; optional port membership double (controllable port only); production ENABLE writer called directly (no ENABLE-action census); a plain-object handler; one facts read; release identity; production RESUME with a census of one. It has no coordinator, no PAUSE/REOPEN/drain phases, no `sql_transactions` control partition, and no real ReplicaHandler lifecycle. In effect it re-implements, in miniature, the tail of the coordinator's ENABLE → RESUME sequence.
- **`attachPartitionReleaseOwners(services, {directory, budgetMs})`**: real ReplicaHandler per node registered on the shared transport, real `sql_transactions` control partition, and the full production operator release (`releaseOperator`, retried to CUT_OVER). Its release recovery also re-resumes after a runtime replacement.
- **Overlap**: both end in production `resumeParticipantCutoverAdmission`. The single-member fixture's ENABLE → facts → identity → RESUME sequencing duplicates the coordinator's ordering logic, which is a second version of that logic in test code.
- **Can the single-member one be expressed through the owners composition?** For real raft-rs single-replica services: yes. `attachPartitionReleaseOwners([service], …)` requires only `transport` and `systemTableCache` plus a directory for the control DB. Most of the call sites here use `:memory:`, so they would need a temp dir. For ControllableConsensusPort services (noop-cdc-placement, and the fixture's own `setupLeader` at `:444-446`): not without keeping a port-level committed-membership double, and those services lack a transport. They would keep a thin port double and could not use the coordinator unchanged.
- **Migration estimate**: 45 call sites of `resumeFixtureParticipantAdmission` across 17 files (7 of them controllable-port or `setupLeader` users); 13 files already use the owners composition. Migrating the real-port sites means about 10 files, each gaining a temp dir plus attach/release/dispose (about 6-8 lines per test). For example, partition-service.test.js has 8 sites. Each test also pays a control partition and a handler (roughly 100-300 ms). The consensus-hold-log and restart cases would then prove recovery-driven resume. This is a one-to-two-sitting quest. The controllable-port uses would stay on a reduced fixture that keeps only the port double and delegates ENABLE/RESUME. I recommend it as a follow-up, not as a blocker for this commit.

### F6. Static checks (question 6): PASS

- `node --check` on the 16 changed `.js` files: clean.
- `npx eslint` on the same files: rc 0, no output.
- `npm run -s test:duplication` on the staged tree gives test 701 groups / 26614 lines, rc 1. The same script on an exported HEAD tree (`git archive HEAD`) gives 701 / 26618, rc 1. So the test ratchet is red on the base already (baseline 697 / 26369), and this change adds **no clone groups** and removes 4 duplicated lines. The 4 clone groups touching changed files are the same pairs before and after, only shifted. src+scripts: 46/47 OK on both.
- `node scripts/generate-test-subsystem-classes.js --check`: OK (2459 tests, digest `fnv1a32-3727d304`).
- `impact-graph-seal.json` was not independently regenerated by me (unknown). The land gate's import-graph seal covers it.

## What I ran (all local, sequential, each file gated by `scripts/checks/wait-for-thermal-headroom.js`)

Logs are under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/pfix-verify/`:

- `summary.tsv` plus one `.tap` per file, for: migration-partition-alter-routing, partition-service-raft-noop-cdc-placement, partition-consensus-hold-log, split-backfill-internal-pacing, table-partition-structure.property, partition-write-leadership-transfer, partition-service, partition-write-leadership-transfer-committed, partition-statement-admission, settled-replay-preserves-result, partition-service-size-split-transport. Every count matches the implementer's and the lab's.
- `duplication.log` (staged) and `duplication-base.log` (HEAD export in `base-tree/`).
- `shards-check.log`. An accidental `generate-global-owner-debt-inventory.js --help` invocation failed with ENOENT before writing anything; `git status` was unchanged afterwards.
- Probes: `probe-ack.mjs`, `probe-sizesplit.mjs`, `probe-t14.mjs`. I also re-ran the implementer's `pfix/probe2.mjs` and `pfix/probe3.mjs`.

## Limits and unknowns

- I did not run locally: partition-replication-restart-attempt-handoff, propose-metrics, sqlite-metrics, stale-topology. For those I relied on the implementer's runs and the lab ndjson (all ok).
- I did not run the three untouched files. Their verdicts above come from source plus probes.
- seed-teardown-pending-cdc-delivery: root cause unknown.
- Snapshot-install interaction with an OPEN admission and a null origin (F4): unknown.
- `impact-graph-seal.json` correctness: not independently checked.
- No full `npm test` and no land gate run.
- Besides this report, I wrote only the logs and probe scripts listed above under `scratchpad/pfix-verify/`. Nothing was edited in the worktree or in `/mnt/data/peter/projects/lagrange`.
