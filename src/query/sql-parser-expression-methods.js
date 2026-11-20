import {EXPR_TYPE, SQL_STORAGE_CLASS, isBuiltinCollation} from './parser-constants.js';
import {PARSER_DIALECT, PG_EXPR_TYPE} from './pg/pg-compat-constants.js';
import {QUERY_ERROR_CODE} from './query-constants.js';
import {
  translateBooleanLiteral,
  translatePositionalParam,
  translateTypeCast,
  translateIlike,
} from './pg/pg-translate.js';
import {translateFunctionCall} from './pg/pg-function-registry.js';
import {
  AGGREGATE_ORDER_BY_SENTINEL,
  COLLATED_PARAMETER_NAME,
  DISTINCT_AGGREGATE_BY_SENTINEL,
  LIMIT_PARAMETER_NAME,
  POSTFIX_NULL_OPERATORS,
  RESPELLED_BINARY_OPERATOR_BY_SENTINEL,
  WINDOW_NO_PARTITION_NAME,
} from './sql-parser-source-text.js';
import {sqliteDeclaredTypeAffinity} from './sql-table-definition.js';

const objectHasOwn = Object.hasOwn;

const LOCAL_STR_BANG_EQUALS = '!=';
const LOCAL_STR_LT_GT = '<>';

const PARSER_ERROR_MSG = Object.freeze({
  UNKNOWN_EXPRESSION_TYPE_PREFIX: 'Unknown expression type: ',
  BIG_INTEGER_LITERAL:
    'Integer literals beyond the safe JavaScript integer range are not supported',
  UNREAD_SYNTAX_PREFIX: 'Unsupported SQL syntax: the front end cannot carry ',
  UNREAD_SYNTAX_SUFFIX: ' of a ',
  QUALIFIED_FUNCTION: 'Schema-qualified function names are not supported',
  CAST_TARGET: 'CAST supports exactly one target type',
  KEYWORD_ORIGIN_PREFIX: 'Unsupported SQL keyword in an expression: ',
  UNSUPPORTED_COLLATION_PREFIX: 'Unsupported collation sequence: ',
});

const PG_NODE_TYPE = Object.freeze({
  VAR: 'var',
  CAST: 'cast',
  CASE: 'case',
  FUNCTION: 'function',
  EXTRACT: 'extract',
});

const PG_PARAM_PREFIX = '$';

const PG_CASE_ARG_TYPE = Object.freeze({
  WHEN: 'when',
  ELSE: 'else',
});

const PG_EXISTS_NAME = 'EXISTS';

const SQL_OPERATOR = Object.freeze({
  IN: 'IN',
  NOT_IN: 'NOT IN',
  BETWEEN: 'BETWEEN',
  NOT_BETWEEN: 'NOT BETWEEN',
  LIKE: 'LIKE',
  NOT_LIKE: 'NOT LIKE',
  IS: 'IS',
  IS_NOT: 'IS NOT',
  IS_NULL: 'IS NULL',
  IS_NOT_NULL: 'IS NOT NULL',
  ILIKE: 'ILIKE',
  NOT_ILIKE: 'NOT ILIKE',
  NOT: 'NOT',
});

const EXT_EXPR_TYPE = Object.freeze({
  BINARY_EXPR: 'binary_expr',
  UNARY_EXPR: 'unary_expr',
  COLUMN_REF: 'column_ref',
  NUMBER: 'number',
  BIGINT: 'bigint',
  HEX_STRING: 'hex_string',
  SINGLE_QUOTE_STRING: 'single_quote_string',
  DOUBLE_QUOTE_STRING: 'double_quote_string',
  STRING: 'string',
  BOOL: 'bool',
  NULL: 'null',
  ORIGIN: 'origin',
  PARAM: 'param',
  AGGR_FUNC: 'aggr_func',
  STAR: 'star',
  EXPR_LIST: 'expr_list',
  CAST: 'cast',
  CASE: 'case',
  FUNCTION: 'function',
  SUBQUERY: 'subquery',
});

// node-sql-parser keys that carry no SQL semantics, on any node.
const INERT_KEYS = Object.freeze(['type', 'parentheses', 'loc']);

