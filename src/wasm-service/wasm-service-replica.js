/**
 * WasmServiceReplica — the WASM service group's replica on its raft-rs
 * semantic operation port (design R4 §2(b)): session KV store over the
 * consensus connection, safety interval broadcasts, persistent timers,
 * read routing, and role/leader publication from the port's events.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 5.1, 5.2, 5.3, 6.1, 6.2
 * @module wasm-service/wasm-service-replica
 */

import {EventEmitter} from 'node:events';
import {AddressManager} from '../address/address-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {NodeService} from '../node/node-service.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {isRaftRsTransportEnvelope} from '../raft/raft-packet-utils.js';
import {
  RAFT_EVENT,
  RAFT_OPERATION_OUTCOME,
} from '../raft/raft-operation-port-constants.js';
import {wireReplicaLifecycleEvents} from '../raft/replica-leadership-state.js';
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
  assertDurableDbPath,
  closeWasmServiceConsensus,
  openWasmServiceConsensusPort,
  openWasmServiceDatabase,
} from './wasm-service-consensus-port.js';
import {
  WASM_SERVICE_SUBSYSTEM,
  WASM_SERVICE_LOG_MSG,
  WASM_SERVICE_ERROR_MSG,
  WASM_SERVICE_DEFAULT,
  WRITE_CONSISTENCY_MODE,
  WASM_SERVICE_COMMAND_TYPE,
} from './wasm-service-constants.js';
import {
  admitWasmServiceCommand,
  wasmServiceCommandRefusalError,
} from './wasm-service-committed-command-admission.js';
import {
  applyCommittedCommand,
  encodeCommittedCommand,
  proposalRefusedError,
} from './wasm-service-committed-command-codec.js';
import {
  createWasmServiceLeaderNodeMutationHelper,
  createWasmServiceRoleMutationHelper,
} from './wasm-service-metadata-mutation-helpers.js';

/**
 * Entry type constants for committed Raft log entries.
 * @enum {string}
 */
const ENTRY_TYPE = WASM_SERVICE_COMMAND_TYPE;

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

/**
 * WasmServiceReplica: a WASM service group's replica on its raft-rs
 * operation port. Each replica keeps its consensus record and session KV
 * store in one durable file, participates in safety interval broadcasts for
 * strong reads, and manages persistent timers on the leader.
 */
