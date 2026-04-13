/**
 * Cluster harness for raft-logic contained spike validation.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { InMemoryTransport } from 'raft-logic';
import { RaftLogicSpikeAdapter } from './raft-logic-spike-adapter.js';
import { RAFT_LOGIC_SPIKE_DEFAULT, RAFT_LOGIC_SPIKE_TIME } from './raft-logic-spike-constants.js';
const SPIKE_CLUSTER_DEFAULT = Object.freeze(stryMutAct_9fa48("129007") ? {} : (stryCov_9fa48("129007"), {
  SIZE: 3,
  REPLICA_ID_PREFIX: stryMutAct_9fa48("129008") ? "" : (stryCov_9fa48("129008"), 'replica-'),
  STORAGE_KIND_MEMORY: stryMutAct_9fa48("129009") ? "" : (stryCov_9fa48("129009"), 'memory'),
  STORAGE_KIND_SQLITE: stryMutAct_9fa48("129010") ? "" : (stryCov_9fa48("129010"), 'sqlite')
}));

/**
 * Sleep helper.
 * @param {number} ms
 * @return {Promise<void>}
 */
function sleep(ms) {
  if (stryMutAct_9fa48("129011")) {
    {}
  } else {
    stryCov_9fa48("129011");
    return new Promise(stryMutAct_9fa48("129012") ? () => undefined : (stryCov_9fa48("129012"), resolve => setTimeout(resolve, ms)));
  }
}

/**
 * Build default replica IDs.
 * @param {number} size
 * @return {Array<string>}
 */
function buildReplicaIds(size) {
  if (stryMutAct_9fa48("129013")) {
    {}
  } else {
    stryCov_9fa48("129013");
    const ids = stryMutAct_9fa48("129014") ? ["Stryker was here"] : (stryCov_9fa48("129014"), []);
    for (let i = 1; stryMutAct_9fa48("129017") ? i > size : stryMutAct_9fa48("129016") ? i < size : stryMutAct_9fa48("129015") ? false : (stryCov_9fa48("129015", "129016", "129017"), i <= size); stryMutAct_9fa48("129018") ? i-- : (stryCov_9fa48("129018"), i++)) {
      if (stryMutAct_9fa48("129019")) {
        {}
      } else {
        stryCov_9fa48("129019");
        ids.push(stryMutAct_9fa48("129020") ? SPIKE_CLUSTER_DEFAULT.REPLICA_ID_PREFIX - String(i) : (stryCov_9fa48("129020"), SPIKE_CLUSTER_DEFAULT.REPLICA_ID_PREFIX + String(i)));
      }
    }
    return ids;
  }
}

/**
 * Build sqlite path for a replica.
 * @param {string} baseDir
 * @param {string} replicaId
 * @return {string}
 */
function buildReplicaSqlitePath(baseDir, replicaId) {
  if (stryMutAct_9fa48("129021")) {
    {}
  } else {
    stryCov_9fa48("129021");
    return join(baseDir, stryMutAct_9fa48("129022") ? `` : (stryCov_9fa48("129022"), `${replicaId}.sqlite`));
  }
}

/**
 * Compute majority threshold for a cluster size.
 * @param {number} size
 * @return {number}
 */
