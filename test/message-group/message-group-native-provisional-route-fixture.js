// Real released SERVICES producer, RF1 source MG and RF5 target MG. The only
// fault is transport custody: native G/F1 traffic and the unchanged B envelope.
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
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
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
import {readCdcObligation, readCdcObligationProgress, readCdcObligationStanding} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTICIPANT_CUTOVER_OUTCOME} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {attachPartitionReleaseOwners} from '../partition/partition-release-fixture.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'mg-provisional-route-node';
const SOURCE_GROUP = 'mg-provisional-source';
const TARGET_GROUP = 'mg-provisional-target';
const SOURCE_REPLICA = `${SOURCE_GROUP}-r1`;
const TARGET_REPLICAS = ['l', 'h1', 'h2', 'f1', 'f2'].map((id) => `${TARGET_GROUP}-${id}`);
const [LEADER, , , FIRST_HOP, FOLLOWER] = TARGET_REPLICAS;
const PARTITION_ID = 'services-provisional-route';
const SOURCE_MEMBERS = [1, 2, 3].map((id) => [`${PARTITION_ID}-r${id}`, NODE_ID]);
const BUDGET_MS = 10000;
const SETUP_ROUNDS = 200;
const DELIVERY_ROUNDS = 64;
const MICROTASKS = 16;

function json(value) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? String(item) : item);
}

function addressOf(replicaId) {
  return `${NODE_ID}/message-group/${replicaId}`;
}

function recordOf(service, groupId = service.groupId) {
  assert.equal(typeof groupId, 'string', 'retained read requires its owner identity');
  assert.ok(groupId.length > 0, 'retained read refuses an empty owner identity');
  return RaftRsDurableStore.readDurableRecordIn(service.db, groupId);
}

function sourceView(f) {
  if (!f.producer || !f.debts) return null;
  return f.producer.services.map((service) => ({
    replicaId: service.replicaId,
    obligations: f.debts.map((debt) => readCdcObligation(service.db, debt.eventKey)),
    // Decision D1: a delivered debt is reclaimed into the compact progress
    // once nothing owed lies below it; its standing is the one predicate.
    standings: f.debts.map((debt) => readCdcObligationStanding(service.db, debt).standing),
    progress: readCdcObligationProgress(service.db),
    record: recordOf(service, service.partitionId),
    lane: service.cdcDelivery.getCdcObligationDiagnostics(),
  }));
}

function note(f, kind, detail = {}) {
  const event = {ordinal: f.events.length, phase: f.phase, kind, ...detail};
  f.events.push(event);
  return event;
}

function payloadOf(envelope) {
  return envelope.payload ?? envelope;
}

function cdcEvents(envelope) {
  const payload = payloadOf(envelope);
  return payload.events ?? (payload.tableName ? [payload] : []);
}

function targetView(f) {
  return TARGET_REPLICAS.filter((id) => f.services.get(id)?.db?.open).map((id) => {
    const service = f.services.get(id);
    return {replicaId: id, status: service.raft.readStatus(), record: recordOf(service),
      a: service.systemTableCache.get(TABLES.SERVICES, SOURCE_REPLICA) ?? null,
      b: service.systemTableCache.get(TABLES.SERVICES, LEADER) ?? null};
  });
}

function activeProjection(groupId, replicaId, role = RAFT_ROLE.FOLLOWER) {
  // Cache inputs deliberately describe a stale routing projection. They are
  // never native role, membership, lifecycle authorization or readiness facts.
  return {...MessageGroupServiceRowOwner.buildServiceRow({groupId, replicaId,
    nodeId: NODE_ID, timestamp: 1, status: SERVICE_STATUS.ACTIVE}), raft_role: role};
}

async function pump(f, rounds = DELIVERY_ROUNDS) {
  for (let round = 0; round < rounds; round += 1) {
    for (const item of f.native.splice(0)) {
      const cut = item.envelope.groupId === TARGET_GROUP && f.cutPeer !== null &&
        (item.envelope.from === f.cutPeer || item.envelope.to === f.cutPeer);
      if (cut) {
        f.heldNative.push(item);
        note(f, 'native-cut', {from: item.envelope.from, to: item.envelope.to,
          groupId: item.envelope.groupId, msgType: item.envelope.message.msgType});
      } else {
        await Reflect.apply(f.deliver, f.router, [item.address, item.envelope, ...item.options]);
      }
    }
    for (const service of f.services.values()) service.providedTimeSource.advance(0);
    for (let step = 0; step < MICROTASKS; step += 1) await Promise.resolve();
    // Cache notifications own a real next-turn hop. Yield it without replacing
    // their scheduler or expanding any delivery deadline.
    await yieldTurn();
  }
}

