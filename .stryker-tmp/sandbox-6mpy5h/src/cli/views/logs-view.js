/**
 * LogsView - Displays system logs with filtering and highlighting
 *
 * Streams logs via LIVE SELECT from the owning partition (logs is a
 * non-propagated table, so it is never in the SystemTableCache).
 * When filters change, the view re-subscribes with an updated
 * server-side WHERE clause.
 *
 * Columns: timestamp, level, node_id, service_id, message
 * Supports multi-criteria filtering, level-based highlighting, and sorting.
 *
 * Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 29.8,
 *               29.9, 29.11, 29.12
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
 * Log levels in order of severity
 */
export const LOG_LEVELS = stryMutAct_9fa48("49539") ? [] : (stryCov_9fa48("49539"), [stryMutAct_9fa48("49540") ? "" : (stryCov_9fa48("49540"), 'ERROR'), stryMutAct_9fa48("49541") ? "" : (stryCov_9fa48("49541"), 'WARN'), stryMutAct_9fa48("49542") ? "" : (stryCov_9fa48("49542"), 'INFO'), stryMutAct_9fa48("49543") ? "" : (stryCov_9fa48("49543"), 'DEBUG'), stryMutAct_9fa48("49544") ? "" : (stryCov_9fa48("49544"), 'TRACE')]);

/**
 * Color mappings for log levels
 * Requirements: 29.8
 */
export const LOG_LEVEL_COLORS = stryMutAct_9fa48("49545") ? {} : (stryCov_9fa48("49545"), {
  ERROR: stryMutAct_9fa48("49546") ? "" : (stryCov_9fa48("49546"), 'red'),
  WARN: stryMutAct_9fa48("49547") ? "" : (stryCov_9fa48("49547"), 'yellow'),
  INFO: stryMutAct_9fa48("49548") ? "" : (stryCov_9fa48("49548"), 'white'),
  DEBUG: stryMutAct_9fa48("49549") ? "" : (stryCov_9fa48("49549"), 'gray'),
  TRACE: stryMutAct_9fa48("49550") ? "" : (stryCov_9fa48("49550"), 'gray')
});
const LOGS_QUERY_LIMIT = 200;
const LOGS_TABLE = stryMutAct_9fa48("49551") ? "" : (stryCov_9fa48("49551"), 'logs');
const LOGS_QUERY_ORDER_BY = stryMutAct_9fa48("49552") ? "" : (stryCov_9fa48("49552"), 'timestamp DESC, created_at DESC, log_id DESC');
const LOGS_QUERY_SELECT_ALL = stryMutAct_9fa48("49553") ? "" : (stryCov_9fa48("49553"), 'SELECT *');
const LOGS_QUERY_LIVE_PREFIX = stryMutAct_9fa48("49554") ? "" : (stryCov_9fa48("49554"), 'LIVE ');
const LOGS_QUERY_WHERE = stryMutAct_9fa48("49555") ? "" : (stryCov_9fa48("49555"), ' WHERE ');
const LOGS_QUERY_AND = stryMutAct_9fa48("49556") ? "" : (stryCov_9fa48("49556"), ' AND ');
const LOGS_QUERY_EQUAL = stryMutAct_9fa48("49557") ? "" : (stryCov_9fa48("49557"), ' = ');
const LOGS_QUERY_GTE = stryMutAct_9fa48("49558") ? "" : (stryCov_9fa48("49558"), ' >= ');
const LOGS_QUERY_LTE = stryMutAct_9fa48("49559") ? "" : (stryCov_9fa48("49559"), ' <= ');
const LOGS_QUERY_LIKE = stryMutAct_9fa48("49560") ? "" : (stryCov_9fa48("49560"), ' LIKE ');
const LOGS_QUERY_LIMIT_CLAUSE = stryMutAct_9fa48("49561") ? `` : (stryCov_9fa48("49561"), ` LIMIT ${LOGS_QUERY_LIMIT}`);
const LOGS_QUERY_ORDER_BY_CLAUSE = stryMutAct_9fa48("49562") ? `` : (stryCov_9fa48("49562"), ` ORDER BY ${LOGS_QUERY_ORDER_BY}`);
const LOGS_QUERY_ERROR_ID = stryMutAct_9fa48("49563") ? "" : (stryCov_9fa48("49563"), 'logs_error');
const LOGS_HIGHLIGHT_MAX_CHANGED_ROWS = 24;
const LOGS_SYSTEM_NODE_ID = stryMutAct_9fa48("49564") ? "" : (stryCov_9fa48("49564"), 'system');
const LOGS_SYSTEM_SERVICE_ID = stryMutAct_9fa48("49565") ? "" : (stryCov_9fa48("49565"), 'admin-cli');
const LOGS_QUERY_ERROR_PREFIX = stryMutAct_9fa48("49566") ? "" : (stryCov_9fa48("49566"), 'Live query error: ');
const LOGS_LIVE_QUERY_UNAVAILABLE_ERROR = stryMutAct_9fa48("49567") ? `` : (stryCov_9fa48("49567"), `${LOGS_QUERY_ERROR_PREFIX}Live query manager not available`);
const LOGS_TIMESTAMP_UNAVAILABLE = stryMutAct_9fa48("49568") ? "" : (stryCov_9fa48("49568"), 'N/A');
const LOGS_TIMESTAMP_INTEGER_REGEX = stryMutAct_9fa48("49573") ? /^-?\D+$/ : stryMutAct_9fa48("49572") ? /^-?\d$/ : stryMutAct_9fa48("49571") ? /^-\d+$/ : stryMutAct_9fa48("49570") ? /^-?\d+/ : stryMutAct_9fa48("49569") ? /-?\d+$/ : (stryCov_9fa48("49569", "49570", "49571", "49572", "49573"), /^-?\d+$/);
const LOGS_TIMESTAMP_EPOCH_SECONDS_MAX_ABS = 10000000000;
const LOGS_TIMESTAMP_MILLISECONDS_PER_SECOND = 1000;
const LOGS_SORT_FALLBACK_ID_FIELD = stryMutAct_9fa48("49574") ? "" : (stryCov_9fa48("49574"), 'log_id');
const LOGS_SINCE_RESET_VALUE = stryMutAct_9fa48("49575") ? "" : (stryCov_9fa48("49575"), 'now');
const LOGS_SINCE_INVALID_VALUE_PREFIX = stryMutAct_9fa48("49576") ? "" : (stryCov_9fa48("49576"), 'Invalid since value: ');
const LOGS_SINCE_RELATIVE_REGEX = stryMutAct_9fa48("49580") ? /^-(\D+)(ms|s|m|h|d)$/i : stryMutAct_9fa48("49579") ? /^-(\d)(ms|s|m|h|d)$/i : stryMutAct_9fa48("49578") ? /^-(\d+)(ms|s|m|h|d)/i : stryMutAct_9fa48("49577") ? /-(\d+)(ms|s|m|h|d)$/i : (stryCov_9fa48("49577", "49578", "49579", "49580"), /^-(\d+)(ms|s|m|h|d)$/i);
const LOGS_RELATIVE_UNIT_MILLISECONDS = stryMutAct_9fa48("49581") ? {} : (stryCov_9fa48("49581"), {
  ms: 1,
  s: 1000,
  m: stryMutAct_9fa48("49582") ? 60 / 1000 : (stryCov_9fa48("49582"), 60 * 1000),
  h: stryMutAct_9fa48("49583") ? 60 * 60 / 1000 : (stryCov_9fa48("49583"), (stryMutAct_9fa48("49584") ? 60 / 60 : (stryCov_9fa48("49584"), 60 * 60)) * 1000),
  d: stryMutAct_9fa48("49585") ? 24 * 60 * 60 / 1000 : (stryCov_9fa48("49585"), (stryMutAct_9fa48("49586") ? 24 * 60 / 60 : (stryCov_9fa48("49586"), (stryMutAct_9fa48("49587") ? 24 / 60 : (stryCov_9fa48("49587"), 24 * 60)) * 60)) * 1000)
});
const LOGS_EVENT_TYPE_SNAPSHOT = stryMutAct_9fa48("49588") ? "" : (stryCov_9fa48("49588"), 'SNAPSHOT');
const LOGS_EVENT_TYPE_INSERT = stryMutAct_9fa48("49589") ? "" : (stryCov_9fa48("49589"), 'INSERT');
const LOGS_EVENT_TYPE_UPDATE = stryMutAct_9fa48("49590") ? "" : (stryCov_9fa48("49590"), 'UPDATE');
const LOGS_EVENT_TYPE_DELETE = stryMutAct_9fa48("49591") ? "" : (stryCov_9fa48("49591"), 'DELETE');

/**
 * LogsView displays system logs with filtering and highlighting
 */
export class LogsView extends BaseView {
  /**
   * Creates a new LogsView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {import('../core/connection-manager.js').ConnectionManager}
   *   [options.connectionManager] - Connection manager for SQL queries
   * @param {boolean} [options.liveQueryEnabled=false] - Enable live query
   *   subscription for logs view.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("49592")) {
      {}
    } else {
      stryCov_9fa48("49592");
      super(options);
      this.cache = stryMutAct_9fa48("49595") ? options.cache && null : stryMutAct_9fa48("49594") ? false : stryMutAct_9fa48("49593") ? true : (stryCov_9fa48("49593", "49594", "49595"), options.cache || null);
      this.connectionManager = stryMutAct_9fa48("49598") ? options.connectionManager && null : stryMutAct_9fa48("49597") ? false : stryMutAct_9fa48("49596") ? true : (stryCov_9fa48("49596", "49597", "49598"), options.connectionManager || null);
      this.liveQueryManager = stryMutAct_9fa48("49601") ? options.liveQueryManager && null : stryMutAct_9fa48("49600") ? false : stryMutAct_9fa48("49599") ? true : (stryCov_9fa48("49599", "49600", "49601"), options.liveQueryManager || null);
      this.liveQueryEnabled = stryMutAct_9fa48("49604") ? options.liveQueryEnabled !== true : stryMutAct_9fa48("49603") ? false : stryMutAct_9fa48("49602") ? true : (stryCov_9fa48("49602", "49603", "49604"), options.liveQueryEnabled === (stryMutAct_9fa48("49605") ? false : (stryCov_9fa48("49605"), true)));
      this.viewName = stryMutAct_9fa48("49606") ? "" : (stryCov_9fa48("49606"), 'logs');

      // Multi-criteria filter state
      this.levelFilter = null;
      this.nodeFilter = null;
      this.serviceFilter = null;
      this.startTimeFilter = null;
      this.endTimeFilter = null;
      this.messageFilter = null;

      // Default sort by timestamp descending (most recent first)
      this.sortColumn = stryMutAct_9fa48("49607") ? "" : (stryCov_9fa48("49607"), 'timestamp');
      this.sortDirection = stryMutAct_9fa48("49608") ? "" : (stryCov_9fa48("49608"), 'desc');

      // Streaming state (kept for API compat; actual streaming
      // is driven by live query events)
      this.streamingEnabled = stryMutAct_9fa48("49609") ? false : (stryCov_9fa48("49609"), true);
      this.changedLogIdQueue = stryMutAct_9fa48("49610") ? ["Stryker was here"] : (stryCov_9fa48("49610"), []);

      // Live query subscription tracking
      this.activeSubscriptionId = null;
      this.activeLiveQuerySql = null;
      this.viewEnteredAt = null;
      this.internalSetDataInProgress = stryMutAct_9fa48("49611") ? true : (stryCov_9fa48("49611"), false);

      // Wire up live query event listeners
      this.setupLiveQueryListeners();
    }
  }

  /**
   * Show the logs view and start a fresh live window from entry time.
   */
  show() {
    if (stryMutAct_9fa48("49612")) {
      {}
    } else {
      stryCov_9fa48("49612");
      super.show();
      if (stryMutAct_9fa48("49615") ? this.liveQueryEnabled === true : stryMutAct_9fa48("49614") ? false : stryMutAct_9fa48("49613") ? true : (stryCov_9fa48("49613", "49614", "49615"), this.liveQueryEnabled !== (stryMutAct_9fa48("49616") ? false : (stryCov_9fa48("49616"), true)))) {
        if (stryMutAct_9fa48("49617")) {
          {}
        } else {
          stryCov_9fa48("49617");
          return;
        }
      }
      this.viewEnteredAt = Date.now();
      this.startTimeFilter = this.viewEnteredAt;
      this.endTimeFilter = null;
      this.clearChangedLogHighlights();
      this.replaceData(stryMutAct_9fa48("49618") ? ["Stryker was here"] : (stryCov_9fa48("49618"), []));
      this.fetchLogs();
    }
  }

  /**
   * Hide the logs view and stop any active live query subscription.
   */
  hide() {
    if (stryMutAct_9fa48("49619")) {
      {}
    } else {
      stryCov_9fa48("49619");
      this.cancelActiveLiveQuerySubscription();
      super.hide();
    }
  }

