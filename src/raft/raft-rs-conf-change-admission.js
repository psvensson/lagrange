// Leader-port configuration-change admission and typed WP-P membership
// operations (ADMIT, LEARNER_CAUGHT_UP, GROWTH_PROMOTE, REPLACE_PROMOTE,
// WITHDRAW_PROMOTION, REMOVE_LEARNER), decided in the leader's queued turn.
import {deepFreeze} from './raft-operation-port.js';
import {
  RAFT_CATCH_UP_REQUEST_KIND,
  RAFT_FOUNDING_GROWTH_OUTCOME,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';
import {
  COMMITTED_REPLICA_ROLE,
  ascendingPeerIdOrder,
  projectPeerRole,
} from './raft-rs-committed-membership-read.js';
import {raftRsConfStateKey} from './raft-rs-conf-state-key.js';
import {
  ROLE,
  ROLE_LEADER,
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from './raft-rs-ready-loop-constants.js';

const TAKES_A_VOTER = Object.freeze(new Set([
  RAFT_RS_CONF_CHANGE_TYPE.REMOVE_NODE,
  RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
]));
const PROGRESS_STATE_REPLICATE = 'Replicate';
const AUTO_TRANSITION = 0;
const MIN_VOTER_TARGET = 1;
const MAX_GROWTH_PROMOTE_TARGETS = 2;
const PARITY_DIVISOR = 2;
const EVEN_PARITY_REMAINDER = 0;
const KEY_SEPARATOR = '\u0000';
const DIGEST_SEPARATOR = ',';
const WORKFLOW_STEP_PROMOTION_PENDING = 'PROMOTION_PENDING';
const WORKFLOW_STEP_PROMOTION_PROPOSED = 'PROMOTION_PROPOSED';
const ADMITTED_PROMOTION_STEPS = Object.freeze(new Set([
  WORKFLOW_STEP_PROMOTION_PENDING,
  WORKFLOW_STEP_PROMOTION_PROPOSED,
]));

function admissionRefusal(reason, retryable = false, extra = {}) {
  return deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    reason,
    phase: RUNTIME_PHASE.ADMISSION,
    retryable,
    recoveryRequired: false,
    ...extra,
  });
}

function confChangePendingDeferral() {
  return deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
    reason: RUNTIME_REASON.CONF_CHANGE_PENDING,
    phase: RUNTIME_PHASE.ADMISSION,
    retryable: true,
    recoveryRequired: false,
  });
}

function notLeaderRefusal(status, leaderReplicaIdOf) {
  return admissionRefusal(RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEADER, true, {
    leaderReplicaId: leaderReplicaIdOf(status.lead),
  });
}

function typedOk(reason, fields = {}) {
  return deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
    reason,
    status: reason,
    ...fields,
  });
}

/**
 * Compute V(r, H): the largest odd integer <= min(r, H), at least 1.
 * @param {number} replicationFactor - Declared replication factor r.
 * @param {number} [eligibleHosts] - Distinct eligible hosts H (defaults to r).
 * @return {number}
 */
function resolveVoterTargetCount(replicationFactor, eligibleHosts) {
  const r = Number.isInteger(replicationFactor) &&
    replicationFactor >= MIN_VOTER_TARGET ?
    replicationFactor : MIN_VOTER_TARGET;
  const h = Number.isInteger(eligibleHosts) &&
    eligibleHosts >= MIN_VOTER_TARGET ?
    eligibleHosts : r;
  const bounded = Math.max(MIN_VOTER_TARGET, Math.min(r, h));
  return bounded % PARITY_DIVISOR === EVEN_PARITY_REMAINDER ?
    Math.max(MIN_VOTER_TARGET, bounded - MIN_VOTER_TARGET) : bounded;
}

function computeBaseConfigurationDigest(voterPeerIds) {
  return [...(voterPeerIds || [])]
    .map(String)
    .sort(ascendingPeerIdOrder)
    .join(DIGEST_SEPARATOR);
}

