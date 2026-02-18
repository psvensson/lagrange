/**
 * Cluster harness for raft-logic contained spike validation.
 */

import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {InMemoryTransport} from 'raft-logic';
import {RaftLogicSpikeAdapter} from './raft-logic-spike-adapter.js';
import {
  RAFT_LOGIC_SPIKE_DEFAULT,
  RAFT_LOGIC_SPIKE_TIME,
} from './raft-logic-spike-constants.js';

const SPIKE_CLUSTER_DEFAULT = Object.freeze({
  SIZE: 3,
  REPLICA_ID_PREFIX: 'replica-',
  STORAGE_KIND_MEMORY: 'memory',
  STORAGE_KIND_SQLITE: 'sqlite',
});

/**
 * Sleep helper.
 * @param {number} ms
 * @return {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build default replica IDs.
 * @param {number} size
 * @return {Array<string>}
 */
function buildReplicaIds(size) {
  const ids = [];
  for (let i = 1; i <= size; i++) {
    ids.push(SPIKE_CLUSTER_DEFAULT.REPLICA_ID_PREFIX + String(i));
  }
  return ids;
}

/**
 * Build sqlite path for a replica.
 * @param {string} baseDir
 * @param {string} replicaId
 * @return {string}
 */
function buildReplicaSqlitePath(baseDir, replicaId) {
  return join(baseDir, `${replicaId}.sqlite`);
}

/**
 * Compute majority threshold for a cluster size.
 * @param {number} size
 * @return {number}
 */
function majority(size) {
  return Math.floor(size / 2) + 1;
}

/**
 * Raft-logic spike cluster wrapper.
 */
class RaftLogicSpikeCluster {
  /**
   * @param {Object} [options]
   * @param {Array<string>} [options.replicaIds]
   * @param {number} [options.size]
   * @param {Object} [options.logger]
   * @param {string} [options.storageKind]
   * @param {string} [options.storageDir]
   * @param {number} [options.electionTick]
   * @param {number} [options.heartbeatTick]
   * @param {number} [options.tickIntervalMs]
   */
  constructor(options = {}) {
    const replicaIds = Array.isArray(options.replicaIds) &&
      options.replicaIds.length > 0 ?
      options.replicaIds :
      buildReplicaIds(options.size || SPIKE_CLUSTER_DEFAULT.SIZE);

    this.replicaIds = [...new Set(replicaIds.map((id) => String(id)))];
    this.logger = options.logger || console;
    this.storageKind = options.storageKind ||
      SPIKE_CLUSTER_DEFAULT.STORAGE_KIND_MEMORY;
    this.storageDir = options.storageDir || null;
    this.electionTick = Number.isInteger(options.electionTick) ?
      options.electionTick :
      RAFT_LOGIC_SPIKE_DEFAULT.ELECTION_TICK;
    this.heartbeatTick = Number.isInteger(options.heartbeatTick) ?
      options.heartbeatTick :
      RAFT_LOGIC_SPIKE_DEFAULT.HEARTBEAT_TICK;
    this.tickIntervalMs = Number.isInteger(options.tickIntervalMs) ?
      options.tickIntervalMs :
      RAFT_LOGIC_SPIKE_DEFAULT.TICK_INTERVAL_MS;

    this.transport = new InMemoryTransport();
    this.adapters = new Map();
    this.commitLog = new Map();
    this._started = false;
  }

  /**
   * Start all replicas in the cluster.
   * @return {Promise<void>}
   */
  async start() {
    if (this._started) {
      return;
    }

    if (this.storageKind === SPIKE_CLUSTER_DEFAULT.STORAGE_KIND_SQLITE &&
      this.storageDir) {
      await mkdir(this.storageDir, {recursive: true});
    }

    for (const replicaId of this.replicaIds) {
      const adapter = this._createAdapter(replicaId);
      this.adapters.set(replicaId, adapter);
      this.commitLog.set(replicaId, []);
    }
    try {
      await Promise.all([...this.adapters.values()].map((adapter) => adapter.start()));
      this._started = true;
    } catch (error) {
      await Promise.all(
        [...this.adapters.values()].map((adapter) =>
          adapter.stop().catch(() => {}),
        ),
      );
      this.adapters.clear();
      this.commitLog.clear();
      this._started = false;
      throw error;
    }
  }

