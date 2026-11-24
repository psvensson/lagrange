// Regression tests for single-replica deferred-election Raft tick scheduling
// and stale bootstrap replicaIds.length === 1 checks after ConfChange growth.
//
// Proves:
// 1. A real 1-replica PartitionService opened with deferElection: true (the
//    exact seed-partitions-phase.js contract) starts Raft tick scheduling on
//    startElection() and arms ticks upon RF1 -> RF2/RF3 growth. After
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
// 4. While a 1-replica founder stays genuinely solo (RF1), periodic ticks remain
//    deferred; the instant committed membership grows beyond solo (RF1 -> RF2/
//    RF3) while still leader in term 1 before any handoff, ticks start
//    immediately. Isolating the founder before its first handoff expires
//    check_quorum and demotes it so leader-qualified reads fail closed, and
//    healing connectivity restores convergence and read/write service.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';

import {
  addressOf,
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
import {
  resumeFixtureParticipantGroupAdmission,
} from '../test-helpers/participant-transaction-fixture.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {
  LEADER_READ_REQUEST_FIELD,
  LEADER_REQUIRED_READ,
  OWNER_FACT_UNAVAILABLE_REASON,
  leaderReadRequestOf,
} from '../../src/control-plane/control-plane-owner-fact-read-contract.js';
import {
  PartitionService,
} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_RESPONSE,
} from '../../src/partition/partition-service-constants.js';
import {decodeTypedRowSet} from '../../src/query/sql-value-codec.js';
import {
  materializeAndPresentRowObjects,
} from '../../src/query/sql-value-presentation.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
} from '../../src/raft/raft-operation-port-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';

setTestPortBase(26500);

const SCHEDULING_STARTED = 'start';
const FAILOVER_BUDGET_MS = 4000;
const CONVERGENCE_BUDGET_MS = 8000;
const LEADER_TRANSFER_BUDGET_MS = 4000;
const HEARTBEAT_OBSERVE_BUDGET_MS = 1500;
const CHECK_QUORUM_MIN_WAIT_MS = 100;
const SEED_REPLICA = ['seed-p1-r1', 'node-1'];
const JOINER_TWO = ['seed-p1-r2', 'node-2'];
const JOINER_THREE = ['seed-p1-r3', 'node-3'];
const INSERT_ROW_SQL =
  'INSERT INTO committed_membership_table (seq) VALUES (?)';
const SELECT_ROWS_SQL =
  'SELECT seq FROM committed_membership_table ORDER BY seq';
const QUERY_MESSAGE_TYPE = 'QUERY';
const FOLLOWER_ROLE = RAFT_ROLE.FOLLOWER;
const LEADER_ROLE = RAFT_ROLE.LEADER;
const REDIRECT_RESPONSE = PARTITION_SERVICE_RESPONSE.LEADER_REDIRECT;
const INITIAL_SEQ = 1;
const HEALED_SEQ = 2;

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

async function waitForAsync(predicate, boundMs = CONVERGENCE_BUDGET_MS) {
  const deadline = Date.now() + boundMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await delay(10);
  }
  return Boolean(await predicate());
}

function readRemoteSeqs(answer) {
  if (Array.isArray(answer?.rows)) {
    return answer.rows.map((row) => Number(row.seq));
  }
  const decoded = decodeTypedRowSet(answer.rowSet);
  return materializeAndPresentRowObjects(decoded.columns, decoded.rows)
    .map((row) => Number(row.seq));
}

function readLeaderQualified(service, leaderRead = LEADER_REQUIRED_READ) {
  return service.handleRemoteQuery({
    type: QUERY_MESSAGE_TYPE,
    sql: SELECT_ROWS_SQL,
    params: [],
    [LEADER_READ_REQUEST_FIELD]: leaderRead,
  });
}

async function commitRemoteSeq(service, seq, entryId) {
  const result = await service.handleRemoteQuery({
    type: QUERY_MESSAGE_TYPE,
    sql: INSERT_ROW_SQL,
    params: [seq],
    entryId,
  });
  assert.equal(
    result.success,
    true,
    `write seq=${seq} must commit on ${service.replicaId}: ${JSON.stringify(result)}`,
  );
}

function deriveJoinerElectionBudgetMs(services) {
  const maxJoinerElectionMaxMs = Math.max(...services.map((svc) => {
    const electionMaxMs = svc.effectiveRaftTiming()?.effective?.effectiveElectionMaxMs;
    assert.ok(
      Number.isFinite(electionMaxMs) && electionMaxMs > 0,
      `${svc.replicaId} must report positive effectiveElectionMaxMs`,
    );
    return electionMaxMs;
  }));
  return Math.max(CONVERGENCE_BUDGET_MS, maxJoinerElectionMaxMs * 2);
}

