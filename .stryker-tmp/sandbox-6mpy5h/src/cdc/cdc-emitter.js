/**
 * CDCEmitter - Composable CDC event generation and subscriber management.
 *
 * Encapsulates CDC event creation, subscriber lifecycle, and event delivery.
 * Extracted from PartitionCDCGenerator to provide a focused, composable
 * building block for partition replicas.
 *
 * Requirements: 5.4, 5.5
 *
 * @module cdc/cdc-emitter
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
import { NUM, SQL, TYPEOF } from '../constants/index.js';
import { CDC_EMITTER_ERROR_MSG, CDC_EMITTER_FIELD, CDC_EMITTER_LOG_MSG, CDC_EMITTER_OPERATION } from './cdc-emitter-constants.js';

/**
 * SQL keyword prefixes used for operation type detection.
 * @private
 */
const SQL_PREFIX = Object.freeze(stryMutAct_9fa48("35424") ? {} : (stryCov_9fa48("35424"), {
  INSERT: SQL.INSERT_INTO,
  INSERT_OR_REPLACE: SQL.INSERT_OR_REPLACE,
  UPDATE: SQL.UPDATE,
  DELETE: SQL.DELETE_FROM
}));

/**
 * CDCEmitter generates and delivers CDC events to subscribers.
 *
 * @class
 */
class CDCEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.partitionId - Source partition ID.
   * @param {string} options.replicaId - Source replica ID.
   * @param {string} options.tableName - Default table name.
   * @param {Object} options.hlcClock - HLC clock for timestamps.
   * @param {Object} [options.logger] - Logger instance.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("35425")) {
      {}
    } else {
      stryCov_9fa48("35425");
      if (stryMutAct_9fa48("35428") ? false : stryMutAct_9fa48("35427") ? true : stryMutAct_9fa48("35426") ? options.partitionId : (stryCov_9fa48("35426", "35427", "35428"), !options.partitionId)) {
        if (stryMutAct_9fa48("35429")) {
          {}
        } else {
          stryCov_9fa48("35429");
          throw new Error(CDC_EMITTER_ERROR_MSG.MISSING_PARTITION_ID);
        }
      }
      if (stryMutAct_9fa48("35432") ? false : stryMutAct_9fa48("35431") ? true : stryMutAct_9fa48("35430") ? options.replicaId : (stryCov_9fa48("35430", "35431", "35432"), !options.replicaId)) {
        if (stryMutAct_9fa48("35433")) {
          {}
        } else {
          stryCov_9fa48("35433");
          throw new Error(CDC_EMITTER_ERROR_MSG.MISSING_REPLICA_ID);
        }
      }
      if (stryMutAct_9fa48("35436") ? false : stryMutAct_9fa48("35435") ? true : stryMutAct_9fa48("35434") ? options.tableName : (stryCov_9fa48("35434", "35435", "35436"), !options.tableName)) {
        if (stryMutAct_9fa48("35437")) {
          {}
        } else {
          stryCov_9fa48("35437");
          throw new Error(CDC_EMITTER_ERROR_MSG.MISSING_TABLE_NAME);
        }
      }
      if (stryMutAct_9fa48("35440") ? false : stryMutAct_9fa48("35439") ? true : stryMutAct_9fa48("35438") ? options.hlcClock : (stryCov_9fa48("35438", "35439", "35440"), !options.hlcClock)) {
        if (stryMutAct_9fa48("35441")) {
          {}
        } else {
          stryCov_9fa48("35441");
          throw new Error(CDC_EMITTER_ERROR_MSG.MISSING_HLC_CLOCK);
        }
      }
      this.partitionId = options.partitionId;
      this.replicaId = options.replicaId;
      this.tableName = options.tableName;
      this.hlcClock = options.hlcClock;
      this.logger = stryMutAct_9fa48("35444") ? options.logger && console : stryMutAct_9fa48("35443") ? false : stryMutAct_9fa48("35442") ? true : (stryCov_9fa48("35442", "35443", "35444"), options.logger || console);

      /** @private */
      this.subscribers = new Set();
    }
  }

  /**
   * Generate and emit a CDC event to all subscribers.
   *
   * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE).
   * @param {Object} data - Changed data.
   * @return {Promise<void>}
   */
  async emit(operation, data) {
    if (stryMutAct_9fa48("35445")) {
      {}
    } else {
      stryCov_9fa48("35445");
      if (stryMutAct_9fa48("35448") ? false : stryMutAct_9fa48("35447") ? true : stryMutAct_9fa48("35446") ? operation : (stryCov_9fa48("35446", "35447", "35448"), !operation)) {
        if (stryMutAct_9fa48("35449")) {
          {}
        } else {
          stryCov_9fa48("35449");
          throw new Error(CDC_EMITTER_ERROR_MSG.MISSING_OPERATION);
        }
      }
      if (stryMutAct_9fa48("35452") ? false : stryMutAct_9fa48("35451") ? true : stryMutAct_9fa48("35450") ? data : (stryCov_9fa48("35450", "35451", "35452"), !data)) {
        if (stryMutAct_9fa48("35453")) {
          {}
        } else {
          stryCov_9fa48("35453");
          throw new Error(CDC_EMITTER_ERROR_MSG.MISSING_DATA);
        }
      }
      const event = stryMutAct_9fa48("35454") ? {} : (stryCov_9fa48("35454"), {
        [CDC_EMITTER_FIELD.TABLE_NAME]: this.tableName,
        [CDC_EMITTER_FIELD.OPERATION]: operation,
        [CDC_EMITTER_FIELD.DATA]: data,
        [CDC_EMITTER_FIELD.TIMESTAMP]: this.hlcClock.now(),
        [CDC_EMITTER_FIELD.SOURCE_PARTITION]: this.partitionId,
        [CDC_EMITTER_FIELD.SOURCE_REPLICA]: this.replicaId
      });
      this.logger.debug(CDC_EMITTER_LOG_MSG.EMITTING_EVENT, stryMutAct_9fa48("35455") ? {} : (stryCov_9fa48("35455"), {
        partitionId: this.partitionId,
        operation,
        tableName: this.tableName,
        subscriberCount: this.subscribers.size
      }));
      await this.deliverToSubscribers(event);
    }
  }

  /**
   * Generate a CDC event from a SQL statement.
   * Extracts the operation type from the SQL string and calls emit().
   *
   * @param {string} sql - SQL statement.
   * @param {Array} params - Query parameters.
   * @param {Object} info - Additional info (e.g., SQLite run result).
   * @return {Promise<void>}
   */
  async emitFromSQL(sql, params, info) {
    if (stryMutAct_9fa48("35456")) {
      {}
    } else {
      stryCov_9fa48("35456");
      const operation = this.extractOperationFromSQL(sql);
      if (stryMutAct_9fa48("35459") ? false : stryMutAct_9fa48("35458") ? true : stryMutAct_9fa48("35457") ? operation : (stryCov_9fa48("35457", "35458", "35459"), !operation)) {
        if (stryMutAct_9fa48("35460")) {
          {}
        } else {
          stryCov_9fa48("35460");
          return;
        }
      }
      const data = this.buildDataFromInfo(sql, params, info);
      await this.emit(operation, data);
    }
  }

  /**
   * Subscribe to CDC events.
   *
   * @param {Function} subscriber - Subscriber callback function.
   */
  subscribe(subscriber) {
    if (stryMutAct_9fa48("35461")) {
      {}
    } else {
      stryCov_9fa48("35461");
      this.subscribers.add(subscriber);
      this.logger.debug(CDC_EMITTER_LOG_MSG.SUBSCRIBER_ADDED, stryMutAct_9fa48("35462") ? {} : (stryCov_9fa48("35462"), {
        partitionId: this.partitionId,
        subscriberCount: this.subscribers.size
      }));
    }
  }

  /**
   * Unsubscribe from CDC events.
   *
   * @param {Function} subscriber - Subscriber to remove.
   */
  unsubscribe(subscriber) {
    if (stryMutAct_9fa48("35463")) {
      {}
    } else {
      stryCov_9fa48("35463");
      this.subscribers.delete(subscriber);
      this.logger.debug(CDC_EMITTER_LOG_MSG.SUBSCRIBER_REMOVED, stryMutAct_9fa48("35464") ? {} : (stryCov_9fa48("35464"), {
        partitionId: this.partitionId,
        subscriberCount: this.subscribers.size
      }));
    }
  }

  /**
   * Shutdown and clear all subscribers.
   */
  shutdown() {
    if (stryMutAct_9fa48("35465")) {
      {}
    } else {
      stryCov_9fa48("35465");
      this.logger.debug(CDC_EMITTER_LOG_MSG.SHUTDOWN, stryMutAct_9fa48("35466") ? {} : (stryCov_9fa48("35466"), {
        partitionId: this.partitionId,
        subscriberCount: this.subscribers.size
      }));
      this.subscribers.clear();
      this.logger.debug(CDC_EMITTER_LOG_MSG.SHUTDOWN_COMPLETE, stryMutAct_9fa48("35467") ? {} : (stryCov_9fa48("35467"), {
        partitionId: this.partitionId
      }));
    }
  }

  /**
   * Deliver a CDC event to all subscribers.
   * If a subscriber throws, the error is logged and delivery
   * continues to remaining subscribers.
   *
   * @param {Object} event - CDC event to deliver.
   * @return {Promise<void>}
   * @private
   */
  async deliverToSubscribers(event) {
    if (stryMutAct_9fa48("35468")) {
      {}
    } else {
      stryCov_9fa48("35468");
      let index = NUM.ZERO;
      for (const subscriber of this.subscribers) {
        if (stryMutAct_9fa48("35469")) {
          {}
        } else {
          stryCov_9fa48("35469");
          try {
            if (stryMutAct_9fa48("35470")) {
              {}
            } else {
              stryCov_9fa48("35470");
              await subscriber(event);
            }
          } catch (error) {
            if (stryMutAct_9fa48("35471")) {
              {}
            } else {
              stryCov_9fa48("35471");
              this.logger.error(CDC_EMITTER_LOG_MSG.SUBSCRIBER_DELIVERY_FAILED, stryMutAct_9fa48("35472") ? {} : (stryCov_9fa48("35472"), {
                partitionId: this.partitionId,
                subscriberIndex: index,
                error: error.message
              }));
            }
          }
          stryMutAct_9fa48("35473") ? index-- : (stryCov_9fa48("35473"), index++);
        }
      }
    }
  }

  /**
   * Extract the CDC operation type from a SQL string.
   *
   * @param {string} sql - SQL statement.
   * @return {string|null} CDC operation or null for non-write SQL.
   * @private
   */
  extractOperationFromSQL(sql) {
    if (stryMutAct_9fa48("35474")) {
      {}
    } else {
      stryCov_9fa48("35474");
      if (stryMutAct_9fa48("35477") ? !sql && typeof sql !== TYPEOF.STRING : stryMutAct_9fa48("35476") ? false : stryMutAct_9fa48("35475") ? true : (stryCov_9fa48("35475", "35476", "35477"), (stryMutAct_9fa48("35478") ? sql : (stryCov_9fa48("35478"), !sql)) || (stryMutAct_9fa48("35480") ? typeof sql === TYPEOF.STRING : stryMutAct_9fa48("35479") ? false : (stryCov_9fa48("35479", "35480"), typeof sql !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("35481")) {
          {}
        } else {
          stryCov_9fa48("35481");
          return null;
        }
      }
      const trimmed = stryMutAct_9fa48("35483") ? sql.toUpperCase() : stryMutAct_9fa48("35482") ? sql.trim().toLowerCase() : (stryCov_9fa48("35482", "35483"), sql.trim().toUpperCase());
      if (stryMutAct_9fa48("35486") ? trimmed.endsWith(SQL_PREFIX.INSERT_OR_REPLACE) : stryMutAct_9fa48("35485") ? false : stryMutAct_9fa48("35484") ? true : (stryCov_9fa48("35484", "35485", "35486"), trimmed.startsWith(SQL_PREFIX.INSERT_OR_REPLACE))) {
        if (stryMutAct_9fa48("35487")) {
          {}
        } else {
          stryCov_9fa48("35487");
          return CDC_EMITTER_OPERATION.INSERT;
        }
      }
      if (stryMutAct_9fa48("35490") ? trimmed.endsWith(SQL_PREFIX.INSERT) : stryMutAct_9fa48("35489") ? false : stryMutAct_9fa48("35488") ? true : (stryCov_9fa48("35488", "35489", "35490"), trimmed.startsWith(SQL_PREFIX.INSERT))) {
        if (stryMutAct_9fa48("35491")) {
          {}
        } else {
          stryCov_9fa48("35491");
          return CDC_EMITTER_OPERATION.INSERT;
        }
      }
      if (stryMutAct_9fa48("35494") ? trimmed.endsWith(SQL_PREFIX.UPDATE) : stryMutAct_9fa48("35493") ? false : stryMutAct_9fa48("35492") ? true : (stryCov_9fa48("35492", "35493", "35494"), trimmed.startsWith(SQL_PREFIX.UPDATE))) {
        if (stryMutAct_9fa48("35495")) {
          {}
        } else {
          stryCov_9fa48("35495");
          return CDC_EMITTER_OPERATION.UPDATE;
        }
      }
      if (stryMutAct_9fa48("35498") ? trimmed.endsWith(SQL_PREFIX.DELETE) : stryMutAct_9fa48("35497") ? false : stryMutAct_9fa48("35496") ? true : (stryCov_9fa48("35496", "35497", "35498"), trimmed.startsWith(SQL_PREFIX.DELETE))) {
        if (stryMutAct_9fa48("35499")) {
          {}
        } else {
          stryCov_9fa48("35499");
          return CDC_EMITTER_OPERATION.DELETE;
        }
      }
      return null;
    }
  }

  /**
   * Build a data object from SQL info for the CDC event.
   *
   * @param {string} sql - SQL statement.
   * @param {Array} params - Query parameters.
   * @param {Object} info - Additional info from the SQL execution.
   * @return {Object} Data object for the CDC event.
   * @private
   */
  buildDataFromInfo(sql, params, info) {
    if (stryMutAct_9fa48("35500")) {
      {}
    } else {
      stryCov_9fa48("35500");
      const data = {};
      if (stryMutAct_9fa48("35503") ? info || typeof info === TYPEOF.OBJECT : stryMutAct_9fa48("35502") ? false : stryMutAct_9fa48("35501") ? true : (stryCov_9fa48("35501", "35502", "35503"), info && (stryMutAct_9fa48("35505") ? typeof info !== TYPEOF.OBJECT : stryMutAct_9fa48("35504") ? true : (stryCov_9fa48("35504", "35505"), typeof info === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("35506")) {
          {}
        } else {
          stryCov_9fa48("35506");
          Object.assign(data, info);
        }
      }
      if (stryMutAct_9fa48("35509") ? params && Array.isArray(params) || params.length > NUM.ZERO : stryMutAct_9fa48("35508") ? false : stryMutAct_9fa48("35507") ? true : (stryCov_9fa48("35507", "35508", "35509"), (stryMutAct_9fa48("35511") ? params || Array.isArray(params) : stryMutAct_9fa48("35510") ? true : (stryCov_9fa48("35510", "35511"), params && Array.isArray(params))) && (stryMutAct_9fa48("35514") ? params.length <= NUM.ZERO : stryMutAct_9fa48("35513") ? params.length >= NUM.ZERO : stryMutAct_9fa48("35512") ? true : (stryCov_9fa48("35512", "35513", "35514"), params.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("35515")) {
          {}
        } else {
          stryCov_9fa48("35515");
          data.params = params;
        }
      }
      data.sql = sql;
      return data;
    }
  }
}
export { CDCEmitter };