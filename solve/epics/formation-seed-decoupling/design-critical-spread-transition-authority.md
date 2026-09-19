# Design note: `critical-spread-transition-authority` (2026-09-19)

**Status.** This is the architect's design, produced read-only from main at
e163c1488 and reviewed by the lead.

**Inputs.** The owner's ownership decision of 2026-09-18 and the owner
decisions of 2026-09-19 are its binding inputs.

**The lead's rulings on it.**
- **Two quests, because a quest lands as one commit.**
  - `critical-spread-transition-authority-carry` is the design's C1. It
    mints, carries, decodes and logs the authorization. It is
    decision-neutral, and lab formations then measure how many refusals and
    grants would have carried a valid authorization.
  - `critical-spread-transition-authority` is the design's C2. It enforces
    the authorized bound and deletes the summary and budget read from the
    promotion path, together with the obsolete budget and completion state.
  - C1 never lands as the end state.
- **No schema change.** The authorization rides on the operation's existing
  `steps_history[0]` metadata.
- **Refusal reason.** The reason string `would_exceed_target_replica_count`
  does not change.
- **The inventory gates C2.**
  - Section 6 of the design inventories every production path that can
    bring an add-like operation on a bootstrap-critical partition to
    promotion while over target.
  - That inventory is a precondition of C2, not of C1.
- **The design's section 9 item 4 is closed by the sixth addendum.**
  - The guard read "satisfied" because the spread completion double counts
    a holder node.
  - That projection defect is a separate owner and a separate decision.
