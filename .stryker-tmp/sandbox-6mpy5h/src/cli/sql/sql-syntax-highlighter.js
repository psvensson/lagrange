/**
 * SQLSyntaxHighlighter - Syntax highlighting for SQL queries
 *
 * Provides keyword highlighting for SQL statements using
 * blessed-compatible color formatting tags.
 *
 * Requirements: 9.1
 */
// @ts-nocheck


/**
 * SQL keywords organized by category
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
export const SQL_KEYWORDS = stryMutAct_9fa48("48014") ? {} : (stryCov_9fa48("48014"), {
  // DML keywords
  dml: stryMutAct_9fa48("48015") ? [] : (stryCov_9fa48("48015"), [stryMutAct_9fa48("48016") ? "" : (stryCov_9fa48("48016"), 'SELECT'), stryMutAct_9fa48("48017") ? "" : (stryCov_9fa48("48017"), 'FROM'), stryMutAct_9fa48("48018") ? "" : (stryCov_9fa48("48018"), 'WHERE'), stryMutAct_9fa48("48019") ? "" : (stryCov_9fa48("48019"), 'INSERT'), stryMutAct_9fa48("48020") ? "" : (stryCov_9fa48("48020"), 'INTO'), stryMutAct_9fa48("48021") ? "" : (stryCov_9fa48("48021"), 'VALUES'), stryMutAct_9fa48("48022") ? "" : (stryCov_9fa48("48022"), 'UPDATE'), stryMutAct_9fa48("48023") ? "" : (stryCov_9fa48("48023"), 'SET'), stryMutAct_9fa48("48024") ? "" : (stryCov_9fa48("48024"), 'DELETE'), stryMutAct_9fa48("48025") ? "" : (stryCov_9fa48("48025"), 'MERGE'), stryMutAct_9fa48("48026") ? "" : (stryCov_9fa48("48026"), 'UPSERT')]),
  // Clauses
  clauses: stryMutAct_9fa48("48027") ? [] : (stryCov_9fa48("48027"), [stryMutAct_9fa48("48028") ? "" : (stryCov_9fa48("48028"), 'ORDER'), stryMutAct_9fa48("48029") ? "" : (stryCov_9fa48("48029"), 'BY'), stryMutAct_9fa48("48030") ? "" : (stryCov_9fa48("48030"), 'GROUP'), stryMutAct_9fa48("48031") ? "" : (stryCov_9fa48("48031"), 'HAVING'), stryMutAct_9fa48("48032") ? "" : (stryCov_9fa48("48032"), 'LIMIT'), stryMutAct_9fa48("48033") ? "" : (stryCov_9fa48("48033"), 'OFFSET'), stryMutAct_9fa48("48034") ? "" : (stryCov_9fa48("48034"), 'DISTINCT'), stryMutAct_9fa48("48035") ? "" : (stryCov_9fa48("48035"), 'ALL'), stryMutAct_9fa48("48036") ? "" : (stryCov_9fa48("48036"), 'AS'), stryMutAct_9fa48("48037") ? "" : (stryCov_9fa48("48037"), 'CASE'), stryMutAct_9fa48("48038") ? "" : (stryCov_9fa48("48038"), 'WHEN'), stryMutAct_9fa48("48039") ? "" : (stryCov_9fa48("48039"), 'THEN'), stryMutAct_9fa48("48040") ? "" : (stryCov_9fa48("48040"), 'ELSE'), stryMutAct_9fa48("48041") ? "" : (stryCov_9fa48("48041"), 'END')]),
  // Joins
  joins: stryMutAct_9fa48("48042") ? [] : (stryCov_9fa48("48042"), [stryMutAct_9fa48("48043") ? "" : (stryCov_9fa48("48043"), 'JOIN'), stryMutAct_9fa48("48044") ? "" : (stryCov_9fa48("48044"), 'LEFT'), stryMutAct_9fa48("48045") ? "" : (stryCov_9fa48("48045"), 'RIGHT'), stryMutAct_9fa48("48046") ? "" : (stryCov_9fa48("48046"), 'INNER'), stryMutAct_9fa48("48047") ? "" : (stryCov_9fa48("48047"), 'OUTER'), stryMutAct_9fa48("48048") ? "" : (stryCov_9fa48("48048"), 'CROSS'), stryMutAct_9fa48("48049") ? "" : (stryCov_9fa48("48049"), 'FULL'), stryMutAct_9fa48("48050") ? "" : (stryCov_9fa48("48050"), 'NATURAL'), stryMutAct_9fa48("48051") ? "" : (stryCov_9fa48("48051"), 'ON'), stryMutAct_9fa48("48052") ? "" : (stryCov_9fa48("48052"), 'USING')]),
  // Operators
  operators: stryMutAct_9fa48("48053") ? [] : (stryCov_9fa48("48053"), [stryMutAct_9fa48("48054") ? "" : (stryCov_9fa48("48054"), 'AND'), stryMutAct_9fa48("48055") ? "" : (stryCov_9fa48("48055"), 'OR'), stryMutAct_9fa48("48056") ? "" : (stryCov_9fa48("48056"), 'NOT'), stryMutAct_9fa48("48057") ? "" : (stryCov_9fa48("48057"), 'IN'), stryMutAct_9fa48("48058") ? "" : (stryCov_9fa48("48058"), 'LIKE'), stryMutAct_9fa48("48059") ? "" : (stryCov_9fa48("48059"), 'BETWEEN'), stryMutAct_9fa48("48060") ? "" : (stryCov_9fa48("48060"), 'IS'), stryMutAct_9fa48("48061") ? "" : (stryCov_9fa48("48061"), 'EXISTS'), stryMutAct_9fa48("48062") ? "" : (stryCov_9fa48("48062"), 'ANY'), stryMutAct_9fa48("48063") ? "" : (stryCov_9fa48("48063"), 'SOME'), stryMutAct_9fa48("48064") ? "" : (stryCov_9fa48("48064"), 'UNION'), stryMutAct_9fa48("48065") ? "" : (stryCov_9fa48("48065"), 'INTERSECT'), stryMutAct_9fa48("48066") ? "" : (stryCov_9fa48("48066"), 'EXCEPT')]),
  // Sort directions
  sort: stryMutAct_9fa48("48067") ? [] : (stryCov_9fa48("48067"), [stryMutAct_9fa48("48068") ? "" : (stryCov_9fa48("48068"), 'ASC'), stryMutAct_9fa48("48069") ? "" : (stryCov_9fa48("48069"), 'DESC'), stryMutAct_9fa48("48070") ? "" : (stryCov_9fa48("48070"), 'NULLS'), stryMutAct_9fa48("48071") ? "" : (stryCov_9fa48("48071"), 'FIRST'), stryMutAct_9fa48("48072") ? "" : (stryCov_9fa48("48072"), 'LAST')]),
  // Literals
  literals: stryMutAct_9fa48("48073") ? [] : (stryCov_9fa48("48073"), [stryMutAct_9fa48("48074") ? "" : (stryCov_9fa48("48074"), 'NULL'), stryMutAct_9fa48("48075") ? "" : (stryCov_9fa48("48075"), 'TRUE'), stryMutAct_9fa48("48076") ? "" : (stryCov_9fa48("48076"), 'FALSE'), stryMutAct_9fa48("48077") ? "" : (stryCov_9fa48("48077"), 'DEFAULT')]),
  // Aggregate functions
  aggregates: stryMutAct_9fa48("48078") ? [] : (stryCov_9fa48("48078"), [stryMutAct_9fa48("48079") ? "" : (stryCov_9fa48("48079"), 'COUNT'), stryMutAct_9fa48("48080") ? "" : (stryCov_9fa48("48080"), 'SUM'), stryMutAct_9fa48("48081") ? "" : (stryCov_9fa48("48081"), 'AVG'), stryMutAct_9fa48("48082") ? "" : (stryCov_9fa48("48082"), 'MIN'), stryMutAct_9fa48("48083") ? "" : (stryCov_9fa48("48083"), 'MAX')]),
  // DDL keywords (for completeness)
  ddl: stryMutAct_9fa48("48084") ? [] : (stryCov_9fa48("48084"), [stryMutAct_9fa48("48085") ? "" : (stryCov_9fa48("48085"), 'CREATE'), stryMutAct_9fa48("48086") ? "" : (stryCov_9fa48("48086"), 'ALTER'), stryMutAct_9fa48("48087") ? "" : (stryCov_9fa48("48087"), 'DROP'), stryMutAct_9fa48("48088") ? "" : (stryCov_9fa48("48088"), 'TRUNCATE'), stryMutAct_9fa48("48089") ? "" : (stryCov_9fa48("48089"), 'TABLE'), stryMutAct_9fa48("48090") ? "" : (stryCov_9fa48("48090"), 'INDEX'), stryMutAct_9fa48("48091") ? "" : (stryCov_9fa48("48091"), 'VIEW'), stryMutAct_9fa48("48092") ? "" : (stryCov_9fa48("48092"), 'DATABASE'), stryMutAct_9fa48("48093") ? "" : (stryCov_9fa48("48093"), 'SCHEMA')]),
  // Constraints
  constraints: stryMutAct_9fa48("48094") ? [] : (stryCov_9fa48("48094"), [stryMutAct_9fa48("48095") ? "" : (stryCov_9fa48("48095"), 'PRIMARY'), stryMutAct_9fa48("48096") ? "" : (stryCov_9fa48("48096"), 'KEY'), stryMutAct_9fa48("48097") ? "" : (stryCov_9fa48("48097"), 'FOREIGN'), stryMutAct_9fa48("48098") ? "" : (stryCov_9fa48("48098"), 'REFERENCES'), stryMutAct_9fa48("48099") ? "" : (stryCov_9fa48("48099"), 'UNIQUE'), stryMutAct_9fa48("48100") ? "" : (stryCov_9fa48("48100"), 'CHECK'), stryMutAct_9fa48("48101") ? "" : (stryCov_9fa48("48101"), 'CONSTRAINT'), stryMutAct_9fa48("48102") ? "" : (stryCov_9fa48("48102"), 'NOT'), stryMutAct_9fa48("48103") ? "" : (stryCov_9fa48("48103"), 'NULL')]),
  // Live query extension
  live: stryMutAct_9fa48("48104") ? [] : (stryCov_9fa48("48104"), [stryMutAct_9fa48("48105") ? "" : (stryCov_9fa48("48105"), 'LIVE')])
});

/**
 * Color scheme for syntax highlighting
 * Uses blessed-compatible color tags
 */
