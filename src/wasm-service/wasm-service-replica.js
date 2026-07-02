/**
 * WasmServiceReplica — Raft-based replica for WASM service groups.
 * Extends RaftReplicaBase with session KV store, safety interval
 * broadcasts, persistent timers, and read routing.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 5.1, 5.2, 5.3, 6.1, 6.2
 * @module wasm-service/wasm-service-replica
 */

import {RaftReplicaBase} from '../raft/raft-replica-base.js';
import {AuthoritativeRowMutationHelper} from '../raft/authoritative-row-mutation-helper.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {COLUMN, TABLES} from '../constants/index.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {isSystemTableWriteReady} from '../cache/leader-readiness-gate.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {SessionKVStore} from './session-kv-store.js';
import {SafetyInterval} from './safety-interval.js';
import {TimerManager} from './timer-manager.js';
import {routeRead} from './read-router.js';
import {
  WASM_SERVICE_SUBSYSTEM,
  WASM_SERVICE_LOG_MSG,
  WASM_SERVICE_ERROR_MSG,
  WASM_SERVICE_DEFAULT,
  WRITE_CONSISTENCY_MODE,
} from './wasm-service-constants.js';

const LOCAL_STR_STRING = 'string';

// Entry type scalar values
const ENTRY_TYPE_KV_SET = 'kv_set';
const ENTRY_TYPE_KV_DELETE = 'kv_delete';
const ENTRY_TYPE_KV_DELETE_SESSION = 'kv_delete_session';
const ENTRY_TYPE_TIMER_STATE = 'timer_state';

/**
 * Entry type constants for committed Raft log entries.
 * @enum {string}
 */
const ENTRY_TYPE = Object.freeze({
  KV_SET: ENTRY_TYPE_KV_SET,
  KV_DELETE: ENTRY_TYPE_KV_DELETE,
  KV_DELETE_SESSION: ENTRY_TYPE_KV_DELETE_SESSION,
  TIMER_STATE: ENTRY_TYPE_TIMER_STATE,
});

// Message operation scalar values
const MESSAGE_OP_READ = 'read';
const MESSAGE_OP_WRITE = 'write';

/**
 * Message operation constants for incoming service messages.
 * @enum {string}
 */
const MESSAGE_OP = Object.freeze({
  READ: MESSAGE_OP_READ,
  WRITE: MESSAGE_OP_WRITE,
});

const METADATA_FLUSH_RETRY_DELAY_MS = 250;

const SQLITE_MEMORY_PATH = ':memory:';

const FLUSH_REASON_NOT_OWNER = 'not-owner';
const FLUSH_REASON_READY = 'ready';

const METADATA_FLUSH_LOG_MSG = Object.freeze({
  ROLE_RETRY_FAILED: 'WASM role update retry failed',
  LEADER_RETRY_FAILED: 'WASM leader-node update retry failed',
});

/**
 * WasmServiceReplica extends RaftReplicaBase to provide a
 * Raft consensus group for WASM services. Each replica
 * maintains a local SQLite-backed KV store, participates
 * in safety interval broadcasts for strong reads, and
 * manages persistent timers on the leader.
 */
