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

test('AdminControlSnapshot preserves revisioned snapshot metadata from the shared owner contract',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
      controlPlaneSnapshotOwner: {
        async resolveControlSnapshot(localSnapshot) {
          return {
            ...localSnapshot,
            snapshotObservation: {
              state: 'stale_usable',
              revision: 22,
              revisionState: 'stale_usable',
              resumeToken: 'control-plane-revision:captured_at:22',
            },
            snapshotRevision: 22,
            snapshotRevisionState: 'stale_usable',
            snapshotResumeToken: 'control-plane-revision:captured_at:22',
            snapshotObservedAt: '2026-04-16T12:00:00.000Z',
            snapshotObservedAtMs: 1776331200000,
          };
        },
      },
    });
    snapshot.buildLocalControlSnapshot = async () => ({
      nodeId: 'node-1',
      capturedAt: 1000,
    });

    const result = await snapshot.buildControlSnapshotQueryResult();

    t.match(
      result.rows[0],
      {
        snapshotObservation: {
          state: 'stale_usable',
          revision: 22,
          revisionState: 'stale_usable',
          resumeToken: 'control-plane-revision:captured_at:22',
        },
        snapshotRevision: 22,
        snapshotRevisionState: 'stale_usable',
        snapshotResumeToken: 'control-plane-revision:captured_at:22',
        snapshotObservedAt: '2026-04-16T12:00:00.000Z',
        snapshotObservedAtMs: 1776331200000,
      },
      'query-result rows should preserve the revisioned snapshot owner contract',
    );
  });
