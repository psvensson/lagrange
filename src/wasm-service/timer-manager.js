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

import {
  TIMER_STATUS,
  RESERVED_KV_PREFIX,
} from './wasm-service-constants.js';
import {
  serializeTimerEntry,
  deserializeTimerEntry,
  TE_FIELD,
} from './wasm-service-models.js';

const LOCAL_NUM_ZERO = 0;

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
    this.replica = replica;
    this.activeTimers = new Map();
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
    const fireAt = Date.now() + delayMs;
    const entry = {
      [TE_FIELD.TIMER_ID]: timerId,
      [TE_FIELD.DELAY_MS]: delayMs,
      [TE_FIELD.FIRE_AT]: fireAt,
      [TE_FIELD.PAYLOAD]: payload,
      [TE_FIELD.STATUS]: TIMER_STATUS.ACTIVE,
      [TE_FIELD.CREATED_AT]: Date.now(),
    };
    const key = RESERVED_KV_PREFIX.TIMERS + timerId;
    const serialized = serializeTimerEntry(entry);
    await this.replica.proposeEntry({key, value: serialized});
    this._scheduleTimer(timerId, delayMs);
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
    const key = RESERVED_KV_PREFIX.TIMERS + timerId;
    const existing = this.replica.kvStore.get(
      RESERVED_KV_PREFIX.TIMERS, timerId,
    );
    if (existing) {
      const entry = deserializeTimerEntry(existing.toString());
      entry[TE_FIELD.STATUS] = TIMER_STATUS.CANCELLED;
      const serialized = serializeTimerEntry(entry);
      await this.replica.proposeEntry({key, value: serialized});
    }
    this._clearTimer(timerId);
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
    const entries = this.replica.kvStore.getAll(
      RESERVED_KV_PREFIX.TIMERS,
    );
    let reconstructedCount = LOCAL_NUM_ZERO;
    for (const [_key, value] of entries) {
      const entry = deserializeTimerEntry(value.toString());
      const status = entry[TE_FIELD.STATUS];
      if (status !== TIMER_STATUS.ACTIVE) {
        continue;
      }
      const timerId = entry[TE_FIELD.TIMER_ID];
      const fireAt = entry[TE_FIELD.FIRE_AT];
      const remaining = Math.max(fireAt - Date.now(), 0);
      this._scheduleTimer(timerId, remaining);
      reconstructedCount++;
    }
    return reconstructedCount;
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
    this.activeTimers.delete(timerId);
    const key = RESERVED_KV_PREFIX.TIMERS + timerId;
    const existing = this.replica.kvStore.get(
      RESERVED_KV_PREFIX.TIMERS, timerId,
    );
    if (!existing) {
      return;
    }
    const entry = deserializeTimerEntry(existing.toString());
    if (entry[TE_FIELD.STATUS] !== TIMER_STATUS.ACTIVE) {
      return;
    }
    entry[TE_FIELD.STATUS] = TIMER_STATUS.FIRED;
    const serialized = serializeTimerEntry(entry);
    await this.replica.proposeEntry({key, value: serialized});
    if (this.replica.onTimerCallback) {
      await this.replica.onTimerCallback(
        timerId, entry[TE_FIELD.PAYLOAD],
      );
    }
  }

  /**
   * Stop all active timers. Clears all local setTimeout handles
   * without modifying the KV store. Called on leadership loss.
   */
  stopAll() {
    for (const [_timerId, handle] of this.activeTimers) {
      clearTimeout(handle);
    }
    this.activeTimers.clear();
  }

  /**
   * Schedule a local setTimeout for a timer.
   * @param {string} timerId - Timer identifier.
   * @param {number} delayMs - Delay in milliseconds.
   * @private
   */
  _scheduleTimer(timerId, delayMs) {
    const handle = setTimeout(() => {
      this.onTimerFired(timerId);
    }, delayMs);
    this.activeTimers.set(timerId, handle);
  }

  /**
   * Clear a local setTimeout handle for a timer.
   * @param {string} timerId - Timer identifier.
   * @private
   */
  _clearTimer(timerId) {
    const handle = this.activeTimers.get(timerId);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.activeTimers.delete(timerId);
    }
  }
}

export {TimerManager};
