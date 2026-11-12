import {
  BOOTSTRAP_API_PROBE_SCOPE,
} from './bootstrap-api-constants.js';
import {installBootstrapApiMethods} from './bootstrap-api-method-installer.js';
import {TABLES} from '../constants/index.js';
import {ReadOnlySystemTableCache} from '../cache/read-only-system-table-cache.js';
import {SystemTableCache} from '../cache/system-table-cache.js';

// The leader-readiness status is a pure function of these cache tables
// (leader-readiness-gate.js reads no other source), and every lifecycle
// evaluation reads it. One status per table content: the cache's mutation
// versions prove that no apply landed since the status was computed.
const LEADER_READINESS_SOURCE_TABLES = Object.freeze([
  TABLES.PARTITIONS,
  TABLES.MESSAGE_GROUPS,
  TABLES.SERVICES,
]);
const MISSING_SERVICE_LEADERS_METHOD = 'getMissingServiceLeaders';

/**
 * The identity of the leader-readiness source content, or null when the
 * content has no version to compare: a cache that is not the system table
 * cache (a test double states no mutation versions), or an instance whose
 * missing-leader read was replaced (the status then no longer derives from
 * the cache tables alone).
 * @param {Object} api
 * @return {{cache: Object, versions: Array<number>}|null}
 */
function readLeaderReadinessSourceIdentity(api) {
  const cache = api.getSystemTableCache();
  const versioned = cache instanceof ReadOnlySystemTableCache ||
    cache instanceof SystemTableCache;
  if (!versioned || Object.hasOwn(api, MISSING_SERVICE_LEADERS_METHOD)) {
    return null;
  }
  return {
    cache,
    versions: LEADER_READINESS_SOURCE_TABLES.map((tableName) =>
      cache.getTableMutationVersion(tableName)),
  };
}

function isSameLeaderReadinessSource(memo, identity) {
  return memo.cache === identity.cache &&
    memo.versions.every((version, index) =>
      version === identity.versions[index]);
}

