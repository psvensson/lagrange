/**
 * NodesView - Displays cluster nodes with health metrics
 *
 * Columns: node_id, address, status, CPU%, memory%, disk%, services_count
 * Supports drill-down to services and warning highlighting.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

/**
 * Warning thresholds for resource usage
 */
export const WARNING_THRESHOLDS = {
  CPU_PERCENT: 80,
  MEMORY_PERCENT: 85,
  DISK_PERCENT: 80,
};

/**
 * NodesView displays all nodes in the cluster with health metrics
 */
export class NodesView extends BaseView {
  /**
   * Creates a new NodesView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    super(options);
    this.cache = options.cache || null;
    this.viewName = 'nodes';
  }

  /**
   * Get column definitions for the nodes view
   * Requirements: 2.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: 'node_id', label: 'Node ID', width: 20},
      {key: 'node_address', label: 'Address', width: 20},
      {key: 'status', label: 'Status', width: 10},
      {key: 'cpu_usage_percent', label: 'CPU%', width: 8},
      {key: 'memory_usage_percent', label: 'Mem%', width: 8},
      {key: 'disk_usage_percent', label: 'Disk%', width: 8},
      {key: 'services_count', label: 'Services', width: 10},
    ];
  }

  /**
   * Format a node record into a row array
   * Requirements: 2.1
   * @param {Object} node - Node record
   * @return {Array<string>} Row values
   */
  formatRow(node) {
    return [
      node.node_id || 'N/A',
      node.node_address || 'N/A',
      node.status || 'unknown',
      this.formatPercent(node.cpu_usage_percent),
      this.formatPercent(node.memory_usage_percent),
      this.formatPercent(node.disk_usage_percent),
      String(node.services_count ?? 0),
    ];
  }

  /**
   * Format a percentage value for display
   * @param {number|null|undefined} value - Percentage value
   * @return {string} Formatted percentage
   */
  formatPercent(value) {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    return `${Number(value).toFixed(1)}%`;
  }

  /**
   * Get the row status for styling based on node health
   * Requirements: 2.4
   * @param {Object} node - Node record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(node) {
    // Failed status is an error
    if (node.status === 'failed' || node.status === 'error') {
      return ROW_STATUS.ERROR;
    }

    // Check for warning conditions (high resource usage)
    if (this.hasWarningCondition(node)) {
      return ROW_STATUS.WARNING;
    }

    return ROW_STATUS.NORMAL;
  }

  /**
   * Check if a node has any warning conditions
   * @param {Object} node - Node record
   * @return {boolean} True if node has warning conditions
   */
  hasWarningCondition(node) {
    const cpuUsage = node.cpu_usage_percent;
    const memUsage = node.memory_usage_percent;
    const diskUsage = node.disk_usage_percent;

    if (cpuUsage !== null && cpuUsage !== undefined &&
        cpuUsage > WARNING_THRESHOLDS.CPU_PERCENT) {
      return true;
    }

    if (memUsage !== null && memUsage !== undefined &&
        memUsage > WARNING_THRESHOLDS.MEMORY_PERCENT) {
      return true;
    }

    if (diskUsage !== null && diskUsage !== undefined &&
        diskUsage > WARNING_THRESHOLDS.DISK_PERCENT) {
      return true;
    }

    return false;
  }

  /**
   * Get the unique key for a node
   * @param {Object} node - Node record
   * @return {string} Unique key (node_id)
   */
  getItemKey(node) {
    return node.node_id || '';
  }

  /**
   * Handle drill-down action (Enter key on selected node)
   * Requirements: 2.3
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    const selectedNode = this.getSelectedItem();
    if (!selectedNode) {
      return null;
    }

    return {
      action: 'drillDown',
      view: 'services',
      context: {nodeId: selectedNode.node_id},
    };
  }

  /**
   * Handle key input for the nodes view
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
   * Get detail information for the selected node
   * Requirements: 16.5
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    const node = this.getSelectedItem();
    if (!node) {
      return null;
    }

    const sections = [
      {
        title: 'Basic Information',
        fields: [
          {label: 'Node ID', value: node.node_id},
          {label: 'Address', value: node.node_address},
          {label: 'Status', value: node.status},
          {label: 'Version', value: node.version || 'N/A'},
          {label: 'Uptime', value: this.formatUptime(node.uptime_seconds)},
        ],
      },
      {
        title: 'Resource Statistics',
        fields: [
          {label: 'CPU Usage', value: this.formatPercent(node.cpu_usage_percent)},
          {label: 'Memory Usage', value: this.formatPercent(node.memory_usage_percent)},
          {label: 'Memory Total', value: this.formatBytes(node.memory_total_bytes)},
          {label: 'Memory Used', value: this.formatBytes(node.memory_used_bytes)},
          {label: 'Disk Usage', value: this.formatPercent(node.disk_usage_percent)},
          {label: 'Disk Total', value: this.formatBytes(node.disk_total_bytes)},
          {label: 'Disk Used', value: this.formatBytes(node.disk_used_bytes)},
        ],
      },
      {
        title: 'Services',
        fields: [
          {label: 'Total Services', value: String(node.services_count ?? 0)},
          {label: 'Partition Services', value: String(node.partition_services_count ?? 'N/A')},
          {label: 'Message Group Services', value: String(node.mg_services_count ?? 'N/A')},
        ],
      },
    ];

    // Add configuration section if available
    if (node.config && typeof node.config === 'object') {
      const configFields = Object.entries(node.config).slice(0, 10).map(([k, v]) => ({
        label: k,
        value: typeof v === 'object' ? JSON.stringify(v) : String(v),
      }));

      if (configFields.length > 0) {
        sections.push({
          title: 'Configuration',
          fields: configFields,
        });
      }
    }

    // Add network info if available
    if (node.network_info) {
      sections.push({
        title: 'Network',
        fields: [
          {label: 'Connections', value: String(node.network_info.connections ?? 'N/A')},
          {label: 'Bytes In', value: this.formatBytes(node.network_info.bytes_in)},
          {label: 'Bytes Out', value: this.formatBytes(node.network_info.bytes_out)},
        ],
      });
    }

    // Build related counts
    const relatedCounts = {
      Services: node.services_count ?? 0,
    };

    // Build navigation links
    const navigationLinks = [
      {label: 'View Services', target: 'services', key: 's'},
    ];

    return {
      title: `Node: ${node.node_id}`,
      sections,
      relatedCounts,
      navigationLinks,
    };
  }

  /**
   * Format uptime in human-readable format
   * @param {number|null|undefined} seconds - Uptime in seconds
   * @return {string} Formatted uptime
   */
  formatUptime(seconds) {
    if (seconds === null || seconds === undefined) {
      return 'N/A';
    }

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

    return parts.join(' ');
  }

  /**
   * Format bytes in human-readable format
   * @param {number|null|undefined} bytes - Bytes value
   * @return {string} Formatted bytes
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
