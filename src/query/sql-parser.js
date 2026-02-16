/**
 * SQL Parser - Wrapper around node-sql-parser for distributed database.
 * Converts node-sql-parser AST to internal format used by query engine.
 * Supports SELECT, INSERT, UPDATE, DELETE with WHERE, ORDER BY, GROUP BY, LIMIT, JOIN.
 * Requirements: 7.1, 7.3
 */

import nodeSqlParser from 'node-sql-parser';
const {Parser} = nodeSqlParser;
import {LoggingService} from '../logging/logging-service.js';
import {AST_TYPE, EXPR_TYPE} from './parser-constants.js';
import {PARSER_DIALECT, PG_EXPR_TYPE} from './pg-compat-constants.js';
import {
  translateBooleanLiteral,
  translatePositionalParam,
  translateTypeCast,
  translateIlike,
  translateOnConflict,
} from './pg-translate.js';
import {translateFunctionCall} from './pg-function-registry.js';

const PARSER_CONFIG = Object.freeze({
  DATABASE: 'sqlite',
  DATABASE_PG: 'postgresql',
  SUBSYSTEM: 'sql-parser',
});

/**
 * PG AST node type identifiers from node-sql-parser in PG mode.
 */
const PG_NODE_TYPE = Object.freeze({
  VAR: 'var',
  CAST: 'cast',
  CASE: 'case',
  FUNCTION: 'function',
  EXTRACT: 'extract',
});

/**
 * PG AST prefix for positional parameters ($1, $2, ...).
 */
const PG_PARAM_PREFIX = '$';

/**
 * PG AST CASE arg type identifiers.
 */
const PG_CASE_ARG_TYPE = Object.freeze({
  WHEN: 'when',
  ELSE: 'else',
});

/**
 * EXISTS function name as produced by node-sql-parser PG mode.
 */
const PG_EXISTS_NAME = 'EXISTS';

const EXTERNAL_TYPE = Object.freeze({
  SELECT: 'select',
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete',
  CREATE: 'create',
  DROP: 'drop',
});

class SQLParser {
  constructor(sql, options = {}) {
    this.sql = sql;
    this.dialect = options.dialect || PARSER_DIALECT.SQLITE;
    this.parser = new Parser();
    this.logger = this.initLogger();
    this.positionalParams = [];
    this.parameterCounter = 0;
  }

  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(PARSER_CONFIG.SUBSYSTEM);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  parse() {
    this.positionalParams = [];
    this.parameterCounter = 0;
    const trimmedSql = this.sql.trim().toUpperCase();
    if (trimmedSql === 'BEGIN' || trimmedSql.startsWith('BEGIN ')) {
      return {type: AST_TYPE.BEGIN_TRANSACTION};
    }
    if (trimmedSql === 'COMMIT') {
      return {type: AST_TYPE.COMMIT};
    }
    if (trimmedSql === 'ROLLBACK') {
      return {type: AST_TYPE.ROLLBACK};
    }

    try {
      const dbMode = this.dialect === PARSER_DIALECT.POSTGRESQL
        ? PARSER_CONFIG.DATABASE_PG
        : PARSER_CONFIG.DATABASE;
      const externalAst = this.parser.astify(this.sql, {database: dbMode});
      const ast = this.convertAst(externalAst);
      if (this.dialect === PARSER_DIALECT.POSTGRESQL &&
          this.positionalParams.length > 0) {
        ast._paramMapping = this.positionalParams;
      }
      return ast;
    } catch (error) {
      const errorMsg = 'SQL Parse Error: ' + error.message;
      this.logger.error(errorMsg, {sql: this.sql});
      throw new Error(errorMsg);
    }
  }

  /**
   * Create a parameter placeholder node with a deterministic zero-based index.
   * This index preserves placeholder position across the converted AST.
   * @return {Object} Parameter expression node.
   * @private
   */
  createParameterNode() {
    const index = this.parameterCounter;
    this.parameterCounter += 1;
    return {type: EXPR_TYPE.PARAMETER, index};
  }

