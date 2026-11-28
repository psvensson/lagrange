import {
  QUERY_AST_NODE,
  QUERY_AST_TYPE,
  QUERY_JOIN_TYPE,
  QUERY_OPERATOR,
} from '../query-constants.js';
import {
  DISTRIBUTED_EXECUTION_POLICY,
  DISTRIBUTED_JOIN_STRATEGY,
  DISTRIBUTED_PLAN_FIELD as PLAN_FIELD,
  DISTRIBUTED_PLANNER_DEFAULT,
  DISTRIBUTED_PREDICATE_SHAPE,
  DISTRIBUTED_QUERY_ERROR_MSG,
  DISTRIBUTED_ROLE_HINT,
  DISTRIBUTED_SCAN_TYPE,
  DISTRIBUTED_STATEMENT_TYPE,
} from './distributed-query-plan-constants.js';
import {renderSqliteIdentifier} from '../sqlite-identifier.js';
import {resolveDeclaredPrimaryKeyColumns} from '../../partition/partition-boundary-representation.js';
import {
  renderExpression,
  renderExpressionWithParameters,
} from '../sql-statement-renderer.js';
import {
  collectProjectedColumns,
  expressionReferencesAlias,
  extractProjectedColumns,
  extractTableLocalPredicate,
} from './distributed-query-planner-projection-helpers.js';
import {
  clonePlanStructure,
  createDeterministicPlanId,
  normalizePlanPayload,
  resolveStructuralPlanTemplate,
} from './distributed-query-planner-plan-id.js';
import {
  collectAllBaseTableNames,
  hasSubqueryCteOrCompound,
} from './distributed-select-fanout-soundness.js';

/**
 * Canonical planner for distributed SQL plans.
 * Owns query-table graph extraction, per-table partition planning,
 * join strategy selection, and diagnostics envelope construction.
 */
// The SELECT plan over its built parts; the first table plan names the index
// access.
function buildSelectPlan({planId, tablePlans, joinPlan, ast, fragmentPlans, mergePlan,
  diagnostics}) {
  const primaryTablePlan = Array.from(tablePlans.values())[0] || null;

  return {
    [PLAN_FIELD.PLAN_ID]: planId,
    [PLAN_FIELD.STATEMENT_TYPE]: DISTRIBUTED_STATEMENT_TYPE.SELECT,
    [PLAN_FIELD.TABLE_PLANS]: tablePlans,
    [PLAN_FIELD.JOIN_PLAN]: joinPlan,
    [PLAN_FIELD.SET_OPERATION_PLAN]: ast.setOperation || null,
    [PLAN_FIELD.FRAGMENT_PLANS]: fragmentPlans,
    [PLAN_FIELD.MERGE_PLAN]: mergePlan,
    [PLAN_FIELD.EXECUTION_POLICY]: DISTRIBUTED_EXECUTION_POLICY.READ_FAIL_CLOSED,
    [PLAN_FIELD.DIAGNOSTICS]: diagnostics,
    [PLAN_FIELD.INDEX_ACCESS]: primaryTablePlan?.indexAccess || null,
    [PLAN_FIELD.SELECTED_INDEX]: primaryTablePlan?.selectedIndex || null,
    [PLAN_FIELD.REJECTED_INDEXES]: Array.from(tablePlans.values())
      .flatMap((plan) => plan.rejectedIndexes || []),
  };
}

class DistributedQueryPlanner {
  constructor(options = {}) {
    this.partitionResolver = options.partitionResolver || null;
    this.getTablePartitions = options.getTablePartitions || (() => []);
    this.getTableInfo = options.getTableInfo || (() => null);
    this.queryOptimizer = options.queryOptimizer || null;
    this.indexService = options.indexService || null;
    this.structuralTemplates = new Map();
  }

  resolveStructuralTemplate(ast) {
    return resolveStructuralPlanTemplate(this, ast);
  }

  createReadExecutionPlan(ast, params = [], options = {}) {
    return this.planSelect(ast, params, options);
  }

  buildExplainPlan(ast, params = [], options = {}) {
    return this.planStatement(ast, params, {...options, explain: true});
  }

