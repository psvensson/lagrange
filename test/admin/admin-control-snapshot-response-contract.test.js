import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';

function createSnapshot() {
  return new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
  });
}

test('AdminControlSnapshot exposes explicit publication response state when available',
  async (t) => {
    const snapshot = createSnapshot();

    const diagnostics = snapshot.resolvePublicationConvergenceDiagnostics([], {
      publicationEpoch: 12,
      status: 'ACK_PENDING',
      publishedActiveNodeIds: ['node-1'],
      requiredAckNodeIds: ['node-1', 'node-2'],
      acknowledgedNodeIds: ['node-1'],
      publishedAt: 111,
      updatedAt: 222,
      membershipLifecycleSummary: {
        publishedActiveNodeIds: ['node-1'],
        projectedServingNodeIds: ['node-1', 'node-2'],
        locallyEligibleNodeIds: ['node-1', 'node-2'],
        recoveryActiveNodeIds: ['node-1', 'node-2'],
        recoveryActiveNodeSource: 'recovery_eligible_projection',
        missingPublishedRecoveryActiveNodeIds: ['node-2'],
      },
    });

    t.same(
      diagnostics.publicationObservation,
      {
        state: 'available',
        epoch: 12,
        status: 'ACK_PENDING',
      },
      'publication convergence diagnostics should expose explicit availability',
    );
    t.same(diagnostics.timestamps.publishedAt, {
      state: 'known',
      value: 111,
    });
    t.same(diagnostics.timestamps.updatedAt, {
      state: 'known',
      value: 222,
    });
  });

test('AdminControlSnapshot exposes explicit publication response state when unavailable',
  async (t) => {
    const snapshot = createSnapshot();

    const diagnostics = snapshot.resolvePublicationConvergenceDiagnostics();

    t.same(
      diagnostics,
      {
        publicationObservation: {
          state: 'unavailable',
        },
        timestamps: {
          publishedAt: {
            state: 'unavailable',
          },
          updatedAt: {
            state: 'unavailable',
          },
        },
      },
      'absence should be encoded explicitly instead of returning null',
    );
  });
