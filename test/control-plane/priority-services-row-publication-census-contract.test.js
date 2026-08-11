import {test} from '../../src/test-helpers/tap.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
} from '../../src/constants/index.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  buildDerivedPriorityPartitionSummary,
} from '../../src/control-plane/membership-publication-priority-partition-summary.js';
import {
  normalizeNodeIdList,
  normalizePositiveInteger,
} from '../../src/control-plane/membership-publication-row-helpers.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {
  buildCreateCdcData,
} from '../../src/node/replica-state-machine-transition.js';

const PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS];
const TARGET_REPLICA_ID = `${PARTITION_ID}-r3`;
const TARGET_NODE_ID = 'node-3';
const TARGET_ADDRESS =
  `ws://${TARGET_NODE_ID}/partition/${PARTITION_ID}/${TARGET_REPLICA_ID}`;
const ELIGIBLE_NODE_IDS = Object.freeze(['node-1', 'node-2', TARGET_NODE_ID]);
const SUMMARY_HELPERS = Object.freeze({
  normalizeNodeIdList,
  normalizePositiveInteger,
});
const EXPECTED_REPLICA_COUNT = 3;
const FIXTURE_TIMESTAMP_MS = 1000;
const NEXT_TIMESTAMP_INCREMENT_MS = 1;
const seedLocalPriorityServiceRow =
  ReplicaHandler.prototype.seedLocalPriorityServiceRow;
const seedLocalReplicaVoterRaftRole =
  ReplicaHandler.prototype.seedLocalReplicaVoterRaftRole;

function applyCacheRow(cache, tableName, row, causeId) {
  cache.applySystemTableChange(
    tableName,
    'INSERT',
    row,
    {causeId},
  );
}

function createReadyServiceRow(nodeId, replicaIndex) {
  const replicaId = `${PARTITION_ID}-r${replicaIndex}`;
  return {
    service_id: replicaId,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: PARTITION_ID,
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    raft_role: 'follower',
    address: `ws://${nodeId}/partition/${PARTITION_ID}/${replicaId}`,
    created_at: FIXTURE_TIMESTAMP_MS,
    updated_at: FIXTURE_TIMESTAMP_MS,
  };
}

function createTwoReplicaCache() {
  const cache = new SystemTableCache();
  applyCacheRow(cache, SYSTEM_TABLE_NAME.PARTITIONS, {
    partition_id: PARTITION_ID,
    replica_count: EXPECTED_REPLICA_COUNT,
  }, 'publication-census-partition');
  applyCacheRow(
    cache,
    SYSTEM_TABLE_NAME.SERVICES,
    createReadyServiceRow('node-1', 1),
    'publication-census-replica-1',
  );
  applyCacheRow(
    cache,
    SYSTEM_TABLE_NAME.SERVICES,
    createReadyServiceRow('node-2', 2),
    'publication-census-replica-2',
  );
  return cache;
}

function createPublicationContext(cache) {
  const markedReplicaIds = [];
  return {
    markedReplicaIds,
    nodeId: TARGET_NODE_ID,
    systemTableCache: cache,
    buildTrackedServiceAddress: () => TARGET_ADDRESS,
    getTrackedReplicaRole: () => 'follower',
    replicaStateMachine: {
      markServiceRowLocalOnly: (replicaId) => {
        markedReplicaIds.push(replicaId);
      },
    },
  };
}

function deriveSummary(cache) {
  return buildDerivedPriorityPartitionSummary({
    partitionRows: cache.getAll(SYSTEM_TABLE_NAME.PARTITIONS),
    serviceRows: cache.getAll(SYSTEM_TABLE_NAME.SERVICES),
    locallyEligibleNodeIds: ELIGIBLE_NODE_IDS,
  }, SUMMARY_HELPERS);
}

function findPartitionBlock(summary) {
  return summary.blockedPartitions.find(
    (entry) => entry.partitionId === PARTITION_ID,
  );
}

