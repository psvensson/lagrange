// Durable store, generation bindings, log-entry validation, and excluded-member
// fencing for group-bound permanent member loss recovery.

import {CDC_OPERATIONS, COLUMN, TABLES} from '../constants/index.js';
import {RaftRsDurableStore} from '../raft/raft-rs-durable-store.js';
import {raftRsConfStateKey} from '../raft/raft-rs-conf-state-key.js';
import {
  deriveRaftRsPeerId,
  readRaftRsPeerIdentityReservations,
} from '../raft/raft-rs-peer-identity.js';
import {
  PARTITION_MEMBERSHIP_RECOVERY_DEFAULT as DEFAULT_VALUE,
  PARTITION_MEMBERSHIP_RECOVERY_ERROR as ERROR,
  PARTITION_MEMBERSHIP_RECOVERY_FENCE_NOTICE_TYPE,
  PARTITION_MEMBERSHIP_RECOVERY_SQL as SQL,
} from './partition-membership-recovery-constants.js';

const REQUIRED_BINDING_STRING_FIELDS = Object.freeze([
  'partitionId',
  'configurationKey',
  'sourceReplicaId',
  'sourceNodeId',
  'targetReplicaId',
  'targetNodeId',
]);
const REQUIRED_BINDING_POSITIVE_INT_FIELDS = Object.freeze([
  'sourceReplicaCreatedAt',
  'sourceNodeBootIncarnation',
  'targetReplicaCreatedAt',
  'targetNodeBootIncarnation',
]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0;
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function isAbsentValue(value) {
  return value === undefined || value === null || value === '';
}

function deriveCanonicalPeerIdString(replicaId) {
  if (!isNonEmptyString(replicaId)) return null;
  return String(deriveRaftRsPeerId(replicaId));
}

function resolveDatabaseHandle(target) {
  if (!target) return null;
  return target.open !== undefined ? target : target.db ?? null;
}

function ensureMembershipRecoveryTables(target) {
  const db = resolveDatabaseHandle(target);
  if (!db || db.open === false) return;
  if (db._membershipRecoveryTablesEnsured === true) return;
  db.exec(SQL.CREATE_RECOVERY_TABLE);
  db.exec(SQL.CREATE_BINDINGS_TABLE);
  db.exec(SQL.CREATE_LOCAL_FENCE_TABLE);
  db._membershipRecoveryTablesEnsured = true;
}

function hasAnyMembershipRecoveryOrFenceRows(target) {
  const db = resolveDatabaseHandle(target);
  if (!db || db.open === false) return false;
  if (typeof db._hasMembershipRecoveryOrFenceRows === 'boolean') {
    return db._hasMembershipRecoveryOrFenceRows;
  }
  ensureMembershipRecoveryTables(db);
  const hasRows =
    db.prepare(SQL.SELECT_ALL_RECOVERIES).get() !== undefined ||
    db.prepare(SQL.SELECT_ANY_LOCAL_FENCE).get() !== undefined;
  db._hasMembershipRecoveryOrFenceRows = hasRows;
  return hasRows;
}

function noteMembershipRecoveryOrFenceRowWritten(target) {
  const db = resolveDatabaseHandle(target);
  if (!db || db.open === false) return;
  db._hasMembershipRecoveryOrFenceRows = true;
}

function recordPartitionMemberBinding(target, binding) {
  const db = resolveDatabaseHandle(target);
  if (!db || db.open === false || !binding) return false;
  const replicaId = binding.replicaId;
  const nodeId = binding.nodeId;
  const nodeBootIncarnation = Number(binding.nodeBootIncarnation);
  const replicaCreatedAt = Number(binding.replicaCreatedAt);
  const peerId = isNonEmptyString(binding.peerId) ?
    String(binding.peerId) :
    deriveCanonicalPeerIdString(replicaId);
  if (!isNonEmptyString(replicaId) || !isNonEmptyString(peerId) ||
      !isNonEmptyString(nodeId) || !isPositiveSafeInteger(nodeBootIncarnation) ||
      !isPositiveSafeInteger(replicaCreatedAt)) {
    return false;
  }
  ensureMembershipRecoveryTables(db);
  db.prepare(SQL.UPSERT_BINDING).run(
    replicaId,
    peerId,
    nodeId,
    nodeBootIncarnation,
    replicaCreatedAt,
  );
  return true;
}

function readPartitionMemberBinding(target, replicaId) {
  const db = resolveDatabaseHandle(target);
  if (!db || db.open === false || !isNonEmptyString(replicaId)) return null;
  ensureMembershipRecoveryTables(db);
  const row = db.prepare(SQL.SELECT_BINDING).get(replicaId);
  if (!row) return null;
  return Object.freeze({
    replicaId: row.replica_id,
    peerId: row.peer_id,
    nodeId: row.node_id,
    nodeBootIncarnation: Number(row.node_boot_incarnation),
    replicaCreatedAt: Number(row.replica_created_at),
  });
}

function readMetadataMemberBinding(service, replicaId, suppliedNodeId) {
  const cache = service?.systemTableCache;
  if (!cache) return null;
  const serviceRow = cache.get?.(TABLES.SERVICES, replicaId) ?? null;
  const metadataNodeId = serviceRow?.[COLUMN.NODE_ID] ?? null;
  const nodeToRead = isNonEmptyString(suppliedNodeId) ?
    suppliedNodeId : metadataNodeId;
  const nodeRow = isNonEmptyString(nodeToRead) ?
    cache.get?.(TABLES.NODES, nodeToRead) ?? null : null;
  const createdAt = Number(serviceRow?.[COLUMN.CREATED_AT]);
  const bootIncarnation = Number(nodeRow?.[COLUMN.BOOT_INCARNATION]);
  return Object.freeze({
    nodeId: metadataNodeId,
    replicaCreatedAt: isPositiveSafeInteger(createdAt) ? createdAt : null,
    nodeBootIncarnation: isPositiveSafeInteger(bootIncarnation) ?
      bootIncarnation : null,
  });
}

function resolveAuthoritativeMemberBinding(service, replicaId, suppliedNodeId) {
  registerRecoveryPublicationPartitionService(service);
  const durable = readPartitionMemberBinding(service, replicaId);
  if (durable !== null) {
    if (isNonEmptyString(suppliedNodeId) && suppliedNodeId !== durable.nodeId) {
      return Object.freeze({available: false, contradicted: true});
    }
    return Object.freeze({
      available: true,
      contradicted: false,
      replicaId,
      peerId: durable.peerId ?? deriveCanonicalPeerIdString(replicaId),
      nodeId: durable.nodeId,
      replicaCreatedAt: durable.replicaCreatedAt,
      nodeBootIncarnation: durable.nodeBootIncarnation,
    });
  }
  const metadata = readMetadataMemberBinding(
    service,
    replicaId,
    suppliedNodeId ?? null,
  );
  const metadataCreatedAt = metadata?.replicaCreatedAt ?? null;
  const metadataBoot = metadata?.nodeBootIncarnation ?? null;
  const metadataNodeId = metadata?.nodeId ?? null;
  if (isNonEmptyString(suppliedNodeId) &&
      isNonEmptyString(metadataNodeId) &&
      suppliedNodeId !== metadataNodeId) {
    return Object.freeze({available: false, contradicted: true});
  }
  const effectiveNodeId = isNonEmptyString(suppliedNodeId) ?
    suppliedNodeId : metadataNodeId;
  if (!isNonEmptyString(replicaId) || !isNonEmptyString(effectiveNodeId) ||
      !isPositiveSafeInteger(metadataCreatedAt) ||
      !isPositiveSafeInteger(metadataBoot)) {
    return Object.freeze({available: false, contradicted: false});
  }
  return Object.freeze({
    available: true,
    contradicted: false,
    replicaId,
    peerId: deriveCanonicalPeerIdString(replicaId),
    nodeId: effectiveNodeId,
    replicaCreatedAt: metadataCreatedAt,
    nodeBootIncarnation: metadataBoot,
  });
}

function validateMembershipRecoveryBinding(payload) {
  if (!payload || typeof payload !== 'object') {
    return Object.freeze({valid: false, failureCode: ERROR.BINDING_ABSENT});
  }
  const decisionId = payload.decisionId ?? payload.entryId;
  const entryId = payload.entryId ?? payload.decisionId;
  if (isAbsentValue(decisionId) || isAbsentValue(entryId) ||
      isAbsentValue(payload.membershipGenerationIndex) ||
      isAbsentValue(payload.sourcePeerId)) {
    return Object.freeze({valid: false, failureCode: ERROR.BINDING_ABSENT});
  }
  for (const field of REQUIRED_BINDING_STRING_FIELDS) {
    if (isAbsentValue(payload[field])) {
      return Object.freeze({valid: false, failureCode: ERROR.BINDING_ABSENT});
    }
    if (!isNonEmptyString(payload[field])) {
      return Object.freeze({valid: false, failureCode: ERROR.BINDING_INVALID});
    }
  }
  for (const field of REQUIRED_BINDING_POSITIVE_INT_FIELDS) {
    if (isAbsentValue(payload[field])) {
      return Object.freeze({valid: false, failureCode: ERROR.BINDING_ABSENT});
    }
    if (!isPositiveSafeInteger(payload[field])) {
      return Object.freeze({valid: false, failureCode: ERROR.BINDING_INVALID});
    }
  }
  if (!isNonEmptyString(decisionId) || !isNonEmptyString(entryId) ||
      !isNonNegativeSafeInteger(payload.membershipGenerationIndex) ||
      !isNonEmptyString(payload.sourcePeerId)) {
    return Object.freeze({valid: false, failureCode: ERROR.BINDING_INVALID});
  }
  const expectedSourcePeerId = deriveCanonicalPeerIdString(payload.sourceReplicaId);
  const expectedTargetPeerId = deriveCanonicalPeerIdString(payload.targetReplicaId);
  const suppliedTargetPeerId = isAbsentValue(payload.targetPeerId) ?
    expectedTargetPeerId : payload.targetPeerId;
  if (expectedSourcePeerId === null || expectedTargetPeerId === null ||
      payload.sourcePeerId !== expectedSourcePeerId ||
      suppliedTargetPeerId !== expectedTargetPeerId) {
    return Object.freeze({valid: false, failureCode: ERROR.BINDING_INVALID});
  }
  if (payload.sourceReplicaId === payload.targetReplicaId ||
      payload.sourceNodeId === payload.targetNodeId ||
      payload.sourcePeerId === suppliedTargetPeerId) {
    return Object.freeze({valid: false, failureCode: ERROR.TARGET_INVALID});
  }
  return Object.freeze({
    valid: true,
    normalized: Object.freeze({
      decisionId,
      entryId,
      partitionId: payload.partitionId,
      configurationKey: payload.configurationKey,
      membershipGenerationIndex: payload.membershipGenerationIndex,
      sourcePeerId: expectedSourcePeerId,
      sourceReplicaId: payload.sourceReplicaId,
      sourceReplicaCreatedAt: payload.sourceReplicaCreatedAt,
      sourceNodeId: payload.sourceNodeId,
      sourceNodeBootIncarnation: payload.sourceNodeBootIncarnation,
      targetPeerId: expectedTargetPeerId,
      targetReplicaId: payload.targetReplicaId,
      targetReplicaCreatedAt: payload.targetReplicaCreatedAt,
      targetNodeId: payload.targetNodeId,
      targetNodeBootIncarnation: payload.targetNodeBootIncarnation,
    }),
  });
}

function rowToRecoveryRecord(row) {
  if (!row) return null;
  return Object.freeze({
    decisionId: row.decision_id,
    entryId: row.entry_id,
    partitionId: row.partition_id,
    configurationKey: row.configuration_key,
    membershipGenerationIndex: Number(row.membership_generation_index),
    sourcePeerId: row.source_peer_id,
    sourceReplicaId: row.source_replica_id,
    sourceReplicaCreatedAt: Number(row.source_replica_created_at),
    sourceNodeId: row.source_node_id,
    sourceNodeBootIncarnation: Number(row.source_node_boot_incarnation),
    targetPeerId: row.target_peer_id,
    targetReplicaId: row.target_replica_id,
    targetReplicaCreatedAt: Number(row.target_replica_created_at),
    targetNodeId: row.target_node_id,
    targetNodeBootIncarnation: Number(row.target_node_boot_incarnation),
    intentLogIndex: Number(row.intent_log_index),
    intentTerm: Number(row.intent_term),
  });
}

function recoveryRowMatchesCommand(record, command) {
  if (!record || !command) return false;
  return record.decisionId === command.decisionId &&
    record.entryId === command.entryId &&
    record.partitionId === command.partitionId &&
    record.configurationKey === command.configurationKey &&
    record.membershipGenerationIndex === command.membershipGenerationIndex &&
    record.sourcePeerId === command.sourcePeerId &&
    record.sourceReplicaId === command.sourceReplicaId &&
    record.sourceReplicaCreatedAt === command.sourceReplicaCreatedAt &&
    record.sourceNodeId === command.sourceNodeId &&
    record.sourceNodeBootIncarnation === command.sourceNodeBootIncarnation &&
    record.targetPeerId === command.targetPeerId &&
    record.targetReplicaId === command.targetReplicaId &&
    record.targetReplicaCreatedAt === command.targetReplicaCreatedAt &&
    record.targetNodeId === command.targetNodeId &&
    record.targetNodeBootIncarnation === command.targetNodeBootIncarnation;
}

function readCommittedMembershipRecoveryByIdIn(target, decisionId) {
  const db = resolveDatabaseHandle(target);
  if (!db || db.open === false || !isNonEmptyString(decisionId)) return null;
  ensureMembershipRecoveryTables(db);
  return rowToRecoveryRecord(
    db.prepare(SQL.SELECT_BY_DECISION_ID).get(decisionId),
  );
}

function readCommittedMembershipRecoveryByEntryIn(target, entryId) {
  const db = resolveDatabaseHandle(target);
  if (!db || db.open === false || !isNonEmptyString(entryId)) return null;
  ensureMembershipRecoveryTables(db);
  return rowToRecoveryRecord(
    db.prepare(SQL.SELECT_BY_ENTRY_ID).get(entryId),
  );
}

function readCommittedMembershipRecoveriesIn(target) {
  const db = resolveDatabaseHandle(target);
  if (!db || db.open === false) return Object.freeze([]);
  ensureMembershipRecoveryTables(db);
  return Object.freeze(
    db.prepare(SQL.SELECT_ALL_RECOVERIES).all().map(rowToRecoveryRecord),
  );
}

function validateMembershipRecoveryIntentAtLogEntry(service, command, options = {}) {
  registerRecoveryPublicationPartitionService(service);
  if (command.partitionId !== service.partitionId) {
    return Object.freeze({valid: false, failureCode: ERROR.PARTITION_MISMATCH});
  }
  ensureMembershipRecoveryTables(service.db);
  const existingById = readCommittedMembershipRecoveryByIdIn(
    service.db, command.decisionId);
  if (existingById !== null) {
    return recoveryRowMatchesCommand(existingById, command) ?
      Object.freeze({valid: true, replayed: true, record: existingById}) :
      Object.freeze({valid: false, failureCode: ERROR.INTENT_CONFLICT});
  }
  const existingByEntry = readCommittedMembershipRecoveryByEntryIn(
    service.db, command.entryId);
  if (existingByEntry !== null) {
    return recoveryRowMatchesCommand(existingByEntry, command) ?
      Object.freeze({valid: true, replayed: true, record: existingByEntry}) :
      Object.freeze({valid: false, failureCode: ERROR.INTENT_CONFLICT});
  }
  const durableRecord = RaftRsDurableStore.readDurableRecordIn(
    service.db, service.partitionId);
  const confState = durableRecord.confState;
  const status = service.raft?.readStatus?.() ?? null;
  if ((confState.votersOutgoing || []).length > 0 ||
      (confState.learnersNext || []).length > 0 ||
      (options.checkPendingConfChange === true && status?.confChangePending === true)) {
    return Object.freeze({
      valid: false,
      failureCode: ERROR.CONFIGURATION_IN_TRANSITION,
    });
  }
  const currentConfigurationKey = raftRsConfStateKey(confState);
  const currentGenerationIndex = Number(durableRecord.membershipGenerationIndex);
  if (currentConfigurationKey !== command.configurationKey ||
      currentGenerationIndex !== command.membershipGenerationIndex) {
    return Object.freeze({valid: false, failureCode: ERROR.CONFIGURATION_STALE});
  }
  const voters = (confState.voters || []).map(String);
  if (!voters.includes(command.sourcePeerId)) {
    return Object.freeze({valid: false, failureCode: ERROR.SOURCE_NOT_VOTER});
  }
  const reservations = readRaftRsPeerIdentityReservations(service.db);
  const sourceReservation = reservations.find((item) =>
    String(item.peerId) === command.sourcePeerId ||
    item.replicaIdentity === command.sourceReplicaId) ?? null;
  if (sourceReservation === null ||
      String(sourceReservation.peerId) !== command.sourcePeerId ||
      sourceReservation.replicaIdentity !== command.sourceReplicaId ||
      (isNonEmptyString(sourceReservation.nodeId) &&
        sourceReservation.nodeId !== command.sourceNodeId)) {
    return Object.freeze({valid: false, failureCode: ERROR.SOURCE_NOT_VOTER});
  }
  if (options.checkPendingConfChange === true) {
    const binding = resolveAuthoritativeMemberBinding(
      service, command.sourceReplicaId, command.sourceNodeId);
    if (binding.contradicted === true) {
      return Object.freeze({
        valid: false,
        failureCode: ERROR.SOURCE_GENERATION_MISMATCH,
      });
    }
    if (binding.available !== true) {
      return Object.freeze({valid: false, failureCode: ERROR.BINDING_ABSENT});
    }
    if (binding.nodeId !== command.sourceNodeId ||
        binding.nodeBootIncarnation !== command.sourceNodeBootIncarnation ||
        binding.replicaCreatedAt !== command.sourceReplicaCreatedAt) {
      return Object.freeze({
        valid: false,
        failureCode: ERROR.SOURCE_GENERATION_MISMATCH,
      });
    }
  } else {
    const durableBinding = readPartitionMemberBinding(
      service.db, command.sourceReplicaId);
    if (durableBinding !== null &&
        (durableBinding.nodeId !== command.sourceNodeId ||
          durableBinding.nodeBootIncarnation !== command.sourceNodeBootIncarnation ||
          durableBinding.replicaCreatedAt !== command.sourceReplicaCreatedAt)) {
      return Object.freeze({
        valid: false,
        failureCode: ERROR.SOURCE_GENERATION_MISMATCH,
      });
    }
  }
  if (voters.includes(command.targetPeerId) ||
      (confState.votersOutgoing || []).map(String).includes(command.targetPeerId)) {
    return Object.freeze({valid: false, failureCode: ERROR.TARGET_INVALID});
  }
  const targetReservation = reservations.find((item) =>
    String(item.peerId) === command.targetPeerId ||
    item.replicaIdentity === command.targetReplicaId) ?? null;
  if (targetReservation !== null &&
      (String(targetReservation.peerId) !== command.targetPeerId ||
        targetReservation.replicaIdentity !== command.targetReplicaId ||
        (isNonEmptyString(targetReservation.nodeId) &&
          targetReservation.nodeId !== command.targetNodeId))) {
    return Object.freeze({valid: false, failureCode: ERROR.TARGET_INVALID});
  }
  return Object.freeze({valid: true, replayed: false});
}

const {
  BOOT_INCARNATION: DEFAULT_BOOT_INCARNATION,
  CREATED_AT: DEFAULT_CREATED_AT,
  EMPTY_STRING,
  FENCE_DECISION_ID,
  GENERATION_INDEX: DEFAULT_GENERATION_INDEX,
} = DEFAULT_VALUE;

function prepareRecoveryFenceHolder(holder) {
  if (!holder || !holder.applySystemTableChange) return false;
  if (!(holder.excludedRecoveryServiceReplicas instanceof Map)) {
    holder.excludedRecoveryServiceReplicas = new Map();
  }
  if (!(holder.observedRecoveryPartitionServices instanceof Set)) {
    holder.observedRecoveryPartitionServices = new Set();
  }
  if (holder.recoveryServiceCacheFenceInstalled !== true) {
    const baseApply = holder.applySystemTableChange.bind(holder);
    holder.applySystemTableChange = (tableName, operation, row, options) => {
      if (tableName === TABLES.SERVICES &&
          operation !== CDC_OPERATIONS.DELETE &&
          isExcludedRecoveryServiceReplica(row?.service_id, Number(row?.created_at), holder)) {
        return false;
      }
      return baseApply(tableName, operation, row, options);
    };
    holder.recoveryServiceCacheFenceInstalled = true;
  }
  return true;
}

function noteExcludedRecoveryServiceReplica(replicaId, createdAt = null, holder = null) {
  if (!isNonEmptyString(replicaId) || !prepareRecoveryFenceHolder(holder)) return;
  const map = holder.excludedRecoveryServiceReplicas;
  const prev = map.get(replicaId) ?? 0;
  const next = isPositiveSafeInteger(createdAt) ? Math.max(prev, createdAt) : prev;
  map.set(replicaId, next);
}

function isReplicaReplacedInObservedService(replicaId, holder) {
  if (!prepareRecoveryFenceHolder(holder)) return false;
  for (const service of holder.observedRecoveryPartitionServices) {
    const handle = resolveDatabaseHandle(service);
    if (!handle || handle.open === false) {
      holder.observedRecoveryPartitionServices.delete(service);
      continue;
    }
    ensureMembershipRecoveryTables(handle);
    const asSource = handle.prepare(SQL.SELECT_BY_SOURCE_REPLICA_ID).get(replicaId);
    if (!asSource) continue;
    const allRows = handle.prepare(SQL.SELECT_ALL_RECOVERIES).all();
    const wasRecoveryTarget = allRows.some((r) => r.target_replica_id === replicaId);
    let absentFromVoters = false;
    if (!wasRecoveryTarget && isNonEmptyString(service?.partitionId)) {
      const durableRecord = RaftRsDurableStore.readDurableRecordIn(handle, service.partitionId);
      const confState = durableRecord?.confState;
      const activeVoters = new Set([
        ...(confState?.voters || []).map(String),
        ...(confState?.votersOutgoing || []).map(String),
      ]);
      absentFromVoters = !activeVoters.has(String(asSource.source_peer_id));
    }
    if (wasRecoveryTarget || absentFromVoters) {
      noteExcludedRecoveryServiceReplica(
        replicaId, Number(asSource.source_replica_created_at), holder);
      return true;
    }
  }
  return false;
}

function isExcludedRecoveryServiceReplica(replicaId, createdAt = null, holder = null) {
  if (!isNonEmptyString(replicaId) || !prepareRecoveryFenceHolder(holder)) return false;
  const map = holder.excludedRecoveryServiceReplicas;
  if (!map.has(replicaId) && !isReplicaReplacedInObservedService(replicaId, holder)) {
    return false;
  }
  const fenceCreatedAt = map.get(replicaId) ?? 0;
  if (!isPositiveSafeInteger(fenceCreatedAt) || !isPositiveSafeInteger(createdAt)) {
    return true;
  }
  return createdAt <= fenceCreatedAt;
}

function installRecoveryServiceCacheFence(holder) {
  prepareRecoveryFenceHolder(holder);
}

function registerRecoveryPublicationPartitionService(service, holder = null) {
  const firstHolder = service?.systemTableCache ?? null;
  const hasFirst = prepareRecoveryFenceHolder(firstHolder);
  const hasSecond = prepareRecoveryFenceHolder(holder);
  if (service && resolveDatabaseHandle(service)) {
    if (hasFirst) firstHolder.observedRecoveryPartitionServices.add(service);
    if (hasSecond) holder.observedRecoveryPartitionServices.add(service);
  }
}

function markLocalReplicaExcludedFence(service, recovery) {
  const db = resolveDatabaseHandle(service);
  if (!db || db.open === false || !recovery) return false;
  const replicaId = isNonEmptyString(recovery.sourceReplicaId) ?
    recovery.sourceReplicaId : service?.replicaId;
  if (!isNonEmptyString(replicaId)) return false;
  const partitionId = isNonEmptyString(recovery.partitionId) ?
    recovery.partitionId : (service?.partitionId ?? EMPTY_STRING);
  const sourceNodeId = isNonEmptyString(recovery.sourceNodeId) ?
    recovery.sourceNodeId : (service?.nodeId ?? EMPTY_STRING);
  const sourcePeerId = isNonEmptyString(recovery.sourcePeerId) ?
    recovery.sourcePeerId :
    (deriveCanonicalPeerIdString(replicaId) ?? EMPTY_STRING);
  const decisionId = isNonEmptyString(recovery.decisionId) ?
    recovery.decisionId : FENCE_DECISION_ID;
  const configurationKey = isNonEmptyString(recovery.configurationKey) ?
    recovery.configurationKey : EMPTY_STRING;
  ensureMembershipRecoveryTables(db);
  db.prepare(SQL.UPSERT_LOCAL_FENCE).run(
    replicaId,
    decisionId,
    partitionId,
    sourcePeerId,
    sourceNodeId,
    Number(recovery.sourceNodeBootIncarnation) || DEFAULT_BOOT_INCARNATION,
    Number(recovery.sourceReplicaCreatedAt) || DEFAULT_CREATED_AT,
    configurationKey,
    Number(recovery.membershipGenerationIndex) || DEFAULT_GENERATION_INDEX,
  );
  noteMembershipRecoveryOrFenceRowWritten(db);
  if (service && service.db) {
    service.excludedMemberGenerationFenced = true;
  }
  return true;
}

function isLocalReplicaExcludedFenced(service) {
  if (!service) return false;
  if (service.excludedMemberGenerationFenced === true) return true;
  const db = service.db;
  if (!db || db.open === false || !isNonEmptyString(service.replicaId)) {
    return false;
  }
  if (!hasAnyMembershipRecoveryOrFenceRows(db)) return false;
  const localFence = db.prepare(SQL.SELECT_LOCAL_FENCE).get(service.replicaId);
  if (localFence !== undefined) {
    service.excludedMemberGenerationFenced = true;
    return true;
  }
  const recoveryRow = db.prepare(SQL.SELECT_BY_SOURCE_REPLICA_ID)
    .get(service.replicaId);
  if (recoveryRow !== undefined) {
    service.excludedMemberGenerationFenced = true;
    return true;
  }
  return false;
}

function isPeerExcludedInGroup(service, peerQuery = {}) {
  const db = service?.db;
  if (!db || db.open === false) return null;
  if (!hasAnyMembershipRecoveryOrFenceRows(db)) return null;
  let row = null;
  if (isNonEmptyString(peerQuery.replicaId)) {
    row = db.prepare(SQL.SELECT_BY_SOURCE_REPLICA_ID).get(peerQuery.replicaId);
  }
  if (!row && isNonEmptyString(peerQuery.peerId)) {
    row = db.prepare(SQL.SELECT_BY_SOURCE_PEER_ID).get(String(peerQuery.peerId));
  }
  if (!row) return null;
  const durableRecord = RaftRsDurableStore.readDurableRecordIn(
    db, service.partitionId);
  const confState = durableRecord.confState;
  const activeVoters = new Set([
    ...(confState.voters || []).map(String),
    ...(confState.votersOutgoing || []).map(String),
  ]);
  if (activeVoters.has(String(row.source_peer_id))) {
    return null;
  }
  return rowToRecoveryRecord(row);
}

function excludedMemberFenceRefusalOf(service) {
  return Object.freeze({
    success: false,
    partitionId: service?.partitionId ?? null,
    failureCode: ERROR.RETIRED_MEMBER_FENCED,
    error: ERROR.RETIRED_MEMBER_FENCED,
  });
}

function extractSenderPeerId(payload) {
  const nestedFrom = payload?.message?.from;
  if (nestedFrom !== undefined && nestedFrom !== null) {
    return String(nestedFrom);
  }
  const topFrom = payload?.from;
  return topFrom !== undefined && topFrom !== null ? String(topFrom) : null;
}

function extractSenderReplicaId(envelope, payload) {
  if (isNonEmptyString(envelope?.sourceReplica)) {
    return envelope.sourceReplica;
  }
  return isNonEmptyString(payload?.sourceReplica) ? payload.sourceReplica : null;
}

function checkExcludedMemberEnvelopeFence(service, envelope, payload) {
  if (isLocalReplicaExcludedFenced(service)) {
    return excludedMemberFenceRefusalOf(service);
  }
  const excludedSender = isPeerExcludedInGroup(service, {
    peerId: extractSenderPeerId(payload),
    replicaId: extractSenderReplicaId(envelope, payload),
  });
  if (excludedSender === null) {
    return null;
  }
  if (service.transport) {
    const excludedAddress =
      `${excludedSender.sourceNodeId}/partition/${excludedSender.sourceReplicaId}`;
    void Promise.resolve(service.transport.deliver?.(excludedAddress, {
      type: PARTITION_MEMBERSHIP_RECOVERY_FENCE_NOTICE_TYPE,
      recovery: excludedSender,
    })).catch((error) => {
      service.logger?.debug?.(ERROR.RETIRED_MEMBER_FENCED, {
        partitionId: service.partitionId,
        error: error?.message,
      });
    });
  }
  return excludedMemberFenceRefusalOf(service);
}

export {
  checkExcludedMemberEnvelopeFence,
  deriveCanonicalPeerIdString,
  ensureMembershipRecoveryTables,
  excludedMemberFenceRefusalOf,
  installRecoveryServiceCacheFence,
  isExcludedRecoveryServiceReplica,
  isLocalReplicaExcludedFenced,
  isPeerExcludedInGroup,
  markLocalReplicaExcludedFence,
  noteExcludedRecoveryServiceReplica,
  noteMembershipRecoveryOrFenceRowWritten,
  readCommittedMembershipRecoveriesIn,
  readCommittedMembershipRecoveryByEntryIn,
  readCommittedMembershipRecoveryByIdIn,
  readPartitionMemberBinding,
  recordPartitionMemberBinding,
  recoveryRowMatchesCommand,
  registerRecoveryPublicationPartitionService,
  resolveAuthoritativeMemberBinding,
  validateMembershipRecoveryBinding,
  validateMembershipRecoveryIntentAtLogEntry,
};
