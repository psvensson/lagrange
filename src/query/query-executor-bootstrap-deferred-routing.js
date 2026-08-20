import {hasLiveTransportEvidence} from
  '../control-plane/live-transport-evidence.js';

function isReadinessInternalRouteStructurallyReady(options = {}) {
  const nodeId = options.service?.node_id || options.service?.nodeId || null;
  // Service status/address are checked by the caller. The canonical owner
  // response supplies data authority, and the shared live-router atom supplies
  // reachability. A local nodes projection is deliberately not an input: a
  // joiner cannot require its still-forming downstream cache to contact the
  // owner that produces the evidence needed to finish that formation.
  return hasLiveTransportEvidence(nodeId, {
    messageRouter: options.messageRouter,
  });
}

export {
  isReadinessInternalRouteStructurallyReady,
};
