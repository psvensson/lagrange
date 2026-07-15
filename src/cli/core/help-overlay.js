import {LISTENER_PORT_DEFAULT} from '../../config/listener-port-model.js';

const LOCAL_STR_NAVIGATION = 'Navigation';
const LOCAL_STR_1UYVY = '↑/↓';
const LOCAL_STR_MOVE_SELECTION_UP_DOWN = 'Move selection up/down';
const LOCAL_STR_PAGE_UP_DOWN = 'Page Up/Down';
const LOCAL_STR_SCROLL_PAGE_UP_DOWN = 'Scroll page up/down';
const LOCAL_STR_HOME_END = 'Home/End';
const LOCAL_STR_JUMP_TO_FIRST_LAST_ROW = 'Jump to first/last row';
const LOCAL_STR_ENTER = 'Enter';
const LOCAL_STR_DRILL_DOWN_INTO_SELECTED_ITEM = 'Drill down into selected item';
const LOCAL_STR_ESCAPE_BACKSPACE = 'Escape/Backspace';
const LOCAL_STR_GO_BACK_ONE_LEVEL = 'Go back one level';
const LOCAL_STR_VIEWS = 'Views';
const LOCAL_STR_1 = '1';
const LOCAL_STR_NODES_VIEW = 'Nodes view';
const LOCAL_STR_2 = '2';
const LOCAL_STR_REPLICAS_VIEW = 'Replicas view';
const LOCAL_STR_3 = '3';
const LOCAL_STR_TABLES_VIEW = 'Tables view';
const LOCAL_STR_4 = '4';
const LOCAL_STR_PARTITIONS_VIEW = 'Partitions view';
const LOCAL_STR_5 = '5';
const LOCAL_STR_MESSAGE_GROUPS_VIEW = 'Message Groups view';
const LOCAL_STR_6 = '6';
const LOCAL_STR_SQL_QUERY_VIEW = 'SQL Query view';
const LOCAL_STR_7 = '7';
const LOCAL_STR_LOGS_VIEW = 'Logs view';
const LOCAL_STR_8 = '8';
const LOCAL_STR_CONFIG_VIEW = 'Config view';
const LOCAL_STR_9 = '9';
const LOCAL_STR_CONTEXTS_VIEW = 'Contexts view';
const LOCAL_STR_0 = '0';
const LOCAL_STR_SERVICES_VIEW = 'Services view';
const LOCAL_STR_ACTIONS = 'Actions';
const LOCAL_STR_SLASH = '/';
const LOCAL_STR_ENTER_FILTER_MODE = 'Enter filter mode';
const LOCAL_STR_COLON = ':';
const LOCAL_STR_ENTER_COMMAND_MODE = 'Enter command mode';
const LOCAL_STR_D = 'd';
const LOCAL_STR_SHOW_DETAIL_PANEL = 'Show detail panel';
const LOCAL_STR_R = 'r';
const LOCAL_STR_REFRESH_DATA = 'Refresh data';
const LOCAL_STR_S = 's';
const LOCAL_STR_SORT_BY_COLUMN = 'Sort by column';
const LOCAL_STR_GENERAL = 'General';
const LOCAL_STR_QUESTION = '?';
const LOCAL_STR_SHOW_THIS_HELP = 'Show this help';
const LOCAL_STR_Q = 'q';
const LOCAL_STR_QUIT_APPLICATION = 'Quit application';
const LOCAL_STR_CTRL_C = 'Ctrl+C';
const LOCAL_STR_FORCE_QUIT = 'Force quit';
const LOCAL_STR_NODES_VIEW_2 = 'Nodes View';
const LOCAL_STR_DISPLAYS_ALL_NODES_IN_THE_CLUSTER_WITH_R = 'Displays all nodes in the cluster with resource usage.';
const LOCAL_STR_VIEW_SERVICES_ON_SELECTED_NODE = 'View services on selected node';
const LOCAL_STR_C = 'c';
const LOCAL_STR_CONNECT_TO_SELECTED_NODE = 'Connect to selected node';
const LOCAL_STR_SERVICES_VIEW_2 = 'Services View';
const LOCAL_STR_DISPLAYS_LOGICAL_SERVICE_DEFINITIONS_AND = 'Displays logical service definitions and health.';
const LOCAL_STR_VIEW_REPLICAS_FOR_SELECTED_SERVICE = 'View replicas for selected service';
const LOCAL_STR_REPLICAS_VIEW_2 = 'Replicas View';
const LOCAL_STR_DISPLAYS_CONCRETE_REPLICAS_RUNNING_ON_NO = 'Displays concrete replicas running on nodes.';
const LOCAL_STR_VIEW_REPLICA_DETAILS = 'View replica details';
const LOCAL_STR_T = 't';
const LOCAL_STR_FILTER_BY_REPLICA_TYPE = 'Filter by replica type';
const LOCAL_STR_TABLES_VIEW_2 = 'Tables View';
const LOCAL_STR_DISPLAYS_ALL_TABLES_WITH_PARTITION_AND_R = 'Displays all tables with partition and replica info.';
const LOCAL_STR_VIEW_PARTITIONS_FOR_TABLE = 'View partitions for table';
const LOCAL_STR_P = 'p';
const LOCAL_STR_VIEW_TABLE_POLICIES = 'View table policies';
const LOCAL_STR_PARTITIONS_VIEW_2 = 'Partitions View';
const LOCAL_STR_DISPLAYS_PARTITIONS_FOR_A_TABLE = 'Displays partitions for a table.';
const LOCAL_STR_VIEW_PARTITION_REPLICAS = 'View partition replicas';
const LOCAL_STR_N = 'n';
const LOCAL_STR_JUMP_TO_LEADER_NODE = 'Jump to leader node';
const LOCAL_STR_TW2WE = 'Message Groups View';
const LOCAL_STR_DISPLAYS_MESSAGE_GROUP_DISTRIBUTION = 'Displays message group distribution.';
const LOCAL_STR_VIEW_REPLICA_LOCATIONS = 'View replica locations';
const LOCAL_STR_SQL_QUERY_VIEW_2 = 'SQL Query View';
const LOCAL_STR_EXECUTE_SQL_QUERIES_AGAINST_THE_DATABASE = 'Execute SQL queries against the database.';
const LOCAL_STR_CTRL_ENTER = 'Ctrl+Enter';
const LOCAL_STR_EXECUTE_QUERY = 'Execute query';
const LOCAL_STR_NAVIGATE_QUERY_HISTORY = 'Navigate query history';
const LOCAL_STR_TAB = 'Tab';
const LOCAL_STR_AUTOCOMPLETE_TABLE_NAME = 'Autocomplete table name';
const LOCAL_STR_ESCAPE = 'Escape';
const LOCAL_STR_CLEAR_INPUT = 'Clear input';
const LOCAL_STR_CTRL_L = 'Ctrl+L';
const LOCAL_STR_START_LIVE_QUERY = 'Start live query';
const LOCAL_STR_LOGS_VIEW_2 = 'Logs View';
const LOCAL_STR_VIEW_AND_FILTER_SYSTEM_LOGS = 'View and filter system logs.';
const LOCAL_STR_VIEW_FULL_LOG_ENTRY = 'View full log entry';
const LOCAL_STR_L = 'l';
const LOCAL_STR_FILTER_BY_LOG_LEVEL = 'Filter by log level';
const LOCAL_STR_FILTER_BY_NODE = 'Filter by node';
const LOCAL_STR_E = 'e';
const LOCAL_STR_EXPORT_FILTERED_LOGS = 'Export filtered logs';
const LOCAL_STR_CONFIG_VIEW_2 = 'Config View';
const LOCAL_STR_VIEW_AND_EDIT_SYSTEM_CONFIGURATION = 'View and edit system configuration.';
const LOCAL_STR_EDIT_CONFIG_VALUE = 'Edit config value';
const LOCAL_STR_REVERT_TO_DEFAULT = 'Revert to default';
const LOCAL_STR_CONTEXTS_VIEW_2 = 'Contexts View';
const LOCAL_STR_VIEW_FUNCTION_EXECUTION_CONTEXTS = 'View function execution contexts.';
const LOCAL_STR_VIEW_CONTEXT_DETAILS = 'View context details';
const LOCAL_STR_FILTER_BY_CONTEXT_TYPE = 'Filter by context type';
const LOCAL_STR_OPERATIONS_VIEW = 'Operations View';
const LOCAL_STR_VIEW_REPLICA_OPERATIONS_WITH_WORKFLOW_ST = 'View replica operations with workflow steps and history.';
const LOCAL_STR_VIEW_OPERATION_DETAILS = 'View operation details';
const LOCAL_STR_I = 'i';
const LOCAL_STR_FILTER_IN_FLIGHT_OPERATIONS_ONLY = 'Filter in-flight operations only';
const LOCAL_STR_F = 'f';
const LOCAL_STR_FILTER_FAILED_OPERATIONS_ONLY = 'Filter failed operations only';
const LOCAL_STR_O7OJW = '╔════════════════════════════════════════════════════════════╗';
const LOCAL_STR_KEYBOARD_SHORTCUTS = '║                      KEYBOARD SHORTCUTS                     ║';
const LOCAL_STR_146V0 = '╚════════════════════════════════════════════════════════════╝';
const LOCAL_STR_PRESS_ANY_KEY_TO_CLOSE_THIS_HELP = 'Press any key to close this help';
const LOCAL_STR_NEWLINE = '\n';
const LOCAL_NUM_SIXTEEN = 16;
const LOCAL_STR_SQL = 'sql';
const LOCAL_STR_CTRL_X_EXECUTE = 'Ctrl+X:Execute';
const LOCAL_STR_LOGS = 'logs';
const LOCAL_STR_L_LEVEL = 'l:Level';
const LOCAL_STR_N_NODE = 'n:Node';
const LOCAL_STR_CONFIG = 'config';
const LOCAL_STR_E_EDIT = 'e:Edit';
const LOCAL_STR_R_REVERT = 'R:Revert';
const LOCAL_STR_ENTER_DETAILS = 'Enter:Details';
const LOCAL_STR_ENTER_DRILL_DOWN = 'Enter:Drill Down';
const LOCAL_STR_SPACE_PIPE_SPACE = ' | ';
const LOCAL_STR_HELP_SHOW = 'help:show';
const LOCAL_STR_HELP_HIDE = 'help:hide';

