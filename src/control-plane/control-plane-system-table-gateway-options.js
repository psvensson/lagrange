import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  NUM,
  TYPEOF,
  applyMutationWorkloadProfileDefaults,
  buildControlPlaneQueryOptions,
  copyOption,
  getRemainingBudgetMs,
  resolveControlPlaneSystemTableDeliverySource,
} from './control-plane-system-table-gateway-shared.js';

/**
 * @param {Object} gateway
 * @param {Object} [options={}]
 * @param {Object} [context={}]
 * @return {Object}
 */
function buildGatewayQueryOptions(gateway, options = {}, context = {}) {
  const requestedTimeoutMs = Number.isFinite(options?.timeoutMs) ?
    options.timeoutMs :
    Number.isFinite(options?.queryTimeoutMs) ?
      options.queryTimeoutMs :
      options?.requestedTimeoutMs;
  const deliverySource = resolveControlPlaneSystemTableDeliverySource({
    deliverySource: options?.deliverySource,
    tableName: context?.tableName || null,
    sql: context?.sql || null,
    operationKind: context?.operationKind || null,
    coalescingKey: options?.coalescingKey || null,
  });
  let queryOptions = {
    ...buildControlPlaneQueryOptions({
      requestedTimeoutMs,
      timeoutBudget: options?.timeoutBudget,
      now: gateway.now,
    }),
    routingReadinessDimension:
      options?.routingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  };
  if (
    typeof options?.sessionId === TYPEOF.STRING &&
    options.sessionId.length > CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ZERO
  ) {
    queryOptions.sessionId = options.sessionId;
  }
  if (options?.cancellationToken) {
    queryOptions.cancellationToken = options.cancellationToken;
  }
  if (typeof options?.preferLeader === TYPEOF.BOOLEAN) {
    queryOptions.preferLeader = options.preferLeader;
  }
  queryOptions = copyOption(
    queryOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYPRIORITY,
  );
  if (typeof deliverySource === TYPEOF.STRING &&
    deliverySource.length > CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ZERO) {
    queryOptions[CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYSOURCE] =
      deliverySource;
  }
  return queryOptions;
}

/**
 * @param {Object} gateway
 * @param {Object} [options={}]
 * @param {Object} [context={}]
 * @return {Object}
 */
function buildGatewayWriteOptions(gateway, options = {}, context = {}) {
  const deliverySource = resolveControlPlaneSystemTableDeliverySource({
    deliverySource: options?.deliverySource,
    tableName: context?.tableName || null,
    operationKind: context?.operationKind || null,
    coalescingKey: options?.coalescingKey || null,
  });
  let writeOptions = {
    routingReadinessDimension:
      options?.routingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  };
  const queryTimeoutMs = Number.isFinite(options?.queryTimeoutMs) ?
    options.queryTimeoutMs :
    options?.timeoutMs;
  if (Number.isFinite(queryTimeoutMs)) {
    writeOptions.queryTimeoutMs = queryTimeoutMs;
  } else if (
    options?.timeoutBudget &&
    typeof options.timeoutBudget === TYPEOF.OBJECT
  ) {
    const remainingBudgetMs = getRemainingBudgetMs(options.timeoutBudget, {
      now: gateway.now,
    });
    if (remainingBudgetMs > NUM.ZERO) {
      writeOptions.queryTimeoutMs = Math.max(
        NUM.ONE,
        Math.floor(remainingBudgetMs),
      );
    }
  }
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CANCELLATIONTOKEN,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.TIMEOUTBUDGET,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SKIPCACHEWAIT,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWPENDINGVISIBILITY,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.EXPECTEDCACHEFIELDS,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MINIMUMCACHEFIELDS,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.FALLBACKPHASE,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DISABLESYSTEMWRITESESSION,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SESSIONID,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYPRIORITY,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.WORKCLASS,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.WORKLOADCLASS,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.IGNOREEXISTING,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWPRESSUREDEFER,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PRESSURERETRYAFTERMS,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.RESOURCEKEYS,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.COALESCINGKEY,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWCOALESCING,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MERGEPOLICY,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PHASESCOPE,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.RECOVERYCANDIDATESELECTIONKEY,
  );
  writeOptions = copyOption(
    writeOptions,
    options,
    CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REPLACEPENDINGKEY,
  );
  writeOptions = applyMutationWorkloadProfileDefaults(writeOptions, options);
  if (typeof deliverySource === TYPEOF.STRING &&
    deliverySource.length > CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ZERO) {
    writeOptions[CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYSOURCE] =
      deliverySource;
  }
  return writeOptions;
}

export {
  buildGatewayQueryOptions,
  buildGatewayWriteOptions,
};