  /**
   * Listen for live query events (initial snapshot and incremental CDC).
   * @private
   */
  setupLiveQueryListeners() {
    if (stryMutAct_9fa48("49620")) {
      {}
    } else {
      stryCov_9fa48("49620");
      if (stryMutAct_9fa48("49623") ? false : stryMutAct_9fa48("49622") ? true : stryMutAct_9fa48("49621") ? this.eventBus : (stryCov_9fa48("49621", "49622", "49623"), !this.eventBus)) {
        if (stryMutAct_9fa48("49624")) {
          {}
        } else {
          stryCov_9fa48("49624");
          return;
        }
      }
      this.eventBus.on(stryMutAct_9fa48("49625") ? "" : (stryCov_9fa48("49625"), 'livequery:initialized'), event => {
        if (stryMutAct_9fa48("49626")) {
          {}
        } else {
          stryCov_9fa48("49626");
          if (stryMutAct_9fa48("49629") ? false : stryMutAct_9fa48("49628") ? true : stryMutAct_9fa48("49627") ? this.activeSubscriptionId : (stryCov_9fa48("49627", "49628", "49629"), !this.activeSubscriptionId)) {
            if (stryMutAct_9fa48("49630")) {
              {}
            } else {
              stryCov_9fa48("49630");
              return;
            }
          }
          if (stryMutAct_9fa48("49633") ? event.subscriptionId === this.activeSubscriptionId : stryMutAct_9fa48("49632") ? false : stryMutAct_9fa48("49631") ? true : (stryCov_9fa48("49631", "49632", "49633"), event.subscriptionId !== this.activeSubscriptionId)) {
            if (stryMutAct_9fa48("49634")) {
              {}
            } else {
              stryCov_9fa48("49634");
              return;
            }
          }
          const rows = Array.isArray(event.data) ? event.data : stryMutAct_9fa48("49635") ? ["Stryker was here"] : (stryCov_9fa48("49635"), []);
          this.applySnapshotRows(rows);
          this.eventBus.emit(stryMutAct_9fa48("49636") ? "" : (stryCov_9fa48("49636"), 'view:refresh'), stryMutAct_9fa48("49637") ? {} : (stryCov_9fa48("49637"), {
            view: this
          }));
        }
      });
      this.eventBus.on(stryMutAct_9fa48("49638") ? "" : (stryCov_9fa48("49638"), 'livequery:event'), event => {
        if (stryMutAct_9fa48("49639")) {
          {}
        } else {
          stryCov_9fa48("49639");
          if (stryMutAct_9fa48("49642") ? false : stryMutAct_9fa48("49641") ? true : stryMutAct_9fa48("49640") ? this.activeSubscriptionId : (stryCov_9fa48("49640", "49641", "49642"), !this.activeSubscriptionId)) {
            if (stryMutAct_9fa48("49643")) {
              {}
            } else {
              stryCov_9fa48("49643");
              return;
            }
          }
          if (stryMutAct_9fa48("49646") ? event.subscriptionId === this.activeSubscriptionId : stryMutAct_9fa48("49645") ? false : stryMutAct_9fa48("49644") ? true : (stryCov_9fa48("49644", "49645", "49646"), event.subscriptionId !== this.activeSubscriptionId)) {
            if (stryMutAct_9fa48("49647")) {
              {}
            } else {
              stryCov_9fa48("49647");
              return;
            }
          }
          const eventType = stryMutAct_9fa48("49648") ? (event.eventType || '').toLowerCase() : (stryCov_9fa48("49648"), (stryMutAct_9fa48("49651") ? event.eventType && '' : stryMutAct_9fa48("49650") ? false : stryMutAct_9fa48("49649") ? true : (stryCov_9fa48("49649", "49650", "49651"), event.eventType || (stryMutAct_9fa48("49652") ? "Stryker was here!" : (stryCov_9fa48("49652"), '')))).toUpperCase());
          if (stryMutAct_9fa48("49655") ? eventType === LOGS_EVENT_TYPE_SNAPSHOT || Array.isArray(event.data) : stryMutAct_9fa48("49654") ? false : stryMutAct_9fa48("49653") ? true : (stryCov_9fa48("49653", "49654", "49655"), (stryMutAct_9fa48("49657") ? eventType !== LOGS_EVENT_TYPE_SNAPSHOT : stryMutAct_9fa48("49656") ? true : (stryCov_9fa48("49656", "49657"), eventType === LOGS_EVENT_TYPE_SNAPSHOT)) && Array.isArray(event.data))) {
            if (stryMutAct_9fa48("49658")) {
              {}
            } else {
              stryCov_9fa48("49658");
              this.applySnapshotRows(event.data);
              this.eventBus.emit(stryMutAct_9fa48("49659") ? "" : (stryCov_9fa48("49659"), 'view:refresh'), stryMutAct_9fa48("49660") ? {} : (stryCov_9fa48("49660"), {
                view: this
              }));
              return;
            }
          }
          if (stryMutAct_9fa48("49663") ? eventType === LOGS_EVENT_TYPE_INSERT || eventType === LOGS_EVENT_TYPE_UPDATE || event.data : stryMutAct_9fa48("49662") ? false : stryMutAct_9fa48("49661") ? true : (stryCov_9fa48("49661", "49662", "49663"), (stryMutAct_9fa48("49665") ? eventType === LOGS_EVENT_TYPE_INSERT && eventType === LOGS_EVENT_TYPE_UPDATE : stryMutAct_9fa48("49664") ? true : (stryCov_9fa48("49664", "49665"), (stryMutAct_9fa48("49667") ? eventType !== LOGS_EVENT_TYPE_INSERT : stryMutAct_9fa48("49666") ? false : (stryCov_9fa48("49666", "49667"), eventType === LOGS_EVENT_TYPE_INSERT)) || (stryMutAct_9fa48("49669") ? eventType !== LOGS_EVENT_TYPE_UPDATE : stryMutAct_9fa48("49668") ? false : (stryCov_9fa48("49668", "49669"), eventType === LOGS_EVENT_TYPE_UPDATE)))) && event.data)) {
            if (stryMutAct_9fa48("49670")) {
              {}
            } else {
              stryCov_9fa48("49670");
              const selectedLogId = stryMutAct_9fa48("49673") ? this.getSelectedItem()?.log_id && null : stryMutAct_9fa48("49672") ? false : stryMutAct_9fa48("49671") ? true : (stryCov_9fa48("49671", "49672", "49673"), (stryMutAct_9fa48("49674") ? this.getSelectedItem().log_id : (stryCov_9fa48("49674"), this.getSelectedItem()?.log_id)) || null);
              const incomingLog = stryMutAct_9fa48("49675") ? {} : (stryCov_9fa48("49675"), {
                ...event.data
              });
              const incomingLogId = this.getItemKey(incomingLog);
              let replaced = stryMutAct_9fa48("49676") ? true : (stryCov_9fa48("49676"), false);
              if (stryMutAct_9fa48("49678") ? false : stryMutAct_9fa48("49677") ? true : (stryCov_9fa48("49677", "49678"), incomingLogId)) {
                if (stryMutAct_9fa48("49679")) {
                  {}
                } else {
                  stryCov_9fa48("49679");
                  const existingIndex = this.data.findIndex(stryMutAct_9fa48("49680") ? () => undefined : (stryCov_9fa48("49680"), log => stryMutAct_9fa48("49683") ? this.getItemKey(log) !== incomingLogId : stryMutAct_9fa48("49682") ? false : stryMutAct_9fa48("49681") ? true : (stryCov_9fa48("49681", "49682", "49683"), this.getItemKey(log) === incomingLogId)));
                  if (stryMutAct_9fa48("49687") ? existingIndex < 0 : stryMutAct_9fa48("49686") ? existingIndex > 0 : stryMutAct_9fa48("49685") ? false : stryMutAct_9fa48("49684") ? true : (stryCov_9fa48("49684", "49685", "49686", "49687"), existingIndex >= 0)) {
                    if (stryMutAct_9fa48("49688")) {
                      {}
                    } else {
                      stryCov_9fa48("49688");
                      this.data[existingIndex] = incomingLog;
                      replaced = stryMutAct_9fa48("49689") ? false : (stryCov_9fa48("49689"), true);
                    }
                  }
                }
              }
              if (stryMutAct_9fa48("49692") ? false : stryMutAct_9fa48("49691") ? true : stryMutAct_9fa48("49690") ? replaced : (stryCov_9fa48("49690", "49691", "49692"), !replaced)) {
                if (stryMutAct_9fa48("49693")) {
                  {}
                } else {
                  stryCov_9fa48("49693");
                  this.data.push(incomingLog);
                }
              }
              this.updateFilteredData();
              this.restoreSelectionByLogId(selectedLogId);
              if (stryMutAct_9fa48("49695") ? false : stryMutAct_9fa48("49694") ? true : (stryCov_9fa48("49694", "49695"), incomingLogId)) {
                if (stryMutAct_9fa48("49696")) {
                  {}
                } else {
                  stryCov_9fa48("49696");
                  this.markLogAsChanged(incomingLogId);
                }
              }
              this.eventBus.emit(stryMutAct_9fa48("49697") ? "" : (stryCov_9fa48("49697"), 'view:refresh'), stryMutAct_9fa48("49698") ? {} : (stryCov_9fa48("49698"), {
                view: this
              }));
              return;
            }
          }
          if (stryMutAct_9fa48("49701") ? eventType !== LOGS_EVENT_TYPE_DELETE : stryMutAct_9fa48("49700") ? false : stryMutAct_9fa48("49699") ? true : (stryCov_9fa48("49699", "49700", "49701"), eventType === LOGS_EVENT_TYPE_DELETE)) {
            if (stryMutAct_9fa48("49702")) {
              {}
            } else {
              stryCov_9fa48("49702");
              const deletedLog = stryMutAct_9fa48("49705") ? (event.data || event.oldData) && null : stryMutAct_9fa48("49704") ? false : stryMutAct_9fa48("49703") ? true : (stryCov_9fa48("49703", "49704", "49705"), (stryMutAct_9fa48("49707") ? event.data && event.oldData : stryMutAct_9fa48("49706") ? false : (stryCov_9fa48("49706", "49707"), event.data || event.oldData)) || null);
              const deletedLogId = this.getItemKey(stryMutAct_9fa48("49710") ? deletedLog && {} : stryMutAct_9fa48("49709") ? false : stryMutAct_9fa48("49708") ? true : (stryCov_9fa48("49708", "49709", "49710"), deletedLog || {}));
              if (stryMutAct_9fa48("49713") ? false : stryMutAct_9fa48("49712") ? true : stryMutAct_9fa48("49711") ? deletedLogId : (stryCov_9fa48("49711", "49712", "49713"), !deletedLogId)) {
                if (stryMutAct_9fa48("49714")) {
                  {}
                } else {
                  stryCov_9fa48("49714");
                  return;
                }
              }
              const selectedLogId = stryMutAct_9fa48("49717") ? this.getSelectedItem()?.log_id && null : stryMutAct_9fa48("49716") ? false : stryMutAct_9fa48("49715") ? true : (stryCov_9fa48("49715", "49716", "49717"), (stryMutAct_9fa48("49718") ? this.getSelectedItem().log_id : (stryCov_9fa48("49718"), this.getSelectedItem()?.log_id)) || null);
              const previousLength = this.data.length;
              this.data = stryMutAct_9fa48("49719") ? this.data : (stryCov_9fa48("49719"), this.data.filter(stryMutAct_9fa48("49720") ? () => undefined : (stryCov_9fa48("49720"), log => stryMutAct_9fa48("49723") ? this.getItemKey(log) === deletedLogId : stryMutAct_9fa48("49722") ? false : stryMutAct_9fa48("49721") ? true : (stryCov_9fa48("49721", "49722", "49723"), this.getItemKey(log) !== deletedLogId))));
              if (stryMutAct_9fa48("49726") ? this.data.length === previousLength : stryMutAct_9fa48("49725") ? false : stryMutAct_9fa48("49724") ? true : (stryCov_9fa48("49724", "49725", "49726"), this.data.length !== previousLength)) {
                if (stryMutAct_9fa48("49727")) {
                  {}
                } else {
                  stryCov_9fa48("49727");
                  this.updateFilteredData();
                  this.restoreSelectionByLogId(selectedLogId);
                  this.eventBus.emit(stryMutAct_9fa48("49728") ? "" : (stryCov_9fa48("49728"), 'view:refresh'), stryMutAct_9fa48("49729") ? {} : (stryCov_9fa48("49729"), {
                    view: this
                  }));
                }
              }
            }
          }
        }
      });
    }
  }

  /**
   * Build a LIVE SELECT SQL string for the logs table using
   * current filters. Used when a liveQueryManager is available.
   * @return {string} LIVE SELECT SQL string.
   */
  buildLiveLogsQuery() {
    if (stryMutAct_9fa48("49730")) {
      {}
    } else {
      stryCov_9fa48("49730");
      const conditions = this.buildLiveLogsWhereConditions();
      let sql = stryMutAct_9fa48("49731") ? `` : (stryCov_9fa48("49731"), `${LOGS_QUERY_LIVE_PREFIX}${LOGS_QUERY_SELECT_ALL} FROM ${LOGS_TABLE}`);
      if (stryMutAct_9fa48("49735") ? conditions.length <= 0 : stryMutAct_9fa48("49734") ? conditions.length >= 0 : stryMutAct_9fa48("49733") ? false : stryMutAct_9fa48("49732") ? true : (stryCov_9fa48("49732", "49733", "49734", "49735"), conditions.length > 0)) {
        if (stryMutAct_9fa48("49736")) {
          {}
        } else {
          stryCov_9fa48("49736");
          sql += stryMutAct_9fa48("49737") ? `` : (stryCov_9fa48("49737"), `${LOGS_QUERY_WHERE}${conditions.join(LOGS_QUERY_AND)}`);
        }
      }
      stryMutAct_9fa48("49738") ? sql -= LOGS_QUERY_ORDER_BY_CLAUSE : (stryCov_9fa48("49738"), sql += LOGS_QUERY_ORDER_BY_CLAUSE);
      stryMutAct_9fa48("49739") ? sql -= LOGS_QUERY_LIMIT_CLAUSE : (stryCov_9fa48("49739"), sql += LOGS_QUERY_LIMIT_CLAUSE);
      return sql;
    }
  }

  /**
   * Build SQL WHERE conditions for live query using SQL literals.
   * @return {Array<string>} SQL condition strings.
   * @private
   */
  buildLiveLogsWhereConditions() {
    if (stryMutAct_9fa48("49740")) {
      {}
    } else {
      stryCov_9fa48("49740");
      const conditions = stryMutAct_9fa48("49741") ? ["Stryker was here"] : (stryCov_9fa48("49741"), []);
      if (stryMutAct_9fa48("49743") ? false : stryMutAct_9fa48("49742") ? true : (stryCov_9fa48("49742", "49743"), this.levelFilter)) {
        if (stryMutAct_9fa48("49744")) {
          {}
        } else {
          stryCov_9fa48("49744");
          conditions.push(stryMutAct_9fa48("49745") ? `` : (stryCov_9fa48("49745"), `level${LOGS_QUERY_EQUAL}${this.quoteSqlLiteral(stryMutAct_9fa48("49746") ? this.levelFilter.toLowerCase() : (stryCov_9fa48("49746"), this.levelFilter.toUpperCase()))}`));
        }
      }
      if (stryMutAct_9fa48("49748") ? false : stryMutAct_9fa48("49747") ? true : (stryCov_9fa48("49747", "49748"), this.nodeFilter)) {
        if (stryMutAct_9fa48("49749")) {
          {}
        } else {
          stryCov_9fa48("49749");
          conditions.push(stryMutAct_9fa48("49750") ? `` : (stryCov_9fa48("49750"), `node_id${LOGS_QUERY_EQUAL}${this.quoteSqlLiteral(this.nodeFilter)}`));
        }
      }
      if (stryMutAct_9fa48("49752") ? false : stryMutAct_9fa48("49751") ? true : (stryCov_9fa48("49751", "49752"), this.serviceFilter)) {
        if (stryMutAct_9fa48("49753")) {
          {}
        } else {
          stryCov_9fa48("49753");
          conditions.push(stryMutAct_9fa48("49754") ? `` : (stryCov_9fa48("49754"), `service_id${LOGS_QUERY_EQUAL}${this.quoteSqlLiteral(this.serviceFilter)}`));
        }
      }
      if (stryMutAct_9fa48("49757") ? this.startTimeFilter === null : stryMutAct_9fa48("49756") ? false : stryMutAct_9fa48("49755") ? true : (stryCov_9fa48("49755", "49756", "49757"), this.startTimeFilter !== null)) {
        if (stryMutAct_9fa48("49758")) {
          {}
        } else {
          stryCov_9fa48("49758");
          conditions.push(stryMutAct_9fa48("49759") ? `` : (stryCov_9fa48("49759"), `timestamp${LOGS_QUERY_GTE}${this.quoteSqlLiteral(this.startTimeFilter)}`));
        }
      }
      if (stryMutAct_9fa48("49762") ? this.endTimeFilter === null : stryMutAct_9fa48("49761") ? false : stryMutAct_9fa48("49760") ? true : (stryCov_9fa48("49760", "49761", "49762"), this.endTimeFilter !== null)) {
        if (stryMutAct_9fa48("49763")) {
          {}
        } else {
          stryCov_9fa48("49763");
          conditions.push(stryMutAct_9fa48("49764") ? `` : (stryCov_9fa48("49764"), `timestamp${LOGS_QUERY_LTE}${this.quoteSqlLiteral(this.endTimeFilter)}`));
        }
      }
      if (stryMutAct_9fa48("49766") ? false : stryMutAct_9fa48("49765") ? true : (stryCov_9fa48("49765", "49766"), this.messageFilter)) {
        if (stryMutAct_9fa48("49767")) {
          {}
        } else {
          stryCov_9fa48("49767");
          conditions.push(stryMutAct_9fa48("49768") ? `` : (stryCov_9fa48("49768"), `message${LOGS_QUERY_LIKE}${this.quoteSqlLiteral(stryMutAct_9fa48("49769") ? `` : (stryCov_9fa48("49769"), `%${this.messageFilter}%`))}`));
        }
      }
      return conditions;
    }
  }

  /**
   * Convert a JS value to a SQL literal.
   * @param {string|number|boolean|null} value - Value to quote.
   * @return {string} SQL literal string.
   * @private
   */
  quoteSqlLiteral(value) {
    if (stryMutAct_9fa48("49770")) {
      {}
    } else {
      stryCov_9fa48("49770");
      if (stryMutAct_9fa48("49773") ? value === null && value === undefined : stryMutAct_9fa48("49772") ? false : stryMutAct_9fa48("49771") ? true : (stryCov_9fa48("49771", "49772", "49773"), (stryMutAct_9fa48("49775") ? value !== null : stryMutAct_9fa48("49774") ? false : (stryCov_9fa48("49774", "49775"), value === null)) || (stryMutAct_9fa48("49777") ? value !== undefined : stryMutAct_9fa48("49776") ? false : (stryCov_9fa48("49776", "49777"), value === undefined)))) {
        if (stryMutAct_9fa48("49778")) {
          {}
        } else {
          stryCov_9fa48("49778");
          return stryMutAct_9fa48("49779") ? "" : (stryCov_9fa48("49779"), 'NULL');
        }
      }
      if (stryMutAct_9fa48("49782") ? typeof value !== 'number' : stryMutAct_9fa48("49781") ? false : stryMutAct_9fa48("49780") ? true : (stryCov_9fa48("49780", "49781", "49782"), typeof value === (stryMutAct_9fa48("49783") ? "" : (stryCov_9fa48("49783"), 'number')))) {
        if (stryMutAct_9fa48("49784")) {
          {}
        } else {
          stryCov_9fa48("49784");
          return String(Math.trunc(value));
        }
      }
      if (stryMutAct_9fa48("49787") ? typeof value !== 'boolean' : stryMutAct_9fa48("49786") ? false : stryMutAct_9fa48("49785") ? true : (stryCov_9fa48("49785", "49786", "49787"), typeof value === (stryMutAct_9fa48("49788") ? "" : (stryCov_9fa48("49788"), 'boolean')))) {
        if (stryMutAct_9fa48("49789")) {
          {}
        } else {
          stryCov_9fa48("49789");
          return value ? stryMutAct_9fa48("49790") ? "" : (stryCov_9fa48("49790"), '1') : stryMutAct_9fa48("49791") ? "" : (stryCov_9fa48("49791"), '0');
        }
      }
      return stryMutAct_9fa48("49792") ? `` : (stryCov_9fa48("49792"), `'${String(value).replace(/'/g, stryMutAct_9fa48("49793") ? "" : (stryCov_9fa48("49793"), '\'\''))}'`);
    }
  }

