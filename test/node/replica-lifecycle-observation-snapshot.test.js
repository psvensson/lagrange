/**
 * The real gateway owns request coalescing; its CDC read dependency supplies
 * ordinary scalar SQL rows. These controls cover ownership after each read
 * completes, not a consistent cut across tables or lifecycle mutation authority.
 */
import {test} from '../../src/test-helpers/tap.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  observeAuthoritativeReplicaLifecycle,
  readAuthoritativePartitionLeader,
  readAuthoritativeReplicaLifecycle,
} from '../../src/node/replica-state-machine-lifecycle-observation.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

const ORIGINAL_SERVICE = Object.freeze({
  service_id: 'observation-service',
  replica_id: 'observation-replica',
  group_id: 'observation-group',
  partition_id: 'observation-partition',
  node_id: 'observation-node',
  service_type: SERVICE_TYPE.PARTITION,
  status: ReplicaStatus.ACTIVE,
  address: 'ws://observation-node:7001',
  previous_state: ReplicaStatus.SYNCING,
  trigger_reason: 'original-activation',
  error_message: null,
  cleanup_token: null,
  create_attempt_token: 'original-create-attempt',
  created_at: 101,
  state_entered_at: 103,
  updated_at: 107,
});
const ORIGINAL_PARTITION = Object.freeze({
  partition_id: ORIGINAL_SERVICE.partition_id,
  leader_node_id: ORIGINAL_SERVICE.node_id,
  updated_at: 109,
});

function createObservationOwner(read) {
  const calls = [];
  const alternateReads = {cache: 0, sql: 0};
  const readCache = () => {
    alternateReads.cache += 1;
    return [];
  };
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: ORIGINAL_SERVICE.node_id,
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
        calls.push({tableName, sql, params: [...params], options});
        return read(tableName);
      },
    },
    systemTableCache: {getAll: readCache, filter: readCache},
    sqlQueryEngine: {
      async executeQuery() {
        alternateReads.sql += 1;
        return {success: true, rows: []};
      },
    },
  });
  return {
    gateway,
    reader: {getControlPlaneSystemTableGateway: () => gateway},
    calls,
    alternateReads,
  };
}

function assertOwnerCalls(t, owner, expected) {
  t.strictSame(owner.calls.map((call) => ({
    tableName: call.tableName,
    params: call.params,
    mode: call.options.readAuthority.authoritativeReadMode,
    leaderMode: call.options.readAuthority.leaderMode,
  })), expected.map(([tableName, key]) => ({
    tableName,
    params: [key],
    mode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  })), 'only the declared canonical owner reads execute');
  t.strictSame(owner.alternateReads, {cache: 0, sql: 0},
    'no cache or SQL alternative supplies an observation');
  t.equal(owner.gateway.activeOwnerWorkCount(), 0,
    'all accepted gateway reads have completed');
}

test('coalesced lifecycle observations retain their captured facts across a later read', async (t) => {
  const serviceRow = {...ORIGINAL_SERVICE};
  const partitionRow = {...ORIGINAL_PARTITION};
  const serviceEntered = Promise.withResolvers();
  const serviceRelease = Promise.withResolvers();
  const partitionEntered = Promise.withResolvers();
  const partitionRelease = Promise.withResolvers();
  const owner = createObservationOwner(async (tableName) => {
    if (tableName === TABLES.SERVICES) {
      serviceEntered.resolve();
      await serviceRelease.promise;
      return {success: true, rows: [serviceRow]};
    }
    partitionEntered.resolve();
    await partitionRelease.promise;
    return {success: true, rows: [partitionRow]};
  });
  const firstRead = observeAuthoritativeReplicaLifecycle(
    owner.reader, ORIGINAL_SERVICE.service_id);
  const peerRead = observeAuthoritativeReplicaLifecycle(
    owner.reader, ORIGINAL_SERVICE.service_id);
  await serviceEntered.promise;
  serviceRelease.resolve();
  const [first, peer] = await Promise.all([firstRead, peerRead]);
  const laterRead = readAuthoritativePartitionLeader(
    owner.reader, ORIGINAL_PARTITION.partition_id);
  await partitionEntered.promise;
  Object.assign(serviceRow, {
    service_id: 'later-service',
    status: ReplicaStatus.FAILED,
    create_attempt_token: 'later-create-attempt',
    state_entered_at: 211,
  });
  partitionRelease.resolve();
  const partition = await laterRead;

  t.equal(owner.gateway.gatewayMetrics.readSingleFlightJoinCount, 1,
    'both lifecycle observers shared one actual gateway execution');
  t.equal(first.available, true, 'the first observation is available');
  t.equal(peer.available, true, 'the coalesced observation is available');
  t.not(first.row, serviceRow, 'the first observation owns a distinct row');
  t.not(peer.row, first.row, 'coalesced observers own independent rows');
  t.strictSame(first.row, ORIGINAL_SERVICE,
    'the first source identity and generation survive the later await');
  t.strictSame(peer.row, ORIGINAL_SERVICE,
    'the coalesced observation retains the same original scalar facts');
  t.strictSame(partition, ORIGINAL_PARTITION, 'the later owner read remains useful');
  assertOwnerCalls(t, owner, [
    [TABLES.SERVICES, ORIGINAL_SERVICE.service_id],
    [TABLES.PARTITIONS, ORIGINAL_PARTITION.partition_id],
  ]);
});

