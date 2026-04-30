/**
 * Admin CLI main module
 * Terminal-based curses UI for distributed database administration
 *
 * Inspired by K9s for Kubernetes, provides real-time visibility into cluster state
 * through a CDC-synchronized local cache.
 */

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import fs from 'fs';

import {EventBus} from './core/event-bus.js';
import {StateManager} from './core/state-manager.js';
// ComponentRegistry available for advanced usage
// import {ComponentRegistry} from './core/component-registry.js';
import {ConfigManager} from './core/config-manager.js';
import {ConnectionManager} from './core/connection-manager.js';
import {RemoteCache} from './core/remote-cache.js';
import {TableMetadataComputer} from './core/table-metadata-computer.js';
import {NavigationController} from './core/navigation-controller.js';
import {ViewManager} from './core/view-manager.js';
import {KeyboardHandler, INPUT_MODE} from './core/keyboard-handler.js';
import {CommandParser} from './core/command-parser.js';
import {HelpOverlay} from './core/help-overlay.js';
import {ErrorHandler} from './core/error-handler.js';

import {NodesView} from './views/nodes-view.js';
import {ReplicasView} from './views/services-view.js';
import {LogicalServicesView} from './views/logical-services-view.js';
import {TablesView} from './views/tables-view.js';
import {PartitionsView} from './views/partitions-view.js';
import {MessageGroupsView} from './views/message-groups-view.js';
import {LogsView} from './views/logs-view.js';
import {ConfigView} from './views/config-view.js';
import {ContextsView} from './views/contexts-view.js';

import {LiveQueryManager} from './core/live-query-manager.js';
import {ADMIN_CLI_ACTION_METHODS} from './admin-cli-action-methods.js';

import {SQLQueryView} from './sql/sql-query-view.js';
import {
  CLI_APP,
  CLI_ENV,
  CLI_FLAG,
  CLI_HELP_TEXT,
  CLI_PATH,
  CLI_VERSION_PREFIX,
  CLI_VERSION,
  CLI_VIEW,
} from './cli-constants.js';

