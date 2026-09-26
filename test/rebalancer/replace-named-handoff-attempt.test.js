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
 */

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
  readReplaceHandoffAttempt,
  readReplaceHandoffLateAnswerCount,
  recordReplaceHandoffAnswer,
} from '../../src/rebalancer/operation-workflow-replace-handoff-attempt.js';
import {
  REPLICA_HANDLER_LEADER_HANDOFF_BRANCH,
} from '../../src/node/replica-handler-leader-handoff-methods.js';
import {createTestCoordinator} from './test-helpers.js';
import {
  readReplaceOwnerDiagnostic,
  recordReplaceOwnerWait,
} from '../../src/rebalancer/operation-workflow-replace-owner.js';
import {
  REPLACE_OWNER_PHASE,
} from '../../src/rebalancer/operation-workflow-replace-owner-recovery.js';
import {
  REBALANCE_COORDINATOR_DEFER_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {createReplaceWitness} from './replace-witness-fixture.js';
import {
  createPublishedPlanningReadinessService,
} from './quorum-conditioned-remove-safety-tail-fixture-builders.js';

const PARTITION_ID = 'sql_transactions-p1';
const SOURCE_NODE_ID = 'node-a';
const PEER_NODE_B = 'node-b';
const PEER_NODE_C = 'node-c';
const TARGET_NODE_ID = 'node-d';
const SOURCE_REPLICA_ID = `${PARTITION_ID}-r1`;
const PEER_REPLICA_B = `${PARTITION_ID}-r2`;
const TARGET_REPLICA_ID = `${PARTITION_ID}-r4`;
const NODE_IDS = Object.freeze([
  SOURCE_NODE_ID, PEER_NODE_B, PEER_NODE_C, TARGET_NODE_ID]);
const READY_LEASE_EXTENSION_MS = 60_000;

function readyNode(nodeId) {
  return {
    node_id: nodeId,
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.READY,
    ready_lease_expires_at: Date.now() + READY_LEASE_EXTENSION_MS,
  };
}

function serviceRow(replicaId, nodeId, raftRole) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: PARTITION_ID,
    node_id: nodeId,
    service_type: 'partition',
    status: 'active',
    raft_role: raftRole,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

async function createHarness({stepDownResponse} = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  // The witness sees the SOURCE leading; the rows (lagging) are irrelevant.
  const witness = createReplaceWitness({leaderReplicaId: SOURCE_REPLICA_ID});
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: TARGET_NODE_ID,
    enableTimeouts: false,
    replaceWitness: false,
    messageRouter: {
      deliver: async (target, payload) => {
        const witnessAnswer = witness.answer(payload);
        if (witnessAnswer) {
          return witnessAnswer;
        }
        deliveries.push({target, payload});
        if (payload?.type === ReplicaOperationMessageType.STEP_DOWN_REPLICA) {
          return stepDownResponse ? stepDownResponse(payload) : {
            status: ReplicaOperationResponseStatus.COMPLETED,
            handoffBranch:
              REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_REQUESTED,
          };
        }
        return {acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED};
      },
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    controlPlaneReadinessService: createPublishedPlanningReadinessService({
      publicationStatus: 'PUBLISHED',
      activeNodeIds: NODE_IDS,
      membershipTargetNodeId: TARGET_NODE_ID,
    }),
    tablePolicyService: {getPolicyForPartition: () => ({minReplicaCount: 3})},
    cacheData: {
      nodes: NODE_IDS.map(readyNode),
      services: [
        serviceRow(SOURCE_REPLICA_ID, SOURCE_NODE_ID, 'leader'),
        serviceRow(PEER_REPLICA_B, PEER_NODE_B, 'follower'),
        serviceRow(`${PARTITION_ID}-r3`, PEER_NODE_C, 'follower'),
        serviceRow(TARGET_REPLICA_ID, TARGET_NODE_ID, 'follower'),
      ],
    },
  });
  coordinator.initialize();
  const operation = await coordinator.createOperation({
    type: OperationType.REPLACE,
    partitionId: PARTITION_ID,
    nodeId: TARGET_NODE_ID,
    sourceNodeId: SOURCE_NODE_ID,
    replicaId: SOURCE_REPLICA_ID,
  });
  operation.replicaId = TARGET_REPLICA_ID;
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
    removals, shutdown};
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
        await harness.owner.evaluateReplaceNamedHandoffSafety(
          harness.operation);
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
    const persisted = await harness.coordinator.queryOperationById(
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
      {operation: null, deferredOutcome: {reasonCode: 'visibility_deferred'}},
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

test('BR11: only a fresh read of the target leading authorizes removal; a ' +
  'third replica leading gets the named-target handoff', async (t) => {
  const harness = await createHarness();
  try {
    harness.witness.leaderReplicaId = PEER_REPLICA_B;
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.removals().length, 0,
      'a non-source, non-target leader does not authorize the removal');
    t.equal(harness.stepDowns().length, 1, 'one handoff was issued');
    t.equal(harness.stepDowns()[0]?.payload[ReplicaOperationField.REPLICA_ID],
      TARGET_REPLICA_ID, 'it names the REPLACE\'s own target');
    harness.witness.leaderReplicaId = TARGET_REPLICA_ID;
    await harness.coordinator.executeOperation(harness.operation);
    t.equal(harness.removals().length, 1,
      'the target leading (fresh read) lets removal proceed');
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
      await harness.owner.evaluateReplaceNamedHandoffSafety(harness.operation);
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
