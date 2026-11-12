/**
 * A REPLACE's leadership handoff is one named-target attempt (quest
 * replace-source-removal-owner, amendment-1 step 2; design §3.4 as amended by
 * BR9/BR10/A13).
 *
 * The witness is the target replica's own port (fixture double
 * replace-witness-fixture.js); the rows the old legs read are left lagging on
 * purpose, so a decision taken from them would show.
 *
 * Receipts:
 *  - named-target-only: while the source leads, the only handoff is a
 *    STEP_DOWN to the REPLACE's own target (reason
 *    REPLACE_TARGET_LEADER_ELECTION); never the most-caught-up source leg and
 *    never another replica;
 *  - one attempt: while an attempt is unresolved no second handoff is issued;
 *    a refused attempt resolves and the next one names the same target;
 *  - attemptSeq echo: a late answer of an earlier attempt is dropped;
 *  - fresh leadership decides: removal proceeds once the witness reports the
 *    target itself leading (BR11);
 *  - leadership retained (BR11 as superseded 2026-11-11): a third replica
 *    that the group's current-leader authority confirms, and the target
 *    follows, lets removal proceed with NO handoff; an unconfirmed third
 *    leader is a typed wait; an unresolved or rebuilt attempt blocks the
 *    retained removal until it resolves;
 *  - F-b: no handoff leaves for an operation that became terminal;
 *  - target NOT_FOUND fails the REPLACE before its intent (no retarget).
 *
 * Supersedes (R09, owner decision 2026-09-25, this quest) these tests, which
 * pinned the CL-043 completed-election authorization (BR11) and the H-B'
 * retarget:
 *  - completed replacement election evidence closes priority source removal
 *    when partition leader rows lag;
 *  - exact replacement election completion with a routing-ready target and
 *    retarget candidates continues source removal in the same owner turn;
 *  - converged priority replacement election continues source removal when
 *    no retarget voter exists;
 *  - completed sql_transactions target election continues source removal in
 *    the same owner turn;
 *  - retargets replacement leader election after original target reports
 *    missing replica;
 *  - completes source removal after retargeted replacement election exhausts
 *    non-source candidates;
 *  - exact completed replacement election terminates before retry expiry can
 *    retarget it.
 *
 * Superseded (R09, 2026-11-11, leadership retained): "BR11: only a fresh
 * read of the target leading authorizes removal; a third replica leading
 * gets the named-target handoff". Its first half stands for a third leader
 * that is not confirmed; its second half (the handoff away from a third
 * leader) is replaced by the retained-leader receipts below.
 */

import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NODE_STATE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationReason,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  REPLACE_HANDOFF_ANSWER_CLASS,
  clearAllReplaceHandoffAttempts,
  readReplaceHandoffAttempt,
  readReplaceHandoffLateAnswerCount,
  recordReplaceHandoffAnswer,
} from '../../src/rebalancer/operation-workflow-replace-handoff-attempt.js';
import {
  REPLICA_HANDLER_LEADER_HANDOFF_BRANCH,
} from '../../src/node/replica-handler-leader-handoff-methods.js';
import {
  createMockPolicyService,
  createTestCoordinator,
} from './test-helpers.js';
import {
  readReplaceOwnerDiagnostic,
  recordReplaceOwnerWait,
} from '../../src/rebalancer/operation-workflow-replace-owner.js';
import {
  REPLACE_OWNER_PHASE,
  REPLACE_OWNER_RESTART_CLASS,
  startReplaceOwnerSession,
} from '../../src/rebalancer/operation-workflow-replace-owner-recovery.js';
import {
  REBALANCE_COORDINATOR_DEFER_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {createReplaceWitness} from './replace-witness-fixture.js';
import {
  evaluateRemovalLeadershipSafety,
} from '../../src/rebalancer/operation-workflow-removal-leadership-gate.js';
import {
  classifySystemPartition,
} from '../../src/bootstrap/system-partition-classification.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  createPublishedPlanningReadinessService,
} from './quorum-conditioned-remove-safety-tail-fixture-builders.js';
import {buildUnavailableOperationVisibility} from
  '../../src/rebalancer/replica-operation-repository-operation-visibility.js';