class WasmServiceReplica extends EventEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.replicaId - This replica's ID.
   * @param {string} options.nodeId - Node ID hosting this replica.
   * @param {Array<string>} options.replicaIds - All replica IDs.
   * @param {Object} options.transport - MessageRouter instance.
   * @param {string} options.serviceDefinitionId - Service def ID.
   * @param {string} options.dbPath - The replica's durable database file.
   * @param {number} [options.safetyIntervalMs] - Staleness bound.
   * @param {string} [options.readConsistency] - Read mode.
   * @param {string} [options.writeConsistency] - Write mode.
   */
  constructor(options = {}) {
    super();
    assertDurableDbPath(options.dbPath);
    if (!options.replicaId) {
      throw new Error(WASM_SERVICE_ERROR_MSG.REPLICA_ID_REQUIRED);
    }
    this.replicaId = options.replicaId;
    this.nodeId = options.nodeId;
    this.replicaIds = options.replicaIds || [options.replicaId];
    this.transport = options.transport || null;
    this.dbPath = options.dbPath;
    this.entityType = SERVICE_TYPE.WASM_SERVICE;
    this.addressManager = AddressManager.getInstance();
    this.unifiedAddress = this.addressManager.format(
      this.nodeId, this.entityType, this.replicaId);
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(WASM_SERVICE_SUBSYSTEM.REPLICA) : console;
    this.raft = null;
    this.db = null;
    this.kvStore = null;
    this.role = RAFT_ROLE.FOLLOWER;
    this.leaderId = null;
    this.isLeader = false;
    this.initialized = false;
    this.systemTableCache = options.systemTableCache ||
      NodeService.getInstance().getSystemTableCache();
    this.cdcIntegrationService = options.cdcIntegrationService || null;

    this.serviceDefinitionId = options.serviceDefinitionId;
    this.readConsistency = options.readConsistency ||
      WASM_SERVICE_DEFAULT.READ_CONSISTENCY;
    this.writeConsistency = options.writeConsistency ||
      WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY;

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
    this.roleMutationHelper = createWasmServiceRoleMutationHelper(this);
    this.pendingRoleUpdate = this.role;
    this.persistedRole = null;
    this.leaderNodeMutationHelper =
      createWasmServiceLeaderNodeMutationHelper(this);
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

  /**
   * Open the replica on its operation port: its durable database, the
   * session KV store over that connection (a committed write and its
   * applied index are one transaction), the port, its lifecycle events,
   * and its transport address.
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    try {
      openWasmServiceDatabase(this);
      this.kvStore = new SessionKVStore(this.db);
      openWasmServiceConsensusPort(this);
    } catch (error) {
      await this.releaseConsensus();
      throw error;
    }
    wireReplicaLifecycleEvents(this, {
      events: RAFT_EVENT,
      roles: RAFT_ROLE,
      getCurrentTerm: () => this.resolveCurrentTermSafe(),
      onLeader: () => this.onBecameLeader(),
      onFollower: () => this.onBecameFollower(),
      onCandidate: () => this.onBecameFollower(),
    });
    if (this.transport) {
      this.transport.register(this.unifiedAddress,
        (message) => this.handleMessage(message));
    }
    this.initialized = true;
  }

  /**
   * Apply one committed entry inside the transaction that advances the
   * replica's applied state. A committed type the admission owner never
   * admits fails the application rather than being skipped.
   * @param {Object} committed - {command, index, term, effects}.
   * @return {*} The KV store's answer.
   */
  applyCommittedEntry(committed) {
    const result = applyCommittedCommand(this.kvStore, committed);
    this.safetyInterval.updateLocalAppliedIndex(committed.index);
    return result;
  }

  /**
   * Handle an incoming message: a semantic consensus envelope steps the
   * port; reads route via the read router and writes propose through it.
   *
   * @param {Object} message - Incoming message.
   * @return {Promise<Object>} Response object.
   */
  async handleMessage(message) {
    const payload = message.payload || message;
    if (isRaftRsTransportEnvelope(payload)) {
      if (this.raft) {
        await Promise.resolve(this.raft.step(payload));
      }
      return {acknowledged: true};
    }
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
      this.proposeEntry(entry).catch((error) => {
        this.logger.warn(WASM_SERVICE_LOG_MSG.ASYNC_PROPOSAL_FAILED, {
          replicaId: this.replicaId,
          error: error.message,
        });
      });
      return {accepted: true, async: true};
    }

    await this.proposeEntry(entry);
    return {accepted: true, async: false};
  }

  /**
   * Propose an entry through the replica's operation port: refused before
   * propose when the admission owner does not admit its type; its value
   * crosses the log as base64 text. Used by TimerManager and writes.
   *
   * @param {Object} entry - Entry to propose.
   * @return {Promise<Object>} The port's CORE_OK answer.
   */
  async proposeEntry(entry) {
    const admission = admitWasmServiceCommand(entry);
    if (!admission.admitted) {
      throw wasmServiceCommandRefusalError(admission);
    }
    if (!this.raft) {
      throw new Error(WASM_SERVICE_ERROR_MSG.SERVICE_NOT_READY);
    }
    const answer = await Promise.resolve(
      this.raft.propose(encodeCommittedCommand(entry)));
    if (answer?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
      throw proposalRefusedError(answer);
    }
    return answer;
  }

  /**
   * Queue the replica's role for publication to its services row.
   * @param {string} role - The role the port announced.
   */
  queueRoleUpdate(role) {
    if (!role || role === this.persistedRole) {
      return;
    }
    this.pendingRoleUpdate = role;
    if (!this.cdcIntegrationService) {
      return;
    }
    this.flushRoleUpdate().catch((error) => {
      this.logger.warn(WASM_SERVICE_LOG_MSG.PERSIST_ROLE_FAILED, {
        replicaId: this.replicaId,
        role,
        error: error.message,
      });
    });
  }

  /**
   * Queue this node as the group's leader node for publication.
   * @param {string} leaderNodeId - The leading node.
   */
  queueLeaderNodeUpdate(leaderNodeId) {
    if (!leaderNodeId || leaderNodeId === this.persistedLeaderNodeId) {
      return;
    }
    this.pendingLeaderNodeUpdate = leaderNodeId;
    if (!this.cdcIntegrationService) {
      return;
    }
    this.flushLeaderNodeUpdate().catch((error) => {
      this.logger.warn(WASM_SERVICE_LOG_MSG.PERSIST_LEADER_FAILED, {
        replicaId: this.replicaId,
        leaderNodeId,
        error: error.message,
      });
    });
  }

  /**
   * The port's current term, or null when it reports none.
   * @return {number|null}
   */
  resolveCurrentTermSafe() {
    const status = this.raft?.readStatus();
    const term = Number(status?.term);
    return status?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
      Number.isFinite(term) ? term : null;
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
      whereClause: {
        [COLUMN.SERVICE_ID]: this.replicaId,
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.WASM_SERVICE,
        [COLUMN.NODE_ID]: this.nodeId,
      },
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
      whereClause: {
        [COLUMN.SERVICE_ID]: this.replicaId,
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.WASM_SERVICE,
        [COLUMN.NODE_ID]: this.nodeId,
      },
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
      const status = this.raft?.readStatus();
      if (status?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
        return;
      }
      const committedIndex = status.commitIndex;
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
   * Shutdown the replica: stop timers and broadcasts, withdraw its
   * transport address, then release its port and database.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.timerManager.stopAll();
    this._stopSafetyBroadcasts();
    this.roleMutationHelper.shutdown();
    this.leaderNodeMutationHelper.shutdown();
    if (this.initialized && this.transport) {
      this.transport.unregister(this.unifiedAddress);
    }
    this.initialized = false;
    await this.releaseConsensus();

    this.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_STOPPED, {
      replicaId: this.replicaId,
      serviceDefinitionId: this.serviceDefinitionId,
    });
  }

  /**
   * Release the port, then the KV store's borrowed connection and the
   * database itself.
   * @return {Promise<void>}
   */
  async releaseConsensus() {
    await closeWasmServiceConsensus(this);
    if (this.kvStore) {
      this.kvStore.close();
      this.kvStore = null;
    }
  }
}

export {WasmServiceReplica, ENTRY_TYPE, MESSAGE_OP};
