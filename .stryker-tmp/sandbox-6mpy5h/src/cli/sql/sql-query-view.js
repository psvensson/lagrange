/**
 * SQLQueryView - Main view for SQL query interface
 *
 * Combines QueryInput, ResultsPanel, QueryHistory, and other components
 * to provide a complete SQL query interface with read-only mode support,
 * dangerous query detection, and live query support.
 *
 * Requirements: 7.1, 7.2, 7.5, 7.13, 7.14, 7.15, 10.1, 10.2, 10.3, 10.4
 * Requirements: 32.1, 32.2, 32.6, 32.8, 32.13, 32.14
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
import { QueryInput } from './query-input.js';
import { ResultsPanel } from './results-panel.js';
import { QueryHistory } from './query-history.js';
import { TableAutocomplete } from './table-autocomplete.js';
import { SQLSyntaxHighlighter } from './sql-syntax-highlighter.js';
import { LiveStreamPanel } from './live-stream-panel.js';

/**
 * Query types for classification
 */
export const QUERY_TYPE = stryMutAct_9fa48("47512") ? {} : (stryCov_9fa48("47512"), {
  SELECT: stryMutAct_9fa48("47513") ? "" : (stryCov_9fa48("47513"), 'select'),
  INSERT: stryMutAct_9fa48("47514") ? "" : (stryCov_9fa48("47514"), 'insert'),
  UPDATE: stryMutAct_9fa48("47515") ? "" : (stryCov_9fa48("47515"), 'update'),
  DELETE: stryMutAct_9fa48("47516") ? "" : (stryCov_9fa48("47516"), 'delete'),
  LIVE_SELECT: stryMutAct_9fa48("47517") ? "" : (stryCov_9fa48("47517"), 'live_select'),
  OTHER: stryMutAct_9fa48("47518") ? "" : (stryCov_9fa48("47518"), 'other')
});

/**
 * Live query subscription status
 */
export const LIVE_QUERY_STATUS = stryMutAct_9fa48("47519") ? {} : (stryCov_9fa48("47519"), {
  ACTIVE: stryMutAct_9fa48("47520") ? "" : (stryCov_9fa48("47520"), 'active'),
  PAUSED: stryMutAct_9fa48("47521") ? "" : (stryCov_9fa48("47521"), 'paused'),
  EXPIRED: stryMutAct_9fa48("47522") ? "" : (stryCov_9fa48("47522"), 'expired'),
  CANCELLED: stryMutAct_9fa48("47523") ? "" : (stryCov_9fa48("47523"), 'cancelled')
});

/**
 * SQLQueryView class for the SQL query interface
 */
export class SQLQueryView {
  /**
   * Creates a new SQLQueryView
   * @param {Object} options - View options
   * @param {Object} [options.screen] - Blessed screen instance
   * @param {Object} [options.connectionManager] - Connection manager for queries
   * @param {Object} [options.cache] - Remote cache for table names
   * @param {boolean} [options.readOnlyMode=false] - Enable read-only mode
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {import('../core/live-query-manager.js').LiveQueryManager} [options.liveQueryManager] -
   *   Live query manager
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("47524")) {
      {}
    } else {
      stryCov_9fa48("47524");
      this.screen = stryMutAct_9fa48("47527") ? options.screen && null : stryMutAct_9fa48("47526") ? false : stryMutAct_9fa48("47525") ? true : (stryCov_9fa48("47525", "47526", "47527"), options.screen || null);
      this.connectionManager = stryMutAct_9fa48("47530") ? options.connectionManager && null : stryMutAct_9fa48("47529") ? false : stryMutAct_9fa48("47528") ? true : (stryCov_9fa48("47528", "47529", "47530"), options.connectionManager || null);
      this.cache = stryMutAct_9fa48("47533") ? options.cache && null : stryMutAct_9fa48("47532") ? false : stryMutAct_9fa48("47531") ? true : (stryCov_9fa48("47531", "47532", "47533"), options.cache || null);
      this.readOnlyMode = stryMutAct_9fa48("47536") ? options.readOnlyMode && false : stryMutAct_9fa48("47535") ? false : stryMutAct_9fa48("47534") ? true : (stryCov_9fa48("47534", "47535", "47536"), options.readOnlyMode || (stryMutAct_9fa48("47537") ? true : (stryCov_9fa48("47537"), false)));
      this.eventBus = stryMutAct_9fa48("47540") ? options.eventBus && null : stryMutAct_9fa48("47539") ? false : stryMutAct_9fa48("47538") ? true : (stryCov_9fa48("47538", "47539", "47540"), options.eventBus || null);
      this.liveQueryManager = stryMutAct_9fa48("47543") ? options.liveQueryManager && null : stryMutAct_9fa48("47542") ? false : stryMutAct_9fa48("47541") ? true : (stryCov_9fa48("47541", "47542", "47543"), options.liveQueryManager || null);

      // Components
      this.queryInput = null;
      this.resultsPanel = null;
      this.queryHistory = null;
      this.autocomplete = null;
      this.syntaxHighlighter = null;
      this.liveStreamPanel = null;

      // Query state
      this.pendingQueries = new Map();
      this.confirmationCallback = null;

      // Live query state
      // Requirements: 32.1, 32.6
      this.activeLiveQueryId = null;
      this.liveQueryStatus = null;

      // Widget references
      this.container = null;
      this.visible = stryMutAct_9fa48("47544") ? true : (stryCov_9fa48("47544"), false);
    }
  }

  /**
   * Initialize the view components
   * Requirements: 7.1, 7.2
   */
  initialize() {
    if (stryMutAct_9fa48("47545")) {
      {}
    } else {
      stryCov_9fa48("47545");
      // Create syntax highlighter
      this.syntaxHighlighter = new SQLSyntaxHighlighter();

      // Create query history
      this.queryHistory = new QueryHistory(stryMutAct_9fa48("47546") ? {} : (stryCov_9fa48("47546"), {
        maxEntries: 100,
        autoLoad: stryMutAct_9fa48("47547") ? false : (stryCov_9fa48("47547"), true)
      }));

      // Create autocomplete (if cache available)
      if (stryMutAct_9fa48("47549") ? false : stryMutAct_9fa48("47548") ? true : (stryCov_9fa48("47548", "47549"), this.cache)) {
        if (stryMutAct_9fa48("47550")) {
          {}
        } else {
          stryCov_9fa48("47550");
          this.autocomplete = new TableAutocomplete(this.cache);
        }
      }

      // Create query input
      this.queryInput = new QueryInput(stryMutAct_9fa48("47551") ? {} : (stryCov_9fa48("47551"), {
        screen: this.screen,
        syntaxHighlighter: this.syntaxHighlighter,
        autocomplete: this.autocomplete,
        history: this.queryHistory,
        eventBus: this.eventBus
      }));

      // Create results panel
      this.resultsPanel = new ResultsPanel(stryMutAct_9fa48("47552") ? {} : (stryCov_9fa48("47552"), {
        screen: this.screen,
        eventBus: this.eventBus
      }));

      // Create live stream panel
      // Requirements: 32.3, 32.4
      this.liveStreamPanel = new LiveStreamPanel(stryMutAct_9fa48("47553") ? {} : (stryCov_9fa48("47553"), {
        screen: this.screen,
        eventBus: this.eventBus
      }));

      // Wire up connection manager events
      if (stryMutAct_9fa48("47555") ? false : stryMutAct_9fa48("47554") ? true : (stryCov_9fa48("47554", "47555"), this.connectionManager)) {
        if (stryMutAct_9fa48("47556")) {
          {}
        } else {
          stryCov_9fa48("47556");
          this.connectionManager.onQueryResult = stryMutAct_9fa48("47557") ? () => undefined : (stryCov_9fa48("47557"), msg => this.handleQueryResult(msg));
          this.connectionManager.onLiveQueryEvent = stryMutAct_9fa48("47558") ? () => undefined : (stryCov_9fa48("47558"), msg => this.handleLiveQueryEvent(msg));
        }
      }

      // Wire up live query manager events
      if (stryMutAct_9fa48("47561") ? this.liveQueryManager || this.eventBus : stryMutAct_9fa48("47560") ? false : stryMutAct_9fa48("47559") ? true : (stryCov_9fa48("47559", "47560", "47561"), this.liveQueryManager && this.eventBus)) {
        if (stryMutAct_9fa48("47562")) {
          {}
        } else {
          stryCov_9fa48("47562");
          this.eventBus.on(stryMutAct_9fa48("47563") ? "" : (stryCov_9fa48("47563"), 'livequery:initialized'), stryMutAct_9fa48("47564") ? () => undefined : (stryCov_9fa48("47564"), data => this.handleLiveQueryInitialized(data)));
          this.eventBus.on(stryMutAct_9fa48("47565") ? "" : (stryCov_9fa48("47565"), 'livequery:event'), stryMutAct_9fa48("47566") ? () => undefined : (stryCov_9fa48("47566"), data => this.handleLiveQueryStreamEvent(data)));
          this.eventBus.on(stryMutAct_9fa48("47567") ? "" : (stryCov_9fa48("47567"), 'livequery:expired'), stryMutAct_9fa48("47568") ? () => undefined : (stryCov_9fa48("47568"), data => this.handleLiveQueryExpired(data)));
          this.eventBus.on(stryMutAct_9fa48("47569") ? "" : (stryCov_9fa48("47569"), 'livequery:paused'), stryMutAct_9fa48("47570") ? () => undefined : (stryCov_9fa48("47570"), data => this.handleLiveQueryPaused(data)));
          this.eventBus.on(stryMutAct_9fa48("47571") ? "" : (stryCov_9fa48("47571"), 'livequery:resumed'), stryMutAct_9fa48("47572") ? () => undefined : (stryCov_9fa48("47572"), data => this.handleLiveQueryResumed(data)));
        }
      }
    }
  }

