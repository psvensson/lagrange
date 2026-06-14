import {
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  GATEWAY_ERROR_MSG,
  NUM,
  TYPEOF,
  buildControlPlaneMutationIntent,
  canonicalizeControlPlaneMutation,
  normalizeCoalescingToken,
  normalizeMutationOperation,
  normalizeSystemTableName,
} from './control-plane-system-table-gateway-shared.js';
import {
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';

const LOCAL_STR_1IXG4 = 'mutationSingleFlightJoinCount';
const GATEWAY_REPLICA_OPERATION_ID_FIELD = 'operation_id';
const GATEWAY_REPLICA_OPERATION_COALESCING_KEY_PREFIX =
  'replica-operation';
const GATEWAY_REPLICA_OPERATION_COALESCING_KEY_SEPARATOR = ':';

function normalizeGatewayReplicaOperationMutationId(value) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    null;
}

function buildGatewayReplicaOperationMutationCoalescingKey(operationId) {
  const normalizedOperationId =
    normalizeGatewayReplicaOperationMutationId(operationId);
  if (!normalizedOperationId) {
    return null;
  }
  return [
    GATEWAY_REPLICA_OPERATION_COALESCING_KEY_PREFIX,
    normalizedOperationId,
  ].join(GATEWAY_REPLICA_OPERATION_COALESCING_KEY_SEPARATOR);
}

function resolveGatewayReplicaOperationMutationId(mutation = {}) {
  const candidateIds = [
    mutation?.row?.[GATEWAY_REPLICA_OPERATION_ID_FIELD],
    mutation?.whereClause?.[GATEWAY_REPLICA_OPERATION_ID_FIELD],
    mutation?.data?.[GATEWAY_REPLICA_OPERATION_ID_FIELD],
  ];
  const operationId = candidateIds.find((candidate) => {
    return normalizeGatewayReplicaOperationMutationId(candidate);
  });
  return normalizeGatewayReplicaOperationMutationId(operationId);
}

function applyReplicaOperationMutationCoalescingFallback(
  tableName,
  mutation,
  options = {},
) {
  if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
    return options;
  }
  if (
    typeof options?.coalescingKey === TYPEOF.STRING &&
    options.coalescingKey.length > NUM.ZERO
  ) {
    return options;
  }
  const coalescingKey = buildGatewayReplicaOperationMutationCoalescingKey(
    resolveGatewayReplicaOperationMutationId(mutation),
  );
  if (!coalescingKey) {
    return options;
  }
  return {
    ...options,
    coalescingKey,
    replacePendingKey: coalescingKey,
  };
}