  convertAst(ast) {
    // Handle array result (e.g., when SQL ends with semicolon)
    if (Array.isArray(ast)) {
      if (ast.length === 0) {
        throw new Error('Empty SQL statement');
      }
      return this.convertAst(ast[0]);
    }

    switch (ast.type) {
    case EXTERNAL_TYPE.SELECT:
      return this.convertSelect(ast);
    case EXTERNAL_TYPE.INSERT:
      return this.convertInsert(ast);
    case EXTERNAL_TYPE.UPDATE:
      return this.convertUpdate(ast);
    case EXTERNAL_TYPE.DELETE:
      return this.convertDelete(ast);
    case EXTERNAL_TYPE.CREATE:
      return this.convertCreate(ast);
    case EXTERNAL_TYPE.DROP:
      return this.convertDrop(ast);
    default:
      throw new Error('Unsupported statement type: ' + ast.type);
    }
  }
  convertSelect(ast) {
    // PG mode: distinct is {type: 'DISTINCT'|null} vs SQLite string
    const distinct = typeof ast.distinct === 'object'
      ? ast.distinct?.type === 'DISTINCT'
      : ast.distinct === 'DISTINCT';

    const ctes = this.convertCtes(ast.with);
    const recursive = ast.with ?
      ast.with.some((c) => !!c.recursive) :
      false;

    const setOperation = this.convertSetOperation(ast);

    return {
      type: AST_TYPE.SELECT,
      distinct,
      columns: this.convertColumns(ast.columns),
      from: this.convertFrom(ast.from),
      joins: this.convertJoins(ast.from),
      where: ast.where ? this.convertExpression(ast.where) : null,
      groupBy: ast.groupby ? this.convertGroupBy(ast.groupby) : null,
      having: ast.having ? this.convertExpression(ast.having) : null,
      orderBy: ast.orderby ? this.convertOrderBy(ast.orderby) : null,
      limit: ast.limit ? this.convertLimit(ast.limit) : null,
      ctes,
      recursive,
      setOperation,
    };
  }

  /**
   * Convert WITH clause CTE definitions from node-sql-parser AST.
   * Handles both PG mode (stmt is direct select AST) and SQLite mode
   * (stmt wraps in {tableList, columnList, ast}).
   * @param {Array|null} withClause - Raw with clause array.
   * @returns {Array|null} Converted CTE definitions or null.
   */
  convertCtes(withClause) {
    if (!withClause || withClause.length === 0) {
      return null;
    }
    return withClause.map((cte) => {
      const name = cte.name?.value || cte.name;
      // PG mode: stmt is the select AST directly
      // SQLite mode: stmt wraps in {tableList, columnList, ast}
      const stmtAst = cte.stmt?.ast || cte.stmt;
      return {
        name,
        query: this.convertSelect(stmtAst),
        recursive: !!cte.recursive,
      };
    });
  }

  /**
   * Convert set operation (_next / set_op) from node-sql-parser AST.
   * Handles UNION, UNION ALL, INTERSECT, EXCEPT in both dialects.
   * @param {Object} ast - Raw select AST that may contain _next.
   * @returns {Object|null} Set operation node or null.
   */
  convertSetOperation(ast) {
    if (!ast._next || !ast.set_op) {
      return null;
    }
    return {
      type: ast.set_op.toUpperCase(),
      right: this.convertSelect(ast._next),
    };
  }

  convertInsert(ast) {
    const tableName = ast.table[0].table;
    const columns = ast.columns || null;
    const values = [];
    const insertMode = this.getInsertMode(ast);

    // node-sql-parser wraps values in {type: 'values', values: [...]}
    const valueRows = ast.values?.values || [];
    for (const row of valueRows) {
      const rowValues = [];
      const rowData = row.value || [];
      for (const val of rowData) {
        rowValues.push(this.convertValue(val));
      }
      values.push(rowValues);
    }

    const insertAst = {
      type: AST_TYPE.INSERT,
      table: tableName,
      columns,
      values,
      orReplace: insertMode === 'replace',
      orIgnore: insertMode === 'ignore',
      returning: this.convertReturning(ast.returning),
    };

    if (this.dialect === PARSER_DIALECT.POSTGRESQL && ast.conflict) {
      translateOnConflict(insertAst, ast.conflict);
    }

    return insertAst;
  }

  /**
   * Detect INSERT modifier mode from parser AST.
   * Supports node-sql-parser's `ast.or` shape and legacy `ast.prefix`.
   * @param {Object} ast - Raw insert AST.
   * @return {string|null} One of 'replace', 'ignore', or null.
   * @private
   */
  getInsertMode(ast) {
    if (Array.isArray(ast.or) && ast.or.length >= 2) {
      const mode = String(ast.or[1]?.value || '').toLowerCase();
      if (mode === 'replace' || mode === 'ignore') {
        return mode;
      }
    }

    const prefix = String(ast.prefix || '').toLowerCase();
    if (prefix === 'or replace') {
      return 'replace';
    }
    if (prefix === 'or ignore') {
      return 'ignore';
    }
    return null;
  }

