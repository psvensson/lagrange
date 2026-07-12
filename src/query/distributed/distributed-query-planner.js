import {createHash} from 'node:crypto';
import {NUM} from '../../constants/index.js';
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
  DISTRIBUTED_ROLE_HINT,
  DISTRIBUTED_STATEMENT_TYPE,
} from './distributed-query-plan-constants.js';

const LOCAL_STR_NULL = 'NULL';
const LOCAL_STR_SQUOTE_SQUOTE = '\'\'';
const LOCAL_STR_QUESTION = '?';

const PLAN_HASH = Object.freeze({
  SHA1: 'sha1',
  HEX: 'hex',
  PREFIX: 'dqp-',
  LENGTH: NUM.SIXTEEN,
});

/**
 * Canonical planner for distributed SQL plans.
 * Owns query-table graph extraction, per-table partition planning,
 * join strategy selection, and diagnostics envelope construction.
 */
class DistributedQueryPlanner {
  /**
   * @param {Object} options
   * @param {Object} options.partitionResolver
   * @param {Function} options.getTablePartitions
   * @param {Function} [options.getTableInfo]
   */
  constructor(options = {}) {
    this.partitionResolver = options.partitionResolver || null;
    this.getTablePartitions = options.getTablePartitions ||
      (() => []);
    this.getTableInfo = options.getTableInfo ||
      (() => null);
  }

  /**
   * Build a canonical distributed query plan for a statement AST.
   * @param {Object} ast - Parsed statement AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} options - Planning options.
   * @return {Object} Distributed plan object.
   */
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