async function tick(f) {
  for (const service of f.services.values()) await service.raft.tick();
  await pump(f);
}

async function deliverApplication(f, address, envelope, options) {
  const started = note(f, 'application-send', {address, envelope: structuredClone(envelope),
    source: sourceView(f)});
  const events = cdcEvents(envelope);
  if (f.holdB && address === addressOf(FIRST_HOP) &&
      events.some((event) => event.data?.service_id === LEADER)) {
    const held = Promise.withResolvers();
    f.heldApplications.push(held);
    note(f, 'held-b-before-dispatch', {sendOrdinal: started.ordinal, source: sourceView(f)});
    await held.promise;
  }
  try {
    const result = await Reflect.apply(f.deliver, f.router, [address, envelope, ...options]);
    note(f, 'application-return', {sendOrdinal: started.ordinal, address,
      envelope: structuredClone(envelope), result: structuredClone(result),
      target: targetView(f), source: sourceView(f),
      sourceGroup: f.source?.db?.open ? {record: recordOf(f.source)} : null});
    return result;
  } catch (error) {
    note(f, 'application-error', {sendOrdinal: started.ordinal, address,
      message: error.message, code: error.code ?? null});
    throw error;
  }
}

function releaseB(f) {
  f.holdB = false;
  for (const held of f.heldApplications.splice(0)) held.resolve();
}

async function openReplica(f, groupId, replicaId, replicas, rows, hints) {
  const cache = new SystemTableCache();
  for (const row of rows) cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, row);
  const service = new MessageGroupService({groupId, replicaId, replicaIds: replicas,
    peerAddresses: hints, nodeId: NODE_ID, transport: f.router,
    dbPath: path.join(f.directory, `${replicaId}.sqlite`),
    timeSource: new VirtualTimeSource({startMs: 1000}),
    nodeService: {getSystemTableCache: () => cache, getReadOnlySystemTableCache: () => cache}});
  f.services.set(replicaId, service);
  registerMessageGroupTransportHandler(service, {messageRouter: f.router,
    address: service.unifiedAddress, onEnvelope: (envelope) => {
      if (!isRaftRsTransportEnvelope(envelope)) {
        note(f, 'registered-handler', {replicaId, envelope: structuredClone(envelope),
          status: service.raft.readStatus(), record: recordOf(service), source: sourceView(f)});
      }
    }});
  await service.initialize();
  await service.subscribeToCDC(TABLES.SERVICES);
  return service;
}

async function closeReplica(f, service) {
  const handler = service.transportHandler;
  const db = service.db;
  const failures = [];
  let retirement;
  try {
    retirement = await retireMessageGroupTransportHandler({messageGroup: service,
      messageRouter: f.router, address: service.unifiedAddress, replicaId: service.replicaId});
    assert.equal(retirement, REPLICA_HANDLER_RETIREMENT_OUTCOME.RETIRED);
    assert.notEqual(f.router.getRegisteredHandler(service.unifiedAddress), handler);
  } catch (error) {
    failures.push(error);
  }
  try {
    await service.shutdown();
    assert.equal(db?.open ?? false, false, 'normal shutdown closes the old durable connection');
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `exact cleanup did not settle ${service.replicaId}`);
  }
  f.services.delete(service.replicaId);
  note(f, 'exact-handler-and-database-closed', {replicaId: service.replicaId, retirement});
}

async function reopen(f, replicaId, rows) {
  const old = f.services.get(replicaId);
  const before = {status: old.raft.readStatus(), record: recordOf(old),
    reservations: readRaftRsPeerIdentityReservations(old.db), dbPath: old.dbPath};
  const oldPort = old.raft;
  const oldHandler = old.transportHandler;
  await closeReplica(f, old);
  const inode = fs.statSync(before.dbPath).ino;
  const service = await openReplica(f, TARGET_GROUP, replicaId, TARGET_REPLICAS, rows, []);
  assert.notEqual(service.raft, oldPort);
  assert.notEqual(service.transportHandler, oldHandler);
  assert.equal(f.router.getRegisteredHandler(service.unifiedAddress), service.transportHandler);
  assert.equal(service.dbPath, before.dbPath);
  assert.equal(fs.statSync(service.dbPath).ino, inode, 'reopen uses the retained file');
  assert.deepEqual(recordOf(service), before.record, 'normal reopen preserves the retained native record');
  assert.deepEqual(readRaftRsPeerIdentityReservations(service.db), before.reservations);
  assert.equal(service.raft.readStatus().peerId, before.status.peerId);
  assert.deepEqual(service.raft.readStatus().confState, before.status.confState);
  assert.deepEqual(service.peerAddresses, [], 'the reopened service has no bootstrap address hints');
  note(f, 'retained-reopen', {replicaId, before, after: service.raft.readStatus()});
  return service;
}

