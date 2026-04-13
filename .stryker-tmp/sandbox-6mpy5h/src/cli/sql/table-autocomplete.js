/**
 * TableAutocomplete - Autocomplete provider for table names
 *
 * Provides table name suggestions based on the current input context,
 * detecting FROM/INTO/UPDATE clauses to trigger suggestions.
 *
 * Requirements: 9.2, 9.3
 */
// @ts-nocheck


/**
 * SQL contexts that trigger table name autocomplete
 */function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
export const TABLE_CONTEXTS = stryMutAct_9fa48("48227") ? [] : (stryCov_9fa48("48227"), [stryMutAct_9fa48("48228") ? "" : (stryCov_9fa48("48228"), 'FROM'), stryMutAct_9fa48("48229") ? "" : (stryCov_9fa48("48229"), 'INTO'), stryMutAct_9fa48("48230") ? "" : (stryCov_9fa48("48230"), 'UPDATE'), stryMutAct_9fa48("48231") ? "" : (stryCov_9fa48("48231"), 'JOIN'), stryMutAct_9fa48("48232") ? "" : (stryCov_9fa48("48232"), 'TABLE')]);

/**
 * Pattern to detect table context in SQL
 */
const TABLE_CONTEXT_PATTERN = new RegExp(stryMutAct_9fa48("48233") ? `` : (stryCov_9fa48("48233"), `\\b(${TABLE_CONTEXTS.join(stryMutAct_9fa48("48234") ? "" : (stryCov_9fa48("48234"), '|'))})\\s+$`), stryMutAct_9fa48("48235") ? "" : (stryCov_9fa48("48235"), 'i'));

/**
 * TableAutocomplete class for table name suggestions
 */
export class TableAutocomplete {
  /**
   * Creates a new TableAutocomplete
   * @param {Object} cache - Remote cache with table data
   */
  constructor(cache) {
    if (stryMutAct_9fa48("48236")) {
      {}
    } else {
      stryCov_9fa48("48236");
      this.cache = cache;
    }
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
    if (stryMutAct_9fa48("48237")) {
      {}
    } else {
      stryCov_9fa48("48237");
      const {
        word,
        position,
        fullText
      } = context;

      // Get text before cursor
      const beforeCursor = stryMutAct_9fa48("48238") ? fullText : (stryCov_9fa48("48238"), fullText.slice(0, stryMutAct_9fa48("48239") ? position + word.length : (stryCov_9fa48("48239"), position - word.length)));

      // Check if we're in a table context
      if (stryMutAct_9fa48("48242") ? false : stryMutAct_9fa48("48241") ? true : stryMutAct_9fa48("48240") ? this.isTableContext(beforeCursor) : (stryCov_9fa48("48240", "48241", "48242"), !this.isTableContext(beforeCursor))) {
        if (stryMutAct_9fa48("48243")) {
          {}
        } else {
          stryCov_9fa48("48243");
          return stryMutAct_9fa48("48244") ? ["Stryker was here"] : (stryCov_9fa48("48244"), []);
        }
      }

      // Get matching table names
      return this.getTableSuggestions(word);
    }
  }

  /**
   * Check if the cursor is in a table name context
   * @param {string} textBeforeCursor - Text before the current word
   * @return {boolean} True if in table context
   */
  isTableContext(textBeforeCursor) {
    if (stryMutAct_9fa48("48245")) {
      {}
    } else {
      stryCov_9fa48("48245");
      return TABLE_CONTEXT_PATTERN.test(textBeforeCursor);
    }
  }

