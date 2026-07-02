/**
 * TablesView - Displays database tables with metadata
 *
 * Columns: table_name, partition_count, replica_factor, total_size, policy_summary
 * Supports size formatting and policy summary truncation.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12,
 *               4.13, 4.14, 4.15
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

const LOCAL_STR_B = 'B';
const LOCAL_STR_KB = 'KB';
const LOCAL_STR_MB = 'MB';
const LOCAL_STR_GB = 'GB';
const LOCAL_STR_TB = 'TB';
const LOCAL_NUM_50 = 50;
const LOCAL_STR_TABLES = 'tables';
const LOCAL_STR_TABLE_NAME = 'table_name';
const LOCAL_STR_TABLE_NAME_2 = 'Table Name';
const LOCAL_NUM_25 = 25;
const LOCAL_STR_PARTITION_COUNT = 'partition_count';
const LOCAL_STR_PARTITIONS = 'Partitions';
const LOCAL_NUM_12 = 12;
const LOCAL_STR_REPLICA_FACTOR = 'replica_factor';
const LOCAL_STR_REPLICAS = 'Replicas';
const LOCAL_NUM_10 = 10;
const LOCAL_STR_TOTAL_SIZE = 'total_size';
const LOCAL_STR_TOTAL_SIZE_2 = 'Total Size';
const LOCAL_STR_POLICY_SUMMARY = 'policy_summary';
const LOCAL_STR_POLICY_SUMMARY_2 = 'Policy Summary';
const LOCAL_NUM_40 = 40;
const LOCAL_STR_N_A = 'N/A';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_0_B = '0 B';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_DEFAULT = 'Default';
const LOCAL_NUM_THREE = 3;
const LOCAL_STR_2ZI04 = '...';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_DRILLDOWN = 'drillDown';
const LOCAL_STR_PARTITIONS_2 = 'partitions';
const LOCAL_STR_ENTER = 'enter';
const LOCAL_STR_RETURN = 'return';
const LOCAL_STR_SCHEMA = 'Schema';
const LOCAL_STR_DEFINITION = 'Definition';
const LOCAL_STR_POLICIES = 'Policies';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_TWO = 2;
const LOCAL_STR_POLICY = 'Policy';
const LOCAL_STR_PLACEMENT = 'Placement';
const LOCAL_STR_REPLICATION = 'Replication';
const LOCAL_STR_CONSISTENCY = 'Consistency';
const LOCAL_STR_DURABILITY = 'Durability';
const LOCAL_STR_COMPRESSION = 'Compression';

/**
 * Size units for formatting
 */
export const SIZE_UNITS = [LOCAL_STR_B, LOCAL_STR_KB, LOCAL_STR_MB, LOCAL_STR_GB, LOCAL_STR_TB];

/**
 * Maximum length for policy summary before truncation
 */
