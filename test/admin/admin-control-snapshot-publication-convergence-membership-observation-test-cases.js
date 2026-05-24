import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  buildCanonicalPublicationRecoveryEvidence,
} from '../../src/control-plane/publication-recovery-evidence.js';
import * as ACTIVE_GATE_SNAPSHOT_TEST_STATE from './admin-control-snapshot-active-gate-fixture-state.js';


test('AdminControlSnapshot resolves active nodes from published membership only', async (t) => {
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
  });

  const activeNodeIds = snapshot.resolveControlSnapshotActiveNodeIds(
    [
      {
        node_id: 'node-1',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
      {
        node_id: 'node-2',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
    ],
    [
      {
        service_id: 'svc-1',
        node_id: 'node-1',
        status: 'active',
      },
      {
        service_id: 'svc-2',
        node_id: 'node-2',
        status: 'active',
      },
    ],
    [
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
    ],
    {
      publicationConvergence: {
        publicationEpoch: 14,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-2'],
      },
      readinessByNodeId: {
        'node-1': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        'node-2': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      },
    },
  );

  t.same(
    activeNodeIds,
    ['node-2'],
    'control snapshots should not fall back to locally derived active nodes when publication exists',
  );
});

test('AdminControlSnapshot resolves heartbeat publication diagnostics through the canonical publication story when available', async (t) => {
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
    controlPlaneReadinessService: {
      getControlPlanePublicationStorySync(nodeId, observedAt) {
        return {
          nodeId,
          observedAt,
          nodeStatePublication: {
            publicationPath: 'node_state_reporter',
            targetNodeId: 'seed-node',
            targetServiceType: 'message_group',
            targetServiceId: 'mg-1-r1',
            consecutiveFailures: 0,
          },
        };
      },
    },
  });

  t.same(
    snapshot.resolveHeartbeatPublicationDiagnostics(),
    {
      publicationPath: 'node_state_reporter',
      targetNodeId: 'seed-node',
      targetServiceType: 'message_group',
      targetServiceId: 'mg-1-r1',
      consecutiveFailures: 0,
    },
    'admin diagnostics should prefer the readiness-owned publication story',
  );
});

test('AdminControlSnapshot includes canonical replica operation rows in the control snapshot summary',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 200,
    });

    const summary = snapshot.buildControlSnapshotReplicaOperationSummary([{
      operation_id: 'replace-1',
      operation_type: 'REPLACE',
      partition_id: 'nodes-p1',
      entity_type: 'partition',
      entity_id: 'nodes-p1',
      source_node_id: 'seed-node',
      target_node_id: 'node-2',
      replica_id: 'nodes-p1-r4',
      status: 'active',
      workflow_step: 'ACTIVE',
      created_at: 100,
      updated_at: 150,
    }], {
      serviceRows: [],
    });

    t.equal(
      summary.inFlightCount,
      1,
      'REPLACE ACTIVE should contribute to the control snapshot in-flight summary',
    );
    t.equal(
      Array.isArray(summary.rows),
      true,
      'control snapshot summaries should expose canonical operation rows for harness diagnostics',
    );
    t.match(
      summary.rows[0],
      {
        operationId: 'replace-1',
        partitionId: 'nodes-p1',
        type: 'REPLACE',
        status: 'active',
        workflowStep: 'ACTIVE',
        sourceNodeId: 'seed-node',
        targetNodeId: 'node-2',
        replicaId: 'nodes-p1-r4',
      },
      'control snapshot summaries should expose one normalized operation record per visible row',
    );
  });