/**
 * HelpOverlay - Help overlay displaying keyboard shortcuts and context-sensitive help
 *
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5
 */

/**
 * @typedef {Object} ShortcutCategory
 * @property {string} name - Category name
 * @property {Array<{key: string, description: string}>} shortcuts - Shortcuts
 */

/**
 * @typedef {Object} ViewHelp
 * @property {string} title - View title
 * @property {string} description - View description
 * @property {Array<{key: string, description: string}>} shortcuts - View-specific shortcuts
 */

/**
 * HelpOverlay class for displaying help information
 */
export class HelpOverlay {
  /**
   * @param {Object} options - Configuration options
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus || null;
    this.visible = false;

    // Global keyboard shortcuts organized by category
    this.globalShortcuts = this.getGlobalShortcuts();

    // View-specific help
    this.viewHelp = this.getViewHelp();
  }

  /**
   * Get global keyboard shortcuts organized by category
   * @returns {ShortcutCategory[]}
   */
  getGlobalShortcuts() {
    return [
      {
        name: LOCAL_STR_NAVIGATION,
        shortcuts: [
          {key: LOCAL_STR_1UYVY, description: LOCAL_STR_MOVE_SELECTION_UP_DOWN},
          {key: LOCAL_STR_PAGE_UP_DOWN, description: LOCAL_STR_SCROLL_PAGE_UP_DOWN},
          {key: LOCAL_STR_HOME_END, description: LOCAL_STR_JUMP_TO_FIRST_LAST_ROW},
          {key: LOCAL_STR_ENTER, description: LOCAL_STR_DRILL_DOWN_INTO_SELECTED_ITEM},
          {key: LOCAL_STR_ESCAPE_BACKSPACE, description: LOCAL_STR_GO_BACK_ONE_LEVEL},
        ],
      },
      {
        name: LOCAL_STR_VIEWS,
        shortcuts: [
          {key: LOCAL_STR_1, description: LOCAL_STR_NODES_VIEW},
          {key: LOCAL_STR_2, description: LOCAL_STR_REPLICAS_VIEW},
          {key: LOCAL_STR_3, description: LOCAL_STR_TABLES_VIEW},
          {key: LOCAL_STR_4, description: LOCAL_STR_PARTITIONS_VIEW},
          {key: LOCAL_STR_5, description: LOCAL_STR_MESSAGE_GROUPS_VIEW},
          {key: LOCAL_STR_6, description: LOCAL_STR_SQL_QUERY_VIEW},
          {key: LOCAL_STR_7, description: LOCAL_STR_LOGS_VIEW},
          {key: LOCAL_STR_8, description: LOCAL_STR_CONFIG_VIEW},
          {key: LOCAL_STR_9, description: LOCAL_STR_CONTEXTS_VIEW},
          {key: LOCAL_STR_0, description: LOCAL_STR_SERVICES_VIEW},
        ],
      },
      {
        name: LOCAL_STR_ACTIONS,
        shortcuts: [
          {key: LOCAL_STR_SLASH, description: LOCAL_STR_ENTER_FILTER_MODE},
          {key: LOCAL_STR_COLON, description: LOCAL_STR_ENTER_COMMAND_MODE},
          {key: LOCAL_STR_D, description: LOCAL_STR_SHOW_DETAIL_PANEL},
          {key: LOCAL_STR_R, description: LOCAL_STR_REFRESH_DATA},
          {key: LOCAL_STR_S, description: LOCAL_STR_SORT_BY_COLUMN},
        ],
      },
      {
        name: LOCAL_STR_GENERAL,
        shortcuts: [
          {key: LOCAL_STR_QUESTION, description: LOCAL_STR_SHOW_THIS_HELP},
          {key: LOCAL_STR_Q, description: LOCAL_STR_QUIT_APPLICATION},
          {key: LOCAL_STR_CTRL_C, description: LOCAL_STR_FORCE_QUIT},
        ],
      },
    ];
  }

