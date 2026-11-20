// Layer B of the coordinator-sqlite-merge oracle: the one typed wire encoding
// of SQL values (src/query/sql-value-codec.js). Property cases draw from the
// project-local seeded PRNG (src/random/random-source.js); there is no
// Math.random, and a failure names its seed.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {SeededRandomSource} from '../../src/random/random-source.js';
import {
  SQL_STORAGE_CLASS,
  SQL_VALUE_CODEC_ERROR_CODE,
  SQL_VALUE_CODEC_REFUSAL,
} from '../../src/query/sql-value-codec-constants.js';
import {
  SqlValueCodecError,
  decodeTypedParams,
  decodeTypedRowSet,
  encodeTypedParams,
  encodeTypedRowSet,
  typedRowSetByteLength,
} from '../../src/query/sql-value-codec.js';

const PROPERTY_SEEDS = Object.freeze([0x5eed0001, 0x5eed0002, 0x5eed0003, 0x5eed0004]);
const ROW_SETS_PER_SEED = 40;
const MAX_COLUMNS = 6;
const MAX_ROWS = 24;
const FUZZ_CELLS_PER_SEED = 1500;
const SQLITE_ROWS_PER_SEED = 60;
const UINT32_RANGE = 2 ** 32;
const MAX_CODE_POINT = 0x10ffff;
const SURROGATE_FIRST = 0xd800;
const SURROGATE_LAST = 0xdfff;
const MAX_TEXT_CODE_POINTS = 10;
const MAX_BLOB_BYTES = 9;
const MAX_FUZZ_TEXT_LENGTH = 10;
const UTF8 = 'utf8';

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;
const SAFE_LIMIT = 2n ** 53n;

const CLASS = SQL_STORAGE_CLASS;
const CODE = SQL_VALUE_CODEC_ERROR_CODE;
const REFUSAL = SQL_VALUE_CODEC_REFUSAL;
const STORAGE_CLASSES = Object.freeze([CLASS.NULL, CLASS.INTEGER, CLASS.REAL, CLASS.TEXT,
  CLASS.BLOB]);
const SQLITE_TYPEOF = Object.freeze({
  [CLASS.NULL]: 'null',
  [CLASS.INTEGER]: 'integer',
  [CLASS.REAL]: 'real',
  [CLASS.TEXT]: 'text',
  [CLASS.BLOB]: 'blob',
});

const EDGE_VALUES = Object.freeze({
  [CLASS.NULL]: [null],
  [CLASS.INTEGER]: [
    INT64_MIN, INT64_MAX, INT64_MIN + 1n, INT64_MAX - 1n, 0n, 1n, -1n,
    SAFE_LIMIT - 1n, SAFE_LIMIT, SAFE_LIMIT + 1n, -(SAFE_LIMIT - 1n), -(SAFE_LIMIT + 1n),
    2n ** 31n, -(2n ** 31n) - 1n, 10n ** 18n, -(10n ** 18n),
  ],
  [CLASS.REAL]: [
    -0, 0, Infinity, -Infinity, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE,
    -Number.MIN_VALUE, Number.EPSILON, 2 ** 53 - 1, 2 ** 53, 2 ** 53 + 2, -(2 ** 53 - 1),
    2, -2.5, 0.1, 1 / 3, 1e21, 1e-7, 123e-20, 0.9365, 1e308,
  ],
  [CLASS.TEXT]: [
    '', ' ', 'a', '\u00e9 \u00df \u{1f600} \uff71', '"\\/', '\u0000', '\u0001\u001f', '\b\t\n\f\r', '\u007f',
    '\u0080\u07ff\u0800', '\u2028\u2029', '\ufeff\ufffd\uffff', '\u{10000}\u{10ffff}',
    '12', '1.0', 'null', 'NaN',
  ],
  [CLASS.BLOB]: [
    Buffer.alloc(0), Buffer.from([0]), Buffer.from([255]), Buffer.from([0, 255]),
    Buffer.from([0, 255, 1]), Buffer.from([0xfb, 0xff, 0xbf]),
    Buffer.from(Array.from({length: 256}, (_, index) => index)),
    new Uint8Array([1, 2, 3, 4]),
  ],
});

// ---- seeded generators ---------------------------------------------------