  /**
   * Execute the current query
   * Requirements: 7.5, 10.1, 10.2, 10.3, 10.4, 32.1, 32.2
   * @return {Promise<boolean>} True if query was executed
   */
  async executeQuery() {
    if (stryMutAct_9fa48("47573")) {
      {}
    } else {
      stryCov_9fa48("47573");
      const sql = this.queryInput.getValue();
      if (stryMutAct_9fa48("47576") ? !sql && !sql.trim() : stryMutAct_9fa48("47575") ? false : stryMutAct_9fa48("47574") ? true : (stryCov_9fa48("47574", "47575", "47576"), (stryMutAct_9fa48("47577") ? sql : (stryCov_9fa48("47577"), !sql)) || (stryMutAct_9fa48("47578") ? sql.trim() : (stryCov_9fa48("47578"), !(stryMutAct_9fa48("47579") ? sql : (stryCov_9fa48("47579"), sql.trim())))))) {
        if (stryMutAct_9fa48("47580")) {
          {}
        } else {
          stryCov_9fa48("47580");
          return stryMutAct_9fa48("47581") ? true : (stryCov_9fa48("47581"), false);
        }
      }

      // Check if this is a LIVE SELECT query
      // Requirements: 32.1
      if (stryMutAct_9fa48("47583") ? false : stryMutAct_9fa48("47582") ? true : (stryCov_9fa48("47582", "47583"), this.isLiveSelectQuery(sql))) {
        if (stryMutAct_9fa48("47584")) {
          {}
        } else {
          stryCov_9fa48("47584");
          return this.executeLiveQuery(sql);
        }
      }

      // Check read-only mode
      // Requirements: 10.3, 10.4
      if (stryMutAct_9fa48("47587") ? this.readOnlyMode || !this.isSelectQuery(sql) : stryMutAct_9fa48("47586") ? false : stryMutAct_9fa48("47585") ? true : (stryCov_9fa48("47585", "47586", "47587"), this.readOnlyMode && (stryMutAct_9fa48("47588") ? this.isSelectQuery(sql) : (stryCov_9fa48("47588"), !this.isSelectQuery(sql))))) {
        if (stryMutAct_9fa48("47589")) {
          {}
        } else {
          stryCov_9fa48("47589");
          this.resultsPanel.displayError(stryMutAct_9fa48("47590") ? {} : (stryCov_9fa48("47590"), {
            message: stryMutAct_9fa48("47591") ? "" : (stryCov_9fa48("47591"), 'Read-only mode: Only SELECT queries are allowed'),
            code: stryMutAct_9fa48("47592") ? "" : (stryCov_9fa48("47592"), 'READ_ONLY_VIOLATION')
          }));
          this.emitEvent(stryMutAct_9fa48("47593") ? "" : (stryCov_9fa48("47593"), 'query:rejected'), stryMutAct_9fa48("47594") ? {} : (stryCov_9fa48("47594"), {
            sql,
            reason: stryMutAct_9fa48("47595") ? "" : (stryCov_9fa48("47595"), 'read_only')
          }));
          return stryMutAct_9fa48("47596") ? true : (stryCov_9fa48("47596"), false);
        }
      }

      // Check for dangerous queries
      // Requirements: 10.1, 10.2
      if (stryMutAct_9fa48("47598") ? false : stryMutAct_9fa48("47597") ? true : (stryCov_9fa48("47597", "47598"), this.isDangerousQuery(sql))) {
        if (stryMutAct_9fa48("47599")) {
          {}
        } else {
          stryCov_9fa48("47599");
          const confirmed = await this.requestConfirmation(stryMutAct_9fa48("47600") ? "" : (stryCov_9fa48("47600"), 'This query may modify or delete data without a WHERE clause. Continue?'));
          if (stryMutAct_9fa48("47603") ? false : stryMutAct_9fa48("47602") ? true : stryMutAct_9fa48("47601") ? confirmed : (stryCov_9fa48("47601", "47602", "47603"), !confirmed)) {
            if (stryMutAct_9fa48("47604")) {
              {}
            } else {
              stryCov_9fa48("47604");
              this.emitEvent(stryMutAct_9fa48("47605") ? "" : (stryCov_9fa48("47605"), 'query:cancelled'), stryMutAct_9fa48("47606") ? {} : (stryCov_9fa48("47606"), {
                sql,
                reason: stryMutAct_9fa48("47607") ? "" : (stryCov_9fa48("47607"), 'dangerous')
              }));
              return stryMutAct_9fa48("47608") ? true : (stryCov_9fa48("47608"), false);
            }
          }
        }
      }

      // Add to history
      this.queryHistory.add(sql);

      // Generate query ID
      const queryId = this.generateQueryId();
      const startTime = Date.now();

      // Track pending query
      this.pendingQueries.set(queryId, stryMutAct_9fa48("47609") ? {} : (stryCov_9fa48("47609"), {
        sql,
        startTime
      }));

      // Send query via connection manager
      if (stryMutAct_9fa48("47611") ? false : stryMutAct_9fa48("47610") ? true : (stryCov_9fa48("47610", "47611"), this.connectionManager)) {
        if (stryMutAct_9fa48("47612")) {
          {}
        } else {
          stryCov_9fa48("47612");
          this.connectionManager.sendQuery(queryId, sql);
        }
      } else {
        if (stryMutAct_9fa48("47613")) {
          {}
        } else {
          stryCov_9fa48("47613");
          // No connection - simulate error
          this.handleQueryResult(stryMutAct_9fa48("47614") ? {} : (stryCov_9fa48("47614"), {
            queryId,
            error: stryMutAct_9fa48("47615") ? "" : (stryCov_9fa48("47615"), 'No connection to database')
          }));
        }
      }
      this.emitEvent(stryMutAct_9fa48("47616") ? "" : (stryCov_9fa48("47616"), 'query:executed'), stryMutAct_9fa48("47617") ? {} : (stryCov_9fa48("47617"), {
        queryId,
        sql
      }));
      return stryMutAct_9fa48("47618") ? false : (stryCov_9fa48("47618"), true);
    }
  }

  /**
   * Execute a LIVE SELECT query
   * Requirements: 32.1, 32.2
   * @param {string} sql - LIVE SELECT statement
   * @return {Promise<boolean>} True if subscription was created
   */
  async executeLiveQuery(sql) {
    if (stryMutAct_9fa48("47619")) {
      {}
    } else {
      stryCov_9fa48("47619");
      if (stryMutAct_9fa48("47622") ? false : stryMutAct_9fa48("47621") ? true : stryMutAct_9fa48("47620") ? this.liveQueryManager : (stryCov_9fa48("47620", "47621", "47622"), !this.liveQueryManager)) {
        if (stryMutAct_9fa48("47623")) {
          {}
        } else {
          stryCov_9fa48("47623");
          this.resultsPanel.displayError(stryMutAct_9fa48("47624") ? {} : (stryCov_9fa48("47624"), {
            message: stryMutAct_9fa48("47625") ? "" : (stryCov_9fa48("47625"), 'Live query support is not available'),
            code: stryMutAct_9fa48("47626") ? "" : (stryCov_9fa48("47626"), 'LIVE_QUERY_UNAVAILABLE')
          }));
          return stryMutAct_9fa48("47627") ? true : (stryCov_9fa48("47627"), false);
        }
      }

      // Cancel any existing live query
      if (stryMutAct_9fa48("47629") ? false : stryMutAct_9fa48("47628") ? true : (stryCov_9fa48("47628", "47629"), this.activeLiveQueryId)) {
        if (stryMutAct_9fa48("47630")) {
          {}
        } else {
          stryCov_9fa48("47630");
          this.cancelLiveQuery();
        }
      }
      try {
        if (stryMutAct_9fa48("47631")) {
          {}
        } else {
          stryCov_9fa48("47631");
          // Add to history
          // Requirements: 32.13
          this.queryHistory.add(sql);

          // Subscribe to live query
          const subscriptionId = this.liveQueryManager.subscribe(sql);
          this.activeLiveQueryId = subscriptionId;
          this.liveQueryStatus = LIVE_QUERY_STATUS.ACTIVE;

          // Clear live stream panel
          this.liveStreamPanel.clear();
          this.emitEvent(stryMutAct_9fa48("47632") ? "" : (stryCov_9fa48("47632"), 'livequery:started'), stryMutAct_9fa48("47633") ? {} : (stryCov_9fa48("47633"), {
            subscriptionId,
            sql
          }));
          return stryMutAct_9fa48("47634") ? false : (stryCov_9fa48("47634"), true);
        }
      } catch (err) {
        if (stryMutAct_9fa48("47635")) {
          {}
        } else {
          stryCov_9fa48("47635");
          this.resultsPanel.displayError(stryMutAct_9fa48("47636") ? {} : (stryCov_9fa48("47636"), {
            message: err.message,
            code: stryMutAct_9fa48("47637") ? "" : (stryCov_9fa48("47637"), 'LIVE_QUERY_ERROR')
          }));
          return stryMutAct_9fa48("47638") ? true : (stryCov_9fa48("47638"), false);
        }
      }
    }
  }

