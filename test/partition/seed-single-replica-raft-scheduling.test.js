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
  requestAdmission,
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
  RAFT_AUTHORITY_OBSERVATION,
  RAFT_EVENT,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {
  RAFT_AUTHORITY_CLOCK_UNSETTLED_REASON,
  isPortScheduling,
  readPortClockObligation,
  readPortEffectiveRaftTiming,
} from '../../src/raft/raft-rs-operation-port.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

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

function hasElectedJoinerQuorumLeader(r2, r3) {
  const joinerLeader = [r2, r3].find((svc) =>
    svc.isLeader && statusOf(svc).term > 1);
  if (!joinerLeader) {
    return false;
  }
  const otherJoiner = joinerLeader === r2 ? r3 : r2;
  return statusOf(otherJoiner).leaderId === joinerLeader.replicaId;
}

function hasHealedFounderConverged(seed, r2, r3) {
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
}

function resolveCheckQuorumBoundMs(service) {
  return service.effectiveRaftTiming()?.effective?.effectiveElectionMaxMs || 300;
}

function selectJoinerLeader(r2, r3) {
  return r2.isLeader ? r2 : r3;
}

function assertLeaderReadResult(readResult, expectedSeqs, expectedTerm) {
  assert.equal(readResult.success, true);
  assert.deepEqual(readRemoteSeqs(readResult), expectedSeqs);
  assert.equal(readResult.readAuthorityWitness?.role, LEADER_ROLE);
  assert.equal(readResult.readAuthorityWitness?.term, expectedTerm);
}

