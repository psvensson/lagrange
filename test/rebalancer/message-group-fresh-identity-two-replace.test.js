import assert from 'node:assert/strict';
import {test} from 'node:test';

import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_TRANSITION_REASON as REASON,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_READ_PURPOSE as PURPOSE,
} from '../../src/raft/raft-committed-membership-constants.js';
import {
  proposeAuthorizedGroupLearner,
  proposeAuthorizedGroupPromotion,
  proposeAuthorizedGroupRemoval,
} from '../../src/raft/raft-rs-group-membership-admission.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {
  REPLICA_OPERATION_INSERT_DISPOSITION,
} from '../../src/rebalancer/replica-operation-insert-disposition.js';
import {
  MEMBERSHIP_AUTHORIZATION_OUTCOME as OUTCOME,
  MEMBERSHIP_BRANCH,
  MEMBERSHIP_OBLIGATION as OBLIGATION,
  MEMBERSHIP_PHASE as PHASE,
  encodeMembershipPermit,
} from '../../src/rebalancer/replica-operation-message-group-membership-permit.js';
import {
  awaitMessageGroupSourceConsensusExit,
  recordedRemovalFactIsValid,
} from '../../src/rebalancer/replica-operation-message-group-removal.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {REPLICA_CONSENSUS_EXIT_REASON} from '../../src/node/replica-removal-consensus-exit.js';
import {
  FOUNDERS,
  GROUP,
  NODE,
  NOW,
  O,
  SUCCESSOR,
  TARGET,
} from '../test-helpers/learner-operation-fixture.js';
import {
  PERMIT_COLUMN,
  leaderOf,
  otherFounder,
  promotionWorld,
  votersEverywhere,
} from '../test-helpers/message-group-learner-promotion-fixture.js';

const LANE_KEY = `message-group:${GROUP}`;
const R2_OPERATION_ID = 'consumer-operation-r2';
const R2_TARGET_REPLICA = 'consumer-fresh-2';
const R2_TARGET_PEER_ID = deriveRaftRsPeerId(R2_TARGET_REPLICA);

function observeLeaderOnCluster(f, replicaId) {
  return async () => {
    const port = f.cluster.node(replicaId);
    const status = port.readStatus();
    const membership = await port.readCommittedMembership({
      purpose: PURPOSE.BOOTSTRAP,
      groupId: GROUP,
    });
    return {membership, status};
  };
}

function handoffFromSourceToSurvivor(f, sourceReplicaId, preferredSurvivor = null) {
  const survivor = preferredSurvivor ?? FOUNDERS.find((id) => id !== sourceReplicaId);
  const currentLeader = leaderOf(f);
  if (currentLeader !== survivor) {
    const beforeApplied = f.cluster.node(survivor).readStatus().appliedIndex;
    assert.equal(
      f.cluster.node(currentLeader).transferLeadership({
        successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
        replicaIdentity: survivor,
      }).outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK,
    );
    f.cluster.tickers = [survivor];
    assert.ok(f.cluster.settle(() => {
      const status = f.cluster.node(survivor).readStatus();
      return status.role === RAFT_ROLE.LEADER &&
        status.appliedIndex > beforeApplied &&
        status.currentTermApplied === true;
    }));
  } else {
    const beforeCommit = f.cluster.node(survivor).readStatus().commitIndex;
    assert.equal(
      f.cluster.propose(survivor, {type: 'HANDOFF_NOOP'}).outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK,
    );
    assert.ok(f.cluster.settle(() => {
      const status = f.cluster.node(survivor).readStatus();
      return status.commitIndex > beforeCommit &&
        status.currentTermApplied === true;
    }));
  }
  return survivor;
}

async function advanceToVoterCommitted(fx) {
  const {f} = fx;
  assert.equal((await fx.select()).outcome, OUTCOME.RECORDED);
  assert.equal((await fx.propose()).reason, REASON.PROPOSED);
  assert.ok(votersEverywhere(f));
  assert.equal(
    (await fx.recordVoter(otherFounder(f))).outcome,
    OUTCOME.RECORDED,
  );
  assert.equal(f.row().message_group_membership_phase, PHASE.VOTER_COMMITTED);
}

