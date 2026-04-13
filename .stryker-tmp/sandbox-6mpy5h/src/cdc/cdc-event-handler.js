/**
 * CDC Event Handler - Handles CDC events for system state changes.
 *
 * This module provides CDC event handling logic extracted from CDCIntegrationService.
 * It handles epoch changes, node state changes, and node join events.
 *
 * Requirements: 1.4, 1.8
 *
 * @module cdc/cdc-event-handler
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
import { ADDRESS, COLUMN, NUM, PROTOCOL, CDC_OPERATION, STATE, TYPEOF } from '../constants/index.js';
import { METRICS_LOG_TAG } from '../constants/index.js';
import { ENTRYPOINT_DEFAULT } from '../constants/entrypoint.js';
import { LoggingService } from '../logging/logging-service.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { AssignmentEpoch } from '../rebalancer/assignment-epoch.js';
import { CDC_EPOCH_CONFIG_KEY, CDC_ERROR_MSG, CDC_EVENT, CDC_LOG_MSG, CDC_SKIP_REASON, CDC_SOURCE, CDC_SUBSYSTEM } from './cdc-constants.js';
import { NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE, resolveNodeWebSocketAddress } from '../transport/node-address-resolution.js';

/**
 * CDCEventHandler processes CDC events for system state changes.
 *
 * This class is responsible for:
 * - Handling epoch change events from the config table
 * - Handling node state change events from the nodes table
 * - Handling node join events for mesh connectivity
 *
 * @interface
 *
 * @description
 * CDCEventHandler provides event handling logic that was previously embedded
 * in CDCIntegrationService. It works with an EventHandlerContext to access
 * epoch manager, rebalancer, message router, and emit events.
 *
 * Requirements: 1.4, 1.8
 *
 * @constructor
 * @param {Object} options - Configuration options
 * @param {string} options.nodeId - Current node ID (REQUIRED)
 * @param {Object} options.eventContext - Context for event handling (REQUIRED)
 *
 * @example
 * const handler = new CDCEventHandler({
 *   nodeId: 'node-1',
 *   eventContext: context,
 * });
 *
 * const result = handler.handleEpochChangeCDC(cdcEvent);
 */
