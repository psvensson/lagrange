// W7 composite A-before-B provisional-to-native route formation witness across
// 3 RF5 target groups, 2 connected routers (window 2) and 2 subscribers.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CDC_OPERATION, TABLES, SERVICE_STATUS} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PEER_ADDRESS_STATUS} from '../../src/raft/raft-rs-runtime-owner-constants.js';
import {
  applyReplicaLeadership,
  applyReplicaDemotion,
} from '../../src/raft/replica-leadership-state.js';
import {
  readCdcObligation,
  readCdcObligationProgress,
  readCdcObligationStanding,
} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {
  PARTITION_CDC_COMMAND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE,
  PARTITION_CDC_OBLIGATION_STANDING,
} from '../../src/partition/partition-cdc-obligation-constants.js';
import {resetCdcObligationLane} from
  '../../src/partition/partition-cdc-obligation-delivery.js';
import {
  CDC_COVERAGE_STATE,
  buildProvisionalCdcOutcome,
  emptyCdcCoverage,
  isProvisionalCdcOutcome,
  unknownCdcAcceptance,
} from '../../src/cdc/cdc-delivery-outcome.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {buildSafeTargets} from '../../src/topology/cdc-group-propagation-routing.js';
import {PRESSURE_GOVERNOR_ACTION} from '../../src/control-plane/pressure-governor.js';
import {
  NODE_A,
  NODE_B,
  SOURCE_GROUP,
  TARGET_GROUPS,
  PARTITION_ID,
  nodeAddressOf,
  registrationInsertForNode,
  pumpMulti,
  driveWithPump,
  prepareMultiTargetProvisionalFixture,
  recordOf,
  payloadOf,
  cdcEvents,
} from './message-group-native-w7-composition.js';
import {
  commandOf,
  assertEnvelope,
  writeReleasedSql,
  buildDualBridgeSubscribers,
  subscribeWithoutEagerDrive,
} from './cdc-source-occurrence-helpers.js';

const DRIVE = PARTITION_CDC_OBLIGATION_DRIVE_STATE;

function assertTargetGroupsPremise(f) {
  for (const [groupId, info] of f.targetGroups.entries()) {
    const firstStatus = info.first.raft.readStatus();
    const followerStatus = info.follower.raft.readStatus();
    assert.notEqual(firstStatus.role, RAFT_ROLE.LEADER);
    assert.equal(firstStatus.leaderId, null);
    assert.equal(firstStatus.leaderAddressStatus, PEER_ADDRESS_STATUS.NO_LEADER);
    assert.equal(followerStatus.role, RAFT_ROLE.FOLLOWER);
    assert.equal(followerStatus.leaderId, info.leaderId);
    assert.equal(followerStatus.leaderAddress, null);
    assert.equal(
      followerStatus.leaderAddressStatus,
      PEER_ADDRESS_STATUS.UNAVAILABLE,
    );
    assert.equal(
      info.follower.systemTableCache.get(TABLES.SERVICES, info.leaderId),
      undefined,
    );
    assert.deepEqual(info.follower.peerAddresses, []);
    assert.equal(info.leader.raft.readStatus().role, RAFT_ROLE.LEADER);
    assert.equal(
      info.first.resolveCDCForwardSelection({
        tableName: TABLES.SERVICES,
        operation: CDC_OPERATION.INSERT,
      }).targets[0].serviceId,
      info.followerId,
    );
    assert.equal(groupId.startsWith('mg-w7-target-'), true);
  }
}

