// Autonomous permanent member loss recovery planner, replacement target
// selector, and target-side learner materialization/observation handlers for
// hosted partition leaders on ReplicaHandler.

import {createHash} from 'node:crypto';
import {createPartitionConstructionHandoff} from '../bootstrap/shared/partition-service-construction.js';
import {SYSTEM_TABLE_NAME, getSchemaByTableName} from '../bootstrap/system-table-schemas-constants.js';
import {COLUMN, NODE_STATE, SERVICE_STATUS, SERVICE_TYPE, STATE, TABLES} from '../constants/index.js';
import {CONTROL_PLANE_MUTATION_OPERATION} from '../control-plane/control-plane-system-table-gateway.js';
import {hasLiveTransportEvidence} from '../control-plane/live-transport-evidence.js';
import {NodeReadyLeaseAuthority} from '../control-plane/node-ready-lease-authority.js';
import {projectNodeLivenessSemantics} from '../control-plane/node-liveness-semantic-projection.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  PARTITION_MEMBERSHIP_RECOVERY_DEFAULT as DEFAULT_VALUE,
  PARTITION_MEMBERSHIP_RECOVERY_ERROR as ERROR,
} from '../partition/partition-membership-recovery-constants.js';
import {
  deriveCanonicalPeerIdString, isExcludedRecoveryServiceReplica,
  noteExcludedRecoveryServiceReplica, readCommittedMembershipRecoveriesIn,
  recordPartitionMemberBinding, registerRecoveryPublicationPartitionService,
  resolveAuthoritativeMemberBinding,
} from '../partition/partition-membership-recovery.js';
import {readPartitionCommittedMembership} from '../partition/partition-service-raft-membership-administration.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {COMMITTED_MEMBERSHIP_ANSWER_KIND, COMMITTED_MEMBERSHIP_READ_PURPOSE} from '../raft/raft-committed-membership-constants.js';
import {replicaIdsOfStamp, validateBootstrapMembershipStamp} from '../raft/raft-committed-membership-stamp.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {isCatchupLearnerRaftRole} from '../raft/replica-voter-readiness.js';
import {ReplicaOperationResponseStatus} from '../rebalancer/replica-operation-constants.js';
import {OperationType, ReplicaStatus, isTerminalReplicaOperationRecord} from '../rebalancer/replica-operation-progress.js';

const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function sha256Hex(input) {
  return createHash(DIGEST_ALGORITHM).update(input).digest(DIGEST_ENCODING);
}

function observesCommittedNodeLossRow(row) {
  if (!row) return false;
  const boot = Number(row[COLUMN.BOOT_INCARNATION]);
  if (!isPositiveSafeInteger(boot)) return false;
  const status = row[COLUMN.STATUS];
  if (status === NODE_STATE.FAILED || status === NODE_STATE.STOPPED) return true;
  return row[COLUMN.CONNECTION_STATE] === STATE.DISCONNECTED &&
    row[COLUMN.READY_LEASE_EXPIRES_AT] === null;
}

function isNodeEligibleForPermanentLossRecovery(handler, nodeId, nowMs) {
  if (!isNonEmptyString(nodeId) || nodeId === handler?.nodeId) return false;
  if (hasLiveTransportEvidence(nodeId, {messageRouter: handler?.messageRouter})) {
    return false;
  }
  const nodeRow = handler?.systemTableCache?.get?.(TABLES.NODES, nodeId) ?? null;
  if (!nodeRow) return false;
  if (observesCommittedNodeLossRow(nodeRow)) return true;
  const leaseAuthority = NodeReadyLeaseAuthority.fromConfiguration();
  return leaseAuthority.isExpired(nodeRow, nowMs);
}

function isNodeUnreachablePendingExpiry(handler, nodeId, nowMs) {
  if (!isNonEmptyString(nodeId) || nodeId === handler?.nodeId) return false;
  if (hasLiveTransportEvidence(nodeId, {messageRouter: handler?.messageRouter})) {
    return false;
  }
  const nodeRow = handler?.systemTableCache?.get?.(TABLES.NODES, nodeId) ?? null;
  if (!nodeRow) return false;
  if (observesCommittedNodeLossRow(nodeRow)) return false;
  const leaseAuthority = NodeReadyLeaseAuthority.fromConfiguration();
  return !leaseAuthority.isExpired(nodeRow, nowMs);
}

function isClusterNodeRowUnreachableOrDead(handler, nodeRow) {
  const nodeId = nodeRow?.[COLUMN.NODE_ID];
  if (!isNonEmptyString(nodeId) || nodeId === handler?.nodeId) return false;
  if (observesCommittedNodeLossRow(nodeRow)) return true;
  if (nodeRow?.[COLUMN.STATUS] !== NODE_STATE.READY &&
      nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT] === null) {
    return false;
  }
  return !hasLiveTransportEvidence(nodeId, {messageRouter: handler?.messageRouter});
}