  planStatement(ast, params = [], options = {}) {
    switch (ast.type) {
    case QUERY_AST_TYPE.SELECT:
      return this.planSelect(ast, params, options);
    case QUERY_AST_TYPE.INSERT:
      return this.planInsert(ast, params, options);
    case QUERY_AST_TYPE.UPDATE:
      return this.planUpdate(ast, params, options);
    case QUERY_AST_TYPE.DELETE:
      return this.planDelete(ast, params, options);
    default:
      return null;
    }
  }

  resolveSelectTableGraph(selectTemplate, ast) {
    return selectTemplate ?
      clonePlanStructure(selectTemplate.tableGraph) :
      this.extractTableGraph(ast);
  }

  /**
   * Plan a distributed SELECT statement.
   * @param {Object} ast - SELECT AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} options - Planning options.
   * @return {Object} Distributed query plan.
   */
  planSelect(ast, params = [], options = {}) {
    const structural = this.resolveStructuralTemplate(ast);
    const selectTemplate = structural?.selectTemplate || null;
    const tableGraph = this.resolveSelectTableGraph(selectTemplate, ast);
    const tablePlans = this.buildTablePlans(
      tableGraph,
      ast,
      params,
      selectTemplate?.tableTemplates || null,
    );
    const joinPlan = this.buildJoinPlan(ast, tablePlans);
    const fragmentPlans = this.buildReadFragmentPlans(
      tablePlans,
      ast,
      params,
      selectTemplate?.tableTemplates || null,
    );
    const mergePlan = selectTemplate ?
      clonePlanStructure(selectTemplate.mergePlan) :
      this.buildMergePlan(ast);
    const diagnostics = this.buildDiagnostics(
      tableGraph,
      tablePlans,
      joinPlan,
      options,
    );

    const planId = this.createDeterministicPlanId(
      DISTRIBUTED_STATEMENT_TYPE.SELECT,
      ast,
      params,
      tablePlans,
      joinPlan,
      structural?.normalizedAst || null,
    );

    return buildSelectPlan({
      planId, tablePlans, joinPlan, ast, fragmentPlans, mergePlan, diagnostics,
    });
  }

  /**
   * Plan a distributed INSERT statement.
   * @param {Object} ast - INSERT AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} _options - Planning options.
   * @return {Object} Distributed write plan.
   */
  planInsert(ast, params = [], _options = {}) {
    const structural = this.resolveStructuralTemplate(ast);
    const tableAlias = ast.table;
    const tableGraph = [{
      tableName: ast.table,
      tableAlias,
      joinType: null,
    }];
    const tablePlans = this.buildTablePlans(tableGraph, null, params);
    const planId = this.createDeterministicPlanId(
      DISTRIBUTED_STATEMENT_TYPE.INSERT,
      ast,
      params,
      tablePlans,
      null,
      structural?.normalizedAst || null,
    );
    return {
      [PLAN_FIELD.PLAN_ID]: planId,
      [PLAN_FIELD.STATEMENT_TYPE]: DISTRIBUTED_STATEMENT_TYPE.INSERT,
      [PLAN_FIELD.TABLE_PLANS]: tablePlans,
      [PLAN_FIELD.JOIN_PLAN]: null,
      [PLAN_FIELD.SET_OPERATION_PLAN]: null,
      [PLAN_FIELD.FRAGMENT_PLANS]: [],
      [PLAN_FIELD.MERGE_PLAN]: null,
      [PLAN_FIELD.EXECUTION_POLICY]: DISTRIBUTED_EXECUTION_POLICY.WRITE_FAIL_CLOSED,
      [PLAN_FIELD.DIAGNOSTICS]: this.buildDiagnostics(
        tableGraph,
        tablePlans,
        null,
        {},
      ),
    };
  }

