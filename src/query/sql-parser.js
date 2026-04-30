/**
 * SQL Parser - Wrapper around node-sql-parser for distributed database.
 * Converts node-sql-parser AST to internal format used by query engine.
 * Supports SELECT, INSERT, UPDATE, DELETE with WHERE, ORDER BY, GROUP BY, LIMIT, JOIN.
 * Requirements: 7.1, 7.3
 */

import nodeSqlParser from 'node-sql-parser';


const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_VALUE = 'value';
const LOCAL_STR_PRIMARY_KEY = 'PRIMARY_KEY';
const LOCAL_STR_UNIQUE = 'UNIQUE';
const LOCAL_STR_145ZS = '!=';
const LOCAL_STR_151ZF = '<>';

const {Parser} = nodeSqlParser;
import {NUM, TYPEOF} from '../constants/index.js';
import {LoggingService} from '../logging/logging-service.js';
import {AST_TYPE, EXPR_TYPE} from './parser-constants.js';
import {PARSER_DIALECT, PG_EXPR_TYPE} from './pg/pg-compat-constants.js';
import {QUERY_ERROR_MSG} from './query-constants.js';
import {
  translateBooleanLiteral,
  translatePositionalParam,
  translateTypeCast,
  translateIlike,
  translateOnConflict,
} from './pg/pg-translate.js';
import {translateFunctionCall} from './pg/pg-function-registry.js';

/**
 * Parser-specific error message constants.
 */
const PARSER_ERROR_MSG = Object.freeze({
  SQL_PARSE_ERROR_PREFIX: 'SQL Parse Error: ',
  EMPTY_SQL_STATEMENT: 'Empty SQL statement',
  UNSUPPORTED_CREATE_TYPE_PREFIX: 'Unsupported CREATE type: ',
  UNSUPPORTED_DROP_TYPE_PREFIX: 'Unsupported DROP type: ',
  UNKNOWN_EXPRESSION_TYPE_PREFIX: 'Unknown expression type: ',
});

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
  ALTER: 'alter',
  DROP: 'drop',
});

const INSERT_MODE = Object.freeze({
  REPLACE: 'replace',
  IGNORE: 'ignore',
  OR_REPLACE: 'or replace',
  OR_IGNORE: 'or ignore',
});

const SQL_SCHEMA_KEYWORD = Object.freeze({
  TABLE: 'table',
  INDEX: 'index',
  COLUMN: 'column',
  CONSTRAINT: 'constraint',
  PRIMARY_KEY: 'primary key',
  UNIQUE: 'unique',
  NOT_NULL: 'not null',
  BTREE: 'btree',
});

const SQL_JOIN_TYPE = Object.freeze({
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  CROSS: 'CROSS',
  INNER: 'INNER',
});

const SQL_SORT_DIRECTION = Object.freeze({
  ASC: 'ASC',
});

const SQL_OPERATOR = Object.freeze({
  IN: 'IN',
  NOT_IN: 'NOT IN',
  BETWEEN: 'BETWEEN',
  LIKE: 'LIKE',
  NOT_LIKE: 'NOT LIKE',
  IS: 'IS',
  IS_NOT: 'IS NOT',
  IS_NULL: 'IS NULL',
  IS_NOT_NULL: 'IS NOT NULL',
  ILIKE: 'ILIKE',
  NOT_ILIKE: 'NOT ILIKE',
});

/**
 * node-sql-parser expression-level AST type identifiers.
 * These are the raw type strings the external parser produces.
 */
const EXT_EXPR_TYPE = Object.freeze({
  BINARY_EXPR: 'binary_expr',
  UNARY_EXPR: 'unary_expr',
  COLUMN_REF: 'column_ref',
  NUMBER: 'number',
  SINGLE_QUOTE_STRING: 'single_quote_string',
  DOUBLE_QUOTE_STRING: 'double_quote_string',
  STRING: 'string',
  BOOL: 'bool',
  NULL: 'null',
  ORIGIN: 'origin',
  AGGR_FUNC: 'aggr_func',
  STAR: 'star',
  EXPR_LIST: 'expr_list',
});

/**
 * Star wildcard value used in SELECT * and aggregate(*) nodes.
 */
const STAR_VALUE = '*';

/**
 * Parameter placeholder in origin nodes.
 */
const ORIGIN_PARAM = '?';

const SQL_KEYWORD = Object.freeze({
  BEGIN: 'BEGIN',
  BEGIN_PREFIX: 'BEGIN ',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
});

