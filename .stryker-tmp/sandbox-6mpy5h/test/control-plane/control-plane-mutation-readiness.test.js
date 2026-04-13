// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_MUTATION_PUBLISHED_CONVERGENCE_PENDING,
  getLocalControlPlaneMutationReadinessBlocker,
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