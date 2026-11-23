// Regression tests for single-replica deferred-election Raft tick scheduling
// and stale bootstrap replicaIds.length === 1 checks after ConfChange growth.
//
// Proves:
// 1. A real 1-replica PartitionService opened with deferElection: true (the
//    exact seed-partitions-phase.js contract) starts Raft tick scheduling on
//    startElection(). After growing from RF1 -> RF3 via ConfChange and
//    transferring leadership to r3, stopping r3 lets the surviving 2-of-3
//    quorum {r1, r2} elect a new leader automatically instead of deadlocking
//    forever on r1's frozen check_quorum leader lease.
// 2. A 1-replica MessageGroupService opened with deferElection: true leaves
//    electionStarted === false until startElection() and starts scheduling on
//    startElection().
// 3. After a 1-replica founder grows (committed peerCount > 0 while bootstrap
//    replicaIds still has length 1), applyRaftTimingConfig passes
//    rearmTimer: true, PartitionService.scheduleLeaderOwnedActivation does not
//    bypass leadership activation delay (immediate: false), and
//    MessageGroupService CDC does not treat the grown group as single-replica.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  admitThroughRequest,
  buildTargetFromOperation,
  configure,
  createCommittedMembershipHarness,
  createJoinOperation,
  metadataCache,
  serviceRow,
  statusOf,
  waitFor,
} from '../raft/raft-rs-backend/committed-membership-harness.js';
import {
  createControllableMessageGroupService,
  createTestTransport,
  setTestPortBase,
} from '../message-group/message-group-service-test-support.js';
import {ControllableConsensusPort} from
  '../test-helpers/controllable-consensus-port.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {
  PartitionService,
} from '../../src/partition/partition-service.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
} from '../../src/raft/raft-operation-port-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';

setTestPortBase(26500);

const SCHEDULING_STARTED = 'start';
const FAILOVER_BUDGET_MS = 4000;
const NATURAL_HANDOFF_BUDGET_MS = 12000;
const LEADER_TRANSFER_BUDGET_MS = 4000;
const HEARTBEAT_OBSERVE_BUDGET_MS = 1500;
const SEED_REPLICA = ['seed-p1-r1', 'node-1'];
const JOINER_TWO = ['seed-p1-r2', 'node-2'];
const JOINER_THREE = ['seed-p1-r3', 'node-3'];

async function addJoiner(harness, target, existingMembers) {
  const leaderMember = harness.leaderMember();
  assert.ok(leaderMember, 'group must have a live leader before adding peer');
  const rows = existingMembers.map((member) =>
    serviceRow(harness.partitionId, member));
  const {operation, error} = await createJoinOperation(harness, {
    target,
    rows,
    leaderHint: leaderMember[1],
  });
  assert.equal(error, undefined, `createJoinOperation failed: ${error?.message}`);
  assert.ok(operation, 'join operation must be stamped');
  const targetCache = metadataCache(
    harness.partitionId,
    [...existingMembers, target],
    {leaderNodeId: leaderMember[1]},
  );
  await buildTargetFromOperation(harness, {
    target,
    operation,
    cache: targetCache,
  });
  const admitted = await admitThroughRequest(harness, target, existingMembers);
  assert.equal(admitted, true, `joiner ${target[0]} must commit into voters`);
}

