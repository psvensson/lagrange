# Recon: production-derived membership-transition state in Lagrange

Read-only reconnaissance at `/mnt/data/peter/projects/lagrange`, HEAD `49c0b6d0f`,
branch `records/2026-09-19`. Nothing in the repository was changed; no tests, no
clusters, no probes were run.

**Brief.** Owner decision `solve/epics/formation-seed-decoupling/owner-decision-transition-identity-2026-09-20.md`
§4/§5/§7/§8, reframed mid-task by the coordinator to **complexity reduction**:
the target model ("Model A") is `PartitionPolicy` + `PlacementObservations` +
`CommittedMembership (Raft)` + **zero-or-one unresolved durable
`ReplicaOperation` per partition**, the durable operation itself carrying the
control-plane authority and fenced by a committed-membership generation. No
separate `PartitionTransitionIdentity` subsystem is presumed or proposed.
Sections 1-6 are the inventory as originally briefed; §7 is replaced; §9 and §10
are new.

**Discipline.** Every claim carries `file:line`. `READ` = I opened the code and
read the cited lines. `READ[d]` = read by a delegated read-only search agent in
this same tree and spot-verified by me on at least a sample. `INFERRED` = my
reasoning over READ material, marked as such. Where two modules disagree the
disagreement is stated, never averaged. No repairs, authorization kinds or
enforcement are proposed anywhere in this document.

**Bounding statement (what I did NOT cover).** I did not read: the
message-group analogue of the partition path beyond where it shares a module;
the split/merge workflow families (`src/partition/managed-split-*`,
`managed-merge-*`) except where the epoch sweep touched them; the CDC
propagation internals; `src/bootstrap/join-*`. Three delegated read-only sweeps
(per-partition serialization gates; membership-census views; epoch/generation
domains) all returned and are folded in below, each spot-verified by me on a
sample — §2, §4.5 and §6 are therefore now broad rather than merely deep.
Residual gaps are listed in §8.

---

## 1. Inventory: every production structure that carries part of a membership transition

### 1.1 `replica_operations` — the durable operation row

**Schema.** `src/bootstrap/system-table-runtime-schema-definitions.js:55-100` (READ).
Full column list, verbatim order:

| Column | Type / notNull | Written by | Notes |
| --- | --- | --- | --- |
| `operation_id` | TEXT, PK | creation path, `src/rebalancer/rebalance-coordinator-operation-creation.js:651` (`move.operationIntentId \|\| uuidv4()`) | identity |
| `type` | TEXT notNull | same, via `createOperationRecord` | `ADD` / `REMOVE` / `REPLACE` (`src/rebalancer/replica-operation-progress.js:96-103`); the schema comment at `:59` still says "'ADD' or 'REMOVE'" and is stale w.r.t. REPLACE |
| `partition_id` | TEXT notNull | creation path | |
| `entity_type` | TEXT notNull | `rebalance-coordinator-operation-creation.js:731-732` | `partition` / `message_group` / `runtime_service` |
| `entity_id` | TEXT notNull | same | |
| `membership_publication_epoch` | INTEGER (nullable) | `createOperation` params, `src/rebalancer/replica-status.js:167-169`; value threaded from the planning cycle, `src/rebalancer/unified-rebalancer-rebalance-loop.js:239-246` | the ONLY generation stamp on the row; see §6 |
| `replica_id` | TEXT | creation path, allocated at `rebalance-coordinator-operation-creation.js:676-700` | the **target/destination** replica identity |
| `target_claim_key` | TEXT, UNIQUE index | `rebalance-coordinator-operation-creation.js:733-739` | **runtime services only**; never populated for partitions |
| `source_node_id` | TEXT notNull | `rebalance-coordinator-operation-creation.js:322-325` | for REPLACE = the move's source node; otherwise the **creating node** |
| `target_node_id` | TEXT notNull | creation path | destination node |
| `status` | TEXT notNull | `WORKFLOW_STEP_TO_STATUS[step]`, `src/rebalancer/operation-workflow-transition-persistence.js:95`, `:343`, `:355`, `:405` | a *derived* mirror of `workflow_step` |
| `workflow_step` | TEXT notNull | the workflow owner's transition family (`operation-workflow-transition-persistence.js`, `operation-workflow-transition-orchestration.js`) | the real phase |
| `created_at` / `updated_at` / `completed_at` | INTEGER | creation + transition owner | `completed_at IS NULL` is the durable "unresolved" predicate used as a CAS guard, `src/rebalancer/replica-operation-repository.js:203-207` |
| `lease_expires_at` | INTEGER | `UPDATE_OPERATION_OWNER_LEASE`, `src/rebalancer/replica-operation-repository.js:209-213`; decoded at `src/rebalancer/replica-operation-repository-row-methods.js:108-114` | owner heartbeat; **not in the INSERT column list** (`replica-operation-repository.js:186-191`) |
| `error_message` | TEXT | transition owner | |
| `steps_history` | TEXT notNull (JSON array) | creation + every transition; the operation's own metadata channel | see 1.2 |

Indices at `:77-99`, including the unique `idx_replica_ops_target_claim_key`.

**Durability (R10).** Durable: this is a replicated system table
(`replica_operations-p1`, `src/bootstrap/system-table-schemas-constants.js:141`)
and is classified as the operation LEDGER
(`src/bootstrap/system-partition-classification.js:240`). READ.

**Row → object decode.** `src/rebalancer/replica-operation-repository-row-methods.js:54-155`
(READ). The decode adds derived fields that are **not columns**:
`semanticPhase` (`:115-119`), `witnesses` (`:120-124`), `sourceReplicaId`
(`:125`, read out of `steps_history`), `replicaIds` / `peerAddresses` /
`bootstrapTableMetadata` / `bootstrapPartitionMetadata` (`:126-153`), and
`ownerLeaseExpiresAt` (`:108-114`).

**Lifecycle states and who advances them.** `WORKFLOW_STEP` =
`{PENDING, SENDING, CREATING, SYNCING, ACTIVE, STOPPING, REMOVED, FAILED}`,
`src/constants/workflow.js:1-10` (READ). Per-type orders:
`ADD_WORKFLOW_STEPS` `src/rebalancer/replica-operation-progress.js:149-155`;
`REMOVE_WORKFLOW_STEPS` `:163-168`; `REPLACE_WORKFLOW_STEPS` `:179-187` (READ).
Terminal sets by type: `OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE` `:215-239`
(ADD → `ACTIVE`/`FAILED`; REMOVE and REPLACE → `REMOVED`/`FAILED`).
Semantic-phase table: `REPLICA_OPERATION_SEMANTIC_PHASE`
`{unknown, accepted, target_ready, source_retiring, settled, failed}` `:77-84`,
with the per-type rules at `:285-343` (READ).

### 1.2 The operation's metadata channel (`steps_history[0]`)

`OPERATION_METADATA_KEY`, `src/rebalancer/replica-operation-progress.js:350-363`
(READ): `sourceReplicaId`, `readinessSnapshot`, `replicaIds`, `peerAddresses`,
`bootstrapTableMetadata`, `bootstrapPartitionMetadata`,
`bootstrapTopologyDispatchDeferred`, `cureTransitionAuthorization`.

This is where facts that have **no column** live. Notably the REPLACE's
**source replica identity** is written only here:
`src/rebalancer/replica-status.js:144-148` (READ) — stamped on the first
steps-history entry at creation. Durable (inside a notNull TEXT column) but
schema-invisible and only reachable through a JSON parse.

### 1.3 Move objects produced by planners

A move is a plain in-memory object; there is no move schema module. Its fields,
from the mint sites:

- `{type, replicaId, nodeId, reason}` — failed-replica REMOVE,
  `src/rebalancer/move-planner-move-calculation-methods.js:244-252` (READ)
- `{type, nodeId, reason}` — deficit ADD, `:349-357` (READ)
- `{type, replicaId, nodeId, reason, sourceIsLeader, prioritySpreadStandaloneSafe, prioritySpreadMonotonicSafe, standaloneSafe}` — surplus REMOVE, `:604-619` (READ)
- `{type, nodeId, sourceNodeId, replicaId, reason}` — paired relocation REPLACE, `:715-726` (READ)
- `{type, partitionId, entityType, entityId, nodeId, reason, controlPlaneMutationWorkClass, <priority-recovery authority field>, …serialWaitMoveFields, sourceNodeId?, replicaId?, targetReadinessMode}` — priority-recovery follow-up, `src/rebalancer/unified-rebalancer-follow-up-move.js:77-99` (READ)
- spread-cure ADD/REMOVE variants, `src/rebalancer/move-planner-priority-spread-cure.js:106`, `:263`, `:328` (READ)

`reason` is one of `MOVE_REASON = {replica_failed, increase_replica_count,
node_not_in_target, spread_replicas, replace_replica}`,
`src/rebalancer/rebalancer-constants.js:409-415` (READ). Move types are
lowercase `REBALANCER_MOVE_TYPE = {add, remove, replace}`, `:31-35`; operation
types are uppercase (`replica-operation-progress.js:96-103`) — the case seam is
explicitly normalized at `src/rebalancer/replica-placement-cure-policy.js:500-506`.

**Type+reason are assigned by ONE owner**, the cure-typing table
`PLACEMENT_CURE_BY_CONDITION`, `src/rebalancer/replica-placement-cure-policy.js:107-187`
(READ), resolved through `resolvePlacementCure` `:196-198` (fail-closed: an
undeclared condition mints no move).

**Transient (R10).** Moves are per-cycle objects; nothing persists them.

### 1.4 The authorization carry field (landed `critical-spread-transition-authority-carry`)

`src/rebalancer/spread-cure-transition-authorization.js` (READ, whole file).

- Minted by the cure policy owner only, `replica-placement-cure-policy.js:415-437`
  (`authorizeSpreadCureTransition`), and only for the single condition
  `PRIORITY_OVER_TARGET_SPREAD_CURE` (`:420`).
- Policy half: `{intent, desiredReplicationFactor, observedMembershipEpoch,
  observedVoterCount, authorizedResultingVoterCount, destinationNodeId}`,
  `spread-cure-transition-authorization.js:156-163`.
- Coordinator half: `{destinationReplicaId, operationId}`, `:166-169`.
- Validity rule: `authorizedResultingVoterCount === observedVoterCount + 1`,
  `:274-277` — "one exact transition, never a blanket target + 2".
- Rides the move as `spreadCureTransitionAuthorization`, `:70-71`; copied
  verbatim onto the coordinator request at
  `src/rebalancer/unified-rebalancer-move-execution.js:105-109`; stamped into
  `steps_history[0].cureTransitionAuthorization` at
  `src/rebalancer/rebalance-coordinator-operation-creation.js:790-797`
  → `spread-cure-transition-authorization.js:510-518, 531-549`.
- Decoded/evaluated at the receiving learner,
  `src/partition/partition-service-learner-promotion-count-check-methods.js:264-284`
  (READ). It **decides nothing** — the header comment at `:246-252` says so
  explicitly; the count check's grant/deferral is already settled when it runs.
- The membership fence is deliberately **not** applied at that site: the caller
  supplies `SPREAD_CURE_PARTITION_EPOCH_NOT_READ` (`:275`), so the outcome is the
  named third state `MEMBERSHIP_FENCE_NOT_EVALUATED`
  (`spread-cure-transition-authorization.js:86-90`, `:399-403`).

**Durable** once stamped (inside `steps_history`), and it is the only
semantic-reason-like value that reaches the row. **It exists for at most one
condition out of the twelve in the cure table.**

