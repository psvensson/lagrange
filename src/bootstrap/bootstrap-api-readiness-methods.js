import {
  BOOTSTRAP_API_PROBE_SCOPE,
} from './bootstrap-api-constants.js';
import {installBootstrapApiMethods} from './bootstrap-api-method-installer.js';

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
   * Evaluate readiness owner after updating dependency signals.
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
    try {
      if (typeof service.getStartupAuthoritySnapshotSync === 'function') {
        return service.getStartupAuthoritySnapshotSync(
          this.seedNodeId,
          observedAt,
        );
      }
      if (typeof service.getStartupAuthoritySnapshot !== 'function') {
        return null;
      }
      const startupAuthority = service.getStartupAuthoritySnapshot(
        this.seedNodeId,
        observedAt,
      );
      if (
        startupAuthority &&
        typeof startupAuthority.then === 'function'
      ) {
        return null;
      }
      return startupAuthority && typeof startupAuthority === 'object' ?
        startupAuthority :
        null;
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
    return this.serviceLeaderReadinessOwner
      .getLeaderReadinessStatusForProbe();
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
      await this.bootstrapReadinessOwner.evaluateReadinessSnapshotForProbe(),
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
