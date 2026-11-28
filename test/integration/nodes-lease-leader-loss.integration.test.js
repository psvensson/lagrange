import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {SERVICE_STATUS, STATE} from '../../src/constants/index.js';
import {scaleByMachineFactor} from '../../scripts/test-machine-factor.js';
import {RAFT_LEADERSHIP_TRANSFER_REASON, RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {test} from '../../src/test-helpers/tap.js';
import {createEmbeddedCluster} from './helpers/embedded-cluster-harness.js';
import {scalePasswordPgwire} from './helpers/public-binding-seam-harness.js';

const workerPath = fileURLToPath(new URL('./helpers/nodes-lease-leader-loss-worker.js', import.meta.url));
const ports = createPortAllocator(import.meta.url);
const selectWarehouse = 'SELECT payload FROM lease_probe_warehouse WHERE id = $1';

async function operation(node, name, args = {}) {
  const reply = await node.channel.request(name, args);
  assert.equal(reply.ok, true, JSON.stringify({nodeId: node.nodeId, name, error: reply.error}));
  return reply.value;
}

async function waitFor(t, description, observe, accepts) {
  const deadline = Date.now() + scaleByMachineFactor(90000);
  let latest;
  do {
    latest = await observe();
    if (accepts(latest)) return latest;
    await managedSleep(t, 400);
  } while (Date.now() < deadline);
  throw new Error(description + ': ' + JSON.stringify(latest));
}

function agreedLeader(views) {
  const replicas = views.flatMap((view) => view.replicas);
  if (replicas.length !== 3 || new Set(replicas.map((r) => r.nodeId)).size !== 3) return null;
  const voters = new Set(replicas.map((r) => r.replicaId));
  if (voters.size !== 3) return null;
  const leaders = replicas.filter((r) => r.isLeader && r.leaderReplicaId === r.replicaId);
  if (leaders.length !== 1) return null;
  const [leader] = leaders;
  return Number.isSafeInteger(leader.term) && leader.term > 0 && replicas.every((r) =>
    r.gateOpen && r.term === leader.term && r.leaderReplicaId === leader.replicaId &&
    r.voterReplicaIds?.length === 3 && new Set(r.voterReplicaIds).size === 3 &&
    r.voterReplicaIds.every((voter) => voters.has(voter)) &&
    r.votersOutgoingReplicaIds?.length === 0) ? leader : null;
}

function remotePublisher(views, leader) {
  for (const view of views) {
    for (const hop of Object.values(view.trace.lastRenewalByNode)) {
      if (hop.normalPublisher && hop.originNodeId !== leader.nodeId &&
          hop.commitWitness.term === leader.term &&
          hop.commitWitness.leaderReplicaId === leader.replicaId &&
          hop.address === leader.nodeId + '/partition/' + leader.replicaId) return hop;
    }
  }
  return null;
}

function persistedLeader(views, expected) {
  const owners = views.map((view) => view.partitionOwner).filter(Boolean);
  return owners.length === 1 && owners[0].leader_node_id === expected.nodeId &&
    Number(owners[0].leader_term) === expected.term;
}

function liveReady(row, at) {
  return row?.connection_state === STATE.READY && row.status === SERVICE_STATUS.ACTIVE &&
    Number(row.boot_incarnation) > 0 && Number(row.ready_lease_expires_at) > at;
}

function remoteHopMatches(hop, write, witness, leader) {
  return hop?.entryId === write.entryId && hop.idempotencyKey === write.idempotencyKey &&
    hop.originNodeId === write.originNodeId && write.originNodeId !== leader.nodeId &&
    hop.commitWitness.term === witness.term &&
    hop.commitWitness.logIndex === witness.logIndex &&
    hop.address === leader.nodeId + '/partition/' + leader.replicaId;
}

function writeCoversRow(write, row, restoredAt) {
  return write.bootIncarnation === row.boot_incarnation && write.lastHeartbeat >= restoredAt &&
    write.lastHeartbeat <= row.last_heartbeat &&
    write.readyLeaseExpiresAt <= row.ready_lease_expires_at;
}

function witnessesLeader(write, witness, leader) {
  return write.entryId && write.idempotencyKey && witness?.entryId === write.entryId &&
    witness.partitionId === 'nodes-p1' && witness.leaderReplicaId === leader.replicaId &&
    witness.term === leader.term && witness.logIndex > 0 &&
    witness.logIndex <= leader.appliedIndex;
}

function confirmedRenewal(views, leader, row, restoredAt, requireRemote = false) {
  return views.some((view) => {
    const write = view.trace.committedByNode[row.node_id];
    const witness = write?.commitWitness;
    const hop = view.trace.lastRenewalByNode[row.node_id];
    return write?.normalPublisher && write.changes === 1 &&
      (!requireRemote || remoteHopMatches(hop, write, witness, leader)) &&
      writeCoversRow(write, row, restoredAt) && witnessesLeader(write, witness, leader);
  });
}

function leaseRows(replica, members) {
  return members.map(({nodeId}) => replica?.rows?.find((row) => row.node_id === nodeId));
}

test('fresh NODES leader restores committed READY leases and warehouse access after a lost renewal answer',
  {timeout: 600000}, async (t) => {
    const cluster = createEmbeddedCluster(t);
    const seed = await cluster.startEmbeddedNode({workerPath, hostId: 'lease-a',
      listenerPorts: ports.getListenerPorts(), configuration: {formation: {declaredHostCount: 3}}});
    for (const hostId of ['lease-b', 'lease-c']) {
      await cluster.startEmbeddedNode({workerPath, role: 'joiner', hostId,
        seedRestPort: seed.restPort, listenerPorts: ports.getListenerPorts()});
    }
    await cluster.waitForClusterSize(3);
    const bind = ports.getPortBlock(1);
    await scalePasswordPgwire(1, {portRangeStart: bind[0], portRangeEnd: bind[0]}, {
      restPort: seed.restPort, deadlineMs: Date.now() + scaleByMachineFactor(60000),
      pause: () => managedSleep(t, 100),
    });
    const endpoints = await waitFor(t, 'PG-wire listener', () => cluster.seedQueryRows(
      'SELECT node_id, address, port FROM service_endpoints WHERE service_id = ? AND protocol = ?',
      ['sys-postgres-wire', 'postgresql']), (rows) => rows.some((row) => row.address && row.port));
    const endpoint = endpoints.find((row) => row.address && row.port);
    const connect = () =>
      cluster.createPgClient({host: endpoint.address, port: Number(endpoint.port)});
    const client = await connect();
    await client.query('CREATE TABLE lease_probe_warehouse (id TEXT PRIMARY KEY, payload TEXT)');
    await client.query('INSERT INTO lease_probe_warehouse (id, payload) VALUES ($1, $2)', ['w1', 'committed']);
    const expectedRows = [{payload: 'committed'}];
    assert.deepEqual((await client.query(selectWarehouse, ['w1'])).rows, expectedRows);

    const table = await client.query('SELECT table_id FROM tables WHERE table_name = $1', ['lease_probe_warehouse']);
    assert.equal(table.rows.length, 1);
    const partitions = await client.query('SELECT partition_id, replica_count FROM partitions WHERE table_id = $1',
      [table.rows[0].table_id]);
    assert.equal(partitions.rows.length, 1);
    assert.equal(Number(partitions.rows[0].replica_count), 3);
    const warehousePartition = partitions.rows[0].partition_id;
    const members = cluster.nodes;
    const all = (name, args) => Promise.all(members.map((node) => operation(node, name, args)));
    const views = () => all('nodesLeaseView');
    const before = await waitFor(t, 'RF3 original leader, published term and three live leases', views,
      (snapshot) => {
        const leader = agreedLeader(snapshot);
        return leader && persistedLeader(snapshot, leader) &&
          leaseRows(leader, members).every((r) => liveReady(r, Date.now())) &&
          remotePublisher(snapshot, leader);
      });
    const old = agreedLeader(before);
    const successor = before.flatMap((v) => v.replicas).find((r) => r.nodeId !== old.nodeId);
    const baseline = leaseRows(old, members);
    const publisher = remotePublisher(before, old);
    const originIndex = members.findIndex((member) => member.nodeId === publisher.originNodeId);
    assert.ok(originIndex >= 0);
    const lossSubject = publisher.nodeId;
    assert.ok(members.some((member) => member.nodeId === lossSubject));
    const oldNode = members.find((node) => node.nodeId === old.nodeId);
    const onSuccessor = (snapshot) => {
      const leader = agreedLeader(snapshot);
      return leader?.replicaId === successor.replicaId && leader.term > old.term &&
        persistedLeader(snapshot, old) ? leader : null;
    };

    try {
      await all('nodesLeaseGate', {enabled: true});
      await operation(members[originIndex], 'nodesLeaseFault', {nodeId: lossSubject, mode: 'lose_next'});
      const lost = await waitFor(t, 'lost answer after a real successful NODES renewal', views,
        (snapshot) => snapshot.some((v) => v.trace.lost));
      const receipt = lost[originIndex].trace.lost;
      assert.equal(receipt.nodeId, lossSubject);
      assert.equal(receipt.normalPublisher, true);
      assert.equal(receipt.originNodeId, publisher.originNodeId);
      assert.equal(receipt.address, publisher.address);
      assert.equal(receipt.changes, 1);
      assert.equal(receipt.bootIncarnation,
        baseline.find((r) => r.node_id === lossSubject).boot_incarnation);
      assert.ok(receipt.entryId && receipt.idempotencyKey);
      assert.equal(receipt.commitWitness.entryId, receipt.entryId);
      assert.equal(receipt.commitWitness.partitionId, 'nodes-p1');
      assert.equal(receipt.commitWitness.term, old.term);
      assert.equal(receipt.commitWitness.leaderReplicaId, old.replicaId);
      assert.ok(receipt.commitWitness.logIndex > 0);
      t.comment(JSON.stringify({lost: receipt}));
      await all('nodesLeaseFault', {nodeId: '*', mode: 'withhold'});
      const transfer = await operation(oldNode, 'nodesLeaseTransfer', {successorReplicaId: successor.replicaId});
      assert.equal(transfer.outcome, RAFT_OPERATION_OUTCOME.CORE_OK, JSON.stringify(transfer));
      assert.equal(transfer.reason, RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_REQUESTED);
      const denied = await waitFor(t, 'new term with stale publication and three expired leases', views,
        (snapshot) => {
          const leader = onSuccessor(snapshot);
          return leader && snapshot.some((v) => v.trace.lastGated?.leaderNodeId === leader.nodeId &&
              v.trace.lastGated.leaderTerm === leader.term) &&
            snapshot.some((v) => v.trace.withheldCount > 0) &&
            leaseRows(leader,
              members).every((r, i) => r && r.boot_incarnation === baseline[i].boot_incarnation &&
              Number(r.ready_lease_expires_at) > 0 &&
              Number(r.ready_lease_expires_at) <= Date.now());
        });
      const expired = leaseRows(onSuccessor(denied), members);
      const inherited = expired.find((r) => r.node_id === receipt.nodeId);
      assert.ok(inherited.last_heartbeat >= receipt.lastHeartbeat &&
        inherited.ready_lease_expires_at >= receipt.readyLeaseExpiresAt,
      'the successor applied the original acknowledged renewal or a later heartbeat of that boot');
      const queryNode = members.find((node) => node.nodeId === endpoint.node_id);
      const deniedAfter = Date.now();
      await assert.rejects(client.query(selectWarehouse, ['w1']),
        (error) => {
          assert.equal(error.code, 'XX000');
          const detail = JSON.parse(error.detail);
          const failure = detail.firstFailedParticipant;
          assert.equal(detail.participantFailuresOmittedCount, 0);
          assert.equal(failure.partitionId, warehousePartition);
          assert.equal(failure.failedTable, 'lease_probe_warehouse');
          assert.equal(failure.routingReasonCode, 'all_services_filtered_by_readiness');
          assert.equal(failure.routingReadinessDimension, 'serveEligible');
          assert.deepEqual(failure.routingDenialReasonCodes, ['ready_lease_expired']);
          assert.deepEqual(Object.keys(failure.deniedByNodeId).sort(),
            members.map((m) => m.nodeId).sort());
          for (const {nodeId} of members) {
            const decision = failure.deniedByNodeId[nodeId].serveEligibility;
            assert.equal(decision.decision, 'not_eligible');
            assert.deepEqual(decision.reasons, ['ready_lease_expired']);
            assert.ok(Number.isFinite(decision.leaseExpiresAtMs) && decision.leaseExpiresAtMs > 0 &&
              decision.leaseExpiresAtMs <= Date.now());
          }
          return true;
        });

      const denials = cluster.nodeLogLines(queryNode, 'Partition routing candidates filtered by readiness')
        .map((line) => JSON.parse(line)).filter((record) =>
          record.partitionId === warehousePartition && Date.parse(record.time) >= deniedAfter);
      assert.ok(denials.some(({routingSnapshot: r}) =>
        r.activeAddressedServiceCount === 3 && r.routableServiceCount === 0 &&
        members.every(({nodeId}) => r.deniedByNodeId[nodeId]?.reasonCodes.includes('ready_lease_expired'))),
      'the user read encountered three addressed replicas with expired READY leases');

      const restoredAt = Date.now();
      await all('nodesLeaseFault', {nodeId: '*', mode: 'open'});
      const recovered = await waitFor(t, 'same-incarnation applied renewals while leader publication is stale',
        views, (snapshot) => {
          const leader = onSuccessor(snapshot);
          if (!leader) return false;
          const rows = leaseRows(leader, members);
          return rows.every((row, i) => liveReady(row, Date.now()) &&
            row.boot_incarnation === baseline[i].boot_incarnation &&
            Number(row.ready_lease_expires_at) > Number(expired[i].ready_lease_expires_at) &&
            confirmedRenewal(snapshot, leader, row, restoredAt)) &&
            rows.some((row) => confirmedRenewal(snapshot, leader, row, restoredAt, true));
        });
      const current = onSuccessor(recovered);
      const fresh = await connect();
      assert.deepEqual((await fresh.query(selectWarehouse, ['w1'])).rows, expectedRows);
      assert.ok(onSuccessor(await views()), 'durable leader publication stayed stale through public access');
      t.comment(JSON.stringify({oldLeader: old.replicaId, oldTerm: old.term,
        successor: current.replicaId, term: current.term, restoredAt,
        renewed: leaseRows(current, members)}));
    } finally {
      await all('nodesLeaseFault', {nodeId: '*', mode: 'open'});
      await all('nodesLeaseGate', {enabled: false});
    }
  });
