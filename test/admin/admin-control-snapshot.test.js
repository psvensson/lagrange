import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

test('AdminControlSnapshot routes publication convergence through the shared recovery protocol snapshot',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
    });

    const diagnostics = snapshot.resolvePublicationConvergenceDiagnostics([], {
      publicationEpoch: 12,
      status: 'ACK_PENDING',
      publishedActiveNodeIds: ['node-1'],
      requiredAckNodeIds: ['node-1', 'node-2'],
      acknowledgedNodeIds: ['node-1'],
      priorityPartitionSummary: {
        satisfied: false,
        missingPartitionIds: ['replica_operations-p1'],
      },
      membershipLifecycleSummary: {
        publishedActiveNodeIds: ['node-1'],
        projectedServingNodeIds: ['node-1', 'node-2'],
        locallyEligibleNodeIds: ['node-1', 'node-2'],
        recoveryActiveNodeIds: ['node-1', 'node-2'],
        recoveryActiveNodeSource: 'recovery_eligible_projection',
        missingPublishedRecoveryActiveNodeIds: ['node-2'],
      },
    });

    t.equal(
      diagnostics?.recoveryProtocolState,
      'publication_pending',
      'admin convergence diagnostics should expose the shared recovery protocol phase',
    );
    t.same(
      diagnostics?.priorityRecoveryReasonCodes,
      [
        'publication_epoch_pending',
        'priority_partitions_not_spread',
      ],
      'admin convergence diagnostics should preserve canonical protocol reasons',
    );
    t.match(
      diagnostics?.participationByNodeId || {},
      {
        'node-1': {
          state: 'recovery_pending_publish',
        },
        'node-2': {
          state: 'recovery_pending_publish',
          recoveryActive: true,
        },
      },
      'admin convergence diagnostics should preserve canonical node participation',
    );
  });

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

test('AdminControlSnapshot auto-repaired snapshots use authoritative membership publication without acknowledging',
  async (t) => {
    let authoritativeLatestPublicationReadOptions = null;
    let acknowledgePublicationRow = null;
    let authoritativeRepairQueueCount = 0;
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-2',
      nowFn: () => 1000,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      ensureAuthoritativeDiscoveryCacheRepair: async () => ({
        applied: true,
        repairedTables: [TABLES.CONTROL_PLANE_PUBLICATIONS],
      }),
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              publication_id: 'publication-1',
              publication_kind: 'cluster_membership',
              publication_epoch: 1,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1'],
              required_ack_node_ids: ['node-1'],
              acknowledged_node_ids: ['node-1'],
            };
          },
          async getLatestClusterPublication(options = {}) {
            authoritativeLatestPublicationReadOptions = options;
            return {
              publication_id: 'publication-2',
              publication_kind: 'cluster_membership',
              publication_epoch: 2,
              status: 'ACK_PENDING',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1'],
            };
          },
          async enqueueClusterMembershipReconcile() {
            authoritativeRepairQueueCount += 1;
          },
          async acknowledgePublication(_publicationId, _nodeId, options = {}) {
            acknowledgePublicationRow = options.publicationRow || null;
            return options.publicationRow || null;
          },
        },
      },
    });

    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['discovery_node_coverage_gap'],
    });

    await snapshot.resolveLocalControlSnapshot();

    t.same(
      authoritativeLatestPublicationReadOptions,
      {
        preferAuthoritativeRead: true,
        readProfile: 'diagnostics',
      },
      'post-repair control snapshots should bypass stale cached publication observations before acknowledging',
    );
    t.equal(
      authoritativeRepairQueueCount,
      0,
      'post-repair control snapshots should not queue reconcile from the read path',
    );
    t.equal(
      acknowledgePublicationRow,
      null,
      'post-repair control snapshots should not acknowledge the authoritative publication from the read path',
    );
  });

test('AdminControlSnapshot keeps the latest published membership when readiness surfaces a newer open publication',
  async (t) => {
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
            return [];
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
            membershipPublication: {
              publicationEpoch: 8,
              status: 'OPEN',
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
              requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
              acknowledgedNodeIds: ['node-1'],
            },
          }];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              publication_id: 'publication-8',
              publication_kind: 'cluster_membership',
              publication_epoch: 8,
              status: 'OPEN',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: ['node-1'],
            };
          },
          getLatestPublishedClusterPublicationSync() {
            return {
              publication_id: 'publication-7',
              publication_kind: 'cluster_membership',
              publication_epoch: 7,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1', 'node-2'],
            };
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.same(
      result.nodes,
      ['node-1', 'node-2'],
      'control snapshot coverage should keep the last published membership while a newer publication remains open',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence,
      {
        publicationEpoch: 8,
        status: 'OPEN',
      },
      'diagnostics should still expose the current open publication state',
    );
    t.match(
      result.controlPlaneDiagnostics.publishedMembershipObservation,
      {
        publicationEpoch: 7,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-1', 'node-2'],
      },
      'diagnostics should retain the last published membership observation for strict coverage consumers',
    );
  });