  /**
   * Get table name suggestions matching a prefix
   * @param {string} prefix - Prefix to match
   * @return {Array<string>} Matching table names
   */
  getTableSuggestions(prefix) {
    if (stryMutAct_9fa48("48246")) {
      {}
    } else {
      stryCov_9fa48("48246");
      if (stryMutAct_9fa48("48249") ? false : stryMutAct_9fa48("48248") ? true : stryMutAct_9fa48("48247") ? this.cache : (stryCov_9fa48("48247", "48248", "48249"), !this.cache)) {
        if (stryMutAct_9fa48("48250")) {
          {}
        } else {
          stryCov_9fa48("48250");
          return stryMutAct_9fa48("48251") ? ["Stryker was here"] : (stryCov_9fa48("48251"), []);
        }
      }
      const tables = this.getTableNames();
      const lowerPrefix = stryMutAct_9fa48("48252") ? (prefix || '').toUpperCase() : (stryCov_9fa48("48252"), (stryMutAct_9fa48("48255") ? prefix && '' : stryMutAct_9fa48("48254") ? false : stryMutAct_9fa48("48253") ? true : (stryCov_9fa48("48253", "48254", "48255"), prefix || (stryMutAct_9fa48("48256") ? "Stryker was here!" : (stryCov_9fa48("48256"), '')))).toLowerCase());
      let matches;
      if (stryMutAct_9fa48("48259") ? false : stryMutAct_9fa48("48258") ? true : stryMutAct_9fa48("48257") ? lowerPrefix : (stryCov_9fa48("48257", "48258", "48259"), !lowerPrefix)) {
        if (stryMutAct_9fa48("48260")) {
          {}
        } else {
          stryCov_9fa48("48260");
          // Return all tables if no prefix, sorted alphabetically
          matches = stryMutAct_9fa48("48261") ? [] : (stryCov_9fa48("48261"), [...tables]);
        }
      } else {
        if (stryMutAct_9fa48("48262")) {
          {}
        } else {
          stryCov_9fa48("48262");
          // Filter tables by prefix
          matches = stryMutAct_9fa48("48263") ? tables : (stryCov_9fa48("48263"), tables.filter(stryMutAct_9fa48("48264") ? () => undefined : (stryCov_9fa48("48264"), name => stryMutAct_9fa48("48266") ? name.toUpperCase().startsWith(lowerPrefix) : stryMutAct_9fa48("48265") ? name.toLowerCase().endsWith(lowerPrefix) : (stryCov_9fa48("48265", "48266"), name.toLowerCase().startsWith(lowerPrefix)))));
        }
      }

      // Sort alphabetically (case-insensitive)
      stryMutAct_9fa48("48267") ? matches : (stryCov_9fa48("48267"), matches.sort((a, b) => {
        if (stryMutAct_9fa48("48268")) {
          {}
        } else {
          stryCov_9fa48("48268");
          const aLower = stryMutAct_9fa48("48269") ? a.toUpperCase() : (stryCov_9fa48("48269"), a.toLowerCase());
          const bLower = stryMutAct_9fa48("48270") ? b.toUpperCase() : (stryCov_9fa48("48270"), b.toLowerCase());

          // Exact match first (only when there's a prefix)
          if (stryMutAct_9fa48("48272") ? false : stryMutAct_9fa48("48271") ? true : (stryCov_9fa48("48271", "48272"), lowerPrefix)) {
            if (stryMutAct_9fa48("48273")) {
              {}
            } else {
              stryCov_9fa48("48273");
              if (stryMutAct_9fa48("48276") ? aLower !== lowerPrefix : stryMutAct_9fa48("48275") ? false : stryMutAct_9fa48("48274") ? true : (stryCov_9fa48("48274", "48275", "48276"), aLower === lowerPrefix)) return stryMutAct_9fa48("48277") ? +1 : (stryCov_9fa48("48277"), -1);
              if (stryMutAct_9fa48("48280") ? bLower !== lowerPrefix : stryMutAct_9fa48("48279") ? false : stryMutAct_9fa48("48278") ? true : (stryCov_9fa48("48278", "48279", "48280"), bLower === lowerPrefix)) return 1;
            }
          }

          // Then alphabetically
          return aLower.localeCompare(bLower);
        }
      }));
      return stryMutAct_9fa48("48281") ? matches : (stryCov_9fa48("48281"), matches.slice(0, 10)); // Limit to 10 suggestions
    }
  }

  /**
   * Get all table names from cache
   * @return {Array<string>} Table names
   */
  getTableNames() {
    if (stryMutAct_9fa48("48282")) {
      {}
    } else {
      stryCov_9fa48("48282");
      if (stryMutAct_9fa48("48285") ? false : stryMutAct_9fa48("48284") ? true : stryMutAct_9fa48("48283") ? this.cache : (stryCov_9fa48("48283", "48284", "48285"), !this.cache)) {
        if (stryMutAct_9fa48("48286")) {
          {}
        } else {
          stryCov_9fa48("48286");
          return stryMutAct_9fa48("48287") ? ["Stryker was here"] : (stryCov_9fa48("48287"), []);
        }
      }
      try {
        if (stryMutAct_9fa48("48288")) {
          {}
        } else {
          stryCov_9fa48("48288");
          const tables = this.cache.getTables();
          return stryMutAct_9fa48("48289") ? tables.map(t => t.table_name) : (stryCov_9fa48("48289"), tables.map(stryMutAct_9fa48("48290") ? () => undefined : (stryCov_9fa48("48290"), t => t.table_name)).filter(Boolean));
        }
      } catch (_error) {
        if (stryMutAct_9fa48("48291")) {
          {}
        } else {
          stryCov_9fa48("48291");
          return stryMutAct_9fa48("48292") ? ["Stryker was here"] : (stryCov_9fa48("48292"), []);
        }
      }
    }
  }