function buildSecondReplaceOperation(f, sourceReplicaId) {
  const identity = JSON.stringify({
    operationId: R2_OPERATION_ID,
    groupId: GROUP,
    sourceReplicaId,
    sourceNodeId: NODE,
    sourceCreatedAt: 50,
    sourceCreateAttemptToken: 'supplied-source-generation-r2',
    targetReplicaId: R2_TARGET_REPLICA,
    targetPeerId: R2_TARGET_PEER_ID,
    targetNodeId: SUCCESSOR,
    targetAddress: f.cluster.addressOf(R2_TARGET_REPLICA),
    transitionIdentity: 'consumer-transition-r2',
    membershipLaneKey: LANE_KEY,
  });
  return {
    operationId: R2_OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: GROUP,
    entityId: GROUP,
    entityType: SERVICE_TYPE.MESSAGE_GROUP,
    replicaId: R2_TARGET_REPLICA,
    sourceReplicaId,
    sourceNodeId: NODE,
    targetNodeId: SUCCESSOR,
    status: ReplicaStatus.PENDING,
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: NOW + 100,
    updatedAt: NOW + 100,
    completedAt: null,
    stepsHistory: [],
    membershipPublicationEpoch: 1,
    messageGroupMembershipLaneKey: LANE_KEY,
    messageGroupMembershipIdentity: identity,
    messageGroupMembershipPhase: PHASE.LEARNER_REQUESTED,
    messageGroupMembershipObligationState: OBLIGATION.INTENT_RECORDED,
    messageGroupMembershipOwnerClaim: null,
    messageGroupMembershipPermit: null,
    messageGroupLearnerStamp: null,
    messageGroupVoterStamp: null,
    messageGroupRemovalStamp: null,
    messageGroupSourceLifecycleClaim: JSON.stringify({
      replicaId: sourceReplicaId,
      createdAt: 50,
      stateEnteredAt: 60,
      createAttemptToken: 'supplied-source-generation-r2',
    }),
  };
}

async function proposeRemovalForRow(f, operationId, leaderReplicaId, targetReplicaId) {
  const row = f.db
    .prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
    .get(operationId);
  const identity = JSON.parse(row.message_group_membership_identity);
  const recipientRepo = f.repositoryFor(SUCCESSOR);
  const request = {
    operationId,
    identity: row.message_group_membership_identity,
    permit: row[PERMIT_COLUMN],
    executionClaim: row.message_group_membership_owner_claim,
  };
  return proposeAuthorizedGroupRemoval(
    f.cluster.node(leaderReplicaId),
    {
      groupId: identity.groupId,
      nodeId: SUCCESSOR,
      bootIncarnation: 1,
      localReplicaIdentity: leaderReplicaId,
      senderNodeId: NODE,
      senderBootIncarnation: 1,
      peerAddress: f.cluster.addressOf(targetReplicaId),
    },
    request,
    (req, receiver) =>
      recipientRepo.observeMessageGroupRemovalAuthorization(req, receiver),
    {
      nodeId: SUCCESSOR,
      bootIncarnation: 1,
      senderNodeId: NODE,
      senderBootIncarnation: 1,
      isCurrent: () => true,
    },
  );
}

