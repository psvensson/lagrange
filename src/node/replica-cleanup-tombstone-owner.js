import {randomUUID} from 'node:crypto';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_READ_LEADER_MODE,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {
  SERVICE_TYPE,
  TABLES,
  isPartitionCleanupServiceRow,
} from '../constants/index.js';
import {observeAuthoritativeReplicaLifecycle} from
  './replica-state-machine-lifecycle-observation.js';

const REPLICA_CLEANUP_SERVICE_TYPE = SERVICE_TYPE.PARTITION_CLEANUP;
const REPLICA_CLEANUP_STATUS = 'cleanup_owned';
const REPLICA_CLEANUP_CRITICAL_WORK = 'critical';
const REPLICA_CLEANUP_STARTUP_SNAPSHOT_ID = 'startup-snapshot';
const REPLICA_CLEANUP_ERROR_CODE = Object.freeze({
  CLEANUP_IN_PROGRESS: 'CLEANUP_IN_PROGRESS',
  CLEANUP_IDENTITY_CONFLICT: 'CLEANUP_IDENTITY_CONFLICT',
  CLEANUP_OWNERSHIP_CHANGED: 'CLEANUP_OWNERSHIP_CHANGED',
  CLEANUP_OWNER_DEFERRED: 'CLEANUP_OWNER_DEFERRED',
});
const REPLICA_CLEANUP_ACQUIRE_OUTCOME = Object.freeze({
  ACQUIRED: 'acquired',
  DEFERRED: 'deferred',
  LIVE_GENERATION: 'live_generation',
  OWNED: 'owned',
});

function isCleanupTombstoneRow(row) {
  return isPartitionCleanupServiceRow(row) &&
    row?.status === REPLICA_CLEANUP_STATUS;
}

function cleanupAuthorityFromRow(row) {
  if (!isCleanupTombstoneRow(row) ||
      typeof row.cleanup_token !== 'string' ||
      !Number.isFinite(row.updated_at)) return false;
  return Object.freeze({
    kind: REPLICA_CLEANUP_STATUS,
    nodeId: row.node_id,
    ownerToken: row.cleanup_token,
    partitionId: row.partition_id,
    replicaId: row.service_id,
    updatedAt: row.updated_at,
  });
}

function rowMatchesCleanupAuthority(row, authority) {
  return isCleanupTombstoneRow(row) &&
    row.service_id === authority?.replicaId &&
    row.partition_id === authority?.partitionId &&
    row.node_id === authority?.nodeId &&
    row.cleanup_token === authority?.ownerToken &&
    row.updated_at === authority?.updatedAt;
}

function rowIsReplacementForAuthority(row, authority) {
  const expected = {
    service_id: authority?.replicaId,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: authority?.partitionId,
    node_id: authority?.nodeId,
  };
  return Object.entries(expected).every(([field, value]) =>
    row?.[field] === value) &&
    typeof row?.status === 'string' &&
    (Number.isFinite(row?.state_entered_at) ||
      Number.isFinite(row?.updated_at));
}

function throwCleanupReleaseDeferred(authority, effect, result = null) {
  const error = cleanupDeferredError(authority.replicaId);
  error.mutationOutcome = effect.outcome || null;
  error.retryAfterMs = Number.isFinite(result?.retryAfterMs) ?
    result.retryAfterMs : null;
  throw error;
}

function cleanupDeferredError(replicaId, code =
REPLICA_CLEANUP_ERROR_CODE.CLEANUP_OWNER_DEFERRED) {
  const error = new Error(`Replica cleanup ownership deferred for ${replicaId}`);
  error.code = code;
  error.errorCode = code;
  error.deferRetry = code !==
    REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IDENTITY_CONFLICT;
  return error;
}

class ReplicaCleanupTombstoneOwner {
  constructor(options = {}) {
    this.gateway = options.gateway;
    this.observe = options.observe;
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.randomUUID = options.randomUUID || randomUUID;
  }

  async observeReplica(replicaId) {
    if (typeof this.observe === 'function') return this.observe(replicaId);
    return observeAuthoritativeReplicaLifecycle({
      getControlPlaneSystemTableGateway: () => this.gateway,
    }, replicaId);
  }