function createGenerator(seed) {
  const source = new SeededRandomSource({seed});
  const uint32 = () => Math.floor(source.random() * UINT32_RANGE);
  const below = (bound) => Math.floor(source.random() * bound);
  const pick = (items) => items[below(items.length)];
  const int64 = () => BigInt.asIntN(64, (BigInt(uint32()) << 32n) | BigInt(uint32()));
  const real = () => {
    const view = new DataView(new ArrayBuffer(8));
    for (;;) {
      view.setUint32(0, uint32());
      view.setUint32(4, uint32());
      const value = view.getFloat64(0);
      if (!Number.isNaN(value)) return value;
    }
  };
  const codePoint = () => {
    for (;;) {
      const candidate = below(MAX_CODE_POINT + 1);
      if (candidate < SURROGATE_FIRST || candidate > SURROGATE_LAST) return candidate;
    }
  };
  const text = () => {
    let result = '';
    const length = below(MAX_TEXT_CODE_POINTS + 1);
    for (let index = 0; index < length; index += 1) {
      result += below(2) === 0 ?
        pick(EDGE_VALUES[CLASS.TEXT]) : String.fromCodePoint(codePoint());
    }
    return result;
  };
  const blob = () => Buffer.from(Array.from({length: below(MAX_BLOB_BYTES + 1)},
    () => below(256)));
  const valueOf = (storageClass) => {
    if (below(3) === 0) return pick(EDGE_VALUES[storageClass]);
    switch (storageClass) {
    case CLASS.INTEGER: return int64();
    case CLASS.REAL: return real();
    case CLASS.TEXT: return text();
    case CLASS.BLOB: return blob();
    default: return null;
    }
  };
  const value = () => valueOf(pick(STORAGE_CLASSES));
  const rowSet = () => {
    const width = 1 + below(MAX_COLUMNS);
    const columns = Array.from({length: width}, () => (below(4) === 0 ? 'c' : text()));
    const rows = Array.from({length: below(MAX_ROWS + 1)},
      () => Array.from({length: width}, value));
    return {columns, rows};
  };
  return {below, pick, value, rowSet, text};
}

// ---- assertions ----------------------------------------------------------

function storageClassOfValue(value) {
  if (value === null) return CLASS.NULL;
  if (typeof value === 'bigint') return CLASS.INTEGER;
  if (typeof value === 'number') return CLASS.REAL;
  if (typeof value === 'string') return CLASS.TEXT;
  return CLASS.BLOB;
}

function assertSameTypedValue(actual, expected, label) {
  const expectedClass = storageClassOfValue(expected);
  if (expectedClass === CLASS.BLOB) {
    assert.ok(Buffer.isBuffer(actual), `${label}: BLOB decodes to a Buffer`);
    assert.ok(Buffer.from(expected).equals(actual), `${label}: BLOB bytes`);
    return;
  }
  assert.equal(storageClassOfValue(actual), expectedClass, `${label}: storage class`);
  assert.ok(Object.is(actual, expected),
    `${label}: ${String(actual)} is not ${String(expected)}`);
}

function assertSameRows(actualRows, expectedRows, label) {
  assert.equal(actualRows.length, expectedRows.length, `${label}: row count`);
  for (let row = 0; row < expectedRows.length; row += 1) {
    assert.equal(actualRows[row].length, expectedRows[row].length, `${label}: width`);
    for (let column = 0; column < expectedRows[row].length; column += 1) {
      assertSameTypedValue(actualRows[row][column], expectedRows[row][column],
        `${label} row ${row} column ${column}`);
    }
  }
}

function assertRefused(action, code, reason, position = {}) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof SqlValueCodecError, `not a codec refusal: ${error}`);
    assert.equal(error.code, code);
    assert.equal(error.reason, reason);
    for (const field of Object.keys(position)) {
      assert.equal(error[field], position[field], `refusal ${field}`);
    }
    return true;
  });
}

function paramsWire(classes, cells) {
  return {v: 1, classes, cells};
}

