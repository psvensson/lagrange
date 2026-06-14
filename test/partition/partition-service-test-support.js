/**
 * Shared test support for PartitionService unit suites.
 *
 * These helpers were previously duplicated verbatim across the
 * partition-service test parts. They are extracted here unchanged so the
 * runnable suites can import a single semantic support module.
 */

import {EventEmitter} from 'node:events';
import {LIFECYCLE_PHASE} from '../../src/bootstrap/lifecycle-controller-constants.js';

export function createLoopbackTransport() {
  const handlers = new Map();
  return {
    register(address, handler) {
      handlers.set(address, handler);
    },
    unregister(address) {
      handlers.delete(address);
    },
    async deliver(address, payload) {
      const handler = handlers.get(address);
      if (!handler) {
        throw new Error(`No handler registered for ${address}`);
      }
      return handler({payload});
    },
  };
}

export async function waitForCondition(
  predicate,
  timeoutMs = 1000,
  intervalMs = 10,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await Promise.resolve(predicate())) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

export function createTrafficReadinessState() {
  const emitter = new EventEmitter();
  let snapshot = {
    phase: LIFECYCLE_PHASE.INIT,
    ready: false,
    reasons: [],
  };

  return {
    getSnapshot() {
      return {...snapshot};
    },
    on(eventName, listener) {
      emitter.on(eventName, listener);
    },
    off(eventName, listener) {
      emitter.off(eventName, listener);
    },
    transitionTo(phase, options = {}) {
      snapshot = {
        phase,
        ready: options.ready === true,
        reasons: Array.isArray(options.reasons) ? [...options.reasons] : [],
      };
      emitter.emit('transition', {...snapshot});
      return {...snapshot};
    },
  };
}
