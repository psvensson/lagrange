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
 * Inputs: the partition service and its owned wake set
 * (service.removalDrainWakes, created with the service); its port's
 * APPLIED_PROGRESS event, read only while the service has a port (a
 * released port applies nothing, and its release is itself a wake).
 * Canonical output: nextRemovalDrainWake(service), a promise settled by the
 * next such change; notifyRemovalServingDrain(service) settles every waiter.
 * Prohibited: a timer, a poll, or a decision - the drain re-reads its owners
 * after every wake.
 */
import {RAFT_EVENT} from '../raft/raft-operation-port-constants.js';

/**
 * Wake every removal drain waiting on this partition.
 * @param {Object} service - The partition.
 */
function notifyRemovalServingDrain(service) {
  const wakes = [...service.removalDrainWakes];
  service.removalDrainWakes.clear();
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
    let unsubscribe = null;
    let woken = false;
    const wake = () => {
      if (woken) {
        return;
      }
      woken = true;
      service.removalDrainWakes.delete(wake);
      if (unsubscribe !== null) {
        unsubscribe();
      }
      resolve();
    };
    service.removalDrainWakes.add(wake);
    // The port's subscribe always answers its unsubscribe
    // (raft-rs-operation-port.js).
    if (service.raft) {
      unsubscribe = service.raft.subscribe(RAFT_EVENT.APPLIED_PROGRESS, wake);
    }
  });
}

export {nextRemovalDrainWake, notifyRemovalServingDrain};
