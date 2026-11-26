import assert from 'node:assert/strict';
import {once} from 'node:events';
import {copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {scaleByMachineFactor} from '../../scripts/test-machine-factor.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {test} from '../../src/test-helpers/tap.js';
import {createEmbeddedCluster, readUntil} from './helpers/embedded-cluster-harness.js';
import {isTerminalReplicaOperationRecord, isTerminalSuccessfulCreateOperation}
  from '../../src/rebalancer/replica-operation-progress.js';
import {normalizeReplicaOperationRecord} from '../../src/rebalancer/replica-operation-liveness.js';
import {scalePasswordPgwire} from './helpers/public-binding-seam-harness.js';

const tableName = 'wire_owner_loss_orders';
const createSql = `CREATE TABLE ${tableName} (id TEXT PRIMARY KEY, payload TEXT)`;
const ports = createPortAllocator(import.meta.url);
const workerPath = fileURLToPath(new URL('./helpers/schema-owner-loss-worker.js', import.meta.url));
const metadata = ['schema_operations-p1', 'replica_operations-p1', 'services-p1', 'tables-p1', 'partitions-p1', 'nodes-p1'];

// An endpoint is published by start(), before the placement operation can
// settle. A REPLACE may temporarily expose both source and target listeners.
function settledListenerEndpoints(rows, operations, members) {
  const live = operations.filter((row) => !isTerminalReplicaOperationRecord(row));
  const created = operations.map((row) => normalizeReplicaOperationRecord(row))
    .filter(isTerminalSuccessfulCreateOperation);
  return rows.filter((row) => members.some((member) => member.nodeId === row.node_id) &&
    created.some((op) => op.targetNodeId === row.node_id) &&
    !live.some((op) => op.target_node_id === row.node_id || op.source_node_id === row.node_id));
}

test('a published listener being replaced cannot satisfy the two-listener setup', async () => {
  const nodes = ['a', 'b'];
  const rows = nodes.map((node_id) => ({node_id}));
  const members = nodes.map((nodeId) => ({nodeId}));
  const adds = nodes.map((node) => ({operation_id: 'add-' + node, type: 'ADD',
    target_node_id: node, replica_id: 'listener-' + node, status: 'active', workflow_step: 'ACTIVE'}));
  assert.deepEqual(settledListenerEndpoints(rows, adds, members), rows);
  const replacing = {operation_id: 'move', type: 'REPLACE', source_node_id: 'a',
    target_node_id: 'b', status: 'active', workflow_step: 'ACTIVE'};
  assert.deepEqual(settledListenerEndpoints(rows, [...adds, replacing], members), []);
});

async function observe(member, op, args) {
  const reply = await member.channel.request(op, args);
  assert.equal(reply.ok, true, JSON.stringify(reply.error));
  return reply.value;
}

async function until(t, description, read, accepts, budgetMs = 90000, signal) {
  const deadline = Date.now() + scaleByMachineFactor(budgetMs);
  let last;
  do {
    signal?.throwIfAborted();
    last = await read();
    signal?.throwIfAborted();
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

function hasMetadataQuorums(rows, excludedNodeId) {
  return metadata.every((id) => quorum(rows, id, 2, excludedNodeId));
}

test('owner loss requires surviving voters for the provisioning ledger', async () => {
  const rows = ['schema_operations', 'services', 'tables', 'partitions', 'nodes', 'replica_operations']
    .flatMap((table) => ['owner', 'survivor-a', 'survivor-b'].map((nodeId) => ({
      partitionId: table + '-p1', nodeId, replicaId: nodeId, leaderReplicaId: 'owner',
      isLeader: nodeId === 'owner', voterReplicaIds: ['owner', 'survivor-a', 'survivor-b'],
      votersOutgoingReplicaIds: [], term: 1, gateOpen: true,
    })));
  assert.ok(hasMetadataQuorums(rows, 'owner'));
  const missingLedgerVoter = rows.filter((row) =>
    row.partitionId !== 'replica_operations-p1' || row.nodeId !== 'survivor-b');
  assert.equal(hasMetadataQuorums(missingLedgerVoter, 'owner'), false);
});

async function traces(members) {
  return Promise.all(members.map(async (member) => ({
    nodeId: member.nodeId, ...await observe(member, 'trace'),
  })));
}

test('a live RF3 schema job survives abrupt owner loss and a new owner completes the same CREATE',
  {timeout: 480000}, async (t) => {
    const cluster = createEmbeddedCluster(t);
    try {
      await proveOwnerLoss(t, cluster);
    } catch (error) {
      for (const member of cluster.nodes) {
        const retainedPath = `${cluster.rootDir}-${member.nodeId}-owner-loss.log`;
        try {
          copyFileSync(member.logPath, retainedPath);
          t.comment(`node ${member.nodeId} log: ${retainedPath}`);
        } catch (copyError) {
          t.comment(`node ${member.nodeId} log copy failed: ${copyError.message}`);
        }
      }
      if (error.socketObservation) {
        t.comment(JSON.stringify(error.socketObservation));
        await Promise.all(cluster.nodes.map(async (member) => {
          const requestedAt = Date.now();
          try {
            const [trace, listener] = await Promise.all([observe(member, 'trace'), observe(member, 'closeProvenance')]);
            t.comment(JSON.stringify({nodeId: member.nodeId, requestedAt, observedAt: Date.now(), trace, listener}));
          } catch (observationError) {
            t.comment(JSON.stringify({nodeId: member.nodeId, requestedAt, observedAt: Date.now(),
              observedExit: member.channel.exitState(), error: observationError.message}));
          }
        }));
      }
      throw error;
    }
  });

async function proveOwnerLoss(t, cluster) {
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
    (rows) => hasMetadataQuorums(rows));
  const placementSql = 'SELECT operation_id, type, status, workflow_step, replica_id, ' +
    'source_node_id, target_node_id FROM replica_operations WHERE entity_id = ?';
  const readPlacement = () => cluster.seedQueryRows(placementSql, ['sys-postgres-wire']);
  const {endpoints} = await until(t, 'two published listeners with settled placement', async () => {
    const rows = await cluster.seedQueryRows(endpointSql, endpointParams);
    const operations = await readPlacement();
    return {endpoints: settledListenerEndpoints(rows, operations, members), rows, operations};
  }, (state) => new Set(state.endpoints.map((row) => row.node_id)).size >= 2);
  const [endpoint] = endpoints;
  const second = endpoints.find((row) => row.node_id !== endpoint.node_id);
  assert.notDeepEqual([endpoint.address, Number(endpoint.port)], [second.address, Number(second.port)]);
  const probe = await cluster.createPgClient({host: second.address, port: Number(second.port)});
  await probe.end();
  t.comment(JSON.stringify({publishedBefore: endpoints}));
  await Promise.all(members.map((member) => observe(member, 'arm', {tableName, sql: createSql})));
  t.teardown(async () => {
    await Promise.allSettled(members.filter((member) => !member.channel.exitState())
      .map((member) => observe(member, 'release')));
  });
  const client = await cluster.createPgClient({host: endpoint.address, port: Number(endpoint.port)});
  // The single submitting socket can disappear with its server.
  client.on('error', (error) => t.comment(`original socket: ${error.message}`));
  const submitted = client.query(createSql)
    .then(() => ({success: true, at: Date.now()}), (error) => ({
      code: error.code, detail: error.detail, message: error.message, at: Date.now(),
    }));
  const clientPort = client.connection.stream.localPort;
  const barrierPoll = new AbortController();
  const entered = await Promise.race([
    until(t, 'owner entered provisioning after catalog commit',
      () => traces(members), (rows) => rows.some((row) => row.barrier), undefined, barrierPoll.signal),
    submitted.then((reply) => {
      if (barrierPoll.signal.aborted) return;
      const socketObservation = {reply, capturedAt: Date.now(), submittingEndpoint: endpoint, clientPort,
        children: members.map((member) => ({nodeId: member.nodeId, observedExit: member.channel.exitState()}))};
      barrierPoll.abort();
      throw Object.assign(new Error(`CREATE socket settled before observed barrier: ${JSON.stringify(reply)}`),
        {socketObservation});
    }),
  ]).finally(() => barrierPoll.abort());
  const [original] = entered.filter((row) => row.barrier);
  assert.equal(entered.filter((row) => row.barrier).length, 1);
  const {ownerId, jobId, tableId, partitionId} = original.barrier;
  const owner = members.find((member) => member.nodeId === original.nodeId);
  const survivors = members.filter((member) => member !== owner);
  assert.ok(endpoints.some((row) => survivors.some((member) => member.nodeId === row.node_id)),
    'a distinct member published a listener before the executor crash');
  const grant = original.grants.find((row) => row.jobId === jobId && row.ownerId === ownerId);
  assert.ok(grant);
  const before = await until(t, 'surviving majority for each committed RF3 metadata group',
    () => memberships(members, metadata),
    (rows) => hasMetadataQuorums(rows, owner.nodeId));
  // Only the original process remains held. Successor work runs unmodified.
  await Promise.all(survivors.map((member) => observe(member, 'release')));
  const observer = survivors[0];
  const readJob = () => observe(observer, 'job', {key: grant.key});
  await Promise.all(survivors.map((member) => observe(member, 'armReleaseObservation')));
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
    () => memberships(survivors, metadata), (rows) => hasMetadataQuorums(rows));
  for (const id of metadata) {
    const prior = quorum(before, id, 2, owner.nodeId);
    const current = quorum(after, id, 2);
    t.comment(JSON.stringify({partitionId: id, leaderChanged: prior.replicaId !== current.replicaId,
      priorLeader: prior.replicaId, priorTerm: prior.term, leader: current.replicaId, term: current.term}));
  }
  const takeover = await until(t, 'surviving process granted the same job',
    () => traces(survivors), (rows) => rows.some((row) => row.grants.length)).catch(async (error) => {
    t.comment(JSON.stringify({lostNode: owner.nodeId,
      schemaMembershipBefore: before.filter((row) => row.partitionId === 'schema_operations-p1'),
      schemaMembershipAfter: after.filter((row) => row.partitionId === 'schema_operations-p1')}));
    await Promise.allSettled(survivors.map(async (member) => {
      const reports = await observe(member, 'releaseObservation');
      t.comment(JSON.stringify({nodeId: member.nodeId, observedAt: Date.now(), releaseReports: reports}));
    }));
    throw error;
  });
  const successor = takeover.find((row) => row.grants.length);
  const next = successor.grants[0];
  assert.deepEqual([next.jobId, next.tableId, next.key], [jobId, tableId, grant.key]);
  assert.notEqual(next.ownerId, ownerId);
  assert.ok(next.fence > running.fence && next.at >= running.lease);
  const claim = successor.claims.find((entry) => entry.fence === next.fence && entry.ownerId === next.ownerId);
  assert.ok(claim && claim.at >= running.lease && claim.lease > claim.at);
  t.comment(JSON.stringify({successorNode: successor.nodeId, next, claim}));
  const finished = await until(t, 'successor committed terminal transition',
    () => traces(survivors), (rows) => rows.some((row) => row.completed));
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
}
