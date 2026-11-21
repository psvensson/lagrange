/**
 * An endpoint belongs to one exact node boot incarnation (owner decision
 * round 4, D1; invariant I9): work for incarnation G1 can never withdraw,
 * replace, delete or masquerade as the endpoint state of its replacement G2.
 */
import {LOCAL_MACHINE_HOST_ID} from '../test-helpers/declared-node-host.js';
import {test} from '../../src/test-helpers/tap.js';
import {releaseControlPlaneWriteIdentities, runControlPlaneWrite} from
  '../../src/control-plane/control-plane-write-identity.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {deriveParticipantEntryId} from '../../src/query/distributed/distributed-write-coordinator.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ENDPOINT_STATUS,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {resolveNodeWebSocketAddressResult} from
  '../../src/transport/node-address-resolution.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {NodeRegistrationOwner} from
  '../../src/bootstrap/shared/node-registration-owner.js';
import {
  ENDPOINT_INCARNATION_OUTCOME as OUTCOME,
  mutateEndpointAtIncarnation,
  writeEndpointAtIncarnation,
} from '../../src/control-plane/owners/endpoint-incarnation-authority.js';
import {
  createDurableTables,
  registeredNodeRow,
} from '../test-helpers/endpoint-incarnation-fixture.js';

const NODE_ID = 'node-endpoint-authority';
const ENDPOINT_ID = `ep-${NODE_ID}-ws`;
const META_ENDPOINT_ID = `sys-postgres-wire-ep-${NODE_ID}`;
const G1 = 1;
const G2 = 2;

function nodeEndpoint(incarnation, address, overrides = {}) {
  return {
    endpoint_id: ENDPOINT_ID,
    node_id: NODE_ID,
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    address,
    priority: 0,
    status: ENDPOINT_STATUS.ACTIVE,
    boot_incarnation: incarnation,
    ...overrides,
  };
}

function metaEndpoint(incarnation) {
  return {
    endpoint_id: META_ENDPOINT_ID,
    service_id: 'sys-postgres-wire',
    node_id: NODE_ID,
    address: `g${incarnation}-host`,
    health_status: 'healthy',
    boot_incarnation: incarnation,
  };
}

// G2 has replaced G1: its NODES row and both of its endpoint rows exist.
function replacedByG2() {
  return createDurableTables({
    [TABLES.NODES]: [registeredNodeRow(NODE_ID, G2)],
    [TABLES.NODE_ENDPOINTS]: [nodeEndpoint(G2, 'ws://g2-host:8082')],
    [TABLES.SERVICE_ENDPOINTS]: [metaEndpoint(G2)],
  });
}

function snapshot(gateway) {
  return JSON.stringify([TABLES.NODES, TABLES.NODE_ENDPOINTS,
    TABLES.SERVICE_ENDPOINTS].map((table) =>
    [...gateway.rowsOf(table).values()]));
}

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function g1RegistrationOwner(gateway) {
  const owner = new NodeRegistrationOwner({
    hostId: LOCAL_MACHINE_HOST_ID,
    nodeId: NODE_ID,
    nodeAddress: 'g1-host:8080',
    delegates: {
      getLogger: () => ({debug() {}, info() {}, warn() {}, error() {}}),
      getNow: () => () => 9000,
      getSleep: () => async () => {},
      getBootIncarnation: () => G1,
      getSystemTableCache: () => ({applySystemTableChange() {}}),
    },
  });
  owner.getJoinAdmissionWriteRetryTimeoutMs = () => 0;
  owner.getJoinAdmissionControlPlaneSystemTableGateway = () => gateway;
  return owner;
}

test('a delayed G1 endpoint withdrawal leaves G2 NODES and endpoints unchanged',
  async (t) => {
    initEnv();
    const gateway = replacedByG2();
    const before = snapshot(gateway);
    const owner = g1RegistrationOwner(gateway);
    t.equal(await owner.withdrawEndpointAtIncarnation(TABLES.NODE_ENDPOINTS,
      ENDPOINT_ID, {status: ENDPOINT_STATUS.INACTIVE, updated_at: 9000},
      'node_endpoint'), false, 'the G1 node-endpoint withdrawal is stale');
    t.equal(await owner.withdrawEndpointAtIncarnation(
      TABLES.SERVICE_ENDPOINTS, META_ENDPOINT_ID,
      {health_status: 'unhealthy', updated_at: 9000}, 'service_endpoint'),
    false, 'the G1 meta-endpoint withdrawal is stale');
    t.match(gateway.writes.filter((w) => w.op === 'update')
      .map((w) => w.whereClause.boot_incarnation), [G1, G1],
    'each final mutation carries G1 itself');
    t.equal(snapshot(gateway), before, 'G2 NODES and endpoints are unchanged');
  });

