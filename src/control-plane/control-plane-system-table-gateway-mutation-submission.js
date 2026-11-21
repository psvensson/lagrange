import {resolveSystemTableName} from '../bootstrap/system-table-schema-shared-constants.js';
import {resolveControlPlaneQueryTimeoutMs} from './timeout-budget.js';
import {
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  GATEWAY_ERROR_MSG,
  buildControlPlaneMutationIntent,
  canonicalizeControlPlaneMutation,
  normalizeCoalescingToken,
  normalizeMutationOperation,
  normalizePhaseScope,
} from './control-plane-system-table-gateway-shared.js';
import {
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_WRITE_ROUTE,
  controlPlaneWriteRoute,
  isNamedControlPlaneWrite,
  runControlPlaneWrite,
} from './control-plane-write-identity.js';

const LOCAL_STR_MUTATIONSINGLEFLIGHTJOINCOUNT = 'mutationSingleFlightJoinCount';
const GATEWAY_REPLICA_OPERATION_ID_FIELD = 'operation_id';
const GATEWAY_REPLICA_OPERATION_COALESCING_KEY_PREFIX =
  'replica-operation';
const GATEWAY_REPLICA_OPERATION_COALESCING_KEY_SEPARATOR = ':';

function normalizeGatewayReplicaOperationMutationId(value) {
  return typeof value === 'string' && value.length > 0 ?
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
    typeof options?.coalescingKey === 'string' &&
    options.coalescingKey.length > 0
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
    const tableName = resolveSystemTableName(mutation?.tableName);
    if (!operation) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_OPERATION_REQUIRED);
    }
    if (!tableName) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_TABLE_REQUIRED);
    }
    this.assertSystemTableMutationAllowed(operation, tableName);
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
      typeof recoveryCandidateSelectionKey === 'string' &&
      recoveryCandidateSelectionKey.length > 0
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
        requestKey,
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
        affectedRows: 0,
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
    const executesStartupSql = this.startupSqlMutationPhase !== null &&
      normalizePhaseScope(mutationOptions.phaseScope) === this.startupSqlMutationPhase &&
      tableName !== SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS;
    const executeIntent = async (command, idempotencyKey, timeoutBudget) => {
      const {mutation: retained, ignoreExisting, sessionId} = command;
      const operation = retained.operation;
      this.assertSystemTableMutationAllowed(operation, tableName);
      const deliveryOptions = {...writeOptions, ignoreExisting, sessionId, idempotencyKey};
      if (timeoutBudget) {
        deliveryOptions.timeoutBudget = timeoutBudget;
        deliveryOptions.queryTimeoutMs = resolveControlPlaneQueryTimeoutMs({
          requestedTimeoutMs: writeOptions.queryTimeoutMs, timeoutBudget, now: this.now,
        });
      }
      const cdcIntegrationService = this.assertCdcIntegrationService();
      const attemptContext = {
        coalescingKey: deliveryOptions?.coalescingKey,
        requestKey,
        idempotencyKey: deliveryOptions?.idempotencyKey,
      };
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT) {
        if (
          !retained?.row ||
          typeof retained.row !== 'object'
        ) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
        }
        return this.normalizeMutationResult(
          await cdcIntegrationService.insertSystemTableRow(
            tableName,
            retained.row,
            deliveryOptions,
          ),
          attemptContext,
        );
      }
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.UPDATE) {
        if (
          !retained?.whereClause ||
          typeof retained.whereClause !== 'object'
        ) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
        }
        if (
          !retained?.data ||
          typeof retained.data !== 'object'
        ) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED);
        }
        return this.normalizeMutationResult(
          await cdcIntegrationService.updateSystemTableRow(
            tableName,
            retained.whereClause,
            retained.data,
            deliveryOptions,
          ),
          attemptContext,
        );
      }
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT) {
        if (
          !retained?.row ||
          typeof retained.row !== 'object'
        ) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
        }
        return this.normalizeMutationResult(
          await cdcIntegrationService.upsertSystemTableRow(
            tableName,
            retained.row,
            deliveryOptions,
          ),
          attemptContext,
        );
      }
      if (
        !retained?.whereClause ||
        typeof retained.whereClause !== 'object'
      ) {
        throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
      }
      return this.normalizeMutationResult(
        await cdcIntegrationService.deleteSystemTableRow(
          tableName,
          retained.whereClause,
          deliveryOptions,
        ),
        attemptContext,
      );
    };
    // Every attempt of this logical write - the engine's, the CDC service's
    // and its caller's - is delivered under its one identity (the caller's
    // key, a named write's instance, or one for this call).
    const route = controlPlaneWriteRoute(CONTROL_PLANE_WRITE_ROUTE.CDC,
      this.nodeId, tableName);
    const command = {mutation: normalizedMutation, ignoreExisting: writeOptions.ignoreExisting,
      sessionId: writeOptions.sessionId};
    const executionFactory = () => {
      if (executesStartupSql) {
        return this.executeStartupSqlMutation(normalizedMutation, {
          ...mutationOptions, ...writeOptions,
        }, {requestKey, coalescingKey: writeOptions.coalescingKey});
      }
      this.assertCdcIntegrationService();
      return runControlPlaneWrite({
        ...mutationOptions, timeoutMs: writeOptions.queryTimeoutMs, now: this.now,
      }, command, route, executeIntent);
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
      requestKey && !isNamedControlPlaneWrite(mutationOptions)
    ) {
      return this.executeMutationWithDiagnostics(
        () => this.runSingleFlight(
          this.inFlightMutationRequestsByKey,
          requestKey,
          executionFactory,
          {
            joinMetricName: LOCAL_STR_MUTATIONSINGLEFLIGHTJOINCOUNT,
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
            0,
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
        affectedRows: 0,
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