function majority(size) {
  if (stryMutAct_9fa48("129023")) {
    {}
  } else {
    stryCov_9fa48("129023");
    return stryMutAct_9fa48("129024") ? Math.floor(size / 2) - 1 : (stryCov_9fa48("129024"), Math.floor(stryMutAct_9fa48("129025") ? size * 2 : (stryCov_9fa48("129025"), size / 2)) + 1);
  }
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
    if (stryMutAct_9fa48("129026")) {
      {}
    } else {
      stryCov_9fa48("129026");
      const replicaIds = (stryMutAct_9fa48("129029") ? Array.isArray(options.replicaIds) || options.replicaIds.length > 0 : stryMutAct_9fa48("129028") ? false : stryMutAct_9fa48("129027") ? true : (stryCov_9fa48("129027", "129028", "129029"), Array.isArray(options.replicaIds) && (stryMutAct_9fa48("129032") ? options.replicaIds.length <= 0 : stryMutAct_9fa48("129031") ? options.replicaIds.length >= 0 : stryMutAct_9fa48("129030") ? true : (stryCov_9fa48("129030", "129031", "129032"), options.replicaIds.length > 0)))) ? options.replicaIds : buildReplicaIds(stryMutAct_9fa48("129035") ? options.size && SPIKE_CLUSTER_DEFAULT.SIZE : stryMutAct_9fa48("129034") ? false : stryMutAct_9fa48("129033") ? true : (stryCov_9fa48("129033", "129034", "129035"), options.size || SPIKE_CLUSTER_DEFAULT.SIZE));
      this.replicaIds = stryMutAct_9fa48("129036") ? [] : (stryCov_9fa48("129036"), [...new Set(replicaIds.map(stryMutAct_9fa48("129037") ? () => undefined : (stryCov_9fa48("129037"), id => String(id))))]);
      this.logger = stryMutAct_9fa48("129040") ? options.logger && console : stryMutAct_9fa48("129039") ? false : stryMutAct_9fa48("129038") ? true : (stryCov_9fa48("129038", "129039", "129040"), options.logger || console);
      this.storageKind = stryMutAct_9fa48("129043") ? options.storageKind && SPIKE_CLUSTER_DEFAULT.STORAGE_KIND_MEMORY : stryMutAct_9fa48("129042") ? false : stryMutAct_9fa48("129041") ? true : (stryCov_9fa48("129041", "129042", "129043"), options.storageKind || SPIKE_CLUSTER_DEFAULT.STORAGE_KIND_MEMORY);
      this.storageDir = stryMutAct_9fa48("129046") ? options.storageDir && null : stryMutAct_9fa48("129045") ? false : stryMutAct_9fa48("129044") ? true : (stryCov_9fa48("129044", "129045", "129046"), options.storageDir || null);
      this.electionTick = Number.isInteger(options.electionTick) ? options.electionTick : RAFT_LOGIC_SPIKE_DEFAULT.ELECTION_TICK;
      this.heartbeatTick = Number.isInteger(options.heartbeatTick) ? options.heartbeatTick : RAFT_LOGIC_SPIKE_DEFAULT.HEARTBEAT_TICK;
      this.tickIntervalMs = Number.isInteger(options.tickIntervalMs) ? options.tickIntervalMs : RAFT_LOGIC_SPIKE_DEFAULT.TICK_INTERVAL_MS;
      this.transport = new InMemoryTransport();
      this.adapters = new Map();
      this.commitLog = new Map();
      this._started = stryMutAct_9fa48("129047") ? true : (stryCov_9fa48("129047"), false);
    }
  }

  /**
   * Start all replicas in the cluster.
   * @return {Promise<void>}
   */
  async start() {
    if (stryMutAct_9fa48("129048")) {
      {}
    } else {
      stryCov_9fa48("129048");
      if (stryMutAct_9fa48("129050") ? false : stryMutAct_9fa48("129049") ? true : (stryCov_9fa48("129049", "129050"), this._started)) {
        if (stryMutAct_9fa48("129051")) {
          {}
        } else {
          stryCov_9fa48("129051");
          return;
        }
      }
      if (stryMutAct_9fa48("129054") ? this.storageKind === SPIKE_CLUSTER_DEFAULT.STORAGE_KIND_SQLITE || this.storageDir : stryMutAct_9fa48("129053") ? false : stryMutAct_9fa48("129052") ? true : (stryCov_9fa48("129052", "129053", "129054"), (stryMutAct_9fa48("129056") ? this.storageKind !== SPIKE_CLUSTER_DEFAULT.STORAGE_KIND_SQLITE : stryMutAct_9fa48("129055") ? true : (stryCov_9fa48("129055", "129056"), this.storageKind === SPIKE_CLUSTER_DEFAULT.STORAGE_KIND_SQLITE)) && this.storageDir)) {
        if (stryMutAct_9fa48("129057")) {
          {}
        } else {
          stryCov_9fa48("129057");
          await mkdir(this.storageDir, stryMutAct_9fa48("129058") ? {} : (stryCov_9fa48("129058"), {
            recursive: stryMutAct_9fa48("129059") ? false : (stryCov_9fa48("129059"), true)
          }));
        }
      }
      for (const replicaId of this.replicaIds) {
        if (stryMutAct_9fa48("129060")) {
          {}
        } else {
          stryCov_9fa48("129060");
          const adapter = this._createAdapter(replicaId);
          this.adapters.set(replicaId, adapter);
          this.commitLog.set(replicaId, stryMutAct_9fa48("129061") ? ["Stryker was here"] : (stryCov_9fa48("129061"), []));
        }
      }
      try {
        if (stryMutAct_9fa48("129062")) {
          {}
        } else {
          stryCov_9fa48("129062");
          await Promise.all((stryMutAct_9fa48("129063") ? [] : (stryCov_9fa48("129063"), [...this.adapters.values()])).map(stryMutAct_9fa48("129064") ? () => undefined : (stryCov_9fa48("129064"), adapter => adapter.start())));
          this._started = stryMutAct_9fa48("129065") ? false : (stryCov_9fa48("129065"), true);
        }
      } catch (error) {
        if (stryMutAct_9fa48("129066")) {
          {}
        } else {
          stryCov_9fa48("129066");
          await Promise.all((stryMutAct_9fa48("129067") ? [] : (stryCov_9fa48("129067"), [...this.adapters.values()])).map(stryMutAct_9fa48("129068") ? () => undefined : (stryCov_9fa48("129068"), adapter => adapter.stop().catch(() => {}))));
          this.adapters.clear();
          this.commitLog.clear();
          this._started = stryMutAct_9fa48("129069") ? true : (stryCov_9fa48("129069"), false);
          throw error;
        }
      }
    }
  }

  /**
   * Stop all replicas in the cluster.
   * @return {Promise<void>}
   */
  async stop() {
    if (stryMutAct_9fa48("129070")) {
      {}
    } else {
      stryCov_9fa48("129070");
      if (stryMutAct_9fa48("129073") ? false : stryMutAct_9fa48("129072") ? true : stryMutAct_9fa48("129071") ? this._started : (stryCov_9fa48("129071", "129072", "129073"), !this._started)) {
        if (stryMutAct_9fa48("129074")) {
          {}
        } else {
          stryCov_9fa48("129074");
          return;
        }
      }
      await Promise.all((stryMutAct_9fa48("129075") ? [] : (stryCov_9fa48("129075"), [...this.adapters.values()])).map(stryMutAct_9fa48("129076") ? () => undefined : (stryCov_9fa48("129076"), adapter => adapter.stop())));
      this.adapters.clear();
      this._started = stryMutAct_9fa48("129077") ? true : (stryCov_9fa48("129077"), false);
    }
  }

  /**
   * Wait until a stable majority leader is observed.
   * @param {number} [timeoutMs]
   * @return {Promise<string>}
   */
  async waitForStableLeader(timeoutMs = RAFT_LOGIC_SPIKE_DEFAULT.WAIT_FOR_LEADER_TIMEOUT_MS) {
    if (stryMutAct_9fa48("129078")) {
      {}
    } else {
      stryCov_9fa48("129078");
      this._assertStarted();
      const deadline = stryMutAct_9fa48("129079") ? Date.now() - timeoutMs : (stryCov_9fa48("129079"), Date.now() + timeoutMs);
      const required = majority(this.replicaIds.length);
      while (stryMutAct_9fa48("129082") ? Date.now() >= deadline : stryMutAct_9fa48("129081") ? Date.now() <= deadline : stryMutAct_9fa48("129080") ? false : (stryCov_9fa48("129080", "129081", "129082"), Date.now() < deadline)) {
        if (stryMutAct_9fa48("129083")) {
          {}
        } else {
          stryCov_9fa48("129083");
          await Promise.all((stryMutAct_9fa48("129084") ? [] : (stryCov_9fa48("129084"), [...this.adapters.values()])).map(stryMutAct_9fa48("129085") ? () => undefined : (stryCov_9fa48("129085"), adapter => adapter.waitForLeader(timeoutMs).catch(stryMutAct_9fa48("129086") ? () => undefined : (stryCov_9fa48("129086"), () => null)))));
          await sleep(RAFT_LOGIC_SPIKE_DEFAULT.LEADER_STABILIZE_WAIT_MS);
          const snapshots = await this.getStatusSnapshots();
          const counts = new Map();
          for (const snapshot of snapshots) {
            if (stryMutAct_9fa48("129087")) {
              {}
            } else {
              stryCov_9fa48("129087");
              if (stryMutAct_9fa48("129090") ? false : stryMutAct_9fa48("129089") ? true : stryMutAct_9fa48("129088") ? snapshot.leaderId : (stryCov_9fa48("129088", "129089", "129090"), !snapshot.leaderId)) {
                if (stryMutAct_9fa48("129091")) {
                  {}
                } else {
                  stryCov_9fa48("129091");
                  continue;
                }
              }
              counts.set(snapshot.leaderId, stryMutAct_9fa48("129092") ? (counts.get(snapshot.leaderId) || 0) - 1 : (stryCov_9fa48("129092"), (stryMutAct_9fa48("129095") ? counts.get(snapshot.leaderId) && 0 : stryMutAct_9fa48("129094") ? false : stryMutAct_9fa48("129093") ? true : (stryCov_9fa48("129093", "129094", "129095"), counts.get(snapshot.leaderId) || 0)) + 1));
            }
          }
          for (const [leaderId, count] of counts.entries()) {
            if (stryMutAct_9fa48("129096")) {
              {}
            } else {
              stryCov_9fa48("129096");
              if (stryMutAct_9fa48("129100") ? count < required : stryMutAct_9fa48("129099") ? count > required : stryMutAct_9fa48("129098") ? false : stryMutAct_9fa48("129097") ? true : (stryCov_9fa48("129097", "129098", "129099", "129100"), count >= required)) {
                if (stryMutAct_9fa48("129101")) {
                  {}
                } else {
                  stryCov_9fa48("129101");
                  return leaderId;
                }
              }
            }
          }
        }
      }
      throw new Error(stryMutAct_9fa48("129102") ? "" : (stryCov_9fa48("129102"), 'Stable leader not observed before timeout'));
    }
  }

  /**
   * Propose a command from a replica.
   * @param {string} replicaId
   * @param {*} command
   * @param {{autoForward?: boolean, timeoutMs?: number}} [options]
   * @return {Promise<{index: number, term: number}>}
   */
  async proposeFromReplica(replicaId, command, options = {}) {
    if (stryMutAct_9fa48("129103")) {
      {}
    } else {
      stryCov_9fa48("129103");
      this._assertStarted();
      const adapter = this.adapters.get(String(replicaId));
      if (stryMutAct_9fa48("129106") ? false : stryMutAct_9fa48("129105") ? true : stryMutAct_9fa48("129104") ? adapter : (stryCov_9fa48("129104", "129105", "129106"), !adapter)) {
        if (stryMutAct_9fa48("129107")) {
          {}
        } else {
          stryCov_9fa48("129107");
          throw new Error(stryMutAct_9fa48("129108") ? `` : (stryCov_9fa48("129108"), `Unknown replica: ${replicaId}`));
        }
      }
      return adapter.propose(command, options);
    }
  }

  /**
   * Propose from current leader.
   * @param {*} command
   * @param {{timeoutMs?: number}} [options]
   * @return {Promise<{index: number, term: number, leaderId: string}>}
   */
  async proposeFromLeader(command, options = {}) {
    if (stryMutAct_9fa48("129109")) {
      {}
    } else {
      stryCov_9fa48("129109");
      const leaderId = await this.waitForStableLeader(stryMutAct_9fa48("129112") ? options.timeoutMs && RAFT_LOGIC_SPIKE_DEFAULT.WAIT_FOR_LEADER_TIMEOUT_MS : stryMutAct_9fa48("129111") ? false : stryMutAct_9fa48("129110") ? true : (stryCov_9fa48("129110", "129111", "129112"), options.timeoutMs || RAFT_LOGIC_SPIKE_DEFAULT.WAIT_FOR_LEADER_TIMEOUT_MS));
      const result = await this.proposeFromReplica(leaderId, command, stryMutAct_9fa48("129113") ? {} : (stryCov_9fa48("129113"), {
        autoForward: stryMutAct_9fa48("129114") ? true : (stryCov_9fa48("129114"), false),
        timeoutMs: options.timeoutMs
      }));
      return stryMutAct_9fa48("129115") ? {} : (stryCov_9fa48("129115"), {
        ...result,
        leaderId
      });
    }
  }

  /**
   * Ask current leader to step down and wait for a new stable leader.
   * @param {number} [timeoutMs]
   * @return {Promise<{previousLeaderId: string, nextLeaderId: string}>}
   */
  async triggerLeaderFailover(timeoutMs = RAFT_LOGIC_SPIKE_DEFAULT.WAIT_FOR_LEADER_TIMEOUT_MS) {
    if (stryMutAct_9fa48("129116")) {
      {}
    } else {
      stryCov_9fa48("129116");
      this._assertStarted();
      const previousLeaderId = await this.waitForStableLeader(timeoutMs);
      const previousLeader = this.adapters.get(previousLeaderId);
      const node = previousLeader ? previousLeader.getNode() : null;
      if (stryMutAct_9fa48("129119") ? false : stryMutAct_9fa48("129118") ? true : stryMutAct_9fa48("129117") ? node : (stryCov_9fa48("129117", "129118", "129119"), !node)) {
        if (stryMutAct_9fa48("129120")) {
          {}
        } else {
          stryCov_9fa48("129120");
          throw new Error(stryMutAct_9fa48("129121") ? "" : (stryCov_9fa48("129121"), 'Leader node unavailable for failover'));
        }
      }
      await node.stepDown(timeoutMs);
      const deadline = stryMutAct_9fa48("129122") ? Date.now() - timeoutMs : (stryCov_9fa48("129122"), Date.now() + timeoutMs);
      while (stryMutAct_9fa48("129125") ? Date.now() >= deadline : stryMutAct_9fa48("129124") ? Date.now() <= deadline : stryMutAct_9fa48("129123") ? false : (stryCov_9fa48("129123", "129124", "129125"), Date.now() < deadline)) {
        if (stryMutAct_9fa48("129126")) {
          {}
        } else {
          stryCov_9fa48("129126");
          const nextLeaderId = await this.waitForStableLeader(timeoutMs);
          if (stryMutAct_9fa48("129129") ? nextLeaderId === previousLeaderId : stryMutAct_9fa48("129128") ? false : stryMutAct_9fa48("129127") ? true : (stryCov_9fa48("129127", "129128", "129129"), nextLeaderId !== previousLeaderId)) {
            if (stryMutAct_9fa48("129130")) {
              {}
            } else {
              stryCov_9fa48("129130");
              return stryMutAct_9fa48("129131") ? {} : (stryCov_9fa48("129131"), {
                previousLeaderId,
                nextLeaderId
              });
            }
          }
          await sleep(RAFT_LOGIC_SPIKE_DEFAULT.LEADER_STABILIZE_WAIT_MS);
        }
      }
      throw new Error(stryMutAct_9fa48("129132") ? "" : (stryCov_9fa48("129132"), 'Leader failover did not produce a different leader'));
    }
  }

  /**
   * Restart one replica when sqlite-backed storage is enabled.
   * @param {string} replicaId
   * @param {Object} [options]
   * @param {boolean} [options.graceful]
   * @return {Promise<{replicaId: string, graceful: boolean, status: Object|null}>}
   */
  async restartReplica(replicaId, options = {}) {
    if (stryMutAct_9fa48("129133")) {
      {}
    } else {
      stryCov_9fa48("129133");
      this._assertStarted();
      const resolvedReplicaId = String(replicaId);
      const adapter = this.adapters.get(resolvedReplicaId);
      if (stryMutAct_9fa48("129136") ? false : stryMutAct_9fa48("129135") ? true : stryMutAct_9fa48("129134") ? adapter : (stryCov_9fa48("129134", "129135", "129136"), !adapter)) {
        if (stryMutAct_9fa48("129137")) {
          {}
        } else {
          stryCov_9fa48("129137");
          throw new Error(stryMutAct_9fa48("129138") ? `` : (stryCov_9fa48("129138"), `Unknown replica: ${replicaId}`));
        }
      }
      const graceful = stryMutAct_9fa48("129141") ? options.graceful === false : stryMutAct_9fa48("129140") ? false : stryMutAct_9fa48("129139") ? true : (stryCov_9fa48("129139", "129140", "129141"), options.graceful !== (stryMutAct_9fa48("129142") ? true : (stryCov_9fa48("129142"), false)));
      await adapter.stop(stryMutAct_9fa48("129143") ? {} : (stryCov_9fa48("129143"), {
        drain: graceful
      }));
      const replacement = this._createAdapter(resolvedReplicaId);
      this.adapters.set(resolvedReplicaId, replacement);
      await replacement.start();
      await sleep(RAFT_LOGIC_SPIKE_DEFAULT.RESTART_WAIT_MS);
      const status = await replacement.refreshStatus();
      return stryMutAct_9fa48("129144") ? {} : (stryCov_9fa48("129144"), {
        replicaId: resolvedReplicaId,
        graceful,
        status
      });
    }
  }

  /**
   * Restart the current leader and wait for a stable leader afterwards.
   * @param {Object} [options]
   * @param {number} [options.timeoutMs]
   * @param {boolean} [options.graceful]
   * @return {Promise<Object>}
   */
  async restartLeader(options = {}) {
    if (stryMutAct_9fa48("129145")) {
      {}
    } else {
      stryCov_9fa48("129145");
      this._assertStarted();
      const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : RAFT_LOGIC_SPIKE_DEFAULT.WAIT_FOR_LEADER_TIMEOUT_MS;
      const previousLeaderId = await this.waitForStableLeader(timeoutMs);
      const restart = await this.restartReplica(previousLeaderId, stryMutAct_9fa48("129146") ? {} : (stryCov_9fa48("129146"), {
        graceful: stryMutAct_9fa48("129149") ? options.graceful === false : stryMutAct_9fa48("129148") ? false : stryMutAct_9fa48("129147") ? true : (stryCov_9fa48("129147", "129148", "129149"), options.graceful !== (stryMutAct_9fa48("129150") ? true : (stryCov_9fa48("129150"), false)))
      }));
      const nextLeaderId = await this.waitForStableLeader(timeoutMs);
      return stryMutAct_9fa48("129151") ? {} : (stryCov_9fa48("129151"), {
        previousLeaderId,
        nextLeaderId,
        restart
      });
    }
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
    if (stryMutAct_9fa48("129152")) {
      {}
    } else {
      stryCov_9fa48("129152");
      this._assertStarted();
      const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : RAFT_LOGIC_SPIKE_DEFAULT.WAIT_FOR_LEADER_TIMEOUT_MS;
      const graceful = stryMutAct_9fa48("129155") ? options.graceful === false : stryMutAct_9fa48("129154") ? false : stryMutAct_9fa48("129153") ? true : (stryCov_9fa48("129153", "129154", "129155"), options.graceful !== (stryMutAct_9fa48("129156") ? true : (stryCov_9fa48("129156"), false)));
      const order = (stryMutAct_9fa48("129159") ? Array.isArray(options.order) || options.order.length > 0 : stryMutAct_9fa48("129158") ? false : stryMutAct_9fa48("129157") ? true : (stryCov_9fa48("129157", "129158", "129159"), Array.isArray(options.order) && (stryMutAct_9fa48("129162") ? options.order.length <= 0 : stryMutAct_9fa48("129161") ? options.order.length >= 0 : stryMutAct_9fa48("129160") ? true : (stryCov_9fa48("129160", "129161", "129162"), options.order.length > 0)))) ? options.order.map(stryMutAct_9fa48("129163") ? () => undefined : (stryCov_9fa48("129163"), id => String(id))) : stryMutAct_9fa48("129164") ? [] : (stryCov_9fa48("129164"), [...this.replicaIds]);
      const steps = stryMutAct_9fa48("129165") ? ["Stryker was here"] : (stryCov_9fa48("129165"), []);
      for (const replicaId of order) {
        if (stryMutAct_9fa48("129166")) {
          {}
        } else {
          stryCov_9fa48("129166");
          const restart = await this.restartReplica(replicaId, stryMutAct_9fa48("129167") ? {} : (stryCov_9fa48("129167"), {
            graceful
          }));
          const stableLeaderId = await this.waitForStableLeader(timeoutMs);
          const adapter = this.adapters.get(replicaId);
          const stableStatus = adapter ? await adapter.refreshStatus() : restart.status;
          steps.push(stryMutAct_9fa48("129168") ? {} : (stryCov_9fa48("129168"), {
            replicaId,
            stableLeaderId,
            status: stableStatus,
            graceful
          }));
        }
      }
      return stryMutAct_9fa48("129169") ? {} : (stryCov_9fa48("129169"), {
        order,
        steps,
        finalLeaderId: await this.waitForStableLeader(timeoutMs)
      });
    }
  }

  /**
   * Fetch status snapshots for all replicas.
   * @return {Promise<Array<Object>>}
   */
  async getStatusSnapshots() {
    if (stryMutAct_9fa48("129170")) {
      {}
    } else {
      stryCov_9fa48("129170");
      this._assertStarted();
      await Promise.all((stryMutAct_9fa48("129171") ? [] : (stryCov_9fa48("129171"), [...this.adapters.values()])).map(stryMutAct_9fa48("129172") ? () => undefined : (stryCov_9fa48("129172"), adapter => adapter.refreshStatus())));
      return this.replicaIds.map(replicaId => {
        if (stryMutAct_9fa48("129173")) {
          {}
        } else {
          stryCov_9fa48("129173");
          const adapter = this.adapters.get(replicaId);
          return adapter ? adapter.getStatusSnapshot() : stryMutAct_9fa48("129174") ? {} : (stryCov_9fa48("129174"), {
            replicaId,
            role: null,
            leaderId: null,
            term: null
          });
        }
      });
    }
  }

  /**
   * Return commit records for one replica.
   * @param {string} replicaId
   * @return {Array<Object>}
   */
  getReplicaCommitLog(replicaId) {
    if (stryMutAct_9fa48("129175")) {
      {}
    } else {
      stryCov_9fa48("129175");
      return stryMutAct_9fa48("129176") ? [] : (stryCov_9fa48("129176"), [...(stryMutAct_9fa48("129179") ? this.commitLog.get(String(replicaId)) && [] : stryMutAct_9fa48("129178") ? false : stryMutAct_9fa48("129177") ? true : (stryCov_9fa48("129177", "129178", "129179"), this.commitLog.get(String(replicaId)) || (stryMutAct_9fa48("129180") ? ["Stryker was here"] : (stryCov_9fa48("129180"), []))))]);
    }
  }

  /**
   * Return adapter instance for a replica.
   * @param {string} replicaId
   * @return {RaftLogicSpikeAdapter|null}
   */
  getAdapter(replicaId) {
    if (stryMutAct_9fa48("129181")) {
      {}
    } else {
      stryCov_9fa48("129181");
      return stryMutAct_9fa48("129184") ? this.adapters.get(String(replicaId)) && null : stryMutAct_9fa48("129183") ? false : stryMutAct_9fa48("129182") ? true : (stryCov_9fa48("129182", "129183", "129184"), this.adapters.get(String(replicaId)) || null);
    }
  }

  /**
   * Return combined commit records for all replicas.
   * @return {Array<Object>}
   */
  getAllCommitRecords() {
    if (stryMutAct_9fa48("129185")) {
      {}
    } else {
      stryCov_9fa48("129185");
      const records = stryMutAct_9fa48("129186") ? ["Stryker was here"] : (stryCov_9fa48("129186"), []);
      for (const replicaId of this.replicaIds) {
        if (stryMutAct_9fa48("129187")) {
          {}
        } else {
          stryCov_9fa48("129187");
          const replicaRecords = stryMutAct_9fa48("129190") ? this.commitLog.get(replicaId) && [] : stryMutAct_9fa48("129189") ? false : stryMutAct_9fa48("129188") ? true : (stryCov_9fa48("129188", "129189", "129190"), this.commitLog.get(replicaId) || (stryMutAct_9fa48("129191") ? ["Stryker was here"] : (stryCov_9fa48("129191"), [])));
          for (const record of replicaRecords) {
            if (stryMutAct_9fa48("129192")) {
              {}
            } else {
              stryCov_9fa48("129192");
              records.push(record);
            }
          }
        }
      }
      return records;
    }
  }

  /**
   * Run idle soak and sample CPU/RSS/fsWrite periodically.
   * @param {number} durationMs
   * @param {number} sampleIntervalMs
   * @return {Promise<{durationMs: number, samples: Array<Object>, summary: Object}>}
   */
  async runIdleSoak(durationMs, sampleIntervalMs) {
    if (stryMutAct_9fa48("129193")) {
      {}
    } else {
      stryCov_9fa48("129193");
      this._assertStarted();
      const startUsage = process.cpuUsage();
      const startResource = process.resourceUsage();
      const startMs = Date.now();
      const samples = stryMutAct_9fa48("129194") ? ["Stryker was here"] : (stryCov_9fa48("129194"), []);
      while (stryMutAct_9fa48("129197") ? Date.now() - startMs >= durationMs : stryMutAct_9fa48("129196") ? Date.now() - startMs <= durationMs : stryMutAct_9fa48("129195") ? false : (stryCov_9fa48("129195", "129196", "129197"), (stryMutAct_9fa48("129198") ? Date.now() + startMs : (stryCov_9fa48("129198"), Date.now() - startMs)) < durationMs)) {
        if (stryMutAct_9fa48("129199")) {
          {}
        } else {
          stryCov_9fa48("129199");
          const memory = process.memoryUsage();
          const elapsedMs = stryMutAct_9fa48("129200") ? Date.now() + startMs : (stryCov_9fa48("129200"), Date.now() - startMs);
          samples.push(stryMutAct_9fa48("129201") ? {} : (stryCov_9fa48("129201"), {
            elapsedMs,
            rssBytes: memory.rss,
            heapUsedBytes: memory.heapUsed,
            fsWrite: process.resourceUsage().fsWrite
          }));
          await sleep(sampleIntervalMs);
        }
      }
      const wallMs = stryMutAct_9fa48("129202") ? Date.now() + startMs : (stryCov_9fa48("129202"), Date.now() - startMs);
      const endUsage = process.cpuUsage(startUsage);
      const endResource = process.resourceUsage();
      const cpuTotalMicros = stryMutAct_9fa48("129203") ? endUsage.user - endUsage.system : (stryCov_9fa48("129203"), endUsage.user + endUsage.system);
      const cpuPercent = (stryMutAct_9fa48("129207") ? wallMs <= 0 : stryMutAct_9fa48("129206") ? wallMs >= 0 : stryMutAct_9fa48("129205") ? false : stryMutAct_9fa48("129204") ? true : (stryCov_9fa48("129204", "129205", "129206", "129207"), wallMs > 0)) ? stryMutAct_9fa48("129208") ? cpuTotalMicros / (wallMs * RAFT_LOGIC_SPIKE_TIME.SECOND_MS) / 100 : (stryCov_9fa48("129208"), (stryMutAct_9fa48("129209") ? cpuTotalMicros * (wallMs * RAFT_LOGIC_SPIKE_TIME.SECOND_MS) : (stryCov_9fa48("129209"), cpuTotalMicros / (stryMutAct_9fa48("129210") ? wallMs / RAFT_LOGIC_SPIKE_TIME.SECOND_MS : (stryCov_9fa48("129210"), wallMs * RAFT_LOGIC_SPIKE_TIME.SECOND_MS)))) * 100) : 0;
      const fsWriteDelta = stryMutAct_9fa48("129211") ? endResource.fsWrite + startResource.fsWrite : (stryCov_9fa48("129211"), endResource.fsWrite - startResource.fsWrite);
      const writeBytesPerSec = (stryMutAct_9fa48("129215") ? wallMs <= 0 : stryMutAct_9fa48("129214") ? wallMs >= 0 : stryMutAct_9fa48("129213") ? false : stryMutAct_9fa48("129212") ? true : (stryCov_9fa48("129212", "129213", "129214", "129215"), wallMs > 0)) ? stryMutAct_9fa48("129216") ? fsWriteDelta / wallMs / RAFT_LOGIC_SPIKE_TIME.SECOND_MS : (stryCov_9fa48("129216"), (stryMutAct_9fa48("129217") ? fsWriteDelta * wallMs : (stryCov_9fa48("129217"), fsWriteDelta / wallMs)) * RAFT_LOGIC_SPIKE_TIME.SECOND_MS) : 0;
      const first = stryMutAct_9fa48("129220") ? samples[0] && {
        rssBytes: 0
      } : stryMutAct_9fa48("129219") ? false : stryMutAct_9fa48("129218") ? true : (stryCov_9fa48("129218", "129219", "129220"), samples[0] || (stryMutAct_9fa48("129221") ? {} : (stryCov_9fa48("129221"), {
        rssBytes: 0
      })));
      const last = stryMutAct_9fa48("129224") ? samples[samples.length - 1] && {
        rssBytes: 0
      } : stryMutAct_9fa48("129223") ? false : stryMutAct_9fa48("129222") ? true : (stryCov_9fa48("129222", "129223", "129224"), samples[stryMutAct_9fa48("129225") ? samples.length + 1 : (stryCov_9fa48("129225"), samples.length - 1)] || (stryMutAct_9fa48("129226") ? {} : (stryCov_9fa48("129226"), {
        rssBytes: 0
      })));
      const rssGrowthBytes = stryMutAct_9fa48("129227") ? last.rssBytes + first.rssBytes : (stryCov_9fa48("129227"), last.rssBytes - first.rssBytes);
      return stryMutAct_9fa48("129228") ? {} : (stryCov_9fa48("129228"), {
        durationMs: wallMs,
        samples,
        summary: stryMutAct_9fa48("129229") ? {} : (stryCov_9fa48("129229"), {
          sampleCount: samples.length,
          cpuPercent,
          rssStartBytes: first.rssBytes,
          rssEndBytes: last.rssBytes,
          rssGrowthBytes,
          fsWriteDelta,
          writeBytesPerSec
        })
      });
    }
  }

  /**
   * Create and configure one adapter.
   * @param {string} replicaId
   * @return {RaftLogicSpikeAdapter}
   * @private
   */
  _createAdapter(replicaId) {
    if (stryMutAct_9fa48("129230")) {
      {}
    } else {
      stryCov_9fa48("129230");
      const sqliteFile = (stryMutAct_9fa48("129233") ? this.storageKind === SPIKE_CLUSTER_DEFAULT.STORAGE_KIND_SQLITE || this.storageDir : stryMutAct_9fa48("129232") ? false : stryMutAct_9fa48("129231") ? true : (stryCov_9fa48("129231", "129232", "129233"), (stryMutAct_9fa48("129235") ? this.storageKind !== SPIKE_CLUSTER_DEFAULT.STORAGE_KIND_SQLITE : stryMutAct_9fa48("129234") ? true : (stryCov_9fa48("129234", "129235"), this.storageKind === SPIKE_CLUSTER_DEFAULT.STORAGE_KIND_SQLITE)) && this.storageDir)) ? buildReplicaSqlitePath(this.storageDir, replicaId) : null;
      return new RaftLogicSpikeAdapter(stryMutAct_9fa48("129236") ? {} : (stryCov_9fa48("129236"), {
        replicaId,
        replicaIds: this.replicaIds,
        transport: this.transport,
        logger: this.logger,
        electionTick: this.electionTick,
        heartbeatTick: this.heartbeatTick,
        tickIntervalMs: this.tickIntervalMs,
        sqliteFile,
        applyCommit: async commitRecord => {
          if (stryMutAct_9fa48("129237")) {
            {}
          } else {
            stryCov_9fa48("129237");
            const records = this.commitLog.get(replicaId);
            if (stryMutAct_9fa48("129239") ? false : stryMutAct_9fa48("129238") ? true : (stryCov_9fa48("129238", "129239"), records)) {
              if (stryMutAct_9fa48("129240")) {
                {}
              } else {
                stryCov_9fa48("129240");
                records.push(stryMutAct_9fa48("129241") ? {} : (stryCov_9fa48("129241"), {
                  ...commitRecord,
                  committedAt: Date.now()
                }));
              }
            }
          }
        }
      }));
    }
  }

  /**
   * Assert cluster started.
   * @private
   */
  _assertStarted() {
    if (stryMutAct_9fa48("129242")) {
      {}
    } else {
      stryCov_9fa48("129242");
      if (stryMutAct_9fa48("129245") ? false : stryMutAct_9fa48("129244") ? true : stryMutAct_9fa48("129243") ? this._started : (stryCov_9fa48("129243", "129244", "129245"), !this._started)) {
        if (stryMutAct_9fa48("129246")) {
          {}
        } else {
          stryCov_9fa48("129246");
          throw new Error(stryMutAct_9fa48("129247") ? "" : (stryCov_9fa48("129247"), 'Cluster is not started'));
        }
      }
    }
  }
}
export { RaftLogicSpikeCluster, SPIKE_CLUSTER_DEFAULT };