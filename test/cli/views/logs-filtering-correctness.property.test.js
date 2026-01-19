/**
 * Property Test: Logs View Filtering Correctness
 * Property 41: For any combination of log filters (level, node, service,
 * time range, message), all displayed logs should satisfy ALL active filter
 * criteria.
 *
 * **Validates: Requirements 29.2, 29.3, 29.4, 29.5, 29.6**
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

test('Property 41: Logs View Filtering Correctness', async (t) => {
  await t.test('level filter shows only logs of that level', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 1, maxLength: 10}),
        fc.constantFrom(...LOG_LEVELS),
        (logs, targetLevel) => {
          // Ensure unique log IDs
          const uniqueLogs = [];
          const seenIds = new Set();
          for (const log of logs) {
            if (!seenIds.has(log.log_id)) {
              seenIds.add(log.log_id);
              uniqueLogs.push(log);
            }
          }

          // Add at least one log with the target level
          const targetLog = {
            ...uniqueLogs[0],
            log_id: 'target-log',
            level: targetLevel,
          };
          uniqueLogs.push(targetLog);

          const view = new LogsView();
          view.setData(uniqueLogs);
          view.setLevelFilter(targetLevel);

          // All filtered logs should have the target level
          return view.filteredData.every(
            (l) => l.level.toUpperCase() === targetLevel.toUpperCase(),
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('level filter shows only logs of that level');
  });

  await t.test('node filter shows only logs from that node', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 1, maxLength: 10}),
        fc.string({minLength: 1, maxLength: 20}),
        (logs, targetNodeId) => {
          // Ensure unique log IDs
          const uniqueLogs = [];
          const seenIds = new Set();
          for (const log of logs) {
            if (!seenIds.has(log.log_id)) {
              seenIds.add(log.log_id);
              uniqueLogs.push(log);
            }
          }

          // Add at least one log with the target node
          const targetLog = {
            ...uniqueLogs[0],
            log_id: 'target-log',
            node_id: targetNodeId,
          };
          uniqueLogs.push(targetLog);

          const view = new LogsView();
          view.setData(uniqueLogs);
          view.setNodeFilter(targetNodeId);

          // All filtered logs should have the target node_id
          return view.filteredData.every((l) => l.node_id === targetNodeId);
        },
      ),
      {numRuns: 10},
    );
    t.pass('node filter shows only logs from that node');
  });

  await t.test('service filter shows only logs from that service', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 1, maxLength: 10}),
        fc.string({minLength: 1, maxLength: 20}),
        (logs, targetServiceId) => {
          // Ensure unique log IDs
          const uniqueLogs = [];
          const seenIds = new Set();
          for (const log of logs) {
            if (!seenIds.has(log.log_id)) {
              seenIds.add(log.log_id);
              uniqueLogs.push(log);
            }
          }

          // Add at least one log with the target service
          const targetLog = {
            ...uniqueLogs[0],
            log_id: 'target-log',
            service_id: targetServiceId,
          };
          uniqueLogs.push(targetLog);

          const view = new LogsView();
          view.setData(uniqueLogs);
          view.setServiceFilter(targetServiceId);

          // All filtered logs should have the target service_id
          return view.filteredData.every(
            (l) => l.service_id === targetServiceId,
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('service filter shows only logs from that service');
  });

  await t.test('time range filter shows only logs within range', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 1, maxLength: 10}),
        fc.integer({min: 1000000000000, max: 1500000000000}),
        fc.integer({min: 1500000000001, max: 2000000000000}),
        (logs, startTime, endTime) => {
          // Ensure unique log IDs
          const uniqueLogs = [];
          const seenIds = new Set();
          for (const log of logs) {
            if (!seenIds.has(log.log_id)) {
              seenIds.add(log.log_id);
              uniqueLogs.push(log);
            }
          }

          // Add at least one log within the time range
          const midTime = Math.floor((startTime + endTime) / 2);
          const targetLog = {
            ...uniqueLogs[0],
            log_id: 'target-log',
            timestamp: midTime,
          };
          uniqueLogs.push(targetLog);

          const view = new LogsView();
          view.setData(uniqueLogs);
          view.setTimeRangeFilter(startTime, endTime);

          // All filtered logs should be within the time range
          return view.filteredData.every((l) => {
            const ts = l.timestamp;
            return ts >= startTime && ts <= endTime;
          });
        },
      ),
      {numRuns: 10},
    );
    t.pass('time range filter shows only logs within range');
  });

  await t.test('message filter shows only logs containing pattern',
    async (t) => {
      fc.assert(
        fc.property(
          fc.array(logArb, {minLength: 1, maxLength: 10}),
          fc.string({minLength: 1, maxLength: 10}),
          (logs, searchPattern) => {
            // Ensure unique log IDs
            const uniqueLogs = [];
            const seenIds = new Set();
            for (const log of logs) {
              if (!seenIds.has(log.log_id)) {
                seenIds.add(log.log_id);
                uniqueLogs.push(log);
              }
            }

            // Add at least one log containing the pattern
            const targetLog = {
              ...uniqueLogs[0],
              log_id: 'target-log',
              message: `prefix ${searchPattern} suffix`,
            };
            uniqueLogs.push(targetLog);

            const view = new LogsView();
            view.setData(uniqueLogs);
            view.setMessageFilter(searchPattern);

            // All filtered logs should contain the pattern
            const pattern = new RegExp(
              searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              'i',
            );
            return view.filteredData.every(
              (l) => pattern.test(l.message || ''),
            );
          },
        ),
        {numRuns: 10},
      );
      t.pass('message filter shows only logs containing pattern');
    });

  await t.test('combined filters are conjunctive (AND)', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 1, maxLength: 10}),
        fc.constantFrom(...LOG_LEVELS),
        fc.string({minLength: 1, maxLength: 20}),
        (logs, targetLevel, targetNodeId) => {
          // Ensure unique log IDs
          const uniqueLogs = [];
          const seenIds = new Set();
          for (const log of logs) {
            if (!seenIds.has(log.log_id)) {
              seenIds.add(log.log_id);
              uniqueLogs.push(log);
            }
          }

          // Add a log matching both filters
          const targetLog = {
            log_id: 'target-log',
            timestamp: Date.now(),
            level: targetLevel,
            node_id: targetNodeId,
            service_id: 'svc-1',
            message: 'Test message',
          };
          uniqueLogs.push(targetLog);

          const view = new LogsView();
          view.setData(uniqueLogs);
          view.setLevelFilter(targetLevel);
          view.setNodeFilter(targetNodeId);

          // All filtered logs should match BOTH filters
          return view.filteredData.every(
            (l) => l.level.toUpperCase() === targetLevel.toUpperCase() &&
                         l.node_id === targetNodeId,
          );
        },
      ),
      {numRuns: 10},
    );
    t.pass('combined filters are conjunctive (AND)');
  });

  await t.test('clearing filters restores all data', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 1, maxLength: 10}),
        fc.constantFrom(...LOG_LEVELS),
        (logs, targetLevel) => {
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

          // Apply filter
          view.setLevelFilter(targetLevel);

          // Clear all filters
          view.clearAllFilters();

          // Should restore all data (accounting for sort)
          return view.filteredData.length === uniqueLogs.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('clearing filters restores all data');
  });

  await t.test('filtered count is subset of total', async (t) => {
    fc.assert(
      fc.property(
        fc.array(logArb, {minLength: 0, maxLength: 10}),
        fc.constantFrom(...LOG_LEVELS),
        (logs, targetLevel) => {
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
          view.setLevelFilter(targetLevel);

          // Filtered count should be <= total count
          return view.filteredData.length <= uniqueLogs.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('filtered count is subset of total');
  });
});