// A cell is canonical exactly when it decodes and re-encodes to itself; every
// other cell is a typed INVALID refusal. Returns whether it was admitted.
function assertCanonicalOrRefused(storageClass, cell, label) {
  const wire = paramsWire(storageClass, [cell]);
  let decoded;
  try {
    decoded = decodeTypedParams(wire);
  } catch (error) {
    assert.ok(error instanceof SqlValueCodecError, `${label}: ${error}`);
    assert.equal(error.code, CODE.INVALID, label);
    return false;
  }
  assert.equal(JSON.stringify(encodeTypedParams(decoded)), JSON.stringify(wire),
    `${label}: admitted cell ${JSON.stringify(cell)} is not canonical`);
  return true;
}

function wireRoundTrip(record) {
  return JSON.parse(JSON.stringify(record));
}

// ---- tests ---------------------------------------------------------------

describe('sql-value-codec canonical cells', () => {
  it('pins the one cell form of each storage class', () => {
    const params = encodeTypedParams([
      null, 0n, INT64_MIN, INT64_MAX, -0, 2, 0.1, Infinity, -Infinity, 1e21, 5e-324,
      '', 'x"\n', Buffer.alloc(0), Buffer.from('A'), new Uint8Array([0xfb, 0xff]),
    ]);
    assert.equal(JSON.stringify(params), JSON.stringify({
      v: 1,
      classes: 'niiirrrrrrrttbbb',
      cells: [null, '0', '-9223372036854775808', '9223372036854775807', '-0', '2',
        '0.1', 'Infinity', '-Infinity', '1e+21', '5e-324', '', 'x"\n', '', 'QQ==',
        '+/8='],
    }));
    const rowSet = encodeTypedRowSet(['id', 'id'], [[1n, 2.5], [null, 'a']]);
    assert.deepEqual(rowSet, {v: 1, columns: ['id', 'id'], rows: [['ir', '1', '2.5'],
      ['nt', null, 'a']]});
  });

  it('round-trips every storage class and its edge values, locally and as JSON', () => {
    for (const storageClass of STORAGE_CLASSES) {
      const values = EDGE_VALUES[storageClass];
      const encoded = encodeTypedParams(values);
      assert.equal(encoded.classes, storageClass.repeat(values.length));
      const remote = decodeTypedParams(wireRoundTrip(encoded));
      const local = decodeTypedParams(encoded);
      for (let index = 0; index < values.length; index += 1) {
        assertSameTypedValue(remote[index], values[index], `${storageClass}[${index}]`);
        assertSameTypedValue(local[index], values[index], `${storageClass}[${index}] local`);
      }
      const rowSet = encodeTypedRowSet(['value'], values.map((value) => [value]));
      assertSameRows(decodeTypedRowSet(wireRoundTrip(rowSet)).rows,
        values.map((value) => [value]), `row set ${storageClass}`);
    }
  });

  it('decodes INTEGER only to BigInt and REAL only to number, even when integral', () => {
    const [integer, real] = decodeTypedParams(paramsWire('ir', ['2', '2']));
    assert.equal(typeof integer, 'bigint');
    assert.equal(typeof real, 'number');
    assert.equal(integer, 2n);
    assert.equal(real, 2);
  });
});

