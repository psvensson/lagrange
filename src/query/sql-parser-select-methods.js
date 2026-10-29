/**
 * SQL Parser select-statement conversion methods.
 *
 * Provides AST conversion for SELECT queries, WITH clauses (CTEs),
 * set operations, joins, GROUP BY, ORDER BY, and LIMIT/OFFSET.
 *
 * @module query/sql-parser-select-methods
 */

import {AST_TYPE, EXPR_TYPE} from './parser-constants.js';

const arraySome = Function.call.bind(Array.prototype.some);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase);
const stringIncludes = Function.call.bind(String.prototype.includes);

const PARSER_ERROR_MSG = Object.freeze({
  LIMIT_COUNT_MUST_BE_INTEGER_LITERAL:
    'LIMIT count must be an integer literal',
  LIMIT_OFFSET_MUST_BE_INTEGER_LITERAL:
    'LIMIT offset must be an integer literal',
  LIMIT_ALL_WITH_OFFSET_UNSUPPORTED:
    'LIMIT ALL with OFFSET is unsupported',
  OFFSET_WITHOUT_LIMIT_UNSUPPORTED:
    'OFFSET without LIMIT is unsupported',
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
const STAR_VALUE = '*';
const DISTINCT_KEYWORD = 'DISTINCT';

const EXT_EXPR_TYPE = Object.freeze({
  ORIGIN: 'origin',
  STAR: 'star',
});

function isLimitAllNode(node) {
  return node?.type === EXT_EXPR_TYPE.ORIGIN &&
    stringToUpperCase(String(node.value)) === SQL_LIMIT_ALL;
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

const sqlParserSelectMethods = {
  convertSelect(ast) {
    const distinct = typeof ast.distinct === 'object' ?
      ast.distinct?.type === DISTINCT_KEYWORD :
      ast.distinct === DISTINCT_KEYWORD;

    const ctes = this.convertCtes(ast.with);
    const recursive = ast.with ?
      arraySome(ast.with, (c) => !!c.recursive) :
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
      locking: null,
    };
  },

  convertCtes(withClause) {
    if (!withClause || withClause.length === 0) {
      return null;
    }
    return arrayMap(withClause, (cte) => {
      const name = cte.name?.value || cte.name;
      const stmtAst = cte.stmt?.ast || cte.stmt;
      return {
        name,
        query: this.convertSelect(stmtAst),
        recursive: !!cte.recursive,
      };
    });
  },

  convertSetOperation(ast) {
    if (!ast._next || !ast.set_op) {
      return null;
    }
    return {
      type: stringToUpperCase(ast.set_op),
      right: this.convertSelect(ast._next),
    };
  },

  convertColumns(columns) {
    return arrayMap(columns, (col) => {
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
  },

  convertFrom(from) {
    if (!from || from.length === 0) {
      return null;
    }
    const firstTable = from[0];

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
  },

  convertJoins(from) {
    if (!from || from.length <= 1) {
      return [];
    }
    const joins = [];
    for (let i = 1; i < from.length; i++) {
      const joinDef = from[i];
      if (joinDef.join) {
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
  },

  normalizeJoinType(joinType) {
    const upper = stringToUpperCase(joinType);
    if (stringIncludes(upper, SQL_JOIN_TYPE.LEFT)) return SQL_JOIN_TYPE.LEFT;
    if (stringIncludes(upper, SQL_JOIN_TYPE.RIGHT)) return SQL_JOIN_TYPE.RIGHT;
    if (stringIncludes(upper, SQL_JOIN_TYPE.CROSS)) return SQL_JOIN_TYPE.CROSS;
    return SQL_JOIN_TYPE.INNER;
  },

  convertGroupBy(groupBy) {
    const columns = groupBy.columns || groupBy;
    if (!Array.isArray(columns)) {
      return [this.convertExpression(columns)];
    }
    return arrayMap(columns, (g) => this.convertExpression(g));
  },

  convertOrderBy(orderBy) {
    return arrayMap(orderBy, (o) => ({
      expression: this.convertExpression(o.expr),
      direction: o.type || SQL_SORT_DIRECTION.ASC,
    }));
  },

  convertLimit(limit) {
    return convertExternalLimit(limit);
  },
};

export {
  sqlParserSelectMethods,
};