function matchesBaseConfiguration(confState, operation) {
  const currentVoters = (confState?.voters || []).map(String);
  const currentDigest = computeBaseConfigurationDigest(currentVoters);
  if (Array.isArray(operation.baseVoterPeerIds) &&
      computeBaseConfigurationDigest(operation.baseVoterPeerIds) !==
        currentDigest) {
    return false;
  }
  const digest = operation.baseConfigurationDigest;
  if (typeof digest !== 'string' || digest.length === 0) {
    return true;
  }
  const baseOnlyKey = raftRsConfStateKey({
    voters: currentVoters,
    votersOutgoing: [],
    learners: [],
    learnersNext: [],
    autoLeave: false,
  });
  return digest === currentDigest ||
    digest === raftRsConfStateKey(confState) ||
    digest === baseOnlyKey;
}

function createLeadershipTenure(term) {
  return {
    term: String(term),
    c0ByRequestKey: new Map(),
    withdrawnOperationIds: new Set(),
    proposedPromotions: new Map(),
    operationSubjects: new Map(),
    peerOperationIds: new Map(),
  };
}

function syncLeadershipTenure(group, status) {
  if (ROLE[status.raftState] !== ROLE_LEADER) {
    group.tenure = null;
    return null;
  }
  const term = String(status.term);
  if (!group.tenure || group.tenure.term !== term) {
    group.tenure = createLeadershipTenure(term);
  }
  return group.tenure;
}

function leaderLogReferenceIndex(group, status) {
  const commit = BigInt(status.commit ?? 0);
  const last = BigInt(group?.persistedLastIndex ?? 0);
  const reference = last > commit ? last : commit;
  return reference > 0n ? reference : 1n;
}

function c0KeyOf(operationId, peerId, requestKind) {
  return `${operationId}${KEY_SEPARATOR}${peerId}${KEY_SEPARATOR}${requestKind}`;
}

function ensureCatchUpRecord(tenure, {operationId, peerId, requestKind,
  leaderLogIndex, perDrainReference = false}) {
  const key = c0KeyOf(operationId, peerId, requestKind);
  if (!tenure.c0ByRequestKey.has(key)) {
    tenure.c0ByRequestKey.set(key, {
      operationId,
      peerId: String(peerId),
      requestKind,
      c0: leaderLogIndex,
      perDrainReference: perDrainReference === true,
      caughtUp: false,
      caughtUpAtDrain: null,
      evaluations: 0,
    });
  }
  const record = tenure.c0ByRequestKey.get(key);
  if (record.perDrainReference || perDrainReference === true) {
    record.perDrainReference = true;
    record.c0 = leaderLogIndex;
  }
  return record;
}

function evaluatePeerCatchUp(status, record) {
  const progress = (status.progress || []).find((item) =>
    String(item?.id) === record.peerId);
  const state = progress?.state ?? null;
  const matched = BigInt(progress?.matched ?? 0);
  const caughtUp = state === PROGRESS_STATE_REPLICATE &&
    matched >= record.c0 && record.c0 >= 1n;
  record.evaluations += 1;
  if (caughtUp) {
    record.caughtUp = true;
  }
  return {
    caughtUp,
    c0: Number(record.c0),
    matchedIndex: Number(matched),
    state,
  };
}

/**
 * Re-evaluate every outstanding fixed-c0 catch-up request on each drain of the
 * leader's group, silently (no emission on pending). Clears the tenure record
 * when the replica is not leader or its term changed.
 * @param {Object} group - The runtime group.
 * @param {Object} status - The core's status after the drain.
 * @param {Object|null} confState - The core's applied ConfState.
 */
function evaluateTenureCatchUpOnDrain(group, status, confState) {
  const tenure = syncLeadershipTenure(group, status);
  if (tenure === null || confState === null) {
    return;
  }
  const learners = new Set((confState.learners || []).map(String));
  const leaderLogIndex = leaderLogReferenceIndex(group, status);
  for (const [key, record] of [...tenure.c0ByRequestKey.entries()]) {
    if (!learners.has(record.peerId)) {
      tenure.c0ByRequestKey.delete(key);
      continue;
    }
    if (record.perDrainReference) {
      record.c0 = leaderLogIndex;
    }
    const evaluated = evaluatePeerCatchUp(status, record);
    if (evaluated.caughtUp && record.caughtUpAtDrain === null) {
      record.caughtUpAtDrain = Number(group.appliedIndex ?? 0);
    }
  }
}

