/**
 * ServicesView - Displays services running on nodes
 *
 * Columns: service_id, type, node_id, status, address
 * Supports filtering by node and service type, drill-down to partition/message_group details.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
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
      {key: 'service_id', label: 'Service ID', width: 25},
      {key: 'service_type', label: 'Type', width: 15},
      {key: 'node_id', label: 'Node ID', width: 20},
      {key: 'status', label: 'Status', width: 12},
      {key: 'address', label: 'Address', width: 25},
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
      service.service_id || 'N/A',
      this.formatServiceType(service.service_type),
      service.node_id || 'N/A',
      this.formatStatus(service),
      service.address || 'N/A',
    ];
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
   * Format service status with role indicator
   * Requirements: 3.5
   * @param {Object} service - Service record
   * @return {string} Formatted status with role
   */
  formatStatus(service) {
    const status = service.status || 'unknown';
    const role = service.role;

    if (role && (role === 'leader' || role === 'follower')) {
      return `${status} (${role})`;
    }

    return status;
  }

  /**
   * Get the row status for styling
   * @param {Object} service - Service record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(service) {
    if (service.status === 'failed' || service.status === 'error') {
      return ROW_STATUS.ERROR;
    }

    if (service.status === 'starting' || service.status === 'stopping') {
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
   * Requirements: 3.7, 3.8
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    const service = this.getSelectedItem();
    if (!service) {
      return null;
    }

    const sections = [
      {
        title: 'Basic Information',
        fields: [
          {label: 'Service ID', value: service.service_id},
          {label: 'Type', value: this.formatServiceType(service.service_type)},
          {label: 'Node ID', value: service.node_id},
          {label: 'Status', value: this.formatStatus(service)},
          {label: 'Address', value: service.address},
        ],
      },
    ];

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
      title: `Service: ${service.service_id}`,
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
