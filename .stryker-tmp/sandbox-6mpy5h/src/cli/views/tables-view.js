/**
 * TablesView - Displays database tables with metadata
 *
 * Columns: table_name, partition_count, replica_factor, total_size, policy_summary
 * Supports size formatting and policy summary truncation.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12,
 *               4.13, 4.14, 4.15
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
export const SIZE_UNITS = stryMutAct_9fa48("52278") ? [] : (stryCov_9fa48("52278"), [stryMutAct_9fa48("52279") ? "" : (stryCov_9fa48("52279"), 'B'), stryMutAct_9fa48("52280") ? "" : (stryCov_9fa48("52280"), 'KB'), stryMutAct_9fa48("52281") ? "" : (stryCov_9fa48("52281"), 'MB'), stryMutAct_9fa48("52282") ? "" : (stryCov_9fa48("52282"), 'GB'), stryMutAct_9fa48("52283") ? "" : (stryCov_9fa48("52283"), 'TB')]);

/**
 * Maximum length for policy summary before truncation
 */
export const POLICY_SUMMARY_MAX_LENGTH = 50;

/**
 * TablesView displays database tables with metadata
 */
export class TablesView extends BaseView {
  /**
   * Creates a new TablesView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("52284")) {
      {}
    } else {
      stryCov_9fa48("52284");
      super(options);
      this.cache = stryMutAct_9fa48("52287") ? options.cache && null : stryMutAct_9fa48("52286") ? false : stryMutAct_9fa48("52285") ? true : (stryCov_9fa48("52285", "52286", "52287"), options.cache || null);
      this.viewName = stryMutAct_9fa48("52288") ? "" : (stryCov_9fa48("52288"), 'tables');
    }
  }

  /**
   * Get column definitions for the tables view
   * Requirements: 4.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    if (stryMutAct_9fa48("52289")) {
      {}
    } else {
      stryCov_9fa48("52289");
      return stryMutAct_9fa48("52290") ? [] : (stryCov_9fa48("52290"), [stryMutAct_9fa48("52291") ? {} : (stryCov_9fa48("52291"), {
        key: stryMutAct_9fa48("52292") ? "" : (stryCov_9fa48("52292"), 'table_name'),
        label: stryMutAct_9fa48("52293") ? "" : (stryCov_9fa48("52293"), 'Table Name'),
        width: 25
      }), stryMutAct_9fa48("52294") ? {} : (stryCov_9fa48("52294"), {
        key: stryMutAct_9fa48("52295") ? "" : (stryCov_9fa48("52295"), 'partition_count'),
        label: stryMutAct_9fa48("52296") ? "" : (stryCov_9fa48("52296"), 'Partitions'),
        width: 12
      }), stryMutAct_9fa48("52297") ? {} : (stryCov_9fa48("52297"), {
        key: stryMutAct_9fa48("52298") ? "" : (stryCov_9fa48("52298"), 'replica_factor'),
        label: stryMutAct_9fa48("52299") ? "" : (stryCov_9fa48("52299"), 'Replicas'),
        width: 10
      }), stryMutAct_9fa48("52300") ? {} : (stryCov_9fa48("52300"), {
        key: stryMutAct_9fa48("52301") ? "" : (stryCov_9fa48("52301"), 'total_size'),
        label: stryMutAct_9fa48("52302") ? "" : (stryCov_9fa48("52302"), 'Total Size'),
        width: 12
      }), stryMutAct_9fa48("52303") ? {} : (stryCov_9fa48("52303"), {
        key: stryMutAct_9fa48("52304") ? "" : (stryCov_9fa48("52304"), 'policy_summary'),
        label: stryMutAct_9fa48("52305") ? "" : (stryCov_9fa48("52305"), 'Policy Summary'),
        width: 40
      })]);
    }
  }

  /**
   * Format a table record into a row array
   * Requirements: 4.1, 4.6, 4.7, 4.8
   * @param {Object} table - Table record
   * @return {Array<string>} Row values
   */
  formatRow(table) {
    if (stryMutAct_9fa48("52306")) {
      {}
    } else {
      stryCov_9fa48("52306");
      return stryMutAct_9fa48("52307") ? [] : (stryCov_9fa48("52307"), [stryMutAct_9fa48("52310") ? table.table_name && 'N/A' : stryMutAct_9fa48("52309") ? false : stryMutAct_9fa48("52308") ? true : (stryCov_9fa48("52308", "52309", "52310"), table.table_name || (stryMutAct_9fa48("52311") ? "" : (stryCov_9fa48("52311"), 'N/A'))), this.formatPartitionCount(table.partition_count), this.formatReplicaFactor(table.replica_factor), this.formatSize(table.total_size), this.formatPolicySummary(table)]);
    }
  }

