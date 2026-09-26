/**
 * Owner contract:
 * Owner: the replica handler's tracked-service registry as the node's single
 * relay of partition consensus observations (membership, leader, term) (quest
 * replace-source-removal-owner, design S5.2, amendment-1 step 1).
 * Inputs: each tracked partition service's CONSENSUS_OBSERVED event, which
 * relays its operation port's announcements of the applied ConfState, the
 * leader and the term.
 * Canonical output: one node-level subscription the REPLACE owner holds; the
 * relay follows every service the handler tracks, including a swapped
 * service (replaceLocalReplicaService) and a removed one.
 * Prohibited: the relay decides nothing and carries no authority. Only the
 * REPLACE owner subscribes (not the readiness planner, the publication
 * coordinator, the planner or the peer-cache reconciliation).
 */
import {
  PARTITION_SERVICE_EVENT,
} from '../partition/partition-service-constants.js';

const FUNCTION_TYPE = 'function';

function detachListener(service, eventName, listener) {
  if (typeof service?.off === FUNCTION_TYPE) {
    service.off(eventName, listener);
  } else if (typeof service?.removeListener === FUNCTION_TYPE) {
    service.removeListener(eventName, listener);
  }
}

/**
 * The replica handler's live service map. Every set, delete and clear
 * attaches or detaches that service's membership relay, so no registration
 * path can bypass it.
 */
class TrackedServiceRegistry extends Map {
  constructor() {
    super();
    this.membershipListeners = new Set();
    this.relayByReplicaId = new Map();
  }

  set(replicaId, service) {
    this.detachRelay(replicaId);
    super.set(replicaId, service);
    this.attachRelay(replicaId, service);
    return this;
  }

  delete(replicaId) {
    this.detachRelay(replicaId);
    return super.delete(replicaId);
  }

  clear() {
    for (const replicaId of [...this.relayByReplicaId.keys()]) {
      this.detachRelay(replicaId);
    }
    super.clear();
  }

  attachRelay(replicaId, service) {
    if (typeof service?.on !== FUNCTION_TYPE) {
      return;
    }
    const relay = (event) => {
      for (const listener of [...this.membershipListeners]) {
        listener(event);
      }
    };
    service.on(PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED, relay);
    this.relayByReplicaId.set(replicaId, {service, relay});
  }

  detachRelay(replicaId) {
    const attached = this.relayByReplicaId.get(replicaId);
    if (!attached) {
      return;
    }
    this.relayByReplicaId.delete(replicaId);
    detachListener(
      attached.service,
      PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED,
      attached.relay,
    );
  }

  /**
   * @param {Function} listener - Receives {partitionId, replicaId} with
   *   {confState, commitIndex, appliedIndex}, {leaderReplicaId} or {term}.
   * @return {Function} Unsubscribe.
   */
  subscribeConsensusObservations(listener) {
    if (typeof listener !== FUNCTION_TYPE) {
      return () => {};
    }
    this.membershipListeners.add(listener);
    return () => this.membershipListeners.delete(listener);
  }
}

/**
 * The node's consensus relay a replica handler exposes, for the bootstrap
 * paths that hand it to the REPLACE owner.
 * @param {Object|null|undefined} replicaHandler
 * @return {Object|null}
 */
function replicaConsensusEventsOf(replicaHandler) {
  return replicaHandler?.consensusEvents || null;
}

export {TrackedServiceRegistry, replicaConsensusEventsOf};