// The keys each node-sql-parser node type may carry with a value: every one
// is read by this converter. Any other key with a value is syntax the front
// end would drop (an OVER clause, an aggregate ORDER BY, a FILTER ...), so the
// statement is refused instead (design §2.5: refused, never dropped).
const READ_KEYS = Object.freeze(Object.assign(Object.create(null), {
  [EXT_EXPR_TYPE.BINARY_EXPR]: ['operator', 'left', 'right'],
  [EXT_EXPR_TYPE.UNARY_EXPR]: ['operator', 'expr'],
  [EXT_EXPR_TYPE.COLUMN_REF]: ['table', 'column', 'collate'],
  [EXT_EXPR_TYPE.NUMBER]: ['value', 'suffix'],
  [EXT_EXPR_TYPE.BIGINT]: ['value', 'suffix'],
  [EXT_EXPR_TYPE.HEX_STRING]: ['prefix', 'value', 'suffix'],
  [EXT_EXPR_TYPE.SINGLE_QUOTE_STRING]: ['value', 'suffix'],
  [EXT_EXPR_TYPE.DOUBLE_QUOTE_STRING]: ['value', 'suffix'],
  [EXT_EXPR_TYPE.STRING]: ['value', 'suffix'],
  [EXT_EXPR_TYPE.BOOL]: ['value', 'suffix'],
  [EXT_EXPR_TYPE.NULL]: ['value', 'suffix'],
  [EXT_EXPR_TYPE.ORIGIN]: ['value'],
  [EXT_EXPR_TYPE.PARAM]: ['value'],
  [EXT_EXPR_TYPE.AGGR_FUNC]: ['name', 'args', 'over'],
  [EXT_EXPR_TYPE.STAR]: ['value'],
  [EXT_EXPR_TYPE.EXPR_LIST]: ['value'],
  [EXT_EXPR_TYPE.CAST]: ['keyword', 'expr', 'symbol', 'target'],
  [EXT_EXPR_TYPE.CASE]: ['expr', 'args'],
  [EXT_EXPR_TYPE.FUNCTION]: ['name', 'args', 'suffix', 'over'],
  [EXT_EXPR_TYPE.SUBQUERY]: ['ast', 'tableList', 'columnList'],
  [PG_NODE_TYPE.VAR]: ['name', 'prefix', 'members'],
  [PG_NODE_TYPE.EXTRACT]: ['args'],
}));
const READ_AGGREGATE_ARG_KEYS = Object.freeze(['expr', 'distinct', 'orderby']);
const READ_FUNCTION_ARG_KEYS = Object.freeze(['type', 'value']);
const READ_OVER_KEYS = Object.freeze(['partitionby', 'orderby']);
const OVER_KEY = 'over';
const PARTITION_BY_KEY = 'partitionby';
const EQUALS_OPERATOR = '=';
const READ_SUFFIX_KEYS = Object.freeze(['collate']);
const READ_CAST_TARGET_KEYS = Object.freeze(['dataType', 'length', 'scale', 'parentheses',
  'suffix']);
const UNREAD_SYNTAX_SCOPE = Object.freeze({
  SUFFIX: 'suffix',
  CAST_TARGET: 'CAST target',
  FUNCTION_ARGUMENTS: 'function arguments',
  AGGREGATE_ARGUMENTS: 'aggregate arguments',
  OVER: 'OVER clause',
});
const ESCAPE_KEY = 'escape';
const EXPRESSION_METHOD_BY_TYPE = Object.freeze(Object.assign(Object.create(null), {
  [EXT_EXPR_TYPE.BINARY_EXPR]: 'convertBinaryExpr',
  [EXT_EXPR_TYPE.UNARY_EXPR]: 'convertUnaryExpr',
  [EXT_EXPR_TYPE.COLUMN_REF]: 'convertColumnRef',
  [EXT_EXPR_TYPE.PARAM]: 'convertNamedParameter',
  [EXT_EXPR_TYPE.AGGR_FUNC]: 'convertAggregate',
  [EXT_EXPR_TYPE.CAST]: 'convertCast',
  [EXT_EXPR_TYPE.CASE]: 'convertCase',
  [EXT_EXPR_TYPE.FUNCTION]: 'convertFunction',
}));

const STAR_VALUE = '*';
const ORIGIN_PARAM = '?';
const SINGLE_QUOTE_CHAR = '\'';
const KEYWORD_FUNCTION_NAME_TYPE = 'origin';
const CAST_TYPE_ARGUMENT_SEPARATOR = ', ';

function unsupportedFeature(message) {
  const error = new Error(message);
  error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  return error;
}

// Whether a node-sql-parser field carries syntax: a placeholder object whose
// own fields are all empty (PostgreSQL mode's `into: {position: null}`)
// carries none.
function carriesValue(value) {
  if (value === null || value === undefined || value === false || value === '') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return typeof value !== 'object' || Object.values(value).some(carriesValue);
}

