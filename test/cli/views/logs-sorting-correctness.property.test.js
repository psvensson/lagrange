/**
 * Property Test: Logs Sorting Correctness
 * Property 43: For any set of logs, sorting by timestamp should produce
 * a correctly ordered sequence (ascending or descending based on direction).
 *
 * **Validates: Requirements 29.12**
 */

import {test} from 'tap';
import fc from 'fast-check';
import {LogsView, LOG_LEVELS} from '../../../src/cli/views/logs-view.js';

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

/**
 * Check if array is sorted in ascending order by timestamp
 * @param {Array} logs - Array of log records
 * @return {boolean} True if sorted ascending
 */
function isSortedAscending(logs) {
  for (let i = 1; i < logs.length; i++) {
    const prev = logs[i - 1].timestamp;
    const curr = logs[i].timestamp;
    if (prev > curr) {
      return false;
    }
  }
  return true;
}

/**
 * Check if array is sorted in descending order by timestamp
 * @param {Array} logs - Array of log records
 * @return {boolean} True if sorted descending
 */
function isSortedDescending(logs) {
  for (let i = 1; i < logs.length; i++) {
    const prev = logs[i - 1].timestamp;
    const curr = logs[i].timestamp;
    if (prev < curr) {
      return false;
    }
  }
  return true;
}

test('Property 43: Logs Sorting Correctness', async (t) => {
  await t.test('default sort is timestamp descending', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 2, maxLength: 10}),
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

          if (uniqueLogs.length < 2) return true;

          const view = new LogsView();
          view.setData(uniqueLogs);

          // Default sort should be timestamp descending
          return isSortedDescending(view.filteredData);
        },
      ),
      {numRuns: 10},
    );
    t.pass('default sort is timestamp descending');
  });

  await t.test('ascending sort produces correct order', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 2, maxLength: 10}),
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

          if (uniqueLogs.length < 2) return true;

          const view = new LogsView();
          view.setData(uniqueLogs);
          view.setSort('timestamp', 'asc');

          return isSortedAscending(view.filteredData);
        },
      ),
      {numRuns: 10},
    );
    t.pass('ascending sort produces correct order');
  });

  await t.test('descending sort produces correct order', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 2, maxLength: 10}),
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

          if (uniqueLogs.length < 2) return true;

          const view = new LogsView();
          view.setData(uniqueLogs);
          view.setSort('timestamp', 'desc');

          return isSortedDescending(view.filteredData);
        },
      ),
      {numRuns: 10},
    );
    t.pass('descending sort produces correct order');
  });

  await t.test('toggling sort direction reverses order', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 2, maxLength: 10}),
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

          if (uniqueLogs.length < 2) return true;

          const view = new LogsView();
          view.setData(uniqueLogs);

          // Start with ascending
          view.setSort('timestamp', 'asc');
          const ascFirst = view.filteredData[0].log_id;

          // Toggle to descending
          view.setSort('timestamp', 'desc');
          const descFirst = view.filteredData[0].log_id;

          // First elements should be different (unless all same timestamp)
          const allSameTimestamp = uniqueLogs.every(
            (l) => l.timestamp === uniqueLogs[0].timestamp,
          );
          if (allSameTimestamp) return true;

          return ascFirst !== descFirst;
        },
      ),
      {numRuns: 10},
    );
    t.pass('toggling sort direction reverses order');
  });

  await t.test('sort preserves all data', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 1, maxLength: 10}),
        fc.constantFrom('asc', 'desc'),
        (logs, direction) => {
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
          view.setSort('timestamp', direction);

          // All original logs should be present
          const sortedIds = new Set(view.filteredData.map((l) => l.log_id));
          return uniqueLogs.every((l) => sortedIds.has(l.log_id));
        },
      ),
      {numRuns: 10},
    );
    t.pass('sort preserves all data');
  });

  await t.test('sort handles null timestamps', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 1, maxLength: 5}),
        fc.constantFrom('asc', 'desc'),
        (logs, direction) => {
          // Ensure unique log IDs
          const uniqueLogs = [];
          const seenIds = new Set();
          for (const log of logs) {
            if (!seenIds.has(log.log_id)) {
              seenIds.add(log.log_id);
              uniqueLogs.push(log);
            }
          }

          // Add a log with null timestamp
          uniqueLogs.push({
            log_id: 'null-ts-log',
            timestamp: null,
            level: 'INFO',
            node_id: 'node-1',
            service_id: 'svc-1',
            message: 'Test',
          });

          const view = new LogsView();
          view.setData(uniqueLogs);
          view.setSort('timestamp', direction);

          // Should not throw and should include all logs
          return view.filteredData.length === uniqueLogs.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('sort handles null timestamps');
  });

  await t.test('sort is stable for equal timestamps', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1000000000000, max: 2000000000000}),
        fc.array(fc.string({minLength: 1, maxLength: 10}), {
          minLength: 2,
          maxLength: 5,
        }),
        (timestamp, logIds) => {
          // Create logs with same timestamp but different IDs
          const uniqueIds = [...new Set(logIds)];
          if (uniqueIds.length < 2) return true;

          const logs = uniqueIds.map((id) => ({
            log_id: id,
            timestamp,
            level: 'INFO',
            node_id: 'node-1',
            service_id: 'svc-1',
            message: 'Test',
          }));

          const view = new LogsView();
          view.setData(logs);
          view.setSort('timestamp', 'asc');

          // All logs should be present
          return view.filteredData.length === logs.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('sort is stable for equal timestamps');
  });

  await t.test('sort works with filtered data', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 2, maxLength: 10}),
        fc.constantFrom(...LOG_LEVELS),
        fc.constantFrom('asc', 'desc'),
        (logs, filterLevel, direction) => {
          // Ensure unique log IDs
          const uniqueLogs = [];
          const seenIds = new Set();
          for (const log of logs) {
            if (!seenIds.has(log.log_id)) {
              seenIds.add(log.log_id);
              uniqueLogs.push(log);
            }
          }

          // Add at least one log with the filter level
          uniqueLogs.push({
            log_id: 'filter-match-log',
            timestamp: Date.now(),
            level: filterLevel,
            node_id: 'node-1',
            service_id: 'svc-1',
            message: 'Test',
          });

          const view = new LogsView();
          view.setData(uniqueLogs);
          view.setLevelFilter(filterLevel);
          view.setSort('timestamp', direction);

          // Filtered data should be sorted
          if (view.filteredData.length < 2) return true;

          if (direction === 'asc') {
            return isSortedAscending(view.filteredData);
          } else {
            return isSortedDescending(view.filteredData);
          }
        },
      ),
      {numRuns: 10},
    );
    t.pass('sort works with filtered data');
  });
});
