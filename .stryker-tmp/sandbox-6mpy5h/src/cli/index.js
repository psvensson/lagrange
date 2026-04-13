/**
 * Admin CLI main module
 * Terminal-based curses UI for distributed database administration
 *
 * Inspired by K9s for Kubernetes, provides real-time visibility into cluster state
 * through a CDC-synchronized local cache.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import fs from 'fs';
import { EventBus } from './core/event-bus.js';
import { StateManager } from './core/state-manager.js';
// ComponentRegistry available for advanced usage
// import {ComponentRegistry} from './core/component-registry.js';
import { ConfigManager } from './core/config-manager.js';
import { ConnectionManager } from './core/connection-manager.js';
import { RemoteCache } from './core/remote-cache.js';
import { TableMetadataComputer } from './core/table-metadata-computer.js';
import { NavigationController } from './core/navigation-controller.js';
import { ViewManager } from './core/view-manager.js';
import { KeyboardHandler, INPUT_MODE } from './core/keyboard-handler.js';
import { CommandParser } from './core/command-parser.js';
import { HelpOverlay } from './core/help-overlay.js';
import { ErrorHandler } from './core/error-handler.js';
import { NodesView } from './views/nodes-view.js';
import { ReplicasView } from './views/services-view.js';
import { LogicalServicesView } from './views/logical-services-view.js';
import { TablesView } from './views/tables-view.js';
import { PartitionsView } from './views/partitions-view.js';
import { MessageGroupsView } from './views/message-groups-view.js';
import { LogsView } from './views/logs-view.js';
import { ConfigView } from './views/config-view.js';
import { ContextsView } from './views/contexts-view.js';
import { LiveQueryManager } from './core/live-query-manager.js';
import { SQLQueryView } from './sql/sql-query-view.js';
import { CLI_APP, CLI_ENV, CLI_FLAG, CLI_HELP_TEXT, CLI_PATH, CLI_VERSION_PREFIX, CLI_VERSION, CLI_VIEW } from './cli-constants.js';

// Debug logging to file (since blessed takes over terminal)
const DEBUG_LOG = stryMutAct_9fa48("45153") ? process.env[CLI_ENV.DEBUG] !== CLI_ENV.DEBUG_ENABLED_VALUE : stryMutAct_9fa48("45152") ? false : stryMutAct_9fa48("45151") ? true : (stryCov_9fa48("45151", "45152", "45153"), process.env[CLI_ENV.DEBUG] === CLI_ENV.DEBUG_ENABLED_VALUE);
const debugLog = msg => {
  if (stryMutAct_9fa48("45154")) {
    {}
  } else {
    stryCov_9fa48("45154");
    if (stryMutAct_9fa48("45156") ? false : stryMutAct_9fa48("45155") ? true : (stryCov_9fa48("45155", "45156"), DEBUG_LOG)) {
      if (stryMutAct_9fa48("45157")) {
        {}
      } else {
        stryCov_9fa48("45157");
        fs.appendFileSync(CLI_PATH.DEBUG_LOG_FILE, stryMutAct_9fa48("45158") ? `` : (stryCov_9fa48("45158"), `${new Date().toISOString()} ${msg}\n`));
      }
    }
  }
};

// Re-export core components
export { EventBus } from './core/event-bus.js';
export { StateManager } from './core/state-manager.js';
export { ComponentRegistry } from './core/component-registry.js';
export { RemoteCache } from './core/remote-cache.js';
export { ConfigManager } from './core/config-manager.js';
export { ConnectionManager } from './core/connection-manager.js';

/**
 * View name to number key mapping
 */
const VIEW_NUMBERS = stryMutAct_9fa48("45159") ? {} : (stryCov_9fa48("45159"), {
  [CLI_VIEW.NODES]: stryMutAct_9fa48("45160") ? "" : (stryCov_9fa48("45160"), '1'),
  [CLI_VIEW.REPLICAS]: stryMutAct_9fa48("45161") ? "" : (stryCov_9fa48("45161"), '2'),
  [CLI_VIEW.TABLES]: stryMutAct_9fa48("45162") ? "" : (stryCov_9fa48("45162"), '3'),
  [CLI_VIEW.PARTITIONS]: stryMutAct_9fa48("45163") ? "" : (stryCov_9fa48("45163"), '4'),
  [CLI_VIEW.MESSAGE_GROUPS]: stryMutAct_9fa48("45164") ? "" : (stryCov_9fa48("45164"), '5'),
  [CLI_VIEW.SQL]: stryMutAct_9fa48("45165") ? "" : (stryCov_9fa48("45165"), '6'),
  [CLI_VIEW.LOGS]: stryMutAct_9fa48("45166") ? "" : (stryCov_9fa48("45166"), '7'),
  [CLI_VIEW.CONFIG]: stryMutAct_9fa48("45167") ? "" : (stryCov_9fa48("45167"), '8'),
  [CLI_VIEW.CONTEXTS]: stryMutAct_9fa48("45168") ? "" : (stryCov_9fa48("45168"), '9'),
  [CLI_VIEW.SERVICES]: stryMutAct_9fa48("45169") ? "" : (stryCov_9fa48("45169"), '0')
});

/**
 * Main CLI application class
 */
export class AdminCLI {
  constructor() {
    if (stryMutAct_9fa48("45170")) {
      {}
    } else {
      stryCov_9fa48("45170");
      this.started = stryMutAct_9fa48("45171") ? true : (stryCov_9fa48("45171"), false);
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
      this.cdcPaused = stryMutAct_9fa48("45172") ? true : (stryCov_9fa48("45172"), false);
      this.showingDetail = stryMutAct_9fa48("45173") ? true : (stryCov_9fa48("45173"), false);
      this.readOnlyMode = stryMutAct_9fa48("45174") ? true : (stryCov_9fa48("45174"), false);
      this.initialCacheLoaded = stryMutAct_9fa48("45175") ? true : (stryCov_9fa48("45175"), false);
    }
  }

  /**
   * Start the CLI application
   * @param {string[]} args - Command line arguments
   */
  async start(args) {
    if (stryMutAct_9fa48("45176")) {
      {}
    } else {
      stryCov_9fa48("45176");
      // Handle --help flag
      if (stryMutAct_9fa48("45179") ? args.includes(CLI_FLAG.HELP) && args.includes(CLI_FLAG.HELP_SHORT) : stryMutAct_9fa48("45178") ? false : stryMutAct_9fa48("45177") ? true : (stryCov_9fa48("45177", "45178", "45179"), args.includes(CLI_FLAG.HELP) || args.includes(CLI_FLAG.HELP_SHORT))) {
        if (stryMutAct_9fa48("45180")) {
          {}
        } else {
          stryCov_9fa48("45180");
          this.showHelp();
          return;
        }
      }

      // Handle --version flag
      if (stryMutAct_9fa48("45183") ? args.includes(CLI_FLAG.VERSION) && args.includes(CLI_FLAG.VERSION_SHORT) : stryMutAct_9fa48("45182") ? false : stryMutAct_9fa48("45181") ? true : (stryCov_9fa48("45181", "45182", "45183"), args.includes(CLI_FLAG.VERSION) || args.includes(CLI_FLAG.VERSION_SHORT))) {
        if (stryMutAct_9fa48("45184")) {
          {}
        } else {
          stryCov_9fa48("45184");
          this.showVersion();
          return;
        }
      }

      // Check for read-only mode
      this.readOnlyMode = args.includes(CLI_FLAG.READ_ONLY);

      // Get node address from args or environment
      const nodeAddress = stryMutAct_9fa48("45187") ? (args.find(arg => !arg.startsWith('-')) || process.env.DDB_NODE_ADDRESS) && 'localhost:8081' : stryMutAct_9fa48("45186") ? false : stryMutAct_9fa48("45185") ? true : (stryCov_9fa48("45185", "45186", "45187"), (stryMutAct_9fa48("45189") ? args.find(arg => !arg.startsWith('-')) && process.env.DDB_NODE_ADDRESS : stryMutAct_9fa48("45188") ? false : (stryCov_9fa48("45188", "45189"), args.find(stryMutAct_9fa48("45190") ? () => undefined : (stryCov_9fa48("45190"), arg => stryMutAct_9fa48("45191") ? arg.startsWith('-') : (stryCov_9fa48("45191"), !(stryMutAct_9fa48("45192") ? arg.endsWith('-') : (stryCov_9fa48("45192"), arg.startsWith(stryMutAct_9fa48("45193") ? "" : (stryCov_9fa48("45193"), '-'))))))) || process.env.DDB_NODE_ADDRESS)) || (stryMutAct_9fa48("45194") ? "" : (stryCov_9fa48("45194"), 'localhost:8081')));

      // Initialize components
      this.initializeComponents();

      // Create the terminal UI
      this.createScreen();
      this.createLayout();
      this.registerViews();
      this.setupKeyboardHandling();
      this.setupEventHandlers();

      // Show connecting message
      this.updateStatus(stryMutAct_9fa48("45195") ? `` : (stryCov_9fa48("45195"), `Connecting to ${nodeAddress}...`), stryMutAct_9fa48("45196") ? "" : (stryCov_9fa48("45196"), 'yellow'));
      this.screen.render();

      // Connect to the server
      try {
        if (stryMutAct_9fa48("45197")) {
          {}
        } else {
          stryCov_9fa48("45197");
          await this.connect(nodeAddress);
          this.started = stryMutAct_9fa48("45198") ? false : (stryCov_9fa48("45198"), true);

          // Return a promise that never resolves to keep the process alive
          return new Promise(() => {});
        }
      } catch (err) {
        if (stryMutAct_9fa48("45199")) {
          {}
        } else {
          stryCov_9fa48("45199");
          this.showError(stryMutAct_9fa48("45200") ? `` : (stryCov_9fa48("45200"), `Failed to connect: ${err.message}`));
          // Give user time to see the error
          await new Promise(stryMutAct_9fa48("45201") ? () => undefined : (stryCov_9fa48("45201"), resolve => setTimeout(resolve, 2000)));
          this.cleanup();
          process.exit(1);
        }
      }
    }
  }

  /**
   * Initialize core components
   */
  initializeComponents() {
    if (stryMutAct_9fa48("45202")) {
      {}
    } else {
      stryCov_9fa48("45202");
      this.eventBus = new EventBus();
      this.stateManager = new StateManager(stryMutAct_9fa48("45203") ? {} : (stryCov_9fa48("45203"), {
        eventBus: this.eventBus
      }));
      this.configManager = new ConfigManager();
      this.cache = new RemoteCache();
      this.metadataComputer = new TableMetadataComputer(this.cache);
      this.navigation = new NavigationController(this.cache, this.eventBus);
      this.commandParser = new CommandParser();
      this.helpOverlay = new HelpOverlay(stryMutAct_9fa48("45204") ? {} : (stryCov_9fa48("45204"), {
        eventBus: this.eventBus
      }));
      this.errorHandler = new ErrorHandler(stryMutAct_9fa48("45205") ? {} : (stryCov_9fa48("45205"), {
        eventBus: this.eventBus
      }));
      this.connectionManager = new ConnectionManager();
      this.liveQueryManager = new LiveQueryManager(this.connectionManager, this.eventBus);
    }
  }

  /**
   * Create the blessed screen
   */
  createScreen() {
    if (stryMutAct_9fa48("45206")) {
      {}
    } else {
      stryCov_9fa48("45206");
      this.screen = blessed.screen(stryMutAct_9fa48("45207") ? {} : (stryCov_9fa48("45207"), {
        smartCSR: stryMutAct_9fa48("45208") ? false : (stryCov_9fa48("45208"), true),
        title: CLI_APP.NAME,
        fullUnicode: stryMutAct_9fa48("45209") ? false : (stryCov_9fa48("45209"), true),
        dockBorders: stryMutAct_9fa48("45210") ? false : (stryCov_9fa48("45210"), true),
        autoPadding: stryMutAct_9fa48("45211") ? false : (stryCov_9fa48("45211"), true)
      }));
      this.screen.on(stryMutAct_9fa48("45212") ? "" : (stryCov_9fa48("45212"), 'resize'), stryMutAct_9fa48("45213") ? () => undefined : (stryCov_9fa48("45213"), () => this.handleResize()));
    }
  }

