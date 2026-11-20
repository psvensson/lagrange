// Real admitted three-member SQL_TRANSACTIONS control group. Every release
// action reaches the original ReplicaHandler and PartitionService owners over
// actual loopback transport; this fixture never supplies a fabricated Raft
// status, membership, release answer, OPEN or generation.
import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';

import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {createLoopbackTransport} from './partition-service-test-support.js';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../src/constants/tables.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_RS_MESSAGE_TYPE, RAFT_RS_TRANSPORT_PROTOCOL} from
  '../../src/raft/raft-rs-ingress-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_CUTOVER_BOUND as BOUND,
  PARTICIPANT_RELEASE_ACTION as ACTION,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_LOG,
  PARTICIPANT_RELEASE_TYPE} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {participantReleaseAdmissionOf} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';

const PARTITION_ID = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS];
const NODE_ID = 'sql-control-three-voter';
const MEMBERS = Object.freeze([1, 2, 3].map((n) =>
  Object.freeze([`${PARTITION_ID}-r${n}`, NODE_ID])));
const TIMEOUT_MS = 40000;
const RELEASE_BUDGET_MS = 15000;
const RECOVERY_START_MS = 1000;
const ABSENT_TRANSACTION_ID = 'd'.repeat(32);
const PENDING_DELETE_SQL = 'DELETE FROM sql_transactions WHERE transaction_id = ?';

function retain(current, error, label) {
  return current === null ? error : new AggregateError([current, error], label);
}

function holdWriteReplication(transport, leader) {
  const original = transport.deliver;
  const leaderPeer = String(leader.raft.readStatus().peerId);
  const held = new Map();
  transport.deliver = function(address, payload, ...options) {
    if (payload?.protocol === RAFT_RS_TRANSPORT_PROTOCOL &&
        payload.groupId === PARTITION_ID && String(payload.from) === leaderPeer &&
        payload.message?.msgType === RAFT_RS_MESSAGE_TYPE.APPEND &&
        payload.message.entries?.length > 0) {
      if (!held.has(address)) held.set(address, [address, payload, ...options]);
      return null;
    }
    return Reflect.apply(original, this, [address, payload, ...options]);
  };
  return {held, async release() {
    transport.deliver = original;
    const packets = [...held.values()];
    held.clear();
    await Promise.all(packets.map((args) => Reflect.apply(original, transport, args)));
  }};
}

async function recoveryReport(group, reports, predicate) {
  assert.equal(await group.waitFor(() => reports.some(predicate)), true,
    'the actual lifecycle recovery report must be emitted');
  return reports.find(predicate);
}

async function measureHeldWrite({group, transport, handler, leader, clock, release}) {
  const reports = [];
  const originalInfo = handler.logger.info;
  const gate = holdWriteReplication(transport, leader);
  handler.logger.info = function(message, fields) {
    if (message === PARTICIPANT_RELEASE_LOG && fields.partitionId === PARTITION_ID) {
      reports.push(fields);
    }
    return Reflect.apply(originalInfo, this, [message, fields]);
  };
  const write = leader.executeQuery(PENDING_DELETE_SQL, [ABSENT_TRANSACTION_ID]);
  let failure = null;
  let blocked = null;
  let recovered = null;
  let expectedDrain = null;
  try {
    assert.equal(await group.waitFor(() => gate.held.size === MEMBERS.length - 1), true,
      'the accepted SQL write must reach both actual follower routes');
    assert.equal(leader.proposalQueue.size, 1,
      'the native leader retains one accepted write with its replication held');
    const refusal = await release();
    assert.equal(refusal.outcome, OUTCOME.DRAIN_PENDING, JSON.stringify(refusal));
    expectedDrain = refusal.blockedDrain;
    assert.equal(expectedDrain?.generation?.replicaId, leader.replicaId);
    assert.equal(expectedDrain?.work?.proposals, 1);
    assert.ok(group.services.every((member) =>
      participantReleaseAdmissionOf(member).state === ADMISSION.CLOSED));

    // Advance only the handler clock. The original registered service wake
    // starts the same cutover against still-live native Raft and SQLite.
    clock.advance(0);
    blocked = await recoveryReport(group, reports, (entry) =>
      entry.outcome === OUTCOME.DRAIN_PENDING);
    assert.equal(leader.proposalQueue.size, 1, 'the report observes the still-held work');

    await gate.release();
    const written = await write;
    assert.equal(written.success, true, JSON.stringify(written));
    assert.equal(written.changes, 0, 'the exact held absent-row DELETE has applied');
    assert.equal(leader.proposalQueue.size, 0);
    clock.advance(BOUND.RECOVERY_RETRY_MS);
    recovered = await recoveryReport(group, reports, (entry) => entry.outcome === OUTCOME.CUT_OVER);
    assert.ok(group.services.every((member) =>
      participantReleaseAdmissionOf(member).state === ADMISSION.OPEN));
  } catch (error) {
    failure = error;
  } finally {
    handler.logger.info = originalInfo;
    try {
      await gate.release();
      await write;
    } catch (error) {
      failure = retain(failure, error, 'held native proposal cleanup');
    }
  }
  if (failure !== null) throw failure;
  assert.deepEqual(blocked.blockedDrain, expectedDrain,
    'lifecycle recovery projects the canonical blocked drain of the actual accepted proposal');
  assert.equal(recovered.blockedDrain ?? null, null,
    'the normal CUT_OVER report carries no blocked drain');
}