  async acquire({replicaId, partitionId, nodeId, reason}) {
    const now = this.now();
    const row = {
      service_id: replicaId,
      service_type: REPLICA_CLEANUP_SERVICE_TYPE,
      node_id: nodeId,
      partition_id: partitionId,
      group_id: null,
      replica_id: null,
      raft_role: null,
      status: REPLICA_CLEANUP_STATUS,
      state_entered_at: null,
      previous_state: null,
      address: null,
      cleanup_token: this.randomUUID(),
      trigger_reason: reason || 'startup_orphan_cleanup',
      error_message: null,
      created_at: now,
      updated_at: now,
    };
    let result;
    try {
      result = await this.gateway.submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName: TABLES.SERVICES,
        row,
      }, {
        allowCoalescing: false,
        coalescingKey: `services:${replicaId}:cleanup:${row.cleanup_token}`,
        deliveryPriority: REPLICA_CLEANUP_CRITICAL_WORK,
        workClass: REPLICA_CLEANUP_CRITICAL_WORK,
        skipCacheWait: true,
      });
    } catch (_error) {
      result = null;
    }
    const effect = classifyControlPlaneMutationResult(result);
    const observation = await this.observeReplica(replicaId);
    if (observation.available !== true) {
      return Object.freeze({
        authority: null,
        outcome: REPLICA_CLEANUP_ACQUIRE_OUTCOME.DEFERRED,
      });
    }
    const authority = cleanupAuthorityFromRow(observation.row);
    if (authority && rowMatchesCleanupAuthority(observation.row,
      cleanupAuthorityFromRow(row))) {
      return Object.freeze({authority,
        outcome: REPLICA_CLEANUP_ACQUIRE_OUTCOME.ACQUIRED});
    }
    if (authority) {
      return Object.freeze({authority: null,
        outcome: REPLICA_CLEANUP_ACQUIRE_OUTCOME.OWNED});
    }
    return Object.freeze({
      authority: null,
      mutationOutcome: effect.outcome || null,
      outcome: observation.row ?
        REPLICA_CLEANUP_ACQUIRE_OUTCOME.LIVE_GENERATION :
        REPLICA_CLEANUP_ACQUIRE_OUTCOME.DEFERRED,
    });
  }

  async snapshotPersistedAtStartup(nodeId) {
    const result = await readAuthoritativeControlPlaneRows(
      this.gateway,
      TABLES.SERVICES,
      'SELECT service_id, service_type, node_id, partition_id, status, ' +
        'cleanup_token, updated_at FROM services WHERE service_type = ? ' +
        'AND status = ? AND node_id = ?',
      [REPLICA_CLEANUP_SERVICE_TYPE, REPLICA_CLEANUP_STATUS, nodeId],
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
        deliveryPriority: REPLICA_CLEANUP_CRITICAL_WORK,
        workClass: REPLICA_CLEANUP_CRITICAL_WORK,
      },
    );
    if (result?.success !== true || !Array.isArray(result.rows)) {
      throw cleanupDeferredError(REPLICA_CLEANUP_STARTUP_SNAPSHOT_ID);
    }
    const authorities = new Map();
    for (const row of result.rows) {
      const authority = cleanupAuthorityFromRow(row);
      if (authority && authority.nodeId === nodeId &&
          typeof authority.partitionId === 'string' &&
          authority.partitionId.length > 0) {
        authorities.set(authority.replicaId, authority);
      }
    }
    return authorities;
  }

  async resumePersistedAtStartup(
    startupAuthorities,
    {replicaId, partitionId, nodeId},
  ) {
    const authority = startupAuthorities?.get?.(replicaId) || null;
    if (authority?.replicaId !== replicaId ||
        authority?.partitionId !== partitionId ||
        authority?.nodeId !== nodeId) return null;
    return await this.requireCurrent(authority) ? authority : null;
  }

  async takeoverRemoving(removingAuthority, reason) {
    const ownerToken = this.randomUUID();
    const updatedAt = this.now();
    const whereClause = {
      service_id: removingAuthority.replicaState.serviceId,
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: removingAuthority.replicaState.partitionId,
      node_id: removingAuthority.replicaState.nodeId,
      status: 'removing',
      [removingAuthority.durableVersionColumn]:
        removingAuthority.durableVersion,
    };
    const data = {
      service_type: REPLICA_CLEANUP_SERVICE_TYPE,
      status: REPLICA_CLEANUP_STATUS,
      replica_id: null,
      group_id: null,
      raft_role: null,
      state_entered_at: null,
      previous_state: null,
      address: null,
      cleanup_token: ownerToken,
      trigger_reason: reason || 'durable_replica_removal',
      error_message: null,
      updated_at: updatedAt,
    };
    let result = null;
    let mutationError = null;
    try {
      result = await this.gateway.submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.SERVICES,
        whereClause,
        data,
      }, {
        allowCoalescing: false,
        coalescingKey: `services:${whereClause.service_id}:cleanup-takeover:` +
          ownerToken,
        deliveryPriority: REPLICA_CLEANUP_CRITICAL_WORK,
        workClass: REPLICA_CLEANUP_CRITICAL_WORK,
        skipCacheWait: true,
      });
    } catch (error) {
      mutationError = error;
      // Resolve apply-then-ACK-loss through the owner-required reread below.
    }
    const observation = await this.observeReplica(whereClause.service_id);
    const authority = observation.available === true ?
      cleanupAuthorityFromRow(observation.row) : null;
    if (authority?.ownerToken === ownerToken) return authority;
    const effect = classifyControlPlaneMutationResult(result);
    const error = cleanupDeferredError(whereClause.service_id);
    error.cause = mutationError;
    error.mutationOutcome = effect.outcome || null;
    error.retryAfterMs = Number.isFinite(result?.retryAfterMs) ?
      result.retryAfterMs : null;
    throw error;
  }

  async requireCurrent(authority) {
    const observation = await this.observeReplica(authority.replicaId);
    return observation.available === true &&
      rowMatchesCleanupAuthority(observation.row, authority);
  }

  async release(authority, completion = {}) {
    if (completion.artifactsAbsent !== true) return false;
    if (!await this.requireCurrent(authority)) return false;
    let result;
    try {
      result = await this.gateway.submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
        tableName: TABLES.SERVICES,
        whereClause: {
          service_id: authority.replicaId,
          service_type: REPLICA_CLEANUP_SERVICE_TYPE,
          partition_id: authority.partitionId,
          node_id: authority.nodeId,
          status: REPLICA_CLEANUP_STATUS,
          cleanup_token: authority.ownerToken,
          updated_at: authority.updatedAt,
        },
      }, {
        allowCoalescing: false,
        coalescingKey: `services:${authority.replicaId}:cleanup-release:` +
          authority.ownerToken,
        deliveryPriority: REPLICA_CLEANUP_CRITICAL_WORK,
        workClass: REPLICA_CLEANUP_CRITICAL_WORK,
        skipCacheWait: true,
      });
    } catch (_error) {
      result = null;
    }
    const effect = classifyControlPlaneMutationResult(result);
    const observation = await this.observeReplica(authority.replicaId);
    if (observation.available !== true) {
      throwCleanupReleaseDeferred(authority, effect);
    }
    if (observation.row === null) return true;
    if (rowMatchesCleanupAuthority(observation.row, authority)) {
      throwCleanupReleaseDeferred(authority, effect, result);
    }
    if (isCleanupTombstoneRow(observation.row)) {
      throw cleanupDeferredError(
        authority.replicaId,
        REPLICA_CLEANUP_ERROR_CODE.CLEANUP_OWNERSHIP_CHANGED,
      );
    }
    if (rowIsReplacementForAuthority(observation.row, authority)) return true;
    throw cleanupDeferredError(
      authority.replicaId,
      REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IDENTITY_CONFLICT,
    );
  }
}

export {
  REPLICA_CLEANUP_ACQUIRE_OUTCOME,
  REPLICA_CLEANUP_ERROR_CODE,
  ReplicaCleanupTombstoneOwner,
  cleanupDeferredError,
  isCleanupTombstoneRow,
};