test('production SERVICES-row seeds become a census-ready priority replica',
  (t) => {
    const cache = createTwoReplicaCache();
    const publicationContext = createPublicationContext(cache);

    const rowSeeded = seedLocalPriorityServiceRow.call(
      publicationContext,
      TARGET_REPLICA_ID,
      PARTITION_ID,
      SERVICE_STATUS.ACTIVE,
    );
    t.equal(rowSeeded, true, 'production lifecycle seed publishes the row');
    t.match(findPartitionBlock(deriveSummary(cache)), {
      readyReplicaCount: 2,
      readyDistinctNodeCount: 2,
      exclusionReasonCounts: {raft_role_missing: 1},
    }, 'identity and lifecycle publication alone is not voter-ready');

    const roleSeeded = seedLocalReplicaVoterRaftRole.call(
      publicationContext,
      TARGET_REPLICA_ID,
    );
    t.equal(roleSeeded, true, 'production voter-ready seed publishes raft_role');
    t.match(cache.get(SYSTEM_TABLE_NAME.SERVICES, TARGET_REPLICA_ID), {
      service_id: TARGET_REPLICA_ID,
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: PARTITION_ID,
      node_id: TARGET_NODE_ID,
      status: SERVICE_STATUS.ACTIVE,
      raft_role: 'follower',
      address: TARGET_ADDRESS,
    }, 'the two field owners compose one census-consumable SERVICES row');
    const transitionRow = buildCreateCdcData({
      systemTableCache: cache,
      _buildUpdateCdcData: () => ({
        status: SERVICE_STATUS.ACTIVE,
        updated_at: FIXTURE_TIMESTAMP_MS + NEXT_TIMESTAMP_INCREMENT_MS,
      }),
    }, {
      replicaId: TARGET_REPLICA_ID,
      partitionId: PARTITION_ID,
      nodeId: TARGET_NODE_ID,
      stateEnteredAt: FIXTURE_TIMESTAMP_MS,
    }, TARGET_REPLICA_ID, SERVICE_TYPE.PARTITION, TARGET_ADDRESS);
    t.equal(
      transitionRow.raft_role,
      'follower',
      'the production full-row transition publisher preserves voter readiness',
    );
    applyCacheRow(
      cache,
      SYSTEM_TABLE_NAME.SERVICES,
      transitionRow,
      'publication-census-transition-row',
    );
    const readySummary = deriveSummary(cache);
    t.equal(
      findPartitionBlock(readySummary),
      undefined,
      'the real census no longer blocks the production-published partition',
    );
    t.notOk(
      readySummary.missingPartitionIds.includes(PARTITION_ID),
      'the published partition leaves the missing-partition set',
    );
    t.same(
      publicationContext.markedReplicaIds,
      [TARGET_REPLICA_ID, TARGET_REPLICA_ID],
      'both local publications retain the durable-reconcile marker',
    );
    t.end();
  });

test('a full-row publication that wipes raft_role is census-visible debt',
  (t) => {
    const cache = createTwoReplicaCache();
    const publicationContext = createPublicationContext(cache);
    seedLocalPriorityServiceRow.call(
      publicationContext,
      TARGET_REPLICA_ID,
      PARTITION_ID,
      SERVICE_STATUS.ACTIVE,
    );
    seedLocalReplicaVoterRaftRole.call(
      publicationContext,
      TARGET_REPLICA_ID,
    );

    const publishedRow = cache.get(
      SYSTEM_TABLE_NAME.SERVICES,
      TARGET_REPLICA_ID,
    );
    applyCacheRow(cache, SYSTEM_TABLE_NAME.SERVICES, {
      ...publishedRow,
      raft_role: null,
      updated_at: publishedRow.updated_at + NEXT_TIMESTAMP_INCREMENT_MS,
    }, 'publication-census-wiped-role');

    t.match(findPartitionBlock(deriveSummary(cache)), {
      expectedReplicaCount: EXPECTED_REPLICA_COUNT,
      readyReplicaCount: 2,
      readyDistinctNodeCount: 2,
      exclusionReasonCounts: {raft_role_missing: 1},
    }, 'a present row with a wiped role is excluded rather than called absent');
    t.end();
  });

test('an unpublished expected SERVICES row is diagnosed as row_absent', (t) => {
  const cache = createTwoReplicaCache();

  t.match(findPartitionBlock(deriveSummary(cache)), {
    expectedReplicaCount: EXPECTED_REPLICA_COUNT,
    readyReplicaCount: 2,
    readyDistinctNodeCount: 2,
    exclusionReasonCounts: {row_absent: 1},
  });
  t.end();
});