describe('sql-value-codec properties (seeded)', () => {
  it('encode then decode is the identity on values for random row sets', () => {
    for (const seed of PROPERTY_SEEDS) {
      const generator = createGenerator(seed);
      for (let index = 0; index < ROW_SETS_PER_SEED; index += 1) {
        const {columns, rows} = generator.rowSet();
        const decoded = decodeTypedRowSet(wireRoundTrip(encodeTypedRowSet(columns, rows)));
        assert.deepEqual(decoded.columns, columns, `seed ${seed} set ${index}: columns`);
        assertSameRows(decoded.rows, rows, `seed ${seed} set ${index}`);
      }
    }
  });

  it('encode, decode, encode is the identity on frame bytes', () => {
    for (const seed of PROPERTY_SEEDS) {
      const generator = createGenerator(seed);
      for (let index = 0; index < ROW_SETS_PER_SEED; index += 1) {
        const {columns, rows} = generator.rowSet();
        const frame = JSON.stringify(encodeTypedRowSet(columns, rows));
        const remote = decodeTypedRowSet(JSON.parse(frame));
        assert.equal(JSON.stringify(encodeTypedRowSet(remote.columns, remote.rows)), frame,
          `seed ${seed} set ${index}`);
        const params = rows.length === 0 ? [] : rows[0];
        const paramsFrame = JSON.stringify(encodeTypedParams(params));
        assert.equal(JSON.stringify(encodeTypedParams(
          decodeTypedParams(JSON.parse(paramsFrame)))), paramsFrame,
        `seed ${seed} params ${index}`);
      }
    }
  });

  it('local by-reference decoding and JSON decoding give one semantics', () => {
    for (const seed of PROPERTY_SEEDS) {
      const generator = createGenerator(seed);
      for (let index = 0; index < ROW_SETS_PER_SEED; index += 1) {
        const {columns, rows} = generator.rowSet();
        const encoded = encodeTypedRowSet(columns, rows);
        const local = decodeTypedRowSet(encoded);
        const remote = decodeTypedRowSet(wireRoundTrip(encoded));
        assert.deepEqual(local.columns, remote.columns);
        assertSameRows(local.rows, remote.rows, `seed ${seed} set ${index}`);
      }
    }
  });

  it('counts the exact UTF-8 bytes of the JSON frame from the encoded cells', () => {
    const cases = [
      {columns: [], rows: []},
      {columns: ['a'], rows: []},
      {columns: ['', 'a"b', 'line\nfeed', '\u0000\u001f\u007f', '\u00e9\u{1f600}\u2028'], rows: []},
      {columns: ['x'], rows: [[EDGE_VALUES[CLASS.TEXT].join('')]]},
      {columns: ['x'], rows: [[String.fromCharCode(...Array.from({length: 32}, (_, i) => i))]]},
    ];
    for (const seed of PROPERTY_SEEDS) {
      const generator = createGenerator(seed);
      for (let index = 0; index < ROW_SETS_PER_SEED; index += 1) cases.push(generator.rowSet());
    }
    for (const [index, {columns, rows}] of cases.entries()) {
      const encoded = encodeTypedRowSet(columns, rows);
      const frameBytes = Buffer.byteLength(JSON.stringify(encoded), UTF8);
      assert.equal(typedRowSetByteLength(encoded), frameBytes, `case ${index}`);
      assert.equal(typedRowSetByteLength(wireRoundTrip(encoded)), frameBytes,
        `case ${index} after JSON`);
    }
  });

  it('admits a fuzzed cell only when it is the canonical form of its value', () => {
    const alphabet = Array.from('0123456789-+.eE xInfityNaAQ=/_ \t\u0000"\u00e9\u00a0\u0661\uff19');
    const nonStrings = [0, 1, -0, 1.5, true, false, null, [], ['1'], {}];
    let admitted = 0;
    let refused = 0;
    for (const seed of PROPERTY_SEEDS) {
      const generator = createGenerator(seed);
      for (let index = 0; index < FUZZ_CELLS_PER_SEED; index += 1) {
        const storageClass = generator.pick(STORAGE_CLASSES);
        let cell;
        if (generator.below(8) === 0) {
          cell = generator.pick(nonStrings);
        } else {
          cell = '';
          const length = generator.below(MAX_FUZZ_TEXT_LENGTH + 1);
          for (let position = 0; position < length; position += 1) {
            cell += generator.pick(alphabet);
          }
        }
        const accepted = assertCanonicalOrRefused(storageClass, cell,
          `seed ${seed} cell ${index} class ${storageClass}`);
        if (accepted) admitted += 1;
        else refused += 1;
      }
    }
    // Both branches of the property must be exercised for it to mean anything.
    assert.ok(admitted > 100, `admitted ${admitted}`);
    assert.ok(refused > 100, `refused ${refused}`);
  });
});

