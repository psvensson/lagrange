/**
 * EventEmitter-based operation stream publisher.
 * Emits operation state changes so clients can subscribe
 * to real-time updates.
 *
 * Requirements: 2.2, 8.5
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
import { EventEmitter } from 'node:events';
const OPERATION_STREAM_EVENT = Object.freeze(stryMutAct_9fa48("162397") ? {} : (stryCov_9fa48("162397"), {
  STATE_CHANGE: stryMutAct_9fa48("162398") ? "" : (stryCov_9fa48("162398"), 'operationStateChange')
}));
const OPERATION_STREAM_ERROR_MSG = Object.freeze(stryMutAct_9fa48("162399") ? {} : (stryCov_9fa48("162399"), {
  LISTENER_REQUIRED: stryMutAct_9fa48("162400") ? "" : (stryCov_9fa48("162400"), 'Listener function is required'),
  TENANT_ID_REQUIRED: stryMutAct_9fa48("162401") ? "" : (stryCov_9fa48("162401"), 'Tenant ID is required'),
  OPERATION_ID_REQUIRED: stryMutAct_9fa48("162402") ? "" : (stryCov_9fa48("162402"), 'Operation ID is required'),
  TO_STATE_REQUIRED: stryMutAct_9fa48("162403") ? "" : (stryCov_9fa48("162403"), 'Target state is required')
}));

/**
 * Pub/sub mechanism for operation state changes.
 * Extends EventEmitter to provide subscribe/unsubscribe
 * with tenant-scoped filtering.
 */
class OperationStream extends EventEmitter {
  /** @type {Map<Function, Function>} */
  #tenantListeners = new Map();

