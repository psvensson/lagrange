const LOCAL_STR_CACHE_UPDATE = 'cache:update';
const LOCAL_STR_NAVIGATION = 'navigation:*';
const LOCAL_STR_1EO2G = 'viewManager:viewRegistered';
const LOCAL_STR_21V4A = 'viewManager:viewUnregistered';
const LOCAL_STR_6YESZ = 'viewManager:viewSwitched';
const LOCAL_STR_39DJ7 = 'viewManager:refresh';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_2000 = 2000;
const LOCAL_STR_1264G = 'viewManager:cdcUpdate';
const LOCAL_STR_C61VD = 'viewManager:destroyed';

/**
 * ViewManager - Coordinates view rendering and updates
 *
 * Manages view registration, switching, and CDC update notifications.
 *
 * Requirements: 12.3, 12.4
 */

/**
 * ViewManager class for view coordination
 */
export class ViewManager {
  /**
   * Creates a new ViewManager
   * @param {Object} options - Manager options
   * @param {import('./navigation-controller.js').NavigationController} [options.navigation] -
   *   Navigation controller
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {Object} [options.screen] - Blessed screen instance
   */
  constructor(options = {}) {
    this.navigation = options.navigation || null;
    this.eventBus = options.eventBus || null;
    this.screen = options.screen || null;

    /** @type {Map<string, import('./base-view.js').BaseView>} */
    this.views = new Map();
    this.currentViewName = null;
    this.currentView = null;

    // Track changed rows for highlighting
    this.changedRows = new Map(); // viewName -> Set of keys

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for CDC updates
   */
  setupEventListeners() {
    if (this.eventBus) {
      // Listen for CDC updates
      this.eventBus.on(LOCAL_STR_CACHE_UPDATE, (data) => {
        this.handleCDCUpdate(data);
      });

      // Listen for navigation changes
      this.eventBus.on(LOCAL_STR_NAVIGATION, () => {
        this.refresh();
      });
    }
  }

  /**
   * Register a view with the manager
   * @param {string} name - View name
   * @param {import('./base-view.js').BaseView} view - View instance
   */
  registerView(name, view) {
    this.views.set(name, view);

    // Initialize changed rows tracking
    if (!this.changedRows.has(name)) {
      this.changedRows.set(name, new Set());
    }

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_1EO2G, {name, view});
    }
  }

  /**
   * Unregister a view
   * @param {string} name - View name
   */
  unregisterView(name) {
    const view = this.views.get(name);
    if (view) {
      view.hide();
      this.views.delete(name);
      this.changedRows.delete(name);

      if (this.currentViewName === name) {
        this.currentViewName = null;
        this.currentView = null;
      }

      if (this.eventBus) {
        this.eventBus.emit(LOCAL_STR_21V4A, {name});
      }
    }
  }

  /**
   * Get a registered view by name
   * @param {string} name - View name
   * @return {import('./base-view.js').BaseView|undefined}
   */
  getView(name) {
    return this.views.get(name);
  }

  /**
   * Get all registered view names
   * @return {string[]}
   */
  getViewNames() {
    return Array.from(this.views.keys());
  }

  /**
   * Switch to a different view
   * @param {string} viewName - Name of view to switch to
   * @return {boolean} True if switch was successful
   */
  switchView(viewName) {
    const newView = this.views.get(viewName);
    if (!newView) {
      return false;
    }

    // Hide current view
    if (this.currentView) {
      this.currentView.hide();
    }

    // Show new view
    this.currentViewName = viewName;
    this.currentView = newView;
    this.currentView.show();

    // Refresh with current data
    this.refresh();

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_6YESZ, {
        viewName,
        view: newView,
      });
    }

    return true;
  }

  /**
   * Get the current view name
   * @return {string|null}
   */
  getCurrentViewName() {
    return this.currentViewName;
  }

  /**
   * Get the current view instance
   * @return {import('./base-view.js').BaseView|null}
   */
  getCurrentView() {
    return this.currentView;
  }

  /**
   * Refresh the current view with latest data
   */
  refresh() {
    if (!this.currentView) {
      return;
    }

    // Get data from navigation controller if available
    let data = [];
    let state = {};

    if (this.navigation) {
      data = this.navigation.getViewData();
      state = this.navigation.getCurrentState();
    }

    // Apply changed row highlighting
    const changedKeys = this.changedRows.get(this.currentViewName);
    if (changedKeys) {
      for (const key of changedKeys) {
        this.currentView.markChanged(key);
      }
    }

    // Update view data and render
    this.currentView.setData(data);
    const renderData = this.currentView.render(state);

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_39DJ7, {
        viewName: this.currentViewName,
        renderData,
      });
    }

    // Render screen if available
    if (this.screen && typeof this.screen.render === LOCAL_STR_FUNCTION) {
      this.screen.render();
    }
  }

  /**
   * Handle CDC update event
   * Requirements: 12.3, 12.4
   * @param {Object} change - CDC change event
   */
  handleCDCUpdate(change) {
    const {table, key, operation} = change;

    // Map table names to affected view names.
    const tableViewMap = {
      'nodes': ['nodes', 'replicas', 'services'],
      'services': ['replicas'],
      'service_definitions': ['services'],
      'service_endpoints': ['services', 'replicas'],
      'tables': ['tables'],
      'partitions': ['partitions'],
      'message_groups': ['message_groups'],
      'logs': ['logs'],
      'config': ['config'],
      'contexts': ['contexts'],
      'replica_operations': ['operations'],
    };

    const affectedViews = tableViewMap[table];
    if (!affectedViews || affectedViews.length === LOCAL_NUM_ZERO) {
      return;
    }

    for (const viewName of affectedViews) {
      // Track changed row for highlighting.
      if (!this.changedRows.has(viewName)) {
        this.changedRows.set(viewName, new Set());
      }
      this.changedRows.get(viewName).add(key);

      // Refresh if this affects the current view.
      if (this.currentViewName === viewName) {
        this.refresh();

        // Clear highlight after delay.
        setTimeout(() => {
          this.clearChangedRow(viewName, key);
        }, LOCAL_NUM_2000);
      }
    }

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_1264G, {
        table,
        key,
        operation,
        viewNames: affectedViews,
        isCurrentView: affectedViews.includes(this.currentViewName),
      });
    }
  }

  /**
   * Clear a changed row highlight
   * @param {string} viewName - View name
   * @param {string} key - Row key
   */
  clearChangedRow(viewName, key) {
    const changedKeys = this.changedRows.get(viewName);
    if (changedKeys) {
      changedKeys.delete(key);
    }

    const view = this.views.get(viewName);
    if (view) {
      view.clearChanged(key);
    }

    // Refresh if this is the current view
    if (this.currentViewName === viewName) {
      this.refresh();
    }
  }

  /**
   * Clear all changed row highlights for a view
   * @param {string} [viewName] - View name, or all views if not provided
   */
  clearAllChangedRows(viewName) {
    if (viewName) {
      const changedKeys = this.changedRows.get(viewName);
      if (changedKeys) {
        changedKeys.clear();
      }
      const view = this.views.get(viewName);
      if (view) {
        view.clearChanged();
      }
    } else {
      for (const [name, keys] of this.changedRows) {
        keys.clear();
        const view = this.views.get(name);
        if (view) {
          view.clearChanged();
        }
      }
    }
  }

  /**
   * Check if a change is relevant to the current view
   * @param {Object} change - CDC change event
   * @return {boolean}
   */
  isChangeRelevant(change) {
    const tableViewMap = {
      'nodes': ['nodes', 'replicas', 'services'],
      'services': ['replicas'],
      'service_definitions': ['services'],
      'service_endpoints': ['services', 'replicas'],
      'tables': ['tables'],
      'partitions': ['partitions'],
      'message_groups': ['message_groups'],
      'logs': ['logs'],
      'config': ['config'],
      'contexts': ['contexts'],
      'replica_operations': ['operations'],
    };

    const viewNames = tableViewMap[change.table] || [];
    return viewNames.includes(this.currentViewName);
  }

  /**
   * Get the number of registered views
   * @return {number}
   */
  getViewCount() {
    return this.views.size;
  }

  /**
   * Check if a view is registered
   * @param {string} name - View name
   * @return {boolean}
   */
  hasView(name) {
    return this.views.has(name);
  }

  /**
   * Destroy the view manager and cleanup
   */
  destroy() {
    // Hide and cleanup all views
    for (const [_name, view] of this.views) {
      view.hide();
    }

    this.views.clear();
    this.changedRows.clear();
    this.currentView = null;
    this.currentViewName = null;

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_C61VD, {});
    }
  }
}
