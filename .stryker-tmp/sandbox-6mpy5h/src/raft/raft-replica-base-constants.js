/**
 * Constants for RaftReplicaBase - shared Raft replica functionality.
 * Used by both MessageGroupService and PartitionService.
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
import { NUM } from '../constants/numbers.js';
import { STRING } from '../constants/strings.js';
import { TIME_MS } from '../constants/time.js';
const RAFT_REPLICA_BASE_DEFAULT = Object.freeze(stryMutAct_9fa48("128073") ? {} : (stryCov_9fa48("128073"), {
  NODE_ID: STRING.UNKNOWN,
  // Learner phase: new replicas joining existing groups start as non-voting learners
  // They receive log entries but don't vote until caught up
  // This prevents new replicas from disrupting existing leadership
  LEARNER_PROMOTION_DELAY_MS: stryMutAct_9fa48("128074") ? TIME_MS.SECOND / 30 : (stryCov_9fa48("128074"), TIME_MS.SECOND * 30),
  // Min time before promotion (30s for stability)
  LEARNER_CATCH_UP_CHECK_INTERVAL_MS: TIME_MS.SECOND,
  // How often to check catch-up
  // Raft timing: heartbeat should be much smaller than election timeout
  // Election timeout should be 5-10x heartbeat to avoid unnecessary elections
  HEARTBEAT_DEFAULT_MS: 150,
  ELECTION_MIN_DEFAULT_MS: 1000,
  ELECTION_MAX_DEFAULT_MS: 3000,
  // Jitter added per replica index to stagger election timeouts
  // r1 gets base timeout, r2 gets base + 500ms, r3 gets base + 1000ms, etc.
  ELECTION_JITTER_PER_REPLICA_MS: 500
}));
const RAFT_REPLICA_BASE_ROLE = Object.freeze(stryMutAct_9fa48("128075") ? {} : (stryCov_9fa48("128075"), {
  FOLLOWER: stryMutAct_9fa48("128076") ? "" : (stryCov_9fa48("128076"), 'follower'),
  CANDIDATE: stryMutAct_9fa48("128077") ? "" : (stryCov_9fa48("128077"), 'candidate'),
  LEADER: stryMutAct_9fa48("128078") ? "" : (stryCov_9fa48("128078"), 'leader'),
  LEARNER: stryMutAct_9fa48("128079") ? "" : (stryCov_9fa48("128079"), 'learner') // Non-voting member during catch-up phase
}));
const RAFT_REPLICA_BASE_EVENT = Object.freeze(stryMutAct_9fa48("128080") ? {} : (stryCov_9fa48("128080"), {
  DATA: stryMutAct_9fa48("128081") ? "" : (stryCov_9fa48("128081"), 'data'),
  INITIALIZED: stryMutAct_9fa48("128082") ? "" : (stryCov_9fa48("128082"), 'initialized'),
  LEADER_ELECTED: stryMutAct_9fa48("128083") ? "" : (stryCov_9fa48("128083"), 'leaderElected'),
  LEADER_CHANGED: stryMutAct_9fa48("128084") ? "" : (stryCov_9fa48("128084"), 'leaderChanged'),
  SHUTDOWN: stryMutAct_9fa48("128085") ? "" : (stryCov_9fa48("128085"), 'shutdown'),
  STATE_TRANSITION: stryMutAct_9fa48("128086") ? "" : (stryCov_9fa48("128086"), 'stateTransition')
}));
const RAFT_REPLICA_BASE_LIFERAFT_TIMER = Object.freeze(stryMutAct_9fa48("128087") ? {} : (stryCov_9fa48("128087"), {
  HEARTBEAT: stryMutAct_9fa48("128088") ? "" : (stryCov_9fa48("128088"), 'heartbeat'),
  ELECTION_MIN: stryMutAct_9fa48("128089") ? "" : (stryCov_9fa48("128089"), 'election min'),
  ELECTION_MAX: stryMutAct_9fa48("128090") ? "" : (stryCov_9fa48("128090"), 'election max'),
  LOG: stryMutAct_9fa48("128091") ? "" : (stryCov_9fa48("128091"), 'Log'),
  HEARTBEAT_ELECTION: stryMutAct_9fa48("128092") ? "" : (stryCov_9fa48("128092"), 'heartbeat, election')
}));
const RAFT_REPLICA_BASE_LIFERAFT_EVENT = Object.freeze(stryMutAct_9fa48("128093") ? {} : (stryCov_9fa48("128093"), {
  LEADER: stryMutAct_9fa48("128094") ? "" : (stryCov_9fa48("128094"), 'leader'),
  FOLLOWER: stryMutAct_9fa48("128095") ? "" : (stryCov_9fa48("128095"), 'follower'),
  CANDIDATE: stryMutAct_9fa48("128096") ? "" : (stryCov_9fa48("128096"), 'candidate'),
  COMMIT: stryMutAct_9fa48("128097") ? "" : (stryCov_9fa48("128097"), 'commit'),
  LEADER_CHANGE: stryMutAct_9fa48("128098") ? "" : (stryCov_9fa48("128098"), 'leader change'),
  TERM_CHANGE: stryMutAct_9fa48("128099") ? "" : (stryCov_9fa48("128099"), 'term change')
}));
const RAFT_REPLICA_BASE_ADDRESS = Object.freeze(stryMutAct_9fa48("128100") ? {} : (stryCov_9fa48("128100"), {
  SEPARATOR: stryMutAct_9fa48("128101") ? "" : (stryCov_9fa48("128101"), '/')
}));
const RAFT_REPLICA_BASE_LOG_MSG = Object.freeze(stryMutAct_9fa48("128102") ? {} : (stryCov_9fa48("128102"), {
  DEFERRING_ELECTION_START: stryMutAct_9fa48("128103") ? "" : (stryCov_9fa48("128103"), 'Deferring election start'),
  STARTING_AS_LEARNER: stryMutAct_9fa48("128104") ? "" : (stryCov_9fa48("128104"), 'Starting as learner (non-voting) - will promote after catch-up'),
  LEARNER_PROMOTION_SCHEDULED: stryMutAct_9fa48("128105") ? "" : (stryCov_9fa48("128105"), 'Learner promotion check scheduled'),
  LEARNER_PROMOTED_TO_FOLLOWER: stryMutAct_9fa48("128106") ? "" : (stryCov_9fa48("128106"), 'Learner promoted to follower - now participating in elections'),
  LEARNER_PROMOTION_CHECK: stryMutAct_9fa48("128107") ? "" : (stryCov_9fa48("128107"), 'Checking learner promotion eligibility'),
  CLEARED_LIFERAFT_TIMERS: stryMutAct_9fa48("128108") ? "" : (stryCov_9fa48("128108"), 'Cleared liferaft timers for deferred election'),
  BECAME_LEADER: stryMutAct_9fa48("128109") ? "" : (stryCov_9fa48("128109"), 'Became leader (liferaft)'),
  LEADER_CHANGED: stryMutAct_9fa48("128110") ? "" : (stryCov_9fa48("128110"), 'Leader changed'),
  JOINING_PEER_ADDRESS: stryMutAct_9fa48("128111") ? "" : (stryCov_9fa48("128111"), 'Joining peer with fully qualified address'),
  PEER_ADDRESS_NOT_UNIFIED: stryMutAct_9fa48("128112") ? "" : (stryCov_9fa48("128112"), 'Peer address must be in unified format'),
  PEER_ADDRESS_FROM_LIST: stryMutAct_9fa48("128113") ? "" : (stryCov_9fa48("128113"), 'Built peer address from peerAddresses array'),
  PEER_ADDRESS_FROM_CACHE: stryMutAct_9fa48("128114") ? "" : (stryCov_9fa48("128114"), 'Built peer address from cache'),
  SINGLE_REPLICA_LEADER: stryMutAct_9fa48("128115") ? "" : (stryCov_9fa48("128115"), 'Single replica - becoming leader immediately'),
  STARTING_ELECTION_TIMER: stryMutAct_9fa48("128116") ? "" : (stryCov_9fa48("128116"), 'Starting Raft election timer'),
  RECEIVED_RAFT_PACKET: stryMutAct_9fa48("128117") ? "" : (stryCov_9fa48("128117"), 'Received Raft packet'),
  SENDING_RAFT_RESPONSE: stryMutAct_9fa48("128118") ? "" : (stryCov_9fa48("128118"), 'Sending Raft response'),
  FAILED_RAFT_RESPONSE: stryMutAct_9fa48("128119") ? "" : (stryCov_9fa48("128119"), 'Failed to send Raft response')
}));
const RAFT_REPLICA_BASE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("128120") ? {} : (stryCov_9fa48("128120"), {
  NOT_INITIALIZED: stryMutAct_9fa48("128121") ? "" : (stryCov_9fa48("128121"), 'RaftReplicaBase not initialized'),
  peerAddressNotUnified: stryMutAct_9fa48("128122") ? () => undefined : (stryCov_9fa48("128122"), peerId => stryMutAct_9fa48("128123") ? `` : (stryCov_9fa48("128123"), `Peer address must be unified: ${peerId}`)),
  peerAddressUnresolved: stryMutAct_9fa48("128124") ? () => undefined : (stryCov_9fa48("128124"), peerId => stryMutAct_9fa48("128125") ? `` : (stryCov_9fa48("128125"), `Unable to resolve unified peer address for ${peerId}`)),
  PERSIST_ROLE_FAILED: stryMutAct_9fa48("128126") ? "" : (stryCov_9fa48("128126"), 'Failed to persist raft role update'),
  PERSIST_LEADER_FAILED: stryMutAct_9fa48("128127") ? "" : (stryCov_9fa48("128127"), 'Failed to persist leader update')
}));
const RAFT_REPLICA_BASE_VALUE = Object.freeze(stryMutAct_9fa48("128128") ? {} : (stryCov_9fa48("128128"), {
  HASH_MODULO: NUM.TEN
}));
export { RAFT_REPLICA_BASE_ADDRESS, RAFT_REPLICA_BASE_DEFAULT, RAFT_REPLICA_BASE_ERROR_MSG, RAFT_REPLICA_BASE_EVENT, RAFT_REPLICA_BASE_LIFERAFT_EVENT, RAFT_REPLICA_BASE_LIFERAFT_TIMER, RAFT_REPLICA_BASE_LOG_MSG, RAFT_REPLICA_BASE_ROLE, RAFT_REPLICA_BASE_VALUE };