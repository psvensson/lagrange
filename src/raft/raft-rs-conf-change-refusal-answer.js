// The leader's port's answer to a configuration-change proposal or a typed
// membership operation, decided in the proposal's own queued turn, together
// with the port's canonical request normalizer.
//
// The core is entered only through the runtime owner's injected functions.

import {
  confChangeProposalRefusal,
  decideTypedConfChangeOperation,
  resolveVoterTargetCount,
} from './raft-rs-conf-change-admission.js';
import {encodeCommittedAdmissionContext} from
  './raft-rs-committed-membership-context.js';
import {deepFreeze} from './raft-operation-port.js';
import {
  RAFT_CATCH_UP_REQUEST_KIND,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from './raft-rs-ready-loop-constants.js';
import {CORE_OPERATION} from './raft-rs-runtime-owner-constants.js';
import {continueTurn, settledTurn} from './raft-rs-turn-answer.js';

const {CORE_OK, CORE_REFUSED} = RAFT_OPERATION_OUTCOME;
const PROPOSE_CONF_CHANGE_V2 = 'propose_conf_change_v2';

const ADMITTING_CHANGE_TYPES = Object.freeze(new Set([
  RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE,
  RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
]));

const CANONICAL_MEMBERSHIP_OPERATION_TYPE = Object.freeze({
  [RAFT_MEMBERSHIP_OPERATION.ADD_PEER]: RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
  ADD_PEER: RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
  [RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER]: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
  REMOVE_PEER: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
  [RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER]: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER,
  ADD_LEARNER: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER,
  [RAFT_MEMBERSHIP_OPERATION.ADMIT]: RAFT_MEMBERSHIP_OPERATION.ADMIT,
  ADMIT: RAFT_MEMBERSHIP_OPERATION.ADMIT,
  [RAFT_MEMBERSHIP_OPERATION.LEARNER_CAUGHT_UP]:
    RAFT_MEMBERSHIP_OPERATION.LEARNER_CAUGHT_UP,
  LEARNER_CAUGHT_UP: RAFT_MEMBERSHIP_OPERATION.LEARNER_CAUGHT_UP,
  [RAFT_MEMBERSHIP_OPERATION.GROWTH_PROMOTE]:
    RAFT_MEMBERSHIP_OPERATION.GROWTH_PROMOTE,
  GROWTH_PROMOTE: RAFT_MEMBERSHIP_OPERATION.GROWTH_PROMOTE,
  [RAFT_MEMBERSHIP_OPERATION.REPLACE_PROMOTE]:
    RAFT_MEMBERSHIP_OPERATION.REPLACE_PROMOTE,
  REPLACE_PROMOTE: RAFT_MEMBERSHIP_OPERATION.REPLACE_PROMOTE,
  [RAFT_MEMBERSHIP_OPERATION.WITHDRAW_PROMOTION]:
    RAFT_MEMBERSHIP_OPERATION.WITHDRAW_PROMOTION,
  WITHDRAW_PROMOTION: RAFT_MEMBERSHIP_OPERATION.WITHDRAW_PROMOTION,
  [RAFT_MEMBERSHIP_OPERATION.REMOVE_LEARNER]:
    RAFT_MEMBERSHIP_OPERATION.REMOVE_LEARNER,
  REMOVE_LEARNER: RAFT_MEMBERSHIP_OPERATION.REMOVE_LEARNER,
});

// The transfer a leader steps when it refuses a change that takes the
// leader itself out.
const LEADER_REMOVAL_HANDOFF = deepFreeze({
  successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.MOST_CAUGHT_UP});

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function resolvePeerIdFromInput(registry, replicaIdentity, directPeerId) {
  if (nonEmptyString(directPeerId)) {
    return {
      peerId: String(directPeerId),
      replicaIdentity: replicaIdentity ?? null,
    };
  }
  if (!nonEmptyString(replicaIdentity)) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_REPLICA_IDENTITY};
  }
  const peerId = registry.raftPeerIdOf(replicaIdentity);
  if (peerId === null) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.PEER_UNRESERVED};
  }
  return {peerId: String(peerId), replicaIdentity};
}