const controlPlaneSystemTableGatewayMutationSubmissionMethods = {
  /**
   * @param {string} tableName
   * @param {Object} row
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async insertSystemTableRow(tableName, row, options = {}) {
    return this.submitMutation(
      buildControlPlaneMutationIntent(
        CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName,
        {row},
      ),
      options,
    );
  },

  /**
   * @param {string} tableName
   * @param {Object} whereClause
   * @param {Object} data
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async updateSystemTableRow(tableName, whereClause, data, options = {}) {
    return this.submitMutation(
      buildControlPlaneMutationIntent(
        CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName,
        {whereClause, data},
      ),
      options,
    );
  },

  /**
   * @param {string} tableName
   * @param {Object} row
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async upsertSystemTableRow(tableName, row, options = {}) {
    return this.submitMutation(
      buildControlPlaneMutationIntent(
        CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
        tableName,
        {row},
      ),
      options,
    );
  },

  /**
   * @param {string} tableName
   * @param {Object} whereClause
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async deleteSystemTableRow(tableName, whereClause, options = {}) {
    return this.submitMutation(
      buildControlPlaneMutationIntent(
        CONTROL_PLANE_MUTATION_OPERATION.DELETE,
        tableName,
        {whereClause},
      ),
      options,
    );
  },

  /**
   * Canonical control-plane mutation ingress for system-table writes.
   * System-table insert/update/upsert/delete helpers delegate here so write
   * admission, routing, and backpressure policy stay on one path.
   *
   * @param {Object} mutation
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async submitMutation(mutation = {}, options = {}) {
    const operation = normalizeMutationOperation(mutation?.operation);
    const tableName = normalizeSystemTableName(mutation?.tableName);
    if (!operation) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_OPERATION_REQUIRED);
    }
    if (!tableName) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_TABLE_REQUIRED);
    }
    const normalizedMutation = canonicalizeControlPlaneMutation(
      mutation,
      operation,
      tableName,
    );
    const mutationOptions = applyReplicaOperationMutationCoalescingFallback(
      tableName,
      normalizedMutation,
      options,
    );
    let writeOptions = this.buildWriteOptions(mutationOptions, {
      tableName,
      operationKind: operation,
    });
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    const {requestKey, mergePolicy} = this.buildMutationCoalescingDescriptor(
      normalizedMutation,
      writeOptions,
    );
    const recoveryCandidateSelectionKey =
      this.resolveMutationRecoveryCandidateSelectionKey(
        requestKey,
        writeOptions,
      );
    if (
      typeof recoveryCandidateSelectionKey === TYPEOF.STRING &&
      recoveryCandidateSelectionKey.length > NUM.ZERO
    ) {
      writeOptions = {
        ...writeOptions,
        recoveryCandidateSelectionKey,
      };
    }
    const telemetryContext = {
      startedAtMs: this.now(),
      owner: mutation?.owner || options?.owner || null,
      tableName,
      operation,
      workClass: writeOptions?.workClass || null,
      coalescingKey: normalizeCoalescingToken(writeOptions?.coalescingKey),
      mergePolicy,
    };
    const mutationReadinessFailure =
      this.resolveLocalDeferredMutationReadinessFailure(
        tableName,
        writeOptions,
      );
    if (mutationReadinessFailure) {
      this.recordControlPlaneOperation({
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
        tableName,
        mutationOperation: operation,
        routingReadinessDimension:
          writeOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        outcome: mutationReadinessFailure.outcome,
        success: false,
        affectedRows: NUM.ZERO,
        error: mutationReadinessFailure.error,
        ...this.buildOperationLedgerDiagnostics(
          tableName,
          mutationReadinessFailure,
          {
            ...writeOptions,
            operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
          },
        ),
      });
      this.recordMutationTelemetry(telemetryContext, mutationReadinessFailure);
      return mutationReadinessFailure;
    }
    const executionFactory = async () => {
      if (!cdcIntegrationService) {
        if (this.shouldUseSqlMutationFallback(writeOptions, tableName)) {
          return this.executeSqlMutationFallback(
            normalizedMutation,
            writeOptions,
          );
        }
        throw new Error(GATEWAY_ERROR_MSG.CDC_REQUIRED);
      }
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT) {
        if (
          !normalizedMutation?.row ||
          typeof normalizedMutation.row !== TYPEOF.OBJECT
        ) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
        }
        return this.normalizeMutationResult(
          await cdcIntegrationService.insertSystemTableRow(
            tableName,
            normalizedMutation.row,
            writeOptions,
          ),
        );
      }
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.UPDATE) {
        if (
          !normalizedMutation?.whereClause ||
          typeof normalizedMutation.whereClause !== TYPEOF.OBJECT
        ) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
        }
        if (
          !normalizedMutation?.data ||
          typeof normalizedMutation.data !== TYPEOF.OBJECT
        ) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED);
        }
        return this.normalizeMutationResult(
          await cdcIntegrationService.updateSystemTableRow(
            tableName,
            normalizedMutation.whereClause,
            normalizedMutation.data,
            writeOptions,
          ),
        );
      }
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT) {
        if (
          !normalizedMutation?.row ||
          typeof normalizedMutation.row !== TYPEOF.OBJECT
        ) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
        }
        return this.normalizeMutationResult(
          await cdcIntegrationService.upsertSystemTableRow(
            tableName,
            normalizedMutation.row,
            writeOptions,
          ),
        );
      }
      if (
        !normalizedMutation?.whereClause ||
        typeof normalizedMutation.whereClause !== TYPEOF.OBJECT
      ) {
        throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
      }
      return this.normalizeMutationResult(
        await cdcIntegrationService.deleteSystemTableRow(
          tableName,
          normalizedMutation.whereClause,
          writeOptions,
        ),
      );
    };

    if (
      mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING &&
      requestKey
    ) {
      const result = await this.runReplacePendingMutation(
        requestKey,
        executionFactory,
      );
      this.recordMutationTelemetry(telemetryContext, result);
      return result;
    }

    if (
      mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT &&
      requestKey
    ) {
      return this.executeMutationWithDiagnostics(
        () => this.runSingleFlight(
          this.inFlightMutationRequestsByKey,
          requestKey,
          executionFactory,
          {
            joinMetricName: LOCAL_STR_1IXG4,
            maxTrackedRequests: this.gatewayLimits.maxTrackedMutationRequests,
          },
        ),
        tableName,
        operation,
        writeOptions,
        telemetryContext,
      );
    }

    return this.executeMutationWithDiagnostics(
      executionFactory,
      tableName,
      operation,
      writeOptions,
      telemetryContext,
    );
  },

  /**
   * @param {Function} executionFactory
   * @param {string} tableName
   * @param {string} operation
   * @param {Object} writeOptions
   * @param {Object} telemetryContext
   * @return {Promise<Object>}
   * @private
   */
  async executeMutationWithDiagnostics(
    executionFactory,
    tableName,
    operation,
    writeOptions,
    telemetryContext,
  ) {
    try {
      const result = await executionFactory();
      this.recordControlPlaneOperation({
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
        tableName,
        mutationOperation: operation,
        routingReadinessDimension:
          writeOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        outcome: result?.outcome || null,
        success: result?.success !== false,
        affectedRows: Number(
          result?.partitionResult?.affectedRows ??
            result?.affectedRows ??
            NUM.ZERO,
        ),
        error: result?.success === false ? result?.error || null : null,
        ...this.buildOperationLedgerDiagnostics(tableName, result, {
          ...writeOptions,
          operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
        }),
      });
      this.recordMutationTelemetry(telemetryContext, result);
      return result;
    } catch (error) {
      this.recordControlPlaneOperation({
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
        tableName,
        mutationOperation: operation,
        routingReadinessDimension:
          writeOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        outcome:
          error?.outcome || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
        success: false,
        affectedRows: NUM.ZERO,
        error: error?.message || String(error),
        ...this.buildOperationLedgerDiagnostics(tableName, error, {
          ...writeOptions,
          operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
        }),
      });
      this.recordMutationTelemetry(telemetryContext, {
        success: false,
        outcome:
          error?.outcome || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
      });
      throw error;
    }
  },
};

function assignControlPlaneSystemTableGatewayMutationSubmission(targetClass) {
  Object.assign(
    targetClass.prototype,
    controlPlaneSystemTableGatewayMutationSubmissionMethods,
  );
}

export {assignControlPlaneSystemTableGatewayMutationSubmission};
