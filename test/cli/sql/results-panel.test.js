import {test} from 'tap';
import {ResultsPanel, RESULT_TYPE} from '../../../src/cli/sql/results-panel.js';

/**
 * Create a mock event bus
 * @return {Object} Mock event bus
 */
function createMockEventBus() {
  const events = [];
  return {
    events,
    emit(event, data) {
      events.push({event, data});
    },
    getEvents(eventName) {
      return events.filter((e) => e.event === eventName);
    },
  };
}

test('ResultsPanel', async (t) => {
  t.test('constructor initializes with default state', async (t) => {
    const panel = new ResultsPanel();

    t.equal(panel.currentResult, null);
    t.equal(panel.resultType, null);
    t.equal(panel.scrollPosition, 0);
  });

  t.test('displaySelectResult sets result state', async (t) => {
    const panel = new ResultsPanel();
    const result = {
      rows: [{id: 1, name: 'Alice'}, {id: 2, name: 'Bob'}],
      columns: ['id', 'name'],
      count: 2,
      partitions: ['p1', 'p2'],
    };

    panel.displaySelectResult(result, 50);

    t.equal(panel.resultType, RESULT_TYPE.SELECT);
    t.equal(panel.rowCount, 2);
    t.equal(panel.executionTime, 50);
    t.same(panel.partitions, ['p1', 'p2']);
  });

  t.test('displaySelectResult handles empty results', async (t) => {
    const panel = new ResultsPanel();
    const result = {
      rows: [],
      tableName: 'users',
    };

    panel.displaySelectResult(result, 10);

    t.equal(panel.resultType, RESULT_TYPE.EMPTY);
    t.equal(panel.rowCount, 0);
  });

  t.test('displaySelectResult extracts columns from rows', async (t) => {
    const panel = new ResultsPanel();
    const result = {
      rows: [{id: 1, name: 'Alice'}],
    };

    panel.displaySelectResult(result, 10);

    t.same(panel.currentResult.columns, ['id', 'name']);
  });

  t.test('displayWriteResult handles INSERT', async (t) => {
    const panel = new ResultsPanel();
    const result = {
      operation: 'INSERT',
      affectedRows: 5,
      partitions: ['p1'],
    };

    panel.displayWriteResult(result, 25);

    t.equal(panel.resultType, RESULT_TYPE.INSERT);
    t.equal(panel.affectedRows, 5);
    t.equal(panel.executionTime, 25);
  });

  t.test('displayWriteResult handles UPDATE', async (t) => {
    const panel = new ResultsPanel();
    const result = {
      operation: 'UPDATE',
      affectedRows: 3,
    };

    panel.displayWriteResult(result, 30);

    t.equal(panel.resultType, RESULT_TYPE.UPDATE);
    t.equal(panel.affectedRows, 3);
  });

  t.test('displayWriteResult handles DELETE', async (t) => {
    const panel = new ResultsPanel();
    const result = {
      operation: 'DELETE',
      affectedRows: 1,
    };

    panel.displayWriteResult(result, 15);

    t.equal(panel.resultType, RESULT_TYPE.DELETE);
    t.equal(panel.affectedRows, 1);
  });

  t.test('displayError sets error state', async (t) => {
    const panel = new ResultsPanel();
    const error = {
      message: 'Table not found',
      code: 'TABLE_NOT_FOUND',
      detail: 'Table "users" does not exist',
    };

    panel.displayError(error);

    t.equal(panel.resultType, RESULT_TYPE.ERROR);
    t.equal(panel.error.message, 'Table not found');
    t.equal(panel.error.code, 'TABLE_NOT_FOUND');
  });

  t.test('displayError handles missing message', async (t) => {
    const panel = new ResultsPanel();

    panel.displayError({});

    t.equal(panel.error.message, 'Unknown error');
  });

  t.test('clear resets all state', async (t) => {
    const panel = new ResultsPanel();
    panel.displaySelectResult({rows: [{id: 1}]}, 50);

    panel.clear();

    t.equal(panel.currentResult, null);
    t.equal(panel.resultType, null);
    t.equal(panel.executionTime, null);
    t.equal(panel.scrollPosition, 0);
  });

  t.test('getTableData returns formatted data', async (t) => {
    const panel = new ResultsPanel();
    panel.displaySelectResult({
      rows: [{id: 1, name: 'Alice'}],
      columns: ['id', 'name'],
    }, 10);

    const tableData = panel.getTableData();

    t.same(tableData.headers, ['id', 'name']);
    t.equal(tableData.rows.length, 1);
  });

  t.test('getTableData returns empty for error', async (t) => {
    const panel = new ResultsPanel();
    panel.displayError({message: 'Error'});

    const tableData = panel.getTableData();

    t.same(tableData.headers, []);
    t.same(tableData.rows, []);
  });

  t.test('formatCell handles null', async (t) => {
    const panel = new ResultsPanel();

    t.equal(panel.formatCell(null), '{gray-fg}NULL{/}');
  });

  t.test('formatCell handles undefined', async (t) => {
    const panel = new ResultsPanel();

    t.equal(panel.formatCell(undefined), '');
  });

  t.test('formatCell handles objects', async (t) => {
    const panel = new ResultsPanel();

    t.equal(panel.formatCell({a: 1}), '{"a":1}');
  });

  t.test('formatCell truncates long objects', async (t) => {
    const panel = new ResultsPanel();
    const longObj = {key: 'a'.repeat(100)};

    const result = panel.formatCell(longObj);

    t.ok(result.length <= 53); // 50 + '...'
    t.ok(result.endsWith('...'));
  });

  t.test('formatCell handles booleans', async (t) => {
    const panel = new ResultsPanel();

    t.equal(panel.formatCell(true), 'true');
    t.equal(panel.formatCell(false), 'false');
  });

  t.test('formatCell handles strings and numbers', async (t) => {
    const panel = new ResultsPanel();

    t.equal(panel.formatCell('hello'), 'hello');
    t.equal(panel.formatCell(42), '42');
  });

  t.test('getStatusLine for SELECT result', async (t) => {
    const panel = new ResultsPanel();
    panel.displaySelectResult({
      rows: [{id: 1}, {id: 2}],
      partitions: ['p1', 'p2'],
    }, 50);

    const status = panel.getStatusLine();

    t.ok(status.includes('2 rows'));
    t.ok(status.includes('50ms'));
    t.ok(status.includes('Partitions'));
  });

  t.test('getStatusLine for single row', async (t) => {
    const panel = new ResultsPanel();
    panel.displaySelectResult({rows: [{id: 1}]}, 10);

    const status = panel.getStatusLine();

    t.ok(status.includes('1 row'));
    t.ok(!status.includes('1 rows'));
  });

  t.test('getStatusLine for INSERT result', async (t) => {
    const panel = new ResultsPanel();
    panel.displayWriteResult({operation: 'INSERT', affectedRows: 5}, 25);

    const status = panel.getStatusLine();

    t.ok(status.includes('INSERT'));
    t.ok(status.includes('5 rows affected'));
  });

  t.test('getStatusLine for error', async (t) => {
    const panel = new ResultsPanel();
    panel.displayError({message: 'Test error'});

    const status = panel.getStatusLine();

    t.ok(status.includes('Error'));
    t.ok(status.includes('Test error'));
  });

  t.test('getStatusLine truncates many partitions', async (t) => {
    const panel = new ResultsPanel();
    panel.displaySelectResult({
      rows: [{id: 1}],
      partitions: ['p1', 'p2', 'p3', 'p4', 'p5'],
    }, 10);

    const status = panel.getStatusLine();

    t.ok(status.includes('5 total'));
  });

  t.test('getMessageContent for write result', async (t) => {
    const panel = new ResultsPanel();
    panel.displayWriteResult({operation: 'UPDATE', affectedRows: 3}, 20);

    const message = panel.getMessageContent();

    t.ok(message.includes('UPDATE completed'));
    t.ok(message.includes('Affected rows: 3'));
  });

  t.test('getMessageContent for empty result', async (t) => {
    const panel = new ResultsPanel();
    panel.displaySelectResult({rows: [], tableName: 'users'}, 10);

    const message = panel.getMessageContent();

    t.ok(message.includes('No results'));
    t.ok(message.includes('users'));
  });

  t.test('getErrorMessage includes all error details', async (t) => {
    const panel = new ResultsPanel();
    panel.displayError({
      message: 'Syntax error',
      code: 'SYNTAX_ERROR',
      detail: 'Near "SELEC"',
    });

    const message = panel.getErrorMessage();

    t.ok(message.includes('Syntax error'));
    t.ok(message.includes('SYNTAX_ERROR'));
    t.ok(message.includes('Near "SELEC"'));
  });

  t.test('scrollUp decreases scroll position', async (t) => {
    const panel = new ResultsPanel();
    panel.displaySelectResult({rows: [{id: 1}, {id: 2}, {id: 3}]}, 10);
    panel.scrollPosition = 2;

    panel.scrollUp();

    t.equal(panel.scrollPosition, 1);
  });

  t.test('scrollUp stops at 0', async (t) => {
    const panel = new ResultsPanel();
    panel.displaySelectResult({rows: [{id: 1}]}, 10);
    panel.scrollPosition = 0;

    panel.scrollUp();

    t.equal(panel.scrollPosition, 0);
  });

  t.test('scrollDown increases scroll position', async (t) => {
    const panel = new ResultsPanel();
    panel.displaySelectResult({rows: [{id: 1}, {id: 2}, {id: 3}]}, 10);

    panel.scrollDown();

    t.equal(panel.scrollPosition, 1);
  });

  t.test('scrollDown stops at max', async (t) => {
    const panel = new ResultsPanel();
    panel.displaySelectResult({rows: [{id: 1}, {id: 2}]}, 10);
    panel.scrollPosition = 1;

    panel.scrollDown();

    t.equal(panel.scrollPosition, 1);
  });

  t.test('getSelectedRow returns current row', async (t) => {
    const panel = new ResultsPanel();
    panel.displaySelectResult({rows: [{id: 1}, {id: 2}]}, 10);
    panel.selectedRow = 1;

    const row = panel.getSelectedRow();

    t.same(row, {id: 2});
  });

  t.test('getSelectedRow returns null for no results', async (t) => {
    const panel = new ResultsPanel();

    const row = panel.getSelectedRow();

    t.equal(row, null);
  });

  t.test('hasResults returns true for valid results', async (t) => {
    const panel = new ResultsPanel();
    panel.displaySelectResult({rows: [{id: 1}]}, 10);

    t.equal(panel.hasResults(), true);
  });

  t.test('hasResults returns false for error', async (t) => {
    const panel = new ResultsPanel();
    panel.displayError({message: 'Error'});

    t.equal(panel.hasResults(), false);
  });

  t.test('hasError returns true for error', async (t) => {
    const panel = new ResultsPanel();
    panel.displayError({message: 'Error'});

    t.equal(panel.hasError(), true);
  });

  t.test('hasError returns false for valid results', async (t) => {
    const panel = new ResultsPanel();
    panel.displaySelectResult({rows: [{id: 1}]}, 10);

    t.equal(panel.hasError(), false);
  });

  t.test('emits update events', async (t) => {
    const eventBus = createMockEventBus();
    const panel = new ResultsPanel({eventBus});

    panel.displaySelectResult({rows: [{id: 1}]}, 50);

    const events = eventBus.getEvents('resultspanel:update');
    t.equal(events.length, 1);
    t.equal(events[0].data.executionTime, 50);
  });

  t.test('RESULT_TYPE constants are correct', async (t) => {
    t.equal(RESULT_TYPE.SELECT, 'select');
    t.equal(RESULT_TYPE.INSERT, 'insert');
    t.equal(RESULT_TYPE.UPDATE, 'update');
    t.equal(RESULT_TYPE.DELETE, 'delete');
    t.equal(RESULT_TYPE.ERROR, 'error');
    t.equal(RESULT_TYPE.EMPTY, 'empty');
  });
});
