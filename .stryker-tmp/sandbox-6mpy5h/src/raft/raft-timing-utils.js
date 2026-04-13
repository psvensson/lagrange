/**
 * Shared helpers for computing and applying Raft timing settings.
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
import LifeRaft from './liferaft.js';
import { NUM, STRING, TYPEOF } from '../constants/index.js';
const RAFT_TIMING_DEFAULT = Object.freeze(stryMutAct_9fa48("128487") ? {} : (stryCov_9fa48("128487"), {
  HASH_MODULO: NUM.TEN
}));

/**
 * Compute election timeout values with replica-index jitter applied.
 * @param {Object} options
 * @param {string} options.replicaId
 * @param {Array<string>} options.replicaIds
 * @param {number} options.baseElectionMinMs
 * @param {number} options.baseElectionMaxMs
 * @param {number} options.electionJitterPerReplicaMs
 * @return {{electionMinMs: number, electionMaxMs: number, jitterMs: number}}
 */
function computeReplicaElectionTimeouts(options = {}) {
  if (stryMutAct_9fa48("128488")) {
    {}
  } else {
    stryCov_9fa48("128488");
    const replicaId = stryMutAct_9fa48("128491") ? options.replicaId && STRING.EMPTY : stryMutAct_9fa48("128490") ? false : stryMutAct_9fa48("128489") ? true : (stryCov_9fa48("128489", "128490", "128491"), options.replicaId || STRING.EMPTY);
    const replicaIds = Array.isArray(options.replicaIds) ? options.replicaIds : stryMutAct_9fa48("128492") ? ["Stryker was here"] : (stryCov_9fa48("128492"), []);
    const baseElectionMinMs = Number.isFinite(options.baseElectionMinMs) ? options.baseElectionMinMs : NUM.ZERO;
    const baseElectionMaxMs = Number.isFinite(options.baseElectionMaxMs) ? options.baseElectionMaxMs : NUM.ZERO;
    const electionJitterPerReplicaMs = Number.isFinite(options.electionJitterPerReplicaMs) ? options.electionJitterPerReplicaMs : NUM.ZERO;
    let replicaIndex = replicaIds.indexOf(replicaId);
    if (stryMutAct_9fa48("128496") ? replicaIndex >= NUM.ZERO : stryMutAct_9fa48("128495") ? replicaIndex <= NUM.ZERO : stryMutAct_9fa48("128494") ? false : stryMutAct_9fa48("128493") ? true : (stryCov_9fa48("128493", "128494", "128495", "128496"), replicaIndex < NUM.ZERO)) {
      if (stryMutAct_9fa48("128497")) {
        {}
      } else {
        stryCov_9fa48("128497");
        const hashCode = replicaId.split(STRING.EMPTY).reduce(stryMutAct_9fa48("128498") ? () => undefined : (stryCov_9fa48("128498"), (acc, char) => stryMutAct_9fa48("128499") ? acc - char.charCodeAt(NUM.ZERO) : (stryCov_9fa48("128499"), acc + char.charCodeAt(NUM.ZERO))), NUM.ZERO);
        replicaIndex = stryMutAct_9fa48("128500") ? replicaIds.length - hashCode % RAFT_TIMING_DEFAULT.HASH_MODULO : (stryCov_9fa48("128500"), replicaIds.length + (stryMutAct_9fa48("128501") ? hashCode * RAFT_TIMING_DEFAULT.HASH_MODULO : (stryCov_9fa48("128501"), hashCode % RAFT_TIMING_DEFAULT.HASH_MODULO)));
      }
    }
    const jitterMs = stryMutAct_9fa48("128502") ? replicaIndex / electionJitterPerReplicaMs : (stryCov_9fa48("128502"), replicaIndex * electionJitterPerReplicaMs);
    return stryMutAct_9fa48("128503") ? {} : (stryCov_9fa48("128503"), {
      electionMinMs: stryMutAct_9fa48("128504") ? baseElectionMinMs - jitterMs : (stryCov_9fa48("128504"), baseElectionMinMs + jitterMs),
      electionMaxMs: stryMutAct_9fa48("128505") ? baseElectionMaxMs - jitterMs : (stryCov_9fa48("128505"), baseElectionMaxMs + jitterMs),
      jitterMs
    });
  }
}

/**
 * Apply Raft timing values to a live liferaft instance.
 * @param {Object} options
 * @param {Object|null} options.raft
 * @param {number} options.heartbeatMs
 * @param {number} options.electionMinMs
 * @param {number} options.electionMaxMs
 * @param {boolean} [options.rearmTimer]
 * @return {boolean} True when applied to a raft instance.
 */
