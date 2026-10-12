# Closed-admission startup census (read-only)

Subject: worktree `/mnt/data/peter/projects/.worktrees/rs-raft-startup-activation-20261011`
(HEAD c6d71665e + uncommitted/untracked source; every `src/` file compared byte-for-byte
against commit 14fac7d6: tracked files `git diff --stat 14fac7d6 -- src/` shows only the
12 untracked protocol files as "deletions", and each of those 12 hashes SAME as its
14fac7d6 blob). Base for "what changed": 10c2f0610.
All paths below are relative to that worktree root unless prefixed otherwise.
Facts only; every claim cites file:line. Unknowns are in section G.

Vocabulary used below
- CLOSED/OPEN: `PARTICIPANT_RELEASE_ADMISSION` (src/partition/partition-participant-transaction-cutover-constants.js:33),
  held per PartitionService object in a WeakMap (src/partition/partition-participant-transaction-pause.js:19).
  Every service object starts CLOSED on first consultation (pause.js:22-36 `newPause`,
  `participantReleaseAdmissionOf`).
- "the pause": `pausedWriteAnswerOf` -> `{error: WRITE_CUTOVER_PAUSED, failureCode: CUTOVER_PAUSED,
  deferRetry: true, retryAfterMs: 100}` (pause.js:134-140; constants.js:37).
- "bypass": a committed command proposed through `startPartitionRaftWriteCommit` directly
  (src/partition/partition-service-raft-write-commit.js:460-475), which has no pause check,
  instead of `startAdmittedPartitionWrite` (:441-458), which has it.

---------------------------------------------------------------------------------------------

## A. Pause consumers

### A.1 Every production site that consults the pause

| # | Site | What it gates | Outcome while CLOSED |
|---|------|---------------|----------------------|
| 1 | src/partition/partition-service-raft-write-commit.js:442-447 `startAdmittedPartitionWrite` | the leader's ordinary write commit (`applyWrite`, write-metrics-base.js:697-757, call at :752) | typed retryable refusal, nothing proposed |
| 2 | src/partition/partition-participant-transaction-request.js:240-242 `beginRefusalOf` | participant-transaction BEGIN (after leadership :231-234 and origin :235-239) | `CODE.CUTOVER_PAUSED`, `deferRetry` |
| 3 | src/partition/partition-participant-transaction-legacy-fence.js:143-145 `fenceLegacyTransactionRequest` | legacy sessionId-only BEGIN (only when no origin :140-142) | `pausedRefusal` (:88-92, deferRetry) |
| 4 | src/partition/partition-participant-transaction-legacy-fence.js:180-186 `fenceLegacyLocalMutation` | `executeLocalQuery` non-READ statements (write-metrics-base.js:196-199) | CUTOVER_PAUSED while CLOSED; **LEGACY_SESSION_FENCED permanently once an origin exists** (:181-183), whatever the admission state |
| 5 | src/partition/partition-participant-release-facts.js:112 | the `paused` fact in the release census | consumed by `releaseFactsDefect` (release-contract.js:98) |
| 6 | src/node/replica-handler-release-recovery.js:78-79 `reconcile` | the recovery loop returns at once when the local leader is OPEN | runs the cutover only when CLOSED |
| 7 | src/node/replica-handler-participant-cutover.js:585 `wasClosed` | chooses `continueDurableRelease` (:596-600, :608-611) | - |

Every consult also runs `invalidateParticipantReleaseAdmission` (pause.js:43-49, :51-64): an OPEN
admission whose proof (term, leaderId, configurationKey, membershipGenerationIndex,
runtimeGeneration, lifecycleIncarnation) no longer equals `service.raft.readStatus()` is
re-closed synchronously (:56-62).

Raisers (`raiseParticipantCutoverPause`, pause.js:38-41): cutover.js:590 (every attempt, before
remote observation); participant-release.js:118 (REOPEN replacement), :132 (PAUSE action), :406
(any PAUSE request, "even on a mixed-build node"); participant-release-lifecycle-retirement.js:146
(before replacement); partition-participant-release-apply.js:115 (every replica, on committed
ADMISSION_PAUSE); pause.js:62 (proof mismatch).

The one opener: `resumeParticipantCutoverAdmission` (pause.js:66-132), reached only from the
RESUME action (participant-release.js:305). It requires the durable authorization row to match the
request (:76-93), a fresh OBSERVED census with `paused === true` (:94-96), no census defect (:97-103),
and unchanged generation/leadership/configurationKey (:105-122), then sets OPEN with the proof (:123-130).

Reads are never gated: `executeQuery` READ lane (write-metrics-base.js:106-133), `executeLocalQuery`
READ lane (:187-195), legacy-fence comment "Reads continue through their normal statement owner while
release pauses" (:179).

### A.2 The write-kernel site (:442): which command origins/types are refused, which bypass

`admitCommittedCommand` (src/partition/partition-committed-command-admission.js:199-211) is an
origin/type admission, not a pause gate; the pause lives only in the write-commit owner (site 1)
and the three fences (sites 2-4). So "refused while CLOSED" = "reaches `startAdmittedPartitionWrite`".

Refused while CLOSED (all `PARTITION_COMMITTED_COMMAND_ORIGIN.WRITE_PATH`, admission.js:66-72):
- Every SQL command from `applyWrite` (write-metrics-base.js:725-726 origin WRITE_PATH; :752
  `startAdmittedPartitionWrite`). Callers that reach `applyWrite`:
  - `executeQuery` write lane: write-metrics-base.js:60-143 (:142 `proposeWrite`) -> `proposeWrite`
    :492-506 (leader: `applyWrite` :506; follower: FORWARD_WRITE to the leader :531-545).
  - FORWARD_WRITE at the leader: partition-service-entry-apply-base.js:375-377.
  - SYSTEM_TABLE_WRITE: entry-apply-base.js:383-384 -> `handleSystemTableWrite` :510-553 ->
    `insertData/updateData/upsertData` (write-metrics-base.js:290, :323, :379-404) -> `proposeWrite`.
  - Remote QUERY: entry-apply-base.js:385-386 -> `handleRemoteQuery` :691-; non-leader write is
    redirected (:721-739); leader executes `executeQuery` (:771).
  - MIGRATION_ALTER_TABLE via `proposeWrite` (entry-apply-base.js:849-).
- Legacy and participant BEGINs (sites 2, 3) and local mutations (site 4) as above.

