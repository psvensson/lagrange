import assert from 'node:assert/strict';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {scaleByMachineFactor} from '../../scripts/test-machine-factor.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/tables.js';
import {getGlobalIndexDatasetName} from '../../src/index-management/global-index-dataset-manager.js';
import {createEmbeddedCluster, EMBEDDED_WORKER_OP, fulfilledRows, mustQuery, readUntil} from
  './helpers/embedded-cluster-harness.js';

const workerPath = fileURLToPath(new URL('./helpers/gsi-owner-loss-worker.js', import.meta.url));
const indexName = 'email_warm_loss';
const table = 'users_warm_loss';
const replicaCount = 3;
const testTimeoutMs = 480000;
const traceTimeoutMs = 120000;
const metadataTables = [TABLES.SCHEMA_OPERATIONS, TABLES.INDICES, TABLES.TABLES,
  TABLES.PARTITIONS, TABLES.SERVICES, TABLES.NODES, TABLES.NODE_ENDPOINTS,
  TABLES.CONTROL_PLANE_PUBLICATIONS, TABLES.REPLICA_OPERATIONS];

async function readRequiredPartitions(read, dataset) {
  const names = [table, dataset, ...metadataTables];
  const placeholders = names.map(() => '?').join(', ');
  const tables = await read(
    `SELECT table_id, table_name, partition_count FROM tables WHERE table_name IN (${placeholders})`, names);
  const ids = names.map((name) => {
    const matches = tables.filter((row) => row.table_name === name);
    assert.equal(matches.length, 1, `expected one catalog table for ${name}`);
    return matches[0].table_id;
  });
  assert.equal(new Set(ids).size, ids.length, 'required tables have distinct catalog identities');
  const rows = await read(
    `SELECT partition_id, table_id, replica_count, leader_node_id FROM partitions WHERE table_id IN (${placeholders})`,
    ids);
  for (const entry of tables) {
    const found = rows.filter((row) => row.table_id === entry.table_id);
    assert.ok(Number.isSafeInteger(entry.partition_count) && entry.partition_count > 0,
      `invalid partition count for ${entry.table_name}`);
    assert.equal(found.length, entry.partition_count, `missing or extra partitions for ${entry.table_name}`);
  }
  assert.equal(new Set(rows.map((row) => row.partition_id)).size, rows.length, 'partition identities are distinct');
  const dataTableIds = new Set(tables.filter((row) => row.table_name === table ||
      row.table_name === dataset)
    .map((row) => row.table_id));
  return rows.map((row) => ({...row, requiresRf3: dataTableIds.has(row.table_id)}));
}

async function readMembership(nodes, partitionIds) {
  const replies = await Promise.all(nodes.map(async (node) => {
    const reply = await node.channel.request('indexMembership', {partitionIds});
    assert.ok(reply.ok, JSON.stringify(reply.error));
    return reply.value.map((row) => ({...row, nodeId: node.nodeId}));
  }));
  return replies.flat();
}

function assertSurvivingMajority(rows, partitionId, ownerNodeId, requiresRf3) {
  const group = rows.filter((row) => row.partitionId === partitionId);
  assert.equal(new Set(group.map((row) => row.replicaId)).size, group.length,
    `duplicate hosted replica identity for ${partitionId}`);
  const voters = group.filter((row) => row.gateOpen === true &&
    Number.isSafeInteger(row.term) && row.term > 0 &&
    Number.isSafeInteger(row.generation) && row.generation >= 0 &&
    typeof row.configurationKey === 'string' && row.configurationKey.length > 0 &&
    row.outgoingVoters.length === 0 && row.nextLearners.length === 0 &&
    row.voterReplicaIds.length > 0 &&
    new Set(row.voterReplicaIds).size === row.voterReplicaIds.length &&
    row.voterReplicaIds.every((id) => typeof id === 'string' && id.length > 0) &&
    row.voterReplicaIds.includes(row.replicaId));
  const leaders = voters.filter((row) => row.leaderRead && row.replicaId === row.leaderReplicaId);
  assert.equal(leaders.length, 1, `expected one confirmed stable leader for ${partitionId}`);
  const [leader] = leaders;
  const committedCount = leader.voterReplicaIds.length;
  if (requiresRf3) assert.equal(committedCount, replicaCount, `committed RF3 for ${partitionId}`);
  const surviving = voters.filter((row) => row.nodeId !== ownerNodeId && row.term === leader.term &&
    row.generation === leader.generation && row.configurationKey === leader.configurationKey &&
    row.leaderReplicaId === leader.replicaId && row.voterReplicaIds.length === committedCount &&
    row.voterReplicaIds.every((id, index) => id === leader.voterReplicaIds[index]));
  const majority = Math.floor(committedCount / 2) + 1;
  assert.ok(new Set(surviving.map((row) => row.nodeId)).size >= majority,
    `fewer than ${majority} surviving nodes corroborate the leader's committed configuration for ${partitionId}`);
}

