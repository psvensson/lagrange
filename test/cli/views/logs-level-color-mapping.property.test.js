/**
 * Property Test: Logs Level Color Mapping
 * Property 42: For any log entry, the row status and color should correctly
 * map to the log level - ERROR logs should be red, WARN logs should be yellow,
 * and other levels should use default styling.
 *
 * **Validates: Requirements 29.8**
 */

import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {LogsView, LOG_LEVELS, LOG_LEVEL_COLORS} from
  '../../../src/cli/views/logs-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

/**
 * Generate a valid log record
 */
const logArb = fc.record({
  log_id: fc.string({minLength: 1, maxLength: 20}),
  timestamp: fc.integer({min: 1000000000000, max: 2000000000000}),
  level: fc.constantFrom(...LOG_LEVELS),
  node_id: fc.string({minLength: 1, maxLength: 20}),
  service_id: fc.string({minLength: 1, maxLength: 20}),
  message: fc.string({minLength: 0, maxLength: 100}),
});

test('Property 42: Logs Level Color Mapping', async (t) => {
  await t.test('ERROR logs return ERROR row status', async (t) => {
    fc.assert(
      fc.property(
        logArb,
        (log) => {
          const errorLog = {...log, level: 'ERROR'};
          const view = new LogsView();

          return view.getRowStatus(errorLog) === ROW_STATUS.ERROR;
        },
      ),
      {numRuns: 10},
    );
    t.pass('ERROR logs return ERROR row status');
  });

  await t.test('WARN logs return WARNING row status', async (t) => {
    fc.assert(
      fc.property(
        logArb,
        (log) => {
          const warnLog = {...log, level: 'WARN'};
          const view = new LogsView();

          return view.getRowStatus(warnLog) === ROW_STATUS.WARNING;
        },
      ),
      {numRuns: 10},
    );
    t.pass('WARN logs return WARNING row status');
  });

  await t.test('INFO logs return NORMAL row status', async (t) => {
    fc.assert(
      fc.property(
        logArb,
        (log) => {
          const infoLog = {...log, level: 'INFO'};
          const view = new LogsView();

          return view.getRowStatus(infoLog) === ROW_STATUS.NORMAL;
        },
      ),
      {numRuns: 10},
    );
    t.pass('INFO logs return NORMAL row status');
  });

  await t.test('DEBUG logs return NORMAL row status', async (t) => {
    fc.assert(
      fc.property(
        logArb,
        (log) => {
          const debugLog = {...log, level: 'DEBUG'};
          const view = new LogsView();

          return view.getRowStatus(debugLog) === ROW_STATUS.NORMAL;
        },
      ),
      {numRuns: 10},
    );
    t.pass('DEBUG logs return NORMAL row status');
  });

  await t.test('TRACE logs return NORMAL row status', async (t) => {
    fc.assert(
      fc.property(
        logArb,
        (log) => {
          const traceLog = {...log, level: 'TRACE'};
          const view = new LogsView();

          return view.getRowStatus(traceLog) === ROW_STATUS.NORMAL;
        },
      ),
      {numRuns: 10},
    );
    t.pass('TRACE logs return NORMAL row status');
  });

  await t.test('getLevelColor returns red for ERROR', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom('ERROR', 'error', 'Error'),
        (level) => {
          const view = new LogsView();
          return view.getLevelColor(level) === 'red';
        },
      ),
      {numRuns: 10},
    );
    t.pass('getLevelColor returns red for ERROR');
  });

  await t.test('getLevelColor returns yellow for WARN', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom('WARN', 'warn', 'Warn'),
        (level) => {
          const view = new LogsView();
          return view.getLevelColor(level) === 'yellow';
        },
      ),
      {numRuns: 10},
    );
    t.pass('getLevelColor returns yellow for WARN');
  });

  await t.test('getLevelColor returns white for INFO', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom('INFO', 'info', 'Info'),
        (level) => {
          const view = new LogsView();
          return view.getLevelColor(level) === 'white';
        },
      ),
      {numRuns: 10},
    );
    t.pass('getLevelColor returns white for INFO');
  });

  await t.test('getLevelColor returns gray for DEBUG and TRACE', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom('DEBUG', 'debug', 'TRACE', 'trace'),
        (level) => {
          const view = new LogsView();
          return view.getLevelColor(level) === 'gray';
        },
      ),
      {numRuns: 10},
    );
    t.pass('getLevelColor returns gray for DEBUG and TRACE');
  });

  await t.test('row status is case insensitive', async (t) => {
    fc.assert(
      fc.property(
        logArb,
        fc.constantFrom('error', 'ERROR', 'Error', 'eRrOr'),
        (log, level) => {
          const errorLog = {...log, level};
          const view = new LogsView();

          return view.getRowStatus(errorLog) === ROW_STATUS.ERROR;
        },
      ),
      {numRuns: 10},
    );
    t.pass('row status is case insensitive');
  });

  await t.test('LOG_LEVEL_COLORS constant has correct mappings', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LOG_LEVELS),
        (level) => {
          const expectedColors = {
            ERROR: 'red',
            WARN: 'yellow',
            INFO: 'white',
            DEBUG: 'gray',
            TRACE: 'gray',
          };
          return LOG_LEVEL_COLORS[level] === expectedColors[level];
        },
      ),
      {numRuns: 10},
    );
    t.pass('LOG_LEVEL_COLORS constant has correct mappings');
  });

  await t.test('rendered rows have correct status based on level', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 1, maxLength: 5}),
        (logs) => {
          // Ensure unique log IDs
          const uniqueLogs = [];
          const seenIds = new Set();
          for (const log of logs) {
            if (!seenIds.has(log.log_id)) {
              seenIds.add(log.log_id);
              uniqueLogs.push(log);
            }
          }

          const view = new LogsView();
          view.setData(uniqueLogs);
          const rendered = view.render();

          // Each row's status should match the log level
          return rendered.rows.every((row) => {
            const level = (row.item.level || 'INFO').toUpperCase();
            if (level === 'ERROR') {
              return row.status === ROW_STATUS.ERROR;
            } else if (level === 'WARN') {
              return row.status === ROW_STATUS.WARNING;
            } else {
              return row.status === ROW_STATUS.NORMAL;
            }
          });
        },
      ),
      {numRuns: 10},
    );
    t.pass('rendered rows have correct status based on level');
  });
});
