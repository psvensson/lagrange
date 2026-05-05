import {afterEach, beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../../../src/bootstrap/system-table-schemas-constants.js';
import {PRIORITY_CONTROL_PLANE_TABLE_IDS} from
  '../../../../src/bootstrap/system-partition-classification.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../../../src/control-plane/control-plane-publication-merge.js';
import {NUM, SERVICE_STATUS, SERVICE_TYPE, STATE} from '../../../../src/constants/index.js';
import {RAFT_ROLE} from '../../../../src/raft/constants.js';
import {
  formatPublicationEvidenceReplaySummary,
  PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION,
  PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION,
  replayPublicationPriorityEvidenceFromReportDir,
} from '../publication-evidence-replay.js';

const REPLAY_TEST_ENCODING = 'utf8';
const REPLAY_TEST_NEWLINE = '\n';
const REPLAY_TEST_TEMP_PREFIX = 'publication-evidence-replay-';
const REPLAY_TEST_FAILURE_BUNDLE_FILE = 'failure-bundle.json';
const REPLAY_TEST_SNAPSHOTS_FILE = 'snapshots.ndjson';
const REPLAY_TEST_NODE_IDS = Object.freeze([
  'node-a',
  'node-b',
  'node-c',
]);
const REPLAY_TEST_NOW_MS = 1234567890;
const REPLAY_TEST_OLDER_TIMESTAMP_MS = 1234567000;
const REPLAY_TEST_READY_LEASE_EXTENSION_MS = 60000;
const REPLAY_TEST_PUBLICATION_EPOCH = 7;
const REPLAY_TEST_READY_REPLICA_COUNT_STALE = 2;
const REPLAY_TEST_SPREAD_GAP = 1;
const REPLAY_TEST_REPLICA_SEPARATOR = '-r';
const REPLAY_TEST_ADDRESS_PARTITION_SEGMENT = '/partition/';
const REPLAY_TEST_PARTITION_STATE_NORMAL = 'NORMAL';
const REPLAY_TEST_CLOSURE_RECORD_ID = 'CL-003';
const REPLAY_TEST_CLOSURE_WITNESS_CLASS =
  'publication_converged_priority_spread_pending';
const REPLAY_TEST_CLOSURE_WITNESS_STATE =
  'closure_satisfied_stale_publication';
const REPLAY_TEST_PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED = 'converged';
const REPLAY_TEST_DURABLE_BLOCKED_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS];
const REPLAY_TEST_COMPARISON_LABEL_PATTERN = /comparison/;
const REPLAY_TEST_102455Z_TIMESTAMP_MS = 1777976838861;
const REPLAY_TEST_102455Z_READY_LEASE_EXTENSION_MS = 60000;
const REPLAY_TEST_102455Z_DURABLE_PUBLICATION_EPOCH = 2;
const REPLAY_TEST_102455Z_REPLAYED_PUBLICATION_EPOCH = 3;
const REPLAY_TEST_102455Z_PARTITION_ROW_COUNT = 33;
const REPLAY_TEST_102455Z_SERVICE_ROW_COUNT = 103;
const REPLAY_TEST_102455Z_NODE_ENDPOINT_ROW_COUNT = 0;
const REPLAY_TEST_102455Z_REQUIRED_DISTINCT_NODE_COUNT = 3;
const REPLAY_TEST_102455Z_READY_ELIGIBLE_NODE_COUNT = 3;
const REPLAY_TEST_102455Z_READY_DISTINCT_NODE_COUNT = 1;
const REPLAY_TEST_102455Z_SPREAD_GAP = 2;
const REPLAY_TEST_102455Z_PUBLICATION_RECOVERY_STATE =
  'publication_pending';
const REPLAY_TEST_102455Z_CLOSURE_RECORD_ID = 'CL-006';
const REPLAY_TEST_102455Z_CLOSURE_WITNESS_CLASS =
  'startup_active_publication_lag';
