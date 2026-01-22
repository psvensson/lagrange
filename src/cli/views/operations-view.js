/**
 * OperationsView - Displays replica operations with workflow steps
 *
 * Columns: operation_id, type, partition_id, target_node, status, workflow_step, updated_at
 * Supports filtering by status and viewing operation history.
 *
 * Requirements: 4.4, 9.3
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

/**
 * Operation status types for styling
 */
export const OPERATION_STATUS = {
  PENDING: 'pending',
  CREATING: 'creating',
  SYNCING: 'syncing',
  ACTIVE: 'active',
  REMOVING: 'removing',
  REMOVED: 'removed',
  FAILED: 'failed',
};

/**
 * Workflow steps for ADD operations
 */
export const ADD_WORKFLOW_STEPS = ['PENDING', 'SENDING', 'CREATING', 'SYNCING', 'ACTIVE'];

/**
 * Workflow steps for REMOVE operations
 */
export const REMOVE_WORKFLOW_STEPS = ['PENDING', 'SENDING', 'STOPPING', 'REMOVED'];

/**
 * OperationsView displays all replica operations with workflow steps
 */
export class OperationsView extends BaseView {
  /**
   * Creates a new OperationsView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    super(options);
    this.cache = options.cache || null;
    this.viewName = 'operations';
  }

  /**
   * Get column definitions for the operations view
   * Requirements: 4.4
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: 'operation_id', label: 'Operation ID', width: 12},
      {key: 'type', label: 'Type', width: 8},
      {key: 'partition_id', label: 'Partition', width: 15},
      {key: 'target_node_id', label: 'Target Node', width: 15},
      {key: 'status', label: 'Status', width: 10},
      {key: 'workflow_step', label: 'Step', width: 10},
      {key: 'updated_at', label: 'Updated', width: 20},
    ];
  }

  /**
   * Format an operation record into a row array
   * Requirements: 4.4
   * @param {Object} operation - Operation record
   * @return {Array<string>} Row values
   */
  formatRow(operation) {
    return [
      this.truncateId(operation.operation_id),
      operation.type || 'N/A',
      this.truncateId(operation.partition_id),
      this.truncateId(operation.target_node_id),
      operation.status || 'unknown',
      operation.workflow_step || 'N/A',
      this.formatTimestamp(operation.updated_at),
    ];
  }

  /**
   * Truncate a UUID for display
   * @param {string|null|undefined} id - UUID to truncate
   * @return {string} Truncated ID
   */
  truncateId(id) {
    if (!id) return 'N/A';
    if (id.length <= 12) return id;
    return id.substring(0, 8) + '...';
  }

  /**
   * Format a timestamp for display
   * @param {number|null|undefined} timestamp - Unix timestamp in milliseconds
   * @return {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toISOString().replace('T', ' ').substring(0, 19);
  }

  /**
   * Get the row status for styling based on operation state
   * Requirements: 4.4
   * @param {Object} operation - Operation record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(operation) {
    // Failed status is an error
    if (operation.status === OPERATION_STATUS.FAILED) {
      return ROW_STATUS.ERROR;
    }

    // In-progress operations get warning styling
    if (this.isInProgress(operation)) {
      return ROW_STATUS.WARNING;
    }

    return ROW_STATUS.NORMAL;
  }

  /**
   * Check if an operation is in progress
   * @param {Object} operation - Operation record
   * @return {boolean} True if operation is in progress
   */
  isInProgress(operation) {
    const terminalStatuses = [
      OPERATION_STATUS.ACTIVE,
      OPERATION_STATUS.REMOVED,
      OPERATION_STATUS.FAILED,
    ];
    return !terminalStatuses.includes(operation.status);
  }

  /**
   * Get the unique key for an operation
   * @param {Object} operation - Operation record
   * @return {string} Unique key (operation_id)
   */
  getItemKey(operation) {
    return operation.operation_id || '';
  }

  /**
   * Handle key input for the operations view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (key.name === 'enter' || key.name === 'return') {
      // Show operation details
      return this.handleDrillDown();
    }
    return super.handleKey(key);
  }

  /**
   * Handle drill-down action (Enter key on selected operation)
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    const selectedOp = this.getSelectedItem();
    if (!selectedOp) {
      return null;
    }

    // Could navigate to partition details
    return {
      action: 'drillDown',
      view: 'partitions',
      context: {partitionId: selectedOp.partition_id},
    };
  }

  /**
   * Get detail information for the selected operation
   * Requirements: 4.4, 9.3
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    const operation = this.getSelectedItem();
    if (!operation) {
      return null;
    }

    // Parse steps history
    let stepsHistory = [];
    try {
      if (typeof operation.steps_history === 'string') {
        stepsHistory = JSON.parse(operation.steps_history);
      } else if (Array.isArray(operation.steps_history)) {
        stepsHistory = operation.steps_history;
      }
    } catch (_e) {
      stepsHistory = [];
    }

    const sections = [
      {
        title: 'Operation Information',
        fields: [
          {label: 'Operation ID', value: operation.operation_id},
          {label: 'Type', value: operation.type},
          {label: 'Status', value: operation.status},
          {label: 'Workflow Step', value: operation.workflow_step},
        ],
      },
      {
        title: 'Target Information',
        fields: [
          {label: 'Partition ID', value: operation.partition_id},
          {label: 'Replica ID', value: operation.replica_id || 'N/A'},
          {label: 'Source Node', value: operation.source_node_id},
          {label: 'Target Node', value: operation.target_node_id},
        ],
      },
      {
        title: 'Timestamps',
        fields: [
          {label: 'Created At', value: this.formatTimestamp(operation.created_at)},
          {label: 'Updated At', value: this.formatTimestamp(operation.updated_at)},
          {label: 'Completed At', value: this.formatTimestamp(operation.completed_at)},
        ],
      },
    ];

    // Add error section if there's an error
    if (operation.error_message) {
      sections.push({
        title: 'Error',
        fields: [
          {label: 'Error Message', value: operation.error_message},
        ],
      });
    }

    // Add workflow history section
    if (stepsHistory.length > 0) {
      const historyFields = stepsHistory.map((step, index) => ({
        label: `Step ${index + 1}`,
        value: `${step.step} at ${this.formatTimestamp(step.timestamp)}`,
      }));

      sections.push({
        title: 'Workflow History',
        fields: historyFields,
      });
    }

    // Build navigation links
    const navigationLinks = [
      {label: 'View Partition', target: 'partitions', key: 'p'},
    ];

    return {
      title: `Operation: ${this.truncateId(operation.operation_id)}`,
      sections,
      relatedCounts: {},
      navigationLinks,
    };
  }

  /**
   * Get in-flight operations count
   * @return {number} Count of in-flight operations
   */
  getInFlightCount() {
    return this.data.filter((op) => this.isInProgress(op)).length;
  }

  /**
   * Get completed operations count
   * @return {number} Count of completed operations
   */
  getCompletedCount() {
    return this.data.filter((op) =>
      op.status === OPERATION_STATUS.ACTIVE ||
      op.status === OPERATION_STATUS.REMOVED,
    ).length;
  }

  /**
   * Get failed operations count
   * @return {number} Count of failed operations
   */
  getFailedCount() {
    return this.data.filter((op) => op.status === OPERATION_STATUS.FAILED).length;
  }
}