test('two serial fresh-identity REPLACE operations enforce single-lane ' +
  'exclusion, named handoff, quorum-absence release before lagging source ' +
  'cleanup, and permanent peer-identity reservation across history pruning',
{timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t);
  const {f} = fx;
  const r1Identity = JSON.parse(f.request.identity);
  const r1SourceReplicaId = r1Identity.sourceReplicaId;
  const r1SourcePeerId = deriveRaftRsPeerId(r1SourceReplicaId);
  const remainingFounders = FOUNDERS.filter((id) => id !== r1SourceReplicaId);
  const r2SourceReplicaId = remainingFounders[0];
  const r2SourcePeerId = deriveRaftRsPeerId(r2SourceReplicaId);
  const finalFounderReplicaId = remainingFounders[1];
  const finalFounderPeerId = deriveRaftRsPeerId(finalFounderReplicaId);
  const r1TargetPeerId = deriveRaftRsPeerId(TARGET);

  const r2Row = buildSecondReplaceOperation(f, r2SourceReplicaId);

  // 1. While R1 is at LEARNER_COMMITTED, R2 is refused by the unique group lane.
  const conflictAtLearner = await f.repository.persistNewOperation(r2Row, {
    returnDisposition: true,
  });
  assert.equal(
    conflictAtLearner.disposition,
    REPLICA_OPERATION_INSERT_DISPOSITION.MEMBERSHIP_LANE_CONFLICT,
  );
  assert.equal(conflictAtLearner.operation.operationId, O);

  // 2. Advance R1 to VOTER_COMMITTED; R2 is still refused by the lane.
  await advanceToVoterCommitted(fx);
  const conflictAtVoter = await f.repository.persistNewOperation(r2Row, {
    returnDisposition: true,
  });
  assert.equal(
    conflictAtVoter.disposition,
    REPLICA_OPERATION_INSERT_DISPOSITION.MEMBERSHIP_LANE_CONFLICT,
  );

  // 3. While R1 source still leads, source removal requires leadership handoff.
  if (leaderOf(f) !== r1SourceReplicaId) {
    handoffFromSourceToSurvivor(f, leaderOf(f), r1SourceReplicaId);
  }
  const handoffNeeded = await f.repository.selectMessageGroupSourceRemoval(
    {
      operationId: O,
      destinationNodeId: SUCCESSOR,
      destinationReplicaId: finalFounderReplicaId,
    },
    observeLeaderOnCluster(f, finalFounderReplicaId),
    () => true,
  );
  assert.equal(handoffNeeded.outcome, OUTCOME.HANDOFF_REQUIRED);

  // 4. Hand leadership off R1 source to finalFounderReplicaId and select R1 source removal.
  const handoffLeader = handoffFromSourceToSurvivor(
    f,
    r1SourceReplicaId,
    finalFounderReplicaId,
  );
  const r1RemovalSelected = await f.repository.selectMessageGroupSourceRemoval(
    {
      operationId: O,
      destinationNodeId: SUCCESSOR,
      destinationReplicaId: handoffLeader,
    },
    observeLeaderOnCluster(f, handoffLeader),
    () => true,
  );
  assert.equal(r1RemovalSelected.outcome, OUTCOME.RECORDED);

  // 5. Hold commit-advancing packets to R1 source so quorum removal settles
  // while R1 source has not yet applied its own removal.
  const r1SourceAddress = f.cluster.addressOf(r1SourceReplicaId);
  const heldR1Packets = [];
  let r1MessagesSeen = 0;
  const previousSendFor = f.cluster.sendFor;
  f.cluster.sendFor = (fromId, toAddress, packet) => {
    if (toAddress === r1SourceAddress) {
      r1MessagesSeen += 1;
      if (r1MessagesSeen >= 2) {
        heldR1Packets.push(packet);
        return {outcome: 'delivered'};
      }
    }
    return previousSendFor ?
      previousSendFor(fromId, toAddress, packet) : undefined;
  };

  const r1RemoveProposed = await proposeRemovalForRow(
    f,
    O,
    handoffLeader,
    r1SourceReplicaId,
  );
  assert.equal(r1RemoveProposed.reason, REASON.PROPOSED);
  assert.equal(
    await fx.world.until(() =>
      remainingFounders.every(
        (id) =>
          !f.cluster
            .node(id)
            .readStatus()
            .confState.voters.map(String)
            .includes(r1SourcePeerId),
      ),
    ),
    true,
  );
  assert.equal(
    f.cluster
      .node(r1SourceReplicaId)
      .readStatus()
      .confState.voters.map(String)
      .includes(r1SourcePeerId),
    true,
    'lagging R1 source has not yet applied its own removal',
  );

  // 6. Record R1 committed removal stamp from the surviving leader.
  const r1Recorded = await f.repository.recoverMessageGroupRemovalOutcome(
    O,
    (query) => f.cluster.node(handoffLeader).readCommittedMembership(query),
    () => true,
  );
  assert.equal(r1Recorded.outcome, OUTCOME.RECORDED);
  assert.equal(f.row().message_group_membership_phase, PHASE.SOURCE_REMOVED);
  assert.equal(
    f.row().message_group_membership_obligation_state,
    OBLIGATION.SETTLED,
  );
  assert.equal(f.row().message_group_membership_lane_key, null);

  // 7. R2 immediately enters the group lane without waiting for lagging R1 source cleanup!
  const r2Inserted = await f.repository.persistNewOperation(r2Row, {
    returnDisposition: true,
  });
  assert.equal(
    r2Inserted.disposition,
    REPLICA_OPERATION_INSERT_DISPOSITION.INSERTED,
    'R2 enters the group lane immediately after R1 records quorum absence',
  );

  // 8. Drive R2 through learner authorization, native ADD_LEARNER, promotion,
  // and source removal on the surviving leader.
  const r2Claimed = await f.repository.claimMessageGroupMembershipOwner({
    operationId: R2_OPERATION_ID,
    identity: r2Row.messageGroupMembershipIdentity,
    expectedClaim: null,
  });
  assert.equal(r2Claimed.outcome, OUTCOME.RECORDED);
  const r2Holder = JSON.parse(r2Claimed.claim);
  const leaderStatusForR2 = f.cluster.node(handoffLeader).readStatus();
  const r2LearnerPermit = encodeMembershipPermit({
    version: 2,
    transitionIdentity: 'consumer-transition-r2',
    permitSequence: 1,
    permitStage: 'add-learner',
    permitState: 'in_flight',
    workflowOwnerNodeId: NODE,
    workflowOwnerFence: `${NODE}:1:${r2Holder.generation}`,
    membershipLeaseExpiresAt: r2Holder.expiresAt,
    proposerNodeId: NODE,
    proposerBootIncarnation: 1,
    destinationNodeId: SUCCESSOR,
    destinationBootIncarnation: 1,
    replicaLifecycleIncarnation: leaderStatusForR2.lifecycleIncarnation,
    runtimeGeneration: leaderStatusForR2.runtimeGeneration,
    leaderTerm: leaderStatusForR2.term,
    leaderConfigurationStamp: {
      configurationKey: leaderStatusForR2.configurationKey,
      membershipGenerationIndex: leaderStatusForR2.membershipGenerationIndex,
    },
    proposalIndex: null,
    replicaIdentity: R2_TARGET_REPLICA,
    peerId: R2_TARGET_PEER_ID,
  });
  assert.equal(
    (
      await f.repository.authorizeMessageGroupLearner({
        operationId: R2_OPERATION_ID,
        identity: r2Row.messageGroupMembershipIdentity,
        permit: r2LearnerPermit,
      })
    ).outcome,
    OUTCOME.RECORDED,
  );
  const r2RecipientRepo = f.repositoryFor(SUCCESSOR);
  const r2AddProposed = await proposeAuthorizedGroupLearner(
    f.cluster.node(handoffLeader),
    {
      groupId: GROUP,
      nodeId: SUCCESSOR,
      bootIncarnation: 1,
      localReplicaIdentity: handoffLeader,
      senderNodeId: NODE,
      senderBootIncarnation: 1,
      peerAddress: f.cluster.addressOf(R2_TARGET_REPLICA),
    },
    {
      operationId: R2_OPERATION_ID,
      identity: r2Row.messageGroupMembershipIdentity,
      permit: r2LearnerPermit,
      executionClaim: r2Claimed.claim,
    },
    (req, receiver) =>
      r2RecipientRepo.observeMessageGroupLearnerAuthorization(req, receiver),
    {
      nodeId: SUCCESSOR,
      bootIncarnation: 1,
      senderNodeId: NODE,
      senderBootIncarnation: 1,
      isCurrent: () => true,
    },
  );
  assert.equal(r2AddProposed.reason, REASON.PROPOSED);
  assert.equal(
    await fx.world.until(() =>
      f.cluster
        .node(handoffLeader)
        .readStatus()
        .confState.learners.map(String)
        .includes(R2_TARGET_PEER_ID),
    ),
    true,
  );
  const r2LearnerRecorded =
    await f.repository.recordMessageGroupLearnerOutcome(
      {
        operationId: R2_OPERATION_ID,
        identity: r2Row.messageGroupMembershipIdentity,
        permit: r2LearnerPermit,
        executionClaim: r2Claimed.claim,
      },
      (query) => f.cluster.node(handoffLeader).readCommittedMembership(query),
    );
  assert.equal(r2LearnerRecorded.outcome, OUTCOME.RECORDED);

  // Release held packets to R1 source so it applies its own removal and exits cleanly.
  f.cluster.sendFor = previousSendFor;
  for (const packet of heldR1Packets.splice(0)) {
    f.cluster.node(r1SourceReplicaId).step(packet);
  }
  assert.equal(
    await fx.world.until(
      () =>
        !f.cluster
          .node(r1SourceReplicaId)
          .readStatus()
          .confState.voters.map(String)
          .includes(r1SourcePeerId),
    ),
    true,
  );
  const r1SourceExit = await awaitMessageGroupSourceConsensusExit(
    {raft: f.cluster.node(r1SourceReplicaId)},
    {replicaId: r1SourceReplicaId, backstopMs: 200, pollMs: 5},
  );
  assert.equal(r1SourceExit.exit, REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED);

  // Prune R1's settled operation row and steps_history and verify that
  // permanent peer reservations for all 5 replicas (3 founders + 2 fresh targets)
  // remain reserved in raft_rs_peer_identity on the surviving leader.
  f.db
    .prepare('DELETE FROM replica_operations WHERE operation_id = ?')
    .run(O);
  const reservedPeers = new Map(
    f.cluster
      .replica(handoffLeader)
      .db.prepare(
        'SELECT replica_identity, raft_peer_id FROM raft_rs_peer_identity ' +
        'ORDER BY replica_identity',
      )
      .all()
      .map((row) => [row.replica_identity, String(row.raft_peer_id)]),
  );
  for (const [replicaId, expectedPeerId] of [
    [r1SourceReplicaId, r1SourcePeerId],
    [r2SourceReplicaId, r2SourcePeerId],
    [finalFounderReplicaId, finalFounderPeerId],
    [TARGET, r1TargetPeerId],
    [R2_TARGET_REPLICA, R2_TARGET_PEER_ID],
  ]) {
    assert.equal(
      reservedPeers.get(replicaId),
      expectedPeerId,
      `${replicaId} remains permanently reserved in raft_rs_peer_identity across history pruning`,
    );
  }
});

