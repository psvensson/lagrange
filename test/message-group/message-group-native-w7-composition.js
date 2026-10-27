// Multi-router, multi-target native CDC composition for W1, W2, W7 and W9.
// Reuses the single-target provisional-route helpers without duplicating code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {MessageGroupServiceRowOwner} from '../../src/message-group/message-group-service-row-owner.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {RealTimeSource, VirtualTimeSource} from '../../src/time/time-source.js';
import {readRaftRsPeerIdentityReservations} from '../../src/raft/raft-rs-peer-identity.js';
import {isRaftRsTransportEnvelope} from '../../src/raft/raft-packet-utils.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {registerMessageGroupTransportHandler, retireMessageGroupTransportHandler} from
  '../../src/bootstrap/shared/message-group-transport-handler.js';
import {REPLICA_HANDLER_RETIREMENT_OUTCOME} from
  '../../src/node/replica-transport-handler-identity.js';
import {CDC_OPERATION, TABLES, SERVICE_STATUS} from '../../src/constants/index.js';
import {SERVICES_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';
import {cdcSqlBuilder} from '../../src/cdc/cdc-sql-builder.js';
import {PARTICIPANT_CUTOVER_OUTCOME} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {attachPartitionReleaseOwners} from '../partition/partition-release-fixture.js';
import {recordOf, json, payloadOf, cdcEvents} from
  './message-group-native-provisional-route-fixture.js';

const NODE_A = 'mg-w7-source-node';
const NODE_B = 'mg-w7-target-node';
const SOURCE_GROUP = 'mg-w7-source';
const SOURCE_REPLICA = `${SOURCE_GROUP}-r1`;
const TARGET_GROUPS = Object.freeze([
  'mg-w7-target-1',
  'mg-w7-target-2',
  'mg-w7-target-3',
]);
const PARTITION_ID = 'services-w7-source';
const SOURCE_MEMBERS = [1, 2, 3].map((id) => [`${PARTITION_ID}-r${id}`, NODE_A]);
const BUDGET_MS = 10000;
const SETUP_ROUNDS = 200;
const MICROTASKS = 16;

function nodeAddressOf(nodeId, replicaId) {
  return `${nodeId}/message-group/${replicaId}`;
}

function targetReplicasOf(groupId) {
  return ['l', 'h1', 'h2', 'f1', 'f2'].map((suffix) => `${groupId}-${suffix}`);
}

function activeNodeRow(nodeId, wsPort, latencyGroupId) {
  return {
    node_id: nodeId,
    address: `ws://127.0.0.1:${wsPort}`,
    status: SERVICE_STATUS.ACTIVE,
    boot_incarnation: 1,
    latency_group_id: latencyGroupId,
    created_at: 1,
    updated_at: 1,
  };
}

function activeServiceRow(groupId, replicaId, nodeId, role = RAFT_ROLE.FOLLOWER) {
  return {
    ...MessageGroupServiceRowOwner.buildServiceRow({
      groupId,
      replicaId,
      nodeId,
      timestamp: 1,
      status: SERVICE_STATUS.ACTIVE,
    }),
    raft_role: role,
  };
}

function registrationInsertForNode(service, entryId, nodeId = service.nodeId) {
  const row = MessageGroupServiceRowOwner.buildRegistrationRow({
    groupId: service.groupId,
    replicaId: service.replicaId,
    nodeId,
    service,
    timestamp: 2,
    status: SERVICE_STATUS.STOPPED,
  });
  const parts = cdcSqlBuilder.buildInsertParts(row);
  return {
    entryId,
    row,
    sql: `INSERT INTO services (${parts.columns}) VALUES (${parts.placeholders})`,
    params: parts.values,
  };
}

function createControllableRealClock() {
  const realClock = new RealTimeSource();
  let offsetMs = 0;
  let holdTimers = false;
  const heldTimers = [];
  return {
    now: () => realClock.now() + offsetMs,
    setTimeout: (callback, delayMs, ...args) => {
      if (holdTimers) {
        const entry = {callback, args, delayMs, cleared: false};
        heldTimers.push(entry);
        return entry;
      }
      return realClock.setTimeout(callback, delayMs, ...args);
    },
    clearTimeout: (handle) => {
      if (handle && typeof handle === 'object' && 'cleared' in handle) {
        handle.cleared = true;
        return;
      }
      realClock.clearTimeout(handle);
    },
    setInterval: (callback, delayMs, ...args) =>
      realClock.setInterval(callback, delayMs, ...args),
    clearInterval: (handle) => realClock.clearInterval(handle),
    elapseWithoutCallbacks: (ms) => {
      offsetMs += ms;
    },
    setHoldTimers: (hold) => {
      holdTimers = hold;
    },
    heldTimers: () => heldTimers,
    flushHeldTimers: (minDelayMs = 1000) => {
      for (const entry of heldTimers.splice(0)) {
        if (!entry.cleared && entry.delayMs >= minDelayMs) {
          entry.callback(...entry.args);
        }
      }
    },
  };
}

async function connectTwoRouters(portA = 24371, portB = 24372) {
  const routerA = new MessageRouter({
    nodeId: NODE_A,
    bootIncarnation: 1,
    inProcess: true,
    wsPort: portA,
    nodeAddress: `ws://127.0.0.1:${portA}`,
    outboundQueueMaxConcurrent: 2,
  });
  const routerB = new MessageRouter({
    nodeId: NODE_B,
    bootIncarnation: 1,
    inProcess: true,
    wsPort: portB,
    nodeAddress: `ws://127.0.0.1:${portB}`,
  });
  await routerA.initialize({startServer: true});
  await routerB.initialize({startServer: true});
  await routerA.connectToNode(NODE_B, `ws://127.0.0.1:${portB}`);
  for (
    let turn = 0;
    turn < 30 &&
    routerA.getCurrentPrimaryConnectionBootIncarnation(NODE_B)?.bootIncarnation !== 1;
    turn += 1
  ) {
    await yieldTurn();
  }
  assert.equal(
    routerA.getCurrentPrimaryConnectionBootIncarnation(NODE_B)?.bootIncarnation,
    1,
    'outbound routerA identified remote routerB',
  );
  assert.equal(
    routerB.getCurrentPrimaryConnectionBootIncarnation(NODE_A)?.bootIncarnation,
    1,
    'inbound routerB identified source routerA',
  );
  return {routerA, routerB, portA, portB};
}

async function pumpMulti(f, rounds = 16) {
  for (let round = 0; round < rounds; round += 1) {
    for (const item of f.native.splice(0)) {
      const cutPeer = f.cutPeers.get(item.envelope.groupId) ?? null;
      const cut =
        cutPeer !== null &&
        (item.envelope.from === cutPeer || item.envelope.to === cutPeer);
      if (cut) {
        if (f.heldNative.length < 32) f.heldNative.push(item);
      } else {
        await Reflect.apply(item.deliver, item.router, [
          item.address,
          item.envelope,
          ...item.options,
        ]);
      }
    }
    for (const service of f.services.values()) {
      service.providedTimeSource.advance(0);
    }
    for (let step = 0; step < MICROTASKS; step += 1) await Promise.resolve();
    await yieldTurn();
  }
}

async function driveWithPump(f, startPromiseFn, maxRounds = 400) {
  let settled = false;
  let outcome = null;
  const clearRetryTimer = () => {
    const lane = f.producerLeader?.cdcDelivery?.obligationLane;
    if (lane?.retryTimer?.handle) {
      f.producerLeader.timeSource.clearTimeout(lane.retryTimer.handle);
      lane.retryTimer = {state: 'idle', handle: null};
    }
  };
  const promise = Promise.resolve()
    .then(startPromiseFn)
    .then(
      (value) => {
        clearRetryTimer();
        settled = true;
        outcome = {status: 'fulfilled', value};
      },
      (reason) => {
        clearRetryTimer();
        settled = true;
        outcome = {status: 'rejected', reason};
      },
    );
  for (let round = 0; round < maxRounds && !settled; round += 1) {
    await pumpMulti(f, 2);
  }
  assert.equal(settled, true, `driveWithPump exceeded ${maxRounds} rounds`);
  await promise;
  clearRetryTimer();
  if (outcome.status === 'rejected') throw outcome.reason;
  return outcome.value;
}

async function openMultiReplica(
  f,
  {
    groupId,
    replicaId,
    replicas,
    nodeId,
    router,
    rows,
    hints,
    table = TABLES.SERVICES,
    electSingle = true,
  },
) {
  const cache = new SystemTableCache();
  for (const row of f.nodeRows) {
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, row);
  }
  const initialRows =
    rows.length > 0 ? rows : [activeServiceRow(groupId, replicaId, nodeId)];
  for (const row of initialRows) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, row);
  }
  const service = new MessageGroupService({
    groupId,
    replicaId,
    replicaIds: replicas,
    peerAddresses: hints,
    nodeId,
    transport: router,
    dbPath: path.join(f.directory, `${replicaId}.sqlite`),
    timeSource: new VirtualTimeSource({startMs: 1000}),
    nodeService: {
      getSystemTableCache: () => cache,
      getReadOnlySystemTableCache: () => cache,
    },
  });
  f.services.set(replicaId, service);
  f.serviceRouters.set(replicaId, router);
  registerMessageGroupTransportHandler(service, {
    messageRouter: router,
    address: service.unifiedAddress,
    onEnvelope: (envelope) => {
      if (!isRaftRsTransportEnvelope(payloadOf(envelope))) {
        f.events.push({
          ordinal: f.events.length,
          phase: f.phase,
          kind: 'registered-handler',
          replicaId,
          groupId,
          envelope: {
            payload: {
              events: cdcEvents(envelope).map((item) => ({
                ...item,
                data: item.data?.config_value?.length > 1024 ?
                  {...item.data, config_value: '<2MiB>'} :
                  item.data,
              })),
              relayDepth: payloadOf(envelope)?.relayDepth,
            },
          },
        });
      }
    },
  });
  await service.initialize();
  await service.subscribeToCDC(table);
  if (replicas.length === 1 && electSingle) {
    for (let round = 0; round < SETUP_ROUNDS; round += 1) {
      await service.raft.tick();
      await pumpMulti(f, 4);
      const status = service.raft.readStatus();
      if (status.role === RAFT_ROLE.LEADER && status.appliedIndex > 0) break;
    }
    assert.equal(service.raft.readStatus().role, RAFT_ROLE.LEADER);
  }
  return service;
}

