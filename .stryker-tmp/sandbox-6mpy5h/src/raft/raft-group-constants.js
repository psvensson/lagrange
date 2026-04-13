/**
 * Constants for RaftGroup - composable Raft lifecycle management.
 * Encapsulates liferaft instance creation, event wiring, peer joining,
 * election management, and shutdown.
 */
// @ts-nocheck


/**
 * Events emitted by RaftGroup to consumers.
 * These are the public API events that callers subscribe to.
 */function stryNS_9fa48() {
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
const RAFT_GROUP_EVENT = Object.freeze(stryMutAct_9fa48("127622") ? {} : (stryCov_9fa48("127622"), {
  LEADER: stryMutAct_9fa48("127623") ? "" : (stryCov_9fa48("127623"), 'leader'),
  FOLLOWER: stryMutAct_9fa48("127624") ? "" : (stryCov_9fa48("127624"), 'follower'),
  CANDIDATE: stryMutAct_9fa48("127625") ? "" : (stryCov_9fa48("127625"), 'candidate'),
  COMMIT: stryMutAct_9fa48("127626") ? "" : (stryCov_9fa48("127626"), 'commit'),
  LEADER_CHANGE: stryMutAct_9fa48("127627") ? "" : (stryCov_9fa48("127627"), 'leaderChange'),
  TERM_CHANGE: stryMutAct_9fa48("127628") ? "" : (stryCov_9fa48("127628"), 'termChange'),
  SHUTDOWN: stryMutAct_9fa48("127629") ? "" : (stryCov_9fa48("127629"), 'shutdown')
}));

/**
 * Raw liferaft events wired during initialize().
 * These are the event names emitted by the liferaft instance itself.
 */
const RAFT_GROUP_LIFERAFT_EVENT = Object.freeze(stryMutAct_9fa48("127630") ? {} : (stryCov_9fa48("127630"), {
  LEADER: stryMutAct_9fa48("127631") ? "" : (stryCov_9fa48("127631"), 'leader'),
  FOLLOWER: stryMutAct_9fa48("127632") ? "" : (stryCov_9fa48("127632"), 'follower'),
  CANDIDATE: stryMutAct_9fa48("127633") ? "" : (stryCov_9fa48("127633"), 'candidate'),
  COMMIT: stryMutAct_9fa48("127634") ? "" : (stryCov_9fa48("127634"), 'commit'),
  LEADER_CHANGE: stryMutAct_9fa48("127635") ? "" : (stryCov_9fa48("127635"), 'leader change'),
  TERM_CHANGE: stryMutAct_9fa48("127636") ? "" : (stryCov_9fa48("127636"), 'term change')
}));

/**
 * Liferaft timer property names used for clearing during shutdown
 * and deferred election management.
 */
const RAFT_GROUP_LIFERAFT_TIMER = Object.freeze(stryMutAct_9fa48("127637") ? {} : (stryCov_9fa48("127637"), {
  HEARTBEAT: stryMutAct_9fa48("127638") ? "" : (stryCov_9fa48("127638"), 'heartbeat'),
  ELECTION_MIN: stryMutAct_9fa48("127639") ? "" : (stryCov_9fa48("127639"), 'election min'),
  ELECTION_MAX: stryMutAct_9fa48("127640") ? "" : (stryCov_9fa48("127640"), 'election max'),
  LOG: stryMutAct_9fa48("127641") ? "" : (stryCov_9fa48("127641"), 'Log')
}));

/**
 * Raft group roles. A replica is always in exactly one of these roles.
 */
const RAFT_GROUP_ROLE = Object.freeze(stryMutAct_9fa48("127642") ? {} : (stryCov_9fa48("127642"), {
  FOLLOWER: stryMutAct_9fa48("127643") ? "" : (stryCov_9fa48("127643"), 'follower'),
  CANDIDATE: stryMutAct_9fa48("127644") ? "" : (stryCov_9fa48("127644"), 'candidate'),
  LEADER: stryMutAct_9fa48("127645") ? "" : (stryCov_9fa48("127645"), 'leader'),
  LEARNER: stryMutAct_9fa48("127646") ? "" : (stryCov_9fa48("127646"), 'learner')
}));

/**
 * Default configuration values for RaftGroup timing.
 * These can be overridden via constructor options.
 */
const RAFT_GROUP_DEFAULT = Object.freeze(stryMutAct_9fa48("127647") ? {} : (stryCov_9fa48("127647"), {
  HEARTBEAT_MS: 150,
  ELECTION_MIN_MS: 1000,
  ELECTION_MAX_MS: 3000,
  ELECTION_JITTER_PER_REPLICA_MS: 500,
  LEADER_ACTIVATION_STABILIZATION_MS: 250,
  LEADER_ACTIVATION_NODE_SPACING_MS: 25
}));

/**
 * Address format constants used for peer address validation.
 */
const RAFT_GROUP_ADDRESS = Object.freeze(stryMutAct_9fa48("127648") ? {} : (stryCov_9fa48("127648"), {
  SEPARATOR: stryMutAct_9fa48("127649") ? "" : (stryCov_9fa48("127649"), '/')
}));

/**
 * Log messages emitted by RaftGroup during lifecycle operations.
 */
const RAFT_GROUP_LOG_MSG = Object.freeze(stryMutAct_9fa48("127650") ? {} : (stryCov_9fa48("127650"), {
  INITIALIZING: stryMutAct_9fa48("127651") ? "" : (stryCov_9fa48("127651"), 'Initializing RaftGroup'),
  INITIALIZED: stryMutAct_9fa48("127652") ? "" : (stryCov_9fa48("127652"), 'RaftGroup initialized'),
  DEFERRING_ELECTION_START: stryMutAct_9fa48("127653") ? "" : (stryCov_9fa48("127653"), 'Deferring election start'),
  BECAME_LEADER: stryMutAct_9fa48("127654") ? "" : (stryCov_9fa48("127654"), 'Became leader (liferaft)'),
  LEADER_CHANGED: stryMutAct_9fa48("127655") ? "" : (stryCov_9fa48("127655"), 'Leader changed'),
  JOINING_PEER_ADDRESS: stryMutAct_9fa48("127656") ? "" : (stryCov_9fa48("127656"), 'Joining peer with fully qualified address'),
  SINGLE_REPLICA_LEADER: stryMutAct_9fa48("127657") ? "" : (stryCov_9fa48("127657"), 'Single replica - becoming leader immediately'),
  STARTING_ELECTION_TIMER: stryMutAct_9fa48("127658") ? "" : (stryCov_9fa48("127658"), 'Starting Raft election timer'),
  RECEIVED_RAFT_PACKET: stryMutAct_9fa48("127659") ? "" : (stryCov_9fa48("127659"), 'Received Raft packet'),
  INVALID_SENDER_ADDRESS: stryMutAct_9fa48("127660") ? "" : (stryCov_9fa48("127660"), 'Received Raft packet with invalid sender address'),
  SKIPPING_RAFT_RESPONSE: stryMutAct_9fa48("127661") ? "" : (stryCov_9fa48("127661"), 'Skipping Raft response due to invalid sender address'),
  SENDING_RAFT_RESPONSE: stryMutAct_9fa48("127662") ? "" : (stryCov_9fa48("127662"), 'Sending Raft response'),
  FAILED_RAFT_RESPONSE: stryMutAct_9fa48("127663") ? "" : (stryCov_9fa48("127663"), 'Failed to send Raft response'),
  SHUTDOWN_START: stryMutAct_9fa48("127664") ? "" : (stryCov_9fa48("127664"), 'Shutting down RaftGroup'),
  SHUTDOWN_COMPLETE: stryMutAct_9fa48("127665") ? "" : (stryCov_9fa48("127665"), 'RaftGroup shutdown complete'),
  CLEARED_LIFERAFT_TIMERS: stryMutAct_9fa48("127666") ? "" : (stryCov_9fa48("127666"), 'Cleared liferaft timers for deferred election'),
  ELECTION_ALREADY_STARTED: stryMutAct_9fa48("127667") ? "" : (stryCov_9fa48("127667"), 'Election already started, skipping')
}));

/**
 * Error messages for RaftGroup validation and runtime errors.
 * Static messages are strings; dynamic messages are functions.
 */
const RAFT_GROUP_ERROR_MSG = Object.freeze(stryMutAct_9fa48("127668") ? {} : (stryCov_9fa48("127668"), {
  MISSING_REPLICA_ID: stryMutAct_9fa48("127669") ? "" : (stryCov_9fa48("127669"), 'RaftGroup requires replicaId'),
  MISSING_ENTITY_TYPE: stryMutAct_9fa48("127670") ? "" : (stryCov_9fa48("127670"), 'RaftGroup requires entityType'),
  MISSING_TRANSPORT: stryMutAct_9fa48("127671") ? "" : (stryCov_9fa48("127671"), 'RaftGroup requires transport'),
  MISSING_PEER_ADDRESS_RESOLVER: stryMutAct_9fa48("127672") ? "" : (stryCov_9fa48("127672"), 'RaftGroup requires peerAddressResolver'),
  NOT_INITIALIZED: stryMutAct_9fa48("127673") ? "" : (stryCov_9fa48("127673"), 'RaftGroup not initialized'),
  ALREADY_INITIALIZED: stryMutAct_9fa48("127674") ? "" : (stryCov_9fa48("127674"), 'RaftGroup already initialized'),
  peerJoinFailed: stryMutAct_9fa48("127675") ? () => undefined : (stryCov_9fa48("127675"), peerId => stryMutAct_9fa48("127676") ? `` : (stryCov_9fa48("127676"), `Failed to join peer: ${peerId}`)),
  packetHandleFailed: stryMutAct_9fa48("127677") ? () => undefined : (stryCov_9fa48("127677"), type => stryMutAct_9fa48("127678") ? `` : (stryCov_9fa48("127678"), `Failed to handle Raft packet of type: ${type}`))
}));
export { RAFT_GROUP_ADDRESS, RAFT_GROUP_DEFAULT, RAFT_GROUP_ERROR_MSG, RAFT_GROUP_EVENT, RAFT_GROUP_LIFERAFT_EVENT, RAFT_GROUP_LIFERAFT_TIMER, RAFT_GROUP_LOG_MSG, RAFT_GROUP_ROLE };