test('AdminControlSnapshot excludes topology-completed REPLACE rows from in-flight counts',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.COMPLETED_REPLACE_CONTROL_SNAPSHOT_FIXTURE.nodeId,
      nowFn: () => ACTIVE_GATE_SNAPSHOT_TEST_STATE.COMPLETED_REPLACE_CONTROL_SNAPSHOT_FIXTURE.nowMs,
    });

    const summary = snapshot.buildControlSnapshotReplicaOperationSummary([
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.COMPLETED_REPLACE_CONTROL_SNAPSHOT_FIXTURE.operation,
    ], {
      serviceRows: ACTIVE_GATE_SNAPSHOT_TEST_STATE.COMPLETED_REPLACE_CONTROL_SNAPSHOT_FIXTURE.serviceRows,
    });

    t.equal(
      summary.inFlightCount,
      0,
      'admin control snapshots should not count completed REPLACE rows as live work',
    );
    t.equal(
      summary.rows.length,
      1,
      'admin control snapshots should keep completed rows visible for diagnostics',
    );
    t.match(
      summary.rows[0],
      {
        operationId:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.COMPLETED_REPLACE_CONTROL_SNAPSHOT_FIXTURE.operation.operation_id,
        sourceReplicaId:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.COMPLETED_REPLACE_CONTROL_SNAPSHOT_FIXTURE
            .operation.source_replica_id,
      },
      'admin control snapshots should expose retired-source evidence on the row',
    );
  });

test('AdminControlSnapshot prefers published membership observation over newer open convergence for active node resolution', async (t) => {
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
  });

  const activeNodeIds = snapshot.resolveControlSnapshotActiveNodeIds(
    [
      {
        node_id: 'node-1',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
      {
        node_id: 'node-2',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
    ],
    [
      {
        service_id: 'svc-1',
        node_id: 'node-1',
        status: 'active',
      },
      {
        service_id: 'svc-2',
        node_id: 'node-2',
        status: 'active',
      },
    ],
    [
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
    ],
    {
      publicationConvergence: {
        publicationEpoch: 14,
        status: 'OPEN',
        publishedActiveNodeIds: ['node-1', 'node-2'],
        requiredAckNodeIds: ['node-1', 'node-2'],
        acknowledgedNodeIds: ['node-1'],
      },
      publishedMembershipObservation: {
        publicationEpoch: 13,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-1', 'node-2'],
        requiredAckNodeIds: ['node-1', 'node-2'],
        acknowledgedNodeIds: ['node-1', 'node-2'],
      },
      readinessByNodeId: {
        'node-1': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        'node-2': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      },
    },
  );

  t.same(
    activeNodeIds,
    ['node-1', 'node-2'],
    'control snapshots should keep using the last published membership while a newer publication is still open',
  );
});

