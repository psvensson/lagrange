/**
 * Tests for SELECT queries without a FROM clause (e.g., SELECT 1, SELECT 1+1).
 * Bug: executeSelect crashes with TypeError when ast.from is null.
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
import {
  createMockMessageRouter,
  createMockSystemCache,
  mockPartitionData,
} from './sql-query-engine-test-support.js';
const config = ConfigurationManager.getInstance();
config.initialize();

test('SQLQueryEngine - SELECT 1 does not crash when FROM is null',
  async (t) => {
    mockPartitionData.set('p1', [{1: 1}]);

    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [{
        partition_id: 'p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
      }],
    );

    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery('SELECT 1');

    t.equal(result.success, true);
    t.ok(result.rows);

    mockPartitionData.clear();
  });

test('SQLQueryEngine - SELECT 1+1 returns computed result',
  async (t) => {
    mockPartitionData.set('p1', [{'1+1': 2}]);

    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [{
        partition_id: 'p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
      }],
    );

    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery('SELECT 1+1');

    t.equal(result.success, true);
    t.ok(result.rows);

    mockPartitionData.clear();
  });
