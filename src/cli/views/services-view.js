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
      {key: 'unified_address', label: 'Unified Address', width: 45},
      {key: 'service_type', label: 'Type', width: 15},
      {key: 'status', label: 'Status', width: 12},
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
      this.formatUnifiedAddress(service),
      this.formatServiceType(service.service_type),
      this.formatStatus(service),
    ];
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

    const sections = [
      {
        title: 'Basic Information',
        fields: [
          {label: 'Unified Address', value: unifiedAddress},
          {label: 'Service ID', value: service.service_id},
          {label: 'Type', value: this.formatServiceType(service.service_type)},
          {label: 'Node ID', value: service.node_id},
          {label: 'Status', value: this.formatStatus(service)},
        ],
      },
    ];

    // Add state machine info section for replicas with state tracking
    if (service.state_entered_at || service.previous_state ||
        service.trigger_reason || service.error_message) {
      const stateFields = [];

      // Add time-in-state for transitional states
      if (TRANSITIONAL_STATES.includes(service.status) &&
          service.state_entered_at) {
        stateFields.push({
          label: 'Time in State',
          value: this.formatTimeInState(service.state_entered_at),
        });
      }

      // Add previous state if available
      if (service.previous_state) {
        stateFields.push({
          label: 'Previous State',
          value: service.previous_state,
        });
      }

      // Add trigger reason if available
      if (service.trigger_reason) {
        stateFields.push({
          label: 'Trigger Reason',
          value: service.trigger_reason,
        });
      }

      // Add failure reason for failed replicas (Requirement 8.3)
      if (service.status === 'failed' && service.error_message) {
        stateFields.push({
          label: 'Failure Reason',
          value: service.error_message,
        });
      }

      if (stateFields.length > 0) {
        sections.push({
          title: 'State Information',
          fields: stateFields,
        });
      }
    }

    // Add storage info for partition services
    if (service.service_type === SERVICE_TYPES.PARTITION) {
      sections.push({
        title: 'Partition Details',
        fields: [
          {label: 'Partition ID', value: service.partition_id || 'N/A'},
          {label: 'Storage', value: this.formatBytes(service.storage_bytes)},
          {label: 'Role', value: service.role || 'N/A'},
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
          {label: 'Role', value: service.role || 'N/A'},
        ],
      });
    }

    return {
      title: `Service: ${unifiedAddress}`,
      sections,
    };
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