function hasAnyUnreachableOrDeadClusterNode(handler) {
  const nodeRows = handler?.systemTableCache?.getAll?.(TABLES.NODES);
  if (!Array.isArray(nodeRows) || nodeRows.length === 0) return false;
  return nodeRows.some((nodeRow) =>
    isClusterNodeRowUnreachableOrDead(handler, nodeRow));
}

function selectEligibleReplacementTargetNode(
  handler, partitionId, excludedNodeIds, nowMs, leaderService = null, hintedTargetNodeId = null,
) {
  const cache = handler?.systemTableCache;
  if (!cache || !cache.getAll) return null;
  const operationRows = cache.getAll(TABLES.REPLICA_OPERATIONS) || [];
  const activeReplace = operationRows.find((row) =>
    row?.partition_id === partitionId &&
    (row?.type === OperationType.REPLACE || row?.type === OperationType.ADD) &&
    !isTerminalReplicaOperationRecord(row) &&
    isNonEmptyString(row.target_node_id) &&
    !excludedNodeIds.has(row.target_node_id));
  const nodeRows = cache.getAll(TABLES.NODES) || [];
  const targetBoots = leaderService?.targetNodeBoots instanceof Map ?
    leaderService.targetNodeBoots : null;
  const eligibleNodes = [];
  for (const nodeRow of nodeRows) {
    const nodeId = nodeRow?.[COLUMN.NODE_ID];
    const targetBoot = isNonEmptyString(nodeId) && targetBoots ?
      Number(targetBoots.get(nodeId)) : null;
    const rowBoot = Number(nodeRow?.[COLUMN.BOOT_INCARNATION]);
    const bootIncarnation = Math.max(
      isPositiveSafeInteger(targetBoot) ? targetBoot : 0,
      isPositiveSafeInteger(rowBoot) ? rowBoot : 0,
    );
    if (!isNonEmptyString(nodeId) || excludedNodeIds.has(nodeId) ||
         !isPositiveSafeInteger(bootIncarnation) ||
        observesCommittedNodeLossRow(nodeRow)) {
      continue;
    }
    const transportLive = nodeId === handler.nodeId ||
      hasLiveTransportEvidence(nodeId, {messageRouter: handler.messageRouter});
    if (!transportLive) continue;
    const readyNow = projectNodeLivenessSemantics({nodeRow, nowMs})
      ?.projection?.readyNow === true;
    eligibleNodes.push({nodeId, bootIncarnation, readyNow});
  }
  if (eligibleNodes.length === 0 && isNonEmptyString(hintedTargetNodeId) &&
      !excludedNodeIds.has(hintedTargetNodeId)) {
    const candidateBoot = targetBoots ? Number(targetBoots.get(hintedTargetNodeId)) : null;
    if (isPositiveSafeInteger(candidateBoot)) {
      eligibleNodes.push({
        nodeId: hintedTargetNodeId, bootIncarnation: candidateBoot, readyNow: true,
      });
    }
  }
  eligibleNodes.sort((left, right) => (left.readyNow !== right.readyNow ?
    (left.readyNow ? -1 : 1) : left.nodeId.localeCompare(right.nodeId)));
  if (activeReplace) {
    const matched = eligibleNodes.find((item) => item.nodeId === activeReplace.target_node_id);
    if (matched) {
      return {
        targetNodeId: matched.nodeId,
        targetNodeBootIncarnation: matched.bootIncarnation,
        targetReplicaId: isNonEmptyString(activeReplace.replica_id) ?
          activeReplace.replica_id : null,
      };
    }
  }
  return eligibleNodes[0] ? {
    targetNodeId: eligibleNodes[0].nodeId,
    targetNodeBootIncarnation: eligibleNodes[0].bootIncarnation,
    targetReplicaId: null,
  } : null;
}

function isTargetBootSuperseded(handler, leaderService, unfinished) {
  if (!unfinished) return false;
  if (leaderService?.supersededRecoveryDecisionIds instanceof Set &&
      leaderService.supersededRecoveryDecisionIds.has(unfinished.decisionId)) {
    return true;
  }
  const targetBoot = leaderService?.targetNodeBoots instanceof Map ?
    Number(leaderService.targetNodeBoots.get(unfinished.targetNodeId)) : null;
  const nodeRow = handler?.systemTableCache?.get?.(TABLES.NODES, unfinished.targetNodeId) ?? null;
  const rowBoot = Number(nodeRow?.[COLUMN.BOOT_INCARNATION]);
  const knownBoot = Math.max(
    isPositiveSafeInteger(targetBoot) ? targetBoot : 0,
    isPositiveSafeInteger(rowBoot) ? rowBoot : 0,
  );
  if (isPositiveSafeInteger(knownBoot) && knownBoot > unfinished.targetNodeBootIncarnation) {
    return true;
  }
  return Boolean(
    nodeRow &&
    isPositiveSafeInteger(rowBoot) &&
    rowBoot >= unfinished.targetNodeBootIncarnation &&
    rowBoot >= knownBoot &&
    observesCommittedNodeLossRow(nodeRow),
  );
}

