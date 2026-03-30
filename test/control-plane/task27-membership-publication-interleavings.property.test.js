import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  MEMBERSHIP_PUBLICATION_STATUS,
  acknowledgeMembershipPublication,
  buildMembershipPublicationRow,
  deriveMembershipPublicationCandidate,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

const NUM_RUNS = 10;
const MIN_SEQUENCE_LENGTH = 5;
const MAX_SEQUENCE_LENGTH = 40;
const INITIAL_NOW_MS = 1_000;
const PUBLISHER_NODE_ID = 'node-1';
const EMPTY_LENGTH = 0;
const REQUIRED_DISTINCT_NODE_COUNT = 3;
const DEFAULT_PUBLICATION_EPOCH = 7;
const ACK_BASE_NOW_MS = 10_000;

const NODE_IDS = Object.freeze([
  'node-1',
  'node-2',
  'node-3',
  'node-4',
]);

const PRIORITY_TABLE_IDS = Object.freeze([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
]);

const PRIORITY_PARTITION_IDS = Object.freeze(
  PRIORITY_TABLE_IDS.map((tableId) => `${tableId}-p1`),
);

const EVENT_TYPE = Object.freeze({
  JOIN: 'join',
  REBALANCE: 'rebalance',
  PUBLISH: 'publish',
  ACK: 'ack',
});

function uniqueSorted(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > EMPTY_LENGTH),
  )].sort();
}

function toRequiredAckNodeIds(publicationRow = null) {
  return uniqueSorted(
    publicationRow?.required_ack_node_ids ??
      publicationRow?.requiredAckNodeIds,
  );
}

function toAcknowledgedNodeIds(publicationRow = null) {
  return uniqueSorted(
    publicationRow?.acknowledged_node_ids ??
      publicationRow?.acknowledgedNodeIds,
  );
}

function toPublishedActiveNodeIds(publicationRow = null) {
  return uniqueSorted(
    publicationRow?.published_active_node_ids ??
      publicationRow?.publishedActiveNodeIds,
  );
}

function toPublicationStatus(publicationRow = null) {
  return String(
    publicationRow?.status ?? publicationRow?.publicationStatus ?? '',
  ).toUpperCase();
}

function nextNowMs(state) {
  state.nowMs += 1;
  return state.nowMs;
}

function buildReadinessEntry(nodeId, options = {}) {
  return {
    nodeId,
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
        options.clusterMemberHealthy !== false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
        options.controlPlaneWritable !== false,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
        options.repairEligible !== false,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
        options.serveEligible !== false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]:
        options.controlPlanePublished === true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
        options.controlPlaneRecoveryEligible === true,
    },
    reasons: [],
  };
}

function buildPriorityPartitionRows() {
  return PRIORITY_PARTITION_IDS.map((partitionId, index) => ({
    partition_id: partitionId,
    table_id: PRIORITY_TABLE_IDS[index],
  }));
}

function buildServiceRow(partitionId, nodeId, replicaOrdinal = 1, raftRole = RAFT_ROLE.FOLLOWER) {
  return {
    service_id: `${partitionId}-r${replicaOrdinal}-${nodeId}`,
    partition_id: partitionId,
    service_type: SERVICE_TYPE.PARTITION,
    status: SERVICE_STATUS.ACTIVE,
    raft_role: raftRole,
    address: `partition://${partitionId}/${nodeId}`,
    node_id: nodeId,
  };
}

