import {AddressManager} from '../address/address-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  isBootstrapCriticalSystemPartitionId,
} from '../bootstrap/system-partition-classification.js';
import {
  isCriticalLeaderPublication,
} from './partition-leader-publication-criticality.js';
import {
  COLUMN,
  ENTITY_TYPE,
  SERVICE_STATUS,
  SERVICE_TYPE,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {normalizePublishedRaftRole} from '../raft/published-raft-role.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {isCleanupTombstoneRow} from
  '../node/replica-cleanup-tombstone-owner.js';
import {mintServiceRowCreatedAt} from
  '../node/service-row-incarnation.js';


const PARTITION_SERVICE_ROW_OWNER_ERROR = Object.freeze({
  PARTITION_ID_REQUIRED: 'PartitionServiceRowOwner requires partitionId',
  NODE_ID_REQUIRED: 'PartitionServiceRowOwner requires nodeId',
  REPLICA_ID_REQUIRED: 'PartitionServiceRowOwner requires replicaId',
  INSERT_REQUIRED:
    'PartitionServiceRowOwner requires insertSystemTableRow for registration',
  UPDATE_REQUIRED:
    'PartitionServiceRowOwner requires updateSystemTableRow for updates',
  LIFECYCLE_OWNER_REQUIRED:
    'PartitionServiceRowOwner requires ReplicaStateMachine for activation',
  CLEANUP_IN_PROGRESS: 'CLEANUP_IN_PROGRESS',
  CREATE_OWNER_DEFERRED: 'CREATE_OWNER_DEFERRED',
  IDENTITY_CONFLICT: 'REPLICA_IDENTITY_CONFLICT',
});
const SERVICES_ROW_POINT_READ_SQL =
  'SELECT * FROM services WHERE service_id = ?';
const CRITICAL_WORK_CLASS = 'critical';
const SERVICE_ROW_UPDATE_OPTION = Object.freeze({
  allowCoalescing: true,
  deliveryPriority: 'background',
  pressureRetryAfterMs: 250,
  skipCacheWait: true,
  workClass: 'background',
});
const CRITICAL_SERVICE_ROW_UPDATE_OPTION = Object.freeze({
  allowCoalescing: true,
  deliveryPriority: 'critical',
  pressureRetryAfterMs: 250,
  skipCacheWait: true,
  workClass: 'critical',
});
const partitionRegistrationEvidence = new WeakSet();

function sealPartitionRegistrationEvidence(row) {
  const evidence = Object.freeze({...row});
  partitionRegistrationEvidence.add(evidence);
  return evidence;
}

function isPartitionRegistrationEvidence(value) {
  return value !== null && typeof value === 'object' &&
    partitionRegistrationEvidence.has(value);
}

function assertRequiredString(value, errorMessage) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(errorMessage);
  }
}

function resolvePartitionRaftRole(service) {
  const isLeader = service?.isLeader === true ||
    (typeof service?.isLeaderReplica === 'function' &&
      service.isLeaderReplica());
  if (isLeader) {
    return RAFT_ROLE.LEADER;
  }

  if (typeof service?.getRole === 'function') {
    return normalizePublishedRaftRole(service.getRole());
  }

  return normalizePublishedRaftRole(service?.role);
}

function partitionCreateOwnershipError(code, replicaId, cause = null) {
  const error = new Error(`Partition replica creation ${code}: ${replicaId}`);
  error.code = code;
  error.errorCode = code;
  error.deferRetry = code !==
    PARTITION_SERVICE_ROW_OWNER_ERROR.IDENTITY_CONFLICT;
  if (cause) error.cause = cause;
  return error;
}

async function observePartitionRegistration(systemTableWriter, replicaId) {
  try {
    const observation = await readAuthoritativeControlPlaneRows(
      systemTableWriter,
      SYSTEM_TABLE_NAME.SERVICES,
      SERVICES_ROW_POINT_READ_SQL,
      [replicaId],
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
        deliveryPriority: CRITICAL_WORK_CLASS,
        workClass: CRITICAL_WORK_CLASS,
      },
    );
    return observation?.success === true && observation.rows?.length === 1 ?
      observation.rows[0] : null;
  } catch (_error) {
    return null;
  }
}

