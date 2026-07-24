/**
 * SQL Parser - Wrapper around node-sql-parser for distributed database.
 * Converts node-sql-parser AST to internal format used by query engine.
 * Supports SELECT, INSERT, UPDATE, DELETE with WHERE, ORDER BY, GROUP BY, LIMIT, JOIN.
 * Requirements: 7.1, 7.3
 */

import nodeSqlParser from 'node-sql-parser';


const LOCAL_STR_PRIMARY_KEY = 'PRIMARY_KEY';
const LOCAL_STR_UNIQUE = 'UNIQUE';
const CREATE_TABLE_PREFIX_PATTERN = /^\s*CREATE\s+TABLE\b/iu;
const CREATE_TABLE_STORAGE_OPTIONS_PATTERN =
  /\s+WITH\s*\(\s*split_storage_threshold\s*=\s*(\d+)\s*\)\s*;?\s*$/iu;

const {Parser} = nodeSqlParser;
import {LoggingService} from '../logging/logging-service.js';
import {AST_TYPE, EXPR_TYPE} from './parser-constants.js';
import {PARSER_DIALECT} from './pg/pg-compat-constants.js';
import {QUERY_ERROR_MSG} from './query-constants.js';
import {
  translateOnConflict,
} from './pg/pg-translate.js';
import {sqlParserExpressionMethods} from './sql-parser-expression-methods.js';
import {sqlParserSchemaMutationMethods} from
  './sql-parser-schema-mutation-methods.js';

/**
 * Parser-specific error message constants.
 */
const PARSER_ERROR_MSG = Object.freeze({
  SQL_PARSE_ERROR_PREFIX: 'SQL Parse Error: ',
  EMPTY_SQL_STATEMENT: 'Empty SQL statement',
  SPLIT_STORAGE_THRESHOLD_SAFE_INTEGER:
    'split_storage_threshold must be a safe integer',
  LIMIT_COUNT_MUST_BE_INTEGER_LITERAL:
    'LIMIT count must be an integer literal',
  LIMIT_OFFSET_MUST_BE_INTEGER_LITERAL:
    'LIMIT offset must be an integer literal',
  LIMIT_ALL_WITH_OFFSET_UNSUPPORTED:
    'LIMIT ALL with OFFSET is unsupported',
  OFFSET_WITHOUT_LIMIT_UNSUPPORTED:
    'OFFSET without LIMIT is unsupported',
  UNSUPPORTED_CREATE_TYPE_PREFIX: 'Unsupported CREATE type: ',
  UNSUPPORTED_DROP_TYPE_PREFIX: 'Unsupported DROP type: ',
  UNKNOWN_EXPRESSION_TYPE_PREFIX: 'Unknown expression type: ',
});

const PARSER_CONFIG = Object.freeze({
  DATABASE: 'sqlite',
  DATABASE_PG: 'postgresql',
  SUBSYSTEM: 'sql-parser',
});

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
const SQL_LIMIT_ALL = 'ALL';
const SQL_LIMIT_OFFSET_SEPARATOR = 'offset';

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

const SQL_KEYWORD = Object.freeze({
  BEGIN: 'BEGIN',
  BEGIN_PREFIX: 'BEGIN ',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
});

function extractCreateTableStorageOptions(sql) {
  if (
    typeof sql !== 'string' ||
    !CREATE_TABLE_PREFIX_PATTERN.test(sql)
  ) {
    return {sql, options: null};
  }
  const match = CREATE_TABLE_STORAGE_OPTIONS_PATTERN.exec(sql);
  if (!match) {
    return {sql, options: null};
  }
  const splitStorageThreshold = Number(match[1]);
  if (!Number.isSafeInteger(splitStorageThreshold)) {
    throw new Error(PARSER_ERROR_MSG.SPLIT_STORAGE_THRESHOLD_SAFE_INTEGER);
  }
  return {
    sql: sql.slice(0, match.index).trimEnd(),
    options: {
      tablePolicy: {splitStorageThreshold},
    },
  };
}

