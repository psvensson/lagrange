import {HTTP_STATUS} from '../../constants/index.js';
import {
  BOOTSTRAP_API_LIVENESS,
  BOOTSTRAP_API_PROBE_SCOPE,
  BOOTSTRAP_API_ROUTE,
} from '../bootstrap-api-constants.js';
import {LIFECYCLE_PHASE} from '../lifecycle-controller-constants.js';
import {applyBootstrapReadinessProbeDetailMethods} from './bootstrap-readiness-owner-probe-details.js';
import {assignBootstrapStartupAuthorityEvidenceMethods} from './bootstrap-startup-authority-evidence.js';
import {assignBootstrapJoinProjectionMethods} from './bootstrap-join-projection-policy.js';
import {assignBootstrapReadinessSnapshotEvaluatorMethods} from './bootstrap-readiness-snapshot-evaluator.js';
import {assignBootstrapControlPlaneRecoveryHealthMethods} from './bootstrap-control-plane-recovery-health.js';
import {assignBootstrapReadinessDependencyProbeMethods} from './bootstrap-readiness-dependency-probes.js';

class BootstrapReadinessOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.lastBootstrapJoinBlockedSignature = null;
    this.lastBootstrapJoinProjectionEvaluation = null;
  }
  getSeedNodeId() {
    return this.delegates.getSeedNodeId?.() || null;
  }
  getReadinessState() {
    return this.delegates.getReadinessState?.() || null;
  }
  getBootstrapService() {
    return this.delegates.getBootstrapService?.() || null;
  }
  getSeedContactDiagnosticsSnapshot() {
    const bootstrapService = this.getBootstrapService();
    const snapshot =
      bootstrapService?.getSeedContactDiagnosticsSnapshot?.() || null;
    return snapshot && typeof snapshot === 'object' ? snapshot : null;
  }
  getStartupRuntimeHandoffSnapshot() {
    const bootstrapService = this.getBootstrapService();
    const snapshot =
      bootstrapService?.getStartupRuntimeHandoffSnapshot?.() || null;
    return snapshot && typeof snapshot === 'object' ? snapshot : null;
  }
  getMessageRouter() {
    return this.delegates.getMessageRouter?.() || null;
  }
  getSqlQueryEngine() {
    return this.delegates.getSqlQueryEngine?.() || null;
  }
  getControlPlaneReadinessService() {
    return this.delegates.getControlPlaneReadinessService?.() || null;
  }
  getControlPlaneWriteHealthProvider() {
    return this.delegates.getControlPlaneWriteHealthProvider?.() || null;
  }
  getLeaderReadinessStatusForProbe() {
    return (
      this.delegates.getLeaderReadinessStatusForProbe?.() || {
        ready: false,
      }
    );
  }
  getStartupRecoveryCoordinator() {
    return this.delegates.getStartupRecoveryCoordinator?.() || null;
  }
  getLogger() {
    return this.delegates.getLogger?.() || null;
  }
  handleLivenessProbeRequest(reply) {
    const statusCode = HTTP_STATUS.OK;
    const response = {
      alive: BOOTSTRAP_API_LIVENESS.ALIVE,
      state: BOOTSTRAP_API_LIVENESS.STATE_RUNNING,
      nodeId: this.getSeedNodeId(),
      timestamp: Date.now(),
    };
    this.recordReadinessProbeResult(BOOTSTRAP_API_ROUTE.LIVEZ, statusCode);
    reply.code(statusCode);
    return response;
  }
  handleStartupProbeRequest(reply) {
    const snapshot = this.evaluateReadinessSnapshot();
    const started = this.isStartupComplete();
    const statusCode = started ?
      HTTP_STATUS.OK :
      HTTP_STATUS.SERVICE_UNAVAILABLE;
    const reasons = this.getStartupProbeReasons(snapshot, started);
    const response = {
      started,
      phase:
        typeof snapshot.phase === 'string' ?
          snapshot.phase :
          LIFECYCLE_PHASE.INIT,
      state: snapshot.state,
      reasons,
      timestamp: snapshot.timestamp,
    };
    if (!started) {
      response.retryAfterMs = snapshot.retryAfterMs;
    }
    this.appendReadinessProgressFields(response, snapshot);
    this.appendSeedContactDiagnostics(response);
    this.appendStartupRuntimeHandoffFields(response);
    this.recordReadinessProbeResult(BOOTSTRAP_API_ROUTE.STARTUPZ, statusCode);
    reply.code(statusCode);
    return response;
  }
  async handleReadinessProbeRequest(reply) {
    const snapshot = await this.evaluateReadinessSnapshotForProbe();
    const statusCode = snapshot.ready ?
      HTTP_STATUS.OK :
      HTTP_STATUS.SERVICE_UNAVAILABLE;
    const response = this.buildReadinessProbeResponse(snapshot);
    this.recordReadinessProbeResult(BOOTSTRAP_API_ROUTE.READYZ, statusCode);
    reply.code(statusCode);
    return response;
  }
  async handleBootstrapReadinessProbeRequest(reply) {
    const snapshot = this.resolveReadinessSnapshotForScope(
      await this.evaluateReadinessSnapshotForProbe(),
      BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN,
    );
    const statusCode = snapshot.ready ?
      HTTP_STATUS.OK :
      HTTP_STATUS.SERVICE_UNAVAILABLE;
    const response = this.buildReadinessProbeResponse(snapshot, {
      scope: BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN,
    });
    this.logBootstrapJoinReadinessProjection(snapshot, response);
    this.recordReadinessProbeResult(
      BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY,
      statusCode,
    );
    reply.code(statusCode);
    return response;
  }
}

applyBootstrapReadinessProbeDetailMethods(BootstrapReadinessOwner);
assignBootstrapStartupAuthorityEvidenceMethods(BootstrapReadinessOwner);
assignBootstrapJoinProjectionMethods(BootstrapReadinessOwner);
assignBootstrapReadinessSnapshotEvaluatorMethods(BootstrapReadinessOwner);
assignBootstrapControlPlaneRecoveryHealthMethods(BootstrapReadinessOwner);
assignBootstrapReadinessDependencyProbeMethods(BootstrapReadinessOwner);

export {BootstrapReadinessOwner};

// Coordinates query engine readiness diagnostics for distributed bootstrap.