function rowsMatchPartitionRegistration(observed, expected) {
  const fields = [
    COLUMN.SERVICE_ID,
    COLUMN.SERVICE_TYPE,
    COLUMN.PARTITION_ID,
    COLUMN.NODE_ID,
    COLUMN.REPLICA_ID,
    COLUMN.ADDRESS,
    COLUMN.STATUS,
  ];
  return Number.isSafeInteger(observed?.[COLUMN.CREATED_AT]) &&
    fields.every((field) => observed?.[field] === expected[field]);
}

async function resolvePartitionRegistration(systemTableWriter, row,
  insertError) {
  const observed = await observePartitionRegistration(
    systemTableWriter,
    row.service_id,
  );
  if (isCleanupTombstoneRow(observed)) {
    throw partitionCreateOwnershipError(
      PARTITION_SERVICE_ROW_OWNER_ERROR.CLEANUP_IN_PROGRESS,
      row.service_id,
      insertError,
    );
  }
  if (rowsMatchPartitionRegistration(observed, row)) {
    return sealPartitionRegistrationEvidence(observed);
  }
  throw partitionCreateOwnershipError(
    observed ? PARTITION_SERVICE_ROW_OWNER_ERROR.IDENTITY_CONFLICT :
      PARTITION_SERVICE_ROW_OWNER_ERROR.CREATE_OWNER_DEFERRED,
    row.service_id,
    insertError,
  );
}

class PartitionServiceRowOwner {
  constructor(options = {}) {
    this.systemTableWriter = options.systemTableWriter || null;
    this.replicaStateMachine = options.replicaStateMachine || null;
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
  }

  static buildServiceRow(options = {}) {
    const {
      partitionId,
      replicaId,
      nodeId,
      service = null,
      timestamp = Date.now(),
      status = SERVICE_STATUS.STOPPED,
      extraFields = null,
    } = options;

    assertRequiredString(
      partitionId,
      PARTITION_SERVICE_ROW_OWNER_ERROR.PARTITION_ID_REQUIRED,
    );
    assertRequiredString(
      replicaId,
      PARTITION_SERVICE_ROW_OWNER_ERROR.REPLICA_ID_REQUIRED,
    );
    assertRequiredString(
      nodeId,
      PARTITION_SERVICE_ROW_OWNER_ERROR.NODE_ID_REQUIRED,
    );

    const address = AddressManager.getInstance().format(
      nodeId,
      ENTITY_TYPE.PARTITION,
      replicaId,
    );

    const createdAt = mintServiceRowCreatedAt(timestamp);
    return {
      service_id: replicaId,
      service_type: SERVICE_TYPE.PARTITION,
      node_id: nodeId,
      partition_id: partitionId,
      group_id: null,
      replica_id: replicaId,
      raft_role: resolvePartitionRaftRole(service),
      status,
      address,
      cleanup_token: null,
      create_attempt_token: null,
      created_at: createdAt,
      // Registration stamps the canonical lifecycle generation, so every
      // later lifecycle CAS is fenced by it rather than by updated_at.
      state_entered_at: createdAt,
      updated_at: createdAt,
      ...(extraFields || {}),
    };
  }

  isBootstrapCriticalPartitionId(partitionId) {
    return typeof partitionId === 'string' &&
      isBootstrapCriticalSystemPartitionId(partitionId);
  }

  buildDeferredUpdateOptions(serviceId, partitionId = null) {
    return {
      ...(this.isBootstrapCriticalPartitionId(partitionId) ?
        CRITICAL_SERVICE_ROW_UPDATE_OPTION :
        SERVICE_ROW_UPDATE_OPTION),
      coalescingKey: `services:${serviceId}`,
    };
  }

