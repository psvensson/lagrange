import {READ_CONSISTENCY_MODE} from './wasm-service-constants.js';

/**
 * Routing decision constants for read requests.
 * Each decision is a frozen object indicating whether to serve
 * locally or forward to the Raft leader.
 */
const ROUTING_DECISION = Object.freeze({
  SERVE_LOCALLY: Object.freeze({
    serveLocally: true,
    forwardToLeader: false,
  }),
  FORWARD_TO_LEADER: Object.freeze({
    serveLocally: false,
    forwardToLeader: true,
  }),
});

/**
 * Determines the routing decision for a read request based on
 * consistency mode, replica role, and safety interval state.
 *
 * Routing logic:
 *   1. Leader always serves locally (has latest state).
 *   2. leader_only mode on a follower → forward to leader.
 *   3. eventual mode on a follower → serve locally.
 *   4. strong mode on a follower → serve locally when the
 *      SafetyInterval confirms freshness, otherwise forward.
 *
 * @param {string} consistencyMode — one of READ_CONSISTENCY_MODE
 * @param {boolean} isLeader — true when this replica is the leader
 * @param {object} safetyInterval — SafetyInterval instance with
 *   canServeRead() method
 * @returns {{ serveLocally: boolean, forwardToLeader: boolean }}
 */
function routeRead(consistencyMode, isLeader, safetyInterval) {
  if (isLeader) {
    return ROUTING_DECISION.SERVE_LOCALLY;
  }

  if (consistencyMode === READ_CONSISTENCY_MODE.LEADER_ONLY) {
    return ROUTING_DECISION.FORWARD_TO_LEADER;
  }

  if (consistencyMode === READ_CONSISTENCY_MODE.EVENTUAL) {
    return ROUTING_DECISION.SERVE_LOCALLY;
  }

  // strong mode: delegate to safety interval freshness check
  if (safetyInterval.canServeRead()) {
    return ROUTING_DECISION.SERVE_LOCALLY;
  }

  return ROUTING_DECISION.FORWARD_TO_LEADER;
}

export {routeRead, ROUTING_DECISION};
