// Native RF3 witnesses of design SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017
// (Revision 3 governs, then Revision 2): the serving grant is decided inside
// the keyed creation continuation and copied durably into the receiver-local
// record before user work is admitted; retirement fences user admission at
// call, records RETIRED durably and only then acknowledges metadata CLOSED.
// Evidence ceiling: real raft-rs groups on one host, the component SQLite
// metadata/journal adapters, the queued loopback transport, virtual clocks.
// No endpoint, services-row or ACTIVE projection exists for a bound replica
// in this stage: every such sink keeps throwing and must stay unused.
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {fixture, bootstrapGroup, formGroup, initialization, administer, deliverScheduled,
  reenterOnWake} from './wasm-retained-bootstrap-fixture.js';
import {openWasmCreationRecords} from '../../src/wasm-service/wasm-creation-opening.js';
import {CONSENSUS_CREATION_OPENING as OPENING} from
  '../../src/service/service-consensus-creation-intent.js';
import {WASM_SERVICE_COMMAND_TYPE} from '../../src/wasm-service/wasm-service-constants.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR} from
  '../../src/raft/raft-operation-port-constants.js';
import {SERVICE_INSTANCE_LIMIT} from '../../src/constants/service-instance.js';

const SERVICE_ID_KEY = 'serviceDefinitionId';
const PREFIX = {type: 'WASM_WRITER_V1', profile: 'wasm-writer-v1/1'};
const ENROLL_NONCE = '33'.repeat(32);
const SERVED = 'SERVING';
const HELD = 'HELD';
const STATUS_PUBLISHED = 'PUBLISHED';
const STATUS_HELD = 'BOOTSTRAPPED_HELD';
const WAKE_OBSERVED = 'creation_genesis_observed';
const WAKE_GRANT_HELD = 'creation_grant_held';
const WAKE_CLOSED = 'creation_resource_closed';
const REFUSED_SHUTDOWN = {status: 'REFUSED', reason: 'WRITER_SHUTDOWN', identity: null};
const HELD_REFUSAL = {status: 'REFUSED', reason: 'WRITER_NOT_READY', identity: null};
const FAULT = 'COMPONENT_AUTHORITATIVE_READ_UNAVAILABLE';
const ELECTION_ROUNDS = 40;
const ENGAGED_ZERO_ROW_UPDATE = /^UPDATE service_instances\b/u;

// Passive observation of the production continuation: run results with their
// queue reasons, leader-effect replays, accepted enqueues and genesis reads.
// Nothing here answers for an owner or changes a decision.
function observe(f) {
  const runs = [];
  const seen = new WeakSet();
  const addHost = f.addHost;
  f.addHost = async (...args) => {
    const host = await addHost(...args);
    const create = host.lifecycle.createReplica.bind(host.lifecycle);
    host.lifecycle.createReplica = (...input) => {
      const replica = create(...input);
      const adapter = replica.creationReconciliation;
      if (adapter && !seen.has(replica)) {
        seen.add(replica);
        replica.observed = {reconstructs: 0, enqueues: 0};
        const timers = replica.timerManager;
        const reconstruct = timers.reconstructTimers.bind(timers);
        timers.reconstructTimers = () => {
          replica.observed.reconstructs += 1;
          return reconstruct();
        };
        const queue = adapter.queue;
        const run = queue.reconcileFn;
        queue.reconcileFn = async (...entry) => {
          const result = await run(...entry);
          runs.push({host, replica, reasons: [...entry[1]], result});
          return result;
        };
        const enqueue = queue.enqueue.bind(queue);
        queue.enqueue = (...entry) => {
          replica.observed.enqueues += 1;
          return enqueue(...entry);
        };
      }
      return replica;
    };
    return host;
  };
  return runs;
}

async function settle(f) {
  await deliverScheduled(f);
  for (let index = 0; index < f.hosts.length; index += 1) {
    await Promise.all(f.hosts[index].reentryResults.splice(0));
  }
  await deliverScheduled(f);
}

function beginStart(f, host) {
  const observation = {settled: false, result: null};
  observation.promise = f.bootstrap(host).then((result) => {
    observation.settled = true;
    observation.result = result;
    return result;
  });
  return observation;
}

async function startAndDeliver(f, host) {
  const operation = beginStart(f, host);
  await deliverScheduled(f);
  assert.equal(operation.settled, true, 'START_DID_NOT_SETTLE_IN_DECLARED_NATIVE_SCHEDULE');
  return operation.result;
}

// The leader's first START submits the production-authored INIT; a second
// START observes the covering committed membership (genesis witnesses).
async function initialize(f) {
  const first = await startAndDeliver(f, f.hosts[0]);
  assert.equal(first.status, STATUS_HELD, JSON.stringify(first));
  assert.equal(first.genesis.reason, 'GENESIS_APPLICATION_NOT_COVERED');
}

function instanceOf(f, binding) {
  const state = f.metadata.state();
  return [state.selected, state.retiring].find((instance) =>
    instance?.binding.incarnation === binding.incarnation) ?? null;
}

function slotPhase(f, host) {
  const binding = host.intent.consensusBinding;
  return instanceOf(f, binding)?.resources[host.intent.consensusSlotRequest.slot].phase ?? null;
}

function tokenOf(f, host) {
  const row = f.metadata.db.prepare('SELECT admission_json FROM wasm_operations WHERE ' +
    'operation_id = ?').get(host.intent.consensusSlotRequest.operationId);
  return JSON.parse(row.admission_json);
}

function creationRow(f, host) {
  return f.metadata.db.prepare('SELECT * FROM wasm_operations WHERE operation_id = ?')
    .get(host.intent.consensusSlotRequest.operationId);
}

// A second connection reads the receiver-local record durably committed by
// the replica's own connection (WAL readers see committed frames).
function localRecord(path) {
  const db = new Database(path, {readonly: true, fileMustExist: true});
  try {
    const row = db.prepare('SELECT record FROM _wasm_creation_local WHERE id=1').get();
    return row ? JSON.parse(row.record) : null;
  } finally {
    db.close();
  }
}

function serviceInstanceMutations(f) {
  return f.metadata.writes.filter((write) => /\bservice_instances\b/u.test(write.sql) &&
    write.changes === 1).length;
}

function assertNoProjection(f) {
  for (const host of f.hosts) assert.deepEqual(host.publications, []);
}