class WasmServiceReplica extends RaftReplicaBase {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.replicaId - This replica's ID.
   * @param {string} options.nodeId - Node ID hosting this replica.
   * @param {Array<string>} options.replicaIds - All replica IDs.
   * @param {Object} options.transport - MessageRouter instance.
   * @param {string} options.serviceDefinitionId - Service def ID.
   * @param {string} options.dbPath - Path to SQLite database.
   * @param {number} [options.safetyIntervalMs] - Staleness bound.
   * @param {string} [options.readConsistency] - Read mode.
   * @param {string} [options.writeConsistency] - Write mode.
   */
  constructor(options = {}) {
    super({
      ...options,
      entityType: SERVICE_TYPE.WASM_SERVICE,
      subsystemName: WASM_SERVICE_SUBSYSTEM.REPLICA,
    });

    this.serviceDefinitionId = options.serviceDefinitionId;
    this.readConsistency = options.readConsistency ||
      WASM_SERVICE_DEFAULT.READ_CONSISTENCY;
    this.writeConsistency = options.writeConsistency ||
      WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY;

    this.kvStore = new SessionKVStore(
      options.dbPath || SQLITE_MEMORY_PATH,
    );
    this.timerManager = new TimerManager(this);
    this.safetyInterval = new SafetyInterval(
      options.safetyIntervalMs,
    );

    this.wasmExecutor = null;
    this.portAllocation = null;
    this.onTimerCallback = null;
    this.roleUpdateWriter = options.roleUpdateWriter || null;
    this.leaderNodeUpdateWriter =
      options.leaderNodeUpdateWriter || null;
    this.roleMutationTransport = this.createRoleMutationTransport();
    this.leaderNodeMutationTransport = this.createLeaderNodeMutationTransport();
    this.roleMutationHelper = this.createRoleMutationHelper();
    this.pendingRoleUpdate = this.role;
    this.persistedRole = null;
    this.leaderNodeMutationHelper = this.createLeaderNodeMutationHelper();
    this.pendingLeaderNodeUpdate = null;
    this.persistedLeaderNodeId = null;
    this.controlPlaneSystemTableGateway =
      createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemTableCache,
        getMessageRouter: () => this.transport,
      }).controlPlaneSystemTableGateway;

    this._safetyBroadcastTimer = null;

    this.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_CREATED, {
      replicaId: this.replicaId,
      serviceDefinitionId: this.serviceDefinitionId,
    });
  }

  get systemTableCache() {
    return this._systemTableCache || null;
  }

  set systemTableCache(systemTableCache) {
    this._systemTableCache = systemTableCache;
    this.roleMutationHelper?.setSystemTableCache(systemTableCache);
    this.leaderNodeMutationHelper?.setSystemTableCache(systemTableCache);
  }

  get cdcIntegrationService() {
    return this._cdcIntegrationService || null;
  }

  set cdcIntegrationService(cdcIntegrationService) {
    this._cdcIntegrationService = cdcIntegrationService;
  }

  get pendingRoleUpdate() {
    return this.roleMutationHelper?.pendingValue || null;
  }

  set pendingRoleUpdate(role) {
    if (this.roleMutationHelper) {
      this.roleMutationHelper.pendingValue = role;
    }
  }

  get persistedRole() {
    return this.roleMutationHelper?.persistedValue || null;
  }

  set persistedRole(role) {
    if (this.roleMutationHelper) {
      this.roleMutationHelper.persistedValue = role;
    }
  }

  get roleUpdateInFlight() {
    return this.roleMutationHelper?.inFlight || false;
  }

  set roleUpdateInFlight(inFlight) {
    if (this.roleMutationHelper) {
      this.roleMutationHelper.inFlight = inFlight;
    }
  }

  get roleUpdateRetryTimer() {
    return this.roleMutationHelper?.retryTimer || null;
  }

  set roleUpdateRetryTimer(timer) {
    if (this.roleMutationHelper) {
      this.roleMutationHelper.retryTimer = timer;
    }
  }

  get pendingLeaderNodeUpdate() {
    return this.leaderNodeMutationHelper?.pendingValue || null;
  }

  set pendingLeaderNodeUpdate(leaderNodeId) {
    if (this.leaderNodeMutationHelper) {
      this.leaderNodeMutationHelper.pendingValue = leaderNodeId;
    }
  }

  get persistedLeaderNodeId() {
    return this.leaderNodeMutationHelper?.persistedValue || null;
  }

  set persistedLeaderNodeId(leaderNodeId) {
    if (this.leaderNodeMutationHelper) {
      this.leaderNodeMutationHelper.persistedValue = leaderNodeId;
    }
  }

  get leaderNodeUpdateInFlight() {
    return this.leaderNodeMutationHelper?.inFlight || false;
  }

  set leaderNodeUpdateInFlight(inFlight) {
    if (this.leaderNodeMutationHelper) {
      this.leaderNodeMutationHelper.inFlight = inFlight;
    }
  }

  get leaderNodeUpdateRetryTimer() {
    return this.leaderNodeMutationHelper?.retryTimer || null;
  }

  set leaderNodeUpdateRetryTimer(timer) {
    if (this.leaderNodeMutationHelper) {
      this.leaderNodeMutationHelper.retryTimer = timer;
    }
  }

  createRoleMutationTransport() {
    return {
      updateSystemTableRow: async (_tableName, _whereClause, data, options = {}) =>
        this.writeRoleUpdate(
          data?.[COLUMN.RAFT_ROLE],
          data?.[COLUMN.UPDATED_AT],
          options,
        ),
    };
  }

  createLeaderNodeMutationTransport() {
    return {
      updateSystemTableRow: async (_tableName, _whereClause, data, options = {}) =>
        this.writeLeaderNodeUpdate(
          data?.[COLUMN.NODE_ID],
          data?.[COLUMN.UPDATED_AT],
          data?.[COLUMN.RAFT_ROLE],
          options,
        ),
    };
  }

  createRoleMutationHelper() {
    return new AuthoritativeRowMutationHelper({
      tableName: SYSTEM_TABLE_NAME.SERVICES,
      buildWhereClause: (_role, context = {}) => {
        const whereClause = {[COLUMN.SERVICE_ID]: this.replicaId};
        const cachedRow = context.cachedRow;
        if (typeof cachedRow?.[COLUMN.RAFT_ROLE] === LOCAL_STR_STRING &&
          cachedRow[COLUMN.RAFT_ROLE].length > 0) {
          whereClause[COLUMN.RAFT_ROLE] = cachedRow[COLUMN.RAFT_ROLE];
        }
        if (Number.isFinite(cachedRow?.[COLUMN.UPDATED_AT])) {
          whereClause[COLUMN.UPDATED_AT] = cachedRow[COLUMN.UPDATED_AT];
        }
        return whereClause;
      },
      buildUpdateData: (role, updatedAt) => ({
        [COLUMN.RAFT_ROLE]: role,
        [COLUMN.UPDATED_AT]: updatedAt,
      }),
      buildExpectedCacheFields: (role) => ({[COLUMN.RAFT_ROLE]: role}),
      readRowFromCache: (systemTableCache) =>
        systemTableCache?.get?.(TABLES.SERVICES, this.replicaId) || null,
      readValueFromCache: (systemTableCache) =>
        systemTableCache?.get?.(TABLES.SERVICES, this.replicaId)?.[COLUMN.RAFT_ROLE] || null,
      isWriteReady: () => this.isServicesLeaderAvailable(),
      retryDelayMs: METADATA_FLUSH_RETRY_DELAY_MS,
      systemTableCache: this.systemTableCache,
      cdcIntegrationService: this.roleMutationTransport,
      onAsyncError: (error, context = {}) => {
        this.logger.warn(METADATA_FLUSH_LOG_MSG.ROLE_RETRY_FAILED, {
          replicaId: this.replicaId,
          role: context.value ?? this.pendingRoleUpdate,
          error: error.message,
        });
      },
    });
  }

  createLeaderNodeMutationHelper() {
    return new AuthoritativeRowMutationHelper({
      tableName: SYSTEM_TABLE_NAME.SERVICES,
      buildWhereClause: (_leaderNodeId, context = {}) => {
        const whereClause = {[COLUMN.SERVICE_ID]: this.replicaId};
        const cachedRow = context.cachedRow;
        if (typeof cachedRow?.[COLUMN.NODE_ID] === LOCAL_STR_STRING &&
          cachedRow[COLUMN.NODE_ID].length > 0) {
          whereClause[COLUMN.NODE_ID] = cachedRow[COLUMN.NODE_ID];
        }
        if (Number.isFinite(cachedRow?.[COLUMN.UPDATED_AT])) {
          whereClause[COLUMN.UPDATED_AT] = cachedRow[COLUMN.UPDATED_AT];
        }
        return whereClause;
      },
      buildUpdateData: (leaderNodeId, updatedAt) => ({
        [COLUMN.NODE_ID]: leaderNodeId,
        [COLUMN.RAFT_ROLE]: this.role,
        [COLUMN.UPDATED_AT]: updatedAt,
      }),
      buildExpectedCacheFields: (leaderNodeId) => ({
        [COLUMN.NODE_ID]: leaderNodeId,
        [COLUMN.RAFT_ROLE]: this.role,
      }),
      readRowFromCache: (systemTableCache) =>
        systemTableCache?.get?.(TABLES.SERVICES, this.replicaId) || null,
      readValueFromCache: (systemTableCache) =>
        systemTableCache?.get?.(TABLES.SERVICES, this.replicaId)?.[COLUMN.NODE_ID] || null,
      prepareFlush: () => ({
        skip: !this.isLeader,
        clearPending: !this.isLeader,
        reason: !this.isLeader ? FLUSH_REASON_NOT_OWNER : FLUSH_REASON_READY,
      }),
      isWriteReady: () => this.isServicesLeaderAvailable(),
      retryDelayMs: METADATA_FLUSH_RETRY_DELAY_MS,
      systemTableCache: this.systemTableCache,
      cdcIntegrationService: this.leaderNodeMutationTransport,
      onAsyncError: (error, context = {}) => {
        this.logger.warn(METADATA_FLUSH_LOG_MSG.LEADER_RETRY_FAILED, {
          replicaId: this.replicaId,
          leaderNodeId: context.value ?? this.pendingLeaderNodeUpdate,
          error: error.message,
        });
      },
    });
  }

  /**
   * Called when a Raft entry is committed. Delegates to
   * applyCommittedEntry and updates the safety interval
   * local applied index.
   *
   * @param {Object} command - The committed command.
   */
  onCommit(command) {
    this.applyCommittedEntry(command);
    if (command && command.index !== undefined) {
      this.safetyInterval.updateLocalAppliedIndex(command.index);
    }
  }

  /**
   * Apply a committed Raft log entry to the local state.
   * Handles KV writes, deletes, session deletes, and timer
   * state changes.
   *
   * @param {Object} entry - The committed entry.
   * @return {{accepted: boolean, error: string|null}} Result.
   */
  applyCommittedEntry(entry) {
    if (!entry || !entry.type) {
      return {accepted: true, error: null};
    }

    switch (entry.type) {
    case ENTRY_TYPE.KV_SET: {
      const result = this.kvStore.applySet(
        entry.sessionId, entry.key, entry.value,
      );
      if (result.accepted) {
        this.logger.debug(
          WASM_SERVICE_LOG_MSG.KV_WRITE_APPLIED, {
            replicaId: this.replicaId,
            sessionId: entry.sessionId,
            key: entry.key,
          },
        );
      }
      return result;
    }
    case ENTRY_TYPE.KV_DELETE: {
      this.kvStore.applyDelete(entry.sessionId, entry.key);
      this.logger.debug(
        WASM_SERVICE_LOG_MSG.KV_DELETE_APPLIED, {
          replicaId: this.replicaId,
          sessionId: entry.sessionId,
          key: entry.key,
        },
      );
      return {accepted: true, error: null};
    }
    case ENTRY_TYPE.KV_DELETE_SESSION: {
      this.kvStore.applyDeleteSession(entry.sessionId);
      this.logger.debug(
        WASM_SERVICE_LOG_MSG.SESSION_DELETED, {
          replicaId: this.replicaId,
          sessionId: entry.sessionId,
        },
      );
      return {accepted: true, error: null};
    }
    case ENTRY_TYPE.TIMER_STATE: {
      const val = typeof entry.value === 'string' ?
        entry.value :
        JSON.stringify(entry.value);
      this.kvStore.applySet(
        entry.sessionId || entry.key,
        entry.key || entry.sessionId,
        Buffer.from(val),
      );
      return {accepted: true, error: null};
    }
    default:
      return {accepted: true, error: null};
    }
  }

  /**
   * Handle an incoming service message. Routes reads via the
   * read router and proposes writes through Raft.
   *
   * @param {Object} message - Incoming message.
   * @return {Promise<Object>} Response object.
   */
  async handleMessage(message) {
    const raftResult = this.handleRaftPacket(message);
    if (raftResult) {
      return raftResult;
    }

    const payload = message.payload || message;
    const operation = payload.operation || payload.op;

    if (operation === MESSAGE_OP.READ) {
      return this._handleRead(payload);
    }

    if (operation === MESSAGE_OP.WRITE) {
      return this._handleWrite(payload);
    }

    return {error: WASM_SERVICE_ERROR_MSG.SERVICE_NOT_READY};
  }

  /**
   * Handle a read request using the read router to decide
   * whether to serve locally or forward to the leader.
   *
   * @param {Object} payload - Read request payload.
   * @return {Object} Read result or forward instruction.
   * @private
   */
  _handleRead(payload) {
    const decision = routeRead(
      this.readConsistency,
      this.isLeader,
      this.safetyInterval,
    );

    if (decision.forwardToLeader) {
      this.logger.debug(
        WASM_SERVICE_LOG_MSG.READ_FORWARDED_TO_LEADER, {
          replicaId: this.replicaId,
          leaderId: this.leaderId,
        },
      );
      return {forwarded: true, leaderId: this.leaderId};
    }

    this.logger.debug(
      WASM_SERVICE_LOG_MSG.READ_SERVED_LOCALLY, {
        replicaId: this.replicaId,
      },
    );

    const value = this.kvStore.get(
      payload.sessionId, payload.key,
    );
    return {forwarded: false, value};
  }

  /**
   * Handle a write request. Only the leader can accept writes.
   * For strong writes, waits for Raft commit. For async writes,
   * responds immediately after proposal.
   *
   * @param {Object} payload - Write request payload.
   * @return {Promise<Object>} Write result.
   * @private
   */
  async _handleWrite(payload) {
    if (!this.isLeader) {
      return {forwarded: true, leaderId: this.leaderId};
    }

    const entry = {
      type: ENTRY_TYPE.KV_SET,
      sessionId: payload.sessionId,
      key: payload.key,
      value: payload.value,
    };

    if (this.writeConsistency === WRITE_CONSISTENCY_MODE.ASYNC) {
      this.proposeEntry(entry);
      return {accepted: true, async: true};
    }

    await this.proposeEntry(entry);
    return {accepted: true, async: false};
  }

  /**
   * Propose an entry to the Raft log. Wraps the liferaft
   * command method in a Promise. Used by TimerManager and
   * write handling.
   *
   * @param {Object} entry - Entry to propose.
   * @return {Promise<void>}
   */
  proposeEntry(entry) {
    if (!this.raft) {
      return Promise.reject(
        new Error(WASM_SERVICE_ERROR_MSG.SERVICE_NOT_READY),
      );
    }
    return new Promise((resolve, reject) => {
      this.raftProvider.propose(this.raft, entry, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Called when this replica becomes the Raft leader.
   * Reconstructs timers and starts safety interval broadcasts.
   */
  onBecameLeader() {
    this.logger.info(WASM_SERVICE_LOG_MSG.BECAME_LEADER, {
      replicaId: this.replicaId,
      serviceDefinitionId: this.serviceDefinitionId,
    });

    this.timerManager.reconstructTimers().then((count) => {
      this.logger.info(
        WASM_SERVICE_LOG_MSG.TIMER_RECONSTRUCTED, {
          replicaId: this.replicaId,
          count,
        },
      );
    });

    this._startSafetyBroadcasts();
  }

  /**
   * Called when this replica becomes a follower.
   * Stops all timers and safety interval broadcasts.
   */
  onBecameFollower() {
    this.logger.info(WASM_SERVICE_LOG_MSG.LOST_LEADERSHIP, {
      replicaId: this.replicaId,
      serviceDefinitionId: this.serviceDefinitionId,
    });

    this.timerManager.stopAll();
    this._stopSafetyBroadcasts();
  }

  /**
   * Persist the raft role update to the services table.
   * Uses canonical owner callbacks (or CDC integration).
   * @return {Promise<void>}
   */
  async flushRoleUpdate() {
    return this.roleMutationHelper.flush();
  }

  /**
   * Persist the leader node update to the services table.
   * Uses canonical owner callbacks (or CDC integration).
   * @return {Promise<void>}
   */
  async flushLeaderNodeUpdate() {
    return this.leaderNodeMutationHelper.flush();
  }

  /**
   * Write raft role update through owner callback or CDC owner.
   * @param {string} role
   * @return {Promise<void>}
   * @private
   */
  async writeRoleUpdate(role, updatedAt = Date.now(), options = {}) {
    const writerPayload = {
      serviceId: this.replicaId,
      serviceDefinitionId: this.serviceDefinitionId,
      role,
      nodeId: this.nodeId,
      updatedAt,
    };

    if (this.roleUpdateWriter &&
      typeof this.roleUpdateWriter === 'function') {
      await this.roleUpdateWriter(writerPayload);
      return {success: true};
    }

    if (!this.cdcIntegrationService) {
      return {success: true};
    }

    return this.controlPlaneSystemTableGateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause: {[COLUMN.SERVICE_ID]: this.replicaId},
      data: {
        [COLUMN.RAFT_ROLE]: role,
        [COLUMN.UPDATED_AT]: updatedAt,
      },
    }, options);
  }

  /**
   * Write leader-node update through owner callback or CDC owner.
   * @param {string} leaderNodeId
   * @return {Promise<void>}
   * @private
   */
  async writeLeaderNodeUpdate(
    leaderNodeId,
    updatedAt = Date.now(),
    role = this.role,
    options = {},
  ) {
    const writerPayload = {
      serviceId: this.replicaId,
      serviceDefinitionId: this.serviceDefinitionId,
      leaderNodeId,
      role,
      nodeId: this.nodeId,
      updatedAt,
    };

    if (this.leaderNodeUpdateWriter &&
      typeof this.leaderNodeUpdateWriter === 'function') {
      await this.leaderNodeUpdateWriter(writerPayload);
      return {success: true};
    }

    if (!this.cdcIntegrationService) {
      return {success: true};
    }

    return this.controlPlaneSystemTableGateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause: {[COLUMN.SERVICE_ID]: this.replicaId},
      data: {
        [COLUMN.NODE_ID]: leaderNodeId,
        [COLUMN.RAFT_ROLE]: role,
        [COLUMN.UPDATED_AT]: updatedAt,
      },
    }, options);
  }

  /**
   * Check whether services system table writes are routable.
   * @return {boolean}
   * @private
   */
  isServicesLeaderAvailable() {
    return isSystemTableWriteReady(
      this.systemTableCache,
      SYSTEM_TABLE_NAME.SERVICES,
    );
  }

  /**
   * Start periodic safety interval broadcasts. Only the
   * leader broadcasts its committed index and timestamp
   * so followers can serve strong reads.
   * @private
   */
  _startSafetyBroadcasts() {
    this._stopSafetyBroadcasts();
    const intervalMs = this.safetyInterval.intervalMs;
    this._safetyBroadcastTimer = setInterval(() => {
      const committedIndex = this.raftProvider.getCommittedIndex(this.raft);
      this.safetyInterval.broadcastState(
        committedIndex, Date.now(),
      );
      this.logger.debug(
        WASM_SERVICE_LOG_MSG.SAFETY_INTERVAL_BROADCAST, {
          replicaId: this.replicaId,
          committedIndex,
        },
      );
    }, intervalMs);
  }

  /**
   * Stop safety interval broadcasts.
   * @private
   */
  _stopSafetyBroadcasts() {
    if (this._safetyBroadcastTimer) {
      clearInterval(this._safetyBroadcastTimer);
      this._safetyBroadcastTimer = null;
    }
  }

  /**
   * Shutdown the replica. Stops timers, broadcasts, and
   * closes the KV store before calling the base shutdown.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.timerManager.stopAll();
    this._stopSafetyBroadcasts();
    this.roleMutationHelper.shutdown();
    this.leaderNodeMutationHelper.shutdown();

    if (this.kvStore) {
      this.kvStore.close();
      this.kvStore = null;
    }

    await super.shutdown();

    this.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_STOPPED, {
      replicaId: this.replicaId,
      serviceDefinitionId: this.serviceDefinitionId,
    });
  }
}

export {WasmServiceReplica, ENTRY_TYPE, MESSAGE_OP};
