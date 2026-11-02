---
audience: evidence
recorded: 2026-11-02
quest: fresh-create-failure-after-committed-admission
---

# First divergence: a fresh create fails after its admission committed (2026-11-02 run)

## Inputs

| Field | Value |
| --- | --- |
| Run | Stream B Phase 0, `fresh-formation-user-table-routability` on `local-three-node.json`, candidate `b26d2c090`, harness 10:26:07Z to 10:38:51Z, RED 0/1. Identity, hosts and digests are in `work/replica-admission-committed-operation-20261102` @ `4c52a8268`, quest `replica-admission-from-committed-operation`, evidence file `phase0-reproducer-run-2026-11-02.md` (on that branch, not on this one). |
| Raw logs | `/mnt/data/peter/projects/lagrange-evidence-store/replica-admission-phase0-20261102T102607Z/.playback/report/.full-logs/fresh-formation-user-table-routability/{f596f072,b53aae47,ff632e49}-*.log.gz`. They were read in place and not copied into the repository. |
| Source | This branch HEAD `df28ef54a` (base `origin/work/learner-committed-admission-rebase-20261102`). `git diff b26d2c090 df28ef54a -- src` is empty, so every file:line below is also the file:line of the run's code. The run's stacks agree: `replica-create-admission-owner.js:374`, `:384`; `participant-release-authorization-owner.js:29`; `replica-handler-release-recovery.js:259`; `replica-handler-create-methods.js:460`. |
| Census input | Stream C census `origin/work/projection-authority-census-20261102` @ `0f6522a82`, epic `raft-rs-full-cutover` evidence `projection-authority-census-2026-11-02`, file `CENSUS.md` (on that branch): C5 (lines 268-354), C8, C13 (645-719), H3 (720-749), section 6 (U3, U10). |
| Lab | No new lab run. The logs plus source settle H3' (section 6), so no run was needed. |

Node abbreviations: `f596` is the seed (tv-dator), `b53a` is lenovo-laptop, `ff63` is adams-gamla. Times are UTC on 2026-11-02.

## 1. Timeline of the stopping chain

All entries are for `sql_transactions-p1-r4` on b53a (operation `c44b07a7`, ADD) unless another node is named.

| Time | Node | Event (log `msg`) |
| --- | --- | --- |
| 10:29:53.062 | b53a | `Handling CREATE_REPLICA request` |
| 10:29:54.485 | b53a | `Starting as learner` |
| 10:29:55.036 | b53a | `Waiting for replica voter-ready activation` (timeoutMs 60000) |
| 10:29:55.999 | f596 | `Participant release recovery` sql_transactions-p1 `cut_over`: the control partition is released before r4 joins. |
| 10:29:57.126 | b53a | `Learner promotion proof granted by leader`. This proves that r4 is in the leader's committed configuration, because the proof refuses `not_in_configuration` until the admission commits. |
| 10:29:57.144 | b53a | `Replica reached voter-ready activation state`. `seedLocalReplicaVoterRaftRole` runs here (`replica-handler-voter-readiness-methods.js:214`). |
| 10:29:57.174-.176 | b53a | `Readiness planning admission transition` moves to `deferred` with `failedTerms [freshness_not_current]` for the `controlPlaneRecoveryEligible` dimension. This applies to participationKind `replica_operation_owner_read` (b53a) and `control_plane_recovery` (owner keys f596, b53a, ff63). f596 is re-admitted at .284 and b53a at .311/.348. |
| 10:29:57.144-.194 | b53a | `authorizeFreshCreate` -> `readOperation` answers `success !== true`, which throws `CREATE admission read deferred` (`REPLICA_CREATE_ADMISSION_DEFERRED`, `deferRetry: true`). |
| 10:29:57.194 | b53a | `Shutting down partition service` sql_transactions-p1 / r4. This is the fence of the failed create. |
| 10:29:57.228 | b53a | `[replica-create] stage=failed`, then `Replica creation failed`. |
| 10:29:57.288 | b53a | The local-only reconcile proposes `INSERT INTO services` for r4 with `raft_role follower`, `status syncing` (updated_at 1793615397288). |
| 10:29:57.616 | f596 | `Failed to apply committed entry` `UNIQUE constraint failed: services.service_id` on services-p1, three times (once per local services-p1 replica). |
| 10:29:57.638 | b53a | `Partition routing candidates filtered by readiness` replica_operations-p1: `all_services_filtered_by_readiness`, `routableServiceCount 0`. All three nodes are denied with `planning_snapshot_refresh_pending`, observed at .268 to .328. This warning is rate limited to about 5 s; the previous one was at 10:29:52.459. |
| 10:29:57.704 | b53a | The INSERT is answered `DISTRIBUTED_PARTICIPANT_FAILURE` `SQLITE_CONSTRAINT_PRIMARYKEY`, `committed: true`, `outcome: statement_failed`. |
| 10:29:57.768 | b53a | `Deferred durable services row converged after control-plane recovery`, state syncing. |
| 10:29:57.903 | b53a | Diagnostic: the authoritative r4 row reads `status failed`, `previous_state syncing`, `raft_role learner`, `cleanup_token null`. The cache row reads `raft_role follower`. |
| 10:29:57.904 | b53a | State machine `syncing -> failed`. |
| 10:29:58.511 | f596 | `Operation failed` c44b07a7: `Replica failed during operation reconciliation`. |
| after 10:29:58 | all | r4 appears in no further log line except other replicas' `peerCohort`. No REMOVE operation targeting b53a for sql_transactions-p1 is ever created (section 6). |
| 10:30:12 onward | f596 | Fresh creates of control_plane_publications, schema_operations, sql_transaction_participants and sql_write_operations release with `release_fact_unavailable{current_control_owner_fact}` every 30 s. The control partition is sql_transactions-p1. |
| 10:31:13.612 onward | f596 | `Participant release recovery` sql_transactions-p1 `release_fact_unavailable{hosted_replica}`, `blockedReplicaId null`, repeating every 30 s (deduplicated log) until 10:38. |
| 10:30:54 to 10:38:30 | b53a, ff63 | 23 fresh creates fail with `Fresh replica participant release failed` (`replica_release_reply` from owner f596, or `current_control_owner_fact` with `controlMissingFact hosted_replica`). Each one is fenced, FAILED with a cleanup claim, and REMOVEd. The resulting ADD/REMOVE churn keeps the serve lane closed. f596 logs 32 `partition_write_cutover_paused` write refusals. |

