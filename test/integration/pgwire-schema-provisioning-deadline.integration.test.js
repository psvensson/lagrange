import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {test} from '../../src/test-helpers/tap.js';
import {readPersistedLocalClusterId} from '../../src/bootstrap/rejoin-hints.js';
import {createEmbeddedCluster, readUntil} from './helpers/embedded-cluster-harness.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {scaleByMachineFactor} from '../../scripts/test-machine-factor.js';
import {enablePasswordPgwire} from './helpers/public-binding-seam-harness.js';

const ports = createPortAllocator(import.meta.url);
const workerPath = fileURLToPath(new URL('./helpers/schema-provisioning-wire-worker.js', import.meta.url));
const tableName = 'wire_deadline_orders';
const configuration = {formation: {declaredHostCount: 1}, partition: {defaultReplicaCount: 1}};

async function observe(node, op, input) {
  const reply = await node.channel.request(op, input);
  assert.equal(reply.ok, true, JSON.stringify(reply.error));
  return reply.value;
}

async function checkCompletedJob(client, jobId, tableId) {
  const jobs = await client.query(
    'SELECT job_id, table_id, status FROM schema_operations WHERE table_name = $1', [tableName]);
  assert.deepEqual(jobs.rows, [{job_id: jobId, table_id: tableId, status: 'SUCCEEDED'}]);
}

test('PG-wire CREATE deadline leaves its durable job owned after disconnect and its table usable after reopen',
  {timeout: 240000}, async (t) => {
    const dataDir = t.testdir();
    const cluster = createEmbeddedCluster(t);
    const listenerPorts = ports.getListenerPorts();
    const node = await cluster.startEmbeddedNode({workerPath, dataDir, configuration, listenerPorts});
    const endpoint = await enablePasswordPgwire({
      query: async (sql, params) => ({rows: await cluster.seedQueryRows(sql, params)}),
    }, ports.getPort(), {
      restPort: node.restPort,
      deadlineMs: Date.now() + scaleByMachineFactor(60000),
      pause: () => managedSleep(t, 100),
    });
    const original = await cluster.createPgClient(endpoint);
    await observe(node, 'holdProvisioning', {tableName});
    let pending;
    const catalogCommitted = observe(node, 'catalogCommitted');
    const create = original.query(`CREATE TABLE ${tableName} (id TEXT PRIMARY KEY, payload TEXT)`);
    const deadline = assert.rejects(create, (error) => {
      assert.equal(error.code, '55P03');
      pending = JSON.parse(error.detail);
      assert.equal(typeof pending.provisioning_job_id, 'string');
      return true;
    });
    try {
      const identity = await Promise.race([catalogCommitted, deadline.then(() => {
        throw new Error('CREATE answered before the catalog-commit barrier');
      })]);
      await deadline;
      assert.equal(pending.provisioning_job_id, identity.jobId);
      const active = await original.query(
        'SELECT table_id, status FROM schema_operations WHERE job_id = $1', [identity.jobId]);
      assert.deepEqual(active.rows, [{table_id: identity.tableId, status: 'RUNNING'}]);
      await original.end();
      await observe(node, 'releaseProvisioning');
      const terminal = await observe(node, 'terminalProvisioning');
      assert.deepEqual(terminal, {jobId: identity.jobId, status: 'SUCCEEDED'});

      const fresh = await cluster.createPgClient(endpoint);
      await checkCompletedJob(fresh, identity.jobId, identity.tableId);
      const inserted = await fresh.query(`INSERT INTO ${tableName} (id, payload) VALUES ($1, $2)`,
        ['first', 'after deadline']);
      assert.equal(inserted.rowCount, 1);
      const select = `SELECT payload FROM ${tableName} WHERE id = $1`;
      const expectedRows = [{payload: 'after deadline'}];
      assert.deepEqual((await fresh.query(select, ['first'])).rows, expectedRows);
      await fresh.end();
      // A completed founder needs current members for durable rejoin. Keep
      // the one-host declaration truthful: these are separate local processes.
      for (const count of [2, 3]) {
        await cluster.startEmbeddedNode({
          role: 'joiner', hostId: node.hostId, seedRestPort: node.restPort,
          listenerPorts: ports.getListenerPorts(),
          configuration: {partition: configuration.partition},
        });
        await cluster.waitForClusterSize(count);
      }
      const identitySql = 'SELECT config_value FROM config WHERE config_key = ?';
      const clusterKey = ['cluster_id'];
      const [{config_value: clusterId}] = await cluster.seedQueryRows(identitySql, clusterKey);
      assert.ok(typeof clusterId === 'string' && clusterId.length > 0);
      await node.stop();
      assert.equal(await readPersistedLocalClusterId(dataDir), clusterId);

      const reopened = createEmbeddedCluster(t);
      const restored = await reopened.startEmbeddedNode({
        workerPath, configuration: {partition: configuration.partition}, dataDir,
        nodeId: node.nodeId, hostId: node.hostId,
        listenerPorts,
      });
      assert.deepEqual(await reopened.seedQueryRows(identitySql, clusterKey), [{config_value: clusterId}]);
      const session = await restored.openApplicationDatabase('wire-deadline-reopen');
      const {rows: [listener]} = await readUntil(t, restored, session,
        'SELECT address, port FROM service_endpoints WHERE protocol = ? AND service_id = ?',
        ['postgresql', 'sys-postgres-wire'], (rows) => rows.length === 1);
      const reader = await reopened.createPgClient({host: listener.address, port: Number(listener.port)});
      await checkCompletedJob(reader, identity.jobId, identity.tableId);
      assert.deepEqual((await reader.query(select, ['first'])).rows, expectedRows);
    } finally {
      if (!node.channel.exitState()) await observe(node, 'releaseProvisioning');
    }
  });
