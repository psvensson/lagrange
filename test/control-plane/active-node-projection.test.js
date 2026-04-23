import {test} from '../../src/test-helpers/tap.js';
import {
  buildMembershipPublicationActiveSnapshot,
  buildReadinessByNodeId,
  resolveActiveNodeViews,
  resolveCanonicalActiveNodeIds,
  resolveLatestPublicationRow,
  resolveLatestPublishedPublicationRow,
  resolvePublishedActiveNodeIds,
} from '../../src/control-plane/active-node-projection.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  PROVISIONING_ELIGIBILITY_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';

const ACTIVE_NODE_ADMISSION_STATE_BLOCKED = 'blocked';
const ACTIVE_NODE_ADMISSION_REASON_CLUSTER_INTEGRITY =
  'cluster_incarnation_identity_mismatch';
const ACTIVE_NODE_BLOCKED_FENCE = Object.freeze({
  state: 'identity_mismatch',
  allowed: false,
  reasonCodes: Object.freeze([ACTIVE_NODE_ADMISSION_REASON_CLUSTER_INTEGRITY]),
});

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
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
          },
          runtimeAuthority: {
            state: RUNTIME_AUTHORITY_STATE.ESTABLISHING,
            provisioning: {
              state: PROVISIONING_ELIGIBILITY_STATE.CONVERGENCE_GRACE,
              eligible: true,
            },
            visibility: {
              state: RUNTIME_AUTHORITY_VISIBILITY_STATE.PENDING_PUBLICATION,
              published: false,
            },
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
        runtimeAuthorityIncludedNodeIds: ['node-2'],
      },
      'convergence projection diagnostics should show recovery-eligible inclusion',
    );
  });
test('active-node projection can use runtime authority when dimensions lag',
  async (t) => {
    const projection = resolveActiveNodeViews({
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
          runtimeAuthority: {
            state: RUNTIME_AUTHORITY_STATE.ESTABLISHING,
            provisioning: {
              state: PROVISIONING_ELIGIBILITY_STATE.CONVERGENCE_GRACE,
              eligible: true,
            },
            visibility: {
              state: RUNTIME_AUTHORITY_VISIBILITY_STATE.PENDING_PUBLICATION,
              published: false,
            },
          },
        },
      ],
      allowControlPlaneRecoveryEligibleProjection: true,
      nowMs: 1000,
    });

    t.same(
      projection.projectedServingNodeIds,
      ['node-1'],
      'runtime authority should keep projection discussable when dimension rows lag',
    );
    t.match(
      projection.projectionDiagnostics,
      {
        runtimeAuthorityIncludedNodeIds: ['node-1'],
        recoveryEligibleIncludedNodeIds: [],
      },
    );
  });
test('active-node projection can retain recovery-eligible nodes when endpoint and service rows lag',
  async (t) => {
    const projectionOptions = {
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
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        },
      ],
      nowMs: 1000,
    };

    const strictProjection = resolveActiveNodeViews(projectionOptions);
    const recoveryProjection = resolveActiveNodeViews({
      ...projectionOptions,
      allowControlPlaneRecoveryEligibleProjection: true,
    });

    t.same(
      strictProjection.projectedServingNodeIds,
      ['node-1'],
      'strict projection should exclude nodes without endpoint/service evidence',
    );
    t.same(
      recoveryProjection.projectedServingNodeIds,
      ['node-1', 'node-2'],
      'recovery projection should keep recovery-eligible nodes even when discovery evidence lags',
    );
    t.match(
      recoveryProjection.projectionDiagnostics,
      {
        readinessDecisionMode: 'cluster_member_or_recovery_eligible',
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: ['node-2'],
      },
      'projection diagnostics should explicitly record recovery-eligibility inclusion',
    );
  });