test('AdminControlSnapshot prefers authoritative published membership when cache only exposes a newer open publication',
  async (t) => {
    let publishedReadOptions = null;
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
            }];
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
            membershipPublication: {
              publicationEpoch: 8,
              status: 'OPEN',
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
              requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
              acknowledgedNodeIds: ['node-1'],
            },
          }];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              publication_id: 'publication-8',
              publication_kind: 'cluster_membership',
              publication_epoch: 8,
              status: 'OPEN',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: ['node-1'],
            };
          },
          getLatestPublishedClusterPublicationSync() {
            return null;
          },
          async getLatestPublishedClusterPublication(options = {}) {
            publishedReadOptions = options;
            return {
              publication_id: 'publication-7',
              publication_kind: 'cluster_membership',
              publication_epoch: 7,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1', 'node-2'],
            };
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot({
      allowAuthoritativeRepair: true,
      forceAuthoritativeRepair: true,
    });

    t.same(
      result.nodes,
      ['node-1', 'node-2'],
      'forced recovery snapshots should use authoritative published membership when cache-only publication history is incomplete',
    );
    t.same(
      publishedReadOptions,
      {
        preferAuthoritativeRead: true,
        readProfile: 'diagnostics',
      },
      'published membership recovery should request authoritative publication history explicitly',
    );
    t.match(
      result.controlPlaneDiagnostics.publishedMembershipObservation,
      {
        publicationEpoch: 7,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-1', 'node-2'],
      },
      'diagnostics should surface the authoritative published membership that restored snapshot coverage',
    );
  });

test('AdminControlSnapshot default snapshots recover published membership after a cache miss on a pending publication',
  async (t) => {
    const publishedReadOptions = [];
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
            }, {
              node_id: 'node-3',
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
            }, {
              service_id: 'svc-3',
              node_id: 'node-3',
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
            }];
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
            membershipPublication: {
              publicationEpoch: 8,
              status: 'OPEN',
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
              requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
              acknowledgedNodeIds: ['node-1'],
            },
          }];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              publication_id: 'publication-8',
              publication_kind: 'cluster_membership',
              publication_epoch: 8,
              status: 'OPEN',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: ['node-1'],
            };
          },
          getLatestPublishedClusterPublicationSync() {
            return null;
          },
          async getLatestPublishedClusterPublication(options = {}) {
            publishedReadOptions.push(options);
            if (options.preferAuthoritativeRead === true) {
              return {
                publication_id: 'publication-7',
                publication_kind: 'cluster_membership',
                publication_epoch: 7,
                status: 'PUBLISHED',
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-1', 'node-2'],
                acknowledged_node_ids: ['node-1', 'node-2'],
              };
            }
            return null;
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.same(
      result.nodes,
      ['node-1', 'node-2'],
      'default snapshots should keep the last published membership when a newer publication is still pending',
    );
    t.same(
      publishedReadOptions,
      [
        {readProfile: 'diagnostics'},
        {preferAuthoritativeRead: true, readProfile: 'diagnostics'},
      ],
      'default snapshots should escalate to an authoritative published-membership read after a cache miss',
    );
    t.match(
      result.controlPlaneDiagnostics.publishedMembershipObservation,
      {
        publicationEpoch: 7,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-1', 'node-2'],
      },
      'default snapshot diagnostics should preserve the recovered published membership observation',
    );
    t.same(
      result.controlPlaneDiagnostics.activeNodeViews,
      {
        authoritativeSource: 'published_membership',
        authoritativeNodeIds: ['node-1', 'node-2'],
        projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
        locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
        suspectedOrTransitioningNodeIds: ['node-3'],
        membershipFreeze: {
          active: false,
          reasonCode: null,
          retainedPublishedNodeIds: ['node-1', 'node-2'],
          missingProjectedNodeIds: [],
          unconfirmedProjectedNodeIds: ['node-3'],
        },
        effectiveSource: 'published_membership',
        effectiveNodeIds: ['node-1', 'node-2'],
        projectedNodeIds: ['node-1', 'node-2', 'node-3'],
        publishedNodeIds: ['node-1', 'node-2'],
        publishedMembershipAvailable: true,
      },
      'default snapshots should continue advertising published membership availability after recovery',
    );
  });

test('AdminControlSnapshot authoritative published membership bypasses stale cached published history',
  async (t) => {
    let authoritativePublishedReadCount = 0;
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          getLatestPublishedClusterPublicationSync() {
            return {
              publication_id: 'publication-1',
              publication_kind: 'cluster_membership',
              publication_epoch: 1,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1'],
              required_ack_node_ids: ['node-1'],
              acknowledged_node_ids: ['node-1'],
            };
          },
          async getLatestPublishedClusterPublication(options = {}) {
            authoritativePublishedReadCount += 1;
            t.same(
              options,
              {
                preferAuthoritativeRead: true,
                readProfile: 'diagnostics',
              },
              'authoritative published membership should request an authoritative history read',
            );
            return {
              publication_id: 'publication-2',
              publication_kind: 'cluster_membership',
              publication_epoch: 2,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1', 'node-2'],
            };
          },
        },
      },
    });

    const result = await snapshot.ensurePublishedMembershipObservation(
      null,
      {preferAuthoritativeRead: true},
    );

    t.equal(
      authoritativePublishedReadCount,
      1,
      'authoritative published membership recovery should bypass the synchronous cache shortcut',
    );
    t.match(
      result,
      {
        publication_id: 'publication-2',
        publication_epoch: 2,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
      },
      'authoritative published membership recovery should return the fresher published epoch',
    );
  });