test('AdminControlSnapshot falls back to durable published membership from ack-pending convergence when published observation is unavailable', async (t) => {
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
  });

  const activeNodeViews = snapshot.resolveControlSnapshotNodeViews(
    [
      {
        node_id: 'node-1',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
      {
        node_id: 'node-2',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
      {
        node_id: 'node-3',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
    ],
    [
      {
        service_id: 'svc-1',
        node_id: 'node-1',
        status: 'active',
      },
      {
        service_id: 'svc-2',
        node_id: 'node-2',
        status: 'active',
      },
      {
        service_id: 'svc-3',
        node_id: 'node-3',
        status: 'active',
      },
    ],
    [
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
    {
      publicationConvergence: {
        publicationEpoch: 14,
        status: 'ACK_PENDING',
        publishedActiveNodeIds: ['node-1', 'node-2'],
        requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
        acknowledgedNodeIds: ['node-1', 'node-2'],
      },
      readinessByNodeId: {
        'node-1': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        'node-2': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        'node-3': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      },
    },
  );

  t.same(
    activeNodeViews.authoritativeActiveNodeIds,
    ['node-1', 'node-2'],
    'control snapshots should retain the durable published membership while the latest epoch is ack-pending',
  );
  t.same(
    activeNodeViews.projectedActiveNodeIds,
    ['node-1', 'node-2', 'node-3'],
    'control snapshots should still expose the wider local projection separately',
  );
  t.equal(
    activeNodeViews.publishedMembershipAvailable,
    true,
    'control snapshots should preserve published-membership availability from ack-pending convergence when the durable set is known',
  );
});

test('AdminControlSnapshot exposes separate published and projected node views', async (t) => {
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
  });

  const activeNodeViews = snapshot.resolveControlSnapshotNodeViews(
    [
      {
        node_id: 'node-1',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
      {
        node_id: 'node-2',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
    ],
    [
      {
        service_id: 'svc-1',
        node_id: 'node-1',
        status: 'active',
      },
      {
        service_id: 'svc-2',
        node_id: 'node-2',
        status: 'active',
      },
    ],
    [
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
    ],
    {
      publishedMembershipObservation: {
        publicationEpoch: 14,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-2'],
      },
      readinessByNodeId: {
        'node-1': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        'node-2': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      },
    },
  );

  t.same(
    activeNodeViews,
    {
      authoritativeSource: 'published_membership',
      authoritativeActiveNodeIds: ['node-2'],
      projectedServingNodeIds: ['node-1', 'node-2'],
      locallyEligibleNodeIds: ['node-1', 'node-2'],
      suspectedOrTransitioningNodeIds: ['node-1'],
      membershipFreeze: {
        active: false,
        reasonCode: null,
        retainedPublishedNodeIds: ['node-2'],
        missingProjectedNodeIds: [],
        unconfirmedProjectedNodeIds: ['node-1'],
      },
      effectiveSource: 'published_membership',
      effectiveActiveNodeIds: ['node-2'],
      projectedActiveNodeIds: ['node-1', 'node-2'],
      publishedActiveNodeIds: ['node-2'],
      publishedMembershipAvailable: true,
    },
    'control snapshot node views should preserve both published membership and local projection',
  );
});

test('AdminControlSnapshot uses observed membership publication when readiness entries lag publication metadata', async (t) => {
  const nodeRows = [
    {
      node_id: 'node-1',
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: 2000,
    },
    {
      node_id: 'node-2',
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: 2000,
    },
  ];
  const serviceRows = [
    {
      service_id: 'svc-1',
      node_id: 'node-1',
      status: 'active',
    },
    {
      service_id: 'svc-2',
      node_id: 'node-2',
      status: 'active',
    },
  ];
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
    systemTableCache: {
      getAll(tableName) {
        if (tableName === TABLES.NODES) {
          return nodeRows;
        }
        if (tableName === TABLES.SERVICES) {
          return serviceRows;
        }
        return [];
      },
    },
    controlPlaneReadinessService: {
      async getAllNodeReadiness() {
        return [{
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        }];
      },
      membershipPublicationService: {
        async getLatestClusterPublication() {
          return {
            publicationEpoch: 7,
            status: 'PUBLISHED',
            publishedActiveNodeIds: ['node-1', 'node-2'],
            requiredAckNodeIds: ['node-1', 'node-2'],
            acknowledgedNodeIds: ['node-1', 'node-2'],
          };
        },
      },
    },
  });

  const result = await snapshot.buildLocalControlSnapshot({
    allowAuthoritativeReadinessRefresh: true,
    allowStaleReadinessOnCacheChange: false,
  });

  t.same(
    result.nodes,
    ['node-1', 'node-2'],
    'observed membership publication should seed control snapshot node coverage when readiness metadata lags',
  );
  t.same(
    result.publishedNodes,
    ['node-1', 'node-2'],
    'control snapshots should expose the published active-node set explicitly',
  );
  t.same(
    result.projectedNodes,
    ['node-1', 'node-2'],
    'control snapshots should also expose the locally projected active-node set',
  );
  t.same(
    result.suspectedOrTransitioningNodes,
    [],
    'control snapshots should expose transitioning or suspected nodes separately from authoritative membership',
  );
  t.same(
    result.controlPlaneDiagnostics.publicationConvergence?.publishedActiveNodeIds,
    ['node-1', 'node-2'],
    'control-plane diagnostics should retain the observed published membership',
  );
  t.same(
    result.controlPlaneDiagnostics.activeNodeViews,
    {
      authoritativeSource: 'published_membership',
      authoritativeNodeIds: ['node-1', 'node-2'],
      projectedServingNodeIds: ['node-1', 'node-2'],
      locallyEligibleNodeIds: ['node-1', 'node-2'],
      suspectedOrTransitioningNodeIds: [],
      membershipFreeze: {
        active: false,
        reasonCode: null,
        retainedPublishedNodeIds: ['node-1', 'node-2'],
        missingProjectedNodeIds: [],
        unconfirmedProjectedNodeIds: [],
      },
      effectiveSource: 'published_membership',
      effectiveNodeIds: ['node-1', 'node-2'],
      projectedNodeIds: ['node-1', 'node-2'],
      publishedNodeIds: ['node-1', 'node-2'],
      publishedMembershipAvailable: true,
    },
    'control-plane diagnostics should report both effective and projected node views',
  );
});