  /**
   * Plan a distributed UPDATE statement.
   * @param {Object} ast - UPDATE AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} _options - Planning options.
   * @return {Object} Distributed write plan.
   */
  planUpdate(ast, params = [], _options = {}) {
    const structural = this.resolveStructuralTemplate(ast);
    const tableAlias = ast.table;
    this.assertUpdateDoesNotMutatePartitionKey(ast);
    const tableGraph = [{
      tableName: ast.table,
      tableAlias,
      joinType: null,
    }];
    const tablePlans = this.buildTablePlans(tableGraph, {
      where: ast.where,
      columns: null,
      joins: [],
    }, params);
    const planId = this.createDeterministicPlanId(
      DISTRIBUTED_STATEMENT_TYPE.UPDATE,
      ast,
      params,
      tablePlans,
      null,
      structural?.normalizedAst || null,
    );
    return {
      [PLAN_FIELD.PLAN_ID]: planId,
      [PLAN_FIELD.STATEMENT_TYPE]: DISTRIBUTED_STATEMENT_TYPE.UPDATE,
      [PLAN_FIELD.TABLE_PLANS]: tablePlans,
      [PLAN_FIELD.JOIN_PLAN]: null,
      [PLAN_FIELD.SET_OPERATION_PLAN]: null,
      [PLAN_FIELD.FRAGMENT_PLANS]: [],
      [PLAN_FIELD.MERGE_PLAN]: null,
      [PLAN_FIELD.EXECUTION_POLICY]: DISTRIBUTED_EXECUTION_POLICY.WRITE_FAIL_CLOSED,
      [PLAN_FIELD.DIAGNOSTICS]: this.buildDiagnostics(
        tableGraph,
        tablePlans,
        null,
        {},
      ),
    };
  }

  /**
   * Reject an UPDATE that assigns the table's partition key column.
   *
   * A key-changing UPDATE re-homes the row: extraction from the OLD key
   * (mirror routing) drops the write from every child when the new key
   * falls on the other side of an in-flight split, while extraction from
   * the NEW key skips the old home's DELETE — no execution order is
   * correct, and outside a split the row is silently stranded in the
   * old partition. Reject at plan time (fail closed) instead.
   * @param {Object} ast - UPDATE AST.
   * @return {void}
   */
  assertUpdateDoesNotMutatePartitionKey(ast) {
    const tableInfo = this.getTableInfo(ast?.table);
    const primaryKeyColumns = resolveDeclaredPrimaryKeyColumns(tableInfo);
    if (!Array.isArray(primaryKeyColumns) || primaryKeyColumns.length === 0) {
      return;
    }
    const assignments = Array.isArray(ast?.assignments) ?
      ast.assignments :
      [];
    const pkSet = new Set(primaryKeyColumns.map((c) => String(c).toLowerCase()));
    for (const assignment of assignments) {
      if (typeof assignment?.column === 'string' &&
          pkSet.has(assignment.column.toLowerCase())) {
        throw new Error(
          DISTRIBUTED_QUERY_ERROR_MSG.PARTITION_KEY_UPDATE_REJECTED_PREFIX +
          `'${assignment.column}'` +
          DISTRIBUTED_QUERY_ERROR_MSG.PARTITION_KEY_UPDATE_REJECTED_SUFFIX,
        );
      }
    }
  }

  /**
   * Plan a distributed DELETE statement.
   * @param {Object} ast - DELETE AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} _options - Planning options.
   * @return {Object} Distributed write plan.
   */
  planDelete(ast, params = [], _options = {}) {
    const structural = this.resolveStructuralTemplate(ast);
    const tableAlias = ast.table;
    const tableGraph = [{
      tableName: ast.table,
      tableAlias,
      joinType: null,
    }];
    const tablePlans = this.buildTablePlans(tableGraph, {
      where: ast.where,
      columns: null,
      joins: [],
    }, params);
    const planId = this.createDeterministicPlanId(
      DISTRIBUTED_STATEMENT_TYPE.DELETE,
      ast,
      params,
      tablePlans,
      null,
      structural?.normalizedAst || null,
    );
    return {
      [PLAN_FIELD.PLAN_ID]: planId,
      [PLAN_FIELD.STATEMENT_TYPE]: DISTRIBUTED_STATEMENT_TYPE.DELETE,
      [PLAN_FIELD.TABLE_PLANS]: tablePlans,
      [PLAN_FIELD.JOIN_PLAN]: null,
      [PLAN_FIELD.SET_OPERATION_PLAN]: null,
      [PLAN_FIELD.FRAGMENT_PLANS]: [],
      [PLAN_FIELD.MERGE_PLAN]: null,
      [PLAN_FIELD.EXECUTION_POLICY]: DISTRIBUTED_EXECUTION_POLICY.WRITE_FAIL_CLOSED,
      [PLAN_FIELD.DIAGNOSTICS]: this.buildDiagnostics(
        tableGraph,
        tablePlans,
        null,
        {},
      ),
    };
  }

