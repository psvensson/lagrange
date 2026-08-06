import fs from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  compareSplitKey,
  resolveSplitTargetPartitionId,
  SPLIT_KEY_TYPE,
} from '../../src/partition/split-key-comparator.js';
import * as routingModule from '../../src/partition/partition-split-routing.js';
import {
  replaySplitEntry,
  routeSplitSnapshotBatch,
} from '../../src/partition/partition-split-routing.js';

const LEFT_PARTITION_ID = 'users-left';
const RIGHT_PARTITION_ID = 'users-right';
const INSERT_SQL = 'INSERT INTO users (id, name) VALUES (?, ?)';

const NUMERIC_TYPE_MISMATCH_MESSAGE =
  PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
    SPLIT_KEY_TYPE.STRING,
    SPLIT_KEY_TYPE.NUMBER,
  );

function createMetadata(splitKey) {
  return {
    primaryKeyColumn: 'id',
    splitKey,
    targetPartitionIds: [LEFT_PARTITION_ID, RIGHT_PARTITION_ID],
  };
}

test('typed comparator orders numeric and string key spaces without coercion',
  (t) => {
    t.equal(compareSplitKey(4, 10) < 0, true, 'numeric 4 sorts left of 10');
    t.equal(compareSplitKey(20, 10) > 0, true, 'numeric 20 sorts right of 10');
    t.equal(compareSplitKey('10', '4') < 0, true,
      'string 10 sorts left of string 4 (lexicographic, not numeric)');
    t.equal(compareSplitKey('9', '10') > 0, true,
      'string 9 sorts right of string 10 — never coerced to numeric');
    t.equal(compareSplitKey(10, 10), 0, 'boundary key compares equal');
    t.equal(
      compareSplitKey(Buffer.from('ab'), Buffer.from('b')) < 0,
      true,
      'buffer keys compare bytewise',
    );
    t.end();
  });

test('numeric split key routes by magnitude, not lexicographic coercion',
  (t) => {
    const metadata = createMetadata(10);
    t.equal(resolveSplitTargetPartitionId(4, metadata), LEFT_PARTITION_ID);
    t.equal(resolveSplitTargetPartitionId(20, metadata), RIGHT_PARTITION_ID);
    t.equal(resolveSplitTargetPartitionId(10, metadata), RIGHT_PARTITION_ID,
      'boundary key belongs to the right child');
    t.equal(resolveSplitTargetPartitionId(null, metadata), RIGHT_PARTITION_ID,
      'null keys keep the legacy right-child routing contract');
    t.equal(
      resolveSplitTargetPartitionId(undefined, metadata),
      RIGHT_PARTITION_ID,
    );
    t.end();
  });

test('mixed-type key space is rejected, never coerced into a mis-route',
  (t) => {
    const metadata = createMetadata(10);
    // Raw JavaScript would route '9' LEFT ('9' < 10 coerces to 9 < 10),
    // a silent mis-route in a numeric key space — the typed comparator
    // must refuse the comparison instead.
    t.throws(
      () => resolveSplitTargetPartitionId('9', metadata),
      {message: NUMERIC_TYPE_MISMATCH_MESSAGE},
    );
    t.throws(
      () => resolveSplitTargetPartitionId(9, createMetadata('10')),
      {
        message: PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
          SPLIT_KEY_TYPE.NUMBER,
          SPLIT_KEY_TYPE.STRING,
        ),
      },
    );
    t.throws(
      () => resolveSplitTargetPartitionId(Buffer.from('9'), metadata),
      {
        message: PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
          SPLIT_KEY_TYPE.BUFFER,
          SPLIT_KEY_TYPE.NUMBER,
        ),
      },
    );
    t.end();
  });

test('unusable split key types reject instead of silently comparing', (t) => {
  t.throws(
    () => resolveSplitTargetPartitionId(9, createMetadata(Number.NaN)),
    {
      message: PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
        SPLIT_KEY_TYPE.NUMBER,
        'number/string/buffer',
      ),
    },
  );
  t.throws(
    () => resolveSplitTargetPartitionId(9, createMetadata({median: 9})),
    {
      message: PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
        'object',
        'number/string/buffer',
      ),
    },
  );
  t.throws(
    () => resolveSplitTargetPartitionId(9, createMetadata(true)),
    {
      message: PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
        'boolean',
        'number/string/buffer',
      ),
    },
  );
  t.end();
});

test('mirror replay rejects a mixed-type routing key before dispatch',
  async (t) => {
    const queryExecutor = {
      async executeOnPartition() {
        t.fail('mixed-type routing key must reject before route dispatch');
      },
    };

    await t.rejects(
      replaySplitEntry(
        {sql: INSERT_SQL, params: ['9', 'Nina'], data: {id: '9'}},
        createMetadata(10),
        {tableName: 'users', queryExecutor},
      ),
      {message: NUMERIC_TYPE_MISMATCH_MESSAGE},
    );
  });

test('snapshot batching rejects a mixed-type row before dispatch', async (t) => {
  const queryExecutor = {
    async executeOnPartition() {
      t.fail('mixed-type snapshot row must reject before route dispatch');
    },
  };

  await t.rejects(
    routeSplitSnapshotBatch(
      [{id: '9', name: 'Nina'}],
      ['id', 'name'],
      createMetadata(10),
      {tableName: 'users', queryExecutor},
    ),
    {message: NUMERIC_TYPE_MISMATCH_MESSAGE},
  );
});

test('every split routing decision resolves through the owned comparator',
  (t) => {
    const moduleSource = fs.readFileSync(
      new URL(
        '../../src/partition/partition-split-routing.js',
        import.meta.url,
      ),
      'utf8',
    );
    t.equal(
      moduleSource.includes('value < metadata.splitKey'),
      false,
      'the routing module carries no raw relational split-key comparison',
    );
    t.equal(
      typeof routingModule.compareSplitKey,
      'function',
      'the routing surface re-exports the owned comparator',
    );
    t.equal(
      routingModule.resolveSplitTargetPartitionId,
      resolveSplitTargetPartitionId,
      'the routing surface re-exports the comparator-owned resolver',
    );
    t.end();
  });
