/**
 * PartitionsView - Displays partition details and replica distribution
 *
 * Columns: partition_id, key_range, replica_count, leader_node_id, storage_size, status
 * Supports highlighting under-replicated partitions and navigation to hosting node.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

const LOCAL_STR_PARTITIONS = 'partitions';
const LOCAL_STR_PARTITION_ID = 'partition_id';
const LOCAL_STR_PARTITION_ID_2 = 'Partition ID';
const LOCAL_NUM_20 = 20;
const LOCAL_STR_KEY_RANGE = 'key_range';
const LOCAL_STR_KEY_RANGE_2 = 'Key Range';
const LOCAL_NUM_25 = 25;
const LOCAL_STR_REPLICA_COUNT = 'replica_count';
const LOCAL_STR_REPLICAS = 'Replicas';
const LOCAL_NUM_10 = 10;
const LOCAL_STR_LEADER_NODE_ID = 'leader_node_id';
const LOCAL_STR_LEADER_NODE = 'Leader Node';
const LOCAL_STR_SIZE_BYTES = 'size_bytes';
const LOCAL_STR_SIZE = 'Size';
const LOCAL_NUM_12 = 12;
const LOCAL_STR_STATUS = 'status';
const LOCAL_STR_STATUS_2 = 'Status';
const LOCAL_STR_N_A = 'N/A';
const LOCAL_STR_NO_LEADER = 'No Leader';
const LOCAL_STR_UNKNOWN = 'unknown';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_0_B = '0 B';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_FAILED = 'failed';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_DRILLDOWN = 'drillDown';
const LOCAL_STR_REPLICAS_2 = 'replicas';
const LOCAL_STR_JUMPTOENTITY = 'jumpToEntity';
const LOCAL_STR_NODE = 'node';
const LOCAL_STR_ENTER = 'enter';
const LOCAL_STR_RETURN = 'return';
const LOCAL_STR_N = 'n';
const LOCAL_STR_N_2 = 'N';
const LOCAL_STR_RAFT_STATE = 'Raft State';
const LOCAL_STR_TERM = 'Term';
const LOCAL_STR_COMMIT_INDEX = 'Commit Index';
const LOCAL_STR_APPLIED_INDEX = 'Applied Index';
const LOCAL_STR_LAST_LOG_INDEX = 'Last Log Index';
const LOCAL_STR_ROLE = 'Role';
const LOCAL_STR_8XEJZ = 'Replica Sync Status';
const LOCAL_STR_NFN9W = 'No replica information available';
const LOCAL_STR_REPLICA_LOCATIONS = 'Replica Locations';
const LOCAL_STR_RECENT_CDC_EVENTS = 'Recent CDC Events';
const LOCAL_STR_GO_TO_LEADER_NODE = 'Go to Leader Node';
const LOCAL_STR_NODES = 'nodes';
const LOCAL_STR_GO_TO_TABLE = 'Go to Table';
const LOCAL_STR_TABLES = 'tables';
const LOCAL_STR_T = 't';
const LOCAL_STR_T_2 = 'T';
const LOCAL_STR_SPACE = ' ';
const LOCAL_NUM_19 = 19;

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
    this.viewName = LOCAL_STR_PARTITIONS;
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
      {key: LOCAL_STR_PARTITION_ID, label: LOCAL_STR_PARTITION_ID_2, width: LOCAL_NUM_20},
      {key: LOCAL_STR_KEY_RANGE, label: LOCAL_STR_KEY_RANGE_2, width: LOCAL_NUM_25},
      {key: LOCAL_STR_REPLICA_COUNT, label: LOCAL_STR_REPLICAS, width: LOCAL_NUM_10},
      {key: LOCAL_STR_LEADER_NODE_ID, label: LOCAL_STR_LEADER_NODE, width: LOCAL_NUM_20},
      {key: LOCAL_STR_SIZE_BYTES, label: LOCAL_STR_SIZE, width: LOCAL_NUM_12},
      {key: LOCAL_STR_STATUS, label: LOCAL_STR_STATUS_2, width: LOCAL_NUM_12},
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
      partition.partition_id || LOCAL_STR_N_A,
      this.formatKeyRange(partition),
      this.formatReplicaCount(partition.replica_count),
      partition.leader_node_id || LOCAL_STR_NO_LEADER,
      this.formatSize(partition.size_bytes),
      partition.status || LOCAL_STR_UNKNOWN,
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
      return LOCAL_STR_N_A;
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
   * Get the row status for styling
   * Requirements: 5.6
   * @param {Object} partition - Partition record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(partition) {
    // Failed status is an error
    if (partition.status === LOCAL_STR_FAILED || partition.status === LOCAL_STR_ERROR) {
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
    return partition.partition_id || LOCAL_STR_EMPTY;
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
      action: LOCAL_STR_DRILLDOWN,
      view: LOCAL_STR_REPLICAS_2,
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
      action: LOCAL_STR_JUMPTOENTITY,
      entityType: LOCAL_STR_NODE,
      entityId: selectedPartition.leader_node_id,
    };
  }

  /**
   * Handle key input for the partitions view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (key.name === LOCAL_STR_ENTER || key.name === LOCAL_STR_RETURN) {
      return this.handleDrillDown();
    }
    if (key.name === LOCAL_STR_N || key.name === LOCAL_STR_N_2) {
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
      title: LOCAL_STR_RAFT_STATE,
      fields: [
        {label: LOCAL_STR_TERM, value: String(partition.raft_term ?? LOCAL_NUM_ZERO)},
        {label: LOCAL_STR_COMMIT_INDEX, value: String(partition.raft_commit_index ?? LOCAL_NUM_ZERO)},
        {label: LOCAL_STR_APPLIED_INDEX, value: String(partition.raft_applied_index ?? LOCAL_NUM_ZERO)},
        {label: LOCAL_STR_LAST_LOG_INDEX, value: String(partition.raft_last_log_index ?? LOCAL_NUM_ZERO)},
        {label: LOCAL_STR_ROLE, value: partition.raft_role || LOCAL_STR_N_A},
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
        title: LOCAL_STR_8XEJZ,
        fields: replicaFields.length > LOCAL_NUM_ZERO ? replicaFields : [
          {label: LOCAL_STR_REPLICAS, value: LOCAL_STR_NFN9W},
        ],
      });
    } else if (partition.replica_nodes && Array.isArray(partition.replica_nodes)) {
      const replicaFields = partition.replica_nodes.map((nodeId, index) => ({
        label: `Replica ${index + 1}`,
        value: nodeId + (nodeId === partition.leader_node_id ? ' (Leader)' : ''),
      }));

      sections.push({
        title: LOCAL_STR_REPLICA_LOCATIONS,
        fields: replicaFields.length > LOCAL_NUM_ZERO ? replicaFields : [
          {label: LOCAL_STR_REPLICAS, value: LOCAL_STR_NFN9W},
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

      if (cdcFields.length > LOCAL_NUM_ZERO) {
        sections.push({
          title: LOCAL_STR_RECENT_CDC_EVENTS,
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
        label: LOCAL_STR_GO_TO_LEADER_NODE,
        target: LOCAL_STR_NODES,
        key: LOCAL_STR_N,
      });
    }

    if (partition.table_id) {
      navigationLinks.push({
        label: LOCAL_STR_GO_TO_TABLE,
        target: LOCAL_STR_TABLES,
        key: LOCAL_STR_T,
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
      return LOCAL_STR_N_A;
    }

    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return LOCAL_STR_N_A;
      }
      return date.toISOString().replace(LOCAL_STR_T_2, LOCAL_STR_SPACE).substring(LOCAL_NUM_ZERO, LOCAL_NUM_19);
    } catch (_err) {
      return LOCAL_STR_N_A;
    }
  }
}