  /**
   * Handle query result from connection manager
   * @param {Object} message - Result message
   * @param {string} message.queryId - Query ID
   * @param {Object} [message.result] - Query result
   * @param {string} [message.error] - Error message
   */
  handleQueryResult(message) {
    if (stryMutAct_9fa48("47639")) {
      {}
    } else {
      stryCov_9fa48("47639");
      const {
        queryId,
        result,
        error
      } = message;
      const pending = this.pendingQueries.get(queryId);
      if (stryMutAct_9fa48("47642") ? false : stryMutAct_9fa48("47641") ? true : stryMutAct_9fa48("47640") ? pending : (stryCov_9fa48("47640", "47641", "47642"), !pending)) {
        if (stryMutAct_9fa48("47643")) {
          {}
        } else {
          stryCov_9fa48("47643");
          return;
        }
      }
      const executionTime = stryMutAct_9fa48("47644") ? Date.now() + pending.startTime : (stryCov_9fa48("47644"), Date.now() - pending.startTime);
      this.pendingQueries.delete(queryId);
      if (stryMutAct_9fa48("47646") ? false : stryMutAct_9fa48("47645") ? true : (stryCov_9fa48("47645", "47646"), error)) {
        if (stryMutAct_9fa48("47647")) {
          {}
        } else {
          stryCov_9fa48("47647");
          this.resultsPanel.displayError(stryMutAct_9fa48("47648") ? {} : (stryCov_9fa48("47648"), {
            message: error
          }));
          this.emitEvent(stryMutAct_9fa48("47649") ? "" : (stryCov_9fa48("47649"), 'query:error'), stryMutAct_9fa48("47650") ? {} : (stryCov_9fa48("47650"), {
            queryId,
            error,
            executionTime
          }));
        }
      } else if (stryMutAct_9fa48("47652") ? false : stryMutAct_9fa48("47651") ? true : (stryCov_9fa48("47651", "47652"), result)) {
        if (stryMutAct_9fa48("47653")) {
          {}
        } else {
          stryCov_9fa48("47653");
          // Determine result type and display appropriately
          if (stryMutAct_9fa48("47655") ? false : stryMutAct_9fa48("47654") ? true : (stryCov_9fa48("47654", "47655"), result.operation)) {
            if (stryMutAct_9fa48("47656")) {
              {}
            } else {
              stryCov_9fa48("47656");
              this.resultsPanel.displayWriteResult(result, executionTime);
            }
          } else {
            if (stryMutAct_9fa48("47657")) {
              {}
            } else {
              stryCov_9fa48("47657");
              this.resultsPanel.displaySelectResult(result, executionTime);
            }
          }
          this.emitEvent(stryMutAct_9fa48("47658") ? "" : (stryCov_9fa48("47658"), 'query:success'), stryMutAct_9fa48("47659") ? {} : (stryCov_9fa48("47659"), {
            queryId,
            result,
            executionTime
          }));
        }
      }
    }
  }

  /**
   * Check if SQL is a SELECT query
   * Requirements: 10.3
   * @param {string} sql - SQL statement
   * @return {boolean} True if SELECT query
   */
  isSelectQuery(sql) {
    if (stryMutAct_9fa48("47660")) {
      {}
    } else {
      stryCov_9fa48("47660");
      const trimmed = stryMutAct_9fa48("47661") ? sql : (stryCov_9fa48("47661"), sql.trim());
      return (stryMutAct_9fa48("47664") ? /^\S*select\b/i : stryMutAct_9fa48("47663") ? /^\sselect\b/i : stryMutAct_9fa48("47662") ? /\s*select\b/i : (stryCov_9fa48("47662", "47663", "47664"), /^\s*select\b/i)).test(trimmed);
    }
  }

  /**
   * Check if SQL is a LIVE SELECT query
   * Requirements: 32.1
   * @param {string} sql - SQL statement
   * @return {boolean} True if LIVE SELECT query
   */
  isLiveSelectQuery(sql) {
    if (stryMutAct_9fa48("47665")) {
      {}
    } else {
      stryCov_9fa48("47665");
      const trimmed = stryMutAct_9fa48("47666") ? sql : (stryCov_9fa48("47666"), sql.trim());
      return (stryMutAct_9fa48("47671") ? /^\s*live\S+select\b/i : stryMutAct_9fa48("47670") ? /^\s*live\sselect\b/i : stryMutAct_9fa48("47669") ? /^\S*live\s+select\b/i : stryMutAct_9fa48("47668") ? /^\slive\s+select\b/i : stryMutAct_9fa48("47667") ? /\s*live\s+select\b/i : (stryCov_9fa48("47667", "47668", "47669", "47670", "47671"), /^\s*live\s+select\b/i)).test(trimmed);
    }
  }

  /**
   * Check if SQL is a write query (INSERT/UPDATE/DELETE)
   * @param {string} sql - SQL statement
   * @return {boolean} True if write query
   */
  isWriteQuery(sql) {
    if (stryMutAct_9fa48("47672")) {
      {}
    } else {
      stryCov_9fa48("47672");
      const trimmed = stryMutAct_9fa48("47674") ? sql.toLowerCase() : stryMutAct_9fa48("47673") ? sql.trim().toUpperCase() : (stryCov_9fa48("47673", "47674"), sql.trim().toLowerCase());
      return (stryMutAct_9fa48("47675") ? /(insert|update|delete)\b/i : (stryCov_9fa48("47675"), /^(insert|update|delete)\b/i)).test(trimmed);
    }
  }

  /**
   * Check if SQL is a dangerous query (DELETE/UPDATE without WHERE)
   * Requirements: 10.1
   * @param {string} sql - SQL statement
   * @return {boolean} True if dangerous
   */
  isDangerousQuery(sql) {
    if (stryMutAct_9fa48("47676")) {
      {}
    } else {
      stryCov_9fa48("47676");
      const trimmed = stryMutAct_9fa48("47677") ? sql : (stryCov_9fa48("47677"), sql.trim());
      const lower = stryMutAct_9fa48("47678") ? trimmed.toUpperCase() : (stryCov_9fa48("47678"), trimmed.toLowerCase());

      // DELETE without WHERE
      if (stryMutAct_9fa48("47680") ? false : stryMutAct_9fa48("47679") ? true : (stryCov_9fa48("47679", "47680"), (stryMutAct_9fa48("47693") ? /^delete\s+from\s+\S+\s*;?\S*$/i : stryMutAct_9fa48("47692") ? /^delete\s+from\s+\S+\s*;?\s$/i : stryMutAct_9fa48("47691") ? /^delete\s+from\s+\S+\s*;\s*$/i : stryMutAct_9fa48("47690") ? /^delete\s+from\s+\S+\S*;?\s*$/i : stryMutAct_9fa48("47689") ? /^delete\s+from\s+\S+\s;?\s*$/i : stryMutAct_9fa48("47688") ? /^delete\s+from\s+\s+\s*;?\s*$/i : stryMutAct_9fa48("47687") ? /^delete\s+from\s+\S\s*;?\s*$/i : stryMutAct_9fa48("47686") ? /^delete\s+from\S+\S+\s*;?\s*$/i : stryMutAct_9fa48("47685") ? /^delete\s+from\s\S+\s*;?\s*$/i : stryMutAct_9fa48("47684") ? /^delete\S+from\s+\S+\s*;?\s*$/i : stryMutAct_9fa48("47683") ? /^delete\sfrom\s+\S+\s*;?\s*$/i : stryMutAct_9fa48("47682") ? /^delete\s+from\s+\S+\s*;?\s*/i : stryMutAct_9fa48("47681") ? /delete\s+from\s+\S+\s*;?\s*$/i : (stryCov_9fa48("47681", "47682", "47683", "47684", "47685", "47686", "47687", "47688", "47689", "47690", "47691", "47692", "47693"), /^delete\s+from\s+\S+\s*;?\s*$/i)).test(trimmed))) {
        if (stryMutAct_9fa48("47694")) {
          {}
        } else {
          stryCov_9fa48("47694");
          return stryMutAct_9fa48("47695") ? false : (stryCov_9fa48("47695"), true);
        }
      }

      // UPDATE without WHERE
      if (stryMutAct_9fa48("47698") ? /^update\b/i.test(trimmed) || !/\bwhere\b/i.test(lower) : stryMutAct_9fa48("47697") ? false : stryMutAct_9fa48("47696") ? true : (stryCov_9fa48("47696", "47697", "47698"), (stryMutAct_9fa48("47699") ? /update\b/i : (stryCov_9fa48("47699"), /^update\b/i)).test(trimmed) && (stryMutAct_9fa48("47700") ? /\bwhere\b/i.test(lower) : (stryCov_9fa48("47700"), !/\bwhere\b/i.test(lower))))) {
        if (stryMutAct_9fa48("47701")) {
          {}
        } else {
          stryCov_9fa48("47701");
          return stryMutAct_9fa48("47702") ? false : (stryCov_9fa48("47702"), true);
        }
      }
      return stryMutAct_9fa48("47703") ? true : (stryCov_9fa48("47703"), false);
    }
  }