async function prepareRecipients(f) {
  f.source = await openReplica(f, SOURCE_GROUP, SOURCE_REPLICA, [SOURCE_REPLICA],
    [activeProjection(TARGET_GROUP, FIRST_HOP)], [addressOf(SOURCE_REPLICA)]);
  const rows = TARGET_REPLICAS.map((id) => activeProjection(TARGET_GROUP, id));
  for (const id of TARGET_REPLICAS) {
    await openReplica(f, TARGET_GROUP, id, TARGET_REPLICAS, rows, TARGET_REPLICAS.map(addressOf));
  }
  const leader = f.services.get(LEADER);
  for (let round = 0; round < SETUP_ROUNDS; round += 1) {
    await leader.raft.tick();
    await pump(f);
    const statuses = TARGET_REPLICAS.map((id) => f.services.get(id).raft.readStatus());
    if (statuses[0].role === RAFT_ROLE.LEADER && statuses.every((status) =>
      status.leaderId === LEADER && status.appliedIndex > 0)) break;
  }
  const formed = TARGET_REPLICAS.map((id) => f.services.get(id).raft.readStatus());
  f.report({stage: 'setup-rf5-native-formation-observations', formed});
  assert.equal(formed[0].role, RAFT_ROLE.LEADER, 'setup: RF5 native leader formed');
  for (const status of formed) {
    assert.equal(status.leaderId, LEADER);
    assert.equal(status.confState.voters.length, TARGET_REPLICAS.length);
    assert.deepEqual(status.confState, formed[0].confState);
    assert.ok(status.appliedIndex > 0);
  }
  f.formed = formed;
  f.cutPeer = f.services.get(FIRST_HOP).raft.readStatus().peerId;
  const reservation = readRaftRsPeerIdentityReservations(f.services.get(FIRST_HOP).db)
    .find((row) => row.replicaIdentity === FIRST_HOP);
  assert.equal(f.cutPeer, reservation.peerId, 'fault binds retained identity, never voter position');
  await pump(f);
  f.first = await reopen(f, FIRST_HOP,
    [activeProjection(TARGET_GROUP, FOLLOWER, RAFT_ROLE.LEADER)]);
  // Exercise outgoing election isolation through the real operation port.
  // The cut, not an assigned role or a disabled timer, prevents its quorum.
  const campaign = await f.first.raft.campaign();
  note(f, 'isolated-native-campaign', {campaign, status: f.first.raft.readStatus()});
  await pump(f);
  f.follower = await reopen(f, FOLLOWER,
    [activeProjection(TARGET_GROUP, FIRST_HOP), activeProjection(TARGET_GROUP, FOLLOWER)]);
  f.followerBeforePort = f.follower.raft;
  const reconcile = f.follower.reconcileRaftPeersFromCache;
  f.follower.reconcileRaftPeersFromCache = function(...args) {
    note(f, 'actual-peer-reconciliation', {status: this.raft.readStatus(),
      row: this.systemTableCache.get(TABLES.SERVICES, LEADER) ?? null});
    return Reflect.apply(reconcile, this, args);
  };
  for (let round = 0; round < SETUP_ROUNDS; round += 1) {
    await tick(f);
    if (f.follower.raft.readStatus().leaderId === LEADER) break;
  }
  await pump(f);
  f.phase = 'measured';
}

