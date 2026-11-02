import {hasLiveTransportEvidence} from
  '../control-plane/live-transport-evidence.js';

function isSystemTableRouteStructurallyReady(options = {}) {
  const nodeId = options.service?.node_id || options.service?.nodeId || null;
  // Service status/address are checked by the caller. The target's raft
  // leadership proof supplies data authority, and the shared live-router atom
  // supplies reachability; the local node needs no transport. A readiness
  // lane or a local nodes projection is deliberately not an input: a joiner
  // cannot require its still-forming downstream cache to contact the owner
  // that produces the evidence needed to finish that formation.
  if (nodeId !== null && nodeId === options.localNodeId) {
    return true;
  }
  return hasLiveTransportEvidence(nodeId, {
    messageRouter: options.messageRouter,
  });
}

export {
  isSystemTableRouteStructurallyReady,
};
