import {
  TYPEOF,
  buildAuthoritativeControlPlaneReadIntent,
  buildProjectionControlPlaneReadIntent,
  resolveControlPlaneMutationContractOutcome,
  resolveControlPlaneMutationOutcomeSnapshot,
} from './control-plane-system-table-gateway-shared.js';
import {
  ControlPlaneSystemTableGatewaySegment3,
} from './control-plane-system-table-gateway-segment-3.js';

class ControlPlaneSystemTableGateway extends ControlPlaneSystemTableGatewaySegment3 {
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
