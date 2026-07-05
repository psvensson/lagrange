# Research: quorum-concentration hold — engage/release code map

Quest: `formation-ledger-post-spread-voter-visibility-latency`
Read-only code research, 2026-07-05. All paths repo-relative.

## 1. Re-evaluation trigger — who calls the evaluator, and where

**No cache, no TTL, no timer, no event subscription.** The evaluator
`evaluateOperationLedgerQuorumConcentration(systemTableCache)`
(src/rebalancer/operation-ledger-quorum-concentration.js:170) is a pure
synchronous function over the coordinator's `this.systemTableCache`; every call
recomputes from the current cache rows. It has exactly two production call
sites, both in
src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:

- `ensureOperationLedgerQuorumSpreadFirst(...)` — line 233-256, evaluator
  invoked at line 234. Throws the typed interlock error with reason code
  `operation_ledger_quorum_concentrated` (constant defined at lines 37-38,
  thrown at line 248).
- `isOperationLedgerQuorumConcentratedForPartition(partitionId)` — lines
  269-274 (evaluator at line 271); this is the PLANNER's priority-recovery-gate
  evidence path (consumed at
  src/rebalancer/rebalancer-priority-recovery-planning-gate-methods.js:133),
  not the admission hold.

**When the hold path runs.** `ensureOperationLedgerQuorumSpreadFirst` is called
only from `ensureOperationLedgerSelfMoveSerialized` (same file, line 206),
inside the "no live ledger self-move found" branch (lines 192-210). That
method is invoked per operation-creation attempt and per admission probe:

- Creation (enforcing): `createOperationInternal` path — the interlock is
  probed at src/rebalancer/rebalance-coordinator-operation-creation.js:291
  (inside `createOperationInternal`), and creation is additionally wrapped in
  the synchronous accounting gate `runOperationLedgerInterlockAccountedCreate`
  (src/rebalancer/rebalance-coordinator-operation-creation.js:133 →
  ledger-interlock-admission.js:355).
- Precheck (advisory, the run-25 layer): the coordinator's
  `checkProvisioningAdmission(move)`
  (src/rebalancer/rebalance-coordinator-operation-creation.js:153) FIRST calls
  `resolveProvisioningLedgerInterlockDeferral(move)` (line 162-166, impl at
  lines 178-203), which calls `ensureOperationLedgerSelfMoveSerialized` (line
  180) and converts an interlock throw carrying `error.admissionResult` into a
  `{allowed:false, admissionResult}` deferral. Only if the interlock is clear
  does it fall through to storage admission
  (src/rebalancer/provisioning-admission-policy.js:245 `checkProvisioningAdmission`).

So the evaluation is **fresh on every probe** — each admission probe re-filters
the live `systemTableCache` rows. Staleness can only come from the
systemTableCache itself (CDC/publication-fed services/nodes/partitions rows),
not from any memoization in the hold.

**Coordinator-local, not per-target-node.** The whole evaluation runs on the
node executing the CREATE TABLE provisioning (the coordinator that owns the
SQL engine + rebalanceCoordinator instance). The "3 nodes each rejecting with
operation_ledger_quorum_concentrated" in the run-27 demo error is an artifact
of the provisioning loop probing admission **once per candidate TARGET node**:

- `probeProvisioningTargetAdmission` loops `for (const targetNodeId of
  candidateTargetNodeIds)` calling
  `this.rebalanceCoordinator.checkProvisioningAdmission({... nodeId:
  targetNodeId})`
  (src/query/sql-query-engine-provisioning-admission-methods.js:410-451), and
- the inline creation-planning loop does the same
  (src/query/sql-query-engine-initial-partition-provisioning.js:285-337).

Each of those three probes hits the SAME coordinator-local interlock state and
the SAME systemTableCache; the per-node rejection rows
(`createProvisioningTargetRejection`,
sql-query-engine-provisioning-admission-methods.js:95-114) just attach the
same coordinator-side reason code to each candidate `targetNodeId`. No target
node ever evaluated anything.

## 2. REPLACE ordering — promotion vs source removal