  /**
   * Get view-specific help information
   * @returns {Object<string, ViewHelp>}
   */
  getViewHelp() {
    return {
      nodes: {
        title: LOCAL_STR_NODES_VIEW_2,
        description: LOCAL_STR_DISPLAYS_ALL_NODES_IN_THE_CLUSTER_WITH_R,
        shortcuts: [
          {key: LOCAL_STR_ENTER, description: LOCAL_STR_VIEW_SERVICES_ON_SELECTED_NODE},
          {key: LOCAL_STR_C, description: LOCAL_STR_CONNECT_TO_SELECTED_NODE},
        ],
      },
      services: {
        title: LOCAL_STR_SERVICES_VIEW_2,
        description: LOCAL_STR_DISPLAYS_LOGICAL_SERVICE_DEFINITIONS_AND,
        shortcuts: [
          {key: LOCAL_STR_ENTER, description: LOCAL_STR_VIEW_REPLICAS_FOR_SELECTED_SERVICE},
        ],
      },
      replicas: {
        title: LOCAL_STR_REPLICAS_VIEW_2,
        description: LOCAL_STR_DISPLAYS_CONCRETE_REPLICAS_RUNNING_ON_NO,
        shortcuts: [
          {key: LOCAL_STR_ENTER, description: LOCAL_STR_VIEW_REPLICA_DETAILS},
          {key: LOCAL_STR_T, description: LOCAL_STR_FILTER_BY_REPLICA_TYPE},
        ],
      },
      tables: {
        title: LOCAL_STR_TABLES_VIEW_2,
        description: LOCAL_STR_DISPLAYS_ALL_TABLES_WITH_PARTITION_AND_R,
        shortcuts: [
          {key: LOCAL_STR_ENTER, description: LOCAL_STR_VIEW_PARTITIONS_FOR_TABLE},
          {key: LOCAL_STR_P, description: LOCAL_STR_VIEW_TABLE_POLICIES},
        ],
      },
      partitions: {
        title: LOCAL_STR_PARTITIONS_VIEW_2,
        description: LOCAL_STR_DISPLAYS_PARTITIONS_FOR_A_TABLE,
        shortcuts: [
          {key: LOCAL_STR_ENTER, description: LOCAL_STR_VIEW_PARTITION_REPLICAS},
          {key: LOCAL_STR_N, description: LOCAL_STR_JUMP_TO_LEADER_NODE},
        ],
      },
      message_groups: {
        title: LOCAL_STR_TW2WE,
        description: LOCAL_STR_DISPLAYS_MESSAGE_GROUP_DISTRIBUTION,
        shortcuts: [
          {key: LOCAL_STR_ENTER, description: LOCAL_STR_VIEW_REPLICA_LOCATIONS},
        ],
      },
      sql: {
        title: LOCAL_STR_SQL_QUERY_VIEW_2,
        description: LOCAL_STR_EXECUTE_SQL_QUERIES_AGAINST_THE_DATABASE,
        shortcuts: [
          {key: LOCAL_STR_CTRL_ENTER, description: LOCAL_STR_EXECUTE_QUERY},
          {key: LOCAL_STR_1UYVY, description: LOCAL_STR_NAVIGATE_QUERY_HISTORY},
          {key: LOCAL_STR_TAB, description: LOCAL_STR_AUTOCOMPLETE_TABLE_NAME},
          {key: LOCAL_STR_ESCAPE, description: LOCAL_STR_CLEAR_INPUT},
          {key: LOCAL_STR_CTRL_L, description: LOCAL_STR_START_LIVE_QUERY},
        ],
      },
      logs: {
        title: LOCAL_STR_LOGS_VIEW_2,
        description: LOCAL_STR_VIEW_AND_FILTER_SYSTEM_LOGS,
        shortcuts: [
          {key: LOCAL_STR_ENTER, description: LOCAL_STR_VIEW_FULL_LOG_ENTRY},
          {key: LOCAL_STR_L, description: LOCAL_STR_FILTER_BY_LOG_LEVEL},
          {key: LOCAL_STR_N, description: LOCAL_STR_FILTER_BY_NODE},
          {key: LOCAL_STR_E, description: LOCAL_STR_EXPORT_FILTERED_LOGS},
        ],
      },
      config: {
        title: LOCAL_STR_CONFIG_VIEW_2,
        description: LOCAL_STR_VIEW_AND_EDIT_SYSTEM_CONFIGURATION,
        shortcuts: [
          {key: LOCAL_STR_ENTER, description: LOCAL_STR_EDIT_CONFIG_VALUE},
          {key: LOCAL_STR_R, description: LOCAL_STR_REVERT_TO_DEFAULT},
        ],
      },
      contexts: {
        title: LOCAL_STR_CONTEXTS_VIEW_2,
        description: LOCAL_STR_VIEW_FUNCTION_EXECUTION_CONTEXTS,
        shortcuts: [
          {key: LOCAL_STR_ENTER, description: LOCAL_STR_VIEW_CONTEXT_DETAILS},
          {key: LOCAL_STR_T, description: LOCAL_STR_FILTER_BY_CONTEXT_TYPE},
        ],
      },
      operations: {
        title: LOCAL_STR_OPERATIONS_VIEW,
        description: LOCAL_STR_VIEW_REPLICA_OPERATIONS_WITH_WORKFLOW_ST,
        shortcuts: [
          {key: LOCAL_STR_ENTER, description: LOCAL_STR_VIEW_OPERATION_DETAILS},
          {key: LOCAL_STR_I, description: LOCAL_STR_FILTER_IN_FLIGHT_OPERATIONS_ONLY},
          {key: LOCAL_STR_F, description: LOCAL_STR_FILTER_FAILED_OPERATIONS_ONLY},
        ],
      },
    };
  }