test('AdminControlSnapshot forced authoritative repair uses authoritative published membership without reconciling from observation',
  async (t) => {
    let authoritativePublishedReadCount = 0;
    let authoritativeQueueEnqueueCount = 0;
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
            }];
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
            membershipPublication: {
              publicationEpoch: 8,
              status: 'OPEN',
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
              requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
              acknowledgedNodeIds: ['node-1'],
            },
          }];
        },
        membershipPublicationService: {
          async getLatestClusterPublication(options = {}) {
            t.same(
              options,
              {
                preferAuthoritativeRead: true,
                readProfile: 'diagnostics',
              },
              'forced repair should still request an authoritative publication read',
            );
            return {
              publication_id: 'publication-8',
              publication_kind: 'cluster_membership',
              publication_epoch: 8,
              status: 'OPEN',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: ['node-1'],
            };
          },
          async getLatestPublishedClusterPublication(options = {}) {
            authoritativePublishedReadCount += 1;
            t.same(
              options,
              {
                preferAuthoritativeRead: true,
                readProfile: 'diagnostics',
              },
              'forced repair should request authoritative published membership history',
            );
            return {
              publication_id: 'publication-7',
              publication_kind: 'cluster_membership',
              publication_epoch: 7,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1', 'node-2'],
            };
          },
          enqueueClusterMembershipReconcile(_reason, context = {}) {
            authoritativeQueueEnqueueCount += 1;
            t.match(
              context,
              {
                latestPublicationRow: {
                  publication_id: 'publication-8',
                  publication_epoch: 8,
                  status: 'OPEN',
                },
                preferAuthoritativeRead: true,
              },
              'forced repair should queue reconciliation using the authoritative latest publication row',
            );
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot({
      forceAuthoritativeRepair: true,
    });

    t.same(
      result.nodes,
      ['node-1', 'node-2'],
      'forced repair snapshots should keep the last published membership for control snapshot coverage',
    );
    t.equal(
      authoritativePublishedReadCount,
      1,
      'forced repair should still read published membership history authoritatively',
    );
    t.equal(
      authoritativeQueueEnqueueCount,
      0,
      'forced repair snapshot polling should not enqueue reconciliation from publication observation',
    );
    t.match(
      result.controlPlaneDiagnostics.publishedMembershipObservation,
      {
        publicationEpoch: 7,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-1', 'node-2'],
      },
      'forced repair diagnostics should retain the authoritative published membership observation',
    );
  });

