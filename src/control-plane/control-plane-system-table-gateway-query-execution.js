import {resolveControlPlaneQueryTimeoutMs} from './timeout-budget.js';
import {CONTROL_PLANE_READ_LEADER_MODE} from './control-plane-system-table-gateway-constants.js';
import {LEADER_READ_KIND, leaderReadRequestOf} from './control-plane-owner-fact-read-contract.js';
import {AST_TYPE, SQLParser} from '../query/sql-parser.js';
import {QUERY_ERROR_CODE} from '../query/query-constants.js';
import {resolveSystemTableName} from '../bootstrap/system-table-schema-shared-constants.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_GATEWAY_ERROR_CODE,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_SQL_OPERATION,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE,
  GATEWAY_ERROR_MSG,
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
  normalizeSqlOperationKind,
  normalizeSystemTableName,
  stableSerialize,
} from './control-plane-system-table-gateway-shared.js';
import {
  getSchemaByTableName,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_WRITE_ROUTE,
  controlPlaneWriteRoute,
  hasControlPlaneWriteName,
  isNamedControlPlaneWrite,
  runControlPlaneWrite,
} from './control-plane-write-identity.js';

const SQL_SYNTAX_ERROR = QUERY_ERROR_CODE.SYNTAX_ERROR;
const SQL_WRITE_AST_TYPES = new Set([AST_TYPE.INSERT, AST_TYPE.UPDATE, AST_TYPE.DELETE]);

function sqlWriteSubjectUnavailable() {
  return {success: false, error: GATEWAY_ERROR_MSG.SQL_WRITE_SUBJECT_UNAVAILABLE,
    errorCode: CONTROL_PLANE_GATEWAY_ERROR_CODE.SQL_WRITE_SUBJECT_UNAVAILABLE};
}

function refusedSqlWriteParse(error) {
  return {failure: {success: false, error: error.message,
    errorCode: error.code ?? SQL_SYNTAX_ERROR,
    ...(error.sqlState ? {sqlState: error.sqlState} : {})}};
}

function parseSqlWriteDescriptor(sql, dialect) {
  let ast;
  try {
    ast = new SQLParser(sql, {dialect}).parse();
  } catch (error) {
    return refusedSqlWriteParse(error);
  }
  if (!SQL_WRITE_AST_TYPES.has(ast.type)) return null;
  if (typeof ast.table !== 'string' || ast.table.length === 0) {
    return {failure: sqlWriteSubjectUnavailable()};
  }
  const tableName = resolveSystemTableName(ast.table);
  return {
    tableName, writeTarget: ast.table, writeDialect: dialect,
    operationKind: CONTROL_PLANE_SQL_OPERATION.WRITE, isSystemTable: Boolean(tableName),
  };
}

function inspectSqlWrite(sql, options, statementKind) {
  const hintedKind = normalizeSqlOperationKind(
    options.controlPlaneOperationKind || options.operationKind);
  const candidate = statementKind === CONTROL_PLANE_SQL_OPERATION.WRITE ||
    hintedKind === CONTROL_PLANE_SQL_OPERATION.WRITE;
  const carriesWriteIdentity = hasControlPlaneWriteName(options) ||
    typeof options.idempotencyKey === 'string';
  if (!candidate &&
      (statementKind !== CONTROL_PLANE_SQL_OPERATION.UNKNOWN || !carriesWriteIdentity)) {
    return null;
  }
  const descriptor = parseSqlWriteDescriptor(sql, options.dialect);
  if (descriptor !== null || !candidate) return descriptor;
  return {failure: sqlWriteSubjectUnavailable()};
}

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
  const readAuthority = options?.readAuthority || null;
  if (!readAuthority || Object.isFrozen(readAuthority) !== true) {
    throw new TypeError(
      GATEWAY_ERROR_MSG.EXECUTION_IDENTITY_AUTHORITY_TOKEN_REQUIRED,
    );
  }
  return readAuthority;
}