describe('sql-value-codec refuses every non-canonical form', () => {
  const nonCanonical = {
    // undefined only reaches the decoder by reference (local delivery).
    [CLASS.NULL]: ['', 'null', '0', 0, false, undefined],
    [CLASS.INTEGER]: [
      '+1', '01', '00', '-0', '-01', ' 1', '1 ', '1.0', '1e3', '0x10', '', '-', '--1', '1-',
      '1_000', '\u0661', '\uff19', '9007199254740993.0', 1, 1n, null, ['1'],
    ],
    [CLASS.REAL]: [
      '2.0', '+1', '1e21', '1E+21', '.5', '5.', '0.10', ' 1', '1 ', '0x10', '', 'NaN', 'nan',
      'inf', '+Infinity', 'infinity', 'Inf', '-0.0', '0.0', '00', '1e-07', '1_0',
      '9007199254740993', '0.30000000000000001', 1.5, null, ['1'],
    ],
    [CLASS.TEXT]: [1, null, true, ['a'], {}],
    [CLASS.BLOB]: [
      'QR==', 'QQ', 'QQ=', 'Q Q==', 'QQ==\n', ' QQ==', '-_8=', 'AP8', 'AP8=AP8=', '====', 'A',
      'QUJD\n', 'qq==', 0, null, [65],
    ],
  };

  for (const storageClass of STORAGE_CLASSES) {
    it(`refuses non-canonical ${SQLITE_TYPEOF[storageClass]} cells`, () => {
      for (const cell of nonCanonical[storageClass]) {
        assertRefused(() => decodeTypedParams(paramsWire(storageClass, [cell])),
          CODE.INVALID, REFUSAL.CELL_NOT_CANONICAL, {row: null, column: 0});
        assertRefused(() => decodeTypedRowSet({v: 1, columns: ['c'],
          rows: [[storageClass, cell]]}), CODE.INVALID, REFUSAL.CELL_NOT_CANONICAL,
        {row: 0, column: 0});
      }
    });
  }

  it('refuses TEXT with an unpaired surrogate', () => {
    for (const cell of ['\ud800', 'a\udc00b', '\udbff', '\u{1f600}'.slice(0, 1)]) {
      assertRefused(() => decodeTypedParams(paramsWire(CLASS.TEXT, [cell])),
        CODE.INVALID, REFUSAL.TEXT_NOT_WELL_FORMED, {column: 0});
    }
  });

  it('refuses an INTEGER outside int64 as out of range, not as a guess', () => {
    for (const cell of ['9223372036854775808', '-9223372036854775809', '9999999999999999999',
      '10000000000000000000', '123456789012345678901234567890']) {
      assertRefused(() => decodeTypedParams(paramsWire(CLASS.INTEGER, [cell])),
        CODE.INVALID, REFUSAL.INTEGER_OUT_OF_RANGE, {column: 0});
    }
  });

  it('refuses an unknown storage-class tag', () => {
    for (const tag of ['x', 'N', 'I', 'R', 'T', 'B', '?', '\u0000', '\u{1f600}'.slice(0, 1)]) {
      assertRefused(() => decodeTypedParams(paramsWire(tag, [null])), CODE.INVALID,
        REFUSAL.STORAGE_CLASS_UNKNOWN, {column: 0});
    }
  });

  it('refuses frames of the wrong version or shape', () => {
    const shapeless = [null, undefined, 1, 'x', [], [1, [], []], true];
    for (const wire of shapeless) {
      assertRefused(() => decodeTypedRowSet(wire), CODE.INVALID, REFUSAL.SHAPE_INVALID);
      assertRefused(() => decodeTypedParams(wire), CODE.INVALID, REFUSAL.SHAPE_INVALID);
    }
    for (const v of [undefined, 0, 2, '1', true, null]) {
      const rowSet = {columns: [], rows: []};
      const params = {classes: '', cells: []};
      if (v !== undefined) {
        rowSet.v = v;
        params.v = v;
      }
      assertRefused(() => decodeTypedRowSet(rowSet), CODE.INVALID,
        REFUSAL.VERSION_UNSUPPORTED);
      assertRefused(() => decodeTypedParams(params), CODE.INVALID,
        REFUSAL.VERSION_UNSUPPORTED);
    }
    const badRowSets = [
      {v: 1, columns: []},
      {v: 1, rows: []},
      {v: 1, columns: [], rows: [], extra: 0},
      JSON.parse('{"v":1,"columns":[],"rows":[],"__proto__":{}}'),
      {v: 1, columns: 'c', rows: []},
      {v: 1, columns: [], rows: {}},
    ];
    for (const wire of badRowSets) {
      assertRefused(() => decodeTypedRowSet(wire), CODE.INVALID, REFUSAL.SHAPE_INVALID);
    }
    for (const wire of [{v: 1, classes: ''}, {v: 1, classes: 1, cells: []},
      {v: 1, classes: '', cells: {}}, {v: 1, classes: '', cells: [], rows: []}]) {
      assertRefused(() => decodeTypedParams(wire), CODE.INVALID, REFUSAL.SHAPE_INVALID);
    }
  });

  it('refuses column names that are not well-formed strings, naming the column', () => {
    assertRefused(() => decodeTypedRowSet({v: 1, columns: ['a', 1], rows: []}),
      CODE.INVALID, REFUSAL.SHAPE_INVALID, {row: null, column: 1});
    assertRefused(() => decodeTypedRowSet({v: 1, columns: ['a', 'b', '\udfff'], rows: []}),
      CODE.INVALID, REFUSAL.TEXT_NOT_WELL_FORMED, {row: null, column: 2});
  });

  it('refuses a wrong arity and names the row', () => {
    const columns = ['a', 'b'];
    const arityCases = [
      ['ii', '1'],
      ['ii', '1', '2', '3'],
      ['i', '1', '2'],
      ['iii', '1', '2'],
      [''],
    ];
    for (const badRow of arityCases) {
      assertRefused(() => decodeTypedRowSet({v: 1, columns, rows: [['nn', null, null], badRow]}),
        CODE.INVALID, REFUSAL.ARITY_MISMATCH, {row: 1, column: null});
    }
    for (const badRow of [[], {}, 'ii', [1, '1', '2'], [null, null, null]]) {
      assertRefused(() => decodeTypedRowSet({v: 1, columns, rows: [badRow]}),
        CODE.INVALID, REFUSAL.SHAPE_INVALID, {row: 0});
    }
    assertRefused(() => decodeTypedParams(paramsWire('ii', ['1'])), CODE.INVALID,
      REFUSAL.ARITY_MISMATCH);
    assertRefused(() => decodeTypedParams(paramsWire('i', ['1', '2'])), CODE.INVALID,
      REFUSAL.ARITY_MISMATCH);
  });

  it('names the row and column of a refused cell deep in a row set', () => {
    const wire = wireRoundTrip(encodeTypedRowSet(['a', 'b', 'c'],
      [[1n, 'x', null], [2n, 'y', 1.5], [3n, 'z', Buffer.from('q')]]));
    // Cell 0 of a row is its class string, so column 2 is element 3.
    assert.equal(wire.rows[2][3], 'cQ==');
    wire.rows[2][3] = 'cQ';
    assertRefused(() => decodeTypedRowSet(wire), CODE.INVALID, REFUSAL.CELL_NOT_CANONICAL,
      {row: 2, column: 2});
  });
});