function isUnfinishedRecoveryTargetSuperseded(handler, leaderService, membership, unfinished) {
  if (!unfinished) return false;
  const committedPeers = new Set([
    ...(membership.voters || []).map(String),
    ...(membership.learners || []).map(String),
    ...(membership.votersOutgoing || []).map(String),
    ...(membership.learnersNext || []).map(String),
  ]);
  if (committedPeers.has(String(unfinished.targetPeerId))) return false;
  return isTargetBootSuperseded(handler, leaderService, unfinished);
}

function resolvePeerNodeIdFromMetadata(handler, membership, status, peerId, replicaId) {
  const directNode = membership.nodeIds?.[peerId];
  if (isNonEmptyString(directNode)) return directNode;
  const peerEntry = (status.peers || []).find((p) => p.replicaIdentity === replicaId);
  if (isNonEmptyString(peerEntry?.nodeId)) return peerEntry.nodeId;
  const serviceRow = handler?.systemTableCache?.get?.(TABLES.SERVICES, replicaId);
  return serviceRow?.[COLUMN.NODE_ID] ?? null;
}

function resolveTargetCreatedAtFromMetadata(handler, targetReplicaId, defaultCreatedAt) {
  const existingTargetRow = handler?.systemTableCache?.get?.(
    TABLES.SERVICES, targetReplicaId);
  const cachedCreatedAt = Number(existingTargetRow?.[COLUMN.CREATED_AT]);
  return isPositiveSafeInteger(cachedCreatedAt) ?
    cachedCreatedAt : defaultCreatedAt;
}

