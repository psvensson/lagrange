/**
 * OperationsView - Displays replica operations with workflow steps
 *
 * Columns: operation_id, type, partition_id, target_node, status, workflow_step, updated_at
 * Supports filtering by status and viewing operation history.
 *
 * Requirements: 4.4, 9.3
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

const LOCAL_STR_PENDING = 'pending';
const LOCAL_STR_CREATING = 'creating';
const LOCAL_STR_SYNCING = 'syncing';
const LOCAL_STR_ACTIVE = 'active';
const LOCAL_STR_REMOVING = 'removing';
const LOCAL_STR_REMOVED = 'removed';
const LOCAL_STR_FAILED = 'failed';
const LOCAL_STR_PENDING_2 = 'PENDING';
const LOCAL_STR_SENDING = 'SENDING';
const LOCAL_STR_CREATING_2 = 'CREATING';
const LOCAL_STR_SYNCING_2 = 'SYNCING';
const LOCAL_STR_ACTIVE_2 = 'ACTIVE';
const LOCAL_STR_STOPPING = 'STOPPING';
const LOCAL_STR_REMOVED_2 = 'REMOVED';
const LOCAL_STR_OPERATIONS = 'operations';
const LOCAL_STR_OPERATION_ID = 'operation_id';
const LOCAL_STR_OPERATION_ID_2 = 'Operation ID';
const LOCAL_NUM_TWELVE = 12;
const LOCAL_STR_TYPE = 'type';
const LOCAL_STR_TYPE_2 = 'Type';
const LOCAL_NUM_EIGHT = 8;
const LOCAL_STR_PARTITION_ID = 'partition_id';
const LOCAL_STR_PARTITION = 'Partition';
const LOCAL_NUM_FIFTEEN = 15;
const LOCAL_STR_TARGET_NODE_ID = 'target_node_id';
const LOCAL_STR_TARGET_NODE = 'Target Node';
const LOCAL_STR_STATUS = 'status';
const LOCAL_STR_STATUS_2 = 'Status';
const LOCAL_NUM_TEN = 10;
const LOCAL_STR_WORKFLOW_STEP = 'workflow_step';
const LOCAL_STR_STEP = 'Step';
const LOCAL_STR_UPDATED_AT = 'updated_at';
const LOCAL_STR_UPDATED = 'Updated';
const LOCAL_NUM_TWENTY = 20;
const LOCAL_STR_N_A = 'N/A';
const LOCAL_STR_UNKNOWN = 'unknown';
const LOCAL_STR_DOT_DOT_DOT = '...';
const LOCAL_STR_T = 'T';
const LOCAL_STR_SPACE = ' ';
const LOCAL_NUM_NINETEEN = 19;
const LOCAL_STR_ENTER = 'enter';
const LOCAL_STR_RETURN = 'return';
const LOCAL_STR_DRILLDOWN = 'drillDown';
const LOCAL_STR_PARTITIONS = 'partitions';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_ERROR = 'Error';
const LOCAL_STR_ERROR_MESSAGE = 'Error Message';
const LOCAL_STR_WORKFLOW_HISTORY = 'Workflow History';

/**
 * Operation status types for styling
 */
export const OPERATION_STATUS = {
  PENDING: LOCAL_STR_PENDING,
  CREATING: LOCAL_STR_CREATING,
  SYNCING: LOCAL_STR_SYNCING,
  ACTIVE: LOCAL_STR_ACTIVE,
  REMOVING: LOCAL_STR_REMOVING,
  REMOVED: LOCAL_STR_REMOVED,
  FAILED: LOCAL_STR_FAILED,
};

/**
 * Workflow steps for ADD operations
 */
export const ADD_WORKFLOW_STEPS = [
  LOCAL_STR_PENDING_2, LOCAL_STR_SENDING, LOCAL_STR_CREATING_2, LOCAL_STR_SYNCING_2,
  LOCAL_STR_ACTIVE_2,
];

/**
 * Workflow steps for REMOVE operations
 */
export const REMOVE_WORKFLOW_STEPS = [
  LOCAL_STR_PENDING_2, LOCAL_STR_SENDING, LOCAL_STR_STOPPING, LOCAL_STR_REMOVED_2,
];

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
    this.viewName = LOCAL_STR_OPERATIONS;
  }

  /**
   * Get column definitions for the operations view
   * Requirements: 4.4
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: LOCAL_STR_OPERATION_ID, label: LOCAL_STR_OPERATION_ID_2, width: LOCAL_NUM_TWELVE},
      {key: LOCAL_STR_TYPE, label: LOCAL_STR_TYPE_2, width: LOCAL_NUM_EIGHT},
      {key: LOCAL_STR_PARTITION_ID, label: LOCAL_STR_PARTITION, width: LOCAL_NUM_FIFTEEN},
      {key: LOCAL_STR_TARGET_NODE_ID, label: LOCAL_STR_TARGET_NODE, width: LOCAL_NUM_FIFTEEN},
      {key: LOCAL_STR_STATUS, label: LOCAL_STR_STATUS_2, width: LOCAL_NUM_TEN},
      {key: LOCAL_STR_WORKFLOW_STEP, label: LOCAL_STR_STEP, width: LOCAL_NUM_TEN},
      {key: LOCAL_STR_UPDATED_AT, label: LOCAL_STR_UPDATED, width: LOCAL_NUM_TWENTY},
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
      operation.type || LOCAL_STR_N_A,
      this.truncateId(operation.partition_id),
      this.truncateId(operation.target_node_id),
      operation.status || LOCAL_STR_UNKNOWN,
      operation.workflow_step || LOCAL_STR_N_A,
      this.formatTimestamp(operation.updated_at),
    ];
  }

  /**
   * Truncate a UUID for display
   * @param {string|null|undefined} id - UUID to truncate
   * @return {string} Truncated ID
   */
  truncateId(id) {
    if (!id) return LOCAL_STR_N_A;
    if (id.length <= LOCAL_NUM_TWELVE) return id;
    return id.substring(0, LOCAL_NUM_EIGHT) + LOCAL_STR_DOT_DOT_DOT;
  }

  /**
   * Format a timestamp for display
   * @param {number|null|undefined} timestamp - Unix timestamp in milliseconds
   * @return {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (!timestamp) return LOCAL_STR_N_A;
    const date = new Date(timestamp);
    return date.toISOString().replace(LOCAL_STR_T, LOCAL_STR_SPACE)
      .substring(0, LOCAL_NUM_NINETEEN);
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
    if (key.name === LOCAL_STR_ENTER || key.name === LOCAL_STR_RETURN) {
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
      action: LOCAL_STR_DRILLDOWN,
      view: LOCAL_STR_PARTITIONS,
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
      if (typeof operation.steps_history === LOCAL_STR_STRING) {
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
        title: LOCAL_STR_ERROR,
        fields: [
          {label: LOCAL_STR_ERROR_MESSAGE, value: operation.error_message},
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
        title: LOCAL_STR_WORKFLOW_HISTORY,
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