  /**
   * Build a SQL query for the logs table using current filters.
   * Filters are applied server-side so only matching rows are
   * transferred.
   * @return {{sql: string, params: Array}} SQL and positional params.
   */
  buildLogsQuery() {
    if (stryMutAct_9fa48("49794")) {
      {}
    } else {
      stryCov_9fa48("49794");
      const conditions = stryMutAct_9fa48("49795") ? ["Stryker was here"] : (stryCov_9fa48("49795"), []);
      const params = stryMutAct_9fa48("49796") ? ["Stryker was here"] : (stryCov_9fa48("49796"), []);
      if (stryMutAct_9fa48("49798") ? false : stryMutAct_9fa48("49797") ? true : (stryCov_9fa48("49797", "49798"), this.levelFilter)) {
        if (stryMutAct_9fa48("49799")) {
          {}
        } else {
          stryCov_9fa48("49799");
          params.push(stryMutAct_9fa48("49800") ? this.levelFilter.toLowerCase() : (stryCov_9fa48("49800"), this.levelFilter.toUpperCase()));
          conditions.push(stryMutAct_9fa48("49801") ? `` : (stryCov_9fa48("49801"), `level = ?${params.length}`));
        }
      }
      if (stryMutAct_9fa48("49803") ? false : stryMutAct_9fa48("49802") ? true : (stryCov_9fa48("49802", "49803"), this.nodeFilter)) {
        if (stryMutAct_9fa48("49804")) {
          {}
        } else {
          stryCov_9fa48("49804");
          params.push(this.nodeFilter);
          conditions.push(stryMutAct_9fa48("49805") ? `` : (stryCov_9fa48("49805"), `node_id = ?${params.length}`));
        }
      }
      if (stryMutAct_9fa48("49807") ? false : stryMutAct_9fa48("49806") ? true : (stryCov_9fa48("49806", "49807"), this.serviceFilter)) {
        if (stryMutAct_9fa48("49808")) {
          {}
        } else {
          stryCov_9fa48("49808");
          params.push(this.serviceFilter);
          conditions.push(stryMutAct_9fa48("49809") ? `` : (stryCov_9fa48("49809"), `service_id = ?${params.length}`));
        }
      }
      if (stryMutAct_9fa48("49812") ? this.startTimeFilter === null : stryMutAct_9fa48("49811") ? false : stryMutAct_9fa48("49810") ? true : (stryCov_9fa48("49810", "49811", "49812"), this.startTimeFilter !== null)) {
        if (stryMutAct_9fa48("49813")) {
          {}
        } else {
          stryCov_9fa48("49813");
          params.push(this.startTimeFilter);
          conditions.push(stryMutAct_9fa48("49814") ? `` : (stryCov_9fa48("49814"), `timestamp >= ?${params.length}`));
        }
      }
      if (stryMutAct_9fa48("49817") ? this.endTimeFilter === null : stryMutAct_9fa48("49816") ? false : stryMutAct_9fa48("49815") ? true : (stryCov_9fa48("49815", "49816", "49817"), this.endTimeFilter !== null)) {
        if (stryMutAct_9fa48("49818")) {
          {}
        } else {
          stryCov_9fa48("49818");
          params.push(this.endTimeFilter);
          conditions.push(stryMutAct_9fa48("49819") ? `` : (stryCov_9fa48("49819"), `timestamp <= ?${params.length}`));
        }
      }
      if (stryMutAct_9fa48("49821") ? false : stryMutAct_9fa48("49820") ? true : (stryCov_9fa48("49820", "49821"), this.messageFilter)) {
        if (stryMutAct_9fa48("49822")) {
          {}
        } else {
          stryCov_9fa48("49822");
          params.push(stryMutAct_9fa48("49823") ? `` : (stryCov_9fa48("49823"), `%${this.messageFilter}%`));
          conditions.push(stryMutAct_9fa48("49824") ? `` : (stryCov_9fa48("49824"), `message LIKE ?${params.length}`));
        }
      }
      let sql = stryMutAct_9fa48("49825") ? `` : (stryCov_9fa48("49825"), `SELECT * FROM ${LOGS_TABLE}`);
      if (stryMutAct_9fa48("49829") ? conditions.length <= 0 : stryMutAct_9fa48("49828") ? conditions.length >= 0 : stryMutAct_9fa48("49827") ? false : stryMutAct_9fa48("49826") ? true : (stryCov_9fa48("49826", "49827", "49828", "49829"), conditions.length > 0)) {
        if (stryMutAct_9fa48("49830")) {
          {}
        } else {
          stryCov_9fa48("49830");
          sql += stryMutAct_9fa48("49831") ? `` : (stryCov_9fa48("49831"), ` WHERE ${conditions.join(stryMutAct_9fa48("49832") ? "" : (stryCov_9fa48("49832"), ' AND '))}`);
        }
      }
      sql += stryMutAct_9fa48("49833") ? `` : (stryCov_9fa48("49833"), ` ORDER BY ${LOGS_QUERY_ORDER_BY} LIMIT ${LOGS_QUERY_LIMIT}`);
      return stryMutAct_9fa48("49834") ? {} : (stryCov_9fa48("49834"), {
        sql,
        params
      });
    }
  }

  /**
   * Apply one snapshot batch and keep selection anchored by log_id.
   * Highlights rows that are newly present compared to prior snapshot data.
   * @param {Array<Object>} rows - Snapshot rows.
   * @private
   */
  applySnapshotRows(rows) {
    if (stryMutAct_9fa48("49835")) {
      {}
    } else {
      stryCov_9fa48("49835");
      const snapshotRows = Array.isArray(rows) ? rows : stryMutAct_9fa48("49836") ? ["Stryker was here"] : (stryCov_9fa48("49836"), []);
      const selectedLogId = stryMutAct_9fa48("49839") ? this.getSelectedItem()?.log_id && null : stryMutAct_9fa48("49838") ? false : stryMutAct_9fa48("49837") ? true : (stryCov_9fa48("49837", "49838", "49839"), (stryMutAct_9fa48("49840") ? this.getSelectedItem().log_id : (stryCov_9fa48("49840"), this.getSelectedItem()?.log_id)) || null);
      const previousLogIds = new Set(stryMutAct_9fa48("49841") ? this.data.map(log => this.getItemKey(log)) : (stryCov_9fa48("49841"), this.data.map(stryMutAct_9fa48("49842") ? () => undefined : (stryCov_9fa48("49842"), log => this.getItemKey(log))).filter(stryMutAct_9fa48("49843") ? () => undefined : (stryCov_9fa48("49843"), logId => Boolean(logId)))));
      this.replaceData(snapshotRows);
      this.restoreSelectionByLogId(selectedLogId);
      this.clearChangedLogHighlights();
      if (stryMutAct_9fa48("49846") ? previousLogIds.size !== 0 : stryMutAct_9fa48("49845") ? false : stryMutAct_9fa48("49844") ? true : (stryCov_9fa48("49844", "49845", "49846"), previousLogIds.size === 0)) {
        if (stryMutAct_9fa48("49847")) {
          {}
        } else {
          stryCov_9fa48("49847");
          return;
        }
      }
      for (const log of snapshotRows) {
        if (stryMutAct_9fa48("49848")) {
          {}
        } else {
          stryCov_9fa48("49848");
          const logId = this.getItemKey(log);
          if (stryMutAct_9fa48("49851") ? !logId && previousLogIds.has(logId) : stryMutAct_9fa48("49850") ? false : stryMutAct_9fa48("49849") ? true : (stryCov_9fa48("49849", "49850", "49851"), (stryMutAct_9fa48("49852") ? logId : (stryCov_9fa48("49852"), !logId)) || previousLogIds.has(logId))) {
            if (stryMutAct_9fa48("49853")) {
              {}
            } else {
              stryCov_9fa48("49853");
              continue;
            }
          }
          this.markLogAsChanged(logId);
        }
      }
    }
  }

  /**
   * Restore selected row by stable log id after data refresh.
   * @param {string|null} logId - Previously selected log id.
   * @private
   */
  restoreSelectionByLogId(logId) {
    if (stryMutAct_9fa48("49854")) {
      {}
    } else {
      stryCov_9fa48("49854");
      if (stryMutAct_9fa48("49857") ? false : stryMutAct_9fa48("49856") ? true : stryMutAct_9fa48("49855") ? logId : (stryCov_9fa48("49855", "49856", "49857"), !logId)) {
        if (stryMutAct_9fa48("49858")) {
          {}
        } else {
          stryCov_9fa48("49858");
          return;
        }
      }
      const index = this.filteredData.findIndex(stryMutAct_9fa48("49859") ? () => undefined : (stryCov_9fa48("49859"), log => stryMutAct_9fa48("49862") ? this.getItemKey(log) !== logId : stryMutAct_9fa48("49861") ? false : stryMutAct_9fa48("49860") ? true : (stryCov_9fa48("49860", "49861", "49862"), this.getItemKey(log) === logId)));
      if (stryMutAct_9fa48("49866") ? index < 0 : stryMutAct_9fa48("49865") ? index > 0 : stryMutAct_9fa48("49864") ? false : stryMutAct_9fa48("49863") ? true : (stryCov_9fa48("49863", "49864", "49865", "49866"), index >= 0)) {
        if (stryMutAct_9fa48("49867")) {
          {}
        } else {
          stryCov_9fa48("49867");
          this.selectedIndex = index;
        }
      }
    }
  }

  /**
   * Clear all changed-row highlights tracked by this view.
   * @private
   */
  clearChangedLogHighlights() {
    if (stryMutAct_9fa48("49868")) {
      {}
    } else {
      stryCov_9fa48("49868");
      this.clearChanged();
      this.changedLogIdQueue = stryMutAct_9fa48("49869") ? ["Stryker was here"] : (stryCov_9fa48("49869"), []);
    }
  }

  /**
   * Mark one log id as changed and keep highlight queue bounded.
   * @param {string} logId - Log row id.
   * @private
   */
  markLogAsChanged(logId) {
    if (stryMutAct_9fa48("49870")) {
      {}
    } else {
      stryCov_9fa48("49870");
      if (stryMutAct_9fa48("49873") ? !logId && this.changedRows.has(logId) : stryMutAct_9fa48("49872") ? false : stryMutAct_9fa48("49871") ? true : (stryCov_9fa48("49871", "49872", "49873"), (stryMutAct_9fa48("49874") ? logId : (stryCov_9fa48("49874"), !logId)) || this.changedRows.has(logId))) {
        if (stryMutAct_9fa48("49875")) {
          {}
        } else {
          stryCov_9fa48("49875");
          return;
        }
      }
      this.markChanged(logId);
      this.changedLogIdQueue.push(logId);
      if (stryMutAct_9fa48("49879") ? this.changedLogIdQueue.length > LOGS_HIGHLIGHT_MAX_CHANGED_ROWS : stryMutAct_9fa48("49878") ? this.changedLogIdQueue.length < LOGS_HIGHLIGHT_MAX_CHANGED_ROWS : stryMutAct_9fa48("49877") ? false : stryMutAct_9fa48("49876") ? true : (stryCov_9fa48("49876", "49877", "49878", "49879"), this.changedLogIdQueue.length <= LOGS_HIGHLIGHT_MAX_CHANGED_ROWS)) {
        if (stryMutAct_9fa48("49880")) {
          {}
        } else {
          stryCov_9fa48("49880");
          return;
        }
      }
      const staleLogId = this.changedLogIdQueue.shift();
      if (stryMutAct_9fa48("49882") ? false : stryMutAct_9fa48("49881") ? true : (stryCov_9fa48("49881", "49882"), staleLogId)) {
        if (stryMutAct_9fa48("49883")) {
          {}
        } else {
          stryCov_9fa48("49883");
          this.clearChanged(staleLogId);
        }
      }
    }
  }

  /**
   * Ensure an active LIVE SELECT subscription for current log filters.
   * The logs view uses live query streaming as its source of truth.
   */
  fetchLogs() {
    if (stryMutAct_9fa48("49884")) {
      {}
    } else {
      stryCov_9fa48("49884");
      if (stryMutAct_9fa48("49887") ? this.liveQueryEnabled === true : stryMutAct_9fa48("49886") ? false : stryMutAct_9fa48("49885") ? true : (stryCov_9fa48("49885", "49886", "49887"), this.liveQueryEnabled !== (stryMutAct_9fa48("49888") ? false : (stryCov_9fa48("49888"), true)))) {
        if (stryMutAct_9fa48("49889")) {
          {}
        } else {
          stryCov_9fa48("49889");
          this.updateFilteredData();
          return;
        }
      }
      if (stryMutAct_9fa48("49892") ? !this.liveQueryManager && !this.streamingEnabled : stryMutAct_9fa48("49891") ? false : stryMutAct_9fa48("49890") ? true : (stryCov_9fa48("49890", "49891", "49892"), (stryMutAct_9fa48("49893") ? this.liveQueryManager : (stryCov_9fa48("49893"), !this.liveQueryManager)) || (stryMutAct_9fa48("49894") ? this.streamingEnabled : (stryCov_9fa48("49894"), !this.streamingEnabled)))) {
        if (stryMutAct_9fa48("49895")) {
          {}
        } else {
          stryCov_9fa48("49895");
          this.cancelActiveLiveQuerySubscription();
          this.applyQueryError(LOGS_LIVE_QUERY_UNAVAILABLE_ERROR);
          return;
        }
      }
      const desiredLiveSql = this.buildLiveLogsQuery();
      if (stryMutAct_9fa48("49897") ? false : stryMutAct_9fa48("49896") ? true : (stryCov_9fa48("49896", "49897"), this.activeSubscriptionId)) {
        if (stryMutAct_9fa48("49898")) {
          {}
        } else {
          stryCov_9fa48("49898");
          const activeSqlMismatch = stryMutAct_9fa48("49901") ? desiredLiveSql === this.activeLiveQuerySql : stryMutAct_9fa48("49900") ? false : stryMutAct_9fa48("49899") ? true : (stryCov_9fa48("49899", "49900", "49901"), desiredLiveSql !== this.activeLiveQuerySql);
          if (stryMutAct_9fa48("49903") ? false : stryMutAct_9fa48("49902") ? true : (stryCov_9fa48("49902", "49903"), activeSqlMismatch)) {
            if (stryMutAct_9fa48("49904")) {
              {}
            } else {
              stryCov_9fa48("49904");
              this.cancelActiveLiveQuerySubscription();
            }
          }
        }
      }
      if (stryMutAct_9fa48("49907") ? false : stryMutAct_9fa48("49906") ? true : stryMutAct_9fa48("49905") ? this.activeSubscriptionId : (stryCov_9fa48("49905", "49906", "49907"), !this.activeSubscriptionId)) {
        if (stryMutAct_9fa48("49908")) {
          {}
        } else {
          stryCov_9fa48("49908");
          this.activeSubscriptionId = this.liveQueryManager.subscribe(desiredLiveSql);
          this.activeLiveQuerySql = desiredLiveSql;
        }
      }
    }
  }

