import {test} from '../../src/test-helpers/tap.js';
import {
  CDC_OPERATIONS,
  SystemTableCache,
  getSharedRowReadStats,
  resetSharedRowReadStats,
} from '../../src/cache/system-table-cache.js';
import {
  filterSharedRows,
  readAllSharedRows,
} from '../../src/cache/shared-row-read.js';

const TABLE = 'replica_operations';
const ROW_COUNT = 20;

function seedCache() {
  const cache = new SystemTableCache();
  for (let index = 0; index < ROW_COUNT; index += 1) {
    cache.applySystemTableChange(TABLE, CDC_OPERATIONS.INSERT, {
      operation_id: `op-${index}`,
      partition_id: `replica_operations-p${index}`,
      service_type: 'partition',
      status: 'active',
      steps_history: JSON.stringify([{step: 'SYNCING', timestamp: index}]),
    });
  }
  return cache;
}

test(
  'shared-row read returns no-clone frozen shared rows',
  async (t) => {
    const cache = seedCache();
    resetSharedRowReadStats();
    const rows = readAllSharedRows(cache, TABLE);
    t.equal(rows.length, ROW_COUNT, 'returns every row');
    t.ok(
      rows.every((row) => Object.isFrozen(row)),
      'rows are frozen (shared, no clone)',
    );
    t.equal(
      getSharedRowReadStats().engagements,
      ROW_COUNT,
      'engagement counter proves the no-clone path fired per row',
    );
    // Reading the SAME table again returns the identical shared objects (the
    // per-read clone the profiler pinned is eliminated).
    const rowsAgain = readAllSharedRows(cache, TABLE);
    t.equal(
      rows[0],
      rowsAgain[0],
      'subsequent reads share the identical row reference (no re-clone)',
    );
    t.end();
  },
);

test(
  'shared-row read is frozen end-to-end (mutation fails loudly)',
  async (t) => {
    const cache = seedCache();
    const [row] = readAllSharedRows(cache, TABLE);
    t.throws(
      () => {
        row.status = 'mutated';
      },
      'top-level mutation of a shared row throws',
    );
    t.end();
  },
);

test('shared-row read carries the stored row values', async (t) => {
  const cache = seedCache();
  const rows = readAllSharedRows(cache, TABLE);
  const op3 = rows.find((row) => row.operation_id === 'op-3');
  t.ok(op3, 'op-3 is present');
  t.equal(op3.status, 'active', 'row field values are intact');
  t.equal(
    op3.partition_id,
    'replica_operations-p3',
    'row identity fields are intact',
  );
  t.end();
});

test('filterSharedRows respects the predicate and returns frozen rows',
  async (t) => {
    const cache = seedCache();
    resetSharedRowReadStats();
    const matches = filterSharedRows(
      cache,
      TABLE,
      (row) => row.operation_id === 'op-3',
    );
    t.equal(matches.length, 1, 'predicate narrows the result');
    t.ok(Object.isFrozen(matches[0]), 'matched row is frozen+shared');
    t.equal(
      getSharedRowReadStats().engagements,
      1,
      'one engagement per matched row',
    );
    t.end();
  });

test('shared-row helpers fall back gracefully on a mock cache', async (t) => {
  const mockCache = {
    getAll: () => [{operation_id: 'mock'}],
    filter: (_table, predicate) =>
      [{operation_id: 'mock'}].filter(predicate),
  };
  const rows = readAllSharedRows(mockCache, TABLE);
  t.equal(rows[0].operation_id, 'mock', 'getAll fallback used');
  t.notOk(
    Object.isFrozen(rows[0]),
    'a mock without getAllShared is not frozen by the helper',
  );
  const filtered = filterSharedRows(mockCache, TABLE, () => true);
  t.equal(filtered.length, 1, 'filter fallback used');
  t.end();
});
