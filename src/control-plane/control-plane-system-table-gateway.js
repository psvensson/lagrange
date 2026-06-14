import {
  CONTROL_PLANE_GATEWAY_LIMIT,
  CONTROL_PLANE_OPERATION_LEDGER_LIMIT,
  ControlPlaneDiagnosticsLedger,
  NUM,
  TYPEOF,
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
      typeof options.getSqlQueryEngine === TYPEOF.FUNCTION ?
        options.getSqlQueryEngine :
        null;
    this.cdcIntegrationServiceProvider =
      typeof options.getCdcIntegrationService === TYPEOF.FUNCTION ?
        options.getCdcIntegrationService :
        null;
    this.systemTableCacheProvider =
      typeof options.getSystemTableCache === TYPEOF.FUNCTION ?
        options.getSystemTableCache :
        null;
    this.messageRouterProvider =
      typeof options.getMessageRouter === TYPEOF.FUNCTION ?
        options.getMessageRouter :
        null;
    this.controlPlaneReadinessServiceProvider =
      typeof options.getControlPlaneReadinessService === TYPEOF.FUNCTION ?
        options.getControlPlaneReadinessService :
        null;
    this.pressureGovernor = options.pressureGovernor || null;
    this.logger = options.logger || null;
    this.now =
      typeof options.now === TYPEOF.FUNCTION ? options.now : () => Date.now();
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
      readSingleFlightJoinCount: NUM.ZERO,
      querySingleFlightJoinCount: NUM.ZERO,
      mutationSingleFlightJoinCount: NUM.ZERO,
      readTrackingBypassCount: NUM.ZERO,
      queryTrackingBypassCount: NUM.ZERO,
      mutationReplacePendingQueuedCount: NUM.ZERO,
      mutationReplacePendingSupersededCount: NUM.ZERO,
      mutationTrackingRejectedCount: NUM.ZERO,
      authoritativeRowSourceUnavailableCount: NUM.ZERO,
      distributedParticipantFailureCount: NUM.ZERO,
      reconnectDeliveryFailureCount: NUM.ZERO,
      maxObservedInFlightReadRequests: NUM.ZERO,
      maxObservedInFlightQueryRequests: NUM.ZERO,
      maxObservedInFlightMutationRequests: NUM.ZERO,
      maxObservedPendingReplaceMutationRequests: NUM.ZERO,
      maxObservedRetainedRequestCount: NUM.ZERO,
      maxObservedReadLatencyMs: NUM.ZERO,
      maxObservedMutationLatencyMs: NUM.ZERO,
      maxObservedMutationQueueWaitMs: NUM.ZERO,
      maxObservedTransportPendingNodeConnectionCount: NUM.ZERO,
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
  if (gateway && typeof gateway.readAuthoritativeRows === TYPEOF.FUNCTION) {
    return gateway.readAuthoritativeRows(tableName, sql, params, options);
  }
  if (gateway && typeof gateway.executeRead === TYPEOF.FUNCTION) {
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
  if (gateway && typeof gateway.readProjectionRows === TYPEOF.FUNCTION) {
    return gateway.readProjectionRows(tableName, options);
  }
  if (gateway && typeof gateway.executeRead === TYPEOF.FUNCTION) {
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
