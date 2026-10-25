// Test-owned transport schedule around real MessageGroupService replicas.
// Membership, roles, readiness, proposal results and application are native.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {MessageRouter} from '../../src/transport/message-router.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {isRaftRsTransportEnvelope} from '../../src/raft/raft-packet-utils.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../src/raft/raft-rs-ingress-constants.js';
import {registerMessageGroupTransportHandler} from
  '../../src/bootstrap/shared/message-group-transport-handler.js';
import {COLUMN, TABLES, SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'mg-custody-native-node';
const GROUP_ID = 'mg-custody-native';
const REPLICAS = ['mg-custody-native-r1', 'mg-custody-native-r2',
  'mg-custody-native-r3'];
const SETUP_ROUNDS = 200;
const DELIVERY_ROUNDS = 64;
const MICROTASKS = 16;

function view(f) {
  return f.services.map((service) => ({replicaId: service.replicaId,
    record: RaftRsDurableStore.readDurableRecordIn(service.db, GROUP_ID),
    row: service.systemTableCache.get(TABLES.CONFIG, f.key) ?? null}));
}

function emit(f, kind, detail = {}) {
  f.events.push({ordinal: f.events.length + 1, phase: f.phase, kind, ...detail});
}

// The schedule holds an envelope when it crosses the isolated leader, or when
// it is the leader's entry-carrying APPEND while entries are held.
function scheduleHolds(f, item) {
  const from = item.envelope.message.from;
  const leader = f.services[0];
  const cutsLeader = f.isolateLeader &&
    (item.address === leader.unifiedAddress || from === f.leaderPeer);
  const carriesEntry = f.holdEntries && from === f.leaderPeer &&
    item.envelope.message.msgType === RAFT_RS_MESSAGE_TYPE.APPEND &&
    item.envelope.message.entries?.some((entry) => entry.data);
  return Boolean(cutsLeader || carriesEntry);
}

async function pump(f) {
  for (let round = 0; round < DELIVERY_ROUNDS; round += 1) {
    for (const item of f.queue.splice(0)) {
      if (scheduleHolds(f, item)) {
        f.held.push(item);
        emit(f, 'transport-held-native-envelope', item);
      } else {
        emit(f, 'transport-delivered-native-envelope', item);
        await Reflect.apply(f.deliver, f.router,
          [item.address, item.envelope, ...item.options]);
      }
    }
    for (const clock of f.clocks) clock.advance(0);
    for (let step = 0; step < MICROTASKS; step += 1) await Promise.resolve();
  }
}

async function recipientFixture(t, key, {replicaCount = REPLICAS.length} = {}) {
  assert.ok(replicaCount === 1 || replicaCount === REPLICAS.length);
  const replicas = REPLICAS.slice(0, replicaCount);
  const f = {key, phase: 'setup', services: [], clocks: [], queue: [], held: [],
    events: [], holdEntries: false, isolateLeader: false, leaderPeer: null,
    directory: fs.mkdtempSync(path.join(os.tmpdir(), 'mg-native-custody-'))};
  f.router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID, wsPort: 0});
  t.after(async () => {
    const results = await Promise.allSettled([
      ...f.services.map((service) => service.shutdown()),
    ]);
    results.push(...await Promise.allSettled([f.router.shutdown()]));
    const failures = results.filter((result) => result.status === 'rejected')
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures,
        `recipient cleanup failed; retained ${f.directory}`);
    }
    fs.rmSync(f.directory, {recursive: true, force: true});
  });
  await f.router.initialize({startServer: false});
  f.deliver = f.router.deliver;
  f.router.deliver = function(address, envelope, ...options) {
    if (!isRaftRsTransportEnvelope(envelope)) {
      return Reflect.apply(f.deliver, this, [address, envelope, ...options]);
    }
    const item = {address, envelope: structuredClone(envelope), options};
    f.queue.push(item);
    emit(f, 'transport-native-custody', item);
    return Promise.resolve(buildDeliveryEnvelope({acknowledged: true}));
  };
  const addresses = replicas.map((id) => `${NODE_ID}/message-group/${id}`);
  for (const replicaId of replicas) {
    const cache = new SystemTableCache();
    for (const id of replicas) {
      cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
        [COLUMN.SERVICE_ID]: id, [COLUMN.NODE_ID]: NODE_ID,
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      });
    }
    const timeSource = new VirtualTimeSource({startMs: 1000});
    f.clocks.push(timeSource);
    const service = new MessageGroupService({groupId: GROUP_ID, replicaId,
      replicaIds: replicas, peerAddresses: addresses, nodeId: NODE_ID,
      transport: f.router, dbPath: path.join(f.directory, `${replicaId}.sqlite`),
      timeSource, nodeService: {getSystemTableCache: () => cache,
        getReadOnlySystemTableCache: () => cache}});
    f.services.push(service);
    registerMessageGroupTransportHandler(service, {messageRouter: f.router,
      address: service.unifiedAddress});
    await service.initialize();
    await service.subscribeToCDC(TABLES.CONFIG);
  }
  for (let round = 0; round < SETUP_ROUNDS; round += 1) {
    await f.services[0].raft.tick();
    await pump(f);
    const statuses = f.services.map((service) => service.raft.readStatus());
    if (statuses[0].role === 'leader' && statuses.every((status) =>
      status.leaderId === replicas[0] && status.appliedIndex > 0)) {
      f.leaderPeer = statuses[0].peerId;
      await pump(f);
      assert.equal(f.queue.length, 0);
      assert.equal(f.services[0].getMetadataIngressReadiness(
        {requiredTables: [TABLES.CONFIG]}).ready, true);
      f.phase = 'measured';
      f.events.length = 0;
      return f;
    }
  }
  assert.fail(`setup seam: real message-group RF${replicaCount} formation did not complete`);
}

export {GROUP_ID, NODE_ID, emit, pump, recipientFixture, view};
