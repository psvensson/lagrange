/**
 * Partition Resolver - Routes queries to appropriate partitions.
 * Implements partition resolution based on PRIMARY KEY filters.
 * Requirements: 20.6, 20.7
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
import { LoggingService } from '../logging/logging-service.js';
import { NUM, TABLES, TYPEOF } from '../constants/index.js';
import { QUERY_AST_NODE, QUERY_DEFAULT_VALUE, QUERY_LOG_MSG, QUERY_OPERATOR, QUERY_SUBSYSTEM } from './query-constants.js';
import { DISTRIBUTED_PREDICATE_SHAPE as PREDICATE_SHAPE } from './distributed/distributed-query-plan-constants.js';
const KEY_CONDITION_TYPE = Object.freeze(stryMutAct_9fa48("113437") ? {} : (stryCov_9fa48("113437"), {
  EQUALS: stryMutAct_9fa48("113438") ? "" : (stryCov_9fa48("113438"), 'equals'),
  RANGE: stryMutAct_9fa48("113439") ? "" : (stryCov_9fa48("113439"), 'range'),
  IN: stryMutAct_9fa48("113440") ? "" : (stryCov_9fa48("113440"), 'in')
}));
const UNARY_OPERATOR = Object.freeze(stryMutAct_9fa48("113441") ? {} : (stryCov_9fa48("113441"), {
  PLUS: stryMutAct_9fa48("113442") ? "" : (stryCov_9fa48("113442"), '+'),
  MINUS: stryMutAct_9fa48("113443") ? "" : (stryCov_9fa48("113443"), '-')
}));

/**
 * PartitionResolver resolves queries to relevant partitions based on
 * WHERE clause conditions on the PRIMARY KEY.
 */
class PartitionResolver {
  /**
   * Create a new partition resolver.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache for partition lookup.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("113444")) {
      {}
    } else {
      stryCov_9fa48("113444");
      this.systemCache = stryMutAct_9fa48("113447") ? options.systemCache && null : stryMutAct_9fa48("113446") ? false : stryMutAct_9fa48("113445") ? true : (stryCov_9fa48("113445", "113446", "113447"), options.systemCache || null);
      this.logger = this.initLogger();
      this.lastResolutionInfo = null;
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("113448")) {
      {}
    } else {
      stryCov_9fa48("113448");
      try {
        if (stryMutAct_9fa48("113449")) {
          {}
        } else {
          stryCov_9fa48("113449");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("113451") ? false : stryMutAct_9fa48("113450") ? true : (stryCov_9fa48("113450", "113451"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("113452")) {
              {}
            } else {
              stryCov_9fa48("113452");
              return loggingService.forSubsystem(QUERY_SUBSYSTEM.PARTITION_RESOLVER);
            }
          }
        }
      } catch (_logErr) {
        // Logging not available — fall through to console
      }
      return console;
    }
  }

  /**
   * Set the system cache.
   * @param {Object} cache - System table cache.
   */
  setSystemCache(cache) {
    if (stryMutAct_9fa48("113453")) {
      {}
    } else {
      stryCov_9fa48("113453");
      this.systemCache = cache;
    }
  }

