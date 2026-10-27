// Test-owned companion to the immutable W07 witness. No runtime hook is added.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {VirtualTimeSource} from '../../../src/time/time-source.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../../src/raft/raft-rs-ingress-constants.js';
import {encodeProposal} from '../../../src/raft/raft-rs-proposal-codec.js';
import {setActualCoreEntryObserver, setCoreFaultInjector,
  setNativeInboundStageObserver} from '../../../src/raft/raft-rs-runtime-owner.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const REPLICAS = ['w07-companion-a', 'w07-companion-b', 'w07-companion-c'];
const [A, B, C] = REPLICAS;
const MICROTASK_GUARD = 256;
const SETUP_ROUNDS = 12;
const CLOCK_START = 1000;

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function own(f, result) {
  const record = {settled: false};
  f.owned.push(record);
  Promise.resolve(result).then(() => {
    record.settled = true;
  }, () => {
    record.settled = true;
  });
  return result;
}

// Passive Promise observation only; this never fires a clock or calls a port.
async function observe(predicate, label) {
  for (let turn = 0; turn < MICROTASK_GUARD; turn += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail(`seam guard: ${label}`);
}

function processSetupInbox(cluster, replica) {
  for (const envelope of cluster.replica(replica).inbox.splice(0)) {
    cluster.node(replica).step(envelope);
  }
  return cluster.node(replica).readStatus();
}

function form(cluster) {
  assert.equal(cluster.settle(() => cluster.leaderReplicaId() === A), true);
  assert.equal(cluster.propose(A, {setup: cluster.partitionId}).outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK);
  // Use the existing fixture's delivery/settlement driver for both commit
  // propagation and quiescence. This is setup only, before any measured cut.
  const ready = () => [...cluster.replicas.values()].every((replica) =>
    replica.appliedCommands.length === 1 && replica.inbox.length === 0);
  assert.equal(cluster.settle(ready), true,
    'setup: native RF3 commits once everywhere and its transport quiesces');
}

function captureHeartbeat(cluster) {
  for (let turn = 0; turn < SETUP_ROUNDS; turn += 1) {
    cluster.node(A).tick();
    const inbox = cluster.replica(B).inbox;
    const at = inbox.findIndex((item) =>
      item.message.msgType === RAFT_RS_MESSAGE_TYPE.HEARTBEAT);
    if (at !== -1) return inbox.splice(at, 1)[0];
  }
  assert.fail('setup: no native heartbeat captured');
}

function send(f, from, address, packet) {
  if (from !== B) return undefined;
  if (f.control.capture) {
    f.events.push({kind: 'native-send', hash: hash(packet), message: packet.message});
  }
  if (!f.control.hold?.(packet)) return undefined;
  const gate = Promise.withResolvers();
  const ordinal = f.gates.length + 1;
  f.gates.push({...gate, packet});
  f.events.push({kind: 'native-send-held', ordinal, hash: hash(packet),
    message: packet.message});
  return own(f, gate.promise.then(() => {
    f.cluster.queue(from, address, packet);
    f.events.push({kind: 'native-send-released', ordinal});
  }));
}

function fixture(name, applyFor = null) {
  const f = {events: [], gates: [], owned: [],
    control: {hold: null, capture: false},
    clocks: new Map(REPLICAS.map((id) =>
      [id, new VirtualTimeSource({startMs: CLOCK_START})]))};
  f.cluster = new PartitionNodeCluster({partitionId: name, replicaIds: REPLICAS,
    applyFor, substrateFor: (id) => ({timeSource: f.clocks.get(id)}),
    sendFor: (from, address, packet) => send(f, from, address, packet)});
  try {
    form(f.cluster);
    f.heartbeat = captureHeartbeat(f.cluster);
    f.peer = f.cluster.raftPeerIdOf(B);
    for (const clock of f.clocks.values()) clock.advance(0);
    return f;
  } catch (error) {
    clearObservers();
    f.cluster.dispose();
    throw error;
  }
}

// Native entry and argument observers are passive. A caller's explicit fault
// callback is separate and receives the actual native arguments unchanged.
function installObservers(f, fault = () => undefined) {
  let entry = null;
  setActualCoreEntryObserver((observation) => {
    entry = observation;
    f.events.push({kind: 'core-entry', ...observation});
  });
  setCoreFaultInjector((groupId, operation, args) => {
    if (groupId !== f.cluster.partitionId) return;
    if (operation === 'step') {
      f.events.push({kind: 'core-step', ...entry,
        hash: hash(args[0]), message: args[0]});
    }
    if (operation === 'propose') {
      f.events.push({kind: 'core-propose', ...entry,
        bytes: Buffer.from(args[0]).toString('hex')});
    }
    fault(operation, args);
  });
  setNativeInboundStageObserver((event) => {
    if (event.groupId === f.cluster.partitionId && event.replicaIdentity === B) {
      f.events.push({kind: 'inbound-stage', ...event});
    }
  });
}

function clearObservers() {
  setCoreFaultInjector(null);
  setActualCoreEntryObserver(null);
  setNativeInboundStageObserver(null);
}

function deliverHeartbeat(f, ordinal) {
  const envelopeHash = hash(f.heartbeat);
  const result = f.cluster.node(B).step(f.heartbeat);
  f.events.push({kind: 'delivery', ordinal, envelopeHash, result,
    provenance: ordinal === 1 ? 'captured-native-heartbeat' : 'exact-duplicate'});
  assert.equal(result.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
  assert.equal(result.reason, 'inbound-enqueued');
  assert.equal(hash(f.heartbeat), envelopeHash);
}

function proposalEntries(f, command) {
  const bytes = Buffer.from(encodeProposal(command)).toString('hex');
  return f.events.filter((event) => event.kind === 'core-propose' &&
    event.bytes === bytes);
}

function heartbeatSteps(f) {
  return f.events.filter((event) => event.kind === 'core-step' &&
    event.message.to === f.peer &&
    event.message.msgType === RAFT_RS_MESSAGE_TYPE.HEARTBEAT);
}

function replies(f) {
  return f.events.filter((event) => event.kind === 'native-send' &&
    event.message.msgType === RAFT_RS_MESSAGE_TYPE.HEARTBEAT_RESPONSE);
}

function assertNativeDelivery(f, count) {
  const stepped = heartbeatSteps(f);
  assert.equal(stepped.length, count, 'all accepted heartbeat copies enter native step');
  assert.ok(stepped.every((event) => event.hash === hash(f.heartbeat.message)));
  assert.equal(replies(f).length, count, 'each native heartbeat produces its real reply');
  assert.equal(f.events.filter((event) => event.kind === 'inbound-stage' &&
    event.stage === 'accepted').length, count);
  assert.equal(new Set(stepped.map((event) => event.runtimeGeneration)).size, 1);
}

async function finish(t, f) {
  t.diagnostic(JSON.stringify({w07Companion: f.cluster.partitionId, events: f.events}));
  f.control.hold = null;
  for (const gate of f.gates) gate.resolve();
  // Only the recovery case installs cleanup: rollback and dispatch an existing
  // persistence poll after evidence is frozen. Cleanup cannot prove service.
  let cleanupFailure = null;
  try {
    f.releaseHostWait?.();
    await observe(() => f.owned.every((record) => record.settled),
      'cleanup: observed invocations and sends settle');
    for (let turn = 0; turn < MICROTASK_GUARD; turn += 1) await Promise.resolve();
  } catch (error) {
    cleanupFailure = error;
  }
  clearObservers();
  if (cleanupFailure === null) {
    try {
      f.cluster.dispose();
    } catch (error) {
      cleanupFailure = error;
    }
  }
  t.diagnostic(JSON.stringify({w07CompanionCleanup: f.cluster.partitionId,
    settled: cleanupFailure === null,
    retainedDirectory: cleanupFailure ? f.cluster.directory : null,
    error: cleanupFailure?.message ?? null}));
  if (cleanupFailure && !f.failure) throw cleanupFailure;
}

export {A, B, C, SETUP_ROUNDS, assertNativeDelivery, deliverHeartbeat,
  finish, fixture, hash, heartbeatSteps, installObservers, observe, own,
  processSetupInbox, proposalEntries, replies};