  /**
   * Classify the query type
   * @param {string} sql - SQL statement
   * @return {string} Query type from QUERY_TYPE
   */
  classifyQuery(sql) {
    if (stryMutAct_9fa48("47704")) {
      {}
    } else {
      stryCov_9fa48("47704");
      const trimmed = stryMutAct_9fa48("47706") ? sql.toLowerCase() : stryMutAct_9fa48("47705") ? sql.trim().toUpperCase() : (stryCov_9fa48("47705", "47706"), sql.trim().toLowerCase());
      if (stryMutAct_9fa48("47708") ? false : stryMutAct_9fa48("47707") ? true : (stryCov_9fa48("47707", "47708"), (stryMutAct_9fa48("47711") ? /^live\S+select\b/ : stryMutAct_9fa48("47710") ? /^live\sselect\b/ : stryMutAct_9fa48("47709") ? /live\s+select\b/ : (stryCov_9fa48("47709", "47710", "47711"), /^live\s+select\b/)).test(trimmed))) return QUERY_TYPE.LIVE_SELECT;
      if (stryMutAct_9fa48("47713") ? false : stryMutAct_9fa48("47712") ? true : (stryCov_9fa48("47712", "47713"), (stryMutAct_9fa48("47714") ? /select\b/ : (stryCov_9fa48("47714"), /^select\b/)).test(trimmed))) return QUERY_TYPE.SELECT;
      if (stryMutAct_9fa48("47716") ? false : stryMutAct_9fa48("47715") ? true : (stryCov_9fa48("47715", "47716"), (stryMutAct_9fa48("47717") ? /insert\b/ : (stryCov_9fa48("47717"), /^insert\b/)).test(trimmed))) return QUERY_TYPE.INSERT;
      if (stryMutAct_9fa48("47719") ? false : stryMutAct_9fa48("47718") ? true : (stryCov_9fa48("47718", "47719"), (stryMutAct_9fa48("47720") ? /update\b/ : (stryCov_9fa48("47720"), /^update\b/)).test(trimmed))) return QUERY_TYPE.UPDATE;
      if (stryMutAct_9fa48("47722") ? false : stryMutAct_9fa48("47721") ? true : (stryCov_9fa48("47721", "47722"), (stryMutAct_9fa48("47723") ? /delete\b/ : (stryCov_9fa48("47723"), /^delete\b/)).test(trimmed))) return QUERY_TYPE.DELETE;
      return QUERY_TYPE.OTHER;
    }
  }

  /**
   * Request user confirmation for dangerous operations
   * Requirements: 10.1
   * @param {string} message - Confirmation message
   * @return {Promise<boolean>} True if confirmed
   */
  async requestConfirmation(message) {
    if (stryMutAct_9fa48("47724")) {
      {}
    } else {
      stryCov_9fa48("47724");
      return new Promise(resolve => {
        if (stryMutAct_9fa48("47725")) {
          {}
        } else {
          stryCov_9fa48("47725");
          this.confirmationCallback = resolve;
          this.emitEvent(stryMutAct_9fa48("47726") ? "" : (stryCov_9fa48("47726"), 'confirmation:request'), stryMutAct_9fa48("47727") ? {} : (stryCov_9fa48("47727"), {
            message
          }));

          // If no event bus or UI, auto-reject for safety
          if (stryMutAct_9fa48("47730") ? false : stryMutAct_9fa48("47729") ? true : stryMutAct_9fa48("47728") ? this.eventBus : (stryCov_9fa48("47728", "47729", "47730"), !this.eventBus)) {
            if (stryMutAct_9fa48("47731")) {
              {}
            } else {
              stryCov_9fa48("47731");
              resolve(stryMutAct_9fa48("47732") ? true : (stryCov_9fa48("47732"), false));
            }
          }
        }
      });
    }
  }

  /**
   * Handle confirmation response
   * @param {boolean} confirmed - Whether user confirmed
   */
  handleConfirmation(confirmed) {
    if (stryMutAct_9fa48("47733")) {
      {}
    } else {
      stryCov_9fa48("47733");
      if (stryMutAct_9fa48("47735") ? false : stryMutAct_9fa48("47734") ? true : (stryCov_9fa48("47734", "47735"), this.confirmationCallback)) {
        if (stryMutAct_9fa48("47736")) {
          {}
        } else {
          stryCov_9fa48("47736");
          this.confirmationCallback(confirmed);
          this.confirmationCallback = null;
        }
      }
    }
  }

  /**
   * Generate a unique query ID
   * @return {string} Query ID
   */
  generateQueryId() {
    if (stryMutAct_9fa48("47737")) {
      {}
    } else {
      stryCov_9fa48("47737");
      const timestamp = Date.now();
      const random = stryMutAct_9fa48("47738") ? Math.random().toString(36) : (stryCov_9fa48("47738"), Math.random().toString(36).substring(2, 11));
      return stryMutAct_9fa48("47739") ? `` : (stryCov_9fa48("47739"), `query_${timestamp}_${random}`);
    }
  }

  /**
   * Clear the query input
   */
  clearInput() {
    if (stryMutAct_9fa48("47740")) {
      {}
    } else {
      stryCov_9fa48("47740");
      this.queryInput.clear();
    }
  }

  /**
   * Get the current query text
   * @return {string} Current query
   */
  getQuery() {
    if (stryMutAct_9fa48("47741")) {
      {}
    } else {
      stryCov_9fa48("47741");
      return this.queryInput.getValue();
    }
  }

  /**
   * Set the query text
   * @param {string} sql - Query text
   */
  setQuery(sql) {
    if (stryMutAct_9fa48("47742")) {
      {}
    } else {
      stryCov_9fa48("47742");
      this.queryInput.setValue(sql);
    }
  }

  /**
   * Get read-only mode status
   * Requirements: 10.3
   * @return {boolean} True if read-only
   */
  isReadOnly() {
    if (stryMutAct_9fa48("47743")) {
      {}
    } else {
      stryCov_9fa48("47743");
      return this.readOnlyMode;
    }
  }

  /**
   * Set read-only mode
   * Requirements: 10.3
   * @param {boolean} enabled - Enable read-only mode
   */
  setReadOnly(enabled) {
    if (stryMutAct_9fa48("47744")) {
      {}
    } else {
      stryCov_9fa48("47744");
      this.readOnlyMode = enabled;
      this.emitEvent(stryMutAct_9fa48("47745") ? "" : (stryCov_9fa48("47745"), 'readonlymode:changed'), stryMutAct_9fa48("47746") ? {} : (stryCov_9fa48("47746"), {
        enabled
      }));
    }
  }

  /**
   * Toggle read-only mode
   * @return {boolean} New read-only state
   */
  toggleReadOnly() {
    if (stryMutAct_9fa48("47747")) {
      {}
    } else {
      stryCov_9fa48("47747");
      this.readOnlyMode = stryMutAct_9fa48("47748") ? this.readOnlyMode : (stryCov_9fa48("47748"), !this.readOnlyMode);
      this.emitEvent(stryMutAct_9fa48("47749") ? "" : (stryCov_9fa48("47749"), 'readonlymode:changed'), stryMutAct_9fa48("47750") ? {} : (stryCov_9fa48("47750"), {
        enabled: this.readOnlyMode
      }));
      return this.readOnlyMode;
    }
  }