const PARTITION_ID = 'sql_transactions-p1';
const SOURCE_NODE_ID = 'node-a';
const PEER_NODE_B = 'node-b';
const PEER_NODE_C = 'node-c';
const TARGET_NODE_ID = 'node-d';
const SOURCE_REPLICA_ID = `${PARTITION_ID}-r1`;
const PEER_REPLICA_B = `${PARTITION_ID}-r2`;
const PEER_REPLICA_C = `${PARTITION_ID}-r3`;
const TARGET_REPLICA_ID = `${PARTITION_ID}-r4`;
const NODE_IDS = Object.freeze([
  SOURCE_NODE_ID, PEER_NODE_B, PEER_NODE_C, TARGET_NODE_ID]);
const READY_LEASE_EXTENSION_MS = 60_000;
// The group's committed voters as its leader answers them.
const GROUP_VOTERS = Object.freeze([
  SOURCE_REPLICA_ID, PEER_REPLICA_B, PEER_REPLICA_C, TARGET_REPLICA_ID]);
// Past the fixture witness's 1 s transfer window.
const PAST_TRANSFER_WINDOW_MS = 2_000;

function readyNode(nodeId) {
  return {
    node_id: nodeId,
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.READY,
    ready_lease_expires_at: Date.now() + READY_LEASE_EXTENSION_MS,
  };
}

function serviceRow(replicaId, nodeId, raftRole, partitionId = PARTITION_ID) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    node_id: nodeId,
    service_type: 'partition',
    status: 'active',
    raft_role: raftRole,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

// The router's delivery of the STEP_DOWN answer; a null answer is a request
// the target never answered (an undelivered transport outcome).
function confirmedDelivery(response) {
  return response === null ? buildDeliveryEnvelope({acknowledged: false}) :
    buildDeliveryEnvelope({acknowledged: true}, response);
}

function replicaIdsFor(partitionId) {
  return Object.freeze({
    source: `${partitionId}-r1`,
    peerB: `${partitionId}-r2`,
    peerC: `${partitionId}-r3`,
    target: `${partitionId}-r4`,
  });
}

async function createHarness({stepDownResponse, partitionId = PARTITION_ID} =
{}) {
  const ids = replicaIdsFor(partitionId);
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  // The witness sees the SOURCE leading; the rows (lagging) are irrelevant.
  const witness = createReplaceWitness({leaderReplicaId: ids.source});
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: TARGET_NODE_ID,
    enableTimeouts: false,
    replaceWitness: false,
    messageRouter: {
      deliver: async (target, payload) => {
        const witnessAnswer = witness.deliveryFor(payload);
        if (witnessAnswer) {
          return witnessAnswer;
        }
        deliveries.push({target, payload});
        if (payload?.type === ReplicaOperationMessageType.STEP_DOWN_REPLICA) {
          return confirmedDelivery(stepDownResponse ?
            stepDownResponse(payload) : {
              status: ReplicaOperationResponseStatus.COMPLETED,
              handoffBranch:
                REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_REQUESTED,
            });
        }
        return buildDeliveryEnvelope({acknowledged: true}, {
          status: ReplicaOperationResponseStatus.INITIATED,
        });
      },
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    readinessFixture: {
      callbacks: createPublishedPlanningReadinessService({
        publicationStatus: 'PUBLISHED',
        activeNodeIds: NODE_IDS,
        membershipTargetNodeId: TARGET_NODE_ID,
      }),
    },
    tablePolicyService: createMockPolicyService({
      getPolicyForPartition: () => ({
        targetReplicaCount: 3, minReplicaCount: 3,
      }),
    }),
    cacheData: {
      nodes: NODE_IDS.map(readyNode),
      services: [
        serviceRow(ids.source, SOURCE_NODE_ID, 'leader', partitionId),
        serviceRow(ids.peerB, PEER_NODE_B, 'follower', partitionId),
        serviceRow(ids.peerC, PEER_NODE_C, 'follower', partitionId),
        serviceRow(ids.target, TARGET_NODE_ID, 'follower', partitionId),
      ],
    },
  });
  coordinator.initialize();
  const operation = await coordinator.createOperation({
    type: OperationType.REPLACE,
    partitionId,
    nodeId: TARGET_NODE_ID,
    sourceNodeId: SOURCE_NODE_ID,
    replicaId: ids.source,
  });
  operation.replicaId = ids.target;
  operation.workflowStep = WORKFLOW_STEP.ACTIVE;
  operation.status = 'active';
  const owner = coordinator.workflowOwner;
  const stepDowns = () => deliveries.filter((delivery) =>
    delivery.payload?.type === ReplicaOperationMessageType.STEP_DOWN_REPLICA);
  const removals = () => deliveries.filter((delivery) =>
    delivery.payload?.type === ReplicaOperationMessageType.REMOVE_REPLICA);
  const shutdown = async () => {
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  };
  return {coordinator, owner, operation, witness, deliveries, stepDowns,
    removals, shutdown, ids};
}

