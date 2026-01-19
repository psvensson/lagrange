/**
 * SQL Parser - Simplified SQL dialect parser for distributed database.
 * Supports SELECT, INSERT, UPDATE, DELETE with WHERE, ORDER BY, GROUP BY, LIMIT, JOIN.
 * Requirements: 7.1, 7.3
 */

import {LoggingService} from '../logging/logging-service.js';

/**
 * Token types for SQL lexer.
 */
const TokenType = {
  // Keywords
  SELECT: 'SELECT',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  FROM: 'FROM',
  INTO: 'INTO',
  VALUES: 'VALUES',
  SET: 'SET',
  WHERE: 'WHERE',
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
  IN: 'IN',
  BETWEEN: 'BETWEEN',
  LIKE: 'LIKE',
  IS: 'IS',
  NULL: 'NULL',
  ORDER: 'ORDER',
  BY: 'BY',
  ASC: 'ASC',
  DESC: 'DESC',
  GROUP: 'GROUP',
  HAVING: 'HAVING',
  LIMIT: 'LIMIT',
  OFFSET: 'OFFSET',
  JOIN: 'JOIN',
  INNER: 'INNER',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  OUTER: 'OUTER',
  ON: 'ON',
  AS: 'AS',
  DISTINCT: 'DISTINCT',
  COUNT: 'COUNT',
  SUM: 'SUM',
  AVG: 'AVG',
  MIN: 'MIN',
  MAX: 'MAX',
  CREATE: 'CREATE',
  TABLE: 'TABLE',
  PRIMARY: 'PRIMARY',
  KEY: 'KEY',
  BEGIN: 'BEGIN',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  TRANSACTION: 'TRANSACTION',
  INDEX: 'INDEX',
  DROP: 'DROP',
  IF: 'IF',
  EXISTS: 'EXISTS',
  UNIQUE: 'UNIQUE',
  USING: 'USING',

  // Literals and identifiers
  IDENTIFIER: 'IDENTIFIER',
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',

  // Operators
  EQUALS: 'EQUALS',
  NOT_EQUALS: 'NOT_EQUALS',
  LESS_THAN: 'LESS_THAN',
  LESS_THAN_OR_EQUAL: 'LESS_THAN_OR_EQUAL',
  GREATER_THAN: 'GREATER_THAN',
  GREATER_THAN_OR_EQUAL: 'GREATER_THAN_OR_EQUAL',

  // Punctuation
  COMMA: 'COMMA',
  DOT: 'DOT',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  STAR: 'STAR',
  SEMICOLON: 'SEMICOLON',
  QUESTION: 'QUESTION',

  // Special
  EOF: 'EOF',
};

/**
 * SQL keywords mapping.
 */
const KEYWORDS = {
  'SELECT': TokenType.SELECT,
  'INSERT': TokenType.INSERT,
  'UPDATE': TokenType.UPDATE,
  'DELETE': TokenType.DELETE,
  'FROM': TokenType.FROM,
  'INTO': TokenType.INTO,
  'VALUES': TokenType.VALUES,
  'SET': TokenType.SET,
  'WHERE': TokenType.WHERE,
  'AND': TokenType.AND,
  'OR': TokenType.OR,
  'NOT': TokenType.NOT,
  'IN': TokenType.IN,
  'BETWEEN': TokenType.BETWEEN,
  'LIKE': TokenType.LIKE,
  'IS': TokenType.IS,
  'NULL': TokenType.NULL,
  'ORDER': TokenType.ORDER,
  'BY': TokenType.BY,
  'ASC': TokenType.ASC,
  'DESC': TokenType.DESC,
  'GROUP': TokenType.GROUP,
  'HAVING': TokenType.HAVING,
  'LIMIT': TokenType.LIMIT,
  'OFFSET': TokenType.OFFSET,
  'JOIN': TokenType.JOIN,
  'INNER': TokenType.INNER,
  'LEFT': TokenType.LEFT,
  'RIGHT': TokenType.RIGHT,
  'OUTER': TokenType.OUTER,
  'ON': TokenType.ON,
  'AS': TokenType.AS,
  'DISTINCT': TokenType.DISTINCT,
  'COUNT': TokenType.COUNT,
  'SUM': TokenType.SUM,
  'AVG': TokenType.AVG,
  'MIN': TokenType.MIN,
  'MAX': TokenType.MAX,
  'CREATE': TokenType.CREATE,
  'TABLE': TokenType.TABLE,
  'PRIMARY': TokenType.PRIMARY,
  'KEY': TokenType.KEY,
  'BEGIN': TokenType.BEGIN,
  'COMMIT': TokenType.COMMIT,
  'ROLLBACK': TokenType.ROLLBACK,
  'TRANSACTION': TokenType.TRANSACTION,
  'INDEX': TokenType.INDEX,
  'DROP': TokenType.DROP,
  'IF': TokenType.IF,
  'EXISTS': TokenType.EXISTS,
  'UNIQUE': TokenType.UNIQUE,
  'USING': TokenType.USING,
  'TRUE': TokenType.BOOLEAN,
  'FALSE': TokenType.BOOLEAN,
};

