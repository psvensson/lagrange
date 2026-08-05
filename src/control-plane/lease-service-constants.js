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
  SWEEP_SKIPPED_TRANSPORT_CONNECTED:
    'Skipped lease disconnect for transport-connected node',
  REAPER_SKIPPED_TRANSPORT_CONNECTED:
    'Skipped stale-row reap for transport-connected node',
  REAPER_ROW_STOPPED:
    'Reaped stale failed-join node row: status driven to STOPPED',
  REAPER_ROW_STOP_FAILED:
    'Failed to drive stale failed-join node row to STOPPED',
  SWEEP_STALE_ROWS_REAPED: 'Reaped stale failed-join rows',
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
  STALE_ROW_REAPED: 'staleRowReaped',
});

const LEASE_SQL = Object.freeze({
  SELECT_ALL_NODES: `SELECT * FROM ${TABLES.NODES}`,
});

// The failed-join withdrawal (node-registration-owner-publication-methods)
// drives a leftover joining row to STOPPED on the happy path; when it is
// deferred, its in-memory reconcile queue is destroyed by teardown, or the
// process dies first, the row is stranded in `joining`. No live writer ever
// drives it terminal. The lease sweep intentionally only writes
// connection_state (a lease is not a membership terminal), so a separate
// reaper owns the stranded-joining-row terminal: status -> stopped once the
// row has no live ready lease and no live transport. The reaper complements
// the sweep; it never reaps a row that still holds a live lease or is
// transport-connected (the same guard the sweep applies).
const LEASE_REAPER = Object.freeze({
  STRANDED_STATUS: 'joining',
  TARGET_STATUS: 'stopped',
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
  LEASE_REAPER,
};
