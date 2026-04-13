/**
 * ContextsView - Displays function execution contexts with filtering and highlighting
 *
 * Columns: context_id, context_type, name, created_at, updated_at
 * Supports filtering by type and name pattern, highlighting recently updated contexts.
 *
 * Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6
 */
// @ts-nocheck
function stryNS_9fa48() {
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
import { BaseView, ROW_STATUS } from '../core/base-view.js';

/**
 * Context types
 */
export const CONTEXT_TYPES = stryMutAct_9fa48("48971") ? [] : (stryCov_9fa48("48971"), [stryMutAct_9fa48("48972") ? "" : (stryCov_9fa48("48972"), 'function'), stryMutAct_9fa48("48973") ? "" : (stryCov_9fa48("48973"), 'service'), stryMutAct_9fa48("48974") ? "" : (stryCov_9fa48("48974"), 'user')]);

/**
 * Threshold for "recently updated" highlighting (5 minutes in milliseconds)
 */
export const RECENT_UPDATE_THRESHOLD_MS = stryMutAct_9fa48("48975") ? 5 * 60 / 1000 : (stryCov_9fa48("48975"), (stryMutAct_9fa48("48976") ? 5 / 60 : (stryCov_9fa48("48976"), 5 * 60)) * 1000);

/**
 * ContextsView displays function execution contexts
 */
export class ContextsView extends BaseView {
  /**
   * Creates a new ContextsView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {number} [options.recentUpdateThreshold] - Threshold for recent update highlighting
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("48977")) {
      {}
    } else {
      stryCov_9fa48("48977");
      super(options);
      this.cache = stryMutAct_9fa48("48980") ? options.cache && null : stryMutAct_9fa48("48979") ? false : stryMutAct_9fa48("48978") ? true : (stryCov_9fa48("48978", "48979", "48980"), options.cache || null);
      this.viewName = stryMutAct_9fa48("48981") ? "" : (stryCov_9fa48("48981"), 'contexts');

      // Filter state
      // Requirements: 31.2, 31.5
      this.typeFilter = null;
      this.namePatternFilter = null;

      // Recent update threshold (configurable for testing)
      this.recentUpdateThreshold = stryMutAct_9fa48("48984") ? options.recentUpdateThreshold && RECENT_UPDATE_THRESHOLD_MS : stryMutAct_9fa48("48983") ? false : stryMutAct_9fa48("48982") ? true : (stryCov_9fa48("48982", "48983", "48984"), options.recentUpdateThreshold || RECENT_UPDATE_THRESHOLD_MS);

      // Default sort by updated_at descending (most recent first)
      this.sortColumn = stryMutAct_9fa48("48985") ? "" : (stryCov_9fa48("48985"), 'updated_at');
      this.sortDirection = stryMutAct_9fa48("48986") ? "" : (stryCov_9fa48("48986"), 'desc');
    }
  }

  /**
   * Get column definitions for the contexts view
   * Requirements: 31.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    if (stryMutAct_9fa48("48987")) {
      {}
    } else {
      stryCov_9fa48("48987");
      return stryMutAct_9fa48("48988") ? [] : (stryCov_9fa48("48988"), [stryMutAct_9fa48("48989") ? {} : (stryCov_9fa48("48989"), {
        key: stryMutAct_9fa48("48990") ? "" : (stryCov_9fa48("48990"), 'context_id'),
        label: stryMutAct_9fa48("48991") ? "" : (stryCov_9fa48("48991"), 'Context ID'),
        width: 20
      }), stryMutAct_9fa48("48992") ? {} : (stryCov_9fa48("48992"), {
        key: stryMutAct_9fa48("48993") ? "" : (stryCov_9fa48("48993"), 'context_type'),
        label: stryMutAct_9fa48("48994") ? "" : (stryCov_9fa48("48994"), 'Type'),
        width: 12
      }), stryMutAct_9fa48("48995") ? {} : (stryCov_9fa48("48995"), {
        key: stryMutAct_9fa48("48996") ? "" : (stryCov_9fa48("48996"), 'name'),
        label: stryMutAct_9fa48("48997") ? "" : (stryCov_9fa48("48997"), 'Name'),
        width: 30
      }), stryMutAct_9fa48("48998") ? {} : (stryCov_9fa48("48998"), {
        key: stryMutAct_9fa48("48999") ? "" : (stryCov_9fa48("48999"), 'created_at'),
        label: stryMutAct_9fa48("49000") ? "" : (stryCov_9fa48("49000"), 'Created At'),
        width: 20
      }), stryMutAct_9fa48("49001") ? {} : (stryCov_9fa48("49001"), {
        key: stryMutAct_9fa48("49002") ? "" : (stryCov_9fa48("49002"), 'updated_at'),
        label: stryMutAct_9fa48("49003") ? "" : (stryCov_9fa48("49003"), 'Updated At'),
        width: 20
      })]);
    }
  }

  /**
   * Format a context record into a row array
   * Requirements: 31.1
   * @param {Object} context - Context record
   * @return {Array<string>} Row values
   */
  formatRow(context) {
    if (stryMutAct_9fa48("49004")) {
      {}
    } else {
      stryCov_9fa48("49004");
      return stryMutAct_9fa48("49005") ? [] : (stryCov_9fa48("49005"), [stryMutAct_9fa48("49008") ? context.context_id && 'N/A' : stryMutAct_9fa48("49007") ? false : stryMutAct_9fa48("49006") ? true : (stryCov_9fa48("49006", "49007", "49008"), context.context_id || (stryMutAct_9fa48("49009") ? "" : (stryCov_9fa48("49009"), 'N/A'))), stryMutAct_9fa48("49012") ? context.context_type && 'N/A' : stryMutAct_9fa48("49011") ? false : stryMutAct_9fa48("49010") ? true : (stryCov_9fa48("49010", "49011", "49012"), context.context_type || (stryMutAct_9fa48("49013") ? "" : (stryCov_9fa48("49013"), 'N/A'))), this.truncateName(context.name), this.formatTimestamp(context.created_at), this.formatTimestamp(context.updated_at)]);
    }
  }

  /**
   * Truncate name for display in table
   * @param {string|null|undefined} name - Context name
   * @param {number} maxLength - Maximum length
   * @return {string} Truncated name
   */
  truncateName(name, maxLength = 40) {
    if (stryMutAct_9fa48("49014")) {
      {}
    } else {
      stryCov_9fa48("49014");
      if (stryMutAct_9fa48("49017") ? false : stryMutAct_9fa48("49016") ? true : stryMutAct_9fa48("49015") ? name : (stryCov_9fa48("49015", "49016", "49017"), !name)) {
        if (stryMutAct_9fa48("49018")) {
          {}
        } else {
          stryCov_9fa48("49018");
          return stryMutAct_9fa48("49019") ? "" : (stryCov_9fa48("49019"), 'N/A');
        }
      }
      const str = String(name);
      if (stryMutAct_9fa48("49023") ? str.length > maxLength : stryMutAct_9fa48("49022") ? str.length < maxLength : stryMutAct_9fa48("49021") ? false : stryMutAct_9fa48("49020") ? true : (stryCov_9fa48("49020", "49021", "49022", "49023"), str.length <= maxLength)) {
        if (stryMutAct_9fa48("49024")) {
          {}
        } else {
          stryCov_9fa48("49024");
          return str;
        }
      }
      return (stryMutAct_9fa48("49025") ? str : (stryCov_9fa48("49025"), str.substring(0, stryMutAct_9fa48("49026") ? maxLength + 3 : (stryCov_9fa48("49026"), maxLength - 3)))) + (stryMutAct_9fa48("49027") ? "" : (stryCov_9fa48("49027"), '...'));
    }
  }

  /**
   * Format timestamp for display
   * @param {number|string|null|undefined} timestamp - Timestamp value
   * @return {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (stryMutAct_9fa48("49028")) {
      {}
    } else {
      stryCov_9fa48("49028");
      if (stryMutAct_9fa48("49031") ? timestamp === null && timestamp === undefined : stryMutAct_9fa48("49030") ? false : stryMutAct_9fa48("49029") ? true : (stryCov_9fa48("49029", "49030", "49031"), (stryMutAct_9fa48("49033") ? timestamp !== null : stryMutAct_9fa48("49032") ? false : (stryCov_9fa48("49032", "49033"), timestamp === null)) || (stryMutAct_9fa48("49035") ? timestamp !== undefined : stryMutAct_9fa48("49034") ? false : (stryCov_9fa48("49034", "49035"), timestamp === undefined)))) {
        if (stryMutAct_9fa48("49036")) {
          {}
        } else {
          stryCov_9fa48("49036");
          return stryMutAct_9fa48("49037") ? "" : (stryCov_9fa48("49037"), 'N/A');
        }
      }
      try {
        if (stryMutAct_9fa48("49038")) {
          {}
        } else {
          stryCov_9fa48("49038");
          const date = new Date(timestamp);
          if (stryMutAct_9fa48("49040") ? false : stryMutAct_9fa48("49039") ? true : (stryCov_9fa48("49039", "49040"), isNaN(date.getTime()))) {
            if (stryMutAct_9fa48("49041")) {
              {}
            } else {
              stryCov_9fa48("49041");
              return stryMutAct_9fa48("49042") ? "" : (stryCov_9fa48("49042"), 'N/A');
            }
          }
          return stryMutAct_9fa48("49043") ? date.toISOString().replace('T', ' ') : (stryCov_9fa48("49043"), date.toISOString().replace(stryMutAct_9fa48("49044") ? "" : (stryCov_9fa48("49044"), 'T'), stryMutAct_9fa48("49045") ? "" : (stryCov_9fa48("49045"), ' ')).substring(0, 19));
        }
      } catch {
        if (stryMutAct_9fa48("49046")) {
          {}
        } else {
          stryCov_9fa48("49046");
          return stryMutAct_9fa48("49047") ? "" : (stryCov_9fa48("49047"), 'N/A');
        }
      }
    }
  }

  /**
   * Get the row status for styling
   * Requirements: 31.4
   * @param {Object} context - Context record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(context) {
    if (stryMutAct_9fa48("49048")) {
      {}
    } else {
      stryCov_9fa48("49048");
      // Highlight recently updated contexts
      if (stryMutAct_9fa48("49050") ? false : stryMutAct_9fa48("49049") ? true : (stryCov_9fa48("49049", "49050"), this.isRecentlyUpdated(context))) {
        if (stryMutAct_9fa48("49051")) {
          {}
        } else {
          stryCov_9fa48("49051");
          return ROW_STATUS.WARNING;
        }
      }
      return ROW_STATUS.NORMAL;
    }
  }

  /**
   * Check if a context has been recently updated
   * Requirements: 31.4
   * @param {Object} context - Context record
   * @param {number} [referenceTime] - Reference time for comparison (defaults to now)
   * @return {boolean} True if recently updated
   */
  isRecentlyUpdated(context, referenceTime = Date.now()) {
    if (stryMutAct_9fa48("49052")) {
      {}
    } else {
      stryCov_9fa48("49052");
      if (stryMutAct_9fa48("49055") ? false : stryMutAct_9fa48("49054") ? true : stryMutAct_9fa48("49053") ? context.updated_at : (stryCov_9fa48("49053", "49054", "49055"), !context.updated_at)) {
        if (stryMutAct_9fa48("49056")) {
          {}
        } else {
          stryCov_9fa48("49056");
          return stryMutAct_9fa48("49057") ? true : (stryCov_9fa48("49057"), false);
        }
      }
      const updatedAt = this.parseTimestamp(context.updated_at);
      if (stryMutAct_9fa48("49060") ? updatedAt !== null : stryMutAct_9fa48("49059") ? false : stryMutAct_9fa48("49058") ? true : (stryCov_9fa48("49058", "49059", "49060"), updatedAt === null)) {
        if (stryMutAct_9fa48("49061")) {
          {}
        } else {
          stryCov_9fa48("49061");
          return stryMutAct_9fa48("49062") ? true : (stryCov_9fa48("49062"), false);
        }
      }
      const timeSinceUpdate = stryMutAct_9fa48("49063") ? referenceTime + updatedAt : (stryCov_9fa48("49063"), referenceTime - updatedAt);
      return stryMutAct_9fa48("49066") ? timeSinceUpdate >= 0 || timeSinceUpdate <= this.recentUpdateThreshold : stryMutAct_9fa48("49065") ? false : stryMutAct_9fa48("49064") ? true : (stryCov_9fa48("49064", "49065", "49066"), (stryMutAct_9fa48("49069") ? timeSinceUpdate < 0 : stryMutAct_9fa48("49068") ? timeSinceUpdate > 0 : stryMutAct_9fa48("49067") ? true : (stryCov_9fa48("49067", "49068", "49069"), timeSinceUpdate >= 0)) && (stryMutAct_9fa48("49072") ? timeSinceUpdate > this.recentUpdateThreshold : stryMutAct_9fa48("49071") ? timeSinceUpdate < this.recentUpdateThreshold : stryMutAct_9fa48("49070") ? true : (stryCov_9fa48("49070", "49071", "49072"), timeSinceUpdate <= this.recentUpdateThreshold)));
    }
  }

  /**
   * Parse timestamp to numeric value
   * @param {number|string|null|undefined} timestamp - Timestamp value
   * @return {number|null} Numeric timestamp or null
   */
  parseTimestamp(timestamp) {
    if (stryMutAct_9fa48("49073")) {
      {}
    } else {
      stryCov_9fa48("49073");
      if (stryMutAct_9fa48("49076") ? timestamp === null && timestamp === undefined : stryMutAct_9fa48("49075") ? false : stryMutAct_9fa48("49074") ? true : (stryCov_9fa48("49074", "49075", "49076"), (stryMutAct_9fa48("49078") ? timestamp !== null : stryMutAct_9fa48("49077") ? false : (stryCov_9fa48("49077", "49078"), timestamp === null)) || (stryMutAct_9fa48("49080") ? timestamp !== undefined : stryMutAct_9fa48("49079") ? false : (stryCov_9fa48("49079", "49080"), timestamp === undefined)))) {
        if (stryMutAct_9fa48("49081")) {
          {}
        } else {
          stryCov_9fa48("49081");
          return null;
        }
      }
      if (stryMutAct_9fa48("49084") ? typeof timestamp !== 'number' : stryMutAct_9fa48("49083") ? false : stryMutAct_9fa48("49082") ? true : (stryCov_9fa48("49082", "49083", "49084"), typeof timestamp === (stryMutAct_9fa48("49085") ? "" : (stryCov_9fa48("49085"), 'number')))) {
        if (stryMutAct_9fa48("49086")) {
          {}
        } else {
          stryCov_9fa48("49086");
          return timestamp;
        }
      }
      const parsed = Date.parse(timestamp);
      return isNaN(parsed) ? null : parsed;
    }
  }

  /**
   * Get the unique key for a context entry
   * @param {Object} context - Context record
   * @return {string} Unique key (context_id)
   */
  getItemKey(context) {
    if (stryMutAct_9fa48("49087")) {
      {}
    } else {
      stryCov_9fa48("49087");
      return stryMutAct_9fa48("49090") ? context.context_id && '' : stryMutAct_9fa48("49089") ? false : stryMutAct_9fa48("49088") ? true : (stryCov_9fa48("49088", "49089", "49090"), context.context_id || (stryMutAct_9fa48("49091") ? "Stryker was here!" : (stryCov_9fa48("49091"), '')));
    }
  }

  /**
   * Set type filter
   * Requirements: 31.2
   * @param {string|null} type - Context type to filter by
   */
  setTypeFilter(type) {
    if (stryMutAct_9fa48("49092")) {
      {}
    } else {
      stryCov_9fa48("49092");
      this.typeFilter = type;
      this.updateFilteredData();
    }
  }

  /**
   * Clear type filter
   */
  clearTypeFilter() {
    if (stryMutAct_9fa48("49093")) {
      {}
    } else {
      stryCov_9fa48("49093");
      this.typeFilter = null;
      this.updateFilteredData();
    }
  }

  /**
   * Set name pattern filter
   * Requirements: 31.5
   * @param {string|null} pattern - Name pattern to filter by
   */
  setNamePatternFilter(pattern) {
    if (stryMutAct_9fa48("49094")) {
      {}
    } else {
      stryCov_9fa48("49094");
      this.namePatternFilter = pattern;
      this.updateFilteredData();
    }
  }

  /**
   * Clear name pattern filter
   */
  clearNamePatternFilter() {
    if (stryMutAct_9fa48("49095")) {
      {}
    } else {
      stryCov_9fa48("49095");
      this.namePatternFilter = null;
      this.updateFilteredData();
    }
  }

  /**
   * Clear all filters
   */
  clearAllFilters() {
    if (stryMutAct_9fa48("49096")) {
      {}
    } else {
      stryCov_9fa48("49096");
      this.typeFilter = null;
      this.namePatternFilter = null;
      this.filter = stryMutAct_9fa48("49097") ? "Stryker was here!" : (stryCov_9fa48("49097"), '');
      this.updateFilteredData();
    }
  }

  /**
   * Apply all filters to data
   * Requirements: 31.2, 31.5
   * @param {Array} data - Data to filter
   * @return {Array} Filtered data
   */
  applyFilter(data) {
    if (stryMutAct_9fa48("49098")) {
      {}
    } else {
      stryCov_9fa48("49098");
      let result = data;

      // Apply type filter
      // Requirements: 31.2
      if (stryMutAct_9fa48("49100") ? false : stryMutAct_9fa48("49099") ? true : (stryCov_9fa48("49099", "49100"), this.typeFilter)) {
        if (stryMutAct_9fa48("49101")) {
          {}
        } else {
          stryCov_9fa48("49101");
          result = stryMutAct_9fa48("49102") ? result : (stryCov_9fa48("49102"), result.filter(stryMutAct_9fa48("49103") ? () => undefined : (stryCov_9fa48("49103"), context => stryMutAct_9fa48("49106") ? (context.context_type || '').toLowerCase() !== this.typeFilter.toLowerCase() : stryMutAct_9fa48("49105") ? false : stryMutAct_9fa48("49104") ? true : (stryCov_9fa48("49104", "49105", "49106"), (stryMutAct_9fa48("49107") ? (context.context_type || '').toUpperCase() : (stryCov_9fa48("49107"), (stryMutAct_9fa48("49110") ? context.context_type && '' : stryMutAct_9fa48("49109") ? false : stryMutAct_9fa48("49108") ? true : (stryCov_9fa48("49108", "49109", "49110"), context.context_type || (stryMutAct_9fa48("49111") ? "Stryker was here!" : (stryCov_9fa48("49111"), '')))).toLowerCase())) === (stryMutAct_9fa48("49112") ? this.typeFilter.toUpperCase() : (stryCov_9fa48("49112"), this.typeFilter.toLowerCase()))))));
        }
      }

      // Apply name pattern filter
      // Requirements: 31.5
      if (stryMutAct_9fa48("49114") ? false : stryMutAct_9fa48("49113") ? true : (stryCov_9fa48("49113", "49114"), this.namePatternFilter)) {
        if (stryMutAct_9fa48("49115")) {
          {}
        } else {
          stryCov_9fa48("49115");
          try {
            if (stryMutAct_9fa48("49116")) {
              {}
            } else {
              stryCov_9fa48("49116");
              const pattern = new RegExp(this.escapeRegex(this.namePatternFilter), stryMutAct_9fa48("49117") ? "" : (stryCov_9fa48("49117"), 'i'));
              result = stryMutAct_9fa48("49118") ? result : (stryCov_9fa48("49118"), result.filter(stryMutAct_9fa48("49119") ? () => undefined : (stryCov_9fa48("49119"), context => pattern.test(stryMutAct_9fa48("49122") ? context.name && '' : stryMutAct_9fa48("49121") ? false : stryMutAct_9fa48("49120") ? true : (stryCov_9fa48("49120", "49121", "49122"), context.name || (stryMutAct_9fa48("49123") ? "Stryker was here!" : (stryCov_9fa48("49123"), '')))))));
            }
          } catch {
            if (stryMutAct_9fa48("49124")) {
              {}
            } else {
              stryCov_9fa48("49124");
              // If regex is invalid, fall back to simple includes
              const lowerPattern = stryMutAct_9fa48("49125") ? this.namePatternFilter.toUpperCase() : (stryCov_9fa48("49125"), this.namePatternFilter.toLowerCase());
              result = stryMutAct_9fa48("49126") ? result : (stryCov_9fa48("49126"), result.filter(stryMutAct_9fa48("49127") ? () => undefined : (stryCov_9fa48("49127"), context => stryMutAct_9fa48("49128") ? (context.name || '').toUpperCase().includes(lowerPattern) : (stryCov_9fa48("49128"), (stryMutAct_9fa48("49131") ? context.name && '' : stryMutAct_9fa48("49130") ? false : stryMutAct_9fa48("49129") ? true : (stryCov_9fa48("49129", "49130", "49131"), context.name || (stryMutAct_9fa48("49132") ? "Stryker was here!" : (stryCov_9fa48("49132"), '')))).toLowerCase().includes(lowerPattern)))));
            }
          }
        }
      }

      // Apply general text filter (from base class)
      if (stryMutAct_9fa48("49135") ? this.filter || this.filter.trim() !== '' : stryMutAct_9fa48("49134") ? false : stryMutAct_9fa48("49133") ? true : (stryCov_9fa48("49133", "49134", "49135"), this.filter && (stryMutAct_9fa48("49137") ? this.filter.trim() === '' : stryMutAct_9fa48("49136") ? true : (stryCov_9fa48("49136", "49137"), (stryMutAct_9fa48("49138") ? this.filter : (stryCov_9fa48("49138"), this.filter.trim())) !== (stryMutAct_9fa48("49139") ? "Stryker was here!" : (stryCov_9fa48("49139"), '')))))) {
        if (stryMutAct_9fa48("49140")) {
          {}
        } else {
          stryCov_9fa48("49140");
          const lowerFilter = stryMutAct_9fa48("49141") ? this.filter.toUpperCase() : (stryCov_9fa48("49141"), this.filter.toLowerCase());
          result = stryMutAct_9fa48("49142") ? result : (stryCov_9fa48("49142"), result.filter(item => {
            if (stryMutAct_9fa48("49143")) {
              {}
            } else {
              stryCov_9fa48("49143");
              const values = Object.values(item);
              return stryMutAct_9fa48("49144") ? values.every(value => {
                if (value === null || value === undefined) return false;
                return String(value).toLowerCase().includes(lowerFilter);
              }) : (stryCov_9fa48("49144"), values.some(value => {
                if (stryMutAct_9fa48("49145")) {
                  {}
                } else {
                  stryCov_9fa48("49145");
                  if (stryMutAct_9fa48("49148") ? value === null && value === undefined : stryMutAct_9fa48("49147") ? false : stryMutAct_9fa48("49146") ? true : (stryCov_9fa48("49146", "49147", "49148"), (stryMutAct_9fa48("49150") ? value !== null : stryMutAct_9fa48("49149") ? false : (stryCov_9fa48("49149", "49150"), value === null)) || (stryMutAct_9fa48("49152") ? value !== undefined : stryMutAct_9fa48("49151") ? false : (stryCov_9fa48("49151", "49152"), value === undefined)))) return stryMutAct_9fa48("49153") ? true : (stryCov_9fa48("49153"), false);
                  return stryMutAct_9fa48("49154") ? String(value).toUpperCase().includes(lowerFilter) : (stryCov_9fa48("49154"), String(value).toLowerCase().includes(lowerFilter));
                }
              }));
            }
          }));
        }
      }
      return result;
    }
  }

  /**
   * Escape special regex characters
   * @param {string} str - String to escape
   * @return {string} Escaped string
   */
  escapeRegex(str) {
    if (stryMutAct_9fa48("49155")) {
      {}
    } else {
      stryCov_9fa48("49155");
      return str.replace(stryMutAct_9fa48("49156") ? /[^.*+?^${}()|[\]\\]/g : (stryCov_9fa48("49156"), /[.*+?^${}()|[\]\\]/g), stryMutAct_9fa48("49157") ? "" : (stryCov_9fa48("49157"), '\\$&'));
    }
  }

  /**
   * Apply sort to data
   * @param {Array} data - Data to sort
   * @return {Array} Sorted data
   */
  applySort(data) {
    if (stryMutAct_9fa48("49158")) {
      {}
    } else {
      stryCov_9fa48("49158");
      if (stryMutAct_9fa48("49161") ? false : stryMutAct_9fa48("49160") ? true : stryMutAct_9fa48("49159") ? this.sortColumn : (stryCov_9fa48("49159", "49160", "49161"), !this.sortColumn)) {
        if (stryMutAct_9fa48("49162")) {
          {}
        } else {
          stryCov_9fa48("49162");
          return data;
        }
      }
      return stryMutAct_9fa48("49163") ? [...data] : (stryCov_9fa48("49163"), (stryMutAct_9fa48("49164") ? [] : (stryCov_9fa48("49164"), [...data])).sort((a, b) => {
        if (stryMutAct_9fa48("49165")) {
          {}
        } else {
          stryCov_9fa48("49165");
          let aVal = a[this.sortColumn];
          let bVal = b[this.sortColumn];

          // Special handling for timestamp sorting
          if (stryMutAct_9fa48("49168") ? this.sortColumn === 'created_at' && this.sortColumn === 'updated_at' : stryMutAct_9fa48("49167") ? false : stryMutAct_9fa48("49166") ? true : (stryCov_9fa48("49166", "49167", "49168"), (stryMutAct_9fa48("49170") ? this.sortColumn !== 'created_at' : stryMutAct_9fa48("49169") ? false : (stryCov_9fa48("49169", "49170"), this.sortColumn === (stryMutAct_9fa48("49171") ? "" : (stryCov_9fa48("49171"), 'created_at')))) || (stryMutAct_9fa48("49173") ? this.sortColumn !== 'updated_at' : stryMutAct_9fa48("49172") ? false : (stryCov_9fa48("49172", "49173"), this.sortColumn === (stryMutAct_9fa48("49174") ? "" : (stryCov_9fa48("49174"), 'updated_at')))))) {
            if (stryMutAct_9fa48("49175")) {
              {}
            } else {
              stryCov_9fa48("49175");
              aVal = this.parseTimestamp(aVal);
              bVal = this.parseTimestamp(bVal);
            }
          }

          // Handle null/undefined
          if (stryMutAct_9fa48("49178") ? aVal === null && aVal === undefined : stryMutAct_9fa48("49177") ? false : stryMutAct_9fa48("49176") ? true : (stryCov_9fa48("49176", "49177", "49178"), (stryMutAct_9fa48("49180") ? aVal !== null : stryMutAct_9fa48("49179") ? false : (stryCov_9fa48("49179", "49180"), aVal === null)) || (stryMutAct_9fa48("49182") ? aVal !== undefined : stryMutAct_9fa48("49181") ? false : (stryCov_9fa48("49181", "49182"), aVal === undefined)))) {
            if (stryMutAct_9fa48("49183")) {
              {}
            } else {
              stryCov_9fa48("49183");
              return (stryMutAct_9fa48("49186") ? this.sortDirection !== 'asc' : stryMutAct_9fa48("49185") ? false : stryMutAct_9fa48("49184") ? true : (stryCov_9fa48("49184", "49185", "49186"), this.sortDirection === (stryMutAct_9fa48("49187") ? "" : (stryCov_9fa48("49187"), 'asc')))) ? 1 : stryMutAct_9fa48("49188") ? +1 : (stryCov_9fa48("49188"), -1);
            }
          }
          if (stryMutAct_9fa48("49191") ? bVal === null && bVal === undefined : stryMutAct_9fa48("49190") ? false : stryMutAct_9fa48("49189") ? true : (stryCov_9fa48("49189", "49190", "49191"), (stryMutAct_9fa48("49193") ? bVal !== null : stryMutAct_9fa48("49192") ? false : (stryCov_9fa48("49192", "49193"), bVal === null)) || (stryMutAct_9fa48("49195") ? bVal !== undefined : stryMutAct_9fa48("49194") ? false : (stryCov_9fa48("49194", "49195"), bVal === undefined)))) {
            if (stryMutAct_9fa48("49196")) {
              {}
            } else {
              stryCov_9fa48("49196");
              return (stryMutAct_9fa48("49199") ? this.sortDirection !== 'asc' : stryMutAct_9fa48("49198") ? false : stryMutAct_9fa48("49197") ? true : (stryCov_9fa48("49197", "49198", "49199"), this.sortDirection === (stryMutAct_9fa48("49200") ? "" : (stryCov_9fa48("49200"), 'asc')))) ? stryMutAct_9fa48("49201") ? +1 : (stryCov_9fa48("49201"), -1) : 1;
            }
          }

          // Compare values
          let cmp;
          if (stryMutAct_9fa48("49204") ? typeof aVal === 'number' || typeof bVal === 'number' : stryMutAct_9fa48("49203") ? false : stryMutAct_9fa48("49202") ? true : (stryCov_9fa48("49202", "49203", "49204"), (stryMutAct_9fa48("49206") ? typeof aVal !== 'number' : stryMutAct_9fa48("49205") ? true : (stryCov_9fa48("49205", "49206"), typeof aVal === (stryMutAct_9fa48("49207") ? "" : (stryCov_9fa48("49207"), 'number')))) && (stryMutAct_9fa48("49209") ? typeof bVal !== 'number' : stryMutAct_9fa48("49208") ? true : (stryCov_9fa48("49208", "49209"), typeof bVal === (stryMutAct_9fa48("49210") ? "" : (stryCov_9fa48("49210"), 'number')))))) {
            if (stryMutAct_9fa48("49211")) {
              {}
            } else {
              stryCov_9fa48("49211");
              cmp = stryMutAct_9fa48("49212") ? aVal + bVal : (stryCov_9fa48("49212"), aVal - bVal);
            }
          } else {
            if (stryMutAct_9fa48("49213")) {
              {}
            } else {
              stryCov_9fa48("49213");
              cmp = String(aVal).localeCompare(String(bVal));
            }
          }
          return (stryMutAct_9fa48("49216") ? this.sortDirection !== 'asc' : stryMutAct_9fa48("49215") ? false : stryMutAct_9fa48("49214") ? true : (stryCov_9fa48("49214", "49215", "49216"), this.sortDirection === (stryMutAct_9fa48("49217") ? "" : (stryCov_9fa48("49217"), 'asc')))) ? cmp : stryMutAct_9fa48("49218") ? +cmp : (stryCov_9fa48("49218"), -cmp);
        }
      }));
    }
  }

  /**
   * Handle drill-down action (Enter key on selected context)
   * Requirements: 31.3
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    if (stryMutAct_9fa48("49219")) {
      {}
    } else {
      stryCov_9fa48("49219");
      const selectedContext = this.getSelectedItem();
      if (stryMutAct_9fa48("49222") ? false : stryMutAct_9fa48("49221") ? true : stryMutAct_9fa48("49220") ? selectedContext : (stryCov_9fa48("49220", "49221", "49222"), !selectedContext)) {
        if (stryMutAct_9fa48("49223")) {
          {}
        } else {
          stryCov_9fa48("49223");
          return null;
        }
      }
      return stryMutAct_9fa48("49224") ? {} : (stryCov_9fa48("49224"), {
        action: stryMutAct_9fa48("49225") ? "" : (stryCov_9fa48("49225"), 'showDetail'),
        view: stryMutAct_9fa48("49226") ? "" : (stryCov_9fa48("49226"), 'contexts'),
        context: stryMutAct_9fa48("49227") ? {} : (stryCov_9fa48("49227"), {
          contextId: selectedContext.context_id
        }),
        detail: this.getSelectedDetails()
      });
    }
  }

  /**
   * Handle key input for the contexts view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (stryMutAct_9fa48("49228")) {
      {}
    } else {
      stryCov_9fa48("49228");
      if (stryMutAct_9fa48("49231") ? key.name === 'enter' && key.name === 'return' : stryMutAct_9fa48("49230") ? false : stryMutAct_9fa48("49229") ? true : (stryCov_9fa48("49229", "49230", "49231"), (stryMutAct_9fa48("49233") ? key.name !== 'enter' : stryMutAct_9fa48("49232") ? false : (stryCov_9fa48("49232", "49233"), key.name === (stryMutAct_9fa48("49234") ? "" : (stryCov_9fa48("49234"), 'enter')))) || (stryMutAct_9fa48("49236") ? key.name !== 'return' : stryMutAct_9fa48("49235") ? false : (stryCov_9fa48("49235", "49236"), key.name === (stryMutAct_9fa48("49237") ? "" : (stryCov_9fa48("49237"), 'return')))))) {
        if (stryMutAct_9fa48("49238")) {
          {}
        } else {
          stryCov_9fa48("49238");
          return this.handleDrillDown();
        }
      }
      return super.handleKey(key);
    }
  }

  /**
   * Get detail information for the selected context
   * Requirements: 31.3
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    if (stryMutAct_9fa48("49239")) {
      {}
    } else {
      stryCov_9fa48("49239");
      const context = this.getSelectedItem();
      if (stryMutAct_9fa48("49242") ? false : stryMutAct_9fa48("49241") ? true : stryMutAct_9fa48("49240") ? context : (stryCov_9fa48("49240", "49241", "49242"), !context)) {
        if (stryMutAct_9fa48("49243")) {
          {}
        } else {
          stryCov_9fa48("49243");
          return null;
        }
      }
      const sections = stryMutAct_9fa48("49244") ? [] : (stryCov_9fa48("49244"), [stryMutAct_9fa48("49245") ? {} : (stryCov_9fa48("49245"), {
        title: stryMutAct_9fa48("49246") ? "" : (stryCov_9fa48("49246"), 'Context Entry'),
        fields: stryMutAct_9fa48("49247") ? [] : (stryCov_9fa48("49247"), [stryMutAct_9fa48("49248") ? {} : (stryCov_9fa48("49248"), {
          label: stryMutAct_9fa48("49249") ? "" : (stryCov_9fa48("49249"), 'Context ID'),
          value: stryMutAct_9fa48("49252") ? context.context_id && 'N/A' : stryMutAct_9fa48("49251") ? false : stryMutAct_9fa48("49250") ? true : (stryCov_9fa48("49250", "49251", "49252"), context.context_id || (stryMutAct_9fa48("49253") ? "" : (stryCov_9fa48("49253"), 'N/A')))
        }), stryMutAct_9fa48("49254") ? {} : (stryCov_9fa48("49254"), {
          label: stryMutAct_9fa48("49255") ? "" : (stryCov_9fa48("49255"), 'Type'),
          value: stryMutAct_9fa48("49258") ? context.context_type && 'N/A' : stryMutAct_9fa48("49257") ? false : stryMutAct_9fa48("49256") ? true : (stryCov_9fa48("49256", "49257", "49258"), context.context_type || (stryMutAct_9fa48("49259") ? "" : (stryCov_9fa48("49259"), 'N/A')))
        }), stryMutAct_9fa48("49260") ? {} : (stryCov_9fa48("49260"), {
          label: stryMutAct_9fa48("49261") ? "" : (stryCov_9fa48("49261"), 'Name'),
          value: stryMutAct_9fa48("49264") ? context.name && 'N/A' : stryMutAct_9fa48("49263") ? false : stryMutAct_9fa48("49262") ? true : (stryCov_9fa48("49262", "49263", "49264"), context.name || (stryMutAct_9fa48("49265") ? "" : (stryCov_9fa48("49265"), 'N/A')))
        }), stryMutAct_9fa48("49266") ? {} : (stryCov_9fa48("49266"), {
          label: stryMutAct_9fa48("49267") ? "" : (stryCov_9fa48("49267"), 'Created At'),
          value: this.formatTimestamp(context.created_at)
        }), stryMutAct_9fa48("49268") ? {} : (stryCov_9fa48("49268"), {
          label: stryMutAct_9fa48("49269") ? "" : (stryCov_9fa48("49269"), 'Updated At'),
          value: this.formatTimestamp(context.updated_at)
        })])
      })]);

      // Add state data section if available
      // Requirements: 31.3
      if (stryMutAct_9fa48("49272") ? context.state_data || typeof context.state_data === 'object' : stryMutAct_9fa48("49271") ? false : stryMutAct_9fa48("49270") ? true : (stryCov_9fa48("49270", "49271", "49272"), context.state_data && (stryMutAct_9fa48("49274") ? typeof context.state_data !== 'object' : stryMutAct_9fa48("49273") ? true : (stryCov_9fa48("49273", "49274"), typeof context.state_data === (stryMutAct_9fa48("49275") ? "" : (stryCov_9fa48("49275"), 'object')))))) {
        if (stryMutAct_9fa48("49276")) {
          {}
        } else {
          stryCov_9fa48("49276");
          const stateFields = Object.entries(context.state_data).map(stryMutAct_9fa48("49277") ? () => undefined : (stryCov_9fa48("49277"), ([k, v]) => stryMutAct_9fa48("49278") ? {} : (stryCov_9fa48("49278"), {
            label: k,
            value: (stryMutAct_9fa48("49281") ? typeof v !== 'object' : stryMutAct_9fa48("49280") ? false : stryMutAct_9fa48("49279") ? true : (stryCov_9fa48("49279", "49280", "49281"), typeof v === (stryMutAct_9fa48("49282") ? "" : (stryCov_9fa48("49282"), 'object')))) ? JSON.stringify(v, null, 2) : String(v)
          })));
          if (stryMutAct_9fa48("49286") ? stateFields.length <= 0 : stryMutAct_9fa48("49285") ? stateFields.length >= 0 : stryMutAct_9fa48("49284") ? false : stryMutAct_9fa48("49283") ? true : (stryCov_9fa48("49283", "49284", "49285", "49286"), stateFields.length > 0)) {
            if (stryMutAct_9fa48("49287")) {
              {}
            } else {
              stryCov_9fa48("49287");
              sections.push(stryMutAct_9fa48("49288") ? {} : (stryCov_9fa48("49288"), {
                title: stryMutAct_9fa48("49289") ? "" : (stryCov_9fa48("49289"), 'State Data'),
                fields: stateFields
              }));
            }
          }
        }
      } else if (stryMutAct_9fa48("49291") ? false : stryMutAct_9fa48("49290") ? true : (stryCov_9fa48("49290", "49291"), context.state_data)) {
        if (stryMutAct_9fa48("49292")) {
          {}
        } else {
          stryCov_9fa48("49292");
          // Handle non-object state_data
          sections.push(stryMutAct_9fa48("49293") ? {} : (stryCov_9fa48("49293"), {
            title: stryMutAct_9fa48("49294") ? "" : (stryCov_9fa48("49294"), 'State Data'),
            fields: stryMutAct_9fa48("49295") ? [] : (stryCov_9fa48("49295"), [stryMutAct_9fa48("49296") ? {} : (stryCov_9fa48("49296"), {
              label: stryMutAct_9fa48("49297") ? "" : (stryCov_9fa48("49297"), 'Data'),
              value: String(context.state_data)
            })])
          }));
        }
      }

      // Add recently updated indicator
      if (stryMutAct_9fa48("49299") ? false : stryMutAct_9fa48("49298") ? true : (stryCov_9fa48("49298", "49299"), this.isRecentlyUpdated(context))) {
        if (stryMutAct_9fa48("49300")) {
          {}
        } else {
          stryCov_9fa48("49300");
          sections.push(stryMutAct_9fa48("49301") ? {} : (stryCov_9fa48("49301"), {
            title: stryMutAct_9fa48("49302") ? "" : (stryCov_9fa48("49302"), 'Status'),
            fields: stryMutAct_9fa48("49303") ? [] : (stryCov_9fa48("49303"), [stryMutAct_9fa48("49304") ? {} : (stryCov_9fa48("49304"), {
              label: stryMutAct_9fa48("49305") ? "" : (stryCov_9fa48("49305"), 'Info'),
              value: stryMutAct_9fa48("49306") ? "" : (stryCov_9fa48("49306"), 'Recently updated')
            })])
          }));
        }
      }
      return stryMutAct_9fa48("49307") ? {} : (stryCov_9fa48("49307"), {
        title: stryMutAct_9fa48("49308") ? `` : (stryCov_9fa48("49308"), `Context: ${stryMutAct_9fa48("49311") ? (context.name || context.context_id) && 'Unknown' : stryMutAct_9fa48("49310") ? false : stryMutAct_9fa48("49309") ? true : (stryCov_9fa48("49309", "49310", "49311"), (stryMutAct_9fa48("49313") ? context.name && context.context_id : stryMutAct_9fa48("49312") ? false : (stryCov_9fa48("49312", "49313"), context.name || context.context_id)) || (stryMutAct_9fa48("49314") ? "" : (stryCov_9fa48("49314"), 'Unknown')))}`),
        sections
      });
    }
  }

  /**
   * Get context count by type
   * Requirements: 31.6
   * @return {Object} Object mapping type to count
   */
  getContextCountByType() {
    if (stryMutAct_9fa48("49315")) {
      {}
    } else {
      stryCov_9fa48("49315");
      const counts = {};

      // Initialize counts for known types
      for (const type of CONTEXT_TYPES) {
        if (stryMutAct_9fa48("49316")) {
          {}
        } else {
          stryCov_9fa48("49316");
          counts[type] = 0;
        }
      }

      // Count contexts by type
      for (const context of this.filteredData) {
        if (stryMutAct_9fa48("49317")) {
          {}
        } else {
          stryCov_9fa48("49317");
          const type = stryMutAct_9fa48("49318") ? (context.context_type || 'unknown').toUpperCase() : (stryCov_9fa48("49318"), (stryMutAct_9fa48("49321") ? context.context_type && 'unknown' : stryMutAct_9fa48("49320") ? false : stryMutAct_9fa48("49319") ? true : (stryCov_9fa48("49319", "49320", "49321"), context.context_type || (stryMutAct_9fa48("49322") ? "" : (stryCov_9fa48("49322"), 'unknown')))).toLowerCase());
          if (stryMutAct_9fa48("49325") ? counts[type] === undefined : stryMutAct_9fa48("49324") ? false : stryMutAct_9fa48("49323") ? true : (stryCov_9fa48("49323", "49324", "49325"), counts[type] !== undefined)) {
            if (stryMutAct_9fa48("49326")) {
              {}
            } else {
              stryCov_9fa48("49326");
              stryMutAct_9fa48("49327") ? counts[type]-- : (stryCov_9fa48("49327"), counts[type]++);
            }
          } else {
            if (stryMutAct_9fa48("49328")) {
              {}
            } else {
              stryCov_9fa48("49328");
              counts[type] = 1;
            }
          }
        }
      }
      return counts;
    }
  }

  /**
   * Get status bar information
   * Requirements: 31.6
   * @return {Object} Status bar data
   */
  getStatusBarInfo() {
    if (stryMutAct_9fa48("49329")) {
      {}
    } else {
      stryCov_9fa48("49329");
      const activeFilters = stryMutAct_9fa48("49330") ? ["Stryker was here"] : (stryCov_9fa48("49330"), []);
      if (stryMutAct_9fa48("49332") ? false : stryMutAct_9fa48("49331") ? true : (stryCov_9fa48("49331", "49332"), this.typeFilter)) {
        if (stryMutAct_9fa48("49333")) {
          {}
        } else {
          stryCov_9fa48("49333");
          activeFilters.push(stryMutAct_9fa48("49334") ? `` : (stryCov_9fa48("49334"), `Type: ${this.typeFilter}`));
        }
      }
      if (stryMutAct_9fa48("49336") ? false : stryMutAct_9fa48("49335") ? true : (stryCov_9fa48("49335", "49336"), this.namePatternFilter)) {
        if (stryMutAct_9fa48("49337")) {
          {}
        } else {
          stryCov_9fa48("49337");
          activeFilters.push(stryMutAct_9fa48("49338") ? `` : (stryCov_9fa48("49338"), `Name: "${this.namePatternFilter}"`));
        }
      }

      // Count recently updated contexts
      const recentlyUpdatedCount = stryMutAct_9fa48("49339") ? this.filteredData.length : (stryCov_9fa48("49339"), this.filteredData.filter(stryMutAct_9fa48("49340") ? () => undefined : (stryCov_9fa48("49340"), context => this.isRecentlyUpdated(context))).length);

      // Get counts by type
      const countsByType = this.getContextCountByType();
      return stryMutAct_9fa48("49341") ? {} : (stryCov_9fa48("49341"), {
        contextCount: this.filteredData.length,
        totalCount: this.data.length,
        recentlyUpdatedCount,
        countsByType,
        activeFilters
      });
    }
  }

  /**
   * Render the view with context-specific styling
   * @param {Object} state - Navigation state
   * @return {Object} Render data with headers and rows
   */
  render(state = {}) {
    if (stryMutAct_9fa48("49342")) {
      {}
    } else {
      stryCov_9fa48("49342");
      const baseRender = super.render(state);

      // Add status bar info
      baseRender.statusBar = this.getStatusBarInfo();
      return baseRender;
    }
  }

  /**
   * Set the recent update threshold
   * @param {number} thresholdMs - Threshold in milliseconds
   */
  setRecentUpdateThreshold(thresholdMs) {
    if (stryMutAct_9fa48("49343")) {
      {}
    } else {
      stryCov_9fa48("49343");
      this.recentUpdateThreshold = thresholdMs;
    }
  }

  /**
   * Get the recent update threshold
   * @return {number} Threshold in milliseconds
   */
  getRecentUpdateThreshold() {
    if (stryMutAct_9fa48("49344")) {
      {}
    } else {
      stryCov_9fa48("49344");
      return this.recentUpdateThreshold;
    }
  }
}