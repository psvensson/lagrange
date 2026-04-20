/**
 * NavigationController - Manages hierarchical navigation state and breadcrumbs
 *
 * Supports navigation paths:
 * - nodes → replicas → partition/message_group details
 * - services → replicas
 * - tables → partitions → replicas → nodes
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

/**
 * Valid view names for navigation
 */
const VALID_VIEWS = [
  'nodes',
  'services',
  'tables',
  'partitions',
  'message_groups',
  'sql',
  'logs',
  'config',
  'contexts',
  'replicas',
  'operations',
];

const VIEW_DISPLAY_NAME = Object.freeze({
  'nodes': 'Nodes',
  'services': 'Services',
  'tables': 'Tables',
  'partitions': 'Partitions',
  'message_groups': 'Message Groups',
  'sql': 'SQL Query',
  'logs': 'Logs',
  'config': 'Config',
  'contexts': 'Contexts',
  'replicas': 'Replicas',
  'operations': 'Operations',
});

function formatNodeBreadcrumb(context = {}) {
  return context.nodeId ? `Node: ${context.nodeId}` : VIEW_DISPLAY_NAME.nodes;
}

function formatServicesBreadcrumb(context = {}) {
  if (context.nodeId) {
    return `Services (${context.nodeId})`;
  }
  if (context.serviceId) {
    return `Service: ${context.serviceId}`;
  }
  return VIEW_DISPLAY_NAME.services;
}

function formatTablesBreadcrumb(context = {}) {
  if (context.tableName) {
    return `Table: ${context.tableName}`;
  }
  if (context.tableId) {
    return `Table: ${context.tableId}`;
  }
  return VIEW_DISPLAY_NAME.tables;
}

function formatPartitionsBreadcrumb(context = {}) {
  if (context.partitionId) {
    return `Partition: ${context.partitionId}`;
  }
  if (context.tableId || context.tableName) {
    return `Partitions (${context.tableName || context.tableId})`;
  }
  return VIEW_DISPLAY_NAME.partitions;
}

function formatReplicasBreadcrumb(context = {}) {
  const replicaOwnerId =
    context.serviceId ||
    context.nodeId ||
    context.groupId ||
    context.partitionId;
  return replicaOwnerId ?
    `Replicas (${replicaOwnerId})` :
    VIEW_DISPLAY_NAME.replicas;
}

function formatOperationsBreadcrumb(context = {}) {
  return context.operationId ?
    `Operation: ${context.operationId.substring(0, 8)}...` :
    VIEW_DISPLAY_NAME.operations;
}

const BREADCRUMB_FORMATTER = Object.freeze({
  'message_groups': (context = {}) => {
    return context.groupId ?
      `MG: ${context.groupId}` :
      VIEW_DISPLAY_NAME.message_groups;
  },
  'nodes': formatNodeBreadcrumb,
  'operations': formatOperationsBreadcrumb,
  'partitions': formatPartitionsBreadcrumb,
  'replicas': formatReplicasBreadcrumb,
  'services': formatServicesBreadcrumb,
  'tables': formatTablesBreadcrumb,
});

/**
 * NavigationController class for hierarchical navigation
 */
export class NavigationController {
  /**
   * Creates a new NavigationController
   * @param {import('./remote-cache.js').RemoteCache} cache - Remote cache instance
   * @param {import('./event-bus.js').EventBus} [eventBus] - Optional event bus
   */
  constructor(cache, eventBus = null) {
    this.cache = cache;
    this.eventBus = eventBus;
    this.stack = [];
    this.currentView = 'nodes';
    this.currentContext = null;
  }

  /**
   * Get the current navigation state
   * @return {Object} Current state with view, context, and breadcrumb
   */
  getCurrentState() {
    return {
      view: this.currentView,
      context: this.currentContext,
      breadcrumb: this.getBreadcrumb(),
      stackDepth: this.stack.length,
    };
  }

  /**
   * Generate breadcrumb string from navigation stack
   * Requirements: 11.3
   * @return {string} Breadcrumb path string
   */
  getBreadcrumb() {
    const parts = ['Home'];

    for (const item of this.stack) {
      parts.push(this.formatBreadcrumbItem(item));
    }

    // Add current view if not at home
    if (this.currentView !== 'nodes' || this.currentContext) {
      parts.push(this.formatBreadcrumbItem({
        view: this.currentView,
        context: this.currentContext,
      }));
    }

    return parts.join(' > ');
  }

  /**
   * Format a single breadcrumb item
   * @param {Object} item - Navigation item with view and context
   * @return {string} Formatted breadcrumb string
   */
  formatBreadcrumbItem(item) {
    const {view, context} = item;

    if (!context) {
      return this.formatViewName(view);
    }

    const formatter = BREADCRUMB_FORMATTER[view];
    return formatter ? formatter(context) : this.formatViewName(view);
  }

  /**
   * Format view name for display
   * @param {string} view - View name
   * @return {string} Formatted view name
   */
  formatViewName(view) {
    return VIEW_DISPLAY_NAME[view] || view;
  }

