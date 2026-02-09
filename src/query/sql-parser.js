/**
 * SQL Parser - Wrapper around node-sql-parser for distributed database.
 * Converts node-sql-parser AST to internal format used by query engine.
 * Supports SELECT, INSERT, UPDATE, DELETE with WHERE, ORDER BY, GROUP BY, LIMIT, JOIN.
 * Requirements: 7.1, 7.3
 */

import nodeSqlParser from 'node-sql-parser';
const {Parser} = nodeSqlParser;
import {LoggingService} from '../logging/logging-service.js';

const PARSER_CONFIG = Object.freeze({
  DATABASE: 'sqlite',
  SUBSYSTEM: 'sql-parser',
});

const AST_TYPE = Object.freeze({
  SELECT: 'SELECT',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  CREATE_TABLE: 'CREATE_TABLE',
  CREATE_INDEX: 'CREATE_INDEX',
  DROP_TABLE: 'DROP_TABLE',
  DROP_INDEX: 'DROP_INDEX',
  BEGIN_TRANSACTION: 'BEGIN_TRANSACTION',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
});

const EXTERNAL_TYPE = Object.freeze({
  SELECT: 'select',
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete',
  CREATE: 'create',
  DROP: 'drop',
});

const EXPR_TYPE = Object.freeze({
  BINARY: 'binary',
  UNARY: 'unary',
  LITERAL: 'literal',
  COLUMN_REF: 'column_ref',
  PARAMETER: 'parameter',
  AGGREGATE: 'aggregate',
  STAR: 'star',
  IN: 'in',
  BETWEEN: 'between',
  LIKE: 'like',
  COLUMN: 'column',
  TABLE: 'table',
  JOIN: 'join',
});

class SQLParser {
  constructor(sql) {
    this.sql = sql;
    this.parser = new Parser();
    this.logger = this.initLogger();
  }

  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(PARSER_CONFIG.SUBSYSTEM);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  parse() {
    const trimmedSql = this.sql.trim().toUpperCase();
    if (trimmedSql === 'BEGIN' || trimmedSql.startsWith('BEGIN ')) {
      return {type: AST_TYPE.BEGIN_TRANSACTION};
    }
    if (trimmedSql === 'COMMIT') {
      return {type: AST_TYPE.COMMIT};
    }
    if (trimmedSql === 'ROLLBACK') {
      return {type: AST_TYPE.ROLLBACK};
    }

    try {
      const externalAst = this.parser.astify(this.sql, {database: PARSER_CONFIG.DATABASE});
      return this.convertAst(externalAst);
    } catch (error) {
      const errorMsg = 'SQL Parse Error: ' + error.message;
      this.logger.error(errorMsg, {sql: this.sql});
      throw new Error(errorMsg);
    }
  }