## 2. Link (i): the failed authoritative `replica_operations` read

**Call path on HEAD:**

1. `replica-handler-create-methods.js:460` `releaseFreshCreate`
2. `replica-handler-release-recovery.js:259-264` `authorizeFreshCreate`
3. `participant-release-authorization-owner.js:25-33`
4. `replica-create-admission-owner.js:383-390` `authorizeParticipantRelease`
5. `:347-381` `readOperation`: `SELECT * FROM replica_operations WHERE operation_id = ?` with `CRITICAL_OPTIONS` (`:58-64`: `OWNER_RPC_REQUIRED`, leaderMode `REQUIRED`, priority `critical`)
6. `control-plane-system-table-gateway.js:183-200`
7. `control-plane-system-table-gateway-query-execution.js:449-454` `readAuthoritativeRows`
8. `control-plane-system-table-gateway-read-dispatch.js:66-157` `executeRead`
9. `control-plane-system-table-gateway-read-strategies.js:342-413` `executeAuthoritativeRead`
10. `cdc-integration-service-authoritative-read-flow.js:422-600`: local read skipped, because owner RPC is required
11. `cdc-integration-service-owner-rpc-read-execution.js:356-470` `executeAuthoritativeOwnerRpcRead`
12. `queryExecutor.executeOnPartition('replica_operations-p1', ..., preferLeader=true, {routingReadinessDimension: controlPlaneRecoveryEligible})`
13. The routing snapshot filter in `src/query/query-executor-partition-routing-snapshot.js` (`:252` sets `ALL_SERVICES_FILTERED_BY_READINESS`).

**What it returned.** The read answered `success !== true`, which takes the branch at `:373-378`. The thrown branch at `:364-371` would have attached a `cause`, and the error has none. `readOperation` discards the gateway's outcome and error text, and no info-level line records them, so the exact error string is **not observed**.

**Most probable cause: a routing refusal by a readiness projection.** This is neither leader unavailability nor a read-index timeout. The evidence:

- The call failed within 50 ms (voter-ready at .144, fence at .194). That rules out every transport or read-index timeout on this path.
- The replica_operations-p1 leader on f596 was live and serving: the r4 promotion proof had been answered at .126.
- At .174-.176 b53a's readiness owner moved the `controlPlaneRecoveryEligible` dimension for all three owner keys to `deferred{freshness_not_current}`, and f596 stayed deferred until .284.
- The next rate-limited routing warning for this exact partition and dimension (.638) shows `all_services_filtered_by_readiness`, `routableServiceCount 0`, with every candidate denied by `planning_snapshot_refresh_pending`.