async function publishedGroup(t, options = {}) {
  const f = await fixture(t, {automaticReconciliation: true, creationWake: reenterOnWake,
    tolerateRetiredAddress: true, ...options});
  const runs = observe(f);
  await bootstrapGroup(f);
  await settle(f);
  for (const host of f.hosts) {
    assert.equal(host.replica.servingState, SERVED, `${host.nodeId} did not publish`);
    assert.equal(host.result.status, STATUS_PUBLISHED, JSON.stringify(host.result));
  }
  return {f, runs};
}

async function enrollAndWrite(f, key) {
  const binding = f.hosts[0].intent.consensusBinding;
  const serviceId = binding.serviceDefinitionId;
  const incarnation = binding.incarnation;
  const enrolled = await administer(f, {...PREFIX, action: 'ENROLL', serviceId, incarnation,
    slot: 0, expectedGeneration: 0, expectedCompletedSequence: 0, expectedReceiptDigest: null,
    newGeneration: 1, nonce: ENROLL_NONCE});
  assert.equal(enrolled.status, 'RECORDED', JSON.stringify(enrolled));
  const request = {operation: 'write', sessionId: 'session', key, value: `value-${key}`,
    requestId: {serviceId, incarnation, slot: 0, generation: 1, sequence: 1}, ack: null};
  let response = null;
  f.leader.handleMessage({payload: request}).then((value) => {
    response = value;
  });
  await deliverScheduled(f);
  return {request, response};
}

// Exactly one wake of the operation owner per published replica, and it is
// the genesis wake of the event run that flipped it to SERVING (never a second
// one: the latch). Superseded by design amendment A2 as revised by A2'
// (A2'.7; also resolves stage-1 verifier finding F-W2 for this case): "or the
// typed grant-held wake of a run whose single-row metadata CAS lost to a
// sibling slot's concurrent grant (STATE_CHANGED), which the consumer re-drove
// through START" - the metadata owner re-decides a lost slot CAS itself, so
// no founder of one group is held STATE_CHANGED by its siblings.
function assertOneOwnerWake(host) {
  assert.equal(host.wakes.length, 1, JSON.stringify(host.wakes));
  assert.equal(host.wakes[0].reason, WAKE_OBSERVED, JSON.stringify(host.wakes));
}

function retirementHandleWake(host, binding) {
  return host.wakes.filter((wake) => wake.reason === WAKE_CLOSED &&
    wake.binding.incarnation === binding.incarnation);
}

// Fence observation: the first synchronous turn after the STOPPING fence.
function fenceProbe(replica) {
  const probe = {read: null, proposal: null};
  const shutdown = replica.shutdown.bind(replica);
  replica.shutdown = (...args) => {
    const settlement = shutdown(...args);
    probe.read = replica.handleMessage({payload: {operation: 'read', sessionId: 'session',
      key: 'fenced'}});
    probe.proposal = replica.proposeEntry({type: WASM_SERVICE_COMMAND_TYPE.KV_SET,
      sessionId: 'session', key: 'fenced', value: Buffer.from('late')})
      .then(() => ({admitted: true}), (error) => ({admitted: false, reason: error.reason}));
    return settlement;
  };
  return probe;
}

// A held CAS must be entered by the operation under test; an operation that
// settles without reaching it is a typed failure, never an unresolved wait.
async function enteredBefore(gate, operation, label) {
  const first = await Promise.race([gate.then(() => 'entered'),
    Promise.resolve(operation).then(() => 'settled', () => 'settled')]);
  assert.equal(first, 'entered', label);
}

// A real native election change: the leader hands leadership to a named
// voter (the port's own transfer request), delivered on the fixed schedule.
async function transferLeadership(f, from, to) {
  const answer = await from.raft.transferLeadership({
    successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED, replicaIdentity: to.replicaId});
  assert.equal(answer.outcome, 'CORE_OK', JSON.stringify(answer));
  for (let round = 0; round < ELECTION_ROUNDS; round += 1) {
    await deliverScheduled(f);
    if (to.isLeader && !from.isLeader) return;
    await from.raft.tick();
  }
  assert.fail(`${to.replicaId} did not take leadership within the fixed schedule`);
}

