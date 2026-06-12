import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {TABLES} from '../../src/constants/index.js';

// CL-022 writer-coupling guard: the sibling guard
// (admin-control-snapshot-served-handoff-coverage.test.js) hand-builds the
// activeNodeViews summary dialect, so a key rename in the WRITER
// (buildLocalControlSnapshot's controlPlaneDiagnostics.activeNodeViews block)
// could silently re-open CL-022 while that guard stays green. This test
// derives the summary through the real writer and asserts the serve-time
// handoff rebuild can still prove snapshot coverage from it.

const LOCAL_NODE_ID = 'node-seed';
const CLUSTER_NODE_IDS = Object.freeze([
  'node-seed',
  'node-j1',
  'node-j2',
  'node-j3',
  'node-j4',
]);
const NOW_MS = 1_700_000_000_000;
const READY_LEASE_TTL_MS = 15_000;

function buildNodeRow(nodeId) {
  return {
    node_id: nodeId,
    node_address: nodeId + ':8080',
    status: 'active',
    connection_state: 'ready',
    last_heartbeat: NOW_MS,
    ready_lease_expires_at: NOW_MS + READY_LEASE_TTL_MS,
  };
}

function buildSystemTableCacheStub() {
  const rowsByTable = new Map([
    [TABLES.NODES, CLUSTER_NODE_IDS.map(buildNodeRow)],
  ]);
  return {
    getAll: (tableName) => rowsByTable.get(tableName) || [],
  };
}

test('serve-time handoff coverage is provable from the real writer summary',
  async (t) => {
    const adminControlSnapshot = new AdminControlSnapshot({
      nodeId: LOCAL_NODE_ID,
      systemTableCache: buildSystemTableCacheStub(),
      messageRouter: {
        getConnectedNodes: () => [...CLUSTER_NODE_IDS],
      },
      controlPlaneSnapshotOwner: {
        resolveControlSnapshot: async (localSnapshot) => localSnapshot,
      },
      nowFn: () => NOW_MS,
    });

    const localSnapshot =
      await adminControlSnapshot.buildLocalControlSnapshot({});
    const summary = localSnapshot?.controlPlaneDiagnostics?.activeNodeViews;
    t.ok(summary, 'writer produced an activeNodeViews summary');
    t.equal(
      localSnapshot?.nodes?.length,
      CLUSTER_NODE_IDS.length,
      'writer observed full node coverage',
    );

    const served = await adminControlSnapshot.resolveSharedControlSnapshot(
      localSnapshot,
      {},
    );
    const fenceCoverage = served?.controlPlaneDiagnostics
      ?.publicationActiveGateHandoff?.activeGateCatchupFence?.snapshotCoverage;
    t.equal(
      fenceCoverage?.available,
      true,
      'fence snapshot-coverage evidence is available from the writer summary',
    );
    t.equal(
      fenceCoverage?.missingNodeCount,
      0,
      'fence snapshot-coverage evidence misses no node the writer observed',
    );
  });