Bypass the pause (never pass site 1), by origin:
- `TRANSACTION_OWNER`: participant PREPARE / DECISION commands - transaction-request.js:179-190
  (`admissionRefusalOf` origin TRANSACTION_OWNER, `proposeAdmitted` -> `startPartitionRaftWriteCommit`
  :187-189). PREPARE (:363-) and decision (:457-) check only leadership (:364-367, :458-461), never the pause.
  Also the GENERATION_ORIGIN command proposed by `enableParticipantTransactionAdmission`
  (:636-673; :669-672 `startPartitionRaftWriteCommit`). Legacy transaction markers:
  partition-service-transaction-base.js:978-990 (`raft.propose` directly, leader only).
- `PARTICIPANT_RELEASE_OWNER`: every release command (ADMISSION_PAUSE, RELEASE_RESERVE,
  RELEASE_PUBLISH_CLAIM, RELEASE_RECORD_SHARE, RELEASE_FINALIZE, RELEASE_DISPATCH, RELEASE_RETIRE,
  ADMISSION_RESUME, RELEASE_RECORD_RECEIPT, RELEASE_CONFIRM) - partition-participant-release-request.js:29-42
  (`propose`: pending-outcome join :33-34, origin :35-36, `startPartitionRaftWriteCommit` :40-41).
  Type set: `PARTICIPANT_RELEASE_COMMAND_TYPES` (admission.js:141-144). Applied by
  partition-participant-release-apply.js:617-631. Two of them (RELEASE_FINALIZE, RELEASE_CONFIRM)
  carry an extra *local* dispatch fence in the port: partition-participant-release-dispatch-admission.js:41-77,
  wired at partition-service-raft-init-base.js:463-464 and checked at
  src/raft/raft-rs-runtime-owner.js:1523-1534 (`admitProposalDispatch`).
- `CDC_DELIVERY_OWNER`: CDC_DELIVERED - partition-cdc-obligation.js:287-301 (leadership refusal :288-291,
  then `startPartitionRaftWriteCommit` :296-300); admitted at admission.js:156-164.
- `COORDINATOR_OWNER`: COORDINATOR_SETTLEMENT - partition-coordinator-settlement.js:47-76
  (leadership :53-54, origin :55-56, `startPartitionRaftWriteCommit` :74-75 with `park` on reservation);
  entered from `handleApplicationMessage` (entry-apply-base.js:389-390). Admitted at admission.js:167-173.

Note on `handleApplicationMessage` (entry-apply-base.js:290-318): its only ingress gate is the
removal-serving fence (:328-345), which admits TRANSACTION and COORDINATOR_SETTLEMENT unconditionally (:333-336).

### A.3 What changed vs 10c2f0610 (A)

- `startAdmittedPartitionWrite` had no pause check (diff adds :442-447 and the TX1 0.0.15 doc).
- `executeLocalQuery` had no fence (diff adds `fenceLegacyLocalMutation` :196-199 and the owner :180-186).
- Participant BEGIN had no CUTOVER_PAUSED (diff adds :240-242) and no topology refusal (:219-225, :247-248).
- Legacy BEGIN had no `pausedRefusal`; legacy session control for a session not open here is now
  LEGACY_SESSION_FENCED once an origin exists (legacy-fence.js:149-156).
- `enableParticipantTransactionAdmission` now refuses when the SQL_TRANSACTIONS schema enforcement
  is not ENFORCED (:638-652) and the origin apply installs the enforcer (participant-transaction-apply.js:588-590).
- New origins CDC_DELIVERY_OWNER, COORDINATOR_OWNER, PARTICIPANT_RELEASE_OWNER (admission.js diff).
- The port gained `ADMIT_PROPOSAL_DISPATCH` (raft-operation-port-request.js:50) and passes
  `committedConfiguration` into application (raft-rs-operation-port.js:91-98; runtime-owner.js:923-936);
  `readStatus()` gained `lastIndex` (:1205).

---------------------------------------------------------------------------------------------

## B. Seed bootstrap write inventory

### B.1 Order of the seed workflow (src/bootstrap/bootstrap-service-seed-workflow.js)

`buildSeedCheckpointSteps` (:343-517) runs, in order:
1. INFRASTRUCTURE = `phases[0]` (:348-360)
2. MESSAGE_GROUPS = `phases[1]` (:361-373)
3. PARTITIONS = `phases[2]` (:374-386)
4. REGISTRATION step (:387-427): ensure state machine (:395-399); `acquireSqlQueryEngine` (:400,
   provisional engine, seed-runtime-bridge-owner.js:46-67); `acquireReplicaHandler` (:401 ->
   bootstrap-service-replica-registration-methods.js:127-297, which puts every bootstrap partition
   into `replicaHandler.localServices` :293-295 "before any SERVICES registration write");
   `prepareAuthorizedInvocation` (:402-418; a local workflow-store file write, startup-workflow-store.js:137-161,
   not a partition); `prepareFreshSeedActivationReadCut` (:419 -> :329-342: sets systemTableCache,
   cdcIntegrationService and the provisional sqlQueryEngine on every partition :335-339, then
   `subscribeToInitialSystemTableCDC` :340); **`releaseSeedParticipantCohorts` (:420-421 -> :259-328)**;
   then `phases[3]` = the REGISTRATION phase proper (:423-425 -> seed-registration-phase.js:112-139).
5. CACHE_HYDRATION = `phases[4]` (:428-440 -> seed-cache-hydration-phase.js:135-351).
6. CONTROL_PLANE_READY (:441-486): `initializeReplicaHandler` (:454), message-group handler (:461),
   `initializeControlPlaneService` (:471), `notifyLocalAdminRuntimeReady` (:476),
   `registerSeedNodeWithControlPlane` (:479), `activateMessageGroupServiceRows` (:484).
7. RUNTIME_READY (:487-503): runtime service handler, `openExternalTransportAdmission` (:501).
8. FINALIZED (:504-515) -> `completeSuccessfulBootstrap` (:195-258): `attachSqlRuntimeToStartupOwner`
   with the provisional engine and `activateDistributedTransactionRecovery: false` (:206-219),
   `activateSteadyStateRuntimeHandoff` (:220-224: control-plane background writers + latency topology).
After `bootstrap()` returns, the entrypoint (src/lagrange-runtime-startup.js) attaches the final SQL
runtime (:511-537; recovery activated by default, startup-sql-runtime-handoff.js:198-203), dynamic
config wiring (:539-551), admin runtime (:554-567), rejoin-hints persistence (local file, :579-588),
logs-table persistence (:596-601).