test('separated membership obligation and terminal settlement: ordinary FAILED ' +
  'status retains the group lane through ABORT_LEARNER until orphan-learner ' +
  'removal commits, while J1 refuses abort after PROMOTE authorization',
{timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t);
  const {f} = fx;
  const r1Identity = JSON.parse(f.request.identity);
  const r1SourceReplicaId = r1Identity.sourceReplicaId;
  const remainingFounders = FOUNDERS.filter((id) => id !== r1SourceReplicaId);
  const r2SourceReplicaId = remainingFounders[0];
  const r2Row = buildSecondReplaceOperation(f, r2SourceReplicaId);

  // 1. Settle ordinary operation status to FAILED while phase is LEARNER_COMMITTED.
  const opBeforeFail = await f.repository.queryAuthoritativeOperationById(O);
  opBeforeFail.status = ReplicaStatus.FAILED;
  opBeforeFail.workflowStep = WORKFLOW_STEP.FAILED;
  opBeforeFail.updatedAt = NOW + 50;
  opBeforeFail.completedAt = NOW + 50;
  opBeforeFail.errorMessage = 'target CREATE failed before promotion';
  await f.repository.persistOperationUpdate(opBeforeFail, {
    confirmPersistence: false,
    disableSystemWriteSession: true,
    returnDisposition: true,
    terminalTransition: true,
  });

  assert.equal(f.row().status, ReplicaStatus.FAILED);
  assert.equal(f.row().message_group_membership_lane_key, LANE_KEY);

  // 2. Select ABORT_LEARNER branch to remove the orphan learner.
  const leaderId = leaderOf(f);
  const leaderStatus = f.cluster.node(leaderId).readStatus();
  const priorPermit = f.row()[PERMIT_COLUMN];
  const decodedPrior = JSON.parse(priorPermit);
  const holder = JSON.parse(f.row().message_group_membership_owner_claim);
  const abortPermit = encodeMembershipPermit({
    version: 2,
    transitionIdentity: r1Identity.transitionIdentity,
    permitSequence: decodedPrior.permitSequence + 1,
    permitStage: 'remove',
    permitState: 'in_flight',
    workflowOwnerNodeId: NODE,
    workflowOwnerFence: `${NODE}:1:${holder.generation}`,
    membershipLeaseExpiresAt: holder.expiresAt,
    proposerNodeId: NODE,
    proposerBootIncarnation: 1,
    destinationNodeId: SUCCESSOR,
    destinationBootIncarnation: 1,
    replicaLifecycleIncarnation: leaderStatus.lifecycleIncarnation,
    runtimeGeneration: leaderStatus.runtimeGeneration,
    leaderTerm: leaderStatus.term,
    leaderConfigurationStamp: {
      configurationKey: leaderStatus.configurationKey,
      membershipGenerationIndex: leaderStatus.membershipGenerationIndex,
    },
    proposalIndex: null,
    replicaIdentity: TARGET,
    peerId: deriveRaftRsPeerId(TARGET),
  });

  const abortSelected = await f.repository.selectMessageGroupMembershipBranch(
    {
      operationId: O,
      identity: f.request.identity,
      priorPermit,
      nextPermit: abortPermit,
      branch: MEMBERSHIP_BRANCH.ABORT_LEARNER,
    },
    () => true,
  );
  assert.equal(abortSelected.outcome, OUTCOME.RECORDED);
  assert.equal(
    f.row().message_group_membership_phase,
    PHASE.TARGET_REMOVAL_IN_FLIGHT,
  );

  // 3. While TARGET_REMOVAL_IN_FLIGHT is not yet committed, R2 is still refused.
  const blockedDuringAbort = await f.repository.persistNewOperation(r2Row, {
    returnDisposition: true,
  });
  assert.equal(
    blockedDuringAbort.disposition,
    REPLICA_OPERATION_INSERT_DISPOSITION.MEMBERSHIP_LANE_CONFLICT,
  );

  // 4. Propose RemoveNode(TARGET) for the orphan learner and record TARGET_REMOVED.
  const abortProposed = await proposeRemovalForRow(f, O, leaderId, TARGET);
  assert.equal(abortProposed.reason, REASON.PROPOSED);
  const targetPeerId = deriveRaftRsPeerId(TARGET);
  assert.equal(
    await fx.world.until(() =>
      FOUNDERS.every(
        (id) =>
          !f.cluster
            .node(id)
            .readStatus()
            .confState.learners.map(String)
            .includes(targetPeerId),
      ),
    ),
    true,
  );

  const abortRecorded = await f.repository.recoverMessageGroupRemovalOutcome(
    O,
    (query) => f.cluster.node(leaderId).readCommittedMembership(query),
    () => true,
  );
  assert.equal(abortRecorded.outcome, OUTCOME.RECORDED);
  assert.equal(f.row().message_group_membership_phase, PHASE.TARGET_REMOVED);
  assert.equal(
    f.row().message_group_membership_obligation_state,
    OBLIGATION.SETTLED,
  );
  assert.equal(f.row().message_group_membership_lane_key, null);

  const settledAbortOp = await f.repository.queryAuthoritativeOperationById(O);
  assert.equal(
    recordedRemovalFactIsValid(
      settledAbortOp,
      r1Identity,
      settledAbortOp.messageGroupMembershipIdentity,
    ),
    true,
  );

  // 5. Once the orphan learner's committed removal is recorded, R2 enters the lane!
  const r2InsertedAfterAbort = await f.repository.persistNewOperation(r2Row, {
    returnDisposition: true,
  });
  assert.equal(
    r2InsertedAfterAbort.disposition,
    REPLICA_OPERATION_INSERT_DISPOSITION.INSERTED,
  );
});

