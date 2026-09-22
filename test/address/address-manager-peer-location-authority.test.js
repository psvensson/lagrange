// The process-global AddressManager registry is not a peer-location authority.
//
// AddressManager is a singleton holding two mutable sets of generated
// addresses, and a node's peer resolution calls it on the way to deciding
// where to send. That shape alone is not a defect, and a singleton is not
// evidence of one. The question is narrower and adversarial: can the
// process-global registry CHANGE a node-local peer-location decision when its
// state disagrees with the runtime's authoritative cache?
//
// So each witness here deliberately constructs conflicting authorities - the
// cache says the peer is at A, the registry is poisoned toward B - drives the
// real production resolution, and takes its verdict from the destination a
// real write actually reached, never from a returned string. The registry is
// poisoned again immediately before the write, because resolution happens
// twice: once when the peer is joined and once at send time.
import {test} from '../../src/test-helpers/tap.js';
import {readdirSync, readFileSync} from 'node:fs';

import {AddressManager} from '../../src/address/address-manager.js';
import {
  CDC_OPERATIONS, SystemTableCache,
} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {ENTITY_TYPE, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  MessageGroupService,
} from '../../src/message-group/message-group-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  PartitionService, RaftRole,
} from '../../src/partition/partition-service.js';
import {
  RemotePeerRepresentation,
} from '../../src/raft/remote-peer-representation.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

const ZERO = 0;
const ONE = 1;
const NODE_ID = 'node-a';
const POISON_NODE = 'node-evil';
const PARTITION_ID = 'services-p1';
const PARTITION_SELF = `${PARTITION_ID}-r1`;
const PARTITION_PEER = `${PARTITION_ID}-r2`;
const PARTITION_A = `${NODE_ID}/${ENTITY_TYPE.PARTITION}/${PARTITION_PEER}`;
const PARTITION_B = `${POISON_NODE}/${ENTITY_TYPE.PARTITION}/${PARTITION_PEER}`;
const GROUP_ID = 'mg-1';
const GROUP_SELF = 'mg-1-r0';
const GROUP_PEER = 'mg-1-r1';
const GROUP_A = `${NODE_ID}/${ENTITY_TYPE.MESSAGE_GROUP}/${GROUP_PEER}`;
const GROUP_B = `${POISON_NODE}/${ENTITY_TYPE.MESSAGE_GROUP}/${GROUP_PEER}`;
const ADDRESS_MANAGER_SOURCE = new URL(
  '../../src/address/address-manager.js', import.meta.url);
const SRC_ROOT = new URL('../../src/', import.meta.url);
// Reading the registry's own state can only be a peer-location authority if
// something reads it. These are every way to do so.
const REGISTRY_READ_API = Object.freeze([
  'hasNodeAddressConflict',
  'hasServiceAddressConflict',
  'hasAddressConflict',
  'getAllNodeAddresses',
  'getAllServiceAddresses',
  'getNodeAddressCount',
  'getServiceAddressCount',
]);

let nextPort = 19980;

function initializeProcess() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  AddressManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID}, logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

// Conflicting process-global evidence: everything the registry can hold points
// at B, and nothing in it mentions A.
function poisonTowardB(address) {
  const manager = AddressManager.getInstance();
  manager.clear();
  manager.nodeAddresses.add(POISON_NODE);
  manager.serviceAddresses.add(address);
  return manager;
}

function serviceRow(id, address, serviceType) {
  return {
    service_id: id,
    partition_id: id.split('-r')[ZERO],
    service_type: serviceType,
    node_id: address.split('/')[ZERO],
    address,
    status: ReplicaStatus.ACTIVE,
    raft_role: RaftRole.FOLLOWER,
    updated_at: ONE,
  };
}

function cacheSaying(rows) {
  const cache = new SystemTableCache();
  for (const row of rows) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.INSERT, row);
  }
  return cache;
}

function recordingTransport(sent) {
  return {
    register() {},
    unregister() {},
    async deliver(address) {
      sent.push(address);
      return {ok: true};
    },
  };
}

function buildPartition({cache, peerAddresses, sent}) {
  const partition = new PartitionService({
    partitionId: PARTITION_ID,
    tableId: 'services',
    tableName: 'services',
    replicaId: PARTITION_SELF,
    replicaIds: [PARTITION_SELF, PARTITION_PEER],
    nodeId: NODE_ID,
    peerAddresses,
    transport: recordingTransport(sent),
    dbPath: ':memory:',
  });
  partition.systemTableCache = cache;
  return partition;
}