  /**
   * Create the UI layout
   */
  createLayout() {
    if (stryMutAct_9fa48("45214")) {
      {}
    } else {
      stryCov_9fa48("45214");
      // Header bar with title and connection status
      this.headerBox = blessed.box(stryMutAct_9fa48("45215") ? {} : (stryCov_9fa48("45215"), {
        parent: this.screen,
        top: 0,
        left: 0,
        width: stryMutAct_9fa48("45216") ? "" : (stryCov_9fa48("45216"), '100%'),
        height: 3,
        tags: stryMutAct_9fa48("45217") ? false : (stryCov_9fa48("45217"), true),
        border: stryMutAct_9fa48("45218") ? {} : (stryCov_9fa48("45218"), {
          type: stryMutAct_9fa48("45219") ? "" : (stryCov_9fa48("45219"), 'line')
        }),
        style: stryMutAct_9fa48("45220") ? {} : (stryCov_9fa48("45220"), {
          border: stryMutAct_9fa48("45221") ? {} : (stryCov_9fa48("45221"), {
            fg: stryMutAct_9fa48("45222") ? "" : (stryCov_9fa48("45222"), 'blue')
          })
        })
      }));

      // Main content area - table display
      this.mainTable = contrib.table(stryMutAct_9fa48("45223") ? {} : (stryCov_9fa48("45223"), {
        parent: this.screen,
        top: 3,
        left: 0,
        width: stryMutAct_9fa48("45224") ? "" : (stryCov_9fa48("45224"), '100%'),
        height: stryMutAct_9fa48("45225") ? "" : (stryCov_9fa48("45225"), '100%-6'),
        keys: stryMutAct_9fa48("45226") ? true : (stryCov_9fa48("45226"), false),
        interactive: stryMutAct_9fa48("45227") ? true : (stryCov_9fa48("45227"), false),
        border: stryMutAct_9fa48("45228") ? {} : (stryCov_9fa48("45228"), {
          type: stryMutAct_9fa48("45229") ? "" : (stryCov_9fa48("45229"), 'line')
        }),
        style: stryMutAct_9fa48("45230") ? {} : (stryCov_9fa48("45230"), {
          border: stryMutAct_9fa48("45231") ? {} : (stryCov_9fa48("45231"), {
            fg: stryMutAct_9fa48("45232") ? "" : (stryCov_9fa48("45232"), 'blue')
          }),
          header: stryMutAct_9fa48("45233") ? {} : (stryCov_9fa48("45233"), {
            fg: stryMutAct_9fa48("45234") ? "" : (stryCov_9fa48("45234"), 'cyan'),
            bold: stryMutAct_9fa48("45235") ? false : (stryCov_9fa48("45235"), true)
          }),
          cell: stryMutAct_9fa48("45236") ? {} : (stryCov_9fa48("45236"), {
            fg: stryMutAct_9fa48("45237") ? "" : (stryCov_9fa48("45237"), 'white')
          })
        }),
        columnSpacing: 2,
        columnWidth: stryMutAct_9fa48("45238") ? [] : (stryCov_9fa48("45238"), [20, 20, 12, 10, 10, 10, 10])
      }));

      // Status bar at bottom
      this.statusBar = blessed.box(stryMutAct_9fa48("45239") ? {} : (stryCov_9fa48("45239"), {
        parent: this.screen,
        bottom: 0,
        left: 0,
        width: stryMutAct_9fa48("45240") ? "" : (stryCov_9fa48("45240"), '100%'),
        height: 3,
        tags: stryMutAct_9fa48("45241") ? false : (stryCov_9fa48("45241"), true),
        border: stryMutAct_9fa48("45242") ? {} : (stryCov_9fa48("45242"), {
          type: stryMutAct_9fa48("45243") ? "" : (stryCov_9fa48("45243"), 'line')
        }),
        style: stryMutAct_9fa48("45244") ? {} : (stryCov_9fa48("45244"), {
          border: stryMutAct_9fa48("45245") ? {} : (stryCov_9fa48("45245"), {
            fg: stryMutAct_9fa48("45246") ? "" : (stryCov_9fa48("45246"), 'blue')
          })
        })
      }));

      // Help overlay (hidden by default)
      this.helpBox = blessed.box(stryMutAct_9fa48("45247") ? {} : (stryCov_9fa48("45247"), {
        parent: this.screen,
        top: stryMutAct_9fa48("45248") ? "" : (stryCov_9fa48("45248"), 'center'),
        left: stryMutAct_9fa48("45249") ? "" : (stryCov_9fa48("45249"), 'center'),
        width: stryMutAct_9fa48("45250") ? "" : (stryCov_9fa48("45250"), '80%'),
        height: stryMutAct_9fa48("45251") ? "" : (stryCov_9fa48("45251"), '80%'),
        hidden: stryMutAct_9fa48("45252") ? false : (stryCov_9fa48("45252"), true),
        tags: stryMutAct_9fa48("45253") ? false : (stryCov_9fa48("45253"), true),
        border: stryMutAct_9fa48("45254") ? {} : (stryCov_9fa48("45254"), {
          type: stryMutAct_9fa48("45255") ? "" : (stryCov_9fa48("45255"), 'line')
        }),
        style: stryMutAct_9fa48("45256") ? {} : (stryCov_9fa48("45256"), {
          border: stryMutAct_9fa48("45257") ? {} : (stryCov_9fa48("45257"), {
            fg: stryMutAct_9fa48("45258") ? "" : (stryCov_9fa48("45258"), 'green')
          }),
          bg: stryMutAct_9fa48("45259") ? "" : (stryCov_9fa48("45259"), 'black')
        }),
        scrollable: stryMutAct_9fa48("45260") ? false : (stryCov_9fa48("45260"), true),
        alwaysScroll: stryMutAct_9fa48("45261") ? false : (stryCov_9fa48("45261"), true),
        keys: stryMutAct_9fa48("45262") ? false : (stryCov_9fa48("45262"), true),
        vi: stryMutAct_9fa48("45263") ? false : (stryCov_9fa48("45263"), true)
      }));

      // Detail panel (hidden by default)
      this.detailPanel = blessed.box(stryMutAct_9fa48("45264") ? {} : (stryCov_9fa48("45264"), {
        parent: this.screen,
        top: 3,
        right: 0,
        width: stryMutAct_9fa48("45265") ? "" : (stryCov_9fa48("45265"), '40%'),
        height: stryMutAct_9fa48("45266") ? "" : (stryCov_9fa48("45266"), '100%-6'),
        hidden: stryMutAct_9fa48("45267") ? false : (stryCov_9fa48("45267"), true),
        tags: stryMutAct_9fa48("45268") ? false : (stryCov_9fa48("45268"), true),
        border: stryMutAct_9fa48("45269") ? {} : (stryCov_9fa48("45269"), {
          type: stryMutAct_9fa48("45270") ? "" : (stryCov_9fa48("45270"), 'line')
        }),
        style: stryMutAct_9fa48("45271") ? {} : (stryCov_9fa48("45271"), {
          border: stryMutAct_9fa48("45272") ? {} : (stryCov_9fa48("45272"), {
            fg: stryMutAct_9fa48("45273") ? "" : (stryCov_9fa48("45273"), 'magenta')
          })
        }),
        scrollable: stryMutAct_9fa48("45274") ? false : (stryCov_9fa48("45274"), true),
        alwaysScroll: stryMutAct_9fa48("45275") ? false : (stryCov_9fa48("45275"), true),
        keys: stryMutAct_9fa48("45276") ? false : (stryCov_9fa48("45276"), true),
        vi: stryMutAct_9fa48("45277") ? false : (stryCov_9fa48("45277"), true)
      }));

      // SQL input container (hidden by default)
      this.sqlContainer = blessed.box(stryMutAct_9fa48("45278") ? {} : (stryCov_9fa48("45278"), {
        parent: this.screen,
        top: 3,
        left: 0,
        width: stryMutAct_9fa48("45279") ? "" : (stryCov_9fa48("45279"), '100%'),
        height: stryMutAct_9fa48("45280") ? "" : (stryCov_9fa48("45280"), '100%-6'),
        hidden: stryMutAct_9fa48("45281") ? false : (stryCov_9fa48("45281"), true),
        border: stryMutAct_9fa48("45282") ? {} : (stryCov_9fa48("45282"), {
          type: stryMutAct_9fa48("45283") ? "" : (stryCov_9fa48("45283"), 'line')
        }),
        style: stryMutAct_9fa48("45284") ? {} : (stryCov_9fa48("45284"), {
          border: stryMutAct_9fa48("45285") ? {} : (stryCov_9fa48("45285"), {
            fg: stryMutAct_9fa48("45286") ? "" : (stryCov_9fa48("45286"), 'blue')
          })
        })
      }));

      // SQL query input textarea
      this.sqlInput = blessed.textarea(stryMutAct_9fa48("45287") ? {} : (stryCov_9fa48("45287"), {
        parent: this.sqlContainer,
        top: 0,
        left: 0,
        width: stryMutAct_9fa48("45288") ? "" : (stryCov_9fa48("45288"), '100%-14'),
        height: 5,
        inputOnFocus: stryMutAct_9fa48("45289") ? false : (stryCov_9fa48("45289"), true),
        keys: stryMutAct_9fa48("45290") ? false : (stryCov_9fa48("45290"), true),
        mouse: stryMutAct_9fa48("45291") ? false : (stryCov_9fa48("45291"), true),
        border: stryMutAct_9fa48("45292") ? {} : (stryCov_9fa48("45292"), {
          type: stryMutAct_9fa48("45293") ? "" : (stryCov_9fa48("45293"), 'line')
        }),
        style: stryMutAct_9fa48("45294") ? {} : (stryCov_9fa48("45294"), {
          border: stryMutAct_9fa48("45295") ? {} : (stryCov_9fa48("45295"), {
            fg: stryMutAct_9fa48("45296") ? "" : (stryCov_9fa48("45296"), 'cyan')
          }),
          focus: stryMutAct_9fa48("45297") ? {} : (stryCov_9fa48("45297"), {
            border: stryMutAct_9fa48("45298") ? {} : (stryCov_9fa48("45298"), {
              fg: stryMutAct_9fa48("45299") ? "" : (stryCov_9fa48("45299"), 'green')
            })
          })
        }),
        label: stryMutAct_9fa48("45300") ? "" : (stryCov_9fa48("45300"), ' SQL Query (Ctrl+X to execute, Esc to clear) ')
      }));

      // Execute button
      this.sqlExecuteBtn = blessed.button(stryMutAct_9fa48("45301") ? {} : (stryCov_9fa48("45301"), {
        parent: this.sqlContainer,
        top: 1,
        right: 1,
        width: 12,
        height: 3,
        content: stryMutAct_9fa48("45302") ? "" : (stryCov_9fa48("45302"), ' Execute '),
        align: stryMutAct_9fa48("45303") ? "" : (stryCov_9fa48("45303"), 'center'),
        valign: stryMutAct_9fa48("45304") ? "" : (stryCov_9fa48("45304"), 'middle'),
        mouse: stryMutAct_9fa48("45305") ? false : (stryCov_9fa48("45305"), true),
        keys: stryMutAct_9fa48("45306") ? false : (stryCov_9fa48("45306"), true),
        shrink: stryMutAct_9fa48("45307") ? false : (stryCov_9fa48("45307"), true),
        border: stryMutAct_9fa48("45308") ? {} : (stryCov_9fa48("45308"), {
          type: stryMutAct_9fa48("45309") ? "" : (stryCov_9fa48("45309"), 'line')
        }),
        style: stryMutAct_9fa48("45310") ? {} : (stryCov_9fa48("45310"), {
          fg: stryMutAct_9fa48("45311") ? "" : (stryCov_9fa48("45311"), 'white'),
          bg: stryMutAct_9fa48("45312") ? "" : (stryCov_9fa48("45312"), 'blue'),
          border: stryMutAct_9fa48("45313") ? {} : (stryCov_9fa48("45313"), {
            fg: stryMutAct_9fa48("45314") ? "" : (stryCov_9fa48("45314"), 'cyan')
          }),
          hover: stryMutAct_9fa48("45315") ? {} : (stryCov_9fa48("45315"), {
            bg: stryMutAct_9fa48("45316") ? "" : (stryCov_9fa48("45316"), 'green')
          }),
          focus: stryMutAct_9fa48("45317") ? {} : (stryCov_9fa48("45317"), {
            bg: stryMutAct_9fa48("45318") ? "" : (stryCov_9fa48("45318"), 'green')
          })
        })
      }));

      // SQL results table (using contrib.table for proper formatting)
      this.sqlResultsTable = contrib.table(stryMutAct_9fa48("45319") ? {} : (stryCov_9fa48("45319"), {
        parent: this.sqlContainer,
        top: 6,
        left: 0,
        width: stryMutAct_9fa48("45320") ? "" : (stryCov_9fa48("45320"), '60%'),
        height: stryMutAct_9fa48("45321") ? "" : (stryCov_9fa48("45321"), '100%-8'),
        keys: stryMutAct_9fa48("45322") ? true : (stryCov_9fa48("45322"), false),
        interactive: stryMutAct_9fa48("45323") ? true : (stryCov_9fa48("45323"), false),
        border: stryMutAct_9fa48("45324") ? {} : (stryCov_9fa48("45324"), {
          type: stryMutAct_9fa48("45325") ? "" : (stryCov_9fa48("45325"), 'line')
        }),
        style: stryMutAct_9fa48("45326") ? {} : (stryCov_9fa48("45326"), {
          border: stryMutAct_9fa48("45327") ? {} : (stryCov_9fa48("45327"), {
            fg: stryMutAct_9fa48("45328") ? "" : (stryCov_9fa48("45328"), 'blue')
          }),
          header: stryMutAct_9fa48("45329") ? {} : (stryCov_9fa48("45329"), {
            fg: stryMutAct_9fa48("45330") ? "" : (stryCov_9fa48("45330"), 'cyan'),
            bold: stryMutAct_9fa48("45331") ? false : (stryCov_9fa48("45331"), true)
          }),
          cell: stryMutAct_9fa48("45332") ? {} : (stryCov_9fa48("45332"), {
            fg: stryMutAct_9fa48("45333") ? "" : (stryCov_9fa48("45333"), 'white')
          })
        }),
        columnSpacing: 2,
        columnWidth: stryMutAct_9fa48("45334") ? [] : (stryCov_9fa48("45334"), [15, 15, 15, 15, 15]),
        label: stryMutAct_9fa48("45335") ? "" : (stryCov_9fa48("45335"), ' Results (↑↓ navigate, Tab: detail panel) ')
      }));

      // SQL detail panel for selected row
      this.sqlDetailPanel = blessed.box(stryMutAct_9fa48("45336") ? {} : (stryCov_9fa48("45336"), {
        parent: this.sqlContainer,
        top: 6,
        right: 0,
        width: stryMutAct_9fa48("45337") ? "" : (stryCov_9fa48("45337"), '40%'),
        height: stryMutAct_9fa48("45338") ? "" : (stryCov_9fa48("45338"), '100%-8'),
        tags: stryMutAct_9fa48("45339") ? false : (stryCov_9fa48("45339"), true),
        border: stryMutAct_9fa48("45340") ? {} : (stryCov_9fa48("45340"), {
          type: stryMutAct_9fa48("45341") ? "" : (stryCov_9fa48("45341"), 'line')
        }),
        style: stryMutAct_9fa48("45342") ? {} : (stryCov_9fa48("45342"), {
          border: stryMutAct_9fa48("45343") ? {} : (stryCov_9fa48("45343"), {
            fg: stryMutAct_9fa48("45344") ? "" : (stryCov_9fa48("45344"), 'magenta')
          })
        }),
        scrollable: stryMutAct_9fa48("45345") ? false : (stryCov_9fa48("45345"), true),
        alwaysScroll: stryMutAct_9fa48("45346") ? false : (stryCov_9fa48("45346"), true),
        keys: stryMutAct_9fa48("45347") ? false : (stryCov_9fa48("45347"), true),
        vi: stryMutAct_9fa48("45348") ? false : (stryCov_9fa48("45348"), true),
        label: stryMutAct_9fa48("45349") ? "" : (stryCov_9fa48("45349"), ' Row Details ')
      }));

      // SQL results state
      this.sqlResultsData = stryMutAct_9fa48("45350") ? ["Stryker was here"] : (stryCov_9fa48("45350"), []);
      this.sqlResultsColumns = stryMutAct_9fa48("45351") ? ["Stryker was here"] : (stryCov_9fa48("45351"), []);
      this.sqlSelectedIndex = 0;

      // Legacy results box (hidden, kept for compatibility)
      this.sqlResults = blessed.box(stryMutAct_9fa48("45352") ? {} : (stryCov_9fa48("45352"), {
        parent: this.sqlContainer,
        top: 6,
        left: 0,
        width: stryMutAct_9fa48("45353") ? "" : (stryCov_9fa48("45353"), '100%-2'),
        height: stryMutAct_9fa48("45354") ? "" : (stryCov_9fa48("45354"), '100%-8'),
        hidden: stryMutAct_9fa48("45355") ? false : (stryCov_9fa48("45355"), true),
        tags: stryMutAct_9fa48("45356") ? false : (stryCov_9fa48("45356"), true),
        border: stryMutAct_9fa48("45357") ? {} : (stryCov_9fa48("45357"), {
          type: stryMutAct_9fa48("45358") ? "" : (stryCov_9fa48("45358"), 'line')
        }),
        style: stryMutAct_9fa48("45359") ? {} : (stryCov_9fa48("45359"), {
          border: stryMutAct_9fa48("45360") ? {} : (stryCov_9fa48("45360"), {
            fg: stryMutAct_9fa48("45361") ? "" : (stryCov_9fa48("45361"), 'blue')
          })
        }),
        scrollable: stryMutAct_9fa48("45362") ? false : (stryCov_9fa48("45362"), true),
        alwaysScroll: stryMutAct_9fa48("45363") ? false : (stryCov_9fa48("45363"), true),
        keys: stryMutAct_9fa48("45364") ? false : (stryCov_9fa48("45364"), true),
        vi: stryMutAct_9fa48("45365") ? false : (stryCov_9fa48("45365"), true),
        label: stryMutAct_9fa48("45366") ? "" : (stryCov_9fa48("45366"), ' Results ')
      }));

      // Config edit dialog (hidden by default)
      this.configEditDialog = blessed.box(stryMutAct_9fa48("45367") ? {} : (stryCov_9fa48("45367"), {
        parent: this.screen,
        top: stryMutAct_9fa48("45368") ? "" : (stryCov_9fa48("45368"), 'center'),
        left: stryMutAct_9fa48("45369") ? "" : (stryCov_9fa48("45369"), 'center'),
        width: 60,
        height: 12,
        hidden: stryMutAct_9fa48("45370") ? false : (stryCov_9fa48("45370"), true),
        tags: stryMutAct_9fa48("45371") ? false : (stryCov_9fa48("45371"), true),
        border: stryMutAct_9fa48("45372") ? {} : (stryCov_9fa48("45372"), {
          type: stryMutAct_9fa48("45373") ? "" : (stryCov_9fa48("45373"), 'line')
        }),
        style: stryMutAct_9fa48("45374") ? {} : (stryCov_9fa48("45374"), {
          border: stryMutAct_9fa48("45375") ? {} : (stryCov_9fa48("45375"), {
            fg: stryMutAct_9fa48("45376") ? "" : (stryCov_9fa48("45376"), 'green')
          }),
          bg: stryMutAct_9fa48("45377") ? "" : (stryCov_9fa48("45377"), 'black')
        }),
        label: stryMutAct_9fa48("45378") ? "" : (stryCov_9fa48("45378"), ' Edit Configuration ')
      }));
      this.configEditLabel = blessed.text(stryMutAct_9fa48("45379") ? {} : (stryCov_9fa48("45379"), {
        parent: this.configEditDialog,
        top: 1,
        left: 2,
        tags: stryMutAct_9fa48("45380") ? false : (stryCov_9fa48("45380"), true),
        content: stryMutAct_9fa48("45381") ? "Stryker was here!" : (stryCov_9fa48("45381"), '')
      }));
      this.configEditInput = blessed.textbox(stryMutAct_9fa48("45382") ? {} : (stryCov_9fa48("45382"), {
        parent: this.configEditDialog,
        top: 4,
        left: 2,
        width: stryMutAct_9fa48("45383") ? "" : (stryCov_9fa48("45383"), '100%-6'),
        height: 3,
        inputOnFocus: stryMutAct_9fa48("45384") ? false : (stryCov_9fa48("45384"), true),
        keys: stryMutAct_9fa48("45385") ? false : (stryCov_9fa48("45385"), true),
        mouse: stryMutAct_9fa48("45386") ? false : (stryCov_9fa48("45386"), true),
        border: stryMutAct_9fa48("45387") ? {} : (stryCov_9fa48("45387"), {
          type: stryMutAct_9fa48("45388") ? "" : (stryCov_9fa48("45388"), 'line')
        }),
        style: stryMutAct_9fa48("45389") ? {} : (stryCov_9fa48("45389"), {
          border: stryMutAct_9fa48("45390") ? {} : (stryCov_9fa48("45390"), {
            fg: stryMutAct_9fa48("45391") ? "" : (stryCov_9fa48("45391"), 'cyan')
          }),
          focus: stryMutAct_9fa48("45392") ? {} : (stryCov_9fa48("45392"), {
            border: stryMutAct_9fa48("45393") ? {} : (stryCov_9fa48("45393"), {
              fg: stryMutAct_9fa48("45394") ? "" : (stryCov_9fa48("45394"), 'green')
            })
          })
        })
      }));
      this.configEditHint = blessed.text(stryMutAct_9fa48("45395") ? {} : (stryCov_9fa48("45395"), {
        parent: this.configEditDialog,
        top: 8,
        left: 2,
        tags: stryMutAct_9fa48("45396") ? false : (stryCov_9fa48("45396"), true),
        content: stryMutAct_9fa48("45397") ? "" : (stryCov_9fa48("45397"), '{cyan-fg}Enter{/cyan-fg}:Save  {cyan-fg}Esc{/cyan-fg}:Cancel')
      }));

      // Config edit state
      this.configEditKey = null;
      this.configEditType = null;

      // Wire up config edit events
      this.configEditInput.key(stryMutAct_9fa48("45398") ? [] : (stryCov_9fa48("45398"), [stryMutAct_9fa48("45399") ? "" : (stryCov_9fa48("45399"), 'escape')]), () => {
        if (stryMutAct_9fa48("45400")) {
          {}
        } else {
          stryCov_9fa48("45400");
          this.hideConfigEditDialog();
        }
      });
      this.configEditInput.key(stryMutAct_9fa48("45401") ? [] : (stryCov_9fa48("45401"), [stryMutAct_9fa48("45402") ? "" : (stryCov_9fa48("45402"), 'enter')]), () => {
        if (stryMutAct_9fa48("45403")) {
          {}
        } else {
          stryCov_9fa48("45403");
          this.submitConfigEdit();
        }
      });

      // Wire up SQL input events
      this.sqlInput.on(stryMutAct_9fa48("45404") ? "" : (stryCov_9fa48("45404"), 'submit'), stryMutAct_9fa48("45405") ? () => undefined : (stryCov_9fa48("45405"), () => this.executeSqlQuery()));
      this.sqlInput.key(stryMutAct_9fa48("45406") ? [] : (stryCov_9fa48("45406"), [stryMutAct_9fa48("45407") ? "" : (stryCov_9fa48("45407"), 'C-x')]), stryMutAct_9fa48("45408") ? () => undefined : (stryCov_9fa48("45408"), () => this.executeSqlQuery()));
      this.sqlInput.key(stryMutAct_9fa48("45409") ? [] : (stryCov_9fa48("45409"), [stryMutAct_9fa48("45410") ? "" : (stryCov_9fa48("45410"), 'escape')]), () => {
        if (stryMutAct_9fa48("45411")) {
          {}
        } else {
          stryCov_9fa48("45411");
          this.sqlInput.clearValue();
          this.screen.render();
        }
      });

      // Wire up execute button
      this.sqlExecuteBtn.on(stryMutAct_9fa48("45412") ? "" : (stryCov_9fa48("45412"), 'press'), stryMutAct_9fa48("45413") ? () => undefined : (stryCov_9fa48("45413"), () => this.executeSqlQuery()));
    }
  }

  /**
   * Register all views with the view manager
   */
  registerViews() {
    if (stryMutAct_9fa48("45414")) {
      {}
    } else {
      stryCov_9fa48("45414");
      this.viewManager = new ViewManager(stryMutAct_9fa48("45415") ? {} : (stryCov_9fa48("45415"), {
        navigation: this.navigation,
        eventBus: this.eventBus,
        screen: this.screen
      }));
      const viewOptions = stryMutAct_9fa48("45416") ? {} : (stryCov_9fa48("45416"), {
        cache: this.cache,
        eventBus: this.eventBus,
        screen: this.screen
      });
      this.viewManager.registerView(stryMutAct_9fa48("45417") ? "" : (stryCov_9fa48("45417"), 'nodes'), new NodesView(viewOptions));
      this.viewManager.registerView(stryMutAct_9fa48("45418") ? "" : (stryCov_9fa48("45418"), 'services'), new LogicalServicesView(viewOptions));
      this.viewManager.registerView(stryMutAct_9fa48("45419") ? "" : (stryCov_9fa48("45419"), 'replicas'), new ReplicasView(viewOptions));
      this.viewManager.registerView(stryMutAct_9fa48("45420") ? "" : (stryCov_9fa48("45420"), 'tables'), new TablesView(stryMutAct_9fa48("45421") ? {} : (stryCov_9fa48("45421"), {
        ...viewOptions,
        metadataComputer: this.metadataComputer
      })));
      this.viewManager.registerView(stryMutAct_9fa48("45422") ? "" : (stryCov_9fa48("45422"), 'partitions'), new PartitionsView(viewOptions));
      this.viewManager.registerView(stryMutAct_9fa48("45423") ? "" : (stryCov_9fa48("45423"), 'message_groups'), new MessageGroupsView(viewOptions));
      this.viewManager.registerView(stryMutAct_9fa48("45424") ? "" : (stryCov_9fa48("45424"), 'logs'), new LogsView(stryMutAct_9fa48("45425") ? {} : (stryCov_9fa48("45425"), {
        ...viewOptions,
        connectionManager: this.connectionManager,
        liveQueryManager: this.liveQueryManager,
        liveQueryEnabled: stryMutAct_9fa48("45426") ? false : (stryCov_9fa48("45426"), true)
      })));
      this.viewManager.registerView(stryMutAct_9fa48("45427") ? "" : (stryCov_9fa48("45427"), 'config'), new ConfigView(viewOptions));
      this.viewManager.registerView(stryMutAct_9fa48("45428") ? "" : (stryCov_9fa48("45428"), 'contexts'), new ContextsView(viewOptions));
      this.viewManager.registerView(stryMutAct_9fa48("45429") ? "" : (stryCov_9fa48("45429"), 'sql'), new SQLQueryView(stryMutAct_9fa48("45430") ? {} : (stryCov_9fa48("45430"), {
        ...viewOptions,
        connectionManager: this.connectionManager,
        readOnlyMode: this.readOnlyMode
      })));
    }
  }

  /**
   * Setup keyboard handling
   */
  setupKeyboardHandling() {
    if (stryMutAct_9fa48("45431")) {
      {}
    } else {
      stryCov_9fa48("45431");
      this.keyboardHandler = new KeyboardHandler(stryMutAct_9fa48("45432") ? {} : (stryCov_9fa48("45432"), {
        eventBus: this.eventBus,
        stateManager: this.stateManager,
        navigation: this.navigation,
        commandParser: this.commandParser,
        helpOverlay: this.helpOverlay,
        onModeChange: stryMutAct_9fa48("45433") ? () => undefined : (stryCov_9fa48("45433"), mode => this.handleModeChange(mode)),
        onInputChange: stryMutAct_9fa48("45434") ? () => undefined : (stryCov_9fa48("45434"), value => this.handleInputChange(value)),
        onAction: stryMutAct_9fa48("45435") ? () => undefined : (stryCov_9fa48("45435"), action => this.handleAction(action))
      }));
      this.screen.on(stryMutAct_9fa48("45436") ? "" : (stryCov_9fa48("45436"), 'keypress'), (ch, key) => {
        if (stryMutAct_9fa48("45437")) {
          {}
        } else {
          stryCov_9fa48("45437");
          this.keyboardHandler.handleKey(stryMutAct_9fa48("45438") ? {} : (stryCov_9fa48("45438"), {
            ...key,
            ch
          }));
        }
      });
    }
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    if (stryMutAct_9fa48("45439")) {
      {}
    } else {
      stryCov_9fa48("45439");
      this.eventBus.on(stryMutAct_9fa48("45440") ? "" : (stryCov_9fa48("45440"), 'cache:update'), () => {
        if (stryMutAct_9fa48("45441")) {
          {}
        } else {
          stryCov_9fa48("45441");
          if (stryMutAct_9fa48("45444") ? this.cdcPaused && this.currentView === CLI_VIEW.LOGS : stryMutAct_9fa48("45443") ? false : stryMutAct_9fa48("45442") ? true : (stryCov_9fa48("45442", "45443", "45444"), this.cdcPaused || (stryMutAct_9fa48("45446") ? this.currentView !== CLI_VIEW.LOGS : stryMutAct_9fa48("45445") ? false : (stryCov_9fa48("45445", "45446"), this.currentView === CLI_VIEW.LOGS)))) {
            if (stryMutAct_9fa48("45447")) {
              {}
            } else {
              stryCov_9fa48("45447");
              return;
            }
          }
          this.refreshCurrentView();
        }
      });
      this.eventBus.on(stryMutAct_9fa48("45448") ? "" : (stryCov_9fa48("45448"), 'navigation:changed'), stryMutAct_9fa48("45449") ? () => undefined : (stryCov_9fa48("45449"), () => this.refreshCurrentView()));
      this.eventBus.on(stryMutAct_9fa48("45450") ? "" : (stryCov_9fa48("45450"), 'view:refresh'), (payload = {}) => {
        if (stryMutAct_9fa48("45451")) {
          {}
        } else {
          stryCov_9fa48("45451");
          const currentView = this.viewManager.getCurrentView();
          if (stryMutAct_9fa48("45454") ? false : stryMutAct_9fa48("45453") ? true : stryMutAct_9fa48("45452") ? currentView : (stryCov_9fa48("45452", "45453", "45454"), !currentView)) {
            if (stryMutAct_9fa48("45455")) {
              {}
            } else {
              stryCov_9fa48("45455");
              return;
            }
          }
          if (stryMutAct_9fa48("45458") ? payload.view || payload.view !== currentView : stryMutAct_9fa48("45457") ? false : stryMutAct_9fa48("45456") ? true : (stryCov_9fa48("45456", "45457", "45458"), payload.view && (stryMutAct_9fa48("45460") ? payload.view === currentView : stryMutAct_9fa48("45459") ? true : (stryCov_9fa48("45459", "45460"), payload.view !== currentView)))) {
            if (stryMutAct_9fa48("45461")) {
              {}
            } else {
              stryCov_9fa48("45461");
              return;
            }
          }
          this.renderCurrentView(currentView);
        }
      });
      this.eventBus.on(stryMutAct_9fa48("45462") ? "" : (stryCov_9fa48("45462"), 'help:show'), stryMutAct_9fa48("45463") ? () => undefined : (stryCov_9fa48("45463"), () => this.showHelpOverlay()));
      this.eventBus.on(stryMutAct_9fa48("45464") ? "" : (stryCov_9fa48("45464"), 'help:hide'), stryMutAct_9fa48("45465") ? () => undefined : (stryCov_9fa48("45465"), () => this.hideHelpOverlay()));
      this.eventBus.on(stryMutAct_9fa48("45466") ? "" : (stryCov_9fa48("45466"), 'error'), stryMutAct_9fa48("45467") ? () => undefined : (stryCov_9fa48("45467"), data => this.showError(data.message)));
    }
  }

