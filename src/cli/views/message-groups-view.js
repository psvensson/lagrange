/**
 * MessageGroupsView - Displays message group distribution and health
 *
 * Columns: group_id, replica_count, nodes_covered, status
 * Supports highlighting unhealthy replicas and drill-down to replica locations.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

/**
 * MessageGroupsView displays message group distribution and health
 */
export class MessageGroupsView extends BaseView {
  /**
   * Creates a new MessageGroupsView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    super(options);
    this.cache = options.cache || null;
    this.viewName = 'message_groups';
  }

  /**
   * Get column definitions for the message groups view
   * Requirements: 6.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: 'group_id', label: 'Group ID', width: 20},
      {key: 'replica_count', label: 'Replicas', width: 10},
      {key: 'nodes_covered', label: 'Nodes Covered', width: 30},
      {key: 'status', label: 'Status', width: 12},
    ];
  }

  /**
   * Format a message group record into a row array
   * Requirements: 6.1, 6.3
   * @param {Object} messageGroup - Message group record
   * @return {Array<string>} Row values
   */
  formatRow(messageGroup) {
    return [
      messageGroup.group_id || 'N/A',
      this.formatReplicaCount(messageGroup.replica_count),
      this.formatNodesCovered(messageGroup.nodes_covered),
      messageGroup.status || 'unknown',
    ];
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
   * Format nodes covered for display
   * Requirements: 6.3
   * @param {Array<string>|string|null|undefined} nodes - Nodes covered
   * @return {string} Formatted nodes list
   */
  formatNodesCovered(nodes) {
    if (!nodes) {
      return 'N/A';
    }
    if (Array.isArray(nodes)) {
      if (nodes.length === 0) {
        return 'None';
      }
      return nodes.join(', ');
    }
    return String(nodes);
  }

  /**
   * Get the row status for styling
   * Requirements: 6.4
   * @param {Object} messageGroup - Message group record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(messageGroup) {
    // Failed or error status
    if (messageGroup.status === 'failed' || messageGroup.status === 'error') {
      return ROW_STATUS.ERROR;
    }

    // Check for unhealthy replicas
    if (this.hasUnhealthyReplicas(messageGroup)) {
      return ROW_STATUS.WARNING;
    }

    // Degraded status is a warning
    if (messageGroup.status === 'degraded') {
      return ROW_STATUS.WARNING;
    }

    return ROW_STATUS.NORMAL;
  }

  /**
   * Check if a message group has unhealthy replicas
   * Requirements: 6.4
   * @param {Object} messageGroup - Message group record
   * @return {boolean} True if has unhealthy replicas
   */
  hasUnhealthyReplicas(messageGroup) {
    // Check unhealthy_replica_count if available
    if (messageGroup.unhealthy_replica_count !== undefined &&
        messageGroup.unhealthy_replica_count !== null) {
      return messageGroup.unhealthy_replica_count > 0;
    }

    // Check replica_statuses array if available
    if (Array.isArray(messageGroup.replica_statuses)) {
      return messageGroup.replica_statuses.some(
        (status) => status !== 'healthy' && status !== 'active');
    }

    return false;
  }

  /**
   * Get the unique key for a message group
   * @param {Object} messageGroup - Message group record
   * @return {string} Unique key (group_id)
   */
  getItemKey(messageGroup) {
    return messageGroup.group_id || '';
  }

  /**
   * Handle drill-down action (Enter key on selected message group)
   * Requirements: 6.2, 6.5
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    const selectedGroup = this.getSelectedItem();
    if (!selectedGroup) {
      return null;
    }

    return {
      action: 'drillDown',
      view: 'replicas',
      context: {
        groupId: selectedGroup.group_id,
        entityType: 'message_group',
      },
    };
  }

  /**
   * Navigate to a hosting node
   * Requirements: 6.5
   * @param {number} nodeIndex - Index of node in nodes_covered array
   * @return {Object|null} Navigation action or null
   */
  navigateToNode(nodeIndex = 0) {
    const selectedGroup = this.getSelectedItem();
    if (!selectedGroup) {
      return null;
    }

    const nodes = selectedGroup.nodes_covered;
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return null;
    }

    const targetIndex = Math.min(nodeIndex, nodes.length - 1);
    const nodeId = nodes[targetIndex];

    return {
      action: 'jumpToEntity',
      entityType: 'node',
      entityId: nodeId,
    };
  }

  /**
   * Handle key input for the message groups view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (key.name === 'enter' || key.name === 'return') {
      return this.handleDrillDown();
    }
    if (key.name === 'n' || key.name === 'N') {
      return this.navigateToNode(0);
    }
    return super.handleKey(key);
  }

  /**
   * Get detail information for the selected message group
   * Requirements: 6.2
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    const group = this.getSelectedItem();
    if (!group) {
      return null;
    }

    const sections = [
      {
        title: 'Basic Information',
        fields: [
          {label: 'Group ID', value: group.group_id},
          {label: 'Status', value: group.status || 'unknown'},
        ],
      },
      {
        title: 'Replication',
        fields: [
          {label: 'Replica Count', value: this.formatReplicaCount(
            group.replica_count)},
          {label: 'Nodes Covered', value: this.formatNodesCovered(
            group.nodes_covered)},
          {label: 'Has Unhealthy Replicas', value: this.hasUnhealthyReplicas(
            group) ? 'Yes' : 'No'},
        ],
      },
    ];

    // Add leader info if available
    if (group.leader_node_id) {
      sections[0].fields.push(
        {label: 'Leader Node', value: group.leader_node_id});
    }

    // Add Raft state if available
    if (group.raft_term !== undefined || group.raft_index !== undefined) {
      sections.push({
        title: 'Raft State',
        fields: [
          {label: 'Term', value: String(group.raft_term || 0)},
          {label: 'Index', value: String(group.raft_index || 0)},
        ],
      });
    }

    return {
      title: `Message Group: ${group.group_id}`,
      sections,
    };
  }
}