function authoritativePartitionCache() {
  return cacheSaying([
    serviceRow(PARTITION_SELF,
      `${NODE_ID}/${ENTITY_TYPE.PARTITION}/${PARTITION_SELF}`,
      SERVICE_TYPE.PARTITION),
    serviceRow(PARTITION_PEER, PARTITION_A, SERVICE_TYPE.PARTITION),
  ]);
}

function seedPartitionProgressProbe(partition) {
  const status = partition.raft.readStatus();
  const term = Number.isSafeInteger(status.term) && status.term > 0 ?
    status.term : ONE;
  partition.logAdapter.saveCommand(
    {type: 'address-authority-progress-probe'},
    term,
  );
}

async function probePartitionPeerDestination(partition, peerAddress, sent) {
  const at = sent.length;
  await partition.raft.probePeerProgress(peerAddress);
  return sent.slice(at);
}

test('a poisoned process registry cannot move a partition peer destination',
  async (t) => {
    initializeProcess();
    const sent = [];
    const partition = buildPartition({
      cache: authoritativePartitionCache(),
      peerAddresses: [PARTITION_A],
      sent,
    });

    poisonTowardB(PARTITION_B);
    t.equal(partition.buildPeerAddress(PARTITION_PEER), PARTITION_A,
      'the authoritative cache decides, not the registry');
    t.equal(partition.buildPeerAddress(PARTITION_A), PARTITION_A,
      'an already-unified address is returned as given');

    // The partition boundary is operation-only after the rs-raft migration.
    // Observe the frozen peer projection, then drive the semantic progress
    // probe which sends one real Raft packet without exposing a peer object.
    await partition.initialize();
    seedPartitionProgressProbe(partition);
    poisonTowardB(PARTITION_B);
    const status = await partition.raft.readStatus();
    t.equal(status.peers.length, ONE,
      'the operation-port snapshot exposes exactly the one remote peer');
    t.equal(status.peers[ZERO].address, PARTITION_A,
      'the peer projection carries the authoritative address');

    t.same(
      await probePartitionPeerDestination(partition, PARTITION_A, sent),
      [PARTITION_A],
      'and the operation-port progress probe actually sent there',
    );

    t.same([...AddressManager.getInstance().serviceAddresses], [PARTITION_B],
      'resolution neither consulted nor mutated the registry');
    await partition.shutdown();
  });

test('with no authoritative location a partition refuses rather than using the registry',
  async (t) => {
    initializeProcess();
    const partition = buildPartition({cache: new SystemTableCache(), sent: []});
    poisonTowardB(PARTITION_B);
    t.throws(() => partition.buildPeerAddress(PARTITION_PEER),
      /Unable to resolve unified peer address/u,
      'registry membership is never promoted into discovery authority');
    await partition.shutdown();
  });

test('one node mutating the shared registry cannot move another node destination',
  async (t) => {
    initializeProcess();
    const shared = AddressManager.getInstance();
    const sent = [];
    const hosts = [];
    for (const [nodeId, selfId, peerId] of [
      ['node-a', `${PARTITION_ID}-r1`, `${PARTITION_ID}-r2`],
      ['node-b', `${PARTITION_ID}-r3`, `${PARTITION_ID}-r4`],
    ]) {
      const peerAddress = `${nodeId}/${ENTITY_TYPE.PARTITION}/${peerId}`;
      const partition = new PartitionService({
        partitionId: PARTITION_ID,
        tableId: 'services',
        tableName: 'services',
        replicaId: selfId,
        replicaIds: [selfId, peerId],
        nodeId,
        peerAddresses: [peerAddress],
        transport: recordingTransport(sent),
        dbPath: ':memory:',
      });
      partition.systemTableCache = cacheSaying([
        serviceRow(selfId, `${nodeId}/${ENTITY_TYPE.PARTITION}/${selfId}`,
          SERVICE_TYPE.PARTITION),
        serviceRow(peerId, peerAddress, SERVICE_TYPE.PARTITION),
      ]);
      await partition.initialize();
      seedPartitionProgressProbe(partition);
      hosts.push({partition, peerAddress});
    }

    const write = (host) => probePartitionPeerDestination(
      host.partition,
      host.peerAddress,
      sent,
    );

    const beforeA = await write(hosts[ZERO]);
    const beforeB = await write(hosts[ONE]);

    // Mutate the shared registry under both of them. No reset, no
    // re-initialization, one singleton throughout.
    t.equal(AddressManager.getInstance(), shared,
      'both runtimes are still on the same process registry');
    shared.clear();
    shared.nodeAddresses.add('node-a');
    shared.serviceAddresses.add(`node-a/${ENTITY_TYPE.PARTITION}/${PARTITION_ID}-r4`);
    shared.unregisterServiceAddress(hosts[ONE].peerAddress);

    t.same(await write(hosts[ZERO]), beforeA,
      'node-a still sends where its own authoritative state says');
    t.same(await write(hosts[ONE]), beforeB,
      'and node-b is untouched by a mutation made under node-a');
    for (const host of hosts) await host.partition.shutdown();
  });

