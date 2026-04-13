/**
 * PartitionsView - Displays partition details and replica distribution
 *
 * Columns: partition_id, key_range, replica_count, leader_node_id, storage_size, status
 * Supports highlighting under-replicated partitions and navigation to hosting node.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9
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
 * Size units for formatting
 */
const SIZE_UNITS = stryMutAct_9fa48("51302") ? [] : (stryCov_9fa48("51302"), [stryMutAct_9fa48("51303") ? "" : (stryCov_9fa48("51303"), 'B'), stryMutAct_9fa48("51304") ? "" : (stryCov_9fa48("51304"), 'KB'), stryMutAct_9fa48("51305") ? "" : (stryCov_9fa48("51305"), 'MB'), stryMutAct_9fa48("51306") ? "" : (stryCov_9fa48("51306"), 'GB'), stryMutAct_9fa48("51307") ? "" : (stryCov_9fa48("51307"), 'TB')]);

/**
 * PartitionsView displays partition details and replica distribution
 */
export class PartitionsView extends BaseView {
  /**
   * Creates a new PartitionsView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {number} [options.expectedReplicaCount] - Expected replica count for highlighting
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("51308")) {
      {}
    } else {
      stryCov_9fa48("51308");
      super(options);
      this.cache = stryMutAct_9fa48("51311") ? options.cache && null : stryMutAct_9fa48("51310") ? false : stryMutAct_9fa48("51309") ? true : (stryCov_9fa48("51309", "51310", "51311"), options.cache || null);
      this.viewName = stryMutAct_9fa48("51312") ? "" : (stryCov_9fa48("51312"), 'partitions');
      this.tableFilter = null;
      this.expectedReplicaCount = stryMutAct_9fa48("51315") ? options.expectedReplicaCount && null : stryMutAct_9fa48("51314") ? false : stryMutAct_9fa48("51313") ? true : (stryCov_9fa48("51313", "51314", "51315"), options.expectedReplicaCount || null);
    }
  }

  /**
   * Get column definitions for the partitions view
   * Requirements: 5.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    if (stryMutAct_9fa48("51316")) {
      {}
    } else {
      stryCov_9fa48("51316");
      return stryMutAct_9fa48("51317") ? [] : (stryCov_9fa48("51317"), [stryMutAct_9fa48("51318") ? {} : (stryCov_9fa48("51318"), {
        key: stryMutAct_9fa48("51319") ? "" : (stryCov_9fa48("51319"), 'partition_id'),
        label: stryMutAct_9fa48("51320") ? "" : (stryCov_9fa48("51320"), 'Partition ID'),
        width: 20
      }), stryMutAct_9fa48("51321") ? {} : (stryCov_9fa48("51321"), {
        key: stryMutAct_9fa48("51322") ? "" : (stryCov_9fa48("51322"), 'key_range'),
        label: stryMutAct_9fa48("51323") ? "" : (stryCov_9fa48("51323"), 'Key Range'),
        width: 25
      }), stryMutAct_9fa48("51324") ? {} : (stryCov_9fa48("51324"), {
        key: stryMutAct_9fa48("51325") ? "" : (stryCov_9fa48("51325"), 'replica_count'),
        label: stryMutAct_9fa48("51326") ? "" : (stryCov_9fa48("51326"), 'Replicas'),
        width: 10
      }), stryMutAct_9fa48("51327") ? {} : (stryCov_9fa48("51327"), {
        key: stryMutAct_9fa48("51328") ? "" : (stryCov_9fa48("51328"), 'leader_node_id'),
        label: stryMutAct_9fa48("51329") ? "" : (stryCov_9fa48("51329"), 'Leader Node'),
        width: 20
      }), stryMutAct_9fa48("51330") ? {} : (stryCov_9fa48("51330"), {
        key: stryMutAct_9fa48("51331") ? "" : (stryCov_9fa48("51331"), 'size_bytes'),
        label: stryMutAct_9fa48("51332") ? "" : (stryCov_9fa48("51332"), 'Size'),
        width: 12
      }), stryMutAct_9fa48("51333") ? {} : (stryCov_9fa48("51333"), {
        key: stryMutAct_9fa48("51334") ? "" : (stryCov_9fa48("51334"), 'status'),
        label: stryMutAct_9fa48("51335") ? "" : (stryCov_9fa48("51335"), 'Status'),
        width: 12
      })]);
    }
  }

  /**
   * Format a partition record into a row array
   * Requirements: 5.1, 5.5, 5.7, 5.9
   * @param {Object} partition - Partition record
   * @return {Array<string>} Row values
   */
  formatRow(partition) {
    if (stryMutAct_9fa48("51336")) {
      {}
    } else {
      stryCov_9fa48("51336");
      return stryMutAct_9fa48("51337") ? [] : (stryCov_9fa48("51337"), [stryMutAct_9fa48("51340") ? partition.partition_id && 'N/A' : stryMutAct_9fa48("51339") ? false : stryMutAct_9fa48("51338") ? true : (stryCov_9fa48("51338", "51339", "51340"), partition.partition_id || (stryMutAct_9fa48("51341") ? "" : (stryCov_9fa48("51341"), 'N/A'))), this.formatKeyRange(partition), this.formatReplicaCount(partition.replica_count), stryMutAct_9fa48("51344") ? partition.leader_node_id && 'No Leader' : stryMutAct_9fa48("51343") ? false : stryMutAct_9fa48("51342") ? true : (stryCov_9fa48("51342", "51343", "51344"), partition.leader_node_id || (stryMutAct_9fa48("51345") ? "" : (stryCov_9fa48("51345"), 'No Leader'))), this.formatSize(partition.size_bytes), stryMutAct_9fa48("51348") ? partition.status && 'unknown' : stryMutAct_9fa48("51347") ? false : stryMutAct_9fa48("51346") ? true : (stryCov_9fa48("51346", "51347", "51348"), partition.status || (stryMutAct_9fa48("51349") ? "" : (stryCov_9fa48("51349"), 'unknown')))]);
    }
  }

