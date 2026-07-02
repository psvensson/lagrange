import {
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_CACHE,
  LOCAL_STR_COLON,
  LOCAL_STR_EMPTY,
  resolveBootstrapTopologySnapshotPositiveInteger,
} from './bootstrap-topology-snapshot-owner-contract.js';
import {
  defineBootstrapTopologySnapshotOwnerMethods,
} from './bootstrap-topology-snapshot-owner-methods.js';

/**
 * Canonical authority owner for bootstrap topology views.
 *
 * View contract:
 * 1. raw observed rows: last local convergence input from `systemTableCache`
 * 2. published authority rows: current stabilized answer for production use
 * 3. retained authority rows: last published stable answer kept for bounded
 *    owner-internal stabilization
 *
 * Consumer contract:
 * 1. production routing, readiness, and bootstrap admission must use the
 *    published authority view or canonical helpers built on top of it
 * 2. diagnostics may compare published authority against raw observed rows
 * 3. retained rows are not a second public cache; new production consumers
 *    must not branch on them directly
 */
class BootstrapTopologySnapshotOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.nowFn = typeof options.nowFn === 'function' ?
      options.nowFn :
      Date.now;
    this.authoritativeSnapshotCacheTtlMs =
      resolveBootstrapTopologySnapshotPositiveInteger(
        options.authoritativeSnapshotCacheTtlMs,
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_CACHE.AUTHORITATIVE_SNAPSHOT_TTL_MS,
      );
    this.warningThrottleMs =
      resolveBootstrapTopologySnapshotPositiveInteger(
        options.warningThrottleMs,
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_CACHE.WARNING_THROTTLE_MS,
      );
    this.authoritativeSnapshotCacheByTableName = new Map();
    this.warningLedgerByKey = new Map();
  }

  getSystemTableCache() {
    return this.delegates.getSystemTableCache?.() || null;
  }

  getPartitionServices() {
    return this.delegates.getPartitionServices?.() || null;
  }

  getSeedNodeId() {
    return this.delegates.getSeedNodeId?.() || null;
  }

  getLogger() {
    return this.delegates.getLogger?.() || console;
  }

  getCurrentEpoch() {
    return this.delegates.getCurrentEpoch?.() || null;
  }

  getNowMs() {
    return this.nowFn();
  }

  resolveBootstrapTopologySnapshotWarningLedgerKey(
    warningKey,
    payload = {},
  ) {
    const tableName = typeof payload?.tableName === 'string' ?
      payload.tableName :
      '';
    const partitionId = typeof payload?.partitionId === 'string' ?
      payload.partitionId :
      '';
    const partitionIds = Array.isArray(payload?.partitionIds) ?
      payload.partitionIds
        .filter((value) => typeof value === 'string' && value.length > 0)
        .join('|') :
      '';
    return [
      String(warningKey || LOCAL_STR_EMPTY),
      tableName,
      partitionId,
      partitionIds,
    ].join(LOCAL_STR_COLON);
  }

  warnBootstrapTopologySnapshot(warningKey, message, payload = {}) {
    const ledgerKey = this.resolveBootstrapTopologySnapshotWarningLedgerKey(
      warningKey,
      payload,
    );
    const nowMs = this.getNowMs();
    if (this.warningLedgerByKey.has(ledgerKey)) {
      const previousWarnedAtMs = this.warningLedgerByKey.get(ledgerKey);
      if (nowMs - previousWarnedAtMs < this.warningThrottleMs) {
        return;
      }
    }
    this.warningLedgerByKey.set(ledgerKey, nowMs);
    this.getLogger().warn(message, payload);
  }
}

defineBootstrapTopologySnapshotOwnerMethods(BootstrapTopologySnapshotOwner);

export {BootstrapTopologySnapshotOwner};
