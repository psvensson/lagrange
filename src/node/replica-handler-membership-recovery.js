// Explicit-context functions for ReplicaHandler's permanent member loss
// recovery orchestration across surviving voters and the replacement target.

import {
  PARTITION_MEMBERSHIP_RECOVERY_DEFAULT as DEFAULT_VALUE,
  PARTITION_MEMBERSHIP_RECOVERY_ERROR as ERROR,
  PARTITION_MEMBERSHIP_RECOVERY_FENCE_NOTICE_TYPE,
  PARTITION_MEMBERSHIP_RECOVERY_OUTCOME as OUTCOME,
  PARTITION_MEMBERSHIP_RECOVERY_STAGE as STAGE,
} from '../partition/partition-membership-recovery-constants.js';
import {
  readCommittedMembershipRecoveryByIdIn,
  readPartitionMemberBinding,
  stagePartitionMembershipRecoveryIntent,
} from '../partition/partition-membership-recovery.js';
import {
  admitPartitionRaftLearner,
  evaluatePartitionLearnerCatchUp,
  proposePartitionReplacePromote,
  readPartitionCommittedMembership,
  reservePartitionRaftPeerIdentity,
  retirePartitionRaftPeer,
} from '../partition/partition-service-raft-membership-administration.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
} from '../raft/raft-committed-membership-constants.js';
import {
  committedStampOfAnswer,
} from '../raft/raft-committed-membership-stamp.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_OPERATION_OUTCOME,
} from '../raft/raft-operation-port-constants.js';
import {
  COMMITTED_REPLICA_ROLE,
  projectPeerRole,
} from '../raft/raft-rs-committed-membership-read.js';
import {readRaftRsPeerIdentityReservations} from
  '../raft/raft-rs-peer-identity.js';
import {turnChainValue} from '../raft/raft-rs-turn-answer.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {
  deliveryAnswerOf,
  deliveryTransportOf,
  isDeliveredTransportDeliveryOutcome,
} from '../transport/transport-semantic-outcome.js';
import {PARTICIPANT_RELEASE_ROUTE_SUFFIX} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {
  handleMaterializeRecoveryLearner,
  handleObserveRecoveryLearner,
  isNodeEligibleForPermanentLossRecovery,
  isTargetBootSuperseded,
  persistRecoveredServicesRowsAsync,
  planAutonomousPermanentLossRecovery,
  reconcileCompletedMembershipRecoveryPublications,
} from './replica-handler-membership-recovery-decision.js';

// ends-on: committed membership recovery completes source removal
const DEFAULT_RECOVERY_TIMEOUT_MS = 20_000;

function recordReportedTargetBootAndCheckSupersession(
  handler,
  leaderService,
  recovery,
  materialized,
) {
  const actualBoot = Number(materialized?.actualTargetNodeBootIncarnation);
  if (Number.isSafeInteger(actualBoot) && actualBoot >= 1) {
    leaderService.targetNodeBoots ??= new Map();
    leaderService.targetNodeBoots.set(recovery.targetNodeId, actualBoot);
  }
  const explicitBootMismatch =
    materialized?.failureCode === ERROR.SOURCE_GENERATION_MISMATCH &&
    Number.isSafeInteger(actualBoot) &&
    actualBoot >= 1 &&
    actualBoot !== recovery.targetNodeBootIncarnation;
  const superseded = explicitBootMismatch ||
    isTargetBootSuperseded(handler, leaderService, recovery);
  if (superseded) {
    leaderService.supersededRecoveryDecisionIds ??= new Set();
    leaderService.supersededRecoveryDecisionIds.add(recovery.decisionId);
  }
  return superseded;
}

function nowOf(handler) {
  return handler.timeSource.now();
}

function wallNowMs() {
  return Date.now();
}