  /**
   * Check if a string is a valid table name
   * @param {string} name - Name to check
   * @return {boolean} True if valid table name exists
   */
  isValidTableName(name) {
    if (stryMutAct_9fa48("48293")) {
      {}
    } else {
      stryCov_9fa48("48293");
      if (stryMutAct_9fa48("48296") ? !name && !this.cache : stryMutAct_9fa48("48295") ? false : stryMutAct_9fa48("48294") ? true : (stryCov_9fa48("48294", "48295", "48296"), (stryMutAct_9fa48("48297") ? name : (stryCov_9fa48("48297"), !name)) || (stryMutAct_9fa48("48298") ? this.cache : (stryCov_9fa48("48298"), !this.cache)))) {
        if (stryMutAct_9fa48("48299")) {
          {}
        } else {
          stryCov_9fa48("48299");
          return stryMutAct_9fa48("48300") ? true : (stryCov_9fa48("48300"), false);
        }
      }
      const tables = this.getTableNames();
      return stryMutAct_9fa48("48301") ? tables.every(t => t.toLowerCase() === name.toLowerCase()) : (stryCov_9fa48("48301"), tables.some(stryMutAct_9fa48("48302") ? () => undefined : (stryCov_9fa48("48302"), t => stryMutAct_9fa48("48305") ? t.toLowerCase() !== name.toLowerCase() : stryMutAct_9fa48("48304") ? false : stryMutAct_9fa48("48303") ? true : (stryCov_9fa48("48303", "48304", "48305"), (stryMutAct_9fa48("48306") ? t.toUpperCase() : (stryCov_9fa48("48306"), t.toLowerCase())) === (stryMutAct_9fa48("48307") ? name.toUpperCase() : (stryCov_9fa48("48307"), name.toLowerCase()))))));
    }
  }

  /**
   * Get the best single suggestion for a prefix
   * @param {string} prefix - Prefix to match
   * @return {string|null} Best matching table name or null
   */
  getBestSuggestion(prefix) {
    if (stryMutAct_9fa48("48308")) {
      {}
    } else {
      stryCov_9fa48("48308");
      const suggestions = this.getTableSuggestions(prefix);
      return (stryMutAct_9fa48("48312") ? suggestions.length <= 0 : stryMutAct_9fa48("48311") ? suggestions.length >= 0 : stryMutAct_9fa48("48310") ? false : stryMutAct_9fa48("48309") ? true : (stryCov_9fa48("48309", "48310", "48311", "48312"), suggestions.length > 0)) ? suggestions[0] : null;
    }
  }

  /**
   * Get completion text for a prefix
   * Returns the remaining characters to complete the table name
   * @param {string} prefix - Current prefix
   * @return {string|null} Completion text or null
   */
  getCompletion(prefix) {
    if (stryMutAct_9fa48("48313")) {
      {}
    } else {
      stryCov_9fa48("48313");
      const best = this.getBestSuggestion(prefix);
      if (stryMutAct_9fa48("48316") ? false : stryMutAct_9fa48("48315") ? true : stryMutAct_9fa48("48314") ? best : (stryCov_9fa48("48314", "48315", "48316"), !best)) {
        if (stryMutAct_9fa48("48317")) {
          {}
        } else {
          stryCov_9fa48("48317");
          return null;
        }
      }

      // Return the full table name (not just the remaining part)
      // This is more useful for autocomplete
      return best;
    }
  }

  /**
   * Detect table context from SQL and return context info
   * @param {string} sql - SQL text
   * @param {number} position - Cursor position
   * @return {Object|null} Context info or null
   */
  detectContext(sql, position) {
    if (stryMutAct_9fa48("48318")) {
      {}
    } else {
      stryCov_9fa48("48318");
      const beforeCursor = stryMutAct_9fa48("48319") ? sql : (stryCov_9fa48("48319"), sql.slice(0, position));

      // Find the last table context keyword
      const match = beforeCursor.match(new RegExp(stryMutAct_9fa48("48320") ? `` : (stryCov_9fa48("48320"), `\\b(${TABLE_CONTEXTS.join(stryMutAct_9fa48("48321") ? "" : (stryCov_9fa48("48321"), '|'))})\\s+(\\w*)$`), stryMutAct_9fa48("48322") ? "" : (stryCov_9fa48("48322"), 'i')));
      if (stryMutAct_9fa48("48325") ? false : stryMutAct_9fa48("48324") ? true : stryMutAct_9fa48("48323") ? match : (stryCov_9fa48("48323", "48324", "48325"), !match)) {
        if (stryMutAct_9fa48("48326")) {
          {}
        } else {
          stryCov_9fa48("48326");
          return null;
        }
      }
      return stryMutAct_9fa48("48327") ? {} : (stryCov_9fa48("48327"), {
        keyword: stryMutAct_9fa48("48328") ? match[1].toLowerCase() : (stryCov_9fa48("48328"), match[1].toUpperCase()),
        prefix: stryMutAct_9fa48("48331") ? match[2] && '' : stryMutAct_9fa48("48330") ? false : stryMutAct_9fa48("48329") ? true : (stryCov_9fa48("48329", "48330", "48331"), match[2] || (stryMutAct_9fa48("48332") ? "Stryker was here!" : (stryCov_9fa48("48332"), ''))),
        keywordPosition: beforeCursor.lastIndexOf(match[1])
      });
    }
  }
}