const REPLAY_TEST_102455Z_TEST_NAME =
  'keeps the 102455Z partial owner-row replay blocked';
const REPLAY_TEST_102455Z_FILLER_TABLE_PREFIX = 'fixture_table_';
const REPLAY_TEST_102455Z_FILLER_PARTITION_SUFFIX = '-p1';
const REPLAY_TEST_102455Z_SEED_ACTIVE_SERVICE_ROW_COUNT = 99;
const REPLAY_TEST_102455Z_BASELINE_ACTIVE_SERVICE_ROW_COUNT = 3;
const REPLAY_TEST_102455Z_SYNCING_LEARNER_SERVICE_ROW_COUNT = 1;
const REPLAY_TEST_102455Z_SERVICE_STATUS_SYNCING = 'syncing';
const REPLAY_TEST_102455Z_SERVICE_ROW_FIELD_RAFT_ROLE = 'raftRole';
const REPLAY_TEST_102455Z_SEED_REPLICA_ORDINALS = Object.freeze([
  NUM.ONE,
  NUM.TWO,
  NUM.THREE,
]);
const REPLAY_TEST_102455Z_BASELINE_REPLICA_ORDINAL = NUM.FOUR;
const REPLAY_TEST_102455Z_NODE_ENDPOINT_ROWS = Object.freeze([]);
const REPLAY_TEST_102455Z_NODE_ID = Object.freeze({
  SEED: '7493b0ab-a054-5fad-a91b-5e331db29304',
  BASELINE: '11601fe0-72d6-5853-8590-ec2881853e72',
  STRONG_EXTRA: '8be8d30f-4499-5eed-865c-71b4d529a67a',
});
const REPLAY_TEST_102455Z_NODE_IDS = Object.freeze([
  REPLAY_TEST_102455Z_NODE_ID.SEED,
  REPLAY_TEST_102455Z_NODE_ID.BASELINE,
  REPLAY_TEST_102455Z_NODE_ID.STRONG_EXTRA,
]);
const REPLAY_TEST_102455Z_PUBLISHED_NODE_IDS = Object.freeze([
  REPLAY_TEST_102455Z_NODE_ID.BASELINE,
  REPLAY_TEST_102455Z_NODE_ID.SEED,
]);
const REPLAY_TEST_102455Z_REPLAYED_BLOCKED_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS];
const REPLAY_TEST_102455Z_BASELINE_ACTIVE_PRIORITY_TABLE_IDS = Object.freeze([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
]);
const REPLAY_TEST_102455Z_SYNCING_LEARNER_TABLE_ID =
  SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS;
const REPLAY_TEST_102455Z_PRIORITY_PARTITION_IDS = Object.freeze(
  [...PRIORITY_CONTROL_PLANE_TABLE_IDS].map((tableId) =>
    INITIAL_PARTITION_IDS[tableId],
  ).sort((left, right) => left.localeCompare(right)),
);

function buildNodeRows() {
  return REPLAY_TEST_NODE_IDS.map((nodeId) => ({
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    last_heartbeat: REPLAY_TEST_NOW_MS,
    ready_lease_expires_at: REPLAY_TEST_NOW_MS + REPLAY_TEST_READY_LEASE_EXTENSION_MS,
  }));
}

function buildPriorityPartitionRows() {
  return [...PRIORITY_CONTROL_PLANE_TABLE_IDS].map((tableId) => ({
    table_id: tableId,
    table_name: tableId,
    partition_id: INITIAL_PARTITION_IDS[tableId],
    state: REPLAY_TEST_PARTITION_STATE_NORMAL,
  }));
}