test('named-target only: while the source leads, the only handoff names the ' +
  'REPLACE\'s own target, and removal waits for the witness to see it lead',
async (t) => {
  const harness = await createHarness();
  try {
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.stepDowns().length, 1, 'one handoff was issued');
    const request = harness.stepDowns()[0];
    t.ok(request.target.startsWith(TARGET_NODE_ID),
      'the handoff goes to the target node');
    t.equal(request.payload[ReplicaOperationField.REPLICA_ID],
      TARGET_REPLICA_ID, 'it names the target replica');
    t.equal(request.payload[ReplicaOperationField.REASON],
      ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
      'it asks the target to take leadership (never the most-caught-up leg)');
    t.equal(harness.stepDowns().filter((delivery) =>
      delivery.payload[ReplicaOperationField.REASON] ===
        ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF).length, 0,
    'no source-side most-caught-up handoff exists for a REPLACE');
    t.equal(harness.removals().length, 0,
      'no source removal while the source leads');

    harness.witness.leaderReplicaId = TARGET_REPLICA_ID;
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.removals().length, 1,
      'a fresh read of the target leading lets removal proceed');
    t.equal(harness.operation.workflowStep, WORKFLOW_STEP.STOPPING,
      'the removal intent is persisted');
  } finally {
    await harness.shutdown();
  }
});

// The handoff-required partitions are the classification owner's priority
// control-plane partitions, never a hand-copied subset: schema_operations-p1
// (omitted by the deleted list) had its leading source removed with no
// handoff in the multi-process formation run.
const PRIORITY_CONTROL_PLANE_PARTITION_IDS = Object.freeze(
  Object.values(INITIAL_PARTITION_IDS).filter((partitionId) =>
    classifySystemPartition({partitionId}).priorityControlPlane));

test('every priority control-plane partition: a leading source gets the ' +
  'named-target handoff before its removal', async (t) => {
  t.ok(PRIORITY_CONTROL_PLANE_PARTITION_IDS.includes(
    INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS]),
  'schema_operations-p1 is a priority control-plane partition');
  for (const partitionId of PRIORITY_CONTROL_PLANE_PARTITION_IDS) {
    const harness = await createHarness({partitionId});
    try {
      await harness.coordinator.executeOperation(harness.operation);
      t.equal(harness.stepDowns().length, 1,
        `${partitionId}: one named-target handoff was issued`);
      t.equal(harness.stepDowns()[0]?.payload[ReplicaOperationField.REPLICA_ID],
        harness.ids.target, `${partitionId}: it names the target replica`);
      t.equal(harness.removals().length, 0,
        `${partitionId}: no source removal while the source leads`);
    } finally {
      await harness.shutdown();
    }
  }
});