test('single-replica deferred seed partition starts Raft tick scheduling on ' +
  'startElection and elects a new 2-of-3 leader when a joiner leader stops',
async () => {
  configure();
  const harness = createCommittedMembershipHarness('seed-tick-sched-p1');
  try {
    // Exact seed-partitions-phase.js opening: 1 founder with deferElection: true.
    const seed = harness.build(SEED_REPLICA, {
      replicaIds: [SEED_REPLICA[0]],
      peerAddresses: [`${SEED_REPLICA[1]}/partition/${SEED_REPLICA[0]}`],
      cache: metadataCache(harness.partitionId, [SEED_REPLICA]),
      deferElection: true,
    });
    await seed.initialize();
    assert.equal(seed.electionStarted, false,
      'deferred seed replica must not mark electionStarted before startElection');
    assert.equal(await waitFor(() => statusOf(seed).appliedIndex > 0), true,
      'single-replica seed must lead and apply its genesis no-op');

    seed.startElection();
    assert.equal(seed.electionStarted, true,
      'startElection must mark electionStarted on single-replica seed');

    // Grow RF1 -> RF2 -> RF3 via production ConfChange admission.
    await addJoiner(harness, JOINER_TWO, [SEED_REPLICA]);
    await addJoiner(harness, JOINER_THREE, [SEED_REPLICA, JOINER_TWO]);

    // Transfer leadership to joiner node-3 (matching Run 2 where node-3 led
    // ~25 system partitions before Case 9 restarted node-3).
    const r3 = harness.services.get(JOINER_THREE[0]);
    const r2 = harness.services.get(JOINER_TWO[0]);
    const transfer = await turnChainValue(
      seed.raft.transferLeadership({
        successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
        replicaIdentity: r3.replicaId,
      }));
    assert.equal(transfer.outcome, 'CORE_OK',
      'transferLeadership to joiner r3 must be accepted by seed leader');
    assert.equal(
      await waitFor(
        () => r3.isLeader && statusOf(seed).leaderId === r3.replicaId,
        LEADER_TRANSFER_BUDGET_MS,
      ),
      true,
      'r3 must become leader and seed r1 must observe r3 as leader',
    );

    const termBeforeStop = statusOf(r3).term;

    // Stop r3 (exact equivalent of Case 9 stopping node-3).
    await r3.shutdown();

    // Without periodic ticks on seed r1, r1 keeps its stale leader lease for
    // r3 forever and rejects every MsgRequestPreVote from r2 under
    // check_quorum + pre_vote, deadlocking the surviving 2-of-3 quorum.
    const failoverOk = await waitFor(() => {
      const survivorLeader = [seed, r2].find((service) =>
        service.isLeader && statusOf(service).term > termBeforeStop);
      if (!survivorLeader) {
        return false;
      }
      return (
        statusOf(seed).leaderId === survivorLeader.replicaId &&
        statusOf(r2).leaderId === survivorLeader.replicaId
      );
    }, FAILOVER_BUDGET_MS);

    assert.equal(
      failoverOk,
      true,
      'surviving quorum {r1, r2} must elect a new leader after r3 stops ' +
      `(r1: role=${seed.role} term=${statusOf(seed).term} ` +
      `leader=${statusOf(seed).leaderId}; r2: role=${r2.role} ` +
      `term=${statusOf(r2).term} leader=${statusOf(r2).leaderId})`,
    );

    // Also verify the seed replica's solo-group / leader-activation checks
    // honor committed peerCount after ConfChange growth.
    assert.equal(seed.isSoloReplicaGroup(), false,
      'grown seed partition must not report solo group when peerCount > 0');
    const capturedGateOptions = [];
    const origSchedule = seed.leaderActivationGate.schedule.bind(
      seed.leaderActivationGate);
    seed.leaderActivationGate.schedule = (term, fn, options) => {
      capturedGateOptions.push(options);
      return origSchedule(term, fn, options);
    };
    seed.scheduleLeaderOwnedActivation(statusOf(seed).term + 1);
    assert.equal(capturedGateOptions.at(-1)?.immediate, false,
      'leader activation on a grown RF3 seed must not bypass stabilization');
    seed.cancelLeaderOwnedActivation();
  } finally {
    await harness.dispose();
  }
});

