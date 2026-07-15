import {AST_TYPE, EXPR_TYPE} from './parser-constants.js';

const LOCAL_STR_COLUMN_REF = 'column_ref';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_RENAME = 'rename';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_VALUE = 'value';
const STAR_VALUE = '*';

function resolveFirstAlterExpression(ast) {
  const expressions = Array.isArray(ast?.expr) ? ast.expr : [];
  return expressions[0] || null;
}

function normalizeAlterLabel(value) {
  return typeof value === LOCAL_STR_STRING ?
    value.toLowerCase() : LOCAL_STR_EMPTY;
}

function resolveOptionalAlterValue(value) {
  return value === undefined ? null : value;
}

function selectAlterColumnName(oldColumnName, columnName) {
  return oldColumnName || columnName;
}

function resolveRenamedColumnName(action, columnName) {
  return action === LOCAL_STR_RENAME ? columnName : null;
}

function resolveReturningColumnName(column) {
  const expression = column?.expr;
  if (expression?.type !== LOCAL_STR_COLUMN_REF) {
    return null;
  }
  const columnRef = expression.column;
  if (typeof columnRef === LOCAL_STR_STRING) {
    return columnRef;
  }
  return columnRef?.expr?.value || null;
}

function isReturningStar(columns) {
  return columns.length === 1 &&
    columns[0]?.expr?.type === LOCAL_STR_COLUMN_REF &&
    columns[0]?.expr?.column === STAR_VALUE;
}

const sqlParserSchemaMutationMethods = {
  /**
   * Convert a RETURNING clause from node-sql-parser AST.
   * Handles both SQLite and PG mode AST shapes.
   * @param {Object|null} returning - Raw returning clause from parser AST.
   * @return {string[]|string|null} Column names, '*', or null.
   * @private
   */
  convertReturning(returning) {
    const columns = Array.isArray(returning?.columns) ?
      returning.columns : [];
    if (columns.length === 0) {
      return null;
    }
    if (isReturningStar(columns)) {
      return STAR_VALUE;
    }
    const names = columns
      .map(resolveReturningColumnName)
      .filter((name) => typeof name === LOCAL_STR_STRING);
    return names.length > 0 ? names : null;
  },

  convertAlter(ast) {
    const expression = resolveFirstAlterExpression(ast);
    const action = normalizeAlterLabel(expression?.action);
    const columnName = this.resolveAlterColumnName(expression?.column);
    const oldColumnName = this.resolveAlterColumnName(expression?.old_column);
    return {
      type: AST_TYPE.ALTER_TABLE,
      table: resolveOptionalAlterValue(ast.table?.[0]?.table),
      operation: {
        action,
        resource: normalizeAlterLabel(expression?.resource),
        columnName: selectAlterColumnName(oldColumnName, columnName),
        newColumnName: resolveRenamedColumnName(action, columnName),
        dataType: resolveOptionalAlterValue(
          expression?.definition?.dataType,
        ),
        defaultValue: this.convertAlterDefaultValue(expression?.default_val),
        keyword: resolveOptionalAlterValue(expression?.keyword),
      },
    };
  },

  resolveAlterColumnName(columnRef) {
    if (typeof columnRef?.column === LOCAL_STR_STRING) {
      return columnRef.column;
    }
    return columnRef?.column?.expr?.value || null;
  },

  convertAlterDefaultValue(defaultNode) {
    if (!Object.prototype.hasOwnProperty.call(
      defaultNode || {},
      LOCAL_STR_VALUE,
    )) {
      return null;
    }
    const converted = this.convertValue(defaultNode.value);
    if (
      converted?.type === EXPR_TYPE.LITERAL &&
      Object.prototype.hasOwnProperty.call(converted, LOCAL_STR_VALUE)
    ) {
      return converted.value;
    }
    return converted;
  },
};

export {sqlParserSchemaMutationMethods};