  /**
   * Stop all replicas in the cluster.
   * @return {Promise<void>}
   */
  async stop() {
    if (!this._started) {
      return;
    }

    await Promise.all([...this.adapters.values()].map((adapter) => adapter.stop()));
    this.adapters.clear();
    this._started = false;
  }

  /**
   * Wait until a stable majority leader is observed.
   * @param {number} [timeoutMs]
   * @return {Promise<string>}
   */
  async waitForStableLeader(timeoutMs = RAFT_LOGIC_SPIKE_DEFAULT.WAIT_FOR_LEADER_TIMEOUT_MS) {
    this._assertStarted();
    const deadline = Date.now() + timeoutMs;
    const required = majority(this.replicaIds.length);

    while (Date.now() < deadline) {
      await Promise.all(
        [...this.adapters.values()].map((adapter) =>
          adapter.waitForLeader(timeoutMs).catch(() => null),
        ),
      );
      await sleep(RAFT_LOGIC_SPIKE_DEFAULT.LEADER_STABILIZE_WAIT_MS);

      const snapshots = await this.getStatusSnapshots();
      const counts = new Map();
      for (const snapshot of snapshots) {
        if (!snapshot.leaderId) {
          continue;
        }
        counts.set(
          snapshot.leaderId,
          (counts.get(snapshot.leaderId) || 0) + 1,
        );
      }

      for (const [leaderId, count] of counts.entries()) {
        if (count >= required) {
          return leaderId;
        }
      }
    }

    throw new Error('Stable leader not observed before timeout');
  }

  /**
   * Propose a command from a replica.
   * @param {string} replicaId
   * @param {*} command
   * @param {{autoForward?: boolean, timeoutMs?: number}} [options]
   * @return {Promise<{index: number, term: number}>}
   */
  async proposeFromReplica(replicaId, command, options = {}) {
    this._assertStarted();
    const adapter = this.adapters.get(String(replicaId));
    if (!adapter) {
      throw new Error(`Unknown replica: ${replicaId}`);
    }
    return adapter.propose(command, options);
  }

  /**
   * Propose from current leader.
   * @param {*} command
   * @param {{timeoutMs?: number}} [options]
   * @return {Promise<{index: number, term: number, leaderId: string}>}
   */
  async proposeFromLeader(command, options = {}) {
    const leaderId = await this.waitForStableLeader(
      options.timeoutMs || RAFT_LOGIC_SPIKE_DEFAULT.WAIT_FOR_LEADER_TIMEOUT_MS,
    );
    const result = await this.proposeFromReplica(leaderId, command, {
      autoForward: false,
      timeoutMs: options.timeoutMs,
    });
    return {...result, leaderId};
  }

  /**
   * Ask current leader to step down and wait for a new stable leader.
   * @param {number} [timeoutMs]
   * @return {Promise<{previousLeaderId: string, nextLeaderId: string}>}
   */
  async triggerLeaderFailover(
    timeoutMs = RAFT_LOGIC_SPIKE_DEFAULT.WAIT_FOR_LEADER_TIMEOUT_MS,
  ) {
    this._assertStarted();
    const previousLeaderId = await this.waitForStableLeader(timeoutMs);
    const previousLeader = this.adapters.get(previousLeaderId);
    const node = previousLeader ? previousLeader.getNode() : null;
    if (!node) {
      throw new Error('Leader node unavailable for failover');
    }

    await node.stepDown(timeoutMs);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const nextLeaderId = await this.waitForStableLeader(timeoutMs);
      if (nextLeaderId !== previousLeaderId) {
        return {previousLeaderId, nextLeaderId};
      }
      await sleep(RAFT_LOGIC_SPIKE_DEFAULT.LEADER_STABILIZE_WAIT_MS);
    }

