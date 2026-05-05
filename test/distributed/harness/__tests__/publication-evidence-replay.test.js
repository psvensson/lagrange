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
import {ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE} from
  '../../../../src/admin/admin-constants.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../../../src/control-plane/control-plane-publication-merge.js';
import {
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
} from '../../../../src/control-plane/control-plane-snapshot-owner.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../../../src/control-plane/owner-contract-outcome.js';
import {NUM, SERVICE_STATUS, SERVICE_TYPE, STATE} from '../../../../src/constants/index.js';
import {RAFT_ROLE} from '../../../../src/raft/constants.js';
import {
  PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY,
  formatPublicationEvidenceReplaySummary,
  PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION,
  PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION,
  replayPublicationPriorityEvidenceFromReportDir,
} from '../publication-evidence-replay.js';

const REPLAY_TEST_ENCODING = 'utf8';
const REPLAY_TEST_NEWLINE = '\n';
const REPLAY_TEST_TEMP_PREFIX = 'publication-evidence-replay-';
const REPLAY_TEST_CORRELATION_KEY_SEPARATOR = '|';
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
const REPLAY_TEST_SERVICE_ROW_FIELD_RAFT_ROLE = 'raftRole';
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
const REPLAY_TEST_114859Z_TIMESTAMP_MS = 1777981883760;
const REPLAY_TEST_114859Z_READY_LEASE_EXTENSION_MS = 60000;
const REPLAY_TEST_114859Z_PUBLICATION_EPOCH = 3;
const REPLAY_TEST_114859Z_EXPECTED_NODE_COUNT = 5;
const REPLAY_TEST_114859Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT = 4;
const REPLAY_TEST_114859Z_PARTITION_ROW_COUNT = 33;
const REPLAY_TEST_114859Z_SERVICE_ROW_COUNT = 103;
const REPLAY_TEST_114859Z_NODE_ENDPOINT_ROW_COUNT = 0;
const REPLAY_TEST_114859Z_REQUIRED_DISTINCT_NODE_COUNT = 3;
const REPLAY_TEST_114859Z_PRIORITY_SPREAD_GAP = 10;
const REPLAY_TEST_114859Z_CLOSURE_RECORD_ID = 'CL-006';
const REPLAY_TEST_114859Z_CLOSURE_WITNESS_CLASS =
  'startup_active_publication_lag';
const REPLAY_TEST_114859Z_TEST_NAME =
  'keeps the 114859Z owner-RPC cache-repair replay blocked';
const REPLAY_TEST_114859Z_FILLER_TABLE_PREFIX = 'fixture_114859_table_';
const REPLAY_TEST_114859Z_FILLER_PARTITION_SUFFIX = '-p1';
const REPLAY_TEST_114859Z_SEED_ACTIVE_SERVICE_ROW_COUNT = 99;
const REPLAY_TEST_114859Z_SECONDARY_ACTIVE_SERVICE_ROW_COUNT = 3;
const REPLAY_TEST_114859Z_TERTIARY_ACTIVE_SERVICE_ROW_COUNT = 1;
const REPLAY_TEST_114859Z_ADMIN_HEALTH = 'admin_health';
const REPLAY_TEST_114859Z_CACHE_STALE_WATERMARK = 'cache_stale_watermark';
const REPLAY_TEST_114859Z_DISCOVERY_NODE_COVERAGE_GAP =
  'discovery_node_coverage_gap';
const REPLAY_TEST_114859Z_STALE_REPLICA_OPERATIONS_IN_FLIGHT =
  'stale_replica_operations_in_flight';
const REPLAY_TEST_114859Z_REPAIR_DEFERRAL_STATE = 'repair_deferred';
const REPLAY_TEST_114859Z_OWNER_RPC_LANE = 'owner_rpc_lane';
const REPLAY_TEST_114859Z_CONTROL_PLANE_BACKPRESSURE =
  'control_plane_backpressure';
const REPLAY_TEST_114859Z_PRESSURE_OR_TIMEOUT = 'pressure_or_timeout';
const REPLAY_TEST_114859Z_NODES_TABLE = 'nodes';
const REPLAY_TEST_114859Z_AUTHORITATIVE_REPAIR_FAILED =
  'Authoritative discovery cache repair failed';
