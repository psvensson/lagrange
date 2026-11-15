import {ConfigurationManager} from '../config/configuration-manager.js';
import {COLUMN} from '../constants/index.js';
import {
  CONTROL_PLANE_CONFIG_KEY,
  DEFAULT_READY_LEASE_MS,
} from './control-plane-constants.js';

const DEFAULT_TTL_MS = DEFAULT_READY_LEASE_MS;
const DEFAULT_RENEWAL_CADENCE_DIVISOR = 3;
const DEFAULT_RENEWAL_INTERVAL_MS = Math.floor(
  DEFAULT_TTL_MS / DEFAULT_RENEWAL_CADENCE_DIVISOR,
);
const MIN_RENEWAL_INTERVAL_MS = 1;
const MIN_LEASE_TIMESTAMP_MS = 0;
const EMPTY_STRING = '';
const BOOLEAN_TYPE = 'boolean';

const NODE_READY_LEASE_AUTHORITY_ERROR = Object.freeze({
  INVALID_LEASE_MS: 'NodeReadyLeaseAuthority requires a positive readyLeaseMs',
});

/**
 * Resolve the canonical READY-lease renewal interval (1/3 of the lease TTL).
 * @param {number} [ttlMs=DEFAULT_TTL_MS] - READY lease TTL in milliseconds.
 * @return {number} Renewal interval in milliseconds.
 */
function resolveRenewalIntervalMs(ttlMs = DEFAULT_TTL_MS) {
  const numericTtlMs = Number(ttlMs);
  if (
    !Number.isFinite(numericTtlMs) ||
    numericTtlMs <= MIN_LEASE_TIMESTAMP_MS
  ) {
    throw new Error(NODE_READY_LEASE_AUTHORITY_ERROR.INVALID_LEASE_MS);
  }
  return Math.max(
    MIN_RENEWAL_INTERVAL_MS,
    Math.floor(numericTtlMs / DEFAULT_RENEWAL_CADENCE_DIVISOR),
  );
}

/**
 * Parse a node row's READY lease expiry timestamp without coercing null,
 * undefined, empty string, boolean, or non-positive values to epoch 0.
 * @param {Object|null|undefined} row - Nodes row.
 * @return {number|null} Finite positive expiry timestamp or null.
 */
function parseLeaseExpiresAt(row) {
  const raw = row?.[COLUMN.READY_LEASE_EXPIRES_AT];
  if (
    raw === null ||
    raw === undefined ||
    raw === EMPTY_STRING ||
    typeof raw === BOOLEAN_TYPE
  ) {
    return null;
  }
  const leaseExpiry = Number(raw);
  if (!Number.isFinite(leaseExpiry) || leaseExpiry === MIN_LEASE_TIMESTAMP_MS) {
    return null;
  }
  return leaseExpiry;
}

/**
 * The single owner of the node READY lease term and renewal cadence. The
 * lifecycle publication grants the lease when it writes READY, and the lease
 * sweep/reaper judge expiry through the same authority, so the term is never
 * re-derived from configuration at a use site.
 */
class NodeReadyLeaseAuthority {
  /**
   * @param {Object} [options]
   * @param {number} [options.readyLeaseMs] - Lease term (controlPlane.readyLeaseMs).
   */
  constructor(options = {}) {
    const readyLeaseMs = Number(options.readyLeaseMs ?? DEFAULT_TTL_MS);
    if (
      !Number.isFinite(readyLeaseMs) ||
      readyLeaseMs <= MIN_LEASE_TIMESTAMP_MS
    ) {
      throw new Error(NODE_READY_LEASE_AUTHORITY_ERROR.INVALID_LEASE_MS);
    }
    this.readyLeaseMs = readyLeaseMs;
    this.renewalIntervalMs = resolveRenewalIntervalMs(readyLeaseMs);
    Object.freeze(this);
  }

  /**
   * Build the authority from the configured controlPlane.readyLeaseMs.
   * @return {NodeReadyLeaseAuthority}
   */
  static fromConfiguration() {
    return new NodeReadyLeaseAuthority({
      readyLeaseMs:
        ConfigurationManager.getInstance().get(
          CONTROL_PLANE_CONFIG_KEY.READY_LEASE_MS,
        ) || DEFAULT_READY_LEASE_MS,
    });
  }

  /**
   * Grant one READY lease anchored at the durable heartbeat timestamp.
   * @param {number} heartbeatAt
   * @return {number} Lease expiry timestamp.
   */
  grant(heartbeatAt) {
    return heartbeatAt + this.readyLeaseMs;
  }

  /**
   * A row whose lease is recorded and has lapsed at `now`.
   * A row with `ready_lease_expires_at: null` has no lease (not an expired one).
   * @param {Object|null} row - Nodes row.
   * @param {number} now
   * @return {boolean}
   */
  isExpired(row, now) {
    const leaseExpiry = parseLeaseExpiresAt(row);
    if (leaseExpiry === null) {
      return false;
    }
    return leaseExpiry <= now;
  }

  /**
   * A row that holds a recorded lease that has not lapsed at `now`.
   * @param {Object|null} row - Nodes row.
   * @param {number} now
   * @return {boolean}
   */
  holdsLiveLease(row, now) {
    const leaseExpiry = parseLeaseExpiresAt(row);
    if (leaseExpiry === null) {
      return false;
    }
    return leaseExpiry > now;
  }
}

export {
  DEFAULT_RENEWAL_CADENCE_DIVISOR,
  DEFAULT_RENEWAL_INTERVAL_MS,
  DEFAULT_TTL_MS,
  NodeReadyLeaseAuthority,
  parseLeaseExpiresAt,
  resolveRenewalIntervalMs,
};