  /**
   * Format partition count for display
   * Requirements: 4.9
   * @param {number|null|undefined} count - Partition count
   * @return {string} Formatted count
   */
  formatPartitionCount(count) {
    if (stryMutAct_9fa48("52312")) {
      {}
    } else {
      stryCov_9fa48("52312");
      if (stryMutAct_9fa48("52315") ? count === null && count === undefined : stryMutAct_9fa48("52314") ? false : stryMutAct_9fa48("52313") ? true : (stryCov_9fa48("52313", "52314", "52315"), (stryMutAct_9fa48("52317") ? count !== null : stryMutAct_9fa48("52316") ? false : (stryCov_9fa48("52316", "52317"), count === null)) || (stryMutAct_9fa48("52319") ? count !== undefined : stryMutAct_9fa48("52318") ? false : (stryCov_9fa48("52318", "52319"), count === undefined)))) {
        if (stryMutAct_9fa48("52320")) {
          {}
        } else {
          stryCov_9fa48("52320");
          return stryMutAct_9fa48("52321") ? "" : (stryCov_9fa48("52321"), 'N/A');
        }
      }
      return String(count);
    }
  }

  /**
   * Format replica factor for display
   * Requirements: 4.10
   * @param {number|null|undefined} factor - Replica factor
   * @return {string} Formatted factor
   */
  formatReplicaFactor(factor) {
    if (stryMutAct_9fa48("52322")) {
      {}
    } else {
      stryCov_9fa48("52322");
      if (stryMutAct_9fa48("52325") ? factor === null && factor === undefined : stryMutAct_9fa48("52324") ? false : stryMutAct_9fa48("52323") ? true : (stryCov_9fa48("52323", "52324", "52325"), (stryMutAct_9fa48("52327") ? factor !== null : stryMutAct_9fa48("52326") ? false : (stryCov_9fa48("52326", "52327"), factor === null)) || (stryMutAct_9fa48("52329") ? factor !== undefined : stryMutAct_9fa48("52328") ? false : (stryCov_9fa48("52328", "52329"), factor === undefined)))) {
        if (stryMutAct_9fa48("52330")) {
          {}
        } else {
          stryCov_9fa48("52330");
          return stryMutAct_9fa48("52331") ? "" : (stryCov_9fa48("52331"), 'N/A');
        }
      }
      return String(factor);
    }
  }

