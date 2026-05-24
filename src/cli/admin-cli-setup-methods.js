import blessed from 'blessed';
import contrib from 'blessed-contrib';
import {ViewManager} from './core/view-manager.js';
import {KeyboardHandler} from './core/keyboard-handler.js';
import {NodesView} from './views/nodes-view.js';
import {ReplicasView} from './views/services-view.js';
import {LogicalServicesView} from './views/logical-services-view.js';
import {TablesView} from './views/tables-view.js';
import {PartitionsView} from './views/partitions-view.js';
import {MessageGroupsView} from './views/message-groups-view.js';
import {LogsView} from './views/logs-view.js';
import {ConfigView} from './views/config-view.js';
import {ContextsView} from './views/contexts-view.js';
import {SQLQueryView} from './sql/sql-query-view.js';
import {CLI_APP, CLI_VIEW} from './cli-constants.js';
import {
  LOCAL_NUM_ONE,
  LOCAL_STR_RESIZE,
  LOCAL_NUM_ZERO,
  LOCAL_STR_100,
  LOCAL_NUM_THREE,
  LOCAL_STR_LINE,
  LOCAL_STR_BLUE,
  LOCAL_STR_100_6,
  LOCAL_STR_CYAN,
  LOCAL_STR_WHITE,
  LOCAL_NUM_TWO,
  LOCAL_NUM_20,
  LOCAL_NUM_12,
  LOCAL_NUM_10,
  LOCAL_STR_CENTER,
  LOCAL_STR_80,
  LOCAL_STR_GREEN,
  LOCAL_STR_BLACK,
  LOCAL_STR_40,
  LOCAL_STR_MAGENTA,
  LOCAL_STR_100_14,
  LOCAL_NUM_FIVE,
  LOCAL_STR_CRB9D,
  LOCAL_STR_EXECUTE,
  LOCAL_STR_MIDDLE,
  LOCAL_NUM_SIX,
  LOCAL_STR_60,
  LOCAL_STR_100_8,
  LOCAL_NUM_15,
  LOCAL_STR_15RD3,
  LOCAL_STR_ROW_DETAILS,
  LOCAL_STR_100_2,
  LOCAL_STR_RESULTS,
  LOCAL_NUM_60,
  LOCAL_STR_EDIT_CONFIGURATION,
  LOCAL_STR_EMPTY,
  LOCAL_NUM_FOUR,
  LOCAL_NUM_EIGHT,
  LOCAL_STR_LVBX0,
  LOCAL_STR_ESCAPE,
  LOCAL_STR_ENTER,
  LOCAL_STR_SUBMIT,
  LOCAL_STR_C_X,
  LOCAL_STR_PRESS,
  LOCAL_STR_NODES,
  LOCAL_STR_SERVICES,
  LOCAL_STR_REPLICAS,
  LOCAL_STR_TABLES,
  LOCAL_STR_PARTITIONS,
  LOCAL_STR_MESSAGE_GROUPS,
  LOCAL_STR_LOGS,
  LOCAL_STR_CONFIG,
  LOCAL_STR_CONTEXTS,
  LOCAL_STR_SQL,
  LOCAL_STR_KEYPRESS,
  LOCAL_STR_CACHE_UPDATE,
  LOCAL_STR_NAVIGATION_CHANGED,
  LOCAL_STR_VIEW_REFRESH,
  LOCAL_STR_HELP_SHOW,
  LOCAL_STR_HELP_HIDE,
  LOCAL_STR_ERROR,
} from './admin-cli-local-constants.js';

