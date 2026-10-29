import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTITION_BOUNDARY_KEY_TYPE,
  decodePartitionBoundaryValue,
  normalizePartitionBoundaryKeyType,
  resolveDeclaredPartitionKeyType,
  resolveDeclaredPrimaryKeyColumns,
} from '../../src/partition/partition-boundary-representation.js';

test('PARTITION_BOUNDARY_KEY_TYPE exports frozen canonical type names', () => {
  assert.equal(PARTITION_BOUNDARY_KEY_TYPE.INTEGER, 'INTEGER');
  assert.equal(PARTITION_BOUNDARY_KEY_TYPE.REAL, 'REAL');
  assert.equal(PARTITION_BOUNDARY_KEY_TYPE.TEXT, 'TEXT');
  assert.equal(PARTITION_BOUNDARY_KEY_TYPE.BLOB, 'BLOB');
  assert.equal(PARTITION_BOUNDARY_KEY_TYPE.COMPOSITE, 'COMPOSITE');
  assert.throws(() => {
    PARTITION_BOUNDARY_KEY_TYPE.NEW_TYPE = 'FAIL';
  });
});

test('normalizePartitionBoundaryKeyType normalizes SQL type aliases or returns null', () => {
  assert.equal(normalizePartitionBoundaryKeyType('INTEGER'), 'INTEGER');
  assert.equal(normalizePartitionBoundaryKeyType('int'), 'INTEGER');
  assert.equal(normalizePartitionBoundaryKeyType('BIGINT'), 'INTEGER');
  assert.equal(normalizePartitionBoundaryKeyType('REAL'), 'REAL');
  assert.equal(normalizePartitionBoundaryKeyType('float'), 'REAL');
  assert.equal(normalizePartitionBoundaryKeyType('DOUBLE'), 'REAL');
  assert.equal(normalizePartitionBoundaryKeyType('numeric'), 'REAL');
  assert.equal(normalizePartitionBoundaryKeyType('TEXT'), 'TEXT');
  assert.equal(normalizePartitionBoundaryKeyType('varchar'), 'TEXT');
  assert.equal(normalizePartitionBoundaryKeyType('CHAR'), 'TEXT');
  assert.equal(normalizePartitionBoundaryKeyType('blob'), 'BLOB');
  assert.equal(normalizePartitionBoundaryKeyType('composite'), 'COMPOSITE');
  assert.equal(normalizePartitionBoundaryKeyType('UNKNOWN_TYPE'), null);
  assert.equal(normalizePartitionBoundaryKeyType(null), null);
  assert.equal(normalizePartitionBoundaryKeyType(undefined), null);
});

test('decodePartitionBoundaryValue handles unbounded edges and missing authority', () => {
  assert.equal(decodePartitionBoundaryValue(null, 'INTEGER'), null);
  assert.equal(decodePartitionBoundaryValue(undefined, 'INTEGER'), undefined);
  assert.throws(
    () => decodePartitionBoundaryValue(500, null),
    /Partition boundary type authority is missing; revalidation required/u,
  );
  assert.throws(
    () => decodePartitionBoundaryValue(500, 'INVALID_TYPE'),
    /Partition boundary type authority is missing; revalidation required/u,
  );
});

test('decodePartitionBoundaryValue decodes INTEGER with 64-bit BigInt precision', () => {
  assert.equal(decodePartitionBoundaryValue(100n, 'INTEGER'), 100n);
  assert.equal(decodePartitionBoundaryValue(500, 'INTEGER'), 500n);
  assert.equal(decodePartitionBoundaryValue('500', 'INTEGER'), 500n);
  assert.equal(decodePartitionBoundaryValue('500.0', 'INTEGER'), 500n);
  assert.equal(decodePartitionBoundaryValue('500.000', 'INTEGER'), 500n);
  assert.equal(decodePartitionBoundaryValue('-42', 'INTEGER'), -42n);

  const largeIntStr = '9007199254740993';
  const decodedLarge = decodePartitionBoundaryValue(largeIntStr, 'INTEGER');
  assert.equal(decodedLarge, 9007199254740993n);
  assert.notEqual(Number(decodedLarge), 9007199254740993n);

  assert.throws(
    () => decodePartitionBoundaryValue('not_a_number', 'INTEGER'),
    /Invalid INTEGER partition boundary representation/u,
  );
  assert.throws(
    () => decodePartitionBoundaryValue(3.14, 'INTEGER'),
    /Invalid INTEGER partition boundary representation/u,
  );
});