function resolveRecoveryWallDeadlineMs(handler, requestedDeadlineAtMs) {
  const budgetMs = Number.isSafeInteger(requestedDeadlineAtMs) ?
    Math.max(1, requestedDeadlineAtMs - nowOf(handler)) :
    DEFAULT_RECOVERY_TIMEOUT_MS;
  return wallNowMs() + budgetMs;
}

function sleepOf(_handler, delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function collectKnownMemberBindings(service, recovery) {
  const bindings = [];
  const reservations = readRaftRsPeerIdentityReservations(service.db);
  for (const item of reservations) {
    const bound = readPartitionMemberBinding(service, item.replicaIdentity);
    if (bound !== null) {
      bindings.push({
        replicaId: bound.replicaId,
        peerId: bound.peerId,
        nodeId: bound.nodeId,
        nodeBootIncarnation: bound.nodeBootIncarnation,
        replicaCreatedAt: bound.replicaCreatedAt,
      });
    }
  }
  if (recovery) {
    bindings.push(
      {
        replicaId: recovery.sourceReplicaId,
        peerId: recovery.sourcePeerId,
        nodeId: recovery.sourceNodeId,
        nodeBootIncarnation: recovery.sourceNodeBootIncarnation,
        replicaCreatedAt: recovery.sourceReplicaCreatedAt,
      },
      {
        replicaId: recovery.targetReplicaId,
        peerId: recovery.targetPeerId,
        nodeId: recovery.targetNodeId,
        nodeBootIncarnation: recovery.targetNodeBootIncarnation,
        replicaCreatedAt: recovery.targetReplicaCreatedAt,
      },
    );
  }
  return bindings;
}

async function deliverRecoveryHandlerMessage(handler, targetNodeId, payload, timeoutMs) {
  if (targetNodeId === handler.nodeId) {
    return handler.handleMessage({
      payload,
      correlationId: DEFAULT_VALUE.LOCAL_CORRELATION_ID,
    });
  }
  if (!handler.messageRouter || !handler.messageRouter.deliver) {
    return null;
  }
  const delivery = await handler.messageRouter.deliver(
    `${targetNodeId}${PARTICIPANT_RELEASE_ROUTE_SUFFIX}`,
    payload,
    {
      targetNodeId,
      deliveryPriority: DEFAULT_VALUE.DELIVERY_PRIORITY_CRITICAL,
      timeoutMs,
    },
  );
  if (!isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery))) {
    return null;
  }
  return deliveryAnswerOf(delivery);
}

function isLeaderReadyForMembershipWait(handler, leaderService) {
  if (handler.shuttingDown) return false;
  if (leaderService.isShutdown) return false;
  return leaderService.raft?.readStatus?.()?.role === RAFT_ROLE.LEADER;
}

async function waitForRecoveryMembershipPredicate(
  handler,
  leaderService,
  deadlineAtMs,
  predicate,
) {
  while (wallNowMs() < deadlineAtMs) {
    if (!isLeaderReadyForMembershipWait(handler, leaderService)) return null;
    const status = leaderService.raft.readStatus();
    const membership = await readPartitionCommittedMembership(leaderService);
    if (membership?.kind === COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED &&
        (membership.votersOutgoing || []).length === 0 &&
        (membership.learnersNext || []).length === 0 &&
        status.confChangePending !== true &&
        predicate(membership, status)) {
      return membership;
    }
    await sleepOf(handler, DEFAULT_VALUE.POLL_INTERVAL_MS);
  }
  return null;
}

function resolveActiveLocalLeaderService(handler, partitionId, leaderReplicaId) {
  if (isNonEmptyString(leaderReplicaId)) {
    const direct = handler.getTrackedService(leaderReplicaId);
    if (direct && !direct.isShutdown &&
        (!isNonEmptyString(partitionId) || direct.partitionId === partitionId)) {
      return direct;
    }
  }
  let firstActive = null;
  for (const service of handler.localServices.values()) {
    if (!service || service.isShutdown || service.partitionId !== partitionId) {
      continue;
    }
    if (service.raft?.readStatus?.()?.role === RAFT_ROLE.LEADER) {
      return service;
    }
    if (!firstActive) firstActive = service;
  }
  return firstActive;
}

