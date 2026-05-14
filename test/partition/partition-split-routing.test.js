import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
} from '../../src/partition/partition-constants.js';
import {
  replaySplitEntry,
} from '../../src/partition/partition-split-routing.js';

const TABLE_NAME = 'users';
const PRIMARY_KEY_COLUMN = 'id';
const SPLIT_KEY = 'm';
const ACTIVE_VERSION = 3;
const PENDING_VERSION = 4;
const STALE_VERSION = 2;
const LEFT_PARTITION_ID = 'users-left';
const RIGHT_PARTITION_ID = 'users-right';
const INSERT_SQL = 'INSERT INTO users (id, name) VALUES (?, ?)';

function createMetadata(targetVersion) {
  return {
    primaryKeyColumn: PRIMARY_KEY_COLUMN,
    splitKey: SPLIT_KEY,
    targetPartitionIds: [LEFT_PARTITION_ID, RIGHT_PARTITION_ID],
    [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]:
      targetVersion,
  };
}

function createDescriptorEvidence(tableDescriptor, partitionVersion) {
  return {
    tableDescriptor,
    targetPartitionDescriptors: [
      {
        partition_id: LEFT_PARTITION_ID,
        partition_version: partitionVersion,
      },
      {
        partition_id: RIGHT_PARTITION_ID,
        partition_version: partitionVersion,
      },
    ],
    requireTargetDescriptors: true,
  };
}

test('split routing rejects stale mirrored writes by descriptor epoch',
  async (t) => {
    const queryExecutor = {
      async executeOnPartition() {
        t.fail('stale descriptor epoch must reject before route dispatch');
      },
    };

    await t.rejects(
      replaySplitEntry(
        {
          sql: INSERT_SQL,
          params: ['n', 'Nina'],
          data: {[PRIMARY_KEY_COLUMN]: 'n'},
        },
        createMetadata(STALE_VERSION),
        {
          tableName: TABLE_NAME,
          queryExecutor,
          descriptorEpochEvidence: createDescriptorEvidence(
            {active_partition_version: ACTIVE_VERSION},
            STALE_VERSION,
          ),
        },
      ),
      {message: PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG.STALE_ROUTE},
    );
  });

test('split routing accepts pending target descriptor epoch', async (t) => {
  const routed = [];
  const queryExecutor = {
    async executeOnPartition(partitionId, sql, params) {
      routed.push({partitionId, sql, params});
      return {success: true};
    },
  };

  await replaySplitEntry(
    {
      sql: INSERT_SQL,
      params: ['a', 'Ada'],
      data: {[PRIMARY_KEY_COLUMN]: 'a'},
    },
    createMetadata(PENDING_VERSION),
    {
      tableName: TABLE_NAME,
      queryExecutor,
      descriptorEpochEvidence: createDescriptorEvidence(
        {
          active_partition_version: ACTIVE_VERSION,
          pending_partition_version: PENDING_VERSION,
        },
        PENDING_VERSION,
      ),
    },
  );

  t.same(
    routed.map((entry) => entry.partitionId),
    [LEFT_PARTITION_ID],
  );
});
