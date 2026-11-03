/**
 * Census site 7 (split accessor, PARTITIONS.size_bytes), quest
 * replica-admission-from-committed-operation attempt 2: size_bytes is an
 * own column - only the partition's leader writes it - so the leader keeps
 * the size its last committed write answered and dedupes against that, never
 * against the projection (three-class rule, own row). With the projection
 * paused (it still shows an old size), a repeated size is not re-written and
 * no projection read happens; a failed write keeps nothing, so the next
 * measurement writes again.
 */

import {test} from '../../src/test-helpers/tap.js';
import {PartitionServiceSplitAccessorBase} from
  '../../src/partition/partition-service-split-accessor-base.js';

function leaderPartition() {
  const projection = {reads: 0};
  projection.get = () => {
    projection.reads += 1;
    return {partition_id: 'size-keep-p1', size_bytes: 100};
  };
  const writes = [];
  const partition = Object.create(PartitionServiceSplitAccessorBase.prototype);
  Object.assign(partition, {
    partitionId: 'size-keep-p1',
    isLeader: true,
    systemTableCache: projection,
    cdcIntegrationService: {},
    logger: {warn() {}, debug() {}, info() {}, error() {}},
    failNextWrite: false,
    raftTerm: 7,
    raft: {readStatus: () => ({term: partition.raftTerm})},
    isPartitionsLeaderAvailable: () => true,
    async submitPartitionSizeMutation(sizeBytes) {
      writes.push(sizeBytes);
      if (partition.failNextWrite) {
        partition.failNextWrite = false;
        throw new Error('size write unconfirmed');
      }
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  });
  return {partition, projection, writes};
}

test('site 7: the leader dedupes size writes against its own committed ' +
  'size, not the paused projection', async (t) => {
  const {partition, projection, writes} = leaderPartition();

  await partition.persistPartitionSize(4096);
  await partition.persistPartitionSize(4096);
  await partition.persistPartitionSize(8192);

  t.same(writes, [4096, 8192],
    'a size equal to the last committed write is not re-written');
  t.equal(projection.reads, 0, 'no projection read');
});

test('site 7: a failed size write keeps nothing, so the next measurement ' +
  'writes again', async (t) => {
  const {partition, projection, writes} = leaderPartition();
  partition.failNextWrite = true;

  await partition.persistPartitionSize(4096);
  await partition.persistPartitionSize(4096);

  t.same(writes, [4096, 4096],
    'the unconfirmed write is not taken as committed');
  t.equal(projection.reads, 0, 'no projection read');
});

test('site 7: a size write that found no row keeps nothing', async (t) => {
  const {partition, writes} = leaderPartition();
  const submit = partition.submitPartitionSizeMutation;
  partition.submitPartitionSizeMutation = async (sizeBytes) => {
    await submit(sizeBytes);
    return {success: true, partitionResult: {affectedRows: 0}};
  };

  await partition.persistPartitionSize(4096);
  await partition.persistPartitionSize(4096);

  t.same(writes, [4096, 4096], 'a zero-row write is not taken as committed');
});

test('site 7: a leadership change clears the kept size', async (t) => {
  const {partition, writes} = leaderPartition();
  await partition.persistPartitionSize(4096);
  partition.raftTerm = 8;
  await partition.persistPartitionSize(4096);
  t.same(writes, [4096, 4096],
    'the next term dedupes against nothing it did not write');
});

test('site 7: partitions system table skips size persistence', async (t) => {
  const {partition, writes} = leaderPartition();
  partition.tableName = 'partitions';
  await partition.persistPartitionSize(4096);
  t.same(writes, [], 'partitions system table never writes size_bytes into itself');
});