function buildPriorityServiceRows() {
  const serviceRows = [];
  for (const tableId of PRIORITY_CONTROL_PLANE_TABLE_IDS) {
    const partitionId = INITIAL_PARTITION_IDS[tableId];
    REPLAY_TEST_NODE_IDS.forEach((nodeId, index) => {
      const replicaId = `${partitionId}${REPLAY_TEST_REPLICA_SEPARATOR}${index + NUM.ONE}`;
      serviceRows.push({
        service_id: replicaId,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: nodeId,
        partition_id: partitionId,
        replica_id: replicaId,
        raft_role: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
        address: `${nodeId}${REPLAY_TEST_ADDRESS_PARTITION_SEGMENT}${replicaId}`,
      });
    });
  }
  return serviceRows;
}

function buildFailureBundle() {
  return {
    publicationConvergence: {
      publicationEpoch: REPLAY_TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      publishedActiveNodeIds: REPLAY_TEST_NODE_IDS,
      pendingAckNodeIds: [REPLAY_TEST_NODE_IDS[NUM.TWO]],
      prioritySpreadPending: true,
      priorityPartitionSummary: {
        satisfied: false,
        requiredDistinctNodeCount: REPLAY_TEST_NODE_IDS.length,
        readyEligibleNodeCount: REPLAY_TEST_NODE_IDS.length,
        totalPriorityPartitionCount: PRIORITY_CONTROL_PLANE_TABLE_IDS.size,
        missingPartitionIds: [REPLAY_TEST_DURABLE_BLOCKED_PARTITION_ID],
        blockedPartitions: [
          {
            partitionId: REPLAY_TEST_DURABLE_BLOCKED_PARTITION_ID,
            requiredDistinctNodeCount: REPLAY_TEST_NODE_IDS.length,
            readyDistinctNodeCount: REPLAY_TEST_READY_REPLICA_COUNT_STALE,
            spreadGap: REPLAY_TEST_SPREAD_GAP,
          },
        ],
      },
    },
    controlPlane: {
      priorityRecoveryDecisionSnapshots: {
        publicationEpoch: REPLAY_TEST_PUBLICATION_EPOCH,
        partitionIdsBySemanticState: {
          [REPLAY_TEST_PRIORITY_RECOVERY_SEMANTIC_STATE_CONVERGED]: [
            REPLAY_TEST_DURABLE_BLOCKED_PARTITION_ID,
          ],
        },
        blockerPartitionIdsByReason: {},
        priorityPartitionSummary: {
          satisfied: true,
          requiredDistinctNodeCount: REPLAY_TEST_NODE_IDS.length,
          readyEligibleNodeCount: REPLAY_TEST_NODE_IDS.length,
          totalPriorityPartitionCount: PRIORITY_CONTROL_PLANE_TABLE_IDS.size,
          missingPartitionIds: [],
          blockedPartitions: [],
        },
      },
    },
  };
}

function buildSnapshot(timestamp, serviceRows) {
  return {
    timestamp,
    nodes: buildNodeRows(),
    partitions: buildPriorityPartitionRows(),
    services: serviceRows,
  };
}

function build102455ZNodeRows() {
  return REPLAY_TEST_102455Z_NODE_IDS.map((nodeId) => ({
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    last_heartbeat: REPLAY_TEST_102455Z_TIMESTAMP_MS,
    ready_lease_expires_at:
      REPLAY_TEST_102455Z_TIMESTAMP_MS +
      REPLAY_TEST_102455Z_READY_LEASE_EXTENSION_MS,
  }));
}

function build102455ZPartitionRows() {
  const partitionRows = buildPriorityPartitionRows();
  for (
    let index = partitionRows.length;
    index < REPLAY_TEST_102455Z_PARTITION_ROW_COUNT;
    index += NUM.ONE
  ) {
    const ordinal = index + NUM.ONE;
    const tableId = `${REPLAY_TEST_102455Z_FILLER_TABLE_PREFIX}${ordinal}`;
    partitionRows.push({
      table_id: tableId,
      table_name: tableId,
      partition_id: `${tableId}${REPLAY_TEST_102455Z_FILLER_PARTITION_SUFFIX}`,
      state: REPLAY_TEST_PARTITION_STATE_NORMAL,
    });
  }
  return partitionRows;
}

