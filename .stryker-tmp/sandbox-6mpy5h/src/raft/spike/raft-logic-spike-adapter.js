/**
 * Raft-logic contained-spike adapter.
 *
 * Provides a minimal raft lifecycle surface for investigation:
 * startup/shutdown, propose, role changes, commit callback, and leader tracking.
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
import { EventEmitter } from 'events';
import { InMemoryTransport, ThreadedRaftNode } from 'raft-logic';
import { buildRaftLogicIdMaps } from './raft-logic-id-mapper.js';
import { RAFT_LOGIC_SPIKE_DEFAULT, RAFT_LOGIC_SPIKE_ERROR, RAFT_LOGIC_SPIKE_EVENT, RAFT_LOGIC_SPIKE_JSON, RAFT_LOGIC_SPIKE_LOG_MSG, RAFT_LOGIC_SPIKE_ROLE } from './raft-logic-spike-constants.js';
const ROLE_EVENT_MAP = Object.freeze(stryMutAct_9fa48("128745") ? {} : (stryCov_9fa48("128745"), {
  [RAFT_LOGIC_SPIKE_ROLE.LEADER]: RAFT_LOGIC_SPIKE_EVENT.LEADER,
  [RAFT_LOGIC_SPIKE_ROLE.FOLLOWER]: RAFT_LOGIC_SPIKE_EVENT.FOLLOWER,
  [RAFT_LOGIC_SPIKE_ROLE.CANDIDATE]: RAFT_LOGIC_SPIKE_EVENT.CANDIDATE
}));

/**
 * Normalize role values to known raft role names.
 * @param {string} role
 * @return {string}
 */
function normalizeRole(role) {
  if (stryMutAct_9fa48("128746")) {
    {}
  } else {
    stryCov_9fa48("128746");
    const normalized = stryMutAct_9fa48("128747") ? String(role || RAFT_LOGIC_SPIKE_ROLE.FOLLOWER).toUpperCase() : (stryCov_9fa48("128747"), String(stryMutAct_9fa48("128750") ? role && RAFT_LOGIC_SPIKE_ROLE.FOLLOWER : stryMutAct_9fa48("128749") ? false : stryMutAct_9fa48("128748") ? true : (stryCov_9fa48("128748", "128749", "128750"), role || RAFT_LOGIC_SPIKE_ROLE.FOLLOWER)).toLowerCase());
    if (stryMutAct_9fa48("128753") ? normalized === RAFT_LOGIC_SPIKE_ROLE.LEADER && normalized === RAFT_LOGIC_SPIKE_ROLE.CANDIDATE : stryMutAct_9fa48("128752") ? false : stryMutAct_9fa48("128751") ? true : (stryCov_9fa48("128751", "128752", "128753"), (stryMutAct_9fa48("128755") ? normalized !== RAFT_LOGIC_SPIKE_ROLE.LEADER : stryMutAct_9fa48("128754") ? false : (stryCov_9fa48("128754", "128755"), normalized === RAFT_LOGIC_SPIKE_ROLE.LEADER)) || (stryMutAct_9fa48("128757") ? normalized !== RAFT_LOGIC_SPIKE_ROLE.CANDIDATE : stryMutAct_9fa48("128756") ? false : (stryCov_9fa48("128756", "128757"), normalized === RAFT_LOGIC_SPIKE_ROLE.CANDIDATE)))) {
      if (stryMutAct_9fa48("128758")) {
        {}
      } else {
        stryCov_9fa48("128758");
        return normalized;
      }
    }
    return RAFT_LOGIC_SPIKE_ROLE.FOLLOWER;
  }
}

/**
 * Try parsing JSON, fallback to raw string.
 * @param {string} text
 * @return {*}
 */
function parseMaybeJson(text) {
  if (stryMutAct_9fa48("128759")) {
    {}
  } else {
    stryCov_9fa48("128759");
    try {
      if (stryMutAct_9fa48("128760")) {
        {}
      } else {
        stryCov_9fa48("128760");
        return JSON.parse(text);
      }
    } catch (_error) {
      if (stryMutAct_9fa48("128761")) {
        {}
      } else {
        stryCov_9fa48("128761");
        return text;
      }
    }
  }
}

/**
 * Decode raft entry payload from base64/string/bytes.
 * @param {*} rawData
 * @return {*}
 */