test('consumer writes cannot alter a captured lifecycle observation or its owner', async (t) => {
  const row = {...ORIGINAL_SERVICE};
  const owner = createObservationOwner(async () => ({success: true, rows: [row]}));
  const observation = await observeAuthoritativeReplicaLifecycle(
    owner.reader, ORIGINAL_SERVICE.service_id);
  const statusWrite = Reflect.set(observation.row, 'status', ReplicaStatus.FAILED);
  const addressWrite = Reflect.defineProperty(observation.row, 'address', {
    value: 'ws://foreign-node:7001',
  });
  const attemptDelete = Reflect.deleteProperty(observation.row, 'create_attempt_token');

  t.equal(statusWrite, false, 'ordinary property writes are refused');
  t.equal(addressWrite, false, 'property replacement is refused');
  t.equal(attemptDelete, false, 'source identity deletion is refused');
  t.strictSame(observation.row, ORIGINAL_SERVICE, 'captured facts remain useful');
  t.strictSame(row, ORIGINAL_SERVICE, 'consumer writes cannot mutate the shared owner row');
  t.equal(Object.isFrozen(row), false, 'the read owner retains its original mutable row');
  assertOwnerCalls(t, owner, [[TABLES.SERVICES, ORIGINAL_SERVICE.service_id]]);
});

test('later accessor replacement on a borrowed row cannot redirect a lifecycle read', async (t) => {
  const row = {...ORIGINAL_SERVICE};
  const owner = createObservationOwner(async () => ({success: true, rows: [row]}));
  const captured = await readAuthoritativeReplicaLifecycle(
    owner.reader, ORIGINAL_SERVICE.service_id);
  let accessorCalls = 0;
  const replaced = Reflect.defineProperty(row, 'service_id', {
    configurable: true,
    enumerable: true,
    get() {
      accessorCalls += 1;
      return 'foreign-service';
    },
  });
  const retainedServiceId = captured.service_id;
  const retainedDescriptor = Object.getOwnPropertyDescriptor(captured, 'service_id');

  t.equal(replaced, true, 'the independently owned gateway row can still change');
  t.equal(retainedServiceId, ORIGINAL_SERVICE.service_id,
    'the row reader retains the value captured before replacement');
  t.equal(accessorCalls, 0, 'reading the snapshot never invokes the later accessor');
  t.equal(retainedDescriptor.value, ORIGINAL_SERVICE.service_id,
    'the observation retains its own original scalar property');
  assertOwnerCalls(t, owner, [[TABLES.SERVICES, ORIGINAL_SERVICE.service_id]]);
});

test('partition observations keep original facts while a fresh read sees owner changes', async (t) => {
  const row = {...ORIGINAL_PARTITION};
  const owner = createObservationOwner(async () => ({success: true, rows: [row]}));
  const original = await readAuthoritativePartitionLeader(
    owner.reader, ORIGINAL_PARTITION.partition_id);
  row.leader_node_id = 'later-leader';
  row.updated_at = 223;
  const fresh = await readAuthoritativePartitionLeader(
    owner.reader, ORIGINAL_PARTITION.partition_id);
  const consumerWrite = Reflect.set(fresh, 'leader_node_id', 'consumer-leader');

  t.not(original, row, 'the original partition observation owns its row');
  t.strictSame(original, ORIGINAL_PARTITION, 'later facts cannot rewrite the first observation');
  t.strictSame(fresh, {...ORIGINAL_PARTITION, leader_node_id: 'later-leader', updated_at: 223},
    'a new completed owner read captures new facts');
  t.equal(consumerWrite, false, 'the new partition observation is also immutable');
  t.equal(row.leader_node_id, 'later-leader', 'consumer writes do not retarget owner facts');
  assertOwnerCalls(t, owner, [
    [TABLES.PARTITIONS, ORIGINAL_PARTITION.partition_id],
    [TABLES.PARTITIONS, ORIGINAL_PARTITION.partition_id],
  ]);
});

test('lifecycle observations preserve absent, unavailable and ambiguous read outcomes', async (t) => {
  const results = [
    {success: true, rows: []},
    {success: false, rows: [{...ORIGINAL_SERVICE}], error: 'owner-unavailable'},
    {success: true, rows: [{...ORIGINAL_SERVICE}, {...ORIGINAL_SERVICE}]},
  ];
  const owner = createObservationOwner(async () => results.shift());
  const absent = await observeAuthoritativeReplicaLifecycle(
    owner.reader, ORIGINAL_SERVICE.service_id);
  const unavailable = await observeAuthoritativeReplicaLifecycle(
    owner.reader, ORIGINAL_SERVICE.service_id);
  const ambiguous = await observeAuthoritativeReplicaLifecycle(
    owner.reader, ORIGINAL_SERVICE.service_id);

  t.strictSame(absent, {available: true, row: null}, 'authoritative absence stays available');
  t.strictSame(unavailable, {available: false, row: null}, 'owner failure stays unavailable');
  t.strictSame(ambiguous, {available: false, row: null}, 'multiple rows remain unavailable');
  assertOwnerCalls(t, owner, [
    [TABLES.SERVICES, ORIGINAL_SERVICE.service_id],
    [TABLES.SERVICES, ORIGINAL_SERVICE.service_id],
    [TABLES.SERVICES, ORIGINAL_SERVICE.service_id],
  ]);
});