function build102455ZServiceRows(partitionRows) {
  const serviceRows = [];
  for (const partitionRow of partitionRows) {
    for (const replicaOrdinal of REPLAY_TEST_102455Z_SEED_REPLICA_ORDINALS) {
      serviceRows.push(build102455ZServiceRow({
        nodeId: REPLAY_TEST_102455Z_NODE_ID.SEED,
        partitionId: partitionRow.partition_id,
        replicaOrdinal,
        raftRole: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
      }));
    }
  }
  for (const tableId of REPLAY_TEST_102455Z_BASELINE_ACTIVE_PRIORITY_TABLE_IDS) {
    serviceRows.push(build102455ZServiceRow({
      nodeId: REPLAY_TEST_102455Z_NODE_ID.BASELINE,
      partitionId: INITIAL_PARTITION_IDS[tableId],
      replicaOrdinal: REPLAY_TEST_102455Z_BASELINE_REPLICA_ORDINAL,
      raftRole: RAFT_ROLE.FOLLOWER,
      status: SERVICE_STATUS.ACTIVE,
    }));
  }
  serviceRows.push(build102455ZServiceRow({
    nodeId: REPLAY_TEST_102455Z_NODE_ID.BASELINE,
    partitionId: INITIAL_PARTITION_IDS[
      REPLAY_TEST_102455Z_SYNCING_LEARNER_TABLE_ID
    ],
    replicaOrdinal: REPLAY_TEST_102455Z_BASELINE_REPLICA_ORDINAL,
    raftRole: RAFT_ROLE.LEARNER,
    status: REPLAY_TEST_102455Z_SERVICE_STATUS_SYNCING,
  }));
  return serviceRows;
}

function build102455ZServiceRow(options) {
  const replicaId = `${options.partitionId}` +
    `${REPLAY_TEST_REPLICA_SEPARATOR}${options.replicaOrdinal}`;
  return {
    service_id: replicaId,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: options.nodeId,
    partition_id: options.partitionId,
    replica_id: replicaId,
    raft_role: options.raftRole,
    status: options.status,
    address: `${options.nodeId}` +
      `${REPLAY_TEST_ADDRESS_PARTITION_SEGMENT}${replicaId}`,
  };
}

function collect102455ZPriorityServicePartitionIds(serviceRows) {
  const priorityPartitionIds = new Set(REPLAY_TEST_102455Z_PRIORITY_PARTITION_IDS);
  return [...new Set(
    serviceRows
      .map((serviceRow) => serviceRow.partition_id)
      .filter((partitionId) => priorityPartitionIds.has(partitionId)),
  )].sort((left, right) => left.localeCompare(right));
}

function count102455ZServiceRows(serviceRows, options) {
  const shouldMatchRaftRole = Object.hasOwn(
    options,
    REPLAY_TEST_102455Z_SERVICE_ROW_FIELD_RAFT_ROLE,
  );
  return serviceRows.filter((serviceRow) =>
    serviceRow.node_id === options.nodeId &&
    serviceRow.status === options.status &&
    (
      !shouldMatchRaftRole ||
      serviceRow.raft_role === options.raftRole
    ),
  ).length;
}