const LOCAL_STR_YELLOW = 'yellow';
const LOCAL_NUM_2000 = 2000;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_RESIZE = 'resize';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_100 = '100%';
const LOCAL_NUM_THREE = 3;
const LOCAL_STR_LINE = 'line';
const LOCAL_STR_BLUE = 'blue';
const LOCAL_STR_100_6 = '100%-6';
const LOCAL_STR_CYAN = 'cyan';
const LOCAL_STR_WHITE = 'white';
const LOCAL_NUM_TWO = 2;
const LOCAL_NUM_20 = 20;
const LOCAL_NUM_12 = 12;
const LOCAL_NUM_10 = 10;
const LOCAL_STR_CENTER = 'center';
const LOCAL_STR_80 = '80%';
const LOCAL_STR_GREEN = 'green';
const LOCAL_STR_BLACK = 'black';
const LOCAL_STR_40 = '40%';
const LOCAL_STR_MAGENTA = 'magenta';
const LOCAL_STR_100_14 = '100%-14';
const LOCAL_NUM_FIVE = 5;
const LOCAL_STR_CRB9D = ' SQL Query (Ctrl+X to execute, Esc to clear) ';
const LOCAL_STR_EXECUTE = ' Execute ';
const LOCAL_STR_MIDDLE = 'middle';
const LOCAL_NUM_SIX = 6;
const LOCAL_STR_60 = '60%';
const LOCAL_STR_100_8 = '100%-8';
const LOCAL_NUM_15 = 15;
const LOCAL_STR_15RD3 = ' Results (↑↓ navigate, Tab: detail panel) ';
const LOCAL_STR_ROW_DETAILS = ' Row Details ';
const LOCAL_STR_100_2 = '100%-2';
const LOCAL_STR_RESULTS = ' Results ';
const LOCAL_NUM_60 = 60;
const LOCAL_STR_EDIT_CONFIGURATION = ' Edit Configuration ';
const LOCAL_STR_EMPTY = '';
const LOCAL_NUM_FOUR = 4;
const LOCAL_NUM_EIGHT = 8;
const LOCAL_STR_LVBX0 = '{cyan-fg}Enter{/cyan-fg}:Save  {cyan-fg}Esc{/cyan-fg}:Cancel';
const LOCAL_STR_ESCAPE = 'escape';
const LOCAL_STR_ENTER = 'enter';
const LOCAL_STR_SUBMIT = 'submit';
const LOCAL_STR_C_X = 'C-x';
const LOCAL_STR_PRESS = 'press';
const LOCAL_STR_NODES = 'nodes';
const LOCAL_STR_SERVICES = 'services';
const LOCAL_STR_REPLICAS = 'replicas';
const LOCAL_STR_TABLES = 'tables';
const LOCAL_STR_PARTITIONS = 'partitions';
const LOCAL_STR_MESSAGE_GROUPS = 'message_groups';
const LOCAL_STR_LOGS = 'logs';
const LOCAL_STR_CONFIG = 'config';
const LOCAL_STR_CONTEXTS = 'contexts';
const LOCAL_STR_SQL = 'sql';
const LOCAL_STR_KEYPRESS = 'keypress';
const LOCAL_STR_CACHE_UPDATE = 'cache:update';
const LOCAL_STR_NAVIGATION_CHANGED = 'navigation:changed';
const LOCAL_STR_VIEW_REFRESH = 'view:refresh';
const LOCAL_STR_HELP_SHOW = 'help:show';
const LOCAL_STR_HELP_HIDE = 'help:hide';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_CONNECTED = 'connected';
const LOCAL_STR_1KRB7 = 'Connected - Waiting for cache...';
const LOCAL_STR_RECONNECTING = 'reconnecting';
const LOCAL_STR_FAILED = 'failed';
const LOCAL_STR_CONNECTION_FAILED = 'Connection failed';
const LOCAL_STR_RED = 'red';
const LOCAL_STR_DISCONNECTED = 'disconnected';
const LOCAL_STR_DISCONNECTED_2 = 'Disconnected';
const LOCAL_STR_128KJ = ', ';
const LOCAL_STR_SGZMJ = 'switchView(nodes) called - initial load';
const LOCAL_STR_1L5NX = 'refreshCurrentView() called - cache refresh';
const LOCAL_STR_QUERY_RESULT = 'query:result';
const LOCAL_STR_1ABO2 = 'Calling connectionManager.connect()';
const LOCAL_STR_462KR = 'connectionManager.connect() resolved';
const LOCAL_STR_1TP34 = 'SQL Query Interface';
const LOCAL_STR_FW0U6 = 'Enter a query above and press Ctrl+X to execute';
const LOCAL_STR_1CINP = '{bold}{cyan-fg}SQL Query Interface{/cyan-fg}{/bold}\n\n';
const LOCAL_STR_19GO0 = 'Enter a SQL query in the input box above and press ';
const LOCAL_STR_1L6CE = '{green-fg}Ctrl+X{/green-fg} or click {green-fg}Execute{/green-fg} to run.\n\n';
const LOCAL_STR_BOLD_EXAMPLES_BOLD = '{bold}Examples:{/bold}\n';
const LOCAL_STR_SELECT_FROM_NODES = '  SELECT * FROM nodes\n';
const LOCAL_STR_SELECT_FROM_TABLES = '  SELECT * FROM tables\n';
const LOCAL_STR_1LNVC = '  SELECT * FROM partitions\n';
const LOCAL_STR_B9JZ8 = '  SELECT * FROM services\n\n';
const LOCAL_STR_1B022 = '{bold}Navigation:{/bold}\n';
const LOCAL_STR_IQU5C = '  {cyan-fg}↑/↓{/cyan-fg}      Navigate results\n';
const LOCAL_STR_1J862 = '  {cyan-fg}PgUp/PgDn{/cyan-fg} Page through results\n';
const LOCAL_STR_1IRSA = '  {cyan-fg}g/G{/cyan-fg}      First/Last row\n\n';
const LOCAL_STR_5HIDN = '{bold}Shortcuts:{/bold}\n';
const LOCAL_STR_QM582 = '  {cyan-fg}Ctrl+X{/cyan-fg}   Execute query\n';
const LOCAL_STR_141HM = '  {cyan-fg}Esc{/cyan-fg}      Clear input\n';
const LOCAL_STR_1B05O = '  {cyan-fg}0-9{/cyan-fg}      Switch to other views';
const LOCAL_STR_CZGPU = '{cyan-fg}Ctrl+X{/cyan-fg}:Execute  ';
const LOCAL_STR_ZH2EO = '{cyan-fg}↑↓{/cyan-fg}:Navigate  ';
const LOCAL_STR_8G5X6 = '{cyan-fg}Esc{/cyan-fg}:Clear  ';
const LOCAL_STR_RS5HY = '{cyan-fg}0-9{/cyan-fg}:Views  ';
const LOCAL_STR_QUTO4 = '{cyan-fg}?{/cyan-fg}:Help';
const LOCAL_STR_5AG4A = '{cyan-fg}e{/cyan-fg}:Edit  ';
const LOCAL_STR_1BG3N = '{cyan-fg}R{/cyan-fg}:Revert  ';
const LOCAL_STR_108BZ = '{cyan-fg}d{/cyan-fg}:Details  ';
const LOCAL_STR_157A5 = '{cyan-fg}/{/cyan-fg}:Filter  ';
const LOCAL_STR_NAVIGATE_UP = 'navigate:up';
const LOCAL_STR_NAVIGATE_DOWN = 'navigate:down';
const LOCAL_STR_NAVIGATE_PAGEUP = 'navigate:pageup';
const LOCAL_STR_NAVIGATE_PAGEDOWN = 'navigate:pagedown';
const LOCAL_STR_NAVIGATE_FIRST = 'navigate:first';
const LOCAL_STR_NAVIGATE_LAST = 'navigate:last';
const LOCAL_STR_NAVIGATE_SELECT = 'navigate:select';
const LOCAL_STR_NAVIGATE_BACK = 'navigate:back';
const LOCAL_STR_VIEW_SWITCH = 'view:switch';
const LOCAL_STR_FILTER_APPLY = 'filter:apply';
const LOCAL_STR_COMMAND_EXECUTE = 'command:execute';
const LOCAL_STR_DETAIL_TOGGLE = 'detail:toggle';
const LOCAL_STR_CACHE_REFRESH = 'cache:refresh';
const LOCAL_STR_CDC_TOGGLE_PAUSE = 'cdc:toggle-pause';
const LOCAL_STR_CONFIG_EDIT = 'config:edit';
const LOCAL_STR_CONFIG_REVERT = 'config:revert';
const LOCAL_STR_APP_QUIT = 'app:quit';
const LOCAL_STR_APP_FORCE_QUIT = 'app:force-quit';
const LOCAL_STR_DRILLDOWN = 'drillDown';
const LOCAL_STR_GOTO = 'goto';
const LOCAL_STR_FILTER = 'filter';
const LOCAL_STR_REFRESH = 'refresh';
const LOCAL_STR_HELP = 'help';
const LOCAL_STR_QUIT = 'quit';
const LOCAL_STR_CONNECT = 'connect';
const LOCAL_STR_DRAIN = 'drain';
const LOCAL_STR_DRAINING = 'draining';
const LOCAL_STR_ACTIVATE = 'activate';
const LOCAL_STR_ACTIVE = 'active';
const LOCAL_STR_REMOVE_NODE = 'remove-node';
const LOCAL_STR_HISTORY = 'history';
const LOCAL_STR_SINCE = 'since';
const LOCAL_STR_GKTW6 = ' No details available';
const LOCAL_STR_NO_ITEM_SELECTED = ' No item selected';
const LOCAL_STR_NEWLINE = '\n';
const LOCAL_STR_LMXQX = '{cyan-fg}── Related ──{/cyan-fg}\n';
const LOCAL_STR_14QE4 = '{cyan-fg}── Navigation ──{/cyan-fg}\n';
const LOCAL_STR_REFRESHING = 'Refreshing...';
const LOCAL_STR_CDC_UPDATES_PAUSED = 'CDC updates paused';
const LOCAL_STR_1V74X = 'CDC updates resumed';