// A leader-REQUIRED read's decided kind and, for an owner fact, its typed
// floor are part of its execution identity, as its receiver decides on them:
// an owner fact never joins a plain leader-required read or one with another
// floor. An owner fact's relative deadline is too: a joiner shares only a
// flight with its own timeout that started no later than it did, so the
// flight is bounded by a deadline no later than the joiner's own.
function buildLeaderReadContract(options = {}) {
  if (buildReadExecutionContract(options).leaderMode !==
      CONTROL_PLANE_READ_LEADER_MODE.REQUIRED) {
    return {};
  }
  const leaderRead = leaderReadRequestOf(options.ownerFactFloor);
  return leaderRead.kind === LEADER_READ_KIND.OWNER_FACT ?
    {leaderRead, ownerFactTimeoutMs: options.timeoutMs} : {leaderRead};
}

function buildReadPressureContract(options = {}) {
  return {
    workloadClass: options.workloadClass || null,
    workClass: options.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
    resourceKeys: Array.isArray(options.resourceKeys) ?
      normalizeDistinctStringArray(options.resourceKeys) :
      [],
  };
}

// The single flagless pressure request builder for BOTH gateway entry points
// (reads and system-table queries): admission derives only from the work
// class and the structural resource identity of the request.
function buildPressureAdmissionRequest(workClass, resourceKeys) {
  return {
    workClass: workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
    resourceKeys: normalizeDistinctStringArray(resourceKeys),
  };
}

function buildExplicitReadRequestKey(tableName, explicitKey, options) {
  return `control-plane:read:${
    tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN
  }:${explicitKey}:${stableSerialize({...buildReadExecutionContract(options),
    ...buildLeaderReadContract(options)})}`;
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
    ...buildLeaderReadContract(options),
    ...buildReadPressureContract(options),
  });
}

