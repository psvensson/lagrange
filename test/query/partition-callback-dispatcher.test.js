/**
 * Tests for PartitionCallbackDispatcher.
 *
 * Validates: Requirements 5.2, 14.2
 *
 * Verifies that the dispatcher resolves target partitions from a
 * callback select query and constructs per-partition batches via
 * the single planner path (reusing PartitionResolver + QueryExecutor).
 */

import {test} from '../../src/test-helpers/tap.js';
import {PartitionCallbackDispatcher} from
  '../../src/query/partition-callback-dispatcher.js';
import {ADAPTER_ERROR_MSG} from
  '../../src/query/sql-adapter-constants.js';

// --- Helpers ---

function makeSqlRequest(overrides = {}) {
  return {
    statement: overrides.statement || 'SELECT * FROM users',
    parameters: overrides.parameters || [],
    sessionId: overrides.sessionId || 'default',
    callbackModuleRef: overrides.callbackModuleRef || 'mod-1',
    callbackExport: overrides.callbackExport || 'run_batch',
  };
}

function makePartitions(count) {
  const partitions = [];
  for (let i = 0; i < count; i++) {
    partitions.push({
      partition_id: `p${i}`,
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    });
  }
  return partitions;
}

function makeDispatcher(opts = {}) {
  const partitions = opts.partitions || makePartitions(1);
  const partitionRows = opts.partitionRows || {};

  const sqlParser = {
    parse: (_sql) => opts.ast || {
      type: 'select',
      from: {name: 'users'},
      where: opts.where || null,
      columns: [{type: 'star'}],
    },
  };

  const partitionResolver = {
    resolvePartitions: (_table, _where, parts) => {
      if (opts.resolvedIds) return opts.resolvedIds;
      return parts.map((p) => p.partition_id);
    },
  };

  const queryExecutor = {
    buildSelectSQL: (_ast) => 'SELECT * FROM users',
    executeOnPartition: async (partitionId, _sql, _params, _read, _pref) => {
      if (opts.failPartitions && opts.failPartitions.includes(partitionId)) {
        return {partitionId, success: false, error: 'fail', rows: []};
      }
      const rows = partitionRows[partitionId] || [{id: 1}];
      return {partitionId, success: true, rows};
    },
  };

  const getTablePartitions = (_name) => partitions;
  const isSystemTable = (_name) => opts.isSystem || false;

  return new PartitionCallbackDispatcher({
    sqlParser,
    partitionResolver,
    queryExecutor,
    getTablePartitions,
    isSystemTable,
  });
}

// --- Core dispatch ---

test('dispatcher - returns per-partition batches for single partition',
  async (t) => {
    const dispatcher = makeDispatcher({
      partitionRows: {p0: [{id: 1, name: 'Alice'}]},
    });
    const result = await dispatcher.dispatch(makeSqlRequest());

    t.equal(result.success, true);
    t.equal(result.batches.length, 1);
    t.equal(result.batches[0].partitionId, 'p0');
    t.same(result.batches[0].rows, [{id: 1, name: 'Alice'}]);
    t.equal(result.callbackModuleRef, 'mod-1');
    t.equal(result.callbackExport, 'run_batch');
  });

test('dispatcher - returns per-partition batches for multiple partitions',
  async (t) => {
    const dispatcher = makeDispatcher({
      partitions: makePartitions(3),
      partitionRows: {
        p0: [{id: 1}],
        p1: [{id: 2}, {id: 3}],
        p2: [{id: 4}],
      },
    });
    const result = await dispatcher.dispatch(makeSqlRequest());

    t.equal(result.success, true);
    t.equal(result.batches.length, 3);
    t.equal(result.batches[0].partitionId, 'p0');
    t.equal(result.batches[1].partitionId, 'p1');
    t.equal(result.batches[2].partitionId, 'p2');
    t.equal(result.batches[1].rows.length, 2);
  });

test('dispatcher - only includes successful partition results',
  async (t) => {
    const dispatcher = makeDispatcher({
      partitions: makePartitions(3),
      failPartitions: ['p1'],
      partitionRows: {
        p0: [{id: 1}],
        p2: [{id: 3}],
      },
    });
    const result = await dispatcher.dispatch(makeSqlRequest());

    t.equal(result.success, true);
    t.equal(result.batches.length, 2);
    const ids = result.batches.map((b) => b.partitionId);
    t.ok(ids.includes('p0'));
    t.ok(ids.includes('p2'));
    t.ok(!ids.includes('p1'));
  });

test('dispatcher - respects partition resolver subset',
  async (t) => {
    const dispatcher = makeDispatcher({
      partitions: makePartitions(3),
      resolvedIds: ['p1'],
      partitionRows: {p1: [{id: 99}]},
    });
    const result = await dispatcher.dispatch(makeSqlRequest());

    t.equal(result.batches.length, 1);
    t.equal(result.batches[0].partitionId, 'p1');
    t.same(result.batches[0].rows, [{id: 99}]);
  });

test('dispatcher - empty partition produces batch with empty rows',
  async (t) => {
    const dispatcher = makeDispatcher({
      partitionRows: {p0: []},
    });
    const result = await dispatcher.dispatch(makeSqlRequest());

    t.equal(result.batches.length, 1);
    t.same(result.batches[0].rows, []);
  });

// --- Error cases ---

test('dispatcher - throws when AST has no table name', async (t) => {
  const dispatcher = makeDispatcher({
    ast: {type: 'select', from: null, where: null},
  });

  try {
    await dispatcher.dispatch(makeSqlRequest());
    t.fail('should have thrown');
  } catch (err) {
    t.equal(
      err.message,
      ADAPTER_ERROR_MSG.PARTITION_CALLBACK_NO_TABLE,
    );
  }
});

test('dispatcher - throws when no partitions found', async (t) => {
  const dispatcher = makeDispatcher({partitions: []});

  try {
    await dispatcher.dispatch(makeSqlRequest());
    t.fail('should have thrown');
  } catch (err) {
    t.equal(
      err.message,
      ADAPTER_ERROR_MSG.PARTITION_CALLBACK_NO_PARTITIONS,
    );
  }
});

// --- Callback metadata passthrough ---

test('dispatcher - passes through callback metadata', async (t) => {
  const dispatcher = makeDispatcher();
  const result = await dispatcher.dispatch(makeSqlRequest({
    callbackModuleRef: 'my-mod',
    callbackExport: 'handle',
  }));

  t.equal(result.callbackModuleRef, 'my-mod');
  t.equal(result.callbackExport, 'handle');
});