  /**
   * Format key range for display
   * Requirements: 5.5
   * @param {Object} partition - Partition record
   * @return {string} Formatted key range
   */
  formatKeyRange(partition) {
    if (stryMutAct_9fa48("51350")) {
      {}
    } else {
      stryCov_9fa48("51350");
      const start = partition.partition_key_start;
      const end = partition.partition_key_end;
      const startStr = (stryMutAct_9fa48("51353") ? start !== null || start !== undefined : stryMutAct_9fa48("51352") ? false : stryMutAct_9fa48("51351") ? true : (stryCov_9fa48("51351", "51352", "51353"), (stryMutAct_9fa48("51355") ? start === null : stryMutAct_9fa48("51354") ? true : (stryCov_9fa48("51354", "51355"), start !== null)) && (stryMutAct_9fa48("51357") ? start === undefined : stryMutAct_9fa48("51356") ? true : (stryCov_9fa48("51356", "51357"), start !== undefined)))) ? start : stryMutAct_9fa48("51358") ? "" : (stryCov_9fa48("51358"), '-∞');
      const endStr = (stryMutAct_9fa48("51361") ? end !== null || end !== undefined : stryMutAct_9fa48("51360") ? false : stryMutAct_9fa48("51359") ? true : (stryCov_9fa48("51359", "51360", "51361"), (stryMutAct_9fa48("51363") ? end === null : stryMutAct_9fa48("51362") ? true : (stryCov_9fa48("51362", "51363"), end !== null)) && (stryMutAct_9fa48("51365") ? end === undefined : stryMutAct_9fa48("51364") ? true : (stryCov_9fa48("51364", "51365"), end !== undefined)))) ? end : stryMutAct_9fa48("51366") ? "" : (stryCov_9fa48("51366"), '+∞');
      return stryMutAct_9fa48("51367") ? `` : (stryCov_9fa48("51367"), `[${startStr}, ${endStr})`);
    }
  }

  /**
   * Format replica count for display
   * @param {number|null|undefined} count - Replica count
   * @return {string} Formatted count
   */
  formatReplicaCount(count) {
    if (stryMutAct_9fa48("51368")) {
      {}
    } else {
      stryCov_9fa48("51368");
      if (stryMutAct_9fa48("51371") ? count === null && count === undefined : stryMutAct_9fa48("51370") ? false : stryMutAct_9fa48("51369") ? true : (stryCov_9fa48("51369", "51370", "51371"), (stryMutAct_9fa48("51373") ? count !== null : stryMutAct_9fa48("51372") ? false : (stryCov_9fa48("51372", "51373"), count === null)) || (stryMutAct_9fa48("51375") ? count !== undefined : stryMutAct_9fa48("51374") ? false : (stryCov_9fa48("51374", "51375"), count === undefined)))) {
        if (stryMutAct_9fa48("51376")) {
          {}
        } else {
          stryCov_9fa48("51376");
          return stryMutAct_9fa48("51377") ? "" : (stryCov_9fa48("51377"), 'N/A');
        }
      }
      return String(count);
    }
  }

  /**
   * Format size with appropriate units
   * Requirements: 5.7, 5.8
   * @param {number|null|undefined} bytes - Size in bytes
   * @return {string} Formatted size
   */
  formatSize(bytes) {
    if (stryMutAct_9fa48("51378")) {
      {}
    } else {
      stryCov_9fa48("51378");
      if (stryMutAct_9fa48("51381") ? bytes === null && bytes === undefined : stryMutAct_9fa48("51380") ? false : stryMutAct_9fa48("51379") ? true : (stryCov_9fa48("51379", "51380", "51381"), (stryMutAct_9fa48("51383") ? bytes !== null : stryMutAct_9fa48("51382") ? false : (stryCov_9fa48("51382", "51383"), bytes === null)) || (stryMutAct_9fa48("51385") ? bytes !== undefined : stryMutAct_9fa48("51384") ? false : (stryCov_9fa48("51384", "51385"), bytes === undefined)))) {
        if (stryMutAct_9fa48("51386")) {
          {}
        } else {
          stryCov_9fa48("51386");
          return stryMutAct_9fa48("51387") ? "" : (stryCov_9fa48("51387"), 'N/A');
        }
      }
      if (stryMutAct_9fa48("51390") ? bytes !== 0 : stryMutAct_9fa48("51389") ? false : stryMutAct_9fa48("51388") ? true : (stryCov_9fa48("51388", "51389", "51390"), bytes === 0)) {
        if (stryMutAct_9fa48("51391")) {
          {}
        } else {
          stryCov_9fa48("51391");
          return stryMutAct_9fa48("51392") ? "" : (stryCov_9fa48("51392"), '0 B');
        }
      }
      const i = Math.floor(stryMutAct_9fa48("51393") ? Math.log(bytes) * Math.log(1024) : (stryCov_9fa48("51393"), Math.log(bytes) / Math.log(1024)));
      const value = stryMutAct_9fa48("51394") ? bytes * Math.pow(1024, i) : (stryCov_9fa48("51394"), bytes / Math.pow(1024, i));
      return stryMutAct_9fa48("51395") ? `` : (stryCov_9fa48("51395"), `${value.toFixed(1)} ${SIZE_UNITS[i]}`);
    }
  }

