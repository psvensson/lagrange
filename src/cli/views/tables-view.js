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

/**
 * Size units for formatting
 */
export const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

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
    super(options);
    this.cache = options.cache || null;
    this.viewName = 'tables';
  }

  /**
   * Get column definitions for the tables view
   * Requirements: 4.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: 'table_name', label: 'Table Name', width: 25},
      {key: 'partition_count', label: 'Partitions', width: 12},
      {key: 'replica_factor', label: 'Replicas', width: 10},
      {key: 'total_size', label: 'Total Size', width: 12},
      {key: 'policy_summary', label: 'Policy Summary', width: 40},
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
      table.table_name || 'N/A',
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
      return 'N/A';
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
      return 'N/A';
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
      return 'N/A';
    }
    if (bytes === 0) {
      return '0 B';
    }

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);

    return `${value.toFixed(1)} ${SIZE_UNITS[i]}`;
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

      if (!parsed || typeof parsed !== 'object') {
        return 'Default';
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
      return 'Default';
    }

    // Requirements: 4.14 - no custom policies
    if (policies.length === 0) {
      return 'Default';
    }

    const summary = policies.join(', ');

    // Requirements: 4.15 - truncation
    if (summary.length > POLICY_SUMMARY_MAX_LENGTH) {
      return summary.substring(0, POLICY_SUMMARY_MAX_LENGTH - 3) + '...';
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
    if (table.partition_count === 0) {
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
    return table.table_id || table.table_name || '';
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
      action: 'drillDown',
      view: 'partitions',
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
    if (key.name === 'enter' || key.name === 'return') {
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
        title: 'Schema',
        fields: [
          {label: 'Definition', value: this.formatSchema(table.schema)},
        ],
      });
    }

    // Add policy section
    sections.push({
      title: 'Policies',
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
    if (!schema) return 'N/A';
    if (typeof schema === 'string') return schema;
    return JSON.stringify(schema, null, 2);
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

      if (!parsed || typeof parsed !== 'object') {
        return [{label: 'Policy', value: 'Default'}];
      }

      if (parsed.placement_policy) {
        fields.push({label: 'Placement', value: parsed.placement_policy});
      }
      if (parsed.replication_policy) {
        fields.push({label: 'Replication', value: parsed.replication_policy});
      }
      if (parsed.consistency_level) {
        fields.push({label: 'Consistency', value: parsed.consistency_level});
      }
      if (parsed.durability) {
        fields.push({label: 'Durability', value: parsed.durability});
      }
      if (parsed.compression) {
        fields.push({label: 'Compression', value: parsed.compression});
      }
    } catch (_err) {
      return [{label: 'Policy', value: 'Default'}];
    }

    if (fields.length === 0) {
      return [{label: 'Policy', value: 'Default'}];
    }

    return fields;
  }
}