test('AdminControlSnapshot forced authoritative repair retries after stale publication leader routing failures',
  async (t) => {
    const cacheRowsByTable = {
      [TABLES.NODES]: [{
        node_id: 'node-1',
        status: 'active',
        connection_state: 'ready',
        last_heartbeat: 900,
        ready_lease_expires_at: 2000,
      }, {
        node_id: 'node-2',
        status: 'active',
        connection_state: 'ready',
        last_heartbeat: 900,
        ready_lease_expires_at: 2000,
      }],
      [TABLES.TABLES]: [{
        table_id: 'tbl-bench',
        table_name: 'benchmark_events',
      }],
      [TABLES.PARTITIONS]: [{
        partition_id: 'tbl-bench-p1',
        table_id: 'tbl-bench',
        table_name: 'benchmark_events',
        partition_version: 1,
        leader_node_id: 'node-1',
        state: 'NORMAL',
      }],
      [TABLES.SERVICES]: [{
        service_id: 'tbl-bench-p1-r1',
        service_type: 'partition',
        node_id: 'node-1',
        partition_id: 'tbl-bench-p1',
        replica_id: 'tbl-bench-p1-r1',
        raft_role: 'leader',
        status: 'active',
        address: 'node-1/partition/tbl-bench-p1-r1',
      }],
      [TABLES.NODE_ENDPOINTS]: [],
      [TABLES.CONTROL_PLANE_PUBLICATIONS]: [],
      [TABLES.REPLICA_OPERATIONS]: [],
    };
    let repairApplied = false;
    let repairCallCount = 0;
    let authoritativePublicationReadCount = 0;

    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
      systemTableCache: {
        getAll(tableName) {
          return cacheRowsByTable[tableName] || [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      ensureAuthoritativeDiscoveryCacheRepair: async () => {
        repairCallCount += 1;
        repairApplied = true;
        cacheRowsByTable[TABLES.PARTITIONS] = [
          ...cacheRowsByTable[TABLES.PARTITIONS],
          {
            partition_id: 'tbl-bench-left',
            table_id: 'tbl-bench',
            table_name: 'benchmark_events',
            partition_version: 1,
            leader_node_id: 'node-1',
            state: 'NORMAL',
          },
          {
            partition_id: 'tbl-bench-right',
            table_id: 'tbl-bench',
            table_name: 'benchmark_events',
            partition_version: 1,
            leader_node_id: 'node-2',
            state: 'NORMAL',
          },
        ];
        cacheRowsByTable[TABLES.SERVICES] = [
          ...cacheRowsByTable[TABLES.SERVICES],
          {
            service_id: 'tbl-bench-left-r1',
            service_type: 'partition',
            node_id: 'node-1',
            partition_id: 'tbl-bench-left',
            replica_id: 'tbl-bench-left-r1',
            raft_role: 'leader',
            status: 'active',
            address: 'node-1/partition/tbl-bench-left-r1',
          },
          {
            service_id: 'tbl-bench-right-r1',
            service_type: 'partition',
            node_id: 'node-2',
            partition_id: 'tbl-bench-right',
            replica_id: 'tbl-bench-right-r1',
            raft_role: 'leader',
            status: 'active',
            address: 'node-2/partition/tbl-bench-right-r1',
          },
        ];
        return {
          applied: true,
          tableNames: [TABLES.PARTITIONS, TABLES.SERVICES],
        };
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
        membershipPublicationService: {
          async getLatestClusterPublication(options = {}) {
            authoritativePublicationReadCount += 1;
            t.same(
              options,
              {
                preferAuthoritativeRead: true,
                readProfile: 'diagnostics',
              },
              'forced repair should retry authoritative membership publication reads',
            );
            if (!repairApplied) {
              throw new Error('No handler registered for partition service');
            }
            return {
              publication_id: 'publication-2',
              publication_kind: 'cluster_membership',
              publication_epoch: 2,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1', 'node-2'],
            };
          },
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
    });

    t.equal(
      repairCallCount,
      1,
      'forced repair should run authoritative discovery repair after a stale publication read failure',
    );
    t.equal(
      authoritativePublicationReadCount,
      2,
      'forced repair should retry the authoritative publication read after repair',
    );
    t.same(
      result.partitions.sort(),
      ['tbl-bench-left', 'tbl-bench-p1', 'tbl-bench-right'],
      'repaired control snapshots should publish the split child partitions',
    );
    t.match(
      result.authoritativeRepair,
      {
        applied: true,
        forced: true,
      },
      'recovered snapshots should report that authoritative repair was applied',
    );
    t.match(
      result.controlPlaneDiagnostics.publishedMembershipObservation,
      {
        publicationEpoch: 2,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-1', 'node-2'],
      },
      'recovered snapshots should still surface the authoritative published membership observation',
    );
  });

test('AdminControlSnapshot forced authoritative repair refreshes split topology even when stale table versions mask a local gap',
  async (t) => {
    const cacheRowsByTable = {
      [TABLES.NODES]: [{
        node_id: 'node-1',
        status: 'active',
        connection_state: 'ready',
        last_heartbeat: 900,
        ready_lease_expires_at: 2000,
      }, {
        node_id: 'node-2',
        status: 'active',
        connection_state: 'ready',
        last_heartbeat: 900,
        ready_lease_expires_at: 2000,
      }],
      [TABLES.TABLES]: [{
        table_id: 'tbl-bench',
        table_name: 'benchmark_events',
        active_partition_version: 1,
        partition_count: 1,
      }],
      [TABLES.PARTITIONS]: [{
        partition_id: 'tbl-bench-p1',
        table_id: 'tbl-bench',
        table_name: 'benchmark_events',
        partition_version: 1,
        leader_node_id: 'node-1',
        state: 'NORMAL',
      }],
      [TABLES.SERVICES]: [{
        service_id: 'tbl-bench-p1-r1',
        service_type: 'partition',
        node_id: 'node-1',
        partition_id: 'tbl-bench-p1',
        replica_id: 'tbl-bench-p1-r1',
        raft_role: 'leader',
        status: 'active',
        address: 'node-1/partition/tbl-bench-p1-r1',
      }],
      [TABLES.NODE_ENDPOINTS]: [{
        endpoint_id: 'node-1-ws',
        node_id: 'node-1',
        transport_type: 'ws',
        status: 'active',
        address: 'ws://node-1:8082',
      }, {
        endpoint_id: 'node-2-ws',
        node_id: 'node-2',
        transport_type: 'ws',
        status: 'active',
        address: 'ws://node-2:8082',
      }],
      [TABLES.CONTROL_PLANE_PUBLICATIONS]: [],
      [TABLES.REPLICA_OPERATIONS]: [],
    };
    let repairCallCount = 0;

    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
      systemTableCache: {
        getAll(tableName) {
          return cacheRowsByTable[tableName] || [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      ensureAuthoritativeDiscoveryCacheRepair: async () => {
        repairCallCount += 1;
        cacheRowsByTable[TABLES.TABLES] = [{
          table_id: 'tbl-bench',
          table_name: 'benchmark_events',
          active_partition_version: 2,
          partition_count: 2,
        }];
        cacheRowsByTable[TABLES.PARTITIONS] = [
          ...cacheRowsByTable[TABLES.PARTITIONS],
          {
            partition_id: 'tbl-bench-left',
            table_id: 'tbl-bench',
            table_name: 'benchmark_events',
            partition_version: 2,
            leader_node_id: 'node-1',
            state: 'NORMAL',
          },
          {
            partition_id: 'tbl-bench-right',
            table_id: 'tbl-bench',
            table_name: 'benchmark_events',
            partition_version: 2,
            leader_node_id: 'node-2',
            state: 'NORMAL',
          },
        ];
        cacheRowsByTable[TABLES.SERVICES] = [
          ...cacheRowsByTable[TABLES.SERVICES],
          {
            service_id: 'tbl-bench-left-r1',
            service_type: 'partition',
            node_id: 'node-1',
            partition_id: 'tbl-bench-left',
            replica_id: 'tbl-bench-left-r1',
            raft_role: 'leader',
            status: 'active',
            address: 'node-1/partition/tbl-bench-left-r1',
          },
          {
            service_id: 'tbl-bench-right-r1',
            service_type: 'partition',
            node_id: 'node-2',
            partition_id: 'tbl-bench-right',
            replica_id: 'tbl-bench-right-r1',
            raft_role: 'leader',
            status: 'active',
            address: 'node-2/partition/tbl-bench-right-r1',
          },
        ];
        return {
          applied: true,
          tableNames: [TABLES.TABLES, TABLES.PARTITIONS, TABLES.SERVICES],
        };
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
    });

    t.equal(
      repairCallCount,
      1,
      'forced repair should still run when stale table versions hide the split from local topology heuristics',
    );
    t.same(
      result.partitions.sort(),
      ['tbl-bench-left', 'tbl-bench-right'],
      'forced repair should rebuild the active split topology from authoritative table and partition rows',
    );
    t.match(
      result.authoritativeRepair,
      {
        applied: true,
        forced: true,
      },
      'forced repair snapshots should report the authoritative refresh',
    );
  });

test('AdminControlSnapshot builds priority-recovery decision snapshots with cross-service blockers',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
    });

    const decisionSnapshots = snapshot.buildPriorityRecoveryDecisionSnapshots({
      capturedAt: 1234,
      publicationConvergence: {
        publicationEpoch: 8,
        publicationStatus: 'ACK_PENDING',
        pendingAckNodeIds: ['node-b'],
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: 'users-p1',
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
          missingPartitionIds: ['orders-p1', 'payments-p1'],
          requiredDistinctNodeCount: 3,
        },
        projectionDiagnostics: {
          recoveryEligibleIncludedNodeIds: ['node-b'],
          readinessExcludedNodeIds: ['node-b'],
          clusterMemberUnhealthyExcludedNodeIds: [],
        },
      },
      readinessByNodeId: {
        'node-b': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
          reasons: [{
            code: 'control_plane_publication_pending',
          }],
        },
      },
      workflowAdmissionsByWorkflowId: {
        'wf-users': {
          workflowId: 'wf-users',
          workflowType: 'managed_split',
          sourcePartitionId: 'users-p1',
          admission: {
            decisionType: 'blocked',
            decisionDimension: 'repairEligible',
            eligibleNodeIds: ['node-b'],
            ineligibleNodes: [{
              nodeId: 'node-b',
              reasonCodes: ['control_plane_publication_pending'],
            }],
          },
          blockingReasons: ['priority_spread_gap'],
        },
        'wf-orders': {
          workflowId: 'wf-orders',
          workflowType: 'managed_split',
          sourcePartitionId: 'orders-p1',
          admission: {
            decisionType: 'allowed',
            decisionDimension: 'repairEligible',
            eligibleNodeIds: ['node-c'],
            ineligibleNodes: [],
          },
          blockingReasons: [],
        },
      },
      replicaOperationRows: [{
        operation_id: 'op-1',
        partition_id: 'users-p1',
        entity_type: 'partition',
        status: 'in_progress',
        workflow_step: 'LEARNER_START',
        source_node_id: 'node-a',
        target_node_id: 'node-b',
        replica_id: 'rep-1',
        created_at: 100,
        updated_at: 101,
      }],
      replicaOperations: {
        operationTimelineById: {
          'op-1': [{
            step: 'LEARNER_START',
            status: 'running',
            inFlight: true,
          }],
        },
      },
      serviceRows: [{
        partition_id: 'users-p1',
        status: 'active',
        raft_role: 'learner',
        node_id: 'node-b',
      }],
    });

    t.equal(
      decisionSnapshots.snapshotCount,
      3,
      'decision snapshots should include one row per partition/operation correlation key',
    );
    t.same(
      decisionSnapshots.blockerPartitionIdsByReason,
      {
        eligible_but_no_operation_created: ['orders-p1', 'payments-p1'],
        operation_created_but_no_step_transitions: ['users-p1'],
        learner_active_but_never_promotable: ['users-p1'],
        publication_recovery_eligible_but_coordinator_excludes_node: ['users-p1'],
      },
      'decision snapshots should expose deterministic blocker classes by partition',
    );
    t.same(
      decisionSnapshots.partitionIdsBySemanticState,
      {
        converged: [],
        spread_satisfied_in_flight: [],
        needs_operation: ['orders-p1', 'payments-p1'],
        operation_stalled: [],
        learner_promotion_blocked: [],
        coordination_mismatch: ['users-p1'],
        recovering_in_flight: [],
        blocked_unclassified: [],
      },
      'decision snapshots should expose canonical partition semantic states',
    );
    t.same(
      decisionSnapshots.unresolvedSemanticStateIds,
      ['needs_operation', 'coordination_mismatch'],
      'decision snapshots should report unresolved semantic states',
    );

    const usersSnapshot = decisionSnapshots.snapshots.find((entry) =>
      entry.partitionId === 'users-p1',
    );
    t.ok(usersSnapshot, 'users partition snapshot should exist');
    t.equal(
      usersSnapshot.correlationKey,
      'users-p1|8|op-1',
      'decision snapshots should emit correlation keys with partition, epoch, and operation',
    );
    t.same(
      usersSnapshot.blockerReasons,
      [
        'operation_created_but_no_step_transitions',
        'learner_active_but_never_promotable',
        'publication_recovery_eligible_but_coordinator_excludes_node',
      ],
      'users partition should include coordinator, learner, and publication blockers',
    );
    t.equal(
      usersSnapshot.semanticState,
      'coordination_mismatch',
      'decision snapshot should classify blocker precedence into one semantic state',
    );
    t.same(
      usersSnapshot.admission.recoveryEligibleExcludedNodeIds,
      ['node-b'],
      'decision snapshots should surface recovery-eligible nodes excluded by coordinator admission',
    );
  });