async function prepareProducer(f) {
  f.producer = await formAdmittedGroup({partitionId: PARTITION_ID, members: SOURCE_MEMBERS,
    tempPrefix: 'mg-provisional-source-', budgetMs: BUDGET_MS,
    serviceOptions: {tableName: TABLES.SERVICES, tableId: TABLES.SERVICES,
      schema: SERVICES_SCHEMA}});
  f.releaseOwners = await attachPartitionReleaseOwners(f.producer.services,
    {directory: path.dirname(f.producer.dbFileOf(SOURCE_MEMBERS[0])), budgetMs: BUDGET_MS});
  f.release = await f.releaseOwners.release(PARTITION_ID);
  assert.equal(f.release.outcome, PARTICIPANT_CUTOVER_OUTCOME.CUT_OVER, json(f.release));
  f.producerLeader = f.producer.services[0];
  assert.equal(f.producerLeader.raft.readStatus().role, RAFT_ROLE.LEADER);
  assert.equal(f.producerLeader.raft.readStatus().confState.voters.length, SOURCE_MEMBERS.length);
}

async function closeFixture(f) {
  f.phase = 'cleanup';
  if (f.subscriber) f.producerLeader.unsubscribeFromCDC(f.subscriber);
  f.topology?.stop();
  f.tree?.stop();
  releaseB(f);
  const results = await Promise.allSettled([pump(f)]);
  results.push(...await Promise.allSettled([...f.services.values()]
    .map((service) => closeReplica(f, service))));
  const deliveries = await Promise.allSettled([...f.applicationSettlements]);
  note(f, 'all-application-settlements-closed', {states: deliveries.map(({status}) => status)});
  results.push(...await Promise.allSettled([f.router.shutdown(), f.releaseOwners?.dispose()]));
  const failed = () => results.some((result) => result.status === 'rejected');
  if (f.producer) {
    results.push(...await Promise.allSettled([
      f.producer.dispose({retainDirectory: failed()}),
    ]));
  }
  if (failed()) {
    throw new AggregateError(results.filter((result) => result.status === 'rejected')
      .map((result) => result.reason), `independent fixture cleanup failed; retained ${f.directory}`);
  }
  // Held native packets belong to the retired lifetime and are never replayed
  // into its reopened successor. Discard custody only after all owners closed.
  f.heldNative.length = 0;
  fs.rmSync(f.directory, {recursive: true, force: true});
}

async function provisionalRouteFixture(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}, logging: {level: 'fatal'},
    raft: {heartbeatIntervalMs: 20, electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300}});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const f = {phase: 'setup', services: new Map(), events: [], native: [], heldNative: [],
    cutPeer: null, holdB: true, heldApplications: [], applicationSettlements: new Set(),
    directory: fs.mkdtempSync(path.join(os.tmpdir(), 'mg-provisional-rf5-')),
    report: (observation) => t.diagnostic(json(observation))};
  f.router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID, wsPort: 0});
  t.after(() => closeFixture(f));
  await f.router.initialize({startServer: false});
  f.deliver = f.router.deliver;
  f.router.deliver = function(address, envelope, ...options) {
    if (isRaftRsTransportEnvelope(envelope)) {
      f.native.push({address, envelope: structuredClone(envelope), options});
      return Promise.resolve(buildDeliveryEnvelope({acknowledged: true}));
    }
    const pending = deliverApplication(f, address, envelope, options);
    f.applicationSettlements.add(pending);
    pending.then(() => f.applicationSettlements.delete(pending),
      () => f.applicationSettlements.delete(pending));
    return pending;
  };
  await prepareProducer(f);
  f.report({stage: 'setup-services-actual-cut-over', release: f.release,
    statuses: f.producer.services.map((service) => service.raft.readStatus())});
  await prepareRecipients(f);
  return f;
}

function registrationInsert(service, entryId) {
  // Canonical owner bytes plus released SQL prove a mutation/debt, not the
  // separate lifecycle gateway's registration or activation authorization.
  const row = MessageGroupServiceRowOwner.buildRegistrationRow({groupId: service.groupId,
    replicaId: service.replicaId, nodeId: NODE_ID, service,
    timestamp: 2, status: SERVICE_STATUS.STOPPED});
  const parts = cdcSqlBuilder.buildInsertParts(row);
  return {entryId, row, sql: `INSERT INTO services (${parts.columns}) VALUES (${parts.placeholders})`,
    params: parts.values};
}

export {provisionalRouteFixture, registrationInsert, sourceView, targetView, recordOf,
  json, note, pump, tick, releaseB, addressOf, payloadOf, cdcEvents,
  NODE_ID, SOURCE_GROUP, TARGET_GROUP, SOURCE_REPLICA, TARGET_REPLICAS,
  LEADER, FIRST_HOP, FOLLOWER, PARTITION_ID};
