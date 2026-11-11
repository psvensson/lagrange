/**
 * Owner contract:
 * Owner: the named wake of a replica removal's serving drain (2026-11-11;
 * replaces its 10 ms poll). The drain ends when the partition's serving
 * requests reach zero and its participant custody is IDLE, or when its
 * connection is released; each of those changes is announced here by its
 * owner: the serving-request accounting (a request finished), the
 * participant session owner (a session ended or was discarded), the
 * persistence release (the connection closed), and the port's applied
 * progress (a PREPARED row decided by a committed entry).
 * Inputs: the partition service; its port's APPLIED_PROGRESS event.
 * Canonical output: nextRemovalDrainWake(service), a promise settled by the
 * next such change; notifyRemovalServingDrain(service) settles every waiter.
 * Prohibited: a timer, a poll, or a decision - the drain re-reads its owners
 * after every wake.
 */
import {RAFT_EVENT} from '../raft/raft-operation-port-constants.js';

const FUNCTION_TYPE = 'function';
// Per service: the wakes of the drains waiting on it.
const DRAIN_WAKES = new WeakMap();

/**
 * Wake every removal drain waiting on this partition.
 * @param {Object} service - The partition.
 */
function notifyRemovalServingDrain(service) {
  const wakes = service ? DRAIN_WAKES.get(service) : undefined;
  if (wakes === undefined) {
    return;
  }
  DRAIN_WAKES.delete(service);
  for (const wake of wakes) {
    wake();
  }
}

/**
 * The next change that can end a removal drain. Registered synchronously, so
 * a caller that read the drain's state just before cannot miss it.
 * @param {Object} service - The partition.
 * @return {Promise<void>}
 */
function nextRemovalDrainWake(service) {
  return new Promise((resolve) => {
    let wakes = DRAIN_WAKES.get(service);
    if (wakes === undefined) {
      wakes = new Set();
      DRAIN_WAKES.set(service, wakes);
    }
    let unsubscribe = null;
    let woken = false;
    const wake = () => {
      if (woken) {
        return;
      }
      woken = true;
      wakes.delete(wake);
      unsubscribe?.();
      resolve();
    };
    wakes.add(wake);
    const subscription = typeof service.raft?.subscribe === FUNCTION_TYPE ?
      service.raft.subscribe(RAFT_EVENT.APPLIED_PROGRESS, wake) : null;
    unsubscribe = typeof subscription === FUNCTION_TYPE ? subscription : null;
  });
}

export {nextRemovalDrainWake, notifyRemovalServingDrain};
