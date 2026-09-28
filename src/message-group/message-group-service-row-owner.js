import {AddressManager} from '../address/address-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  ENTITY_TYPE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  isPartitionCleanupServiceRow,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {normalizePublishedRaftRole} from '../raft/published-raft-role.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {durableRowVersion} from
  '../node/replica-state-machine-lifecycle-observation.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';


const MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR = Object.freeze({
  GROUP_ID_REQUIRED: 'MessageGroupServiceRowOwner requires groupId',
  NODE_ID_REQUIRED: 'MessageGroupServiceRowOwner requires nodeId',
  REPLICA_ID_REQUIRED: 'MessageGroupServiceRowOwner requires replicaId',
  INSERT_REQUIRED:
    'MessageGroupServiceRowOwner requires insertSystemTableRow for registration',
  UPDATE_REQUIRED:
    'MessageGroupServiceRowOwner requires updateSystemTableRow for updates',
  DELETE_REQUIRED:
    'MessageGroupServiceRowOwner requires deleteSystemTableRow for removal',
  REMOVAL_VERSION_REQUIRED:
    'MessageGroupServiceRowOwner requires an exact removal version',
  CLEANUP_IN_PROGRESS: 'CLEANUP_IN_PROGRESS',
  CREATE_OWNER_DEFERRED: 'CREATE_OWNER_DEFERRED',
  IDENTITY_CONFLICT: 'SERVICE_IDENTITY_CONFLICT',
  ACTIVATION_OWNER_DEFERRED: 'ACTIVATION_OWNER_DEFERRED',
  REMOVE_OWNER_DEFERRED: 'REMOVE_OWNER_DEFERRED',
});
const SERVICE_ROW_UPDATE_OPTION = Object.freeze({
  allowCoalescing: true,
  deliveryPriority: 'critical',
  pressureRetryAfterMs: 250,
  skipCacheWait: true,
  workClass: 'critical',
});
const MESSAGE_GROUP_SERVICE_POINT_READ_SQL =
  'SELECT * FROM services WHERE service_id = ?';
const MESSAGE_GROUP_CRITICAL_WORK = 'critical';
const MESSAGE_GROUP_UNKNOWN_SERVICE_ID = 'unknown';

function assertRequiredString(value, errorMessage) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(errorMessage);
  }
}

function resolveMessageGroupRaftRole(service) {
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

function messageGroupCreateError(replicaId, code) {
  const error = new Error(`Message-group creation ${code}: ${replicaId}`);
  error.code = code;
  error.errorCode = code;
  error.deferRetry = code !==
    MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.IDENTITY_CONFLICT;
  return error;
}

function messageGroupActivationError(replicaId, code, options = {}) {
  const error = new Error(`Message-group activation ${code}: ${replicaId}`);
  error.code = code;
  error.errorCode = code;
  error.deferRetry = options.deferRetry === true;
  error.cause = options.cause || null;
  error.mutationOutcome = options.mutationOutcome || null;
  return error;
}

async function observeMessageGroupService(systemTableWriter, replicaId) {
  try {
    const read = await readAuthoritativeControlPlaneRows(
      systemTableWriter,
      SYSTEM_TABLE_NAME.SERVICES,
      MESSAGE_GROUP_SERVICE_POINT_READ_SQL,
      [replicaId],
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
        deliveryPriority: MESSAGE_GROUP_CRITICAL_WORK,
        workClass: MESSAGE_GROUP_CRITICAL_WORK,
      },
    );
    const available = read?.success === true && Array.isArray(read.rows);
    return {
      available,
      row: available && read.rows.length === 1 ? read.rows[0] : null,
    };
  } catch (_error) {
    return {available: false, row: null};
  }
}

function rowsMatchMessageGroupRegistration(observed, expected) {
  const fields = [
    'service_id',
    'service_type',
    'group_id',
    'node_id',
    'status',
    'created_at',
    'state_entered_at',
  ];
  return fields.every((field) => observed?.[field] === expected[field]);
}

function hasExactMessageGroupIdentity(observed, expected) {
  return observed?.service_id === expected.service_id &&
    observed?.service_type === SERVICE_TYPE.MESSAGE_GROUP &&
    observed?.group_id === expected.group_id &&
    observed?.node_id === expected.node_id &&
    observed?.replica_id === expected.replica_id &&
    observed?.created_at === expected.created_at;
}

function assertActivationEvidence(row) {
  if (!Number.isFinite(row?.created_at) ||
      !Number.isFinite(row?.updated_at)) {
    throw messageGroupActivationError(
      row?.service_id || MESSAGE_GROUP_UNKNOWN_SERVICE_ID,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.IDENTITY_CONFLICT,
    );
  }
}

