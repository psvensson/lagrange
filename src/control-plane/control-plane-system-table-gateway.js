import {
  CONTROL_PLANE_GATEWAY_LIMIT,
  CONTROL_PLANE_OPERATION_LEDGER_LIMIT,
  ControlPlaneDiagnosticsLedger,
  buildAuthoritativeControlPlaneReadIntent,
  buildProjectionControlPlaneReadIntent,
  normalizePositiveInteger,
  resolveControlPlaneMutationContractOutcome,
  resolveControlPlaneMutationOutcomeSnapshot,
} from './control-plane-system-table-gateway-shared.js';
import {
  assignControlPlaneSystemTableGatewayDependencyResolution,
} from './control-plane-system-table-gateway-dependency-resolution.js';
import {
  assignControlPlaneSystemTableGatewayCacheReconciliation,
} from './control-plane-system-table-gateway-cache-reconciliation.js';
import {
  assignControlPlaneSystemTableGatewayCapabilityDiagnostics,
} from './control-plane-system-table-gateway-capability-diagnostics.js';
import {
  assignControlPlaneSystemTableGatewayRetentionMetrics,
} from './control-plane-system-table-gateway-retention-metrics.js';
import {
  assignControlPlaneSystemTableGatewayTelemetry,
} from './control-plane-system-table-gateway-telemetry.js';
import {
  assignControlPlaneSystemTableGatewayRequestCoalescing,
} from './control-plane-system-table-gateway-request-coalescing.js';
import {
  assignControlPlaneSystemTableGatewayQueryExecution,
} from './control-plane-system-table-gateway-query-execution.js';
import {
  assignControlPlaneSystemTableGatewayReadDispatch,
} from './control-plane-system-table-gateway-read-dispatch.js';
import {
  assignControlPlaneSystemTableGatewayReadStrategies,
} from './control-plane-system-table-gateway-read-strategies.js';
import {
  assignControlPlaneSystemTableGatewayMutationSubmission,
} from './control-plane-system-table-gateway-mutation-submission.js';

class ControlPlaneSystemTableGateway {
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this._sqlQueryEngine = options.sqlQueryEngine || null;
    this._cdcIntegrationService = options.cdcIntegrationService || null;
    this._systemTableCache = options.systemTableCache || null;
    this._messageRouter = options.messageRouter || null;
    this._controlPlaneReadinessService =
      options.controlPlaneReadinessService || null;
    this.sqlQueryEngineProvider =
      typeof options.getSqlQueryEngine === 'function' ?
        options.getSqlQueryEngine :
        null;
    this.cdcIntegrationServiceProvider =
      typeof options.getCdcIntegrationService === 'function' ?
        options.getCdcIntegrationService :
        null;
    this.systemTableCacheProvider =
      typeof options.getSystemTableCache === 'function' ?
        options.getSystemTableCache :
        null;
    this.messageRouterProvider =
      typeof options.getMessageRouter === 'function' ?
        options.getMessageRouter :
        null;
    this.controlPlaneReadinessServiceProvider =
      typeof options.getControlPlaneReadinessService === 'function' ?
        options.getControlPlaneReadinessService :
        null;
    this.pressureGovernor = options.pressureGovernor || null;
    this.logger = options.logger || null;
    this.now =
      typeof options.now === 'function' ? options.now : () => Date.now();
    this.controlPlaneOperationLedger =
      options.controlPlaneOperationLedger ||
      new ControlPlaneDiagnosticsLedger({
        maxEntries: normalizePositiveInteger(
          options.controlPlaneOperationLedgerMaxEntries,
          CONTROL_PLANE_OPERATION_LEDGER_LIMIT,
        ),
        now: this.now,
      });
    this.inFlightReadRequestsByKey = new Map();
    this.inFlightQueryRequestsByKey = new Map();
    this.inFlightMutationRequestsByKey = new Map();
    this.pendingReplaceMutationRequestsByKey = new Map();
    this.gatewayLimits = Object.freeze({
      maxTrackedReadRequests: normalizePositiveInteger(
        options.maxTrackedReadRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_READ_REQUESTS,
      ),
      maxTrackedQueryRequests: normalizePositiveInteger(
        options.maxTrackedQueryRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_QUERY_REQUESTS,
      ),
      maxTrackedMutationRequests: normalizePositiveInteger(
        options.maxTrackedMutationRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_MUTATION_REQUESTS,
      ),
      maxPendingReplaceMutationRequests: normalizePositiveInteger(
        options.maxPendingReplaceMutationRequests,
        CONTROL_PLANE_GATEWAY_LIMIT.MAX_PENDING_REPLACE_MUTATION_REQUESTS,
      ),
    });
    this.gatewayMetrics = {
      readSingleFlightJoinCount: 0,
      querySingleFlightJoinCount: 0,
      mutationSingleFlightJoinCount: 0,
      readTrackingBypassCount: 0,
      queryTrackingBypassCount: 0,
      mutationReplacePendingQueuedCount: 0,
      mutationReplacePendingSupersededCount: 0,
      mutationTrackingRejectedCount: 0,
      authoritativeRowSourceUnavailableCount: 0,
      distributedParticipantFailureCount: 0,
      reconnectDeliveryFailureCount: 0,
      maxObservedInFlightReadRequests: 0,
      maxObservedInFlightQueryRequests: 0,
      maxObservedInFlightMutationRequests: 0,
      maxObservedPendingReplaceMutationRequests: 0,
      maxObservedRetainedRequestCount: 0,
      maxObservedReadLatencyMs: 0,
      maxObservedMutationLatencyMs: 0,
      maxObservedMutationQueueWaitMs: 0,
      maxObservedTransportPendingNodeConnectionCount: 0,
      readOutcomeCounts: Object.create(null),
      mutationOutcomeCounts: Object.create(null),
      mutationFailureReasonCounts: Object.create(null),
    };
    this.lastRetentionMetricSignature = null;
    this.recordGatewayRetentionSnapshot();
  }

  normalizeMutationResult(result) {
    const normalizedState = resolveControlPlaneMutationOutcomeSnapshot(result);
    const contractOutcome =
      resolveControlPlaneMutationContractOutcome(
        result,
        normalizedState.outcome,
      );
    return {
      ...result,
      outcome: normalizedState.outcome,
      completionState: normalizedState.completionState,
      contractState: contractOutcome.contractState,
      nextAction: contractOutcome.nextAction,
    };
  }
}