function initializeState() {
  const seedNodeId = NODE_IDS[0];
  const partitionRows = buildPriorityPartitionRows();
  const serviceRows = PRIORITY_PARTITION_IDS.map((partitionId) =>
    buildServiceRow(partitionId, seedNodeId, 1, RAFT_ROLE.LEADER),
  );
  const nodeRows = [{node_id: seedNodeId, status: 'active'}];
  const readinessEntries = [buildReadinessEntry(seedNodeId, {
    controlPlanePublished: true,
    controlPlaneRecoveryEligible: false,
  })];

  const initialCandidate = deriveMembershipPublicationCandidate({
    latestPublicationRow: null,
    latestPublishedPublicationRow: null,
    nodeRows,
    serviceRows,
    partitionRows,
    readinessEntries,
    publisherNodeId: seedNodeId,
    nowMs: INITIAL_NOW_MS,
  });
  const initialPublishedCandidate = {
    ...initialCandidate,
    acknowledgedNodeIds: uniqueSorted(initialCandidate.requiredAckNodeIds),
  };
  const initialPublishedRow = buildMembershipPublicationRow({
    candidate: initialPublishedCandidate,
    nowMs: INITIAL_NOW_MS,
    status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
  });

  return {
    nowMs: INITIAL_NOW_MS,
    nodeRows,
    serviceRows,
    partitionRows,
    readinessEntries,
    latestPublicationRow: initialPublishedRow,
    latestPublishedPublicationRow: initialPublishedRow,
    lastDerivedCandidate: initialPublishedCandidate,
    observedPublicationEpoch: Number(initialPublishedRow.publication_epoch),
  };
}

function ensureJoined(state, nodeId) {
  const normalizedNodeId = String(nodeId || '').trim();
  if (normalizedNodeId.length === EMPTY_LENGTH) {
    return;
  }
  if (!state.nodeRows.some((row) => row.node_id === normalizedNodeId)) {
    state.nodeRows.push({
      node_id: normalizedNodeId,
      status: 'active',
    });
  }
  const readinessIndex = state.readinessEntries.findIndex(
    (entry) => entry.nodeId === normalizedNodeId,
  );
  const readinessEntry = buildReadinessEntry(normalizedNodeId, {
    controlPlanePublished: false,
    controlPlaneRecoveryEligible: true,
  });
  if (readinessIndex >= 0) {
    state.readinessEntries[readinessIndex] = readinessEntry;
  } else {
    state.readinessEntries.push(readinessEntry);
  }
}

function ensureRebalancedReplica(state, partitionId, nodeId) {
  ensureJoined(state, nodeId);
  const normalizedPartitionId = String(partitionId || '').trim();
  const normalizedNodeId = String(nodeId || '').trim();
  if (normalizedPartitionId.length === EMPTY_LENGTH ||
      normalizedNodeId.length === EMPTY_LENGTH) {
    return;
  }
  const existingReplicaCount = state.serviceRows.filter((row) =>
    row.partition_id === normalizedPartitionId &&
      row.node_id === normalizedNodeId,
  ).length;
  if (existingReplicaCount > EMPTY_LENGTH) {
    return;
  }
  state.serviceRows.push(
    buildServiceRow(
      normalizedPartitionId,
      normalizedNodeId,
      existingReplicaCount + 2,
      RAFT_ROLE.FOLLOWER,
    ),
  );
}

function deriveAndPublish(state) {
  const candidate = deriveMembershipPublicationCandidate({
    latestPublicationRow: state.latestPublicationRow,
    latestPublishedPublicationRow: state.latestPublishedPublicationRow,
    nodeRows: state.nodeRows,
    serviceRows: state.serviceRows,
    partitionRows: state.partitionRows,
    readinessEntries: state.readinessEntries,
    publisherNodeId: PUBLISHER_NODE_ID,
    nowMs: nextNowMs(state),
  });
  state.lastDerivedCandidate = candidate;
  if (candidate.changed !== true && candidate.priorityPartitionSummaryChanged !== true) {
    return;
  }
  state.latestPublicationRow = buildMembershipPublicationRow({
    candidate,
    nowMs: nextNowMs(state),
  });
}

function acknowledgeNode(state, nodeId) {
  if (!state.latestPublicationRow) {
    return;
  }
  const publicationStatus = toPublicationStatus(state.latestPublicationRow);
  if (publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ||
      publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED ||
      publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED) {
    return;
  }
  state.latestPublicationRow = acknowledgeMembershipPublication({
    publicationRow: state.latestPublicationRow,
    nodeId,
    nowMs: nextNowMs(state),
  });
  if (toPublicationStatus(state.latestPublicationRow) ===
      MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED) {
    state.latestPublishedPublicationRow = state.latestPublicationRow;
  }
}

