/**
 * SQL Parser select-statement conversion methods.
 *
 * Provides AST conversion for SELECT queries, WITH clauses (CTEs),
 * set operations, joins, GROUP BY, ORDER BY, and LIMIT/OFFSET. Syntax the
 * AST cannot carry (USING, NATURAL, comma joins, schema-qualified tables,
 * clauses node-sql-parser reports that this converter does not read) is the
 * typed UNSUPPORTED_SQL_FEATURE refusal, never dropped (design §2.5).
 *
 * @module query/sql-parser-select-methods
 */

import {AST_TYPE, EXPR_TYPE, SQL_STORAGE_CLASS} from './parser-constants.js';
import {QUERY_ERROR_CODE} from './query-constants.js';
import {SET_OP_BY_OPTION_SENTINEL} from './sql-parser-source-text.js';

const arraySome = Function.call.bind(Array.prototype.some);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase);
const stringIncludes = Function.call.bind(String.prototype.includes);

const PARSER_ERROR_MSG = Object.freeze({
  LIMIT_COUNT_MUST_BE_INTEGER_LITERAL:
    'LIMIT count must be an integer literal or a parameter',
  LIMIT_OFFSET_MUST_BE_INTEGER_LITERAL:
    'LIMIT offset must be an integer literal or a parameter',
  LIMIT_ALL_WITH_OFFSET_UNSUPPORTED:
    'LIMIT ALL with OFFSET is unsupported',
  OFFSET_WITHOUT_LIMIT_UNSUPPORTED:
    'OFFSET without LIMIT is unsupported',
  UNREAD_CLAUSE_PREFIX: 'Unsupported SQL syntax: the front end cannot carry ',
  UNREAD_CLAUSE_SUFFIX: ' of a ',
  JOIN_USING: 'JOIN ... USING is not supported',
  JOIN_WITHOUT_CONDITION:
    'A join without an ON condition (NATURAL, CROSS, comma or bare JOIN) is not supported',
  QUALIFIED_TABLE: 'Schema-qualified table names are not supported',
  FULL_JOIN: 'FULL OUTER JOIN is not supported',
});

const SQL_JOIN_TYPE = Object.freeze({
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  FULL: 'FULL',
  INNER: 'INNER',
});

const SQL_SORT_DIRECTION = Object.freeze({
  ASC: 'ASC',
});

// Join keywords node-sql-parser reads as the left table's alias
// (`t NATURAL JOIN u`, `t CROSS JOIN u`).
const JOIN_KEYWORD_ALIASES = new Set(['NATURAL', 'CROSS']);
const SQL_LIMIT_ALL = 'ALL';
const SQL_LIMIT_OFFSET_SEPARATOR = 'offset';
const SQL_LIMIT_COMMA_SEPARATOR = ',';
const STAR_VALUE = '*';
const DISTINCT_KEYWORD = 'DISTINCT';

const EXT_EXPR_TYPE = Object.freeze({
  ORIGIN: 'origin',
  STAR: 'star',
  NUMBER: 'number',
  PARAM: 'param',
  VAR: 'var',
  CAST: 'cast',
  EXPR: 'expr',
});

// node-sql-parser keys of each structural node this converter reads, or that
// carry no SQL semantics. Any other key with a value is refused.
const READ_SELECT_KEYS = Object.freeze(['with', 'type', 'options', 'distinct', 'columns',
  'from', 'where', 'groupby', 'having', 'orderby', 'limit', 'for_update', '_next', 'set_op',
  '_parentheses', 'parentheses']);