function hasAppliedOwnTermEntry(group, status) {
  if (ROLE[status.raftState] !== ROLE_LEADER) {
    return false;
  }
  const appliedIndex = BigInt(status.applied);
  if (appliedIndex <= 0n) {
    return false;
  }
  if (typeof group?.appliedTerm === 'bigint' && group.appliedTerm > 0n) {
    return group.appliedTerm === BigInt(status.term);
  }
  return appliedIndex >= BigInt(status.pendingConfIndex);
}

function leavesNoVoter(confState, change) {
  const steps = change?.changes || [];
  if (steps.length === 0) {
    return false;
  }
  const voters = new Set((confState?.voters || []).map(String));
  for (const {changeType, nodeId} of steps) {
    if (changeType === RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE) {
      voters.add(String(nodeId));
    } else if (TAKES_A_VOTER.has(changeType)) {
      voters.delete(String(nodeId));
    }
  }
  return voters.size === 0;
}

function takesLeaderOut(status, change) {
  return (change?.changes || []).some(({changeType, nodeId}) =>
    TAKES_A_VOTER.has(changeType) && String(nodeId) === String(status.id));
}

function hasPendingConfChange(status) {
  return BigInt(status.pendingConfIndex ?? 0) > BigInt(status.applied ?? 0);
}

function isConfChangeBusy(status, confState) {
  return hasPendingConfChange(status) ||
    (confState?.votersOutgoing || []).length > 0;
}

function hasNonEmptyContext(change) {
  return change?.context !== undefined &&
    change.context !== null &&
    change.context !== '';
}

function validMultiChangeEnvelope(change, steps) {
  const transition = change?.transition ?? AUTO_TRANSITION;
  return steps.length <= MAX_GROWTH_PROMOTE_TARGETS &&
    transition === AUTO_TRANSITION &&
    !hasNonEmptyContext(change);
}

function validLearnerPromotionStep(step, learners, voters, seen) {
  const id = String(step?.nodeId ?? '');
  if (step?.changeType !== RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE ||
      seen.has(id) || voters.has(id) || !learners.has(id)) {
    return false;
  }
  seen.add(id);
  return true;
}

function validMultiChangeLearnerPromotion(confState, change) {
  const steps = change?.changes || [];
  if (!validMultiChangeEnvelope(change, steps)) {
    return false;
  }
  const learners = new Set((confState?.learners || []).map(String));
  const voters = new Set((confState?.voters || []).map(String));
  const seen = new Set();
  return steps.every((step) =>
    validLearnerPromotionStep(step, learners, voters, seen));
}

function multiChangeRefusal(confState, change) {
  const steps = change?.changes || [];
  if (steps.length <= 1) {
    return null;
  }
  if (!validMultiChangeLearnerPromotion(confState, change)) {
    return admissionRefusal(
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.MULTI_CHANGE_SHAPE_REFUSED, false);
  }
  const union = new Set((confState?.voters || []).map(String));
  for (const step of steps) {
    union.add(String(step.nodeId));
  }
  return union.size % PARITY_DIVISOR === EVEN_PARITY_REMAINDER ?
    admissionRefusal(
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.PROMOTION_WOULD_BE_EVEN, false) :
    null;
}

/**
 * The answer to a conf-change proposal the core must not be handed, or null
 * when the leader's core takes it.
 * @param {Object} observed - {status, confState, change, leaderReplicaIdOf}.
 * @return {Object|null}
 */
function confChangeProposalRefusal({status, confState, change,
  leaderReplicaIdOf}) {
  if (ROLE[status.raftState] !== ROLE_LEADER) {
    return notLeaderRefusal(status, leaderReplicaIdOf);
  }
  if (leavesNoVoter(confState, change)) {
    return admissionRefusal(
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LAST_VOTER, false);
  }
  const multiRefusal = multiChangeRefusal(confState, change);
  if (multiRefusal !== null) {
    return multiRefusal;
  }
  const joint = (confState?.votersOutgoing || []).length > 0;
  const leavesJoint = (change?.changes || []).length === 0;
  if (hasPendingConfChange(status) || (joint && !leavesJoint)) {
    return confChangePendingDeferral();
  }
  if (takesLeaderOut(status, change)) {
    return admissionRefusal(
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LEADER, true);
  }
  return null;
}

