/**
 * Partition CDC Generator - Generates CDC events for partition write operations.
 * Extracted from partition-service.js for single responsibility.
 * Requirements: 6.2, 6.4, 6.6
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
import { CDC_OPERATION, NUM, SQL, TYPEOF } from '../constants/index.js';
import { STRING } from '../constants/strings.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { extractConjunctiveWhereColumns } from './partition-sql-parser.js';
import { PARTITION_SERVICE_ERROR_MSG, PARTITION_SERVICE_EVENT, PARTITION_SERVICE_LOG_MSG, PARTITION_SERVICE_OPERATION, PARTITION_SERVICE_SQL_FRAGMENT, PARTITION_SERVICE_TYPE, PARTITION_SERVICE_VALUE } from './partition-service-constants.js';

/**
 * CDC operation types.
 */
const CDCOperation = CDC_OPERATION;

/**
 * Generates CDC events for partition write operations.
 * Handles event creation, formatting, and delivery to subscribers.
 *
 * Responsibilities:
 * - CDC event generation for INSERT, UPDATE, DELETE, UPSERT operations
 * - SQL parsing to extract table names and data
 * - CDC event formatting with proper structure
 * - CDC event delivery to subscribers
 *
 * @class
 */
class PartitionCDCGenerator {
  /**
   * Create a new CDC generator instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.partitionId - Partition ID.
   * @param {string} options.replicaId - Replica ID.
   * @param {string} options.tableName - Default table name.
   * @param {Database} options.db - SQLite database instance for row lookups.
   * @param {Object} options.logger - Logger instance.
   * @param {EventEmitter} options.eventEmitter - Event emitter for CDC events.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("99957")) {
      {}
    } else {
      stryCov_9fa48("99957");
      this.partitionId = options.partitionId;
      this.replicaId = options.replicaId;
      this.tableName = options.tableName;
      this.db = options.db;
      this.logger = stryMutAct_9fa48("99960") ? options.logger && console : stryMutAct_9fa48("99959") ? false : stryMutAct_9fa48("99958") ? true : (stryCov_9fa48("99958", "99959", "99960"), options.logger || console);
      this.eventEmitter = options.eventEmitter;

      // CDC subscribers
      this.cdcSubscribers = new Set();
    }
  }

  /**
   * Get the number of CDC subscribers.
   * @return {number} Subscriber count.
   */
  getSubscriberCount() {
    if (stryMutAct_9fa48("99961")) {
      {}
    } else {
      stryCov_9fa48("99961");
      return this.cdcSubscribers.size;
    }
  }