**Classification.** A projection (the caller's node-readiness planning snapshot and its freshness) denied access to a live authority for about 110-170 ms. This is census C5's mechanism: routing consumes readiness projections, as recorded in `readiness-observation-currency.md`, a planning record not yet sealed. Status: **inferred, high confidence, not directly logged**.

## 3. Link (ii): a typed DEFERRED becomes a terminal create failure after committed admission

- `readOperation` types the unavailability correctly: `REPLICA_CREATE_ADMISSION_DEFERRED`, `deferRetry: true` (`replica-create-admission-owner.js:76-84`, `:373-378`).
- `releaseFreshCreate` does not consume it. The authorization is a one-shot prerequisite outside the bounded completion loop (`replica-handler-release-recovery.js:259-265`). Only `completeParticipantRelease` (`participant-release-client.js:152-185`) honours `retryAfterMs` within the create deadline (`createStartedAt + syncTimeoutMs`, `create-methods.js:458-466`).
- The exception reaches the generic catch in `createReplicaAsync`. Its sequence (`replica-handler-create-methods.js:578-656`):
  1. `fenceFailedReplicaCreateRuntime` (`:578`, `replica-runtime-cleanup-custody.js:72-98`) calls `service.shutdown()` on a replica that is already a configured member;
  2. `persistOrConfirmReplicaCreateFailed` (`:618`) writes FAILED;
  3. `REPLICA_CREATE_FAILED` is emitted with `deferRetry: true` (`:652`).
- The operation owner ignores `deferRetry`. A FAILED services row fails the operation terminally (`operation-workflow-recovery-status-reconcile.js:333-342`), so the "retry" the executor signalled never exists.

**Violated invariant** (`authority-and-recovery.md` "A refusal has an owned consequence", lines 138-145):

- An unavailability is a typed, recoverable refusal that names its reconsideration event. Here it was converted into a terminal failure.
- That failure abandoned an admitted obligation: the committed configuration entry for r4.

The Structured Deferred-Outcome policy (`regression-policy.md` :285-306) is violated in the same way: the caller converts the deferred outcome into timeout-only failure text.

## 4. Link (iii): a committed member shut down without a committed REMOVE

1. **Shutdown.** The fence at `create-methods.js:578` shuts the runtime down. No step of the failure path proposes a configuration change; the target never owns one.
2. **No cleanup claim.** `create-methods.js:623` sets `claimCleanup: error?.deferRetry !== true`. Because this error is DEFERRED, `persistOrConfirmReplicaCreateFailed` writes FAILED **without** a failed-create cleanup token (`replica-handler-create-status-methods.js:204-230`, which returns at `:230`). The 10:29:57.903 authoritative row confirms it: `cleanup_token null`, `previous_state syncing`.
3. **The planner skips it.** The FAILED-replica cure in the move planner skips any FAILED row whose `previous_state` is PENDING, CREATING or SYNCING, or which carries a failed-create token, as `ownerProtectedFailedCreate` (`move-planner-move-calculation-methods.js:51-55`, `:315-327`). It assumes that the failed-create cleanup owner on the target will release the replica.
4. **No owner releases it.** That release is driven only by the cleanup token, and the token is absent. The witness: `Failed-create cleanup release confirmed by the target lifecycle owner`, followed by a REMOVE, appears for every later failed create (r5 at 10:32:21, r6 at 10:35:51, and others), all of which failed with a plain error and `claimCleanup true`. It never appears for r4.

**Outcome.** Every relevant owner refuses to act: the create owner (no claim), the planner (protected), and the operation owner (terminal FAILED). r4 is an orphaned configured member of `sql_transactions-p1` with no runtime. The committed configuration is not directly dumped; section 6 records what it must contain.

**Side effects:**

- The configuration is 4 members with quorum 3, and r1-r3 all sit on f596. Fault tolerance for this partition is therefore unchanged in this topology, but in general a dead configured voter consumes margin.
- The other replicas' create requests still carry r4 in their peer lists (`peerCohort` of r5, r6 and r7 on ff63 at 10:31:13, 10:35:01 and 10:37:00; `service.replicaIds`, `partition-service-raft-lifecycle-wiring.js:32`). That list is plan input, not the committed configuration.

## 5. Link (iv): the committed `services` INSERT that fails UNIQUE at apply

**Where INSERT is chosen.** Not inside `ReplicaStateMachine.transition`. The chain:

1. At voter-ready, `seedLocalReplicaVoterRaftRole` (`replica-handler-create-status-methods.js:595-632`, the CL-035 seed from commit e76f0ac09, 2026-06-14) writes `raft_role` onto the **cached** row.
2. It also calls `markServiceRowLocalOnly` (`:629`). That marker means "no durable row is known to exist", but this row is already durable: it was created at PENDING/CREATING and updated through SYNCING.
3. The local-only reconcile (`replica-state-machine-create-persistence.js:144-224`) re-drives a marked row through `_createReplicaRowInCdc` -> `createReplicaRowInCdc` (`:86-134`).
4. `createReplicaRowInCdc` always submits `CONTROL_PLANE_MUTATION_OPERATION.INSERT` (`:107-112`), built from the in-memory replica state merged with the cached projection.

**View the decision used.** The node-local marker set plus the cache, never the authority.

**History.**

- The CL-021 accepted fix (2026-06-12, `closure-ledger/CL-021.md:107-118`) re-drove local-only rows "via the SAME idempotent UPSERT path lifecycle persistence uses" (`_updateReplicaStateInCdc`).
- The rs-raft cutover `1aea11baf` (2026-09-30, "replica-lifecycle durable generation") replaced that with insert-only admission. The guard test was rewritten to match: `test/node/replica-local-only-row-convergence.test.js:106-110` asserts `'local-only rows persist via insert-only admission'`.
- The CL-035 seed's marker was not revisited when that change was made.

**Apply is total; this is not a replicated-state-machine safety defect.** The committed-entry owner `partition-committed-statement-outcome.js` handles a deterministic statement failure (`:357-397`):

- the failure is recorded as `STATEMENT_FAILED`;
- the entry is consumed identically on every replica (the header contract is at `:7-21`);
- the proposer is answered `{committed: true, outcome: statement_failed}`;
- environmental failures fail closed instead (`:363-366`).

The 69 errors are 23 entries × 3 services-p1 replicas on f596, one entry per failed create. The breakdown is in the table below; each entry applied with the identical outcome on all three replicas. No divergence is possible from this path. The hypothesised highest-severity A (`committed-entry-apply-totality`) is **refuted**, and no quest is declared for it.

**The real defect is medium severity: a projection write is declared converged.**

- `resolveInitialInsertOutcome` (`create-persistence.js:53-84`) treats the UNIQUE conflict as success when `rowMatchesReplicaLifecycle` matches (`replica-state-machine-lifecycle-observation.js:205-210`). That predicate does not include `raft_role`.
- The node then logs `converged` (10:29:57.768) and clears the marker, while the authority still holds `raft_role learner` (10:29:57.903).
- So the CL-035 voter role never becomes durable, every such replica spends one committed services entry that is guaranteed to fail, and the apply path logs it at error level.
- It is not on the stopping path: the INSERT is proposed after the create had already failed.
- Owner: census **C8** (voter-ready activation; the local cache seed at `create-status-methods.js:596-630`; planned quest `voter-ready-from-committed-role-and-node`, which also re-proves CL-035). The repair belongs there: delete the seed and its local-only mark rather than patch the reconcile.

Per-replica counts of the 69 apply errors: 23 distinct service_ids × 3. Every one has `status syncing`; all have `raft_role follower` except `sql_transaction_participants-p1-r5` (`learner`).

## 6. Link (v) and the H3' verdict

**Cohort construction.**

- The release attempt runs on the partition leader: `replica-handler-participant-cutover.js:286-334` `runCutoverAttempt`.
- It **raises the pause first** (`:303`).
- It then reads `facts = readParticipantReleaseFacts(..., RETIREMENT)`, whose `facts.membership` is `service.raft.readCommittedMembership({purpose})` (`partition-participant-transaction-pause.js:142`).
- The cohort is `cohortOf` (`cutover.js:47-57`): `releaseMemberIds(facts.membership)`, which is voters plus learners of the **committed configuration** re-read on every attempt, routed through `facts.peers` addresses.
- `readCohort` (`:59-62`) sends INSPECT to each member's node. A node that does not host the replica answers `UNAVAILABLE{hosted_replica}` (`replica-handler-participant-release.js:383-387`).
- `isRetryableMemberRefusal` (`cutover.js:96-101`) treats every UNAVAILABLE except `release_deadline` as retryable.
- Recovery (`replica-handler-release-recovery.js:183-211`) re-drives a paused partition every `RECOVERY_RETRY_MS` (1000 ms; `:210`) with no bound. The log is deduplicated for `DRAIN_DEADLINE_MS` (`:152-166`).
- The only non-retrying outcomes are `OPERATOR_REQUIRED` for a missing origin or an unmeasured build (`:193-203`).
- Fresh creates of the other priority partitions release the control partition first (`releaseControlOwnerFirst`, `cutover.js:213-238`). They therefore inherit the block as `current_control_owner_fact` with `controlMissingFact hosted_replica`. Their attempts also re-raise the pause on the sql_transactions-p1 leader (`:303`), which is why a partition that was CUT_OVER at 10:29:55 is paused again and refuses writes (`partition-write-kernel.js:60`).

**H3' (the dead r4 stays in sql_transactions-p1's committed configuration, so the release can never clear): CONFIRMED** by construction and by elimination. The committed configuration was not directly dumped.

