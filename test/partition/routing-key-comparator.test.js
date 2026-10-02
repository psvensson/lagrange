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
const EXPECTED_NUMBER_NUMBER_MISMATCH =
  PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch('number', 'number');
const EXPECTED_SYMBOL_MISMATCH =
  PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch('symbol', 'symbol');
const EXPECTED_BOOLEAN_MISMATCH =
  PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch('boolean', 'boolean');
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

test('finite numeric comparisons return canonical finite comparator values', () => {
  const cases = [
    [Number.MAX_VALUE, -Number.MAX_VALUE, 1],
    [-Number.MAX_VALUE, Number.MAX_VALUE, -1],
    [1000, 500, 1],
    [500, 1000, -1],
    [-0, 0, 0],
  ];
  for (const [left, right, expected] of cases) {
    const routingResult = compareRoutingKeys(left, right);
    const splitResult = compareSplitKey(left, right);
    assert.equal(routingResult, expected);
    assert.equal(splitResult, expected);
    assert.equal(Number.isFinite(routingResult), true);
    assert.equal(Number.isFinite(splitResult), true);
  }
  assert.equal(
    compareRoutingKeys(Number.MAX_VALUE, '-1.7976931348623157e+308'),
    1,
  );
  assert.equal(
    compareRoutingKeys('-1.7976931348623157e+308', Number.MAX_VALUE),
    -1,
  );
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

test('unsupported identical and non-finite keys validate before equality', () => {
  let coercionCalls = 0;
  const hostile = {
    [Symbol.toPrimitive]() {
      coercionCalls += 1;
      throw new Error('hostile coercion executed');
    },
  };
  const boxed = Object('a');
  const symbol = Symbol('same');

  for (const [left, right, message] of [
    [hostile, hostile, EXPECTED_OBJECT_MISMATCH],
    [boxed, boxed, EXPECTED_OBJECT_MISMATCH],
    [symbol, symbol, EXPECTED_SYMBOL_MISMATCH],
    [true, true, EXPECTED_BOOLEAN_MISMATCH],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY,
      EXPECTED_NUMBER_NUMBER_MISMATCH],
    [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY,
      EXPECTED_NUMBER_NUMBER_MISMATCH],
    [Number.NaN, Number.NaN, EXPECTED_NUMBER_NUMBER_MISMATCH],
  ]) {
    assert.throws(
      () => compareRoutingKeys(left, right),
      {message},
      'unsupported/non-finite equality must fail closed after type validation',
    );
  }

  assert.equal(coercionCalls, 0, 'unsupported values are rejected before coercion');
  assert.equal(compareRoutingKeys('same', 'same'), 0);
  assert.equal(compareRoutingKeys(7, 7), 0);
  assert.equal(compareRoutingKeys(-0, 0), 0);
  assert.equal(compareRoutingKeys(null, null), 0);
});

test('invalid keys cannot bypass validation through absent-bound ordering', () => {
  const invalidValues = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Object('boxed'),
    Object(7),
    true,
    Symbol('invalid'),
    {kind: 'invalid'},
  ];
  for (const invalid of invalidValues) {
    for (const absent of [null, undefined]) {
      assert.throws(
        () => compareRoutingKeys(invalid, absent),
        /type mismatch/iu,
        'invalid left operand is refused before right absent ordering',
      );
      assert.throws(
        () => compareRoutingKeys(absent, invalid),
        /type mismatch/iu,
        'invalid right operand is refused before left absent ordering',
      );
    }
  }

  for (const supported of [7, 'a', Buffer.from('a')]) {
    for (const absent of [null, undefined]) {
      assert.equal(compareRoutingKeys(absent, supported), -1);
      assert.equal(compareRoutingKeys(supported, absent), 1);
    }
  }
  assert.equal(compareRoutingKeys(null, undefined), 0);
  assert.equal(compareRoutingKeys(undefined, null), 0);
});

