/**
 * Service Worker - Worker thread entry point for service execution.
 * Handles service operations in isolated worker threads.
 * Requirements: 2.3, 2.4
 */

import {workerData} from 'worker_threads';
import {
  THREADING_ERROR_MSG,
  WORKER_OPERATION,
  WORKER_RESPONSE_STATUS,
} from './threading-constants.js';

/**
 * Service registry for worker thread.
 * Maps service IDs to their handlers.
 */
const serviceHandlers = new Map();

/**
 * Register a service handler.
 * @param {string} serviceId - The service identifier.
 * @param {Object} handler - The service handler object.
 */
function registerServiceHandler(serviceId, handler) {
  serviceHandlers.set(serviceId, handler);
}

/**
 * Unregister a service handler.
 * @param {string} serviceId - The service identifier.
 * @return {boolean} True if handler was removed.
 */
function unregisterServiceHandler(serviceId) {
  return serviceHandlers.delete(serviceId);
}

/**
 * Get a service handler.
 * @param {string} serviceId - The service identifier.
 * @return {Object|undefined} The service handler or undefined.
 */
function getServiceHandler(serviceId) {
  return serviceHandlers.get(serviceId);
}

/**
 * Execute a service operation.
 * @param {Object} task - The task to execute.
 * @param {string} task.serviceId - The target service ID.
 * @param {string} task.operation - The operation to perform.
 * @param {*} task.data - The operation data.
 * @return {Promise<*>} The operation result.
 */
async function executeOperation(task) {
  const {serviceId, operation, data} = task;

  // Handle built-in operations
  switch (operation) {
  case WORKER_OPERATION.PING:
    return {
      status: WORKER_RESPONSE_STATUS.OK,
      serviceId,
      timestamp: Date.now(),
      workerId: workerData?.workerId,
    };

  case WORKER_OPERATION.GET_STATUS:
    return {
      serviceId,
      registered: serviceHandlers.has(serviceId),
      handlerCount: serviceHandlers.size,
      timestamp: Date.now(),
    };

  case WORKER_OPERATION.REGISTER:
    registerServiceHandler(serviceId, data.handler || {});
    return {success: true, serviceId};

  case WORKER_OPERATION.UNREGISTER: {
    const removed = unregisterServiceHandler(serviceId);
    return {success: removed, serviceId};
  }

  default: {
    // Delegate to service handler
    const handler = getServiceHandler(serviceId);
    if (!handler) {
      throw new Error(THREADING_ERROR_MSG.NO_HANDLER_REGISTERED(serviceId));
    }

    if (typeof handler[operation] !== 'function') {
      throw new Error(THREADING_ERROR_MSG.UNKNOWN_OPERATION(operation, serviceId));
    }

    return await handler[operation](data);
  }
  }
}

// Export for piscina
export default executeOperation;

// Also export utilities for testing
export {
  registerServiceHandler,
  unregisterServiceHandler,
  getServiceHandler,
  executeOperation,
};
