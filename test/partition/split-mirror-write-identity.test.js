import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
} from '../../src/partition/partition-constants.js';
import {
  PARTITION_SPLIT_MIRROR_ORIGIN,
} from '../../src/partition/partition-constants.js';
import {
  extractSplitMirrorIdentity,
  replaySplitEntry,
} from '../../src/partition/partition-split-routing.js';

const TABLE_NAME = 'users';
const PRIMARY_KEY_COLUMN = 'id';
const SPLIT_KEY = 'm';
const TARGET_VERSION = 2;
const LEFT_PARTITION_ID = 'users-left';
const RIGHT_PARTITION_ID = 'users-right';
const INSERT_SQL = 'INSERT INTO users (id, name) VALUES (?, ?)';

function createMetadata() {
  return {
    primaryKeyColumn: PRIMARY_KEY_COLUMN,
    splitKey: SPLIT_KEY,
    targetPartitionIds: [LEFT_PARTITION_ID, RIGHT_PARTITION_ID],
    [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]:
      TARGET_VERSION,
  };
}

test('extractSplitMirrorIdentity carries non-empty identity fields only',
  (t) => {
    t.same(
      extractSplitMirrorIdentity({
        entryId: 'entry-1',
        operationId: 'op-1',
        idempotencyKey: 'idem-1',
      }),
      {entryId: 'entry-1', operationId: 'op-1', idempotencyKey: 'idem-1'},
      'all identity fields must be preserved',
    );
    t.same(
      extractSplitMirrorIdentity({entryId: 'entry-1'}),
      {entryId: 'entry-1'},
      'missing identity fields must be omitted, not null-encoded',
    );
    t.same(
      extractSplitMirrorIdentity({
        entryId: '',
        operationId: null,
        idempotencyKey: undefined,
      }),
      {},
      'empty or absent identity fields must be omitted',
    );
    t.end();
  });

test('mirrored split replay preserves the source write idempotency ' +
  'identity so an ambiguous executor retry cannot double-apply',
async (t) => {
  const deliveries = [];
  const queryExecutor = {
    async executeOnPartition(
      partitionId,
      sql,
      params,
      _forRead,
      _preferLeader,
      _preferSameLatencyGroup,
      executionOptions,
    ) {
      deliveries.push({partitionId, sql, params, executionOptions});
      return {success: true};
    },
  };

  await replaySplitEntry(
    {
      sql: INSERT_SQL,
      params: ['a', 'Ada'],
      data: {[PRIMARY_KEY_COLUMN]: 'a'},
      entryId: 'source-entry-7',
      operationId: 'source-op-3',
      idempotencyKey: 'source-idem-9',
    },
    createMetadata(),
    {tableName: TABLE_NAME, queryExecutor},
  );

  t.equal(deliveries.length, 1, 'one mirrored delivery must be routed');
  t.equal(
    deliveries[0].executionOptions.entryId,
    'source-entry-7',
    'the child replay registry keys on entryId — it must survive the mirror',
  );
  t.equal(
    deliveries[0].executionOptions.operationId,
    'source-op-3',
    'operationId must survive the mirror',
  );
  t.equal(
    deliveries[0].executionOptions.idempotencyKey,
    'source-idem-9',
    'idempotencyKey must survive the mirror',
  );
  t.equal(
    deliveries[0].executionOptions.splitMirrorOrigin,
    PARTITION_SPLIT_MIRROR_ORIGIN.SOURCE,
    'mirror origin tagging must be preserved',
  );
});

test('mirrored split replay omits identity fields the source write ' +
  'never carried', async (t) => {
  const deliveries = [];
  const queryExecutor = {
    async executeOnPartition(
      partitionId,
      sql,
      params,
      _forRead,
      _preferLeader,
      _preferSameLatencyGroup,
      executionOptions,
    ) {
      deliveries.push({partitionId, sql, params, executionOptions});
      return {success: true};
    },
  };

  await replaySplitEntry(
    {
      sql: INSERT_SQL,
      params: ['z', 'Zoe'],
      data: {[PRIMARY_KEY_COLUMN]: 'z'},
    },
    createMetadata(),
    {tableName: TABLE_NAME, queryExecutor},
  );

  t.equal(deliveries.length, 1, 'one mirrored delivery must be routed');
  t.equal(
    'entryId' in deliveries[0].executionOptions,
    false,
    'no synthetic entryId may be minted for the mirror',
  );
});