test('AdminControlSnapshot classifies spread-gap partitions with only terminal operations as eligible/no-operation blockers',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-a',
      nowFn: () => 5000,
    });

    const decisionSnapshots = snapshot.buildPriorityRecoveryDecisionSnapshots({
      capturedAt: 5000,
      publicationConvergence: {
        publicationEpoch: 12,
        publicationStatus: 'PUBLISHED',
        pendingAckNodeIds: [],
        priorityPartitionSummary: {
          readyEligibleNodeCount: 2,
          blockedPartitions: [{
            partitionId: 'sql_transaction_participants-p1',
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
          missingPartitionIds: ['sql_transaction_participants-p1'],
          requiredDistinctNodeCount: 3,
        },
      },
      readinessByNodeId: {},
      workflowAdmissionsByWorkflowId: {},
      replicaOperationRows: [{
        operation_id: 'op-removed',
        partition_id: 'sql_transaction_participants-p1',
        entity_type: 'partition',
        status: 'removed',
        workflow_step: 'REMOVED',
        source_node_id: 'node-a',
        target_node_id: 'node-b',
        replica_id: 'sql_transaction_participants-p1-r4',
        created_at: 1000,
        updated_at: 2000,
      }],
      replicaOperations: {
        operationTimelineById: {
          'op-removed': [{
            step: 'REMOVED',
            status: 'removed',
            inFlight: false,
          }],
        },
      },
      serviceRows: [],
    });

    t.same(
      decisionSnapshots.blockerPartitionIdsByReason,
      {
        eligible_but_no_operation_created: ['sql_transaction_participants-p1'],
        operation_created_but_no_step_transitions: [],
        learner_active_but_never_promotable: [],
        publication_recovery_eligible_but_coordinator_excludes_node: [],
      },
      'terminal operation history should not mask missing active recovery operations',
    );
    t.same(
      decisionSnapshots.partitionIdsBySemanticState,
      {
        converged: [],
        spread_satisfied_in_flight: [],
        needs_operation: ['sql_transaction_participants-p1'],
        operation_stalled: [],
        learner_promotion_blocked: [],
        coordination_mismatch: [],
        recovering_in_flight: [],
        blocked_unclassified: [],
      },
      'terminal-only operation snapshots should still resolve semantic state as needs-operation',
    );

    const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
      entry.partitionId === 'sql_transaction_participants-p1' &&
      entry.operationId === 'op-removed',
    );
    t.ok(targetSnapshot, 'target partition snapshot should exist');
    t.same(
      targetSnapshot.blockerReasons,
      ['eligible_but_no_operation_created'],
      'terminal operation context should still emit eligible/no-operation blocker',
    );
    t.equal(
      targetSnapshot.admission.eligibilityEvidenceSource,
      'priority_summary_ready_eligible',
      'terminal-only context should record when needs-operation inference came from the shared priority summary',
    );
    t.equal(
      targetSnapshot.semanticState,
      'needs_operation',
      'terminal-only context should resolve a needs-operation semantic state',
    );
  });