// Debug logging to file (since blessed takes over terminal)
const DEBUG_LOG = process.env[CLI_ENV.DEBUG] === CLI_ENV.DEBUG_ENABLED_VALUE;
const debugLog = (msg) => {
  if (DEBUG_LOG) {
    fs.appendFileSync(CLI_PATH.DEBUG_LOG_FILE, `${new Date().toISOString()} ${msg}\n`);
  }
};

// Re-export core components
export {EventBus} from './core/event-bus.js';
export {StateManager} from './core/state-manager.js';
export {ComponentRegistry} from './core/component-registry.js';
export {RemoteCache} from './core/remote-cache.js';
export {ConfigManager} from './core/config-manager.js';
export {ConnectionManager} from './core/connection-manager.js';


/**
 * View name to number key mapping
 */
const VIEW_NUMBERS = {
  [CLI_VIEW.NODES]: '1',
  [CLI_VIEW.REPLICAS]: '2',
  [CLI_VIEW.TABLES]: '3',
  [CLI_VIEW.PARTITIONS]: '4',
  [CLI_VIEW.MESSAGE_GROUPS]: '5',
  [CLI_VIEW.SQL]: '6',
  [CLI_VIEW.LOGS]: '7',
  [CLI_VIEW.CONFIG]: '8',
  [CLI_VIEW.CONTEXTS]: '9',
  [CLI_VIEW.SERVICES]: '0',
};