const REPLAY_TEST_114859Z_REPAIR_REASON = 'control_snapshot';
const REPLAY_TEST_114859Z_FIRST_REPAIR_RETRY_AFTER_MS = 8000;
const REPLAY_TEST_114859Z_SELECTED_REPAIR_RETRY_AFTER_MS = 16000;
const REPLAY_TEST_114859Z_SELECTED_REPAIR_DEFERRAL_COUNT = 2;
const REPLAY_TEST_114859Z_REPAIR_DEFERRAL_COUNT = 3;
const REPLAY_TEST_114859Z_MAX_REPAIR_RETRY_AFTER_MS = 32000;
const REPLAY_TEST_114859Z_SQL_WRITE_OPERATION_ID =
  'b4e4c126-7b34-42dc-9234-ee9b7e3b6af2';
const REPLAY_TEST_114859Z_OPERATION_WORKFLOW_OWNER =
  'operation_workflow_owner';
const REPLAY_TEST_114859Z_WORKFLOW_PROGRESS_BOUNDARY = 'workflow_progress';
const REPLAY_TEST_114859Z_EVENT_DRIVEN_WAIT_MODE = 'event_driven';
const REPLAY_TEST_114859Z_RECOVERING_IN_FLIGHT = 'recovering_in_flight';
const REPLAY_TEST_114859Z_PERSISTED_NOT_DISPATCHED =
  'persisted_not_dispatched';
const REPLAY_TEST_114859Z_DISPATCH_PENDING = 'dispatch_pending';
const REPLAY_TEST_114859Z_WORKFLOW_STEP_PENDING = 'PENDING';
const REPLAY_TEST_114859Z_OPERATION_STATUS_PENDING = 'pending';
const REPLAY_TEST_114859Z_WAIT_FOR_OPERATION_PROGRESS =
  'wait_for_operation_progress';
const REPLAY_TEST_114859Z_PRIORITY_RECOVERY_STATE =
  'priority_spread_pending';