test('single-replica deferred MessageGroupService starts scheduling on ' +
  'startElection and checks committed peerCount once grown', async () => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const port = new ControllableConsensusPort();
    const service = createControllableMessageGroupService({
      groupId: 'mg-seed-deferred',
      replicaId: 'mg-seed-deferred-r1',
      nodeId,
      replicaIds: ['mg-seed-deferred-r1'],
      transport: router,
      deferElection: true,
    }, port);

    await service.initialize();
    assert.equal(service.electionStarted, false,
      'deferred single-replica message group must not mark electionStarted at init');
    assert.equal(port.schedulingCalls.includes(SCHEDULING_STARTED), false,
      'deferred single-replica message group must not start scheduling at init');

    service.startElection();
    assert.equal(service.electionStarted, true,
      'startElection must mark electionStarted');
    assert.equal(port.schedulingCalls.at(-1), SCHEDULING_STARTED,
      'startElection must start port scheduling even when replicaIds.length === 1');

    // Simulate ConfChange growth (committed peerCount = 2, bootstrap replicaIds still length 1).
    port.peers = [
      {replicaIdentity: 'mg-seed-deferred-r2', address: 'node-2/message-group/mg-seed-deferred-r2'},
      {replicaIdentity: 'mg-seed-deferred-r3', address: 'node-3/message-group/mg-seed-deferred-r3'},
    ];

    const logPayloads = [];
    const origInfo = service.logger.info.bind(service.logger);
    service.logger = {
      ...service.logger,
      info: (msg, payload) => {
        logPayloads.push({msg, payload});
        return origInfo(msg, payload);
      },
      debug: () => {},
      warn: () => {},
      error: () => {},
    };
    service.applyRaftTimingConfig({
      heartbeatIntervalMs: 50,
      electionTimeoutMinMs: 1000,
      electionTimeoutMaxMs: 3000,
      tickIntervalMs: 20,
    });
    const timingEntry = logPayloads.find((entry) =>
      entry.payload?.rearmTimer !== undefined);
    assert.ok(timingEntry, 'applyRaftTimingConfig must log timing update');
    assert.equal(timingEntry.payload.rearmTimer, true,
      'applyRaftTimingConfig must rearm timer for started single-replica founder');

    const capturedGateOptions = [];
    const origSchedule = service.leaderActivationGate.schedule.bind(
      service.leaderActivationGate);
    service.leaderActivationGate.schedule = (term, fn, options) => {
      capturedGateOptions.push(options);
      return origSchedule(term, fn, options);
    };
    service.scheduleLeaderOwnedActivation(2);
    assert.equal(capturedGateOptions.at(-1)?.immediate, false,
      'grown message group must not use immediate leader activation when peerCount > 0');
    service.cancelLeaderOwnedActivation();

    // Grown follower with bootstrap replicaIds.length === 1 must not skip Raft
    // replication and locally apply CDC events as if it were still solo.
    port.setRole('follower');
    service.role = 'follower';
    service.isLeader = false;
    let appliedImmediateCount = 0;
    const origApplyImmediate = service.cdcHandler.applyImmediate.bind(
      service.cdcHandler);
    service.cdcHandler.applyImmediate = (...args) => {
      appliedImmediateCount += 1;
      return origApplyImmediate(...args);
    };
    await assert.rejects(
      () => service.applyCDCBatch([{
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.INSERT,
        data: {node_id: 'n-grown'},
      }], {skipSubscriptionCheck: true}),
      /leader is unknown/i,
      'grown follower message group must require Raft replication / leader forwarding',
    );
    assert.equal(appliedImmediateCount, 0,
      'grown follower message group must not locally apply CDC without Raft replication');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('PartitionService applyRaftTimingConfig passes rearmTimer: true for ' +
  'started single-replica founder', async () => {
  configure();
  const partition = new PartitionService(withFoundingStamp({
    partitionId: 'seed-timing-rearm-p1',
    tableId: 'seed_timing_rearm',
    replicaId: 'seed-timing-rearm-p1-r1',
    replicaIds: ['seed-timing-rearm-p1-r1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
    deferElection: true,
  }));
  try {
    await partition.initialize();
    partition.startElection();

    const logPayloads = [];
    const origInfo = partition.logger.info.bind(partition.logger);
    partition.logger = {
      ...partition.logger,
      info: (msg, payload) => {
        logPayloads.push({msg, payload});
        return origInfo(msg, payload);
      },
      debug: () => {},
      warn: () => {},
      error: () => {},
    };

    partition.applyRaftTimingConfig({
      heartbeatIntervalMs: 50,
      electionTimeoutMinMs: 1000,
      electionTimeoutMaxMs: 3000,
      tickIntervalMs: 20,
    });

    const timingEntry = logPayloads.find((entry) =>
      entry.payload?.rearmTimer !== undefined);
    assert.ok(timingEntry,
      'applyRaftTimingConfig must log runtime timing application');
    assert.equal(timingEntry.payload.rearmTimer, true,
      'started single-replica founder must pass rearmTimer: true');
    assert.ok(HEARTBEAT_OBSERVE_BUDGET_MS > 0);
  } finally {
    await partition.shutdown();
  }
});

test('single-replica deferred founder yields naturally to joiners after RF3 ' +
  'growth, then arms ticks on step-down so surviving quorum fails over',
async () => {
  configure();
  const harness = createCommittedMembershipHarness('seed-natural-handoff-p1');
  try {
    const seed = harness.build(SEED_REPLICA, {
      replicaIds: [SEED_REPLICA[0]],
      peerAddresses: [`${SEED_REPLICA[1]}/partition/${SEED_REPLICA[0]}`],
      cache: metadataCache(harness.partitionId, [SEED_REPLICA]),
      deferElection: true,
    });
    const startedTimerPayloads = [];
    const origInfo = seed.logger.info.bind(seed.logger);
    seed.logger = {
      ...seed.logger,
      info: (msg, payload) => {
        if (msg === 'Starting Raft election timer') {
          startedTimerPayloads.push(payload);
        }
        return origInfo(msg, payload);
      },
      debug: () => {},
      warn: () => {},
      error: () => {},
    };

    await seed.initialize();
    assert.equal(await waitFor(() => statusOf(seed).appliedIndex > 0), true,
      'single-replica seed must lead and apply its genesis no-op');

    seed.startElection();
    assert.equal(seed.electionStarted, true,
      'startElection must mark electionStarted on solo founder');
    assert.equal(seed.deferredFounderSchedulingPending, true,
      'solo term-1 founder must defer periodic tick scheduling until handoff');
    assert.equal(startedTimerPayloads.length, 0,
      'solo term-1 founder must not start periodic heartbeat ticks at startElection');

    await addJoiner(harness, JOINER_TWO, [SEED_REPLICA]);
    await addJoiner(harness, JOINER_THREE, [SEED_REPLICA, JOINER_TWO]);

    const r2 = harness.services.get(JOINER_TWO[0]);
    const r3 = harness.services.get(JOINER_THREE[0]);

    // Without transferLeadership, joiners must naturally take leadership at
    // term >= 2 instead of staying pinned on seed's term-1 heartbeat flood.
    const naturalTakeoverOk = await waitFor(() => {
      const joinerLeader = [r2, r3].find((svc) =>
        svc.isLeader && statusOf(svc).term > 1);
      return Boolean(
        joinerLeader &&
        !seed.isLeader &&
        statusOf(seed).leaderId === joinerLeader.replicaId,
      );
    }, NATURAL_HANDOFF_BUDGET_MS);
    assert.equal(
      naturalTakeoverOk,
      true,
      'joiner {r2, r3} must naturally win term >= 2 after RF3 growth ' +
      `(seed: role=${seed.role} term=${statusOf(seed).term} ` +
      `leader=${statusOf(seed).leaderId})`,
    );

    // Stepping down from initial term-1 founder tenure must immediately arm
    // Raft tick scheduling on seed so its check_quorum lease never freezes.
    assert.equal(seed.deferredFounderSchedulingPending, false,
      'stepping down to term >= 2 must clear deferredFounderSchedulingPending');
    assert.equal(startedTimerPayloads.length, 1,
      'stepping down from initial founder tenure must arm Raft ticks once');

    const activeJoinerLeader = r2.isLeader ? r2 : r3;
    const survivingJoiner = activeJoinerLeader === r2 ? r3 : r2;
    const termBeforeStop = statusOf(activeJoinerLeader).term;

    await activeJoinerLeader.shutdown();

    const failoverOk = await waitFor(() => {
      const survivorLeader = [seed, survivingJoiner].find((svc) =>
        svc.isLeader && statusOf(svc).term > termBeforeStop);
      return Boolean(
        survivorLeader &&
        statusOf(seed).leaderId === survivorLeader.replicaId &&
        statusOf(survivingJoiner).leaderId === survivorLeader.replicaId,
      );
    }, NATURAL_HANDOFF_BUDGET_MS);
    assert.equal(
      failoverOk,
      true,
      'surviving 2-of-3 quorum {seed, survivingJoiner} must elect a new leader ' +
      'after the naturally elected joiner leader stops ' +
      `(seed: role=${seed.role} term=${statusOf(seed).term} ` +
      `leader=${statusOf(seed).leaderId}; survivor: role=${survivingJoiner.role} ` +
      `term=${statusOf(survivingJoiner).term} leader=${statusOf(survivingJoiner).leaderId})`,
    );
  } finally {
    await harness.dispose();
  }
});
