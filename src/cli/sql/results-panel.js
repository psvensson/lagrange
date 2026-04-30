const LOCAL_STR_SELECT = 'select';
const LOCAL_STR_INSERT = 'insert';
const LOCAL_STR_UPDATE = 'update';
const LOCAL_STR_DELETE = 'delete';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_EMPTY = 'empty';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_INSERT_2 = 'INSERT';
const LOCAL_STR_UPDATE_2 = 'UPDATE';
const LOCAL_STR_DELETE_2 = 'DELETE';
const LOCAL_STR_UNKNOWN_ERROR = 'Unknown error';
const LOCAL_STR_GRAY_FG_NULL = '{gray-fg}NULL{/}';
const LOCAL_STR_EMPTY_2 = '';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_NUM_50 = 50;
const LOCAL_NUM_47 = 47;
const LOCAL_STR_2ZI04 = '...';
const LOCAL_STR_OBJECT_2 = '[Object]';
const LOCAL_STR_BOOLEAN = 'boolean';
const LOCAL_STR_TRUE = 'true';
const LOCAL_STR_FALSE = 'false';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_S = 's';
const LOCAL_STR_17XHO = ' | ';
const LOCAL_STR_VQFON = '{yellow-fg}No results{/}\n\n';
const LOCAL_STR_CDEXS = '{red-fg}✗ Query failed{/}\n\nUnknown error';
const LOCAL_STR_1SIZV = '{red-fg}✗ Query failed{/}\n\n';
const LOCAL_STR_4ATH1 = 'resultspanel:render';
const LOCAL_STR_UMMD1 = 'resultspanel:update';

/**
 * ResultsPanel - Display panel for SQL query results
 *
 * Displays query results in tabular format with support for
 * scrolling, metadata display, and error handling.
 *
 * Requirements: 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12
 */

/**
 * Result types
 */
export const RESULT_TYPE = {
  SELECT: LOCAL_STR_SELECT,
  INSERT: LOCAL_STR_INSERT,
  UPDATE: LOCAL_STR_UPDATE,
  DELETE: LOCAL_STR_DELETE,
  ERROR: LOCAL_STR_ERROR,
  EMPTY: LOCAL_STR_EMPTY,
};

/**
 * ResultsPanel class for displaying query results
 */
export class ResultsPanel {
  /**
   * Creates a new ResultsPanel
   * @param {Object} options - Panel options
   * @param {Object} [options.screen] - Blessed screen instance
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    this.screen = options.screen || null;
    this.eventBus = options.eventBus || null;

    // Current result state
    this.currentResult = null;
    this.resultType = null;
    this.executionTime = null;
    this.rowCount = null;
    this.affectedRows = null;
    this.partitions = [];
    this.error = null;

    // Scrolling state
    this.scrollPosition = LOCAL_NUM_ZERO;
    this.selectedRow = LOCAL_NUM_ZERO;

    // Widget reference
    this.widget = null;
  }

  /**
   * Display a SELECT query result
   * Requirements: 7.6, 7.7, 7.8, 7.9, 7.12
   * @param {Object} result - Query result
   * @param {Array<Object>} result.rows - Result rows
   * @param {Array<string>} [result.columns] - Column names
   * @param {number} [result.count] - Row count
   * @param {Array<string>} [result.partitions] - Involved partitions
   * @param {string} [result.tableName] - Table name
   * @param {number} executionTime - Execution time in ms
   */
  displaySelectResult(result, executionTime) {
    this.resultType = RESULT_TYPE.SELECT;
    this.executionTime = executionTime;
    this.error = null;
    this.scrollPosition = LOCAL_NUM_ZERO;
    this.selectedRow = LOCAL_NUM_ZERO;

    const rows = result.rows || result.results || [];
    this.rowCount = result.count ?? rows.length;
    this.partitions = result.partitions || [];

    if (rows.length === LOCAL_NUM_ZERO) {
      this.resultType = RESULT_TYPE.EMPTY;
      this.currentResult = {
        tableName: result.tableName,
        columns: result.columns || [],
        rows: [],
      };
    } else {
      // Extract columns from first row if not provided
      const columns = result.columns || Object.keys(rows[0]);
      this.currentResult = {
        tableName: result.tableName,
        columns,
        rows,
      };
    }

    this.render();
    this.emitUpdate();
  }

  /**
   * Display a write operation result (INSERT/UPDATE/DELETE)
   * Requirements: 7.10
   * @param {Object} result - Operation result
   * @param {string} result.operation - Operation type
   * @param {number} result.affectedRows - Affected row count
   * @param {Array<string>} [result.partitions] - Involved partitions
   * @param {number} executionTime - Execution time in ms
   */
  displayWriteResult(result, executionTime) {
    const operation = (result.operation || 'WRITE').toUpperCase();

    switch (operation) {
    case LOCAL_STR_INSERT_2:
      this.resultType = RESULT_TYPE.INSERT;
      break;
    case LOCAL_STR_UPDATE_2:
      this.resultType = RESULT_TYPE.UPDATE;
      break;
    case LOCAL_STR_DELETE_2:
      this.resultType = RESULT_TYPE.DELETE;
      break;
    default:
      this.resultType = RESULT_TYPE.UPDATE;
    }

    this.executionTime = executionTime;
    this.affectedRows = result.affectedRows ?? LOCAL_NUM_ZERO;
    this.partitions = result.partitions || [];
    this.error = null;
    this.currentResult = result;

    this.render();
    this.emitUpdate();
  }

