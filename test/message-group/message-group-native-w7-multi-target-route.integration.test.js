// W7 composite A-before-B provisional-to-native route formation witness across
// 3 RF5 target groups and 2 connected routers (window 2), through the source
// partition's one propagation subscriber (its source group and its three
// target groups are its recipients).
import {elapseRecipientBackoff} from '../test-helpers/cdc-delivery-progress-fixture.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
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
  PARTITION_CDC_RECIPIENT_STATE,
} from '../../src/partition/partition-cdc-obligation-constants.js';
import {resetCdcObligationLane} from
  '../../src/partition/partition-cdc-obligation-delivery.js';
import {
  buildProvisionalCdcOutcome,
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
  releaseFollowers,
  recordOf,
  payloadOf,
  cdcEvents,
} from './message-group-native-w7-composition.js';
import {SHIPS_ALONE_FIELDS} from './message-group-native-provisional-route-fixture.js';
import {
  commandOf,
  assertEnvelope,
  writeReleasedSql,
  buildBridgeSubscribers,
  subscribeWithoutEagerDrive,
} from './cdc-source-occurrence-helpers.js';

const DRIVE = PARTITION_CDC_OBLIGATION_DRIVE_STATE;
const W7_SUBSCRIBER_ID = 'w7-sub';

function assertTargetGroupsPremise(f) {
  for (const [groupId, info] of f.targetGroups.entries()) {
    const firstStatus = info.first.raft.readStatus();
    const followerStatus = info.follower.raft.readStatus();
    assert.notEqual(firstStatus.role, RAFT_ROLE.LEADER);
    assert.equal(firstStatus.leaderId, null);
    assert.equal(firstStatus.leaderAddressStatus, PEER_ADDRESS_STATUS.NO_LEADER);
    // No live leader yet: the reopened follower has heard nothing.
    assert.equal(followerStatus.role, RAFT_ROLE.FOLLOWER);
    assert.equal(followerStatus.leaderId, null);
    assert.equal(followerStatus.leaderAddress, null);
    assert.equal(
      followerStatus.leaderAddressStatus,
      PEER_ADDRESS_STATUS.NO_LEADER,
    );
    assert.equal(
      info.follower.systemTableCache.get(TABLES.SERVICES, info.leaderId),
      undefined,
    );
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
  // A ships as a vector of its own (range shipping), so the B rows stay the
  // later rows of the same scan that A's coverage must release.
  const writeA = registrationInsertForNode(f.source, 'w7-route-a', NODE_A, SHIPS_ALONE_FIELDS);
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

  const {seedBridge: subscriber} = buildBridgeSubscribers(
    f,
    TABLES.SERVICES,
    PARTITION_ID,
  );
  f.subscribers.push(subscriber);
  await subscribeWithoutEagerDrive(f, subscriber, W7_SUBSCRIBER_ID);
  f.subscribersReady = true;
  return {debtA, debtsB, subscriber};
}

function assertProvisionalRoutesReleased(f, capturedTargets) {
  for (const info of f.targetGroups.values()) {
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

async function runTenureResetWhileHeld(f, subscriber, target3FirstHopAddr) {
  // Same-text subscriber replacement: the one propagation subscriber leaves
  // and registers again under its id (a new subscription epoch).
  f.producerLeader.unsubscribeFromCDC(subscriber);
  await subscribeWithoutEagerDrive(f, subscriber, W7_SUBSCRIBER_ID);
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
  elapseRecipientBackoff(f.producerLeader, f.producerClock);
  const heldDrivePromise = f.producerLeader.cdcDelivery.driveCdcObligations(
    'w7-tenure-reset-while-held',
  );
  await driveWithPump(f, () => enteredSend.promise);
  // The held send belongs to one recipient (a target-3 delivery): that
  // recipient's custody slot owns it, and only that slot.
  const heldCustody = () => [...f.producerLeader.cdcDelivery.recipientCustody.values()]
    .filter((custody) => custody.activeCdcInvocation !== null);
  const activeInv = heldCustody()[0]?.activeCdcInvocation;
  assert.ok(activeInv, 'the recipient\'s invocation owns the held child send');
  f.producerClock.elapseWithoutCallbacks(6000);
  f.producerClock.setHoldTimers(false);
  f.producerClock.flushHeldTimers();
  assert.equal((await heldDrivePromise).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(
    heldCustody().some((custody) => custody.activeCdcInvocation === activeInv),
    true,
    'expired invocation retains its recipient slot while raw child send is unclosed',
  );
  applyReplicaDemotion(f.producerLeader, RAFT_ROLE.FOLLOWER);
  resetCdcObligationLane(f.producerLeader.cdcDelivery);
  applyReplicaLeadership(f.producerLeader, RAFT_ROLE.LEADER);
  resetCdcObligationLane(f.producerLeader.cdcDelivery);
  assert.deepEqual(
    f.producerLeader.cdcDelivery.getCdcObligationDiagnostics().recipients,
    [],
    'tenure reset dropped every recipient cursor',
  );
  assert.equal(
    heldCustody().some((custody) => custody.activeCdcInvocation === activeInv),
    true,
    'the custody slot outlives the lane: the old delivery\'s raw work is still open',
  );
  heldSend.resolve();
  await driveWithPump(f, () => activeInv.context.cleanup);
  await pumpMulti(f, 2);
  assert.equal(heldCustody().length, 0, 'every recipient slot is released by actual cleanup');
  assert.equal(f.topology.activeDurableDeliveries.size, 0);
}

test(
  'W7: composite A-before-B provisional-to-native route formation across ' +
    '3 RF5 target groups and 2 connected routers (window 2) through one propagation subscriber',
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

    const {debtA, debtsB, subscriber} = await seedW7DebtsAndSubscribers(f);

    const isBEnvelope = (envelope) =>
      cdcEvents(envelope).some((ev) =>
        debtsB.some((b) => b.eventKey === ev.eventKey),
      );
    let bVisitedCount = 0;
    let holdB = false;
    const recipientsOf = () =>
      f.producerLeader.cdcDelivery.getCdcObligationDiagnostics().recipients;
    const target2Recipients = () =>
      recipientsOf().filter((recipient) => recipient.groupId === 'mg-w7-target-2');

    // Recipient isolation: each recipient (the subscriber's source group and
    // each of its three target groups) is shipped B only after IT accepted A,
    // so B may reach a recipient that accepted A provisionally while another
    // recipient is still unconfirmed on A. What holds for all of them: no
    // provisional acceptance acknowledges anything.
    const assertAllOwedWithoutAck = () => {
      for (const replica of f.producer.services) {
        for (const debt of f.debts) {
          assert.equal(
            readCdcObligation(replica.db, debt.eventKey).delivered,
            false,
          );
        }
      }
      assert.equal(
        f.producerLeader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements,
        0,
        'no recipient holds a committed receipt: nothing is acknowledged',
      );
    };

    // --- Step 1: Delayed-timer expiry on a Target 2 delivery ---
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

    elapseRecipientBackoff(f.producerLeader, f.producerClock);
    const drive1 = await driveWithPump(f, () =>
      f.producerLeader.cdcDelivery.driveCdcObligations('w7-attempt-1-expiry'),
    );
    // The expired delivery's raw work closed: that cleanup is the event its
    // hold waited for, so Target 2 was shipped again at once and answered
    // provisionally (superseded 2026-11-11: it used to stay held until its
    // backoff). Its late answer still confirmed nothing.
    assert.equal(drive1.state, DRIVE.PROVISIONAL);
    assert.equal(
      f.producerClock.heldTimers().some((timer) => timer.cleared),
      true,
      'synchronous expiry cleared the creating clock timer without waiting for callback',
    );
    f.producerClock.setHoldTimers(false);
    f.producerClock.flushHeldTimers();
    assertAllOwedWithoutAck();
    assert.equal(
      target2Recipients().some((recipient) =>
        recipient.state === PARTITION_CDC_RECIPIENT_STATE.SUBSCRIBER_UNCONFIRMED &&
        recipient.cursor === null),
      true,
      'a late valid provisional answer after expiry did not cover its Target 2 recipient',
    );

    // --- Step 2b: Boundary negatives (wrong group & changed vector member) ---
    let target2Mode = 'wrong-group';
    f.interceptSend = async ({router, address, envelope}) => {
      if (isBEnvelope(envelope)) bVisitedCount += 1;
      const match = router === 'routerA' && address === target2FirstHopAddr &&
        !isBEnvelope(envelope);
      if (!match) return null;
      return buildBoundaryNegativeResult(target2Mode, cdcEvents(envelope));
    };
    for (const mode of ['wrong-group', 'changed-vector']) {
      target2Mode = mode;
      elapseRecipientBackoff(f.producerLeader, f.producerClock);
      const drive = await driveWithPump(f, () =>
        f.producerLeader.cdcDelivery.driveCdcObligations(`w7-attempt-${mode}`),
      );
      assert.equal(drive.state, DRIVE.HELD_BY_SUBSCRIBER);
      assert.equal(target2Recipients().length, 1, 'one Target 2 recipient on the lane');
      assert.equal(
        target2Recipients().every((recipient) => recipient.cursor === null &&
          recipient.state === PARTITION_CDC_RECIPIENT_STATE.SUBSCRIBER_UNCONFIRMED &&
          recipient.lastPass === 'held'),
        true,
        `${mode} provisional response left the Target 2 recipient unconfirmed and held`,
      );
      assertAllOwedWithoutAck();
    }

    // --- Step 2d: Same-text subscriber replacement & tenure reset while held ---
    const target3FirstHopAddr = nodeAddressOf(NODE_B, 'mg-w7-target-3-f1');
    await runTenureResetWhileHeld(f, subscriber, target3FirstHopAddr);

    // --- Step 2e: Weak acceptance of A by every recipient releases each to B_1..B_3 ---
    holdB = true;
    f.interceptSend = async ({address, envelope}) => {
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
      return null;
    };
    const visitedBefore = bVisitedCount;
    elapseRecipientBackoff(f.producerLeader, f.producerClock);
    const cleanAttempt2Promise = f.producerLeader.cdcDelivery.driveCdcObligations(
      'w7-clean-attempt-release-to-b',
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
      'the drive reached held-b-before-dispatch within bounded rounds',
    );
    assert.ok(
      bVisitedCount > visitedBefore,
      'a recipient that accepted A weakly was shipped B',
    );
    assertAllOwedWithoutAck();
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
    // Each target group is addressed by exactly one recipient of the lane:
    // every target recipient completes its provisional scan of A and B.
    const cleanAttempt2Result = await driveWithPump(f, () => cleanAttempt2Promise);
    const targets = recipientsOf().filter((recipient) =>
      recipient.recipient.startsWith(`${W7_SUBSCRIBER_ID}>`));
    assert.deepEqual(targets.map((recipient) => recipient.groupId).sort(),
      [...TARGET_GROUPS].sort(), 'one recipient per target group');
    assert.equal(targets.every((recipient) => recipient.lastPass === 'provisional' &&
      recipient.cursor === null), true,
    `each target recipient scanned A and B provisionally (${cleanAttempt2Result.state})`);
    assertAllOwedWithoutAck();

    // The followers hear their leaders again; each route is the leader's
    // committed address.
    await releaseFollowers(f);
    assertProvisionalRoutesReleased(f, capturedTargets);

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

    elapseRecipientBackoff(f.producerLeader, f.producerClock);
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