function resolvePeerIdList(registry, replicaIdentities, directPeerIds) {
  if (Array.isArray(directPeerIds)) {
    return {peerIds: directPeerIds.map(String)};
  }
  if (!Array.isArray(replicaIdentities)) {
    return {peerIds: []};
  }
  const peerIds = [];
  for (const identity of replicaIdentities) {
    if (!nonEmptyString(identity)) {
      return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_REPLICA_IDENTITY};
    }
    const peerId = registry.raftPeerIdOf(identity);
    if (peerId === null) {
      return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.PEER_UNRESERVED};
    }
    peerIds.push(String(peerId));
  }
  return {peerIds};
}

function resolveBaseVoterPeerIds(registry, change) {
  if (Array.isArray(change?.baseVoterPeerIds)) {
    return {peerIds: change.baseVoterPeerIds.map(String)};
  }
  const identities = change?.baseVoters ?? change?.expectedVoters;
  if (!Array.isArray(identities)) {
    return {peerIds: null};
  }
  return resolvePeerIdList(registry, identities, null);
}

function firstInteger(candidates) {
  return candidates.find((candidate) => Number.isInteger(candidate)) ?? null;
}

function resolveReplaceTargetCount(change) {
  const explicit = firstInteger([
    change?.targetVoterCount,
    change?.voterTarget,
    change?.expectedVoterCount,
  ]);
  if (explicit !== null) {
    return explicit;
  }
  const r = firstInteger([change?.replicationFactor, change?.r]);
  if (r === null) {
    return null;
  }
  const h = firstInteger([change?.eligibleHostCount, change?.hosts, change?.H]) ?? r;
  return resolveVoterTargetCount(r, h);
}

function normalizeLearnerAdmit(kind, change, registry) {
  if (!nonEmptyString(change.replicaIdentity)) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_REPLICA_IDENTITY};
  }
  if (!nonEmptyString(change.nodeId)) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_NODE_ID};
  }
  const peerId = registry.raftPeerIdOf(change.replicaIdentity);
  if (peerId === null) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.PEER_UNRESERVED};
  }
  return {
    typedOperation: deepFreeze({
      kind,
      operationId: change.operationId ?? null,
      replicaIdentity: change.replicaIdentity,
      peerId: String(peerId),
      nodeId: change.nodeId,
      change: deepFreeze({
        transition: 0,
        changes: [deepFreeze({
          changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
          nodeId: String(peerId),
        })],
        context: encodeCommittedAdmissionContext({
          replicaIdentity: change.replicaIdentity,
          peerId: String(peerId),
          nodeId: change.nodeId,
        }),
      }),
    }),
  };
}

function normalizeLearnerCaughtUp(change, registry) {
  if (!nonEmptyString(change.operationId)) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_OPERATION_ID};
  }
  const resolved = resolvePeerIdFromInput(
    registry,
    change.replicaIdentity ?? change.peer,
    change.peerId,
  );
  if (resolved.refusal !== undefined) {
    return resolved;
  }
  return {
    typedOperation: deepFreeze({
      kind: RAFT_MEMBERSHIP_OPERATION.LEARNER_CAUGHT_UP,
      operationId: change.operationId,
      replicaIdentity: resolved.replicaIdentity,
      peerId: resolved.peerId,
      requestKind: nonEmptyString(change.requestKind) ?
        change.requestKind :
        RAFT_CATCH_UP_REQUEST_KIND.LEARNER_CAUGHT_UP,
      perDrainReference: change.perDrainReference === true,
    }),
  };
}

function resolveAllOperationIds(change) {
  const ids = [];
  if (nonEmptyString(change.operationId)) {
    ids.push(change.operationId);
  }
  if (Array.isArray(change.operationIds)) {
    for (const id of change.operationIds) {
      if (nonEmptyString(id)) ids.push(id);
    }
  }
  if (Array.isArray(change.promotions)) {
    for (const item of change.promotions) {
      if (nonEmptyString(item?.operationId)) {
        ids.push(item.operationId);
      }
    }
  }
  return [...new Set(ids)];
}

function resolvePrimaryOperationId(change) {
  const [first] = resolveAllOperationIds(change);
  return first ?? null;
}

