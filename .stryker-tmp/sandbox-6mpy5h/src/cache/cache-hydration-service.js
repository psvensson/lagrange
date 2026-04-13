/**
 * Cache Hydration Service - Populates SystemTableCache on startup.
 * Queries system table partitions and populates the cache with existing data.
 * Requirements: 1.1, 1.2, 1.5, 1.6, 1.7
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
import { CDC_OPERATION, METRICS_LOG_TAG, NUM, TYPEOF } from '../constants/index.js';
import { CACHE_HYDRATION_ERROR_MSG, CACHE_HYDRATION_DEFAULT_OPTIONS, CACHE_HYDRATION_LOG_MSG, CACHE_HYDRATION_METRICS, CACHE_HYDRATION_NOW, CACHE_HYDRATION_SQL, CACHE_HYDRATION_TABLES, CACHE_SUBSYSTEM } from './cache-constants.js';

/**
 * CacheHydrationService populates the SystemTableCache with existing data
 * from system table partitions on startup.
 */
class CacheHydrationService {
  /**
   * Create a new CacheHydrationService.
   * @param {Object} queryEngine - SQL query engine for querying partitions
   * @param {Object} systemTableCache - SystemTableCache to populate
   * @param {Object} [options] - Optional configuration.
   * @param {Object} [options.logger] - Optional logger instance.
   * @param {Function} [options.cdcEventApplier] - CDC event applier.
   */
  constructor(queryEngine, systemTableCache, options = CACHE_HYDRATION_DEFAULT_OPTIONS) {
    if (stryMutAct_9fa48("33771")) {
      {}
    } else {
      stryCov_9fa48("33771");
      this.queryEngine = queryEngine;
      this.systemTableCache = systemTableCache;
      this.logger = stryMutAct_9fa48("33774") ? options.logger && this.initLogger() : stryMutAct_9fa48("33773") ? false : stryMutAct_9fa48("33772") ? true : (stryCov_9fa48("33772", "33773", "33774"), options.logger || this.initLogger());
      this.now = (stryMutAct_9fa48("33777") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("33776") ? false : stryMutAct_9fa48("33775") ? true : (stryCov_9fa48("33775", "33776", "33777"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : CACHE_HYDRATION_NOW;
      this.cdcEventApplier = stryMutAct_9fa48("33778") ? options.cdcEventApplier && null : (stryCov_9fa48("33778"), options.cdcEventApplier ?? null);
      if (stryMutAct_9fa48("33781") ? typeof this.cdcEventApplier === TYPEOF.FUNCTION : stryMutAct_9fa48("33780") ? false : stryMutAct_9fa48("33779") ? true : (stryCov_9fa48("33779", "33780", "33781"), typeof this.cdcEventApplier !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("33782")) {
          {}
        } else {
          stryCov_9fa48("33782");
          throw new Error(CACHE_HYDRATION_ERROR_MSG.MISSING_CDC_EVENT_APPLIER);
        }
      }
    }
  }

  /**
   * Initialize logger if not provided.
   * @return {Object} Logger instance
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("33783")) {
      {}
    } else {
      stryCov_9fa48("33783");
      try {
        if (stryMutAct_9fa48("33784")) {
          {}
        } else {
          stryCov_9fa48("33784");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("33786") ? false : stryMutAct_9fa48("33785") ? true : (stryCov_9fa48("33785", "33786"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("33787")) {
              {}
            } else {
              stryCov_9fa48("33787");
              return loggingService.forSubsystem(CACHE_SUBSYSTEM.HYDRATION);
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("33788")) {
          {}
        } else {
          stryCov_9fa48("33788");
          this.reportNonFatalLoggingFailure(CACHE_HYDRATION_LOG_MSG.LOGGER_INIT_UNAVAILABLE, error);
        }
      }
      return console;
    }
  }

  /**
   * Best-effort reporting for non-fatal logger/metrics path failures.
   *
   * @param {string} message - Context message.
   * @param {Error} error - Underlying error.
   * @private
   */
  reportNonFatalLoggingFailure(message, error) {
    if (stryMutAct_9fa48("33789")) {
      {}
    } else {
      stryCov_9fa48("33789");
      if (stryMutAct_9fa48("33792") ? typeof console?.debug === 'function' : stryMutAct_9fa48("33791") ? false : stryMutAct_9fa48("33790") ? true : (stryCov_9fa48("33790", "33791", "33792"), typeof (stryMutAct_9fa48("33793") ? console.debug : (stryCov_9fa48("33793"), console?.debug)) !== (stryMutAct_9fa48("33794") ? "" : (stryCov_9fa48("33794"), 'function')))) {
        if (stryMutAct_9fa48("33795")) {
          {}
        } else {
          stryCov_9fa48("33795");
          return;
        }
      }
      console.debug(message, stryMutAct_9fa48("33796") ? {} : (stryCov_9fa48("33796"), {
        error: stryMutAct_9fa48("33799") ? error?.message && null : stryMutAct_9fa48("33798") ? false : stryMutAct_9fa48("33797") ? true : (stryCov_9fa48("33797", "33798", "33799"), (stryMutAct_9fa48("33800") ? error.message : (stryCov_9fa48("33800"), error?.message)) || null)
      }));
    }
  }

  /**
   * Get the list of system tables to hydrate.
   * @return {Array<string>} Array of system table names
   */
  getSystemTables() {
    if (stryMutAct_9fa48("33801")) {
      {}
    } else {
      stryCov_9fa48("33801");
      return stryMutAct_9fa48("33802") ? [] : (stryCov_9fa48("33802"), [...CACHE_HYDRATION_TABLES]);
    }
  }

  /**
   * Hydrate the cache with existing data from all system table partitions.
   * Called after bootstrap completes and Raft leadership is established.
   * Does NOT generate CDC events - directly populates the cache.
   *
   * Requirements: 1.1, 1.2, 1.5, 1.7
   *
   * @return {Promise<Object>} Hydration result with counts per table
   */
  async hydrateCache() {
    if (stryMutAct_9fa48("33803")) {
      {}
    } else {
      stryCov_9fa48("33803");
      this.logger.info(CACHE_HYDRATION_LOG_MSG.STARTING);
      const totalStartMs = this.now();
      let totalRows = 0;
      const results = stryMutAct_9fa48("33804") ? {} : (stryCov_9fa48("33804"), {
        success: stryMutAct_9fa48("33805") ? false : (stryCov_9fa48("33805"), true),
        tables: {},
        errors: stryMutAct_9fa48("33806") ? ["Stryker was here"] : (stryCov_9fa48("33806"), [])
      });
      for (const tableName of CACHE_HYDRATION_TABLES) {
        if (stryMutAct_9fa48("33807")) {
          {}
        } else {
          stryCov_9fa48("33807");
          try {
            if (stryMutAct_9fa48("33808")) {
              {}
            } else {
              stryCov_9fa48("33808");
              const rowCount = await this.hydrateTable(tableName);
              stryMutAct_9fa48("33809") ? totalRows -= rowCount : (stryCov_9fa48("33809"), totalRows += rowCount);
              results.tables[tableName] = stryMutAct_9fa48("33810") ? {} : (stryCov_9fa48("33810"), {
                success: stryMutAct_9fa48("33811") ? false : (stryCov_9fa48("33811"), true),
                rowCount
              });
              this.logger.info(CACHE_HYDRATION_LOG_MSG.TABLE_HYDRATED, stryMutAct_9fa48("33812") ? {} : (stryCov_9fa48("33812"), {
                tableName,
                rowCount
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("33813")) {
              {}
            } else {
              stryCov_9fa48("33813");
              this.logger.error(CACHE_HYDRATION_LOG_MSG.TABLE_FAILED, stryMutAct_9fa48("33814") ? {} : (stryCov_9fa48("33814"), {
                tableName,
                error: error.message
              }));
              results.tables[tableName] = stryMutAct_9fa48("33815") ? {} : (stryCov_9fa48("33815"), {
                success: stryMutAct_9fa48("33816") ? true : (stryCov_9fa48("33816"), false),
                error: error.message
              });
              results.errors.push(stryMutAct_9fa48("33817") ? {} : (stryCov_9fa48("33817"), {
                tableName,
                error: error.message
              }));
            }
          }
        }
      }

      // Mark overall success as false if any table failed
      if (stryMutAct_9fa48("33821") ? results.errors.length <= 0 : stryMutAct_9fa48("33820") ? results.errors.length >= 0 : stryMutAct_9fa48("33819") ? false : stryMutAct_9fa48("33818") ? true : (stryCov_9fa48("33818", "33819", "33820", "33821"), results.errors.length > 0)) {
        if (stryMutAct_9fa48("33822")) {
          {}
        } else {
          stryCov_9fa48("33822");
          results.success = stryMutAct_9fa48("33823") ? true : (stryCov_9fa48("33823"), false);
        }
      }
      this.logger.info(CACHE_HYDRATION_LOG_MSG.COMPLETE, stryMutAct_9fa48("33824") ? {} : (stryCov_9fa48("33824"), {
        tablesHydrated: Object.keys(results.tables).length,
        errors: results.errors.length
      }));
      try {
        if (stryMutAct_9fa48("33825")) {
          {}
        } else {
          stryCov_9fa48("33825");
          this.logger.info(METRICS_LOG_TAG.HYDRATION_COMPLETE, stryMutAct_9fa48("33826") ? {} : (stryCov_9fa48("33826"), {
            tableCount: CACHE_HYDRATION_TABLES.length,
            totalDurationMs: stryMutAct_9fa48("33827") ? this.now() + totalStartMs : (stryCov_9fa48("33827"), this.now() - totalStartMs),
            totalRows
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("33828")) {
          {}
        } else {
          stryCov_9fa48("33828");
          this.reportNonFatalLoggingFailure(CACHE_HYDRATION_LOG_MSG.METRICS_LOG_UNAVAILABLE, error);
        }
      }
      return results;
    }
  }

  /**
   * Hydrate a single system table.
   * @param {string} tableName - Name of the system table to hydrate
   * @return {Promise<number>} Number of rows hydrated
   * @private
   */
  async hydrateTable(tableName) {
    if (stryMutAct_9fa48("33829")) {
      {}
    } else {
      stryCov_9fa48("33829");
      const startMs = this.now();
      const sql = CACHE_HYDRATION_SQL.selectAll(tableName);
      const result = await this.queryEngine.executeQuery(sql);
      if (stryMutAct_9fa48("33832") ? false : stryMutAct_9fa48("33831") ? true : stryMutAct_9fa48("33830") ? result.success : (stryCov_9fa48("33830", "33831", "33832"), !result.success)) {
        if (stryMutAct_9fa48("33833")) {
          {}
        } else {
          stryCov_9fa48("33833");
          throw new Error(stryMutAct_9fa48("33836") ? result.error && CACHE_HYDRATION_ERROR_MSG.queryFailed(tableName) : stryMutAct_9fa48("33835") ? false : stryMutAct_9fa48("33834") ? true : (stryCov_9fa48("33834", "33835", "33836"), result.error || CACHE_HYDRATION_ERROR_MSG.queryFailed(tableName)));
        }
      }
      const rows = stryMutAct_9fa48("33839") ? result.rows && [] : stryMutAct_9fa48("33838") ? false : stryMutAct_9fa48("33837") ? true : (stryCov_9fa48("33837", "33838", "33839"), result.rows || (stryMutAct_9fa48("33840") ? ["Stryker was here"] : (stryCov_9fa48("33840"), [])));
      for (const row of rows) {
        if (stryMutAct_9fa48("33841")) {
          {}
        } else {
          stryCov_9fa48("33841");
          await this.cdcEventApplier(tableName, CDC_OPERATION.INSERT, row);
        }
      }
      const rowCount = rows.length;
      const durationMs = stryMutAct_9fa48("33842") ? this.now() + startMs : (stryCov_9fa48("33842"), this.now() - startMs);
      try {
        if (stryMutAct_9fa48("33843")) {
          {}
        } else {
          stryCov_9fa48("33843");
          this.logger.info(METRICS_LOG_TAG.HYDRATION_TABLE, stryMutAct_9fa48("33844") ? {} : (stryCov_9fa48("33844"), {
            tableName,
            rowCount,
            durationMs,
            rowsPerSecond: (stryMutAct_9fa48("33848") ? durationMs <= NUM.ZERO : stryMutAct_9fa48("33847") ? durationMs >= NUM.ZERO : stryMutAct_9fa48("33846") ? false : stryMutAct_9fa48("33845") ? true : (stryCov_9fa48("33845", "33846", "33847", "33848"), durationMs > NUM.ZERO)) ? Math.round(stryMutAct_9fa48("33849") ? rowCount * (durationMs / CACHE_HYDRATION_METRICS.MS_PER_SECOND) : (stryCov_9fa48("33849"), rowCount / (stryMutAct_9fa48("33850") ? durationMs * CACHE_HYDRATION_METRICS.MS_PER_SECOND : (stryCov_9fa48("33850"), durationMs / CACHE_HYDRATION_METRICS.MS_PER_SECOND)))) : CACHE_HYDRATION_METRICS.ZERO_ROWS_PER_SECOND
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("33851")) {
          {}
        } else {
          stryCov_9fa48("33851");
          this.reportNonFatalLoggingFailure(CACHE_HYDRATION_LOG_MSG.METRICS_LOG_UNAVAILABLE, error);
        }
      }
      return rowCount;
    }
  }
}
export { CacheHydrationService, CACHE_HYDRATION_TABLES as SYSTEM_TABLES_TO_HYDRATE };