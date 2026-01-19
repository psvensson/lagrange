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
        name: 'Navigation',
        shortcuts: [
          {key: '↑/↓', description: 'Move selection up/down'},
          {key: 'Page Up/Down', description: 'Scroll page up/down'},
          {key: 'Home/End', description: 'Jump to first/last row'},
          {key: 'Enter', description: 'Drill down into selected item'},
          {key: 'Escape/Backspace', description: 'Go back one level'},
        ],
      },
      {
        name: 'Views',
        shortcuts: [
          {key: '1', description: 'Nodes view'},
          {key: '2', description: 'Services view'},
          {key: '3', description: 'Tables view'},
          {key: '4', description: 'Partitions view'},
          {key: '5', description: 'Message Groups view'},
          {key: '6', description: 'SQL Query view'},
          {key: '7', description: 'Logs view'},
          {key: '8', description: 'Config view'},
          {key: '9', description: 'Contexts view'},
        ],
      },
      {
        name: 'Actions',
        shortcuts: [
          {key: '/', description: 'Enter filter mode'},
          {key: ':', description: 'Enter command mode'},
          {key: 'd', description: 'Show detail panel'},
          {key: 'r', description: 'Refresh data'},
          {key: 's', description: 'Sort by column'},
        ],
      },
      {
        name: 'General',
        shortcuts: [
          {key: '?', description: 'Show this help'},
          {key: 'q', description: 'Quit application'},
          {key: 'Ctrl+C', description: 'Force quit'},
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
        title: 'Nodes View',
        description: 'Displays all nodes in the cluster with resource usage.',
        shortcuts: [
          {key: 'Enter', description: 'View services on selected node'},
          {key: 'c', description: 'Connect to selected node'},
        ],
      },
      services: {
        title: 'Services View',
        description: 'Displays services running on nodes.',
        shortcuts: [
          {key: 'Enter', description: 'View service details'},
          {key: 't', description: 'Filter by service type'},
        ],
      },
      tables: {
        title: 'Tables View',
        description: 'Displays all tables with partition and replica info.',
        shortcuts: [
          {key: 'Enter', description: 'View partitions for table'},
          {key: 'p', description: 'View table policies'},
        ],
      },
      partitions: {
        title: 'Partitions View',
        description: 'Displays partitions for a table.',
        shortcuts: [
          {key: 'Enter', description: 'View partition replicas'},
          {key: 'n', description: 'Jump to leader node'},
        ],
      },
      message_groups: {
        title: 'Message Groups View',
        description: 'Displays message group distribution.',
        shortcuts: [
          {key: 'Enter', description: 'View replica locations'},
        ],
      },
      sql: {
        title: 'SQL Query View',
        description: 'Execute SQL queries against the database.',
        shortcuts: [
          {key: 'Ctrl+Enter', description: 'Execute query'},
          {key: '↑/↓', description: 'Navigate query history'},
          {key: 'Tab', description: 'Autocomplete table name'},
          {key: 'Escape', description: 'Clear input'},
          {key: 'Ctrl+L', description: 'Start live query'},
        ],
      },
      logs: {
        title: 'Logs View',
        description: 'View and filter system logs.',
        shortcuts: [
          {key: 'Enter', description: 'View full log entry'},
          {key: 'l', description: 'Filter by log level'},
          {key: 'n', description: 'Filter by node'},
          {key: 'e', description: 'Export filtered logs'},
        ],
      },
      config: {
        title: 'Config View',
        description: 'View and edit system configuration.',
        shortcuts: [
          {key: 'Enter', description: 'Edit config value'},
          {key: 'r', description: 'Revert to default'},
        ],
      },
      contexts: {
        title: 'Contexts View',
        description: 'View function execution contexts.',
        shortcuts: [
          {key: 'Enter', description: 'View context details'},
          {key: 't', description: 'Filter by context type'},
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
    lines.push('╔════════════════════════════════════════════════════════════╗');
    lines.push('║                      KEYBOARD SHORTCUTS                     ║');
    lines.push('╚════════════════════════════════════════════════════════════╝');
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

    lines.push('Press any key to close this help');

    return lines.join('\n');
  }

  /**
   * Pad a key string for alignment
   * @param {string} key - Key string
   * @returns {string} Padded key
   */
  padKey(key) {
    return key.padEnd(16);
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
    case 'sql':
      hints.unshift('Ctrl+Enter:Execute');
      break;
    case 'logs':
      hints.unshift('l:Level', 'n:Node');
      break;
    case 'config':
      hints.unshift('Enter:Edit');
      break;
    default:
      hints.unshift('Enter:Drill Down');
    }

    return hints.join(' | ');
  }

  /**
   * Get CLI usage information (for --help flag)
   * @returns {string} Usage text
   */
  getUsageText() {
    return `
ddb-admin - Distributed Database Administration CLI

USAGE:
  ddb-admin [OPTIONS] [NODE_ADDRESS]

ARGUMENTS:
  NODE_ADDRESS    Address of node to connect to (e.g., localhost:8080)

OPTIONS:
  -h, --help              Show this help message and exit
  -v, --version           Show version information
  --config <path>         Path to configuration file
  --refresh <ms>          Refresh interval in milliseconds (default: 5000)
  --view <name>           Initial view (nodes, services, tables, etc.)
  --read-only             Enable read-only mode (no write queries)
  --monochrome            Disable colors for terminals without color support

ENVIRONMENT VARIABLES:
  DDB_NODE_ADDRESS        Default node address
  DDB_REFRESH_INTERVAL    Default refresh interval

EXAMPLES:
  ddb-admin localhost:8080
  ddb-admin --view tables --read-only localhost:8080
  DDB_NODE_ADDRESS=localhost:8080 ddb-admin

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
      this.eventBus.emit('help:show', {});
    }
  }

  /**
   * Hide the help overlay
   */
  hide() {
    this.visible = false;
    if (this.eventBus) {
      this.eventBus.emit('help:hide', {});
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