/**
 * Refuse a node-sql-parser node that carries a key this converter does not
 * read.
 * @param {Object} node - External node.
 * @param {string[]} readKeys - Keys the converter reads for its type.
 * @param {string} [label] - Node label for the message.
 */
function refuseUnreadKeys(node, readKeys, label = node?.type) {
  for (const [key, value] of Object.entries(node)) {
    if (!INERT_KEYS.includes(key) && !readKeys.includes(key) && carriesValue(value)) {
      throw unsupportedFeature(PARSER_ERROR_MSG.UNREAD_SYNTAX_PREFIX + key +
        PARSER_ERROR_MSG.UNREAD_SYNTAX_SUFFIX + String(label));
    }
  }
}

function refuseUnreadExpressionKeys(expr) {
  const isSubquery = Boolean(expr.ast);
  const key = isSubquery ? EXT_EXPR_TYPE.SUBQUERY : expr.type;
  const readKeys = objectHasOwn(READ_KEYS, key) ? READ_KEYS[key] : null;
  if (!readKeys) {
    throw unsupportedFeature(PARSER_ERROR_MSG.UNKNOWN_EXPRESSION_TYPE_PREFIX + expr.type);
  }
  refuseUnreadKeys(expr, readKeys, key);
  if (carriesValue(expr.suffix)) {
    refuseUnreadKeys(expr.suffix, READ_SUFFIX_KEYS, UNREAD_SYNTAX_SCOPE.SUFFIX);
  }
}

// The collation an external node carries: a column reference's `collate`, or
// a literal's / call's `suffix.collate`. Only SQLite's built-in collating
// sequences (BINARY, NOCASE, RTRIM) are admitted.
function externalCollation(expr) {
  const clause = expr.type === EXT_EXPR_TYPE.COLUMN_REF ?
    expr.collate :
    expr.suffix?.collate;
  if (!clause) return null;
  const raw = clause.collate.name;
  const name = typeof raw === 'string' ? raw : raw.value;
  const upper = String(name).toUpperCase();
  if (!isBuiltinCollation(upper)) {
    throw unsupportedFeature(PARSER_ERROR_MSG.UNSUPPORTED_COLLATION_PREFIX + String(name));
  }
  return upper;
}

const INT64_BITS = 64;
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const INTEGER_LEXEME = /^-?[0-9]+$/u;
const HEX_LEXEME = /^[0-9a-fA-F]*$/u;
const MINUS_OPERATOR = '-';

function convertBigIntOrExponentText(rawText) {
  const text = String(rawText);
  if (!INTEGER_LEXEME.test(text)) {
    return {
      type: EXPR_TYPE.LITERAL,
      value: text,
      sqlType: SQL_STORAGE_CLASS.REAL,
    };
  }
  const bigVal = BigInt(text);
  if (BigInt.asIntN(INT64_BITS, bigVal) !== bigVal) {
    throw unsupportedFeature(PARSER_ERROR_MSG.BIG_INTEGER_LITERAL);
  }
  const value = bigVal >= MIN_SAFE_BIGINT && bigVal <= MAX_SAFE_BIGINT ?
    Number(bigVal) :
    bigVal;
  return {
    type: EXPR_TYPE.LITERAL,
    value,
    sqlType: SQL_STORAGE_CLASS.INTEGER,
  };
}

const HEX_BUFFER_ENCODING = 'hex';

function convertHexBlobLiteral(rawHex) {
  const hex = String(rawHex ?? '');
  if (hex.length % 2 !== 0 || !HEX_LEXEME.test(hex)) {
    const error = new Error(`Invalid hex literal: X'${hex}'`);
    error.code = QUERY_ERROR_CODE.SYNTAX_ERROR;
    throw error;
  }
  return {
    type: EXPR_TYPE.LITERAL,
    value: Buffer.from(hex, HEX_BUFFER_ENCODING),
    sqlType: SQL_STORAGE_CLASS.BLOB,
  };
}

/**
 * The literal node of a node-sql-parser literal, carrying its SQLite storage
 * class (`sqlType`). The JS-visible `value` is what it has always been: an
 * integer as a number (or BigInt beyond 2^53), a decimal/exponent as its
 * lexeme text, a string unescaped, a hex BLOB as a Buffer, TRUE/FALSE as the
 * boolean in SQLite mode.
 * @param {Object} expr - External literal node.
 * @return {Object} LITERAL node.
 */
