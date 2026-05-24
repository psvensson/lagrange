import {CLI_VIEW} from './cli-constants.js';
import {
  LOCAL_NUM_ONE,
  LOCAL_NUM_ZERO,
  LOCAL_STR_100,
  LOCAL_STR_WHITE,
  LOCAL_NUM_10,
  LOCAL_STR_60,
  LOCAL_STR_EMPTY,
  LOCAL_STR_SQL,
  LOCAL_STR_HELP_SHOW,
  LOCAL_STR_NAVIGATE_UP,
  LOCAL_STR_NAVIGATE_DOWN,
  LOCAL_STR_NAVIGATE_PAGEUP,
  LOCAL_STR_NAVIGATE_PAGEDOWN,
  LOCAL_STR_NAVIGATE_FIRST,
  LOCAL_STR_NAVIGATE_LAST,
  LOCAL_STR_NAVIGATE_SELECT,
  LOCAL_STR_NAVIGATE_BACK,
  LOCAL_STR_VIEW_SWITCH,
  LOCAL_STR_FILTER_APPLY,
  LOCAL_STR_COMMAND_EXECUTE,
  LOCAL_STR_DETAIL_TOGGLE,
  LOCAL_STR_CACHE_REFRESH,
  LOCAL_STR_CDC_TOGGLE_PAUSE,
  LOCAL_STR_CONFIG_EDIT,
  LOCAL_STR_CONFIG_REVERT,
  LOCAL_STR_APP_QUIT,
  LOCAL_STR_APP_FORCE_QUIT,
  LOCAL_STR_DRILLDOWN,
  LOCAL_STR_GOTO,
  LOCAL_STR_FILTER,
  LOCAL_STR_REFRESH,
  LOCAL_STR_HELP,
  LOCAL_STR_QUIT,
  LOCAL_STR_CONNECT,
  LOCAL_STR_DRAIN,
  LOCAL_STR_DRAINING,
  LOCAL_STR_ACTIVATE,
  LOCAL_STR_ACTIVE,
  LOCAL_STR_REMOVE_NODE,
  LOCAL_STR_HISTORY,
  LOCAL_STR_SINCE,
  LOCAL_STR_GKTW6,
  LOCAL_STR_NO_ITEM_SELECTED,
  LOCAL_STR_NEWLINE,
  LOCAL_STR_LMXQX,
  LOCAL_STR_14QE4,
} from './admin-cli-local-constants.js';

