/**
 * Cross-owner anchor (owner decisions round 4 and round 6 §9; invariants I9 +
 * I10): reuse of a logical node / endpoint / group / replica identity never
 * lets delayed work of the older incarnation or runtime generation affect the
 * newer owner. G1 has NODES, endpoints, a durable replica lifecycle and a Raft
 * runtime; G1 work is delayed at every layer (including a G1 READY
 * publication), G2 is fully recreated under the same logical ids, every
 * delayed G1 effect is then released, and G2 keeps NODES G2/READY, endpoints
 * G2, durable lifecycle G2, its running Raft runtime and the only current
 * address route.
 */
import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  NODE_LIFECYCLE_PUBLICATION_OUTCOME,
  NodeLifecyclePublication,
} from '../../src/control-plane/node-lifecycle-publication.js';
import {NodeReadyLeaseAuthority} from
  '../../src/control-plane/node-ready-lease-authority.js';
import {ReplicaState, ReplicaStateMachine} from
  '../../src/node/replica-state-machine.js';
import {resolveNodeWebSocketAddressResult} from
  '../../src/transport/node-address-resolution.js';
import {
  NODE_REGISTRATION_OUTCOME,
  readAuthoritativeNodeRow,
  writeNodeRegistrationAtIncarnation,
} from '../../src/control-plane/owners/node-registration-incarnation-write.js';
import {COLUMN, ENDPOINT_STATUS, STATE, TABLES, TRANSPORT_TYPE} from
  '../../src/constants/index.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {NodeRegistrationOwner} from
  '../../src/bootstrap/shared/node-registration-owner.js';
import {ServiceEndpointsOwner} from
  '../../src/control-plane/owners/service-endpoints-owner.js';
import {wireRuntimeEndpointPublication} from
  '../../src/runtime/runtime-endpoint-publication-wiring.js';
import {writeEndpointAtIncarnation} from
  '../../src/control-plane/owners/endpoint-incarnation-authority.js';
import {raftRsLifecycleAdministration} from
  '../../src/raft/raft-rs-lifecycle-administration.js';
import {PartitionNodeCluster} from '../raft/raft-rs-backend/partition-node-cluster.js';
import {HeartbeatService, initEnv} from
  './heartbeat-memory-trend-test-helpers.js';
import {
  createDurableTables,
  registeredNodeRow,
} from '../test-helpers/endpoint-incarnation-fixture.js';

const NODE_ID = 'anchor-node';
const GROUP_ID = 'anchor-group';
const REPLICA_ID = 'anchor-group-r1';
const SERVICE_ID = GROUP_ID;
const NODE_ENDPOINT_ID = `ep-${NODE_ID}-ws`;
const G1 = 1;
const G2 = 2;

function readyNode(incarnation) {
  return registeredNodeRow(NODE_ID, incarnation, {
    status: 'active',
    connection_state: STATE.READY,
    ready_lease_expires_at: 99_000,
  });
}

function nodeEndpoint(incarnation) {
  return {
    endpoint_id: NODE_ENDPOINT_ID,
    node_id: NODE_ID,
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    address: `ws://g${incarnation}-host:8082`,
    priority: 0,
    status: ENDPOINT_STATUS.ACTIVE,
    boot_incarnation: incarnation,
  };
}

// The durable replica lifecycle row of one generation (same logical ids).
function lifecycleRow(generation) {
  return {
    service_id: REPLICA_ID,
    replica_id: REPLICA_ID,
    group_id: null,
    service_type: 'partition',
    partition_id: GROUP_ID,
    node_id: NODE_ID,
    address: `${NODE_ID}/partition/${REPLICA_ID}`,
    status: ReplicaState.ACTIVE,
    created_at: 10 * generation,
    state_entered_at: 100 * generation,
    updated_at: 100 * generation,
  };
}