test('a G1 stranded reap after G2 registration touches no G2 endpoint',
  async (t) => {
    initEnv();
    const gateway = replacedByG2();
    const before = snapshot(gateway);
    const service = new LeaseService({
      nodeId: 'leader-node',
      nodeLeaseOwner: {disconnectNodeDueToLeaseExpiry: async () => ({})},
      systemTableCache: {getAll: () => []},
      controlPlaneSystemTableGateway: gateway,
      messageGroupServices: [{isLeaderReplica: () => true}],
      now: () => 9000,
    });
    await service.reapStaleRowEndpoints(registeredNodeRow(NODE_ID, G1), 9000);
    t.same(gateway.writes.map((w) => w.whereClause),
      [{node_id: NODE_ID, boot_incarnation: G1},
        {node_id: NODE_ID, boot_incarnation: G1}],
      'the reap predicate is the reaped incarnation');
    t.equal(snapshot(gateway), before, 'G2 endpoints are unchanged');
  });

test('a lost G1 endpoint-delete acknowledgement resolves by exact reread',
  async (t) => {
    const removeG1 = (gateway) => mutateEndpointAtIncarnation({
      bootIncarnation: G1,
      whereClause: {endpoint_id: META_ENDPOINT_ID},
      deletes: true,
      write: (whereClause) => gateway.deleteSystemTableRow(
        TABLES.SERVICE_ENDPOINTS, whereClause),
      observe: async () => ({available: true,
        row: gateway.rowsOf(TABLES.SERVICE_ENDPOINTS).get(META_ENDPOINT_ID) ||
          null}),
    });

    const durableG1 = createDurableTables(
      {[TABLES.SERVICE_ENDPOINTS]: [metaEndpoint(G1)]});
    durableG1.loseNextAcknowledgement('lost');
    t.equal((await removeG1(durableG1)).outcome, OUTCOME.ALREADY_ABSENT,
      'applied then ack lost: G1 gone -> done');

    const unknownG1 = createDurableTables(
      {[TABLES.SERVICE_ENDPOINTS]: [metaEndpoint(G1)]});
    unknownG1.loseNextAcknowledgement('unapplied');
    t.equal((await removeG1(unknownG1)).outcome, OUTCOME.NOT_APPLIED,
      'not applied: the G1 row is still present, no success invented');

    const recreated = createDurableTables(
      {[TABLES.SERVICE_ENDPOINTS]: [metaEndpoint(G2)]});
    const before = snapshot(recreated);
    t.equal((await removeG1(recreated)).outcome,
      OUTCOME.REFUSED_STALE_INCARNATION,
      'G2 present: stale, never retried against G2');
    t.equal(snapshot(recreated), before, 'the G2 endpoint survives');
  });

test('a stale G1 endpoint row cannot route when NODES says G2', async (t) => {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.NODES, 'INSERT',
    registeredNodeRow(NODE_ID, G2));
  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT',
    nodeEndpoint(G1, 'ws://g1-host:8082'));
  t.equal(resolveNodeWebSocketAddressResult({targetNodeId: NODE_ID,
    systemTableCache: cache}).state, 'unavailable',
  'address resolution does not resolve the G1 address for G2');

  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'UPDATE',
    nodeEndpoint(G2, 'ws://g2-host:8082', {updated_at: 2}));
  t.equal(resolveNodeWebSocketAddressResult({targetNodeId: NODE_ID,
    systemTableCache: cache}).address, 'ws://g2-host:8082',
  'address resolution resolves the G2 address');
});

test('endpoint writes never replace a newer incarnation and advance from an ' +
  'older one by exact CAS', async (t) => {
  const write = (gateway, incarnation, address, observedRow) =>
    writeEndpointAtIncarnation({
      row: nodeEndpoint(incarnation, address),
      bootIncarnation: incarnation,
      observe: async () => ({available: true, row: observedRow}),
      readback: async () => ({available: true,
        row: gateway.rowsOf(TABLES.NODE_ENDPOINTS).get(ENDPOINT_ID) || null}),
      insert: (row) => gateway.insertSystemTableRow(TABLES.NODE_ENDPOINTS,
        row),
      update: (whereClause, data) => gateway.updateSystemTableRow(
        TABLES.NODE_ENDPOINTS, whereClause, data),
    });

  const g2Owned = replacedByG2();
  const before = snapshot(g2Owned);
  t.equal((await write(g2Owned, G1, 'ws://g1-host:8082',
    nodeEndpoint(G1, 'ws://g1-host:8082'))).outcome,
  OUTCOME.REFUSED_STALE_INCARNATION,
  'a delayed G1 refresh (stale observation) is refused');
  t.equal((await write(g2Owned, G1, 'ws://g1-host:8082', null)).outcome,
    OUTCOME.REFUSED_STALE_INCARNATION,
    'a delayed G1 birth (row observed absent) cannot replace G2');
  t.equal(snapshot(g2Owned), before, 'G2 endpoint state is unchanged');

  const g1Owned = createDurableTables({[TABLES.NODE_ENDPOINTS]: [
    nodeEndpoint(G1, 'ws://g1-host:8082')]});
  t.equal((await write(g1Owned, G2, 'ws://g2-host:8082', null)).outcome,
    OUTCOME.APPLIED,
    'G2 advances over the older G1 row even from a stale-absent observation');
  t.match(g1Owned.rowsOf(TABLES.NODE_ENDPOINTS).get(ENDPOINT_ID),
    {boot_incarnation: G2, address: 'ws://g2-host:8082'});
  t.same(g1Owned.writes.find((w) => w.op === 'update')?.whereClause,
    {endpoint_id: ENDPOINT_ID, boot_incarnation: G1},
    'the advance is one CAS on the observed older incarnation');
});