function applyRuntimeRaftTiming(options = {}) {
  if (stryMutAct_9fa48("128506")) {
    {}
  } else {
    stryCov_9fa48("128506");
    const raft = stryMutAct_9fa48("128509") ? options.raft && null : stryMutAct_9fa48("128508") ? false : stryMutAct_9fa48("128507") ? true : (stryCov_9fa48("128507", "128508", "128509"), options.raft || null);
    const heartbeatMs = options.heartbeatMs;
    const electionMinMs = options.electionMinMs;
    const electionMaxMs = options.electionMaxMs;
    if (stryMutAct_9fa48("128512") ? (!raft || !Number.isFinite(heartbeatMs) || !Number.isFinite(electionMinMs) || !Number.isFinite(electionMaxMs)) && electionMinMs > electionMaxMs : stryMutAct_9fa48("128511") ? false : stryMutAct_9fa48("128510") ? true : (stryCov_9fa48("128510", "128511", "128512"), (stryMutAct_9fa48("128514") ? (!raft || !Number.isFinite(heartbeatMs) || !Number.isFinite(electionMinMs)) && !Number.isFinite(electionMaxMs) : stryMutAct_9fa48("128513") ? false : (stryCov_9fa48("128513", "128514"), (stryMutAct_9fa48("128516") ? (!raft || !Number.isFinite(heartbeatMs)) && !Number.isFinite(electionMinMs) : stryMutAct_9fa48("128515") ? false : (stryCov_9fa48("128515", "128516"), (stryMutAct_9fa48("128518") ? !raft && !Number.isFinite(heartbeatMs) : stryMutAct_9fa48("128517") ? false : (stryCov_9fa48("128517", "128518"), (stryMutAct_9fa48("128519") ? raft : (stryCov_9fa48("128519"), !raft)) || (stryMutAct_9fa48("128520") ? Number.isFinite(heartbeatMs) : (stryCov_9fa48("128520"), !Number.isFinite(heartbeatMs))))) || (stryMutAct_9fa48("128521") ? Number.isFinite(electionMinMs) : (stryCov_9fa48("128521"), !Number.isFinite(electionMinMs))))) || (stryMutAct_9fa48("128522") ? Number.isFinite(electionMaxMs) : (stryCov_9fa48("128522"), !Number.isFinite(electionMaxMs))))) || (stryMutAct_9fa48("128525") ? electionMinMs <= electionMaxMs : stryMutAct_9fa48("128524") ? electionMinMs >= electionMaxMs : stryMutAct_9fa48("128523") ? false : (stryCov_9fa48("128523", "128524", "128525"), electionMinMs > electionMaxMs)))) {
      if (stryMutAct_9fa48("128526")) {
        {}
      } else {
        stryCov_9fa48("128526");
        return stryMutAct_9fa48("128527") ? true : (stryCov_9fa48("128527"), false);
      }
    }
    raft.beat = heartbeatMs;
    if (stryMutAct_9fa48("128530") ? !raft.election && typeof raft.election !== TYPEOF.OBJECT : stryMutAct_9fa48("128529") ? false : stryMutAct_9fa48("128528") ? true : (stryCov_9fa48("128528", "128529", "128530"), (stryMutAct_9fa48("128531") ? raft.election : (stryCov_9fa48("128531"), !raft.election)) || (stryMutAct_9fa48("128533") ? typeof raft.election === TYPEOF.OBJECT : stryMutAct_9fa48("128532") ? false : (stryCov_9fa48("128532", "128533"), typeof raft.election !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("128534")) {
        {}
      } else {
        stryCov_9fa48("128534");
        raft.election = {};
      }
    }
    raft.election.min = electionMinMs;
    raft.election.max = electionMaxMs;
    if (stryMutAct_9fa48("128537") ? options.rearmTimer && typeof raft.heartbeat === TYPEOF.FUNCTION || typeof raft.timeout === TYPEOF.FUNCTION : stryMutAct_9fa48("128536") ? false : stryMutAct_9fa48("128535") ? true : (stryCov_9fa48("128535", "128536", "128537"), (stryMutAct_9fa48("128539") ? options.rearmTimer || typeof raft.heartbeat === TYPEOF.FUNCTION : stryMutAct_9fa48("128538") ? true : (stryCov_9fa48("128538", "128539"), options.rearmTimer && (stryMutAct_9fa48("128541") ? typeof raft.heartbeat !== TYPEOF.FUNCTION : stryMutAct_9fa48("128540") ? true : (stryCov_9fa48("128540", "128541"), typeof raft.heartbeat === TYPEOF.FUNCTION)))) && (stryMutAct_9fa48("128543") ? typeof raft.timeout !== TYPEOF.FUNCTION : stryMutAct_9fa48("128542") ? true : (stryCov_9fa48("128542", "128543"), typeof raft.timeout === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("128544")) {
        {}
      } else {
        stryCov_9fa48("128544");
        const nextDuration = (stryMutAct_9fa48("128547") ? raft.state !== LifeRaft.LEADER : stryMutAct_9fa48("128546") ? false : stryMutAct_9fa48("128545") ? true : (stryCov_9fa48("128545", "128546", "128547"), raft.state === LifeRaft.LEADER)) ? raft.beat : raft.timeout();
        raft.heartbeat(nextDuration);
      }
    }
    return stryMutAct_9fa48("128548") ? false : (stryCov_9fa48("128548"), true);
  }
}
export { applyRuntimeRaftTiming, computeReplicaElectionTimeouts };