describe('sql-value-codec input typing (D3)', () => {
  it('types BigInt, boolean (D15: 1/0 INTEGER), number, string, Buffer, Uint8Array and null', () => {
    const encoded = encodeTypedParams([5n, true, false, 5, 5.5, '5', Buffer.from([5]),
      new Uint8Array([5]), null]);
    assert.equal(encoded.classes, 'iiirrtbbn');
    assert.deepEqual(encoded.cells.slice(0, 3), ['5', '1', '0']);
    assert.deepEqual(decodeTypedParams(encoded).slice(0, 3), [5n, 1n, 0n]);
  });

  it('refuses every value outside the table as unrepresentable', () => {
    const cases = [
      [undefined, REFUSAL.VALUE_TYPE_UNSUPPORTED],
      [{}, REFUSAL.VALUE_TYPE_UNSUPPORTED],
      [[], REFUSAL.VALUE_TYPE_UNSUPPORTED],
      [Symbol('s'), REFUSAL.VALUE_TYPE_UNSUPPORTED],
      [() => 1, REFUSAL.VALUE_TYPE_UNSUPPORTED],
      [new Date(0), REFUSAL.VALUE_TYPE_UNSUPPORTED],
      [new Int16Array(1), REFUSAL.VALUE_TYPE_UNSUPPORTED],
      [new Uint8ClampedArray(1), REFUSAL.VALUE_TYPE_UNSUPPORTED],
      [new ArrayBuffer(1), REFUSAL.VALUE_TYPE_UNSUPPORTED],
      [NaN, REFUSAL.REAL_NOT_A_NUMBER],
      [INT64_MAX + 1n, REFUSAL.INTEGER_OUT_OF_RANGE],
      [INT64_MIN - 1n, REFUSAL.INTEGER_OUT_OF_RANGE],
      ['a\ud800', REFUSAL.TEXT_NOT_WELL_FORMED],
    ];
    for (const [value, reason] of cases) {
      assertRefused(() => encodeTypedParams(['ok', value]), CODE.UNREPRESENTABLE, reason,
        {row: null, column: 1});
      assertRefused(() => encodeTypedRowSet(['a', 'b'], [[null, null], ['ok', value]]),
        CODE.UNREPRESENTABLE, reason, {row: 1, column: 1});
    }
  });

  it('refuses named parameters and malformed producer input', () => {
    assertRefused(() => encodeTypedParams({a: 1}), CODE.UNREPRESENTABLE,
      REFUSAL.SHAPE_INVALID);
    assertRefused(() => encodeTypedRowSet('a', []), CODE.UNREPRESENTABLE,
      REFUSAL.SHAPE_INVALID);
    assertRefused(() => encodeTypedRowSet(['a'], {}), CODE.UNREPRESENTABLE,
      REFUSAL.SHAPE_INVALID);
    assertRefused(() => encodeTypedRowSet(['a', 2], []), CODE.UNREPRESENTABLE,
      REFUSAL.SHAPE_INVALID, {column: 1});
    assertRefused(() => encodeTypedRowSet(['\ud800'], []), CODE.UNREPRESENTABLE,
      REFUSAL.TEXT_NOT_WELL_FORMED, {column: 0});
    assertRefused(() => encodeTypedRowSet(['a'], [[1n], 'x']), CODE.UNREPRESENTABLE,
      REFUSAL.SHAPE_INVALID, {row: 1});
    assertRefused(() => encodeTypedRowSet(['a'], [[1n], [1n, 2n]]), CODE.UNREPRESENTABLE,
      REFUSAL.ARITY_MISMATCH, {row: 1});
  });
});

