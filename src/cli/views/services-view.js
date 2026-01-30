/**
 * ServicesView - Displays services running on nodes
 *
 * Columns: service_id, type, node_id, status, address
 * Supports filtering by node and service type, drill-down to partition/message_group details.
 * Includes color coding for replica states and time-in-state display.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 8.1, 8.2, 8.3
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

/**
 * Service types for filtering
 */
export const SERVICE_TYPES = {
  PARTITION: 'partition',
  MESSAGE_GROUP: 'message_group',
  NODE: 'node',
};

/**
 * Replica state constants for color coding
 * Requirements: 8.1
 */
export const REPLICA_STATES = {
  PENDING: 'pending',
  CREATING: 'creating',
  SYNCING: 'syncing',
  ACTIVE: 'active',
  REMOVING: 'removing',
  REMOVED: 'removed',
  FAILED: 'failed',
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
  [REPLICA_STATES.ACTIVE]: 'green',
  [REPLICA_STATES.SYNCING]: 'yellow',
  [REPLICA_STATES.CREATING]: 'blue',
  [REPLICA_STATES.PENDING]: 'blue',
  [REPLICA_STATES.REMOVING]: 'yellow', // orange not available, use yellow
  [REPLICA_STATES.REMOVED]: 'gray',
  [REPLICA_STATES.FAILED]: 'red',
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
 * ServicesView displays services running on nodes
 */
export class ServicesView extends BaseView {
  /**
   * Creates a new ServicesView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    super(options);
    this.cache = options.cache || null;
    this.viewName = 'services';
    this.nodeFilter = null;
    this.typeFilter = null;
  }

  /**
   * Get column definitions for the services view
   * Requirements: 3.2
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: 'short_name', label: 'Name', width: 15},
      {key: 'unified_address', label: 'Unified Address', width: 35},
      {key: 'node_address', label: 'Node Address', width: 20},
      {key: 'status', label: 'State', width: 12},
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
    return service.node_address || service.address || 'N/A';
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
      return 'N/A';
    }

    // Check if service_id is a UUID (8-4-4-4-12 format)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(serviceId)) {
      const prefix = serviceType === 'partition' ? 'p' :
        serviceType === 'message_group' ? 'mg' : 's';
      return `${prefix}-${serviceId.substring(0, 8)}`;
    }

    // If it's already short, use as-is
    if (serviceId.length <= 20) {
      return serviceId;
    }

    // Truncate long names
    return serviceId.substring(0, 17) + '...';
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
    if (!type) return 'N/A';

    const typeLabels = {
      'partition': 'Partition',
      'message_group': 'Message Group',
      'node': 'Node',
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
    if (role && (role === 'leader' || role === 'follower')) {
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
      return 'N/A';
    }

    const now = Date.now();
    const elapsed = now - stateEnteredAt;

    if (elapsed < 0) {
      return '0s';
    }

    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
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
    return REPLICA_STATE_COLORS[status] || 'white';
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
    if (status === 'failed' || status === 'error') {
      return ROW_STATUS.ERROR;
    }

    // Transitional states get warning styling (yellow/blue)
    if (TRANSITIONAL_STATES.includes(status)) {
      return ROW_STATUS.WARNING;
    }

    // Starting/stopping also get warning
    if (status === 'starting' || status === 'stopping') {
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
    return service.service_id || '';
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
        action: 'drillDown',
        view: 'partitions',
        context: {
          partitionId: selectedService.partition_id,
          serviceId: selectedService.service_id,
        },
      };
    }

    if (serviceType === SERVICE_TYPES.MESSAGE_GROUP) {
      return {
        action: 'drillDown',
        view: 'message_groups',
        context: {
          groupId: selectedService.group_id,
          serviceId: selectedService.service_id,
        },
      };
    }

    // For node services, show node details
    if (serviceType === SERVICE_TYPES.NODE) {
      return {
        action: 'drillDown',
        view: 'nodes',
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
    if (key.name === 'enter' || key.name === 'return') {
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
        label: 'Time in State',
        value: this.formatTimeInState(service.state_entered_at),
      });
    }

    // Add state entered timestamp
    if (service.state_entered_at) {
      replicaStateFields.push({
        label: 'State Since',
        value: this.formatTimestamp(service.state_entered_at),
      });
    }

    // Add previous state if available
    if (service.previous_state) {
      replicaStateFields.push({
        label: 'Previous State',
        value: service.previous_state,
      });
    }

    // Add trigger reason if available
    if (service.trigger_reason) {
      replicaStateFields.push({
        label: 'Trigger Reason',
        value: service.trigger_reason,
      });
    }

    // Add failure reason for failed replicas (Requirement 8.3)
    if ((service.status === 'failed' || service.status === 'error') &&
        service.error_message) {
      replicaStateFields.push({
        label: 'Failure Reason',
        value: service.error_message,
      });
    }

    sections.push({
      title: 'Replica State',
      fields: replicaStateFields,
    });

    // Add sync progress section for syncing replicas
    if (service.status === REPLICA_STATES.SYNCING || service.sync_progress) {
      const syncFields = [];

      if (service.sync_progress !== undefined) {
        syncFields.push({
          label: 'Sync Progress',
          value: `${(service.sync_progress * 100).toFixed(1)}%`,
        });
      }

      if (service.sync_source_node) {
        syncFields.push({
          label: 'Sync Source',
          value: service.sync_source_node,
        });
      }

      if (service.bytes_synced !== undefined) {
        syncFields.push({
          label: 'Bytes Synced',
          value: this.formatBytes(service.bytes_synced),
        });
      }

      if (service.bytes_total !== undefined) {
        syncFields.push({
          label: 'Total Bytes',
          value: this.formatBytes(service.bytes_total),
        });
      }

      if (service.sync_rate_bytes_per_sec !== undefined) {
        syncFields.push({
          label: 'Sync Rate',
          value: `${this.formatBytes(service.sync_rate_bytes_per_sec)}/s`,
        });
      }

      if (service.estimated_completion) {
        syncFields.push({
          label: 'Est. Completion',
          value: this.formatTimestamp(service.estimated_completion),
        });
      }

      if (syncFields.length > 0) {
        sections.push({
          title: 'Sync Progress',
          fields: syncFields,
        });
      }
    }

    // Add Raft state section if available
    if (service.raft_term !== undefined || service.raft_commit_index !== undefined) {
      sections.push({
        title: 'Raft State',
        fields: [
          {label: 'Term', value: String(service.raft_term ?? 'N/A')},
          {label: 'Commit Index', value: String(service.raft_commit_index ?? 'N/A')},
          {label: 'Applied Index', value: String(service.raft_applied_index ?? 'N/A')},
          {label: 'Last Log Index', value: String(service.raft_last_log_index ?? 'N/A')},
          {label: 'Leader ID', value: service.raft_leader_id || 'N/A'},
        ],
      });
    }

    // Add storage info for partition services
    if (service.service_type === SERVICE_TYPES.PARTITION) {
      sections.push({
        title: 'Partition Details',
        fields: [
          {label: 'Partition ID', value: service.partition_id || 'N/A'},
          {label: 'Table ID', value: service.table_id || 'N/A'},
          {label: 'Storage', value: this.formatBytes(service.storage_bytes)},
          {label: 'Row Count', value: String(service.row_count ?? 'N/A')},
        ],
      });
    }

    // Add storage info for message group services
    if (service.service_type === SERVICE_TYPES.MESSAGE_GROUP) {
      sections.push({
        title: 'Message Group Details',
        fields: [
          {label: 'Group ID', value: service.group_id || 'N/A'},
          {label: 'Storage', value: this.formatBytes(service.storage_bytes)},
          {label: 'Message Count', value: String(service.message_count ?? 'N/A')},
        ],
      });
    }

    // Add epoch information if available
    if (service.epoch !== undefined || service.assignment_epoch !== undefined) {
      sections.push({
        title: 'Epoch Information',
        fields: [
          {label: 'Current Epoch', value: String(service.epoch ?? 'N/A')},
          {label: 'Assignment Epoch', value: String(service.assignment_epoch ?? 'N/A')},
        ],
      });
    }

    // Build navigation links
    const navigationLinks = [];

    if (service.service_type === SERVICE_TYPES.PARTITION && service.partition_id) {
      navigationLinks.push({
        label: 'View Partition',
        target: 'partitions',
        key: 'p',
      });
    }

    if (service.service_type === SERVICE_TYPES.MESSAGE_GROUP && service.group_id) {
      navigationLinks.push({
        label: 'View Message Group',
        target: 'message_groups',
        key: 'm',
      });
    }

    if (service.node_id) {
      navigationLinks.push({
        label: 'View Node',
        target: 'nodes',
        key: 'n',
      });
    }

    return {
      title: `Service: ${shortName}`,
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

  /**
   * Format bytes for display
   * @param {number|null|undefined} bytes - Byte count
   * @return {string} Formatted size
   */
  formatBytes(bytes) {
    if (bytes === null || bytes === undefined) {
      return 'N/A';
    }
    if (bytes === 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);

    return `${value.toFixed(1)} ${units[i]}`;
  }
}