function convertExternalLiteral(expr) {
  switch (expr.type) {
  case EXT_EXPR_TYPE.NUMBER:
    if (typeof expr.value === 'string') {
      return {type: EXPR_TYPE.LITERAL, value: expr.value, sqlType: SQL_STORAGE_CLASS.REAL};
    }
    if (!Number.isSafeInteger(expr.value)) {
      throw unsupportedFeature(PARSER_ERROR_MSG.BIG_INTEGER_LITERAL);
    }
    return {type: EXPR_TYPE.LITERAL, value: expr.value, sqlType: SQL_STORAGE_CLASS.INTEGER};
  case EXT_EXPR_TYPE.BIGINT:
    return convertBigIntOrExponentText(expr.value);
  case EXT_EXPR_TYPE.HEX_STRING:
    return convertHexBlobLiteral(expr.value);
  case EXT_EXPR_TYPE.SINGLE_QUOTE_STRING:
    return {type: EXPR_TYPE.LITERAL, value: String(expr.value).replace(/''/g, SINGLE_QUOTE_CHAR),
      sqlType: SQL_STORAGE_CLASS.TEXT};
  case EXT_EXPR_TYPE.STRING:
    return {type: EXPR_TYPE.LITERAL, value: expr.value, sqlType: SQL_STORAGE_CLASS.TEXT};
  case EXT_EXPR_TYPE.BOOL:
    return {type: EXPR_TYPE.LITERAL, value: expr.value, sqlType: SQL_STORAGE_CLASS.INTEGER};
  case EXT_EXPR_TYPE.NULL:
    return {type: EXPR_TYPE.LITERAL, value: null, sqlType: SQL_STORAGE_CLASS.NULL};
  default:
    throw unsupportedFeature(PARSER_ERROR_MSG.UNKNOWN_EXPRESSION_TYPE_PREFIX + expr.type);
  }
}

const LITERAL_TYPES = new Set([
  EXT_EXPR_TYPE.NUMBER,
  EXT_EXPR_TYPE.BIGINT,
  EXT_EXPR_TYPE.HEX_STRING,
  EXT_EXPR_TYPE.SINGLE_QUOTE_STRING,
  EXT_EXPR_TYPE.STRING,
  EXT_EXPR_TYPE.BOOL,
  EXT_EXPR_TYPE.NULL,
]);

function convertDialectLiteral(dialect, expr) {
  return dialect === PARSER_DIALECT.POSTGRESQL && expr.type === EXT_EXPR_TYPE.BOOL ?
    translateBooleanLiteral(expr) :
    convertExternalLiteral(expr);
}

function convertOriginNode(parser, expr) {
  if (expr.value === ORIGIN_PARAM) {
    return parser.createParameterNode();
  }
  throw unsupportedFeature(PARSER_ERROR_MSG.KEYWORD_ORIGIN_PREFIX + String(expr.value));
}

// The declared type text of a CAST target as written (VARCHAR(10),
// DECIMAL(10, 2)): SQLite derives the conversion from it.
function castTargetTypeText(target) {
  refuseUnreadKeys(target, READ_CAST_TARGET_KEYS, UNREAD_SYNTAX_SCOPE.CAST_TARGET);
  if (target.length === undefined || target.length === null) return String(target.dataType);
  const scale = target.scale === undefined || target.scale === null ? '' :
    CAST_TYPE_ARGUMENT_SEPARATOR + target.scale;
  return `${target.dataType}(${target.length}${scale})`;
}

function extractFunctionCallParts(expr, dialect) {
  const nameParts = expr.name ? expr.name.name : [];
  if (nameParts.length !== 1 && dialect !== PARSER_DIALECT.POSTGRESQL) {
    throw unsupportedFeature(PARSER_ERROR_MSG.QUALIFIED_FUNCTION);
  }
  if (expr.args) {
    refuseUnreadKeys(expr.args, READ_FUNCTION_ARG_KEYS, UNREAD_SYNTAX_SCOPE.FUNCTION_ARGUMENTS);
  }
  const firstPart = nameParts[0];
  return {
    firstPart,
    funcName: firstPart ? String(firstPart.value) : '',
    argValues: expr.args ? expr.args.value : [],
  };
}

function convertExistsSubquery(parser, subqueryArg) {
  const innerAst = subqueryArg?.ast ? subqueryArg.ast : subqueryArg;
  return {
    type: PG_EXPR_TYPE.EXISTS,
    query: parser.convertSelect(innerAst),
  };
}

function readOverSentinelName(over) {
  const parts = over?.partitionby;
  if (!Array.isArray(parts) || parts.length !== 1) return null;
  const item = parts[0];
  if (!item || item.as || item.expr?.type !== EXT_EXPR_TYPE.COLUMN_REF) return null;
  if (item.expr.table || item.expr.collate) return null;
  return item.expr.column || null;
}

