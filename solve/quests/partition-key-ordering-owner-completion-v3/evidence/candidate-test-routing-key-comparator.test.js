/**
 * Numeric key routing: an integer key against a text boundary routes by
 * number, one comparator owns routing order everywhere, and mixed key spaces
 * are refused with the typed outcome instead of coerced.
 *
 * Why a text boundary: the partitions system table declares
 * partition_key_start/end as TEXT, so a split's numeric median comes back as
 * '500' after any round trip through the table, while the routed key is the
 * JavaScript number the SQL AST carries. Before this quest both comparators
 * fell through to String(a).localeCompare(String(b)), so 1000 sorted left of
 * '500' and high integer keys were silently mis-routed.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {KeyRange} from '../../src/partition/key-range-manager.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
import {QueryGroup} from '../../src/live-query/live-query-group.js';
import {
  compareRoutingKeys,
  compareSplitKey,
  resolveSplitTargetPartitionId,
} from '../../src/partition/split-key-comparator.js';

const TABLE = 'items';
const TEXT_BOUNDARY = '500';
// better-sqlite3 binds every JavaScript number as REAL, so the TEXT column
// hands the boundary back in this shape after a parameter-bound write.
const STORED_TEXT_BOUNDARY = '500.0';
const LEFT_KEY = 250;
const RIGHT_KEY = 1000;
const NON_NUMERIC_TEXT = 'abc';
const EXPECTED_NUMBER_STRING_MISMATCH =
  PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch('number', 'string');
const EXPECTED_OBJECT_MISMATCH =
  PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch('object', 'object');
const SQLITE_BINARY_TEXT_VALUES = Object.freeze([
  'Z',
  'a',
  'A',
  'z',
  '~',
  '\uE000',
  '\u{10000}',
]);

function splitPartitions(boundary = TEXT_BOUNDARY) {
  return [
    {partition_id: 'p1', partition_key_start: null, partition_key_end: boundary},
    {partition_id: 'p2', partition_key_start: boundary, partition_key_end: null},
  ];
}

test('an integer key routes numerically against a text boundary', async () => {
  const resolver = new PartitionResolver();
  assert.equal(resolver.resolvePartitionForKey(TABLE, LEFT_KEY, splitPartitions()),
    'p1', '250 sorts left of the boundary 500');
  assert.equal(resolver.resolvePartitionForKey(TABLE, RIGHT_KEY, splitPartitions()),
    'p2', '1000 sorts right of the boundary 500, not left of "5"');
  for (const boundary of [TEXT_BOUNDARY, STORED_TEXT_BOUNDARY]) {
    assert.equal(resolver.resolvePartitionForKey(TABLE, RIGHT_KEY,
      splitPartitions(boundary)), 'p2', `1000 sorts right of '${boundary}'`);
    assert.equal(resolver.resolvePartitionForKey(TABLE, LEFT_KEY,
      splitPartitions(boundary)), 'p1', `250 sorts left of '${boundary}'`);
  }
  const right = new KeyRange(TEXT_BOUNDARY, null);
  assert.equal(right.contains(RIGHT_KEY), true, 'the right range contains 1000');
  assert.equal(right.contains(LEFT_KEY), false, 'the right range excludes 250');
});

test('one comparator owns routing order for ranges, the resolver and live queries', async () => {
  const range = new KeyRange(null, null);
  const resolver = new PartitionResolver();
  const group = new QueryGroup({});
  const pairs = [
    [RIGHT_KEY, TEXT_BOUNDARY],
    ['b', 'a'],
    [7, 9],
    [null, 'a'],
  ];
  for (const [left, right] of pairs) {
    const expected = Math.sign(compareRoutingKeys(left, right));
    assert.equal(Math.sign(range.compareKeys(left, right)), expected,
      `KeyRange agrees with the owner on ${String(left)} vs ${String(right)}`);
    assert.equal(Math.sign(resolver.compareValues(left, right)), expected,
      `PartitionResolver agrees with the owner on ${String(left)} vs ${String(right)}`);
    assert.equal(Math.sign(group.compareValues(left, right)), expected,
      `QueryGroup agrees with the owner on ${String(left)} vs ${String(right)}`);
  }
});

test('a mixed key space that is not a text-encoded number is refused, never coerced', async () => {
  assert.throws(
    () => compareRoutingKeys(RIGHT_KEY, NON_NUMERIC_TEXT),
    {message: EXPECTED_NUMBER_STRING_MISMATCH},
    'the owner refuses number vs non-numeric text',
  );
  assert.throws(
    () => new KeyRange(NON_NUMERIC_TEXT, null).contains(RIGHT_KEY),
    {message: EXPECTED_NUMBER_STRING_MISMATCH},
    'KeyRange surfaces the same typed outcome',
  );
  assert.throws(
    () => new PartitionResolver().compareValues(RIGHT_KEY, NON_NUMERIC_TEXT),
    {message: EXPECTED_NUMBER_STRING_MISMATCH},
    'PartitionResolver surfaces the same typed outcome',
  );
});

test('unsupported same-type objects fail closed before coercion', () => {
  let coercionCalls = 0;
  const hostile = {
    [Symbol.toPrimitive]() {
      coercionCalls += 1;
      throw new Error('hostile coercion executed');
    },
  };

  assert.throws(
    () => compareRoutingKeys(hostile, {}),
    {message: EXPECTED_OBJECT_MISMATCH},
  );
  assert.equal(coercionCalls, 0, 'unsupported values are rejected before coercion');
  assert.throws(
    () => compareRoutingKeys(Object('a'), Object('b')),
    {message: EXPECTED_OBJECT_MISMATCH},
    'boxed strings are not admitted as primitive partition keys',
  );
});

test('routing comparator captures Number.isFinite', () => {
  const original = Number.isFinite;
  try {
    Number.isFinite = () => false;
    assert.ok(
      compareRoutingKeys(1000, 500) > 0,
      'numeric order ignores later Number.isFinite mutation',
    );
  } finally {
    Number.isFinite = original;
  }
});

test('routing comparator captures numeric conversion', () => {
  const OriginalNumber = globalThis.Number;
  function CorruptedNumber() {
    return OriginalNumber.NaN;
  }
  CorruptedNumber.isFinite = OriginalNumber.isFinite;
  try {
    globalThis.Number = CorruptedNumber;
    assert.ok(
      compareRoutingKeys(RIGHT_KEY, STORED_TEXT_BOUNDARY) > 0,
      'numeric/TEXT order ignores later Number replacement',
    );
  } finally {
    globalThis.Number = OriginalNumber;
  }
});

test('routing comparator captures RegExp.test', () => {
  const original =
    Object.getOwnPropertyDescriptor(RegExp.prototype, 'test');
  try {
    Reflect.defineProperty(RegExp.prototype, 'test', {
      configurable: true,
      writable: true,
      value: () => false,
    });
    assert.ok(
      compareRoutingKeys(RIGHT_KEY, STORED_TEXT_BOUNDARY) > 0,
      'numeric/TEXT detection ignores later RegExp.test mutation',
    );
  } finally {
    Reflect.defineProperty(RegExp.prototype, 'test', original);
  }
});

test('routing comparator captures Error constructor', () => {
  const OriginalError = globalThis.Error;
  try {
    globalThis.Error = class CorruptedError extends OriginalError {
      constructor() {
        super('corrupted mutable Error');
      }
    };
    assert.throws(
      () => compareRoutingKeys(RIGHT_KEY, NON_NUMERIC_TEXT),
      {message: EXPECTED_NUMBER_STRING_MISMATCH},
      'typed mismatch ignores later Error mutation',
    );
  } finally {
    globalThis.Error = OriginalError;
  }
});

test('routing comparator captures Buffer.compare', () => {
  const original = Buffer.compare;
  const left = Buffer.from('a');
  const right = Buffer.from('b');
  try {
    Buffer.compare = () => 0;
    assert.ok(
      compareRoutingKeys(left, right) < 0,
      'buffer order ignores later Buffer.compare mutation',
    );
  } finally {
    Buffer.compare = original;
  }
});

test('routing comparator captures Buffer.isBuffer', () => {
  const original = Buffer.isBuffer;
  const left = Buffer.from([0x80]);
  const right = Buffer.from([0x81]);
  try {
    Buffer.isBuffer = () => false;
    assert.ok(
      compareRoutingKeys(left, right) < 0,
      'buffer typing ignores later Buffer.isBuffer mutation',
    );
  } finally {
    Buffer.isBuffer = original;
  }
});

test('routing comparator captures Buffer.from for binary text order', () => {
  const original = Buffer.from;
  try {
    Buffer.from = () => {
      throw new Error('mutated Buffer.from executed');
    };
    assert.ok(
      compareRoutingKeys('\uE000', '\u{10000}') < 0,
      'binary text order ignores later Buffer.from mutation',
    );
  } finally {
    Buffer.from = original;
  }
});

test('split target routing captures Array.isArray', () => {
  const original = Array.isArray;
  try {
    Array.isArray = () => false;
    assert.equal(
      resolveSplitTargetPartitionId(
        20,
        {splitKey: 10, targetPartitionIds: ['left', 'right']},
      ),
      'right',
      'target selection ignores later Array.isArray mutation',
    );
  } finally {
    Array.isArray = original;
  }
});

test('split target metadata ignores inherited accessors and array iterators', () => {
  let accessorCalls = 0;
  let iteratorCalls = 0;
  const targetPartitionIds = ['left', 'right'];
  targetPartitionIds[Symbol.iterator] = () => {
    iteratorCalls += 1;
    throw new Error('iterator should not run');
  };

  const metadata = {};
  Object.defineProperty(metadata, 'splitKey', {
    configurable: true,
    enumerable: true,
    value: 10,
  });
  Object.defineProperty(metadata, 'targetPartitionIds', {
    configurable: true,
    enumerable: true,
    value: targetPartitionIds,
  });
  assert.equal(resolveSplitTargetPartitionId(20, metadata), 'right');
  assert.equal(iteratorCalls, 0, 'routing reads target IDs by index, not iterator');

  const accessorMetadata = {};
  Object.defineProperty(accessorMetadata, 'splitKey', {
    configurable: true,
    get() {
      accessorCalls += 1;
      return 10;
    },
  });
  Object.defineProperty(accessorMetadata, 'targetPartitionIds', {
    configurable: true,
    get() {
      accessorCalls += 1;
      return ['left', 'right'];
    },
  });
  assert.throws(
    () => resolveSplitTargetPartitionId(20, accessorMetadata),
    /type mismatch/iu,
    'accessor split metadata is not semantic routing input',
  );
  assert.equal(accessorCalls, 0, 'metadata accessors are never invoked');

  const inheritedMetadata = Object.create({
    splitKey: 10,
    targetPartitionIds: ['left', 'right'],
  });
  assert.throws(
    () => resolveSplitTargetPartitionId(20, inheritedMetadata),
    /type mismatch/iu,
    'inherited split metadata is ignored',
  );
});

test('split target routing captures descriptor intrinsics', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor;
  const originalHasOwn = Object.hasOwn;
  try {
    Object.getOwnPropertyDescriptor = () => {
      throw new Error('mutated getOwnPropertyDescriptor');
    };
    Object.hasOwn = () => false;
    assert.equal(
      resolveSplitTargetPartitionId(
        20,
        {splitKey: 10, targetPartitionIds: ['left', 'right']},
      ),
      'right',
      'metadata snapshot ignores later Object intrinsic mutation',
    );
  } finally {
    Object.getOwnPropertyDescriptor = originalDescriptor;
    Object.hasOwn = originalHasOwn;
  }
});


test('text routing order matches SQLite BINARY, including supplementary Unicode', () => {
  const database = new Database(':memory:');
  try {
    database.exec('CREATE TABLE routing_keys (value TEXT NOT NULL)');
    const insert = database.prepare(
      'INSERT INTO routing_keys (value) VALUES (?)',
    );
    const insertAll = database.transaction((values) => {
      for (const value of values) {
        insert.run(value);
      }
    });
    insertAll(SQLITE_BINARY_TEXT_VALUES);

    const sqliteOrder = database.prepare(
      'SELECT value FROM routing_keys ORDER BY value COLLATE BINARY',
    ).all().map((row) => row.value);
    const routingOrder = [...SQLITE_BINARY_TEXT_VALUES].sort(compareRoutingKeys);

    assert.deepEqual(
      routingOrder,
      sqliteOrder,
      'the routing owner must reproduce SQLite BINARY text order',
    );
    for (let index = 0; index < sqliteOrder.length - 1; index += 1) {
      assert.ok(
        compareSplitKey(sqliteOrder[index], sqliteOrder[index + 1]) < 0,
        'strict split comparison must preserve the same text order',
      );
    }
  } finally {
    database.close();
  }
});
