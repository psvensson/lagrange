/**
 * CancellationToken — cooperative cancellation and timeout
 * propagation across distributed query stages.
 *
 * Requirements: 9.5
 * @module query/cancellation-token
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
import { GUARDRAIL_ERROR_MSG as ERR } from './guardrail-constants.js';

/**
 * Token for cooperative cancellation. Supports parent-child
 * hierarchies and timeout-based auto-cancellation.
 */
class CancellationToken {
  constructor() {
    if (stryMutAct_9fa48("110094")) {
      {}
    } else {
      stryCov_9fa48("110094");
      this._cancelled = stryMutAct_9fa48("110095") ? true : (stryCov_9fa48("110095"), false);
      this._reason = null;
      /** @type {Function[]} */
      this._callbacks = stryMutAct_9fa48("110096") ? ["Stryker was here"] : (stryCov_9fa48("110096"), []);
      /** @type {CancellationToken[]} */
      this._children = stryMutAct_9fa48("110097") ? ["Stryker was here"] : (stryCov_9fa48("110097"), []);
    }
  }

  /**
   * Cancel this token and all children.
   *
   * @param {string} [reason] - Cancellation reason.
   */
  cancel(reason) {
    if (stryMutAct_9fa48("110098")) {
      {}
    } else {
      stryCov_9fa48("110098");
      if (stryMutAct_9fa48("110100") ? false : stryMutAct_9fa48("110099") ? true : (stryCov_9fa48("110099", "110100"), this._cancelled)) {
        if (stryMutAct_9fa48("110101")) {
          {}
        } else {
          stryCov_9fa48("110101");
          return;
        }
      }
      this._cancelled = stryMutAct_9fa48("110102") ? false : (stryCov_9fa48("110102"), true);
      this._reason = stryMutAct_9fa48("110103") ? reason && ERR.CANCELLED : (stryCov_9fa48("110103"), reason ?? ERR.CANCELLED);
      for (const cb of this._callbacks) {
        if (stryMutAct_9fa48("110104")) {
          {}
        } else {
          stryCov_9fa48("110104");
          cb(this._reason);
        }
      }
      for (const child of this._children) {
        if (stryMutAct_9fa48("110105")) {
          {}
        } else {
          stryCov_9fa48("110105");
          child.cancel(this._reason);
        }
      }
    }
  }

  /**
   * Check if this token is cancelled.
   *
   * @return {boolean} True if cancelled.
   */
  isCancelled() {
    if (stryMutAct_9fa48("110106")) {
      {}
    } else {
      stryCov_9fa48("110106");
      return this._cancelled;
    }
  }

  /**
   * Get the cancellation reason.
   *
   * @return {string|null} Reason or null.
   */
  getReason() {
    if (stryMutAct_9fa48("110107")) {
      {}
    } else {
      stryCov_9fa48("110107");
      return this._reason;
    }
  }

  /**
   * Register a callback to fire on cancellation. If already
   * cancelled, the callback fires immediately.
   *
   * @param {Function} callback - Cancellation handler.
   */
  onCancel(callback) {
    if (stryMutAct_9fa48("110108")) {
      {}
    } else {
      stryCov_9fa48("110108");
      if (stryMutAct_9fa48("110110") ? false : stryMutAct_9fa48("110109") ? true : (stryCov_9fa48("110109", "110110"), this._cancelled)) {
        if (stryMutAct_9fa48("110111")) {
          {}
        } else {
          stryCov_9fa48("110111");
          callback(this._reason);
          return;
        }
      }
      this._callbacks.push(callback);
    }
  }

  /**
   * Throw if this token is cancelled.
   *
   * @throws {Error} If cancelled.
   */
  throwIfCancelled() {
    if (stryMutAct_9fa48("110112")) {
      {}
    } else {
      stryCov_9fa48("110112");
      if (stryMutAct_9fa48("110114") ? false : stryMutAct_9fa48("110113") ? true : (stryCov_9fa48("110113", "110114"), this._cancelled)) {
        if (stryMutAct_9fa48("110115")) {
          {}
        } else {
          stryCov_9fa48("110115");
          throw new Error(stryMutAct_9fa48("110116") ? this._reason && ERR.CANCELLED : (stryCov_9fa48("110116"), this._reason ?? ERR.CANCELLED));
        }
      }
    }
  }

  /**
   * Create a child token that cancels when this parent
   * cancels.
   *
   * @return {CancellationToken} Child token.
   */
  createChild() {
    if (stryMutAct_9fa48("110117")) {
      {}
    } else {
      stryCov_9fa48("110117");
      const child = new CancellationToken();
      this._children.push(child);
      if (stryMutAct_9fa48("110119") ? false : stryMutAct_9fa48("110118") ? true : (stryCov_9fa48("110118", "110119"), this._cancelled)) {
        if (stryMutAct_9fa48("110120")) {
          {}
        } else {
          stryCov_9fa48("110120");
          child.cancel(this._reason);
        }
      }
      return child;
    }
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
    if (stryMutAct_9fa48("110121")) {
      {}
    } else {
      stryCov_9fa48("110121");
      const child = this.createChild();
      const timerId = setTimeout(() => {
        if (stryMutAct_9fa48("110122")) {
          {}
        } else {
          stryCov_9fa48("110122");
          child.cancel(ERR.TIMEOUT_EXCEEDED);
        }
      }, ms);
      child.onCancel(stryMutAct_9fa48("110123") ? () => undefined : (stryCov_9fa48("110123"), () => clearTimeout(timerId)));
      return child;
    }
  }
}
export { CancellationToken };