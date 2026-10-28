import {AST_TYPE, EXPR_TYPE} from './parser-constants.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from './query-constants.js';

const LOCAL_STR_COLUMN_REF = 'column_ref';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_RENAME = 'rename';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_UNARY_EXPR = 'unary_expr';
const LOCAL_STR_VALUE = 'value';
const STAR_VALUE = '*';
const LOCAL_STR_PRIMARY_KEY = 'PRIMARY_KEY';
const LOCAL_STR_UNIQUE = 'UNIQUE';
const SQL_SCHEMA_COLUMN = 'column';
const SQL_SCHEMA_CONSTRAINT = 'constraint';
const SQL_SCHEMA_PRIMARY_KEY = 'primary key';
const SQL_SCHEMA_UNIQUE = 'unique';
const SQL_SCHEMA_NOT_NULL = 'not null';
const SQL_SCHEMA_CHECK = 'check';
const CONSTRAINT_TYPE_CHECK = 'CHECK';
const UNSUPPORTED_FOREIGN_KEY_MESSAGE =
  'FOREIGN KEY / REFERENCES constraints are not supported across distributed partitions';
const ERR_SUBQUERIES_IN_MUTATION = 'Subqueries in mutations are not supported';
const ERR_AGGREGATE_IN_MUTATION =
  'Aggregate functions in mutations are not supported';
const ERR_COLUMN_REF_IN_INSERT =
  'Column references in INSERT VALUES are not supported';
const FK_KEYWORD_FOREIGN_KEY = 'FOREIGN KEY';
const FK_KEYWORD_REFERENCES = 'REFERENCES';
const NODE_TYPE_SINGLE_QUOTE_STRING = 'single_quote_string';
const NODE_TYPE_BOOL = 'bool';
const NODE_TYPE_NULL = 'null';
const NODE_TYPE_BINARY_EXPR = 'binary_expr';
const NODE_TYPE_FUNCTION = 'function';
const SQL_ESCAPED_SINGLE_QUOTE = '\'\'';
const SQL_BOOL_TRUE = '1';
const SQL_BOOL_FALSE = '0';
const SQL_NULL_LITERAL = 'NULL';
const SQL_COMMA_SEPARATOR = ', ';
const SUBQUERY_MUTATION_TYPES = new Set([
  'subquery',
  'SUBQUERY',
  'exists',
  'EXISTS',
]);
const LITERAL_DEFAULT_TYPES = new Set([
  LOCAL_STR_NUMBER,
  'single_quote_string',
  LOCAL_STR_STRING,
  'bool',
  'null',
]);
const UNARY_NUMERIC_OPERATORS = new Set(['+', '-']);

function isSignedNumberDefaultNode(valueNode) {
  return valueNode?.type === LOCAL_STR_UNARY_EXPR &&
    UNARY_NUMERIC_OPERATORS.has(valueNode.operator) &&
    valueNode.expr?.type === LOCAL_STR_NUMBER &&
    typeof valueNode.expr.value === LOCAL_STR_NUMBER;
}

function throwNonLiteralDefaultError() {
  const error = new Error(QUERY_ERROR_MSG.NON_LITERAL_DEFAULT_UNSUPPORTED);
  error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  throw error;
}

function convertLiteralDefaultValueNode(parser, valueNode) {
  if (isSignedNumberDefaultNode(valueNode)) {
    const numeric = valueNode.operator === '-' ?
      -valueNode.expr.value :
      valueNode.expr.value;
    return {type: EXPR_TYPE.LITERAL, value: numeric};
  }
  if (!LITERAL_DEFAULT_TYPES.has(valueNode?.type)) {
    throwNonLiteralDefaultError();
  }
  return parser.convertValue(valueNode);
}

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

function externalSchemaIdentifier(value) {
  if (typeof value === LOCAL_STR_STRING) return value;
  const candidate = value?.expr?.value ?? value?.value ?? value?.column;
  return typeof candidate === LOCAL_STR_STRING ?
    candidate :
    String(candidate || LOCAL_STR_EMPTY);
}

function throwUnsupportedFeature(message) {
  const error = new Error(message);
  error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  throw error;
}

function assertValidMutationNode(expr, allowColumns) {
  if (SUBQUERY_MUTATION_TYPES.has(expr.type)) {
    throwUnsupportedFeature(ERR_SUBQUERIES_IN_MUTATION);
  }
  if (expr.type === EXPR_TYPE.AGGREGATE) {
    throwUnsupportedFeature(ERR_AGGREGATE_IN_MUTATION);
  }
  if (!allowColumns && expr.type === EXPR_TYPE.COLUMN_REF) {
    throwUnsupportedFeature(ERR_COLUMN_REF_IN_INSERT);
  }
}

