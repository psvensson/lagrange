/**
 * Admin CLI main module
 * Terminal-based curses UI for distributed database administration
 *
 * Inspired by K9s for Kubernetes, provides real-time visibility into cluster state
 * through a CDC-synchronized local cache.
 */

import {EventBus} from './core/event-bus.js';
import {StateManager} from './core/state-manager.js';
// ComponentRegistry available for advanced usage
// import {ComponentRegistry} from './core/component-registry.js';
import {ConfigManager} from './core/config-manager.js';
import {ConnectionManager} from './core/connection-manager.js';
import {RemoteCache} from './core/remote-cache.js';
import {TableMetadataComputer} from './core/table-metadata-computer.js';
import {NavigationController} from './core/navigation-controller.js';
import {CommandParser} from './core/command-parser.js';
import {HelpOverlay} from './core/help-overlay.js';
import {ErrorHandler} from './core/error-handler.js';
import {LiveQueryManager} from './core/live-query-manager.js';
import {ADMIN_CLI_ACTION_METHODS} from './admin-cli-action-methods.js';
import {ADMIN_CLI_SETUP_METHODS} from './admin-cli-setup-methods.js';
import {ADMIN_CLI_CONNECTION_METHODS} from './admin-cli-connection-methods.js';
import {ADMIN_CLI_RENDER_METHODS} from './admin-cli-render-methods.js';
import {ADMIN_CLI_NAVIGATION_METHODS} from './admin-cli-navigation-methods.js';
import {
  CLI_FLAG,
  CLI_HELP_TEXT,
  CLI_VERSION_PREFIX,
  CLI_VERSION,
  CLI_VIEW,
} from './cli-constants.js';
import {
  LOCAL_STR_YELLOW,
  LOCAL_NUM_TWO_THOUSAND,
  LOCAL_NUM_ONE,
  LOCAL_NUM_ZERO,
} from './admin-cli-local-constants.js';
import {LISTENER_PORT_DEFAULT} from '../config/listener-port-model.js';

// Re-export core components
export {EventBus} from './core/event-bus.js';
export {StateManager} from './core/state-manager.js';
export {ComponentRegistry} from './core/component-registry.js';
export {RemoteCache} from './core/remote-cache.js';
export {ConfigManager} from './core/config-manager.js';
export {ConnectionManager} from './core/connection-manager.js';

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
      process.env.LAGRANGE_NODE_ADDRESS ||
      `localhost:${LISTENER_PORT_DEFAULT.ADMIN_WEBSOCKET}`;

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
      await new Promise((resolve) => setTimeout(resolve, LOCAL_NUM_TWO_THOUSAND));
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

Object.assign(
  AdminCLI.prototype,
  ADMIN_CLI_SETUP_METHODS,
  ADMIN_CLI_CONNECTION_METHODS,
  ADMIN_CLI_RENDER_METHODS,
  ADMIN_CLI_NAVIGATION_METHODS,
  ADMIN_CLI_ACTION_METHODS,
);
