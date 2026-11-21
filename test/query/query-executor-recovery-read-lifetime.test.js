import assert from 'node:assert/strict';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_OPERATION, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {ROUTER_MESSAGE_TYPE} from '../../src/constants/transport.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';
import {QUERY_MESSAGE_TYPE} from '../../src/query/query-constants.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR, RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {test} from '../../src/test-helpers/tap.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {ROUTER_MESSAGE_TIMEOUT_ERROR_CODE} from '../../src/transport/transport-error-codes.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {withTestDbPath} from '../test-helpers/message-group-db-path.js';
import {createRouterEnvelopeFixture, settleUntil} from
  '../transport/router-envelope-witness-fixture.js';

const SOURCE = 'read-grant-source';
const TARGET = 'read-grant-target';
const ALTERNATE = 'read-grant-alternate';
const TABLE = 'read_grant_rows';
const PARTITION = `${TABLE}-p1`;
const REPLICA = `${PARTITION}-r1`;
const ALTERNATE_REPLICA = `${PARTITION}-r2`;
const GROUP = 'read-grant-message-group';
const HELD_KEY = 'held';
const PEER_KEY = 'peer';
const SQL = `SELECT id, value FROM ${TABLE} WHERE id = ?`;
const LATE_MS = 1;
const READ_ATTEMPTS = 3;
const GRANT_PROBES = 6;
const FIXTURE_BUDGET_MS = 10000;
const CANCEL_REASON = 'witness caller cancelled';
const RECOVERY = CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
const SCHEMA = {columns: [
  {name: 'id', type: 'TEXT', primaryKey: true},
  {name: 'value', type: 'TEXT'},
]};
const LEADER_READ = buildControlPlaneReadAuthority({
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  routingReadinessDimension: RECOVERY,
});

function observeWire(source, target, address, clock, {holdAck, holdReply = true}) {
  const deliveries = new Map();
  const socket = source.nodeConnections.get(target.nodeId).ws;
  const send = socket.send.bind(socket);
  const sendRaw = target.sendRaw.bind(target);
  const receiveResponse = source.handleServiceResponse.bind(source);
  socket.send = (bytes, ...args) => {
    const frame = JSON.parse(String(bytes));
    const query = frame.payload?.payload;
    if (frame.type === ROUTER_MESSAGE_TYPE.SERVICE_MESSAGE &&
        frame.targetAddress === address && query?.type === QUERY_MESSAGE_TYPE.QUERY &&
        query.sql === SQL) {
      const existing = deliveries.get(frame.messageId);
      if (existing) {
        existing.sends += 1;
      } else {
        deliveries.set(frame.messageId, {id: frame.messageId, key: query.params[0],
          submittedAt: clock.now(), sends: 1, nativeReads: 0, frames: [],
          pendingAtSend: new Set(source.pendingResponses.keys())});
      }
    }
    return send(bytes, ...args);
  };
  target.sendRaw = (ws, frame) => {
    const delivery = deliveries.get(frame.messageId);
    if (!holdReply || !delivery || delivery.key !== HELD_KEY) return sendRaw(ws, frame);
    if (frame.type === ROUTER_MESSAGE_TYPE.SERVICE_RESPONSE) {
      delivery.nativeReads += 1;
      delivery.answer = frame.result;
    } else if (frame.type !== ROUTER_MESSAGE_TYPE.ACK || !holdAck) {
      return sendRaw(ws, frame);
    }
    delivery.frames.push(() => sendRaw(ws, frame));
  };
  source.handleServiceResponse = (frame) => {
    const delivery = deliveries.get(frame.messageId);
    if (delivery) delivery.receivedAt = clock.now();
    return receiveResponse(frame);
  };
  return {
    deliveries,
    restore() {
      socket.send = send;
      target.sendRaw = sendRaw;
      source.handleServiceResponse = receiveResponse;
    },
  };
}

function seedRows(partition, cache) {
  const insert = partition.db.prepare(`INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`);
  insert.run(HELD_KEY, 'original row');
  insert.run(PEER_KEY, 'independent row');
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    service_id: partition.replicaId, replica_id: partition.replicaId,
    service_type: SERVICE_TYPE.PARTITION, partition_id: PARTITION, node_id: partition.nodeId,
    address: partition.unifiedAddress, status: SERVICE_STATUS.ACTIVE, raft_role: partition.role,
  });
}