  /**
   * Subscribe to CDC events from this partition.
   * @param {Function|Object} subscriber - Subscriber function or object with handleCDCEvent.
   */
  subscribe(subscriber) {
    if (stryMutAct_9fa48("99962")) {
      {}
    } else {
      stryCov_9fa48("99962");
      this.cdcSubscribers.add(subscriber);
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIBER_ADDED, stryMutAct_9fa48("99963") ? {} : (stryCov_9fa48("99963"), {
        partitionId: this.partitionId,
        subscriberCount: this.cdcSubscribers.size
      }));
    }
  }

  /**
   * Unsubscribe from CDC events.
   * @param {Function|Object} subscriber - Subscriber to remove.
   */
  unsubscribe(subscriber) {
    if (stryMutAct_9fa48("99964")) {
      {}
    } else {
      stryCov_9fa48("99964");
      this.cdcSubscribers.delete(subscriber);
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIBER_REMOVED, stryMutAct_9fa48("99965") ? {} : (stryCov_9fa48("99965"), {
        partitionId: this.partitionId,
        subscriberCount: this.cdcSubscribers.size
      }));
    }
  }

  /**
   * Generate a CDC event for a write operation.
   * @param {Object} entry - Write entry.
   * @return {Promise<void>}
   */
  async generateEvent(entry) {
    if (stryMutAct_9fa48("99966")) {
      {}
    } else {
      stryCov_9fa48("99966");
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.GENERATE_CDC_EVENT_CALLED, stryMutAct_9fa48("99967") ? {} : (stryCov_9fa48("99967"), {
        partitionId: this.partitionId,
        entryType: entry.type,
        sql: entry.sql ? stryMutAct_9fa48("99968") ? entry.sql : (stryCov_9fa48("99968"), entry.sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT)) : null,
        subscriberCount: this.cdcSubscribers.size
      }));
      if (stryMutAct_9fa48("99971") ? this.cdcSubscribers.size !== NUM.ZERO : stryMutAct_9fa48("99970") ? false : stryMutAct_9fa48("99969") ? true : (stryCov_9fa48("99969", "99970", "99971"), this.cdcSubscribers.size === NUM.ZERO)) {
        if (stryMutAct_9fa48("99972")) {
          {}
        } else {
          stryCov_9fa48("99972");
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.NO_CDC_SUBSCRIBERS, stryMutAct_9fa48("99973") ? {} : (stryCov_9fa48("99973"), {
            partitionId: this.partitionId
          }));
          return;
        }
      }
      const operationInfo = this.determineOperation(entry);
      if (stryMutAct_9fa48("99976") ? false : stryMutAct_9fa48("99975") ? true : stryMutAct_9fa48("99974") ? operationInfo : (stryCov_9fa48("99974", "99975", "99976"), !operationInfo)) {
        if (stryMutAct_9fa48("99977")) {
          {}
        } else {
          stryCov_9fa48("99977");
          return; // No CDC for this operation type
        }
      }
      const {
        operation,
        entryType
      } = operationInfo;
      const cdcData = this.extractCDCData(entry, entryType);
      const tableName = this.extractTableName(entry);
      const cdcEvent = stryMutAct_9fa48("99978") ? {} : (stryCov_9fa48("99978"), {
        tableName,
        operation,
        data: cdcData,
        timestamp: entry.timestamp,
        sourcePartition: this.partitionId,
        sourceReplica: this.replicaId
      });
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.GENERATED_CDC_EVENT, stryMutAct_9fa48("99979") ? {} : (stryCov_9fa48("99979"), {
        partitionId: this.partitionId,
        operation,
        tableName: cdcEvent.tableName,
        dataKeys: Object.keys(cdcData),
        subscriberCount: this.cdcSubscribers.size
      }));
      await this.deliverEvent(cdcEvent);
    }
  }

  /**
   * Determine the CDC operation type from an entry.
   * @param {Object} entry - Write entry.
   * @return {Object|null} Operation info or null if no CDC needed.
   * @private
   */
  determineOperation(entry) {
    if (stryMutAct_9fa48("99980")) {
      {}
    } else {
      stryCov_9fa48("99980");
      let operation;
      let entryType = entry.type;

      // For raw SQL queries, determine operation type from SQL
      if (stryMutAct_9fa48("99983") ? entryType === PARTITION_SERVICE_OPERATION.QUERY || entry.sql : stryMutAct_9fa48("99982") ? false : stryMutAct_9fa48("99981") ? true : (stryCov_9fa48("99981", "99982", "99983"), (stryMutAct_9fa48("99985") ? entryType !== PARTITION_SERVICE_OPERATION.QUERY : stryMutAct_9fa48("99984") ? true : (stryCov_9fa48("99984", "99985"), entryType === PARTITION_SERVICE_OPERATION.QUERY)) && entry.sql)) {
        if (stryMutAct_9fa48("99986")) {
          {}
        } else {
          stryCov_9fa48("99986");
          const sqlUpper = stryMutAct_9fa48("99988") ? entry.sql.toUpperCase() : stryMutAct_9fa48("99987") ? entry.sql.trim().toLowerCase() : (stryCov_9fa48("99987", "99988"), entry.sql.trim().toUpperCase());
          // Check for INSERT OR REPLACE first (before plain INSERT)
          // This is used by upsertSystemTableRow and should generate UPSERT CDC events
          if (stryMutAct_9fa48("99991") ? sqlUpper.endsWith(SQL.INSERT_OR_REPLACE) : stryMutAct_9fa48("99990") ? false : stryMutAct_9fa48("99989") ? true : (stryCov_9fa48("99989", "99990", "99991"), sqlUpper.startsWith(SQL.INSERT_OR_REPLACE))) {
            if (stryMutAct_9fa48("99992")) {
              {}
            } else {
              stryCov_9fa48("99992");
              entryType = PARTITION_SERVICE_OPERATION.UPSERT;
            }
          } else if (stryMutAct_9fa48("99995") ? sqlUpper.endsWith(PARTITION_SERVICE_OPERATION.INSERT) : stryMutAct_9fa48("99994") ? false : stryMutAct_9fa48("99993") ? true : (stryCov_9fa48("99993", "99994", "99995"), sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.INSERT))) {
            if (stryMutAct_9fa48("99996")) {
              {}
            } else {
              stryCov_9fa48("99996");
              entryType = PARTITION_SERVICE_OPERATION.INSERT;
            }
          } else if (stryMutAct_9fa48("99999") ? sqlUpper.endsWith(PARTITION_SERVICE_OPERATION.UPDATE) : stryMutAct_9fa48("99998") ? false : stryMutAct_9fa48("99997") ? true : (stryCov_9fa48("99997", "99998", "99999"), sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.UPDATE))) {
            if (stryMutAct_9fa48("100000")) {
              {}
            } else {
              stryCov_9fa48("100000");
              entryType = PARTITION_SERVICE_OPERATION.UPDATE;
            }
          } else if (stryMutAct_9fa48("100003") ? sqlUpper.endsWith(PARTITION_SERVICE_OPERATION.DELETE) : stryMutAct_9fa48("100002") ? false : stryMutAct_9fa48("100001") ? true : (stryCov_9fa48("100001", "100002", "100003"), sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.DELETE))) {
            if (stryMutAct_9fa48("100004")) {
              {}
            } else {
              stryCov_9fa48("100004");
              entryType = PARTITION_SERVICE_OPERATION.DELETE;
            }
          }
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.DETECTED_OPERATION_TYPE, stryMutAct_9fa48("100005") ? {} : (stryCov_9fa48("100005"), {
            originalType: entry.type,
            detectedType: entryType
          }));
        }
      }
      switch (entryType) {
        case PARTITION_SERVICE_OPERATION.INSERT:
          if (stryMutAct_9fa48("100006")) {} else {
            stryCov_9fa48("100006");
            operation = CDCOperation.INSERT;
            break;
          }
        case PARTITION_SERVICE_OPERATION.UPDATE:
          if (stryMutAct_9fa48("100007")) {} else {
            stryCov_9fa48("100007");
            operation = CDCOperation.UPDATE;
            break;
          }
        case PARTITION_SERVICE_OPERATION.UPSERT:
          if (stryMutAct_9fa48("100008")) {} else {
            stryCov_9fa48("100008");
            operation = CDCOperation.UPSERT;
            break;
          }
        case PARTITION_SERVICE_OPERATION.DELETE:
          if (stryMutAct_9fa48("100009")) {} else {
            stryCov_9fa48("100009");
            operation = CDCOperation.DELETE;
            break;
          }
        default:
          if (stryMutAct_9fa48("100010")) {} else {
            stryCov_9fa48("100010");
            this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_UNKNOWN_OPERATION, stryMutAct_9fa48("100011") ? {} : (stryCov_9fa48("100011"), {
              entryType,
              partitionId: this.partitionId
            }));
            return null;
          }
        // No CDC for other operations
      }
      return stryMutAct_9fa48("100012") ? {} : (stryCov_9fa48("100012"), {
        operation,
        entryType
      });
    }
  }

  /**
   * Extract CDC data from an entry.
   * @param {Object} entry - Write entry.
   * @param {string} entryType - Resolved entry type.
   * @return {Object} CDC data object.
   * @private
   */
  extractCDCData(entry, entryType) {
    if (stryMutAct_9fa48("100013")) {
      {}
    } else {
      stryCov_9fa48("100013");
      const tableName = this.extractTableName(entry);
      const isUpdateOperation = stryMutAct_9fa48("100016") ? entry.type === PARTITION_SERVICE_OPERATION.UPDATE && entryType === PARTITION_SERVICE_OPERATION.UPDATE : stryMutAct_9fa48("100015") ? false : stryMutAct_9fa48("100014") ? true : (stryCov_9fa48("100014", "100015", "100016"), (stryMutAct_9fa48("100018") ? entry.type !== PARTITION_SERVICE_OPERATION.UPDATE : stryMutAct_9fa48("100017") ? false : (stryCov_9fa48("100017", "100018"), entry.type === PARTITION_SERVICE_OPERATION.UPDATE)) || (stryMutAct_9fa48("100020") ? entryType !== PARTITION_SERVICE_OPERATION.UPDATE : stryMutAct_9fa48("100019") ? false : (stryCov_9fa48("100019", "100020"), entryType === PARTITION_SERVICE_OPERATION.UPDATE)));

      // For UPDATE operations, merge whereClause (contains primary key) with data
      // This ensures CDC events always include the primary key field
      // For DELETE operations, use whereClause as the data (contains primary key)
      let cdcData = stryMutAct_9fa48("100023") ? entry.data && {} : stryMutAct_9fa48("100022") ? false : stryMutAct_9fa48("100021") ? true : (stryCov_9fa48("100021", "100022", "100023"), entry.data || {});
      if (stryMutAct_9fa48("100026") ? isUpdateOperation || entry.whereClause : stryMutAct_9fa48("100025") ? false : stryMutAct_9fa48("100024") ? true : (stryCov_9fa48("100024", "100025", "100026"), isUpdateOperation && entry.whereClause)) {
        if (stryMutAct_9fa48("100027")) {
          {}
        } else {
          stryCov_9fa48("100027");
          cdcData = stryMutAct_9fa48("100028") ? {} : (stryCov_9fa48("100028"), {
            ...entry.whereClause,
            ...cdcData
          });
        }
      } else if (stryMutAct_9fa48("100031") ? entry.type === PARTITION_SERVICE_OPERATION.DELETE || entryType === PARTITION_SERVICE_OPERATION.DELETE || entry.whereClause : stryMutAct_9fa48("100030") ? false : stryMutAct_9fa48("100029") ? true : (stryCov_9fa48("100029", "100030", "100031"), (stryMutAct_9fa48("100033") ? entry.type === PARTITION_SERVICE_OPERATION.DELETE && entryType === PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("100032") ? true : (stryCov_9fa48("100032", "100033"), (stryMutAct_9fa48("100035") ? entry.type !== PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("100034") ? false : (stryCov_9fa48("100034", "100035"), entry.type === PARTITION_SERVICE_OPERATION.DELETE)) || (stryMutAct_9fa48("100037") ? entryType !== PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("100036") ? false : (stryCov_9fa48("100036", "100037"), entryType === PARTITION_SERVICE_OPERATION.DELETE)))) && entry.whereClause)) {
        if (stryMutAct_9fa48("100038")) {
          {}
        } else {
          stryCov_9fa48("100038");
          cdcData = stryMutAct_9fa48("100039") ? {} : (stryCov_9fa48("100039"), {
            ...entry.whereClause
          });
        }
      }

      // For raw SQL queries, extract data from SQL
      if (stryMutAct_9fa48("100042") ? entry.type === PARTITION_SERVICE_OPERATION.QUERY || entry.sql : stryMutAct_9fa48("100041") ? false : stryMutAct_9fa48("100040") ? true : (stryCov_9fa48("100040", "100041", "100042"), (stryMutAct_9fa48("100044") ? entry.type !== PARTITION_SERVICE_OPERATION.QUERY : stryMutAct_9fa48("100043") ? true : (stryCov_9fa48("100043", "100044"), entry.type === PARTITION_SERVICE_OPERATION.QUERY)) && entry.sql)) {
        if (stryMutAct_9fa48("100045")) {
          {}
        } else {
          stryCov_9fa48("100045");
          // For parameterized queries (SQL with ? placeholders), build data from params
          const hasParams = stryMutAct_9fa48("100048") ? entry.params || entry.params.length > NUM.ZERO : stryMutAct_9fa48("100047") ? false : stryMutAct_9fa48("100046") ? true : (stryCov_9fa48("100046", "100047", "100048"), entry.params && (stryMutAct_9fa48("100051") ? entry.params.length <= NUM.ZERO : stryMutAct_9fa48("100050") ? entry.params.length >= NUM.ZERO : stryMutAct_9fa48("100049") ? true : (stryCov_9fa48("100049", "100050", "100051"), entry.params.length > NUM.ZERO)));
          const hasPlaceholders = entry.sql.includes(PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK);
          if (stryMutAct_9fa48("100054") ? hasParams && hasPlaceholders || Object.keys(cdcData).length === NUM.ZERO : stryMutAct_9fa48("100053") ? false : stryMutAct_9fa48("100052") ? true : (stryCov_9fa48("100052", "100053", "100054"), (stryMutAct_9fa48("100056") ? hasParams || hasPlaceholders : stryMutAct_9fa48("100055") ? true : (stryCov_9fa48("100055", "100056"), hasParams && hasPlaceholders)) && (stryMutAct_9fa48("100058") ? Object.keys(cdcData).length !== NUM.ZERO : stryMutAct_9fa48("100057") ? true : (stryCov_9fa48("100057", "100058"), Object.keys(cdcData).length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("100059")) {
              {}
            } else {
              stryCov_9fa48("100059");
              cdcData = this.extractDataFromParameterizedSQL(entry.sql, entry.params, tableName, entryType);
            }
          }

          // For INSERT queries without params, parse literal values from SQL
          if (stryMutAct_9fa48("100062") ? entryType === PARTITION_SERVICE_OPERATION.INSERT || entryType === PARTITION_SERVICE_OPERATION.UPSERT || Object.keys(cdcData).length === NUM.ZERO : stryMutAct_9fa48("100061") ? false : stryMutAct_9fa48("100060") ? true : (stryCov_9fa48("100060", "100061", "100062"), (stryMutAct_9fa48("100064") ? entryType === PARTITION_SERVICE_OPERATION.INSERT && entryType === PARTITION_SERVICE_OPERATION.UPSERT : stryMutAct_9fa48("100063") ? true : (stryCov_9fa48("100063", "100064"), (stryMutAct_9fa48("100066") ? entryType !== PARTITION_SERVICE_OPERATION.INSERT : stryMutAct_9fa48("100065") ? false : (stryCov_9fa48("100065", "100066"), entryType === PARTITION_SERVICE_OPERATION.INSERT)) || (stryMutAct_9fa48("100068") ? entryType !== PARTITION_SERVICE_OPERATION.UPSERT : stryMutAct_9fa48("100067") ? false : (stryCov_9fa48("100067", "100068"), entryType === PARTITION_SERVICE_OPERATION.UPSERT)))) && (stryMutAct_9fa48("100070") ? Object.keys(cdcData).length !== NUM.ZERO : stryMutAct_9fa48("100069") ? true : (stryCov_9fa48("100069", "100070"), Object.keys(cdcData).length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("100071")) {
              {}
            } else {
              stryCov_9fa48("100071");
              cdcData = this.extractInsertDataFromSQL(entry.sql, tableName);
            }
          }

          // For UPDATE queries, try to extract the WHERE clause to query updated row
          if (stryMutAct_9fa48("100074") ? entryType === PARTITION_SERVICE_OPERATION.UPDATE || Object.keys(cdcData).length === NUM.ZERO : stryMutAct_9fa48("100073") ? false : stryMutAct_9fa48("100072") ? true : (stryCov_9fa48("100072", "100073", "100074"), (stryMutAct_9fa48("100076") ? entryType !== PARTITION_SERVICE_OPERATION.UPDATE : stryMutAct_9fa48("100075") ? true : (stryCov_9fa48("100075", "100076"), entryType === PARTITION_SERVICE_OPERATION.UPDATE)) && (stryMutAct_9fa48("100078") ? Object.keys(cdcData).length !== NUM.ZERO : stryMutAct_9fa48("100077") ? true : (stryCov_9fa48("100077", "100078"), Object.keys(cdcData).length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("100079")) {
              {}
            } else {
              stryCov_9fa48("100079");
              cdcData = this.extractUpdateDataFromSQL(entry.sql, tableName);
            }
          }

          // For DELETE queries, extract the WHERE clause
          if (stryMutAct_9fa48("100082") ? entryType === PARTITION_SERVICE_OPERATION.DELETE || Object.keys(cdcData).length === NUM.ZERO : stryMutAct_9fa48("100081") ? false : stryMutAct_9fa48("100080") ? true : (stryCov_9fa48("100080", "100081", "100082"), (stryMutAct_9fa48("100084") ? entryType !== PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("100083") ? true : (stryCov_9fa48("100083", "100084"), entryType === PARTITION_SERVICE_OPERATION.DELETE)) && (stryMutAct_9fa48("100086") ? Object.keys(cdcData).length !== NUM.ZERO : stryMutAct_9fa48("100085") ? true : (stryCov_9fa48("100085", "100086"), Object.keys(cdcData).length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("100087")) {
              {}
            } else {
              stryCov_9fa48("100087");
              cdcData = this.extractDeleteDataFromSQL(entry.sql);
            }
          }
        }
      }
      if (stryMutAct_9fa48("100090") ? isUpdateOperation || entry.whereClause : stryMutAct_9fa48("100089") ? false : stryMutAct_9fa48("100088") ? true : (stryCov_9fa48("100088", "100089", "100090"), isUpdateOperation && entry.whereClause)) {
        if (stryMutAct_9fa48("100091")) {
          {}
        } else {
          stryCov_9fa48("100091");
          const authoritativeRow = this.fetchUpdatedRow(tableName, entry.whereClause);
          if (stryMutAct_9fa48("100093") ? false : stryMutAct_9fa48("100092") ? true : (stryCov_9fa48("100092", "100093"), authoritativeRow)) {
            if (stryMutAct_9fa48("100094")) {
              {}
            } else {
              stryCov_9fa48("100094");
              return authoritativeRow;
            }
          }
        }
      }
      return cdcData;
    }
  }

  /**
   * Extract table name from an entry.
   * @param {Object} entry - Write entry.
   * @return {string} Table name.
   * @private
   */
  extractTableName(entry) {
    if (stryMutAct_9fa48("100095")) {
      {}
    } else {
      stryCov_9fa48("100095");
      let tableName = stryMutAct_9fa48("100098") ? entry.tableName && this.tableName : stryMutAct_9fa48("100097") ? false : stryMutAct_9fa48("100096") ? true : (stryCov_9fa48("100096", "100097", "100098"), entry.tableName || this.tableName);
      if (stryMutAct_9fa48("100101") ? entry.type === PARTITION_SERVICE_OPERATION.QUERY || entry.sql : stryMutAct_9fa48("100100") ? false : stryMutAct_9fa48("100099") ? true : (stryCov_9fa48("100099", "100100", "100101"), (stryMutAct_9fa48("100103") ? entry.type !== PARTITION_SERVICE_OPERATION.QUERY : stryMutAct_9fa48("100102") ? true : (stryCov_9fa48("100102", "100103"), entry.type === PARTITION_SERVICE_OPERATION.QUERY)) && entry.sql)) {
        if (stryMutAct_9fa48("100104")) {
          {}
        } else {
          stryCov_9fa48("100104");
          const extractedName = this.extractTableNameFromSQL(entry.sql);
          if (stryMutAct_9fa48("100107") ? extractedName.state !== PARTITION_SERVICE_VALUE.CDC_TABLE_NAME_EXTRACTION_STATE_FOUND : stryMutAct_9fa48("100106") ? false : stryMutAct_9fa48("100105") ? true : (stryCov_9fa48("100105", "100106", "100107"), extractedName.state === PARTITION_SERVICE_VALUE.CDC_TABLE_NAME_EXTRACTION_STATE_FOUND)) {
            if (stryMutAct_9fa48("100108")) {
              {}
            } else {
              stryCov_9fa48("100108");
              tableName = extractedName.tableName;
            }
          }
        }
      }
      return tableName;
    }
  }

  /**
   * Extract table name from SQL statement.
   * @param {string} sql - SQL statement.
   * @return {Object} Explicit table-name extraction result.
   * @private
   */
  extractTableNameFromSQL(sql) {
    if (stryMutAct_9fa48("100109")) {
      {}
    } else {
      stryCov_9fa48("100109");
      const tableMatch = sql.match(stryMutAct_9fa48("100124") ? /(?:UPDATE|INSERT\s+(?:OR\s+\w+\s+)?INTO|DELETE\s+FROM)\s+(\W+)/i : stryMutAct_9fa48("100123") ? /(?:UPDATE|INSERT\s+(?:OR\s+\w+\s+)?INTO|DELETE\s+FROM)\s+(\w)/i : stryMutAct_9fa48("100122") ? /(?:UPDATE|INSERT\s+(?:OR\s+\w+\s+)?INTO|DELETE\s+FROM)\S+(\w+)/i : stryMutAct_9fa48("100121") ? /(?:UPDATE|INSERT\s+(?:OR\s+\w+\s+)?INTO|DELETE\s+FROM)\s(\w+)/i : stryMutAct_9fa48("100120") ? /(?:UPDATE|INSERT\s+(?:OR\s+\w+\s+)?INTO|DELETE\S+FROM)\s+(\w+)/i : stryMutAct_9fa48("100119") ? /(?:UPDATE|INSERT\s+(?:OR\s+\w+\s+)?INTO|DELETE\sFROM)\s+(\w+)/i : stryMutAct_9fa48("100118") ? /(?:UPDATE|INSERT\s+(?:OR\s+\w+\S+)?INTO|DELETE\s+FROM)\s+(\w+)/i : stryMutAct_9fa48("100117") ? /(?:UPDATE|INSERT\s+(?:OR\s+\w+\s)?INTO|DELETE\s+FROM)\s+(\w+)/i : stryMutAct_9fa48("100116") ? /(?:UPDATE|INSERT\s+(?:OR\s+\W+\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i : stryMutAct_9fa48("100115") ? /(?:UPDATE|INSERT\s+(?:OR\s+\w\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i : stryMutAct_9fa48("100114") ? /(?:UPDATE|INSERT\s+(?:OR\S+\w+\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i : stryMutAct_9fa48("100113") ? /(?:UPDATE|INSERT\s+(?:OR\s\w+\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i : stryMutAct_9fa48("100112") ? /(?:UPDATE|INSERT\s+(?:OR\s+\w+\s+)INTO|DELETE\s+FROM)\s+(\w+)/i : stryMutAct_9fa48("100111") ? /(?:UPDATE|INSERT\S+(?:OR\s+\w+\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i : stryMutAct_9fa48("100110") ? /(?:UPDATE|INSERT\s(?:OR\s+\w+\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i : (stryCov_9fa48("100110", "100111", "100112", "100113", "100114", "100115", "100116", "100117", "100118", "100119", "100120", "100121", "100122", "100123", "100124"), /(?:UPDATE|INSERT\s+(?:OR\s+\w+\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i));
      if (stryMutAct_9fa48("100126") ? false : stryMutAct_9fa48("100125") ? true : (stryCov_9fa48("100125", "100126"), tableMatch)) {
        if (stryMutAct_9fa48("100127")) {
          {}
        } else {
          stryCov_9fa48("100127");
          const tableName = tableMatch[NUM.ONE];
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_TABLE_NAME, stryMutAct_9fa48("100128") ? {} : (stryCov_9fa48("100128"), {
            tableName
          }));
          return Object.freeze(stryMutAct_9fa48("100129") ? {} : (stryCov_9fa48("100129"), {
            state: PARTITION_SERVICE_VALUE.CDC_TABLE_NAME_EXTRACTION_STATE_FOUND,
            tableName
          }));
        }
      }
      return Object.freeze(stryMutAct_9fa48("100130") ? {} : (stryCov_9fa48("100130"), {
        state: PARTITION_SERVICE_VALUE.CDC_TABLE_NAME_EXTRACTION_STATE_NOT_FOUND
      }));
    }
  }

  /**
   * Deliver CDC event to all subscribers.
   * @param {Object} cdcEvent - CDC event to deliver.
   * @return {Promise<void>}
   * @private
   */
  async deliverEvent(cdcEvent) {
    if (stryMutAct_9fa48("100131")) {
      {}
    } else {
      stryCov_9fa48("100131");
      let deliveredCount = NUM.ZERO;
      for (const subscriber of this.cdcSubscribers) {
        if (stryMutAct_9fa48("100132")) {
          {}
        } else {
          stryCov_9fa48("100132");
          try {
            if (stryMutAct_9fa48("100133")) {
              {}
            } else {
              stryCov_9fa48("100133");
              if (stryMutAct_9fa48("100136") ? typeof subscriber !== PARTITION_SERVICE_TYPE.FUNCTION : stryMutAct_9fa48("100135") ? false : stryMutAct_9fa48("100134") ? true : (stryCov_9fa48("100134", "100135", "100136"), typeof subscriber === PARTITION_SERVICE_TYPE.FUNCTION)) {
                if (stryMutAct_9fa48("100137")) {
                  {}
                } else {
                  stryCov_9fa48("100137");
                  await subscriber(cdcEvent);
                  stryMutAct_9fa48("100138") ? deliveredCount-- : (stryCov_9fa48("100138"), deliveredCount++);
                }
              } else if (stryMutAct_9fa48("100140") ? false : stryMutAct_9fa48("100139") ? true : (stryCov_9fa48("100139", "100140"), subscriber.handleCDCEvent)) {
                if (stryMutAct_9fa48("100141")) {
                  {}
                } else {
                  stryCov_9fa48("100141");
                  await subscriber.handleCDCEvent(cdcEvent);
                  stryMutAct_9fa48("100142") ? deliveredCount-- : (stryCov_9fa48("100142"), deliveredCount++);
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("100143")) {
              {}
            } else {
              stryCov_9fa48("100143");
              this.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_DELIVERY_FAILED, stryMutAct_9fa48("100144") ? {} : (stryCov_9fa48("100144"), {
                partitionId: this.partitionId,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_DELIVERY_COMPLETE, stryMutAct_9fa48("100145") ? {} : (stryCov_9fa48("100145"), {
        partitionId: this.partitionId,
        deliveredCount,
        subscriberCount: this.cdcSubscribers.size
      }));
      if (stryMutAct_9fa48("100147") ? false : stryMutAct_9fa48("100146") ? true : (stryCov_9fa48("100146", "100147"), this.eventEmitter)) {
        if (stryMutAct_9fa48("100148")) {
          {}
        } else {
          stryCov_9fa48("100148");
          this.eventEmitter.emit(PARTITION_SERVICE_EVENT.CDC_EVENT, cdcEvent);
        }
      }
    }
  }

  /**
   * Extract data from INSERT SQL by querying the inserted row.
   * @param {string} sql - INSERT SQL statement.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractInsertDataFromSQL(sql, tableName) {
    if (stryMutAct_9fa48("100149")) {
      {}
    } else {
      stryCov_9fa48("100149");
      // Parse INSERT INTO table (col1, col2) VALUES ('val1', 'val2')
      // or INSERT OR REPLACE INTO table (col1, col2) VALUES ('val1', 'val2')
      const columnsMatch = sql.match(stryMutAct_9fa48("100164") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([)]+)\)/i : stryMutAct_9fa48("100163") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([^)])\)/i : stryMutAct_9fa48("100162") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\S*\(([^)]+)\)/i : stryMutAct_9fa48("100161") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s\(([^)]+)\)/i : stryMutAct_9fa48("100160") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\W+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100159") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w\s*\(([^)]+)\)/i : stryMutAct_9fa48("100158") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\S+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100157") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100156") ? /INSERT\s+(?:OR\s+REPLACE\S+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100155") ? /INSERT\s+(?:OR\s+REPLACE\s)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100154") ? /INSERT\s+(?:OR\S+REPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100153") ? /INSERT\s+(?:OR\sREPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100152") ? /INSERT\s+(?:OR\s+REPLACE\s+)INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100151") ? /INSERT\S+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100150") ? /INSERT\s(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : (stryCov_9fa48("100150", "100151", "100152", "100153", "100154", "100155", "100156", "100157", "100158", "100159", "100160", "100161", "100162", "100163", "100164"), /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i));
      const valuesMatch = sql.match(stryMutAct_9fa48("100168") ? /VALUES\s*\(([)]+)\)/i : stryMutAct_9fa48("100167") ? /VALUES\s*\(([^)])\)/i : stryMutAct_9fa48("100166") ? /VALUES\S*\(([^)]+)\)/i : stryMutAct_9fa48("100165") ? /VALUES\s\(([^)]+)\)/i : (stryCov_9fa48("100165", "100166", "100167", "100168"), /VALUES\s*\(([^)]+)\)/i));
      if (stryMutAct_9fa48("100171") ? !columnsMatch && !valuesMatch : stryMutAct_9fa48("100170") ? false : stryMutAct_9fa48("100169") ? true : (stryCov_9fa48("100169", "100170", "100171"), (stryMutAct_9fa48("100172") ? columnsMatch : (stryCov_9fa48("100172"), !columnsMatch)) || (stryMutAct_9fa48("100173") ? valuesMatch : (stryCov_9fa48("100173"), !valuesMatch)))) {
        if (stryMutAct_9fa48("100174")) {
          {}
        } else {
          stryCov_9fa48("100174");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_INSERT_FAILED, stryMutAct_9fa48("100175") ? {} : (stryCov_9fa48("100175"), {
            sql: stryMutAct_9fa48("100176") ? sql : (stryCov_9fa48("100176"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT))
          }));
          return {};
        }
      }
      const columns = columnsMatch[NUM.ONE].split(PARTITION_SERVICE_SQL_FRAGMENT.COMMA).map(stryMutAct_9fa48("100177") ? () => undefined : (stryCov_9fa48("100177"), c => stryMutAct_9fa48("100178") ? c : (stryCov_9fa48("100178"), c.trim())));
      const valuesStr = valuesMatch[NUM.ONE];

      // Parse values - handle quoted strings and numbers
      const values = this.parseValuesFromSQL(valuesStr);
      if (stryMutAct_9fa48("100181") ? columns.length === values.length : stryMutAct_9fa48("100180") ? false : stryMutAct_9fa48("100179") ? true : (stryCov_9fa48("100179", "100180", "100181"), columns.length !== values.length)) {
        if (stryMutAct_9fa48("100182")) {
          {}
        } else {
          stryCov_9fa48("100182");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_INSERT_MISMATCH, stryMutAct_9fa48("100183") ? {} : (stryCov_9fa48("100183"), {
            columns: columns.length,
            values: values.length
          }));
          return {};
        }
      }

      // Build data object
      const data = {};
      for (let i = NUM.ZERO; stryMutAct_9fa48("100186") ? i >= columns.length : stryMutAct_9fa48("100185") ? i <= columns.length : stryMutAct_9fa48("100184") ? false : (stryCov_9fa48("100184", "100185", "100186"), i < columns.length); stryMutAct_9fa48("100187") ? i-- : (stryCov_9fa48("100187"), i++)) {
        if (stryMutAct_9fa48("100188")) {
          {}
        } else {
          stryCov_9fa48("100188");
          data[columns[i]] = values[i];
        }
      }
      const pkColumn = columns[NUM.ZERO];
      return this.fetchInsertRow(tableName, pkColumn, values[NUM.ZERO], data);
    }
  }

  /**
   * Extract data from UPDATE SQL by querying the updated row.
   * @param {string} sql - UPDATE SQL statement.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractUpdateDataFromSQL(sql, tableName) {
    if (stryMutAct_9fa48("100189")) {
      {}
    } else {
      stryCov_9fa48("100189");
      // Match WHERE clause with optional parentheses: WHERE (col = 'val') or WHERE col = 'val'
      const whereMatch = sql.match(stryMutAct_9fa48("100200") ? /WHERE\s*\(?(\w+)\s*=\s*'([']+)'/i : stryMutAct_9fa48("100199") ? /WHERE\s*\(?(\w+)\s*=\s*'([^'])'/i : stryMutAct_9fa48("100198") ? /WHERE\s*\(?(\w+)\s*=\S*'([^']+)'/i : stryMutAct_9fa48("100197") ? /WHERE\s*\(?(\w+)\s*=\s'([^']+)'/i : stryMutAct_9fa48("100196") ? /WHERE\s*\(?(\w+)\S*=\s*'([^']+)'/i : stryMutAct_9fa48("100195") ? /WHERE\s*\(?(\w+)\s=\s*'([^']+)'/i : stryMutAct_9fa48("100194") ? /WHERE\s*\(?(\W+)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("100193") ? /WHERE\s*\(?(\w)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("100192") ? /WHERE\s*\((\w+)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("100191") ? /WHERE\S*\(?(\w+)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("100190") ? /WHERE\s\(?(\w+)\s*=\s*'([^']+)'/i : (stryCov_9fa48("100190", "100191", "100192", "100193", "100194", "100195", "100196", "100197", "100198", "100199", "100200"), /WHERE\s*\(?(\w+)\s*=\s*'([^']+)'/i));
      if (stryMutAct_9fa48("100203") ? whereMatch || this.db : stryMutAct_9fa48("100202") ? false : stryMutAct_9fa48("100201") ? true : (stryCov_9fa48("100201", "100202", "100203"), whereMatch && this.db)) {
        if (stryMutAct_9fa48("100204")) {
          {}
        } else {
          stryCov_9fa48("100204");
          const keyColumn = whereMatch[NUM.ONE];
          const keyValue = whereMatch[NUM.TWO];
          const authoritativeRow = this.fetchUpdatedRow(tableName, stryMutAct_9fa48("100205") ? {} : (stryCov_9fa48("100205"), {
            [keyColumn]: keyValue
          }));
          if (stryMutAct_9fa48("100207") ? false : stryMutAct_9fa48("100206") ? true : (stryCov_9fa48("100206", "100207"), authoritativeRow)) {
            if (stryMutAct_9fa48("100208")) {
              {}
            } else {
              stryCov_9fa48("100208");
              return authoritativeRow;
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("100209")) {
          {}
        } else {
          stryCov_9fa48("100209");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_UPDATE_WHERE_FAILED, stryMutAct_9fa48("100210") ? {} : (stryCov_9fa48("100210"), {
            sql: stryMutAct_9fa48("100211") ? sql : (stryCov_9fa48("100211"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT))
          }));
        }
      }
      return {};
    }
  }

  /**
   * Extract data from DELETE SQL.
   * @param {string} sql - DELETE SQL statement.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractDeleteDataFromSQL(sql) {
    if (stryMutAct_9fa48("100212")) {
      {}
    } else {
      stryCov_9fa48("100212");
      // Match WHERE clause: WHERE col = 'val'
      const whereMatch = sql.match(stryMutAct_9fa48("100223") ? /WHERE\s*\(?(\w+)\s*=\s*'([']+)'/i : stryMutAct_9fa48("100222") ? /WHERE\s*\(?(\w+)\s*=\s*'([^'])'/i : stryMutAct_9fa48("100221") ? /WHERE\s*\(?(\w+)\s*=\S*'([^']+)'/i : stryMutAct_9fa48("100220") ? /WHERE\s*\(?(\w+)\s*=\s'([^']+)'/i : stryMutAct_9fa48("100219") ? /WHERE\s*\(?(\w+)\S*=\s*'([^']+)'/i : stryMutAct_9fa48("100218") ? /WHERE\s*\(?(\w+)\s=\s*'([^']+)'/i : stryMutAct_9fa48("100217") ? /WHERE\s*\(?(\W+)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("100216") ? /WHERE\s*\(?(\w)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("100215") ? /WHERE\s*\((\w+)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("100214") ? /WHERE\S*\(?(\w+)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("100213") ? /WHERE\s\(?(\w+)\s*=\s*'([^']+)'/i : (stryCov_9fa48("100213", "100214", "100215", "100216", "100217", "100218", "100219", "100220", "100221", "100222", "100223"), /WHERE\s*\(?(\w+)\s*=\s*'([^']+)'/i));
      if (stryMutAct_9fa48("100225") ? false : stryMutAct_9fa48("100224") ? true : (stryCov_9fa48("100224", "100225"), whereMatch)) {
        if (stryMutAct_9fa48("100226")) {
          {}
        } else {
          stryCov_9fa48("100226");
          const keyColumn = whereMatch[NUM.ONE];
          const keyValue = whereMatch[NUM.TWO];
          return stryMutAct_9fa48("100227") ? {} : (stryCov_9fa48("100227"), {
            [keyColumn]: keyValue
          });
        }
      }
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_DELETE_WHERE_FAILED, stryMutAct_9fa48("100228") ? {} : (stryCov_9fa48("100228"), {
        sql: stryMutAct_9fa48("100229") ? sql : (stryCov_9fa48("100229"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT))
      }));
      return {};
    }
  }

  /**
   * Extract data from parameterized SQL (SQL with ? placeholders and params array).
   * @param {string} sql - SQL statement with ? placeholders.
   * @param {Array} params - Parameter values.
   * @param {string} tableName - Table name.
   * @param {string} operationType - INSERT, UPDATE, or DELETE.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractDataFromParameterizedSQL(sql, params, tableName, operationType) {
    if (stryMutAct_9fa48("100230")) {
      {}
    } else {
      stryCov_9fa48("100230");
      if (stryMutAct_9fa48("100233") ? !params && params.length === NUM.ZERO : stryMutAct_9fa48("100232") ? false : stryMutAct_9fa48("100231") ? true : (stryCov_9fa48("100231", "100232", "100233"), (stryMutAct_9fa48("100234") ? params : (stryCov_9fa48("100234"), !params)) || (stryMutAct_9fa48("100236") ? params.length !== NUM.ZERO : stryMutAct_9fa48("100235") ? false : (stryCov_9fa48("100235", "100236"), params.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("100237")) {
          {}
        } else {
          stryCov_9fa48("100237");
          return {};
        }
      }
      if (stryMutAct_9fa48("100240") ? operationType === PARTITION_SERVICE_OPERATION.INSERT && operationType === PARTITION_SERVICE_OPERATION.UPSERT : stryMutAct_9fa48("100239") ? false : stryMutAct_9fa48("100238") ? true : (stryCov_9fa48("100238", "100239", "100240"), (stryMutAct_9fa48("100242") ? operationType !== PARTITION_SERVICE_OPERATION.INSERT : stryMutAct_9fa48("100241") ? false : (stryCov_9fa48("100241", "100242"), operationType === PARTITION_SERVICE_OPERATION.INSERT)) || (stryMutAct_9fa48("100244") ? operationType !== PARTITION_SERVICE_OPERATION.UPSERT : stryMutAct_9fa48("100243") ? false : (stryCov_9fa48("100243", "100244"), operationType === PARTITION_SERVICE_OPERATION.UPSERT)))) {
        if (stryMutAct_9fa48("100245")) {
          {}
        } else {
          stryCov_9fa48("100245");
          return this.extractParamInsertData(sql, params, tableName);
        }
      }
      if (stryMutAct_9fa48("100248") ? operationType !== PARTITION_SERVICE_OPERATION.UPDATE : stryMutAct_9fa48("100247") ? false : stryMutAct_9fa48("100246") ? true : (stryCov_9fa48("100246", "100247", "100248"), operationType === PARTITION_SERVICE_OPERATION.UPDATE)) {
        if (stryMutAct_9fa48("100249")) {
          {}
        } else {
          stryCov_9fa48("100249");
          return this.extractParamUpdateData(sql, params, tableName);
        }
      }
      if (stryMutAct_9fa48("100252") ? operationType !== PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("100251") ? false : stryMutAct_9fa48("100250") ? true : (stryCov_9fa48("100250", "100251", "100252"), operationType === PARTITION_SERVICE_OPERATION.DELETE)) {
        if (stryMutAct_9fa48("100253")) {
          {}
        } else {
          stryCov_9fa48("100253");
          return this.extractParamDeleteData(sql, params, tableName);
        }
      }
      return {};
    }
  }

  /**
   * Extract data from parameterized INSERT SQL.
   * @param {string} sql - SQL statement.
   * @param {Array} params - Parameter values.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data.
   * @private
   */
  extractParamInsertData(sql, params, tableName) {
    if (stryMutAct_9fa48("100254")) {
      {}
    } else {
      stryCov_9fa48("100254");
      // Parse INSERT INTO table (col1, col2, ...) VALUES (?, ?, ...)
      const columnsMatch = sql.match(stryMutAct_9fa48("100269") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([)]+)\)/i : stryMutAct_9fa48("100268") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([^)])\)/i : stryMutAct_9fa48("100267") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\S*\(([^)]+)\)/i : stryMutAct_9fa48("100266") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s\(([^)]+)\)/i : stryMutAct_9fa48("100265") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\W+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100264") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w\s*\(([^)]+)\)/i : stryMutAct_9fa48("100263") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\S+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100262") ? /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100261") ? /INSERT\s+(?:OR\s+REPLACE\S+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100260") ? /INSERT\s+(?:OR\s+REPLACE\s)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100259") ? /INSERT\s+(?:OR\S+REPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100258") ? /INSERT\s+(?:OR\sREPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100257") ? /INSERT\s+(?:OR\s+REPLACE\s+)INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100256") ? /INSERT\S+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("100255") ? /INSERT\s(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : (stryCov_9fa48("100255", "100256", "100257", "100258", "100259", "100260", "100261", "100262", "100263", "100264", "100265", "100266", "100267", "100268", "100269"), /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i));
      if (stryMutAct_9fa48("100272") ? false : stryMutAct_9fa48("100271") ? true : stryMutAct_9fa48("100270") ? columnsMatch : (stryCov_9fa48("100270", "100271", "100272"), !columnsMatch)) {
        if (stryMutAct_9fa48("100273")) {
          {}
        } else {
          stryCov_9fa48("100273");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_INSERT_COLUMNS_FAILED, stryMutAct_9fa48("100274") ? {} : (stryCov_9fa48("100274"), {
            sql: stryMutAct_9fa48("100275") ? sql : (stryCov_9fa48("100275"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT))
          }));
          return {};
        }
      }
      const columns = columnsMatch[NUM.ONE].split(PARTITION_SERVICE_SQL_FRAGMENT.COMMA).map(stryMutAct_9fa48("100276") ? () => undefined : (stryCov_9fa48("100276"), c => stryMutAct_9fa48("100277") ? c : (stryCov_9fa48("100277"), c.trim())));
      if (stryMutAct_9fa48("100280") ? columns.length === params.length : stryMutAct_9fa48("100279") ? false : stryMutAct_9fa48("100278") ? true : (stryCov_9fa48("100278", "100279", "100280"), columns.length !== params.length)) {
        if (stryMutAct_9fa48("100281")) {
          {}
        } else {
          stryCov_9fa48("100281");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, stryMutAct_9fa48("100282") ? {} : (stryCov_9fa48("100282"), {
            columns: columns.length,
            params: params.length
          }));
          return {};
        }
      }

      // Build data object from columns and params
      const data = {};
      for (let i = NUM.ZERO; stryMutAct_9fa48("100285") ? i >= columns.length : stryMutAct_9fa48("100284") ? i <= columns.length : stryMutAct_9fa48("100283") ? false : (stryCov_9fa48("100283", "100284", "100285"), i < columns.length); stryMutAct_9fa48("100286") ? i-- : (stryCov_9fa48("100286"), i++)) {
        if (stryMutAct_9fa48("100287")) {
          {}
        } else {
          stryCov_9fa48("100287");
          data[columns[i]] = params[i];
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_INSERT, stryMutAct_9fa48("100288") ? {} : (stryCov_9fa48("100288"), {
        tableName,
        dataKeys: Object.keys(data)
      }));
      return this.fetchInsertRow(tableName, columns[NUM.ZERO], data[columns[NUM.ZERO]], data);
    }
  }

  /**
   * Extract data from parameterized UPDATE SQL.
   * @param {string} sql - SQL statement.
   * @param {Array} params - Parameter values.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data.
   * @private
   */
  extractParamUpdateData(sql, params, tableName) {
    if (stryMutAct_9fa48("100289")) {
      {}
    } else {
      stryCov_9fa48("100289");
      // Parse UPDATE table SET col1 = ?, col2 = ? WHERE pk = ?
      // Use [\s\S] so multiline SQL emitted by query builders stays parseable.
      const setMatch = sql.match(stryMutAct_9fa48("100297") ? /\bSET\s+([\s\S]+?)\S+\bWHERE\b/i : stryMutAct_9fa48("100296") ? /\bSET\s+([\s\S]+?)\s\bWHERE\b/i : stryMutAct_9fa48("100295") ? /\bSET\s+([\s\s]+?)\s+\bWHERE\b/i : stryMutAct_9fa48("100294") ? /\bSET\s+([\S\S]+?)\s+\bWHERE\b/i : stryMutAct_9fa48("100293") ? /\bSET\s+([^\s\S]+?)\s+\bWHERE\b/i : stryMutAct_9fa48("100292") ? /\bSET\s+([\s\S])\s+\bWHERE\b/i : stryMutAct_9fa48("100291") ? /\bSET\S+([\s\S]+?)\s+\bWHERE\b/i : stryMutAct_9fa48("100290") ? /\bSET\s([\s\S]+?)\s+\bWHERE\b/i : (stryCov_9fa48("100290", "100291", "100292", "100293", "100294", "100295", "100296", "100297"), /\bSET\s+([\s\S]+?)\s+\bWHERE\b/i));
      const whereMatch = sql.match(stryMutAct_9fa48("100304") ? /\bWHERE\s+([\s\s]+)$/i : stryMutAct_9fa48("100303") ? /\bWHERE\s+([\S\S]+)$/i : stryMutAct_9fa48("100302") ? /\bWHERE\s+([^\s\S]+)$/i : stryMutAct_9fa48("100301") ? /\bWHERE\s+([\s\S])$/i : stryMutAct_9fa48("100300") ? /\bWHERE\S+([\s\S]+)$/i : stryMutAct_9fa48("100299") ? /\bWHERE\s([\s\S]+)$/i : stryMutAct_9fa48("100298") ? /\bWHERE\s+([\s\S]+)/i : (stryCov_9fa48("100298", "100299", "100300", "100301", "100302", "100303", "100304"), /\bWHERE\s+([\s\S]+)$/i));
      if (stryMutAct_9fa48("100307") ? false : stryMutAct_9fa48("100306") ? true : stryMutAct_9fa48("100305") ? setMatch : (stryCov_9fa48("100305", "100306", "100307"), !setMatch)) {
        if (stryMutAct_9fa48("100308")) {
          {}
        } else {
          stryCov_9fa48("100308");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_UPDATE_SET_FAILED, stryMutAct_9fa48("100309") ? {} : (stryCov_9fa48("100309"), {
            sql: stryMutAct_9fa48("100310") ? sql : (stryCov_9fa48("100310"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT))
          }));
          return {};
        }
      }

      // Extract column names from SET clause
      const setColumns = stryMutAct_9fa48("100311") ? setMatch[NUM.ONE].split(PARTITION_SERVICE_SQL_FRAGMENT.COMMA).map(part => {
        const match = part.trim().match(/^(\w+)\s*=/);
        return match ? match[NUM.ONE] : null;
      }) : (stryCov_9fa48("100311"), setMatch[NUM.ONE].split(PARTITION_SERVICE_SQL_FRAGMENT.COMMA).map(part => {
        if (stryMutAct_9fa48("100312")) {
          {}
        } else {
          stryCov_9fa48("100312");
          const match = stryMutAct_9fa48("100313") ? part.match(/^(\w+)\s*=/) : (stryCov_9fa48("100313"), part.trim().match(stryMutAct_9fa48("100318") ? /^(\w+)\S*=/ : stryMutAct_9fa48("100317") ? /^(\w+)\s=/ : stryMutAct_9fa48("100316") ? /^(\W+)\s*=/ : stryMutAct_9fa48("100315") ? /^(\w)\s*=/ : stryMutAct_9fa48("100314") ? /(\w+)\s*=/ : (stryCov_9fa48("100314", "100315", "100316", "100317", "100318"), /^(\w+)\s*=/)));
          return match ? match[NUM.ONE] : null;
        }
      }).filter(Boolean));

      // Extract column names from WHERE clause
      // Handle parentheses around the WHERE clause: WHERE (col = ?)
      const whereColumns = whereMatch ? extractConjunctiveWhereColumns(whereMatch[NUM.ONE]) : stryMutAct_9fa48("100319") ? ["Stryker was here"] : (stryCov_9fa48("100319"), []);
      const allColumns = stryMutAct_9fa48("100320") ? [] : (stryCov_9fa48("100320"), [...setColumns, ...whereColumns]);
      if (stryMutAct_9fa48("100323") ? allColumns.length === params.length : stryMutAct_9fa48("100322") ? false : stryMutAct_9fa48("100321") ? true : (stryCov_9fa48("100321", "100322", "100323"), allColumns.length !== params.length)) {
        if (stryMutAct_9fa48("100324")) {
          {}
        } else {
          stryCov_9fa48("100324");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_UPDATE_MISMATCH, stryMutAct_9fa48("100325") ? {} : (stryCov_9fa48("100325"), {
            columns: allColumns.length,
            params: params.length
          }));
          return {};
        }
      }

      // Build data object while preserving UPDATE semantics:
      // SET-column values are authoritative; WHERE-only columns backfill keys.
      const data = {};
      let paramIndex = NUM.ZERO;
      for (const column of setColumns) {
        if (stryMutAct_9fa48("100326")) {
          {}
        } else {
          stryCov_9fa48("100326");
          data[column] = params[paramIndex];
          stryMutAct_9fa48("100327") ? paramIndex -= NUM.ONE : (stryCov_9fa48("100327"), paramIndex += NUM.ONE);
        }
      }
      for (const column of whereColumns) {
        if (stryMutAct_9fa48("100328")) {
          {}
        } else {
          stryCov_9fa48("100328");
          const value = params[paramIndex];
          stryMutAct_9fa48("100329") ? paramIndex -= NUM.ONE : (stryCov_9fa48("100329"), paramIndex += NUM.ONE);
          if (stryMutAct_9fa48("100332") ? false : stryMutAct_9fa48("100331") ? true : stryMutAct_9fa48("100330") ? Object.prototype.hasOwnProperty.call(data, column) : (stryCov_9fa48("100330", "100331", "100332"), !Object.prototype.hasOwnProperty.call(data, column))) {
            if (stryMutAct_9fa48("100333")) {
              {}
            } else {
              stryCov_9fa48("100333");
              data[column] = value;
            }
          }
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_UPDATE, stryMutAct_9fa48("100334") ? {} : (stryCov_9fa48("100334"), {
        tableName,
        dataKeys: Object.keys(data)
      }));
      const whereClause = {};
      for (let i = NUM.ZERO; stryMutAct_9fa48("100337") ? i >= whereColumns.length : stryMutAct_9fa48("100336") ? i <= whereColumns.length : stryMutAct_9fa48("100335") ? false : (stryCov_9fa48("100335", "100336", "100337"), i < whereColumns.length); stryMutAct_9fa48("100338") ? i-- : (stryCov_9fa48("100338"), i++)) {
        if (stryMutAct_9fa48("100339")) {
          {}
        } else {
          stryCov_9fa48("100339");
          whereClause[whereColumns[i]] = params[stryMutAct_9fa48("100340") ? setColumns.length - i : (stryCov_9fa48("100340"), setColumns.length + i)];
        }
      }
      const authoritativeRow = this.fetchUpdatedRow(tableName, whereClause);
      if (stryMutAct_9fa48("100342") ? false : stryMutAct_9fa48("100341") ? true : (stryCov_9fa48("100341", "100342"), authoritativeRow)) {
        if (stryMutAct_9fa48("100343")) {
          {}
        } else {
          stryCov_9fa48("100343");
          return authoritativeRow;
        }
      }
      return data;
    }
  }

  /**
   * Extract data from parameterized DELETE SQL.
   * @param {string} sql - SQL statement.
   * @param {Array} params - Parameter values.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data.
   * @private
   */
  extractParamDeleteData(sql, params, tableName) {
    if (stryMutAct_9fa48("100344")) {
      {}
    } else {
      stryCov_9fa48("100344");
      // Parse DELETE FROM table WHERE pk = ? or WHERE (pk = ?)
      // Use [\s\S] for multiline predicates.
      const whereMatch = sql.match(stryMutAct_9fa48("100351") ? /\bWHERE\s+([\s\s]+)$/i : stryMutAct_9fa48("100350") ? /\bWHERE\s+([\S\S]+)$/i : stryMutAct_9fa48("100349") ? /\bWHERE\s+([^\s\S]+)$/i : stryMutAct_9fa48("100348") ? /\bWHERE\s+([\s\S])$/i : stryMutAct_9fa48("100347") ? /\bWHERE\S+([\s\S]+)$/i : stryMutAct_9fa48("100346") ? /\bWHERE\s([\s\S]+)$/i : stryMutAct_9fa48("100345") ? /\bWHERE\s+([\s\S]+)/i : (stryCov_9fa48("100345", "100346", "100347", "100348", "100349", "100350", "100351"), /\bWHERE\s+([\s\S]+)$/i));
      if (stryMutAct_9fa48("100354") ? false : stryMutAct_9fa48("100353") ? true : stryMutAct_9fa48("100352") ? whereMatch : (stryCov_9fa48("100352", "100353", "100354"), !whereMatch)) {
        if (stryMutAct_9fa48("100355")) {
          {}
        } else {
          stryCov_9fa48("100355");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_DELETE_WHERE_FAILED, stryMutAct_9fa48("100356") ? {} : (stryCov_9fa48("100356"), {
            sql: stryMutAct_9fa48("100357") ? sql : (stryCov_9fa48("100357"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT))
          }));
          return {};
        }
      }
      const whereContent = stryMutAct_9fa48("100358") ? whereMatch[NUM.ONE] : (stryCov_9fa48("100358"), whereMatch[NUM.ONE].trim());
      const whereColumns = extractConjunctiveWhereColumns(whereContent);
      if (stryMutAct_9fa48("100361") ? whereColumns.length === params.length : stryMutAct_9fa48("100360") ? false : stryMutAct_9fa48("100359") ? true : (stryCov_9fa48("100359", "100360", "100361"), whereColumns.length !== params.length)) {
        if (stryMutAct_9fa48("100362")) {
          {}
        } else {
          stryCov_9fa48("100362");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_DELETE_MISMATCH, stryMutAct_9fa48("100363") ? {} : (stryCov_9fa48("100363"), {
            columns: whereColumns.length,
            params: params.length,
            whereContent
          }));
          return {};
        }
      }
      const data = {};
      for (let i = NUM.ZERO; stryMutAct_9fa48("100366") ? i >= whereColumns.length : stryMutAct_9fa48("100365") ? i <= whereColumns.length : stryMutAct_9fa48("100364") ? false : (stryCov_9fa48("100364", "100365", "100366"), i < whereColumns.length); stryMutAct_9fa48("100367") ? i-- : (stryCov_9fa48("100367"), i++)) {
        if (stryMutAct_9fa48("100368")) {
          {}
        } else {
          stryCov_9fa48("100368");
          data[whereColumns[i]] = params[i];
        }
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_DELETE, stryMutAct_9fa48("100369") ? {} : (stryCov_9fa48("100369"), {
        tableName,
        dataKeys: Object.keys(data)
      }));
      return data;
    }
  }

  /**
   * Parse values from SQL VALUES clause.
   * @param {string} valuesStr - Values string like "'val1', 123, NULL".
   * @return {Array} Parsed values.
   * @private
   */
  parseValuesFromSQL(valuesStr) {
    if (stryMutAct_9fa48("100370")) {
      {}
    } else {
      stryCov_9fa48("100370");
      const values = stryMutAct_9fa48("100371") ? ["Stryker was here"] : (stryCov_9fa48("100371"), []);
      let current = STRING.EMPTY;
      let inQuote = stryMutAct_9fa48("100372") ? true : (stryCov_9fa48("100372"), false);
      let quoteChar = null;
      for (let i = NUM.ZERO; stryMutAct_9fa48("100375") ? i >= valuesStr.length : stryMutAct_9fa48("100374") ? i <= valuesStr.length : stryMutAct_9fa48("100373") ? false : (stryCov_9fa48("100373", "100374", "100375"), i < valuesStr.length); stryMutAct_9fa48("100376") ? i-- : (stryCov_9fa48("100376"), i++)) {
        if (stryMutAct_9fa48("100377")) {
          {}
        } else {
          stryCov_9fa48("100377");
          const char = valuesStr[i];
          if (stryMutAct_9fa48("100380") ? !inQuote || char === PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE || char === PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE : stryMutAct_9fa48("100379") ? false : stryMutAct_9fa48("100378") ? true : (stryCov_9fa48("100378", "100379", "100380"), (stryMutAct_9fa48("100381") ? inQuote : (stryCov_9fa48("100381"), !inQuote)) && (stryMutAct_9fa48("100383") ? char === PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE && char === PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE : stryMutAct_9fa48("100382") ? true : (stryCov_9fa48("100382", "100383"), (stryMutAct_9fa48("100385") ? char !== PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE : stryMutAct_9fa48("100384") ? false : (stryCov_9fa48("100384", "100385"), char === PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE)) || (stryMutAct_9fa48("100387") ? char !== PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE : stryMutAct_9fa48("100386") ? false : (stryCov_9fa48("100386", "100387"), char === PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE)))))) {
            if (stryMutAct_9fa48("100388")) {
              {}
            } else {
              stryCov_9fa48("100388");
              inQuote = stryMutAct_9fa48("100389") ? false : (stryCov_9fa48("100389"), true);
              quoteChar = char;
            }
          } else if (stryMutAct_9fa48("100392") ? inQuote || char === quoteChar : stryMutAct_9fa48("100391") ? false : stryMutAct_9fa48("100390") ? true : (stryCov_9fa48("100390", "100391", "100392"), inQuote && (stryMutAct_9fa48("100394") ? char !== quoteChar : stryMutAct_9fa48("100393") ? true : (stryCov_9fa48("100393", "100394"), char === quoteChar)))) {
            if (stryMutAct_9fa48("100395")) {
              {}
            } else {
              stryCov_9fa48("100395");
              // Check for escaped quote
              if (stryMutAct_9fa48("100398") ? i + NUM.ONE < valuesStr.length || valuesStr[i + NUM.ONE] === quoteChar : stryMutAct_9fa48("100397") ? false : stryMutAct_9fa48("100396") ? true : (stryCov_9fa48("100396", "100397", "100398"), (stryMutAct_9fa48("100401") ? i + NUM.ONE >= valuesStr.length : stryMutAct_9fa48("100400") ? i + NUM.ONE <= valuesStr.length : stryMutAct_9fa48("100399") ? true : (stryCov_9fa48("100399", "100400", "100401"), (stryMutAct_9fa48("100402") ? i - NUM.ONE : (stryCov_9fa48("100402"), i + NUM.ONE)) < valuesStr.length)) && (stryMutAct_9fa48("100404") ? valuesStr[i + NUM.ONE] !== quoteChar : stryMutAct_9fa48("100403") ? true : (stryCov_9fa48("100403", "100404"), valuesStr[stryMutAct_9fa48("100405") ? i - NUM.ONE : (stryCov_9fa48("100405"), i + NUM.ONE)] === quoteChar)))) {
                if (stryMutAct_9fa48("100406")) {
                  {}
                } else {
                  stryCov_9fa48("100406");
                  stryMutAct_9fa48("100407") ? current -= char : (stryCov_9fa48("100407"), current += char);
                  stryMutAct_9fa48("100408") ? i -= NUM.ONE : (stryCov_9fa48("100408"), i += NUM.ONE); // Skip next quote
                }
              } else {
                if (stryMutAct_9fa48("100409")) {
                  {}
                } else {
                  stryCov_9fa48("100409");
                  inQuote = stryMutAct_9fa48("100410") ? true : (stryCov_9fa48("100410"), false);
                  quoteChar = null;
                }
              }
            }
          } else if (stryMutAct_9fa48("100413") ? !inQuote || char === PARTITION_SERVICE_SQL_FRAGMENT.COMMA : stryMutAct_9fa48("100412") ? false : stryMutAct_9fa48("100411") ? true : (stryCov_9fa48("100411", "100412", "100413"), (stryMutAct_9fa48("100414") ? inQuote : (stryCov_9fa48("100414"), !inQuote)) && (stryMutAct_9fa48("100416") ? char !== PARTITION_SERVICE_SQL_FRAGMENT.COMMA : stryMutAct_9fa48("100415") ? true : (stryCov_9fa48("100415", "100416"), char === PARTITION_SERVICE_SQL_FRAGMENT.COMMA)))) {
            if (stryMutAct_9fa48("100417")) {
              {}
            } else {
              stryCov_9fa48("100417");
              values.push(this.parseValue(stryMutAct_9fa48("100418") ? current : (stryCov_9fa48("100418"), current.trim())));
              current = STRING.EMPTY;
            }
          } else {
            if (stryMutAct_9fa48("100419")) {
              {}
            } else {
              stryCov_9fa48("100419");
              stryMutAct_9fa48("100420") ? current -= char : (stryCov_9fa48("100420"), current += char);
            }
          }
        }
      }

      // Don't forget the last value
      if (stryMutAct_9fa48("100423") ? current : stryMutAct_9fa48("100422") ? false : stryMutAct_9fa48("100421") ? true : (stryCov_9fa48("100421", "100422", "100423"), current.trim())) {
        if (stryMutAct_9fa48("100424")) {
          {}
        } else {
          stryCov_9fa48("100424");
          values.push(this.parseValue(stryMutAct_9fa48("100425") ? current : (stryCov_9fa48("100425"), current.trim())));
        }
      }
      return values;
    }
  }

  /**
   * Parse a single value from SQL.
   * @param {string} val - Value string.
   * @return {*} Parsed value.
   * @private
   */
  parseValue(val) {
    if (stryMutAct_9fa48("100426")) {
      {}
    } else {
      stryCov_9fa48("100426");
      if (stryMutAct_9fa48("100429") ? val.toUpperCase() !== PARTITION_SERVICE_SQL_FRAGMENT.NULL_VALUE : stryMutAct_9fa48("100428") ? false : stryMutAct_9fa48("100427") ? true : (stryCov_9fa48("100427", "100428", "100429"), (stryMutAct_9fa48("100430") ? val.toLowerCase() : (stryCov_9fa48("100430"), val.toUpperCase())) === PARTITION_SERVICE_SQL_FRAGMENT.NULL_VALUE)) {
        if (stryMutAct_9fa48("100431")) {
          {}
        } else {
          stryCov_9fa48("100431");
          return null;
        }
      }
      // Remove quotes
      if (stryMutAct_9fa48("100434") ? val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) && val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) && val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) && val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) : stryMutAct_9fa48("100433") ? false : stryMutAct_9fa48("100432") ? true : (stryCov_9fa48("100432", "100433", "100434"), (stryMutAct_9fa48("100436") ? val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) || val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) : stryMutAct_9fa48("100435") ? false : (stryCov_9fa48("100435", "100436"), (stryMutAct_9fa48("100437") ? val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) : (stryCov_9fa48("100437"), val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE))) && (stryMutAct_9fa48("100438") ? val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) : (stryCov_9fa48("100438"), val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE))))) || (stryMutAct_9fa48("100440") ? val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) || val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) : stryMutAct_9fa48("100439") ? false : (stryCov_9fa48("100439", "100440"), (stryMutAct_9fa48("100441") ? val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) : (stryCov_9fa48("100441"), val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE))) && (stryMutAct_9fa48("100442") ? val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) : (stryCov_9fa48("100442"), val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE))))))) {
        if (stryMutAct_9fa48("100443")) {
          {}
        } else {
          stryCov_9fa48("100443");
          return stryMutAct_9fa48("100444") ? val : (stryCov_9fa48("100444"), val.slice(NUM.ONE, stryMutAct_9fa48("100445") ? +NUM.ONE : (stryCov_9fa48("100445"), -NUM.ONE)));
        }
      }
      // Try to parse as number
      const num = Number(val);
      if (stryMutAct_9fa48("100448") ? false : stryMutAct_9fa48("100447") ? true : stryMutAct_9fa48("100446") ? isNaN(num) : (stryCov_9fa48("100446", "100447", "100448"), !isNaN(num))) {
        if (stryMutAct_9fa48("100449")) {
          {}
        } else {
          stryCov_9fa48("100449");
          return num;
        }
      }
      return val;
    }
  }

  /**
   * Fetch the stored row after an INSERT/UPSERT so CDC emits canonical data.
   * @param {string} tableName
   * @param {string|undefined} keyColumn
   * @param {*} keyValue
   * @param {Object} fallbackData
   * @return {Object}
   * @private
   */
  fetchInsertRow(tableName, keyColumn, keyValue, fallbackData) {
    if (stryMutAct_9fa48("100450")) {
      {}
    } else {
      stryCov_9fa48("100450");
      if (stryMutAct_9fa48("100453") ? (!keyColumn || keyValue === null || keyValue === undefined) && !this.db : stryMutAct_9fa48("100452") ? false : stryMutAct_9fa48("100451") ? true : (stryCov_9fa48("100451", "100452", "100453"), (stryMutAct_9fa48("100455") ? (!keyColumn || keyValue === null) && keyValue === undefined : stryMutAct_9fa48("100454") ? false : (stryCov_9fa48("100454", "100455"), (stryMutAct_9fa48("100457") ? !keyColumn && keyValue === null : stryMutAct_9fa48("100456") ? false : (stryCov_9fa48("100456", "100457"), (stryMutAct_9fa48("100458") ? keyColumn : (stryCov_9fa48("100458"), !keyColumn)) || (stryMutAct_9fa48("100460") ? keyValue !== null : stryMutAct_9fa48("100459") ? false : (stryCov_9fa48("100459", "100460"), keyValue === null)))) || (stryMutAct_9fa48("100462") ? keyValue !== undefined : stryMutAct_9fa48("100461") ? false : (stryCov_9fa48("100461", "100462"), keyValue === undefined)))) || (stryMutAct_9fa48("100463") ? this.db : (stryCov_9fa48("100463"), !this.db)))) {
        if (stryMutAct_9fa48("100464")) {
          {}
        } else {
          stryCov_9fa48("100464");
          return fallbackData;
        }
      }
      try {
        if (stryMutAct_9fa48("100465")) {
          {}
        } else {
          stryCov_9fa48("100465");
          const stmt = this.db.prepare(stryMutAct_9fa48("100466") ? `` : (stryCov_9fa48("100466"), `SELECT * FROM ${tableName} WHERE ${keyColumn} = ?`));
          const row = stmt.get(keyValue);
          if (stryMutAct_9fa48("100468") ? false : stryMutAct_9fa48("100467") ? true : (stryCov_9fa48("100467", "100468"), row)) {
            if (stryMutAct_9fa48("100469")) {
              {}
            } else {
              stryCov_9fa48("100469");
              if (stryMutAct_9fa48("100472") ? tableName === SYSTEM_TABLE_NAME.LOGS : stryMutAct_9fa48("100471") ? false : stryMutAct_9fa48("100470") ? true : (stryCov_9fa48("100470", "100471", "100472"), tableName !== SYSTEM_TABLE_NAME.LOGS)) {
                if (stryMutAct_9fa48("100473")) {
                  {}
                } else {
                  stryCov_9fa48("100473");
                  this.logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_INSERT_ROW, stryMutAct_9fa48("100474") ? {} : (stryCov_9fa48("100474"), {
                    tableName,
                    rowKeys: Object.keys(row)
                  }));
                }
              }
              return row;
            }
          }
        }
      } catch (err) {
        if (stryMutAct_9fa48("100475")) {
          {}
        } else {
          stryCov_9fa48("100475");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_INSERT_FAILED, stryMutAct_9fa48("100476") ? {} : (stryCov_9fa48("100476"), {
            tableName,
            error: err.message
          }));
          throw err;
        }
      }
      return fallbackData;
    }
  }

  /**
   * Fetch the stored row after an UPDATE so CDC emits canonical data.
   * @param {string} tableName
   * @param {Object} whereClause
   * @return {Object|null}
   * @private
   */
  fetchUpdatedRow(tableName, whereClause) {
    if (stryMutAct_9fa48("100477")) {
      {}
    } else {
      stryCov_9fa48("100477");
      if (stryMutAct_9fa48("100480") ? (!this.db || !whereClause || typeof whereClause !== TYPEOF.OBJECT) && Object.keys(whereClause).length === NUM.ZERO : stryMutAct_9fa48("100479") ? false : stryMutAct_9fa48("100478") ? true : (stryCov_9fa48("100478", "100479", "100480"), (stryMutAct_9fa48("100482") ? (!this.db || !whereClause) && typeof whereClause !== TYPEOF.OBJECT : stryMutAct_9fa48("100481") ? false : (stryCov_9fa48("100481", "100482"), (stryMutAct_9fa48("100484") ? !this.db && !whereClause : stryMutAct_9fa48("100483") ? false : (stryCov_9fa48("100483", "100484"), (stryMutAct_9fa48("100485") ? this.db : (stryCov_9fa48("100485"), !this.db)) || (stryMutAct_9fa48("100486") ? whereClause : (stryCov_9fa48("100486"), !whereClause)))) || (stryMutAct_9fa48("100488") ? typeof whereClause === TYPEOF.OBJECT : stryMutAct_9fa48("100487") ? false : (stryCov_9fa48("100487", "100488"), typeof whereClause !== TYPEOF.OBJECT)))) || (stryMutAct_9fa48("100490") ? Object.keys(whereClause).length !== NUM.ZERO : stryMutAct_9fa48("100489") ? false : (stryCov_9fa48("100489", "100490"), Object.keys(whereClause).length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("100491")) {
          {}
        } else {
          stryCov_9fa48("100491");
          return null;
        }
      }
      const entries = stryMutAct_9fa48("100492") ? Object.entries(whereClause) : (stryCov_9fa48("100492"), Object.entries(whereClause).filter(stryMutAct_9fa48("100493") ? () => undefined : (stryCov_9fa48("100493"), ([_key, value]) => stryMutAct_9fa48("100496") ? value !== null || value !== undefined : stryMutAct_9fa48("100495") ? false : stryMutAct_9fa48("100494") ? true : (stryCov_9fa48("100494", "100495", "100496"), (stryMutAct_9fa48("100498") ? value === null : stryMutAct_9fa48("100497") ? true : (stryCov_9fa48("100497", "100498"), value !== null)) && (stryMutAct_9fa48("100500") ? value === undefined : stryMutAct_9fa48("100499") ? true : (stryCov_9fa48("100499", "100500"), value !== undefined))))));
      if (stryMutAct_9fa48("100503") ? entries.length !== NUM.ZERO : stryMutAct_9fa48("100502") ? false : stryMutAct_9fa48("100501") ? true : (stryCov_9fa48("100501", "100502", "100503"), entries.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("100504")) {
          {}
        } else {
          stryCov_9fa48("100504");
          return null;
        }
      }
      if (stryMutAct_9fa48("100507") ? tableName === SYSTEM_TABLE_NAME.LOGS : stryMutAct_9fa48("100506") ? false : stryMutAct_9fa48("100505") ? true : (stryCov_9fa48("100505", "100506", "100507"), tableName !== SYSTEM_TABLE_NAME.LOGS)) {
        if (stryMutAct_9fa48("100508")) {
          {}
        } else {
          stryCov_9fa48("100508");
          const [keyColumn, keyValue] = entries[NUM.ZERO];
          this.logger.info(PARTITION_SERVICE_LOG_MSG.FETCHING_UPDATE_ROW, stryMutAct_9fa48("100509") ? {} : (stryCov_9fa48("100509"), {
            tableName,
            keyColumn,
            keyValue
          }));
        }
      }
      const whereSql = entries.map(stryMutAct_9fa48("100510") ? () => undefined : (stryCov_9fa48("100510"), ([key]) => stryMutAct_9fa48("100511") ? `` : (stryCov_9fa48("100511"), `${key} = ?`))).join(stryMutAct_9fa48("100512") ? "" : (stryCov_9fa48("100512"), ' AND '));
      const whereValues = entries.map(stryMutAct_9fa48("100513") ? () => undefined : (stryCov_9fa48("100513"), ([_key, value]) => value));
      try {
        if (stryMutAct_9fa48("100514")) {
          {}
        } else {
          stryCov_9fa48("100514");
          const stmt = this.db.prepare(stryMutAct_9fa48("100515") ? `` : (stryCov_9fa48("100515"), `SELECT * FROM ${tableName} WHERE ${whereSql}`));
          const row = stmt.get(...whereValues);
          if (stryMutAct_9fa48("100517") ? false : stryMutAct_9fa48("100516") ? true : (stryCov_9fa48("100516", "100517"), row)) {
            if (stryMutAct_9fa48("100518")) {
              {}
            } else {
              stryCov_9fa48("100518");
              if (stryMutAct_9fa48("100521") ? tableName === SYSTEM_TABLE_NAME.LOGS : stryMutAct_9fa48("100520") ? false : stryMutAct_9fa48("100519") ? true : (stryCov_9fa48("100519", "100520", "100521"), tableName !== SYSTEM_TABLE_NAME.LOGS)) {
                if (stryMutAct_9fa48("100522")) {
                  {}
                } else {
                  stryCov_9fa48("100522");
                  this.logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_UPDATE_ROW, stryMutAct_9fa48("100523") ? {} : (stryCov_9fa48("100523"), {
                    tableName,
                    rowKeys: Object.keys(row)
                  }));
                }
              }
              return row;
            }
          }
          if (stryMutAct_9fa48("100526") ? tableName === SYSTEM_TABLE_NAME.LOGS : stryMutAct_9fa48("100525") ? false : stryMutAct_9fa48("100524") ? true : (stryCov_9fa48("100524", "100525", "100526"), tableName !== SYSTEM_TABLE_NAME.LOGS)) {
            if (stryMutAct_9fa48("100527")) {
              {}
            } else {
              stryCov_9fa48("100527");
              const [keyColumn, keyValue] = entries[NUM.ZERO];
              this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_NO_ROW_UPDATE, stryMutAct_9fa48("100528") ? {} : (stryCov_9fa48("100528"), {
                tableName,
                keyColumn,
                keyValue
              }));
            }
          }
        }
      } catch (err) {
        if (stryMutAct_9fa48("100529")) {
          {}
        } else {
          stryCov_9fa48("100529");
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_UPDATE_FAILED, stryMutAct_9fa48("100530") ? {} : (stryCov_9fa48("100530"), {
            tableName,
            error: err.message
          }));
          throw err;
        }
      }
      return null;
    }
  }
}
export { PartitionCDCGenerator };