### 1.5 Workflow/step state modules (`operation-workflow-*`)

~95 modules under `src/rebalancer/` (directory listing, READ). Load-bearing ones
for transition state:

- `operation-workflow-transition-persistence.js` — the durable step write.
  `completeOperation` `:316-420` (READ), terminal SQL
  `UPDATE_OPERATION_TERMINAL … WHERE operation_id = ? AND completed_at IS NULL`
  (`src/rebalancer/replica-operation-repository.js:203-207`, first-terminal-wins).
- `operation-workflow-transition-orchestration.js:385` — `status` is always
  written as `WORKFLOW_STEP_TO_STATUS[step]` (READ).
- `replica-operation-step-policy.js` (READ, `:1-120`) — the single owner of
  "which workflow steps does mechanism X cover"; named coverage rows, e.g.
  `DISPATCH_PENDING_WORKFLOW_STEPS` `:96-101`,
  `isActiveReplaceSourceRemovalPhase` `:105-111`.
- `operation-workflow-remove-safety-evaluator.js:455-506` (READ) — the
  execution-time per-entity serialization lock; see §9.
- `operation-workflow-dispatch-epoch-gate.js`, `…-ledger-self-move-gate.js`,
  `…-reservation-gate.js` — dispatch-side gates.
- `operation-workflow-gate-operation-row-repair.js:29-49` (READ) — re-inserts a
  missing operation row (re-materialization).

**Transient vs durable:** the step is durable; the *owner* state (retry
registries, handoff state, observed-progress retention) is in-memory per node.

### 1.6 `partitions` row — the policy row

`src/bootstrap/system-table-core-schema-definitions.js:48-73` (READ):
`partition_id` (PK), `table_id`, `table_name`, `partition_key_start/end`,
`partition_version` (INTEGER notNull default 1), `replica_count` (notNull
default 3), `size_bytes`, `leader_node_id`, `state` (default `'NORMAL'`),
`created_at`, `updated_at`.

- `replica_count` is the **declared replication policy**; the cure policy owner
  reads it through `resolveDesiredReplicationFactor(partitionRow)` and
  deliberately *not* from the planner's `targetReplicaCount`
  (`replica-placement-cure-policy.js:424-428` plus the rationale at `:389-395`,
  READ).
- `leader_node_id` is canonical for leader identity
  (`architecture/runtime-contracts.md:174-181`) but has **no named single
  writer** — recorded there as a known incomplete-owner gap.
- `partition_version` — see §6.

### 1.7 `services` rows — the replica rows

`src/bootstrap/system-table-core-schema-definitions.js:221-249` (READ):
`service_id` (PK), `service_type`, `node_id`, `partition_id`, `group_id`,
`replica_id`, `raft_role`, `status` (notNull default `'active'`),
`state_entered_at`, `previous_state`, `trigger_reason`, `error_message`,
`address`, `created_at`, `updated_at`.

Field-owner split (`architecture/runtime-contracts.md:174-192`, READ):
lifecycle fields (`status`, `state_entered_at`, `trigger_reason`, …) →
`ReplicaStateMachine`; `raft_role` → `PartitionService`/`MessageGroupService`;
identity → the service-row creation owner. Explicitly cited there as *the*
canonical example of non-overlapping field owners on one row.

- `ReplicaStatus = {pending, creating, syncing, active, removing, removed, failed}`,
  `src/rebalancer/replica-operation-progress.js:12-27` (READ).
- `raft_role` is a **published projection**, not the raft state:
  `normalizePublishedRaftRole` collapses CANDIDATE→FOLLOWER and unknown→FOLLOWER,
  `src/raft/published-raft-role.js:9-25` (READ); written asynchronously through
  `queueRoleUpdate` → CDC, `src/raft/raft-replica-base.js:395-413`,
  `src/partition/partition-service-metadata-delivery-methods.js:26-30` (READ).
- Role membership sets are owned once at
  `src/raft/replica-voter-readiness.js:40-77` (READ):
  `QUORUM_VOTER = {leader, follower, candidate}`,
  `LOAD_ROUTABLE = {leader, follower}`, `CATCHUP_LEARNER = {learner}`,
  `EXPLICIT_NON_LEADER = {follower, candidate, learner}`. The header at `:6-25`
  records that these memberships genuinely differ and why.

### 1.8 Raft configuration-change state

**There is no durable Raft configuration object and no joint-consensus record.**
READ:

- The live peer set is `partitionService.raft.nodes` — an in-memory,
  address-keyed list, `src/partition/partition-service-raft-peer-cache-reconciliation.js:272-281`.
- It is **reconciled FROM the `services` cache**, not the other way round:
  `reconcileRaftPeersFromCacheForService`, `:230-266`, filters
  `systemTableCache.filter(TABLES.SERVICES, …)` and calls
  `raft.leave(staleAddress)` / `raftProvider.joinPeer(raft, expectedAddress)`.
- The inclusion predicate is **`services.status`**:
  `shouldSkipPeerServiceRow`, `:77-87` — a row is skipped iff status is
  `FAILED`, `REMOVING` or `REMOVED`. A `SYNCING` row is a peer.
- `joinPeer` is the only provider-level membership verb,
  `src/raft/liferaft-provider.js:255`; there is no `leavePeer`/config-change
  entry in `raft-provider-contract.js` (grep, READ).

**Consequence (INFERRED, from the above READs):** what the owner's Model A calls
`CommittedMembership (Raft)` does not exist as a production artifact today. The
nearest thing is the `services` row set, and Raft's peer list is *derived* from
it. Any "committed membership generation" would therefore have to be minted by a
new owner or by the `services` owner, not read out of Raft.

### 1.9 Membership publication objects

`control_plane_publications` schema,
`src/bootstrap/system-table-runtime-schema-definitions.js:17-49` (READ):
`publication_id` (PK), `publication_kind`, `publication_epoch`,
`publisher_node_id`, `source_topology_epoch`, `source_snapshot_version`,
`published_active_node_ids`, `required_ack_node_ids`, `acknowledged_node_ids`,
`priority_partition_summary`, `membership_lifecycle_summary`, `status`,
`reason_code`, timestamps, `transition_history`.

Single writer: `MembershipPublicationCoordinator`
(`architecture/runtime-contracts.md:180`).

**This is CLUSTER NODE membership, not partition replica membership.**
`publication_epoch` advances iff the published **node id list** changed, or
`source_topology_epoch` / `source_snapshot_version` changed:
`src/control-plane/membership-publication-candidate-derivation.js:525-536`
and `:554-557` (`candidatePublicationEpoch = changed ? baselineEpoch + 1 :
max(baselineEpoch, 1)`) — READ.

Contract owner for reading/fencing it:
`src/control-plane/membership-epoch-contract.js` (READ) —
`buildMembershipEpochSnapshot` `:159-210`, `buildMembershipEpochFence` `:212-275`
(states `current` / `stale` / `future` / `unknown`),
`selectLatestPublishedMembershipEpoch` `:300-321` (bootstrap fallback 0).

### 1.10 Priority-recovery summaries

- `priority_partition_summary` and `membership_lifecycle_summary` are columns on
  the publication row (1.9).
- Built/normalized by
  `src/control-plane/membership-publication-priority-partition-summary.js`
  (imported at `membership-publication-candidate-derivation.js:43-50`, READ) with
  `PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT` and
  `buildDerivedPriorityPartitionSummary`.
- Consumed for a decision by the promotion guard:
  `hasPriorityRecoverySpreadGap(priorityPartitionSummary)`,
  `src/partition/partition-service-learner-promotion-count-check-methods.js:168-171`
  (READ), and by remove-safety,
  `src/rebalancer/operation-workflow-remove-safety-membership.js:46-49` (READ).
- The **overflow voter budget** the promotion guard spends comes from
  `buildPriorityRecoveryCompletion(…).temporaryOverflowVoterBudget`,
  `partition-service-learner-promotion-count-check-methods.js:171-178`, `:229-231`
  (READ). It is a **number**, not an identity set.

### 1.11 "Pending target" / "in-flight" censuses

- `buildReplicaInventorySnapshot`, `src/rebalancer/replica-inventory.js:205-580`
  (READ) — the canonical join of committed `services` rows with non-terminal
  `replica_operations` rows for one entity. Emits identity sets
  (`voterReplicaIds`, `learnerReplicaIds`, `orphanReplicaIds`,
  `voterTargetReplicaIds`, `settledVoterTargetReplicaIds`, `voterTargetNodeIds`,
  `occupiedNodeIds`, `promotableLearnerReplicaIds`) **and** the counts block
  `accounting` (`:513-528`). Provenance block `:566-578` explicitly states
  `atomicityClaim: ATOMICITY_NOT_CLAIMED`, an observed-at skew, a consistency
  state, and `topologyIncreaseUsable`.
- `pendingTargetNodeIds` / `crossPartitionPendingTargetNodeIds`,
  `src/rebalancer/unified-rebalancer-follow-up-move.js:361-398` (READ).
- Global blocking view with a cache-mutation-version memo,
  `src/rebalancer/global-topology-blocking-operation-view.js:12-39` (READ).

**All transient (R10).** The inventory is rebuilt per plan; it carries no
generation of its own (`sourceRevisions` may be `null`,
`replica-inventory.js:551-554`).

---

## 2. For ONE partition, what is "committed membership" today?

**There is no single authoritative owner.** I found six distinct views. They read
different columns of two tables plus one in-memory structure, and they disagree
by construction.

| # | View | Where | Inputs | Identities or counts | Who decides on it |
| --- | --- | --- | --- | --- | --- |
| V1 | **Status-based ACTIVE census** | `replica-inventory.js:109` (`active: hasNode && status === ACTIVE`) → `accounting.activeCount` `:513-514` | `services.status` from `SystemTableCache` | count (identities available as `activeReplicaIds` but not exported) | over-replication suppression in the follow-up builder (`unified-rebalancer-follow-up-move.js:642-647`); the over-creation cap (`move-planner-move-calculation-methods.js:424-427`) |
| V2 | **Raft-role voter census (planner)** | `replica-inventory.js:116-118` (`voter: hasNode && live && VOTER_RAFT_ROLES.has(raftRole)`) → `accounting.activeVoterCount` `:515` | `services.raft_role` + `services.status` liveness | count + `voterReplicaIds` set | the over-creation cap takes `Math.max(activeCount, activeVoterCount)`, `move-planner-move-calculation-methods.js:424-427` |
| V3 | **Raft-role voter census (promotion guard)** | `collectActiveVoterCensusForPromotion`, `src/partition/partition-service-learner-promotion-methods.js:647-660` | `services` rows from `SystemTableCache`, via `isActiveVoterServiceRowForPromotion` `:315-321` (`ACTIVE_VOTER_ROLES` ∧ live) | returns `{count, voterReplicas[{replicaId,nodeId}]}` — identities are collected **only to be logged** | `evaluateLearnerPromotionCountCheck` consumes the **count** only, `src/partition/learner-promotion-count-check.js:123-158` |
| V4 | **Learner census** | `collectPendingLearnerCensusForPromotion`, `partition-service-learner-promotion-methods.js:621-631` | same rows, `isLearnerServiceRowForPromotion` `:310-314` | `{count, learnerReplicaIds}`; count consumed | same guard |
| V5 | **In-flight add-like operation census** | `collectInFlightAddLikeOperationsForPromotion`, `partition-service-learner-promotion-methods.js:596-616`, rows from `readInFlightAddLikeOperationRowsForPromotion` `:560-585` | `replica_operations` rows in `SystemTableCache`, add-like type ∧ non-terminal status | a `Set<replicaId>` plus the one owned row | collapses to the **boolean** `hasOwnedAddLikeOperation`, `partition-service-learner-promotion-count-check-methods.js:205-209`, consumed by `resolveReplacementPromotionAllowed`, `learner-promotion-count-check.js:29-43` |
| V6 | **Published node membership** | `published_active_node_ids` on the publication row; `resolvePriorityRemoveSafetyMembershipSnapshot`, `src/rebalancer/operation-workflow-remove-safety-membership.js:32-97` | publication row + recovery projection node ids | **node-id sets**, with an explicit two-source choice at `:62-70` (`RECOVERY_PROJECTION_MEMBERSHIP` vs `PUBLISHED_MEMBERSHIP`) | remove safety |