async function planAutonomousPermanentLossRecovery(
  handler,
  leaderService,
  hintedDeadNodeId = null,
  hintedDeadReplicaId = null,
) {
  const membership = await readPartitionCommittedMembership(
    leaderService,
    COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT,
  );
  if (membership?.kind !== COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED ||
      (membership.votersOutgoing || []).length > 0 ||
      (membership.learnersNext || []).length > 0) {
    return Object.freeze({plan: null, pendingExpiry: false});
  }
  const status = leaderService.raft?.readStatus?.();
  if (status?.role !== RAFT_ROLE.LEADER || status.confChangePending === true) {
    return Object.freeze({plan: null, pendingExpiry: false});
  }
  const nowMs = handler.timeSource.now();
  const voterPeerIds = (membership.voters || []).map(String);
  const existingRecoveries = readCommittedMembershipRecoveriesIn(leaderService);
  const activeVoterRecoveries = existingRecoveries.filter((record) =>
    voterPeerIds.includes(record.sourcePeerId));
  const unfinished = activeVoterRecoveries.length > 0 ?
    activeVoterRecoveries[activeVoterRecoveries.length - 1] : null;
  if (unfinished &&
      !isUnfinishedRecoveryTargetSuperseded(
        handler,
        leaderService,
        membership,
        unfinished,
      )) {
    return Object.freeze({plan: unfinished, pendingExpiry: false});
  }
  let sourcePeerId = null;
  let sourceReplicaId = null;
  let sourceNodeId = null;
  let pendingExpiry = false;
  for (const peerId of voterPeerIds) {
    const replicaId = membership.identities?.[peerId] ?? null;
    if (!isNonEmptyString(replicaId) || replicaId === leaderService.replicaId) {
      continue;
    }
    const nodeId = resolvePeerNodeIdFromMetadata(
      handler, membership, status, peerId, replicaId);
    if (!isNonEmptyString(nodeId)) continue;
    if (isNodeUnreachablePendingExpiry(handler, nodeId, nowMs)) {
      pendingExpiry = true;
    }
    const matchesHint = (hintedDeadNodeId && nodeId === hintedDeadNodeId) ||
      (hintedDeadReplicaId && replicaId === hintedDeadReplicaId);
    if (matchesHint && isNodeEligibleForPermanentLossRecovery(handler, nodeId, nowMs)) {
      sourcePeerId = peerId;
      sourceReplicaId = replicaId;
      sourceNodeId = nodeId;
      break;
    }
    if (!sourcePeerId && isNodeEligibleForPermanentLossRecovery(handler, nodeId, nowMs)) {
      sourcePeerId = peerId;
      sourceReplicaId = replicaId;
      sourceNodeId = nodeId;
    }
  }
  if (!sourcePeerId || !sourceReplicaId || !sourceNodeId) {
    return Object.freeze({plan: null, pendingExpiry});
  }
  const sourceBinding = resolveAuthoritativeMemberBinding(
    leaderService, sourceReplicaId, sourceNodeId);
  if (!sourceBinding.available) {
    return Object.freeze({plan: null, pendingExpiry});
  }
  const occupiedNodeIds = new Set([sourceNodeId]);
  for (const peerId of voterPeerIds) {
    if (peerId === sourcePeerId) continue;
    const replicaId = membership.identities?.[peerId];
    if (replicaId === leaderService.replicaId) {
      occupiedNodeIds.add(handler.nodeId);
      continue;
    }
    const nodeId = resolvePeerNodeIdFromMetadata(
      handler, membership, status, peerId, replicaId);
    if (isNonEmptyString(nodeId)) occupiedNodeIds.add(nodeId);
  }
  const targetSelection = selectEligibleReplacementTargetNode(
    handler,
    leaderService.partitionId,
    occupiedNodeIds,
    nowMs,
    leaderService,
    unfinished?.targetNodeId ?? null,
  );
  if (!targetSelection) {
    return Object.freeze({plan: null, pendingExpiry: true});
  }
  const existingLearnerPeerId = (membership.learners || []).map(String).find((peerId) => {
    const learnerNodeId = membership.nodeIds?.[peerId];
    return learnerNodeId === targetSelection.targetNodeId;
  }) ?? null;
  const existingLearnerReplicaId = existingLearnerPeerId ?
    membership.identities?.[existingLearnerPeerId] ?? null : null;
  const supersessionSuffix = isNonEmptyString(unfinished?.decisionId) ?
    `:targetBoot=${targetSelection.targetNodeBootIncarnation}:` +
    `supersedes=${unfinished.decisionId}` :
    '';
  const digest = sha256Hex(
    `${leaderService.partitionId}:${membership.configurationKey}:` +
    `${membership.membershipGenerationIndex}:${sourceReplicaId}:` +
    `${targetSelection.targetNodeId}${supersessionSuffix}`,
  ).slice(0, DEFAULT_VALUE.DECISION_DIGEST_SLICE_LEN);
  const decisionId =
    `membership-recovery-${leaderService.partitionId}-` +
    `${membership.membershipGenerationIndex}-` +
    `${digest.slice(0, DEFAULT_VALUE.DECISION_ID_SLICE_LEN)}`;
  let targetReplicaId = `replace-replica-${digest}`;
  if (isNonEmptyString(existingLearnerReplicaId) &&
      existingLearnerReplicaId !== unfinished?.targetReplicaId) {
    targetReplicaId = existingLearnerReplicaId;
  } else if (isNonEmptyString(targetSelection.targetReplicaId) &&
      targetSelection.targetReplicaId !== unfinished?.targetReplicaId) {
    targetReplicaId = targetSelection.targetReplicaId;
  }
  const defaultCreatedAt = Math.max(
    sourceBinding.replicaCreatedAt + 1 + Number(membership.membershipGenerationIndex),
    Number(unfinished?.targetReplicaCreatedAt ?? 0) + 1,
  );
  const targetReplicaCreatedAt = resolveTargetCreatedAtFromMetadata(
    handler, targetReplicaId, defaultCreatedAt);
  return Object.freeze({
    pendingExpiry: false,
    plan: Object.freeze({
      decisionId, entryId: decisionId, partitionId: leaderService.partitionId,
      configurationKey: membership.configurationKey,
      membershipGenerationIndex: Number(membership.membershipGenerationIndex),
      sourcePeerId, sourceReplicaId,
      sourceReplicaCreatedAt: sourceBinding.replicaCreatedAt,
      sourceNodeId, sourceNodeBootIncarnation: sourceBinding.nodeBootIncarnation,
      targetPeerId: deriveCanonicalPeerIdString(targetReplicaId),
      targetReplicaId, targetReplicaCreatedAt,
      targetNodeId: targetSelection.targetNodeId,
      targetNodeBootIncarnation: targetSelection.targetNodeBootIncarnation,
      supersededTargetReplicaId: isNonEmptyString(unfinished?.decisionId) ?
        unfinished.targetReplicaId : null,
    }),
  });
}

function observeRecoveryTargetReplica(service) {
  const status = service?.raft?.readStatus?.() ?? null;
  if (!status || status.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) return null;
  return Object.freeze({
    replicaIdentity: service.replicaId, peerId: deriveCanonicalPeerIdString(service.replicaId),
    nodeId: service.nodeId, term: Number(status.term ?? 0),
    commitIndex: Number(status.commitIndex ?? 0), appliedIndex: Number(status.appliedIndex ?? 0),
    configurationKey: status.configurationKey ?? null,
    membershipGenerationIndex: Number(status.membershipGenerationIndex ?? 0),
    runtimeGeneration: Number(status.runtimeGeneration ?? 0),
    gateOpen: status.gateOpen === true, confChangePending: status.confChangePending === true,
  });
}

function resolveTableSchemaForRecovery(handler, request) {
  if (request.schema) return request.schema;
  const tableName = request.tableName;
  const systemSchema = isNonEmptyString(tableName) ? getSchemaByTableName(tableName) : null;
  if (systemSchema) return systemSchema;
  const lookupKey = isNonEmptyString(request.tableId) ? request.tableId : tableName;
  const tableRow = handler.systemTableCache?.get?.(TABLES.TABLES, lookupKey);
  if (tableRow?.schema_json) {
    return typeof tableRow.schema_json === 'string' ?
      JSON.parse(tableRow.schema_json) : tableRow.schema_json;
  }
  return null;
}

