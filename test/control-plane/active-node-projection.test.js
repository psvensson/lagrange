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
  PROVISIONING_ELIGIBILITY_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  buildProjectionReadinessContract,
} from '../../src/control-plane/projection-readiness-state.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/publication-owner-constants.js';

import {
  registerActiveNodeProjectionLaggingEvidenceTests,
} from './active-node-projection-lagging-evidence-test-cases.js';
import {
  registerActiveNodeProjectionMembershipPublicationTests,
} from './active-node-projection-membership-publication-test-cases.js';

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
test('active-node projection consumes projection readiness lane outcome',
  async (t) => {
    const repairOnlyReadiness = buildProjectionReadinessContract({
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
        [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
        [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
          true,
        [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
      },
      membershipPublication: {
        publicationEpoch: 31,
        status: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        requiredAckNodeIds: ['node-2'],
        acknowledgedNodeIds: [],
      },
    });
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
      readinessByNodeId: {
        'node-1': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        'node-2': repairOnlyReadiness,
      },
      nowMs: 1000,
    };

    t.same(
      resolveCanonicalActiveNodeIds(commonProjectionOptions),
      ['node-1'],
      'steady projection should not treat repair-only readiness as serve-ready',
    );
    t.same(
      resolveCanonicalActiveNodeIds({
        ...commonProjectionOptions,
        allowControlPlaneRecoveryEligibleProjection: true,
      }),
      ['node-1', 'node-2'],
      'recovery projection should consume the explicit repair lane',
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

registerActiveNodeProjectionLaggingEvidenceTests();
registerActiveNodeProjectionMembershipPublicationTests();