test('AdminControlSnapshot derives concrete eligible cohorts from publication membership summary',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-a',
      nowFn: () => 5000,
    });

    const decisionSnapshots = snapshot.buildPriorityRecoveryDecisionSnapshots({
      capturedAt: 5000,
      publicationConvergence: {
        publicationEpoch: 14,
        publicationStatus: 'PUBLISHED',
        publishedActiveNodeIds: ['node-a'],
        pendingAckNodeIds: [],
        priorityPartitionSummary: {
          readyEligibleNodeCount: 2,
          blockedPartitions: [{
            partitionId: 'replica_operations-p1',
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
          missingPartitionIds: ['replica_operations-p1'],
          requiredDistinctNodeCount: 3,
        },
        membershipLifecycleSummary: {
          projectedServingNodeIds: ['node-b', 'node-c'],
          locallyEligibleNodeIds: ['node-b', 'node-c'],
        },
      },
      readinessByNodeId: {},
      workflowAdmissionsByWorkflowId: {},
      replicaOperationRows: [],
      replicaOperations: {
        operationTimelineById: {},
      },
      serviceRows: [],
    });

    const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
      entry.partitionId === 'replica_operations-p1',
    );
    t.ok(targetSnapshot, 'target partition snapshot should exist');
    t.same(
      targetSnapshot.admission.effectiveEligibleNodeIds,
      ['node-a', 'node-b', 'node-c'],
      'publication membership summary should provide the concrete eligible cohort',
    );
    t.equal(
      targetSnapshot.admission.effectiveEligibleNodeCount,
      3,
      'effective eligible count should match the publication cohort size',
    );
    t.equal(
      targetSnapshot.admission.eligibilityEvidenceSource,
      'publication_membership',
      'publication membership should outrank count-only summary evidence',
    );
    t.equal(
      targetSnapshot.admission.eligibilityCohortComplete,
      true,
      'publication-derived cohorts should be marked complete',
    );
    t.same(
      targetSnapshot.publication.missingPublishedEligibleNodeIds,
      ['node-b', 'node-c'],
      'decision snapshots should expose the concrete eligible nodes still missing from publication',
    );
  });

