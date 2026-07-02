const LOCAL_STR_SELECT = 'SELECT';
const LOCAL_STR_FROM = 'FROM';
const LOCAL_STR_WHERE = 'WHERE';
const LOCAL_STR_INSERT = 'INSERT';
const LOCAL_STR_INTO = 'INTO';
const LOCAL_STR_VALUES = 'VALUES';
const LOCAL_STR_UPDATE = 'UPDATE';
const LOCAL_STR_SET = 'SET';
const LOCAL_STR_DELETE = 'DELETE';
const LOCAL_STR_MERGE = 'MERGE';
const LOCAL_STR_UPSERT = 'UPSERT';
const LOCAL_STR_ORDER = 'ORDER';
const LOCAL_STR_BY = 'BY';
const LOCAL_STR_GROUP = 'GROUP';
const LOCAL_STR_HAVING = 'HAVING';
const LOCAL_STR_LIMIT = 'LIMIT';
const LOCAL_STR_OFFSET = 'OFFSET';
const LOCAL_STR_DISTINCT = 'DISTINCT';
const LOCAL_STR_ALL = 'ALL';
const LOCAL_STR_AS = 'AS';
const LOCAL_STR_CASE = 'CASE';
const LOCAL_STR_WHEN = 'WHEN';
const LOCAL_STR_THEN = 'THEN';
const LOCAL_STR_ELSE = 'ELSE';
const LOCAL_STR_END = 'END';
const LOCAL_STR_JOIN = 'JOIN';
const LOCAL_STR_LEFT = 'LEFT';
const LOCAL_STR_RIGHT = 'RIGHT';
const LOCAL_STR_INNER = 'INNER';
const LOCAL_STR_OUTER = 'OUTER';
const LOCAL_STR_CROSS = 'CROSS';
const LOCAL_STR_FULL = 'FULL';
const LOCAL_STR_NATURAL = 'NATURAL';
const LOCAL_STR_ON = 'ON';
const LOCAL_STR_USING = 'USING';
const LOCAL_STR_AND = 'AND';
const LOCAL_STR_OR = 'OR';
const LOCAL_STR_NOT = 'NOT';
const LOCAL_STR_IN = 'IN';
const LOCAL_STR_LIKE = 'LIKE';
const LOCAL_STR_BETWEEN = 'BETWEEN';
const LOCAL_STR_IS = 'IS';
const LOCAL_STR_EXISTS = 'EXISTS';
const LOCAL_STR_ANY = 'ANY';
const LOCAL_STR_SOME = 'SOME';
const LOCAL_STR_UNION = 'UNION';
const LOCAL_STR_INTERSECT = 'INTERSECT';
const LOCAL_STR_EXCEPT = 'EXCEPT';
const LOCAL_STR_ASC = 'ASC';
const LOCAL_STR_DESC = 'DESC';
const LOCAL_STR_NULLS = 'NULLS';
const LOCAL_STR_FIRST = 'FIRST';
const LOCAL_STR_LAST = 'LAST';
const LOCAL_STR_NULL = 'NULL';
const LOCAL_STR_TRUE = 'TRUE';
const LOCAL_STR_FALSE = 'FALSE';
const LOCAL_STR_DEFAULT = 'DEFAULT';
const LOCAL_STR_COUNT = 'COUNT';
const LOCAL_STR_SUM = 'SUM';
const LOCAL_STR_AVG = 'AVG';
const LOCAL_STR_MIN = 'MIN';
const LOCAL_STR_MAX = 'MAX';
const LOCAL_STR_CREATE = 'CREATE';
const LOCAL_STR_ALTER = 'ALTER';
const LOCAL_STR_DROP = 'DROP';
const LOCAL_STR_TRUNCATE = 'TRUNCATE';
const LOCAL_STR_TABLE = 'TABLE';
const LOCAL_STR_INDEX = 'INDEX';
const LOCAL_STR_VIEW = 'VIEW';
const LOCAL_STR_DATABASE = 'DATABASE';
const LOCAL_STR_SCHEMA = 'SCHEMA';
const LOCAL_STR_PRIMARY = 'PRIMARY';
const LOCAL_STR_KEY = 'KEY';
const LOCAL_STR_FOREIGN = 'FOREIGN';
const LOCAL_STR_REFERENCES = 'REFERENCES';
const LOCAL_STR_UNIQUE = 'UNIQUE';
const LOCAL_STR_CHECK = 'CHECK';
const LOCAL_STR_CONSTRAINT = 'CONSTRAINT';
const LOCAL_STR_LIVE = 'LIVE';
const LOCAL_STR_BLUE = 'blue';
const LOCAL_STR_GREEN = 'green';
const LOCAL_STR_YELLOW = 'yellow';
const LOCAL_STR_MAGENTA = 'magenta';
const LOCAL_STR_GRAY = 'gray';
const LOCAL_STR_CYAN = 'cyan';
const LOCAL_STR_PIPE = '|';
const LOCAL_STR_GI = 'gi';