function recordOperationSubjects(tenure, operationId, peerIds) {
  if (typeof operationId !== 'string' || operationId.length === 0) return;
  const existing = tenure.operationSubjects.get(operationId) || [];
  const merged = [...new Set([...existing, ...peerIds.map(String)])];
  tenure.operationSubjects.set(operationId, merged);
}

function recordPeerOperationBinding(tenure, peerId, operationId) {
  if (!tenure || typeof operationId !== 'string' || operationId.length === 0) {
    return;
  }
  tenure.peerOperationIds.set(String(peerId), operationId);
  recordOperationSubjects(tenure, operationId, [peerId]);
}

function resolvePeerOperationId(tenure, operation, peerId) {
  const bindings = operation.promotionBindings || [];
  const bound = bindings.find((b) => b.peerId === String(peerId));
  if (bound?.operationId) return bound.operationId;
  const peerOpId = tenure.peerOperationIds.get(String(peerId));
  return peerOpId ? peerOpId : operation.operationId;
}

function collectPromotionOperationIds(tenure, operation, peerIds) {
  const ids = new Set(operation.operationIds || [operation.operationId]);
  for (const peerId of peerIds) {
    const opId = resolvePeerOperationId(tenure, operation, peerId);
    if (opId) ids.add(opId);
    const admittedOpId = tenure.peerOperationIds.get(String(peerId));
    if (admittedOpId) ids.add(admittedOpId);
  }
  return [...ids];
}

function hasMismatchedPromotionBinding(tenure, operation) {
  const bindings = operation.promotionBindings || [];
  return bindings.some((b) => {
    const admitted = tenure.peerOperationIds.get(String(b.peerId));
    return Boolean(admitted && admitted !== b.operationId);
  });
}

function isWithdrawingOperation(tenure, operation, peerIds = []) {
  if (hasMismatchedPromotionBinding(tenure, operation)) return true;
  const opIds = collectPromotionOperationIds(tenure, operation, peerIds);
  if (opIds.some((opId) => tenure.withdrawnOperationIds.has(opId))) {
    return true;
  }
  return operation.workflowStep !== undefined &&
    !ADMITTED_PROMOTION_STEPS.has(operation.workflowStep);
}

function decideLearnerAdmit({tenure, status, confState, operation}) {
  if (operation.kind === RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER &&
      String(operation.peerId) === String(status.id)) {
    return {
      immediate: admissionRefusal(
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LEADER, true),
    };
  }
  recordPeerOperationBinding(tenure, operation.peerId, operation.operationId);
  const role = projectPeerRole(confState, operation.peerId);
  if (role === COMMITTED_REPLICA_ROLE.VOTER) {
    return {
      immediate: typedOk(RAFT_FOUNDING_GROWTH_OUTCOME.ALREADY_VOTER, {
        role, peerId: String(operation.peerId),
        replicaIdentity: operation.replicaIdentity,
      }),
    };
  }
  if (role === COMMITTED_REPLICA_ROLE.LEARNER) {
    return {
      immediate: typedOk(RAFT_FOUNDING_GROWTH_OUTCOME.LEARNER_ADMITTED, {
        role, peerId: String(operation.peerId),
        replicaIdentity: operation.replicaIdentity,
      }),
    };
  }
  if (isConfChangeBusy(status, confState)) {
    return {immediate: confChangePendingDeferral()};
  }
  return {
    change: operation.change,
    onDrained: () => typedOk(RAFT_FOUNDING_GROWTH_OUTCOME.LEARNER_PROPOSED, {
      role: COMMITTED_REPLICA_ROLE.LEARNER,
      peerId: String(operation.peerId),
      replicaIdentity: operation.replicaIdentity,
    }),
  };
}