test('AdminControlSnapshot uses repaired publication rows when publication services are unavailable', async (t) => {
  const nodeRows = [
    {
      node_id: 'node-1',
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: 2000,
    },
    {
      node_id: 'node-2',
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: 2000,
    },
  ];
  const serviceRows = [
    {
      service_id: 'svc-1',
      node_id: 'node-1',
      status: 'active',
    },
    {
      service_id: 'svc-2',
      node_id: 'node-2',
      status: 'active',
    },
  ];
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
    systemTableCache: {
      getAll(tableName) {
        if (tableName === TABLES.NODES) {
          return nodeRows;
        }
        if (tableName === TABLES.SERVICES) {
          return serviceRows;
        }
        if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
          return [{
            publication_epoch: 9,
            status: 'PUBLISHED',
            published_active_node_ids: ['node-1', 'node-2'],
          }];
        }
        return [];
      },
    },
  });

  const result = await snapshot.buildLocalControlSnapshot();

  t.same(
    result.nodes,
    ['node-1', 'node-2'],
    'repaired publication rows should seed control snapshot node coverage even without readiness publication metadata',
  );
  t.same(
    result.publishedNodes,
    ['node-1', 'node-2'],
    'repaired publication rows should populate the explicit published node view',
  );
  t.same(
    result.projectedNodes,
    ['node-1', 'node-2'],
    'projected node view should remain available alongside the published node view',
  );
  t.same(
    result.suspectedOrTransitioningNodes,
    [],
    'repaired publication rows should still keep authoritative and projected views separated cleanly',
  );
  t.match(
    result.controlPlaneDiagnostics.publicationConvergence,
    {
      publicationEpoch: 9,
      status: 'PUBLISHED',
      publishedActiveNodeIds: ['node-1', 'node-2'],
    },
    'control-plane diagnostics should surface repaired membership publication convergence when the publication service is unavailable',
  );
  t.match(
    result.controlPlaneDiagnostics.publishedMembershipObservation,
    {
      publicationEpoch: 9,
      status: 'PUBLISHED',
      publishedActiveNodeIds: ['node-1', 'node-2'],
    },
    'published membership observation should also fall back to repaired publication rows when the publication service is unavailable',
  );
});

test('AdminControlSnapshot falls back to repaired publication rows when publication services return null without acknowledging from the read path', async (t) => {
  let acknowledgedPublicationRow = null;
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-2',
    nowFn: () => 1000,
    systemTableCache: {
      getAll(tableName) {
        if (tableName === TABLES.NODES) {
          return [{
            node_id: 'node-1',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 2000,
          }, {
            node_id: 'node-2',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 2000,
          }];
        }
        if (tableName === TABLES.SERVICES) {
          return [{
            service_id: 'svc-1',
            node_id: 'node-1',
            status: 'active',
          }, {
            service_id: 'svc-2',
            node_id: 'node-2',
            status: 'active',
          }];
        }
        if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
          return [{
            publication_id: 'publication-11',
            publication_kind: 'cluster_membership',
            publication_epoch: 11,
            status: 'OPEN',
            published_active_node_ids: ['node-1', 'node-2'],
            required_ack_node_ids: ['node-1', 'node-2'],
            acknowledged_node_ids: ['node-1'],
          }];
        }
        return [];
      },
    },
    controlPlaneReadinessService: {
      async getAllNodeReadiness() {
        return [];
      },
      membershipPublicationService: {
        getLatestClusterPublicationSync() {
          return null;
        },
        async getLatestClusterPublication() {
          return null;
        },
        getLatestPublishedClusterPublicationSync() {
          return null;
        },
        async getLatestPublishedClusterPublication() {
          return null;
        },
        async acknowledgePublication(_publicationId, _nodeId, options = {}) {
          acknowledgedPublicationRow = options.publicationRow || null;
          return {
            ...options.publicationRow,
            status: 'PUBLISHED',
            acknowledged_node_ids: ['node-1', 'node-2'],
            published_at: 1000,
            updated_at: 1000,
            closed_at: 1000,
          };
        },
      },
    },
  });

  const result = await snapshot.buildLocalControlSnapshot();

  t.equal(
    acknowledgedPublicationRow,
    null,
    'control snapshot reads should not acknowledge repaired publication rows as a side effect',
  );
  t.same(
    result.nodes,
    ['node-1', 'node-2'],
    'fallback publication observation should still restore strict snapshot node coverage',
  );
  t.equal(
    result.controlPlaneDiagnostics.publishedMembershipObservation
      ?.publicationObservation?.state,
    'unavailable',
    'control snapshot diagnostics should surface explicit observation absence instead of null',
  );
});