async function closeMultiReplica(f, service) {
  const router = f.serviceRouters.get(service.replicaId) ?? f.routerB;
  const retirement = await retireMessageGroupTransportHandler({
    messageGroup: service,
    messageRouter: router,
    address: service.unifiedAddress,
    replicaId: service.replicaId,
  });
  assert.equal(retirement, REPLICA_HANDLER_RETIREMENT_OUTCOME.RETIRED);
  await service.shutdown();
  assert.equal(service.db?.open ?? false, false);
  f.services.delete(service.replicaId);
}

async function reopenMultiReplica(f, groupId, replicaId, replicas, nodeId, router, rows) {
  const old = f.services.get(replicaId);
  const before = {
    status: old.raft.readStatus(),
    record: recordOf(old),
    reservations: readRaftRsPeerIdentityReservations(old.db),
    dbPath: old.dbPath,
  };
  await closeMultiReplica(f, old);
  const inode = fs.statSync(before.dbPath).ino;
  const service = await openMultiReplica(f, {
    groupId,
    replicaId,
    replicas,
    nodeId,
    router,
    rows,
    hints: [],
  });
  assert.equal(fs.statSync(before.dbPath).ino, inode);
  assert.deepEqual(recordOf(service), before.record);
  assert.deepEqual(readRaftRsPeerIdentityReservations(service.db), before.reservations);
  assert.equal(service.raft.readStatus().peerId, before.status.peerId);
  assert.deepEqual(service.raft.readStatus().confState, before.status.confState);
  assert.deepEqual(service.peerAddresses, []);
  return service;
}

