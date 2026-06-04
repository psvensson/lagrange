import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
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
  PROJECTION_READINESS_CONTRACT_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';

const MUTATION_READINESS_SOURCE_PATH = fileURLToPath(new URL(
  '../../src/control-plane/control-plane-mutation-readiness.js',
  import.meta.url,
));
const LEGACY_PUBLICATION_RECOVERY_GATE_FIELD = 'publicationRecoveryGate';
const LEGACY_PRIORITY_RECOVERY_FIELD = 'priorityControlPlaneRecovery';
const PUBLICATION_EPOCH_PENDING_REASON = 'publication_epoch_pending';
const CONTROL_PLANE_NOT_WRITABLE_REASON = 'control_plane_not_writable';

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
          projectionReadinessContract: {
            state: PROJECTION_READINESS_CONTRACT_STATE.RECOVERY_OPEN,
            ready: false,
            publication: {
              ready: false,
            },
            priorityRecovery: {
              active: false,
            },
            reasonCodes: [PUBLICATION_EPOCH_PENDING_REASON],
          },
          priorityControlPlaneRecovery: {
            active: false,
            reasonCodes: ['legacy_gate_should_not_drive_readiness'],
            publicationRecoveryGate: {
              ready: true,
            },
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
    [PUBLICATION_EPOCH_PENDING_REASON],
  );
});

test('control-plane mutation readiness ignores legacy raw recovery-gate fields ' +
  'when the canonical projection contract is publication-ready', async (t) => {
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
          projectionReadinessContract: {
            state: PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY,
            ready: true,
            publication: {
              ready: true,
            },
            priorityRecovery: {
              active: false,
            },
            reasonCodes: [],
          },
          priorityControlPlaneRecovery: {
            active: true,
            reasonCodes: [PUBLICATION_EPOCH_PENDING_REASON],
            publicationRecoveryGate: {
              ready: false,
            },
          },
        };
      },
    },
  });

  t.equal(
    blocker,
    null,
    'legacy recovery-gate fields must not rebuild published convergence',
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
            reasonCodes: [PUBLICATION_EPOCH_PENDING_REASON],
          },
        };
      },
    },
  });

  t.equal(blocker, null);
});