function resolvePromotionBindings(change, registry) {
  if (!Array.isArray(change.promotions)) {
    return [];
  }
  const bindings = [];
  for (const item of change.promotions) {
    if (!item || typeof item !== 'object' || !nonEmptyString(item.operationId)) {
      continue;
    }
    const identity = extractPromotionIdentity(item);
    const resolved = resolvePeerIdFromInput(registry, identity, item.peerId);
    if (resolved.refusal === undefined) {
      bindings.push(deepFreeze({
        operationId: item.operationId,
        peerId: String(resolved.peerId),
      }));
    }
  }
  return bindings;
}

function extractPromotionIdentity(item) {
  if (nonEmptyString(item)) return item;
  if (!item || typeof item !== 'object') return null;
  if (nonEmptyString(item.replicaIdentity)) return item.replicaIdentity;
  if (nonEmptyString(item.replicaId)) return item.replicaId;
  return null;
}

function extractTargetIdentities(change) {
  const listCandidate = [
    change.promoteReplicaIds,
    change.replicaIdentities,
    change.promotions,
    change.targets,
  ].find((item) => Array.isArray(item));
  if (Array.isArray(listCandidate)) {
    return listCandidate.map(extractPromotionIdentity);
  }
  if (nonEmptyString(change.replicaIdentity)) {
    return [change.replicaIdentity];
  }
  if (nonEmptyString(change.replicaId)) {
    return [change.replicaId];
  }
  return null;
}

function resolveBaseConfigurationDigest(change) {
  return firstNonEmptyString([
    change.baseConfigurationDigest,
    change.expectedBaseConfig,
    change.expectedEpoch,
  ]);
}

function normalizeGrowthPromote(change, registry) {
  const operationIds = resolveAllOperationIds(change);
  if (operationIds.length === 0) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_OPERATION_ID};
  }
  const [operationId] = operationIds;
  const targets = resolvePeerIdList(
    registry,
    extractTargetIdentities(change),
    change.promotePeerIds ?? change.peerIds,
  );
  if (targets.refusal !== undefined) {
    return targets;
  }
  const baseVoters = resolveBaseVoterPeerIds(registry, change);
  if (baseVoters.refusal !== undefined) {
    return baseVoters;
  }
  const invalidMultiChangeShape = change.invalidMultiChangeShape === true ||
    (change.transition !== undefined && change.transition !== 0) ||
    (change.context !== undefined && change.context !== null &&
      change.context !== '');
  return {
    typedOperation: deepFreeze({
      kind: RAFT_MEMBERSHIP_OPERATION.GROWTH_PROMOTE,
      operationId,
      operationIds: Object.freeze(operationIds),
      promotionBindings: Object.freeze(resolvePromotionBindings(change, registry)),
      promotePeerIds: Object.freeze(targets.peerIds),
      baseConfigurationDigest: resolveBaseConfigurationDigest(change),
      baseVoterPeerIds: baseVoters.peerIds === null ? null :
        Object.freeze(baseVoters.peerIds),
      workflowStep: change.workflowStep,
      invalidMultiChangeShape,
      perDrainReference: change.perDrainReference === true,
    }),
  };
}

function firstNonEmptyString(candidates) {
  return candidates.find((candidate) => nonEmptyString(candidate)) ?? null;
}

function resolveOptionalSourcePeerId(registry, change) {
  const sourceIdentity = firstNonEmptyString([
    change.sourceReplicaIdentity,
    change.sourceReplicaId,
    change.source,
  ]);
  if (!nonEmptyString(change.sourcePeerId) && sourceIdentity === null) {
    return {peerId: null};
  }
  return resolvePeerIdFromInput(registry, sourceIdentity, change.sourcePeerId);
}

function normalizeReplacePromote(change, registry) {
  if (!nonEmptyString(change.operationId)) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_OPERATION_ID};
  }
  const target = resolvePeerIdFromInput(
    registry,
    firstNonEmptyString([
      change.targetReplicaIdentity,
      change.targetReplicaId,
      change.target,
      change.replicaIdentity,
    ]),
    change.targetPeerId,
  );
  if (target.refusal !== undefined) return target;
  const source = resolveOptionalSourcePeerId(registry, change);
  if (source.refusal !== undefined) return source;
  const baseVoters = resolveBaseVoterPeerIds(registry, change);
  if (baseVoters.refusal !== undefined) return baseVoters;
  return {
    typedOperation: deepFreeze({
      kind: RAFT_MEMBERSHIP_OPERATION.REPLACE_PROMOTE,
      operationId: change.operationId,
      targetPeerId: target.peerId,
      sourcePeerId: source.peerId,
      targetVoterCount: resolveReplaceTargetCount(change),
      baseConfigurationDigest: change.baseConfigurationDigest ?? null,
      baseVoterPeerIds: baseVoters.peerIds === null ? null :
        Object.freeze(baseVoters.peerIds),
      workflowStep: change.workflowStep,
      perDrainReference: change.perDrainReference === true,
    }),
  };
}

