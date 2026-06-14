/**
 * CL-019 guards: readiness snapshot reuse must be per-change, not per-call.
 *
 * Production witness (fourth-pass freeze profiler re-rank,
 * stat-gate-20260611T163020Z run2 seed): getNodeReadinessSync at 43.8s
 * inclusive of a 56s freeze window with the full snapshot build
 * (buildEvaluatedNodeReadinessSnapshot) running constantly, because the
 * CL-012 stored-snapshot reuse predicate rejected watermark EQUALITY — the
 * steady state between heartbeats — so the sync fast path was structurally a
 * cache-lag bridge with a ~0% hit rate. The pre-check prelude additionally
 * rebuilt the full publication-recovery protocol snapshot per call from a
 * membership-publication row that changes ~once per epoch.
 *
 * Guards (each red on a partial revert):
 * 1. Watermark equality reuses the stored snapshot.
 * 2. A strictly-fresher node row forces a rebuild.
 * 3. A nodes/services cache-change invalidation forces a rebuild.
 * 4. A control_plane_publications cache change clears the diagnostics memo
 *    and invalidates ALL stored snapshots (cluster-wide marker).
 * 5. A snapshot whose heartbeat evidence aged past
 *    clusterMemberStaleHeartbeatMaxAgeMs is not reused even when recent.
 * 6. An invalidation landing mid-build (TOCTOU) survives
 *    storeReadinessSnapshot and still forces the next rebuild.
 * 7. getMembershipPublicationDiagnosticsSync memoizes per publication-row
 *    change (one row read + one build across repeated calls) — INCLUDING
 *    the production row shape, which normalizeControlPlanePublicationRow
 *    strips of created_at/updated_at (verification caught a first landing
 *    whose timestamp-gated memo condition was structurally false against
 *    real rows and never engaged).
 * 8. The list-path reuse (null publication overlay args) falls back to the
 *    stored snapshot's own publication fields instead of nulling them.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  installControlPlaneReadinessSnapshotStoreMethods,
} from '../../src/control-plane/control-plane-readiness-snapshot-store.js';
import {
  ControlPlaneReadinessEvidenceReasons,
} from '../../src/control-plane/control-plane-readiness-evidence-reasons.js';

const NODE_ID = 'node-1';
const STALE_HEARTBEAT_MAX_AGE_MS = 30_000;
const BASE_NOW_MS = 1_760_000_000_000;

function createStoreStub({nowMs = BASE_NOW_MS} = {}) {
  const state = {nowMs};
  const stub = {
    now: () => state.nowMs,
    clusterMemberStaleHeartbeatMaxAgeMs: STALE_HEARTBEAT_MAX_AGE_MS,
    lastReadinessSnapshotByNodeId: new Map(),
    lastReadinessSnapshotAtMsByNodeId: new Map(),
    lastReadinessSnapshotInvalidatedAtMsByNodeId: new Map(),
    lastReadinessSnapshotClusterInvalidatedAtMs: 0,
    membershipPublicationDiagnosticsMemo: null,
    currentRecoveryEpochByNodeId: new Map(),
    recoveryEpochHistoryByNodeId: new Map(),
    getReadinessTransitionHistory: () => Object.freeze([]),
    recordRecoveryEpochObservation: () => {},
  };
  installControlPlaneReadinessSnapshotStoreMethods(stub);
  return {stub, state};
}

function buildStoredSnapshot({
  lastHeartbeat,
  readyLeaseExpiresAt,
  publication = Object.freeze({status: 'PUBLISHED'}),
  membershipPublication = Object.freeze({publicationEpoch: 4}),
} = {}) {
  return Object.freeze({
    nodeId: NODE_ID,
    dimensions: Object.freeze({serveEligible: true}),
    reasons: Object.freeze([]),
    publication,
    membershipPublication,
    nodeEvidence: Object.freeze({
      lastHeartbeat,
      readyLeaseExpiresAt,
      rowConnectionState: 'ready',
    }),
  });
}

function seedStoredSnapshot(stub, snapshot, capturedAtMs) {
  stub.lastReadinessSnapshotByNodeId.set(NODE_ID, snapshot);
  stub.lastReadinessSnapshotAtMsByNodeId.set(NODE_ID, capturedAtMs);
}

test('CL-019: per-change readiness snapshot reuse', async (t) => {
  await t.test('watermark equality reuses the stored snapshot', async (t) => {
    const {stub} = createStoreStub();
    const heartbeat = BASE_NOW_MS - 2_000;
    const lease = BASE_NOW_MS + 10_000;
    const stored = buildStoredSnapshot({
      lastHeartbeat: heartbeat,
      readyLeaseExpiresAt: lease,
    });
    seedStoredSnapshot(stub, stored, BASE_NOW_MS - 1_000);
    const nodeRow = {
      node_id: NODE_ID,
      last_heartbeat: heartbeat,
      ready_lease_expires_at: lease,
      connection_state: 'ready',
    };

    const reused = stub.getFresherStoredReadinessSnapshot(
      NODE_ID,
      nodeRow,
      {status: 'PUBLISHED'},
      {publicationEpoch: 4},
    );

    t.ok(reused, 'equality (steady state between heartbeats) reuses');
    t.equal(
      reused.dimensions,
      stored.dimensions,
      'reused snapshot carries the stored dimensions',
    );
  });

  await t.test('strictly fresher node row forces a rebuild', async (t) => {
    const {stub} = createStoreStub();
    const heartbeat = BASE_NOW_MS - 5_000;
    const lease = BASE_NOW_MS + 10_000;
    seedStoredSnapshot(
      stub,
      buildStoredSnapshot({
        lastHeartbeat: heartbeat,
        readyLeaseExpiresAt: lease,
      }),
      BASE_NOW_MS - 4_000,
    );
    const fresherRow = {
      node_id: NODE_ID,
      last_heartbeat: heartbeat + 3_000,
      ready_lease_expires_at: lease,
      connection_state: 'ready',
    };

    const reused = stub.getFresherStoredReadinessSnapshot(
      NODE_ID,
      fresherRow,
      null,
      null,
    );

    t.equal(reused, null, 'row advanced past the snapshot: rebuild');
  });

  await t.test(
    'node cache-change invalidation forces a rebuild despite equality',
    async (t) => {
      const {stub} = createStoreStub();
      const heartbeat = BASE_NOW_MS - 2_000;
      const lease = BASE_NOW_MS + 10_000;
      seedStoredSnapshot(
        stub,
        buildStoredSnapshot({
          lastHeartbeat: heartbeat,
          readyLeaseExpiresAt: lease,
        }),
        BASE_NOW_MS - 1_000,
      );
      stub.handleCacheChange('nodes', {node_id: NODE_ID, status: 'draining'});
      const nodeRow = {
        node_id: NODE_ID,
        last_heartbeat: heartbeat,
        ready_lease_expires_at: lease,
        connection_state: 'ready',
      };

      const reused = stub.getFresherStoredReadinessSnapshot(
        NODE_ID,
        nodeRow,
        null,
        null,
      );

      t.equal(reused, null, 'invalidated snapshot is not reused');
    },
  );

  await t.test(
    'publication cache change clears the memo and invalidates all snapshots',
    async (t) => {
      const {stub} = createStoreStub();
      const heartbeat = BASE_NOW_MS - 2_000;
      const lease = BASE_NOW_MS + 10_000;
      seedStoredSnapshot(
        stub,
        buildStoredSnapshot({
          lastHeartbeat: heartbeat,
          readyLeaseExpiresAt: lease,
        }),
        BASE_NOW_MS - 1_000,
      );
      stub.membershipPublicationDiagnosticsMemo = {diagnostics: {}};

      stub.handleCacheChange('control_plane_publications', {
        publication_id: 'pub-1',
      });

      t.equal(
        stub.membershipPublicationDiagnosticsMemo,
        null,
        'diagnostics memo cleared',
      );
      const nodeRow = {
        node_id: NODE_ID,
        last_heartbeat: heartbeat,
        ready_lease_expires_at: lease,
        connection_state: 'ready',
      };
      const reused = stub.getFresherStoredReadinessSnapshot(
        NODE_ID,
        nodeRow,
        null,
        null,
      );
      t.equal(
        reused,
        null,
        'cluster-wide invalidation rejects reuse for every node',
      );
    },
  );

  await t.test(
    'snapshot whose heartbeat evidence aged past the health threshold is not reused',
    async (t) => {
      const {stub, state} = createStoreStub();
      const heartbeat = BASE_NOW_MS - 2_000;
      seedStoredSnapshot(
        stub,
        buildStoredSnapshot({
          lastHeartbeat: heartbeat,
          readyLeaseExpiresAt: null,
        }),
        BASE_NOW_MS - 1_000,
      );
      // Advance time so the snapshot capture is still inside the capture-age
      // window but the heartbeat itself is past the health threshold: a
      // silently-dead node produces no row change and no marker.
      state.nowMs = heartbeat + STALE_HEARTBEAT_MAX_AGE_MS + 1_000;
      const nodeRow = {
        node_id: NODE_ID,
        last_heartbeat: heartbeat,
        connection_state: 'ready',
      };

      const reused = stub.getFresherStoredReadinessSnapshot(
        NODE_ID,
        nodeRow,
        null,
        null,
      );

      t.equal(
        reused,
        null,
        'reuse expires when the rebuild path would flip health',
      );
    },
  );

  await t.test(
    'invalidation landing mid-build survives the store (TOCTOU)',
    async (t) => {
      const {stub, state} = createStoreStub();
      const buildStartedAtMs = BASE_NOW_MS;
      // Marker lands AFTER the build started reading its inputs.
      stub.lastReadinessSnapshotInvalidatedAtMsByNodeId.set(
        NODE_ID,
        buildStartedAtMs + 5,
      );
      state.nowMs = buildStartedAtMs + 10;

      stub.storeReadinessSnapshot(
        NODE_ID,
        buildStoredSnapshot({
          lastHeartbeat: buildStartedAtMs,
          readyLeaseExpiresAt: buildStartedAtMs + 15_000,
        }),
        buildStartedAtMs,
      );

      t.ok(
        stub.lastReadinessSnapshotInvalidatedAtMsByNodeId.has(NODE_ID),
        'mid-build marker is kept',
      );
      t.equal(
        stub.isReadinessSnapshotInvalidated(NODE_ID),
        true,
        'snapshot is still considered invalidated',
      );

      // Control: a marker that PREDATES the build is consumed.
      stub.lastReadinessSnapshotInvalidatedAtMsByNodeId.set(
        NODE_ID,
        buildStartedAtMs - 5,
      );
      stub.storeReadinessSnapshot(
        NODE_ID,
        buildStoredSnapshot({
          lastHeartbeat: buildStartedAtMs,
          readyLeaseExpiresAt: buildStartedAtMs + 15_000,
        }),
        buildStartedAtMs,
      );
      t.equal(
        stub.lastReadinessSnapshotInvalidatedAtMsByNodeId.has(NODE_ID),
        false,
        'pre-build marker is consumed by the store',
      );
    },
  );

  await t.test(
    'membership publication diagnostics memoize per row change',
    async (t) => {
      const counters = {rowReads: 0, builds: 0};
      const row = {
        publication_id: 'pub-1',
        publication_epoch: 4,
        status: 'PUBLISHED',
        created_at: BASE_NOW_MS - 60_000,
        updated_at: BASE_NOW_MS - 30_000,
      };
      const stub = {
        membershipPublicationService: {
          getLatestClusterPublicationSync: () => row,
        },
        membershipPublicationDiagnosticsMemo: null,
        getLatestMembershipPublicationRowSync: () => {
          counters.rowReads += 1;
          return row;
        },
        buildMembershipPublicationDiagnostics: (sourceRow) => {
          counters.builds += 1;
          return Object.freeze({publicationEpoch: sourceRow.publication_epoch});
        },
      };
      const method =
        ControlPlaneReadinessEvidenceReasons.prototype
          .getMembershipPublicationDiagnosticsSync;

      const first = method.call(stub, NODE_ID, BASE_NOW_MS);
      const second = method.call(stub, NODE_ID, BASE_NOW_MS + 1_000);

      t.equal(counters.rowReads, 1, 'one row read across repeated calls');
      t.equal(counters.builds, 1, 'one protocol-snapshot build');
      t.equal(second, first, 'memoized diagnostics object returned');

      // Publication change: the cache-change handler clears the memo.
      stub.membershipPublicationDiagnosticsMemo = null;
      method.call(stub, NODE_ID, BASE_NOW_MS + 2_000);
      t.equal(counters.builds, 2, 'rebuilds once after invalidation');

      // TARGET_NODE scope reads are node-dependent: never memoized.
      stub.membershipPublicationDiagnosticsMemo = null;
      method.call(stub, NODE_ID, BASE_NOW_MS + 3_000, {scope: 'target_node'});
      t.equal(
        stub.membershipPublicationDiagnosticsMemo,
        null,
        'non-cluster scope does not populate the memo',
      );
    },
  );

  await t.test(
    'production-shaped rows (no created_at/updated_at) memoize',
    async (t) => {
      // normalizeControlPlanePublicationRow emits camelCase fields and NO
      // created_at/updated_at — this is what getLatestClusterPublicationSync
      // returns in production. The memo MUST engage for this shape; a
      // timestamp-gated memo condition is structurally false against it.
      const counters = {builds: 0};
      const productionRow = {
        publicationId: 'pub-1',
        publicationKind: 'membership',
        publicationEpoch: 4,
        status: 'PUBLISHED',
        publishedActiveNodeIds: [NODE_ID],
      };
      const stub = {
        membershipPublicationService: {
          getLatestClusterPublicationSync: () => productionRow,
        },
        membershipPublicationDiagnosticsMemo: null,
        getLatestMembershipPublicationRowSync: () => productionRow,
        buildMembershipPublicationDiagnostics: (sourceRow) => {
          counters.builds += 1;
          return Object.freeze({publicationEpoch: sourceRow.publicationEpoch});
        },
      };
      const method =
        ControlPlaneReadinessEvidenceReasons.prototype
          .getMembershipPublicationDiagnosticsSync;

      const first = method.call(stub, NODE_ID, BASE_NOW_MS);
      const second = method.call(stub, NODE_ID, BASE_NOW_MS + 1_000);

      t.equal(counters.builds, 1, 'one build across repeated calls');
      t.equal(second, first, 'memoized diagnostics returned');
      t.ok(
        stub.membershipPublicationDiagnosticsMemo,
        'memo engaged for the production row shape',
      );
    },
  );

  await t.test(
    'transition-history view is memoized until the next recorded transition',
    async (t) => {
      const stub = {
        readinessTransitionHistoryByNodeId: new Map([
          [
            NODE_ID,
            [
              Object.freeze({
                nodeId: NODE_ID,
                observedAtMs: BASE_NOW_MS,
                reasonCodes: Object.freeze([]),
                previousReasonCodes: Object.freeze([]),
                flippedDimensions: Object.freeze(['serveEligible']),
                rawInputs: Object.freeze({}),
              }),
            ],
          ],
        ]),
        readinessTransitionHistoryViewByNodeId: new Map(),
      };
      const method =
        ControlPlaneReadinessEvidenceReasons.prototype
          .getReadinessTransitionHistory;

      const first = method.call(stub, NODE_ID);
      const second = method.call(stub, NODE_ID);

      t.equal(second, first, 'repeated reads return the memoized view');
      t.equal(first.length, 1, 'view content preserved');
      t.ok(Object.isFrozen(first), 'view is frozen');

      // The single writer invalidates the view.
      stub.readinessTransitionHistoryViewByNodeId.delete(NODE_ID);
      const third = method.call(stub, NODE_ID);
      t.not(third, first, 'view rebuilt after invalidation');
    },
  );

  await t.test(
    'null overlay args fall back to the stored publication fields',
    async (t) => {
      const {stub} = createStoreStub();
      const heartbeat = BASE_NOW_MS - 2_000;
      const lease = BASE_NOW_MS + 10_000;
      const stored = buildStoredSnapshot({
        lastHeartbeat: heartbeat,
        readyLeaseExpiresAt: lease,
      });
      seedStoredSnapshot(stub, stored, BASE_NOW_MS - 1_000);
      const nodeRow = {
        node_id: NODE_ID,
        last_heartbeat: heartbeat,
        ready_lease_expires_at: lease,
        connection_state: 'ready',
      };

      const reused = stub.getFresherStoredReadinessSnapshot(
        NODE_ID,
        nodeRow,
        null,
        null,
      );

      t.ok(reused, 'list path reuses on equality');
      t.equal(
        reused.publication,
        stored.publication,
        'publication falls back to the stored field',
      );
      t.equal(
        reused.membershipPublication,
        stored.membershipPublication,
        'membershipPublication falls back to the stored field',
      );
    },
  );
});