/**
 * SQLSyntaxHighlighter - Syntax highlighting for SQL queries
 *
 * Provides keyword highlighting for SQL statements using
 * blessed-compatible color formatting tags.
 *
 * Requirements: 9.1
 */

/**
 * SQL keywords organized by category
 */
export const SQL_KEYWORDS = {
  // DML keywords
  dml: [
    LOCAL_STR_SELECT, LOCAL_STR_FROM, LOCAL_STR_WHERE, LOCAL_STR_INSERT, LOCAL_STR_INTO,
    LOCAL_STR_VALUES, LOCAL_STR_UPDATE, LOCAL_STR_SET, LOCAL_STR_DELETE, LOCAL_STR_MERGE,
    LOCAL_STR_UPSERT,
  ],
  // Clauses
  clauses: [
    LOCAL_STR_ORDER, LOCAL_STR_BY, LOCAL_STR_GROUP, LOCAL_STR_HAVING, LOCAL_STR_LIMIT,
    LOCAL_STR_OFFSET, LOCAL_STR_DISTINCT, LOCAL_STR_ALL, LOCAL_STR_AS, LOCAL_STR_CASE,
    LOCAL_STR_WHEN, LOCAL_STR_THEN, LOCAL_STR_ELSE, LOCAL_STR_END,
  ],
  // Joins
  joins: [
    LOCAL_STR_JOIN, LOCAL_STR_LEFT, LOCAL_STR_RIGHT, LOCAL_STR_INNER, LOCAL_STR_OUTER,
    LOCAL_STR_CROSS, LOCAL_STR_FULL, LOCAL_STR_NATURAL, LOCAL_STR_ON, LOCAL_STR_USING,
  ],
  // Operators
  operators: [
    LOCAL_STR_AND, LOCAL_STR_OR, LOCAL_STR_NOT, LOCAL_STR_IN, LOCAL_STR_LIKE,
    LOCAL_STR_BETWEEN, LOCAL_STR_IS, LOCAL_STR_EXISTS, LOCAL_STR_ANY, LOCAL_STR_SOME,
    LOCAL_STR_UNION, LOCAL_STR_INTERSECT, LOCAL_STR_EXCEPT,
  ],
  // Sort directions
  sort: [LOCAL_STR_ASC, LOCAL_STR_DESC, LOCAL_STR_NULLS, LOCAL_STR_FIRST, LOCAL_STR_LAST],
  // Literals
  literals: [LOCAL_STR_NULL, LOCAL_STR_TRUE, LOCAL_STR_FALSE, LOCAL_STR_DEFAULT],
  // Aggregate functions
  aggregates: [LOCAL_STR_COUNT, LOCAL_STR_SUM, LOCAL_STR_AVG, LOCAL_STR_MIN, LOCAL_STR_MAX],
  // DDL keywords (for completeness)
  ddl: [
    LOCAL_STR_CREATE, LOCAL_STR_ALTER, LOCAL_STR_DROP, LOCAL_STR_TRUNCATE, LOCAL_STR_TABLE,
    LOCAL_STR_INDEX, LOCAL_STR_VIEW, LOCAL_STR_DATABASE, LOCAL_STR_SCHEMA,
  ],
  // Constraints
  constraints: [
    LOCAL_STR_PRIMARY, LOCAL_STR_KEY, LOCAL_STR_FOREIGN, LOCAL_STR_REFERENCES, LOCAL_STR_UNIQUE,
    LOCAL_STR_CHECK, LOCAL_STR_CONSTRAINT, LOCAL_STR_NOT, LOCAL_STR_NULL,
  ],
  // Live query extension
  live: [LOCAL_STR_LIVE],
};

/**
 * Color scheme for syntax highlighting
 * Uses blessed-compatible color tags
 */
export const HIGHLIGHT_COLORS = {
  keyword: LOCAL_STR_BLUE,
  string: LOCAL_STR_GREEN,
  number: LOCAL_STR_YELLOW,
  parameter: LOCAL_STR_MAGENTA,
  comment: LOCAL_STR_GRAY,
  function: LOCAL_STR_CYAN,
};

/**
 * SQLSyntaxHighlighter class for SQL keyword highlighting
 */
export class SQLSyntaxHighlighter {
  /**
   * Creates a new SQLSyntaxHighlighter
   * @param {Object} options - Highlighter options
   * @param {Object} [options.colors] - Custom color scheme
   */
  constructor(options = {}) {
    this.colors = {...HIGHLIGHT_COLORS, ...options.colors};

    // Build combined keyword list
    this.keywords = new Set();
    for (const category of Object.values(SQL_KEYWORDS)) {
      for (const keyword of category) {
        this.keywords.add(keyword.toUpperCase());
      }
    }

    // Build keyword pattern for matching
    const allKeywords = Array.from(this.keywords);
    this.keywordPattern = new RegExp(
      `\\b(${allKeywords.join(LOCAL_STR_PIPE)})\\b`,
      LOCAL_STR_GI,
    );
  }