  /**
   * Apply a query error as an ERROR row and notify listeners.
   * @param {string} message - Error message.
   * @private
   */
  applyQueryError(message) {
    if (stryMutAct_9fa48("49909")) {
      {}
    } else {
      stryCov_9fa48("49909");
      this.replaceData(stryMutAct_9fa48("49910") ? [] : (stryCov_9fa48("49910"), [stryMutAct_9fa48("49911") ? {} : (stryCov_9fa48("49911"), {
        log_id: LOGS_QUERY_ERROR_ID,
        timestamp: Date.now(),
        level: stryMutAct_9fa48("49912") ? "" : (stryCov_9fa48("49912"), 'ERROR'),
        node_id: LOGS_SYSTEM_NODE_ID,
        service_id: LOGS_SYSTEM_SERVICE_ID,
        message
      })]));
      if (stryMutAct_9fa48("49914") ? false : stryMutAct_9fa48("49913") ? true : (stryCov_9fa48("49913", "49914"), this.eventBus)) {
        if (stryMutAct_9fa48("49915")) {
          {}
        } else {
          stryCov_9fa48("49915");
          this.eventBus.emit(stryMutAct_9fa48("49916") ? "" : (stryCov_9fa48("49916"), 'view:refresh'), stryMutAct_9fa48("49917") ? {} : (stryCov_9fa48("49917"), {
            view: this
          }));
        }
      }
    }
  }

  /**
   * Set data for the view.
   * In live-query mode, data can only be replaced by internal live-query paths.
   * @param {Array} data - Data items.
   */
  setData(data) {
    if (stryMutAct_9fa48("49918")) {
      {}
    } else {
      stryCov_9fa48("49918");
      if (stryMutAct_9fa48("49921") ? this.liveQueryEnabled === true || this.internalSetDataInProgress !== true : stryMutAct_9fa48("49920") ? false : stryMutAct_9fa48("49919") ? true : (stryCov_9fa48("49919", "49920", "49921"), (stryMutAct_9fa48("49923") ? this.liveQueryEnabled !== true : stryMutAct_9fa48("49922") ? true : (stryCov_9fa48("49922", "49923"), this.liveQueryEnabled === (stryMutAct_9fa48("49924") ? false : (stryCov_9fa48("49924"), true)))) && (stryMutAct_9fa48("49926") ? this.internalSetDataInProgress === true : stryMutAct_9fa48("49925") ? true : (stryCov_9fa48("49925", "49926"), this.internalSetDataInProgress !== (stryMutAct_9fa48("49927") ? false : (stryCov_9fa48("49927"), true)))))) {
        if (stryMutAct_9fa48("49928")) {
          {}
        } else {
          stryCov_9fa48("49928");
          return;
        }
      }
      super.setData(data);
    }
  }

  /**
   * Replace view data from internal live-query handlers.
   * @param {Array} data - Data items.
   * @private
   */
  replaceData(data) {
    if (stryMutAct_9fa48("49929")) {
      {}
    } else {
      stryCov_9fa48("49929");
      this.internalSetDataInProgress = stryMutAct_9fa48("49930") ? false : (stryCov_9fa48("49930"), true);
      try {
        if (stryMutAct_9fa48("49931")) {
          {}
        } else {
          stryCov_9fa48("49931");
          super.setData(data);
        }
      } finally {
        if (stryMutAct_9fa48("49932")) {
          {}
        } else {
          stryCov_9fa48("49932");
          this.internalSetDataInProgress = stryMutAct_9fa48("49933") ? true : (stryCov_9fa48("49933"), false);
        }
      }
    }
  }

  /**
   * Enable or disable real-time log streaming
   * Requirements: 29.9
   * @param {boolean} enabled - Whether streaming is enabled
   */
  setStreamingEnabled(enabled) {
    if (stryMutAct_9fa48("49934")) {
      {}
    } else {
      stryCov_9fa48("49934");
      this.streamingEnabled = enabled;
      if (stryMutAct_9fa48("49937") ? false : stryMutAct_9fa48("49936") ? true : stryMutAct_9fa48("49935") ? enabled : (stryCov_9fa48("49935", "49936", "49937"), !enabled)) {
        if (stryMutAct_9fa48("49938")) {
          {}
        } else {
          stryCov_9fa48("49938");
          this.cancelActiveLiveQuerySubscription();
          return;
        }
      }
      this.fetchLogs();
    }
  }

  /**
   * Disable live query mode and clear active subscription state.
   */
  disableLiveQuerySupport() {
    if (stryMutAct_9fa48("49939")) {
      {}
    } else {
      stryCov_9fa48("49939");
      this.cancelActiveLiveQuerySubscription();
      this.liveQueryEnabled = stryMutAct_9fa48("49940") ? true : (stryCov_9fa48("49940"), false);
    }
  }

  /**
   * Set logs live window start time and refresh live subscription.
   * Supports epoch values, ISO strings, `now`, and relative strings
   * like `-30s`, `-5m`, `-2h`, `-1d`.
   * @param {string|number|null|undefined} value - Start time value.
   * @return {number} Resolved epoch milliseconds start time.
   */
  setLiveWindowStartTime(value) {
    if (stryMutAct_9fa48("49941")) {
      {}
    } else {
      stryCov_9fa48("49941");
      const resolvedStartTime = this.resolveLiveWindowStartTime(value);
      this.startTimeFilter = resolvedStartTime;
      this.endTimeFilter = null;
      this.fetchLogs();
      return resolvedStartTime;
    }
  }

  /**
   * Resolve live window start time from user-supplied value.
   * @param {string|number|null|undefined} value - User input.
   * @return {number} Epoch milliseconds.
   * @throws {Error} When value is invalid.
   * @private
   */
  resolveLiveWindowStartTime(value) {
    if (stryMutAct_9fa48("49942")) {
      {}
    } else {
      stryCov_9fa48("49942");
      const now = Date.now();
      if (stryMutAct_9fa48("49945") ? value === null && value === undefined : stryMutAct_9fa48("49944") ? false : stryMutAct_9fa48("49943") ? true : (stryCov_9fa48("49943", "49944", "49945"), (stryMutAct_9fa48("49947") ? value !== null : stryMutAct_9fa48("49946") ? false : (stryCov_9fa48("49946", "49947"), value === null)) || (stryMutAct_9fa48("49949") ? value !== undefined : stryMutAct_9fa48("49948") ? false : (stryCov_9fa48("49948", "49949"), value === undefined)))) {
        if (stryMutAct_9fa48("49950")) {
          {}
        } else {
          stryCov_9fa48("49950");
          return now;
        }
      }
      if (stryMutAct_9fa48("49953") ? typeof value !== 'number' : stryMutAct_9fa48("49952") ? false : stryMutAct_9fa48("49951") ? true : (stryCov_9fa48("49951", "49952", "49953"), typeof value === (stryMutAct_9fa48("49954") ? "" : (stryCov_9fa48("49954"), 'number')))) {
        if (stryMutAct_9fa48("49955")) {
          {}
        } else {
          stryCov_9fa48("49955");
          const normalized = this.normalizeNumericTimestamp(value);
          if (stryMutAct_9fa48("49958") ? normalized !== null : stryMutAct_9fa48("49957") ? false : stryMutAct_9fa48("49956") ? true : (stryCov_9fa48("49956", "49957", "49958"), normalized === null)) {
            if (stryMutAct_9fa48("49959")) {
              {}
            } else {
              stryCov_9fa48("49959");
              throw new Error(stryMutAct_9fa48("49960") ? `` : (stryCov_9fa48("49960"), `${LOGS_SINCE_INVALID_VALUE_PREFIX}${String(value)}`));
            }
          }
          return normalized;
        }
      }
      const trimmedValue = stryMutAct_9fa48("49961") ? String(value) : (stryCov_9fa48("49961"), String(value).trim());
      if (stryMutAct_9fa48("49964") ? trimmedValue === '' && trimmedValue.toLowerCase() === LOGS_SINCE_RESET_VALUE : stryMutAct_9fa48("49963") ? false : stryMutAct_9fa48("49962") ? true : (stryCov_9fa48("49962", "49963", "49964"), (stryMutAct_9fa48("49966") ? trimmedValue !== '' : stryMutAct_9fa48("49965") ? false : (stryCov_9fa48("49965", "49966"), trimmedValue === (stryMutAct_9fa48("49967") ? "Stryker was here!" : (stryCov_9fa48("49967"), '')))) || (stryMutAct_9fa48("49969") ? trimmedValue.toLowerCase() !== LOGS_SINCE_RESET_VALUE : stryMutAct_9fa48("49968") ? false : (stryCov_9fa48("49968", "49969"), (stryMutAct_9fa48("49970") ? trimmedValue.toUpperCase() : (stryCov_9fa48("49970"), trimmedValue.toLowerCase())) === LOGS_SINCE_RESET_VALUE)))) {
        if (stryMutAct_9fa48("49971")) {
          {}
        } else {
          stryCov_9fa48("49971");
          return now;
        }
      }
      const relativeMatch = trimmedValue.match(LOGS_SINCE_RELATIVE_REGEX);
      if (stryMutAct_9fa48("49973") ? false : stryMutAct_9fa48("49972") ? true : (stryCov_9fa48("49972", "49973"), relativeMatch)) {
        if (stryMutAct_9fa48("49974")) {
          {}
        } else {
          stryCov_9fa48("49974");
          const amount = Number(relativeMatch[1]);
          const unit = stryMutAct_9fa48("49975") ? relativeMatch[2].toUpperCase() : (stryCov_9fa48("49975"), relativeMatch[2].toLowerCase());
          const unitMs = LOGS_RELATIVE_UNIT_MILLISECONDS[unit];
          if (stryMutAct_9fa48("49978") ? Number.isFinite(amount) && amount >= 0 || Number.isFinite(unitMs) : stryMutAct_9fa48("49977") ? false : stryMutAct_9fa48("49976") ? true : (stryCov_9fa48("49976", "49977", "49978"), (stryMutAct_9fa48("49980") ? Number.isFinite(amount) || amount >= 0 : stryMutAct_9fa48("49979") ? true : (stryCov_9fa48("49979", "49980"), Number.isFinite(amount) && (stryMutAct_9fa48("49983") ? amount < 0 : stryMutAct_9fa48("49982") ? amount > 0 : stryMutAct_9fa48("49981") ? true : (stryCov_9fa48("49981", "49982", "49983"), amount >= 0)))) && Number.isFinite(unitMs))) {
            if (stryMutAct_9fa48("49984")) {
              {}
            } else {
              stryCov_9fa48("49984");
              return stryMutAct_9fa48("49985") ? now + amount * unitMs : (stryCov_9fa48("49985"), now - (stryMutAct_9fa48("49986") ? amount / unitMs : (stryCov_9fa48("49986"), amount * unitMs)));
            }
          }
        }
      }
      const parsedTimestamp = this.parseTimestamp(trimmedValue);
      if (stryMutAct_9fa48("49989") ? parsedTimestamp === null : stryMutAct_9fa48("49988") ? false : stryMutAct_9fa48("49987") ? true : (stryCov_9fa48("49987", "49988", "49989"), parsedTimestamp !== null)) {
        if (stryMutAct_9fa48("49990")) {
          {}
        } else {
          stryCov_9fa48("49990");
          return parsedTimestamp;
        }
      }
      throw new Error(stryMutAct_9fa48("49991") ? `` : (stryCov_9fa48("49991"), `${LOGS_SINCE_INVALID_VALUE_PREFIX}${trimmedValue}`));
    }
  }

  /**
   * Cancel active live query subscription, if any.
   * @private
   */
  cancelActiveLiveQuerySubscription() {
    if (stryMutAct_9fa48("49992")) {
      {}
    } else {
      stryCov_9fa48("49992");
      if (stryMutAct_9fa48("49995") ? this.activeSubscriptionId || this.liveQueryManager : stryMutAct_9fa48("49994") ? false : stryMutAct_9fa48("49993") ? true : (stryCov_9fa48("49993", "49994", "49995"), this.activeSubscriptionId && this.liveQueryManager)) {
        if (stryMutAct_9fa48("49996")) {
          {}
        } else {
          stryCov_9fa48("49996");
          this.liveQueryManager.cancel(this.activeSubscriptionId);
        }
      }
      this.activeSubscriptionId = null;
      this.activeLiveQuerySql = null;
    }
  }

  /**
   * Check if streaming is enabled
   * @return {boolean}
   */
  isStreamingEnabled() {
    if (stryMutAct_9fa48("49997")) {
      {}
    } else {
      stryCov_9fa48("49997");
      return this.streamingEnabled;
    }
  }

  /**
   * Get column definitions for the logs view
   * Requirements: 29.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    if (stryMutAct_9fa48("49998")) {
      {}
    } else {
      stryCov_9fa48("49998");
      return stryMutAct_9fa48("49999") ? [] : (stryCov_9fa48("49999"), [stryMutAct_9fa48("50000") ? {} : (stryCov_9fa48("50000"), {
        key: stryMutAct_9fa48("50001") ? "" : (stryCov_9fa48("50001"), 'timestamp'),
        label: stryMutAct_9fa48("50002") ? "" : (stryCov_9fa48("50002"), 'Timestamp'),
        width: 24
      }), stryMutAct_9fa48("50003") ? {} : (stryCov_9fa48("50003"), {
        key: stryMutAct_9fa48("50004") ? "" : (stryCov_9fa48("50004"), 'level'),
        label: stryMutAct_9fa48("50005") ? "" : (stryCov_9fa48("50005"), 'Level'),
        width: 8
      }), stryMutAct_9fa48("50006") ? {} : (stryCov_9fa48("50006"), {
        key: stryMutAct_9fa48("50007") ? "" : (stryCov_9fa48("50007"), 'node_id'),
        label: stryMutAct_9fa48("50008") ? "" : (stryCov_9fa48("50008"), 'Node ID'),
        width: 15
      }), stryMutAct_9fa48("50009") ? {} : (stryCov_9fa48("50009"), {
        key: stryMutAct_9fa48("50010") ? "" : (stryCov_9fa48("50010"), 'service_id'),
        label: stryMutAct_9fa48("50011") ? "" : (stryCov_9fa48("50011"), 'Service ID'),
        width: 20
      }), stryMutAct_9fa48("50012") ? {} : (stryCov_9fa48("50012"), {
        key: stryMutAct_9fa48("50013") ? "" : (stryCov_9fa48("50013"), 'message'),
        label: stryMutAct_9fa48("50014") ? "" : (stryCov_9fa48("50014"), 'Message'),
        width: 60
      })]);
    }
  }

  /**
   * Format a log record into a row array
   * Requirements: 29.1
   * @param {Object} log - Log record
   * @return {Array<string>} Row values
   */
  formatRow(log) {
    if (stryMutAct_9fa48("50015")) {
      {}
    } else {
      stryCov_9fa48("50015");
      return stryMutAct_9fa48("50016") ? [] : (stryCov_9fa48("50016"), [this.formatTimestamp(this.getLogTimestampMs(log)), stryMutAct_9fa48("50019") ? log.level && 'INFO' : stryMutAct_9fa48("50018") ? false : stryMutAct_9fa48("50017") ? true : (stryCov_9fa48("50017", "50018", "50019"), log.level || (stryMutAct_9fa48("50020") ? "" : (stryCov_9fa48("50020"), 'INFO'))), stryMutAct_9fa48("50023") ? log.node_id && 'N/A' : stryMutAct_9fa48("50022") ? false : stryMutAct_9fa48("50021") ? true : (stryCov_9fa48("50021", "50022", "50023"), log.node_id || (stryMutAct_9fa48("50024") ? "" : (stryCov_9fa48("50024"), 'N/A'))), stryMutAct_9fa48("50027") ? log.service_id && 'N/A' : stryMutAct_9fa48("50026") ? false : stryMutAct_9fa48("50025") ? true : (stryCov_9fa48("50025", "50026", "50027"), log.service_id || (stryMutAct_9fa48("50028") ? "" : (stryCov_9fa48("50028"), 'N/A'))), this.truncateMessage(log.message)]);
    }
  }

