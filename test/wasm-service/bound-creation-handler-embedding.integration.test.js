// C6 handler integration of design ACTIVATION-DISCOVERY-DESIGN-20261017
// (Revision 3 governs, then Revision 2, Revision 1; witnesses C6-1/2/3/7/8/9 and
// cells (e), (f), (g), (h) on native RF3). The component cells C6-4/5/6/10/11
// and (a)/(b)/(c)/(d)/(i) are in test/node/runtime-service-bound-route.test.js
// and test/runtime/service-runtime-consensus-publication.test.js.
// Evidence ceiling: bound-creation-handler-embedding-fixture.js header.
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {embedding} from './bound-creation-handler-embedding-fixture.js';
import {deliverScheduled} from './wasm-strong-write-native-fixture.js';
import {ReplicaOperationMessageType as TYPE, ReplicaOperationResponseStatus as REPLY} from
  '../../src/rebalancer/replica-operation-constants.js';
import {EXECUTOR_OUTCOME_TYPE as OUTCOME} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {buildServiceDiscoveryCatalog} from '../../src/runtime/service-discovery-catalog.js';
import {runtimeServiceConsensusIdentity} from
  '../../src/rebalancer/runtime-service-replica-identity.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR} from
  '../../src/raft/raft-operation-port-constants.js';
import {WASM_SERVICE_PROTOCOL} from '../../src/wasm-service/wasm-service-constants.js';

// The DERIVED endpoint hosts of the fixture's node address owners (cell e):
// never the raw host:port NODE_ADDRESS, and the advertised WS host wins.
const DERIVED_HOSTS = Object.freeze(['host-1.lab.test', 'host-2.lab.test', 'edge-3.lab.test']);
const FAULT = 'COMPONENT_AUTHORITATIVE_READ_UNAVAILABLE';
const ELECTION_ROUNDS = 40;
const ROLE_WRITE = /^UPDATE services\b.*\braft_role\b/su;

function physicalOf(host) {
  return runtimeServiceConsensusIdentity(host.intent.consensusBinding,
    host.intent.consensusSlotRequest);
}

function servicesRow(e, host) {
  return e.rows('services').find((row) => row.service_id === physicalOf(host).replicaId) ?? null;
}

function endpointRow(e, host) {
  return e.rows('service_endpoints').find((row) =>
    row.endpoint_id === `${physicalOf(host).replicaId}-ep-${host.nodeId}`) ?? null;
}

function count(host, type) {
  return host.outcomes.filter((outcome) => outcome.outcomeType === type).length;
}

function roleWrites(e, host) {
  const id = physicalOf(host).replicaId;
  return e.metadata.writes.filter((write) => ROLE_WRITE.test(write.sql) &&
    JSON.stringify(write.params).includes(id));
}

// The discovery catalog over the endpoint rows, for the WASM endpoint protocol.
function catalogOf(e) {
  return buildServiceDiscoveryCatalog(e.rows('service_endpoints'),
    {protocolAllowlist: [WASM_SERVICE_PROTOCOL.WEBSOCKET]});
}

function writeIndex(e, predicate) {
  return e.metadata.writes.findIndex(predicate);
}

async function heldGroup(t) {
  const e = await embedding(t);
  for (let slot = 0; slot < 3; slot += 1) await e.addHost(slot);
  for (const host of e.hosts) {
    host.retained = await e.retain(host);
    assert.equal(host.retained.outcome, 'ADMISSION_RETAINED');
  }
  for (const host of e.hosts) {
    const reply = await e.dispatch(host, TYPE.CREATE_REPLICA);
    assert.equal(reply.status, REPLY.INITIATED, JSON.stringify(reply));
  }
  await e.settle(() => e.hosts.every((host) =>
    count(host, OUTCOME.RUNTIME_SERVICE_CREATE_HELD) > 0), 'founders held');
  return e;
}

async function publishedGroup(t) {
  const e = await heldGroup(t);
  await e.form();
  await e.settle(() => e.hosts.every((host) =>
    count(host, OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE) === 1), 'founders active');
  return e;
}

async function transferLeadership(e, from, to) {
  const answer = await from.raft.transferLeadership({
    successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED, replicaIdentity: to.replicaId});
  assert.equal(answer.outcome, 'CORE_OK', JSON.stringify(answer));
  for (let round = 0; round < ELECTION_ROUNDS; round += 1) {
    await deliverScheduled(e);
    if (to.isLeader && !from.isLeader) return;
    await from.raft.tick();
  }
  assert.fail(`${to.replicaId} did not take leadership within the fixed schedule`);
}

function faultNextClose(e) {
  const owner = e.metadata.primary;
  const close = owner.closeInstanceResource.bind(owner);
  let faulted = false;
  owner.closeInstanceResource = (...args) => {
    if (!faulted) {
      faulted = true;
      e.metadata.loseReply('owner-a', () =>
        e.metadata.setGatewayReadFault('owner-a', new Error(FAULT)));
    }
    return close(...args);
  };
}