function resolveActivationObservation(
  observation,
  expected,
  targetStatus,
  mutation,
) {
  if (!observation.available) {
    throw messageGroupActivationError(
      expected.service_id,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.ACTIVATION_OWNER_DEFERRED,
      {deferRetry: true, ...mutation},
    );
  }
  if (observation.row === null) {
    throw messageGroupActivationError(
      expected.service_id,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.CREATE_OWNER_DEFERRED,
      {deferRetry: true, ...mutation},
    );
  }
  if (isPartitionCleanupServiceRow(observation.row) ||
      !hasExactMessageGroupIdentity(observation.row, expected)) {
    throw messageGroupActivationError(
      expected.service_id,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.IDENTITY_CONFLICT,
      mutation,
    );
  }
  assertActivationEvidence(observation.row);
  if (observation.row.status === targetStatus) {
    return observation.row;
  }
  throw messageGroupActivationError(
    expected.service_id,
    MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.ACTIVATION_OWNER_DEFERRED,
    {deferRetry: true, ...mutation},
  );
}

function requireMessageGroupActivationSource(
  observation,
  identity,
  targetStatus,
) {
  if (!observation.available || observation.row === null) {
    return resolveActivationObservation(observation, identity, targetStatus, {});
  }
  const row = observation.row;
  assertActivationEvidence(row);
  if (isPartitionCleanupServiceRow(row) ||
      row.service_id !== identity.service_id ||
      row.service_type !== identity.service_type ||
      row.group_id !== identity.group_id ||
      row.node_id !== identity.node_id ||
      row.replica_id !== identity.replica_id) {
    throw messageGroupActivationError(identity.service_id,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.IDENTITY_CONFLICT);
  }
  if (row.status === targetStatus) return row;
  const requiredSourceStatus = targetStatus === SERVICE_STATUS.ACTIVE ?
    SERVICE_STATUS.STOPPED : SERVICE_STATUS.ACTIVE;
  if (row.status !== requiredSourceStatus) {
    throw messageGroupActivationError(identity.service_id,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.IDENTITY_CONFLICT);
  }
  return row;
}

// The activation CAS is fenced by the full replica identity, the expected
// source lifecycle state and the canonical lifecycle generation
// (state_entered_at, owned by durableRowVersion). Non-lifecycle writes such as
// the raft-role publisher bump updated_at only, so they never invalidate the
// registration evidence; a genuine lifecycle transition advances the
// generation and fails a delayed activation closed.
function buildMessageGroupActivationPredicate(source) {
  const generation = durableRowVersion(source);
  return {service_id: source.service_id, service_type: source.service_type,
    group_id: source.group_id, node_id: source.node_id,
    replica_id: source.replica_id, status: source.status,
    created_at: source.created_at, [generation.column]: generation.value};
}

async function persistMessageGroupActivation(owner, source, options) {
  const transitionAt = options.timestamp ?? owner.now();
  const updates = {status: options.status,
    raft_role: resolveMessageGroupRaftRole(options.service),
    address: source.address, state_entered_at: transitionAt,
    updated_at: transitionAt};
  let result = null;
  let cause = null;
  try {
    result = await owner.systemTableWriter.updateSystemTableRow(
      SYSTEM_TABLE_NAME.SERVICES,
      buildMessageGroupActivationPredicate(source),
      updates,
      owner.buildDeferredUpdateOptions(source.service_id),
    );
  } catch (error) {
    cause = error;
  }
  const mutation = classifyControlPlaneMutationResult(result);
  if (mutation.applied) return {...source, ...updates};
  const mutationOutcome = mutation.outcome || null;
  const observed = await observeMessageGroupService(
    owner.systemTableWriter,
    source.service_id,
  );
  return resolveActivationObservation(observed, source, options.status,
    {cause, mutationOutcome});
}

async function resolveMessageGroupRegistration(systemTableWriter, row) {
  const {row: observed} = await observeMessageGroupService(
    systemTableWriter,
    row.service_id,
  );
  if (rowsMatchMessageGroupRegistration(observed, row)) return observed;
  if (isPartitionCleanupServiceRow(observed)) {
    throw messageGroupCreateError(
      row.service_id,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.CLEANUP_IN_PROGRESS,
    );
  }
  throw messageGroupCreateError(
    row.service_id,
    observed ? MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.IDENTITY_CONFLICT :
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.CREATE_OWNER_DEFERRED,
  );
}

// Removal deletes exactly the staged STOPPED generation: full identity,
// source status and lifecycle generation, never updated_at, so role or
// heartbeat metadata written while the replica stops cannot invalidate it.
function buildMessageGroupRemovalWhereClause(stoppedRow) {
  return {
    ...buildMessageGroupActivationPredicate(stoppedRow),
    status: SERVICE_STATUS.STOPPED,
  };
}

