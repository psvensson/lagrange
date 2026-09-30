/**
 * Level-triggered remove-safety readiness wake (quest
 * replace-source-removal-owner, design §3.3 R-2 as amended by BR1/BR2/A9,
 * owner directive 2026-09-25).
 *
 * A REPLACE at ACTIVE whose replacement replica's remove-safety readiness
 * reads refresh-pending DEFERS. The witnesses drive the REAL owner and the
 * REAL remove-safety evaluator; only the readiness service (its level, its
 * publications, its planning identity) and the owner's clocks are faked. The
 * 1 s fallback timer is captured and never fired unless a witness says so,
 * so progress without it proves the wake.
 *
 * (a) publication -> wake -> SAFE -> REMOVE_REPLICA, fallback frozen;
 * (b) publication suppressed -> firing the fallback still recovers;
 * (c) lost-wakeup race: the flip and its publication land between the
 *     owner's not-ready read and its registration, under an UNCHANGED
 *     planning identity and token;
 * (d) a wake while an owner run holds the lane is not lost: an unrelated
 *     holder (d1), an evaluation that read before the flip (d2), and the
 *     wake's own run reading the previous level (d3);
 * (e) a wake is never authority: a changed-but-unsafe level re-evaluates
 *     and still defers; an unchanged level does not even re-evaluate;
 * (f) a fallback fire into a held owner lane is not lost.
 * Each witness runs for both lab-observed deferral causes (see PROFILES).
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NODE_STATE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {createTestCoordinator} from './test-helpers.js';
import {createReplaceWitness} from './replace-witness-fixture.js';

const {
  OPERATION_OWNER_ACTION,
  SAFETY_DEFERRED_RETRY_DELAY_MS,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const SOURCE_NODE_ID = 'node-a';
const PEER_NODE_ID = 'node-b';
const THIRD_NODE_ID = 'node-c';
const TARGET_NODE_ID = 'node-d';
const LEVEL = Object.freeze({
  READY: 'ready',
  REFRESH_PENDING: 'refresh_pending',
  EVIDENCE_ABSENT: 'evidence_absent',
});
const REASON_CODES_BY_LEVEL = Object.freeze({
  [LEVEL.READY]: Object.freeze([]),
  [LEVEL.REFRESH_PENDING]: Object.freeze([
    CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
    CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
  ]),
  [LEVEL.EVIDENCE_ABSENT]: Object.freeze([
    CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
  ]),
});

// Two deferral causes, one mechanism:
// - ORDINARY: an ordinary partition; the recorded owner is the source; the
//   replacement replica's node reads refresh-pending, so the replacement is
//   "not voter-ready".
// - SYSTEM_FLOOR: the lab-classified SLO shape (2026-09-25): a system
//   partition; the recorded owner is the target; a PEER node's participation
//   read is the refresh-pending placeholder (PRIORITY_CONTROL_PLANE_RECOVERY_
//   PENDING + planning_snapshot_refresh_pending), so the voter-ready floor
//   projects "below minimum (2/3)".
const PROFILES = Object.freeze([
  Object.freeze({
    name: 'ordinary',
    partitionId: 'p-readiness-wake',
    ownerNodeId: SOURCE_NODE_ID,
    wakingNodeId: TARGET_NODE_ID,
    deferPattern: /not voter-ready/,
    // Still ineligible, but now an evidence-absent denial: the level moved.
    applyUnsafeLevelChange(readiness) {
      readiness.setLevel(TARGET_NODE_ID, LEVEL.EVIDENCE_ABSENT);
    },
  }),
  Object.freeze({
    name: 'system-floor',
    partitionId: 'nodes-p1',
    ownerNodeId: TARGET_NODE_ID,
    wakingNodeId: PEER_NODE_ID,
    deferPattern: /below minimum \(2\/3\)/,
    // The peer turns ready while another peer turns refresh-pending: the
    // level moved, the floor is still 2/3.
    applyUnsafeLevelChange(readiness) {
      readiness.setLevel(PEER_NODE_ID, LEVEL.READY);
      readiness.setLevel(THIRD_NODE_ID, LEVEL.REFRESH_PENDING);
    },
  }),
]);
const READY_LEASE_EXTENSION_MS = 60_000;
const SETTLE_TURN_BUDGET = 50;
// The readiness owner's planning identity and publication token stay FIXED
// across the placeholder -> current flip (BR1): only the level changes.
const FIXED_PLANNING_IDENTITY = Object.freeze({
  globalPlanningGeneration: 7,
  nodePlanningGeneration: 3,
  saturated: false,
});
const FIXED_TOKEN_KEY = 'token-fixed';

function buildReadinessSnapshot(nodeId, level) {
  const eligible = level === LEVEL.READY;
  const dimensions = {};
  for (const dimension of Object.values(CONTROL_PLANE_READINESS_DIMENSION)) {
    dimensions[dimension] = eligible;
  }
  return Object.freeze({
    nodeId,
    dimensions: Object.freeze(dimensions),
    reasonCodes: REASON_CODES_BY_LEVEL[level],
  });
}

function createReadinessFake(initialLevels) {
  const levelByNodeId = new Map(Object.entries(initialLevels));
  const listeners = new Set();
  return {
    listeners,
    setLevel(nodeId, level) {
      levelByNodeId.set(nodeId, level);
    },
    publish(nodeId) {
      const event = Object.freeze({
        ownerKey: nodeId,
        snapshot: buildReadinessSnapshot(nodeId, levelByNodeId.get(nodeId)),
        capturedToken: Object.freeze({tokenKey: FIXED_TOKEN_KEY}),
      });
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
    readPlanningProjectionIdentity() {
      return FIXED_PLANNING_IDENTITY;
    },
    subscribeReadinessPlanningSnapshots(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getNodeReadinessSync(nodeId) {
      return buildReadinessSnapshot(
        nodeId,
        levelByNodeId.get(nodeId) || LEVEL.READY,
      );
    },
    getControlPlaneParticipationSync(nodeId) {
      const level = levelByNodeId.get(nodeId) || LEVEL.READY;
      return Object.freeze({
        nodeId,
        eligible: level === LEVEL.READY,
        reasonCodes: REASON_CODES_BY_LEVEL[level],
      });
    },
  };
}

function createReadyNode(nodeId) {
  return {
    node_id: nodeId,
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.READY,
    ready_lease_expires_at: Date.now() + READY_LEASE_EXTENSION_MS,
  };
}

function createReplicaRow(partitionId, replicaId, nodeId, raftRole) {
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

async function settle() {
  for (let turn = 0; turn < SETTLE_TURN_BUDGET; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/**
 * The REAL owner on the source node (the recorded owner of an ordinary
 * partition REPLACE), with the fallback timer captured.
 */