describe('C6: real RuntimeServiceHandler + manager + runtime + native lifecycle on three hosts', () => {
  test('C6-1 HELD, C6-3 duplicate, C6-2 PUBLISHED rows + one catalog group, (e) (f) (g) (h)',
    async (t) => {
      const e = await heldGroup(t);
      // C6-1: every founder HELD, typed, nothing projected before PUBLISHED.
      for (const host of e.hosts) {
        const memo = host.handler.getLocalReplica(host.intent.consensusSlotRequest.replicaId);
        assert.equal(memo.status, ReplicaStatus.HELD);
        assert.equal(memo.operationId, host.intent.consensusSlotRequest.operationId);
        assert.equal(count(host, OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE), 0);
        assert.equal(count(host, OUTCOME.RUNTIME_SERVICE_CREATE_FAILED), 0);
      }
      assert.deepEqual([e.rows('services'), e.rows('service_endpoints')], [[], []],
        'NO_ROW_FOR_A_HELD_REPLICA');
      // RV3.4: the PRESENT mark is keyed by the exact token; another creation's
      // token under the same serviceId marks nothing.
      const [firstHost, secondHost] = e.hosts;
      assert.equal(firstHost.lifecycle.enableServicesRowPublication(e.serviceId,
        'runtime_service', secondHost.retained.token).outcome, 'NOT_REGISTERED');
      assert.equal(e.replicaOf(firstHost).servicesRow.state, 'ABSENT', 'MARKED_BY_SERVICE_ID');
      // C6-3: a duplicate CREATE while HELD re-enters and answers IN_PROGRESS.
      const before = count(e.hosts[0], OUTCOME.RUNTIME_SERVICE_CREATE_HELD);
      assert.equal((await e.dispatch(e.hosts[0], TYPE.CREATE_REPLICA)).status, REPLY.IN_PROGRESS);
      await e.settle(() => count(e.hosts[0], OUTCOME.RUNTIME_SERVICE_CREATE_HELD) > before,
        'duplicate re-entry');
      // C6-2: genesis -> native event run publishes -> wake -> handler re-entry
      // -> PUBLISHED -> services + endpoint rows -> PRESENT -> CREATE_ACTIVE.
      await e.form();
      await e.settle(() => e.hosts.every((host) =>
        count(host, OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE) === 1), 'founders active');
      for (const [index, host] of e.hosts.entries()) {
        const physical = physicalOf(host);
        const memo = host.handler.getLocalReplica(host.intent.consensusSlotRequest.replicaId);
        assert.equal(memo.status, ReplicaStatus.ACTIVE);
        const row = servicesRow(e, host);
        assert.deepEqual({service_type: row?.service_type, replica_id: row?.replica_id,
          group_id: row?.group_id, create_attempt_token: row?.create_attempt_token,
          node_id: row?.node_id, status: row?.status, cleanup_token: row?.cleanup_token},
        {service_type: 'runtime_service', replica_id: host.intent.consensusSlotRequest.replicaId,
          group_id: physical.groupId, create_attempt_token:
            host.intent.consensusSlotRequest.operationId, node_id: host.nodeId, status: 'active',
          cleanup_token: null}, `${host.nodeId} services row`);
        // (e) the DERIVED host on both rows, on every host.
        assert.equal(row.address, DERIVED_HOSTS[index], 'SERVICES_ROW_ADDRESS_NOT_DERIVED');
        const endpoint = endpointRow(e, host);
        assert.ok(endpoint, `${host.nodeId} endpoint row by physical id`);
        assert.equal(endpoint.address, DERIVED_HOSTS[index], 'ENDPOINT_ADDRESS_NOT_DERIVED');
        assert.equal(endpoint.service_id, e.serviceId);
        assert.equal(JSON.parse(endpoint.metadata).service_name, e.serviceId);
        assert.equal(endpoint.port, e.replicaOf(host).portAllocation);
        // (f) the role CAS APPLIED through the production predicate (row read).
        assert.equal(row.raft_role, e.replicaOf(host).role, `${host.nodeId} raft_role`);
        // (h) the first role write happened at PRESENT, after the row existed.
        const born = writeIndex(e, (write) => /^INSERT INTO services\b/u.test(write.sql) &&
          JSON.stringify(write.params).includes(physical.replicaId));
        assert.ok(born >= 0, `${host.nodeId} SERVICES_ROW_INSERT_NOT_FOUND`);
        const roles = roleWrites(e, host);
        assert.ok(roles.length > 0, `${host.nodeId} wrote no role`);
        assert.ok(e.metadata.writes.indexOf(roles[0]) > born, 'ROLE_WRITE_BEFORE_ROW');
      }
      assert.equal(servicesRow(e, e.hosts[0]).raft_role, 'leader');
      const catalog = catalogOf(e);
      assert.equal(catalog.length, 1, JSON.stringify(catalog));
      assert.equal(catalog[0].observedReplicaCount, 3);
      assert.equal(catalog[0].healthyReplicaCount, 3);
      assert.deepEqual(catalog[0].serviceIds, [e.serviceId]);
      // (h) a re-drive that finds PRESENT writes nothing.
      const writesBefore = e.hosts.map((host) => roleWrites(e, host).length);
      const redriven = await e.hosts[1].manager.resumeConsensusCreation(
        e.hosts[1].intent.consensusSlotRequest.operationId, {nodeId: e.hosts[1].nodeId});
      assert.equal(redriven.status, 'PUBLISHED', JSON.stringify(redriven));
      await e.settle();
      assert.deepEqual(e.hosts.map((host) => roleWrites(e, host).length), writesBefore,
        'A_PRESENT_REDRIVE_REPLAYED_ROLE_PUBLICATION');
      // (g) a leader change after PRESENT re-publishes through the leadership events.
      await transferLeadership(e, e.replicaOf(e.hosts[0]), e.replicaOf(e.hosts[1]));
      await e.settle(() => servicesRow(e, e.hosts[1]).raft_role === 'leader' &&
        servicesRow(e, e.hosts[0]).raft_role !== 'leader', 'leader change published');
    });

  test('C6-7 REMOVE withdraws endpoint before CLOSED and the row after; C6-8 closed:false holds; C6-9 restart',
    async (t) => {
      const e = await publishedGroup(t);
      const [first, second, third] = e.hosts;
      // C6-7 on the third founder.
      const thirdPhysical = physicalOf(third).replicaId;
      const from = e.metadata.writes.length;
      assert.equal((await e.dispatch(third, TYPE.REMOVE_REPLICA, 'remove-3')).status,
        REPLY.INITIATED);
      await e.settle(() => count(third, OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED) === 1,
        'third removed');
      const writes = e.metadata.writes.slice(from);
      const endpointDelete = writes.findIndex((write) => /^DELETE FROM service_endpoints\b/u
        .test(write.sql) && JSON.stringify(write.params).includes(thirdPhysical));
      const closed = writes.findIndex((write) => /\bservice_instances\b/u.test(write.sql) &&
        write.changes === 1 && write.state?.selected?.resources?.[2]?.phase === 'CLOSED');
      const rowDelete = writes.findIndex((write) => /^DELETE FROM services\b/u.test(write.sql) &&
        JSON.stringify(write.params).includes(thirdPhysical));
      assert.ok(endpointDelete >= 0 && closed > endpointDelete && rowDelete > closed,
        `ORDER endpoint=${endpointDelete} closed=${closed} row=${rowDelete}`);
      assert.equal(servicesRow(e, third), null);
      assert.equal(endpointRow(e, third), null);
      assert.equal(catalogOf(e)[0].observedReplicaCount, 2);
      // C6-8 on the second founder: an unresolved CLOSED holds custody.
      faultNextClose(e);
      await e.dispatch(second, TYPE.REMOVE_REPLICA, 'remove-2');
      await e.settle(() => count(second, OUTCOME.RUNTIME_SERVICE_REMOVE_HELD) === 1,
        'second held');
      const memo = second.handler.getLocalReplica(second.intent.consensusSlotRequest.replicaId);
      assert.equal(memo.status, ReplicaStatus.REMOVING);
      assert.ok(servicesRow(e, second), 'the services row stays with custody');
      assert.equal(endpointRow(e, second), null, 'the endpoint was withdrawn before the stop');
      e.metadata.setGatewayReadFault('owner-a', null);
      assert.equal((await e.dispatch(second, TYPE.REMOVE_REPLICA, 'remove-2')).status,
        REPLY.IN_PROGRESS);
      await e.settle(() => count(second, OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED) === 1,
        'second re-removed');
      assert.equal(servicesRow(e, second), null);
      // C6-9 on the first founder: the handler restarts; the row hint recovers.
      e.restartHandler(first);
      assert.equal(first.handler.getLocalReplica(first.intent.consensusSlotRequest.replicaId),
        undefined);
      assert.equal((await e.dispatch(first, TYPE.REMOVE_REPLICA, 'remove-1')).status,
        REPLY.INITIATED);
      await e.settle(() => count(first, OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED) === 1,
        'first removed after restart');
      assert.deepEqual([e.rows('services'), e.rows('service_endpoints')], [[], []]);
      for (const slot of [0, 1, 2]) {
        assert.equal(e.metadata.state().selected.resources[slot].phase, 'CLOSED');
      }
    });
});