const READ_COLUMN_KEYS = Object.freeze(['expr', 'as', 'type']);
const READ_TABLE_KEYS = Object.freeze(['db', 'table', 'as', 'join', 'on', 'expr']);
const READ_ORDER_KEYS = Object.freeze(['expr', 'type']);
const READ_GROUP_KEYS = Object.freeze(['columns']);
const READ_CTE_KEYS = Object.freeze(['name', 'stmt', 'columns', 'recursive']);
const READ_LIMIT_KEYS = Object.freeze(['seperator', 'value']);
const UNREAD_CLAUSE_SCOPE = Object.freeze({
  SELECT: 'SELECT',
  CTE: 'common table expression',
  RESULT_COLUMN: 'result column',
  FROM_ITEM: 'FROM item',
  GROUP_BY: 'GROUP BY',
  ORDER_BY_TERM: 'ORDER BY term',
  LIMIT: 'LIMIT',
});

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

function refuseUnreadKeys(node, readKeys, label) {
  for (const [key, value] of Object.entries(node || {})) {
    if (!readKeys.includes(key) && carriesValue(value)) {
      throw unsupportedFeature(PARSER_ERROR_MSG.UNREAD_CLAUSE_PREFIX + key +
        PARSER_ERROR_MSG.UNREAD_CLAUSE_SUFFIX + label);
    }
  }
}

function isLimitAllNode(node) {
  return node?.type === EXT_EXPR_TYPE.ORIGIN &&
    stringToUpperCase(String(node.value)) === SQL_LIMIT_ALL;
}

function cteColumnName(column) {
  return typeof column === 'string' ? column : column?.column ?? column?.value;
}

