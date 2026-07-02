/**
 * NodesView - Displays cluster nodes with health metrics
 *
 * Columns: node_id, address, status, CPU%, memory%, disk%, services_count
 * Supports drill-down to replicas and warning highlighting.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

const LOCAL_NUM_80 = 80;
const LOCAL_NUM_85 = 85;
const LOCAL_STR_NODES = 'nodes';
const LOCAL_STR_NODE_ID = 'node_id';
const LOCAL_STR_NODE_ID_2 = 'Node ID';
const LOCAL_NUM_20 = 20;
const LOCAL_STR_NODE_ADDRESS = 'node_address';
const LOCAL_STR_ADDRESS = 'Address';
const LOCAL_STR_STATUS = 'status';
const LOCAL_STR_STATUS_2 = 'Status';
const LOCAL_NUM_10 = 10;
const LOCAL_STR_CPU_USAGE_PERCENT = 'cpu_usage_percent';
const LOCAL_STR_CPU = 'CPU%';
const LOCAL_NUM_EIGHT = 8;
const LOCAL_STR_1QS1P = 'memory_usage_percent';
const LOCAL_STR_MEM = 'Mem%';
const LOCAL_STR_DISK_USAGE_PERCENT = 'disk_usage_percent';
const LOCAL_STR_DISK = 'Disk%';
const LOCAL_STR_SERVICES_COUNT = 'services_count';
const LOCAL_STR_REPLICAS = 'Replicas';
const LOCAL_STR_N_A = 'N/A';
const LOCAL_STR_UNKNOWN = 'unknown';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_FAILED = 'failed';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_DRILLDOWN = 'drillDown';
const LOCAL_STR_REPLICAS_2 = 'replicas';
const LOCAL_STR_ENTER = 'enter';
const LOCAL_STR_RETURN = 'return';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_CONFIGURATION = 'Configuration';
const LOCAL_STR_NETWORK = 'Network';
const LOCAL_STR_CONNECTIONS = 'Connections';
const LOCAL_STR_BYTES_IN = 'Bytes In';
const LOCAL_STR_BYTES_OUT = 'Bytes Out';
const LOCAL_STR_SPACE = ' ';
const LOCAL_STR_0_B = '0 B';

/**
 * Warning thresholds for resource usage
 */
export const WARNING_THRESHOLDS = {
  CPU_PERCENT: LOCAL_NUM_80,
  MEMORY_PERCENT: LOCAL_NUM_85,
  DISK_PERCENT: LOCAL_NUM_80,
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
    this.viewName = LOCAL_STR_NODES;
  }

  /**
   * Get column definitions for the nodes view
   * Requirements: 2.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: LOCAL_STR_NODE_ID, label: LOCAL_STR_NODE_ID_2, width: LOCAL_NUM_20},
      {key: LOCAL_STR_NODE_ADDRESS, label: LOCAL_STR_ADDRESS, width: LOCAL_NUM_20},
      {key: LOCAL_STR_STATUS, label: LOCAL_STR_STATUS_2, width: LOCAL_NUM_10},
      {key: LOCAL_STR_CPU_USAGE_PERCENT, label: LOCAL_STR_CPU, width: LOCAL_NUM_EIGHT},
      {key: LOCAL_STR_1QS1P, label: LOCAL_STR_MEM, width: LOCAL_NUM_EIGHT},
      {key: LOCAL_STR_DISK_USAGE_PERCENT, label: LOCAL_STR_DISK, width: LOCAL_NUM_EIGHT},
      {key: LOCAL_STR_SERVICES_COUNT, label: LOCAL_STR_REPLICAS, width: LOCAL_NUM_10},
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
      node.node_id || LOCAL_STR_N_A,
      node.node_address || LOCAL_STR_N_A,
      node.status || LOCAL_STR_UNKNOWN,
      this.formatPercent(node.cpu_usage_percent),
      this.formatPercent(node.memory_usage_percent),
      this.formatPercent(node.disk_usage_percent),
      String(node.services_count ?? LOCAL_NUM_ZERO),
    ];
  }

  /**
   * Format a percentage value for display
   * @param {number|null|undefined} value - Percentage value
   * @return {string} Formatted percentage
   */
  formatPercent(value) {
    if (value === null || value === undefined) {
      return LOCAL_STR_N_A;
    }
    return `${Number(value).toFixed(LOCAL_NUM_ONE)}%`;
  }

  /**
   * Get the row status for styling based on node health
   * Requirements: 2.4
   * @param {Object} node - Node record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(node) {
    // Failed status is an error
    if (node.status === LOCAL_STR_FAILED || node.status === LOCAL_STR_ERROR) {
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
    return node.node_id || LOCAL_STR_EMPTY;
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
      action: LOCAL_STR_DRILLDOWN,
      view: LOCAL_STR_REPLICAS_2,
      context: {nodeId: selectedNode.node_id},
    };
  }

  /**
   * Handle key input for the nodes view
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
        title: 'Replicas',
        fields: [
          {label: 'Total Replicas', value: String(node.services_count ?? 0)},
          {label: 'Partition Replicas', value: String(node.partition_services_count ?? 'N/A')},
          {label: 'Message Group Replicas', value: String(node.mg_services_count ?? 'N/A')},
        ],
      },
    ];

    // Add configuration section if available
    if (node.config && typeof node.config === LOCAL_STR_OBJECT) {
      const configFields = Object.entries(node.config).slice(0, 10).map(([k, v]) => ({
        label: k,
        value: typeof v === 'object' ? JSON.stringify(v) : String(v),
      }));

      if (configFields.length > LOCAL_NUM_ZERO) {
        sections.push({
          title: LOCAL_STR_CONFIGURATION,
          fields: configFields,
        });
      }
    }

    // Add network info if available
    if (node.network_info) {
      sections.push({
        title: LOCAL_STR_NETWORK,
        fields: [
          {
            label: LOCAL_STR_CONNECTIONS,
            value: String(node.network_info.connections ?? LOCAL_STR_N_A),
          },
          {label: LOCAL_STR_BYTES_IN, value: this.formatBytes(node.network_info.bytes_in)},
          {label: LOCAL_STR_BYTES_OUT, value: this.formatBytes(node.network_info.bytes_out)},
        ],
      });
    }

    // Build related counts
    const relatedCounts = {
      Replicas: node.services_count ?? 0,
    };

    // Build navigation links
    const navigationLinks = [
      {label: 'View Replicas', target: 'replicas', key: 'r'},
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
      return LOCAL_STR_N_A;
    }

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > LOCAL_NUM_ZERO) parts.push(`${days}d`);
    if (hours > LOCAL_NUM_ZERO) parts.push(`${hours}h`);
    if (minutes > LOCAL_NUM_ZERO || parts.length === LOCAL_NUM_ZERO) parts.push(`${minutes}m`);

    return parts.join(LOCAL_STR_SPACE);
  }

  /**
   * Format bytes in human-readable format
   * @param {number|null|undefined} bytes - Bytes value
   * @return {string} Formatted bytes
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
