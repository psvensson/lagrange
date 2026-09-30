/**
 * Stop-lifecycle methods for CDCGroupPropagationService: the one guard every
 * arm site and post-attempt path checks, the one timer primitive that refuses
 * once stopped, the held retry delay, and the stop helpers that answer every
 * waiter with the typed stopped outcome.
 */

import {
  CDC_GROUP_PROPAGATION_DELIVERY_ERROR,
  CDC_GROUP_PROPAGATION_STATE,
} from './cdc-group-propagation-constants.js';

class CDCGroupPropagationLifecycleMethods {
  /**
   * Clear all pending background retry timers.
   * @private
   */
  clearBackgroundRetryTimers() {
    for (const retryTimer of this.backgroundRetryTimers) {
      clearTimeout(retryTimer);
    }
    this.backgroundRetryTimers.clear();
    this.backgroundRetryEntriesByKey.clear();
  }
  /**
   * Clear all pending immediate publication batch timers; every waiter of a
   * batch that will not run gets the stopped answer.
   * @private
   */
  clearImmediateBatchTimers() {
    for (const timer of this.immediateBatchTimers) {
      clearTimeout(timer);
    }
    this.immediateBatchTimers.clear();
    for (const entry of this.immediateBatchEntriesByKey.values()) {
      this.resolveImmediateBatch(entry, this.buildStoppedFailures(entry.targets));
    }
    this.immediateBatchEntriesByKey.clear();
  }
  /**
   * The typed stopped answer for targets that were not delivered to.
   * @param {Array<Object>} targets
   * @return {Array<Object>}
   * @private
   */
  buildStoppedFailures(targets) {
    return this.buildDeferredFailures(
      targets, CDC_GROUP_PROPAGATION_DELIVERY_ERROR.PROPAGATION_STOPPED);
  }
  /**
   * The one guard every arm site and post-attempt path checks.
   * @return {boolean}
   */
  isPropagationStopped() {
    return this.state === CDC_GROUP_PROPAGATION_STATE.STOPPED;
  }
  /**
   * The owner's one timer primitive: every retry delay, batch window and
   * background retry wave arms through it, and it refuses once stopped.
   * @param {Function} callback
   * @param {number} delayMs
   * @return {*} The timer, or null when the service is stopped.
   * @private
   */
  armPropagationTimer(callback, delayMs) {
    return this.isPropagationStopped() ? null : setTimeout(callback, delayMs);
  }
  /**
   * A delivery's retry delay, held until stop: stop() ends it at once and
   * clears its timer (the delivery then answers the stopped outcome); a
   * stopped service arms none.
   * @param {number} delayMs
   * @return {Promise<void>}
   * @private
   */
  sleep(delayMs) {
    return new Promise((resolve) => {
      let timer = null;
      const release = () => {
        clearTimeout(timer);
        this.retrySleepReleases.delete(release);
        resolve();
      };
      timer = this.armPropagationTimer(release, delayMs);
      if (timer === null) {
        resolve();
        return;
      }
      this.retrySleepReleases.add(release);
    });
  }
}

function defineCDCGroupPropagationLifecycleMethods(prototype) {
  const descriptors = Object.getOwnPropertyDescriptors(
    CDCGroupPropagationLifecycleMethods.prototype,
  );
  delete descriptors.constructor;
  Object.defineProperties(prototype, descriptors);
}

export {defineCDCGroupPropagationLifecycleMethods};