  /**
   * Extract query table graph from a SELECT AST.
   * @param {Object} ast - SELECT AST.
   * @return {Object[]} Ordered table graph nodes.
   */
  extractTableGraph(ast) {
    if (!ast) {
      return [];
    }
    if (hasSubqueryCteOrCompound(ast)) {
      return collectAllBaseTableNames(ast).map((tableName) => ({
        tableName,
        tableAlias: tableName,
        joinType: null,
      }));
    }
    if (!ast.from) {
      return [];
    }

    const graph = [];
    const rootAlias = ast.from.alias || ast.from.name;
    graph.push({
      tableName: ast.from.name || null,
      tableAlias: rootAlias || null,
      joinType: null,
    });

    for (const join of ast.joins || []) {
      graph.push({
        tableName: join.table?.name || null,
        tableAlias: join.table?.alias || join.table?.name || null,
        joinType: join.joinType || null,
      });
    }

    return graph;
  }

  /**
   * Resolve optimizer hints and index access for one table plan.
   * @param {Object|null} ast - SELECT AST.
   * @param {string} tableName - Target table name.
   * @return {Object} Index access, selected index, and rejected indexes.
   * @private
   */
  resolveTablePlanIndexAccess(ast, tableName) {
    const optimization = this.queryOptimizer && ast &&
      typeof this.queryOptimizer.analyzeQuery === 'function' ?
      this.queryOptimizer.analyzeQuery(ast, tableName) :
      null;

    const selectedIndex = optimization?.selectedIndex ? {
      name: optimization.selectedIndex.indexName,
      indexName: optimization.selectedIndex.indexName,
      matchedColumns: optimization.selectedIndex.matchedColumns || [],
      scanType: DISTRIBUTED_SCAN_TYPE.INDEX_SCAN,
      selectivity: optimization.selectedIndex.selectivity,
      estimatedCost: optimization.selectedIndex.estimatedCost,
      equalityPrefixColumns: optimization.selectedIndex.equalityPrefixColumns || [],
      rangeColumn: optimization.selectedIndex.rangeColumn || null,
      orderBySatisfied: Boolean(optimization.selectedIndex.orderBySatisfied),
    } : null;

    const rejectedIndexes = (optimization?.rejectedIndexes || []).map((rej) => ({
      name: rej.indexName,
      indexName: rej.indexName,
      columns: rej.columns || [],
      reason: rej.reason,
    }));

    const indexAccess = {
      scanType: selectedIndex ?
        DISTRIBUTED_SCAN_TYPE.INDEX_SCAN :
        DISTRIBUTED_SCAN_TYPE.FULL_SCAN,
      selectedIndex,
      rejectedIndexes,
    };

    return {indexAccess, selectedIndex, rejectedIndexes};
  }

  // The table's local and partition-target predicates: the structural
  // template's when the statement has one, else derived from the AST.
  resolveTablePredicates(ast, tableAlias, tableTemplate) {
    const isNestedOrCompound = tableTemplate ?
      false :
      Boolean(ast && hasSubqueryCteOrCompound(ast));
    const localPredicate = tableTemplate ?
      tableTemplate.localPredicate :
      (isNestedOrCompound ?
        null :
        this.extractTableLocalPredicate(
          ast?.where || null,
          tableAlias,
        ));
    const targetPredicate = tableTemplate ?
      tableTemplate.targetPredicate :
      (isNestedOrCompound ?
        null :
        (localPredicate || ast?.where || null));
    return {localPredicate, targetPredicate};
  }