function decideLearnerCaughtUp({group, tenure, status, confState, operation}) {
  const learners = new Set((confState?.learners || []).map(String));
  const peerId = String(operation.peerId);
  if (!learners.has(peerId)) {
    return {
      immediate: admissionRefusal(
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEARNER, false),
    };
  }
  recordPeerOperationBinding(tenure, peerId, operation.operationId);
  const record = ensureCatchUpRecord(tenure, {
    operationId: operation.operationId,
    peerId,
    requestKind: operation.requestKind,
    leaderLogIndex: leaderLogReferenceIndex(group, status),
    perDrainReference: operation.perDrainReference,
  });
  const evaluated = evaluatePeerCatchUp(status, record);
  const outcomeReason = evaluated.caughtUp ?
    RAFT_FOUNDING_GROWTH_OUTCOME.CAUGHT_UP :
    RAFT_FOUNDING_GROWTH_OUTCOME.CATCH_UP_PENDING;
  return {
    immediate: typedOk(outcomeReason, {
      caughtUp: evaluated.caughtUp,
      operationId: operation.operationId,
      peerId,
      replicaIdentity: operation.replicaIdentity ?? null,
      c0: evaluated.c0,
      referenceIndex: evaluated.c0,
      matchedIndex: evaluated.matchedIndex,
      state: evaluated.state,
    }),
  };
}

function promotionPreconditionRefusal({group, tenure, status, confState,
  operation, peerIds = []}) {
  if (isWithdrawingOperation(tenure, operation, peerIds)) {
    return admissionRefusal(
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.OPERATION_WITHDRAWING, false);
  }
  if (!hasAppliedOwnTermEntry(group, status)) {
    return admissionRefusal(
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.LEADER_TERM_UNAPPLIED, true);
  }
  if (isConfChangeBusy(status, confState)) {
    return confChangePendingDeferral();
  }
  if (!matchesBaseConfiguration(confState, operation)) {
    return admissionRefusal(
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.BASE_CONFIGURATION_CHANGED, false);
  }
  return null;
}

function evaluatePromotionCatchUp({group, tenure, status, operation, peerIds,
  requestKind}) {
  const leaderLogIndex = leaderLogReferenceIndex(group, status);
  const evaluations = peerIds.map((peerId) => evaluatePeerCatchUp(
    status,
    ensureCatchUpRecord(tenure, {
      operationId: resolvePeerOperationId(tenure, operation, peerId),
      peerId,
      requestKind,
      leaderLogIndex,
      perDrainReference: operation.perDrainReference,
    }),
  ));
  return evaluations.some((item) => !item.caughtUp) ?
    admissionRefusal(
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.PROMOTION_PROGRESS_BEHIND,
      true,
      {c0: evaluations[0].c0},
    ) : null;
}

function buildPromotionProposalDecision({tenure, operation, peerIds,
  requestKind}) {
  const promotedPeerIds = Object.freeze(peerIds.map(String));
  const opIds = collectPromotionOperationIds(tenure, operation, promotedPeerIds);
  return {
    change: deepFreeze({
      transition: AUTO_TRANSITION,
      changes: promotedPeerIds.map((nodeId) => deepFreeze({
        changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE,
        nodeId,
      })),
    }),
    onAccepted: () => {
      for (const opId of opIds) {
        tenure.proposedPromotions.set(opId, {
          peerIds: promotedPeerIds,
          kind: requestKind,
        });
      }
    },
    onDrained: () => typedOk(RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_PROPOSED, {
      operationId: operation.operationId,
      promotedPeerIds,
    }),
  };
}

function validGrowthPromoteShape(operation, peerIds) {
  return operation.invalidMultiChangeShape !== true &&
    peerIds.length > 0 &&
    peerIds.length <= MAX_GROWTH_PROMOTE_TARGETS &&
    new Set(peerIds).size === peerIds.length;
}

function growthTargetRefusal(confState, peerIds) {
  const learners = new Set((confState?.learners || []).map(String));
  if (peerIds.some((peerId) => !learners.has(peerId))) {
    return admissionRefusal(
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEARNER, false);
  }
  const union = new Set([
    ...(confState?.voters || []).map(String),
    ...peerIds,
  ]);
  return union.size % PARITY_DIVISOR === EVEN_PARITY_REMAINDER ?
    admissionRefusal(
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.PROMOTION_WOULD_BE_EVEN, false) :
    null;
}