  /**
   * Connect to the server
   * @param {string} nodeAddress - Node address to connect to
   */
  async connect(nodeAddress) {
    if (stryMutAct_9fa48("45468")) {
      {}
    } else {
      stryCov_9fa48("45468");
      debugLog(stryMutAct_9fa48("45469") ? `` : (stryCov_9fa48("45469"), `connect() called with address: ${nodeAddress}`));
      this.connectionManager.onStatusChange = (status, delay) => {
        if (stryMutAct_9fa48("45470")) {
          {}
        } else {
          stryCov_9fa48("45470");
          debugLog(stryMutAct_9fa48("45471") ? `` : (stryCov_9fa48("45471"), `onStatusChange: ${status}, delay: ${delay}`));
          if (stryMutAct_9fa48("45474") ? status !== 'connected' : stryMutAct_9fa48("45473") ? false : stryMutAct_9fa48("45472") ? true : (stryCov_9fa48("45472", "45473", "45474"), status === (stryMutAct_9fa48("45475") ? "" : (stryCov_9fa48("45475"), 'connected')))) {
            if (stryMutAct_9fa48("45476")) {
              {}
            } else {
              stryCov_9fa48("45476");
              this.updateStatus(stryMutAct_9fa48("45477") ? "" : (stryCov_9fa48("45477"), 'Connected - Waiting for cache...'), stryMutAct_9fa48("45478") ? "" : (stryCov_9fa48("45478"), 'green'));
            }
          } else if (stryMutAct_9fa48("45481") ? status !== 'reconnecting' : stryMutAct_9fa48("45480") ? false : stryMutAct_9fa48("45479") ? true : (stryCov_9fa48("45479", "45480", "45481"), status === (stryMutAct_9fa48("45482") ? "" : (stryCov_9fa48("45482"), 'reconnecting')))) {
            if (stryMutAct_9fa48("45483")) {
              {}
            } else {
              stryCov_9fa48("45483");
              this.updateStatus(stryMutAct_9fa48("45484") ? `` : (stryCov_9fa48("45484"), `Reconnecting in ${delay}ms...`), stryMutAct_9fa48("45485") ? "" : (stryCov_9fa48("45485"), 'yellow'));
            }
          } else if (stryMutAct_9fa48("45488") ? status !== 'failed' : stryMutAct_9fa48("45487") ? false : stryMutAct_9fa48("45486") ? true : (stryCov_9fa48("45486", "45487", "45488"), status === (stryMutAct_9fa48("45489") ? "" : (stryCov_9fa48("45489"), 'failed')))) {
            if (stryMutAct_9fa48("45490")) {
              {}
            } else {
              stryCov_9fa48("45490");
              this.updateStatus(stryMutAct_9fa48("45491") ? "" : (stryCov_9fa48("45491"), 'Connection failed'), stryMutAct_9fa48("45492") ? "" : (stryCov_9fa48("45492"), 'red'));
            }
          } else if (stryMutAct_9fa48("45495") ? status !== 'disconnected' : stryMutAct_9fa48("45494") ? false : stryMutAct_9fa48("45493") ? true : (stryCov_9fa48("45493", "45494", "45495"), status === (stryMutAct_9fa48("45496") ? "" : (stryCov_9fa48("45496"), 'disconnected')))) {
            if (stryMutAct_9fa48("45497")) {
              {}
            } else {
              stryCov_9fa48("45497");
              this.updateStatus(stryMutAct_9fa48("45498") ? "" : (stryCov_9fa48("45498"), 'Disconnected'), stryMutAct_9fa48("45499") ? "" : (stryCov_9fa48("45499"), 'red'));
            }
          }
          this.screen.render();
        }
      };
      this.connectionManager.onCacheDump = data => {
        if (stryMutAct_9fa48("45500")) {
          {}
        } else {
          stryCov_9fa48("45500");
          debugLog(stryMutAct_9fa48("45501") ? `` : (stryCov_9fa48("45501"), `onCacheDump called, data keys: ${Object.keys(stryMutAct_9fa48("45504") ? data && {} : stryMutAct_9fa48("45503") ? false : stryMutAct_9fa48("45502") ? true : (stryCov_9fa48("45502", "45503", "45504"), data || {})).join(stryMutAct_9fa48("45505") ? "" : (stryCov_9fa48("45505"), ', '))}`));

          // Load data into cache
          this.cache.loadFromDump(data);

          // Get stats to verify data was loaded
          const stats = this.cache.getStats();
          const nodeCount = stryMutAct_9fa48("45508") ? stats.tableCounts.nodes && 0 : stryMutAct_9fa48("45507") ? false : stryMutAct_9fa48("45506") ? true : (stryCov_9fa48("45506", "45507", "45508"), stats.tableCounts.nodes || 0);
          const replicaCount = stryMutAct_9fa48("45511") ? stats.tableCounts.services && 0 : stryMutAct_9fa48("45510") ? false : stryMutAct_9fa48("45509") ? true : (stryCov_9fa48("45509", "45510", "45511"), stats.tableCounts.services || 0);
          const tableCount = stryMutAct_9fa48("45514") ? stats.tableCounts.tables && 0 : stryMutAct_9fa48("45513") ? false : stryMutAct_9fa48("45512") ? true : (stryCov_9fa48("45512", "45513", "45514"), stats.tableCounts.tables || 0);
          debugLog((stryMutAct_9fa48("45515") ? `` : (stryCov_9fa48("45515"), `Cache loaded: ${nodeCount} nodes, ${replicaCount} replicas, `)) + (stryMutAct_9fa48("45516") ? `` : (stryCov_9fa48("45516"), `${tableCount} tables`)));

          // Update status with counts
          this.updateStatus(stryMutAct_9fa48("45517") ? `` : (stryCov_9fa48("45517"), `Connected (${nodeCount} nodes, ${replicaCount} replicas, ${tableCount} tables)`), stryMutAct_9fa48("45518") ? "" : (stryCov_9fa48("45518"), 'green'));

          // Only switch to nodes view on initial connection, not on refresh
          if (stryMutAct_9fa48("45521") ? false : stryMutAct_9fa48("45520") ? true : stryMutAct_9fa48("45519") ? this.initialCacheLoaded : (stryCov_9fa48("45519", "45520", "45521"), !this.initialCacheLoaded)) {
            if (stryMutAct_9fa48("45522")) {
              {}
            } else {
              stryCov_9fa48("45522");
              this.initialCacheLoaded = stryMutAct_9fa48("45523") ? false : (stryCov_9fa48("45523"), true);
              this.switchView(stryMutAct_9fa48("45524") ? "" : (stryCov_9fa48("45524"), 'nodes'));
              debugLog(stryMutAct_9fa48("45525") ? "" : (stryCov_9fa48("45525"), 'switchView(nodes) called - initial load'));
            }
          } else {
            if (stryMutAct_9fa48("45526")) {
              {}
            } else {
              stryCov_9fa48("45526");
              // Just refresh the current view
              this.refreshCurrentView();
              debugLog(stryMutAct_9fa48("45527") ? "" : (stryCov_9fa48("45527"), 'refreshCurrentView() called - cache refresh'));
            }
          }
        }
      };
      this.connectionManager.onCDCEvent = event => {
        if (stryMutAct_9fa48("45528")) {
          {}
        } else {
          stryCov_9fa48("45528");
          debugLog(stryMutAct_9fa48("45529") ? `` : (stryCov_9fa48("45529"), `onCDCEvent: ${event.operation} on ${event.table}`));
          if (stryMutAct_9fa48("45532") ? false : stryMutAct_9fa48("45531") ? true : stryMutAct_9fa48("45530") ? this.cdcPaused : (stryCov_9fa48("45530", "45531", "45532"), !this.cdcPaused)) {
            if (stryMutAct_9fa48("45533")) {
              {}
            } else {
              stryCov_9fa48("45533");
              const change = this.cache.applyCDCEvent(event);
              this.eventBus.emit(stryMutAct_9fa48("45534") ? "" : (stryCov_9fa48("45534"), 'cache:update'), change);
            }
          }
        }
      };
      this.connectionManager.onQueryResult = result => {
        if (stryMutAct_9fa48("45535")) {
          {}
        } else {
          stryCov_9fa48("45535");
          debugLog(stryMutAct_9fa48("45536") ? `` : (stryCov_9fa48("45536"), `onQueryResult: queryId=${result.queryId}`));
          this.eventBus.emit(stryMutAct_9fa48("45537") ? "" : (stryCov_9fa48("45537"), 'query:result'), result);
        }
      };
      this.connectionManager.onLiveQueryEvent = message => {
        if (stryMutAct_9fa48("45538")) {
          {}
        } else {
          stryCov_9fa48("45538");
          debugLog(stryMutAct_9fa48("45539") ? `` : (stryCov_9fa48("45539"), `onLiveQueryEvent: subscriptionId=${message.subscriptionId}`));
          if (stryMutAct_9fa48("45541") ? false : stryMutAct_9fa48("45540") ? true : (stryCov_9fa48("45540", "45541"), this.liveQueryManager)) {
            if (stryMutAct_9fa48("45542")) {
              {}
            } else {
              stryCov_9fa48("45542");
              this.liveQueryManager.handleLiveQueryEvent(message);
            }
          }
        }
      };
      this.connectionManager.onError = err => {
        if (stryMutAct_9fa48("45543")) {
          {}
        } else {
          stryCov_9fa48("45543");
          debugLog(stryMutAct_9fa48("45544") ? `` : (stryCov_9fa48("45544"), `onError: ${err.message}`));
          this.showError(err.message);
        }
      };
      debugLog(stryMutAct_9fa48("45545") ? "" : (stryCov_9fa48("45545"), 'Calling connectionManager.connect()'));
      await this.connectionManager.connect(nodeAddress);
      debugLog(stryMutAct_9fa48("45546") ? "" : (stryCov_9fa48("45546"), 'connectionManager.connect() resolved'));
    }
  }

