import {NUM, TYPEOF} from '../../constants/index.js';
import {BOOTSTRAP_PHASE} from '../bootstrap-constants.js';
import {
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_RESPONSE_FIELD,
} from '../bootstrap-api-constants.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../lifecycle-controller-constants.js';
import {
  getLocalQueryTransportReadiness,
} from '../shared/local-query-transport-readiness.js';
import {BOOTSTRAP_READINESS_OWNER_LITERAL} from './bootstrap-readiness-owner-literals.js';

const BOOTSTRAP_READINESS_DEPENDENCY_PROBE_METHODS = Object.freeze({
  getStartupProbeReasons(snapshot, started) {
    if (started) {
      return [];
    }
    const reasons = Array.isArray(snapshot?.reasons) ?
      [...snapshot.reasons] :
      [];
    if (
      !reasons.includes(BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE)
    ) {
      reasons.unshift(BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE);
    }
    return reasons;
  },
  isStartupComplete() {
    const bootstrapService = this.getBootstrapService();
    if (!bootstrapService) {
      return true;
    }
    if (
      typeof bootstrapService.isBootstrapStartupComplete === TYPEOF.FUNCTION
    ) {
      return bootstrapService.isBootstrapStartupComplete();
    }
    return bootstrapService.phase === BOOTSTRAP_PHASE.COMPLETE;
  },
  isRuntimeWiringReady() {
    const bootstrapService = this.getBootstrapService();
    if (!bootstrapService) {
      return true;
    }
    return Boolean(this.getMessageRouter() || bootstrapService?.messageRouter);
  },
  shouldRequireLocalQueryTransportReadiness() {
    const bootstrapService = this.getBootstrapService();
    const messageRouter =
      this.getMessageRouter() || bootstrapService?.messageRouter || null;
    return (
      typeof messageRouter?.getQueryDataPlaneTransportReadiness ===
      TYPEOF.FUNCTION
    );
  },
  getLocalQueryTransportReadiness() {
    const bootstrapService = this.getBootstrapService();
    return getLocalQueryTransportReadiness(
      this.getMessageRouter() || bootstrapService?.messageRouter || null,
    );
  },
  isSqlEngineDependencyReady() {
    if (!this.getBootstrapService()) {
      return true;
    }
    return Boolean(this.getSqlQueryEngine());
  },
  recordReadinessProbeResult(endpoint, statusCode) {
    const readinessState = this.getReadinessState();
    if (typeof readinessState?.recordProbeResult !== TYPEOF.FUNCTION) {
      return;
    }
    readinessState.recordProbeResult(endpoint, statusCode);
  },
  markDraining(options = {}) {
    const readinessState = this.getReadinessState();
    if (typeof readinessState?.beginDrain === TYPEOF.FUNCTION) {
      return readinessState.beginDrain({
        drainDeadlineMs: options.drainDeadlineMs,
        reasonCode: options.reasonCode || LIFECYCLE_REASON.NODE_DRAINING,
      });
    }
    if (typeof readinessState?.transitionTo === TYPEOF.FUNCTION) {
      return readinessState.transitionTo(
        BOOTSTRAP_READINESS_OWNER_LITERAL.DEGRADED_2,
        {
          ready: false,
          reasons: [options.reasonCode || LIFECYCLE_REASON.NODE_DRAINING],
        },
      );
    }
    return this.getReadinessSnapshotForDiagnostics();
  },
  buildBootstrapNotReadyResponse(options = {}) {
    const snapshot = this.getReadinessSnapshotForDiagnostics();
    const reasons = this.mergeReadinessReasons(
      snapshot.reasons,
      options.reasonCode,
    );
    const response = {
      success: false,
      error: options.error,
      code: options.code,
      reasons,
      retryAfterMs: Number.isFinite(options.retryAfterMs) ?
        Math.max(NUM.ZERO, Math.floor(options.retryAfterMs)) :
        Number.isFinite(snapshot.retryAfterMs) ?
          snapshot.retryAfterMs :
          NUM.ZERO,
    };
    if (
      typeof options.phase === TYPEOF.STRING &&
      options.phase.length > NUM.ZERO
    ) {
      response.phase = options.phase;
    }
    if (
      options.startupAuthority &&
      typeof options.startupAuthority === TYPEOF.OBJECT
    ) {
      response[BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY] =
        options.startupAuthority;
    }
    if (
      typeof snapshot.state === TYPEOF.STRING &&
      snapshot.state.length > NUM.ZERO
    ) {
      response.state = snapshot.state;
    }
    if (
      options.leaderReadiness &&
      typeof options.leaderReadiness === TYPEOF.OBJECT
    ) {
      response.leaderReadiness = {
        ...options.leaderReadiness,
      };
      for (const field of [
        BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGPARTITIONLEADERS,
        BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGPARTITIONLEADERNODES,
        BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGPARTITIONLEADERADDRESSES,
        BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGMESSAGEGROUPLEADERS,
        BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGMESSAGEGROUPLEADERNODES,
        BOOTSTRAP_READINESS_OWNER_LITERAL.MISSINGMESSAGEGROUPLEADERADDRESSES,
      ]) {
        if (!Array.isArray(options.leaderReadiness[field])) {
          continue;
        }
        response[field] = [...options.leaderReadiness[field]];
      }
    }
    if (snapshot?.progressContract || options?.progressContract) {
      response.progressContract = snapshot?.progressContract || options?.progressContract;
    }
    return response;
  },
  getReadinessSnapshotForDiagnostics() {
    const readinessState = this.getReadinessState();
    try {
      return this.evaluateReadinessSnapshot();
    } catch (_error) {
      const fallbackSnapshot =
        typeof readinessState?.getSnapshot === TYPEOF.FUNCTION ?
          readinessState.getSnapshot() :
          null;
      if (fallbackSnapshot) {
        return fallbackSnapshot;
      }
      return {
        ready: false,
        phase: LIFECYCLE_PHASE.INIT,
        state: BOOTSTRAP_PHASE.NOT_STARTED,
        reasons: [],
        retryAfterMs: NUM.ZERO,
        timestamp: Date.now(),
      };
    }
  },
  mergeReadinessReasons(reasons, reasonCode) {
    const merged = Array.isArray(reasons) ? [...reasons] : [];
    if (typeof reasonCode !== TYPEOF.STRING || reasonCode.length === NUM.ZERO) {
      return merged;
    }
    if (!merged.includes(reasonCode)) {
      merged.push(reasonCode);
    }
    return merged;
  },
});

function assignBootstrapReadinessDependencyProbeMethods(ownerClass) {
  Object.defineProperties(
    ownerClass.prototype,
    Object.fromEntries(
      Object.entries(BOOTSTRAP_READINESS_DEPENDENCY_PROBE_METHODS).map(
        ([name, value]) => [
          name,
          {
            configurable: true,
            value,
            writable: true,
          },
        ],
      ),
    ),
  );
}

export {assignBootstrapReadinessDependencyProbeMethods};