test('routing comparator captures Number.isFinite', () => {
  const original = Number.isFinite;
  try {
    Number.isFinite = () => false;
    assert.ok(compareRoutingKeys(1000, 500) > 0);
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
    assert.ok(compareRoutingKeys(RIGHT_KEY, STORED_TEXT_BOUNDARY) > 0);
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
    assert.ok(compareRoutingKeys(RIGHT_KEY, STORED_TEXT_BOUNDARY) > 0);
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
    assert.ok(compareRoutingKeys(left, right) < 0);
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
    assert.ok(compareRoutingKeys(left, right) < 0);
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
    assert.ok(compareRoutingKeys('\uE000', '\u{10000}') < 0);
  } finally {
    Buffer.from = original;
  }
});

test('split target routing captures Array.isArray and ignores iterator', () => {
  const originalIsArray = Array.isArray;
  const originalIterator =
    Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);
  try {
    Array.isArray = () => false;
    Reflect.defineProperty(Array.prototype, Symbol.iterator, {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error('mutated Array iterator executed');
      },
    });
    assert.equal(
      resolveSplitTargetPartitionId(
        20,
        {splitKey: 10, targetPartitionIds: ['left', 'right']},
      ),
      'right',
    );
  } finally {
    Array.isArray = originalIsArray;
    Reflect.defineProperty(
      Array.prototype,
      Symbol.iterator,
      originalIterator,
    );
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
  assert.equal(iteratorCalls, 0);

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
  );
  assert.equal(accessorCalls, 0);

  const inheritedMetadata = Object.create({
    splitKey: 10,
    targetPartitionIds: ['left', 'right'],
  });
  assert.throws(
    () => resolveSplitTargetPartitionId(20, inheritedMetadata),
    /type mismatch/iu,
  );
});

test('split target routing captures Object.getOwnPropertyDescriptor', () => {
  const original = Object.getOwnPropertyDescriptor;
  try {
    Object.getOwnPropertyDescriptor = () => {
      throw new Error('mutated getOwnPropertyDescriptor');
    };
    assert.equal(
      resolveSplitTargetPartitionId(
        20,
        {splitKey: 10, targetPartitionIds: ['left', 'right']},
      ),
      'right',
    );
  } finally {
    Object.getOwnPropertyDescriptor = original;
  }
});

test('split target routing captures Object.hasOwn', () => {
  const original = Object.hasOwn;
  try {
    Object.hasOwn = () => false;
    assert.equal(
      resolveSplitTargetPartitionId(
        20,
        {splitKey: 10, targetPartitionIds: ['left', 'right']},
      ),
      'right',
    );
  } finally {
    Object.hasOwn = original;
  }
});

test('split metadata ignores enumerable Object and Array prototype pollution', () => {
  const objectSplitKey =
    Object.getOwnPropertyDescriptor(Object.prototype, 'splitKey');
  const objectTargetIds =
    Object.getOwnPropertyDescriptor(Object.prototype, 'targetPartitionIds');
  const arrayZero =
    Object.getOwnPropertyDescriptor(Array.prototype, '0');
  const arrayOne =
    Object.getOwnPropertyDescriptor(Array.prototype, '1');
  try {
    Reflect.defineProperty(Object.prototype, 'splitKey', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: 10,
    });
    Reflect.defineProperty(Object.prototype, 'targetPartitionIds', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: ['polluted-left', 'polluted-right'],
    });
    assert.throws(
      () => resolveSplitTargetPartitionId(20, {}),
      /type mismatch/iu,
      'Object.prototype routing metadata is ignored',
    );

    Reflect.defineProperty(Array.prototype, '0', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: 'polluted-left',
    });
    Reflect.defineProperty(Array.prototype, '1', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: 'polluted-right',
    });
    const sparseIds = new Array(2);
    assert.equal(
      resolveSplitTargetPartitionId(
        20,
        {splitKey: 10, targetPartitionIds: sparseIds},
      ),
      undefined,
      'Array.prototype target IDs are ignored',
    );
  } finally {
    for (const [prototype, key, descriptor] of [
      [Object.prototype, 'splitKey', objectSplitKey],
      [Object.prototype, 'targetPartitionIds', objectTargetIds],
      [Array.prototype, '0', arrayZero],
      [Array.prototype, '1', arrayOne],
    ]) {
      if (descriptor) {
        Reflect.defineProperty(prototype, key, descriptor);
      } else {
        Reflect.deleteProperty(prototype, key);
      }
    }
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