test('a poisoned process registry cannot move a message-group peer destination',
  async (t) => {
    initializeProcess();
    const sent = [];
    const realDeliver = MessageRouter.prototype.deliver;
    // Observation only: the destination is recorded and the real path is left
    // in place, including the transport-shape check the service performs.
    MessageRouter.prototype.deliver = function(address) {
      sent.push(address);
      return Promise.resolve({ok: true});
    };
    t.teardown(() => {
      MessageRouter.prototype.deliver = realDeliver;
    });

    const router = new MessageRouter({nodeId: NODE_ID, wsPort: nextPort++});
    await router.initialize({startServer: false});
    const group = new MessageGroupService({
      groupId: GROUP_ID,
      replicaId: GROUP_SELF,
      nodeId: NODE_ID,
      replicaIds: [GROUP_SELF, GROUP_PEER],
      peerAddresses: [GROUP_A],
      transport: router,
      deferElection: true,
    });
    group.systemTableCache = cacheSaying([
      serviceRow(GROUP_SELF,
        `${NODE_ID}/${ENTITY_TYPE.MESSAGE_GROUP}/${GROUP_SELF}`,
        SERVICE_TYPE.MESSAGE_GROUP),
      serviceRow(GROUP_PEER, GROUP_A, SERVICE_TYPE.MESSAGE_GROUP),
    ]);

    poisonTowardB(GROUP_B);
    t.equal(group.buildPeerAddress(GROUP_PEER), GROUP_A,
      'the authoritative cache decides, not the registry');
    t.equal(group.buildPeerAddress(GROUP_A), GROUP_A,
      'an already-unified address is returned as given');

    await group.initialize();
    poisonTowardB(GROUP_B);
    const peer = group.raft.nodes[ZERO];
    t.ok(peer instanceof RemotePeerRepresentation,
      'the peer slot holds a representation here too');
    const before = sent.length;
    await new Promise((resolve) => {
      peer.write({type: 'append', address: group.unifiedAddress}, resolve);
    });
    t.same(sent.slice(before), [GROUP_A],
      'and the packet the production write actually sent went there');
    await group.shutdown();
    await router.shutdown();
  });

test('with no authoritative location a message group refuses rather than using the registry',
  async (t) => {
    initializeProcess();
    const router = new MessageRouter({nodeId: NODE_ID, wsPort: nextPort++});
    await router.initialize({startServer: false});
    const group = new MessageGroupService({
      groupId: GROUP_ID,
      replicaId: GROUP_SELF,
      nodeId: NODE_ID,
      replicaIds: [GROUP_SELF, GROUP_PEER],
      transport: router,
      deferElection: true,
    });
    poisonTowardB(GROUP_B);
    t.throws(() => group.buildPeerAddress(GROUP_PEER),
      /Unable to resolve unified peer address/u,
      'registry membership is never promoted into discovery authority');
    await router.shutdown();
  });

// The witnesses above are one run of one composition. This one is the standing
// claim: nothing in production reads the registry's state at all, so a future
// caller cannot quietly make it an authority without turning this red.
test('no production code outside AddressManager reads the registry state',
  (t) => {
    const readers = [];
    const walk = (directory) => {
      for (const entry of readdirSync(directory, {withFileTypes: true})) {
        const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`,
          directory);
        if (entry.isDirectory()) {
          walk(child);
          continue;
        }
        if (!entry.name.endsWith('.js')) continue;
        if (child.href === ADDRESS_MANAGER_SOURCE.href) continue;
        const source = readFileSync(child, 'utf8');
        for (const api of REGISTRY_READ_API) {
          if (source.includes(api)) readers.push(`${entry.name}: ${api}`);
        }
      }
    };
    walk(SRC_ROOT);
    t.same(readers, [],
      'the conflict and enumeration APIs have no production consumer, so no ' +
        'production decision can read what the registry happens to hold');
    t.end();
  });