async function openPartitions(t, fixture, target, cache, resources, withAlternate) {
  const serviceOptions = {tableId: TABLE, tableName: TABLE, schema: SCHEMA};
  if (withAlternate) {
    const group = await formAdmittedGroup({
      partitionId: PARTITION, members: [[REPLICA, TARGET], [ALTERNATE_REPLICA, ALTERNATE]],
      tempPrefix: 'read-grant-admitted-', serviceOptions, budgetMs: FIXTURE_BUDGET_MS,
    });
    resources.disposePartitions = group.dispose;
    const alternate = await fixture.start(ALTERNATE);
    const [leader, follower] = group.services;
    assert.equal(leader.raft.readStatus().role, RAFT_ROLE.LEADER);
    assert.equal(follower.raft.readStatus().role, RAFT_ROLE.FOLLOWER);
    // Query traffic uses the real remote routers and the actual partition
    // handlers. Only the fixture's native Raft/admission traffic uses loopback.
    target.router.register(leader.unifiedAddress, leader.transportHandler);
    alternate.router.register(follower.unifiedAddress, follower.transportHandler);
    group.services.forEach((partition) => seedRows(partition, cache));
    const handoff = async () => {
      assert.equal((await turnChainValue(leader.requestLeadershipTransfer({
        successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED, replicaIdentity: follower.replicaId,
      }))).outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
      assert.equal(await group.waitFor(() =>
        leader.raft.readStatus().role === RAFT_ROLE.FOLLOWER &&
        follower.raft.readStatus().role === RAFT_ROLE.LEADER &&
        follower.role === RAFT_ROLE.LEADER), true, 'actual Raft leadership transferred');
      cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.UPDATE, {
        partition_id: PARTITION, table_id: TABLE, leader_node_id: follower.nodeId,
      });
    };
    return {
      primaryAddress: leader.unifiedAddress, alternate,
      alternateAddress: follower.unifiedAddress, handoff,
    };
  }
  const partition = new PartitionService(withFoundingStamp(withTestDbPath({
    ...serviceOptions, partitionId: PARTITION, replicaId: REPLICA, nodeId: TARGET,
    transport: target.router, systemTableCache: cache,
  })));
  resources.disposePartitions = () => partition.shutdown();
  await partition.initialize();
  partition.startElection();
  await settleUntil(t, () => partition.raft.readStatus().role === RAFT_ROLE.LEADER,
    'actual SQLite partition becomes its singleton Raft leader');
  seedRows(partition, cache);
  return {primaryAddress: partition.unifiedAddress};
}

async function openFixture(t, {holdAck = true, withAlternate = false} = {}) {
  const fixture = createRouterEnvelopeFixture(import.meta.url, SOURCE);
  const clock = new VirtualTimeSource({startMs: Date.now()});
  await fixture.setup();
  const resources = {};
  t.teardown(async () => {
    resources.alternateWire?.restore();
    resources.wire?.restore();
    try {
      await Promise.all([resources.disposePartitions?.(), resources.group?.shutdown()]);
    } finally {
      await fixture.teardown();
    }
  });
  const sender = await fixture.start(SOURCE, true, {timeSource: clock});
  const target = await fixture.start(TARGET);
  const cache = new SystemTableCache();
  const groupReplica = `${GROUP}-r1`;
  const group = new MessageGroupService(withTestDbPath({
    groupId: GROUP, replicaId: groupReplica, replicaIds: [groupReplica],
    founderNodeIds: {[groupReplica]: SOURCE}, nodeId: SOURCE,
    transport: sender.router, timeSource: clock,
    nodeService: {getSystemTableCache: () => cache, getReadOnlySystemTableCache: () => cache},
  }));
  resources.group = group;
  await group.initialize();
  sender.router.setQueryMessageGroupServiceResolver(() => ({service: group}));
  const {primaryAddress, alternate, alternateAddress, handoff} =
    await openPartitions(t, fixture, target, cache, resources, withAlternate);
  cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    partition_id: PARTITION, table_id: TABLE, leader_node_id: TARGET,
  });
  await fixture.connect(sender, target);
  await settleUntil(t, () => sender.router.getConnectionState(TARGET) === 'connected',
    'identified connected replica');
  const wire = observeWire(sender.router, target.router, primaryAddress, clock, {holdAck});
  resources.wire = wire;
  if (alternate) {
    await fixture.connect(sender, alternate);
    await settleUntil(t, () => sender.router.getConnectionState(ALTERNATE) === 'connected',
      'identified healthy alternate');
    resources.alternateWire = observeWire(sender.router, alternate.router, alternateAddress,
      clock, {holdReply: false});
  }
  const executor = new QueryExecutor({
    nodeId: SOURCE, nowFn: () => clock.now(), messageRouter: sender.router, systemCache: cache,
    controlPlaneReadinessService: createCommittedServeEligibilityOwner({
      projectedDimensions: {controlPlaneRecoveryEligible: true, repairEligible: true},
    }),
  });
  executor.readRetryAttempts = READ_ATTEMPTS;
  const probeMs = sender.router.reconnectIntervalMs;
  function read(key, deadlineMs, {readAuthority, cancellationToken} = {}) {
    return executor.executeOnPartition(PARTITION, SQL, [key], true, true, false, {
      readAuthority, cancellationToken, timeoutBudget: {deadlineMs},
      routingReadinessDimension: RECOVERY,
    });
  }
  return {
    clock, group, probeMs, read, executor, handoff, source: sender.router,
    alternateSends: () => [...resources.alternateWire.deliveries.values()],
    held: () => [...wire.deliveries.values()].filter((delivery) => delivery.key === HELD_KEY),
    sent: () => [...wire.deliveries.values()],
  };
}