describe('6prime: publication owned by the keyed continuation, retirement before CLOSED', () => {
  test('P1 native events publish every founder: durable grant, one wake, served write, quiet adapter',
    async (t) => {
      const {f, runs} = await publishedGroup(t);
      for (const host of f.hosts) {
        const token = tokenOf(f, host);
        assert.equal(slotPhase(f, host), 'PUBLISHED');
        const local = localRecord(host.replica.dbPath);
        assert.equal(local.phase, 'PUBLISHED', 'LOCAL_GRANT_NOT_DURABLE');
        assert.deepEqual(local.grant.token, token);
        assert.equal(creationRow(f, host).state, 'in_progress',
          'the creation row stays IN_PROGRESS until the recovery stage (Revision 2 D7\')');
        assertOneOwnerWake(host);
        assert.deepEqual(host.wakes[0].token, token);
        assert.equal(host.wakes[0][SERVICE_ID_KEY], f.metadata.serviceId);
        assert.equal(host.reentries, 1);
        assert.equal(host.replica.heldCreationRefusal(), null);
        assert.equal(host.replica.creationReconciliation.subscriptions.length, 0,
          'PUBLISHED_ADAPTER_KEPT_NATIVE_SUBSCRIPTIONS');
        // A2' (stage-1b verifier F-4a): this per-host event-run check became
        // unconditional; it subsumes the former group-level
        // NO_REPLICA_PUBLISHED_FROM_NATIVE_EVENTS some-check (every founder
        // now publishes from its own event run, no sibling-raced hold remains).
        assert.ok(runs.some((run) => run.replica === host.replica &&
          run.result.outcome === 'GENESIS_PUBLISHED' &&
          !run.reasons.includes('progress_reconcile')),
        'PUBLICATION_DID_NOT_HAPPEN_INSIDE_AN_EVENT_RUN');
      }
      assertNoProjection(f);
      assert.equal(f.leader.observed.reconstructs, 1, 'LEADER_EFFECTS_NOT_REPLAYED_ONCE');
      assert.notEqual(f.leader._safetyBroadcastTimer, null);
      for (const host of f.hosts.slice(1)) {
        assert.equal(host.replica.observed.reconstructs, 0);
        assert.equal(host.replica._safetyBroadcastTimer, null);
      }
      const runsBefore = runs.length;
      const enqueues = f.hosts.map((host) => host.replica.observed.enqueues);
      const {request, response} = await enrollAndWrite(f, 'p1');
      assert.equal(response?.status, 'RECORDED', JSON.stringify(response));
      for (const host of f.hosts) {
        assert.equal(host.replica.kvStore.get(request.sessionId, request.key)?.toString(),
          request.value, 'SERVED_WRITE_NOT_VISIBLE_ON_FOUNDER');
      }
      // N16: committed user entries neither enqueue nor run the continuation.
      assert.equal(runs.length, runsBefore, 'COMMITTED_USER_WRITE_RAN_THE_GENESIS_CONTINUATION');
      assert.deepEqual(f.hosts.map((host) => host.replica.observed.enqueues), enqueues,
        'A_SERVING_REPLICA_ENQUEUED_NATIVE_WAKES');
      assertNoProjection(f);
    });

  test('P2 predecessor outstanding holds the successor typed; P8 the last CLOSED wakes its owner',
    async (t) => {
      const f = await fixture(t, {automaticReconciliation: true, creationWake: reenterOnWake,
        tolerateRetiredAddress: true});
      const runs = observe(f);
      const predecessor = f.intentFor(0);
      assert.equal((await f.metadata.prepare()).outcome, 'ADMISSION_RETAINED');
      const prior = predecessor.consensusBinding;
      const selection = await f.metadata.primary.selectConsensusInstance(
        f.metadata.request(1, 2, prior.incarnation));
      assert.equal(selection.outcome, 'SELECTED');
      for (let slot = 0; slot < prior.foundingPeers.length; slot += 1) {
        const host = await f.addHost(slot, f.successorIntent(slot, selection.binding));
        assert.equal((await f.bootstrap(host)).status, STATUS_HELD);
        f.replicas.push(host.replica);
        f.clocks.push(host.timeSource);
      }
      await formGroup(f);
      await settle(f);
      for (const host of f.hosts) {
        assert.equal(slotPhase(f, host), 'ADMITTED', 'the successor reservation exists');
        assert.equal(host.replica.servingState, HELD);
        assert.deepEqual(host.replica.heldCreationRefusal(), HELD_REFUSAL);
        assert.ok(host.wakes.length > 0 && host.wakes.every((wake) =>
          wake.reason === WAKE_GRANT_HELD && wake.grant.outcome === 'PREDECESSOR_OUTSTANDING'),
        JSON.stringify(host.wakes));
        assert.equal(host.reentries, 0, 'A_GRANT_HELD_WAKE_WAS_RETRIED_BY_THE_LIFECYCLE');
      }
      const held = await startAndDeliver(f, f.hosts[0]);
      assert.equal(held.status, STATUS_HELD);
      assert.equal(held.grant.outcome, 'PREDECESSOR_OUTSTANDING',
        'SUCCESSOR_GRANTED_WHILE_PREDECESSOR_OUTSTANDING');
      assert.equal(instanceOf(f, prior).resources[0].phase, 'ADMITTED');
      // P8: retire the predecessor's only outstanding slot on its own node.
      const owner = f.hosts[0];
      const retired = await owner.manager.stopReplica(f.handle(owner, predecessor));
      assert.equal(retired.closed, true, JSON.stringify(retired));
      assert.equal(retired.tombstone.outcome, 'CREATION_STORAGE_MISSING');
      assert.equal(instanceOf(f, prior).resources[0].phase, 'CLOSED');
      const wakes = retirementHandleWake(owner, prior);
      assert.equal(wakes.length, 1, 'LAST_CLOSED_DID_NOT_WAKE_THE_SUCCESSOR_OWNER');
      assert.deepEqual(wakes[0].token, tokenOf(f, {intent: predecessor}));
      await settle(f);
      assert.equal(owner.reentries, 1);
      assert.equal(owner.result.status, STATUS_PUBLISHED, JSON.stringify(owner.result));
      assert.equal(slotPhase(f, owner), 'PUBLISHED');
      assert.equal(owner.replica.servingState, SERVED);
      // Cross-node wake delivery is the deferred discovery stage (7'): the
      // other successors stay typed-held until their own owner re-enters.
      for (const host of f.hosts.slice(1)) {
        assert.equal(host.replica.servingState, HELD);
        assert.equal((await startAndDeliver(f, host)).status, STATUS_PUBLISHED);
      }
      assert.ok(runs.length > 0);
      assertNoProjection(f);
    });

  test('P3a a selection before the grant answers STALE_BINDING and writes nothing local',
    async (t) => {
      const f = await fixture(t);
      await bootstrapGroup(f);
      await initialize(f);
      const binding = f.metadata.intent.consensusBinding;
      const next = await f.metadata.primary.selectConsensusInstance(
        f.metadata.request(1, 2, binding.incarnation));
      assert.equal(next.outcome, 'SELECTED');
      const result = await startAndDeliver(f, f.hosts[0]);
      assert.equal(result.status, STATUS_HELD);
      assert.equal(result.grant.outcome, 'STALE_BINDING');
      assert.equal(localRecord(f.leader.dbPath).phase, 'ADMITTED', 'STALE_GRANT_WROTE_LOCAL');
      assert.equal(f.leader.servingState, HELD);
      assert.equal(instanceOf(f, binding).resources[0].phase, 'ADMITTED');
      assertNoProjection(f);
    });

  test('P3b a selection inside the held grant CAS window answers STALE_BINDING', async (t) => {
    const f = await fixture(t);
    await bootstrapGroup(f);
    await initialize(f);
    const binding = f.metadata.intent.consensusBinding;
    const held = f.metadata.holdNext('owner-a');
    t.after(held.release);
    const pending = beginStart(f, f.hosts[0]);
    await enteredBefore(held.entered, pending.promise, 'GRANT_CAS_NEVER_ATTEMPTED');
    const next = await f.metadata.primary.selectConsensusInstance(
      f.metadata.request(1, 2, binding.incarnation));
    assert.equal(next.outcome, 'SELECTED');
    held.release();
    const result = await pending.promise;
    assert.equal(result.status, STATUS_HELD);
    assert.equal(result.grant.outcome, 'STALE_BINDING', JSON.stringify(result.grant));
    assert.equal(localRecord(f.leader.dbPath).phase, 'ADMITTED');
    assert.equal(f.leader.servingState, HELD);
    assertNoProjection(f);
  });

  test('P4 retirement fences user work at call, RELEASING precedes RETIRED, RETIRED precedes CLOSED',
    async (t) => {
      const {f} = await publishedGroup(t);
      const host = f.hosts[2];
      const replica = host.replica;
      const path = replica.dbPath;
      const token = tokenOf(f, host);
      const probe = fenceProbe(replica);
      const owner = f.metadata.primary;
      const order = [];
      const release = owner.releaseInstanceResource.bind(owner);
      owner.releaseInstanceResource = async (...args) => {
        const answer = await release(...args);
        order.push({step: 'release', answer, local: localRecord(path).phase});
        return answer;
      };
      const close = owner.closeInstanceResource.bind(owner);
      owner.closeInstanceResource = async (...args) => {
        order.push({step: 'close', local: localRecord(path).phase, slot: slotPhase(f, host)});
        return close(...args);
      };
      const retired = await f.retire(host);
      assert.deepEqual(await probe.read, REFUSED_SHUTDOWN, 'READ_ADMITTED_AFTER_THE_STOP_FENCE');
      assert.deepEqual(await probe.proposal, {admitted: false, reason: 'WRITER_SHUTDOWN'},
        'ASYNC_PROPOSAL_ADMITTED_AFTER_THE_STOP_FENCE');
      assert.equal(retired.closed, true, JSON.stringify(retired));
      assert.equal(retired.release.outcome, 'RELEASING');
      assert.deepEqual(order.map((entry) => entry.step), ['release', 'close']);
      assert.notEqual(order[0].local, 'RETIRED', 'TOMBSTONE_PRECEDED_RELEASING');
      assert.equal(order[1].local, 'RETIRED', 'CLOSED_REQUESTED_BEFORE_LOCAL_RETIRED');
      assert.equal(order[1].slot, 'RELEASING');
      assert.equal(slotPhase(f, host), 'CLOSED');
      const wakes = retirementHandleWake(host, host.intent.consensusBinding);
      assert.equal(wakes.length, 1);
      assert.deepEqual(wakes[0].token, token);
      assert.equal(retired.wake.outcome, 'DELIVERED');
      assert.equal(replica.db, null);
      assert.equal(replica.raft, null);
      assert.equal(host.lifecycle.getReplica(f.metadata.serviceId), null);
      const record = localRecord(path);
      assert.equal(record.phase, 'RETIRED');
      assert.deepEqual(record.grant.token, token, 'retirement keeps the recorded grant');
      // P7: stale native callbacks of the retired instance enqueue nothing.
      const enqueues = replica.observed.enqueues;
      await deliverScheduled(f);
      assert.equal(replica.observed.enqueues, enqueues, 'STALE_CALLBACK_ENQUEUED_AFTER_RETIREMENT');
      assert.equal(replica.creationReconciliation.queue.stopped, true);
      // Metadata CLOSED refuses a new opening before any file handle; the file
      // itself refuses a retained reopen typed.
      const again = await f.bootstrap(host);
      assert.equal(again.outcome, 'RESOURCE_CLOSED', JSON.stringify(again));
      assert.equal(host.lifecycle.getReplica(f.metadata.serviceId), null);
      const db = new Database(path, {fileMustExist: true});
      try {
        const retained = {...replica, db,
          creationOpening: {...replica.creationOpening, outcome: OPENING.RETAINED}};
        assert.throws(() => openWasmCreationRecords(retained),
          {outcome: 'wasm_service_creation_retired'});
      } finally {
        db.close();
      }
      assertNoProjection(f);
    });

  test('P5a a lost CLOSED reply is resolved by the metadata owner itself', async (t) => {
    const {f} = await publishedGroup(t);
    const host = f.hosts[1];
    f.metadata.primary.closeInstanceResource = ((close) => (...args) => {
      f.metadata.loseReply('owner-a');
      return close(...args);
    })(f.metadata.primary.closeInstanceResource.bind(f.metadata.primary));
    const retired = await f.retire(host);
    assert.equal(retired.closed, true, JSON.stringify(retired));
    assert.equal(f.metadata.appliedLostReplies.length, 1);
    assert.equal(slotPhase(f, host), 'CLOSED');
    assert.equal(retirementHandleWake(host, host.intent.consensusBinding).length, 1);
  });

  test('P5b an unresolved CLOSED keeps custody; a re-stop by creation resolves with no new mutation',
    async (t) => {
      const {f} = await publishedGroup(t);
      const host = f.hosts[1];
      const owner = f.metadata.primary;
      const close = owner.closeInstanceResource.bind(owner);
      let faulted = false;
      owner.closeInstanceResource = (...args) => {
        if (!faulted) {
          faulted = true;
          f.metadata.loseReply('owner-a', () =>
            f.metadata.setGatewayReadFault('owner-a', new Error(FAULT)));
        }
        return close(...args);
      };
      const first = await f.retire(host);
      assert.equal(first.closed, false, JSON.stringify(first));
      assert.equal(first.outcome, 'CLOSE_UNRESOLVED');
      assert.equal(first.close.outcome, 'UNKNOWN');
      assert.equal(first.retired, true);
      assert.equal(creationRow(f, host).state, 'in_progress');
      assert.equal(f.metadata.db.prepare('SELECT count(*) n FROM wasm_operations').get().n, 3,
        'THE_BOUND_STOP_WROTE_A_GENERIC_STOP_ROW');
      assert.equal(retirementHandleWake(host, host.intent.consensusBinding).length, 0);
      f.metadata.setGatewayReadFault('owner-a', null);
      const mutations = serviceInstanceMutations(f);
      const second = await f.retire(host);
      assert.equal(second.closed, true, JSON.stringify(second));
      assert.equal(second.tombstone.outcome, 'ALREADY');
      assert.equal(serviceInstanceMutations(f), mutations, 'RE_STOP_MUTATED_A_CLOSED_SLOT');
      assert.equal(retirementHandleWake(host, host.intent.consensusBinding).length, 1);
      assertNoProjection(f);
    });

  test('P5c a re-stop of the predecessor retires its file by creation and never touches a successor',
    async (t) => {
      const {f} = await publishedGroup(t);
      const host = f.hosts[1];
      const prior = host.intent;
      const owner = f.metadata.primary;
      const close = owner.closeInstanceResource.bind(owner);
      let faulted = false;
      owner.closeInstanceResource = (...args) => {
        if (!faulted) {
          faulted = true;
          f.metadata.loseReply('owner-a', () =>
            f.metadata.setGatewayReadFault('owner-a', new Error(FAULT)));
        }
        return close(...args);
      };
      assert.equal((await f.retire(host)).outcome, 'CLOSE_UNRESOLVED');
      f.metadata.setGatewayReadFault('owner-a', null);
      const next = await owner.selectConsensusInstance(
        f.metadata.request(1, 2, prior.consensusBinding.incarnation));
      assert.equal(next.outcome, 'SELECTED');
      host.intent = f.successorIntent(prior.consensusSlotRequest.slot, next.binding);
      assert.equal((await f.bootstrap(host)).status, STATUS_HELD);
      const successor = host.lifecycle.getReplica(f.metadata.serviceId);
      assert.equal(successor.consensusCreation.token.operationId,
        host.intent.consensusSlotRequest.operationId);
      const again = await host.manager.stopReplica(f.handle(host, prior));
      assert.equal(again.closed, true, JSON.stringify(again));
      assert.equal(host.lifecycle.getReplica(f.metadata.serviceId), successor,
        'PREDECESSOR_RETIREMENT_TOUCHED_THE_SUCCESSOR');
      assert.equal(successor.lifecycleState, 'ready');
      assert.equal(localRecord(successor.dbPath).phase, 'ADMITTED');
    });

  test('P6a orderly shutdown keeps the grant; a reopen serves after the open-time metadata check',
    async (t) => {
      const {f} = await publishedGroup(t);
      const host = f.hosts[2];
      const path = host.replica.dbPath;
      await host.runtime.shutdown();
      host.processOwner.release();
      assert.equal(localRecord(path).phase, 'PUBLISHED', 'ORDERLY_STOP_TOMBSTONED_THE_RESOURCE');
      assert.equal(slotPhase(f, host), 'PUBLISHED');
      const reopened = await f.addHost(host.intent.consensusSlotRequest.slot, host.intent);
      const mutations = serviceInstanceMutations(f);
      const result = await startAndDeliver(f, reopened);
      assert.equal(result.status, STATUS_PUBLISHED, JSON.stringify(result));
      assert.equal(reopened.replica.servingState, SERVED);
      assert.equal(reopened.replica.creationReconciliation.subscriptions.length, 0,
        'A_REPLICA_OPENED_SERVING_BOUND_NATIVE_EVENTS');
      assert.equal(serviceInstanceMutations(f), mutations, 'REOPEN_REGRANT_MUTATED_METADATA');
      assert.equal(reopened.wakes.length, 0);
      const read = await reopened.replica.handleMessage({payload: {operation: 'read',
        sessionId: 'session', key: 'p6'}});
      assert.equal(typeof read.forwarded, 'boolean', `REOPENED_GRANT_DID_NOT_SERVE ${JSON.stringify(read)}`);
      assertNoProjection(f);
    });

  test('P6b a reopen after the slot was CLOSED is refused and the next retire tombstones the file',
    async (t) => {
      const {f} = await publishedGroup(t);
      const host = f.hosts[2];
      const path = host.replica.dbPath;
      await host.runtime.shutdown();
      host.processOwner.release();
      const token = tokenOf(f, host);
      assert.equal((await f.metadata.primary.closeInstanceResource(
        host.intent.consensusBinding, token)).outcome, 'CLOSED');
      const reopened = await f.addHost(host.intent.consensusSlotRequest.slot, host.intent);
      const refused = await f.bootstrap(reopened);
      assert.equal(refused.outcome, 'RESOURCE_CLOSED', JSON.stringify(refused));
      assert.equal(reopened.lifecycle.getReplica(f.metadata.serviceId), null);
      assert.equal(localRecord(path).phase, 'PUBLISHED');
      const retired = await f.retire(reopened);
      assert.equal(retired.closed, true, JSON.stringify(retired));
      assert.equal(retired.tombstone.outcome, 'RETIRED');
      assert.equal(localRecord(path).phase, 'RETIRED');
    });

  test('P9 a retirement during an in-flight grant enables nothing and closes the slot', async (t) => {
    const f = await fixture(t, {tolerateRetiredAddress: true});
    const runs = observe(f);
    await bootstrapGroup(f);
    await initialize(f);
    const host = f.hosts[0];
    const replica = host.replica;
    const held = f.metadata.holdNext('owner-a', {afterApply: true});
    t.after(held.release);
    const start = beginStart(f, host);
    await enteredBefore(held.entered, start.promise, 'GRANT_CAS_NEVER_ATTEMPTED');
    assert.equal(slotPhase(f, host), 'PUBLISHED', 'the grant applied; only its answer is late');
    const owner = f.metadata.primary;
    const releasing = Promise.withResolvers();
    const release = owner.releaseInstanceResource.bind(owner);
    owner.releaseInstanceResource = async (...args) => {
      const answer = await release(...args);
      releasing.resolve(answer);
      return answer;
    };
    const retirement = f.retire(host);
    await enteredBefore(releasing.promise, retirement, 'RELEASING_NEVER_ATTEMPTED');
    assert.equal((await releasing.promise).outcome, 'RELEASING');
    held.release();
    const retired = await retirement;
    const started = await start.promise;
    assert.equal(retired.closed, true, JSON.stringify(retired));
    assert.notEqual(started.status, STATUS_PUBLISHED, JSON.stringify(started));
    const record = localRecord(replica.dbPath);
    assert.equal(record.phase, 'RETIRED');
    assert.equal(record.grant, null, 'A_GRANT_LANDED_LOCALLY_AFTER_THE_STOP_FENCE');
    assert.notEqual(replica.servingState, SERVED);
    assert.equal(replica._safetyBroadcastTimer, null, 'LEAKED_SAFETY_BROADCAST_INTERVAL');
    assert.equal(replica.timerManager.activeTimers.size, 0);
    assert.ok(runs.some((run) => run.replica === replica &&
      run.result.outcome === 'GENESIS_HELD' && run.result.reason === 'WRITER_SHUTDOWN'));
    assert.equal(slotPhase(f, host), 'CLOSED');
    assertNoProjection(f);
  });

  test('P10 a START re-entry while the retirement is in flight is refused typed', async (t) => {
    const {f} = await publishedGroup(t);
    const host = f.hosts[1];
    const replica = host.replica;
    const held = f.metadata.holdNext('owner-a');
    t.after(held.release);
    const retirement = f.retire(host);
    await enteredBefore(held.entered, retirement, 'RETIREMENT_NEVER_REACHED_RELEASING');
    assert.equal(replica.lifecycleState, 'stopping');
    const reentry = await f.bootstrap(host);
    assert.notEqual(reentry.status, STATUS_PUBLISHED, JSON.stringify(reentry));
    assert.notEqual(reentry.status, STATUS_HELD, JSON.stringify(reentry));
    assert.equal(host.lifecycle.retiringReplicas.has(replica), true);
    assert.equal(host.lifecycle.getReplica(f.metadata.serviceId), replica,
      'A_SECOND_INSTANCE_OPENED_THE_RETIRING_FILE');
    held.release();
    assert.equal((await retirement).closed, true);
  });

  test('P11 a forged PUBLISHED or RUNNING driver answer never becomes serving presentation',
    async (t) => {
      const f = await fixture(t);
      const host = await f.addHost(0);
      host.driver.start = async (context) => ({status: STATUS_PUBLISHED, started: true,
        bootstrapped: true, port: 1,
        consensusBinding: context.consensusCreation.intent.consensusBinding,
        consensusResourceToken: context.consensusCreation.token});
      const forged = await f.bootstrap(host);
      assert.equal(forged.outcome, 'UNKNOWN', JSON.stringify(forged));
      assert.equal(forged.reason, 'CONTENT_CONFLICT');
      assert.notEqual(host.manager._replicaStateById.get(host.intent.descriptor.replicaId),
        'running', 'FORGED_PUBLISHED_BECAME_RUNNING');
      assert.equal(slotPhase(f, host), 'CLOSED', 'the contradicted resource is retired by creation');
      assertNoProjection(f);
    });

  test('P11b a RUNNING claim carrying the exact binding and token is refused before any re-resolve',
    async (t) => {
      const f = await fixture(t);
      const host = await f.addHost(0);
      let resolves = 0;
      const owner = f.metadata.primary;
      host.driver.start = async (context) => {
        const resolve = owner.resolveInstanceResource.bind(owner);
        owner.resolveInstanceResource = (...args) => {
          resolves += 1;
          return resolve(...args);
        };
        return {status: 'running', started: true, port: 1,
          consensusBinding: context.consensusCreation.intent.consensusBinding,
          consensusResourceToken: context.consensusCreation.token};
      };
      const answer = await f.bootstrap(host);
      assert.equal(answer.outcome, 'UNKNOWN', JSON.stringify(answer));
      assert.equal(answer.reason, 'CONSENSUS_SERVING_NOT_IMPLEMENTED',
        'A_RUNNING_CLAIM_WAS_ACCEPTED_AS_PUBLISHED');
      assert.equal(resolves, 0);
      assert.equal(slotPhase(f, host), 'ADMITTED');
    });

  test('P12 the first admitted user message finds the local grant already durable', async (t) => {
    const f = await fixture(t, {automaticReconciliation: true, creationWake: reenterOnWake});
    for (let slot = 0; slot < 3; slot += 1) {
      const host = await f.addHost(slot);
      assert.equal((await f.bootstrap(host)).status, STATUS_HELD);
      f.replicas.push(host.replica);
      f.clocks.push(host.timeSource);
    }
    const leader = f.hosts[0];
    const observed = [];
    const kvStore = leader.replica.kvStore;
    const get = kvStore.get.bind(kvStore);
    kvStore.get = (...args) => {
      observed.push(localRecord(leader.replica.dbPath).phase);
      return get(...args);
    };
    const early = await leader.replica.handleMessage({payload: {operation: 'read',
      sessionId: 'session', key: 'p12'}});
    assert.deepEqual(early, HELD_REFUSAL);
    assert.deepEqual(observed, []);
    await formGroup(f);
    await settle(f);
    assert.equal(leader.replica.servingState, SERVED);
    const served = await leader.replica.handleMessage({payload: {operation: 'read',
      sessionId: 'session', key: 'p12'}});
    assert.equal(served.forwarded, false, JSON.stringify(served));
    assert.ok(observed.length > 0, 'NO_USER_MESSAGE_WAS_ADMITTED_AFTER_PUBLICATION');
    assert.equal(observed[0], 'PUBLISHED', 'USER_WORK_ADMITTED_BEFORE_THE_LOCAL_GRANT');
  });
});