  /**
   * Format size with appropriate units
   * Requirements: 4.8
   * @param {number|null|undefined} bytes - Size in bytes
   * @return {string} Formatted size
   */
  formatSize(bytes) {
    if (stryMutAct_9fa48("52332")) {
      {}
    } else {
      stryCov_9fa48("52332");
      if (stryMutAct_9fa48("52335") ? bytes === null && bytes === undefined : stryMutAct_9fa48("52334") ? false : stryMutAct_9fa48("52333") ? true : (stryCov_9fa48("52333", "52334", "52335"), (stryMutAct_9fa48("52337") ? bytes !== null : stryMutAct_9fa48("52336") ? false : (stryCov_9fa48("52336", "52337"), bytes === null)) || (stryMutAct_9fa48("52339") ? bytes !== undefined : stryMutAct_9fa48("52338") ? false : (stryCov_9fa48("52338", "52339"), bytes === undefined)))) {
        if (stryMutAct_9fa48("52340")) {
          {}
        } else {
          stryCov_9fa48("52340");
          return stryMutAct_9fa48("52341") ? "" : (stryCov_9fa48("52341"), 'N/A');
        }
      }
      if (stryMutAct_9fa48("52344") ? bytes !== 0 : stryMutAct_9fa48("52343") ? false : stryMutAct_9fa48("52342") ? true : (stryCov_9fa48("52342", "52343", "52344"), bytes === 0)) {
        if (stryMutAct_9fa48("52345")) {
          {}
        } else {
          stryCov_9fa48("52345");
          return stryMutAct_9fa48("52346") ? "" : (stryCov_9fa48("52346"), '0 B');
        }
      }
      const i = Math.floor(stryMutAct_9fa48("52347") ? Math.log(bytes) * Math.log(1024) : (stryCov_9fa48("52347"), Math.log(bytes) / Math.log(1024)));
      const value = stryMutAct_9fa48("52348") ? bytes * Math.pow(1024, i) : (stryCov_9fa48("52348"), bytes / Math.pow(1024, i));
      return stryMutAct_9fa48("52349") ? `` : (stryCov_9fa48("52349"), `${value.toFixed(1)} ${SIZE_UNITS[i]}`);
    }
  }

