import assert from 'node:assert/strict';
import {once} from 'node:events';
import {copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {scaleByMachineFactor} from '../../scripts/test-machine-factor.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {test} from '../../src/test-helpers/tap.js';
import {createEmbeddedCluster, readUntil} from './helpers/embedded-cluster-harness.js';
import {scalePasswordPgwire} from './helpers/public-binding-seam-harness.js';

const tableName = 'wire_owner_loss_orders';
const ports = createPortAllocator(import.meta.url);
const workerPath = fileURLToPath(new URL('./helpers/schema-owner-loss-worker.js', import.meta.url));
const metadata = ['schema_operations-p1', 'services-p1', 'tables-p1', 'partitions-p1', 'nodes-p1'];

async function observe(member, op, args) {
  const reply = await member.channel.request(op, args);
  assert.equal(reply.ok, true, JSON.stringify(reply.error));
  return reply.value;
}

async function until(t, description, read, accepts, budgetMs = 90000) {
  const deadline = Date.now() + scaleByMachineFactor(budgetMs);
  let last;
  do {
    last = await read();
    if (accepts(last)) return last;
    await managedSleep(t, 250);
  } while (Date.now() < deadline);
  throw new Error(`${description}: last observation ${JSON.stringify(last)}`);
}

async function memberships(members, ids) {
  const observations = await Promise.all(members.map(async (member) =>
    (await observe(member, 'membership', {ids})).map((row) => ({...row, nodeId: member.nodeId}))));
  return observations.flat();
}

// Corroborate one committed RF3 configuration, term and leader across actual
// local replicas. Require the leader itself to answer in every accepted view.
function quorum(rows, id, required, excludedVoterNodeId) {
  const local = rows.filter((row) => row.partitionId === id && row.gateOpen === true &&
    Number.isSafeInteger(row.term) && row.term > 0 && row.voterReplicaIds?.length === 3 &&
    row.voterReplicaIds.every((voter) => typeof voter === 'string' && voter.length > 0) &&
    new Set(row.voterReplicaIds).size === 3 && row.votersOutgoingReplicaIds.length === 0 &&
    row.voterReplicaIds.includes(row.replicaId));
  for (const leader of local.filter((row) => row.isLeader && row.replicaId === row.leaderReplicaId)) {
    const voters = local.filter((row) => row.nodeId !== excludedVoterNodeId && row.term === leader.term &&
      row.leaderReplicaId === leader.replicaId &&
      row.voterReplicaIds.every((replica) => leader.voterReplicaIds.includes(replica)));
    if (new Set(voters.map((row) => row.nodeId)).size >= required &&
        new Set(voters.map((row) => row.replicaId)).size >= required) return leader;
  }
  return null;
}

async function traces(members) {
  return Promise.all(members.map(async (member) => ({
    nodeId: member.nodeId, ...await observe(member, 'trace'),
  })));
}

test('a live RF3 schema job survives abrupt owner loss and a new owner completes the same CREATE',
  {timeout: 480000}, async (t) => {
    const cluster = createEmbeddedCluster(t);
    // Four logical placement hosts leave three live voters possible after the crash.
    const seed = await cluster.startEmbeddedNode({workerPath, hostId: 'owner-loss-a',
      listenerPorts: ports.getListenerPorts(), configuration: {formation: {declaredHostCount: 4}}});
    for (const hostId of ['owner-loss-b', 'owner-loss-c', 'owner-loss-d']) {
      await cluster.startEmbeddedNode({workerPath, role: 'joiner', hostId,
        seedRestPort: seed.restPort, listenerPorts: ports.getListenerPorts()});
    }
    await cluster.waitForClusterSize(4);
    const members = cluster.nodes;
    // A surviving listener can verify DML even if the submitting socket dies.
    const bindPorts = ports.getPortBlock(2);
    await scalePasswordPgwire(2, {
      portRangeStart: bindPorts[0], portRangeEnd: bindPorts.at(-1),
    }, {restPort: seed.restPort, deadlineMs: Date.now() + scaleByMachineFactor(60000),
      pause: () => managedSleep(t, 100)});
    const endpointSql = 'SELECT node_id, address, port FROM service_endpoints WHERE service_id = ? AND protocol = ?';
    const endpointParams = ['sys-postgres-wire', 'postgresql'];
    await until(t, 'RF3 metadata ready before CREATE', () => memberships(members, metadata),
      (rows) => metadata.every((id) => quorum(rows, id, 2)));
    const [endpoint] = await until(t, 'published PG-wire listener',
      () => cluster.seedQueryRows(endpointSql, endpointParams), (rows) => rows.length > 0);
    await Promise.all(members.map((member) => observe(member, 'arm', {tableName})));
    t.teardown(async () => {
      await Promise.allSettled(members.filter((member) => !member.channel.exitState())
        .map((member) => observe(member, 'release')));
    });
    const client = await cluster.createPgClient({host: endpoint.address, port: Number(endpoint.port)});
    // The single submitting socket can disappear with its server.
    client.on('error', (error) => t.comment(`original socket: ${error.message}`));
    const submitted = client.query(`CREATE TABLE ${tableName} (id TEXT PRIMARY KEY, payload TEXT)`)
      .then(() => ({success: true, at: Date.now()}), (error) => ({
        code: error.code, detail: error.detail, message: error.message, at: Date.now(),
      }));
    const entered = await Promise.race([
      until(t, 'owner entered provisioning after catalog commit',
        () => traces(members), (rows) => rows.some((row) => row.barrier)),
      submitted.then((reply) => { throw new Error(`CREATE answered before barrier: ${JSON.stringify(reply)}`); }),
    ]);
    const [original] = entered.filter((row) => row.barrier);
    assert.equal(entered.filter((row) => row.barrier).length, 1);
    const {ownerId, jobId, tableId, partitionId} = original.barrier;
    const owner = members.find((member) => member.nodeId === original.nodeId);
    const survivors = members.filter((member) => member !== owner);
    const grant = original.grants.find((row) => row.jobId === jobId && row.ownerId === ownerId);
    assert.ok(grant);
    const before = await until(t, 'surviving majority for each committed RF3 metadata group',
      () => memberships(members, metadata),
      (rows) => metadata.every((id) => quorum(rows, id, 2, owner.nodeId)));
    // Only the original process remains held. Successor work runs unmodified.
    await Promise.all(survivors.map((member) => observe(member, 'release')));
    const observer = survivors[0];
    const readJob = () => observe(observer, 'job', {key: grant.key});
    const running = await until(t, 'leader-backed RUNNING row', readJob, (row) => row !== null);
    assert.deepEqual([running.status, running.ownerId, running.fence, running.jobId, running.tableId],
      ['RUNNING', ownerId, grant.fence, jobId, tableId]);
    assert.ok(original.claims.some((entry) => entry.ownerId === ownerId &&
      entry.fence === running.fence && entry.lease === running.lease));
    const exited = once(owner.child, 'exit');
    assert.ok(running.lease > Date.now(), 'original owner has an unexpired durable grant');
    const crashAt = Date.now();
    assert.ok(owner.child.kill('SIGKILL'));
    assert.deepEqual(await exited, [null, 'SIGKILL']);
    t.comment(JSON.stringify({lostNode: owner.nodeId, running}));
    const retained = await until(t, 'read original lease from a survivor after SIGKILL',
      readJob, (row) => row !== null);
    assert.deepEqual(retained, running);
    assert.ok(Date.now() < retained.lease, 'survivor observed original unexpired lease after death');

    t.comment(JSON.stringify({retainedAfterExit: retained, observedAt: Date.now()}));
    const after = await until(t, 'live metadata quorum after owner loss',
      () => memberships(survivors, metadata), (rows) => metadata.every((id) => quorum(rows, id, 2)));
    for (const id of metadata) {
      const prior = quorum(before, id, 2, owner.nodeId);
      const current = quorum(after, id, 2);
      t.comment(JSON.stringify({partitionId: id, leaderChanged: prior.replicaId !== current.replicaId,
        priorLeader: prior.replicaId, priorTerm: prior.term, leader: current.replicaId, term: current.term}));
    }
    const takeover = await until(t, 'surviving process granted the same job',
      () => traces(survivors), (rows) => rows.some((row) => row.grants.length));
    const successor = takeover.find((row) => row.grants.length);
    const next = successor.grants[0];
    assert.deepEqual([next.jobId, next.tableId, next.key], [jobId, tableId, grant.key]);
    assert.notEqual(next.ownerId, ownerId);
    assert.ok(next.fence > running.fence && next.at >= running.lease);
    const claim = successor.claims.find((entry) => entry.fence === next.fence && entry.ownerId === next.ownerId);
    assert.ok(claim && claim.at >= running.lease && claim.lease > claim.at);
    t.comment(JSON.stringify({successorNode: successor.nodeId, next, claim}));
    const finished = await until(t, 'successor committed terminal transition',
      () => traces(survivors), (rows) => rows.some((row) => row.completed)).catch((error) => {
      for (const member of members) {
        const retainedPath = `${cluster.rootDir}-${member.nodeId}-owner-loss.log`;
        try {
          copyFileSync(member.logPath, retainedPath);
          t.comment(`node ${member.nodeId} log: ${retainedPath}`);
        } catch (copyError) {
          t.comment(`node ${member.nodeId} log copy failed: ${copyError.message}`);
        }
      }
      throw error;
    });
    const winner = finished.find((row) => row.completed);
    assert.equal(winner.nodeId, successor.nodeId);
    assert.deepEqual([winner.completed.jobId, winner.completed.tableId, winner.completed.ownerId,
      winner.completed.status], [jobId, tableId, next.ownerId, 'SUCCEEDED']);
    const terminal = await until(t, 'leader-backed SUCCEEDED row', readJob, (row) => row?.status === 'SUCCEEDED');
    assert.deepEqual([terminal.status, terminal.jobId, terminal.tableId, terminal.fence],
      ['SUCCEEDED', jobId, tableId, winner.completed.fence]);
    assert.ok(terminal.fence >= next.fence && terminal.version > running.version);
    const table = await until(t, 'three surviving committed voters for the created partition',
      () => memberships(survivors, [partitionId]), (rows) => Boolean(quorum(rows, partitionId, 3)));
    const originalReply = await submitted;
    if (originalReply.code === '55P03') {
      assert.equal(JSON.parse(originalReply.detail).provisioning_job_id, jobId);
    } else {
      assert.ok(originalReply.at >= crashAt, JSON.stringify(originalReply));
    }
    t.comment(JSON.stringify({terminal, table: quorum(table, partitionId, 3), originalReply}));
    const session = await observer.openApplicationDatabase('wire-owner-loss');
    const liveEndpoint = (row) => survivors.some((member) => member.nodeId === row.node_id);
    const {rows: publishedRows} = await readUntil(t, observer, session, endpointSql, endpointParams,
      (rows) => rows.some(liveEndpoint));
    const published = publishedRows.find(liveEndpoint);
    const fresh = await cluster.createPgClient({host: published.address, port: Number(published.port)});
    const jobs = await fresh.query('SELECT job_id, table_id, status FROM schema_operations WHERE table_name = $1',
      [tableName]);
    assert.deepEqual(jobs.rows, [{job_id: jobId, table_id: tableId, status: 'SUCCEEDED'}]);
    const partitionRows = await fresh.query(
      'SELECT partition_id, replica_count FROM partitions WHERE table_id = $1', [tableId]);
    assert.deepEqual(partitionRows.rows.map((row) => [row.partition_id, Number(row.replica_count)]), [[partitionId, 3]]);
    assert.equal((await fresh.query(`INSERT INTO ${tableName} (id, payload) VALUES ($1, $2)`,
      ['after', 'owner loss'])).rowCount, 1);
    assert.deepEqual((await fresh.query(`SELECT payload FROM ${tableName} WHERE id = $1`,
      ['after'])).rows, [{payload: 'owner loss'}]);
  });