  /**
   * Resolve partitions for a query.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - Parsed WHERE clause AST.
   * @param {Array} partitions - Available partitions for the table.
   * @return {Array} Array of partition IDs to query.
   */
  resolvePartitions(tableName, whereClause, partitions, options = {}) {
    if (stryMutAct_9fa48("113454")) {
      {}
    } else {
      stryCov_9fa48("113454");
      if (stryMutAct_9fa48("113457") ? !partitions && partitions.length === NUM.ZERO : stryMutAct_9fa48("113456") ? false : stryMutAct_9fa48("113455") ? true : (stryCov_9fa48("113455", "113456", "113457"), (stryMutAct_9fa48("113458") ? partitions : (stryCov_9fa48("113458"), !partitions)) || (stryMutAct_9fa48("113460") ? partitions.length !== NUM.ZERO : stryMutAct_9fa48("113459") ? false : (stryCov_9fa48("113459", "113460"), partitions.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("113461")) {
          {}
        } else {
          stryCov_9fa48("113461");
          this.logger.warn(QUERY_LOG_MSG.NO_PARTITIONS_FOR_TABLE, stryMutAct_9fa48("113462") ? {} : (stryCov_9fa48("113462"), {
            tableName
          }));
          return stryMutAct_9fa48("113463") ? ["Stryker was here"] : (stryCov_9fa48("113463"), []);
        }
      }
      const resolutionContext = this.createResolutionContext(options);
      const tableInfo = this.getTableInfo(tableName);
      const primaryKeyColumns = this.resolvePrimaryKeyColumns(tableInfo, options);
      if (stryMutAct_9fa48("113467") ? primaryKeyColumns.length <= 1 : stryMutAct_9fa48("113466") ? primaryKeyColumns.length >= 1 : stryMutAct_9fa48("113465") ? false : stryMutAct_9fa48("113464") ? true : (stryCov_9fa48("113464", "113465", "113466", "113467"), primaryKeyColumns.length > 1)) {
        if (stryMutAct_9fa48("113468")) {
          {}
        } else {
          stryCov_9fa48("113468");
          const compositeResolution = this.resolveCompositeKeyPartitions(whereClause, primaryKeyColumns, partitions, resolutionContext);
          this.lastResolutionInfo = Object.freeze(stryMutAct_9fa48("113469") ? {} : (stryCov_9fa48("113469"), {
            tableName,
            predicateShape: compositeResolution.predicateShape,
            keyColumns: primaryKeyColumns,
            partitionCount: compositeResolution.partitionIds.length
          }));
          return compositeResolution.partitionIds;
        }
      }
      const primaryKey = stryMutAct_9fa48("113472") ? primaryKeyColumns[NUM.ZERO] && QUERY_DEFAULT_VALUE.PRIMARY_KEY : stryMutAct_9fa48("113471") ? false : stryMutAct_9fa48("113470") ? true : (stryCov_9fa48("113470", "113471", "113472"), primaryKeyColumns[NUM.ZERO] || QUERY_DEFAULT_VALUE.PRIMARY_KEY);

      // Extract key conditions from WHERE clause
      const keyConditions = this.extractKeyConditions(whereClause, primaryKey, resolutionContext);
      if (stryMutAct_9fa48("113475") ? false : stryMutAct_9fa48("113474") ? true : stryMutAct_9fa48("113473") ? keyConditions : (stryCov_9fa48("113473", "113474", "113475"), !keyConditions)) {
        if (stryMutAct_9fa48("113476")) {
          {}
        } else {
          stryCov_9fa48("113476");
          // No PRIMARY KEY filter - scatter-gather to all partitions
          this.logger.debug(QUERY_LOG_MSG.NO_KEY_CONDITIONS, stryMutAct_9fa48("113477") ? {} : (stryCov_9fa48("113477"), {
            tableName,
            partitionCount: partitions.length
          }));
          const partitionIds = partitions.map(stryMutAct_9fa48("113478") ? () => undefined : (stryCov_9fa48("113478"), partition => stryMutAct_9fa48("113481") ? partition.partition_id && partition.partitionId : stryMutAct_9fa48("113480") ? false : stryMutAct_9fa48("113479") ? true : (stryCov_9fa48("113479", "113480", "113481"), partition.partition_id || partition.partitionId)));
          this.lastResolutionInfo = Object.freeze(stryMutAct_9fa48("113482") ? {} : (stryCov_9fa48("113482"), {
            tableName,
            predicateShape: PREDICATE_SHAPE.SCATTER,
            keyColumns: primaryKeyColumns,
            partitionCount: partitionIds.length
          }));
          return partitionIds;
        }
      }

      // Find partitions whose ranges overlap with query conditions
      const matchingPartitions = this.findMatchingPartitions(partitions, keyConditions);
      this.logger.debug(QUERY_LOG_MSG.RESOLVED_PARTITIONS, stryMutAct_9fa48("113483") ? {} : (stryCov_9fa48("113483"), {
        tableName,
        keyConditions,
        matchingCount: matchingPartitions.length,
        totalPartitions: partitions.length
      }));
      const partitionIds = matchingPartitions.map(stryMutAct_9fa48("113484") ? () => undefined : (stryCov_9fa48("113484"), partition => stryMutAct_9fa48("113487") ? partition.partition_id && partition.partitionId : stryMutAct_9fa48("113486") ? false : stryMutAct_9fa48("113485") ? true : (stryCov_9fa48("113485", "113486", "113487"), partition.partition_id || partition.partitionId)));
      this.lastResolutionInfo = Object.freeze(stryMutAct_9fa48("113488") ? {} : (stryCov_9fa48("113488"), {
        tableName,
        predicateShape: stryMutAct_9fa48("113491") ? keyConditions.predicateShape && PREDICATE_SHAPE.SCATTER : stryMutAct_9fa48("113490") ? false : stryMutAct_9fa48("113489") ? true : (stryCov_9fa48("113489", "113490", "113491"), keyConditions.predicateShape || PREDICATE_SHAPE.SCATTER),
        keyColumns: primaryKeyColumns,
        partitionCount: partitionIds.length
      }));
      return partitionIds;
    }
  }

  /**
   * Resolve key-column metadata for routing.
   * @param {Object|null} tableInfo - Table metadata row.
   * @param {Object} options - Resolve options.
   * @return {string[]} Ordered key column names.
   * @private
   */
  resolvePrimaryKeyColumns(tableInfo, options) {
    if (stryMutAct_9fa48("113492")) {
      {}
    } else {
      stryCov_9fa48("113492");
      if (stryMutAct_9fa48("113495") ? Array.isArray(options.keyColumns) || options.keyColumns.length > NUM.ZERO : stryMutAct_9fa48("113494") ? false : stryMutAct_9fa48("113493") ? true : (stryCov_9fa48("113493", "113494", "113495"), Array.isArray(options.keyColumns) && (stryMutAct_9fa48("113498") ? options.keyColumns.length <= NUM.ZERO : stryMutAct_9fa48("113497") ? options.keyColumns.length >= NUM.ZERO : stryMutAct_9fa48("113496") ? true : (stryCov_9fa48("113496", "113497", "113498"), options.keyColumns.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("113499")) {
          {}
        } else {
          stryCov_9fa48("113499");
          return options.keyColumns;
        }
      }
      const primaryKey = stryMutAct_9fa48("113502") ? tableInfo?.primaryKey && tableInfo?.primary_key : stryMutAct_9fa48("113501") ? false : stryMutAct_9fa48("113500") ? true : (stryCov_9fa48("113500", "113501", "113502"), (stryMutAct_9fa48("113503") ? tableInfo.primaryKey : (stryCov_9fa48("113503"), tableInfo?.primaryKey)) || (stryMutAct_9fa48("113504") ? tableInfo.primary_key : (stryCov_9fa48("113504"), tableInfo?.primary_key)));
      if (stryMutAct_9fa48("113507") ? Array.isArray(primaryKey) || primaryKey.length > NUM.ZERO : stryMutAct_9fa48("113506") ? false : stryMutAct_9fa48("113505") ? true : (stryCov_9fa48("113505", "113506", "113507"), Array.isArray(primaryKey) && (stryMutAct_9fa48("113510") ? primaryKey.length <= NUM.ZERO : stryMutAct_9fa48("113509") ? primaryKey.length >= NUM.ZERO : stryMutAct_9fa48("113508") ? true : (stryCov_9fa48("113508", "113509", "113510"), primaryKey.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("113511")) {
          {}
        } else {
          stryCov_9fa48("113511");
          return primaryKey;
        }
      }
      if (stryMutAct_9fa48("113514") ? typeof primaryKey === TYPEOF.STRING || primaryKey.length > NUM.ZERO : stryMutAct_9fa48("113513") ? false : stryMutAct_9fa48("113512") ? true : (stryCov_9fa48("113512", "113513", "113514"), (stryMutAct_9fa48("113516") ? typeof primaryKey !== TYPEOF.STRING : stryMutAct_9fa48("113515") ? true : (stryCov_9fa48("113515", "113516"), typeof primaryKey === TYPEOF.STRING)) && (stryMutAct_9fa48("113519") ? primaryKey.length <= NUM.ZERO : stryMutAct_9fa48("113518") ? primaryKey.length >= NUM.ZERO : stryMutAct_9fa48("113517") ? true : (stryCov_9fa48("113517", "113518", "113519"), primaryKey.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("113520")) {
          {}
        } else {
          stryCov_9fa48("113520");
          return stryMutAct_9fa48("113521") ? [] : (stryCov_9fa48("113521"), [primaryKey]);
        }
      }
      return stryMutAct_9fa48("113522") ? [] : (stryCov_9fa48("113522"), [QUERY_DEFAULT_VALUE.PRIMARY_KEY]);
    }
  }

  /**
   * Create an immutable resolution context.
   * @param {Object} options - Resolver options.
   * @return {Object} Resolution context.
   * @private
   */
  createResolutionContext(options) {
    if (stryMutAct_9fa48("113523")) {
      {}
    } else {
      stryCov_9fa48("113523");
      const params = Array.isArray(options.params) ? options.params : stryMutAct_9fa48("113524") ? ["Stryker was here"] : (stryCov_9fa48("113524"), []);
      const tableAliases = Array.isArray(options.tableAliases) ? options.tableAliases.map(stryMutAct_9fa48("113525") ? () => undefined : (stryCov_9fa48("113525"), alias => stryMutAct_9fa48("113526") ? String(alias).toUpperCase() : (stryCov_9fa48("113526"), String(alias).toLowerCase()))) : null;
      return stryMutAct_9fa48("113527") ? {} : (stryCov_9fa48("113527"), {
        params,
        tableAliases,
        parameterState: stryMutAct_9fa48("113528") ? {} : (stryCov_9fa48("113528"), {
          nextIndex: NUM.ZERO
        })
      });
    }
  }

  /**
   * Resolve composite-key equality predicates when all key columns are bound.
   * @param {Object} whereClause - WHERE clause AST.
   * @param {string[]} keyColumns - Composite key columns.
   * @param {Object[]} partitions - Candidate partitions.
   * @param {Object} resolutionContext - Resolution context.
   * @return {{partitionIds: string[], predicateShape: string}}
   * @private
   */
  resolveCompositeKeyPartitions(whereClause, keyColumns, partitions, resolutionContext) {
    if (stryMutAct_9fa48("113529")) {
      {}
    } else {
      stryCov_9fa48("113529");
      const values = stryMutAct_9fa48("113530") ? ["Stryker was here"] : (stryCov_9fa48("113530"), []);
      for (const keyColumn of keyColumns) {
        if (stryMutAct_9fa48("113531")) {
          {}
        } else {
          stryCov_9fa48("113531");
          const keyConditions = this.extractKeyConditions(whereClause, keyColumn, resolutionContext);
          if (stryMutAct_9fa48("113534") ? (!keyConditions || keyConditions.type !== KEY_CONDITION_TYPE.EQUALS) && keyConditions.values.length !== 1 : stryMutAct_9fa48("113533") ? false : stryMutAct_9fa48("113532") ? true : (stryCov_9fa48("113532", "113533", "113534"), (stryMutAct_9fa48("113536") ? !keyConditions && keyConditions.type !== KEY_CONDITION_TYPE.EQUALS : stryMutAct_9fa48("113535") ? false : (stryCov_9fa48("113535", "113536"), (stryMutAct_9fa48("113537") ? keyConditions : (stryCov_9fa48("113537"), !keyConditions)) || (stryMutAct_9fa48("113539") ? keyConditions.type === KEY_CONDITION_TYPE.EQUALS : stryMutAct_9fa48("113538") ? false : (stryCov_9fa48("113538", "113539"), keyConditions.type !== KEY_CONDITION_TYPE.EQUALS)))) || (stryMutAct_9fa48("113541") ? keyConditions.values.length === 1 : stryMutAct_9fa48("113540") ? false : (stryCov_9fa48("113540", "113541"), keyConditions.values.length !== 1)))) {
            if (stryMutAct_9fa48("113542")) {
              {}
            } else {
              stryCov_9fa48("113542");
              return stryMutAct_9fa48("113543") ? {} : (stryCov_9fa48("113543"), {
                partitionIds: partitions.map(stryMutAct_9fa48("113544") ? () => undefined : (stryCov_9fa48("113544"), partition => stryMutAct_9fa48("113547") ? partition.partition_id && partition.partitionId : stryMutAct_9fa48("113546") ? false : stryMutAct_9fa48("113545") ? true : (stryCov_9fa48("113545", "113546", "113547"), partition.partition_id || partition.partitionId))),
                predicateShape: PREDICATE_SHAPE.SCATTER
              });
            }
          }
          values.push(keyConditions.values[NUM.ZERO]);
        }
      }
      const serializedCompositeKey = JSON.stringify(values);
      const partitionId = this.resolvePartitionForKey(null, serializedCompositeKey, partitions);
      if (stryMutAct_9fa48("113550") ? false : stryMutAct_9fa48("113549") ? true : stryMutAct_9fa48("113548") ? partitionId : (stryCov_9fa48("113548", "113549", "113550"), !partitionId)) {
        if (stryMutAct_9fa48("113551")) {
          {}
        } else {
          stryCov_9fa48("113551");
          return stryMutAct_9fa48("113552") ? {} : (stryCov_9fa48("113552"), {
            partitionIds: stryMutAct_9fa48("113553") ? ["Stryker was here"] : (stryCov_9fa48("113553"), []),
            predicateShape: PREDICATE_SHAPE.EQ
          });
        }
      }
      return stryMutAct_9fa48("113554") ? {} : (stryCov_9fa48("113554"), {
        partitionIds: stryMutAct_9fa48("113555") ? [] : (stryCov_9fa48("113555"), [partitionId]),
        predicateShape: PREDICATE_SHAPE.EQ
      });
    }
  }

  /**
   * Get table information from system cache.
   * @param {string} tableName - Table name.
   * @return {Object|null} Table info or null.
   * @private
   */
  getTableInfo(tableName) {
    if (stryMutAct_9fa48("113556")) {
      {}
    } else {
      stryCov_9fa48("113556");
      if (stryMutAct_9fa48("113559") ? false : stryMutAct_9fa48("113558") ? true : stryMutAct_9fa48("113557") ? this.systemCache : (stryCov_9fa48("113557", "113558", "113559"), !this.systemCache)) {
        if (stryMutAct_9fa48("113560")) {
          {}
        } else {
          stryCov_9fa48("113560");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("113561")) {
          {}
        } else {
          stryCov_9fa48("113561");
          if (stryMutAct_9fa48("113564") ? typeof this.systemCache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("113563") ? false : stryMutAct_9fa48("113562") ? true : (stryCov_9fa48("113562", "113563", "113564"), typeof this.systemCache.get === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("113565")) {
              {}
            } else {
              stryCov_9fa48("113565");
              const byPrimaryKey = this.systemCache.get(TABLES.TABLES, tableName);
              if (stryMutAct_9fa48("113567") ? false : stryMutAct_9fa48("113566") ? true : (stryCov_9fa48("113566", "113567"), byPrimaryKey)) {
                if (stryMutAct_9fa48("113568")) {
                  {}
                } else {
                  stryCov_9fa48("113568");
                  return byPrimaryKey;
                }
              }
            }
          }
          if (stryMutAct_9fa48("113571") ? typeof this.systemCache.find !== TYPEOF.FUNCTION : stryMutAct_9fa48("113570") ? false : stryMutAct_9fa48("113569") ? true : (stryCov_9fa48("113569", "113570", "113571"), typeof this.systemCache.find === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("113572")) {
              {}
            } else {
              stryCov_9fa48("113572");
              const found = this.systemCache.find(TABLES.TABLES, stryMutAct_9fa48("113573") ? () => undefined : (stryCov_9fa48("113573"), t => stryMutAct_9fa48("113576") ? t.table_name === tableName && t.tableName === tableName : stryMutAct_9fa48("113575") ? false : stryMutAct_9fa48("113574") ? true : (stryCov_9fa48("113574", "113575", "113576"), (stryMutAct_9fa48("113578") ? t.table_name !== tableName : stryMutAct_9fa48("113577") ? false : (stryCov_9fa48("113577", "113578"), t.table_name === tableName)) || (stryMutAct_9fa48("113580") ? t.tableName !== tableName : stryMutAct_9fa48("113579") ? false : (stryCov_9fa48("113579", "113580"), t.tableName === tableName)))));
              if (stryMutAct_9fa48("113582") ? false : stryMutAct_9fa48("113581") ? true : (stryCov_9fa48("113581", "113582"), found)) {
                if (stryMutAct_9fa48("113583")) {
                  {}
                } else {
                  stryCov_9fa48("113583");
                  return found;
                }
              }
            }
          }
          if (stryMutAct_9fa48("113586") ? typeof this.systemCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("113585") ? false : stryMutAct_9fa48("113584") ? true : (stryCov_9fa48("113584", "113585", "113586"), typeof this.systemCache.getAll === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("113587")) {
              {}
            } else {
              stryCov_9fa48("113587");
              const tables = stryMutAct_9fa48("113590") ? this.systemCache.getAll(TABLES.TABLES) && [] : stryMutAct_9fa48("113589") ? false : stryMutAct_9fa48("113588") ? true : (stryCov_9fa48("113588", "113589", "113590"), this.systemCache.getAll(TABLES.TABLES) || (stryMutAct_9fa48("113591") ? ["Stryker was here"] : (stryCov_9fa48("113591"), [])));
              return stryMutAct_9fa48("113594") ? tables.find(table => table.table_name === tableName || table.tableName === tableName || table.table_id === tableName || table.tableId === tableName) && null : stryMutAct_9fa48("113593") ? false : stryMutAct_9fa48("113592") ? true : (stryCov_9fa48("113592", "113593", "113594"), tables.find(stryMutAct_9fa48("113595") ? () => undefined : (stryCov_9fa48("113595"), table => stryMutAct_9fa48("113598") ? (table.table_name === tableName || table.tableName === tableName || table.table_id === tableName) && table.tableId === tableName : stryMutAct_9fa48("113597") ? false : stryMutAct_9fa48("113596") ? true : (stryCov_9fa48("113596", "113597", "113598"), (stryMutAct_9fa48("113600") ? (table.table_name === tableName || table.tableName === tableName) && table.table_id === tableName : stryMutAct_9fa48("113599") ? false : (stryCov_9fa48("113599", "113600"), (stryMutAct_9fa48("113602") ? table.table_name === tableName && table.tableName === tableName : stryMutAct_9fa48("113601") ? false : (stryCov_9fa48("113601", "113602"), (stryMutAct_9fa48("113604") ? table.table_name !== tableName : stryMutAct_9fa48("113603") ? false : (stryCov_9fa48("113603", "113604"), table.table_name === tableName)) || (stryMutAct_9fa48("113606") ? table.tableName !== tableName : stryMutAct_9fa48("113605") ? false : (stryCov_9fa48("113605", "113606"), table.tableName === tableName)))) || (stryMutAct_9fa48("113608") ? table.table_id !== tableName : stryMutAct_9fa48("113607") ? false : (stryCov_9fa48("113607", "113608"), table.table_id === tableName)))) || (stryMutAct_9fa48("113610") ? table.tableId !== tableName : stryMutAct_9fa48("113609") ? false : (stryCov_9fa48("113609", "113610"), table.tableId === tableName))))) || null);
            }
          }
        }
      } catch (_cacheErr) {
        // Cache not available
      }
      return null;
    }
  }

  /**
   * Extract PRIMARY KEY conditions from WHERE clause.
   * @param {Object} whereClause - Parsed WHERE clause AST.
   * @param {string} primaryKey - Primary key column name.
   * @return {Object|null} Key conditions or null if no key filter.
   * @private
   */
  extractKeyConditions(whereClause, primaryKey, resolutionContext) {
    if (stryMutAct_9fa48("113611")) {
      {}
    } else {
      stryCov_9fa48("113611");
      if (stryMutAct_9fa48("113614") ? false : stryMutAct_9fa48("113613") ? true : stryMutAct_9fa48("113612") ? whereClause : (stryCov_9fa48("113612", "113613", "113614"), !whereClause)) {
        if (stryMutAct_9fa48("113615")) {
          {}
        } else {
          stryCov_9fa48("113615");
          return null;
        }
      }
      const conditions = stryMutAct_9fa48("113616") ? {} : (stryCov_9fa48("113616"), {
        type: null,
        values: stryMutAct_9fa48("113617") ? ["Stryker was here"] : (stryCov_9fa48("113617"), []),
        low: null,
        high: null,
        lowInclusive: stryMutAct_9fa48("113618") ? false : (stryCov_9fa48("113618"), true),
        highInclusive: stryMutAct_9fa48("113619") ? true : (stryCov_9fa48("113619"), false),
        fromBetween: stryMutAct_9fa48("113620") ? true : (stryCov_9fa48("113620"), false),
        predicateShape: PREDICATE_SHAPE.SCATTER
      });
      const found = this.findKeyConditions(whereClause, primaryKey, conditions, resolutionContext);
      if (stryMutAct_9fa48("113622") ? false : stryMutAct_9fa48("113621") ? true : (stryCov_9fa48("113621", "113622"), found)) {
        if (stryMutAct_9fa48("113623")) {
          {}
        } else {
          stryCov_9fa48("113623");
          conditions.predicateShape = this.resolvePredicateShape(conditions);
        }
      }
      return found ? conditions : null;
    }
  }

  /**
   * Resolve predicate shape for diagnostics and explainability.
   * @param {Object} conditions - Key condition metadata.
   * @return {string} Predicate shape enum.
   * @private
   */
  resolvePredicateShape(conditions) {
    if (stryMutAct_9fa48("113624")) {
      {}
    } else {
      stryCov_9fa48("113624");
      if (stryMutAct_9fa48("113627") ? conditions.type !== KEY_CONDITION_TYPE.EQUALS : stryMutAct_9fa48("113626") ? false : stryMutAct_9fa48("113625") ? true : (stryCov_9fa48("113625", "113626", "113627"), conditions.type === KEY_CONDITION_TYPE.EQUALS)) {
        if (stryMutAct_9fa48("113628")) {
          {}
        } else {
          stryCov_9fa48("113628");
          return PREDICATE_SHAPE.EQ;
        }
      }
      if (stryMutAct_9fa48("113631") ? conditions.type !== KEY_CONDITION_TYPE.IN : stryMutAct_9fa48("113630") ? false : stryMutAct_9fa48("113629") ? true : (stryCov_9fa48("113629", "113630", "113631"), conditions.type === KEY_CONDITION_TYPE.IN)) {
        if (stryMutAct_9fa48("113632")) {
          {}
        } else {
          stryCov_9fa48("113632");
          return PREDICATE_SHAPE.IN;
        }
      }
      if (stryMutAct_9fa48("113635") ? conditions.type === KEY_CONDITION_TYPE.RANGE || conditions.fromBetween : stryMutAct_9fa48("113634") ? false : stryMutAct_9fa48("113633") ? true : (stryCov_9fa48("113633", "113634", "113635"), (stryMutAct_9fa48("113637") ? conditions.type !== KEY_CONDITION_TYPE.RANGE : stryMutAct_9fa48("113636") ? true : (stryCov_9fa48("113636", "113637"), conditions.type === KEY_CONDITION_TYPE.RANGE)) && conditions.fromBetween)) {
        if (stryMutAct_9fa48("113638")) {
          {}
        } else {
          stryCov_9fa48("113638");
          return PREDICATE_SHAPE.BETWEEN;
        }
      }
      if (stryMutAct_9fa48("113641") ? conditions.type !== KEY_CONDITION_TYPE.RANGE : stryMutAct_9fa48("113640") ? false : stryMutAct_9fa48("113639") ? true : (stryCov_9fa48("113639", "113640", "113641"), conditions.type === KEY_CONDITION_TYPE.RANGE)) {
        if (stryMutAct_9fa48("113642")) {
          {}
        } else {
          stryCov_9fa48("113642");
          return PREDICATE_SHAPE.RANGE;
        }
      }
      return PREDICATE_SHAPE.SCATTER;
    }
  }

  /**
   * Recursively find key conditions in expression.
   * @param {Object} expr - Expression AST.
   * @param {string} primaryKey - Primary key column name.
   * @param {Object} conditions - Conditions accumulator.
   * @return {boolean} True if key conditions found.
   * @private
   */
  findKeyConditions(expr, primaryKey, conditions, resolutionContext) {
    if (stryMutAct_9fa48("113643")) {
      {}
    } else {
      stryCov_9fa48("113643");
      if (stryMutAct_9fa48("113646") ? false : stryMutAct_9fa48("113645") ? true : stryMutAct_9fa48("113644") ? expr : (stryCov_9fa48("113644", "113645", "113646"), !expr)) return stryMutAct_9fa48("113647") ? true : (stryCov_9fa48("113647"), false);
      switch (expr.type) {
        case QUERY_AST_NODE.BINARY:
          if (stryMutAct_9fa48("113648")) {} else {
            stryCov_9fa48("113648");
            return this.handleBinaryExpr(expr, primaryKey, conditions, resolutionContext);
          }
        case QUERY_AST_NODE.IN:
          if (stryMutAct_9fa48("113649")) {} else {
            stryCov_9fa48("113649");
            return this.handleInExpr(expr, primaryKey, conditions, resolutionContext);
          }
        case QUERY_AST_NODE.BETWEEN:
          if (stryMutAct_9fa48("113650")) {} else {
            stryCov_9fa48("113650");
            return this.handleBetweenExpr(expr, primaryKey, conditions, resolutionContext);
          }
        default:
          if (stryMutAct_9fa48("113651")) {} else {
            stryCov_9fa48("113651");
            return stryMutAct_9fa48("113652") ? true : (stryCov_9fa48("113652"), false);
          }
      }
    }
  }

  /**
   * Handle binary expression for key extraction.
   * @param {Object} expr - Binary expression.
   * @param {string} primaryKey - Primary key column.
   * @param {Object} conditions - Conditions accumulator.
   * @return {boolean} True if key condition found.
   * @private
   */
  handleBinaryExpr(expr, primaryKey, conditions, resolutionContext) {
    if (stryMutAct_9fa48("113653")) {
      {}
    } else {
      stryCov_9fa48("113653");
      const {
        operator,
        left,
        right
      } = expr;

      // Handle AND - both sides may have key conditions
      if (stryMutAct_9fa48("113656") ? operator !== QUERY_OPERATOR.AND : stryMutAct_9fa48("113655") ? false : stryMutAct_9fa48("113654") ? true : (stryCov_9fa48("113654", "113655", "113656"), operator === QUERY_OPERATOR.AND)) {
        if (stryMutAct_9fa48("113657")) {
          {}
        } else {
          stryCov_9fa48("113657");
          const leftFound = this.findKeyConditions(left, primaryKey, conditions, resolutionContext);
          const rightFound = this.findKeyConditions(right, primaryKey, conditions, resolutionContext);
          return stryMutAct_9fa48("113660") ? leftFound && rightFound : stryMutAct_9fa48("113659") ? false : stryMutAct_9fa48("113658") ? true : (stryCov_9fa48("113658", "113659", "113660"), leftFound || rightFound);
        }
      }

      // Handle OR - need all branches to have key conditions for optimization
      if (stryMutAct_9fa48("113663") ? operator !== QUERY_OPERATOR.OR : stryMutAct_9fa48("113662") ? false : stryMutAct_9fa48("113661") ? true : (stryCov_9fa48("113661", "113662", "113663"), operator === QUERY_OPERATOR.OR)) {
        if (stryMutAct_9fa48("113664")) {
          {}
        } else {
          stryCov_9fa48("113664");
          // For OR, we can't easily optimize unless all branches are on the key
          // For now, return false to trigger scatter-gather
          return stryMutAct_9fa48("113665") ? true : (stryCov_9fa48("113665"), false);
        }
      }

      // Check if this is a comparison on the primary key
      const leftIsKey = this.isKeyColumn(left, primaryKey, resolutionContext);
      const rightIsKey = this.isKeyColumn(right, primaryKey, resolutionContext);
      const keyColumn = leftIsKey ? left : rightIsKey ? right : null;
      if (stryMutAct_9fa48("113668") ? false : stryMutAct_9fa48("113667") ? true : stryMutAct_9fa48("113666") ? keyColumn : (stryCov_9fa48("113666", "113667", "113668"), !keyColumn)) return stryMutAct_9fa48("113669") ? true : (stryCov_9fa48("113669"), false);
      const rawOperator = leftIsKey ? operator : this.invertComparisonOperator(operator);
      const valueExpr = (stryMutAct_9fa48("113672") ? keyColumn !== left : stryMutAct_9fa48("113671") ? false : stryMutAct_9fa48("113670") ? true : (stryCov_9fa48("113670", "113671", "113672"), keyColumn === left)) ? right : left;
      const value = this.extractLiteralValue(valueExpr, resolutionContext);
      if (stryMutAct_9fa48("113675") ? value !== undefined : stryMutAct_9fa48("113674") ? false : stryMutAct_9fa48("113673") ? true : (stryCov_9fa48("113673", "113674", "113675"), value === undefined)) return stryMutAct_9fa48("113676") ? true : (stryCov_9fa48("113676"), false);

      // Handle different operators
      switch (rawOperator) {
        case QUERY_OPERATOR.EQUALS:
          if (stryMutAct_9fa48("113677")) {} else {
            stryCov_9fa48("113677");
            conditions.type = KEY_CONDITION_TYPE.EQUALS;
            conditions.values.push(value);
            return stryMutAct_9fa48("113678") ? false : (stryCov_9fa48("113678"), true);
          }
        case QUERY_OPERATOR.LESS_THAN:
          if (stryMutAct_9fa48("113679")) {} else {
            stryCov_9fa48("113679");
            conditions.type = KEY_CONDITION_TYPE.RANGE;
            conditions.high = value;
            conditions.highInclusive = stryMutAct_9fa48("113680") ? true : (stryCov_9fa48("113680"), false);
            return stryMutAct_9fa48("113681") ? false : (stryCov_9fa48("113681"), true);
          }
        case QUERY_OPERATOR.LESS_THAN_OR_EQUAL:
          if (stryMutAct_9fa48("113682")) {} else {
            stryCov_9fa48("113682");
            conditions.type = KEY_CONDITION_TYPE.RANGE;
            conditions.high = value;
            conditions.highInclusive = stryMutAct_9fa48("113683") ? false : (stryCov_9fa48("113683"), true);
            return stryMutAct_9fa48("113684") ? false : (stryCov_9fa48("113684"), true);
          }
        case QUERY_OPERATOR.GREATER_THAN:
          if (stryMutAct_9fa48("113685")) {} else {
            stryCov_9fa48("113685");
            conditions.type = KEY_CONDITION_TYPE.RANGE;
            conditions.low = value;
            conditions.lowInclusive = stryMutAct_9fa48("113686") ? true : (stryCov_9fa48("113686"), false);
            return stryMutAct_9fa48("113687") ? false : (stryCov_9fa48("113687"), true);
          }
        case QUERY_OPERATOR.GREATER_THAN_OR_EQUAL:
          if (stryMutAct_9fa48("113688")) {} else {
            stryCov_9fa48("113688");
            conditions.type = KEY_CONDITION_TYPE.RANGE;
            conditions.low = value;
            conditions.lowInclusive = stryMutAct_9fa48("113689") ? false : (stryCov_9fa48("113689"), true);
            return stryMutAct_9fa48("113690") ? false : (stryCov_9fa48("113690"), true);
          }
        default:
          if (stryMutAct_9fa48("113691")) {} else {
            stryCov_9fa48("113691");
            return stryMutAct_9fa48("113692") ? true : (stryCov_9fa48("113692"), false);
          }
      }
    }
  }

  /**
   * Invert a comparison operator when key column is on the right side.
   * @param {string} operator - Original operator.
   * @return {string} Inverted operator.
   * @private
   */
  invertComparisonOperator(operator) {
    if (stryMutAct_9fa48("113693")) {
      {}
    } else {
      stryCov_9fa48("113693");
      switch (operator) {
        case QUERY_OPERATOR.LESS_THAN:
          if (stryMutAct_9fa48("113694")) {} else {
            stryCov_9fa48("113694");
            return QUERY_OPERATOR.GREATER_THAN;
          }
        case QUERY_OPERATOR.LESS_THAN_OR_EQUAL:
          if (stryMutAct_9fa48("113695")) {} else {
            stryCov_9fa48("113695");
            return QUERY_OPERATOR.GREATER_THAN_OR_EQUAL;
          }
        case QUERY_OPERATOR.GREATER_THAN:
          if (stryMutAct_9fa48("113696")) {} else {
            stryCov_9fa48("113696");
            return QUERY_OPERATOR.LESS_THAN;
          }
        case QUERY_OPERATOR.GREATER_THAN_OR_EQUAL:
          if (stryMutAct_9fa48("113697")) {} else {
            stryCov_9fa48("113697");
            return QUERY_OPERATOR.LESS_THAN_OR_EQUAL;
          }
        default:
          if (stryMutAct_9fa48("113698")) {} else {
            stryCov_9fa48("113698");
            return operator;
          }
      }
    }
  }

  /**
   * Handle IN expression for key extraction.
   * @param {Object} expr - IN expression.
   * @param {string} primaryKey - Primary key column.
   * @param {Object} conditions - Conditions accumulator.
   * @return {boolean} True if key condition found.
   * @private
   */
  handleInExpr(expr, primaryKey, conditions, resolutionContext) {
    if (stryMutAct_9fa48("113699")) {
      {}
    } else {
      stryCov_9fa48("113699");
      if (stryMutAct_9fa48("113702") ? false : stryMutAct_9fa48("113701") ? true : stryMutAct_9fa48("113700") ? this.isKeyColumn(expr.expression, primaryKey, resolutionContext) : (stryCov_9fa48("113700", "113701", "113702"), !this.isKeyColumn(expr.expression, primaryKey, resolutionContext))) {
        if (stryMutAct_9fa48("113703")) {
          {}
        } else {
          stryCov_9fa48("113703");
          return stryMutAct_9fa48("113704") ? true : (stryCov_9fa48("113704"), false);
        }
      }
      conditions.type = KEY_CONDITION_TYPE.IN;
      conditions.values = stryMutAct_9fa48("113705") ? expr.values.map(valueExpr => this.extractLiteralValue(valueExpr, resolutionContext)) : (stryCov_9fa48("113705"), expr.values.map(stryMutAct_9fa48("113706") ? () => undefined : (stryCov_9fa48("113706"), valueExpr => this.extractLiteralValue(valueExpr, resolutionContext))).filter(stryMutAct_9fa48("113707") ? () => undefined : (stryCov_9fa48("113707"), v => stryMutAct_9fa48("113710") ? v === undefined : stryMutAct_9fa48("113709") ? false : stryMutAct_9fa48("113708") ? true : (stryCov_9fa48("113708", "113709", "113710"), v !== undefined))));
      return stryMutAct_9fa48("113714") ? conditions.values.length <= NUM.ZERO : stryMutAct_9fa48("113713") ? conditions.values.length >= NUM.ZERO : stryMutAct_9fa48("113712") ? false : stryMutAct_9fa48("113711") ? true : (stryCov_9fa48("113711", "113712", "113713", "113714"), conditions.values.length > NUM.ZERO);
    }
  }

  /**
   * Handle BETWEEN expression for key extraction.
   * @param {Object} expr - BETWEEN expression.
   * @param {string} primaryKey - Primary key column.
   * @param {Object} conditions - Conditions accumulator.
   * @return {boolean} True if key condition found.
   * @private
   */
  handleBetweenExpr(expr, primaryKey, conditions, resolutionContext) {
    if (stryMutAct_9fa48("113715")) {
      {}
    } else {
      stryCov_9fa48("113715");
      if (stryMutAct_9fa48("113718") ? false : stryMutAct_9fa48("113717") ? true : stryMutAct_9fa48("113716") ? this.isKeyColumn(expr.expression, primaryKey, resolutionContext) : (stryCov_9fa48("113716", "113717", "113718"), !this.isKeyColumn(expr.expression, primaryKey, resolutionContext))) {
        if (stryMutAct_9fa48("113719")) {
          {}
        } else {
          stryCov_9fa48("113719");
          return stryMutAct_9fa48("113720") ? true : (stryCov_9fa48("113720"), false);
        }
      }
      const low = this.extractLiteralValue(expr.low, resolutionContext);
      const high = this.extractLiteralValue(expr.high, resolutionContext);
      if (stryMutAct_9fa48("113723") ? low === undefined && high === undefined : stryMutAct_9fa48("113722") ? false : stryMutAct_9fa48("113721") ? true : (stryCov_9fa48("113721", "113722", "113723"), (stryMutAct_9fa48("113725") ? low !== undefined : stryMutAct_9fa48("113724") ? false : (stryCov_9fa48("113724", "113725"), low === undefined)) || (stryMutAct_9fa48("113727") ? high !== undefined : stryMutAct_9fa48("113726") ? false : (stryCov_9fa48("113726", "113727"), high === undefined)))) {
        if (stryMutAct_9fa48("113728")) {
          {}
        } else {
          stryCov_9fa48("113728");
          return stryMutAct_9fa48("113729") ? true : (stryCov_9fa48("113729"), false);
        }
      }
      conditions.type = KEY_CONDITION_TYPE.RANGE;
      conditions.low = low;
      conditions.high = high;
      conditions.lowInclusive = stryMutAct_9fa48("113730") ? false : (stryCov_9fa48("113730"), true);
      conditions.highInclusive = stryMutAct_9fa48("113731") ? false : (stryCov_9fa48("113731"), true);
      conditions.fromBetween = stryMutAct_9fa48("113732") ? false : (stryCov_9fa48("113732"), true);
      return stryMutAct_9fa48("113733") ? false : (stryCov_9fa48("113733"), true);
    }
  }

  /**
   * Check if expression is a reference to the primary key column.
   * @param {Object} expr - Expression AST.
   * @param {string} primaryKey - Primary key column name.
   * @return {boolean} True if key column.
   * @private
   */
  isKeyColumn(expr, primaryKey, resolutionContext) {
    if (stryMutAct_9fa48("113734")) {
      {}
    } else {
      stryCov_9fa48("113734");
      if (stryMutAct_9fa48("113737") ? false : stryMutAct_9fa48("113736") ? true : stryMutAct_9fa48("113735") ? expr : (stryCov_9fa48("113735", "113736", "113737"), !expr)) return stryMutAct_9fa48("113738") ? true : (stryCov_9fa48("113738"), false);
      if (stryMutAct_9fa48("113741") ? expr.type !== QUERY_AST_NODE.COLUMN_REF : stryMutAct_9fa48("113740") ? false : stryMutAct_9fa48("113739") ? true : (stryCov_9fa48("113739", "113740", "113741"), expr.type === QUERY_AST_NODE.COLUMN_REF)) {
        if (stryMutAct_9fa48("113742")) {
          {}
        } else {
          stryCov_9fa48("113742");
          if (stryMutAct_9fa48("113745") ? expr.table || resolutionContext.tableAliases : stryMutAct_9fa48("113744") ? false : stryMutAct_9fa48("113743") ? true : (stryCov_9fa48("113743", "113744", "113745"), expr.table && resolutionContext.tableAliases)) {
            if (stryMutAct_9fa48("113746")) {
              {}
            } else {
              stryCov_9fa48("113746");
              const exprTable = stryMutAct_9fa48("113747") ? String(expr.table).toUpperCase() : (stryCov_9fa48("113747"), String(expr.table).toLowerCase());
              if (stryMutAct_9fa48("113750") ? false : stryMutAct_9fa48("113749") ? true : stryMutAct_9fa48("113748") ? resolutionContext.tableAliases.includes(exprTable) : (stryCov_9fa48("113748", "113749", "113750"), !resolutionContext.tableAliases.includes(exprTable))) {
                if (stryMutAct_9fa48("113751")) {
                  {}
                } else {
                  stryCov_9fa48("113751");
                  return stryMutAct_9fa48("113752") ? true : (stryCov_9fa48("113752"), false);
                }
              }
            }
          }
          const column = stryMutAct_9fa48("113755") ? expr.column && expr.name : stryMutAct_9fa48("113754") ? false : stryMutAct_9fa48("113753") ? true : (stryCov_9fa48("113753", "113754", "113755"), expr.column || expr.name);
          return stryMutAct_9fa48("113758") ? column?.toLowerCase() !== primaryKey.toLowerCase() : stryMutAct_9fa48("113757") ? false : stryMutAct_9fa48("113756") ? true : (stryCov_9fa48("113756", "113757", "113758"), (stryMutAct_9fa48("113760") ? column.toLowerCase() : stryMutAct_9fa48("113759") ? column?.toUpperCase() : (stryCov_9fa48("113759", "113760"), column?.toLowerCase())) === (stryMutAct_9fa48("113761") ? primaryKey.toUpperCase() : (stryCov_9fa48("113761"), primaryKey.toLowerCase())));
        }
      }
      return stryMutAct_9fa48("113762") ? true : (stryCov_9fa48("113762"), false);
    }
  }

  /**
   * Extract literal value from expression.
   * @param {Object} expr - Expression AST.
   * @return {*} Literal value or undefined.
   * @private
   */
  extractLiteralValue(expr, resolutionContext) {
    if (stryMutAct_9fa48("113763")) {
      {}
    } else {
      stryCov_9fa48("113763");
      if (stryMutAct_9fa48("113766") ? false : stryMutAct_9fa48("113765") ? true : stryMutAct_9fa48("113764") ? expr : (stryCov_9fa48("113764", "113765", "113766"), !expr)) return undefined;
      if (stryMutAct_9fa48("113769") ? expr.type !== QUERY_AST_NODE.LITERAL : stryMutAct_9fa48("113768") ? false : stryMutAct_9fa48("113767") ? true : (stryCov_9fa48("113767", "113768", "113769"), expr.type === QUERY_AST_NODE.LITERAL)) {
        if (stryMutAct_9fa48("113770")) {
          {}
        } else {
          stryCov_9fa48("113770");
          return expr.value;
        }
      }
      if (stryMutAct_9fa48("113773") ? expr.type !== QUERY_AST_NODE.PARAMETER : stryMutAct_9fa48("113772") ? false : stryMutAct_9fa48("113771") ? true : (stryCov_9fa48("113771", "113772", "113773"), expr.type === QUERY_AST_NODE.PARAMETER)) {
        if (stryMutAct_9fa48("113774")) {
          {}
        } else {
          stryCov_9fa48("113774");
          if (stryMutAct_9fa48("113777") ? typeof expr.index === TYPEOF.NUMBER && expr.index >= NUM.ZERO || expr.index < resolutionContext.params.length : stryMutAct_9fa48("113776") ? false : stryMutAct_9fa48("113775") ? true : (stryCov_9fa48("113775", "113776", "113777"), (stryMutAct_9fa48("113779") ? typeof expr.index === TYPEOF.NUMBER || expr.index >= NUM.ZERO : stryMutAct_9fa48("113778") ? true : (stryCov_9fa48("113778", "113779"), (stryMutAct_9fa48("113781") ? typeof expr.index !== TYPEOF.NUMBER : stryMutAct_9fa48("113780") ? true : (stryCov_9fa48("113780", "113781"), typeof expr.index === TYPEOF.NUMBER)) && (stryMutAct_9fa48("113784") ? expr.index < NUM.ZERO : stryMutAct_9fa48("113783") ? expr.index > NUM.ZERO : stryMutAct_9fa48("113782") ? true : (stryCov_9fa48("113782", "113783", "113784"), expr.index >= NUM.ZERO)))) && (stryMutAct_9fa48("113787") ? expr.index >= resolutionContext.params.length : stryMutAct_9fa48("113786") ? expr.index <= resolutionContext.params.length : stryMutAct_9fa48("113785") ? true : (stryCov_9fa48("113785", "113786", "113787"), expr.index < resolutionContext.params.length)))) {
            if (stryMutAct_9fa48("113788")) {
              {}
            } else {
              stryCov_9fa48("113788");
              return resolutionContext.params[expr.index];
            }
          }
          const fallbackIndex = resolutionContext.parameterState.nextIndex;
          stryMutAct_9fa48("113789") ? resolutionContext.parameterState.nextIndex -= NUM.ONE : (stryCov_9fa48("113789"), resolutionContext.parameterState.nextIndex += NUM.ONE);
          return resolutionContext.params[fallbackIndex];
        }
      }
      if (stryMutAct_9fa48("113792") ? expr.type === QUERY_AST_NODE.UNARY || expr.operator === UNARY_OPERATOR.PLUS || expr.operator === UNARY_OPERATOR.MINUS : stryMutAct_9fa48("113791") ? false : stryMutAct_9fa48("113790") ? true : (stryCov_9fa48("113790", "113791", "113792"), (stryMutAct_9fa48("113794") ? expr.type !== QUERY_AST_NODE.UNARY : stryMutAct_9fa48("113793") ? true : (stryCov_9fa48("113793", "113794"), expr.type === QUERY_AST_NODE.UNARY)) && (stryMutAct_9fa48("113796") ? expr.operator === UNARY_OPERATOR.PLUS && expr.operator === UNARY_OPERATOR.MINUS : stryMutAct_9fa48("113795") ? true : (stryCov_9fa48("113795", "113796"), (stryMutAct_9fa48("113798") ? expr.operator !== UNARY_OPERATOR.PLUS : stryMutAct_9fa48("113797") ? false : (stryCov_9fa48("113797", "113798"), expr.operator === UNARY_OPERATOR.PLUS)) || (stryMutAct_9fa48("113800") ? expr.operator !== UNARY_OPERATOR.MINUS : stryMutAct_9fa48("113799") ? false : (stryCov_9fa48("113799", "113800"), expr.operator === UNARY_OPERATOR.MINUS)))))) {
        if (stryMutAct_9fa48("113801")) {
          {}
        } else {
          stryCov_9fa48("113801");
          const operand = this.extractLiteralValue(expr.operand, resolutionContext);
          if (stryMutAct_9fa48("113804") ? operand !== undefined : stryMutAct_9fa48("113803") ? false : stryMutAct_9fa48("113802") ? true : (stryCov_9fa48("113802", "113803", "113804"), operand === undefined)) {
            if (stryMutAct_9fa48("113805")) {
              {}
            } else {
              stryCov_9fa48("113805");
              return undefined;
            }
          }
          return (stryMutAct_9fa48("113808") ? expr.operator !== UNARY_OPERATOR.MINUS : stryMutAct_9fa48("113807") ? false : stryMutAct_9fa48("113806") ? true : (stryCov_9fa48("113806", "113807", "113808"), expr.operator === UNARY_OPERATOR.MINUS)) ? stryMutAct_9fa48("113809") ? +Number(operand) : (stryCov_9fa48("113809"), -Number(operand)) : Number(operand);
        }
      }
      return undefined;
    }
  }

  /**
   * Find partitions matching key conditions.
   * @param {Array} partitions - Available partitions.
   * @param {Object} conditions - Key conditions.
   * @return {Array} Matching partitions.
   * @private
   */
  findMatchingPartitions(partitions, conditions) {
    if (stryMutAct_9fa48("113810")) {
      {}
    } else {
      stryCov_9fa48("113810");
      switch (conditions.type) {
        case KEY_CONDITION_TYPE.EQUALS:
          if (stryMutAct_9fa48("113811")) {} else {
            stryCov_9fa48("113811");
            return this.findPartitionsForValues(partitions, conditions.values);
          }
        case KEY_CONDITION_TYPE.IN:
          if (stryMutAct_9fa48("113812")) {} else {
            stryCov_9fa48("113812");
            return this.findPartitionsForValues(partitions, conditions.values);
          }
        case KEY_CONDITION_TYPE.RANGE:
          if (stryMutAct_9fa48("113813")) {} else {
            stryCov_9fa48("113813");
            return this.findPartitionsForRange(partitions, conditions);
          }
        default:
          if (stryMutAct_9fa48("113814")) {} else {
            stryCov_9fa48("113814");
            return partitions;
          }
      }
    }
  }

  /**
   * Find partitions containing specific values.
   * @param {Array} partitions - Available partitions.
   * @param {Array} values - Values to find.
   * @return {Array} Matching partitions.
   * @private
   */
  findPartitionsForValues(partitions, values) {
    if (stryMutAct_9fa48("113815")) {
      {}
    } else {
      stryCov_9fa48("113815");
      const matching = new Set();
      for (const value of values) {
        if (stryMutAct_9fa48("113816")) {
          {}
        } else {
          stryCov_9fa48("113816");
          for (const partition of partitions) {
            if (stryMutAct_9fa48("113817")) {
              {}
            } else {
              stryCov_9fa48("113817");
              if (stryMutAct_9fa48("113819") ? false : stryMutAct_9fa48("113818") ? true : (stryCov_9fa48("113818", "113819"), this.isValueInPartition(value, partition))) {
                if (stryMutAct_9fa48("113820")) {
                  {}
                } else {
                  stryCov_9fa48("113820");
                  matching.add(partition);
                }
              }
            }
          }
        }
      }
      return Array.from(matching);
    }
  }

  /**
   * Find partitions overlapping with a range.
   * @param {Array} partitions - Available partitions.
   * @param {Object} conditions - Range conditions.
   * @return {Array} Matching partitions.
   * @private
   */
  findPartitionsForRange(partitions, conditions) {
    if (stryMutAct_9fa48("113821")) {
      {}
    } else {
      stryCov_9fa48("113821");
      return stryMutAct_9fa48("113822") ? partitions : (stryCov_9fa48("113822"), partitions.filter(stryMutAct_9fa48("113823") ? () => undefined : (stryCov_9fa48("113823"), partition => this.rangeOverlaps(partition, conditions))));
    }
  }

  /**
   * Check if a value falls within a partition's range.
   * @param {*} value - Value to check.
   * @param {Object} partition - Partition with key range.
   * @return {boolean} True if value in partition.
   * @private
   */
  isValueInPartition(value, partition) {
    if (stryMutAct_9fa48("113824")) {
      {}
    } else {
      stryCov_9fa48("113824");
      // Use 'in' operator to check property existence since null is a valid value
      const start = (stryMutAct_9fa48("113825") ? "" : (stryCov_9fa48("113825"), 'partition_key_start')) in partition ? partition.partition_key_start : stryMutAct_9fa48("113826") ? partition.keyRange.start : (stryCov_9fa48("113826"), partition.keyRange?.start);
      const end = (stryMutAct_9fa48("113827") ? "" : (stryCov_9fa48("113827"), 'partition_key_end')) in partition ? partition.partition_key_end : stryMutAct_9fa48("113828") ? partition.keyRange.end : (stryCov_9fa48("113828"), partition.keyRange?.end);

      // NULL/undefined start means unbounded lower (negative infinity)
      // NULL/undefined end means unbounded upper (positive infinity)
      if (stryMutAct_9fa48("113831") ? start === null || start === undefined || end === null || end === undefined : stryMutAct_9fa48("113830") ? false : stryMutAct_9fa48("113829") ? true : (stryCov_9fa48("113829", "113830", "113831"), (stryMutAct_9fa48("113833") ? start === null && start === undefined : stryMutAct_9fa48("113832") ? true : (stryCov_9fa48("113832", "113833"), (stryMutAct_9fa48("113835") ? start !== null : stryMutAct_9fa48("113834") ? false : (stryCov_9fa48("113834", "113835"), start === null)) || (stryMutAct_9fa48("113837") ? start !== undefined : stryMutAct_9fa48("113836") ? false : (stryCov_9fa48("113836", "113837"), start === undefined)))) && (stryMutAct_9fa48("113839") ? end === null && end === undefined : stryMutAct_9fa48("113838") ? true : (stryCov_9fa48("113838", "113839"), (stryMutAct_9fa48("113841") ? end !== null : stryMutAct_9fa48("113840") ? false : (stryCov_9fa48("113840", "113841"), end === null)) || (stryMutAct_9fa48("113843") ? end !== undefined : stryMutAct_9fa48("113842") ? false : (stryCov_9fa48("113842", "113843"), end === undefined)))))) {
        if (stryMutAct_9fa48("113844")) {
          {}
        } else {
          stryCov_9fa48("113844");
          return stryMutAct_9fa48("113845") ? false : (stryCov_9fa48("113845"), true);
        }
      }
      if (stryMutAct_9fa48("113848") ? start === null && start === undefined : stryMutAct_9fa48("113847") ? false : stryMutAct_9fa48("113846") ? true : (stryCov_9fa48("113846", "113847", "113848"), (stryMutAct_9fa48("113850") ? start !== null : stryMutAct_9fa48("113849") ? false : (stryCov_9fa48("113849", "113850"), start === null)) || (stryMutAct_9fa48("113852") ? start !== undefined : stryMutAct_9fa48("113851") ? false : (stryCov_9fa48("113851", "113852"), start === undefined)))) {
        if (stryMutAct_9fa48("113853")) {
          {}
        } else {
          stryCov_9fa48("113853");
          return stryMutAct_9fa48("113857") ? this.compareValues(value, end) >= 0 : stryMutAct_9fa48("113856") ? this.compareValues(value, end) <= 0 : stryMutAct_9fa48("113855") ? false : stryMutAct_9fa48("113854") ? true : (stryCov_9fa48("113854", "113855", "113856", "113857"), this.compareValues(value, end) < 0);
        }
      }
      if (stryMutAct_9fa48("113860") ? end === null && end === undefined : stryMutAct_9fa48("113859") ? false : stryMutAct_9fa48("113858") ? true : (stryCov_9fa48("113858", "113859", "113860"), (stryMutAct_9fa48("113862") ? end !== null : stryMutAct_9fa48("113861") ? false : (stryCov_9fa48("113861", "113862"), end === null)) || (stryMutAct_9fa48("113864") ? end !== undefined : stryMutAct_9fa48("113863") ? false : (stryCov_9fa48("113863", "113864"), end === undefined)))) {
        if (stryMutAct_9fa48("113865")) {
          {}
        } else {
          stryCov_9fa48("113865");
          return stryMutAct_9fa48("113869") ? this.compareValues(value, start) < 0 : stryMutAct_9fa48("113868") ? this.compareValues(value, start) > 0 : stryMutAct_9fa48("113867") ? false : stryMutAct_9fa48("113866") ? true : (stryCov_9fa48("113866", "113867", "113868", "113869"), this.compareValues(value, start) >= 0);
        }
      }
      return stryMutAct_9fa48("113872") ? this.compareValues(value, start) >= 0 || this.compareValues(value, end) < 0 : stryMutAct_9fa48("113871") ? false : stryMutAct_9fa48("113870") ? true : (stryCov_9fa48("113870", "113871", "113872"), (stryMutAct_9fa48("113875") ? this.compareValues(value, start) < 0 : stryMutAct_9fa48("113874") ? this.compareValues(value, start) > 0 : stryMutAct_9fa48("113873") ? true : (stryCov_9fa48("113873", "113874", "113875"), this.compareValues(value, start) >= 0)) && (stryMutAct_9fa48("113878") ? this.compareValues(value, end) >= 0 : stryMutAct_9fa48("113877") ? this.compareValues(value, end) <= 0 : stryMutAct_9fa48("113876") ? true : (stryCov_9fa48("113876", "113877", "113878"), this.compareValues(value, end) < 0)));
    }
  }

  /**
   * Check if partition range overlaps with query range.
   * @param {Object} partition - Partition with key range.
   * @param {Object} conditions - Query range conditions.
   * @return {boolean} True if ranges overlap.
   * @private
   */
  rangeOverlaps(partition, conditions) {
    if (stryMutAct_9fa48("113879")) {
      {}
    } else {
      stryCov_9fa48("113879");
      // Use 'in' operator to check property existence since null is a valid value
      const pStart = (stryMutAct_9fa48("113880") ? "" : (stryCov_9fa48("113880"), 'partition_key_start')) in partition ? partition.partition_key_start : stryMutAct_9fa48("113881") ? partition.keyRange.start : (stryCov_9fa48("113881"), partition.keyRange?.start);
      const pEnd = (stryMutAct_9fa48("113882") ? "" : (stryCov_9fa48("113882"), 'partition_key_end')) in partition ? partition.partition_key_end : stryMutAct_9fa48("113883") ? partition.keyRange.end : (stryCov_9fa48("113883"), partition.keyRange?.end);
      const {
        low,
        high,
        lowInclusive,
        highInclusive
      } = conditions;

      // Check if partition range overlaps with query range
      // Partition: [pStart, pEnd)
      // Query: [low, high] or variations based on inclusive flags

      // If partition ends before query starts, no overlap
      if (stryMutAct_9fa48("113886") ? pEnd !== null && pEnd !== undefined || low !== null : stryMutAct_9fa48("113885") ? false : stryMutAct_9fa48("113884") ? true : (stryCov_9fa48("113884", "113885", "113886"), (stryMutAct_9fa48("113888") ? pEnd !== null || pEnd !== undefined : stryMutAct_9fa48("113887") ? true : (stryCov_9fa48("113887", "113888"), (stryMutAct_9fa48("113890") ? pEnd === null : stryMutAct_9fa48("113889") ? true : (stryCov_9fa48("113889", "113890"), pEnd !== null)) && (stryMutAct_9fa48("113892") ? pEnd === undefined : stryMutAct_9fa48("113891") ? true : (stryCov_9fa48("113891", "113892"), pEnd !== undefined)))) && (stryMutAct_9fa48("113894") ? low === null : stryMutAct_9fa48("113893") ? true : (stryCov_9fa48("113893", "113894"), low !== null)))) {
        if (stryMutAct_9fa48("113895")) {
          {}
        } else {
          stryCov_9fa48("113895");
          const cmp = this.compareValues(pEnd, low);
          if (stryMutAct_9fa48("113898") ? cmp < 0 && cmp === 0 && !lowInclusive : stryMutAct_9fa48("113897") ? false : stryMutAct_9fa48("113896") ? true : (stryCov_9fa48("113896", "113897", "113898"), (stryMutAct_9fa48("113901") ? cmp >= 0 : stryMutAct_9fa48("113900") ? cmp <= 0 : stryMutAct_9fa48("113899") ? false : (stryCov_9fa48("113899", "113900", "113901"), cmp < 0)) || (stryMutAct_9fa48("113903") ? cmp === 0 || !lowInclusive : stryMutAct_9fa48("113902") ? false : (stryCov_9fa48("113902", "113903"), (stryMutAct_9fa48("113905") ? cmp !== 0 : stryMutAct_9fa48("113904") ? true : (stryCov_9fa48("113904", "113905"), cmp === 0)) && (stryMutAct_9fa48("113906") ? lowInclusive : (stryCov_9fa48("113906"), !lowInclusive)))))) {
            if (stryMutAct_9fa48("113907")) {
              {}
            } else {
              stryCov_9fa48("113907");
              return stryMutAct_9fa48("113908") ? true : (stryCov_9fa48("113908"), false);
            }
          }
        }
      }

      // If partition starts after query ends, no overlap
      if (stryMutAct_9fa48("113911") ? pStart !== null && pStart !== undefined || high !== null : stryMutAct_9fa48("113910") ? false : stryMutAct_9fa48("113909") ? true : (stryCov_9fa48("113909", "113910", "113911"), (stryMutAct_9fa48("113913") ? pStart !== null || pStart !== undefined : stryMutAct_9fa48("113912") ? true : (stryCov_9fa48("113912", "113913"), (stryMutAct_9fa48("113915") ? pStart === null : stryMutAct_9fa48("113914") ? true : (stryCov_9fa48("113914", "113915"), pStart !== null)) && (stryMutAct_9fa48("113917") ? pStart === undefined : stryMutAct_9fa48("113916") ? true : (stryCov_9fa48("113916", "113917"), pStart !== undefined)))) && (stryMutAct_9fa48("113919") ? high === null : stryMutAct_9fa48("113918") ? true : (stryCov_9fa48("113918", "113919"), high !== null)))) {
        if (stryMutAct_9fa48("113920")) {
          {}
        } else {
          stryCov_9fa48("113920");
          const cmp = this.compareValues(pStart, high);
          if (stryMutAct_9fa48("113923") ? cmp > 0 && cmp === 0 && !highInclusive : stryMutAct_9fa48("113922") ? false : stryMutAct_9fa48("113921") ? true : (stryCov_9fa48("113921", "113922", "113923"), (stryMutAct_9fa48("113926") ? cmp <= 0 : stryMutAct_9fa48("113925") ? cmp >= 0 : stryMutAct_9fa48("113924") ? false : (stryCov_9fa48("113924", "113925", "113926"), cmp > 0)) || (stryMutAct_9fa48("113928") ? cmp === 0 || !highInclusive : stryMutAct_9fa48("113927") ? false : (stryCov_9fa48("113927", "113928"), (stryMutAct_9fa48("113930") ? cmp !== 0 : stryMutAct_9fa48("113929") ? true : (stryCov_9fa48("113929", "113930"), cmp === 0)) && (stryMutAct_9fa48("113931") ? highInclusive : (stryCov_9fa48("113931"), !highInclusive)))))) {
            if (stryMutAct_9fa48("113932")) {
              {}
            } else {
              stryCov_9fa48("113932");
              return stryMutAct_9fa48("113933") ? true : (stryCov_9fa48("113933"), false);
            }
          }
        }
      }
      return stryMutAct_9fa48("113934") ? false : (stryCov_9fa48("113934"), true);
    }
  }

  /**
   * Compare two values for ordering.
   * @param {*} a - First value.
   * @param {*} b - Second value.
   * @return {number} Comparison result (-1, 0, 1).
   * @private
   */
  compareValues(a, b) {
    if (stryMutAct_9fa48("113935")) {
      {}
    } else {
      stryCov_9fa48("113935");
      if (stryMutAct_9fa48("113938") ? a !== b : stryMutAct_9fa48("113937") ? false : stryMutAct_9fa48("113936") ? true : (stryCov_9fa48("113936", "113937", "113938"), a === b)) return NUM.ZERO;
      if (stryMutAct_9fa48("113941") ? a !== null : stryMutAct_9fa48("113940") ? false : stryMutAct_9fa48("113939") ? true : (stryCov_9fa48("113939", "113940", "113941"), a === null)) return NUM.NEGATIVE_ONE;
      if (stryMutAct_9fa48("113944") ? b !== null : stryMutAct_9fa48("113943") ? false : stryMutAct_9fa48("113942") ? true : (stryCov_9fa48("113942", "113943", "113944"), b === null)) return NUM.ONE;
      if (stryMutAct_9fa48("113947") ? typeof a === TYPEOF.STRING || typeof b === TYPEOF.STRING : stryMutAct_9fa48("113946") ? false : stryMutAct_9fa48("113945") ? true : (stryCov_9fa48("113945", "113946", "113947"), (stryMutAct_9fa48("113949") ? typeof a !== TYPEOF.STRING : stryMutAct_9fa48("113948") ? true : (stryCov_9fa48("113948", "113949"), typeof a === TYPEOF.STRING)) && (stryMutAct_9fa48("113951") ? typeof b !== TYPEOF.STRING : stryMutAct_9fa48("113950") ? true : (stryCov_9fa48("113950", "113951"), typeof b === TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("113952")) {
          {}
        } else {
          stryCov_9fa48("113952");
          return a.localeCompare(b);
        }
      }
      if (stryMutAct_9fa48("113955") ? typeof a === TYPEOF.NUMBER || typeof b === TYPEOF.NUMBER : stryMutAct_9fa48("113954") ? false : stryMutAct_9fa48("113953") ? true : (stryCov_9fa48("113953", "113954", "113955"), (stryMutAct_9fa48("113957") ? typeof a !== TYPEOF.NUMBER : stryMutAct_9fa48("113956") ? true : (stryCov_9fa48("113956", "113957"), typeof a === TYPEOF.NUMBER)) && (stryMutAct_9fa48("113959") ? typeof b !== TYPEOF.NUMBER : stryMutAct_9fa48("113958") ? true : (stryCov_9fa48("113958", "113959"), typeof b === TYPEOF.NUMBER)))) {
        if (stryMutAct_9fa48("113960")) {
          {}
        } else {
          stryCov_9fa48("113960");
          return stryMutAct_9fa48("113961") ? a + b : (stryCov_9fa48("113961"), a - b);
        }
      }

      // Convert to strings for comparison
      return String(a).localeCompare(String(b));
    }
  }

  /**
   * Resolve partition for a single key value (for INSERT/UPDATE/DELETE).
   * @param {string} tableName - Table name.
   * @param {*} keyValue - Primary key value.
   * @param {Array} partitions - Available partitions.
   * @return {string|null} Partition ID or null.
   */
  resolvePartitionForKey(tableName, keyValue, partitions) {
    if (stryMutAct_9fa48("113962")) {
      {}
    } else {
      stryCov_9fa48("113962");
      if (stryMutAct_9fa48("113965") ? !partitions && partitions.length === NUM.ZERO : stryMutAct_9fa48("113964") ? false : stryMutAct_9fa48("113963") ? true : (stryCov_9fa48("113963", "113964", "113965"), (stryMutAct_9fa48("113966") ? partitions : (stryCov_9fa48("113966"), !partitions)) || (stryMutAct_9fa48("113968") ? partitions.length !== NUM.ZERO : stryMutAct_9fa48("113967") ? false : (stryCov_9fa48("113967", "113968"), partitions.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("113969")) {
          {}
        } else {
          stryCov_9fa48("113969");
          return null;
        }
      }
      for (const partition of partitions) {
        if (stryMutAct_9fa48("113970")) {
          {}
        } else {
          stryCov_9fa48("113970");
          if (stryMutAct_9fa48("113972") ? false : stryMutAct_9fa48("113971") ? true : (stryCov_9fa48("113971", "113972"), this.isValueInPartition(keyValue, partition))) {
            if (stryMutAct_9fa48("113973")) {
              {}
            } else {
              stryCov_9fa48("113973");
              return stryMutAct_9fa48("113976") ? partition.partition_id && partition.partitionId : stryMutAct_9fa48("113975") ? false : stryMutAct_9fa48("113974") ? true : (stryCov_9fa48("113974", "113975", "113976"), partition.partition_id || partition.partitionId);
            }
          }
        }
      }
      this.logger.warn(QUERY_LOG_MSG.NO_PARTITION_FOR_KEY, stryMutAct_9fa48("113977") ? {} : (stryCov_9fa48("113977"), {
        tableName,
        keyValue
      }));
      return null;
    }
  }

  /**
   * Get all partitions for a table (for scatter-gather).
   * @param {string} tableName - Table name.
   * @param {Array} partitions - Available partitions.
   * @return {Array} All partition IDs.
   */
  getAllPartitions(tableName, partitions) {
    if (stryMutAct_9fa48("113978")) {
      {}
    } else {
      stryCov_9fa48("113978");
      if (stryMutAct_9fa48("113981") ? !partitions && partitions.length === NUM.ZERO : stryMutAct_9fa48("113980") ? false : stryMutAct_9fa48("113979") ? true : (stryCov_9fa48("113979", "113980", "113981"), (stryMutAct_9fa48("113982") ? partitions : (stryCov_9fa48("113982"), !partitions)) || (stryMutAct_9fa48("113984") ? partitions.length !== NUM.ZERO : stryMutAct_9fa48("113983") ? false : (stryCov_9fa48("113983", "113984"), partitions.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("113985")) {
          {}
        } else {
          stryCov_9fa48("113985");
          return stryMutAct_9fa48("113986") ? ["Stryker was here"] : (stryCov_9fa48("113986"), []);
        }
      }
      return partitions.map(stryMutAct_9fa48("113987") ? () => undefined : (stryCov_9fa48("113987"), p => stryMutAct_9fa48("113990") ? p.partition_id && p.partitionId : stryMutAct_9fa48("113989") ? false : stryMutAct_9fa48("113988") ? true : (stryCov_9fa48("113988", "113989", "113990"), p.partition_id || p.partitionId)));
    }
  }

  /**
   * Return the most recent partition-resolution diagnostics.
   * @return {Object|null} Last resolution info.
   */
  getLastResolutionInfo() {
    if (stryMutAct_9fa48("113991")) {
      {}
    } else {
      stryCov_9fa48("113991");
      return this.lastResolutionInfo;
    }
  }
}
export { PartitionResolver };