  /**
   * Drill down to a child view with context
   * Requirements: 11.1, 11.2
   * @param {string} view - Target view name
   * @param {Object} context - Navigation context
   */
  drillDown(view, context) {
    if (!VALID_VIEWS.includes(view)) {
      throw new Error(`Invalid view: ${view}`);
    }

    // Push current state to stack
    this.stack.push({
      view: this.currentView,
      context: this.currentContext,
    });

    this.currentView = view;
    this.currentContext = context;

    this.emitNavigationEvent('drillDown', {view, context});
  }

  /**
   * Navigate back one level in the hierarchy
   * Requirements: 11.4
   * @return {boolean} True if navigation occurred, false if at root
   */
  goBack() {
    if (this.stack.length === 0) {
      return false;
    }

    const prev = this.stack.pop();
    const oldView = this.currentView;
    const oldContext = this.currentContext;

    this.currentView = prev.view;
    this.currentContext = prev.context;

    this.emitNavigationEvent('goBack', {
      from: {view: oldView, context: oldContext},
      to: {view: this.currentView, context: this.currentContext},
    });

    return true;
  }

  /**
   * Navigate directly to a view, clearing the stack
   * @param {string} view - Target view name
   */
  goToView(view) {
    if (!VALID_VIEWS.includes(view)) {
      throw new Error(`Invalid view: ${view}`);
    }

    const oldView = this.currentView;
    const oldContext = this.currentContext;

    this.stack = [];
    this.currentView = view;
    this.currentContext = null;

    this.emitNavigationEvent('goToView', {
      from: {view: oldView, context: oldContext},
      to: {view, context: null},
    });
  }

  /**
   * Jump directly to a specific entity
   * Requirements: 11.5
   * @param {string} entityType - Entity type (node, table, partition, etc.)
   * @param {string} entityId - Entity ID
   */
  jumpToEntity(entityType, entityId) {
    const viewMap = {
      'node': 'nodes',
      'service': 'services',
      'table': 'tables',
      'partition': 'partitions',
      'message_group': 'message_groups',
      'replica': 'replicas',
    };

    const view = viewMap[entityType];
    if (!view) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }

    const contextKey = `${entityType}Id`;
    const context = {[contextKey]: entityId};

    // Clear stack and navigate directly
    this.stack = [];
    this.currentView = view;
    this.currentContext = context;

    this.emitNavigationEvent('jumpToEntity', {
      entityType,
      entityId,
      view,
      context,
    });
  }

  /**
   * Get data for the current view from cache
   * @return {Array} View data
   */
  getViewData() {
    switch (this.currentView) {
    case 'nodes':
      return this.cache.getNodes();
    case 'services':
      return this.cache.getLogicalServices(this.currentContext || {});
    case 'replicas':
      return this.cache.getServices(this.currentContext || {});
    case 'tables':
      return this.cache.getTables();
    case 'partitions':
      return this.cache.getPartitions(this.currentContext || {});
    case 'message_groups':
      return this.cache.getMessageGroups();
    case 'logs':
      return this.cache.getLogs(this.currentContext || {});
    case 'config':
      return this.cache.getConfig();
    case 'contexts':
      return this.cache.getContexts(this.currentContext || {});
    case 'operations':
      return this.cache.getOperations(this.currentContext || {});
    default:
      return [];
    }
  }

  /**
   * Get counts of related child entities
   * Requirements: 11.6
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @return {Object} Counts of related entities
   */
  getRelatedCounts(entityType, entityId) {
    switch (entityType) {
    case 'node':
      return {
        services: this.cache.getLogicalServices({nodeId: entityId}).length,
        replicas: this.cache.getServices({nodeId: entityId}).length,
      };
    case 'table':
      return {
        partitions: this.cache.getPartitions({tableId: entityId}).length,
      };
    case 'partition': {
      const partition = this.cache.getPartition(entityId);
      return {
        replicas: partition ? (partition.replica_count || 0) : 0,
      };
    }
    case 'message_group': {
      const group = this.cache.getMessageGroup(entityId);
      return {
        replicas: group ? (group.replica_count || 0) : 0,
      };
    }
    default:
      return {};
    }
  }

  /**
   * Check if we can navigate back
   * @return {boolean} True if back navigation is possible
   */
  canGoBack() {
    return this.stack.length > 0;
  }

  /**
   * Get the navigation stack depth
   * @return {number} Stack depth
   */
  getStackDepth() {
    return this.stack.length;
  }

  /**
   * Reset navigation to initial state
   */
  reset() {
    this.stack = [];
    this.currentView = 'nodes';
    this.currentContext = null;

    this.emitNavigationEvent('reset', {});
  }

  /**
   * Emit a navigation event via the event bus
   * @param {string} action - Navigation action
   * @param {Object} data - Event data
   */
  emitNavigationEvent(action, data) {
    if (this.eventBus) {
      this.eventBus.emit('navigation:' + action, {
        ...data,
        state: this.getCurrentState(),
      });
    }
  }
}