function buildRecoveryStorageOption(handler, partitionId, replicaId) {
  return {dbPath: handler.getPartitionDbPath(partitionId, replicaId)};
}

async function constructRecoveryLearnerPartition(
  handler, request, stamp, storageOption, schema, tableName, tableId,
) {
  const {partitionId, targetReplicaId} = request;
  const replicaIds = replicaIdsOfStamp(stamp, targetReplicaId);
  const construction = createPartitionConstructionHandoff(
    targetReplicaId, () => handler.throwIfShuttingDown());
  const service = await handler.createPartitionService({
    partitionId, tableId, tableName, schema, keyRange: request.keyRange ?? null,
    replicaId: targetReplicaId, replicaIds, nodeId: handler.nodeId, ...storageOption,
    transport: handler.messageRouter, systemTableCache: handler.systemTableCache,
    isJoiningExistingGroup: true, deferElection: false, learnerFirstAdmission: true,
    bootstrapMembership: stamp, identityExisted: false, deferCdcPropagationHandshake: true,
    suppressLifecycleLogs: true,
    resolveHandlerRetirementLane: () => handler.replicaStateMachine,
    onPartitionConstructed: (c, p) => construction.retain(c, p),
  });
  if (construction.opened !== null) construction.publish(service);
  if (service.initialized !== true) await service.initialize();
  return service;
}

async function retireUnpromotedSupersededService(handler, replicaId) {
  if (!isNonEmptyString(replicaId)) return;
  const replicaEntry = handler.localReplicas?.get?.(replicaId) ?? null;
  const service = handler.getTrackedService(replicaId);
  if (replicaEntry?.status === ReplicaStatus.ACTIVE ||
      service?.role === RAFT_ROLE.LEADER ||
      service?.role === RAFT_ROLE.FOLLOWER) {
    return;
  }
  await service?.shutdown?.();
  handler.localServices?.delete?.(replicaId);
  handler.localReplicas?.delete?.(replicaId);
}

async function handleMaterializeRecoveryLearner(handler, request) {
  if (!request || request.targetNodeId !== handler.nodeId) {
    return handler.buildReplicaOperationResponse(ReplicaOperationResponseStatus.ERROR, {
      error: ERROR.TARGET_INVALID, failureCode: ERROR.TARGET_INVALID, nodeId: handler.nodeId,
    });
  }
  const {
    partitionId, targetReplicaId, targetNodeBootIncarnation,
    targetReplicaCreatedAt, bootstrapMembership, supersededTargetReplicaId,
    retireSupersededOnly,
  } = request;
  if (retireSupersededOnly === true) {
    await retireUnpromotedSupersededService(handler, supersededTargetReplicaId);
    return handler.buildReplicaOperationResponse(ReplicaOperationResponseStatus.COMPLETED, {
      partitionId, replicaId: supersededTargetReplicaId ?? null, nodeId: handler.nodeId,
      actualTargetNodeBootIncarnation: handler.ownerIncarnation,
    });
  }
  if (isPositiveSafeInteger(handler.ownerIncarnation) &&
      handler.ownerIncarnation !== targetNodeBootIncarnation) {
    return handler.buildReplicaOperationResponse(ReplicaOperationResponseStatus.ERROR, {
      error: ERROR.SOURCE_GENERATION_MISMATCH, failureCode: ERROR.SOURCE_GENERATION_MISMATCH,
      nodeId: handler.nodeId, actualTargetNodeBootIncarnation: handler.ownerIncarnation,
    });
  }
  if (isNonEmptyString(supersededTargetReplicaId) &&
      supersededTargetReplicaId !== targetReplicaId) {
    await retireUnpromotedSupersededService(handler, supersededTargetReplicaId);
  }
  let service = handler.getTrackedService(targetReplicaId);
  if (!service || service.isShutdown) {
    const validation = validateBootstrapMembershipStamp(bootstrapMembership);
    if (!validation.valid) {
      return handler.buildReplicaOperationResponse(ReplicaOperationResponseStatus.ERROR, {
        error: ERROR.TARGET_INVALID, failureCode: ERROR.TARGET_INVALID, nodeId: handler.nodeId,
      });
    }
    const storageOption = buildRecoveryStorageOption(handler, partitionId, targetReplicaId);
    const schema = resolveTableSchemaForRecovery(handler, request);
    const tableName = isNonEmptyString(request.tableName) ?
      request.tableName : partitionId.replace(/-p\d+$/u, '');
    const tableId = isNonEmptyString(request.tableId) ? request.tableId : tableName;
    service = await constructRecoveryLearnerPartition(
      handler, request, validation.stamp, storageOption, schema, tableName, tableId,
    );
    handler.localServices.set(targetReplicaId, service);
    handler.setLocalReplica(targetReplicaId, {
      replicaId: targetReplicaId, partitionId, tableName, status: ReplicaStatus.SYNCING, service,
    });
  }
  if (Array.isArray(request.memberBindings)) {
    for (const binding of request.memberBindings) {
      recordPartitionMemberBinding(service, binding);
    }
  }
  recordPartitionMemberBinding(service, {
    replicaId: targetReplicaId,
    nodeId: handler.nodeId,
    nodeBootIncarnation: targetNodeBootIncarnation,
    replicaCreatedAt: targetReplicaCreatedAt,
  });
  handler.seedLocalPriorityServiceRow?.(
    service.replicaId,
    service.partitionId,
    ReplicaStatus.SYNCING,
    {markLocalOnly: false},
  );
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.COMPLETED,
    {
      partitionId,
      replicaId: targetReplicaId,
      nodeId: handler.nodeId,
      actualTargetNodeBootIncarnation: handler.ownerIncarnation,
      targetObservation: observeRecoveryTargetReplica(service),
    },
  );
}