test('one attempt: an unresolved attempt blocks a second handoff; a refused ' +
  'attempt resolves and the next one names the same target', async (t) => {
  let answer = {status: ReplicaOperationResponseStatus.COMPLETED,
    handoffBranch: REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_REQUESTED};
  const harness = await createHarness({stepDownResponse: () => answer});
  try {
    await harness.coordinator.executeOperation(harness.operation);
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.stepDowns().length, 1,
      'an accepted, unresolved attempt is not re-issued');
    t.equal(readReplaceHandoffAttempt(harness.owner,
      harness.operation.operationId).answerClass,
    REPLACE_HANDOFF_ANSWER_CLASS.ACCEPTED, 'the attempt is accepted');

    // A refused answer resolves the attempt; the next is the same target.
    answer = {status: ReplicaOperationResponseStatus.ERROR,
      error: 'transfer refused'};
    const attemptBefore = readReplaceHandoffAttempt(harness.owner,
      harness.operation.operationId);
    // The accepted attempt's window elapses (the fixture window is 1 s).
    const baseNow = harness.owner.resolveTimeoutCheckNowMs.bind(harness.owner);
    harness.owner.resolveTimeoutCheckNowMs = () => baseNow() + 2_000;
    await harness.coordinator.executeOperation(harness.operation);
    const second = readReplaceHandoffAttempt(harness.owner,
      harness.operation.operationId);
    t.ok(second.attemptSeq > attemptBefore.attemptSeq,
      'a new attempt followed the resolved one');
    t.equal(second.answerClass, REPLACE_HANDOFF_ANSWER_CLASS.REFUSED,
      'the refusal was applied to the current attempt');
    await harness.coordinator.executeOperation(harness.operation);
    const targets = new Set(harness.stepDowns().map((delivery) =>
      delivery.payload[ReplicaOperationField.REPLICA_ID]));
    t.same([...targets], [TARGET_REPLICA_ID],
      'every attempt names the same transferee: no retarget');
  } finally {
    await harness.shutdown();
  }
});

test('attemptSeq echo: a late answer of an earlier attempt is dropped',
  async (t) => {
    const harness = await createHarness({stepDownResponse: () => null});
    try {
      await harness.coordinator.executeOperation(harness.operation);
      const current = readReplaceHandoffAttempt(harness.owner,
        harness.operation.operationId);
      const lateBefore = readReplaceHandoffLateAnswerCount(harness.owner);
      const applied = recordReplaceHandoffAnswer(harness.owner,
        harness.operation.operationId,
        {status: ReplicaOperationResponseStatus.COMPLETED,
          [ReplicaOperationField.ATTEMPT_SEQ]: current.attemptSeq - 1},
        current.attemptSeq);
      t.equal(applied, false, 'the late answer is not applied');
      t.equal(readReplaceHandoffLateAnswerCount(harness.owner),
        lateBefore + 1, 'and it is counted');
    } finally {
      await harness.shutdown();
    }
  });

test('attemptSeq echo, routed: an answer echoing another attempt through the ' +
  'real dispatch leaves the current attempt outstanding', async (t) => {
  const harness = await createHarness({stepDownResponse: (payload) => ({
    status: ReplicaOperationResponseStatus.COMPLETED,
    handoffBranch: REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_REQUESTED,
    [ReplicaOperationField.ATTEMPT_SEQ]:
      payload[ReplicaOperationField.ATTEMPT_SEQ] - 1,
  })});
  try {
    const lateBefore = readReplaceHandoffLateAnswerCount(harness.owner);
    await harness.coordinator.executeOperation(harness.operation);
    const attempt = readReplaceHandoffAttempt(harness.owner,
      harness.operation.operationId);
    t.equal(harness.stepDowns().length, 1, 'one handoff was issued');
    t.equal(attempt?.answerClass, null,
      'the mismatched answer resolved nothing');
    t.equal(readReplaceHandoffLateAnswerCount(harness.owner),
      lateBefore + 1, 'it was counted late');
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.stepDowns().length, 1,
      'the outstanding attempt blocks a second handoff');
    t.equal(harness.removals().length, 0, 'and no removal');
  } finally {
    await harness.shutdown();
  }
});

