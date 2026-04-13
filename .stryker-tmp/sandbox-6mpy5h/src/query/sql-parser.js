/**
 * SQL Parser - Wrapper around node-sql-parser for distributed database.
 * Converts node-sql-parser AST to internal format used by query engine.
 * Supports SELECT, INSERT, UPDATE, DELETE with WHERE, ORDER BY, GROUP BY, LIMIT, JOIN.
 * Requirements: 7.1, 7.3
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import nodeSqlParser from 'node-sql-parser';
const {
  Parser
} = nodeSqlParser;
import { NUM, TYPEOF } from '../constants/index.js';
import { LoggingService } from '../logging/logging-service.js';
import { AST_TYPE, EXPR_TYPE } from './parser-constants.js';
import { PARSER_DIALECT, PG_EXPR_TYPE } from './pg/pg-compat-constants.js';
import { QUERY_ERROR_MSG } from './query-constants.js';
import { translateBooleanLiteral, translatePositionalParam, translateTypeCast, translateIlike, translateOnConflict } from './pg/pg-translate.js';
import { translateFunctionCall } from './pg/pg-function-registry.js';

/**
 * Parser-specific error message constants.
 */
const PARSER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("118892") ? {} : (stryCov_9fa48("118892"), {
  SQL_PARSE_ERROR_PREFIX: stryMutAct_9fa48("118893") ? "" : (stryCov_9fa48("118893"), 'SQL Parse Error: '),
  EMPTY_SQL_STATEMENT: stryMutAct_9fa48("118894") ? "" : (stryCov_9fa48("118894"), 'Empty SQL statement'),
  UNSUPPORTED_CREATE_TYPE_PREFIX: stryMutAct_9fa48("118895") ? "" : (stryCov_9fa48("118895"), 'Unsupported CREATE type: '),
  UNSUPPORTED_DROP_TYPE_PREFIX: stryMutAct_9fa48("118896") ? "" : (stryCov_9fa48("118896"), 'Unsupported DROP type: '),
  UNKNOWN_EXPRESSION_TYPE_PREFIX: stryMutAct_9fa48("118897") ? "" : (stryCov_9fa48("118897"), 'Unknown expression type: ')
}));
const PARSER_CONFIG = Object.freeze(stryMutAct_9fa48("118898") ? {} : (stryCov_9fa48("118898"), {
  DATABASE: stryMutAct_9fa48("118899") ? "" : (stryCov_9fa48("118899"), 'sqlite'),
  DATABASE_PG: stryMutAct_9fa48("118900") ? "" : (stryCov_9fa48("118900"), 'postgresql'),
  SUBSYSTEM: stryMutAct_9fa48("118901") ? "" : (stryCov_9fa48("118901"), 'sql-parser')
}));

/**
 * PG AST node type identifiers from node-sql-parser in PG mode.
 */
const PG_NODE_TYPE = Object.freeze(stryMutAct_9fa48("118902") ? {} : (stryCov_9fa48("118902"), {
  VAR: stryMutAct_9fa48("118903") ? "" : (stryCov_9fa48("118903"), 'var'),
  CAST: stryMutAct_9fa48("118904") ? "" : (stryCov_9fa48("118904"), 'cast'),
  CASE: stryMutAct_9fa48("118905") ? "" : (stryCov_9fa48("118905"), 'case'),
  FUNCTION: stryMutAct_9fa48("118906") ? "" : (stryCov_9fa48("118906"), 'function'),
  EXTRACT: stryMutAct_9fa48("118907") ? "" : (stryCov_9fa48("118907"), 'extract')
}));

/**
 * PG AST prefix for positional parameters ($1, $2, ...).
 */
const PG_PARAM_PREFIX = stryMutAct_9fa48("118908") ? "" : (stryCov_9fa48("118908"), '$');

/**
 * PG AST CASE arg type identifiers.
 */
const PG_CASE_ARG_TYPE = Object.freeze(stryMutAct_9fa48("118909") ? {} : (stryCov_9fa48("118909"), {
  WHEN: stryMutAct_9fa48("118910") ? "" : (stryCov_9fa48("118910"), 'when'),
  ELSE: stryMutAct_9fa48("118911") ? "" : (stryCov_9fa48("118911"), 'else')
}));

/**
 * EXISTS function name as produced by node-sql-parser PG mode.
 */
const PG_EXISTS_NAME = stryMutAct_9fa48("118912") ? "" : (stryCov_9fa48("118912"), 'EXISTS');
const EXTERNAL_TYPE = Object.freeze(stryMutAct_9fa48("118913") ? {} : (stryCov_9fa48("118913"), {
  SELECT: stryMutAct_9fa48("118914") ? "" : (stryCov_9fa48("118914"), 'select'),
  INSERT: stryMutAct_9fa48("118915") ? "" : (stryCov_9fa48("118915"), 'insert'),
  UPDATE: stryMutAct_9fa48("118916") ? "" : (stryCov_9fa48("118916"), 'update'),
  DELETE: stryMutAct_9fa48("118917") ? "" : (stryCov_9fa48("118917"), 'delete'),
  CREATE: stryMutAct_9fa48("118918") ? "" : (stryCov_9fa48("118918"), 'create'),
  ALTER: stryMutAct_9fa48("118919") ? "" : (stryCov_9fa48("118919"), 'alter'),
  DROP: stryMutAct_9fa48("118920") ? "" : (stryCov_9fa48("118920"), 'drop')
}));
const INSERT_MODE = Object.freeze(stryMutAct_9fa48("118921") ? {} : (stryCov_9fa48("118921"), {
  REPLACE: stryMutAct_9fa48("118922") ? "" : (stryCov_9fa48("118922"), 'replace'),
  IGNORE: stryMutAct_9fa48("118923") ? "" : (stryCov_9fa48("118923"), 'ignore'),
  OR_REPLACE: stryMutAct_9fa48("118924") ? "" : (stryCov_9fa48("118924"), 'or replace'),
  OR_IGNORE: stryMutAct_9fa48("118925") ? "" : (stryCov_9fa48("118925"), 'or ignore')
}));
const SQL_SCHEMA_KEYWORD = Object.freeze(stryMutAct_9fa48("118926") ? {} : (stryCov_9fa48("118926"), {
  TABLE: stryMutAct_9fa48("118927") ? "" : (stryCov_9fa48("118927"), 'table'),
  INDEX: stryMutAct_9fa48("118928") ? "" : (stryCov_9fa48("118928"), 'index'),
  COLUMN: stryMutAct_9fa48("118929") ? "" : (stryCov_9fa48("118929"), 'column'),
  CONSTRAINT: stryMutAct_9fa48("118930") ? "" : (stryCov_9fa48("118930"), 'constraint'),
  PRIMARY_KEY: stryMutAct_9fa48("118931") ? "" : (stryCov_9fa48("118931"), 'primary key'),
  UNIQUE: stryMutAct_9fa48("118932") ? "" : (stryCov_9fa48("118932"), 'unique'),
  NOT_NULL: stryMutAct_9fa48("118933") ? "" : (stryCov_9fa48("118933"), 'not null'),
  BTREE: stryMutAct_9fa48("118934") ? "" : (stryCov_9fa48("118934"), 'btree')
}));
const SQL_JOIN_TYPE = Object.freeze(stryMutAct_9fa48("118935") ? {} : (stryCov_9fa48("118935"), {
  LEFT: stryMutAct_9fa48("118936") ? "" : (stryCov_9fa48("118936"), 'LEFT'),
  RIGHT: stryMutAct_9fa48("118937") ? "" : (stryCov_9fa48("118937"), 'RIGHT'),
  CROSS: stryMutAct_9fa48("118938") ? "" : (stryCov_9fa48("118938"), 'CROSS'),
  INNER: stryMutAct_9fa48("118939") ? "" : (stryCov_9fa48("118939"), 'INNER')
}));
const SQL_SORT_DIRECTION = Object.freeze(stryMutAct_9fa48("118940") ? {} : (stryCov_9fa48("118940"), {
  ASC: stryMutAct_9fa48("118941") ? "" : (stryCov_9fa48("118941"), 'ASC')
}));
const SQL_OPERATOR = Object.freeze(stryMutAct_9fa48("118942") ? {} : (stryCov_9fa48("118942"), {
  IN: stryMutAct_9fa48("118943") ? "" : (stryCov_9fa48("118943"), 'IN'),
  NOT_IN: stryMutAct_9fa48("118944") ? "" : (stryCov_9fa48("118944"), 'NOT IN'),
  BETWEEN: stryMutAct_9fa48("118945") ? "" : (stryCov_9fa48("118945"), 'BETWEEN'),
  LIKE: stryMutAct_9fa48("118946") ? "" : (stryCov_9fa48("118946"), 'LIKE'),
  NOT_LIKE: stryMutAct_9fa48("118947") ? "" : (stryCov_9fa48("118947"), 'NOT LIKE'),
  IS: stryMutAct_9fa48("118948") ? "" : (stryCov_9fa48("118948"), 'IS'),
  IS_NOT: stryMutAct_9fa48("118949") ? "" : (stryCov_9fa48("118949"), 'IS NOT'),
  IS_NULL: stryMutAct_9fa48("118950") ? "" : (stryCov_9fa48("118950"), 'IS NULL'),
  IS_NOT_NULL: stryMutAct_9fa48("118951") ? "" : (stryCov_9fa48("118951"), 'IS NOT NULL'),
  ILIKE: stryMutAct_9fa48("118952") ? "" : (stryCov_9fa48("118952"), 'ILIKE'),
  NOT_ILIKE: stryMutAct_9fa48("118953") ? "" : (stryCov_9fa48("118953"), 'NOT ILIKE')
}));

/**
 * node-sql-parser expression-level AST type identifiers.
 * These are the raw type strings the external parser produces.
 */
const EXT_EXPR_TYPE = Object.freeze(stryMutAct_9fa48("118954") ? {} : (stryCov_9fa48("118954"), {
  BINARY_EXPR: stryMutAct_9fa48("118955") ? "" : (stryCov_9fa48("118955"), 'binary_expr'),
  UNARY_EXPR: stryMutAct_9fa48("118956") ? "" : (stryCov_9fa48("118956"), 'unary_expr'),
  COLUMN_REF: stryMutAct_9fa48("118957") ? "" : (stryCov_9fa48("118957"), 'column_ref'),
  NUMBER: stryMutAct_9fa48("118958") ? "" : (stryCov_9fa48("118958"), 'number'),
  SINGLE_QUOTE_STRING: stryMutAct_9fa48("118959") ? "" : (stryCov_9fa48("118959"), 'single_quote_string'),
  DOUBLE_QUOTE_STRING: stryMutAct_9fa48("118960") ? "" : (stryCov_9fa48("118960"), 'double_quote_string'),
  STRING: stryMutAct_9fa48("118961") ? "" : (stryCov_9fa48("118961"), 'string'),
  BOOL: stryMutAct_9fa48("118962") ? "" : (stryCov_9fa48("118962"), 'bool'),
  NULL: stryMutAct_9fa48("118963") ? "" : (stryCov_9fa48("118963"), 'null'),
  ORIGIN: stryMutAct_9fa48("118964") ? "" : (stryCov_9fa48("118964"), 'origin'),
  AGGR_FUNC: stryMutAct_9fa48("118965") ? "" : (stryCov_9fa48("118965"), 'aggr_func'),
  STAR: stryMutAct_9fa48("118966") ? "" : (stryCov_9fa48("118966"), 'star'),
  EXPR_LIST: stryMutAct_9fa48("118967") ? "" : (stryCov_9fa48("118967"), 'expr_list')
}));

/**
 * Star wildcard value used in SELECT * and aggregate(*) nodes.
 */
const STAR_VALUE = stryMutAct_9fa48("118968") ? "" : (stryCov_9fa48("118968"), '*');

/**
 * Parameter placeholder in origin nodes.
 */