// One boot's runtime-endpoint publication, wired as production wires it.
function wireRuntimeEndpoints(durable, incarnation) {
  const lifecycle = {
    setEndpointWriter(writer) {
      this.write = writer;
    },
    setEndpointRemover(remover) {
      this.remove = remover;
    },
  };
  const cache = {
    getAll: (tableName) => (tableName === TABLES.SERVICE_DEFINITIONS ?
      [{service_id: SERVICE_ID}] : []),
  };
  wireRuntimeEndpointPublication({
    bootIncarnation: incarnation,
    nodeId: NODE_ID,
    serviceEndpointsOwner: new ServiceEndpointsOwner({
      controlPlaneSystemTableGateway: durable, systemTableCache: cache}),
    serviceRuntimeLifecycle: lifecycle,
    systemTableCache: cache,
  });
  return lifecycle;
}

function g1Teardown(durable, g1Port) {
  const registration = new NodeRegistrationOwner({
    nodeId: NODE_ID,
    nodeAddress: 'g1-host:8080',
    delegates: {
      getLogger: () => ({debug() {}, info() {}, warn() {}, error() {}}),
      getNow: () => () => 9000,
      getSleep: () => async () => {},
      getBootIncarnation: () => G1,
    },
  });
  registration.getJoinAdmissionWriteRetryTimeoutMs = () => 0;
  registration.getJoinAdmissionControlPlaneSystemTableGateway = () => durable;
  registration.readAuthoritativeMetaEndpointRowsOutcome = async () =>
    ({rows: []});
  const heartbeat = new HeartbeatService({
    nodeId: NODE_ID,
    nodeAddress: 'g1-host:8080',
    bootIncarnation: G1,
    controlPlaneSystemTableGateway: durable,
    systemTableCache: {get: () => readyNode(G1)},
    now: () => 9000,
  });
  const lease = new LeaseService({
    nodeId: 'leader-node',
    nodeLeaseOwner: {disconnectNodeDueToLeaseExpiry: async () => ({})},
    systemTableCache: {getAll: () => []},
    controlPlaneSystemTableGateway: durable,
    messageGroupServices: [{isLeaderReplica: () => true}],
    now: () => 9000,
  });
  const runtimeEndpoints = wireRuntimeEndpoints(durable, G1);
  const g1Lifecycle = new ReplicaStateMachine({nodeId: NODE_ID,
    controlPlaneSystemTableGateway: durable, now: () => 9000});
  const readyPublication = new NodeLifecyclePublication({gateway: durable,
    leaseAuthority: new NodeReadyLeaseAuthority({readyLeaseMs: 15_000}),
    now: () => 9000});
  // Every delayed G1 effect, captured before G2 exists and released after.
  return [
    () => readyPublication.publish({nodeId: NODE_ID, bootIncarnation: G1,
      state: STATE.READY, heartbeatOnly: true, heartbeatAt: 9000,
      nodeAddress: 'g1-host:8080'}),
    () => g1Lifecycle.transitionAuthoritativeReplicaGeneration(
      lifecycleRow(G1), ReplicaState.FAILED,
      {timestamp: 9000, reason: 'delayed-g1-failure'}),
    () => heartbeat.reportNodeShutdown(),
    () => registration.withdrawFailedJoinAdmission(
      {registeredNodeId: NODE_ID}),
    () => lease.reapStaleRowEndpoints(readyNode(G1), 9000),
    () => runtimeEndpoints.remove(REPLICA_ID, NODE_ID),
    () => raftRsLifecycleAdministration.retireReplica(REPLICA_ID,
      'delayed-g1-removal', {groupId: GROUP_ID, runtime: g1Port}),
  ];
}

