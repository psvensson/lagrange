/**
 * ReplicasView - Displays concrete replicas running on nodes.
 *
 * Columns: service_id, type, node_id, status, address
 * Supports filtering by node and service type, drill-down to partition/message_group details.
 * Includes color coding for replica states and time-in-state display.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 8.1, 8.2, 8.3
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

const LOCAL_STR_PARTITION = 'partition';
const LOCAL_STR_MESSAGE_GROUP = 'message_group';
const LOCAL_STR_NODE = 'node';
const LOCAL_STR_RUNTIME_SERVICE = 'runtime_service';
const LOCAL_STR_PENDING = 'pending';
const LOCAL_STR_CREATING = 'creating';
const LOCAL_STR_SYNCING = 'syncing';
const LOCAL_STR_ACTIVE = 'active';
const LOCAL_STR_REMOVING = 'removing';
const LOCAL_STR_REMOVED = 'removed';
const LOCAL_STR_FAILED = 'failed';
const LOCAL_STR_GREEN = 'green';
const LOCAL_STR_YELLOW = 'yellow';
const LOCAL_STR_BLUE = 'blue';
const LOCAL_STR_GRAY = 'gray';
const LOCAL_STR_RED = 'red';
const LOCAL_STR_REPLICAS = 'replicas';
const LOCAL_STR_SHORT_NAME = 'short_name';
const LOCAL_STR_NAME = 'Name';
const LOCAL_NUM_15 = 15;
const LOCAL_STR_UNIFIED_ADDRESS = 'unified_address';
const LOCAL_STR_UNIFIED_ADDRESS_2 = 'Unified Address';
const LOCAL_NUM_35 = 35;
const LOCAL_STR_NODE_ADDRESS = 'node_address';
const LOCAL_STR_NODE_ADDRESS_2 = 'Node Address';
const LOCAL_NUM_20 = 20;
const LOCAL_STR_STATUS = 'status';
const LOCAL_STR_STATE = 'State';
const LOCAL_NUM_12 = 12;
const LOCAL_STR_N_A = 'N/A';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_EIGHT = 8;
const LOCAL_NUM_17 = 17;
const LOCAL_STR_2ZI04 = '...';
const LOCAL_STR_LEADER = 'leader';
const LOCAL_STR_FOLLOWER = 'follower';
const LOCAL_STR_0S = '0s';
const LOCAL_NUM_60 = 60;
const LOCAL_STR_WHITE = 'white';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_STARTING = 'starting';
const LOCAL_STR_STOPPING = 'stopping';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_DRILLDOWN = 'drillDown';
const LOCAL_STR_PARTITIONS = 'partitions';
const LOCAL_STR_MESSAGE_GROUPS = 'message_groups';
const LOCAL_STR_NODES = 'nodes';
const LOCAL_STR_ENTER = 'enter';
const LOCAL_STR_RETURN = 'return';
const LOCAL_STR_TIME_IN_STATE = 'Time in State';
const LOCAL_STR_STATE_SINCE = 'State Since';
const LOCAL_STR_PREVIOUS_STATE = 'Previous State';
const LOCAL_STR_TRIGGER_REASON = 'Trigger Reason';
const LOCAL_STR_FAILURE_REASON = 'Failure Reason';
const LOCAL_STR_REPLICA_STATE = 'Replica State';
const LOCAL_STR_SYNC_PROGRESS = 'Sync Progress';
const LOCAL_NUM_100 = 100;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_SYNC_SOURCE = 'Sync Source';
const LOCAL_STR_BYTES_SYNCED = 'Bytes Synced';
const LOCAL_STR_TOTAL_BYTES = 'Total Bytes';
const LOCAL_STR_SYNC_RATE = 'Sync Rate';
const LOCAL_STR_EST_COMPLETION = 'Est. Completion';
const LOCAL_STR_RAFT_STATE = 'Raft State';
const LOCAL_STR_TERM = 'Term';
const LOCAL_STR_COMMIT_INDEX = 'Commit Index';
const LOCAL_STR_APPLIED_INDEX = 'Applied Index';
const LOCAL_STR_LAST_LOG_INDEX = 'Last Log Index';
const LOCAL_STR_LEADER_ID = 'Leader ID';
const LOCAL_STR_PARTITION_DETAILS = 'Partition Details';
const LOCAL_STR_PARTITION_ID = 'Partition ID';
const LOCAL_STR_TABLE_ID = 'Table ID';
const LOCAL_STR_STORAGE = 'Storage';
const LOCAL_STR_ROW_COUNT = 'Row Count';
const LOCAL_STR_1MFBR = 'Message Group Details';
const LOCAL_STR_GROUP_ID = 'Group ID';
const LOCAL_STR_MESSAGE_COUNT = 'Message Count';
const LOCAL_STR_EPOCH_INFORMATION = 'Epoch Information';
const LOCAL_STR_CURRENT_EPOCH = 'Current Epoch';
const LOCAL_STR_ASSIGNMENT_EPOCH = 'Assignment Epoch';
const LOCAL_STR_VIEW_PARTITION = 'View Partition';
const LOCAL_STR_P = 'p';
const LOCAL_STR_VIEW_MESSAGE_GROUP = 'View Message Group';
const LOCAL_STR_M = 'm';
const LOCAL_STR_VIEW_NODE = 'View Node';
const LOCAL_STR_N = 'n';
const LOCAL_STR_T = 'T';
const LOCAL_STR_SPACE = ' ';
const LOCAL_NUM_19 = 19;
const LOCAL_STR_0_B = '0 B';

/**
 * Service types for filtering
 */
