import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {TABLE_DISTRIBUTION_TABLE_BOOTSTRAP_HELPERS} from
  '../../scenarios/table-distribution-helpers-table-bootstrap.js';

const {
  CONTROL_QUERY_EXECUTION_MODE,
  queryControl,
} = TABLE_DISTRIBUTION_TABLE_BOOTSTRAP_HELPERS;

const CONTROL_LANE = 'control';
const TEST_MUTATION_TIMEOUT_MS = 5000;

test('control mutation single-flight falls back when admin SQL engine is unavailable',
  async () => {
    const calls = [];
    const unavailableNode = {
      id: 'node-with-admin-before-sql',
      async queryWithTimeout(sql, _params, options = {}) {
        calls.push({
          nodeId: this.id,
          sql,
          timeoutMs: options.timeoutMs,
        });
        throw new Error(
          'Admin API query failed for node node-with-admin-before-sql ' +
          'on lane control: SQL query engine not available',
        );
      },
    };
    const serviceableNode = {
      id: 'node-with-sql-runtime',
      async queryWithTimeout(sql, _params, options = {}) {
        calls.push({
          nodeId: this.id,
          sql,
          timeoutMs: options.timeoutMs,
        });
        return {rows: [{created: true}]};
      },
    };

    const result = await queryControl(
      unavailableNode,
      'CREATE TABLE IF NOT EXISTS benchmark_events (id TEXT)',
      [],
      {
        timeoutMs: TEST_MUTATION_TIMEOUT_MS,
        lane: CONTROL_LANE,
        executionMode: CONTROL_QUERY_EXECUTION_MODE.MUTATION_SINGLE_FLIGHT,
        queryNodes: [serviceableNode],
      },
    );

    assert.deepEqual(result.rows, [{created: true}]);
    assert.deepEqual(
      calls.map((call) => call.nodeId),
      ['node-with-admin-before-sql', 'node-with-sql-runtime'],
    );
    assert.ok(
      calls.every((call) => call.timeoutMs > 0),
      'fallback attempts should share the caller timeout budget',
    );
  });