function decideGrowthPromote({group, tenure, status, confState, operation}) {
  const peerIds = (operation.promotePeerIds || []).map(String);
  if (!validGrowthPromoteShape(operation, peerIds)) {
    return {
      immediate: admissionRefusal(
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.MULTI_CHANGE_SHAPE_REFUSED, false),
    };
  }
  for (const opId of collectPromotionOperationIds(tenure, operation, peerIds)) {
    recordOperationSubjects(tenure, opId, peerIds);
  }
  const precondition = promotionPreconditionRefusal({
    group, tenure, status, confState, operation, peerIds,
  }) ?? growthTargetRefusal(confState, peerIds) ??
    evaluatePromotionCatchUp({
      group, tenure, status, operation, peerIds,
      requestKind: RAFT_CATCH_UP_REQUEST_KIND.GROWTH_PROMOTE,
    });
  if (precondition !== null) {
    return {immediate: precondition};
  }
  return buildPromotionProposalDecision({
    tenure, operation, peerIds,
    requestKind: RAFT_CATCH_UP_REQUEST_KIND.GROWTH_PROMOTE,
  });
}

function replaceTargetCountRefused(voters, operation) {
  const expected = operation.targetVoterCount;
  if (expected !== null && voters.length !== expected) {
    return true;
  }
  return voters.length < MIN_VOTER_TARGET ||
    voters.length % PARITY_DIVISOR === EVEN_PARITY_REMAINDER;
}

function decideReplacePromote({group, tenure, status, confState, operation}) {
  const targetPeerId = String(operation.targetPeerId);
  recordOperationSubjects(tenure, operation.operationId, [targetPeerId]);
  const precondition = promotionPreconditionRefusal({
    group, tenure, status, confState, operation,
  });
  if (precondition !== null) {
    return {immediate: precondition};
  }
  const voters = (confState?.voters || []).map(String);
  if (replaceTargetCountRefused(voters, operation)) {
    return {
      immediate: admissionRefusal(
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.REPLACE_PROMOTE_NOT_AT_TARGET, false),
    };
  }
  if (operation.sourcePeerId !== null &&
      !voters.includes(String(operation.sourcePeerId))) {
    return {
      immediate: admissionRefusal(
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.BASE_CONFIGURATION_CHANGED, false),
    };
  }
  const learners = new Set((confState?.learners || []).map(String));
  if (!learners.has(targetPeerId)) {
    return {
      immediate: admissionRefusal(
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEARNER, false),
    };
  }
  const behind = evaluatePromotionCatchUp({
    group, tenure, status, operation, peerIds: [targetPeerId],
    requestKind: RAFT_CATCH_UP_REQUEST_KIND.REPLACE_PROMOTE,
  });
  if (behind !== null) {
    return {immediate: behind};
  }
  return buildPromotionProposalDecision({
    tenure, operation, peerIds: [targetPeerId],
    requestKind: RAFT_CATCH_UP_REQUEST_KIND.REPLACE_PROMOTE,
  });
}

function collectOperationSubjects(tenure, operation) {
  const subjects = new Set([
    ...(operation.promotePeerIds || []).map(String),
    ...(tenure.operationSubjects.get(operation.operationId) || []),
  ]);
  for (const [key, record] of [...tenure.c0ByRequestKey.entries()]) {
    if (record.operationId === operation.operationId) {
      subjects.add(record.peerId);
      tenure.c0ByRequestKey.delete(key);
    }
  }
  return [...subjects];
}