function wrapRouterDelivery(f, router, rawDeliver, label) {
  router.deliver = function(address, envelope, ...options) {
    if (isRaftRsTransportEnvelope(envelope)) {
      f.native.push({
        router,
        deliver: rawDeliver,
        address,
        envelope: structuredClone(envelope),
        options,
      });
      return Promise.resolve(buildDeliveryEnvelope({acknowledged: true}));
    }
    const run = async () => {
      const encodedBytes = Buffer.byteLength(json(envelope));
      const queueStats = router.outboundQueues?.get(NODE_B);
      const inFlight = queueStats?.inFlightCount ?? 0;
      if (inFlight > f.maxObservedInFlight) f.maxObservedInFlight = inFlight;
      const slimEnvelope = {
        payload: {
          events: cdcEvents(envelope).map((item) => ({
            eventKey: item.eventKey,
            entryId: item.entryId,
          })),
          relayDepth: payloadOf(envelope)?.relayDepth,
        },
      };
      const sendNote = {
        ordinal: f.events.length,
        phase: f.phase,
        kind: 'application-send',
        router: label,
        address,
        encodedBytes,
        envelope: slimEnvelope,
      };
      f.events.push(sendNote);
      if (typeof f.interceptSend === 'function') {
        const intercepted = await f.interceptSend({
          f,
          router: label,
          address,
          envelope,
          options,
          sendNote,
        });
        if (intercepted?.overrideResult !== undefined) {
          return intercepted.overrideResult;
        }
      }
      const result = await Reflect.apply(rawDeliver, router, [
        address,
        envelope,
        ...options,
      ]);
      f.events.push({
        ordinal: f.events.length,
        phase: f.phase,
        kind: 'application-return',
        router: label,
        sendOrdinal: sendNote.ordinal,
        address,
        encodedBytes,
        envelope: slimEnvelope,
        result,
      });
      return result;
    };
    const pending = run();
    f.applicationSettlements.add(pending);
    pending.then(
      () => f.applicationSettlements.delete(pending),
      () => f.applicationSettlements.delete(pending),
    );
    return pending;
  };
}

