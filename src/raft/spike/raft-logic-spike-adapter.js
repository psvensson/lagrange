/**
 * Raft-logic contained-spike adapter.
 *
 * Provides a minimal raft lifecycle surface for investigation:
 * startup/shutdown, propose, role changes, commit callback, and leader tracking.
 */

import {EventEmitter} from 'events';
import {
  InMemoryTransport,
  ThreadedRaftNode,
} from 'raft-logic';
import {buildRaftLogicIdMaps} from './raft-logic-id-mapper.js';
import {
  RAFT_LOGIC_SPIKE_DEFAULT,
  RAFT_LOGIC_SPIKE_ERROR,
  RAFT_LOGIC_SPIKE_EVENT,
  RAFT_LOGIC_SPIKE_JSON,
  RAFT_LOGIC_SPIKE_LOG_MSG,
  RAFT_LOGIC_SPIKE_ROLE,
} from './raft-logic-spike-constants.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_SQLITE = 'sqlite';
const LOCAL_STR_INMEMORY = 'inmemory';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';

const ROLE_EVENT_MAP = Object.freeze({
  [RAFT_LOGIC_SPIKE_ROLE.LEADER]: RAFT_LOGIC_SPIKE_EVENT.LEADER,
  [RAFT_LOGIC_SPIKE_ROLE.FOLLOWER]: RAFT_LOGIC_SPIKE_EVENT.FOLLOWER,
  [RAFT_LOGIC_SPIKE_ROLE.CANDIDATE]: RAFT_LOGIC_SPIKE_EVENT.CANDIDATE,
});

/**
 * Normalize role values to known raft role names.
 * @param {string} role
 * @return {string}
 */
function normalizeRole(role) {
  const normalized = String(role || RAFT_LOGIC_SPIKE_ROLE.FOLLOWER).toLowerCase();
  if (normalized === RAFT_LOGIC_SPIKE_ROLE.LEADER ||
    normalized === RAFT_LOGIC_SPIKE_ROLE.CANDIDATE) {
    return normalized;
  }
  return RAFT_LOGIC_SPIKE_ROLE.FOLLOWER;
}

/**
 * Try parsing JSON, fallback to raw string.
 * @param {string} text
 * @return {*}
 */
function parseMaybeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

/**
 * Decode raft entry payload from base64/string/bytes.
 * @param {*} rawData
 * @return {*}
 */
function decodeCommittedCommand(rawData) {
  if (rawData === null || rawData === undefined) {
    return null;
  }

  if (typeof rawData === LOCAL_STR_STRING) {
    try {
      const decoded = Buffer.from(rawData, 'base64').toString('utf8');
      if (decoded.length > 0) {
        return parseMaybeJson(decoded);
      }
    } catch (_error) {
      // Ignore and fallback below.
    }
    return parseMaybeJson(rawData);
  }

  if (rawData instanceof Uint8Array || Array.isArray(rawData)) {
    const decoded = Buffer.from(rawData).toString('utf8');
    return parseMaybeJson(decoded);
  }

  return rawData;
}

/**
 * Serialize a command payload for clientRequest().
 * @param {*} command
 * @return {string}
 */
function serializeCommand(command) {
  if (typeof command === LOCAL_STR_STRING) {
    return command;
  }
  if (command === null || command === undefined) {
    return RAFT_LOGIC_SPIKE_JSON.EMPTY_OBJECT;
  }
  return JSON.stringify(command);
}

/**
 * Build worker-storage config for threaded raft node.
 * @param {{sqliteFile?: string|null}} options
 * @return {{workerStorage: Object}}
 */
function buildWorkerStorage(options = {}) {
  if (options.sqliteFile) {
    return {
      workerStorage: {
        kind: LOCAL_STR_SQLITE,
        options: {
          file: String(options.sqliteFile),
        },
      },
    };
  }

  return {
    workerStorage: {
      kind: LOCAL_STR_INMEMORY,
    },
  };
}