  /**
   * Handle key input
   * Requirements: 32.7, 32.9
   * @param {Object} key - Key event
   * @return {boolean} True if handled
   */
  handleKey(key) {
    if (stryMutAct_9fa48("47751")) {
      {}
    } else {
      stryCov_9fa48("47751");
      const keyName = stryMutAct_9fa48("47754") ? (key.full || key.name) && '' : stryMutAct_9fa48("47753") ? false : stryMutAct_9fa48("47752") ? true : (stryCov_9fa48("47752", "47753", "47754"), (stryMutAct_9fa48("47756") ? key.full && key.name : stryMutAct_9fa48("47755") ? false : (stryCov_9fa48("47755", "47756"), key.full || key.name)) || (stryMutAct_9fa48("47757") ? "Stryker was here!" : (stryCov_9fa48("47757"), '')));

      // Ctrl+Enter to execute query
      if (stryMutAct_9fa48("47760") ? keyName === 'C-enter' && key.ctrl && keyName === 'enter' : stryMutAct_9fa48("47759") ? false : stryMutAct_9fa48("47758") ? true : (stryCov_9fa48("47758", "47759", "47760"), (stryMutAct_9fa48("47762") ? keyName !== 'C-enter' : stryMutAct_9fa48("47761") ? false : (stryCov_9fa48("47761", "47762"), keyName === (stryMutAct_9fa48("47763") ? "" : (stryCov_9fa48("47763"), 'C-enter')))) || (stryMutAct_9fa48("47765") ? key.ctrl || keyName === 'enter' : stryMutAct_9fa48("47764") ? false : (stryCov_9fa48("47764", "47765"), key.ctrl && (stryMutAct_9fa48("47767") ? keyName !== 'enter' : stryMutAct_9fa48("47766") ? true : (stryCov_9fa48("47766", "47767"), keyName === (stryMutAct_9fa48("47768") ? "" : (stryCov_9fa48("47768"), 'enter')))))))) {
        if (stryMutAct_9fa48("47769")) {
          {}
        } else {
          stryCov_9fa48("47769");
          this.executeQuery();
          return stryMutAct_9fa48("47770") ? false : (stryCov_9fa48("47770"), true);
        }
      }

      // Live query controls
      // Requirements: 32.7 - Pause/Resume with Ctrl+P
      if (stryMutAct_9fa48("47773") ? keyName === 'C-p' && key.ctrl && keyName === 'p' : stryMutAct_9fa48("47772") ? false : stryMutAct_9fa48("47771") ? true : (stryCov_9fa48("47771", "47772", "47773"), (stryMutAct_9fa48("47775") ? keyName !== 'C-p' : stryMutAct_9fa48("47774") ? false : (stryCov_9fa48("47774", "47775"), keyName === (stryMutAct_9fa48("47776") ? "" : (stryCov_9fa48("47776"), 'C-p')))) || (stryMutAct_9fa48("47778") ? key.ctrl || keyName === 'p' : stryMutAct_9fa48("47777") ? false : (stryCov_9fa48("47777", "47778"), key.ctrl && (stryMutAct_9fa48("47780") ? keyName !== 'p' : stryMutAct_9fa48("47779") ? true : (stryCov_9fa48("47779", "47780"), keyName === (stryMutAct_9fa48("47781") ? "" : (stryCov_9fa48("47781"), 'p')))))))) {
        if (stryMutAct_9fa48("47782")) {
          {}
        } else {
          stryCov_9fa48("47782");
          if (stryMutAct_9fa48("47784") ? false : stryMutAct_9fa48("47783") ? true : (stryCov_9fa48("47783", "47784"), this.hasActiveLiveQuery())) {
            if (stryMutAct_9fa48("47785")) {
              {}
            } else {
              stryCov_9fa48("47785");
              if (stryMutAct_9fa48("47788") ? this.liveQueryStatus !== LIVE_QUERY_STATUS.PAUSED : stryMutAct_9fa48("47787") ? false : stryMutAct_9fa48("47786") ? true : (stryCov_9fa48("47786", "47787", "47788"), this.liveQueryStatus === LIVE_QUERY_STATUS.PAUSED)) {
                if (stryMutAct_9fa48("47789")) {
                  {}
                } else {
                  stryCov_9fa48("47789");
                  this.resumeLiveQuery();
                }
              } else {
                if (stryMutAct_9fa48("47790")) {
                  {}
                } else {
                  stryCov_9fa48("47790");
                  this.pauseLiveQuery();
                }
              }
              return stryMutAct_9fa48("47791") ? false : (stryCov_9fa48("47791"), true);
            }
          }
        }
      }

      // Requirements: 32.9 - Cancel with Ctrl+C (when live query active)
      if (stryMutAct_9fa48("47794") ? keyName === 'C-c' && key.ctrl && keyName === 'c' : stryMutAct_9fa48("47793") ? false : stryMutAct_9fa48("47792") ? true : (stryCov_9fa48("47792", "47793", "47794"), (stryMutAct_9fa48("47796") ? keyName !== 'C-c' : stryMutAct_9fa48("47795") ? false : (stryCov_9fa48("47795", "47796"), keyName === (stryMutAct_9fa48("47797") ? "" : (stryCov_9fa48("47797"), 'C-c')))) || (stryMutAct_9fa48("47799") ? key.ctrl || keyName === 'c' : stryMutAct_9fa48("47798") ? false : (stryCov_9fa48("47798", "47799"), key.ctrl && (stryMutAct_9fa48("47801") ? keyName !== 'c' : stryMutAct_9fa48("47800") ? true : (stryCov_9fa48("47800", "47801"), keyName === (stryMutAct_9fa48("47802") ? "" : (stryCov_9fa48("47802"), 'c')))))))) {
        if (stryMutAct_9fa48("47803")) {
          {}
        } else {
          stryCov_9fa48("47803");
          if (stryMutAct_9fa48("47805") ? false : stryMutAct_9fa48("47804") ? true : (stryCov_9fa48("47804", "47805"), this.hasActiveLiveQuery())) {
            if (stryMutAct_9fa48("47806")) {
              {}
            } else {
              stryCov_9fa48("47806");
              this.cancelLiveQuery();
              return stryMutAct_9fa48("47807") ? false : (stryCov_9fa48("47807"), true);
            }
          }
        }
      }

      // Pass to query input
      return this.queryInput.handleKey(key);
    }
  }

  /**
   * Show the view
   */
  show() {
    if (stryMutAct_9fa48("47808")) {
      {}
    } else {
      stryCov_9fa48("47808");
      this.visible = stryMutAct_9fa48("47809") ? false : (stryCov_9fa48("47809"), true);
      if (stryMutAct_9fa48("47811") ? false : stryMutAct_9fa48("47810") ? true : (stryCov_9fa48("47810", "47811"), this.container)) {
        if (stryMutAct_9fa48("47812")) {
          {}
        } else {
          stryCov_9fa48("47812");
          this.container.show();
        }
      }
      this.emitEvent(stryMutAct_9fa48("47813") ? "" : (stryCov_9fa48("47813"), 'view:shown'));
    }
  }

  /**
   * Hide the view
   */
  hide() {
    if (stryMutAct_9fa48("47814")) {
      {}
    } else {
      stryCov_9fa48("47814");
      this.visible = stryMutAct_9fa48("47815") ? true : (stryCov_9fa48("47815"), false);
      if (stryMutAct_9fa48("47817") ? false : stryMutAct_9fa48("47816") ? true : (stryCov_9fa48("47816", "47817"), this.container)) {
        if (stryMutAct_9fa48("47818")) {
          {}
        } else {
          stryCov_9fa48("47818");
          this.container.hide();
        }
      }
      this.emitEvent(stryMutAct_9fa48("47819") ? "" : (stryCov_9fa48("47819"), 'view:hidden'));
    }
  }

  /**
   * Check if view is visible
   * @return {boolean} True if visible
   */
  isVisible() {
    if (stryMutAct_9fa48("47820")) {
      {}
    } else {
      stryCov_9fa48("47820");
      return this.visible;
    }
  }

  /**
   * Get the query history
   * @return {QueryHistory} Query history instance
   */
  getHistory() {
    if (stryMutAct_9fa48("47821")) {
      {}
    } else {
      stryCov_9fa48("47821");
      return this.queryHistory;
    }
  }

  /**
   * Get the results panel
   * @return {ResultsPanel} Results panel instance
   */
  getResultsPanel() {
    if (stryMutAct_9fa48("47822")) {
      {}
    } else {
      stryCov_9fa48("47822");
      return this.resultsPanel;
    }
  }

  /**
   * Get the query input
   * @return {QueryInput} Query input instance
   */
  getQueryInput() {
    if (stryMutAct_9fa48("47823")) {
      {}
    } else {
      stryCov_9fa48("47823");
      return this.queryInput;
    }
  }

  /**
   * Check if there are pending queries
   * @return {boolean} True if queries pending
   */
  hasPendingQueries() {
    if (stryMutAct_9fa48("47824")) {
      {}
    } else {
      stryCov_9fa48("47824");
      return stryMutAct_9fa48("47828") ? this.pendingQueries.size <= 0 : stryMutAct_9fa48("47827") ? this.pendingQueries.size >= 0 : stryMutAct_9fa48("47826") ? false : stryMutAct_9fa48("47825") ? true : (stryCov_9fa48("47825", "47826", "47827", "47828"), this.pendingQueries.size > 0);
    }
  }

  /**
   * Get pending query count
   * @return {number} Number of pending queries
   */
  getPendingQueryCount() {
    if (stryMutAct_9fa48("47829")) {
      {}
    } else {
      stryCov_9fa48("47829");
      return this.pendingQueries.size;
    }
  }

  /**
   * Cancel all pending queries
   */
  cancelPendingQueries() {
    if (stryMutAct_9fa48("47830")) {
      {}
    } else {
      stryCov_9fa48("47830");
      for (const [queryId] of this.pendingQueries) {
        if (stryMutAct_9fa48("47831")) {
          {}
        } else {
          stryCov_9fa48("47831");
          this.emitEvent(stryMutAct_9fa48("47832") ? "" : (stryCov_9fa48("47832"), 'query:cancelled'), stryMutAct_9fa48("47833") ? {} : (stryCov_9fa48("47833"), {
            queryId
          }));
        }
      }
      this.pendingQueries.clear();
    }
  }