async function stagePermanentMemberLossRecovery(handler, request) {
  const leaderService = resolveActiveLocalLeaderService(
    handler,
    request?.partitionId,
    request?.leaderReplicaId,
  );
  if (!leaderService || leaderService.isShutdown) {
    return Object.freeze({
      success: false,
      committed: false,
      partitionId: request?.partitionId ?? null,
      failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER,
    });
  }
  return stagePartitionMembershipRecoveryIntent(leaderService, request);
}

async function resolveOrStageRecoveryRecord(leaderService, request) {
  const decisionId = request?.decisionId ?? request?.entryId ?? null;
  if (request?.reconstructOnly === true && isNonEmptyString(decisionId)) {
    const reconstructed = readCommittedMembershipRecoveryByIdIn(
      leaderService, decisionId);
    return {staged: null, recovery: reconstructed};
  }
  const existing = isNonEmptyString(decisionId) ?
    readCommittedMembershipRecoveryByIdIn(leaderService, decisionId) :
    null;
  const membershipNow = await readPartitionCommittedMembership(leaderService);
  const alreadyTransitioning = existing !== null &&
    membershipNow?.kind === COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED &&
    (membershipNow.configurationKey !== existing.configurationKey ||
      Number(membershipNow.membershipGenerationIndex) !==
        existing.membershipGenerationIndex);
  const sourceMatches = !isNonEmptyString(request?.sourceReplicaId) ||
    existing?.sourceReplicaId === request.sourceReplicaId;
  const targetMatches = !isNonEmptyString(request?.targetReplicaId) ||
    existing?.targetReplicaId === request.targetReplicaId;
  if (alreadyTransitioning && sourceMatches && targetMatches) {
    return {staged: null, recovery: existing};
  }
  const staged = await stagePartitionMembershipRecoveryIntent(
    leaderService,
    request,
  );
  return {staged, recovery: staged.recovery ?? null};
}

function notifyExcludedSourceFence(handler, recovery) {
  if (!handler.messageRouter || !handler.messageRouter.deliver) return;
  const excludedAddress =
    `${recovery.sourceNodeId}/partition/${recovery.sourceReplicaId}`;
  void Promise.resolve(handler.messageRouter.deliver(excludedAddress, {
    type: PARTITION_MEMBERSHIP_RECOVERY_FENCE_NOTICE_TYPE,
    recovery,
  })).catch((error) => {
    handler.logger?.debug?.(ERROR.RETIRED_MEMBER_FENCED, {
      partitionId: recovery.partitionId,
      error: error?.message,
    });
  });
}

