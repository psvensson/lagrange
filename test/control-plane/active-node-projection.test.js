import {test} from '../../src/test-helpers/tap.js';
import {
  buildReadinessByNodeId,
  resolveActiveNodeViews,
  resolveCanonicalActiveNodeIds,
  resolveLatestPublicationRow,
  resolveLatestPublishedPublicationRow,
} from '../../src/control-plane/active-node-projection.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

test('active-node projection requires readiness health and canonical websocket endpoints when available',
  async (t) => {
    const activeNodeIds = resolveCanonicalActiveNodeIds({
      nodeRows: [
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
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      ],
      nowMs: 1000,
    });

    t.same(
      activeNodeIds,
      ['node-1'],
      'only readiness-healthy nodes with canonical websocket endpoints should project as active',
    );
  });

test('active-node projection falls back to ready-lease evidence when readiness owner is unavailable',
  async (t) => {
    const activeNodeIds = resolveCanonicalActiveNodeIds({
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 2000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'connected',
          ready_lease_expires_at: 2000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 900,
        },
      ],
      nodeEndpointRows: [],
      nowMs: 1000,
    });

    t.same(
      activeNodeIds,
      ['node-1'],
      'ready-lease fallback should exclude non-ready and expired nodes',
    );
  });

test('active-node projection can include recovery-eligible nodes during publication convergence windows',
  async (t) => {
    const commonProjectionOptions = {
      nodeRows: [
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
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
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
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
          },
        },
      ],
      nowMs: 1000,
    };

    const strictProjection = resolveActiveNodeViews(commonProjectionOptions);
    const recoveryProjection = resolveActiveNodeViews({
      ...commonProjectionOptions,
      allowControlPlaneRecoveryEligibleProjection: true,
    });

    t.same(
      strictProjection.projectedServingNodeIds,
      ['node-1'],
      'steady-state projection should require clusterMemberHealthy evidence',
    );
    t.match(
      strictProjection.projectionDiagnostics,
      {
        readinessDecisionMode: 'cluster_member_healthy_only',
        readinessExcludedNodeIds: ['node-2'],
        clusterMemberUnhealthyExcludedNodeIds: ['node-2'],
        recoveryEligibleIncludedNodeIds: [],
      },
      'strict projection diagnostics should explain why the node was excluded',
    );
    t.same(
      recoveryProjection.projectedServingNodeIds,
      ['node-1', 'node-2'],
      'convergence projection should include recovery-eligible nodes',
    );
    t.match(
      recoveryProjection.projectionDiagnostics,
      {
        readinessDecisionMode: 'cluster_member_or_recovery_eligible',
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: ['node-2'],
      },
      'convergence projection diagnostics should show recovery-eligible inclusion',
    );
  });

test('active-node projection can require published membership and suppress derived fallback',
  async (t) => {
    const activeNodeIds = resolveCanonicalActiveNodeIds({
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 2000,
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
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      ],
      requirePublishedMembership: true,
      nowMs: 1000,
    });

    t.same(
      activeNodeIds,
      [],
      'strict published-membership mode should not derive active nodes from runtime evidence alone',
    );
  });

test('active-node projection separates authoritative membership from projected serving views',
  async (t) => {
    const activeNodeViews = resolveActiveNodeViews({
      nodeRows: [
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
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
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
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      ],
      publicationRows: [
        {
          publication_id: 'publication-14',
          publication_epoch: 14,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-2'],
          updated_at: 100,
        },
      ],
      nowMs: 1000,
    });

    t.same(
      activeNodeViews.authoritativeActiveNodeIds,
      ['node-2'],
      'authoritative membership should come only from the last published membership row',
    );
    t.same(
      activeNodeViews.projectedServingNodeIds,
      ['node-1', 'node-2'],
      'projected serving nodes should remain available as a separate local view',
    );
    t.same(
      activeNodeViews.suspectedOrTransitioningNodeIds,
      ['node-1'],
      'nodes that are locally serving but not yet authoritative should surface as transitioning',
    );
    t.equal(
      activeNodeViews.authoritativeSource,
      'published_membership',
      'published membership should be marked as the authoritative source when available',
    );
  });

test('active-node projection reports broad-suspicion membership freeze against the last published set',
  async (t) => {
    const activeNodeViews = resolveActiveNodeViews({
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 2000,
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      ],
      publicationRows: [
        {
          publication_id: 'publication-15',
          publication_epoch: 15,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1', 'node-2', 'node-3', 'node-4'],
          updated_at: 100,
        },
      ],
      nowMs: 1000,
    });

    t.same(
      activeNodeViews.authoritativeActiveNodeIds,
      ['node-1', 'node-2', 'node-3', 'node-4'],
      'the authoritative set should remain pinned to the last published membership during broad suspicion',
    );
    t.same(
      activeNodeViews.suspectedOrTransitioningNodeIds,
      ['node-2', 'node-3', 'node-4'],
      'missing published members should move into the suspected-or-transitioning bucket instead of shrinking the authoritative set',
    );
    t.match(
      activeNodeViews.membershipFreeze,
      {
        active: true,
        reasonCode: 'broad_suspicion',
        retainedPublishedNodeIds: ['node-1', 'node-2', 'node-3', 'node-4'],
        missingProjectedNodeIds: ['node-2', 'node-3', 'node-4'],
      },
      'broad suspicion should trip the membership freeze diagnostics',
    );
  });