  /**
   * Format policy summary with truncation
   * Requirements: 4.11, 4.12, 4.13, 4.14, 4.15
   * @param {Object} table - Table record
   * @return {string} Formatted policy summary
   */
  formatPolicySummary(table) {
    if (stryMutAct_9fa48("52350")) {
      {}
    } else {
      stryCov_9fa48("52350");
      const policies = stryMutAct_9fa48("52351") ? ["Stryker was here"] : (stryCov_9fa48("52351"), []);
      try {
        if (stryMutAct_9fa48("52352")) {
          {}
        } else {
          stryCov_9fa48("52352");
          const parsed = (stryMutAct_9fa48("52355") ? typeof table.table_policies !== 'string' : stryMutAct_9fa48("52354") ? false : stryMutAct_9fa48("52353") ? true : (stryCov_9fa48("52353", "52354", "52355"), typeof table.table_policies === (stryMutAct_9fa48("52356") ? "" : (stryCov_9fa48("52356"), 'string')))) ? JSON.parse(table.table_policies) : table.table_policies;
          if (stryMutAct_9fa48("52359") ? !parsed && typeof parsed !== 'object' : stryMutAct_9fa48("52358") ? false : stryMutAct_9fa48("52357") ? true : (stryCov_9fa48("52357", "52358", "52359"), (stryMutAct_9fa48("52360") ? parsed : (stryCov_9fa48("52360"), !parsed)) || (stryMutAct_9fa48("52362") ? typeof parsed === 'object' : stryMutAct_9fa48("52361") ? false : (stryCov_9fa48("52361", "52362"), typeof parsed !== (stryMutAct_9fa48("52363") ? "" : (stryCov_9fa48("52363"), 'object')))))) {
            if (stryMutAct_9fa48("52364")) {
              {}
            } else {
              stryCov_9fa48("52364");
              return stryMutAct_9fa48("52365") ? "" : (stryCov_9fa48("52365"), 'Default');
            }
          }

          // Requirements: 4.11 - placement_policy
          if (stryMutAct_9fa48("52367") ? false : stryMutAct_9fa48("52366") ? true : (stryCov_9fa48("52366", "52367"), parsed.placement_policy)) {
            if (stryMutAct_9fa48("52368")) {
              {}
            } else {
              stryCov_9fa48("52368");
              policies.push(stryMutAct_9fa48("52369") ? `` : (stryCov_9fa48("52369"), `Placement: ${parsed.placement_policy}`));
            }
          }

          // Requirements: 4.12 - replication_policy
          if (stryMutAct_9fa48("52371") ? false : stryMutAct_9fa48("52370") ? true : (stryCov_9fa48("52370", "52371"), parsed.replication_policy)) {
            if (stryMutAct_9fa48("52372")) {
              {}
            } else {
              stryCov_9fa48("52372");
              policies.push(stryMutAct_9fa48("52373") ? `` : (stryCov_9fa48("52373"), `Replication: ${parsed.replication_policy}`));
            }
          }

          // Requirements: 4.13 - consistency_level, durability, compression
          if (stryMutAct_9fa48("52375") ? false : stryMutAct_9fa48("52374") ? true : (stryCov_9fa48("52374", "52375"), parsed.consistency_level)) {
            if (stryMutAct_9fa48("52376")) {
              {}
            } else {
              stryCov_9fa48("52376");
              policies.push(stryMutAct_9fa48("52377") ? `` : (stryCov_9fa48("52377"), `Consistency: ${parsed.consistency_level}`));
            }
          }
          if (stryMutAct_9fa48("52379") ? false : stryMutAct_9fa48("52378") ? true : (stryCov_9fa48("52378", "52379"), parsed.durability)) {
            if (stryMutAct_9fa48("52380")) {
              {}
            } else {
              stryCov_9fa48("52380");
              policies.push(stryMutAct_9fa48("52381") ? `` : (stryCov_9fa48("52381"), `Durability: ${parsed.durability}`));
            }
          }
          if (stryMutAct_9fa48("52383") ? false : stryMutAct_9fa48("52382") ? true : (stryCov_9fa48("52382", "52383"), parsed.compression)) {
            if (stryMutAct_9fa48("52384")) {
              {}
            } else {
              stryCov_9fa48("52384");
              policies.push(stryMutAct_9fa48("52385") ? `` : (stryCov_9fa48("52385"), `Compression: ${parsed.compression}`));
            }
          }
        }
      } catch (_err) {
        if (stryMutAct_9fa48("52386")) {
          {}
        } else {
          stryCov_9fa48("52386");
          // Requirements: 4.14 - malformed policy data
          return stryMutAct_9fa48("52387") ? "" : (stryCov_9fa48("52387"), 'Default');
        }
      }

      // Requirements: 4.14 - no custom policies
      if (stryMutAct_9fa48("52390") ? policies.length !== 0 : stryMutAct_9fa48("52389") ? false : stryMutAct_9fa48("52388") ? true : (stryCov_9fa48("52388", "52389", "52390"), policies.length === 0)) {
        if (stryMutAct_9fa48("52391")) {
          {}
        } else {
          stryCov_9fa48("52391");
          return stryMutAct_9fa48("52392") ? "" : (stryCov_9fa48("52392"), 'Default');
        }
      }
      const summary = policies.join(stryMutAct_9fa48("52393") ? "" : (stryCov_9fa48("52393"), ', '));

      // Requirements: 4.15 - truncation
      if (stryMutAct_9fa48("52397") ? summary.length <= POLICY_SUMMARY_MAX_LENGTH : stryMutAct_9fa48("52396") ? summary.length >= POLICY_SUMMARY_MAX_LENGTH : stryMutAct_9fa48("52395") ? false : stryMutAct_9fa48("52394") ? true : (stryCov_9fa48("52394", "52395", "52396", "52397"), summary.length > POLICY_SUMMARY_MAX_LENGTH)) {
        if (stryMutAct_9fa48("52398")) {
          {}
        } else {
          stryCov_9fa48("52398");
          return (stryMutAct_9fa48("52399") ? summary : (stryCov_9fa48("52399"), summary.substring(0, stryMutAct_9fa48("52400") ? POLICY_SUMMARY_MAX_LENGTH + 3 : (stryCov_9fa48("52400"), POLICY_SUMMARY_MAX_LENGTH - 3)))) + (stryMutAct_9fa48("52401") ? "" : (stryCov_9fa48("52401"), '...'));
        }
      }
      return summary;
    }
  }

