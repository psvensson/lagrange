import t from 'tap';
import {decodePartitionBoundaryValue} from '../../src/partition/partition-boundary-representation.js';
import {compareRoutingKeys} from '../../src/partition/split-key-comparator.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';

t.test('INTEGER boundaries preserve values beyond Number safe range', (t) => {
  const boundary = decodePartitionBoundaryValue('9007199254740993', 'INTEGER');
  t.equal(boundary, 9007199254740993n);
  t.equal(compareRoutingKeys(9007199254740992n, boundary), -1);
  t.equal(compareRoutingKeys(9007199254740993n, boundary), 0);
  t.equal(compareRoutingKeys(9007199254740994n, boundary), 1);
  t.end();
});

t.test('numeric-looking TEXT remains text authority', (t) => {
  const boundary = decodePartitionBoundaryValue('10', 'TEXT');
  t.equal(typeof boundary, 'string');
  t.equal(boundary, '10');
  t.end();
});

t.test('legacy ambiguous bounded partition fails closed', (t) => {
  const resolver = new PartitionResolver();
  t.throws(
    () => resolver.resolvePartitionForKey('items', 3n, [{
      partition_id: 'p1',
      partition_key_start: '1',
      partition_key_end: '5',
    }]),
    /type authority is missing/u,
  );
  t.end();
});

t.test('routing uses exact persisted INTEGER boundary', (t) => {
  const resolver = new PartitionResolver();
  const partitions = [
    {
      partition_id: 'left',
      partition_key_start: null,
      partition_key_end: '9007199254740993',
      partition_key_type: 'INTEGER',
    },
    {
      partition_id: 'right',
      partition_key_start: '9007199254740993',
      partition_key_end: null,
      partition_key_type: 'INTEGER',
    },
  ];
  t.equal(resolver.resolvePartitionForKey('items', 9007199254740992n, partitions), 'left');
  t.equal(resolver.resolvePartitionForKey('items', 9007199254740993n, partitions), 'right');
  t.end();
});