const bootstrapApiReadinessMethods = {
  /**
   * Handle process liveness probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleLivenessProbeRequest(reply) {
    return this.bootstrapReadinessOwner
      .handleLivenessProbeRequest(reply);
  },

  /**
   * Handle startup completion probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleStartupProbeRequest(reply) {
    return this.bootstrapReadinessOwner
      .handleStartupProbeRequest(reply);
  },

  /**
   * Handle general readiness probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleReadinessProbeRequest(reply) {
    return this.bootstrapReadinessOwner
      .handleReadinessProbeRequest(reply);
  },

  /**
   * Handle lightweight bootstrap-join readiness probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleBootstrapReadinessProbeRequest(reply) {
    return this.bootstrapReadinessOwner
      .handleBootstrapReadinessProbeRequest(reply);
  },

  /**
   * Resolve readiness projection for one probe scope.
   * @param {Object} snapshot
   * @param {string} scope
   * @return {Object}
   */
  resolveReadinessSnapshotForScope(snapshot, scope) {
    return this.bootstrapReadinessOwner
      .resolveReadinessSnapshotForScope(snapshot, scope);
  },

  /**
   * Determine whether bootstrap join scope can project ready=true.
   * @param {Object} snapshot
   * @param {Array<string>} reasons
   * @param {Array<string>} blockingReasons
   * @return {boolean}
   */
  canProjectBootstrapJoinReadiness(snapshot, reasons, blockingReasons) {
    return this.bootstrapReadinessOwner
      .canProjectBootstrapJoinReadiness(
        snapshot,
        reasons,
        blockingReasons,
      );
  },

  /**
   * Build canonical readiness probe response body.
   * @param {Object} snapshot - Current readiness snapshot.
   * @param {Object} options
   * @param {string} [options.scope] - Optional readiness scope.
   * @return {Object}
   */
  buildReadinessProbeResponse(snapshot, options = {}) {
    return this.bootstrapReadinessOwner
      .buildReadinessProbeResponse(snapshot, options);
  },

  /**
   * Evaluate the lifecycle and describe it with the startup authority. A
   * read: the lifecycle derives its dependencies from their owners.
   * @return {Object} Current readiness snapshot.
   */
  evaluateReadinessSnapshot() {
    return this.bootstrapReadinessOwner
      .evaluateReadinessSnapshot();
  },

  /**
   * Resolve health status of background control-plane writers.
   * @return {{healthy: boolean, reasonCode: string, details: Object|null}}
   */
  getControlPlaneWriteHealth() {
    return this.bootstrapReadinessOwner
      .getControlPlaneWriteHealth();
  },

  /**
   * Resolve the current control-plane readiness service.
   * @return {Object|null}
   */
  getControlPlaneReadinessService() {
    return this.controlPlaneReadinessService ||
      this.runtimeOwner?.controlPlaneReadinessService ||
      this.bootstrapStartupAdapter?.rebalanceCoordinator
        ?.controlPlaneReadinessService ||
      this.bootstrapStartupAdapter?.controlPlaneReadinessService ||
      null;
  },

  /**
   * Resolve the seed-owned startup authority snapshot advertised to joiners.
   * @param {number} [observedAt=Date.now()]
   * @return {Object|null}
   */
  getStartupAuthoritySnapshotForBootstrapResponse(observedAt = Date.now()) {
    const service = this.getControlPlaneReadinessService();
    if (!service || typeof service !== 'object') {
      return null;
    }
    // The bootstrap response is built synchronously: only the service's
    // synchronous read can answer it (its async read always answers a
    // promise, which this response cannot wait for).
    if (typeof service.getStartupAuthoritySnapshotSync !== 'function') {
      return null;
    }
    try {
      return service.getStartupAuthoritySnapshotSync(
        this.seedNodeId,
        observedAt,
      );
    } catch (_error) {
      return null;
    }
  },

  /**
   * Build startup-probe reasons from readiness snapshot.
   * @param {Object} snapshot
   * @param {boolean} started
   * @return {string[]}
   */
  getStartupProbeReasons(snapshot, started) {
    return this.bootstrapReadinessOwner
      .getStartupProbeReasons(snapshot, started);
  },

  /**
   * Determine whether startup bootstrap has completed.
   * @return {boolean}
   */
  isStartupComplete() {
    return this.bootstrapReadinessOwner
      .isStartupComplete();
  },

  /**
   * Determine whether runtime wiring is available for join-safe traffic.
   * @return {boolean}
   */
  isRuntimeWiringReady() {
    return this.bootstrapReadinessOwner
      .isRuntimeWiringReady();
  },

  /**
   * Determine whether SQL dependency is available for bootstrap operations.
   * @return {boolean}
   */
  isSqlEngineDependencyReady() {
    return this.bootstrapReadinessOwner
      .isSqlEngineDependencyReady();
  },

  /**
   * Build current leader-readiness status for probe projection.
   * @return {Object}
   */
  getLeaderReadinessStatusForProbe() {
    const identity = readLeaderReadinessSourceIdentity(this);
    if (identity === null) {
      return this.serviceLeaderReadinessOwner
        .getLeaderReadinessStatusForProbe();
    }
    const memo = this.leaderReadinessStatusMemo;
    if (memo && isSameLeaderReadinessSource(memo, identity)) {
      return memo.status;
    }
    const status = this.serviceLeaderReadinessOwner
      .getLeaderReadinessStatusForProbe();
    this.leaderReadinessStatusMemo = {...identity, status};
    return status;
  },

  /**
   * Record one probe response in readiness metrics when owner supports it.
   * @param {string} endpoint
   * @param {number} statusCode
   */
  recordReadinessProbeResult(endpoint, statusCode) {
    return this.bootstrapReadinessOwner
      .recordReadinessProbeResult(endpoint, statusCode);
  },

  /**
   * Mark lifecycle readiness as draining and immediately non-ready.
   * @param {Object} [options]
   * @param {number} [options.drainDeadlineMs]
   * @param {string} [options.reasonCode]
   * @return {Object}
   */
  markDraining(options = {}) {
    return this.bootstrapReadinessOwner
      .markDraining(options);
  },

  /**
   * Build standardized not-ready payload for POST /bootstrap responses.
   * Keeps compatibility fields while adding retry guidance.
   * @param {Object} options
   * @param {string} options.error
   * @param {string} options.code
   * @param {string} [options.phase]
   * @param {string} [options.reasonCode]
   * @return {Object}
   */
  buildBootstrapNotReadyResponse(options = {}) {
    return this.bootstrapReadinessOwner
      .buildBootstrapNotReadyResponse(options);
  },

  /**
   * Build one projected bootstrap-join admission snapshot for request gating.
   * @return {Promise<Object>}
   */
  async getBootstrapJoinAdmissionSnapshot() {
    return this.resolveReadinessSnapshotForScope(
      this.bootstrapReadinessOwner.evaluateReadinessSnapshot(),
      BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN,
    );
  },

  /**
   * Return best-effort readiness snapshot for operation diagnostics.
   * @return {Object}
   */
  getReadinessSnapshotForDiagnostics() {
    return this.bootstrapReadinessOwner
      .getReadinessSnapshotForDiagnostics();
  },

  /**
   * Merge readiness reasons with one required reason code.
   * @param {Array<string>} reasons
   * @param {string} reasonCode
   * @return {Array<string>}
   */
  mergeReadinessReasons(reasons, reasonCode) {
    return this.bootstrapReadinessOwner
      .mergeReadinessReasons(reasons, reasonCode);
  },
};

function installBootstrapApiReadinessMethods(BootstrapAPI) {
  installBootstrapApiMethods(BootstrapAPI, bootstrapApiReadinessMethods);
}

export {installBootstrapApiReadinessMethods};