function collectMutationChildNodes(expr) {
  const children = [
    expr.left,
    expr.right,
    expr.operand,
    expr.expression,
    expr.expr,
    expr.elseExpr,
  ].filter(Boolean);
  if (Array.isArray(expr.args)) {
    children.push(...expr.args);
  } else if (expr.args) {
    children.push(expr.args);
  }
  for (const cond of expr.conditions || []) {
    if (cond?.when) children.push(cond.when);
    if (cond?.then) children.push(cond.then);
  }
  return children;
}

function isForeignKeyDefinition(def) {
  if (def?.reference_definition) return true;
  const cType = String(def?.constraint_type || LOCAL_STR_EMPTY).toUpperCase();
  return (
    cType.includes(FK_KEYWORD_FOREIGN_KEY) ||
    cType.includes(FK_KEYWORD_REFERENCES)
  );
}

function renderCheckColumnRef(node) {
  const col = typeof node.column === 'object' && node.column?.expr ?
    node.column.expr.value :
    node.column;
  return typeof col === LOCAL_STR_STRING ? col : String(col || LOCAL_STR_EMPTY);
}

function renderCheckLiteralOrSimple(node) {
  switch (node.type) {
  case LOCAL_STR_COLUMN_REF:
    return renderCheckColumnRef(node);
  case LOCAL_STR_NUMBER:
    return String(node.value);
  case NODE_TYPE_SINGLE_QUOTE_STRING:
  case LOCAL_STR_STRING:
    return `'${String(node.value).replace(/'/g, SQL_ESCAPED_SINGLE_QUOTE)}'`;
  case NODE_TYPE_BOOL:
    return node.value ? SQL_BOOL_TRUE : SQL_BOOL_FALSE;
  case NODE_TYPE_NULL:
    return SQL_NULL_LITERAL;
  default:
    return null;
  }
}

function extractFirstCheckSql(parser, definitionList) {
  if (!Array.isArray(definitionList) || definitionList.length === 0) {
    return null;
  }
  return parser.renderCheckExpr(definitionList[0]) || null;
}

function buildCreateTableColumn(parser, def) {
  if (isForeignKeyDefinition(def)) {
    throwUnsupportedFeature(UNSUPPORTED_FOREIGN_KEY_MESSAGE);
  }
  return {
    name: externalSchemaIdentifier(def.column.column),
    dataType: {
      name: def.definition.dataType,
      length: def.definition.length || null,
      precision: null,
      scale: null,
    },
    primaryKey: !!def.primary_key,
    notNull: def.nullable?.type === SQL_SCHEMA_NOT_NULL,
    unique: !!def.unique,
    checkSql: extractFirstCheckSql(parser, def.check?.definition),
    defaultValue: parser.convertColumnDefaultLiteral(def.default_val),
  };
}

function applyCreateTableConstraint(parser, def, tableConstraints) {
  if (isForeignKeyDefinition(def)) {
    throwUnsupportedFeature(UNSUPPORTED_FOREIGN_KEY_MESSAGE);
  }
  const cType = String(def.constraint_type || LOCAL_STR_EMPTY).toLowerCase();
  if (cType === SQL_SCHEMA_PRIMARY_KEY) {
    const pkColumns = def.definition.map((d) =>
      externalSchemaIdentifier(d.column),
    );
    tableConstraints.push({type: LOCAL_STR_PRIMARY_KEY, columns: pkColumns});
    return pkColumns;
  }
  if (cType === SQL_SCHEMA_UNIQUE) {
    const uniqueColumns = def.definition.map((d) =>
      externalSchemaIdentifier(d.column),
    );
    tableConstraints.push({type: LOCAL_STR_UNIQUE, columns: uniqueColumns});
    return null;
  }
  if (cType === SQL_SCHEMA_CHECK) {
    const checkSql = extractFirstCheckSql(parser, def.definition);
    if (checkSql) {
      tableConstraints.push({type: CONSTRAINT_TYPE_CHECK, checkSql});
    }
  }
  return null;
}

function markSinglePrimaryKeyColumn(columns, primaryKey) {
  if (!Array.isArray(primaryKey) || primaryKey.length !== 1) {
    return;
  }
  const target = primaryKey[0].toLowerCase();
  const col = columns.find((c) => c.name.toLowerCase() === target);
  if (col) {
    col.primaryKey = true;
  }
}