test('decodePartitionBoundaryValue decodes REAL values', () => {
  assert.equal(decodePartitionBoundaryValue(3.14, 'REAL'), 3.14);
  assert.equal(decodePartitionBoundaryValue('3.14', 'REAL'), 3.14);
  assert.equal(decodePartitionBoundaryValue('-0.5', 'REAL'), -0.5);
  assert.equal(decodePartitionBoundaryValue('1e5', 'REAL'), 100000);
  assert.throws(
    () => decodePartitionBoundaryValue('abc', 'REAL'),
    /Invalid REAL partition boundary representation/u,
  );
  assert.throws(
    () => decodePartitionBoundaryValue(NaN, 'REAL'),
    /Invalid REAL partition boundary representation/u,
  );
});

test('decodePartitionBoundaryValue decodes TEXT and BLOB values', () => {
  assert.equal(decodePartitionBoundaryValue('hello', 'TEXT'), 'hello');
  assert.throws(
    () => decodePartitionBoundaryValue(123, 'TEXT'),
    /Invalid TEXT partition boundary representation/u,
  );

  const buf = Buffer.from('test-blob');
  assert.deepEqual(decodePartitionBoundaryValue(buf, 'BLOB'), buf);
  const base64 = buf.toString('base64');
  assert.deepEqual(decodePartitionBoundaryValue(base64, 'BLOB'), buf);
  assert.throws(
    () => decodePartitionBoundaryValue(123, 'BLOB'),
    /Invalid BLOB partition boundary representation/u,
  );
});

test('decodePartitionBoundaryValue decodes COMPOSITE tuple values', () => {
  const tuple = [1, 'dept-a'];
  assert.deepEqual(decodePartitionBoundaryValue(tuple, 'COMPOSITE'), tuple);
  assert.deepEqual(
    decodePartitionBoundaryValue(JSON.stringify(tuple), 'COMPOSITE'),
    tuple,
  );
  assert.throws(
    () => decodePartitionBoundaryValue([], 'COMPOSITE'),
    /Invalid COMPOSITE partition boundary representation/u,
  );
  assert.throws(
    () => decodePartitionBoundaryValue('invalid_json', 'COMPOSITE'),
    /Invalid COMPOSITE partition boundary representation/u,
  );
  assert.throws(
    () => decodePartitionBoundaryValue([null], 'COMPOSITE'),
    /Invalid COMPOSITE partition boundary representation/u,
  );
});

test('resolveDeclaredPrimaryKeyColumns returns declared columns without "id" fallback', () => {
  assert.deepEqual(
    resolveDeclaredPrimaryKeyColumns(null, {keyColumns: ['custom_key']}),
    ['custom_key'],
  );
  assert.deepEqual(
    resolveDeclaredPrimaryKeyColumns({partition_key: ['k1', 'k2']}),
    ['k1', 'k2'],
  );
  assert.deepEqual(
    resolveDeclaredPrimaryKeyColumns({partition_key: 'dept, user_id'}),
    ['dept', 'user_id'],
  );
  assert.deepEqual(
    resolveDeclaredPrimaryKeyColumns({primaryKey: 'code'}),
    ['code'],
  );
  assert.deepEqual(
    resolveDeclaredPrimaryKeyColumns({
      schema: {
        columns: [
          {name: 'uuid', primaryKey: true},
          {name: 'name'},
        ],
      },
    }),
    ['uuid'],
  );
  assert.deepEqual(
    resolveDeclaredPrimaryKeyColumns({
      schema_definition: JSON.stringify({
        primaryKey: ['pk1', 'pk2'],
        columns: [],
      }),
    }),
    ['pk1', 'pk2'],
  );
  assert.deepEqual(resolveDeclaredPrimaryKeyColumns({}), []);
  assert.deepEqual(resolveDeclaredPrimaryKeyColumns(null), []);
});

test('resolveDeclaredPartitionKeyType resolves type from metadata or schema', () => {
  assert.equal(
    resolveDeclaredPartitionKeyType(null, ['k1', 'k2']),
    'COMPOSITE',
  );
  assert.equal(
    resolveDeclaredPartitionKeyType({partition_key_type: 'INTEGER'}, ['id']),
    'INTEGER',
  );
  assert.equal(
    resolveDeclaredPartitionKeyType({
      schema: {
        columns: [
          {name: 'account_id', type: 'BIGINT', primaryKey: true},
        ],
      },
    }),
    'INTEGER',
  );
  assert.equal(
    resolveDeclaredPartitionKeyType({
      schema: {
        columns: [
          {name: 'code', type: 'VARCHAR', primaryKey: true},
        ],
      },
    }),
    'TEXT',
  );
  assert.equal(resolveDeclaredPartitionKeyType({}), null);
});
