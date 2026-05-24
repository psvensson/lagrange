import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';

const LOCAL_STR_AND = 'AND';
const LOCAL_STR_OR = 'OR';
const LOCAL_STR_EQUALS = '=';
const LOCAL_STR_151ZF = '<>';
const LOCAL_STR_GDTVK = '>';
const LOCAL_STR_4PO0L = '>=';
const LOCAL_STR_FTUO6 = '<';
const LOCAL_STR_15BZ1 = '<=';
const LOCAL_STR_IS_NULL = 'IS NULL';
const LOCAL_STR_IS_NOT_NULL = 'IS NOT NULL';
const LOCAL_STR_NOT = 'NOT';
const LOCAL_STR_HYPHEN = '-';
const LOCAL_STR_ASC = 'ASC';
const LOCAL_STR_DESC = 'DESC';

const {
  ADMIN_CACHE_DUMP,
  ADMIN_CACHE_OBSERVATION_TABLES,
  AST_TYPE,
  EXPR_TYPE,
  NUM,
  SQLParser,
  TYPEOF,
  normalizeIdentifier,
} = ADMIN_WEBSOCKET_API_SHARED;

const ADMIN_WEBSOCKET_LOCAL_OBSERVATION_METHODS = {
  /**
   * Execute one simple single-table system observation query from the local
   * cache instead of routing it back through SqlCore.
   *
   * These admin observation reads must stay observational. If shared metadata
   * is incomplete, callers should see the stale local picture or use the
   * explicit snapshot/discovery owners rather than silently reopening repair
   * work from a raw table read.
   *
   * @param {string} sql
   * @param {Array<*>} params
   * @return {Object|null}
   * @private
   */
  tryExecuteLocalSystemTableObservationQuery(sql, params = []) {
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION ||
      typeof sql !== TYPEOF.STRING
    ) {
      return null;
    }

    let ast;
    try {
      ast = new SQLParser(sql).parse();
    } catch (_error) {
      return null;
    }

    if (
      ast?.type !== AST_TYPE.SELECT ||
      !ast.from ||
      ast.from.subquery ||
      (Array.isArray(ast.joins) && ast.joins.length > NUM.ZERO) ||
      ast.distinct === true ||
      ast.groupBy ||
      ast.having ||
      ast.ctes ||
      ast.recursive === true ||
      ast.setOperation
    ) {
      return null;
    }

    const tableName = normalizeIdentifier(ast.from.name);
    if (!tableName || !ADMIN_CACHE_OBSERVATION_TABLES.has(tableName)) {
      return null;
    }

    try {
      let rows = this.systemTableCache.getAll(tableName);
      rows = Array.isArray(rows) ? rows.map((row) => ({...row})) : [];
      rows = rows.filter((row) =>
        this.evaluateLocalSystemTableObservationExpression(
          ast.where,
          row,
          params,
        ),
      );
      rows = this.sortLocalSystemTableObservationRows(
        rows,
        ast.orderBy,
        params,
      );
      rows = this.limitLocalSystemTableObservationRows(rows, ast.limit);
      rows = this.projectLocalSystemTableObservationRows(
        rows,
        ast.columns,
        params,
      );
      if (rows === null) {
        return null;
      }
      return {
        success: true,
        rows,
        count: rows.length,
        partitions: this.resolveLocalSystemTableObservationPartitions(
          tableName,
          rows,
        ),
        tableName,
      };
    } catch (_error) {
      return null;
    }
  },

  /**
   * Evaluate one cache-backed WHERE expression against one row.
   * @param {Object|null} expr
   * @param {Object} row
   * @param {Array<*>} params
   * @return {boolean}
   * @private
   */
  evaluateLocalSystemTableObservationExpression(expr, row, params = []) {
    if (!expr) {
      return true;
    }

    if (expr.type === EXPR_TYPE.BINARY) {
      if (expr.operator === LOCAL_STR_AND) {
        return (
          this.evaluateLocalSystemTableObservationExpression(
            expr.left,
            row,
            params,
          ) &&
          this.evaluateLocalSystemTableObservationExpression(
            expr.right,
            row,
            params,
          )
        );
      }
      if (expr.operator === LOCAL_STR_OR) {
        return (
          this.evaluateLocalSystemTableObservationExpression(
            expr.left,
            row,
            params,
          ) ||
          this.evaluateLocalSystemTableObservationExpression(
            expr.right,
            row,
            params,
          )
        );
      }

      const leftValue = this.resolveLocalSystemTableObservationValue(
        expr.left,
        row,
        params,
      );
      const rightValue = this.resolveLocalSystemTableObservationValue(
        expr.right,
        row,
        params,
      );
      const comparison = this.compareLocalSystemTableObservationValues(
        leftValue,
        rightValue,
      );

      switch (expr.operator) {
      case LOCAL_STR_EQUALS:
        return comparison === NUM.ZERO;
      case LOCAL_STR_151ZF:
        return comparison !== NUM.ZERO;
      case LOCAL_STR_GDTVK:
        return comparison > NUM.ZERO;
      case LOCAL_STR_4PO0L:
        return comparison >= NUM.ZERO;
      case LOCAL_STR_FTUO6:
        return comparison < NUM.ZERO;
      case LOCAL_STR_15BZ1:
        return comparison <= NUM.ZERO;
      case LOCAL_STR_IS_NULL:
        return leftValue === null || leftValue === undefined;
      case LOCAL_STR_IS_NOT_NULL:
        return leftValue !== null && leftValue !== undefined;
      default:
        throw new Error(
          `Unsupported local admin cache operator: ${expr.operator}`,
        );
      }
    }

    if (expr.type === EXPR_TYPE.IN) {
      const candidate = this.resolveLocalSystemTableObservationValue(
        expr.expression,
        row,
        params,
      );
      const values = Array.isArray(expr.values) ? expr.values : [];
      const matched = values.some((valueExpr) => {
        const value = this.resolveLocalSystemTableObservationValue(
          valueExpr,
          row,
          params,
        );
        return (
          this.compareLocalSystemTableObservationValues(candidate, value) ===
          NUM.ZERO
        );
      });
      return expr.negated === true ? !matched : matched;
    }

    if (expr.type === EXPR_TYPE.LIKE) {
      const candidate = this.resolveLocalSystemTableObservationValue(
        expr.expression,
        row,
        params,
      );
      const pattern = this.resolveLocalSystemTableObservationValue(
        expr.pattern,
        row,
        params,
      );
      const matched = this.matchesLocalSystemTableObservationLike(
        candidate,
        pattern,
      );
      return expr.negated === true ? !matched : matched;
    }

    if (expr.type === EXPR_TYPE.UNARY && expr.operator === LOCAL_STR_NOT) {
      return !this.evaluateLocalSystemTableObservationExpression(
        expr.operand,
        row,
        params,
      );
    }

    return Boolean(
      this.resolveLocalSystemTableObservationValue(expr, row, params),
    );
  },

  /**
   * Resolve one supported expression value against one cache row.
   * @param {Object|null} expr
   * @param {Object} row
   * @param {Array<*>} params
   * @return {*}
   * @private
   */
  resolveLocalSystemTableObservationValue(expr, row, params = []) {
    if (!expr) {
      return null;
    }

    switch (expr.type) {
    case EXPR_TYPE.LITERAL:
      return expr.value;
    case EXPR_TYPE.PARAMETER:
      return params[expr.index];
    case EXPR_TYPE.COLUMN:
      return this.resolveLocalSystemTableObservationValue(
        expr.expression,
        row,
        params,
      );
    case EXPR_TYPE.COLUMN_REF: {
      const directValue = row?.[expr.column];
      if (directValue !== undefined) {
        return directValue;
      }
      const normalizedColumn = normalizeIdentifier(expr.column);
      if (!normalizedColumn) {
        return undefined;
      }
      for (const [key, value] of Object.entries(row || {})) {
        if (normalizeIdentifier(key) === normalizedColumn) {
          return value;
        }
      }
      return undefined;
    }
    case EXPR_TYPE.UNARY:
      if (expr.operator === LOCAL_STR_HYPHEN) {
        const value = Number(
          this.resolveLocalSystemTableObservationValue(
            expr.operand,
            row,
            params,
          ),
        );
        return Number.isFinite(value) ? -value : null;
      }
      return this.resolveLocalSystemTableObservationValue(
        expr.operand,
        row,
        params,
      );
    default:
      throw new Error(
        `Unsupported local admin cache expression: ${expr.type}`,
      );
    }
  },

  /**
   * Compare two cache observation values.
   * @param {*} left
   * @param {*} right
   * @return {number}
   * @private
   */
  compareLocalSystemTableObservationValues(left, right) {
    if (left === right) {
      return NUM.ZERO;
    }
    if (left === null || left === undefined) {
      return NUM.NEGATIVE_ONE;
    }
    if (right === null || right === undefined) {
      return NUM.ONE;
    }

    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (
      Number.isFinite(leftNumber) &&
      Number.isFinite(rightNumber) &&
      String(left).trim().length > NUM.ZERO &&
      String(right).trim().length > NUM.ZERO
    ) {
      return leftNumber - rightNumber;
    }

    return String(left).localeCompare(String(right));
  },

  /**
   * Apply column projection for one local cache query result set.
   * @param {Object[]} rows
   * @param {Object[]|null} columns
   * @param {Array<*>} params
   * @return {Object[]|null}
   * @private
   */
  projectLocalSystemTableObservationRows(rows, columns, params = []) {
    if (
      !Array.isArray(columns) ||
      columns.length === NUM.ZERO ||
      columns.some((column) => column?.type === EXPR_TYPE.STAR)
    ) {
      return rows.map((row) => ({...row}));
    }

    const projectedRows = [];
    for (const row of rows) {
      const projected = {};
      for (const column of columns) {
        if (
          column?.type !== EXPR_TYPE.COLUMN ||
          column.expression?.type !== EXPR_TYPE.COLUMN_REF
        ) {
          return null;
        }
        const key =
          typeof column.alias === TYPEOF.STRING &&
          column.alias.length > NUM.ZERO ?
            column.alias :
            column.expression.column;
        projected[key] = this.resolveLocalSystemTableObservationValue(
          column.expression,
          row,
          params,
        );
      }
      projectedRows.push(projected);
    }

    return projectedRows;
  },

  /**
   * Apply ORDER BY clauses for one local cache query result set.
   * @param {Object[]} rows
   * @param {Object[]|null} orderBy
   * @param {Array<*>} params
   * @return {Object[]}
   * @private
   */
  sortLocalSystemTableObservationRows(rows, orderBy, params = []) {
    if (!Array.isArray(orderBy) || orderBy.length === NUM.ZERO) {
      return rows;
    }

    return [...rows].sort((leftRow, rightRow) => {
      for (const ordering of orderBy) {
        const leftValue = this.resolveLocalSystemTableObservationValue(
          ordering.expression,
          leftRow,
          params,
        );
        const rightValue = this.resolveLocalSystemTableObservationValue(
          ordering.expression,
          rightRow,
          params,
        );
        const comparison = this.compareLocalSystemTableObservationValues(
          leftValue,
          rightValue,
        );
        if (comparison !== NUM.ZERO) {
          return String(ordering.direction || LOCAL_STR_ASC).toUpperCase() ===
            LOCAL_STR_DESC ?
            -comparison :
            comparison;
        }
      }
      return NUM.ZERO;
    });
  },

  /**
   * Apply LIMIT/OFFSET clauses for one local cache query result set.
   * @param {Object[]} rows
   * @param {Object|null} limit
   * @return {Object[]}
   * @private
   */
  limitLocalSystemTableObservationRows(rows, limit) {
    if (!limit || typeof limit !== TYPEOF.OBJECT) {
      return rows;
    }

    const count = Number(limit.count);
    const offset = Number(limit.offset);
    const normalizedOffset =
      Number.isFinite(offset) && offset > NUM.ZERO ?
        Math.floor(offset) :
        NUM.ZERO;
    const normalizedCount =
      Number.isFinite(count) && count >= NUM.ZERO ? Math.floor(count) : null;

    if (normalizedCount === null) {
      return rows.slice(normalizedOffset);
    }

    return rows.slice(normalizedOffset, normalizedOffset + normalizedCount);
  },
};

export {ADMIN_WEBSOCKET_LOCAL_OBSERVATION_METHODS};