class SQLParser {
  constructor(sql, options = {}) {
    this.sql = sql;
    this.dialect = options.dialect || PARSER_DIALECT.SQLITE;
    this.parser = new Parser();
    this.logger = this.initLogger();
    this.positionalParams = [];
    this.parameterCounter = NUM.ZERO;
  }

  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(PARSER_CONFIG.SUBSYSTEM);
      }
    } catch (logErr) {
      console.warn(PARSER_ERROR_MSG.SQL_PARSE_ERROR_PREFIX,
        logErr.message);
    }
    return console;
  }

  parse() {
    this.positionalParams = [];
    this.parameterCounter = NUM.ZERO;
    const trimmedSql = this.sql.trim().toUpperCase();
    if (trimmedSql === SQL_KEYWORD.BEGIN ||
        trimmedSql.startsWith(SQL_KEYWORD.BEGIN_PREFIX)) {
      return {type: AST_TYPE.BEGIN_TRANSACTION};
    }
    if (trimmedSql === SQL_KEYWORD.COMMIT) {
      return {type: AST_TYPE.COMMIT};
    }
    if (trimmedSql === SQL_KEYWORD.ROLLBACK) {
      return {type: AST_TYPE.ROLLBACK};
    }

    try {
      const dbMode = this.dialect === PARSER_DIALECT.POSTGRESQL ?
        PARSER_CONFIG.DATABASE_PG :
        PARSER_CONFIG.DATABASE;
      const externalAst = this.parser.astify(this.sql, {database: dbMode});
      const ast = this.convertAst(externalAst);
      ast.rawSql = this.sql;
      if (this.dialect === PARSER_DIALECT.POSTGRESQL &&
          this.positionalParams.length > NUM.ZERO) {
        ast._paramMapping = this.positionalParams;
      }
      return ast;
    } catch (error) {
      const errorMsg =
        PARSER_ERROR_MSG.SQL_PARSE_ERROR_PREFIX + error.message;
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
    this.parameterCounter += NUM.ONE;
    return {type: EXPR_TYPE.PARAMETER, index};
  }

  convertAst(ast) {
    // Handle array result (e.g., when SQL ends with semicolon)
    if (Array.isArray(ast)) {
      if (ast.length === NUM.ZERO) {
        throw new Error(PARSER_ERROR_MSG.EMPTY_SQL_STATEMENT);
      }
      return this.convertAst(ast[NUM.ZERO]);
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
    case EXTERNAL_TYPE.ALTER:
      return this.convertAlter(ast);
    case EXTERNAL_TYPE.DROP:
      return this.convertDrop(ast);
    default:
      throw new Error(
        QUERY_ERROR_MSG.UNSUPPORTED_STATEMENT_PREFIX + ast.type,
      );
    }
  }
  convertSelect(ast) {
    // PG mode: distinct is {type: 'DISTINCT'|null} vs SQLite string
    const distinct = typeof ast.distinct === 'object' ?
      ast.distinct?.type === 'DISTINCT' :
      ast.distinct === 'DISTINCT';

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
    if (!withClause || withClause.length === LOCAL_NUM_ZERO) {
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
      orReplace: insertMode === INSERT_MODE.REPLACE,
      orIgnore: insertMode === INSERT_MODE.IGNORE,
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
    if (Array.isArray(ast.or) && ast.or.length >= NUM.TWO) {
      const mode = String(ast.or[NUM.ONE]?.value || '').toLowerCase();
      if (mode === INSERT_MODE.REPLACE || mode === INSERT_MODE.IGNORE) {
        return mode;
      }
    }

    const prefix = String(ast.prefix || '').toLowerCase();
    if (prefix === INSERT_MODE.OR_REPLACE) {
      return INSERT_MODE.REPLACE;
    }
    if (prefix === INSERT_MODE.OR_IGNORE) {
      return INSERT_MODE.IGNORE;
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
    if (!returning || !returning.columns || returning.columns.length === LOCAL_NUM_ZERO) {
      return null;
    }
    const columns = returning.columns;
    // Check for RETURNING * — column is the string '*' in both modes
    if (columns.length === NUM.ONE && columns[NUM.ZERO].expr &&
        columns[NUM.ZERO].expr.type === EXT_EXPR_TYPE.COLUMN_REF &&
        columns[NUM.ZERO].expr.column === STAR_VALUE) {
      return STAR_VALUE;
    }
    // Extract column names — handle both PG and SQLite AST shapes
    const names = [];
    for (const col of columns) {
      const expr = col.expr;
      if (expr && expr.type === EXT_EXPR_TYPE.COLUMN_REF) {
        const colRef = expr.column;
        if (typeof colRef === TYPEOF.STRING) {
          // SQLite mode: column is a plain string
          names.push(colRef);
        } else if (colRef && colRef.expr && colRef.expr.value) {
          // PG mode: column is {expr: {type: 'default', value: 'name'}}
          names.push(colRef.expr.value);
        }
      }
    }
    return names.length > NUM.ZERO ? names : null;
  }

  convertAlter(ast) {
    const tableName = ast.table?.[0]?.table || null;
    const expression = Array.isArray(ast.expr) && ast.expr.length > 0 ?
      ast.expr[0] :
      null;
    const action = String(expression?.action || '').toLowerCase();
    const resource = String(expression?.resource || '').toLowerCase();
    const columnName = this.resolveAlterColumnName(expression?.column);
    const oldColumnName = this.resolveAlterColumnName(expression?.old_column);
    const defaultValue = this.convertAlterDefaultValue(expression?.default_val);

    const operation = {
      action,
      resource,
      columnName: oldColumnName || columnName,
      newColumnName: action === 'rename' ? columnName : null,
      dataType: expression?.definition?.dataType || null,
      defaultValue,
      keyword: expression?.keyword || null,
    };

    return {
      type: AST_TYPE.ALTER_TABLE,
      table: tableName,
      operation,
    };
  }

  resolveAlterColumnName(columnRef) {
    if (!columnRef) {
      return null;
    }
    if (typeof columnRef.column === TYPEOF.STRING) {
      return columnRef.column;
    }
    if (columnRef.column?.expr?.value) {
      return columnRef.column.expr.value;
    }
    return null;
  }

  convertAlterDefaultValue(defaultNode) {
    if (!defaultNode) {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(defaultNode, LOCAL_STR_VALUE)) {
      const converted = this.convertValue(defaultNode.value);
      if (converted &&
        converted.type === EXPR_TYPE.LITERAL &&
        Object.prototype.hasOwnProperty.call(converted, LOCAL_STR_VALUE)) {
        return converted.value;
      }
      return converted;
    }
    return null;
  }

  convertCreate(ast) {
    if (ast.keyword === SQL_SCHEMA_KEYWORD.TABLE) {
      return this.convertCreateTable(ast);
    }
    if (ast.keyword === SQL_SCHEMA_KEYWORD.INDEX) {
      return this.convertCreateIndex(ast);
    }
    throw new Error(
      PARSER_ERROR_MSG.UNSUPPORTED_CREATE_TYPE_PREFIX + ast.keyword,
    );
  }

  convertCreateTable(ast) {
    const tableName = ast.table[0].table;
    const columns = [];
    const tableConstraints = [];
    let primaryKey = null;

    for (const def of ast.create_definitions || []) {
      if (def.resource === SQL_SCHEMA_KEYWORD.COLUMN) {
        const column = {
          name: def.column.column,
          dataType: {
            name: def.definition.dataType,
            length: def.definition.length || null,
            precision: null,
            scale: null,
          },
          primaryKey: !!def.primary_key,
          notNull: def.nullable?.type === SQL_SCHEMA_KEYWORD.NOT_NULL,
          unique: !!def.unique,
          defaultValue: def.default_val ? this.convertValue(def.default_val.value) : null,
        };
        columns.push(column);
        if (column.primaryKey && !primaryKey) {
          primaryKey = [column.name];
        }
      } else if (def.resource === SQL_SCHEMA_KEYWORD.CONSTRAINT) {
        if (def.constraint_type === SQL_SCHEMA_KEYWORD.PRIMARY_KEY) {
          const pkColumns = def.definition.map((d) => d.column);
          tableConstraints.push({type: LOCAL_STR_PRIMARY_KEY, columns: pkColumns});
          primaryKey = pkColumns;
        } else if (def.constraint_type === SQL_SCHEMA_KEYWORD.UNIQUE) {
          const uniqueColumns = def.definition.map((d) => d.column);
          tableConstraints.push({type: LOCAL_STR_UNIQUE, columns: uniqueColumns});
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
      unique: !!ast.index_type?.includes(SQL_SCHEMA_KEYWORD.UNIQUE),
      ifNotExists: !!ast.if_not_exists,
      indexType: SQL_SCHEMA_KEYWORD.BTREE,
    };
  }

  convertDrop(ast) {
    if (ast.keyword === SQL_SCHEMA_KEYWORD.TABLE) {
      return {
        type: AST_TYPE.DROP_TABLE,
        tableName: ast.name[LOCAL_NUM_ZERO].table,
        ifExists: !!ast.if_exists,
      };
    }
    if (ast.keyword === SQL_SCHEMA_KEYWORD.INDEX) {
      return {
        type: AST_TYPE.DROP_INDEX,
        indexName: ast.name[LOCAL_NUM_ZERO].table,
        tableName: null,
        ifExists: !!ast.if_exists,
      };
    }
    throw new Error(
      PARSER_ERROR_MSG.UNSUPPORTED_DROP_TYPE_PREFIX + ast.keyword,
    );
  }

  convertColumns(columns) {
    return columns.map((col) => {
      if (col.expr.type === EXT_EXPR_TYPE.STAR ||
          col.expr.column === STAR_VALUE) {
        return {type: EXPR_TYPE.STAR, value: STAR_VALUE};
      }
      return {
        type: EXPR_TYPE.COLUMN,
        expression: this.convertExpression(col.expr),
        alias: col.as || null,
      };
    });
  }

  convertFrom(from) {
    if (!from || from.length === NUM.ZERO) {
      return null;
    }
    const firstTable = from[NUM.ZERO];

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
    if (!from || from.length <= NUM.ONE) {
      return [];
    }
    const joins = [];
    for (let i = NUM.ONE; i < from.length; i++) {
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
    if (upper.includes(SQL_JOIN_TYPE.LEFT)) return SQL_JOIN_TYPE.LEFT;
    if (upper.includes(SQL_JOIN_TYPE.RIGHT)) return SQL_JOIN_TYPE.RIGHT;
    if (upper.includes(SQL_JOIN_TYPE.CROSS)) return SQL_JOIN_TYPE.CROSS;
    return SQL_JOIN_TYPE.INNER;
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
      direction: o.type || SQL_SORT_DIRECTION.ASC,
    }));
  }

  convertLimit(limit) {
    if (!limit || !limit.value) {
      return null;
    }
    const values = limit.value;
    const count = values[NUM.ZERO]?.value;
    const offset = values.length > NUM.ONE ? values[NUM.ONE]?.value : null;
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
    case EXT_EXPR_TYPE.BINARY_EXPR:
      return this.convertBinaryExpr(expr);
    case EXT_EXPR_TYPE.UNARY_EXPR:
      return this.convertUnaryExpr(expr);
    case EXT_EXPR_TYPE.COLUMN_REF:
      return this.convertColumnRef(expr);
    case EXT_EXPR_TYPE.NUMBER:
      return {type: EXPR_TYPE.LITERAL, value: expr.value};
    case EXT_EXPR_TYPE.SINGLE_QUOTE_STRING:
    case EXT_EXPR_TYPE.DOUBLE_QUOTE_STRING:
    case EXT_EXPR_TYPE.STRING:
      return {type: EXPR_TYPE.LITERAL, value: expr.value};
    case EXT_EXPR_TYPE.BOOL:
      return {type: EXPR_TYPE.LITERAL, value: expr.value};
    case EXT_EXPR_TYPE.NULL:
      return {type: EXPR_TYPE.LITERAL, value: null};
    case EXT_EXPR_TYPE.ORIGIN:
      if (expr.value === ORIGIN_PARAM) {
        return this.createParameterNode();
      }
      return {type: EXPR_TYPE.LITERAL, value: expr.value};
    case EXT_EXPR_TYPE.AGGR_FUNC:
      return this.convertAggregate(expr);
    case EXT_EXPR_TYPE.STAR:
      return {type: EXPR_TYPE.STAR, value: STAR_VALUE};
    case EXT_EXPR_TYPE.EXPR_LIST:
      return expr.value.map((v) => this.convertExpression(v));
    default:
      if (expr.value !== undefined) {
        return {type: EXPR_TYPE.LITERAL, value: expr.value};
      }
      throw new Error(
        PARSER_ERROR_MSG.UNKNOWN_EXPRESSION_TYPE_PREFIX + expr.type,
      );
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
        {expr: expr.expr, target: {dataType: expr.target[LOCAL_NUM_ZERO]?.dataType}},
        convertExprFn,
      );

    case PG_NODE_TYPE.CASE:
      return this.convertPgCase(expr);

    case PG_NODE_TYPE.FUNCTION:
      return this.convertPgFunction(expr);

    case PG_NODE_TYPE.EXTRACT:
      return this.convertPgExtract(expr);

    case EXT_EXPR_TYPE.BOOL:
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
    const funcName = nameParts.length > NUM.ZERO ?
      nameParts[NUM.ZERO].value :
      '';
    const argValues = expr.args?.value || [];

    // EXISTS is parsed as a function with a subquery argument
    if (funcName.toUpperCase() === PG_EXISTS_NAME) {
      const subqueryArg = argValues[NUM.ZERO];
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
      PG_NODE_TYPE.EXTRACT, [{value: field}, source], convertExprFn,
    );
  }

  convertBinaryExpr(expr) {
    const operator = expr.operator.toUpperCase();

    // PG-specific: ILIKE / NOT ILIKE → LIKE with LOWER wrapping
    if (this.dialect === PARSER_DIALECT.POSTGRESQL &&
        (operator === SQL_OPERATOR.ILIKE ||
          operator === SQL_OPERATOR.NOT_ILIKE)) {
      return translateIlike(expr, this.convertExpression.bind(this));
    }

    if (operator === SQL_OPERATOR.IN || operator === SQL_OPERATOR.NOT_IN) {
      // IN subquery: right is expr_list with a single element having .ast
      if (Array.isArray(expr.right.value) &&
          expr.right.value.length === NUM.ONE &&
          expr.right.value[NUM.ZERO]?.ast) {
        return {
          type: EXPR_TYPE.IN,
          expression: this.convertExpression(expr.left),
          subquery: {
            type: PG_EXPR_TYPE.SUBQUERY,
            query: this.convertSelect(expr.right.value[NUM.ZERO].ast),
          },
          negated: operator === SQL_OPERATOR.NOT_IN,
        };
      }
      const values = Array.isArray(expr.right.value) ?
        expr.right.value.map((v) => this.convertValue(v)) :
        [this.convertExpression(expr.right)];
      return {
        type: EXPR_TYPE.IN,
        expression: this.convertExpression(expr.left),
        values,
        negated: operator === SQL_OPERATOR.NOT_IN,
      };
    }

    if (operator === SQL_OPERATOR.BETWEEN) {
      return {
        type: EXPR_TYPE.BETWEEN,
        expression: this.convertExpression(expr.left),
        low: this.convertExpression(expr.right.value[NUM.ZERO]),
        high: this.convertExpression(expr.right.value[NUM.ONE]),
      };
    }

    if (operator === SQL_OPERATOR.LIKE ||
        operator === SQL_OPERATOR.NOT_LIKE) {
      return {
        type: EXPR_TYPE.LIKE,
        expression: this.convertExpression(expr.left),
        pattern: this.convertExpression(expr.right),
        negated: operator === SQL_OPERATOR.NOT_LIKE,
      };
    }

    if (operator === SQL_OPERATOR.IS || operator === SQL_OPERATOR.IS_NOT) {
      return {
        type: EXPR_TYPE.BINARY,
        operator: operator === SQL_OPERATOR.IS ?
          SQL_OPERATOR.IS_NULL :
          SQL_OPERATOR.IS_NOT_NULL,
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
    if (upper === LOCAL_STR_145ZS) return LOCAL_STR_151ZF;
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
    const column = (typeof expr.column === 'object' && expr.column?.expr) ?
      expr.column.expr.value :
      expr.column;
    return {
      type: EXPR_TYPE.COLUMN_REF,
      table: expr.table || null,
      column,
    };
  }

  convertAggregate(expr) {
    let argument;
    if (expr.args?.expr?.type === EXT_EXPR_TYPE.STAR) {
      argument = {type: EXPR_TYPE.STAR, value: STAR_VALUE};
    } else if (expr.args?.expr) {
      argument = this.convertExpression(expr.args.expr);
    } else {
      argument = {type: EXPR_TYPE.STAR, value: STAR_VALUE};
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
      if (val.type === EXT_EXPR_TYPE.BOOL) {
        return translateBooleanLiteral(val);
      }
    }

    switch (val.type) {
    case EXT_EXPR_TYPE.NUMBER:
      return {type: EXPR_TYPE.LITERAL, value: val.value};
    case EXT_EXPR_TYPE.SINGLE_QUOTE_STRING:
    case EXT_EXPR_TYPE.DOUBLE_QUOTE_STRING:
    case EXT_EXPR_TYPE.STRING:
      return {type: EXPR_TYPE.LITERAL, value: val.value};
    case EXT_EXPR_TYPE.BOOL:
      return {type: EXPR_TYPE.LITERAL, value: val.value};
    case EXT_EXPR_TYPE.NULL:
      return {type: EXPR_TYPE.LITERAL, value: null};
    case EXT_EXPR_TYPE.ORIGIN:
      if (val.value === ORIGIN_PARAM) {
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