function decodeCommittedCommand(rawData) {
  if (stryMutAct_9fa48("128762")) {
    {}
  } else {
    stryCov_9fa48("128762");
    if (stryMutAct_9fa48("128765") ? rawData === null && rawData === undefined : stryMutAct_9fa48("128764") ? false : stryMutAct_9fa48("128763") ? true : (stryCov_9fa48("128763", "128764", "128765"), (stryMutAct_9fa48("128767") ? rawData !== null : stryMutAct_9fa48("128766") ? false : (stryCov_9fa48("128766", "128767"), rawData === null)) || (stryMutAct_9fa48("128769") ? rawData !== undefined : stryMutAct_9fa48("128768") ? false : (stryCov_9fa48("128768", "128769"), rawData === undefined)))) {
      if (stryMutAct_9fa48("128770")) {
        {}
      } else {
        stryCov_9fa48("128770");
        return null;
      }
    }
    if (stryMutAct_9fa48("128773") ? typeof rawData !== 'string' : stryMutAct_9fa48("128772") ? false : stryMutAct_9fa48("128771") ? true : (stryCov_9fa48("128771", "128772", "128773"), typeof rawData === (stryMutAct_9fa48("128774") ? "" : (stryCov_9fa48("128774"), 'string')))) {
      if (stryMutAct_9fa48("128775")) {
        {}
      } else {
        stryCov_9fa48("128775");
        try {
          if (stryMutAct_9fa48("128776")) {
            {}
          } else {
            stryCov_9fa48("128776");
            const decoded = Buffer.from(rawData, stryMutAct_9fa48("128777") ? "" : (stryCov_9fa48("128777"), 'base64')).toString(stryMutAct_9fa48("128778") ? "" : (stryCov_9fa48("128778"), 'utf8'));
            if (stryMutAct_9fa48("128782") ? decoded.length <= 0 : stryMutAct_9fa48("128781") ? decoded.length >= 0 : stryMutAct_9fa48("128780") ? false : stryMutAct_9fa48("128779") ? true : (stryCov_9fa48("128779", "128780", "128781", "128782"), decoded.length > 0)) {
              if (stryMutAct_9fa48("128783")) {
                {}
              } else {
                stryCov_9fa48("128783");
                return parseMaybeJson(decoded);
              }
            }
          }
        } catch (_error) {
          // Ignore and fallback below.
        }
        return parseMaybeJson(rawData);
      }
    }
    if (stryMutAct_9fa48("128786") ? rawData instanceof Uint8Array && Array.isArray(rawData) : stryMutAct_9fa48("128785") ? false : stryMutAct_9fa48("128784") ? true : (stryCov_9fa48("128784", "128785", "128786"), rawData instanceof Uint8Array || Array.isArray(rawData))) {
      if (stryMutAct_9fa48("128787")) {
        {}
      } else {
        stryCov_9fa48("128787");
        const decoded = Buffer.from(rawData).toString(stryMutAct_9fa48("128788") ? "" : (stryCov_9fa48("128788"), 'utf8'));
        return parseMaybeJson(decoded);
      }
    }
    return rawData;
  }
}

/**
 * Serialize a command payload for clientRequest().
 * @param {*} command
 * @return {string}
 */
function serializeCommand(command) {
  if (stryMutAct_9fa48("128789")) {
    {}
  } else {
    stryCov_9fa48("128789");
    if (stryMutAct_9fa48("128792") ? typeof command !== 'string' : stryMutAct_9fa48("128791") ? false : stryMutAct_9fa48("128790") ? true : (stryCov_9fa48("128790", "128791", "128792"), typeof command === (stryMutAct_9fa48("128793") ? "" : (stryCov_9fa48("128793"), 'string')))) {
      if (stryMutAct_9fa48("128794")) {
        {}
      } else {
        stryCov_9fa48("128794");
        return command;
      }
    }
    if (stryMutAct_9fa48("128797") ? command === null && command === undefined : stryMutAct_9fa48("128796") ? false : stryMutAct_9fa48("128795") ? true : (stryCov_9fa48("128795", "128796", "128797"), (stryMutAct_9fa48("128799") ? command !== null : stryMutAct_9fa48("128798") ? false : (stryCov_9fa48("128798", "128799"), command === null)) || (stryMutAct_9fa48("128801") ? command !== undefined : stryMutAct_9fa48("128800") ? false : (stryCov_9fa48("128800", "128801"), command === undefined)))) {
      if (stryMutAct_9fa48("128802")) {
        {}
      } else {
        stryCov_9fa48("128802");
        return RAFT_LOGIC_SPIKE_JSON.EMPTY_OBJECT;
      }
    }
    return JSON.stringify(command);
  }
}

/**
 * Build worker-storage config for threaded raft node.
 * @param {{sqliteFile?: string|null}} options
 * @return {{workerStorage: Object}}
 */