**Two-phase workflow.** A REPLACE runs a create phase (replacement ADD) then a
remove phase (source removal). Workflow steps: PENDING → SENDING → CREATING →
SYNCING → ACTIVE → STOPPING → REMOVED (src/constants/workflow.js:1-10). The
coordinator moves to the remove phase only after the create phase is
satisfied; the STOPPING transition is committed when the REPLACE is in
`replaceRemovePhase`
(src/rebalancer/operation-workflow-dispatch-response-reconcile.js:515-521 and
576-590; resume decision at lines 598-630).

**Voter-ready gate (run-21 machinery).** On the TARGET (executor) node the
create path emits SYNCING, syncs from leader, then — for critical system
partitions with a gated op type — blocks on `waitForVoterReadyActivation`
before emitting ACTIVE
(src/node/replica-handler-create-methods.js:818-836). Gating facts:

- REPLACE and ADD are gated types: `CRITICAL_VOTER_READY_GATED_OPERATION_TYPES
  = {ADD, REPLACE}` (src/node/replica-handler-transition-policy.js:44-47);
  critical set = every `<system-table>-p1` partition (lines 28-30), which
  includes the operation-ledger partitions.
- The wait polls every 250ms (`VOTER_READY_CHECK_INTERVAL_MS`,
  transition-policy.js:31) with deadline `this.syncTimeoutMs`
  (src/node/replica-handler-voter-readiness-methods.js:144-181), default
  `SYNC_TIMEOUT_MS: TIME_MS.MINUTE` = 60s
  (src/node/replica-handler-constants.js:17; wired
  src/node/replica-handler-class.js:140-142). This is the run-21 60s
  voter-ready timeout.
- "Voter ready" = the executor's IN-MEMORY tracked raft role is non-learner
  (`getTrackedReplicaRole`, voter-readiness-methods.js:188-208) — NOT the
  services-row raft_role.

So at raft level, promotion DOES precede source removal for ledger REPLACEs:
the remove phase cannot start until the replacement's local raft role left
LEARNER. **What lags is the actuals visibility**, see below.

**What LEARNER_PROMOTION_PRIORITY_RECOVERY_DELAY_MS gates.** It gates the
FIRST raft-level promotion check timer — real promotion, not just a
priority-recovery lane. `scheduleLearnerPromotion` arms a timer whose delay
comes from `resolveLearnerPromotionDelayMs`
(src/partition/partition-service-learner-promotion-methods.js:36-66, 84-101):

- INITIAL_DELAY: normally `LEARNER_PROMOTION_DELAY_MS` = 30s
  (src/partition/partition-service-constants.js:25), but for priority
  control-plane partitions (recovery pending, or
  `isPriorityControlPlaneFormationLearnerPromotion` — joining an existing
  group, learner-promotion-methods.js:120-126) it drops to
  `min(30s, LEARNER_PROMOTION_PRIORITY_RECOVERY_DELAY_MS=5s)`
  (partition-service-constants.js:26; instance wiring
  src/partition/partition-service-core-base.js:246-251).
- Deferred rechecks re-arm at `LEARNER_CATCH_UP_CHECK_INTERVAL_MS` = 1s
  (partition-service-constants.js:27).

`checkLearnerPromotion` (learner-promotion-methods.js:456-563) then requires a
discovered leader and the voter-count guards, and on success calls
`becomeFollower()` (lines 437-443) — the actual raft promotion. **The 5s floor
is a pure timer**: a fully caught-up learner still waits out the 5s before the
first promotion check.

**The even-voter promotion guard.** `maxAllowedVotersAfterPromotion =
targetReplicaCount + (replacementPromotionAllowed ||
singleVoterExpansionPromotionAllowed ? 1 : 0) +
priorityRecoveryAdditionalVotersAllowed`
(learner-promotion-methods.js:525-531); rejection when `activeVoterCount + 1 >
maxAllowed` or when the result would be even (lines 532-539, gate at 540-565).
Promote-BEFORE-remove for a single replacement is already an allowed shape:
`singleReplacementPromotionAllowed` (joining existing group or owned add-like
op, learnerCount===1, activeVoterCount>=target, lines 497-500) grants the +1
temporary overflow voter and exempts the even-count veto — this is exactly the
run-22 "intermediate 4-voter REPLACE state" acknowledged in the evaluator
header (operation-ledger-quorum-concentration.js:21-23).

**Who writes services.raft_role, and when.** Event-driven on role change, not
heartbeat and not periodic:

- `becomeFollower()` → `queueRoleUpdate(RaftRole.FOLLOWER)`
  (learner-promotion-methods.js:441) →
  `roleMutationHelper.queue(normalizePublishedRaftRole(role,
  {collapseLeaderToFollower:true}))`
  (src/partition/partition-service-metadata-delivery-methods.js:23-27).
- The helper is an `AuthoritativeRowMutationHelper` over the SERVICES row
  (`buildUpdateData: {raft_role, updated_at}`,
  src/partition/partition-service-core-base.js:579-648). `queue()` flushes
  immediately when a CDC integration service exists
  (src/raft/authoritative-row-mutation-helper.js:174-190), BUT the write is
  `deliveryPriority: BACKGROUND, workClass: BACKGROUND, allowPressureDefer:
  true` (core-base.js:600-607), requires the services-table leader to be
  writable (`isWriteReady: isServicesLeaderAvailable`, core-base.js:620;
  predicate metadata-delivery-methods.js:73-89), and retries with 1s-base
  backoff on failure (mutation-helper defaults, authoritative-row-mutation-helper.js:81-84).
- After the durable write commits, the coordinator's `systemTableCache` sees
  it via the CDC/metadata-publication round-trip — there is no direct
  coordinator-side push.
- CL-035 shortcut: when voter-ready fires, the EXECUTOR node seeds raft_role
  into its LOCAL cache row only
  (`seedLocalPriorityReplicaRaftRole`,
  src/node/replica-handler-voter-readiness-methods.js:155-160; impl
  src/node/replica-handler-create-methods.js:483-523, marked
  `markServiceRowLocalOnly` at line 521). This makes the executor-local
  remove-safety gate see the promotion, but does NOT update the
  admission-evaluating coordinator's cache.

**Can the op complete while the replacement is still a LEARNER in the
services rows?** At raft level no (the voter-ready gate precedes the remove
phase for critical partitions). But in the SERVICES-ROW actuals that the
concentration evaluator reads: yes — terminal REMOVED requires only the source
removal to complete; nothing in the STOPPING→REMOVED path waits for the
replacement's durable `raft_role` write to land and propagate. So the
coordinator can observe (source row gone/REMOVED) strictly BEFORE (replacement
row raft_role=follower), which is the run-27 2-visible-voter dip: with the
evaluator's arithmetic (majority = floor(2/2)+1 = 2, outside-hottest <= 1 < 2,
operation-ledger-quorum-concentration.js:129-131) ANY 2-voter state is
concentrated, and with a ready spare node it is also `spreadActionable`
(lines 139-154), so `holdEngaged` stays true until the raft_role actual
arrives.

## 3. Provisioning transient wait — budget, cadence, freshness

**Reason classification.** `TRANSIENT_PROVISIONING_SHORTFALL_REASONS` includes
`operation_ledger_quorum_concentrated`
(src/query/sql-query-engine-provisioning-admission-methods.js:7-24).
`hasOnlyTransientProvisioningShortfall` (same file, lines 202-247) requires
EVERY rejection to carry only transient reasons.

**Budgets (defaults, src/query/query-constants.js:427-429 +
src/query/sql-query-engine-instance-initializer.js:99-113):**

- `TABLE_CREATE_PROVISION_TIMEOUT_MS = 30s` → `tablePartitionProvisioningTimeoutMs`
  (the governing client-facing provisioning budget; also the default
  `timeoutBudget` created at
  src/query/sql-query-engine-initial-partition-provisioning.js:89-93).
- `TABLE_CREATE_PROVISION_POLL_INTERVAL_MS = 50ms` → retry cadence
  (`tablePartitionProvisioningPollIntervalMs`).
- `TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS = 1s` → the short inner
  convergence window, adaptively raised to
  `TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS = 10s`
  (src/query/sql-query-engine-shared.js:184) when enough active node rows
  already exist (`effectiveMaxWaitMs` logic,
  src/query/sql-query-engine-provision-target-methods.js:116-125).

**The wait pipeline** (src/query/sql-query-engine-initial-partition-provisioning.js:127-235):