test('single-replica deferred founder starts ticks on committed RF2/RF3 ' +
  'growth before handoff, demotes on pre-handoff isolation, and heals cleanly',
async () => {
  configure();
  const harness = createCommittedMembershipHarness('seed-pre-handoff-iso-p1');
  try {
    const seed = harness.build(SEED_REPLICA, {
      replicaIds: [SEED_REPLICA[0]],
      peerAddresses: [addressOf(SEED_REPLICA)],
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
      'solo term-1 founder must defer periodic ticks while RF1');
    assert.equal(startedTimerPayloads.length, 0,
      'solo term-1 founder must not start periodic ticks at startElection');
    assert.equal(seed.isSoloReplicaGroup(), true,
      'founder must still report solo replica group before ConfChange growth');

    // Grow RF1 -> RF2 via production ConfChange admission: ticks must start
    // immediately while the founder is still leader in term 1 before handoff.
    await addJoiner(harness, JOINER_TWO, [SEED_REPLICA]);
    assert.equal(seed.isLeader, true,
      'founder must still be leader in term 1 immediately after RF2 growth');
    assert.equal(statusOf(seed).term, 1,
      'founder must still be in term 1 before any handoff');
    assert.equal(seed.isSoloReplicaGroup(), false,
      'committed RF2 growth must clear solo-group state');
    assert.equal(seed.deferredFounderSchedulingPending, false,
      'committed RF1 -> RF2 growth must clear deferredFounderSchedulingPending');
    assert.equal(startedTimerPayloads.length, 1,
      'committed RF1 -> RF2 growth must start the founder Raft tick timer once');

    await addJoiner(harness, JOINER_THREE, [SEED_REPLICA, JOINER_TWO]);
    const r2 = harness.services.get(JOINER_TWO[0]);
    const r3 = harness.services.get(JOINER_THREE[0]);
    assert.equal(seed.isLeader, true,
      'founder must remain term-1 leader prior to isolation or handoff');
    assert.equal(statusOf(seed).term, 1,
      'founder term must still be 1 prior to isolation');
    assert.equal(seed.deferredFounderSchedulingPending, false,
      'RF3 founder must keep deferredFounderSchedulingPending cleared');
    assert.equal(startedTimerPayloads.length, 1,
      'RF3 growth must not re-start the founder Raft tick timer twice');

    await resumeFixtureParticipantGroupAdmission([seed, r2, r3], waitForAsync);
    await commitRemoteSeq(seed, INITIAL_SEQ, 'pre-isolation-seq-1');
    const preIsolationRead = await readLeaderQualified(seed);
    assert.equal(preIsolationRead.success, true,
      'term-1 RF3 leader must serve leader-qualified read before isolation');
    assert.deepEqual(readRemoteSeqs(preIsolationRead), [INITIAL_SEQ]);
    assert.equal(preIsolationRead.readAuthorityWitness?.role, LEADER_ROLE);
    assert.equal(preIsolationRead.readAuthorityWitness?.term, 1);

    // Isolate the founder BEFORE its first leadership handoff while keeping
    // its local handleRemoteQuery receiver reachable.
    harness.network.cut(addressOf(SEED_REPLICA), statusOf(seed).peerId);

    const joinerElectionBudgetMs = deriveJoinerElectionBudgetMs([r2, r3]);
    const joinerElectionOk = await waitFor(() => {
      const joinerLeader = [r2, r3].find((svc) =>
        svc.isLeader && statusOf(svc).term > 1);
      if (!joinerLeader) {
        return false;
      }
      const otherJoiner = joinerLeader === r2 ? r3 : r2;
      return statusOf(otherJoiner).leaderId === joinerLeader.replicaId;
    }, joinerElectionBudgetMs);
    assert.equal(joinerElectionOk, true,
      'surviving joiner quorum {r2, r3} must elect a term >= 2 leader');

    // Advance beyond the founder's effective check_quorum election bound and
    // verify active ticks demote the isolated term-1 leader.
    const checkQuorumBoundMs =
      seed.effectiveRaftTiming()?.effective?.effectiveElectionMaxMs ?? 300;
    await delay(checkQuorumBoundMs + CHECK_QUORUM_MIN_WAIT_MS);
    const seedDemoted = await waitFor(() =>
      !seed.isLeader &&
      seed.role !== LEADER_ROLE &&
      statusOf(seed).role !== LEADER_ROLE, FAILOVER_BUDGET_MS);
    assert.equal(seedDemoted, true,
      'active ticks on isolated term-1 founder must expire check_quorum and ' +
      `demote it (role=${seed.role} statusRole=${statusOf(seed).role} ` +
      `term=${statusOf(seed).term})`);
    assert.equal(seed.role, FOLLOWER_ROLE,
      'isolated founder service role must demote to follower');
    assert.equal(statusOf(seed).term, 1,
      'isolated founder demotion must come from check_quorum, not higher term');

    const isolatedAuthority = seed.raft.observeCurrentAuthority();
    assert.notEqual(isolatedAuthority.role, LEADER_ROLE,
      'observeCurrentAuthority must not report LEADER after check_quorum');
    assert.equal(isolatedAuthority.tickBacklog, 0,
      'isolated founder must not rely on tickBacklog masking frozen ticks');

    const isolatedLeaderRead = await readLeaderQualified(
      seed, LEADER_REQUIRED_READ);
    assert.equal(isolatedLeaderRead.success, false,
      'leader-qualified read on isolated founder must fail closed');
    assert.equal(
      isolatedLeaderRead.failureCode,
      OWNER_FACT_UNAVAILABLE_REASON.NOT_LEADER,
    );
    assert.equal(isolatedLeaderRead.rows, undefined);
    assert.equal(isolatedLeaderRead.rowSet, undefined);
    assert.notEqual(isolatedLeaderRead.readAuthorityWitness?.role, LEADER_ROLE);

    const isolatedOwnerFactRead = await readLeaderQualified(
      seed,
      leaderReadRequestOf({
        partitionId: harness.partitionId,
        index: INITIAL_SEQ,
        term: 1,
      }),
    );
    assert.equal(isolatedOwnerFactRead.success, false,
      'owner-fact leader read on isolated founder must fail closed');
    assert.equal(
      isolatedOwnerFactRead.failureCode,
      OWNER_FACT_UNAVAILABLE_REASON.NOT_LEADER,
    );
    assert.equal(isolatedOwnerFactRead.rows, undefined);
    assert.equal(isolatedOwnerFactRead.rowSet, undefined);

    // Heal connectivity and prove useful recovery: seed converges to the
    // joiner leader's term and the healed RF3 group serves writes and reads.
    harness.network.heal();

    const healedConvergenceOk = await waitFor(() => {
      const currentLeader = [r2, r3].find((svc) =>
        svc.isLeader && statusOf(svc).term > 1);
      if (!currentLeader) {
        return false;
      }
      const leaderTerm = statusOf(currentLeader).term;
      return (
        !seed.isLeader &&
        statusOf(seed).term === leaderTerm &&
        statusOf(seed).leaderId === currentLeader.replicaId &&
        statusOf(seed).appliedIndex >= statusOf(currentLeader).commitIndex
      );
    }, CONVERGENCE_BUDGET_MS);
    assert.equal(healedConvergenceOk, true,
      'healed founder must converge to the new term and leader');

    const currentLeader = r2.isLeader ? r2 : r3;
    const healedTerm = statusOf(currentLeader).term;
    await resumeFixtureParticipantGroupAdmission([seed, r2, r3], waitForAsync);
    await commitRemoteSeq(currentLeader, HEALED_SEQ, 'healed-seq-2');

    const healedLeaderRead = await readLeaderQualified(currentLeader);
    assert.equal(healedLeaderRead.success, true,
      'healed RF3 leader must serve leader-qualified reads cleanly');
    assert.deepEqual(
      readRemoteSeqs(healedLeaderRead),
      [INITIAL_SEQ, HEALED_SEQ],
    );
    assert.equal(healedLeaderRead.readAuthorityWitness?.role, LEADER_ROLE);
    assert.equal(healedLeaderRead.readAuthorityWitness?.term, healedTerm);

    const healedSeedRedirect = await readLeaderQualified(seed);
    assert.equal(healedSeedRedirect.success, false);
    assert.equal(
      healedSeedRedirect.failureCode,
      OWNER_FACT_UNAVAILABLE_REASON.NOT_LEADER,
    );
    assert.equal(healedSeedRedirect.redirect, REDIRECT_RESPONSE);
    assert.equal(
      healedSeedRedirect.leaderAddress,
      currentLeader.unifiedAddress,
    );

    const seedReplicatedOk = await waitFor(() =>
      statusOf(seed).appliedIndex >= statusOf(currentLeader).commitIndex,
    CONVERGENCE_BUDGET_MS);
    assert.equal(seedReplicatedOk, true,
      'healed founder must replicate writes committed after recovery');
    const seedFollowerRead = await seed.handleRemoteQuery({
      type: QUERY_MESSAGE_TYPE,
      sql: SELECT_ROWS_SQL,
      params: [],
    });
    assert.equal(seedFollowerRead.success, true);
    assert.deepEqual(
      readRemoteSeqs(seedFollowerRead),
      [INITIAL_SEQ, HEALED_SEQ],
    );
  } finally {
    await harness.dispose();
  }
});