/**
 * Token class representing a lexical token.
 */
class Token {
  /**
   * Create a new token.
   * @param {string} type - Token type.
   * @param {*} value - Token value.
   * @param {number} position - Position in source.
   */
  constructor(type, value, position) {
    this.type = type;
    this.value = value;
    this.position = position;
  }
}

/**
 * SQL Tokenizer - Lexical analyzer for SQL statements.
 */
class SQLTokenizer {
  /**
   * Create a new tokenizer.
   * @param {string} sql - SQL string to tokenize.
   */
  constructor(sql) {
    this.sql = sql;
    this.position = 0;
    this.tokens = [];
  }

  /**
   * Tokenize the SQL string.
   * @return {Array<Token>} Array of tokens.
   */
  tokenize() {
    this.tokens = [];
    this.position = 0;

    while (this.position < this.sql.length) {
      this.skipWhitespace();
      if (this.position >= this.sql.length) break;

      const token = this.nextToken();
      if (token) {
        this.tokens.push(token);
      }
    }

    this.tokens.push(new Token(TokenType.EOF, null, this.position));
    return this.tokens;
  }

  /**
   * Skip whitespace characters.
   * @private
   */
  skipWhitespace() {
    while (this.position < this.sql.length &&
           /\s/.test(this.sql[this.position])) {
      this.position++;
    }
  }

  /**
   * Get the next token.
   * @return {Token|null} Next token or null.
   * @private
   */
  nextToken() {
    const char = this.sql[this.position];
    const startPos = this.position;

    // String literals
    if (char === '\'' || char === '"') {
      return this.readString(char);
    }

    // Numbers
    if (/[0-9]/.test(char) || (char === '-' && /[0-9]/.test(this.peek(1)))) {
      return this.readNumber();
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(char)) {
      return this.readIdentifier();
    }

    // Operators and punctuation
    return this.readOperator(startPos);
  }

  /**
   * Peek ahead in the source.
   * @param {number} offset - Offset from current position.
   * @return {string} Character at offset.
   * @private
   */
  peek(offset = 0) {
    const pos = this.position + offset;
    return pos < this.sql.length ? this.sql[pos] : '';
  }

  /**
   * Read a string literal.
   * @param {string} quote - Quote character.
   * @return {Token} String token.
   * @private
   */
  readString(quote) {
    const startPos = this.position;
    this.position++; // Skip opening quote
    let value = '';

    while (this.position < this.sql.length) {
      const char = this.sql[this.position];

      if (char === quote) {
        // Check for escaped quote
        if (this.peek(1) === quote) {
          value += quote;
          this.position += 2;
        } else {
          this.position++; // Skip closing quote
          break;
        }
      } else if (char === '\\') {
        // Handle escape sequences
        this.position++;
        const escaped = this.sql[this.position];
        switch (escaped) {
        case 'n': value += '\n'; break;
        case 't': value += '\t'; break;
        case 'r': value += '\r'; break;
        default: value += escaped;
        }
        this.position++;
      } else {
        value += char;
        this.position++;
      }
    }

    return new Token(TokenType.STRING, value, startPos);
  }

  /**
   * Read a number literal.
   * @return {Token} Number token.
   * @private
   */
  readNumber() {
    const startPos = this.position;
    let value = '';

    // Handle negative sign
    if (this.sql[this.position] === '-') {
      value += '-';
      this.position++;
    }

    // Read integer part
    while (this.position < this.sql.length &&
           /[0-9]/.test(this.sql[this.position])) {
      value += this.sql[this.position];
      this.position++;
    }

    // Read decimal part
    if (this.sql[this.position] === '.' && /[0-9]/.test(this.peek(1))) {
      value += '.';
      this.position++;
      while (this.position < this.sql.length &&
             /[0-9]/.test(this.sql[this.position])) {
        value += this.sql[this.position];
        this.position++;
      }
    }

    // Read exponent
    if (this.sql[this.position] === 'e' || this.sql[this.position] === 'E') {
      value += this.sql[this.position];
      this.position++;
      if (this.sql[this.position] === '+' || this.sql[this.position] === '-') {
        value += this.sql[this.position];
        this.position++;
      }
      while (this.position < this.sql.length &&
             /[0-9]/.test(this.sql[this.position])) {
        value += this.sql[this.position];
        this.position++;
      }
    }

    return new Token(TokenType.NUMBER, parseFloat(value), startPos);
  }

  /**
   * Read an identifier or keyword.
   * @return {Token} Identifier or keyword token.
   * @private
   */
  readIdentifier() {
    const startPos = this.position;
    let value = '';

    while (this.position < this.sql.length &&
           /[a-zA-Z0-9_]/.test(this.sql[this.position])) {
      value += this.sql[this.position];
      this.position++;
    }

    const upperValue = value.toUpperCase();
    if (KEYWORDS[upperValue]) {
      if (upperValue === 'TRUE' || upperValue === 'FALSE') {
        return new Token(TokenType.BOOLEAN, upperValue === 'TRUE', startPos);
      }
      return new Token(KEYWORDS[upperValue], upperValue, startPos);
    }

    return new Token(TokenType.IDENTIFIER, value, startPos);
  }