  convertUpdate(ast) {
    const tableName = ast.table[0].table;
    const assignments = ast.set.map((s) => ({
      column: s.column,
      value: this.convertValue(s.value),
    }));
    return {
      type: AST_TYPE.UPDATE,
      table: tableName,
      assignments,
      where: ast.where ? this.convertExpression(ast.where) : null,
      returning: this.convertReturning(ast.returning),
    };
  }

  convertDelete(ast) {
    const tableName = ast.from[0].table;
    return {
      type: AST_TYPE.DELETE,
      table: tableName,
      where: ast.where ? this.convertExpression(ast.where) : null,
      returning: this.convertReturning(ast.returning),
    };
  }

  /**
   * Convert a RETURNING clause from node-sql-parser AST.
   * Handles both SQLite and PG mode AST shapes.
   * @param {Object|null} returning - Raw returning clause from parser AST.
   * @return {string[]|string|null} Column names, '*', or null.
   * @private
   */
  convertReturning(returning) {
    if (!returning || !returning.columns || returning.columns.length === 0) {
      return null;
    }
    const columns = returning.columns;
    // Check for RETURNING * — column is the string '*' in both modes
    if (columns.length === 1 && columns[0].expr &&
        columns[0].expr.type === 'column_ref' &&
        columns[0].expr.column === '*') {
      return '*';
    }
    // Extract column names — handle both PG and SQLite AST shapes
    const names = [];
    for (const col of columns) {
      const expr = col.expr;
      if (expr && expr.type === 'column_ref') {
        const colRef = expr.column;
        if (typeof colRef === 'string') {
          // SQLite mode: column is a plain string
          names.push(colRef);
        } else if (colRef && colRef.expr && colRef.expr.value) {
          // PG mode: column is {expr: {type: 'default', value: 'name'}}
          names.push(colRef.expr.value);
        }
      }
    }
    return names.length > 0 ? names : null;
  }

  convertCreate(ast) {
    if (ast.keyword === 'table') {
      return this.convertCreateTable(ast);
    }
    if (ast.keyword === 'index') {
      return this.convertCreateIndex(ast);
    }
    throw new Error('Unsupported CREATE type: ' + ast.keyword);
  }

  convertCreateTable(ast) {
    const tableName = ast.table[0].table;
    const columns = [];
    const tableConstraints = [];
    let primaryKey = null;

    for (const def of ast.create_definitions || []) {
      if (def.resource === 'column') {
        const column = {
          name: def.column.column,
          dataType: {
            name: def.definition.dataType,
            length: def.definition.length || null,
            precision: null,
            scale: null,
          },
          primaryKey: !!def.primary_key,
          notNull: def.nullable?.type === 'not null',
          unique: !!def.unique,
          defaultValue: def.default_val ? this.convertValue(def.default_val.value) : null,
        };
        columns.push(column);
        if (column.primaryKey && !primaryKey) {
          primaryKey = [column.name];
        }
      } else if (def.resource === 'constraint') {
        if (def.constraint_type === 'primary key') {
          const pkColumns = def.definition.map((d) => d.column);
          tableConstraints.push({type: 'PRIMARY_KEY', columns: pkColumns});
          primaryKey = pkColumns;
        } else if (def.constraint_type === 'unique') {
          const uniqueColumns = def.definition.map((d) => d.column);
          tableConstraints.push({type: 'UNIQUE', columns: uniqueColumns});
        }
      }
    }

    return {
      type: AST_TYPE.CREATE_TABLE,
      tableName,
      ifNotExists: !!ast.if_not_exists,
      columns,
      tableConstraints,
      primaryKey,
    };
  }

  convertCreateIndex(ast) {
    return {
      type: AST_TYPE.CREATE_INDEX,
      indexName: ast.index,
      tableName: ast.table.table,
      columns: ast.index_columns.map((c) => c.column),
      unique: !!ast.index_type?.includes('unique'),
      ifNotExists: !!ast.if_not_exists,
      indexType: 'btree',
    };
  }

  convertDrop(ast) {
    if (ast.keyword === 'table') {
      return {
        type: AST_TYPE.DROP_TABLE,
        tableName: ast.name[0].table,
        ifExists: !!ast.if_exists,
      };
    }
    if (ast.keyword === 'index') {
      return {
        type: AST_TYPE.DROP_INDEX,
        indexName: ast.name[0].table,
        tableName: null,
        ifExists: !!ast.if_exists,
      };
    }
    throw new Error('Unsupported DROP type: ' + ast.keyword);
  }