  /**
   * Build access plan for a single table node.
   * @param {Object} tableNode - Graph table node.
   * @param {Object|null} ast - SELECT AST.
   * @param {Array} params - Bound parameters.
   * @return {Object} Table access plan.
   * @private
   */
  buildSingleTablePlan(tableNode, ast, params, tableTemplate = null) {
    const tableName = tableNode.tableName;
    const tableAlias = tableNode.tableAlias;
    const partitions = this.getTablePartitions(tableName) || [];
    const {localPredicate, targetPredicate} =
      this.resolveTablePredicates(ast, tableAlias, tableTemplate);
    const partitionIds = this.partitionResolver ?
      this.partitionResolver.resolvePartitions(
        tableName,
        targetPredicate,
        partitions,
        {
          params,
          tableAliases: [tableAlias, tableName],
        },
      ) :
      partitions.map((partition) => partition.partition_id || partition.partitionId);

    const resolutionInfo = this.partitionResolver &&
      typeof this.partitionResolver.getLastResolutionInfo === 'function' ?
      this.partitionResolver.getLastResolutionInfo() :
      null;

    const {indexAccess, selectedIndex, rejectedIndexes} =
      this.resolveTablePlanIndexAccess(ast, tableName);

    const prunedEmpty =
      partitions.length > 0 &&
      partitionIds.length === 0 &&
      resolutionInfo?.prunedEmpty === true;

    return {
      tableName,
      tableAlias,
      partitions: partitionIds,
      prunedEmpty,
      localPredicate: tableTemplate ?
        clonePlanStructure(tableTemplate.localPredicate) :
        localPredicate,
      projectedColumns: tableTemplate ?
        clonePlanStructure(tableTemplate.projectedColumns) :
        this.extractProjectedColumns(ast, tableAlias),
      keyPredicateShape: resolutionInfo?.predicateShape ||
        DISTRIBUTED_PREDICATE_SHAPE.SCATTER,
      indexAccess,
      selectedIndex,
      rejectedIndexes,
    };
  }

  /**
   * Build per-table access plans for every table alias in the graph.
   * @param {Object[]} tableGraph - Ordered table graph.
   * @param {Object|null} ast - SELECT-like AST shape.
   * @param {Array} params - Bound parameters.
   * @param {Map<string, Object>|null} [tableTemplates] - Optional cached templates.
   * @return {Map<string, Object>} Table alias -> TableAccessPlan.
   */
  buildTablePlans(tableGraph, ast, params, tableTemplates = null) {
    const tablePlans = new Map();
    for (const tableNode of tableGraph) {
      if (tableNode.tableName && tableNode.tableAlias) {
        tablePlans.set(
          tableNode.tableAlias,
          this.buildSingleTablePlan(
            tableNode,
            ast,
            params,
            tableTemplates?.get(tableNode.tableAlias) || null,
          ),
        );
      }
    }
    return tablePlans;
  }

  /**
   * Build read fragment plans from per-table access plans.
   * @param {Map<string, Object>} tablePlans - Table access plans.
   * @param {Object} _ast - SELECT AST.
   * @param {Array} params - Bound parameters.
   * @param {Map<string, Object>|null} [tableTemplates] - Optional cached templates.
   * @return {Object[]} Fragment plans.
   */
  buildReadFragmentPlans(tablePlans, _ast, params, tableTemplates = null) {
    const fragments = [];
    for (const [tableAlias, tablePlan] of tablePlans) {
      const tableTemplate = tableTemplates?.get(tableAlias) || null;
      const fragmentSql = tableTemplate ?
        tableTemplate.fragmentSql :
        this.buildFragmentSql(tablePlan);
      const fragmentParams = this.resolveFragmentParams(
        tablePlan,
        params,
        tableTemplate?.fragmentParamNodes || null,
      );
      for (const partitionId of tablePlan.partitions) {
        fragments.push({
          fragmentId: `${tableAlias}:${partitionId}`,
          tableAlias,
          partitionId,
          sql: fragmentSql,
          params: fragmentParams,
          roleHint: DISTRIBUTED_ROLE_HINT.FOLLOWER_OK,
          pushdown: {
            predicatePushedDown: Boolean(tablePlan.localPredicate),
            projectionPushedDown: Array.isArray(tablePlan.projectedColumns),
          },
        });
      }
    }
    return fragments;
  }