  /**
   * Display an error result
   * Requirements: 7.11
   * @param {Object} error - Error object
   * @param {string} error.message - Error message
   * @param {string} [error.code] - Error code
   * @param {string} [error.detail] - Error detail
   */
  displayError(error) {
    this.resultType = RESULT_TYPE.ERROR;
    this.error = {
      message: error.message || LOCAL_STR_UNKNOWN_ERROR,
      code: error.code,
      detail: error.detail,
    };
    this.currentResult = null;
    this.executionTime = null;
    this.rowCount = null;
    this.affectedRows = null;
    this.partitions = [];

    this.render();
    this.emitUpdate();
  }

  /**
   * Clear the results panel
   */
  clear() {
    this.currentResult = null;
    this.resultType = null;
    this.executionTime = null;
    this.rowCount = null;
    this.affectedRows = null;
    this.partitions = [];
    this.error = null;
    this.scrollPosition = LOCAL_NUM_ZERO;
    this.selectedRow = LOCAL_NUM_ZERO;

    this.render();
  }

  /**
   * Get formatted table data for display
   * @return {Object} Table data with headers and rows
   */
  getTableData() {
    if (!this.currentResult || this.resultType === RESULT_TYPE.ERROR) {
      return {headers: [], rows: []};
    }

    const {columns, rows} = this.currentResult;

    const formattedRows = rows.map((row) =>
      columns.map((col) => this.formatCell(row[col])),
    );

    return {
      headers: columns,
      rows: formattedRows,
    };
  }

  /**
   * Format a cell value for display
   * @param {*} value - Cell value
   * @return {string} Formatted value
   */
  formatCell(value) {
    if (value === null) {
      return LOCAL_STR_GRAY_FG_NULL;
    }
    if (value === undefined) {
      return LOCAL_STR_EMPTY_2;
    }
    if (typeof value === LOCAL_STR_OBJECT) {
      try {
        const json = JSON.stringify(value);
        return json.length > LOCAL_NUM_50 ? json.slice(LOCAL_NUM_ZERO, LOCAL_NUM_47) + LOCAL_STR_2ZI04 : json;
      } catch (_e) {
        return LOCAL_STR_OBJECT_2;
      }
    }
    if (typeof value === LOCAL_STR_BOOLEAN) {
      return value ? LOCAL_STR_TRUE : LOCAL_STR_FALSE;
    }
    return String(value);
  }

  /**
   * Get the status line content
   * Requirements: 7.9, 7.10, 7.12
   * @return {string} Status line text
   */
  getStatusLine() {
    const parts = [];

    switch (this.resultType) {
    case RESULT_TYPE.SELECT:
      parts.push(`${this.rowCount} row${this.rowCount !== LOCAL_NUM_ONE ? LOCAL_STR_S : LOCAL_STR_EMPTY_2}`);
      break;
    case RESULT_TYPE.INSERT:
      parts.push(`INSERT: ${this.affectedRows} row${this.affectedRows !== LOCAL_NUM_ONE ? LOCAL_STR_S : LOCAL_STR_EMPTY_2} affected`);
      break;
    case RESULT_TYPE.UPDATE:
      parts.push(`UPDATE: ${this.affectedRows} row${this.affectedRows !== LOCAL_NUM_ONE ? LOCAL_STR_S : LOCAL_STR_EMPTY_2} affected`);
      break;
    case RESULT_TYPE.DELETE:
      parts.push(`DELETE: ${this.affectedRows} row${this.affectedRows !== LOCAL_NUM_ONE ? LOCAL_STR_S : LOCAL_STR_EMPTY_2} affected`);
      break;
    case RESULT_TYPE.EMPTY:
      // For empty SELECT results, still show row count (0 rows)
      parts.push(`${this.rowCount ?? LOCAL_NUM_ZERO} row${this.rowCount !== LOCAL_NUM_ONE ? LOCAL_STR_S : LOCAL_STR_EMPTY_2}`);
      break;
    case RESULT_TYPE.ERROR:
      return `{red-fg}Error: ${this.error?.message || LOCAL_STR_UNKNOWN_ERROR}{/}`;
    default:
      return LOCAL_STR_EMPTY_2;
    }

    if (this.executionTime !== null) {
      parts.push(`${this.executionTime}ms`);
    }

    if (this.partitions.length > LOCAL_NUM_ZERO) {
      const partitionStr = this.partitions.length <= 3 ?
        this.partitions.join(', ') :
        `${this.partitions.slice(0, 3).join(', ')}... (${this.partitions.length} total)`;
      parts.push(`Partitions: ${partitionStr}`);
    }

    return parts.join(LOCAL_STR_17XHO);
  }