const CONSTRUCTOR_ERROR_NODE_ID = stryMutAct_9fa48("35516") ? "" : (stryCov_9fa48("35516"), 'CDCEventHandler requires nodeId');
const CONSTRUCTOR_ERROR_EVENT_CONTEXT = stryMutAct_9fa48("35517") ? "" : (stryCov_9fa48("35517"), 'CDCEventHandler requires eventContext');
const CDC_EVENT_HANDLER_ERROR = Object.freeze(stryMutAct_9fa48("35518") ? {} : (stryCov_9fa48("35518"), {
  MISSING_CANONICAL_NODE_ENDPOINTS_WEBSOCKET_ADDRESS: stryMutAct_9fa48("35519") ? "" : (stryCov_9fa48("35519"), 'Missing canonical node_endpoints websocket address')
}));
function buildNodeStateCDCResult(options = {}) {
  if (stryMutAct_9fa48("35520")) {
    {}
  } else {
    stryCov_9fa48("35520");
    const result = stryMutAct_9fa48("35521") ? {} : (stryCov_9fa48("35521"), {
      processed: stryMutAct_9fa48("35524") ? options.processed === false : stryMutAct_9fa48("35523") ? false : stryMutAct_9fa48("35522") ? true : (stryCov_9fa48("35522", "35523", "35524"), options.processed !== (stryMutAct_9fa48("35525") ? true : (stryCov_9fa48("35525"), false))),
      nodeId: options.nodeId,
      oldState: Object.hasOwn(options, stryMutAct_9fa48("35526") ? "" : (stryCov_9fa48("35526"), 'oldState')) ? options.oldState : null,
      newState: Object.hasOwn(options, stryMutAct_9fa48("35527") ? "" : (stryCov_9fa48("35527"), 'newState')) ? options.newState : null,
      stateChanged: stryMutAct_9fa48("35530") ? options.stateChanged !== true : stryMutAct_9fa48("35529") ? false : stryMutAct_9fa48("35528") ? true : (stryCov_9fa48("35528", "35529", "35530"), options.stateChanged === (stryMutAct_9fa48("35531") ? false : (stryCov_9fa48("35531"), true))),
      staleEventIgnored: stryMutAct_9fa48("35534") ? options.staleEventIgnored !== true : stryMutAct_9fa48("35533") ? false : stryMutAct_9fa48("35532") ? true : (stryCov_9fa48("35532", "35533", "35534"), options.staleEventIgnored === (stryMutAct_9fa48("35535") ? false : (stryCov_9fa48("35535"), true)))
    });
    if (stryMutAct_9fa48("35537") ? false : stryMutAct_9fa48("35536") ? true : (stryCov_9fa48("35536", "35537"), Number.isFinite(options.eventTimestamp))) {
      if (stryMutAct_9fa48("35538")) {
        {}
      } else {
        stryCov_9fa48("35538");
        result.eventTimestamp = options.eventTimestamp;
      }
    }
    if (stryMutAct_9fa48("35540") ? false : stryMutAct_9fa48("35539") ? true : (stryCov_9fa48("35539", "35540"), Number.isFinite(options.lastTimestamp))) {
      if (stryMutAct_9fa48("35541")) {
        {}
      } else {
        stryCov_9fa48("35541");
        result.lastTimestamp = options.lastTimestamp;
      }
    }
    return result;
  }
}
function buildNodeJoinedCDCResult(options = {}) {
  if (stryMutAct_9fa48("35542")) {
    {}
  } else {
    stryCov_9fa48("35542");
    const result = stryMutAct_9fa48("35543") ? {} : (stryCov_9fa48("35543"), {
      processed: stryMutAct_9fa48("35546") ? options.processed !== true : stryMutAct_9fa48("35545") ? false : stryMutAct_9fa48("35544") ? true : (stryCov_9fa48("35544", "35545", "35546"), options.processed === (stryMutAct_9fa48("35547") ? false : (stryCov_9fa48("35547"), true))),
      nodeId: options.nodeId,
      connected: stryMutAct_9fa48("35550") ? options.connected !== true : stryMutAct_9fa48("35549") ? false : stryMutAct_9fa48("35548") ? true : (stryCov_9fa48("35548", "35549", "35550"), options.connected === (stryMutAct_9fa48("35551") ? false : (stryCov_9fa48("35551"), true))),
      skipped: stryMutAct_9fa48("35554") ? options.skipped !== true : stryMutAct_9fa48("35553") ? false : stryMutAct_9fa48("35552") ? true : (stryCov_9fa48("35552", "35553", "35554"), options.skipped === (stryMutAct_9fa48("35555") ? false : (stryCov_9fa48("35555"), true)))
    });
    if (stryMutAct_9fa48("35557") ? false : stryMutAct_9fa48("35556") ? true : (stryCov_9fa48("35556", "35557"), options.reason)) {
      if (stryMutAct_9fa48("35558")) {
        {}
      } else {
        stryCov_9fa48("35558");
        result.reason = options.reason;
      }
    }
    if (stryMutAct_9fa48("35560") ? false : stryMutAct_9fa48("35559") ? true : (stryCov_9fa48("35559", "35560"), options.error)) {
      if (stryMutAct_9fa48("35561")) {
        {}
      } else {
        stryCov_9fa48("35561");
        result.error = options.error;
      }
    }
    if (stryMutAct_9fa48("35563") ? false : stryMutAct_9fa48("35562") ? true : (stryCov_9fa48("35562", "35563"), options.wsAddress)) {
      if (stryMutAct_9fa48("35564")) {
        {}
      } else {
        stryCov_9fa48("35564");
        result.wsAddress = options.wsAddress;
      }
    }
    return result;
  }
}
class CDCEventHandler {
  /**
   * Create a new CDCEventHandler instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Current node ID.
   * @param {Object} options.eventContext - Context for event handling.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("35565")) {
      {}
    } else {
      stryCov_9fa48("35565");
      if (stryMutAct_9fa48("35568") ? false : stryMutAct_9fa48("35567") ? true : stryMutAct_9fa48("35566") ? options.nodeId : (stryCov_9fa48("35566", "35567", "35568"), !options.nodeId)) {
        if (stryMutAct_9fa48("35569")) {
          {}
        } else {
          stryCov_9fa48("35569");
          throw new Error(CONSTRUCTOR_ERROR_NODE_ID);
        }
      }
      if (stryMutAct_9fa48("35572") ? false : stryMutAct_9fa48("35571") ? true : stryMutAct_9fa48("35570") ? options.eventContext : (stryCov_9fa48("35570", "35571", "35572"), !options.eventContext)) {
        if (stryMutAct_9fa48("35573")) {
          {}
        } else {
          stryCov_9fa48("35573");
          throw new Error(CONSTRUCTOR_ERROR_EVENT_CONTEXT);
        }
      }
      this.nodeId = options.nodeId;
      this.eventContext = options.eventContext;

      // Track previous node states for detecting changes
      this._nodeStates = new Map();
      this._nodeStateEventTimestamps = new Map();

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(CDC_SUBSYSTEM.INTEGRATION) : console;
    }
  }

  /**
   * Handle epoch change CDC event.
   * Listens for epoch changes in the config table and updates the local
   * AssignmentEpochManager.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be config).
   * @param {string} cdcEvent.operation - The operation type (INSERT, UPDATE).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.config_key - The config key.
   * @param {string} cdcEvent.data.config_value - The config value (epoch JSON).
   * @return {{applied: boolean, epoch?: number, error?: string}}
   *   Result object indicating if epoch was applied.
   */
  handleEpochChangeCDC(cdcEvent) {
    if (stryMutAct_9fa48("35574")) {
      {}
    } else {
      stryCov_9fa48("35574");
      const handlerStartMs = Date.now();

      // Validate cdcEvent
      if (stryMutAct_9fa48("35577") ? !cdcEvent && typeof cdcEvent !== TYPEOF.OBJECT : stryMutAct_9fa48("35576") ? false : stryMutAct_9fa48("35575") ? true : (stryCov_9fa48("35575", "35576", "35577"), (stryMutAct_9fa48("35578") ? cdcEvent : (stryCov_9fa48("35578"), !cdcEvent)) || (stryMutAct_9fa48("35580") ? typeof cdcEvent === TYPEOF.OBJECT : stryMutAct_9fa48("35579") ? false : (stryCov_9fa48("35579", "35580"), typeof cdcEvent !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("35581")) {
          {}
        } else {
          stryCov_9fa48("35581");
          return stryMutAct_9fa48("35582") ? {} : (stryCov_9fa48("35582"), {
            applied: stryMutAct_9fa48("35583") ? true : (stryCov_9fa48("35583"), false),
            error: CDC_ERROR_MSG.INVALID_EVENT
          });
        }
      }

      // Check if this is an epoch change event
      const configKey = stryMutAct_9fa48("35584") ? cdcEvent.data[COLUMN.CONFIG_KEY] : (stryCov_9fa48("35584"), cdcEvent.data?.[COLUMN.CONFIG_KEY]);
      if (stryMutAct_9fa48("35587") ? configKey === CDC_EPOCH_CONFIG_KEY : stryMutAct_9fa48("35586") ? false : stryMutAct_9fa48("35585") ? true : (stryCov_9fa48("35585", "35586", "35587"), configKey !== CDC_EPOCH_CONFIG_KEY)) {
        if (stryMutAct_9fa48("35588")) {
          {}
        } else {
          stryCov_9fa48("35588");
          return stryMutAct_9fa48("35589") ? {} : (stryCov_9fa48("35589"), {
            applied: stryMutAct_9fa48("35590") ? true : (stryCov_9fa48("35590"), false),
            error: stryMutAct_9fa48("35591") ? `` : (stryCov_9fa48("35591"), `${CDC_ERROR_MSG.NOT_EPOCH_CHANGE_PREFIX}'${configKey}'`)
          });
        }
      }

      // Check if epoch manager is set
      const epochManager = this.eventContext.epochManager;
      if (stryMutAct_9fa48("35594") ? false : stryMutAct_9fa48("35593") ? true : stryMutAct_9fa48("35592") ? epochManager : (stryCov_9fa48("35592", "35593", "35594"), !epochManager)) {
        if (stryMutAct_9fa48("35595")) {
          {}
        } else {
          stryCov_9fa48("35595");
          this.logger.warn(CDC_LOG_MSG.EPOCH_MANAGER_MISSING, stryMutAct_9fa48("35596") ? {} : (stryCov_9fa48("35596"), {
            nodeId: this.nodeId
          }));
          return stryMutAct_9fa48("35597") ? {} : (stryCov_9fa48("35597"), {
            applied: stryMutAct_9fa48("35598") ? true : (stryCov_9fa48("35598"), false),
            error: CDC_ERROR_MSG.EPOCH_MANAGER_NOT_SET
          });
        }
      }

      // Parse the epoch data from config_value
      let epochData;
      try {
        if (stryMutAct_9fa48("35599")) {
          {}
        } else {
          stryCov_9fa48("35599");
          const configValue = stryMutAct_9fa48("35600") ? cdcEvent.data[COLUMN.CONFIG_VALUE] : (stryCov_9fa48("35600"), cdcEvent.data?.[COLUMN.CONFIG_VALUE]);
          if (stryMutAct_9fa48("35603") ? typeof configValue !== TYPEOF.STRING : stryMutAct_9fa48("35602") ? false : stryMutAct_9fa48("35601") ? true : (stryCov_9fa48("35601", "35602", "35603"), typeof configValue === TYPEOF.STRING)) {
            if (stryMutAct_9fa48("35604")) {
              {}
            } else {
              stryCov_9fa48("35604");
              epochData = JSON.parse(configValue);
            }
          } else if (stryMutAct_9fa48("35607") ? typeof configValue === TYPEOF.OBJECT || configValue !== null : stryMutAct_9fa48("35606") ? false : stryMutAct_9fa48("35605") ? true : (stryCov_9fa48("35605", "35606", "35607"), (stryMutAct_9fa48("35609") ? typeof configValue !== TYPEOF.OBJECT : stryMutAct_9fa48("35608") ? true : (stryCov_9fa48("35608", "35609"), typeof configValue === TYPEOF.OBJECT)) && (stryMutAct_9fa48("35611") ? configValue === null : stryMutAct_9fa48("35610") ? true : (stryCov_9fa48("35610", "35611"), configValue !== null)))) {
            if (stryMutAct_9fa48("35612")) {
              {}
            } else {
              stryCov_9fa48("35612");
              epochData = configValue;
            }
          } else {
            if (stryMutAct_9fa48("35613")) {
              {}
            } else {
              stryCov_9fa48("35613");
              throw new Error(CDC_ERROR_MSG.EPOCH_DATA_INVALID);
            }
          }
        }
      } catch (parseError) {
        if (stryMutAct_9fa48("35614")) {
          {}
        } else {
          stryCov_9fa48("35614");
          this.logger.error(CDC_LOG_MSG.EPOCH_PARSE_FAILED, stryMutAct_9fa48("35615") ? {} : (stryCov_9fa48("35615"), {
            nodeId: this.nodeId,
            error: parseError.message
          }));
          return stryMutAct_9fa48("35616") ? {} : (stryCov_9fa48("35616"), {
            applied: stryMutAct_9fa48("35617") ? true : (stryCov_9fa48("35617"), false),
            error: stryMutAct_9fa48("35618") ? `` : (stryCov_9fa48("35618"), `${CDC_ERROR_MSG.PARSE_EPOCH_PREFIX}${parseError.message}`)
          });
        }
      }

      // Create AssignmentEpoch from the parsed data
      let epoch;
      try {
        if (stryMutAct_9fa48("35619")) {
          {}
        } else {
          stryCov_9fa48("35619");
          epoch = AssignmentEpoch.fromObject(epochData);
        }
      } catch (epochError) {
        if (stryMutAct_9fa48("35620")) {
          {}
        } else {
          stryCov_9fa48("35620");
          this.logger.error(CDC_LOG_MSG.EPOCH_CREATE_FAILED, stryMutAct_9fa48("35621") ? {} : (stryCov_9fa48("35621"), {
            nodeId: this.nodeId,
            error: epochError.message
          }));
          return stryMutAct_9fa48("35622") ? {} : (stryCov_9fa48("35622"), {
            applied: stryMutAct_9fa48("35623") ? true : (stryCov_9fa48("35623"), false),
            error: stryMutAct_9fa48("35624") ? `` : (stryCov_9fa48("35624"), `${CDC_ERROR_MSG.CREATE_EPOCH_PREFIX}${epochError.message}`)
          });
        }
      }

      // Apply the epoch to the epoch manager
      const applied = epochManager.applyEpoch(epoch);
      if (stryMutAct_9fa48("35626") ? false : stryMutAct_9fa48("35625") ? true : (stryCov_9fa48("35625", "35626"), applied)) {
        if (stryMutAct_9fa48("35627")) {
          {}
        } else {
          stryCov_9fa48("35627");
          this.eventContext.incrementEpochChanges();
          this.logger.info(CDC_LOG_MSG.EPOCH_APPLIED, stryMutAct_9fa48("35628") ? {} : (stryCov_9fa48("35628"), {
            nodeId: this.nodeId,
            epoch: epoch.epoch,
            proposedBy: epoch.proposedBy
          }));

          // Emit epochChange event
          this.eventContext.emit(CDC_EVENT.EPOCH_CHANGE, stryMutAct_9fa48("35629") ? {} : (stryCov_9fa48("35629"), {
            epoch: epoch.epoch,
            assignments: epoch.assignments,
            timestamp: epoch.timestamp,
            proposedBy: epoch.proposedBy,
            source: CDC_SOURCE.CDC
          }));
        }
      } else {
        if (stryMutAct_9fa48("35630")) {
          {}
        } else {
          stryCov_9fa48("35630");
          this.logger.debug(CDC_LOG_MSG.EPOCH_SKIPPED, stryMutAct_9fa48("35631") ? {} : (stryCov_9fa48("35631"), {
            nodeId: this.nodeId,
            incomingEpoch: epoch.epoch
          }));
        }
      }
      try {
        if (stryMutAct_9fa48("35632")) {
          {}
        } else {
          stryCov_9fa48("35632");
          const handlerDurationMs = stryMutAct_9fa48("35633") ? Date.now() + handlerStartMs : (stryCov_9fa48("35633"), Date.now() - handlerStartMs);
          const metricsData = stryMutAct_9fa48("35634") ? {} : (stryCov_9fa48("35634"), {
            tableName: cdcEvent.tableName,
            operation: cdcEvent.operation,
            handlerDurationMs
          });
          if (stryMutAct_9fa48("35637") ? cdcEvent.timestamp == null : stryMutAct_9fa48("35636") ? false : stryMutAct_9fa48("35635") ? true : (stryCov_9fa48("35635", "35636", "35637"), cdcEvent.timestamp != null)) {
            if (stryMutAct_9fa48("35638")) {
              {}
            } else {
              stryCov_9fa48("35638");
              metricsData.eventAgeMs = stryMutAct_9fa48("35639") ? Date.now() + cdcEvent.timestamp : (stryCov_9fa48("35639"), Date.now() - cdcEvent.timestamp);
            }
          }
          this.logger.info(METRICS_LOG_TAG.CDC_PROPAGATION, metricsData);
        }
      } catch (metricsErr) {
        if (stryMutAct_9fa48("35640")) {
          {}
        } else {
          stryCov_9fa48("35640");
          this.logger.debug(CDC_LOG_MSG.METRICS_LOG_FAILED, stryMutAct_9fa48("35641") ? {} : (stryCov_9fa48("35641"), {
            error: metricsErr.message
          }));
        }
      }
      if (stryMutAct_9fa48("35643") ? false : stryMutAct_9fa48("35642") ? true : (stryCov_9fa48("35642", "35643"), applied)) {
        if (stryMutAct_9fa48("35644")) {
          {}
        } else {
          stryCov_9fa48("35644");
          return stryMutAct_9fa48("35645") ? {} : (stryCov_9fa48("35645"), {
            applied: stryMutAct_9fa48("35646") ? false : (stryCov_9fa48("35646"), true),
            epoch: epoch.epoch
          });
        }
      }
      return stryMutAct_9fa48("35647") ? {} : (stryCov_9fa48("35647"), {
        applied: stryMutAct_9fa48("35648") ? true : (stryCov_9fa48("35648"), false),
        error: CDC_ERROR_MSG.EPOCH_NOT_APPLIED,
        epoch: epoch.epoch
      });
    }
  }

  /**
   * Handle node state change CDC event.
   * Listens for node state changes in the nodes table and triggers
   * the rebalancer when appropriate.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be nodes).
   * @param {string} cdcEvent.operation - The operation type (INSERT, UPDATE).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.node_id - The node ID.
   * @param {string} cdcEvent.data.status - The node status/state.
   * @return {{processed: boolean, nodeId?: string, oldState?: string,
   *   newState?: string, error?: string}}
   *   Result object indicating if the event was processed.
   */
  handleNodeStateCDC(cdcEvent) {
    if (stryMutAct_9fa48("35649")) {
      {}
    } else {
      stryCov_9fa48("35649");
      const handlerStartMs = Date.now();

      // Validate cdcEvent
      if (stryMutAct_9fa48("35652") ? !cdcEvent && typeof cdcEvent !== TYPEOF.OBJECT : stryMutAct_9fa48("35651") ? false : stryMutAct_9fa48("35650") ? true : (stryCov_9fa48("35650", "35651", "35652"), (stryMutAct_9fa48("35653") ? cdcEvent : (stryCov_9fa48("35653"), !cdcEvent)) || (stryMutAct_9fa48("35655") ? typeof cdcEvent === TYPEOF.OBJECT : stryMutAct_9fa48("35654") ? false : (stryCov_9fa48("35654", "35655"), typeof cdcEvent !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("35656")) {
          {}
        } else {
          stryCov_9fa48("35656");
          return stryMutAct_9fa48("35657") ? {} : (stryCov_9fa48("35657"), {
            processed: stryMutAct_9fa48("35658") ? true : (stryCov_9fa48("35658"), false),
            error: CDC_ERROR_MSG.INVALID_EVENT
          });
        }
      }

      // Check if this is a nodes table event
      const tableName = cdcEvent.tableName;
      if (stryMutAct_9fa48("35661") ? tableName === SYSTEM_TABLE_NAME.NODES : stryMutAct_9fa48("35660") ? false : stryMutAct_9fa48("35659") ? true : (stryCov_9fa48("35659", "35660", "35661"), tableName !== SYSTEM_TABLE_NAME.NODES)) {
        if (stryMutAct_9fa48("35662")) {
          {}
        } else {
          stryCov_9fa48("35662");
          return stryMutAct_9fa48("35663") ? {} : (stryCov_9fa48("35663"), {
            processed: stryMutAct_9fa48("35664") ? true : (stryCov_9fa48("35664"), false),
            error: stryMutAct_9fa48("35665") ? `` : (stryCov_9fa48("35665"), `${CDC_ERROR_MSG.NOT_NODES_TABLE_PREFIX}'${tableName}'`)
          });
        }
      }

      // Extract node data
      const nodeId = stryMutAct_9fa48("35666") ? cdcEvent.data[COLUMN.NODE_ID] : (stryCov_9fa48("35666"), cdcEvent.data?.[COLUMN.NODE_ID]);
      const newState = stryMutAct_9fa48("35667") ? cdcEvent.data[COLUMN.STATUS] : (stryCov_9fa48("35667"), cdcEvent.data?.[COLUMN.STATUS]);
      if (stryMutAct_9fa48("35670") ? false : stryMutAct_9fa48("35669") ? true : stryMutAct_9fa48("35668") ? nodeId : (stryCov_9fa48("35668", "35669", "35670"), !nodeId)) {
        if (stryMutAct_9fa48("35671")) {
          {}
        } else {
          stryCov_9fa48("35671");
          return stryMutAct_9fa48("35672") ? {} : (stryCov_9fa48("35672"), {
            processed: stryMutAct_9fa48("35673") ? true : (stryCov_9fa48("35673"), false),
            error: CDC_ERROR_MSG.NODE_ID_MISSING
          });
        }
      }
      if (stryMutAct_9fa48("35676") ? false : stryMutAct_9fa48("35675") ? true : stryMutAct_9fa48("35674") ? newState : (stryCov_9fa48("35674", "35675", "35676"), !newState)) {
        if (stryMutAct_9fa48("35677")) {
          {}
        } else {
          stryCov_9fa48("35677");
          return stryMutAct_9fa48("35678") ? {} : (stryCov_9fa48("35678"), {
            processed: stryMutAct_9fa48("35679") ? true : (stryCov_9fa48("35679"), false),
            error: CDC_ERROR_MSG.NODE_STATUS_MISSING
          });
        }
      }

      // Get the previous state for this node.
      const oldState = stryMutAct_9fa48("35682") ? this._nodeStates.get(nodeId) && null : stryMutAct_9fa48("35681") ? false : stryMutAct_9fa48("35680") ? true : (stryCov_9fa48("35680", "35681", "35682"), this._nodeStates.get(nodeId) || null);

      // Ignore stale/out-of-order node state events when a monotonic
      // timestamp is present in CDC payload.
      const eventTimestamp = this.getNodeStateEventTimestamp(cdcEvent);
      if (stryMutAct_9fa48("35684") ? false : stryMutAct_9fa48("35683") ? true : (stryCov_9fa48("35683", "35684"), Number.isFinite(eventTimestamp))) {
        if (stryMutAct_9fa48("35685")) {
          {}
        } else {
          stryCov_9fa48("35685");
          const lastTimestamp = this._nodeStateEventTimestamps.get(nodeId);
          if (stryMutAct_9fa48("35688") ? Number.isFinite(lastTimestamp) || eventTimestamp < lastTimestamp : stryMutAct_9fa48("35687") ? false : stryMutAct_9fa48("35686") ? true : (stryCov_9fa48("35686", "35687", "35688"), Number.isFinite(lastTimestamp) && (stryMutAct_9fa48("35691") ? eventTimestamp >= lastTimestamp : stryMutAct_9fa48("35690") ? eventTimestamp <= lastTimestamp : stryMutAct_9fa48("35689") ? true : (stryCov_9fa48("35689", "35690", "35691"), eventTimestamp < lastTimestamp)))) {
            if (stryMutAct_9fa48("35692")) {
              {}
            } else {
              stryCov_9fa48("35692");
              this.logger.debug(CDC_LOG_MSG.NODE_STATE_UNCHANGED, stryMutAct_9fa48("35693") ? {} : (stryCov_9fa48("35693"), {
                nodeId,
                state: oldState,
                staleEventIgnored: stryMutAct_9fa48("35694") ? false : (stryCov_9fa48("35694"), true),
                eventTimestamp,
                lastTimestamp
              }));
              return buildNodeStateCDCResult(stryMutAct_9fa48("35695") ? {} : (stryCov_9fa48("35695"), {
                processed: stryMutAct_9fa48("35696") ? false : (stryCov_9fa48("35696"), true),
                nodeId,
                oldState,
                newState: oldState,
                stateChanged: stryMutAct_9fa48("35697") ? true : (stryCov_9fa48("35697"), false),
                staleEventIgnored: stryMutAct_9fa48("35698") ? false : (stryCov_9fa48("35698"), true),
                eventTimestamp,
                lastTimestamp
              }));
            }
          }
          this._nodeStateEventTimestamps.set(nodeId, eventTimestamp);
        }
      }

      // Update tracked state
      this._nodeStates.set(nodeId, newState);

      // Check if state actually changed
      if (stryMutAct_9fa48("35701") ? oldState !== newState : stryMutAct_9fa48("35700") ? false : stryMutAct_9fa48("35699") ? true : (stryCov_9fa48("35699", "35700", "35701"), oldState === newState)) {
        if (stryMutAct_9fa48("35702")) {
          {}
        } else {
          stryCov_9fa48("35702");
          this.logger.debug(CDC_LOG_MSG.NODE_STATE_UNCHANGED, stryMutAct_9fa48("35703") ? {} : (stryCov_9fa48("35703"), {
            nodeId,
            state: newState
          }));
          return buildNodeStateCDCResult(stryMutAct_9fa48("35704") ? {} : (stryCov_9fa48("35704"), {
            processed: stryMutAct_9fa48("35705") ? false : (stryCov_9fa48("35705"), true),
            nodeId,
            oldState,
            newState,
            stateChanged: stryMutAct_9fa48("35706") ? true : (stryCov_9fa48("35706"), false)
          }));
        }
      }

      // Increment stats
      this.eventContext.incrementNodeStateChanges();
      this.logger.info(CDC_LOG_MSG.NODE_STATE_DETECTED, stryMutAct_9fa48("35707") ? {} : (stryCov_9fa48("35707"), {
        nodeId,
        oldState,
        newState
      }));

      // Emit nodeStateChange event
      this.eventContext.emit(CDC_EVENT.NODE_STATE_CHANGE, stryMutAct_9fa48("35708") ? {} : (stryCov_9fa48("35708"), {
        nodeId,
        oldState,
        newState,
        timestamp: Date.now(),
        source: CDC_SOURCE.CDC
      }));

      // Trigger rebalancer if set
      const rebalancer = this.eventContext.rebalancer;
      if (stryMutAct_9fa48("35710") ? false : stryMutAct_9fa48("35709") ? true : (stryCov_9fa48("35709", "35710"), rebalancer)) {
        if (stryMutAct_9fa48("35711")) {
          {}
        } else {
          stryCov_9fa48("35711");
          try {
            if (stryMutAct_9fa48("35712")) {
              {}
            } else {
              stryCov_9fa48("35712");
              rebalancer.onNodeStateChange(nodeId, oldState, newState);
              this.logger.debug(CDC_LOG_MSG.REBALANCER_NOTIFIED, stryMutAct_9fa48("35713") ? {} : (stryCov_9fa48("35713"), {
                nodeId,
                oldState,
                newState
              }));
            }
          } catch (rebalancerError) {
            if (stryMutAct_9fa48("35714")) {
              {}
            } else {
              stryCov_9fa48("35714");
              this.logger.error(CDC_LOG_MSG.REBALANCER_NOTIFY_FAILED, stryMutAct_9fa48("35715") ? {} : (stryCov_9fa48("35715"), {
                nodeId,
                oldState,
                newState,
                error: rebalancerError.message
              }));
              throw rebalancerError;
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("35716")) {
          {}
        } else {
          stryCov_9fa48("35716");
          this.logger.debug(CDC_LOG_MSG.REBALANCER_NOT_SET, stryMutAct_9fa48("35717") ? {} : (stryCov_9fa48("35717"), {
            nodeId
          }));
        }
      }
      try {
        if (stryMutAct_9fa48("35718")) {
          {}
        } else {
          stryCov_9fa48("35718");
          const handlerDurationMs = stryMutAct_9fa48("35719") ? Date.now() + handlerStartMs : (stryCov_9fa48("35719"), Date.now() - handlerStartMs);
          const metricsData = stryMutAct_9fa48("35720") ? {} : (stryCov_9fa48("35720"), {
            tableName: cdcEvent.tableName,
            operation: cdcEvent.operation,
            handlerDurationMs
          });
          if (stryMutAct_9fa48("35723") ? cdcEvent.timestamp == null : stryMutAct_9fa48("35722") ? false : stryMutAct_9fa48("35721") ? true : (stryCov_9fa48("35721", "35722", "35723"), cdcEvent.timestamp != null)) {
            if (stryMutAct_9fa48("35724")) {
              {}
            } else {
              stryCov_9fa48("35724");
              metricsData.eventAgeMs = stryMutAct_9fa48("35725") ? Date.now() + cdcEvent.timestamp : (stryCov_9fa48("35725"), Date.now() - cdcEvent.timestamp);
            }
          }
          this.logger.info(METRICS_LOG_TAG.CDC_PROPAGATION, metricsData);
        }
      } catch (metricsErr) {
        if (stryMutAct_9fa48("35726")) {
          {}
        } else {
          stryCov_9fa48("35726");
          this.logger.debug(CDC_LOG_MSG.METRICS_LOG_FAILED, stryMutAct_9fa48("35727") ? {} : (stryCov_9fa48("35727"), {
            error: metricsErr.message
          }));
        }
      }
      return buildNodeStateCDCResult(stryMutAct_9fa48("35728") ? {} : (stryCov_9fa48("35728"), {
        processed: stryMutAct_9fa48("35729") ? false : (stryCov_9fa48("35729"), true),
        nodeId,
        oldState,
        newState,
        stateChanged: stryMutAct_9fa48("35730") ? false : (stryCov_9fa48("35730"), true)
      }));
    }
  }

  /**
   * Handle node joined CDC event for mesh connectivity.
   * When a new node is added to the nodes table, this method establishes
   * an outbound WebSocket connection to that node, ensuring full mesh
   * connectivity across the cluster.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be nodes).
   * @param {string} cdcEvent.operation - The operation type (INSERT).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.node_id - The node ID.
   * @param {string} cdcEvent.data.node_address - The node address.
   * @return {Promise<{processed: boolean, nodeId?: string, connected?: boolean,
   *   error?: string}>} Result object indicating if connection was established.
   */
  async handleNodeJoinedCDC(cdcEvent) {
    if (stryMutAct_9fa48("35731")) {
      {}
    } else {
      stryCov_9fa48("35731");
      // Validate cdcEvent
      if (stryMutAct_9fa48("35734") ? !cdcEvent && typeof cdcEvent !== TYPEOF.OBJECT : stryMutAct_9fa48("35733") ? false : stryMutAct_9fa48("35732") ? true : (stryCov_9fa48("35732", "35733", "35734"), (stryMutAct_9fa48("35735") ? cdcEvent : (stryCov_9fa48("35735"), !cdcEvent)) || (stryMutAct_9fa48("35737") ? typeof cdcEvent === TYPEOF.OBJECT : stryMutAct_9fa48("35736") ? false : (stryCov_9fa48("35736", "35737"), typeof cdcEvent !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("35738")) {
          {}
        } else {
          stryCov_9fa48("35738");
          return stryMutAct_9fa48("35739") ? {} : (stryCov_9fa48("35739"), {
            processed: stryMutAct_9fa48("35740") ? true : (stryCov_9fa48("35740"), false),
            error: CDC_ERROR_MSG.INVALID_EVENT
          });
        }
      }

      // Check if this is a nodes table INSERT event
      const tableName = cdcEvent.tableName;
      if (stryMutAct_9fa48("35743") ? tableName === SYSTEM_TABLE_NAME.NODES : stryMutAct_9fa48("35742") ? false : stryMutAct_9fa48("35741") ? true : (stryCov_9fa48("35741", "35742", "35743"), tableName !== SYSTEM_TABLE_NAME.NODES)) {
        if (stryMutAct_9fa48("35744")) {
          {}
        } else {
          stryCov_9fa48("35744");
          return stryMutAct_9fa48("35745") ? {} : (stryCov_9fa48("35745"), {
            processed: stryMutAct_9fa48("35746") ? true : (stryCov_9fa48("35746"), false),
            error: stryMutAct_9fa48("35747") ? `` : (stryCov_9fa48("35747"), `${CDC_ERROR_MSG.NOT_NODES_TABLE_PREFIX}'${tableName}'`)
          });
        }
      }

      // Only process INSERT operations (new nodes joining)
      const operation = cdcEvent.operation;
      if (stryMutAct_9fa48("35750") ? operation === CDC_OPERATION.INSERT : stryMutAct_9fa48("35749") ? false : stryMutAct_9fa48("35748") ? true : (stryCov_9fa48("35748", "35749", "35750"), operation !== CDC_OPERATION.INSERT)) {
        if (stryMutAct_9fa48("35751")) {
          {}
        } else {
          stryCov_9fa48("35751");
          return stryMutAct_9fa48("35752") ? {} : (stryCov_9fa48("35752"), {
            processed: stryMutAct_9fa48("35753") ? true : (stryCov_9fa48("35753"), false),
            error: CDC_ERROR_MSG.NOT_INSERT_OPERATION
          });
        }
      }

      // Extract node data
      const targetNodeId = stryMutAct_9fa48("35754") ? cdcEvent.data[COLUMN.NODE_ID] : (stryCov_9fa48("35754"), cdcEvent.data?.[COLUMN.NODE_ID]);
      const nodeAddress = stryMutAct_9fa48("35755") ? cdcEvent.data[COLUMN.NODE_ADDRESS] : (stryCov_9fa48("35755"), cdcEvent.data?.[COLUMN.NODE_ADDRESS]);
      if (stryMutAct_9fa48("35758") ? false : stryMutAct_9fa48("35757") ? true : stryMutAct_9fa48("35756") ? targetNodeId : (stryCov_9fa48("35756", "35757", "35758"), !targetNodeId)) {
        if (stryMutAct_9fa48("35759")) {
          {}
        } else {
          stryCov_9fa48("35759");
          return stryMutAct_9fa48("35760") ? {} : (stryCov_9fa48("35760"), {
            processed: stryMutAct_9fa48("35761") ? true : (stryCov_9fa48("35761"), false),
            error: CDC_ERROR_MSG.NODE_ID_MISSING
          });
        }
      }

      // Skip if this is our own node
      if (stryMutAct_9fa48("35764") ? targetNodeId !== this.nodeId : stryMutAct_9fa48("35763") ? false : stryMutAct_9fa48("35762") ? true : (stryCov_9fa48("35762", "35763", "35764"), targetNodeId === this.nodeId)) {
        if (stryMutAct_9fa48("35765")) {
          {}
        } else {
          stryCov_9fa48("35765");
          this.logger.debug(CDC_LOG_MSG.NEW_NODE_SKIP_SELF, stryMutAct_9fa48("35766") ? {} : (stryCov_9fa48("35766"), {
            nodeId: this.nodeId,
            targetNodeId
          }));
          return buildNodeJoinedCDCResult(stryMutAct_9fa48("35767") ? {} : (stryCov_9fa48("35767"), {
            processed: stryMutAct_9fa48("35768") ? false : (stryCov_9fa48("35768"), true),
            nodeId: targetNodeId,
            connected: stryMutAct_9fa48("35769") ? true : (stryCov_9fa48("35769"), false),
            skipped: stryMutAct_9fa48("35770") ? false : (stryCov_9fa48("35770"), true),
            reason: CDC_SKIP_REASON.SELF
          }));
        }
      }

      // Skip if no message router is set
      const messageRouter = this.eventContext.messageRouter;
      if (stryMutAct_9fa48("35773") ? false : stryMutAct_9fa48("35772") ? true : stryMutAct_9fa48("35771") ? messageRouter : (stryCov_9fa48("35771", "35772", "35773"), !messageRouter)) {
        if (stryMutAct_9fa48("35774")) {
          {}
        } else {
          stryCov_9fa48("35774");
          return stryMutAct_9fa48("35775") ? {} : (stryCov_9fa48("35775"), {
            processed: stryMutAct_9fa48("35776") ? true : (stryCov_9fa48("35776"), false),
            error: CDC_ERROR_MSG.MESSAGE_ROUTER_NOT_SET
          });
        }
      }
      const connectionState = this.resolveRouterConnectionState(messageRouter, targetNodeId);
      if (stryMutAct_9fa48("35779") ? connectionState !== STATE.CONNECTED : stryMutAct_9fa48("35778") ? false : stryMutAct_9fa48("35777") ? true : (stryCov_9fa48("35777", "35778", "35779"), connectionState === STATE.CONNECTED)) {
        if (stryMutAct_9fa48("35780")) {
          {}
        } else {
          stryCov_9fa48("35780");
          this.logger.debug(CDC_LOG_MSG.NEW_NODE_SKIP_CONNECTED, stryMutAct_9fa48("35781") ? {} : (stryCov_9fa48("35781"), {
            nodeId: this.nodeId,
            targetNodeId
          }));
          return buildNodeJoinedCDCResult(stryMutAct_9fa48("35782") ? {} : (stryCov_9fa48("35782"), {
            processed: stryMutAct_9fa48("35783") ? false : (stryCov_9fa48("35783"), true),
            nodeId: targetNodeId,
            connected: stryMutAct_9fa48("35784") ? true : (stryCov_9fa48("35784"), false),
            skipped: stryMutAct_9fa48("35785") ? false : (stryCov_9fa48("35785"), true),
            reason: CDC_SKIP_REASON.ALREADY_CONNECTED
          }));
        }
      }
      const wsAddressResolution = (stryMutAct_9fa48("35788") ? typeof this.eventContext.resolveNodeWebSocketAddress !== TYPEOF.FUNCTION : stryMutAct_9fa48("35787") ? false : stryMutAct_9fa48("35786") ? true : (stryCov_9fa48("35786", "35787", "35788"), typeof this.eventContext.resolveNodeWebSocketAddress === TYPEOF.FUNCTION)) ? this.eventContext.resolveNodeWebSocketAddress(targetNodeId) : resolveNodeWebSocketAddress(stryMutAct_9fa48("35789") ? {} : (stryCov_9fa48("35789"), {
        targetNodeId,
        systemTableCache: stryMutAct_9fa48("35792") ? this.eventContext?._service?.systemTableCache && null : stryMutAct_9fa48("35791") ? false : stryMutAct_9fa48("35790") ? true : (stryCov_9fa48("35790", "35791", "35792"), (stryMutAct_9fa48("35794") ? this.eventContext._service?.systemTableCache : stryMutAct_9fa48("35793") ? this.eventContext?._service.systemTableCache : (stryCov_9fa48("35793", "35794"), this.eventContext?._service?.systemTableCache)) || null)
      }));
      if (stryMutAct_9fa48("35797") ? wsAddressResolution.state === NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED : stryMutAct_9fa48("35796") ? false : stryMutAct_9fa48("35795") ? true : (stryCov_9fa48("35795", "35796", "35797"), wsAddressResolution.state !== NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED)) {
        if (stryMutAct_9fa48("35798")) {
          {}
        } else {
          stryCov_9fa48("35798");
          this.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, stryMutAct_9fa48("35799") ? {} : (stryCov_9fa48("35799"), {
            nodeId: this.nodeId,
            targetNodeId,
            nodeAddress,
            error: CDC_EVENT_HANDLER_ERROR.MISSING_CANONICAL_NODE_ENDPOINTS_WEBSOCKET_ADDRESS
          }));
          return buildNodeJoinedCDCResult(stryMutAct_9fa48("35800") ? {} : (stryCov_9fa48("35800"), {
            processed: stryMutAct_9fa48("35801") ? true : (stryCov_9fa48("35801"), false),
            nodeId: targetNodeId,
            error: CDC_EVENT_HANDLER_ERROR.MISSING_CANONICAL_NODE_ENDPOINTS_WEBSOCKET_ADDRESS
          }));
        }
      }
      const wsAddress = wsAddressResolution.address;
      this.logger.info(CDC_LOG_MSG.NEW_NODE_DETECTED, stryMutAct_9fa48("35802") ? {} : (stryCov_9fa48("35802"), {
        nodeId: this.nodeId,
        targetNodeId,
        wsAddress
      }));

      // Establish connection to the new node
      try {
        if (stryMutAct_9fa48("35803")) {
          {}
        } else {
          stryCov_9fa48("35803");
          await messageRouter.connectToNode(targetNodeId, wsAddress);
          this.logger.info(CDC_LOG_MSG.NEW_NODE_CONNECTED, stryMutAct_9fa48("35804") ? {} : (stryCov_9fa48("35804"), {
            nodeId: this.nodeId,
            targetNodeId,
            wsAddress
          }));

          // Emit nodeJoined event
          this.eventContext.emit(CDC_EVENT.NODE_JOINED, stryMutAct_9fa48("35805") ? {} : (stryCov_9fa48("35805"), {
            nodeId: targetNodeId,
            nodeAddress,
            wsAddress,
            timestamp: Date.now(),
            source: CDC_SOURCE.CDC
          }));
          return buildNodeJoinedCDCResult(stryMutAct_9fa48("35806") ? {} : (stryCov_9fa48("35806"), {
            processed: stryMutAct_9fa48("35807") ? false : (stryCov_9fa48("35807"), true),
            nodeId: targetNodeId,
            connected: stryMutAct_9fa48("35808") ? false : (stryCov_9fa48("35808"), true),
            wsAddress
          }));
        }
      } catch (connectError) {
        if (stryMutAct_9fa48("35809")) {
          {}
        } else {
          stryCov_9fa48("35809");
          // Log but don't fail - the node might be temporarily unavailable
          // Raft will handle retries and leader election
          this.logger.warn(CDC_LOG_MSG.NEW_NODE_CONNECT_FAILED, stryMutAct_9fa48("35810") ? {} : (stryCov_9fa48("35810"), {
            nodeId: this.nodeId,
            targetNodeId,
            wsAddress,
            error: connectError.message
          }));
          return buildNodeJoinedCDCResult(stryMutAct_9fa48("35811") ? {} : (stryCov_9fa48("35811"), {
            processed: stryMutAct_9fa48("35812") ? true : (stryCov_9fa48("35812"), false),
            nodeId: targetNodeId,
            error: connectError.message
          }));
        }
      }
    }
  }

  /**
   * Resolve connection state for one node from message router.
   * @param {Object} messageRouter - Message router instance.
   * @param {string} targetNodeId - Remote node ID.
   * @return {string|null} Connection state or null when unavailable.
   * @private
   */
  resolveRouterConnectionState(messageRouter, targetNodeId) {
    if (stryMutAct_9fa48("35813")) {
      {}
    } else {
      stryCov_9fa48("35813");
      if (stryMutAct_9fa48("35816") ? !messageRouter && !targetNodeId : stryMutAct_9fa48("35815") ? false : stryMutAct_9fa48("35814") ? true : (stryCov_9fa48("35814", "35815", "35816"), (stryMutAct_9fa48("35817") ? messageRouter : (stryCov_9fa48("35817"), !messageRouter)) || (stryMutAct_9fa48("35818") ? targetNodeId : (stryCov_9fa48("35818"), !targetNodeId)))) {
        if (stryMutAct_9fa48("35819")) {
          {}
        } else {
          stryCov_9fa48("35819");
          return null;
        }
      }
      if (stryMutAct_9fa48("35822") ? typeof messageRouter.getConnectionState !== TYPEOF.FUNCTION : stryMutAct_9fa48("35821") ? false : stryMutAct_9fa48("35820") ? true : (stryCov_9fa48("35820", "35821", "35822"), typeof messageRouter.getConnectionState === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("35823")) {
          {}
        } else {
          stryCov_9fa48("35823");
          return messageRouter.getConnectionState(targetNodeId);
        }
      }
      const connectionEntry = stryMutAct_9fa48("35824") ? messageRouter.nodeConnections.get(targetNodeId) : (stryCov_9fa48("35824"), messageRouter.nodeConnections?.get(targetNodeId));
      if (stryMutAct_9fa48("35827") ? typeof connectionEntry !== TYPEOF.STRING : stryMutAct_9fa48("35826") ? false : stryMutAct_9fa48("35825") ? true : (stryCov_9fa48("35825", "35826", "35827"), typeof connectionEntry === TYPEOF.STRING)) {
        if (stryMutAct_9fa48("35828")) {
          {}
        } else {
          stryCov_9fa48("35828");
          return connectionEntry;
        }
      }
      if (stryMutAct_9fa48("35831") ? connectionEntry !== true : stryMutAct_9fa48("35830") ? false : stryMutAct_9fa48("35829") ? true : (stryCov_9fa48("35829", "35830", "35831"), connectionEntry === (stryMutAct_9fa48("35832") ? false : (stryCov_9fa48("35832"), true)))) {
        if (stryMutAct_9fa48("35833")) {
          {}
        } else {
          stryCov_9fa48("35833");
          return STATE.CONNECTED;
        }
      }
      if (stryMutAct_9fa48("35836") ? connectionEntry || typeof connectionEntry === TYPEOF.OBJECT : stryMutAct_9fa48("35835") ? false : stryMutAct_9fa48("35834") ? true : (stryCov_9fa48("35834", "35835", "35836"), connectionEntry && (stryMutAct_9fa48("35838") ? typeof connectionEntry !== TYPEOF.OBJECT : stryMutAct_9fa48("35837") ? true : (stryCov_9fa48("35837", "35838"), typeof connectionEntry === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("35839")) {
          {}
        } else {
          stryCov_9fa48("35839");
          const state = connectionEntry.state;
          if (stryMutAct_9fa48("35842") ? typeof state !== TYPEOF.STRING : stryMutAct_9fa48("35841") ? false : stryMutAct_9fa48("35840") ? true : (stryCov_9fa48("35840", "35841", "35842"), typeof state === TYPEOF.STRING)) {
            if (stryMutAct_9fa48("35843")) {
              {}
            } else {
              stryCov_9fa48("35843");
              return state;
            }
          }
        }
      }
      return null;
    }
  }

  /**
   * Derive WebSocket address from node REST address.
   * @param {string} nodeAddress - Node address in format "hostname:port".
   * @return {string|null} WebSocket address or null if cannot derive.
   */
  deriveWsAddressFromNodeAddress(nodeAddress) {
    if (stryMutAct_9fa48("35844")) {
      {}
    } else {
      stryCov_9fa48("35844");
      if (stryMutAct_9fa48("35847") ? !nodeAddress && typeof nodeAddress !== TYPEOF.STRING : stryMutAct_9fa48("35846") ? false : stryMutAct_9fa48("35845") ? true : (stryCov_9fa48("35845", "35846", "35847"), (stryMutAct_9fa48("35848") ? nodeAddress : (stryCov_9fa48("35848"), !nodeAddress)) || (stryMutAct_9fa48("35850") ? typeof nodeAddress === TYPEOF.STRING : stryMutAct_9fa48("35849") ? false : (stryCov_9fa48("35849", "35850"), typeof nodeAddress !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("35851")) {
          {}
        } else {
          stryCov_9fa48("35851");
          return null;
        }
      }

      // Parse hostname:port format
      const colonIndex = nodeAddress.lastIndexOf(ADDRESS.PORT_SEPARATOR);
      if (stryMutAct_9fa48("35854") ? colonIndex === NUM.NEGATIVE_ONE && colonIndex === NUM.ZERO : stryMutAct_9fa48("35853") ? false : stryMutAct_9fa48("35852") ? true : (stryCov_9fa48("35852", "35853", "35854"), (stryMutAct_9fa48("35856") ? colonIndex !== NUM.NEGATIVE_ONE : stryMutAct_9fa48("35855") ? false : (stryCov_9fa48("35855", "35856"), colonIndex === NUM.NEGATIVE_ONE)) || (stryMutAct_9fa48("35858") ? colonIndex !== NUM.ZERO : stryMutAct_9fa48("35857") ? false : (stryCov_9fa48("35857", "35858"), colonIndex === NUM.ZERO)))) {
        if (stryMutAct_9fa48("35859")) {
          {}
        } else {
          stryCov_9fa48("35859");
          // No colon found or colon at start (empty hostname)
          return null;
        }
      }
      const hostname = stryMutAct_9fa48("35860") ? nodeAddress : (stryCov_9fa48("35860"), nodeAddress.substring(NUM.ZERO, colonIndex));
      if (stryMutAct_9fa48("35863") ? !hostname && hostname.length === NUM.ZERO : stryMutAct_9fa48("35862") ? false : stryMutAct_9fa48("35861") ? true : (stryCov_9fa48("35861", "35862", "35863"), (stryMutAct_9fa48("35864") ? hostname : (stryCov_9fa48("35864"), !hostname)) || (stryMutAct_9fa48("35866") ? hostname.length !== NUM.ZERO : stryMutAct_9fa48("35865") ? false : (stryCov_9fa48("35865", "35866"), hostname.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("35867")) {
          {}
        } else {
          stryCov_9fa48("35867");
          return null;
        }
      }
      const portStr = stryMutAct_9fa48("35868") ? nodeAddress : (stryCov_9fa48("35868"), nodeAddress.substring(stryMutAct_9fa48("35869") ? colonIndex - NUM.ONE : (stryCov_9fa48("35869"), colonIndex + NUM.ONE)));
      const restPort = parseInt(portStr, NUM.TEN);
      if (stryMutAct_9fa48("35872") ? !Number.isFinite(restPort) && restPort <= NUM.ZERO : stryMutAct_9fa48("35871") ? false : stryMutAct_9fa48("35870") ? true : (stryCov_9fa48("35870", "35871", "35872"), (stryMutAct_9fa48("35873") ? Number.isFinite(restPort) : (stryCov_9fa48("35873"), !Number.isFinite(restPort))) || (stryMutAct_9fa48("35876") ? restPort > NUM.ZERO : stryMutAct_9fa48("35875") ? restPort < NUM.ZERO : stryMutAct_9fa48("35874") ? false : (stryCov_9fa48("35874", "35875", "35876"), restPort <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("35877")) {
          {}
        } else {
          stryCov_9fa48("35877");
          return null;
        }
      }

      // WebSocket port = REST port + WS_PORT_OFFSET
      const wsPort = stryMutAct_9fa48("35878") ? restPort - ENTRYPOINT_DEFAULT.WS_PORT_OFFSET : (stryCov_9fa48("35878"), restPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET);
      return stryMutAct_9fa48("35879") ? `` : (stryCov_9fa48("35879"), `${PROTOCOL.WS}${hostname}${ADDRESS.PORT_SEPARATOR}${wsPort}`);
    }
  }

  /**
   * Get the tracked node states map.
   * @return {Map<string, string>} Map of node ID to state.
   */
  getNodeStates() {
    if (stryMutAct_9fa48("35880")) {
      {}
    } else {
      stryCov_9fa48("35880");
      return this._nodeStates;
    }
  }

  /**
   * Extract comparable timestamp from a node-state CDC event.
   * Prefers updated_at, then last_heartbeat, then created_at.
   * @param {Object} cdcEvent - CDC event payload.
   * @return {number|null} Comparable timestamp or null when unavailable.
   * @private
   */
  getNodeStateEventTimestamp(cdcEvent) {
    if (stryMutAct_9fa48("35881")) {
      {}
    } else {
      stryCov_9fa48("35881");
      const candidates = stryMutAct_9fa48("35882") ? [] : (stryCov_9fa48("35882"), [stryMutAct_9fa48("35884") ? cdcEvent.data?.[COLUMN.UPDATED_AT] : stryMutAct_9fa48("35883") ? cdcEvent?.data[COLUMN.UPDATED_AT] : (stryCov_9fa48("35883", "35884"), cdcEvent?.data?.[COLUMN.UPDATED_AT]), stryMutAct_9fa48("35886") ? cdcEvent.data?.[COLUMN.LAST_HEARTBEAT] : stryMutAct_9fa48("35885") ? cdcEvent?.data[COLUMN.LAST_HEARTBEAT] : (stryCov_9fa48("35885", "35886"), cdcEvent?.data?.[COLUMN.LAST_HEARTBEAT]), stryMutAct_9fa48("35888") ? cdcEvent.data?.[COLUMN.CREATED_AT] : stryMutAct_9fa48("35887") ? cdcEvent?.data[COLUMN.CREATED_AT] : (stryCov_9fa48("35887", "35888"), cdcEvent?.data?.[COLUMN.CREATED_AT])]);
      for (const candidate of candidates) {
        if (stryMutAct_9fa48("35889")) {
          {}
        } else {
          stryCov_9fa48("35889");
          const timestamp = Number(candidate);
          if (stryMutAct_9fa48("35892") ? Number.isFinite(timestamp) || timestamp > NUM.ZERO : stryMutAct_9fa48("35891") ? false : stryMutAct_9fa48("35890") ? true : (stryCov_9fa48("35890", "35891", "35892"), Number.isFinite(timestamp) && (stryMutAct_9fa48("35895") ? timestamp <= NUM.ZERO : stryMutAct_9fa48("35894") ? timestamp >= NUM.ZERO : stryMutAct_9fa48("35893") ? true : (stryCov_9fa48("35893", "35894", "35895"), timestamp > NUM.ZERO)))) {
            if (stryMutAct_9fa48("35896")) {
              {}
            } else {
              stryCov_9fa48("35896");
              return timestamp;
            }
          }
        }
      }
      return null;
    }
  }

  /**
   * Set a node state (for initialization from external source).
   * @param {string} nodeId - Node ID.
   * @param {string} state - Node state.
   */
  setNodeState(nodeId, state, updatedAt = null) {
    if (stryMutAct_9fa48("35897")) {
      {}
    } else {
      stryCov_9fa48("35897");
      this._nodeStates.set(nodeId, state);
      const timestamp = Number(updatedAt);
      if (stryMutAct_9fa48("35900") ? Number.isFinite(timestamp) || timestamp > NUM.ZERO : stryMutAct_9fa48("35899") ? false : stryMutAct_9fa48("35898") ? true : (stryCov_9fa48("35898", "35899", "35900"), Number.isFinite(timestamp) && (stryMutAct_9fa48("35903") ? timestamp <= NUM.ZERO : stryMutAct_9fa48("35902") ? timestamp >= NUM.ZERO : stryMutAct_9fa48("35901") ? true : (stryCov_9fa48("35901", "35902", "35903"), timestamp > NUM.ZERO)))) {
        if (stryMutAct_9fa48("35904")) {
          {}
        } else {
          stryCov_9fa48("35904");
          this._nodeStateEventTimestamps.set(nodeId, timestamp);
        }
      }
    }
  }
}
export { CDCEventHandler };