export const SERVICE_TYPES = {
  PARTITION: LOCAL_STR_PARTITION,
  MESSAGE_GROUP: LOCAL_STR_MESSAGE_GROUP,
  NODE: LOCAL_STR_NODE,
  RUNTIME_SERVICE: LOCAL_STR_RUNTIME_SERVICE,
};

/**
 * Replica state constants for color coding
 * Requirements: 8.1
 */
export const REPLICA_STATES = {
  PENDING: LOCAL_STR_PENDING,
  CREATING: LOCAL_STR_CREATING,
  SYNCING: LOCAL_STR_SYNCING,
  ACTIVE: LOCAL_STR_ACTIVE,
  REMOVING: LOCAL_STR_REMOVING,
  REMOVED: LOCAL_STR_REMOVED,
  FAILED: LOCAL_STR_FAILED,
};

/**
 * Color mappings for replica states
 * Requirements: 8.1
 * - active: green
 * - syncing: yellow
 * - creating/pending: blue
 * - removing: orange (represented as yellow in terminal)
 * - failed: red
 */
export const REPLICA_STATE_COLORS = {
  [REPLICA_STATES.ACTIVE]: LOCAL_STR_GREEN,
  [REPLICA_STATES.SYNCING]: LOCAL_STR_YELLOW,
  [REPLICA_STATES.CREATING]: LOCAL_STR_BLUE,
  [REPLICA_STATES.PENDING]: LOCAL_STR_BLUE,
  [REPLICA_STATES.REMOVING]: LOCAL_STR_YELLOW, // orange not available, use yellow
  [REPLICA_STATES.REMOVED]: LOCAL_STR_GRAY,
  [REPLICA_STATES.FAILED]: LOCAL_STR_RED,
};

/**
 * Transitional states that should show time-in-state
 * Requirements: 8.2
 */
export const TRANSITIONAL_STATES = [
  REPLICA_STATES.PENDING,
  REPLICA_STATES.CREATING,
  REPLICA_STATES.SYNCING,
  REPLICA_STATES.REMOVING,
];

/**
 * ReplicasView displays concrete service replicas running on nodes.
 */
class ReplicasView extends BaseView {
  /**
   * Creates a new ServicesView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    super(options);
    this.cache = options.cache || null;
    this.viewName = LOCAL_STR_REPLICAS;
    this.nodeFilter = null;
    this.typeFilter = null;
    this.serviceIdFilter = null;
  }

  /**
   * Get column definitions for the services view
   * Requirements: 3.2
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: LOCAL_STR_SHORT_NAME, label: LOCAL_STR_NAME, width: LOCAL_NUM_15},
      {key: LOCAL_STR_UNIFIED_ADDRESS, label: LOCAL_STR_UNIFIED_ADDRESS_2, width: LOCAL_NUM_35},
      {key: LOCAL_STR_NODE_ADDRESS, label: LOCAL_STR_NODE_ADDRESS_2, width: LOCAL_NUM_20},
      {key: LOCAL_STR_STATUS, label: LOCAL_STR_STATE, width: LOCAL_NUM_12},
    ];
  }

  /**
   * Format a service record into a row array
   * Requirements: 3.2
   * @param {Object} service - Service record
   * @return {Array<string>} Row values
   */
  formatRow(service) {
    return [
      this.formatShortName(service),
      this.formatUnifiedAddress(service),
      this.formatNodeAddress(service),
      this.formatStatus(service),
    ];
  }

