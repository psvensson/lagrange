/**
 * Stop-lifecycle methods for CDCGroupPropagationService: the one guard every
 * arm site and post-attempt path checks, the one timer primitive that refuses
 * once stopped, the held retry delay that stop() ends, and the retirement of
 * every durable wave in flight.
 */

import {CDC_GROUP_PROPAGATION_STATE} from './cdc-group-propagation-constants.js';

class CDCGroupPropagationLifecycleMethods {
  /**
   * The one guard every arm site and post-attempt path checks.
   * @return {boolean}
   */
  isPropagationStopped() {
    return this.state === CDC_GROUP_PROPAGATION_STATE.STOPPED;
  }
  /**
   * Retire every durable wave in flight (stop, initialize, a new lifetime):
   * each wave's invocation is retired at once, so it starts no further leaf
   * and its answer defers to the source owner. A wave leaves the set only at
   * its actual local cleanup, when every child it started has settled.
   * @private
   */
  retireInFlightDurableWaves() {
    for (const wave of [...this.inFlightDurableWaves]) {
      wave.context.retire();
    }
  }
  /**
   * The owner's one timer primitive: every retry delay arms through it, and
   * it refuses once stopped.
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
