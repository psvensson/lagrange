import {test} from '../../src/test-helpers/tap.js';
import {
  CDC_OPERATIONS,
  SystemTableCache,
} from '../../src/cache/system-table-cache.js';
import {
  createReadOnlyCache,
} from '../../src/cache/read-only-system-table-cache.js';
import {
  CDCEvent,
  CDCHandler,
} from '../../src/message-group/cdc-handler.js';
import {
  PARTITION_SERVICE_REMOTE_QUERY_METHODS,
} from '../../src/partition/partition-service-remote-query-methods.js';
import {
  CDC_CATCHUP_TRIGGER,
  hydrateCdcPropagatedTablesFromAuthority,
} from '../../src/cdc/cdc-integration-service-authoritative-catchup.js';
import {
  AUTHORITATIVE_READ_SOURCE,
} from '../../src/cdc/cdc-integration-service-shared-constants.js';
import {
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

const READ_AUTHORITY_WITNESS_STATE = Object.freeze({
  OBSERVED: 'observed',
});

const TABLE_NAME = 'tables';
const TABLE_PARTITION_ID = INITIAL_PARTITION_IDS[TABLE_NAME];

function buildTableRow(schemaVersion, originHlc, updatedAtMs = 1_000) {
  return {
    table_id: 'tbl-users',
    table_name: 'users',
    schema_sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY)',
    schema_version: schemaVersion,
    origin_hlc: originHlc,
    updated_at_hlc: originHlc,
    updated_at: updatedAtMs,
  };
}

test('buildRemoteReadAuthorityWitness includes appliedIndex and commitIndex from raft.readStatus()', (t) => {
  const fakeService = {
    partitionId: 'partition-0',
    nodeId: 'node-leader',
    replicaId: 'replica-leader',
    role: 'LEADER',
    timeSource: {now: () => 4_200},
    raft: {
      readStatus: () => ({
        term: 3,
        commitIndex: 28,
        appliedIndex: 27,
        lastIndex: 28,
      }),
    },
  };

  const witness =
    PARTITION_SERVICE_REMOTE_QUERY_METHODS.buildRemoteReadAuthorityWitness.call(
      fakeService,
      false,
    );

  t.same(witness, {
    state: READ_AUTHORITY_WITNESS_STATE.OBSERVED,
    partitionId: 'partition-0',
    servingNodeId: 'node-leader',
    servingReplicaId: 'replica-leader',
    term: 3,
    appliedIndex: 27,
    commitIndex: 28,
    role: 'LEADER',
    observedAtMs: 4_200,
  });
  t.end();
});

test('CDCHandler preserves and forwards owner revision metadata to SystemTableCache', (t) => {
  const cache = new SystemTableCache();
  const readOnlyCache = createReadOnlyCache(cache);
  const handler = new CDCHandler(cache, {
    timeSource: {now: () => 5_000},
  });

  handler.applyImmediate(
    {
      tableName: TABLE_NAME,
      operation: CDC_OPERATIONS.INSERT,
      data: buildTableRow(1, '1000-0-node-1', 1_000),
      timestamp: '1000-0-node-1',
      sourcePartition: TABLE_PARTITION_ID,
      sourceReplica: 'node-1',
      sourceLogIndex: 12,
      sourceOrdinal: 0,
      eventKey: 'tables:users',
      entryId: 'entry-12-0',
      causeId: 'cause-pub-1',
    },
    {skipSubscriptionCheck: true},
  );

  const watermark = cache.getTableRevisionWatermark(TABLE_NAME);
  t.same(watermark, {
    tableName: TABLE_NAME,
    tableMutationRevision: 1,
    lastSourcePartition: TABLE_PARTITION_ID,
    lastSourceReplica: 'node-1',
    lastSourceLogIndex: 12,
    lastSourceOrdinal: 0,
    lastOriginHlc: '1000-0-node-1',
    lastCdcObservedAtMs: 5_000,
    lastAuthoritativeTerm: null,
    lastAuthoritativeAppliedIndex: null,
    lastAuthoritativeCommitIndex: null,
    lastAuthoritativeServingNodeId: null,
    lastAuthoritativePartitionId: null,
    lastAuthoritativeObservedAtMs: null,
  });
  t.same(
    readOnlyCache.getTableRevisionWatermark(TABLE_NAME),
    watermark,
    'read-only cache exposes table revision watermark snapshot',
  );
  t.same(
    readOnlyCache.getTableRevisionWatermarks(),
    {[TABLE_NAME]: watermark},
    'read-only cache exposes all tracked table revision watermarks',
  );

  const secondEvent = CDCEvent.fromMessage(
    {
      tableName: TABLE_NAME,
      operation: CDC_OPERATIONS.UPDATE,
      data: buildTableRow(2, '1100-0-node-1', 1_100),
      timestamp: '1100-0-node-1',
      sourcePartition: TABLE_PARTITION_ID,
      sourceReplica: 'node-1',
      sourceLogIndex: 15,
      sourceOrdinal: 2,
      eventKey: 'tables:users-update-15-2',
      entryId: 'entry-15-2',
      causeId: 'cause-pub-2',
    },
    5_250,
  );
  handler.applyImmediate(secondEvent, {skipSubscriptionCheck: true});

  t.same(cache.getTableRevisionWatermark(TABLE_NAME), {
    tableName: TABLE_NAME,
    tableMutationRevision: 2,
    lastSourcePartition: TABLE_PARTITION_ID,
    lastSourceReplica: 'node-1',
    lastSourceLogIndex: 15,
    lastSourceOrdinal: 2,
    lastOriginHlc: '1100-0-node-1',
    lastCdcObservedAtMs: 5_250,
    lastAuthoritativeTerm: null,
    lastAuthoritativeAppliedIndex: null,
    lastAuthoritativeCommitIndex: null,
    lastAuthoritativeServingNodeId: null,
    lastAuthoritativePartitionId: null,
    lastAuthoritativeObservedAtMs: null,
  });

  handler.shutdown();
  t.end();
});