Two further operation-side views that disagree with each other:

| # | View | Where | Difference |
| --- | --- | --- | --- |
| V7 | **All non-terminal ops for this entity** (`getEntityInFlightOperations`) | `src/rebalancer/move-planner-state-methods.js:349-368` → `src/rebalancer/unified-rebalancer-replica-state.js:701-711` | **drain-inclusive** |
| V8 | **Topology-blocking ops** (`getTopologyBlockingInFlightOperations`) | `unified-rebalancer-replica-state.js:775-780`, predicate `src/rebalancer/unified-rebalancer-topology-drain-methods.js:52-54` = `!isReplaceRemoveDispatchPhaseOperation` | **excludes a REPLACE at `ACTIVE`/`STOPPING`**, with the stated rationale at `:34-37`: "add-side topology has already converged and these rows must not suppress new add-like planning for other targets" |

`isReplaceRemoveDispatchPhase`: `src/rebalancer/replica-operation-progress.js:725-730`
(REPLACE ∧ workflowStep ∈ `{ACTIVE, STOPPING}`, `:281-283`). READ.

**Where counts are the PRIMARY decision input** (READ, all):

- `learner-promotion-count-check.js:123-158` — the promotion guard is
  *entirely* arithmetic over `targetReplicaCount`, `activeVoterCount`,
  `learnerCount`, `temporaryOverflowVoterBudget`. Its only identity-derived
  input is the boolean `hasOwnedAddLikeOperation`. `maxAllowedVotersAfterPromotion
  = target + (1 if replacement/expansion allowance) + additionalVoters`
  (`:125-130`); `votersAfterPromotion = activeVoterCount + 1` (`:131`).
- `move-planner-move-calculation-methods.js:424-427` — `surplusVoterCount =
  Math.max(activeCount, activeVoterCount)`, an explicit *reconciliation by
  maximum* of two disagreeing censuses. The comment at `:412-423` documents the
  disagreement (status lags raft_role during the promotion window) and says the
  max keeps the cap "strictly non-regressive".
- `unified-rebalancer-follow-up-move.js:642-647` — `inventory.accounting.activeCount
  > targetReplicaCount`.
- `rebalance-coordinator-priority-budget-admission.js:259-261` —
  `occupiedAliveCount > targetReplicaCount` [d].
- `effective-placement-serial-priority-planner.js:275-278` — `deficitCount` and
  `surplusCount` from `effectiveReplicaCount` vs `targetReplicaCount`.

**Where identities survive into a decision:** the target-node exclusion sets
(`unified-rebalancer-follow-up-move.js:175-196`), the topology guard's
`TARGET_NODE_ALREADY_OCCUPIED` [d]
(`rebalance-coordinator-topology-guard-methods.js:556-563`), the remove-safety
concurrent-op lock (`operation-workflow-remove-safety-evaluator.js:475-500`), and
the `settledVoterTargetReplicaIds` projection
(`replica-inventory.js:397-418`).

**Disagreement statement.** V1 and V2 disagree during the promotion window (the
code says so at `move-planner-move-calculation-methods.js:414-419`). V2 and V3
read the same columns but through different predicates
(`VOTER_RAFT_ROLES` includes CANDIDATE in both — `replica-voter-readiness.js:44-47`
— but V2 additionally requires `accountingOccupied` liveness via
`replica-inventory.js:102-118`, while V3 requires only "not FAILED/REMOVING/REMOVED"
via `isLiveReplicaServiceRowForPromotion`,
`partition-service-learner-promotion-methods.js:278-284`). V7 and V8 disagree on
drain-phase REPLACEs by explicit design. V6 is a node-set, not a replica-set, and
chooses between two sources at runtime.

### 2.1 The wider census sweep — nine more membership predicates

The delegated sweep found the six views above plus these; the axes on which they
differ are (a) which `services.status` values count, (b) which `raft_role` values
count and whether a *missing* role fails open or closed, (c) whether
`replica_operations` rows add phantom members. READ[d] with the four
starred entries verified by me directly.

| View | Where | Membership rule | Shape | Decision |
| --- | --- | --- | --- | --- |
| Healthy census | `unified-rebalancer-budget-planning.js:360` (`getHealthyReplicas`), role conjunct `:380` | `status === ACTIVE`; for system partitions also `node_id` ∧ `address` ∧ `isVoterRaftRole` ∧ node available | rows, but **every** consumer takes `.length` (`unified-rebalancer-follow-up-move.js:226`, `move-planner-state-methods.js:196`) | deficit ADD |
| Ready-node occupied census | `unified-rebalancer-budget-planning.js:407` | ACTIVE ∧ (node ready ∨ process alive), **learners included** — the header `:387-406` says it exists because `getHealthyReplicas` "excludes by role, making the partition look perpetually under-replicated" | count | ADD suppression (`unified-rebalancer-follow-up-move.js:223`) |
| Count-only projection | `in-flight-aware-replica-count.js:41`, returns `.accounting` at `:68` | as V1/V2 | **identities discarded at the boundary** | legacy accounting callers |
| Ledger quorum census | `operation-ledger-quorum-concentration.js:64`, statuses `:28-30` | `{ACTIVE, REMOVING}` ∧ `VOTER_RAFT_ROLES`, deliberately including REMOVING ("still a raft voter until removal completes") | count + distinct-node set | ledger hold, surplus drain |
| Voter-ready topology | `priority-publication-safety-topology.js:123`, statuses `priority-publication-safety-shared.js:48` | `{ACTIVE, SYNCING}` ∧ `address` ∧ `isVoterRaftRole`; two *deliberately different* derivations at `:175` and `:185` | rows | remove-safety floor |
| Routing membership | `query-executor-partition-routing-snapshot.js:28` | readiness-filtered LOAD_ROUTABLE, with a **system-table leader fail-open** at `:101-115` | set + count | routing; provisioning probe |
| **★ Fail-open voter census** | `unified-rebalancer-control-plane-readiness-methods.js:304-336` (verified) | `status === ACTIVE ∧ !isCatchupLearnerRaftRole(raftRole)` — **a row with an empty/missing `raft_role` counts as a voter here**, the opposite of `isVoterRaftRole`'s fail-closed rule (`replica-voter-readiness.js:110-113`) | **count only** (`:335-336`) | publication trim-overflow lane |
| **★ The Raft cohort itself** | `src/node/replica-handler-runtime-metadata-methods.js:116` (`resolveReplicaContext`), voter test `:278-280` (verified), return `:388-398` (verified) | cohort = `replicaIds` identities (these *become* the Raft configuration); voters = `status === ACTIVE ∧ VOTER_RAFT_ROLES.has(service.raft_role)` — **no lowercasing**, unlike `isVoterRaftRole` | identities for the cohort; voters collapsed to `existingReplicaCount = isFreshBootstrapPartition ? 0 : hasViableLeader ? Math.max(1, establishedExistingReplicaIds.size) : 0` | **`isJoiningExistingGroup = existingReplicaCount > 0`**, `src/node/replica-handler-create-methods.js:443` (verified) — which is a direct input to the promotion guard's allowances (`learner-promotion-count-check.js:31`, `:58`) |
| Admin voter counts | `admin-control-snapshot-leadership-summary.js:429` | ACTIVE ∧ LOAD_ROUTABLE (excludes CANDIDATE) ∧ `address` | **count map only** | admin snapshot |
| Per-partition publication census | `membership-publication-priority-partition-summary.js:587`, exclusion reasons `:551-565` | ACTIVE ∧ non-empty `raft_role` ∧ `address` ∧ `node_id` ∧ node eligible | `readyReplicaCount` + `readyDistinctNodeCount`; **excluded replicas survive only as a reason histogram** (`:662-676`), including `'raft_role_missing'` | spread-gap blocking, and crosses into remove safety via `requiredDistinctNodeCount` |
| **★ Destructive-commit fence** | `priority-surplus-remove-placement-fence.js:133-159` (verified) | `replica.active && replica.voter` — **both axes at once**, stricter than any single-axis census — and built with `inFlightOperationObservation: {state: 'empty', operations: []}` (`:145-149`), i.e. a membership view that *deliberately excludes in-flight members* | counts | priority-surplus REMOVE fence |
| Three named post-removal floors | `operation-workflow-remove-safety-evaluator.js:38` (`QUORUM_PROJECTION_SCOPE`), projection `:57-94` | `{SIMPLE_FLOOR, COMPLETION_SAFE_FLOOR, PUBLISHED_SPREAD}`; the comment at `:36-37` says *"they are NOT three copies of one floor"* | count comparisons | remove deferral |

Note also that the "committed rows" input is itself not a pure `services` read:
`getCurrentReplicas()` (`unified-rebalancer-replica-state.js:272`, rows filtered
at `:311-321`) additionally applies `filterReplicasRetiredByTerminalOperations`
(`:658`) and `projectPriorityTerminalCreateTargets` (`:354`), which **synthesizes
members from terminal successful create operations** (READ[d]).

---

## 3. Is there anything today that IS "one explicit in-progress membership transition" per partition?

**Partly. The `replica_operations` row is the closest thing, and it is genuinely
per-transition — but it is not unique per partition, not reason-bearing, and not
role-bearing.**

What the row already identifies (READ, schema cited in 1.1):
`(partition_id, entity_type, entity_id, type, target_node_id, replica_id
[= destination replica], source_node_id, workflow_step, status, created_at,
completed_at, membership_publication_epoch)` plus, inside `steps_history[0]`,
`sourceReplicaId` and the cohort `replicaIds` / `peerAddresses`.

What is **missing relative to the candidate identity**, and where the missing
fact lives today:

| Missing | Status | Where it lives today |
| --- | --- | --- |
| **Semantic reason / transition class** | **ABSENT from the row.** `createOperationRecord` takes no reason: `rebalance-coordinator-operation-creation.js:716-724`, `src/rebalancer/replica-status.js:139-171` (READ) — the parameter list is `{operationId, type, partitionId, sourceNodeId, targetNodeId, replicaId, sourceReplicaId, membershipPublicationEpoch}` | `move.reason` on the transient move; carried onto the coordinator *request* as `moveReason` (`unified-rebalancer-move-execution.js:63`) and read only at admission time (`rebalance-coordinator-priority-budget-admission.js:282-283`, `rebalance-coordinator-topology-guard-methods.js:270-275`). It is discarded at persistence. The lone exception is `steps_history[0].cureTransitionAuthorization.intent === 'critical_spread_cure'`, and only for the one cure condition (§1.4). This is the production-side statement of the packet's `producer-identity-is-not-guard-visible` result. |
| **Semantic transition owner / producer** | **ABSENT.** No column, no metadata key. | Nowhere. Confirmed by the absence of any producer field in the schema (`system-table-runtime-schema-definitions.js:57-76`) and in `OPERATION_METADATA_KEY` (`replica-operation-progress.js:350-363`). |
| **Base membership generation of the PARTITION's membership** | **ABSENT.** `membership_publication_epoch` is the *cluster node* publication epoch (§1.9, §6), not a per-partition membership generation. | Nothing advances on a partition replica add/remove/promote — see §6. |
| **Source membership (the set)** | **ABSENT.** Only `source_node_id` and (in metadata) `sourceReplicaId`. | Reconstructed per-cycle by `buildReplicaInventorySnapshot` (`replica-inventory.js:205-580`); never stored. |
| **Target membership (the set)** | **ABSENT.** Only `target_node_id` + `replica_id`. | `targetState.targetNodes` in the planner, transient. `steps_history[0].replicaIds` is the *bootstrap cohort* stamp (`rebalance-coordinator-operation-creation.js:762-771`), not a target membership. |
| **Replica roles** | **ABSENT from the row.** | `services.raft_role`, a separate table with a separate writer and its own CDC lag (§1.7). |
| **Permitted next operation / step** | **DERIVABLE, not stored.** `getNextWorkflowStep` over the per-type step arrays (`replica-operation-progress.js:149-187`, `:405-409`) and the named coverage rows in `replica-operation-step-policy.js`. | The type + current step fully determine it; nothing records "what may happen next" as data. |

---

## 4. The chained-REPLACE falsifier, by reading

### 4.1 The concurrent-REPLACE cap (planner path A: `calculateMoves`)

`src/rebalancer/move-planner-move-calculation-methods.js` (READ):

- `:428-443` — `serializeCriticalReplace = this.isControlPlanePriorityPartition()`;
  `inFlightReplaceCount` counts REPLACE rows out of `getEntityInFlightOperations()`
  (V7, **drain-inclusive**).
- `:689-694` — the cap proper:
  `replaceCount = serializeCriticalReplace ? Math.min(naturalReplaceCount,
  Math.max(0, 1 - inFlightReplaceCount)) : naturalReplaceCount`.
- `:671-688` — the rationale block: the per-partition remove-safety lock already
  lets only one reconfiguration drain at a time; minting more REPLACEs "only
  builds a mutual-defer standoff (observed: 4 concurrent REPLACEs on one critical
  partition thrashing ~114s)".
- `:733-755` — when the cap bit, unpaired spread ADDs are deferred too, but only
  while `deficitEffectiveCount >= targetReplicaCount` (genuine deficit fill is
  never blocked by an in-flight REPLACE).

### 4.2 The priority-recovery follow-up builder (planner path B)

`src/rebalancer/unified-rebalancer-follow-up-move.js:606-686` (READ,
`buildPriorityRecoveryFollowUpMove`). Its full set of suppressors:

1. `:609-616` — not required by the decision snapshot.
2. `:642-647` — **the only over-replication suppressor**:
   ```js
   if (inventory.accounting.activeCount > targetReplicaCount) {
     return …OVER_REPLICATION_SUPPRESSED…;
   }
   ```
   with the comment at `:640-641`: *"ACTIVE count suppresses add-like work only
   after a terminal projection; an occupied SYNCING row may still need the
   replacement cure below."*
3. `:654-659` — no eligible target node.
4. `:683-685` — the cure condition routes to the ADD branch
   (`buildDeficitFollowUpMove`, `:215-245`) or the REPLACE branch
   (`buildRelocationFollowUpMove`, `:257-274`).