function build102455ZFailureBundle() {
  const blockedPartitions = [...PRIORITY_CONTROL_PLANE_TABLE_IDS].map((tableId) => ({
    partitionId: INITIAL_PARTITION_IDS[tableId],
    requiredDistinctNodeCount: REPLAY_TEST_102455Z_REQUIRED_DISTINCT_NODE_COUNT,
    readyDistinctNodeCount: REPLAY_TEST_102455Z_READY_DISTINCT_NODE_COUNT,
    spreadGap: REPLAY_TEST_102455Z_SPREAD_GAP,
  }));
  return {
    publicationConvergence: {
      publicationEpoch: REPLAY_TEST_102455Z_DURABLE_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      publishedActiveNodeIds: REPLAY_TEST_102455Z_PUBLISHED_NODE_IDS,
      pendingAckNodeIds: [],
      acknowledgedNodeIds: REPLAY_TEST_102455Z_PUBLISHED_NODE_IDS,
      prioritySpreadPending: true,
      closureRecordId: REPLAY_TEST_102455Z_CLOSURE_RECORD_ID,
      closureWitnessClass: REPLAY_TEST_102455Z_CLOSURE_WITNESS_CLASS,
      priorityPartitionSummary: {
        satisfied: false,
        requiredDistinctNodeCount:
          REPLAY_TEST_102455Z_REQUIRED_DISTINCT_NODE_COUNT,
        readyEligibleNodeCount: REPLAY_TEST_102455Z_READY_ELIGIBLE_NODE_COUNT,
        totalPriorityPartitionCount: PRIORITY_CONTROL_PLANE_TABLE_IDS.size,
        missingPartitionIds: blockedPartitions.map((blockedPartition) =>
          blockedPartition.partitionId,
        ),
        blockedPartitions,
      },
    },
  };
}

function build102455ZSnapshot() {
  const partitionRows = build102455ZPartitionRows();
  return {
    timestamp: REPLAY_TEST_102455Z_TIMESTAMP_MS,
    nodes: build102455ZNodeRows(),
    nodeEndpoints: REPLAY_TEST_102455Z_NODE_ENDPOINT_ROWS,
    partitions: partitionRows,
    services: build102455ZServiceRows(partitionRows),
  };
}