  convertColumns(columns) {
    return columns.map((col) => {
      if (col.expr.type === 'star' || col.expr.column === '*') {
        return {type: EXPR_TYPE.STAR, value: '*'};
      }
      return {
        type: EXPR_TYPE.COLUMN,
        expression: this.convertExpression(col.expr),
        alias: col.as || null,
      };
    });
  }

  convertFrom(from) {
    if (!from || from.length === 0) {
      return null;
    }
    const firstTable = from[0];

    // Derived table: FROM (SELECT ...) AS alias
    if (firstTable.expr?.ast) {
      return {
        type: EXPR_TYPE.TABLE,
        name: null,
        alias: firstTable.as || null,
        subquery: this.convertSelect(firstTable.expr.ast),
      };
    }

    return {
      type: EXPR_TYPE.TABLE,
      name: firstTable.table,
      alias: firstTable.as || null,
    };
  }

  convertJoins(from) {
    if (!from || from.length <= 1) {
      return [];
    }
    const joins = [];
    for (let i = 1; i < from.length; i++) {
      const joinDef = from[i];
      if (joinDef.join) {
        // Derived table in JOIN: joinDef.expr.ast exists
        let table;
        if (joinDef.expr?.ast) {
          table = {
            type: EXPR_TYPE.TABLE,
            name: null,
            alias: joinDef.as || null,
            subquery: this.convertSelect(joinDef.expr.ast),
          };
        } else {
          table = {
            type: EXPR_TYPE.TABLE,
            name: joinDef.table,
            alias: joinDef.as || null,
          };
        }
        joins.push({
          type: EXPR_TYPE.JOIN,
          joinType: this.normalizeJoinType(joinDef.join),
          table,
          condition: joinDef.on ?
            this.convertExpression(joinDef.on) : null,
        });
      }
    }
    return joins;
  }

  normalizeJoinType(joinType) {
    const upper = joinType.toUpperCase();
    if (upper.includes('LEFT')) return 'LEFT';
    if (upper.includes('RIGHT')) return 'RIGHT';
    if (upper.includes('CROSS')) return 'CROSS';
    return 'INNER';
  }

  convertGroupBy(groupBy) {
    const columns = groupBy.columns || groupBy;
    if (!Array.isArray(columns)) {
      return [this.convertExpression(columns)];
    }
    return columns.map((g) => this.convertExpression(g));
  }

  convertOrderBy(orderBy) {
    return orderBy.map((o) => ({
      expression: this.convertExpression(o.expr),
      direction: o.type || 'ASC',
    }));
  }

  convertLimit(limit) {
    if (!limit || !limit.value) {
      return null;
    }
    const values = limit.value;
    const count = values[0]?.value;
    const offset = values.length > 1 ? values[1]?.value : null;
    return {count, offset};
  }

  convertExpression(expr) {
    if (!expr) {
      return null;
    }

    // PG-specific node types (only when dialect is postgresql)
    if (this.dialect === PARSER_DIALECT.POSTGRESQL) {
      const pgResult = this.convertPgExpression(expr);
      if (pgResult) {
        return pgResult;
      }
    }

    // Scalar subquery: node has .ast property (SELECT wrapped in parens)
    if (expr.ast && expr.parentheses) {
      return {
        type: PG_EXPR_TYPE.SUBQUERY,
        query: this.convertSelect(expr.ast),
      };
    }

    switch (expr.type) {
    case 'binary_expr':
      return this.convertBinaryExpr(expr);
    case 'unary_expr':
      return this.convertUnaryExpr(expr);
    case 'column_ref':
      return this.convertColumnRef(expr);
    case 'number':
      return {type: EXPR_TYPE.LITERAL, value: expr.value};
    case 'single_quote_string':
    case 'double_quote_string':
    case 'string':
      return {type: EXPR_TYPE.LITERAL, value: expr.value};
    case 'bool':
      return {type: EXPR_TYPE.LITERAL, value: expr.value};
    case 'null':
      return {type: EXPR_TYPE.LITERAL, value: null};
    case 'origin':
      if (expr.value === '?') {
        return this.createParameterNode();
      }
      return {type: EXPR_TYPE.LITERAL, value: expr.value};
    case 'aggr_func':
      return this.convertAggregate(expr);
    case 'star':
      return {type: EXPR_TYPE.STAR, value: '*'};
    case 'expr_list':
      return expr.value.map((v) => this.convertExpression(v));
    default:
      if (expr.value !== undefined) {
        return {type: EXPR_TYPE.LITERAL, value: expr.value};
      }
      throw new Error('Unknown expression type: ' + expr.type);
    }
  }

