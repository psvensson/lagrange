/**
 * TimerManager — manages persistent timers for a WASM service
 * replica. Timer state is replicated through Raft via the
 * session KV store under the reserved `_timers/` prefix.
 *
 * Only the Raft leader runs active timers. On leader election,
 * `reconstructTimers()` rebuilds active timers from the KV
 * store. On leadership loss, `stopAll()` clears all handles.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 * @module wasm-service/timer-manager
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { TIMER_STATUS, RESERVED_KV_PREFIX } from './wasm-service-constants.js';
import { serializeTimerEntry, deserializeTimerEntry, TE_FIELD } from './wasm-service-models.js';

/**
 * Manages persistent timers for a single WASM service replica.
 *
 * Timer entries are stored in the replica's KV store under the
 * `_timers/` prefix. Each entry is a JSON-serialized TimerEntry
 * with status tracking (active, fired, cancelled).
 *
 * The fire-before-invoke contract ensures exactly-once semantics:
 * the timer is marked as 'fired' in the KV store via Raft
 * proposal BEFORE the handler is invoked. If the leader fails
 * after marking but before invoking, the new leader will see
 * the 'fired' status and skip re-firing.
 */
class TimerManager {
  /**
   * @param {Object} replica - The WASM service replica instance.
   *   Must provide `proposeEntry(entry)` for Raft proposals and
   *   `kvStore` for KV store access.
   */
  constructor(replica) {
    if (stryMutAct_9fa48("163247")) {
      {}
    } else {
      stryCov_9fa48("163247");
      this.replica = replica;
      this.activeTimers = new Map();
    }
  }

  /**
   * Create a persistent timer. Serializes the timer entry,
   * stores it in the KV store via Raft proposal, and schedules
   * a local setTimeout.
   *
   * @param {string} timerId - Unique timer identifier.
   * @param {number} delayMs - Delay in milliseconds before fire.
   * @param {Object} payload - Arbitrary JSON payload passed to
   *   the handler when the timer fires.
   * @return {Promise<void>}
   */
  async createTimer(timerId, delayMs, payload) {
    if (stryMutAct_9fa48("163248")) {
      {}
    } else {
      stryCov_9fa48("163248");
      const fireAt = stryMutAct_9fa48("163249") ? Date.now() - delayMs : (stryCov_9fa48("163249"), Date.now() + delayMs);
      const entry = stryMutAct_9fa48("163250") ? {} : (stryCov_9fa48("163250"), {
        [TE_FIELD.TIMER_ID]: timerId,
        [TE_FIELD.DELAY_MS]: delayMs,
        [TE_FIELD.FIRE_AT]: fireAt,
        [TE_FIELD.PAYLOAD]: payload,
        [TE_FIELD.STATUS]: TIMER_STATUS.ACTIVE,
        [TE_FIELD.CREATED_AT]: Date.now()
      });
      const key = stryMutAct_9fa48("163251") ? RESERVED_KV_PREFIX.TIMERS - timerId : (stryCov_9fa48("163251"), RESERVED_KV_PREFIX.TIMERS + timerId);
      const serialized = serializeTimerEntry(entry);
      await this.replica.proposeEntry(stryMutAct_9fa48("163252") ? {} : (stryCov_9fa48("163252"), {
        key,
        value: serialized
      }));
      this._scheduleTimer(timerId, delayMs);
    }
  }

  /**
   * Cancel a persistent timer. Updates the timer status to
   * 'cancelled' in the KV store via Raft proposal and clears
   * the local setTimeout handle.
   *
   * @param {string} timerId - Timer identifier to cancel.
   * @return {Promise<void>}
   */
  async cancelTimer(timerId) {
    if (stryMutAct_9fa48("163253")) {
      {}
    } else {
      stryCov_9fa48("163253");
      const key = stryMutAct_9fa48("163254") ? RESERVED_KV_PREFIX.TIMERS - timerId : (stryCov_9fa48("163254"), RESERVED_KV_PREFIX.TIMERS + timerId);
      const existing = this.replica.kvStore.get(RESERVED_KV_PREFIX.TIMERS, timerId);
      if (stryMutAct_9fa48("163256") ? false : stryMutAct_9fa48("163255") ? true : (stryCov_9fa48("163255", "163256"), existing)) {
        if (stryMutAct_9fa48("163257")) {
          {}
        } else {
          stryCov_9fa48("163257");
          const entry = deserializeTimerEntry(existing.toString());
          entry[TE_FIELD.STATUS] = TIMER_STATUS.CANCELLED;
          const serialized = serializeTimerEntry(entry);
          await this.replica.proposeEntry(stryMutAct_9fa48("163258") ? {} : (stryCov_9fa48("163258"), {
            key,
            value: serialized
          }));
        }
      }
      this._clearTimer(timerId);
    }
  }

