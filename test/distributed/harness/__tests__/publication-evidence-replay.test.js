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
});
