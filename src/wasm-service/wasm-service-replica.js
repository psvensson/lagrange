/**
 * WasmServiceReplica — Raft-based replica for WASM service groups.
 * Extends RaftReplicaBase with session KV store, safety interval
 * broadcasts, persistent timers, and read routing.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 5.1, 5.2, 5.3, 6.1, 6.2
 * @module wasm-service/wasm-service-replica
 */

import {RaftReplicaBase} from '../raft/raft-replica-base.js';
import {SERVICE_TYPE} from '../constants/service.js';
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

/**
 * Entry type constants for committed Raft log entries.
 * @enum {string}
 */
const ENTRY_TYPE = Object.freeze({
  KV_SET: 'kv_set',
  KV_DELETE: 'kv_delete',
  KV_DELETE_SESSION: 'kv_delete_session',
  TIMER_STATE: 'timer_state',
});

/**
 * Message operation constants for incoming service messages.
 * @enum {string}
 */
const MESSAGE_OP = Object.freeze({
  READ: 'read',
  WRITE: 'write',
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
      options.dbPath || ':memory:',
    );
    this.timerManager = new TimerManager(this);
    this.safetyInterval = new SafetyInterval(
      options.safetyIntervalMs,
    );

    this.wasmExecutor = null;
    this.portAllocation = null;
    this.onTimerCallback = null;

    this._safetyBroadcastTimer = null;

    this.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_CREATED, {
      replicaId: this.replicaId,
      serviceDefinitionId: this.serviceDefinitionId,
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
      this.raft.command(entry, (err) => {
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
   * Stub implementation — full CDC integration deferred.
   * @return {Promise<void>}
   */
  async flushRoleUpdate() {
    // Stub: full CDC integration in a later task
  }

  /**
   * Persist the leader node update to the services table.
   * Stub implementation — full CDC integration deferred.
   * @return {Promise<void>}
   */
  async flushLeaderNodeUpdate() {
    // Stub: full CDC integration in a later task
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
      const committedIndex = this.raft ?
        (this.raft.log ? this.raft.log.committedIndex : 0) :
        0;
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
