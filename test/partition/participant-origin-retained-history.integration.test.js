// Real native command history, not the 141-member original-allocation or public
// startup proof. No history is edited: one application callback fails, or one
// exact native commit carrier is held, while native persistence runs normally.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {enableParticipantTransactionAdmission} from
  '../../src/partition/partition-participant-transaction-request.js';
import {readPartitionWriteOrigin, readPartitionWriteOriginHistory} from
  '../../src/partition/partition-participant-transaction-store.js';
import {PARTICIPANT_TRANSACTION_COMMAND as COMMAND,
  PARTICIPANT_ORIGIN_HISTORY_STATE as ORIGIN} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {raftRsConfStateKey} from '../../src/raft/raft-rs-conf-state-key.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_MESSAGE_TYPE, RAFT_RS_TRANSPORT_PROTOCOL} from
  '../../src/raft/raft-rs-ingress-constants.js';
import {durableRecordBootstrap} from '../../src/raft/raft-committed-membership-stamp.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {createLoopbackTransport, waitForCondition} from './partition-service-test-support.js';

const NODE_ID = 'retained-origin-node';
const TABLE_NAME = 'retained_origin_rows';
const TEST_TIMEOUT_MS = 30000;
const GROUP_BUDGET_MS = 10000;
const GROUP_TIMING = Object.freeze({heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300});
const APPLICATION_FAULT = 'retained origin application held by witness';

function environment(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID},
    logging: {level: 'fatal'}, raft: GROUP_TIMING});
  LoggingService.getInstance().initialize({level: 'fatal'});
  t.after(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
}

function tableOptions() {
  return {tableId: TABLE_NAME, tableName: TABLE_NAME,
    schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'}]}};
}

function passive(dbPath, partitionId) {
  const db = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    const before = db.serialize();
    const native = RaftRsDurableStore.readRetainedHistoryIn(db, partitionId);
    const origin = readPartitionWriteOriginHistory(db, partitionId);
    assert.deepEqual(db.serialize(), before, 'inspection writes no SQLite bytes');
    assert.equal(db.inTransaction, false, 'inspection settles its read snapshot');
    return {native, origin};
  } finally {
    db.close();
  }
}

function holdOriginApplication(service) {
  const original = service.applyCommittedEntry;
  const reached = Promise.withResolvers();
  let armed = true;
  let failures = 0;
  const wrapper = function(committed) {
    if (armed && committed.command?.type === COMMAND.GENERATION_ORIGIN) {
      failures++;
      reached.resolve(committed);
      throw new Error(APPLICATION_FAULT);
    }
    return Reflect.apply(original, this, [committed]);
  };
  service.applyCommittedEntry = wrapper;
  return {reached: reached.promise, failures: () => failures,
    restore() {
      armed = false;
      assert.equal(service.applyCommittedEntry, wrapper);
      service.applyCommittedEntry = original;
    }};
}

function pendingOrigin(view, state) {
  assert.equal(view.origin.state, state, JSON.stringify(view.origin));
  assert.equal(view.origin.appliedOrigin, null);
  const entries = state === ORIGIN.COMMITTED_PENDING ?
    view.origin.committedPending : view.origin.locallyUncommitted;
  assert.equal(entries.length, 1);
  const [entry] = entries;
  assert.equal(entry.command.type, COMMAND.GENERATION_ORIGIN);
  assert.ok(BigInt(view.native.appliedIndex) < BigInt(entry.index));
  if (state === ORIGIN.COMMITTED_PENDING) {
    assert.ok(BigInt(entry.index) <= BigInt(view.native.commitIndex));
  } else {
    assert.ok(BigInt(entry.index) > BigInt(view.native.commitIndex));
  }
  return entry;
}

function settledGroup(group, members, partitionId, observation) {
  const views = members.map((member) => passive(group.dbFileOf(member), partitionId));
  if (observation !== undefined) observation.views = views;
  const first = views[0].native;
  return views.every(({native, origin}) => origin.state === ORIGIN.PRE_ORIGIN &&
    native.appliedIndex === first.appliedIndex && native.commitIndex === first.appliedIndex &&
    native.lastIndex === first.appliedIndex &&
    native.record.hardState.term === first.record.hardState.term &&
    raftRsConfStateKey(native.record.confState) ===
      raftRsConfStateKey(first.record.confState)) ? first : null;
}

// The leader's packet to exactly this follower, in the leader's term.
function isLeaderPacketToFollower(address, packet, carrier) {
  return address === carrier.address &&
    packet?.protocol === RAFT_RS_TRANSPORT_PROTOCOL &&
    packet.groupId === carrier.partitionId && String(packet.from) === carrier.leaderPeer &&
    String(packet.to) === carrier.followerPeer &&
    String(packet.message?.term) === carrier.term;
}

// An APPEND or HEARTBEAT that advances the follower's commit index.
function carriesCommitBeyond(message, commitIndex) {
  return (message?.msgType === RAFT_RS_MESSAGE_TYPE.APPEND ||
    message?.msgType === RAFT_RS_MESSAGE_TYPE.HEARTBEAT) &&
    BigInt(message.commit ?? '0') > BigInt(commitIndex);
}