test('active-node projection resolves the latest publication row from publication rows when strict mode is enabled',
  async (t) => {
    const latestPublicationRow = resolveLatestPublicationRow({
      publicationRows: [
        {
          publication_id: 'publication-1',
          publication_epoch: 7,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1'],
          updated_at: 100,
        },
        {
          publication_id: 'publication-2',
          publication_epoch: 8,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-2', 'node-3'],
          updated_at: 200,
        },
      ],
    });

    t.match(latestPublicationRow, {
      publicationId: 'publication-2',
      publicationEpoch: 8,
      publishedActiveNodeIds: ['node-2', 'node-3'],
    });
    t.same(
      resolveCanonicalActiveNodeIds({
        publicationRows: [
          {
            publication_id: 'publication-1',
            publication_epoch: 7,
            status: 'PUBLISHED',
            published_active_node_ids: ['node-1'],
            updated_at: 100,
          },
          {
            publication_id: 'publication-2',
            publication_epoch: 8,
            status: 'PUBLISHED',
            published_active_node_ids: ['node-2', 'node-3'],
            updated_at: 200,
          },
        ],
        requirePublishedMembership: true,
      }),
      ['node-2', 'node-3'],
      'strict mode should use the latest published active-node set',
    );
  });

test('active-node projection retains the latest published membership when a newer open publication exists',
  async (t) => {
    const latestPublishedPublicationRow = resolveLatestPublishedPublicationRow({
      publicationRows: [
        {
          publication_id: 'publication-7',
          publication_epoch: 7,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1', 'node-2', 'node-3'],
          updated_at: 100,
        },
      ],
      latestPublicationRow: {
        publication_id: 'publication-8',
        publication_epoch: 8,
        status: 'OPEN',
        published_active_node_ids: ['node-1', 'node-2', 'node-3', 'node-4'],
        updated_at: 200,
      },
    });

    t.match(latestPublishedPublicationRow, {
      publicationId: 'publication-7',
      publicationEpoch: 7,
      status: 'PUBLISHED',
      publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
    });
    t.same(
      resolveCanonicalActiveNodeIds({
        publicationRows: [
          {
            publication_id: 'publication-7',
            publication_epoch: 7,
            status: 'PUBLISHED',
            published_active_node_ids: ['node-1', 'node-2', 'node-3'],
            updated_at: 100,
          },
        ],
        latestPublicationRow: {
          publication_id: 'publication-8',
          publication_epoch: 8,
          status: 'OPEN',
          published_active_node_ids: ['node-1', 'node-2', 'node-3', 'node-4'],
          updated_at: 200,
        },
        requirePublishedMembership: true,
      }),
      ['node-1', 'node-2', 'node-3'],
      'strict mode should keep the latest published active-node set while a newer publication remains open',
    );
  });

test('active-node projection ignores newer non-membership publications in strict mode',
  async (t) => {
    const publicationRows = [
      {
        publication_id: 'publication-9',
        publication_kind: 'service_catalog',
        publication_epoch: 9,
        status: 'PUBLISHED',
        published_active_node_ids: [],
        updated_at: 200,
      },
      {
        publication_id: 'publication-8',
        publication_kind: 'cluster_membership',
        publication_epoch: 8,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        updated_at: 100,
      },
    ];

    t.match(
      resolveLatestPublicationRow({
        publicationRows,
      }),
      {
        publicationId: 'publication-8',
        publicationKind: 'cluster_membership',
        publicationEpoch: 8,
      },
      'latest publication resolution should ignore non-membership rows',
    );
    t.same(
      resolveCanonicalActiveNodeIds({
        publicationRows,
        requirePublishedMembership: true,
      }),
      ['node-1', 'node-2'],
      'strict mode should preserve the membership publication active-node set',
    );
  });

test('buildReadinessByNodeId normalizes node identifiers from readiness entries',
  async (t) => {
    const readinessByNodeId = buildReadinessByNodeId({
      readinessEntries: [
        {nodeId: 'node-1', dimensions: {healthy: true}},
        {node_id: 'node-2', dimensions: {healthy: true}},
        {nodeId: '', dimensions: {healthy: true}},
      ],
    });

    t.same(
      Object.keys(readinessByNodeId).sort(),
      ['node-1', 'node-2'],
      'readiness map should index both camelCase and snake_case node identifiers',
    );
  });

test('active-node projection can retain a readiness-healthy node when the node row is missing but active service evidence remains',
  async (t) => {
    const activeNodeIds = resolveCanonicalActiveNodeIds({
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 2000,
        },
      ],
      serviceRows: [
        {
          service_id: 'svc-1',
          service_type: 'message_group',
          node_id: 'node-1',
          status: 'active',
        },
        {
          service_id: 'svc-2',
          service_type: 'message_group',
          node_id: 'node-2',
          status: 'active',
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
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      ],
      nowMs: 1000,
    });

    t.same(
      activeNodeIds,
      ['node-1', 'node-2'],
      'healthy nodes with active service and endpoint evidence should remain visible even if the node row lags the cache',
    );
  });

