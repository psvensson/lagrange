/**
 * The foreground retry loop and its pressure gate for
 * CDCGroupPropagationService's durable wave.
 */

import {resolveCdcPropagationDeliveryProfile} from '../cache/cdc-propagation-delivery-profile.js';
import {PressureGovernor} from '../control-plane/pressure-governor.js';
import {reportCdcPropagationForegroundRetrySpent} from
  './cdc-group-propagation-retry-wait-report.js';
import {waitForForegroundRetry} from './cdc-group-propagation-foreground-retry.js';
import {CDC_GROUP_FOREGROUND_RETRY_STATE} from './cdc-group-propagation-constants.js';

const CDC_GROUP_PROPAGATION_SERVICE_LITERAL = Object.freeze({
  BATCH: 'batch',
  CDC_RETRY: 'cdc:retry',
});

class CDCGroupPropagationDeliveryMethods {
  /**
   * Drive one prepared durable wave with bounded foreground retry.
   * @param {Object} wave - The durable wave (cdc-group-propagation-durable-delivery.js).
   * @return {Promise<Object>}
   * @private
   */ async deliverToTargetsWithRetry(wave) {
    let attempt = 1;
    const maxAttempts = Math.max(1, this.deliveryRetryMaxAttempts);
    let retry = {state: CDC_GROUP_FOREGROUND_RETRY_STATE.ATTEMPTS_EXHAUSTED};
    while (attempt <= maxAttempts) {
      await wave.deliver();
      if (wave.complete()) return wave.result();
      retry = await this.waitForForegroundRetry(wave, attempt, maxAttempts);
      if (retry.state === CDC_GROUP_FOREGROUND_RETRY_STATE.STOPPED ||
          this.isPropagationStopped()) return wave.stopped();
      if (retry.state !== CDC_GROUP_FOREGROUND_RETRY_STATE.ADVANCE) break;
      attempt += 1;
    }
    reportCdcPropagationForegroundRetrySpent(this, {
      ...wave.deliveryLabel, attempt, maxAttempts, failureCount: wave.failureCount(),
      stopReason: retry.state, retryDelayMs: retry.retryDelayMs, remainingMs: retry.remainingMs,
    });
    return wave.result();
  }

  waitForForegroundRetry(wave, attempt, maxAttempts) {
    return waitForForegroundRetry(this, wave, attempt, maxAttempts);
  }

  /**
   * Describe one delivery wave for diagnostics.
   * @param {Array<Object>} events
   * @return {{tableName:string|null, operation:string|null, eventCount:number}}
   * @private
   */ describeDeliveryEvents(events) {
    if (events.length === 1) {
      return {
        tableName: events[0].tableName || null,
        operation: events[0].operation || null,
        eventCount: 1,
      };
    }
    return {
      tableName: CDC_GROUP_PROPAGATION_SERVICE_LITERAL.BATCH,
      operation: CDC_GROUP_PROPAGATION_SERVICE_LITERAL.BATCH,
      eventCount: events.length,
    };
  }
  /**
   * The shared pressure governor's decision for one wave's delivery class.
   * @param {Array<Object>} events
   * @return {Object} The pressure decision.
   * @private
   */ resolvePropagationPressure(events) {
    const deliveryProfile = resolveCdcPropagationDeliveryProfile(events);
    return PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    }).evaluate({
      workClass: deliveryProfile.workClass,
      resourceKeys: [CDC_GROUP_PROPAGATION_SERVICE_LITERAL.CDC_RETRY],
    });
  }

  /**
   * Compute exponential backoff retry delay.
   * @param {number} attempt
   * @return {number}
   * @private
   */
  computeRetryDelayMs(attempt) {
    const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? attempt : 1;
    const exponentialFactor = Math.pow(this.deliveryRetryBackoffMultiplier, safeAttempt - 1);
    const delayMs = this.deliveryRetryDelayMs * exponentialFactor;
    return Math.min(this.deliveryRetryMaxDelayMs, Math.max(1, Math.floor(delayMs)));
  }
}

function defineCDCGroupPropagationDeliveryMethods(prototype) {
  const descriptors = Object.getOwnPropertyDescriptors(
    CDCGroupPropagationDeliveryMethods.prototype,
  );
  delete descriptors.constructor;
  Object.defineProperties(prototype, descriptors);
}

export {defineCDCGroupPropagationDeliveryMethods};
