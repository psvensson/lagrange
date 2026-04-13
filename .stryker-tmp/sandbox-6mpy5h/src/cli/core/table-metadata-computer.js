/**
 * Table Metadata Computer - Computes display metadata from cached partition data
 *
 * Computes partition_count and replica_factor for tables based on partition data
 * in the Remote Cache. Implements caching to avoid redundant calculations.
 * Uses selective invalidation to only recompute metadata for tables affected
 * by CDC events.
 *
 * Requirements: 4.6, 4.7, 12.10, 13.8, 13.9
 */
// @ts-nocheck


/**
 * TableMetadataComputer computes display metadata (partition_count, replica_factor)
 * from cached partition data.
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
export class TableMetadataComputer {
  /**
   * Creates a new TableMetadataComputer
   * @param {Object} cache - The RemoteCache instance to read partition data from
   */
  constructor(cache) {
    if (stryMutAct_9fa48("44431")) {
      {}
    } else {
      stryCov_9fa48("44431");
      this.cache = cache;
      this.metadataCache = new Map();
      this.lastCacheUpdate = null;
    }
  }

  /**
   * Compute enriched metadata for a table
   * Requirements: 4.6, 4.7, 12.10, 13.8, 13.9
   * @param {Object} table - The table record to enrich
   * @return {Object} Table with computed partition_count and replica_factor
   */
  computeMetadata(table) {
    if (stryMutAct_9fa48("44432")) {
      {}
    } else {
      stryCov_9fa48("44432");
      if (stryMutAct_9fa48("44435") ? !table && !table.table_id : stryMutAct_9fa48("44434") ? false : stryMutAct_9fa48("44433") ? true : (stryCov_9fa48("44433", "44434", "44435"), (stryMutAct_9fa48("44436") ? table : (stryCov_9fa48("44436"), !table)) || (stryMutAct_9fa48("44437") ? table.table_id : (stryCov_9fa48("44437"), !table.table_id)))) {
        if (stryMutAct_9fa48("44438")) {
          {}
        } else {
          stryCov_9fa48("44438");
          return table;
        }
      }

      // Always check for and process affected tables (Requirements: 12.10, 13.8)
      // This handles CDC events that may have occurred since last computation
      this.invalidateAffectedTables();

      // Check metadata cache first
      const cacheKey = table.table_id;
      if (stryMutAct_9fa48("44440") ? false : stryMutAct_9fa48("44439") ? true : (stryCov_9fa48("44439", "44440"), this.metadataCache.has(cacheKey))) {
        if (stryMutAct_9fa48("44441")) {
          {}
        } else {
          stryCov_9fa48("44441");
          return this.metadataCache.get(cacheKey);
        }
      }

      // Compute metadata
      const enriched = stryMutAct_9fa48("44442") ? {} : (stryCov_9fa48("44442"), {
        ...table,
        partition_count: this.computePartitionCount(table.table_id),
        replica_factor: this.computeReplicaFactor(table.table_id),
        total_size: this.computeTotalSize(table.table_id)
      });

      // Cache the result
      this.metadataCache.set(cacheKey, enriched);
      this.lastCacheUpdate = Date.now();
      return enriched;
    }
  }

  /**
   * Invalidate metadata cache only for tables affected by CDC events
   * Requirements: 12.10, 13.8
   */
  invalidateAffectedTables() {
    if (stryMutAct_9fa48("44443")) {
      {}
    } else {
      stryCov_9fa48("44443");
      const affectedTables = this.cache.getAndClearAffectedTables();
      for (const tableId of affectedTables) {
        if (stryMutAct_9fa48("44444")) {
          {}
        } else {
          stryCov_9fa48("44444");
          this.metadataCache.delete(tableId);
        }
      }
    }
  }

  /**
   * Compute partition count for a table
   * Requirements: 4.6, 4.9
   * @param {string} tableId - The table ID
   * @return {number} Number of partitions for the table
   */
  computePartitionCount(tableId) {
    if (stryMutAct_9fa48("44445")) {
      {}
    } else {
      stryCov_9fa48("44445");
      try {
        if (stryMutAct_9fa48("44446")) {
          {}
        } else {
          stryCov_9fa48("44446");
          const partitions = this.cache.getPartitions(stryMutAct_9fa48("44447") ? {} : (stryCov_9fa48("44447"), {
            tableId
          }));
          return partitions.length;
        }
      } catch (_err) {
        if (stryMutAct_9fa48("44448")) {
          {}
        } else {
          stryCov_9fa48("44448");
          // Graceful degradation - return 0 on error
          return 0;
        }
      }
    }
  }

  /**
   * Compute replica factor as the most common replica_count value
   * Requirements: 4.7
   * @param {string} tableId - The table ID
   * @return {number|null} Most common replica count, or null if no partitions
   */
  computeReplicaFactor(tableId) {
    if (stryMutAct_9fa48("44449")) {
      {}
    } else {
      stryCov_9fa48("44449");
      try {
        if (stryMutAct_9fa48("44450")) {
          {}
        } else {
          stryCov_9fa48("44450");
          const partitions = this.cache.getPartitions(stryMutAct_9fa48("44451") ? {} : (stryCov_9fa48("44451"), {
            tableId
          }));
          if (stryMutAct_9fa48("44454") ? partitions.length !== 0 : stryMutAct_9fa48("44453") ? false : stryMutAct_9fa48("44452") ? true : (stryCov_9fa48("44452", "44453", "44454"), partitions.length === 0)) {
            if (stryMutAct_9fa48("44455")) {
              {}
            } else {
              stryCov_9fa48("44455");
              return null;
            }
          }

          // Count occurrences of each replica_count
          const counts = {};
          for (const partition of partitions) {
            if (stryMutAct_9fa48("44456")) {
              {}
            } else {
              stryCov_9fa48("44456");
              const count = partition.replica_count;
              if (stryMutAct_9fa48("44459") ? count !== undefined || count !== null : stryMutAct_9fa48("44458") ? false : stryMutAct_9fa48("44457") ? true : (stryCov_9fa48("44457", "44458", "44459"), (stryMutAct_9fa48("44461") ? count === undefined : stryMutAct_9fa48("44460") ? true : (stryCov_9fa48("44460", "44461"), count !== undefined)) && (stryMutAct_9fa48("44463") ? count === null : stryMutAct_9fa48("44462") ? true : (stryCov_9fa48("44462", "44463"), count !== null)))) {
                if (stryMutAct_9fa48("44464")) {
                  {}
                } else {
                  stryCov_9fa48("44464");
                  counts[count] = stryMutAct_9fa48("44465") ? (counts[count] || 0) - 1 : (stryCov_9fa48("44465"), (stryMutAct_9fa48("44468") ? counts[count] && 0 : stryMutAct_9fa48("44467") ? false : stryMutAct_9fa48("44466") ? true : (stryCov_9fa48("44466", "44467", "44468"), counts[count] || 0)) + 1);
                }
              }
            }
          }

          // Handle case where no partitions have replica_count
          if (stryMutAct_9fa48("44471") ? Object.keys(counts).length !== 0 : stryMutAct_9fa48("44470") ? false : stryMutAct_9fa48("44469") ? true : (stryCov_9fa48("44469", "44470", "44471"), Object.keys(counts).length === 0)) {
            if (stryMutAct_9fa48("44472")) {
              {}
            } else {
              stryCov_9fa48("44472");
              return null;
            }
          }

          // Return most common value
          let maxCount = 0;
          let mostCommon = null;
          for (const [value, count] of Object.entries(counts)) {
            if (stryMutAct_9fa48("44473")) {
              {}
            } else {
              stryCov_9fa48("44473");
              if (stryMutAct_9fa48("44477") ? count <= maxCount : stryMutAct_9fa48("44476") ? count >= maxCount : stryMutAct_9fa48("44475") ? false : stryMutAct_9fa48("44474") ? true : (stryCov_9fa48("44474", "44475", "44476", "44477"), count > maxCount)) {
                if (stryMutAct_9fa48("44478")) {
                  {}
                } else {
                  stryCov_9fa48("44478");
                  maxCount = count;
                  mostCommon = parseInt(value, 10);
                }
              }
            }
          }
          return mostCommon;
        }
      } catch (_err) {
        if (stryMutAct_9fa48("44479")) {
          {}
        } else {
          stryCov_9fa48("44479");
          // Graceful degradation - return null on error
          return null;
        }
      }
    }
  }

  /**
   * Compute total size of all partitions for a table
   * @param {string} tableId - The table ID
   * @return {number|null} Total size in bytes, or null if unavailable
   */
  computeTotalSize(tableId) {
    if (stryMutAct_9fa48("44480")) {
      {}
    } else {
      stryCov_9fa48("44480");
      try {
        if (stryMutAct_9fa48("44481")) {
          {}
        } else {
          stryCov_9fa48("44481");
          const partitions = this.cache.getPartitions(stryMutAct_9fa48("44482") ? {} : (stryCov_9fa48("44482"), {
            tableId
          }));
          if (stryMutAct_9fa48("44485") ? partitions.length !== 0 : stryMutAct_9fa48("44484") ? false : stryMutAct_9fa48("44483") ? true : (stryCov_9fa48("44483", "44484", "44485"), partitions.length === 0)) {
            if (stryMutAct_9fa48("44486")) {
              {}
            } else {
              stryCov_9fa48("44486");
              return 0;
            }
          }
          let totalSize = 0;
          let hasValidSize = stryMutAct_9fa48("44487") ? true : (stryCov_9fa48("44487"), false);
          for (const partition of partitions) {
            if (stryMutAct_9fa48("44488")) {
              {}
            } else {
              stryCov_9fa48("44488");
              if (stryMutAct_9fa48("44491") ? partition.size_bytes !== undefined || partition.size_bytes !== null : stryMutAct_9fa48("44490") ? false : stryMutAct_9fa48("44489") ? true : (stryCov_9fa48("44489", "44490", "44491"), (stryMutAct_9fa48("44493") ? partition.size_bytes === undefined : stryMutAct_9fa48("44492") ? true : (stryCov_9fa48("44492", "44493"), partition.size_bytes !== undefined)) && (stryMutAct_9fa48("44495") ? partition.size_bytes === null : stryMutAct_9fa48("44494") ? true : (stryCov_9fa48("44494", "44495"), partition.size_bytes !== null)))) {
                if (stryMutAct_9fa48("44496")) {
                  {}
                } else {
                  stryCov_9fa48("44496");
                  stryMutAct_9fa48("44497") ? totalSize -= partition.size_bytes : (stryCov_9fa48("44497"), totalSize += partition.size_bytes);
                  hasValidSize = stryMutAct_9fa48("44498") ? false : (stryCov_9fa48("44498"), true);
                }
              }
            }
          }
          return hasValidSize ? totalSize : null;
        }
      } catch (_err) {
        if (stryMutAct_9fa48("44499")) {
          {}
        } else {
          stryCov_9fa48("44499");
          // Graceful degradation - return null on error
          return null;
        }
      }
    }
  }

  /**
   * Invalidate the metadata cache
   * Should be called when partition data changes
   */
  invalidateCache() {
    if (stryMutAct_9fa48("44500")) {
      {}
    } else {
      stryCov_9fa48("44500");
      this.metadataCache.clear();
    }
  }

  /**
   * Invalidate metadata for a specific table
   * @param {string} tableId - The table ID to invalidate
   */
  invalidateTable(tableId) {
    if (stryMutAct_9fa48("44501")) {
      {}
    } else {
      stryCov_9fa48("44501");
      this.metadataCache.delete(tableId);
    }
  }

  /**
   * Get all tables with computed metadata
   * @return {Array} Array of tables with enriched metadata
   */
  getTablesWithMetadata() {
    if (stryMutAct_9fa48("44502")) {
      {}
    } else {
      stryCov_9fa48("44502");
      const tables = this.cache.getTables();
      return tables.map(stryMutAct_9fa48("44503") ? () => undefined : (stryCov_9fa48("44503"), table => this.computeMetadata(table)));
    }
  }

  /**
   * Get a specific table with computed metadata
   * @param {string} tableId - The table ID
   * @return {Object|undefined} Table with enriched metadata, or undefined
   */
  getTableWithMetadata(tableId) {
    if (stryMutAct_9fa48("44504")) {
      {}
    } else {
      stryCov_9fa48("44504");
      const table = this.cache.getTable(tableId);
      return table ? this.computeMetadata(table) : undefined;
    }
  }

  /**
   * Get cache statistics
   * @return {Object} Statistics about the metadata cache
   */
  getStats() {
    if (stryMutAct_9fa48("44505")) {
      {}
    } else {
      stryCov_9fa48("44505");
      return stryMutAct_9fa48("44506") ? {} : (stryCov_9fa48("44506"), {
        cachedTables: this.metadataCache.size,
        lastCacheUpdate: this.lastCacheUpdate
      });
    }
  }
}