test('T6: writeEndpointAtIncarnation preserves caller metadata "{}" without ' +
  'injecting storageIncarnation on birth or CAS advance', async (t) => {
  const gateway = createDurableTables();
  const birth = await writeEndpointAtIncarnation({
    row: {...nodeEndpoint(G1, 'ws://g1-host:8082'), metadata: '{}'},
    bootIncarnation: G1,
    observe: async () => ({available: true, row: null}),
    insert: (row) => gateway.insertSystemTableRow(TABLES.NODE_ENDPOINTS, row),
    update: (whereClause, data) => gateway.updateSystemTableRow(
      TABLES.NODE_ENDPOINTS, whereClause, data),
  });
  t.equal(birth.outcome, OUTCOME.APPLIED);
  t.equal(
    gateway.rowsOf(TABLES.NODE_ENDPOINTS).get(ENDPOINT_ID)?.metadata,
    '{}',
    'birth writes caller metadata verbatim without storageIncarnation',
  );

  const advance = await writeEndpointAtIncarnation({
    row: {...nodeEndpoint(G2, 'ws://g2-host:8082'), metadata: '{}'},
    bootIncarnation: G2,
    observe: async () => ({
      available: true,
      row: gateway.rowsOf(TABLES.NODE_ENDPOINTS).get(ENDPOINT_ID),
    }),
    insert: (row) => gateway.insertSystemTableRow(TABLES.NODE_ENDPOINTS, row),
    update: (whereClause, data) => gateway.updateSystemTableRow(
      TABLES.NODE_ENDPOINTS, whereClause, data),
  });
  t.equal(advance.outcome, OUTCOME.APPLIED);
  t.equal(
    gateway.rowsOf(TABLES.NODE_ENDPOINTS).get(ENDPOINT_ID)?.metadata,
    '{}',
    'CAS advance writes caller metadata verbatim without storageIncarnation',
  );
});

test('failed exact endpoint deletion retains its incarnation’s pending named write', async (t) => {
  const row = nodeEndpoint(G1, 'ws://g1-host:8082');
  const gateway = createDurableTables({[TABLES.NODE_ENDPOINTS]: [row]});
  const route = {id: 'endpoint-sql', partitionId: 'node_endpoints-p1'};
  const keys = [];
  const read = async () => ({available: true,
    row: gateway.rowsOf(TABLES.NODE_ENDPOINTS).get(ENDPOINT_ID) || null});
  const endpointWrite = () => writeEndpointAtIncarnation({
    bootIncarnation: G1, row: {...row, address: 'ws://g1-host:8888'}, observe: read,
    readback: async () => ({available: false, row: null}),
    insert: () => {
      throw new Error('the populated endpoint takes the incarnation update path');
    },
    update: (whereClause, data, opts) => runControlPlaneWrite(opts, {whereClause, data}, route,
      async (_body, key) => {
        keys.push(key);
        return {success: false, partitionId: route.partitionId,
          entryId: deriveParticipantEntryId(key, route.partitionId),
          failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN};
      }),
  });
  const remove = () => mutateEndpointAtIncarnation({
    bootIncarnation: G1, whereClause: {endpoint_id: ENDPOINT_ID}, deletes: true,
    write: (predicate) => gateway.deleteSystemTableRow(TABLES.NODE_ENDPOINTS, predicate),
    observe: read,
  });
  try {
    await endpointWrite();
    gateway.loseNextAcknowledgement('unapplied');
    t.equal((await remove()).outcome, OUTCOME.NOT_APPLIED);
    t.same((await read()).row, row);
    await endpointWrite();
    t.equal(keys[1], keys[0], 'the unsuccessful delete cannot release the pending update');
    t.equal((await remove()).outcome, OUTCOME.APPLIED);
    t.equal((await read()).row, null);
    t.same(gateway.writes.at(-1)?.whereClause,
      {endpoint_id: ENDPOINT_ID, boot_incarnation: G1});
  } finally {
    releaseControlPlaneWriteIdentities('endpoint', ENDPOINT_ID, G1);
  }
});
