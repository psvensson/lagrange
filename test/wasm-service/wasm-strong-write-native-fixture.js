// Real WasmServiceReplica construction and transport. The delivery schedule
// owns only transport custody; it never manufactures a consensus result.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from
  '../../src/constants/index.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../src/raft/raft-rs-ingress-constants.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {encodeProposal} from '../../src/raft/raft-rs-proposal-codec.js';
import {WasmServiceReplica, ENTRY_TYPE} from
  '../../src/wasm-service/wasm-service-replica.js';
import {encodeCommittedCommand} from
  '../../src/wasm-service/wasm-service-committed-command-codec.js';
import {WRITE_CONSISTENCY_MODE} from
  '../../src/wasm-service/wasm-service-constants.js';
import {createLoopbackTransport} from
  '../partition/partition-service-test-support.js';

const NODE_ID = 'wasm-write-witness-node';
const REPLICAS = ['wasm-write-a', 'wasm-write-b', 'wasm-write-c'];
const SETUP_ROUNDS = 200;
const DELIVERY_ROUNDS = 64;
const MICROTASKS_PER_ROUND = 16;
const CLOCK_START = 1000;
const HEARTBEAT_MS = 50;
const ELECTION_MIN_MS = 150;
const ELECTION_MAX_MS = 300;
const TICK_MS = 10;

function record(f, kind, detail = {}) {
  f.events.push({ordinal: f.events.length + 1, phase: f.phase, kind, ...detail});
}

function durableView(f, replica) {
  const durable = RaftRsDurableStore.readDurableRecordIn(replica.db, f.groupId);
  return {replicaId: replica.replicaId, durable,
    value: replica.kvStore.get(f.request.sessionId, f.request.key)?.toString() ?? null};
}

function views(f) {
  return f.replicas.map((replica) => durableView(f, replica));
}

// No elapsed time advances: only already-owned zero-delay inbound wakes fire.
// Each round captures the transport queue once. Later native messages wait
// for the next declared round. No status/read/settle/tick call occurs here.
async function deliverScheduled(f) {
  for (let round = 0; round < DELIVERY_ROUNDS; round += 1) {
    for (const item of f.queue.splice(0)) {
      if (f.holdResponses && item.address === f.leader.unifiedAddress &&
          item.envelope.message.msgType === RAFT_RS_MESSAGE_TYPE.APPEND_RESPONSE) {
        f.held.push(item);
        record(f, 'withheld-native-response', item);
      } else {
        record(f, 'native-delivery', item);
        await Reflect.apply(f.deliver, f.transport, [item.address, item.envelope,
          ...item.options]);
      }
    }
    for (const clock of f.clocks) clock.advance(0);
    for (let microtask = 0; microtask < MICROTASKS_PER_ROUND; microtask += 1) {
      await Promise.resolve();
    }
  }
}

async function form(f) {
  for (let round = 0; round < SETUP_ROUNDS; round += 1) {
    await f.replicas[0].raft.tick();
    await deliverScheduled(f);
    const statuses = f.replicas.map((replica) => replica.raft.readStatus());
    if (statuses.every((status) => status.leaderId === REPLICAS[0]) &&
        statuses[0].role === 'leader' &&
        views(f).every(({durable}) => BigInt(durable.appliedIndex) > 0n)) {
      f.leader = f.replicas[0];
      await deliverScheduled(f);
      assert.equal(f.queue.length, 0, 'setup transport is quiescent');
      assert.equal(f.leader.isLeader, true, 'production role consumer observed leader');
      return;
    }
  }
  assert.fail('setup seam: native WASM RF3 did not form within fixed rounds');
}

