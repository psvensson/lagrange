/**
 * ViewDetailCoordinator - Automatic coordination between views and detail panels
 *
 * Wires selection events to detail panel updates and manages detail panel
 * visibility and layout.
 *
 * Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7
 */

/**
 * Detail panel layout types
 */
export const DETAIL_LAYOUT = {
  SIDE: 'side',
  BOTTOM: 'bottom',
  OVERLAY: 'overlay',
};

/**
 * ViewDetailCoordinator class for view-detail panel coordination
 */
export class ViewDetailCoordinator {
  /**
   * Creates a new ViewDetailCoordinator
   * @param {Object} options - Coordinator options
   * @param {import('./view-manager.js').ViewManager} [options.viewManager] - View manager
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    this.viewManager = options.viewManager || null;
    this.eventBus = options.eventBus || null;

    // View configurations
    /** @type {Map<string, ViewConfig>} */
    this.viewConfigs = new Map();

    // Detail panel state
    this.detailPanelVisible = false;
    this.currentLayout = DETAIL_LAYOUT.SIDE;
    this.currentDetailData = null;
    this.preserveDetailOnSwitch = false;

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * @typedef {Object} ViewConfig
   * @property {boolean} hasDetails - Whether view has detail panel
   * @property {string} layout - Detail panel layout
   * @property {Function} [getDetailData] - Function to get detail data from item
   * @property {boolean} [preserveOnSwitch] - Preserve detail when switching views
   */

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (this.eventBus) {
      // Listen for view switches
      this.eventBus.on('viewManager:viewSwitched', (data) => {
        this.handleViewSwitch(data);
      });

      // Listen for selection changes
      this.eventBus.on('view:selectionChanged', (data) => {
        this.handleSelectionChange(data);
      });

      // Listen for view refresh
      this.eventBus.on('viewManager:refresh', (data) => {
        this.handleViewRefresh(data);
      });
    }
  }

  /**
   * Register a view with the coordinator
   * Requirements: 23.2
   * @param {string} viewName - View name
   * @param {ViewConfig} config - View configuration
   */
  registerView(viewName, config = {}) {
    const defaultConfig = {
      hasDetails: true,
      layout: DETAIL_LAYOUT.SIDE,
      getDetailData: null,
      preserveOnSwitch: false,
    };

    this.viewConfigs.set(viewName, {...defaultConfig, ...config});

    if (this.eventBus) {
      this.eventBus.emit('detailCoordinator:viewRegistered', {
        viewName,
        config: this.viewConfigs.get(viewName),
      });
    }
  }

  /**
   * Unregister a view
   * @param {string} viewName - View name
   */
  unregisterView(viewName) {
    this.viewConfigs.delete(viewName);

    if (this.eventBus) {
      this.eventBus.emit('detailCoordinator:viewUnregistered', {viewName});
    }
  }

  /**
   * Get configuration for a view
   * @param {string} viewName - View name
   * @return {ViewConfig|undefined}
   */
  getViewConfig(viewName) {
    return this.viewConfigs.get(viewName);
  }

  /**
   * Handle view switch event
   * Requirements: 23.6
   * @param {Object} data - Event data
   */
  handleViewSwitch(data) {
    const {viewName} = data;
    const config = this.viewConfigs.get(viewName);

    if (!config) {
      // No config for this view, hide detail panel
      this.hideDetailPanel();
      return;
    }

    // Update layout based on view config
    this.currentLayout = config.layout;

    // Handle detail preservation
    if (!config.preserveOnSwitch && !this.preserveDetailOnSwitch) {
      this.clearDetailData();
    }

    // Update detail panel visibility based on view config
    if (!config.hasDetails) {
      this.hideDetailPanel();
    }

    if (this.eventBus) {
      this.eventBus.emit('detailCoordinator:viewSwitched', {
        viewName,
        layout: this.currentLayout,
        detailVisible: this.detailPanelVisible,
      });
    }
  }

  /**
   * Handle selection change event
   * Requirements: 23.3
   * @param {Object} data - Event data with view and selectedItem
   */
  handleSelectionChange(data) {
    const {viewName, selectedItem} = data;
    const config = this.viewConfigs.get(viewName);

    if (!config || !config.hasDetails) {
      return;
    }

    // Handle empty selection
    if (!selectedItem) {
      this.clearDetailData();
      return;
    }

    // Get detail data using config function or default
    let detailData;
    if (config.getDetailData) {
      detailData = config.getDetailData(selectedItem);
    } else {
      detailData = this.getDefaultDetailData(selectedItem);
    }

    this.updateDetailPanel(detailData);
  }

  /**
   * Handle view refresh event
   * @param {Object} data - Event data
   */
  handleViewRefresh(data) {
    const {viewName} = data;

    // If current view has a selected item, update detail panel
    if (this.viewManager) {
      const view = this.viewManager.getView(viewName);
      if (view) {
        const selectedItem = view.getSelectedItem();
        if (selectedItem) {
          this.handleSelectionChange({viewName, selectedItem});
        }
      }
    }
  }

  /**
   * Get default detail data from an item
   * @param {Object} item - Selected item
   * @return {Object} Detail data
   */
  getDefaultDetailData(item) {
    return {
      type: 'default',
      item,
      fields: Object.entries(item).map(([key, value]) => ({
        key,
        value,
        type: typeof value,
      })),
    };
  }

  /**
   * Update the detail panel with new data
   * @param {Object} detailData - Detail data to display
   */
  updateDetailPanel(detailData) {
    this.currentDetailData = detailData;

    if (this.eventBus) {
      this.eventBus.emit('detailCoordinator:detailUpdated', {
        detailData,
        layout: this.currentLayout,
        visible: this.detailPanelVisible,
      });
    }
  }

  /**
   * Clear detail panel data
   * Requirements: 23.7
   */
  clearDetailData() {
    this.currentDetailData = null;

    if (this.eventBus) {
      this.eventBus.emit('detailCoordinator:detailCleared', {});
    }
  }

  /**
   * Show the detail panel
   */
  showDetailPanel() {
    this.detailPanelVisible = true;

    if (this.eventBus) {
      this.eventBus.emit('detailCoordinator:panelShown', {
        layout: this.currentLayout,
        detailData: this.currentDetailData,
      });
    }
  }

  /**
   * Hide the detail panel
   */
  hideDetailPanel() {
    this.detailPanelVisible = false;

    if (this.eventBus) {
      this.eventBus.emit('detailCoordinator:panelHidden', {});
    }
  }

  /**
   * Toggle detail panel visibility
   */
  toggleDetailPanel() {
    if (this.detailPanelVisible) {
      this.hideDetailPanel();
    } else {
      this.showDetailPanel();
    }
  }

  /**
   * Set the detail panel layout
   * Requirements: 23.5
   * @param {string} layout - Layout type (side, bottom, overlay)
   */
  setLayout(layout) {
    if (!Object.values(DETAIL_LAYOUT).includes(layout)) {
      throw new Error(`Invalid layout: ${layout}`);
    }

    this.currentLayout = layout;

    if (this.eventBus) {
      this.eventBus.emit('detailCoordinator:layoutChanged', {
        layout,
        visible: this.detailPanelVisible,
      });
    }
  }

  /**
   * Get the current layout
   * @return {string}
   */
  getLayout() {
    return this.currentLayout;
  }

  /**
   * Check if detail panel is visible
   * @return {boolean}
   */
  isDetailPanelVisible() {
    return this.detailPanelVisible;
  }

  /**
   * Get current detail data
   * @return {Object|null}
   */
  getDetailData() {
    return this.currentDetailData;
  }

  /**
   * Set whether to preserve detail on view switch
   * @param {boolean} preserve - Whether to preserve
   */
  setPreserveDetailOnSwitch(preserve) {
    this.preserveDetailOnSwitch = preserve;
  }

  /**
   * Manually trigger detail update for current selection
   */
  refreshDetail() {
    if (!this.viewManager) {
      return;
    }

    const viewName = this.viewManager.getCurrentViewName();
    if (!viewName) {
      return;
    }

    const view = this.viewManager.getCurrentView();
    if (!view) {
      return;
    }

    const selectedItem = view.getSelectedItem();
    this.handleSelectionChange({viewName, selectedItem});
  }

  /**
   * Get the number of registered views
   * @return {number}
   */
  getRegisteredViewCount() {
    return this.viewConfigs.size;
  }

  /**
   * Check if a view is registered
   * @param {string} viewName - View name
   * @return {boolean}
   */
  hasView(viewName) {
    return this.viewConfigs.has(viewName);
  }

  /**
   * Destroy the coordinator and cleanup
   */
  destroy() {
    this.viewConfigs.clear();
    this.currentDetailData = null;
    this.detailPanelVisible = false;

    if (this.eventBus) {
      this.eventBus.emit('detailCoordinator:destroyed', {});
    }
  }
}