const sqlParserSchemaMutationMethods = {
  convertMutationValue(val, {allowColumns = false} = {}) {
    if (!val) {
      return {type: EXPR_TYPE.LITERAL, value: null};
    }
    const converted = this.convertExpression(val);
    this.validateMutationExpression(converted, {allowColumns});
    return converted;
  },

  validateMutationExpression(expr, {allowColumns = false} = {}) {
    if (!expr) return;
    if (Array.isArray(expr)) {
      for (const item of expr) {
        this.validateMutationExpression(item, {allowColumns});
      }
      return;
    }
    assertValidMutationNode(expr, allowColumns);
    for (const child of collectMutationChildNodes(expr)) {
      this.validateMutationExpression(child, {allowColumns});
    }
  },

  hasForeignKeyConstraint(ast) {
    if ((ast.create_definitions || []).some(isForeignKeyDefinition)) {
      return true;
    }
    if (typeof this.sql !== LOCAL_STR_STRING) {
      return false;
    }
    const unquoted = this.sql.replace(/'[^']*'/g, LOCAL_STR_EMPTY)
      .replace(/"[^"]*"/g, LOCAL_STR_EMPTY);
    return /\bREFERENCES\b/iu.test(unquoted) ||
      /\bFOREIGN\s+KEY\b/iu.test(unquoted);
  },

  renderCheckExpr(node) {
    if (!node) return LOCAL_STR_EMPTY;
    const simple = renderCheckLiteralOrSimple(node);
    if (simple !== null) return simple;
    if (node.type === NODE_TYPE_BINARY_EXPR) {
      return `${this.renderCheckExpr(node.left)} ${node.operator} ${this.renderCheckExpr(node.right)}`;
    }
    if (node.type === LOCAL_STR_UNARY_EXPR) {
      return `${node.operator} ${this.renderCheckExpr(node.expr || node.operand)}`;
    }
    if (node.type === NODE_TYPE_FUNCTION) {
      const args = (node.args?.value || [])
        .map((a) => this.renderCheckExpr(a))
        .join(SQL_COMMA_SEPARATOR);
      return `${node.name}(${args})`;
    }
    return node.value !== undefined ? String(node.value) : LOCAL_STR_EMPTY;
  },

  convertCreateTable(ast) {
    if (this.hasForeignKeyConstraint(ast)) {
      throwUnsupportedFeature(UNSUPPORTED_FOREIGN_KEY_MESSAGE);
    }
    const tableName = ast.table[0].table;
    const columns = [];
    const tableConstraints = [];
    let primaryKey = null;

    for (const def of ast.create_definitions || []) {
      if (def.resource === SQL_SCHEMA_COLUMN) {
        const column = buildCreateTableColumn(this, def);
        columns.push(column);
        if (column.primaryKey && !primaryKey) {
          primaryKey = [column.name];
        }
      } else if (def.resource === SQL_SCHEMA_CONSTRAINT) {
        const pkOverride = applyCreateTableConstraint(
          this,
          def,
          tableConstraints,
        );
        if (pkOverride) {
          primaryKey = pkOverride;
        }
      }
    }

    markSinglePrimaryKeyColumn(columns, primaryKey);
    columns.tableConstraints = tableConstraints;
    columns.primaryKey = primaryKey;

    return {
      type: AST_TYPE.CREATE_TABLE,
      tableName,
      ifNotExists: !!ast.if_not_exists,
      columns,
      tableConstraints,
      primaryKey,
    };
  },
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
    const names = columns.map(resolveReturningColumnName);
    if (names.some((name) => typeof name !== LOCAL_STR_STRING)) {
      // A RETURNING expression this AST cannot carry: refused, never
      // dropped (a dropped clause would read as no RETURNING at all).
      const error = new Error(QUERY_ERROR_MSG.RETURNING_UNSUPPORTED);
      error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
      throw error;
    }
    return names;
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

  convertColumnDefaultLiteral(defaultNode) {
    if (!Object.prototype.hasOwnProperty.call(
      defaultNode || {},
      LOCAL_STR_VALUE,
    )) {
      return null;
    }
    return convertLiteralDefaultValueNode(this, defaultNode.value);
  },

  convertAlterDefaultValue(defaultNode) {
    const converted = this.convertColumnDefaultLiteral(defaultNode);
    return converted ? converted.value : null;
  },
};

export {sqlParserSchemaMutationMethods};
