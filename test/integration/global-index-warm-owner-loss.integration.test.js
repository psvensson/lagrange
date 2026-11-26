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

async function waitForTrace(t, stage, members, accepts, signal) {
  const deadline = Date.now() + scaleByMachineFactor(120000);
  let traces;
  do {
    signal?.throwIfAborted();
    traces = await Promise.all(members.map(async (member) => {
      const reply = await member.channel.request('indexLossTrace');
      assert.ok(reply.ok, JSON.stringify(reply.error));
      return {nodeId: member.nodeId, ...reply.value};
    }));
    if (accepts(traces)) return traces;
    await managedSleep(t, 100);
  } while (Date.now() < deadline);
  assert.fail(`${stage}: last worker traces ${JSON.stringify(traces)}`);
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
    await waitForTrace(t, 'setup: READY discovery', members, (traces) => traces.every((row) => row.warm));
    for (const node of members) {
      assert.ok((await node.channel.request('armIndexLoss', {tableName: table, indexName})).ok);
    }
    const stopPolling = new AbortController();
    const submission = query(issuer, `CREATE GLOBAL INDEX ${indexName} ON ${table} (email)`);
    const atCut = waitForTrace(t, 'pre-kill: SUCCEEDED before callback enqueue', members,
      (rows) => rows.some((row) => row.cut), stopPolling.signal);
    // A fulfilled CREATE can detach while the schema job is still running.
    // A rejected public outcome or IPC failure before the cut ends this wait.
    const traces = await Promise.race([atCut, submission.then(() => atCut)])
      .finally(() => stopPolling.abort());
    const cuts = traces.filter((row) => row.cut);
    assert.equal(cuts.length, 1);
    assert.ok(traces.every((row) => !row.completed));
    const [{nodeId, cut}] = cuts;
    assert.deepEqual([cut.status, cut.background, cut.registeredCallback], ['SUCCEEDED', true, true]);
    t.comment(JSON.stringify({stage: 'pre-kill callback cut', nodeId, cut}));
    const owner = members.find((node) => node.nodeId === nodeId);
    const survivors = members.filter((node) => node !== owner);
    const catalogSql = 'SELECT index_id, state, backfill_total_rows FROM indices WHERE index_name = ?';
    const observer = survivors[0];
    const topology = async (stage, nodes) => {
      const partitions = fulfilledRows(await query(observer,
        'SELECT partition_id, table_id, replica_count, leader_node_id FROM partitions WHERE table_id = ?',
        [cut.dataset]));
      const partitionId = cut.partitions[0].partitionId;
      const services = fulfilledRows(await query(observer,
        'SELECT service_id, node_id, raft_role, status FROM services WHERE partition_id = ?', [partitionId]));
      const membership = await Promise.all(nodes.map(async (node) => {
        const response = await node.channel.request('indexMembership', {partitionId});
        assert.ok(response.ok, JSON.stringify(response.error));
        return {nodeId: node.nodeId, replicas: response.value};
      }));
      t.comment(JSON.stringify({stage, partitionId, partitions, services, membership, ownerNodeId: nodeId}));
    };
    assert.equal(cut.result.partitionId, cut.partitions[0].partitionId);
    await topology('survivor catalog before kill', members);
    const exited = once(owner.child, 'exit');
    assert.ok(owner.child.kill('SIGKILL'));
    assert.deepEqual(await exited, [null, 'SIGKILL']);
    const confirmedExitNs = process.hrtime.bigint();
    t.comment(JSON.stringify({stage: 'SIGKILL confirmed', nodeId, indexId: cut.indexId}));
    // All processes held terminal writes before the submission. The same
    // generation must still be incomplete after the OS confirms owner death.
    await topology('survivor catalog after kill', survivors);
    await readUntil(t, observer, sessions.get(observer), catalogSql, [indexName],
      (rows) => rows.length === 1 && rows[0].index_id === cut.indexId &&
        ['CREATING', 'WRITE_ONLY', 'BACKFILLING'].includes(rows[0].state));
    await Promise.all(survivors.map(async (node) =>
      assert.ok((await node.channel.request('permitIndexTerminalWrite')).ok)));
    const final = await waitForTrace(t, 'post-kill: two-row terminal checkpoint', survivors, (rows) => rows.some((row) => row.completed));
    const winner = final.find((row) => row.completed);
    const {startedNs, ...checkpoint} = winner.completed;
    assert.ok(BigInt(startedNs) > confirmedExitNs, 'terminal checkpoint began after confirmed SIGKILL');
    assert.deepEqual(checkpoint, {indexId: cut.indexId, generation: cut.generation,
      priorState: 'BACKFILLING', rows: 2});
    const node = survivors.find((member) => member.nodeId === winner.nodeId);
    await readUntil(t, node, sessions.get(node), catalogSql, [indexName],
      (rows) => rows.length === 1 && rows[0].index_id === cut.indexId &&
        rows[0].state === 'READ_WRITE' && Number(rows[0].backfill_total_rows) === 2);
    const indexed = fulfilledRows(await query(node,
      `SELECT email, __base_pk_id FROM ${cut.dataset} ORDER BY email`));
    assert.deepEqual(indexed, [{email: 'first', __base_pk_id: 'a'}, {email: 'second', __base_pk_id: 'b'}]);
  });
