import os from 'os';
import {CONFIG_KEY} from '../config/config-constants.js';

const THREADING_SUBSYSTEM = 'threading';

const THREADING_CONFIG_KEY = Object.freeze({
  MIN_THREADS: CONFIG_KEY.WORKER_MIN_THREADS,
  MAX_THREADS: CONFIG_KEY.WORKER_MAX_THREADS,
  IDLE_TIMEOUT_MS: CONFIG_KEY.WORKER_IDLE_TIMEOUT_MS,
});

const THREADING_DEFAULT = Object.freeze({
  MIN_THREADS: 2,
  MAX_THREADS: os.cpus().length,
  IDLE_TIMEOUT_MS: 30000,
});

const THREADING_EVENT = Object.freeze({
  POOL_ERROR: 'poolError',
  SERVICE_REGISTERED: 'serviceRegistered',
  SERVICE_UNREGISTERED: 'serviceUnregistered',
});

const THREADING_LOG_MSG = Object.freeze({
  POOL_ERROR: 'Worker pool error',
  INITIALIZED: 'Service thread manager initialized',
  OPERATION_COMPLETED: 'Service operation completed',
  OPERATION_FAILED: 'Service operation failed',
  SERVICE_REGISTERED: 'Service registered',
  SERVICE_UNREGISTERED: 'Service unregistered',
  SERVICE_REGISTRATION_FAILED: 'Service registration failed',
  SERVICE_UNREGISTRATION_FAILED: 'Service unregistration failed',
  SHUTDOWN_START: 'Shutting down service thread manager',
  SHUTDOWN_UNREGISTER_ERROR: 'Error unregistering service during shutdown',
  SHUTDOWN_COMPLETE: 'Service thread manager shutdown complete',
});

const THREADING_ERROR_MSG = Object.freeze({
  NOT_INITIALIZED: 'ServiceThreadManager not initialized',
  serviceAlreadyRegistered: (serviceId) => `Service already registered: ${serviceId}`,
  serviceNotFound: (serviceId) => `Service not found: ${serviceId}`,
  noHandlerRegistered: (serviceId) => `No handler registered for service: ${serviceId}`,
  unknownOperation: (operation, serviceId) =>
    `Unknown operation: ${operation} for service: ${serviceId}`,
});

const THREADING_HEALTH_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
});

const SERVICE_STATUS = Object.freeze({
  PENDING: 'pending',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  FAILED: 'failed',
});

const WORKER_OPERATION = Object.freeze({
  PING: 'ping',
  GET_STATUS: 'getStatus',
  REGISTER: 'register',
  UNREGISTER: 'unregister',
});

const WORKER_RESPONSE_STATUS = Object.freeze({
  OK: 'ok',
});

export {
  SERVICE_STATUS,
  THREADING_CONFIG_KEY,
  THREADING_DEFAULT,
  THREADING_ERROR_MSG,
  THREADING_HEALTH_STATUS,
  THREADING_EVENT,
  THREADING_LOG_MSG,
  THREADING_SUBSYSTEM,
  WORKER_OPERATION,
  WORKER_RESPONSE_STATUS,
};