  /**
   * Emit an event via the event bus
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitEvent(event, data = {}) {
    if (stryMutAct_9fa48("47834")) {
      {}
    } else {
      stryCov_9fa48("47834");
      if (stryMutAct_9fa48("47836") ? false : stryMutAct_9fa48("47835") ? true : (stryCov_9fa48("47835", "47836"), this.eventBus)) {
        if (stryMutAct_9fa48("47837")) {
          {}
        } else {
          stryCov_9fa48("47837");
          this.eventBus.emit(stryMutAct_9fa48("47838") ? `` : (stryCov_9fa48("47838"), `sqlqueryview:${event}`), data);
        }
      }
    }
  }

  /**
   * Set the container widget
   * @param {Object} container - Blessed container widget
   */
  setContainer(container) {
    if (stryMutAct_9fa48("47839")) {
      {}
    } else {
      stryCov_9fa48("47839");
      this.container = container;
    }
  }

  /**
   * Set data for the view (no-op for SQL view, required for ViewManager compatibility)
   * @param {Array} _data - Data items (ignored)
   */
  setData(_data) {
    // SQL view doesn't use table data - it has its own query results
    // This method exists for ViewManager compatibility
  }

  /**
   * Set filter (no-op for SQL view, required for ViewManager compatibility)
   * @param {string} _pattern - Filter pattern (ignored)
   */
  setFilter(_pattern) {
    // SQL view doesn't support filtering in the same way as table views
  }

  /**
   * Mark a row as changed (no-op for SQL view)
   * @param {string} _key - Row key (ignored)
   */
  markChanged(_key) {
    // SQL view doesn't track changed rows
  }

  /**
   * Clear changed row highlighting (no-op for SQL view)
   * @param {string} [_key] - Row key (ignored)
   */
  clearChanged(_key) {
    // SQL view doesn't track changed rows
  }

  /**
   * Move selection up (no-op for SQL view)
   * @param {number} [_count=1] - Number of rows (ignored)
   */
  selectUp(_count = 1) {
    // SQL view handles its own navigation
  }

  /**
   * Move selection down (no-op for SQL view)
   * @param {number} [_count=1] - Number of rows (ignored)
   */
  selectDown(_count = 1) {
    // SQL view handles its own navigation
  }

  /**
   * Select first row (no-op for SQL view)
   */
  selectFirst() {
    // SQL view handles its own navigation
  }

  /**
   * Select last row (no-op for SQL view)
   */
  selectLast() {
    // SQL view handles its own navigation
  }

  /**
   * Get selected details (for detail panel compatibility)
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    if (stryMutAct_9fa48("47840")) {
      {}
    } else {
      stryCov_9fa48("47840");
      // SQL view doesn't have row selection in the same way
      // Return info about current query state instead
      if (stryMutAct_9fa48("47843") ? !this.activeLiveQueryId || this.pendingQueries.size === 0 : stryMutAct_9fa48("47842") ? false : stryMutAct_9fa48("47841") ? true : (stryCov_9fa48("47841", "47842", "47843"), (stryMutAct_9fa48("47844") ? this.activeLiveQueryId : (stryCov_9fa48("47844"), !this.activeLiveQueryId)) && (stryMutAct_9fa48("47846") ? this.pendingQueries.size !== 0 : stryMutAct_9fa48("47845") ? true : (stryCov_9fa48("47845", "47846"), this.pendingQueries.size === 0)))) {
        if (stryMutAct_9fa48("47847")) {
          {}
        } else {
          stryCov_9fa48("47847");
          return null;
        }
      }
      const sections = stryMutAct_9fa48("47848") ? ["Stryker was here"] : (stryCov_9fa48("47848"), []);
      if (stryMutAct_9fa48("47850") ? false : stryMutAct_9fa48("47849") ? true : (stryCov_9fa48("47849", "47850"), this.activeLiveQueryId)) {
        if (stryMutAct_9fa48("47851")) {
          {}
        } else {
          stryCov_9fa48("47851");
          sections.push(stryMutAct_9fa48("47852") ? {} : (stryCov_9fa48("47852"), {
            title: stryMutAct_9fa48("47853") ? "" : (stryCov_9fa48("47853"), 'Live Query'),
            fields: stryMutAct_9fa48("47854") ? [] : (stryCov_9fa48("47854"), [stryMutAct_9fa48("47855") ? {} : (stryCov_9fa48("47855"), {
              label: stryMutAct_9fa48("47856") ? "" : (stryCov_9fa48("47856"), 'Subscription ID'),
              value: this.activeLiveQueryId
            }), stryMutAct_9fa48("47857") ? {} : (stryCov_9fa48("47857"), {
              label: stryMutAct_9fa48("47858") ? "" : (stryCov_9fa48("47858"), 'Status'),
              value: stryMutAct_9fa48("47861") ? this.liveQueryStatus && 'unknown' : stryMutAct_9fa48("47860") ? false : stryMutAct_9fa48("47859") ? true : (stryCov_9fa48("47859", "47860", "47861"), this.liveQueryStatus || (stryMutAct_9fa48("47862") ? "" : (stryCov_9fa48("47862"), 'unknown')))
            }), stryMutAct_9fa48("47863") ? {} : (stryCov_9fa48("47863"), {
              label: stryMutAct_9fa48("47864") ? "" : (stryCov_9fa48("47864"), 'Event Rate'),
              value: stryMutAct_9fa48("47865") ? `` : (stryCov_9fa48("47865"), `${this.getLiveQueryEventRate()}/s`)
            })])
          }));
        }
      }
      if (stryMutAct_9fa48("47869") ? this.pendingQueries.size <= 0 : stryMutAct_9fa48("47868") ? this.pendingQueries.size >= 0 : stryMutAct_9fa48("47867") ? false : stryMutAct_9fa48("47866") ? true : (stryCov_9fa48("47866", "47867", "47868", "47869"), this.pendingQueries.size > 0)) {
        if (stryMutAct_9fa48("47870")) {
          {}
        } else {
          stryCov_9fa48("47870");
          sections.push(stryMutAct_9fa48("47871") ? {} : (stryCov_9fa48("47871"), {
            title: stryMutAct_9fa48("47872") ? "" : (stryCov_9fa48("47872"), 'Pending Queries'),
            fields: stryMutAct_9fa48("47873") ? [] : (stryCov_9fa48("47873"), [stryMutAct_9fa48("47874") ? {} : (stryCov_9fa48("47874"), {
              label: stryMutAct_9fa48("47875") ? "" : (stryCov_9fa48("47875"), 'Count'),
              value: String(this.pendingQueries.size)
            })])
          }));
        }
      }
      return stryMutAct_9fa48("47876") ? {} : (stryCov_9fa48("47876"), {
        title: stryMutAct_9fa48("47877") ? "" : (stryCov_9fa48("47877"), 'SQL Query View'),
        sections
      });
    }
  }

  /**
   * Render the view
   * @param {Object} [_state] - Navigation state (optional)
   * @return {Object} Render data for ViewManager compatibility
   */
  render(_state) {
    if (stryMutAct_9fa48("47878")) {
      {}
    } else {
      stryCov_9fa48("47878");
      if (stryMutAct_9fa48("47880") ? false : stryMutAct_9fa48("47879") ? true : (stryCov_9fa48("47879", "47880"), this.queryInput)) {
        if (stryMutAct_9fa48("47881")) {
          {}
        } else {
          stryCov_9fa48("47881");
          this.queryInput.render();
        }
      }
      if (stryMutAct_9fa48("47883") ? false : stryMutAct_9fa48("47882") ? true : (stryCov_9fa48("47882", "47883"), this.resultsPanel)) {
        if (stryMutAct_9fa48("47884")) {
          {}
        } else {
          stryCov_9fa48("47884");
          this.resultsPanel.render();
        }
      }
      if (stryMutAct_9fa48("47886") ? false : stryMutAct_9fa48("47885") ? true : (stryCov_9fa48("47885", "47886"), this.liveStreamPanel)) {
        if (stryMutAct_9fa48("47887")) {
          {}
        } else {
          stryCov_9fa48("47887");
          this.liveStreamPanel.render();
        }
      }
      if (stryMutAct_9fa48("47889") ? false : stryMutAct_9fa48("47888") ? true : (stryCov_9fa48("47888", "47889"), this.screen)) {
        if (stryMutAct_9fa48("47890")) {
          {}
        } else {
          stryCov_9fa48("47890");
          this.screen.render();
        }
      }

      // Return empty render data for ViewManager compatibility
      // SQL view renders its own UI components
      return stryMutAct_9fa48("47891") ? {} : (stryCov_9fa48("47891"), {
        headers: stryMutAct_9fa48("47892") ? [] : (stryCov_9fa48("47892"), [stryMutAct_9fa48("47893") ? "" : (stryCov_9fa48("47893"), 'SQL Query View')]),
        rows: stryMutAct_9fa48("47894") ? ["Stryker was here"] : (stryCov_9fa48("47894"), []),
        columns: stryMutAct_9fa48("47895") ? ["Stryker was here"] : (stryCov_9fa48("47895"), []),
        filter: stryMutAct_9fa48("47896") ? "Stryker was here!" : (stryCov_9fa48("47896"), ''),
        sortColumn: null,
        sortDirection: stryMutAct_9fa48("47897") ? "" : (stryCov_9fa48("47897"), 'asc'),
        selectedIndex: stryMutAct_9fa48("47898") ? +1 : (stryCov_9fa48("47898"), -1),
        totalCount: 0,
        filteredCount: 0
      });
    }
  }