  /**
   * Get the row status for styling
   * Requirements: 5.6
   * @param {Object} partition - Partition record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(partition) {
    if (stryMutAct_9fa48("51396")) {
      {}
    } else {
      stryCov_9fa48("51396");
      // Failed status is an error
      if (stryMutAct_9fa48("51399") ? partition.status === 'failed' && partition.status === 'error' : stryMutAct_9fa48("51398") ? false : stryMutAct_9fa48("51397") ? true : (stryCov_9fa48("51397", "51398", "51399"), (stryMutAct_9fa48("51401") ? partition.status !== 'failed' : stryMutAct_9fa48("51400") ? false : (stryCov_9fa48("51400", "51401"), partition.status === (stryMutAct_9fa48("51402") ? "" : (stryCov_9fa48("51402"), 'failed')))) || (stryMutAct_9fa48("51404") ? partition.status !== 'error' : stryMutAct_9fa48("51403") ? false : (stryCov_9fa48("51403", "51404"), partition.status === (stryMutAct_9fa48("51405") ? "" : (stryCov_9fa48("51405"), 'error')))))) {
        if (stryMutAct_9fa48("51406")) {
          {}
        } else {
          stryCov_9fa48("51406");
          return ROW_STATUS.ERROR;
        }
      }

      // No leader is an error
      if (stryMutAct_9fa48("51409") ? false : stryMutAct_9fa48("51408") ? true : stryMutAct_9fa48("51407") ? partition.leader_node_id : (stryCov_9fa48("51407", "51408", "51409"), !partition.leader_node_id)) {
        if (stryMutAct_9fa48("51410")) {
          {}
        } else {
          stryCov_9fa48("51410");
          return ROW_STATUS.ERROR;
        }
      }

      // Under-replicated partitions are warnings
      if (stryMutAct_9fa48("51412") ? false : stryMutAct_9fa48("51411") ? true : (stryCov_9fa48("51411", "51412"), this.isUnderReplicated(partition))) {
        if (stryMutAct_9fa48("51413")) {
          {}
        } else {
          stryCov_9fa48("51413");
          return ROW_STATUS.WARNING;
        }
      }
      return ROW_STATUS.NORMAL;
    }
  }

  /**
   * Check if a partition is under-replicated
   * Requirements: 5.6
   * @param {Object} partition - Partition record
   * @return {boolean} True if under-replicated
   */
  isUnderReplicated(partition) {
    if (stryMutAct_9fa48("51414")) {
      {}
    } else {
      stryCov_9fa48("51414");
      if (stryMutAct_9fa48("51417") ? this.expectedReplicaCount !== null : stryMutAct_9fa48("51416") ? false : stryMutAct_9fa48("51415") ? true : (stryCov_9fa48("51415", "51416", "51417"), this.expectedReplicaCount === null)) {
        if (stryMutAct_9fa48("51418")) {
          {}
        } else {
          stryCov_9fa48("51418");
          return stryMutAct_9fa48("51419") ? true : (stryCov_9fa48("51419"), false);
        }
      }
      const actualCount = partition.replica_count;
      if (stryMutAct_9fa48("51422") ? actualCount === null && actualCount === undefined : stryMutAct_9fa48("51421") ? false : stryMutAct_9fa48("51420") ? true : (stryCov_9fa48("51420", "51421", "51422"), (stryMutAct_9fa48("51424") ? actualCount !== null : stryMutAct_9fa48("51423") ? false : (stryCov_9fa48("51423", "51424"), actualCount === null)) || (stryMutAct_9fa48("51426") ? actualCount !== undefined : stryMutAct_9fa48("51425") ? false : (stryCov_9fa48("51425", "51426"), actualCount === undefined)))) {
        if (stryMutAct_9fa48("51427")) {
          {}
        } else {
          stryCov_9fa48("51427");
          return stryMutAct_9fa48("51428") ? false : (stryCov_9fa48("51428"), true);
        }
      }
      return stryMutAct_9fa48("51432") ? actualCount >= this.expectedReplicaCount : stryMutAct_9fa48("51431") ? actualCount <= this.expectedReplicaCount : stryMutAct_9fa48("51430") ? false : stryMutAct_9fa48("51429") ? true : (stryCov_9fa48("51429", "51430", "51431", "51432"), actualCount < this.expectedReplicaCount);
    }
  }

  /**
   * Set expected replica count for under-replication detection
   * @param {number|null} count - Expected replica count
   */
  setExpectedReplicaCount(count) {
    if (stryMutAct_9fa48("51433")) {
      {}
    } else {
      stryCov_9fa48("51433");
      this.expectedReplicaCount = count;
      this.updateFilteredData();
    }
  }

  /**
   * Get the unique key for a partition
   * @param {Object} partition - Partition record
   * @return {string} Unique key (partition_id)
   */
  getItemKey(partition) {
    if (stryMutAct_9fa48("51434")) {
      {}
    } else {
      stryCov_9fa48("51434");
      return stryMutAct_9fa48("51437") ? partition.partition_id && '' : stryMutAct_9fa48("51436") ? false : stryMutAct_9fa48("51435") ? true : (stryCov_9fa48("51435", "51436", "51437"), partition.partition_id || (stryMutAct_9fa48("51438") ? "Stryker was here!" : (stryCov_9fa48("51438"), '')));
    }
  }

  /**
   * Set table filter for viewing partitions of a specific table
   * @param {string|null} tableId - Table ID to filter by
   */
  setTableFilter(tableId) {
    if (stryMutAct_9fa48("51439")) {
      {}
    } else {
      stryCov_9fa48("51439");
      this.tableFilter = tableId;
      this.updateFilteredData();
    }
  }

  /**
   * Clear table filter
   */
  clearTableFilter() {
    if (stryMutAct_9fa48("51440")) {
      {}
    } else {
      stryCov_9fa48("51440");
      this.tableFilter = null;
      this.updateFilteredData();
    }
  }