    throw new Error('Leader failover did not produce a different leader');
  }

  /**
   * Restart one replica when sqlite-backed storage is enabled.
   * @param {string} replicaId
   * @param {Object} [options]
   * @param {boolean} [options.graceful]
   * @return {Promise<{replicaId: string, graceful: boolean, status: Object|null}>}
   */
  async restartReplica(replicaId, options = {}) {
    this._assertStarted();
    const resolvedReplicaId = String(replicaId);
    const adapter = this.adapters.get(resolvedReplicaId);
    if (!adapter) {
      throw new Error(`Unknown replica: ${replicaId}`);
    }
    const graceful = options.graceful !== false;

    await adapter.stop({drain: graceful});
    const replacement = this._createAdapter(resolvedReplicaId);
    this.adapters.set(resolvedReplicaId, replacement);
    await replacement.start();
    await sleep(RAFT_LOGIC_SPIKE_DEFAULT.RESTART_WAIT_MS);
    const status = await replacement.refreshStatus();

    return {
      replicaId: resolvedReplicaId,
      graceful,
      status,
    };
  }

  /**
   * Restart the current leader and wait for a stable leader afterwards.
   * @param {Object} [options]
   * @param {number} [options.timeoutMs]
   * @param {boolean} [options.graceful]
   * @return {Promise<Object>}
   */
  async restartLeader(options = {}) {
    this._assertStarted();
    const timeoutMs = Number.isInteger(options.timeoutMs) ?
      options.timeoutMs :
      RAFT_LOGIC_SPIKE_DEFAULT.WAIT_FOR_LEADER_TIMEOUT_MS;
    const previousLeaderId = await this.waitForStableLeader(timeoutMs);
    const restart = await this.restartReplica(previousLeaderId, {
      graceful: options.graceful !== false,
    });
    const nextLeaderId = await this.waitForStableLeader(timeoutMs);

    return {
      previousLeaderId,
      nextLeaderId,
      restart,
    };
  }

  /**
   * Restart replicas one-by-one and wait for stability between each step.
   * @param {Object} [options]
   * @param {Array<string>} [options.order]
   * @param {number} [options.timeoutMs]
   * @param {boolean} [options.graceful]
   * @return {Promise<Object>}
   */
  async rollingRestart(options = {}) {
    this._assertStarted();
    const timeoutMs = Number.isInteger(options.timeoutMs) ?
      options.timeoutMs :
      RAFT_LOGIC_SPIKE_DEFAULT.WAIT_FOR_LEADER_TIMEOUT_MS;
    const graceful = options.graceful !== false;
    const order = Array.isArray(options.order) &&
      options.order.length > 0 ?
      options.order.map((id) => String(id)) :
      [...this.replicaIds];
    const steps = [];

    for (const replicaId of order) {
      const restart = await this.restartReplica(replicaId, {graceful});
      const stableLeaderId = await this.waitForStableLeader(timeoutMs);
      const adapter = this.adapters.get(replicaId);
      const stableStatus = adapter ?
        await adapter.refreshStatus() :
        restart.status;
      steps.push({
        replicaId,
        stableLeaderId,
        status: stableStatus,
        graceful,
      });
    }

    return {
      order,
      steps,
      finalLeaderId: await this.waitForStableLeader(timeoutMs),
    };
  }

  /**
   * Fetch status snapshots for all replicas.
   * @return {Promise<Array<Object>>}
   */
  async getStatusSnapshots() {
    this._assertStarted();
    await Promise.all(
      [...this.adapters.values()].map((adapter) => adapter.refreshStatus()),
    );
    return this.replicaIds.map((replicaId) => {
      const adapter = this.adapters.get(replicaId);
      return adapter ? adapter.getStatusSnapshot() : {
        replicaId,
        role: null,
        leaderId: null,
        term: null,
      };
    });
  }

  /**
   * Return commit records for one replica.
   * @param {string} replicaId
   * @return {Array<Object>}
   */
  getReplicaCommitLog(replicaId) {
    return [...(this.commitLog.get(String(replicaId)) || [])];
  }

  /**
   * Return adapter instance for a replica.
   * @param {string} replicaId
   * @return {RaftLogicSpikeAdapter|null}
   */
  getAdapter(replicaId) {
    return this.adapters.get(String(replicaId)) || null;
  }

  /**
   * Return combined commit records for all replicas.
   * @return {Array<Object>}
   */
  getAllCommitRecords() {
    const records = [];
    for (const replicaId of this.replicaIds) {
      const replicaRecords = this.commitLog.get(replicaId) || [];
      for (const record of replicaRecords) {
        records.push(record);
      }
    }
    return records;
  }

  /**
   * Run idle soak and sample CPU/RSS/fsWrite periodically.
   * @param {number} durationMs
   * @param {number} sampleIntervalMs
   * @return {Promise<{durationMs: number, samples: Array<Object>, summary: Object}>}
   */
  async runIdleSoak(durationMs, sampleIntervalMs) {
    this._assertStarted();
    const startUsage = process.cpuUsage();
    const startResource = process.resourceUsage();
    const startMs = Date.now();
    const samples = [];

    while (Date.now() - startMs < durationMs) {
      const memory = process.memoryUsage();
      const elapsedMs = Date.now() - startMs;
      samples.push({
        elapsedMs,
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        fsWrite: process.resourceUsage().fsWrite,
      });
      await sleep(sampleIntervalMs);
    }

    const wallMs = Date.now() - startMs;
    const endUsage = process.cpuUsage(startUsage);
    const endResource = process.resourceUsage();
    const cpuTotalMicros = endUsage.user + endUsage.system;
    const cpuPercent = wallMs > 0 ?
      (cpuTotalMicros / (wallMs * RAFT_LOGIC_SPIKE_TIME.SECOND_MS)) * 100 :
      0;
    const fsWriteDelta = endResource.fsWrite - startResource.fsWrite;
    const writeBytesPerSec = wallMs > 0 ?
      (fsWriteDelta / wallMs) * RAFT_LOGIC_SPIKE_TIME.SECOND_MS :
      0;

    const first = samples[0] || {rssBytes: 0};
    const last = samples[samples.length - 1] || {rssBytes: 0};
    const rssGrowthBytes = last.rssBytes - first.rssBytes;

    return {
      durationMs: wallMs,
      samples,
      summary: {
        sampleCount: samples.length,
        cpuPercent,
        rssStartBytes: first.rssBytes,
        rssEndBytes: last.rssBytes,
        rssGrowthBytes,
        fsWriteDelta,
        writeBytesPerSec,
      },
    };
  }

  /**
   * Create and configure one adapter.
   * @param {string} replicaId
   * @return {RaftLogicSpikeAdapter}
   * @private
   */
  _createAdapter(replicaId) {
    const sqliteFile = this.storageKind === SPIKE_CLUSTER_DEFAULT.STORAGE_KIND_SQLITE &&
      this.storageDir ?
      buildReplicaSqlitePath(this.storageDir, replicaId) :
      null;

    return new RaftLogicSpikeAdapter({
      replicaId,
      replicaIds: this.replicaIds,
      transport: this.transport,
      logger: this.logger,
      electionTick: this.electionTick,
      heartbeatTick: this.heartbeatTick,
      tickIntervalMs: this.tickIntervalMs,
      sqliteFile,
      applyCommit: async (commitRecord) => {
        const records = this.commitLog.get(replicaId);
        if (records) {
          records.push({
            ...commitRecord,
            committedAt: Date.now(),
          });
        }
      },
    });
  }

  /**
   * Assert cluster started.
   * @private
   */
  _assertStarted() {
    if (!this._started) {
      throw new Error('Cluster is not started');
    }
  }
}

export {
  RaftLogicSpikeCluster,
  SPIKE_CLUSTER_DEFAULT,
};