  /**
   * Read an operator or punctuation.
   * @param {number} startPos - Starting position.
   * @return {Token} Operator token.
   * @private
   */
  readOperator(startPos) {
    const char = this.sql[this.position];
    const nextChar = this.peek(1);

    // Two-character operators
    if (char === '<' && nextChar === '=') {
      this.position += 2;
      return new Token(TokenType.LESS_THAN_OR_EQUAL, '<=', startPos);
    }
    if (char === '>' && nextChar === '=') {
      this.position += 2;
      return new Token(TokenType.GREATER_THAN_OR_EQUAL, '>=', startPos);
    }
    if (char === '!' && nextChar === '=') {
      this.position += 2;
      return new Token(TokenType.NOT_EQUALS, '!=', startPos);
    }
    if (char === '<' && nextChar === '>') {
      this.position += 2;
      return new Token(TokenType.NOT_EQUALS, '<>', startPos);
    }

    // Single-character operators
    this.position++;
    switch (char) {
    case '=': return new Token(TokenType.EQUALS, '=', startPos);
    case '<': return new Token(TokenType.LESS_THAN, '<', startPos);
    case '>': return new Token(TokenType.GREATER_THAN, '>', startPos);
    case ',': return new Token(TokenType.COMMA, ',', startPos);
    case '.': return new Token(TokenType.DOT, '.', startPos);
    case '(': return new Token(TokenType.LPAREN, '(', startPos);
    case ')': return new Token(TokenType.RPAREN, ')', startPos);
    case '*': return new Token(TokenType.STAR, '*', startPos);
    case ';': return new Token(TokenType.SEMICOLON, ';', startPos);
    case '?': return new Token(TokenType.QUESTION, '?', startPos);
    default:
      throw new Error(`Unexpected character '${char}' at position ${startPos}`);
    }
  }
}


/**
 * SQL Parser - Parses SQL tokens into an AST.
 */
