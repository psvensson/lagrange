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

    switch (view) {
    case 'nodes':
      return context.nodeId ? `Node: ${context.nodeId}` : 'Nodes';
    case 'services':
      if (context.nodeId) {
        return `Services (${context.nodeId})`;
      }
      if (context.serviceId) {
        return `Service: ${context.serviceId}`;
      }
      return 'Services';
    case 'tables':
      return context.tableName ?
        `Table: ${context.tableName}` :
        (context.tableId ? `Table: ${context.tableId}` : 'Tables');
    case 'partitions':
      if (context.partitionId) {
        return `Partition: ${context.partitionId}`;
      }
      if (context.tableId || context.tableName) {
        return `Partitions (${context.tableName || context.tableId})`;
      }
      return 'Partitions';
    case 'message_groups':
      return context.groupId ?
        `MG: ${context.groupId}` :
        'Message Groups';
    case 'replicas':
      if (context.serviceId) {
        return `Replicas (${context.serviceId})`;
      }
      if (context.nodeId) {
        return `Replicas (${context.nodeId})`;
      }
      if (context.groupId) {
        return `Replicas (${context.groupId})`;
      }
      return context.partitionId ?
        `Replicas (${context.partitionId})` :
        'Replicas';
    case 'operations':
      return context.operationId ?
        `Operation: ${context.operationId.substring(0, 8)}...` :
        'Operations';
    case 'sql':
      return 'SQL Query';
    case 'logs':
      return 'Logs';
    case 'config':
      return 'Config';
    case 'contexts':
      return 'Contexts';
    default:
      return this.formatViewName(view);
    }
  }

  /**
   * Format view name for display
   * @param {string} view - View name
   * @return {string} Formatted view name
   */
  formatViewName(view) {
    const names = {
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
    };
    return names[view] || view;
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
