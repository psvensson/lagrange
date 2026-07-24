import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineBootstrapRoutingOverlay} from './sql-query-engine-bootstrap-routing-overlay.js';
import {SERVICE_PARTITION_ACCESS_KIND} from '../constants/index.js';
import {
  createSQLQueryEngineProvisioningMethods,
} from './sql-query-engine-provisioning-methods.js';
import {throwIfCancellationRequested} from './query-cancellation.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_WAIT_FOR_CONDITION = 'wait_for_condition';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_BINARY = 'binary';
const LOCAL_STR_EQUALS = '=';
const LOCAL_STR_IN = 'in';
const LOCAL_STR_LITERAL = 'literal';
const LOCAL_STR_PARAMETER = 'parameter';
const LOCAL_STR_COLUMN_REF = 'column_ref';
const LOCAL_STR_STAR = 'star';

const {
  AuthoritativeControlPlaneView,
  CONTROL_PLANE_READINESS_DIMENSION,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  RETRYABLE_CONTROL_PLANE_TIMEOUT_CLASSIFICATIONS,
  TABLES,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  createTimeoutBudgetError,
  getRemainingBudgetMs,
  getSchemaByTableName,
  isRetryableControlPlaneError,
} = SQL_QUERY_ENGINE_SHARED;

class SQLQueryEngineSelectExecution extends SQLQueryEngineBootstrapRoutingOverlay {
  /**
   * Create one control-plane timeout budget.
   * @param {number} configuredBudgetMs
   * @return {Object}
   * @private
   */
  createControlPlaneTimeoutBudget(configuredBudgetMs) {
    return this.controlPlaneTimeoutPolicy.createTopLevelBudget({
      configuredBudgetMs,
    });
  }

  /**
   * Allocate one nested timeout budget from the remaining deadline.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  allocateControlPlaneTimeoutBudget(options = {}) {
    return this.controlPlaneTimeoutPolicy.allocateOrThrow({
      timeoutBudget: options.timeoutBudget || null,
      requestedBudgetMs: options.requestedBudgetMs,
      minimumBudgetMs:
        options.minimumBudgetMs ||
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
      classification: options.classification,
      nestedOperation: options.nestedOperation,
      timeoutError: options.timeoutError,
    });
  }

  /**
   * Wait for a condition with bounded timeout.
   * @param {Function} predicate - Condition callback.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @param {number} intervalMs - Poll interval in milliseconds.
   * @param {string} timeoutError - Timeout error message.
   * @return {Promise<void>}
   * @private
   */
  async waitForCondition(
    predicate,
    timeoutMs,
    intervalMs,
    timeoutError,
    timeoutOptions = {},
  ) {
    const cancellationToken = timeoutOptions.cancellationToken;
    throwIfCancellationRequested(cancellationToken);
    if (await predicate()) {
      return;
    }

    const effectiveBudget = timeoutOptions?.timeoutBudget ?
      this.allocateControlPlaneTimeoutBudget({
        timeoutBudget: timeoutOptions.timeoutBudget,
        requestedBudgetMs: timeoutMs,
        minimumBudgetMs:
            timeoutOptions.minimumBudgetMs ||
            TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
        classification:
            timeoutOptions.classification ||
            TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
        nestedOperation:
            timeoutOptions.nestedOperation || 'wait_for_condition',
        timeoutError,
      }) :
      this.createControlPlaneTimeoutBudget(timeoutMs);

    while (true) {
      throwIfCancellationRequested(cancellationToken);
      if (await predicate()) {
        return;
      }
      const remainingMs = getRemainingBudgetMs(effectiveBudget, {
        now: this.nowFn,
      });
      if (remainingMs <= 0) {
        break;
      }
      await this.sleep(Math.min(intervalMs, remainingMs));
      throwIfCancellationRequested(cancellationToken);
    }

    throwIfCancellationRequested(cancellationToken);
    if (await predicate()) {
      return;
    }
    throw createTimeoutBudgetError({
      message: timeoutError,
      budget: effectiveBudget,
      classification:
        timeoutOptions.classification ||
        TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
      nestedOperation: timeoutOptions.nestedOperation || LOCAL_STR_WAIT_FOR_CONDITION,
      now: this.nowFn,
    });
  }