function isFollowerCommitCarrier([address, packet], carrier) {
  return isLeaderPacketToFollower(address, packet, carrier) &&
    carriesCommitBeyond(packet.message, carrier.commitIndex);
}

async function closeServices(services, pending, directory) {
  const settled = await Promise.allSettled(services.map((service) => service.shutdown()));
  const errors = settled.filter(({status}) => status === 'rejected').map(({reason}) => reason);
  if (errors.length > 0) {
    throw new AggregateError(errors, `shutdown incomplete; retained directory ${directory}`);
  }
  await Promise.allSettled(pending);
  fs.rmSync(directory, {recursive: true, force: true});
}

test('a real committed ENABLE remains pending through cold inspection and replays its exact origin',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    environment(t);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retained-origin-cold-'));
    const partitionId = 'retained-origin-rf1';
    const replicaId = `${partitionId}-r1`;
    const options = {...tableOptions(), partitionId, replicaId, replicaIds: [replicaId],
      nodeId: NODE_ID, deferElection: true, transport: createLoopbackTransport(),
      dbPath: path.join(directory, 'partition.sqlite')};
    const services = [];
    const pending = [];
    t.after(() => closeServices(services, pending, directory));
    const first = new PartitionService(withFoundingStamp(options));
    services.push(first);
    await first.initialize();
    await first.raft.campaign();
    assert.equal(first.raft.readStatus().role, RAFT_ROLE.LEADER);
    assert.equal(readPartitionWriteOrigin(first.db), null);
    const firstResources = {db: first.db, port: first.raft, handler: first.transportHandler};
    assert.equal(first.transport.getRegisteredHandler(first.unifiedAddress),
      firstResources.handler);
    const fault = holdOriginApplication(first);
    const enabling = enableParticipantTransactionAdmission(first);
    pending.push(enabling);
    void enabling.catch(() => undefined);
    assert.equal(await waitForCondition(() => fault.failures() > 0, GROUP_BUDGET_MS), true,
      'the actual committed ENABLE reaches application within the witness budget');
    const actual = await fault.reached;
    const held = passive(options.dbPath, partitionId);
    const retained = pendingOrigin(held, ORIGIN.COMMITTED_PENDING);
    assert.equal(retained.index, String(actual.index));
    assert.equal(retained.term, String(actual.term));
    assert.deepEqual(retained.command, actual.command);
    assert.ok(fault.failures() > 0, 'the actual native application callback was engaged');
    const durableEntries = held.native.record.entries;
    await first.shutdown();
    const answer = await enabling;
    assert.notEqual(answer?.success, true, 'the failed application reports no ENABLE success');
    fault.restore();
    assert.equal(firstResources.db.open, false);
    assert.equal(firstResources.port.readStatus().outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(first.transport.getRegisteredHandler(first.unifiedAddress), null);
    assert.equal(first.db, null);
    assert.equal(first.raft, null);
    const cold = passive(options.dbPath, partitionId);
    assert.deepEqual(pendingOrigin(cold, ORIGIN.COMMITTED_PENDING), retained);
    assert.equal(cold.native.appliedIndex, held.native.appliedIndex);
    assert.deepEqual(cold.native.record.entries, durableEntries);

    const reopened = new PartitionService({...options,
      bootstrapMembership: durableRecordBootstrap(), identityExisted: true});
    services.push(reopened);
    await reopened.initialize();
    const applied = passive(options.dbPath, partitionId);
    assert.equal(applied.origin.state, ORIGIN.APPLIED, JSON.stringify(applied.origin));
    assert.deepEqual(applied.origin.appliedOrigin,
      {originIndex: retained.index, originTerm: retained.term});
    assert.equal(applied.origin.generation, '0');
    assert.ok(BigInt(applied.native.appliedIndex) >= BigInt(retained.index));
    assert.deepEqual(applied.native.record.entries.slice(0, durableEntries.length), durableEntries,
      'reconstruction preserves every byte of the original retained prefix');
    assert.equal(applied.origin.appliedCommands.length, 1);
    assert.deepEqual(applied.origin.appliedCommands[0].command, retained.command);
    assert.deepEqual(applied.origin.committedPending, []);
    assert.deepEqual(applied.origin.locallyUncommitted, [],
      'the normal single-voter campaign may add a no-op, never a replacement ENABLE');
    const again = await enableParticipantTransactionAdmission(reopened);
    assert.equal(again.success, true);
    assert.equal(again.alreadyEnabled, true);
    assert.deepEqual(passive(options.dbPath, partitionId), applied,
      'idempotent ENABLE preserves the first origin, generation and native history');
  });

