import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';

const SYNC_ENTRY = {nodeId: 'node-a', source: 'sync'};
const ASYNC_ENTRY = {nodeId: 'node-a', source: 'async'};

function buildSnapshot(readinessService) {
  return new AdminControlSnapshot({
    nodeId: 'node-a',
    controlPlaneReadinessService: readinessService,
  });
}

test('resolveControlPlaneReadinessEntries prefers the lane-free sync path',
  async (t) => {
    let asyncCalls = 0;
    let syncCalls = 0;
    const snapshot = buildSnapshot({
      async getAllNodeReadiness() {
        asyncCalls += 1;
        return [ASYNC_ENTRY];
      },
      getAllNodeReadinessSync() {
        syncCalls += 1;
        return [SYNC_ENTRY];
      },
    });

    const entries = await snapshot.resolveControlPlaneReadinessEntries({
      allowAuthoritativeRefresh: false,
    });

    t.same(entries, [SYNC_ENTRY],
      'sync cache data is returned without touching the serialized lane');
    t.equal(syncCalls, 1, 'sync resolution is consulted first');
    t.equal(asyncCalls, 0,
      'async readiness lane is not invoked when sync data is available');
  });

test('resolveControlPlaneReadinessEntries falls back to async when sync empty',
  async (t) => {
    let asyncCalls = 0;
    const snapshot = buildSnapshot({
      async getAllNodeReadiness() {
        asyncCalls += 1;
        return [ASYNC_ENTRY];
      },
      getAllNodeReadinessSync() {
        return [];
      },
    });

    const entries = await snapshot.resolveControlPlaneReadinessEntries({
      allowAuthoritativeRefresh: false,
    });

    t.same(entries, [ASYNC_ENTRY],
      'async readiness is used when the sync cache yields nothing');
    t.equal(asyncCalls, 1, 'async readiness lane is consulted as a fallback');
  });

test('resolveControlPlaneReadinessEntries falls back to sync when async throws',
  async (t) => {
    let syncCalls = 0;
    const snapshot = buildSnapshot({
      async getAllNodeReadiness() {
        throw new Error('lane snapshot timed out after 15000ms');
      },
      getAllNodeReadinessSync() {
        syncCalls += 1;
        return [SYNC_ENTRY];
      },
    });

    const entries = await snapshot.resolveControlPlaneReadinessEntries({
      allowAuthoritativeRefresh: true,
    });

    t.same(entries, [SYNC_ENTRY],
      'a blocked/timed-out lane degrades to cached readiness, never blank');
    t.ok(syncCalls >= 1, 'sync resolution backstops the failed async path');
  });

test('resolveControlPlaneReadinessEntries uses the async lane when authoritative',
  async (t) => {
    let asyncCalls = 0;
    let syncCallsBeforeAsync = 0;
    let asyncSeen = false;
    const snapshot = buildSnapshot({
      async getAllNodeReadiness(options) {
        asyncCalls += 1;
        asyncSeen = true;
        t.equal(options.allowAuthoritativeRefresh, true,
          'authoritative refresh flag is forwarded to the lane');
        return [ASYNC_ENTRY];
      },
      getAllNodeReadinessSync() {
        if (!asyncSeen) {
          syncCallsBeforeAsync += 1;
        }
        return [SYNC_ENTRY];
      },
    });

    const entries = await snapshot.resolveControlPlaneReadinessEntries({
      allowAuthoritativeRefresh: true,
    });

    t.same(entries, [ASYNC_ENTRY],
      'authoritative requests resolve through the lane, not the sync cache');
    t.equal(asyncCalls, 1, 'async readiness lane is invoked');
    t.equal(syncCallsBeforeAsync, 0,
      'sync path is not consulted before the authoritative lane read');
  });