async function fixture(t, label) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}, raft: {
    heartbeatIntervalMs: HEARTBEAT_MS, electionTimeoutMinMs: ELECTION_MIN_MS,
    electionTimeoutMaxMs: ELECTION_MAX_MS, tickIntervalMs: TICK_MS}});
  LoggingService.getInstance().initialize({level: 'error'});
  const f = {groupId: `wasm-strong-write-${label}`, phase: 'setup',
    directory: fs.mkdtempSync(path.join(os.tmpdir(), 'wasm-strong-native-')),
    replicas: [], clocks: [], queue: [], held: [], events: [], leader: null,
    holdResponses: false, request: {operation: 'write', sessionId: 'session',
      key: label, value: `value-${label}`}};
  t.after(async () => {
    setActualCoreEntryObserver(null);
    for (const replica of f.replicas) await replica.shutdown();
    fs.rmSync(f.directory, {recursive: true, force: true});
    LoggingService.resetInstance();
    ConfigurationManager.resetInstance();
  });
  f.transport = createLoopbackTransport();
  f.deliver = f.transport.deliver;
  f.transport.deliver = function(address, envelope, ...options) {
    // The real core made these bytes. This transport ACK is custody in the
    // fixture's finite queue, not recipient acknowledgement or Raft commit.
    const item = {address, envelope: structuredClone(envelope), options};
    f.queue.push(item);
    record(f, 'transport-custody', item);
    return Promise.resolve({delivered: true});
  };
  const cache = new SystemTableCache();
  for (const replicaId of REPLICAS) {
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      [COLUMN.SERVICE_ID]: replicaId, [COLUMN.NODE_ID]: NODE_ID,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.WASM_SERVICE,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    });
  }
  setActualCoreEntryObserver((event) => {
    if (event.groupId === f.groupId) record(f, 'native-entry', event);
  });
  for (const replicaId of REPLICAS) {
    const replica = new WasmServiceReplica({replicaId, nodeId: NODE_ID,
      replicaIds: REPLICAS, serviceDefinitionId: f.groupId,
      dbPath: path.join(f.directory, `${replicaId}.sqlite`),
      transport: f.transport, systemTableCache: cache});
    // Existing hostedConsensusSubstrate seam, used by the production request.
    replica.providedTimeSource = new VirtualTimeSource({startMs: CLOCK_START});
    f.clocks.push(replica.providedTimeSource);
    f.replicas.push(replica);
    await replica.initialize();
  }
  assert.ok(f.replicas.every((replica) =>
    replica.writeConsistency === WRITE_CONSISTENCY_MODE.STRONG));
  await form(f);
  f.phase = 'measured';
  f.events.length = 0;
  f.before = views(f);
  return f;
}

function startWrite(f) {
  f.response = {state: 'pending'};
  record(f, 'strong-write-call', {request: f.request});
  f.write = f.leader.handleMessage({payload: f.request}).then((value) => {
    f.response = {state: 'fulfilled', value};
    record(f, 'caller-settlement', {response: f.response, views: views(f)});
    return value;
  }, (error) => {
    f.response = {state: 'rejected', message: error.message,
      consensus: error.consensus ?? null};
    record(f, 'caller-settlement', {response: f.response, views: views(f)});
  });
}

function proposalEntries(f, view) {
  const command = encodeCommittedCommand({type: ENTRY_TYPE.KV_SET,
    sessionId: f.request.sessionId, key: f.request.key, value: f.request.value});
  const data = Buffer.from(encodeProposal(command)).toString('base64');
  return view.durable.entries.filter((entry) => entry.data === data);
}

function evidence(t, f, stage) {
  const result = {stage, groupId: f.groupId, request: f.request,
    response: structuredClone(f.response), before: f.before, views: views(f),
    held: structuredClone(f.held), queue: structuredClone(f.queue),
    events: structuredClone(f.events),
    schedule: {deliveryRounds: DELIVERY_ROUNDS,
      microtasksPerRound: MICROTASKS_PER_ROUND, elapsedClockAdvanceMs: 0,
      observation: 'durable SQL and KV reads only; no status polling or tick',
      scope: 'native WasmServiceReplica write route, not compiled guest execution'}};
  t.diagnostic(JSON.stringify(result));
  return result;
}

export {deliverScheduled, evidence, fixture, proposalEntries, startWrite};