/**
 * Main CLI application class
 */
export class AdminCLI {
  constructor() {
    this.started = false;
    this.screen = null;

    // Core components
    this.eventBus = null;
    this.stateManager = null;
    this.configManager = null;
    this.connectionManager = null;
    this.cache = null;
    this.liveQueryManager = null;
    this.metadataComputer = null;
    this.navigation = null;
    this.viewManager = null;
    this.keyboardHandler = null;
    this.commandParser = null;
    this.helpOverlay = null;
    this.errorHandler = null;

    // UI elements
    this.headerBox = null;
    this.mainTable = null;
    this.statusBar = null;
    this.detailPanel = null;
    this.helpBox = null;

    // State
    this.currentView = CLI_VIEW.NODES;
    this.cdcPaused = false;
    this.showingDetail = false;
    this.readOnlyMode = false;
    this.initialCacheLoaded = false;
  }

  /**
   * Start the CLI application
   * @param {string[]} args - Command line arguments
   */
  async start(args) {
    // Handle --help flag
    if (args.includes(CLI_FLAG.HELP) || args.includes(CLI_FLAG.HELP_SHORT)) {
      this.showHelp();
      return;
    }

    // Handle --version flag
    if (args.includes(CLI_FLAG.VERSION) || args.includes(CLI_FLAG.VERSION_SHORT)) {
      this.showVersion();
      return;
    }

    // Check for read-only mode
    this.readOnlyMode = args.includes(CLI_FLAG.READ_ONLY);

    // Get node address from args or environment
    const nodeAddress = args.find((arg) => !arg.startsWith('-')) ||
      process.env.DDB_NODE_ADDRESS || 'localhost:8081';

    // Initialize components
    this.initializeComponents();

    // Create the terminal UI
    this.createScreen();
    this.createLayout();
    this.registerViews();
    this.setupKeyboardHandling();
    this.setupEventHandlers();

    // Show connecting message
    this.updateStatus(`Connecting to ${nodeAddress}...`, LOCAL_STR_YELLOW);
    this.screen.render();

    // Connect to the server
    try {
      await this.connect(nodeAddress);
      this.started = true;

      // Return a promise that never resolves to keep the process alive
      return new Promise(() => {});
    } catch (err) {
      this.showError(`Failed to connect: ${err.message}`);
      // Give user time to see the error
      await new Promise((resolve) => setTimeout(resolve, LOCAL_NUM_2000));
      this.cleanup();
      process.exit(LOCAL_NUM_ONE);
    }
  }