describe('publication evidence replay', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), REPLAY_TEST_TEMP_PREFIX));
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  it('replays artifact rows through runtime publication derivation', async () => {
    const spreadSatisfiedSnapshot = buildSnapshot(
      REPLAY_TEST_NOW_MS,
      buildPriorityServiceRows(),
    );
    const staleSnapshot = buildSnapshot(REPLAY_TEST_OLDER_TIMESTAMP_MS, []);
    await writeFile(
      join(tempDir, REPLAY_TEST_FAILURE_BUNDLE_FILE),
      JSON.stringify(buildFailureBundle()),
      REPLAY_TEST_ENCODING,
    );
    await writeFile(
      join(tempDir, REPLAY_TEST_SNAPSHOTS_FILE),
      [
        JSON.stringify(staleSnapshot),
        JSON.stringify(spreadSatisfiedSnapshot),
      ].join(REPLAY_TEST_NEWLINE),
      REPLAY_TEST_ENCODING,
    );

    const replaySummary = await replayPublicationPriorityEvidenceFromReportDir(tempDir);

    assert.equal(replaySummary.snapshotTimestamp, REPLAY_TEST_NOW_MS);
    assert.equal(replaySummary.comparison.durableSatisfied, false);
    assert.equal(replaySummary.comparison.replayedSatisfied, true);
    assert.equal(replaySummary.comparison.summaryChanged, true);
    assert.equal(
      replaySummary.comparison.driftClassification,
      PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION
        .DURABLE_STALE_REPLAYED_SATISFIED,
    );
    assert.deepEqual(replaySummary.comparison.durableBlockedPartitionIds, [
      REPLAY_TEST_DURABLE_BLOCKED_PARTITION_ID,
    ]);
    assert.deepEqual(replaySummary.comparison.replayedBlockedPartitionIds, []);
    assert.equal(
      replaySummary.replayedPublication.closureWitness.state,
      REPLAY_TEST_CLOSURE_WITNESS_STATE,
    );
    assert.equal(
      replaySummary.replayedPublication.closureWitness.closureRecordId,
      REPLAY_TEST_CLOSURE_RECORD_ID,
    );
    assert.equal(
      replaySummary.replayedPublication.closureWitness.closureWitnessClass,
      REPLAY_TEST_CLOSURE_WITNESS_CLASS,
    );
    assert.equal(
      replaySummary.comparison.closureWitnessClassification,
      PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION
        .REFRESH_REQUIRED,
    );
    assert.equal(
      replaySummary.comparison.closureWitnessPublicationRefreshRequired,
      true,
    );
    assert.equal(
      replaySummary.rowCounts.services,
      PRIORITY_CONTROL_PLANE_TABLE_IDS.size * REPLAY_TEST_NODE_IDS.length,
    );
    assert.match(
      formatPublicationEvidenceReplaySummary(replaySummary),
      REPLAY_TEST_COMPARISON_LABEL_PATTERN,
    );
  });

  it(REPLAY_TEST_102455Z_TEST_NAME, async () => {
    const snapshot = build102455ZSnapshot();

    await writeFile(
      join(tempDir, REPLAY_TEST_FAILURE_BUNDLE_FILE),
      JSON.stringify(build102455ZFailureBundle()),
      REPLAY_TEST_ENCODING,
    );
    await writeFile(
      join(tempDir, REPLAY_TEST_SNAPSHOTS_FILE),
      JSON.stringify(snapshot),
      REPLAY_TEST_ENCODING,
    );

    const replaySummary = await replayPublicationPriorityEvidenceFromReportDir(tempDir);

    assert.deepEqual(
      collect102455ZPriorityServicePartitionIds(snapshot.services),
      REPLAY_TEST_102455Z_PRIORITY_PARTITION_IDS,
    );
    assert.equal(
      count102455ZServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_102455Z_NODE_ID.SEED,
        status: SERVICE_STATUS.ACTIVE,
      }),
      REPLAY_TEST_102455Z_SEED_ACTIVE_SERVICE_ROW_COUNT,
    );
    assert.equal(
      count102455ZServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_102455Z_NODE_ID.BASELINE,
        status: SERVICE_STATUS.ACTIVE,
      }),
      REPLAY_TEST_102455Z_BASELINE_ACTIVE_SERVICE_ROW_COUNT,
    );
    assert.equal(
      count102455ZServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_102455Z_NODE_ID.BASELINE,
        status: REPLAY_TEST_102455Z_SERVICE_STATUS_SYNCING,
        raftRole: RAFT_ROLE.LEARNER,
      }),
      REPLAY_TEST_102455Z_SYNCING_LEARNER_SERVICE_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.nodes,
      REPLAY_TEST_102455Z_NODE_IDS.length,
    );
    assert.equal(
      replaySummary.rowCounts.nodeEndpoints,
      REPLAY_TEST_102455Z_NODE_ENDPOINT_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.partitions,
      REPLAY_TEST_102455Z_PARTITION_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.services,
      REPLAY_TEST_102455Z_SERVICE_ROW_COUNT,
    );
    assert.equal(
      replaySummary.durablePublication.epoch,
      REPLAY_TEST_102455Z_DURABLE_PUBLICATION_EPOCH,
    );
    assert.equal(
      replaySummary.replayedPublication.epoch,
      REPLAY_TEST_102455Z_REPLAYED_PUBLICATION_EPOCH,
    );
    assert.equal(
      replaySummary.replayedPublication.status,
      CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
    );
    assert.equal(
      replaySummary.replayedPublication.recoveryProtocolState,
      REPLAY_TEST_102455Z_PUBLICATION_RECOVERY_STATE,
    );
    assert.equal(replaySummary.comparison.replayedSatisfied, false);
    assert.equal(
      replaySummary.comparison.driftClassification,
      PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION.REPLAYED_BLOCKED,
    );
    assert.ok(
      replaySummary.comparison.replayedBlockedPartitionIds.includes(
        REPLAY_TEST_102455Z_REPLAYED_BLOCKED_PARTITION_ID,
      ),
    );
  });
});