  /**
   * Highlight SQL text with color formatting tags
   * Requirements: 9.1
   * @param {string} sql - SQL text to highlight
   * @return {string} Highlighted text with blessed color tags
   */
  highlight(sql) {
    if (!sql) return '';

    let result = sql;

    // Highlight comments first (they should not be further processed)
    result = this.highlightComments(result);

    // Highlight strings (single quotes) - do this early to avoid
    // highlighting keywords inside strings
    result = this.highlightStrings(result);

    // Highlight keywords
    result = this.highlightKeywords(result);

    // Highlight parameters (?) and $n - before numbers to avoid conflicts
    result = this.highlightParameters(result);

    // Highlight numbers
    result = this.highlightNumbers(result);

    return result;
  }

  /**
   * Highlight SQL keywords
   * @param {string} text - Text to process
   * @return {string} Text with highlighted keywords
   */
  highlightKeywords(text) {
    const color = this.colors.keyword;
    return text.replace(this.keywordPattern, (match, keyword, offset, str) => {
      // Don't highlight if inside an already-highlighted section
      const before = str.slice(0, offset);
      const openTags = (before.match(/\{[a-z]+-fg\}/g) || []).length;
      const closeTags = (before.match(/\{\/\}/g) || []).length;
      if (openTags > closeTags) {
        return match; // Inside a tag, don't highlight
      }
      return `{${color}-fg}${keyword.toUpperCase()}{/}`;
    });
  }

  /**
   * Highlight string literals
   * @param {string} text - Text to process
   * @return {string} Text with highlighted strings
   */
  highlightStrings(text) {
    const color = this.colors.string;
    // Match single-quoted strings, handling escaped quotes
    return text.replace(/'(?:[^'\\]|\\.)*'/g, (match) => {
      return `{${color}-fg}${match}{/}`;
    });
  }

  /**
   * Highlight numeric literals
   * @param {string} text - Text to process
   * @return {string} Text with highlighted numbers
   */
  highlightNumbers(text) {
    const color = this.colors.number;
    // Match integers and decimals, but not inside already-highlighted sections
    return text.replace(/\b(\d+(?:\.\d+)?)\b/g, (match, num, offset, str) => {
      // Check if we're inside a color tag
      const before = str.slice(0, offset);
      const openTags = (before.match(/\{[a-z]+-fg\}/g) || []).length;
      const closeTags = (before.match(/\{\/\}/g) || []).length;
      if (openTags > closeTags) {
        return match; // Inside a tag, don't highlight
      }
      return `{${color}-fg}${num}{/}`;
    });
  }

  /**
   * Highlight parameter placeholders
   * @param {string} text - Text to process
   * @return {string} Text with highlighted parameters
   */
  highlightParameters(text) {
    const color = this.colors.parameter;
    // Match ? placeholders and $n style parameters
    return text.replace(/(\?|\$\d+)/g, (match, param, offset, str) => {
      // Check if we're inside a color tag
      const before = str.slice(0, offset);
      const openTags = (before.match(/\{[a-z]+-fg\}/g) || []).length;
      const closeTags = (before.match(/\{\/\}/g) || []).length;
      if (openTags > closeTags) {
        return match;
      }
      return `{${color}-fg}${param}{/}`;
    });
  }

  /**
   * Highlight SQL comments
   * @param {string} text - Text to process
   * @return {string} Text with highlighted comments
   */
  highlightComments(text) {
    const color = this.colors.comment;
    // Match /* */ style comments first (can span multiple lines)
    let result = text.replace(/\/\*[\s\S]*?\*\//g, (match) => {
      return `{${color}-fg}${match}{/}`;
    });
    // Match -- style comments (to end of line)
    result = result.replace(/--[^\n]*/g, (match) => {
      return `{${color}-fg}${match}{/}`;
    });
    return result;
  }

  /**
   * Check if a word is a SQL keyword
   * @param {string} word - Word to check
   * @return {boolean} True if word is a keyword
   */
  isKeyword(word) {
    if (!word) return false;
    return this.keywords.has(word.toUpperCase());
  }

  /**
   * Get all keywords
   * @return {Array<string>} Array of all keywords
   */
  getKeywords() {
    return Array.from(this.keywords);
  }

  /**
   * Get keywords by category
   * @param {string} category - Category name
   * @return {Array<string>} Keywords in category
   */
  getKeywordsByCategory(category) {
    return SQL_KEYWORDS[category] || [];
  }

  /**
   * Strip color tags from highlighted text
   * @param {string} text - Highlighted text
   * @return {string} Plain text without color tags
   */
  stripHighlighting(text) {
    if (!text) return '';
    return text.replace(/\{[a-z]+-fg\}|\{\/\}/g, '');
  }
}
