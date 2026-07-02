import {test} from '../../src/test-helpers/tap.js';
import {
  acknowledgeMembershipPublication,
  buildMembershipPublicationRow,
  deriveMembershipPublicationCandidate,
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  MEMBERSHIP_LIFECYCLE_STATE,
  isValidMembershipLifecycleTransition,
} from '../../src/control-plane/membership-lifecycle-constants.js';
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
} from '../../src/rebalancer/replica-operation-repository.js';
import {TABLES} from '../../src/constants/index.js';
import {ControlPlanePublicationsOwner} from
  '../../src/control-plane/owners/control-plane-publications-owner.js';
import {registerMembershipPublicationCoordinatorTailTests} from './membership-publication-coordinator-tail-test-cases.js';
import {
  MEMBERSHIP_PUBLICATION_ADMISSION_REASON_CLUSTER_INTEGRITY,
  MEMBERSHIP_PUBLICATION_ADMISSION_STATE_BLOCKED,
  MEMBERSHIP_PUBLICATION_BLOCKED_FENCE,
  MEMBERSHIP_PUBLICATION_RECONCILE_ACTIVE_GATE_NODE_IDS,
  MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
  MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_ROWS,
  MEMBERSHIP_PUBLICATION_RECONCILE_LIFECYCLE_ASSERTION,
  MEMBERSHIP_PUBLICATION_RECONCILE_MISSING_RECOVERY_NODE_IDS,
  MEMBERSHIP_PUBLICATION_RECONCILE_NOW_MS,
  MEMBERSHIP_PUBLICATION_RECONCILE_PERSIST_ASSERTION,
  MEMBERSHIP_PUBLICATION_RECONCILE_PUBLICATION_EPOCH,
  MEMBERSHIP_PUBLICATION_RECONCILE_READINESS_ASSERTION,
  MEMBERSHIP_PUBLICATION_RECONCILE_RECOVERY_ACTIVE_SOURCE,
  MEMBERSHIP_PUBLICATION_RECONCILE_ROW_ASSERTION,
  MEMBERSHIP_PUBLICATION_RECONCILE_TARGET_ASSERTION,
  MEMBERSHIP_PUBLICATION_RECONCILE_TEST_NAME,
  MEMBERSHIP_PUBLICATION_TRIM_NODE_ONE_ID,
  MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED,
  buildMembershipPublicationReconcileBaselineRow,
  buildMembershipPublicationTrimNodeRow,
  buildMembershipPublicationTrimReadinessEntry,
  buildMembershipPublicationTrimServiceRow,
} from './membership-publication-coordinator-candidate-fixtures.js';