1. `waitForProvisionTargetNodeIds` (line 145; impl
   sql-query-engine-provision-target-methods.js:89-222) polls
   `refreshResolution` every 50ms. Each poll re-resolves target nodes from the
   active-node cache AND re-runs `probeProvisioningTargetAdmission` (line
   143) — i.e. **every retry is a fresh read** of the systemTableCache-backed
   interlock evaluation. Success condition:
   `maximumProvisionableReplicaCount >= requiredReplicaCount` (lines 147-150).
2. If that window expires with `maximumProvisionableReplicaCount === 0` and
   ALL rejections transient, `waitOutWholeClusterTransientProvisioningHold`
   (lines 157-165; impl lines 691-728) re-enters the same poll loop with
   `maxWaitMs = tablePartitionProvisioningTimeoutMs` (line 724) — the run-24/25
   whole-cluster-hold extension. Same 50ms cadence, same fresh probe per poll.

**Progress-awareness: none.** The wait is a fixed budget with a boolean exit
condition. Visible partial progress (e.g. hold released on 1 of 2 required
targets, or a REPLACE step completing) does NOT extend the deadline; the only
"adaptive" element is the pre-wait promotion of the 1s window to 10s. The
deadline is bounded by the enclosing `timeoutBudget` via `waitForCondition`'s
`timeoutBudget` option (provision-target-methods.js:165-177).

**How 'required=2 provisionable=0' is produced.** Error text built in
`throwProvisioningInsufficientTargets`
(sql-query-engine-provisioning-admission-methods.js:306-313):
`required=${minimumRoutableReplicaCount}, provisionable=${maximumProvisionableReplicaCount}`.
For the demo CREATE (RF3, no explicit minimum), the quorum-minimum floor is
`minimumRoutableReplicaCount = 2`
(`resolveMinimumProvisioningReplicaCount` / quorum-count path,
sql-query-engine-provision-target-methods.js:30-45 with the RF3 quorum floor
from `resolveImplicitProvisioningFallbackReplicaCount` lines 56-75). At budget
end every candidate target was still interlock-deferred, so
`maximumPrecheckedProvisionableReplicaCount = routable(0) + admitted(0) = 0`
(initial-partition-provisioning.js:339-340). The fallback ladder requires
`maximumProvisionableReplicaCount > 0` AND `>= fallbackMinimum(=1 for
all-transient)` (lines 358-362 / 461-466); 0 fails both, so the create throws
at line 387 (precheck shortfall) or line 500 (post-planning shortfall). I.e.
the OWNED RESIDUAL comment at
sql-query-engine-provisioning-admission-methods.js:17-20 — "when EVERY target
is hold-deferred the create still fails fast with insufficient-targets" — is
exactly the run-27 outcome once even the extended (30s) whole-cluster wait was
exhausted while the hold stayed engaged.

## 4. Release-latency levers (honest map, no designs)

### (a) Count a caught-up learner / stop counting a REMOVING source

What exists today (evaluator, operation-ledger-quorum-concentration.js:20-29):
REMOVING rows count as voters by design ("still a raft voter until removal
completes", lines 21-23); learners never count (`QUORUM_VOTER_RAFT_ROLES` =
leader|follower|candidate, lines 27-29). Candidate actuals that already exist
without violating ARCH-0080/0084 (all are committed rows or established
observations, no new read paths):

- **replica_operations workflow_step** — the REPLACE's own ledger row reaching
  `replaceRemovePhase`/STOPPING is a committed actual implying the create
  phase (and therefore the raft-level voter-ready gate, section 2) succeeded.
  The interlock module ALREADY consumes replica_operations observations
  (`queryIncompleteOperations` / `getIncompleteOperationObservation`,
  rebalance-coordinator-ledger-interlock-admission.js:143-149), so this is
  REUSED observation machinery feeding an EXTENDED evaluator predicate.
- **CL-035 local seed** (replica-handler-create-methods.js:483-523) — exists
  but is executor-local only (`markServiceRowLocalOnly`); NOT visible to the
  coordinator. Making it visible would be NEW propagation (explicitly rejected
  direction per the avoid-secondary-caches directive — noted, not proposed).
- **Optimistic recovery-projection precedent** — the remove-safety evaluator's
  `COMPLETION_SAFE_FLOOR` scope already counts an optimistic node-union that
  "can include catch-up learners"
  (src/rebalancer/operation-workflow-remove-safety-evaluator.js:20-31,
  47-60). Precedent that a learner-inclusive projection exists elsewhere in
  the same safety domain; reusing its framing in the evaluator would be
  EXTENDED.