async function createDeferredReplaceHarness(profile) {
  const partitionId = profile.partitionId;
  const sourceReplicaId = `${partitionId}-r1`;
  const targetReplicaId = `${partitionId}-r4`;
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const deliveries = [];
  const fallbackTimers = [];
  // The target replica's committed configuration still holds the source,
  // and a peer leads (leadership is already off the source).
  const witness = createReplaceWitness({leaderReplicaId: `${partitionId}-r2`});
  const readiness = createReadinessFake({
    [SOURCE_NODE_ID]: LEVEL.READY,
    [PEER_NODE_ID]: LEVEL.READY,
    [THIRD_NODE_ID]: LEVEL.READY,
    [TARGET_NODE_ID]: LEVEL.READY,
    [profile.wakingNodeId]: LEVEL.REFRESH_PENDING,
  });
  const coordinator = createTestCoordinator({
    nodeId: profile.ownerNodeId,
    enableTimeouts: false,
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs, fired: false};
      fallbackTimers.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) {
        handle.cleared = true;
      }
    },
    messageRouter: {
      deliver: async (target, payload) => {
        const witnessAnswer = witness.answer(payload);
        if (witnessAnswer) {
          return witnessAnswer;
        }
        deliveries.push({target, payload});
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      },
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    controlPlaneReadinessService: readiness,
    tablePolicyService: {
      getPolicyForPartition: () => ({minReplicaCount: 3}),
    },
    cacheData: {
      nodes: [
        createReadyNode(SOURCE_NODE_ID),
        createReadyNode(PEER_NODE_ID),
        createReadyNode(THIRD_NODE_ID),
        createReadyNode(TARGET_NODE_ID),
      ],
      services: [
        createReplicaRow(partitionId, sourceReplicaId, SOURCE_NODE_ID,
          'leader'),
        createReplicaRow(partitionId, `${partitionId}-r2`, PEER_NODE_ID,
          'follower'),
        createReplicaRow(partitionId, `${partitionId}-r3`, THIRD_NODE_ID,
          'follower'),
        createReplicaRow(partitionId, targetReplicaId, TARGET_NODE_ID,
          'follower'),
      ],
    },
  });
  coordinator.initialize();
  const owner = coordinator.workflowOwner;
  const evaluations = [];
  const deferErrors = [];
  const originalEvaluate = owner.evaluateRemoveSafety.bind(owner);
  const hooks = {afterEvaluate: null};
  owner.evaluateRemoveSafety = async (operation) => {
    const evaluation = await originalEvaluate(operation);
    evaluations.push(evaluation?.classification || 'safe');
    if (evaluation?.error) {
      deferErrors.push(evaluation.error);
    }
    if (typeof hooks.afterEvaluate === 'function') {
      await hooks.afterEvaluate(evaluation, evaluations.length);
    }
    return evaluation;
  };

  const operation = await coordinator.createOperation({
    type: OperationType.REPLACE,
    partitionId,
    nodeId: TARGET_NODE_ID,
    sourceNodeId: SOURCE_NODE_ID,
    replicaId: sourceReplicaId,
  });
  operation.replicaId = targetReplicaId;
  operation.workflowStep = WORKFLOW_STEP.ACTIVE;
  operation.status = 'active';
  await coordinator.repository.persistOperationUpdate(operation);

  const removeDeliveries = () => deliveries.filter((delivery) =>
    delivery.payload?.type === ReplicaOperationMessageType.REMOVE_REPLICA);
  const readStep = async () =>
    (await coordinator.queryOperationById(operation.operationId))
      ?.workflowStep;
  const shutdown = async () => {
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  };
  return {
    profile, coordinator, owner, operation, readiness, fallbackTimers, witness,
    evaluations, deferErrors, hooks, removeDeliveries, readStep, shutdown,
    flipReady: () =>
      readiness.setLevel(profile.wakingNodeId, LEVEL.READY),
    publishWaking: () => readiness.publish(profile.wakingNodeId),
  };
}

