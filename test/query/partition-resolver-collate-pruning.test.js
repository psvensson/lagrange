/**
 * The partition-key pruning rule for an explicit COLLATE (design
 * coordinator-sqlite-merge §2.2, rev 4 G6; partition-resolver-key-conditions.js):
 * key ranges are ordered by BINARY comparison, so a key predicate with an
 * explicit COLLATE on either side of `=`, a range, IN or BETWEEN never
 * prunes. The same predicates without COLLATE do prune (the control).
 */

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
import {carriesExplicitCollation} from '../../src/query/partition-resolver-key-conditions.js';
import {SQLParser} from '../../src/query/sql-parser.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) config.initialize();

const TABLE = {table_name: 'users', primary_key: 'id', partition_key_type: 'TEXT'};
const PARTITIONS = Object.freeze([
  {partition_id: 'p1', table_name: 'users', partition_key_start: null,
    partition_key_end: 'm', partition_key_type: 'TEXT'},
  {partition_id: 'p2', table_name: 'users', partition_key_start: 'm',
    partition_key_end: 'z', partition_key_type: 'TEXT'},
  {partition_id: 'p3', table_name: 'users', partition_key_start: 'z',
    partition_key_end: null, partition_key_type: 'TEXT'},
]);
const ALL_PARTITIONS = ['p1', 'p2', 'p3'];

function resolve(where) {
  const resolver = new PartitionResolver({systemCache: {
    get: (table, key) => (table === TABLES.TABLES && key === 'users' ? TABLE : null),
    find: (table, predicate) => (table === TABLES.TABLES && predicate(TABLE) ? TABLE : null),
  }});
  const ast = new SQLParser(`SELECT * FROM users WHERE ${where}`).parse();
  return resolver.resolvePartitions('users', ast.where, PARTITIONS).sort();
}

const CASES = Object.freeze([
  {shape: '=', pruned: 'id = \'b\'', collated: ['id = \'b\' COLLATE NOCASE',
    'id COLLATE NOCASE = \'b\'', 'id = \'b\' COLLATE BINARY']},
  {shape: 'range', pruned: 'id < \'c\'', collated: ['id < \'c\' COLLATE NOCASE',
    'id COLLATE RTRIM < \'c\'', '\'c\' COLLATE NOCASE > id']},
  {shape: 'IN', pruned: 'id IN (\'b\', \'c\')', collated: ['id IN (\'b\' COLLATE NOCASE, \'c\')',
    'id COLLATE NOCASE IN (\'b\', \'c\')']},
  {shape: 'BETWEEN', pruned: 'id BETWEEN \'a\' AND \'c\'',
    collated: ['id BETWEEN \'a\' COLLATE NOCASE AND \'c\'',
      'id COLLATE NOCASE BETWEEN \'a\' AND \'c\'']},
]);

for (const {shape, pruned, collated} of CASES) {
  test(`${shape}: an explicit COLLATE on either side disables pruning`, () => {
    assert.deepEqual(resolve(pruned), ['p1'], `control: ${pruned} prunes`);
    for (const where of collated) {
      assert.deepEqual(resolve(where), ALL_PARTITIONS, `${where} must not prune`);
    }
  });
}

test('a collated conjunct constrains nothing; the other conjuncts still prune', () => {
  assert.deepEqual(resolve('id = \'b\' COLLATE NOCASE AND id = \'n\''), ['p2']);
});

test('carriesExplicitCollation reads the collate node, and only it', () => {
  const where = new SQLParser('SELECT * FROM users WHERE id = \'b\' COLLATE NOCASE').parse().where;
  assert.equal(carriesExplicitCollation(where.right), true);
  assert.equal(carriesExplicitCollation(where.left), false);
  assert.equal(carriesExplicitCollation(null), false);
});