const ORIGIN_PARAM = stryMutAct_9fa48("118969") ? "" : (stryCov_9fa48("118969"), '?');
const SQL_KEYWORD = Object.freeze(stryMutAct_9fa48("118970") ? {} : (stryCov_9fa48("118970"), {
  BEGIN: stryMutAct_9fa48("118971") ? "" : (stryCov_9fa48("118971"), 'BEGIN'),
  BEGIN_PREFIX: stryMutAct_9fa48("118972") ? "" : (stryCov_9fa48("118972"), 'BEGIN '),
  COMMIT: stryMutAct_9fa48("118973") ? "" : (stryCov_9fa48("118973"), 'COMMIT'),
  ROLLBACK: stryMutAct_9fa48("118974") ? "" : (stryCov_9fa48("118974"), 'ROLLBACK')
}));
class SQLParser {
  constructor(sql, options = {}) {
    if (stryMutAct_9fa48("118975")) {
      {}
    } else {
      stryCov_9fa48("118975");
      this.sql = sql;
      this.dialect = stryMutAct_9fa48("118978") ? options.dialect && PARSER_DIALECT.SQLITE : stryMutAct_9fa48("118977") ? false : stryMutAct_9fa48("118976") ? true : (stryCov_9fa48("118976", "118977", "118978"), options.dialect || PARSER_DIALECT.SQLITE);
      this.parser = new Parser();
      this.logger = this.initLogger();
      this.positionalParams = stryMutAct_9fa48("118979") ? ["Stryker was here"] : (stryCov_9fa48("118979"), []);
      this.parameterCounter = NUM.ZERO;
    }
  }
  initLogger() {
    if (stryMutAct_9fa48("118980")) {
      {}
    } else {
      stryCov_9fa48("118980");
      try {
        if (stryMutAct_9fa48("118981")) {
          {}
        } else {
          stryCov_9fa48("118981");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("118983") ? false : stryMutAct_9fa48("118982") ? true : (stryCov_9fa48("118982", "118983"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("118984")) {
              {}
            } else {
              stryCov_9fa48("118984");
              return loggingService.forSubsystem(PARSER_CONFIG.SUBSYSTEM);
            }
          }
        }
      } catch (logErr) {
        if (stryMutAct_9fa48("118985")) {
          {}
        } else {
          stryCov_9fa48("118985");
          console.warn(PARSER_ERROR_MSG.SQL_PARSE_ERROR_PREFIX, logErr.message);
        }
      }
      return console;
    }
  }
  parse() {
    if (stryMutAct_9fa48("118986")) {
      {}
    } else {
      stryCov_9fa48("118986");
      this.positionalParams = stryMutAct_9fa48("118987") ? ["Stryker was here"] : (stryCov_9fa48("118987"), []);
      this.parameterCounter = NUM.ZERO;
      const trimmedSql = stryMutAct_9fa48("118989") ? this.sql.toUpperCase() : stryMutAct_9fa48("118988") ? this.sql.trim().toLowerCase() : (stryCov_9fa48("118988", "118989"), this.sql.trim().toUpperCase());
      if (stryMutAct_9fa48("118992") ? trimmedSql === SQL_KEYWORD.BEGIN && trimmedSql.startsWith(SQL_KEYWORD.BEGIN_PREFIX) : stryMutAct_9fa48("118991") ? false : stryMutAct_9fa48("118990") ? true : (stryCov_9fa48("118990", "118991", "118992"), (stryMutAct_9fa48("118994") ? trimmedSql !== SQL_KEYWORD.BEGIN : stryMutAct_9fa48("118993") ? false : (stryCov_9fa48("118993", "118994"), trimmedSql === SQL_KEYWORD.BEGIN)) || (stryMutAct_9fa48("118995") ? trimmedSql.endsWith(SQL_KEYWORD.BEGIN_PREFIX) : (stryCov_9fa48("118995"), trimmedSql.startsWith(SQL_KEYWORD.BEGIN_PREFIX))))) {
        if (stryMutAct_9fa48("118996")) {
          {}
        } else {
          stryCov_9fa48("118996");
          return stryMutAct_9fa48("118997") ? {} : (stryCov_9fa48("118997"), {
            type: AST_TYPE.BEGIN_TRANSACTION
          });
        }
      }
      if (stryMutAct_9fa48("119000") ? trimmedSql !== SQL_KEYWORD.COMMIT : stryMutAct_9fa48("118999") ? false : stryMutAct_9fa48("118998") ? true : (stryCov_9fa48("118998", "118999", "119000"), trimmedSql === SQL_KEYWORD.COMMIT)) {
        if (stryMutAct_9fa48("119001")) {
          {}
        } else {
          stryCov_9fa48("119001");
          return stryMutAct_9fa48("119002") ? {} : (stryCov_9fa48("119002"), {
            type: AST_TYPE.COMMIT
          });
        }
      }
      if (stryMutAct_9fa48("119005") ? trimmedSql !== SQL_KEYWORD.ROLLBACK : stryMutAct_9fa48("119004") ? false : stryMutAct_9fa48("119003") ? true : (stryCov_9fa48("119003", "119004", "119005"), trimmedSql === SQL_KEYWORD.ROLLBACK)) {
        if (stryMutAct_9fa48("119006")) {
          {}
        } else {
          stryCov_9fa48("119006");
          return stryMutAct_9fa48("119007") ? {} : (stryCov_9fa48("119007"), {
            type: AST_TYPE.ROLLBACK
          });
        }
      }
      try {
        if (stryMutAct_9fa48("119008")) {
          {}
        } else {
          stryCov_9fa48("119008");
          const dbMode = (stryMutAct_9fa48("119011") ? this.dialect !== PARSER_DIALECT.POSTGRESQL : stryMutAct_9fa48("119010") ? false : stryMutAct_9fa48("119009") ? true : (stryCov_9fa48("119009", "119010", "119011"), this.dialect === PARSER_DIALECT.POSTGRESQL)) ? PARSER_CONFIG.DATABASE_PG : PARSER_CONFIG.DATABASE;
          const externalAst = this.parser.astify(this.sql, stryMutAct_9fa48("119012") ? {} : (stryCov_9fa48("119012"), {
            database: dbMode
          }));
          const ast = this.convertAst(externalAst);
          ast.rawSql = this.sql;
          if (stryMutAct_9fa48("119015") ? this.dialect === PARSER_DIALECT.POSTGRESQL || this.positionalParams.length > NUM.ZERO : stryMutAct_9fa48("119014") ? false : stryMutAct_9fa48("119013") ? true : (stryCov_9fa48("119013", "119014", "119015"), (stryMutAct_9fa48("119017") ? this.dialect !== PARSER_DIALECT.POSTGRESQL : stryMutAct_9fa48("119016") ? true : (stryCov_9fa48("119016", "119017"), this.dialect === PARSER_DIALECT.POSTGRESQL)) && (stryMutAct_9fa48("119020") ? this.positionalParams.length <= NUM.ZERO : stryMutAct_9fa48("119019") ? this.positionalParams.length >= NUM.ZERO : stryMutAct_9fa48("119018") ? true : (stryCov_9fa48("119018", "119019", "119020"), this.positionalParams.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("119021")) {
              {}
            } else {
              stryCov_9fa48("119021");
              ast._paramMapping = this.positionalParams;
            }
          }
          return ast;
        }
      } catch (error) {
        if (stryMutAct_9fa48("119022")) {
          {}
        } else {
          stryCov_9fa48("119022");
          const errorMsg = stryMutAct_9fa48("119023") ? PARSER_ERROR_MSG.SQL_PARSE_ERROR_PREFIX - error.message : (stryCov_9fa48("119023"), PARSER_ERROR_MSG.SQL_PARSE_ERROR_PREFIX + error.message);
          this.logger.error(errorMsg, stryMutAct_9fa48("119024") ? {} : (stryCov_9fa48("119024"), {
            sql: this.sql
          }));
          throw new Error(errorMsg);
        }
      }
    }
  }

  /**
   * Create a parameter placeholder node with a deterministic zero-based index.
   * This index preserves placeholder position across the converted AST.
   * @return {Object} Parameter expression node.
   * @private
   */
  createParameterNode() {
    if (stryMutAct_9fa48("119025")) {
      {}
    } else {
      stryCov_9fa48("119025");
      const index = this.parameterCounter;
      stryMutAct_9fa48("119026") ? this.parameterCounter -= NUM.ONE : (stryCov_9fa48("119026"), this.parameterCounter += NUM.ONE);
      return stryMutAct_9fa48("119027") ? {} : (stryCov_9fa48("119027"), {
        type: EXPR_TYPE.PARAMETER,
        index
      });
    }
  }
  convertAst(ast) {
    if (stryMutAct_9fa48("119028")) {
      {}
    } else {
      stryCov_9fa48("119028");
      // Handle array result (e.g., when SQL ends with semicolon)
      if (stryMutAct_9fa48("119030") ? false : stryMutAct_9fa48("119029") ? true : (stryCov_9fa48("119029", "119030"), Array.isArray(ast))) {
        if (stryMutAct_9fa48("119031")) {
          {}
        } else {
          stryCov_9fa48("119031");
          if (stryMutAct_9fa48("119034") ? ast.length !== NUM.ZERO : stryMutAct_9fa48("119033") ? false : stryMutAct_9fa48("119032") ? true : (stryCov_9fa48("119032", "119033", "119034"), ast.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("119035")) {
              {}
            } else {
              stryCov_9fa48("119035");
              throw new Error(PARSER_ERROR_MSG.EMPTY_SQL_STATEMENT);
            }
          }
          return this.convertAst(ast[NUM.ZERO]);
        }
      }
      switch (ast.type) {
        case EXTERNAL_TYPE.SELECT:
          if (stryMutAct_9fa48("119036")) {} else {
            stryCov_9fa48("119036");
            return this.convertSelect(ast);
          }
        case EXTERNAL_TYPE.INSERT:
          if (stryMutAct_9fa48("119037")) {} else {
            stryCov_9fa48("119037");
            return this.convertInsert(ast);
          }
        case EXTERNAL_TYPE.UPDATE:
          if (stryMutAct_9fa48("119038")) {} else {
            stryCov_9fa48("119038");
            return this.convertUpdate(ast);
          }
        case EXTERNAL_TYPE.DELETE:
          if (stryMutAct_9fa48("119039")) {} else {
            stryCov_9fa48("119039");
            return this.convertDelete(ast);
          }
        case EXTERNAL_TYPE.CREATE:
          if (stryMutAct_9fa48("119040")) {} else {
            stryCov_9fa48("119040");
            return this.convertCreate(ast);
          }
        case EXTERNAL_TYPE.ALTER:
          if (stryMutAct_9fa48("119041")) {} else {
            stryCov_9fa48("119041");
            return this.convertAlter(ast);
          }
        case EXTERNAL_TYPE.DROP:
          if (stryMutAct_9fa48("119042")) {} else {
            stryCov_9fa48("119042");
            return this.convertDrop(ast);
          }
        default:
          if (stryMutAct_9fa48("119043")) {} else {
            stryCov_9fa48("119043");
            throw new Error(stryMutAct_9fa48("119044") ? QUERY_ERROR_MSG.UNSUPPORTED_STATEMENT_PREFIX - ast.type : (stryCov_9fa48("119044"), QUERY_ERROR_MSG.UNSUPPORTED_STATEMENT_PREFIX + ast.type));
          }
      }
    }
  }
  convertSelect(ast) {
    if (stryMutAct_9fa48("119045")) {
      {}
    } else {
      stryCov_9fa48("119045");
      // PG mode: distinct is {type: 'DISTINCT'|null} vs SQLite string
      const distinct = (stryMutAct_9fa48("119048") ? typeof ast.distinct !== 'object' : stryMutAct_9fa48("119047") ? false : stryMutAct_9fa48("119046") ? true : (stryCov_9fa48("119046", "119047", "119048"), typeof ast.distinct === (stryMutAct_9fa48("119049") ? "" : (stryCov_9fa48("119049"), 'object')))) ? stryMutAct_9fa48("119052") ? ast.distinct?.type !== 'DISTINCT' : stryMutAct_9fa48("119051") ? false : stryMutAct_9fa48("119050") ? true : (stryCov_9fa48("119050", "119051", "119052"), (stryMutAct_9fa48("119053") ? ast.distinct.type : (stryCov_9fa48("119053"), ast.distinct?.type)) === (stryMutAct_9fa48("119054") ? "" : (stryCov_9fa48("119054"), 'DISTINCT'))) : stryMutAct_9fa48("119057") ? ast.distinct !== 'DISTINCT' : stryMutAct_9fa48("119056") ? false : stryMutAct_9fa48("119055") ? true : (stryCov_9fa48("119055", "119056", "119057"), ast.distinct === (stryMutAct_9fa48("119058") ? "" : (stryCov_9fa48("119058"), 'DISTINCT')));
      const ctes = this.convertCtes(ast.with);
      const recursive = ast.with ? stryMutAct_9fa48("119059") ? ast.with.every(c => !!c.recursive) : (stryCov_9fa48("119059"), ast.with.some(stryMutAct_9fa48("119060") ? () => undefined : (stryCov_9fa48("119060"), c => stryMutAct_9fa48("119061") ? !c.recursive : (stryCov_9fa48("119061"), !(stryMutAct_9fa48("119062") ? c.recursive : (stryCov_9fa48("119062"), !c.recursive)))))) : stryMutAct_9fa48("119063") ? true : (stryCov_9fa48("119063"), false);
      const setOperation = this.convertSetOperation(ast);
      return stryMutAct_9fa48("119064") ? {} : (stryCov_9fa48("119064"), {
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
        setOperation
      });
    }
  }

  /**
   * Convert WITH clause CTE definitions from node-sql-parser AST.
   * Handles both PG mode (stmt is direct select AST) and SQLite mode
   * (stmt wraps in {tableList, columnList, ast}).
   * @param {Array|null} withClause - Raw with clause array.
   * @returns {Array|null} Converted CTE definitions or null.
   */
  convertCtes(withClause) {
    if (stryMutAct_9fa48("119065")) {
      {}
    } else {
      stryCov_9fa48("119065");
      if (stryMutAct_9fa48("119068") ? !withClause && withClause.length === 0 : stryMutAct_9fa48("119067") ? false : stryMutAct_9fa48("119066") ? true : (stryCov_9fa48("119066", "119067", "119068"), (stryMutAct_9fa48("119069") ? withClause : (stryCov_9fa48("119069"), !withClause)) || (stryMutAct_9fa48("119071") ? withClause.length !== 0 : stryMutAct_9fa48("119070") ? false : (stryCov_9fa48("119070", "119071"), withClause.length === 0)))) {
        if (stryMutAct_9fa48("119072")) {
          {}
        } else {
          stryCov_9fa48("119072");
          return null;
        }
      }
      return withClause.map(cte => {
        if (stryMutAct_9fa48("119073")) {
          {}
        } else {
          stryCov_9fa48("119073");
          const name = stryMutAct_9fa48("119076") ? cte.name?.value && cte.name : stryMutAct_9fa48("119075") ? false : stryMutAct_9fa48("119074") ? true : (stryCov_9fa48("119074", "119075", "119076"), (stryMutAct_9fa48("119077") ? cte.name.value : (stryCov_9fa48("119077"), cte.name?.value)) || cte.name);
          // PG mode: stmt is the select AST directly
          // SQLite mode: stmt wraps in {tableList, columnList, ast}
          const stmtAst = stryMutAct_9fa48("119080") ? cte.stmt?.ast && cte.stmt : stryMutAct_9fa48("119079") ? false : stryMutAct_9fa48("119078") ? true : (stryCov_9fa48("119078", "119079", "119080"), (stryMutAct_9fa48("119081") ? cte.stmt.ast : (stryCov_9fa48("119081"), cte.stmt?.ast)) || cte.stmt);
          return stryMutAct_9fa48("119082") ? {} : (stryCov_9fa48("119082"), {
            name,
            query: this.convertSelect(stmtAst),
            recursive: stryMutAct_9fa48("119083") ? !cte.recursive : (stryCov_9fa48("119083"), !(stryMutAct_9fa48("119084") ? cte.recursive : (stryCov_9fa48("119084"), !cte.recursive)))
          });
        }
      });
    }
  }

  /**
   * Convert set operation (_next / set_op) from node-sql-parser AST.
   * Handles UNION, UNION ALL, INTERSECT, EXCEPT in both dialects.
   * @param {Object} ast - Raw select AST that may contain _next.
   * @returns {Object|null} Set operation node or null.
   */
  convertSetOperation(ast) {
    if (stryMutAct_9fa48("119085")) {
      {}
    } else {
      stryCov_9fa48("119085");
      if (stryMutAct_9fa48("119088") ? !ast._next && !ast.set_op : stryMutAct_9fa48("119087") ? false : stryMutAct_9fa48("119086") ? true : (stryCov_9fa48("119086", "119087", "119088"), (stryMutAct_9fa48("119089") ? ast._next : (stryCov_9fa48("119089"), !ast._next)) || (stryMutAct_9fa48("119090") ? ast.set_op : (stryCov_9fa48("119090"), !ast.set_op)))) {
        if (stryMutAct_9fa48("119091")) {
          {}
        } else {
          stryCov_9fa48("119091");
          return null;
        }
      }
      return stryMutAct_9fa48("119092") ? {} : (stryCov_9fa48("119092"), {
        type: stryMutAct_9fa48("119093") ? ast.set_op.toLowerCase() : (stryCov_9fa48("119093"), ast.set_op.toUpperCase()),
        right: this.convertSelect(ast._next)
      });
    }
  }
  convertInsert(ast) {
    if (stryMutAct_9fa48("119094")) {
      {}
    } else {
      stryCov_9fa48("119094");
      const tableName = ast.table[0].table;
      const columns = stryMutAct_9fa48("119097") ? ast.columns && null : stryMutAct_9fa48("119096") ? false : stryMutAct_9fa48("119095") ? true : (stryCov_9fa48("119095", "119096", "119097"), ast.columns || null);
      const values = stryMutAct_9fa48("119098") ? ["Stryker was here"] : (stryCov_9fa48("119098"), []);
      const insertMode = this.getInsertMode(ast);

      // node-sql-parser wraps values in {type: 'values', values: [...]}
      const valueRows = stryMutAct_9fa48("119101") ? ast.values?.values && [] : stryMutAct_9fa48("119100") ? false : stryMutAct_9fa48("119099") ? true : (stryCov_9fa48("119099", "119100", "119101"), (stryMutAct_9fa48("119102") ? ast.values.values : (stryCov_9fa48("119102"), ast.values?.values)) || (stryMutAct_9fa48("119103") ? ["Stryker was here"] : (stryCov_9fa48("119103"), [])));
      for (const row of valueRows) {
        if (stryMutAct_9fa48("119104")) {
          {}
        } else {
          stryCov_9fa48("119104");
          const rowValues = stryMutAct_9fa48("119105") ? ["Stryker was here"] : (stryCov_9fa48("119105"), []);
          const rowData = stryMutAct_9fa48("119108") ? row.value && [] : stryMutAct_9fa48("119107") ? false : stryMutAct_9fa48("119106") ? true : (stryCov_9fa48("119106", "119107", "119108"), row.value || (stryMutAct_9fa48("119109") ? ["Stryker was here"] : (stryCov_9fa48("119109"), [])));
          for (const val of rowData) {
            if (stryMutAct_9fa48("119110")) {
              {}
            } else {
              stryCov_9fa48("119110");
              rowValues.push(this.convertValue(val));
            }
          }
          values.push(rowValues);
        }
      }
      const insertAst = stryMutAct_9fa48("119111") ? {} : (stryCov_9fa48("119111"), {
        type: AST_TYPE.INSERT,
        table: tableName,
        columns,
        values,
        orReplace: stryMutAct_9fa48("119114") ? insertMode !== INSERT_MODE.REPLACE : stryMutAct_9fa48("119113") ? false : stryMutAct_9fa48("119112") ? true : (stryCov_9fa48("119112", "119113", "119114"), insertMode === INSERT_MODE.REPLACE),
        orIgnore: stryMutAct_9fa48("119117") ? insertMode !== INSERT_MODE.IGNORE : stryMutAct_9fa48("119116") ? false : stryMutAct_9fa48("119115") ? true : (stryCov_9fa48("119115", "119116", "119117"), insertMode === INSERT_MODE.IGNORE),
        returning: this.convertReturning(ast.returning)
      });
      if (stryMutAct_9fa48("119120") ? this.dialect === PARSER_DIALECT.POSTGRESQL || ast.conflict : stryMutAct_9fa48("119119") ? false : stryMutAct_9fa48("119118") ? true : (stryCov_9fa48("119118", "119119", "119120"), (stryMutAct_9fa48("119122") ? this.dialect !== PARSER_DIALECT.POSTGRESQL : stryMutAct_9fa48("119121") ? true : (stryCov_9fa48("119121", "119122"), this.dialect === PARSER_DIALECT.POSTGRESQL)) && ast.conflict)) {
        if (stryMutAct_9fa48("119123")) {
          {}
        } else {
          stryCov_9fa48("119123");
          translateOnConflict(insertAst, ast.conflict);
        }
      }
      return insertAst;
    }
  }

  /**
   * Detect INSERT modifier mode from parser AST.
   * Supports node-sql-parser's `ast.or` shape and legacy `ast.prefix`.
   * @param {Object} ast - Raw insert AST.
   * @return {string|null} One of 'replace', 'ignore', or null.
   * @private
   */
  getInsertMode(ast) {
    if (stryMutAct_9fa48("119124")) {
      {}
    } else {
      stryCov_9fa48("119124");
      if (stryMutAct_9fa48("119127") ? Array.isArray(ast.or) || ast.or.length >= NUM.TWO : stryMutAct_9fa48("119126") ? false : stryMutAct_9fa48("119125") ? true : (stryCov_9fa48("119125", "119126", "119127"), Array.isArray(ast.or) && (stryMutAct_9fa48("119130") ? ast.or.length < NUM.TWO : stryMutAct_9fa48("119129") ? ast.or.length > NUM.TWO : stryMutAct_9fa48("119128") ? true : (stryCov_9fa48("119128", "119129", "119130"), ast.or.length >= NUM.TWO)))) {
        if (stryMutAct_9fa48("119131")) {
          {}
        } else {
          stryCov_9fa48("119131");
          const mode = stryMutAct_9fa48("119132") ? String(ast.or[NUM.ONE]?.value || '').toUpperCase() : (stryCov_9fa48("119132"), String(stryMutAct_9fa48("119135") ? ast.or[NUM.ONE]?.value && '' : stryMutAct_9fa48("119134") ? false : stryMutAct_9fa48("119133") ? true : (stryCov_9fa48("119133", "119134", "119135"), (stryMutAct_9fa48("119136") ? ast.or[NUM.ONE].value : (stryCov_9fa48("119136"), ast.or[NUM.ONE]?.value)) || (stryMutAct_9fa48("119137") ? "Stryker was here!" : (stryCov_9fa48("119137"), '')))).toLowerCase());
          if (stryMutAct_9fa48("119140") ? mode === INSERT_MODE.REPLACE && mode === INSERT_MODE.IGNORE : stryMutAct_9fa48("119139") ? false : stryMutAct_9fa48("119138") ? true : (stryCov_9fa48("119138", "119139", "119140"), (stryMutAct_9fa48("119142") ? mode !== INSERT_MODE.REPLACE : stryMutAct_9fa48("119141") ? false : (stryCov_9fa48("119141", "119142"), mode === INSERT_MODE.REPLACE)) || (stryMutAct_9fa48("119144") ? mode !== INSERT_MODE.IGNORE : stryMutAct_9fa48("119143") ? false : (stryCov_9fa48("119143", "119144"), mode === INSERT_MODE.IGNORE)))) {
            if (stryMutAct_9fa48("119145")) {
              {}
            } else {
              stryCov_9fa48("119145");
              return mode;
            }
          }
        }
      }
      const prefix = stryMutAct_9fa48("119146") ? String(ast.prefix || '').toUpperCase() : (stryCov_9fa48("119146"), String(stryMutAct_9fa48("119149") ? ast.prefix && '' : stryMutAct_9fa48("119148") ? false : stryMutAct_9fa48("119147") ? true : (stryCov_9fa48("119147", "119148", "119149"), ast.prefix || (stryMutAct_9fa48("119150") ? "Stryker was here!" : (stryCov_9fa48("119150"), '')))).toLowerCase());
      if (stryMutAct_9fa48("119153") ? prefix !== INSERT_MODE.OR_REPLACE : stryMutAct_9fa48("119152") ? false : stryMutAct_9fa48("119151") ? true : (stryCov_9fa48("119151", "119152", "119153"), prefix === INSERT_MODE.OR_REPLACE)) {
        if (stryMutAct_9fa48("119154")) {
          {}
        } else {
          stryCov_9fa48("119154");
          return INSERT_MODE.REPLACE;
        }
      }
      if (stryMutAct_9fa48("119157") ? prefix !== INSERT_MODE.OR_IGNORE : stryMutAct_9fa48("119156") ? false : stryMutAct_9fa48("119155") ? true : (stryCov_9fa48("119155", "119156", "119157"), prefix === INSERT_MODE.OR_IGNORE)) {
        if (stryMutAct_9fa48("119158")) {
          {}
        } else {
          stryCov_9fa48("119158");
          return INSERT_MODE.IGNORE;
        }
      }
      return null;
    }
  }
  convertUpdate(ast) {
    if (stryMutAct_9fa48("119159")) {
      {}
    } else {
      stryCov_9fa48("119159");
      const tableName = ast.table[0].table;
      const assignments = ast.set.map(stryMutAct_9fa48("119160") ? () => undefined : (stryCov_9fa48("119160"), s => stryMutAct_9fa48("119161") ? {} : (stryCov_9fa48("119161"), {
        column: s.column,
        value: this.convertValue(s.value)
      })));
      return stryMutAct_9fa48("119162") ? {} : (stryCov_9fa48("119162"), {
        type: AST_TYPE.UPDATE,
        table: tableName,
        assignments,
        where: ast.where ? this.convertExpression(ast.where) : null,
        returning: this.convertReturning(ast.returning)
      });
    }
  }
  convertDelete(ast) {
    if (stryMutAct_9fa48("119163")) {
      {}
    } else {
      stryCov_9fa48("119163");
      const tableName = ast.from[0].table;
      return stryMutAct_9fa48("119164") ? {} : (stryCov_9fa48("119164"), {
        type: AST_TYPE.DELETE,
        table: tableName,
        where: ast.where ? this.convertExpression(ast.where) : null,
        returning: this.convertReturning(ast.returning)
      });
    }
  }

  /**
   * Convert a RETURNING clause from node-sql-parser AST.
   * Handles both SQLite and PG mode AST shapes.
   * @param {Object|null} returning - Raw returning clause from parser AST.
   * @return {string[]|string|null} Column names, '*', or null.
   * @private
   */
  convertReturning(returning) {
    if (stryMutAct_9fa48("119165")) {
      {}
    } else {
      stryCov_9fa48("119165");
      if (stryMutAct_9fa48("119168") ? (!returning || !returning.columns) && returning.columns.length === 0 : stryMutAct_9fa48("119167") ? false : stryMutAct_9fa48("119166") ? true : (stryCov_9fa48("119166", "119167", "119168"), (stryMutAct_9fa48("119170") ? !returning && !returning.columns : stryMutAct_9fa48("119169") ? false : (stryCov_9fa48("119169", "119170"), (stryMutAct_9fa48("119171") ? returning : (stryCov_9fa48("119171"), !returning)) || (stryMutAct_9fa48("119172") ? returning.columns : (stryCov_9fa48("119172"), !returning.columns)))) || (stryMutAct_9fa48("119174") ? returning.columns.length !== 0 : stryMutAct_9fa48("119173") ? false : (stryCov_9fa48("119173", "119174"), returning.columns.length === 0)))) {
        if (stryMutAct_9fa48("119175")) {
          {}
        } else {
          stryCov_9fa48("119175");
          return null;
        }
      }
      const columns = returning.columns;
      // Check for RETURNING * — column is the string '*' in both modes
      if (stryMutAct_9fa48("119178") ? columns.length === NUM.ONE && columns[NUM.ZERO].expr && columns[NUM.ZERO].expr.type === EXT_EXPR_TYPE.COLUMN_REF || columns[NUM.ZERO].expr.column === STAR_VALUE : stryMutAct_9fa48("119177") ? false : stryMutAct_9fa48("119176") ? true : (stryCov_9fa48("119176", "119177", "119178"), (stryMutAct_9fa48("119180") ? columns.length === NUM.ONE && columns[NUM.ZERO].expr || columns[NUM.ZERO].expr.type === EXT_EXPR_TYPE.COLUMN_REF : stryMutAct_9fa48("119179") ? true : (stryCov_9fa48("119179", "119180"), (stryMutAct_9fa48("119182") ? columns.length === NUM.ONE || columns[NUM.ZERO].expr : stryMutAct_9fa48("119181") ? true : (stryCov_9fa48("119181", "119182"), (stryMutAct_9fa48("119184") ? columns.length !== NUM.ONE : stryMutAct_9fa48("119183") ? true : (stryCov_9fa48("119183", "119184"), columns.length === NUM.ONE)) && columns[NUM.ZERO].expr)) && (stryMutAct_9fa48("119186") ? columns[NUM.ZERO].expr.type !== EXT_EXPR_TYPE.COLUMN_REF : stryMutAct_9fa48("119185") ? true : (stryCov_9fa48("119185", "119186"), columns[NUM.ZERO].expr.type === EXT_EXPR_TYPE.COLUMN_REF)))) && (stryMutAct_9fa48("119188") ? columns[NUM.ZERO].expr.column !== STAR_VALUE : stryMutAct_9fa48("119187") ? true : (stryCov_9fa48("119187", "119188"), columns[NUM.ZERO].expr.column === STAR_VALUE)))) {
        if (stryMutAct_9fa48("119189")) {
          {}
        } else {
          stryCov_9fa48("119189");
          return STAR_VALUE;
        }
      }
      // Extract column names — handle both PG and SQLite AST shapes
      const names = stryMutAct_9fa48("119190") ? ["Stryker was here"] : (stryCov_9fa48("119190"), []);
      for (const col of columns) {
        if (stryMutAct_9fa48("119191")) {
          {}
        } else {
          stryCov_9fa48("119191");
          const expr = col.expr;
          if (stryMutAct_9fa48("119194") ? expr || expr.type === EXT_EXPR_TYPE.COLUMN_REF : stryMutAct_9fa48("119193") ? false : stryMutAct_9fa48("119192") ? true : (stryCov_9fa48("119192", "119193", "119194"), expr && (stryMutAct_9fa48("119196") ? expr.type !== EXT_EXPR_TYPE.COLUMN_REF : stryMutAct_9fa48("119195") ? true : (stryCov_9fa48("119195", "119196"), expr.type === EXT_EXPR_TYPE.COLUMN_REF)))) {
            if (stryMutAct_9fa48("119197")) {
              {}
            } else {
              stryCov_9fa48("119197");
              const colRef = expr.column;
              if (stryMutAct_9fa48("119200") ? typeof colRef !== TYPEOF.STRING : stryMutAct_9fa48("119199") ? false : stryMutAct_9fa48("119198") ? true : (stryCov_9fa48("119198", "119199", "119200"), typeof colRef === TYPEOF.STRING)) {
                if (stryMutAct_9fa48("119201")) {
                  {}
                } else {
                  stryCov_9fa48("119201");
                  // SQLite mode: column is a plain string
                  names.push(colRef);
                }
              } else if (stryMutAct_9fa48("119204") ? colRef && colRef.expr || colRef.expr.value : stryMutAct_9fa48("119203") ? false : stryMutAct_9fa48("119202") ? true : (stryCov_9fa48("119202", "119203", "119204"), (stryMutAct_9fa48("119206") ? colRef || colRef.expr : stryMutAct_9fa48("119205") ? true : (stryCov_9fa48("119205", "119206"), colRef && colRef.expr)) && colRef.expr.value)) {
                if (stryMutAct_9fa48("119207")) {
                  {}
                } else {
                  stryCov_9fa48("119207");
                  // PG mode: column is {expr: {type: 'default', value: 'name'}}
                  names.push(colRef.expr.value);
                }
              }
            }
          }
        }
      }
      return (stryMutAct_9fa48("119211") ? names.length <= NUM.ZERO : stryMutAct_9fa48("119210") ? names.length >= NUM.ZERO : stryMutAct_9fa48("119209") ? false : stryMutAct_9fa48("119208") ? true : (stryCov_9fa48("119208", "119209", "119210", "119211"), names.length > NUM.ZERO)) ? names : null;
    }
  }
  convertAlter(ast) {
    if (stryMutAct_9fa48("119212")) {
      {}
    } else {
      stryCov_9fa48("119212");
      const tableName = stryMutAct_9fa48("119215") ? ast.table?.[0]?.table && null : stryMutAct_9fa48("119214") ? false : stryMutAct_9fa48("119213") ? true : (stryCov_9fa48("119213", "119214", "119215"), (stryMutAct_9fa48("119217") ? ast.table[0]?.table : stryMutAct_9fa48("119216") ? ast.table?.[0].table : (stryCov_9fa48("119216", "119217"), ast.table?.[0]?.table)) || null);
      const expression = (stryMutAct_9fa48("119220") ? Array.isArray(ast.expr) || ast.expr.length > 0 : stryMutAct_9fa48("119219") ? false : stryMutAct_9fa48("119218") ? true : (stryCov_9fa48("119218", "119219", "119220"), Array.isArray(ast.expr) && (stryMutAct_9fa48("119223") ? ast.expr.length <= 0 : stryMutAct_9fa48("119222") ? ast.expr.length >= 0 : stryMutAct_9fa48("119221") ? true : (stryCov_9fa48("119221", "119222", "119223"), ast.expr.length > 0)))) ? ast.expr[0] : null;
      const action = stryMutAct_9fa48("119224") ? String(expression?.action || '').toUpperCase() : (stryCov_9fa48("119224"), String(stryMutAct_9fa48("119227") ? expression?.action && '' : stryMutAct_9fa48("119226") ? false : stryMutAct_9fa48("119225") ? true : (stryCov_9fa48("119225", "119226", "119227"), (stryMutAct_9fa48("119228") ? expression.action : (stryCov_9fa48("119228"), expression?.action)) || (stryMutAct_9fa48("119229") ? "Stryker was here!" : (stryCov_9fa48("119229"), '')))).toLowerCase());
      const resource = stryMutAct_9fa48("119230") ? String(expression?.resource || '').toUpperCase() : (stryCov_9fa48("119230"), String(stryMutAct_9fa48("119233") ? expression?.resource && '' : stryMutAct_9fa48("119232") ? false : stryMutAct_9fa48("119231") ? true : (stryCov_9fa48("119231", "119232", "119233"), (stryMutAct_9fa48("119234") ? expression.resource : (stryCov_9fa48("119234"), expression?.resource)) || (stryMutAct_9fa48("119235") ? "Stryker was here!" : (stryCov_9fa48("119235"), '')))).toLowerCase());
      const columnName = this.resolveAlterColumnName(stryMutAct_9fa48("119236") ? expression.column : (stryCov_9fa48("119236"), expression?.column));
      const oldColumnName = this.resolveAlterColumnName(stryMutAct_9fa48("119237") ? expression.old_column : (stryCov_9fa48("119237"), expression?.old_column));
      const defaultValue = this.convertAlterDefaultValue(stryMutAct_9fa48("119238") ? expression.default_val : (stryCov_9fa48("119238"), expression?.default_val));
      const operation = stryMutAct_9fa48("119239") ? {} : (stryCov_9fa48("119239"), {
        action,
        resource,
        columnName: stryMutAct_9fa48("119242") ? oldColumnName && columnName : stryMutAct_9fa48("119241") ? false : stryMutAct_9fa48("119240") ? true : (stryCov_9fa48("119240", "119241", "119242"), oldColumnName || columnName),
        newColumnName: (stryMutAct_9fa48("119245") ? action !== 'rename' : stryMutAct_9fa48("119244") ? false : stryMutAct_9fa48("119243") ? true : (stryCov_9fa48("119243", "119244", "119245"), action === (stryMutAct_9fa48("119246") ? "" : (stryCov_9fa48("119246"), 'rename')))) ? columnName : null,
        dataType: stryMutAct_9fa48("119249") ? expression?.definition?.dataType && null : stryMutAct_9fa48("119248") ? false : stryMutAct_9fa48("119247") ? true : (stryCov_9fa48("119247", "119248", "119249"), (stryMutAct_9fa48("119251") ? expression.definition?.dataType : stryMutAct_9fa48("119250") ? expression?.definition.dataType : (stryCov_9fa48("119250", "119251"), expression?.definition?.dataType)) || null),
        defaultValue,
        keyword: stryMutAct_9fa48("119254") ? expression?.keyword && null : stryMutAct_9fa48("119253") ? false : stryMutAct_9fa48("119252") ? true : (stryCov_9fa48("119252", "119253", "119254"), (stryMutAct_9fa48("119255") ? expression.keyword : (stryCov_9fa48("119255"), expression?.keyword)) || null)
      });
      return stryMutAct_9fa48("119256") ? {} : (stryCov_9fa48("119256"), {
        type: AST_TYPE.ALTER_TABLE,
        table: tableName,
        operation
      });
    }
  }
  resolveAlterColumnName(columnRef) {
    if (stryMutAct_9fa48("119257")) {
      {}
    } else {
      stryCov_9fa48("119257");
      if (stryMutAct_9fa48("119260") ? false : stryMutAct_9fa48("119259") ? true : stryMutAct_9fa48("119258") ? columnRef : (stryCov_9fa48("119258", "119259", "119260"), !columnRef)) {
        if (stryMutAct_9fa48("119261")) {
          {}
        } else {
          stryCov_9fa48("119261");
          return null;
        }
      }
      if (stryMutAct_9fa48("119264") ? typeof columnRef.column !== TYPEOF.STRING : stryMutAct_9fa48("119263") ? false : stryMutAct_9fa48("119262") ? true : (stryCov_9fa48("119262", "119263", "119264"), typeof columnRef.column === TYPEOF.STRING)) {
        if (stryMutAct_9fa48("119265")) {
          {}
        } else {
          stryCov_9fa48("119265");
          return columnRef.column;
        }
      }
      if (stryMutAct_9fa48("119269") ? columnRef.column.expr?.value : stryMutAct_9fa48("119268") ? columnRef.column?.expr.value : stryMutAct_9fa48("119267") ? false : stryMutAct_9fa48("119266") ? true : (stryCov_9fa48("119266", "119267", "119268", "119269"), columnRef.column?.expr?.value)) {
        if (stryMutAct_9fa48("119270")) {
          {}
        } else {
          stryCov_9fa48("119270");
          return columnRef.column.expr.value;
        }
      }
      return null;
    }
  }
  convertAlterDefaultValue(defaultNode) {
    if (stryMutAct_9fa48("119271")) {
      {}
    } else {
      stryCov_9fa48("119271");
      if (stryMutAct_9fa48("119274") ? false : stryMutAct_9fa48("119273") ? true : stryMutAct_9fa48("119272") ? defaultNode : (stryCov_9fa48("119272", "119273", "119274"), !defaultNode)) {
        if (stryMutAct_9fa48("119275")) {
          {}
        } else {
          stryCov_9fa48("119275");
          return null;
        }
      }
      if (stryMutAct_9fa48("119277") ? false : stryMutAct_9fa48("119276") ? true : (stryCov_9fa48("119276", "119277"), Object.prototype.hasOwnProperty.call(defaultNode, stryMutAct_9fa48("119278") ? "" : (stryCov_9fa48("119278"), 'value')))) {
        if (stryMutAct_9fa48("119279")) {
          {}
        } else {
          stryCov_9fa48("119279");
          const converted = this.convertValue(defaultNode.value);
          if (stryMutAct_9fa48("119282") ? converted && converted.type === EXPR_TYPE.LITERAL || Object.prototype.hasOwnProperty.call(converted, 'value') : stryMutAct_9fa48("119281") ? false : stryMutAct_9fa48("119280") ? true : (stryCov_9fa48("119280", "119281", "119282"), (stryMutAct_9fa48("119284") ? converted || converted.type === EXPR_TYPE.LITERAL : stryMutAct_9fa48("119283") ? true : (stryCov_9fa48("119283", "119284"), converted && (stryMutAct_9fa48("119286") ? converted.type !== EXPR_TYPE.LITERAL : stryMutAct_9fa48("119285") ? true : (stryCov_9fa48("119285", "119286"), converted.type === EXPR_TYPE.LITERAL)))) && Object.prototype.hasOwnProperty.call(converted, stryMutAct_9fa48("119287") ? "" : (stryCov_9fa48("119287"), 'value')))) {
            if (stryMutAct_9fa48("119288")) {
              {}
            } else {
              stryCov_9fa48("119288");
              return converted.value;
            }
          }
          return converted;
        }
      }
      return null;
    }
  }
  convertCreate(ast) {
    if (stryMutAct_9fa48("119289")) {
      {}
    } else {
      stryCov_9fa48("119289");
      if (stryMutAct_9fa48("119292") ? ast.keyword !== SQL_SCHEMA_KEYWORD.TABLE : stryMutAct_9fa48("119291") ? false : stryMutAct_9fa48("119290") ? true : (stryCov_9fa48("119290", "119291", "119292"), ast.keyword === SQL_SCHEMA_KEYWORD.TABLE)) {
        if (stryMutAct_9fa48("119293")) {
          {}
        } else {
          stryCov_9fa48("119293");
          return this.convertCreateTable(ast);
        }
      }
      if (stryMutAct_9fa48("119296") ? ast.keyword !== SQL_SCHEMA_KEYWORD.INDEX : stryMutAct_9fa48("119295") ? false : stryMutAct_9fa48("119294") ? true : (stryCov_9fa48("119294", "119295", "119296"), ast.keyword === SQL_SCHEMA_KEYWORD.INDEX)) {
        if (stryMutAct_9fa48("119297")) {
          {}
        } else {
          stryCov_9fa48("119297");
          return this.convertCreateIndex(ast);
        }
      }
      throw new Error(stryMutAct_9fa48("119298") ? PARSER_ERROR_MSG.UNSUPPORTED_CREATE_TYPE_PREFIX - ast.keyword : (stryCov_9fa48("119298"), PARSER_ERROR_MSG.UNSUPPORTED_CREATE_TYPE_PREFIX + ast.keyword));
    }
  }
  convertCreateTable(ast) {
    if (stryMutAct_9fa48("119299")) {
      {}
    } else {
      stryCov_9fa48("119299");
      const tableName = ast.table[0].table;
      const columns = stryMutAct_9fa48("119300") ? ["Stryker was here"] : (stryCov_9fa48("119300"), []);
      const tableConstraints = stryMutAct_9fa48("119301") ? ["Stryker was here"] : (stryCov_9fa48("119301"), []);
      let primaryKey = null;
      for (const def of stryMutAct_9fa48("119304") ? ast.create_definitions && [] : stryMutAct_9fa48("119303") ? false : stryMutAct_9fa48("119302") ? true : (stryCov_9fa48("119302", "119303", "119304"), ast.create_definitions || (stryMutAct_9fa48("119305") ? ["Stryker was here"] : (stryCov_9fa48("119305"), [])))) {
        if (stryMutAct_9fa48("119306")) {
          {}
        } else {
          stryCov_9fa48("119306");
          if (stryMutAct_9fa48("119309") ? def.resource !== SQL_SCHEMA_KEYWORD.COLUMN : stryMutAct_9fa48("119308") ? false : stryMutAct_9fa48("119307") ? true : (stryCov_9fa48("119307", "119308", "119309"), def.resource === SQL_SCHEMA_KEYWORD.COLUMN)) {
            if (stryMutAct_9fa48("119310")) {
              {}
            } else {
              stryCov_9fa48("119310");
              const column = stryMutAct_9fa48("119311") ? {} : (stryCov_9fa48("119311"), {
                name: def.column.column,
                dataType: stryMutAct_9fa48("119312") ? {} : (stryCov_9fa48("119312"), {
                  name: def.definition.dataType,
                  length: stryMutAct_9fa48("119315") ? def.definition.length && null : stryMutAct_9fa48("119314") ? false : stryMutAct_9fa48("119313") ? true : (stryCov_9fa48("119313", "119314", "119315"), def.definition.length || null),
                  precision: null,
                  scale: null
                }),
                primaryKey: stryMutAct_9fa48("119316") ? !def.primary_key : (stryCov_9fa48("119316"), !(stryMutAct_9fa48("119317") ? def.primary_key : (stryCov_9fa48("119317"), !def.primary_key))),
                notNull: stryMutAct_9fa48("119320") ? def.nullable?.type !== SQL_SCHEMA_KEYWORD.NOT_NULL : stryMutAct_9fa48("119319") ? false : stryMutAct_9fa48("119318") ? true : (stryCov_9fa48("119318", "119319", "119320"), (stryMutAct_9fa48("119321") ? def.nullable.type : (stryCov_9fa48("119321"), def.nullable?.type)) === SQL_SCHEMA_KEYWORD.NOT_NULL),
                unique: stryMutAct_9fa48("119322") ? !def.unique : (stryCov_9fa48("119322"), !(stryMutAct_9fa48("119323") ? def.unique : (stryCov_9fa48("119323"), !def.unique))),
                defaultValue: def.default_val ? this.convertValue(def.default_val.value) : null
              });
              columns.push(column);
              if (stryMutAct_9fa48("119326") ? column.primaryKey || !primaryKey : stryMutAct_9fa48("119325") ? false : stryMutAct_9fa48("119324") ? true : (stryCov_9fa48("119324", "119325", "119326"), column.primaryKey && (stryMutAct_9fa48("119327") ? primaryKey : (stryCov_9fa48("119327"), !primaryKey)))) {
                if (stryMutAct_9fa48("119328")) {
                  {}
                } else {
                  stryCov_9fa48("119328");
                  primaryKey = stryMutAct_9fa48("119329") ? [] : (stryCov_9fa48("119329"), [column.name]);
                }
              }
            }
          } else if (stryMutAct_9fa48("119332") ? def.resource !== SQL_SCHEMA_KEYWORD.CONSTRAINT : stryMutAct_9fa48("119331") ? false : stryMutAct_9fa48("119330") ? true : (stryCov_9fa48("119330", "119331", "119332"), def.resource === SQL_SCHEMA_KEYWORD.CONSTRAINT)) {
            if (stryMutAct_9fa48("119333")) {
              {}
            } else {
              stryCov_9fa48("119333");
              if (stryMutAct_9fa48("119336") ? def.constraint_type !== SQL_SCHEMA_KEYWORD.PRIMARY_KEY : stryMutAct_9fa48("119335") ? false : stryMutAct_9fa48("119334") ? true : (stryCov_9fa48("119334", "119335", "119336"), def.constraint_type === SQL_SCHEMA_KEYWORD.PRIMARY_KEY)) {
                if (stryMutAct_9fa48("119337")) {
                  {}
                } else {
                  stryCov_9fa48("119337");
                  const pkColumns = def.definition.map(stryMutAct_9fa48("119338") ? () => undefined : (stryCov_9fa48("119338"), d => d.column));
                  tableConstraints.push(stryMutAct_9fa48("119339") ? {} : (stryCov_9fa48("119339"), {
                    type: stryMutAct_9fa48("119340") ? "" : (stryCov_9fa48("119340"), 'PRIMARY_KEY'),
                    columns: pkColumns
                  }));
                  primaryKey = pkColumns;
                }
              } else if (stryMutAct_9fa48("119343") ? def.constraint_type !== SQL_SCHEMA_KEYWORD.UNIQUE : stryMutAct_9fa48("119342") ? false : stryMutAct_9fa48("119341") ? true : (stryCov_9fa48("119341", "119342", "119343"), def.constraint_type === SQL_SCHEMA_KEYWORD.UNIQUE)) {
                if (stryMutAct_9fa48("119344")) {
                  {}
                } else {
                  stryCov_9fa48("119344");
                  const uniqueColumns = def.definition.map(stryMutAct_9fa48("119345") ? () => undefined : (stryCov_9fa48("119345"), d => d.column));
                  tableConstraints.push(stryMutAct_9fa48("119346") ? {} : (stryCov_9fa48("119346"), {
                    type: stryMutAct_9fa48("119347") ? "" : (stryCov_9fa48("119347"), 'UNIQUE'),
                    columns: uniqueColumns
                  }));
                }
              }
            }
          }
        }
      }
      return stryMutAct_9fa48("119348") ? {} : (stryCov_9fa48("119348"), {
        type: AST_TYPE.CREATE_TABLE,
        tableName,
        ifNotExists: stryMutAct_9fa48("119349") ? !ast.if_not_exists : (stryCov_9fa48("119349"), !(stryMutAct_9fa48("119350") ? ast.if_not_exists : (stryCov_9fa48("119350"), !ast.if_not_exists))),
        columns,
        tableConstraints,
        primaryKey
      });
    }
  }
  convertCreateIndex(ast) {
    if (stryMutAct_9fa48("119351")) {
      {}
    } else {
      stryCov_9fa48("119351");
      return stryMutAct_9fa48("119352") ? {} : (stryCov_9fa48("119352"), {
        type: AST_TYPE.CREATE_INDEX,
        indexName: ast.index,
        tableName: ast.table.table,
        columns: ast.index_columns.map(stryMutAct_9fa48("119353") ? () => undefined : (stryCov_9fa48("119353"), c => c.column)),
        unique: stryMutAct_9fa48("119354") ? !ast.index_type?.includes(SQL_SCHEMA_KEYWORD.UNIQUE) : (stryCov_9fa48("119354"), !(stryMutAct_9fa48("119355") ? ast.index_type?.includes(SQL_SCHEMA_KEYWORD.UNIQUE) : (stryCov_9fa48("119355"), !(stryMutAct_9fa48("119356") ? ast.index_type.includes(SQL_SCHEMA_KEYWORD.UNIQUE) : (stryCov_9fa48("119356"), ast.index_type?.includes(SQL_SCHEMA_KEYWORD.UNIQUE)))))),
        ifNotExists: stryMutAct_9fa48("119357") ? !ast.if_not_exists : (stryCov_9fa48("119357"), !(stryMutAct_9fa48("119358") ? ast.if_not_exists : (stryCov_9fa48("119358"), !ast.if_not_exists))),
        indexType: SQL_SCHEMA_KEYWORD.BTREE
      });
    }
  }
  convertDrop(ast) {
    if (stryMutAct_9fa48("119359")) {
      {}
    } else {
      stryCov_9fa48("119359");
      if (stryMutAct_9fa48("119362") ? ast.keyword !== SQL_SCHEMA_KEYWORD.TABLE : stryMutAct_9fa48("119361") ? false : stryMutAct_9fa48("119360") ? true : (stryCov_9fa48("119360", "119361", "119362"), ast.keyword === SQL_SCHEMA_KEYWORD.TABLE)) {
        if (stryMutAct_9fa48("119363")) {
          {}
        } else {
          stryCov_9fa48("119363");
          return stryMutAct_9fa48("119364") ? {} : (stryCov_9fa48("119364"), {
            type: AST_TYPE.DROP_TABLE,
            tableName: ast.name[0].table,
            ifExists: stryMutAct_9fa48("119365") ? !ast.if_exists : (stryCov_9fa48("119365"), !(stryMutAct_9fa48("119366") ? ast.if_exists : (stryCov_9fa48("119366"), !ast.if_exists)))
          });
        }
      }
      if (stryMutAct_9fa48("119369") ? ast.keyword !== SQL_SCHEMA_KEYWORD.INDEX : stryMutAct_9fa48("119368") ? false : stryMutAct_9fa48("119367") ? true : (stryCov_9fa48("119367", "119368", "119369"), ast.keyword === SQL_SCHEMA_KEYWORD.INDEX)) {
        if (stryMutAct_9fa48("119370")) {
          {}
        } else {
          stryCov_9fa48("119370");
          return stryMutAct_9fa48("119371") ? {} : (stryCov_9fa48("119371"), {
            type: AST_TYPE.DROP_INDEX,
            indexName: ast.name[0].table,
            tableName: null,
            ifExists: stryMutAct_9fa48("119372") ? !ast.if_exists : (stryCov_9fa48("119372"), !(stryMutAct_9fa48("119373") ? ast.if_exists : (stryCov_9fa48("119373"), !ast.if_exists)))
          });
        }
      }
      throw new Error(stryMutAct_9fa48("119374") ? PARSER_ERROR_MSG.UNSUPPORTED_DROP_TYPE_PREFIX - ast.keyword : (stryCov_9fa48("119374"), PARSER_ERROR_MSG.UNSUPPORTED_DROP_TYPE_PREFIX + ast.keyword));
    }
  }
  convertColumns(columns) {
    if (stryMutAct_9fa48("119375")) {
      {}
    } else {
      stryCov_9fa48("119375");
      return columns.map(col => {
        if (stryMutAct_9fa48("119376")) {
          {}
        } else {
          stryCov_9fa48("119376");
          if (stryMutAct_9fa48("119379") ? col.expr.type === EXT_EXPR_TYPE.STAR && col.expr.column === STAR_VALUE : stryMutAct_9fa48("119378") ? false : stryMutAct_9fa48("119377") ? true : (stryCov_9fa48("119377", "119378", "119379"), (stryMutAct_9fa48("119381") ? col.expr.type !== EXT_EXPR_TYPE.STAR : stryMutAct_9fa48("119380") ? false : (stryCov_9fa48("119380", "119381"), col.expr.type === EXT_EXPR_TYPE.STAR)) || (stryMutAct_9fa48("119383") ? col.expr.column !== STAR_VALUE : stryMutAct_9fa48("119382") ? false : (stryCov_9fa48("119382", "119383"), col.expr.column === STAR_VALUE)))) {
            if (stryMutAct_9fa48("119384")) {
              {}
            } else {
              stryCov_9fa48("119384");
              return stryMutAct_9fa48("119385") ? {} : (stryCov_9fa48("119385"), {
                type: EXPR_TYPE.STAR,
                value: STAR_VALUE
              });
            }
          }
          return stryMutAct_9fa48("119386") ? {} : (stryCov_9fa48("119386"), {
            type: EXPR_TYPE.COLUMN,
            expression: this.convertExpression(col.expr),
            alias: stryMutAct_9fa48("119389") ? col.as && null : stryMutAct_9fa48("119388") ? false : stryMutAct_9fa48("119387") ? true : (stryCov_9fa48("119387", "119388", "119389"), col.as || null)
          });
        }
      });
    }
  }
  convertFrom(from) {
    if (stryMutAct_9fa48("119390")) {
      {}
    } else {
      stryCov_9fa48("119390");
      if (stryMutAct_9fa48("119393") ? !from && from.length === NUM.ZERO : stryMutAct_9fa48("119392") ? false : stryMutAct_9fa48("119391") ? true : (stryCov_9fa48("119391", "119392", "119393"), (stryMutAct_9fa48("119394") ? from : (stryCov_9fa48("119394"), !from)) || (stryMutAct_9fa48("119396") ? from.length !== NUM.ZERO : stryMutAct_9fa48("119395") ? false : (stryCov_9fa48("119395", "119396"), from.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("119397")) {
          {}
        } else {
          stryCov_9fa48("119397");
          return null;
        }
      }
      const firstTable = from[NUM.ZERO];

      // Derived table: FROM (SELECT ...) AS alias
      if (stryMutAct_9fa48("119400") ? firstTable.expr.ast : stryMutAct_9fa48("119399") ? false : stryMutAct_9fa48("119398") ? true : (stryCov_9fa48("119398", "119399", "119400"), firstTable.expr?.ast)) {
        if (stryMutAct_9fa48("119401")) {
          {}
        } else {
          stryCov_9fa48("119401");
          return stryMutAct_9fa48("119402") ? {} : (stryCov_9fa48("119402"), {
            type: EXPR_TYPE.TABLE,
            name: null,
            alias: stryMutAct_9fa48("119405") ? firstTable.as && null : stryMutAct_9fa48("119404") ? false : stryMutAct_9fa48("119403") ? true : (stryCov_9fa48("119403", "119404", "119405"), firstTable.as || null),
            subquery: this.convertSelect(firstTable.expr.ast)
          });
        }
      }
      return stryMutAct_9fa48("119406") ? {} : (stryCov_9fa48("119406"), {
        type: EXPR_TYPE.TABLE,
        name: firstTable.table,
        alias: stryMutAct_9fa48("119409") ? firstTable.as && null : stryMutAct_9fa48("119408") ? false : stryMutAct_9fa48("119407") ? true : (stryCov_9fa48("119407", "119408", "119409"), firstTable.as || null)
      });
    }
  }
  convertJoins(from) {
    if (stryMutAct_9fa48("119410")) {
      {}
    } else {
      stryCov_9fa48("119410");
      if (stryMutAct_9fa48("119413") ? !from && from.length <= NUM.ONE : stryMutAct_9fa48("119412") ? false : stryMutAct_9fa48("119411") ? true : (stryCov_9fa48("119411", "119412", "119413"), (stryMutAct_9fa48("119414") ? from : (stryCov_9fa48("119414"), !from)) || (stryMutAct_9fa48("119417") ? from.length > NUM.ONE : stryMutAct_9fa48("119416") ? from.length < NUM.ONE : stryMutAct_9fa48("119415") ? false : (stryCov_9fa48("119415", "119416", "119417"), from.length <= NUM.ONE)))) {
        if (stryMutAct_9fa48("119418")) {
          {}
        } else {
          stryCov_9fa48("119418");
          return stryMutAct_9fa48("119419") ? ["Stryker was here"] : (stryCov_9fa48("119419"), []);
        }
      }
      const joins = stryMutAct_9fa48("119420") ? ["Stryker was here"] : (stryCov_9fa48("119420"), []);
      for (let i = NUM.ONE; stryMutAct_9fa48("119423") ? i >= from.length : stryMutAct_9fa48("119422") ? i <= from.length : stryMutAct_9fa48("119421") ? false : (stryCov_9fa48("119421", "119422", "119423"), i < from.length); stryMutAct_9fa48("119424") ? i-- : (stryCov_9fa48("119424"), i++)) {
        if (stryMutAct_9fa48("119425")) {
          {}
        } else {
          stryCov_9fa48("119425");
          const joinDef = from[i];
          if (stryMutAct_9fa48("119427") ? false : stryMutAct_9fa48("119426") ? true : (stryCov_9fa48("119426", "119427"), joinDef.join)) {
            if (stryMutAct_9fa48("119428")) {
              {}
            } else {
              stryCov_9fa48("119428");
              // Derived table in JOIN: joinDef.expr.ast exists
              let table;
              if (stryMutAct_9fa48("119431") ? joinDef.expr.ast : stryMutAct_9fa48("119430") ? false : stryMutAct_9fa48("119429") ? true : (stryCov_9fa48("119429", "119430", "119431"), joinDef.expr?.ast)) {
                if (stryMutAct_9fa48("119432")) {
                  {}
                } else {
                  stryCov_9fa48("119432");
                  table = stryMutAct_9fa48("119433") ? {} : (stryCov_9fa48("119433"), {
                    type: EXPR_TYPE.TABLE,
                    name: null,
                    alias: stryMutAct_9fa48("119436") ? joinDef.as && null : stryMutAct_9fa48("119435") ? false : stryMutAct_9fa48("119434") ? true : (stryCov_9fa48("119434", "119435", "119436"), joinDef.as || null),
                    subquery: this.convertSelect(joinDef.expr.ast)
                  });
                }
              } else {
                if (stryMutAct_9fa48("119437")) {
                  {}
                } else {
                  stryCov_9fa48("119437");
                  table = stryMutAct_9fa48("119438") ? {} : (stryCov_9fa48("119438"), {
                    type: EXPR_TYPE.TABLE,
                    name: joinDef.table,
                    alias: stryMutAct_9fa48("119441") ? joinDef.as && null : stryMutAct_9fa48("119440") ? false : stryMutAct_9fa48("119439") ? true : (stryCov_9fa48("119439", "119440", "119441"), joinDef.as || null)
                  });
                }
              }
              joins.push(stryMutAct_9fa48("119442") ? {} : (stryCov_9fa48("119442"), {
                type: EXPR_TYPE.JOIN,
                joinType: this.normalizeJoinType(joinDef.join),
                table,
                condition: joinDef.on ? this.convertExpression(joinDef.on) : null
              }));
            }
          }
        }
      }
      return joins;
    }
  }
  normalizeJoinType(joinType) {
    if (stryMutAct_9fa48("119443")) {
      {}
    } else {
      stryCov_9fa48("119443");
      const upper = stryMutAct_9fa48("119444") ? joinType.toLowerCase() : (stryCov_9fa48("119444"), joinType.toUpperCase());
      if (stryMutAct_9fa48("119446") ? false : stryMutAct_9fa48("119445") ? true : (stryCov_9fa48("119445", "119446"), upper.includes(SQL_JOIN_TYPE.LEFT))) return SQL_JOIN_TYPE.LEFT;
      if (stryMutAct_9fa48("119448") ? false : stryMutAct_9fa48("119447") ? true : (stryCov_9fa48("119447", "119448"), upper.includes(SQL_JOIN_TYPE.RIGHT))) return SQL_JOIN_TYPE.RIGHT;
      if (stryMutAct_9fa48("119450") ? false : stryMutAct_9fa48("119449") ? true : (stryCov_9fa48("119449", "119450"), upper.includes(SQL_JOIN_TYPE.CROSS))) return SQL_JOIN_TYPE.CROSS;
      return SQL_JOIN_TYPE.INNER;
    }
  }
  convertGroupBy(groupBy) {
    if (stryMutAct_9fa48("119451")) {
      {}
    } else {
      stryCov_9fa48("119451");
      const columns = stryMutAct_9fa48("119454") ? groupBy.columns && groupBy : stryMutAct_9fa48("119453") ? false : stryMutAct_9fa48("119452") ? true : (stryCov_9fa48("119452", "119453", "119454"), groupBy.columns || groupBy);
      if (stryMutAct_9fa48("119457") ? false : stryMutAct_9fa48("119456") ? true : stryMutAct_9fa48("119455") ? Array.isArray(columns) : (stryCov_9fa48("119455", "119456", "119457"), !Array.isArray(columns))) {
        if (stryMutAct_9fa48("119458")) {
          {}
        } else {
          stryCov_9fa48("119458");
          return stryMutAct_9fa48("119459") ? [] : (stryCov_9fa48("119459"), [this.convertExpression(columns)]);
        }
      }
      return columns.map(stryMutAct_9fa48("119460") ? () => undefined : (stryCov_9fa48("119460"), g => this.convertExpression(g)));
    }
  }
  convertOrderBy(orderBy) {
    if (stryMutAct_9fa48("119461")) {
      {}
    } else {
      stryCov_9fa48("119461");
      return orderBy.map(stryMutAct_9fa48("119462") ? () => undefined : (stryCov_9fa48("119462"), o => stryMutAct_9fa48("119463") ? {} : (stryCov_9fa48("119463"), {
        expression: this.convertExpression(o.expr),
        direction: stryMutAct_9fa48("119466") ? o.type && SQL_SORT_DIRECTION.ASC : stryMutAct_9fa48("119465") ? false : stryMutAct_9fa48("119464") ? true : (stryCov_9fa48("119464", "119465", "119466"), o.type || SQL_SORT_DIRECTION.ASC)
      })));
    }
  }
  convertLimit(limit) {
    if (stryMutAct_9fa48("119467")) {
      {}
    } else {
      stryCov_9fa48("119467");
      if (stryMutAct_9fa48("119470") ? !limit && !limit.value : stryMutAct_9fa48("119469") ? false : stryMutAct_9fa48("119468") ? true : (stryCov_9fa48("119468", "119469", "119470"), (stryMutAct_9fa48("119471") ? limit : (stryCov_9fa48("119471"), !limit)) || (stryMutAct_9fa48("119472") ? limit.value : (stryCov_9fa48("119472"), !limit.value)))) {
        if (stryMutAct_9fa48("119473")) {
          {}
        } else {
          stryCov_9fa48("119473");
          return null;
        }
      }
      const values = limit.value;
      const count = stryMutAct_9fa48("119474") ? values[NUM.ZERO].value : (stryCov_9fa48("119474"), values[NUM.ZERO]?.value);
      const offset = (stryMutAct_9fa48("119478") ? values.length <= NUM.ONE : stryMutAct_9fa48("119477") ? values.length >= NUM.ONE : stryMutAct_9fa48("119476") ? false : stryMutAct_9fa48("119475") ? true : (stryCov_9fa48("119475", "119476", "119477", "119478"), values.length > NUM.ONE)) ? stryMutAct_9fa48("119479") ? values[NUM.ONE].value : (stryCov_9fa48("119479"), values[NUM.ONE]?.value) : null;
      return stryMutAct_9fa48("119480") ? {} : (stryCov_9fa48("119480"), {
        count,
        offset
      });
    }
  }
  convertExpression(expr) {
    if (stryMutAct_9fa48("119481")) {
      {}
    } else {
      stryCov_9fa48("119481");
      if (stryMutAct_9fa48("119484") ? false : stryMutAct_9fa48("119483") ? true : stryMutAct_9fa48("119482") ? expr : (stryCov_9fa48("119482", "119483", "119484"), !expr)) {
        if (stryMutAct_9fa48("119485")) {
          {}
        } else {
          stryCov_9fa48("119485");
          return null;
        }
      }

      // PG-specific node types (only when dialect is postgresql)
      if (stryMutAct_9fa48("119488") ? this.dialect !== PARSER_DIALECT.POSTGRESQL : stryMutAct_9fa48("119487") ? false : stryMutAct_9fa48("119486") ? true : (stryCov_9fa48("119486", "119487", "119488"), this.dialect === PARSER_DIALECT.POSTGRESQL)) {
        if (stryMutAct_9fa48("119489")) {
          {}
        } else {
          stryCov_9fa48("119489");
          const pgResult = this.convertPgExpression(expr);
          if (stryMutAct_9fa48("119491") ? false : stryMutAct_9fa48("119490") ? true : (stryCov_9fa48("119490", "119491"), pgResult)) {
            if (stryMutAct_9fa48("119492")) {
              {}
            } else {
              stryCov_9fa48("119492");
              return pgResult;
            }
          }
        }
      }

      // Scalar subquery: node has .ast property (SELECT wrapped in parens)
      if (stryMutAct_9fa48("119495") ? expr.ast || expr.parentheses : stryMutAct_9fa48("119494") ? false : stryMutAct_9fa48("119493") ? true : (stryCov_9fa48("119493", "119494", "119495"), expr.ast && expr.parentheses)) {
        if (stryMutAct_9fa48("119496")) {
          {}
        } else {
          stryCov_9fa48("119496");
          return stryMutAct_9fa48("119497") ? {} : (stryCov_9fa48("119497"), {
            type: PG_EXPR_TYPE.SUBQUERY,
            query: this.convertSelect(expr.ast)
          });
        }
      }
      switch (expr.type) {
        case EXT_EXPR_TYPE.BINARY_EXPR:
          if (stryMutAct_9fa48("119498")) {} else {
            stryCov_9fa48("119498");
            return this.convertBinaryExpr(expr);
          }
        case EXT_EXPR_TYPE.UNARY_EXPR:
          if (stryMutAct_9fa48("119499")) {} else {
            stryCov_9fa48("119499");
            return this.convertUnaryExpr(expr);
          }
        case EXT_EXPR_TYPE.COLUMN_REF:
          if (stryMutAct_9fa48("119500")) {} else {
            stryCov_9fa48("119500");
            return this.convertColumnRef(expr);
          }
        case EXT_EXPR_TYPE.NUMBER:
          if (stryMutAct_9fa48("119501")) {} else {
            stryCov_9fa48("119501");
            return stryMutAct_9fa48("119502") ? {} : (stryCov_9fa48("119502"), {
              type: EXPR_TYPE.LITERAL,
              value: expr.value
            });
          }
        case EXT_EXPR_TYPE.SINGLE_QUOTE_STRING:
        case EXT_EXPR_TYPE.DOUBLE_QUOTE_STRING:
        case EXT_EXPR_TYPE.STRING:
          if (stryMutAct_9fa48("119503")) {} else {
            stryCov_9fa48("119503");
            return stryMutAct_9fa48("119504") ? {} : (stryCov_9fa48("119504"), {
              type: EXPR_TYPE.LITERAL,
              value: expr.value
            });
          }
        case EXT_EXPR_TYPE.BOOL:
          if (stryMutAct_9fa48("119505")) {} else {
            stryCov_9fa48("119505");
            return stryMutAct_9fa48("119506") ? {} : (stryCov_9fa48("119506"), {
              type: EXPR_TYPE.LITERAL,
              value: expr.value
            });
          }
        case EXT_EXPR_TYPE.NULL:
          if (stryMutAct_9fa48("119507")) {} else {
            stryCov_9fa48("119507");
            return stryMutAct_9fa48("119508") ? {} : (stryCov_9fa48("119508"), {
              type: EXPR_TYPE.LITERAL,
              value: null
            });
          }
        case EXT_EXPR_TYPE.ORIGIN:
          if (stryMutAct_9fa48("119509")) {} else {
            stryCov_9fa48("119509");
            if (stryMutAct_9fa48("119512") ? expr.value !== ORIGIN_PARAM : stryMutAct_9fa48("119511") ? false : stryMutAct_9fa48("119510") ? true : (stryCov_9fa48("119510", "119511", "119512"), expr.value === ORIGIN_PARAM)) {
              if (stryMutAct_9fa48("119513")) {
                {}
              } else {
                stryCov_9fa48("119513");
                return this.createParameterNode();
              }
            }
            return stryMutAct_9fa48("119514") ? {} : (stryCov_9fa48("119514"), {
              type: EXPR_TYPE.LITERAL,
              value: expr.value
            });
          }
        case EXT_EXPR_TYPE.AGGR_FUNC:
          if (stryMutAct_9fa48("119515")) {} else {
            stryCov_9fa48("119515");
            return this.convertAggregate(expr);
          }
        case EXT_EXPR_TYPE.STAR:
          if (stryMutAct_9fa48("119516")) {} else {
            stryCov_9fa48("119516");
            return stryMutAct_9fa48("119517") ? {} : (stryCov_9fa48("119517"), {
              type: EXPR_TYPE.STAR,
              value: STAR_VALUE
            });
          }
        case EXT_EXPR_TYPE.EXPR_LIST:
          if (stryMutAct_9fa48("119518")) {} else {
            stryCov_9fa48("119518");
            return expr.value.map(stryMutAct_9fa48("119519") ? () => undefined : (stryCov_9fa48("119519"), v => this.convertExpression(v)));
          }
        default:
          if (stryMutAct_9fa48("119520")) {} else {
            stryCov_9fa48("119520");
            if (stryMutAct_9fa48("119523") ? expr.value === undefined : stryMutAct_9fa48("119522") ? false : stryMutAct_9fa48("119521") ? true : (stryCov_9fa48("119521", "119522", "119523"), expr.value !== undefined)) {
              if (stryMutAct_9fa48("119524")) {
                {}
              } else {
                stryCov_9fa48("119524");
                return stryMutAct_9fa48("119525") ? {} : (stryCov_9fa48("119525"), {
                  type: EXPR_TYPE.LITERAL,
                  value: expr.value
                });
              }
            }
            throw new Error(stryMutAct_9fa48("119526") ? PARSER_ERROR_MSG.UNKNOWN_EXPRESSION_TYPE_PREFIX - expr.type : (stryCov_9fa48("119526"), PARSER_ERROR_MSG.UNKNOWN_EXPRESSION_TYPE_PREFIX + expr.type));
          }
      }
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
    if (stryMutAct_9fa48("119527")) {
      {}
    } else {
      stryCov_9fa48("119527");
      const convertExprFn = this.convertExpression.bind(this);
      switch (expr.type) {
        case PG_NODE_TYPE.VAR:
          if (stryMutAct_9fa48("119528")) {} else {
            stryCov_9fa48("119528");
            if (stryMutAct_9fa48("119531") ? expr.prefix !== PG_PARAM_PREFIX : stryMutAct_9fa48("119530") ? false : stryMutAct_9fa48("119529") ? true : (stryCov_9fa48("119529", "119530", "119531"), expr.prefix === PG_PARAM_PREFIX)) {
              if (stryMutAct_9fa48("119532")) {
                {}
              } else {
                stryCov_9fa48("119532");
                translatePositionalParam(stryMutAct_9fa48("119533") ? {} : (stryCov_9fa48("119533"), {
                  value: expr.name
                }), this.positionalParams);
                return this.createParameterNode();
              }
            }
            return null;
          }
        case PG_NODE_TYPE.CAST:
          if (stryMutAct_9fa48("119534")) {} else {
            stryCov_9fa48("119534");
            return translateTypeCast(stryMutAct_9fa48("119535") ? {} : (stryCov_9fa48("119535"), {
              expr: expr.expr,
              target: stryMutAct_9fa48("119536") ? {} : (stryCov_9fa48("119536"), {
                dataType: stryMutAct_9fa48("119537") ? expr.target[0].dataType : (stryCov_9fa48("119537"), expr.target[0]?.dataType)
              })
            }), convertExprFn);
          }
        case PG_NODE_TYPE.CASE:
          if (stryMutAct_9fa48("119538")) {} else {
            stryCov_9fa48("119538");
            return this.convertPgCase(expr);
          }
        case PG_NODE_TYPE.FUNCTION:
          if (stryMutAct_9fa48("119539")) {} else {
            stryCov_9fa48("119539");
            return this.convertPgFunction(expr);
          }
        case PG_NODE_TYPE.EXTRACT:
          if (stryMutAct_9fa48("119540")) {} else {
            stryCov_9fa48("119540");
            return this.convertPgExtract(expr);
          }
        case EXT_EXPR_TYPE.BOOL:
          if (stryMutAct_9fa48("119541")) {} else {
            stryCov_9fa48("119541");
            return translateBooleanLiteral(expr);
          }
        default:
          if (stryMutAct_9fa48("119542")) {} else {
            stryCov_9fa48("119542");
            return null;
          }
      }
    }
  }

  /**
   * Converts a PG CASE expression to an Internal_AST CASE node.
   * @param {Object} expr - PG case AST node.
   * @returns {Object} Internal_AST case node.
   */
  convertPgCase(expr) {
    if (stryMutAct_9fa48("119543")) {
      {}
    } else {
      stryCov_9fa48("119543");
      const conditions = stryMutAct_9fa48("119544") ? ["Stryker was here"] : (stryCov_9fa48("119544"), []);
      let elseExpr = null;
      for (const arg of expr.args) {
        if (stryMutAct_9fa48("119545")) {
          {}
        } else {
          stryCov_9fa48("119545");
          if (stryMutAct_9fa48("119548") ? arg.type !== PG_CASE_ARG_TYPE.WHEN : stryMutAct_9fa48("119547") ? false : stryMutAct_9fa48("119546") ? true : (stryCov_9fa48("119546", "119547", "119548"), arg.type === PG_CASE_ARG_TYPE.WHEN)) {
            if (stryMutAct_9fa48("119549")) {
              {}
            } else {
              stryCov_9fa48("119549");
              conditions.push(stryMutAct_9fa48("119550") ? {} : (stryCov_9fa48("119550"), {
                when: this.convertExpression(arg.cond),
                then: this.convertExpression(arg.result)
              }));
            }
          } else if (stryMutAct_9fa48("119553") ? arg.type !== PG_CASE_ARG_TYPE.ELSE : stryMutAct_9fa48("119552") ? false : stryMutAct_9fa48("119551") ? true : (stryCov_9fa48("119551", "119552", "119553"), arg.type === PG_CASE_ARG_TYPE.ELSE)) {
            if (stryMutAct_9fa48("119554")) {
              {}
            } else {
              stryCov_9fa48("119554");
              elseExpr = this.convertExpression(arg.result);
            }
          }
        }
      }
      return stryMutAct_9fa48("119555") ? {} : (stryCov_9fa48("119555"), {
        type: PG_EXPR_TYPE.CASE,
        operand: expr.expr ? this.convertExpression(expr.expr) : null,
        conditions,
        elseExpr
      });
    }
  }

  /**
   * Converts a PG function call or EXISTS expression.
   * EXISTS is parsed as a function node by node-sql-parser PG mode.
   * @param {Object} expr - PG function AST node.
   * @returns {Object} Internal_AST node.
   */
  convertPgFunction(expr) {
    if (stryMutAct_9fa48("119556")) {
      {}
    } else {
      stryCov_9fa48("119556");
      const nameParts = stryMutAct_9fa48("119559") ? expr.name?.name && [] : stryMutAct_9fa48("119558") ? false : stryMutAct_9fa48("119557") ? true : (stryCov_9fa48("119557", "119558", "119559"), (stryMutAct_9fa48("119560") ? expr.name.name : (stryCov_9fa48("119560"), expr.name?.name)) || (stryMutAct_9fa48("119561") ? ["Stryker was here"] : (stryCov_9fa48("119561"), [])));
      const funcName = (stryMutAct_9fa48("119565") ? nameParts.length <= NUM.ZERO : stryMutAct_9fa48("119564") ? nameParts.length >= NUM.ZERO : stryMutAct_9fa48("119563") ? false : stryMutAct_9fa48("119562") ? true : (stryCov_9fa48("119562", "119563", "119564", "119565"), nameParts.length > NUM.ZERO)) ? nameParts[NUM.ZERO].value : stryMutAct_9fa48("119566") ? "Stryker was here!" : (stryCov_9fa48("119566"), '');
      const argValues = stryMutAct_9fa48("119569") ? expr.args?.value && [] : stryMutAct_9fa48("119568") ? false : stryMutAct_9fa48("119567") ? true : (stryCov_9fa48("119567", "119568", "119569"), (stryMutAct_9fa48("119570") ? expr.args.value : (stryCov_9fa48("119570"), expr.args?.value)) || (stryMutAct_9fa48("119571") ? ["Stryker was here"] : (stryCov_9fa48("119571"), [])));

      // EXISTS is parsed as a function with a subquery argument
      if (stryMutAct_9fa48("119574") ? funcName.toUpperCase() !== PG_EXISTS_NAME : stryMutAct_9fa48("119573") ? false : stryMutAct_9fa48("119572") ? true : (stryCov_9fa48("119572", "119573", "119574"), (stryMutAct_9fa48("119575") ? funcName.toLowerCase() : (stryCov_9fa48("119575"), funcName.toUpperCase())) === PG_EXISTS_NAME)) {
        if (stryMutAct_9fa48("119576")) {
          {}
        } else {
          stryCov_9fa48("119576");
          const subqueryArg = argValues[NUM.ZERO];
          const innerAst = stryMutAct_9fa48("119579") ? subqueryArg?.ast && subqueryArg : stryMutAct_9fa48("119578") ? false : stryMutAct_9fa48("119577") ? true : (stryCov_9fa48("119577", "119578", "119579"), (stryMutAct_9fa48("119580") ? subqueryArg.ast : (stryCov_9fa48("119580"), subqueryArg?.ast)) || subqueryArg);
          return stryMutAct_9fa48("119581") ? {} : (stryCov_9fa48("119581"), {
            type: PG_EXPR_TYPE.EXISTS,
            query: this.convertSelect(innerAst)
          });
        }
      }
      const convertExprFn = this.convertExpression.bind(this);
      return translateFunctionCall(funcName, argValues, convertExprFn);
    }
  }

  /**
   * Converts a PG EXTRACT(field FROM expr) expression.
   * node-sql-parser PG mode produces {type: 'extract', args: {field, source}}.
   * @param {Object} expr - PG extract AST node.
   * @returns {Object} Internal_AST cast node wrapping strftime.
   */
  convertPgExtract(expr) {
    if (stryMutAct_9fa48("119582")) {
      {}
    } else {
      stryCov_9fa48("119582");
      const field = stryMutAct_9fa48("119585") ? expr.args?.field && '' : stryMutAct_9fa48("119584") ? false : stryMutAct_9fa48("119583") ? true : (stryCov_9fa48("119583", "119584", "119585"), (stryMutAct_9fa48("119586") ? expr.args.field : (stryCov_9fa48("119586"), expr.args?.field)) || (stryMutAct_9fa48("119587") ? "Stryker was here!" : (stryCov_9fa48("119587"), '')));
      const source = stryMutAct_9fa48("119588") ? expr.args.source : (stryCov_9fa48("119588"), expr.args?.source);
      const convertExprFn = this.convertExpression.bind(this);
      return translateFunctionCall(PG_NODE_TYPE.EXTRACT, stryMutAct_9fa48("119589") ? [] : (stryCov_9fa48("119589"), [stryMutAct_9fa48("119590") ? {} : (stryCov_9fa48("119590"), {
        value: field
      }), source]), convertExprFn);
    }
  }
  convertBinaryExpr(expr) {
    if (stryMutAct_9fa48("119591")) {
      {}
    } else {
      stryCov_9fa48("119591");
      const operator = stryMutAct_9fa48("119592") ? expr.operator.toLowerCase() : (stryCov_9fa48("119592"), expr.operator.toUpperCase());

      // PG-specific: ILIKE / NOT ILIKE → LIKE with LOWER wrapping
      if (stryMutAct_9fa48("119595") ? this.dialect === PARSER_DIALECT.POSTGRESQL || operator === SQL_OPERATOR.ILIKE || operator === SQL_OPERATOR.NOT_ILIKE : stryMutAct_9fa48("119594") ? false : stryMutAct_9fa48("119593") ? true : (stryCov_9fa48("119593", "119594", "119595"), (stryMutAct_9fa48("119597") ? this.dialect !== PARSER_DIALECT.POSTGRESQL : stryMutAct_9fa48("119596") ? true : (stryCov_9fa48("119596", "119597"), this.dialect === PARSER_DIALECT.POSTGRESQL)) && (stryMutAct_9fa48("119599") ? operator === SQL_OPERATOR.ILIKE && operator === SQL_OPERATOR.NOT_ILIKE : stryMutAct_9fa48("119598") ? true : (stryCov_9fa48("119598", "119599"), (stryMutAct_9fa48("119601") ? operator !== SQL_OPERATOR.ILIKE : stryMutAct_9fa48("119600") ? false : (stryCov_9fa48("119600", "119601"), operator === SQL_OPERATOR.ILIKE)) || (stryMutAct_9fa48("119603") ? operator !== SQL_OPERATOR.NOT_ILIKE : stryMutAct_9fa48("119602") ? false : (stryCov_9fa48("119602", "119603"), operator === SQL_OPERATOR.NOT_ILIKE)))))) {
        if (stryMutAct_9fa48("119604")) {
          {}
        } else {
          stryCov_9fa48("119604");
          return translateIlike(expr, this.convertExpression.bind(this));
        }
      }
      if (stryMutAct_9fa48("119607") ? operator === SQL_OPERATOR.IN && operator === SQL_OPERATOR.NOT_IN : stryMutAct_9fa48("119606") ? false : stryMutAct_9fa48("119605") ? true : (stryCov_9fa48("119605", "119606", "119607"), (stryMutAct_9fa48("119609") ? operator !== SQL_OPERATOR.IN : stryMutAct_9fa48("119608") ? false : (stryCov_9fa48("119608", "119609"), operator === SQL_OPERATOR.IN)) || (stryMutAct_9fa48("119611") ? operator !== SQL_OPERATOR.NOT_IN : stryMutAct_9fa48("119610") ? false : (stryCov_9fa48("119610", "119611"), operator === SQL_OPERATOR.NOT_IN)))) {
        if (stryMutAct_9fa48("119612")) {
          {}
        } else {
          stryCov_9fa48("119612");
          // IN subquery: right is expr_list with a single element having .ast
          if (stryMutAct_9fa48("119615") ? Array.isArray(expr.right.value) && expr.right.value.length === NUM.ONE || expr.right.value[NUM.ZERO]?.ast : stryMutAct_9fa48("119614") ? false : stryMutAct_9fa48("119613") ? true : (stryCov_9fa48("119613", "119614", "119615"), (stryMutAct_9fa48("119617") ? Array.isArray(expr.right.value) || expr.right.value.length === NUM.ONE : stryMutAct_9fa48("119616") ? true : (stryCov_9fa48("119616", "119617"), Array.isArray(expr.right.value) && (stryMutAct_9fa48("119619") ? expr.right.value.length !== NUM.ONE : stryMutAct_9fa48("119618") ? true : (stryCov_9fa48("119618", "119619"), expr.right.value.length === NUM.ONE)))) && (stryMutAct_9fa48("119620") ? expr.right.value[NUM.ZERO].ast : (stryCov_9fa48("119620"), expr.right.value[NUM.ZERO]?.ast)))) {
            if (stryMutAct_9fa48("119621")) {
              {}
            } else {
              stryCov_9fa48("119621");
              return stryMutAct_9fa48("119622") ? {} : (stryCov_9fa48("119622"), {
                type: EXPR_TYPE.IN,
                expression: this.convertExpression(expr.left),
                subquery: stryMutAct_9fa48("119623") ? {} : (stryCov_9fa48("119623"), {
                  type: PG_EXPR_TYPE.SUBQUERY,
                  query: this.convertSelect(expr.right.value[NUM.ZERO].ast)
                }),
                negated: stryMutAct_9fa48("119626") ? operator !== SQL_OPERATOR.NOT_IN : stryMutAct_9fa48("119625") ? false : stryMutAct_9fa48("119624") ? true : (stryCov_9fa48("119624", "119625", "119626"), operator === SQL_OPERATOR.NOT_IN)
              });
            }
          }
          const values = Array.isArray(expr.right.value) ? expr.right.value.map(stryMutAct_9fa48("119627") ? () => undefined : (stryCov_9fa48("119627"), v => this.convertValue(v))) : stryMutAct_9fa48("119628") ? [] : (stryCov_9fa48("119628"), [this.convertExpression(expr.right)]);
          return stryMutAct_9fa48("119629") ? {} : (stryCov_9fa48("119629"), {
            type: EXPR_TYPE.IN,
            expression: this.convertExpression(expr.left),
            values,
            negated: stryMutAct_9fa48("119632") ? operator !== SQL_OPERATOR.NOT_IN : stryMutAct_9fa48("119631") ? false : stryMutAct_9fa48("119630") ? true : (stryCov_9fa48("119630", "119631", "119632"), operator === SQL_OPERATOR.NOT_IN)
          });
        }
      }
      if (stryMutAct_9fa48("119635") ? operator !== SQL_OPERATOR.BETWEEN : stryMutAct_9fa48("119634") ? false : stryMutAct_9fa48("119633") ? true : (stryCov_9fa48("119633", "119634", "119635"), operator === SQL_OPERATOR.BETWEEN)) {
        if (stryMutAct_9fa48("119636")) {
          {}
        } else {
          stryCov_9fa48("119636");
          return stryMutAct_9fa48("119637") ? {} : (stryCov_9fa48("119637"), {
            type: EXPR_TYPE.BETWEEN,
            expression: this.convertExpression(expr.left),
            low: this.convertExpression(expr.right.value[NUM.ZERO]),
            high: this.convertExpression(expr.right.value[NUM.ONE])
          });
        }
      }
      if (stryMutAct_9fa48("119640") ? operator === SQL_OPERATOR.LIKE && operator === SQL_OPERATOR.NOT_LIKE : stryMutAct_9fa48("119639") ? false : stryMutAct_9fa48("119638") ? true : (stryCov_9fa48("119638", "119639", "119640"), (stryMutAct_9fa48("119642") ? operator !== SQL_OPERATOR.LIKE : stryMutAct_9fa48("119641") ? false : (stryCov_9fa48("119641", "119642"), operator === SQL_OPERATOR.LIKE)) || (stryMutAct_9fa48("119644") ? operator !== SQL_OPERATOR.NOT_LIKE : stryMutAct_9fa48("119643") ? false : (stryCov_9fa48("119643", "119644"), operator === SQL_OPERATOR.NOT_LIKE)))) {
        if (stryMutAct_9fa48("119645")) {
          {}
        } else {
          stryCov_9fa48("119645");
          return stryMutAct_9fa48("119646") ? {} : (stryCov_9fa48("119646"), {
            type: EXPR_TYPE.LIKE,
            expression: this.convertExpression(expr.left),
            pattern: this.convertExpression(expr.right),
            negated: stryMutAct_9fa48("119649") ? operator !== SQL_OPERATOR.NOT_LIKE : stryMutAct_9fa48("119648") ? false : stryMutAct_9fa48("119647") ? true : (stryCov_9fa48("119647", "119648", "119649"), operator === SQL_OPERATOR.NOT_LIKE)
          });
        }
      }
      if (stryMutAct_9fa48("119652") ? operator === SQL_OPERATOR.IS && operator === SQL_OPERATOR.IS_NOT : stryMutAct_9fa48("119651") ? false : stryMutAct_9fa48("119650") ? true : (stryCov_9fa48("119650", "119651", "119652"), (stryMutAct_9fa48("119654") ? operator !== SQL_OPERATOR.IS : stryMutAct_9fa48("119653") ? false : (stryCov_9fa48("119653", "119654"), operator === SQL_OPERATOR.IS)) || (stryMutAct_9fa48("119656") ? operator !== SQL_OPERATOR.IS_NOT : stryMutAct_9fa48("119655") ? false : (stryCov_9fa48("119655", "119656"), operator === SQL_OPERATOR.IS_NOT)))) {
        if (stryMutAct_9fa48("119657")) {
          {}
        } else {
          stryCov_9fa48("119657");
          return stryMutAct_9fa48("119658") ? {} : (stryCov_9fa48("119658"), {
            type: EXPR_TYPE.BINARY,
            operator: (stryMutAct_9fa48("119661") ? operator !== SQL_OPERATOR.IS : stryMutAct_9fa48("119660") ? false : stryMutAct_9fa48("119659") ? true : (stryCov_9fa48("119659", "119660", "119661"), operator === SQL_OPERATOR.IS)) ? SQL_OPERATOR.IS_NULL : SQL_OPERATOR.IS_NOT_NULL,
            left: this.convertExpression(expr.left),
            right: stryMutAct_9fa48("119662") ? {} : (stryCov_9fa48("119662"), {
              type: EXPR_TYPE.LITERAL,
              value: null
            })
          });
        }
      }
      return stryMutAct_9fa48("119663") ? {} : (stryCov_9fa48("119663"), {
        type: EXPR_TYPE.BINARY,
        operator: this.normalizeOperator(operator),
        left: this.convertExpression(expr.left),
        right: this.convertExpression(expr.right)
      });
    }
  }
  normalizeOperator(op) {
    if (stryMutAct_9fa48("119664")) {
      {}
    } else {
      stryCov_9fa48("119664");
      const upper = stryMutAct_9fa48("119665") ? op.toLowerCase() : (stryCov_9fa48("119665"), op.toUpperCase());
      if (stryMutAct_9fa48("119668") ? upper !== '!=' : stryMutAct_9fa48("119667") ? false : stryMutAct_9fa48("119666") ? true : (stryCov_9fa48("119666", "119667", "119668"), upper === (stryMutAct_9fa48("119669") ? "" : (stryCov_9fa48("119669"), '!=')))) return stryMutAct_9fa48("119670") ? "" : (stryCov_9fa48("119670"), '<>');
      return upper;
    }
  }
  convertUnaryExpr(expr) {
    if (stryMutAct_9fa48("119671")) {
      {}
    } else {
      stryCov_9fa48("119671");
      return stryMutAct_9fa48("119672") ? {} : (stryCov_9fa48("119672"), {
        type: EXPR_TYPE.UNARY,
        operator: stryMutAct_9fa48("119673") ? expr.operator.toLowerCase() : (stryCov_9fa48("119673"), expr.operator.toUpperCase()),
        operand: this.convertExpression(expr.expr)
      });
    }
  }
  convertColumnRef(expr) {
    if (stryMutAct_9fa48("119674")) {
      {}
    } else {
      stryCov_9fa48("119674");
      // PG mode wraps column name in {expr: {type: 'default', value: name}}
      const column = (stryMutAct_9fa48("119677") ? typeof expr.column === 'object' || expr.column?.expr : stryMutAct_9fa48("119676") ? false : stryMutAct_9fa48("119675") ? true : (stryCov_9fa48("119675", "119676", "119677"), (stryMutAct_9fa48("119679") ? typeof expr.column !== 'object' : stryMutAct_9fa48("119678") ? true : (stryCov_9fa48("119678", "119679"), typeof expr.column === (stryMutAct_9fa48("119680") ? "" : (stryCov_9fa48("119680"), 'object')))) && (stryMutAct_9fa48("119681") ? expr.column.expr : (stryCov_9fa48("119681"), expr.column?.expr)))) ? expr.column.expr.value : expr.column;
      return stryMutAct_9fa48("119682") ? {} : (stryCov_9fa48("119682"), {
        type: EXPR_TYPE.COLUMN_REF,
        table: stryMutAct_9fa48("119685") ? expr.table && null : stryMutAct_9fa48("119684") ? false : stryMutAct_9fa48("119683") ? true : (stryCov_9fa48("119683", "119684", "119685"), expr.table || null),
        column
      });
    }
  }
  convertAggregate(expr) {
    if (stryMutAct_9fa48("119686")) {
      {}
    } else {
      stryCov_9fa48("119686");
      let argument;
      if (stryMutAct_9fa48("119689") ? expr.args?.expr?.type !== EXT_EXPR_TYPE.STAR : stryMutAct_9fa48("119688") ? false : stryMutAct_9fa48("119687") ? true : (stryCov_9fa48("119687", "119688", "119689"), (stryMutAct_9fa48("119691") ? expr.args.expr?.type : stryMutAct_9fa48("119690") ? expr.args?.expr.type : (stryCov_9fa48("119690", "119691"), expr.args?.expr?.type)) === EXT_EXPR_TYPE.STAR)) {
        if (stryMutAct_9fa48("119692")) {
          {}
        } else {
          stryCov_9fa48("119692");
          argument = stryMutAct_9fa48("119693") ? {} : (stryCov_9fa48("119693"), {
            type: EXPR_TYPE.STAR,
            value: STAR_VALUE
          });
        }
      } else if (stryMutAct_9fa48("119696") ? expr.args.expr : stryMutAct_9fa48("119695") ? false : stryMutAct_9fa48("119694") ? true : (stryCov_9fa48("119694", "119695", "119696"), expr.args?.expr)) {
        if (stryMutAct_9fa48("119697")) {
          {}
        } else {
          stryCov_9fa48("119697");
          argument = this.convertExpression(expr.args.expr);
        }
      } else {
        if (stryMutAct_9fa48("119698")) {
          {}
        } else {
          stryCov_9fa48("119698");
          argument = stryMutAct_9fa48("119699") ? {} : (stryCov_9fa48("119699"), {
            type: EXPR_TYPE.STAR,
            value: STAR_VALUE
          });
        }
      }
      return stryMutAct_9fa48("119700") ? {} : (stryCov_9fa48("119700"), {
        type: EXPR_TYPE.AGGREGATE,
        function: stryMutAct_9fa48("119701") ? expr.name.toLowerCase() : (stryCov_9fa48("119701"), expr.name.toUpperCase()),
        argument,
        distinct: stryMutAct_9fa48("119702") ? !expr.args?.distinct : (stryCov_9fa48("119702"), !(stryMutAct_9fa48("119703") ? expr.args?.distinct : (stryCov_9fa48("119703"), !(stryMutAct_9fa48("119704") ? expr.args.distinct : (stryCov_9fa48("119704"), expr.args?.distinct)))))
      });
    }
  }
  convertValue(val) {
    if (stryMutAct_9fa48("119705")) {
      {}
    } else {
      stryCov_9fa48("119705");
      if (stryMutAct_9fa48("119708") ? false : stryMutAct_9fa48("119707") ? true : stryMutAct_9fa48("119706") ? val : (stryCov_9fa48("119706", "119707", "119708"), !val)) {
        if (stryMutAct_9fa48("119709")) {
          {}
        } else {
          stryCov_9fa48("119709");
          return stryMutAct_9fa48("119710") ? {} : (stryCov_9fa48("119710"), {
            type: EXPR_TYPE.LITERAL,
            value: null
          });
        }
      }

      // PG-specific value types
      if (stryMutAct_9fa48("119713") ? this.dialect !== PARSER_DIALECT.POSTGRESQL : stryMutAct_9fa48("119712") ? false : stryMutAct_9fa48("119711") ? true : (stryCov_9fa48("119711", "119712", "119713"), this.dialect === PARSER_DIALECT.POSTGRESQL)) {
        if (stryMutAct_9fa48("119714")) {
          {}
        } else {
          stryCov_9fa48("119714");
          if (stryMutAct_9fa48("119717") ? val.type === PG_NODE_TYPE.VAR || val.prefix === PG_PARAM_PREFIX : stryMutAct_9fa48("119716") ? false : stryMutAct_9fa48("119715") ? true : (stryCov_9fa48("119715", "119716", "119717"), (stryMutAct_9fa48("119719") ? val.type !== PG_NODE_TYPE.VAR : stryMutAct_9fa48("119718") ? true : (stryCov_9fa48("119718", "119719"), val.type === PG_NODE_TYPE.VAR)) && (stryMutAct_9fa48("119721") ? val.prefix !== PG_PARAM_PREFIX : stryMutAct_9fa48("119720") ? true : (stryCov_9fa48("119720", "119721"), val.prefix === PG_PARAM_PREFIX)))) {
            if (stryMutAct_9fa48("119722")) {
              {}
            } else {
              stryCov_9fa48("119722");
              translatePositionalParam(stryMutAct_9fa48("119723") ? {} : (stryCov_9fa48("119723"), {
                value: val.name
              }), this.positionalParams);
              return this.createParameterNode();
            }
          }
          if (stryMutAct_9fa48("119726") ? val.type !== EXT_EXPR_TYPE.BOOL : stryMutAct_9fa48("119725") ? false : stryMutAct_9fa48("119724") ? true : (stryCov_9fa48("119724", "119725", "119726"), val.type === EXT_EXPR_TYPE.BOOL)) {
            if (stryMutAct_9fa48("119727")) {
              {}
            } else {
              stryCov_9fa48("119727");
              return translateBooleanLiteral(val);
            }
          }
        }
      }
      switch (val.type) {
        case EXT_EXPR_TYPE.NUMBER:
          if (stryMutAct_9fa48("119728")) {} else {
            stryCov_9fa48("119728");
            return stryMutAct_9fa48("119729") ? {} : (stryCov_9fa48("119729"), {
              type: EXPR_TYPE.LITERAL,
              value: val.value
            });
          }
        case EXT_EXPR_TYPE.SINGLE_QUOTE_STRING:
        case EXT_EXPR_TYPE.DOUBLE_QUOTE_STRING:
        case EXT_EXPR_TYPE.STRING:
          if (stryMutAct_9fa48("119730")) {} else {
            stryCov_9fa48("119730");
            return stryMutAct_9fa48("119731") ? {} : (stryCov_9fa48("119731"), {
              type: EXPR_TYPE.LITERAL,
              value: val.value
            });
          }
        case EXT_EXPR_TYPE.BOOL:
          if (stryMutAct_9fa48("119732")) {} else {
            stryCov_9fa48("119732");
            return stryMutAct_9fa48("119733") ? {} : (stryCov_9fa48("119733"), {
              type: EXPR_TYPE.LITERAL,
              value: val.value
            });
          }
        case EXT_EXPR_TYPE.NULL:
          if (stryMutAct_9fa48("119734")) {} else {
            stryCov_9fa48("119734");
            return stryMutAct_9fa48("119735") ? {} : (stryCov_9fa48("119735"), {
              type: EXPR_TYPE.LITERAL,
              value: null
            });
          }
        case EXT_EXPR_TYPE.ORIGIN:
          if (stryMutAct_9fa48("119736")) {} else {
            stryCov_9fa48("119736");
            if (stryMutAct_9fa48("119739") ? val.value !== ORIGIN_PARAM : stryMutAct_9fa48("119738") ? false : stryMutAct_9fa48("119737") ? true : (stryCov_9fa48("119737", "119738", "119739"), val.value === ORIGIN_PARAM)) {
              if (stryMutAct_9fa48("119740")) {
                {}
              } else {
                stryCov_9fa48("119740");
                return this.createParameterNode();
              }
            }
            return stryMutAct_9fa48("119741") ? {} : (stryCov_9fa48("119741"), {
              type: EXPR_TYPE.LITERAL,
              value: val.value
            });
          }
        default:
          if (stryMutAct_9fa48("119742")) {} else {
            stryCov_9fa48("119742");
            if (stryMutAct_9fa48("119745") ? val.value === undefined : stryMutAct_9fa48("119744") ? false : stryMutAct_9fa48("119743") ? true : (stryCov_9fa48("119743", "119744", "119745"), val.value !== undefined)) {
              if (stryMutAct_9fa48("119746")) {
                {}
              } else {
                stryCov_9fa48("119746");
                return stryMutAct_9fa48("119747") ? {} : (stryCov_9fa48("119747"), {
                  type: EXPR_TYPE.LITERAL,
                  value: val.value
                });
              }
            }
            return stryMutAct_9fa48("119748") ? {} : (stryCov_9fa48("119748"), {
              type: EXPR_TYPE.LITERAL,
              value: null
            });
          }
      }
    }
  }
}
export { SQLParser, AST_TYPE, EXPR_TYPE };