  /**
   * Get help content for current view
   * @param {string} currentView - Current view name
   * @returns {Object} Help content
   */
  getHelpContent(currentView) {
    const viewHelp = this.viewHelp[currentView] || null;

    return {
      globalShortcuts: this.globalShortcuts,
      viewHelp,
      currentView,
    };
  }

  /**
   * Format help content as text for display
   * @param {string} currentView - Current view name
   * @returns {string} Formatted help text
   */
  formatHelpText(currentView) {
    const content = this.getHelpContent(currentView);
    const lines = [];

    // Title
    lines.push(LOCAL_STR_O7OJW);
    lines.push(LOCAL_STR_KEYBOARD_SHORTCUTS);
    lines.push(LOCAL_STR_146V0);
    lines.push('');

    // View-specific help first (if available)
    if (content.viewHelp) {
      lines.push(`── ${content.viewHelp.title} ──`);
      lines.push(content.viewHelp.description);
      lines.push('');

      for (const shortcut of content.viewHelp.shortcuts) {
        lines.push(`  ${this.padKey(shortcut.key)}  ${shortcut.description}`);
      }
      lines.push('');
    }

    // Global shortcuts by category
    for (const category of content.globalShortcuts) {
      lines.push(`── ${category.name} ──`);
      for (const shortcut of category.shortcuts) {
        lines.push(`  ${this.padKey(shortcut.key)}  ${shortcut.description}`);
      }
      lines.push('');
    }

    lines.push(LOCAL_STR_PRESS_ANY_KEY_TO_CLOSE_THIS_HELP);

    return lines.join(LOCAL_STR_NEWLINE);
  }

