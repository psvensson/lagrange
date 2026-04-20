import {test} from '../../src/test-helpers/tap.js';
import {
  buildLocalControlPlaneMutationReadinessFailure,
  buildSystemTableMutationRoutingGapFailure,
  CONTROL_PLANE_MUTATION_PUBLISHED_CONVERGENCE_PENDING,
  CONTROL_PLANE_MUTATION_ROUTING_GAP_REASON,
  CONTROL_PLANE_MUTATION_ROUTING_GAP_FAILED_DIMENSION,
  getLocalControlPlaneMutationReadinessBlocker,
  getSystemTableMutationRoutingGapBlocker,
  hasControlPlaneMutationRoutingGapFailureSignature,
} from '../../src/control-plane/control-plane-mutation-readiness.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

test('control-plane mutation readiness blocks non-critical work while published convergence is still pending', async (t) => {
  const blocker = getLocalControlPlaneMutationReadinessBlocker({
    nodeId: 'node-1',
    requirePublishedConvergence: true,
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]: true,
          },
          reasons: [],
          priorityControlPlaneRecovery: {
            active: true,
            reasonCodes: ['publication_epoch_pending'],
          },
        };
      },
    },
  });

  t.ok(blocker, 'background mutation work should be deferred while publication convergence is still open');
  t.same(
    blocker.failedDimensions,
    [CONTROL_PLANE_MUTATION_PUBLISHED_CONVERGENCE_PENDING],
  );
  t.same(
    blocker.reasonCodes,
    ['publication_epoch_pending'],
  );
});

test('control-plane mutation readiness does not block when published convergence is not required', async (t) => {
  const blocker = getLocalControlPlaneMutationReadinessBlocker({
    nodeId: 'node-1',
    requirePublishedConvergence: false,
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]: true,
          },
          reasons: [],
          priorityControlPlaneRecovery: {
            active: true,
            reasonCodes: ['publication_epoch_pending'],
          },
        };
      },
    },
  });

  t.equal(blocker, null);
});

test('control-plane mutation readiness builds one canonical deferred failure ' +
  'from the blocker snapshot', async (t) => {
  const blocker = getLocalControlPlaneMutationReadinessBlocker({
    nodeId: 'node-1',
    requirePublishedConvergence: true,
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
              true,
          },
          reasons: [],
          retryAfterMs: 125,
          runtimeAuthority: {
            state: 'establishing',
            authorityAvailable: true,
            ready: false,
            visibility: {
              state: 'pending_publication',
            },
            reasonCodes: ['publication_epoch_pending'],
          },
          priorityControlPlaneRecovery: {
            active: true,
            reasonCodes: ['publication_epoch_pending'],
          },
        };
      },
    },
  });

  const failure = buildLocalControlPlaneMutationReadinessFailure({
    blocker,
    tableName: 'tables',
    workClass: 'background',
    error: {
      message: 'Message timeout',
      retryAfterMs: 25,
    },
  });

  t.equal(failure.success, false);
  t.equal(failure.error, 'query_admission_deferred');
  t.equal(failure.outcome, 'deferred');
  t.equal(failure.deferRetry, true);
  t.equal(failure.retryAfterMs, 125);
  t.same(
    failure.reasonCodes,
    ['publication_epoch_pending'],
  );
  t.same(
    failure.failedDimensions,
    [CONTROL_PLANE_MUTATION_PUBLISHED_CONVERGENCE_PENDING],
  );
  t.equal(
    failure.runtimeAuthority?.state,
    'establishing',
  );
  t.equal(
    failure.details?.cause,
    'Message timeout',
  );
});