test('control-plane mutation readiness does not treat runtime blockers as published convergence pending once the publication gate is ready', async (t) => {
  const blocker = getLocalControlPlaneMutationReadinessBlocker({
    nodeId: 'node-1',
    requirePublishedConvergence: true,
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
              true,
          },
          reasons: [],
          projectionReadinessContract: {
            state: PROJECTION_READINESS_CONTRACT_STATE.RECOVERY_OPEN,
            ready: false,
            publication: {
              ready: true,
            },
            priorityRecovery: {
              active: false,
            },
            reasonCodes: [CONTROL_PLANE_NOT_WRITABLE_REASON],
          },
          priorityControlPlaneRecovery: {
            active: true,
            reasonCodes: ['legacy_gate_should_not_drive_readiness'],
            publicationRecoveryGate: {
              ready: false,
            },
          },
        };
      },
    },
  });

  t.ok(
    blocker,
    'runtime blockers should still produce a blocker snapshot',
  );
  t.same(
    blocker.failedDimensions,
    [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE],
    'the blocker should report only the runtime readiness failure once publication convergence is closed',
  );
  t.same(
    blocker.reasonCodes,
    ['control_plane_write_unhealthy', CONTROL_PLANE_NOT_WRITABLE_REASON],
    'the blocker should preserve both the readiness-owned runtime reason and the runtime recovery blocker vocabulary',
  );
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
          projectionReadinessContract: {
            state: PROJECTION_READINESS_CONTRACT_STATE.RECOVERY_OPEN,
            ready: false,
            publication: {
              ready: false,
            },
            priorityRecovery: {
              active: false,
            },
            reasonCodes: [PUBLICATION_EPOCH_PENDING_REASON],
          },
          runtimeAuthority: {
            state: 'establishing',
            authorityAvailable: true,
            ready: false,
            visibility: {
              state: 'pending_publication',
            },
            reasonCodes: [PUBLICATION_EPOCH_PENDING_REASON],
          },
          priorityControlPlaneRecovery: {
            active: false,
            reasonCodes: ['legacy_gate_should_not_drive_readiness'],
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
    [PUBLICATION_EPOCH_PENDING_REASON],
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

test('control-plane mutation readiness has no structural binding to legacy ' +
  'published-convergence raw fields', async (t) => {
  const source = readFileSync(MUTATION_READINESS_SOURCE_PATH, 'utf8');

  t.equal(
    source.includes(LEGACY_PUBLICATION_RECOVERY_GATE_FIELD),
    false,
    'mutation readiness must not read the transitional publication gate',
  );
  t.equal(
    source.includes(LEGACY_PRIORITY_RECOVERY_FIELD),
    false,
    'mutation readiness must consume projectionReadinessContract instead',
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

const PRIORITY_RECOVERY_BLOCKED_REASON = 'control_plane_write_unhealthy';

function buildPriorityRecoveryReadiness({
  recoveryLaneEligible,
  priorityRecoveryActive,
  extraDimensions = {},
}) {
  return {
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
        recoveryLaneEligible,
      ...extraDimensions,
    },
    reasons: [{code: PRIORITY_RECOVERY_BLOCKED_REASON}],
    projectionReadinessContract: {
      state: PROJECTION_READINESS_CONTRACT_STATE.RECOVERY_OPEN,
      ready: false,
      publication: {ready: false},
      priorityRecovery: {active: priorityRecoveryActive},
    },
  };
}

test('priority-recovery break-glass relaxes the publication-dependent write ' +
  'dimensions when the recovery lane is open during active recovery', async (t) => {
  const blocker = getLocalControlPlaneMutationReadinessBlocker({
    nodeId: 'node-1',
    allowPriorityRecoveryBypass: true,
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return buildPriorityRecoveryReadiness({
          recoveryLaneEligible: true,
          priorityRecoveryActive: true,
        });
      },
    },
  });

  t.equal(
    blocker,
    null,
    'the publication-repair write should be admitted once the recovery lane is open',
  );
});

test('priority-recovery break-glass does nothing when the caller does not ' +
  'opt in, preserving serve-grade writability for ordinary mutations', async (t) => {
  const blocker = getLocalControlPlaneMutationReadinessBlocker({
    nodeId: 'node-1',
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return buildPriorityRecoveryReadiness({
          recoveryLaneEligible: true,
          priorityRecoveryActive: true,
        });
      },
    },
  });

  t.ok(blocker, 'without opt-in the write must remain blocked');
  t.same(
    blocker.failedDimensions,
    [
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
      CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY,
    ],
    'both publication-dependent dimensions remain failed without the bypass',
  );
  t.equal(blocker.recoveryBypassApplied, false);
});

test('priority-recovery break-glass does not fire while the recovery lane is ' +
  'closed, even with the opt-in flag set', async (t) => {
  const blocker = getLocalControlPlaneMutationReadinessBlocker({
    nodeId: 'node-1',
    allowPriorityRecoveryBypass: true,
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return buildPriorityRecoveryReadiness({
          recoveryLaneEligible: false,
          priorityRecoveryActive: true,
        });
      },
    },
  });

  t.ok(blocker, 'a closed recovery lane must keep the write blocked');
  t.equal(blocker.recoveryBypassApplied, false);
});

test('priority-recovery break-glass does not fire when priority recovery is ' +
  'not active, even if the recovery-eligible dimension is set', async (t) => {
  const blocker = getLocalControlPlaneMutationReadinessBlocker({
    nodeId: 'node-1',
    allowPriorityRecoveryBypass: true,
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return buildPriorityRecoveryReadiness({
          recoveryLaneEligible: true,
          priorityRecoveryActive: false,
        });
      },
    },
  });

  t.ok(blocker, 'the bypass must require active priority recovery');
  t.equal(blocker.recoveryBypassApplied, false);
});

test('priority-recovery break-glass relaxes only the publication-dependent ' +
  'dimensions and retains other failed dimensions', async (t) => {
  const blocker = getLocalControlPlaneMutationReadinessBlocker({
    nodeId: 'node-1',
    allowPriorityRecoveryBypass: true,
    requiredDimensions: [
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
      CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED,
    ],
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return buildPriorityRecoveryReadiness({
          recoveryLaneEligible: true,
          priorityRecoveryActive: true,
          extraDimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: false,
          },
        });
      },
    },
  });

  t.ok(blocker, 'a non-relaxable failed dimension must still block the write');
  t.same(
    blocker.failedDimensions,
    [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED],
    'only the publication-dependent writability dimensions are relaxed',
  );
  t.equal(
    blocker.recoveryBypassApplied,
    true,
    'the blocker should record that the recovery bypass partially applied',
  );
});
