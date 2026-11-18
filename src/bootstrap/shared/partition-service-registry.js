// The node's registry of hosted partition services: the one map every hosting
// path (seed partitions phase, registered replica, joiner) registers a
// partition replica in. It is the owner of the event "a hosted partition
// service elected a leader": it relays LEADER_ELECTED from every registered
// service, and a service that already leads when it is registered announces
// it at registration. A subscriber therefore never depends on which
// partitions existed when it subscribed (a listener armed once over an
// enumerated set misses a partition created later; the same class as CDC
// delivery finding F2, repaired for message groups by
// MessageGroupServiceRegistry).
import {EventEmitter} from 'node:events';
import {PARTITION_SERVICE_EVENT} from
  '../../partition/partition-service-constants.js';

class PartitionServiceRegistry extends Map {
  constructor() {
    super();
    this.leaderElectedListeners = new Set();
    this.relays = new Map();
  }

  set(replicaId, service) {
    this.detachRelay(replicaId);
    super.set(replicaId, service);
    this.attachRelay(replicaId, service);
    if (service?.isLeader === true) {
      this.notifyLeaderElected({replicaId, service});
    }
    return this;
  }

  delete(replicaId) {
    this.detachRelay(replicaId);
    return super.delete(replicaId);
  }

  clear() {
    for (const replicaId of [...this.keys()]) this.delete(replicaId);
  }

  /**
   * Subscribe to "a hosted partition service elected a leader".
   * @param {Function} listener - ({replicaId, service}) -> void.
   * @return {Function} Unsubscribe.
   */
  subscribeLeaderElected(listener) {
    this.leaderElectedListeners.add(listener);
    return () => this.leaderElectedListeners.delete(listener);
  }

  notifyLeaderElected(change) {
    for (const listener of [...this.leaderElectedListeners]) listener(change);
  }

  // A service that is not an event emitter (a reduced composition's stand-in)
  // can only announce leadership by being registered while it leads.
  attachRelay(replicaId, service) {
    if (!(service instanceof EventEmitter)) return;
    const relay = () => this.notifyLeaderElected({replicaId, service});
    service.on(PARTITION_SERVICE_EVENT.LEADER_ELECTED, relay);
    this.relays.set(replicaId, {service, relay});
  }

  detachRelay(replicaId) {
    const attached = this.relays.get(replicaId);
    if (!attached) return;
    attached.service.removeListener(PARTITION_SERVICE_EVENT.LEADER_ELECTED,
      attached.relay);
    this.relays.delete(replicaId);
  }
}

export {PartitionServiceRegistry};