  /**
   * Handles PG-specific AST node types produced by node-sql-parser
   * in postgresql mode. Returns null if the node is not PG-specific
   * and should fall through to the standard switch.
   * @param {Object} expr - PG AST expression node.
   * @returns {Object|null} Converted Internal_AST node, or null.
   */
  convertPgExpression(expr) {
    const convertExprFn = this.convertExpression.bind(this);

    switch (expr.type) {
    case PG_NODE_TYPE.VAR:
      if (expr.prefix === PG_PARAM_PREFIX) {
        translatePositionalParam(
          {value: expr.name}, this.positionalParams,
        );
        return this.createParameterNode();
      }
      return null;

    case PG_NODE_TYPE.CAST:
      return translateTypeCast(
        {expr: expr.expr, target: {dataType: expr.target[0]?.dataType}},
        convertExprFn,
      );

    case PG_NODE_TYPE.CASE:
      return this.convertPgCase(expr);

    case PG_NODE_TYPE.FUNCTION:
      return this.convertPgFunction(expr);

    case PG_NODE_TYPE.EXTRACT:
      return this.convertPgExtract(expr);

    case 'bool':
      return translateBooleanLiteral(expr);

    default:
      return null;
    }
  }

  /**
   * Converts a PG CASE expression to an Internal_AST CASE node.
   * @param {Object} expr - PG case AST node.
   * @returns {Object} Internal_AST case node.
   */
  convertPgCase(expr) {
    const conditions = [];
    let elseExpr = null;

    for (const arg of expr.args) {
      if (arg.type === PG_CASE_ARG_TYPE.WHEN) {
        conditions.push({
          when: this.convertExpression(arg.cond),
          then: this.convertExpression(arg.result),
        });
      } else if (arg.type === PG_CASE_ARG_TYPE.ELSE) {
        elseExpr = this.convertExpression(arg.result);
      }
    }

    return {
      type: PG_EXPR_TYPE.CASE,
      operand: expr.expr ? this.convertExpression(expr.expr) : null,
      conditions,
      elseExpr,
    };
  }

  /**
   * Converts a PG function call or EXISTS expression.
   * EXISTS is parsed as a function node by node-sql-parser PG mode.
   * @param {Object} expr - PG function AST node.
   * @returns {Object} Internal_AST node.
   */
  convertPgFunction(expr) {
    const nameParts = expr.name?.name || [];
    const funcName = nameParts.length > 0
      ? nameParts[0].value
      : '';
    const argValues = expr.args?.value || [];

    // EXISTS is parsed as a function with a subquery argument
    if (funcName.toUpperCase() === PG_EXISTS_NAME) {
      const subqueryArg = argValues[0];
      const innerAst = subqueryArg?.ast || subqueryArg;
      return {
        type: PG_EXPR_TYPE.EXISTS,
        query: this.convertSelect(innerAst),
      };
    }

    const convertExprFn = this.convertExpression.bind(this);
    return translateFunctionCall(funcName, argValues, convertExprFn);
  }

  /**
   * Converts a PG EXTRACT(field FROM expr) expression.
   * node-sql-parser PG mode produces {type: 'extract', args: {field, source}}.
   * @param {Object} expr - PG extract AST node.
   * @returns {Object} Internal_AST cast node wrapping strftime.
   */
  convertPgExtract(expr) {
    const field = expr.args?.field || '';
    const source = expr.args?.source;
    const convertExprFn = this.convertExpression.bind(this);
    return translateFunctionCall(
      'extract', [{value: field}, source], convertExprFn,
    );
  }