async function prepareOneTargetGroup(f, groupId) {
  const replicas = targetReplicasOf(groupId);
  const [leaderId, , , firstHopId, followerId] = replicas;
  const rows = replicas.map((id) => activeServiceRow(groupId, id, NODE_B));
  const hints = replicas.map((id) => nodeAddressOf(NODE_B, id));
  for (const id of replicas) {
    await openMultiReplica(f, {
      groupId,
      replicaId: id,
      replicas,
      nodeId: NODE_B,
      router: f.routerB,
      rows,
      hints,
    });
  }
  const leader = f.services.get(leaderId);
  for (let round = 0; round < SETUP_ROUNDS; round += 1) {
    await leader.raft.tick();
    await pumpMulti(f, 8);
    const statuses = replicas.map((id) => f.services.get(id).raft.readStatus());
    if (
      statuses[0].role === RAFT_ROLE.LEADER &&
      statuses.every((s) => s.leaderId === leaderId && s.appliedIndex > 0)
    ) {
      break;
    }
  }
  const formed = replicas.map((id) => f.services.get(id).raft.readStatus());
  assert.equal(formed[0].role, RAFT_ROLE.LEADER);
  const cutPeer = f.services.get(firstHopId).raft.readStatus().peerId;
  f.cutPeers.set(groupId, cutPeer);
  await pumpMulti(f, 8);
  const first = await reopenMultiReplica(
    f,
    groupId,
    firstHopId,
    replicas,
    NODE_B,
    f.routerB,
    [activeServiceRow(groupId, followerId, NODE_B, RAFT_ROLE.LEADER)],
  );
  await first.raft.campaign();
  await pumpMulti(f, 8);
  const follower = await reopenMultiReplica(
    f,
    groupId,
    followerId,
    replicas,
    NODE_B,
    f.routerB,
    [
      activeServiceRow(groupId, firstHopId, NODE_B),
      activeServiceRow(groupId, followerId, NODE_B),
    ],
  );
  const beforePort = follower.raft;
  const reconcile = follower.reconcileRaftPeersFromCache;
  follower.reconcileRaftPeersFromCache = function(...args) {
    f.events.push({
      ordinal: f.events.length,
      phase: f.phase,
      kind: 'actual-peer-reconciliation',
      groupId,
      replicaId: followerId,
      status: this.raft.readStatus(),
      row: this.systemTableCache.get(TABLES.SERVICES, leaderId) ?? null,
    });
    return Reflect.apply(reconcile, this, args);
  };
  for (let round = 0; round < SETUP_ROUNDS; round += 1) {
    await leader.raft.tick();
    await pumpMulti(f, 4);
    if (follower.raft.readStatus().leaderId === leaderId) break;
  }
  await pumpMulti(f, 8);
  const updatedBeforeStatus = follower.raft.readStatus();
  return {
    groupId,
    replicas,
    leaderId,
    firstHopId,
    followerId,
    leader,
    first,
    follower,
    beforePort,
    beforeStatus: updatedBeforeStatus,
    formed,
    cutPeer,
  };
}

async function closeMultiFixture(f) {
  f.phase = 'cleanup';
  for (const sub of f.subscribers) {
    f.producerLeader?.unsubscribeFromCDC(sub);
  }
  f.topology?.stop();
  f.tree?.stop();
  for (const held of f.heldApplications.splice(0)) held.resolve();
  await Promise.allSettled([pumpMulti(f, 4)]);
  await Promise.allSettled(
    [...f.services.values()].map((service) => closeMultiReplica(f, service)),
  );
  await Promise.allSettled([...f.applicationSettlements]);
  await Promise.allSettled([
    f.routerA?.shutdown(),
    f.routerB?.shutdown(),
    f.releaseOwners?.dispose(),
  ]);
  if (f.producer) {
    await f.producer.dispose({retainDirectory: false});
  }
  f.events.length = 0;
  f.native.length = 0;
  f.heldNative.length = 0;
  f.services.clear();
  f.serviceRouters.clear();
  f.targetGroups?.clear();
  fs.rmSync(f.directory, {recursive: true, force: true});
}