  /**
   * Format timestamp for display
   * @param {number|string|null|undefined} timestamp - Timestamp value
   * @return {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (stryMutAct_9fa48("50029")) {
      {}
    } else {
      stryCov_9fa48("50029");
      const normalizedTimestamp = this.parseTimestamp(timestamp);
      if (stryMutAct_9fa48("50032") ? normalizedTimestamp !== null : stryMutAct_9fa48("50031") ? false : stryMutAct_9fa48("50030") ? true : (stryCov_9fa48("50030", "50031", "50032"), normalizedTimestamp === null)) {
        if (stryMutAct_9fa48("50033")) {
          {}
        } else {
          stryCov_9fa48("50033");
          return LOGS_TIMESTAMP_UNAVAILABLE;
        }
      }
      const date = new Date(normalizedTimestamp);
      if (stryMutAct_9fa48("50035") ? false : stryMutAct_9fa48("50034") ? true : (stryCov_9fa48("50034", "50035"), isNaN(date.getTime()))) {
        if (stryMutAct_9fa48("50036")) {
          {}
        } else {
          stryCov_9fa48("50036");
          return LOGS_TIMESTAMP_UNAVAILABLE;
        }
      }
      return stryMutAct_9fa48("50037") ? date.toISOString().replace('T', ' ') : (stryCov_9fa48("50037"), date.toISOString().replace(stryMutAct_9fa48("50038") ? "" : (stryCov_9fa48("50038"), 'T'), stryMutAct_9fa48("50039") ? "" : (stryCov_9fa48("50039"), ' ')).substring(0, 23));
    }
  }

  /**
   * Truncate message for display in table
   * @param {string|null|undefined} message - Log message
   * @param {number} maxLength - Maximum length
   * @return {string} Truncated message
   */
  truncateMessage(message, maxLength = 80) {
    if (stryMutAct_9fa48("50040")) {
      {}
    } else {
      stryCov_9fa48("50040");
      if (stryMutAct_9fa48("50043") ? false : stryMutAct_9fa48("50042") ? true : stryMutAct_9fa48("50041") ? message : (stryCov_9fa48("50041", "50042", "50043"), !message)) {
        if (stryMutAct_9fa48("50044")) {
          {}
        } else {
          stryCov_9fa48("50044");
          return stryMutAct_9fa48("50045") ? "Stryker was here!" : (stryCov_9fa48("50045"), '');
        }
      }
      // Replace newlines with spaces for table display
      const singleLine = String(message).replace(stryMutAct_9fa48("50047") ? /[^\r\n]+/g : stryMutAct_9fa48("50046") ? /[\r\n]/g : (stryCov_9fa48("50046", "50047"), /[\r\n]+/g), stryMutAct_9fa48("50048") ? "" : (stryCov_9fa48("50048"), ' '));
      if (stryMutAct_9fa48("50052") ? singleLine.length > maxLength : stryMutAct_9fa48("50051") ? singleLine.length < maxLength : stryMutAct_9fa48("50050") ? false : stryMutAct_9fa48("50049") ? true : (stryCov_9fa48("50049", "50050", "50051", "50052"), singleLine.length <= maxLength)) {
        if (stryMutAct_9fa48("50053")) {
          {}
        } else {
          stryCov_9fa48("50053");
          return singleLine;
        }
      }
      return (stryMutAct_9fa48("50054") ? singleLine : (stryCov_9fa48("50054"), singleLine.substring(0, stryMutAct_9fa48("50055") ? maxLength + 3 : (stryCov_9fa48("50055"), maxLength - 3)))) + (stryMutAct_9fa48("50056") ? "" : (stryCov_9fa48("50056"), '...'));
    }
  }

  /**
   * Get the row status for styling based on log level
   * Requirements: 29.8
   * @param {Object} log - Log record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(log) {
    if (stryMutAct_9fa48("50057")) {
      {}
    } else {
      stryCov_9fa48("50057");
      const level = stryMutAct_9fa48("50058") ? (log.level || 'INFO').toLowerCase() : (stryCov_9fa48("50058"), (stryMutAct_9fa48("50061") ? log.level && 'INFO' : stryMutAct_9fa48("50060") ? false : stryMutAct_9fa48("50059") ? true : (stryCov_9fa48("50059", "50060", "50061"), log.level || (stryMutAct_9fa48("50062") ? "" : (stryCov_9fa48("50062"), 'INFO')))).toUpperCase());
      if (stryMutAct_9fa48("50065") ? level !== 'ERROR' : stryMutAct_9fa48("50064") ? false : stryMutAct_9fa48("50063") ? true : (stryCov_9fa48("50063", "50064", "50065"), level === (stryMutAct_9fa48("50066") ? "" : (stryCov_9fa48("50066"), 'ERROR')))) {
        if (stryMutAct_9fa48("50067")) {
          {}
        } else {
          stryCov_9fa48("50067");
          return ROW_STATUS.ERROR;
        }
      }
      if (stryMutAct_9fa48("50070") ? level !== 'WARN' : stryMutAct_9fa48("50069") ? false : stryMutAct_9fa48("50068") ? true : (stryCov_9fa48("50068", "50069", "50070"), level === (stryMutAct_9fa48("50071") ? "" : (stryCov_9fa48("50071"), 'WARN')))) {
        if (stryMutAct_9fa48("50072")) {
          {}
        } else {
          stryCov_9fa48("50072");
          return ROW_STATUS.WARNING;
        }
      }
      return ROW_STATUS.NORMAL;
    }
  }

  /**
   * Get the color for a log level
   * Requirements: 29.8
   * @param {string} level - Log level
   * @return {string} Color name
   */
  getLevelColor(level) {
    if (stryMutAct_9fa48("50073")) {
      {}
    } else {
      stryCov_9fa48("50073");
      const normalizedLevel = stryMutAct_9fa48("50074") ? (level || 'INFO').toLowerCase() : (stryCov_9fa48("50074"), (stryMutAct_9fa48("50077") ? level && 'INFO' : stryMutAct_9fa48("50076") ? false : stryMutAct_9fa48("50075") ? true : (stryCov_9fa48("50075", "50076", "50077"), level || (stryMutAct_9fa48("50078") ? "" : (stryCov_9fa48("50078"), 'INFO')))).toUpperCase());
      return stryMutAct_9fa48("50081") ? LOG_LEVEL_COLORS[normalizedLevel] && LOG_LEVEL_COLORS.INFO : stryMutAct_9fa48("50080") ? false : stryMutAct_9fa48("50079") ? true : (stryCov_9fa48("50079", "50080", "50081"), LOG_LEVEL_COLORS[normalizedLevel] || LOG_LEVEL_COLORS.INFO);
    }
  }

  /**
   * Get the unique key for a log entry
   * @param {Object} log - Log record
   * @return {string} Unique key (log_id)
   */
  getItemKey(log) {
    if (stryMutAct_9fa48("50082")) {
      {}
    } else {
      stryCov_9fa48("50082");
      return stryMutAct_9fa48("50085") ? log.log_id && '' : stryMutAct_9fa48("50084") ? false : stryMutAct_9fa48("50083") ? true : (stryCov_9fa48("50083", "50084", "50085"), log.log_id || (stryMutAct_9fa48("50086") ? "Stryker was here!" : (stryCov_9fa48("50086"), '')));
    }
  }

  /**
   * Set level filter
   * Requirements: 29.2
   * @param {string|null} level - Log level to filter by
   */
  setLevelFilter(level) {
    if (stryMutAct_9fa48("50087")) {
      {}
    } else {
      stryCov_9fa48("50087");
      this.levelFilter = level;
      this.fetchLogs();
    }
  }

  /**
   * Set node filter
   * Requirements: 29.3
   * @param {string|null} nodeId - Node ID to filter by
   */
  setNodeFilter(nodeId) {
    if (stryMutAct_9fa48("50088")) {
      {}
    } else {
      stryCov_9fa48("50088");
      this.nodeFilter = nodeId;
      this.fetchLogs();
    }
  }

  /**
   * Set service filter
   * Requirements: 29.4
   * @param {string|null} serviceId - Service ID to filter by
   */
  setServiceFilter(serviceId) {
    if (stryMutAct_9fa48("50089")) {
      {}
    } else {
      stryCov_9fa48("50089");
      this.serviceFilter = serviceId;
      this.fetchLogs();
    }
  }

  /**
   * Set time range filter
   * Requirements: 29.5
   * @param {number|null} startTime - Start timestamp
   * @param {number|null} endTime - End timestamp
   */
  setTimeRangeFilter(startTime, endTime) {
    if (stryMutAct_9fa48("50090")) {
      {}
    } else {
      stryCov_9fa48("50090");
      this.startTimeFilter = startTime;
      this.endTimeFilter = endTime;
      this.fetchLogs();
    }
  }

  /**
   * Set message content filter
   * Requirements: 29.6
   * @param {string|null} pattern - Message pattern to filter by
   */
  setMessageFilter(pattern) {
    if (stryMutAct_9fa48("50091")) {
      {}
    } else {
      stryCov_9fa48("50091");
      this.messageFilter = pattern;
      this.fetchLogs();
    }
  }

  /**
   * Clear all filters
   */
  clearAllFilters() {
    if (stryMutAct_9fa48("50092")) {
      {}
    } else {
      stryCov_9fa48("50092");
      this.levelFilter = null;
      this.nodeFilter = null;
      this.serviceFilter = null;
      this.startTimeFilter = null;
      this.endTimeFilter = null;
      this.messageFilter = null;
      this.filter = stryMutAct_9fa48("50093") ? "Stryker was here!" : (stryCov_9fa48("50093"), '');
      this.fetchLogs();
    }
  }