function assertRefusedIsolatedLeaderRead(readResult) {
  assert.equal(readResult.success, false);
  assert.equal(readResult.failureCode, OWNER_FACT_UNAVAILABLE_REASON.NOT_LEADER);
  assert.equal(readResult.rows, undefined);
  assert.equal(readResult.rowSet, undefined);
  assert.notEqual(readResult.readAuthorityWitness?.role, LEADER_ROLE);
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
    assert.equal(readPortClockObligation(seed.raft)?.clockRequired, false,
      'solo term-1 founder must start with clockRequired === false');
    assert.equal(seed.isScheduling(), false,
      'solo term-1 founder must not arm periodic timer while RF1');
    assert.equal(isPortScheduling(seed.raft), false,
      'port isPortScheduling must be false while in solo-founder deferral');
    assert.equal(seed.raft.observeCurrentAuthority().clockRequired, false,
      'observeCurrentAuthority must report clockRequired === false while RF1');

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
    assert.equal(readPortClockObligation(seed.raft)?.clockRequired, true,
      'committed RF1 -> RF2 transition must make clockRequired === true');
    assert.equal(seed.isScheduling(), true,
      'committed RF1 -> RF2 transition must arm periodic scheduler immediately');
    assert.equal(isPortScheduling(seed.raft), true,
      'port isPortScheduling must be true immediately after RF1 -> RF2');
    assert.equal(seed.raft.observeCurrentAuthority().clockRequired, true,
      'observeCurrentAuthority must report clockRequired === true after RF2');
    assert.equal(seed.raft.observeCurrentAuthority().clockArmed, true,
      'observeCurrentAuthority must report clockArmed === true after RF2');
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
    assert.equal(readPortClockObligation(seed.raft)?.clockRequired, true,
      'RF3 founder must keep clockRequired === true');
    assert.equal(seed.isScheduling(), true,
      'RF3 founder must keep periodic scheduling active');
    assert.equal(startedTimerPayloads.length, 1,
      'RF3 growth must not re-start the founder Raft tick timer twice');

    await resumeFixtureParticipantGroupAdmission([seed, r2, r3], waitForAsync);
    await commitRemoteSeq(seed, INITIAL_SEQ, 'pre-isolation-seq-1');
    const preIsolationRead = await readLeaderQualified(seed);
    assertLeaderReadResult(preIsolationRead, [INITIAL_SEQ], 1);

    // Isolate the founder BEFORE its first leadership handoff while keeping
    // its local handleRemoteQuery receiver reachable.
    harness.network.cut(addressOf(SEED_REPLICA), statusOf(seed).peerId);

    const joinerElectionBudgetMs = deriveJoinerElectionBudgetMs([r2, r3]);
    const joinerElectionOk = await waitFor(
      () => hasElectedJoinerQuorumLeader(r2, r3),
      joinerElectionBudgetMs,
    );
    assert.equal(joinerElectionOk, true,
      'surviving joiner quorum {r2, r3} must elect a term >= 2 leader');

    // Advance beyond the founder's effective check_quorum election bound and
    // verify active ticks demote the isolated term-1 leader.
    await delay(resolveCheckQuorumBoundMs(seed) + CHECK_QUORUM_MIN_WAIT_MS);
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
    assertRefusedIsolatedLeaderRead(isolatedLeaderRead);

    const isolatedOwnerFactRead = await readLeaderQualified(
      seed,
      leaderReadRequestOf({
        partitionId: harness.partitionId,
        index: INITIAL_SEQ,
        term: 1,
      }),
    );
    assertRefusedIsolatedLeaderRead(isolatedOwnerFactRead);

    // Heal connectivity and prove useful recovery: seed converges to the
    // joiner leader's term and the healed RF3 group serves writes and reads.
    harness.network.heal();

    const healedConvergenceOk = await waitFor(
      () => hasHealedFounderConverged(seed, r2, r3),
      CONVERGENCE_BUDGET_MS,
    );
    assert.equal(healedConvergenceOk, true,
      'healed founder must converge to the new term and leader');

    const currentLeader = selectJoinerLeader(r2, r3);
    const healedTerm = statusOf(currentLeader).term;
    await resumeFixtureParticipantGroupAdmission([seed, r2, r3], waitForAsync);
    await commitRemoteSeq(currentLeader, HEALED_SEQ, 'healed-seq-2');

    const healedLeaderRead = await readLeaderQualified(currentLeader);
    assertLeaderReadResult(
      healedLeaderRead,
      [INITIAL_SEQ, HEALED_SEQ],
      healedTerm,
    );

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

test('reconstructing an existing RF3 replica from durable SQLite storage ' +
  'starts with clockRequired === true and active scheduling without a new ' +
  'membership-change event', async () => {
  configure();
  const harness = createCommittedMembershipHarness('seed-rf3-reconstruct-p1');
  try {
    const seed = harness.build(SEED_REPLICA, {
      replicaIds: [SEED_REPLICA[0]],
      peerAddresses: [addressOf(SEED_REPLICA)],
      cache: metadataCache(harness.partitionId, [SEED_REPLICA]),
      deferElection: true,
    });
    await seed.initialize();
    assert.equal(await waitFor(() => statusOf(seed).appliedIndex > 0), true);
    seed.startElection();
    assert.equal(readPortClockObligation(seed.raft)?.clockRequired, false);
    assert.equal(seed.isScheduling(), false);

    await addJoiner(harness, JOINER_TWO, [SEED_REPLICA]);
    await addJoiner(harness, JOINER_THREE, [SEED_REPLICA, JOINER_TWO]);
    const r2 = harness.services.get(JOINER_TWO[0]);
    const r3 = harness.services.get(JOINER_THREE[0]);
    await resumeFixtureParticipantGroupAdmission([seed, r2, r3], waitForAsync);
    await commitRemoteSeq(seed, INITIAL_SEQ, 'rf3-reconstruct-seq-1');

    const oldSeedPort = seed.raft;
    await seed.shutdown();
    assert.equal(isPortScheduling(oldSeedPort), false,
      'shutting down RF3 founder must clear its periodic scheduler');
    assert.equal(readPortClockObligation(oldSeedPort)?.clockRequired, false,
      'closed port must end its clock obligation');

    // Reopen seed from the same durable SQLite storage (keeping its original
    // single-founder replicaIds array so only durable SQLite ConfState proves
    // it is already an RF3 member).
    const allMembers = [SEED_REPLICA, JOINER_TWO, JOINER_THREE];
    const reopenedSeed = harness.build(SEED_REPLICA, {
      replicaIds: [SEED_REPLICA[0]],
      peerAddresses: [addressOf(SEED_REPLICA)],
      cache: metadataCache(harness.partitionId, allMembers),
      deferElection: true,
    });
    await reopenedSeed.initialize();

    let membershipEventsAfterOpen = 0;
    let confChangeEventsAfterOpen = 0;
    reopenedSeed.raft.subscribe(RAFT_EVENT.MEMBERSHIP_CHANGED, () => {
      membershipEventsAfterOpen += 1;
    });
    reopenedSeed.raft.subscribe(RAFT_EVENT.CONF_CHANGE_APPLIED, () => {
      confChangeEventsAfterOpen += 1;
    });

    assert.equal(
      readPortClockObligation(reopenedSeed.raft)?.clockRequired,
      true,
      'reconstructed RF3 replica must start with clockRequired === true ' +
      'from durable SQLite storage before any new membership event',
    );
    assert.equal(
      reopenedSeed.raft.observeCurrentAuthority().clockRequired,
      true,
      'observeCurrentAuthority on reconstructed RF3 replica must report ' +
      'clockRequired === true immediately',
    );

    reopenedSeed.startElection();
    assert.equal(membershipEventsAfterOpen, 0,
      'reconstructed RF3 scheduling must not depend on MEMBERSHIP_CHANGED');
    assert.equal(confChangeEventsAfterOpen, 0,
      'reconstructed RF3 scheduling must not depend on CONF_CHANGE_APPLIED');
    assert.equal(reopenedSeed.deferredFounderSchedulingPending, false,
      'reconstructed RF3 replica must not enter solo-founder deferral');
    assert.equal(
      readPortClockObligation(reopenedSeed.raft)?.clockRequired,
      true,
      'reconstructed RF3 replica must retain clockRequired === true',
    );
    assert.equal(reopenedSeed.isScheduling(), true,
      'reconstructed RF3 replica must arm periodic scheduling immediately');
    assert.equal(isPortScheduling(reopenedSeed.raft), true,
      'reconstructed RF3 port must report isPortScheduling === true');
    assert.equal(
      reopenedSeed.raft.observeCurrentAuthority().clockArmed,
      true,
      'reconstructed RF3 authority observation must report clockArmed === true',
    );

    const convergedAfterReopen = await waitFor(() => {
      const activeLeader = [reopenedSeed, r2, r3].find((svc) => svc.isLeader);
      if (!activeLeader) {
        return false;
      }
      return (
        statusOf(reopenedSeed).leaderId === activeLeader.replicaId &&
        statusOf(reopenedSeed).appliedIndex >= statusOf(activeLeader).commitIndex
      );
    }, deriveJoinerElectionBudgetMs([reopenedSeed, r2, r3]));
    assert.equal(convergedAfterReopen, true,
      'reconstructed RF3 replica must actively tick and converge with quorum');
  } finally {
    await harness.dispose();
  }
});

const RAFT_TICK_TIMER_MAX_DELAY_MS = 500;

function createFailableTimeSource(baseTimeSource) {
  const activeTimers = new Set();
  let failSetInterval = false;
  let failedAttempts = 0;
  const wrapped = {
    now: () => baseTimeSource.now(),
    setTimeout: (...args) => baseTimeSource.setTimeout(...args),
    clearTimeout: (handle) => baseTimeSource.clearTimeout(handle),
    setInterval: (callback, delayMs, ...args) => {
      const isRaftTickTimer =
        Number.isFinite(delayMs) && delayMs <= RAFT_TICK_TIMER_MAX_DELAY_MS;
      if (isRaftTickTimer && failSetInterval) {
        failedAttempts += 1;
        throw new Error('injected timer registration failure');
      }
      const handle = baseTimeSource.setInterval(callback, delayMs, ...args);
      if (isRaftTickTimer) {
        activeTimers.add(handle);
      }
      return handle;
    },
    clearInterval: (handle) => {
      activeTimers.delete(handle);
      return baseTimeSource.clearInterval(handle);
    },
    setFailSetInterval: (nextValue) => {
      failSetInterval = nextValue === true;
    },
    getFailedAttempts: () => failedAttempts,
    getActiveTimerCount: () => activeTimers.size,
  };
  return wrapped;
}

test('deliberate regression control: failed or suppressed required clock ' +
  'with tickBacklog === 0 fails closed in observeCurrentAuthority and ' +
  'leader-qualified read receivers', async () => {
  configure();
  const harness = createCommittedMembershipHarness('seed-clock-fail-closed-p1');
  try {
    const seed = harness.build(SEED_REPLICA, {
      replicaIds: [SEED_REPLICA[0]],
      peerAddresses: [addressOf(SEED_REPLICA)],
      cache: metadataCache(harness.partitionId, [SEED_REPLICA]),
      deferElection: true,
    });
    const failableClock = createFailableTimeSource(seed.timeSource);
    seed.providedTimeSource = failableClock;
    seed.timeSource = failableClock;

    await seed.initialize();
    assert.equal(await waitFor(() => statusOf(seed).appliedIndex > 0), true);
    seed.startElection();

    // While RF1 solo founder in term 1, clockRequired is false and leader
    // authority is settled.
    await resumeFixtureParticipantGroupAdmission([seed], waitForAsync);
    await commitRemoteSeq(seed, INITIAL_SEQ, 'clock-control-seq-1');
    const soloAuth = seed.raft.observeCurrentAuthority();
    assert.equal(soloAuth.clockRequired, false);
    assert.equal(soloAuth.clockArmed, false);
    assert.equal(soloAuth.tickBacklog, 0);
    assert.equal(soloAuth.role, LEADER_ROLE);

    // Inject timer-registration failure right before committed RF1 -> RF2
    // growth so the automatic clock transition fails to register its timer.
    failableClock.setFailSetInterval(true);
    await addJoiner(harness, JOINER_TWO, [SEED_REPLICA]);
    assert.equal(failableClock.getFailedAttempts() >= 1, true,
      'automatic RF1 -> RF2 clock arming must have attempted setInterval');
    assert.equal(statusOf(seed).role, LEADER_ROLE,
      'raw core status still reports leader in term 1');
    assert.equal(statusOf(seed).term, 1);
    assert.equal(readPortClockObligation(seed.raft)?.clockRequired, true,
      'clockRequired must be true after committed RF1 -> RF2 growth');
    assert.equal(seed.isScheduling(), false,
      'clock must report unarmed when setInterval failed');

    const failedClockAuth = seed.raft.observeCurrentAuthority();
    assert.equal(failedClockAuth.tickBacklog, 0,
      'premise: tickBacklog is 0 when required timer failed to arm');
    assert.equal(failedClockAuth.clockRequired, true);
    assert.equal(failedClockAuth.clockArmed, false);
    assert.equal(
      failedClockAuth.role,
      RAFT_AUTHORITY_OBSERVATION.NOT_SETTLED,
      'observeCurrentAuthority must refuse settled LEADER when required ' +
      'clock failed to arm even with tickBacklog === 0',
    );
    assert.equal(
      failedClockAuth.unsettledReason,
      RAFT_AUTHORITY_CLOCK_UNSETTLED_REASON.REQUIRED_CLOCK_STOPPED,
    );
    assert.equal(failedClockAuth.currentTermApplied, false);

    const failedLeaderRead = await readLeaderQualified(
      seed,
      LEADER_REQUIRED_READ,
    );
    assert.equal(failedLeaderRead.success, false,
      'leader-qualified read must fail closed when required clock is unarmed');
    assert.equal(
      failedLeaderRead.failureCode,
      OWNER_FACT_UNAVAILABLE_REASON.NOT_LEADER,
    );
    assert.equal(failedLeaderRead.rows, undefined);
    assert.equal(failedLeaderRead.rowSet, undefined);
    assert.equal(
      failedLeaderRead.readAuthorityWitness?.role,
      RAFT_AUTHORITY_OBSERVATION.NOT_SETTLED,
    );

    const failedOwnerFactRead = await readLeaderQualified(
      seed,
      leaderReadRequestOf({
        partitionId: harness.partitionId,
        index: INITIAL_SEQ,
        term: 1,
      }),
    );
    assert.equal(failedOwnerFactRead.success, false,
      'owner-fact leader read must fail closed when required clock is unarmed');
    assert.equal(
      failedOwnerFactRead.failureCode,
      OWNER_FACT_UNAVAILABLE_REASON.NOT_LEADER,
    );
    assert.equal(failedOwnerFactRead.rows, undefined);
    assert.equal(failedOwnerFactRead.rowSet, undefined);

    // Valid companion control: restore timer registration, arm scheduling,
    // and prove the exact same leader now reports settled LEADER and serves.
    failableClock.setFailSetInterval(false);
    const rearmed = await turnChainValue(seed.raft.startScheduling());
    assert.equal(rearmed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(seed.isScheduling(), true);
    const healthyAuth = seed.raft.observeCurrentAuthority();
    assert.equal(healthyAuth.clockRequired, true);
    assert.equal(healthyAuth.clockArmed, true);
    assert.equal(healthyAuth.tickBacklog, 0);
    assert.equal(healthyAuth.role, LEADER_ROLE);
    assert.equal(healthyAuth.unsettledReason, null);
    const healthyRead = await readLeaderQualified(seed, LEADER_REQUIRED_READ);
    assert.equal(healthyRead.success, true,
      'valid companion: once required clock is armed, leader read succeeds');
    assert.deepEqual(readRemoteSeqs(healthyRead), [INITIAL_SEQ]);

    // Deliberately suppress/stop scheduling on the grown leader (tickBacklog=0)
    // and verify observeCurrentAuthority and leader reads fail closed again.
    seed.raft.stopScheduling();
    assert.equal(seed.isScheduling(), false);
    const stoppedClockAuth = seed.raft.observeCurrentAuthority();
    assert.equal(stoppedClockAuth.tickBacklog, 0);
    assert.equal(stoppedClockAuth.clockRequired, true);
    assert.equal(stoppedClockAuth.clockArmed, false);
    assert.equal(
      stoppedClockAuth.role,
      RAFT_AUTHORITY_OBSERVATION.NOT_SETTLED,
    );
    assert.equal(
      stoppedClockAuth.unsettledReason,
      RAFT_AUTHORITY_CLOCK_UNSETTLED_REASON.REQUIRED_CLOCK_STOPPED,
    );
    const stoppedLeaderRead = await readLeaderQualified(
      seed,
      LEADER_REQUIRED_READ,
    );
    assert.equal(stoppedLeaderRead.success, false,
      'leader-qualified read must fail closed when required clock is stopped');
    assert.equal(
      stoppedLeaderRead.failureCode,
      OWNER_FACT_UNAVAILABLE_REASON.NOT_LEADER,
    );
    assert.equal(stoppedLeaderRead.rows, undefined);
    assert.equal(stoppedLeaderRead.rowSet, undefined);
  } finally {
    await harness.dispose();
  }
});

test('close and shutdown cleanly end clock obligation and prevent orphaned ' +
  'timers even when a membership transition races with closure', async () => {
  configure();
  const harness = createCommittedMembershipHarness('seed-clock-close-race-p1');
  try {
    const seed = harness.build(SEED_REPLICA, {
      replicaIds: [SEED_REPLICA[0]],
      peerAddresses: [addressOf(SEED_REPLICA)],
      cache: metadataCache(harness.partitionId, [SEED_REPLICA]),
      deferElection: true,
    });
    const trackedClock = createFailableTimeSource(seed.timeSource);
    seed.providedTimeSource = trackedClock;
    seed.timeSource = trackedClock;

    await seed.initialize();
    assert.equal(await waitFor(() => statusOf(seed).appliedIndex > 0), true);
    seed.startElection();
    assert.equal(trackedClock.getActiveTimerCount(), 0);

    // Subscribe a listener that closes the port mid-transition as soon as
    // MEMBERSHIP_CHANGED fires on RF1 -> RF2 growth.
    const port = seed.raft;
    let closedDuringTransition = false;
    port.subscribe(RAFT_EVENT.MEMBERSHIP_CHANGED, () => {
      if (!closedDuringTransition) {
        closedDuringTransition = true;
        port.close();
      }
    });

    const rows = [serviceRow(harness.partitionId, SEED_REPLICA)];
    const {operation} = await createJoinOperation(harness, {
      target: JOINER_TWO,
      rows,
      leaderHint: SEED_REPLICA[1],
    });
    const targetCache = metadataCache(
      harness.partitionId,
      [SEED_REPLICA, JOINER_TWO],
      {leaderNodeId: SEED_REPLICA[1]},
    );
    await buildTargetFromOperation(harness, {
      target: JOINER_TWO,
      operation,
      cache: targetCache,
    });
    harness.caches.get(SEED_REPLICA[0]).applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.INSERT,
      serviceRow(harness.partitionId, JOINER_TWO),
    );
    await requestAdmission(harness, JOINER_TWO).catch(() => undefined);
    assert.equal(closedDuringTransition, true,
      'transition listener must have raced port.close() during RF1 -> RF2');
    assert.equal(trackedClock.getActiveTimerCount(), 0,
      'close() racing with transition must leave 0 active interval timers');
    assert.equal(isPortScheduling(port), false,
      'closed port must report isPortScheduling === false');
    assert.equal(readPortClockObligation(port)?.clockRequired, false,
      'closed port must end its clock obligation');

    const startAfterClose = await turnChainValue(port.startScheduling());
    assert.equal(startAfterClose.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(trackedClock.getActiveTimerCount(), 0,
      'startScheduling after close must not arm any timer');

    const configureAfterClose = await turnChainValue(
      port.configureTick({tickIntervalMs: 10, rearmTimer: true}),
    );
    assert.equal(
      configureAfterClose.outcome,
      RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    );
    assert.equal(trackedClock.getActiveTimerCount(), 0,
      'configureTick after close must not arm any timer');
  } finally {
    await harness.dispose();
  }
});

function isRaftTickDelay(delayMs) {
  return Number.isFinite(delayMs) && delayMs <= RAFT_TICK_TIMER_MAX_DELAY_MS;
}

function findActiveRaftTickTimer(virtualClock) {
  for (const timer of virtualClock._timers.values()) {
    if (timer.repeating && isRaftTickDelay(timer.delayMs)) {
      return timer;
    }
  }
  return null;
}

function createTrackedVirtualTimeSource(startMs = 1000) {
  const virtualClock = new VirtualTimeSource({startMs});
  let setIntervalCalls = 0;
  let clearIntervalCalls = 0;
  let tickFirings = 0;
  return {
    virtualClock,
    now: () => virtualClock.now(),
    setTimeout: (...args) => virtualClock.setTimeout(...args),
    clearTimeout: (handle) => virtualClock.clearTimeout(handle),
    setInterval: (fn, delayMs, ...args) => {
      const isRaftTick = isRaftTickDelay(delayMs);
      if (isRaftTick) {
        setIntervalCalls += 1;
      }
      const wrappedFn = isRaftTick ?
        (...callArgs) => {
          tickFirings += 1;
          return fn(...callArgs);
        } :
        fn;
      return virtualClock.setInterval(wrappedFn, delayMs, ...args);
    },
    clearInterval: (handle) => {
      const entry = virtualClock._timers.get(handle);
      if (entry && entry.repeating && isRaftTickDelay(entry.delayMs)) {
        clearIntervalCalls += 1;
      }
      return virtualClock.clearInterval(handle);
    },
    advance: (ms) => virtualClock.advance(ms),
    getRaftTickTimer: () => findActiveRaftTickTimer(virtualClock),
    getStats: () => ({
      setIntervalCalls,
      clearIntervalCalls,
      tickFirings,
    }),
  };
}

function assertPassiveSubIntervalReads(partition, clock, initialTimerId, tickIntervalMs) {
  for (let step = 1; step <= 12; step += 1) {
    clock.advance(5);
    const expectedTicks = Math.floor((step * 5) / tickIntervalMs);
    const expectedDueAt = 1000 + (expectedTicks + 1) * tickIntervalMs;

    const viaService = partition.effectiveRaftTiming();
    const viaPort = readPortEffectiveRaftTiming(partition.raft);
    assert.equal(viaService.effective.tickIntervalMs, tickIntervalMs);
    assert.equal(viaPort.effective.tickIntervalMs, tickIntervalMs);

    const currentTimer = clock.getRaftTickTimer();
    assert.ok(currentTimer);
    assert.equal(
      currentTimer.id,
      initialTimerId,
      `passive timing read at +${step * 5}ms must preserve timer handle id`,
    );
    assert.equal(
      currentTimer.dueAt,
      expectedDueAt,
      `passive timing read at +${step * 5}ms must preserve next dueAt (${expectedDueAt})`,
    );
    assert.equal(
      clock.getStats().tickFirings,
      expectedTicks,
      `scheduled ticks must fire uninterrupted at +${step * 5}ms`,
    );
  }
}

test('Finding 3 Witness: passive effectiveRaftTiming / readPortEffectiveRaftTiming ' +
  'calls faster than tickIntervalMs preserve timer identity, next due time, and ' +
  'uninterrupted tick progress while rearmTimer: true or changed tickIntervalMs ' +
  'still rearms', async () => {
  configure();
  const clock = createTrackedVirtualTimeSource(1000);
  const partition = new PartitionService(withFoundingStamp({
    partitionId: 'seed-passive-timing-p1',
    tableId: 'seed_passive_timing',
    replicaId: 'seed-passive-timing-p1-r1',
    replicaIds: ['seed-passive-timing-p1-r1', 'seed-passive-timing-p1-r2'],
    nodeId: 'node-1',
    dbPath: ':memory:',
    deferElection: true,
    timeSource: clock,
  }));
  try {
    await partition.initialize();
    partition.startElection();

    const initialTiming = partition.effectiveRaftTiming();
    const tickIntervalMs = initialTiming.effective.tickIntervalMs;
    assert.equal(tickIntervalMs, 20);

    const initialTimer = clock.getRaftTickTimer();
    assert.ok(initialTimer, 'RF2 replica must arm a periodic Raft tick timer');
    const initialTimerId = initialTimer.id;
    assert.equal(initialTimer.dueAt, 1000 + tickIntervalMs);
    assert.equal(clock.getStats().setIntervalCalls, 1);
    assert.equal(clock.getStats().clearIntervalCalls, 0);

    // Poll effectiveRaftTiming() and readPortEffectiveRaftTiming() every 5ms
    // (4x faster than tickIntervalMs=20ms) across 3 full tick intervals (60ms).
    assertPassiveSubIntervalReads(partition, clock, initialTimerId, tickIntervalMs);

    assert.equal(clock.getStats().setIntervalCalls, 1,
      '24 sub-interval passive timing reads must not call setInterval again');
    assert.equal(clock.getStats().clearIntervalCalls, 0,
      '24 sub-interval passive timing reads must not call clearInterval');
    assert.equal(clock.getStats().tickFirings, 3,
      'exact 3 scheduled ticks must have fired across 60ms');

    // Same-cadence configureTick with rearmTimer: false mid-interval (+7ms)
    // must also preserve timer identity and dueAt.
    clock.advance(7);
    assert.equal(clock.now(), 1067);
    await turnChainValue(partition.raft.configureTick({
      tickIntervalMs,
      rearmTimer: false,
    }));
    const sameCadenceTimer = clock.getRaftTickTimer();
    assert.equal(sameCadenceTimer.id, initialTimerId,
      'same-cadence configureTick with rearmTimer: false must preserve timer id');
    assert.equal(sameCadenceTimer.dueAt, 1080,
      'same-cadence configureTick with rearmTimer: false must preserve dueAt=1080');

    // Explicit rearmTimer: true at t=1067 MUST rearm and anchor dueAt=1087.
    await turnChainValue(partition.raft.configureTick({
      tickIntervalMs,
      rearmTimer: true,
    }));
    const rearmedTimer = clock.getRaftTickTimer();
    assert.notEqual(rearmedTimer.id, initialTimerId,
      'explicit rearmTimer: true must register a fresh interval timer');
    assert.equal(rearmedTimer.dueAt, 1067 + tickIntervalMs,
      'explicit rearmTimer: true must re-anchor dueAt to now + tickIntervalMs');

    // Changing tickIntervalMs (20ms -> 25ms) via applyRaftTimingConfig
    // (preserving createdCoreTuning ticks) MUST rearm at the new 25ms cadence.
    clock.advance(5);
    assert.equal(clock.now(), 1072);
    const {heartbeatTick, electionTick} = initialTiming.createdCoreTuning;
    const appliedNewCadence = partition.applyRaftTimingConfig({
      heartbeatIntervalMs: heartbeatTick * 25,
      electionTimeoutMinMs: electionTick * 25,
      electionTimeoutMaxMs: electionTick * 50,
      tickIntervalMs: 25,
    });
    assert.equal(appliedNewCadence, true);
    const changedCadenceTimer = clock.getRaftTickTimer();
    assert.notEqual(changedCadenceTimer.id, rearmedTimer.id,
      'changing tickIntervalMs must replace the interval timer');
    assert.equal(changedCadenceTimer.delayMs, 25);
    assert.equal(changedCadenceTimer.dueAt, 1072 + 25);

    // Changing tickIntervalMs (25ms -> 30ms) with rearmTimer: false must also
    // replace the timer because the cadence changed.
    clock.advance(4);
    assert.equal(clock.now(), 1076);
    const appliedWithoutRearmFlag = await turnChainValue(
      partition.raft.configureTick({
        heartbeatMs: heartbeatTick * 30,
        electionMinMs: electionTick * 30,
        electionMaxMs: electionTick * 60,
        tickIntervalMs: 30,
        rearmTimer: false,
      }),
    );
    assert.equal(appliedWithoutRearmFlag.appliedToExistingCore, true);
    const cadenceOnlyTimer = clock.getRaftTickTimer();
    assert.notEqual(cadenceOnlyTimer.id, changedCadenceTimer.id,
      'changed tickIntervalMs with rearmTimer: false must still replace the timer');
    assert.equal(cadenceOnlyTimer.delayMs, 30);
    assert.equal(cadenceOnlyTimer.dueAt, 1076 + 30);
  } finally {
    await partition.shutdown();
  }
});