1. By construction, `hosted_replica` is answered only for a replica in the **committed** configuration whose routed node does not host it. A replica removed from the configuration is absent from the cohort on the next attempt; the census reached the same reading in its H3 section, lines 727-737.
2. At the first refusal (f596 10:31:13.612), the replicas of sql_transactions-p1 named in any log are r1-r3 (hosted on f596), r4 and r5. r4's runtime was shut down at 10:29:57.194. r5 had been hosted on ff63 since 10:31:07.7 and was shut down only at 10:32:05.996. r4 is therefore the only configured member that was not hosted.
3. r4 was in the committed configuration: its promotion proof was granted at 10:29:57.126, and a proof is refused `not_in_configuration` until the admission commits.
4. Nothing ever removed it:
   - no REMOVE operation targets b53a for sql_transactions-p1, while REMOVEs exist for sql_transactions-p1 on ff63 (r5 `53df46c6` 10:32:20 and r6 `f60857b1` 10:35:49) and for every other b53a failed create;
   - the planner skips r4 (section 4).
5. The refusal persists from 10:31:13 to 10:38 (15 logged occurrences on f596 at the 30 s dedup cadence) across r5, r6 and r7 joining and leaving. That is consistent with one permanent member that is configured but not hosted.

**Residual.** A direct `readCommittedMembership` dump at a refusal instant was not taken. The literal form of the census's earlier H3 (a removed member awaited) is refuted by construction. **No permanent typed refusal exists** for this state, contrary to `authority-and-recovery.md` "A refusal has an owned consequence" (lines 138-145); only re-drive forever.