  /**
   * Collect bound parameter values for one fragment's local predicate in exact
   * emitted placeholder order.
   * @param {Object} tablePlan - Table access plan.
   * @param {Array} params - Statement bound parameters.
   * @param {Object[]|null} [cachedParamNodes] - Pre-extracted parameter nodes.
   * @return {Array} Fragment-scoped parameter values.
   * @private
   */
  resolveFragmentParams(tablePlan, params, cachedParamNodes = null) {
    if (!tablePlan?.localPredicate) {
      return [];
    }
    const paramNodes = Array.isArray(cachedParamNodes) ?
      cachedParamNodes :
      renderExpressionWithParameters(
        tablePlan.localPredicate,
        (paramNode) => paramNode,
      ).params;
    if (paramNodes.length === 0) {
      return [];
    }
    const allBound = Array.isArray(params) && paramNodes.every(
      (node) =>
        Number.isInteger(node?.index) &&
        node.index >= 0 &&
        node.index < params.length &&
        params[node.index] !== undefined,
    );
    return allBound ?
      paramNodes.map((node) => params[node.index]) :
      params;
  }

  /**
   * Build merge-stage metadata from a SELECT AST.
   * @param {Object} ast - SELECT AST.
   * @return {Object} Merge plan.
   */
  buildMergePlan(ast) {
    return {
      needsDistinct: Boolean(ast.distinct),
      groupBy: ast.groupBy || null,
      having: ast.having || null,
      orderBy: ast.orderBy || null,
      limit: ast.limit || null,
    };
  }

  /**
   * Build join plan edges and selected execution strategies.
   * @param {Object} ast - SELECT AST.
   * @param {Map<string, Object>} tablePlans - Table access plans.
   * @return {Object[]|null} Join plan edges.
   */
  buildJoinPlan(ast, tablePlans) {
    if (!ast.joins || ast.joins.length === 0) {
      return null;
    }

    const joinPlan = [];
    let leftAlias = ast.from.alias || ast.from.name;
    for (const join of ast.joins) {
      const rightAlias = join.table?.alias || join.table?.name;
      if (!rightAlias) {
        continue;
      }
      const leftPlan = tablePlans.get(leftAlias);
      const rightPlan = tablePlans.get(rightAlias);
      const strategy = this.selectJoinStrategy(join, leftPlan, rightPlan);
      joinPlan.push({
        leftAlias,
        rightAlias,
        joinType: join.joinType || QUERY_JOIN_TYPE.INNER,
        strategy,
      });
      leftAlias = rightAlias;
    }
    return joinPlan;
  }

  /**
   * Select join strategy for a join edge.
   *
   * DIAGNOSTICS-ONLY LABEL: execution is single-strategy. The executor
   * (query-executor-join-execution.js) always runs performJoin — a hash
   * join for extractable equi-joins with a nested-loop fallback — and
   * no repartition engine exists. These labels survive only because
   * EXPLAIN DISTRIBUTED and plan diagnostics surface them
   * (sql-query-engine-statement-execution.js join_plan,
   * buildDiagnostics); do not branch execution on them.
   * @param {Object} join - JOIN AST node.
   * @param {Object|null} leftPlan - Left table access plan.
   * @param {Object|null} rightPlan - Right table access plan.
   * @return {string} Join strategy.
   */
  selectJoinStrategy(join, leftPlan, rightPlan) {
    if (!this.isEquiJoin(join)) {
      return DISTRIBUTED_JOIN_STRATEGY.NESTED_LOOP;
    }

    const leftPartitions = leftPlan?.partitions?.length || 0;
    const rightPartitions = rightPlan?.partitions?.length || 0;
    const minPartitions = Math.min(leftPartitions, rightPartitions);
    const maxPartitions = Math.max(leftPartitions, rightPartitions);

    if (minPartitions <=
      DISTRIBUTED_PLANNER_DEFAULT.JOIN_BROADCAST_PARTITION_THRESHOLD) {
      return DISTRIBUTED_JOIN_STRATEGY.BROADCAST;
    }
    if (maxPartitions > minPartitions) {
      return DISTRIBUTED_JOIN_STRATEGY.REPARTITION;
    }
    return DISTRIBUTED_JOIN_STRATEGY.REPARTITION;
  }