  /**
   * Initialize core components
   */
  initializeComponents() {
    this.eventBus = new EventBus();
    this.stateManager = new StateManager({eventBus: this.eventBus});
    this.configManager = new ConfigManager();
    this.cache = new RemoteCache();
    this.metadataComputer = new TableMetadataComputer(this.cache);
    this.navigation = new NavigationController(this.cache, this.eventBus);
    this.commandParser = new CommandParser();
    this.helpOverlay = new HelpOverlay({eventBus: this.eventBus});
    this.errorHandler = new ErrorHandler({eventBus: this.eventBus});
    this.connectionManager = new ConnectionManager();
    this.liveQueryManager = new LiveQueryManager(
      this.connectionManager, this.eventBus,
    );
  }

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
  }


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
  }

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
  }

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
  }

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
  }


  /**
   * Connect to the server
   * @param {string} nodeAddress - Node address to connect to
   */
  async connect(nodeAddress) {
    debugLog(`connect() called with address: ${nodeAddress}`);

    this.connectionManager.onStatusChange = (status, delay) => {
      debugLog(`onStatusChange: ${status}, delay: ${delay}`);
      if (status === LOCAL_STR_CONNECTED) {
        this.updateStatus(LOCAL_STR_1KRB7, LOCAL_STR_GREEN);
      } else if (status === LOCAL_STR_RECONNECTING) {
        this.updateStatus(`Reconnecting in ${delay}ms...`, LOCAL_STR_YELLOW);
      } else if (status === LOCAL_STR_FAILED) {
        this.updateStatus(LOCAL_STR_CONNECTION_FAILED, LOCAL_STR_RED);
      } else if (status === LOCAL_STR_DISCONNECTED) {
        this.updateStatus(LOCAL_STR_DISCONNECTED_2, LOCAL_STR_RED);
      }
      this.screen.render();
    };

    this.connectionManager.onCacheDump = (data) => {
      debugLog(`onCacheDump called, data keys: ${Object.keys(data || {}).join(LOCAL_STR_128KJ)}`);

      // Load data into cache
      this.cache.loadFromDump(data);

      // Get stats to verify data was loaded
      const stats = this.cache.getStats();
      const nodeCount = stats.tableCounts.nodes || 0;
      const replicaCount = stats.tableCounts.services || 0;
      const tableCount = stats.tableCounts.tables || 0;

      debugLog(
        `Cache loaded: ${nodeCount} nodes, ${replicaCount} replicas, ` +
        `${tableCount} tables`,
      );

      // Update status with counts
      this.updateStatus(
        `Connected (${nodeCount} nodes, ${replicaCount} replicas, ${tableCount} tables)`,
        LOCAL_STR_GREEN,
      );

      // Only switch to nodes view on initial connection, not on refresh
      if (!this.initialCacheLoaded) {
        this.initialCacheLoaded = true;
        this.switchView(LOCAL_STR_NODES);
        debugLog(LOCAL_STR_SGZMJ);
      } else {
        // Just refresh the current view
        this.refreshCurrentView();
        debugLog(LOCAL_STR_1L5NX);
      }
    };

    this.connectionManager.onCDCEvent = (event) => {
      debugLog(`onCDCEvent: ${event.operation} on ${event.table}`);
      if (!this.cdcPaused) {
        const change = this.cache.applyCDCEvent(event);
        this.eventBus.emit(LOCAL_STR_CACHE_UPDATE, change);
      }
    };

    this.connectionManager.onQueryResult = (result) => {
      debugLog(`onQueryResult: queryId=${result.queryId}`);
      this.eventBus.emit(LOCAL_STR_QUERY_RESULT, result);
    };

    this.connectionManager.onLiveQueryEvent = (message) => {
      debugLog(`onLiveQueryEvent: subscriptionId=${message.subscriptionId}`);
      if (this.liveQueryManager) {
        this.liveQueryManager.handleLiveQueryEvent(message);
      }
    };

    this.connectionManager.onError = (err) => {
      debugLog(`onError: ${err.message}`);
      this.showError(err.message);
    };

    debugLog(LOCAL_STR_1ABO2);
    await this.connectionManager.connect(nodeAddress);
    debugLog(LOCAL_STR_462KR);
  }

  /**
   * Switch to a different view
   * @param {string} viewName - Name of view to switch to
   */
  switchView(viewName) {
    if (!this.viewManager.hasView(viewName)) return;

    this.currentView = viewName;
    this.navigation.goToView(viewName);
    this.viewManager.switchView(viewName);

    // Show/hide SQL container based on view
    if (viewName === LOCAL_STR_SQL) {
      this.mainTable.hide();
      this.sqlContainer.show();
      this.detailPanel.hide();
      this.showingDetail = false;
      this.sqlInput.focus();
      // Show initial instructions in results panel
      if (!this.sqlResultsData || this.sqlResultsData.length === LOCAL_NUM_ZERO) {
        this.sqlResultsTable.setData({
          headers: [LOCAL_STR_1TP34],
          data: [
            [LOCAL_STR_FW0U6],
          ],
        });
        this.sqlDetailPanel.setContent(
          LOCAL_STR_1CINP +
          LOCAL_STR_19GO0 +
          LOCAL_STR_1L6CE +
          LOCAL_STR_BOLD_EXAMPLES_BOLD +
          LOCAL_STR_SELECT_FROM_NODES +
          LOCAL_STR_SELECT_FROM_TABLES +
          LOCAL_STR_1LNVC +
          LOCAL_STR_B9JZ8 +
          LOCAL_STR_1B022 +
          LOCAL_STR_IQU5C +
          LOCAL_STR_1J862 +
          LOCAL_STR_1IRSA +
          LOCAL_STR_5HIDN +
          LOCAL_STR_QM582 +
          LOCAL_STR_141HM +
          LOCAL_STR_1B05O,
        );
      }
    } else {
      this.sqlContainer.hide();
      this.mainTable.show();

      // Services and replicas views always show detail panel.
      if (viewName === LOCAL_STR_SERVICES || viewName === LOCAL_STR_REPLICAS) {
        this.showingDetail = true;
        this.detailPanel.show();
        this.mainTable.width = LOCAL_STR_60;
      } else {
        // Other views hide detail panel by default (can toggle with 'd')
        this.showingDetail = false;
        this.detailPanel.hide();
        this.mainTable.width = LOCAL_STR_100;
      }
    }

    this.refreshCurrentView();
  }

  /**
   * Refresh the current view with latest data
   */
  refreshCurrentView() {
    const view = this.viewManager.getCurrentView();
    if (!view) return;

    let data = [];
    switch (this.currentView) {
    case LOCAL_STR_NODES:
      data = this.cache.getNodes();
      break;
    case LOCAL_STR_SERVICES:
      data = this.cache.getLogicalServices(this.navigation.currentContext || {});
      break;
    case LOCAL_STR_REPLICAS:
      data = this.cache.getServices(this.navigation.currentContext || {});
      break;
    case LOCAL_STR_TABLES:
      data = this.cache.getTables().map((t) =>
        this.metadataComputer.computeMetadata(t));
      break;
    case LOCAL_STR_PARTITIONS:
      data = this.cache.getPartitions(this.navigation.currentContext || {});
      break;
    case LOCAL_STR_MESSAGE_GROUPS:
      data = this.cache.getMessageGroups();
      break;
    case LOCAL_STR_LOGS:
      // Logs are maintained by live query subscriptions owned by LogsView.
      this.renderCurrentView(view);
      return;
    case LOCAL_STR_CONFIG:
      data = this.cache.getConfig();
      break;
    case LOCAL_STR_CONTEXTS:
      data = this.cache.getContexts(this.navigation.currentContext || {});
      break;
    case LOCAL_STR_SQL:
      data = [];
      break;
    }

    view.setData(data);
    this.renderCurrentView(view);
  }

  /**
   * Render the active view without triggering data fetches.
   * @param {Object} view - View instance to render
   */
  renderCurrentView(view) {
    if (!view) return;

    const renderData = view.render(this.navigation.getCurrentState());
    this.updateMainTable(renderData);
    this.updateHeader();

    if (this.showingDetail) {
      this.updateDetailPanel();
    }

    this.screen.render();
  }

  /**
   * Update the main table display
   * @param {Object} renderData - Render data from view
   */
  updateMainTable(renderData) {
    if (!renderData || !renderData.headers) return;

    const {headers, rows, columns, selectedIndex} = renderData;

    // Calculate available width for the table
    // Account for borders (2 chars) and whether detail panel is shown
    const screenWidth = this.screen.width || 80;
    const tableWidthPercent = this.showingDetail ? 0.6 : 1.0;
    const availableWidth = Math.floor(screenWidth * tableWidthPercent) - 4; // borders + padding

    // Calculate column widths
    let widths = [];
    if (columns && columns.length > LOCAL_NUM_ZERO) {
      const totalDefinedWidth = columns.reduce((sum, col) => sum + (col.width || 15), 0);
      const columnSpacing = (columns.length - 1) * 2; // 2 chars spacing between columns
      const contentWidth = availableWidth - columnSpacing;

      // Scale column widths proportionally to fit available space
      widths = columns.map((col) => {
        const baseWidth = col.width || 15;
        const scaledWidth = Math.floor((baseWidth / totalDefinedWidth) * contentWidth);
        return Math.max(LOCAL_NUM_EIGHT, scaledWidth); // minimum 8 chars per column
      });

      this.mainTable.options.columnWidth = widths;
    }

    // Helper to truncate value to fit column width
    const truncate = (value, maxWidth) => {
      const str = String(value || '');
      if (str.length <= maxWidth) return str;
      if (maxWidth <= 3) return str.substring(0, maxWidth);
      return str.substring(0, maxWidth - 2) + '..';
    };

    // ANSI escape codes for styling (blessed-contrib table doesn't support blessed tags)
    // We apply styling to ALL rows to ensure consistent column width calculations
    const ANSI = {
      INVERSE: '\x1b[7m',
      CYAN: '\x1b[36m',
      RED: '\x1b[31m',
      YELLOW: '\x1b[33m',
      WHITE: '\x1b[37m',
      RESET: '\x1b[0m',
    };

    const tableData = rows.map((row, index) => {
      const values = row.values || [];
      let color = ANSI.WHITE;

      if (index === selectedIndex) {
        color = ANSI.INVERSE;
      } else if (row.isChanged) {
        color = ANSI.CYAN;
      } else if (row.status === 'error') {
        color = ANSI.RED;
      } else if (row.status === 'warning') {
        color = ANSI.YELLOW;
      }

      // Truncate values to fit column widths and apply styling
      return values.map((v, colIndex) => {
        const maxWidth = widths[colIndex] || 15;
        const truncated = truncate(v, maxWidth);
        return `${color}${truncated}${ANSI.RESET}`;
      });
    });

    this.mainTable.setData({headers, data: tableData});
  }

  /**
   * Update the header bar
   */
  updateHeader() {
    const viewNum = VIEW_NUMBERS[this.currentView] || '?';
    const viewName = this.currentView.replace('_', ' ').toUpperCase();
    const breadcrumb = this.navigation.getBreadcrumb();

    const cdcStatus = this.cdcPaused ?
      '{yellow-fg}CDC PAUSED{/yellow-fg}' :
      '{green-fg}CDC LIVE{/green-fg}';

    const readOnly = this.readOnlyMode ? ' {red-fg}[READ-ONLY]{/red-fg}' : '';

    const content = ` {bold}${CLI_APP.NAME}{/bold}${readOnly}  |  ` +
      `{cyan-fg}[${viewNum}]{/cyan-fg} ${viewName}  |  ` +
      `${breadcrumb}  |  ${cdcStatus}`;

    this.headerBox.setContent(content);
  }

  /**
   * Update the status bar
   * @param {string} message - Status message
   * @param {string} color - Message color
   */
  updateStatus(message, color = LOCAL_STR_WHITE) {
    const mode = this.keyboardHandler?.getMode() || INPUT_MODE.NORMAL;
    let hints = this.helpOverlay.getStatusBarHints(this.currentView);
    const inputBuffer = this.keyboardHandler.getInputBuffer();

    // Add SQL-specific hints when in SQL view
    if (this.currentView === LOCAL_STR_SQL) {
      hints = LOCAL_STR_CZGPU +
        LOCAL_STR_ZH2EO +
        LOCAL_STR_8G5X6 +
        LOCAL_STR_RS5HY +
        LOCAL_STR_QUTO4;
    }

    // Add config-specific hints when in config view
    if (this.currentView === LOCAL_STR_CONFIG) {
      hints = LOCAL_STR_5AG4A +
        LOCAL_STR_1BG3N +
        LOCAL_STR_108BZ +
        LOCAL_STR_157A5 +
        LOCAL_STR_QUTO4;
    }

    const statusContent = mode === INPUT_MODE.FILTER ?
      ` {yellow-fg}Filter:{/yellow-fg} ${inputBuffer}_` :
      mode === INPUT_MODE.COMMAND ?
        ` {yellow-fg}:{/yellow-fg}${inputBuffer}_` :
        ` {${color}-fg}${message}{/${color}-fg}  |  ${hints}`;

    this.statusBar.setContent(statusContent);
    this.screen.render();
  }


  /**
   * Handle keyboard mode change
   * @param {string} mode - New input mode
   */
  handleModeChange(_mode) {
    this.updateStatus(LOCAL_STR_EMPTY, LOCAL_STR_WHITE);
    this.screen.render();
  }

  /**
   * Handle input change in filter/command mode
   * @param {string} _value - Current input value
   */
  handleInputChange(_value) {
    this.updateStatus(LOCAL_STR_EMPTY, LOCAL_STR_WHITE);
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  /**
   * Handle back navigation
   */
  handleBack() {
    if (this.navigation.goBack()) {
      const state = this.navigation.getCurrentState();
      this.switchView(state.view);
    }
  }

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
  }

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
  }

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
  }

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
  }

  /**
   * Force refresh cache from server
   */
  forceRefresh() {
    this.updateStatus(LOCAL_STR_REFRESHING, LOCAL_STR_YELLOW);
    this.connectionManager.requestCacheDump?.();
  }

  /**
   * Toggle CDC pause state
   */
  toggleCDCPause() {
    this.cdcPaused = !this.cdcPaused;
    this.updateHeader();
    this.updateStatus(
      this.cdcPaused ? LOCAL_STR_CDC_UPDATES_PAUSED : LOCAL_STR_1V74X,
      this.cdcPaused ? LOCAL_STR_YELLOW : LOCAL_STR_GREEN,
    );
  }

  /**
   * Show help overlay
   */
  showHelpOverlay() {
    const helpText = this.helpOverlay.formatHelpText(this.currentView);
    this.helpBox.setContent(helpText);
    this.helpBox.show();
    this.helpBox.focus();
    this.screen.render();
  }

  /**
   * Hide help overlay
   */
  hideHelpOverlay() {
    this.helpBox.hide();
    this.screen.render();
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    this.updateStatus(`Error: ${message}`, LOCAL_STR_RED);
  }

  /**
   * Handle screen resize
   */
  handleResize() {
    this.refreshCurrentView();
  }

  /**
   * Reconnect to a different node
   * @param {string} address - New node address
   */
  async reconnect(address) {
    this.updateStatus(`Reconnecting to ${address}...`, LOCAL_STR_YELLOW);
    this.connectionManager.disconnect();
    try {
      await this.connect(address);
    } catch (err) {
      this.showError(`Failed to reconnect: ${err.message}`);
    }
  }

  /**
   * Quit the application
   */
  quit() {
    this.cleanup();
    process.exit(LOCAL_NUM_ZERO);
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.connectionManager) this.connectionManager.disconnect();
    if (this.screen) this.screen.destroy();
  }

  /**
   * Show help information
   */
  showHelp() {
    const optionsText = [
      `  ${CLI_FLAG.HELP_SHORT}, ${CLI_FLAG.HELP}      Show this help message`,
      `  ${CLI_FLAG.VERSION_SHORT}, ${CLI_FLAG.VERSION}   Show version information`,
      `  ${CLI_FLAG.READ_ONLY}     Enable read-only mode (SELECT queries only)`,
    ].join('\n');

    const examplesText = CLI_HELP_TEXT.EXAMPLES
      .map((example) => `  ${example}`)
      .join('\n');

    console.log(this.helpOverlay?.getUsageText() || `
${CLI_HELP_TEXT.TITLE}

${CLI_HELP_TEXT.USAGE}

Options:
${optionsText}

Examples:
${examplesText}
`);
  }

  /**
   * Show version information
   */
  showVersion() {
    console.log(`${CLI_VERSION_PREFIX}${CLI_VERSION}`);
  }
}

Object.assign(AdminCLI.prototype, ADMIN_CLI_ACTION_METHODS);