test('F-b: no handoff leaves for an operation that became terminal',
  async (t) => {
    const harness = await createHarness();
    try {
      const evaluation =
        await evaluateRemovalLeadershipSafety(harness.owner, harness.operation);
      t.ok(evaluation.handoffRequest, 'the decision was to issue a handoff');
      harness.operation.completedAt = Date.now();
      harness.operation.workflowStep = WORKFLOW_STEP.FAILED;
      harness.operation.status = 'failed';
      const response = await harness.owner.dispatchRemoveSafetyHandoffRequest(
        harness.operation, evaluation.handoffRequest);
      t.equal(response, null, 'nothing was sent');
      t.equal(harness.stepDowns().length, 0, 'no STEP_DOWN left');
    } finally {
      await harness.shutdown();
    }
  });

test('no retarget: a target that reports its replica missing fails the ' +
  'REPLACE before its removal intent', async (t) => {
  const harness = await createHarness({stepDownResponse: () => ({
    status: ReplicaOperationResponseStatus.NOT_FOUND})});
  try {
    await harness.coordinator.executeOperation(harness.operation);
    await harness.coordinator.executeOperation(harness.operation);
    const persisted = await harness.coordinator.queryOperationProjectionById(
      harness.operation.operationId);
    t.equal(persisted.workflowStep, WORKFLOW_STEP.FAILED,
      'the REPLACE failed before any removal intent');
    t.equal(harness.removals().length, 0, 'no source removal was sent');
    t.same([...new Set(harness.stepDowns().map((delivery) =>
      delivery.payload[ReplicaOperationField.REPLICA_ID]))],
    [TARGET_REPLICA_ID], 'no other replica was asked to lead');
  } finally {
    await harness.shutdown();
  }
});

test('BR12: no handoff leaves on a deferred-visibility snapshot', async (t) => {
  const harness = await createHarness();
  try {
    await harness.coordinator.repository.persistOperationUpdate(
      harness.operation);
    const snapshot = harness.owner.resolveDeferredRetryVisibleOperation(
      buildUnavailableOperationVisibility({reasonCode: 'visibility_deferred'}),
      harness.operation);
    await harness.coordinator.executeOperation(snapshot);
    t.equal(harness.stepDowns().length, 0,
      'the deferred snapshot issues no handoff');
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.stepDowns().length, 1,
      'control: the fresh copy issues the named-target handoff');
  } finally {
    await harness.shutdown();
  }
});

// The witness double as a group whose current leader is a third replica
// (neither the source nor the target): every member's own port names it at
// one term, and its committed voters include the target.
function thirdReplicaLeads(harness) {
  harness.witness.leaderReplicaId = PEER_REPLICA_B;
  harness.witness.voters = GROUP_VOTERS;
}

function advanceOwnerClock(harness, deltaMs) {
  const baseNow = harness.owner.resolveTimeoutCheckNowMs.bind(harness.owner);
  harness.owner.resolveTimeoutCheckNowMs = () => baseNow() + deltaMs;
}

test('leadership retained: a corroborated third leader the target follows ' +
  'lets removal proceed with no handoff', async (t) => {
  const harness = await createHarness();
  try {
    thirdReplicaLeads(harness);
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.stepDowns().length, 0,
      'no leadership transfer is requested: the source does not lead');
    t.equal(harness.removals().length, 1,
      'the corroborated third leader lets removal proceed');
    t.equal(harness.operation.workflowStep, WORKFLOW_STEP.STOPPING,
      'the removal intent is persisted');
    t.equal(readReplaceHandoffAttempt(harness.owner,
      harness.operation.operationId), null, 'no attempt was ever opened');
    const leaderReads = harness.witness.reads.filter((payload) =>
      payload[ReplicaOperationField.REPLICA_ID] === PEER_REPLICA_B);
    t.ok(leaderReads.length >= 1,
      'the decision read the named leader\'s own port');
  } finally {
    await harness.shutdown();
  }
});