test('AdminControlSnapshot leaves spread-gap partitions blocked-unclassified when no eligibility evidence exists',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-a',
      nowFn: () => 5000,
    });

    const decisionSnapshots = snapshot.buildPriorityRecoveryDecisionSnapshots({
      capturedAt: 5000,
      publicationConvergence: {
        publicationEpoch: 12,
        publicationStatus: 'PUBLISHED',
        pendingAckNodeIds: [],
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: 'sql_write_operations-p1',
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
          missingPartitionIds: ['sql_write_operations-p1'],
          requiredDistinctNodeCount: 3,
        },
      },
      readinessByNodeId: {},
      workflowAdmissionsByWorkflowId: {},
      replicaOperationRows: [],
      replicaOperations: {
        operationTimelineById: {},
      },
      serviceRows: [],
    });

    t.same(
      decisionSnapshots.blockerPartitionIdsByReason,
      {
        eligible_but_no_operation_created: [],
        operation_created_but_no_step_transitions: [],
        learner_active_but_never_promotable: [],
        publication_recovery_eligible_but_coordinator_excludes_node: [],
      },
      'missing admission evidence should not be reported as eligible/no-operation by default',
    );
    t.same(
      decisionSnapshots.partitionIdsBySemanticState,
      {
        converged: [],
        spread_satisfied_in_flight: [],
        needs_operation: [],
        operation_stalled: [],
        learner_promotion_blocked: [],
        coordination_mismatch: [],
        recovering_in_flight: [],
        blocked_unclassified: ['sql_write_operations-p1'],
      },
      'spread gaps without eligibility evidence should remain blocked-unclassified',
    );

    const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
      entry.partitionId === 'sql_write_operations-p1',
    );
    t.ok(targetSnapshot, 'target partition snapshot should exist');
    t.equal(
      targetSnapshot.admission.eligibilityEvidenceSource,
      'unknown',
      'blocked-unclassified snapshots should retain the lack of eligibility evidence explicitly',
    );
  });

test('AdminControlSnapshot classifies eligible ACTIVE replace operations as spread-satisfied in flight',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-a',
      nowFn: () => 5000,
    });

    const decisionSnapshots = snapshot.buildPriorityRecoveryDecisionSnapshots({
      capturedAt: 5000,
      publicationConvergence: {
        publicationEpoch: 12,
        publicationStatus: 'PUBLISHED',
        publishedActiveNodeIds: ['node-a'],
        pendingAckNodeIds: [],
        priorityPartitionSummary: {
          blockedPartitions: [{
            partitionId: 'control_plane_publications-p1',
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
          missingPartitionIds: ['control_plane_publications-p1'],
          requiredDistinctNodeCount: 3,
        },
        membershipLifecycleSummary: {
          projectedServingNodeIds: ['node-a', 'node-b'],
          locallyEligibleNodeIds: ['node-a', 'node-b'],
        },
      },
      readinessByNodeId: {},
      workflowAdmissionsByWorkflowId: {},
      replicaOperationRows: [{
        operation_id: 'op-replace-active',
        partition_id: 'control_plane_publications-p1',
        entity_type: 'partition',
        operation_type: 'REPLACE',
        status: 'active',
        workflow_step: 'ACTIVE',
        source_node_id: 'node-a',
        target_node_id: 'node-b',
        replica_id: 'control_plane_publications-p1-r4',
        created_at: 1000,
        updated_at: 2000,
      }],
      replicaOperations: {
        operationTimelineById: {
          'op-replace-active': [{
            step: 'ACTIVE',
            status: 'active',
            inFlight: true,
          }],
        },
      },
      serviceRows: [{
        partition_id: 'control_plane_publications-p1',
        status: 'active',
        raft_role: 'voter',
        node_id: 'node-b',
      }],
    });

    t.same(
      decisionSnapshots.blockerPartitionIdsByReason,
      {
        eligible_but_no_operation_created: [],
        operation_created_but_no_step_transitions: [],
        learner_active_but_never_promotable: [],
        publication_recovery_eligible_but_coordinator_excludes_node: [],
      },
      'eligible ACTIVE replace operations should stop surfacing blocker reasons',
    );
    t.same(
      decisionSnapshots.partitionIdsBySemanticState,
      {
        converged: [],
        spread_satisfied_in_flight: ['control_plane_publications-p1'],
        needs_operation: [],
        operation_stalled: [],
        learner_promotion_blocked: [],
        coordination_mismatch: [],
        recovering_in_flight: [],
        blocked_unclassified: [],
      },
      'eligible ACTIVE replace operations should move onto the spread-satisfied semantic lane',
    );

    const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
      entry.partitionId === 'control_plane_publications-p1' &&
      entry.operationId === 'op-replace-active',
    );
    t.ok(targetSnapshot, 'target partition snapshot should exist');
    t.same(
      targetSnapshot.blockerReasons,
      [],
      'eligible ACTIVE replace context should no longer emit blocker reasons',
    );
    t.same(
      targetSnapshot.spreadCompletion,
      {
        satisfied: true,
        reasonCode: 'replace_remove_dispatch_phase_on_eligible_target',
        satisfyingOperationIds: ['op-replace-active'],
        satisfyingOperationCount: 1,
        blockingOperationIds: [],
        blockingOperationCount: 0,
      },
      'decision snapshots should surface the canonical spread-completion invariant',
    );
    t.equal(
      targetSnapshot.semanticState,
      'spread_satisfied_in_flight',
      'eligible ACTIVE replace context should resolve onto the spread-satisfied semantic state',
    );
  });