export const HIGHLIGHT_COLORS = stryMutAct_9fa48("48106") ? {} : (stryCov_9fa48("48106"), {
  keyword: stryMutAct_9fa48("48107") ? "" : (stryCov_9fa48("48107"), 'blue'),
  string: stryMutAct_9fa48("48108") ? "" : (stryCov_9fa48("48108"), 'green'),
  number: stryMutAct_9fa48("48109") ? "" : (stryCov_9fa48("48109"), 'yellow'),
  parameter: stryMutAct_9fa48("48110") ? "" : (stryCov_9fa48("48110"), 'magenta'),
  comment: stryMutAct_9fa48("48111") ? "" : (stryCov_9fa48("48111"), 'gray'),
  function: stryMutAct_9fa48("48112") ? "" : (stryCov_9fa48("48112"), 'cyan')
});

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
    if (stryMutAct_9fa48("48113")) {
      {}
    } else {
      stryCov_9fa48("48113");
      this.colors = stryMutAct_9fa48("48114") ? {} : (stryCov_9fa48("48114"), {
        ...HIGHLIGHT_COLORS,
        ...options.colors
      });

      // Build combined keyword list
      this.keywords = new Set();
      for (const category of Object.values(SQL_KEYWORDS)) {
        if (stryMutAct_9fa48("48115")) {
          {}
        } else {
          stryCov_9fa48("48115");
          for (const keyword of category) {
            if (stryMutAct_9fa48("48116")) {
              {}
            } else {
              stryCov_9fa48("48116");
              this.keywords.add(stryMutAct_9fa48("48117") ? keyword.toLowerCase() : (stryCov_9fa48("48117"), keyword.toUpperCase()));
            }
          }
        }
      }

      // Build keyword pattern for matching
      const allKeywords = Array.from(this.keywords);
      this.keywordPattern = new RegExp(stryMutAct_9fa48("48118") ? `` : (stryCov_9fa48("48118"), `\\b(${allKeywords.join(stryMutAct_9fa48("48119") ? "" : (stryCov_9fa48("48119"), '|'))})\\b`), stryMutAct_9fa48("48120") ? "" : (stryCov_9fa48("48120"), 'gi'));
    }
  }

  /**
   * Highlight SQL text with color formatting tags
   * Requirements: 9.1
   * @param {string} sql - SQL text to highlight
   * @return {string} Highlighted text with blessed color tags
   */
  highlight(sql) {
    if (stryMutAct_9fa48("48121")) {
      {}
    } else {
      stryCov_9fa48("48121");
      if (stryMutAct_9fa48("48124") ? false : stryMutAct_9fa48("48123") ? true : stryMutAct_9fa48("48122") ? sql : (stryCov_9fa48("48122", "48123", "48124"), !sql)) return stryMutAct_9fa48("48125") ? "Stryker was here!" : (stryCov_9fa48("48125"), '');
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
  }

  /**
   * Highlight SQL keywords
   * @param {string} text - Text to process
   * @return {string} Text with highlighted keywords
   */
  highlightKeywords(text) {
    if (stryMutAct_9fa48("48126")) {
      {}
    } else {
      stryCov_9fa48("48126");
      const color = this.colors.keyword;
      return text.replace(this.keywordPattern, (match, keyword, offset, str) => {
        if (stryMutAct_9fa48("48127")) {
          {}
        } else {
          stryCov_9fa48("48127");
          // Don't highlight if inside an already-highlighted section
          const before = stryMutAct_9fa48("48128") ? str : (stryCov_9fa48("48128"), str.slice(0, offset));
          const openTags = (stryMutAct_9fa48("48131") ? before.match(/\{[a-z]+-fg\}/g) && [] : stryMutAct_9fa48("48130") ? false : stryMutAct_9fa48("48129") ? true : (stryCov_9fa48("48129", "48130", "48131"), before.match(stryMutAct_9fa48("48133") ? /\{[^a-z]+-fg\}/g : stryMutAct_9fa48("48132") ? /\{[a-z]-fg\}/g : (stryCov_9fa48("48132", "48133"), /\{[a-z]+-fg\}/g)) || (stryMutAct_9fa48("48134") ? ["Stryker was here"] : (stryCov_9fa48("48134"), [])))).length;
          const closeTags = (stryMutAct_9fa48("48137") ? before.match(/\{\/\}/g) && [] : stryMutAct_9fa48("48136") ? false : stryMutAct_9fa48("48135") ? true : (stryCov_9fa48("48135", "48136", "48137"), before.match(/\{\/\}/g) || (stryMutAct_9fa48("48138") ? ["Stryker was here"] : (stryCov_9fa48("48138"), [])))).length;
          if (stryMutAct_9fa48("48142") ? openTags <= closeTags : stryMutAct_9fa48("48141") ? openTags >= closeTags : stryMutAct_9fa48("48140") ? false : stryMutAct_9fa48("48139") ? true : (stryCov_9fa48("48139", "48140", "48141", "48142"), openTags > closeTags)) {
            if (stryMutAct_9fa48("48143")) {
              {}
            } else {
              stryCov_9fa48("48143");
              return match; // Inside a tag, don't highlight
            }
          }
          return stryMutAct_9fa48("48144") ? `` : (stryCov_9fa48("48144"), `{${color}-fg}${stryMutAct_9fa48("48145") ? keyword.toLowerCase() : (stryCov_9fa48("48145"), keyword.toUpperCase())}{/}`);
        }
      });
    }
  }

  /**
   * Highlight string literals
   * @param {string} text - Text to process
   * @return {string} Text with highlighted strings
   */
  highlightStrings(text) {
    if (stryMutAct_9fa48("48146")) {
      {}
    } else {
      stryCov_9fa48("48146");
      const color = this.colors.string;
      // Match single-quoted strings, handling escaped quotes
      return text.replace(stryMutAct_9fa48("48148") ? /'(?:['\\]|\\.)*'/g : stryMutAct_9fa48("48147") ? /'(?:[^'\\]|\\.)'/g : (stryCov_9fa48("48147", "48148"), /'(?:[^'\\]|\\.)*'/g), match => {
        if (stryMutAct_9fa48("48149")) {
          {}
        } else {
          stryCov_9fa48("48149");
          return stryMutAct_9fa48("48150") ? `` : (stryCov_9fa48("48150"), `{${color}-fg}${match}{/}`);
        }
      });
    }
  }

  /**
   * Highlight numeric literals
   * @param {string} text - Text to process
   * @return {string} Text with highlighted numbers
   */
  highlightNumbers(text) {
    if (stryMutAct_9fa48("48151")) {
      {}
    } else {
      stryCov_9fa48("48151");
      const color = this.colors.number;
      // Match integers and decimals, but not inside already-highlighted sections
      return text.replace(stryMutAct_9fa48("48156") ? /\b(\d+(?:\.\D+)?)\b/g : stryMutAct_9fa48("48155") ? /\b(\d+(?:\.\d)?)\b/g : stryMutAct_9fa48("48154") ? /\b(\d+(?:\.\d+))\b/g : stryMutAct_9fa48("48153") ? /\b(\D+(?:\.\d+)?)\b/g : stryMutAct_9fa48("48152") ? /\b(\d(?:\.\d+)?)\b/g : (stryCov_9fa48("48152", "48153", "48154", "48155", "48156"), /\b(\d+(?:\.\d+)?)\b/g), (match, num, offset, str) => {
        if (stryMutAct_9fa48("48157")) {
          {}
        } else {
          stryCov_9fa48("48157");
          // Check if we're inside a color tag
          const before = stryMutAct_9fa48("48158") ? str : (stryCov_9fa48("48158"), str.slice(0, offset));
          const openTags = (stryMutAct_9fa48("48161") ? before.match(/\{[a-z]+-fg\}/g) && [] : stryMutAct_9fa48("48160") ? false : stryMutAct_9fa48("48159") ? true : (stryCov_9fa48("48159", "48160", "48161"), before.match(stryMutAct_9fa48("48163") ? /\{[^a-z]+-fg\}/g : stryMutAct_9fa48("48162") ? /\{[a-z]-fg\}/g : (stryCov_9fa48("48162", "48163"), /\{[a-z]+-fg\}/g)) || (stryMutAct_9fa48("48164") ? ["Stryker was here"] : (stryCov_9fa48("48164"), [])))).length;
          const closeTags = (stryMutAct_9fa48("48167") ? before.match(/\{\/\}/g) && [] : stryMutAct_9fa48("48166") ? false : stryMutAct_9fa48("48165") ? true : (stryCov_9fa48("48165", "48166", "48167"), before.match(/\{\/\}/g) || (stryMutAct_9fa48("48168") ? ["Stryker was here"] : (stryCov_9fa48("48168"), [])))).length;
          if (stryMutAct_9fa48("48172") ? openTags <= closeTags : stryMutAct_9fa48("48171") ? openTags >= closeTags : stryMutAct_9fa48("48170") ? false : stryMutAct_9fa48("48169") ? true : (stryCov_9fa48("48169", "48170", "48171", "48172"), openTags > closeTags)) {
            if (stryMutAct_9fa48("48173")) {
              {}
            } else {
              stryCov_9fa48("48173");
              return match; // Inside a tag, don't highlight
            }
          }
          return stryMutAct_9fa48("48174") ? `` : (stryCov_9fa48("48174"), `{${color}-fg}${num}{/}`);
        }
      });
    }
  }

  /**
   * Highlight parameter placeholders
   * @param {string} text - Text to process
   * @return {string} Text with highlighted parameters
   */
  highlightParameters(text) {
    if (stryMutAct_9fa48("48175")) {
      {}
    } else {
      stryCov_9fa48("48175");
      const color = this.colors.parameter;
      // Match ? placeholders and $n style parameters
      return text.replace(stryMutAct_9fa48("48177") ? /(\?|\$\D+)/g : stryMutAct_9fa48("48176") ? /(\?|\$\d)/g : (stryCov_9fa48("48176", "48177"), /(\?|\$\d+)/g), (match, param, offset, str) => {
        if (stryMutAct_9fa48("48178")) {
          {}
        } else {
          stryCov_9fa48("48178");
          // Check if we're inside a color tag
          const before = stryMutAct_9fa48("48179") ? str : (stryCov_9fa48("48179"), str.slice(0, offset));
          const openTags = (stryMutAct_9fa48("48182") ? before.match(/\{[a-z]+-fg\}/g) && [] : stryMutAct_9fa48("48181") ? false : stryMutAct_9fa48("48180") ? true : (stryCov_9fa48("48180", "48181", "48182"), before.match(stryMutAct_9fa48("48184") ? /\{[^a-z]+-fg\}/g : stryMutAct_9fa48("48183") ? /\{[a-z]-fg\}/g : (stryCov_9fa48("48183", "48184"), /\{[a-z]+-fg\}/g)) || (stryMutAct_9fa48("48185") ? ["Stryker was here"] : (stryCov_9fa48("48185"), [])))).length;
          const closeTags = (stryMutAct_9fa48("48188") ? before.match(/\{\/\}/g) && [] : stryMutAct_9fa48("48187") ? false : stryMutAct_9fa48("48186") ? true : (stryCov_9fa48("48186", "48187", "48188"), before.match(/\{\/\}/g) || (stryMutAct_9fa48("48189") ? ["Stryker was here"] : (stryCov_9fa48("48189"), [])))).length;
          if (stryMutAct_9fa48("48193") ? openTags <= closeTags : stryMutAct_9fa48("48192") ? openTags >= closeTags : stryMutAct_9fa48("48191") ? false : stryMutAct_9fa48("48190") ? true : (stryCov_9fa48("48190", "48191", "48192", "48193"), openTags > closeTags)) {
            if (stryMutAct_9fa48("48194")) {
              {}
            } else {
              stryCov_9fa48("48194");
              return match;
            }
          }
          return stryMutAct_9fa48("48195") ? `` : (stryCov_9fa48("48195"), `{${color}-fg}${param}{/}`);
        }
      });
    }
  }

  /**
   * Highlight SQL comments
   * @param {string} text - Text to process
   * @return {string} Text with highlighted comments
   */
  highlightComments(text) {
    if (stryMutAct_9fa48("48196")) {
      {}
    } else {
      stryCov_9fa48("48196");
      const color = this.colors.comment;
      // Match /* */ style comments first (can span multiple lines)
      let result = text.replace(stryMutAct_9fa48("48200") ? /\/\*[\s\s]*?\*\//g : stryMutAct_9fa48("48199") ? /\/\*[\S\S]*?\*\//g : stryMutAct_9fa48("48198") ? /\/\*[^\s\S]*?\*\//g : stryMutAct_9fa48("48197") ? /\/\*[\s\S]\*\//g : (stryCov_9fa48("48197", "48198", "48199", "48200"), /\/\*[\s\S]*?\*\//g), match => {
        if (stryMutAct_9fa48("48201")) {
          {}
        } else {
          stryCov_9fa48("48201");
          return stryMutAct_9fa48("48202") ? `` : (stryCov_9fa48("48202"), `{${color}-fg}${match}{/}`);
        }
      });
      // Match -- style comments (to end of line)
      result = result.replace(stryMutAct_9fa48("48204") ? /--[\n]*/g : stryMutAct_9fa48("48203") ? /--[^\n]/g : (stryCov_9fa48("48203", "48204"), /--[^\n]*/g), match => {
        if (stryMutAct_9fa48("48205")) {
          {}
        } else {
          stryCov_9fa48("48205");
          return stryMutAct_9fa48("48206") ? `` : (stryCov_9fa48("48206"), `{${color}-fg}${match}{/}`);
        }
      });
      return result;
    }
  }

  /**
   * Check if a word is a SQL keyword
   * @param {string} word - Word to check
   * @return {boolean} True if word is a keyword
   */
  isKeyword(word) {
    if (stryMutAct_9fa48("48207")) {
      {}
    } else {
      stryCov_9fa48("48207");
      if (stryMutAct_9fa48("48210") ? false : stryMutAct_9fa48("48209") ? true : stryMutAct_9fa48("48208") ? word : (stryCov_9fa48("48208", "48209", "48210"), !word)) return stryMutAct_9fa48("48211") ? true : (stryCov_9fa48("48211"), false);
      return this.keywords.has(stryMutAct_9fa48("48212") ? word.toLowerCase() : (stryCov_9fa48("48212"), word.toUpperCase()));
    }
  }

  /**
   * Get all keywords
   * @return {Array<string>} Array of all keywords
   */
  getKeywords() {
    if (stryMutAct_9fa48("48213")) {
      {}
    } else {
      stryCov_9fa48("48213");
      return Array.from(this.keywords);
    }
  }

  /**
   * Get keywords by category
   * @param {string} category - Category name
   * @return {Array<string>} Keywords in category
   */
  getKeywordsByCategory(category) {
    if (stryMutAct_9fa48("48214")) {
      {}
    } else {
      stryCov_9fa48("48214");
      return stryMutAct_9fa48("48217") ? SQL_KEYWORDS[category] && [] : stryMutAct_9fa48("48216") ? false : stryMutAct_9fa48("48215") ? true : (stryCov_9fa48("48215", "48216", "48217"), SQL_KEYWORDS[category] || (stryMutAct_9fa48("48218") ? ["Stryker was here"] : (stryCov_9fa48("48218"), [])));
    }
  }

  /**
   * Strip color tags from highlighted text
   * @param {string} text - Highlighted text
   * @return {string} Plain text without color tags
   */
  stripHighlighting(text) {
    if (stryMutAct_9fa48("48219")) {
      {}
    } else {
      stryCov_9fa48("48219");
      if (stryMutAct_9fa48("48222") ? false : stryMutAct_9fa48("48221") ? true : stryMutAct_9fa48("48220") ? text : (stryCov_9fa48("48220", "48221", "48222"), !text)) return stryMutAct_9fa48("48223") ? "Stryker was here!" : (stryCov_9fa48("48223"), '');
      return text.replace(stryMutAct_9fa48("48225") ? /\{[^a-z]+-fg\}|\{\/\}/g : stryMutAct_9fa48("48224") ? /\{[a-z]-fg\}|\{\/\}/g : (stryCov_9fa48("48224", "48225"), /\{[a-z]+-fg\}|\{\/\}/g), stryMutAct_9fa48("48226") ? "Stryker was here!" : (stryCov_9fa48("48226"), ''));
    }
  }
}