async function recreateG2(durable) {
  // Registration advances the node row and its endpoints to G2; the
  // replica is recreated as a new durable lifecycle generation.
  durable.rowsOf(TABLES.NODES).set(NODE_ID, readyNode(G2));
  durable.rowsOf(TABLES.SERVICES).set(REPLICA_ID, lifecycleRow(G2));
  const nodeEndpointWrite = await writeEndpointAtIncarnation({
    row: nodeEndpoint(G2),
    bootIncarnation: G2,
    observe: async () => ({available: true,
      row: durable.rowsOf(TABLES.NODE_ENDPOINTS).get(NODE_ENDPOINT_ID)}),
    insert: (row) => durable.insertSystemTableRow(TABLES.NODE_ENDPOINTS, row),
    update: (whereClause, data) => durable.updateSystemTableRow(
      TABLES.NODE_ENDPOINTS, whereClause, data),
  });
  await wireRuntimeEndpoints(durable, G2).write(REPLICA_ID, 'native_js',
    {host: 'g2-host', port: 5432, protocol: 'postgresql'});
  return nodeEndpointWrite;
}

function g2State(durable) {
  return JSON.stringify({
    node: durable.rowsOf(TABLES.NODES).get(NODE_ID),
    lifecycle: durable.rowsOf(TABLES.SERVICES).get(REPLICA_ID),
    endpoints: [...durable.rowsOf(TABLES.NODE_ENDPOINTS).values(),
      ...durable.rowsOf(TABLES.SERVICE_ENDPOINTS).values()],
  });
}

test('delayed G1 teardown at every layer cannot affect the recreated G2 ' +
  'NODES row, endpoints or Raft runtime', async (t) => {
  initEnv();
  const g1World = new PartitionNodeCluster({partitionId: GROUP_ID,
    replicaIds: [REPLICA_ID]});
  const g1Port = g1World.node(REPLICA_ID);
  const durable = createDurableTables({
    [TABLES.NODES]: [readyNode(G1)],
    [TABLES.NODE_ENDPOINTS]: [nodeEndpoint(G1)],
    [TABLES.SERVICES]: [lifecycleRow(G1)],
    [TABLES.PARTITIONS]: [{partition_id: GROUP_ID, leader_node_id: NODE_ID}],
  });
  await wireRuntimeEndpoints(durable, G1).write(REPLICA_ID, 'native_js',
    {host: 'g1-host', port: 5432, protocol: 'postgresql'});
  const delayedG1 = g1Teardown(durable, g1Port);

  // G2 is recreated under the same logical node, endpoint, group and
  // replica ids while G1's runtime teardown is still in flight (both runtime
  // generations are registered in this process at the same time).
  const g2World = new PartitionNodeCluster({partitionId: GROUP_ID,
    replicaIds: [REPLICA_ID]});
  try {
    const g2Port = g2World.node(REPLICA_ID);
    const advanced = await recreateG2(durable);
    t.equal(advanced.outcome, 'applied', 'G2 advanced the node endpoint');
    const before = g2State(durable);
    t.match(JSON.parse(before), {node: {boot_incarnation: G2},
      endpoints: [{boot_incarnation: G2}, {boot_incarnation: G2}]},
    'setup: NODES and every endpoint belong to G2');

    const outcomes = [];
    for (const effect of delayedG1) outcomes.push(await effect());

    t.equal(g2State(durable), before,
      'the G2 NODES row, durable lifecycle and every G2 endpoint survive ' +
        'all delayed G1 work');
    t.equal(outcomes[0].outcome,
      NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_STALE_INCARNATION,
      'the delayed G1 READY publication is refused as stale');
    t.equal(outcomes[1], false,
      'the delayed G1 lifecycle transition cannot touch generation G2');
    t.match(JSON.parse(before).lifecycle,
      {created_at: 20, state_entered_at: 200, status: ReplicaState.ACTIVE},
      'the durable lifecycle is G2');
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.NODES, 'INSERT',
      durable.rowsOf(TABLES.NODES).get(NODE_ID));
    for (const row of durable.rowsOf(TABLES.NODE_ENDPOINTS).values()) {
      cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', row);
    }
    t.match(resolveNodeWebSocketAddressResult({targetNodeId: NODE_ID,
      systemTableCache: cache, bootstrapResponse: {systemTableSnapshots: {
        [TABLES.NODES]: [readyNode(G1)],
        [TABLES.NODE_ENDPOINTS]: [nodeEndpoint(G1)],
      }}}), {state: 'resolved', address: 'ws://g2-host:8082'},
    'address resolution routes to G2 only');
    const status = await g2Port.readStatus();
    t.equal(status.outcome, 'CORE_OK', 'the G2 Raft runtime is still serving');
    t.equal(status.replicaIdentity, REPLICA_ID);
    t.equal(durable.rowsOf(TABLES.NODES).get(NODE_ID)[COLUMN.CONNECTION_STATE],
      STATE.READY, 'G2 stays READY');
    t.equal((await g1Port.readStatus()).reason, 'retired',
      'the delayed G1 removal retired exactly the G1 runtime');
  } finally {
    g1World.dispose();
    g2World.dispose();
  }
});