class SQLParser {
  /**
   * Create a new parser.
   * @param {string} sql - SQL string to parse.
   */
  constructor(sql) {
    this.sql = sql;
    this.tokenizer = new SQLTokenizer(sql);
    this.tokens = [];
    this.position = 0;
    this.logger = this.initLogger();
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem('sql-parser');
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Parse the SQL string into an AST.
   * @return {Object} Parsed AST.
   */
  parse() {
    this.tokens = this.tokenizer.tokenize();
    this.position = 0;

    const statement = this.parseStatement();

    // Consume optional semicolon
    if (this.check(TokenType.SEMICOLON)) {
      this.advance();
    }

    // Ensure we've consumed all tokens
    if (!this.isAtEnd()) {
      throw this.error(`Unexpected token: ${this.peek().value}`);
    }

    return statement;
  }

  /**
   * Parse a SQL statement.
   * @return {Object} Statement AST.
   * @private
   */
  parseStatement() {
    if (this.check(TokenType.SELECT)) {
      return this.parseSelect();
    }
    if (this.check(TokenType.INSERT)) {
      return this.parseInsert();
    }
    if (this.check(TokenType.UPDATE)) {
      return this.parseUpdate();
    }
    if (this.check(TokenType.DELETE)) {
      return this.parseDelete();
    }
    if (this.check(TokenType.BEGIN)) {
      return this.parseBeginTransaction();
    }
    if (this.check(TokenType.COMMIT)) {
      return this.parseCommit();
    }
    if (this.check(TokenType.ROLLBACK)) {
      return this.parseRollback();
    }
    if (this.check(TokenType.CREATE)) {
      return this.parseCreate();
    }
    if (this.check(TokenType.DROP)) {
      return this.parseDrop();
    }

    throw this.error(`Expected statement, got: ${this.peek().type}`);
  }

  /**
   * Parse a CREATE statement (INDEX or TABLE).
   * @return {Object} CREATE AST.
   * @private
   */
  parseCreate() {
    this.consume(TokenType.CREATE, 'Expected CREATE');

    // Check for UNIQUE INDEX
    const unique = this.match(TokenType.UNIQUE);

    if (this.check(TokenType.INDEX)) {
      return this.parseCreateIndex(unique);
    }

    if (this.check(TokenType.TABLE)) {
      if (unique) {
        throw this.error('UNIQUE not valid for CREATE TABLE');
      }
      return this.parseCreateTable();
    }

    throw this.error('Expected INDEX or TABLE after CREATE');
  }

  /**
   * Parse CREATE INDEX statement.
   * @param {boolean} unique - Whether this is a unique index.
   * @return {Object} CREATE INDEX AST.
   * @private
   */
  parseCreateIndex(unique = false) {
    this.consume(TokenType.INDEX, 'Expected INDEX');

    // Optional IF NOT EXISTS
    let ifNotExists = false;
    if (this.check(TokenType.IF)) {
      this.advance();
      this.consume(TokenType.NOT, 'Expected NOT after IF');
      this.consume(TokenType.EXISTS, 'Expected EXISTS after NOT');
      ifNotExists = true;
    }

    // Index name
    const indexName = this.consume(TokenType.IDENTIFIER, 'Expected index name').value;

    this.consume(TokenType.ON, 'Expected ON');

    // Table name
    const tableName = this.consume(TokenType.IDENTIFIER, 'Expected table name').value;

    // Column list
    this.consume(TokenType.LPAREN, 'Expected (');
    const columns = [];
    do {
      columns.push(this.consume(TokenType.IDENTIFIER, 'Expected column name').value);
    } while (this.match(TokenType.COMMA));
    this.consume(TokenType.RPAREN, 'Expected )');

    // Optional USING clause for index type
    let indexType = 'btree';
    if (this.match(TokenType.USING)) {
      indexType = this.consume(TokenType.IDENTIFIER, 'Expected index type').value.toLowerCase();
    }

    return {
      type: 'CREATE_INDEX',
      indexName,
      tableName,
      columns,
      unique,
      ifNotExists,
      indexType,
    };
  }

  /**
   * Parse CREATE TABLE statement.
   * Supports column definitions with types, PRIMARY KEY, NOT NULL, UNIQUE, DEFAULT.
   * Requirements: 20.1, 20.2
   * @return {Object} CREATE TABLE AST.
   * @private
   */
  parseCreateTable() {
    this.consume(TokenType.TABLE, 'Expected TABLE');

    // Optional IF NOT EXISTS
    let ifNotExists = false;
    if (this.check(TokenType.IF)) {
      this.advance();
      this.consume(TokenType.NOT, 'Expected NOT after IF');
      this.consume(TokenType.EXISTS, 'Expected EXISTS after NOT');
      ifNotExists = true;
    }

    const tableName = this.consume(TokenType.IDENTIFIER, 'Expected table name').value;

    // Parse column definitions
    this.consume(TokenType.LPAREN, 'Expected ( after table name');
    const columns = [];
    const tableConstraints = [];
    let primaryKey = null;

    do {
      // Check for table-level constraints (PRIMARY KEY, UNIQUE, etc.)
      if (this.check(TokenType.PRIMARY)) {
        const constraint = this.parseTableConstraint();
        tableConstraints.push(constraint);
        if (constraint.type === 'PRIMARY_KEY') {
          primaryKey = constraint.columns;
        }
      } else if (this.check(TokenType.UNIQUE)) {
        tableConstraints.push(this.parseTableConstraint());
      } else {
        // Parse column definition
        const column = this.parseColumnDefinition();
        columns.push(column);

        // Track inline PRIMARY KEY
        if (column.primaryKey && !primaryKey) {
          primaryKey = [column.name];
        }
      }
    } while (this.match(TokenType.COMMA));

    this.consume(TokenType.RPAREN, 'Expected ) after column definitions');

    return {
      type: 'CREATE_TABLE',
      tableName,
      ifNotExists,
      columns,
      tableConstraints,
      primaryKey,
    };
  }

  /**
   * Parse a column definition.
   * @return {Object} Column definition AST.
   * @private
   */
  parseColumnDefinition() {
    const name = this.consume(TokenType.IDENTIFIER, 'Expected column name').value;

    // Parse column type
    const dataType = this.parseDataType();

    // Parse column constraints
    let primaryKey = false;
    let notNull = false;
    let unique = false;
    let defaultValue = null;

    while (true) {
      if (this.check(TokenType.PRIMARY)) {
        this.advance();
        this.consume(TokenType.KEY, 'Expected KEY after PRIMARY');
        primaryKey = true;
      } else if (this.match(TokenType.NOT)) {
        this.consume(TokenType.NULL, 'Expected NULL after NOT');
        notNull = true;
      } else if (this.match(TokenType.UNIQUE)) {
        unique = true;
      } else if (this.check(TokenType.IDENTIFIER) &&
                 this.peek().value.toUpperCase() === 'DEFAULT') {
        this.advance();
        defaultValue = this.parseValue();
      } else {
        break;
      }
    }

    return {
      name,
      dataType,
      primaryKey,
      notNull,
      unique,
      defaultValue,
    };
  }

  /**
   * Parse a data type.
   * @return {Object} Data type AST.
   * @private
   */
  parseDataType() {
    const typeName = this.consume(TokenType.IDENTIFIER, 'Expected data type').value
      .toUpperCase();

    // Handle types with optional length/precision
    let length = null;
    let precision = null;
    let scale = null;

    if (this.match(TokenType.LPAREN)) {
      length = this.consume(TokenType.NUMBER, 'Expected length').value;

      if (this.match(TokenType.COMMA)) {
        scale = this.consume(TokenType.NUMBER, 'Expected scale').value;
        precision = length;
        length = null;
      }

      this.consume(TokenType.RPAREN, 'Expected )');
    }

    return {
      name: typeName,
      length,
      precision,
      scale,
    };
  }

  /**
   * Parse a table-level constraint.
   * @return {Object} Constraint AST.
   * @private
   */
  parseTableConstraint() {
    if (this.match(TokenType.PRIMARY)) {
      this.consume(TokenType.KEY, 'Expected KEY after PRIMARY');
      this.consume(TokenType.LPAREN, 'Expected (');

      const columns = [];
      do {
        columns.push(this.consume(TokenType.IDENTIFIER, 'Expected column name').value);
      } while (this.match(TokenType.COMMA));

      this.consume(TokenType.RPAREN, 'Expected )');

      return {
        type: 'PRIMARY_KEY',
        columns,
      };
    }

    if (this.match(TokenType.UNIQUE)) {
      this.consume(TokenType.LPAREN, 'Expected (');

      const columns = [];
      do {
        columns.push(this.consume(TokenType.IDENTIFIER, 'Expected column name').value);
      } while (this.match(TokenType.COMMA));

      this.consume(TokenType.RPAREN, 'Expected )');

      return {
        type: 'UNIQUE',
        columns,
      };
    }

    throw this.error('Expected table constraint');
  }

  /**
   * Parse DROP statement (INDEX or TABLE).
   * @return {Object} DROP AST.
   * @private
   */
  parseDrop() {
    this.consume(TokenType.DROP, 'Expected DROP');

    if (this.check(TokenType.INDEX)) {
      return this.parseDropIndex();
    }

    if (this.check(TokenType.TABLE)) {
      return this.parseDropTable();
    }

    throw this.error('Expected INDEX or TABLE after DROP');
  }

  /**
   * Parse DROP INDEX statement.
   * @return {Object} DROP INDEX AST.
   * @private
   */
  parseDropIndex() {
    this.consume(TokenType.INDEX, 'Expected INDEX');

    // Optional IF EXISTS
    let ifExists = false;
    if (this.check(TokenType.IF)) {
      this.advance();
      this.consume(TokenType.EXISTS, 'Expected EXISTS after IF');
      ifExists = true;
    }

    // Index name
    const indexName = this.consume(TokenType.IDENTIFIER, 'Expected index name').value;

    // Optional ON table_name (for clarity, not required by SQLite)
    let tableName = null;
    if (this.match(TokenType.ON)) {
      tableName = this.consume(TokenType.IDENTIFIER, 'Expected table name').value;
    }

    return {
      type: 'DROP_INDEX',
      indexName,
      tableName,
      ifExists,
    };
  }

  /**
   * Parse DROP TABLE statement (placeholder for future implementation).
   * @return {Object} DROP TABLE AST.
   * @private
   */
  parseDropTable() {
    this.consume(TokenType.TABLE, 'Expected TABLE');

    // Optional IF EXISTS
    let ifExists = false;
    if (this.check(TokenType.IF)) {
      this.advance();
      this.consume(TokenType.EXISTS, 'Expected EXISTS after IF');
      ifExists = true;
    }

    const tableName = this.consume(TokenType.IDENTIFIER, 'Expected table name').value;

    return {
      type: 'DROP_TABLE',
      tableName,
      ifExists,
    };
  }

  /**
   * Parse a SELECT statement.
   * @return {Object} SELECT AST.
   * @private
   */
  parseSelect() {
    this.consume(TokenType.SELECT, 'Expected SELECT');

    const distinct = this.match(TokenType.DISTINCT);
    const columns = this.parseSelectColumns();

    this.consume(TokenType.FROM, 'Expected FROM');
    const from = this.parseFromClause();

    const joins = this.parseJoins();
    const where = this.parseWhereClause();
    const groupBy = this.parseGroupByClause();
    const having = this.parseHavingClause();
    const orderBy = this.parseOrderByClause();
    const limit = this.parseLimitClause();

    return {
      type: 'SELECT',
      distinct,
      columns,
      from,
      joins,
      where,
      groupBy,
      having,
      orderBy,
      limit,
    };
  }

  /**
   * Parse SELECT columns.
   * @return {Array} Column list.
   * @private
   */
  parseSelectColumns() {
    const columns = [];

    do {
      if (this.check(TokenType.STAR)) {
        this.advance();
        columns.push({type: 'star', value: '*'});
      } else {
        columns.push(this.parseSelectColumn());
      }
    } while (this.match(TokenType.COMMA));

    return columns;
  }

  /**
   * Parse a single SELECT column.
   * @return {Object} Column AST.
   * @private
   */
  parseSelectColumn() {
    const expr = this.parseExpression();

    let alias = null;
    if (this.match(TokenType.AS)) {
      alias = this.consume(TokenType.IDENTIFIER, 'Expected alias').value;
    } else if (this.check(TokenType.IDENTIFIER) && !this.isKeyword(this.peek())) {
      alias = this.advance().value;
    }

    return {
      type: 'column',
      expression: expr,
      alias,
    };
  }

  /**
   * Parse FROM clause.
   * @return {Object} FROM AST.
   * @private
   */
  parseFromClause() {
    const table = this.parseTableReference();
    return table;
  }

  /**
   * Parse a table reference.
   * @return {Object} Table reference AST.
   * @private
   */
  parseTableReference() {
    const name = this.consume(TokenType.IDENTIFIER, 'Expected table name').value;

    let alias = null;
    if (this.match(TokenType.AS)) {
      alias = this.consume(TokenType.IDENTIFIER, 'Expected alias').value;
    } else if (this.check(TokenType.IDENTIFIER) && !this.isKeyword(this.peek())) {
      alias = this.advance().value;
    }

    return {
      type: 'table',
      name,
      alias,
    };
  }

  /**
   * Parse JOIN clauses.
   * @return {Array} Array of JOIN ASTs.
   * @private
   */
  parseJoins() {
    const joins = [];

    while (this.checkJoin()) {
      joins.push(this.parseJoin());
    }

    return joins;
  }

  /**
   * Check if current token starts a JOIN.
   * @return {boolean} True if JOIN.
   * @private
   */
  checkJoin() {
    return this.check(TokenType.JOIN) ||
           this.check(TokenType.INNER) ||
           this.check(TokenType.LEFT) ||
           this.check(TokenType.RIGHT);
  }

  /**
   * Parse a single JOIN clause.
   * @return {Object} JOIN AST.
   * @private
   */
  parseJoin() {
    let joinType = 'INNER';

    if (this.match(TokenType.INNER)) {
      joinType = 'INNER';
    } else if (this.match(TokenType.LEFT)) {
      this.match(TokenType.OUTER);
      joinType = 'LEFT';
    } else if (this.match(TokenType.RIGHT)) {
      this.match(TokenType.OUTER);
      joinType = 'RIGHT';
    }

    this.consume(TokenType.JOIN, 'Expected JOIN');
    const table = this.parseTableReference();

    this.consume(TokenType.ON, 'Expected ON');
    const condition = this.parseExpression();

    return {
      type: 'join',
      joinType,
      table,
      condition,
    };
  }

  /**
   * Parse WHERE clause.
   * @return {Object|null} WHERE AST or null.
   * @private
   */
  parseWhereClause() {
    if (!this.match(TokenType.WHERE)) {
      return null;
    }
    return this.parseExpression();
  }

  /**
   * Parse GROUP BY clause.
   * @return {Array|null} GROUP BY columns or null.
   * @private
   */
  parseGroupByClause() {
    if (!this.match(TokenType.GROUP)) {
      return null;
    }
    this.consume(TokenType.BY, 'Expected BY after GROUP');

    const columns = [];
    do {
      columns.push(this.parseExpression());
    } while (this.match(TokenType.COMMA));

    return columns;
  }

  /**
   * Parse HAVING clause.
   * @return {Object|null} HAVING AST or null.
   * @private
   */
  parseHavingClause() {
    if (!this.match(TokenType.HAVING)) {
      return null;
    }
    return this.parseExpression();
  }

  /**
   * Parse ORDER BY clause.
   * @return {Array|null} ORDER BY columns or null.
   * @private
   */
  parseOrderByClause() {
    if (!this.match(TokenType.ORDER)) {
      return null;
    }
    this.consume(TokenType.BY, 'Expected BY after ORDER');

    const columns = [];
    do {
      const expr = this.parseExpression();
      let direction = 'ASC';
      if (this.match(TokenType.ASC)) {
        direction = 'ASC';
      } else if (this.match(TokenType.DESC)) {
        direction = 'DESC';
      }
      columns.push({expression: expr, direction});
    } while (this.match(TokenType.COMMA));

    return columns;
  }

  /**
   * Parse LIMIT clause.
   * @return {Object|null} LIMIT AST or null.
   * @private
   */
  parseLimitClause() {
    if (!this.match(TokenType.LIMIT)) {
      return null;
    }

    const count = this.consume(TokenType.NUMBER, 'Expected number after LIMIT').value;

    let offset = null;
    if (this.match(TokenType.OFFSET)) {
      offset = this.consume(TokenType.NUMBER, 'Expected number after OFFSET').value;
    }

    return {count, offset};
  }

  /**
   * Parse an INSERT statement.
   * @return {Object} INSERT AST.
   * @private
   */
  parseInsert() {
    this.consume(TokenType.INSERT, 'Expected INSERT');
    this.consume(TokenType.INTO, 'Expected INTO');

    const table = this.consume(TokenType.IDENTIFIER, 'Expected table name').value;

    // Parse column list if present
    let columns = null;
    if (this.match(TokenType.LPAREN)) {
      columns = [];
      do {
        columns.push(this.consume(TokenType.IDENTIFIER, 'Expected column').value);
      } while (this.match(TokenType.COMMA));
      this.consume(TokenType.RPAREN, 'Expected )');
    }

    this.consume(TokenType.VALUES, 'Expected VALUES');

    // Parse value lists
    const values = [];
    do {
      this.consume(TokenType.LPAREN, 'Expected (');
      const row = [];
      do {
        row.push(this.parseValue());
      } while (this.match(TokenType.COMMA));
      this.consume(TokenType.RPAREN, 'Expected )');
      values.push(row);
    } while (this.match(TokenType.COMMA));

    return {
      type: 'INSERT',
      table,
      columns,
      values,
    };
  }

  /**
   * Parse an UPDATE statement.
   * @return {Object} UPDATE AST.
   * @private
   */
  parseUpdate() {
    this.consume(TokenType.UPDATE, 'Expected UPDATE');
    const table = this.consume(TokenType.IDENTIFIER, 'Expected table name').value;

    this.consume(TokenType.SET, 'Expected SET');

    // Parse SET assignments
    const assignments = [];
    do {
      const column = this.consume(TokenType.IDENTIFIER, 'Expected column').value;
      this.consume(TokenType.EQUALS, 'Expected =');
      const value = this.parseValue();
      assignments.push({column, value});
    } while (this.match(TokenType.COMMA));

    const where = this.parseWhereClause();

    return {
      type: 'UPDATE',
      table,
      assignments,
      where,
    };
  }

  /**
   * Parse a DELETE statement.
   * @return {Object} DELETE AST.
   * @private
   */
  parseDelete() {
    this.consume(TokenType.DELETE, 'Expected DELETE');
    this.consume(TokenType.FROM, 'Expected FROM');

    const table = this.consume(TokenType.IDENTIFIER, 'Expected table name').value;
    const where = this.parseWhereClause();

    return {
      type: 'DELETE',
      table,
      where,
    };
  }

  /**
   * Parse BEGIN TRANSACTION.
   * @return {Object} BEGIN AST.
   * @private
   */
  parseBeginTransaction() {
    this.consume(TokenType.BEGIN, 'Expected BEGIN');
    this.match(TokenType.TRANSACTION);
    return {type: 'BEGIN_TRANSACTION'};
  }

  /**
   * Parse COMMIT.
   * @return {Object} COMMIT AST.
   * @private
   */
  parseCommit() {
    this.consume(TokenType.COMMIT, 'Expected COMMIT');
    return {type: 'COMMIT'};
  }

  /**
   * Parse ROLLBACK.
   * @return {Object} ROLLBACK AST.
   * @private
   */
  parseRollback() {
    this.consume(TokenType.ROLLBACK, 'Expected ROLLBACK');
    return {type: 'ROLLBACK'};
  }

  /**
   * Parse an expression.
   * @return {Object} Expression AST.
   * @private
   */
  parseExpression() {
    return this.parseOr();
  }

  /**
   * Parse OR expression.
   * @return {Object} Expression AST.
   * @private
   */
  parseOr() {
    let left = this.parseAnd();

    while (this.match(TokenType.OR)) {
      const right = this.parseAnd();
      left = {type: 'binary', operator: 'OR', left, right};
    }

    return left;
  }

  /**
   * Parse AND expression.
   * @return {Object} Expression AST.
   * @private
   */
  parseAnd() {
    let left = this.parseNot();

    while (this.match(TokenType.AND)) {
      const right = this.parseNot();
      left = {type: 'binary', operator: 'AND', left, right};
    }

    return left;
  }

  /**
   * Parse NOT expression.
   * @return {Object} Expression AST.
   * @private
   */
  parseNot() {
    if (this.match(TokenType.NOT)) {
      const expr = this.parseNot();
      return {type: 'unary', operator: 'NOT', operand: expr};
    }
    return this.parseComparison();
  }

  /**
   * Parse comparison expression.
   * @return {Object} Expression AST.
   * @private
   */
  parseComparison() {
    const left = this.parsePrimary();

    // Handle IS NULL / IS NOT NULL
    if (this.match(TokenType.IS)) {
      const not = this.match(TokenType.NOT);
      this.consume(TokenType.NULL, 'Expected NULL after IS');
      return {
        type: 'binary',
        operator: not ? 'IS NOT NULL' : 'IS NULL',
        left,
        right: {type: 'literal', value: null},
      };
    }

    // Handle IN
    if (this.match(TokenType.IN)) {
      this.consume(TokenType.LPAREN, 'Expected (');
      const values = [];
      do {
        values.push(this.parseValue());
      } while (this.match(TokenType.COMMA));
      this.consume(TokenType.RPAREN, 'Expected )');
      return {type: 'in', expression: left, values};
    }

    // Handle BETWEEN
    if (this.match(TokenType.BETWEEN)) {
      const low = this.parsePrimary();
      this.consume(TokenType.AND, 'Expected AND in BETWEEN');
      const high = this.parsePrimary();
      return {type: 'between', expression: left, low, high};
    }

    // Handle LIKE
    if (this.match(TokenType.LIKE)) {
      const pattern = this.parseValue();
      return {type: 'like', expression: left, pattern};
    }

    // Handle comparison operators
    if (this.checkComparison()) {
      const operator = this.advance().value;
      const right = this.parsePrimary();
      return {type: 'binary', operator, left, right};
    }

    return left;
  }

  /**
   * Check if current token is a comparison operator.
   * @return {boolean} True if comparison.
   * @private
   */
  checkComparison() {
    return this.check(TokenType.EQUALS) ||
           this.check(TokenType.NOT_EQUALS) ||
           this.check(TokenType.LESS_THAN) ||
           this.check(TokenType.LESS_THAN_OR_EQUAL) ||
           this.check(TokenType.GREATER_THAN) ||
           this.check(TokenType.GREATER_THAN_OR_EQUAL);
  }

  /**
   * Parse primary expression.
   * @return {Object} Expression AST.
   * @private
   */
  parsePrimary() {
    // Aggregate functions
    if (this.checkAggregate()) {
      return this.parseAggregate();
    }

    // Parenthesized expression
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      this.consume(TokenType.RPAREN, 'Expected )');
      return expr;
    }

    // Literals
    if (this.check(TokenType.STRING)) {
      return {type: 'literal', value: this.advance().value};
    }
    if (this.check(TokenType.NUMBER)) {
      return {type: 'literal', value: this.advance().value};
    }
    if (this.check(TokenType.BOOLEAN)) {
      return {type: 'literal', value: this.advance().value};
    }
    if (this.check(TokenType.NULL)) {
      this.advance();
      return {type: 'literal', value: null};
    }

    // Parameter placeholder
    if (this.check(TokenType.QUESTION)) {
      this.advance();
      return {type: 'parameter'};
    }

    // Column reference (possibly qualified)
    if (this.check(TokenType.IDENTIFIER)) {
      const name = this.advance().value;
      if (this.match(TokenType.DOT)) {
        const column = this.consume(TokenType.IDENTIFIER, 'Expected column').value;
        return {type: 'column_ref', table: name, column};
      }
      return {type: 'column_ref', table: null, column: name};
    }

    throw this.error(`Unexpected token: ${this.peek().type}`);
  }