test('AdminControlSnapshot keeps the last published membership when publication services return null', async (t) => {
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
    systemTableCache: {
      getAll(tableName) {
        if (tableName === TABLES.NODES) {
          return [{
            node_id: 'node-1',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 2000,
          }, {
            node_id: 'node-2',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 2000,
          }];
        }
        if (tableName === TABLES.SERVICES) {
          return [{
            service_id: 'svc-1',
            node_id: 'node-1',
            status: 'active',
          }, {
            service_id: 'svc-2',
            node_id: 'node-2',
            status: 'active',
          }];
        }
        if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
          return [{
            publication_id: 'publication-8',
            publication_kind: 'cluster_membership',
            publication_epoch: 8,
            status: 'OPEN',
            published_active_node_ids: ['node-1', 'node-2', 'node-3'],
            required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
            acknowledged_node_ids: ['node-1'],
          }, {
            publication_id: 'publication-7',
            publication_kind: 'cluster_membership',
            publication_epoch: 7,
            status: 'PUBLISHED',
            published_active_node_ids: ['node-1', 'node-2'],
            required_ack_node_ids: ['node-1', 'node-2'],
            acknowledged_node_ids: ['node-1', 'node-2'],
          }];
        }
        return [];
      },
    },
    controlPlaneReadinessService: {
      async getAllNodeReadiness() {
        return [];
      },
      membershipPublicationService: {
        getLatestClusterPublicationSync() {
          return null;
        },
        async getLatestClusterPublication() {
          return null;
        },
        getLatestPublishedClusterPublicationSync() {
          return null;
        },
        async getLatestPublishedClusterPublication() {
          return null;
        },
      },
    },
  });

  const result = await snapshot.buildLocalControlSnapshot();

  t.same(
    result.nodes,
    ['node-1', 'node-2'],
    'snapshot coverage should fall back to the last repaired published membership when service reads return null',
  );
  t.match(
    result.controlPlaneDiagnostics.publicationConvergence,
    {
      publicationEpoch: 8,
      status: 'OPEN',
    },
    'diagnostics should still expose the latest open publication from repaired rows',
  );
  t.match(
    result.controlPlaneDiagnostics.publishedMembershipObservation,
    {
      publicationEpoch: 7,
      status: 'PUBLISHED',
      publishedActiveNodeIds: ['node-1', 'node-2'],
    },
    'diagnostics should recover the last published membership from repaired rows when service reads return null',
  );
});

test('AdminControlSnapshot prefers the authoritative latest publication when control snapshots observe membership',
  async (t) => {
    let observedAckPublicationRow = null;
    let observedLatestPublicationReadOptions = null;
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-3',
      nowFn: () => 1000,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              publication_id: 'publication-18',
              publication_kind: 'cluster_membership',
              publication_epoch: 18,
              status: 'OPEN',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: [],
            };
          },
          async getLatestClusterPublication(options = {}) {
            observedLatestPublicationReadOptions = options;
            return {
              publication_id: 'publication-18',
              publication_kind: 'cluster_membership',
              publication_epoch: 18,
              status: 'ACK_PENDING',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: ['node-1', 'node-2'],
            };
          },
          async acknowledgePublication(_publicationId, _nodeId, options = {}) {
            observedAckPublicationRow = options.publicationRow || null;
            return options.publicationRow;
          },
        },
      },
    });

    await snapshot.ensureMembershipPublicationObservation({
      preferAuthoritativeRead: true,
    });

    t.same(
      observedLatestPublicationReadOptions,
      {
        preferAuthoritativeRead: true,
        readProfile: 'diagnostics',
      },
      'authoritative control snapshots should bypass the synchronous cache publication read',
    );
    t.equal(
      observedAckPublicationRow,
      null,
      'control snapshot observation should not acknowledge membership as a side effect',
    );
  });

