import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {test} from '../../src/test-helpers/tap.js';
import {createEmbeddedCluster} from './helpers/embedded-cluster-harness.js';

const workerPath = fileURLToPath(new URL('./helpers/schema-provisioning-wire-worker.js', import.meta.url));
const tableName = 'wire_deadline_orders';
const configuration = {partition: {defaultReplicaCount: 1}, query: {timeoutMs: 10000}};

async function observe(node, op, input) {
  const reply = await node.channel.request(op, input);
  assert.equal(reply.ok, true, JSON.stringify(reply.error));
  return reply.value;
}

async function connect(cluster, node) {
  return cluster.createPgClient({host: '127.0.0.1', port: await observe(node, 'wirePort')});
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
    const node = await cluster.startEmbeddedNode({workerPath, dataDir, configuration});
    const original = await connect(cluster, node);
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

      const fresh = await connect(cluster, node);
      await checkCompletedJob(fresh, identity.jobId, identity.tableId);
      const inserted = await fresh.query(`INSERT INTO ${tableName} (id, payload) VALUES ($1, $2)`,
        ['first', 'after deadline']);
      assert.equal(inserted.rowCount, 1);
      const select = `SELECT payload FROM ${tableName} WHERE id = $1`;
      const expectedRows = [{payload: 'after deadline'}];
      assert.deepEqual((await fresh.query(select, ['first'])).rows, expectedRows);
      await fresh.end();
      await cluster.stopAll();

      const reopened = createEmbeddedCluster(t);
      const restored = await reopened.startEmbeddedNode({
        workerPath, configuration, dataDir, nodeId: node.nodeId,
        listenerPorts: {adminWebSocketPort: node.adminPort, restApiPort: node.restPort,
          transportWebSocketPort: node.transportPort},
      });
      const reader = await connect(reopened, restored);
      await checkCompletedJob(reader, identity.jobId, identity.tableId);
      assert.deepEqual((await reader.query(select, ['first'])).rows, expectedRows);
    } finally {
      if (!node.channel.exitState()) await observe(node, 'releaseProvisioning');
    }
  });
