import {
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_SQL_OPERATION,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE,
  GATEWAY_ERROR_MSG,
  GATEWAY_LOG_MSG,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  SQL,
  buildAuthoritativeControlPlaneReadIntent,
  buildProjectionControlPlaneReadIntent,
  buildPressureAdmissionFailure,
  canonicalizeSystemTableRow,
  extractSqlOperationKind,
  extractSystemTableNameFromSql,
  normalizeCoalescingToken,
  normalizeDistinctStringArray,
  normalizeMutationOperation,
  normalizePhaseScope,
  normalizeSqlOperationKind,
  buildControlPlaneReadAuthority,
  normalizeSystemTableName,
  stableSerialize,
} from './control-plane-system-table-gateway-shared.js';
import {
  getSchemaByTableName,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';

function buildSchemaFilteredSqlMutationEntries(tableName, data) {
  const schema = getSchemaByTableName(tableName);
  if (!schema || !schema.columns) {
    throw new Error(GATEWAY_ERROR_MSG.MUTATION_TABLE_REQUIRED);
  }
  const allowedColumns = new Set(
    schema.columns.map((column) => column.name),
  );
  return Object.entries(canonicalizeSystemTableRow(tableName, data)).filter(
    ([key, value]) => {
      return allowedColumns.has(key) &&
        typeof value !== 'undefined';
    },
  );
}

// The full read-authority token IS the execution identity: every field that
// can change a read's answer must be part of its coalescing key, or a read
// with stronger authority can absorb a weaker in-flight read's result (the
// 2026-07-18 leader-pin coalescing incident).
function buildReadExecutionContract(options = {}) {
  return {...buildControlPlaneReadAuthority(options)};
}

function buildReadPressureContract(options = {}) {
  return {
    workloadClass: options.workloadClass || null,
    workClass: options.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
    allowPressureDegrade: options.allowPressureDegrade !== false,
    allowPressureDefer: options.allowPressureDefer === true,
    resourceKeys: Array.isArray(options.resourceKeys) ?
      normalizeDistinctStringArray(options.resourceKeys) :
      [],
  };
}

function buildExplicitReadRequestKey(tableName, explicitKey, options) {
  return `control-plane:read:${
    tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN
  }:${explicitKey}:${stableSerialize(buildReadExecutionContract(options))}`;
}

function buildImplicitReadRequestKey(tableName, sql, params, options) {
  return stableSerialize({
    kind:
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL
        .CONTROL_DASH_PLANE_DASH_READ,
    tableName: tableName || null,
    sql: sql || null,
    params: Array.isArray(params) ? params : [],
    ...buildReadExecutionContract(options),
    ...buildReadPressureContract(options),
  });
}

const controlPlaneSystemTableGatewayQueryExecutionMethods = {
  evaluateReadPressure(tableName, options = {}) {
    return this.getPressureGovernor().evaluate({
      workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      resourceKeys: normalizeDistinctStringArray([
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_COLON_READ,
        `control-plane:table:${
          tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN
        }`,
        ...(Array.isArray(options?.resourceKeys) ? options.resourceKeys : []),
      ]),
      allowDegrade: options?.allowPressureDegrade !== false,
      allowDefer: options?.allowPressureDefer === true,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
  },

  buildReadRequestKey(tableName, sql, params = [], options = {}) {
    const explicitKey = normalizeCoalescingToken(options?.coalescingKey);
    if (explicitKey) {
      return buildExplicitReadRequestKey(tableName, explicitKey, options);
    }
    if (options?.allowCoalescing === false) {
      return null;
    }
    return buildImplicitReadRequestKey(
      tableName,
      sql,
      params,
      options,
    );
  },

  resolveSystemTableQueryDescriptor(sql, options = {}) {
    const tableName = normalizeSystemTableName(
      options?.controlPlaneTableName ||
        options?.tableName ||
        extractSystemTableNameFromSql(sql),
    );
    const operationKind = normalizeSqlOperationKind(
      options?.controlPlaneOperationKind ||
        options?.operationKind ||
        extractSqlOperationKind(sql),
    );
    return {
      tableName,
      operationKind,
      isSystemTable:
        Boolean(tableName) &&
        operationKind !== CONTROL_PLANE_SQL_OPERATION.UNKNOWN,
    };
  },

  buildExecuteQueryKey(descriptor, sql, params = [], options = {}) {
    const explicitKey = normalizeCoalescingToken(options?.coalescingKey);
    if (explicitKey) {
      return (
        `control-plane:query:${
          descriptor.tableName ||
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN
        }:` +
        `${descriptor.operationKind}:${explicitKey}:` +
        `preferLeader=${options?.preferLeader === true}`
      );
    }
    if (options?.allowCoalescing === false) {
      return null;
    }
    if (descriptor.operationKind !== CONTROL_PLANE_SQL_OPERATION.READ) {
      return null;
    }
    return stableSerialize({
      kind: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_DASH_QUERY,
      tableName: descriptor.tableName || null,
      operationKind: descriptor.operationKind,
      sql: sql || null,
      params: Array.isArray(params) ? params : [],
      workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      preferLeader: options?.preferLeader === true,
      allowPressureDefer: options?.allowPressureDefer === true,
      allowPressureDegrade: options?.allowPressureDegrade === true,
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    });
  },

  evaluateExecuteQueryPressure(descriptor, options = {}) {
    if (descriptor?.isSystemTable !== true) {
      return null;
    }
    const shouldEvaluate =
      options?.enforcePressureAdmission === true ||
      options?.allowPressureDefer === true ||
      options?.allowPressureDegrade === true ||
      typeof options?.workClass === 'string';
    if (!shouldEvaluate) {
      return null;
    }
    const isWrite =
      descriptor.operationKind === CONTROL_PLANE_SQL_OPERATION.WRITE;
    const defaultResourceKeys = [
      `control-plane:${
        isWrite ?
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.WRITE :
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READ
      }`,
      `control-plane:table:${
        descriptor.tableName ||
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN
      }`,
    ];
    const resourceKeys = normalizeDistinctStringArray([
      ...defaultResourceKeys,
      ...(Array.isArray(options?.resourceKeys) ? options.resourceKeys : []),
    ]);
    return this.getPressureGovernor().evaluate({
      workClass:
        options?.workClass ||
        (isWrite ?
          PRESSURE_WORK_CLASS.CRITICAL :
          PRESSURE_WORK_CLASS.INTERACTIVE),
      resourceKeys,
      allowDegrade: isWrite ? false : options?.allowPressureDegrade === true,
      allowDefer: options?.allowPressureDefer === true,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
  },

  assertSqlQueryEngine() {
    const sqlQueryEngine = this.resolveSqlQueryEngine();
    if (
      !sqlQueryEngine ||
      typeof sqlQueryEngine.executeQuery !== 'function'
    ) {
      throw new Error(GATEWAY_ERROR_MSG.SQL_ENGINE_REQUIRED);
    }
    return sqlQueryEngine;
  },

  assertCdcIntegrationService() {
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    if (!cdcIntegrationService) {
      throw new Error(GATEWAY_ERROR_MSG.CDC_REQUIRED);
    }
    return cdcIntegrationService;
  },

  shouldUseSqlMutationFallback(options = {}, tableName = null) {
    if (options?.skipCacheWait !== true) {
      return false;
    }
    const phaseScope = normalizePhaseScope(options?.phaseScope);
    if (!phaseScope) {
      return false;
    }
    // B3 (scale-safety): membership writes must stay on the CDC/Raft
    // proposeWrite path — the Raft term fence is the single source of truth
    // for cluster membership, and the SQL fallback would bypass it. Fail loud
    // (caller throws CDC_REQUIRED) rather than commit an unfenced write.
    if (tableName === SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS) {
      this.emitGatewayWarning(GATEWAY_LOG_MSG.MUTATION_FALLBACK_FENCED, {
        nodeId: this.nodeId,
        tableName,
        phaseScope,
      });
      return false;
    }
    return (
      typeof this.resolveSqlQueryEngine()?.executeQuery === 'function'
    );
  },

  buildSqlMutationPlan(mutation = {}) {
    const operation = normalizeMutationOperation(mutation?.operation);
    const tableName = normalizeSystemTableName(mutation?.tableName);
    if (!operation) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_OPERATION_REQUIRED);
    }
    if (!tableName) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_TABLE_REQUIRED);
    }

    if (
      operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT ||
      operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT
    ) {
      if (!mutation?.row || typeof mutation.row !== 'object') {
        throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
      }
      const rowEntries = buildSchemaFilteredSqlMutationEntries(
        tableName,
        mutation.row,
      );
      if (rowEntries.length === 0) {
        throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
      }
      const columns = rowEntries.map(([key]) => key).join(', ');
      const placeholders = rowEntries.map(() => '?').join(', ');
      return {
        sql: `${
          operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT ?
            SQL.INSERT_OR_REPLACE_INTO :
            SQL.INSERT_INTO
        } ${tableName} (${columns}) ${SQL.VALUES} (${placeholders})`,
        params: rowEntries.map(([_key, value]) => value),
      };
    }

    const schema = getSchemaByTableName(tableName);
    if (!schema || !schema.columns) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_TABLE_REQUIRED);
    }
    const allowedColumns = new Set(
      schema.columns.map((column) => column.name),
    );
    const whereEntries = Object.entries(mutation.whereClause).filter(
      ([key, value]) => {
        return allowedColumns.has(key) &&
          typeof value !== 'undefined';
      },
    );
    if (whereEntries.length === 0) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
    }
    const whereClause = whereEntries.map(([key]) => `${key} = ?`).join(' AND ');

    if (operation === CONTROL_PLANE_MUTATION_OPERATION.DELETE) {
      return {
        sql: `${SQL.DELETE_FROM} ${tableName} ${SQL.WHERE} ${whereClause}`,
        params: whereEntries.map(([_key, value]) => value),
      };
    }

    if (!mutation?.data || typeof mutation.data !== 'object') {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED);
    }
    const updateEntries = buildSchemaFilteredSqlMutationEntries(
      tableName,
      mutation.data,
    );
    if (updateEntries.length === 0) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED);
    }
    const setClause = updateEntries.map(([key]) => `${key} = ?`).join(', ');
    return {
      sql: `${SQL.UPDATE} ${tableName} ${SQL.SET} ${setClause} ${SQL.WHERE} ${whereClause}`,
      params: [
        ...updateEntries.map(([_key, value]) => value),
        ...whereEntries.map(([_key, value]) => value),
      ],
    };
  },

  async executeSqlMutationFallback(mutation = {}, writeOptions = {}) {
    const sqlQueryEngine = this.assertSqlQueryEngine();
    const {sql, params} = this.buildSqlMutationPlan(mutation);
    return this.normalizeMutationResult(
      await sqlQueryEngine.executeQuery(sql, params, writeOptions),
    );
  },

  async executeQuery(sql, params = [], options = {}) {
    const sqlQueryEngine = this.assertSqlQueryEngine();
    const descriptor = this.resolveSystemTableQueryDescriptor(sql, options);
    const pressureDecision = this.evaluateExecuteQueryPressure(
      descriptor,
      options,
    );
    if (
      pressureDecision &&
      (pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
        pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT ||
        pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE)
    ) {
      return buildPressureAdmissionFailure(pressureDecision, {
        tableName: descriptor.tableName,
      });
    }
    const queryKey = this.buildExecuteQueryKey(
      descriptor,
      sql,
      params,
      options,
    );
    const result = await this.runSingleFlight(
      this.inFlightQueryRequestsByKey,
      queryKey,
      () => {
        return sqlQueryEngine.executeQuery(
          sql,
          params,
          this.buildQueryOptions(options, {
            tableName: descriptor.tableName || null,
            sql,
            operationKind: descriptor.sqlOperation || null,
          }),
        );
      },
      {
        joinMetricName: 'querySingleFlightJoinCount',
        bypassMetricName: 'queryTrackingBypassCount',
        maxTrackedRequests: this.gatewayLimits.maxTrackedQueryRequests,
      },
    );
    this.recordControlPlaneOperation({
      operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY,
      tableName: descriptor.tableName || null,
      sqlOperation: descriptor.sqlOperation || null,
      strategy: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE,
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      success: result?.success !== false,
      rowCount: Number.isFinite(result?.rowCount) ?
        result.rowCount :
        Array.isArray(result?.rows) ?
          result.rows.length :
          0,
      error: result?.success === false ? result?.error || null : null,
      ...this.buildOperationLedgerDiagnostics(
        descriptor.tableName || null,
        result,
        {
          ...options,
          operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY,
        },
      ),
      sessionId:
        typeof options?.sessionId === 'string' ? options.sessionId : null,
    });
    return result;
  },

  async readAuthoritativeRows(tableName, sql, params = [], options = {}) {
    return this.executeRead(
      buildAuthoritativeControlPlaneReadIntent(tableName, sql, params, options),
      options,
    );
  },

  async readProjectionRows(tableName, options = {}) {
    return this.executeRead(
      buildProjectionControlPlaneReadIntent(tableName, options),
      options,
    );
  },
};

function assignControlPlaneSystemTableGatewayQueryExecution(targetClass) {
  Object.assign(
    targetClass.prototype,
    controlPlaneSystemTableGatewayQueryExecutionMethods,
  );
}

export {assignControlPlaneSystemTableGatewayQueryExecution};