async function seedW7DebtsAndSubscribers(f) {
  const writeA = registrationInsertForNode(f.source, 'w7-route-a', NODE_A);
  const debtA = await writeReleasedSql(
    f.producer,
    f.producerLeader,
    writeA.sql,
    writeA.params,
    writeA.entryId,
    TABLES.SERVICES,
  );
  const debtsB = [];
  for (const [idx, groupId] of TARGET_GROUPS.entries()) {
    const info = f.targetGroups.get(groupId);
    const writeB = registrationInsertForNode(
      info.leader,
      `w7-route-b-${idx + 1}`,
      NODE_B,
    );
    const debtB = await writeReleasedSql(
      f.producer,
      f.producerLeader,
      writeB.sql,
      writeB.params,
      writeB.entryId,
      TABLES.SERVICES,
    );
    debtsB.push(debtB);
  }
  f.debts = [debtA, ...debtsB];
  assert.ok(debtA.logIndex < debtsB[0].logIndex);
  assert.ok(debtsB[0].logIndex < debtsB[1].logIndex);
  assert.ok(debtsB[1].logIndex < debtsB[2].logIndex);

  const {subSeed, subJoin} = buildDualBridgeSubscribers(
    f,
    TABLES.SERVICES,
    PARTITION_ID,
  );
  f.subscribers.push(subSeed, subJoin);
  await subscribeWithoutEagerDrive(f, subSeed, 'w7-seed-sub');
  await subscribeWithoutEagerDrive(f, subJoin, 'w7-join-sub');
  f.subscribersReady = true;
  return {debtA, debtsB, subJoin};
}

function assertProvisionalRoutesHydrated(f, capturedTargets) {
  for (const [groupId, info] of f.targetGroups.entries()) {
    const after = info.follower.raft.readStatus();
    assert.equal(info.follower.raft === info.beforePort, true);
    assert.equal(
      after.lifecycleIncarnation,
      info.beforeStatus.lifecycleIncarnation,
    );
    assert.equal(after.configurationKey, info.beforeStatus.configurationKey);
    assert.deepEqual(after.confState, info.beforeStatus.confState);
    assert.equal(after.role, RAFT_ROLE.FOLLOWER);
    assert.equal(after.leaderId, info.leaderId);
    assert.equal(after.leaderAddressStatus, PEER_ADDRESS_STATUS.RESOLVED);
    assert.equal(after.leaderAddress, nodeAddressOf(NODE_B, info.leaderId));
    const hydratedRow = info.follower.systemTableCache.get(
      TABLES.SERVICES,
      info.leaderId,
    );
    assert.equal(hydratedRow?.status, SERVICE_STATUS.STOPPED);
    assert.ok(
      f.events.some(
        (e) =>
          e.kind === 'actual-peer-reconciliation' &&
          e.groupId === groupId &&
          e.row?.service_id === info.leaderId,
      ),
      `peer reconciliation invoked for ${groupId}`,
    );
  }
  assert.deepEqual(
    buildSafeTargets({
      systemTableCache: f.source.systemTableCache,
      sourceGroupId: SOURCE_GROUP,
    }),
    capturedTargets,
    'STOPPED B rows do not replace the captured FIRST_HOP targets',
  );
}

function findCommittedTargetEventEntry(leaderRecord, eventKey) {
  return leaderRecord.entries.find((entry) => {
    const cmd = commandOf(entry);
    const evs = cmd?.events ?? (cmd ? [cmd] : []);
    return (
      evs.some((item) => item.eventKey === eventKey) &&
      BigInt(leaderRecord.hardState.commit) >= BigInt(entry.index) &&
      BigInt(leaderRecord.appliedIndex) >= BigInt(entry.index)
    );
  });
}