export const POLICY_SUMMARY_MAX_LENGTH = LOCAL_NUM_50;

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
    super(options);
    this.cache = options.cache || null;
    this.viewName = LOCAL_STR_TABLES;
  }

  /**
   * Get column definitions for the tables view
   * Requirements: 4.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: LOCAL_STR_TABLE_NAME, label: LOCAL_STR_TABLE_NAME_2, width: LOCAL_NUM_25},
      {key: LOCAL_STR_PARTITION_COUNT, label: LOCAL_STR_PARTITIONS, width: LOCAL_NUM_12},
      {key: LOCAL_STR_REPLICA_FACTOR, label: LOCAL_STR_REPLICAS, width: LOCAL_NUM_10},
      {key: LOCAL_STR_TOTAL_SIZE, label: LOCAL_STR_TOTAL_SIZE_2, width: LOCAL_NUM_12},
      {key: LOCAL_STR_POLICY_SUMMARY, label: LOCAL_STR_POLICY_SUMMARY_2, width: LOCAL_NUM_40},
    ];
  }

  /**
   * Format a table record into a row array
   * Requirements: 4.1, 4.6, 4.7, 4.8
   * @param {Object} table - Table record
   * @return {Array<string>} Row values
   */
  formatRow(table) {
    return [
      table.table_name || LOCAL_STR_N_A,
      this.formatPartitionCount(table.partition_count),
      this.formatReplicaFactor(table.replica_factor),
      this.formatSize(table.total_size),
      this.formatPolicySummary(table),
    ];
  }

  /**
   * Format partition count for display
   * Requirements: 4.9
   * @param {number|null|undefined} count - Partition count
   * @return {string} Formatted count
   */
  formatPartitionCount(count) {
    if (count === null || count === undefined) {
      return LOCAL_STR_N_A;
    }
    return String(count);
  }

  /**
   * Format replica factor for display
   * Requirements: 4.10
   * @param {number|null|undefined} factor - Replica factor
   * @return {string} Formatted factor
   */
  formatReplicaFactor(factor) {
    if (factor === null || factor === undefined) {
      return LOCAL_STR_N_A;
    }
    return String(factor);
  }

  /**
   * Format size with appropriate units
   * Requirements: 4.8
   * @param {number|null|undefined} bytes - Size in bytes
   * @return {string} Formatted size
   */
  formatSize(bytes) {
    if (bytes === null || bytes === undefined) {
      return LOCAL_STR_N_A;
    }
    if (bytes === LOCAL_NUM_ZERO) {
      return LOCAL_STR_0_B;
    }

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);

    return `${value.toFixed(LOCAL_NUM_ONE)} ${SIZE_UNITS[i]}`;
  }

  /**
   * Format policy summary with truncation
   * Requirements: 4.11, 4.12, 4.13, 4.14, 4.15
   * @param {Object} table - Table record
   * @return {string} Formatted policy summary
   */
  formatPolicySummary(table) {
    const policies = [];

    try {
      const parsed = typeof table.table_policies === 'string' ?
        JSON.parse(table.table_policies) :
        table.table_policies;

      if (!parsed || typeof parsed !== LOCAL_STR_OBJECT) {
        return LOCAL_STR_DEFAULT;
      }

      // Requirements: 4.11 - placement_policy
      if (parsed.placement_policy) {
        policies.push(`Placement: ${parsed.placement_policy}`);
      }

      // Requirements: 4.12 - replication_policy
      if (parsed.replication_policy) {
        policies.push(`Replication: ${parsed.replication_policy}`);
      }

      // Requirements: 4.13 - consistency_level, durability, compression
      if (parsed.consistency_level) {
        policies.push(`Consistency: ${parsed.consistency_level}`);
      }
      if (parsed.durability) {
        policies.push(`Durability: ${parsed.durability}`);
      }
      if (parsed.compression) {
        policies.push(`Compression: ${parsed.compression}`);
      }
    } catch (_err) {
      // Requirements: 4.14 - malformed policy data
      return LOCAL_STR_DEFAULT;
    }

    // Requirements: 4.14 - no custom policies
    if (policies.length === LOCAL_NUM_ZERO) {
      return LOCAL_STR_DEFAULT;
    }

    const summary = policies.join(', ');

    // Requirements: 4.15 - truncation
    if (summary.length > POLICY_SUMMARY_MAX_LENGTH) {
      return summary.substring(LOCAL_NUM_ZERO, POLICY_SUMMARY_MAX_LENGTH - LOCAL_NUM_THREE) +
        LOCAL_STR_2ZI04;
    }

    return summary;
  }

  /**
   * Get the row status for styling
   * @param {Object} table - Table record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(table) {
    // Warning if table has no partitions
    if (table.partition_count === LOCAL_NUM_ZERO) {
      return ROW_STATUS.WARNING;
    }

    return ROW_STATUS.NORMAL;
  }

  /**
   * Get the unique key for a table
   * @param {Object} table - Table record
   * @return {string} Unique key (table_id or table_name)
   */
  getItemKey(table) {
    return table.table_id || table.table_name || LOCAL_STR_EMPTY;
  }

  /**
   * Handle drill-down action (Enter key on selected table)
   * Requirements: 4.2
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    const selectedTable = this.getSelectedItem();
    if (!selectedTable) {
      return null;
    }

    return {
      action: LOCAL_STR_DRILLDOWN,
      view: LOCAL_STR_PARTITIONS_2,
      context: {
        tableId: selectedTable.table_id,
        tableName: selectedTable.table_name,
      },
    };
  }

  /**
   * Handle key input for the tables view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (key.name === LOCAL_STR_ENTER || key.name === LOCAL_STR_RETURN) {
      return this.handleDrillDown();
    }
    return super.handleKey(key);
  }

  /**
   * Get detail information for the selected table
   * Requirements: 4.3, 4.4
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    const table = this.getSelectedItem();
    if (!table) {
      return null;
    }

    const sections = [
      {
        title: 'Basic Information',
        fields: [
          {label: 'Table Name', value: table.table_name},
          {label: 'Table ID', value: table.table_id || 'N/A'},
          {label: 'Partitions', value: this.formatPartitionCount(
            table.partition_count)},
          {label: 'Replica Factor', value: this.formatReplicaFactor(
            table.replica_factor)},
          {label: 'Total Size', value: this.formatSize(table.total_size)},
        ],
      },
    ];

    // Add schema section if available
    if (table.schema) {
      sections.push({
        title: LOCAL_STR_SCHEMA,
        fields: [
          {label: LOCAL_STR_DEFINITION, value: this.formatSchema(table.schema)},
        ],
      });
    }

    // Add policy section
    sections.push({
      title: LOCAL_STR_POLICIES,
      fields: this.getPolicyFields(table),
    });

    return {
      title: `Table: ${table.table_name}`,
      sections,
    };
  }

  /**
   * Format schema for display
   * @param {Object|string} schema - Schema definition
   * @return {string} Formatted schema
   */
  formatSchema(schema) {
    if (!schema) return LOCAL_STR_N_A;
    if (typeof schema === LOCAL_STR_STRING) return schema;
    return JSON.stringify(schema, null, LOCAL_NUM_TWO);
  }

  /**
   * Get policy fields for detail view
   * @param {Object} table - Table record
   * @return {Array<{label: string, value: string}>} Policy fields
   */
  getPolicyFields(table) {
    const fields = [];

    try {
      const parsed = typeof table.table_policies === 'string' ?
        JSON.parse(table.table_policies) :
        table.table_policies;

      if (!parsed || typeof parsed !== LOCAL_STR_OBJECT) {
        return [{label: LOCAL_STR_POLICY, value: LOCAL_STR_DEFAULT}];
      }

      if (parsed.placement_policy) {
        fields.push({label: LOCAL_STR_PLACEMENT, value: parsed.placement_policy});
      }
      if (parsed.replication_policy) {
        fields.push({label: LOCAL_STR_REPLICATION, value: parsed.replication_policy});
      }
      if (parsed.consistency_level) {
        fields.push({label: LOCAL_STR_CONSISTENCY, value: parsed.consistency_level});
      }
      if (parsed.durability) {
        fields.push({label: LOCAL_STR_DURABILITY, value: parsed.durability});
      }
      if (parsed.compression) {
        fields.push({label: LOCAL_STR_COMPRESSION, value: parsed.compression});
      }
    } catch (_err) {
      return [{label: LOCAL_STR_POLICY, value: LOCAL_STR_DEFAULT}];
    }

    if (fields.length === LOCAL_NUM_ZERO) {
      return [{label: LOCAL_STR_POLICY, value: LOCAL_STR_DEFAULT}];
    }

    return fields;
  }
}