  /**
   * Check if current token is an aggregate function.
   * @return {boolean} True if aggregate.
   * @private
   */
  checkAggregate() {
    return this.check(TokenType.COUNT) ||
           this.check(TokenType.SUM) ||
           this.check(TokenType.AVG) ||
           this.check(TokenType.MIN) ||
           this.check(TokenType.MAX);
  }

  /**
   * Parse an aggregate function.
   * @return {Object} Aggregate AST.
   * @private
   */
  parseAggregate() {
    const func = this.advance().value;
    this.consume(TokenType.LPAREN, 'Expected (');

    let distinct = false;
    if (this.match(TokenType.DISTINCT)) {
      distinct = true;
    }

    let argument;
    if (this.check(TokenType.STAR)) {
      this.advance();
      argument = {type: 'star', value: '*'};
    } else {
      argument = this.parseExpression();
    }

    this.consume(TokenType.RPAREN, 'Expected )');

    return {
      type: 'aggregate',
      function: func,
      argument,
      distinct,
    };
  }

  /**
   * Parse a value (literal or parameter).
   * @return {Object} Value AST.
   * @private
   */
  parseValue() {
    if (this.check(TokenType.STRING)) {
      return {type: 'literal', value: this.advance().value};
    }
    if (this.check(TokenType.NUMBER)) {
      return {type: 'literal', value: this.advance().value};
    }
    if (this.check(TokenType.BOOLEAN)) {
      return {type: 'literal', value: this.advance().value};
    }
    if (this.check(TokenType.NULL)) {
      this.advance();
      return {type: 'literal', value: null};
    }
    if (this.check(TokenType.QUESTION)) {
      this.advance();
      return {type: 'parameter'};
    }

    throw this.error(`Expected value, got: ${this.peek().type}`);
  }

