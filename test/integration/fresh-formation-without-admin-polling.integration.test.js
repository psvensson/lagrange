// E3/E8: three OS processes, each entered through createEmbeddedLagrange.
// The guard covers indirect admin snapshot calls as well as test-client calls.
// SQL observations do not inject membership, service, or operation rows. This
// embedded proof is separate from E9's unchanged three-host physical scenario.
import {cpSync, mkdirSync, mkdtempSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {
  isReplicaOperationInFlight,
  isReplicaOperationTerminalSuccess,
  normalizeReplicaOperationRecord,
} from '../../src/rebalancer/replica-operation-liveness.js';
import {normalizeControlPlanePublicationRow} from
  '../../src/control-plane/system-row-normalizers.js';
import {MEMBERSHIP_PUBLICATION_STATUS} from
  '../../src/control-plane/membership-publication-row-contract.js';
import {TIMEOUTS} from '../distributed/harness/constants.js';
import {
  createEmbeddedCluster,
  fulfilledRows,
  mustQuery,
  readUntil,
} from './helpers/embedded-cluster-harness.js';

const NODE_COUNT = 3;
const APPLICATION_ID = 'formation-without-admin-polling';
const TABLE = 'formation_without_admin_polling';
const GUARD = new URL('./helpers/forbid-admin-snapshot-preload.js', import.meta.url);
const SUITE_BOUND_MS = 600_000;

function assertNoAdminPolling(t, cluster, evidenceDir) {
  for (const node of cluster.nodes) {
    const observation = JSON.parse(readFileSync(
      join(evidenceDir, `${node.nodeId}.json`), 'utf8'));
    t.equal(observation.installed, true, `guard installed in ${node.nodeId}`);
    t.same(observation.calls, [], `no admin snapshot calls in ${node.nodeId}`);
  }
}

function publishedAllNodes(rows, nodeIds) {
  return rows.map(normalizeControlPlanePublicationRow).some((row) =>
    row.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED &&
    nodeIds.every((id) => row.publishedActiveNodeIds.includes(id)));
}

function completedOperations(rows) {
  const records = rows.map((row) => normalizeReplicaOperationRecord(row));
  return records.some(isReplicaOperationTerminalSuccess) &&
    records.every((record) => !isReplicaOperationInFlight(record));
}

function retainEvidence(t, cluster, evidenceDir) {
  try {
    // Outside both temporary checkouts: the embedded harness and the lab
    // placement runner each remove their own tree after the result is read.
    const retained = mkdtempSync(join(tmpdir(), 'lagrange-no-admin-proof-'));
    for (const node of cluster.nodes) {
      cpSync(node.logPath, join(retained, `${node.nodeId}.log`));
    }
    cpSync(evidenceDir, join(retained, 'guard'), {recursive: true});
    t.comment(`full formation evidence retained at ${retained}`);
  } catch (error) {
    // TAP assertion failures do not throw. Preserve any original exception
    // while independently refusing a proof whose evidence could not be kept.
    t.fail(`formation evidence retention failed: ${error.message}`);
  }
}

test('three public embedded nodes form and complete SQL without admin polling', {
  timeout: SUITE_BOUND_MS,
}, async (t) => {
  const cluster = createEmbeddedCluster(t);
  const evidenceDir = join(cluster.rootDir, 'no-admin-poll-evidence');
  mkdirSync(evidenceDir);
  try {
    const formation = await cluster.formCluster(NODE_COUNT, {env: {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${GUARD.href}`,
      LAGRANGE_NO_ADMIN_POLL_EVIDENCE_DIR: evidenceDir,
    }});
    t.comment(`owner-driven formation: ${JSON.stringify(formation)}`);
    t.equal(cluster.nodes.length, NODE_COUNT, 'three independent runtimes started');
    t.equal(new Set(cluster.nodes.map((node) => node.child.pid)).size,
      NODE_COUNT, 'three different process identities');
    assertNoAdminPolling(t, cluster, evidenceDir);

    const nodeIds = cluster.nodes.map((node) => node.nodeId);
    const sessions = await Promise.all(cluster.nodes.map((node) =>
      node.openApplicationDatabase(APPLICATION_ID)));
    const seed = cluster.nodes[0];
    const seedSession = sessions[0];
    await readUntil(t, seed, seedSession,
      'SELECT * FROM control_plane_publications', [],
      (rows) => publishedAllNodes(rows, nodeIds));
    let quietSince = null;
    await readUntil(t, seed, seedSession, 'SELECT * FROM replica_operations', [],
      (rows) => {
        quietSince = completedOperations(rows) ? quietSince ?? Date.now() : null;
        return quietSince !== null && Date.now() - quietSince >= TIMEOUTS.QUIET_WINDOW;
      });
    t.pass('production owners published all nodes and completed real replica operations');

    await mustQuery(seed, seedSession,
      `CREATE TABLE ${TABLE} (id TEXT PRIMARY KEY, value INTEGER)`);
    t.same(fulfilledRows(await mustQuery(seed, seedSession,
      `SELECT COUNT(*) AS cnt FROM ${TABLE}`)), [{cnt: 0}],
    'created table is publicly routable before writes');
    for (const [index, node] of cluster.nodes.entries()) {
      await mustQuery(node, sessions[index],
        `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`, [node.nodeId, index]);
    }
    for (const [index, node] of cluster.nodes.entries()) {
      const visible = await readUntil(t, node, sessions[index],
        `SELECT id, value FROM ${TABLE}`, [], (rows) => rows.length === NODE_COUNT);
      t.same(visible.rows.sort((left, right) => left.value - right.value),
        nodeIds.map((id, value) => ({id, value})),
        `every node's committed write is visible through ${node.nodeId}`);
    }
    assertNoAdminPolling(t, cluster, evidenceDir);
  } finally {
    retainEvidence(t, cluster, evidenceDir);
  }
});