  /**
   * Apply all filters to data.
   * When connected, server-side SQL handles the primary filters.
   * Client-side filtering is used as fallback (no connection) and
   * for the general text filter from the base class.
   * Requirements: 29.2, 29.3, 29.4, 29.5, 29.6
   * @param {Array} data - Data to filter
   * @return {Array} Filtered data
   */
  applyFilter(data) {
    if (stryMutAct_9fa48("50094")) {
      {}
    } else {
      stryCov_9fa48("50094");
      let result = data;

      // Apply structured filters client-side (fallback when offline
      // or for data already loaded via setData in tests).
      if (stryMutAct_9fa48("50096") ? false : stryMutAct_9fa48("50095") ? true : (stryCov_9fa48("50095", "50096"), this.levelFilter)) {
        if (stryMutAct_9fa48("50097")) {
          {}
        } else {
          stryCov_9fa48("50097");
          result = stryMutAct_9fa48("50098") ? result : (stryCov_9fa48("50098"), result.filter(stryMutAct_9fa48("50099") ? () => undefined : (stryCov_9fa48("50099"), log => stryMutAct_9fa48("50102") ? (log.level || 'INFO').toUpperCase() !== this.levelFilter.toUpperCase() : stryMutAct_9fa48("50101") ? false : stryMutAct_9fa48("50100") ? true : (stryCov_9fa48("50100", "50101", "50102"), (stryMutAct_9fa48("50103") ? (log.level || 'INFO').toLowerCase() : (stryCov_9fa48("50103"), (stryMutAct_9fa48("50106") ? log.level && 'INFO' : stryMutAct_9fa48("50105") ? false : stryMutAct_9fa48("50104") ? true : (stryCov_9fa48("50104", "50105", "50106"), log.level || (stryMutAct_9fa48("50107") ? "" : (stryCov_9fa48("50107"), 'INFO')))).toUpperCase())) === (stryMutAct_9fa48("50108") ? this.levelFilter.toLowerCase() : (stryCov_9fa48("50108"), this.levelFilter.toUpperCase()))))));
        }
      }
      if (stryMutAct_9fa48("50110") ? false : stryMutAct_9fa48("50109") ? true : (stryCov_9fa48("50109", "50110"), this.nodeFilter)) {
        if (stryMutAct_9fa48("50111")) {
          {}
        } else {
          stryCov_9fa48("50111");
          result = stryMutAct_9fa48("50112") ? result : (stryCov_9fa48("50112"), result.filter(stryMutAct_9fa48("50113") ? () => undefined : (stryCov_9fa48("50113"), log => stryMutAct_9fa48("50116") ? log.node_id !== this.nodeFilter : stryMutAct_9fa48("50115") ? false : stryMutAct_9fa48("50114") ? true : (stryCov_9fa48("50114", "50115", "50116"), log.node_id === this.nodeFilter))));
        }
      }
      if (stryMutAct_9fa48("50118") ? false : stryMutAct_9fa48("50117") ? true : (stryCov_9fa48("50117", "50118"), this.serviceFilter)) {
        if (stryMutAct_9fa48("50119")) {
          {}
        } else {
          stryCov_9fa48("50119");
          result = stryMutAct_9fa48("50120") ? result : (stryCov_9fa48("50120"), result.filter(stryMutAct_9fa48("50121") ? () => undefined : (stryCov_9fa48("50121"), log => stryMutAct_9fa48("50124") ? log.service_id !== this.serviceFilter : stryMutAct_9fa48("50123") ? false : stryMutAct_9fa48("50122") ? true : (stryCov_9fa48("50122", "50123", "50124"), log.service_id === this.serviceFilter))));
        }
      }
      if (stryMutAct_9fa48("50127") ? this.startTimeFilter === null : stryMutAct_9fa48("50126") ? false : stryMutAct_9fa48("50125") ? true : (stryCov_9fa48("50125", "50126", "50127"), this.startTimeFilter !== null)) {
        if (stryMutAct_9fa48("50128")) {
          {}
        } else {
          stryCov_9fa48("50128");
          result = stryMutAct_9fa48("50129") ? result : (stryCov_9fa48("50129"), result.filter(log => {
            if (stryMutAct_9fa48("50130")) {
              {}
            } else {
              stryCov_9fa48("50130");
              const ts = this.getLogTimestampMs(log);
              return stryMutAct_9fa48("50133") ? ts !== null || ts >= this.startTimeFilter : stryMutAct_9fa48("50132") ? false : stryMutAct_9fa48("50131") ? true : (stryCov_9fa48("50131", "50132", "50133"), (stryMutAct_9fa48("50135") ? ts === null : stryMutAct_9fa48("50134") ? true : (stryCov_9fa48("50134", "50135"), ts !== null)) && (stryMutAct_9fa48("50138") ? ts < this.startTimeFilter : stryMutAct_9fa48("50137") ? ts > this.startTimeFilter : stryMutAct_9fa48("50136") ? true : (stryCov_9fa48("50136", "50137", "50138"), ts >= this.startTimeFilter)));
            }
          }));
        }
      }
      if (stryMutAct_9fa48("50141") ? this.endTimeFilter === null : stryMutAct_9fa48("50140") ? false : stryMutAct_9fa48("50139") ? true : (stryCov_9fa48("50139", "50140", "50141"), this.endTimeFilter !== null)) {
        if (stryMutAct_9fa48("50142")) {
          {}
        } else {
          stryCov_9fa48("50142");
          result = stryMutAct_9fa48("50143") ? result : (stryCov_9fa48("50143"), result.filter(log => {
            if (stryMutAct_9fa48("50144")) {
              {}
            } else {
              stryCov_9fa48("50144");
              const ts = this.getLogTimestampMs(log);
              return stryMutAct_9fa48("50147") ? ts !== null || ts <= this.endTimeFilter : stryMutAct_9fa48("50146") ? false : stryMutAct_9fa48("50145") ? true : (stryCov_9fa48("50145", "50146", "50147"), (stryMutAct_9fa48("50149") ? ts === null : stryMutAct_9fa48("50148") ? true : (stryCov_9fa48("50148", "50149"), ts !== null)) && (stryMutAct_9fa48("50152") ? ts > this.endTimeFilter : stryMutAct_9fa48("50151") ? ts < this.endTimeFilter : stryMutAct_9fa48("50150") ? true : (stryCov_9fa48("50150", "50151", "50152"), ts <= this.endTimeFilter)));
            }
          }));
        }
      }
      if (stryMutAct_9fa48("50154") ? false : stryMutAct_9fa48("50153") ? true : (stryCov_9fa48("50153", "50154"), this.messageFilter)) {
        if (stryMutAct_9fa48("50155")) {
          {}
        } else {
          stryCov_9fa48("50155");
          const pattern = new RegExp(this.escapeRegex(this.messageFilter), stryMutAct_9fa48("50156") ? "" : (stryCov_9fa48("50156"), 'i'));
          result = stryMutAct_9fa48("50157") ? result : (stryCov_9fa48("50157"), result.filter(stryMutAct_9fa48("50158") ? () => undefined : (stryCov_9fa48("50158"), log => pattern.test(stryMutAct_9fa48("50161") ? log.message && '' : stryMutAct_9fa48("50160") ? false : stryMutAct_9fa48("50159") ? true : (stryCov_9fa48("50159", "50160", "50161"), log.message || (stryMutAct_9fa48("50162") ? "Stryker was here!" : (stryCov_9fa48("50162"), '')))))));
        }
      }

      // Apply general text filter from base class
      if (stryMutAct_9fa48("50165") ? this.filter || this.filter.trim() !== '' : stryMutAct_9fa48("50164") ? false : stryMutAct_9fa48("50163") ? true : (stryCov_9fa48("50163", "50164", "50165"), this.filter && (stryMutAct_9fa48("50167") ? this.filter.trim() === '' : stryMutAct_9fa48("50166") ? true : (stryCov_9fa48("50166", "50167"), (stryMutAct_9fa48("50168") ? this.filter : (stryCov_9fa48("50168"), this.filter.trim())) !== (stryMutAct_9fa48("50169") ? "Stryker was here!" : (stryCov_9fa48("50169"), '')))))) {
        if (stryMutAct_9fa48("50170")) {
          {}
        } else {
          stryCov_9fa48("50170");
          const lowerFilter = stryMutAct_9fa48("50171") ? this.filter.toUpperCase() : (stryCov_9fa48("50171"), this.filter.toLowerCase());
          result = stryMutAct_9fa48("50172") ? result : (stryCov_9fa48("50172"), result.filter(item => {
            if (stryMutAct_9fa48("50173")) {
              {}
            } else {
              stryCov_9fa48("50173");
              const values = Object.values(item);
              return stryMutAct_9fa48("50174") ? values.every(value => {
                if (value === null || value === undefined) return false;
                return String(value).toLowerCase().includes(lowerFilter);
              }) : (stryCov_9fa48("50174"), values.some(value => {
                if (stryMutAct_9fa48("50175")) {
                  {}
                } else {
                  stryCov_9fa48("50175");
                  if (stryMutAct_9fa48("50178") ? value === null && value === undefined : stryMutAct_9fa48("50177") ? false : stryMutAct_9fa48("50176") ? true : (stryCov_9fa48("50176", "50177", "50178"), (stryMutAct_9fa48("50180") ? value !== null : stryMutAct_9fa48("50179") ? false : (stryCov_9fa48("50179", "50180"), value === null)) || (stryMutAct_9fa48("50182") ? value !== undefined : stryMutAct_9fa48("50181") ? false : (stryCov_9fa48("50181", "50182"), value === undefined)))) return stryMutAct_9fa48("50183") ? true : (stryCov_9fa48("50183"), false);
                  return stryMutAct_9fa48("50184") ? String(value).toUpperCase().includes(lowerFilter) : (stryCov_9fa48("50184"), String(value).toLowerCase().includes(lowerFilter));
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
   * Parse timestamp to numeric value
   * @param {number|string|null|undefined} timestamp - Timestamp value
   * @return {number|null} Numeric timestamp or null
   */
  parseTimestamp(timestamp) {
    if (stryMutAct_9fa48("50185")) {
      {}
    } else {
      stryCov_9fa48("50185");
      if (stryMutAct_9fa48("50188") ? timestamp === null && timestamp === undefined : stryMutAct_9fa48("50187") ? false : stryMutAct_9fa48("50186") ? true : (stryCov_9fa48("50186", "50187", "50188"), (stryMutAct_9fa48("50190") ? timestamp !== null : stryMutAct_9fa48("50189") ? false : (stryCov_9fa48("50189", "50190"), timestamp === null)) || (stryMutAct_9fa48("50192") ? timestamp !== undefined : stryMutAct_9fa48("50191") ? false : (stryCov_9fa48("50191", "50192"), timestamp === undefined)))) {
        if (stryMutAct_9fa48("50193")) {
          {}
        } else {
          stryCov_9fa48("50193");
          return null;
        }
      }
      if (stryMutAct_9fa48("50196") ? typeof timestamp !== 'number' : stryMutAct_9fa48("50195") ? false : stryMutAct_9fa48("50194") ? true : (stryCov_9fa48("50194", "50195", "50196"), typeof timestamp === (stryMutAct_9fa48("50197") ? "" : (stryCov_9fa48("50197"), 'number')))) {
        if (stryMutAct_9fa48("50198")) {
          {}
        } else {
          stryCov_9fa48("50198");
          return this.normalizeNumericTimestamp(timestamp);
        }
      }
      if (stryMutAct_9fa48("50201") ? typeof timestamp !== 'string' : stryMutAct_9fa48("50200") ? false : stryMutAct_9fa48("50199") ? true : (stryCov_9fa48("50199", "50200", "50201"), typeof timestamp === (stryMutAct_9fa48("50202") ? "" : (stryCov_9fa48("50202"), 'string')))) {
        if (stryMutAct_9fa48("50203")) {
          {}
        } else {
          stryCov_9fa48("50203");
          const trimmedTimestamp = stryMutAct_9fa48("50204") ? timestamp : (stryCov_9fa48("50204"), timestamp.trim());
          if (stryMutAct_9fa48("50207") ? trimmedTimestamp !== '' : stryMutAct_9fa48("50206") ? false : stryMutAct_9fa48("50205") ? true : (stryCov_9fa48("50205", "50206", "50207"), trimmedTimestamp === (stryMutAct_9fa48("50208") ? "Stryker was here!" : (stryCov_9fa48("50208"), '')))) {
            if (stryMutAct_9fa48("50209")) {
              {}
            } else {
              stryCov_9fa48("50209");
              return null;
            }
          }
          if (stryMutAct_9fa48("50211") ? false : stryMutAct_9fa48("50210") ? true : (stryCov_9fa48("50210", "50211"), LOGS_TIMESTAMP_INTEGER_REGEX.test(trimmedTimestamp))) {
            if (stryMutAct_9fa48("50212")) {
              {}
            } else {
              stryCov_9fa48("50212");
              return this.normalizeNumericTimestamp(Number(trimmedTimestamp));
            }
          }
          const parsed = Date.parse(trimmedTimestamp);
          return isNaN(parsed) ? null : parsed;
        }
      }
      if (stryMutAct_9fa48("50214") ? false : stryMutAct_9fa48("50213") ? true : (stryCov_9fa48("50213", "50214"), timestamp instanceof Date)) {
        if (stryMutAct_9fa48("50215")) {
          {}
        } else {
          stryCov_9fa48("50215");
          const parsed = timestamp.getTime();
          return isNaN(parsed) ? null : parsed;
        }
      }
      return null;
    }
  }

  /**
   * Normalize a numeric timestamp to epoch milliseconds.
   * @param {number} timestamp - Numeric timestamp in seconds or milliseconds.
   * @return {number|null} Epoch milliseconds or null when invalid.
   * @private
   */
  normalizeNumericTimestamp(timestamp) {
    if (stryMutAct_9fa48("50216")) {
      {}
    } else {
      stryCov_9fa48("50216");
      if (stryMutAct_9fa48("50219") ? false : stryMutAct_9fa48("50218") ? true : stryMutAct_9fa48("50217") ? Number.isFinite(timestamp) : (stryCov_9fa48("50217", "50218", "50219"), !Number.isFinite(timestamp))) {
        if (stryMutAct_9fa48("50220")) {
          {}
        } else {
          stryCov_9fa48("50220");
          return null;
        }
      }
      if (stryMutAct_9fa48("50224") ? Math.abs(timestamp) > LOGS_TIMESTAMP_EPOCH_SECONDS_MAX_ABS : stryMutAct_9fa48("50223") ? Math.abs(timestamp) < LOGS_TIMESTAMP_EPOCH_SECONDS_MAX_ABS : stryMutAct_9fa48("50222") ? false : stryMutAct_9fa48("50221") ? true : (stryCov_9fa48("50221", "50222", "50223", "50224"), Math.abs(timestamp) <= LOGS_TIMESTAMP_EPOCH_SECONDS_MAX_ABS)) {
        if (stryMutAct_9fa48("50225")) {
          {}
        } else {
          stryCov_9fa48("50225");
          return Math.trunc(stryMutAct_9fa48("50226") ? timestamp / LOGS_TIMESTAMP_MILLISECONDS_PER_SECOND : (stryCov_9fa48("50226"), timestamp * LOGS_TIMESTAMP_MILLISECONDS_PER_SECOND));
        }
      }
      return Math.trunc(timestamp);
    }
  }

  /**
   * Resolve the best available log timestamp in epoch milliseconds.
   * Uses `timestamp` first, then `created_at` as fallback.
   * @param {Object} log - Log record.
   * @return {number|null} Epoch milliseconds timestamp.
   * @private
   */
  getLogTimestampMs(log) {
    if (stryMutAct_9fa48("50227")) {
      {}
    } else {
      stryCov_9fa48("50227");
      const logTimestamp = this.parseTimestamp(stryMutAct_9fa48("50228") ? log.timestamp : (stryCov_9fa48("50228"), log?.timestamp));
      if (stryMutAct_9fa48("50231") ? logTimestamp === null : stryMutAct_9fa48("50230") ? false : stryMutAct_9fa48("50229") ? true : (stryCov_9fa48("50229", "50230", "50231"), logTimestamp !== null)) {
        if (stryMutAct_9fa48("50232")) {
          {}
        } else {
          stryCov_9fa48("50232");
          return logTimestamp;
        }
      }
      return this.parseTimestamp(stryMutAct_9fa48("50233") ? log.created_at : (stryCov_9fa48("50233"), log?.created_at));
    }
  }

  /**
   * Escape special regex characters
   * @param {string} str - String to escape
   * @return {string} Escaped string
   */
  escapeRegex(str) {
    if (stryMutAct_9fa48("50234")) {
      {}
    } else {
      stryCov_9fa48("50234");
      return str.replace(stryMutAct_9fa48("50235") ? /[^.*+?^${}()|[\]\\]/g : (stryCov_9fa48("50235"), /[.*+?^${}()|[\]\\]/g), stryMutAct_9fa48("50236") ? "" : (stryCov_9fa48("50236"), '\\$&'));
    }
  }

  /**
   * Apply sort to data
   * Requirements: 29.12
   * @param {Array} data - Data to sort
   * @return {Array} Sorted data
   */
  applySort(data) {
    if (stryMutAct_9fa48("50237")) {
      {}
    } else {
      stryCov_9fa48("50237");
      if (stryMutAct_9fa48("50240") ? false : stryMutAct_9fa48("50239") ? true : stryMutAct_9fa48("50238") ? this.sortColumn : (stryCov_9fa48("50238", "50239", "50240"), !this.sortColumn)) {
        if (stryMutAct_9fa48("50241")) {
          {}
        } else {
          stryCov_9fa48("50241");
          return data;
        }
      }
      return stryMutAct_9fa48("50242") ? [...data] : (stryCov_9fa48("50242"), (stryMutAct_9fa48("50243") ? [] : (stryCov_9fa48("50243"), [...data])).sort((a, b) => {
        if (stryMutAct_9fa48("50244")) {
          {}
        } else {
          stryCov_9fa48("50244");
          let aVal = a[this.sortColumn];
          let bVal = b[this.sortColumn];

          // Special handling for timestamp sorting
          if (stryMutAct_9fa48("50247") ? this.sortColumn !== 'timestamp' : stryMutAct_9fa48("50246") ? false : stryMutAct_9fa48("50245") ? true : (stryCov_9fa48("50245", "50246", "50247"), this.sortColumn === (stryMutAct_9fa48("50248") ? "" : (stryCov_9fa48("50248"), 'timestamp')))) {
            if (stryMutAct_9fa48("50249")) {
              {}
            } else {
              stryCov_9fa48("50249");
              aVal = this.getLogTimestampMs(a);
              bVal = this.getLogTimestampMs(b);
            }
          }

          // Handle null/undefined
          if (stryMutAct_9fa48("50252") ? aVal === null || aVal === undefined || bVal === null || bVal === undefined : stryMutAct_9fa48("50251") ? false : stryMutAct_9fa48("50250") ? true : (stryCov_9fa48("50250", "50251", "50252"), (stryMutAct_9fa48("50254") ? aVal === null && aVal === undefined : stryMutAct_9fa48("50253") ? true : (stryCov_9fa48("50253", "50254"), (stryMutAct_9fa48("50256") ? aVal !== null : stryMutAct_9fa48("50255") ? false : (stryCov_9fa48("50255", "50256"), aVal === null)) || (stryMutAct_9fa48("50258") ? aVal !== undefined : stryMutAct_9fa48("50257") ? false : (stryCov_9fa48("50257", "50258"), aVal === undefined)))) && (stryMutAct_9fa48("50260") ? bVal === null && bVal === undefined : stryMutAct_9fa48("50259") ? true : (stryCov_9fa48("50259", "50260"), (stryMutAct_9fa48("50262") ? bVal !== null : stryMutAct_9fa48("50261") ? false : (stryCov_9fa48("50261", "50262"), bVal === null)) || (stryMutAct_9fa48("50264") ? bVal !== undefined : stryMutAct_9fa48("50263") ? false : (stryCov_9fa48("50263", "50264"), bVal === undefined)))))) {
            if (stryMutAct_9fa48("50265")) {
              {}
            } else {
              stryCov_9fa48("50265");
              return 0;
            }
          }
          if (stryMutAct_9fa48("50268") ? aVal === null && aVal === undefined : stryMutAct_9fa48("50267") ? false : stryMutAct_9fa48("50266") ? true : (stryCov_9fa48("50266", "50267", "50268"), (stryMutAct_9fa48("50270") ? aVal !== null : stryMutAct_9fa48("50269") ? false : (stryCov_9fa48("50269", "50270"), aVal === null)) || (stryMutAct_9fa48("50272") ? aVal !== undefined : stryMutAct_9fa48("50271") ? false : (stryCov_9fa48("50271", "50272"), aVal === undefined)))) {
            if (stryMutAct_9fa48("50273")) {
              {}
            } else {
              stryCov_9fa48("50273");
              return (stryMutAct_9fa48("50276") ? this.sortDirection !== 'asc' : stryMutAct_9fa48("50275") ? false : stryMutAct_9fa48("50274") ? true : (stryCov_9fa48("50274", "50275", "50276"), this.sortDirection === (stryMutAct_9fa48("50277") ? "" : (stryCov_9fa48("50277"), 'asc')))) ? 1 : stryMutAct_9fa48("50278") ? +1 : (stryCov_9fa48("50278"), -1);
            }
          }
          if (stryMutAct_9fa48("50281") ? bVal === null && bVal === undefined : stryMutAct_9fa48("50280") ? false : stryMutAct_9fa48("50279") ? true : (stryCov_9fa48("50279", "50280", "50281"), (stryMutAct_9fa48("50283") ? bVal !== null : stryMutAct_9fa48("50282") ? false : (stryCov_9fa48("50282", "50283"), bVal === null)) || (stryMutAct_9fa48("50285") ? bVal !== undefined : stryMutAct_9fa48("50284") ? false : (stryCov_9fa48("50284", "50285"), bVal === undefined)))) {
            if (stryMutAct_9fa48("50286")) {
              {}
            } else {
              stryCov_9fa48("50286");
              return (stryMutAct_9fa48("50289") ? this.sortDirection !== 'asc' : stryMutAct_9fa48("50288") ? false : stryMutAct_9fa48("50287") ? true : (stryCov_9fa48("50287", "50288", "50289"), this.sortDirection === (stryMutAct_9fa48("50290") ? "" : (stryCov_9fa48("50290"), 'asc')))) ? stryMutAct_9fa48("50291") ? +1 : (stryCov_9fa48("50291"), -1) : 1;
            }
          }

          // Compare values
          let cmp;
          if (stryMutAct_9fa48("50294") ? typeof aVal === 'number' || typeof bVal === 'number' : stryMutAct_9fa48("50293") ? false : stryMutAct_9fa48("50292") ? true : (stryCov_9fa48("50292", "50293", "50294"), (stryMutAct_9fa48("50296") ? typeof aVal !== 'number' : stryMutAct_9fa48("50295") ? true : (stryCov_9fa48("50295", "50296"), typeof aVal === (stryMutAct_9fa48("50297") ? "" : (stryCov_9fa48("50297"), 'number')))) && (stryMutAct_9fa48("50299") ? typeof bVal !== 'number' : stryMutAct_9fa48("50298") ? true : (stryCov_9fa48("50298", "50299"), typeof bVal === (stryMutAct_9fa48("50300") ? "" : (stryCov_9fa48("50300"), 'number')))))) {
            if (stryMutAct_9fa48("50301")) {
              {}
            } else {
              stryCov_9fa48("50301");
              cmp = stryMutAct_9fa48("50302") ? aVal + bVal : (stryCov_9fa48("50302"), aVal - bVal);
            }
          } else {
            if (stryMutAct_9fa48("50303")) {
              {}
            } else {
              stryCov_9fa48("50303");
              cmp = String(aVal).localeCompare(String(bVal));
            }
          }

          // Deterministic tie-breakers for dense same-millisecond log bursts.
          if (stryMutAct_9fa48("50306") ? cmp === 0 || this.sortColumn === 'timestamp' : stryMutAct_9fa48("50305") ? false : stryMutAct_9fa48("50304") ? true : (stryCov_9fa48("50304", "50305", "50306"), (stryMutAct_9fa48("50308") ? cmp !== 0 : stryMutAct_9fa48("50307") ? true : (stryCov_9fa48("50307", "50308"), cmp === 0)) && (stryMutAct_9fa48("50310") ? this.sortColumn !== 'timestamp' : stryMutAct_9fa48("50309") ? true : (stryCov_9fa48("50309", "50310"), this.sortColumn === (stryMutAct_9fa48("50311") ? "" : (stryCov_9fa48("50311"), 'timestamp')))))) {
            if (stryMutAct_9fa48("50312")) {
              {}
            } else {
              stryCov_9fa48("50312");
              const aCreatedAt = this.parseTimestamp(stryMutAct_9fa48("50313") ? a.created_at : (stryCov_9fa48("50313"), a?.created_at));
              const bCreatedAt = this.parseTimestamp(stryMutAct_9fa48("50314") ? b.created_at : (stryCov_9fa48("50314"), b?.created_at));
              if (stryMutAct_9fa48("50317") ? aCreatedAt !== null || bCreatedAt !== null : stryMutAct_9fa48("50316") ? false : stryMutAct_9fa48("50315") ? true : (stryCov_9fa48("50315", "50316", "50317"), (stryMutAct_9fa48("50319") ? aCreatedAt === null : stryMutAct_9fa48("50318") ? true : (stryCov_9fa48("50318", "50319"), aCreatedAt !== null)) && (stryMutAct_9fa48("50321") ? bCreatedAt === null : stryMutAct_9fa48("50320") ? true : (stryCov_9fa48("50320", "50321"), bCreatedAt !== null)))) {
                if (stryMutAct_9fa48("50322")) {
                  {}
                } else {
                  stryCov_9fa48("50322");
                  cmp = stryMutAct_9fa48("50323") ? aCreatedAt + bCreatedAt : (stryCov_9fa48("50323"), aCreatedAt - bCreatedAt);
                }
              } else if (stryMutAct_9fa48("50326") ? aCreatedAt === null : stryMutAct_9fa48("50325") ? false : stryMutAct_9fa48("50324") ? true : (stryCov_9fa48("50324", "50325", "50326"), aCreatedAt !== null)) {
                if (stryMutAct_9fa48("50327")) {
                  {}
                } else {
                  stryCov_9fa48("50327");
                  cmp = 1;
                }
              } else if (stryMutAct_9fa48("50330") ? bCreatedAt === null : stryMutAct_9fa48("50329") ? false : stryMutAct_9fa48("50328") ? true : (stryCov_9fa48("50328", "50329", "50330"), bCreatedAt !== null)) {
                if (stryMutAct_9fa48("50331")) {
                  {}
                } else {
                  stryCov_9fa48("50331");
                  cmp = stryMutAct_9fa48("50332") ? +1 : (stryCov_9fa48("50332"), -1);
                }
              }
            }
          }
          if (stryMutAct_9fa48("50335") ? cmp === 0 || this.sortColumn === 'timestamp' : stryMutAct_9fa48("50334") ? false : stryMutAct_9fa48("50333") ? true : (stryCov_9fa48("50333", "50334", "50335"), (stryMutAct_9fa48("50337") ? cmp !== 0 : stryMutAct_9fa48("50336") ? true : (stryCov_9fa48("50336", "50337"), cmp === 0)) && (stryMutAct_9fa48("50339") ? this.sortColumn !== 'timestamp' : stryMutAct_9fa48("50338") ? true : (stryCov_9fa48("50338", "50339"), this.sortColumn === (stryMutAct_9fa48("50340") ? "" : (stryCov_9fa48("50340"), 'timestamp')))))) {
            if (stryMutAct_9fa48("50341")) {
              {}
            } else {
              stryCov_9fa48("50341");
              const aId = String(stryMutAct_9fa48("50344") ? a?.[LOGS_SORT_FALLBACK_ID_FIELD] && '' : stryMutAct_9fa48("50343") ? false : stryMutAct_9fa48("50342") ? true : (stryCov_9fa48("50342", "50343", "50344"), (stryMutAct_9fa48("50345") ? a[LOGS_SORT_FALLBACK_ID_FIELD] : (stryCov_9fa48("50345"), a?.[LOGS_SORT_FALLBACK_ID_FIELD])) || (stryMutAct_9fa48("50346") ? "Stryker was here!" : (stryCov_9fa48("50346"), ''))));
              const bId = String(stryMutAct_9fa48("50349") ? b?.[LOGS_SORT_FALLBACK_ID_FIELD] && '' : stryMutAct_9fa48("50348") ? false : stryMutAct_9fa48("50347") ? true : (stryCov_9fa48("50347", "50348", "50349"), (stryMutAct_9fa48("50350") ? b[LOGS_SORT_FALLBACK_ID_FIELD] : (stryCov_9fa48("50350"), b?.[LOGS_SORT_FALLBACK_ID_FIELD])) || (stryMutAct_9fa48("50351") ? "Stryker was here!" : (stryCov_9fa48("50351"), ''))));
              cmp = aId.localeCompare(bId);
            }
          }
          return (stryMutAct_9fa48("50354") ? this.sortDirection !== 'asc' : stryMutAct_9fa48("50353") ? false : stryMutAct_9fa48("50352") ? true : (stryCov_9fa48("50352", "50353", "50354"), this.sortDirection === (stryMutAct_9fa48("50355") ? "" : (stryCov_9fa48("50355"), 'asc')))) ? cmp : stryMutAct_9fa48("50356") ? +cmp : (stryCov_9fa48("50356"), -cmp);
        }
      }));
    }
  }

  /**
   * Handle drill-down action (Enter key on selected log)
   * Requirements: 29.7
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    if (stryMutAct_9fa48("50357")) {
      {}
    } else {
      stryCov_9fa48("50357");
      const selectedLog = this.getSelectedItem();
      if (stryMutAct_9fa48("50360") ? false : stryMutAct_9fa48("50359") ? true : stryMutAct_9fa48("50358") ? selectedLog : (stryCov_9fa48("50358", "50359", "50360"), !selectedLog)) {
        if (stryMutAct_9fa48("50361")) {
          {}
        } else {
          stryCov_9fa48("50361");
          return null;
        }
      }
      return stryMutAct_9fa48("50362") ? {} : (stryCov_9fa48("50362"), {
        action: stryMutAct_9fa48("50363") ? "" : (stryCov_9fa48("50363"), 'showDetail'),
        view: stryMutAct_9fa48("50364") ? "" : (stryCov_9fa48("50364"), 'logs'),
        context: stryMutAct_9fa48("50365") ? {} : (stryCov_9fa48("50365"), {
          logId: selectedLog.log_id
        }),
        detail: this.getSelectedDetails()
      });
    }
  }

  /**
   * Handle key input for the logs view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (stryMutAct_9fa48("50366")) {
      {}
    } else {
      stryCov_9fa48("50366");
      if (stryMutAct_9fa48("50369") ? key.name === 'enter' && key.name === 'return' : stryMutAct_9fa48("50368") ? false : stryMutAct_9fa48("50367") ? true : (stryCov_9fa48("50367", "50368", "50369"), (stryMutAct_9fa48("50371") ? key.name !== 'enter' : stryMutAct_9fa48("50370") ? false : (stryCov_9fa48("50370", "50371"), key.name === (stryMutAct_9fa48("50372") ? "" : (stryCov_9fa48("50372"), 'enter')))) || (stryMutAct_9fa48("50374") ? key.name !== 'return' : stryMutAct_9fa48("50373") ? false : (stryCov_9fa48("50373", "50374"), key.name === (stryMutAct_9fa48("50375") ? "" : (stryCov_9fa48("50375"), 'return')))))) {
        if (stryMutAct_9fa48("50376")) {
          {}
        } else {
          stryCov_9fa48("50376");
          return this.handleDrillDown();
        }
      }
      return super.handleKey(key);
    }
  }

  /**
   * Get detail information for the selected log
   * Requirements: 29.7
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    if (stryMutAct_9fa48("50377")) {
      {}
    } else {
      stryCov_9fa48("50377");
      const log = this.getSelectedItem();
      if (stryMutAct_9fa48("50380") ? false : stryMutAct_9fa48("50379") ? true : stryMutAct_9fa48("50378") ? log : (stryCov_9fa48("50378", "50379", "50380"), !log)) {
        if (stryMutAct_9fa48("50381")) {
          {}
        } else {
          stryCov_9fa48("50381");
          return null;
        }
      }
      const sections = stryMutAct_9fa48("50382") ? [] : (stryCov_9fa48("50382"), [stryMutAct_9fa48("50383") ? {} : (stryCov_9fa48("50383"), {
        title: stryMutAct_9fa48("50384") ? "" : (stryCov_9fa48("50384"), 'Log Entry'),
        fields: stryMutAct_9fa48("50385") ? [] : (stryCov_9fa48("50385"), [stryMutAct_9fa48("50386") ? {} : (stryCov_9fa48("50386"), {
          label: stryMutAct_9fa48("50387") ? "" : (stryCov_9fa48("50387"), 'Log ID'),
          value: stryMutAct_9fa48("50390") ? log.log_id && 'N/A' : stryMutAct_9fa48("50389") ? false : stryMutAct_9fa48("50388") ? true : (stryCov_9fa48("50388", "50389", "50390"), log.log_id || (stryMutAct_9fa48("50391") ? "" : (stryCov_9fa48("50391"), 'N/A')))
        }), stryMutAct_9fa48("50392") ? {} : (stryCov_9fa48("50392"), {
          label: stryMutAct_9fa48("50393") ? "" : (stryCov_9fa48("50393"), 'Timestamp'),
          value: this.formatTimestamp(this.getLogTimestampMs(log))
        }), stryMutAct_9fa48("50394") ? {} : (stryCov_9fa48("50394"), {
          label: stryMutAct_9fa48("50395") ? "" : (stryCov_9fa48("50395"), 'Level'),
          value: stryMutAct_9fa48("50398") ? log.level && 'INFO' : stryMutAct_9fa48("50397") ? false : stryMutAct_9fa48("50396") ? true : (stryCov_9fa48("50396", "50397", "50398"), log.level || (stryMutAct_9fa48("50399") ? "" : (stryCov_9fa48("50399"), 'INFO')))
        }), stryMutAct_9fa48("50400") ? {} : (stryCov_9fa48("50400"), {
          label: stryMutAct_9fa48("50401") ? "" : (stryCov_9fa48("50401"), 'Node ID'),
          value: stryMutAct_9fa48("50404") ? log.node_id && 'N/A' : stryMutAct_9fa48("50403") ? false : stryMutAct_9fa48("50402") ? true : (stryCov_9fa48("50402", "50403", "50404"), log.node_id || (stryMutAct_9fa48("50405") ? "" : (stryCov_9fa48("50405"), 'N/A')))
        }), stryMutAct_9fa48("50406") ? {} : (stryCov_9fa48("50406"), {
          label: stryMutAct_9fa48("50407") ? "" : (stryCov_9fa48("50407"), 'Service ID'),
          value: stryMutAct_9fa48("50410") ? log.service_id && 'N/A' : stryMutAct_9fa48("50409") ? false : stryMutAct_9fa48("50408") ? true : (stryCov_9fa48("50408", "50409", "50410"), log.service_id || (stryMutAct_9fa48("50411") ? "" : (stryCov_9fa48("50411"), 'N/A')))
        })])
      }), stryMutAct_9fa48("50412") ? {} : (stryCov_9fa48("50412"), {
        title: stryMutAct_9fa48("50413") ? "" : (stryCov_9fa48("50413"), 'Message'),
        fields: stryMutAct_9fa48("50414") ? [] : (stryCov_9fa48("50414"), [stryMutAct_9fa48("50415") ? {} : (stryCov_9fa48("50415"), {
          label: stryMutAct_9fa48("50416") ? "" : (stryCov_9fa48("50416"), 'Content'),
          value: stryMutAct_9fa48("50419") ? log.message && '' : stryMutAct_9fa48("50418") ? false : stryMutAct_9fa48("50417") ? true : (stryCov_9fa48("50417", "50418", "50419"), log.message || (stryMutAct_9fa48("50420") ? "Stryker was here!" : (stryCov_9fa48("50420"), '')))
        })])
      })]);

      // Add metadata section if available
      if (stryMutAct_9fa48("50423") ? log.metadata || typeof log.metadata === 'object' : stryMutAct_9fa48("50422") ? false : stryMutAct_9fa48("50421") ? true : (stryCov_9fa48("50421", "50422", "50423"), log.metadata && (stryMutAct_9fa48("50425") ? typeof log.metadata !== 'object' : stryMutAct_9fa48("50424") ? true : (stryCov_9fa48("50424", "50425"), typeof log.metadata === (stryMutAct_9fa48("50426") ? "" : (stryCov_9fa48("50426"), 'object')))))) {
        if (stryMutAct_9fa48("50427")) {
          {}
        } else {
          stryCov_9fa48("50427");
          const metadataFields = Object.entries(log.metadata).map(stryMutAct_9fa48("50428") ? () => undefined : (stryCov_9fa48("50428"), ([k, v]) => stryMutAct_9fa48("50429") ? {} : (stryCov_9fa48("50429"), {
            label: k,
            value: (stryMutAct_9fa48("50432") ? typeof v !== 'object' : stryMutAct_9fa48("50431") ? false : stryMutAct_9fa48("50430") ? true : (stryCov_9fa48("50430", "50431", "50432"), typeof v === (stryMutAct_9fa48("50433") ? "" : (stryCov_9fa48("50433"), 'object')))) ? JSON.stringify(v) : String(v)
          })));
          if (stryMutAct_9fa48("50437") ? metadataFields.length <= 0 : stryMutAct_9fa48("50436") ? metadataFields.length >= 0 : stryMutAct_9fa48("50435") ? false : stryMutAct_9fa48("50434") ? true : (stryCov_9fa48("50434", "50435", "50436", "50437"), metadataFields.length > 0)) {
            if (stryMutAct_9fa48("50438")) {
              {}
            } else {
              stryCov_9fa48("50438");
              sections.push(stryMutAct_9fa48("50439") ? {} : (stryCov_9fa48("50439"), {
                title: stryMutAct_9fa48("50440") ? "" : (stryCov_9fa48("50440"), 'Metadata'),
                fields: metadataFields
              }));
            }
          }
        }
      }
      return stryMutAct_9fa48("50441") ? {} : (stryCov_9fa48("50441"), {
        title: stryMutAct_9fa48("50442") ? `` : (stryCov_9fa48("50442"), `Log: ${stryMutAct_9fa48("50445") ? log.log_id && 'Unknown' : stryMutAct_9fa48("50444") ? false : stryMutAct_9fa48("50443") ? true : (stryCov_9fa48("50443", "50444", "50445"), log.log_id || (stryMutAct_9fa48("50446") ? "" : (stryCov_9fa48("50446"), 'Unknown')))}`),
        sections
      });
    }
  }

  /**
   * Get time range of current data
   * Requirements: 29.11
   * @return {Object} Time range with start and end
   */
  getTimeRange() {
    if (stryMutAct_9fa48("50447")) {
      {}
    } else {
      stryCov_9fa48("50447");
      if (stryMutAct_9fa48("50450") ? this.filteredData.length !== 0 : stryMutAct_9fa48("50449") ? false : stryMutAct_9fa48("50448") ? true : (stryCov_9fa48("50448", "50449", "50450"), this.filteredData.length === 0)) {
        if (stryMutAct_9fa48("50451")) {
          {}
        } else {
          stryCov_9fa48("50451");
          return stryMutAct_9fa48("50452") ? {} : (stryCov_9fa48("50452"), {
            start: null,
            end: null
          });
        }
      }
      let minTime = Infinity;
      let maxTime = stryMutAct_9fa48("50453") ? +Infinity : (stryCov_9fa48("50453"), -Infinity);
      for (const log of this.filteredData) {
        if (stryMutAct_9fa48("50454")) {
          {}
        } else {
          stryCov_9fa48("50454");
          const ts = this.getLogTimestampMs(log);
          if (stryMutAct_9fa48("50457") ? ts === null : stryMutAct_9fa48("50456") ? false : stryMutAct_9fa48("50455") ? true : (stryCov_9fa48("50455", "50456", "50457"), ts !== null)) {
            if (stryMutAct_9fa48("50458")) {
              {}
            } else {
              stryCov_9fa48("50458");
              if (stryMutAct_9fa48("50462") ? ts >= minTime : stryMutAct_9fa48("50461") ? ts <= minTime : stryMutAct_9fa48("50460") ? false : stryMutAct_9fa48("50459") ? true : (stryCov_9fa48("50459", "50460", "50461", "50462"), ts < minTime)) minTime = ts;
              if (stryMutAct_9fa48("50466") ? ts <= maxTime : stryMutAct_9fa48("50465") ? ts >= maxTime : stryMutAct_9fa48("50464") ? false : stryMutAct_9fa48("50463") ? true : (stryCov_9fa48("50463", "50464", "50465", "50466"), ts > maxTime)) maxTime = ts;
            }
          }
        }
      }
      return stryMutAct_9fa48("50467") ? {} : (stryCov_9fa48("50467"), {
        start: (stryMutAct_9fa48("50470") ? minTime !== Infinity : stryMutAct_9fa48("50469") ? false : stryMutAct_9fa48("50468") ? true : (stryCov_9fa48("50468", "50469", "50470"), minTime === Infinity)) ? null : minTime,
        end: (stryMutAct_9fa48("50473") ? maxTime !== -Infinity : stryMutAct_9fa48("50472") ? false : stryMutAct_9fa48("50471") ? true : (stryCov_9fa48("50471", "50472", "50473"), maxTime === (stryMutAct_9fa48("50474") ? +Infinity : (stryCov_9fa48("50474"), -Infinity)))) ? null : maxTime
      });
    }
  }

  /**
   * Get status bar information
   * Requirements: 29.11
   * @return {Object} Status bar data
   */
  getStatusBarInfo() {
    if (stryMutAct_9fa48("50475")) {
      {}
    } else {
      stryCov_9fa48("50475");
      const timeRange = this.getTimeRange();
      const activeFilters = stryMutAct_9fa48("50476") ? ["Stryker was here"] : (stryCov_9fa48("50476"), []);
      if (stryMutAct_9fa48("50478") ? false : stryMutAct_9fa48("50477") ? true : (stryCov_9fa48("50477", "50478"), this.levelFilter)) {
        if (stryMutAct_9fa48("50479")) {
          {}
        } else {
          stryCov_9fa48("50479");
          activeFilters.push(stryMutAct_9fa48("50480") ? `` : (stryCov_9fa48("50480"), `Level: ${this.levelFilter}`));
        }
      }
      if (stryMutAct_9fa48("50482") ? false : stryMutAct_9fa48("50481") ? true : (stryCov_9fa48("50481", "50482"), this.nodeFilter)) {
        if (stryMutAct_9fa48("50483")) {
          {}
        } else {
          stryCov_9fa48("50483");
          activeFilters.push(stryMutAct_9fa48("50484") ? `` : (stryCov_9fa48("50484"), `Node: ${this.nodeFilter}`));
        }
      }
      if (stryMutAct_9fa48("50486") ? false : stryMutAct_9fa48("50485") ? true : (stryCov_9fa48("50485", "50486"), this.serviceFilter)) {
        if (stryMutAct_9fa48("50487")) {
          {}
        } else {
          stryCov_9fa48("50487");
          activeFilters.push(stryMutAct_9fa48("50488") ? `` : (stryCov_9fa48("50488"), `Service: ${this.serviceFilter}`));
        }
      }
      if (stryMutAct_9fa48("50490") ? false : stryMutAct_9fa48("50489") ? true : (stryCov_9fa48("50489", "50490"), this.messageFilter)) {
        if (stryMutAct_9fa48("50491")) {
          {}
        } else {
          stryCov_9fa48("50491");
          activeFilters.push(stryMutAct_9fa48("50492") ? `` : (stryCov_9fa48("50492"), `Message: "${this.messageFilter}"`));
        }
      }
      if (stryMutAct_9fa48("50495") ? this.startTimeFilter && this.endTimeFilter : stryMutAct_9fa48("50494") ? false : stryMutAct_9fa48("50493") ? true : (stryCov_9fa48("50493", "50494", "50495"), this.startTimeFilter || this.endTimeFilter)) {
        if (stryMutAct_9fa48("50496")) {
          {}
        } else {
          stryCov_9fa48("50496");
          activeFilters.push(stryMutAct_9fa48("50497") ? "" : (stryCov_9fa48("50497"), 'Time range active'));
        }
      }
      return stryMutAct_9fa48("50498") ? {} : (stryCov_9fa48("50498"), {
        logCount: this.filteredData.length,
        totalCount: this.data.length,
        timeRange,
        activeFilters
      });
    }
  }

  /**
   * Render the view with log-specific styling
   * @param {Object} state - Navigation state
   * @return {Object} Render data with headers and rows
   */
  render(state = {}) {
    if (stryMutAct_9fa48("50499")) {
      {}
    } else {
      stryCov_9fa48("50499");
      const baseRender = super.render(state);

      // Add status bar info
      baseRender.statusBar = this.getStatusBarInfo();
      return baseRender;
    }
  }

  /**
   * Export filtered logs to a formatted string
   * Requirements: 29.10
   * @param {string} format - Export format ('json', 'csv', 'text')
   * @return {string} Exported logs as string
   */
  exportLogs(format = stryMutAct_9fa48("50500") ? "" : (stryCov_9fa48("50500"), 'json')) {
    if (stryMutAct_9fa48("50501")) {
      {}
    } else {
      stryCov_9fa48("50501");
      const logs = this.filteredData;
      switch (stryMutAct_9fa48("50502") ? format.toUpperCase() : (stryCov_9fa48("50502"), format.toLowerCase())) {
        case stryMutAct_9fa48("50504") ? "" : (stryCov_9fa48("50504"), 'json'):
          if (stryMutAct_9fa48("50503")) {} else {
            stryCov_9fa48("50503");
            return this.exportAsJSON(logs);
          }
        case stryMutAct_9fa48("50506") ? "" : (stryCov_9fa48("50506"), 'csv'):
          if (stryMutAct_9fa48("50505")) {} else {
            stryCov_9fa48("50505");
            return this.exportAsCSV(logs);
          }
        case stryMutAct_9fa48("50508") ? "" : (stryCov_9fa48("50508"), 'text'):
          if (stryMutAct_9fa48("50507")) {} else {
            stryCov_9fa48("50507");
            return this.exportAsText(logs);
          }
        default:
          if (stryMutAct_9fa48("50509")) {} else {
            stryCov_9fa48("50509");
            return this.exportAsJSON(logs);
          }
      }
    }
  }

  /**
   * Export logs as JSON
   * @param {Array} logs - Logs to export
   * @return {string} JSON string
   */
  exportAsJSON(logs) {
    if (stryMutAct_9fa48("50510")) {
      {}
    } else {
      stryCov_9fa48("50510");
      return JSON.stringify(logs, null, 2);
    }
  }

  /**
   * Export logs as CSV
   * @param {Array} logs - Logs to export
   * @return {string} CSV string
   */
  exportAsCSV(logs) {
    if (stryMutAct_9fa48("50511")) {
      {}
    } else {
      stryCov_9fa48("50511");
      if (stryMutAct_9fa48("50514") ? logs.length !== 0 : stryMutAct_9fa48("50513") ? false : stryMutAct_9fa48("50512") ? true : (stryCov_9fa48("50512", "50513", "50514"), logs.length === 0)) {
        if (stryMutAct_9fa48("50515")) {
          {}
        } else {
          stryCov_9fa48("50515");
          return stryMutAct_9fa48("50516") ? "" : (stryCov_9fa48("50516"), 'timestamp,level,node_id,service_id,message');
        }
      }
      const headers = stryMutAct_9fa48("50517") ? [] : (stryCov_9fa48("50517"), [stryMutAct_9fa48("50518") ? "" : (stryCov_9fa48("50518"), 'timestamp'), stryMutAct_9fa48("50519") ? "" : (stryCov_9fa48("50519"), 'level'), stryMutAct_9fa48("50520") ? "" : (stryCov_9fa48("50520"), 'node_id'), stryMutAct_9fa48("50521") ? "" : (stryCov_9fa48("50521"), 'service_id'), stryMutAct_9fa48("50522") ? "" : (stryCov_9fa48("50522"), 'message')]);
      const rows = stryMutAct_9fa48("50523") ? [] : (stryCov_9fa48("50523"), [headers.join(stryMutAct_9fa48("50524") ? "" : (stryCov_9fa48("50524"), ','))]);
      for (const log of logs) {
        if (stryMutAct_9fa48("50525")) {
          {}
        } else {
          stryCov_9fa48("50525");
          const row = headers.map(h => {
            if (stryMutAct_9fa48("50526")) {
              {}
            } else {
              stryCov_9fa48("50526");
              let value = log[h];
              if (stryMutAct_9fa48("50529") ? value === null && value === undefined : stryMutAct_9fa48("50528") ? false : stryMutAct_9fa48("50527") ? true : (stryCov_9fa48("50527", "50528", "50529"), (stryMutAct_9fa48("50531") ? value !== null : stryMutAct_9fa48("50530") ? false : (stryCov_9fa48("50530", "50531"), value === null)) || (stryMutAct_9fa48("50533") ? value !== undefined : stryMutAct_9fa48("50532") ? false : (stryCov_9fa48("50532", "50533"), value === undefined)))) {
                if (stryMutAct_9fa48("50534")) {
                  {}
                } else {
                  stryCov_9fa48("50534");
                  return stryMutAct_9fa48("50535") ? "Stryker was here!" : (stryCov_9fa48("50535"), '');
                }
              }
              value = String(value);
              if (stryMutAct_9fa48("50538") ? (value.includes(',') || value.includes('\n')) && value.includes('"') : stryMutAct_9fa48("50537") ? false : stryMutAct_9fa48("50536") ? true : (stryCov_9fa48("50536", "50537", "50538"), (stryMutAct_9fa48("50540") ? value.includes(',') && value.includes('\n') : stryMutAct_9fa48("50539") ? false : (stryCov_9fa48("50539", "50540"), value.includes(stryMutAct_9fa48("50541") ? "" : (stryCov_9fa48("50541"), ',')) || value.includes(stryMutAct_9fa48("50542") ? "" : (stryCov_9fa48("50542"), '\n')))) || value.includes(stryMutAct_9fa48("50543") ? "" : (stryCov_9fa48("50543"), '"')))) {
                if (stryMutAct_9fa48("50544")) {
                  {}
                } else {
                  stryCov_9fa48("50544");
                  value = (stryMutAct_9fa48("50545") ? "" : (stryCov_9fa48("50545"), '"')) + value.replace(/"/g, stryMutAct_9fa48("50546") ? "" : (stryCov_9fa48("50546"), '""')) + (stryMutAct_9fa48("50547") ? "" : (stryCov_9fa48("50547"), '"'));
                }
              }
              return value;
            }
          });
          rows.push(row.join(stryMutAct_9fa48("50548") ? "" : (stryCov_9fa48("50548"), ',')));
        }
      }
      return rows.join(stryMutAct_9fa48("50549") ? "" : (stryCov_9fa48("50549"), '\n'));
    }
  }

  /**
   * Export logs as plain text
   * @param {Array} logs - Logs to export
   * @return {string} Text string
   */
  exportAsText(logs) {
    if (stryMutAct_9fa48("50550")) {
      {}
    } else {
      stryCov_9fa48("50550");
      if (stryMutAct_9fa48("50553") ? logs.length !== 0 : stryMutAct_9fa48("50552") ? false : stryMutAct_9fa48("50551") ? true : (stryCov_9fa48("50551", "50552", "50553"), logs.length === 0)) {
        if (stryMutAct_9fa48("50554")) {
          {}
        } else {
          stryCov_9fa48("50554");
          return stryMutAct_9fa48("50555") ? "" : (stryCov_9fa48("50555"), 'No logs to export');
        }
      }
      const lines = stryMutAct_9fa48("50556") ? ["Stryker was here"] : (stryCov_9fa48("50556"), []);
      for (const log of logs) {
        if (stryMutAct_9fa48("50557")) {
          {}
        } else {
          stryCov_9fa48("50557");
          const timestamp = this.formatTimestamp(this.getLogTimestampMs(log));
          const level = (stryMutAct_9fa48("50560") ? log.level && 'INFO' : stryMutAct_9fa48("50559") ? false : stryMutAct_9fa48("50558") ? true : (stryCov_9fa48("50558", "50559", "50560"), log.level || (stryMutAct_9fa48("50561") ? "" : (stryCov_9fa48("50561"), 'INFO')))).padEnd(5);
          const nodeId = stryMutAct_9fa48("50564") ? log.node_id && 'N/A' : stryMutAct_9fa48("50563") ? false : stryMutAct_9fa48("50562") ? true : (stryCov_9fa48("50562", "50563", "50564"), log.node_id || (stryMutAct_9fa48("50565") ? "" : (stryCov_9fa48("50565"), 'N/A')));
          const serviceId = stryMutAct_9fa48("50568") ? log.service_id && 'N/A' : stryMutAct_9fa48("50567") ? false : stryMutAct_9fa48("50566") ? true : (stryCov_9fa48("50566", "50567", "50568"), log.service_id || (stryMutAct_9fa48("50569") ? "" : (stryCov_9fa48("50569"), 'N/A')));
          const message = stryMutAct_9fa48("50572") ? log.message && '' : stryMutAct_9fa48("50571") ? false : stryMutAct_9fa48("50570") ? true : (stryCov_9fa48("50570", "50571", "50572"), log.message || (stryMutAct_9fa48("50573") ? "Stryker was here!" : (stryCov_9fa48("50573"), '')));
          lines.push((stryMutAct_9fa48("50574") ? `` : (stryCov_9fa48("50574"), `[${timestamp}] ${level} [${nodeId}]`)) + (stryMutAct_9fa48("50575") ? `` : (stryCov_9fa48("50575"), ` [${serviceId}] ${message}`)));
        }
      }
      return lines.join(stryMutAct_9fa48("50576") ? "" : (stryCov_9fa48("50576"), '\n'));
    }
  }

  /**
   * Get export metadata
   * @return {Object} Export metadata
   */
  getExportMetadata() {
    if (stryMutAct_9fa48("50577")) {
      {}
    } else {
      stryCov_9fa48("50577");
      const timeRange = this.getTimeRange();
      return stryMutAct_9fa48("50578") ? {} : (stryCov_9fa48("50578"), {
        exportedAt: new Date().toISOString(),
        totalLogs: this.data.length,
        filteredLogs: this.filteredData.length,
        filters: stryMutAct_9fa48("50579") ? {} : (stryCov_9fa48("50579"), {
          level: this.levelFilter,
          nodeId: this.nodeFilter,
          serviceId: this.serviceFilter,
          startTime: this.startTimeFilter,
          endTime: this.endTimeFilter,
          messagePattern: this.messageFilter
        }),
        timeRange: stryMutAct_9fa48("50580") ? {} : (stryCov_9fa48("50580"), {
          start: timeRange.start ? new Date(timeRange.start).toISOString() : null,
          end: timeRange.end ? new Date(timeRange.end).toISOString() : null
        })
      });
    }
  }
}