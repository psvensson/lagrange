/**
 * SQL Parser - Wrapper around node-sql-parser for distributed database.
 * Converts node-sql-parser AST to internal format used by query engine.
 * Supports SELECT, INSERT, UPDATE, DELETE with WHERE, ORDER BY, GROUP BY, LIMIT, JOIN.
 * Requirements: 7.1, 7.3
 */

import sqliteNodeSqlParser from 'node-sql-parser/build/sqlite.js';
import postgresqlNodeSqlParser from
  'node-sql-parser/build/postgresql.js';


const CREATE_TABLE_PREFIX_PATTERN = /^\s*CREATE\s+TABLE\b/iu;
const CREATE_TABLE_STORAGE_OPTIONS_PATTERN =
  /\s+WITH\s*\(\s*split_storage_threshold\s*=\s*(\d+)\s*\)\s*;?\s*$/iu;

const {Parser: SQLiteParser} = sqliteNodeSqlParser;
const {Parser: PostgreSQLParser} = postgresqlNodeSqlParser;
import {LoggingService} from '../logging/logging-service.js';
import {AST_TYPE, EXPR_TYPE} from './parser-constants.js';
import {PARSER_DIALECT} from './pg/pg-compat-constants.js';
import {PG_ERROR_CODE} from '../runtime/pgwire-protocol-constants.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from './query-constants.js';
import {
  TRANSACTION_CONTROL_KIND,
  resolveTransactionControlStatement,
} from './sql-transaction-control-grammar.js';
import {
  translateOnConflict,
} from './pg/pg-translate.js';
import {sqlParserExpressionMethods} from './sql-parser-expression-methods.js';
import {sqlParserSchemaMutationMethods} from
  './sql-parser-schema-mutation-methods.js';
import {sqlParserSelectMethods} from './sql-parser-select-methods.js';
import {
  stripAndValidateLockingClause,
  validateSelectAstLocking,
} from './sql-locking-read-grammar.js';

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

function createTypedParseError(code, message) {
  const error = new Error(message);
  error.code = code;
  if (code === QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE) {
    error.sqlState = PG_ERROR_CODE.FEATURE_NOT_SUPPORTED;
    error.details = Object.freeze({sqlState: PG_ERROR_CODE.FEATURE_NOT_SUPPORTED});
  }
  return error;
}

/**
 * The one statement of a parsed statement list. node-sql-parser returns a
 * list for any text with a `;`; an empty statement (`;`, a comment) is an
 * empty list inside it. Only executable statement nodes count.
 * @param {Array} statements - node-sql-parser statement list.
 * @return {Object} The single statement node.
 * @throws {Error} code EMPTY_STATEMENT when the text holds no statement;
 *   code MULTIPLE_STATEMENTS_UNSUPPORTED when it holds more than one (the
 *   whole text is refused: no statement of it may execute).
 */
function requireSingleStatement(statements) {
  const executable = statements.flat(Infinity).filter(
    (node) => node !== null && typeof node === 'object',
  );
  if (executable.length === 0) {
    throw createTypedParseError(
      QUERY_ERROR_CODE.EMPTY_STATEMENT,
      PARSER_ERROR_MSG.EMPTY_SQL_STATEMENT,
    );
  }
  if (executable.length > 1) {
    throw createTypedParseError(
      QUERY_ERROR_CODE.MULTIPLE_STATEMENTS_UNSUPPORTED,
      QUERY_ERROR_MSG.MULTIPLE_STATEMENTS_UNSUPPORTED,
    );
  }
  return executable[0];
}

/**
 * The transaction-control statement the text is, by the engine's grammar.
 * @param {string} sql - Statement text.
 * @return {?Object} {type} for a transaction-control statement; null when
 *   the text is not one.
 * @throws {Error} code TRANSACTION_CONTROL_SYNTAX_ERROR for a malformed one;
 *   code UNSUPPORTED_SQL_FEATURE for a transaction mode the engine does not
 *   provide (named in the message).
 */
function parseTransactionControl(sql) {
  const {kind, unsupportedMode} = resolveTransactionControlStatement(sql);
  if (kind === TRANSACTION_CONTROL_KIND.MALFORMED) {
    throw createTypedParseError(
      QUERY_ERROR_CODE.TRANSACTION_CONTROL_SYNTAX_ERROR,
      QUERY_ERROR_MSG.TRANSACTION_CONTROL_SYNTAX_ERROR,
    );
  }
  if (kind === TRANSACTION_CONTROL_KIND.UNSUPPORTED_MODE) {
    throw createTypedParseError(
      QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
      QUERY_ERROR_MSG.TRANSACTION_MODE_UNSUPPORTED_PREFIX + unsupportedMode +
        QUERY_ERROR_MSG.TRANSACTION_MODE_UNSUPPORTED_SUFFIX,
    );
  }
  return kind === TRANSACTION_CONTROL_KIND.NONE ? null : {type: kind};
}

const DOLLAR_SIGN = '$';
const ESCAPED_SINGLE_QUOTE = '\'\'';
const DOLLAR_QUOTE_TOKEN_PATTERN =
  /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\$([a-zA-Z0-9_]*)\$([\s\S]*?)\$\1\$/gu;