  convertAst(ast) {
    // Handle array result (e.g., when SQL ends with semicolon)
    if (Array.isArray(ast)) {
      if (ast.length === 0) {
        throw new Error('Empty SQL statement');
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
    case EXTERNAL_TYPE.DROP:
      return this.convertDrop(ast);
    default:
      throw new Error('Unsupported statement type: ' + ast.type);
    }
  }
  convertSelect(ast) {
    return {
      type: AST_TYPE.SELECT,
      distinct: ast.distinct === 'DISTINCT',
      columns: this.convertColumns(ast.columns),
      from: this.convertFrom(ast.from),
      joins: this.convertJoins(ast.from),
      where: ast.where ? this.convertExpression(ast.where) : null,
      groupBy: ast.groupby ? this.convertGroupBy(ast.groupby) : null,
      having: ast.having ? this.convertExpression(ast.having) : null,
      orderBy: ast.orderby ? this.convertOrderBy(ast.orderby) : null,
      limit: ast.limit ? this.convertLimit(ast.limit) : null,
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

    return {
      type: AST_TYPE.INSERT,
      table: tableName,
      columns,
      values,
      orReplace: insertMode === 'replace',
      orIgnore: insertMode === 'ignore',
    };
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
      if (mode === 'replace' || mode === 'ignore') {
        return mode;
      }
    }

    const prefix = String(ast.prefix || '').toLowerCase();
    if (prefix === 'or replace') {
      return 'replace';
    }
    if (prefix === 'or ignore') {
      return 'ignore';
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
    };
  }

  convertDelete(ast) {
    const tableName = ast.from[0].table;
    return {
      type: AST_TYPE.DELETE,
      table: tableName,
      where: ast.where ? this.convertExpression(ast.where) : null,
    };
  }

  convertCreate(ast) {
    if (ast.keyword === 'table') {
      return this.convertCreateTable(ast);
    }
    if (ast.keyword === 'index') {
      return this.convertCreateIndex(ast);
    }
    throw new Error('Unsupported CREATE type: ' + ast.keyword);
  }

  convertCreateTable(ast) {
    const tableName = ast.table[0].table;
    const columns = [];
    const tableConstraints = [];
    let primaryKey = null;

    for (const def of ast.create_definitions || []) {
      if (def.resource === 'column') {
        const column = {
          name: def.column.column,
          dataType: {
            name: def.definition.dataType,
            length: def.definition.length || null,
            precision: null,
            scale: null,
          },
          primaryKey: !!def.primary_key,
          notNull: def.nullable?.type === 'not null',
          unique: !!def.unique,
          defaultValue: def.default_val ? this.convertValue(def.default_val.value) : null,
        };
        columns.push(column);
        if (column.primaryKey && !primaryKey) {
          primaryKey = [column.name];
        }
      } else if (def.resource === 'constraint') {
        if (def.constraint_type === 'primary key') {
          const pkColumns = def.definition.map((d) => d.column);
          tableConstraints.push({type: 'PRIMARY_KEY', columns: pkColumns});
          primaryKey = pkColumns;
        } else if (def.constraint_type === 'unique') {
          const uniqueColumns = def.definition.map((d) => d.column);
          tableConstraints.push({type: 'UNIQUE', columns: uniqueColumns});
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
      unique: !!ast.index_type?.includes('unique'),
      ifNotExists: !!ast.if_not_exists,
      indexType: 'btree',
    };
  }

  convertDrop(ast) {
    if (ast.keyword === 'table') {
      return {
        type: AST_TYPE.DROP_TABLE,
        tableName: ast.name[0].table,
        ifExists: !!ast.if_exists,
      };
    }
    if (ast.keyword === 'index') {
      return {
        type: AST_TYPE.DROP_INDEX,
        indexName: ast.name[0].table,
        tableName: null,
        ifExists: !!ast.if_exists,
      };
    }
    throw new Error('Unsupported DROP type: ' + ast.keyword);
  }

  convertColumns(columns) {
    return columns.map((col) => {
      if (col.expr.type === 'star' || col.expr.column === '*') {
        return {type: EXPR_TYPE.STAR, value: '*'};
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
        joins.push({
          type: EXPR_TYPE.JOIN,
          joinType: this.normalizeJoinType(joinDef.join),
          table: {
            type: EXPR_TYPE.TABLE,
            name: joinDef.table,
            alias: joinDef.as || null,
          },
          condition: joinDef.on ? this.convertExpression(joinDef.on) : null,
        });
      }
    }
    return joins;
  }

  normalizeJoinType(joinType) {
    const upper = joinType.toUpperCase();
    if (upper.includes('LEFT')) return 'LEFT';
    if (upper.includes('RIGHT')) return 'RIGHT';
    if (upper.includes('CROSS')) return 'CROSS';
    return 'INNER';
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
      direction: o.type || 'ASC',
    }));
  }

  convertLimit(limit) {
    if (!limit || !limit.value) {
      return null;
    }
    const values = limit.value;
    const count = values[0]?.value;
    const offset = values.length > 1 ? values[1]?.value : null;
    return {count, offset};
  }

  convertExpression(expr) {
    if (!expr) {
      return null;
    }
    switch (expr.type) {
    case 'binary_expr':
      return this.convertBinaryExpr(expr);
    case 'unary_expr':
      return this.convertUnaryExpr(expr);
    case 'column_ref':
      return this.convertColumnRef(expr);
    case 'number':
      return {type: EXPR_TYPE.LITERAL, value: expr.value};
    case 'single_quote_string':
    case 'double_quote_string':
    case 'string':
      return {type: EXPR_TYPE.LITERAL, value: expr.value};
    case 'bool':
      return {type: EXPR_TYPE.LITERAL, value: expr.value};
    case 'null':
      return {type: EXPR_TYPE.LITERAL, value: null};
    case 'origin':
      if (expr.value === '?') {
        return {type: EXPR_TYPE.PARAMETER};
      }
      return {type: EXPR_TYPE.LITERAL, value: expr.value};
    case 'aggr_func':
      return this.convertAggregate(expr);
    case 'star':
      return {type: EXPR_TYPE.STAR, value: '*'};
    case 'expr_list':
      return expr.value.map((v) => this.convertExpression(v));
    default:
      if (expr.value !== undefined) {
        return {type: EXPR_TYPE.LITERAL, value: expr.value};
      }
      throw new Error('Unknown expression type: ' + expr.type);
    }
  }

  convertBinaryExpr(expr) {
    const operator = expr.operator.toUpperCase();

    if (operator === 'IN' || operator === 'NOT IN') {
      const values = Array.isArray(expr.right.value) ?
        expr.right.value.map((v) => this.convertValue(v)) :
        [this.convertExpression(expr.right)];
      return {
        type: EXPR_TYPE.IN,
        expression: this.convertExpression(expr.left),
        values,
        negated: operator === 'NOT IN',
      };
    }

    if (operator === 'BETWEEN') {
      return {
        type: EXPR_TYPE.BETWEEN,
        expression: this.convertExpression(expr.left),
        low: this.convertExpression(expr.right.value[0]),
        high: this.convertExpression(expr.right.value[1]),
      };
    }

    if (operator === 'LIKE' || operator === 'NOT LIKE') {
      return {
        type: EXPR_TYPE.LIKE,
        expression: this.convertExpression(expr.left),
        pattern: this.convertExpression(expr.right),
        negated: operator === 'NOT LIKE',
      };
    }

    if (operator === 'IS' || operator === 'IS NOT') {
      return {
        type: EXPR_TYPE.BINARY,
        operator: operator === 'IS' ? 'IS NULL' : 'IS NOT NULL',
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
    if (upper === '!=') return '<>';
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
    return {
      type: EXPR_TYPE.COLUMN_REF,
      table: expr.table || null,
      column: expr.column,
    };
  }

  convertAggregate(expr) {
    let argument;
    if (expr.args?.expr?.type === 'star') {
      argument = {type: EXPR_TYPE.STAR, value: '*'};
    } else if (expr.args?.expr) {
      argument = this.convertExpression(expr.args.expr);
    } else {
      argument = {type: EXPR_TYPE.STAR, value: '*'};
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
    switch (val.type) {
    case 'number':
      return {type: EXPR_TYPE.LITERAL, value: val.value};
    case 'single_quote_string':
    case 'double_quote_string':
    case 'string':
      return {type: EXPR_TYPE.LITERAL, value: val.value};
    case 'bool':
      return {type: EXPR_TYPE.LITERAL, value: val.value};
    case 'null':
      return {type: EXPR_TYPE.LITERAL, value: null};
    case 'origin':
      if (val.value === '?') {
        return {type: EXPR_TYPE.PARAMETER};
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