/**
 * Raft-logic spike adapter for one replica.
 * @extends EventEmitter
 */
class RaftLogicSpikeAdapter extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.replicaId
   * @param {Array<string>} options.replicaIds
   * @param {Object} [options.transport]
   * @param {Object} [options.logger]
   * @param {Function} [options.applyCommit]
   * @param {number} [options.electionTick]
   * @param {number} [options.heartbeatTick]
   * @param {number} [options.tickIntervalMs]
   * @param {number} [options.clientRequestTimeoutMs]
   * @param {string|null} [options.sqliteFile]
   */
  constructor(options = {}) {
    super();

    if (!options.replicaId || typeof options.replicaId !== LOCAL_STR_STRING) {
      throw new Error(RAFT_LOGIC_SPIKE_ERROR.MISSING_REPLICA_ID);
    }
    if (!Array.isArray(options.replicaIds) || options.replicaIds.length === 0) {
      throw new Error(RAFT_LOGIC_SPIKE_ERROR.INVALID_REPLICA_IDS);
    }

    this.replicaId = String(options.replicaId);
    this.replicaIds = [...new Set(options.replicaIds.map((id) => String(id)))];
    if (!this.replicaIds.includes(this.replicaId)) {
      throw new Error(RAFT_LOGIC_SPIKE_ERROR.REPLICA_ID_NOT_IN_CLUSTER);
    }

    const idMaps = buildRaftLogicIdMaps(this.replicaIds);
    this.externalToInternal = idMaps.externalToInternal;
    this.internalToExternal = idMaps.internalToExternal;

    this.internalReplicaId = this.externalToInternal.get(this.replicaId);
    this.internalReplicaIds = this.replicaIds
      .map((id) => this.externalToInternal.get(id))
      .filter(Boolean);

    this.transport = options.transport || new InMemoryTransport();
    this.logger = options.logger || console;
    this.applyCommit = typeof options.applyCommit === LOCAL_STR_FUNCTION ?
      options.applyCommit :
      null;

    this.electionTick = Number.isInteger(options.electionTick) ?
      options.electionTick :
      RAFT_LOGIC_SPIKE_DEFAULT.ELECTION_TICK;
    this.heartbeatTick = Number.isInteger(options.heartbeatTick) ?
      options.heartbeatTick :
      RAFT_LOGIC_SPIKE_DEFAULT.HEARTBEAT_TICK;
    this.tickIntervalMs = Number.isInteger(options.tickIntervalMs) ?
      options.tickIntervalMs :
      RAFT_LOGIC_SPIKE_DEFAULT.TICK_INTERVAL_MS;
    this.clientRequestTimeoutMs = Number.isInteger(options.clientRequestTimeoutMs) ?
      options.clientRequestTimeoutMs :
      RAFT_LOGIC_SPIKE_DEFAULT.CLIENT_REQUEST_TIMEOUT_MS;
    this.sqliteFile = options.sqliteFile || null;

    this._started = false;
    this._node = null;

    this._role = RAFT_LOGIC_SPIKE_ROLE.FOLLOWER;
    this._leaderReplicaId = null;
    this._term = 0;
  }

  /**
   * Start raft node.
   * @return {Promise<void>}
   */
  async start() {
    if (this._started) {
      return;
    }

    this.logger.info(RAFT_LOGIC_SPIKE_LOG_MSG.STARTING, {
      replicaId: this.replicaId,
      peerCount: this.replicaIds.length,
    });

    const {workerStorage} = buildWorkerStorage({
      sqliteFile: this.sqliteFile,
    });

    this._node = new ThreadedRaftNode({
      id: this.internalReplicaId,
      peers: this.internalReplicaIds,
      electionTick: this.electionTick,
      heartbeatTick: this.heartbeatTick,
      transport: this.transport,
      workerStorage,
      apply: async (entry) => {
        await this._handleCommit(entry);
      },
      tickIntervalMs: this.tickIntervalMs,
      preVote: true,
    });

    this._wireNodeSignals();
    await this._node.start();
    this._started = true;
    await this.refreshStatus();

    this.logger.info(RAFT_LOGIC_SPIKE_LOG_MSG.STARTED, {
      replicaId: this.replicaId,
      internalId: this.internalReplicaId,
    });
  }

  /**
   * Stop raft node.
   * @param {Object} [options]
   * @param {boolean} [options.drain]
   * @return {Promise<void>}
   */
  async stop(options = {}) {
    if (!this._started) {
      return;
    }

    this.logger.info(RAFT_LOGIC_SPIKE_LOG_MSG.STOPPING, {
      replicaId: this.replicaId,
    });

    try {
      if (this._node) {
        const shouldDrain = options.drain !== false;
        await this._node.stop({
          drainApply: shouldDrain,
          drainTicks: shouldDrain,
        });
      }
    } finally {
      this._node = null;
      this._started = false;
      this._role = RAFT_LOGIC_SPIKE_ROLE.FOLLOWER;
      this._leaderReplicaId = null;
      this._term = 0;
    }

    this.logger.info(RAFT_LOGIC_SPIKE_LOG_MSG.STOPPED, {
      replicaId: this.replicaId,
    });
  }

  /**
   * Wait for stable leader.
   * @param {number} [timeoutMs]
   * @return {Promise<string|null>}
   */
  async waitForLeader(timeoutMs = RAFT_LOGIC_SPIKE_DEFAULT.WAIT_FOR_LEADER_TIMEOUT_MS) {
    this._assertStarted();
    const leaderInternalId = await this._node.waitForLeader(timeoutMs);
    this._setLeaderFromInternalId(leaderInternalId);
    return this._leaderReplicaId;
  }

  /**
   * Propose a command.
   * @param {*} command
   * @param {{autoForward?: boolean, timeoutMs?: number}} [options]
   * @return {Promise<{index: number, term: number}>}
   */
  async propose(command, options = {}) {
    this._assertStarted();
    const timeoutMs = Number.isInteger(options.timeoutMs) ?
      options.timeoutMs :
      this.clientRequestTimeoutMs;

    const result = await this._node.clientRequest(
      serializeCommand(command),
      {
        autoForward: options.autoForward === true,
        waitFor: 'commit',
        timeout: timeoutMs,
      },
    );
    await this.refreshStatus();
    return result;
  }

  /**
   * LifeRaft-compatible command callback style.
   * @param {*} command
   * @param {Function} callback
   */
  command(command, callback) {
    this.propose(command, {autoForward: false})
      .then(() => {
        if (callback) {
          callback(null);
        }
      })
      .catch((error) => {
        this.logger.warn(RAFT_LOGIC_SPIKE_LOG_MSG.COMMAND_REJECTED, {
          replicaId: this.replicaId,
          error: error.message,
        });
        if (callback) {
          callback(error);
        }
      });
  }

  /**
   * Refresh local status snapshot.
   * @return {Promise<Object|null>}
   */
  async refreshStatus() {
    this._assertStarted();
    const status = await this._node.status();
    this._handleStateUpdate(status);
    return this.getStatusSnapshot();
  }

  /**
   * Return raw raft-logic status payload.
   * @return {Promise<Object|null>}
   */
  async getRawStatus() {
    this._assertStarted();
    return this._node.status();
  }

  /**
   * Return status snapshot using cached state.
   * @return {{replicaId: string, role: string, leaderId: string|null, term: number}}
   */
  getStatusSnapshot() {
    return {
      replicaId: this.replicaId,
      role: this._role,
      leaderId: this._leaderReplicaId,
      term: this._term,
    };
  }

  /**
   * @return {boolean}
   */
  isLeaderReplica() {
    return this._role === RAFT_LOGIC_SPIKE_ROLE.LEADER;
  }

  /**
   * @return {string}
   */
  getRole() {
    return this._role;
  }

  /**
   * @return {string|null}
   */
  getLeaderId() {
    return this._leaderReplicaId;
  }

  /**
   * @return {number}
   */
  getCurrentTerm() {
    return this._term;
  }

  /**
   * @return {ThreadedRaftNode|null}
   */
  getNode() {
    return this._node;
  }

  /**
   * Wire role/state callbacks from raft-logic node.
   * @private
   */
  _wireNodeSignals() {
    this._node.onRoleChange((previousRole, nextRole) => {
      this._handleRoleChange(previousRole, nextRole);
    });

    this._node.onStateChange((snapshot) => {
      this._handleStateUpdate(snapshot);
    });
  }

  /**
   * Handle role change callback.
   * @param {string} previousRole
   * @param {string} nextRole
   * @private
   */
  _handleRoleChange(previousRole, nextRole) {
    const normalizedPrevious = normalizeRole(previousRole);
    const normalizedNext = normalizeRole(nextRole);
    if (normalizedPrevious === normalizedNext && this._role === normalizedNext) {
      return;
    }

    this._role = normalizedNext;
    if (normalizedNext === RAFT_LOGIC_SPIKE_ROLE.LEADER) {
      this._setLeaderFromInternalId(this.internalReplicaId);
    }

    this.logger.info(RAFT_LOGIC_SPIKE_LOG_MSG.ROLE_CHANGED, {
      replicaId: this.replicaId,
      previousRole: normalizedPrevious,
      nextRole: normalizedNext,
    });

    const eventName = ROLE_EVENT_MAP[normalizedNext];
    if (eventName) {
      this.emit(eventName);
    }
  }

  /**
   * Handle status snapshot update.
   * @param {Object|null} snapshot
   * @private
   */
  _handleStateUpdate(snapshot) {
    if (!snapshot || typeof snapshot !== LOCAL_STR_OBJECT) {
      return;
    }

    const nextTerm = Number(snapshot.term);
    if (Number.isFinite(nextTerm) && nextTerm >= 0 && nextTerm !== this._term) {
      this._term = nextTerm;
      this.emit(RAFT_LOGIC_SPIKE_EVENT.TERM_CHANGE, this._term);
    }

    if (snapshot.role) {
      this._handleRoleChange(this._role, snapshot.role);
    }

    if (snapshot.lead !== undefined &&
        snapshot.lead !== null &&
        snapshot.lead !== '') {
      this._setLeaderFromInternalId(snapshot.lead);
    }
  }

  /**
   * Handle committed entry callback.
   * @param {Object} entry
   * @return {Promise<void>}
   * @private
   */
  async _handleCommit(entry) {
    const commitRecord = {
      replicaId: this.replicaId,
      term: this._term,
      command: decodeCommittedCommand(entry?.data),
      rawEntry: entry,
    };

    if (this.applyCommit) {
      await this.applyCommit(commitRecord);
    }

    this.emit(RAFT_LOGIC_SPIKE_EVENT.COMMIT, commitRecord);
  }

  /**
   * Update leader cache from internal ID.
   * @param {string|number|null} internalId
   * @private
   */
  _setLeaderFromInternalId(internalId) {
    if (internalId === null || internalId === undefined || internalId === '') {
      return;
    }

    const normalizedInternal = String(internalId);
    const external = this.internalToExternal.get(normalizedInternal) || null;
    if (!external || external === this._leaderReplicaId) {
      return;
    }

    this._leaderReplicaId = external;

    this.logger.debug(RAFT_LOGIC_SPIKE_LOG_MSG.LEADER_CHANGED, {
      replicaId: this.replicaId,
      leaderId: external,
      internalLeaderId: normalizedInternal,
    });

    this.emit(RAFT_LOGIC_SPIKE_EVENT.LEADER_CHANGE, external);
  }

  /**
   * Assert adapter started.
   * @private
   */
  _assertStarted() {
    if (!this._started || !this._node) {
      throw new Error(RAFT_LOGIC_SPIKE_ERROR.ADAPTER_NOT_STARTED);
    }
  }
}

export {RaftLogicSpikeAdapter};