  /**
   * Handle live query event from connection manager
   * @param {Object} message - Live query event message
   */
  handleLiveQueryEvent(message) {
    if (stryMutAct_9fa48("47899")) {
      {}
    } else {
      stryCov_9fa48("47899");
      if (stryMutAct_9fa48("47901") ? false : stryMutAct_9fa48("47900") ? true : (stryCov_9fa48("47900", "47901"), this.liveQueryManager)) {
        if (stryMutAct_9fa48("47902")) {
          {}
        } else {
          stryCov_9fa48("47902");
          this.liveQueryManager.handleLiveQueryEvent(message);
        }
      }
    }
  }

  /**
   * Handle live query initialized event
   * Requirements: 32.2, 32.14
   * @param {Object} data - Event data
   */
  handleLiveQueryInitialized(data) {
    if (stryMutAct_9fa48("47903")) {
      {}
    } else {
      stryCov_9fa48("47903");
      if (stryMutAct_9fa48("47906") ? data.subscriptionId === this.activeLiveQueryId : stryMutAct_9fa48("47905") ? false : stryMutAct_9fa48("47904") ? true : (stryCov_9fa48("47904", "47905", "47906"), data.subscriptionId !== this.activeLiveQueryId)) {
        if (stryMutAct_9fa48("47907")) {
          {}
        } else {
          stryCov_9fa48("47907");
          return;
        }
      }

      // Display initial results
      if (stryMutAct_9fa48("47910") ? data.data || data.data.length > 0 : stryMutAct_9fa48("47909") ? false : stryMutAct_9fa48("47908") ? true : (stryCov_9fa48("47908", "47909", "47910"), data.data && (stryMutAct_9fa48("47913") ? data.data.length <= 0 : stryMutAct_9fa48("47912") ? data.data.length >= 0 : stryMutAct_9fa48("47911") ? true : (stryCov_9fa48("47911", "47912", "47913"), data.data.length > 0)))) {
        if (stryMutAct_9fa48("47914")) {
          {}
        } else {
          stryCov_9fa48("47914");
          this.resultsPanel.displaySelectResult(stryMutAct_9fa48("47915") ? {} : (stryCov_9fa48("47915"), {
            results: data.data,
            count: data.data.length
          }), 0);
        }
      }

      // Update status
      // Requirements: 32.6
      this.liveQueryStatus = LIVE_QUERY_STATUS.ACTIVE;
      this.emitEvent(stryMutAct_9fa48("47916") ? "" : (stryCov_9fa48("47916"), 'livequery:initialized'), stryMutAct_9fa48("47917") ? {} : (stryCov_9fa48("47917"), {
        subscriptionId: data.subscriptionId,
        partitions: data.partitions
      }));
    }
  }

  /**
   * Handle live query stream event
   * Requirements: 32.2, 32.3
   * @param {Object} data - Event data
   */
  handleLiveQueryStreamEvent(data) {
    if (stryMutAct_9fa48("47918")) {
      {}
    } else {
      stryCov_9fa48("47918");
      if (stryMutAct_9fa48("47921") ? data.subscriptionId === this.activeLiveQueryId : stryMutAct_9fa48("47920") ? false : stryMutAct_9fa48("47919") ? true : (stryCov_9fa48("47919", "47920", "47921"), data.subscriptionId !== this.activeLiveQueryId)) {
        if (stryMutAct_9fa48("47922")) {
          {}
        } else {
          stryCov_9fa48("47922");
          return;
        }
      }

      // Add event to live stream panel
      this.liveStreamPanel.addEvent(data.eventType, data.data, data.timestamp);
    }
  }

  /**
   * Handle live query expired event
   * Requirements: 32.8
   * @param {Object} data - Event data
   */
  handleLiveQueryExpired(data) {
    if (stryMutAct_9fa48("47923")) {
      {}
    } else {
      stryCov_9fa48("47923");
      if (stryMutAct_9fa48("47926") ? data.subscriptionId === this.activeLiveQueryId : stryMutAct_9fa48("47925") ? false : stryMutAct_9fa48("47924") ? true : (stryCov_9fa48("47924", "47925", "47926"), data.subscriptionId !== this.activeLiveQueryId)) {
        if (stryMutAct_9fa48("47927")) {
          {}
        } else {
          stryCov_9fa48("47927");
          return;
        }
      }
      this.liveQueryStatus = LIVE_QUERY_STATUS.EXPIRED;
      this.emitEvent(stryMutAct_9fa48("47928") ? "" : (stryCov_9fa48("47928"), 'livequery:expired'), stryMutAct_9fa48("47929") ? {} : (stryCov_9fa48("47929"), {
        subscriptionId: data.subscriptionId
      }));
    }
  }

  /**
   * Handle live query paused event
   * Requirements: 32.7
   * @param {Object} data - Event data
   */
  handleLiveQueryPaused(data) {
    if (stryMutAct_9fa48("47930")) {
      {}
    } else {
      stryCov_9fa48("47930");
      if (stryMutAct_9fa48("47933") ? data.subscriptionId === this.activeLiveQueryId : stryMutAct_9fa48("47932") ? false : stryMutAct_9fa48("47931") ? true : (stryCov_9fa48("47931", "47932", "47933"), data.subscriptionId !== this.activeLiveQueryId)) {
        if (stryMutAct_9fa48("47934")) {
          {}
        } else {
          stryCov_9fa48("47934");
          return;
        }
      }
      this.liveQueryStatus = LIVE_QUERY_STATUS.PAUSED;
      this.emitEvent(stryMutAct_9fa48("47935") ? "" : (stryCov_9fa48("47935"), 'livequery:paused'), stryMutAct_9fa48("47936") ? {} : (stryCov_9fa48("47936"), {
        subscriptionId: data.subscriptionId
      }));
    }
  }

  /**
   * Handle live query resumed event
   * Requirements: 32.7
   * @param {Object} data - Event data
   */
  handleLiveQueryResumed(data) {
    if (stryMutAct_9fa48("47937")) {
      {}
    } else {
      stryCov_9fa48("47937");
      if (stryMutAct_9fa48("47940") ? data.subscriptionId === this.activeLiveQueryId : stryMutAct_9fa48("47939") ? false : stryMutAct_9fa48("47938") ? true : (stryCov_9fa48("47938", "47939", "47940"), data.subscriptionId !== this.activeLiveQueryId)) {
        if (stryMutAct_9fa48("47941")) {
          {}
        } else {
          stryCov_9fa48("47941");
          return;
        }
      }
      this.liveQueryStatus = LIVE_QUERY_STATUS.ACTIVE;
      this.emitEvent(stryMutAct_9fa48("47942") ? "" : (stryCov_9fa48("47942"), 'livequery:resumed'), stryMutAct_9fa48("47943") ? {} : (stryCov_9fa48("47943"), {
        subscriptionId: data.subscriptionId
      }));
    }
  }

  /**
   * Pause the active live query
   * Requirements: 32.7
   * @return {boolean} True if paused
   */
  pauseLiveQuery() {
    if (stryMutAct_9fa48("47944")) {
      {}
    } else {
      stryCov_9fa48("47944");
      if (stryMutAct_9fa48("47947") ? !this.activeLiveQueryId && !this.liveQueryManager : stryMutAct_9fa48("47946") ? false : stryMutAct_9fa48("47945") ? true : (stryCov_9fa48("47945", "47946", "47947"), (stryMutAct_9fa48("47948") ? this.activeLiveQueryId : (stryCov_9fa48("47948"), !this.activeLiveQueryId)) || (stryMutAct_9fa48("47949") ? this.liveQueryManager : (stryCov_9fa48("47949"), !this.liveQueryManager)))) {
        if (stryMutAct_9fa48("47950")) {
          {}
        } else {
          stryCov_9fa48("47950");
          return stryMutAct_9fa48("47951") ? true : (stryCov_9fa48("47951"), false);
        }
      }
      return this.liveQueryManager.pause(this.activeLiveQueryId);
    }
  }

  /**
   * Resume the active live query
   * Requirements: 32.7
   * @return {boolean} True if resumed
   */
  resumeLiveQuery() {
    if (stryMutAct_9fa48("47952")) {
      {}
    } else {
      stryCov_9fa48("47952");
      if (stryMutAct_9fa48("47955") ? !this.activeLiveQueryId && !this.liveQueryManager : stryMutAct_9fa48("47954") ? false : stryMutAct_9fa48("47953") ? true : (stryCov_9fa48("47953", "47954", "47955"), (stryMutAct_9fa48("47956") ? this.activeLiveQueryId : (stryCov_9fa48("47956"), !this.activeLiveQueryId)) || (stryMutAct_9fa48("47957") ? this.liveQueryManager : (stryCov_9fa48("47957"), !this.liveQueryManager)))) {
        if (stryMutAct_9fa48("47958")) {
          {}
        } else {
          stryCov_9fa48("47958");
          return stryMutAct_9fa48("47959") ? true : (stryCov_9fa48("47959"), false);
        }
      }
      return this.liveQueryManager.resume(this.activeLiveQueryId);
    }
  }

