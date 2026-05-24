import {NUM, TYPEOF} from '../constants/index.js';
import {EXPR_TYPE} from './parser-constants.js';
import {PARSER_DIALECT, PG_EXPR_TYPE} from './pg/pg-compat-constants.js';
import {
  translateBooleanLiteral,
  translatePositionalParam,
  translateTypeCast,
  translateIlike,
} from './pg/pg-translate.js';
import {translateFunctionCall} from './pg/pg-function-registry.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_VALUE = 'value';
const LOCAL_STR_145ZS = '!=';
const LOCAL_STR_151ZF = '<>';

const PARSER_ERROR_MSG = Object.freeze({
  UNKNOWN_EXPRESSION_TYPE_PREFIX: 'Unknown expression type: ',
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
  LIKE: 'LIKE',
  NOT_LIKE: 'NOT LIKE',
  IS: 'IS',
  IS_NOT: 'IS NOT',
  IS_NULL: 'IS NULL',
  IS_NOT_NULL: 'IS NOT NULL',
  ILIKE: 'ILIKE',
  NOT_ILIKE: 'NOT ILIKE',
});

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

const STAR_VALUE = '*';
const ORIGIN_PARAM = '?';

const sqlParserExpressionMethods = {
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
  },

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
        {
          expr: expr.expr,
          target: {dataType: expr.target[LOCAL_NUM_ZERO]?.dataType},
        },
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
  },

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
  },

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
  },

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
  },

  normalizeOperator(op) {
    const upper = op.toUpperCase();
    if (upper === LOCAL_STR_145ZS) return LOCAL_STR_151ZF;
    return upper;
  },

  convertUnaryExpr(expr) {
    return {
      type: EXPR_TYPE.UNARY,
      operator: expr.operator.toUpperCase(),
      operand: this.convertExpression(expr.expr),
    };
  },

  convertColumnRef(expr) {
    // PG mode wraps column name in {expr: {type: 'default', value: name}}
    const column = (typeof expr.column === TYPEOF.OBJECT && expr.column?.expr) ?
      expr.column.expr.value :
      expr.column;
    return {
      type: EXPR_TYPE.COLUMN_REF,
      table: expr.table || null,
      column,
    };
  },

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
  },

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
  },
};

export {sqlParserExpressionMethods};