async function runPermanentMemberLossRecoveryInternal(handler, request) {
  const leaderService = resolveActiveLocalLeaderService(
    handler,
    request?.partitionId,
    request?.leaderReplicaId,
  );
  if (!leaderService || leaderService.isShutdown) {
    return Object.freeze({
      success: false,
      committed: false,
      partitionId: request?.partitionId ?? null,
      failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER,
    });
  }
  const deadlineAtMs = resolveRecoveryWallDeadlineMs(
    handler,
    request?.deadlineAtMs,
  );
  const {staged, recovery} = await resolveOrStageRecoveryRecord(
    leaderService, request);
  if (staged !== null && (!staged.success || request?.stageOnly === true)) {
    return staged;
  }
  if (!recovery) {
    return Object.freeze({
      success: false,
      committed: false,
      partitionId: leaderService.partitionId,
      failureCode: ERROR.BINDING_ABSENT,
    });
  }
  let membership = await readPartitionCommittedMembership(leaderService);
  if (membership?.kind !== COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED) {
    return Object.freeze({
      success: false,
      committed: false,
      partitionId: leaderService.partitionId,
      failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER,
    });
  }
  const materializePayload = {
    type: ReplicaOperationMessageType.MATERIALIZE_RECOVERY_LEARNER,
    partitionId: leaderService.partitionId,
    tableId: leaderService.tableId,
    tableName: leaderService.tableName,
    schema: leaderService.schema,
    keyRange: leaderService.keyRange,
    targetReplicaId: recovery.targetReplicaId,
    targetNodeId: recovery.targetNodeId,
    targetNodeBootIncarnation: recovery.targetNodeBootIncarnation,
    targetReplicaCreatedAt: recovery.targetReplicaCreatedAt,
    decisionId: recovery.decisionId,
    memberBindings: collectKnownMemberBindings(leaderService, recovery),
    supersededTargetReplicaId: request?.supersededTargetReplicaId ?? null,
  };
  let targetRole = projectPeerRole(membership, recovery.targetPeerId);
  const sourceRoleInitial = projectPeerRole(membership, recovery.sourcePeerId);
  if (targetRole === COMMITTED_REPLICA_ROLE.ABSENT &&
      sourceRoleInitial === COMMITTED_REPLICA_ROLE.VOTER) {
    const stampAnswer = await leaderService.raft.readCommittedMembership({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP,
    });
    const stamp = committedStampOfAnswer(stampAnswer);
    if (!stamp) {
      return Object.freeze({
        success: false,
        committed: false,
        partitionId: leaderService.partitionId,
        failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER,
      });
    }
    const materialized = await deliverRecoveryHandlerMessage(
      handler,
      recovery.targetNodeId,
      {...materializePayload, bootstrapMembership: stamp},
      Math.max(DEFAULT_VALUE.MIN_MATERIALIZE_BUDGET_MS, deadlineAtMs - wallNowMs()),
    );
    if (!materialized ||
        materialized.status !== ReplicaOperationResponseStatus.COMPLETED) {
      const matCode = isNonEmptyString(materialized?.failureCode) ?
        materialized.failureCode : ERROR.TARGET_INVALID;
      const matError = isNonEmptyString(materialized?.error) ?
        materialized.error : DEFAULT_VALUE.MATERIALIZE_FAILED_MSG;
      const superseded = recordReportedTargetBootAndCheckSupersession(
        handler,
        leaderService,
        recovery,
        materialized,
      );
      if (superseded &&
          request?.allowTargetSupersession !== false &&
          wallNowMs() < deadlineAtMs) {
        const replanned = await planAutonomousPermanentLossRecovery(
          handler,
          leaderService,
          recovery.sourceNodeId,
          recovery.sourceReplicaId,
        );
        if (replanned.plan && replanned.plan.decisionId !== recovery.decisionId) {
          return runPermanentMemberLossRecoveryInternal(handler, {
            ...request,
            ...replanned.plan,
            allowTargetSupersession: false,
          });
        }
      }
      return Object.freeze({
        success: false,
        committed: false,
        partitionId: leaderService.partitionId,
        failureCode: matCode,
        error: matError,
      });
    }
    reservePartitionRaftPeerIdentity(leaderService, recovery.targetReplicaId);
    const admission = admitPartitionRaftLearner(leaderService, {
      replicaIdentity: recovery.targetReplicaId,
      nodeId: recovery.targetNodeId,
      operationId: recovery.decisionId,
    });
    const settledAdmission = admission.settled ?
      await admission.settled : admission;
    if (![
      RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED,
      RAFT_MEMBERSHIP_ADMISSION_OUTCOME.ALREADY_MEMBER,
      RAFT_MEMBERSHIP_ADMISSION_OUTCOME.IN_FLIGHT,
    ].includes(settledAdmission.outcome)) {
      return Object.freeze({
        success: false,
        committed: false,
        partitionId: leaderService.partitionId,
        failureCode: ERROR.CONFIGURATION_IN_TRANSITION,
      });
    }
    membership = await waitForRecoveryMembershipPredicate(
      handler,
      leaderService,
      deadlineAtMs,
      (m) => {
        const role = projectPeerRole(m, recovery.targetPeerId);
        return role === COMMITTED_REPLICA_ROLE.LEARNER ||
          role === COMMITTED_REPLICA_ROLE.VOTER;
      },
    );
    if (!membership) {
      return Object.freeze({
        success: false,
        committed: false,
        partitionId: leaderService.partitionId,
        failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.COMMIT_DEADLINE_EXCEEDED,
      });
    }
    targetRole = projectPeerRole(membership, recovery.targetPeerId);
  }

  if (targetRole === COMMITTED_REPLICA_ROLE.LEARNER) {
    const stampAnswer = await leaderService.raft.readCommittedMembership({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP,
    });
    const stamp = committedStampOfAnswer(stampAnswer);
    let reMaterialized = null;
    if (stamp) {
      reMaterialized = await deliverRecoveryHandlerMessage(
        handler,
        recovery.targetNodeId,
        {...materializePayload, bootstrapMembership: stamp},
        Math.max(DEFAULT_VALUE.MIN_MATERIALIZE_BUDGET_MS, deadlineAtMs - wallNowMs()),
      );
    }
    const learnerTargetSuperseded = recordReportedTargetBootAndCheckSupersession(
      handler,
      leaderService,
      recovery,
      reMaterialized,
    );
    if (learnerTargetSuperseded) {
      await retirePartitionRaftPeer(leaderService, recovery.targetReplicaId);
      const afterLearnerRetire = await waitForRecoveryMembershipPredicate(
        handler,
        leaderService,
        deadlineAtMs,
        (m) => projectPeerRole(m, recovery.targetPeerId) ===
          COMMITTED_REPLICA_ROLE.ABSENT,
      );
      if (afterLearnerRetire &&
          request?.allowTargetSupersession !== false &&
          wallNowMs() < deadlineAtMs) {
        const replanned = await planAutonomousPermanentLossRecovery(
          handler,
          leaderService,
          recovery.sourceNodeId,
          recovery.sourceReplicaId,
        );
        if (replanned.plan && replanned.plan.decisionId !== recovery.decisionId) {
          return runPermanentMemberLossRecoveryInternal(handler, {
            ...request,
            ...replanned.plan,
            allowTargetSupersession: false,
          });
        }
      }
      return Object.freeze({
        success: false,
        committed: false,
        partitionId: leaderService.partitionId,
        failureCode: ERROR.SOURCE_GENERATION_MISMATCH,
      });
    }
    const leaderCommitBoundary = Math.max(
      Number(leaderService.raft.readStatus()?.commitIndex ?? 0),
      recovery.intentLogIndex,
    );
    const requiredAppliedBoundary = Number.isSafeInteger(
      request?.requiredAppliedBoundary,
    ) ?
      Math.max(request.requiredAppliedBoundary, recovery.intentLogIndex) :
      leaderCommitBoundary;

    let caughtUpTargetObservation = null;
    while (wallNowMs() < deadlineAtMs) {
      const [observed, catchUp] = await Promise.all([
        deliverRecoveryHandlerMessage(
          handler,
          recovery.targetNodeId,
          {
            type: ReplicaOperationMessageType.OBSERVE_RECOVERY_LEARNER,
            partitionId: leaderService.partitionId,
            targetReplicaId: recovery.targetReplicaId,
            targetReplicaCreatedAt: recovery.targetReplicaCreatedAt,
          },
          Math.max(DEFAULT_VALUE.MIN_OBSERVE_BUDGET_MS, deadlineAtMs - wallNowMs()),
        ),
        turnChainValue(
          evaluatePartitionLearnerCatchUp(leaderService, {
            operationId: recovery.decisionId,
            replicaIdentity: recovery.targetReplicaId,
          }),
        ),
      ]);
      const targetObs = observed?.targetObservation ?? null;
      const leaderStatus = leaderService.raft.readStatus();
      const appliedEnough = targetObs !== null &&
        targetObs.appliedIndex >= requiredAppliedBoundary &&
        targetObs.configurationKey === leaderStatus.configurationKey &&
        targetObs.membershipGenerationIndex ===
          leaderStatus.membershipGenerationIndex;
      if (appliedEnough && catchUp?.caughtUp === true) {
        caughtUpTargetObservation = targetObs;
        break;
      }
      if (request?.failFastOnCatchUpBehind === true &&
          targetObs !== null &&
          targetObs.appliedIndex < requiredAppliedBoundary) {
        return Object.freeze({
          success: false,
          committed: false,
          partitionId: leaderService.partitionId,
          failureCode: ERROR.TARGET_CATCHUP_INCOMPLETE,
          targetAppliedIndex: targetObs.appliedIndex,
          requiredAppliedBoundary,
        });
      }
      await sleepOf(handler, DEFAULT_VALUE.POLL_INTERVAL_MS);
    }

    if (caughtUpTargetObservation === null) {
      return Object.freeze({
        success: false,
        committed: false,
        partitionId: leaderService.partitionId,
        failureCode: ERROR.TARGET_CATCHUP_INCOMPLETE,
        requiredAppliedBoundary,
      });
    }

    const voterCount = (membership.voters || []).length;
    const promotion = await turnChainValue(
      proposePartitionReplacePromote(leaderService, {
        operationId: recovery.decisionId,
        targetReplicaIdentity: recovery.targetReplicaId,
        sourceReplicaIdentity: recovery.sourceReplicaId,
        targetVoterCount: voterCount,
      }),
    );
    if (promotion?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
      return Object.freeze({
        success: false,
        committed: false,
        partitionId: leaderService.partitionId,
        failureCode: ERROR.CONFIGURATION_IN_TRANSITION,
      });
    }

    membership = await waitForRecoveryMembershipPredicate(
      handler,
      leaderService,
      deadlineAtMs,
      (m) => projectPeerRole(m, recovery.targetPeerId) ===
        COMMITTED_REPLICA_ROLE.VOTER,
    );
    if (!membership) {
      return Object.freeze({
        success: false,
        committed: false,
        partitionId: leaderService.partitionId,
        failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.COMMIT_DEADLINE_EXCEEDED,
      });
    }
    await deliverRecoveryHandlerMessage(
      handler,
      recovery.targetNodeId,
      {
        type: ReplicaOperationMessageType.OBSERVE_RECOVERY_LEARNER,
        partitionId: leaderService.partitionId,
        targetReplicaId: recovery.targetReplicaId,
        targetReplicaCreatedAt: recovery.targetReplicaCreatedAt,
        promoted: true,
      },
      Math.max(DEFAULT_VALUE.MIN_MATERIALIZE_BUDGET_MS, deadlineAtMs - wallNowMs()),
    );
  }

  const sourceRole = projectPeerRole(membership, recovery.sourcePeerId);
  if (sourceRole === COMMITTED_REPLICA_ROLE.VOTER) {
    const removal = await retirePartitionRaftPeer(
      leaderService,
      recovery.sourceReplicaId,
    );
    if (![
      RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED,
      RAFT_MEMBERSHIP_ADMISSION_OUTCOME.ALREADY_MEMBER,
      RAFT_MEMBERSHIP_ADMISSION_OUTCOME.IN_FLIGHT,
      RAFT_MEMBERSHIP_ADMISSION_OUTCOME.DEFERRED,
    ].includes(removal.outcome)) {
      return Object.freeze({
        success: false,
        committed: false,
        partitionId: leaderService.partitionId,
        failureCode: ERROR.CONFIGURATION_IN_TRANSITION,
      });
    }
    membership = await waitForRecoveryMembershipPredicate(
      handler,
      leaderService,
      deadlineAtMs,
      (m) => projectPeerRole(m, recovery.sourcePeerId) ===
        COMMITTED_REPLICA_ROLE.ABSENT,
    );
    if (!membership) {
      return Object.freeze({
        success: false,
        committed: false,
        partitionId: leaderService.partitionId,
        failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.COMMIT_DEADLINE_EXCEEDED,
      });
    }
  }

  notifyExcludedSourceFence(handler, recovery);
  const currentVoterReplicaIds = (membership.voters || [])
    .map((peerId) => membership.identities?.[peerId] || String(peerId));
  leaderService.replicaIds = [...currentVoterReplicaIds];
  leaderService.lastCompletedMembershipRecovery = recovery;
  leaderService.lastCompletedMembershipRecoveryPersisted = false;
  persistRecoveredServicesRowsAsync(
    handler,
    recovery,
    `${recovery.targetNodeId}/partition/${recovery.targetReplicaId}`,
    leaderService,
  );
  leaderService.reassertDurableLeaderNodeId?.();
  leaderService.reassertDurableRaftRole?.();

  return Object.freeze({
    success: true,
    committed: true,
    outcome: OUTCOME.COMMITTED,
    stage: STAGE.SOURCE_RETIRED,
    partitionId: leaderService.partitionId,
    decisionId: recovery.decisionId,
    recovery,
    voterReplicaIds: Object.freeze(currentVoterReplicaIds),
  });
}