function assertTargetGroupsNativeCommit(f) {
  for (const [groupId, info] of f.targetGroups.entries()) {
    assert.equal(info.follower.raft.readStatus().role, RAFT_ROLE.FOLLOWER);
    assert.notEqual(info.first.raft.readStatus().role, RAFT_ROLE.LEADER);
    const leaderRecord = recordOf(info.leader);
    for (const debt of f.debts) {
      const leaderIngress = f.events.find(
        (e) =>
          e.kind === 'registered-handler' &&
          e.replicaId === info.leaderId &&
          cdcEvents(e.envelope).some((item) => item.eventKey === debt.eventKey),
      );
      assert.ok(
        leaderIngress,
        `target ${groupId} LEADER received ${debt.entryId} via follower forward`,
      );
      assert.equal(payloadOf(leaderIngress.envelope).relayDepth, 2);
      const committedEntry = findCommittedTargetEventEntry(
        leaderRecord,
        debt.eventKey,
      );
      assert.ok(
        committedEntry,
        `target ${groupId} LEADER natively committed & applied ${debt.entryId}`,
      );
      const matchedEvent = (
        commandOf(committedEntry).events ?? [commandOf(committedEntry)]
      ).find((item) => item.eventKey === debt.eventKey);
      assertEnvelope(matchedEvent, debt);
    }
  }
}

async function assertSourceSettlementAndAck(f) {
  await driveWithPump(f, () =>
    f.producerLeader.cdcDelivery.flushCdcAcknowledgements('w7-final-ack'),
  );
  const settledStandings = [
    PARTITION_CDC_OBLIGATION_STANDING.DELIVERED,
    PARTITION_CDC_OBLIGATION_STANDING.RECLAIMED,
  ];
  assert.equal(
    await f.producer.waitFor(() =>
      f.producer.services.every((replica) =>
        f.debts.every((debt) =>
          settledStandings.includes(
            readCdcObligationStanding(replica.db, debt).standing,
          ),
        ),
      ),
    ),
    true,
    'source CDC_DELIVERED settles A and B_1..B_3 across all source voters',
  );
  for (const replica of f.producer.services) {
    const progress = readCdcObligationProgress(replica.db);
    const record = recordOf(replica, replica.partitionId);
    const ackEntry = record.entries.find(
      (item) => BigInt(item.index) === BigInt(progress.advancedIndex),
    );
    assert.ok(ackEntry);
    assert.equal(commandOf(ackEntry).type, PARTITION_CDC_COMMAND.DELIVERED);
    assert.ok(BigInt(record.appliedIndex) >= BigInt(ackEntry.index));
  }
}

function buildBoundaryNegativeResult(mode, evs) {
  if (mode === 'wrong-group') {
    return {
      overrideResult: buildDeliveryEnvelope(
        {acknowledged: true},
        buildProvisionalCdcOutcome(evs, 20, 'mg-wrong-group'),
      ),
    };
  }
  return {
    overrideResult: buildDeliveryEnvelope(
      {acknowledged: true},
      buildProvisionalCdcOutcome(
        [{...evs[0], eventKey: 'mutated-key'}],
        20,
        'mg-w7-target-2',
      ),
    ),
  };
}

