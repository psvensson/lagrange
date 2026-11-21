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
import {test} from '../../src/test-helpers/tap.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {ROUTER_MESSAGE_TIMEOUT_ERROR_CODE} from '../../src/transport/transport-error-codes.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {withTestDbPath} from '../test-helpers/message-group-db-path.js';
import {createRouterEnvelopeFixture, settleUntil} from
  '../transport/router-envelope-witness-fixture.js';

const SOURCE = 'read-grant-source';
const TARGET = 'read-grant-target';
const TABLE = 'read_grant_rows';
const PARTITION = `${TABLE}-p1`;
const REPLICA = `${PARTITION}-r1`;
const GROUP = 'read-grant-message-group';
const HELD_KEY = 'held';
const PEER_KEY = 'peer';
const SQL = `SELECT id, value FROM ${TABLE} WHERE id = ?`;
const LATE_MS = 1;
const READ_ATTEMPTS = 3;
const GRANT_PROBES = 6;
const CANCEL_REASON = 'witness caller cancelled';
const RECOVERY = CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
const LEADER_READ = buildControlPlaneReadAuthority({
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  routingReadinessDimension: RECOVERY,
});

function observeWire(source, target, address, clock, holdAck) {
  const deliveries = new Map();
  const socket = source.nodeConnections.get(TARGET).ws;
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
          submittedAt: clock.now(), sends: 1, nativeReads: 0, frames: []});
      }
    }
    return send(bytes, ...args);
  };
  target.sendRaw = (ws, frame) => {
    const delivery = deliveries.get(frame.messageId);
    if (!delivery || delivery.key !== HELD_KEY) return sendRaw(ws, frame);
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

async function openFixture(t, {holdAck = true} = {}) {
  const fixture = createRouterEnvelopeFixture(import.meta.url, SOURCE);
  const clock = new VirtualTimeSource({startMs: Date.now()});
  await fixture.setup();
  const resources = {};
  t.teardown(async () => {
    resources.wire?.restore();
    try {
      await Promise.all([resources.partition?.shutdown(), resources.group?.shutdown()]);
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
  const partition = new PartitionService(withFoundingStamp(withTestDbPath({
    tableId: TABLE, tableName: TABLE, partitionId: PARTITION, replicaId: REPLICA,
    nodeId: TARGET, transport: target.router, systemTableCache: cache,
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  })));
  resources.partition = partition;
  await partition.initialize();
  partition.startElection();
  await settleUntil(t, () => partition.raft.readStatus().role === RAFT_ROLE.LEADER,
    'actual SQLite partition becomes its singleton Raft leader');
  const insert = partition.db.prepare(`INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`);
  insert.run(HELD_KEY, 'original row');
  insert.run(PEER_KEY, 'independent row');
  cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    partition_id: PARTITION, table_id: TABLE, leader_node_id: TARGET,
  });
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    service_id: REPLICA, replica_id: REPLICA, service_type: SERVICE_TYPE.PARTITION,
    partition_id: PARTITION, node_id: TARGET, address: partition.unifiedAddress,
    status: SERVICE_STATUS.ACTIVE, raft_role: RAFT_ROLE.LEADER,
  });
  await fixture.connect(sender, target);
  await settleUntil(t, () => sender.router.getConnectionState(TARGET) === 'connected',
    'identified connected replica');
  const wire = observeWire(sender.router, target.router, partition.unifiedAddress, clock, holdAck);
  resources.wire = wire;
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
    clock, group, probeMs, read, source: sender.router,
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
  await settleUntil(t, () => !f.source.pendingResponses.size, 'response waiter after original expiry');
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
  await settleUntil(t, () => f.held()[0]?.answer?.success === true, 'real SQLite before cancellation');
  token.cancel(CANCEL_REASON);
  releaseFrames(f.held()[0]);
  const outcome = await settled;
  t.equal(outcome.error?.message, CANCEL_REASON, 'late native result cannot override cancellation');
  t.equal(f.held().length, 1, 'cancellation does not authorize a new delivery');
  assertRetired(f, t);
});