function releaseFrames(delivery) {
  for (const send of delivery.frames.splice(0)) send();
}

function assertRetired(f, t) {
  t.equal(f.source.pendingMessages.size, 0, 'exact wire ACK custody retired');
  t.equal(f.source.pendingResponses.size, 0, 'wire and outer answer custody retired');
  t.equal(f.group.pendingMessages.size, 0, 'direct-only MessageGroup custody retired');
}

test('a connected sole recovery read accepts its held native reply within the caller grant',
  async (t) => {
    const f = await openFixture(t);
    const deadline = f.clock.now() + GRANT_PROBES * f.probeMs;
    const settlements = [];
    const result = f.read(HELD_KEY, deadline, {readAuthority: LEADER_READ}).then((value) => {
      settlements.push({value, at: f.clock.now()});
      return value;
    });
    await settleUntil(t, () => f.held()[0]?.answer !== undefined, 'held native answer and ACK');
    const first = f.held()[0];
    assert.equal(first.answer.success, true, 'fixture must produce a real SQLite result');
    assert.equal(first.answer.rowSetComplete, true, 'fixture must produce a complete result');
    assert.equal(first.frames.length, 2, 'both real frames are held before the wire');
    assert.ok(f.source.pendingMessages.has(first.id), 'first exact wire ACK waiter is engaged');

    const independent = await f.read(PEER_KEY, deadline);
    t.same(independent.rows, [{id: PEER_KEY, value: 'independent row'}],
      'same SQL with different bind values and leader authority settles independently');
    t.not(f.sent().find((item) => item.key === PEER_KEY)?.id, first.id,
      'a different request owns a different wire identity');
    t.equal(settlements.length, 0, 'independent result does not settle the held query');

    for (let index = 0; index < READ_ATTEMPTS; index += 1) {
      await settleUntil(t, () => settlements.length || f.held()[index]?.answer !== undefined,
        'completed original call or next actual retry at the same endpoint');
      if (settlements.length) break;
      const delivery = f.held()[index];
      assert.equal(delivery.answer.success, true, 'retry reached real SQLite');
      f.clock.advance(f.probeMs + LATE_MS);
      assert.ok(f.clock.now() < deadline, 'injected delay is inside the caller grant');
      releaseFrames(delivery);
      await settleUntil(t, () => delivery.receivedAt !== undefined,
        'the sender parsed the actual released native reply');
      assert.ok(delivery.receivedAt - delivery.submittedAt > f.probeMs);
      assert.ok(delivery.receivedAt < deadline);
    }
    await settleUntil(t, () => settlements.length === 1, 'single caller settlement');
    const outcome = await result;
    t.comment(JSON.stringify({
      deadline, settlements, deliveries: f.held().map(
        ({id, sends, nativeReads, submittedAt, receivedAt}) =>
          ({id, sends, nativeReads, submittedAt, receivedAt})),
    }));
    t.equal(outcome.success, true, 'the original native reply is usable within the caller grant');
    t.same(outcome.rows, [{id: HELD_KEY, value: 'original row'}]);
    t.same(outcome.readAuthorityWitness, first.answer.readAuthorityWitness,
      'the selected reply carries its own partition authority witness');
    t.same(f.held().map((delivery) => delivery.id), [first.id],
      'a scheduling probe must not strand the same in-flight read and start a duplicate');
    t.equal(first.sends, 1, 'one actual socket submission');
    t.equal(first.nativeReads, 1, 'one actual SQLite result');
    t.equal(settlements.length, 1, 'exactly one user-visible result');
    assertRetired(f, t);
  });

test('persistent native response loss settles unsuccessfully by the original grant', async (t) => {
  const f = await openFixture(t, {holdAck: false});
  const deadline = f.clock.now() + f.probeMs;
  const pending = f.read(HELD_KEY, deadline);
  await settleUntil(t, () => f.held()[0]?.answer?.success === true &&
    !f.source.pendingMessages.has(f.held()[0].id), 'real execution and ACK, answer absent');
  f.clock.advance(f.probeMs);
  await settleUntil(t, () => !f.source.pendingResponses.size,
    'response waiter after original expiry');
  const outcome = await pending;
  t.equal(outcome.success, false, 'ACK plus no answer is not query success');
  t.equal(outcome.errorCode, ROUTER_MESSAGE_TIMEOUT_ERROR_CODE);
  t.equal(f.held().length, 1, 'expiry does not authorize a new delivery');
  t.equal(f.clock.now(), deadline);
  assertRetired(f, t);
});