const ADMIN_CLI_NAVIGATION_METHODS = {
  /**
   * Handle keyboard mode change
   * @param {string} mode - New input mode
   */
  handleModeChange(_mode) {
    this.updateStatus(LOCAL_STR_EMPTY, LOCAL_STR_WHITE);
    this.screen.render();
  },

  /**
   * Handle input change in filter/command mode
   * @param {string} _value - Current input value
   */
  handleInputChange(_value) {
    this.updateStatus(LOCAL_STR_EMPTY, LOCAL_STR_WHITE);
  },

  /**
   * Handle keyboard action
   * @param {Object} action - Action to perform
   */
  handleAction(action) {
    switch (action.type) {
    case LOCAL_STR_NAVIGATE_UP:
      this.navigateUp();
      break;
    case LOCAL_STR_NAVIGATE_DOWN:
      this.navigateDown();
      break;
    case LOCAL_STR_NAVIGATE_PAGEUP:
      this.navigateUp(action.count || LOCAL_NUM_10);
      break;
    case LOCAL_STR_NAVIGATE_PAGEDOWN:
      this.navigateDown(action.count || LOCAL_NUM_10);
      break;
    case LOCAL_STR_NAVIGATE_FIRST:
      this.navigateFirst();
      break;
    case LOCAL_STR_NAVIGATE_LAST:
      this.navigateLast();
      break;
    case LOCAL_STR_NAVIGATE_SELECT:
      this.handleSelect();
      break;
    case LOCAL_STR_NAVIGATE_BACK:
      this.handleBack();
      break;
    case LOCAL_STR_VIEW_SWITCH:
      this.switchView(action.view);
      break;
    case LOCAL_STR_FILTER_APPLY:
      this.applyFilter(action.pattern);
      break;
    case LOCAL_STR_COMMAND_EXECUTE:
      this.executeCommand(action.command, action.args);
      break;
    case LOCAL_STR_DETAIL_TOGGLE:
      this.toggleDetailPanel();
      break;
    case LOCAL_STR_CACHE_REFRESH:
      this.forceRefresh();
      break;
    case LOCAL_STR_CDC_TOGGLE_PAUSE:
      this.toggleCDCPause();
      break;
    case LOCAL_STR_HELP_SHOW:
      this.showHelpOverlay();
      break;
    case LOCAL_STR_CONFIG_EDIT:
      this.handleConfigEdit();
      break;
    case LOCAL_STR_CONFIG_REVERT:
      this.handleConfigRevert();
      break;
    case LOCAL_STR_APP_QUIT:
    case LOCAL_STR_APP_FORCE_QUIT:
      this.quit();
      break;
    }
  },

  /**
   * Navigate selection up
   * @param {number} count - Number of rows to move
   */
  navigateUp(count = LOCAL_NUM_ONE) {
    // Handle SQL view navigation
    if (this.currentView === LOCAL_STR_SQL) {
      this.sqlNavigateUp(count);
      return;
    }

    const view = this.viewManager.getCurrentView();
    if (view) {
      view.selectUp(count);
      if (this.currentView === CLI_VIEW.LOGS) {
        this.renderCurrentView(view);
      } else {
        this.refreshCurrentView();
      }
    }
  },

  /**
   * Navigate selection down
   * @param {number} count - Number of rows to move
   */
  navigateDown(count = LOCAL_NUM_ONE) {
    // Handle SQL view navigation
    if (this.currentView === LOCAL_STR_SQL) {
      this.sqlNavigateDown(count);
      return;
    }

    const view = this.viewManager.getCurrentView();
    if (view) {
      view.selectDown(count);
      if (this.currentView === CLI_VIEW.LOGS) {
        this.renderCurrentView(view);
      } else {
        this.refreshCurrentView();
      }
    }
  },

  /**
   * Navigate to first row
   */
  navigateFirst() {
    // Handle SQL view navigation
    if (this.currentView === LOCAL_STR_SQL) {
      if (this.sqlResultsData && this.sqlResultsData.length > LOCAL_NUM_ZERO) {
        this.sqlSelectedIndex = LOCAL_NUM_ZERO;
        this.updateSqlResultsTable();
        this.updateSqlDetailPanel();
        this.screen.render();
      }
      return;
    }

    const view = this.viewManager.getCurrentView();
    if (view) {
      view.selectFirst();
      if (this.currentView === CLI_VIEW.LOGS) {
        this.renderCurrentView(view);
      } else {
        this.refreshCurrentView();
      }
    }
  },

  /**
   * Navigate to last row
   */
  navigateLast() {
    // Handle SQL view navigation
    if (this.currentView === LOCAL_STR_SQL) {
      if (this.sqlResultsData && this.sqlResultsData.length > LOCAL_NUM_ZERO) {
        this.sqlSelectedIndex = this.sqlResultsData.length - LOCAL_NUM_ONE;
        this.updateSqlResultsTable();
        this.updateSqlDetailPanel();
        this.screen.render();
      }
      return;
    }

    const view = this.viewManager.getCurrentView();
    if (view) {
      view.selectLast();
      if (this.currentView === CLI_VIEW.LOGS) {
        this.renderCurrentView(view);
      } else {
        this.refreshCurrentView();
      }
    }
  },

  /**
   * Handle select/enter on current row
   */
  handleSelect() {
    const view = this.viewManager.getCurrentView();
    if (!view) return;

    const result = view.handleDrillDown?.();
    if (result && result.action === LOCAL_STR_DRILLDOWN) {
      this.navigation.drillDown(result.view, result.context);
      this.switchView(result.view);
    }
  },

  /**
   * Handle back navigation
   */
  handleBack() {
    if (this.navigation.goBack()) {
      const state = this.navigation.getCurrentState();
      this.switchView(state.view);
    }
  },

  /**
   * Apply filter to current view
   * @param {string} pattern - Filter pattern
   */
  applyFilter(pattern) {
    const view = this.viewManager.getCurrentView();
    if (view) {
      view.setFilter(pattern);
      this.refreshCurrentView();
    }
  },

  /**
   * Execute a command
   * @param {string} command - Command name
   * @param {string[]} args - Command arguments
   */
  executeCommand(command, args) {
    switch (command) {
    case LOCAL_STR_GOTO:
      if (args[LOCAL_NUM_ZERO]) this.switchView(args[LOCAL_NUM_ZERO]);
      break;
    case LOCAL_STR_FILTER:
      this.applyFilter(args[LOCAL_NUM_ZERO] || LOCAL_STR_EMPTY);
      break;
    case LOCAL_STR_REFRESH:
      this.forceRefresh();
      break;
    case LOCAL_STR_SQL:
      this.switchView(LOCAL_STR_SQL);
      break;
    case LOCAL_STR_HELP:
      this.showHelpOverlay();
      break;
    case LOCAL_STR_QUIT:
      this.quit();
      break;
    case LOCAL_STR_CONNECT:
      if (args[LOCAL_NUM_ZERO]) this.reconnect(args[LOCAL_NUM_ZERO]);
      break;
    case LOCAL_STR_DRAIN:
      if (args[LOCAL_NUM_ZERO]) this.updateNodeStatus(args[LOCAL_NUM_ZERO], LOCAL_STR_DRAINING);
      break;
    case LOCAL_STR_ACTIVATE:
      if (args[LOCAL_NUM_ZERO]) this.updateNodeStatus(args[LOCAL_NUM_ZERO], LOCAL_STR_ACTIVE);
      break;
    case LOCAL_STR_REMOVE_NODE:
      if (args[LOCAL_NUM_ZERO]) this.removeNode(args[LOCAL_NUM_ZERO]);
      break;
    case LOCAL_STR_HISTORY:
      if (args[LOCAL_NUM_ZERO]) this.showReplicaHistory(args[LOCAL_NUM_ZERO]);
      break;
    case LOCAL_STR_SINCE:
      if (args[LOCAL_NUM_ZERO]) this.applyLogsSince(args[LOCAL_NUM_ZERO]);
      break;
    }
  },

  /**
   * Toggle detail panel visibility
   */
  toggleDetailPanel() {
    this.showingDetail = !this.showingDetail;

    if (this.showingDetail) {
      this.detailPanel.show();
      this.mainTable.width = LOCAL_STR_60;
      this.updateDetailPanel();
    } else {
      this.detailPanel.hide();
      this.mainTable.width = LOCAL_STR_100;
    }

    this.screen.render();
  },

  /**
   * Update the detail panel content
   */
  updateDetailPanel() {
    const view = this.viewManager.getCurrentView();
    if (!view || !view.getSelectedDetails) {
      this.detailPanel.setContent(LOCAL_STR_GKTW6);
      return;
    }

    const details = view.getSelectedDetails();
    if (!details) {
      this.detailPanel.setContent(LOCAL_STR_NO_ITEM_SELECTED);
      return;
    }

    let content = ` {bold}${details.title}{/bold}\n\n`;

    for (const section of details.sections || []) {
      content += `{cyan-fg}── ${section.title} ──{/cyan-fg}\n`;
      for (const field of section.fields || []) {
        content += `  ${field.label}: ${field.value}\n`;
      }
      content += LOCAL_STR_NEWLINE;
    }

    if (details.relatedCounts) {
      content += LOCAL_STR_LMXQX;
      for (const [key, value] of Object.entries(details.relatedCounts)) {
        content += `  ${key}: ${value}\n`;
      }
      content += LOCAL_STR_NEWLINE;
    }

    if (details.navigationLinks && details.navigationLinks.length > LOCAL_NUM_ZERO) {
      content += LOCAL_STR_14QE4;
      for (const link of details.navigationLinks) {
        const keyHint = link.key ? `[${link.key}] ` : '';
        content += `  ${keyHint}${link.label}\n`;
      }
    }

    this.detailPanel.setContent(content);
  },
};

export {ADMIN_CLI_NAVIGATION_METHODS};