async function runTenureResetWhileHeld(f, subJoin, target3FirstHopAddr) {
  f.producerLeader.unsubscribeFromCDC(subJoin);
  await subscribeWithoutEagerDrive(f, subJoin, 'w7-join-sub');
  const heldSend = Promise.withResolvers();
  f.heldApplications.push(heldSend);
  const enteredSend = Promise.withResolvers();
  let holdTarget3SendOnce = true;
  f.producerClock.setHoldTimers(true);
  f.interceptSend = async ({router, address}) => {
    const match =
      holdTarget3SendOnce &&
      router === 'routerA' &&
      address === target3FirstHopAddr;
    if (!match) return null;
    holdTarget3SendOnce = false;
    enteredSend.resolve();
    await heldSend.promise;
    return {
      overrideResult: buildDeliveryEnvelope(
        {acknowledged: true},
        unknownCdcAcceptance(),
      ),
    };
  };
  const heldDrivePromise = f.producerLeader.cdcDelivery.driveCdcObligations(
    'w7-tenure-reset-while-held',
  );
  await driveWithPump(f, () => enteredSend.promise);
  const activeInv = f.producerLeader.cdcDelivery.activeCdcInvocation;
  assert.ok(activeInv, 'active invocation owns held child send');
  f.producerClock.elapseWithoutCallbacks(6000);
  f.producerClock.setHoldTimers(false);
  f.producerClock.flushHeldTimers();
  assert.equal((await heldDrivePromise).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(
    f.producerLeader.cdcDelivery.activeCdcInvocation === activeInv,
    true,
    'expired invocation retains slot while raw child send is unclosed',
  );
  applyReplicaDemotion(f.producerLeader, RAFT_ROLE.FOLLOWER);
  resetCdcObligationLane(f.producerLeader.cdcDelivery);
  applyReplicaLeadership(f.producerLeader, RAFT_ROLE.LEADER);
  resetCdcObligationLane(f.producerLeader.cdcDelivery);
  assert.equal(
    f.producerLeader.cdcDelivery.obligationLane.currentObligation === null,
    true,
    'tenure reset dropped the transient progress cell',
  );
  const overlappingDrive = await f.producerLeader.cdcDelivery.driveCdcObligations(
    'w7-no-overlap-while-unclosed',
  );
  assert.equal(overlappingDrive.state, DRIVE.JOINED_IN_FLIGHT);
  heldSend.resolve();
  await driveWithPump(f, () => activeInv.context.cleanup);
  await pumpMulti(f, 2);
  assert.equal(f.producerLeader.cdcDelivery.activeCdcInvocation === null, true);
  assert.equal(f.topology.activeDurablePropagation === null, true);
}

test(
  'W7: composite A-before-B provisional-to-native route formation across ' +
    '3 RF5 target groups, 2 connected routers (window 2) and 2 subscribers',
  async (t) => {
    const f = await prepareMultiTargetProvisionalFixture(t, {
      portA: 24385,
      portB: 24386,
    });

    assertTargetGroupsPremise(f);

    const capturedTargets = buildSafeTargets({
      systemTableCache: f.source.systemTableCache,
      sourceGroupId: SOURCE_GROUP,
    });
    assert.equal(capturedTargets.length, 3);

    const {debtA, debtsB, subJoin} = await seedW7DebtsAndSubscribers(f);

    const isBEnvelope = (envelope) =>
      cdcEvents(envelope).some((ev) =>
        debtsB.some((b) => b.eventKey === ev.eventKey),
      );
    let bVisitedCount = 0;
    let holdB = true;

    const assertNoBAndOwed = () => {
      assert.equal(bVisitedCount, 0, 'B must not be visited before A scan release');
      for (const replica of f.producer.services) {
        for (const debt of f.debts) {
          assert.equal(
            readCdcObligation(replica.db, debt.eventKey).delivered,
            false,
          );
        }
      }
    };

    // --- Step 1 & 2: Delayed-timer expiry on Target 2 of Subscriber 0 ---
    const target2FirstHopAddr = nodeAddressOf(NODE_B, 'mg-w7-target-2-f1');
    let elapseOnTarget2 = true;
    f.producerClock.setHoldTimers(true);
    f.interceptSend = async ({router, address, envelope}) => {
      if (isBEnvelope(envelope)) bVisitedCount += 1;
      const shouldElapse =
        elapseOnTarget2 &&
        router === 'routerA' &&
        address === target2FirstHopAddr;
      if (!shouldElapse) return null;
      elapseOnTarget2 = false;
      const realResult = await Reflect.apply(f.deliverA, f.routerA, [
        address,
        envelope,
        {targetNodeId: NODE_B, timeoutMs: 5000},
      ]);
      f.producerClock.elapseWithoutCallbacks(6000);
      return {overrideResult: realResult};
    };

    const drive1 = await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.driveCdcObligations('w7-attempt-1-expiry'),
    );
    assert.equal(drive1.state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(
      f.producerClock.heldTimers().some((timer) => timer.cleared),
      true,
      'synchronous expiry cleared the creating clock timer without waiting for callback',
    );
    f.producerClock.setHoldTimers(false);
    f.producerClock.flushHeldTimers();
    assertNoBAndOwed();

    const cellAfter1 = f.producerLeader.cdcDelivery.obligationLane.currentObligation;
    assert.ok(cellAfter1);
    assert.equal(
      cellAfter1.nextSubscriber,
      1,
      'fair subscriber cursor advances to subscriber 1 (joining bridge)',
    );
    assert.equal(
      cellAfter1.branches[0].topology.targets[0].coverage.state,
      CDC_COVERAGE_STATE.PROVISIONAL,
      'pre-expiry Target 1 provisional observation survived',
    );
    assert.equal(
      cellAfter1.branches[0].topology.targets[1].coverage.state,
      CDC_COVERAGE_STATE.UNCOVERED,
      'late valid provisional answer after expiry did not cover Target 2',
    );

    // --- Step 2b: Boundary negatives (wrong group & changed vector member) ---
    let sub0Target2Mode = 'wrong-group';
    f.interceptSend = async ({router, address, envelope}) => {
      if (isBEnvelope(envelope)) bVisitedCount += 1;
      const onSub0 =
        cellAfter1.branches[1].coverage.state === CDC_COVERAGE_STATE.PROVISIONAL;
      const match =
        router === 'routerA' && address === target2FirstHopAddr && onSub0;
      if (!match) return null;
      return buildBoundaryNegativeResult(sub0Target2Mode, cdcEvents(envelope));
    };

    const drive2 = await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.driveCdcObligations('w7-attempt-2-wrong-group'),
    );
    assert.equal(drive2.state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(
      cellAfter1.branches[1].coverage.state,
      CDC_COVERAGE_STATE.PROVISIONAL,
      'Subscriber 1 (joining bridge) reached full provisional coverage',
    );
    assert.equal(
      cellAfter1.branches[0].topology.targets[2].coverage.state,
      CDC_COVERAGE_STATE.PROVISIONAL,
      'Subscriber 0 covered Target 3',
    );
    assert.equal(
      cellAfter1.branches[0].topology.targets[1].coverage.state,
      CDC_COVERAGE_STATE.UNCOVERED,
      'wrong-group provisional response left Target 2 uncovered',
    );
    assertNoBAndOwed();

    sub0Target2Mode = 'changed-vector';
    const drive3 = await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.driveCdcObligations('w7-attempt-3-changed-vec'),
    );
    assert.equal(drive3.state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(
      cellAfter1.branches[0].topology.targets[1].coverage.state,
      CDC_COVERAGE_STATE.UNCOVERED,
      'changed vector member left Target 2 uncovered',
    );
    assertNoBAndOwed();

    // --- Step 2c: Paired negative with weak-coverage accumulation removed ---
    cellAfter1.branches[0].topology.targets[0].coverage = emptyCdcCoverage();
    cellAfter1.branches[0].topology.targets[2].coverage = emptyCdcCoverage();
    const target3FirstHopAddr = nodeAddressOf(NODE_B, 'mg-w7-target-3-f1');
    f.interceptSend = async ({router, address, envelope}) => {
      if (isBEnvelope(envelope)) bVisitedCount += 1;
      if (router === 'routerA' && address === target3FirstHopAddr) {
        return {
          overrideResult: buildDeliveryEnvelope(
            {acknowledged: true},
            unknownCdcAcceptance(),
          ),
        };
      }
      return null;
    };
    const driveNoWeakAccum = await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.driveCdcObligations(
        'w7-negative-no-weak-accumulation',
      ),
    );
    assert.equal(driveNoWeakAccum.state, DRIVE.HELD_BY_SUBSCRIBER);
    assertNoBAndOwed();

    // --- Step 2d: Same-text subscriber replacement & tenure reset while held ---
    await runTenureResetWhileHeld(f, subJoin, target3FirstHopAddr);

    // --- Step 2e: Clean multi-attempt weak coverage release of A -> B_1..B_3 ---
    let failTarget3Once = true;
    f.interceptSend = async ({router, address, envelope}) => {
      if (isBEnvelope(envelope) && holdB) {
        bVisitedCount += 1;
        const held = Promise.withResolvers();
        f.heldApplications.push(held);
        f.events.push({
          ordinal: f.events.length,
          phase: f.phase,
          kind: 'held-b-before-dispatch',
          address,
        });
        await held.promise;
      }
      const shouldFailTarget3 =
        failTarget3Once &&
        router === 'routerA' &&
        address === target3FirstHopAddr;
      if (!shouldFailTarget3) return null;
      failTarget3Once = false;
      return {
        overrideResult: buildDeliveryEnvelope(
          {acknowledged: true},
          unknownCdcAcceptance(),
        ),
      };
    };

    const cleanAttempt1 = await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.driveCdcObligations('w7-clean-attempt-1'),
    );
    assert.equal(cleanAttempt1.state, DRIVE.HELD_BY_SUBSCRIBER);
    const bindingOfA =
      f.producerLeader.cdcDelivery.obligationLane.currentObligation?.binding;
    assert.equal(typeof bindingOfA, 'string');
    assertNoBAndOwed();

    const cleanAttempt2Promise = f.producerLeader.cdcDelivery.driveCdcObligations(
      'w7-clean-attempt-2-release-to-b',
    );
    for (
      let round = 0;
      round < 80 && !f.events.some((e) => e.kind === 'held-b-before-dispatch');
      round += 1
    ) {
      await pumpMulti(f, 2);
    }
    assert.equal(
      f.events.some((e) => e.kind === 'held-b-before-dispatch'),
      true,
      'cleanAttempt2 reached held-b-before-dispatch within bounded rounds',
    );
    assert.ok(
      bVisitedCount > 0,
      'complete weak coverage across both subscribers and 3 targets released scan to B',
    );
    assert.notEqual(
      f.producerLeader.cdcDelivery.obligationLane.currentObligation?.binding,
      bindingOfA,
      'weak scan release discarded A optimization state and advanced cell to B_1',
    );
    const aReturns = f.events.filter(
      (e) => e.kind === 'subscriber-return' && e.eventKey === debtA.eventKey,
    );
    assert.ok(
      aReturns.some(
        (r) =>
          r.result.targetGroupCount === 3 &&
          isProvisionalCdcOutcome(r.result, [
            {
              ...JSON.parse(debtA.eventJson),
              ...debtA,
              sourceLogIndex: debtA.logIndex,
              sourceOrdinal: debtA.ordinal,
            },
          ]),
      ),
    );

    // --- Step 3: Release B_1..B_3 and verify all 3 FOLLOWER routes resolve ---
    holdB = false;
    for (const held of f.heldApplications.splice(0)) held.resolve();
    const cleanAttempt2Result = await driveWithPump(f, () => cleanAttempt2Promise);
    assert.equal(cleanAttempt2Result.state, DRIVE.PROVISIONAL);

    assertProvisionalRoutesHydrated(f, capturedTargets);

    // --- Step 4: Temporary pressure episode + fresh native redrive + source ACK ---
    f.interceptSend = null;
    f.topology.deliveryRetryMaxAttempts = 3;
    let deferPressureOnce = true;
    const origPressure = f.topology.resolvePropagationPressure.bind(f.topology);
    f.topology.resolvePropagationPressure = (events) => {
      if (deferPressureOnce) {
        deferPressureOnce = false;
        return {action: PRESSURE_GOVERNOR_ACTION.DEFER};
      }
      return origPressure(events);
    };

    const nativeDrive = await driveWithPump(
      f,
      () =>
        f.producerLeader.cdcDelivery.driveCdcObligations(
          'w7-native-redrive-after-b',
        ),
      600,
    );
    f.topology.resolvePropagationPressure = origPressure;
    assert.equal(nativeDrive.state, DRIVE.DRAINED);

    assertTargetGroupsNativeCommit(f);
    await assertSourceSettlementAndAck(f);
  },
);