describe('sql-value-codec against better-sqlite3 (safeIntegers + raw)', () => {
  const SCHEMA = 'k INTEGER PRIMARY KEY, a, i INTEGER, r REAL, n NUMERIC, x TEXT, b BLOB';
  const VALUE_COLUMNS = ['a', 'i', 'r', 'n', 'x', 'b'];
  const SELECT_VALUES = `SELECT k, ${VALUE_COLUMNS.join(', ')} FROM t ORDER BY k`;
  const SELECT_TYPED = `SELECT k, ${VALUE_COLUMNS
    .map((column) => `${column}, typeof(${column}), hex(${column})`).join(', ')} ` +
    'FROM t ORDER BY k';
  const INSERT = `INSERT INTO t (k, ${VALUE_COLUMNS.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?)`;

  function openDatabase() {
    const database = new Database(':memory:');
    database.defaultSafeIntegers(true);
    database.exec(`CREATE TABLE t (${SCHEMA})`);
    return database;
  }

  function sourceRows(seed) {
    const generator = createGenerator(seed);
    const rows = [];
    for (const storageClass of STORAGE_CLASSES) {
      for (const value of EDGE_VALUES[storageClass]) rows.push(VALUE_COLUMNS.map(() => value));
    }
    for (let index = 0; index < SQLITE_ROWS_PER_SEED; index += 1) {
      rows.push(VALUE_COLUMNS.map(() => generator.value()));
    }
    return rows;
  }

  function readTyped(database) {
    return database.prepare(SELECT_TYPED).raw(true).all();
  }

  it('a row read from SQLite, framed as JSON, decoded and re-inserted keeps typeof and value',
    () => {
      for (const seed of PROPERTY_SEEDS) {
        const source = openDatabase();
        const target = openDatabase();
        const insertSource = source.prepare(INSERT);
        sourceRows(seed).forEach((values, index) => insertSource.run(BigInt(index), ...values));

        const read = source.prepare(SELECT_VALUES).raw(true);
        const columns = read.columns().map((column) => column.name);
        const answer = JSON.stringify({result: encodeTypedRowSet(columns, read.all())});
        const decoded = decodeTypedRowSet(JSON.parse(answer).result);
        assert.deepEqual(decoded.columns, ['k', ...VALUE_COLUMNS]);

        const insertTarget = target.prepare(INSERT);
        for (const row of decoded.rows) insertTarget.run(...row);
        const expected = readTyped(source);
        const actual = readTyped(target);
        assert.equal(actual.length, expected.length);
        for (let row = 0; row < expected.length; row += 1) {
          for (let column = 0; column < expected[row].length; column += 1) {
            assertSameTypedValue(actual[row][column], expected[row][column],
              `seed ${seed} row ${row} column ${column}`);
          }
        }
        source.close();
        target.close();
      }
    });

  it('keeps -0.0 where SQLite keeps it (untyped and BLOB affinity) and 0 where it does not',
    () => {
      const source = openDatabase();
      source.prepare(INSERT).run(1n, -0, -0, -0, -0, -0, -0);
      const read = source.prepare(SELECT_VALUES).raw(true);
      const encoded = encodeTypedRowSet(read.columns().map((column) => column.name),
        read.all());
      // k, a (untyped), i INTEGER, r REAL, n NUMERIC, x TEXT, b BLOB.
      const [classes, ...cells] = encoded.rows[0];
      assert.equal(classes, 'iriritr');
      assert.deepEqual([cells[1], cells[2], cells[3], cells[4], cells[6]],
        ['-0', '0', '0', '0', '-0']);
      const [row] = decodeTypedRowSet(wireRoundTrip(encoded)).rows;
      assert.ok(Object.is(row[1], -0) && Object.is(row[6], -0));
      source.close();
    });

  it('binds every decoded parameter with the storage class it was encoded with', () => {
    const database = new Database(':memory:');
    database.defaultSafeIntegers(true);
    const typeOf = database.prepare('SELECT typeof(?), ?').raw(true);
    for (const seed of PROPERTY_SEEDS) {
      const generator = createGenerator(seed);
      const values = Array.from({length: SQLITE_ROWS_PER_SEED}, generator.value);
      const wire = wireRoundTrip(encodeTypedParams(values));
      const decoded = decodeTypedParams(wire);
      for (let index = 0; index < decoded.length; index += 1) {
        const [sqliteType, echoed] = typeOf.get(decoded[index], decoded[index]);
        assert.equal(sqliteType, SQLITE_TYPEOF[wire.classes[index]],
          `seed ${seed} parameter ${index}`);
        assertSameTypedValue(echoed, values[index], `seed ${seed} parameter ${index}`);
      }
    }
    database.close();
  });

  it('keeps duplicate result column names in order', () => {
    const database = openDatabase();
    database.prepare(INSERT).run(1n, 'a', 2n, 2.5, null, 'x', Buffer.from([9]));
    const read = database.prepare('SELECT a AS c, i AS c, r AS c, b AS "" FROM t').raw(true);
    const encoded = encodeTypedRowSet(read.columns().map((column) => column.name), read.all());
    const decoded = decodeTypedRowSet(wireRoundTrip(encoded));
    assert.deepEqual(decoded.columns, ['c', 'c', 'c', '']);
    assertSameRows(decoded.rows, [['a', 2n, 2.5, Buffer.from([9])]], 'duplicate columns');
    database.close();
  });

  it('witnesses why NaN and unpaired surrogates are refused rather than bound', () => {
    const database = new Database(':memory:');
    database.defaultSafeIntegers(true);
    const typeOf = database.prepare('SELECT typeof(?), hex(?)').raw(true);
    assert.deepEqual(typeOf.get(NaN, NaN), ['null', '']);
    // The bound bytes are not UTF-8 (ED A0 80), and a read replaces them.
    assert.deepEqual(typeOf.get('a\ud800', 'a\ud800'), ['text', '61EDA080']);
    assert.equal(database.prepare('SELECT ?').pluck().get('a\ud800'), 'a\ufffd\ufffd\ufffd');
    assertRefused(() => encodeTypedParams([NaN]), CODE.UNREPRESENTABLE,
      REFUSAL.REAL_NOT_A_NUMBER);
    assertRefused(() => encodeTypedParams(['a\ud800']), CODE.UNREPRESENTABLE,
      REFUSAL.TEXT_NOT_WELL_FORMED);
    database.close();
  });
});