const sqlParserSelectMethods = {
  convertSelect(ast) {
    refuseUnreadKeys(ast, READ_SELECT_KEYS, UNREAD_CLAUSE_SCOPE.SELECT);
    if (carriesValue(ast.options)) {
      refuseUnreadKeys(ast.options, [], UNREAD_CLAUSE_SCOPE.SELECT);
    }
    const distinct = typeof ast.distinct === 'object' ?
      ast.distinct?.type === DISTINCT_KEYWORD :
      ast.distinct === DISTINCT_KEYWORD;

    const ctes = this.convertCtes(ast.with);
    const recursive = ast.with ?
      arraySome(ast.with, (c) => !!c.recursive) :
      false;

    const columns = this.convertColumns(ast.columns);
    const from = this.convertFrom(ast.from);
    const joins = this.convertJoins(ast.from);
    const where = ast.where ? this.convertExpression(ast.where) : null;
    const groupBy = ast.groupby ? this.convertGroupBy(ast.groupby) : null;
    const having = ast.having ? this.convertExpression(ast.having) : null;
    const orderBy = ast.orderby ? this.convertOrderBy(ast.orderby) : null;
    const limit = ast.limit ? this.convertLimit(ast.limit) : null;
    const setOperation = this.convertSetOperation(ast);

    return {
      type: AST_TYPE.SELECT,
      distinct,
      columns,
      from,
      joins,
      where,
      groupBy,
      having,
      orderBy,
      limit,
      ctes,
      recursive,
      setOperation,
      locking: null,
    };
  },

  convertCtes(withClause) {
    if (!withClause || withClause.length === 0) {
      return null;
    }
    return arrayMap(withClause, (cte) => {
      refuseUnreadKeys(cte, READ_CTE_KEYS, UNREAD_CLAUSE_SCOPE.CTE);
      const name = cte.name?.value || cte.name;
      const stmtAst = cte.stmt?.ast || cte.stmt;
      const columns = Array.isArray(cte.columns) && cte.columns.length > 0 ?
        cte.columns.map(cteColumnName) : null;
      return {
        name,
        columns,
        query: this.convertSelect(stmtAst),
        recursive: !!cte.recursive,
      };
    });
  },

  convertSetOperation(ast) {
    if (!ast._next || !ast.set_op) {
      return null;
    }
    const nextOptions = ast._next.options;
    const sentinel = Array.isArray(nextOptions) && nextOptions.length === 1 &&
      Object.hasOwn(SET_OP_BY_OPTION_SENTINEL, nextOptions[0]) ?
      nextOptions[0] :
      null;
    const rightAst = sentinel ? {...ast._next, options: null} : ast._next;
    return {
      type: sentinel ? SET_OP_BY_OPTION_SENTINEL[sentinel] : stringToUpperCase(ast.set_op),
      right: this.convertSelect(rightAst),
    };
  },

  /**
   * The select list. An unaliased expression other than a bare column
   * carries `span`, the source text SQLite names it by (SQLite mode;
   * sql-parser-source-text.js).
   * @param {Object[]} columns - node-sql-parser select list.
   * @return {Object[]} Column and STAR nodes.
   */
  convertColumns(columns) {
    return arrayMap(columns, (rawCol) => {
      const col = rawCol?.type === EXT_EXPR_TYPE.CAST ? {
        type: EXT_EXPR_TYPE.EXPR,
        expr: {
          type: rawCol.type,
          keyword: rawCol.keyword,
          expr: rawCol.expr,
          symbol: rawCol.symbol,
          target: rawCol.target,
        },
        as: rawCol.as ?? null,
      } : rawCol;
      refuseUnreadKeys(col, READ_COLUMN_KEYS, UNREAD_CLAUSE_SCOPE.RESULT_COLUMN);
      if (col.expr.type === EXT_EXPR_TYPE.STAR ||
          col.expr.column === STAR_VALUE) {
        return {type: EXPR_TYPE.STAR, value: STAR_VALUE, table: col.expr.table || null};
      }
      const expression = this.convertExpression(col.expr);
      // SQLite names a bare column reference by the column itself; any other
      // unaliased expression by its source span.
      const span = col.as || expression.type === EXPR_TYPE.COLUMN_REF ? null :
        this.columnSpans.get(rawCol) ?? null;
      return {
        type: EXPR_TYPE.COLUMN,
        expression,
        alias: col.as || null,
        ...(span === null ? {} : {span}),
      };
    });
  },

  convertTableSource(entry) {
    refuseUnreadKeys(entry, READ_TABLE_KEYS, UNREAD_CLAUSE_SCOPE.FROM_ITEM);
    if (entry.db) {
      throw unsupportedFeature(PARSER_ERROR_MSG.QUALIFIED_TABLE);
    }
    if (entry.expr?.ast) {
      return {
        type: EXPR_TYPE.TABLE,
        name: null,
        alias: entry.as || null,
        subquery: this.convertSelect(entry.expr.ast),
      };
    }
    return {
      type: EXPR_TYPE.TABLE,
      name: entry.table,
      alias: entry.as || null,
    };
  },

  convertFrom(from) {
    if (!from || from.length === 0) {
      return null;
    }
    const firstTable = from[0];
    if (JOIN_KEYWORD_ALIASES.has(stringToUpperCase(String(firstTable.as || '')))) {
      throw unsupportedFeature(PARSER_ERROR_MSG.JOIN_WITHOUT_CONDITION);
    }
    return this.convertTableSource(firstTable);
  },

  convertJoins(from) {
    if (!from || from.length <= 1) {
      return [];
    }
    const joins = [];
    for (let i = 1; i < from.length; i++) {
      const joinDef = from[i];
      if (joinDef.using) {
        throw unsupportedFeature(PARSER_ERROR_MSG.JOIN_USING);
      }
      if (!joinDef.join || !joinDef.on ||
          JOIN_KEYWORD_ALIASES.has(stringToUpperCase(String(joinDef.as || '')))) {
        throw unsupportedFeature(PARSER_ERROR_MSG.JOIN_WITHOUT_CONDITION);
      }
      joins.push({
        type: EXPR_TYPE.JOIN,
        joinType: this.normalizeJoinType(joinDef.join),
        table: this.convertTableSource(joinDef),
        condition: this.convertExpression(joinDef.on),
      });
    }
    return joins;
  },

  normalizeJoinType(joinType) {
    const upper = stringToUpperCase(joinType);
    if (stringIncludes(upper, SQL_JOIN_TYPE.FULL)) {
      throw unsupportedFeature(PARSER_ERROR_MSG.FULL_JOIN);
    }
    if (stringIncludes(upper, SQL_JOIN_TYPE.LEFT)) return SQL_JOIN_TYPE.LEFT;
    if (stringIncludes(upper, SQL_JOIN_TYPE.RIGHT)) return SQL_JOIN_TYPE.RIGHT;
    return SQL_JOIN_TYPE.INNER;
  },

  convertGroupBy(groupBy) {
    if (!Array.isArray(groupBy)) {
      refuseUnreadKeys(groupBy, READ_GROUP_KEYS, UNREAD_CLAUSE_SCOPE.GROUP_BY);
    }
    const columns = groupBy.columns || groupBy;
    if (!Array.isArray(columns)) {
      return [this.convertExpression(columns)];
    }
    return arrayMap(columns, (g) => this.convertExpression(g));
  },

  convertOrderBy(orderBy) {
    return arrayMap(orderBy, (o) => {
      refuseUnreadKeys(o, READ_ORDER_KEYS, UNREAD_CLAUSE_SCOPE.ORDER_BY_TERM);
      return {
        expression: this.convertExpression(o.expr),
        direction: o.type || SQL_SORT_DIRECTION.ASC,
      };
    });
  },

  /**
   * One LIMIT or OFFSET operand: an integer literal (its value) or a
   * parameter node (`?`, respelled for node-sql-parser by
   * sql-parser-source-text.js; `$n` in PostgreSQL mode).
   * @param {Object} node - node-sql-parser operand.
   * @param {string} errorMessage - Refusal for any other operand.
   * @return {number|Object}
   */
  convertLimitOperand(node, errorMessage) {
    if (node?.type === EXT_EXPR_TYPE.PARAM) {
      return this.convertNamedParameter(node);
    }
    if (node?.type === EXT_EXPR_TYPE.VAR || node?.type === EXT_EXPR_TYPE.NUMBER) {
      const operand = this.convertValue(node);
      if (operand.type === EXPR_TYPE.PARAMETER) return operand;
      if (operand.sqlType === SQL_STORAGE_CLASS.INTEGER) return operand.value;
    }
    throw unsupportedFeature(errorMessage);
  },

  /**
   * LIMIT [OFFSET]: `LIMIT n OFFSET m` and SQLite's `LIMIT m, n` (offset
   * first) give {count: n, offset: m}.
   * @param {Object} limit - node-sql-parser limit clause.
   * @return {?{count: (number|Object), offset: (number|Object|null)}}
   */
  convertLimit(limit) {
    refuseUnreadKeys(limit, READ_LIMIT_KEYS, UNREAD_CLAUSE_SCOPE.LIMIT);
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
    // Operands are converted in text order, so parameter indexes follow the
    // placeholders as written.
    const offsetFirst = limit.seperator === SQL_LIMIT_COMMA_SEPARATOR && values.length > 1;
    const messages = offsetFirst ?
      [PARSER_ERROR_MSG.LIMIT_OFFSET_MUST_BE_INTEGER_LITERAL,
        PARSER_ERROR_MSG.LIMIT_COUNT_MUST_BE_INTEGER_LITERAL] :
      [PARSER_ERROR_MSG.LIMIT_COUNT_MUST_BE_INTEGER_LITERAL,
        PARSER_ERROR_MSG.LIMIT_OFFSET_MUST_BE_INTEGER_LITERAL];
    const operands = values.map((node, index) =>
      this.convertLimitOperand(node, messages[index]));
    if (operands.length === 1) return {count: operands[0], offset: null};
    return offsetFirst ? {count: operands[1], offset: operands[0]} :
      {count: operands[0], offset: operands[1]};
  },
};

export {
  sqlParserSelectMethods,
};