test('AdminControlSnapshot prefers cached membership publication observation over repeated reconcile',
  async (t) => {
    let reconcileCallCount = 0;
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.NODES) {
            return [{
              node_id: 'node-1',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 2000,
            }, {
              node_id: 'node-2',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 2000,
            }];
          }
          if (tableName === TABLES.SERVICES) {
            return [{
              service_id: 'svc-1',
              node_id: 'node-1',
              status: 'active',
            }, {
              service_id: 'svc-2',
              node_id: 'node-2',
              status: 'active',
            }];
          }
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [{
              publication_id: 'publication-10',
              publication_kind: 'cluster_membership',
              publication_epoch: 10,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1', 'node-2'],
            }];
          }
          return [];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              publication_id: 'publication-10',
              publication_kind: 'cluster_membership',
              publication_epoch: 10,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1', 'node-2'],
            };
          },
          async enqueueClusterMembershipReconcile() {
            reconcileCallCount += 1;
            throw new Error('should not queue reconcile when cached publication exists');
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.equal(
      reconcileCallCount,
      0,
      'control snapshot observation should not force a new reconcile when cached published membership already exists',
    );
    t.same(
      result.nodes,
      ['node-1', 'node-2'],
      'cached published membership should still drive control snapshot coverage',
    );
  });

test('AdminControlSnapshot authoritative membership observation stays read-only when published membership lags cluster growth',
  async (t) => {
    let observedEnqueueOptions = null;
    let observedAckPublicationRow = null;
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-2',
      nowFn: () => 1000,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            t.fail('authoritative snapshot reads should bypass synchronous cache publication reads');
            return null;
          },
          async getLatestClusterPublication(options = {}) {
            t.same(
              options,
              {
                preferAuthoritativeRead: true,
                readProfile: 'diagnostics',
              },
              'authoritative snapshot reads should request an authoritative publication read before reconciling',
            );
            return {
              publication_id: 'publication-1',
              publication_kind: 'cluster_membership',
              publication_epoch: 1,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1'],
            };
          },
          async enqueueClusterMembershipReconcile(reason, context = {}) {
            observedEnqueueOptions = {reason, context};
          },
          async acknowledgePublication(_publicationId, _nodeId, options = {}) {
            observedAckPublicationRow = options.publicationRow || null;
            return options.publicationRow;
          },
        },
      },
    });

    const publicationRow = await snapshot.ensureMembershipPublicationObservation({
      preferAuthoritativeRead: true,
    });

    t.equal(
      observedEnqueueOptions,
      null,
      'authoritative snapshot observation should not queue reconcile from the read path',
    );
    t.equal(
      observedAckPublicationRow,
      null,
      'authoritative snapshot observation should not acknowledge publication from the read path',
    );
    t.match(
      publicationRow,
      {
        publication_id: 'publication-1',
        publication_epoch: 1,
        status: 'PUBLISHED',
      },
      'the observed publication should remain the returned snapshot observation when reconcile is queued',
    );
  });