5. The ADD branch alone consults in-flight operations
   (`isPriorityRecoveryFollowUpDeficitSatisfiedByInFlightAdds`, `:408-417`, over
   `accounting.inFlightAddCount` — and the comment at `:400` says *"Only ADD
   increases replica count; REPLACE and REMOVE cannot fill a deficit"*).

**There is no `inFlightReplaceCount` check anywhere on this path.** (READ —
grep of the file returns no such identifier; the cap of §4.1 is in a different
module.)

Source and target selection:

- `selectPriorityRecoveryFollowUpSourceReplica`, `:541-568` — picks a *healthy*
  replica on a node hosting more than one, else any healthy replica not on the
  target node.
- `selectFollowUpTargetNodeId`, `:164-197` — excludes `healthyNodeIds`,
  `occupiedNodeIds`, `pendingTargetNodeIds`, `crossPartitionPendingTargetNodeIds`,
  and prefers a node that is not `previousFailedTargetNodeId`. **It therefore
  steers the second REPLACE to a node the first one is not targeting.**
- The inventory it uses is built from `getTopologyBlockingInFlightOperations()`
  for the same partition (`:284-291`) — V8, **drain-exclusive**.

### 4.3 Is there already an unresolved membership transition when the second REPLACE is produced?

**Yes.** READ:

- A REPLACE row is terminal only at `REMOVED` or `FAILED`
  (`replica-operation-progress.js:231-237`), and `completeOperation` sets
  `finalStep = REMOVED` for anything that is not an ADD
  (`operation-workflow-transition-persistence.js:319-323`).
- At the moment the previous target's `services.status` is `SYNCING`, the
  previous REPLACE's own `workflow_step` is `SYNCING` — mid-way through
  `REPLACE_WORKFLOW_STEPS` (`replica-operation-progress.js:179-187`) — hence
  non-terminal, and its `completed_at` is NULL.

So the second REPLACE is produced while a durable, non-terminal
`replica_operations` row for the same partition exists.

### 4.4 Which state would let the replacement owner distinguish previous-target-ACTIVE from previous-target-SYNCING authoritatively?

READ. Three candidates already exist, each already read somewhere else:

1. The previous operation row's own `workflow_step` (`SYNCING` vs `ACTIVE`) —
   authoritative, durable, first-terminal-wins guarded
   (`replica-operation-repository.js:203-207`). It is what
   `isReplaceRemoveDispatchPhase` reads
   (`replica-operation-progress.js:725-730`).
2. `services.status` of the previous target replica — what
   `inventory.accounting.activeCount` counts (`replica-inventory.js:109`).
3. `services.raft_role` of the previous target — what `activeVoterCount` counts
   (`replica-inventory.js:116-118`).

The follow-up builder consults **(2) only**. The planner's cap consults the
operation row set (V7). The promotion guard consults (3). None of these is
declared the authority over the other two; §2's "max of two censuses" is the only
place the disagreement is *handled*, and it is handled by taking a maximum rather
than by naming an owner.

### 4.5 Every per-partition serialization / cap / interlock today

Combined from my own reads and the delegated sweep (READ[d] entries spot-verified
on `replica-operation-repository.js:161-166` and
`priority-recovery-serial-wait-operation-contexts.js:117-137`).

| Mechanism | Scope | Count or identity | State read |
| --- | --- | --- | --- |
| REPLACE serialization cap, `move-planner-move-calculation-methods.js:689-694` | per-partition, priority control-plane only | count | `SystemTableCache`, entity-scoped, drain-inclusive |
| Over-creation cap, `move-planner-move-calculation-methods.js:444-496` | per-partition | count | inventory accounting |
| Serial goal-state planner, `effective-placement-serial-priority-planner.js:199-205`, `:299-328` | **per-partition** | count (`unresolvedTransitionCount`) | V7 |
| Concurrent-create budget gate, `rebalance-coordinator-concurrent-budget-gate.js:51-111` [d] | **global per node / per move class** — the lane key has no partition component (`operation-workflow-owner-execution-lane.js:208-213` [d]) | count | `SELECT … WHERE (source_node_id = ? OR target_node_id = ?)`, `replica-operation-repository.js:161-167` (READ, verified) |
| Critical add-like create lane, `rebalance-coordinator-priority-budget-admission.js:119-186` (READ) | **per-partition**, `systemTable` partitions only, and only when `move.enforceConcurrentOperationBudget === true` (`:121`) | identity (first conflicting op) | authoritative entity observation → cache fallback |
| `critical_add_like` intent key, `rebalance-coordinator-operation-intent-methods.js:86-102` (READ) | **per-entity** | identity | **in-memory `Map` with TTL** — the code itself calls these "suppression hints, not semantic owners" (`:352-354`) |
| Durable create dedupe, `replica-operation-repository-read-methods.js:515-572` (READ) | per `(partition_id, target_node_id, entity_type, entity_id)` | identity | durable SQL → cache fallback |
| `operationMatchesMoveIntent`, `rebalance-coordinator-operation-intent-methods.js:113-145` (READ) | same | identity | in-memory comparison |
| Priority remove lane, `rebalance-coordinator-priority-budget-admission.js:616-678` [d] | per-partition, priority CP only | identity | authoritative entity observation |
| `ensureNoConflictingInFlightReplaceForRemove`, `:505-569` [d] | per **replicaId** | identity | authoritative entity observation |
| Remove-safety concurrent-op lock, `operation-workflow-remove-safety-evaluator.js:465-500` (READ) | **per entity** (execution time) | identity | durable `getOperationsByEntity` |
| Topology guard, `rebalance-coordinator-topology-guard-methods.js:556-606` [d] | per-partition | identity + count | merged authoritative rows + entity ops |
| Ledger self-move hold, `operation-ledger-hold-policy.js:242-283` [d], `rebalance-coordinator-ledger-interlock-admission.js:173-319` [d] | **ledger partition vs the whole cluster** | identity + in-memory counters | incomplete-ops rows + owner RPC + in-memory hold state |
| Ledger quorum-spread hold, `rebalance-coordinator-ledger-interlock-admission.js:459-489` [d] | cluster-wide defer | placement count | cache + `OWNER_RPC_REQUIRED` |
| Ordinary serial lane / serial-wait, `priority-recovery-serial-wait-operation-contexts.js:117-137` (READ, verified) | **cross-partition — same-partition contexts are explicitly filtered OUT** (`:134-135`) | identity | operation-derived contexts |
| `target_claim_key` UNIQUE, `system-table-runtime-schema-definitions.js:81-85` (READ) | per **runtime-service replica identity**; never populated for partitions (`rebalance-coordinator-operation-creation.js:733-739`) | identity | durable unique index |

### 4.6 Does any protocol explicitly permit composition?

**Yes — in six named places.** READ / READ[d]:

1. `unified-rebalancer-topology-drain-methods.js:34-37` — a drain-phase REPLACE
   "must not suppress new add-like planning for other targets".
2. `rebalance-coordinator-priority-budget-helper.js:400-403` [d] — a
   remove-dispatch-phase REPLACE is not a concurrent-add-budget operation.
3. `replica-placement-cure-policy.js:596-613` (READ) — a REPLACE occupies the
   ordinary serial lane "only until its remove-dispatch phase".
4. `effective-placement-serial-priority-planner.js:207-232` (READ) — during a
   deficit, a `FAILED_REPLICA_REMOVE` or `TRUE_DEFICIT_ADD` is still emitted
   alongside an unresolved transition.
5. `rebalance-coordinator-priority-budget-admission.js:280-298` (READ) — one
   named spread-cure ADD is exempted from the over-target lane hold.
6. `operation-workflow-remove-safety-evaluator.js:479-496` (READ) — CL-043
   (stale past step timeout) and CL-044 (target uncontactable) both explicitly
   release the partition serialization lock; the CL-044 comment says the op
   "must not hold the partition serialization lock".

---

## 5. ADD versus REPLACE under one spread-recovery authority

**The packet's `spread-recovery-decision-has-two-owners` is confirmed by reading.**

- Owner 1 — the cure policy classifiers, all in
  `src/rebalancer/replica-placement-cure-policy.js` (READ):
  `classifyPriorityExpandForSpreadCureCondition` `:270-297` →
  `PRIORITY_EXPAND_FOR_SPREAD` → **ADD** / `spread_replicas` (`:158-164`);
  `classifyPriorityOverTargetSpreadCureCondition` `:357-381` →
  `PRIORITY_OVER_TARGET_SPREAD_CURE` → **ADD** / `spread_replicas` (`:172-178`);
  `classifyLedgerExpandForSpreadCureCondition` `:212-233` → **ADD**;
  the two drain rows `:241-262` and `:313-342` → **REMOVE** / `spread_replicas`.
  Only the `PRIORITY_OVER_TARGET_SPREAD_CURE` row mints an authorization
  (`authorizeSpreadCureTransition:415-437`, gated at `:420`).
- Owner 2 — the follow-up classifier, `classifyPriorityRecoveryFollowUpCureCondition`
  `:481-490` (READ): `healthyReplicaCount >= targetReplicaCount ∧
  hasSelectableSourceReplica` → `UNHEALTHY_SOURCE_AT_TARGET` → **REPLACE** /
  `replace_replica` (`:179-185`); otherwise `UNDER_REPRESENTATION` → **ADD** /
  `increase_replica_count` (`:109-115`).

So the same underlying intent ("restore distinct-node spread") is decided in two
modules with **different recorded reasons**: the ADD path records
`spread_replicas`, the REPLACE path records `replace_replica`. Neither reason
reaches the durable row (§3). Only the ADD path mints an authorization.

Could one structural reason value cover both while the operation type constrains
the step? **The vocabulary already supports it structurally** (READ): the cure
table is literally `condition → {moveType, moveReason}`
(`replica-placement-cure-policy.js:107-187`), i.e. one named condition already
maps to one type and one reason, and three distinct conditions already share the
single reason `spread_replicas` across both ADD and REMOVE rows (`:148`, `:155`,
`:162`, `:169`, `:176`). What is missing is not expressiveness but (a) the second
owner's use of a *different* reason for the same intent, and (b) the absence of
any reason column on the row. Both are facts, not proposals.

---

## 6. Identity disagreement (view A = {A,B,C}, view B = {A,B,D}); where counts are primary

**Which existing structures would expose the four participating identities?**
READ:

- `buildReplicaInventorySnapshot` exports `voterReplicaIds`, `learnerReplicaIds`,
  `voterTargetReplicaIds`, `settledVoterTargetReplicaIds`, `orphanReplicaIds`,
  `occupiedNodeIds`, `voterTargetNodeIds` — `replica-inventory.js:535-545`. This
  is the single richest identity surface and it *does* distinguish
  {A,B,C} from {A,B,D}: `settledVoterTargetReplicaIds` applies the REPLACE
  substitution explicitly (`:397-418`: delete `sourceReplicaId`, add
  `targetReplicaId`).
- `EffectivePlacement` exports `activeNodeIds`, `failedReplicaIds`,
  `unresolvedOperationIds`, `exclusiveProgressOperationIds` —
  `effective-placement-serial-priority-planner.js:262-289`.
- The promotion guard's `voterCensus.voterReplicas` (`{replicaId, nodeId}` pairs)
  and `learnerCensus.learnerReplicaIds` —
  `partition-service-learner-promotion-methods.js:647-660`, `:621-631`.
- The operation row pair `(replica_id, steps_history[0].sourceReplicaId)` — the
  only durable place both endpoints of a REPLACE appear
  (`system-table-runtime-schema-definitions.js:64`;
  `replica-status.js:144-148`).

**Which collapse to counts?** READ:

- The promotion guard: `voterCensus.voterReplicas` is computed and then only
  `voterCensus.count` reaches the decision
  (`partition-service-learner-promotion-count-check-methods.js:200-204`,
  `:230-233` — the identities are placed in the *log payload* fields
  `voterReplicas` / `learnerReplicaIds`). The arithmetic owner
  `learner-promotion-count-check.js:123-158` receives no identity at all.
- The follow-up over-replication suppressor: `accounting.activeCount` only
  (`unified-rebalancer-follow-up-move.js:642`).
- The over-creation cap: `Math.max(activeCount, activeVoterCount)`
  (`move-planner-move-calculation-methods.js:424-427`).
- The overflow budget: `temporaryOverflowVoterBudget`, a scalar
  (`learner-promotion-count-check.js:50-64`,
  `partition-service-learner-promotion-count-check-methods.js:229-231`).
- The authorization itself is count-shaped: `observedVoterCount`,
  `authorizedResultingVoterCount = observedVoterCount + 1`
  (`spread-cure-transition-authorization.js:156-163`, `:274-277`). It carries
  `destinationNodeId` and `destinationReplicaId` but **no source identity and no
  member set** — so it too cannot distinguish {A,B,C} from {A,B,D}; it can only
  say "one more voter than I observed, at this destination".

### 6.1 Generation / epoch domains (the owner-decision §6 question)

The delegated epoch sweep enumerated sixteen domains plus a ruled-out list.
Condensed to what bears on transition identity (READ[d]; the three starred rows
verified by me directly):

| Domain | Durable home | Advances on | Monotonic? | Canonical predicate |
| --- | --- | --- | --- | --- |
| **D1 publication epoch** | `control_plane_publications.publication_epoch`, `system-table-runtime-schema-definitions.js:22` | **the cluster active-node set changing**, or `source_topology_epoch` / `source_snapshot_version` changing — `membership-publication-candidate-derivation.js:526-536`, value `:556-559` | `baseline + 1` with **no CAS and no unique index** (the index `:40-43` is non-unique); monotonicity is enforced only read-side by max-selection (`control-plane-publication-merge.js:123-130`) | `readPublishedMembershipEpoch`, `published-membership-epoch-reading.js:23-25`; fence `membership-epoch-contract.js:212-275`; max-select `:300-321` |
| **D2 operation stamp** | `replica_operations.membership_publication_epoch` | nothing — an immutable **copy of D1** at plan time (`unified-rebalancer-rebalance-loop.js:239-240`, `:349-359`) | n/a (equality fence) | `replica-operation-membership-epoch-binding.js:46-48`, `:89-99`, `:121-127`; row decode `replica-operation-repository-row-methods.js:93-107` |
| D3 source topology epoch / snapshot version | `control_plane_publications.source_topology_epoch`, `source_snapshot_version`, `:24-25` | **nothing in the membership path** — they round-trip out of the publication row; the only real writer is the formation-release handoff (`formation-release-handoff-publication.js:289-291`) | none | `didOptionalSourceVersionChange`, `membership-publication-row-helpers.js:277-282` (a null next value counts as *unchanged*, i.e. fails open toward no-advance) |
| **★ D4 partition version** | `partitions.partition_version`, `system-table-core-schema-definitions.js:56-61` | **a completed split or merge of the key range only** — `managed-split-workflow.js:493`, `:507`; `managed-merge-workflow-persistence-methods.js:597-613`. Never a replica add/remove/promote | routing identity, validated by equality / next-equality | `buildPartitionDescriptorEpochDecision`, `partition-descriptor-epoch-contract.js:195-279` |
| **★ D5 assignment epoch** | `config` row `current_epoch`, `cdc-constants.js:35` | **nothing — vestigial.** `proposeEpoch` (`assignment-epoch-manager.js:222`) and `proposeEpochWithRetry` (`:295`) have **no call sites in `src/`** (verified by grep: only the definitions and their own doc comments) | in-memory strict-newer on apply, `:400-402` | `applyEpoch` strict-newer test |
| D6 boot incarnation | `nodes.boot_incarnation`, `system-table-core-schema-definitions.js:138-141` | one process boot on a data directory (`rejoin-hints.js:293-296`) | yes, per data directory; meaningless across nodes | `resolveNodeBootIncarnationFence`, `replica-dispatch-state-publication.js:45-71` |
| D8 Raft term / configuration | `_raft_state.currentTerm`, `sqlite-log-adapter.js:120` | a Raft election | Liferaft-internal | — |
| **★ D8b Raft configuration index** | — | — | — | **does not exist.** No `configurationIndex`, `configIndex`, `jointConsensus`, `addPeer`, `removePeer` or `addMember` anywhere in `src/raft/`; `joinPeer` (`liferaft-provider.js:255`) is the only membership verb, and it is write-only from the application's view (no read-back accessor) |
| D9 cache mutation version | **none — in-memory, per node** | every applied cache row change, **including a `services` insert/delete**, `system-table-cache-observation-methods.js:105-130` | `(current \|\| 0) + 1` | version equality across two reads, `:134-141` |
| D10 readiness-planning generations | **none — in-memory, per node** | a classified semantic change in `[nodes, node_endpoints, services, partitions, replica_operations, storage_reservations, control_plane_publications]`, `readiness-planning-semantic-generation.js:50-58`, `:427-448` | yes, with explicit saturation to `MAX_SAFE_INTEGER` at `:109-116` | `isPlanningIdentityCurrent`, `:88-92` |
| D11 snapshot version | none — derived per read | any timestamped write; it is `max(last_heartbeat, updated_at, created_at)`, `authoritative-control-plane-view.js:144-177` | only as far as the writers' clocks; **same-millisecond writes collide** | `resolveSnapshotRevisionCandidate`, `control-plane-snapshot-revision.js:90-139` |
| D13 authorization epoch | `replica_operations.steps_history` metadata | with D1 | — | `spread-cure-transition-authorization.js:401-407`; deliberately one-sided (a lagging partition view accepts, comment `:378-383`) |
| D14 promotion membership epoch | none — read from cached publications | with D1 | — | `learner-promotion-progress.js:136-147` (leader), `:211-219` (learner) |

**Answer to the key question (READ + READ[d], and independently supported by my
own reads of the `services` schema and the raft peer path).**

> *No generation, epoch or version in `src/` advances when a partition's replica
> membership changes.*

Three legs:

1. Per-partition replica membership is one `services` row per replica
   (`system-table-core-schema-definitions.js:221-249`) and **that table has no
   version, epoch, generation or revision column at all** (READ — I read the
   whole schema).
2. `partitions.partition_version` is the split/merge key-range layout epoch (D4),
   and `replica_count` / `leader_node_id` changes do not touch it.
3. The one durable epoch an operation carries (D2) derives from D1, whose advance
   predicate is the **cluster node set**. `priority_partition_summary` — the
   per-partition placement payload — rides the same row but is **not** in the
   `changed` predicate, so per-partition replica churn re-publishes at the *same*
   epoch.

The only things that move on a replica membership change are D9 and D10, both
in-memory, per-node, and used as memo-currency tokens rather than fences.

**Consequence for Model A (INFERRED from the above).** The owner's "fenced by a
committed-membership generation" has nothing to bind to today: neither a
committed Raft membership object (§1.8, D8b) nor a per-partition membership
generation exists. Whatever plays that role would have to be minted by a
production owner that does not currently mint one.

---

## 7. Can the EXISTING durable replica operation serve as the transition? (reframed)

### 7.1 Field-by-field against the conceptual set

| Conceptual field | Verdict | Evidence |
| --- | --- | --- |
| **Operation id** | **EXISTS** | column `operation_id`, PK, `system-table-runtime-schema-definitions.js:58`; written by `rebalance-coordinator-operation-creation.js:651` (`move.operationIntentId \|\| uuidv4()`) — deterministic for schema-provisioning intents, random otherwise |
| **Partition id** | **EXISTS** | `partition_id` `:60`, plus the canonical `(entity_type, entity_id)` pair `:61-62`, written by the creation path (`rebalance-coordinator-operation-creation.js:731-732`) |
| **Reason / transition class** | **ABSENT** | no column; `createOperationRecord` has no reason parameter (`replica-status.js:139-171`); `moveReason` lives only on the transient request (`unified-rebalancer-move-execution.js:63`) and is read only by admission (`rebalance-coordinator-priority-budget-admission.js:282-283`, `rebalance-coordinator-topology-guard-methods.js:270-275`). **Partial exception:** `steps_history[0].cureTransitionAuthorization.intent` = `'critical_spread_cure'` for one cure condition only (`spread-cure-transition-authorization.js:66`, `replica-placement-cure-policy.js:415-437`) |
| **Base membership generation** | **ABSENT for partition membership; EXISTS for cluster-node publication** (domain D2 of §6.1) | column `membership_publication_epoch` `:63`, written from `resolvePublishedMembershipPlanningEpoch()` (`unified-rebalancer-rebalance-loop.js:239-246`, `:349-359`), decoded at `replica-operation-repository-row-methods.js:93-107`. It is an immutable copy of D1, which advances only on a cluster node-list / source-version change (`membership-publication-candidate-derivation.js:526-536`), so it does not identify the partition membership the transition was authorized from. **No per-partition membership generation exists anywhere** (§6.1) |
| **Source / current membership or relevant delta** | **DELTA PARTIALLY EXISTS; SET ABSENT** | the delta endpoint is `source_node_id` `:66` (for REPLACE = the move's source node, `rebalance-coordinator-operation-creation.js:322-325`) and `steps_history[0].sourceReplicaId` (`replica-status.js:144-148`). The *set* is DERIVABLE per-cycle from `buildReplicaInventorySnapshot` (`replica-inventory.js:205-580`) but is never stored. `steps_history[0].replicaIds` (`rebalance-coordinator-operation-creation.js:762-771`) is the **bootstrap cohort**, not a membership |
| **Target / destination change** | **EXISTS** | `target_node_id` `:67` + `replica_id` `:64` (the destination replica; allocated at `rebalance-coordinator-operation-creation.js:676-700`). Note `replica_id` is overloaded: for REMOVE it is the replica being removed (`buildOperationIntentKey`, `rebalance-coordinator-operation-intent-methods.js:66-70`) |
| **Current execution phase** | **EXISTS** | `workflow_step` `:69`, written by the transition owner (`operation-workflow-transition-persistence.js:95`, `:343`, `:355`, `:405`); `semanticPhase` is DERIVABLE from `(type, workflowStep, status)` at `replica-operation-progress.js:285-343` and is recomputed on every decode (`replica-operation-repository-row-methods.js:115-119`) |
| **Status** | **EXISTS but is derived** | `status` `:68` is always written as `WORKFLOW_STEP_TO_STATUS[step]` (`operation-workflow-transition-orchestration.js:385`, `operation-workflow-transition-persistence.js:95`), mapping at `replica-operation-progress.js:67-75`. It is a redundant mirror of `workflow_step`, not an independent fact |
| **Replica roles** (owner's list, kept for completeness) | **ABSENT from the row** | roles live on `services.raft_role`, a different table with a different writer and its own CDC lag (`architecture/runtime-contracts.md:178`; `src/raft/published-raft-role.js:9-25`) |
| **Permitted next step** | **DERIVABLE** | `getNextWorkflowStep` over the per-type arrays, `replica-operation-progress.js:149-187`, `:405-409`; coverage rows in `replica-operation-step-policy.js` |
| **Unresolved-ness** | **EXISTS** | `completed_at IS NULL` is the durable predicate, used as the CAS guard on both the terminal write and the lease touch (`replica-operation-repository.js:203-213`) |
| **Owner / liveness** | **EXISTS** | `lease_expires_at` `:73` (`UPDATE_OPERATION_OWNER_LEASE`, `replica-operation-repository.js:209-213`); note it is **not in the INSERT list** (`:186-191`), so a fresh row has NULL until the first heartbeat |

**Summary of what is absent and would need a production owner to start
recording** (statement of fact, not a proposal): the semantic reason /
transition class; the semantic owner (producer); a base *partition-membership*
generation; the source and target membership sets; replica roles on the
operation. Everything else either exists as a column or is mechanically
derivable from `(type, workflow_step)`.

### 7.2 The operation's internal execution phases today

**ADD** — `ADD_WORKFLOW_STEPS = [PENDING, SENDING, CREATING, SYNCING, ACTIVE]`,
`replica-operation-progress.js:149-155` (READ). Terminal = `ACTIVE` or `FAILED`
(`:217-223`). `completeOperation` sets `finalStep = ACTIVE` for an ADD
(`operation-workflow-transition-persistence.js:319-323`).

**REPLACE** — `REPLACE_WORKFLOW_STEPS = [PENDING, SENDING, CREATING, SYNCING,
ACTIVE, STOPPING, REMOVED]`, `:179-187` (READ), with the doc comment at `:175`:
*"ACTIVE represents 'replacement promoted and voter-ready'"*. Terminal =
`REMOVED` or `FAILED` (`:231-237`).

Mapped onto the owner's conceptual phases (READ for each boundary):

| Conceptual phase | Durable step | The durable fact that marks the boundary |
| --- | --- | --- |
| decided / claimed | `PENDING` | the row's INSERT itself (`replica-operation-repository.js:186-191`); `status = pending` via `WORKFLOW_STEP_TO_STATUS` (`replica-status.js:156`) |
| dispatched | `SENDING` | step write by the dispatch lane; `DISPATCH_PENDING_WORKFLOW_STEPS = {PENDING, SENDING}` is the named pre-dispatch coverage row (`replica-operation-step-policy.js:96-101`) |
| add learner | `CREATING` | step write after the target accepts the create |
| catch up | `SYNCING` | step write; `TARGET_BUILD_WORKFLOW_STEPS = {PENDING, SENDING, CREATING, SYNCING}` and `TARGET_BUILD_STATUSES = {pending, creating, syncing}` (`replica-operation-progress.js:241-256`) define the semantic phase `accepted` |
| promote (voter-ready) | `ACTIVE` | `updateStep(operation, WORKFLOW_STEP.ACTIVE)` in `reconcileReplaceActualActive`, `src/rebalancer/priority-recovery-superseded-target.js:604-608` (READ), driven by the executor outcome at `src/rebalancer/operation-workflow-executor-outcome-reconcile-methods.js:546-563`. For REPLACE this yields semantic phase `target_ready` (`replica-operation-progress.js:330-334`) |
| remove old | `STOPPING` | semantic phase `source_retiring` (`:325-329`); `REPLACE_REMOVE_DISPATCH_WORKFLOW_STEPS = {ACTIVE, STOPPING}` (`:281-283`) is the set that makes the row invisible to the topology-blocking view |
| done | `REMOVED` + `completed_at` | `completeOperation`, `operation-workflow-transition-persistence.js:316-420`; `UPDATE_OPERATION_TERMINAL … WHERE operation_id = ? AND completed_at IS NULL` (`replica-operation-repository.js:203-207`), first-terminal-wins |

**REMOVE** — `[PENDING, SENDING, STOPPING, REMOVED]`, `:163-168`.

**Recovery after restart.** READ:

- The durable recovery query is node-scoped:
  `SELECT_INCOMPLETE_OPERATIONS … WHERE (source_node_id = ? OR target_node_id = ?)
  AND type IN (…) AND (workflow_step IN (?,?,?,?,?) OR (workflow_step = ? AND
  type IN (?,?)))`, `replica-operation-repository.js:161-167`. So a restarting
  node re-drives exactly the rows it is the source or target of.
- `lease_expires_at` is the durable owner heartbeat
  (`replica-operation-repository.js:209-213`; decoded at
  `replica-operation-repository-row-methods.js:108-114`), and
  `resolveOperationOwnerNodeId` (`:173-207`) is the *structural* owner for
  unfenced rows — for an unsettled system/priority REPLACE it pins ownership on
  the **target** so "the replacement host can survive transient source loss"
  (`:196-199`).
- The step itself is the resume point: `reconcileReplaceActualActive`
  (`priority-recovery-superseded-target.js:584-632`) first adopts the most
  advanced observed state (`adoptMostAdvancedObservedReplaceState`, `:571-573`)
  so a stale `SYNCING` row cannot overwrite a newer `STOPPING`/`REMOVED`, then
  resumes at `STOPPING` (`:590-593`) or re-drives the source removal from
  `ACTIVE` (`:594-600`).
- Two re-materialization paths exist when the row itself is missing:
  `operation-workflow-gate-operation-row-repair.js:29-49` (idempotent re-insert
  after a gate-repaired reservation) and
  `replica-operation-repository-mutation-update-methods.js:361-383` (CL-017(b)
  divergence re-insert when the UPDATE committed but the authoritative row is
  gone).

---

## 8. Unknowns, and what would settle them

1. ~~Does anything advance `partitions.partition_version` on a membership
   change?~~ **RESOLVED** by the epoch sweep: no — its only writers are the split
   and merge workflows (`managed-split-workflow.js:493`, `:507`;
   `managed-merge-workflow-persistence-methods.js:597-613`).
2. ~~Exhaustive census inventory.~~ **Substantially resolved** by the census
   sweep (§2.1): at least nine further predicates, differing on three named axes.
   Residual: the message-group analogue was not swept. A cheap confirmation for
   the partition side is `npm run audit:voter-readiness-owner`
   (`scripts/check-voter-readiness-single-owner.js`, named at
   `src/raft/replica-voter-readiness.js:12-14`), which already counts
   re-derivations of "is this replica a ready voter" outside the owner module.
3. **Which per-partition gate the second REPLACE actually passed in the verified
   drive.** Reading establishes that the *planner* permits it (§4.2) and that the
   coordinator's critical add-like lane would normally refuse a second non-terminal
   add-like op on a `systemTable` partition (`rebalance-coordinator-priority-budget-admission.js:119-186`).
   Whether the verified chain passed because the prior REPLACE had already reached
   `ACTIVE`/`STOPPING` (making it invisible to
   `isConcurrentAddBudgetOperation`, `rebalance-coordinator-priority-budget-helper.js:400-403` [d])
   while the target's `services.status` still read `SYNCING`, or because the
   observation was deferred (`:145-166`), **cannot be decided by reading** — the two
   are distinguishable only by the row states at the moment of creation.
   *Settle by:* the existing witness
   `test/rebalancer/overflow-budget-unhealthy-source-replace.test.js` (named as the
   witness in `packet.json` proposition `chained-replace-is-a-membership-view-disagreement`),
   read-only, with the prior operation's `workflow_step` and the prior target's
   `services.status` captured at the instant `createOperation` is entered. A small
   new read-only test would assert exactly that pair.
4. **Whether `services.raft_role` can lag far enough for V2 and V3 to name
   different replica sets (not just different counts).** The code asserts a lag
   exists (`move-planner-move-calculation-methods.js:414-419`) but the magnitude
   is unmeasured here. *Settle by:* a read-only fixture that drives a promotion
   and samples both censuses each tick.
5. **Message-group and runtime-service parity.** Every path above is shared code
   keyed on `entity_type`, but I read only the partition specializations.
   *Settle by:* reading `src/message-group/` and the runtime-service branches of
   the same modules.
6. **Is `AssignmentEpochManager` (D5) genuinely dead, or reachable through a
   dynamic dispatch the grep missed?** The grep for `proposeEpoch` returns only
   its own definition and doc comments (verified), but this repository uses
   methods-bag composition heavily (`Object.assign(Class.prototype, …)`), so a
   name-based grep is not a proof of unreachability. *Settle by:* the
   repository's own import-graph / unused-exports ratchet, which already models
   reachability, rather than another grep.
7. **Does the `raft_role` case-sensitivity difference matter in production?**
   `resolveReplicaContext` (`replica-handler-runtime-metadata-methods.js:278-280`)
   and `isActiveVoterServiceRowForPromotion`
   (`partition-service-learner-promotion-methods.js:316-321`) test
   `VOTER_RAFT_ROLES.has(rawRole)` **without lowercasing**, while
   `isVoterRaftRole` normalizes (`replica-voter-readiness.js:110-113`). If every
   writer emits lowercase the domains coincide; the only writer I read is
   `normalizePublishedRaftRole` (`published-raft-role.js:9-25`), which emits the
   lowercase `RAFT_ROLE` constants. *Settle by:* reading every `services.raft_role`
   write site, or a read-only assertion that the column is always lowercase.

---

## 9. The one-operation invariant: "at most one unresolved membership-changing ReplicaOperation per partition"

### 9.1 Is the invariant stated anywhere in production?

**No single site states it.** The closest are, in order of strength (READ):

1. `effective-placement-serial-priority-planner.js:199-205` —
   `shouldProgressExistingTransition`:
   ```js
   if (placement.exclusiveProgressRequired === true) return true;
   return placement.unresolvedTransitionCount > 0 && placement.deficitCount === 0;
   ```
   with `selectSerialPriorityMove` emitting at most one move (`:299-328`,
   `newMoveCount: 1`). `unresolvedTransitionCount` is `operations.length` from
   `options.unresolvedOperations` (`:164-168`, `:281`), which
   `move-planner-move-calculation-methods.js:130` supplies as
   `getEntityInFlightOperations()` (V7, drain-inclusive).
   **Scope:** only `usesSerialGoalStatePlanner()` partitions —
   `move-planner-state-methods.js:306-309` = control-plane priority **or**
   formation-liveness-dependency partitions. And it is a *planner* rule inside
   `calculateMoves` only; it is not an admission refusal.
2. `rebalance-coordinator-priority-budget-admission.js:119-186` —
   `ensureCriticalPartitionCreateLaneAvailable`, doc line `:112`: *"Critical
   system partitions admit only one add-like workflow at a time. This prevents
   multiple replacement learners from racing ahead of the source-removal phase
   and creating temporary 5-voter critical groups."* Gated on
   `move.enforceConcurrentOperationBudget === true` (`:121`), ADD/REPLACE only
   (`:124-129`), `classifySystemPartition().systemTable` only (`:130-133`).
3. `operation-workflow-remove-safety-evaluator.js:465-500` — the execution-time
   per-entity lock; refuses with *"concurrent {entityType} operation {id} is
   active"* (`:502-505`).

### 9.2 Everywhere a second one is prevented

See the table at §4.5. The genuinely **per-partition** preventers are:
the serial goal-state planner (§9.1.1), the critical add-like create lane
(§9.1.2), the `critical_add_like` in-memory intent key
(`rebalance-coordinator-operation-intent-methods.js:86-102`, which also makes the
create single-flight key per-partition at
`rebalance-coordinator-operation-creation.js:189-192`), the priority remove lane
[d], the topology guard [d], the over-target lane hold
(`rebalance-coordinator-priority-budget-admission.js:212-316`), the REPLACE
serialization cap, and the remove-safety concurrent-op lock.

### 9.3 Everywhere a second one is allowed

Six explicit permissions listed at §4.6, plus these structural gaps (READ):

- **Bootstrap provisioning creates N concurrent ADDs for one partition by
  design.** `src/query/sql-query-engine-initial-partition-provisioning.js:421-457`
  loops over `admittedTargetNodeIds` calling `createOperation({type: ADD, …})`.
  The request object sets `type, partitionId, entityType, entityId, nodeId,
  skipProvisioningAdmissionRecheck, controlPlaneMutationWorkClass,
  deferDispatchUntilBootstrapTopology, emitOperationCreated, operationIntentId,
  replicaIntentId, parentWorkflowFenceToken` — and **not**
  `enforceConcurrentOperationBudget`. Since every per-partition lane above is
  gated on that flag (`:121` and `rebalance-coordinator-topology-guard-methods.js:475`
  [d]), initial provisioning bypasses them all.
- **Non-priority partitions have no REPLACE cap at all**:
  `serializeCriticalReplace = this.isControlPlanePriorityPartition()`
  (`move-planner-move-calculation-methods.js:428`); otherwise `replaceCount =
  naturalReplaceCount` (`:693`).
- **The follow-up builder bypasses the serial selector.** `finalizeMoves`
  (`move-planner-move-calculation-methods.js:133-142`) is applied inside
  `calculateMoves`; the follow-up move is appended **afterwards** by
  `augmentMovesWithPriorityRecoveryFollowUp`
  (`src/rebalancer/unified-rebalancer-rebalance-loop.js:249-252`, READ;
  implementation `src/rebalancer/unified-rebalancer-follow-up-augmentation-methods.js:262-310`).
  The augmentation can even prepend follow-up moves for **other** partitions
  (`prependPriorityRecoverySurrogateFollowUpMoves`, `:311-343`).
- **The concurrent-create budget is not per-partition at all** (§4.5) [d].

### 9.4 The verified chained-REPLACE case: why can a second one begin while the prior effects are visible as SYNCING?

**The suppression check.** `src/rebalancer/unified-rebalancer-follow-up-move.js:640-647`
(READ, verbatim):
```js
// ACTIVE count suppresses add-like work only after a terminal projection;
// an occupied SYNCING row may still need the replacement cure below.
if (inventory.accounting.activeCount > targetReplicaCount) {
  return this.buildPriorityRecoveryFollowUpMoveOutcome(
    PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.OVER_REPLICATION_SUPPRESSED,
    PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.OVER_REPLICATION_SUPPRESSED,
  );
}
```
`activeCount` is `activeReplicaIds.size` (`replica-inventory.js:512-514`), built
from `active: hasNode && status === ACTIVE` (`:109`). **An in-flight operation
contributes nothing to it.** So:

- prior target `SYNCING` → `activeCount` unchanged → predicate false → the
  builder proceeds and mints the second REPLACE;
- prior target `ACTIVE` → `activeCount` is target+1 → predicate true →
  `OVER_REPLICATION_SUPPRESSED`.

That is exactly the verified "ACTIVE suppresses / SYNCING permits" behaviour,
reproduced by reading.

**The terminal-transition site.** `completeOperation`,
`src/rebalancer/operation-workflow-transition-persistence.js:316-323`:
```js
const finalStep = operation.type === OperationType.ADD ?
  WORKFLOW_STEP.ACTIVE : WORKFLOW_STEP.REMOVED;
```
Persisted through `UPDATE_OPERATION_TERMINAL … AND completed_at IS NULL`
(`src/rebalancer/replica-operation-repository.js:203-207`). Called for a REPLACE
only after the source-removal path completes
(`operation-workflow-executor-outcome-reconcile-methods.js:546-565`:
a REPLACE at `ACTIVE` routes to `reconcileReplaceActualActive` instead of
`completeOperation`; `operation-workflow-recovery-observation.js:693`, `:759`
are the recovery-side calls).

**Timing of terminal vs the target becoming ACTIVE.** READ: the target's
promotion moves the row *to* `ACTIVE`
(`priority-recovery-superseded-target.js:604-608`), and the row only reaches
`REMOVED`/`completed_at` after the source removal
(`operation-workflow-transition-persistence.js:316-420`). **The row is therefore
strictly NOT terminal while the target is SYNCING, and still not terminal when
the target first becomes ACTIVE.**

**Which explanation the code shows.**

- **(a) legitimate composition inside one operation — NO.** The second REPLACE is
  a separate `replica_operations` row with its own `operation_id`
  (`rebalance-coordinator-operation-creation.js:651`) and its own replica
  allocation (`:684-700`). Nothing links it to the first.
- **(b) premature terminal / completion on the first operation — NO.**
  §9.4 above: `completed_at` is set only at `REMOVED`. **But a weaker cousin of
  (b) is true and is the mechanism at the coordinator level: premature
  *invisibility*, not premature terminality.** From `ACTIVE` onward the first
  REPLACE is filtered out of the topology-blocking view
  (`unified-rebalancer-topology-drain-methods.js:52-54`), out of the
  concurrent-add budget (`rebalance-coordinator-priority-budget-helper.js:400-403`
  [d]) and out of the ordinary serial lane
  (`replica-placement-cure-policy.js:607-613`) — all while it is still unresolved.
- **(c) stale membership observation — NO, and this is the important negative.**
  The operation row is not stale and not hidden at `SYNCING`: it is present in
  `inventory.operations` (`replica-inventory.js:530`), and
  `buildPriorityRecoveryFollowUpInventory` puts it there
  (`unified-rebalancer-follow-up-move.js:284-313`). The follow-up builder simply
  **never consults it for suppression**. Its only in-flight consultations are the
  target-node exclusion (`:522-526`, which steers the second REPLACE to a
  *different* node and so also defeats the durable dedupe key
  `(partition_id, target_node_id, …)`, `replica-operation-repository.js:180-182`)
  and the ADD-only deficit check (`:408-417`).
- **(d) recovery / re-materialization artifact — NO** for this case. The two
  re-insert paths (`operation-workflow-gate-operation-row-repair.js:29-49`;
  `replica-operation-repository-mutation-update-methods.js:361-383`) re-insert
  **the same** `operation_id`, so they cannot produce a second distinct
  transition.
- **(e) another real requirement — YES, and it is the actual answer.** The
  membership-changing decision has two owners and only one of them holds the
  REPLACE serialization rule. The cap lives in `calculateMoves`
  (`move-planner-move-calculation-methods.js:428-443`, `:689-694`); the
  priority-recovery follow-up builder is a second decision owner
  (`unified-rebalancer-follow-up-move.js:606-686`) that runs *after*
  `calculateMoves` (`unified-rebalancer-rebalance-loop.js:249-252`), bypasses the
  serial selector, and has no unresolved-operation predicate of its own. Its only
  over-replication guard is a **committed-status count that an unresolved
  operation does not contribute to**.

**Stated as a disagreement rather than averaged:** `calculateMoves` says "one
unresolved REPLACE per critical partition"; `buildPriorityRecoveryFollowUpMove`
says "one *committed ACTIVE surplus* per partition". These are different
invariants over different state, in different modules, on the same partition.

---

## 10. Decision owners

### 10.1 Modules that can CREATE a membership-changing replica operation

Sites that persist a `replica_operations` row or call the creation entry point
(READ, from an exhaustive grep for `createOperation(`, `persistNewOperation`,
`INSERT INTO replica_operations`, `createOperationRecord(`, `insertReplicaOperation`):

| Module:line | What it is |
| --- | --- |
| `src/rebalancer/rebalance-coordinator-operation-creation.js:146` (`createOperation`), `:306` (`createOperationInternal`), `:632` (`createOperationRecordInternal`), `:817` (`persistNewOperation`) | **the coordinator entry point** — the single place that builds the record and runs the creation-time gates (`:373-416`) |
| `src/rebalancer/unified-rebalancer-move-execution.js:309` | the rebalancer's only call — every planner and follow-up move funnels through here; request built at `:53-64`, decorated at `:82-110` |
| `src/query/sql-query-engine-initial-partition-provisioning.js:430` | **initial partition provisioning** (CREATE TABLE); N ADDs per partition, no `enforceConcurrentOperationBudget` (§9.3) |
| `src/rebalancer/operation-workflow-gate-operation-row-repair.js:34` | re-materialization after a gate-repaired reservation |
| `src/rebalancer/replica-operation-repository-mutation-update-methods.js:373` | CL-017(b) divergence re-insert |
| `src/control-plane/owners/replica-operations-owner.js:26` (`insertReplicaOperation`), `:30` (`upsertReplicaOperation`) | the generic system-metadata ingress for this table |
| `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:113`, `:140` | the persistence primitive both of the above reach |

### 10.2 Modules that DECIDE a membership-changing operation should exist

These mint or select a move. This is the set a single replica-placement owner
would have to absorb (READ):

| Module:line | Decision |
| --- | --- |
| `src/rebalancer/move-planner-move-calculation-methods.js:110` (`calculateMoves`) | the main planner: failed-replica REMOVE `:244-252`, deficit ADD `:349-357`, surplus/cleanup REMOVE `:604-619`, paired relocation REPLACE `:715-726`; the REPLACE cap `:689-694`; the over-creation cap `:444-496` |
| `src/rebalancer/move-planner-priority-spread-cure.js:128` (`applyOverTargetCapAddRetention`), `:257` (`applyPrioritySpreadDrainCure`), `:312` (`applyPrioritySpreadExpandCure`) | retains / re-types / adds spread-cure moves and can override `replaceCount` |
| `src/rebalancer/effective-placement-serial-priority-planner.js:299` (`selectSerialPriorityMove`) | selects **at most one** of the above; also the only "progress the existing transition instead" decision (`:199-205`) |
| `src/rebalancer/unified-rebalancer-follow-up-move.js:606` (`buildPriorityRecoveryFollowUpMove`) | the **second** spread-recovery decision owner; mints the follow-up ADD (`:215-245`) or REPLACE (`:257-274`) |
| `src/rebalancer/unified-rebalancer-follow-up-augmentation-methods.js:262`, `:267`, `:332` | decides whether to prepend/normalize follow-up moves, including **surrogate follow-ups for other partitions** (`:311-343`) |
| `src/rebalancer/replica-placement-cure-policy.js:107-187`, `:196-198` | the cure-typing owner: which move type and reason a named condition takes. It does not mint moves itself but every mint site resolves its row |
| `src/rebalancer/replica-placement-cure-policy.js:415-437` (`authorizeSpreadCureTransition`) | decides that a temporary +1 voter is authorized (one condition only) |
| `src/query/sql-query-engine-initial-partition-provisioning.js:421-457` | decides the initial replica cohort for a new partition |
| `src/rebalancer/unified-rebalancer-rebalance-loop.js:221-252`, `:270-300` | decides the target state, the planning epoch and the per-cycle move budget |
| `src/rebalancer/operation-ledger-hold-policy.js` / `operation-ledger-quorum-concentration.js` [d] | hold the ledger partition's own cure relation and hold-engagement rows |

### 10.3 Modules that only DETECT a condition

(READ; these classify or observe but mint no move and create no operation.)

| Module:line | Detects |
| --- | --- |
| `src/rebalancer/replica-placement-cure-policy.js:212-233`, `:270-297`, `:313-342`, `:357-381`, `:447-467`, `:481-490` | the named placement conditions (ledger expand/drain, priority expand/drain, over-target spread, spread-satisfied-at-target, follow-up cure condition) |
| `src/rebalancer/replica-inventory.js:205-580` | the joined committed+in-flight observation, anomalies and provenance |
| `src/rebalancer/effective-placement-serial-priority-planner.js:242-289` (`buildEffectivePlacement`) | spread gap, deficit, surplus, unresolved-transition count |
| `src/control-plane/priority-recovery-partition-assessment.js:120-159` [d] | the serial-operation-wait blocker |
| `src/control-plane/membership-publication-priority-partition-summary.js` (imported `membership-publication-candidate-derivation.js:43-50`) | the priority partition spread summary published on the publication row |
| `src/control-plane/membership-epoch-contract.js:159-275` | the membership-epoch snapshot and fence state |
| `src/partition/learner-promotion-count-check.js:123-158` | whether a promotion would exceed the cap — a **refusal**, not a creation |
| `src/rebalancer/operation-workflow-remove-safety-evaluator.js:455-506` | whether a REMOVE / REPLACE-drain may proceed — a deferral, not a creation |
| `src/rebalancer/cluster-readiness-signal.js`, `src/bootstrap/critical-placement-formation-observer.js` | formation readiness observation |
| `src/rebalancer/storage-admission-service.js` / `provisioning-admission-policy.js` | storage/capacity admission for a proposed move |
| `src/rebalancer/user-table-leader-placement-cure.js` | leader-placement spread — actuates **leadership handoff only**, never a replica operation (header `:1-38`) |

### 10.4 Is SYNCING / lifecycle status used as a second MEMBERSHIP authority alongside committed Raft membership?

**Yes — and more strongly than "alongside": `services.status` is the *primary*
input to the Raft peer set itself, so there is no independent committed Raft
membership for it to compete with.** READ:

1. **The Raft peer set is built from `services` rows filtered by status.**
   `shouldSkipPeerServiceRow`, `src/partition/partition-service-raft-peer-cache-reconciliation.js:77-87`:
   ```js
   const status = serviceRow.status || ReplicaStatus.ACTIVE;
   return status === ReplicaStatus.FAILED || status === ReplicaStatus.REMOVING ||
     status === ReplicaStatus.REMOVED;
   ```
   Everything not in that set — including `SYNCING` — becomes a peer via
   `raftProvider.joinPeer` (`:297-302`); stale addresses are dropped with
   `raft.leave` (`:291-296`). The rows come from the **SystemTableCache**
   (`:239-247`), not from an authoritative read.
2. **The over-replication suppressor** reads `status === ACTIVE` only:
   `unified-rebalancer-follow-up-move.js:642` over `replica-inventory.js:109`.
3. **The over-creation cap** reconciles the status census and the raft-role
   census by maximum: `move-planner-move-calculation-methods.js:424-427`, with
   the disagreement documented at `:412-423`.
4. **Placement / spread counting** uses `status === ACTIVE`:
   `activePlacementReplicas`, `move-planner-move-calculation-methods.js:161-165`,
   feeding `countDistinctActiveReplicaNodes` (`:65-71`) and every
   distinct-node-floor conjunct in `replica-placement-cure-policy.js`.
5. **The promotion guard's raft-role censuses are status-gated first**:
   `isActiveVoterServiceRowForPromotion` and `isLearnerServiceRowForPromotion`
   both require `isLiveReplicaServiceRowForPromotion` (status ∉
   {FAILED, REMOVING, REMOVED}) *before* testing the role —
   `partition-service-learner-promotion-methods.js:278-284`, `:310-321`.
6. **Occupancy accounting** is status-defined: `OCCUPIED_STATUSES = {pending,
   creating, syncing, active}` and `occupied = hasNode && status !== REMOVED`,
   `replica-inventory.js:15-20`, `:113-115`.
7. **The operation row's own `status` column** is a derived mirror of
   `workflow_step` (`operation-workflow-transition-orchestration.js:385`), yet it
   is what the add-like in-flight census filters on:
   `readInFlightAddLikeOperationRowsForPromotion`,
   `partition-service-learner-promotion-methods.js:560-585`, tests
   `!TERMINAL_STATUSES.includes(status)` rather than the typed terminal-step
   table — a third spelling of "terminal" beside
   `OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE`
   (`replica-operation-progress.js:215-239`) and `isTerminalReplicaOperationRecord`.
8. **`status` decides who is even *offered* to Raft as a cohort member.**
   `resolveReplicaContext` builds `replicaIds` / `peerAddresses` — the set that
   `RaftGroup.joinPeers` then installs (`src/raft/raft-group.js:389`,
   `src/raft/liferaft-provider.js:255-259`) — and its established-voter test is
   `service.status === ReplicaStatus.ACTIVE && VOTER_RAFT_ROLES.has(service.raft_role)`
   (`src/node/replica-handler-runtime-metadata-methods.js:278-280`, verified).
   That count then becomes `isJoiningExistingGroup`
   (`src/node/replica-handler-create-methods.js:443`, verified), which the
   promotion guard consumes as an allowance input
   (`learner-promotion-count-check.js:31`, `:58`).
9. **`status === {ACTIVE, REMOVING}` is treated as raft-voter membership** by the
   ledger concentration census, with the explicit rationale *"a REMOVING source
   is still a raft voter until removal completes"*
   (`operation-ledger-quorum-concentration.js:28-30`) [d] — a fourth status→
   membership mapping, disagreeing with all of 1-3 above.

**Counter-evidence considered, restated.** `src/raft/replica-voter-readiness.js`
is a genuine single owner *of the role vocabulary*, and its header (`:6-25`)
records that the differing memberships are deliberate. What does not exist is an
owner of *membership itself*: no module reads a Raft-committed configuration for
a membership decision, and no such configuration is exported (§6.1 D8b).

**Contract-level counter-evidence considered.**
`architecture/runtime-contracts.md:174-192` names `services` the canonical owner
of replica status and `raft_role`, and forbids deriving leader identity from
`raft_role`. It does **not** name any structure as committed Raft membership.
`src/raft/replica-voter-readiness.js` owns the role-set vocabulary but reads the
same projected column. I found no module that reads a Raft-committed
configuration for a membership decision.

---

## Appendix: the packet propositions this reading touches

- `chained-replace-is-a-membership-view-disagreement` — **reproduced by reading**:
  §9.4, suppression check at `unified-rebalancer-follow-up-move.js:642-647`,
  terminal site at `operation-workflow-transition-persistence.js:316-323`.
- `spread-recovery-semantic-has-split-ownership` — **confirmed**: §5 and §10.2.
- `producer-identity-is-not-guard-visible` — **confirmed structurally**: §3 and
  §7.1 (no reason column, no producer field; `moveReason` dies at persistence).
- `no-second-replace-authority-kind-and-no-ledger-authority` — consistent with
  §1.4 (one intent value, one condition, one mint site).
- `epoch-version-inventory-is-incomplete` — §6.1 completes the inventory for
  `src/` and adds the decisive negative: **no generation advances on a partition
  replica membership change**, and there is no Raft configuration index at all.

## Appendix B: provenance of the citations

Three read-only delegated sweeps over the same tree and head contributed the
entries marked `[d]`. I verified a sample of each before folding them in:

- *per-partition serialization gates* — verified
  `replica-operation-repository.js:161-167` (node-scoped incomplete query) and
  `priority-recovery-serial-wait-operation-contexts.js:117-137` (same-partition
  exclusion).
- *membership census views* — verified
  `unified-rebalancer-control-plane-readiness-methods.js:304-336` (fail-open
  voter census), `replica-handler-runtime-metadata-methods.js:278-280` and
  `:388-398` (cohort → `existingReplicaCount`),
  `replica-handler-create-methods.js:443` (`isJoiningExistingGroup`), and
  `priority-surplus-remove-placement-fence.js:133-170` (empty in-flight
  observation).
- *epoch / generation domains* — verified the `services` schema has no version
  column (`system-table-core-schema-definitions.js:221-249`), that `proposeEpoch`
  has no call sites, and the D1 advance predicate
  (`membership-publication-candidate-derivation.js:526-536`, `:556-559`).

Everything not marked `[d]` I read directly. Nothing in this document was
written from memory or inferred from a test name.