- **The characterization is folded into the repairs.**
  - The separate characterization quest becomes red tests inside these two
    quests (the design's section 5, rows a and b, on the recorded fixture).
  - It also becomes red tests inside whatever quest repairs the projection.

**Paths.** File paths below are absolute paths of the main checkout at the
time of writing.

---

# Design — quest `critical-spread-transition-authority`

**One-sentence design.** The cure-policy owner mints a per-operation authorization record for exactly the `PRIORITY_OVER_TARGET_SPREAD_CURE` condition; it rides on the existing `replica_operations.steps_history[0]` structured-metadata field (the same carrier that already holds `sourceReplicaId`, `bootstrapTableMetadata`, `readinessSnapshot`), is decoded fail-closed by a new binding owner modelled exactly on `src/rebalancer/replica-operation-membership-epoch-binding.js`, and becomes the learner-side count check's cap — after which the priority-summary / overflow-budget read is deleted outright from the promotion path.

Everything below is grounded in code I read. Inferences and undetermined items are labelled.

---

## 0. The three load-bearing facts I established from code

1. **The operation row is visible to the refusing learner at refusal time.** The recorded fixture `/mnt/data/peter/projects/lagrange/.claude/worktrees/ring-contract/test/partition/fixtures/critical-spread-learner-ring/recorded-guard-inputs.json` shows, in the *refusal* record: `inFlightAddLike.replicaIds: ["sql_transactions-p1-r5"]`, `ownedByThisLearner: true`, and `operations.counted[0] = {operationId: "1eeaf3e4-…", type: "ADD", status: "pending", workflowStep: "SENDING"}`. The carrier is therefore readable at exactly the moment the decision is wrong. This is the single most important fact for the design: no new channel is needed.

2. **There is NO per-partition voter-membership generation anywhere in this repo.** I checked: `PARTITIONS_SCHEMA` (`/mnt/data/peter/projects/lagrange/src/bootstrap/system-table-core-schema-definitions.js:48`) has `partition_version` — the split/merge partition version, not voter membership; `SERVICES_SCHEMA` (same file, line 222) has no generation column at all, only `updated_at`; `src/raft/` has no configuration-index/joint-consensus concept (no `configurationIndex`/`configIndex`/`membershipIndex` anywhere in `src`); `AssignmentEpoch` (`src/rebalancer/assignment-epoch.js`) is the cluster-wide `config.current_epoch`. Partition voter membership **is** the services-row census (`ACTIVE_VOTER_ROLES` over `services.raft_role`) and nothing numbers it.

3. **`membership_publication_epoch` denotes cluster *node*-membership publication, not partition voter membership** — see §1.4. It is already on the row, already fenced at dispatch, and already computed independently at the learner. The fourth addendum measured that it does **not** change across a refusal→grant flip. It is therefore usable as the coarse staleness fence and useless as the per-partition freshness fence. The real per-partition safety is the **bound**, not the generation.

---

## 1. The path, hop by hop

### 1.1 Cure policy decision (the mint site)

- `/mnt/data/peter/projects/lagrange/src/rebalancer/replica-placement-cure-policy.js` → `classifyPriorityOverTargetSpreadCureCondition(evidence)` returns `PLACEMENT_CURE_CONDITION.PRIORITY_OVER_TARGET_SPREAD_CURE` when: `isNonLedgerPriorityPlacementCurePartition(partitionId)`, `targetReplicaCount > 0`, `inFlightReplaceCount === 0`, `addMoveCount >= 1`, `voterReplicaCount > targetReplicaCount`, `requiredDistinctNodeCount > 0`, `activeDistinctNodeCount < requiredDistinctNodeCount`.
- **What it knows today:** every number the authorization needs except the destination and the operation id — `targetReplicaCount`, `voterReplicaCount` (the planner's observed voter count), `activeDistinctNodeCount`, `targetDistinctNodeCount`, `partitionId`.
- **What it must gain:** one new exported function in the same owner, e.g. `authorizeSpreadCureTransition(evidence, {destinationNodeId})`, returning the frozen authorization body (§3) or `null`. Rationale for putting the mint here and not in the planner: decision 1 names this module the single policy authority, and this is the only module that evaluates the exact condition.
- **Hazard (must-verify for the implementer):** the planner's `targetReplicaCount` at this point is `targetState.targetReplicaCount` (`/mnt/data/peter/projects/lagrange/src/rebalancer/move-planner-move-calculation-methods.js:329`), which comes from `calculateTargetReplicaCount` in `/mnt/data/peter/projects/lagrange/src/rebalancer/move-planner-state-methods.js:195` — a *state-dependent* value (healthy-count clamps to `policy.minReplicaCount`/`maxReplicaCount`, odd-count adjustment). The partition's desired RF comes from `resolveDesiredReplicationFactor(partitionRow)` in `/mnt/data/peter/projects/lagrange/src/bootstrap/replication-target-authority.js` (a pure row decode, UNDECLARED → 0). **These are two different derivations of "desired RF".** The mint must state `desiredReplicationFactor` from the row-decode authority (`resolveDesiredReplicationFactor` on the partitions row), not from `targetState`, or the RF-equality validation is comparing two different things.

### 1.2 Move planner (attach to the move)

Two call sites resolve that condition, and both must attach:
- `/mnt/data/peter/projects/lagrange/src/rebalancer/move-planner-priority-spread-cure.js` → `applyOverTargetCapAddRetention()` → `selectSpreadCureAddMoves()` (line ~70-85) — this is the measured 09-16 path ("executes the retained ADD"); the retained move is already re-typed `{...move, type: cure.moveType, reason: cure.moveReason}`, so the authorization joins that spread.
- Same file → `applyPrioritySpreadExpandCure()` (line ~275-285) where `classifyPriorityOverTargetSpreadCureCondition(sharedEvidence)` is the third fallback and re-types `addMoves[0]`.

The move gains one field, `move.spreadCureTransitionAuthorization`. **Do not** mint for `PRIORITY_EXPAND_FOR_SPREAD` or `LEDGER_EXPAND_FOR_SPREAD` in this quest: at-target expand (3 voters → 4 with target 3) already passes on `resolveReplacementPromotionAllowed` alone (cap `target+1 = 4`, votersAfter 4), so minting there changes a currently-working path for no gain. Record as a finding.

### 1.3 Coordinator / operation creation

- `/mnt/data/peter/projects/lagrange/src/rebalancer/unified-rebalancer-move-execution.js` → `buildCoordinatorOperationRequest(move, context, operationType)` (line 51) and `applyCoordinatorOperationRequestMutationContext(rebalancer, operationRequest, move)` (line ~81). The second is the existing, named place where move-borne mutation context is copied onto the request (`membershipPublicationEpoch`, `controlPlaneMutationWorkClass`, the priority-recovery authority marker). The authorization is copied here, same shape: **field absent from the move stays absent on the request.**
- `/mnt/data/peter/projects/lagrange/src/rebalancer/rebalance-coordinator-operation-creation.js` → `createOperationRecordInternal(context)`, line 628. This is the stamp site, and it must be **after** `allocateCanonicalReplicaId` (line ~673) because the authorization's `destinationReplicaId` is only known there. The existing stamps at lines 738, 758-766 and 782-786 (`BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED`, `REPLICA_IDS`/`PEER_ADDRESSES`, `READINESS_SNAPSHOT`) are the precedent: `operation.stepsHistory[0][OPERATION_METADATA_KEY.CURE_TRANSITION_AUTHORIZATION] = authorization`.
- `createOperationRecord` (= `createOperation` in `/mnt/data/peter/projects/lagrange/src/rebalancer/replica-status.js:139`) is *not* changed: it already only stamps `sourceReplicaId` into `stepsHistory[0]` and top-levels `membershipPublicationEpoch`.

**Note on what does NOT reach the receiver today:** `moveReason` is set on the operation request (`unified-rebalancer-move-execution.js:60`) but is consumed only by `rebalance-coordinator-priority-budget-admission.js:282` and is **never persisted** — `REPLICA_OPERATIONS_SCHEMA` has no move-reason column. So "the ADD is a spread cure" is genuinely invisible to the receiver today. That is the missing arrow, confirmed at the field level.

### 1.4 `replica_operations` row — schema owner, encode/decode, CDC

- **Schema owner:** `/mnt/data/peter/projects/lagrange/src/bootstrap/system-table-runtime-schema-definitions.js:56` (`REPLICA_OPERATIONS_SCHEMA`). `steps_history` is `TEXT NOT NULL`, a JSON array.
- **Row encode:** `/mnt/data/peter/projects/lagrange/src/rebalancer/replica-operation-repository-mutation-row-methods.js` → `buildReplicaOperationInsertData` (line ~30, `steps_history: JSON.stringify(operation.stepsHistory)`) and `buildReplicaOperationUpdateData` (line ~53, same). Also `/mnt/data/peter/projects/lagrange/src/rebalancer/rebalance-coordinator-shared.js:141-146` (the raw INSERT/UPDATE column lists).
- **Row decode:** `/mnt/data/peter/projects/lagrange/src/rebalancer/replica-operation-repository-row-methods.js` → `rowToOperation(row)` — it already lifts `replicaIds`, `peerAddresses`, `bootstrapTableMetadata`, `bootstrapPartitionMetadata` out of `stepsHistory` via `getOperationMetadataStringArray` / `getOperationMetadataObject` (defined in `/mnt/data/peter/projects/lagrange/src/rebalancer/replica-status.js:51-103`). The authorization decode belongs here too, so `operation.spreadCureTransitionAuthorization` exists for coordinator-side consumers.
- **`steps_history` is never truncated** — I grepped for slicing/shifting/retention over `stepsHistory` and found none, so `stepsHistory[0]` metadata survives every transition (this is already relied on by `sourceReplicaId`).
- **Parse cost on the learner:** `/mnt/data/peter/projects/lagrange/src/rebalancer/steps-history-parse-memo.js` is the content-keyed memo, already imported by `/mnt/data/peter/projects/lagrange/src/control-plane/priority-recovery-snapshot-rebalancer.js`. The guard must use it, not a raw `JSON.parse` on the 1 s recheck cadence.
- **CDC:** replicated as a whole row; the guard already reads `status`/`workflow_step` off cached `replica_operations` rows, and `buildPriorityRecoveryOperationContextFromRecord` (`priority-recovery-snapshot-rebalancer.js:662`) already parses `record.steps_history` from the *cached* row. The local-progress seed path `applyLocalPriorityOperationProgressRow` (`replica-operation-repository-row-methods.js`) writes through `buildReplicaOperationRow`, which includes `steps_history`. So no CDC change.

**`membership_publication_epoch`, exactly:**
- Column: `REPLICA_OPERATIONS_SCHEMA` `{name:'membership_publication_epoch', type: INTEGER}`, migrated idempotently by `ensureReplicaOperationsTableColumns()` in `/mnt/data/peter/projects/lagrange/src/partition/partition-service-entry-apply-base.js:52-86` (PRAGMA table_info → ALTER TABLE ADD COLUMN). That is the repo's migration/compat mechanism, and this column is its only replica_operations precedent alongside `target_claim_key`.
- Decode owner: `/mnt/data/peter/projects/lagrange/src/rebalancer/replica-operation-membership-epoch-binding.js` — states BOUND / UNBOUND / INVALID and throws a typed error on INVALID. **This is the shape to copy for the authorization.**
- Producer: `resolveMoveMembershipPublicationEpoch()` → `rebalancer.resolvePublishedMembershipPlanningEpoch()` (`/mnt/data/peter/projects/lagrange/src/rebalancer/unified-rebalancer-rebalance-loop.js:381`) → `controlPlaneReadinessService.getCurrentPublishedMembershipEpochSync()` (`/mnt/data/peter/projects/lagrange/src/control-plane/control-plane-readiness-publication-planning-snapshot.js:599`), which reads `planningSnapshot.publishedPlanningEpoch` — the latest PUBLISHED `control_plane_publications.publication_epoch`.
- Consumer: `ensureDispatchMembershipEpochOrSkip` (`/mnt/data/peter/projects/lagrange/src/rebalancer/operation-workflow-dispatch-epoch-gate.js`) fails the operation closed when `currentEpoch !== planningEpoch` at dispatch, and defers when the current epoch is unreadable.
- **At the partition end:** `resolveLearnerPromotionMembershipEpoch()` (`/mnt/data/peter/projects/lagrange/src/partition/partition-service-learner-promotion-proof-methods.js:50`) → `buildSnapshotCatchupIdentityFromCache(...).membershipEpoch` → `selectLatestPublishedMembershipEpoch(control_plane_publications rows)` (`/mnt/data/peter/projects/lagrange/src/control-plane/membership-epoch-contract.js:300`). **Same epoch space, two derivations.** Use `resolveLearnerPromotionMembershipEpoch()` at the receiver — it is already the promotion path's epoch authority (the proof gate uses it) — so no third derivation is introduced (R03).
- **Verdict:** `membership_publication_epoch` denotes *cluster node-membership publication*, not partition voter membership. It can serve as "observed membership generation" **only** in the sense "the cluster membership plan this decision was made under"; it cannot detect a change to this partition's voter set (the fourth addendum measured it unchanged across every flip). Say so in the brief; do not let the implementer pretend otherwise.

### 1.5 Dispatch to the target node

- `/mnt/data/peter/projects/lagrange/src/rebalancer/operation-workflow-dispatch-execution.js` claims PENDING→SENDING, runs the epoch gate, reservation gate, ledger self-move gate, then dispatches.
- The wire message is `CREATE_REPLICA` (`MESSAGE_TYPE.CREATE_REPLICA`), handled by `/mnt/data/peter/projects/lagrange/src/node/replica-handler-create-methods.js` → `handleCreateReplica(request)`, reading `ReplicaOperationField.*` (`/mnt/data/peter/projects/lagrange/src/rebalancer/replica-operation-constants.js:19`).
- **Design choice: do NOT carry the authorization on the dispatch payload.** It is one-shot, does not survive a restart of the replica service or a re-created PartitionService, and the guard re-evaluates every second against rows. The row is durable, already read, and is what the guard re-reads on every recheck. State the rejected alternative in the brief so the verifier does not ask.

### 1.6 Partition ADD / learner start

`replica-handler-create-methods.js` → `startCreateReplicaAsync(createRequest)` creates the replica, which becomes a catch-up learner; `replica-handler-voter-readiness-methods.js` runs the voter-ready wait (`VOTER_READY_CHECK_INTERVAL_MS = 250`, `/mnt/data/peter/projects/lagrange/src/node/replica-handler-transition-policy.js:26`), whose 60 s expiry is the measured "did not become voter-ready within 60000ms". **Unchanged by this quest** (decision 5).

### 1.7 Promotion check (the consume site)

`/mnt/data/peter/projects/lagrange/src/partition/partition-service-learner-promotion-methods.js` → `runLearnerPromotionCheck()` (line ~395):
1. role/leader gates;
2. `observeLearnerPromotionCountCheck()` (in `/mnt/data/peter/projects/lagrange/src/partition/partition-service-learner-promotion-count-check-methods.js:186`) — the ONE evaluation;
3. `evaluateLearnerPromotionCountCheck(observation)` (`/mnt/data/peter/projects/lagrange/src/partition/learner-promotion-count-check.js:126`);
4. refusal → log `LEARNER_PROMOTION_DEFERRED` with `reason`, the four top-level count fields, and `countCheckInputs`; reschedule;
5. pass → `logFirstLearnerPromotionCountCheckPass`, then `applyLearnerPromotionProofGate()`.

Inside `observeLearnerPromotionCountCheck`, the read order (pinned as `MAIN_READ_ORDER` in the test host) is: `getInFlightAddLikeOperationReplicaIds()` → `collectActiveVoterCensusForPromotion()` → `collectPendingLearnerCensusForPromotion()` → `resolveLearnerPromotionCounts()` → `resolveTargetReplicaCountForPromotion()` → `resolvePriorityRecoveryCompletionForLearnerPromotion()`.

`getInFlightAddLikeOperationReplicaIds()` (line 512) filters `replica_operations` for this partition with `ADD_LIKE_REPLICA_OPERATION_TYPES` and non-terminal status, and **throws away the rows**, returning only replica ids. This is the hop to change: replace with a single traversal `collectInFlightAddLikeOperationsForPromotion()` returning `{replicaIds: Set, ownedOperationRow}` where `ownedOperationRow` is the non-terminal add-like row whose `replica_id === this.replicaId` (or whose `target_node_id === this.nodeId` when the row's replica id is not yet set — the existing fallback in the same function). Keep `getInFlightAddLikeOperationReplicaIds()` as a thin wrapper only if a consumer needs it; today it has exactly one production caller.

### 1.8 Promotion proof at the Raft leader

`applyLearnerPromotionProofGate()` (`partition-service-learner-promotion-methods.js:465`) → `requestLearnerPromotionProofFromLeader` → leader-side `handleLearnerPromotionProofRequest(payload)` (`partition-service-learner-promotion-proof-methods.js:67`) → `evaluateLearnerPromotionProof(facts)` (`/mnt/data/peter/projects/lagrange/src/raft/learner-promotion-progress.js`). The leader's facts are: live leadership, term, `committedIndex`, `readFollowerMatchIndex(this.raft, learnerAddress)`, and both membership epochs. **The leader knows nothing about voter counts today.** On grant, the learner logs `LEARNER_PROMOTION_PROOF_GRANTED` and calls `becomeFollower()` — the promotion is a *local* role flip on the learner; there is no cluster-wide membership transaction.

### 1.9 Voter-ready → surplus REMOVE

After promotion the partition sits at 5 voters on 3 distinct nodes. The planner's drain path is `applyPrioritySpreadDrainCure()` → `classifyPrioritySpreadSurplusDrainCureCondition()`: with `activeDistinctNodeCount (3) >= requiredDistinctNodeCount (3)` the "yield to an actionable spread ADD" conjunct no longer blocks, and the `monotonicSafeRemove` drains 5→4→3. Unchanged by this quest; it is falsifiers (g) and (h).

---

## 2. Who is authoritative for the voter count at promotion time

**Answer: the receiving partition (the learner) decides; the bound is enforced there — and the leader should supply the voter-count *observation*.**

Justification from the code:

- **Decision 3 is explicit** that "a resulting voter count above the exact bound the operation authorized" is the *receiving partition's* mechanical/local safety. That settles where the decision lives.
- **The leader is not a better authority, only a better observer.** `evaluateLearnerPromotionProof` is a pure raft-progress function with no membership-count input; adding a count check there would mint a *second* decision site on the promotion path, which decision 4 forbids in spirit. And the leader's own voter view is the *same* replicated `services` rows the learner reads — `isActiveVoterServiceRowForPromotion` is a PartitionService method installed on every replica, not a leader privilege.
- **The lagging-cache hole is real and must be named.** Let `P` = the planner's observed voter count, `A = P + 1` = authorized resulting count, `T` = true voter count now, `L` = the learner's local census. The learner checks `L + 1 <= A`, i.e. `L <= P`. The true safety condition is `T <= P`. The fifth addendum proves `L` can lag (the recorded refusal shows `learnerReplicaIds: []`, `observedLearnerCount: 0` while the learner's own row existed 58 s later). If `L < T`, the check can pass while `T > P` → one voter of overshoot. Severity is bounded: at most one extra voter per authorized operation (the authorization is per-`destinationReplicaId`, single-use), and the surplus REMOVE drains it. Main has the same exposure today whenever the budget reads 2, so it is **not a regression** — but the brief must say this out loud or an adversarial verifier will find it and call the design unsound.
- **Recommended closure (slice 2 / optional in slice 1):** the leader adds one *observed fact* to the proof response — `leaderObservedActiveVoterCount`, computed with the existing `this.collectActiveVoterCensusForPromotion().count` inside `handleLearnerPromotionProofRequest`. `applyLearnerPromotionProofGate` already re-validates "against the freshest local observation after the round trip"; it re-checks the single bound with `Math.max(localCensus, leaderObservedActiveVoterCount) + 1 <= A`. One decision site, one bound, one extra observed input from the better-positioned observer. No new policy authority.

**Falsifier test for a lagging learner cache (name it in the brief):** `lagging-learner-census-cannot-exceed-the-authorized-bound` — drive `runLearnerPromotionCheck()` with a services fixture holding **three** voter rows while the authorization states `observedVoterCount: 4, authorizedResultingVoterCount: 5`, and assert either (slice 1) the promotion is granted and the payload records `membership.activeVoterCount: 3` against `authorization.observedVoterCount: 4` as an explicit divergence field, or (slice 2) the proof-gate re-check refuses with the leader-observed count of 4 → 5 voters… → granted; and with a leader-observed count of 5 → 6 > 5 → refused. Host: `/mnt/data/peter/projects/lagrange/test/partition/learner-promotion-count-check-inputs.test.js`.

---

## 3. The smallest operation contract

### 3.1 No schema change. Why this is not a parallel metadata system

`steps_history` is an **existing structured field of the existing replica operation**, with an existing key vocabulary (`OPERATION_METADATA_KEY` at `/mnt/data/peter/projects/lagrange/src/rebalancer/replica-operation-progress.js:350`), existing typed accessors (`getOperationMetadataObject/String/StringArray`), an existing memoised parse seam, and four existing production payloads riding it. Adding a fifth key is using the operation's own metadata channel, not building a second one — the owner's prohibition is against a *separate* record keyed off the operation, which is exactly what a new table or a side-channel would be.

If the owner later prefers a first-class column, the migration mechanism is `ensureReplicaOperationsTableColumns()` in `partition-service-entry-apply-base.js` (PRAGMA-guarded idempotent `ALTER TABLE`), the schema owner is `system-table-runtime-schema-definitions.js`, and the schema pins are the bootstrap schema tests plus `/mnt/data/peter/projects/lagrange/src/partition/partition-service-constants.js` (`PARTITION_SERVICE_COLUMN`, `PARTITION_SERVICE_COLUMN_SQL`, `PARTITION_SERVICE_LOG_MSG.ADDED_REPLICA_OPERATIONS_*`). **Recommend against it for this quest**: a column costs a migration, two raw SQL column lists (`rebalance-coordinator-shared.js:141-146`, `replica-operation-repository.js:190`), two row builders and a mixed-version story, for nothing the metadata channel does not already give.

### 3.2 The record

New key: `OPERATION_METADATA_KEY.CURE_TRANSITION_AUTHORIZATION = 'cureTransitionAuthorization'` (add to the frozen map in `replica-operation-progress.js`).

| field | type | set at | meaning |
|---|---|---|---|
| `intent` | string, the single admitted value `'critical_spread_cure'` | mint (`replica-placement-cure-policy.js`) | which policy row authorized this |
| `desiredReplicationFactor` | integer ≥ 1 | mint, from `resolveDesiredReplicationFactor(partitionRow).replicationFactor` | the RF the decision was made under |
| `observedMembershipEpoch` | integer ≥ 0 | stamp (`createOperationRecordInternal`), from the same value already written to `membership_publication_epoch` | cluster membership publication generation observed when planning |
| `observedVoterCount` | integer ≥ 0 | mint, `evidence.voterReplicaCount` | the membership the transition is authorized *from* |
| `authorizedResultingVoterCount` | integer ≥ 1 | mint, `observedVoterCount + 1` | **the exact bound** |
| `destinationNodeId` | non-empty string | mint (`move.nodeId`) | destination |
| `destinationReplicaId` | non-empty string | stamp, after `allocateCanonicalReplicaId` | destination replica |
| `operationId` | non-empty string | stamp | the operation this decision belongs to |

`authorizedResultingVoterCount` is **not** `target + 2`: it is the exact resulting count of the one transition, which is the owner's whole point ("It does not grant a blanket target + 2").

### 3.3 The binding owner (new module)

`/mnt/data/peter/projects/lagrange/src/rebalancer/spread-cure-transition-authorization.js`, modelled line-for-line on `replica-operation-membership-epoch-binding.js`:

```
SPREAD_CURE_AUTHORIZATION_BINDING_STATE = {PRESENT, ABSENT, MALFORMED}
decodeSpreadCureTransitionAuthorization(value) -> {state, authorization?, raw?}
```
- absent / null / undefined → `ABSENT` (nothing to honour; never coerced)
- an object with every field above, each of the right type and range → `PRESENT`
- anything else (missing field, wrong type, non-integer, negative, `authorizedResultingVoterCount < observedVoterCount`, unknown `intent`) → `MALFORMED`

and the evaluation the guard calls:
```
evaluateSpreadCureTransitionAuthorization({
  binding, operationId, localNodeId, localReplicaId,
  partitionDesiredReplicationFactor, partitionMembershipEpoch,
  votersAfterPromotion,
}) -> frozen {honoured: boolean, reason, authorizedResultingVoterCount|null}
```

**Validation rules and fail-closed behaviour, one per field:**

| condition | outcome | reason code |
|---|---|---|
| binding `ABSENT` | not honoured → cap falls back to `target + replacementAllowance` (today's behaviour with budget 0) | `authorization_absent` |
| binding `MALFORMED` | not honoured, same fallback. **Never throws** (unlike the epoch binding: a throw here would kill the 1 s recheck loop on every recheck) | `authorization_malformed` |
| `intent !== 'critical_spread_cure'` | not honoured | `authorization_intent_unknown` |
| `operationId !== ownedOperationRow.operation_id` | not honoured | `authorization_operation_mismatch` |
| `destinationNodeId !== this.nodeId` **or** `destinationReplicaId !== this.replicaId` | not honoured | `authorization_destination_mismatch` |
| `desiredReplicationFactor !== resolveDesiredReplicationFactor(partitionRow).replicationFactor` (including the UNDECLARED→0 case) | not honoured | `authorization_desired_rf_mismatch` |
| `observedMembershipEpoch < resolveLearnerPromotionMembershipEpoch()` | not honoured | `authorization_membership_generation_stale` |
| all of the above pass | honoured; `maxAllowedVotersAfterPromotion = authorizedResultingVoterCount` | `authorization_honoured` |

The **bound** (`votersAfterPromotion > authorizedResultingVoterCount`) stays in `evaluateLearnerPromotionCountCheck`, producing the **unchanged** refusal reason `would_exceed_target_replica_count`. Do not invent a new refusal reason string: `LEARNER_PROMOTION_COUNT_CHECK_REFUSAL.WOULD_EXCEED_TARGET_REPLICA_COUNT` is pinned by `/mnt/data/peter/projects/lagrange/examples/service-data-affinity/run-formation-probe.js` (`DEFERRAL_COUNTER_STRINGS`) and by the drift guard in `/mnt/data/peter/projects/lagrange/test/runtime/movielens-formation-probe-wiring.test.js:150` against `PARTITION_SERVICE_LITERAL.WOULD_EXCEED_TARGET_REPLICA_COUNT`. Changing it breaks the lab A/B counters this quest depends on. The authorization outcome goes in the payload (§4), not in the reason.

**Note the ordering choice:** "generation not older than observed" is implemented as `authorization.observedMembershipEpoch >= partition's current epoch` → reject when the authorization's epoch is *behind* the partition's. Falsifier (c) reads exactly that way. A partition whose own epoch view *lags* the authorization accepts it — the planner is the authority, and the dispatch epoch gate already refused to dispatch at a superseded epoch.

**Falsifier (d) — concurrent membership change — is carried by the bound, not by the generation.** A concurrent ADD that promoted raises `activeVoterCount` to 5 → `votersAfterPromotion = 6 > 5` → refuse, recheck, and the planner re-plans after the voter-ready timeout. A concurrent surplus REMOVE lowers it to 3 → `4 <= 5` → grant (harmless; this is decision 6's reason for a bound rather than set equality). Both must be red tests.

### 3.4 Mixed version

- **Old planner → new partition.** No metadata key → `ABSENT` → cap is `target + replacementAllowance` → an over-target cure ADD is refused with `would_exceed_target_replica_count`, exactly as main refuses today when the budget reads 0 (which the third addendum measured as 1253 of 1253 refusals at required 3). **Never silently granted.**
- **New planner → old partition.** The old partition ignores `stepsHistory[0].cureTransitionAuthorization` entirely (unknown keys are inert — `getOperationMetadataValue` is key-addressed) and keeps its budget behaviour. No crash, no schema error, no NOT NULL violation. `steps_history` stays a valid JSON array.
- **Old row / new code mid-flight.** Same as old planner: `ABSENT`.
- **Corrupt value from any source.** `MALFORMED` → fallback, plus a payload field naming it. Fail-closed and observable.

---

## 4. Exactly what is deleted or bypassed

**Deleted from `/mnt/data/peter/projects/lagrange/src/partition/partition-service-learner-promotion-count-check-methods.js`:**
- `resolvePriorityRecoveryCompletionForLearnerPromotion()` — deleted entirely.
- `readPriorityRecoveryReadinessForLearnerPromotion()` — deleted (its only caller was the above).
- With it go the imports of `readPriorityRecoveryPlanningAnswerOrigin`, `buildPriorityRecoveryCompletion`, `buildPriorityRecoveryLearnerPromotion`, `buildPriorityRecoveryPartitionAssessment`, `getTrafficReadinessSnapshot`, `hasPriorityRecoverySpreadGap`, `resolvePriorityRecoveryActiveNodeCohort`, `classifySystemPartition`, `LIFECYCLE_REASON`.

**Deleted from `/mnt/data/peter/projects/lagrange/src/partition/partition-service-learner-promotion-methods.js`:**
- `getPriorityRecoveryPlanningSnapshotForLearnerPromotion()` (the four-way duck-typed readiness-service ladder, lines ~120-175) — no remaining caller.
- `getPriorityRecoveryOperationContextsForLearnerPromotion()` — no remaining caller.
- `resolveActiveLearnerNodeIdsForPromotion()` — verify no other caller before deleting.
- Import of `buildPriorityRecoveryOperationContextFromRecord`.

**The structural proof of falsifier (i):** after the change, `src/partition/partition-service-learner-promotion*.js` imports **nothing** from `src/control-plane/priority-recovery-*`. That is a grep-able, verifier-checkable invariant — make it a receipt.

**`temporaryOverflowVoterBudget` — is the guard its only consumer? YES, and I verified it two ways.**
- Textually: `temporaryOverflowVoterBudget` and `allowTemporaryOverflowPromotion` appear only in `priority-recovery-completion.js` (producer), `learner-promotion-count-check.js` (the decision), `partition-service-learner-promotion-count-check-methods.js` (the wiring), `learner-promotion-count-check-evidence.js` (the log render), and one string in `scripts/check-guideline-deferred-outcomes.js`.
- Semantically: `resolvePriorityRecoveryTemporaryOverflowVoterBudget` returns 0 unless `targetReplicaCount`, `activeVoterCount` and `learnerCount` are all finite. I checked every other `buildPriorityRecoveryCompletion` call site — `priority-recovery-decision-snapshot-rebuild.js:39`, `priority-recovery-dispatch-snapshot.js:148` and `:577`, `priority-recovery-superseded-target.js:86`, `replica-operation-repository-visibility-methods.js:464/494/586` — and **none** passes those three. So `PRIORITY_RECOVERY_COMPLETION_STATE.TEMPORARY_OVER_TARGET_ALLOWED` is reachable *only* through the learner-promotion guard. Deleting the budget therefore cannot change any other consumer's completion state.

**Therefore delete it (obsolete duplicate authority), in this order:**
1. `PRIORITY_RECOVERY_TEMPORARY_OVERFLOW_VOTER_BUDGET`, `resolvePriorityRecoveryTemporaryOverflowVoterBudget`, the `allowTemporaryOverflowPromotion` option and output field, the `temporaryOverflowVoterBudget` output field — all in `/mnt/data/peter/projects/lagrange/src/control-plane/priority-recovery-completion.js`.
2. `PRIORITY_RECOVERY_COMPLETION_STATE.TEMPORARY_OVER_TARGET_ALLOWED` and `PRIORITY_RECOVERY_COMPLETION_REASON.TEMPORARY_OVER_TARGET_ALLOWED` — with the budget gone, nothing can produce this state, and a named state nothing can enter is dead vocabulary (R07). This touches `PRIORITY_RECOVERY_COMPLETION_STATE_IDS` and its three generic consumers: `priority-recovery-snapshot-active-gate.js:82/90/98/119/201`, `priority-recovery-snapshot-closure.js:179`, `priority-recovery-dispatch-snapshot.js:456` (`buildPriorityRecoveryCompletionPartitionSetMap` emits one key per state id — one fewer key in a diagnostic map).
3. **Do not miss:** `/mnt/data/peter/projects/lagrange/scripts/check-guideline-deferred-outcomes.js` pins `'allowTemporaryOverflowPromotion:'` as a required structured fragment of `priority-recovery-completion.js` in `DEFERRED_OUTCOME_HOTSPOT_CONTRACTS`. That map must be updated in the same commit or `npm run audit:guidelines` goes red.
4. `/mnt/data/peter/projects/lagrange/test/control-plane/priority-recovery-completion.test.js:64/69/109/114` pins the state and reason — rewrite, do not delete the file.

*If the owner judges step 2's blast radius too wide for one quest*, the acceptable fallback is to delete only the budget fields and leave the state id, recorded as an R17 finding — but the lead's instruction is to delete rather than leave dormant, so step 2 is the recommendation.

**The `countCheckInputs` observability keeps working and now states the authorization.** In `/mnt/data/peter/projects/lagrange/src/partition/learner-promotion-count-check-evidence.js`, replace `buildPriorityRecoveryEvidence()` (and its helpers `buildNodeReadinessEvidence`, `buildPlanningAnswerEvidence`, `buildPrioritySummaryEvidence`, `buildPlannerEvidence`, `buildCountedOperationsEvidence`, `buildCompletionEvidence`) with one `buildTransitionAuthorizationEvidence(authorization)`:

```
authorization: {
  present: <bool>,            // binding state PRESENT
  state: 'present'|'absent'|'malformed',
  honoured: <bool>,
  reason: <one of the reason codes in §3.3>,
  intent, desiredReplicationFactor,
  observedMembershipEpoch, partitionMembershipEpoch,
  observedVoterCount, authorizedResultingVoterCount,
  destinationNodeId, destinationReplicaId, operationId
}
```
Everything else in the payload (`criticalSystemPartition`, `joining`, `allowances`, `maxAllowedVotersAfterPromotion`, `membership`, `inFlightAddLike`) is unchanged, including the deliberate nesting that keeps top-level `maxAllowedVotersAfterPromotion` a refusal-only discriminator. The bounded-list discipline (`capList`, `LEARNER_PROMOTION_INPUTS_LIST_LIMIT`) is unchanged; the authorization record is fixed-arity so nothing new needs capping.

**Allowances.** `resolvePromotionAllowances` in `learner-promotion-count-check.js` loses `priorityRecoveryOverflow`/`additionalVoters` and gains `cureTransitionAuthorized`. The cap becomes:
```
maxAllowedVotersAfterPromotion =
  allowances.cureTransitionAuthorized ?
    inputs.authorizedResultingVoterCount :
    inputs.targetReplicaCount + (replacement || singleVoterExpansion ? 1 : 0)
```
`cureTransitionAuthorized` participates in `anyAllowance` in `resolveCountCheckRefusal` **exactly as `priorityRecoveryOverflow` did** — state this as a designed equivalence and pin it, because it governs the even-voter gate.

**Sequencing collision to flag to the lead:** the epic's log-only quest `closure-witness-route-observed` adds witness-route fields (route, witness state, unresolved ids, base summary, per-operation target visibility) to **this same guard payload** — the block this quest deletes. If both are live, one of them is wasted work. My read: once the guard stops consuming the summary, the witness route no longer matters *on the promotion path* (it still matters for the planner's own consumer, which owner decision 3 of 2026-09-19 deliberately preserves). The lead should decide: either run `closure-witness-route-observed` first and accept that its guard-payload fields die with this quest, or retarget it at the planner-side consumer.

---

## 5. Red tests, one-to-one with the falsifiers

Lowest-owner-level host per falsifier. Existing hosts to extend, not new files where possible.

| # | Falsifier | Test name (proposed) | Host |
|---|---|---|---|
| a | recorded refusal state is refused before, granted after, for a cure ADD carrying a valid authorization | `the recorded refusal reading is granted when the cure ADD carries its authorization` — replay the fixture's `refusal` record's membership/operation shape with the authorization stamped; assert `refused: false`, `maxAllowedVotersAfterPromotion: 5`; and a companion row without the authorization asserting `refused: true, reason: would_exceed_target_replica_count, max: 4` (the before state) | `/mnt/data/peter/projects/lagrange/test/partition/learner-promotion-count-check-inputs.test.js` |
| b | recorded passing state stays granted | `the recorded passing reading stays granted` — the fixture's `passing` record (budget 2, max 6 on main) now grants via the authorization at max 5, `votersAfterPromotion 5` | same host |
| b2 | lagging learner cache (see §2) | `a lagging learner census cannot exceed the authorized bound` | same host |
| c | stale authorization rejected | `an authorization whose observed membership epoch is behind the partition's is not honoured` — assert `authorization.honoured: false, reason: authorization_membership_generation_stale` and the refusal | same host |
| d | concurrent membership change invalidates or re-plans, never a silent over-count | two rows: `a concurrent promotion raising the voter census refuses the authorized transition` (5 voters, authorized 5 → refuse) and `a concurrent surplus REMOVE does not refuse a harmless authorized transition` (3 voters, authorized 5 → grant) | same host |
| e | ordinary non-cure ADD cannot use the overflow authority | two levels. **Policy level:** `an ordinary partition never mints a spread-cure authorization` — `authorizeSpreadCureTransition` returns null for `USER_PARTITION_ID` (the classifier's `isNonLedgerPriorityPlacementCurePartition` gate) — host `/mnt/data/peter/projects/lagrange/test/rebalancer/replica-placement-cure-policy.test.js`. **Guard level:** `the measured user-table shape (4 voters on 4 nodes, target 3, a fifth arriving) is refused unchanged` — `ORDINARY_PARTITION_ID` fixture, no authorization, `refused: true` — host: the count-check-inputs test |
| f | desired RF stays 3 | `an authorization stating a different desired RF than the partition's row is not honoured` (`authorization_desired_rf_mismatch`), plus `the cure never raises the partitions-row replica_count` asserted on the planner sequence | count-check-inputs test + `/mnt/data/peter/projects/lagrange/test/rebalancer/critical-spread-terminal-stall-repro.test.js` |
| g | surplus cleaned up after the cure | `the post-promotion 5-voter/3-node state drains its surplus` — `classifyPrioritySpreadSurplusDrainCureCondition` returns `PRIORITY_DRAIN_SPREAD_SURPLUS` at `activeDistinctNodeCount 3 >= required 3` | `/mnt/data/peter/projects/lagrange/test/rebalancer/replica-placement-cure-policy.test.js` |
| h | three distinct eligible holder nodes result | `the authorized cure targets a node not already hosting the partition` — `selectSpreadCureAddMoves` gap-cap + non-hosting invariant, and the authorization's `destinationNodeId` is that node | `/mnt/data/peter/projects/lagrange/test/rebalancer/spread-cure-at-target-minting-gap.test.js` |
| i | no alternative placement-policy authority remains | `the promotion path imports nothing from priority-recovery` — read `src/partition/partition-service-learner-promotion*.js` and `src/partition/learner-promotion-count-check*.js` and assert no `control-plane/priority-recovery-` import, and that `temporaryOverflowVoterBudget` appears in no `src/` file (source-text assertion, the same shape the movielens drift guard already uses for emitter paths) | count-check-inputs test (new section) |

**Decision-neutrality surface (the frozen oracle).** `/mnt/data/peter/projects/lagrange/test/partition/learner-promotion-count-check-inputs.test.js` already holds a verbatim frozen copy of main's arithmetic (`frozenTemporaryOverflowVoterBudget`, `frozenAllowances`, `frozenCountCheck`, lines 333-415) driven by an exhaustive `ARITHMETIC_GRID` of `6*4*6*2*2*2*3 = 3456` rows plus a `GUARD_GRID` end-to-end layer (line 1065). Extend it as three explicit claims, not one:
- **N1.** For every grid row with **no** authorization, the repaired guard's `{refused, reason, maxAllowedVotersAfterPromotion, allowances-minus-the-renamed-field, scheduled recheck}` equals `frozenCountCheck(row)` evaluated with `temporaryOverflowVoterBudget = 0`. This is the "everything that is not an authorized cure ADD decides exactly as main" claim.
- **N2.** For every grid row **with** a valid authorization, `maxAllowedVotersAfterPromotion === authorizedResultingVoterCount` exactly.
- **N3.** The *enumerated* set of rows where main (budget 2, cap `target+3`) granted and the repair refuses — every row with `votersAfterPromotion > authorizedResultingVoterCount`, e.g. 5 voters at target 3 where main's cap was 6. This is a deliberate **tightening** (the owner's "no blanket target + 2") and must be listed row by row in the test so it is a decision, not a surprise.
- The `MAIN_READ_ORDER` pin (line ~78) **will change**: `readinessSnapshot`, `planningAnswer`, the 5th `filter:services` and `nodeReadiness:<node>` disappear; a `parse:steps_history` (memoised) appears. Update the pin with the new order and a comment naming the deleted reads — the shrinking read order is itself evidence for falsifier (i).

**Probe.** `test-receipt` (same shape as `/mnt/data/peter/projects/lagrange/scripts/quest-evidence/learner-promotion-guard-inputs-observed.js`): a new `scripts/quest-evidence/critical-spread-transition-authority.js` with one receipt per falsifier id (`a`…`i`, plus `decision-neutral` and `no-second-authority`), each bound to a test file and an anchored `^…$` test-name pattern.

**Owner-interaction registration (R02).** Add a `coupledPairs` entry to `/mnt/data/peter/projects/lagrange/test/shards/impact-contracts.json`, e.g. `spread-cure-transition-authorization`: endpoint `cure-authorization-mint` = [`src/rebalancer/replica-placement-cure-policy.js`, `src/rebalancer/move-planner-priority-spread-cure.js`, `src/rebalancer/rebalance-coordinator-operation-creation.js`], endpoint `cure-authorization-consumer` = [`src/partition/partition-service-learner-promotion-count-check-methods.js`, `src/partition/learner-promotion-count-check.js`, `src/rebalancer/spread-cure-transition-authorization.js`], witness = the count-check-inputs test. The existing neighbour pair is `priority-spread-planner-retention-admission-hold` (witnesses `critical-spread-terminal-stall-repro.test.js`, `spread-cure-at-target-minting-gap.test.js`) — model the new entry on it. `npm run audit:impact-contracts` enforces this.

---

## 6. Risks and couplings

**Suites to run (wide net — join/rejoin/rebalance/partitioning are presumed coupled):**
- `test/partition/` (promotion, wake, proof, transactions-query-routing — `countActiveVoters`/`countPendingLearners` are exercised there)
- `test/rebalancer/` in full, especially the cure/spread family: `replica-placement-cure-policy`, `critical-spread-terminal-stall-repro`, `spread-cure-at-target-minting-gap`, `move-planner-spread-vs-count-reconciliation`, `formation-barrier-spread-cure-lane-discrimination`, `ledger-quorum-spread-hold-cure-drain-admission`, `priority-remove-safety-spread-nonregression`, `movielens-incremental-replace-spread-nonregression`, `user-table-leader-placement-cure`, `rebalance-coordinator-operation-ownership`
- `test/control-plane/` priority-recovery family (the completion-state deletion touches `priority-recovery-completion`, `priority-recovery-snapshot*`, `priority-recovery-decision-provenance`)
- `test/convergence/` `dt6-learner-promotion-progress-proof`, `dt6-learner-promotion-proof-channel-wake`, `dt6-voter-surplus-promotion-drain-livelock` — all three assert on `would_exceed_target_replica_count`
- `test/runtime/movielens-formation-probe-wiring.test.js` (the reason-string drift guard)
- `test/bootstrap/` (schema/migration + `production-scheduling-defaults.test.js`)
- `test/integration/membership-consistency*`, `test/integration/message-group-multi-join-formation`, `test/raft/`, `test/node/`
- `npm run test:static` in full before landing — it includes `audit:guidelines` (which will catch the `check-guideline-deferred-outcomes.js` map), `audit:impact-contracts`, `audit:shards`, `test:unused*`, `audit:file-size`, `test:complexity`, `test:metrics`.

**Ratchets likely to bite:**
- **File size** (`npm run audit:file-size`, source threshold 800 lines, baseline = a *count* of 27 oversized files, one-way). `partition-service-learner-promotion-methods.js` is 619 → this quest *shrinks* it (two methods deleted). `partition-service-learner-promotion-count-check-methods.js` is 280 → shrinks. `move-planner-priority-spread-cure.js` 296 and `replica-placement-cure-policy.js` 573 → grow modestly, both far under 800. **`rebalance-coordinator-operation-creation.js` is already 986** (already in the baseline count) — adding the stamp there keeps it oversized but does not add a new offender; keep the stamp to a few lines or extract it into the new binding module as `stampSpreadCureTransitionAuthorization(operation, {...})`. Net: the file-size ratchet should be satisfiable, possibly tightenable.
- **Complexity 12** (`npm run test:complexity`, baseline count 1818, one-way; the 2026-09-19 entry already tightened 1819→1818 for this very code). `evaluateLearnerPromotionCountCheck` and `resolvePromotionAllowances` are at risk if the authorization branch is inlined — put the whole authorization evaluation in the new module (`evaluateSpreadCureTransitionAuthorization`) and pass a single boolean + number into the arithmetic owner. `createOperationRecordInternal` is already long; do not add a branch chain there.
- **Duplication** (`npm run test:duplication`, 20 lines / 100 tokens): the new binding module will look like `replica-operation-membership-epoch-binding.js`. Keep the decode table shape but not the literal text; do not copy the `describeRawEpochValue`/error-builder block verbatim.
- **Unused exports** (`npm run test:unused:exports`, `test:unused:ratchet`): every export of the new module needs a production consumer. `SPREAD_CURE_AUTHORIZATION_BINDING_STATE` exported for tests only would raise the count — export only what production imports and assert the states through the returned records.
- **Guideline audits:** `check-guideline-deferred-outcomes.js` (named above), `check-guideline-literals` (the new reason strings must live in a constants owner, not inline — R06), `check-cure-typing-owner` (`npm run audit:cure-typing-owner`, the census analyzer that counts cure-typing re-derivation outside the owner family — the mint must live inside `replica-placement-cure-policy.js` or it will trip).

**The REPLACE / replacement-allowance path shares this guard.** `resolveReplacementPromotionAllowed` in `learner-promotion-count-check.js` grants `+1` on two disjunctions, one of which (`operationOwnedCriticalReplacementPromotionAllowed`) fires for **any** owned add-like operation on a critical partition at-or-above target — REPLACE targets included (`ADD_LIKE_REPLICA_OPERATION_TYPES` covers ADD and REPLACE). Consequences:
- A REPLACE target learner on a critical partition **at** target keeps its `target+1` cap unchanged — untouched by this quest.
- A REPLACE target learner on a critical partition **over** target today depends on the budget being 2 to be promoted, and will refuse after the deletion unless it carries an authorization. **This is the single largest regression risk in the quest.** The brief must require an explicit inventory finding before the delete: enumerate every production path that can create an add-like operation on a bootstrap-critical partition and state, for each, whether it can be over-target at promotion. Start from `applyOverTargetCapAddRetention`, `applyPrioritySpreadExpandCure`, `classifyPriorityRecoveryFollowUpCureCondition` → `buildPriorityRecoveryFollowUpMove` (`src/rebalancer/unified-rebalancer-follow-up-move.js`), and `src/query/sql-query-engine-initial-partition-provisioning.js`. Any path that can be over-target and is not minted must either be minted or be a recorded owner decision that it now refuses.
- `move-planner-move-calculation-methods.js:376` explicitly documents that the over-creation cap reads "the SAME voters the promotion guard is blocked by (`countActiveVoters`)". That comment is the planner↔guard coupling in prose; the new coupled-pair registration makes it machine-readable.

**Other couplings:** the `PRIORITY_RECOVERY_COMPLETION_STATE_IDS` deletion changes one key in `buildPriorityRecoveryCompletionPartitionSetMap` output, consumed by the active-gate and closure snapshot builders — diagnostic only, but pinned by control-plane tests. And `scripts/check-voter-readiness-single-owner.js` / `audit:voter-readiness-owner` must not see a new local voter-role literal: use `isActiveVoterServiceRowForPromotion` and nothing hand-rolled.

---

## 7. Staging

**Recommendation: one quest, two sealed commits, each independently verified.**

- **C1 — contract + mint + carry + observe (decision-neutral).** New binding module; `OPERATION_METADATA_KEY.CURE_TRANSITION_AUTHORIZATION`; `authorizeSpreadCureTransition` in the policy owner; attachment at both cure call sites; the stamp in `createOperationRecordInternal`; the decode in `rowToOperation`; the learner decodes and **logs** `countCheckInputs.authorization` but **the cap is unchanged** (budget still in force). Proof: the frozen oracle is byte-identical on the whole 3456-row grid, and the authorization appears end-to-end on a row.
- **C2 — enforce + delete.** The cap becomes the authorized bound; `resolvePriorityRecoveryCompletionForLearnerPromotion` and its read ladder are deleted; the budget and `TEMPORARY_OVER_TARGET_ALLOWED` are deleted; the guideline map and the completion test are updated.

**Why this split and not one commit:** C1 is provably behaviour-free, so a verifier can check the carrier in isolation; and — decisively — **C1 can be run in the lab before C2**, which measures how many of the 1253 measured refusals would actually have carried a valid authorization. That is the only cheap way to de-risk the REPLACE/over-target inventory above before the budget is removed. It is also exactly the epic's own "observability first" pattern (owner decision 4 of 2026-09-19).

**Why not two quests:** decision 4 ("no second placement-policy authority may remain") cannot be proven by C1 alone, and a quest that lands with both authorities in place is the state the epic is trying to leave. Keep both commits inside one sealed statement so the terminal proof covers falsifier (i).

If the lead's quest rules forbid a two-commit quest, split into `critical-spread-transition-authority-carry` (C1) and `critical-spread-transition-authority` (C2); do **not** land C1 alone and stop.

---

## 8. Lab proof plan

Instrument: `npm run -s health:formation -- --trend <scratch-file>` — five local node processes, ~4 min per run, on the lab machines. Interleave A (main) and B (branch) on the **same** machine, alternating, ≥ 6 runs per variant per machine, on at least two machines (the 8-thread laptops fail far more often than the 12-thread box, so per-machine comparison is mandatory and cross-machine pooling is invalid). Never touch the committed trend file.

**What must be visible in the B logs (path-taken evidence):**
1. On the seed: `Deferring spread-driven count-increasing ADD while already at/over target` with `overTargetCapAddDecision: "retain_spread_cure_adds"` and `retainedSpreadCureAddCount >= 1` — unchanged from main; this proves the same planner decision is still being made.
2. On the learner node: `Learner promotion count check inputs` (the first-pass line) carrying `countCheckInputs.authorization = {state:"present", honoured:true, intent:"critical_spread_cure", desiredReplicationFactor:3, observedVoterCount:4, authorizedResultingVoterCount:5, destinationReplicaId:"<partition>-p1-rN"}` and `maxAllowedVotersAfterPromotion: 5`.
3. `Learner promotion proof granted` for the same `replicaId`, with the elapsed time from learner creation to proof measured — the claim is seconds, not the 60 s timeout.

**The A/B numbers:**
- **Cure-op refusals → zero.** Count `Learner promotion deferred` lines with `reason: would_exceed_target_replica_count` on **critical system partitions** (`schema_operations-p1`, `sql_transactions-p1`, `sql_transaction_participants-p1`, `sql_write_operations-p1`, `control_plane_publications-p1`, `replica_operations-p1`). A: tens to hundreds per failing run (measured 39–418). B: **0**, or a small number every one of which carries `authorization.honoured: false` with a named reason (stale / destination mismatch / absent) — an honoured authorization that still refuses would be a defect.
- **`tbl-*` refusals unchanged.** Count the same refusal reason on partitions whose id starts with `tbl-` (the MovieLens partitions; `RATINGS_PARTITION_PREFIX = 'tbl-'` in `examples/service-data-affinity/run-formation-probe.js`). The measured shape is ~200 per run, 4 voters on 4 distinct nodes, target 3. B must be statistically indistinguishable from A, and every such line must carry `authorization.state: "absent"`. This is falsifier (e) measured live.
- **`Replica … did not become voter-ready within 60000ms` on critical partitions → zero** in B (the 60 s stall is the cost being removed). Count per run.
- **No partition ends above RF 3.** At the end of each run, `SELECT partition_id, COUNT(*) FROM services WHERE service_type='partition' AND status='active' AND raft_role IN ('leader','follower','candidate') GROUP BY partition_id` — every critical partition at exactly 3 voters on 3 distinct nodes. Also assert no `partitions.replica_count` changed (falsifier f) and that a surplus REMOVE was executed after each cure (falsifier g), visible as a completed `REMOVE` operation on the cured partition.
- **Expected non-result, state it up front:** the first addendum's correction shows the refusal is neither necessary nor sufficient for the FAIL verdict — one run passed with 242 refusals and one failed with zero. **The lab proof must not claim a PASS-rate improvement.** The claim is exactly: cure-op refusals go to zero, the 60–110 s stall per occurrence disappears, tbl-* behaviour is unchanged, and no partition exceeds RF 3. The `observation_unavailable` mechanism is out of scope and will still fail runs.

---

## 9. What I could NOT determine from the code (labelled)

1. **Whether any *non-cure* add-like operation on a bootstrap-critical partition can reach the guard while over target.** I identified the risk (§6, REPLACE/replacement-allowance) but did not exhaustively trace `buildPriorityRecoveryFollowUpMove` and the provisioning path. This is the one inventory the quest must do before the delete. *Inference, not measured.*
2. **Whether the planner's `targetState.targetReplicaCount` can ever differ from `resolveDesiredReplicationFactor(partitionRow).replicationFactor` for a critical partition during formation.** `calculateTargetReplicaCount` clamps on `policy.minReplicaCount || 3` / `maxReplicaCount || 7` and odd-adjusts; for RF 3 with healthy counts 2–5 I believe it returns 3, but I did not enumerate the policy source. Mitigation is already in the design: mint from the row-decode authority. *Inference.*
3. **Whether `getCurrentPublishedMembershipEpochSync` (planner) and `selectLatestPublishedMembershipEpoch` (partition) always agree.** Both derive from PUBLISHED `control_plane_publications` rows, but through two different readers; the planner goes via `planningSnapshot.publishedPlanningEpoch`. I did not find a test pinning their equality. If they can diverge, the staleness fence can produce false `authorization_membership_generation_stale` refusals. **Recommend a red test pinning the two readers against one row set** — cheap, and it is exactly the R03 "two derivations of one fact" shape this epic keeps finding.
4. **The live route that produced the satisfied closure witness** (the fifth addendum's open question, quest `closure-witness-route-observed`). This design **does not need it**: the repair removes the guard's dependence on the witness entirely, so the route becomes a planner-side question only. Say this explicitly in the brief — it is a scope reduction the lead can bank.
5. **Whether `resolveActiveLearnerNodeIdsForPromotion` has a consumer outside the deleted method.** I found none by grep but did not check the test tree exhaustively; the implementer must verify before deleting.

---

### Critical files for implementation
- /mnt/data/peter/projects/lagrange/src/partition/partition-service-learner-promotion-count-check-methods.js
- /mnt/data/peter/projects/lagrange/src/partition/learner-promotion-count-check.js
- /mnt/data/peter/projects/lagrange/src/rebalancer/replica-placement-cure-policy.js
- /mnt/data/peter/projects/lagrange/src/rebalancer/rebalance-coordinator-operation-creation.js
- /mnt/data/peter/projects/lagrange/test/partition/learner-promotion-count-check-inputs.test.js