test('AdminControlSnapshot forced authoritative membership observation stays read-only without handoff target',
  async (t) => {
    let observedReconcileOptions = null;
    let latestPublicationReadCount = 0;
    let observedAckPublicationRow = null;
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-2',
      nowFn: () => 1000,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            t.fail('forced authoritative reconcile should bypass cache reads');
            return null;
          },
          async getLatestClusterPublication() {
            latestPublicationReadCount += 1;
            return null;
          },
          async reconcileClusterMembership(options = {}) {
            observedReconcileOptions = options;
            return {
              publicationRow: {
                publication_id: 'publication-2',
                publication_kind: 'cluster_membership',
                publication_epoch: 2,
                status: 'OPEN',
                published_active_node_ids: ['node-1', 'node-2', 'node-3'],
                required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
                acknowledged_node_ids: ['node-1'],
              },
            };
          },
          async acknowledgePublication(_publicationId, _nodeId, options = {}) {
            observedAckPublicationRow = options.publicationRow || null;
            return options.publicationRow;
          },
        },
      },
    });

    const publicationRow = await snapshot.ensureMembershipPublicationObservation({
      preferAuthoritativeRead: true,
      reconcileAuthoritativeMembershipPublication: true,
    });

    t.same(
      observedReconcileOptions,
      null,
      'forced authoritative repair should not reconcile without a handoff target',
    );
    t.equal(
      latestPublicationReadCount,
      1,
      'read-only authoritative observation should fall back to the publication read path',
    );
    t.equal(
      observedAckPublicationRow,
      null,
      'forced authoritative reconcile should not acknowledge membership from the snapshot read path',
    );
    t.match(
      publicationRow,
      null,
      'no publication row should be synthesized from diagnostics-only reconcile',
    );
  });

test('AdminControlSnapshot build snapshot keeps broad authoritative membership observation read-only',
  async (t) => {
    let observedReconcileOptions = null;
    let latestPublicationReadCount = 0;
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-2',
      nowFn: () => 1000,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
        membershipPublicationService: {
          async getLatestClusterPublication() {
            latestPublicationReadCount += 1;
            return null;
          },
          async reconcileClusterMembership(options = {}) {
            observedReconcileOptions = options;
            return {
              publicationRow: {
                publication_id: 'publication-3',
                publication_kind: 'cluster_membership',
                publication_epoch: 3,
                status: 'OPEN',
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-1', 'node-2'],
                acknowledged_node_ids: ['node-1'],
              },
            };
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot({
      preferAuthoritativePublicationRead: true,
      reconcileAuthoritativeMembershipPublication: true,
    });

    t.same(
      observedReconcileOptions,
      null,
      'buildLocalControlSnapshot should not run broad publication reconcile without handoff target',
    );
    t.equal(
      latestPublicationReadCount,
      1,
      'broad authoritative observation should use the read path after reconcile is skipped',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence,
      {
        status: 'UNKNOWN',
        publishedActiveNodeIds: [],
      },
      'diagnostics should not synthesize publication success from a skipped broad reconcile',
    );
  });

test('AdminControlSnapshot build snapshot forwards handoff pending reconcile target',
  async (t) => {
    let observedHandoff = null;
    let observedReconcileOptions = null;
    let enqueueAttempted = false;
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
      systemTableCache: {
        getAll() {
          return [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS];
        },
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication(
            publicationActiveGateHandoff,
            options = {},
          ) {
            observedHandoff = publicationActiveGateHandoff;
            observedReconcileOptions = options;
            return {
              schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
              },
            };
          },
          enqueueClusterMembershipReconcile() {
            enqueueAttempted = true;
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot({
      preferAuthoritativePublicationRead:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_READ,
      reconcileAuthoritativeMembershipPublication:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_RECONCILE,
      publicationActiveGateHandoff: {
        schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      },
    });

    t.match(
      observedHandoff,
      {
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_NODE_IDS,
        ],
        nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      },
      'admin snapshots should forward the active-gate handoff to the publication owner command',
    );
    t.equal(
      observedReconcileOptions.reconcileAuthoritativeMembershipPublication,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_RECONCILE,
      'active-gate trigger should keep the explicit reconcile intent on the owner command',
    );
    t.match(
      result.controlPlaneDiagnostics.membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      },
      'admin diagnostics should display the owner outcome without converting it into publication truth',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      },
      'publication convergence should retain the owner outcome for representative reports',
    );
    t.equal(
      enqueueAttempted,
      false,
      'awaited owner reconcile should be preferred over queue-only catch-up when the coordinator exposes it',
    );
  });