function messageGroupRemovalErrorCode(observation) {
  if (isPartitionCleanupServiceRow(observation.row)) {
    return MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.CLEANUP_IN_PROGRESS;
  }
  return observation.available && observation.row ?
    MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.IDENTITY_CONFLICT :
    MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.REMOVE_OWNER_DEFERRED;
}

class MessageGroupServiceRowOwner {
  constructor(options = {}) {
    this.systemTableWriter = options.systemTableWriter || null;
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
  }

  static buildServiceRow(options = {}) {
    const {
      groupId,
      replicaId,
      nodeId,
      service = null,
      timestamp = Date.now(),
      status = SERVICE_STATUS.ACTIVE,
      extraFields = null,
    } = options;

    assertRequiredString(
      groupId,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.GROUP_ID_REQUIRED,
    );
    assertRequiredString(
      replicaId,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.REPLICA_ID_REQUIRED,
    );
    assertRequiredString(
      nodeId,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.NODE_ID_REQUIRED,
    );

    const address = AddressManager.getInstance().format(
      nodeId,
      ENTITY_TYPE.MESSAGE_GROUP,
      replicaId,
    );

    return {
      service_id: replicaId,
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: nodeId,
      partition_id: null,
      group_id: groupId,
      replica_id: replicaId,
      raft_role: resolveMessageGroupRaftRole(service),
      status,
      address,
      created_at: timestamp,
      // Registration stamps the canonical lifecycle generation.
      state_entered_at: timestamp,
      updated_at: timestamp,
      ...(extraFields || {}),
    };
  }

  buildDeferredUpdateOptions(serviceId) {
    return {
      ...SERVICE_ROW_UPDATE_OPTION,
      coalescingKey: `services:${serviceId}`,
    };
  }

  async registerReplica(options = {}) {
    if (
      !this.systemTableWriter ||
      typeof this.systemTableWriter.insertSystemTableRow !== 'function'
    ) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.INSERT_REQUIRED,
      );
    }

    const row = MessageGroupServiceRowOwner.buildServiceRow({
      ...options,
      timestamp: options.timestamp ?? this.now(),
    });

    const result = await this.systemTableWriter.insertSystemTableRow(
      SYSTEM_TABLE_NAME.SERVICES,
      row,
      {...this.buildDeferredUpdateOptions(row.service_id),
        allowCoalescing: false},
    );
    if (!classifyControlPlaneMutationResult(result).applied) {
      return resolveMessageGroupRegistration(this.systemTableWriter, row);
    }

    return row;
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
        MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.UPDATE_REQUIRED,
      );
    }

    const identity = MessageGroupServiceRowOwner.buildServiceRow({
      ...options,
      timestamp: options.timestamp ?? this.now(),
    });
    const initial = options.registrationEvidence ?
      {available: true, row: options.registrationEvidence} :
      await observeMessageGroupService(
        this.systemTableWriter,
        identity.service_id,
      );
    const source = requireMessageGroupActivationSource(
      initial,
      identity,
      options.status,
    );
    if (source.status === options.status) return source;
    return persistMessageGroupActivation(this, source, options);
  }

  async removeReplica(options = {}) {
    if (
      !this.systemTableWriter ||
      typeof this.systemTableWriter.deleteSystemTableRow !== 'function'
    ) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.DELETE_REQUIRED,
      );
    }

    const {replicaId, stoppedRow} = options;
    assertRequiredString(
      replicaId,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.REPLICA_ID_REQUIRED,
    );
    if (stoppedRow?.service_id !== replicaId ||
        stoppedRow?.status !== SERVICE_STATUS.STOPPED ||
        !durableRowVersion(stoppedRow)) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.REMOVAL_VERSION_REQUIRED,
      );
    }

    const whereClause = buildMessageGroupRemovalWhereClause(stoppedRow);

    let result = null;
    let mutationError = null;
    try {
      result = await this.systemTableWriter.deleteSystemTableRow(
        SYSTEM_TABLE_NAME.SERVICES,
        whereClause,
        {
          allowCoalescing: false,
          coalescingKey: `services:${replicaId}:message-group-remove:` +
            durableRowVersion(stoppedRow).value,
        },
      );
    } catch (error) {
      mutationError = error;
    }
    const effect = classifyControlPlaneMutationResult(result);
    const observation = await observeMessageGroupService(
      this.systemTableWriter,
      replicaId,
    );
    if (observation.available && observation.row === null) return true;
    const code = messageGroupRemovalErrorCode(observation);
    const error = messageGroupCreateError(replicaId, code);
    error.cause = mutationError;
    error.mutationOutcome = effect.outcome || null;
    throw error;
  }
}

export {MessageGroupServiceRowOwner};
