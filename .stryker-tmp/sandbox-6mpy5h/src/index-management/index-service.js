/**
 * Index Service - Manages database indices for query optimization.
 * Supports creating indices on table columns and storing metadata in indices system table.
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
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
import { v4 as uuidv4 } from 'uuid';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { STRING, TABLES } from '../constants/index.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { INDEX_CONFIG_KEY, INDEX_DEFAULTS, INDEX_ERROR_MSG, INDEX_LOG_MSG, INDEX_SUBSYSTEM, INDEX_TYPE } from './index-constants.js';

/**
 * Index types supported by the system.
 */
const IndexType = INDEX_TYPE;

/**
 * IndexService manages database indices for query optimization.
 * Indices are stored in the indices system table and maintained
 * automatically when data changes occur.
 */
class IndexService {
  /**
   * Create a new IndexService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("80071")) {
      {}
    } else {
      stryCov_9fa48("80071");
      this.cdcIntegrationService = stryMutAct_9fa48("80074") ? options.cdcIntegrationService && null : stryMutAct_9fa48("80073") ? false : stryMutAct_9fa48("80072") ? true : (stryCov_9fa48("80072", "80073", "80074"), options.cdcIntegrationService || null);
      this.systemTableCache = stryMutAct_9fa48("80077") ? options.systemTableCache && null : stryMutAct_9fa48("80076") ? false : stryMutAct_9fa48("80075") ? true : (stryCov_9fa48("80075", "80076", "80077"), options.systemTableCache || null);
      this.sqlQueryEngine = stryMutAct_9fa48("80080") ? options.sqlQueryEngine && null : stryMutAct_9fa48("80079") ? false : stryMutAct_9fa48("80078") ? true : (stryCov_9fa48("80078", "80079", "80080"), options.sqlQueryEngine || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("80083") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("80082") ? false : stryMutAct_9fa48("80081") ? true : (stryCov_9fa48("80081", "80082", "80083"), options.controlPlaneSystemTableGateway || null);

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.defaultIndexType = stryMutAct_9fa48("80086") ? config.get(INDEX_CONFIG_KEY.DEFAULT_TYPE) && INDEX_DEFAULTS.DEFAULT_TYPE : stryMutAct_9fa48("80085") ? false : stryMutAct_9fa48("80084") ? true : (stryCov_9fa48("80084", "80085", "80086"), config.get(INDEX_CONFIG_KEY.DEFAULT_TYPE) || INDEX_DEFAULTS.DEFAULT_TYPE);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(INDEX_SUBSYSTEM.INDEX_SERVICE) : console;

      // Track indices by table for quick lookup
      this.indexCache = new Map(); // tableId -> Map(indexName -> indexMetadata)

      this.initialized = stryMutAct_9fa48("80087") ? true : (stryCov_9fa48("80087"), false);
    }
  }

  /**
   * Initialize the index service.
   * @return {Promise<void>}
   */
  async initialize() {
    if (stryMutAct_9fa48("80088")) {
      {}
    } else {
      stryCov_9fa48("80088");
      if (stryMutAct_9fa48("80090") ? false : stryMutAct_9fa48("80089") ? true : (stryCov_9fa48("80089", "80090"), this.initialized)) {
        if (stryMutAct_9fa48("80091")) {
          {}
        } else {
          stryCov_9fa48("80091");
          return;
        }
      }
      this.logger.info(INDEX_LOG_MSG.SERVICE_INITIALIZING);

      // Load existing indices from system table cache
      await this.loadIndicesFromCache();
      this.initialized = stryMutAct_9fa48("80092") ? false : (stryCov_9fa48("80092"), true);
      this.logger.info(INDEX_LOG_MSG.SERVICE_INITIALIZED, stryMutAct_9fa48("80093") ? {} : (stryCov_9fa48("80093"), {
        indexCount: this.getTotalIndexCount()
      }));
    }
  }

