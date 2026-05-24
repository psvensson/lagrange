import {INPUT_MODE} from './core/keyboard-handler.js';
import {CLI_APP} from './cli-constants.js';
import {
  LOCAL_NUM_ZERO,
  LOCAL_STR_100,
  LOCAL_STR_WHITE,
  LOCAL_STR_60,
  LOCAL_NUM_EIGHT,
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
  LOCAL_STR_RED,
  LOCAL_STR_1TP34,
  LOCAL_STR_FW0U6,
  LOCAL_STR_1CINP,
  LOCAL_STR_19GO0,
  LOCAL_STR_1L6CE,
  LOCAL_STR_BOLD_EXAMPLES_BOLD,
  LOCAL_STR_SELECT_FROM_NODES,
  LOCAL_STR_SELECT_FROM_TABLES,
  LOCAL_STR_1LNVC,
  LOCAL_STR_B9JZ8,
  LOCAL_STR_1B022,
  LOCAL_STR_IQU5C,
  LOCAL_STR_1J862,
  LOCAL_STR_1IRSA,
  LOCAL_STR_5HIDN,
  LOCAL_STR_QM582,
  LOCAL_STR_141HM,
  LOCAL_STR_1B05O,
  LOCAL_STR_CZGPU,
  LOCAL_STR_ZH2EO,
  LOCAL_STR_8G5X6,
  LOCAL_STR_RS5HY,
  LOCAL_STR_QUTO4,
  LOCAL_STR_5AG4A,
  LOCAL_STR_1BG3N,
  LOCAL_STR_108BZ,
  LOCAL_STR_157A5,
  VIEW_NUMBERS,
} from './admin-cli-local-constants.js';

const ADMIN_CLI_RENDER_METHODS = {
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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  /**
   * Handle screen resize
   */
  handleResize() {
    this.refreshCurrentView();
  },

  /**
   * Show help overlay
   */
  showHelpOverlay() {
    const helpText = this.helpOverlay.formatHelpText(this.currentView);
    this.helpBox.setContent(helpText);
    this.helpBox.show();
    this.helpBox.focus();
    this.screen.render();
  },

  /**
   * Hide help overlay
   */
  hideHelpOverlay() {
    this.helpBox.hide();
    this.screen.render();
  },

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    this.updateStatus(`Error: ${message}`, LOCAL_STR_RED);
  },
};

export {ADMIN_CLI_RENDER_METHODS};