  /**
   * Check if token is a keyword.
   * @param {Token} token - Token to check.
   * @return {boolean} True if keyword.
   * @private
   */
  isKeyword(token) {
    return KEYWORDS[token.value?.toUpperCase()] !== undefined;
  }

  // Parser utility methods

  /**
   * Check if current token matches type.
   * @param {string} type - Token type.
   * @return {boolean} True if matches.
   * @private
   */
  check(type) {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  /**
   * Match and consume token if type matches.
   * @param {string} type - Token type.
   * @return {boolean} True if matched.
   * @private
   */
  match(type) {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  /**
   * Consume token of expected type.
   * @param {string} type - Expected type.
   * @param {string} message - Error message.
   * @return {Token} Consumed token.
   * @private
   */
  consume(type, message) {
    if (this.check(type)) {
      return this.advance();
    }
    throw this.error(`${message}, got: ${this.peek().type}`);
  }

  /**
   * Advance to next token.
   * @return {Token} Previous token.
   * @private
   */
  advance() {
    if (!this.isAtEnd()) {
      this.position++;
    }
    return this.previous();
  }

  /**
   * Check if at end of tokens.
   * @return {boolean} True if at end.
   * @private
   */
  isAtEnd() {
    return this.peek().type === TokenType.EOF;
  }

  /**
   * Get current token.
   * @return {Token} Current token.
   * @private
   */
  peek() {
    return this.tokens[this.position];
  }

  /**
   * Get previous token.
   * @return {Token} Previous token.
   * @private
   */
  previous() {
    return this.tokens[this.position - 1];
  }

  /**
   * Create a parse error.
   * @param {string} message - Error message.
   * @return {Error} Parse error.
   * @private
   */
  error(message) {
    const token = this.peek();
    const fullMessage = `SQL Parse Error at position ${token.position}: ${message}`;
    this.logger.error(fullMessage, {sql: this.sql, position: token.position});
    return new Error(fullMessage);
  }
}

export {SQLParser, SQLTokenizer, TokenType, Token};