  /**
   * Override applyFilter to include table filter
   * @param {Array} data - Data to filter
   * @return {Array} Filtered data
   */
  applyFilter(data) {
    if (stryMutAct_9fa48("51441")) {
      {}
    } else {
      stryCov_9fa48("51441");
      let filtered = data;

      // Apply table filter
      if (stryMutAct_9fa48("51443") ? false : stryMutAct_9fa48("51442") ? true : (stryCov_9fa48("51442", "51443"), this.tableFilter)) {
        if (stryMutAct_9fa48("51444")) {
          {}
        } else {
          stryCov_9fa48("51444");
          filtered = stryMutAct_9fa48("51445") ? filtered : (stryCov_9fa48("51445"), filtered.filter(stryMutAct_9fa48("51446") ? () => undefined : (stryCov_9fa48("51446"), p => stryMutAct_9fa48("51449") ? p.table_id !== this.tableFilter : stryMutAct_9fa48("51448") ? false : stryMutAct_9fa48("51447") ? true : (stryCov_9fa48("51447", "51448", "51449"), p.table_id === this.tableFilter))));
        }
      }

      // Apply text filter from base class
      return super.applyFilter(filtered);
    }
  }

  /**
   * Handle drill-down action (Enter key on selected partition)
   * Requirements: 5.2, 5.4
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    if (stryMutAct_9fa48("51450")) {
      {}
    } else {
      stryCov_9fa48("51450");
      const selectedPartition = this.getSelectedItem();
      if (stryMutAct_9fa48("51453") ? false : stryMutAct_9fa48("51452") ? true : stryMutAct_9fa48("51451") ? selectedPartition : (stryCov_9fa48("51451", "51452", "51453"), !selectedPartition)) {
        if (stryMutAct_9fa48("51454")) {
          {}
        } else {
          stryCov_9fa48("51454");
          return null;
        }
      }
      return stryMutAct_9fa48("51455") ? {} : (stryCov_9fa48("51455"), {
        action: stryMutAct_9fa48("51456") ? "" : (stryCov_9fa48("51456"), 'drillDown'),
        view: stryMutAct_9fa48("51457") ? "" : (stryCov_9fa48("51457"), 'replicas'),
        context: stryMutAct_9fa48("51458") ? {} : (stryCov_9fa48("51458"), {
          partitionId: selectedPartition.partition_id,
          tableId: selectedPartition.table_id
        })
      });
    }
  }

  /**
   * Navigate to the leader node
   * Requirements: 5.4
   * @return {Object|null} Navigation action or null
   */
  navigateToLeaderNode() {
    if (stryMutAct_9fa48("51459")) {
      {}
    } else {
      stryCov_9fa48("51459");
      const selectedPartition = this.getSelectedItem();
      if (stryMutAct_9fa48("51462") ? !selectedPartition && !selectedPartition.leader_node_id : stryMutAct_9fa48("51461") ? false : stryMutAct_9fa48("51460") ? true : (stryCov_9fa48("51460", "51461", "51462"), (stryMutAct_9fa48("51463") ? selectedPartition : (stryCov_9fa48("51463"), !selectedPartition)) || (stryMutAct_9fa48("51464") ? selectedPartition.leader_node_id : (stryCov_9fa48("51464"), !selectedPartition.leader_node_id)))) {
        if (stryMutAct_9fa48("51465")) {
          {}
        } else {
          stryCov_9fa48("51465");
          return null;
        }
      }
      return stryMutAct_9fa48("51466") ? {} : (stryCov_9fa48("51466"), {
        action: stryMutAct_9fa48("51467") ? "" : (stryCov_9fa48("51467"), 'jumpToEntity'),
        entityType: stryMutAct_9fa48("51468") ? "" : (stryCov_9fa48("51468"), 'node'),
        entityId: selectedPartition.leader_node_id
      });
    }
  }