async function deferInitially(t, harness) {
  const result = await harness.coordinator.executeOperation(harness.operation);
  t.equal(result?.skipped, true, 'the REPLACE defers on refresh-pending readiness');
  t.match(harness.deferErrors.at(-1), harness.profile.deferPattern,
    'the deferral has the profile\'s cause');
  t.equal(harness.removeDeliveries().length, 0, 'no source removal while deferred');
  t.equal(harness.fallbackTimers.length, 1, 'the 1 s fallback is armed');
  t.equal(
    harness.fallbackTimers[0].delayMs,
    SAFETY_DEFERRED_RETRY_DELAY_MS,
    'the fallback is the owner-shared safety delay',
  );
}

function assertProgressedWithoutFallback(t, harness, step) {
  t.equal(harness.removeDeliveries().length, 1, 'SAFE dispatched REMOVE_REPLICA');
  t.equal(
    harness.removeDeliveries()[0]?.target?.startsWith(SOURCE_NODE_ID),
    true,
    'the removal goes to the source',
  );
  t.equal(step, WORKFLOW_STEP.STOPPING, 'the REPLACE advanced to STOPPING');
  t.equal(
    harness.fallbackTimers.some((timer) => timer.fired),
    false,
    'the fallback timer never fired',
  );
}

function profileTest(name, run) {
  for (const profile of PROFILES) {
    test(`${name} [${profile.name}]`, async (t) => {
      const harness = await createDeferredReplaceHarness(profile);
      try {
        await run(t, harness);
      } finally {
        await harness.shutdown();
      }
    });
  }
}