## 7. Unknowns (red and unknown stay so)

| # | Unknown | What would settle it |
| --- | --- | --- |
| U-a | The exact gateway result (`outcome`, `error`) of the r4 `readOperation` at 10:29:57.15-.19. `readOperation` drops it and no info line records it. The routing refusal in section 2 is inferred. | The quest B red test pins the mechanism, a routing refusal answered as deferred, at the unit level. A live witness needs the outcome carried on the typed error (part of quest B). |
| U-b | Why the readiness planning snapshot flapped to `freshness_not_current` on all three owner keys at .174-.176. It may be a cache change that invalidated the memo. | C5 owner (readiness-observation-currency); not this chain. |
| U-c | Which answer the sql_transactions-p1 control release gave between 10:29:57 and 10:31:13. f596 logs `current_control_owner_fact` for the dependent partitions from 10:30:12 without the control detail, and sql_transactions-p1's own recovery logs nothing until 10:31:13. | A control-refusal diagnostic at info on f596, or the quest C red test reproducing pause-raise without a resolvable cohort. |
| U-d | Why fresh creates on joiners got `replica_release_reply` (transport answer missing) from the seed rather than the control refusal itself. Probably the seed attempt outlived `REQUEST_TIMEOUT_MS` while it awaited the cohort; not proven. | The quest C witness. |
| U-e | Whether r4 is a voter or a learner in the committed configuration. The proof was granted and the election timer started, but the authoritative row still says `learner`. H3' holds either way, because `releaseMemberIds` includes learners. | A committed-membership dump. |
| U-f | The intended semantics of `claimCleanup: error?.deferRetry !== true` (from the 0.2.6 squash `54dd2d7ce`; earlier history is not recoverable through `git log -S`). In particular, is any caller supposed to re-dispatch the same create on `deferRetry`? Only the executor emits `deferRetry`; the operation owner fails on FAILED. | Quest B Phase 1 caller census. |