- There is NO raft-level "caught-up"/joint-config column in the services rows;
  the only durable raft membership actual is `raft_role`.

### (b) Ordering: promote-before-remove

Raft-level promote-before-remove ALREADY exists for ledger REPLACEs (section
2: voter-ready gate, transition-policy.js:44-47 + create-methods.js:818-836) —
REUSED. The even-voter guard `maxAllowedVotersAfterPromotion`
(learner-promotion-methods.js:525-531) already permits the single temporary
replacement overflow voter (lines 497-500), so promote-first does NOT trip it
in the 1-replacement case. What is NOT ordered is the DURABLE raft_role write
vs the source-removal write: both are independent background control-plane
writes, and the workflow's remove phase does not wait for the promotion's
services-row visibility (no code path in
operation-workflow-dispatch-response-reconcile.js:497-630 consults the
replacement's raft_role before STOPPING). A visibility-ordering step in the
REPLACE workflow would be NEW.

### (c) raft_role actuals write/propagation promptness

The write is prompt at queue time (immediate flush,
authoritative-row-mutation-helper.js:174-190) but rides the LOWEST delivery
class: `deliveryPriority: BACKGROUND, workClass: BACKGROUND,
allowPressureDefer: true` (partition-service-core-base.js:600-607) — during
formation pressure this write is explicitly deferrable, while the removal-side
status writes ride the operation workflow. Raising the delivery class for
priority control-plane partitions' role writes would be an EXTENDED lever on
existing machinery (`getMetadataPublicationWorkClass` already branches
CRITICAL vs BACKGROUND for the same partitions,
partition-service-metadata-delivery-methods.js:90-99 — the role helper simply
does not use it). Additionally the 5s promotion-timer floor
(LEARNER_PROMOTION_PRIORITY_RECOVERY_DELAY_MS,
partition-service-constants.js:26) is a fixed pre-promotion latency even for a
caught-up learner; making the initial check catch-up-driven instead of
timer-driven would EXTEND `resolveLearnerPromotionDelayMs`
(learner-promotion-methods.js:84-101).

### (d) Admission-side freshness

Already fresh: every probe re-evaluates from `this.systemTableCache`
(section 1) and every 50ms provisioning poll re-probes (section 3). There is
no admission-side caching to fix — the staleness is upstream (the raft_role
actual itself). The only admission-side lever is the wait shape: the
whole-cluster transient wait is a fixed budget, not progress-aware
(section 3), so a hold that releases 1s after budget end still fails the
CREATE; a progress-aware extension (visible spread progress in the
concentratedPartitions evidence) would EXTEND
`waitOutWholeClusterTransientProvisioningHold`
(sql-query-engine-initial-partition-provisioning.js:707-728).

## 5. Existing DT/test coverage (composition bases)

- **test/convergence/dt6-formation-ledger-quorum-spread-first.test.js** (704
  lines, tap) — deterministic formation scenario driver for THIS hold:
  run-22 gap (dependents hold while concentrated, line 534), fully
  seed-concentrated bootstrap (line 570), already-spread control never engages
  (line 610), concentration-without-feasible-target never holds (line 630),
  planner-gate cure planning (line 655), determinism check (line 692). Best
  composition base for a "hold releases promptly after spread completes"
  scenario.
- **test/query/sql-query-engine-provision-ledger-hold-transient-wait.test.js**
  (387 lines) — run-24 whole-cluster transient wait (line 131), never-clearing
  hold still bounded (line 183), non-transient fails fast (line 216),
  forensic message honesty (line 268), run-25 precheck-consults-interlock
  (line 309). Composition base for the provisioning-budget side.
- **test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js** —
  run-20 self-move serialization (referenced as the canonical repro at
  rebalance-coordinator-ledger-interlock-admission.js:24).
- **test/partition/partition-service-learner-promotion.test.js** and
  **test/convergence/dt6-voter-surplus-promotion-drain-livelock.test.js** —
  promotion-guard coverage (the latter exercises
  `maxAllowedVotersAfterPromotion`).
- No dedicated unit test imports
  `evaluateOperationLedgerQuorumConcentration` directly; the evaluator is
  covered only through the DT6 spread-first scenario driver.