async function handleObserveRecoveryLearner(handler, request) {
  const service = handler.getTrackedService(request?.targetReplicaId);
  if (!service || service.isShutdown || service.partitionId !== request?.partitionId) {
    return handler.buildReplicaOperationResponse(ReplicaOperationResponseStatus.NOT_FOUND, {
      partitionId: request?.partitionId ?? null,
      replicaId: request?.targetReplicaId ?? null,
      nodeId: handler.nodeId,
    });
  }
  if (request.promoted === true) {
    if (isCatchupLearnerRaftRole(service.role)) {
      service.role = RAFT_ROLE.FOLLOWER;
      service.isJoiningExistingGroup = false;
      service.learnerBootstrapped = true;
      service.cancelLearnerPromotionMonitor?.();
      service.queueRoleUpdate?.(RAFT_ROLE.FOLLOWER);
    }
    handler.seedLocalReplicaVoterRaftRole?.(service.replicaId);
    handler.setLocalReplica(service.replicaId, {
      replicaId: service.replicaId, partitionId: service.partitionId,
      tableName: service.tableName, status: ReplicaStatus.ACTIVE, service,
    });
    handler.seedLocalPriorityServiceRow?.(
      service.replicaId, service.partitionId, SERVICE_STATUS.ACTIVE, {markLocalOnly: false},
    );
    handler.seedLocalReplicaVoterRaftRole?.(service.replicaId);
    service.reassertDurableRaftRole?.();
  }
  return handler.buildReplicaOperationResponse(ReplicaOperationResponseStatus.COMPLETED, {
    partitionId: service.partitionId, replicaId: service.replicaId,
    nodeId: handler.nodeId, targetObservation: observeRecoveryTargetReplica(service),
  });
}

function resolveRecoveryMetadataGateway(handler) {
  if (handler?.controlPlaneSystemTableGateway) {
    return handler.controlPlaneSystemTableGateway;
  }
  return handler?.getControlPlaneSystemTableGateway?.() ?? null;
}

function isTargetSourceOfLaterRecovery(allRecoveries, recovery) {
  return allRecoveries.some((record) =>
    record.decisionId !== recovery.decisionId &&
    (String(record.sourcePeerId) === String(recovery.targetPeerId) ||
      record.sourceReplicaId === recovery.targetReplicaId));
}

async function readRecoveryPublicationAuthority(leaderService, recovery, cache = null) {
  registerRecoveryPublicationPartitionService(leaderService, cache);
  if (!leaderService || leaderService.isShutdown ||
      leaderService.raft?.readStatus?.()?.role !== RAFT_ROLE.LEADER) {
    return {available: false, targetStillVoter: false, sourceStillAbsent: false};
  }
  const current = await readPartitionCommittedMembership(
    leaderService, COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT,
  );
  if (current?.kind !== COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED ||
      leaderService.isShutdown ||
      leaderService.raft?.readStatus?.()?.role !== RAFT_ROLE.LEADER) {
    return {available: false, targetStillVoter: false, sourceStillAbsent: false};
  }
  const currentVoters = new Set((current.voters || []).map(String));
  const allRecoveries = readCommittedMembershipRecoveriesIn(leaderService);
  const targetReplacedLater = isTargetSourceOfLaterRecovery(allRecoveries, recovery);
  if (targetReplacedLater) {
    noteExcludedRecoveryServiceReplica(
      recovery.targetReplicaId, recovery.targetReplicaCreatedAt, cache);
  }
  const sourceStillAbsent = !currentVoters.has(String(recovery.sourcePeerId));
  if (sourceStillAbsent) {
    noteExcludedRecoveryServiceReplica(
      recovery.sourceReplicaId, recovery.sourceReplicaCreatedAt, cache);
  }
  return {
    available: true,
    targetStillVoter: !targetReplacedLater && currentVoters.has(String(recovery.targetPeerId)),
    sourceStillAbsent,
  };
}