  /**
   * Switch to a different view
   * @param {string} viewName - Name of view to switch to
   */
  switchView(viewName) {
    if (stryMutAct_9fa48("45547")) {
      {}
    } else {
      stryCov_9fa48("45547");
      if (stryMutAct_9fa48("45550") ? false : stryMutAct_9fa48("45549") ? true : stryMutAct_9fa48("45548") ? this.viewManager.hasView(viewName) : (stryCov_9fa48("45548", "45549", "45550"), !this.viewManager.hasView(viewName))) return;
      this.currentView = viewName;
      this.navigation.goToView(viewName);
      this.viewManager.switchView(viewName);

      // Show/hide SQL container based on view
      if (stryMutAct_9fa48("45553") ? viewName !== 'sql' : stryMutAct_9fa48("45552") ? false : stryMutAct_9fa48("45551") ? true : (stryCov_9fa48("45551", "45552", "45553"), viewName === (stryMutAct_9fa48("45554") ? "" : (stryCov_9fa48("45554"), 'sql')))) {
        if (stryMutAct_9fa48("45555")) {
          {}
        } else {
          stryCov_9fa48("45555");
          this.mainTable.hide();
          this.sqlContainer.show();
          this.detailPanel.hide();
          this.showingDetail = stryMutAct_9fa48("45556") ? true : (stryCov_9fa48("45556"), false);
          this.sqlInput.focus();
          // Show initial instructions in results panel
          if (stryMutAct_9fa48("45559") ? !this.sqlResultsData && this.sqlResultsData.length === 0 : stryMutAct_9fa48("45558") ? false : stryMutAct_9fa48("45557") ? true : (stryCov_9fa48("45557", "45558", "45559"), (stryMutAct_9fa48("45560") ? this.sqlResultsData : (stryCov_9fa48("45560"), !this.sqlResultsData)) || (stryMutAct_9fa48("45562") ? this.sqlResultsData.length !== 0 : stryMutAct_9fa48("45561") ? false : (stryCov_9fa48("45561", "45562"), this.sqlResultsData.length === 0)))) {
            if (stryMutAct_9fa48("45563")) {
              {}
            } else {
              stryCov_9fa48("45563");
              this.sqlResultsTable.setData(stryMutAct_9fa48("45564") ? {} : (stryCov_9fa48("45564"), {
                headers: stryMutAct_9fa48("45565") ? [] : (stryCov_9fa48("45565"), [stryMutAct_9fa48("45566") ? "" : (stryCov_9fa48("45566"), 'SQL Query Interface')]),
                data: stryMutAct_9fa48("45567") ? [] : (stryCov_9fa48("45567"), [stryMutAct_9fa48("45568") ? [] : (stryCov_9fa48("45568"), [stryMutAct_9fa48("45569") ? "" : (stryCov_9fa48("45569"), 'Enter a query above and press Ctrl+X to execute')])])
              }));
              this.sqlDetailPanel.setContent((stryMutAct_9fa48("45570") ? "" : (stryCov_9fa48("45570"), '{bold}{cyan-fg}SQL Query Interface{/cyan-fg}{/bold}\n\n')) + (stryMutAct_9fa48("45571") ? "" : (stryCov_9fa48("45571"), 'Enter a SQL query in the input box above and press ')) + (stryMutAct_9fa48("45572") ? "" : (stryCov_9fa48("45572"), '{green-fg}Ctrl+X{/green-fg} or click {green-fg}Execute{/green-fg} to run.\n\n')) + (stryMutAct_9fa48("45573") ? "" : (stryCov_9fa48("45573"), '{bold}Examples:{/bold}\n')) + (stryMutAct_9fa48("45574") ? "" : (stryCov_9fa48("45574"), '  SELECT * FROM nodes\n')) + (stryMutAct_9fa48("45575") ? "" : (stryCov_9fa48("45575"), '  SELECT * FROM tables\n')) + (stryMutAct_9fa48("45576") ? "" : (stryCov_9fa48("45576"), '  SELECT * FROM partitions\n')) + (stryMutAct_9fa48("45577") ? "" : (stryCov_9fa48("45577"), '  SELECT * FROM services\n\n')) + (stryMutAct_9fa48("45578") ? "" : (stryCov_9fa48("45578"), '{bold}Navigation:{/bold}\n')) + (stryMutAct_9fa48("45579") ? "" : (stryCov_9fa48("45579"), '  {cyan-fg}↑/↓{/cyan-fg}      Navigate results\n')) + (stryMutAct_9fa48("45580") ? "" : (stryCov_9fa48("45580"), '  {cyan-fg}PgUp/PgDn{/cyan-fg} Page through results\n')) + (stryMutAct_9fa48("45581") ? "" : (stryCov_9fa48("45581"), '  {cyan-fg}g/G{/cyan-fg}      First/Last row\n\n')) + (stryMutAct_9fa48("45582") ? "" : (stryCov_9fa48("45582"), '{bold}Shortcuts:{/bold}\n')) + (stryMutAct_9fa48("45583") ? "" : (stryCov_9fa48("45583"), '  {cyan-fg}Ctrl+X{/cyan-fg}   Execute query\n')) + (stryMutAct_9fa48("45584") ? "" : (stryCov_9fa48("45584"), '  {cyan-fg}Esc{/cyan-fg}      Clear input\n')) + (stryMutAct_9fa48("45585") ? "" : (stryCov_9fa48("45585"), '  {cyan-fg}0-9{/cyan-fg}      Switch to other views')));
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("45586")) {
          {}
        } else {
          stryCov_9fa48("45586");
          this.sqlContainer.hide();
          this.mainTable.show();

          // Services and replicas views always show detail panel.
          if (stryMutAct_9fa48("45589") ? viewName === 'services' && viewName === 'replicas' : stryMutAct_9fa48("45588") ? false : stryMutAct_9fa48("45587") ? true : (stryCov_9fa48("45587", "45588", "45589"), (stryMutAct_9fa48("45591") ? viewName !== 'services' : stryMutAct_9fa48("45590") ? false : (stryCov_9fa48("45590", "45591"), viewName === (stryMutAct_9fa48("45592") ? "" : (stryCov_9fa48("45592"), 'services')))) || (stryMutAct_9fa48("45594") ? viewName !== 'replicas' : stryMutAct_9fa48("45593") ? false : (stryCov_9fa48("45593", "45594"), viewName === (stryMutAct_9fa48("45595") ? "" : (stryCov_9fa48("45595"), 'replicas')))))) {
            if (stryMutAct_9fa48("45596")) {
              {}
            } else {
              stryCov_9fa48("45596");
              this.showingDetail = stryMutAct_9fa48("45597") ? false : (stryCov_9fa48("45597"), true);
              this.detailPanel.show();
              this.mainTable.width = stryMutAct_9fa48("45598") ? "" : (stryCov_9fa48("45598"), '60%');
            }
          } else {
            if (stryMutAct_9fa48("45599")) {
              {}
            } else {
              stryCov_9fa48("45599");
              // Other views hide detail panel by default (can toggle with 'd')
              this.showingDetail = stryMutAct_9fa48("45600") ? true : (stryCov_9fa48("45600"), false);
              this.detailPanel.hide();
              this.mainTable.width = stryMutAct_9fa48("45601") ? "" : (stryCov_9fa48("45601"), '100%');
            }
          }
        }
      }
      this.refreshCurrentView();
    }
  }

  /**
   * Refresh the current view with latest data
   */
  refreshCurrentView() {
    if (stryMutAct_9fa48("45602")) {
      {}
    } else {
      stryCov_9fa48("45602");
      const view = this.viewManager.getCurrentView();
      if (stryMutAct_9fa48("45605") ? false : stryMutAct_9fa48("45604") ? true : stryMutAct_9fa48("45603") ? view : (stryCov_9fa48("45603", "45604", "45605"), !view)) return;
      let data = stryMutAct_9fa48("45606") ? ["Stryker was here"] : (stryCov_9fa48("45606"), []);
      switch (this.currentView) {
        case stryMutAct_9fa48("45608") ? "" : (stryCov_9fa48("45608"), 'nodes'):
          if (stryMutAct_9fa48("45607")) {} else {
            stryCov_9fa48("45607");
            data = this.cache.getNodes();
            break;
          }
        case stryMutAct_9fa48("45610") ? "" : (stryCov_9fa48("45610"), 'services'):
          if (stryMutAct_9fa48("45609")) {} else {
            stryCov_9fa48("45609");
            data = this.cache.getLogicalServices(stryMutAct_9fa48("45613") ? this.navigation.currentContext && {} : stryMutAct_9fa48("45612") ? false : stryMutAct_9fa48("45611") ? true : (stryCov_9fa48("45611", "45612", "45613"), this.navigation.currentContext || {}));
            break;
          }
        case stryMutAct_9fa48("45615") ? "" : (stryCov_9fa48("45615"), 'replicas'):
          if (stryMutAct_9fa48("45614")) {} else {
            stryCov_9fa48("45614");
            data = this.cache.getServices(stryMutAct_9fa48("45618") ? this.navigation.currentContext && {} : stryMutAct_9fa48("45617") ? false : stryMutAct_9fa48("45616") ? true : (stryCov_9fa48("45616", "45617", "45618"), this.navigation.currentContext || {}));
            break;
          }
        case stryMutAct_9fa48("45620") ? "" : (stryCov_9fa48("45620"), 'tables'):
          if (stryMutAct_9fa48("45619")) {} else {
            stryCov_9fa48("45619");
            data = this.cache.getTables().map(stryMutAct_9fa48("45621") ? () => undefined : (stryCov_9fa48("45621"), t => this.metadataComputer.computeMetadata(t)));
            break;
          }
        case stryMutAct_9fa48("45623") ? "" : (stryCov_9fa48("45623"), 'partitions'):
          if (stryMutAct_9fa48("45622")) {} else {
            stryCov_9fa48("45622");
            data = this.cache.getPartitions(stryMutAct_9fa48("45626") ? this.navigation.currentContext && {} : stryMutAct_9fa48("45625") ? false : stryMutAct_9fa48("45624") ? true : (stryCov_9fa48("45624", "45625", "45626"), this.navigation.currentContext || {}));
            break;
          }
        case stryMutAct_9fa48("45628") ? "" : (stryCov_9fa48("45628"), 'message_groups'):
          if (stryMutAct_9fa48("45627")) {} else {
            stryCov_9fa48("45627");
            data = this.cache.getMessageGroups();
            break;
          }
        case stryMutAct_9fa48("45630") ? "" : (stryCov_9fa48("45630"), 'logs'):
          if (stryMutAct_9fa48("45629")) {} else {
            stryCov_9fa48("45629");
            // Logs are maintained by live query subscriptions owned by LogsView.
            this.renderCurrentView(view);
            return;
          }
        case stryMutAct_9fa48("45632") ? "" : (stryCov_9fa48("45632"), 'config'):
          if (stryMutAct_9fa48("45631")) {} else {
            stryCov_9fa48("45631");
            data = this.cache.getConfig();
            break;
          }
        case stryMutAct_9fa48("45634") ? "" : (stryCov_9fa48("45634"), 'contexts'):
          if (stryMutAct_9fa48("45633")) {} else {
            stryCov_9fa48("45633");
            data = this.cache.getContexts(stryMutAct_9fa48("45637") ? this.navigation.currentContext && {} : stryMutAct_9fa48("45636") ? false : stryMutAct_9fa48("45635") ? true : (stryCov_9fa48("45635", "45636", "45637"), this.navigation.currentContext || {}));
            break;
          }
        case stryMutAct_9fa48("45639") ? "" : (stryCov_9fa48("45639"), 'sql'):
          if (stryMutAct_9fa48("45638")) {} else {
            stryCov_9fa48("45638");
            data = stryMutAct_9fa48("45640") ? ["Stryker was here"] : (stryCov_9fa48("45640"), []);
            break;
          }
      }
      view.setData(data);
      this.renderCurrentView(view);
    }
  }

  /**
   * Render the active view without triggering data fetches.
   * @param {Object} view - View instance to render
   */
  renderCurrentView(view) {
    if (stryMutAct_9fa48("45641")) {
      {}
    } else {
      stryCov_9fa48("45641");
      if (stryMutAct_9fa48("45644") ? false : stryMutAct_9fa48("45643") ? true : stryMutAct_9fa48("45642") ? view : (stryCov_9fa48("45642", "45643", "45644"), !view)) return;
      const renderData = view.render(this.navigation.getCurrentState());
      this.updateMainTable(renderData);
      this.updateHeader();
      if (stryMutAct_9fa48("45646") ? false : stryMutAct_9fa48("45645") ? true : (stryCov_9fa48("45645", "45646"), this.showingDetail)) {
        if (stryMutAct_9fa48("45647")) {
          {}
        } else {
          stryCov_9fa48("45647");
          this.updateDetailPanel();
        }
      }
      this.screen.render();
    }
  }

  /**
   * Update the main table display
   * @param {Object} renderData - Render data from view
   */
  updateMainTable(renderData) {
    if (stryMutAct_9fa48("45648")) {
      {}
    } else {
      stryCov_9fa48("45648");
      if (stryMutAct_9fa48("45651") ? !renderData && !renderData.headers : stryMutAct_9fa48("45650") ? false : stryMutAct_9fa48("45649") ? true : (stryCov_9fa48("45649", "45650", "45651"), (stryMutAct_9fa48("45652") ? renderData : (stryCov_9fa48("45652"), !renderData)) || (stryMutAct_9fa48("45653") ? renderData.headers : (stryCov_9fa48("45653"), !renderData.headers)))) return;
      const {
        headers,
        rows,
        columns,
        selectedIndex
      } = renderData;

      // Calculate available width for the table
      // Account for borders (2 chars) and whether detail panel is shown
      const screenWidth = stryMutAct_9fa48("45656") ? this.screen.width && 80 : stryMutAct_9fa48("45655") ? false : stryMutAct_9fa48("45654") ? true : (stryCov_9fa48("45654", "45655", "45656"), this.screen.width || 80);
      const tableWidthPercent = this.showingDetail ? 0.6 : 1.0;
      const availableWidth = stryMutAct_9fa48("45657") ? Math.floor(screenWidth * tableWidthPercent) + 4 : (stryCov_9fa48("45657"), Math.floor(stryMutAct_9fa48("45658") ? screenWidth / tableWidthPercent : (stryCov_9fa48("45658"), screenWidth * tableWidthPercent)) - 4); // borders + padding

      // Calculate column widths
      let widths = stryMutAct_9fa48("45659") ? ["Stryker was here"] : (stryCov_9fa48("45659"), []);
      if (stryMutAct_9fa48("45662") ? columns || columns.length > 0 : stryMutAct_9fa48("45661") ? false : stryMutAct_9fa48("45660") ? true : (stryCov_9fa48("45660", "45661", "45662"), columns && (stryMutAct_9fa48("45665") ? columns.length <= 0 : stryMutAct_9fa48("45664") ? columns.length >= 0 : stryMutAct_9fa48("45663") ? true : (stryCov_9fa48("45663", "45664", "45665"), columns.length > 0)))) {
        if (stryMutAct_9fa48("45666")) {
          {}
        } else {
          stryCov_9fa48("45666");
          const totalDefinedWidth = columns.reduce(stryMutAct_9fa48("45667") ? () => undefined : (stryCov_9fa48("45667"), (sum, col) => stryMutAct_9fa48("45668") ? sum - (col.width || 15) : (stryCov_9fa48("45668"), sum + (stryMutAct_9fa48("45671") ? col.width && 15 : stryMutAct_9fa48("45670") ? false : stryMutAct_9fa48("45669") ? true : (stryCov_9fa48("45669", "45670", "45671"), col.width || 15)))), 0);
          const columnSpacing = stryMutAct_9fa48("45672") ? (columns.length - 1) / 2 : (stryCov_9fa48("45672"), (stryMutAct_9fa48("45673") ? columns.length + 1 : (stryCov_9fa48("45673"), columns.length - 1)) * 2); // 2 chars spacing between columns
          const contentWidth = stryMutAct_9fa48("45674") ? availableWidth + columnSpacing : (stryCov_9fa48("45674"), availableWidth - columnSpacing);

          // Scale column widths proportionally to fit available space
          widths = columns.map(col => {
            if (stryMutAct_9fa48("45675")) {
              {}
            } else {
              stryCov_9fa48("45675");
              const baseWidth = stryMutAct_9fa48("45678") ? col.width && 15 : stryMutAct_9fa48("45677") ? false : stryMutAct_9fa48("45676") ? true : (stryCov_9fa48("45676", "45677", "45678"), col.width || 15);
              const scaledWidth = Math.floor(stryMutAct_9fa48("45679") ? baseWidth / totalDefinedWidth / contentWidth : (stryCov_9fa48("45679"), (stryMutAct_9fa48("45680") ? baseWidth * totalDefinedWidth : (stryCov_9fa48("45680"), baseWidth / totalDefinedWidth)) * contentWidth));
              return stryMutAct_9fa48("45681") ? Math.min(8, scaledWidth) : (stryCov_9fa48("45681"), Math.max(8, scaledWidth)); // minimum 8 chars per column
            }
          });
          this.mainTable.options.columnWidth = widths;
        }
      }

      // Helper to truncate value to fit column width
      const truncate = (value, maxWidth) => {
        if (stryMutAct_9fa48("45682")) {
          {}
        } else {
          stryCov_9fa48("45682");
          const str = String(stryMutAct_9fa48("45685") ? value && '' : stryMutAct_9fa48("45684") ? false : stryMutAct_9fa48("45683") ? true : (stryCov_9fa48("45683", "45684", "45685"), value || (stryMutAct_9fa48("45686") ? "Stryker was here!" : (stryCov_9fa48("45686"), ''))));
          if (stryMutAct_9fa48("45690") ? str.length > maxWidth : stryMutAct_9fa48("45689") ? str.length < maxWidth : stryMutAct_9fa48("45688") ? false : stryMutAct_9fa48("45687") ? true : (stryCov_9fa48("45687", "45688", "45689", "45690"), str.length <= maxWidth)) return str;
          if (stryMutAct_9fa48("45694") ? maxWidth > 3 : stryMutAct_9fa48("45693") ? maxWidth < 3 : stryMutAct_9fa48("45692") ? false : stryMutAct_9fa48("45691") ? true : (stryCov_9fa48("45691", "45692", "45693", "45694"), maxWidth <= 3)) return stryMutAct_9fa48("45695") ? str : (stryCov_9fa48("45695"), str.substring(0, maxWidth));
          return (stryMutAct_9fa48("45696") ? str : (stryCov_9fa48("45696"), str.substring(0, stryMutAct_9fa48("45697") ? maxWidth + 2 : (stryCov_9fa48("45697"), maxWidth - 2)))) + (stryMutAct_9fa48("45698") ? "" : (stryCov_9fa48("45698"), '..'));
        }
      };

      // ANSI escape codes for styling (blessed-contrib table doesn't support blessed tags)
      // We apply styling to ALL rows to ensure consistent column width calculations
      const ANSI = stryMutAct_9fa48("45699") ? {} : (stryCov_9fa48("45699"), {
        INVERSE: stryMutAct_9fa48("45700") ? "" : (stryCov_9fa48("45700"), '\x1b[7m'),
        CYAN: stryMutAct_9fa48("45701") ? "" : (stryCov_9fa48("45701"), '\x1b[36m'),
        RED: stryMutAct_9fa48("45702") ? "" : (stryCov_9fa48("45702"), '\x1b[31m'),
        YELLOW: stryMutAct_9fa48("45703") ? "" : (stryCov_9fa48("45703"), '\x1b[33m'),
        WHITE: stryMutAct_9fa48("45704") ? "" : (stryCov_9fa48("45704"), '\x1b[37m'),
        RESET: stryMutAct_9fa48("45705") ? "" : (stryCov_9fa48("45705"), '\x1b[0m')
      });
      const tableData = rows.map((row, index) => {
        if (stryMutAct_9fa48("45706")) {
          {}
        } else {
          stryCov_9fa48("45706");
          const values = stryMutAct_9fa48("45709") ? row.values && [] : stryMutAct_9fa48("45708") ? false : stryMutAct_9fa48("45707") ? true : (stryCov_9fa48("45707", "45708", "45709"), row.values || (stryMutAct_9fa48("45710") ? ["Stryker was here"] : (stryCov_9fa48("45710"), [])));
          let color = ANSI.WHITE;
          if (stryMutAct_9fa48("45713") ? index !== selectedIndex : stryMutAct_9fa48("45712") ? false : stryMutAct_9fa48("45711") ? true : (stryCov_9fa48("45711", "45712", "45713"), index === selectedIndex)) {
            if (stryMutAct_9fa48("45714")) {
              {}
            } else {
              stryCov_9fa48("45714");
              color = ANSI.INVERSE;
            }
          } else if (stryMutAct_9fa48("45716") ? false : stryMutAct_9fa48("45715") ? true : (stryCov_9fa48("45715", "45716"), row.isChanged)) {
            if (stryMutAct_9fa48("45717")) {
              {}
            } else {
              stryCov_9fa48("45717");
              color = ANSI.CYAN;
            }
          } else if (stryMutAct_9fa48("45720") ? row.status !== 'error' : stryMutAct_9fa48("45719") ? false : stryMutAct_9fa48("45718") ? true : (stryCov_9fa48("45718", "45719", "45720"), row.status === (stryMutAct_9fa48("45721") ? "" : (stryCov_9fa48("45721"), 'error')))) {
            if (stryMutAct_9fa48("45722")) {
              {}
            } else {
              stryCov_9fa48("45722");
              color = ANSI.RED;
            }
          } else if (stryMutAct_9fa48("45725") ? row.status !== 'warning' : stryMutAct_9fa48("45724") ? false : stryMutAct_9fa48("45723") ? true : (stryCov_9fa48("45723", "45724", "45725"), row.status === (stryMutAct_9fa48("45726") ? "" : (stryCov_9fa48("45726"), 'warning')))) {
            if (stryMutAct_9fa48("45727")) {
              {}
            } else {
              stryCov_9fa48("45727");
              color = ANSI.YELLOW;
            }
          }

          // Truncate values to fit column widths and apply styling
          return values.map((v, colIndex) => {
            if (stryMutAct_9fa48("45728")) {
              {}
            } else {
              stryCov_9fa48("45728");
              const maxWidth = stryMutAct_9fa48("45731") ? widths[colIndex] && 15 : stryMutAct_9fa48("45730") ? false : stryMutAct_9fa48("45729") ? true : (stryCov_9fa48("45729", "45730", "45731"), widths[colIndex] || 15);
              const truncated = truncate(v, maxWidth);
              return stryMutAct_9fa48("45732") ? `` : (stryCov_9fa48("45732"), `${color}${truncated}${ANSI.RESET}`);
            }
          });
        }
      });
      this.mainTable.setData(stryMutAct_9fa48("45733") ? {} : (stryCov_9fa48("45733"), {
        headers,
        data: tableData
      }));
    }
  }

  /**
   * Execute SQL query from the SQL input
   */
  async executeSqlQuery() {
    if (stryMutAct_9fa48("45734")) {
      {}
    } else {
      stryCov_9fa48("45734");
      const sql = stryMutAct_9fa48("45735") ? this.sqlInput.getValue() : (stryCov_9fa48("45735"), this.sqlInput.getValue().trim());
      if (stryMutAct_9fa48("45738") ? false : stryMutAct_9fa48("45737") ? true : stryMutAct_9fa48("45736") ? sql : (stryCov_9fa48("45736", "45737", "45738"), !sql)) return;

      // Check read-only mode
      if (stryMutAct_9fa48("45741") ? this.readOnlyMode || !/^\s*select\b/i.test(sql) : stryMutAct_9fa48("45740") ? false : stryMutAct_9fa48("45739") ? true : (stryCov_9fa48("45739", "45740", "45741"), this.readOnlyMode && (stryMutAct_9fa48("45742") ? /^\s*select\b/i.test(sql) : (stryCov_9fa48("45742"), !(stryMutAct_9fa48("45745") ? /^\S*select\b/i : stryMutAct_9fa48("45744") ? /^\sselect\b/i : stryMutAct_9fa48("45743") ? /\s*select\b/i : (stryCov_9fa48("45743", "45744", "45745"), /^\s*select\b/i)).test(sql))))) {
        if (stryMutAct_9fa48("45746")) {
          {}
        } else {
          stryCov_9fa48("45746");
          this.showSqlError(stryMutAct_9fa48("45747") ? "" : (stryCov_9fa48("45747"), 'Read-only mode - only SELECT queries allowed'));
          return;
        }
      }
      this.showSqlStatus(stryMutAct_9fa48("45748") ? "" : (stryCov_9fa48("45748"), 'Executing query...'), stryMutAct_9fa48("45749") ? "" : (stryCov_9fa48("45749"), 'yellow'));

      // Generate query ID
      const queryId = stryMutAct_9fa48("45750") ? `` : (stryCov_9fa48("45750"), `query_${Date.now()}_${stryMutAct_9fa48("45751") ? Math.random().toString(36) : (stryCov_9fa48("45751"), Math.random().toString(36).substr(2, 9))}`);

      // Set up one-time result handler
      const resultHandler = result => {
        if (stryMutAct_9fa48("45752")) {
          {}
        } else {
          stryCov_9fa48("45752");
          if (stryMutAct_9fa48("45755") ? result.queryId === queryId : stryMutAct_9fa48("45754") ? false : stryMutAct_9fa48("45753") ? true : (stryCov_9fa48("45753", "45754", "45755"), result.queryId !== queryId)) return;
          this.eventBus.off(stryMutAct_9fa48("45756") ? "" : (stryCov_9fa48("45756"), 'query:result'), resultHandler);
          if (stryMutAct_9fa48("45758") ? false : stryMutAct_9fa48("45757") ? true : (stryCov_9fa48("45757", "45758"), result.error)) {
            if (stryMutAct_9fa48("45759")) {
              {}
            } else {
              stryCov_9fa48("45759");
              this.showSqlError(result.error);
            }
          } else {
            if (stryMutAct_9fa48("45760")) {
              {}
            } else {
              stryCov_9fa48("45760");
              // Server sends results directly on message, not nested under 'result'
              const rows = stryMutAct_9fa48("45763") ? result.results && [] : stryMutAct_9fa48("45762") ? false : stryMutAct_9fa48("45761") ? true : (stryCov_9fa48("45761", "45762", "45763"), result.results || (stryMutAct_9fa48("45764") ? ["Stryker was here"] : (stryCov_9fa48("45764"), [])));
              this.displaySqlResults(rows);
            }
          }
        }
      };

      // Set up timeout to prevent indefinite hanging
      const timeoutId = setTimeout(() => {
        if (stryMutAct_9fa48("45765")) {
          {}
        } else {
          stryCov_9fa48("45765");
          this.eventBus.off(stryMutAct_9fa48("45766") ? "" : (stryCov_9fa48("45766"), 'query:result'), resultHandler);
          this.showSqlError(stryMutAct_9fa48("45767") ? "" : (stryCov_9fa48("45767"), 'Query timeout (30s)'));
        }
      }, 30000);

      // Wrap handler to clear timeout
      const wrappedHandler = result => {
        if (stryMutAct_9fa48("45768")) {
          {}
        } else {
          stryCov_9fa48("45768");
          clearTimeout(timeoutId);
          resultHandler(result);
        }
      };
      this.eventBus.on(stryMutAct_9fa48("45769") ? "" : (stryCov_9fa48("45769"), 'query:result'), wrappedHandler);

      // Send query
      if (stryMutAct_9fa48("45771") ? false : stryMutAct_9fa48("45770") ? true : (stryCov_9fa48("45770", "45771"), this.connectionManager)) {
        if (stryMutAct_9fa48("45772")) {
          {}
        } else {
          stryCov_9fa48("45772");
          const sent = this.connectionManager.sendQuery(queryId, sql);
          if (stryMutAct_9fa48("45775") ? false : stryMutAct_9fa48("45774") ? true : stryMutAct_9fa48("45773") ? sent : (stryCov_9fa48("45773", "45774", "45775"), !sent)) {
            if (stryMutAct_9fa48("45776")) {
              {}
            } else {
              stryCov_9fa48("45776");
              clearTimeout(timeoutId);
              this.eventBus.off(stryMutAct_9fa48("45777") ? "" : (stryCov_9fa48("45777"), 'query:result'), wrappedHandler);
              this.showSqlError(stryMutAct_9fa48("45778") ? "" : (stryCov_9fa48("45778"), 'Not connected to server'));
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("45779")) {
          {}
        } else {
          stryCov_9fa48("45779");
          clearTimeout(timeoutId);
          this.eventBus.off(stryMutAct_9fa48("45780") ? "" : (stryCov_9fa48("45780"), 'query:result'), wrappedHandler);
          this.showSqlError(stryMutAct_9fa48("45781") ? "" : (stryCov_9fa48("45781"), 'Not connected to server'));
        }
      }
    }
  }

  /**
   * Display SQL results in the table
   * @param {Array} rows - Result rows
   */
  displaySqlResults(rows) {
    if (stryMutAct_9fa48("45782")) {
      {}
    } else {
      stryCov_9fa48("45782");
      if (stryMutAct_9fa48("45785") ? !rows && rows.length === 0 : stryMutAct_9fa48("45784") ? false : stryMutAct_9fa48("45783") ? true : (stryCov_9fa48("45783", "45784", "45785"), (stryMutAct_9fa48("45786") ? rows : (stryCov_9fa48("45786"), !rows)) || (stryMutAct_9fa48("45788") ? rows.length !== 0 : stryMutAct_9fa48("45787") ? false : (stryCov_9fa48("45787", "45788"), rows.length === 0)))) {
        if (stryMutAct_9fa48("45789")) {
          {}
        } else {
          stryCov_9fa48("45789");
          this.sqlResultsData = stryMutAct_9fa48("45790") ? ["Stryker was here"] : (stryCov_9fa48("45790"), []);
          this.sqlResultsColumns = stryMutAct_9fa48("45791") ? ["Stryker was here"] : (stryCov_9fa48("45791"), []);
          this.sqlSelectedIndex = 0;
          this.sqlResultsTable.setData(stryMutAct_9fa48("45792") ? {} : (stryCov_9fa48("45792"), {
            headers: stryMutAct_9fa48("45793") ? [] : (stryCov_9fa48("45793"), [stryMutAct_9fa48("45794") ? "" : (stryCov_9fa48("45794"), 'Result')]),
            data: stryMutAct_9fa48("45795") ? [] : (stryCov_9fa48("45795"), [stryMutAct_9fa48("45796") ? [] : (stryCov_9fa48("45796"), [stryMutAct_9fa48("45797") ? "" : (stryCov_9fa48("45797"), 'No rows returned')])])
          }));
          this.sqlDetailPanel.setContent(stryMutAct_9fa48("45798") ? "" : (stryCov_9fa48("45798"), '{cyan-fg}Query executed successfully.\nNo rows returned.{/cyan-fg}'));
          this.screen.render();
          return;
        }
      }

      // Store results data
      this.sqlResultsData = rows;
      this.sqlResultsColumns = Object.keys(rows[0]);
      this.sqlSelectedIndex = 0;

      // Calculate column widths (max 20 chars per column, min 8)
      const colWidths = this.sqlResultsColumns.map(col => {
        if (stryMutAct_9fa48("45799")) {
          {}
        } else {
          stryCov_9fa48("45799");
          const maxLen = stryMutAct_9fa48("45800") ? Math.min(col.length, ...rows.slice(0, 50).map(r => String(r[col] ?? '').length)) : (stryCov_9fa48("45800"), Math.max(col.length, ...(stryMutAct_9fa48("45801") ? rows.map(r => String(r[col] ?? '').length) : (stryCov_9fa48("45801"), rows.slice(0, 50).map(stryMutAct_9fa48("45802") ? () => undefined : (stryCov_9fa48("45802"), r => String(stryMutAct_9fa48("45803") ? r[col] && '' : (stryCov_9fa48("45803"), r[col] ?? (stryMutAct_9fa48("45804") ? "Stryker was here!" : (stryCov_9fa48("45804"), '')))).length))))));
          return stryMutAct_9fa48("45805") ? Math.max(20, Math.max(8, maxLen + 2)) : (stryCov_9fa48("45805"), Math.min(20, stryMutAct_9fa48("45806") ? Math.min(8, maxLen + 2) : (stryCov_9fa48("45806"), Math.max(8, stryMutAct_9fa48("45807") ? maxLen - 2 : (stryCov_9fa48("45807"), maxLen + 2)))));
        }
      });
      this.sqlResultsTable.options.columnWidth = colWidths;

      // Update the table display
      this.updateSqlResultsTable();
      this.updateSqlDetailPanel();
      this.screen.render();
    }
  }

  /**
   * Update the SQL results table display
   */
  updateSqlResultsTable() {
    if (stryMutAct_9fa48("45808")) {
      {}
    } else {
      stryCov_9fa48("45808");
      if (stryMutAct_9fa48("45811") ? !this.sqlResultsData && this.sqlResultsData.length === 0 : stryMutAct_9fa48("45810") ? false : stryMutAct_9fa48("45809") ? true : (stryCov_9fa48("45809", "45810", "45811"), (stryMutAct_9fa48("45812") ? this.sqlResultsData : (stryCov_9fa48("45812"), !this.sqlResultsData)) || (stryMutAct_9fa48("45814") ? this.sqlResultsData.length !== 0 : stryMutAct_9fa48("45813") ? false : (stryCov_9fa48("45813", "45814"), this.sqlResultsData.length === 0)))) return;
      const ANSI = stryMutAct_9fa48("45815") ? {} : (stryCov_9fa48("45815"), {
        INVERSE: stryMutAct_9fa48("45816") ? "" : (stryCov_9fa48("45816"), '\x1b[7m'),
        WHITE: stryMutAct_9fa48("45817") ? "" : (stryCov_9fa48("45817"), '\x1b[37m'),
        RESET: stryMutAct_9fa48("45818") ? "" : (stryCov_9fa48("45818"), '\x1b[0m')
      });

      // Truncate values for table display
      const truncate = (val, maxLen = 18) => {
        if (stryMutAct_9fa48("45819")) {
          {}
        } else {
          stryCov_9fa48("45819");
          const str = String(stryMutAct_9fa48("45820") ? val && '' : (stryCov_9fa48("45820"), val ?? (stryMutAct_9fa48("45821") ? "Stryker was here!" : (stryCov_9fa48("45821"), ''))));
          return (stryMutAct_9fa48("45825") ? str.length <= maxLen : stryMutAct_9fa48("45824") ? str.length >= maxLen : stryMutAct_9fa48("45823") ? false : stryMutAct_9fa48("45822") ? true : (stryCov_9fa48("45822", "45823", "45824", "45825"), str.length > maxLen)) ? (stryMutAct_9fa48("45826") ? str : (stryCov_9fa48("45826"), str.substring(0, stryMutAct_9fa48("45827") ? maxLen + 2 : (stryCov_9fa48("45827"), maxLen - 2)))) + (stryMutAct_9fa48("45828") ? "" : (stryCov_9fa48("45828"), '..')) : str;
        }
      };
      const tableData = this.sqlResultsData.map((row, index) => {
        if (stryMutAct_9fa48("45829")) {
          {}
        } else {
          stryCov_9fa48("45829");
          const isSelected = stryMutAct_9fa48("45832") ? index !== this.sqlSelectedIndex : stryMutAct_9fa48("45831") ? false : stryMutAct_9fa48("45830") ? true : (stryCov_9fa48("45830", "45831", "45832"), index === this.sqlSelectedIndex);
          const color = isSelected ? ANSI.INVERSE : ANSI.WHITE;
          return this.sqlResultsColumns.map(col => {
            if (stryMutAct_9fa48("45833")) {
              {}
            } else {
              stryCov_9fa48("45833");
              const val = truncate(row[col]);
              return stryMutAct_9fa48("45834") ? `` : (stryCov_9fa48("45834"), `${color}${val}${ANSI.RESET}`);
            }
          });
        }
      });

      // Update table label with row count
      const label = (stryMutAct_9fa48("45835") ? `` : (stryCov_9fa48("45835"), ` Results: ${this.sqlResultsData.length} row(s) `)) + (stryMutAct_9fa48("45836") ? `` : (stryCov_9fa48("45836"), `[${stryMutAct_9fa48("45837") ? this.sqlSelectedIndex - 1 : (stryCov_9fa48("45837"), this.sqlSelectedIndex + 1)}/${this.sqlResultsData.length}] `));
      this.sqlResultsTable.setLabel(label);
      this.sqlResultsTable.setData(stryMutAct_9fa48("45838") ? {} : (stryCov_9fa48("45838"), {
        headers: this.sqlResultsColumns,
        data: tableData
      }));
    }
  }

  /**
   * Update the SQL detail panel with selected row
   */
  updateSqlDetailPanel() {
    if (stryMutAct_9fa48("45839")) {
      {}
    } else {
      stryCov_9fa48("45839");
      if (stryMutAct_9fa48("45842") ? !this.sqlResultsData && this.sqlResultsData.length === 0 : stryMutAct_9fa48("45841") ? false : stryMutAct_9fa48("45840") ? true : (stryCov_9fa48("45840", "45841", "45842"), (stryMutAct_9fa48("45843") ? this.sqlResultsData : (stryCov_9fa48("45843"), !this.sqlResultsData)) || (stryMutAct_9fa48("45845") ? this.sqlResultsData.length !== 0 : stryMutAct_9fa48("45844") ? false : (stryCov_9fa48("45844", "45845"), this.sqlResultsData.length === 0)))) {
        if (stryMutAct_9fa48("45846")) {
          {}
        } else {
          stryCov_9fa48("45846");
          this.sqlDetailPanel.setContent(stryMutAct_9fa48("45847") ? "" : (stryCov_9fa48("45847"), '{cyan-fg}No data{/cyan-fg}'));
          return;
        }
      }
      const row = this.sqlResultsData[this.sqlSelectedIndex];
      if (stryMutAct_9fa48("45850") ? false : stryMutAct_9fa48("45849") ? true : stryMutAct_9fa48("45848") ? row : (stryCov_9fa48("45848", "45849", "45850"), !row)) {
        if (stryMutAct_9fa48("45851")) {
          {}
        } else {
          stryCov_9fa48("45851");
          this.sqlDetailPanel.setContent(stryMutAct_9fa48("45852") ? "" : (stryCov_9fa48("45852"), '{cyan-fg}No row selected{/cyan-fg}'));
          return;
        }
      }
      let content = (stryMutAct_9fa48("45853") ? `` : (stryCov_9fa48("45853"), `{bold}{cyan-fg}Row ${stryMutAct_9fa48("45854") ? this.sqlSelectedIndex - 1 : (stryCov_9fa48("45854"), this.sqlSelectedIndex + 1)} of `)) + (stryMutAct_9fa48("45855") ? `` : (stryCov_9fa48("45855"), `${this.sqlResultsData.length}{/cyan-fg}{/bold}\n\n`));
      for (const col of this.sqlResultsColumns) {
        if (stryMutAct_9fa48("45856")) {
          {}
        } else {
          stryCov_9fa48("45856");
          const value = row[col];
          const displayValue = (stryMutAct_9fa48("45859") ? value !== null : stryMutAct_9fa48("45858") ? false : stryMutAct_9fa48("45857") ? true : (stryCov_9fa48("45857", "45858", "45859"), value === null)) ? stryMutAct_9fa48("45860") ? "" : (stryCov_9fa48("45860"), '{yellow-fg}NULL{/yellow-fg}') : (stryMutAct_9fa48("45863") ? value !== undefined : stryMutAct_9fa48("45862") ? false : stryMutAct_9fa48("45861") ? true : (stryCov_9fa48("45861", "45862", "45863"), value === undefined)) ? stryMutAct_9fa48("45864") ? "" : (stryCov_9fa48("45864"), '{yellow-fg}undefined{/yellow-fg}') : (stryMutAct_9fa48("45867") ? typeof value !== 'object' : stryMutAct_9fa48("45866") ? false : stryMutAct_9fa48("45865") ? true : (stryCov_9fa48("45865", "45866", "45867"), typeof value === (stryMutAct_9fa48("45868") ? "" : (stryCov_9fa48("45868"), 'object')))) ? JSON.stringify(value, null, 2) : String(value);
          content += stryMutAct_9fa48("45869") ? `` : (stryCov_9fa48("45869"), `{cyan-fg}${col}:{/cyan-fg}\n`);
          content += stryMutAct_9fa48("45870") ? `` : (stryCov_9fa48("45870"), `  ${displayValue}\n\n`);
        }
      }
      this.sqlDetailPanel.setContent(content);
    }
  }

  /**
   * Navigate SQL results up
   * @param {number} count - Number of rows to move
   */
  sqlNavigateUp(count = 1) {
    if (stryMutAct_9fa48("45871")) {
      {}
    } else {
      stryCov_9fa48("45871");
      if (stryMutAct_9fa48("45874") ? !this.sqlResultsData && this.sqlResultsData.length === 0 : stryMutAct_9fa48("45873") ? false : stryMutAct_9fa48("45872") ? true : (stryCov_9fa48("45872", "45873", "45874"), (stryMutAct_9fa48("45875") ? this.sqlResultsData : (stryCov_9fa48("45875"), !this.sqlResultsData)) || (stryMutAct_9fa48("45877") ? this.sqlResultsData.length !== 0 : stryMutAct_9fa48("45876") ? false : (stryCov_9fa48("45876", "45877"), this.sqlResultsData.length === 0)))) return;
      this.sqlSelectedIndex = stryMutAct_9fa48("45878") ? Math.min(0, this.sqlSelectedIndex - count) : (stryCov_9fa48("45878"), Math.max(0, stryMutAct_9fa48("45879") ? this.sqlSelectedIndex + count : (stryCov_9fa48("45879"), this.sqlSelectedIndex - count)));
      this.updateSqlResultsTable();
      this.updateSqlDetailPanel();
      this.screen.render();
    }
  }

  /**
   * Navigate SQL results down
   * @param {number} count - Number of rows to move
   */
  sqlNavigateDown(count = 1) {
    if (stryMutAct_9fa48("45880")) {
      {}
    } else {
      stryCov_9fa48("45880");
      if (stryMutAct_9fa48("45883") ? !this.sqlResultsData && this.sqlResultsData.length === 0 : stryMutAct_9fa48("45882") ? false : stryMutAct_9fa48("45881") ? true : (stryCov_9fa48("45881", "45882", "45883"), (stryMutAct_9fa48("45884") ? this.sqlResultsData : (stryCov_9fa48("45884"), !this.sqlResultsData)) || (stryMutAct_9fa48("45886") ? this.sqlResultsData.length !== 0 : stryMutAct_9fa48("45885") ? false : (stryCov_9fa48("45885", "45886"), this.sqlResultsData.length === 0)))) return;
      this.sqlSelectedIndex = stryMutAct_9fa48("45887") ? Math.max(this.sqlResultsData.length - 1, this.sqlSelectedIndex + count) : (stryCov_9fa48("45887"), Math.min(stryMutAct_9fa48("45888") ? this.sqlResultsData.length + 1 : (stryCov_9fa48("45888"), this.sqlResultsData.length - 1), stryMutAct_9fa48("45889") ? this.sqlSelectedIndex - count : (stryCov_9fa48("45889"), this.sqlSelectedIndex + count)));
      this.updateSqlResultsTable();
      this.updateSqlDetailPanel();
      this.screen.render();
    }
  }

  /**
   * Show SQL error message
   * @param {string} message - Error message
   */
  showSqlError(message) {
    if (stryMutAct_9fa48("45890")) {
      {}
    } else {
      stryCov_9fa48("45890");
      this.sqlResultsData = stryMutAct_9fa48("45891") ? ["Stryker was here"] : (stryCov_9fa48("45891"), []);
      this.sqlResultsColumns = stryMutAct_9fa48("45892") ? ["Stryker was here"] : (stryCov_9fa48("45892"), []);
      this.sqlResultsTable.setData(stryMutAct_9fa48("45893") ? {} : (stryCov_9fa48("45893"), {
        headers: stryMutAct_9fa48("45894") ? [] : (stryCov_9fa48("45894"), [stryMutAct_9fa48("45895") ? "" : (stryCov_9fa48("45895"), 'Error')]),
        data: stryMutAct_9fa48("45896") ? [] : (stryCov_9fa48("45896"), [stryMutAct_9fa48("45897") ? [] : (stryCov_9fa48("45897"), [message])])
      }));
      this.sqlDetailPanel.setContent(stryMutAct_9fa48("45898") ? `` : (stryCov_9fa48("45898"), `{red-fg}Error:{/red-fg}\n\n${message}`));
      this.screen.render();
    }
  }

  /**
   * Show SQL status message
   * @param {string} message - Status message
   * @param {string} color - Message color
   */
  showSqlStatus(message, color = stryMutAct_9fa48("45899") ? "" : (stryCov_9fa48("45899"), 'white')) {
    if (stryMutAct_9fa48("45900")) {
      {}
    } else {
      stryCov_9fa48("45900");
      this.sqlResultsTable.setData(stryMutAct_9fa48("45901") ? {} : (stryCov_9fa48("45901"), {
        headers: stryMutAct_9fa48("45902") ? [] : (stryCov_9fa48("45902"), [stryMutAct_9fa48("45903") ? "" : (stryCov_9fa48("45903"), 'Status')]),
        data: stryMutAct_9fa48("45904") ? [] : (stryCov_9fa48("45904"), [stryMutAct_9fa48("45905") ? [] : (stryCov_9fa48("45905"), [message])])
      }));
      this.sqlDetailPanel.setContent(stryMutAct_9fa48("45906") ? `` : (stryCov_9fa48("45906"), `{${color}-fg}${message}{/${color}-fg}`));
      this.screen.render();
    }
  }

  /**
   * Handle config edit request
   */
  handleConfigEdit() {
    if (stryMutAct_9fa48("45907")) {
      {}
    } else {
      stryCov_9fa48("45907");
      if (stryMutAct_9fa48("45910") ? this.currentView === 'config' : stryMutAct_9fa48("45909") ? false : stryMutAct_9fa48("45908") ? true : (stryCov_9fa48("45908", "45909", "45910"), this.currentView !== (stryMutAct_9fa48("45911") ? "" : (stryCov_9fa48("45911"), 'config')))) {
        if (stryMutAct_9fa48("45912")) {
          {}
        } else {
          stryCov_9fa48("45912");
          return;
        }
      }
      if (stryMutAct_9fa48("45914") ? false : stryMutAct_9fa48("45913") ? true : (stryCov_9fa48("45913", "45914"), this.readOnlyMode)) {
        if (stryMutAct_9fa48("45915")) {
          {}
        } else {
          stryCov_9fa48("45915");
          this.showError(stryMutAct_9fa48("45916") ? "" : (stryCov_9fa48("45916"), 'Read-only mode - editing disabled'));
          return;
        }
      }
      const view = this.viewManager.getCurrentView();
      if (stryMutAct_9fa48("45919") ? false : stryMutAct_9fa48("45918") ? true : stryMutAct_9fa48("45917") ? view : (stryCov_9fa48("45917", "45918", "45919"), !view)) return;
      const result = stryMutAct_9fa48("45920") ? view.handleEditRequest() : (stryCov_9fa48("45920"), view.handleEditRequest?.());
      if (stryMutAct_9fa48("45923") ? false : stryMutAct_9fa48("45922") ? true : stryMutAct_9fa48("45921") ? result : (stryCov_9fa48("45921", "45922", "45923"), !result)) return;
      if (stryMutAct_9fa48("45926") ? result.action !== 'showError' : stryMutAct_9fa48("45925") ? false : stryMutAct_9fa48("45924") ? true : (stryCov_9fa48("45924", "45925", "45926"), result.action === (stryMutAct_9fa48("45927") ? "" : (stryCov_9fa48("45927"), 'showError')))) {
        if (stryMutAct_9fa48("45928")) {
          {}
        } else {
          stryCov_9fa48("45928");
          this.showError(result.message);
          return;
        }
      }
      if (stryMutAct_9fa48("45931") ? result.action !== 'editConfig' : stryMutAct_9fa48("45930") ? false : stryMutAct_9fa48("45929") ? true : (stryCov_9fa48("45929", "45930", "45931"), result.action === (stryMutAct_9fa48("45932") ? "" : (stryCov_9fa48("45932"), 'editConfig')))) {
        if (stryMutAct_9fa48("45933")) {
          {}
        } else {
          stryCov_9fa48("45933");
          this.showConfigEditDialog(result.config);
        }
      }
    }
  }

  /**
   * Handle config revert request
   */
  handleConfigRevert() {
    if (stryMutAct_9fa48("45934")) {
      {}
    } else {
      stryCov_9fa48("45934");
      if (stryMutAct_9fa48("45937") ? this.currentView === 'config' : stryMutAct_9fa48("45936") ? false : stryMutAct_9fa48("45935") ? true : (stryCov_9fa48("45935", "45936", "45937"), this.currentView !== (stryMutAct_9fa48("45938") ? "" : (stryCov_9fa48("45938"), 'config')))) {
        if (stryMutAct_9fa48("45939")) {
          {}
        } else {
          stryCov_9fa48("45939");
          return;
        }
      }
      if (stryMutAct_9fa48("45941") ? false : stryMutAct_9fa48("45940") ? true : (stryCov_9fa48("45940", "45941"), this.readOnlyMode)) {
        if (stryMutAct_9fa48("45942")) {
          {}
        } else {
          stryCov_9fa48("45942");
          this.showError(stryMutAct_9fa48("45943") ? "" : (stryCov_9fa48("45943"), 'Read-only mode - editing disabled'));
          return;
        }
      }
      const view = this.viewManager.getCurrentView();
      if (stryMutAct_9fa48("45946") ? false : stryMutAct_9fa48("45945") ? true : stryMutAct_9fa48("45944") ? view : (stryCov_9fa48("45944", "45945", "45946"), !view)) return;
      const result = stryMutAct_9fa48("45947") ? view.handleRevertRequest() : (stryCov_9fa48("45947"), view.handleRevertRequest?.());
      if (stryMutAct_9fa48("45950") ? false : stryMutAct_9fa48("45949") ? true : stryMutAct_9fa48("45948") ? result : (stryCov_9fa48("45948", "45949", "45950"), !result)) return;
      if (stryMutAct_9fa48("45953") ? result.action !== 'showError' : stryMutAct_9fa48("45952") ? false : stryMutAct_9fa48("45951") ? true : (stryCov_9fa48("45951", "45952", "45953"), result.action === (stryMutAct_9fa48("45954") ? "" : (stryCov_9fa48("45954"), 'showError')))) {
        if (stryMutAct_9fa48("45955")) {
          {}
        } else {
          stryCov_9fa48("45955");
          this.showError(result.message);
          return;
        }
      }
      if (stryMutAct_9fa48("45958") ? result.action !== 'revertConfig' : stryMutAct_9fa48("45957") ? false : stryMutAct_9fa48("45956") ? true : (stryCov_9fa48("45956", "45957", "45958"), result.action === (stryMutAct_9fa48("45959") ? "" : (stryCov_9fa48("45959"), 'revertConfig')))) {
        if (stryMutAct_9fa48("45960")) {
          {}
        } else {
          stryCov_9fa48("45960");
          // Execute revert via SQL UPDATE
          const config = result.config;
          const defaultValue = config.default_value;
          this.executeConfigUpdate(config.config_key, defaultValue, config.value_type);
        }
      }
    }
  }

  /**
   * Show config edit dialog
   * @param {Object} config - Config entry to edit
   */
  showConfigEditDialog(config) {
    if (stryMutAct_9fa48("45961")) {
      {}
    } else {
      stryCov_9fa48("45961");
      this.configEditKey = config.config_key;
      this.configEditType = stryMutAct_9fa48("45964") ? config.value_type && 'string' : stryMutAct_9fa48("45963") ? false : stryMutAct_9fa48("45962") ? true : (stryCov_9fa48("45962", "45963", "45964"), config.value_type || (stryMutAct_9fa48("45965") ? "" : (stryCov_9fa48("45965"), 'string')));
      const typeHint = (stryMutAct_9fa48("45968") ? this.configEditType !== 'boolean' : stryMutAct_9fa48("45967") ? false : stryMutAct_9fa48("45966") ? true : (stryCov_9fa48("45966", "45967", "45968"), this.configEditType === (stryMutAct_9fa48("45969") ? "" : (stryCov_9fa48("45969"), 'boolean')))) ? stryMutAct_9fa48("45970") ? "" : (stryCov_9fa48("45970"), ' (true/false)') : (stryMutAct_9fa48("45973") ? this.configEditType !== 'number' : stryMutAct_9fa48("45972") ? false : stryMutAct_9fa48("45971") ? true : (stryCov_9fa48("45971", "45972", "45973"), this.configEditType === (stryMutAct_9fa48("45974") ? "" : (stryCov_9fa48("45974"), 'number')))) ? stryMutAct_9fa48("45975") ? "" : (stryCov_9fa48("45975"), ' (number)') : (stryMutAct_9fa48("45978") ? this.configEditType !== 'json' : stryMutAct_9fa48("45977") ? false : stryMutAct_9fa48("45976") ? true : (stryCov_9fa48("45976", "45977", "45978"), this.configEditType === (stryMutAct_9fa48("45979") ? "" : (stryCov_9fa48("45979"), 'json')))) ? stryMutAct_9fa48("45980") ? "" : (stryCov_9fa48("45980"), ' (JSON)') : stryMutAct_9fa48("45981") ? "Stryker was here!" : (stryCov_9fa48("45981"), '');
      this.configEditLabel.setContent((stryMutAct_9fa48("45982") ? `` : (stryCov_9fa48("45982"), `{cyan-fg}Key:{/cyan-fg} ${config.config_key}\n`)) + (stryMutAct_9fa48("45983") ? `` : (stryCov_9fa48("45983"), `{cyan-fg}Type:{/cyan-fg} ${this.configEditType}${typeHint}`)));

      // Set current value in input
      const currentValue = (stryMutAct_9fa48("45986") ? config.config_value !== null || config.config_value !== undefined : stryMutAct_9fa48("45985") ? false : stryMutAct_9fa48("45984") ? true : (stryCov_9fa48("45984", "45985", "45986"), (stryMutAct_9fa48("45988") ? config.config_value === null : stryMutAct_9fa48("45987") ? true : (stryCov_9fa48("45987", "45988"), config.config_value !== null)) && (stryMutAct_9fa48("45990") ? config.config_value === undefined : stryMutAct_9fa48("45989") ? true : (stryCov_9fa48("45989", "45990"), config.config_value !== undefined)))) ? String(config.config_value) : stryMutAct_9fa48("45991") ? "Stryker was here!" : (stryCov_9fa48("45991"), '');
      this.configEditInput.setValue(currentValue);
      this.configEditDialog.show();
      this.configEditInput.focus();
      this.screen.render();
    }
  }

  /**
   * Hide config edit dialog
   */
  hideConfigEditDialog() {
    if (stryMutAct_9fa48("45992")) {
      {}
    } else {
      stryCov_9fa48("45992");
      this.configEditDialog.hide();
      this.configEditKey = null;
      this.configEditType = null;
      this.screen.render();
    }
  }

  /**
   * Submit config edit
   */
  submitConfigEdit() {
    if (stryMutAct_9fa48("45993")) {
      {}
    } else {
      stryCov_9fa48("45993");
      const newValue = stryMutAct_9fa48("45994") ? this.configEditInput.getValue() : (stryCov_9fa48("45994"), this.configEditInput.getValue().trim());
      const key = this.configEditKey;
      const type = this.configEditType;
      this.hideConfigEditDialog();
      if (stryMutAct_9fa48("45997") ? false : stryMutAct_9fa48("45996") ? true : stryMutAct_9fa48("45995") ? key : (stryCov_9fa48("45995", "45996", "45997"), !key)) return;

      // Validate the value using the view's validation
      const view = this.viewManager.getCurrentView();
      if (stryMutAct_9fa48("46000") ? view || view.validateValue : stryMutAct_9fa48("45999") ? false : stryMutAct_9fa48("45998") ? true : (stryCov_9fa48("45998", "45999", "46000"), view && view.validateValue)) {
        if (stryMutAct_9fa48("46001")) {
          {}
        } else {
          stryCov_9fa48("46001");
          const validation = view.validateValue(newValue, type);
          if (stryMutAct_9fa48("46004") ? false : stryMutAct_9fa48("46003") ? true : stryMutAct_9fa48("46002") ? validation.valid : (stryCov_9fa48("46002", "46003", "46004"), !validation.valid)) {
            if (stryMutAct_9fa48("46005")) {
              {}
            } else {
              stryCov_9fa48("46005");
              this.showError(stryMutAct_9fa48("46006") ? `` : (stryCov_9fa48("46006"), `Invalid value: ${validation.error}`));
              return;
            }
          }
        }
      }
      this.executeConfigUpdate(key, newValue, type);
    }
  }

  /**
   * Execute config update via SQL
   * @param {string} key - Config key
   * @param {string} value - New value
   * @param {string} type - Value type
   */
  executeConfigUpdate(key, value, type) {
    if (stryMutAct_9fa48("46007")) {
      {}
    } else {
      stryCov_9fa48("46007");
      // Format value for SQL based on type
      let sqlValue;
      if (stryMutAct_9fa48("46010") ? type === 'string' && type === 'json' : stryMutAct_9fa48("46009") ? false : stryMutAct_9fa48("46008") ? true : (stryCov_9fa48("46008", "46009", "46010"), (stryMutAct_9fa48("46012") ? type !== 'string' : stryMutAct_9fa48("46011") ? false : (stryCov_9fa48("46011", "46012"), type === (stryMutAct_9fa48("46013") ? "" : (stryCov_9fa48("46013"), 'string')))) || (stryMutAct_9fa48("46015") ? type !== 'json' : stryMutAct_9fa48("46014") ? false : (stryCov_9fa48("46014", "46015"), type === (stryMutAct_9fa48("46016") ? "" : (stryCov_9fa48("46016"), 'json')))))) {
        if (stryMutAct_9fa48("46017")) {
          {}
        } else {
          stryCov_9fa48("46017");
          // Escape single quotes
          const escaped = String(value).replace(/'/g, stryMutAct_9fa48("46018") ? "" : (stryCov_9fa48("46018"), '\'\''));
          sqlValue = stryMutAct_9fa48("46019") ? `` : (stryCov_9fa48("46019"), `'${escaped}'`);
        }
      } else {
        if (stryMutAct_9fa48("46020")) {
          {}
        } else {
          stryCov_9fa48("46020");
          sqlValue = stryMutAct_9fa48("46021") ? `` : (stryCov_9fa48("46021"), `'${value}'`);
        }
      }
      const sql = (stryMutAct_9fa48("46022") ? `` : (stryCov_9fa48("46022"), `UPDATE config SET config_value = ${sqlValue}, `)) + (stryMutAct_9fa48("46023") ? `` : (stryCov_9fa48("46023"), `updated_at = ${Date.now()} WHERE config_key = '${key}'`));
      this.updateStatus(stryMutAct_9fa48("46024") ? `` : (stryCov_9fa48("46024"), `Updating ${key}...`), stryMutAct_9fa48("46025") ? "" : (stryCov_9fa48("46025"), 'yellow'));
      const queryId = stryMutAct_9fa48("46026") ? `` : (stryCov_9fa48("46026"), `config_${Date.now()}_${stryMutAct_9fa48("46027") ? Math.random().toString(36) : (stryCov_9fa48("46027"), Math.random().toString(36).substr(2, 9))}`);
      const resultHandler = result => {
        if (stryMutAct_9fa48("46028")) {
          {}
        } else {
          stryCov_9fa48("46028");
          if (stryMutAct_9fa48("46031") ? result.queryId === queryId : stryMutAct_9fa48("46030") ? false : stryMutAct_9fa48("46029") ? true : (stryCov_9fa48("46029", "46030", "46031"), result.queryId !== queryId)) return;
          this.eventBus.off(stryMutAct_9fa48("46032") ? "" : (stryCov_9fa48("46032"), 'query:result'), resultHandler);
          if (stryMutAct_9fa48("46034") ? false : stryMutAct_9fa48("46033") ? true : (stryCov_9fa48("46033", "46034"), result.error)) {
            if (stryMutAct_9fa48("46035")) {
              {}
            } else {
              stryCov_9fa48("46035");
              this.showError(stryMutAct_9fa48("46036") ? `` : (stryCov_9fa48("46036"), `Failed to update: ${result.error}`));
            }
          } else {
            if (stryMutAct_9fa48("46037")) {
              {}
            } else {
              stryCov_9fa48("46037");
              this.updateStatus(stryMutAct_9fa48("46038") ? `` : (stryCov_9fa48("46038"), `Updated ${key}`), stryMutAct_9fa48("46039") ? "" : (stryCov_9fa48("46039"), 'green'));
              // Request cache refresh to see the change
              stryMutAct_9fa48("46040") ? this.connectionManager.requestCacheDump() : (stryCov_9fa48("46040"), this.connectionManager.requestCacheDump?.());
            }
          }
        }
      };
      const timeoutId = setTimeout(() => {
        if (stryMutAct_9fa48("46041")) {
          {}
        } else {
          stryCov_9fa48("46041");
          this.eventBus.off(stryMutAct_9fa48("46042") ? "" : (stryCov_9fa48("46042"), 'query:result'), resultHandler);
          this.showError(stryMutAct_9fa48("46043") ? "" : (stryCov_9fa48("46043"), 'Update timeout'));
        }
      }, 10000);
      const wrappedHandler = result => {
        if (stryMutAct_9fa48("46044")) {
          {}
        } else {
          stryCov_9fa48("46044");
          clearTimeout(timeoutId);
          resultHandler(result);
        }
      };
      this.eventBus.on(stryMutAct_9fa48("46045") ? "" : (stryCov_9fa48("46045"), 'query:result'), wrappedHandler);
      if (stryMutAct_9fa48("46047") ? false : stryMutAct_9fa48("46046") ? true : (stryCov_9fa48("46046", "46047"), this.connectionManager)) {
        if (stryMutAct_9fa48("46048")) {
          {}
        } else {
          stryCov_9fa48("46048");
          const sent = this.connectionManager.sendQuery(queryId, sql);
          if (stryMutAct_9fa48("46051") ? false : stryMutAct_9fa48("46050") ? true : stryMutAct_9fa48("46049") ? sent : (stryCov_9fa48("46049", "46050", "46051"), !sent)) {
            if (stryMutAct_9fa48("46052")) {
              {}
            } else {
              stryCov_9fa48("46052");
              clearTimeout(timeoutId);
              this.eventBus.off(stryMutAct_9fa48("46053") ? "" : (stryCov_9fa48("46053"), 'query:result'), wrappedHandler);
              this.showError(stryMutAct_9fa48("46054") ? "" : (stryCov_9fa48("46054"), 'Not connected to server'));
            }
          }
        }
      }
    }
  }

  /**
   * Update the header bar
   */
  updateHeader() {
    if (stryMutAct_9fa48("46055")) {
      {}
    } else {
      stryCov_9fa48("46055");
      const viewNum = stryMutAct_9fa48("46058") ? VIEW_NUMBERS[this.currentView] && '?' : stryMutAct_9fa48("46057") ? false : stryMutAct_9fa48("46056") ? true : (stryCov_9fa48("46056", "46057", "46058"), VIEW_NUMBERS[this.currentView] || (stryMutAct_9fa48("46059") ? "" : (stryCov_9fa48("46059"), '?')));
      const viewName = stryMutAct_9fa48("46060") ? this.currentView.replace('_', ' ').toLowerCase() : (stryCov_9fa48("46060"), this.currentView.replace(stryMutAct_9fa48("46061") ? "" : (stryCov_9fa48("46061"), '_'), stryMutAct_9fa48("46062") ? "" : (stryCov_9fa48("46062"), ' ')).toUpperCase());
      const breadcrumb = this.navigation.getBreadcrumb();
      const cdcStatus = this.cdcPaused ? stryMutAct_9fa48("46063") ? "" : (stryCov_9fa48("46063"), '{yellow-fg}CDC PAUSED{/yellow-fg}') : stryMutAct_9fa48("46064") ? "" : (stryCov_9fa48("46064"), '{green-fg}CDC LIVE{/green-fg}');
      const readOnly = this.readOnlyMode ? stryMutAct_9fa48("46065") ? "" : (stryCov_9fa48("46065"), ' {red-fg}[READ-ONLY]{/red-fg}') : stryMutAct_9fa48("46066") ? "Stryker was here!" : (stryCov_9fa48("46066"), '');
      const content = (stryMutAct_9fa48("46067") ? `` : (stryCov_9fa48("46067"), ` {bold}${CLI_APP.NAME}{/bold}${readOnly}  |  `)) + (stryMutAct_9fa48("46068") ? `` : (stryCov_9fa48("46068"), `{cyan-fg}[${viewNum}]{/cyan-fg} ${viewName}  |  `)) + (stryMutAct_9fa48("46069") ? `` : (stryCov_9fa48("46069"), `${breadcrumb}  |  ${cdcStatus}`));
      this.headerBox.setContent(content);
    }
  }

  /**
   * Update the status bar
   * @param {string} message - Status message
   * @param {string} color - Message color
   */
  updateStatus(message, color = stryMutAct_9fa48("46070") ? "" : (stryCov_9fa48("46070"), 'white')) {
    if (stryMutAct_9fa48("46071")) {
      {}
    } else {
      stryCov_9fa48("46071");
      const mode = stryMutAct_9fa48("46074") ? this.keyboardHandler?.getMode() && INPUT_MODE.NORMAL : stryMutAct_9fa48("46073") ? false : stryMutAct_9fa48("46072") ? true : (stryCov_9fa48("46072", "46073", "46074"), (stryMutAct_9fa48("46075") ? this.keyboardHandler.getMode() : (stryCov_9fa48("46075"), this.keyboardHandler?.getMode())) || INPUT_MODE.NORMAL);
      let hints = this.helpOverlay.getStatusBarHints(this.currentView);
      const inputBuffer = this.keyboardHandler.getInputBuffer();

      // Add SQL-specific hints when in SQL view
      if (stryMutAct_9fa48("46078") ? this.currentView !== 'sql' : stryMutAct_9fa48("46077") ? false : stryMutAct_9fa48("46076") ? true : (stryCov_9fa48("46076", "46077", "46078"), this.currentView === (stryMutAct_9fa48("46079") ? "" : (stryCov_9fa48("46079"), 'sql')))) {
        if (stryMutAct_9fa48("46080")) {
          {}
        } else {
          stryCov_9fa48("46080");
          hints = (stryMutAct_9fa48("46081") ? "" : (stryCov_9fa48("46081"), '{cyan-fg}Ctrl+X{/cyan-fg}:Execute  ')) + (stryMutAct_9fa48("46082") ? "" : (stryCov_9fa48("46082"), '{cyan-fg}↑↓{/cyan-fg}:Navigate  ')) + (stryMutAct_9fa48("46083") ? "" : (stryCov_9fa48("46083"), '{cyan-fg}Esc{/cyan-fg}:Clear  ')) + (stryMutAct_9fa48("46084") ? "" : (stryCov_9fa48("46084"), '{cyan-fg}0-9{/cyan-fg}:Views  ')) + (stryMutAct_9fa48("46085") ? "" : (stryCov_9fa48("46085"), '{cyan-fg}?{/cyan-fg}:Help'));
        }
      }

      // Add config-specific hints when in config view
      if (stryMutAct_9fa48("46088") ? this.currentView !== 'config' : stryMutAct_9fa48("46087") ? false : stryMutAct_9fa48("46086") ? true : (stryCov_9fa48("46086", "46087", "46088"), this.currentView === (stryMutAct_9fa48("46089") ? "" : (stryCov_9fa48("46089"), 'config')))) {
        if (stryMutAct_9fa48("46090")) {
          {}
        } else {
          stryCov_9fa48("46090");
          hints = (stryMutAct_9fa48("46091") ? "" : (stryCov_9fa48("46091"), '{cyan-fg}e{/cyan-fg}:Edit  ')) + (stryMutAct_9fa48("46092") ? "" : (stryCov_9fa48("46092"), '{cyan-fg}R{/cyan-fg}:Revert  ')) + (stryMutAct_9fa48("46093") ? "" : (stryCov_9fa48("46093"), '{cyan-fg}d{/cyan-fg}:Details  ')) + (stryMutAct_9fa48("46094") ? "" : (stryCov_9fa48("46094"), '{cyan-fg}/{/cyan-fg}:Filter  ')) + (stryMutAct_9fa48("46095") ? "" : (stryCov_9fa48("46095"), '{cyan-fg}?{/cyan-fg}:Help'));
        }
      }
      const statusContent = (stryMutAct_9fa48("46098") ? mode !== INPUT_MODE.FILTER : stryMutAct_9fa48("46097") ? false : stryMutAct_9fa48("46096") ? true : (stryCov_9fa48("46096", "46097", "46098"), mode === INPUT_MODE.FILTER)) ? stryMutAct_9fa48("46099") ? `` : (stryCov_9fa48("46099"), ` {yellow-fg}Filter:{/yellow-fg} ${inputBuffer}_`) : (stryMutAct_9fa48("46102") ? mode !== INPUT_MODE.COMMAND : stryMutAct_9fa48("46101") ? false : stryMutAct_9fa48("46100") ? true : (stryCov_9fa48("46100", "46101", "46102"), mode === INPUT_MODE.COMMAND)) ? stryMutAct_9fa48("46103") ? `` : (stryCov_9fa48("46103"), ` {yellow-fg}:{/yellow-fg}${inputBuffer}_`) : stryMutAct_9fa48("46104") ? `` : (stryCov_9fa48("46104"), ` {${color}-fg}${message}{/${color}-fg}  |  ${hints}`);
      this.statusBar.setContent(statusContent);
      this.screen.render();
    }
  }

  /**
   * Handle keyboard mode change
   * @param {string} mode - New input mode
   */
  handleModeChange(_mode) {
    if (stryMutAct_9fa48("46105")) {
      {}
    } else {
      stryCov_9fa48("46105");
      this.updateStatus(stryMutAct_9fa48("46106") ? "Stryker was here!" : (stryCov_9fa48("46106"), ''), stryMutAct_9fa48("46107") ? "" : (stryCov_9fa48("46107"), 'white'));
      this.screen.render();
    }
  }

  /**
   * Handle input change in filter/command mode
   * @param {string} _value - Current input value
   */
  handleInputChange(_value) {
    if (stryMutAct_9fa48("46108")) {
      {}
    } else {
      stryCov_9fa48("46108");
      this.updateStatus(stryMutAct_9fa48("46109") ? "Stryker was here!" : (stryCov_9fa48("46109"), ''), stryMutAct_9fa48("46110") ? "" : (stryCov_9fa48("46110"), 'white'));
    }
  }

  /**
   * Handle keyboard action
   * @param {Object} action - Action to perform
   */
  handleAction(action) {
    if (stryMutAct_9fa48("46111")) {
      {}
    } else {
      stryCov_9fa48("46111");
      switch (action.type) {
        case stryMutAct_9fa48("46113") ? "" : (stryCov_9fa48("46113"), 'navigate:up'):
          if (stryMutAct_9fa48("46112")) {} else {
            stryCov_9fa48("46112");
            this.navigateUp();
            break;
          }
        case stryMutAct_9fa48("46115") ? "" : (stryCov_9fa48("46115"), 'navigate:down'):
          if (stryMutAct_9fa48("46114")) {} else {
            stryCov_9fa48("46114");
            this.navigateDown();
            break;
          }
        case stryMutAct_9fa48("46117") ? "" : (stryCov_9fa48("46117"), 'navigate:pageup'):
          if (stryMutAct_9fa48("46116")) {} else {
            stryCov_9fa48("46116");
            this.navigateUp(stryMutAct_9fa48("46120") ? action.count && 10 : stryMutAct_9fa48("46119") ? false : stryMutAct_9fa48("46118") ? true : (stryCov_9fa48("46118", "46119", "46120"), action.count || 10));
            break;
          }
        case stryMutAct_9fa48("46122") ? "" : (stryCov_9fa48("46122"), 'navigate:pagedown'):
          if (stryMutAct_9fa48("46121")) {} else {
            stryCov_9fa48("46121");
            this.navigateDown(stryMutAct_9fa48("46125") ? action.count && 10 : stryMutAct_9fa48("46124") ? false : stryMutAct_9fa48("46123") ? true : (stryCov_9fa48("46123", "46124", "46125"), action.count || 10));
            break;
          }
        case stryMutAct_9fa48("46127") ? "" : (stryCov_9fa48("46127"), 'navigate:first'):
          if (stryMutAct_9fa48("46126")) {} else {
            stryCov_9fa48("46126");
            this.navigateFirst();
            break;
          }
        case stryMutAct_9fa48("46129") ? "" : (stryCov_9fa48("46129"), 'navigate:last'):
          if (stryMutAct_9fa48("46128")) {} else {
            stryCov_9fa48("46128");
            this.navigateLast();
            break;
          }
        case stryMutAct_9fa48("46131") ? "" : (stryCov_9fa48("46131"), 'navigate:select'):
          if (stryMutAct_9fa48("46130")) {} else {
            stryCov_9fa48("46130");
            this.handleSelect();
            break;
          }
        case stryMutAct_9fa48("46133") ? "" : (stryCov_9fa48("46133"), 'navigate:back'):
          if (stryMutAct_9fa48("46132")) {} else {
            stryCov_9fa48("46132");
            this.handleBack();
            break;
          }
        case stryMutAct_9fa48("46135") ? "" : (stryCov_9fa48("46135"), 'view:switch'):
          if (stryMutAct_9fa48("46134")) {} else {
            stryCov_9fa48("46134");
            this.switchView(action.view);
            break;
          }
        case stryMutAct_9fa48("46137") ? "" : (stryCov_9fa48("46137"), 'filter:apply'):
          if (stryMutAct_9fa48("46136")) {} else {
            stryCov_9fa48("46136");
            this.applyFilter(action.pattern);
            break;
          }
        case stryMutAct_9fa48("46139") ? "" : (stryCov_9fa48("46139"), 'command:execute'):
          if (stryMutAct_9fa48("46138")) {} else {
            stryCov_9fa48("46138");
            this.executeCommand(action.command, action.args);
            break;
          }
        case stryMutAct_9fa48("46141") ? "" : (stryCov_9fa48("46141"), 'detail:toggle'):
          if (stryMutAct_9fa48("46140")) {} else {
            stryCov_9fa48("46140");
            this.toggleDetailPanel();
            break;
          }
        case stryMutAct_9fa48("46143") ? "" : (stryCov_9fa48("46143"), 'cache:refresh'):
          if (stryMutAct_9fa48("46142")) {} else {
            stryCov_9fa48("46142");
            this.forceRefresh();
            break;
          }
        case stryMutAct_9fa48("46145") ? "" : (stryCov_9fa48("46145"), 'cdc:toggle-pause'):
          if (stryMutAct_9fa48("46144")) {} else {
            stryCov_9fa48("46144");
            this.toggleCDCPause();
            break;
          }
        case stryMutAct_9fa48("46147") ? "" : (stryCov_9fa48("46147"), 'help:show'):
          if (stryMutAct_9fa48("46146")) {} else {
            stryCov_9fa48("46146");
            this.showHelpOverlay();
            break;
          }
        case stryMutAct_9fa48("46149") ? "" : (stryCov_9fa48("46149"), 'config:edit'):
          if (stryMutAct_9fa48("46148")) {} else {
            stryCov_9fa48("46148");
            this.handleConfigEdit();
            break;
          }
        case stryMutAct_9fa48("46151") ? "" : (stryCov_9fa48("46151"), 'config:revert'):
          if (stryMutAct_9fa48("46150")) {} else {
            stryCov_9fa48("46150");
            this.handleConfigRevert();
            break;
          }
        case stryMutAct_9fa48("46152") ? "" : (stryCov_9fa48("46152"), 'app:quit'):
        case stryMutAct_9fa48("46154") ? "" : (stryCov_9fa48("46154"), 'app:force-quit'):
          if (stryMutAct_9fa48("46153")) {} else {
            stryCov_9fa48("46153");
            this.quit();
            break;
          }
      }
    }
  }

  /**
   * Navigate selection up
   * @param {number} count - Number of rows to move
   */
  navigateUp(count = 1) {
    if (stryMutAct_9fa48("46155")) {
      {}
    } else {
      stryCov_9fa48("46155");
      // Handle SQL view navigation
      if (stryMutAct_9fa48("46158") ? this.currentView !== 'sql' : stryMutAct_9fa48("46157") ? false : stryMutAct_9fa48("46156") ? true : (stryCov_9fa48("46156", "46157", "46158"), this.currentView === (stryMutAct_9fa48("46159") ? "" : (stryCov_9fa48("46159"), 'sql')))) {
        if (stryMutAct_9fa48("46160")) {
          {}
        } else {
          stryCov_9fa48("46160");
          this.sqlNavigateUp(count);
          return;
        }
      }
      const view = this.viewManager.getCurrentView();
      if (stryMutAct_9fa48("46162") ? false : stryMutAct_9fa48("46161") ? true : (stryCov_9fa48("46161", "46162"), view)) {
        if (stryMutAct_9fa48("46163")) {
          {}
        } else {
          stryCov_9fa48("46163");
          view.selectUp(count);
          if (stryMutAct_9fa48("46166") ? this.currentView !== CLI_VIEW.LOGS : stryMutAct_9fa48("46165") ? false : stryMutAct_9fa48("46164") ? true : (stryCov_9fa48("46164", "46165", "46166"), this.currentView === CLI_VIEW.LOGS)) {
            if (stryMutAct_9fa48("46167")) {
              {}
            } else {
              stryCov_9fa48("46167");
              this.renderCurrentView(view);
            }
          } else {
            if (stryMutAct_9fa48("46168")) {
              {}
            } else {
              stryCov_9fa48("46168");
              this.refreshCurrentView();
            }
          }
        }
      }
    }
  }

  /**
   * Navigate selection down
   * @param {number} count - Number of rows to move
   */
  navigateDown(count = 1) {
    if (stryMutAct_9fa48("46169")) {
      {}
    } else {
      stryCov_9fa48("46169");
      // Handle SQL view navigation
      if (stryMutAct_9fa48("46172") ? this.currentView !== 'sql' : stryMutAct_9fa48("46171") ? false : stryMutAct_9fa48("46170") ? true : (stryCov_9fa48("46170", "46171", "46172"), this.currentView === (stryMutAct_9fa48("46173") ? "" : (stryCov_9fa48("46173"), 'sql')))) {
        if (stryMutAct_9fa48("46174")) {
          {}
        } else {
          stryCov_9fa48("46174");
          this.sqlNavigateDown(count);
          return;
        }
      }
      const view = this.viewManager.getCurrentView();
      if (stryMutAct_9fa48("46176") ? false : stryMutAct_9fa48("46175") ? true : (stryCov_9fa48("46175", "46176"), view)) {
        if (stryMutAct_9fa48("46177")) {
          {}
        } else {
          stryCov_9fa48("46177");
          view.selectDown(count);
          if (stryMutAct_9fa48("46180") ? this.currentView !== CLI_VIEW.LOGS : stryMutAct_9fa48("46179") ? false : stryMutAct_9fa48("46178") ? true : (stryCov_9fa48("46178", "46179", "46180"), this.currentView === CLI_VIEW.LOGS)) {
            if (stryMutAct_9fa48("46181")) {
              {}
            } else {
              stryCov_9fa48("46181");
              this.renderCurrentView(view);
            }
          } else {
            if (stryMutAct_9fa48("46182")) {
              {}
            } else {
              stryCov_9fa48("46182");
              this.refreshCurrentView();
            }
          }
        }
      }
    }
  }

  /**
   * Navigate to first row
   */
  navigateFirst() {
    if (stryMutAct_9fa48("46183")) {
      {}
    } else {
      stryCov_9fa48("46183");
      // Handle SQL view navigation
      if (stryMutAct_9fa48("46186") ? this.currentView !== 'sql' : stryMutAct_9fa48("46185") ? false : stryMutAct_9fa48("46184") ? true : (stryCov_9fa48("46184", "46185", "46186"), this.currentView === (stryMutAct_9fa48("46187") ? "" : (stryCov_9fa48("46187"), 'sql')))) {
        if (stryMutAct_9fa48("46188")) {
          {}
        } else {
          stryCov_9fa48("46188");
          if (stryMutAct_9fa48("46191") ? this.sqlResultsData || this.sqlResultsData.length > 0 : stryMutAct_9fa48("46190") ? false : stryMutAct_9fa48("46189") ? true : (stryCov_9fa48("46189", "46190", "46191"), this.sqlResultsData && (stryMutAct_9fa48("46194") ? this.sqlResultsData.length <= 0 : stryMutAct_9fa48("46193") ? this.sqlResultsData.length >= 0 : stryMutAct_9fa48("46192") ? true : (stryCov_9fa48("46192", "46193", "46194"), this.sqlResultsData.length > 0)))) {
            if (stryMutAct_9fa48("46195")) {
              {}
            } else {
              stryCov_9fa48("46195");
              this.sqlSelectedIndex = 0;
              this.updateSqlResultsTable();
              this.updateSqlDetailPanel();
              this.screen.render();
            }
          }
          return;
        }
      }
      const view = this.viewManager.getCurrentView();
      if (stryMutAct_9fa48("46197") ? false : stryMutAct_9fa48("46196") ? true : (stryCov_9fa48("46196", "46197"), view)) {
        if (stryMutAct_9fa48("46198")) {
          {}
        } else {
          stryCov_9fa48("46198");
          view.selectFirst();
          if (stryMutAct_9fa48("46201") ? this.currentView !== CLI_VIEW.LOGS : stryMutAct_9fa48("46200") ? false : stryMutAct_9fa48("46199") ? true : (stryCov_9fa48("46199", "46200", "46201"), this.currentView === CLI_VIEW.LOGS)) {
            if (stryMutAct_9fa48("46202")) {
              {}
            } else {
              stryCov_9fa48("46202");
              this.renderCurrentView(view);
            }
          } else {
            if (stryMutAct_9fa48("46203")) {
              {}
            } else {
              stryCov_9fa48("46203");
              this.refreshCurrentView();
            }
          }
        }
      }
    }
  }

  /**
   * Navigate to last row
   */
  navigateLast() {
    if (stryMutAct_9fa48("46204")) {
      {}
    } else {
      stryCov_9fa48("46204");
      // Handle SQL view navigation
      if (stryMutAct_9fa48("46207") ? this.currentView !== 'sql' : stryMutAct_9fa48("46206") ? false : stryMutAct_9fa48("46205") ? true : (stryCov_9fa48("46205", "46206", "46207"), this.currentView === (stryMutAct_9fa48("46208") ? "" : (stryCov_9fa48("46208"), 'sql')))) {
        if (stryMutAct_9fa48("46209")) {
          {}
        } else {
          stryCov_9fa48("46209");
          if (stryMutAct_9fa48("46212") ? this.sqlResultsData || this.sqlResultsData.length > 0 : stryMutAct_9fa48("46211") ? false : stryMutAct_9fa48("46210") ? true : (stryCov_9fa48("46210", "46211", "46212"), this.sqlResultsData && (stryMutAct_9fa48("46215") ? this.sqlResultsData.length <= 0 : stryMutAct_9fa48("46214") ? this.sqlResultsData.length >= 0 : stryMutAct_9fa48("46213") ? true : (stryCov_9fa48("46213", "46214", "46215"), this.sqlResultsData.length > 0)))) {
            if (stryMutAct_9fa48("46216")) {
              {}
            } else {
              stryCov_9fa48("46216");
              this.sqlSelectedIndex = stryMutAct_9fa48("46217") ? this.sqlResultsData.length + 1 : (stryCov_9fa48("46217"), this.sqlResultsData.length - 1);
              this.updateSqlResultsTable();
              this.updateSqlDetailPanel();
              this.screen.render();
            }
          }
          return;
        }
      }
      const view = this.viewManager.getCurrentView();
      if (stryMutAct_9fa48("46219") ? false : stryMutAct_9fa48("46218") ? true : (stryCov_9fa48("46218", "46219"), view)) {
        if (stryMutAct_9fa48("46220")) {
          {}
        } else {
          stryCov_9fa48("46220");
          view.selectLast();
          if (stryMutAct_9fa48("46223") ? this.currentView !== CLI_VIEW.LOGS : stryMutAct_9fa48("46222") ? false : stryMutAct_9fa48("46221") ? true : (stryCov_9fa48("46221", "46222", "46223"), this.currentView === CLI_VIEW.LOGS)) {
            if (stryMutAct_9fa48("46224")) {
              {}
            } else {
              stryCov_9fa48("46224");
              this.renderCurrentView(view);
            }
          } else {
            if (stryMutAct_9fa48("46225")) {
              {}
            } else {
              stryCov_9fa48("46225");
              this.refreshCurrentView();
            }
          }
        }
      }
    }
  }

  /**
   * Handle select/enter on current row
   */
  handleSelect() {
    if (stryMutAct_9fa48("46226")) {
      {}
    } else {
      stryCov_9fa48("46226");
      const view = this.viewManager.getCurrentView();
      if (stryMutAct_9fa48("46229") ? false : stryMutAct_9fa48("46228") ? true : stryMutAct_9fa48("46227") ? view : (stryCov_9fa48("46227", "46228", "46229"), !view)) return;
      const result = stryMutAct_9fa48("46230") ? view.handleDrillDown() : (stryCov_9fa48("46230"), view.handleDrillDown?.());
      if (stryMutAct_9fa48("46233") ? result || result.action === 'drillDown' : stryMutAct_9fa48("46232") ? false : stryMutAct_9fa48("46231") ? true : (stryCov_9fa48("46231", "46232", "46233"), result && (stryMutAct_9fa48("46235") ? result.action !== 'drillDown' : stryMutAct_9fa48("46234") ? true : (stryCov_9fa48("46234", "46235"), result.action === (stryMutAct_9fa48("46236") ? "" : (stryCov_9fa48("46236"), 'drillDown')))))) {
        if (stryMutAct_9fa48("46237")) {
          {}
        } else {
          stryCov_9fa48("46237");
          this.navigation.drillDown(result.view, result.context);
          this.switchView(result.view);
        }
      }
    }
  }

  /**
   * Handle back navigation
   */
  handleBack() {
    if (stryMutAct_9fa48("46238")) {
      {}
    } else {
      stryCov_9fa48("46238");
      if (stryMutAct_9fa48("46240") ? false : stryMutAct_9fa48("46239") ? true : (stryCov_9fa48("46239", "46240"), this.navigation.goBack())) {
        if (stryMutAct_9fa48("46241")) {
          {}
        } else {
          stryCov_9fa48("46241");
          const state = this.navigation.getCurrentState();
          this.switchView(state.view);
        }
      }
    }
  }

  /**
   * Apply filter to current view
   * @param {string} pattern - Filter pattern
   */
  applyFilter(pattern) {
    if (stryMutAct_9fa48("46242")) {
      {}
    } else {
      stryCov_9fa48("46242");
      const view = this.viewManager.getCurrentView();
      if (stryMutAct_9fa48("46244") ? false : stryMutAct_9fa48("46243") ? true : (stryCov_9fa48("46243", "46244"), view)) {
        if (stryMutAct_9fa48("46245")) {
          {}
        } else {
          stryCov_9fa48("46245");
          view.setFilter(pattern);
          this.refreshCurrentView();
        }
      }
    }
  }

  /**
   * Execute a command
   * @param {string} command - Command name
   * @param {string[]} args - Command arguments
   */
  executeCommand(command, args) {
    if (stryMutAct_9fa48("46246")) {
      {}
    } else {
      stryCov_9fa48("46246");
      switch (command) {
        case stryMutAct_9fa48("46248") ? "" : (stryCov_9fa48("46248"), 'goto'):
          if (stryMutAct_9fa48("46247")) {} else {
            stryCov_9fa48("46247");
            if (stryMutAct_9fa48("46250") ? false : stryMutAct_9fa48("46249") ? true : (stryCov_9fa48("46249", "46250"), args[0])) this.switchView(args[0]);
            break;
          }
        case stryMutAct_9fa48("46252") ? "" : (stryCov_9fa48("46252"), 'filter'):
          if (stryMutAct_9fa48("46251")) {} else {
            stryCov_9fa48("46251");
            this.applyFilter(stryMutAct_9fa48("46255") ? args[0] && '' : stryMutAct_9fa48("46254") ? false : stryMutAct_9fa48("46253") ? true : (stryCov_9fa48("46253", "46254", "46255"), args[0] || (stryMutAct_9fa48("46256") ? "Stryker was here!" : (stryCov_9fa48("46256"), ''))));
            break;
          }
        case stryMutAct_9fa48("46258") ? "" : (stryCov_9fa48("46258"), 'refresh'):
          if (stryMutAct_9fa48("46257")) {} else {
            stryCov_9fa48("46257");
            this.forceRefresh();
            break;
          }
        case stryMutAct_9fa48("46260") ? "" : (stryCov_9fa48("46260"), 'sql'):
          if (stryMutAct_9fa48("46259")) {} else {
            stryCov_9fa48("46259");
            this.switchView(stryMutAct_9fa48("46261") ? "" : (stryCov_9fa48("46261"), 'sql'));
            break;
          }
        case stryMutAct_9fa48("46263") ? "" : (stryCov_9fa48("46263"), 'help'):
          if (stryMutAct_9fa48("46262")) {} else {
            stryCov_9fa48("46262");
            this.showHelpOverlay();
            break;
          }
        case stryMutAct_9fa48("46265") ? "" : (stryCov_9fa48("46265"), 'quit'):
          if (stryMutAct_9fa48("46264")) {} else {
            stryCov_9fa48("46264");
            this.quit();
            break;
          }
        case stryMutAct_9fa48("46267") ? "" : (stryCov_9fa48("46267"), 'connect'):
          if (stryMutAct_9fa48("46266")) {} else {
            stryCov_9fa48("46266");
            if (stryMutAct_9fa48("46269") ? false : stryMutAct_9fa48("46268") ? true : (stryCov_9fa48("46268", "46269"), args[0])) this.reconnect(args[0]);
            break;
          }
        case stryMutAct_9fa48("46271") ? "" : (stryCov_9fa48("46271"), 'drain'):
          if (stryMutAct_9fa48("46270")) {} else {
            stryCov_9fa48("46270");
            if (stryMutAct_9fa48("46273") ? false : stryMutAct_9fa48("46272") ? true : (stryCov_9fa48("46272", "46273"), args[0])) this.updateNodeStatus(args[0], stryMutAct_9fa48("46274") ? "" : (stryCov_9fa48("46274"), 'draining'));
            break;
          }
        case stryMutAct_9fa48("46276") ? "" : (stryCov_9fa48("46276"), 'activate'):
          if (stryMutAct_9fa48("46275")) {} else {
            stryCov_9fa48("46275");
            if (stryMutAct_9fa48("46278") ? false : stryMutAct_9fa48("46277") ? true : (stryCov_9fa48("46277", "46278"), args[0])) this.updateNodeStatus(args[0], stryMutAct_9fa48("46279") ? "" : (stryCov_9fa48("46279"), 'active'));
            break;
          }
        case stryMutAct_9fa48("46281") ? "" : (stryCov_9fa48("46281"), 'remove-node'):
          if (stryMutAct_9fa48("46280")) {} else {
            stryCov_9fa48("46280");
            if (stryMutAct_9fa48("46283") ? false : stryMutAct_9fa48("46282") ? true : (stryCov_9fa48("46282", "46283"), args[0])) this.removeNode(args[0]);
            break;
          }
        case stryMutAct_9fa48("46285") ? "" : (stryCov_9fa48("46285"), 'history'):
          if (stryMutAct_9fa48("46284")) {} else {
            stryCov_9fa48("46284");
            if (stryMutAct_9fa48("46287") ? false : stryMutAct_9fa48("46286") ? true : (stryCov_9fa48("46286", "46287"), args[0])) this.showReplicaHistory(args[0]);
            break;
          }
        case stryMutAct_9fa48("46289") ? "" : (stryCov_9fa48("46289"), 'since'):
          if (stryMutAct_9fa48("46288")) {} else {
            stryCov_9fa48("46288");
            if (stryMutAct_9fa48("46291") ? false : stryMutAct_9fa48("46290") ? true : (stryCov_9fa48("46290", "46291"), args[0])) this.applyLogsSince(args[0]);
            break;
          }
      }
    }
  }

  /**
   * Execute a node-management SQL mutation over the admin query channel.
   * @param {Object} options
   * @param {string} options.sql
   * @param {Array<*>} options.params
   * @param {string} options.pendingMessage
   * @param {string} options.successMessage
   * @param {string} options.failurePrefix
   * @param {string} options.notFoundMessage
   */
  executeNodeManagementQuery(options) {
    if (stryMutAct_9fa48("46292")) {
      {}
    } else {
      stryCov_9fa48("46292");
      if (stryMutAct_9fa48("46294") ? false : stryMutAct_9fa48("46293") ? true : (stryCov_9fa48("46293", "46294"), this.readOnlyMode)) {
        if (stryMutAct_9fa48("46295")) {
          {}
        } else {
          stryCov_9fa48("46295");
          this.showError(stryMutAct_9fa48("46296") ? "" : (stryCov_9fa48("46296"), 'Node management commands are unavailable in read-only mode'));
          return;
        }
      }
      if (stryMutAct_9fa48("46299") ? !this.connectionManager && !this.eventBus : stryMutAct_9fa48("46298") ? false : stryMutAct_9fa48("46297") ? true : (stryCov_9fa48("46297", "46298", "46299"), (stryMutAct_9fa48("46300") ? this.connectionManager : (stryCov_9fa48("46300"), !this.connectionManager)) || (stryMutAct_9fa48("46301") ? this.eventBus : (stryCov_9fa48("46301"), !this.eventBus)))) {
        if (stryMutAct_9fa48("46302")) {
          {}
        } else {
          stryCov_9fa48("46302");
          this.showError(stryMutAct_9fa48("46303") ? "" : (stryCov_9fa48("46303"), 'Not connected to server'));
          return;
        }
      }
      const queryId = stryMutAct_9fa48("46304") ? `` : (stryCov_9fa48("46304"), `node_mgmt_${Date.now()}_${stryMutAct_9fa48("46305") ? Math.random().toString(36) : (stryCov_9fa48("46305"), Math.random().toString(36).substr(2, 9))}`);
      const timeoutMs = 10000;
      this.updateStatus(options.pendingMessage, stryMutAct_9fa48("46306") ? "" : (stryCov_9fa48("46306"), 'yellow'));
      let timeoutId = null;
      const cleanup = () => {
        if (stryMutAct_9fa48("46307")) {
          {}
        } else {
          stryCov_9fa48("46307");
          if (stryMutAct_9fa48("46309") ? false : stryMutAct_9fa48("46308") ? true : (stryCov_9fa48("46308", "46309"), timeoutId)) {
            if (stryMutAct_9fa48("46310")) {
              {}
            } else {
              stryCov_9fa48("46310");
              clearTimeout(timeoutId);
            }
          }
          this.eventBus.off(stryMutAct_9fa48("46311") ? "" : (stryCov_9fa48("46311"), 'query:result'), wrappedHandler);
        }
      };
      const resultHandler = result => {
        if (stryMutAct_9fa48("46312")) {
          {}
        } else {
          stryCov_9fa48("46312");
          if (stryMutAct_9fa48("46315") ? result.queryId === queryId : stryMutAct_9fa48("46314") ? false : stryMutAct_9fa48("46313") ? true : (stryCov_9fa48("46313", "46314", "46315"), result.queryId !== queryId)) {
            if (stryMutAct_9fa48("46316")) {
              {}
            } else {
              stryCov_9fa48("46316");
              return;
            }
          }
          cleanup();
          if (stryMutAct_9fa48("46318") ? false : stryMutAct_9fa48("46317") ? true : (stryCov_9fa48("46317", "46318"), result.error)) {
            if (stryMutAct_9fa48("46319")) {
              {}
            } else {
              stryCov_9fa48("46319");
              this.showError(stryMutAct_9fa48("46320") ? `` : (stryCov_9fa48("46320"), `${options.failurePrefix}: ${result.error}`));
              return;
            }
          }
          const affectedRows = Number(stryMutAct_9fa48("46323") ? result.affectedRows && 0 : stryMutAct_9fa48("46322") ? false : stryMutAct_9fa48("46321") ? true : (stryCov_9fa48("46321", "46322", "46323"), result.affectedRows || 0));
          if (stryMutAct_9fa48("46327") ? affectedRows >= 1 : stryMutAct_9fa48("46326") ? affectedRows <= 1 : stryMutAct_9fa48("46325") ? false : stryMutAct_9fa48("46324") ? true : (stryCov_9fa48("46324", "46325", "46326", "46327"), affectedRows < 1)) {
            if (stryMutAct_9fa48("46328")) {
              {}
            } else {
              stryCov_9fa48("46328");
              this.showError(options.notFoundMessage);
              return;
            }
          }
          this.updateStatus(options.successMessage, stryMutAct_9fa48("46329") ? "" : (stryCov_9fa48("46329"), 'green'));
          this.forceRefresh();
        }
      };
      const wrappedHandler = result => {
        if (stryMutAct_9fa48("46330")) {
          {}
        } else {
          stryCov_9fa48("46330");
          resultHandler(result);
        }
      };
      timeoutId = setTimeout(() => {
        if (stryMutAct_9fa48("46331")) {
          {}
        } else {
          stryCov_9fa48("46331");
          cleanup();
          this.showError(stryMutAct_9fa48("46332") ? `` : (stryCov_9fa48("46332"), `${options.failurePrefix}: query timeout`));
        }
      }, timeoutMs);
      this.eventBus.on(stryMutAct_9fa48("46333") ? "" : (stryCov_9fa48("46333"), 'query:result'), wrappedHandler);
      const sent = this.connectionManager.sendQuery(queryId, options.sql, options.params);
      if (stryMutAct_9fa48("46336") ? false : stryMutAct_9fa48("46335") ? true : stryMutAct_9fa48("46334") ? sent : (stryCov_9fa48("46334", "46335", "46336"), !sent)) {
        if (stryMutAct_9fa48("46337")) {
          {}
        } else {
          stryCov_9fa48("46337");
          cleanup();
          this.showError(stryMutAct_9fa48("46338") ? "" : (stryCov_9fa48("46338"), 'Not connected to server'));
        }
      }
    }
  }

  /**
   * Mark a node as active or draining through the admin query channel.
   * @param {string} nodeId
   * @param {string} status
   */
  updateNodeStatus(nodeId, status) {
    if (stryMutAct_9fa48("46339")) {
      {}
    } else {
      stryCov_9fa48("46339");
      const verb = (stryMutAct_9fa48("46342") ? status !== 'draining' : stryMutAct_9fa48("46341") ? false : stryMutAct_9fa48("46340") ? true : (stryCov_9fa48("46340", "46341", "46342"), status === (stryMutAct_9fa48("46343") ? "" : (stryCov_9fa48("46343"), 'draining')))) ? stryMutAct_9fa48("46344") ? "" : (stryCov_9fa48("46344"), 'drain') : stryMutAct_9fa48("46345") ? "" : (stryCov_9fa48("46345"), 'activate');
      this.executeNodeManagementQuery(stryMutAct_9fa48("46346") ? {} : (stryCov_9fa48("46346"), {
        sql: stryMutAct_9fa48("46347") ? "" : (stryCov_9fa48("46347"), 'UPDATE nodes SET status = ?1 WHERE node_id = ?2'),
        params: stryMutAct_9fa48("46348") ? [] : (stryCov_9fa48("46348"), [status, nodeId]),
        pendingMessage: stryMutAct_9fa48("46349") ? `` : (stryCov_9fa48("46349"), `${verb}ing node ${nodeId}...`),
        successMessage: stryMutAct_9fa48("46350") ? `` : (stryCov_9fa48("46350"), `Node ${nodeId} marked ${status}`),
        failurePrefix: stryMutAct_9fa48("46351") ? `` : (stryCov_9fa48("46351"), `Failed to mark node ${nodeId} as ${status}`),
        notFoundMessage: stryMutAct_9fa48("46352") ? `` : (stryCov_9fa48("46352"), `Node ${nodeId} not found`)
      }));
    }
  }

  /**
   * Remove a node from cluster metadata through the admin query channel.
   * @param {string} nodeId
   */
  removeNode(nodeId) {
    if (stryMutAct_9fa48("46353")) {
      {}
    } else {
      stryCov_9fa48("46353");
      this.executeNodeManagementQuery(stryMutAct_9fa48("46354") ? {} : (stryCov_9fa48("46354"), {
        sql: stryMutAct_9fa48("46355") ? "" : (stryCov_9fa48("46355"), 'DELETE FROM nodes WHERE node_id = ?1'),
        params: stryMutAct_9fa48("46356") ? [] : (stryCov_9fa48("46356"), [nodeId]),
        pendingMessage: stryMutAct_9fa48("46357") ? `` : (stryCov_9fa48("46357"), `Removing node ${nodeId}...`),
        successMessage: stryMutAct_9fa48("46358") ? `` : (stryCov_9fa48("46358"), `Node ${nodeId} removed`),
        failurePrefix: stryMutAct_9fa48("46359") ? `` : (stryCov_9fa48("46359"), `Failed to remove node ${nodeId}`),
        notFoundMessage: stryMutAct_9fa48("46360") ? `` : (stryCov_9fa48("46360"), `Node ${nodeId} not found`)
      }));
    }
  }

  /**
   * Apply a live logs start-time window from command input.
   * @param {string} value - Since value (`now`, ISO/epoch, or relative like `-5m`).
   */
  applyLogsSince(value) {
    if (stryMutAct_9fa48("46361")) {
      {}
    } else {
      stryCov_9fa48("46361");
      if (stryMutAct_9fa48("46364") ? this.currentView === CLI_VIEW.LOGS : stryMutAct_9fa48("46363") ? false : stryMutAct_9fa48("46362") ? true : (stryCov_9fa48("46362", "46363", "46364"), this.currentView !== CLI_VIEW.LOGS)) {
        if (stryMutAct_9fa48("46365")) {
          {}
        } else {
          stryCov_9fa48("46365");
          this.showError(stryMutAct_9fa48("46366") ? "" : (stryCov_9fa48("46366"), 'since command is only available in logs view'));
          return;
        }
      }
      const logsView = stryMutAct_9fa48("46367") ? this.viewManager.getView(CLI_VIEW.LOGS) : (stryCov_9fa48("46367"), this.viewManager?.getView(CLI_VIEW.LOGS));
      if (stryMutAct_9fa48("46370") ? !logsView && typeof logsView.setLiveWindowStartTime !== 'function' : stryMutAct_9fa48("46369") ? false : stryMutAct_9fa48("46368") ? true : (stryCov_9fa48("46368", "46369", "46370"), (stryMutAct_9fa48("46371") ? logsView : (stryCov_9fa48("46371"), !logsView)) || (stryMutAct_9fa48("46373") ? typeof logsView.setLiveWindowStartTime === 'function' : stryMutAct_9fa48("46372") ? false : (stryCov_9fa48("46372", "46373"), typeof logsView.setLiveWindowStartTime !== (stryMutAct_9fa48("46374") ? "" : (stryCov_9fa48("46374"), 'function')))))) {
        if (stryMutAct_9fa48("46375")) {
          {}
        } else {
          stryCov_9fa48("46375");
          this.showError(stryMutAct_9fa48("46376") ? "" : (stryCov_9fa48("46376"), 'logs view does not support since command'));
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("46377")) {
          {}
        } else {
          stryCov_9fa48("46377");
          logsView.setLiveWindowStartTime(value);
          this.refreshCurrentView();
        }
      } catch (error) {
        if (stryMutAct_9fa48("46378")) {
          {}
        } else {
          stryCov_9fa48("46378");
          this.showError(error.message);
        }
      }
    }
  }

  /**
   * Show state transition history for a replica
   * Requirements: 8.4
   * @param {string} replicaId - Replica ID to show history for
   */
  async showReplicaHistory(replicaId) {
    if (stryMutAct_9fa48("46379")) {
      {}
    } else {
      stryCov_9fa48("46379");
      if (stryMutAct_9fa48("46382") ? false : stryMutAct_9fa48("46381") ? true : stryMutAct_9fa48("46380") ? replicaId : (stryCov_9fa48("46380", "46381", "46382"), !replicaId)) {
        if (stryMutAct_9fa48("46383")) {
          {}
        } else {
          stryCov_9fa48("46383");
          this.showError(stryMutAct_9fa48("46384") ? "" : (stryCov_9fa48("46384"), 'Replica ID required'));
          return;
        }
      }
      this.updateStatus(stryMutAct_9fa48("46385") ? `` : (stryCov_9fa48("46385"), `Loading history for ${replicaId}...`), stryMutAct_9fa48("46386") ? "" : (stryCov_9fa48("46386"), 'yellow'));

      // Query logs table for state transition events for this replica
      // The logs contain 'Replica state transition' messages with replicaId in metadata
      const sql = (stryMutAct_9fa48("46387") ? "" : (stryCov_9fa48("46387"), 'SELECT timestamp, level, message, metadata FROM logs ')) + (stryMutAct_9fa48("46388") ? "" : (stryCov_9fa48("46388"), 'WHERE message LIKE \'%Replica state transition%\' ')) + (stryMutAct_9fa48("46389") ? `` : (stryCov_9fa48("46389"), `AND metadata LIKE '%${replicaId.replace(/'/g, stryMutAct_9fa48("46390") ? "" : (stryCov_9fa48("46390"), '\'\''))}%' `)) + (stryMutAct_9fa48("46391") ? "" : (stryCov_9fa48("46391"), 'ORDER BY timestamp ASC LIMIT 100'));
      const queryId = stryMutAct_9fa48("46392") ? `` : (stryCov_9fa48("46392"), `history_${Date.now()}_${stryMutAct_9fa48("46393") ? Math.random().toString(36) : (stryCov_9fa48("46393"), Math.random().toString(36).substr(2, 9))}`);
      const resultHandler = result => {
        if (stryMutAct_9fa48("46394")) {
          {}
        } else {
          stryCov_9fa48("46394");
          if (stryMutAct_9fa48("46397") ? result.queryId === queryId : stryMutAct_9fa48("46396") ? false : stryMutAct_9fa48("46395") ? true : (stryCov_9fa48("46395", "46396", "46397"), result.queryId !== queryId)) return;
          this.eventBus.off(stryMutAct_9fa48("46398") ? "" : (stryCov_9fa48("46398"), 'query:result'), resultHandler);
          if (stryMutAct_9fa48("46400") ? false : stryMutAct_9fa48("46399") ? true : (stryCov_9fa48("46399", "46400"), result.error)) {
            if (stryMutAct_9fa48("46401")) {
              {}
            } else {
              stryCov_9fa48("46401");
              this.showError(stryMutAct_9fa48("46402") ? `` : (stryCov_9fa48("46402"), `Failed to load history: ${result.error}`));
              return;
            }
          }
          const rows = stryMutAct_9fa48("46405") ? result.results && [] : stryMutAct_9fa48("46404") ? false : stryMutAct_9fa48("46403") ? true : (stryCov_9fa48("46403", "46404", "46405"), result.results || (stryMutAct_9fa48("46406") ? ["Stryker was here"] : (stryCov_9fa48("46406"), [])));
          this.displayReplicaHistory(replicaId, rows);
        }
      };
      const timeoutId = setTimeout(() => {
        if (stryMutAct_9fa48("46407")) {
          {}
        } else {
          stryCov_9fa48("46407");
          this.eventBus.off(stryMutAct_9fa48("46408") ? "" : (stryCov_9fa48("46408"), 'query:result'), resultHandler);
          this.showError(stryMutAct_9fa48("46409") ? "" : (stryCov_9fa48("46409"), 'History query timeout'));
        }
      }, 10000);
      const wrappedHandler = result => {
        if (stryMutAct_9fa48("46410")) {
          {}
        } else {
          stryCov_9fa48("46410");
          clearTimeout(timeoutId);
          resultHandler(result);
        }
      };
      this.eventBus.on(stryMutAct_9fa48("46411") ? "" : (stryCov_9fa48("46411"), 'query:result'), wrappedHandler);
      if (stryMutAct_9fa48("46413") ? false : stryMutAct_9fa48("46412") ? true : (stryCov_9fa48("46412", "46413"), this.connectionManager)) {
        if (stryMutAct_9fa48("46414")) {
          {}
        } else {
          stryCov_9fa48("46414");
          const sent = this.connectionManager.sendQuery(queryId, sql);
          if (stryMutAct_9fa48("46417") ? false : stryMutAct_9fa48("46416") ? true : stryMutAct_9fa48("46415") ? sent : (stryCov_9fa48("46415", "46416", "46417"), !sent)) {
            if (stryMutAct_9fa48("46418")) {
              {}
            } else {
              stryCov_9fa48("46418");
              clearTimeout(timeoutId);
              this.eventBus.off(stryMutAct_9fa48("46419") ? "" : (stryCov_9fa48("46419"), 'query:result'), wrappedHandler);
              this.showError(stryMutAct_9fa48("46420") ? "" : (stryCov_9fa48("46420"), 'Not connected to server'));
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("46421")) {
          {}
        } else {
          stryCov_9fa48("46421");
          clearTimeout(timeoutId);
          this.eventBus.off(stryMutAct_9fa48("46422") ? "" : (stryCov_9fa48("46422"), 'query:result'), wrappedHandler);
          this.showError(stryMutAct_9fa48("46423") ? "" : (stryCov_9fa48("46423"), 'Not connected to server'));
        }
      }
    }
  }

  /**
   * Display replica state transition history in a dialog
   * Requirements: 8.4
   * @param {string} replicaId - Replica ID
   * @param {Array} rows - Log rows from query
   */
  displayReplicaHistory(replicaId, rows) {
    if (stryMutAct_9fa48("46424")) {
      {}
    } else {
      stryCov_9fa48("46424");
      if (stryMutAct_9fa48("46427") ? !rows && rows.length === 0 : stryMutAct_9fa48("46426") ? false : stryMutAct_9fa48("46425") ? true : (stryCov_9fa48("46425", "46426", "46427"), (stryMutAct_9fa48("46428") ? rows : (stryCov_9fa48("46428"), !rows)) || (stryMutAct_9fa48("46430") ? rows.length !== 0 : stryMutAct_9fa48("46429") ? false : (stryCov_9fa48("46429", "46430"), rows.length === 0)))) {
        if (stryMutAct_9fa48("46431")) {
          {}
        } else {
          stryCov_9fa48("46431");
          this.updateStatus(stryMutAct_9fa48("46432") ? `` : (stryCov_9fa48("46432"), `No history found for replica ${replicaId}`), stryMutAct_9fa48("46433") ? "" : (stryCov_9fa48("46433"), 'yellow'));
          return;
        }
      }

      // Parse and format the history entries
      const historyEntries = rows.map(row => {
        if (stryMutAct_9fa48("46434")) {
          {}
        } else {
          stryCov_9fa48("46434");
          let metadata = {};
          try {
            if (stryMutAct_9fa48("46435")) {
              {}
            } else {
              stryCov_9fa48("46435");
              if (stryMutAct_9fa48("46437") ? false : stryMutAct_9fa48("46436") ? true : (stryCov_9fa48("46436", "46437"), row.metadata)) {
                if (stryMutAct_9fa48("46438")) {
                  {}
                } else {
                  stryCov_9fa48("46438");
                  metadata = (stryMutAct_9fa48("46441") ? typeof row.metadata !== 'string' : stryMutAct_9fa48("46440") ? false : stryMutAct_9fa48("46439") ? true : (stryCov_9fa48("46439", "46440", "46441"), typeof row.metadata === (stryMutAct_9fa48("46442") ? "" : (stryCov_9fa48("46442"), 'string')))) ? JSON.parse(row.metadata) : row.metadata;
                }
              }
            }
          } catch (_e) {
            // Ignore parse errors
          }
          const timestamp = row.timestamp ? stryMutAct_9fa48("46443") ? new Date(row.timestamp).toISOString().replace('T', ' ') : (stryCov_9fa48("46443"), new Date(row.timestamp).toISOString().replace(stryMutAct_9fa48("46444") ? "" : (stryCov_9fa48("46444"), 'T'), stryMutAct_9fa48("46445") ? "" : (stryCov_9fa48("46445"), ' ')).substring(0, 19)) : stryMutAct_9fa48("46446") ? "" : (stryCov_9fa48("46446"), 'N/A');
          return stryMutAct_9fa48("46447") ? {} : (stryCov_9fa48("46447"), {
            timestamp,
            previousState: stryMutAct_9fa48("46450") ? metadata.previousState && 'N/A' : stryMutAct_9fa48("46449") ? false : stryMutAct_9fa48("46448") ? true : (stryCov_9fa48("46448", "46449", "46450"), metadata.previousState || (stryMutAct_9fa48("46451") ? "" : (stryCov_9fa48("46451"), 'N/A'))),
            newState: stryMutAct_9fa48("46454") ? metadata.newState && 'N/A' : stryMutAct_9fa48("46453") ? false : stryMutAct_9fa48("46452") ? true : (stryCov_9fa48("46452", "46453", "46454"), metadata.newState || (stryMutAct_9fa48("46455") ? "" : (stryCov_9fa48("46455"), 'N/A'))),
            reason: stryMutAct_9fa48("46458") ? metadata.reason && 'N/A' : stryMutAct_9fa48("46457") ? false : stryMutAct_9fa48("46456") ? true : (stryCov_9fa48("46456", "46457", "46458"), metadata.reason || (stryMutAct_9fa48("46459") ? "" : (stryCov_9fa48("46459"), 'N/A'))),
            nodeId: stryMutAct_9fa48("46462") ? metadata.nodeId && 'N/A' : stryMutAct_9fa48("46461") ? false : stryMutAct_9fa48("46460") ? true : (stryCov_9fa48("46460", "46461", "46462"), metadata.nodeId || (stryMutAct_9fa48("46463") ? "" : (stryCov_9fa48("46463"), 'N/A')))
          });
        }
      });

      // Build the history display content
      let content = stryMutAct_9fa48("46464") ? "" : (stryCov_9fa48("46464"), '{bold}{cyan-fg}State Transition History{/cyan-fg}{/bold}\n');
      content += stryMutAct_9fa48("46465") ? `` : (stryCov_9fa48("46465"), `{cyan-fg}Replica:{/cyan-fg} ${replicaId}\n`);
      content += stryMutAct_9fa48("46466") ? `` : (stryCov_9fa48("46466"), `{cyan-fg}Entries:{/cyan-fg} ${historyEntries.length}\n\n`);
      content += stryMutAct_9fa48("46467") ? "" : (stryCov_9fa48("46467"), '{cyan-fg}─────────────────────────────────────────────────{/cyan-fg}\n\n');
      for (const entry of historyEntries) {
        if (stryMutAct_9fa48("46468")) {
          {}
        } else {
          stryCov_9fa48("46468");
          // Color code the state transitions
          const stateColor = this.getStateColor(entry.newState);
          content += stryMutAct_9fa48("46469") ? `` : (stryCov_9fa48("46469"), `{white-fg}${entry.timestamp}{/white-fg}\n`);
          content += stryMutAct_9fa48("46470") ? `` : (stryCov_9fa48("46470"), `  {gray-fg}${stryMutAct_9fa48("46473") ? entry.previousState && '(none)' : stryMutAct_9fa48("46472") ? false : stryMutAct_9fa48("46471") ? true : (stryCov_9fa48("46471", "46472", "46473"), entry.previousState || (stryMutAct_9fa48("46474") ? "" : (stryCov_9fa48("46474"), '(none)')))}{/gray-fg} → `);
          content += stryMutAct_9fa48("46475") ? `` : (stryCov_9fa48("46475"), `{${stateColor}-fg}${entry.newState}{/${stateColor}-fg}\n`);
          if (stryMutAct_9fa48("46478") ? entry.reason || entry.reason !== 'N/A' : stryMutAct_9fa48("46477") ? false : stryMutAct_9fa48("46476") ? true : (stryCov_9fa48("46476", "46477", "46478"), entry.reason && (stryMutAct_9fa48("46480") ? entry.reason === 'N/A' : stryMutAct_9fa48("46479") ? true : (stryCov_9fa48("46479", "46480"), entry.reason !== (stryMutAct_9fa48("46481") ? "" : (stryCov_9fa48("46481"), 'N/A')))))) {
            if (stryMutAct_9fa48("46482")) {
              {}
            } else {
              stryCov_9fa48("46482");
              content += stryMutAct_9fa48("46483") ? `` : (stryCov_9fa48("46483"), `  {gray-fg}Reason:{/gray-fg} ${entry.reason}\n`);
            }
          }
          if (stryMutAct_9fa48("46486") ? entry.nodeId || entry.nodeId !== 'N/A' : stryMutAct_9fa48("46485") ? false : stryMutAct_9fa48("46484") ? true : (stryCov_9fa48("46484", "46485", "46486"), entry.nodeId && (stryMutAct_9fa48("46488") ? entry.nodeId === 'N/A' : stryMutAct_9fa48("46487") ? true : (stryCov_9fa48("46487", "46488"), entry.nodeId !== (stryMutAct_9fa48("46489") ? "" : (stryCov_9fa48("46489"), 'N/A')))))) {
            if (stryMutAct_9fa48("46490")) {
              {}
            } else {
              stryCov_9fa48("46490");
              content += stryMutAct_9fa48("46491") ? `` : (stryCov_9fa48("46491"), `  {gray-fg}Node:{/gray-fg} ${entry.nodeId}\n`);
            }
          }
          content += stryMutAct_9fa48("46492") ? "" : (stryCov_9fa48("46492"), '\n');
        }
      }
      content += stryMutAct_9fa48("46493") ? "" : (stryCov_9fa48("46493"), '{cyan-fg}─────────────────────────────────────────────────{/cyan-fg}\n');
      content += stryMutAct_9fa48("46494") ? "" : (stryCov_9fa48("46494"), '{gray-fg}Press Escape or any key to close{/gray-fg}');

      // Show in the help box (reusing it as a modal)
      this.helpBox.setContent(content);
      this.helpBox.setLabel(stryMutAct_9fa48("46495") ? "" : (stryCov_9fa48("46495"), ' Replica History '));
      this.helpBox.show();
      this.helpBox.focus();
      this.screen.render();
      this.updateStatus(stryMutAct_9fa48("46496") ? `` : (stryCov_9fa48("46496"), `Showing ${historyEntries.length} history entries`), stryMutAct_9fa48("46497") ? "" : (stryCov_9fa48("46497"), 'green'));
    }
  }

  /**
   * Get color for a replica state
   * @param {string} state - Replica state
   * @return {string} Color name
   */
  getStateColor(state) {
    if (stryMutAct_9fa48("46498")) {
      {}
    } else {
      stryCov_9fa48("46498");
      const stateColors = stryMutAct_9fa48("46499") ? {} : (stryCov_9fa48("46499"), {
        'pending': stryMutAct_9fa48("46500") ? "" : (stryCov_9fa48("46500"), 'blue'),
        'creating': stryMutAct_9fa48("46501") ? "" : (stryCov_9fa48("46501"), 'blue'),
        'syncing': stryMutAct_9fa48("46502") ? "" : (stryCov_9fa48("46502"), 'yellow'),
        'active': stryMutAct_9fa48("46503") ? "" : (stryCov_9fa48("46503"), 'green'),
        'removing': stryMutAct_9fa48("46504") ? "" : (stryCov_9fa48("46504"), 'yellow'),
        'removed': stryMutAct_9fa48("46505") ? "" : (stryCov_9fa48("46505"), 'gray'),
        'failed': stryMutAct_9fa48("46506") ? "" : (stryCov_9fa48("46506"), 'red')
      });
      return stryMutAct_9fa48("46509") ? stateColors[state] && 'white' : stryMutAct_9fa48("46508") ? false : stryMutAct_9fa48("46507") ? true : (stryCov_9fa48("46507", "46508", "46509"), stateColors[state] || (stryMutAct_9fa48("46510") ? "" : (stryCov_9fa48("46510"), 'white')));
    }
  }

  /**
   * Toggle detail panel visibility
   */
  toggleDetailPanel() {
    if (stryMutAct_9fa48("46511")) {
      {}
    } else {
      stryCov_9fa48("46511");
      this.showingDetail = stryMutAct_9fa48("46512") ? this.showingDetail : (stryCov_9fa48("46512"), !this.showingDetail);
      if (stryMutAct_9fa48("46514") ? false : stryMutAct_9fa48("46513") ? true : (stryCov_9fa48("46513", "46514"), this.showingDetail)) {
        if (stryMutAct_9fa48("46515")) {
          {}
        } else {
          stryCov_9fa48("46515");
          this.detailPanel.show();
          this.mainTable.width = stryMutAct_9fa48("46516") ? "" : (stryCov_9fa48("46516"), '60%');
          this.updateDetailPanel();
        }
      } else {
        if (stryMutAct_9fa48("46517")) {
          {}
        } else {
          stryCov_9fa48("46517");
          this.detailPanel.hide();
          this.mainTable.width = stryMutAct_9fa48("46518") ? "" : (stryCov_9fa48("46518"), '100%');
        }
      }
      this.screen.render();
    }
  }

  /**
   * Update the detail panel content
   */
  updateDetailPanel() {
    if (stryMutAct_9fa48("46519")) {
      {}
    } else {
      stryCov_9fa48("46519");
      const view = this.viewManager.getCurrentView();
      if (stryMutAct_9fa48("46522") ? !view && !view.getSelectedDetails : stryMutAct_9fa48("46521") ? false : stryMutAct_9fa48("46520") ? true : (stryCov_9fa48("46520", "46521", "46522"), (stryMutAct_9fa48("46523") ? view : (stryCov_9fa48("46523"), !view)) || (stryMutAct_9fa48("46524") ? view.getSelectedDetails : (stryCov_9fa48("46524"), !view.getSelectedDetails)))) {
        if (stryMutAct_9fa48("46525")) {
          {}
        } else {
          stryCov_9fa48("46525");
          this.detailPanel.setContent(stryMutAct_9fa48("46526") ? "" : (stryCov_9fa48("46526"), ' No details available'));
          return;
        }
      }
      const details = view.getSelectedDetails();
      if (stryMutAct_9fa48("46529") ? false : stryMutAct_9fa48("46528") ? true : stryMutAct_9fa48("46527") ? details : (stryCov_9fa48("46527", "46528", "46529"), !details)) {
        if (stryMutAct_9fa48("46530")) {
          {}
        } else {
          stryCov_9fa48("46530");
          this.detailPanel.setContent(stryMutAct_9fa48("46531") ? "" : (stryCov_9fa48("46531"), ' No item selected'));
          return;
        }
      }
      let content = stryMutAct_9fa48("46532") ? `` : (stryCov_9fa48("46532"), ` {bold}${details.title}{/bold}\n\n`);
      for (const section of stryMutAct_9fa48("46535") ? details.sections && [] : stryMutAct_9fa48("46534") ? false : stryMutAct_9fa48("46533") ? true : (stryCov_9fa48("46533", "46534", "46535"), details.sections || (stryMutAct_9fa48("46536") ? ["Stryker was here"] : (stryCov_9fa48("46536"), [])))) {
        if (stryMutAct_9fa48("46537")) {
          {}
        } else {
          stryCov_9fa48("46537");
          content += stryMutAct_9fa48("46538") ? `` : (stryCov_9fa48("46538"), `{cyan-fg}── ${section.title} ──{/cyan-fg}\n`);
          for (const field of stryMutAct_9fa48("46541") ? section.fields && [] : stryMutAct_9fa48("46540") ? false : stryMutAct_9fa48("46539") ? true : (stryCov_9fa48("46539", "46540", "46541"), section.fields || (stryMutAct_9fa48("46542") ? ["Stryker was here"] : (stryCov_9fa48("46542"), [])))) {
            if (stryMutAct_9fa48("46543")) {
              {}
            } else {
              stryCov_9fa48("46543");
              content += stryMutAct_9fa48("46544") ? `` : (stryCov_9fa48("46544"), `  ${field.label}: ${field.value}\n`);
            }
          }
          content += stryMutAct_9fa48("46545") ? "" : (stryCov_9fa48("46545"), '\n');
        }
      }
      if (stryMutAct_9fa48("46547") ? false : stryMutAct_9fa48("46546") ? true : (stryCov_9fa48("46546", "46547"), details.relatedCounts)) {
        if (stryMutAct_9fa48("46548")) {
          {}
        } else {
          stryCov_9fa48("46548");
          content += stryMutAct_9fa48("46549") ? "" : (stryCov_9fa48("46549"), '{cyan-fg}── Related ──{/cyan-fg}\n');
          for (const [key, value] of Object.entries(details.relatedCounts)) {
            if (stryMutAct_9fa48("46550")) {
              {}
            } else {
              stryCov_9fa48("46550");
              content += stryMutAct_9fa48("46551") ? `` : (stryCov_9fa48("46551"), `  ${key}: ${value}\n`);
            }
          }
          content += stryMutAct_9fa48("46552") ? "" : (stryCov_9fa48("46552"), '\n');
        }
      }
      if (stryMutAct_9fa48("46555") ? details.navigationLinks || details.navigationLinks.length > 0 : stryMutAct_9fa48("46554") ? false : stryMutAct_9fa48("46553") ? true : (stryCov_9fa48("46553", "46554", "46555"), details.navigationLinks && (stryMutAct_9fa48("46558") ? details.navigationLinks.length <= 0 : stryMutAct_9fa48("46557") ? details.navigationLinks.length >= 0 : stryMutAct_9fa48("46556") ? true : (stryCov_9fa48("46556", "46557", "46558"), details.navigationLinks.length > 0)))) {
        if (stryMutAct_9fa48("46559")) {
          {}
        } else {
          stryCov_9fa48("46559");
          content += stryMutAct_9fa48("46560") ? "" : (stryCov_9fa48("46560"), '{cyan-fg}── Navigation ──{/cyan-fg}\n');
          for (const link of details.navigationLinks) {
            if (stryMutAct_9fa48("46561")) {
              {}
            } else {
              stryCov_9fa48("46561");
              const keyHint = link.key ? stryMutAct_9fa48("46562") ? `` : (stryCov_9fa48("46562"), `[${link.key}] `) : stryMutAct_9fa48("46563") ? "Stryker was here!" : (stryCov_9fa48("46563"), '');
              content += stryMutAct_9fa48("46564") ? `` : (stryCov_9fa48("46564"), `  ${keyHint}${link.label}\n`);
            }
          }
        }
      }
      this.detailPanel.setContent(content);
    }
  }

  /**
   * Force refresh cache from server
   */
  forceRefresh() {
    if (stryMutAct_9fa48("46565")) {
      {}
    } else {
      stryCov_9fa48("46565");
      this.updateStatus(stryMutAct_9fa48("46566") ? "" : (stryCov_9fa48("46566"), 'Refreshing...'), stryMutAct_9fa48("46567") ? "" : (stryCov_9fa48("46567"), 'yellow'));
      stryMutAct_9fa48("46568") ? this.connectionManager.requestCacheDump() : (stryCov_9fa48("46568"), this.connectionManager.requestCacheDump?.());
    }
  }

  /**
   * Toggle CDC pause state
   */
  toggleCDCPause() {
    if (stryMutAct_9fa48("46569")) {
      {}
    } else {
      stryCov_9fa48("46569");
      this.cdcPaused = stryMutAct_9fa48("46570") ? this.cdcPaused : (stryCov_9fa48("46570"), !this.cdcPaused);
      this.updateHeader();
      this.updateStatus(this.cdcPaused ? stryMutAct_9fa48("46571") ? "" : (stryCov_9fa48("46571"), 'CDC updates paused') : stryMutAct_9fa48("46572") ? "" : (stryCov_9fa48("46572"), 'CDC updates resumed'), this.cdcPaused ? stryMutAct_9fa48("46573") ? "" : (stryCov_9fa48("46573"), 'yellow') : stryMutAct_9fa48("46574") ? "" : (stryCov_9fa48("46574"), 'green'));
    }
  }

  /**
   * Show help overlay
   */
  showHelpOverlay() {
    if (stryMutAct_9fa48("46575")) {
      {}
    } else {
      stryCov_9fa48("46575");
      const helpText = this.helpOverlay.formatHelpText(this.currentView);
      this.helpBox.setContent(helpText);
      this.helpBox.show();
      this.helpBox.focus();
      this.screen.render();
    }
  }

  /**
   * Hide help overlay
   */
  hideHelpOverlay() {
    if (stryMutAct_9fa48("46576")) {
      {}
    } else {
      stryCov_9fa48("46576");
      this.helpBox.hide();
      this.screen.render();
    }
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    if (stryMutAct_9fa48("46577")) {
      {}
    } else {
      stryCov_9fa48("46577");
      this.updateStatus(stryMutAct_9fa48("46578") ? `` : (stryCov_9fa48("46578"), `Error: ${message}`), stryMutAct_9fa48("46579") ? "" : (stryCov_9fa48("46579"), 'red'));
    }
  }

  /**
   * Handle screen resize
   */
  handleResize() {
    if (stryMutAct_9fa48("46580")) {
      {}
    } else {
      stryCov_9fa48("46580");
      this.refreshCurrentView();
    }
  }

  /**
   * Reconnect to a different node
   * @param {string} address - New node address
   */
  async reconnect(address) {
    if (stryMutAct_9fa48("46581")) {
      {}
    } else {
      stryCov_9fa48("46581");
      this.updateStatus(stryMutAct_9fa48("46582") ? `` : (stryCov_9fa48("46582"), `Reconnecting to ${address}...`), stryMutAct_9fa48("46583") ? "" : (stryCov_9fa48("46583"), 'yellow'));
      this.connectionManager.disconnect();
      try {
        if (stryMutAct_9fa48("46584")) {
          {}
        } else {
          stryCov_9fa48("46584");
          await this.connect(address);
        }
      } catch (err) {
        if (stryMutAct_9fa48("46585")) {
          {}
        } else {
          stryCov_9fa48("46585");
          this.showError(stryMutAct_9fa48("46586") ? `` : (stryCov_9fa48("46586"), `Failed to reconnect: ${err.message}`));
        }
      }
    }
  }

  /**
   * Quit the application
   */
  quit() {
    if (stryMutAct_9fa48("46587")) {
      {}
    } else {
      stryCov_9fa48("46587");
      this.cleanup();
      process.exit(0);
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (stryMutAct_9fa48("46588")) {
      {}
    } else {
      stryCov_9fa48("46588");
      if (stryMutAct_9fa48("46590") ? false : stryMutAct_9fa48("46589") ? true : (stryCov_9fa48("46589", "46590"), this.connectionManager)) this.connectionManager.disconnect();
      if (stryMutAct_9fa48("46592") ? false : stryMutAct_9fa48("46591") ? true : (stryCov_9fa48("46591", "46592"), this.screen)) this.screen.destroy();
    }
  }

  /**
   * Show help information
   */
  showHelp() {
    if (stryMutAct_9fa48("46593")) {
      {}
    } else {
      stryCov_9fa48("46593");
      const optionsText = (stryMutAct_9fa48("46594") ? [] : (stryCov_9fa48("46594"), [stryMutAct_9fa48("46595") ? `` : (stryCov_9fa48("46595"), `  ${CLI_FLAG.HELP_SHORT}, ${CLI_FLAG.HELP}      Show this help message`), stryMutAct_9fa48("46596") ? `` : (stryCov_9fa48("46596"), `  ${CLI_FLAG.VERSION_SHORT}, ${CLI_FLAG.VERSION}   Show version information`), stryMutAct_9fa48("46597") ? `` : (stryCov_9fa48("46597"), `  ${CLI_FLAG.READ_ONLY}     Enable read-only mode (SELECT queries only)`)])).join(stryMutAct_9fa48("46598") ? "" : (stryCov_9fa48("46598"), '\n'));
      const examplesText = CLI_HELP_TEXT.EXAMPLES.map(stryMutAct_9fa48("46599") ? () => undefined : (stryCov_9fa48("46599"), example => stryMutAct_9fa48("46600") ? `` : (stryCov_9fa48("46600"), `  ${example}`))).join(stryMutAct_9fa48("46601") ? "" : (stryCov_9fa48("46601"), '\n'));
      console.log(stryMutAct_9fa48("46604") ? this.helpOverlay?.getUsageText() && `
${CLI_HELP_TEXT.TITLE}

${CLI_HELP_TEXT.USAGE}

Options:
${optionsText}

Examples:
${examplesText}
` : stryMutAct_9fa48("46603") ? false : stryMutAct_9fa48("46602") ? true : (stryCov_9fa48("46602", "46603", "46604"), (stryMutAct_9fa48("46605") ? this.helpOverlay.getUsageText() : (stryCov_9fa48("46605"), this.helpOverlay?.getUsageText())) || (stryMutAct_9fa48("46606") ? `` : (stryCov_9fa48("46606"), `
${CLI_HELP_TEXT.TITLE}

${CLI_HELP_TEXT.USAGE}

Options:
${optionsText}

Examples:
${examplesText}
`))));
    }
  }

  /**
   * Show version information
   */
  showVersion() {
    if (stryMutAct_9fa48("46607")) {
      {}
    } else {
      stryCov_9fa48("46607");
      console.log(stryMutAct_9fa48("46608") ? `` : (stryCov_9fa48("46608"), `${CLI_VERSION_PREFIX}${CLI_VERSION}`));
    }
  }
}