const ADMIN_CLI_SETUP_METHODS = {
  /**
   * Create the blessed screen
   */
  createScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: CLI_APP.NAME,
      fullUnicode: true,
      dockBorders: true,
      autoPadding: true,
    });

    this.screen.on(LOCAL_STR_RESIZE, () => this.handleResize());
  },

  /**
   * Create the UI layout
   */
  createLayout() {
    // Header bar with title and connection status
    this.headerBox = blessed.box({
      parent: this.screen,
      top: LOCAL_NUM_ZERO,
      left: LOCAL_NUM_ZERO,
      width: LOCAL_STR_100,
      height: LOCAL_NUM_THREE,
      tags: true,
      border: {type: LOCAL_STR_LINE},
      style: {border: {fg: LOCAL_STR_BLUE}},
    });

    // Main content area - table display
    this.mainTable = contrib.table({
      parent: this.screen,
      top: LOCAL_NUM_THREE,
      left: LOCAL_NUM_ZERO,
      width: LOCAL_STR_100,
      height: LOCAL_STR_100_6,
      keys: false,
      interactive: false,
      border: {type: LOCAL_STR_LINE},
      style: {
        border: {fg: LOCAL_STR_BLUE},
        header: {fg: LOCAL_STR_CYAN, bold: true},
        cell: {fg: LOCAL_STR_WHITE},
      },
      columnSpacing: LOCAL_NUM_TWO,
      columnWidth: [LOCAL_NUM_20, LOCAL_NUM_20, LOCAL_NUM_12, LOCAL_NUM_10, LOCAL_NUM_10, LOCAL_NUM_10, LOCAL_NUM_10],
    });

    // Status bar at bottom
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: LOCAL_NUM_ZERO,
      left: LOCAL_NUM_ZERO,
      width: LOCAL_STR_100,
      height: LOCAL_NUM_THREE,
      tags: true,
      border: {type: LOCAL_STR_LINE},
      style: {border: {fg: LOCAL_STR_BLUE}},
    });

    // Help overlay (hidden by default)
    this.helpBox = blessed.box({
      parent: this.screen,
      top: LOCAL_STR_CENTER,
      left: LOCAL_STR_CENTER,
      width: LOCAL_STR_80,
      height: LOCAL_STR_80,
      hidden: true,
      tags: true,
      border: {type: LOCAL_STR_LINE},
      style: {border: {fg: LOCAL_STR_GREEN}, bg: LOCAL_STR_BLACK},
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
    });

    // Detail panel (hidden by default)
    this.detailPanel = blessed.box({
      parent: this.screen,
      top: LOCAL_NUM_THREE,
      right: LOCAL_NUM_ZERO,
      width: LOCAL_STR_40,
      height: LOCAL_STR_100_6,
      hidden: true,
      tags: true,
      border: {type: LOCAL_STR_LINE},
      style: {border: {fg: LOCAL_STR_MAGENTA}},
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
    });

    // SQL input container (hidden by default)
    this.sqlContainer = blessed.box({
      parent: this.screen,
      top: LOCAL_NUM_THREE,
      left: LOCAL_NUM_ZERO,
      width: LOCAL_STR_100,
      height: LOCAL_STR_100_6,
      hidden: true,
      border: {type: LOCAL_STR_LINE},
      style: {border: {fg: LOCAL_STR_BLUE}},
    });

    // SQL query input textarea
    this.sqlInput = blessed.textarea({
      parent: this.sqlContainer,
      top: LOCAL_NUM_ZERO,
      left: LOCAL_NUM_ZERO,
      width: LOCAL_STR_100_14,
      height: LOCAL_NUM_FIVE,
      inputOnFocus: true,
      keys: true,
      mouse: true,
      border: {type: LOCAL_STR_LINE},
      style: {
        border: {fg: LOCAL_STR_CYAN},
        focus: {border: {fg: LOCAL_STR_GREEN}},
      },
      label: LOCAL_STR_CRB9D,
    });

    // Execute button
    this.sqlExecuteBtn = blessed.button({
      parent: this.sqlContainer,
      top: LOCAL_NUM_ONE,
      right: LOCAL_NUM_ONE,
      width: LOCAL_NUM_12,
      height: LOCAL_NUM_THREE,
      content: LOCAL_STR_EXECUTE,
      align: LOCAL_STR_CENTER,
      valign: LOCAL_STR_MIDDLE,
      mouse: true,
      keys: true,
      shrink: true,
      border: {type: LOCAL_STR_LINE},
      style: {
        fg: LOCAL_STR_WHITE,
        bg: LOCAL_STR_BLUE,
        border: {fg: LOCAL_STR_CYAN},
        hover: {bg: LOCAL_STR_GREEN},
        focus: {bg: LOCAL_STR_GREEN},
      },
    });

    // SQL results table (using contrib.table for proper formatting)
    this.sqlResultsTable = contrib.table({
      parent: this.sqlContainer,
      top: LOCAL_NUM_SIX,
      left: LOCAL_NUM_ZERO,
      width: LOCAL_STR_60,
      height: LOCAL_STR_100_8,
      keys: false,
      interactive: false,
      border: {type: LOCAL_STR_LINE},
      style: {
        border: {fg: LOCAL_STR_BLUE},
        header: {fg: LOCAL_STR_CYAN, bold: true},
        cell: {fg: LOCAL_STR_WHITE},
      },
      columnSpacing: LOCAL_NUM_TWO,
      columnWidth: [LOCAL_NUM_15, LOCAL_NUM_15, LOCAL_NUM_15, LOCAL_NUM_15, LOCAL_NUM_15],
      label: LOCAL_STR_15RD3,
    });

    // SQL detail panel for selected row
    this.sqlDetailPanel = blessed.box({
      parent: this.sqlContainer,
      top: LOCAL_NUM_SIX,
      right: LOCAL_NUM_ZERO,
      width: LOCAL_STR_40,
      height: LOCAL_STR_100_8,
      tags: true,
      border: {type: LOCAL_STR_LINE},
      style: {border: {fg: LOCAL_STR_MAGENTA}},
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      label: LOCAL_STR_ROW_DETAILS,
    });

    // SQL results state
    this.sqlResultsData = [];
    this.sqlResultsColumns = [];
    this.sqlSelectedIndex = LOCAL_NUM_ZERO;

    // Legacy results box (hidden, kept for compatibility)
    this.sqlResults = blessed.box({
      parent: this.sqlContainer,
      top: LOCAL_NUM_SIX,
      left: LOCAL_NUM_ZERO,
      width: LOCAL_STR_100_2,
      height: LOCAL_STR_100_8,
      hidden: true,
      tags: true,
      border: {type: LOCAL_STR_LINE},
      style: {border: {fg: LOCAL_STR_BLUE}},
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      label: LOCAL_STR_RESULTS,
    });

    // Config edit dialog (hidden by default)
    this.configEditDialog = blessed.box({
      parent: this.screen,
      top: LOCAL_STR_CENTER,
      left: LOCAL_STR_CENTER,
      width: LOCAL_NUM_60,
      height: LOCAL_NUM_12,
      hidden: true,
      tags: true,
      border: {type: LOCAL_STR_LINE},
      style: {border: {fg: LOCAL_STR_GREEN}, bg: LOCAL_STR_BLACK},
      label: LOCAL_STR_EDIT_CONFIGURATION,
    });

    this.configEditLabel = blessed.text({
      parent: this.configEditDialog,
      top: LOCAL_NUM_ONE,
      left: LOCAL_NUM_TWO,
      tags: true,
      content: LOCAL_STR_EMPTY,
    });

    this.configEditInput = blessed.textbox({
      parent: this.configEditDialog,
      top: LOCAL_NUM_FOUR,
      left: LOCAL_NUM_TWO,
      width: LOCAL_STR_100_6,
      height: LOCAL_NUM_THREE,
      inputOnFocus: true,
      keys: true,
      mouse: true,
      border: {type: LOCAL_STR_LINE},
      style: {
        border: {fg: LOCAL_STR_CYAN},
        focus: {border: {fg: LOCAL_STR_GREEN}},
      },
    });

    this.configEditHint = blessed.text({
      parent: this.configEditDialog,
      top: LOCAL_NUM_EIGHT,
      left: LOCAL_NUM_TWO,
      tags: true,
      content: LOCAL_STR_LVBX0,
    });

    // Config edit state
    this.configEditKey = null;
    this.configEditType = null;

    // Wire up config edit events
    this.configEditInput.key([LOCAL_STR_ESCAPE], () => {
      this.hideConfigEditDialog();
    });

    this.configEditInput.key([LOCAL_STR_ENTER], () => {
      this.submitConfigEdit();
    });

    // Wire up SQL input events
    this.sqlInput.on(LOCAL_STR_SUBMIT, () => this.executeSqlQuery());
    this.sqlInput.key([LOCAL_STR_C_X], () => this.executeSqlQuery());
    this.sqlInput.key([LOCAL_STR_ESCAPE], () => {
      this.sqlInput.clearValue();
      this.screen.render();
    });

    // Wire up execute button
    this.sqlExecuteBtn.on(LOCAL_STR_PRESS, () => this.executeSqlQuery());
  },

  /**
   * Register all views with the view manager
   */
  registerViews() {
    this.viewManager = new ViewManager({
      navigation: this.navigation,
      eventBus: this.eventBus,
      screen: this.screen,
    });

    const viewOptions = {
      cache: this.cache,
      eventBus: this.eventBus,
      screen: this.screen,
    };

    this.viewManager.registerView(LOCAL_STR_NODES, new NodesView(viewOptions));
    this.viewManager.registerView(LOCAL_STR_SERVICES, new LogicalServicesView(viewOptions));
    this.viewManager.registerView(LOCAL_STR_REPLICAS, new ReplicasView(viewOptions));
    this.viewManager.registerView(LOCAL_STR_TABLES, new TablesView({
      ...viewOptions,
      metadataComputer: this.metadataComputer,
    }));
    this.viewManager.registerView(LOCAL_STR_PARTITIONS, new PartitionsView(viewOptions));
    this.viewManager.registerView(LOCAL_STR_MESSAGE_GROUPS, new MessageGroupsView(viewOptions));
    this.viewManager.registerView(LOCAL_STR_LOGS, new LogsView({
      ...viewOptions,
      connectionManager: this.connectionManager,
      liveQueryManager: this.liveQueryManager,
      liveQueryEnabled: true,
    }));
    this.viewManager.registerView(LOCAL_STR_CONFIG, new ConfigView(viewOptions));
    this.viewManager.registerView(LOCAL_STR_CONTEXTS, new ContextsView(viewOptions));
    this.viewManager.registerView(LOCAL_STR_SQL, new SQLQueryView({
      ...viewOptions,
      connectionManager: this.connectionManager,
      readOnlyMode: this.readOnlyMode,
    }));
  },

  /**
   * Setup keyboard handling
   */
  setupKeyboardHandling() {
    this.keyboardHandler = new KeyboardHandler({
      eventBus: this.eventBus,
      stateManager: this.stateManager,
      navigation: this.navigation,
      commandParser: this.commandParser,
      helpOverlay: this.helpOverlay,
      onModeChange: (mode) => this.handleModeChange(mode),
      onInputChange: (value) => this.handleInputChange(value),
      onAction: (action) => this.handleAction(action),
    });

    this.screen.on(LOCAL_STR_KEYPRESS, (ch, key) => {
      this.keyboardHandler.handleKey({...key, ch});
    });
  },

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    this.eventBus.on(LOCAL_STR_CACHE_UPDATE, () => {
      if (this.cdcPaused || this.currentView === CLI_VIEW.LOGS) {
        return;
      }
      this.refreshCurrentView();
    });

    this.eventBus.on(LOCAL_STR_NAVIGATION_CHANGED, () => this.refreshCurrentView());
    this.eventBus.on(LOCAL_STR_VIEW_REFRESH, (payload = {}) => {
      const currentView = this.viewManager.getCurrentView();
      if (!currentView) {
        return;
      }
      if (payload.view && payload.view !== currentView) {
        return;
      }
      this.renderCurrentView(currentView);
    });

    this.eventBus.on(LOCAL_STR_HELP_SHOW, () => this.showHelpOverlay());
    this.eventBus.on(LOCAL_STR_HELP_HIDE, () => this.hideHelpOverlay());

    this.eventBus.on(LOCAL_STR_ERROR, (data) => this.showError(data.message));
  },
};

export {ADMIN_CLI_SETUP_METHODS};