function holdOwnerLane(harness) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const holder = harness.owner.operationWorkflowRunExclusive(
    harness.owner.getOperationOwnerSingleFlightKey(
      harness.operation.operationId,
    ),
    () => gate,
  );
  return {release, holder};
}

profileTest('(a) readiness publication wakes the deferred REPLACE to SAFE ' +
  'and REMOVE_REPLICA with the fallback clock frozen', async (t, harness) => {
  await deferInitially(t, harness);
  harness.flipReady();
  harness.publishWaking();
  await settle();
  assertProgressedWithoutFallback(t, harness, await harness.readStep());
});

profileTest('(b) with the publication suppressed, the fallback still ' +
  'recovers progress through the same owner', async (t, harness) => {
  await deferInitially(t, harness);
  harness.flipReady();
  await settle();
  t.equal(harness.removeDeliveries().length, 0,
    'no publication, no fallback: the REPLACE stays deferred');
  const timer = harness.fallbackTimers[0];
  timer.fired = true;
  await timer.fn();
  await settle();
  t.equal(harness.removeDeliveries().length, 1,
    'the fallback re-entry dispatched REMOVE_REPLICA');
  t.equal(await harness.readStep(), WORKFLOW_STEP.STOPPING,
    'the fallback advanced the REPLACE to STOPPING');
});

profileTest('(c) lost-wakeup race: the flip and its publication land ' +
  'between the not-ready read and the registration, identity unchanged',
async (t, harness) => {
  const wakingNodeId = harness.profile.wakingNodeId;
  const identityBefore =
    harness.readiness.readPlanningProjectionIdentity(wakingNodeId);
  let publishedToListeners = null;
  harness.hooks.afterEvaluate = (evaluation, count) => {
    if (count !== 1) {
      return;
    }
    // The evaluation has read refresh-pending and returns DEFER; the
    // waiter does not exist yet. The build completes and publishes now.
    publishedToListeners = harness.readiness.listeners.size;
    harness.flipReady();
    harness.publishWaking();
  };
  const result =
    await harness.coordinator.executeOperation(harness.operation);
  t.equal(result?.skipped, true, 'the racing evaluation itself deferred');
  t.match(harness.deferErrors[0], harness.profile.deferPattern,
    'it deferred with the profile\'s cause');
  t.equal(publishedToListeners, 0,
    'the publication reached no owner waiter (it was not registered yet)');
  t.same(
    harness.readiness.readPlanningProjectionIdentity(wakingNodeId),
    identityBefore,
    'the planning identity did not change across the flip (BR1)',
  );
  await settle();
  assertProgressedWithoutFallback(t, harness, await harness.readStep());
});

profileTest('(d1) a wake while an unrelated owner run holds the lane is ' +
  'not lost', async (t, harness) => {
  await deferInitially(t, harness);
  const lane = holdOwnerLane(harness);
  harness.flipReady();
  harness.publishWaking();
  await settle();
  t.equal(harness.removeDeliveries().length, 0,
    'the wake joined the holder; nothing ran yet');
  lane.release();
  await lane.holder;
  await settle();
  assertProgressedWithoutFallback(t, harness, await harness.readStep());
});

profileTest('(d2) a wake during an in-flight evaluation that read before ' +
  'the flip reruns instead of sleeping until the fallback',
async (t, harness) => {
  await deferInitially(t, harness);
  let releaseEvaluation;
  const evaluationGate = new Promise((resolve) => {
    releaseEvaluation = resolve;
  });
  let evaluationHeld = false;
  harness.hooks.afterEvaluate = async (evaluation, count) => {
    if (count === 2) {
      evaluationHeld = true;
      await evaluationGate;
    }
  };
  // A second owner run (as the fallback would start it) reads
  // refresh-pending and is held before it returns DEFER.
  const inFlight = harness.owner.runOperationOwnerAction(
    OPERATION_OWNER_ACTION.EXECUTE,
    harness.operation,
    {boundary: 'witness_in_flight_run'},
  );
  await settle();
  t.equal(evaluationHeld, true, 'the in-flight evaluation read pre-flip');
  harness.flipReady();
  harness.publishWaking();
  await settle();
  releaseEvaluation();
  await inFlight;
  await settle();
  assertProgressedWithoutFallback(t, harness, await harness.readStep());
});

