import {ConfigurationManager} from '../config/configuration-manager.js';
import {COLUMN} from '../constants/index.js';
import {
  CONTROL_PLANE_CONFIG_KEY,
  DEFAULT_READY_LEASE_MS,
} from './control-plane-constants.js';

const NODE_READY_LEASE_AUTHORITY_ERROR = Object.freeze({
  INVALID_LEASE_MS: 'NodeReadyLeaseAuthority requires a positive readyLeaseMs',
});

/**
 * The single owner of the node READY lease term. The lifecycle publication
 * grants the lease when it writes READY, and the lease sweep/reaper judge
 * expiry through the same authority, so the term is never re-derived from
 * configuration at a use site.
 */
class NodeReadyLeaseAuthority {
  /**
   * @param {Object} options
   * @param {number} options.readyLeaseMs - Lease term (controlPlane.readyLeaseMs).
   */
  constructor(options = {}) {
    const readyLeaseMs = Number(options.readyLeaseMs);
    if (!Number.isFinite(readyLeaseMs) || readyLeaseMs <= 0) {
      throw new Error(NODE_READY_LEASE_AUTHORITY_ERROR.INVALID_LEASE_MS);
    }
    this.readyLeaseMs = readyLeaseMs;
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
   * @param {Object|null} row - Nodes row.
   * @param {number} now
   * @return {boolean}
   */
  isExpired(row, now) {
    const leaseExpiry = Number(row?.[COLUMN.READY_LEASE_EXPIRES_AT]);
    return Number.isFinite(leaseExpiry) && leaseExpiry <= now;
  }

  /**
   * A row that holds a recorded lease that has not lapsed at `now`.
   * @param {Object|null} row - Nodes row.
   * @param {number} now
   * @return {boolean}
   */
  holdsLiveLease(row, now) {
    const leaseExpiry = Number(row?.[COLUMN.READY_LEASE_EXPIRES_AT]);
    return Number.isFinite(leaseExpiry) && leaseExpiry > now;
  }
}

export {NodeReadyLeaseAuthority};