  /**
   * Get the row status for styling
   * @param {Object} table - Table record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(table) {
    if (stryMutAct_9fa48("52402")) {
      {}
    } else {
      stryCov_9fa48("52402");
      // Warning if table has no partitions
      if (stryMutAct_9fa48("52405") ? table.partition_count !== 0 : stryMutAct_9fa48("52404") ? false : stryMutAct_9fa48("52403") ? true : (stryCov_9fa48("52403", "52404", "52405"), table.partition_count === 0)) {
        if (stryMutAct_9fa48("52406")) {
          {}
        } else {
          stryCov_9fa48("52406");
          return ROW_STATUS.WARNING;
        }
      }
      return ROW_STATUS.NORMAL;
    }
  }

  /**
   * Get the unique key for a table
   * @param {Object} table - Table record
   * @return {string} Unique key (table_id or table_name)
   */
  getItemKey(table) {
    if (stryMutAct_9fa48("52407")) {
      {}
    } else {
      stryCov_9fa48("52407");
      return stryMutAct_9fa48("52410") ? (table.table_id || table.table_name) && '' : stryMutAct_9fa48("52409") ? false : stryMutAct_9fa48("52408") ? true : (stryCov_9fa48("52408", "52409", "52410"), (stryMutAct_9fa48("52412") ? table.table_id && table.table_name : stryMutAct_9fa48("52411") ? false : (stryCov_9fa48("52411", "52412"), table.table_id || table.table_name)) || (stryMutAct_9fa48("52413") ? "Stryker was here!" : (stryCov_9fa48("52413"), '')));
    }
  }