function decideWithdrawPromotion({group, tenure, status, confState,
  operation}) {
  if (!hasAppliedOwnTermEntry(group, status)) {
    return {
      immediate: admissionRefusal(
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.LEADER_TERM_UNAPPLIED, true),
    };
  }
  const subjects = collectOperationSubjects(tenure, operation);
  if (subjects.length === 0 &&
      !tenure.proposedPromotions.has(operation.operationId)) {
    return {
      immediate: admissionRefusal(
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.TARGET_IDENTITY_REQUIRED, false),
    };
  }
  tenure.withdrawnOperationIds.add(operation.operationId);
  const learners = new Set((confState?.learners || []).map(String));
  const allStillLearners = subjects.length > 0 &&
    subjects.every((peerId) => learners.has(peerId));
  const inLog = tenure.proposedPromotions.has(operation.operationId) ||
    isConfChangeBusy(status, confState) ||
    !allStillLearners;
  const reason = inLog ?
    RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_IN_LOG :
    RAFT_FOUNDING_GROWTH_OUTCOME.WITHDRAWN;
  return {
    immediate: typedOk(reason, {
      operationId: operation.operationId,
      withdrawn: !inLog,
      promotionInLog: inLog,
    }),
  };
}

function decideRemoveLearner({status, confState, operation}) {
  const peerId = String(operation.peerId);
  const role = projectPeerRole(confState, peerId);
  if (role !== COMMITTED_REPLICA_ROLE.LEARNER) {
    return {
      immediate: admissionRefusal(
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEARNER, false),
    };
  }
  if (isConfChangeBusy(status, confState)) {
    return {immediate: confChangePendingDeferral()};
  }
  return {
    change: deepFreeze({
      transition: AUTO_TRANSITION,
      changes: [deepFreeze({
        changeType: RAFT_RS_CONF_CHANGE_TYPE.REMOVE_NODE,
        nodeId: peerId,
      })],
    }),
    onDrained: () => typedOk(
      RAFT_FOUNDING_GROWTH_OUTCOME.LEARNER_REMOVAL_PROPOSED,
      {
        peerId,
        replicaIdentity: operation.replicaIdentity ?? null,
        domain: RAFT_FOUNDING_GROWTH_OUTCOME.NOT_A_VOTER_REMOVAL,
        classification: RAFT_FOUNDING_GROWTH_OUTCOME.NOT_A_VOTER_REMOVAL,
      },
    ),
  };
}

const TYPED_OPERATION_DECIDERS = Object.freeze({
  [RAFT_MEMBERSHIP_OPERATION.ADMIT]: decideLearnerAdmit,
  [RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER]: decideLearnerAdmit,
  [RAFT_MEMBERSHIP_OPERATION.LEARNER_CAUGHT_UP]: decideLearnerCaughtUp,
  [RAFT_MEMBERSHIP_OPERATION.GROWTH_PROMOTE]: decideGrowthPromote,
  [RAFT_MEMBERSHIP_OPERATION.REPLACE_PROMOTE]: decideReplacePromote,
  [RAFT_MEMBERSHIP_OPERATION.WITHDRAW_PROMOTION]: decideWithdrawPromotion,
  [RAFT_MEMBERSHIP_OPERATION.REMOVE_LEARNER]: decideRemoveLearner,
});

function decideTypedConfChangeOperation({group, status, confState, operation,
  leaderReplicaIdOf}) {
  const tenure = syncLeadershipTenure(group, status);
  if (tenure === null) {
    return {immediate: notLeaderRefusal(status, leaderReplicaIdOf)};
  }
  const decider = TYPED_OPERATION_DECIDERS[operation?.kind];
  if (typeof decider !== 'function') {
    return {
      immediate: admissionRefusal(
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.UNKNOWN_OPERATION, false),
    };
  }
  return decider({group, tenure, status, confState, operation});
}

function confChangeSettlement({before, now, confChangeEntries,
  appliedIndex}) {
  const pendingNow = hasPendingConfChange(now);
  const windowClosed = Boolean(before) && hasPendingConfChange(before) &&
    !pendingNow;
  if (confChangeEntries === 0 && !windowClosed) {
    return null;
  }
  return deepFreeze({
    appliedIndex: Number(appliedIndex),
    confChangeEntries,
  });
}

export {
  computeBaseConfigurationDigest,
  confChangeProposalRefusal,
  confChangeSettlement,
  decideTypedConfChangeOperation,
  evaluateTenureCatchUpOnDrain,
  resolveVoterTargetCount,
  syncLeadershipTenure,
};
