// The node's registry of hosted message-group services: the one map every
// hosting path (seed, dynamically created replica, joiner) registers a
// message-group replica in. It is the owner of the event "a message-group
// service appeared or became able to serve": registering a service, and any
// registered service initializing or electing a leader, notify its readiness
// subscribers. A subscriber therefore never depends on which services existed
// when it subscribed (a waiter armed over an enumerated set misses a service
// created later; CDC delivery finding F2, 2026-11-11).
import {EventEmitter} from 'node:events';
import {MESSAGE_GROUP_SERVICE_LITERAL} from
  '../../message-group/message-group-service-runtime-support.js';

// The service events that can make a registered service operational.
const MESSAGE_GROUP_READINESS_EVENTS = Object.freeze([
  MESSAGE_GROUP_SERVICE_LITERAL.INITIALIZED, MESSAGE_GROUP_SERVICE_LITERAL.LEADERELECTED]);

class MessageGroupServiceRegistry extends Map {
  constructor() {
    super();
    this.readinessListeners = new Set();
    this.relays = new Map();
  }

  set(replicaId, service) {
    this.detachRelay(replicaId);
    super.set(replicaId, service);
    this.attachRelay(replicaId, service);
    this.notifyReadiness({replicaId, service});
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
   * Subscribe to "a message-group service appeared or became able to serve".
   * @param {Function} listener - ({replicaId, service}) -> void.
   * @return {Function} Unsubscribe.
   */
  subscribeReadiness(listener) {
    this.readinessListeners.add(listener);
    return () => this.readinessListeners.delete(listener);
  }

  notifyReadiness(change) {
    for (const listener of [...this.readinessListeners]) listener(change);
  }

  // A service that is not an event emitter (a reduced composition's stand-in)
  // can only signal by being registered.
  attachRelay(replicaId, service) {
    if (!(service instanceof EventEmitter)) return;
    const relay = () => this.notifyReadiness({replicaId, service});
    for (const event of MESSAGE_GROUP_READINESS_EVENTS) service.on(event, relay);
    this.relays.set(replicaId, {service, relay});
  }

  detachRelay(replicaId) {
    const attached = this.relays.get(replicaId);
    if (!attached) return;
    for (const event of MESSAGE_GROUP_READINESS_EVENTS) {
      attached.service.removeListener(event, attached.relay);
    }
    this.relays.delete(replicaId);
  }
}

export {MessageGroupServiceRegistry};