test('AdminControlSnapshot treats status-only ACTIVE add operations as terminal',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-a',
      nowFn: () => 5000,
    });

    const decisionSnapshots = snapshot.buildPriorityRecoveryDecisionSnapshots({
      capturedAt: 5000,
      publicationConvergence: {
        publicationEpoch: 15,
        publicationStatus: 'PUBLISHED',
        pendingAckNodeIds: [],
        priorityPartitionSummary: {
          readyEligibleNodeCount: 2,
          blockedPartitions: [{
            partitionId: 'sql_transactions-p1',
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          }],
          missingPartitionIds: ['sql_transactions-p1'],
          requiredDistinctNodeCount: 3,
        },
      },
      readinessByNodeId: {},
      workflowAdmissionsByWorkflowId: {},
      replicaOperationRows: [{
        operation_id: 'op-add-active-no-step',
        partition_id: 'sql_transactions-p1',
        entity_type: 'partition',
        operation_type: 'ADD',
        status: 'active',
        workflow_step: 'UNTRACKED',
        source_node_id: 'node-a',
        target_node_id: 'node-b',
        replica_id: 'sql_transactions-p1-r4',
        created_at: 1000,
        updated_at: 2000,
      }],
      replicaOperations: {
        operationTimelineById: {
          'op-add-active-no-step': [{
            step: 'UNTRACKED',
            status: 'active',
            inFlight: false,
          }],
        },
      },
      serviceRows: [],
    });

    t.same(
      decisionSnapshots.blockerPartitionIdsByReason,
      {
        eligible_but_no_operation_created: ['sql_transactions-p1'],
        operation_created_but_no_step_transitions: [],
        learner_active_but_never_promotable: [],
        publication_recovery_eligible_but_coordinator_excludes_node: [],
      },
      'status-only ACTIVE add rows should not be treated as in-flight recovery blockers',
    );
    t.same(
      decisionSnapshots.partitionIdsBySemanticState,
      {
        converged: [],
        spread_satisfied_in_flight: [],
        needs_operation: ['sql_transactions-p1'],
        operation_stalled: [],
        learner_promotion_blocked: [],
        coordination_mismatch: [],
        recovering_in_flight: [],
        blocked_unclassified: [],
      },
      'status-only ACTIVE add rows should classify as needs-operation when spread remains blocked',
    );

    const targetSnapshot = decisionSnapshots.snapshots.find((entry) =>
      entry.partitionId === 'sql_transactions-p1' &&
      entry.operationId === 'op-add-active-no-step',
    );
    t.ok(targetSnapshot, 'target partition snapshot should exist');
    t.same(
      targetSnapshot.blockerReasons,
      ['eligible_but_no_operation_created'],
      'status-only ACTIVE add context should not emit in-flight transition blockers',
    );
    t.equal(
      targetSnapshot.semanticState,
      'needs_operation',
      'status-only ACTIVE add context should resolve needs-operation',
    );
  });

test('AdminControlSnapshot degrades non-forced repair failures under control-plane backpressure when local query transport is ready',
  async (t) => {
    let repairCallCount = 0;
    const localSnapshot = {
      nodes: ['node-1'],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
    });
    snapshot.buildLocalControlSnapshot = async () => localSnapshot;
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['replica_operations_stale'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () => {
      repairCallCount += 1;
      return {
        applied: false,
        failedTables: [TABLES.SERVICES],
        causeChain: ['control_plane_backpressure'],
        localQueryTransport: {
          state: 'ready',
          ready: true,
        },
        errors: ['control_plane_pressure_degraded'],
      };
    };

    const result = await snapshot.resolveLocalControlSnapshot({
      allowAuthoritativeRepair: true,
    });

    t.equal(
      repairCallCount,
      1,
      'non-forced snapshots should still attempt one authoritative repair before degrading',
    );
    t.same(
      result,
      localSnapshot,
      'backpressure-shaped repair failures should degrade to the local snapshot instead of failing the control snapshot outright',
    );
  });