  /**
   * Delay helper for provisioning polling loops.
   * @param {number} ms - Delay in milliseconds.
   * @return {Promise<void>}
   * @private
   */
  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute a SELECT statement.
   * @param {Object} ast - Parsed SELECT AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSelect(
    ast,
    params,
    sessionId,
    queryOptions = {},
    rawSql = null,
  ) {
    // FROM-less SELECT (e.g., SELECT 1, SELECT 1+1) — route to any
    // available partition and let SQLite evaluate the expression.
    if (!ast.from) {
      return this.executeFromlessSelect(ast, params, sessionId);
    }

    const tableName = ast.from.name;
    const tableInfo = this.getTableInfo(tableName);
    const dualWriteMode = this.isDualWriteModeActiveForTable(tableInfo);
    const authoritativeLocalResult =
      await this.tryExecuteAuthoritativeSystemTableSelect(
        tableName,
        ast,
        rawSql,
        params,
        queryOptions,
      );
    if (authoritativeLocalResult) {
      return authoritativeLocalResult;
    }

    const planningStartTimeMs = Date.now();
    const distributedPlan = this.distributedQueryPlanner.planSelect(
      ast,
      params,
      {sessionId},
    );
    const planningDurationMs = Date.now() - planningStartTimeMs;
    const rootAlias = ast.from.alias || tableName;
    const rootPlan =
      distributedPlan.tablePlans.get(rootAlias) ||
      distributedPlan.tablePlans.get(tableName) ||
      null;

    if (!rootPlan || rootPlan.partitions.length === 0) {
      return {
        success: false,
        error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
        errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
      };
    }

    const partitionIds = rootPlan.partitions;

    this.logger.debug(QUERY_LOG_MSG.RESOLVED_PARTITIONS_SELECT, {
      tableName,
      totalPartitions: partitionIds.length,
      targetPartitions: partitionIds.length,
      sessionId,
    });

    const routingReadinessDimension = this.resolveTableRoutingReadinessDimension(
      tableName,
      queryOptions.routingReadinessDimension,
    );
    const recoveryLaneSystemTableSelect =
      this.isSystemTable(tableName) &&
      routingReadinessDimension ===
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    const preferLeader =
      typeof queryOptions?.preferLeader === 'boolean' ?
        queryOptions.preferLeader :
        (this.isSystemTable(tableName) && !recoveryLaneSystemTableSelect);
    for (const join of ast.joins || []) {
      const joinTableName = join.table?.name;
      if (!joinTableName) {
        continue;
      }
      const joinAlias = join.table.alias || joinTableName;
      const joinPlan =
        distributedPlan.tablePlans.get(joinAlias) ||
        distributedPlan.tablePlans.get(joinTableName) ||
        null;
      if (!joinPlan || joinPlan.partitions.length === 0) {
        return {
          success: false,
          error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${joinTableName}`,
          errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
        };
      }
    }

    // Execute on resolved partitions
    const executionStartTimeMs = Date.now();
    const deliveryPriority = this.resolveRoutedDeliveryPriority(
      tableName,
      queryOptions.deliveryPriority,
    );
    const preferSameLatencyGroup =
      queryOptions.preferSameLatencyGroup === true ||
      this.resolveIssuingServiceReadLocality(queryOptions);
    const result = await this.queryExecutor.executeSelect(
      ast,
      partitionIds,
      params,
      {
        preferLeader,
        preferSameLatencyGroup,
        deliveryPriority,
        distributedPlan,
        routingReadinessDimension,
        timeoutMs: queryOptions.timeoutMs,
        timeoutBudget: queryOptions.timeoutBudget || null,
        cancellationToken: queryOptions.cancellationToken || null,
        resultMaxBytes: queryOptions.budgets?.RESULT_MAX_BYTES,
        resultMaxRows: queryOptions.budgets?.RESULT_MAX_ROWS,
      },
    );
    const executionDurationMs = Date.now() - executionStartTimeMs;

    if (result?.success === true) {
      // Attribution feed: result.partitions is the executed set (main
      // table plus join fanout); fall back to the planned root set.
      this.recordServicePartitionAccess(
        queryOptions,
        Array.isArray(result.partitions) ? result.partitions : partitionIds,
        SERVICE_PARTITION_ACCESS_KIND.READ,
      );
    }

    return {
      ...result,
      tableName,
      dualWriteMode,
      distributedPlan,
      distributedDiagnostics: distributedPlan.diagnostics,
      distributedMetrics: {
        planningDurationMs,
        executionDurationMs,
        fanout: result.distributedMetrics?.fanout || null,
        mergeDurationMs: result.distributedMetrics?.mergeDurationMs || 0,
      },
    };
  }

  /**
   * Prefer node-local authoritative reads for single-table system-table
   * selects when a local partition replica is available. This avoids routing
   * hot control-plane reads back through the cluster under pressure.
   * @param {string} tableName
   * @param {Object} ast
   * @param {string|null} rawSql
   * @param {Array<*>} params
   * @param {Object} queryOptions
   * @return {Promise<Object|null>}
   * @private
   */
  async tryExecuteAuthoritativeSystemTableSelect(
    tableName,
    ast,
    rawSql,
    params,
    queryOptions = {},
  ) {
    const authoritativeControlPlaneView =
      this.getAuthoritativeControlPlaneView();
    if (
      !rawSql ||
      !this.isSystemTable(tableName) ||
      !authoritativeControlPlaneView ||
      (Array.isArray(ast?.joins) && ast.joins.length > 0)
    ) {
      return null;
    }
    // The node-local read merges per-replica row sets keyed by the primary
    // key, so a projection without the key would have every row silently
    // dropped. Bounded pk lookups are exempt: their empty local reads are
    // confirmed through the owner lane, which masks the drop.
    if (
      !this.systemTableSelectProjectsPrimaryKey(tableName, ast) &&
      !this.shouldConfirmEmptyAuthoritativeSystemTableRead(tableName, ast)
    ) {
      return null;
    }

    const confirmEmptyLocalReadWithOwnerRpc =
      this.shouldConfirmEmptyAuthoritativeSystemTableRead(tableName, ast);
    const executableSql = this.queryExecutor.buildSelectSQL(ast);
    const localResult = await authoritativeControlPlaneView.readRows(
      tableName,
      executableSql,
      params,
      {
        allowSqlFallback: false,
        queryTimeoutMs: queryOptions?.timeoutMs,
        confirmEmptyLocalReadWithOwnerRpc,
        replicaFallbackConsistency:
          LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
      },
    );
    if (!localResult?.success) {
      return null;
    }

    const partitions = this.getTablePartitions(tableName)
      .map((partition) => partition?.partition_id)
      .filter((partitionId) => typeof partitionId === 'string');

    return {
      ...localResult,
      partitions,
      tableName,
      distributedPlan: null,
      distributedDiagnostics: null,
      distributedMetrics: {
        planningDurationMs: 0,
        executionDurationMs: 0,
        fanout: partitions.length,
        mergeDurationMs: 0,
      },
    };
  }

  /**
   * Whether a system-table select's projection carries the table's primary
   * key under its own name. The node-local authoritative read merges
   * per-replica row sets KEYED BY THE PRIMARY KEY and silently drops rows
   * whose key field is absent, so a statement that projects other columns
   * (or aliases the key away, or aggregates) must take the routed execution
   * path instead — the 2026-07-18 learned-affinity attribution stall was a
   * pk-less projection returning a successful empty result forever.
   * @param {string} tableName
   * @param {Object} ast
   * @return {boolean}
   * @private
   */
  systemTableSelectProjectsPrimaryKey(tableName, ast) {
    const columns = Array.isArray(ast?.columns) ? ast.columns : [];
    if (columns.some((column) => column?.type === LOCAL_STR_STAR)) {
      return true;
    }
    const primaryKeyColumns = this.getSystemTablePrimaryKeyColumns(tableName);
    if (primaryKeyColumns.length === 0) {
      return false;
    }
    return primaryKeyColumns.every((primaryKeyColumn) =>
      columns.some((column) =>
        column?.expression?.type === LOCAL_STR_COLUMN_REF &&
        column.expression.column === primaryKeyColumn &&
        (column.alias === null || column.alias === undefined ||
          column.alias === primaryKeyColumn)));
  }

  /**
   * Determine whether one system-table read should confirm empty local rows
   * through the authoritative owner lane before accepting the result.
   * @param {string} tableName
   * @param {Object} ast
   * @return {boolean}
   * @private
   */
  shouldConfirmEmptyAuthoritativeSystemTableRead(tableName, ast) {
    const primaryKeyColumns = this.getSystemTablePrimaryKeyColumns(tableName);
    if (primaryKeyColumns.length !== 1) {
      return false;
    }
    const primaryKeyColumn = primaryKeyColumns[0];
    const tableAlias = ast?.from?.alias || null;
    const whereClause = ast?.where || null;
    if (!whereClause || typeof whereClause !== LOCAL_STR_OBJECT) {
      return false;
    }
    if (whereClause.type === LOCAL_STR_BINARY && whereClause.operator === LOCAL_STR_EQUALS) {
      return (
        this.isSystemTablePrimaryKeyColumnReference(
          whereClause.left,
          tableName,
          tableAlias,
          primaryKeyColumn,
        ) && this.isBoundSystemTableLookupValue(whereClause.right)
      );
    }
    if (whereClause.type === LOCAL_STR_IN && whereClause.negated !== true) {
      return (
        this.isSystemTablePrimaryKeyColumnReference(
          whereClause.expression,
          tableName,
          tableAlias,
          primaryKeyColumn,
        ) &&
        Array.isArray(whereClause.values) &&
        whereClause.values.length > 0 &&
        whereClause.values.every((value) =>
          this.isBoundSystemTableLookupValue(value),
        )
      );
    }
    return false;
  }

  /**
   * Resolve primary-key columns from the canonical system-table schema.
   * @param {string} tableName
   * @return {string[]}
   * @private
   */
  getSystemTablePrimaryKeyColumns(tableName) {
    const schema = getSchemaByTableName(tableName);
    if (!schema) {
      return [];
    }
    if (
      Array.isArray(schema.primaryKey) &&
      schema.primaryKey.length > 0
    ) {
      return schema.primaryKey.filter(
        (columnName) =>
          typeof columnName === LOCAL_STR_STRING &&
          columnName.length > 0,
      );
    }
    if (!Array.isArray(schema.columns)) {
      return [];
    }
    return schema.columns
      .filter((column) => column?.primaryKey === true)
      .map((column) => column.name)
      .filter(
        (columnName) =>
          typeof columnName === LOCAL_STR_STRING &&
          columnName.length > 0,
      );
  }

  /**
   * Check whether one lookup expression is a literal or a bound parameter.
   * @param {Object|null} expression
   * @return {boolean}
   * @private
   */
  isBoundSystemTableLookupValue(expression) {
    return expression?.type === LOCAL_STR_LITERAL || expression?.type === LOCAL_STR_PARAMETER;
  }

  /**
   * Check whether one expression references the expected system-table primary
   * key column.
   * @param {Object|null} expression
   * @param {string} tableName
   * @param {string|null} tableAlias
   * @param {string} primaryKeyColumn
   * @return {boolean}
   * @private
   */
  isSystemTablePrimaryKeyColumnReference(
    expression,
    tableName,
    tableAlias,
    primaryKeyColumn,
  ) {
    if (!expression || expression.type !== LOCAL_STR_COLUMN_REF) {
      return false;
    }
    if (expression.column !== primaryKeyColumn) {
      return false;
    }
    return (
      expression.table === null ||
      expression.table === undefined ||
      expression.table === tableName ||
      expression.table === tableAlias
    );
  }

  /**
   * Resolve the shared authoritative control-plane read view.
   * @return {AuthoritativeControlPlaneView|null}
   * @private
   */
  getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      return this.authoritativeControlPlaneView;
    }
    if (!this.cdcIntegrationService) {
      return null;
    }
    this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      messageRouter: this.messageRouter,
      now: this.nowFn,
    });
    return this.authoritativeControlPlaneView;
  }

  /**
   * Execute a SELECT without a FROM clause (e.g., SELECT 1, SELECT 1+1).
   * Routes to any available partition and lets SQLite evaluate the
   * expression directly.
   * @param {Object} ast - Parsed SELECT AST with null from.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeFromlessSelect(ast, params, _sessionId) {
    const allPartitions = this.systemCache?.getAll?.(TABLES.PARTITIONS) || [];
    if (allPartitions.length === 0) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_PARTITIONS_FOR_TABLE,
        errorCode: QUERY_ERROR_CODE.PARTITION_NOT_FOUND,
      };
    }

    const targetPartitionId = allPartitions[0].partition_id;
    const cols = ast.columns.map((col) =>
      this.queryExecutor.buildColumnSQL(col),
    );
    const sql = `SELECT ${cols.join(', ')}`;

    const results = await this.queryExecutor.executeOnPartitions(
      [targetPartitionId],
      sql,
      params,
      null,
      true,
      false,
      false,
      {
        routingReadinessDimension: this.defaultRoutingReadinessDimension,
      },
    );

    const first = results[0];
    if (!first || !first.success) {
      return {
        success: false,
        error: first?.error || QUERY_ERROR_MSG.QUERY_ROUTING_FAILED,
        errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR,
      };
    }

    return {
      success: true,
      rows: first.rows || [],
      count: first.rows?.length || 0,
      partitions: [targetPartitionId],
      tableName: null,
      distributedPlan: null,
      distributedDiagnostics: null,
      distributedMetrics: {
        planningDurationMs: 0,
        executionDurationMs: 0,
        fanout: null,
        mergeDurationMs: 0,
      },
    };
  }

  isRetryableControlPlaneMutationFailure(error) {
    if (isRetryableControlPlaneError(error)) {
      return true;
    }
    const timeoutClassification =
      error?.timeoutClassification &&
      typeof error.timeoutClassification === 'object' ?
        error.timeoutClassification :
        null;
    const classifications = [
      timeoutClassification?.classification,
      timeoutClassification?.originalClassification,
    ];
    return classifications.some((classification) => {
      return (
        typeof classification === LOCAL_STR_STRING &&
        RETRYABLE_CONTROL_PLANE_TIMEOUT_CLASSIFICATIONS.has(classification)
      );
    });
  }

  /**
   * Return one canonical deferred result when a retryable control-plane table
   * lifecycle mutation times out while authority establishment is still
   * pending.
   * @param {string|null} tableName
   * @param {*} error
   * @param {Object} [queryOptions={}]
   * @return {Object|null}
   * @private
   */
}

Object.defineProperties(
  SQLQueryEngineSelectExecution.prototype,
  createSQLQueryEngineProvisioningMethods(),
);

export {SQLQueryEngineSelectExecution};