  /**
   * Publish an operation state change event.
   * @param {string} operationId - Operation identifier.
   * @param {string|null} fromState - Previous state (null for new).
   * @param {string} toState - New state.
   * @param {Object} [metadata] - Additional metadata.
   */
  publish(operationId, fromState, toState, metadata) {
    if (stryMutAct_9fa48("162404")) {
      {}
    } else {
      stryCov_9fa48("162404");
      if (stryMutAct_9fa48("162407") ? false : stryMutAct_9fa48("162406") ? true : stryMutAct_9fa48("162405") ? operationId : (stryCov_9fa48("162405", "162406", "162407"), !operationId)) {
        if (stryMutAct_9fa48("162408")) {
          {}
        } else {
          stryCov_9fa48("162408");
          throw new Error(OPERATION_STREAM_ERROR_MSG.OPERATION_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("162411") ? false : stryMutAct_9fa48("162410") ? true : stryMutAct_9fa48("162409") ? toState : (stryCov_9fa48("162409", "162410", "162411"), !toState)) {
        if (stryMutAct_9fa48("162412")) {
          {}
        } else {
          stryCov_9fa48("162412");
          throw new Error(OPERATION_STREAM_ERROR_MSG.TO_STATE_REQUIRED);
        }
      }
      const payload = Object.freeze(stryMutAct_9fa48("162413") ? {} : (stryCov_9fa48("162413"), {
        operationId,
        fromState: stryMutAct_9fa48("162414") ? fromState && null : (stryCov_9fa48("162414"), fromState ?? null),
        toState,
        metadata: stryMutAct_9fa48("162415") ? metadata && null : (stryCov_9fa48("162415"), metadata ?? null),
        timestamp: Date.now()
      }));
      this.emit(OPERATION_STREAM_EVENT.STATE_CHANGE, payload);
    }
  }

  /**
   * Subscribe to all operation state changes.
   * @param {Function} listener - Callback receiving payload.
   * @return {Function} Unsubscribe function.
   */
  subscribe(listener) {
    if (stryMutAct_9fa48("162416")) {
      {}
    } else {
      stryCov_9fa48("162416");
      if (stryMutAct_9fa48("162419") ? typeof listener === 'function' : stryMutAct_9fa48("162418") ? false : stryMutAct_9fa48("162417") ? true : (stryCov_9fa48("162417", "162418", "162419"), typeof listener !== (stryMutAct_9fa48("162420") ? "" : (stryCov_9fa48("162420"), 'function')))) {
        if (stryMutAct_9fa48("162421")) {
          {}
        } else {
          stryCov_9fa48("162421");
          throw new Error(OPERATION_STREAM_ERROR_MSG.LISTENER_REQUIRED);
        }
      }
      this.on(OPERATION_STREAM_EVENT.STATE_CHANGE, listener);
      return () => {
        if (stryMutAct_9fa48("162422")) {
          {}
        } else {
          stryCov_9fa48("162422");
          this.removeListener(OPERATION_STREAM_EVENT.STATE_CHANGE, listener);
        }
      };
    }
  }

  /**
   * Subscribe to state changes for a specific tenant only.
   * @param {string} tenantId - Tenant identifier.
   * @param {Function} listener - Callback receiving payload.
   * @return {Function} Unsubscribe function.
   */
  subscribeTenant(tenantId, listener) {
    if (stryMutAct_9fa48("162423")) {
      {}
    } else {
      stryCov_9fa48("162423");
      if (stryMutAct_9fa48("162426") ? false : stryMutAct_9fa48("162425") ? true : stryMutAct_9fa48("162424") ? tenantId : (stryCov_9fa48("162424", "162425", "162426"), !tenantId)) {
        if (stryMutAct_9fa48("162427")) {
          {}
        } else {
          stryCov_9fa48("162427");
          throw new Error(OPERATION_STREAM_ERROR_MSG.TENANT_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("162430") ? typeof listener === 'function' : stryMutAct_9fa48("162429") ? false : stryMutAct_9fa48("162428") ? true : (stryCov_9fa48("162428", "162429", "162430"), typeof listener !== (stryMutAct_9fa48("162431") ? "" : (stryCov_9fa48("162431"), 'function')))) {
        if (stryMutAct_9fa48("162432")) {
          {}
        } else {
          stryCov_9fa48("162432");
          throw new Error(OPERATION_STREAM_ERROR_MSG.LISTENER_REQUIRED);
        }
      }
      const wrapper = payload => {
        if (stryMutAct_9fa48("162433")) {
          {}
        } else {
          stryCov_9fa48("162433");
          if (stryMutAct_9fa48("162436") ? payload.metadata || payload.metadata.tenantId === tenantId : stryMutAct_9fa48("162435") ? false : stryMutAct_9fa48("162434") ? true : (stryCov_9fa48("162434", "162435", "162436"), payload.metadata && (stryMutAct_9fa48("162438") ? payload.metadata.tenantId !== tenantId : stryMutAct_9fa48("162437") ? true : (stryCov_9fa48("162437", "162438"), payload.metadata.tenantId === tenantId)))) {
            if (stryMutAct_9fa48("162439")) {
              {}
            } else {
              stryCov_9fa48("162439");
              listener(payload);
            }
          }
        }
      };
      this.#tenantListeners.set(listener, wrapper);
      this.on(OPERATION_STREAM_EVENT.STATE_CHANGE, wrapper);
      return () => {
        if (stryMutAct_9fa48("162440")) {
          {}
        } else {
          stryCov_9fa48("162440");
          this.removeListener(OPERATION_STREAM_EVENT.STATE_CHANGE, wrapper);
          this.#tenantListeners.delete(listener);
        }
      };
    }
  }

  /**
   * Return the number of listeners on the state change event.
   * @return {number}
   */
  getSubscriberCount() {
    if (stryMutAct_9fa48("162441")) {
      {}
    } else {
      stryCov_9fa48("162441");
      return this.listenerCount(OPERATION_STREAM_EVENT.STATE_CHANGE);
    }
  }
}
export { OPERATION_STREAM_EVENT, OPERATION_STREAM_ERROR_MSG, OperationStream };