function normalizeWithdrawPromotion(change, registry) {
  const operationId = resolvePrimaryOperationId(change);
  if (operationId === null) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_OPERATION_ID};
  }
  const targets = resolvePeerIdList(
    registry,
    extractTargetIdentities(change),
    change.promotePeerIds ?? change.peerIds,
  );
  if (targets.refusal !== undefined) {
    return targets;
  }
  return {
    typedOperation: deepFreeze({
      kind: RAFT_MEMBERSHIP_OPERATION.WITHDRAW_PROMOTION,
      operationId,
      promotePeerIds: Object.freeze(targets.peerIds),
    }),
  };
}

function normalizeRemoveLearner(change, registry) {
  const resolved = resolvePeerIdFromInput(
    registry,
    change.replicaIdentity ?? change.subject ?? change.targetReplicaId,
    change.peerId,
  );
  if (resolved.refusal !== undefined) {
    return resolved;
  }
  return {
    typedOperation: deepFreeze({
      kind: RAFT_MEMBERSHIP_OPERATION.REMOVE_LEARNER,
      operationId: change.operationId ?? null,
      replicaIdentity: resolved.replicaIdentity,
      peerId: resolved.peerId,
      expectedNodeId: change.expectedNodeId,
    }),
  };
}

const TYPED_CONF_CHANGE_NORMALIZERS = Object.freeze({
  [RAFT_MEMBERSHIP_OPERATION.ADMIT]: (change, registry) =>
    normalizeLearnerAdmit(RAFT_MEMBERSHIP_OPERATION.ADMIT, change, registry),
  [RAFT_MEMBERSHIP_OPERATION.LEARNER_CAUGHT_UP]: normalizeLearnerCaughtUp,
  [RAFT_MEMBERSHIP_OPERATION.GROWTH_PROMOTE]: normalizeGrowthPromote,
  [RAFT_MEMBERSHIP_OPERATION.REPLACE_PROMOTE]: normalizeReplacePromote,
  [RAFT_MEMBERSHIP_OPERATION.WITHDRAW_PROMOTION]: normalizeWithdrawPromotion,
  [RAFT_MEMBERSHIP_OPERATION.REMOVE_LEARNER]: normalizeRemoveLearner,
});

/**
 * Normalize a port.proposeConfChange request into {change}, {typedOperation},
 * or {refusal}.
 * @param {Object} change - The caller's request.
 * @param {Object} registry - This replica's peer-identity registry.
 * @return {Object}
 */
function normalizedConfChange(change, registry) {
  if (Array.isArray(change?.changes)) {
    return {change: deepFreeze({...change, changes: change.changes.map(
      (item) => deepFreeze({...item}))})};
  }
  const canonicalType = CANONICAL_MEMBERSHIP_OPERATION_TYPE[change?.type];
  if (canonicalType === undefined) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.UNKNOWN_OPERATION};
  }
  if (Object.hasOwn(TYPED_CONF_CHANGE_NORMALIZERS, canonicalType)) {
    return TYPED_CONF_CHANGE_NORMALIZERS[canonicalType](change, registry);
  }
  const changeType = {
    [RAFT_MEMBERSHIP_OPERATION.ADD_PEER]: RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE,
    [RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER]:
      RAFT_RS_CONF_CHANGE_TYPE.REMOVE_NODE,
    [RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER]:
      RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
  }[canonicalType];
  if (!nonEmptyString(change.replicaIdentity)) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_REPLICA_IDENTITY};
  }
  const admits = ADMITTING_CHANGE_TYPES.has(changeType);
  if (admits && !nonEmptyString(change.nodeId)) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_NODE_ID};
  }
  const peerId = registry.raftPeerIdOf(change.replicaIdentity);
  if (peerId === null) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.PEER_UNRESERVED};
  }
  return {change: deepFreeze({
    transition: 0,
    changes: [deepFreeze({changeType, nodeId: peerId})],
    ...(admits ? {context: encodeCommittedAdmissionContext({
      replicaIdentity: change.replicaIdentity, peerId,
      nodeId: change.nodeId})} : {}),
  })};
}

