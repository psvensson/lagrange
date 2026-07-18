/**
 * Regression tests for per-table mutation-version arbitration of readiness
 * snapshot reuse (epic formation-complexity-consolidation, O2 / quest
 * per-table-cache-version-consolidation).
 *
 * Bug class (2026-07-18 mixed-revision incident): the reuse predicate
 * arbitrated a multi-table snapshot on the node-heartbeat watermark plus
 * invalidation markers, so a fresher services repair could be masked and a
 * stale repairEligible=false snapshot survived repeated authoritative
 * repair. The services-table mutation version is captured at store time and
 * compared at reuse time: ANY services apply after store invalidates reuse,
 * with no marker cooperation required. Mid-build applies remain covered by
 * the kept-marker TOCTOU path; a missing version (older cache) disables the
 * check rather than failing closed.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  installControlPlaneReadinessSnapshotStoreMethods,
} from '../../src/control-plane/control-plane-readiness-snapshot-store.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';

const NODE_ID = 'node-1';
const BASE_NOW_MS = 1_760_000_000_000;
const STALE_HEARTBEAT_MAX_AGE_MS = 30_000;

function createStoreStub({systemTableCache = null, nowMs = BASE_NOW_MS} = {}) {
  const state = {nowMs};
  const stub = {
    now: () => state.nowMs,
    clusterMemberStaleHeartbeatMaxAgeMs: STALE_HEARTBEAT_MAX_AGE_MS,
    systemTableCache,
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

function buildStoredSnapshot({lastHeartbeat, readyLeaseExpiresAt}) {
  return Object.freeze({
    nodeId: NODE_ID,
    dimensions: Object.freeze({repairEligible: false}),
    reasons: Object.freeze([]),
    publication: Object.freeze({status: 'PUBLISHED'}),
    membershipPublication: Object.freeze({publicationEpoch: 4}),
    nodeEvidence: Object.freeze({
      lastHeartbeat,
      readyLeaseExpiresAt,
      rowConnectionState: 'ready',
    }),
  });
}

function applyServicesChange(cache, serviceId) {
  cache.applySystemTableChange('services', 'INSERT', {
    service_id: serviceId,
    node_id: NODE_ID,
    status: 'active',
    updated_at: Date.now(),
  });
}

function nodeRowAt(heartbeat, lease) {
  return {
    node_id: NODE_ID,
    last_heartbeat: heartbeat,
    ready_lease_expires_at: lease,
    connection_state: 'ready',
  };
}

test('a services apply after store invalidates reuse with no marker, even ' +
  'on watermark equality', async (t) => {
  const cache = new SystemTableCache();
  const {stub} = createStoreStub({systemTableCache: cache});
  const heartbeat = BASE_NOW_MS - 2_000;
  const lease = BASE_NOW_MS + 10_000;

  stub.storeReadinessSnapshot(
    NODE_ID,
    buildStoredSnapshot({lastHeartbeat: heartbeat, readyLeaseExpiresAt: lease}),
    BASE_NOW_MS - 1_000,
  );

  const beforeChange = stub.getFresherStoredReadinessSnapshot(
    NODE_ID, nodeRowAt(heartbeat, lease), null, null,
  );
  t.ok(beforeChange, 'watermark equality reuses while services are quiet');

  // The independent repair the incident masked: a services change with NO
  // node-row advance and NO invalidation marker written to the store.
  applyServicesChange(cache, 'svc-repair-1');

  const afterChange = stub.getFresherStoredReadinessSnapshot(
    NODE_ID, nodeRowAt(heartbeat, lease), null, null,
  );
  t.equal(
    afterChange,
    null,
    'any services-table apply after store forces a rebuild',
  );
});

test('a cache without version support falls back to legacy arbitration',
  async (t) => {
    const {stub} = createStoreStub({systemTableCache: null});
    const heartbeat = BASE_NOW_MS - 2_000;
    const lease = BASE_NOW_MS + 10_000;

    stub.storeReadinessSnapshot(
      NODE_ID,
      buildStoredSnapshot({
        lastHeartbeat: heartbeat,
        readyLeaseExpiresAt: lease,
      }),
      BASE_NOW_MS - 1_000,
    );
    const reused = stub.getFresherStoredReadinessSnapshot(
      NODE_ID, nodeRowAt(heartbeat, lease), null, null,
    );
    t.ok(
      reused,
      'missing version support keeps the legacy reuse path working',
    );
  });
