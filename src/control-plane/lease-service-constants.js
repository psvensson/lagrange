/**
 * Constants for LeaseService.
 */

import {TABLES, TIME_MS} from '../constants/index.js';
import {CONFIG_KEY} from '../config/config-constants.js';

const LEASE_SUBSYSTEM = 'lease-service';
const LEASE_DEFAULT_OPTIONS = Object.freeze({});
const LEASE_EMPTY_QUERY_PARAMS = Object.freeze([]);
const LEASE_NOW = () => Date.now();

const LEASE_CONFIG_KEY = Object.freeze({
  READY_LEASE_MS: CONFIG_KEY.CONTROL_PLANE_READY_LEASE_MS,
  SWEEP_INTERVAL_MS: CONFIG_KEY.CONTROL_PLANE_LEASE_SWEEP_INTERVAL_MS,
});

const LEASE_DEFAULT = Object.freeze({
  READY_LEASE_MS: TIME_MS.CONTROL_PLANE_READY_LEASE,
  SWEEP_INTERVAL_MS: TIME_MS.CONTROL_PLANE_LEASE_SWEEP_INTERVAL,
});

const LEASE_STATE = Object.freeze({
  CREATED: 'created',
  INITIALIZED: 'initialized',
  RUNNING: 'running',
  STOPPED: 'stopped',
});

const LEASE_LOG_MSG = Object.freeze({
  INITIALIZED: 'LeaseService initialized',
  STARTED: 'LeaseService started',
  STOPPED: 'LeaseService stopped',
  SWEEP_FAILED: 'Lease sweep failed',
  SWEEP_EXPIRED: 'Swept expired leases',
});

const LEASE_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'LeaseService requires nodeId',
  MISSING_NODE_LEASE_OWNER:
    'LeaseService requires nodeLeaseOwner',
  MISSING_CACHE: 'LeaseService requires systemTableCache',
  NOT_INITIALIZED: 'LeaseService must be initialized before start',
});

const LEASE_EVENT = Object.freeze({
  LEASE_EXPIRED: 'leaseExpired',
  SWEEP_COMPLETE: 'sweepComplete',
  SWEEP_ERROR: 'sweepError',
});

const LEASE_SQL = Object.freeze({
  SELECT_ALL_NODES: `SELECT * FROM ${TABLES.NODES}`,
});

export {
  LEASE_SUBSYSTEM,
  LEASE_DEFAULT_OPTIONS,
  LEASE_EMPTY_QUERY_PARAMS,
  LEASE_NOW,
  LEASE_CONFIG_KEY,
  LEASE_DEFAULT,
  LEASE_STATE,
  LEASE_LOG_MSG,
  LEASE_ERROR_MSG,
  LEASE_EVENT,
  LEASE_SQL,
};