test('three actual current SQL control voters share one PAUSE census and each rechecks RESUME',
  {timeout: TIMEOUT_MS}, async () => {
    const transport = createLoopbackTransport();
    const clock = new VirtualTimeSource({startMs: RECOVERY_START_MS});
    let group = null;
    let handler = null;
    let failure = null;
    try {
      group = await formAdmittedGroup({
        partitionId: PARTITION_ID,
        members: MEMBERS,
        tempPrefix: 'control-paused-census-three-',
        budgetMs: RELEASE_BUDGET_MS,
        serviceOptions: {tableId: TABLES.SQL_TRANSACTIONS,
          tableName: TABLES.SQL_TRANSACTIONS, schema: SQL_TRANSACTIONS_SCHEMA},
        transport,
      });
      assert.equal(group.services.length, 3,
        'three actual native PartitionService replicas were admitted');
      const leader = group.services.find((service) =>
        service.raft.readStatus().role === RAFT_ROLE.LEADER);
      assert.ok(leader, 'native group has an actual elected leader');
      handler = new ReplicaHandler({
        nodeId: NODE_ID, ownerIncarnation: 1,
        systemTableCache: leader.systemTableCache,
        cdcIntegrationService: {},
        createPartitionService: (options) => new PartitionService(options),
        messageRouter: transport,
        dataDir: path.dirname(group.dbFileOf(MEMBERS[0])),
        timeSource: clock,
      });
      handler.registerWithRouter(transport);
      for (const service of group.services) {
        handler.localServices.set(service.replicaId, service);
      }
      const build = await runtimeBuildProvenance();
      assert.equal(build.state, 'measured', build.reason);
      const release = () => handler.participantReleaseRecovery.releaseOperator({
        partitionId: PARTITION_ID, targetBuildDigest: build.digest,
        deadlineAtMs: handler.timeSource.now() + RELEASE_BUDGET_MS,
      });
      const first = await release();
      assert.equal(first.outcome, OUTCOME.CUT_OVER,
        'the original native three-member release must install durable origins: ' +
          JSON.stringify(first));
      const origins = group.services.map((service) =>
        readPartitionWriteOrigin(service.db));
      assert.ok(origins.every((x) => x !== null),
        'every actual physical member now has a durable write origin');
      assert.ok(origins.every((x) => JSON.stringify(x) === JSON.stringify(origins[0])),
        'the three actual member durable origins agree');
      const seen = [];
      const originalDeliver = transport.deliver;
      transport.deliver = function(...args) {
        const request = args[1];
        if (request?.type === PARTICIPANT_RELEASE_TYPE &&
            request.partitionId === PARTITION_ID) {
          seen.push({action: request.action, replicaId: request.replicaId ?? null});
        }
        return Reflect.apply(originalDeliver, this, args);
      };
      let repeated;
      try {
        repeated = await release();
      } finally {
        transport.deliver = originalDeliver;
      }
      assert.equal(repeated.outcome, OUTCOME.CUT_OVER, JSON.stringify(repeated));
      assert.equal(repeated.census?.length, 3,
        'current release owner must return its complete actual three-member census');
      for (const service of group.services) {
        const member = seen.filter((record) => record.replicaId === service.replicaId);
        const count = (action) =>
          member.filter((record) => record.action === action).length;
        assert.equal(count(ACTION.INSPECT), 1,
          `${service.replicaId}: original current-member inspection occurs once`);
        assert.equal(count(ACTION.PAUSE), 1,
          `${service.replicaId}: original admission owner closes work`);
        assert.equal(count(ACTION.RESUME), 1,
          `${service.replicaId}: original recipient performs fresh final RESUME checks`);
        assert.equal(count(ACTION.ENABLE), 0);
        assert.equal(count(ACTION.OBSERVE_APPLIED_POSITION), 0);
        assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.OPEN,
          'only the current original recipient can reopen its admission');
        assert.deepEqual(readPartitionWriteOrigin(service.db),
          origins[group.services.indexOf(service)]);
      }
      await measureHeldWrite({group, transport, handler, leader, clock, release});
    } catch (error) {
      failure = error;
    } finally {
      try {
        if (handler !== null) {
          await handler.participantReleaseRecovery.shutdown();
          handler.unregisterFromRouter(transport);
        }
      } catch (error) {
        failure = retain(failure, error, 'real three-member release-owner cleanup');
      }
      try {
        await group?.dispose({retainDirectory: failure !== null});
      } catch (error) {
        failure = retain(failure, error, 'real native three-member shutdown');
      }
    }
    if (failure !== null) throw failure;
  });