function persistRecoveredServicesRowsAsync(
  handler, recovery, targetAddress, leaderService = null,
) {
  const cache = handler?.systemTableCache ?? null;
  registerRecoveryPublicationPartitionService(leaderService, cache);
  if (handler?.localServices instanceof Map) {
    for (const svc of handler.localServices.values()) {
      registerRecoveryPublicationPartitionService(svc, cache);
    }
  }
  const gateway = resolveRecoveryMetadataGateway(handler);
  const nowMs = Number(handler?.timeSource?.now?.() ?? Date.now());
  const resolvedAddress = isNonEmptyString(targetAddress) ?
    targetAddress : `${recovery.targetNodeId}/partition/${recovery.targetReplicaId}`;
  const targetRow = {
    service_id: recovery.targetReplicaId, replica_id: recovery.targetReplicaId,
    partition_id: recovery.partitionId, service_type: SERVICE_TYPE.PARTITION,
    node_id: recovery.targetNodeId, address: resolvedAddress,
    status: SERVICE_STATUS.ACTIVE, raft_role: RAFT_ROLE.FOLLOWER,
    created_at: recovery.targetReplicaCreatedAt,
    state_entered_at: recovery.targetReplicaCreatedAt, updated_at: nowMs,
  };
  if (!gateway || !gateway.submitMutation || !gateway.deleteSystemTableRow) {
    return Promise.resolve(false);
  }
  const writeOptions = {
    workClass: PRESSURE_WORK_CLASS.CRITICAL,
    deliveryPriority: DEFAULT_VALUE.DELIVERY_PRIORITY_CRITICAL,
  };
  const chains = handler.recoveryPublicationChains instanceof Map ?
    handler.recoveryPublicationChains : (handler.recoveryPublicationChains = new Map());
  const previous = chains.get(recovery.partitionId) ?? Promise.resolve(false);
  const run = previous.catch(() => false).then(async () => {
    const pre = await readRecoveryPublicationAuthority(leaderService, recovery, cache);
    if (!pre.available) return false;
    let targetPersisted = false;
    const isTargetExcluded = () => isExcludedRecoveryServiceReplica(
      recovery.targetReplicaId, recovery.targetReplicaCreatedAt, cache);
    const excludeTarget = () => noteExcludedRecoveryServiceReplica(
      recovery.targetReplicaId, recovery.targetReplicaCreatedAt, cache);
    if (pre.targetStillVoter && !isTargetExcluded()) {
      try {
        const updatedAt = Number(handler?.timeSource?.now?.() ?? Date.now());
        const inserted = await gateway.submitMutation({
          operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
          tableName: SYSTEM_TABLE_NAME.SERVICES,
          row: {...targetRow, updated_at: updatedAt},
        }, {...writeOptions, ignoreExisting: true});
        const mid = await readRecoveryPublicationAuthority(leaderService, recovery, cache);
        let updatedOk = true;
        if (mid.available && mid.targetStillVoter && !isTargetExcluded() &&
            gateway.updateSystemTableRow) {
          const updated = await gateway.updateSystemTableRow(
            SYSTEM_TABLE_NAME.SERVICES,
            {service_id: recovery.targetReplicaId, node_id: recovery.targetNodeId},
            {status: SERVICE_STATUS.ACTIVE, raft_role: RAFT_ROLE.FOLLOWER, updated_at: updatedAt},
            writeOptions,
          );
          if (updated?.success === false) updatedOk = false;
        }
        const postTarget = await readRecoveryPublicationAuthority(leaderService, recovery, cache);
        if (isTargetExcluded() || (postTarget.available && !postTarget.targetStillVoter)) {
          excludeTarget();
          if (!handler?.shuttingDown && postTarget.available) {
            await gateway.deleteSystemTableRow(
              SYSTEM_TABLE_NAME.SERVICES, {service_id: recovery.targetReplicaId}, writeOptions);
          }
          targetPersisted = postTarget.available;
        } else if (postTarget.available && inserted?.success !== false && updatedOk) {
          targetPersisted = true;
        }
      } catch (error) {
        handler.logger?.debug?.(ERROR.CONFIGURATION_IN_TRANSITION, {
          partitionId: recovery.partitionId, error: error?.message ?? String(error),
        });
      }
    } else {
      excludeTarget();
      try {
        const retracted = await gateway.deleteSystemTableRow(
          SYSTEM_TABLE_NAME.SERVICES, {service_id: recovery.targetReplicaId}, writeOptions);
        targetPersisted = retracted?.success !== false;
      } catch (_error) {
        targetPersisted = false;
      }
    }
    let sourceDeleted = !pre.sourceStillAbsent;
    if (pre.sourceStillAbsent) {
      noteExcludedRecoveryServiceReplica(
        recovery.sourceReplicaId, recovery.sourceReplicaCreatedAt, cache);
      try {
        const deleted = await gateway.deleteSystemTableRow(
          SYSTEM_TABLE_NAME.SERVICES, {service_id: recovery.sourceReplicaId}, writeOptions);
        if (deleted?.success !== false) sourceDeleted = true;
      } catch (error) {
        handler.logger?.debug?.(ERROR.CONFIGURATION_IN_TRANSITION, {
          partitionId: recovery.partitionId, error: error?.message ?? String(error),
        });
      }
    }
    const published = targetPersisted && sourceDeleted;
    if (leaderService && published) {
      leaderService.persistedCompletedRecoveryDecisionIds ??= new Set();
      leaderService.persistedCompletedRecoveryDecisionIds.add(recovery.decisionId);
      if (leaderService.lastCompletedMembershipRecovery?.decisionId === recovery.decisionId) {
        leaderService.lastCompletedMembershipRecoveryPersisted = true;
      }
    }
    return published;
  });
  chains.set(recovery.partitionId, run);
  return run;
}