function readCoreStatusAndConfState({group, expectedGeneration, invokeCoreAt}) {
  const status = invokeCoreAt(group, expectedGeneration,
    CORE_OPERATION.STATUS);
  if (!status.ok) {
    return {ok: false, result: status.result};
  }
  const conf = invokeCoreAt(group, expectedGeneration,
    CORE_OPERATION.CONF_STATE);
  if (!conf.ok) {
    return {ok: false, result: conf.result};
  }
  return {ok: true, status: status.value, confState: conf.value};
}

/**
 * The admission's refusal of a conf-change proposal, read from the core in
 * this turn, or null when the core takes it.
 * @param {Object} context
 * @return {Object|null}
 */
function refusedConfChange({group, expectedGeneration, change, invokeCoreAt,
  leaderReplicaIdOf}) {
  const coreState = readCoreStatusAndConfState({
    group, expectedGeneration, invokeCoreAt,
  });
  if (!coreState.ok) {
    return coreState.result;
  }
  return confChangeProposalRefusal({
    status: coreState.status,
    confState: coreState.confState,
    change,
    leaderReplicaIdOf: (lead) => leaderReplicaIdOf(group, lead),
  });
}

/**
 * Execute a typed membership operation (ADMIT, LEARNER_CAUGHT_UP,
 * GROWTH_PROMOTE, REPLACE_PROMOTE, WITHDRAW_PROMOTION, REMOVE_LEARNER) in the
 * leader's queued core turn.
 * @param {Object} context
 * @return {Object} The runtime turn.
 */
function executeTypedConfChangeOperation({group, expectedGeneration, operation,
  invokeCoreAt, leaderReplicaIdOf, answerGroupConfChangeRefusal,
  answerRefusedProposal, drainReady}) {
  const coreState = readCoreStatusAndConfState({
    group, expectedGeneration, invokeCoreAt,
  });
  if (!coreState.ok) {
    return settledTurn(coreState.result);
  }
  const decision = decideTypedConfChangeOperation({
    group,
    status: coreState.status,
    confState: coreState.confState,
    operation,
    leaderReplicaIdOf: (lead) => leaderReplicaIdOf(group, lead),
  });
  if (decision.immediate !== undefined) {
    return answerGroupConfChangeRefusal(
      group, expectedGeneration, decision.immediate);
  }
  const invoked = invokeCoreAt(
    group, expectedGeneration, PROPOSE_CONF_CHANGE_V2, decision.change);
  if (!invoked.ok) {
    return settledTurn(
      answerRefusedProposal(group, expectedGeneration, invoked.result));
  }
  decision.onAccepted?.();
  return continueTurn(drainReady(group, expectedGeneration), (drained) =>
    settledTurn(drained.outcome === CORE_OK && decision.onDrained ?
      decision.onDrained(drained) : drained));
}

/**
 * The turn that answers an immediate conf-change outcome: REMOVES_LEADER
 * after the leadership hand-off its refusal requires, anything else as it is.
 * @param {Object} answer - The refusal (or another immediate outcome).
 * @param {Function} transferLeadership - (transfer) => the owner's turn
 *   that steps the transfer and drains its Ready.
 * @return {Object} The turn (raft-rs-turn-answer.js).
 */
function answerConfChangeRefusal(answer, transferLeadership) {
  if (answer.outcome !== CORE_REFUSED ||
      answer.reason !== RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LEADER) {
    return settledTurn(answer);
  }
  return continueTurn(transferLeadership(LEADER_REMOVAL_HANDOFF),
    (handed) => settledTurn(
      handed.outcome === CORE_OK || handed.outcome === CORE_REFUSED ?
        answer : handed));
}

export {
  answerConfChangeRefusal,
  executeTypedConfChangeOperation,
  normalizedConfChange,
  refusedConfChange,
};