test('cancellation remains authoritative when an already executed read arrives late', async (t) => {
  const f = await openFixture(t);
  const token = new CancellationToken();
  const deadline = f.clock.now() + GRANT_PROBES * f.probeMs;
  const settled = f.read(HELD_KEY, deadline, {cancellationToken: token})
    .then((value) => ({value}), (error) => ({error}));
  await settleUntil(t, () => f.held()[0]?.answer?.success === true,
    'real SQLite before cancellation');
  let outcome;
  settled.then((value) => {
    outcome = value;
  });
  token.cancel(CANCEL_REASON);
  await settleUntil(t, () => outcome !== undefined, 'cancelled caller while frames remain held');
  assertRetired(f, t);
  releaseFrames(f.held()[0]);
  await settleUntil(t, () => f.held()[0].receivedAt !== undefined, 'late cancelled native reply');
  t.equal(outcome.error?.message, CANCEL_REASON, 'late native result cannot override cancellation');
  t.equal(f.held().length, 1, 'cancellation does not authorize a new delivery');
  assertRetired(f, t);
});

test('a connected unusable replica does not strand an eligible healthy alternate', async (t) => {
  const f = await openFixture(t, {withAlternate: true});
  const deadline = f.clock.now() + GRANT_PROBES * f.probeMs;
  const pending = f.read(HELD_KEY, deadline);
  await settleUntil(t, () => f.held()[0]?.answer?.success === true,
    'primary actual SQL before probe');
  const first = f.held()[0];
  t.equal(f.alternateSends().length, 0, 'the preferred leader gets the first routing probe');
  f.clock.advance(f.probeMs + LATE_MS);
  await settleUntil(t, () => f.alternateSends().length === 1, 'eligible native alternate at probe');
  const [alternate] = f.alternateSends();
  t.ok(alternate.pendingAtSend.has(first.id), 'alternate starts while original answer is retained');
  const answer = await pending;
  t.same(answer.rows, [{id: HELD_KEY, value: 'original row'}]);
  t.equal(answer.readAuthorityWitness?.servingNodeId, ALTERNATE,
    'actual alternate supplied the answer');
  t.equal(f.held().length, 1, 'the occupied original route was not reissued');
  t.ok(f.clock.now() < deadline, 'alternate settles within the caller grant');
  assertRetired(f, t);
  releaseFrames(first);
  await settleUntil(t, () => first.receivedAt !== undefined,
    'discard losing original native reply');
  assertRetired(f, t);
});

test('executor shutdown retires a submitted read while its actual reply is held', async (t) => {
  const f = await openFixture(t);
  const deadline = f.clock.now() + GRANT_PROBES * f.probeMs;
  let outcome;
  f.read(HELD_KEY, deadline).then(
    (value) => {
      outcome = {value};
    },
    (error) => {
      outcome = {error};
    },
  );
  await settleUntil(t, () => f.held()[0]?.answer?.success === true, 'real SQLite before shutdown');
  f.executor.markShuttingDown();
  await settleUntil(t, () => outcome !== undefined, 'executor shutdown before releasing frames');
  t.equal(outcome.error?.code, 'QUERY_EXECUTOR_SHUTTING_DOWN');
  assertRetired(f, t);
  releaseFrames(f.held()[0]);
  await settleUntil(t, () => f.held()[0].receivedAt !== undefined, 'late reply after shutdown');
  assertRetired(f, t);
});

test('a required-leader read drops the old answer after the owner publishes a new leader',
  async (t) => {
    const f = await openFixture(t, {withAlternate: true});
    const deadline = f.clock.now() + GRANT_PROBES * f.probeMs;
    const pending = f.read(HELD_KEY, deadline, {readAuthority: LEADER_READ});
    await settleUntil(t, () => f.held()[0]?.answer?.success === true,
      'the old leader executed before transferring');
    const old = f.held()[0];
    await f.handoff();
    releaseFrames(old);
    await settleUntil(t, () => old.receivedAt !== undefined,
      'parse the original answer after the canonical route changed');
    f.clock.advance(f.probeMs + LATE_MS);
    await settleUntil(t, () => f.alternateSends().length === 1,
      'the updated owner row routes to the actual new leader');
    const answer = await pending;
    t.equal(answer.readAuthorityWitness?.servingNodeId, ALTERNATE,
      'the former leader cannot settle the required-leader read');
    t.equal(answer.readAuthorityWitness?.role, RAFT_ROLE.LEADER);
    t.equal(f.held().length, 1);
    assertRetired(f, t);
  });