  // This path publishes from a registered leader service row with no
  // observation of the durable partitions row; the shared criticality
  // owner (quest partition-leader-row-publication-integrity) treats the
  // absent observation as unruled-out divergence, so registration-time
  // leader publications ride the critical lane.
  buildPartitionLeaderUpdateOptions(partitionId, publishingNodeId = null) {
    const critical = isCriticalLeaderPublication({
      observedLeaderNodeId: null,
      partitionId,
      publishingNodeId,
    });
    return {
      ...(critical ?
        CRITICAL_SERVICE_ROW_UPDATE_OPTION :
        SERVICE_ROW_UPDATE_OPTION),
      coalescingKey: `partitions:leader:${partitionId}`,
    };
  }

  async publishCanonicalLeaderNodeId(row) {
    if (!row ||
        row.service_type !== SERVICE_TYPE.PARTITION ||
        row.status !== SERVICE_STATUS.ACTIVE ||
        row.raft_role !== RAFT_ROLE.LEADER ||
        !this.systemTableWriter ||
        typeof this.systemTableWriter.updateSystemTableRow !== 'function') {
      return;
    }

    await this.systemTableWriter.updateSystemTableRow(
      SYSTEM_TABLE_NAME.PARTITIONS,
      {partition_id: row.partition_id},
      {
        leader_node_id: row.node_id,
        updated_at: row.updated_at,
      },
      this.buildPartitionLeaderUpdateOptions(row.partition_id, row.node_id),
    );
  }

  async registerReplica(options = {}) {
    if (
      !this.systemTableWriter ||
      typeof this.systemTableWriter.insertSystemTableRow !== 'function'
    ) {
      throw new Error(
        PARTITION_SERVICE_ROW_OWNER_ERROR.INSERT_REQUIRED,
      );
    }

    const row = Object.freeze(PartitionServiceRowOwner.buildServiceRow({
      ...options,
      timestamp: options.timestamp ?? this.now(),
    }));

    let insertResult;
    let insertError = null;
    try {
      insertResult = await this.systemTableWriter.insertSystemTableRow(
        SYSTEM_TABLE_NAME.SERVICES,
        row,
        {
          ...this.buildDeferredUpdateOptions(row.service_id, row.partition_id),
          allowCoalescing: false,
          coalescingKey: `services:${row.service_id}:create:${row.updated_at}`,
        },
      );
    } catch (error) {
      insertError = error;
    }
    if (!classifyControlPlaneMutationResult(insertResult).applied) {
      return resolvePartitionRegistration(
        this.systemTableWriter,
        row,
        insertError,
      );
    }
    const registrationEvidence = sealPartitionRegistrationEvidence(row);
    await this.publishCanonicalLeaderNodeId(row);

    return registrationEvidence;
  }

  async activateReplica(options = {}) {
    return this.updateReplicaStatus({
      ...options,
      status: SERVICE_STATUS.ACTIVE,
    });
  }

  async updateReplicaStatus(options = {}) {
    if (
      !this.systemTableWriter ||
      typeof this.systemTableWriter.updateSystemTableRow !== 'function'
    ) {
      throw new Error(
        PARTITION_SERVICE_ROW_OWNER_ERROR.UPDATE_REQUIRED,
      );
    }

    if (!this.replicaStateMachine ||
        typeof this.replicaStateMachine.activateRegisteredReplica !==
          'function') {
      throw new Error(
        PARTITION_SERVICE_ROW_OWNER_ERROR.LIFECYCLE_OWNER_REQUIRED,
      );
    }
    if (options.status !== SERVICE_STATUS.ACTIVE) {
      throw new Error(
        PARTITION_SERVICE_ROW_OWNER_ERROR.LIFECYCLE_OWNER_REQUIRED,
      );
    }
    const row = await this.replicaStateMachine.activateRegisteredReplica({
      partitionId: options.partitionId,
      replicaId: options.replicaId,
      nodeId: options.nodeId,
      systemTableWriter: this.systemTableWriter,
      timestamp: options.timestamp ?? this.now(),
      registrationEvidence: options.registrationEvidence,
      isEffectHandlerCurrent: options.isEffectHandlerCurrent,
      writeOptions: this.buildDeferredUpdateOptions(
        options.replicaId,
        options.partitionId,
      ),
    });
    await this.publishCanonicalLeaderNodeId(row);
    return row;
  }
}

export {
  PartitionServiceRowOwner,
  isPartitionRegistrationEvidence,
};