test('one real RF3 ENABLE is locally uncommitted then committed-pending before normal replay',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    environment(t);
    const partitionId = 'retained-origin-rf3';
    const members = ['r1', 'r2', 'r3'].map((id) => [`${partitionId}-${id}`, NODE_ID]);
    const group = await formAdmittedGroup({partitionId, members,
      tempPrefix: 'retained-origin-rf3-', serviceOptions: tableOptions(),
      budgetMs: GROUP_BUDGET_MS});
    t.after(() => group.dispose());
    const settling = {};
    assert.equal(await group.waitFor(() =>
      settledGroup(group, members, partitionId, settling) !== null), true,
    'setup: all three replicas share one settled native frontier, term and configuration; ' +
      JSON.stringify(settling.views.map(({native, origin}, index) => ({
        replicaId: members[index][0], appliedIndex: native.appliedIndex,
        commitIndex: native.commitIndex, lastIndex: native.lastIndex,
        hardState: native.record.hardState, confState: native.record.confState,
        coverage: native.coverage, originState: origin.state,
        originReason: origin.reason, originCoverage: origin.coverage,
        originErrorCode: origin.cause?.code, originError: origin.cause?.message,
      }))));
    const settled = settledGroup(group, members, partitionId);
    assert.ok(settled);
    const leader = group.services.find((service) =>
      service.raft.readStatus().role === RAFT_ROLE.LEADER);
    assert.ok(leader);
    const follower = group.services.find((service) => service !== leader);
    const followerMember = members.find(([id]) => id === follower.replicaId);
    const followerPath = group.dbFileOf(followerMember);
    const router = leader.transport;
    const originalDeliver = router.deliver;
    const leaderStatus = leader.raft.readStatus();
    const leaderPeer = String(leaderStatus.peerId);
    const followerPeer = String(follower.raft.readStatus().peerId);
    assert.equal(String(leaderStatus.term), settled.record.hardState.term);
    const before = passive(followerPath, partitionId);
    assert.equal(before.origin.state, ORIGIN.PRE_ORIGIN);
    assert.equal(before.native.appliedIndex, settled.appliedIndex);
    let firstCarrier = null;
    let heldCarriers = 0;
    const carrier = {address: group.addressOf(followerMember), partitionId, leaderPeer,
      followerPeer, term: String(leaderStatus.term), commitIndex: before.native.commitIndex};
    const deliver = function(...args) {
      if (!isFollowerCommitCarrier(args, carrier)) {
        return Reflect.apply(originalDeliver, this, args);
      }
      heldCarriers++;
      if (firstCarrier === null) firstCarrier = {receiver: this, args};
      return Promise.resolve({acknowledged: true});
    };
    router.deliver = deliver;
    t.after(() => {
      if (router.deliver === deliver) router.deliver = originalDeliver;
    });
    const enabled = await enableParticipantTransactionAdmission(leader);
    assert.equal(enabled.success, true, JSON.stringify(enabled));
    assert.equal(leader.raft.readStatus().role, RAFT_ROLE.LEADER);
    assert.equal(leader.raft.readStatus().term, leaderStatus.term);
    assert.equal(await group.waitFor(() => {
      const view = passive(followerPath, partitionId);
      const origin = view.origin.locallyUncommitted?.[0];
      return firstCarrier !== null && view.origin.state === ORIGIN.LOCAL_PENDING &&
        origin?.index === String(enabled.originIndex) &&
        origin?.term === String(enabled.originTerm);
    }), true, 'the exact commit carrier is held and the real follower persisted ENABLE locally');
    assert.ok(BigInt(firstCarrier.args[1].message.commit) >= BigInt(enabled.originIndex));
    const local = passive(followerPath, partitionId);
    const retained = pendingOrigin(local, ORIGIN.LOCAL_PENDING);
    assert.equal(local.native.appliedIndex, local.native.commitIndex);
    assert.equal(retained.index, String(enabled.originIndex));
    assert.equal(retained.term, String(enabled.originTerm));
    assert.ok(heldCarriers > 0);

    const fault = holdOriginApplication(follower);
    await Reflect.apply(originalDeliver, firstCarrier.receiver, firstCarrier.args);
    assert.equal(await group.waitFor(() => fault.failures() > 0), true,
      'the forwarded native commit carrier reaches the held application');
    await fault.reached;
    const committed = passive(followerPath, partitionId);
    assert.deepEqual(pendingOrigin(committed, ORIGIN.COMMITTED_PENDING).command, retained.command);
    assert.equal(committed.origin.committedPending[0].index, retained.index);
    assert.equal(committed.origin.committedPending[0].term, retained.term);
    assert.deepEqual(committed.native.record.entries, local.native.record.entries,
      'only the real native commit carrier changed the classification');
    fault.restore();
    router.deliver = originalDeliver;
    assert.equal(await group.waitFor(() =>
      passive(followerPath, partitionId).origin.state === ORIGIN.APPLIED), true,
    'the existing native recovery cadence replays after the finite application fault clears');
    const recovered = passive(followerPath, partitionId);
    assert.deepEqual(recovered.origin.appliedOrigin,
      {originIndex: retained.index, originTerm: retained.term});
    assert.equal(recovered.origin.generation, '0');
  });
