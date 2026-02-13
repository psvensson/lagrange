/**
 * CancellationToken — cooperative cancellation and timeout
 * propagation across distributed query stages.
 *
 * Requirements: 9.5
 * @module query/cancellation-token
 */

import {
  GUARDRAIL_ERROR_MSG as ERR,
} from './guardrail-constants.js';

/**
 * Token for cooperative cancellation. Supports parent-child
 * hierarchies and timeout-based auto-cancellation.
 */
class CancellationToken {
  constructor() {
    this._cancelled = false;
    this._reason = null;
    /** @type {Function[]} */
    this._callbacks = [];
    /** @type {CancellationToken[]} */
    this._children = [];
  }

  /**
   * Cancel this token and all children.
   *
   * @param {string} [reason] - Cancellation reason.
   */
  cancel(reason) {
    if (this._cancelled) {
      return;
    }
    this._cancelled = true;
    this._reason = reason ?? ERR.CANCELLED;
    for (const cb of this._callbacks) {
      cb(this._reason);
    }
    for (const child of this._children) {
      child.cancel(this._reason);
    }
  }

  /**
   * Check if this token is cancelled.
   *
   * @return {boolean} True if cancelled.
   */
  isCancelled() {
    return this._cancelled;
  }

  /**
   * Get the cancellation reason.
   *
   * @return {string|null} Reason or null.
   */
  getReason() {
    return this._reason;
  }

  /**
   * Register a callback to fire on cancellation. If already
   * cancelled, the callback fires immediately.
   *
   * @param {Function} callback - Cancellation handler.
   */
  onCancel(callback) {
    if (this._cancelled) {
      callback(this._reason);
      return;
    }
    this._callbacks.push(callback);
  }

  /**
   * Throw if this token is cancelled.
   *
   * @throws {Error} If cancelled.
   */
  throwIfCancelled() {
    if (this._cancelled) {
      throw new Error(this._reason ?? ERR.CANCELLED);
    }
  }

  /**
   * Create a child token that cancels when this parent
   * cancels.
   *
   * @return {CancellationToken} Child token.
   */
  createChild() {
    const child = new CancellationToken();
    this._children.push(child);
    if (this._cancelled) {
      child.cancel(this._reason);
    }
    return child;
  }

  /**
   * Create a child token that auto-cancels after a timeout.
   * The timer is cleaned up when the child is cancelled by
   * any means (manual, parent, or timeout).
   *
   * @param {number} ms - Timeout in milliseconds.
   * @return {CancellationToken} Child token with timeout.
   */
  withTimeout(ms) {
    const child = this.createChild();
    const timerId = setTimeout(() => {
      child.cancel(ERR.TIMEOUT_EXCEEDED);
    }, ms);
    child.onCancel(() => clearTimeout(timerId));
    return child;
  }
}

export {CancellationToken};