  /**
   * Plan a distributed SELECT statement.
   * @param {Object} ast - SELECT AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} options - Planning options.
   * @return {Object} Distributed query plan.
   */
  planSelect(ast, params = [], options = {}) {
    const tableGraph = this.extractTableGraph(ast);
    const tablePlans = this.buildTablePlans(tableGraph, ast, params);
    const joinPlan = this.buildJoinPlan(ast, tablePlans);
    const fragmentPlans = this.buildReadFragmentPlans(tablePlans, ast, params);
    const mergePlan = this.buildMergePlan(ast);
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
    );

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
    };
  }

  /**
   * Plan a distributed INSERT statement.
   * @param {Object} ast - INSERT AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} _options - Planning options.
   * @return {Object} Distributed write plan.
   */
  planInsert(ast, params = [], _options = {}) {
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
      DISTRIBUTED_STATEMENT_TYPE.UPDATE,
      ast,
      params,
      tablePlans,
      null,
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
   * Plan a distributed DELETE statement.
   * @param {Object} ast - DELETE AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} _options - Planning options.
   * @return {Object} Distributed write plan.
   */
  planDelete(ast, params = [], _options = {}) {
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
    if (!ast || !ast.from) {
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
   * Build per-table access plans for every table alias in the graph.
   * @param {Object[]} tableGraph - Ordered table graph.
   * @param {Object|null} ast - SELECT-like AST shape.
   * @param {Array} params - Bound parameters.
   * @return {Map<string, Object>} Table alias -> TableAccessPlan.
   */
  buildTablePlans(tableGraph, ast, params) {
    const tablePlans = new Map();
    for (const tableNode of tableGraph) {
      if (!tableNode.tableName || !tableNode.tableAlias) {
        continue;
      }

      const tableName = tableNode.tableName;
      const tableAlias = tableNode.tableAlias;
      const partitions = this.getTablePartitions(tableName) || [];
      const localPredicate = this.extractTableLocalPredicate(
        ast?.where || null,
        tableAlias,
      );
      const targetPredicate = localPredicate || ast?.where || null;
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

      tablePlans.set(tableAlias, {
        tableName,
        tableAlias,
        partitions: partitionIds,
        localPredicate,
        projectedColumns: this.extractProjectedColumns(ast, tableAlias),
        keyPredicateShape: resolutionInfo?.predicateShape ||
          DISTRIBUTED_PREDICATE_SHAPE.SCATTER,
      });
    }
    return tablePlans;
  }

  /**
   * Build read fragment plans from per-table access plans.
   * @param {Map<string, Object>} tablePlans - Table access plans.
   * @param {Object} _ast - SELECT AST.
   * @param {Array} params - Bound parameters.
   * @return {Object[]} Fragment plans.
   */
  buildReadFragmentPlans(tablePlans, _ast, params) {
    const fragments = [];
    for (const [tableAlias, tablePlan] of tablePlans) {
      const fragmentSql = this.buildFragmentSql(tablePlan);
      for (const partitionId of tablePlan.partitions) {
        fragments.push({
          fragmentId: `${tableAlias}:${partitionId}`,
          tableAlias,
          partitionId,
          sql: fragmentSql,
          params,
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
    const pushdownDecisions = Array.from(tablePlans.values()).map((tablePlan) => ({
      tableAlias: tablePlan.tableAlias,
      predicatePushedDown: Boolean(tablePlan.localPredicate),
      projectionPushedDown: Array.isArray(tablePlan.projectedColumns),
      projectedColumnCount: Array.isArray(tablePlan.projectedColumns) ?
        tablePlan.projectedColumns.length :
        null,
    }));

    return {
      tableGraph,
      tablePlans: Array.from(tablePlans.values()),
      joinPlan: joinPlan || null,
      pushdownDecisions,
      explain: options.explain === true,
      generatedAt: Date.now(),
    };
  }

  /**
   * Build deterministic plan ID from normalized planning payload.
   * @param {string} statementType - Statement type.
   * @param {Object} ast - Statement AST.
   * @param {Array} params - Bound params.
   * @param {Map<string, Object>} tablePlans - Table access plans.
   * @param {Object[]|null} joinPlan - Join plan.
   * @return {string} Deterministic plan ID.
   */
  createDeterministicPlanId(statementType, ast, params, tablePlans, joinPlan) {
    const serializedTablePlans = Array.from(tablePlans.entries())
      .map(([alias, plan]) => ({
        alias,
        tableName: plan.tableName,
        partitions: [...plan.partitions].sort(),
        keyPredicateShape: plan.keyPredicateShape,
      }))
      .sort((left, right) => left.alias.localeCompare(right.alias));

    const payload = {
      statementType,
      ast: this.normalizePlanPayload(ast),
      paramsCount: params.length,
      tablePlans: serializedTablePlans,
      joinPlan: joinPlan || null,
    };
    const digest = createHash(PLAN_HASH.SHA1)
      .update(JSON.stringify(payload))
      .digest(PLAN_HASH.HEX)
      .slice(0, PLAN_HASH.LENGTH);
    return `${PLAN_HASH.PREFIX}${digest}`;
  }

  /**
   * Normalize an object into a JSON-safe payload for deterministic hashing.
   * @param {*} value - Input value.
   * @return {*} Normalized value.
   */
  normalizePlanPayload(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => this.normalizePlanPayload(entry));
    }
    if (!value || typeof value !== 'object') {
      return value;
    }

    const normalized = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      const entry = value[key];
      if (typeof entry === 'function' || entry === undefined) {
        continue;
      }
      normalized[key] = this.normalizePlanPayload(entry);
    }
    return normalized;
  }

  /**
   * Extract table-local predicate expression from WHERE clause.
   * @param {Object|null} expr - WHERE expression.
   * @param {string} tableAlias - Target table alias.
   * @return {Object|null} Local predicate AST or null.
   */
  extractTableLocalPredicate(expr, tableAlias) {
    if (!expr) {
      return null;
    }
    if (expr.type === QUERY_AST_NODE.BINARY && expr.operator === QUERY_OPERATOR.AND) {
      const left = this.extractTableLocalPredicate(expr.left, tableAlias);
      const right = this.extractTableLocalPredicate(expr.right, tableAlias);
      if (left && right) {
        return {
          ...expr,
          left,
          right,
        };
      }
      return left || right || null;
    }
    if (expr.type === QUERY_AST_NODE.BINARY && expr.operator === QUERY_OPERATOR.OR) {
      const left = this.extractTableLocalPredicate(expr.left, tableAlias);
      const right = this.extractTableLocalPredicate(expr.right, tableAlias);
      if (left && right) {
        return {
          ...expr,
          left,
          right,
        };
      }
      return null;
    }
    return this.expressionReferencesAlias(expr, tableAlias) ? expr : null;
  }

  /**
   * Check whether expression references only a target table alias.
   * @param {Object} expr - Expression AST.
   * @param {string} tableAlias - Target table alias.
   * @return {boolean} True when local to target alias.
   */
  expressionReferencesAlias(expr, tableAlias) {
    if (!expr || typeof expr !== 'object') {
      return true;
    }
    if (expr.type === QUERY_AST_NODE.COLUMN_REF) {
      if (!expr.table) {
        return true;
      }
      return String(expr.table).toLowerCase() === String(tableAlias).toLowerCase();
    }
    if (expr.type === QUERY_AST_NODE.BINARY) {
      return this.expressionReferencesAlias(expr.left, tableAlias) &&
        this.expressionReferencesAlias(expr.right, tableAlias);
    }
    if (expr.type === QUERY_AST_NODE.UNARY) {
      return this.expressionReferencesAlias(expr.operand, tableAlias);
    }
    if (expr.type === QUERY_AST_NODE.IN) {
      const expressionLocal = this.expressionReferencesAlias(
        expr.expression,
        tableAlias,
      );
      if (!expressionLocal) {
        return false;
      }
      return (expr.values || []).every((valueExpr) =>
        this.expressionReferencesAlias(valueExpr, tableAlias),
      );
    }
    if (expr.type === QUERY_AST_NODE.BETWEEN) {
      return this.expressionReferencesAlias(expr.expression, tableAlias) &&
        this.expressionReferencesAlias(expr.low, tableAlias) &&
        this.expressionReferencesAlias(expr.high, tableAlias);
    }
    if (expr.type === QUERY_AST_NODE.LIKE) {
      return this.expressionReferencesAlias(expr.expression, tableAlias) &&
        this.expressionReferencesAlias(expr.pattern, tableAlias);
    }
    return true;
  }

  /**
   * Compute projected columns for a table alias.
   * @param {Object|null} ast - SELECT AST.
   * @param {string} tableAlias - Table alias.
   * @return {string[]|null} Projected columns or null for wildcard.
   */
  extractProjectedColumns(ast, tableAlias) {
    if (!ast || !Array.isArray(ast.columns)) {
      return null;
    }
    if (ast.columns.some((column) =>
      (column.type === QUERY_AST_NODE.STAR) ||
      (column.expression && column.expression.type === QUERY_AST_NODE.STAR))) {
      return null;
    }

    const projected = new Set();
    for (const column of ast.columns) {
      const expr = column.expression || column;
      this.collectProjectedColumns(expr, tableAlias, projected);
    }
    for (const join of ast.joins || []) {
      this.collectProjectedColumns(join.condition, tableAlias, projected);
    }
    if (projected.size === 0) {
      return null;
    }
    return Array.from(projected.values());
  }

  /**
   * Collect column refs for a table alias from an expression.
   * @param {Object} expr - Expression AST.
   * @param {string} tableAlias - Table alias.
   * @param {Set<string>} out - Output column set.
   */
  collectProjectedColumns(expr, tableAlias, out) {
    if (!expr || typeof expr !== 'object') {
      return;
    }
    if (expr.type === QUERY_AST_NODE.COLUMN_REF) {
      if (!expr.table ||
        String(expr.table).toLowerCase() === String(tableAlias).toLowerCase()) {
        if (expr.column) {
          out.add(expr.column);
        }
      }
      return;
    }
    if (expr.type === QUERY_AST_NODE.BINARY) {
      this.collectProjectedColumns(expr.left, tableAlias, out);
      this.collectProjectedColumns(expr.right, tableAlias, out);
      return;
    }
    if (expr.type === QUERY_AST_NODE.UNARY) {
      this.collectProjectedColumns(expr.operand, tableAlias, out);
      return;
    }
    if (expr.type === QUERY_AST_NODE.IN) {
      this.collectProjectedColumns(expr.expression, tableAlias, out);
      for (const valueExpr of expr.values || []) {
        this.collectProjectedColumns(valueExpr, tableAlias, out);
      }
      return;
    }
    if (expr.type === QUERY_AST_NODE.BETWEEN) {
      this.collectProjectedColumns(expr.expression, tableAlias, out);
      this.collectProjectedColumns(expr.low, tableAlias, out);
      this.collectProjectedColumns(expr.high, tableAlias, out);
      return;
    }
    if (expr.type === QUERY_AST_NODE.AGGREGATE) {
      this.collectProjectedColumns(expr.argument, tableAlias, out);
    }
  }

  /**
   * Build pushdown fragment SQL for one table access plan.
   * @param {Object} tablePlan - Table access plan.
   * @return {string} Fragment SQL.
   * @private
   */
  buildFragmentSql(tablePlan) {
    const projection = Array.isArray(tablePlan.projectedColumns) &&
      tablePlan.projectedColumns.length > 0 ?
      tablePlan.projectedColumns.join(', ') :
      '*';
    const aliasSuffix = tablePlan.tableAlias &&
      tablePlan.tableAlias !== tablePlan.tableName ?
      ` AS ${tablePlan.tableAlias}` :
      '';
    let sql = `SELECT ${projection} FROM ${tablePlan.tableName}${aliasSuffix}`;
    if (tablePlan.localPredicate) {
      sql += ` WHERE ${this.renderExpression(tablePlan.localPredicate)}`;
    }
    return sql;
  }

  /**
   * Render a planner expression to SQL for fragment diagnostics.
   * @param {Object} expr - Expression AST.
   * @return {string} SQL expression.
   * @private
   */
  renderExpression(expr) {
    if (!expr || typeof expr !== 'object') {
      return '';
    }

    if (expr.type === QUERY_AST_NODE.LITERAL) {
      if (expr.value === null) {
        return LOCAL_STR_NULL;
      }
      if (typeof expr.value === 'string') {
        return `'${expr.value.replace(/'/g, LOCAL_STR_SQUOTE_SQUOTE)}'`;
      }
      return String(expr.value);
    }

    if (expr.type === QUERY_AST_NODE.PARAMETER) {
      return LOCAL_STR_QUESTION;
    }

    if (expr.type === QUERY_AST_NODE.COLUMN_REF) {
      if (expr.table) {
        return `${expr.table}.${expr.column}`;
      }
      return expr.column;
    }

    if (expr.type === QUERY_AST_NODE.UNARY) {
      return `${expr.operator} ${this.renderExpression(expr.operand)}`;
    }

    if (expr.type === QUERY_AST_NODE.BINARY) {
      return `${this.renderExpression(expr.left)} ` +
        `${expr.operator} ` +
        `${this.renderExpression(expr.right)}`;
    }

    if (expr.type === QUERY_AST_NODE.IN) {
      const values = (expr.values || [])
        .map((valueExpr) => this.renderExpression(valueExpr))
        .join(', ');
      return `${this.renderExpression(expr.expression)} IN (${values})`;
    }

    if (expr.type === QUERY_AST_NODE.BETWEEN) {
      return `${this.renderExpression(expr.expression)} BETWEEN ` +
        `${this.renderExpression(expr.low)} AND ` +
        `${this.renderExpression(expr.high)}`;
    }

    if (expr.type === QUERY_AST_NODE.LIKE) {
      return `${this.renderExpression(expr.expression)} LIKE ` +
        `${this.renderExpression(expr.pattern)}`;
    }

    return '';
  }
}

export {DistributedQueryPlanner};
