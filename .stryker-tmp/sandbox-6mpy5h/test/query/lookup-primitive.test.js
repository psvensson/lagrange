/**
 * Tests for lookup primitive — ctx.lookup(table, keys[]).
 *
 * Verifies deduplication, batching by partition, access path
 * enforcement, and budget limits.
 *
 * Requirements: 5.1, 5.2
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  validateLookupArgs,
  isAllowedAccessPath,
  deduplicateKeys,
  groupKeysByPartition,
  estimateLookupBytes,
  executeLookup,
} from '../../src/query/lookup-primitive.js';
import {
  LOOKUP_ACCESS_PATH,
  PRIMITIVE_ERROR_MSG,
  LOOKUP_RESULT_FIELD as LRF,
} from '../../src/query/distributed/distributed-context-constants.js';
import {
  LOOKUP_MAX_KEYS,
} from '../../src/wasm-service/query-budget-constants.js';

// --- validateLookupArgs ---

test('validateLookupArgs - valid args', (t) => {
  const result = validateLookupArgs(
    'users',
    [{column: 'id', value: 1}],
    {},
  );
  t.ok(result.valid);
  t.equal(result.error, null);
  t.end();
});

test('validateLookupArgs - missing table', (t) => {
  const result = validateLookupArgs(
    null,
    [{column: 'id', value: 1}],
    {},
  );
  t.notOk(result.valid);
  t.equal(result.error, PRIMITIVE_ERROR_MSG.LOOKUP_TABLE_REQUIRED);
  t.end();
});

test('validateLookupArgs - table not string', (t) => {
  const result = validateLookupArgs(
    123,
    [{column: 'id', value: 1}],
    {},
  );
  t.notOk(result.valid);
  t.equal(
    result.error,
    PRIMITIVE_ERROR_MSG.LOOKUP_TABLE_MUST_BE_STRING,
  );
  t.end();
});

test('validateLookupArgs - missing keys', (t) => {
  const result = validateLookupArgs('users', null, {});
  t.notOk(result.valid);
  t.equal(result.error, PRIMITIVE_ERROR_MSG.LOOKUP_KEYS_REQUIRED);
  t.end();
});

test('validateLookupArgs - keys not array', (t) => {
  const result = validateLookupArgs('users', 'bad', {});
  t.notOk(result.valid);
  t.equal(
    result.error,
    PRIMITIVE_ERROR_MSG.LOOKUP_KEYS_MUST_BE_ARRAY,
  );
  t.end();
});

test('validateLookupArgs - empty keys', (t) => {
  const result = validateLookupArgs('users', [], {});
  t.notOk(result.valid);
  t.equal(result.error, PRIMITIVE_ERROR_MSG.LOOKUP_KEYS_EMPTY);
  t.end();
});

test('validateLookupArgs - key missing column', (t) => {
  const result = validateLookupArgs(
    'users',
    [{value: 1}],
    {},
  );
  t.notOk(result.valid);
  t.equal(
    result.error,
    PRIMITIVE_ERROR_MSG.LOOKUP_KEY_MISSING_COLUMN,
  );
  t.end();
});

test('validateLookupArgs - key missing value', (t) => {
  const result = validateLookupArgs(
    'users',
    [{column: 'id'}],
    {},
  );
  t.notOk(result.valid);
  t.equal(
    result.error,
    PRIMITIVE_ERROR_MSG.LOOKUP_KEY_MISSING_VALUE,
  );
  t.end();
});

test('validateLookupArgs - exceeds max keys', (t) => {
  const keys = Array.from(
    {length: LOOKUP_MAX_KEYS + 1},
    (_, i) => ({column: 'id', value: i}),
  );
  const result = validateLookupArgs('users', keys, {});
  t.notOk(result.valid);
  t.equal(
    result.error,
    PRIMITIVE_ERROR_MSG.LOOKUP_MAX_KEYS_EXCEEDED,
  );
  t.end();
});

test('validateLookupArgs - custom budget max keys', (t) => {
  const keys = [{column: 'id', value: 1}, {column: 'id', value: 2}];
  const result = validateLookupArgs('users', keys, {LOOKUP_MAX_KEYS: 1});
  t.notOk(result.valid);
  t.equal(
    result.error,
    PRIMITIVE_ERROR_MSG.LOOKUP_MAX_KEYS_EXCEEDED,
  );
  t.end();
});

// --- isAllowedAccessPath ---

test('isAllowedAccessPath - primary_key allowed', (t) => {
  t.ok(isAllowedAccessPath(LOOKUP_ACCESS_PATH.PRIMARY_KEY));
  t.end();
});

test('isAllowedAccessPath - unique_index allowed', (t) => {
  t.ok(isAllowedAccessPath(LOOKUP_ACCESS_PATH.UNIQUE_INDEX));
  t.end();
});

test('isAllowedAccessPath - bounded_index allowed', (t) => {
  t.ok(isAllowedAccessPath(LOOKUP_ACCESS_PATH.BOUNDED_INDEX));
  t.end();
});

test('isAllowedAccessPath - full_scan denied', (t) => {
  t.notOk(isAllowedAccessPath('full_scan'));
  t.end();
});

test('isAllowedAccessPath - empty string denied', (t) => {
  t.notOk(isAllowedAccessPath(''));
  t.end();
});

// --- deduplicateKeys ---

test('deduplicateKeys - removes duplicates', (t) => {
  const keys = [
    {column: 'id', value: 1},
    {column: 'id', value: 2},
    {column: 'id', value: 1},
    {column: 'id', value: 3},
    {column: 'id', value: 2},
  ];
  const result = deduplicateKeys(keys);
  t.equal(result.originalCount, 5);
  t.equal(result.dedupedCount, 3);
  t.equal(result.uniqueKeys.length, 3);
  t.equal(result.uniqueKeys[0].value, 1);
  t.equal(result.uniqueKeys[1].value, 2);
  t.equal(result.uniqueKeys[2].value, 3);
  t.end();
});

test('deduplicateKeys - no duplicates unchanged', (t) => {
  const keys = [
    {column: 'id', value: 1},
    {column: 'id', value: 2},
  ];
  const result = deduplicateKeys(keys);
  t.equal(result.originalCount, 2);
  t.equal(result.dedupedCount, 2);
  t.end();
});

test('deduplicateKeys - different columns not deduped', (t) => {
  const keys = [
    {column: 'id', value: 1},
    {column: 'name', value: 1},
  ];
  const result = deduplicateKeys(keys);
  t.equal(result.dedupedCount, 2);
  t.end();
});

// --- groupKeysByPartition ---

test('groupKeysByPartition - groups by resolver', (t) => {
  const keys = [
    {column: 'id', value: 1},
    {column: 'id', value: 2},
    {column: 'id', value: 3},
  ];
  const resolver = (key) => key.value <= 2 ? 'p1' : 'p2';
  const groups = groupKeysByPartition(keys, resolver);

  t.equal(groups.size, 2);
  t.equal(groups.get('p1').length, 2);
  t.equal(groups.get('p2').length, 1);
  t.end();
});

test('groupKeysByPartition - single partition', (t) => {
  const keys = [{column: 'id', value: 1}];
  const resolver = () => 'p1';
  const groups = groupKeysByPartition(keys, resolver);

  t.equal(groups.size, 1);
  t.equal(groups.get('p1').length, 1);
  t.end();
});

// --- estimateLookupBytes ---

test('estimateLookupBytes - estimates correctly', (t) => {
  const rows = [{id: 1, name: 'a'}, {id: 2, name: 'b'}];
  const bytes = estimateLookupBytes(rows);
  t.ok(bytes > 0);
  t.end();
});

test('estimateLookupBytes - empty rows returns zero', (t) => {
  t.equal(estimateLookupBytes([]), 0);
  t.end();
});

// --- executeLookup ---

test('executeLookup - basic lookup with dedupe', async (t) => {
  const fetchFn = async (_pid, _table, keys) => {
    return keys.map((k) => ({id: k.value, found: true}));
  };
  const resolver = () => 'p1';

  const result = await executeLookup({
    table: 'users',
    keys: [
      {column: 'id', value: 1},
      {column: 'id', value: 1},
      {column: 'id', value: 2},
    ],
    accessPath: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
    partitionResolver: resolver,
    fetchFn,
  });

  t.equal(result[LRF.KEY_COUNT], 3);
  t.equal(result[LRF.DEDUPED_KEY_COUNT], 2);
  t.equal(result[LRF.ROWS].length, 2);
  t.equal(result[LRF.PARTITION_COUNT], 1);
  t.equal(result[LRF.ACCESS_PATH], LOOKUP_ACCESS_PATH.PRIMARY_KEY);
  t.end();
});

test('executeLookup - multi-partition batching', async (t) => {
  const partitionCalls = [];
  const fetchFn = async (pid, _table, keys) => {
    partitionCalls.push(pid);
    return keys.map((k) => ({id: k.value, partition: pid}));
  };
  const resolver = (key) => key.value <= 2 ? 'p1' : 'p2';

  const result = await executeLookup({
    table: 'orders',
    keys: [
      {column: 'id', value: 1},
      {column: 'id', value: 3},
      {column: 'id', value: 2},
    ],
    accessPath: LOOKUP_ACCESS_PATH.UNIQUE_INDEX,
    partitionResolver: resolver,
    fetchFn,
  });

  t.equal(partitionCalls.length, 2);
  t.ok(partitionCalls.includes('p1'));
  t.ok(partitionCalls.includes('p2'));
  t.equal(result[LRF.ROWS].length, 3);
  t.equal(result[LRF.PARTITION_COUNT], 2);
  t.end();
});

test('executeLookup - rejects invalid access path', async (t) => {
  await t.rejects(
    executeLookup({
      table: 'users',
      keys: [{column: 'id', value: 1}],
      accessPath: 'full_scan',
      partitionResolver: () => 'p1',
      fetchFn: async () => [],
    }),
    {message: PRIMITIVE_ERROR_MSG.LOOKUP_ACCESS_PATH_DENIED},
  );
  t.end();
});

test('executeLookup - rejects missing table', async (t) => {
  await t.rejects(
    executeLookup({
      table: null,
      keys: [{column: 'id', value: 1}],
      accessPath: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
      partitionResolver: () => 'p1',
      fetchFn: async () => [],
    }),
    {message: PRIMITIVE_ERROR_MSG.LOOKUP_TABLE_REQUIRED},
  );
  t.end();
});

test('executeLookup - enforces byte budget', async (t) => {
  const bigRow = {data: 'x'.repeat(2000)};
  const fetchFn = async () => [bigRow];

  await t.rejects(
    executeLookup({
      table: 'users',
      keys: [{column: 'id', value: 1}],
      accessPath: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
      partitionResolver: () => 'p1',
      fetchFn,
      budgets: {LOOKUP_MAX_BYTES: 100},
    }),
    {message: PRIMITIVE_ERROR_MSG.LOOKUP_MAX_BYTES_EXCEEDED},
  );
  t.end();
});

test('executeLookup - calls telemetry callback', async (t) => {
  let telemetryData = null;
  const fetchFn = async (_pid, _table, keys) => {
    return keys.map((k) => ({id: k.value}));
  };

  await executeLookup({
    table: 'users',
    keys: [{column: 'id', value: 1}],
    accessPath: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
    partitionResolver: () => 'p1',
    fetchFn,
    onTelemetry: (data) => {
      telemetryData = data;
    },
  });

  t.ok(telemetryData);
  t.equal(telemetryData.primitive, 'lookup');
  t.equal(telemetryData.table, 'users');
  t.equal(telemetryData.keyCount, 1);
  t.equal(telemetryData.dedupedKeyCount, 1);
  t.equal(telemetryData.partitionCount, 1);
  t.ok(telemetryData.byteCount >= 0);
  t.ok(telemetryData.durationMs >= 0);
  t.end();
});


// ─── Additional coverage for Req 5.2 ────────────────────────

test('isAllowedAccessPath - undefined denied', (t) => {
  t.notOk(isAllowedAccessPath(undefined));
  t.end();
});

test('isAllowedAccessPath - null denied', (t) => {
  t.notOk(isAllowedAccessPath(null));
  t.end();
});

test('executeLookup - attaches lineage when tracker provided',
  async (t) => {
    const attached = [];
    const lineageTracker = {
      attachLineage: (obj, stage, type, seq) => {
        attached.push({obj, stage, type, seq});
      },
    };
    const fetchFn = async (_pid, _table, keys) => {
      return keys.map((k) => ({id: k.value}));
    };

    const result = await executeLookup({
      table: 'users',
      keys: [{column: 'id', value: 1}],
      accessPath: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
      partitionResolver: () => 'p1',
      fetchFn,
      lineageTracker,
      stageIndex: 2,
      sequenceNum: 5,
    });

    t.equal(attached.length, 1);
    t.equal(attached[0].stage, 2);
    t.equal(attached[0].type, 'lookup');
    t.equal(attached[0].seq, 5);
    t.equal(attached[0].obj, result);
    t.end();
  });

test('executeLookup - lineage defaults stage and seq to zero',
  async (t) => {
    const attached = [];
    const lineageTracker = {
      attachLineage: (_obj, stage, type, seq) => {
        attached.push({stage, type, seq});
      },
    };
    const fetchFn = async () => [{id: 1}];

    await executeLookup({
      table: 'users',
      keys: [{column: 'id', value: 1}],
      accessPath: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
      partitionResolver: () => 'p1',
      fetchFn,
      lineageTracker,
    });

    t.equal(attached[0].stage, 0);
    t.equal(attached[0].seq, 0);
    t.end();
  });

// ─── PBT: access path enforcement (Req 5.2) ─────────────────

test('PBT: only pk/unique/bounded access paths are allowed',
  (t) => {
    /**
     * **Validates: Requirements 5.2**
     */
    const allowed = [
      LOOKUP_ACCESS_PATH.PRIMARY_KEY,
      LOOKUP_ACCESS_PATH.UNIQUE_INDEX,
      LOOKUP_ACCESS_PATH.BOUNDED_INDEX,
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...allowed),
        (path) => {
          return isAllowedAccessPath(path) === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('all allowed access paths accepted');
    t.end();
  });

test('PBT: arbitrary strings are denied as access paths', (t) => {
  /**
   * **Validates: Requirements 5.2**
   */
  const allowed = new Set([
    LOOKUP_ACCESS_PATH.PRIMARY_KEY,
    LOOKUP_ACCESS_PATH.UNIQUE_INDEX,
    LOOKUP_ACCESS_PATH.BOUNDED_INDEX,
  ]);
  fc.assert(
    fc.property(
      fc.string({minLength: 1, maxLength: 30}).filter(
        (s) => !allowed.has(s),
      ),
      (path) => {
        return isAllowedAccessPath(path) === false;
      },
    ),
    {numRuns: 10},
  );
  t.pass('arbitrary strings denied as access paths');
  t.end();
});