  /**
   * Load indices from system table cache.
   * @return {Promise<void>}
   * @private
   */
  async loadIndicesFromCache() {
    if (stryMutAct_9fa48("80094")) {
      {}
    } else {
      stryCov_9fa48("80094");
      try {
        if (stryMutAct_9fa48("80095")) {
          {}
        } else {
          stryCov_9fa48("80095");
          let indices = stryMutAct_9fa48("80096") ? ["Stryker was here"] : (stryCov_9fa48("80096"), []);
          if (stryMutAct_9fa48("80098") ? false : stryMutAct_9fa48("80097") ? true : (stryCov_9fa48("80097", "80098"), this.canReadMetadata())) {
            if (stryMutAct_9fa48("80099")) {
              {}
            } else {
              stryCov_9fa48("80099");
              const result = await this.getControlPlaneSystemTableGateway().readRows(TABLES.INDICES, stryMutAct_9fa48("80100") ? "" : (stryCov_9fa48("80100"), 'SELECT * FROM indices'), stryMutAct_9fa48("80101") ? ["Stryker was here"] : (stryCov_9fa48("80101"), []));
              indices = stryMutAct_9fa48("80104") ? result.rows && [] : stryMutAct_9fa48("80103") ? false : stryMutAct_9fa48("80102") ? true : (stryCov_9fa48("80102", "80103", "80104"), result.rows || (stryMutAct_9fa48("80105") ? ["Stryker was here"] : (stryCov_9fa48("80105"), [])));
            }
          }
          for (const index of indices) {
            if (stryMutAct_9fa48("80106")) {
              {}
            } else {
              stryCov_9fa48("80106");
              const tableId = index.table_id;
              if (stryMutAct_9fa48("80109") ? false : stryMutAct_9fa48("80108") ? true : stryMutAct_9fa48("80107") ? this.indexCache.has(tableId) : (stryCov_9fa48("80107", "80108", "80109"), !this.indexCache.has(tableId))) {
                if (stryMutAct_9fa48("80110")) {
                  {}
                } else {
                  stryCov_9fa48("80110");
                  this.indexCache.set(tableId, new Map());
                }
              }
              const indexMetadata = stryMutAct_9fa48("80111") ? {} : (stryCov_9fa48("80111"), {
                indexId: index.index_id,
                tableId: index.table_id,
                indexName: index.index_name,
                columnNames: JSON.parse(stryMutAct_9fa48("80114") ? index.column_names && STRING.EMPTY_JSON_ARRAY : stryMutAct_9fa48("80113") ? false : stryMutAct_9fa48("80112") ? true : (stryCov_9fa48("80112", "80113", "80114"), index.column_names || STRING.EMPTY_JSON_ARRAY)),
                indexType: stryMutAct_9fa48("80117") ? index.index_type && INDEX_TYPE.BTREE : stryMutAct_9fa48("80116") ? false : stryMutAct_9fa48("80115") ? true : (stryCov_9fa48("80115", "80116", "80117"), index.index_type || INDEX_TYPE.BTREE),
                createdAt: index.created_at
              });
              this.indexCache.get(tableId).set(index.index_name, indexMetadata);
            }
          }
          this.logger.debug(INDEX_LOG_MSG.INDICES_LOADED, stryMutAct_9fa48("80118") ? {} : (stryCov_9fa48("80118"), {
            indexCount: this.getTotalIndexCount()
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("80119")) {
          {}
        } else {
          stryCov_9fa48("80119");
          this.logger.error(INDEX_LOG_MSG.INDICES_LOAD_FAILED, stryMutAct_9fa48("80120") ? {} : (stryCov_9fa48("80120"), {
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Create a new index on a table.
   * Requirements: 12.1, 12.2
   * @param {Object} options - Index creation options.
   * @param {string} options.tableId - Table ID to create index on.
   * @param {string} options.tableName - Table name.
   * @param {string} options.indexName - Name for the index.
   * @param {Array<string>} options.columnNames - Column names to index.
   * @param {string} options.indexType - Index type (btree, hash).
   * @return {Promise<Object>} Created index metadata.
   */
  async createIndex(options) {
    if (stryMutAct_9fa48("80121")) {
      {}
    } else {
      stryCov_9fa48("80121");
      const {
        tableId,
        tableName,
        indexName,
        columnNames,
        indexType = this.defaultIndexType
      } = options;
      if (stryMutAct_9fa48("80124") ? false : stryMutAct_9fa48("80123") ? true : stryMutAct_9fa48("80122") ? tableId : (stryCov_9fa48("80122", "80123", "80124"), !tableId)) {
        if (stryMutAct_9fa48("80125")) {
          {}
        } else {
          stryCov_9fa48("80125");
          throw new Error(INDEX_ERROR_MSG.TABLE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("80128") ? false : stryMutAct_9fa48("80127") ? true : stryMutAct_9fa48("80126") ? indexName : (stryCov_9fa48("80126", "80127", "80128"), !indexName)) {
        if (stryMutAct_9fa48("80129")) {
          {}
        } else {
          stryCov_9fa48("80129");
          throw new Error(INDEX_ERROR_MSG.INDEX_NAME_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("80132") ? !columnNames && columnNames.length === 0 : stryMutAct_9fa48("80131") ? false : stryMutAct_9fa48("80130") ? true : (stryCov_9fa48("80130", "80131", "80132"), (stryMutAct_9fa48("80133") ? columnNames : (stryCov_9fa48("80133"), !columnNames)) || (stryMutAct_9fa48("80135") ? columnNames.length !== 0 : stryMutAct_9fa48("80134") ? false : (stryCov_9fa48("80134", "80135"), columnNames.length === 0)))) {
        if (stryMutAct_9fa48("80136")) {
          {}
        } else {
          stryCov_9fa48("80136");
          throw new Error(INDEX_ERROR_MSG.COLUMN_NAMES_REQUIRED);
        }
      }
      this.logger.info(INDEX_LOG_MSG.CREATING_INDEX, stryMutAct_9fa48("80137") ? {} : (stryCov_9fa48("80137"), {
        tableId,
        tableName,
        indexName,
        columnNames,
        indexType
      }));

      // Check if index already exists
      if (stryMutAct_9fa48("80139") ? false : stryMutAct_9fa48("80138") ? true : (stryCov_9fa48("80138", "80139"), this.indexExists(tableId, indexName))) {
        if (stryMutAct_9fa48("80140")) {
          {}
        } else {
          stryCov_9fa48("80140");
          throw new Error((stryMutAct_9fa48("80141") ? `` : (stryCov_9fa48("80141"), `${INDEX_ERROR_MSG.INDEX_ALREADY_EXISTS_PREFIX}${indexName}`)) + (stryMutAct_9fa48("80142") ? `` : (stryCov_9fa48("80142"), `${INDEX_ERROR_MSG.INDEX_ALREADY_EXISTS_MIDDLE}${tableId}`)) + INDEX_ERROR_MSG.INDEX_ALREADY_EXISTS_SUFFIX);
        }
      }

      // Generate index ID
      const indexId = stryMutAct_9fa48("80143") ? `` : (stryCov_9fa48("80143"), `idx-${uuidv4()}`);
      const createdAt = Date.now();

      // Create index metadata
      const indexMetadata = stryMutAct_9fa48("80144") ? {} : (stryCov_9fa48("80144"), {
        indexId,
        tableId,
        indexName,
        columnNames,
        indexType,
        createdAt
      });

      // Store in indices system table via CDC
      if (stryMutAct_9fa48("80147") ? this.cdcIntegrationService && this.controlPlaneSystemTableGateway : stryMutAct_9fa48("80146") ? false : stryMutAct_9fa48("80145") ? true : (stryCov_9fa48("80145", "80146", "80147"), this.cdcIntegrationService || this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("80148")) {
          {}
        } else {
          stryCov_9fa48("80148");
          await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("80149") ? {} : (stryCov_9fa48("80149"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
            tableName: TABLES.INDICES,
            row: stryMutAct_9fa48("80150") ? {} : (stryCov_9fa48("80150"), {
              index_id: indexId,
              table_id: tableId,
              index_name: indexName,
              column_names: JSON.stringify(columnNames),
              index_type: indexType,
              created_at: createdAt
            })
          }), stryMutAct_9fa48("80151") ? {} : (stryCov_9fa48("80151"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("80152") ? "" : (stryCov_9fa48("80152"), 'critical')
          }));
        }
      }

      // Create actual SQLite index on all partitions for this table
      await this.createSQLiteIndex(tableId, tableName, indexName, columnNames);

      // Update local cache
      if (stryMutAct_9fa48("80155") ? false : stryMutAct_9fa48("80154") ? true : stryMutAct_9fa48("80153") ? this.indexCache.has(tableId) : (stryCov_9fa48("80153", "80154", "80155"), !this.indexCache.has(tableId))) {
        if (stryMutAct_9fa48("80156")) {
          {}
        } else {
          stryCov_9fa48("80156");
          this.indexCache.set(tableId, new Map());
        }
      }
      this.indexCache.get(tableId).set(indexName, indexMetadata);
      this.logger.info(INDEX_LOG_MSG.INDEX_CREATED, stryMutAct_9fa48("80157") ? {} : (stryCov_9fa48("80157"), {
        indexId,
        tableId,
        indexName
      }));
      return indexMetadata;
    }
  }

  /**
   * Create SQLite index on all partitions for a table.
   * Requirements: 12.5
   * @param {string} tableId - Table ID.
   * @param {string} tableName - Table name.
   * @param {string} indexName - Index name.
   * @param {Array<string>} columnNames - Column names.
   * @return {Promise<void>}
   * @private
   */
  async createSQLiteIndex(tableId, tableName, indexName, columnNames) {
    if (stryMutAct_9fa48("80158")) {
      {}
    } else {
      stryCov_9fa48("80158");
      // Get all partitions for this table
      const partitions = await this.getPartitionsForTable(tableId);
      if (stryMutAct_9fa48("80161") ? partitions.length !== 0 : stryMutAct_9fa48("80160") ? false : stryMutAct_9fa48("80159") ? true : (stryCov_9fa48("80159", "80160", "80161"), partitions.length === 0)) {
        if (stryMutAct_9fa48("80162")) {
          {}
        } else {
          stryCov_9fa48("80162");
          this.logger.warn(INDEX_LOG_MSG.NO_PARTITIONS_FOR_TABLE, stryMutAct_9fa48("80163") ? {} : (stryCov_9fa48("80163"), {
            tableId,
            tableName
          }));
          return;
        }
      }
      const columns = columnNames.join(stryMutAct_9fa48("80164") ? "" : (stryCov_9fa48("80164"), ', '));
      const sql = stryMutAct_9fa48("80165") ? `` : (stryCov_9fa48("80165"), `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${columns})`);
      this.logger.debug(INDEX_LOG_MSG.CREATING_SQLITE_INDEX, stryMutAct_9fa48("80166") ? {} : (stryCov_9fa48("80166"), {
        tableId,
        indexName,
        partitionCount: partitions.length
      }));

      // Create index on each partition
      const results = await Promise.allSettled(partitions.map(async partition => {
        if (stryMutAct_9fa48("80167")) {
          {}
        } else {
          stryCov_9fa48("80167");
          try {
            if (stryMutAct_9fa48("80168")) {
              {}
            } else {
              stryCov_9fa48("80168");
              await partition.executeQuery(sql, stryMutAct_9fa48("80169") ? ["Stryker was here"] : (stryCov_9fa48("80169"), []));
              return stryMutAct_9fa48("80170") ? {} : (stryCov_9fa48("80170"), {
                partitionId: partition.partitionId,
                success: stryMutAct_9fa48("80171") ? false : (stryCov_9fa48("80171"), true)
              });
            }
          } catch (error) {
            if (stryMutAct_9fa48("80172")) {
              {}
            } else {
              stryCov_9fa48("80172");
              this.logger.error(INDEX_LOG_MSG.PARTITION_INDEX_FAILED, stryMutAct_9fa48("80173") ? {} : (stryCov_9fa48("80173"), {
                partitionId: partition.partitionId,
                indexName,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }));
      const rejected = results.find(stryMutAct_9fa48("80174") ? () => undefined : (stryCov_9fa48("80174"), result => stryMutAct_9fa48("80177") ? result.status !== 'rejected' : stryMutAct_9fa48("80176") ? false : stryMutAct_9fa48("80175") ? true : (stryCov_9fa48("80175", "80176", "80177"), result.status === (stryMutAct_9fa48("80178") ? "" : (stryCov_9fa48("80178"), 'rejected')))));
      if (stryMutAct_9fa48("80180") ? false : stryMutAct_9fa48("80179") ? true : (stryCov_9fa48("80179", "80180"), rejected)) {
        if (stryMutAct_9fa48("80181")) {
          {}
        } else {
          stryCov_9fa48("80181");
          throw rejected.reason;
        }
      }
      const successCount = stryMutAct_9fa48("80182") ? results.length : (stryCov_9fa48("80182"), results.filter(stryMutAct_9fa48("80183") ? () => undefined : (stryCov_9fa48("80183"), r => stryMutAct_9fa48("80186") ? r.status === 'fulfilled' || r.value.success : stryMutAct_9fa48("80185") ? false : stryMutAct_9fa48("80184") ? true : (stryCov_9fa48("80184", "80185", "80186"), (stryMutAct_9fa48("80188") ? r.status !== 'fulfilled' : stryMutAct_9fa48("80187") ? true : (stryCov_9fa48("80187", "80188"), r.status === (stryMutAct_9fa48("80189") ? "" : (stryCov_9fa48("80189"), 'fulfilled')))) && r.value.success))).length);
      this.logger.debug(INDEX_LOG_MSG.SQLITE_INDEX_COMPLETED, stryMutAct_9fa48("80190") ? {} : (stryCov_9fa48("80190"), {
        indexName,
        successCount,
        totalPartitions: partitions.length
      }));
    }
  }

  /**
   * Get all partitions for a table.
   * @param {string} tableId - Table ID.
   * @return {Promise<Array<Object>>} Array of partition services.
   * @private
   */
  async getPartitionsForTable(tableId) {
    if (stryMutAct_9fa48("80191")) {
      {}
    } else {
      stryCov_9fa48("80191");
      const partitions = stryMutAct_9fa48("80192") ? ["Stryker was here"] : (stryCov_9fa48("80192"), []);
      let partitionRecords = stryMutAct_9fa48("80193") ? ["Stryker was here"] : (stryCov_9fa48("80193"), []);
      if (stryMutAct_9fa48("80195") ? false : stryMutAct_9fa48("80194") ? true : (stryCov_9fa48("80194", "80195"), this.canReadMetadata())) {
        if (stryMutAct_9fa48("80196")) {
          {}
        } else {
          stryCov_9fa48("80196");
          const result = await this.getControlPlaneSystemTableGateway().readRows(TABLES.PARTITIONS, stryMutAct_9fa48("80197") ? "" : (stryCov_9fa48("80197"), 'SELECT * FROM partitions WHERE table_id = ?'), stryMutAct_9fa48("80198") ? [] : (stryCov_9fa48("80198"), [tableId]));
          partitionRecords = stryMutAct_9fa48("80201") ? result.rows && [] : stryMutAct_9fa48("80200") ? false : stryMutAct_9fa48("80199") ? true : (stryCov_9fa48("80199", "80200", "80201"), result.rows || (stryMutAct_9fa48("80202") ? ["Stryker was here"] : (stryCov_9fa48("80202"), [])));
        }
      }
      for (const record of partitionRecords) {
        if (stryMutAct_9fa48("80203")) {
          {}
        } else {
          stryCov_9fa48("80203");
          const partition = await this.getPartition(record.partition_id);
          if (stryMutAct_9fa48("80205") ? false : stryMutAct_9fa48("80204") ? true : (stryCov_9fa48("80204", "80205"), partition)) {
            if (stryMutAct_9fa48("80206")) {
              {}
            } else {
              stryCov_9fa48("80206");
              partitions.push(partition);
            }
          }
        }
      }
      return partitions;
    }
  }

  /**
   * Get a partition by ID.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Object|null>} Partition info or null.
   * @private
   */
  async getPartition(partitionId) {
    if (stryMutAct_9fa48("80207")) {
      {}
    } else {
      stryCov_9fa48("80207");
      if (stryMutAct_9fa48("80209") ? false : stryMutAct_9fa48("80208") ? true : (stryCov_9fa48("80208", "80209"), this.canReadMetadata())) {
        if (stryMutAct_9fa48("80210")) {
          {}
        } else {
          stryCov_9fa48("80210");
          const result = await this.getControlPlaneSystemTableGateway().readRows(TABLES.PARTITIONS, stryMutAct_9fa48("80211") ? "" : (stryCov_9fa48("80211"), 'SELECT * FROM partitions WHERE partition_id = ?'), stryMutAct_9fa48("80212") ? [] : (stryCov_9fa48("80212"), [partitionId]));
          return stryMutAct_9fa48("80215") ? result.rows?.[0] && null : stryMutAct_9fa48("80214") ? false : stryMutAct_9fa48("80213") ? true : (stryCov_9fa48("80213", "80214", "80215"), (stryMutAct_9fa48("80216") ? result.rows[0] : (stryCov_9fa48("80216"), result.rows?.[0])) || null);
        }
      }
      return null;
    }
  }

  /**
   * Drop an index from a table.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name to drop.
   * @return {Promise<boolean>} True if dropped successfully.
   */
  async dropIndex(tableId, indexName) {
    if (stryMutAct_9fa48("80217")) {
      {}
    } else {
      stryCov_9fa48("80217");
      this.logger.info(INDEX_LOG_MSG.DROPPING_INDEX, stryMutAct_9fa48("80218") ? {} : (stryCov_9fa48("80218"), {
        tableId,
        indexName
      }));

      // Get index metadata
      const indexMetadata = this.getIndex(tableId, indexName);
      if (stryMutAct_9fa48("80221") ? false : stryMutAct_9fa48("80220") ? true : stryMutAct_9fa48("80219") ? indexMetadata : (stryCov_9fa48("80219", "80220", "80221"), !indexMetadata)) {
        if (stryMutAct_9fa48("80222")) {
          {}
        } else {
          stryCov_9fa48("80222");
          throw new Error((stryMutAct_9fa48("80223") ? `` : (stryCov_9fa48("80223"), `${INDEX_ERROR_MSG.INDEX_NOT_FOUND_PREFIX}${indexName}`)) + (stryMutAct_9fa48("80224") ? `` : (stryCov_9fa48("80224"), `${INDEX_ERROR_MSG.INDEX_NOT_FOUND_MIDDLE}${tableId}`)) + INDEX_ERROR_MSG.INDEX_NOT_FOUND_SUFFIX);
        }
      }

      // Drop from indices system table via CDC
      if (stryMutAct_9fa48("80227") ? this.cdcIntegrationService && this.controlPlaneSystemTableGateway : stryMutAct_9fa48("80226") ? false : stryMutAct_9fa48("80225") ? true : (stryCov_9fa48("80225", "80226", "80227"), this.cdcIntegrationService || this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("80228")) {
          {}
        } else {
          stryCov_9fa48("80228");
          await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("80229") ? {} : (stryCov_9fa48("80229"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
            tableName: TABLES.INDICES,
            whereClause: stryMutAct_9fa48("80230") ? {} : (stryCov_9fa48("80230"), {
              index_id: indexMetadata.indexId
            })
          }), stryMutAct_9fa48("80231") ? {} : (stryCov_9fa48("80231"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("80232") ? "" : (stryCov_9fa48("80232"), 'critical')
          }));
        }
      }

      // Drop SQLite index from all partitions
      await this.dropSQLiteIndex(tableId, indexName);

      // Remove from local cache
      if (stryMutAct_9fa48("80234") ? false : stryMutAct_9fa48("80233") ? true : (stryCov_9fa48("80233", "80234"), this.indexCache.has(tableId))) {
        if (stryMutAct_9fa48("80235")) {
          {}
        } else {
          stryCov_9fa48("80235");
          this.indexCache.get(tableId).delete(indexName);
        }
      }
      this.logger.info(INDEX_LOG_MSG.INDEX_DROPPED, stryMutAct_9fa48("80236") ? {} : (stryCov_9fa48("80236"), {
        indexId: indexMetadata.indexId,
        tableId,
        indexName
      }));
      return stryMutAct_9fa48("80237") ? false : (stryCov_9fa48("80237"), true);
    }
  }

  /**
   * Drop SQLite index from all partitions for a table.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name.
   * @return {Promise<void>}
   * @private
   */
  async dropSQLiteIndex(tableId, indexName) {
    if (stryMutAct_9fa48("80238")) {
      {}
    } else {
      stryCov_9fa48("80238");
      const partitions = await this.getPartitionsForTable(tableId);
      const sql = stryMutAct_9fa48("80239") ? `` : (stryCov_9fa48("80239"), `DROP INDEX IF EXISTS ${indexName}`);
      const results = await Promise.allSettled(partitions.map(async partition => {
        if (stryMutAct_9fa48("80240")) {
          {}
        } else {
          stryCov_9fa48("80240");
          try {
            if (stryMutAct_9fa48("80241")) {
              {}
            } else {
              stryCov_9fa48("80241");
              await partition.executeQuery(sql, stryMutAct_9fa48("80242") ? ["Stryker was here"] : (stryCov_9fa48("80242"), []));
            }
          } catch (error) {
            if (stryMutAct_9fa48("80243")) {
              {}
            } else {
              stryCov_9fa48("80243");
              this.logger.error(INDEX_LOG_MSG.INDEX_DROP_FAILED, stryMutAct_9fa48("80244") ? {} : (stryCov_9fa48("80244"), {
                partitionId: partition.partitionId,
                indexName,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }));
      const rejected = results.find(stryMutAct_9fa48("80245") ? () => undefined : (stryCov_9fa48("80245"), result => stryMutAct_9fa48("80248") ? result.status !== 'rejected' : stryMutAct_9fa48("80247") ? false : stryMutAct_9fa48("80246") ? true : (stryCov_9fa48("80246", "80247", "80248"), result.status === (stryMutAct_9fa48("80249") ? "" : (stryCov_9fa48("80249"), 'rejected')))));
      if (stryMutAct_9fa48("80251") ? false : stryMutAct_9fa48("80250") ? true : (stryCov_9fa48("80250", "80251"), rejected)) {
        if (stryMutAct_9fa48("80252")) {
          {}
        } else {
          stryCov_9fa48("80252");
          throw rejected.reason;
        }
      }
    }
  }

  /**
   * Check if an index exists.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name.
   * @return {boolean} True if index exists.
   */
  indexExists(tableId, indexName) {
    if (stryMutAct_9fa48("80253")) {
      {}
    } else {
      stryCov_9fa48("80253");
      if (stryMutAct_9fa48("80256") ? false : stryMutAct_9fa48("80255") ? true : stryMutAct_9fa48("80254") ? this.indexCache.has(tableId) : (stryCov_9fa48("80254", "80255", "80256"), !this.indexCache.has(tableId))) {
        if (stryMutAct_9fa48("80257")) {
          {}
        } else {
          stryCov_9fa48("80257");
          return stryMutAct_9fa48("80258") ? true : (stryCov_9fa48("80258"), false);
        }
      }
      return this.indexCache.get(tableId).has(indexName);
    }
  }

  /**
   * Get index metadata.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name.
   * @return {Object|null} Index metadata or null.
   */
  getIndex(tableId, indexName) {
    if (stryMutAct_9fa48("80259")) {
      {}
    } else {
      stryCov_9fa48("80259");
      if (stryMutAct_9fa48("80262") ? false : stryMutAct_9fa48("80261") ? true : stryMutAct_9fa48("80260") ? this.indexCache.has(tableId) : (stryCov_9fa48("80260", "80261", "80262"), !this.indexCache.has(tableId))) {
        if (stryMutAct_9fa48("80263")) {
          {}
        } else {
          stryCov_9fa48("80263");
          return null;
        }
      }
      return stryMutAct_9fa48("80266") ? this.indexCache.get(tableId).get(indexName) && null : stryMutAct_9fa48("80265") ? false : stryMutAct_9fa48("80264") ? true : (stryCov_9fa48("80264", "80265", "80266"), this.indexCache.get(tableId).get(indexName) || null);
    }
  }

  /**
   * Get all indices for a table.
   * @param {string} tableId - Table ID.
   * @return {Array<Object>} Array of index metadata.
   */
  getIndicesForTable(tableId) {
    if (stryMutAct_9fa48("80267")) {
      {}
    } else {
      stryCov_9fa48("80267");
      if (stryMutAct_9fa48("80270") ? false : stryMutAct_9fa48("80269") ? true : stryMutAct_9fa48("80268") ? this.indexCache.has(tableId) : (stryCov_9fa48("80268", "80269", "80270"), !this.indexCache.has(tableId))) {
        if (stryMutAct_9fa48("80271")) {
          {}
        } else {
          stryCov_9fa48("80271");
          return stryMutAct_9fa48("80272") ? ["Stryker was here"] : (stryCov_9fa48("80272"), []);
        }
      }
      return Array.from(this.indexCache.get(tableId).values());
    }
  }

  /**
   * Get all indices in the system.
   * @return {Array<Object>} Array of all index metadata.
   */
  getAllIndices() {
    if (stryMutAct_9fa48("80273")) {
      {}
    } else {
      stryCov_9fa48("80273");
      const indices = stryMutAct_9fa48("80274") ? ["Stryker was here"] : (stryCov_9fa48("80274"), []);
      for (const tableIndices of this.indexCache.values()) {
        if (stryMutAct_9fa48("80275")) {
          {}
        } else {
          stryCov_9fa48("80275");
          indices.push(...tableIndices.values());
        }
      }
      return indices;
    }
  }

  /**
   * Get total index count.
   * @return {number} Total number of indices.
   */
  getTotalIndexCount() {
    if (stryMutAct_9fa48("80276")) {
      {}
    } else {
      stryCov_9fa48("80276");
      let count = 0;
      for (const tableIndices of this.indexCache.values()) {
        if (stryMutAct_9fa48("80277")) {
          {}
        } else {
          stryCov_9fa48("80277");
          stryMutAct_9fa48("80278") ? count -= tableIndices.size : (stryCov_9fa48("80278"), count += tableIndices.size);
        }
      }
      return count;
    }
  }

  /**
   * Handle CDC event for index cache updates.
   * @param {Object} cdcEvent - CDC event.
   * @return {Promise<void>}
   */
  async handleCDCEvent(cdcEvent) {
    if (stryMutAct_9fa48("80279")) {
      {}
    } else {
      stryCov_9fa48("80279");
      // Handle indices table CDC events
      if (stryMutAct_9fa48("80282") ? cdcEvent.tableName !== TABLES.INDICES : stryMutAct_9fa48("80281") ? false : stryMutAct_9fa48("80280") ? true : (stryCov_9fa48("80280", "80281", "80282"), cdcEvent.tableName === TABLES.INDICES)) {
        if (stryMutAct_9fa48("80283")) {
          {}
        } else {
          stryCov_9fa48("80283");
          await this.handleIndicesCDCEvent(cdcEvent);
          return;
        }
      }

      // Handle partitions table CDC events for automatic index maintenance
      if (stryMutAct_9fa48("80286") ? cdcEvent.tableName !== TABLES.PARTITIONS : stryMutAct_9fa48("80285") ? false : stryMutAct_9fa48("80284") ? true : (stryCov_9fa48("80284", "80285", "80286"), cdcEvent.tableName === TABLES.PARTITIONS)) {
        if (stryMutAct_9fa48("80287")) {
          {}
        } else {
          stryCov_9fa48("80287");
          await this.handlePartitionsCDCEvent(cdcEvent);
          return;
        }
      }
    }
  }

  /**
   * Handle CDC events for the indices table.
   * @param {Object} cdcEvent - CDC event.
   * @return {Promise<void>}
   * @private
   */
  async handleIndicesCDCEvent(cdcEvent) {
    if (stryMutAct_9fa48("80288")) {
      {}
    } else {
      stryCov_9fa48("80288");
      const {
        operation,
        data
      } = cdcEvent;
      switch (operation) {
        case stryMutAct_9fa48("80290") ? "" : (stryCov_9fa48("80290"), 'INSERT'):
          if (stryMutAct_9fa48("80289")) {} else {
            stryCov_9fa48("80289");
            {
              if (stryMutAct_9fa48("80291")) {
                {}
              } else {
                stryCov_9fa48("80291");
                const tableId = data.table_id;
                if (stryMutAct_9fa48("80294") ? false : stryMutAct_9fa48("80293") ? true : stryMutAct_9fa48("80292") ? this.indexCache.has(tableId) : (stryCov_9fa48("80292", "80293", "80294"), !this.indexCache.has(tableId))) {
                  if (stryMutAct_9fa48("80295")) {
                    {}
                  } else {
                    stryCov_9fa48("80295");
                    this.indexCache.set(tableId, new Map());
                  }
                }
                const indexMetadata = stryMutAct_9fa48("80296") ? {} : (stryCov_9fa48("80296"), {
                  indexId: data.index_id,
                  tableId: data.table_id,
                  indexName: data.index_name,
                  columnNames: JSON.parse(stryMutAct_9fa48("80299") ? data.column_names && STRING.EMPTY_JSON_ARRAY : stryMutAct_9fa48("80298") ? false : stryMutAct_9fa48("80297") ? true : (stryCov_9fa48("80297", "80298", "80299"), data.column_names || STRING.EMPTY_JSON_ARRAY)),
                  indexType: stryMutAct_9fa48("80302") ? data.index_type && IndexType.BTREE : stryMutAct_9fa48("80301") ? false : stryMutAct_9fa48("80300") ? true : (stryCov_9fa48("80300", "80301", "80302"), data.index_type || IndexType.BTREE),
                  createdAt: data.created_at
                });
                this.indexCache.get(tableId).set(data.index_name, indexMetadata);
                this.logger.debug(INDEX_LOG_MSG.INDEX_ADDED_FROM_CDC, stryMutAct_9fa48("80303") ? {} : (stryCov_9fa48("80303"), {
                  indexId: data.index_id,
                  indexName: data.index_name
                }));
                break;
              }
            }
          }
        case stryMutAct_9fa48("80305") ? "" : (stryCov_9fa48("80305"), 'DELETE'):
          if (stryMutAct_9fa48("80304")) {} else {
            stryCov_9fa48("80304");
            {
              if (stryMutAct_9fa48("80306")) {
                {}
              } else {
                stryCov_9fa48("80306");
                const tableId = data.table_id;
                if (stryMutAct_9fa48("80308") ? false : stryMutAct_9fa48("80307") ? true : (stryCov_9fa48("80307", "80308"), this.indexCache.has(tableId))) {
                  if (stryMutAct_9fa48("80309")) {
                    {}
                  } else {
                    stryCov_9fa48("80309");
                    this.indexCache.get(tableId).delete(data.index_name);
                    this.logger.debug(INDEX_LOG_MSG.INDEX_REMOVED_FROM_CDC, stryMutAct_9fa48("80310") ? {} : (stryCov_9fa48("80310"), {
                      indexId: data.index_id,
                      indexName: data.index_name
                    }));
                  }
                }
                break;
              }
            }
          }
        default:
          if (stryMutAct_9fa48("80311")) {} else {
            stryCov_9fa48("80311");
            // UPDATE not typically used for indices
            break;
          }
      }
    }
  }

  /**
   * Handle CDC events for the partitions table.
   * When a new partition is created, ensure all indices for that table
   * are created on the new partition.
   * Requirements: 12.3, 12.5
   * @param {Object} cdcEvent - CDC event.
   * @return {Promise<void>}
   * @private
   */
  async handlePartitionsCDCEvent(cdcEvent) {
    if (stryMutAct_9fa48("80312")) {
      {}
    } else {
      stryCov_9fa48("80312");
      const {
        operation,
        data
      } = cdcEvent;

      // Only handle INSERT events (new partitions)
      if (stryMutAct_9fa48("80315") ? operation === 'INSERT' : stryMutAct_9fa48("80314") ? false : stryMutAct_9fa48("80313") ? true : (stryCov_9fa48("80313", "80314", "80315"), operation !== (stryMutAct_9fa48("80316") ? "" : (stryCov_9fa48("80316"), 'INSERT')))) {
        if (stryMutAct_9fa48("80317")) {
          {}
        } else {
          stryCov_9fa48("80317");
          return;
        }
      }
      const tableId = data.table_id;
      const partitionId = data.partition_id;

      // Get all indices for this table
      const indices = this.getIndicesForTable(tableId);
      if (stryMutAct_9fa48("80320") ? indices.length !== 0 : stryMutAct_9fa48("80319") ? false : stryMutAct_9fa48("80318") ? true : (stryCov_9fa48("80318", "80319", "80320"), indices.length === 0)) {
        if (stryMutAct_9fa48("80321")) {
          {}
        } else {
          stryCov_9fa48("80321");
          return;
        }
      }
      this.logger.info(INDEX_LOG_MSG.CREATING_INDICES_FOR_PARTITION, stryMutAct_9fa48("80322") ? {} : (stryCov_9fa48("80322"), {
        tableId,
        partitionId,
        indexCount: indices.length
      }));

      // Create each index on the new partition
      for (const index of indices) {
        if (stryMutAct_9fa48("80323")) {
          {}
        } else {
          stryCov_9fa48("80323");
          await this.createIndexOnPartition(partitionId, index);
        }
      }
    }
  }

  /**
   * Create an index on a specific partition.
   * Requirements: 12.3, 12.5
   * @param {string} partitionId - Partition ID.
   * @param {Object} indexMetadata - Index metadata.
   * @return {Promise<boolean>} True if successful.
   * @private
   */
  async createIndexOnPartition(partitionId, indexMetadata) {
    if (stryMutAct_9fa48("80324")) {
      {}
    } else {
      stryCov_9fa48("80324");
      const partition = await this.getPartition(partitionId);
      if (stryMutAct_9fa48("80327") ? false : stryMutAct_9fa48("80326") ? true : stryMutAct_9fa48("80325") ? partition : (stryCov_9fa48("80325", "80326", "80327"), !partition)) {
        if (stryMutAct_9fa48("80328")) {
          {}
        } else {
          stryCov_9fa48("80328");
          this.logger.warn(INDEX_LOG_MSG.PARTITION_NOT_FOUND, stryMutAct_9fa48("80329") ? {} : (stryCov_9fa48("80329"), {
            partitionId,
            indexName: indexMetadata.indexName
          }));
          return stryMutAct_9fa48("80330") ? true : (stryCov_9fa48("80330"), false);
        }
      }
      const tableName = partition.tableName;
      const columns = indexMetadata.columnNames.join(stryMutAct_9fa48("80331") ? "" : (stryCov_9fa48("80331"), ', '));
      const sql = (stryMutAct_9fa48("80332") ? `` : (stryCov_9fa48("80332"), `CREATE INDEX IF NOT EXISTS ${indexMetadata.indexName} `)) + (stryMutAct_9fa48("80333") ? `` : (stryCov_9fa48("80333"), `ON ${tableName}(${columns})`));
      try {
        if (stryMutAct_9fa48("80334")) {
          {}
        } else {
          stryCov_9fa48("80334");
          await partition.executeQuery(sql, stryMutAct_9fa48("80335") ? ["Stryker was here"] : (stryCov_9fa48("80335"), []));
          this.logger.debug(INDEX_LOG_MSG.INDEX_CREATED_ON_PARTITION, stryMutAct_9fa48("80336") ? {} : (stryCov_9fa48("80336"), {
            partitionId,
            indexName: indexMetadata.indexName
          }));
          return stryMutAct_9fa48("80337") ? false : (stryCov_9fa48("80337"), true);
        }
      } catch (error) {
        if (stryMutAct_9fa48("80338")) {
          {}
        } else {
          stryCov_9fa48("80338");
          this.logger.error(INDEX_LOG_MSG.PARTITION_INDEX_FAILED, stryMutAct_9fa48("80339") ? {} : (stryCov_9fa48("80339"), {
            partitionId,
            indexName: indexMetadata.indexName,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Ensure all indices exist on a partition.
   * Called when a partition is registered or becomes available.
   * Requirements: 12.3, 12.5
   * @param {string} partitionId - Partition ID.
   * @param {string} tableId - Table ID.
   * @return {Promise<number>} Number of indices created.
   */
  async ensureIndicesOnPartition(partitionId, tableId) {
    if (stryMutAct_9fa48("80340")) {
      {}
    } else {
      stryCov_9fa48("80340");
      const indices = this.getIndicesForTable(tableId);
      if (stryMutAct_9fa48("80343") ? indices.length !== 0 : stryMutAct_9fa48("80342") ? false : stryMutAct_9fa48("80341") ? true : (stryCov_9fa48("80341", "80342", "80343"), indices.length === 0)) {
        if (stryMutAct_9fa48("80344")) {
          {}
        } else {
          stryCov_9fa48("80344");
          return 0;
        }
      }
      this.logger.debug(INDEX_LOG_MSG.ENSURING_INDICES, stryMutAct_9fa48("80345") ? {} : (stryCov_9fa48("80345"), {
        partitionId,
        tableId,
        indexCount: indices.length
      }));
      let createdCount = 0;
      for (const index of indices) {
        if (stryMutAct_9fa48("80346")) {
          {}
        } else {
          stryCov_9fa48("80346");
          const success = await this.createIndexOnPartition(partitionId, index);
          if (stryMutAct_9fa48("80348") ? false : stryMutAct_9fa48("80347") ? true : (stryCov_9fa48("80347", "80348"), success)) {
            if (stryMutAct_9fa48("80349")) {
              {}
            } else {
              stryCov_9fa48("80349");
              stryMutAct_9fa48("80350") ? createdCount-- : (stryCov_9fa48("80350"), createdCount++);
            }
          }
        }
      }
      return createdCount;
    }
  }

  /**
   * Rebuild an index on all partitions for a table.
   * Useful for maintenance or after schema changes.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name.
   * @return {Promise<Object>} Rebuild result.
   */
  async rebuildIndex(tableId, indexName) {
    if (stryMutAct_9fa48("80351")) {
      {}
    } else {
      stryCov_9fa48("80351");
      const indexMetadata = this.getIndex(tableId, indexName);
      if (stryMutAct_9fa48("80354") ? false : stryMutAct_9fa48("80353") ? true : stryMutAct_9fa48("80352") ? indexMetadata : (stryCov_9fa48("80352", "80353", "80354"), !indexMetadata)) {
        if (stryMutAct_9fa48("80355")) {
          {}
        } else {
          stryCov_9fa48("80355");
          throw new Error((stryMutAct_9fa48("80356") ? `` : (stryCov_9fa48("80356"), `${INDEX_ERROR_MSG.INDEX_NOT_FOUND_PREFIX}${indexName}`)) + (stryMutAct_9fa48("80357") ? `` : (stryCov_9fa48("80357"), `${INDEX_ERROR_MSG.INDEX_NOT_FOUND_MIDDLE}${tableId}`)) + INDEX_ERROR_MSG.INDEX_NOT_FOUND_SUFFIX);
        }
      }
      this.logger.info(INDEX_LOG_MSG.REBUILDING_INDEX, stryMutAct_9fa48("80358") ? {} : (stryCov_9fa48("80358"), {
        tableId,
        indexName
      }));
      const partitions = await this.getPartitionsForTable(tableId);
      let successCount = 0;
      const failCount = 0;
      for (const partition of partitions) {
        if (stryMutAct_9fa48("80359")) {
          {}
        } else {
          stryCov_9fa48("80359");
          const tableName = partition.tableName;
          const columns = indexMetadata.columnNames.join(stryMutAct_9fa48("80360") ? "" : (stryCov_9fa48("80360"), ', '));
          try {
            if (stryMutAct_9fa48("80361")) {
              {}
            } else {
              stryCov_9fa48("80361");
              // Drop and recreate the index
              await partition.executeQuery(stryMutAct_9fa48("80362") ? `` : (stryCov_9fa48("80362"), `DROP INDEX IF EXISTS ${indexName}`), stryMutAct_9fa48("80363") ? ["Stryker was here"] : (stryCov_9fa48("80363"), []));
              await partition.executeQuery(stryMutAct_9fa48("80364") ? `` : (stryCov_9fa48("80364"), `CREATE INDEX ${indexName} ON ${tableName}(${columns})`), stryMutAct_9fa48("80365") ? ["Stryker was here"] : (stryCov_9fa48("80365"), []));
              stryMutAct_9fa48("80366") ? successCount-- : (stryCov_9fa48("80366"), successCount++);
            }
          } catch (error) {
            if (stryMutAct_9fa48("80367")) {
              {}
            } else {
              stryCov_9fa48("80367");
              this.logger.error(INDEX_LOG_MSG.INDEX_REBUILD_FAILED, stryMutAct_9fa48("80368") ? {} : (stryCov_9fa48("80368"), {
                partitionId: partition.partitionId,
                indexName,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }
      return stryMutAct_9fa48("80369") ? {} : (stryCov_9fa48("80369"), {
        indexName,
        tableId,
        totalPartitions: partitions.length,
        successCount,
        failCount
      });
    }
  }

  /**
   * Set the system table cache.
   * @param {Object} cache - System table cache.
   */
  setSystemTableCache(cache) {
    if (stryMutAct_9fa48("80370")) {
      {}
    } else {
      stryCov_9fa48("80370");
      this.systemTableCache = cache;
    }
  }

  /**
   * Set the CDC integration service.
   * @param {Object} service - CDC integration service.
   */
  setCDCIntegrationService(service) {
    if (stryMutAct_9fa48("80371")) {
      {}
    } else {
      stryCov_9fa48("80371");
      this.cdcIntegrationService = service;
    }
  }
  canReadMetadata() {
    if (stryMutAct_9fa48("80372")) {
      {}
    } else {
      stryCov_9fa48("80372");
      return Boolean(stryMutAct_9fa48("80375") ? (this.controlPlaneSystemTableGateway || this.sqlQueryEngine) && this.cdcIntegrationService : stryMutAct_9fa48("80374") ? false : stryMutAct_9fa48("80373") ? true : (stryCov_9fa48("80373", "80374", "80375"), (stryMutAct_9fa48("80377") ? this.controlPlaneSystemTableGateway && this.sqlQueryEngine : stryMutAct_9fa48("80376") ? false : (stryCov_9fa48("80376", "80377"), this.controlPlaneSystemTableGateway || this.sqlQueryEngine)) || this.cdcIntegrationService));
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("80378")) {
      {}
    } else {
      stryCov_9fa48("80378");
      if (stryMutAct_9fa48("80380") ? false : stryMutAct_9fa48("80379") ? true : (stryCov_9fa48("80379", "80380"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("80381")) {
          {}
        } else {
          stryCov_9fa48("80381");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("80382") ? {} : (stryCov_9fa48("80382"), {
        getCdcIntegrationService: stryMutAct_9fa48("80383") ? () => undefined : (stryCov_9fa48("80383"), () => this.cdcIntegrationService),
        getSqlQueryEngine: stryMutAct_9fa48("80384") ? () => undefined : (stryCov_9fa48("80384"), () => this.sqlQueryEngine),
        getSystemTableCache: stryMutAct_9fa48("80385") ? () => undefined : (stryCov_9fa48("80385"), () => this.systemTableCache)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Shutdown the index service.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("80386")) {
      {}
    } else {
      stryCov_9fa48("80386");
      this.logger.info(INDEX_LOG_MSG.SHUTTING_DOWN);
      this.indexCache.clear();
      this.initialized = stryMutAct_9fa48("80387") ? true : (stryCov_9fa48("80387"), false);
    }
  }
}
export { IndexService, IndexType };