function convertWindowOrOrderOver(parser, over) {
  if (!carriesValue(over)) return {over: null, orderBy: null};
  refuseUnreadKeys(over, READ_OVER_KEYS, UNREAD_SYNTAX_SCOPE.OVER);
  const sentinel = readOverSentinelName(over);
  if (!Array.isArray(over.orderby) || over.orderby.length === 0) {
    throw unsupportedFeature(
      PARSER_ERROR_MSG.UNREAD_SYNTAX_PREFIX + OVER_KEY +
      PARSER_ERROR_MSG.UNREAD_SYNTAX_SUFFIX + UNREAD_SYNTAX_SCOPE.OVER,
    );
  }
  const terms = parser.convertOrderBy(over.orderby);
  if (sentinel === WINDOW_NO_PARTITION_NAME) return {over: {orderBy: terms}, orderBy: null};
  if (sentinel === AGGREGATE_ORDER_BY_SENTINEL) return {over: null, orderBy: terms};
  throw unsupportedFeature(
    PARSER_ERROR_MSG.UNREAD_SYNTAX_PREFIX + PARTITION_BY_KEY +
    PARSER_ERROR_MSG.UNREAD_SYNTAX_SUFFIX + UNREAD_SYNTAX_SCOPE.OVER,
  );
}