test('J1 point-of-no-return: once PROMOTE is selected, ABORT_LEARNER is ' +
  'refused even if the operation fails, and forward recovery settles VOTER_COMMITTED',
{timeout: 30000}, async (t) => {
  const fx = await promotionWorld(t);
  const {f} = fx;
  const r1Identity = JSON.parse(f.request.identity);

  const learnerCommittedPermit = f.row()[PERMIT_COLUMN];
  const decodedLearnerPermit = JSON.parse(learnerCommittedPermit);

  // 1. Select PROMOTE (crosses J1 into PROMOTION_IN_FLIGHT).
  assert.equal((await fx.select()).outcome, OUTCOME.RECORDED);
  assert.equal(
    f.row().message_group_membership_phase,
    PHASE.PROMOTION_IN_FLIGHT,
  );

  // 2. Attempting to select ABORT_LEARNER after PROMOTE is selected is refused CONFLICT.
  const leaderId = leaderOf(f);
  const leaderStatus = f.cluster.node(leaderId).readStatus();
  const holder = JSON.parse(f.row().message_group_membership_owner_claim);
  const attemptedAbortPermit = encodeMembershipPermit({
    version: 2,
    transitionIdentity: r1Identity.transitionIdentity,
    permitSequence: decodedLearnerPermit.permitSequence + 1,
    permitStage: 'remove',
    permitState: 'in_flight',
    workflowOwnerNodeId: NODE,
    workflowOwnerFence: `${NODE}:1:${holder.generation}`,
    membershipLeaseExpiresAt: holder.expiresAt,
    proposerNodeId: NODE,
    proposerBootIncarnation: 1,
    destinationNodeId: SUCCESSOR,
    destinationBootIncarnation: 1,
    replicaLifecycleIncarnation: leaderStatus.lifecycleIncarnation,
    runtimeGeneration: leaderStatus.runtimeGeneration,
    leaderTerm: leaderStatus.term,
    leaderConfigurationStamp: {
      configurationKey: leaderStatus.configurationKey,
      membershipGenerationIndex: leaderStatus.membershipGenerationIndex,
    },
    proposalIndex: null,
    replicaIdentity: TARGET,
    peerId: deriveRaftRsPeerId(TARGET),
  });

  const j1Refusal = await f.repository.selectMessageGroupMembershipBranch(
    {
      operationId: O,
      identity: f.request.identity,
      priorPermit: learnerCommittedPermit,
      nextPermit: attemptedAbortPermit,
      branch: MEMBERSHIP_BRANCH.ABORT_LEARNER,
    },
    () => true,
  );
  assert.equal(
    j1Refusal.outcome,
    OUTCOME.CONFLICT,
    'J1 refuses ABORT_LEARNER once PROMOTE has been selected',
  );
  assert.equal(
    f.row().message_group_membership_phase,
    PHASE.PROMOTION_IN_FLIGHT,
  );

  // 3. Forward recovery completes PROMOTE -> VOTER_COMMITTED.
  assert.equal((await fx.propose()).reason, REASON.PROPOSED);
  assert.ok(votersEverywhere(f));
  assert.equal(
    (await fx.recordVoter(otherFounder(f))).outcome,
    OUTCOME.RECORDED,
  );
  assert.equal(f.row().message_group_membership_phase, PHASE.VOTER_COMMITTED);
  assert.equal(typeof proposeAuthorizedGroupPromotion, 'function');
});
