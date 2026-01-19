/**
 * PartitionsView - Displays partition details and replica distribution
 *
 * Columns: partition_id, key_range, replica_count, leader_node_id, storage_size, status
 * Supports highlighting under-replicated partitions and navigation to hosting node.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

/**
 * Size units for formatting
 */
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

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
    super(options);
    this.cache = options.cache || null;
    this.viewName = 'partitions';
    this.tableFilter = null;
    this.expectedReplicaCount = options.expectedReplicaCount || null;
  }

  /**
   * Get column definitions for the partitions view
   * Requirements: 5.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: 'partition_id', label: 'Partition ID', width: 20},
      {key: 'key_range', label: 'Key Range', width: 25},
      {key: 'replica_count', label: 'Replicas', width: 10},
      {key: 'leader_node_id', label: 'Leader Node', width: 20},
      {key: 'size_bytes', label: 'Size', width: 12},
      {key: 'status', label: 'Status', width: 12},
    ];
  }

  /**
   * Format a partition record into a row array
   * Requirements: 5.1, 5.5, 5.7, 5.9
   * @param {Object} partition - Partition record
   * @return {Array<string>} Row values
   */
  formatRow(partition) {
    return [
      partition.partition_id || 'N/A',
      this.formatKeyRange(partition),
      this.formatReplicaCount(partition.replica_count),
      partition.leader_node_id || 'No Leader',
      this.formatSize(partition.size_bytes),
      partition.status || 'unknown',
    ];
  }

  /**
   * Format key range for display
   * Requirements: 5.5
   * @param {Object} partition - Partition record
   * @return {string} Formatted key range
   */
  formatKeyRange(partition) {
    const start = partition.partition_key_start;
    const end = partition.partition_key_end;

    const startStr = start !== null && start !== undefined ? start : '-∞';
    const endStr = end !== null && end !== undefined ? end : '+∞';

    return `[${startStr}, ${endStr})`;
  }

  /**
   * Format replica count for display
   * @param {number|null|undefined} count - Replica count
   * @return {string} Formatted count
   */
  formatReplicaCount(count) {
    if (count === null || count === undefined) {
      return 'N/A';
    }
    return String(count);
  }

  /**
   * Format size with appropriate units
   * Requirements: 5.7, 5.8
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
   * Get the row status for styling
   * Requirements: 5.6
   * @param {Object} partition - Partition record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(partition) {
    // Failed status is an error
    if (partition.status === 'failed' || partition.status === 'error') {
      return ROW_STATUS.ERROR;
    }

    // No leader is an error
    if (!partition.leader_node_id) {
      return ROW_STATUS.ERROR;
    }

    // Under-replicated partitions are warnings
    if (this.isUnderReplicated(partition)) {
      return ROW_STATUS.WARNING;
    }

    return ROW_STATUS.NORMAL;
  }

  /**
   * Check if a partition is under-replicated
   * Requirements: 5.6
   * @param {Object} partition - Partition record
   * @return {boolean} True if under-replicated
   */
  isUnderReplicated(partition) {
    if (this.expectedReplicaCount === null) {
      return false;
    }

    const actualCount = partition.replica_count;
    if (actualCount === null || actualCount === undefined) {
      return true;
    }

    return actualCount < this.expectedReplicaCount;
  }

  /**
   * Set expected replica count for under-replication detection
   * @param {number|null} count - Expected replica count
   */
  setExpectedReplicaCount(count) {
    this.expectedReplicaCount = count;
    this.updateFilteredData();
  }

  /**
   * Get the unique key for a partition
   * @param {Object} partition - Partition record
   * @return {string} Unique key (partition_id)
   */
  getItemKey(partition) {
    return partition.partition_id || '';
  }

  /**
   * Set table filter for viewing partitions of a specific table
   * @param {string|null} tableId - Table ID to filter by
   */
  setTableFilter(tableId) {
    this.tableFilter = tableId;
    this.updateFilteredData();
  }

  /**
   * Clear table filter
   */
  clearTableFilter() {
    this.tableFilter = null;
    this.updateFilteredData();
  }

  /**
   * Override applyFilter to include table filter
   * @param {Array} data - Data to filter
   * @return {Array} Filtered data
   */
  applyFilter(data) {
    let filtered = data;

    // Apply table filter
    if (this.tableFilter) {
      filtered = filtered.filter((p) => p.table_id === this.tableFilter);
    }

    // Apply text filter from base class
    return super.applyFilter(filtered);
  }

  /**
   * Handle drill-down action (Enter key on selected partition)
   * Requirements: 5.2, 5.4
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    const selectedPartition = this.getSelectedItem();
    if (!selectedPartition) {
      return null;
    }

    return {
      action: 'drillDown',
      view: 'replicas',
      context: {
        partitionId: selectedPartition.partition_id,
        tableId: selectedPartition.table_id,
      },
    };
  }

  /**
   * Navigate to the leader node
   * Requirements: 5.4
   * @return {Object|null} Navigation action or null
   */
  navigateToLeaderNode() {
    const selectedPartition = this.getSelectedItem();
    if (!selectedPartition || !selectedPartition.leader_node_id) {
      return null;
    }

    return {
      action: 'jumpToEntity',
      entityType: 'node',
      entityId: selectedPartition.leader_node_id,
    };
  }

  /**
   * Handle key input for the partitions view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (key.name === 'enter' || key.name === 'return') {
      return this.handleDrillDown();
    }
    if (key.name === 'n' || key.name === 'N') {
      return this.navigateToLeaderNode();
    }
    return super.handleKey(key);
  }

  /**
   * Get detail information for the selected partition
   * Requirements: 5.2, 5.3, 16.6
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    const partition = this.getSelectedItem();
    if (!partition) {
      return null;
    }

    const sections = [
      {
        title: 'Basic Information',
        fields: [
          {label: 'Partition ID', value: partition.partition_id},
          {label: 'Table ID', value: partition.table_id || 'N/A'},
          {label: 'Table Name', value: partition.table_name || 'N/A'},
          {label: 'Key Range', value: this.formatKeyRange(partition)},
          {label: 'Status', value: partition.status || 'unknown'},
        ],
      },
      {
        title: 'Replication',
        fields: [
          {label: 'Replica Count', value: this.formatReplicaCount(
            partition.replica_count)},
          {label: 'Leader Node', value: partition.leader_node_id || 'No Leader'},
          {label: 'Under-replicated', value: this.isUnderReplicated(partition) ?
            'Yes' : 'No'},
        ],
      },
      {
        title: 'Storage',
        fields: [
          {label: 'Size', value: this.formatSize(partition.size_bytes)},
          {label: 'Row Count', value: partition.row_count !== undefined ?
            String(partition.row_count) : 'N/A'},
          {label: 'Index Size', value: this.formatSize(partition.index_size_bytes)},
        ],
      },
    ];

    // Add Raft state section
    // Requirements: 16.6
    sections.push({
      title: 'Raft State',
      fields: [
        {label: 'Term', value: String(partition.raft_term ?? 0)},
        {label: 'Commit Index', value: String(partition.raft_commit_index ?? 0)},
        {label: 'Applied Index', value: String(partition.raft_applied_index ?? 0)},
        {label: 'Last Log Index', value: String(partition.raft_last_log_index ?? 0)},
        {label: 'Role', value: partition.raft_role || 'N/A'},
      ],
    });

    // Add replica sync status section
    // Requirements: 16.6
    if (partition.replicas && Array.isArray(partition.replicas)) {
      const replicaFields = partition.replicas.map((replica, index) => ({
        label: `Replica ${index + 1}`,
        value: `${replica.node_id || 'N/A'} - ${replica.status || 'unknown'}` +
          (replica.lag !== undefined ? ` (lag: ${replica.lag})` : ''),
      }));

      sections.push({
        title: 'Replica Sync Status',
        fields: replicaFields.length > 0 ? replicaFields : [
          {label: 'Replicas', value: 'No replica information available'},
        ],
      });
    } else if (partition.replica_nodes && Array.isArray(partition.replica_nodes)) {
      const replicaFields = partition.replica_nodes.map((nodeId, index) => ({
        label: `Replica ${index + 1}`,
        value: nodeId + (nodeId === partition.leader_node_id ? ' (Leader)' : ''),
      }));

      sections.push({
        title: 'Replica Locations',
        fields: replicaFields.length > 0 ? replicaFields : [
          {label: 'Replicas', value: 'No replica information available'},
        ],
      });
    }

    // Add recent CDC events section if available
    // Requirements: 16.6
    if (partition.recent_cdc_events && Array.isArray(partition.recent_cdc_events)) {
      const cdcFields = partition.recent_cdc_events.slice(0, 5).map((event) => ({
        label: event.operation || 'Event',
        value: `${this.formatTimestamp(event.timestamp)} - ${event.key || 'N/A'}`,
      }));

      if (cdcFields.length > 0) {
        sections.push({
          title: 'Recent CDC Events',
          fields: cdcFields,
        });
      }
    }

    // Build navigation links
    const navigationLinks = [
      {label: 'View Replicas', target: 'replicas', key: 'r'},
    ];

    if (partition.leader_node_id) {
      navigationLinks.push({
        label: 'Go to Leader Node',
        target: 'nodes',
        key: 'n',
      });
    }

    if (partition.table_id) {
      navigationLinks.push({
        label: 'Go to Table',
        target: 'tables',
        key: 't',
      });
    }

    return {
      title: `Partition: ${partition.partition_id}`,
      sections,
      navigationLinks,
    };
  }

  /**
   * Format timestamp for display
   * @param {number|string|null|undefined} timestamp - Timestamp value
   * @return {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (timestamp === null || timestamp === undefined) {
      return 'N/A';
    }

    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return 'N/A';
      }
      return date.toISOString().replace('T', ' ').substring(0, 19);
    } catch (_err) {
      return 'N/A';
    }
  }
}