const sqlParserExpressionMethods = {
  /**
   * Convert one node-sql-parser expression: refused when it carries syntax
   * this AST cannot hold; wrapped in a `collate` node when it carries an
   * explicit COLLATE.
   * @param {Object} expr - External expression node.
   * @return {Object|Array|null} Internal expression node.
   */
  convertExpression(expr) {
    if (!expr) {
      return null;
    }
    if (Array.isArray(expr)) {
      return expr.map((entry) => this.convertExpression(entry));
    }
    refuseUnreadExpressionKeys(expr);
    const node = this.convertExpressionNode(expr);
    const collation = externalCollation(expr);
    return collation === null ? node :
      {type: EXPR_TYPE.COLLATE, expression: node, collation};
  },

  convertExpressionNode(expr) {
    // Scalar subquery: node has .ast property (SELECT wrapped in parens)
    if (expr.ast) {
      return {
        type: PG_EXPR_TYPE.SUBQUERY,
        query: this.convertSelect(expr.ast),
      };
    }
    if (LITERAL_TYPES.has(expr.type)) {
      return convertDialectLiteral(this.dialect, expr);
    }
    const methodName = objectHasOwn(EXPRESSION_METHOD_BY_TYPE, expr.type) ?
      EXPRESSION_METHOD_BY_TYPE[expr.type] : null;
    if (methodName) {
      return this[methodName](expr);
    }
    // A double-quoted token is an identifier: this SQLite build is compiled
    // without the double-quoted-string misfeature (SQLITE_DQS=0), as
    // PostgreSQL reads it too.
    if (expr.type === EXT_EXPR_TYPE.DOUBLE_QUOTE_STRING) {
      return {type: EXPR_TYPE.COLUMN_REF, table: null, column: expr.value};
    }
    if (expr.type === EXT_EXPR_TYPE.ORIGIN) {
      return convertOriginNode(this, expr);
    }
    if (expr.type === EXT_EXPR_TYPE.STAR) {
      return {type: EXPR_TYPE.STAR, value: STAR_VALUE};
    }
    if (expr.type === EXT_EXPR_TYPE.EXPR_LIST) {
      return expr.value.map((v) => this.convertExpression(v));
    }
    return this.convertPgExpression(expr);
  },

  /**
   * A named parameter: only the reserved name a `LIMIT ?` / `OFFSET ?`
   * placeholder is respelled as (sql-parser-source-text.js) is one; any other
   * named parameter is refused.
   * @param {Object} expr - External param node.
   * @return {Object} PARAMETER node.
   */
  convertNamedParameter(expr) {
    if (expr.value !== LIMIT_PARAMETER_NAME) {
      throw unsupportedFeature(PARSER_ERROR_MSG.UNKNOWN_EXPRESSION_TYPE_PREFIX + expr.type);
    }
    return this.createParameterNode();
  },

  /**
   * PostgreSQL-only node types ($n parameters, EXTRACT).
   * @param {Object} expr - External parser AST expression node.
   * @returns {Object} Converted Internal_AST node.
   */
  convertPgExpression(expr) {
    if (this.dialect === PARSER_DIALECT.POSTGRESQL) {
      if (expr.type === PG_NODE_TYPE.VAR && expr.prefix === PG_PARAM_PREFIX) {
        translatePositionalParam({value: expr.name}, this.positionalParams);
        return this.createParameterNode();
      }
      if (expr.type === PG_NODE_TYPE.EXTRACT) {
        return this.convertPgExtract(expr);
      }
    }
    throw unsupportedFeature(PARSER_ERROR_MSG.UNKNOWN_EXPRESSION_TYPE_PREFIX + expr.type);
  },

  /**
   * CAST. In SQLite mode the target type is kept as written and SQLite
   * derives the conversion from it; `affinity` is SQLite's affinity of that
   * type (sql-table-definition.js). PostgreSQL mode translates the type.
   * @param {Object} expr - External cast node.
   * @return {Object} CAST node.
   */
  convertCast(expr) {
    if (!Array.isArray(expr.target) || expr.target.length !== 1) {
      throw unsupportedFeature(PARSER_ERROR_MSG.CAST_TARGET);
    }
    if (this.dialect === PARSER_DIALECT.POSTGRESQL) {
      return translateTypeCast({expr: expr.expr, target: {dataType: expr.target[0]?.dataType}},
        this.convertExpression.bind(this));
    }
    const targetType = castTargetTypeText(expr.target[0]);
    return {
      type: PG_EXPR_TYPE.CAST,
      expression: this.convertExpression(expr.expr),
      targetType,
      affinity: sqliteDeclaredTypeAffinity(targetType),
    };
  },

  /**
   * CASE (searched and simple).
   * @param {Object} expr - External case node.
   * @returns {Object} Internal_AST case node.
   */
  convertCase(expr) {
    const operand = expr.expr ? this.convertExpression(expr.expr) : null;
    const conditions = [];
    let elseExpr = null;
    for (const arg of expr.args) {
      if (arg.type === PG_CASE_ARG_TYPE.WHEN) {
        conditions.push({
          when: this.convertExpression(arg.cond),
          thenExpression: this.convertExpression(arg.result),
        });
      } else if (arg.type === PG_CASE_ARG_TYPE.ELSE) {
        elseExpr = this.convertExpression(arg.result);
      }
    }
    return {type: PG_EXPR_TYPE.CASE, operand, conditions, elseExpr};
  },

  convertFunction(expr) {
    const {firstPart, funcName, argValues} = extractFunctionCallParts(expr, this.dialect);
    if (funcName.toUpperCase() === PG_EXISTS_NAME) {
      if (carriesValue(expr.over)) {
        throw unsupportedFeature(PARSER_ERROR_MSG.UNREAD_SYNTAX_PREFIX + OVER_KEY +
          PARSER_ERROR_MSG.UNREAD_SYNTAX_SUFFIX + PG_EXISTS_NAME);
      }
      return convertExistsSubquery(this, argValues[0]);
    }
    const lowerFunc = funcName.toLowerCase();
    if (objectHasOwn(DISTINCT_AGGREGATE_BY_SENTINEL, lowerFunc)) {
      if (argValues.length !== 1) {
        throw unsupportedFeature(PARSER_ERROR_MSG.UNKNOWN_EXPRESSION_TYPE_PREFIX + funcName);
      }
      const argument = this.convertExpression(argValues[0]);
      const {over, orderBy} = convertWindowOrOrderOver(this, expr.over);
      return {
        type: EXPR_TYPE.AGGREGATE,
        function: DISTINCT_AGGREGATE_BY_SENTINEL[lowerFunc],
        argument,
        distinct: true,
        ...(orderBy ? {orderBy} : {}),
        ...(over ? {over} : {}),
      };
    }
    if (this.dialect === PARSER_DIALECT.POSTGRESQL) {
      const translated = translateFunctionCall(
        funcName,
        argValues,
        this.convertExpression.bind(this),
      );
      const {over, orderBy} = convertWindowOrOrderOver(this, expr.over);
      return over || orderBy ?
        {
          ...translated,
          ...(orderBy ? {orderBy} : {}),
          ...(over ? {over} : {}),
        } :
        translated;
    }
    if (firstPart?.type === KEYWORD_FUNCTION_NAME_TYPE && !expr.args) {
      if (carriesValue(expr.over)) {
        throw unsupportedFeature(PARSER_ERROR_MSG.UNREAD_SYNTAX_PREFIX + OVER_KEY +
          PARSER_ERROR_MSG.UNREAD_SYNTAX_SUFFIX + funcName.toUpperCase());
      }
      return {type: PG_EXPR_TYPE.FUNCTION_CALL, name: funcName.toUpperCase(), args: [],
        keyword: true};
    }
    const args = argValues.map((arg) => this.convertExpression(arg));
    const {over, orderBy} = convertWindowOrOrderOver(this, expr.over);
    return {
      type: PG_EXPR_TYPE.FUNCTION_CALL,
      name: funcName,
      args,
      ...(orderBy ? {orderBy} : {}),
      ...(over ? {over} : {}),
    };
  },

  convertPgExtract(expr) {
    const field = expr.args?.field || '';
    const source = expr.args?.source;
    return translateFunctionCall(
      PG_NODE_TYPE.EXTRACT, [{value: field}, source], this.convertExpression.bind(this),
    );
  },

  convertLike(expr, operator) {
    const right = expr.right;
    if (
      operator === SQL_OPERATOR.LIKE &&
      right?.type === EXT_EXPR_TYPE.BINARY_EXPR &&
      right.operator === EQUALS_OPERATOR &&
      right.left?.type === EXT_EXPR_TYPE.COLUMN_REF &&
      !right.left.table &&
      !right.left.collate &&
      objectHasOwn(RESPELLED_BINARY_OPERATOR_BY_SENTINEL, right.left.column)
    ) {
      const targetOp = RESPELLED_BINARY_OPERATOR_BY_SENTINEL[right.left.column];
      return {
        type: EXPR_TYPE.BINARY,
        operator: targetOp,
        left: this.convertExpression(expr.left),
        right: POSTFIX_NULL_OPERATORS.has(targetOp) ?
          {type: EXPR_TYPE.LITERAL, value: null, sqlType: SQL_STORAGE_CLASS.NULL} :
          this.convertExpression(right.right),
      };
    }
    const {[ESCAPE_KEY]: escape, ...pattern} = right;
    return {
      type: EXPR_TYPE.LIKE,
      expression: this.convertExpression(expr.left),
      pattern: this.convertExpression(pattern),
      negated: operator === SQL_OPERATOR.NOT_LIKE,
      escape: escape ? this.convertExpression(escape.value) : null,
    };
  },

  convertIn(expr, operator) {
    const expression = this.convertExpression(expr.left);
    if (Array.isArray(expr.right.value) &&
        expr.right.value.length === 1 &&
        expr.right.value[0]?.ast) {
      return {
        type: EXPR_TYPE.IN,
        expression,
        subquery: {
          type: PG_EXPR_TYPE.SUBQUERY,
          query: this.convertSelect(expr.right.value[0].ast),
        },
        negated: operator === SQL_OPERATOR.NOT_IN,
      };
    }
    const values = Array.isArray(expr.right.value) ?
      expr.right.value.map((v) => this.convertExpression(v)) :
      [this.convertExpression(expr.right)];
    return {type: EXPR_TYPE.IN, expression, values, negated: operator === SQL_OPERATOR.NOT_IN};
  },

  convertBetween(expr, operator) {
    const between = {
      type: EXPR_TYPE.BETWEEN,
      expression: this.convertExpression(expr.left),
      low: this.convertExpression(expr.right.value[0]),
      high: this.convertExpression(expr.right.value[1]),
    };
    return operator === SQL_OPERATOR.NOT_BETWEEN ?
      {type: EXPR_TYPE.UNARY, operator: SQL_OPERATOR.NOT, operand: between} : between;
  },

  convertIsNull(expr, operator) {
    const leftOperand = this.convertExpression(expr.left);
    const rightOperand = expr.right?.type === EXT_EXPR_TYPE.BOOL ?
      convertExternalLiteral(expr.right) :
      this.convertExpression(expr.right);
    if (rightOperand !== null &&
      !(rightOperand.type === EXPR_TYPE.LITERAL && rightOperand.value === null)) {
      return {type: EXPR_TYPE.BINARY, operator, left: leftOperand, right: rightOperand};
    }
    return {
      type: EXPR_TYPE.BINARY,
      operator: operator === SQL_OPERATOR.IS ? SQL_OPERATOR.IS_NULL : SQL_OPERATOR.IS_NOT_NULL,
      left: leftOperand,
      right: {type: EXPR_TYPE.LITERAL, value: null, sqlType: SQL_STORAGE_CLASS.NULL},
    };
  },

  convertBinaryExpr(expr) {
    const operator = expr.operator.toUpperCase();

    // PG-specific: ILIKE / NOT ILIKE -> LIKE with LOWER wrapping
    if (this.dialect === PARSER_DIALECT.POSTGRESQL &&
        (operator === SQL_OPERATOR.ILIKE ||
          operator === SQL_OPERATOR.NOT_ILIKE)) {
      return translateIlike(expr, this.convertExpression.bind(this));
    }
    if (operator === SQL_OPERATOR.IN || operator === SQL_OPERATOR.NOT_IN) {
      return this.convertIn(expr, operator);
    }
    if (operator === SQL_OPERATOR.BETWEEN || operator === SQL_OPERATOR.NOT_BETWEEN) {
      return this.convertBetween(expr, operator);
    }
    if (operator === SQL_OPERATOR.LIKE || operator === SQL_OPERATOR.NOT_LIKE) {
      return this.convertLike(expr, operator);
    }
    if (operator === SQL_OPERATOR.IS || operator === SQL_OPERATOR.IS_NOT) {
      return this.convertIsNull(expr, operator);
    }
    return {
      type: EXPR_TYPE.BINARY,
      operator: this.normalizeOperator(operator),
      left: this.convertExpression(expr.left),
      right: this.convertExpression(expr.right),
    };
  },

  normalizeOperator(op) {
    const upper = op.toUpperCase();
    if (upper === LOCAL_STR_BANG_EQUALS) return LOCAL_STR_LT_GT;
    return upper;
  },

  convertUnaryExpr(expr) {
    const operator = expr.operator.toUpperCase();
    if (
      operator === MINUS_OPERATOR &&
      expr.expr?.type === EXT_EXPR_TYPE.BIGINT &&
      !carriesValue(expr.expr.suffix) &&
      /^[0-9]+$/u.test(String(expr.expr.value))
    ) {
      refuseUnreadExpressionKeys(expr.expr);
      return convertBigIntOrExponentText(`-${expr.expr.value}`);
    }
    return {
      type: EXPR_TYPE.UNARY,
      operator,
      operand: this.convertExpression(expr.expr),
    };
  },

  convertColumnRef(expr) {
    // PG mode wraps column name in {expr: {type: 'default', value: name}}
    const column = (typeof expr.column === 'object' && expr.column?.expr) ?
      expr.column.expr.value :
      expr.column;
    if (!expr.table && column === COLLATED_PARAMETER_NAME) {
      return this.createParameterNode();
    }
    return {
      type: EXPR_TYPE.COLUMN_REF,
      table: expr.table || null,
      column,
    };
  },

  convertAggregate(expr) {
    if (expr.args) {
      refuseUnreadKeys(expr.args, READ_AGGREGATE_ARG_KEYS, UNREAD_SYNTAX_SCOPE.AGGREGATE_ARGUMENTS);
    }
    let argument;
    if (expr.args?.expr?.type === EXT_EXPR_TYPE.STAR) {
      argument = {type: EXPR_TYPE.STAR, value: STAR_VALUE};
    } else if (expr.args?.expr) {
      argument = this.convertExpression(expr.args.expr);
    } else {
      argument = {type: EXPR_TYPE.STAR, value: STAR_VALUE};
    }
    const argOrderBy = carriesValue(expr.args?.orderby) ?
      this.convertOrderBy(expr.args.orderby) :
      null;
    const {over, orderBy: overOrderBy} = convertWindowOrOrderOver(this, expr.over);
    const orderBy = overOrderBy || argOrderBy;
    return {
      type: EXPR_TYPE.AGGREGATE,
      function: expr.name.toUpperCase(),
      argument,
      distinct: !!expr.args?.distinct,
      ...(orderBy ? {orderBy} : {}),
      ...(over ? {over} : {}),
    };
  },

  /**
   * A literal or parameter operand (column DEFAULT): the one literal
   * conversion, or a parameter placeholder.
   * @param {Object|null} val - External node.
   * @return {Object} LITERAL or PARAMETER node.
   */
  convertValue(val) {
    if (!val) {
      return {type: EXPR_TYPE.LITERAL, value: null, sqlType: SQL_STORAGE_CLASS.NULL};
    }
    if (this.dialect === PARSER_DIALECT.POSTGRESQL &&
        val.type === PG_NODE_TYPE.VAR && val.prefix === PG_PARAM_PREFIX) {
      translatePositionalParam({value: val.name}, this.positionalParams);
      return this.createParameterNode();
    }
    if (val.type === EXT_EXPR_TYPE.ORIGIN && val.value === ORIGIN_PARAM) {
      return this.createParameterNode();
    }
    if (this.dialect === PARSER_DIALECT.POSTGRESQL && val.type === EXT_EXPR_TYPE.BOOL) {
      return translateBooleanLiteral(val);
    }
    if (val.type === EXT_EXPR_TYPE.UNARY_EXPR) {
      return this.convertUnaryExpr(val);
    }
    return convertExternalLiteral(val);
  },
};

export {sqlParserExpressionMethods};