function assertStateInvariants(state) {
  const publicationRow = state.latestPublicationRow;
  if (!publicationRow) {
    return;
  }

  const publicationEpoch = Number(
    publicationRow.publication_epoch ?? publicationRow.publicationEpoch,
  );
  assert.ok(
    Number.isInteger(publicationEpoch) && publicationEpoch >= state.observedPublicationEpoch,
    'publication epoch must remain monotonic across interleavings',
  );
  state.observedPublicationEpoch = publicationEpoch;

  const requiredAckNodeIds = toRequiredAckNodeIds(publicationRow);
  const acknowledgedNodeIds = toAcknowledgedNodeIds(publicationRow);
  assert.deepEqual(
    acknowledgedNodeIds,
    uniqueSorted(acknowledgedNodeIds),
    'acknowledgement IDs must stay deduplicated and sorted',
  );
  for (const nodeId of acknowledgedNodeIds) {
    assert.ok(
      requiredAckNodeIds.includes(nodeId),
      'acknowledged node IDs must stay within required ack set',
    );
  }

  const publicationStatus = toPublicationStatus(publicationRow);
  if (publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED) {
    assert.deepEqual(
      acknowledgedNodeIds,
      requiredAckNodeIds,
      'published status requires a fully acknowledged required ack set',
    );
    assert.deepEqual(
      toPublishedActiveNodeIds(publicationRow),
      requiredAckNodeIds,
      'published active-node IDs must match required ack node IDs',
    );
  }

  const summary = state.lastDerivedCandidate?.priorityPartitionSummary;
  if (!summary || typeof summary !== 'object') {
    return;
  }
  assert.ok(
    Number(summary.requiredDistinctNodeCount) >= EMPTY_LENGTH,
    'priority summary required distinct count must be non-negative',
  );
  assert.ok(
    Number(summary.readyEligibleNodeCount) >= EMPTY_LENGTH,
    'priority summary ready-eligible node count must be non-negative',
  );
  assert.ok(
    Array.isArray(summary.missingPartitionIds),
    'priority summary missing partitions must be an array',
  );
  for (const partitionId of summary.missingPartitionIds) {
    assert.ok(
      PRIORITY_PARTITION_IDS.includes(String(partitionId)),
      'priority summary should only report known priority control-plane partitions',
    );
  }
}

function applyEvent(state, event) {
  const eventType = String(event?.type || '').trim();
  const nodeId = String(event?.nodeId || '').trim();
  const partitionId = String(event?.partitionId || '').trim();
  if (eventType === EVENT_TYPE.JOIN) {
    ensureJoined(state, nodeId);
    return;
  }
  if (eventType === EVENT_TYPE.REBALANCE) {
    ensureRebalancedReplica(state, partitionId, nodeId);
    return;
  }
  if (eventType === EVENT_TYPE.PUBLISH) {
    deriveAndPublish(state);
    return;
  }
  if (eventType === EVENT_TYPE.ACK) {
    acknowledgeNode(state, nodeId);
  }
}

function applyAcks(publicationRow, acknowledgements = []) {
  let row = publicationRow;
  let nowMs = ACK_BASE_NOW_MS;
  for (const nodeId of acknowledgements) {
    row = acknowledgeMembershipPublication({
      publicationRow: row,
      nodeId,
      nowMs,
    });
    nowMs += 1;
  }
  return row;
}

const eventArbitrary = fc.oneof(
  fc.record({
    type: fc.constant(EVENT_TYPE.JOIN),
    nodeId: fc.constantFrom(...NODE_IDS),
  }),
  fc.record({
    type: fc.constant(EVENT_TYPE.REBALANCE),
    partitionId: fc.constantFrom(...PRIORITY_PARTITION_IDS),
    nodeId: fc.constantFrom(...NODE_IDS),
  }),
  fc.record({
    type: fc.constant(EVENT_TYPE.PUBLISH),
  }),
  fc.record({
    type: fc.constant(EVENT_TYPE.ACK),
    nodeId: fc.constantFrom(...NODE_IDS),
  }),
);

