/**
 * Tests for admin-meta-command-handlers.
 * Requirements: 1.3, 11.1
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_META_ACTION,
  ADMIN_META_ERROR_MSG,
  WASM_DELEGATION_ACTIONS,
  CACHE_DUMP_TABLES,
  handleExecuteQuery,
  handleGetCacheDump,
  handleGetNodeStatus,
  handleListServices,
  handleListNodes,
  handleListPartitions,
  handleListLatencyGroups,
  handleListInterGroupLatencies,
} from '../../src/admin/admin-meta-command-handlers.js';
import {WASM_META_ACTION, TABLES} from '../../src/constants/index.js';
import {
  CDC_NON_PROPAGATED_TABLES,
} from '../../src/cache/cache-constants.js';

describe('admin-meta-command-handlers', () => {
  describe('handleExecuteQuery', () => {
    it('returns success with valid SQL', () => {
      const result = handleExecuteQuery({sql: 'SELECT 1'});
      assert.equal(result.success, true);
      assert.equal(result.sql, 'SELECT 1');
      assert.deepEqual(result.params, []);
    });

    it('passes queryParams through', () => {
      const result = handleExecuteQuery({
        sql: 'SELECT * FROM nodes WHERE node_id = ?1',
        queryParams: ['n1'],
      });
      assert.equal(result.success, true);
      assert.deepEqual(result.params, ['n1']);
    });

    it('returns error when SQL is missing', () => {
      const result = handleExecuteQuery({});
      assert.equal(result.success, false);
      assert.deepEqual(
        result.errors,
        [ADMIN_META_ERROR_MSG.SQL_REQUIRED],
      );
    });

    it('returns error when params is null', () => {
      const result = handleExecuteQuery(null);
      assert.equal(result.success, false);
      assert.deepEqual(
        result.errors,
        [ADMIN_META_ERROR_MSG.SQL_REQUIRED],
      );
    });

    it('returns error when SQL is not a string', () => {
      const result = handleExecuteQuery({sql: 42});
      assert.equal(result.success, false);
      assert.deepEqual(
        result.errors,
        [ADMIN_META_ERROR_MSG.SQL_MUST_BE_STRING],
      );
    });
  });

  describe('handleGetCacheDump', () => {
    it('returns table names list', () => {
      const result = handleGetCacheDump();
      assert.equal(result.success, true);
      assert.ok(Array.isArray(result.tables));
      assert.ok(result.tables.length > 0);
      assert.ok(result.tables.includes(TABLES.NODES));
      assert.ok(result.tables.includes(TABLES.SERVICES));
      assert.ok(result.tables.includes(TABLES.PARTITIONS));
      assert.strictEqual(result.tables, CACHE_DUMP_TABLES);
    });

    it('excludes non-propagated tables that are never in the cache', () => {
      for (const table of CDC_NON_PROPAGATED_TABLES) {
        assert.ok(
          !CACHE_DUMP_TABLES.includes(table),
          `CACHE_DUMP_TABLES must not include non-propagated table` +
          ` "${table}" — it is never hydrated into SystemTableCache`,
        );
      }
    });
  });

  describe('handleGetNodeStatus', () => {
    it('returns all-nodes SQL with no nodeId', () => {
      const result = handleGetNodeStatus({});
      assert.equal(result.success, true);
      assert.ok(result.sql.includes(TABLES.NODES));
      assert.ok(!result.sql.includes('WHERE'));
      assert.deepEqual(result.params, []);
    });

    it('returns filtered SQL with nodeId', () => {
      const result = handleGetNodeStatus({nodeId: 'node-1'});
      assert.equal(result.success, true);
      assert.ok(result.sql.includes('WHERE'));
      assert.ok(result.sql.includes('node_id'));
      assert.deepEqual(result.params, ['node-1']);
    });
  });

  describe('handleListServices', () => {
    it('returns unfiltered SQL with no filters', () => {
      const result = handleListServices({});
      assert.equal(result.success, true);
      assert.ok(result.sql.includes(TABLES.SERVICES));
      assert.ok(!result.sql.includes('WHERE'));
      assert.deepEqual(result.params, []);
    });

    it('filters by serviceType', () => {
      const result = handleListServices({
        serviceType: 'partition',
      });
      assert.equal(result.success, true);
      assert.ok(result.sql.includes('WHERE'));
      assert.ok(result.sql.includes('service_type'));
      assert.deepEqual(result.params, ['partition']);
    });

    it('filters by nodeId', () => {
      const result = handleListServices({nodeId: 'node-2'});
      assert.equal(result.success, true);
      assert.ok(result.sql.includes('WHERE'));
      assert.ok(result.sql.includes('node_id'));
      assert.deepEqual(result.params, ['node-2']);
    });

    it('combines serviceType and nodeId filters', () => {
      const result = handleListServices({
        serviceType: 'partition',
        nodeId: 'node-3',
      });
      assert.equal(result.success, true);
      assert.ok(result.sql.includes('AND'));
      assert.deepEqual(result.params, ['partition', 'node-3']);
    });
  });

  describe('handleListNodes', () => {
    it('returns SQL for nodes table', () => {
      const result = handleListNodes();
      assert.equal(result.success, true);
      assert.ok(result.sql.includes(TABLES.NODES));
      assert.deepEqual(result.params, []);
    });
  });

  describe('handleListPartitions', () => {
    it('returns all partitions SQL with no filter', () => {
      const result = handleListPartitions({});
      assert.equal(result.success, true);
      assert.ok(result.sql.includes(TABLES.PARTITIONS));
      assert.ok(!result.sql.includes('WHERE'));
      assert.deepEqual(result.params, []);
    });

    it('filters by tableId', () => {
      const result = handleListPartitions({tableId: 'tbl-1'});
      assert.equal(result.success, true);
      assert.ok(result.sql.includes('WHERE'));
      assert.ok(result.sql.includes('table_id'));
      assert.deepEqual(result.params, ['tbl-1']);
    });
  });

  describe('handleListLatencyGroups', () => {
    it('returns SQL for latency_groups table', () => {
      const result = handleListLatencyGroups();
      assert.equal(result.success, true);
      assert.ok(result.sql.includes(TABLES.LATENCY_GROUPS));
      assert.deepEqual(result.params, []);
    });
  });

  describe('handleListInterGroupLatencies', () => {
    it('returns unfiltered SQL when no filters provided', () => {
      const result = handleListInterGroupLatencies({});
      assert.equal(result.success, true);
      assert.ok(result.sql.includes(TABLES.INTER_GROUP_LATENCIES));
      assert.ok(!result.sql.includes('WHERE'));
      assert.deepEqual(result.params, []);
    });

    it('applies source/target group filters', () => {
      const result = handleListInterGroupLatencies({
        sourceGroupId: 'g-1',
        targetGroupId: 'g-2',
      });
      assert.equal(result.success, true);
      assert.ok(result.sql.includes('WHERE'));
      assert.ok(result.sql.includes('source_group_id'));
      assert.ok(result.sql.includes('target_group_id'));
      assert.deepEqual(result.params, ['g-1', 'g-2']);
    });
  });

  describe('WASM_DELEGATION_ACTIONS', () => {
    it('contains all WASM_META_ACTION values', () => {
      const actions = Object.values(WASM_META_ACTION);
      for (const action of actions) {
        assert.ok(
          WASM_DELEGATION_ACTIONS.has(action),
          `Missing delegation action: ${action}`,
        );
      }
      assert.equal(
        WASM_DELEGATION_ACTIONS.size,
        actions.length,
      );
    });
  });

  describe('ADMIN_META_ACTION', () => {
    it('has all expected action constants', () => {
      assert.equal(
        ADMIN_META_ACTION.EXECUTE_QUERY,
        'executeQuery',
      );
      assert.equal(
        ADMIN_META_ACTION.GET_CACHE_DUMP,
        'getCacheDump',
      );
      assert.equal(
        ADMIN_META_ACTION.GET_NODE_STATUS,
        'getNodeStatus',
      );
      assert.equal(
        ADMIN_META_ACTION.LIST_SERVICES,
        'listServices',
      );
      assert.equal(
        ADMIN_META_ACTION.LIST_NODES,
        'listNodes',
      );
      assert.equal(
        ADMIN_META_ACTION.LIST_PARTITIONS,
        'listPartitions',
      );
      assert.equal(
        ADMIN_META_ACTION.LIST_LATENCY_GROUPS,
        'listLatencyGroups',
      );
      assert.equal(
        ADMIN_META_ACTION.LIST_INTER_GROUP_LATENCIES,
        'listInterGroupLatencies',
      );
    });
  });
});