// What the BR11 cell pinned and still holds: a third leader named by the
// target's own view alone authorizes nothing. Each row leaves one clause of
// the current-leader evidence unmet.
const UNCONFIRMED_THIRD_LEADER_CASES = Object.freeze([
  ['the named leader does not lead in its own port (a stale target view)',
    (witness) => {
      witness.viewByReplicaId = {
        [PEER_REPLICA_B]: {leaderReplicaId: SOURCE_REPLICA_ID}};
    }],
  ['no majority of the leader\'s voters is at its term (a deposed leader)',
    (witness) => {
      witness.viewByReplicaId = {
        [SOURCE_REPLICA_ID]: {term: 2, leaderReplicaId: SOURCE_REPLICA_ID},
        [PEER_REPLICA_C]: {term: 2, leaderReplicaId: SOURCE_REPLICA_ID}};
    }],
  ['the leader\'s configuration is applied behind its commit index',
    (witness) => {
      witness.appliedLag = 1;
    }],
  ['the target is not a voter of the leader\'s committed configuration',
    (witness) => {
      witness.voters = [SOURCE_REPLICA_ID, PEER_REPLICA_B, PEER_REPLICA_C];
    }],
  ['the target is below its participation gate',
    (witness) => {
      witness.gateOpen = false;
    }],
]);

for (const [label, unconfirm] of UNCONFIRMED_THIRD_LEADER_CASES) {
  test(`third leader not corroborated - ${label}: a typed wait, no ` +
    'handoff and no removal', async (t) => {
    const harness = await createHarness();
    try {
      thirdReplicaLeads(harness);
      unconfirm(harness.witness);
      const evaluation =
        await evaluateRemovalLeadershipSafety(harness.owner, harness.operation);
      t.equal(evaluation.classification, 'defer', 'the decision waits');
      t.notOk(evaluation.handoffRequest, 'and asks for no handoff');
      const deferral = JSON.stringify(evaluation);
      t.match(deferral, /current leader is not corroborated/u,
        'the deferral says exactly what it waits on');
      t.notMatch(deferral, /replacement leader ownership pending/u,
        'not the handoff\'s ownership-pending text');
      await harness.coordinator.executeOperation(harness.operation);
      t.equal(harness.stepDowns().length, 0, 'no STEP_DOWN leaves');
      t.equal(harness.removals().length, 0,
        'an unconfirmed third leader does not authorize the removal');
      t.equal(harness.operation.workflowStep, WORKFLOW_STEP.ACTIVE,
        'no removal intent');
      // Control: the same world, confirmed, proceeds - the wait was this
      // clause's.
      harness.witness.viewByReplicaId = {};
      harness.witness.appliedLag = 0;
      harness.witness.gateOpen = true;
      harness.witness.voters = GROUP_VOTERS;
      await harness.coordinator.executeOperation(harness.operation);
      t.equal(harness.removals().length, 1, 'control: confirmed, it proceeds');
      t.equal(harness.stepDowns().length, 0, 'control: still no handoff');
    } finally {
      await harness.shutdown();
    }
  });
}

// A leader change between the decision's two reads: the target's own port
// names a third replica, and by the time the current-leader authority is read
// the group has a new leader. The stronger read wins.
function changeLeaderAfterFirstTargetRead(harness, newLeaderReplicaId) {
  const answer = harness.witness.answer.bind(harness.witness);
  let targetReads = 0;
  harness.witness.answer = (payload) => {
    const answered = answer(payload);
    if (payload?.type === ReplicaOperationMessageType.READ_REPLICA_MEMBERSHIP &&
        payload[ReplicaOperationField.REPLICA_ID] === TARGET_REPLICA_ID) {
      targetReads += 1;
      if (targetReads === 1) {
        harness.witness.leaderReplicaId = newLeaderReplicaId;
      }
    }
    return answered;
  };
}

