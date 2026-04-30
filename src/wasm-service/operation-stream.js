/**
 * EventEmitter-based operation stream publisher.
 * Emits operation state changes so clients can subscribe
 * to real-time updates.
 *
 * Requirements: 2.2, 8.5
 */

import {EventEmitter} from 'node:events';

const LOCAL_STR_FUNCTION = 'function';

const OPERATION_STREAM_EVENT = Object.freeze({
  STATE_CHANGE: 'operationStateChange',
});

const OPERATION_STREAM_ERROR_MSG = Object.freeze({
  LISTENER_REQUIRED: 'Listener function is required',
  TENANT_ID_REQUIRED: 'Tenant ID is required',
  OPERATION_ID_REQUIRED: 'Operation ID is required',
  TO_STATE_REQUIRED: 'Target state is required',
});

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
    if (!operationId) {
      throw new Error(
        OPERATION_STREAM_ERROR_MSG.OPERATION_ID_REQUIRED,
      );
    }
    if (!toState) {
      throw new Error(
        OPERATION_STREAM_ERROR_MSG.TO_STATE_REQUIRED,
      );
    }
    const payload = Object.freeze({
      operationId,
      fromState: fromState ?? null,
      toState,
      metadata: metadata ?? null,
      timestamp: Date.now(),
    });
    this.emit(OPERATION_STREAM_EVENT.STATE_CHANGE, payload);
  }

  /**
   * Subscribe to all operation state changes.
   * @param {Function} listener - Callback receiving payload.
   * @return {Function} Unsubscribe function.
   */
  subscribe(listener) {
    if (typeof listener !== LOCAL_STR_FUNCTION) {
      throw new Error(
        OPERATION_STREAM_ERROR_MSG.LISTENER_REQUIRED,
      );
    }
    this.on(OPERATION_STREAM_EVENT.STATE_CHANGE, listener);
    return () => {
      this.removeListener(
        OPERATION_STREAM_EVENT.STATE_CHANGE, listener,
      );
    };
  }

  /**
   * Subscribe to state changes for a specific tenant only.
   * @param {string} tenantId - Tenant identifier.
   * @param {Function} listener - Callback receiving payload.
   * @return {Function} Unsubscribe function.
   */
  subscribeTenant(tenantId, listener) {
    if (!tenantId) {
      throw new Error(
        OPERATION_STREAM_ERROR_MSG.TENANT_ID_REQUIRED,
      );
    }
    if (typeof listener !== LOCAL_STR_FUNCTION) {
      throw new Error(
        OPERATION_STREAM_ERROR_MSG.LISTENER_REQUIRED,
      );
    }
    const wrapper = (payload) => {
      if (payload.metadata &&
          payload.metadata.tenantId === tenantId) {
        listener(payload);
      }
    };
    this.#tenantListeners.set(listener, wrapper);
    this.on(OPERATION_STREAM_EVENT.STATE_CHANGE, wrapper);
    return () => {
      this.removeListener(
        OPERATION_STREAM_EVENT.STATE_CHANGE, wrapper,
      );
      this.#tenantListeners.delete(listener);
    };
  }

  /**
   * Return the number of listeners on the state change event.
   * @return {number}
   */
  getSubscriberCount() {
    return this.listenerCount(
      OPERATION_STREAM_EVENT.STATE_CHANGE,
    );
  }
}

export {
  OPERATION_STREAM_EVENT,
  OPERATION_STREAM_ERROR_MSG,
  OperationStream,
};