  /**
   * Handle key input for the partitions view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (stryMutAct_9fa48("51469")) {
      {}
    } else {
      stryCov_9fa48("51469");
      if (stryMutAct_9fa48("51472") ? key.name === 'enter' && key.name === 'return' : stryMutAct_9fa48("51471") ? false : stryMutAct_9fa48("51470") ? true : (stryCov_9fa48("51470", "51471", "51472"), (stryMutAct_9fa48("51474") ? key.name !== 'enter' : stryMutAct_9fa48("51473") ? false : (stryCov_9fa48("51473", "51474"), key.name === (stryMutAct_9fa48("51475") ? "" : (stryCov_9fa48("51475"), 'enter')))) || (stryMutAct_9fa48("51477") ? key.name !== 'return' : stryMutAct_9fa48("51476") ? false : (stryCov_9fa48("51476", "51477"), key.name === (stryMutAct_9fa48("51478") ? "" : (stryCov_9fa48("51478"), 'return')))))) {
        if (stryMutAct_9fa48("51479")) {
          {}
        } else {
          stryCov_9fa48("51479");
          return this.handleDrillDown();
        }
      }
      if (stryMutAct_9fa48("51482") ? key.name === 'n' && key.name === 'N' : stryMutAct_9fa48("51481") ? false : stryMutAct_9fa48("51480") ? true : (stryCov_9fa48("51480", "51481", "51482"), (stryMutAct_9fa48("51484") ? key.name !== 'n' : stryMutAct_9fa48("51483") ? false : (stryCov_9fa48("51483", "51484"), key.name === (stryMutAct_9fa48("51485") ? "" : (stryCov_9fa48("51485"), 'n')))) || (stryMutAct_9fa48("51487") ? key.name !== 'N' : stryMutAct_9fa48("51486") ? false : (stryCov_9fa48("51486", "51487"), key.name === (stryMutAct_9fa48("51488") ? "" : (stryCov_9fa48("51488"), 'N')))))) {
        if (stryMutAct_9fa48("51489")) {
          {}
        } else {
          stryCov_9fa48("51489");
          return this.navigateToLeaderNode();
        }
      }
      return super.handleKey(key);
    }
  }

  /**
   * Get detail information for the selected partition
   * Requirements: 5.2, 5.3, 16.6
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    if (stryMutAct_9fa48("51490")) {
      {}
    } else {
      stryCov_9fa48("51490");
      const partition = this.getSelectedItem();
      if (stryMutAct_9fa48("51493") ? false : stryMutAct_9fa48("51492") ? true : stryMutAct_9fa48("51491") ? partition : (stryCov_9fa48("51491", "51492", "51493"), !partition)) {
        if (stryMutAct_9fa48("51494")) {
          {}
        } else {
          stryCov_9fa48("51494");
          return null;
        }
      }
      const sections = stryMutAct_9fa48("51495") ? [] : (stryCov_9fa48("51495"), [stryMutAct_9fa48("51496") ? {} : (stryCov_9fa48("51496"), {
        title: stryMutAct_9fa48("51497") ? "" : (stryCov_9fa48("51497"), 'Basic Information'),
        fields: stryMutAct_9fa48("51498") ? [] : (stryCov_9fa48("51498"), [stryMutAct_9fa48("51499") ? {} : (stryCov_9fa48("51499"), {
          label: stryMutAct_9fa48("51500") ? "" : (stryCov_9fa48("51500"), 'Partition ID'),
          value: partition.partition_id
        }), stryMutAct_9fa48("51501") ? {} : (stryCov_9fa48("51501"), {
          label: stryMutAct_9fa48("51502") ? "" : (stryCov_9fa48("51502"), 'Table ID'),
          value: stryMutAct_9fa48("51505") ? partition.table_id && 'N/A' : stryMutAct_9fa48("51504") ? false : stryMutAct_9fa48("51503") ? true : (stryCov_9fa48("51503", "51504", "51505"), partition.table_id || (stryMutAct_9fa48("51506") ? "" : (stryCov_9fa48("51506"), 'N/A')))
        }), stryMutAct_9fa48("51507") ? {} : (stryCov_9fa48("51507"), {
          label: stryMutAct_9fa48("51508") ? "" : (stryCov_9fa48("51508"), 'Table Name'),
          value: stryMutAct_9fa48("51511") ? partition.table_name && 'N/A' : stryMutAct_9fa48("51510") ? false : stryMutAct_9fa48("51509") ? true : (stryCov_9fa48("51509", "51510", "51511"), partition.table_name || (stryMutAct_9fa48("51512") ? "" : (stryCov_9fa48("51512"), 'N/A')))
        }), stryMutAct_9fa48("51513") ? {} : (stryCov_9fa48("51513"), {
          label: stryMutAct_9fa48("51514") ? "" : (stryCov_9fa48("51514"), 'Key Range'),
          value: this.formatKeyRange(partition)
        }), stryMutAct_9fa48("51515") ? {} : (stryCov_9fa48("51515"), {
          label: stryMutAct_9fa48("51516") ? "" : (stryCov_9fa48("51516"), 'Status'),
          value: stryMutAct_9fa48("51519") ? partition.status && 'unknown' : stryMutAct_9fa48("51518") ? false : stryMutAct_9fa48("51517") ? true : (stryCov_9fa48("51517", "51518", "51519"), partition.status || (stryMutAct_9fa48("51520") ? "" : (stryCov_9fa48("51520"), 'unknown')))
        })])
      }), stryMutAct_9fa48("51521") ? {} : (stryCov_9fa48("51521"), {
        title: stryMutAct_9fa48("51522") ? "" : (stryCov_9fa48("51522"), 'Replication'),
        fields: stryMutAct_9fa48("51523") ? [] : (stryCov_9fa48("51523"), [stryMutAct_9fa48("51524") ? {} : (stryCov_9fa48("51524"), {
          label: stryMutAct_9fa48("51525") ? "" : (stryCov_9fa48("51525"), 'Replica Count'),
          value: this.formatReplicaCount(partition.replica_count)
        }), stryMutAct_9fa48("51526") ? {} : (stryCov_9fa48("51526"), {
          label: stryMutAct_9fa48("51527") ? "" : (stryCov_9fa48("51527"), 'Leader Node'),
          value: stryMutAct_9fa48("51530") ? partition.leader_node_id && 'No Leader' : stryMutAct_9fa48("51529") ? false : stryMutAct_9fa48("51528") ? true : (stryCov_9fa48("51528", "51529", "51530"), partition.leader_node_id || (stryMutAct_9fa48("51531") ? "" : (stryCov_9fa48("51531"), 'No Leader')))
        }), stryMutAct_9fa48("51532") ? {} : (stryCov_9fa48("51532"), {
          label: stryMutAct_9fa48("51533") ? "" : (stryCov_9fa48("51533"), 'Under-replicated'),
          value: this.isUnderReplicated(partition) ? stryMutAct_9fa48("51534") ? "" : (stryCov_9fa48("51534"), 'Yes') : stryMutAct_9fa48("51535") ? "" : (stryCov_9fa48("51535"), 'No')
        })])
      }), stryMutAct_9fa48("51536") ? {} : (stryCov_9fa48("51536"), {
        title: stryMutAct_9fa48("51537") ? "" : (stryCov_9fa48("51537"), 'Storage'),
        fields: stryMutAct_9fa48("51538") ? [] : (stryCov_9fa48("51538"), [stryMutAct_9fa48("51539") ? {} : (stryCov_9fa48("51539"), {
          label: stryMutAct_9fa48("51540") ? "" : (stryCov_9fa48("51540"), 'Size'),
          value: this.formatSize(partition.size_bytes)
        }), stryMutAct_9fa48("51541") ? {} : (stryCov_9fa48("51541"), {
          label: stryMutAct_9fa48("51542") ? "" : (stryCov_9fa48("51542"), 'Row Count'),
          value: (stryMutAct_9fa48("51545") ? partition.row_count === undefined : stryMutAct_9fa48("51544") ? false : stryMutAct_9fa48("51543") ? true : (stryCov_9fa48("51543", "51544", "51545"), partition.row_count !== undefined)) ? String(partition.row_count) : stryMutAct_9fa48("51546") ? "" : (stryCov_9fa48("51546"), 'N/A')
        }), stryMutAct_9fa48("51547") ? {} : (stryCov_9fa48("51547"), {
          label: stryMutAct_9fa48("51548") ? "" : (stryCov_9fa48("51548"), 'Index Size'),
          value: this.formatSize(partition.index_size_bytes)
        })])
      })]);

      // Add Raft state section
      // Requirements: 16.6
      sections.push(stryMutAct_9fa48("51549") ? {} : (stryCov_9fa48("51549"), {
        title: stryMutAct_9fa48("51550") ? "" : (stryCov_9fa48("51550"), 'Raft State'),
        fields: stryMutAct_9fa48("51551") ? [] : (stryCov_9fa48("51551"), [stryMutAct_9fa48("51552") ? {} : (stryCov_9fa48("51552"), {
          label: stryMutAct_9fa48("51553") ? "" : (stryCov_9fa48("51553"), 'Term'),
          value: String(stryMutAct_9fa48("51554") ? partition.raft_term && 0 : (stryCov_9fa48("51554"), partition.raft_term ?? 0))
        }), stryMutAct_9fa48("51555") ? {} : (stryCov_9fa48("51555"), {
          label: stryMutAct_9fa48("51556") ? "" : (stryCov_9fa48("51556"), 'Commit Index'),
          value: String(stryMutAct_9fa48("51557") ? partition.raft_commit_index && 0 : (stryCov_9fa48("51557"), partition.raft_commit_index ?? 0))
        }), stryMutAct_9fa48("51558") ? {} : (stryCov_9fa48("51558"), {
          label: stryMutAct_9fa48("51559") ? "" : (stryCov_9fa48("51559"), 'Applied Index'),
          value: String(stryMutAct_9fa48("51560") ? partition.raft_applied_index && 0 : (stryCov_9fa48("51560"), partition.raft_applied_index ?? 0))
        }), stryMutAct_9fa48("51561") ? {} : (stryCov_9fa48("51561"), {
          label: stryMutAct_9fa48("51562") ? "" : (stryCov_9fa48("51562"), 'Last Log Index'),
          value: String(stryMutAct_9fa48("51563") ? partition.raft_last_log_index && 0 : (stryCov_9fa48("51563"), partition.raft_last_log_index ?? 0))
        }), stryMutAct_9fa48("51564") ? {} : (stryCov_9fa48("51564"), {
          label: stryMutAct_9fa48("51565") ? "" : (stryCov_9fa48("51565"), 'Role'),
          value: stryMutAct_9fa48("51568") ? partition.raft_role && 'N/A' : stryMutAct_9fa48("51567") ? false : stryMutAct_9fa48("51566") ? true : (stryCov_9fa48("51566", "51567", "51568"), partition.raft_role || (stryMutAct_9fa48("51569") ? "" : (stryCov_9fa48("51569"), 'N/A')))
        })])
      }));

      // Add replica sync status section
      // Requirements: 16.6
      if (stryMutAct_9fa48("51572") ? partition.replicas || Array.isArray(partition.replicas) : stryMutAct_9fa48("51571") ? false : stryMutAct_9fa48("51570") ? true : (stryCov_9fa48("51570", "51571", "51572"), partition.replicas && Array.isArray(partition.replicas))) {
        if (stryMutAct_9fa48("51573")) {
          {}
        } else {
          stryCov_9fa48("51573");
          const replicaFields = partition.replicas.map(stryMutAct_9fa48("51574") ? () => undefined : (stryCov_9fa48("51574"), (replica, index) => stryMutAct_9fa48("51575") ? {} : (stryCov_9fa48("51575"), {
            label: stryMutAct_9fa48("51576") ? `` : (stryCov_9fa48("51576"), `Replica ${stryMutAct_9fa48("51577") ? index - 1 : (stryCov_9fa48("51577"), index + 1)}`),
            value: (stryMutAct_9fa48("51578") ? `` : (stryCov_9fa48("51578"), `${stryMutAct_9fa48("51581") ? replica.node_id && 'N/A' : stryMutAct_9fa48("51580") ? false : stryMutAct_9fa48("51579") ? true : (stryCov_9fa48("51579", "51580", "51581"), replica.node_id || (stryMutAct_9fa48("51582") ? "" : (stryCov_9fa48("51582"), 'N/A')))} - ${stryMutAct_9fa48("51585") ? replica.status && 'unknown' : stryMutAct_9fa48("51584") ? false : stryMutAct_9fa48("51583") ? true : (stryCov_9fa48("51583", "51584", "51585"), replica.status || (stryMutAct_9fa48("51586") ? "" : (stryCov_9fa48("51586"), 'unknown')))}`)) + ((stryMutAct_9fa48("51589") ? replica.lag === undefined : stryMutAct_9fa48("51588") ? false : stryMutAct_9fa48("51587") ? true : (stryCov_9fa48("51587", "51588", "51589"), replica.lag !== undefined)) ? stryMutAct_9fa48("51590") ? `` : (stryCov_9fa48("51590"), ` (lag: ${replica.lag})`) : stryMutAct_9fa48("51591") ? "Stryker was here!" : (stryCov_9fa48("51591"), ''))
          })));
          sections.push(stryMutAct_9fa48("51592") ? {} : (stryCov_9fa48("51592"), {
            title: stryMutAct_9fa48("51593") ? "" : (stryCov_9fa48("51593"), 'Replica Sync Status'),
            fields: (stryMutAct_9fa48("51597") ? replicaFields.length <= 0 : stryMutAct_9fa48("51596") ? replicaFields.length >= 0 : stryMutAct_9fa48("51595") ? false : stryMutAct_9fa48("51594") ? true : (stryCov_9fa48("51594", "51595", "51596", "51597"), replicaFields.length > 0)) ? replicaFields : stryMutAct_9fa48("51598") ? [] : (stryCov_9fa48("51598"), [stryMutAct_9fa48("51599") ? {} : (stryCov_9fa48("51599"), {
              label: stryMutAct_9fa48("51600") ? "" : (stryCov_9fa48("51600"), 'Replicas'),
              value: stryMutAct_9fa48("51601") ? "" : (stryCov_9fa48("51601"), 'No replica information available')
            })])
          }));
        }
      } else if (stryMutAct_9fa48("51604") ? partition.replica_nodes || Array.isArray(partition.replica_nodes) : stryMutAct_9fa48("51603") ? false : stryMutAct_9fa48("51602") ? true : (stryCov_9fa48("51602", "51603", "51604"), partition.replica_nodes && Array.isArray(partition.replica_nodes))) {
        if (stryMutAct_9fa48("51605")) {
          {}
        } else {
          stryCov_9fa48("51605");
          const replicaFields = partition.replica_nodes.map(stryMutAct_9fa48("51606") ? () => undefined : (stryCov_9fa48("51606"), (nodeId, index) => stryMutAct_9fa48("51607") ? {} : (stryCov_9fa48("51607"), {
            label: stryMutAct_9fa48("51608") ? `` : (stryCov_9fa48("51608"), `Replica ${stryMutAct_9fa48("51609") ? index - 1 : (stryCov_9fa48("51609"), index + 1)}`),
            value: stryMutAct_9fa48("51610") ? nodeId - (nodeId === partition.leader_node_id ? ' (Leader)' : '') : (stryCov_9fa48("51610"), nodeId + ((stryMutAct_9fa48("51613") ? nodeId !== partition.leader_node_id : stryMutAct_9fa48("51612") ? false : stryMutAct_9fa48("51611") ? true : (stryCov_9fa48("51611", "51612", "51613"), nodeId === partition.leader_node_id)) ? stryMutAct_9fa48("51614") ? "" : (stryCov_9fa48("51614"), ' (Leader)') : stryMutAct_9fa48("51615") ? "Stryker was here!" : (stryCov_9fa48("51615"), '')))
          })));
          sections.push(stryMutAct_9fa48("51616") ? {} : (stryCov_9fa48("51616"), {
            title: stryMutAct_9fa48("51617") ? "" : (stryCov_9fa48("51617"), 'Replica Locations'),
            fields: (stryMutAct_9fa48("51621") ? replicaFields.length <= 0 : stryMutAct_9fa48("51620") ? replicaFields.length >= 0 : stryMutAct_9fa48("51619") ? false : stryMutAct_9fa48("51618") ? true : (stryCov_9fa48("51618", "51619", "51620", "51621"), replicaFields.length > 0)) ? replicaFields : stryMutAct_9fa48("51622") ? [] : (stryCov_9fa48("51622"), [stryMutAct_9fa48("51623") ? {} : (stryCov_9fa48("51623"), {
              label: stryMutAct_9fa48("51624") ? "" : (stryCov_9fa48("51624"), 'Replicas'),
              value: stryMutAct_9fa48("51625") ? "" : (stryCov_9fa48("51625"), 'No replica information available')
            })])
          }));
        }
      }

      // Add recent CDC events section if available
      // Requirements: 16.6
      if (stryMutAct_9fa48("51628") ? partition.recent_cdc_events || Array.isArray(partition.recent_cdc_events) : stryMutAct_9fa48("51627") ? false : stryMutAct_9fa48("51626") ? true : (stryCov_9fa48("51626", "51627", "51628"), partition.recent_cdc_events && Array.isArray(partition.recent_cdc_events))) {
        if (stryMutAct_9fa48("51629")) {
          {}
        } else {
          stryCov_9fa48("51629");
          const cdcFields = stryMutAct_9fa48("51630") ? partition.recent_cdc_events.map(event => ({
            label: event.operation || 'Event',
            value: `${this.formatTimestamp(event.timestamp)} - ${event.key || 'N/A'}`
          })) : (stryCov_9fa48("51630"), partition.recent_cdc_events.slice(0, 5).map(stryMutAct_9fa48("51631") ? () => undefined : (stryCov_9fa48("51631"), event => stryMutAct_9fa48("51632") ? {} : (stryCov_9fa48("51632"), {
            label: stryMutAct_9fa48("51635") ? event.operation && 'Event' : stryMutAct_9fa48("51634") ? false : stryMutAct_9fa48("51633") ? true : (stryCov_9fa48("51633", "51634", "51635"), event.operation || (stryMutAct_9fa48("51636") ? "" : (stryCov_9fa48("51636"), 'Event'))),
            value: stryMutAct_9fa48("51637") ? `` : (stryCov_9fa48("51637"), `${this.formatTimestamp(event.timestamp)} - ${stryMutAct_9fa48("51640") ? event.key && 'N/A' : stryMutAct_9fa48("51639") ? false : stryMutAct_9fa48("51638") ? true : (stryCov_9fa48("51638", "51639", "51640"), event.key || (stryMutAct_9fa48("51641") ? "" : (stryCov_9fa48("51641"), 'N/A')))}`)
          }))));
          if (stryMutAct_9fa48("51645") ? cdcFields.length <= 0 : stryMutAct_9fa48("51644") ? cdcFields.length >= 0 : stryMutAct_9fa48("51643") ? false : stryMutAct_9fa48("51642") ? true : (stryCov_9fa48("51642", "51643", "51644", "51645"), cdcFields.length > 0)) {
            if (stryMutAct_9fa48("51646")) {
              {}
            } else {
              stryCov_9fa48("51646");
              sections.push(stryMutAct_9fa48("51647") ? {} : (stryCov_9fa48("51647"), {
                title: stryMutAct_9fa48("51648") ? "" : (stryCov_9fa48("51648"), 'Recent CDC Events'),
                fields: cdcFields
              }));
            }
          }
        }
      }

      // Build navigation links
      const navigationLinks = stryMutAct_9fa48("51649") ? [] : (stryCov_9fa48("51649"), [stryMutAct_9fa48("51650") ? {} : (stryCov_9fa48("51650"), {
        label: stryMutAct_9fa48("51651") ? "" : (stryCov_9fa48("51651"), 'View Replicas'),
        target: stryMutAct_9fa48("51652") ? "" : (stryCov_9fa48("51652"), 'replicas'),
        key: stryMutAct_9fa48("51653") ? "" : (stryCov_9fa48("51653"), 'r')
      })]);
      if (stryMutAct_9fa48("51655") ? false : stryMutAct_9fa48("51654") ? true : (stryCov_9fa48("51654", "51655"), partition.leader_node_id)) {
        if (stryMutAct_9fa48("51656")) {
          {}
        } else {
          stryCov_9fa48("51656");
          navigationLinks.push(stryMutAct_9fa48("51657") ? {} : (stryCov_9fa48("51657"), {
            label: stryMutAct_9fa48("51658") ? "" : (stryCov_9fa48("51658"), 'Go to Leader Node'),
            target: stryMutAct_9fa48("51659") ? "" : (stryCov_9fa48("51659"), 'nodes'),
            key: stryMutAct_9fa48("51660") ? "" : (stryCov_9fa48("51660"), 'n')
          }));
        }
      }
      if (stryMutAct_9fa48("51662") ? false : stryMutAct_9fa48("51661") ? true : (stryCov_9fa48("51661", "51662"), partition.table_id)) {
        if (stryMutAct_9fa48("51663")) {
          {}
        } else {
          stryCov_9fa48("51663");
          navigationLinks.push(stryMutAct_9fa48("51664") ? {} : (stryCov_9fa48("51664"), {
            label: stryMutAct_9fa48("51665") ? "" : (stryCov_9fa48("51665"), 'Go to Table'),
            target: stryMutAct_9fa48("51666") ? "" : (stryCov_9fa48("51666"), 'tables'),
            key: stryMutAct_9fa48("51667") ? "" : (stryCov_9fa48("51667"), 't')
          }));
        }
      }
      return stryMutAct_9fa48("51668") ? {} : (stryCov_9fa48("51668"), {
        title: stryMutAct_9fa48("51669") ? `` : (stryCov_9fa48("51669"), `Partition: ${partition.partition_id}`),
        sections,
        navigationLinks
      });
    }
  }

  /**
   * Format timestamp for display
   * @param {number|string|null|undefined} timestamp - Timestamp value
   * @return {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (stryMutAct_9fa48("51670")) {
      {}
    } else {
      stryCov_9fa48("51670");
      if (stryMutAct_9fa48("51673") ? timestamp === null && timestamp === undefined : stryMutAct_9fa48("51672") ? false : stryMutAct_9fa48("51671") ? true : (stryCov_9fa48("51671", "51672", "51673"), (stryMutAct_9fa48("51675") ? timestamp !== null : stryMutAct_9fa48("51674") ? false : (stryCov_9fa48("51674", "51675"), timestamp === null)) || (stryMutAct_9fa48("51677") ? timestamp !== undefined : stryMutAct_9fa48("51676") ? false : (stryCov_9fa48("51676", "51677"), timestamp === undefined)))) {
        if (stryMutAct_9fa48("51678")) {
          {}
        } else {
          stryCov_9fa48("51678");
          return stryMutAct_9fa48("51679") ? "" : (stryCov_9fa48("51679"), 'N/A');
        }
      }
      try {
        if (stryMutAct_9fa48("51680")) {
          {}
        } else {
          stryCov_9fa48("51680");
          const date = new Date(timestamp);
          if (stryMutAct_9fa48("51682") ? false : stryMutAct_9fa48("51681") ? true : (stryCov_9fa48("51681", "51682"), isNaN(date.getTime()))) {
            if (stryMutAct_9fa48("51683")) {
              {}
            } else {
              stryCov_9fa48("51683");
              return stryMutAct_9fa48("51684") ? "" : (stryCov_9fa48("51684"), 'N/A');
            }
          }
          return stryMutAct_9fa48("51685") ? date.toISOString().replace('T', ' ') : (stryCov_9fa48("51685"), date.toISOString().replace(stryMutAct_9fa48("51686") ? "" : (stryCov_9fa48("51686"), 'T'), stryMutAct_9fa48("51687") ? "" : (stryCov_9fa48("51687"), ' ')).substring(0, 19));
        }
      } catch (_err) {
        if (stryMutAct_9fa48("51688")) {
          {}
        } else {
          stryCov_9fa48("51688");
          return stryMutAct_9fa48("51689") ? "" : (stryCov_9fa48("51689"), 'N/A');
        }
      }
    }
  }
}