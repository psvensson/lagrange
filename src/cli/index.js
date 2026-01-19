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
import {ServicesView} from './views/services-view.js';
import {TablesView} from './views/tables-view.js';
import {PartitionsView} from './views/partitions-view.js';
import {MessageGroupsView} from './views/message-groups-view.js';
import {LogsView} from './views/logs-view.js';
import {ConfigView} from './views/config-view.js';
import {ContextsView} from './views/contexts-view.js';

import {SQLQueryView} from './sql/sql-query-view.js';

// Debug logging to file (since blessed takes over terminal)
const DEBUG_LOG = process.env.DDB_CLI_DEBUG === '1';
const debugLog = (msg) => {
  if (DEBUG_LOG) {
    fs.appendFileSync('/tmp/ddb-cli-debug.log', `${new Date().toISOString()} ${msg}\n`);
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
  'nodes': '1',
  'services': '2',
  'tables': '3',
  'partitions': '4',
  'message_groups': '5',
  'sql': '6',
  'logs': '7',
  'config': '8',
  'contexts': '9',
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
    this.currentView = 'nodes';
    this.cdcPaused = false;
    this.showingDetail = false;
    this.readOnlyMode = false;
  }

  /**
   * Start the CLI application
   * @param {string[]} args - Command line arguments
   */
  async start(args) {
    // Handle --help flag
    if (args.includes('--help') || args.includes('-h')) {
      this.showHelp();
      return;
    }

    // Handle --version flag
    if (args.includes('--version') || args.includes('-v')) {
      this.showVersion();
      return;
    }

    // Check for read-only mode
    this.readOnlyMode = args.includes('--read-only');

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
    this.updateStatus(`Connecting to ${nodeAddress}...`, 'yellow');
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
      await new Promise((resolve) => setTimeout(resolve, 2000));
      this.cleanup();
      process.exit(1);
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
  }

  /**
   * Create the blessed screen
   */
  createScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'DDB Admin CLI',
      fullUnicode: true,
      dockBorders: true,
      autoPadding: true,
    });

    this.screen.on('resize', () => this.handleResize());
  }


  /**
   * Create the UI layout
   */
  createLayout() {
    // Header bar with title and connection status
    this.headerBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      tags: true,
      border: {type: 'line'},
      style: {border: {fg: 'blue'}},
    });

    // Main content area - table display
    this.mainTable = contrib.table({
      parent: this.screen,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-6',
      keys: false,
      interactive: false,
      border: {type: 'line'},
      style: {
        border: {fg: 'blue'},
        header: {fg: 'cyan', bold: true},
        cell: {fg: 'white'},
      },
      columnSpacing: 2,
      columnWidth: [20, 20, 12, 10, 10, 10, 10],
    });

    // Status bar at bottom
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      tags: true,
      border: {type: 'line'},
      style: {border: {fg: 'blue'}},
    });

    // Help overlay (hidden by default)
    this.helpBox = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: '80%',
      hidden: true,
      tags: true,
      border: {type: 'line'},
      style: {border: {fg: 'green'}, bg: 'black'},
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
    });

    // Detail panel (hidden by default)
    this.detailPanel = blessed.box({
      parent: this.screen,
      top: 3,
      right: 0,
      width: '40%',
      height: '100%-6',
      hidden: true,
      tags: true,
      border: {type: 'line'},
      style: {border: {fg: 'magenta'}},
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
    });

    // SQL input container (hidden by default)
    this.sqlContainer = blessed.box({
      parent: this.screen,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-6',
      hidden: true,
      border: {type: 'line'},
      style: {border: {fg: 'blue'}},
    });

    // SQL query input textarea
    this.sqlInput = blessed.textarea({
      parent: this.sqlContainer,
      top: 0,
      left: 0,
      width: '100%-14',
      height: 5,
      inputOnFocus: true,
      keys: true,
      mouse: true,
      border: {type: 'line'},
      style: {
        border: {fg: 'cyan'},
        focus: {border: {fg: 'green'}},
      },
      label: ' SQL Query (Ctrl+X to execute, Esc to clear) ',
    });

    // Execute button
    this.sqlExecuteBtn = blessed.button({
      parent: this.sqlContainer,
      top: 1,
      right: 1,
      width: 12,
      height: 3,
      content: ' Execute ',
      align: 'center',
      valign: 'middle',
      mouse: true,
      keys: true,
      shrink: true,
      border: {type: 'line'},
      style: {
        fg: 'white',
        bg: 'blue',
        border: {fg: 'cyan'},
        hover: {bg: 'green'},
        focus: {bg: 'green'},
      },
    });

    // SQL results table (using contrib.table for proper formatting)
    this.sqlResultsTable = contrib.table({
      parent: this.sqlContainer,
      top: 6,
      left: 0,
      width: '60%',
      height: '100%-8',
      keys: false,
      interactive: false,
      border: {type: 'line'},
      style: {
        border: {fg: 'blue'},
        header: {fg: 'cyan', bold: true},
        cell: {fg: 'white'},
      },
      columnSpacing: 2,
      columnWidth: [15, 15, 15, 15, 15],
      label: ' Results (↑↓ navigate, Tab: detail panel) ',
    });

    // SQL detail panel for selected row
    this.sqlDetailPanel = blessed.box({
      parent: this.sqlContainer,
      top: 6,
      right: 0,
      width: '40%',
      height: '100%-8',
      tags: true,
      border: {type: 'line'},
      style: {border: {fg: 'magenta'}},
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      label: ' Row Details ',
    });

    // SQL results state
    this.sqlResultsData = [];
    this.sqlResultsColumns = [];
    this.sqlSelectedIndex = 0;

    // Legacy results box (hidden, kept for compatibility)
    this.sqlResults = blessed.box({
      parent: this.sqlContainer,
      top: 6,
      left: 0,
      width: '100%-2',
      height: '100%-8',
      hidden: true,
      tags: true,
      border: {type: 'line'},
      style: {border: {fg: 'blue'}},
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      label: ' Results ',
    });

    // Wire up SQL input events
    this.sqlInput.on('submit', () => this.executeSqlQuery());
    this.sqlInput.key(['C-x'], () => this.executeSqlQuery());
    this.sqlInput.key(['escape'], () => {
      this.sqlInput.clearValue();
      this.screen.render();
    });

    // Wire up execute button
    this.sqlExecuteBtn.on('press', () => this.executeSqlQuery());
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

    this.viewManager.registerView('nodes', new NodesView(viewOptions));
    this.viewManager.registerView('services', new ServicesView(viewOptions));
    this.viewManager.registerView('tables', new TablesView({
      ...viewOptions,
      metadataComputer: this.metadataComputer,
    }));
    this.viewManager.registerView('partitions', new PartitionsView(viewOptions));
    this.viewManager.registerView('message_groups', new MessageGroupsView(viewOptions));
    this.viewManager.registerView('logs', new LogsView(viewOptions));
    this.viewManager.registerView('config', new ConfigView(viewOptions));
    this.viewManager.registerView('contexts', new ContextsView(viewOptions));
    this.viewManager.registerView('sql', new SQLQueryView({
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

    this.screen.on('keypress', (ch, key) => {
      this.keyboardHandler.handleKey({...key, ch});
    });
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    this.eventBus.on('cache:update', () => {
      if (!this.cdcPaused) this.refreshCurrentView();
    });

    this.eventBus.on('navigation:changed', () => this.refreshCurrentView());

    this.eventBus.on('help:show', () => this.showHelpOverlay());
    this.eventBus.on('help:hide', () => this.hideHelpOverlay());

    this.eventBus.on('error', (data) => this.showError(data.message));
  }


  /**
   * Connect to the server
   * @param {string} nodeAddress - Node address to connect to
   */
  async connect(nodeAddress) {
    debugLog(`connect() called with address: ${nodeAddress}`);

    this.connectionManager.onStatusChange = (status, delay) => {
      debugLog(`onStatusChange: ${status}, delay: ${delay}`);
      if (status === 'connected') {
        this.updateStatus('Connected - Waiting for cache...', 'green');
      } else if (status === 'reconnecting') {
        this.updateStatus(`Reconnecting in ${delay}ms...`, 'yellow');
      } else if (status === 'failed') {
        this.updateStatus('Connection failed', 'red');
      } else if (status === 'disconnected') {
        this.updateStatus('Disconnected', 'red');
      }
      this.screen.render();
    };

    this.connectionManager.onCacheDump = (data) => {
      debugLog(`onCacheDump called, data keys: ${Object.keys(data || {}).join(', ')}`);

      // Load data into cache
      this.cache.loadFromDump(data);

      // Get stats to verify data was loaded
      const stats = this.cache.getStats();
      const nodeCount = stats.tableCounts.nodes || 0;
      const serviceCount = stats.tableCounts.services || 0;
      const tableCount = stats.tableCounts.tables || 0;

      debugLog(`Cache loaded: ${nodeCount} nodes, ${serviceCount} services, ${tableCount} tables`);

      // Update status with counts
      this.updateStatus(
        `Connected (${nodeCount} nodes, ${serviceCount} services, ${tableCount} tables)`,
        'green',
      );

      // Switch to nodes view and refresh
      this.switchView('nodes');
      debugLog('switchView(nodes) called');
    };

    this.connectionManager.onCDCEvent = (event) => {
      debugLog(`onCDCEvent: ${event.operation} on ${event.table}`);
      if (!this.cdcPaused) {
        const change = this.cache.applyCDCEvent(event);
        this.eventBus.emit('cache:update', change);
      }
    };

    this.connectionManager.onQueryResult = (result) => {
      debugLog(`onQueryResult: queryId=${result.queryId}`);
      this.eventBus.emit('query:result', result);
    };

    this.connectionManager.onError = (err) => {
      debugLog(`onError: ${err.message}`);
      this.showError(err.message);
    };

    debugLog('Calling connectionManager.connect()');
    await this.connectionManager.connect(nodeAddress);
    debugLog('connectionManager.connect() resolved');
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
    if (viewName === 'sql') {
      this.mainTable.hide();
      this.sqlContainer.show();
      this.sqlInput.focus();
      // Show initial instructions in results panel
      if (!this.sqlResultsData || this.sqlResultsData.length === 0) {
        this.sqlResultsTable.setData({
          headers: ['SQL Query Interface'],
          data: [
            ['Enter a query above and press Ctrl+X to execute'],
          ],
        });
        this.sqlDetailPanel.setContent(
          '{bold}{cyan-fg}SQL Query Interface{/cyan-fg}{/bold}\n\n' +
          'Enter a SQL query in the input box above and press ' +
          '{green-fg}Ctrl+X{/green-fg} or click {green-fg}Execute{/green-fg} to run.\n\n' +
          '{bold}Examples:{/bold}\n' +
          '  SELECT * FROM nodes\n' +
          '  SELECT * FROM tables\n' +
          '  SELECT * FROM partitions\n' +
          '  SELECT * FROM services\n\n' +
          '{bold}Navigation:{/bold}\n' +
          '  {cyan-fg}↑/↓{/cyan-fg}      Navigate results\n' +
          '  {cyan-fg}PgUp/PgDn{/cyan-fg} Page through results\n' +
          '  {cyan-fg}g/G{/cyan-fg}      First/Last row\n\n' +
          '{bold}Shortcuts:{/bold}\n' +
          '  {cyan-fg}Ctrl+X{/cyan-fg}   Execute query\n' +
          '  {cyan-fg}Esc{/cyan-fg}      Clear input\n' +
          '  {cyan-fg}1-9{/cyan-fg}      Switch to other views',
        );
      }
    } else {
      this.sqlContainer.hide();
      this.mainTable.show();
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
    case 'nodes':
      data = this.cache.getNodes();
      break;
    case 'services':
      data = this.cache.getServices(this.navigation.currentContext || {});
      break;
    case 'tables':
      data = this.cache.getTables().map((t) =>
        this.metadataComputer.computeMetadata(t));
      break;
    case 'partitions':
      data = this.cache.getPartitions(this.navigation.currentContext || {});
      break;
    case 'message_groups':
      data = this.cache.getMessageGroups();
      break;
    case 'logs':
      data = this.cache.getLogs(this.navigation.currentContext || {});
      break;
    case 'config':
      data = this.cache.getConfig();
      break;
    case 'contexts':
      data = this.cache.getContexts(this.navigation.currentContext || {});
      break;
    case 'sql':
      data = [];
      break;
    }

    view.setData(data);
    const renderData = view.render(this.navigation.getCurrentState());
    this.updateMainTable(renderData);
    this.updateHeader();

    if (this.showingDetail) this.updateDetailPanel();

    this.screen.render();
  }

  /**
   * Update the main table display
   * @param {Object} renderData - Render data from view
   */
  updateMainTable(renderData) {
    if (!renderData || !renderData.headers) return;

    const {headers, rows, columns, selectedIndex} = renderData;

    // Update column widths based on view columns
    if (columns && columns.length > 0) {
      const widths = columns.map((col) => col.width || 15);
      this.mainTable.options.columnWidth = widths;
    }

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

      // Apply styling to all rows for consistent width calculation
      return values.map((v) => `${color}${v}${ANSI.RESET}`);
    });

    this.mainTable.setData({headers, data: tableData});
  }

  /**
   * Execute SQL query from the SQL input
   */
  async executeSqlQuery() {
    const sql = this.sqlInput.getValue().trim();
    if (!sql) return;

    // Check read-only mode
    if (this.readOnlyMode && !/^\s*select\b/i.test(sql)) {
      this.showSqlError('Read-only mode - only SELECT queries allowed');
      return;
    }

    this.showSqlStatus('Executing query...', 'yellow');

    // Generate query ID
    const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Set up one-time result handler
    const resultHandler = (result) => {
      if (result.queryId !== queryId) return;
      this.eventBus.off('query:result', resultHandler);

      if (result.error) {
        this.showSqlError(result.error);
      } else {
        // Server sends results directly on message, not nested under 'result'
        const rows = result.results || [];
        this.displaySqlResults(rows);
      }
    };

    // Set up timeout to prevent indefinite hanging
    const timeoutId = setTimeout(() => {
      this.eventBus.off('query:result', resultHandler);
      this.showSqlError('Query timeout (30s)');
    }, 30000);

    // Wrap handler to clear timeout
    const wrappedHandler = (result) => {
      clearTimeout(timeoutId);
      resultHandler(result);
    };

    this.eventBus.on('query:result', wrappedHandler);

    // Send query
    if (this.connectionManager) {
      const sent = this.connectionManager.sendQuery(queryId, sql);
      if (!sent) {
        clearTimeout(timeoutId);
        this.eventBus.off('query:result', wrappedHandler);
        this.showSqlError('Not connected to server');
      }
    } else {
      clearTimeout(timeoutId);
      this.eventBus.off('query:result', wrappedHandler);
      this.showSqlError('Not connected to server');
    }
  }

  /**
   * Display SQL results in the table
   * @param {Array} rows - Result rows
   */
  displaySqlResults(rows) {
    if (!rows || rows.length === 0) {
      this.sqlResultsData = [];
      this.sqlResultsColumns = [];
      this.sqlSelectedIndex = 0;
      this.sqlResultsTable.setData({headers: ['Result'], data: [['No rows returned']]});
      this.sqlDetailPanel.setContent(
        '{cyan-fg}Query executed successfully.\nNo rows returned.{/cyan-fg}',
      );
      this.screen.render();
      return;
    }

    // Store results data
    this.sqlResultsData = rows;
    this.sqlResultsColumns = Object.keys(rows[0]);
    this.sqlSelectedIndex = 0;

    // Calculate column widths (max 20 chars per column, min 8)
    const colWidths = this.sqlResultsColumns.map((col) => {
      const maxLen = Math.max(
        col.length,
        ...rows.slice(0, 50).map((r) => String(r[col] ?? '').length),
      );
      return Math.min(20, Math.max(8, maxLen + 2));
    });
    this.sqlResultsTable.options.columnWidth = colWidths;

    // Update the table display
    this.updateSqlResultsTable();
    this.updateSqlDetailPanel();
    this.screen.render();
  }

  /**
   * Update the SQL results table display
   */
  updateSqlResultsTable() {
    if (!this.sqlResultsData || this.sqlResultsData.length === 0) return;

    const ANSI = {
      INVERSE: '\x1b[7m',
      WHITE: '\x1b[37m',
      RESET: '\x1b[0m',
    };

    // Truncate values for table display
    const truncate = (val, maxLen = 18) => {
      const str = String(val ?? '');
      return str.length > maxLen ? str.substring(0, maxLen - 2) + '..' : str;
    };

    const tableData = this.sqlResultsData.map((row, index) => {
      const isSelected = index === this.sqlSelectedIndex;
      const color = isSelected ? ANSI.INVERSE : ANSI.WHITE;

      return this.sqlResultsColumns.map((col) => {
        const val = truncate(row[col]);
        return `${color}${val}${ANSI.RESET}`;
      });
    });

    // Update table label with row count
    const label = ` Results: ${this.sqlResultsData.length} row(s) ` +
      `[${this.sqlSelectedIndex + 1}/${this.sqlResultsData.length}] `;
    this.sqlResultsTable.setLabel(label);

    this.sqlResultsTable.setData({
      headers: this.sqlResultsColumns,
      data: tableData,
    });
  }

  /**
   * Update the SQL detail panel with selected row
   */
  updateSqlDetailPanel() {
    if (!this.sqlResultsData || this.sqlResultsData.length === 0) {
      this.sqlDetailPanel.setContent('{cyan-fg}No data{/cyan-fg}');
      return;
    }

    const row = this.sqlResultsData[this.sqlSelectedIndex];
    if (!row) {
      this.sqlDetailPanel.setContent('{cyan-fg}No row selected{/cyan-fg}');
      return;
    }

    let content = `{bold}{cyan-fg}Row ${this.sqlSelectedIndex + 1} of ` +
      `${this.sqlResultsData.length}{/cyan-fg}{/bold}\n\n`;

    for (const col of this.sqlResultsColumns) {
      const value = row[col];
      const displayValue = value === null ? '{yellow-fg}NULL{/yellow-fg}' :
        value === undefined ? '{yellow-fg}undefined{/yellow-fg}' :
          typeof value === 'object' ? JSON.stringify(value, null, 2) :
            String(value);

      content += `{cyan-fg}${col}:{/cyan-fg}\n`;
      content += `  ${displayValue}\n\n`;
    }

    this.sqlDetailPanel.setContent(content);
  }

  /**
   * Navigate SQL results up
   * @param {number} count - Number of rows to move
   */
  sqlNavigateUp(count = 1) {
    if (!this.sqlResultsData || this.sqlResultsData.length === 0) return;
    this.sqlSelectedIndex = Math.max(0, this.sqlSelectedIndex - count);
    this.updateSqlResultsTable();
    this.updateSqlDetailPanel();
    this.screen.render();
  }

  /**
   * Navigate SQL results down
   * @param {number} count - Number of rows to move
   */
  sqlNavigateDown(count = 1) {
    if (!this.sqlResultsData || this.sqlResultsData.length === 0) return;
    this.sqlSelectedIndex = Math.min(
      this.sqlResultsData.length - 1,
      this.sqlSelectedIndex + count,
    );
    this.updateSqlResultsTable();
    this.updateSqlDetailPanel();
    this.screen.render();
  }

  /**
   * Show SQL error message
   * @param {string} message - Error message
   */
  showSqlError(message) {
    this.sqlResultsData = [];
    this.sqlResultsColumns = [];
    this.sqlResultsTable.setData({headers: ['Error'], data: [[message]]});
    this.sqlDetailPanel.setContent(`{red-fg}Error:{/red-fg}\n\n${message}`);
    this.screen.render();
  }

  /**
   * Show SQL status message
   * @param {string} message - Status message
   * @param {string} color - Message color
   */
  showSqlStatus(message, color = 'white') {
    this.sqlResultsTable.setData({headers: ['Status'], data: [[message]]});
    this.sqlDetailPanel.setContent(`{${color}-fg}${message}{/${color}-fg}`);
    this.screen.render();
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

    const content = ` {bold}DDB Admin CLI{/bold}${readOnly}  |  ` +
      `{cyan-fg}[${viewNum}]{/cyan-fg} ${viewName}  |  ` +
      `${breadcrumb}  |  ${cdcStatus}`;

    this.headerBox.setContent(content);
  }

  /**
   * Update the status bar
   * @param {string} message - Status message
   * @param {string} color - Message color
   */
  updateStatus(message, color = 'white') {
    const mode = this.keyboardHandler?.getMode() || INPUT_MODE.NORMAL;
    let hints = this.helpOverlay.getStatusBarHints(this.currentView);

    // Add SQL-specific hints when in SQL view
    if (this.currentView === 'sql') {
      hints = '{cyan-fg}Ctrl+X{/cyan-fg}:Execute  ' +
        '{cyan-fg}↑↓{/cyan-fg}:Navigate  ' +
        '{cyan-fg}Esc{/cyan-fg}:Clear  ' +
        '{cyan-fg}1-9{/cyan-fg}:Views  ' +
        '{cyan-fg}?{/cyan-fg}:Help';
    }

    let statusContent;
    if (mode === INPUT_MODE.FILTER) {
      statusContent = ' {yellow-fg}Filter:{/yellow-fg} ' +
        `${this.keyboardHandler.getInputBuffer()}_`;
    } else if (mode === INPUT_MODE.COMMAND) {
      statusContent = ` {yellow-fg}:{/yellow-fg}${this.keyboardHandler.getInputBuffer()}_`;
    } else {
      statusContent = ` {${color}-fg}${message}{/${color}-fg}  |  ${hints}`;
    }

    this.statusBar.setContent(statusContent);
    this.screen.render();
  }


  /**
   * Handle keyboard mode change
   * @param {string} mode - New input mode
   */
  handleModeChange(_mode) {
    this.updateStatus('', 'white');
    this.screen.render();
  }

  /**
   * Handle input change in filter/command mode
   * @param {string} _value - Current input value
   */
  handleInputChange(_value) {
    this.updateStatus('', 'white');
  }

  /**
   * Handle keyboard action
   * @param {Object} action - Action to perform
   */
  handleAction(action) {
    switch (action.type) {
    case 'navigate:up':
      this.navigateUp();
      break;
    case 'navigate:down':
      this.navigateDown();
      break;
    case 'navigate:pageup':
      this.navigateUp(action.count || 10);
      break;
    case 'navigate:pagedown':
      this.navigateDown(action.count || 10);
      break;
    case 'navigate:first':
      this.navigateFirst();
      break;
    case 'navigate:last':
      this.navigateLast();
      break;
    case 'navigate:select':
      this.handleSelect();
      break;
    case 'navigate:back':
      this.handleBack();
      break;
    case 'view:switch':
      this.switchView(action.view);
      break;
    case 'filter:apply':
      this.applyFilter(action.pattern);
      break;
    case 'command:execute':
      this.executeCommand(action.command, action.args);
      break;
    case 'detail:toggle':
      this.toggleDetailPanel();
      break;
    case 'cache:refresh':
      this.forceRefresh();
      break;
    case 'cdc:toggle-pause':
      this.toggleCDCPause();
      break;
    case 'help:show':
      this.showHelpOverlay();
      break;
    case 'app:quit':
    case 'app:force-quit':
      this.quit();
      break;
    }
  }

  /**
   * Navigate selection up
   * @param {number} count - Number of rows to move
   */
  navigateUp(count = 1) {
    // Handle SQL view navigation
    if (this.currentView === 'sql') {
      this.sqlNavigateUp(count);
      return;
    }

    const view = this.viewManager.getCurrentView();
    if (view) {
      view.selectUp(count);
      this.refreshCurrentView();
    }
  }

  /**
   * Navigate selection down
   * @param {number} count - Number of rows to move
   */
  navigateDown(count = 1) {
    // Handle SQL view navigation
    if (this.currentView === 'sql') {
      this.sqlNavigateDown(count);
      return;
    }

    const view = this.viewManager.getCurrentView();
    if (view) {
      view.selectDown(count);
      this.refreshCurrentView();
    }
  }

  /**
   * Navigate to first row
   */
  navigateFirst() {
    // Handle SQL view navigation
    if (this.currentView === 'sql') {
      if (this.sqlResultsData && this.sqlResultsData.length > 0) {
        this.sqlSelectedIndex = 0;
        this.updateSqlResultsTable();
        this.updateSqlDetailPanel();
        this.screen.render();
      }
      return;
    }

    const view = this.viewManager.getCurrentView();
    if (view) {
      view.selectFirst();
      this.refreshCurrentView();
    }
  }

  /**
   * Navigate to last row
   */
  navigateLast() {
    // Handle SQL view navigation
    if (this.currentView === 'sql') {
      if (this.sqlResultsData && this.sqlResultsData.length > 0) {
        this.sqlSelectedIndex = this.sqlResultsData.length - 1;
        this.updateSqlResultsTable();
        this.updateSqlDetailPanel();
        this.screen.render();
      }
      return;
    }

    const view = this.viewManager.getCurrentView();
    if (view) {
      view.selectLast();
      this.refreshCurrentView();
    }
  }

  /**
   * Handle select/enter on current row
   */
  handleSelect() {
    const view = this.viewManager.getCurrentView();
    if (!view) return;

    const result = view.handleDrillDown?.();
    if (result && result.action === 'drillDown') {
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
    case 'goto':
      if (args[0]) this.switchView(args[0]);
      break;
    case 'filter':
      this.applyFilter(args[0] || '');
      break;
    case 'refresh':
      this.forceRefresh();
      break;
    case 'sql':
      this.switchView('sql');
      break;
    case 'help':
      this.showHelpOverlay();
      break;
    case 'quit':
      this.quit();
      break;
    case 'connect':
      if (args[0]) this.reconnect(args[0]);
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
      this.mainTable.width = '60%';
      this.updateDetailPanel();
    } else {
      this.detailPanel.hide();
      this.mainTable.width = '100%';
    }

    this.screen.render();
  }

  /**
   * Update the detail panel content
   */
  updateDetailPanel() {
    const view = this.viewManager.getCurrentView();
    if (!view || !view.getSelectedDetails) {
      this.detailPanel.setContent(' No details available');
      return;
    }

    const details = view.getSelectedDetails();
    if (!details) {
      this.detailPanel.setContent(' No item selected');
      return;
    }

    let content = ` {bold}${details.title}{/bold}\n\n`;

    for (const section of details.sections || []) {
      content += `{cyan-fg}── ${section.title} ──{/cyan-fg}\n`;
      for (const field of section.fields || []) {
        content += `  ${field.label}: ${field.value}\n`;
      }
      content += '\n';
    }

    if (details.relatedCounts) {
      content += '{cyan-fg}── Related ──{/cyan-fg}\n';
      for (const [key, value] of Object.entries(details.relatedCounts)) {
        content += `  ${key}: ${value}\n`;
      }
    }

    this.detailPanel.setContent(content);
  }

  /**
   * Force refresh cache from server
   */
  forceRefresh() {
    this.updateStatus('Refreshing...', 'yellow');
    this.connectionManager.requestCacheDump?.();
  }

  /**
   * Toggle CDC pause state
   */
  toggleCDCPause() {
    this.cdcPaused = !this.cdcPaused;
    this.updateHeader();
    this.updateStatus(
      this.cdcPaused ? 'CDC updates paused' : 'CDC updates resumed',
      this.cdcPaused ? 'yellow' : 'green',
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
    this.updateStatus(`Error: ${message}`, 'red');
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
    this.updateStatus(`Reconnecting to ${address}...`, 'yellow');
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
    process.exit(0);
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
    console.log(this.helpOverlay?.getUsageText() || `
DDB Admin CLI - Terminal-based administration tool

Usage: ddb-admin [options] [node-address]

Options:
  -h, --help      Show this help message
  -v, --version   Show version information
  --read-only     Enable read-only mode (SELECT queries only)

Examples:
  ddb-admin                     Connect to localhost:8081
  ddb-admin localhost:8080      Connect to specific node
  ddb-admin --read-only         Start in read-only mode
`);
  }

  /**
   * Show version information
   */
  showVersion() {
    console.log('ddb-admin version 1.0.0');
  }
}