Release order inside `releaseSeedParticipantCohorts`: one service per partition, SQL_TRANSACTIONS first,
then by partitionId (:264-274); each request is `FRESH_SEED` with an authorization from
`authorizeFreshSeed` (:277-288 -> participant-release-authorization-owner.js:27-39); refusal loop until
CUT_OVER or the invocation deadline (:292-313); failure throws `STARTUP_CHECKPOINT_HELD` (:314-326),
which the outer loop retries until the deadline (:543-571).

Leadership before release: the PARTITIONS phase starts elections for the registration-required cohort
first and waits for their leaders (seed-partitions-phase.js:430-449); that cohort now includes
SQL_TRANSACTIONS (seed-registration-phase.js:73-83, added in this change).

### B.2 Inventory

Legend: path = where the write enters consensus; pause = whether site A.1/1 (or a fence) applies;
when = BEFORE/AFTER `releaseSeedParticipantCohorts` on a fresh seed.

| Write | Owner (file:line) | Target | Path | Pause applies | When |
|---|---|---|---|---|---|
| Partition DDL at open: own table, outcome table, participant tables, generation row (1,0) | src/partition/partition-service-table-bootstrap.js:175-182 `createPartitionServiceTable`; src/partition/partition-participant-transaction-store.js:67-83 (`INSERT_INITIAL_GENERATION` :82) | each partition's local SQLite | direct DDL on open, identically on every replica (store.js:7-10) | no (not a committed command) | BEFORE |
| Raft genesis of each system partition | src/bootstrap/phases/seed-partitions-phase.js:261-271 (`genesisStamp`, `identityExisted`) | raft record | raft core | no | BEFORE |
| Message-group raft groups + `subscribeToCDC(tableName)` | seed-cache-hydration-cdc-subscription.js:36-41; registration-methods.js:196 | message-group logs | message-group service (not a partition) | no (outside the partition owner) | BEFORE (read cut) and AFTER (cache hydration) |
| Partition CDC subscription handshake | seed-cache-hydration-cdc-subscription.js:108-112 -> partition-cdc-delivery.js:493-560 | volatile subscriber state only | none (no committed command) | n/a | BEFORE (`prepareFreshSeedActivationReadCut` :340) |
| ADMISSION_PAUSE (one per partition per attempt) | cutover.js:643 -> release-request.js:84-88 -> `propose` :29-42 | `_partition_write_generation` (store.js:143-158) on every replica | `startPartitionRaftWriteCommit` (bypass) | **no** | DURING (CLOSED) |
| GENERATION_ORIGIN (ENABLE) | participant-release.js:146-155 -> transaction-request.js:636-673 (:669-672) | origin columns (store.js:206-210); on SQL_TRANSACTIONS also ALTER TABLE/TRIGGER install (participant-transaction-apply.js:588-590; schema-enforcement.js:109-126) | `startPartitionRaftWriteCommit` (bypass); leadership (:653-656) and `servedLegacy===false` (:658-662) required | **no** | DURING (CLOSED) |
| RELEASE_RESERVE / PUBLISH_CLAIM / RECORD_SHARE / FINALIZE / DISPATCH | participant-release.js:226-283 (AUTHORIZE action, control partition only :186-189) | `participant_release_control_*` on SQL_TRANSACTIONS (store.js:168-177) | release-request.js (bypass) | **no** | DURING |
| ADMISSION_RESUME | cutover.js:409-415 (leader of the dependent) -> release-request.js:244-262 | `participant_release_authorization_*` (store.js:186-196) | bypass | **no** | DURING |
| RELEASE_RECORD_RECEIPT / RELEASE_CONFIRM | participant-release.js:316-343 | SQL_TRANSACTIONS control slot | bypass | **no** | DURING |
| RELEASE_RETIRE | participant-release-lifecycle-retirement.js:133-176 (:168-169) -> participant-release.js:344-366 | SQL_TRANSACTIONS control slot | bypass | **no** | DURING (restart/replacement only; `obligation === null` -> `{retired:false}` :145 on a fresh seed) |
| MESSAGE_GROUPS row | seed-registration-phase.js:169-207 | MESSAGE_GROUPS partition | BootstrapSystemTableWriter -> cdc bootstrap mode -> raft lane `executeQuery` (cdc-bootstrap-direct-sql.js:132-141) -> `applyWrite` | **yes** (site 1); fallback lane `executeLocalQuery` (:160-166) hits site 4 | AFTER |
| SERVICES rows for message-group replicas (STOPPED) | seed-registration-phase.js:232-273 | SERVICES partition | same | **yes** | AFTER |
| SERVICES rows for partition replicas (STOPPED) + PARTITIONS.leader_node_id | seed-registration-phase.js:276-299 -> partition-service-row-owner.js:280-321 (insert :298-306; `publishCanonicalLeaderNodeId` :259-278) | SERVICES, PARTITIONS | same | **yes** | AFTER |
| SERVICES rows -> ACTIVE | seed-registration-phase.js:301-322 -> partition-service-activation.js:299 -> row-owner :323-328 | SERVICES | same | **yes** | AFTER |
| SERVICE_DEFINITIONS, SERVICE_ENDPOINTS (meta services) | seed-registration-phase.js:334-369 -> meta-service-definition-registration.js:99, :133 | those partitions | same | **yes** | AFTER |
| TABLES + PARTITIONS rows per system table | seed-registration-phase.js:405-475 | TABLES, PARTITIONS | same | **yes** | AFTER |
| PARTITIONS.size_bytes | seed-registration-phase.js:481-528 | PARTITIONS | same | **yes** | AFTER |
| CONFIG seeding, epoch row, cluster id | seed-registration-phase.js:534-596, :602-642, :651-684 | CONFIG | same (DynamicConfigService `useDirectCdcMutations`) | **yes** | AFTER |
| Cache hydration | seed-cache-hydration-phase.js:359-464 | none (reads + `leaderMessageGroup.applyCDCEvent` with `skipReplication` :98-100, :431-434) | read lane | no | AFTER |
| Writer swap to routed SQL | seed-cache-hydration-phase.js:291 -> seed-registration-phase.js:708-729 | - | normal mode -> engine-routed QUERY messages | - | AFTER |
| NODES row: storage budget | bootstrap-service-control-plane-runtime-methods.js:295-303 -> node-storage-budget-service.js:221-260 (gateway insert/update) | NODES | gateway -> cdcIntegrationService (control-plane-system-table-gateway-mutation-submission.js:185, :260-297) -> routed -> leader `applyWrite` | **yes** | AFTER |
| NODES row: seed heartbeat (JOINING -> READY promotion) | control-plane-runtime-methods.js:305-318 -> heartbeat-service-publication-methods.js:94-205, :395-414 -> node-lifecycle-publication.js:585 `gateway.updateSystemTableRow` | NODES | same | **yes** | AFTER (`registerSeedNodeWithControlPlane` also waits for leaders in cache :259-261) |
| Message-group SERVICES rows -> ACTIVE | seed-workflow.js:484 -> bootstrap-service-runtime-methods.js:58-; message-group-service-activation.js:51- | SERVICES | same | **yes** | AFTER |
| Periodic lease / heartbeat writers | startup-runtime-handoff-owner.js:113-195 (:157-180) | NODES etc. | same | **yes** | AFTER (bootstrap COMPLETE) |
| Distributed transaction recovery | NOT activated on the provisional engine (seed-workflow.js:214-218; bootstrap-service.js:499-503); activated by the final attach (lagrange-runtime-startup.js:530-537; startup-sql-runtime-handoff.js:198-203) | SQL_TRANSACTIONS and participants | engine writes (site 1) and COORDINATOR_SETTLEMENT (bypass) | mixed | AFTER bootstrap |
| Logs table rows | lagrange-runtime-startup.js:596-601 -> src/entrypoint-runtime-shutdown-lifecycle.js:98 | LOGS | routed | **yes** | AFTER bootstrap |
| Rejoin hints | lagrange-runtime-startup.js:579-588 | local file | file | no | AFTER bootstrap |
| Artifact/image payload rows | `attachArtifactPayloadStore` (startup-sql-runtime-handoff.js:90-96; artifact-payload-store-setup.js:55-67) binds `executeQuery`; no write at attach | - | engine | **yes** on demand | AFTER |
| Schema migration cutover `executeCutoverTransaction` | src/migration/migration-coordinator-stage-methods.js:495; only caller :243 (migration stage) | - | - | - | NOT on the seed startup path (grep: no bootstrap caller) |