test('leader change between the two reads: the authority names the source ' +
  '- the one named handoff is issued, no removal', async (t) => {
  const harness = await createHarness();
  try {
    thirdReplicaLeads(harness);
    changeLeaderAfterFirstTargetRead(harness, SOURCE_REPLICA_ID);
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.stepDowns().length, 1,
      'the corroborated leader is the source: one handoff');
    t.equal(harness.stepDowns()[0].payload[ReplicaOperationField.REPLICA_ID],
      TARGET_REPLICA_ID, 'naming the target');
    t.equal(harness.removals().length, 0,
      'the third leader the target first named authorizes nothing');
  } finally {
    await harness.shutdown();
  }
});

test('leader change between the two reads: the authority names the target ' +
  '- the removal proceeds as under a leading target, no handoff',
async (t) => {
  const harness = await createHarness();
  try {
    thirdReplicaLeads(harness);
    // The retained-leader clauses cannot hold (the target's first read is
    // below its gate), so only the authority naming the target can admit.
    harness.witness.gateOpen = false;
    changeLeaderAfterFirstTargetRead(harness, TARGET_REPLICA_ID);
    const evaluation =
      await evaluateRemovalLeadershipSafety(harness.owner, harness.operation);
    t.equal(evaluation.classification, 'safe',
      'the corroborated leader is the target: leadership is safe');
    t.notOk(evaluation.handoffRequest, 'no handoff is asked for');
    t.equal(harness.stepDowns().length, 0, 'none left');
  } finally {
    await harness.shutdown();
  }
});

test('T-9: an unresolved attempt blocks the retained-leader removal until ' +
  'it resolves; no second transferee is ever named', async (t) => {
  const harness = await createHarness();
  try {
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.stepDowns().length, 1,
      'setup: the source led, one handoff to the target was accepted');
    // Leadership moves to a third replica while the attempt is unresolved.
    thirdReplicaLeads(harness);
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.removals().length, 0,
      'inside the transfer window the removal is not admitted');
    t.equal(harness.stepDowns().length, 1, 'and nothing is re-issued');
    advanceOwnerClock(harness, PAST_TRANSFER_WINDOW_MS);
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.removals().length, 1,
      'the window passed: the corroborated third leader is retained');
    t.same([...new Set(harness.stepDowns().map((delivery) =>
      delivery.payload[ReplicaOperationField.REPLICA_ID]))],
    [TARGET_REPLICA_ID], 'the only transferee ever named is the target');
    t.equal(harness.stepDowns().length, 1, 'one handoff in the operation');
  } finally {
    await harness.shutdown();
  }
});

test('BR10: after an owner restart the rebuilt attempt blocks the ' +
  'retained-leader removal for the transfer window, then it proceeds ' +
  'with no handoff', async (t) => {
  const harness = await createHarness();
  try {
    thirdReplicaLeads(harness);
    // A new owner session that began after the operation's step: whatever
    // handoff the previous session issued is lost with its memory.
    advanceOwnerClock(harness, PAST_TRANSFER_WINDOW_MS);
    clearAllReplaceHandoffAttempts(harness.owner);
    startReplaceOwnerSession(harness.owner,
      REPLACE_OWNER_RESTART_CLASS.COORDINATOR_REINIT);
    await harness.coordinator.executeOperation(harness.operation);
    const rebuilt = readReplaceHandoffAttempt(harness.owner,
      harness.operation.operationId);
    t.equal(rebuilt?.attemptSeq, 0, 'the lost attempt is rebuilt, not issued');
    t.equal(harness.removals().length, 0,
      'the rebuilt attempt blocks the retained-leader removal');
    t.equal(harness.stepDowns().length, 0, 'and issues nothing');
    advanceOwnerClock(harness, PAST_TRANSFER_WINDOW_MS);
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.removals().length, 1,
      'past the window the corroborated third leader is retained');
    t.equal(harness.stepDowns().length, 0, 'no handoff after the restart');
  } finally {
    await harness.shutdown();
  }
});