  /**
   * Cancel the active live query
   * Requirements: 32.9
   * @return {boolean} True if cancelled
   */
  cancelLiveQuery() {
    if (stryMutAct_9fa48("47960")) {
      {}
    } else {
      stryCov_9fa48("47960");
      if (stryMutAct_9fa48("47963") ? !this.activeLiveQueryId && !this.liveQueryManager : stryMutAct_9fa48("47962") ? false : stryMutAct_9fa48("47961") ? true : (stryCov_9fa48("47961", "47962", "47963"), (stryMutAct_9fa48("47964") ? this.activeLiveQueryId : (stryCov_9fa48("47964"), !this.activeLiveQueryId)) || (stryMutAct_9fa48("47965") ? this.liveQueryManager : (stryCov_9fa48("47965"), !this.liveQueryManager)))) {
        if (stryMutAct_9fa48("47966")) {
          {}
        } else {
          stryCov_9fa48("47966");
          return stryMutAct_9fa48("47967") ? true : (stryCov_9fa48("47967"), false);
        }
      }
      const result = this.liveQueryManager.cancel(this.activeLiveQueryId);
      if (stryMutAct_9fa48("47969") ? false : stryMutAct_9fa48("47968") ? true : (stryCov_9fa48("47968", "47969"), result)) {
        if (stryMutAct_9fa48("47970")) {
          {}
        } else {
          stryCov_9fa48("47970");
          this.activeLiveQueryId = null;
          this.liveQueryStatus = LIVE_QUERY_STATUS.CANCELLED;
        }
      }
      return result;
    }
  }

  /**
   * Renew an expired live query
   * Requirements: 32.8
   * @return {boolean} True if renewal initiated
   */
  renewLiveQuery() {
    if (stryMutAct_9fa48("47971")) {
      {}
    } else {
      stryCov_9fa48("47971");
      if (stryMutAct_9fa48("47974") ? !this.activeLiveQueryId && !this.liveQueryManager : stryMutAct_9fa48("47973") ? false : stryMutAct_9fa48("47972") ? true : (stryCov_9fa48("47972", "47973", "47974"), (stryMutAct_9fa48("47975") ? this.activeLiveQueryId : (stryCov_9fa48("47975"), !this.activeLiveQueryId)) || (stryMutAct_9fa48("47976") ? this.liveQueryManager : (stryCov_9fa48("47976"), !this.liveQueryManager)))) {
        if (stryMutAct_9fa48("47977")) {
          {}
        } else {
          stryCov_9fa48("47977");
          return stryMutAct_9fa48("47978") ? true : (stryCov_9fa48("47978"), false);
        }
      }
      return this.liveQueryManager.renew(this.activeLiveQueryId);
    }
  }

  /**
   * Check if there is an active live query
   * @return {boolean} True if live query is active
   */
  hasActiveLiveQuery() {
    if (stryMutAct_9fa48("47979")) {
      {}
    } else {
      stryCov_9fa48("47979");
      return stryMutAct_9fa48("47982") ? this.activeLiveQueryId !== null || this.liveQueryStatus === LIVE_QUERY_STATUS.ACTIVE : stryMutAct_9fa48("47981") ? false : stryMutAct_9fa48("47980") ? true : (stryCov_9fa48("47980", "47981", "47982"), (stryMutAct_9fa48("47984") ? this.activeLiveQueryId === null : stryMutAct_9fa48("47983") ? true : (stryCov_9fa48("47983", "47984"), this.activeLiveQueryId !== null)) && (stryMutAct_9fa48("47986") ? this.liveQueryStatus !== LIVE_QUERY_STATUS.ACTIVE : stryMutAct_9fa48("47985") ? true : (stryCov_9fa48("47985", "47986"), this.liveQueryStatus === LIVE_QUERY_STATUS.ACTIVE)));
    }
  }

  /**
   * Get the active live query subscription ID
   * @return {string|null} Subscription ID or null
   */
  getActiveLiveQueryId() {
    if (stryMutAct_9fa48("47987")) {
      {}
    } else {
      stryCov_9fa48("47987");
      return this.activeLiveQueryId;
    }
  }

  /**
   * Get the live query status
   * Requirements: 32.6
   * @return {string|null} Status or null
   */
  getLiveQueryStatus() {
    if (stryMutAct_9fa48("47988")) {
      {}
    } else {
      stryCov_9fa48("47988");
      return this.liveQueryStatus;
    }
  }

  /**
   * Get the live query event rate
   * Requirements: 32.10
   * @return {number} Events per second
   */
  getLiveQueryEventRate() {
    if (stryMutAct_9fa48("47989")) {
      {}
    } else {
      stryCov_9fa48("47989");
      if (stryMutAct_9fa48("47992") ? !this.activeLiveQueryId && !this.liveQueryManager : stryMutAct_9fa48("47991") ? false : stryMutAct_9fa48("47990") ? true : (stryCov_9fa48("47990", "47991", "47992"), (stryMutAct_9fa48("47993") ? this.activeLiveQueryId : (stryCov_9fa48("47993"), !this.activeLiveQueryId)) || (stryMutAct_9fa48("47994") ? this.liveQueryManager : (stryCov_9fa48("47994"), !this.liveQueryManager)))) {
        if (stryMutAct_9fa48("47995")) {
          {}
        } else {
          stryCov_9fa48("47995");
          return 0;
        }
      }
      const subscription = this.liveQueryManager.getSubscription(this.activeLiveQueryId);
      return subscription ? subscription.eventRate : 0;
    }
  }

  /**
   * Get the monitored partitions for the live query
   * Requirements: 32.14
   * @return {string[]} Partition IDs
   */
  getLiveQueryPartitions() {
    if (stryMutAct_9fa48("47996")) {
      {}
    } else {
      stryCov_9fa48("47996");
      if (stryMutAct_9fa48("47999") ? !this.activeLiveQueryId && !this.liveQueryManager : stryMutAct_9fa48("47998") ? false : stryMutAct_9fa48("47997") ? true : (stryCov_9fa48("47997", "47998", "47999"), (stryMutAct_9fa48("48000") ? this.activeLiveQueryId : (stryCov_9fa48("48000"), !this.activeLiveQueryId)) || (stryMutAct_9fa48("48001") ? this.liveQueryManager : (stryCov_9fa48("48001"), !this.liveQueryManager)))) {
        if (stryMutAct_9fa48("48002")) {
          {}
        } else {
          stryCov_9fa48("48002");
          return stryMutAct_9fa48("48003") ? ["Stryker was here"] : (stryCov_9fa48("48003"), []);
        }
      }
      const subscription = this.liveQueryManager.getSubscription(this.activeLiveQueryId);
      return subscription ? subscription.partitions : stryMutAct_9fa48("48004") ? ["Stryker was here"] : (stryCov_9fa48("48004"), []);
    }
  }

  /**
   * Get the live stream panel
   * @return {LiveStreamPanel} Live stream panel instance
   */
  getLiveStreamPanel() {
    if (stryMutAct_9fa48("48005")) {
      {}
    } else {
      stryCov_9fa48("48005");
      return this.liveStreamPanel;
    }
  }

  /**
   * Destroy the view and clean up resources
   */
  destroy() {
    if (stryMutAct_9fa48("48006")) {
      {}
    } else {
      stryCov_9fa48("48006");
      this.cancelPendingQueries();

      // Cancel any active live query
      if (stryMutAct_9fa48("48009") ? this.activeLiveQueryId || this.liveQueryManager : stryMutAct_9fa48("48008") ? false : stryMutAct_9fa48("48007") ? true : (stryCov_9fa48("48007", "48008", "48009"), this.activeLiveQueryId && this.liveQueryManager)) {
        if (stryMutAct_9fa48("48010")) {
          {}
        } else {
          stryCov_9fa48("48010");
          this.liveQueryManager.cancel(this.activeLiveQueryId);
          this.activeLiveQueryId = null;
        }
      }
      if (stryMutAct_9fa48("48012") ? false : stryMutAct_9fa48("48011") ? true : (stryCov_9fa48("48011", "48012"), this.queryHistory)) {
        if (stryMutAct_9fa48("48013")) {
          {}
        } else {
          stryCov_9fa48("48013");
          this.queryHistory.save();
        }
      }
      this.queryInput = null;
      this.resultsPanel = null;
      this.queryHistory = null;
      this.autocomplete = null;
      this.syntaxHighlighter = null;
      this.liveStreamPanel = null;
      this.connectionManager = null;
      this.liveQueryManager = null;
      this.cache = null;
      this.eventBus = null;
    }
  }
}