  /**
   * Get the message content for non-table results
   * @return {string} Message content
   */
  getMessageContent() {
    switch (this.resultType) {
    case RESULT_TYPE.INSERT:
    case RESULT_TYPE.UPDATE:
    case RESULT_TYPE.DELETE:
      return this.getWriteResultMessage();
    case RESULT_TYPE.EMPTY:
      return this.getEmptyResultMessage();
    case RESULT_TYPE.ERROR:
      return this.getErrorMessage();
    default:
      return LOCAL_STR_EMPTY_2;
    }
  }

  /**
   * Get write result message
   * @return {string} Message
   */
  getWriteResultMessage() {
    const operation = this.resultType.toUpperCase();
    const rows = this.affectedRows ?? 0;
    const time = this.executionTime ?? 0;
    const partitions = this.partitions.length > 0 ?
      this.partitions.join(', ') :
      'N/A';

    return `{green-fg}✓{/} ${operation} completed\n\n` +
           `Affected rows: ${rows}\n` +
           `Execution time: ${time}ms\n` +
           `Partitions: ${partitions}`;
  }

  /**
   * Get empty result message
   * @return {string} Message
   */
  getEmptyResultMessage() {
    const tableName = this.currentResult?.tableName || 'query';
    const time = this.executionTime ?? 0;

    return LOCAL_STR_VQFON +
           `Table: ${tableName}\n` +
           `Execution time: ${time}ms`;
  }

  /**
   * Get error message
   * Requirements: 7.11
   * @return {string} Message
   */
  getErrorMessage() {
    if (!this.error) {
      return LOCAL_STR_CDEXS;
    }

    let message = LOCAL_STR_1SIZV;
    message += `Error: ${this.error.message}`;

    if (this.error.code) {
      message += `\nCode: ${this.error.code}`;
    }

    if (this.error.detail) {
      message += `\nDetail: ${this.error.detail}`;
    }

    return message;
  }

  /**
   * Scroll up
   * Requirements: 7.8
   * @param {number} [lines=1] - Lines to scroll
   */
  scrollUp(lines = LOCAL_NUM_ONE) {
    this.scrollPosition = Math.max(LOCAL_NUM_ZERO, this.scrollPosition - lines);
    this.render();
  }

  /**
   * Scroll down
   * Requirements: 7.8
   * @param {number} [lines=1] - Lines to scroll
   */
  scrollDown(lines = LOCAL_NUM_ONE) {
    const maxScroll = this.getMaxScroll();
    this.scrollPosition = Math.min(maxScroll, this.scrollPosition + lines);
    this.render();
  }

  /**
   * Get maximum scroll position
   * @return {number} Max scroll
   */
  getMaxScroll() {
    if (!this.currentResult || !this.currentResult.rows) {
      return LOCAL_NUM_ZERO;
    }
    return Math.max(LOCAL_NUM_ZERO, this.currentResult.rows.length - LOCAL_NUM_ONE);
  }

  /**
   * Select previous row
   */
  selectPrevious() {
    if (this.selectedRow > LOCAL_NUM_ZERO) {
      this.selectedRow--;
      // Adjust scroll if needed
      if (this.selectedRow < this.scrollPosition) {
        this.scrollPosition = this.selectedRow;
      }
      this.render();
    }
  }

  /**
   * Select next row
   */
  selectNext() {
    const maxRow = this.currentResult?.rows?.length - 1 || 0;
    if (this.selectedRow < maxRow) {
      this.selectedRow++;
      this.render();
    }
  }

  /**
   * Get the currently selected row data
   * @return {Object|null} Selected row or null
   */
  getSelectedRow() {
    if (!this.currentResult || !this.currentResult.rows) {
      return null;
    }
    return this.currentResult.rows[this.selectedRow] || null;
  }

  /**
   * Check if there are results to display
   * @return {boolean} True if has results
   */
  hasResults() {
    return this.resultType !== null && this.resultType !== RESULT_TYPE.ERROR;
  }

  /**
   * Check if there was an error
   * @return {boolean} True if error
   */
  hasError() {
    return this.resultType === RESULT_TYPE.ERROR;
  }

  /**
   * Render the panel
   */
  render() {
    if (this.widget) {
      if (this.resultType === RESULT_TYPE.SELECT && this.currentResult?.rows?.length > LOCAL_NUM_ZERO) {
        // Render table
        const tableData = this.getTableData();
        this.widget.setData({
          headers: tableData.headers,
          data: tableData.rows,
        });
      } else {
        // Render message
        this.widget.setContent(this.getMessageContent());
      }

      if (this.screen) {
        this.screen.render();
      }
    }

    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_4ATH1, {
        resultType: this.resultType,
        rowCount: this.rowCount,
        executionTime: this.executionTime,
      });
    }
  }

  /**
   * Emit update event
   */
  emitUpdate() {
    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_UMMD1, {
        resultType: this.resultType,
        rowCount: this.rowCount,
        affectedRows: this.affectedRows,
        executionTime: this.executionTime,
        partitions: this.partitions,
        error: this.error,
      });
    }
  }

  /**
   * Set the widget reference
   * @param {Object} widget - Blessed widget
   */
  setWidget(widget) {
    this.widget = widget;
  }
}
