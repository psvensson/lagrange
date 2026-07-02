import {CLI_VIEW} from './cli-constants.js';

const LOCAL_STR_BOLD_CYAN_FG_STATE_TRANSITION_HISTORY_CY = '{bold}{cyan-fg}State Transition History{/cyan-fg}{/bold}\n';

const ADMIN_CLI_ACTION_METHODS = {
  /**
   * Execute SQL query from the SQL input.
   */
  async executeSqlQuery() {
    const sql = this.sqlInput.getValue().trim();
    if (!sql) return;

    if (this.readOnlyMode && !/^\s*select\b/i.test(sql)) {
      this.showSqlError('Read-only mode - only SELECT queries allowed');
      return;
    }

    this.showSqlStatus('Executing query...', 'yellow');

    const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const resultHandler = (result) => {
      if (result.queryId !== queryId) return;
      this.eventBus.off('query:result', resultHandler);

      if (result.error) {
        this.showSqlError(result.error);
      } else {
        const rows = result.results || [];
        this.displaySqlResults(rows);
      }
    };

    const timeoutId = setTimeout(() => {
      this.eventBus.off('query:result', resultHandler);
      this.showSqlError('Query timeout (30s)');
    }, 30000);

    const wrappedHandler = (result) => {
      clearTimeout(timeoutId);
      resultHandler(result);
    };

    this.eventBus.on('query:result', wrappedHandler);

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
  },

  /**
   * Display SQL results in the table.
   * @param {Array} rows
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

    this.sqlResultsData = rows;
    this.sqlResultsColumns = Object.keys(rows[0]);
    this.sqlSelectedIndex = 0;

    const colWidths = this.sqlResultsColumns.map((col) => {
      const maxLen = Math.max(
        col.length,
        ...rows.slice(0, 50).map((row) => String(row[col] ?? '').length),
      );
      return Math.min(20, Math.max(8, maxLen + 2));
    });
    this.sqlResultsTable.options.columnWidth = colWidths;

    this.updateSqlResultsTable();
    this.updateSqlDetailPanel();
    this.screen.render();
  },

  /**
   * Update the SQL results table display.
   */
  updateSqlResultsTable() {
    if (!this.sqlResultsData || this.sqlResultsData.length === 0) return;

    const ANSI = {
      INVERSE: '\x1b[7m',
      WHITE: '\x1b[37m',
      RESET: '\x1b[0m',
    };

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

    const label = ` Results: ${this.sqlResultsData.length} row(s) ` +
      `[${this.sqlSelectedIndex + 1}/${this.sqlResultsData.length}] `;
    this.sqlResultsTable.setLabel(label);

    this.sqlResultsTable.setData({
      headers: this.sqlResultsColumns,
      data: tableData,
    });
  },

  /**
   * Update the SQL detail panel with the selected row.
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
  },

  /**
   * Navigate SQL results up.
   * @param {number} count
   */
  sqlNavigateUp(count = 1) {
    if (!this.sqlResultsData || this.sqlResultsData.length === 0) return;
    this.sqlSelectedIndex = Math.max(0, this.sqlSelectedIndex - count);
    this.updateSqlResultsTable();
    this.updateSqlDetailPanel();
    this.screen.render();
  },

  /**
   * Navigate SQL results down.
   * @param {number} count
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
  },

  /**
   * Show SQL error message.
   * @param {string} message
   */
  showSqlError(message) {
    this.sqlResultsData = [];
    this.sqlResultsColumns = [];
    this.sqlResultsTable.setData({headers: ['Error'], data: [[message]]});
    this.sqlDetailPanel.setContent(`{red-fg}Error:{/red-fg}\n\n${message}`);
    this.screen.render();
  },

  /**
   * Show SQL status message.
   * @param {string} message
   * @param {string} color
   */
  showSqlStatus(message, color = 'white') {
    this.sqlResultsTable.setData({headers: ['Status'], data: [[message]]});
    this.sqlDetailPanel.setContent(`{${color}-fg}${message}{/${color}-fg}`);
    this.screen.render();
  },

  /**
   * Handle config edit request.
   */
  handleConfigEdit() {
    if (this.currentView !== 'config') {
      return;
    }

    if (this.readOnlyMode) {
      this.showError('Read-only mode - editing disabled');
      return;
    }

    const view = this.viewManager.getCurrentView();
    if (!view) return;

    const result = view.handleEditRequest?.();
    if (!result) return;

    if (result.action === 'showError') {
      this.showError(result.message);
      return;
    }

    if (result.action === 'editConfig') {
      this.showConfigEditDialog(result.config);
    }
  },

  /**
   * Handle config revert request.
   */
  handleConfigRevert() {
    if (this.currentView !== 'config') {
      return;
    }

    if (this.readOnlyMode) {
      this.showError('Read-only mode - editing disabled');
      return;
    }

    const view = this.viewManager.getCurrentView();
    if (!view) return;

    const result = view.handleRevertRequest?.();
    if (!result) return;

    if (result.action === 'showError') {
      this.showError(result.message);
      return;
    }

    if (result.action === 'revertConfig') {
      const config = result.config;
      const defaultValue = config.default_value;
      this.executeConfigUpdate(
        config.config_key,
        defaultValue,
        config.value_type,
      );
    }
  },

  /**
   * Show config edit dialog.
   * @param {Object} config
   */
  showConfigEditDialog(config) {
    this.configEditKey = config.config_key;
    this.configEditType = config.value_type || 'string';

    const typeHint = this.configEditType === 'boolean' ? ' (true/false)' :
      this.configEditType === 'number' ? ' (number)' :
        this.configEditType === 'json' ? ' (JSON)' : '';

    this.configEditLabel.setContent(
      `{cyan-fg}Key:{/cyan-fg} ${config.config_key}\n` +
      `{cyan-fg}Type:{/cyan-fg} ${this.configEditType}${typeHint}`,
    );

    const currentValue = config.config_value !== null &&
      config.config_value !== undefined ?
      String(config.config_value) : '';
    this.configEditInput.setValue(currentValue);

    this.configEditDialog.show();
    this.configEditInput.focus();
    this.screen.render();
  },

  /**
   * Hide config edit dialog.
   */
  hideConfigEditDialog() {
    this.configEditDialog.hide();
    this.configEditKey = null;
    this.configEditType = null;
    this.screen.render();
  },

  /**
   * Submit config edit.
   */
  submitConfigEdit() {
    const newValue = this.configEditInput.getValue().trim();
    const key = this.configEditKey;
    const type = this.configEditType;

    this.hideConfigEditDialog();

    if (!key) return;

    const view = this.viewManager.getCurrentView();
    if (view && view.validateValue) {
      const validation = view.validateValue(newValue, type);
      if (!validation.valid) {
        this.showError(`Invalid value: ${validation.error}`);
        return;
      }
    }

    this.executeConfigUpdate(key, newValue, type);
  },

  /**
   * Execute config update via SQL.
   * @param {string} key
   * @param {string} value
   * @param {string} type
   */
  executeConfigUpdate(key, value, type) {
    let sqlValue;
    if (type === 'string' || type === 'json') {
      const escaped = String(value).replace(/'/g, '\'\'');
      sqlValue = `'${escaped}'`;
    } else {
      sqlValue = `'${value}'`;
    }

    const sql = `UPDATE config SET config_value = ${sqlValue}, ` +
      `updated_at = ${Date.now()} WHERE config_key = '${key}'`;

    this.updateStatus(`Updating ${key}...`, 'yellow');

    const queryId = `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const resultHandler = (result) => {
      if (result.queryId !== queryId) return;
      this.eventBus.off('query:result', resultHandler);

      if (result.error) {
        this.showError(`Failed to update: ${result.error}`);
      } else {
        this.updateStatus(`Updated ${key}`, 'green');
        this.connectionManager.requestCacheDump?.();
      }
    };

    const timeoutId = setTimeout(() => {
      this.eventBus.off('query:result', resultHandler);
      this.showError('Update timeout');
    }, 10000);

    const wrappedHandler = (result) => {
      clearTimeout(timeoutId);
      resultHandler(result);
    };

    this.eventBus.on('query:result', wrappedHandler);

    if (this.connectionManager) {
      const sent = this.connectionManager.sendQuery(queryId, sql);
      if (!sent) {
        clearTimeout(timeoutId);
        this.eventBus.off('query:result', wrappedHandler);
        this.showError('Not connected to server');
      }
    }
  },

  /**
   * Execute a node-management SQL mutation over the admin query channel.
   * @param {Object} options
   */
  executeNodeManagementQuery(options) {
    if (this.readOnlyMode) {
      this.showError('Node management commands are unavailable in read-only mode');
      return;
    }

    if (!this.connectionManager || !this.eventBus) {
      this.showError('Not connected to server');
      return;
    }

    const queryId = `node_mgmt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timeoutMs = 10000;

    this.updateStatus(options.pendingMessage, 'yellow');

    let timeoutId = null;
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.eventBus.off('query:result', wrappedHandler);
    };

    const resultHandler = (result) => {
      if (result.queryId !== queryId) {
        return;
      }
      cleanup();

      if (result.error) {
        this.showError(`${options.failurePrefix}: ${result.error}`);
        return;
      }

      const affectedRows = Number(result.affectedRows || 0);
      if (affectedRows < 1) {
        this.showError(options.notFoundMessage);
        return;
      }

      this.updateStatus(options.successMessage, 'green');
      this.forceRefresh();
    };

    const wrappedHandler = (result) => {
      resultHandler(result);
    };

    timeoutId = setTimeout(() => {
      cleanup();
      this.showError(`${options.failurePrefix}: query timeout`);
    }, timeoutMs);

    this.eventBus.on('query:result', wrappedHandler);

    const sent = this.connectionManager.sendQuery(
      queryId,
      options.sql,
      options.params,
    );
    if (!sent) {
      cleanup();
      this.showError('Not connected to server');
    }
  },

  /**
   * Mark a node as active or draining through the admin query channel.
   * @param {string} nodeId
   * @param {string} status
   */
  updateNodeStatus(nodeId, status) {
    const verb = status === 'draining' ? 'drain' : 'activate';
    this.executeNodeManagementQuery({
      sql: 'UPDATE nodes SET status = ?1 WHERE node_id = ?2',
      params: [status, nodeId],
      pendingMessage: `${verb}ing node ${nodeId}...`,
      successMessage: `Node ${nodeId} marked ${status}`,
      failurePrefix: `Failed to mark node ${nodeId} as ${status}`,
      notFoundMessage: `Node ${nodeId} not found`,
    });
  },

  /**
   * Remove a node from cluster metadata through the admin query channel.
   * @param {string} nodeId
   */
  removeNode(nodeId) {
    this.executeNodeManagementQuery({
      sql: 'DELETE FROM nodes WHERE node_id = ?1',
      params: [nodeId],
      pendingMessage: `Removing node ${nodeId}...`,
      successMessage: `Node ${nodeId} removed`,
      failurePrefix: `Failed to remove node ${nodeId}`,
      notFoundMessage: `Node ${nodeId} not found`,
    });
  },

  /**
   * Apply a live logs start-time window from command input.
   * @param {string} value
   */
  applyLogsSince(value) {
    if (this.currentView !== CLI_VIEW.LOGS) {
      this.showError('since command is only available in logs view');
      return;
    }

    const logsView = this.viewManager?.getView(CLI_VIEW.LOGS);
    if (!logsView || typeof logsView.setLiveWindowStartTime !== 'function') {
      this.showError('logs view does not support since command');
      return;
    }

    try {
      logsView.setLiveWindowStartTime(value);
      this.refreshCurrentView();
    } catch (error) {
      this.showError(error.message);
    }
  },

  /**
   * Show state transition history for a replica.
   * @param {string} replicaId
   */
  async showReplicaHistory(replicaId) {
    if (!replicaId) {
      this.showError('Replica ID required');
      return;
    }

    this.updateStatus(`Loading history for ${replicaId}...`, 'yellow');

    const sql = 'SELECT timestamp, level, message, metadata FROM logs ' +
      'WHERE message LIKE \'%Replica state transition%\' ' +
      `AND metadata LIKE '%${replicaId.replace(/'/g, '\'\'')}%' ` +
      'ORDER BY timestamp ASC LIMIT 100';

    const queryId = `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const resultHandler = (result) => {
      if (result.queryId !== queryId) return;
      this.eventBus.off('query:result', resultHandler);

      if (result.error) {
        this.showError(`Failed to load history: ${result.error}`);
        return;
      }

      const rows = result.results || [];
      this.displayReplicaHistory(replicaId, rows);
    };

    const timeoutId = setTimeout(() => {
      this.eventBus.off('query:result', resultHandler);
      this.showError('History query timeout');
    }, 10000);

    const wrappedHandler = (result) => {
      clearTimeout(timeoutId);
      resultHandler(result);
    };

    this.eventBus.on('query:result', wrappedHandler);

    if (this.connectionManager) {
      const sent = this.connectionManager.sendQuery(queryId, sql);
      if (!sent) {
        clearTimeout(timeoutId);
        this.eventBus.off('query:result', wrappedHandler);
        this.showError('Not connected to server');
      }
    } else {
      clearTimeout(timeoutId);
      this.eventBus.off('query:result', wrappedHandler);
      this.showError('Not connected to server');
    }
  },

  /**
   * Display replica state transition history in a dialog.
   * @param {string} replicaId
   * @param {Array} rows
   */
  displayReplicaHistory(replicaId, rows) {
    if (!rows || rows.length === 0) {
      this.updateStatus(`No history found for replica ${replicaId}`, 'yellow');
      return;
    }

    const historyEntries = rows.map((row) => {
      let metadata = {};
      try {
        if (row.metadata) {
          metadata = typeof row.metadata === 'string' ?
            JSON.parse(row.metadata) : row.metadata;
        }
      } catch (_e) {
        // Ignore parse errors.
      }

      const timestamp = row.timestamp ?
        new Date(row.timestamp).toISOString().replace('T', ' ').substring(0, 19) :
        'N/A';

      return {
        timestamp,
        previousState: metadata.previousState || 'N/A',
        newState: metadata.newState || 'N/A',
        reason: metadata.reason || 'N/A',
        nodeId: metadata.nodeId || 'N/A',
      };
    });

    let content = LOCAL_STR_BOLD_CYAN_FG_STATE_TRANSITION_HISTORY_CY;
    content += `{cyan-fg}Replica:{/cyan-fg} ${replicaId}\n`;
    content += `{cyan-fg}Entries:{/cyan-fg} ${historyEntries.length}\n\n`;
    content += '{cyan-fg}─────────────────────────────────────────────────{/cyan-fg}\n\n';

    for (const entry of historyEntries) {
      const stateColor = this.getStateColor(entry.newState);
      content += `{white-fg}${entry.timestamp}{/white-fg}\n`;
      content += `  {gray-fg}${entry.previousState || '(none)'}{/gray-fg} → `;
      content += `{${stateColor}-fg}${entry.newState}{/${stateColor}-fg}\n`;
      if (entry.reason && entry.reason !== 'N/A') {
        content += `  {gray-fg}Reason:{/gray-fg} ${entry.reason}\n`;
      }
      if (entry.nodeId && entry.nodeId !== 'N/A') {
        content += `  {gray-fg}Node:{/gray-fg} ${entry.nodeId}\n`;
      }
      content += '\n';
    }

    content += '{cyan-fg}─────────────────────────────────────────────────{/cyan-fg}\n';
    content += '{gray-fg}Press Escape or any key to close{/gray-fg}';

    this.helpBox.setContent(content);
    this.helpBox.setLabel(' Replica History ');
    this.helpBox.show();
    this.helpBox.focus();
    this.screen.render();

    this.updateStatus(`Showing ${historyEntries.length} history entries`, 'green');
  },

  /**
   * Get color for a replica state.
   * @param {string} state
   * @return {string}
   */
  getStateColor(state) {
    const stateColors = {
      'pending': 'blue',
      'creating': 'blue',
      'syncing': 'yellow',
      'active': 'green',
      'removing': 'yellow',
      'removed': 'gray',
      'failed': 'red',
    };
    return stateColors[state] || 'white';
  },
};

export {ADMIN_CLI_ACTION_METHODS};