function normalizeDollarQuotedStrings(sql) {
  if (typeof sql !== 'string' || !sql.includes(DOLLAR_SIGN)) {
    return sql;
  }
  return sql.replace(
    DOLLAR_QUOTE_TOKEN_PATTERN,
    (match, tag, body) =>
      tag === undefined ? match : `'${body.replace(/'/g, ESCAPED_SINGLE_QUOTE)}'`,
  );
}

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

const INDEX_ACCESS_METHOD_BTREE = 'btree';
const ERR_CREATE_INDEX_CONCURRENTLY = 'CREATE INDEX CONCURRENTLY is not supported';

function createUnsupportedIndexError(message) {
  const error = new Error(message);
  error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  error.sqlState = PG_ERROR_CODE.FEATURE_NOT_SUPPORTED;
  return error;
}

function assertIndexCreationSupported(sql) {
  if (typeof sql !== 'string' || !/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/iu.test(sql)) {
    return;
  }
  if (/\bCONCURRENTLY\b/iu.test(sql)) {
    throw createUnsupportedIndexError(ERR_CREATE_INDEX_CONCURRENTLY);
  }
  const usingMatch = /\bUSING\s+([a-zA-Z0-9_]+)\b/iu.exec(sql);
  if (usingMatch && usingMatch[1].toLowerCase() !== INDEX_ACCESS_METHOD_BTREE) {
    throw createUnsupportedIndexError(`Index access method '${usingMatch[1]}' is not supported`);
  }
}

function parseDropIndexAst(sql) {
  if (typeof sql !== 'string' || !/^\s*DROP\s+INDEX\b/iu.test(sql)) {
    return null;
  }
  const dropIndexMatch = sql.match(
    /^\s*DROP\s+INDEX\s+(IF\s+EXISTS\s+)?([A-Za-z0-9_".]+)(?:\s+ON\s+([A-Za-z0-9_".]+))?\s*;?\s*$/i,
  );
  if (!dropIndexMatch) {
    return null;
  }
  const ifExists = Boolean(dropIndexMatch[1]);
  const indexName = dropIndexMatch[2].replace(/"/g, '');
  const tableName = dropIndexMatch[3] ? dropIndexMatch[3].replace(/"/g, '') : null;
  return {
    type: AST_TYPE.DROP_INDEX,
    indexName,
    tableName,
    ifExists,
    rawSql: sql,
  };
}

class SQLParser {
  constructor(sql, options = {}) {
    this.sql = sql;
    this.dialect = options.dialect || PARSER_DIALECT.SQLITE;
    this.parser = this.dialect === PARSER_DIALECT.POSTGRESQL ?
      new PostgreSQLParser() :
      new SQLiteParser();
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
    const transactionControl = parseTransactionControl(this.sql);
    if (transactionControl) return transactionControl;

    assertIndexCreationSupported(this.sql);
    const dropIndexAst = parseDropIndexAst(this.sql);
    if (dropIndexAst) return dropIndexAst;

    const {sql: parseSql, hasLocking} =
      stripAndValidateLockingClause(this.sql);

    try {
      const dbMode = this.dialect === PARSER_DIALECT.POSTGRESQL ?
        PARSER_CONFIG.DATABASE_PG :
        PARSER_CONFIG.DATABASE;
      const normalizedSql = normalizeDollarQuotedStrings(parseSql);
      const createTableInput = extractCreateTableStorageOptions(normalizedSql);
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
      validateSelectAstLocking(ast, hasLocking);
      return ast;
    } catch (error) {
      const errorMsg =
        PARSER_ERROR_MSG.SQL_PARSE_ERROR_PREFIX + error.message;
      this.logger.error(errorMsg, {sql: this.sql});
      if (error.code === QUERY_ERROR_CODE.MULTIPLE_STATEMENTS_UNSUPPORTED ||
          error.code === QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE) {
        throw error;
      }
      const parseError = new Error(errorMsg);
      if (error.code === QUERY_ERROR_CODE.EMPTY_STATEMENT) {
        parseError.code = error.code;
      }
      throw parseError;
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
    // A statement list (any text with a `;`) must hold exactly one
    // statement; more than one is refused whole, never truncated.
    if (Array.isArray(ast)) {
      return this.convertAst(requireSingleStatement(ast));
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

  convertInsert(ast) {
    const tableName = ast.table[0].table;
    const columns = Array.isArray(ast.columns) ?
      ast.columns.map((column) => externalSchemaIdentifier(column)) :
      null;
    const values = [];
    const insertMode = this.getInsertMode(ast);

    // node-sql-parser wraps values in {type: 'values', values: [...]}; an
    // INSERT ... SELECT has a select there, which this AST cannot carry:
    // refused, never executed as an insert of no rows.
    if (ast.values?.type === EXTERNAL_TYPE.SELECT) {
      throw createTypedParseError(
        QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
        QUERY_ERROR_MSG.INSERT_SELECT_UNSUPPORTED,
      );
    }
    const valueRows = ast.values?.values || [];
    for (const row of valueRows) {
      const rowValues = [];
      const rowData = row.value || [];
      for (const val of rowData) {
        rowValues.push(this.convertMutationValue(val, {allowColumns: false}));
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
      value: this.convertMutationValue(s.value, {allowColumns: true}),
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
}

Object.assign(SQLParser.prototype, sqlParserSelectMethods);
Object.assign(SQLParser.prototype, sqlParserExpressionMethods);
Object.assign(SQLParser.prototype, sqlParserSchemaMutationMethods);

export {
  SQLParser,
  AST_TYPE,
  EXPR_TYPE,
};