test('active-node projection keeps readiness-healthy node rows when service evidence is present but node_endpoints lags',
  async (t) => {
    const activeNodeIds = resolveCanonicalActiveNodeIds({
      nodeRows: [
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
      serviceRows: [
        {
          service_id: 'svc-node-1',
          service_type: 'message_group',
          node_id: 'node-1',
          status: 'active',
          address: 'node-1/message-group/svc-node-1',
        },
        {
          service_id: 'svc-node-2',
          service_type: 'message_group',
          node_id: 'node-2',
          status: 'active',
          address: 'node-2/message-group/svc-node-2',
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
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      ],
      nowMs: 1000,
    });

    t.same(
      activeNodeIds,
      ['node-1', 'node-2'],
      'healthy nodes with active service evidence should remain active even when endpoint coverage lags behind repaired discovery rows',
    );
  });

test('active-node projection tolerates transient stopped node rows when ready heartbeats remain fresh',
  async (t) => {
    const activeNodeIds = resolveCanonicalActiveNodeIds({
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 2000,
          last_heartbeat: 995,
        },
        {
          node_id: 'node-2',
          status: 'stopped',
          connection_state: 'ready',
          ready_lease_expires_at: 950,
          last_heartbeat: 995,
        },
      ],
      serviceRows: [
        {
          service_id: 'svc-node-1',
          service_type: 'message_group',
          node_id: 'node-1',
          status: 'active',
          address: 'node-1/message-group/svc-node-1',
        },
        {
          service_id: 'svc-node-2',
          service_type: 'message_group',
          node_id: 'node-2',
          status: 'active',
          address: 'node-2/message-group/svc-node-2',
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
      ],
      nowMs: 1000,
    });

    t.same(
      activeNodeIds,
      ['node-1', 'node-2'],
      'recent heartbeat evidence should keep a ready node active even when its status row transiently regresses to stopped',
    );
  });

test('active-node projection excludes stopped nodes after heartbeat grace expires',
  async (t) => {
    const activeNodeIds = resolveCanonicalActiveNodeIds({
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 71000,
          last_heartbeat: 70995,
        },
        {
          node_id: 'node-2',
          status: 'stopped',
          connection_state: 'ready',
          ready_lease_expires_at: 1000,
          last_heartbeat: 1000,
        },
      ],
      serviceRows: [
        {
          service_id: 'svc-node-1',
          service_type: 'message_group',
          node_id: 'node-1',
          status: 'active',
          address: 'node-1/message-group/svc-node-1',
        },
        {
          service_id: 'svc-node-2',
          service_type: 'message_group',
          node_id: 'node-2',
          status: 'active',
          address: 'node-2/message-group/svc-node-2',
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
      ],
      nowMs: 70000,
    });

    t.same(
      activeNodeIds,
      ['node-1'],
      'heartbeat grace should not keep a stopped node active indefinitely once its liveness evidence has aged out',
    );
  });

test('active-node projection excludes stopped nodes at the heartbeat grace boundary',
  async (t) => {
    const activeNodeIds = resolveCanonicalActiveNodeIds({
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 71000,
          last_heartbeat: 70995,
        },
        {
          node_id: 'node-2',
          status: 'stopped',
          connection_state: 'ready',
          ready_lease_expires_at: 1000,
          last_heartbeat: 1000,
        },
      ],
      serviceRows: [
        {
          service_id: 'svc-node-1',
          service_type: 'message_group',
          node_id: 'node-1',
          status: 'active',
          address: 'node-1/message-group/svc-node-1',
        },
        {
          service_id: 'svc-node-2',
          service_type: 'message_group',
          node_id: 'node-2',
          status: 'active',
          address: 'node-2/message-group/svc-node-2',
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
      ],
      nowMs: 61000,
    });

    t.same(
      activeNodeIds,
      ['node-1'],
      'heartbeat evidence at the exact grace cutoff should no longer keep a stopped node projected active',
    );
  });

test('active-node projection prefers the durable published active-node set when a publication epoch is closed',
  async (t) => {
    const activeNodeIds = resolveCanonicalActiveNodeIds({
      nodeRows: [
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
      serviceRows: [
        {
          service_id: 'svc-node-1',
          service_type: 'message_group',
          node_id: 'node-1',
          status: 'active',
        },
        {
          service_id: 'svc-node-2',
          service_type: 'message_group',
          node_id: 'node-2',
          status: 'active',
        },
        {
          service_id: 'svc-node-3',
          service_type: 'message_group',
          node_id: 'node-3',
          status: 'active',
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
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      ],
      latestPublicationRow: {
        publication_epoch: 14,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-3'],
      },
      nowMs: 1000,
    });

    t.same(
      activeNodeIds,
      ['node-1', 'node-3'],
      'projection should prefer the durable published active-node set over repaired cache observation once the epoch is closed',
    );
  });