assignControlPlaneSystemTableGatewayDependencyResolution(
  ControlPlaneSystemTableGateway,
);
assignControlPlaneSystemTableGatewayCacheReconciliation(
  ControlPlaneSystemTableGateway,
);
assignControlPlaneSystemTableGatewayCapabilityDiagnostics(
  ControlPlaneSystemTableGateway,
);
assignControlPlaneSystemTableGatewayRetentionMetrics(
  ControlPlaneSystemTableGateway,
);
assignControlPlaneSystemTableGatewayTelemetry(
  ControlPlaneSystemTableGateway,
);
assignControlPlaneSystemTableGatewayRequestCoalescing(
  ControlPlaneSystemTableGateway,
);
assignControlPlaneSystemTableGatewayQueryExecution(
  ControlPlaneSystemTableGateway,
);
assignControlPlaneSystemTableGatewayReadDispatch(
  ControlPlaneSystemTableGateway,
);
assignControlPlaneSystemTableGatewayReadStrategies(
  ControlPlaneSystemTableGateway,
);
assignControlPlaneSystemTableGatewayMutationSubmission(
  ControlPlaneSystemTableGateway,
);

async function readAuthoritativeControlPlaneRows(
  gateway,
  tableName,
  sql,
  params = [],
  options = {},
) {
  if (gateway && typeof gateway.readAuthoritativeRows === 'function') {
    return gateway.readAuthoritativeRows(tableName, sql, params, options);
  }
  if (gateway && typeof gateway.executeRead === 'function') {
    return gateway.executeRead(
      buildAuthoritativeControlPlaneReadIntent(tableName, sql, params, options),
      options,
    );
  }
  return gateway.readRows(tableName, sql, params, options);
}

async function readProjectionControlPlaneRows(
  gateway,
  tableName,
  options = {},
) {
  if (gateway && typeof gateway.readProjectionRows === 'function') {
    return gateway.readProjectionRows(tableName, options);
  }
  if (gateway && typeof gateway.executeRead === 'function') {
    return gateway.executeRead(
      buildProjectionControlPlaneReadIntent(tableName, options),
      options,
    );
  }
  return gateway.readRows(
    tableName,
    options?.sql || null,
    options?.params || [],
    options,
  );
}
export {
  ControlPlaneSystemTableGateway,
  readAuthoritativeControlPlaneRows,
  readProjectionControlPlaneRows,
};
export {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_CACHE_RECONCILE_INTENT,
  CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_PHASE_SCOPE,
  CONTROL_PLANE_READ_OUTCOME,
  CONTROL_PLANE_READ_PROFILE,
  CONTROL_PLANE_READ_STRATEGY,
  CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
  resolveAuthoritativeReadModeContract,
  resolveControlPlaneSystemTableDeliverySource,
  resolveReadProfileOptions,
} from './control-plane-system-table-gateway-shared.js';