async function currentTraces(members) {
  return Promise.all(members.map(async (member) => {
    const reply = await member.channel.request('indexLossTrace');
    assert.ok(reply.ok, JSON.stringify(reply.error));
    return {nodeId: member.nodeId, ...reply.value};
  }));
}

async function waitForTrace(t, stage, members, accepts, signal) {
  const deadline = Date.now() + scaleByMachineFactor(traceTimeoutMs);
  let traces;
  do {
    signal?.throwIfAborted();
    traces = await currentTraces(members);
    if (accepts(traces)) return traces;
    await managedSleep(t, 100);
  } while (Date.now() < deadline);
  assert.fail(`${stage}: last worker traces ${JSON.stringify(traces)}`);
}

test('warm survivors backfill an existing global index after the schema finalizer is killed',
  {timeout: testTimeoutMs}, async (t) => {
    const deadline = Date.now() + testTimeoutMs;
    const cluster = createEmbeddedCluster(t);
    const seed = await cluster.startEmbeddedNode({workerPath, hostId: 'gsi-a',
      configuration: {formation: {declaredHostCount: 4},
        partition: {defaultReplicaCount: replicaCount}}});
    for (const hostId of ['gsi-b', 'gsi-c', 'gsi-d']) {
      await cluster.startEmbeddedNode({workerPath, role: 'joiner', hostId, seedRestPort: seed.restPort,
        configuration: {partition: {defaultReplicaCount: replicaCount}}});
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
      const holdMs = deadline - Date.now();
      assert.ok(holdMs > 0);
      assert.ok((await node.channel.request('armIndexLoss', {tableName: table, indexName, generation: 1, holdMs})).ok);
    }
    const stopPolling = new AbortController();
    // The CREATE may remain in flight on the actual finalizer. Give its IPC
    // observation the same budget as the cut; SQL runs with its normal options.
    const submission = issuer.channel.request(EMBEDDED_WORKER_OP.QUERY, {
      sessionKey: sessions.get(issuer), sql: `CREATE GLOBAL INDEX ${indexName} ON ${table} (email)`, params: [],
    }, traceTimeoutMs).then((reply) => {
      assert.ok(reply.ok, JSON.stringify(reply.error));
      fulfilledRows(reply.value);
    });
    const atCut = waitForTrace(t, 'pre-kill: accepted fenced SUCCEEDED write', members,
      (rows) => {
        const rejected = rows.find((row) => row.progress?.terminal?.state === 'cut rejected');
        if (rejected) assert.fail(`terminal write on ${rejected.nodeId}: ${rejected.progress.terminal.error}`);
        return rows.some((row) => row.cut);
      }, stopPolling.signal);
    // A fulfilled CREATE can detach while the schema job is still running.
    // A rejected public outcome or IPC failure before the cut ends this wait.
    const traces = await Promise.race([atCut, submission.then(() => atCut)])
      .finally(() => stopPolling.abort());
    const cuts = traces.filter((row) => row.cut);
    assert.equal(cuts.length, 1);
    assert.ok(traces.every((row) => !row.completed));
    const [{nodeId, cut}] = cuts;
    assert.deepEqual([cut.previousStatus, cut.status], ['RUNNING', 'SUCCEEDED']);
    assert.ok(typeof cut.jobId === 'string' && cut.jobId.length > 0);
    assert.equal(cut.workflowId, cut.jobId);
    assert.ok(typeof cut.ownerId === 'string' && cut.ownerId.length > 0);
    assert.ok(Number.isSafeInteger(cut.fenceToken) && cut.fenceToken > 0);
    assert.ok(Number.isSafeInteger(cut.previousRowVersion) && cut.previousRowVersion > 0);
    assert.equal(cut.rowVersion, cut.previousRowVersion + 1);
    assert.equal(cut.generation, 1);
    assert.equal(cut.indexId, `${indexName}-gen1`);
    t.comment(JSON.stringify({stage: 'pre-kill durable finalizer cut', nodeId, cut}));
    const owner = members.find((node) => node.nodeId === nodeId);
    const survivors = members.filter((node) => node !== owner);
    const catalogSql = 'SELECT index_id, state, backfill_total_rows FROM indices WHERE index_name = ?';
    const observer = survivors.find((node) => node !== issuer);
    const read = async (sql, params) => fulfilledRows(await query(observer, sql, params));
    assert.equal(cut.dataset, getGlobalIndexDatasetName(table, indexName));
    assert.equal(cut.partitions.length, 1);
    const [intentPartition] = cut.partitions;
    assert.equal(intentPartition.replicaCount, replicaCount, 'durable GSI intent must request RF3');
    assert.deepEqual(cut.result, {tableId: cut.dataset, partitionId: intentPartition.partitionId,
      contractState: 'ready', nextAction: 'proceed', converged: true, requested: replicaCount,
      routable: replicaCount, committed: replicaCount});
    const partitions = await readRequiredPartitions(read, cut.dataset);
    const gsi = partitions.filter((row) => row.table_id === cut.dataset);
    assert.deepEqual(gsi.map((row) => row.partition_id), [intentPartition.partitionId]);
    const partitionIds = partitions.map((row) => row.partition_id);
    const servicesSql = 'SELECT service_id, node_id, raft_role, status FROM services WHERE partition_id = ?';
    const topology = async (stage, nodes, gsiRouting) => {
      const services = await read(servicesSql, [intentPartition.partitionId]);
      const membership = await readMembership(nodes, partitionIds);
      t.comment(JSON.stringify({stage, ownerNodeId: nodeId, gsiRouting, services}));
      for (const partitionId of partitionIds) {
        t.comment(JSON.stringify({stage, partitionId,
          membership: membership.filter((row) => row.partitionId === partitionId)}));
      }
      return membership;
    };
    t.comment(JSON.stringify({stage: 'pre-kill partition inventory', partitions}));
    const membership = await topology('pre-kill quorum observations', members, gsi);
    for (const partition of partitions) {
      if (partition.requiresRf3) {
        assert.equal(partition.replica_count, replicaCount, `declared RF3 for ${partition.partition_id}`);
      }
      assertSurvivingMajority(membership, partition.partition_id, nodeId, partition.requiresRf3);
    }
    const beforeKill = await currentTraces(members);
    assert.ok(beforeKill.every((row) => !row.firstTerminalAttemptNs && !row.completed),
      'terminal update must not have started before the signal');
    assert.ok(process.hrtime.bigint() < BigInt(cut.expiresNs), 'finalizer hold still active before signal');
    const exited = once(owner.child, 'exit');
    assert.ok(owner.child.kill('SIGKILL'));
    assert.deepEqual(await exited, [null, 'SIGKILL']);
    const confirmedExitNs = process.hrtime.bigint();
    assert.ok(confirmedExitNs < BigInt(cut.expiresNs), 'confirmed death precedes release of the finalizer');
    t.comment(JSON.stringify({stage: 'SIGKILL confirmed', nodeId, indexId: cut.indexId}));
    // A survivor is free to advance at any time. Observe the incomplete
    // generation once; a race won before this observation cannot prove this cut.
    const incomplete = await read(catalogSql, [indexName]);
    assert.equal(incomplete.length, 1);
    assert.equal(incomplete[0].index_id, cut.indexId);
    assert.ok(['CREATING', 'WRITE_ONLY', 'BACKFILLING'].includes(incomplete[0].state),
      `post-exit generation already advanced to ${incomplete[0].state}`);
    const gsiAfterKill = await read(
      'SELECT partition_id, table_id, replica_count, leader_node_id FROM partitions WHERE table_id = ?',
      [cut.dataset]);
    await topology('post-kill membership and GSI services', survivors, gsiAfterKill);
    const final = await waitForTrace(t, 'post-kill: two-row terminal checkpoint', survivors, (rows) => {
      for (const row of rows) {
        if (row.firstTerminalAttemptNs) {
          assert.ok(BigInt(row.firstTerminalAttemptNs) > confirmedExitNs,
            `terminal update on ${row.nodeId} raced the confirmed exit`);
        }
      }
      return rows.some((row) => row.completed);
    });
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