profileTest('(d3) a change during the wake\'s own run, which read the ' +
  'previous level, reruns it (per-operation rerun-on-dirty)',
async (t, harness) => {
  await deferInitially(t, harness);
  let releaseEvaluation;
  const evaluationGate = new Promise((resolve) => {
    releaseEvaluation = resolve;
  });
  const deferredEvaluations = harness.evaluations.length;
  let wakeRunHeld = false;
  harness.hooks.afterEvaluate = async (evaluation, count) => {
    if (count === deferredEvaluations + 1) {
      wakeRunHeld = true;
      await evaluationGate;
    }
  };
  // First wake: the level moves but stays unsafe; its run is held after
  // reading that level.
  harness.profile.applyUnsafeLevelChange(harness.readiness);
  harness.publishWaking();
  await settle();
  t.equal(wakeRunHeld, true, 'the wake run read the unsafe level');
  // Second change while that run holds the lane: now safe.
  harness.readiness.setLevel(PEER_NODE_ID, LEVEL.READY);
  harness.readiness.setLevel(THIRD_NODE_ID, LEVEL.READY);
  harness.readiness.setLevel(TARGET_NODE_ID, LEVEL.READY);
  harness.readiness.publish(THIRD_NODE_ID);
  harness.publishWaking();
  await settle();
  releaseEvaluation();
  await settle();
  assertProgressedWithoutFallback(t, harness, await harness.readStep());
});

profileTest('(e) a wake is never authority: an unsafe level still defers',
  async (t, harness) => {
    await deferInitially(t, harness);
    const evaluationsBefore = harness.evaluations.length;
    harness.publishWaking();
    await settle();
    t.equal(harness.evaluations.length, evaluationsBefore,
      'an unchanged level does not re-evaluate');
    harness.profile.applyUnsafeLevelChange(harness.readiness);
    harness.publishWaking();
    await settle();
    t.ok(harness.evaluations.length > evaluationsBefore,
      'a changed level woke the owner, which re-evaluated');
    t.equal(harness.evaluations.at(-1), 'defer',
      'the re-evaluation still defers');
    t.match(harness.deferErrors.at(-1), harness.profile.deferPattern,
      'with the same unsafe cause');
    t.equal(harness.removeDeliveries().length, 0,
      'no source removal on a wake alone');
    t.equal(await harness.readStep(), WORKFLOW_STEP.ACTIVE,
      'the REPLACE stays ACTIVE');
    t.equal(harness.fallbackTimers.some((timer) => timer.fired), false,
      'the fallback never fired');
  });

profileTest('(f) a fallback fire into a held lane is not lost (lab: 5 of ' +
  '11 fires)', async (t, harness) => {
  await deferInitially(t, harness);
  harness.flipReady();
  const lane = holdOwnerLane(harness);
  const timer = harness.fallbackTimers[0];
  timer.fired = true;
  const fire = timer.fn();
  await settle();
  t.equal(harness.removeDeliveries().length, 0,
    'the fire joined the holder; nothing ran yet');
  lane.release();
  await lane.holder;
  await fire;
  await settle();
  t.equal(harness.removeDeliveries().length, 1,
    'the fire re-entered after the holder and dispatched REMOVE_REPLICA');
  t.equal(await harness.readStep(), WORKFLOW_STEP.STOPPING,
    'the REPLACE advanced to STOPPING');
});

profileTest('the owner holds one readiness subscription and releases it ' +
  'at shutdown (R13)', async (t, harness) => {
  await deferInitially(t, harness);
  await harness.coordinator.executeOperation(harness.operation);
  t.equal(harness.readiness.listeners.size, 1,
    'repeated deferrals share one subscription');
  await harness.coordinator.shutdown();
  t.equal(harness.readiness.listeners.size, 0,
    'shutdown released the subscription');
});