function needsCompletedRecoveryPublication(handler, leaderService, record, allRecoveries = []) {
  const persistedSet = leaderService?.persistedCompletedRecoveryDecisionIds;
  if (!(persistedSet instanceof Set) || !persistedSet.has(record.decisionId)) return true;
  const cache = handler?.systemTableCache;
  if (!cache || !cache.get) return false;
  if ((cache.get(TABLES.SERVICES, record.sourceReplicaId) ?? null) !== null) return true;
  const targetRow = cache.get(TABLES.SERVICES, record.targetReplicaId) ?? null;
  if (isTargetSourceOfLaterRecovery(allRecoveries, record)) {
    return targetRow !== null;
  }
  return targetRow === null || targetRow[COLUMN.STATUS] !== SERVICE_STATUS.ACTIVE;
}

function collectUnsettledSupersededRecoveries(
  leaderService, allRecoveries = null, voterPeerIds = null,
) {
  const records = Array.isArray(allRecoveries) ?
    allRecoveries : readCommittedMembershipRecoveriesIn(leaderService);
  if (records.length <= 1) return [];
  const settled = leaderService?.settledSupersededTargetReplicaIds;
  const latestBySource = new Map();
  for (const record of records) {
    latestBySource.set(String(record.sourcePeerId), record);
  }
  return records.filter((record) => {
    const latest = latestBySource.get(String(record.sourcePeerId));
    if (!latest || record.decisionId === latest.decisionId ||
        record.targetReplicaId === latest.targetReplicaId) {
      return false;
    }
    if (settled instanceof Set && settled.has(record.targetReplicaId)) return false;
    if (voterPeerIds && voterPeerIds.has(String(record.targetPeerId))) return false;
    return !isTargetSourceOfLaterRecovery(records, record);
  });
}

async function reconcileCompletedMembershipRecoveryPublications(
  handler, leaderService, membership = null,
) {
  if (!leaderService || leaderService.isShutdown) {
    return Object.freeze({pendingPublication: false});
  }
  const resolvedMembership = membership ?? await readPartitionCommittedMembership(
    leaderService, COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT);
  if (resolvedMembership?.kind !== COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED) {
    return Object.freeze({pendingPublication: false});
  }
  const voterPeerIds = new Set((resolvedMembership.voters || []).map(String));
  const allRecoveries = readCommittedMembershipRecoveriesIn(leaderService);
  const completedRecoveries = allRecoveries.filter((record) =>
    !voterPeerIds.has(String(record.sourcePeerId)) &&
    (voterPeerIds.has(String(record.targetPeerId)) ||
      isTargetSourceOfLaterRecovery(allRecoveries, record)));
  if (completedRecoveries.length === 0) return Object.freeze({pendingPublication: false});
  let pendingPublication = false;
  const gateway = resolveRecoveryMetadataGateway(handler);
  for (const record of completedRecoveries) {
    if (!needsCompletedRecoveryPublication(handler, leaderService, record, allRecoveries)) continue;
    leaderService.lastCompletedMembershipRecovery = record;
    leaderService.lastCompletedMembershipRecoveryPersisted = false;
    const published = await persistRecoveredServicesRowsAsync(
      handler, record, `${record.targetNodeId}/partition/${record.targetReplicaId}`, leaderService);
    if (!published && gateway?.submitMutation && gateway?.deleteSystemTableRow) {
      pendingPublication = true;
    }
  }
  return Object.freeze({pendingPublication});
}

function hasUnpublishedCompletedMembershipRecovery(handler, leaderService) {
  if (!leaderService || leaderService.isShutdown || !leaderService.db) return false;
  if (leaderService.lastCompletedMembershipRecovery &&
      leaderService.lastCompletedMembershipRecoveryPersisted !== true) {
    return true;
  }
  const records = readCommittedMembershipRecoveriesIn(leaderService);
  if (records.length === 0) return false;
  if (collectUnsettledSupersededRecoveries(leaderService, records).length > 0) return true;
  return records.some((record) =>
    needsCompletedRecoveryPublication(handler, leaderService, record, records));
}

export {
  collectUnsettledSupersededRecoveries, handleMaterializeRecoveryLearner,
  handleObserveRecoveryLearner, hasAnyUnreachableOrDeadClusterNode,
  hasUnpublishedCompletedMembershipRecovery, isNodeEligibleForPermanentLossRecovery,
  isTargetBootSuperseded, observeRecoveryTargetReplica,
  persistRecoveredServicesRowsAsync, planAutonomousPermanentLossRecovery,
  reconcileCompletedMembershipRecoveryPublications, selectEligibleReplacementTargetNode,
};