### B.3 Marked: writes that would be refused while CLOSED

- On a fresh seed, no SQL/system-table write is issued before `releaseSeedParticipantCohorts`
  (section B.1 ordering: :419-421 precede :423-425); all B.2 rows marked "yes" run after it. If any
  partition is still CLOSED when they run (release failed for it, or a concurrent release cycle, C.2),
  the raft lane answers CUTOVER_PAUSED (retryable) and the bootstrap direct fallback lane
  (cdc-bootstrap-direct-sql.js:160-166) answers CUTOVER_PAUSED via site 4.
- After release every partition has an origin (ENABLE), so the fallback lane `executeLocalQuery`
  is refused LEGACY_SESSION_FENCED permanently (legacy-fence.js:181-183): the only working
  bootstrap-mode write lane after release is the raft lane (:132-141), and only while OPEN.
- Writes issued while CLOSED that are NOT refused: the protocol's own commands and
  GENERATION_ORIGIN (bypass), CDC_DELIVERED (bypass, only with owed obligations and >=1 subscriber,
  partition-cdc-obligation-delivery.js:514-517), COORDINATOR_SETTLEMENT (bypass).
- The seed's registration write that the owner named ("seed registration itself is a new write"):
  the SERVICES rows for the seed's own replicas (seed-registration-phase.js:276-299, :301-322) and the
  NODES row (control-plane-runtime-methods.js:253-333) are all site-1 writes issued after release, on
  partitions whose authority to accept them is the release protocol's RESUME (A.1 opener).

### B.4 What changed vs 10c2f0610 (B)

- Base `REGISTRATION` step ran only `phases[3]`; the engine/handler acquisition, the authorized
  invocation, the read cut and the release (seed-workflow.js:400-422) are new; `initializeReplicaHandler`
  was guarded by `if (!this.replicaHandler)` and is now unconditional (:454).
- Base `bootstrap()` ran the workflow once with `isRetryableFailure: () => false`; now a
  STARTUP_CHECKPOINT_HELD loop (:543-571) and `prepareDurableAuthority` (:527-532).
- `completeSuccessfulBootstrap` did not attach an engine; now attaches the provisional one with recovery off (:206-219).
- `acquireReplicaHandler` (registration-methods.js:127-297) is new (split from `initializeReplicaHandler`,
  `deferInitialization: true` :284, localServices pre-registration :293-295).
- `REGISTRATION_REQUIRED_LEADER_TABLES` gained SQL_TRANSACTIONS (seed-registration-phase.js:73-83).
- `bootstrap-service.js` gained `dataDirectoryProcessOwner`, `seedStartupAuthorization`,
  `seedStartupInvocation`, `seedFirstParticipantReleaseRefusal`, `seedParticipantActivationReadCutReady`
  (:216-221) and `activateDistributedTransactionRecoveryOnWriterActivation: false` (:499-503).
- `seed-startup-session-store.js` gained the immutable authorization / startup invocation record (:135-242).

---------------------------------------------------------------------------------------------

## C. Joining node

### C.1 The joiner's own registration writes (before any replica CREATE)

- `registerNodeInCluster` (src/bootstrap/phases/query-system-state-phase.js:578-632, retry on
  `isRetryableControlPlaneError` :600-630) -> src/bootstrap/shared/node-registration-owner.js:
  NODES upsert (:131-137), NODE_ENDPOINTS (:175-177), SERVICE_ENDPOINTS (:183-188), through
  `upsertSystemTableRowWithRetry` (node-registration-owner-publication-methods.js:681-728) ->
  membership publication owner / gateway -> `cdcIntegrationService.*SystemTableRow`
  (gateway-mutation-submission.js:185, :260-297) -> engine-routed QUERY to the partition leader ->
  `handleRemoteQuery` (entry-apply-base.js:691, :771) -> `executeQuery` -> `applyWrite` -> site 1.
- These rows live on the seed's (or current leader's) NODES / NODE_ENDPOINTS / SERVICE_ENDPOINTS
  partitions. A fresh joiner hosts no partition at this point, so the only admission that matters is
  the leader node's. The joiner's READY publication (durable-rejoin :342-344; publication-methods.js:492-536
  `updateJoinAdmissionSystemTableRowWithRetry`) takes the same path.

### C.2 Replica CREATE lifecycle on the joiner (src/node/replica-handler-create-methods.js:212-480)

Writes before `releaseFreshCreate`:
1. `persistReplicaCreateInitialStatus` (:256 -> replica-handler-create-status-methods.js:282-322):
   SERVICES PENDING (:296-300) and CREATING (:306-310) via `persistReplicaStatusWithRetry`
   (replica-handler-status-methods.js:48-106 -> `updateReplicaStatus` -> replica state machine, whose
   writer is `cdcIntegrationService || controlPlaneSystemTableGateway` (replica-state-machine.js:162-166)).
