import {STATE} from '../constants/index.js';

/**
 * §1.4.12 / spec node-liveness-veto-consolidation: the single shared
 * live-transport-evidence atom. Returns whether the LIVE in-memory
 * `messageRouter.getConnectionState(nodeId)` reports the peer reachable
 * (`CONNECTED`).
 *
 * This is the ONE authoritative definition of "transport-alive" for
 * eligibility consumers (readiness `isClusterMemberHealthy`, the lease-sweep
 * transport guard, and the rebalancer `available-nodes` placement gate). It
 * reads the live router ONLY — never the CDC-lagged `nodes`-row
 * `connection_state` column and never the `getNodeTransportState().connected`
 * composite that folds in the cached rowState fallback — so it is immune to the
 * MODE-A ingest-lag class (`a79b3728`) where a coordinator's stale cached view
 * of live peers zeroed the eligible set.
 *
 * Pure: the only I/O is the injected router accessor. Normalized (lowercase) to
 * match the existing sites. Compares `CONNECTED` only — the live transport
 * state machine has no `ready` state, so the inert `|| READY` disjunct of the
 * inline sites is dropped. Fails closed: a missing router, a non-function
 * accessor, or a throwing/absent connection state all return false, delegating
 * death detection to the transport ACK-timeout quarantine (which severs the
 * connection so the live router leaves `CONNECTED`).
 *
 * @param {string} nodeId - Node ID to check.
 * @param {{messageRouter: {getConnectionState: (nodeId: string) => string}}}
 *   evidence - Injected live router accessor.
 * @return {boolean} True iff the live router reports the node `CONNECTED`.
 */
function hasLiveTransportEvidence(nodeId, {messageRouter} = {}) {
  if (
    !messageRouter ||
    typeof messageRouter.getConnectionState !== 'function'
  ) {
    return false;
  }
  let connectionState;
  try {
    connectionState = messageRouter.getConnectionState(nodeId);
  } catch {
    return false;
  }
  return String(connectionState || '').toLowerCase() === STATE.CONNECTED;
}

export {hasLiveTransportEvidence};