test('SystemTableCache combines CDC and authoritative owner revisions monotonically and clears on clear()', (t) => {
  const cache = new SystemTableCache();

  cache.applySystemTableChange(
    TABLE_NAME,
    CDC_OPERATIONS.INSERT,
    buildTableRow(1, '2000-0-node-1', 2_000),
    {
      causeId: 'cdc-apply-1',
      cdcObservedAtMs: 2_100,
      sourcePartition: TABLE_PARTITION_ID,
      sourceReplica: 'node-1',
      sourceLogIndex: 10,
      sourceOrdinal: 1,
    },
  );

  cache.recordAuthoritativeObservation(TABLE_NAME, {
    sourceGeneration: cache.sourceOrder.tableGeneration(TABLE_NAME),
    observedAtMs: 2_200,
    causeId: 'auth-obs-1',
    term: 4,
    appliedIndex: 14,
    commitIndex: 15,
    servingNodeId: 'node-1',
    partitionId: TABLE_PARTITION_ID,
  });

  // Out-of-order lower CDC log index must not regress lastSourceLogIndex
  cache.applySystemTableChange(
    TABLE_NAME,
    CDC_OPERATIONS.UPDATE,
    buildTableRow(1, '1950-0-node-1', 1_950),
    {
      causeId: 'cdc-apply-stale',
      cdcObservedAtMs: 2_150,
      sourcePartition: TABLE_PARTITION_ID,
      sourceReplica: 'node-1',
      sourceLogIndex: 8,
      sourceOrdinal: 4,
    },
  );

  t.same(cache.getTableRevisionWatermark(TABLE_NAME), {
    tableName: TABLE_NAME,
    tableMutationRevision: 1,
    lastSourcePartition: TABLE_PARTITION_ID,
    lastSourceReplica: 'node-1',
    lastSourceLogIndex: 10,
    lastSourceOrdinal: 1,
    lastOriginHlc: '2000-0-node-1',
    lastCdcObservedAtMs: 2_150,
    lastAuthoritativeTerm: 4,
    lastAuthoritativeAppliedIndex: 14,
    lastAuthoritativeCommitIndex: 15,
    lastAuthoritativeServingNodeId: 'node-1',
    lastAuthoritativePartitionId: TABLE_PARTITION_ID,
    lastAuthoritativeObservedAtMs: 2_200,
  });

  cache.clear();
  t.equal(cache.getTableRevisionWatermark(TABLE_NAME), null);
  t.same(cache.getTableRevisionWatermarks(), {});
  t.end();
});

test('hydrateCdcPropagatedTablesFromAuthority binds leader witness revisions on SystemTableCache', async (t) => {
  const cache = new SystemTableCache();
  const fakeService = {
    nodeId: 'node-2',
    systemTableCache: cache,
    cacheMutationTarget: cache,
    timeSource: {now: () => 8_000},
    refuseIfTerminal: () => false,
    getPrimaryKeyField: () => 'table_id',
    captureAuthoritativeCacheSweepSnapshot: (tableName) =>
      cache.captureTableMutationSnapshot(tableName),
    executeAuthoritativeSystemTableRead: async () => ({
      success: true,
      source: AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
      rows: [buildTableRow(3, '3000-0-node-1', 3_000)],
      readAuthorityWitness: {
        state: READ_AUTHORITY_WITNESS_STATE.OBSERVED,
        partitionId: TABLE_PARTITION_ID,
        servingNodeId: 'node-1',
        servingReplicaId: 'replica-1',
        role: RAFT_ROLE.LEADER,
        term: 5,
        appliedIndex: 22,
        commitIndex: 22,
        observedAtMs: 8_100,
      },
    }),
    applyAuthoritativeCacheRepair: (tableName, operation, row, _key, options) => {
      cache.applySystemTableChange(tableName, operation, row, options);
      return true;
    },
    applyAuthoritativeCacheSweep: (tableName, rows, options) => {
      const res = cache.reconcileAgainstAuthoritativeTruth(
        {[tableName]: rows},
        {
          evictOlderThanMs: options.readStartedAtMs,
          authoritativeObservedAtMs: options.authoritativeObservedAtMs,
          mutationSnapshots: {[tableName]: options.mutationSnapshot},
        },
      );
      return res.removed.length;
    },
  };

  const summary = await hydrateCdcPropagatedTablesFromAuthority(fakeService, {
    trigger: CDC_CATCHUP_TRIGGER.JOIN_CATCHUP,
    tables: [TABLE_NAME],
  });

  t.equal(summary.tablesHydrated, 1);
  t.same(cache.getTableRevisionWatermark(TABLE_NAME), {
    tableName: TABLE_NAME,
    tableMutationRevision: 1,
    lastSourcePartition: null,
    lastSourceReplica: null,
    lastSourceLogIndex: null,
    lastSourceOrdinal: null,
    lastOriginHlc: '3000-0-node-1',
    lastCdcObservedAtMs: null,
    lastAuthoritativeTerm: 5,
    lastAuthoritativeAppliedIndex: 22,
    lastAuthoritativeCommitIndex: 22,
    lastAuthoritativeServingNodeId: 'node-1',
    lastAuthoritativePartitionId: TABLE_PARTITION_ID,
    lastAuthoritativeObservedAtMs: 8_100,
  });
});