2. `createPartitionService` (:326-345): local DDL/raft join (B.2 rows 1-2); the new service starts CLOSED.
3. `recordReplicaIdentity` (:372 -> replica-prior-existence.js:172-199): SERVICES SYNCING (:181-182).
4. `syncFromLeader` (:383-388), voter-readiness wait (:390-402; replica-handler-voter-readiness-methods.js:91, :194).
All of 1 and 3 land on the SERVICES partition leader (normally the seed) through site 1.

`releaseFreshCreate` (:403-422; deadline = `workflowUpdatedAt + syncTimeoutMs` :404-405) ->
src/node/replica-handler-release-recovery.js:136-173:
- `authorizeFreshCreate` (participant-release-authorization-owner.js:40-55) requires
  `identityExisted === false` and the admission row MATERIALIZED (replica-create-admission-owner.js:679-696,
  reads the replica_operations row :683) - a read of the ledger, no write.
- `requestParticipantRelease` (participant-release-client.js:63-70): first asks the joiner's own
  handler (`nodeId ?? owner.nodeId` :65) -> `runCutoverAttempt` -> `localLeader` (cutover.js:42-47,
  :567-576): the new replica is a learner/follower -> NOT_LEADER with `leaderAddress` (:573-575) ->
  the client re-asks the leader's node with `replicaId = leaderReplicaId` (:67-69). The FRESH_CREATE
  `authorization` token is a process-local WeakMap key (authorization-owner.js:17-24) and does not
  travel; on the leader node `reference()` is null -> root id `existing:<releaseId>` (cutover.js:342-343,
  :448-450, :624-625). The leader skips the fresh-storage authority check because its origin exists (:577-584).
