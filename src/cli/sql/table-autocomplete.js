/**
 * TableAutocomplete - Autocomplete provider for table names
 *
 * Provides table name suggestions based on the current input context,
 * detecting FROM/INTO/UPDATE clauses to trigger suggestions.
 *
 * Requirements: 9.2, 9.3
 */

/**
 * SQL contexts that trigger table name autocomplete
 */
export const TABLE_CONTEXTS = [
  'FROM',
  'INTO',
  'UPDATE',
  'JOIN',
  'TABLE',
];

/**
 * Pattern to detect table context in SQL
 */
const TABLE_CONTEXT_PATTERN = new RegExp(
  `\\b(${TABLE_CONTEXTS.join('|')})\\s+$`,
  'i',
);

/**
 * TableAutocomplete class for table name suggestions
 */
export class TableAutocomplete {
  /**
   * Creates a new TableAutocomplete
   * @param {Object} cache - Remote cache with table data
   */
  constructor(cache) {
    this.cache = cache;
  }

  /**
   * Get autocomplete suggestions based on context
   * Requirements: 9.2, 9.3
   * @param {Object} context - Autocomplete context
   * @param {string} context.word - Current word being typed
   * @param {number} context.position - Cursor position
   * @param {string} context.fullText - Full input text
   * @return {Array<string>} Matching table names
   */
  getSuggestions(context) {
    const {word, position, fullText} = context;

    // Get text before cursor
    const beforeCursor = fullText.slice(0, position - word.length);

    // Check if we're in a table context
    if (!this.isTableContext(beforeCursor)) {
      return [];
    }

    // Get matching table names
    return this.getTableSuggestions(word);
  }

  /**
   * Check if the cursor is in a table name context
   * @param {string} textBeforeCursor - Text before the current word
   * @return {boolean} True if in table context
   */
  isTableContext(textBeforeCursor) {
    return TABLE_CONTEXT_PATTERN.test(textBeforeCursor);
  }

  /**
   * Get table name suggestions matching a prefix
   * @param {string} prefix - Prefix to match
   * @return {Array<string>} Matching table names
   */
  getTableSuggestions(prefix) {
    if (!this.cache) {
      return [];
    }

    const tables = this.getTableNames();
    const lowerPrefix = (prefix || '').toLowerCase();

    let matches;
    if (!lowerPrefix) {
      // Return all tables if no prefix, sorted alphabetically
      matches = [...tables];
    } else {
      // Filter tables by prefix
      matches = tables.filter((name) =>
        name.toLowerCase().startsWith(lowerPrefix),
      );
    }

    // Sort alphabetically (case-insensitive)
    matches.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();

      // Exact match first (only when there's a prefix)
      if (lowerPrefix) {
        if (aLower === lowerPrefix) return -1;
        if (bLower === lowerPrefix) return 1;
      }

      // Then alphabetically
      return aLower.localeCompare(bLower);
    });

    return matches.slice(0, 10); // Limit to 10 suggestions
  }

  /**
   * Get all table names from cache
   * @return {Array<string>} Table names
   */
  getTableNames() {
    if (!this.cache) {
      return [];
    }

    try {
      const tables = this.cache.getTables();
      return tables.map((t) => t.table_name).filter(Boolean);
    } catch (_error) {
      return [];
    }
  }

  /**
   * Check if a string is a valid table name
   * @param {string} name - Name to check
   * @return {boolean} True if valid table name exists
   */
  isValidTableName(name) {
    if (!name || !this.cache) {
      return false;
    }

    const tables = this.getTableNames();
    return tables.some((t) => t.toLowerCase() === name.toLowerCase());
  }

  /**
   * Get the best single suggestion for a prefix
   * @param {string} prefix - Prefix to match
   * @return {string|null} Best matching table name or null
   */
  getBestSuggestion(prefix) {
    const suggestions = this.getTableSuggestions(prefix);
    return suggestions.length > 0 ? suggestions[0] : null;
  }

  /**
   * Get completion text for a prefix
   * Returns the remaining characters to complete the table name
   * @param {string} prefix - Current prefix
   * @return {string|null} Completion text or null
   */
  getCompletion(prefix) {
    const best = this.getBestSuggestion(prefix);
    if (!best) {
      return null;
    }

    // Return the full table name (not just the remaining part)
    // This is more useful for autocomplete
    return best;
  }

  /**
   * Detect table context from SQL and return context info
   * @param {string} sql - SQL text
   * @param {number} position - Cursor position
   * @return {Object|null} Context info or null
   */
  detectContext(sql, position) {
    const beforeCursor = sql.slice(0, position);

    // Find the last table context keyword
    const match = beforeCursor.match(
      new RegExp(`\\b(${TABLE_CONTEXTS.join('|')})\\s+(\\w*)$`, 'i'),
    );

    if (!match) {
      return null;
    }

    return {
      keyword: match[1].toUpperCase(),
      prefix: match[2] || '',
      keywordPosition: beforeCursor.lastIndexOf(match[1]),
    };
  }
}