test('active-node projection can fail open on fresh liveness when recovery projection is enabled',
  async (t) => {
    const projectionOptions = {
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 3000,
        },
      ],
      serviceRows: [
        {
          service_id: 'svc-1',
          node_id: 'node-1',
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
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
        },
      ],
      allowControlPlaneRecoveryEligibleProjection: true,
      nowMs: 1000,
    };

    const strictRecoveryProjection = resolveActiveNodeViews(projectionOptions);
    const livenessFallbackProjection = resolveActiveNodeViews({
      ...projectionOptions,
      allowLivenessFallbackProjection: true,
    });

    t.same(
      strictRecoveryProjection.projectedServingNodeIds,
      [],
      'without liveness fail-open, negative readiness evidence should keep the node out of projection',
    );
    t.same(
      livenessFallbackProjection.projectedServingNodeIds,
      ['node-1'],
      'fresh liveness should keep the node in projection during recovery fail-open mode',
    );
    t.match(
      livenessFallbackProjection.projectionDiagnostics,
      {
        livenessFallbackIncludedNodeIds: ['node-1'],
      },
      'diagnostics should record liveness-based fail-open inclusion',
    );
  });
test('active-node projection can retain connected healthy nodes when discovery rows lag',
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
          nodeEvidence: {
            transportConnected: true,
          },
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: 'node-2',
          nodeEvidence: {
            transportConnected: true,
          },
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      ],
      connectedNodeIds: ['node-2'],
      nowMs: 1000,
    });

    t.same(
      activeNodeViews.projectedServingNodeIds,
      ['node-1', 'node-2'],
      'live transport connectivity should keep healthy connected nodes in projection while endpoint rows catch up',
    );
  });