test('control-plane mutation readiness emits one canonical deferred failure ' +
  'for non-widenable transaction-control routing gaps', async (t) => {
  const queryExecutor = {
    getPartitionRoutingSnapshot(partitionId) {
      if (partitionId === 'sql_transactions-p1') {
        return {
          canonicalLeaderNodeId: null,
          canonicalLeaderServiceCount: 0,
          serviceRowCount: 1,
          activeAddressedServiceCount: 1,
          routableServiceCount: 1,
          canonicalLeaderIdentityState: 'missing',
        };
      }
      if (partitionId === 'sql_write_operations-p1') {
        return {
          canonicalLeaderNodeId: 'node-2',
          canonicalLeaderServiceCount: 0,
          serviceRowCount: 0,
          activeAddressedServiceCount: 0,
          routableServiceCount: 1,
          canonicalLeaderIdentityState: 'owner_confirmed',
        };
      }
      return {
        canonicalLeaderNodeId: 'node-1',
        canonicalLeaderServiceCount: 1,
        serviceRowCount: 1,
        activeAddressedServiceCount: 1,
        routableServiceCount: 1,
        canonicalLeaderIdentityState: 'owner_confirmed',
      };
    },
    resolveCanonicalLeaderGapRecoveryRoutingContract(partitionId) {
      return {
        gapState:
          partitionId === 'sql_transactions-p1' ?
            'owner_missing' :
            'service_missing',
        recoveryCandidateWidening: false,
      };
    },
  };

  const blocker = getSystemTableMutationRoutingGapBlocker({
    queryExecutor,
    routingReadinessDimension:
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  });

  t.ok(blocker, 'routing gap blocker should be present when transaction-control owners are unresolved');
  t.same(
    blocker.failedDimensions,
    [CONTROL_PLANE_MUTATION_ROUTING_GAP_FAILED_DIMENSION],
  );
  t.same(
    blocker.reasonCodes,
    ['transaction_control_owner_missing', 'transaction_control_service_gap'],
  );

  const failure = buildSystemTableMutationRoutingGapFailure({
    blocker,
    tableName: 'tables',
    workClass: 'interactive',
    error: {
      message: 'Message timeout',
      errorCode: 'QUERY_TIMEOUT',
    },
  });

  t.equal(failure.success, false);
  t.equal(failure.error, 'query_admission_deferred');
  t.equal(failure.deferRetry, true);
  t.equal(failure.errorCode, 'QUERY_TIMEOUT');
  t.equal(failure.reasonCode, 'transaction_control_owner_missing');
  t.same(
    failure.failedDimensions,
    [CONTROL_PLANE_MUTATION_ROUTING_GAP_FAILED_DIMENSION],
  );
  t.equal(
    failure.dependencyStates?.length,
    2,
    'failure should preserve the dependency blocker summary',
  );
  t.equal(
    hasControlPlaneMutationRoutingGapFailureSignature(failure),
    true,
    'shared signature helper should identify the routing-gap defer contract',
  );
});

test('control-plane mutation readiness does not block widenable transaction-control ' +
  'routing gaps', async (t) => {
  const queryExecutor = {
    getPartitionRoutingSnapshot(partitionId) {
      if (partitionId === 'sql_transactions-p1') {
        return {
          canonicalLeaderNodeId: null,
          canonicalLeaderServiceCount: 0,
          serviceRowCount: 1,
          activeAddressedServiceCount: 1,
          routableServiceCount: 1,
          canonicalLeaderIdentityState: 'missing',
        };
      }
      if (partitionId === 'sql_write_operations-p1') {
        return {
          canonicalLeaderNodeId: 'node-2',
          canonicalLeaderServiceCount: 0,
          serviceRowCount: 1,
          activeAddressedServiceCount: 1,
          routableServiceCount: 1,
          canonicalLeaderIdentityState: 'owner_confirmed',
        };
      }
      return {
        canonicalLeaderNodeId: 'node-1',
        canonicalLeaderServiceCount: 1,
        serviceRowCount: 1,
        activeAddressedServiceCount: 1,
        routableServiceCount: 1,
        canonicalLeaderIdentityState: 'owner_confirmed',
      };
    },
    resolveCanonicalLeaderGapRecoveryRoutingContract(partitionId) {
      return {
        gapState:
          partitionId === 'sql_transactions-p1' ?
            'owner_missing' :
            'service_missing',
        recoveryCandidateWidening: true,
      };
    },
  };

  const blocker = getSystemTableMutationRoutingGapBlocker({
    queryExecutor,
    routingReadinessDimension:
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  });

  t.equal(
    blocker,
    null,
    'mutation readiness should reuse the shared widening contract instead of vetoing widenable recovery traffic',
  );

  const nonWidenableBlocker = getSystemTableMutationRoutingGapBlocker({
    queryExecutor: {
      ...queryExecutor,
      resolveCanonicalLeaderGapRecoveryRoutingContract(partitionId) {
        return {
          gapState:
            partitionId === 'sql_transactions-p1' ?
              'owner_missing' :
              'service_missing',
          recoveryCandidateWidening: false,
        };
      },
    },
    routingReadinessDimension:
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  });

  t.same(
    nonWidenableBlocker?.reasonCodes,
    [
      CONTROL_PLANE_MUTATION_ROUTING_GAP_REASON.OWNER_MISSING,
      CONTROL_PLANE_MUTATION_ROUTING_GAP_REASON.SERVICE_MISSING,
    ],
    'the blocker should still surface canonical routing-gap reasons when widening is unavailable',
  );
});