const controlPlaneSystemTableGatewayQueryExecutionMethods = {
  admitReadPressure(tableName, options = {}) {
    return this.getPressureGovernor().admit(buildPressureAdmissionRequest(
      options?.workClass,
      [
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_COLON_READ,
        `control-plane:table:${
          tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN
        }`,
        ...(Array.isArray(options?.resourceKeys) ? options.resourceKeys : []),
      ],
    ));
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
    const statementKind = extractSqlOperationKind(sql);
    const write = inspectSqlWrite(sql, options, statementKind);
    if (write !== null) return write;
    const tableName = normalizeSystemTableName(
      options?.controlPlaneTableName ||
        options?.tableName ||
        extractSystemTableNameFromSql(sql),
    );
    const operationKind = normalizeSqlOperationKind(
      options?.controlPlaneOperationKind ||
        options?.operationKind ||
        statementKind,
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
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    });
  },

  admitExecuteQueryPressure(descriptor, options = {}) {
    if (descriptor?.isSystemTable !== true) {
      return null;
    }
    const shouldEvaluate =
      options?.enforcePressureAdmission === true ||
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
    return this.getPressureGovernor().admit(buildPressureAdmissionRequest(
      options?.workClass ||
        (isWrite ?
          PRESSURE_WORK_CLASS.CRITICAL :
          PRESSURE_WORK_CLASS.INTERACTIVE),
      resourceKeys,
    ));
  },

  assertSystemTableMutationAllowed(operation, tableName) {
    if (tableName === SYSTEM_TABLE_NAME.SERVICES &&
        operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT) {
      const error = new Error(GATEWAY_ERROR_MSG.SERVICES_UPSERT_FORBIDDEN);
      error.code =
        CONTROL_PLANE_GATEWAY_ERROR_CODE.SERVICES_UPSERT_FORBIDDEN;
      error.errorCode = error.code;
      throw error;
    }
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
      throw Object.assign(new Error(GATEWAY_ERROR_MSG.CDC_REQUIRED), {deferRetry: true});
    }
    return cdcIntegrationService;
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
    this.assertSystemTableMutationAllowed(operation, tableName);

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
    // Null-sentinel convention: a null where-value is a nullness predicate
    // (`key IS NULL`, no bound parameter), not an equality. The
    // replica_operations terminal-transition CAS uses it to guard on
    // `completed_at IS NULL` so a losing terminal write changes zero rows
    // instead of clobbering the winning terminal.
    const whereClause = whereEntries
      .map(([key, value]) => (value === null ? `${key} IS NULL` : `${key} = ?`))
      .join(' AND ');

    const whereParams = whereEntries
      .filter(([_key, value]) => value !== null)
      .map(([_key, value]) => value);

    if (operation === CONTROL_PLANE_MUTATION_OPERATION.DELETE) {
      return {
        sql: `${SQL.DELETE_FROM} ${tableName} ${SQL.WHERE} ${whereClause}`,
        params: whereParams,
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
        ...whereParams,
      ],
    };
  },

  async executeStartupSqlMutation(mutation, writeOptions, attemptContext) {
    const {sql, params} = this.buildSqlMutationPlan(mutation);
    return this.normalizeMutationResult(
      await this.executeQuery(sql, params, {
        ...writeOptions,
        controlPlaneTableName: mutation.tableName,
        controlPlaneOperationKind: CONTROL_PLANE_SQL_OPERATION.WRITE,
      }),
      attemptContext,
    );
  },

  async executeQuery(sql, params = [], options = {}) {
    const descriptor = this.resolveSystemTableQueryDescriptor(sql, options);
    if (descriptor.failure) return descriptor.failure;
    if (hasControlPlaneWriteName(options) && !descriptor.writeTarget) {
      return sqlWriteSubjectUnavailable();
    }
    const pressureDecision = await this.admitExecuteQueryPressure(
      descriptor,
      options,
    );
    if (
      pressureDecision &&
      (pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
        pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT)
    ) {
      return buildPressureAdmissionFailure(pressureDecision, {
        tableName: descriptor.tableName,
      });
    }
    const named = descriptor.operationKind === CONTROL_PLANE_SQL_OPERATION.WRITE &&
      isNamedControlPlaneWrite(options);
    const queryKey = named ? null : this.buildExecuteQueryKey(
      descriptor,
      sql,
      params,
      options,
    );
    // A write is delivered under its one identity (the caller's key, its
    // named write's instance, or one for this call): every retry beneath
    // this call - and a named write's re-drive - is the same entry.
    const queryOptions = this.buildQueryOptions(options, {
      tableName: descriptor.tableName || null,
      sql,
      operationKind: descriptor.writeTarget ? descriptor.operationKind : null,
    });
    const route = controlPlaneWriteRoute(CONTROL_PLANE_WRITE_ROUTE.SQL,
      this.nodeId, descriptor.tableName ?? descriptor.writeTarget);
    const command = {sql, params, sessionId: queryOptions.sessionId,
      dialect: descriptor.writeDialect};
    const execute = (statement, idempotencyKey, timeoutBudget) => {
      const timeoutMs = resolveControlPlaneQueryTimeoutMs({
        requestedTimeoutMs: queryOptions.timeoutMs, timeoutBudget, now: this.now,
      });
      return this.assertSqlQueryEngine().executeQuery(statement.sql, statement.params, {
        ...queryOptions, sessionId: statement.sessionId, dialect: statement.dialect,
        idempotencyKey, timeoutBudget, timeoutMs,
      });
    };
    const result = await this.runSingleFlight(
      this.inFlightQueryRequestsByKey,
      queryKey,
      () => (descriptor.operationKind === CONTROL_PLANE_SQL_OPERATION.WRITE ?
        runControlPlaneWrite({...options, timeoutMs: queryOptions.timeoutMs, now: this.now},
          command, route, execute) :
        this.assertSqlQueryEngine().executeQuery(sql, params, queryOptions)),
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

  async querySystemTable(firstArg, secondArg, thirdArg, fourthArg) {
    if (typeof firstArg === 'string' && typeof secondArg === 'string') {
      return this.executeQuery(secondArg, thirdArg || [], {
        ...fourthArg,
        tableName: firstArg,
      });
    }
    return this.executeQuery(firstArg, secondArg || [], thirdArg || {});
  },

};

function assignControlPlaneSystemTableGatewayQueryExecution(targetClass) {
  Object.assign(
    targetClass.prototype,
    controlPlaneSystemTableGatewayQueryExecutionMethods,
  );
}

export {
  assignControlPlaneSystemTableGatewayQueryExecution,
};