describe('6double-prime: held grants, election changes, lost answers and absent consumers', () => {
  test('P13 an unavailable grant wakes once per held run typed and is never retried by the lifecycle',
    async (t) => {
      const f = await fixture(t, {automaticReconciliation: true, creationWake: reenterOnWake});
      const runs = observe(f);
      for (let slot = 0; slot < 3; slot += 1) {
        const host = await f.addHost(slot);
        assert.equal((await f.bootstrap(host)).status, STATUS_HELD);
        f.replicas.push(host.replica);
        f.clocks.push(host.timeSource);
      }
      const owner = f.metadata.primary;
      let grants = 0;
      const grant = owner.grantInstanceResource.bind(owner);
      owner.grantInstanceResource = (...args) => {
        grants += 1;
        return grant(...args);
      };
      f.metadata.setGatewayReadFault('owner-a', new Error(FAULT));
      await formGroup(f);
      await settle(f);
      for (const host of f.hosts) {
        assert.equal(host.replica.servingState, HELD);
        const heldRuns = runs.filter((run) => run.replica === host.replica &&
          run.result.grant?.outcome === 'UNAVAILABLE');
        assert.ok(heldRuns.length > 0, `${host.nodeId} never attempted the grant`);
        assert.equal(host.wakes.length, heldRuns.length, 'NOT_ONE_WAKE_PER_HELD_RUN');
        assert.ok(host.wakes.every((wake) => wake.reason === WAKE_GRANT_HELD &&
          wake.grant.outcome === 'UNAVAILABLE'));
        assert.equal(slotPhase(f, host), 'ADMITTED');
        // Stage-1 verifier finding F-M1 (design D6'): a HELD replica keeps its
        // native subscriptions until the local grant lands.
        assert.ok(host.replica.creationReconciliation.subscriptions.length > 0,
          'A_HELD_REPLICA_RETIRED_ITS_NATIVE_SUBSCRIPTIONS');
      }
      const attempted = grants;
      await settle(f);
      assert.equal(grants, attempted, 'THE_LIFECYCLE_RETRIED_A_HELD_GRANT_BY_ITSELF');
      f.metadata.setGatewayReadFault('owner-a', null);
      for (const host of f.hosts) {
        assert.equal((await startAndDeliver(f, host)).status, STATUS_PUBLISHED);
        assert.equal(host.replica.servingState, SERVED);
      }
    });

  test('P14 leadership LEADER -> FOLLOWER -> LEADER across a held grant replays effects once',
    async (t) => {
      const f = await fixture(t);
      observe(f);
      await bootstrapGroup(f);
      await initialize(f);
      const host = f.hosts[0];
      const held = f.metadata.holdNext('owner-a');
      t.after(held.release);
      const start = beginStart(f, host);
      await enteredBefore(held.entered, start.promise, 'GRANT_CAS_NEVER_ATTEMPTED');
      await transferLeadership(f, f.replicas[0], f.replicas[1]);
      assert.equal(host.replica.isLeader, false);
      await transferLeadership(f, f.replicas[1], f.replicas[0]);
      assert.equal(f.replicas[1].isLeader, false);
      for (const replica of f.replicas) assert.equal(replica.observed.reconstructs, 0);
      held.release();
      const result = await start.promise;
      assert.equal(result.status, STATUS_PUBLISHED, JSON.stringify(result));
      assert.equal(host.replica.observed.reconstructs, 1, 'LEADER_EFFECTS_NOT_REPLAYED_ONCE');
      assert.notEqual(host.replica._safetyBroadcastTimer, null);
      for (const replica of f.replicas.slice(1)) {
        assert.equal(replica.observed.reconstructs, 0);
        assert.equal(replica._safetyBroadcastTimer, null, 'A_HELD_FOLLOWER_KEPT_LEADER_EFFECTS');
      }
    });

  test('P15 a lost grant reply resolves to PUBLISHED inside the owner: one write, one wake',
    async (t) => {
      const f = await fixture(t, {automaticReconciliation: true, creationWake: reenterOnWake});
      for (let slot = 0; slot < 3; slot += 1) {
        const host = await f.addHost(slot);
        assert.equal((await f.bootstrap(host)).status, STATUS_HELD);
        f.replicas.push(host.replica);
        f.clocks.push(host.timeSource);
      }
      const before = serviceInstanceMutations(f);
      f.metadata.loseReply('owner-a');
      await formGroup(f);
      await settle(f);
      assert.equal(f.metadata.appliedLostReplies.length, 1);
      assert.equal(serviceInstanceMutations(f) - before, 3, 'A_LOST_GRANT_WAS_MUTATED_TWICE');
      for (const host of f.hosts) {
        assert.equal(host.replica.servingState, SERVED);
        assert.equal(localRecord(host.replica.dbPath).phase, 'PUBLISHED');
        assertOneOwnerWake(host);
        assert.equal(host.reentries, 1);
      }
    });

  test('P16 a failed local RETIRED write blocks CLOSED while the handles stay open', async (t) => {
    const {f} = await publishedGroup(t);
    const host = f.hosts[1];
    const replica = host.replica;
    const db = replica.db;
    const prepare = db.prepare.bind(db);
    let failing = true;
    // Fault only the receiver-local record write on the replica's connection;
    // the native durable store's own statements are untouched.
    db.prepare = (sql, ...rest) => {
      if (failing && /^UPDATE _wasm_creation_local\b/u.test(sql.trim())) {
        throw new Error('INJECTED_LOCAL_TOMBSTONE_FAULT');
      }
      return prepare(sql, ...rest);
    };
    const owner = f.metadata.primary;
    let closes = 0;
    const close = owner.closeInstanceResource.bind(owner);
    owner.closeInstanceResource = (...args) => {
      closes += 1;
      return close(...args);
    };
    const first = await f.retire(host);
    assert.equal(first.closed, false, JSON.stringify(first));
    assert.equal(first.retired, false);
    assert.equal(first.outcome, 'wasm_service_retirement_blocked_cleanup_required');
    assert.match(first.failure.message, /INJECTED_LOCAL_TOMBSTONE_FAULT/u);
    assert.equal(closes, 0, 'CLOSED_ATTEMPTED_WITHOUT_A_DURABLE_TOMBSTONE');
    assert.equal(replica.lifecycleState, 'cleanup-required');
    assert.equal(replica.db.open, true);
    assert.equal(slotPhase(f, host), 'RELEASING');
    const blocked = await f.retire(host);
    assert.equal(blocked.outcome, 'wasm_service_retirement_blocked_cleanup_required');
    assert.equal(closes, 0);
    failing = false;
    const retired = await f.retire(host);
    assert.equal(retired.closed, true, JSON.stringify(retired));
    assert.equal(localRecord(replica.dbPath).phase, 'RETIRED');
    assert.equal(slotPhase(f, host), 'CLOSED');
  });

  test('P17 an explicit START that observes genesis publishes and fires no wake', async (t) => {
    const f = await fixture(t, {creationWake: reenterOnWake});
    await bootstrapGroup(f);
    await initialize(f);
    const result = await startAndDeliver(f, f.hosts[0]);
    assert.equal(result.status, STATUS_PUBLISHED, JSON.stringify(result));
    assert.equal(result.started, true);
    assert.deepEqual(f.hosts[0].wakes, [], 'A_WAITED_START_ALSO_WOKE_ITS_OWNER');
    assert.equal(f.hosts[0].reentries, 0);
    assert.equal(f.leader.servingState, SERVED);
    assert.deepEqual(initialization(f.metadata.intent.consensusBinding),
      f.leader.writerState.meta().initialization.command);
  });

  test('P18 an absent wake consumer is a typed CONSUMER_ABSENT outcome, never silence', async (t) => {
    const f = await fixture(t, {automaticReconciliation: true, tolerateRetiredAddress: true});
    const runs = observe(f);
    await bootstrapGroup(f);
    await settle(f);
    for (const host of f.hosts) {
      // Every event run that published, or held its grant, answered the
      // absent consumer typed; with no consumer nothing re-entered START.
      // Superseded by design amendment A2 as revised by A2' (A2'.7): "a grant
      // that lost its CAS to a sibling stays typed-held (N7)" - the owner
      // re-decides the lost CAS, so every founder serves from native events.
      const decisive = runs.filter((run) => run.replica === host.replica &&
        (run.result.outcome === 'GENESIS_PUBLISHED' || run.result.grant !== undefined));
      assert.ok(decisive.length > 0, `${host.nodeId} never attempted publication`);
      assert.ok(decisive.every((run) => run.result.wake?.outcome === 'CONSUMER_ABSENT'),
        JSON.stringify(decisive.map((run) => run.result.wake)));
      assert.equal(host.result.status, STATUS_HELD, 'without a consumer nothing re-entered START');
      assert.equal(host.replica.servingState, SERVED, `${host.nodeId} was held by a sibling`);
      assert.equal(host.replica.heldCreationRefusal(), null);
    }
    const retired = await f.retire(f.hosts[0]);
    assert.equal(retired.closed, true);
    assert.deepEqual(retired.wake, {outcome: 'CONSUMER_ABSENT'});
  });

  // Design amendment A2 as revised by A2' (A2'.4, A2'.7): the founders of one
  // published group retire concurrently through one metadata owner; each lost
  // RELEASING/CLOSED CAS is re-decided by the owner, so every retirement closes
  // in one pass (bounded claim: at most RESOURCES concurrent retirements).
  test('P19 a concurrent retirement of every founder closes each slot in one pass',
    async (t) => {
      const {f} = await publishedGroup(t);
      const binding = f.hosts[0].intent.consensusBinding;
      const paths = f.hosts.map((host) => host.replica.dbPath);
      const from = f.metadata.writes.length;
      const results = await Promise.all(f.hosts.map((host) => f.retire(host)));
      for (const [index, retired] of results.entries()) {
        const host = f.hosts[index];
        assert.equal(retired.closed, true, JSON.stringify(retired));
        assert.equal(retired.outcome, 'CLOSED', 'A_CONCURRENT_RETIREMENT_LEFT_CLOSE_UNRESOLVED');
        assert.ok(['RELEASING', 'CLOSED'].includes(retired.release.outcome),
          JSON.stringify(retired.release));
        // A live replica is tombstoned on its open connection inside the
        // shutdown (N15, A1), so the by-path step after it answers ALREADY;
        // the durable oracle is the local record read by a second connection.
        assert.equal(retired.tombstone.outcome, 'ALREADY', JSON.stringify(retired.tombstone));
        assert.equal(localRecord(paths[index]).phase, 'RETIRED');
        assert.equal(slotPhase(f, host), 'CLOSED');
        assert.equal(retirementHandleWake(host, binding).length, 1,
          'NOT_ONE_RESOURCE_CLOSED_WAKE_PER_FOUNDER');
      }
      assert.ok(f.metadata.writes.slice(from).some((write) =>
        ENGAGED_ZERO_ROW_UPDATE.test(write.sql) && write.changes === 0),
      'THE_CONCURRENT_RETIREMENT_RACE_NEVER_ENGAGED');
      for (const host of f.hosts) await Promise.all(host.reentryResults.splice(0));
      assertNoProjection(f);
    });

  // A2'.4/A2'.7: bound exhaustion through the lifecycle is the explicit typed
  // STATE_CHANGED, carried by one CREATION_GRANT_HELD wake per held run (N7
  // unchanged) and re-driven by an explicit START, never by the lifecycle.
  test('P20 a bound-exhausted grant holds typed STATE_CHANGED and an explicit START publishes',
    async (t) => {
      const f = await fixture(t, {automaticReconciliation: true, creationWake: reenterOnWake});
      const runs = observe(f);
      for (let slot = 0; slot < 3; slot += 1) {
        const host = await f.addHost(slot);
        assert.equal((await f.bootstrap(host)).status, STATUS_HELD);
        f.replicas.push(host.replica);
        f.clocks.push(host.timeSource);
      }
      const owner = f.metadata.primary;
      let grants = 0;
      const grant = owner.grantInstanceResource.bind(owner);
      owner.grantInstanceResource = (...args) => {
        grants += 1;
        return grant(...args);
      };
      const gateway = owner.getGateway();
      const update = gateway.updateSystemTableRow.bind(gateway);
      let exhausting = true;
      let zeroRowAnswers = 0;
      gateway.updateSystemTableRow = async (table, ...rest) => {
        if (exhausting && table === 'service_instances') {
          zeroRowAnswers += 1;
          return {success: true, affectedRows: 0};
        }
        return update(table, ...rest);
      };
      await formGroup(f);
      await settle(f);
      assert.ok(grants > 0, 'NO_GRANT_WAS_ATTEMPTED');
      assert.equal(zeroRowAnswers, grants * SERVICE_INSTANCE_LIMIT.RESOURCES,
        'NOT_THE_DECLARED_SUBMISSION_BOUND_PER_GRANT');
      for (const host of f.hosts) {
        assert.equal(host.replica.servingState, HELD);
        const heldRuns = runs.filter((run) => run.replica === host.replica &&
          run.result.grant?.outcome === 'STATE_CHANGED');
        assert.ok(heldRuns.length > 0, `${host.nodeId} never exhausted the bound`);
        assert.equal(host.wakes.length, heldRuns.length, 'NOT_ONE_WAKE_PER_HELD_RUN');
        assert.ok(host.wakes.every((wake) => wake.reason === WAKE_GRANT_HELD &&
          wake.grant.outcome === 'STATE_CHANGED'), JSON.stringify(host.wakes));
        assert.equal(host.reentries, 0, 'A_GRANT_HELD_WAKE_WAS_RETRIED_BY_THE_CONSUMER');
        assert.equal(slotPhase(f, host), 'ADMITTED');
        assert.equal(localRecord(host.replica.dbPath).phase, 'ADMITTED', 'HELD_GRANT_WROTE_LOCAL');
      }
      exhausting = false;
      for (const host of f.hosts) {
        assert.equal((await startAndDeliver(f, host)).status, STATUS_PUBLISHED);
        assert.equal(host.replica.servingState, SERVED);
      }
      assertNoProjection(f);
    });
});