  /**
   * Check if join condition is an equality between two column refs.
   * @param {Object} join - JOIN AST node.
   * @return {boolean} True when equi-join is detected.
   */
  isEquiJoin(join) {
    const condition = join?.condition;
    if (!condition || condition.type !== QUERY_AST_NODE.BINARY) {
      return false;
    }
    if (condition.operator !== QUERY_OPERATOR.EQUALS) {
      return false;
    }
    return condition.left?.type === QUERY_AST_NODE.COLUMN_REF &&
      condition.right?.type === QUERY_AST_NODE.COLUMN_REF;
  }

  /**
   * Build planner diagnostics envelope.
   * @param {Object[]} tableGraph - Table graph.
   * @param {Map<string, Object>} tablePlans - Table access plans.
   * @param {Object[]|null} joinPlan - Join plan.
   * @param {Object} options - Planner options.
   * @return {Object} Diagnostics payload.
   */
  buildDiagnostics(tableGraph, tablePlans, joinPlan, options) {
    const tablePlansArray = Array.from(tablePlans.values());
    const pushdownDecisions = tablePlansArray.map((tablePlan) => ({
      tableAlias: tablePlan.tableAlias,
      predicatePushedDown: Boolean(tablePlan.localPredicate),
      projectionPushedDown: Array.isArray(tablePlan.projectedColumns),
      projectedColumnCount: Array.isArray(tablePlan.projectedColumns) ?
        tablePlan.projectedColumns.length :
        null,
      indexAccess: tablePlan.indexAccess || null,
      selectedIndex: tablePlan.selectedIndex || null,
      rejectedIndexes: tablePlan.rejectedIndexes || [],
    }));

    const primaryPlan = tablePlansArray[0];
    const selectedIndex = primaryPlan?.selectedIndex || null;
    const rejectedIndexes = tablePlansArray.flatMap((p) => p.rejectedIndexes || []);
    const indexAccess = primaryPlan?.indexAccess || {
      scanType: selectedIndex ?
        DISTRIBUTED_SCAN_TYPE.INDEX_SCAN :
        DISTRIBUTED_SCAN_TYPE.FULL_SCAN,
      selectedIndex,
      rejectedIndexes,
    };

    return {
      tableGraph,
      tablePlans: tablePlansArray,
      joinPlan: joinPlan || null,
      pushdownDecisions,
      indexAccess,
      selectedIndex,
      rejectedIndexes,
      explain: options.explain === true,
      generatedAt: Date.now(),
    };
  }

  createDeterministicPlanId(
    statementType,
    ast,
    params,
    tablePlans,
    joinPlan,
    preNormalizedAst = null,
  ) {
    return createDeterministicPlanId(
      statementType,
      ast,
      params,
      tablePlans,
      joinPlan,
      preNormalizedAst,
    );
  }

  normalizePlanPayload(value) {
    return normalizePlanPayload(value);
  }

  extractTableLocalPredicate(expr, tableAlias) {
    return extractTableLocalPredicate(expr, tableAlias);
  }

  expressionReferencesAlias(expr, tableAlias) {
    return expressionReferencesAlias(expr, tableAlias);
  }

  extractProjectedColumns(ast, tableAlias) {
    return extractProjectedColumns(ast, tableAlias);
  }

  collectProjectedColumns(expr, tableAlias, out) {
    return collectProjectedColumns(expr, tableAlias, out);
  }

  buildFragmentSql(tablePlan) {
    const projection = Array.isArray(tablePlan.projectedColumns) &&
      tablePlan.projectedColumns.length > 0 ?
      tablePlan.projectedColumns.join(', ') :
      '*';
    const aliasSuffix = tablePlan.tableAlias &&
      tablePlan.tableAlias !== tablePlan.tableName ?
      ` AS ${renderSqliteIdentifier(tablePlan.tableAlias)}` :
      '';
    let sql =
      `SELECT ${projection} FROM ` +
      `${renderSqliteIdentifier(tablePlan.tableName)}${aliasSuffix}`;
    if (tablePlan.localPredicate) {
      sql += ` WHERE ${renderExpression(tablePlan.localPredicate)}`;
    }
    return sql;
  }
}

export {DistributedQueryPlanner};