  /**
   * Handle drill-down action (Enter key on selected table)
   * Requirements: 4.2
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    if (stryMutAct_9fa48("52414")) {
      {}
    } else {
      stryCov_9fa48("52414");
      const selectedTable = this.getSelectedItem();
      if (stryMutAct_9fa48("52417") ? false : stryMutAct_9fa48("52416") ? true : stryMutAct_9fa48("52415") ? selectedTable : (stryCov_9fa48("52415", "52416", "52417"), !selectedTable)) {
        if (stryMutAct_9fa48("52418")) {
          {}
        } else {
          stryCov_9fa48("52418");
          return null;
        }
      }
      return stryMutAct_9fa48("52419") ? {} : (stryCov_9fa48("52419"), {
        action: stryMutAct_9fa48("52420") ? "" : (stryCov_9fa48("52420"), 'drillDown'),
        view: stryMutAct_9fa48("52421") ? "" : (stryCov_9fa48("52421"), 'partitions'),
        context: stryMutAct_9fa48("52422") ? {} : (stryCov_9fa48("52422"), {
          tableId: selectedTable.table_id,
          tableName: selectedTable.table_name
        })
      });
    }
  }

  /**
   * Handle key input for the tables view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (stryMutAct_9fa48("52423")) {
      {}
    } else {
      stryCov_9fa48("52423");
      if (stryMutAct_9fa48("52426") ? key.name === 'enter' && key.name === 'return' : stryMutAct_9fa48("52425") ? false : stryMutAct_9fa48("52424") ? true : (stryCov_9fa48("52424", "52425", "52426"), (stryMutAct_9fa48("52428") ? key.name !== 'enter' : stryMutAct_9fa48("52427") ? false : (stryCov_9fa48("52427", "52428"), key.name === (stryMutAct_9fa48("52429") ? "" : (stryCov_9fa48("52429"), 'enter')))) || (stryMutAct_9fa48("52431") ? key.name !== 'return' : stryMutAct_9fa48("52430") ? false : (stryCov_9fa48("52430", "52431"), key.name === (stryMutAct_9fa48("52432") ? "" : (stryCov_9fa48("52432"), 'return')))))) {
        if (stryMutAct_9fa48("52433")) {
          {}
        } else {
          stryCov_9fa48("52433");
          return this.handleDrillDown();
        }
      }
      return super.handleKey(key);
    }
  }

  /**
   * Get detail information for the selected table
   * Requirements: 4.3, 4.4
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    if (stryMutAct_9fa48("52434")) {
      {}
    } else {
      stryCov_9fa48("52434");
      const table = this.getSelectedItem();
      if (stryMutAct_9fa48("52437") ? false : stryMutAct_9fa48("52436") ? true : stryMutAct_9fa48("52435") ? table : (stryCov_9fa48("52435", "52436", "52437"), !table)) {
        if (stryMutAct_9fa48("52438")) {
          {}
        } else {
          stryCov_9fa48("52438");
          return null;
        }
      }
      const sections = stryMutAct_9fa48("52439") ? [] : (stryCov_9fa48("52439"), [stryMutAct_9fa48("52440") ? {} : (stryCov_9fa48("52440"), {
        title: stryMutAct_9fa48("52441") ? "" : (stryCov_9fa48("52441"), 'Basic Information'),
        fields: stryMutAct_9fa48("52442") ? [] : (stryCov_9fa48("52442"), [stryMutAct_9fa48("52443") ? {} : (stryCov_9fa48("52443"), {
          label: stryMutAct_9fa48("52444") ? "" : (stryCov_9fa48("52444"), 'Table Name'),
          value: table.table_name
        }), stryMutAct_9fa48("52445") ? {} : (stryCov_9fa48("52445"), {
          label: stryMutAct_9fa48("52446") ? "" : (stryCov_9fa48("52446"), 'Table ID'),
          value: stryMutAct_9fa48("52449") ? table.table_id && 'N/A' : stryMutAct_9fa48("52448") ? false : stryMutAct_9fa48("52447") ? true : (stryCov_9fa48("52447", "52448", "52449"), table.table_id || (stryMutAct_9fa48("52450") ? "" : (stryCov_9fa48("52450"), 'N/A')))
        }), stryMutAct_9fa48("52451") ? {} : (stryCov_9fa48("52451"), {
          label: stryMutAct_9fa48("52452") ? "" : (stryCov_9fa48("52452"), 'Partitions'),
          value: this.formatPartitionCount(table.partition_count)
        }), stryMutAct_9fa48("52453") ? {} : (stryCov_9fa48("52453"), {
          label: stryMutAct_9fa48("52454") ? "" : (stryCov_9fa48("52454"), 'Replica Factor'),
          value: this.formatReplicaFactor(table.replica_factor)
        }), stryMutAct_9fa48("52455") ? {} : (stryCov_9fa48("52455"), {
          label: stryMutAct_9fa48("52456") ? "" : (stryCov_9fa48("52456"), 'Total Size'),
          value: this.formatSize(table.total_size)
        })])
      })]);

      // Add schema section if available
      if (stryMutAct_9fa48("52458") ? false : stryMutAct_9fa48("52457") ? true : (stryCov_9fa48("52457", "52458"), table.schema)) {
        if (stryMutAct_9fa48("52459")) {
          {}
        } else {
          stryCov_9fa48("52459");
          sections.push(stryMutAct_9fa48("52460") ? {} : (stryCov_9fa48("52460"), {
            title: stryMutAct_9fa48("52461") ? "" : (stryCov_9fa48("52461"), 'Schema'),
            fields: stryMutAct_9fa48("52462") ? [] : (stryCov_9fa48("52462"), [stryMutAct_9fa48("52463") ? {} : (stryCov_9fa48("52463"), {
              label: stryMutAct_9fa48("52464") ? "" : (stryCov_9fa48("52464"), 'Definition'),
              value: this.formatSchema(table.schema)
            })])
          }));
        }
      }

      // Add policy section
      sections.push(stryMutAct_9fa48("52465") ? {} : (stryCov_9fa48("52465"), {
        title: stryMutAct_9fa48("52466") ? "" : (stryCov_9fa48("52466"), 'Policies'),
        fields: this.getPolicyFields(table)
      }));
      return stryMutAct_9fa48("52467") ? {} : (stryCov_9fa48("52467"), {
        title: stryMutAct_9fa48("52468") ? `` : (stryCov_9fa48("52468"), `Table: ${table.table_name}`),
        sections
      });
    }
  }

  /**
   * Format schema for display
   * @param {Object|string} schema - Schema definition
   * @return {string} Formatted schema
   */
  formatSchema(schema) {
    if (stryMutAct_9fa48("52469")) {
      {}
    } else {
      stryCov_9fa48("52469");
      if (stryMutAct_9fa48("52472") ? false : stryMutAct_9fa48("52471") ? true : stryMutAct_9fa48("52470") ? schema : (stryCov_9fa48("52470", "52471", "52472"), !schema)) return stryMutAct_9fa48("52473") ? "" : (stryCov_9fa48("52473"), 'N/A');
      if (stryMutAct_9fa48("52476") ? typeof schema !== 'string' : stryMutAct_9fa48("52475") ? false : stryMutAct_9fa48("52474") ? true : (stryCov_9fa48("52474", "52475", "52476"), typeof schema === (stryMutAct_9fa48("52477") ? "" : (stryCov_9fa48("52477"), 'string')))) return schema;
      return JSON.stringify(schema, null, 2);
    }
  }

