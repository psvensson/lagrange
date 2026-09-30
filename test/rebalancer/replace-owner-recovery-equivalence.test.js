/**
 * P3 recovery equivalence (quest replace-source-removal-owner, amendment-1
 * §3; checklist item (vi): missed notifications and restarts recover through
 * the same owner).
 *
 * For every owner phase Φ1-Φ6 (REPLACE_OWNER_PHASE, production) and every
 * restart class (REPLACE_OWNER_RESTART_CLASS, production), a REPLACE is
 * driven to the phase and then either continued or restarted and recovered.
 * Both runs meet the same authoritative evolution of the world - readiness
 * turns usable, a handoff moves leadership to the target, the source's
 * lifecycle retires after its removal effect, and a REMOVE_PEER proposal the
 * witness still holds commits - and are driven by the same entry points (the
 * 1 s fallback, the timeout sweep, the orphan sweep, consensus events). The
 * two must converge to the same committed configuration (the source out of
 * the witness's voters) and the same outcome (REMOVED), and neither may reach
 * FAILED. The DISPATCH entry route is crossed with Φ1-Φ3 after a membership
 * epoch advance (BR6). D2's restart points 4 and 5 (budgets already exceeded;
 * the target alive after a long wait) are restarts after a clock jump past
 * every former budget.
 *
 * Membership authority: the witness double of replace-witness-fixture.js, a
 * model of the target replica's committed configuration that moves only as
 * raft would (a removal commits only while a proposal of it is live; a
 * runtime rebuild loses the proposals it held). It is not derived from rows.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CDC_OPERATION,
  NODE_STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
  WORKFLOW_STEP_TO_STATUS,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  REPLICA_HANDLER_LEADER_HANDOFF_BRANCH,
} from '../../src/node/replica-handler-leader-handoff-methods.js';
import {
  REPLACE_ATTEMPT_NOT_REBUILT,
  REPLACE_OWNER_PHASE,
  REPLACE_OWNER_RESTART_CLASS,
  REPLACE_OWNER_STALENESS_CLASS,
} from '../../src/rebalancer/operation-workflow-replace-owner-recovery.js';
import {
  readReplaceOwnerDiagnostic,
  readReplaceOwnerPhase,
} from '../../src/rebalancer/operation-workflow-replace-owner.js';
import {createMockCache, createTestCoordinator} from './test-helpers.js';
import {
  createReplaceWitness,
  deliveredReplaceWitnessResponse,
} from './replace-witness-fixture.js';
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
const READY_LEASE_EXTENSION_MS = 3_600_000;
const PLANNING_EPOCH = 7;
// Φ1's deferral cause: another node's REMOVE of a peer, not yet terminal.
const CONCURRENT_OPERATION_ROW = Object.freeze({
  operation_id: 'p3-concurrent-remove',
  type: OperationType.REMOVE,
  partition_id: PARTITION_ID,
  entity_type: 'partition',
  entity_id: PARTITION_ID,
  replica_id: `${PARTITION_ID}-r3`,
  source_node_id: PEER_NODE_C,
  target_node_id: PEER_NODE_C,
  status: 'pending',
  workflow_step: WORKFLOW_STEP.PENDING,
  created_at: Date.now(),
  updated_at: Date.now(),
  completed_at: null,
  steps_history: JSON.stringify([{step: WORKFLOW_STEP.PENDING,
    timestamp: Date.now()}]),
});
// One round of the world: past the witness's transfer window, so a backstop
// that exists is reached within a round or two.
const ROUND_ADVANCE_MS = 1_100;
const MAX_ROUNDS = 24;
const SETTLE_TURNS = 40;
// D2 restart points 4 and 5: past the former 60 s step and 300 s operation
// budgets.
const LONG_WAIT_MS = 3_600_000;

function readyNode(nodeId) {
  return {
    node_id: nodeId,
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.READY,
    ready_lease_expires_at: Date.now() + READY_LEASE_EXTENSION_MS,
  };
}

function serviceRow(replicaId, nodeId, raftRole, status = 'active') {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: PARTITION_ID,
    node_id: nodeId,
    service_type: 'partition',
    status,
    raft_role: raftRole,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

async function settle() {
  for (let turn = 0; turn < SETTLE_TURNS; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// The readiness owner as the remove-safety evaluation reads it, with its
// publication subscription (a wake) and the published membership epoch.
function createReadiness(world) {
  const listeners = new Set();
  const base = createPublishedPlanningReadinessService({
    publicationStatus: 'PUBLISHED',
    activeNodeIds: NODE_IDS,
    membershipTargetNodeId: TARGET_NODE_ID,
  });
  return {
    ...base,
    getCurrentPublishedMembershipEpochSync() {
      return world.epoch;
    },
    subscribeReadinessPlanningSnapshots(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(nodeId) {
      if (world.eventsSuppressed) {
        return;
      }
      for (const listener of [...listeners]) {
        listener({ownerKey: nodeId,
          snapshot: base.getNodeReadinessSync(nodeId)});
      }
    },
  };
}

function createWorld() {
  const world = {
    epoch: PLANNING_EPOCH,
    // The target leads unless a phase driver says otherwise (BR11: only
    // the target leading authorizes the removal).
    witness: createReplaceWitness({leaderReplicaId: TARGET_REPLICA_ID}),
    // Proposals a witness runtime rebuild lost: retirements before this
    // index never commit.
    lostProposalCount: 0,
    holdNextEffect: false,
    heldEffect: null,
    stepDowns: [],
    removeEffects: [],
    fallbackTimers: [],
    relayListeners: new Set(),
    clockOffsetMs: 0,
    coordinator: null,
    cache: null,
  };
  world.readiness = createReadiness(world);
  world.relay = {
    subscribe(listener) {
      world.relayListeners.add(listener);
      return () => world.relayListeners.delete(listener);
    },
  };
  return world;
}

function emitConsensus(world, fields) {
  if (world.eventsSuppressed) {
    return;
  }
  for (const listener of [...world.relayListeners]) {
    listener({partitionId: PARTITION_ID, replicaId: TARGET_REPLICA_ID,
      ...fields});
  }
}

function setSourceRow(world, status) {
  if (status === null) {
    world.cache.delete('services', SOURCE_REPLICA_ID);
    return;
  }
  world.cache.upsert('services',
    serviceRow(SOURCE_REPLICA_ID, SOURCE_NODE_ID, 'follower', status));
}

function sourceRowStatus(world) {
  return world.cache.get('services', SOURCE_REPLICA_ID)?.status ?? null;
}

// The source node's handler: the removal effect retires the source's
// lifecycle (its row reads REMOVING); the rest of the cluster answers as a
// healthy peer.
async function deliver(world, target, payload) {
  const witnessAnswer = world.witness.answer(payload);
  if (witnessAnswer) {
    return deliveredReplaceWitnessResponse(witnessAnswer);
  }
  if (payload?.type === ReplicaOperationMessageType.REMOVE_REPLICA) {
    if (world.holdNextEffect) {
      world.holdNextEffect = false;
      await new Promise((resolve) => {
        world.heldEffect = {release: resolve};
      });
    }
    world.removeEffects.push(payload);
    if (sourceRowStatus(world) === ReplicaStatus.ACTIVE) {
      setSourceRow(world, ReplicaStatus.REMOVING);
    }
    return {acknowledged: true,
      status: ReplicaOperationResponseStatus.INITIATED};
  }
  if (payload?.type === ReplicaOperationMessageType.STEP_DOWN_REPLICA) {
    world.stepDowns.push(payload);
    return {acknowledged: true,
      status: ReplicaOperationResponseStatus.COMPLETED,
      handoffBranch: REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_REQUESTED};
  }
  return {acknowledged: true, status: ReplicaOperationResponseStatus.INITIATED};
}

// The node's system-table cache. Its change listeners (the production
// cache's contract: (table, CDC operation, row), outside the writer's turn)
// are told only of rows another node wrote and CDC replicated here
// (replicateRemoteRow); the owner's own writes stay silent, as the reduced
// double always was.
function createObservedCache() {
  const cache = createMockCache({
    nodes: NODE_IDS.map(readyNode),
    services: [
      serviceRow(SOURCE_REPLICA_ID, SOURCE_NODE_ID, 'follower'),
      serviceRow(PEER_REPLICA_B, PEER_NODE_B, 'leader'),
      serviceRow(`${PARTITION_ID}-r3`, PEER_NODE_C, 'follower'),
      serviceRow(TARGET_REPLICA_ID, TARGET_NODE_ID, 'follower'),
    ],
  });
  const listeners = new Set();
  cache.onCacheChange = (listener) => listeners.add(listener);
  cache.offCacheChange = (listener) => listeners.delete(listener);
  // A row another node wrote, applied here by CDC with its notification.
  cache.observeRemoteRow = (tableName, row) => {
    cache.upsert(tableName, row);
    Promise.resolve().then(() => {
      for (const listener of [...listeners]) {
        listener(tableName, CDC_OPERATION.UPDATE, {...row}, null);
      }
    });
  };
  cache.replicateRemoteRow = async (gateway, tableName, row) => {
    // The other node's durable write (the shared store), then its CDC
    // replication into this node's cache and its change notification.
    await gateway.submitMutation({tableName, operation: 'update',
      whereClause: {operation_id: row.operation_id}, data: row});
    cache.upsert(tableName, row);
    Promise.resolve().then(() => {
      for (const listener of [...listeners]) {
        listener(tableName, CDC_OPERATION.UPDATE, {...row}, null);
      }
    });
  };
  return cache;
}

function startCoordinator(world) {
  world.cache = world.cache || createObservedCache();
  const coordinator = createTestCoordinator({
    nodeId: TARGET_NODE_ID,
    enableTimeouts: false,
    replaceWitness: false,
    systemTableCache: world.cache,
    messageRouter: {
      deliver: (target, payload) => deliver(world, target, payload),
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    controlPlaneReadinessService: world.readiness,
    tablePolicyService: {getPolicyForPartition: () => ({minReplicaCount: 3})},
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs, cleared: false, unref() {}};
      world.fallbackTimers.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) {
        handle.cleared = true;
      }
    },
  });
  coordinator.workflowOwner.timeSource = {
    now: () => Date.now() + world.clockOffsetMs,
  };
  coordinator.initialize();
  coordinator.attachReplicaConsensusEvents(world.relay);
  world.coordinator = coordinator;
  return coordinator;
}

async function createReplace(world) {
  const coordinator = world.coordinator;
  const operation = await coordinator.createOperation({
    type: OperationType.REPLACE,
    partitionId: PARTITION_ID,
    nodeId: TARGET_NODE_ID,
    sourceNodeId: SOURCE_NODE_ID,
    replicaId: SOURCE_REPLICA_ID,
    membershipPublicationEpoch: PLANNING_EPOCH,
  });
  operation.replicaId = TARGET_REPLICA_ID;
  operation.workflowStep = WORKFLOW_STEP.ACTIVE;
  operation.status = ReplicaStatus.ACTIVE;
  await coordinator.repository.persistOperationUpdate(operation);
  // The planner's epoch binding is durable on the row (the reduced SQL double
  // does not carry the column, so the row is bound here).
  const row = world.cache.get('replica_operations', operation.operationId);
  world.cache.upsert('replica_operations',
    {...row, membership_publication_epoch: PLANNING_EPOCH});
  operation.membershipPublicationEpoch = PLANNING_EPOCH;
  return operation;
}

async function readPersisted(world, operationId) {
  return world.coordinator.getOperation(operationId);
}

function isTerminalStep(step) {
  return step === WORKFLOW_STEP.REMOVED || step === WORKFLOW_STEP.FAILED;
}

// One step of the authoritative evolution, identical for every run.
function evolveWorld(world) {
  if (world.concurrentOperationOpen) {
    world.concurrentOperationOpen = false;
    world.cache.upsert('replica_operations', {...CONCURRENT_OPERATION_ROW,
      status: ReplicaStatus.FAILED, workflow_step: WORKFLOW_STEP.FAILED,
      completed_at: Date.now()});
    world.readiness.publish(PEER_NODE_C);
  }
  // A named-target handoff moves leadership to the target (whoever led).
  if (world.stepDowns.length > 0 &&
      world.witness.leaderReplicaId !== TARGET_REPLICA_ID) {
    world.witness.leaderReplicaId = TARGET_REPLICA_ID;
    world.witness.term += 1;
    emitConsensus(world, {leaderReplicaId: TARGET_REPLICA_ID,
      term: world.witness.term});
  }
  if (world.heldEffect && !world.effectAbandoned) {
    world.heldEffect.release();
    world.heldEffect = null;
  }
  if (sourceRowStatus(world) === ReplicaStatus.REMOVING) {
    setSourceRow(world, null);
  }
  if (world.witness.sourceVoter &&
      world.witness.retirements.length > world.lostProposalCount) {
    world.witness.commitRemoval();
    emitConsensus(world, {
      confState: {voters: ['2', '3', '4'], votersOutgoing: []},
      commitIndex: world.witness.commitIndex,
    });
  }
}

async function fireFallbackTimers(world) {
  const due = world.fallbackTimers.splice(0);
  for (const handle of due) {
    if (!handle.cleared) {
      handle.fn();
    }
  }
}

// The owner's liveness backstops: each alone must recover a REPLACE whose
// every event was missed.
const BACKSTOPS = Object.freeze({
  fallbackTimer: (world) => fireFallbackTimers(world),
  timeoutSweep: (world) => world.coordinator.checkTimeouts(),
  orphanSweep: (world) => world.coordinator.reconcileOrphanedOperations(),
});

async function runToQuiescence(world, operationId,
  backstops = Object.values(BACKSTOPS)) {
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    evolveWorld(world);
    await settle();
    const persisted = await readPersisted(world, operationId);
    if (isTerminalStep(persisted?.workflowStep)) {
      break;
    }
    world.clockOffsetMs += ROUND_ADVANCE_MS;
    for (const backstop of backstops) {
      await backstop(world);
      await settle();
    }
  }
  const persisted = await readPersisted(world, operationId);
  return Object.freeze({
    workflowStep: persisted?.workflowStep ?? null,
    sourceVoter: world.witness.sourceVoter,
  });
}

async function execute(world, operation) {
  return world.coordinator.executeOperation(operation);
}

// Drive a fresh REPLACE to the named phase. Every production phase must have
// a driver: the table is checked against the enumeration below.
const PHASE_DRIVERS = Object.freeze({
  [REPLACE_OWNER_PHASE.ACTIVE_DEFERRING]: async (world, operation) => {
    // Remove safety defers behind a concurrent operation on the partition
    // (CL-043 serialization), owned by another node.
    world.cache.upsert('replica_operations', CONCURRENT_OPERATION_ROW);
    world.concurrentOperationOpen = true;
    await execute(world, operation);
  },
  [REPLACE_OWNER_PHASE.ACTIVE_ATTEMPT_UNRESOLVED]: async (world, operation) => {
    world.witness.leaderReplicaId = SOURCE_REPLICA_ID;
    await execute(world, operation);
  },
  [REPLACE_OWNER_PHASE.INTENT_EFFECT_PENDING]: async (world, operation) => {
    world.holdNextEffect = true;
    world.pendingExecution = execute(world, operation);
    for (let turn = 0; turn < SETTLE_TURNS && !world.heldEffect; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  },
  [REPLACE_OWNER_PHASE.SOURCE_ROW_RETIRING]: async (world, operation) => {
    await execute(world, operation);
  },
  [REPLACE_OWNER_PHASE.MEMBERSHIP_REMOVAL_UNCOMMITTED]:
    async (world, operation) => {
      await execute(world, operation);
      setSourceRow(world, null);
      await world.coordinator.reconcileOperationProgress(
        await readPersisted(world, operation.operationId));
    },
  [REPLACE_OWNER_PHASE.REMOVAL_COMMITTED_TERMINAL_UNWRITTEN]:
    async (world, operation) => {
      await execute(world, operation);
      setSourceRow(world, null);
      await world.coordinator.reconcileOperationProgress(
        await readPersisted(world, operation.operationId));
      world.witness.commitRemoval();
    },
});

const RESTARTS = Object.freeze({
  [REPLACE_OWNER_RESTART_CLASS.PROCESS_RESTART]: async (world) => {
    // The process dies: an effect still in flight is lost with it.
    world.effectAbandoned = true;
    world.heldEffect = null;
    await world.coordinator.shutdown();
    startCoordinator(world);
  },
  [REPLACE_OWNER_RESTART_CLASS.COORDINATOR_REINIT]: async (world) => {
    await world.coordinator.shutdown();
    world.coordinator.initialize();
    world.coordinator.attachReplicaConsensusEvents(world.relay);
  },
  [REPLACE_OWNER_RESTART_CLASS.WITNESS_RUNTIME_REBUILD]: async (world) => {
    // The witness's runtime is rebuilt: the proposals it held are lost; its
    // first observation after construction is announced again.
    world.lostProposalCount = world.witness.retirements.length;
    emitConsensus(world, {
      confState: world.witness.sourceVoter ?
        {voters: ['1', '2', '3', '4'], votersOutgoing: []} :
        {voters: ['2', '3', '4'], votersOutgoing: []},
      commitIndex: world.witness.commitIndex,
    });
  },
});

async function runCell({phase, recover, clockJumpMs = 0, backstops,
  eventsSuppressed = false}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const world = createWorld();
  startCoordinator(world);
  try {
    const operation = await createReplace(world);
    await PHASE_DRIVERS[phase](world, operation);
    const reachedPhase = await readReplaceOwnerPhase(
      world.coordinator.workflowOwner,
      await readPersisted(world, operation.operationId));
    world.clockOffsetMs += clockJumpMs;
    if (recover) {
      await recover(world, operation);
    }
    world.eventsSuppressed = eventsSuppressed;
    const outcome = await runToQuiescence(world, operation.operationId,
      backstops);
    return {reachedPhase, outcome, removeEffects: world.removeEffects.length};
  } finally {
    await world.coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
}

function assertConverged(t, label, continued, recovered) {
  t.equal(recovered.outcome.workflowStep, continued.outcome.workflowStep,
    `${label}: same outcome as the continued run ` +
      `(${continued.outcome.workflowStep})`);
  t.equal(recovered.outcome.sourceVoter, continued.outcome.sourceVoter,
    `${label}: same committed configuration`);
  t.equal(recovered.outcome.workflowStep, WORKFLOW_STEP.REMOVED,
    `${label}: the REPLACE completes`);
  t.equal(recovered.outcome.sourceVoter, false,
    `${label}: the source left the committed voters`);
}

test('P3: every owner phase and every production phase has a driver',
  async (t) => {
    t.same(Object.keys(PHASE_DRIVERS).sort(),
      Object.values(REPLACE_OWNER_PHASE).sort(),
      'a new owner phase fails here until it has a driver');
    t.same(Object.keys(RESTARTS).sort(),
      Object.values(REPLACE_OWNER_RESTART_CLASS).sort(),
      'a new restart class fails here until it has a restart');
  });

for (const phase of Object.values(REPLACE_OWNER_PHASE)) {
  test(`P3 ${phase}: continue versus every restart class`, async (t) => {
    const continued = await runCell({phase});
    t.equal(continued.reachedPhase, phase,
      `the driver reached the phase (production classification: ${continued.reachedPhase})`);
    t.equal(continued.outcome.workflowStep, WORKFLOW_STEP.REMOVED,
      'the continued run completes');
    for (const restartClass of Object.values(REPLACE_OWNER_RESTART_CLASS)) {
      const recovered = await runCell({phase,
        recover: RESTARTS[restartClass]});
      t.equal(recovered.reachedPhase, phase, `${restartClass}: phase reached`);
      assertConverged(t, restartClass, continued, recovered);
    }
  });
}

// BR6 x P3: the DISPATCH entry route after a membership epoch advance, over
// the phases where the dispatch epoch gate could apply.
const DISPATCH_ROUTE_PHASES = Object.freeze([
  REPLACE_OWNER_PHASE.ACTIVE_DEFERRING,
  REPLACE_OWNER_PHASE.ACTIVE_ATTEMPT_UNRESOLVED,
  REPLACE_OWNER_PHASE.INTENT_EFFECT_PENDING,
]);

for (const phase of DISPATCH_ROUTE_PHASES) {
  test(`P3 ${phase} x DISPATCH after an epoch advance`, async (t) => {
    const continued = await runCell({phase});
    const recovered = await runCell({phase,
      recover: async (world, operation) => {
        world.epoch = PLANNING_EPOCH + 1;
        await world.coordinator.workflowOwner.dispatchOperationInternal(
          await readPersisted(world, operation.operationId));
      }});
    assertConverged(t, 'dispatch route', continued, recovered);
  });
}

// D2 restart points 4 and 5: the former budgets have long passed when the
// owner restarts; nothing times the REPLACE out, and it converges the same.
for (const phase of [
  REPLACE_OWNER_PHASE.SOURCE_ROW_RETIRING,
  REPLACE_OWNER_PHASE.MEMBERSHIP_REMOVAL_UNCOMMITTED,
]) {
  test(`D2 restart after every former budget passed: ${phase}`, async (t) => {
    const continued = await runCell({phase});
    const recovered = await runCell({phase, clockJumpMs: LONG_WAIT_MS,
      recover: RESTARTS[REPLACE_OWNER_RESTART_CLASS.PROCESS_RESTART]});
    assertConverged(t, 'long wait then restart', continued, recovered);
  });
}

// Missed notifications: every readiness and consensus event after the phase
// is lost; each backstop alone recovers the REPLACE through the same owner,
// from every phase.
for (const phase of Object.values(REPLACE_OWNER_PHASE)) {
  test(`missed events, ${phase}: each backstop alone recovers`, async (t) => {
    const continued = await runCell({phase});
    for (const [name, backstop] of Object.entries(BACKSTOPS)) {
      const recovered = await runCell({phase, eventsSuppressed: true,
        backstops: [backstop]});
      assertConverged(t, name, continued, recovered);
    }
  });
}

// BR10: a restart does not forget an attempt it cannot see. The attempt the
// previous session issued may still be in flight, so the rebuilt owner treats
// it as outstanding: no second attempt until a fresh read resolves it (the
// target leads; the witness's level moved) or the transfer window passes.
// D2: at most one logical removal attempt is active or uncertain at a time.
const WITHIN_WINDOW_MS = 400;
const OWNER_STATE_RESTARTS = Object.freeze([
  REPLACE_OWNER_RESTART_CLASS.PROCESS_RESTART,
  REPLACE_OWNER_RESTART_CLASS.COORDINATOR_REINIT,
]);

// Every backstop once, after the clock advanced (no world evolution).
async function enterOwnerAfter(world, advanceMs) {
  world.clockOffsetMs += advanceMs;
  for (const backstop of Object.values(BACKSTOPS)) {
    await backstop(world);
    await settle();
  }
}

async function withDrivenWorld(phase, body) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const world = createWorld();
  startCoordinator(world);
  try {
    const operation = await createReplace(world);
    await PHASE_DRIVERS[phase](world, operation);
    await body(world, operation);
  } finally {
    await world.coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
}

test('BR10: an uncertain REMOVE_PEER survives a restart as outstanding',
  async (t) => {
    for (const restartClass of OWNER_STATE_RESTARTS) {
      await withDrivenWorld(REPLACE_OWNER_PHASE.MEMBERSHIP_REMOVAL_UNCOMMITTED,
        async (world, operation) => {
          const issued = world.witness.retirements.length;
          t.ok(issued >= 1, `${restartClass}: an attempt was issued`);
          await RESTARTS[restartClass](world);
          await enterOwnerAfter(world, WITHIN_WINDOW_MS);
          t.equal(world.witness.retirements.length, issued,
            `${restartClass}: no second attempt within the window`);
          await enterOwnerAfter(world, ROUND_ADVANCE_MS);
          t.equal(world.witness.retirements.length, issued + 1,
            `${restartClass}: the backstop re-drives once past the window`);
          const outcome = await runToQuiescence(world, operation.operationId);
          t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED,
            `${restartClass}: it completes`);
        });
    }
  });

test('BR10: an unresolved handoff survives a restart as outstanding',
  async (t) => {
    for (const restartClass of OWNER_STATE_RESTARTS) {
      await withDrivenWorld(REPLACE_OWNER_PHASE.ACTIVE_ATTEMPT_UNRESOLVED,
        async (world, operation) => {
          const issued = world.stepDowns.length;
          t.equal(issued, 1, `${restartClass}: one handoff was issued`);
          await RESTARTS[restartClass](world);
          await enterOwnerAfter(world, WITHIN_WINDOW_MS);
          t.equal(world.stepDowns.length, issued,
            `${restartClass}: no second handoff within the window`);
          await enterOwnerAfter(world, ROUND_ADVANCE_MS);
          t.equal(world.stepDowns.length, issued + 1,
            `${restartClass}: the next attempt past the window`);
          t.equal(world.stepDowns.at(-1)?.replicaId, TARGET_REPLICA_ID,
            `${restartClass}: it names the same target`);
          const outcome = await runToQuiescence(world, operation.operationId);
          t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED,
            `${restartClass}: it completes`);
        });
    }
  });

// BR17: the owner's per-operation state (its waiter, attempt and diagnostic)
// is released on ANY terminal observation - including a terminal another
// node wrote, seen only through the replicated row - and nothing reads the
// witness for it afterwards.
test('BR17: a terminal written elsewhere releases the waiting owner',
  async (t) => {
    for (const terminalStep of [WORKFLOW_STEP.REMOVED, WORKFLOW_STEP.FAILED]) {
      await withDrivenWorld(REPLACE_OWNER_PHASE.MEMBERSHIP_REMOVAL_UNCOMMITTED,
        async (world, operation) => {
          const owner = world.coordinator.workflowOwner;
          t.ok(readReplaceOwnerDiagnostic(owner, operation.operationId),
            `${terminalStep}: the waiting owner holds its diagnostic`);
          const row = world.cache.get('replica_operations',
            operation.operationId);
          await world.cache.replicateRemoteRow(
            world.coordinator.controlPlaneSystemTableGateway,
            'replica_operations', {...row,
              workflow_step: terminalStep,
              status: WORKFLOW_STEP_TO_STATUS[terminalStep],
              completed_at: Date.now()});
          await settle();
          t.equal(readReplaceOwnerDiagnostic(owner, operation.operationId),
            null, `${terminalStep}: its state is released`);
          const readsBefore = world.witness.reads.length;
          emitConsensus(world, {leaderReplicaId: PEER_REPLICA_B, term: 99});
          await fireFallbackTimers(world);
          await settle();
          t.equal(world.witness.reads.length, readsBefore,
            `${terminalStep}: no wake or fallback reads the witness again`);
        });
    }
  });

// S9 (D2 diagnostics): every owner wait is observable - why, since when, in
// which owner phase, how its staleness is classified, whether R-1f may act,
// and whether its attempt was rebuilt after a restart - as one bounded record
// that repeated waits replace, never extend.
const WAITING_PHASES = Object.freeze([
  REPLACE_OWNER_PHASE.ACTIVE_DEFERRING,
  REPLACE_OWNER_PHASE.ACTIVE_ATTEMPT_UNRESOLVED,
  REPLACE_OWNER_PHASE.SOURCE_ROW_RETIRING,
  REPLACE_OWNER_PHASE.MEMBERSHIP_REMOVAL_UNCOMMITTED,
]);
// R-1f's preconditions (the source still a voter, its row retiring or gone)
// hold exactly in these phases by their definitions.
const RETIREMENT_ADMISSIBLE_PHASES = Object.freeze(new Set([
  REPLACE_OWNER_PHASE.SOURCE_ROW_RETIRING,
  REPLACE_OWNER_PHASE.MEMBERSHIP_REMOVAL_UNCOMMITTED,
]));
const REPEATED_WAITS = 5;

test('S9: each owner wait records one bounded, complete diagnostic',
  async (t) => {
    for (const phase of WAITING_PHASES) {
      await withDrivenWorld(phase, async (world, operation) => {
        const owner = world.coordinator.workflowOwner;
        const first = readReplaceOwnerDiagnostic(owner, operation.operationId);
        t.ok(first, `${phase}: the wait is observable`);
        t.equal(first?.ownerPhase, phase, `${phase}: it names its phase`);
        t.ok(typeof first?.reason === 'string' && first.reason.length > 0,
          `${phase}: it names why it waits`);
        t.ok(Number.isFinite(first?.waitingSinceMs),
          `${phase}: and since when`);
        t.equal(first?.stalenessClass,
          REPLACE_OWNER_STALENESS_CLASS.NEVER_STALE_BY_AGE,
          `${phase}: a live target's REPLACE is never stale by age`);
        t.equal(first?.retirementAdmissible,
          RETIREMENT_ADMISSIBLE_PHASES.has(phase),
          `${phase}: R-1f admissibility`);
        t.equal(first?.attemptRebuiltAfter, REPLACE_ATTEMPT_NOT_REBUILT,
          `${phase}: no attempt was rebuilt in an uninterrupted run`);
        for (let wait = 0; wait < REPEATED_WAITS; wait += 1) {
          await enterOwnerAfter(world, WITHIN_WINDOW_MS);
        }
        const later = readReplaceOwnerDiagnostic(owner, operation.operationId);
        t.same(Object.keys(later || {}).sort(), Object.keys(first).sort(),
          `${phase}: repeated waits replace the record, never extend it`);
        t.notOk(Object.values(later || {}).some(Array.isArray),
          `${phase}: nothing in it grows per retry`);
        t.equal(later?.waitingSinceMs, first.waitingSinceMs,
          `${phase}: the same wait keeps its start`);
      });
    }
  });

test('S9: a rebuilt attempt is named in the diagnostic', async (t) => {
  await withDrivenWorld(REPLACE_OWNER_PHASE.MEMBERSHIP_REMOVAL_UNCOMMITTED,
    async (world, operation) => {
      await RESTARTS[REPLACE_OWNER_RESTART_CLASS.PROCESS_RESTART](world);
      await enterOwnerAfter(world, WITHIN_WINDOW_MS);
      t.equal(readReplaceOwnerDiagnostic(world.coordinator.workflowOwner,
        operation.operationId)?.attemptRebuiltAfter,
      REPLACE_OWNER_RESTART_CLASS.PROCESS_RESTART,
      'the wait names the restart its attempt was rebuilt after');
    });
});

// §2.0 wake tuple (amendment-1): the level the waiting owner registers is
// (readiness, consensus, concurrency). The source-row class is not in it
// because a source-row change already wakes the owner through the
// observed-progress route (a services-row change of a REPLACE's source maps
// to the REPLACE); attempt resolution is either an answer (the handoff's E11
// continuation decides again at once) or elapsed time (the backstop). This
// witness pins the source-row half: no timer fires.
test('wake tuple: a source-row retirement wakes the waiting owner with no ' +
  'timer firing', async (t) => {
  await withDrivenWorld(REPLACE_OWNER_PHASE.SOURCE_ROW_RETIRING,
    async (world, operation) => {
      const reads = world.witness.reads.length;
      world.fallbackTimers.length = 0;
      world.cache.observeRemoteRow('services', serviceRow(SOURCE_REPLICA_ID,
        SOURCE_NODE_ID, 'follower', ReplicaStatus.REMOVED));
      await settle();
      t.equal(world.fallbackTimers.filter((handle) => handle.fired).length, 0,
        'no fallback fired');
      t.ok(world.witness.reads.length > reads,
        'the owner re-decided on the row change (a fresh membership read)');
      t.equal((await readPersisted(world, operation.operationId))
        .workflowStep, WORKFLOW_STEP.STOPPING, 'still waiting on membership');
    });
});