test(
  'task-27 property: join/ack/publish/rebalance interleavings keep publication invariants stable',
  async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(eventArbitrary, {
          minLength: MIN_SEQUENCE_LENGTH,
          maxLength: MAX_SEQUENCE_LENGTH,
        }).filter((events) => {
          const eventTypes = new Set(events.map((event) => event.type));
          return eventTypes.has(EVENT_TYPE.JOIN) &&
            eventTypes.has(EVENT_TYPE.REBALANCE) &&
            eventTypes.has(EVENT_TYPE.PUBLISH) &&
            eventTypes.has(EVENT_TYPE.ACK);
        }),
        async (events) => {
          const state = initializeState();
          for (const event of events) {
            applyEvent(state, event);
            assertStateInvariants(state);
          }
        },
      ),
      {numRuns: NUM_RUNS},
    );
  },
);

test(
  'task-27 property: ack duplication/reordering converges to one published ack set',
  async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.constantFrom(...NODE_IDS), {
          minLength: 1,
          maxLength: NODE_IDS.length,
        }),
        fc.array(fc.constantFrom(...NODE_IDS), {
          minLength: 1,
          maxLength: MAX_SEQUENCE_LENGTH,
        }),
        async (requiredAckNodeIds, ackSequence) => {
          const baseRow = buildMembershipPublicationRow({
            candidate: {
              publicationKind: 'cluster_membership',
              publicationEpoch: DEFAULT_PUBLICATION_EPOCH,
              publisherNodeId: PUBLISHER_NODE_ID,
              publishedActiveNodeIds: requiredAckNodeIds,
              requiredAckNodeIds,
              acknowledgedNodeIds: [],
              reasonCode: 'property_interleaving',
            },
            nowMs: ACK_BASE_NOW_MS,
            status: MEMBERSHIP_PUBLICATION_STATUS.ACK_PENDING,
          });
          const forward = applyAcks(baseRow, ackSequence);
          const reversed = applyAcks(baseRow, [...ackSequence].reverse());
          const expectedAckNodeIds = uniqueSorted(
            ackSequence.filter((nodeId) => requiredAckNodeIds.includes(nodeId)),
          );
          const expectedPublished =
            expectedAckNodeIds.length === requiredAckNodeIds.length;
          assert.deepEqual(
            toAcknowledgedNodeIds(forward),
            expectedAckNodeIds,
            'forward ack sequence should converge to deduplicated required ack set',
          );
          assert.deepEqual(
            toAcknowledgedNodeIds(reversed),
            expectedAckNodeIds,
            'reordered ack sequence should converge to the same deduplicated set',
          );
          assert.equal(
            toPublicationStatus(forward) === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
            expectedPublished,
            'forward ack sequence publish status should match required-ack closure',
          );
          assert.equal(
            toPublicationStatus(reversed) === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
            expectedPublished,
            'reordered ack sequence publish status should match required-ack closure',
          );
        },
      ),
      {numRuns: NUM_RUNS},
    );
  },
);

test(
  'task-27 property: rebalance spread events preserve bounded priority spread invariants',
  async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          partitionId: fc.constantFrom(...PRIORITY_PARTITION_IDS),
          nodeId: fc.constantFrom(...NODE_IDS),
        }), {
          minLength: 1,
          maxLength: MAX_SEQUENCE_LENGTH,
        }),
        async (rebalanceEvents) => {
          const state = initializeState();
          for (const event of rebalanceEvents) {
            applyEvent(state, {
              type: EVENT_TYPE.REBALANCE,
              partitionId: event.partitionId,
              nodeId: event.nodeId,
            });
          }
          applyEvent(state, {type: EVENT_TYPE.PUBLISH});
          const summary = state.lastDerivedCandidate?.priorityPartitionSummary;
          assert.ok(summary && typeof summary === 'object');
          assert.ok(
            Number(summary.requiredDistinctNodeCount) <=
              Math.min(REQUIRED_DISTINCT_NODE_COUNT, NODE_IDS.length),
            'required distinct-node count must stay bounded by configured recovery threshold',
          );
          assert.ok(
            Number(summary.blockedPartitionCount ?? summary.missingPartitionIds.length) >=
              EMPTY_LENGTH,
            'blocked priority partition count must stay non-negative',
          );
        },
      ),
      {numRuns: NUM_RUNS},
    );
  },
);