- On the leader (the seed for system partitions): the full cycle. `raiseParticipantCutoverPause` on
  the leader's own service (:590) -> committed ADMISSION_PAUSE (:643) applied on every replica
  (release-apply.js:114-115, which raises the local pause on the seed's replica too) -> cohort PAUSE
  (:655) -> DRAIN requires every member drained (:658-666; cohort = voters + learners,
  release-contract.js:58-67) -> `reopenCohort` (:667) -> `settleQueryRelease` (:669; only HELD
  SQL_TRANSACTIONS) -> ENABLE (:702-705; origin present -> `alreadyEnabled`, transaction-request.js:640-652)
  -> AUTHORIZE on the SQL_TRANSACTIONS control leader (:387-389, :334-365) -> durable RESUME on the
  leader (:409-419) -> RESUME to every member incl. the joiner (:420-424; participant-release.js:285-315:
  `observeParticipantAdmissionResume` requires the ADMISSION_RESUME entry applied locally
  (release-request.js:264-281) else UNAVAILABLE, then `resumeParticipantCutoverAdmission` pause.js:66-132)
  -> CONFIRM (:432-438).
- Consequence (fact, not design): for the duration of a joiner's CREATE release, the LEADER's
  partition - on the seed - is CLOSED; ordinary writes to it (C.1 kind, heartbeat, any SQL) are refused
  CUTOVER_PAUSED retryable until RESUME. A `STALE` answer from any member in `resumeCohort` is a hard
  refusal (cutover.js:93-96, :106-108), which fails the attempt; `releaseFreshCreate` then retries the
  whole request after `retryAfterMs` until its deadline (recovery.js:155-170); the PAUSE replays rather
  than re-appends because its bytes are identical (release-request.js:53-63, :84-88; invocation id from
  the authorization id, cutover.js:620-626).
- A member not yet in its node's `localServices` answers `hosted_replica` UNAVAILABLE
  (participant-release.js:379-382); a joiner registers the new service at create-methods.js:354 before
  `releaseFreshCreate`, so its own replica is hosted when it asks.

Writes after `releaseFreshCreate`: SERVICES ACTIVE (:436-445, site 1 on the SERVICES leader, OPEN
again after RESUME) and `markProgress(ACTIVE)` on the replica_operations ledger (:447-450).

### C.3 Durable rejoin (joiner restart with existing replicas)

`restoreDurableRejoinLocalPartitionServices` (src/bootstrap/node-joining-publication-activation.js:68-119)
-> `createJoinLocalPartitionService` (:235-276; `systemTableCache` is null until `systemCacheHydrated`
:248-250) -> `trackJoinPartitionReplica` (:362-372 `localServices.set`) -> the recovery loop enqueues
(release-recovery.js:124-130) and acts only if a local replica is LEADER (:72-77). `activateJoinPartitionServiceRows`
(:102-104) writes SERVICES rows to the leader (site 1 there).

### C.4 What changed vs 10c2f0610 (C)

- `createReplicaAsync` gained the `releaseFreshCreate` block (:403-422) between voter readiness and the
  ACTIVE write; `replica-create-admission-owner.js` gained `authorizeParticipantRelease` (:679-696).
- `handleMessage` dispatches PARTICIPANT_RELEASE before the removed-replica cleanup barrier
  (replica-handler-lifecycle-methods.js:136-146; base awaited the barrier first).
- `TrackedServiceRegistry` gained `subscribeServiceChanges` (replica-handler-membership-relay.js:39-76).
- `ReplicaHandler` gained `timeSource`, `participantReleaseAuthorizationOwner`, `participantReleaseRecovery`
  (replica-handler-class.js:152-155, :200-202) and shuts the recovery down (runtime-methods.js:648).

---------------------------------------------------------------------------------------------

## D. Restart with existing storage

### D.1 Volatile map vs durable record

- The ADMISSIONS WeakMap (pause.js:19) is keyed by the PartitionService object: a process restart,
  a snapshot-install replacement (snapshot-catchup.js:396-408) and a REOPEN replacement
  (participant-release.js:114-119) each produce a new object, CLOSED on first consult (pause.js:34-36)
  - REOPEN raises it explicitly too (:118).
- `_partition_write_generation.participant_release_authorization_text/index/term` (store.js:114-124;
  written by the committed ADMISSION_RESUME apply, release-apply.js:475-522 -> store.js:186-196; cleared
  by every distinct committed PAUSE, store.js:143-158) never opens admission by itself. It is consumed by:
  - `resumeParticipantCutoverAdmission` (pause.js:76-93): the RESUME request's control authorization,
    dependent release text, pause generation and authorization position must all equal the row.
  - `continueDurableRelease` (cutover.js:441-530): lets an attempt skip PAUSE/DRAIN/REOPEN/ENABLE only if
    `retainedAuthorization.controlAuthorizationId === releaseAuthorizationId(rootAuthorizationId, releaseId)`
    (:448-452) and the current census equals the retained target entries/configuration (:485-487),
    and (control partition) the control slot is AUTHORIZED/DISPATCHED for that id (:453-460).
  - `reconstructDurableRetirement` (participant-release-lifecycle-retirement.js:58-90): if the retained
    target for this replica differs from the current generation (new lifecycleIncarnation /
    runtimeGeneration / connectionGeneration after a restart), a RETIRE obligation is built and a
    RETIRE command is sent to the control partition before anything else (:133-176; called at cutover.js:601-602).

### D.2 Who re-runs the cycle after a restart, and whether it is the full cycle

Seed:
- The REGISTRATION step reruns in every new process (`shouldRerun` reads the in-process snapshot,
  seed-workflow.js:141-150, :388-394; `registrationReady` needs `cdcIntegrationService` and the state
  machine :105-108), so `releaseSeedParticipantCohorts` runs again with trigger FRESH_SEED.
  `prepareDurableAuthority` (seed-startup-session-store.js:135-179) loads the prior record (:145) and
  validates it (:172-176); a new `startupInvocation` with a fresh random `invocationId` and deadline is
  written (:198-239). The FRESH_SEED authorization id hashes `[authorityId, invocationId, bootIncarnation,
  deadlineAtMs, targetBuildDigest]` (authorization-owner.js:34-38), so it differs from the one retained
  by the previous boot -> `continueDurableRelease` returns null (cutover.js:451-452) -> **the full
  PAUSE / RETIRE / control-owner-first / DRAIN / REOPEN(if servedLegacy) / ENABLE(replay) / AUTHORIZE /
  RESUME / CONFIRM cycle runs for every partition on every seed restart** (:601-760). `runCutoverAttempt`
  skips the fresh-storage authority check because the origin exists (:577-584).
- Partition services are recreated with `identityExisted` from the durable SERVICES snapshot
  (seed-partitions-phase.js:266-271) and restore from the raft record instead of re-founding.
- In parallel, the recovery loop (release-recovery.js) is armed as soon as `acquireReplicaHandler`
  registers the bootstrap partitions (registration-methods.js:293-295 -> `subscribeServiceChanges`
  :124-130 -> `enqueue`). `reconcile` (:70-98) acts when: a local initialized LEADER exists (:72-77),
  it is CLOSED (:79), an origin exists (:80-84: otherwise it only reports `explicit_pre_origin_release_request`
  OPERATOR_REQUIRED and stops - so on a FRESH seed the loop is inert until ENABLE), the build is MEASURED
  (:85-90); then `runParticipantCutover` with trigger EXISTING_ORIGIN, no authorization and a 30 s
  deadline (:93-95; constants.js:35); any non-CUT_OVER answer re-enqueues after 1 s (:97, :37).
  Its root id is `existing:<releaseId>` (cutover.js:448-450), so it matches a retained authorization only
  if the previous release was itself an EXISTING_ORIGIN release of the same releaseId.
- Both callers share `RUNS` per partition (cutover.js:763-794): a second request with a different
  `requestIdentity` (trigger, deadline, authorizationId differ) is refused `different_release_request_in_flight`
  UNAVAILABLE (:780-783) and retried by its own loop (seed: `retryAfterMs` 100 ms, :305-312; recovery: 1 s).

Joiner restart: C.3; the loop acts only for a locally led partition.

Snapshot-install and REOPEN replacements: the replacement is CLOSED; its reopening is whichever cycle
next runs on its leader (the recovery loop if the replacement itself leads, else a cycle triggered
elsewhere). `beforeServiceReplacement` retires the old projection first (snapshot-catchup-wiring.js:223-225;
snapshot-catchup.js:369-376 -> RETIREMENT_FAILED aborts the install).

### D.3 What is blocked until the cycle completes

Every row of table A.1 marked refused: all ordinary writes on that partition (site 1), legacy and
participant BEGINs, local mutations (site 4). Plus, specific to restart: the origin exists, so
`executeLocalQuery` writes are refused LEGACY_SESSION_FENCED for good (legacy-fence.js:181-183), and
on SQL_TRANSACTIONS any SQL write (sites executeQuery :82-89, applyWrite :704-708, committed apply
entry-apply-base.js:1048-1049) additionally requires the schema enforcement ENFORCED
(schema-enforcement.js:90-97). Reads are not blocked. Release-protocol commands, GENERATION_ORIGIN
replays, CDC_DELIVERED and COORDINATOR_SETTLEMENT are not blocked.

### D.4 Preconditions of the cycle that a restart must satisfy (facts)

- MEASURED build (readParticipantReleaseFacts :93-94; recovery :85-90; `runtimeBuildProvenance`
  src/diagnostics/runtime-build-provenance.js:60-84: raft binding verified, content/sqlite/executable digests).
- The control route for RETIRE: a local SQL_TRANSACTIONS leader, else
  `releaseQueryEngine(...).queryExecutor.bootstrapTopologySnapshotOwner` (retirement.js:29-56; cutover.js:257-260),
  i.e. an engine attached to the service or to `handler.cdcIntegrationService` (cutover.js:162-167) -
  on the seed set at seed-workflow.js:338 and bridge-owner.js:65 before release; on the recovery loop's
  earlier wake they may be absent -> `retirement route unavailable` -> attempt UNAVAILABLE -> retry.
- Every member drained (F) and every member's `topology` null: `topologyTransitionOf` returns
  UNAVAILABLE when `service.systemTableCache` is null (topology-fence.js:80-81) -> TOPOLOGY_PENDING
  (release-contract.js:103). Seed partitions get the cache at seed-workflow.js:336; joiner-restored
  partitions get it only after hydration (publication-activation.js:248-250).

### D.5 What changed vs 10c2f0610 (D)

- No admission existed in the base; no durable release columns (store.js diff adds RELEASE_COLUMNS
  and the apply/update functions :143-196); `startup-workflow-store.js` records
  `immutableAuthorization` / `startupInvocation` / `participantReleaseCommand` with fsync (diff).
- `partition-reopen-options.js` is new (`durableRecordBootstrap` for every replacement).
- `snapshot-catchup.js` gained `beforeServiceReplacement` (:369-376); `snapshot-install.js` gained
  the exclusive REJECTED marker write (:547-568).

---------------------------------------------------------------------------------------------

## E. Recovery work that must run while CLOSED (owner's three names)

### E.1 Snapshot recovery

- Owner: src/raft/snapshot-catchup.js (`dispatchSnapshotCatchup` on the leader, wired at
  src/bootstrap/shared/snapshot-catchup-wiring.js:112-138 from the port's SNAPSHOT_CATCHUP_NEEDED
  request, partition-service-raft-init-base.js:465-); follower install `orchestrateSnapshotCatchupInstall`
  (snapshot-catchup.js:362-422), armed per adopted bulk connection (wiring.js:193-241).
- Partition writes: none through the write path. The install replaces the db image
  (`requestSnapshotInstall` :385-391) and recreates the service (:396-406; `requireActiveReplicaStorageAdmission`
  first, wiring.js:217-221 -> replica-handler-create-admission-methods.js:329-357, a read of the SERVICES
  row). The only committed command on the path is RELEASE_RETIRE (bypass) from `beforeServiceReplacement`.
- Pause: not consulted by the install; the RETIRE is a bypass; the replacement starts CLOSED (D.1).
- Does release wait on it: yes - DRAIN requires `appliedIndex === commitIndex === lastIndex` on every
  member (release-facts.js:65-70; release-contract.js:102), so a member that needs a snapshot cannot
  drain -> DRAIN_PENDING -> retry (cutover.js:658-666). The install itself needs only the RETIRE route
  (D.4), not an OPEN admission. Not circular by code; see G.3 for the control-partition case.

### E.2 Replica discovery

- No production module is named "discovery" (grep; the only hits are comments at
  src/node/replica-handler-committed-membership-methods.js:12, :73-82 "rows as discovery" -
  `discoveredOutsideFounders` reads SERVICES rows, no write; and the node lifecycle DISCOVERING state).
- The release protocol's own member discovery: `cohortOf` (cutover.js:49-59) = `releaseMemberIds` of the
  committed membership (release-contract.js:58-67, voters + learners) mapped to nodes by
  `releaseNodeOfAddress` (AddressManager, participant-release-client.js:13-19); then `readCohort`
  INSPECT (:61-65) over the replica-handler route (client.js:34-61; `/service/replica-handler`,
  constants.js:39), dispatched before the cleanup barrier (replica-handler-lifecycle-methods.js:136-146).
- Partition writes: none (reads of raft status, committed membership, generation row, table shape,
  sql_transactions census - release-facts.js:89-120).
- Pause: not consulted (facts carry `paused` as data).
- Does release wait on it: yes - any member answering non-OBSERVED stops the attempt
  (cutover.js:634-639, :653-657; participant-release.js:379-382 `hosted_replica`; release-facts.js:91-92
  requires `initialized`, not shut down, and registered in `localServices`). A learner added by conf
  change whose node has not yet put the service into `localServices` (CREATE between
  create-methods.js:326 and :354) holds every release of that partition for that window.

### E.3 CDC settlement

Two different owners carry that name:

(a) CDC obligation delivery (src/partition/partition-cdc-obligation-delivery.js): owed obligations in
the ledger (recorded inside the committed apply, partition-cdc-obligation.js:95-113 and
`recordCommittedStatementCdc`, entry-apply-base.js:1084-1085 - only for SQL statement commands and
participant decisions, never for release commands) are driven by the leader to current subscribers
(:478-497; NO_SUBSCRIBERS when none, :514-517) and acknowledged as CDC_DELIVERED proposals
(:325-372 -> partition-cdc-obligation.js:287-301, `startPartitionRaftWriteCommit`, bypass; leadership
required :288-291).
- Pause: bypassed. In-flight proposals count in `proposals` and `pendingOutcomes` (F), so DRAIN waits
  for them, but they complete without admission -> not circular. Subscribers on the seed exist before
  release (seed-workflow.js:340).

(b) Query-transaction settlement for the SQL_TRANSACTIONS partition: `settleQueryRelease`
(cutover.js:177-234; also in `continueDurableRelease` :491-515) runs only when the local census is
HELD (rows exist, release-census.js:29-63), i.e. not on a fresh seed; it calls
`settleTransactionReleaseRows` (src/query/distributed/distributed-transaction-release-settlement.js:276-307):
- engine = `service.sqlQueryEngine` or `handler.cdcIntegrationService.sqlQueryEngine`, which must agree
  (cutover.js:162-167); missing -> `settlement_input` failure (:278-298) -> QUERY_DRAIN_PENDING
  (cutover.js:671-678). On the seed both are set before release (seed-workflow.js:338; bridge-owner.js:65);
  the engine is provisional: routing dimension CONTROL_PLANE_RECOVERY_ELIGIBLE, no auto recovery
  (bridge-owner.js:50-62).
- Reads: `readDistributedTransactionRecoveryState` (sql-query-engine-transaction-set-methods.js:65-83)
  -> `gateway.readAuthoritativeRows` (:19-22, :70-72) -> CDC authoritative read.
- Writes: FREEZE / DECIDE / PROGRESS as COORDINATOR_SETTLEMENT via `service.handleApplicationMessage`
  (release-settlement.js:97-108 -> entry-apply-base.js:389-390 -> coordinator-settlement.js:47-76):
  bypass, leadership required. Participant COMMIT/ROLLBACK via `engine.deliverTransactionOperation`
  (sql-query-engine.js:429-489 -> `queryExecutor.executeOnPartition` :476-484, which requires
  `messageRouter` and `systemCache` (query-executor-partition-delivery.js:111-119)) -> TRANSACTION
  message -> `decideParticipant` (transaction-request.js:457-) -> bypass on each participant's leader.
- Pause: the settlement writes bypass it; the engine's routing is the dependency.
- Does release wait on it: yes (QUERY_DRAIN_PENDING until a proof binds, cutover.js:669-678, :720-733).
- Circular-wait candidate (restart with HELD rows): settlement needs the engine to route to partition
  leaders through `systemCache`; on the seed the cache is hydrated in CACHE_HYDRATION
  (seed-cache-hydration-phase.js:159-162), which runs AFTER the REGISTRATION step that contains the
  release (B.1). Whether `partitionServicesProvider` (bridge-owner.js:53; consulted at
  sql-query-engine-routing-metadata-methods.js:321-335) lets the executor reach a LOCAL leader on an
  empty cache is not settled here (G.1). If it does not, a seed restart with recoverable sql_transactions
  rows holds at QUERY_DRAIN_PENDING until the invocation deadline.

(c) Distributed transaction recovery proper (`activateDistributedTransactionRecovery`) is explicitly not
part of the release: seed-workflow.js:214-218, bootstrap-service.js:499-503; it starts after the final
engine attach (lagrange-runtime-startup.js:530-537).

### E.4 Engine attachment relative to the release loop (the brief's `settleQueryRelease` question)

- Seed, in REGISTRATION-step order: `acquireSqlQueryEngine` (seed-workflow.js:400) sets
  `cdcIntegrationService.sqlQueryEngine` (bridge-owner.js:65); `acquireReplicaHandler` (:401) registers
  the bootstrap partitions in `localServices` (registration-methods.js:293-295), which arms the recovery
  loop (release-recovery.js:124-130); `prepareFreshSeedActivationReadCut` (:419) sets
  `partition.sqlQueryEngine` (:338); `releaseSeedParticipantCohorts` (:420) runs last; `this.sqlQueryEngine`
  on the owner is set after it (:422). Between :401 and :419 a recovery-loop wake sees
  `service.sqlQueryEngine === null` and the bridge engine present, so `releaseQueryEngine` yields the
  bridge engine (cutover.js:162-167); on a fresh seed that wake is inert anyway (origin null,
  release-recovery.js:80-84), on a restart it is not (D.2). The handler's `cdcIntegrationService` is the
  bootstrap one (registration-methods.js:138, :275).
- Joiner: `createJoinLocalPartitionService` passes `cdcIntegrationService?.sqlQueryEngine || null`
  (publication-activation.js:262); the replica handler's CDC service is the joiner's (:195, :211).

---------------------------------------------------------------------------------------------

## F. Transaction and participant state kept across the pause

`readAcceptedWork` (src/partition/partition-participant-release-facts.js:46-63) and `isReleaseDrained` (:65-70):

| Counter | Source | Can be non-zero on a fresh seed during bootstrap |
|---|---|---|
| `legacyActive` | `service.activeTransactions.size` (:47) | no: legacy BEGIN refused while CLOSED (A.1/3); sessions exist only after OPEN |
| `legacyPrepared` | `service.preparedTransactions.size` (:48) | no (same) |
| `sqliteTransactionOpen` | `service.db.inTransaction` (:58) | only inside a committed apply (store.js:5-8); facts are read between applies |
| `participantStaging` | `hasParticipantSession` (:59) | no: participant BEGIN refused while CLOSED (A.1/2) |
| `participantPrepared` | PREPARED rows (:56, :60) | no on a fresh seed; yes after a restart with PREPARED rows (then DRAIN_PENDING until a decision applies - decisions bypass the pause) |
| `proposals` | `service.proposalQueue.size` = `pendingCommits.size` (proposal-queue.js:55-57; removed on resolve/reject/release :143-144, :168-169, :215) | transiently: the protocol's own commands between `waitForCommittedWrite` (write-commit.js:334; cdc-stream-base.js:346-348) and their apply; CDC_DELIVERED (E.3a) |
| `pendingOutcomes` | `service.pendingWriteOutcomes.size` (cdc-stream-base.js:364-383; cleared when the outcome promise settles :376-381, registered before the caller's await) | same set as `proposals`; the leader's PAUSE is settled before DRAIN is evaluated (release-request.js:84-88 awaits it; cutover.js:643-647) |
| `appliedIndex === commitIndex === lastIndex` | committed-membership read vs `raft.readStatus()` (:52, :61-62; `lastIndex = group.persistedLastIndex`, raft-rs-runtime-owner.js:1205) | transiently on the leader after any append (the PAUSE entry itself, rs-raft term-start entries) until quorum commit and apply; on a learner until caught up |

Recipient side: a member answers the PAUSE action only once the committed PAUSE has applied locally
(`observeParticipantAdmissionPause`, release-request.js:53-63, :80-82; participant-release.js:133-138
-> UNAVAILABLE `committed_dependent_pause`, retryAfterMs 100), and the RESUME only once the committed
RESUME has applied (release-request.js:264-281; participant-release.js:293-304).

Control-partition writes during a dependent's cycle (RESERVE..CONFIRM) land on SQL_TRANSACTIONS,
which is released first (seed-workflow.js:270-274) and is OPEN by then; they do not enter the
dependent's counters.

---------------------------------------------------------------------------------------------

## G. Open questions (not settled from the source)

1. Routing on an un-hydrated cache: `executeOnPartition` requires `this.systemCache`
   (query-executor-partition-delivery.js:119); whether the provisional engine
   (`partitionServicesProvider`, bridge-owner.js:53; routing-metadata-methods.js:321-335) can deliver a
   TRANSACTION or authoritative read to a LOCAL leader before CACHE_HYDRATION. Decides whether E.3(b)
   is a hard circular wait on a seed restart with HELD sql_transactions rows.
2. "Replica discovery": no owner by that name; which of E.2's candidates (cohort INSPECT census,
   rows-as-discovery in committed-membership-methods, `resolveReplicaContextWithRetry`
   create-methods.js:279-290) the owner means.
3. E.1 control-partition case: if the SQL_TRANSACTIONS partition's own follower needs a snapshot and
   its leader is on the node whose release is pending, whether the RETIRE route (D.4) resolves; the
   topology-owner fallback (retirement.js:45-55) depends on published SERVICES rows that are written
   only after release (B.2).
4. Whether `raft.readCommittedMembership({purpose})` on a follower contacts the leader or answers from
   the local record (release-facts.js:96-102 requires it to equal `readStatus()`); affects INSPECT on
   lagging members. Not read in this census.
5. Whether a FRESH_CREATE whose partition leader is on another node can ever have `origin === null`
   there (cutover.js:577-584 would answer OPERATOR_REQUIRED since the token does not travel, C.2).
6. Timing of the seed-workflow vs recovery-loop contention on `RUNS` (D.2): the refusal path exists;
   how often the seed's 100 ms retry collides with the loop's 30 s attempt is a measurement, not source.
7. Joiner-led partitions before hydration: `cacheForPartition` null (publication-activation.js:248-250)
   -> `topologyTransitionOf` UNAVAILABLE (topology-fence.js:80-81) -> TOPOLOGY_PENDING for any release
   the joiner leads; whether hydration always precedes such leadership on the durable-rejoin path.
8. Learner window (E.2): how long a conf-changed learner stays absent from its node's `localServices`
   and therefore holds every release of that partition.
9. CDC obligations owed from before a restart (E.3a): they start being driven when subscribers attach
   (seed-workflow.js:340) and their CDC_DELIVERED proposals run concurrently with the first cycle; the
   drain cost is bounded by apply but unmeasured.
10. `servedLegacy`: on a fresh seed it stays false (connection.js:32; `noteLegacySessionServed` only at
    legacy-fence.js:146 after the pause check), so REOPEN is not expected; no bootstrap path that opens a
    legacy session before release was found, but the message-group raft groups and the admin/runtime
    surfaces were not audited for legacy BEGINs before `openExternalTransportAdmission` (seed-workflow.js:501).