  /**
   * Pad a key string for alignment
   * @param {string} key - Key string
   * @returns {string} Padded key
   */
  padKey(key) {
    return key.padEnd(LOCAL_NUM_SIXTEEN);
  }

  /**
   * Get status bar hints for current view
   * @param {string} currentView - Current view name
   * @returns {string} Status bar hint text
   */
  getStatusBarHints(currentView) {
    const hints = ['?:Help', 'q:Quit', '/:Filter', '::Command'];

    // Add view-specific hints
    switch (currentView) {
    case LOCAL_STR_SQL:
      hints.unshift(LOCAL_STR_CTRL_X_EXECUTE);
      break;
    case LOCAL_STR_LOGS:
      hints.unshift(LOCAL_STR_L_LEVEL, LOCAL_STR_N_NODE);
      break;
    case LOCAL_STR_CONFIG:
      hints.unshift(LOCAL_STR_E_EDIT, LOCAL_STR_R_REVERT, LOCAL_STR_ENTER_DETAILS);
      break;
    default:
      hints.unshift(LOCAL_STR_ENTER_DRILL_DOWN);
    }

    return hints.join(LOCAL_STR_SPACE_PIPE_SPACE);
  }

  /**
   * Get CLI usage information (for --help flag)
   * @returns {string} Usage text
   */
  getUsageText() {
    return `
lagrange-admin - Distributed Database Administration CLI

USAGE:
  lagrange-admin [OPTIONS] [NODE_ADDRESS]

ARGUMENTS:
  NODE_ADDRESS    Address of node to connect to (e.g., localhost:${LISTENER_PORT_DEFAULT.ADMIN_WEBSOCKET})

OPTIONS:
  -h, --help              Show this help message and exit
  -v, --version           Show version information
  --config <path>         Path to configuration file
  --refresh <ms>          Refresh interval in milliseconds (default: 5000)
  --view <name>           Initial view (nodes, services, tables, etc.)
  --read-only             Enable read-only mode (no write queries)
  --monochrome            Disable colors for terminals without color support

ENVIRONMENT VARIABLES:
  LAGRANGE_NODE_ADDRESS        Default node address
  LAGRANGE_REFRESH_INTERVAL    Default refresh interval

EXAMPLES:
  lagrange-admin localhost:${LISTENER_PORT_DEFAULT.ADMIN_WEBSOCKET}
  lagrange-admin --view tables --read-only localhost:${LISTENER_PORT_DEFAULT.ADMIN_WEBSOCKET}
  LAGRANGE_NODE_ADDRESS=localhost:${LISTENER_PORT_DEFAULT.ADMIN_WEBSOCKET} lagrange-admin

For more information, see the documentation at:
  https://github.com/your-org/distributed-database/docs/admin-cli
`.trim();
  }