test('active-node projection can retain the responsive local node when self rows lag',
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
      localNodeId: 'node-2',
      localNodeResponsive: true,
      nowMs: 1000,
    });

    t.same(
      activeNodeViews.projectedServingNodeIds,
      ['node-1', 'node-2'],
      'a responsive local node should not disappear from local projection just because replicated self rows are delayed',
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
test('active-node projection keeps durable published membership from the latest ack-pending publication when published history is unavailable',
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
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 2000,
        },
      ],
      serviceRows: [
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
        publication_epoch: 8,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
      },
      nowMs: 1000,
    });

    t.same(
      activeNodeViews.authoritativeActiveNodeIds,
      ['node-1', 'node-2'],
      'projection should retain the durable published membership even when only the latest ack-pending row is visible',
    );
    t.same(
      activeNodeViews.projectedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'projection should still surface the wider local serving projection separately',
    );
    t.equal(
      activeNodeViews.publishedMembershipAvailable,
      true,
      'projection should continue advertising published membership availability from the durable published set',
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
test('active-node projection builds a canonical membership publication snapshot from publication rows',
  async (t) => {
    const snapshot = buildMembershipPublicationActiveSnapshot({
      publication_epoch: 19,
      status: 'PUBLISHED',
      source_topology_epoch: 7,
      source_snapshot_version: 23,
      published_active_node_ids: ['node-a'],
      required_ack_node_ids: ['node-a', 'node-b'],
      acknowledged_node_ids: ['node-a'],
      priority_partition_summary: {
        satisfied: false,
        missingPartitionIds: ['sql_transactions-p1'],
      },
      recovery_active_node_ids: ['node-a', 'node-b'],
      recovery_active_node_source: 'recovery_eligible_projection',
      membership_lifecycle_summary: {
        projectionDiagnostics: {
          recoveryEligibleIncludedNodeIds: ['node-b'],
        },
      },
    });

    t.match(snapshot, {
      publicationEpoch: 19,
      status: 'PUBLISHED',
      publicationStatus: 'PUBLISHED',
      sourceTopologyEpoch: 7,
      sourceSnapshotVersion: 23,
      publishedActiveNodeIdsPresent: true,
      publishedActiveNodeIds: ['node-a'],
      requiredAckNodeIds: ['node-a', 'node-b'],
      acknowledgedNodeIds: ['node-a'],
      recoveryActiveNodeIds: ['node-a', 'node-b'],
      recoveryActiveNodeSource: 'recovery_eligible_projection',
      missingPublishedRecoveryActiveNodeIds: ['node-b'],
    });
    t.same(
      snapshot?.projectionDiagnostics,
      {
        recoveryEligibleIncludedNodeIds: ['node-b'],
      },
      'canonical publication snapshots should preserve projection diagnostics once at the owner boundary',
    );
  });

test('active-node projection excludes an admission-blocked target from the concrete recovery cohort',
  async (t) => {
    const snapshot = buildMembershipPublicationActiveSnapshot({
      publication_epoch: 23,
      status: 'PUBLISHED',
      target_node_id: 'node-c',
      admission_state: ACTIVE_NODE_ADMISSION_STATE_BLOCKED,
      admission_reason_codes: [
        ACTIVE_NODE_ADMISSION_REASON_CLUSTER_INTEGRITY,
      ],
      cluster_incarnation_fence: ACTIVE_NODE_BLOCKED_FENCE,
      published_active_node_ids: ['node-a', 'node-b', 'node-c'],
      membership_lifecycle_summary: {
        publishedActiveNodeIds: ['node-a', 'node-b', 'node-c'],
        projectedServingNodeIds: ['node-a', 'node-b', 'node-c'],
        locallyEligibleNodeIds: ['node-a', 'node-b', 'node-c'],
        participationByNodeId: {
          'node-c': {
            nodeId: 'node-c',
            state: 'recovery_pending_publish',
            admissionState: ACTIVE_NODE_ADMISSION_STATE_BLOCKED,
            admissionReasonCodes: [
              ACTIVE_NODE_ADMISSION_REASON_CLUSTER_INTEGRITY,
            ],
            clusterIncarnationFence: ACTIVE_NODE_BLOCKED_FENCE,
          },
        },
      },
      recovery_active_node_ids: ['node-a', 'node-b', 'node-c'],
      recovery_active_node_source: 'recovery_eligible_projection',
    });

    t.same(
      snapshot?.publishedActiveNodeIds,
      ['node-a', 'node-b', 'node-c'],
      'the durable publication snapshot should remain observable while admission is blocked',
    );
    t.same(
      snapshot?.concreteEligibleNodeIds,
      ['node-a', 'node-b'],
      'the concrete recovery cohort should exclude the blocked target node',
    );
    t.same(
      snapshot?.recoveryActiveNodeIds,
      ['node-a', 'node-b'],
      'the recovery-active cohort should follow the admitted participation set',
    );
    t.same(
      snapshot?.missingPublishedRecoveryActiveNodeIds,
      [],
      'removing the blocked target from the admitted cohort should not fabricate a missing-publication gap',
    );
  });

test('active-node projection preserves explicit published-membership presence even when the node array is absent',
  async (t) => {
    const snapshot = buildMembershipPublicationActiveSnapshot({
      publicationEpoch: 11,
      status: 'OPEN',
      publishedActiveNodeIdsPresent: true,
      membershipLifecycleSummary: {
        recoveryActiveNodeIds: ['node-a'],
        recoveryActiveNodeSource: 'locally_eligible_projection',
      },
    });

    t.equal(snapshot?.publishedActiveNodeIdsPresent, true);
    t.same(snapshot?.publishedActiveNodeIds, []);
    t.same(snapshot?.recoveryActiveNodeIds, ['node-a']);
    t.equal(
      snapshot?.recoveryActiveNodeSource,
      'locally_eligible_projection',
    );
  });
test('active-node projection augments stale explicit recovery-active node ids with fresher locally eligible projection',
  async (t) => {
    const snapshot = buildMembershipPublicationActiveSnapshot({
      publication_epoch: 27,
      status: 'PUBLISHED',
      published_active_node_ids: ['node-a', 'node-b', 'node-c'],
      recovery_active_node_ids: ['node-a', 'node-b', 'node-c'],
      recovery_active_node_source: 'published_membership',
      membership_lifecycle_summary: {
        projectedServingNodeIds: ['node-a', 'node-b', 'node-c', 'node-d'],
        locallyEligibleNodeIds: ['node-a', 'node-b', 'node-c', 'node-d'],
      },
    });

    t.same(
      snapshot?.recoveryActiveNodeIds,
      ['node-a', 'node-b', 'node-c', 'node-d'],
      'stale explicit recovery-active node ids should not suppress fresher projected eligibility',
    );
    t.same(
      snapshot?.missingPublishedRecoveryActiveNodeIds,
      ['node-d'],
      'the publication snapshot should keep exposing which fresher recovery-active nodes still need publication convergence',
    );
  });

test('resolvePublishedActiveNodeIds only trusts durable published membership rows',
  async (t) => {
    const publishedActiveNodeIds = resolvePublishedActiveNodeIds({
      latestPublicationRow: {
        publication_epoch: 12,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 11,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1', 'node-2'],
      },
    });

    t.same(
      publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'published membership should fall back to the last durable published epoch instead of an in-flight row',
    );
  });