test('N7: a reaped boot incarnation is terminal: a late G1 READY is ' +
  'refused, G1 stays non-current, and only a new incarnation G2 becomes ' +
  'READY', async (t) => {
  initEnv();
  const joiningG1 = registeredNodeRow(NODE_ID, G1, {
    status: 'joining', connection_state: STATE.CONNECTED,
    last_heartbeat: 1000, ready_lease_expires_at: null, created_at: 500,
  });
  const durable = createDurableTables({
    [TABLES.NODES]: [joiningG1],
    [TABLES.NODE_ENDPOINTS]: [nodeEndpoint(G1)],
  });
  const lease = new LeaseService({
    nodeId: 'leader-node',
    nodeLeaseOwner: {disconnectNodeDueToLeaseExpiry: async () => ({})},
    systemTableCache: {getAll: () => []},
    controlPlaneSystemTableGateway: durable,
    messageGroupServices: [{isLeaderReplica: () => true}],
    now: () => 90_000,
  });
  const publication = new NodeLifecyclePublication({gateway: durable,
    leaseAuthority: new NodeReadyLeaseAuthority({readyLeaseMs: 15_000}),
    now: () => 90_000});
  const ready = (incarnation) => publication.publish({nodeId: NODE_ID,
    bootIncarnation: incarnation, state: STATE.READY, heartbeatOnly: true,
    heartbeatAt: 90_000, nodeAddress: `g${incarnation}-host:8080`});

  t.same(await lease.reapStrandedJoiningRows([joiningG1], 90_000),
    [NODE_ID], 'the stranded G1 joiner is reaped');
  const reaped = durable.rowsOf(TABLES.NODES).get(NODE_ID);
  t.match(reaped, {status: 'stopped', boot_incarnation: G1});

  const lateG1 = await ready(G1);
  t.equal(lateG1.outcome,
    NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_SOURCE_CHANGED,
    'the late G1 READY is refused (a terminal refusal, never re-driven)');
  t.same(durable.rowsOf(TABLES.NODES).get(NODE_ID), reaped,
    'G1 stays reaped: no fenced resurrection');

  const registration = await writeNodeRegistrationAtIncarnation({
    row: registeredNodeRow(NODE_ID, G2, {status: 'joining',
      connection_state: STATE.CONNECTED, last_heartbeat: 90_000,
      ready_lease_expires_at: null, created_at: 90_000}),
    bootIncarnation: G2,
    observe: () => readAuthoritativeNodeRow(durable, NODE_ID),
    insert: (row) => durable.insertSystemTableRow(TABLES.NODES, row),
    advance: (whereClause, row) => durable.updateSystemTableRow(
      TABLES.NODES, whereClause, row),
  });
  t.equal(registration.outcome, NODE_REGISTRATION_OUTCOME.ACCEPTED,
    'a new boot incarnation registers over the reaped G1 row');
  t.equal((await ready(G2)).outcome,
    NODE_LIFECYCLE_PUBLICATION_OUTCOME.APPLIED, 'G2 becomes READY');
  t.equal((await ready(G1)).outcome,
    NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_STALE_INCARNATION,
    'a still later G1 READY is refused as stale against G2');
  t.match(durable.rowsOf(TABLES.NODES).get(NODE_ID),
    {boot_incarnation: G2, connection_state: STATE.READY});
});