  /**
   * Format node address for display
   * Shows the WebSocket address and port for the node
   * @param {Object} service - Service record
   * @return {string} Node address
   */
  formatNodeAddress(service) {
    return service.node_address || service.address || LOCAL_STR_N_A;
  }

  /**
   * Format short name for display
   * Extracts a concise identifier from the service_id
   * @param {Object} service - Service record
   * @return {string} Short name
   */
  formatShortName(service) {
    const serviceId = service.service_id || '';
    const serviceType = service.service_type || '';

    if (!serviceId) {
      return LOCAL_STR_N_A;
    }

    // Check if service_id is a UUID (8-4-4-4-12 format)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(serviceId)) {
      const prefix = serviceType === 'partition' ? 'p' :
        serviceType === 'message_group' ? 'mg' : 's';
      return `${prefix}-${serviceId.substring(LOCAL_NUM_ZERO, LOCAL_NUM_EIGHT)}`;
    }

    // If it's already short, use as-is
    if (serviceId.length <= LOCAL_NUM_20) {
      return serviceId;
    }

    // Truncate long names
    return serviceId.substring(LOCAL_NUM_ZERO, LOCAL_NUM_17) + LOCAL_STR_2ZI04;
  }

  /**
   * Format unified address for display
   * Format: ${node_id}/${service_type}/${service_id}
   * @param {Object} service - Service record
   * @return {string} Unified address
   */
  formatUnifiedAddress(service) {
    const nodeId = service.node_id || 'unknown';
    const serviceType = service.service_type || 'unknown';
    const serviceId = service.service_id || 'unknown';

    // Map service_type to entity type for address format
    const entityType = serviceType === 'message_group' ? 'message-group' : serviceType;

    return `${nodeId}/${entityType}/${serviceId}`;
  }

  /**
   * Format service type for display
   * @param {string|null|undefined} type - Service type
   * @return {string} Formatted type
   */
  formatServiceType(type) {
    if (!type) return LOCAL_STR_N_A;

    const typeLabels = {
      'partition': 'Partition',
      'message_group': 'Message Group',
      'node': 'Node',
      'runtime_service': 'Runtime Service',
    };

    return typeLabels[type] || type;
  }

  /**
   * Format service status with role indicator and time-in-state
   * Requirements: 3.5, 8.2
   * @param {Object} service - Service record
   * @return {string} Formatted status with role and time-in-state
   */
  formatStatus(service) {
    const status = service.status || 'unknown';
    const role = service.role;

    let result = status;

    // Add role indicator if present
    if (role && (role === LOCAL_STR_LEADER || role === LOCAL_STR_FOLLOWER)) {
      result = `${status} (${role})`;
    }

    // Add time-in-state for transitional states
    if (TRANSITIONAL_STATES.includes(status) && service.state_entered_at) {
      const timeInState = this.formatTimeInState(service.state_entered_at);
      result = `${result} [${timeInState}]`;
    }

    return result;
  }

  /**
   * Format time-in-state for display
   * Requirements: 8.2
   * @param {number} stateEnteredAt - Timestamp when state was entered
   * @return {string} Formatted duration (e.g., "5s", "2m", "1h")
   */
  formatTimeInState(stateEnteredAt) {
    if (!stateEnteredAt) {
      return LOCAL_STR_N_A;
    }

    const now = Date.now();
    const elapsed = now - stateEnteredAt;

    if (elapsed < LOCAL_NUM_ZERO) {
      return LOCAL_STR_0S;
    }

    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > LOCAL_NUM_ZERO) {
      return `${hours}h ${minutes % LOCAL_NUM_60}m`;
    } else if (minutes > LOCAL_NUM_ZERO) {
      return `${minutes}m ${seconds % LOCAL_NUM_60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get the color for a replica state
   * Requirements: 8.1
   * @param {string} status - Service status
   * @return {string} Color name for the status
   */
  getStatusColor(status) {
    return REPLICA_STATE_COLORS[status] || LOCAL_STR_WHITE;
  }

  /**
   * Get the row status for styling based on replica state
   * Requirements: 8.1
   * @param {Object} service - Service record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(service) {
    const status = service.status;

    // Failed state gets error styling (red)
    if (status === LOCAL_STR_FAILED || status === LOCAL_STR_ERROR) {
      return ROW_STATUS.ERROR;
    }

    // Transitional states get warning styling (yellow/blue)
    if (TRANSITIONAL_STATES.includes(status)) {
      return ROW_STATUS.WARNING;
    }

    // Starting/stopping also get warning
    if (status === LOCAL_STR_STARTING || status === LOCAL_STR_STOPPING) {
      return ROW_STATUS.WARNING;
    }

    return ROW_STATUS.NORMAL;
  }

  /**
   * Get the unique key for a service
   * @param {Object} service - Service record
   * @return {string} Unique key (service_id)
   */
  getItemKey(service) {
    return service.row_key || service.service_id || LOCAL_STR_EMPTY;
  }

  /**
   * Set node filter for viewing services on a specific node
   * Requirements: 3.1
   * @param {string|null} nodeId - Node ID to filter by
   */
  setNodeFilter(nodeId) {
    this.nodeFilter = nodeId;
    this.updateFilteredData();
  }

  /**
   * Set type filter for viewing services of a specific type
   * Requirements: 3.6
   * @param {string|null} type - Service type to filter by
   */
  setTypeFilter(type) {
    this.typeFilter = type;
    this.updateFilteredData();
  }

  /**
   * Clear all service-specific filters
   */
  clearServiceFilters() {
    this.nodeFilter = null;
    this.typeFilter = null;
    this.serviceIdFilter = null;
    this.updateFilteredData();
  }

  /**
   * Set service ID filter for showing replicas of one logical service.
   * @param {string|null} serviceId - Logical service ID to filter by.
   */
  setServiceIdFilter(serviceId) {
    this.serviceIdFilter = serviceId || null;
    this.updateFilteredData();
  }

  /**
   * Override applyFilter to include node and type filters
   * @param {Array} data - Data to filter
   * @return {Array} Filtered data
   */
  applyFilter(data) {
    let filtered = data;

    // Apply node filter
    if (this.nodeFilter) {
      filtered = filtered.filter((s) => s.node_id === this.nodeFilter);
    }

    // Apply type filter
    if (this.typeFilter) {
      filtered = filtered.filter((s) => s.service_type === this.typeFilter);
    }

    // Apply logical service filter (runtime replicas).
    if (this.serviceIdFilter) {
      filtered = filtered.filter((s) => {
        return s.service_id === this.serviceIdFilter ||
          s.logical_service_id === this.serviceIdFilter;
      });
    }

    // Apply text filter from base class
    return super.applyFilter(filtered);
  }

  /**
   * Handle drill-down action (Enter key on selected service)
   * Requirements: 3.3, 3.4
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    const selectedService = this.getSelectedItem();
    if (!selectedService) {
      return null;
    }

    const serviceType = selectedService.service_type;

    if (serviceType === SERVICE_TYPES.PARTITION) {
      return {
        action: LOCAL_STR_DRILLDOWN,
        view: LOCAL_STR_PARTITIONS,
        context: {
          partitionId: selectedService.partition_id,
          serviceId: selectedService.service_id,
        },
      };
    }

    if (serviceType === SERVICE_TYPES.MESSAGE_GROUP) {
      return {
        action: LOCAL_STR_DRILLDOWN,
        view: LOCAL_STR_MESSAGE_GROUPS,
        context: {
          groupId: selectedService.group_id,
          serviceId: selectedService.service_id,
        },
      };
    }

    // For node services, show node details
    if (serviceType === SERVICE_TYPES.NODE) {
      return {
        action: LOCAL_STR_DRILLDOWN,
        view: LOCAL_STR_NODES,
        context: {nodeId: selectedService.node_id},
      };
    }

    return null;
  }

  /**
   * Handle key input for the services view
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
   * Get detail information for the selected service
   * Requirements: 3.7, 3.8, 8.2, 8.3
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    const service = this.getSelectedItem();
    if (!service) {
      return null;
    }

    const unifiedAddress = this.formatUnifiedAddress(service);
    const shortName = this.formatShortName(service);

    const sections = [
      {
        title: 'Basic Information',
        fields: [
          {label: 'Short Name', value: shortName},
          {label: 'Unified Address', value: unifiedAddress},
          {label: 'Service ID', value: service.service_id},
          {label: 'Type', value: this.formatServiceType(service.service_type)},
          {label: 'Node ID', value: service.node_id},
        ],
      },
    ];

    // Add replica state section - always show for services
    const replicaStateFields = [
      {label: 'Current State', value: service.status || 'unknown'},
      {label: 'Role', value: service.role || 'N/A'},
    ];

    // Add time-in-state for transitional states
    if (TRANSITIONAL_STATES.includes(service.status) && service.state_entered_at) {
      replicaStateFields.push({
        label: LOCAL_STR_TIME_IN_STATE,
        value: this.formatTimeInState(service.state_entered_at),
      });
    }

    // Add state entered timestamp
    if (service.state_entered_at) {
      replicaStateFields.push({
        label: LOCAL_STR_STATE_SINCE,
        value: this.formatTimestamp(service.state_entered_at),
      });
    }

    // Add previous state if available
    if (service.previous_state) {
      replicaStateFields.push({
        label: LOCAL_STR_PREVIOUS_STATE,
        value: service.previous_state,
      });
    }

    // Add trigger reason if available
    if (service.trigger_reason) {
      replicaStateFields.push({
        label: LOCAL_STR_TRIGGER_REASON,
        value: service.trigger_reason,
      });
    }

    // Add failure reason for failed replicas (Requirement 8.3)
    if ((service.status === LOCAL_STR_FAILED || service.status === LOCAL_STR_ERROR) &&
        service.error_message) {
      replicaStateFields.push({
        label: LOCAL_STR_FAILURE_REASON,
        value: service.error_message,
      });
    }

    sections.push({
      title: LOCAL_STR_REPLICA_STATE,
      fields: replicaStateFields,
    });

    // Add sync progress section for syncing replicas
    if (service.status === REPLICA_STATES.SYNCING || service.sync_progress) {
      const syncFields = [];

      if (service.sync_progress !== undefined) {
        syncFields.push({
          label: LOCAL_STR_SYNC_PROGRESS,
          value: `${(service.sync_progress * LOCAL_NUM_100).toFixed(LOCAL_NUM_ONE)}%`,
        });
      }

      if (service.sync_source_node) {
        syncFields.push({
          label: LOCAL_STR_SYNC_SOURCE,
          value: service.sync_source_node,
        });
      }

      if (service.bytes_synced !== undefined) {
        syncFields.push({
          label: LOCAL_STR_BYTES_SYNCED,
          value: this.formatBytes(service.bytes_synced),
        });
      }

      if (service.bytes_total !== undefined) {
        syncFields.push({
          label: LOCAL_STR_TOTAL_BYTES,
          value: this.formatBytes(service.bytes_total),
        });
      }

      if (service.sync_rate_bytes_per_sec !== undefined) {
        syncFields.push({
          label: LOCAL_STR_SYNC_RATE,
          value: `${this.formatBytes(service.sync_rate_bytes_per_sec)}/s`,
        });
      }

      if (service.estimated_completion) {
        syncFields.push({
          label: LOCAL_STR_EST_COMPLETION,
          value: this.formatTimestamp(service.estimated_completion),
        });
      }

      if (syncFields.length > LOCAL_NUM_ZERO) {
        sections.push({
          title: LOCAL_STR_SYNC_PROGRESS,
          fields: syncFields,
        });
      }
    }

    // Add Raft state section if available
    if (service.raft_term !== undefined || service.raft_commit_index !== undefined) {
      sections.push({
        title: LOCAL_STR_RAFT_STATE,
        fields: [
          {label: LOCAL_STR_TERM, value: String(service.raft_term ?? LOCAL_STR_N_A)},
          {
            label: LOCAL_STR_COMMIT_INDEX,
            value: String(service.raft_commit_index ?? LOCAL_STR_N_A),
          },
          {
            label: LOCAL_STR_APPLIED_INDEX,
            value: String(service.raft_applied_index ?? LOCAL_STR_N_A),
          },
          {
            label: LOCAL_STR_LAST_LOG_INDEX,
            value: String(service.raft_last_log_index ?? LOCAL_STR_N_A),
          },
          {label: LOCAL_STR_LEADER_ID, value: service.raft_leader_id || LOCAL_STR_N_A},
        ],
      });
    }

    // Add storage info for partition services
    if (service.service_type === SERVICE_TYPES.PARTITION) {
      sections.push({
        title: LOCAL_STR_PARTITION_DETAILS,
        fields: [
          {label: LOCAL_STR_PARTITION_ID, value: service.partition_id || LOCAL_STR_N_A},
          {label: LOCAL_STR_TABLE_ID, value: service.table_id || LOCAL_STR_N_A},
          {label: LOCAL_STR_STORAGE, value: this.formatBytes(service.storage_bytes)},
          {label: LOCAL_STR_ROW_COUNT, value: String(service.row_count ?? LOCAL_STR_N_A)},
        ],
      });
    }

    // Add storage info for message group services
    if (service.service_type === SERVICE_TYPES.MESSAGE_GROUP) {
      sections.push({
        title: LOCAL_STR_1MFBR,
        fields: [
          {label: LOCAL_STR_GROUP_ID, value: service.group_id || LOCAL_STR_N_A},
          {label: LOCAL_STR_STORAGE, value: this.formatBytes(service.storage_bytes)},
          {label: LOCAL_STR_MESSAGE_COUNT, value: String(service.message_count ?? LOCAL_STR_N_A)},
        ],
      });
    }

    // Add epoch information if available
    if (service.epoch !== undefined || service.assignment_epoch !== undefined) {
      sections.push({
        title: LOCAL_STR_EPOCH_INFORMATION,
        fields: [
          {label: LOCAL_STR_CURRENT_EPOCH, value: String(service.epoch ?? LOCAL_STR_N_A)},
          {
            label: LOCAL_STR_ASSIGNMENT_EPOCH,
            value: String(service.assignment_epoch ?? LOCAL_STR_N_A),
          },
        ],
      });
    }

    // Build navigation links
    const navigationLinks = [];

    if (service.service_type === SERVICE_TYPES.PARTITION && service.partition_id) {
      navigationLinks.push({
        label: LOCAL_STR_VIEW_PARTITION,
        target: LOCAL_STR_PARTITIONS,
        key: LOCAL_STR_P,
      });
    }

    if (service.service_type === SERVICE_TYPES.MESSAGE_GROUP && service.group_id) {
      navigationLinks.push({
        label: LOCAL_STR_VIEW_MESSAGE_GROUP,
        target: LOCAL_STR_MESSAGE_GROUPS,
        key: LOCAL_STR_M,
      });
    }

    if (service.node_id) {
      navigationLinks.push({
        label: LOCAL_STR_VIEW_NODE,
        target: LOCAL_STR_NODES,
        key: LOCAL_STR_N,
      });
    }

    return {
      title: `Replica: ${shortName}`,
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
      return date.toISOString().replace(LOCAL_STR_T, LOCAL_STR_SPACE)
        .substring(LOCAL_NUM_ZERO, LOCAL_NUM_19);
    } catch (_err) {
      return LOCAL_STR_N_A;
    }
  }

  /**
   * Format bytes for display
   * @param {number|null|undefined} bytes - Byte count
   * @return {string} Formatted size
   */
  formatBytes(bytes) {
    if (bytes === null || bytes === undefined) {
      return LOCAL_STR_N_A;
    }
    if (bytes === LOCAL_NUM_ZERO) {
      return LOCAL_STR_0_B;
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);

    return `${value.toFixed(LOCAL_NUM_ONE)} ${units[i]}`;
  }
}

export {ReplicasView};
export {ReplicasView as ServicesView};