function externalSchemaIdentifier(value) {
  if (typeof value === 'string') return value;
  const candidate =
    value?.expr?.value ??
    value?.value ??
    value?.column;
  return typeof candidate === 'string' ? candidate : String(candidate || '');
}

function isLimitAllNode(node) {
  return node?.type === EXT_EXPR_TYPE.ORIGIN &&
    String(node.value).toUpperCase() === SQL_LIMIT_ALL;
}

function requireIntegerLimitLiteral(node, errorMessage) {
  const value = node?.value;
  if (!Number.isInteger(value)) {
    throw new Error(errorMessage);
  }
  return value;
}

function convertExternalLimit(limit) {
  const values = limit?.value;
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  if (isLimitAllNode(values[0])) {
    if (values.length > 1) {
      throw new Error(PARSER_ERROR_MSG.LIMIT_ALL_WITH_OFFSET_UNSUPPORTED);
    }
    return null;
  }
  if (
    limit.seperator === SQL_LIMIT_OFFSET_SEPARATOR &&
    values.length === 1
  ) {
    throw new Error(PARSER_ERROR_MSG.OFFSET_WITHOUT_LIMIT_UNSUPPORTED);
  }
  return {
    count: requireIntegerLimitLiteral(
      values[0],
      PARSER_ERROR_MSG.LIMIT_COUNT_MUST_BE_INTEGER_LITERAL,
    ),
    offset: values.length > 1 ?
      requireIntegerLimitLiteral(
        values[1],
        PARSER_ERROR_MSG.LIMIT_OFFSET_MUST_BE_INTEGER_LITERAL,
      ) :
      null,
  };
}

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
    } catch (logErr) {
      console.warn(PARSER_ERROR_MSG.SQL_PARSE_ERROR_PREFIX,
        logErr.message);
    }
    return console;
  }

  parse() {
    this.positionalParams = [];
    this.parameterCounter = 0;
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
      const createTableInput = extractCreateTableStorageOptions(this.sql);
      const externalAst = this.parser.astify(
        createTableInput.sql,
        {database: dbMode},
      );
      const ast = this.convertAst(externalAst);
      if (createTableInput.options && ast.type === AST_TYPE.CREATE_TABLE) {
        ast.options = createTableInput.options;
      }
      ast.rawSql = this.sql;
      if (this.dialect === PARSER_DIALECT.POSTGRESQL &&
          this.positionalParams.length > 0) {
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
    this.parameterCounter += 1;
    return {type: EXPR_TYPE.PARAMETER, index};
  }

  convertAst(ast) {
    // Handle array result (e.g., when SQL ends with semicolon)
    if (Array.isArray(ast)) {
      if (ast.length === 0) {
        throw new Error(PARSER_ERROR_MSG.EMPTY_SQL_STATEMENT);
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
    const columns = Array.isArray(ast.columns) ?
      ast.columns.map((column) => externalSchemaIdentifier(column)) :
      null;
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
    if (Array.isArray(ast.or) && ast.or.length >= 2) {
      const mode = String(ast.or[1]?.value || '').toLowerCase();
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
      column: externalSchemaIdentifier(s.column),
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
          name: externalSchemaIdentifier(def.column.column),
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
          const pkColumns = def.definition.map(
            (definition) => externalSchemaIdentifier(definition.column),
          );
          tableConstraints.push({type: LOCAL_STR_PRIMARY_KEY, columns: pkColumns});
          primaryKey = pkColumns;
        } else if (def.constraint_type === SQL_SCHEMA_KEYWORD.UNIQUE) {
          const uniqueColumns = def.definition.map(
            (definition) => externalSchemaIdentifier(definition.column),
          );
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
        tableName: ast.name[0].table,
        ifExists: !!ast.if_exists,
      };
    }
    if (ast.keyword === SQL_SCHEMA_KEYWORD.INDEX) {
      return {
        type: AST_TYPE.DROP_INDEX,
        indexName: ast.name[0].table,
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
    return convertExternalLimit(limit);
  }
}

Object.assign(SQLParser.prototype, sqlParserExpressionMethods);
Object.assign(SQLParser.prototype, sqlParserSchemaMutationMethods);

export {SQLParser, AST_TYPE, EXPR_TYPE};