  convertBinaryExpr(expr) {
    const operator = expr.operator.toUpperCase();

    // PG-specific: ILIKE / NOT ILIKE → LIKE with LOWER wrapping
    if (this.dialect === PARSER_DIALECT.POSTGRESQL &&
        (operator === 'ILIKE' || operator === 'NOT ILIKE')) {
      return translateIlike(expr, this.convertExpression.bind(this));
    }

    if (operator === 'IN' || operator === 'NOT IN') {
      // IN subquery: right is expr_list with a single element having .ast
      if (Array.isArray(expr.right.value) &&
          expr.right.value.length === 1 &&
          expr.right.value[0]?.ast) {
        return {
          type: EXPR_TYPE.IN,
          expression: this.convertExpression(expr.left),
          subquery: {
            type: PG_EXPR_TYPE.SUBQUERY,
            query: this.convertSelect(expr.right.value[0].ast),
          },
          negated: operator === 'NOT IN',
        };
      }
      const values = Array.isArray(expr.right.value) ?
        expr.right.value.map((v) => this.convertValue(v)) :
        [this.convertExpression(expr.right)];
      return {
        type: EXPR_TYPE.IN,
        expression: this.convertExpression(expr.left),
        values,
        negated: operator === 'NOT IN',
      };
    }

    if (operator === 'BETWEEN') {
      return {
        type: EXPR_TYPE.BETWEEN,
        expression: this.convertExpression(expr.left),
        low: this.convertExpression(expr.right.value[0]),
        high: this.convertExpression(expr.right.value[1]),
      };
    }

    if (operator === 'LIKE' || operator === 'NOT LIKE') {
      return {
        type: EXPR_TYPE.LIKE,
        expression: this.convertExpression(expr.left),
        pattern: this.convertExpression(expr.right),
        negated: operator === 'NOT LIKE',
      };
    }

    if (operator === 'IS' || operator === 'IS NOT') {
      return {
        type: EXPR_TYPE.BINARY,
        operator: operator === 'IS' ? 'IS NULL' : 'IS NOT NULL',
        left: this.convertExpression(expr.left),
        right: {type: EXPR_TYPE.LITERAL, value: null},
      };
    }

    return {
      type: EXPR_TYPE.BINARY,
      operator: this.normalizeOperator(operator),
      left: this.convertExpression(expr.left),
      right: this.convertExpression(expr.right),
    };
  }

  normalizeOperator(op) {
    const upper = op.toUpperCase();
    if (upper === '!=') return '<>';
    return upper;
  }

  convertUnaryExpr(expr) {
    return {
      type: EXPR_TYPE.UNARY,
      operator: expr.operator.toUpperCase(),
      operand: this.convertExpression(expr.expr),
    };
  }

  convertColumnRef(expr) {
    // PG mode wraps column name in {expr: {type: 'default', value: name}}
    const column = (typeof expr.column === 'object' && expr.column?.expr)
      ? expr.column.expr.value
      : expr.column;
    return {
      type: EXPR_TYPE.COLUMN_REF,
      table: expr.table || null,
      column,
    };
  }

  convertAggregate(expr) {
    let argument;
    if (expr.args?.expr?.type === 'star') {
      argument = {type: EXPR_TYPE.STAR, value: '*'};
    } else if (expr.args?.expr) {
      argument = this.convertExpression(expr.args.expr);
    } else {
      argument = {type: EXPR_TYPE.STAR, value: '*'};
    }
    return {
      type: EXPR_TYPE.AGGREGATE,
      function: expr.name.toUpperCase(),
      argument,
      distinct: !!expr.args?.distinct,
    };
  }

  convertValue(val) {
    if (!val) {
      return {type: EXPR_TYPE.LITERAL, value: null};
    }

    // PG-specific value types
    if (this.dialect === PARSER_DIALECT.POSTGRESQL) {
      if (val.type === PG_NODE_TYPE.VAR && val.prefix === PG_PARAM_PREFIX) {
        translatePositionalParam(
          {value: val.name}, this.positionalParams,
        );
        return this.createParameterNode();
      }
      if (val.type === 'bool') {
        return translateBooleanLiteral(val);
      }
    }

    switch (val.type) {
    case 'number':
      return {type: EXPR_TYPE.LITERAL, value: val.value};
    case 'single_quote_string':
    case 'double_quote_string':
    case 'string':
      return {type: EXPR_TYPE.LITERAL, value: val.value};
    case 'bool':
      return {type: EXPR_TYPE.LITERAL, value: val.value};
    case 'null':
      return {type: EXPR_TYPE.LITERAL, value: null};
    case 'origin':
      if (val.value === '?') {
        return this.createParameterNode();
      }
      return {type: EXPR_TYPE.LITERAL, value: val.value};
    default:
      if (val.value !== undefined) {
        return {type: EXPR_TYPE.LITERAL, value: val.value};
      }
      return {type: EXPR_TYPE.LITERAL, value: null};
    }
  }
}

export {SQLParser, AST_TYPE, EXPR_TYPE};