test('deriveMembershipPublicationCandidate keeps the latest in-flight publication membership as a convergence floor',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 11,
        status: 'ACK_PENDING',
        published_active_node_ids: [
          'node-1',
          'node-2',
          'node-3',
          'node-4',
          'node-5',
        ],
        required_ack_node_ids: [
          'node-1',
          'node-2',
          'node-3',
          'node-4',
          'node-5',
        ],
        acknowledged_node_ids: ['node-1', 'node-2'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 10,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-4',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-5',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
          },
        },
        {
          nodeId: 'node-4',
          dimensions: {
            clusterMemberHealthy: false,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
          },
        },
        {
          nodeId: 'node-5',
          dimensions: {
            clusterMemberHealthy: false,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
        {
          endpoint_id: 'node-4-ws',
          node_id: 'node-4',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-4:8082',
        },
        {
          endpoint_id: 'node-5-ws',
          node_id: 'node-5',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-5:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
        {service_id: 'svc-4', node_id: 'node-4', status: 'active'},
        {service_id: 'svc-5', node_id: 'node-5', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
      'open/ack-pending publication membership should remain the baseline floor during convergence',
    );
    t.same(
      candidate.requiredAckNodeIds,
      ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
      'ack requirement should remain aligned with the in-flight publication baseline',
    );
    t.equal(
      candidate.changed,
      false,
      'transient projection regressions should not reopen the epoch with a narrower membership set',
    );
    t.equal(
      candidate.publicationEpoch,
      11,
      'stable convergence floors should keep the current publication epoch until acknowledgements close it',
    );
  });

test('deriveMembershipPublicationCandidate excludes an admission-blocked publisher from the next published cohort',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      planningSnapshot: {
        publisherNodeId: 'node-3',
        targetNodeId: 'node-3',
        admissionState: MEMBERSHIP_PUBLICATION_ADMISSION_STATE_BLOCKED,
        admissionReasonCodes: [
          MEMBERSHIP_PUBLICATION_ADMISSION_REASON_CLUSTER_INTEGRITY,
        ],
        clusterIncarnationFence: MEMBERSHIP_PUBLICATION_BLOCKED_FENCE,
        latestPublishedPublicationRow: {
          publication_epoch: 30,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1', 'node-2', 'node-3'],
          required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
          acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        },
        latestPublicationRow: {
          publication_epoch: 30,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1', 'node-2', 'node-3'],
          required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
          acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        },
        nodeRows: [
          {
            node_id: 'node-1',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 6000,
          },
          {
            node_id: 'node-2',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 6000,
          },
          {
            node_id: 'node-3',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 6000,
          },
        ],
        readinessEntries: [
          {nodeId: 'node-1', dimensions: {clusterMemberHealthy: true}},
          {nodeId: 'node-2', dimensions: {clusterMemberHealthy: true}},
          {nodeId: 'node-3', dimensions: {clusterMemberHealthy: true}},
        ],
        nodeEndpointRows: [
          {
            endpoint_id: 'node-1-ws',
            node_id: 'node-1',
            transport_type: 'ws',
            status: 'active',
            address: 'ws://node-1:8082',
          },
          {
            endpoint_id: 'node-2-ws',
            node_id: 'node-2',
            transport_type: 'ws',
            status: 'active',
            address: 'ws://node-2:8082',
          },
          {
            endpoint_id: 'node-3-ws',
            node_id: 'node-3',
            transport_type: 'ws',
            status: 'active',
            address: 'ws://node-3:8082',
          },
        ],
        serviceRows: [
          {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
          {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
          {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
        ],
        nowMs: 1000,
      },
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'the next publication cohort should be rebuilt from admitted participation rather than the stale published baseline',
    );
    t.match(
      candidate.targetParticipation,
      {
        nodeId: 'node-3',
        admissionState: MEMBERSHIP_PUBLICATION_ADMISSION_STATE_BLOCKED,
        admitted: false,
        admissionReasonCodes: [
          MEMBERSHIP_PUBLICATION_ADMISSION_REASON_CLUSTER_INTEGRITY,
        ],
      },
      'the candidate should retain explicit admission evidence for the blocked target node',
    );
    t.match(
      candidate.membershipLifecycleSummary?.participationByNodeId,
      {
        'node-3': {
          admissionState: MEMBERSHIP_PUBLICATION_ADMISSION_STATE_BLOCKED,
          admitted: false,
        },
      },
      'the persisted lifecycle summary should carry the admitted-participation cutover state',
    );
  });

test('MembershipPublicationCoordinator reuses startup-owned admission evidence from the readiness planning answer',
  async (t) => {
    const nodeId = 'node-3';
    const readinessService = new ControlPlaneReadinessService({
      nodeId,
      systemTableCache: {
        get() {
          return null;
        },
        getAll() {
          return [];
        },
        filter() {
          return [];
        },
        onCacheChange() {},
      },
      getLocalClusterIncarnationFence: () =>
        MEMBERSHIP_PUBLICATION_BLOCKED_FENCE,
      membershipPublicationService: {
        async getLatestPublicationForNode(targetNodeId) {
          if (targetNodeId !== nodeId) {
            return null;
          }
          return {
            publicationEpoch: 30,
            status: 'PUBLISHED',
            createdAt: 900,
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
            acknowledgedNodeIds: ['node-1', 'node-2', 'node-3'],
          };
        },
        getLatestPublicationForNodeSync(targetNodeId) {
          if (targetNodeId !== nodeId) {
            return null;
          }
          return {
            publicationEpoch: 30,
            status: 'PUBLISHED',
            createdAt: 900,
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
            acknowledgedNodeIds: ['node-1', 'node-2', 'node-3'],
          };
        },
      },
      now: () => 1000,
    });
    const coordinator = new MembershipPublicationCoordinator({
      nodeId,
      controlPlaneReadinessService: readinessService,
      now: () => 1000,
    });

    const candidate = await coordinator.deriveClusterMembershipCandidate({
      publisherNodeId: nodeId,
      latestPublishedPublicationRow: {
        publication_epoch: 30,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
      },
      latestPublicationRow: {
        publication_epoch: 30,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 6000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 6000,
        },
        {
          node_id: nodeId,
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 6000,
        },
      ],
      readinessEntries: [
        {nodeId: 'node-1', dimensions: {clusterMemberHealthy: true}},
        {nodeId: 'node-2', dimensions: {clusterMemberHealthy: true}},
        {nodeId, dimensions: {clusterMemberHealthy: true}},
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: nodeId,
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: nodeId, status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'nested planning reads should exclude the blocked local node from the next publication cohort',
    );
    t.equal(
      candidate.admissionState,
      MEMBERSHIP_PUBLICATION_ADMISSION_STATE_BLOCKED,
      'the publication candidate should preserve the readiness-owned admission state',
    );
    t.same(
      candidate.admissionReasonCodes,
      [MEMBERSHIP_PUBLICATION_ADMISSION_REASON_CLUSTER_INTEGRITY],
      'the publication candidate should preserve the readiness-owned admission reasons',
    );
  });

test('deriveMembershipPublicationCandidate derives the active-node set from authoritative owner rows',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      sourceTopologyEpoch: 12,
      sourceSnapshotVersion: 21,
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {nodeId: 'node-1', dimensions: {clusterMemberHealthy: true}},
        {nodeId: 'node-2', dimensions: {clusterMemberHealthy: true}},
        {nodeId: 'node-3', dimensions: {clusterMemberHealthy: false}},
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'the publication candidate should exclude readiness-unhealthy members even if cache-visible services still exist',
    );
    t.same(
      candidate.requiredAckNodeIds,
      ['node-1', 'node-2'],
      'the acknowledgement set should match the published active-node set for cluster membership publication',
    );
  });

test('deriveMembershipPublicationCandidate carries forward overlapping ' +
  'durable acknowledgements when reopening a wider membership epoch',
async (t) => {
  const REOPEN_PUBLICATION_EPOCH = 13;
  const REOPEN_PUBLICATION_NOW_MS = 1000;
  const candidate = deriveMembershipPublicationCandidate({
    publisherNodeId: 'seed-node',
    sourceTopologyEpoch: 13,
    sourceSnapshotVersion: 22,
    latestPublicationRow: {
      publication_epoch: 12,
      status: 'PUBLISHED',
      published_active_node_ids: ['node-1', 'node-2'],
      required_ack_node_ids: ['node-1', 'node-2'],
      acknowledged_node_ids: ['node-1', 'node-2'],
    },
    nodeRows: [
      {
        node_id: 'node-1',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 5000,
      },
      {
        node_id: 'node-2',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 5000,
      },
      {
        node_id: 'node-3',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 5000,
      },
    ],
    readinessEntries: [
      {nodeId: 'node-1', dimensions: {clusterMemberHealthy: true}},
      {nodeId: 'node-2', dimensions: {clusterMemberHealthy: true}},
      {nodeId: 'node-3', dimensions: {clusterMemberHealthy: true}},
    ],
    nodeEndpointRows: [
      {
        endpoint_id: 'node-1-ws',
        node_id: 'node-1',
        transport_type: 'ws',
        status: 'active',
        address: 'ws://node-1:8082',
      },
      {
        endpoint_id: 'node-2-ws',
        node_id: 'node-2',
        transport_type: 'ws',
        status: 'active',
        address: 'ws://node-2:8082',
      },
      {
        endpoint_id: 'node-3-ws',
        node_id: 'node-3',
        transport_type: 'ws',
        status: 'active',
        address: 'ws://node-3:8082',
      },
    ],
    serviceRows: [
      {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
      {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
    ],
    nowMs: REOPEN_PUBLICATION_NOW_MS,
  });

  t.equal(
    candidate.publicationEpoch,
    REOPEN_PUBLICATION_EPOCH,
    'widened membership should still advance to the next publication epoch',
  );
  t.same(
    candidate.requiredAckNodeIds,
    ['node-1', 'node-2', 'node-3'],
    'the widened publication should require acknowledgement from the full new membership',
  );
  t.same(
    candidate.acknowledgedNodeIds,
    ['node-1', 'node-2'],
    'durably acknowledged overlap should carry forward into the reopened epoch',
  );

  const publicationRow = buildMembershipPublicationRow({
    candidate,
    nowMs: REOPEN_PUBLICATION_NOW_MS + 1,
  });

  t.match(
    publicationRow,
    {
      status: 'OPEN',
      required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
      acknowledged_node_ids: ['node-1', 'node-2'],
    },
    'the reopened durable row should preserve overlapping acknowledgements while waiting for the new node',
  );
});

test(MEMBERSHIP_PUBLICATION_RECONCILE_TEST_NAME, async (t) => {
  const latestPublicationRow = buildMembershipPublicationReconcileBaselineRow();
  const persistedRows = [];
  const readinessProbeNodeIds = [];
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: MEMBERSHIP_PUBLICATION_TRIM_NODE_ONE_ID,
    controlPlanePublicationsOwner: {
      async listPublications() {
        return {rows: [latestPublicationRow]};
      },
      async upsertPublication(row) {
        persistedRows.push(row);
      },
    },
    controlPlaneReadinessService: {
      async getAllNodeReadiness() {
        const readinessEntries =
          MEMBERSHIP_PUBLICATION_RECONCILE_ACTIVE_GATE_NODE_IDS.map(
            buildMembershipPublicationTrimReadinessEntry,
          );
        readinessProbeNodeIds.push(
          ...readinessEntries.map((entry) => entry.nodeId),
        );
        return readinessEntries;
      },
      getRecoveryEpochHistoryByNodeId() {
        return {};
      },
      messageRouter: {
        getConnectedNodes() {
          return MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_ROWS;
        },
      },
    },
    systemTableCache: {
      getAll(tableName) {
        if (tableName === TABLES.NODES) {
          return MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS.map(
            buildMembershipPublicationTrimNodeRow,
          );
        }
        if (tableName === TABLES.SERVICES) {
          return MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS.map(
            buildMembershipPublicationTrimServiceRow,
          );
        }
        if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
          return [latestPublicationRow];
        }
        return MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_ROWS;
      },
    },
    now: () => MEMBERSHIP_PUBLICATION_RECONCILE_NOW_MS,
  });

  const result = await coordinator.reconcileClusterMembership();

  t.same(
    readinessProbeNodeIds,
    MEMBERSHIP_PUBLICATION_RECONCILE_ACTIVE_GATE_NODE_IDS,
    MEMBERSHIP_PUBLICATION_RECONCILE_READINESS_ASSERTION,
  );
  t.match(
    result.candidate,
    {
      publicationEpoch: MEMBERSHIP_PUBLICATION_RECONCILE_PUBLICATION_EPOCH,
      publicationStatus: MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED,
      publishedActiveNodeIds:
        MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
      projectedServingNodeIds:
        MEMBERSHIP_PUBLICATION_RECONCILE_ACTIVE_GATE_NODE_IDS,
      locallyEligibleNodeIds:
        MEMBERSHIP_PUBLICATION_RECONCILE_ACTIVE_GATE_NODE_IDS,
      recoveryActiveNodeIds:
        MEMBERSHIP_PUBLICATION_RECONCILE_ACTIVE_GATE_NODE_IDS,
      recoveryActiveNodeSource:
        MEMBERSHIP_PUBLICATION_RECONCILE_RECOVERY_ACTIVE_SOURCE,
      missingPublishedRecoveryActiveNodeIds:
        MEMBERSHIP_PUBLICATION_RECONCILE_MISSING_RECOVERY_NODE_IDS,
      changed: false,
      priorityPartitionSummaryChanged: false,
    },
    MEMBERSHIP_PUBLICATION_RECONCILE_TARGET_ASSERTION,
  );
  t.equal(
    persistedRows.length,
    1,
    MEMBERSHIP_PUBLICATION_RECONCILE_PERSIST_ASSERTION,
  );
  t.match(
    persistedRows[0],
    {
      publication_epoch: MEMBERSHIP_PUBLICATION_RECONCILE_PUBLICATION_EPOCH,
      status: MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED,
      published_active_node_ids:
        MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
      membership_lifecycle_summary: {
        publishedActiveNodeIds:
          MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
        projectedServingNodeIds:
          MEMBERSHIP_PUBLICATION_RECONCILE_ACTIVE_GATE_NODE_IDS,
        locallyEligibleNodeIds:
          MEMBERSHIP_PUBLICATION_RECONCILE_ACTIVE_GATE_NODE_IDS,
        recoveryActiveNodeIds:
          MEMBERSHIP_PUBLICATION_RECONCILE_ACTIVE_GATE_NODE_IDS,
        recoveryActiveNodeSource:
          MEMBERSHIP_PUBLICATION_RECONCILE_RECOVERY_ACTIVE_SOURCE,
        missingPublishedRecoveryActiveNodeIds:
          MEMBERSHIP_PUBLICATION_RECONCILE_MISSING_RECOVERY_NODE_IDS,
      },
    },
    MEMBERSHIP_PUBLICATION_RECONCILE_LIFECYCLE_ASSERTION,
  );
  t.match(
    result.publicationRow,
    {
      publicationEpoch: MEMBERSHIP_PUBLICATION_RECONCILE_PUBLICATION_EPOCH,
      status: MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED,
      publishedActiveNodeIds:
        MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
      membershipLifecycleSummary: {
        publishedActiveNodeIds:
          MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
        projectedServingNodeIds:
          MEMBERSHIP_PUBLICATION_RECONCILE_ACTIVE_GATE_NODE_IDS,
        recoveryActiveNodeIds:
          MEMBERSHIP_PUBLICATION_RECONCILE_ACTIVE_GATE_NODE_IDS,
      },
    },
    MEMBERSHIP_PUBLICATION_RECONCILE_ROW_ASSERTION,
  );
});

registerMembershipPublicationCoordinatorTailTests({
  test,
  acknowledgeMembershipPublication,
  buildMembershipPublicationRow,
  deriveMembershipPublicationCandidate,
  MembershipPublicationCoordinator,
  MEMBERSHIP_LIFECYCLE_STATE,
  isValidMembershipLifecycleTransition,
  ControlPlaneReadinessService,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ControlPlanePublicationsOwner,
});