async function executePermanentMemberLossRecovery(handler, request) {
  const partitionId = request?.partitionId;
  const inFlight = handler.membershipRecoveryInFlight;
  if (isNonEmptyString(partitionId) && inFlight.has(partitionId)) {
    return inFlight.get(partitionId);
  }
  const task = runPermanentMemberLossRecoveryInternal(handler, request)
    .finally(() => {
      if (isNonEmptyString(partitionId) && inFlight.get(partitionId) === task) {
        inFlight.delete(partitionId);
      }
    });
  if (isNonEmptyString(partitionId)) {
    inFlight.set(partitionId, task);
  }
  return task;
}

function isLeaderEligibleForAutonomousRecovery(handler, leaderService) {
  if (!leaderService) return false;
  if (leaderService.isShutdown) return false;
  return !handler.shuttingDown;
}

async function tryAutonomousPermanentMemberLossRecovery(
  handler,
  leaderService,
  hintedDeadNodeId = null,
  hintedDeadReplicaId = null,
  deadlineAtMs = null,
) {
  if (!isLeaderEligibleForAutonomousRecovery(handler, leaderService)) {
    return null;
  }
  const publication = await reconcileCompletedMembershipRecoveryPublications(
    handler,
    leaderService,
  );
  const {plan, pendingExpiry} = await planAutonomousPermanentLossRecovery(
    handler,
    leaderService,
    hintedDeadNodeId,
    hintedDeadReplicaId,
  );
  if (!plan) {
    const needsPersistenceRetry = publication.pendingPublication === true ||
      Boolean(
        leaderService.lastCompletedMembershipRecovery &&
        leaderService.lastCompletedMembershipRecoveryPersisted !== true,
      );
    return (pendingExpiry || needsPersistenceRetry) ?
      Object.freeze({success: false, retry: true}) :
      null;
  }
  return executePermanentMemberLossRecovery(handler, {
    ...plan,
    deadlineAtMs: Number.isSafeInteger(deadlineAtMs) ?
      deadlineAtMs :
      nowOf(handler) + DEFAULT_RECOVERY_TIMEOUT_MS,
  });
}

export {
  executePermanentMemberLossRecovery,
  handleMaterializeRecoveryLearner,
  handleObserveRecoveryLearner,
  isNodeEligibleForPermanentLossRecovery,
  planAutonomousPermanentLossRecovery,
  readPartitionMemberBinding,
  stagePermanentMemberLossRecovery,
  tryAutonomousPermanentMemberLossRecovery,
};