function buildWorkerStorage(options = {}) {
  if (stryMutAct_9fa48("128803")) {
    {}
  } else {
    stryCov_9fa48("128803");
    if (stryMutAct_9fa48("128805") ? false : stryMutAct_9fa48("128804") ? true : (stryCov_9fa48("128804", "128805"), options.sqliteFile)) {
      if (stryMutAct_9fa48("128806")) {
        {}
      } else {
        stryCov_9fa48("128806");
        return stryMutAct_9fa48("128807") ? {} : (stryCov_9fa48("128807"), {
          workerStorage: stryMutAct_9fa48("128808") ? {} : (stryCov_9fa48("128808"), {
            kind: stryMutAct_9fa48("128809") ? "" : (stryCov_9fa48("128809"), 'sqlite'),
            options: stryMutAct_9fa48("128810") ? {} : (stryCov_9fa48("128810"), {
              file: String(options.sqliteFile)
            })
          })
        });
      }
    }
    return stryMutAct_9fa48("128811") ? {} : (stryCov_9fa48("128811"), {
      workerStorage: stryMutAct_9fa48("128812") ? {} : (stryCov_9fa48("128812"), {
        kind: stryMutAct_9fa48("128813") ? "" : (stryCov_9fa48("128813"), 'inmemory')
      })
    });
  }
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
    if (stryMutAct_9fa48("128814")) {
      {}
    } else {
      stryCov_9fa48("128814");
      super();
      if (stryMutAct_9fa48("128817") ? !options.replicaId && typeof options.replicaId !== 'string' : stryMutAct_9fa48("128816") ? false : stryMutAct_9fa48("128815") ? true : (stryCov_9fa48("128815", "128816", "128817"), (stryMutAct_9fa48("128818") ? options.replicaId : (stryCov_9fa48("128818"), !options.replicaId)) || (stryMutAct_9fa48("128820") ? typeof options.replicaId === 'string' : stryMutAct_9fa48("128819") ? false : (stryCov_9fa48("128819", "128820"), typeof options.replicaId !== (stryMutAct_9fa48("128821") ? "" : (stryCov_9fa48("128821"), 'string')))))) {
        if (stryMutAct_9fa48("128822")) {
          {}
        } else {
          stryCov_9fa48("128822");
          throw new Error(RAFT_LOGIC_SPIKE_ERROR.MISSING_REPLICA_ID);
        }
      }
      if (stryMutAct_9fa48("128825") ? !Array.isArray(options.replicaIds) && options.replicaIds.length === 0 : stryMutAct_9fa48("128824") ? false : stryMutAct_9fa48("128823") ? true : (stryCov_9fa48("128823", "128824", "128825"), (stryMutAct_9fa48("128826") ? Array.isArray(options.replicaIds) : (stryCov_9fa48("128826"), !Array.isArray(options.replicaIds))) || (stryMutAct_9fa48("128828") ? options.replicaIds.length !== 0 : stryMutAct_9fa48("128827") ? false : (stryCov_9fa48("128827", "128828"), options.replicaIds.length === 0)))) {
        if (stryMutAct_9fa48("128829")) {
          {}
        } else {
          stryCov_9fa48("128829");
          throw new Error(RAFT_LOGIC_SPIKE_ERROR.INVALID_REPLICA_IDS);
        }
      }
      this.replicaId = String(options.replicaId);
      this.replicaIds = stryMutAct_9fa48("128830") ? [] : (stryCov_9fa48("128830"), [...new Set(options.replicaIds.map(stryMutAct_9fa48("128831") ? () => undefined : (stryCov_9fa48("128831"), id => String(id))))]);
      if (stryMutAct_9fa48("128834") ? false : stryMutAct_9fa48("128833") ? true : stryMutAct_9fa48("128832") ? this.replicaIds.includes(this.replicaId) : (stryCov_9fa48("128832", "128833", "128834"), !this.replicaIds.includes(this.replicaId))) {
        if (stryMutAct_9fa48("128835")) {
          {}
        } else {
          stryCov_9fa48("128835");
          throw new Error(RAFT_LOGIC_SPIKE_ERROR.REPLICA_ID_NOT_IN_CLUSTER);
        }
      }
      const idMaps = buildRaftLogicIdMaps(this.replicaIds);
      this.externalToInternal = idMaps.externalToInternal;
      this.internalToExternal = idMaps.internalToExternal;
      this.internalReplicaId = this.externalToInternal.get(this.replicaId);
      this.internalReplicaIds = stryMutAct_9fa48("128836") ? this.replicaIds.map(id => this.externalToInternal.get(id)) : (stryCov_9fa48("128836"), this.replicaIds.map(stryMutAct_9fa48("128837") ? () => undefined : (stryCov_9fa48("128837"), id => this.externalToInternal.get(id))).filter(Boolean));
      this.transport = stryMutAct_9fa48("128840") ? options.transport && new InMemoryTransport() : stryMutAct_9fa48("128839") ? false : stryMutAct_9fa48("128838") ? true : (stryCov_9fa48("128838", "128839", "128840"), options.transport || new InMemoryTransport());
      this.logger = stryMutAct_9fa48("128843") ? options.logger && console : stryMutAct_9fa48("128842") ? false : stryMutAct_9fa48("128841") ? true : (stryCov_9fa48("128841", "128842", "128843"), options.logger || console);
      this.applyCommit = (stryMutAct_9fa48("128846") ? typeof options.applyCommit !== 'function' : stryMutAct_9fa48("128845") ? false : stryMutAct_9fa48("128844") ? true : (stryCov_9fa48("128844", "128845", "128846"), typeof options.applyCommit === (stryMutAct_9fa48("128847") ? "" : (stryCov_9fa48("128847"), 'function')))) ? options.applyCommit : null;
      this.electionTick = Number.isInteger(options.electionTick) ? options.electionTick : RAFT_LOGIC_SPIKE_DEFAULT.ELECTION_TICK;
      this.heartbeatTick = Number.isInteger(options.heartbeatTick) ? options.heartbeatTick : RAFT_LOGIC_SPIKE_DEFAULT.HEARTBEAT_TICK;
      this.tickIntervalMs = Number.isInteger(options.tickIntervalMs) ? options.tickIntervalMs : RAFT_LOGIC_SPIKE_DEFAULT.TICK_INTERVAL_MS;
      this.clientRequestTimeoutMs = Number.isInteger(options.clientRequestTimeoutMs) ? options.clientRequestTimeoutMs : RAFT_LOGIC_SPIKE_DEFAULT.CLIENT_REQUEST_TIMEOUT_MS;
      this.sqliteFile = stryMutAct_9fa48("128850") ? options.sqliteFile && null : stryMutAct_9fa48("128849") ? false : stryMutAct_9fa48("128848") ? true : (stryCov_9fa48("128848", "128849", "128850"), options.sqliteFile || null);
      this._started = stryMutAct_9fa48("128851") ? true : (stryCov_9fa48("128851"), false);
      this._node = null;
      this._role = RAFT_LOGIC_SPIKE_ROLE.FOLLOWER;
      this._leaderReplicaId = null;
      this._term = 0;
    }
  }

  /**
   * Start raft node.
   * @return {Promise<void>}
   */
  async start() {
    if (stryMutAct_9fa48("128852")) {
      {}
    } else {
      stryCov_9fa48("128852");
      if (stryMutAct_9fa48("128854") ? false : stryMutAct_9fa48("128853") ? true : (stryCov_9fa48("128853", "128854"), this._started)) {
        if (stryMutAct_9fa48("128855")) {
          {}
        } else {
          stryCov_9fa48("128855");
          return;
        }
      }
      this.logger.info(RAFT_LOGIC_SPIKE_LOG_MSG.STARTING, stryMutAct_9fa48("128856") ? {} : (stryCov_9fa48("128856"), {
        replicaId: this.replicaId,
        peerCount: this.replicaIds.length
      }));
      const {
        workerStorage
      } = buildWorkerStorage(stryMutAct_9fa48("128857") ? {} : (stryCov_9fa48("128857"), {
        sqliteFile: this.sqliteFile
      }));
      this._node = new ThreadedRaftNode(stryMutAct_9fa48("128858") ? {} : (stryCov_9fa48("128858"), {
        id: this.internalReplicaId,
        peers: this.internalReplicaIds,
        electionTick: this.electionTick,
        heartbeatTick: this.heartbeatTick,
        transport: this.transport,
        workerStorage,
        apply: async entry => {
          if (stryMutAct_9fa48("128859")) {
            {}
          } else {
            stryCov_9fa48("128859");
            await this._handleCommit(entry);
          }
        },
        tickIntervalMs: this.tickIntervalMs,
        preVote: stryMutAct_9fa48("128860") ? false : (stryCov_9fa48("128860"), true)
      }));
      this._wireNodeSignals();
      await this._node.start();
      this._started = stryMutAct_9fa48("128861") ? false : (stryCov_9fa48("128861"), true);
      await this.refreshStatus();
      this.logger.info(RAFT_LOGIC_SPIKE_LOG_MSG.STARTED, stryMutAct_9fa48("128862") ? {} : (stryCov_9fa48("128862"), {
        replicaId: this.replicaId,
        internalId: this.internalReplicaId
      }));
    }
  }

  /**
   * Stop raft node.
   * @param {Object} [options]
   * @param {boolean} [options.drain]
   * @return {Promise<void>}
   */
  async stop(options = {}) {
    if (stryMutAct_9fa48("128863")) {
      {}
    } else {
      stryCov_9fa48("128863");
      if (stryMutAct_9fa48("128866") ? false : stryMutAct_9fa48("128865") ? true : stryMutAct_9fa48("128864") ? this._started : (stryCov_9fa48("128864", "128865", "128866"), !this._started)) {
        if (stryMutAct_9fa48("128867")) {
          {}
        } else {
          stryCov_9fa48("128867");
          return;
        }
      }
      this.logger.info(RAFT_LOGIC_SPIKE_LOG_MSG.STOPPING, stryMutAct_9fa48("128868") ? {} : (stryCov_9fa48("128868"), {
        replicaId: this.replicaId
      }));
      try {
        if (stryMutAct_9fa48("128869")) {
          {}
        } else {
          stryCov_9fa48("128869");
          if (stryMutAct_9fa48("128871") ? false : stryMutAct_9fa48("128870") ? true : (stryCov_9fa48("128870", "128871"), this._node)) {
            if (stryMutAct_9fa48("128872")) {
              {}
            } else {
              stryCov_9fa48("128872");
              const shouldDrain = stryMutAct_9fa48("128875") ? options.drain === false : stryMutAct_9fa48("128874") ? false : stryMutAct_9fa48("128873") ? true : (stryCov_9fa48("128873", "128874", "128875"), options.drain !== (stryMutAct_9fa48("128876") ? true : (stryCov_9fa48("128876"), false)));
              await this._node.stop(stryMutAct_9fa48("128877") ? {} : (stryCov_9fa48("128877"), {
                drainApply: shouldDrain,
                drainTicks: shouldDrain
              }));
            }
          }
        }
      } finally {
        if (stryMutAct_9fa48("128878")) {
          {}
        } else {
          stryCov_9fa48("128878");
          this._node = null;
          this._started = stryMutAct_9fa48("128879") ? true : (stryCov_9fa48("128879"), false);
          this._role = RAFT_LOGIC_SPIKE_ROLE.FOLLOWER;
          this._leaderReplicaId = null;
          this._term = 0;
        }
      }
      this.logger.info(RAFT_LOGIC_SPIKE_LOG_MSG.STOPPED, stryMutAct_9fa48("128880") ? {} : (stryCov_9fa48("128880"), {
        replicaId: this.replicaId
      }));
    }
  }

  /**
   * Wait for stable leader.
   * @param {number} [timeoutMs]
   * @return {Promise<string|null>}
   */
  async waitForLeader(timeoutMs = RAFT_LOGIC_SPIKE_DEFAULT.WAIT_FOR_LEADER_TIMEOUT_MS) {
    if (stryMutAct_9fa48("128881")) {
      {}
    } else {
      stryCov_9fa48("128881");
      this._assertStarted();
      const leaderInternalId = await this._node.waitForLeader(timeoutMs);
      this._setLeaderFromInternalId(leaderInternalId);
      return this._leaderReplicaId;
    }
  }

  /**
   * Propose a command.
   * @param {*} command
   * @param {{autoForward?: boolean, timeoutMs?: number}} [options]
   * @return {Promise<{index: number, term: number}>}
   */
  async propose(command, options = {}) {
    if (stryMutAct_9fa48("128882")) {
      {}
    } else {
      stryCov_9fa48("128882");
      this._assertStarted();
      const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : this.clientRequestTimeoutMs;
      const result = await this._node.clientRequest(serializeCommand(command), stryMutAct_9fa48("128883") ? {} : (stryCov_9fa48("128883"), {
        autoForward: stryMutAct_9fa48("128886") ? options.autoForward !== true : stryMutAct_9fa48("128885") ? false : stryMutAct_9fa48("128884") ? true : (stryCov_9fa48("128884", "128885", "128886"), options.autoForward === (stryMutAct_9fa48("128887") ? false : (stryCov_9fa48("128887"), true))),
        waitFor: stryMutAct_9fa48("128888") ? "" : (stryCov_9fa48("128888"), 'commit'),
        timeout: timeoutMs
      }));
      await this.refreshStatus();
      return result;
    }
  }

  /**
   * LifeRaft-compatible command callback style.
   * @param {*} command
   * @param {Function} callback
   */
  command(command, callback) {
    if (stryMutAct_9fa48("128889")) {
      {}
    } else {
      stryCov_9fa48("128889");
      this.propose(command, stryMutAct_9fa48("128890") ? {} : (stryCov_9fa48("128890"), {
        autoForward: stryMutAct_9fa48("128891") ? true : (stryCov_9fa48("128891"), false)
      })).then(() => {
        if (stryMutAct_9fa48("128892")) {
          {}
        } else {
          stryCov_9fa48("128892");
          if (stryMutAct_9fa48("128894") ? false : stryMutAct_9fa48("128893") ? true : (stryCov_9fa48("128893", "128894"), callback)) {
            if (stryMutAct_9fa48("128895")) {
              {}
            } else {
              stryCov_9fa48("128895");
              callback(null);
            }
          }
        }
      }).catch(error => {
        if (stryMutAct_9fa48("128896")) {
          {}
        } else {
          stryCov_9fa48("128896");
          this.logger.warn(RAFT_LOGIC_SPIKE_LOG_MSG.COMMAND_REJECTED, stryMutAct_9fa48("128897") ? {} : (stryCov_9fa48("128897"), {
            replicaId: this.replicaId,
            error: error.message
          }));
          if (stryMutAct_9fa48("128899") ? false : stryMutAct_9fa48("128898") ? true : (stryCov_9fa48("128898", "128899"), callback)) {
            if (stryMutAct_9fa48("128900")) {
              {}
            } else {
              stryCov_9fa48("128900");
              callback(error);
            }
          }
        }
      });
    }
  }

  /**
   * Refresh local status snapshot.
   * @return {Promise<Object|null>}
   */
  async refreshStatus() {
    if (stryMutAct_9fa48("128901")) {
      {}
    } else {
      stryCov_9fa48("128901");
      this._assertStarted();
      const status = await this._node.status();
      this._handleStateUpdate(status);
      return this.getStatusSnapshot();
    }
  }

  /**
   * Return raw raft-logic status payload.
   * @return {Promise<Object|null>}
   */
  async getRawStatus() {
    if (stryMutAct_9fa48("128902")) {
      {}
    } else {
      stryCov_9fa48("128902");
      this._assertStarted();
      return this._node.status();
    }
  }

  /**
   * Return status snapshot using cached state.
   * @return {{replicaId: string, role: string, leaderId: string|null, term: number}}
   */
  getStatusSnapshot() {
    if (stryMutAct_9fa48("128903")) {
      {}
    } else {
      stryCov_9fa48("128903");
      return stryMutAct_9fa48("128904") ? {} : (stryCov_9fa48("128904"), {
        replicaId: this.replicaId,
        role: this._role,
        leaderId: this._leaderReplicaId,
        term: this._term
      });
    }
  }

  /**
   * @return {boolean}
   */
  isLeaderReplica() {
    if (stryMutAct_9fa48("128905")) {
      {}
    } else {
      stryCov_9fa48("128905");
      return stryMutAct_9fa48("128908") ? this._role !== RAFT_LOGIC_SPIKE_ROLE.LEADER : stryMutAct_9fa48("128907") ? false : stryMutAct_9fa48("128906") ? true : (stryCov_9fa48("128906", "128907", "128908"), this._role === RAFT_LOGIC_SPIKE_ROLE.LEADER);
    }
  }

  /**
   * @return {string}
   */
  getRole() {
    if (stryMutAct_9fa48("128909")) {
      {}
    } else {
      stryCov_9fa48("128909");
      return this._role;
    }
  }

  /**
   * @return {string|null}
   */
  getLeaderId() {
    if (stryMutAct_9fa48("128910")) {
      {}
    } else {
      stryCov_9fa48("128910");
      return this._leaderReplicaId;
    }
  }

  /**
   * @return {number}
   */
  getCurrentTerm() {
    if (stryMutAct_9fa48("128911")) {
      {}
    } else {
      stryCov_9fa48("128911");
      return this._term;
    }
  }

  /**
   * @return {ThreadedRaftNode|null}
   */
  getNode() {
    if (stryMutAct_9fa48("128912")) {
      {}
    } else {
      stryCov_9fa48("128912");
      return this._node;
    }
  }

  /**
   * Wire role/state callbacks from raft-logic node.
   * @private
   */
  _wireNodeSignals() {
    if (stryMutAct_9fa48("128913")) {
      {}
    } else {
      stryCov_9fa48("128913");
      this._node.onRoleChange((previousRole, nextRole) => {
        if (stryMutAct_9fa48("128914")) {
          {}
        } else {
          stryCov_9fa48("128914");
          this._handleRoleChange(previousRole, nextRole);
        }
      });
      this._node.onStateChange(snapshot => {
        if (stryMutAct_9fa48("128915")) {
          {}
        } else {
          stryCov_9fa48("128915");
          this._handleStateUpdate(snapshot);
        }
      });
    }
  }

  /**
   * Handle role change callback.
   * @param {string} previousRole
   * @param {string} nextRole
   * @private
   */
  _handleRoleChange(previousRole, nextRole) {
    if (stryMutAct_9fa48("128916")) {
      {}
    } else {
      stryCov_9fa48("128916");
      const normalizedPrevious = normalizeRole(previousRole);
      const normalizedNext = normalizeRole(nextRole);
      if (stryMutAct_9fa48("128919") ? normalizedPrevious === normalizedNext || this._role === normalizedNext : stryMutAct_9fa48("128918") ? false : stryMutAct_9fa48("128917") ? true : (stryCov_9fa48("128917", "128918", "128919"), (stryMutAct_9fa48("128921") ? normalizedPrevious !== normalizedNext : stryMutAct_9fa48("128920") ? true : (stryCov_9fa48("128920", "128921"), normalizedPrevious === normalizedNext)) && (stryMutAct_9fa48("128923") ? this._role !== normalizedNext : stryMutAct_9fa48("128922") ? true : (stryCov_9fa48("128922", "128923"), this._role === normalizedNext)))) {
        if (stryMutAct_9fa48("128924")) {
          {}
        } else {
          stryCov_9fa48("128924");
          return;
        }
      }
      this._role = normalizedNext;
      if (stryMutAct_9fa48("128927") ? normalizedNext !== RAFT_LOGIC_SPIKE_ROLE.LEADER : stryMutAct_9fa48("128926") ? false : stryMutAct_9fa48("128925") ? true : (stryCov_9fa48("128925", "128926", "128927"), normalizedNext === RAFT_LOGIC_SPIKE_ROLE.LEADER)) {
        if (stryMutAct_9fa48("128928")) {
          {}
        } else {
          stryCov_9fa48("128928");
          this._setLeaderFromInternalId(this.internalReplicaId);
        }
      }
      this.logger.info(RAFT_LOGIC_SPIKE_LOG_MSG.ROLE_CHANGED, stryMutAct_9fa48("128929") ? {} : (stryCov_9fa48("128929"), {
        replicaId: this.replicaId,
        previousRole: normalizedPrevious,
        nextRole: normalizedNext
      }));
      const eventName = ROLE_EVENT_MAP[normalizedNext];
      if (stryMutAct_9fa48("128931") ? false : stryMutAct_9fa48("128930") ? true : (stryCov_9fa48("128930", "128931"), eventName)) {
        if (stryMutAct_9fa48("128932")) {
          {}
        } else {
          stryCov_9fa48("128932");
          this.emit(eventName);
        }
      }
    }
  }

  /**
   * Handle status snapshot update.
   * @param {Object|null} snapshot
   * @private
   */
  _handleStateUpdate(snapshot) {
    if (stryMutAct_9fa48("128933")) {
      {}
    } else {
      stryCov_9fa48("128933");
      if (stryMutAct_9fa48("128936") ? !snapshot && typeof snapshot !== 'object' : stryMutAct_9fa48("128935") ? false : stryMutAct_9fa48("128934") ? true : (stryCov_9fa48("128934", "128935", "128936"), (stryMutAct_9fa48("128937") ? snapshot : (stryCov_9fa48("128937"), !snapshot)) || (stryMutAct_9fa48("128939") ? typeof snapshot === 'object' : stryMutAct_9fa48("128938") ? false : (stryCov_9fa48("128938", "128939"), typeof snapshot !== (stryMutAct_9fa48("128940") ? "" : (stryCov_9fa48("128940"), 'object')))))) {
        if (stryMutAct_9fa48("128941")) {
          {}
        } else {
          stryCov_9fa48("128941");
          return;
        }
      }
      const nextTerm = Number(snapshot.term);
      if (stryMutAct_9fa48("128944") ? Number.isFinite(nextTerm) && nextTerm >= 0 || nextTerm !== this._term : stryMutAct_9fa48("128943") ? false : stryMutAct_9fa48("128942") ? true : (stryCov_9fa48("128942", "128943", "128944"), (stryMutAct_9fa48("128946") ? Number.isFinite(nextTerm) || nextTerm >= 0 : stryMutAct_9fa48("128945") ? true : (stryCov_9fa48("128945", "128946"), Number.isFinite(nextTerm) && (stryMutAct_9fa48("128949") ? nextTerm < 0 : stryMutAct_9fa48("128948") ? nextTerm > 0 : stryMutAct_9fa48("128947") ? true : (stryCov_9fa48("128947", "128948", "128949"), nextTerm >= 0)))) && (stryMutAct_9fa48("128951") ? nextTerm === this._term : stryMutAct_9fa48("128950") ? true : (stryCov_9fa48("128950", "128951"), nextTerm !== this._term)))) {
        if (stryMutAct_9fa48("128952")) {
          {}
        } else {
          stryCov_9fa48("128952");
          this._term = nextTerm;
          this.emit(RAFT_LOGIC_SPIKE_EVENT.TERM_CHANGE, this._term);
        }
      }
      if (stryMutAct_9fa48("128954") ? false : stryMutAct_9fa48("128953") ? true : (stryCov_9fa48("128953", "128954"), snapshot.role)) {
        if (stryMutAct_9fa48("128955")) {
          {}
        } else {
          stryCov_9fa48("128955");
          this._handleRoleChange(this._role, snapshot.role);
        }
      }
      if (stryMutAct_9fa48("128958") ? snapshot.lead !== undefined && snapshot.lead !== null || snapshot.lead !== '' : stryMutAct_9fa48("128957") ? false : stryMutAct_9fa48("128956") ? true : (stryCov_9fa48("128956", "128957", "128958"), (stryMutAct_9fa48("128960") ? snapshot.lead !== undefined || snapshot.lead !== null : stryMutAct_9fa48("128959") ? true : (stryCov_9fa48("128959", "128960"), (stryMutAct_9fa48("128962") ? snapshot.lead === undefined : stryMutAct_9fa48("128961") ? true : (stryCov_9fa48("128961", "128962"), snapshot.lead !== undefined)) && (stryMutAct_9fa48("128964") ? snapshot.lead === null : stryMutAct_9fa48("128963") ? true : (stryCov_9fa48("128963", "128964"), snapshot.lead !== null)))) && (stryMutAct_9fa48("128966") ? snapshot.lead === '' : stryMutAct_9fa48("128965") ? true : (stryCov_9fa48("128965", "128966"), snapshot.lead !== (stryMutAct_9fa48("128967") ? "Stryker was here!" : (stryCov_9fa48("128967"), '')))))) {
        if (stryMutAct_9fa48("128968")) {
          {}
        } else {
          stryCov_9fa48("128968");
          this._setLeaderFromInternalId(snapshot.lead);
        }
      }
    }
  }

  /**
   * Handle committed entry callback.
   * @param {Object} entry
   * @return {Promise<void>}
   * @private
   */
  async _handleCommit(entry) {
    if (stryMutAct_9fa48("128969")) {
      {}
    } else {
      stryCov_9fa48("128969");
      const commitRecord = stryMutAct_9fa48("128970") ? {} : (stryCov_9fa48("128970"), {
        replicaId: this.replicaId,
        term: this._term,
        command: decodeCommittedCommand(stryMutAct_9fa48("128971") ? entry.data : (stryCov_9fa48("128971"), entry?.data)),
        rawEntry: entry
      });
      if (stryMutAct_9fa48("128973") ? false : stryMutAct_9fa48("128972") ? true : (stryCov_9fa48("128972", "128973"), this.applyCommit)) {
        if (stryMutAct_9fa48("128974")) {
          {}
        } else {
          stryCov_9fa48("128974");
          await this.applyCommit(commitRecord);
        }
      }
      this.emit(RAFT_LOGIC_SPIKE_EVENT.COMMIT, commitRecord);
    }
  }

  /**
   * Update leader cache from internal ID.
   * @param {string|number|null} internalId
   * @private
   */
  _setLeaderFromInternalId(internalId) {
    if (stryMutAct_9fa48("128975")) {
      {}
    } else {
      stryCov_9fa48("128975");
      if (stryMutAct_9fa48("128978") ? (internalId === null || internalId === undefined) && internalId === '' : stryMutAct_9fa48("128977") ? false : stryMutAct_9fa48("128976") ? true : (stryCov_9fa48("128976", "128977", "128978"), (stryMutAct_9fa48("128980") ? internalId === null && internalId === undefined : stryMutAct_9fa48("128979") ? false : (stryCov_9fa48("128979", "128980"), (stryMutAct_9fa48("128982") ? internalId !== null : stryMutAct_9fa48("128981") ? false : (stryCov_9fa48("128981", "128982"), internalId === null)) || (stryMutAct_9fa48("128984") ? internalId !== undefined : stryMutAct_9fa48("128983") ? false : (stryCov_9fa48("128983", "128984"), internalId === undefined)))) || (stryMutAct_9fa48("128986") ? internalId !== '' : stryMutAct_9fa48("128985") ? false : (stryCov_9fa48("128985", "128986"), internalId === (stryMutAct_9fa48("128987") ? "Stryker was here!" : (stryCov_9fa48("128987"), '')))))) {
        if (stryMutAct_9fa48("128988")) {
          {}
        } else {
          stryCov_9fa48("128988");
          return;
        }
      }
      const normalizedInternal = String(internalId);
      const external = stryMutAct_9fa48("128991") ? this.internalToExternal.get(normalizedInternal) && null : stryMutAct_9fa48("128990") ? false : stryMutAct_9fa48("128989") ? true : (stryCov_9fa48("128989", "128990", "128991"), this.internalToExternal.get(normalizedInternal) || null);
      if (stryMutAct_9fa48("128994") ? !external && external === this._leaderReplicaId : stryMutAct_9fa48("128993") ? false : stryMutAct_9fa48("128992") ? true : (stryCov_9fa48("128992", "128993", "128994"), (stryMutAct_9fa48("128995") ? external : (stryCov_9fa48("128995"), !external)) || (stryMutAct_9fa48("128997") ? external !== this._leaderReplicaId : stryMutAct_9fa48("128996") ? false : (stryCov_9fa48("128996", "128997"), external === this._leaderReplicaId)))) {
        if (stryMutAct_9fa48("128998")) {
          {}
        } else {
          stryCov_9fa48("128998");
          return;
        }
      }
      this._leaderReplicaId = external;
      this.logger.debug(RAFT_LOGIC_SPIKE_LOG_MSG.LEADER_CHANGED, stryMutAct_9fa48("128999") ? {} : (stryCov_9fa48("128999"), {
        replicaId: this.replicaId,
        leaderId: external,
        internalLeaderId: normalizedInternal
      }));
      this.emit(RAFT_LOGIC_SPIKE_EVENT.LEADER_CHANGE, external);
    }
  }

  /**
   * Assert adapter started.
   * @private
   */
  _assertStarted() {
    if (stryMutAct_9fa48("129000")) {
      {}
    } else {
      stryCov_9fa48("129000");
      if (stryMutAct_9fa48("129003") ? !this._started && !this._node : stryMutAct_9fa48("129002") ? false : stryMutAct_9fa48("129001") ? true : (stryCov_9fa48("129001", "129002", "129003"), (stryMutAct_9fa48("129004") ? this._started : (stryCov_9fa48("129004"), !this._started)) || (stryMutAct_9fa48("129005") ? this._node : (stryCov_9fa48("129005"), !this._node)))) {
        if (stryMutAct_9fa48("129006")) {
          {}
        } else {
          stryCov_9fa48("129006");
          throw new Error(RAFT_LOGIC_SPIKE_ERROR.ADAPTER_NOT_STARTED);
        }
      }
    }
  }
}
export { RaftLogicSpikeAdapter };