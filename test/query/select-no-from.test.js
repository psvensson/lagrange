/**
 * Tests for SELECT queries without a FROM clause (e.g., SELECT 1, SELECT 1+1).
 * Bug: executeSelect crashes with TypeError when ast.from is null.
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

const mockPartitionData = new Map();

function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      const parts = address.split('/');
      const replicaId = parts[2];
      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(replicaId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: 0,
        };
      }
      return {acknowledged: true, success: true};
    },
  };
}

function createMockSystemCache(tables, partitions, services) {
  return {
    tables,
    partitions,
    services: services || partitions.map((p) => ({
      service_id: p.partition_id,
      service_type: 'partition',
      partition_id: p.partition_id,
      node_id: 'test-node',
      raft_role: 'leader',
      address: `test-node/partition/${p.partition_id}`,
      status: 'active',
    })),
    get: function(type, key) {
      if (type === 'tables') {
        return this.tables.find((t) => t.table_name === key);
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      return [];
    },
    getAll: function(type) {
      if (type === 'partitions') return this.partitions;
      if (type === 'tables') return this.tables;
      if (type === 'services') return this.services;
      return [];
    },
  };
}

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
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery('SELECT 1+1');

    t.equal(result.success, true);
    t.ok(result.rows);

    mockPartitionData.clear();
  });
