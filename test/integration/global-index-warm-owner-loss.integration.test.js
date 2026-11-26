import assert from 'node:assert/strict';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {scaleByMachineFactor} from '../../scripts/test-machine-factor.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {test} from '../../src/test-helpers/tap.js';
import {createEmbeddedCluster, fulfilledRows, mustQuery, readUntil} from
  './helpers/embedded-cluster-harness.js';

const workerPath = fileURLToPath(new URL('./helpers/gsi-owner-loss-worker.js', import.meta.url));
const indexName = 'email_warm_loss';
const table = 'users_warm_loss';

async function waitForTrace(t, members, accepts) {
  const deadline = Date.now() + scaleByMachineFactor(120000);
  let traces;
  do {
    traces = await Promise.all(members.map(async (member) => {
      const reply = await member.channel.request('indexLossTrace');
      assert.ok(reply.ok, JSON.stringify(reply.error));
      return {nodeId: member.nodeId, ...reply.value};
    }));
    if (accepts(traces)) return traces;
    await managedSleep(t, 100);
  } while (Date.now() < deadline);
  assert.fail(JSON.stringify(traces));
}

test('warm survivors backfill an existing global index after the schema callback owner is killed',
  {timeout: 480000}, async (t) => {
    const cluster = createEmbeddedCluster(t);
    const seed = await cluster.startEmbeddedNode({workerPath, hostId: 'gsi-a',
      configuration: {formation: {declaredHostCount: 4}}});
    for (const hostId of ['gsi-b', 'gsi-c', 'gsi-d']) {
      await cluster.startEmbeddedNode({workerPath, role: 'joiner', hostId, seedRestPort: seed.restPort});
    }
    await cluster.waitForClusterSize(4);
    await cluster.waitForApplicationWrites();
    const members = cluster.nodes;
    const sessions = new Map(await Promise.all(members.map(async (node) =>
      [node, await node.openApplicationDatabase('gsi-warm-loss')])));
    const issuer = members.at(-1);
    const query = (node, sql, params) => mustQuery(node, sessions.get(node), sql, params);
    await query(issuer, `CREATE TABLE ${table} (id TEXT PRIMARY KEY, email TEXT)`);
    for (const [id, email] of [['a', 'first'], ['b', 'second']]) {
      await query(issuer, `INSERT INTO ${table} (id, email) VALUES (?, ?)`, [id, email]);
    }
    await waitForTrace(t, members, (traces) => traces.every((row) => row.warm));
    for (const node of members) {
      assert.ok((await node.channel.request('armIndexLoss', {indexName})).ok);
    }
    const submission = issuer.query(sessions.get(issuer), `CREATE GLOBAL INDEX ${indexName} ON ${table} (email)`)
      .catch((error) => ({error: error.message}));
    const traces = await waitForTrace(t, members, (rows) => rows.some((row) => row.cut));
    const cuts = traces.filter((row) => row.cut);
    assert.equal(cuts.length, 1);
    assert.ok(traces.every((row) => !row.completed));
    const [{nodeId, cut}] = cuts;
    assert.deepEqual([cut.status, cut.background, cut.registeredCallback], ['SUCCEEDED', true, true]);
    const owner = members.find((node) => node.nodeId === nodeId);
    const survivors = members.filter((node) => node !== owner);
    const observed = survivors[0];
    const catalogSql = 'SELECT index_id, state, backfill_total_rows FROM indices WHERE index_name = ?';
    const creating = await readUntil(t, observed, sessions.get(observed), catalogSql, [indexName],
      (rows) => rows.some((r) => r.index_id === cut.indexId && r.state === 'CREATING'));
    assert.equal(creating.rows.length, 1);
    const exited = once(owner.child, 'exit');
    assert.ok(owner.child.kill('SIGKILL'));
    assert.deepEqual(await exited, [null, 'SIGKILL']);
    // Observe the already-running owners only: no restart, CREATE, startup
    // activation, status-driven resume, or client query until queue completion.
    const final = await waitForTrace(t, survivors, (rows) => rows.some((row) => row.completed));
    const winner = final.find((row) => row.completed);
    assert.deepEqual(winner.completed, {indexId: cut.indexId, generation: cut.generation, dataset: cut.dataset});
    const node = survivors.find((member) => member.nodeId === winner.nodeId);
    await readUntil(t, node, sessions.get(node), catalogSql, [indexName],
      (rows) => rows.length === 1 && rows[0].index_id === cut.indexId &&
        rows[0].state === 'READ_WRITE' && Number(rows[0].backfill_total_rows) === 2);
    const indexed = fulfilledRows(await query(node,
      `SELECT email, __base_pk_id FROM ${cut.dataset} ORDER BY email`));
    assert.deepEqual(indexed, [{email: 'first', __base_pk_id: 'a'}, {email: 'second', __base_pk_id: 'b'}]);
    await submission;
  });
