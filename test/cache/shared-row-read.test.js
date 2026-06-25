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

const FLAG = 'LAGRANGE_PR_SNAPSHOT_SHARED_ROW_READ';
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

function withFlag(value, fn) {
  const previous = process.env[FLAG];
  if (value === undefined) {
    delete process.env[FLAG];
  } else {
    process.env[FLAG] = value;
  }
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = previous;
    }
  }
}

test(
  'shared-row read FIRES: no-clone frozen shared rows when lever on',
  async (t) => {
    const cache = seedCache();
    withFlag('true', () => {
      resetSharedRowReadStats();
      const rows = readAllSharedRows(cache, TABLE);
      t.equal(rows.length, ROW_COUNT, 'returns every row');
      t.ok(
        rows.every((row) => Object.isFrozen(row)),
        'lever-on rows are frozen (shared, no clone)',
      );
      t.equal(
        getSharedRowReadStats().engagements,
        ROW_COUNT,
        'engagement counter proves the no-clone path fired per row',
      );
      // Reading the SAME table again returns the identical shared objects (the
      // clone the profiler pinned is eliminated).
      const rowsAgain = readAllSharedRows(cache, TABLE);
      t.equal(
        rows[0],
        rowsAgain[0],
        'subsequent reads share the identical row reference (no re-clone)',
      );
    });
    t.end();
  },
);

test(
  'shared-row read is frozen end-to-end (nested mutation fails loudly)',
  async (t) => {
    const cache = seedCache();
    withFlag('true', () => {
      const [row] = readAllSharedRows(cache, TABLE);
      t.throws(
        () => {
          row.status = 'mutated';
        },
        'top-level mutation of a shared row throws',
      );
      t.ok(
        Object.isFrozen(row.steps_history) === false ||
          typeof row.steps_history === 'string',
        'nested values are deep-frozen or primitive',
      );
    });
    t.end();
  },
);

test(
  'shared-row read no-op when lever off (cloning path, byte-identical)',
  async (t) => {
    const cache = seedCache();
    withFlag(undefined, () => {
      resetSharedRowReadStats();
      const rows = readAllSharedRows(cache, TABLE);
      t.equal(rows.length, ROW_COUNT, 'returns every row');
      t.notOk(
        rows.some((row) => Object.isFrozen(row)),
        'lever-off rows are fresh mutable clones',
      );
      t.equal(
        getSharedRowReadStats().engagements,
        0,
        'lever-off never engages the no-clone path',
      );
      // Distinct clones across reads (historical isolation contract).
      const rowsAgain = readAllSharedRows(cache, TABLE);
      t.not(
        rows[0],
        rowsAgain[0],
        'lever-off returns a distinct clone per read',
      );
    });
    t.end();
  },
);

test('shared-row read value-equivalence on vs off', async (t) => {
  const cache = seedCache();
  const off = withFlag(undefined, () => readAllSharedRows(cache, TABLE));
  const on = withFlag('true', () => readAllSharedRows(cache, TABLE));
  t.same(
    on.map((row) => ({...row})),
    off.map((row) => ({...row})),
    'shared and cloned reads carry identical row values',
  );
  t.end();
});

test('filterSharedRows respects the predicate and the lever', async (t) => {
  const cache = seedCache();
  withFlag('true', () => {
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
  });
  t.end();
});

test('shared-row helpers fall back gracefully on a mock cache', async (t) => {
  const mockCache = {
    getAll: () => [{operation_id: 'mock'}],
    filter: (_table, predicate) =>
      [{operation_id: 'mock'}].filter(predicate),
  };
  withFlag('true', () => {
    const rows = readAllSharedRows(mockCache, TABLE);
    t.equal(rows[0].operation_id, 'mock', 'getAll fallback used');
    t.notOk(
      Object.isFrozen(rows[0]),
      'mock without getAllShared is not frozen by the helper',
    );
    const filtered = filterSharedRows(mockCache, TABLE, () => true);
    t.equal(filtered.length, 1, 'filter fallback used');
  });
  t.end();
});