async function prepareMultiTargetProvisionalFixture(t, {portA = 24371, portB = 24372} = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_A},
    logging: {level: 'fatal'},
    raft: {
      heartbeatIntervalMs: 20,
      electionTimeoutMinMs: 150,
      electionTimeoutMaxMs: 300,
    },
  });
  LoggingService.getInstance().initialize({level: 'fatal'});
  const {routerA, routerB} = await connectTwoRouters(portA, portB);
  const f = {
    phase: 'setup',
    routerA,
    routerB,
    deliverA: routerA.deliver,
    deliverB: routerB.deliver,
    nodeRows: [
      activeNodeRow(NODE_A, portA, SOURCE_GROUP),
      activeNodeRow(NODE_B, portB, TARGET_GROUPS[0]),
    ],
    services: new Map(),
    serviceRouters: new Map(),
    targetGroups: new Map(),
    cutPeers: new Map(),
    events: [],
    native: [],
    heldNative: [],
    heldApplications: [],
    applicationSettlements: new Set(),
    subscribers: [],
    interceptSend: null,
    maxObservedInFlight: 0,
    producerClock: createControllableRealClock(),
    directory: fs.mkdtempSync(path.join(os.tmpdir(), 'mg-w7-multi-rf5-')),
    report: (observation) => t.diagnostic(json(observation)),
  };
  t.after(() => closeMultiFixture(f));
  wrapRouterDelivery(f, routerA, f.deliverA, 'routerA');
  wrapRouterDelivery(f, routerB, f.deliverB, 'routerB');

  f.producer = await formAdmittedGroup({
    partitionId: PARTITION_ID,
    members: SOURCE_MEMBERS,
    tempPrefix: 'mg-w7-source-part-',
    budgetMs: BUDGET_MS,
    serviceOptions: {
      tableName: TABLES.SERVICES,
      tableId: TABLES.SERVICES,
      schema: SERVICES_SCHEMA,
    },
  });
  f.releaseOwners = await attachPartitionReleaseOwners(f.producer.services, {
    directory: path.dirname(f.producer.dbFileOf(SOURCE_MEMBERS[0])),
    budgetMs: BUDGET_MS,
  });
  f.release = await f.releaseOwners.release(PARTITION_ID);
  assert.equal(f.release.outcome, PARTICIPANT_CUTOVER_OUTCOME.CUT_OVER);
  f.producerLeader = f.producer.services[0];
  f.producerLeader.timeSource = f.producerClock;

  const sourceProjectionRows = [
    activeServiceRow(SOURCE_GROUP, SOURCE_REPLICA, NODE_A, RAFT_ROLE.LEADER),
    ...TARGET_GROUPS.map((groupId) =>
      activeServiceRow(groupId, `${groupId}-f1`, NODE_B),
    ),
  ];
  f.source = await openMultiReplica(f, {
    groupId: SOURCE_GROUP,
    replicaId: SOURCE_REPLICA,
    replicas: [SOURCE_REPLICA],
    nodeId: NODE_A,
    router: routerA,
    rows: sourceProjectionRows,
    hints: [nodeAddressOf(NODE_A, SOURCE_REPLICA)],
  });

  for (const groupId of TARGET_GROUPS) {
    const targetInfo = await prepareOneTargetGroup(f, groupId);
    f.targetGroups.set(groupId, targetInfo);
  }
  f.phase = 'measured';
  return f;
}

export {
  NODE_A,
  NODE_B,
  SOURCE_GROUP,
  TARGET_GROUPS,
  PARTITION_ID,
  BUDGET_MS,
  nodeAddressOf,
  activeNodeRow,
  activeServiceRow,
  registrationInsertForNode,
  connectTwoRouters,
  pumpMulti,
  driveWithPump,
  openMultiReplica,
  closeMultiReplica,
  wrapRouterDelivery,
  prepareMultiTargetProvisionalFixture,
  recordOf,
  json,
  payloadOf,
  cdcEvents,
};