test('BR10: a rebuilt attempt resolves at once when the target leads, and ' +
  'a leading source gets the one named handoff after the window',
async (t) => {
  const harness = await createHarness();
  try {
    advanceOwnerClock(harness, PAST_TRANSFER_WINDOW_MS);
    clearAllReplaceHandoffAttempts(harness.owner);
    startReplaceOwnerSession(harness.owner,
      REPLACE_OWNER_RESTART_CLASS.COORDINATOR_REINIT);
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.stepDowns().length, 0,
      'the source leads: the rebuilt attempt blocks a new issuance');
    advanceOwnerClock(harness, PAST_TRANSFER_WINDOW_MS);
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.stepDowns().length, 1,
      'past the window the leading source gets the named handoff');
    harness.witness.leaderReplicaId = TARGET_REPLICA_ID;
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.removals().length, 1,
      'the target leading resolves the attempt and admits the removal');
  } finally {
    await harness.shutdown();
  }
});

test('the existing waits are unchanged: an unreadable witness and an ' +
  'unknown leader issue nothing and remove nothing', async (t) => {
  const harness = await createHarness();
  try {
    harness.witness.available = false;
    await harness.coordinator.executeOperation(harness.operation);
    harness.witness.available = true;
    harness.witness.leaderReplicaId = null;
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.stepDowns().length, 0, 'no handoff');
    t.equal(harness.removals().length, 0, 'no removal');
    t.equal(harness.operation.workflowStep, WORKFLOW_STEP.ACTIVE,
      'the REPLACE waits at ACTIVE');
  } finally {
    await harness.shutdown();
  }
});

// S9 hygiene (fix-f1, the instrumented SLO classification): an ACTIVE wait's
// phase label and attempt fields derive from the named-handoff decision the
// owner last took, not from the R-1f retirement map or a witness-less
// re-classification. Here attempt 1 is accepted and the decision read the
// target leading (LEADERSHIP_SAFE); a later ACTIVE wait (another check
// deferring) must not read "attempt unresolved" with no attempt.
test('S9: an ACTIVE wait after the named handoff decided safe reads the ' +
  'handoff attempt, not an unresolved phase with no attempt', async (t) => {
  const harness = await createHarness();
  try {
    await harness.coordinator.executeOperation(harness.operation);
    const attempt = readReplaceHandoffAttempt(harness.owner,
      harness.operation.operationId);
    t.equal(attempt.answerClass, REPLACE_HANDOFF_ANSWER_CLASS.ACCEPTED,
      'setup: attempt accepted');
    harness.witness.leaderReplicaId = TARGET_REPLICA_ID;
    const evaluation =
      await evaluateRemovalLeadershipSafety(harness.owner, harness.operation);
    t.equal(evaluation.classification, 'safe',
      'setup: the named handoff decided safe (the target leads)');
    recordReplaceOwnerWait(harness.owner, harness.operation,
      REBALANCE_COORDINATOR_DEFER_REASON.REPLACE_REMOVE_SAFETY_BLOCKED);
    const diagnostic = readReplaceOwnerDiagnostic(harness.owner,
      harness.operation.operationId);
    t.equal(diagnostic.ownerPhase, REPLACE_OWNER_PHASE.ACTIVE_DEFERRING,
      'the phase is the one the decision read: not attempt-unresolved');
    t.equal(diagnostic.lastAttemptSeq, attempt.attemptSeq,
      'the last attempt is the handoff attempt');
    t.equal(diagnostic.lastAttemptUncertain, false,
      'the accepted attempt is not uncertain');
  } finally {
    await harness.shutdown();
  }
});