  /**
   * Show the help overlay
   */
  show() {
    this.visible = true;
    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_HELP_SHOW, {});
    }
  }

  /**
   * Hide the help overlay
   */
  hide() {
    this.visible = false;
    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_HELP_HIDE, {});
    }
  }

  /**
   * Toggle help overlay visibility
   */
  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if help overlay is visible
   * @returns {boolean}
   */
  isVisible() {
    return this.visible;
  }

  /**
   * Handle key input (any key dismisses help)
   * @param {Object} _key - Key event
   * @returns {boolean} True if key was handled
   */
  handleKey(_key) {
    if (this.visible) {
      this.hide();
      return true;
    }
    return false;
  }

  /**
   * Get all shortcuts as a flat list
   * @returns {Array<{category: string, key: string, description: string}>}
   */
  getAllShortcuts() {
    const result = [];
    for (const category of this.globalShortcuts) {
      for (const shortcut of category.shortcuts) {
        result.push({
          category: category.name,
          key: shortcut.key,
          description: shortcut.description,
        });
      }
    }
    return result;
  }

  /**
   * Get shortcuts for a specific category
   * @param {string} categoryName - Category name
   * @returns {Array<{key: string, description: string}>}
   */
  getShortcutsByCategory(categoryName) {
    const category = this.globalShortcuts.find((c) => c.name === categoryName);
    return category ? category.shortcuts : [];
  }

  /**
   * Get view-specific shortcuts
   * @param {string} viewName - View name
   * @returns {Array<{key: string, description: string}>}
   */
  getViewShortcuts(viewName) {
    const viewHelp = this.viewHelp[viewName];
    return viewHelp ? viewHelp.shortcuts : [];
  }
}