const REPLAY_TEST_114859Z_NODE_ID = Object.freeze({
  SEED: '7493b0ab-a054-5fad-a91b-5e331db29304',
  SECONDARY: '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  TERTIARY: '8be8d30f-4499-5eed-865c-71b4d529a67a',
  MISSING_RECOVERY: '11601fe0-72d6-5853-8590-ec2881853e72',
  SELECTED_STALE: 'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
});
const REPLAY_TEST_114859Z_NODE_IDS = Object.freeze([
  REPLAY_TEST_114859Z_NODE_ID.SEED,
  REPLAY_TEST_114859Z_NODE_ID.SECONDARY,
  REPLAY_TEST_114859Z_NODE_ID.TERTIARY,
]);
const REPLAY_TEST_114859Z_PUBLISHED_NODE_IDS = Object.freeze([
  REPLAY_TEST_114859Z_NODE_ID.SECONDARY,
  REPLAY_TEST_114859Z_NODE_ID.SEED,
  REPLAY_TEST_114859Z_NODE_ID.TERTIARY,
]);
const REPLAY_TEST_114859Z_MISSING_PUBLISHED_NODE_IDS = Object.freeze([
  REPLAY_TEST_114859Z_NODE_ID.MISSING_RECOVERY,
  REPLAY_TEST_114859Z_NODE_ID.SELECTED_STALE,
]);
const REPLAY_TEST_114859Z_SELECTED_OBSERVED_NODE_IDS = Object.freeze([
  REPLAY_TEST_114859Z_NODE_ID.SECONDARY,
  REPLAY_TEST_114859Z_NODE_ID.SEED,
  REPLAY_TEST_114859Z_NODE_ID.TERTIARY,
  REPLAY_TEST_114859Z_NODE_ID.SELECTED_STALE,
]);
const REPLAY_TEST_114859Z_OBSERVATION_REASON_CODES = Object.freeze([
  REPLAY_TEST_114859Z_CACHE_STALE_WATERMARK,
  REPLAY_TEST_114859Z_DISCOVERY_NODE_COVERAGE_GAP,
  REPLAY_TEST_114859Z_STALE_REPLICA_OPERATIONS_IN_FLIGHT,
]);
const REPLAY_TEST_114859Z_SEED_REPLICA_ORDINALS = Object.freeze([
  NUM.ONE,
  NUM.TWO,
  NUM.THREE,
]);
const REPLAY_TEST_114859Z_EXTRA_REPLICA_ORDINAL = NUM.FOUR;
const REPLAY_TEST_114859Z_SECONDARY_ACTIVE_PRIORITY_TABLE_IDS = Object.freeze([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
]);
const REPLAY_TEST_114859Z_TERTIARY_ACTIVE_PRIORITY_TABLE_IDS = Object.freeze([
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
]);
const REPLAY_TEST_114859Z_PRIORITY_PARTITION_IDS = Object.freeze(
  [...PRIORITY_CONTROL_PLANE_TABLE_IDS].map((tableId) =>
    INITIAL_PARTITION_IDS[tableId],
  ).sort((left, right) => left.localeCompare(right)),
);
const REPLAY_TEST_114859Z_SQL_WRITE_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS];
const REPLAY_TEST_114859Z_CORRELATION_KEY = [
  REPLAY_TEST_114859Z_SQL_WRITE_PARTITION_ID,
  REPLAY_TEST_114859Z_PUBLICATION_EPOCH,
  REPLAY_TEST_114859Z_SQL_WRITE_OPERATION_ID,
].join(REPLAY_TEST_CORRELATION_KEY_SEPARATOR);
const REPLAY_TEST_114859Z_NODE_ENDPOINT_ROWS = Object.freeze([]);

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
      serviceRows.push(buildReplayServiceRow({
        nodeId: REPLAY_TEST_102455Z_NODE_ID.SEED,
        partitionId: partitionRow.partition_id,
        replicaOrdinal,
        raftRole: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
      }));
    }
  }
  for (const tableId of REPLAY_TEST_102455Z_BASELINE_ACTIVE_PRIORITY_TABLE_IDS) {
    serviceRows.push(buildReplayServiceRow({
      nodeId: REPLAY_TEST_102455Z_NODE_ID.BASELINE,
      partitionId: INITIAL_PARTITION_IDS[tableId],
      replicaOrdinal: REPLAY_TEST_102455Z_BASELINE_REPLICA_ORDINAL,
      raftRole: RAFT_ROLE.FOLLOWER,
      status: SERVICE_STATUS.ACTIVE,
    }));
  }
  serviceRows.push(buildReplayServiceRow({
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

function buildReplayServiceRow(options) {
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

function collectPriorityServicePartitionIds(serviceRows, priorityPartitionIds) {
  const priorityPartitionIdSet = new Set(priorityPartitionIds);
  return [...new Set(
    serviceRows
      .map((serviceRow) => serviceRow.partition_id)
      .filter((partitionId) => priorityPartitionIdSet.has(partitionId)),
  )].sort((left, right) => left.localeCompare(right));
}

function countReplayServiceRows(serviceRows, options) {
  const shouldMatchRaftRole = Object.hasOwn(
    options,
    REPLAY_TEST_SERVICE_ROW_FIELD_RAFT_ROLE,
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

function build114859ZNodeRows() {
  return REPLAY_TEST_114859Z_NODE_IDS.map((nodeId) => ({
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    last_heartbeat: REPLAY_TEST_114859Z_TIMESTAMP_MS,
    ready_lease_expires_at:
      REPLAY_TEST_114859Z_TIMESTAMP_MS +
      REPLAY_TEST_114859Z_READY_LEASE_EXTENSION_MS,
  }));
}

function build114859ZPartitionRows() {
  const partitionRows = buildPriorityPartitionRows();
  for (
    let index = partitionRows.length;
    index < REPLAY_TEST_114859Z_PARTITION_ROW_COUNT;
    index += NUM.ONE
  ) {
    const ordinal = index + NUM.ONE;
    const tableId = `${REPLAY_TEST_114859Z_FILLER_TABLE_PREFIX}${ordinal}`;
    partitionRows.push({
      table_id: tableId,
      table_name: tableId,
      partition_id: `${tableId}${REPLAY_TEST_114859Z_FILLER_PARTITION_SUFFIX}`,
      state: REPLAY_TEST_PARTITION_STATE_NORMAL,
    });
  }
  return partitionRows;
}

function build114859ZServiceRows(partitionRows) {
  const serviceRows = [];
  for (const partitionRow of partitionRows) {
    for (const replicaOrdinal of REPLAY_TEST_114859Z_SEED_REPLICA_ORDINALS) {
      serviceRows.push(buildReplayServiceRow({
        nodeId: REPLAY_TEST_114859Z_NODE_ID.SEED,
        partitionId: partitionRow.partition_id,
        replicaOrdinal,
        raftRole: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
      }));
    }
  }
  for (const tableId of REPLAY_TEST_114859Z_SECONDARY_ACTIVE_PRIORITY_TABLE_IDS) {
    serviceRows.push(buildReplayServiceRow({
      nodeId: REPLAY_TEST_114859Z_NODE_ID.SECONDARY,
      partitionId: INITIAL_PARTITION_IDS[tableId],
      replicaOrdinal: REPLAY_TEST_114859Z_EXTRA_REPLICA_ORDINAL,
      raftRole: RAFT_ROLE.FOLLOWER,
      status: SERVICE_STATUS.ACTIVE,
    }));
  }
  for (const tableId of REPLAY_TEST_114859Z_TERTIARY_ACTIVE_PRIORITY_TABLE_IDS) {
    serviceRows.push(buildReplayServiceRow({
      nodeId: REPLAY_TEST_114859Z_NODE_ID.TERTIARY,
      partitionId: INITIAL_PARTITION_IDS[tableId],
      replicaOrdinal: REPLAY_TEST_114859Z_EXTRA_REPLICA_ORDINAL,
      raftRole: RAFT_ROLE.FOLLOWER,
      status: SERVICE_STATUS.ACTIVE,
    }));
  }
  return serviceRows;
}

function build114859ZRepairLogLine(options) {
  return JSON.stringify({
    nodeId: options.nodeId,
    reason: REPLAY_TEST_114859Z_REPAIR_REASON,
    failedTables: [
      REPLAY_TEST_114859Z_NODES_TABLE,
    ],
    causeChain: [
      REPLAY_TEST_114859Z_CONTROL_PLANE_BACKPRESSURE,
    ],
    failureClass: REPLAY_TEST_114859Z_PRESSURE_OR_TIMEOUT,
    failureCount: options.failureCount,
    retryAfterMs: options.retryAfterMs,
    readSource: REPLAY_TEST_114859Z_OWNER_RPC_LANE,
    msg: REPLAY_TEST_114859Z_AUTHORITATIVE_REPAIR_FAILED,
  });
}

function build114859ZPriorityRecoveryWitness() {
  return {
    partitionId: REPLAY_TEST_114859Z_SQL_WRITE_PARTITION_ID,
    semanticStateId: REPLAY_TEST_114859Z_RECOVERING_IN_FLIGHT,
    currentOwner: REPLAY_TEST_114859Z_OPERATION_WORKFLOW_OWNER,
    blockingBoundary: REPLAY_TEST_114859Z_WORKFLOW_PROGRESS_BOUNDARY,
    waitMode: REPLAY_TEST_114859Z_EVENT_DRIVEN_WAIT_MODE,
    nextRequiredAction: REPLAY_TEST_114859Z_WAIT_FOR_OPERATION_PROGRESS,
    actuationState: REPLAY_TEST_114859Z_PERSISTED_NOT_DISPATCHED,
    workflowProgressPhaseId: REPLAY_TEST_114859Z_DISPATCH_PENDING,
    latestOperationWorkflowStep: REPLAY_TEST_114859Z_WORKFLOW_STEP_PENDING,
    latestOperationStatus: REPLAY_TEST_114859Z_OPERATION_STATUS_PENDING,
    operationIds: [
      REPLAY_TEST_114859Z_SQL_WRITE_OPERATION_ID,
    ],
    correlationKey: REPLAY_TEST_114859Z_CORRELATION_KEY,
  };
}

function build114859ZFailureBundle() {
  return {
    publicationConvergence: {
      publicationEpoch: REPLAY_TEST_114859Z_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: REPLAY_TEST_114859Z_PRIORITY_RECOVERY_STATE,
      publishedActiveNodeIds: REPLAY_TEST_114859Z_PUBLISHED_NODE_IDS,
      pendingAckNodeIds: [],
      acknowledgedNodeIds: REPLAY_TEST_114859Z_PUBLISHED_NODE_IDS,
      missingPublishedNodeIds: REPLAY_TEST_114859Z_MISSING_PUBLISHED_NODE_IDS,
      missingPublishedCount: REPLAY_TEST_114859Z_MISSING_PUBLISHED_NODE_IDS.length,
      prioritySpreadPending: true,
      closureRecordId: REPLAY_TEST_114859Z_CLOSURE_RECORD_ID,
      closureWitnessClass: REPLAY_TEST_114859Z_CLOSURE_WITNESS_CLASS,
      priorityPartitionSummary: {
        satisfied: false,
        blockedPartitionCount: PRIORITY_CONTROL_PLANE_TABLE_IDS.size,
        largestSpreadGap: REPLAY_TEST_114859Z_PRIORITY_SPREAD_GAP,
        totalSpreadGap: REPLAY_TEST_114859Z_PRIORITY_SPREAD_GAP,
      },
    },
    controlPlane: {
      activeGateSnapshotCoverage: {
        expectedNodeCount: REPLAY_TEST_114859Z_EXPECTED_NODE_COUNT,
        bestCoverageNodeCount:
          REPLAY_TEST_114859Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
        selectedSnapshotNodeId: REPLAY_TEST_114859Z_NODE_ID.SELECTED_STALE,
        selectedAdminReady: true,
        selectedSnapshotAdminReady: true,
        selectedReachableBy: REPLAY_TEST_114859Z_ADMIN_HEALTH,
        selectedSnapshotReachableBy: REPLAY_TEST_114859Z_ADMIN_HEALTH,
        selectedSnapshotObservationMode:
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
        selectedSnapshotObservationState:
          CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE,
        selectedSnapshotObservationContractState: OWNER_CONTRACT_STATE.PENDING,
        selectedSnapshotObservationRefreshState:
          CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IDLE,
        selectedSnapshotObservationNextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
        selectedSnapshotObservationReasonCodes:
          REPLAY_TEST_114859Z_OBSERVATION_REASON_CODES,
        selectedSnapshotRepairDeferred: true,
        selectedObservedNodeIds: REPLAY_TEST_114859Z_SELECTED_OBSERVED_NODE_IDS,
        selectedPublishedActiveNodeIds: REPLAY_TEST_114859Z_PUBLISHED_NODE_IDS,
        selectedMissingPublishedNodeIds:
          REPLAY_TEST_114859Z_MISSING_PUBLISHED_NODE_IDS,
      },
      priorityRecoveryObservation: {
        publicationEpoch: REPLAY_TEST_114859Z_PUBLICATION_EPOCH,
        priorityRecoveryPartitionWitnesses: [
          build114859ZPriorityRecoveryWitness(),
        ],
      },
    },
    logs: {
      excerptsByNodeId: {
        [REPLAY_TEST_114859Z_NODE_ID.SELECTED_STALE]: [
          build114859ZRepairLogLine({
            nodeId: REPLAY_TEST_114859Z_NODE_ID.SELECTED_STALE,
            failureCount: NUM.ONE,
            retryAfterMs: REPLAY_TEST_114859Z_FIRST_REPAIR_RETRY_AFTER_MS,
          }),
          build114859ZRepairLogLine({
            nodeId: REPLAY_TEST_114859Z_NODE_ID.SELECTED_STALE,
            failureCount: NUM.TWO,
            retryAfterMs: REPLAY_TEST_114859Z_SELECTED_REPAIR_RETRY_AFTER_MS,
          }),
        ],
        [REPLAY_TEST_114859Z_NODE_ID.SECONDARY]: [
          build114859ZRepairLogLine({
            nodeId: REPLAY_TEST_114859Z_NODE_ID.SECONDARY,
            failureCount: NUM.FOUR,
            retryAfterMs: REPLAY_TEST_114859Z_MAX_REPAIR_RETRY_AFTER_MS,
          }),
        ],
      },
    },
  };
}

function build114859ZSnapshot() {
  const partitionRows = build114859ZPartitionRows();
  return {
    timestamp: REPLAY_TEST_114859Z_TIMESTAMP_MS,
    nodes: build114859ZNodeRows(),
    nodeEndpoints: REPLAY_TEST_114859Z_NODE_ENDPOINT_ROWS,
    partitions: partitionRows,
    services: build114859ZServiceRows(partitionRows),
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
      collectPriorityServicePartitionIds(
        snapshot.services,
        REPLAY_TEST_102455Z_PRIORITY_PARTITION_IDS,
      ),
      REPLAY_TEST_102455Z_PRIORITY_PARTITION_IDS,
    );
    assert.equal(
      countReplayServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_102455Z_NODE_ID.SEED,
        status: SERVICE_STATUS.ACTIVE,
      }),
      REPLAY_TEST_102455Z_SEED_ACTIVE_SERVICE_ROW_COUNT,
    );
    assert.equal(
      countReplayServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_102455Z_NODE_ID.BASELINE,
        status: SERVICE_STATUS.ACTIVE,
      }),
      REPLAY_TEST_102455Z_BASELINE_ACTIVE_SERVICE_ROW_COUNT,
    );
    assert.equal(
      countReplayServiceRows(snapshot.services, {
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

  it(REPLAY_TEST_114859Z_TEST_NAME, async () => {
    const snapshot = build114859ZSnapshot();

    await writeFile(
      join(tempDir, REPLAY_TEST_FAILURE_BUNDLE_FILE),
      JSON.stringify(build114859ZFailureBundle()),
      REPLAY_TEST_ENCODING,
    );
    await writeFile(
      join(tempDir, REPLAY_TEST_SNAPSHOTS_FILE),
      JSON.stringify(snapshot),
      REPLAY_TEST_ENCODING,
    );

    const replaySummary = await replayPublicationPriorityEvidenceFromReportDir(tempDir);

    assert.deepEqual(
      collectPriorityServicePartitionIds(
        snapshot.services,
        REPLAY_TEST_114859Z_PRIORITY_PARTITION_IDS,
      ),
      REPLAY_TEST_114859Z_PRIORITY_PARTITION_IDS,
    );
    assert.equal(
      countReplayServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_114859Z_NODE_ID.SEED,
        status: SERVICE_STATUS.ACTIVE,
      }),
      REPLAY_TEST_114859Z_SEED_ACTIVE_SERVICE_ROW_COUNT,
    );
    assert.equal(
      countReplayServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_114859Z_NODE_ID.SECONDARY,
        status: SERVICE_STATUS.ACTIVE,
      }),
      REPLAY_TEST_114859Z_SECONDARY_ACTIVE_SERVICE_ROW_COUNT,
    );
    assert.equal(
      countReplayServiceRows(snapshot.services, {
        nodeId: REPLAY_TEST_114859Z_NODE_ID.TERTIARY,
        status: SERVICE_STATUS.ACTIVE,
      }),
      REPLAY_TEST_114859Z_TERTIARY_ACTIVE_SERVICE_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.nodes,
      REPLAY_TEST_114859Z_NODE_IDS.length,
    );
    assert.equal(
      replaySummary.rowCounts.nodeEndpoints,
      REPLAY_TEST_114859Z_NODE_ENDPOINT_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.partitions,
      REPLAY_TEST_114859Z_PARTITION_ROW_COUNT,
    );
    assert.equal(
      replaySummary.rowCounts.services,
      REPLAY_TEST_114859Z_SERVICE_ROW_COUNT,
    );
    assert.equal(
      replaySummary.durablePublication.epoch,
      REPLAY_TEST_114859Z_PUBLICATION_EPOCH,
    );
    assert.equal(
      replaySummary.durablePublication.status,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    );
    assert.equal(
      replaySummary.durablePublication.closureRecordId,
      REPLAY_TEST_114859Z_CLOSURE_RECORD_ID,
    );
    assert.equal(
      replaySummary.durablePublication.closureWitnessClass,
      REPLAY_TEST_114859Z_CLOSURE_WITNESS_CLASS,
    );
    assert.equal(
      replaySummary.replayedPublication.epoch,
      REPLAY_TEST_114859Z_PUBLICATION_EPOCH,
    );
    assert.equal(
      replaySummary.replayedPublication.status,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    );
    assert.equal(
      replaySummary.replayedPublication.recoveryProtocolState,
      REPLAY_TEST_114859Z_PRIORITY_RECOVERY_STATE,
    );
    assert.equal(replaySummary.comparison.replayedSatisfied, false);
    assert.equal(
      replaySummary.comparison.driftClassification,
      PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION.REPLAYED_BLOCKED,
    );
    assert.ok(
      replaySummary.comparison.replayedBlockedPartitionIds.includes(
        REPLAY_TEST_114859Z_SQL_WRITE_PARTITION_ID,
      ),
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.availability,
      PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedSnapshotNodeId,
      REPLAY_TEST_114859Z_NODE_ID.SELECTED_STALE,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedAdminReady,
      true,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedSnapshotObservationMode,
      ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedSnapshotObservationState,
      CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation
        .selectedSnapshotObservationContractState,
      OWNER_CONTRACT_STATE.PENDING,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation
        .selectedSnapshotObservationRefreshState,
      CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IDLE,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedSnapshotObservationNextAction,
      OWNER_CONTRACT_NEXT_ACTION.WAIT,
    );
    assert.deepEqual(
      replaySummary.selectedSnapshotObservation
        .selectedSnapshotObservationReasonCodes,
      REPLAY_TEST_114859Z_OBSERVATION_REASON_CODES,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedSnapshotRepairDeferred,
      true,
    );
    assert.deepEqual(
      replaySummary.selectedSnapshotObservation.selectedPublishedActiveNodeIds,
      REPLAY_TEST_114859Z_PUBLISHED_NODE_IDS,
    );
    assert.deepEqual(
      replaySummary.selectedSnapshotObservation.selectedMissingPublishedNodeIds,
      REPLAY_TEST_114859Z_MISSING_PUBLISHED_NODE_IDS,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.selectedPublishedActiveNodeIds.length,
      REPLAY_TEST_114859Z_REQUIRED_DISTINCT_NODE_COUNT,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.expectedNodeCount,
      REPLAY_TEST_114859Z_EXPECTED_NODE_COUNT,
    );
    assert.equal(
      replaySummary.selectedSnapshotObservation.bestCoverageNodeCount,
      REPLAY_TEST_114859Z_SELECTED_SNAPSHOT_COVERAGE_NODE_COUNT,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.availability,
      PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.deferralState,
      REPLAY_TEST_114859Z_REPAIR_DEFERRAL_STATE,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.matchingDeferralCount,
      REPLAY_TEST_114859Z_REPAIR_DEFERRAL_COUNT,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.selectedWitnessDeferralCount,
      REPLAY_TEST_114859Z_SELECTED_REPAIR_DEFERRAL_COUNT,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.selectedWitnessLatestRetryAfterMs,
      REPLAY_TEST_114859Z_SELECTED_REPAIR_RETRY_AFTER_MS,
    );
    assert.equal(
      replaySummary.ownerRpcCacheRepair.latestRetryAfterMs,
      REPLAY_TEST_114859Z_MAX_REPAIR_RETRY_AFTER_MS,
    );
    assert.deepEqual(
      replaySummary.ownerRpcCacheRepair.failedTableNames,
      [
        REPLAY_TEST_114859Z_NODES_TABLE,
      ],
    );
    assert.deepEqual(
      replaySummary.ownerRpcCacheRepair.readSources,
      [
        REPLAY_TEST_114859Z_OWNER_RPC_LANE,
      ],
    );
    assert.deepEqual(
      replaySummary.ownerRpcCacheRepair.causeChain,
      [
        REPLAY_TEST_114859Z_CONTROL_PLANE_BACKPRESSURE,
      ],
    );
    assert.deepEqual(
      replaySummary.ownerRpcCacheRepair.failureClasses,
      [
        REPLAY_TEST_114859Z_PRESSURE_OR_TIMEOUT,
      ],
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.availability,
      PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.partitionId,
      REPLAY_TEST_114859Z_SQL_WRITE_PARTITION_ID,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.semanticStateId,
      REPLAY_TEST_114859Z_RECOVERING_IN_FLIGHT,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.currentOwner,
      REPLAY_TEST_114859Z_OPERATION_WORKFLOW_OWNER,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.blockingBoundary,
      REPLAY_TEST_114859Z_WORKFLOW_PROGRESS_BOUNDARY,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.waitMode,
      REPLAY_TEST_114859Z_EVENT_DRIVEN_WAIT_MODE,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.nextRequiredAction,
      REPLAY_TEST_114859Z_WAIT_FOR_OPERATION_PROGRESS,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.actuationState,
      REPLAY_TEST_114859Z_PERSISTED_NOT_DISPATCHED,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.workflowProgressPhaseId,
      REPLAY_TEST_114859Z_DISPATCH_PENDING,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.latestOperationWorkflowStep,
      REPLAY_TEST_114859Z_WORKFLOW_STEP_PENDING,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.latestOperationStatus,
      REPLAY_TEST_114859Z_OPERATION_STATUS_PENDING,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.operationId,
      REPLAY_TEST_114859Z_SQL_WRITE_OPERATION_ID,
    );
    assert.equal(
      replaySummary.supportingPriorityRecoveryWitness.correlationKey,
      REPLAY_TEST_114859Z_CORRELATION_KEY,
    );
  });
});
