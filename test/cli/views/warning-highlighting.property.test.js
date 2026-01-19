/**
 * Property Test: Warning Highlighting
 * Property 6: For any entity with a warning condition (high resource usage,
 * failed status, insufficient replicas), the rendered row should have warning
 * or error styling applied.
 *
 * **Validates: Requirements 2.4, 5.6, 6.4**
 */

import {test} from 'tap';
import fc from 'fast-check';
import {NodesView, WARNING_THRESHOLDS} from
  '../../../src/cli/views/nodes-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

test('Property 6: Warning Highlighting', async (t) => {
  await t.test('failed status nodes have ERROR styling', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          node_id: fc.string({minLength: 1, maxLength: 20}),
          node_address: fc.string({minLength: 5, maxLength: 30}),
          status: fc.constantFrom('failed', 'error'),
          cpu_usage_percent: fc.float({min: 0, max: 50, noNaN: true}),
          memory_usage_percent: fc.float({min: 0, max: 50, noNaN: true}),
          disk_usage_percent: fc.float({min: 0, max: 50, noNaN: true}),
          services_count: fc.integer({min: 0, max: 100}),
        }),
        (node) => {
          const view = new NodesView();
          const status = view.getRowStatus(node);
          return status === ROW_STATUS.ERROR;
        },
      ),
      {numRuns: 10},
    );
    t.pass('failed status nodes have ERROR styling');
  });

  await t.test('high CPU usage nodes have WARNING styling', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          node_id: fc.string({minLength: 1, maxLength: 20}),
          node_address: fc.string({minLength: 5, maxLength: 30}),
          status: fc.constant('active'),
          cpu_usage_percent: fc.float({
            min: Math.fround(WARNING_THRESHOLDS.CPU_PERCENT + 1),
            max: Math.fround(100),
            noNaN: true,
          }),
          memory_usage_percent: fc.float({min: Math.fround(0), max: Math.fround(50), noNaN: true}),
          disk_usage_percent: fc.float({min: Math.fround(0), max: Math.fround(50), noNaN: true}),
          services_count: fc.integer({min: 0, max: 100}),
        }),
        (node) => {
          const view = new NodesView();
          const status = view.getRowStatus(node);
          return status === ROW_STATUS.WARNING;
        },
      ),
      {numRuns: 10},
    );
    t.pass('high CPU usage nodes have WARNING styling');
  });

  await t.test('high memory usage nodes have WARNING styling', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          node_id: fc.string({minLength: 1, maxLength: 20}),
          node_address: fc.string({minLength: 5, maxLength: 30}),
          status: fc.constant('active'),
          cpu_usage_percent: fc.float({min: Math.fround(0), max: Math.fround(50), noNaN: true}),
          memory_usage_percent: fc.float({
            min: Math.fround(WARNING_THRESHOLDS.MEMORY_PERCENT + 1),
            max: Math.fround(100),
            noNaN: true,
          }),
          disk_usage_percent: fc.float({min: Math.fround(0), max: Math.fround(50), noNaN: true}),
          services_count: fc.integer({min: 0, max: 100}),
        }),
        (node) => {
          const view = new NodesView();
          const status = view.getRowStatus(node);
          return status === ROW_STATUS.WARNING;
        },
      ),
      {numRuns: 10},
    );
    t.pass('high memory usage nodes have WARNING styling');
  });

  await t.test('high disk usage nodes have WARNING styling', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          node_id: fc.string({minLength: 1, maxLength: 20}),
          node_address: fc.string({minLength: 5, maxLength: 30}),
          status: fc.constant('active'),
          cpu_usage_percent: fc.float({min: Math.fround(0), max: Math.fround(50), noNaN: true}),
          memory_usage_percent: fc.float({min: Math.fround(0), max: Math.fround(50), noNaN: true}),
          disk_usage_percent: fc.float({
            min: Math.fround(WARNING_THRESHOLDS.DISK_PERCENT + 1),
            max: Math.fround(100),
            noNaN: true,
          }),
          services_count: fc.integer({min: 0, max: 100}),
        }),
        (node) => {
          const view = new NodesView();
          const status = view.getRowStatus(node);
          return status === ROW_STATUS.WARNING;
        },
      ),
      {numRuns: 10},
    );
    t.pass('high disk usage nodes have WARNING styling');
  });

  await t.test('healthy nodes have NORMAL styling', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          node_id: fc.string({minLength: 1, maxLength: 20}),
          node_address: fc.string({minLength: 5, maxLength: 30}),
          status: fc.constantFrom('active', 'starting', 'inactive'),
          cpu_usage_percent: fc.float({
            min: Math.fround(0),
            max: Math.fround(WARNING_THRESHOLDS.CPU_PERCENT - 1),
            noNaN: true,
          }),
          memory_usage_percent: fc.float({
            min: Math.fround(0),
            max: Math.fround(WARNING_THRESHOLDS.MEMORY_PERCENT - 1),
            noNaN: true,
          }),
          disk_usage_percent: fc.float({
            min: Math.fround(0),
            max: Math.fround(WARNING_THRESHOLDS.DISK_PERCENT - 1),
            noNaN: true,
          }),
          services_count: fc.integer({min: 0, max: 100}),
        }),
        (node) => {
          const view = new NodesView();
          const status = view.getRowStatus(node);
          return status === ROW_STATUS.NORMAL;
        },
      ),
      {numRuns: 10},
    );
    t.pass('healthy nodes have NORMAL styling');
  });

  await t.test('failed status takes precedence over warnings', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          node_id: fc.string({minLength: 1, maxLength: 20}),
          node_address: fc.string({minLength: 5, maxLength: 30}),
          status: fc.constantFrom('failed', 'error'),
          cpu_usage_percent: fc.float({min: 90, max: 100, noNaN: true}),
          memory_usage_percent: fc.float({min: 90, max: 100, noNaN: true}),
          disk_usage_percent: fc.float({min: 90, max: 100, noNaN: true}),
          services_count: fc.integer({min: 0, max: 100}),
        }),
        (node) => {
          const view = new NodesView();
          const status = view.getRowStatus(node);
          // Failed status should result in ERROR, not WARNING
          return status === ROW_STATUS.ERROR;
        },
      ),
      {numRuns: 10},
    );
    t.pass('failed status takes precedence over warnings');
  });

  await t.test('null resource values do not trigger warnings', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          node_id: fc.string({minLength: 1, maxLength: 20}),
          node_address: fc.string({minLength: 5, maxLength: 30}),
          status: fc.constant('active'),
          cpu_usage_percent: fc.constant(null),
          memory_usage_percent: fc.constant(null),
          disk_usage_percent: fc.constant(null),
          services_count: fc.integer({min: 0, max: 100}),
        }),
        (node) => {
          const view = new NodesView();
          const status = view.getRowStatus(node);
          return status === ROW_STATUS.NORMAL;
        },
      ),
      {numRuns: 10},
    );
    t.pass('null resource values do not trigger warnings');
  });

  await t.test('rendered rows have correct status in result', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          node_id: fc.string({minLength: 1, maxLength: 20}),
          node_address: fc.string({minLength: 5, maxLength: 30}),
          status: fc.constantFrom('active', 'failed'),
          cpu_usage_percent: fc.float({min: 0, max: 100, noNaN: true}),
          memory_usage_percent: fc.float({min: 0, max: 100, noNaN: true}),
          disk_usage_percent: fc.float({min: 0, max: 100, noNaN: true}),
          services_count: fc.integer({min: 0, max: 100}),
        }),
        (node) => {
          const view = new NodesView();
          view.setData([node]);
          const result = view.render();

          if (result.rows.length !== 1) return false;

          const expectedStatus = view.getRowStatus(node);
          const actualStatus = result.rows[0].status;

          return expectedStatus === actualStatus;
        },
      ),
      {numRuns: 10},
    );
    t.pass('rendered rows have correct status in result');
  });
});