  /**
   * Get policy fields for detail view
   * @param {Object} table - Table record
   * @return {Array<{label: string, value: string}>} Policy fields
   */
  getPolicyFields(table) {
    if (stryMutAct_9fa48("52478")) {
      {}
    } else {
      stryCov_9fa48("52478");
      const fields = stryMutAct_9fa48("52479") ? ["Stryker was here"] : (stryCov_9fa48("52479"), []);
      try {
        if (stryMutAct_9fa48("52480")) {
          {}
        } else {
          stryCov_9fa48("52480");
          const parsed = (stryMutAct_9fa48("52483") ? typeof table.table_policies !== 'string' : stryMutAct_9fa48("52482") ? false : stryMutAct_9fa48("52481") ? true : (stryCov_9fa48("52481", "52482", "52483"), typeof table.table_policies === (stryMutAct_9fa48("52484") ? "" : (stryCov_9fa48("52484"), 'string')))) ? JSON.parse(table.table_policies) : table.table_policies;
          if (stryMutAct_9fa48("52487") ? !parsed && typeof parsed !== 'object' : stryMutAct_9fa48("52486") ? false : stryMutAct_9fa48("52485") ? true : (stryCov_9fa48("52485", "52486", "52487"), (stryMutAct_9fa48("52488") ? parsed : (stryCov_9fa48("52488"), !parsed)) || (stryMutAct_9fa48("52490") ? typeof parsed === 'object' : stryMutAct_9fa48("52489") ? false : (stryCov_9fa48("52489", "52490"), typeof parsed !== (stryMutAct_9fa48("52491") ? "" : (stryCov_9fa48("52491"), 'object')))))) {
            if (stryMutAct_9fa48("52492")) {
              {}
            } else {
              stryCov_9fa48("52492");
              return stryMutAct_9fa48("52493") ? [] : (stryCov_9fa48("52493"), [stryMutAct_9fa48("52494") ? {} : (stryCov_9fa48("52494"), {
                label: stryMutAct_9fa48("52495") ? "" : (stryCov_9fa48("52495"), 'Policy'),
                value: stryMutAct_9fa48("52496") ? "" : (stryCov_9fa48("52496"), 'Default')
              })]);
            }
          }
          if (stryMutAct_9fa48("52498") ? false : stryMutAct_9fa48("52497") ? true : (stryCov_9fa48("52497", "52498"), parsed.placement_policy)) {
            if (stryMutAct_9fa48("52499")) {
              {}
            } else {
              stryCov_9fa48("52499");
              fields.push(stryMutAct_9fa48("52500") ? {} : (stryCov_9fa48("52500"), {
                label: stryMutAct_9fa48("52501") ? "" : (stryCov_9fa48("52501"), 'Placement'),
                value: parsed.placement_policy
              }));
            }
          }
          if (stryMutAct_9fa48("52503") ? false : stryMutAct_9fa48("52502") ? true : (stryCov_9fa48("52502", "52503"), parsed.replication_policy)) {
            if (stryMutAct_9fa48("52504")) {
              {}
            } else {
              stryCov_9fa48("52504");
              fields.push(stryMutAct_9fa48("52505") ? {} : (stryCov_9fa48("52505"), {
                label: stryMutAct_9fa48("52506") ? "" : (stryCov_9fa48("52506"), 'Replication'),
                value: parsed.replication_policy
              }));
            }
          }
          if (stryMutAct_9fa48("52508") ? false : stryMutAct_9fa48("52507") ? true : (stryCov_9fa48("52507", "52508"), parsed.consistency_level)) {
            if (stryMutAct_9fa48("52509")) {
              {}
            } else {
              stryCov_9fa48("52509");
              fields.push(stryMutAct_9fa48("52510") ? {} : (stryCov_9fa48("52510"), {
                label: stryMutAct_9fa48("52511") ? "" : (stryCov_9fa48("52511"), 'Consistency'),
                value: parsed.consistency_level
              }));
            }
          }
          if (stryMutAct_9fa48("52513") ? false : stryMutAct_9fa48("52512") ? true : (stryCov_9fa48("52512", "52513"), parsed.durability)) {
            if (stryMutAct_9fa48("52514")) {
              {}
            } else {
              stryCov_9fa48("52514");
              fields.push(stryMutAct_9fa48("52515") ? {} : (stryCov_9fa48("52515"), {
                label: stryMutAct_9fa48("52516") ? "" : (stryCov_9fa48("52516"), 'Durability'),
                value: parsed.durability
              }));
            }
          }
          if (stryMutAct_9fa48("52518") ? false : stryMutAct_9fa48("52517") ? true : (stryCov_9fa48("52517", "52518"), parsed.compression)) {
            if (stryMutAct_9fa48("52519")) {
              {}
            } else {
              stryCov_9fa48("52519");
              fields.push(stryMutAct_9fa48("52520") ? {} : (stryCov_9fa48("52520"), {
                label: stryMutAct_9fa48("52521") ? "" : (stryCov_9fa48("52521"), 'Compression'),
                value: parsed.compression
              }));
            }
          }
        }
      } catch (_err) {
        if (stryMutAct_9fa48("52522")) {
          {}
        } else {
          stryCov_9fa48("52522");
          return stryMutAct_9fa48("52523") ? [] : (stryCov_9fa48("52523"), [stryMutAct_9fa48("52524") ? {} : (stryCov_9fa48("52524"), {
            label: stryMutAct_9fa48("52525") ? "" : (stryCov_9fa48("52525"), 'Policy'),
            value: stryMutAct_9fa48("52526") ? "" : (stryCov_9fa48("52526"), 'Default')
          })]);
        }
      }
      if (stryMutAct_9fa48("52529") ? fields.length !== 0 : stryMutAct_9fa48("52528") ? false : stryMutAct_9fa48("52527") ? true : (stryCov_9fa48("52527", "52528", "52529"), fields.length === 0)) {
        if (stryMutAct_9fa48("52530")) {
          {}
        } else {
          stryCov_9fa48("52530");
          return stryMutAct_9fa48("52531") ? [] : (stryCov_9fa48("52531"), [stryMutAct_9fa48("52532") ? {} : (stryCov_9fa48("52532"), {
            label: stryMutAct_9fa48("52533") ? "" : (stryCov_9fa48("52533"), 'Policy'),
            value: stryMutAct_9fa48("52534") ? "" : (stryCov_9fa48("52534"), 'Default')
          })]);
        }
      }
      return fields;
    }
  }
}