  /**
   * Reconstruct all active timers from the KV store. Called on
   * leader election to resume timers that were persisted by the
   * previous leader.
   *
   * Skips entries with status 'fired' or 'cancelled'. For active
   * entries, calculates the remaining delay from the stored
   * `fireAt` timestamp. If the fire time has already passed,
   * fires immediately.
   *
   * @return {Promise<void>}
   */
  async reconstructTimers() {
    if (stryMutAct_9fa48("163259")) {
      {}
    } else {
      stryCov_9fa48("163259");
      const entries = this.replica.kvStore.getAll(RESERVED_KV_PREFIX.TIMERS);
      let reconstructedCount = 0;
      for (const [_key, value] of entries) {
        if (stryMutAct_9fa48("163260")) {
          {}
        } else {
          stryCov_9fa48("163260");
          const entry = deserializeTimerEntry(value.toString());
          const status = entry[TE_FIELD.STATUS];
          if (stryMutAct_9fa48("163263") ? status === TIMER_STATUS.ACTIVE : stryMutAct_9fa48("163262") ? false : stryMutAct_9fa48("163261") ? true : (stryCov_9fa48("163261", "163262", "163263"), status !== TIMER_STATUS.ACTIVE)) {
            if (stryMutAct_9fa48("163264")) {
              {}
            } else {
              stryCov_9fa48("163264");
              continue;
            }
          }
          const timerId = entry[TE_FIELD.TIMER_ID];
          const fireAt = entry[TE_FIELD.FIRE_AT];
          const remaining = stryMutAct_9fa48("163265") ? Math.min(fireAt - Date.now(), 0) : (stryCov_9fa48("163265"), Math.max(stryMutAct_9fa48("163266") ? fireAt + Date.now() : (stryCov_9fa48("163266"), fireAt - Date.now()), 0));
          this._scheduleTimer(timerId, remaining);
          stryMutAct_9fa48("163267") ? reconstructedCount-- : (stryCov_9fa48("163267"), reconstructedCount++);
        }
      }
      return reconstructedCount;
    }
  }

  /**
   * Handle a timer firing. Marks the timer as 'fired' in the
   * KV store via Raft proposal BEFORE invoking the handler.
   * This ensures exactly-once semantics: if the leader fails
   * after marking but before handler completion, the new leader
   * sees the 'fired' status and skips re-firing.
   *
   * @param {string} timerId - Timer identifier that fired.
   * @return {Promise<void>}
   */
  async onTimerFired(timerId) {
    if (stryMutAct_9fa48("163268")) {
      {}
    } else {
      stryCov_9fa48("163268");
      this.activeTimers.delete(timerId);
      const key = stryMutAct_9fa48("163269") ? RESERVED_KV_PREFIX.TIMERS - timerId : (stryCov_9fa48("163269"), RESERVED_KV_PREFIX.TIMERS + timerId);
      const existing = this.replica.kvStore.get(RESERVED_KV_PREFIX.TIMERS, timerId);
      if (stryMutAct_9fa48("163272") ? false : stryMutAct_9fa48("163271") ? true : stryMutAct_9fa48("163270") ? existing : (stryCov_9fa48("163270", "163271", "163272"), !existing)) {
        if (stryMutAct_9fa48("163273")) {
          {}
        } else {
          stryCov_9fa48("163273");
          return;
        }
      }
      const entry = deserializeTimerEntry(existing.toString());
      if (stryMutAct_9fa48("163276") ? entry[TE_FIELD.STATUS] === TIMER_STATUS.ACTIVE : stryMutAct_9fa48("163275") ? false : stryMutAct_9fa48("163274") ? true : (stryCov_9fa48("163274", "163275", "163276"), entry[TE_FIELD.STATUS] !== TIMER_STATUS.ACTIVE)) {
        if (stryMutAct_9fa48("163277")) {
          {}
        } else {
          stryCov_9fa48("163277");
          return;
        }
      }
      entry[TE_FIELD.STATUS] = TIMER_STATUS.FIRED;
      const serialized = serializeTimerEntry(entry);
      await this.replica.proposeEntry(stryMutAct_9fa48("163278") ? {} : (stryCov_9fa48("163278"), {
        key,
        value: serialized
      }));
      if (stryMutAct_9fa48("163280") ? false : stryMutAct_9fa48("163279") ? true : (stryCov_9fa48("163279", "163280"), this.replica.onTimerCallback)) {
        if (stryMutAct_9fa48("163281")) {
          {}
        } else {
          stryCov_9fa48("163281");
          await this.replica.onTimerCallback(timerId, entry[TE_FIELD.PAYLOAD]);
        }
      }
    }
  }

  /**
   * Stop all active timers. Clears all local setTimeout handles
   * without modifying the KV store. Called on leadership loss.
   */
  stopAll() {
    if (stryMutAct_9fa48("163282")) {
      {}
    } else {
      stryCov_9fa48("163282");
      for (const [_timerId, handle] of this.activeTimers) {
        if (stryMutAct_9fa48("163283")) {
          {}
        } else {
          stryCov_9fa48("163283");
          clearTimeout(handle);
        }
      }
      this.activeTimers.clear();
    }
  }

  /**
   * Schedule a local setTimeout for a timer.
   * @param {string} timerId - Timer identifier.
   * @param {number} delayMs - Delay in milliseconds.
   * @private
   */
  _scheduleTimer(timerId, delayMs) {
    if (stryMutAct_9fa48("163284")) {
      {}
    } else {
      stryCov_9fa48("163284");
      const handle = setTimeout(() => {
        if (stryMutAct_9fa48("163285")) {
          {}
        } else {
          stryCov_9fa48("163285");
          this.onTimerFired(timerId);
        }
      }, delayMs);
      this.activeTimers.set(timerId, handle);
    }
  }

  /**
   * Clear a local setTimeout handle for a timer.
   * @param {string} timerId - Timer identifier.
   * @private
   */
  _clearTimer(timerId) {
    if (stryMutAct_9fa48("163286")) {
      {}
    } else {
      stryCov_9fa48("163286");
      const handle = this.activeTimers.get(timerId);
      if (stryMutAct_9fa48("163289") ? handle === undefined : stryMutAct_9fa48("163288") ? false : stryMutAct_9fa48("163287") ? true : (stryCov_9fa48("163287", "163288", "163289"), handle !== undefined)) {
        if (stryMutAct_9fa48("163290")) {
          {}
        } else {
          stryCov_9fa48("163290");
          clearTimeout(handle);
          this.activeTimers.delete(timerId);
        }
      }
    }
  }
}
export { TimerManager };