/**
 * Direct witnesses for the REPLACE source-removal owner (quest
 * replace-source-removal-owner, amendment-1 step 3: (iii) + (i) + D2).
 * Every case reads behaviour only through the coordinator's own entry points
 * and the witness replica double (its committed configuration moves only
 * when a case commits the removal):
 *   W1  the removal intent (STOPPING with its witness metadata) is durable
 *       before REMOVE_REPLICA leaves the owner;
 *   W2  C1: completion is refused while the witness still counts the source
 *       as a voter, and granted once the removal is committed;
 *   W3  AN11: an absence read below the intent's commit index is not a
 *       retirement;
 *   W4  R-1f: a retired-but-still-voting source is re-driven through the
 *       witness once per changed level, never on a wake that changed nothing;
 *   W5  D2/P4: time passing the former 60 s / 300 s budgets fails nothing
 *       after the intent;
 *   W6  P6: target death - the source still a voter fails safely (source
 *       retained); an unreadable witness waits; an absent source completes;
 *   W7  step 0 + step 1: the waiting owner is woken by the node's consensus
 *       relay (a committed membership change), with no timer firing.
 */
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationMessageType,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  TERMINAL_TRANSITION_REPAIR_CAUSE,
  armTerminalTransitionRepair,
} from '../../src/rebalancer/operation-workflow-terminal-transition-repair.js';
import {createTestCoordinator} from './test-helpers.js';
import {createReplaceWitness} from './replace-witness-fixture.js';

const PARTITION_ID = 'users-p1';
const SOURCE_NODE_ID = 'seed-node';
const TARGET_NODE_ID = 'node-2';
const SOURCE_REPLICA_ID = `${PARTITION_ID}-r1`;
const TARGET_REPLICA_ID = `${PARTITION_ID}-r2`;
const INTENT_COMMIT_INDEX = 10;
// Past the former STOPPING step budget (60 s) and operation budget (300 s).
const LONG_AFTER_MS = 3_600_000;
const POST_INTENT_TARGET_DEATH = 'replace_target_dead_source_retained';

function targetRow(status) {
  return {
    service_id: TARGET_REPLICA_ID,
    replica_id: TARGET_REPLICA_ID,
    partition_id: PARTITION_ID,
    node_id: TARGET_NODE_ID,
    service_type: 'partition',
    status,
    raft_role: 'leader',
    address: `${TARGET_NODE_ID}/partition/${TARGET_REPLICA_ID}`,
  };
}

function parseSteps(row) {
  try {
    return JSON.parse(row?.steps_history || '[]');
  } catch {
    return [];
  }
}

async function createHarness({
  witness = createReplaceWitness({leaderReplicaId: TARGET_REPLICA_ID}),
  sourceStatus = ReplicaStatus.ACTIVE,
} = {}) {
  const deliveries = [];
  const clock = {offsetMs: 0};
  // Timers are held, never fired: every progress below is an entry point
  // the case drives or a wake the case emits.
  const heldTimers = [];
  let coordinator = null;
  const messageRouter = {
    async deliver(target, payload, options) {
      const answered = witness.answer(payload);
      if (answered) {
        return answered;
      }
      const operationId = payload?.operationId || null;
      deliveries.push({
        target,
        payload,
        options,
        // The durable row as it stands when the effect leaves the owner.
        durableRow: operationId ?
          {...coordinator.repository.getReplicaOperationRowFromCache?.(
            operationId)} : null,
      });
      return {acknowledged: true, status: 'initiated'};
    },
  };
  coordinator = createTestCoordinator({
    nodeId: SOURCE_NODE_ID,
    enableTimeouts: false,
    replaceWitness: false,
    messageRouter,
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs, unref() {}};
      heldTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    sqlQueryResults: {
      'FROM services WHERE service_id = ?': {
        success: true,
        rows: [{node_id: SOURCE_NODE_ID, status: sourceStatus}],
        affectedRows: 1,
      },
    },
  });
  const owner = coordinator.workflowOwner;
  owner.timeSource = {now: () => Date.now() + clock.offsetMs};
  coordinator.systemTableCache.upsert('services',
    targetRow(ReplicaStatus.ACTIVE));
  const operation = await coordinator.createOperation({
    type: OperationType.REPLACE,
    partitionId: PARTITION_ID,
    entityType: 'partition',
    entityId: PARTITION_ID,
    nodeId: TARGET_NODE_ID,
    sourceNodeId: SOURCE_NODE_ID,
    replicaId: SOURCE_REPLICA_ID,
  });
  operation.replicaId = TARGET_REPLICA_ID;
  operation.sourceReplicaId = SOURCE_REPLICA_ID;
  return {coordinator, owner, operation, witness, deliveries, clock,
    heldTimers};
}

function removalEffects(deliveries) {
  return deliveries.filter(({payload}) =>
    payload?.type === ReplicaOperationMessageType.REMOVE_REPLICA);
}

// SYNCING -> remove safety SAFE -> the removal-intent boundary.
async function driveToRemovalIntent(harness) {
  harness.operation.workflowStep = WORKFLOW_STEP.SYNCING;
  harness.operation.status = ReplicaStatus.SYNCING;
  await harness.coordinator.reconcileSyncingOperation(harness.operation);
}

async function persistedOperation(harness) {
  return harness.coordinator.getOperation(harness.operation.operationId);
}

test('W1: the removal intent is durable before REMOVE_REPLICA is sent',
  async (t) => {
    const harness = await createHarness();
    try {
      await driveToRemovalIntent(harness);
      const effects = removalEffects(harness.deliveries);
      t.equal(effects.length, 1, 'the source removal effect is sent once');
      const durableRow = effects[0]?.durableRow || {};
      t.equal(durableRow.workflow_step, WORKFLOW_STEP.STOPPING,
        'the durable row is already STOPPING when the effect leaves');
      const intent = parseSteps(durableRow).at(-1) || {};
      t.equal(intent.replaceRemovalIntent, true,
        'the STOPPING entry carries the removal intent');
      t.equal(intent.replaceWitnessCommitIndex, INTENT_COMMIT_INDEX,
        'the intent records the witness commit index it was read at');
      t.equal(intent.replaceWitnessReplicaId, TARGET_REPLICA_ID,
        'the intent names the witness replica');
    } finally {
      await harness.coordinator.shutdown();
    }
  });

test('W2 (C1): completion is refused while the witness counts the source ' +
  'as a voter, and granted once its removal is committed', async (t) => {
  const harness = await createHarness();
  try {
    await driveToRemovalIntent(harness);
    await harness.owner.completeOperation(harness.operation);
    t.equal((await persistedOperation(harness)).workflowStep,
      WORKFLOW_STEP.STOPPING,
      'a still-voting source does not complete the REPLACE');
    harness.witness.commitRemoval();
    await harness.owner.completeOperation(harness.operation);
    t.equal((await persistedOperation(harness)).workflowStep,
      WORKFLOW_STEP.REMOVED, 'the committed removal completes it');
  } finally {
    await harness.coordinator.shutdown();
  }
});

test('W3 (AN11): an absence read below the intent\'s commit index is not ' +
  'a retirement', async (t) => {
  const harness = await createHarness();
  try {
    await driveToRemovalIntent(harness);
    // A lagging witness: the source is absent in a configuration older than
    // the one the intent was recorded against.
    harness.witness.sourceVoter = false;
    harness.witness.commitIndex = INTENT_COMMIT_INDEX - 1;
    await harness.owner.completeOperation(harness.operation);
    t.equal((await persistedOperation(harness)).workflowStep,
      WORKFLOW_STEP.STOPPING, 'the stale absence completes nothing');
    harness.witness.commitIndex = INTENT_COMMIT_INDEX + 1;
    await harness.owner.completeOperation(harness.operation);
    t.equal((await persistedOperation(harness)).workflowStep,
      WORKFLOW_STEP.REMOVED, 'the current absence completes it');
  } finally {
    await harness.coordinator.shutdown();
  }
});

test('W4 (R-1f): a retired source still in the configuration is re-driven ' +
  'once per changed level, never on an unchanged wake', async (t) => {
  const harness = await createHarness({sourceStatus: ReplicaStatus.FAILED});
  try {
    // A STOPPING row another writer left without an intent: the owner
    // records its intent (C0) from a fresh witness read first.
    harness.operation.workflowStep = WORKFLOW_STEP.STOPPING;
    harness.operation.status = ReplicaStatus.ACTIVE;
    harness.operation.stepsHistory = [...harness.operation.stepsHistory,
      {step: WORKFLOW_STEP.STOPPING, timestamp: Date.now()}];
    await harness.coordinator.repository.persistOperationUpdate(
      harness.operation);
    await harness.coordinator.reconcileOperationProgress(harness.operation);
    t.equal(parseSteps(harness.coordinator.repository
      .getReplicaOperationRowFromCache(harness.operation.operationId))
      .find((entry) => entry?.replaceRemovalIntent === true)
      ?.replaceWitnessCommitIndex, INTENT_COMMIT_INDEX,
    'the adopted intent records C0 from the fresh witness read');
    t.equal(harness.witness.retirements.length, 1,
      'REMOVE_PEER of the source is proposed through the witness');
    t.equal(harness.witness.retirements[0]?.sourceReplicaId,
      SOURCE_REPLICA_ID, 'the proposal names the source');
    await harness.coordinator.reconcileOperationProgress(harness.operation);
    t.equal(harness.witness.retirements.length, 1,
      'a wake with the same leader, term and membership proposes nothing');
    harness.witness.term += 1;
    await harness.coordinator.reconcileOperationProgress(harness.operation);
    t.equal(harness.witness.retirements.length, 2,
      'a term change (a proposal it may have dropped) re-drives once');
    t.equal(removalEffects(harness.deliveries).length, 0,
      'the failed source is sent no REMOVE_REPLICA');
    harness.witness.commitRemoval();
    await harness.coordinator.reconcileOperationProgress(harness.operation);
    t.equal((await persistedOperation(harness)).workflowStep,
      WORKFLOW_STEP.REMOVED, 'the committed removal completes it');
  } finally {
    await harness.coordinator.shutdown();
  }
});

test('W5 (D2/P4): time past the former budgets fails nothing after the ' +
  'removal intent', async (t) => {
  const harness = await createHarness();
  try {
    await driveToRemovalIntent(harness);
    harness.clock.offsetMs = LONG_AFTER_MS;
    await harness.owner.checkTimeouts();
    await harness.owner.checkTimeouts();
    const persisted = await persistedOperation(harness);
    t.equal(persisted.workflowStep, WORKFLOW_STEP.STOPPING,
      'the REPLACE is still waiting on its source removal');
    t.notOk(harness.coordinator.repository.isOperationTerminal(persisted),
      'no timer reached a terminal');
    harness.witness.commitRemoval();
    await harness.coordinator.reconcileOperationProgress(harness.operation);
    t.equal((await persistedOperation(harness)).workflowStep,
      WORKFLOW_STEP.REMOVED, 'the committed removal still completes it');
  } finally {
    await harness.coordinator.shutdown();
  }
});

test('W6 (P6): target death after the intent', async (t) => {
  await t.test('the source still a voter: FAILED, the source retained',
    async (t) => {
      const harness = await createHarness();
      try {
        await driveToRemovalIntent(harness);
        harness.coordinator.systemTableCache.upsert('services',
          targetRow(ReplicaStatus.FAILED));
        await harness.coordinator.reconcileOperationProgress(
          harness.operation);
        const persisted = await persistedOperation(harness);
        t.equal(persisted.workflowStep, WORKFLOW_STEP.FAILED,
          'the premise changed: the REPLACE fails');
        t.match(String(persisted.errorMessage || ''),
          POST_INTENT_TARGET_DEATH, 'the one admitted post-intent failure');
        t.equal(harness.witness.retirements.length, 0,
          'the source is not taken out of the configuration');
      } finally {
        await harness.coordinator.shutdown();
      }
    });
  await t.test('the witness unreadable: the REPLACE waits', async (t) => {
    const harness = await createHarness();
    try {
      await driveToRemovalIntent(harness);
      harness.coordinator.systemTableCache.upsert('services',
        targetRow(ReplicaStatus.FAILED));
      harness.witness.available = false;
      await harness.coordinator.reconcileOperationProgress(harness.operation);
      harness.clock.offsetMs = LONG_AFTER_MS;
      await harness.owner.checkTimeouts();
      const persisted = await persistedOperation(harness);
      t.equal(persisted.workflowStep, WORKFLOW_STEP.STOPPING,
        'nothing is concluded from an unreadable configuration');
    } finally {
      await harness.coordinator.shutdown();
    }
  });
  await t.test('the source already absent: completed, no rollback',
    async (t) => {
      const harness = await createHarness();
      try {
        await driveToRemovalIntent(harness);
        harness.witness.commitRemoval();
        harness.coordinator.systemTableCache.upsert('services',
          targetRow(ReplicaStatus.FAILED));
        await harness.coordinator.reconcileOperationProgress(
          harness.operation);
        t.equal((await persistedOperation(harness)).workflowStep,
          WORKFLOW_STEP.REMOVED, 'the committed removal stands');
      } finally {
        await harness.coordinator.shutdown();
      }
    });
});

const MAX_WAKE_TURNS = 200;

async function settleTurns(until) {
  for (let turn = 0; turn < MAX_WAKE_TURNS && !await until(); turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return until();
}

test('W7: a committed membership change relayed by the node wakes the ' +
  'waiting owner, which completes with no timer firing', async (t) => {
  const listeners = new Set();
  const relay = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const harness = await createHarness();
  try {
    harness.coordinator.attachReplicaConsensusEvents(relay);
    t.equal(listeners.size, 1, 'the owner holds one relay subscription');
    await driveToRemovalIntent(harness);
    t.equal((await persistedOperation(harness)).workflowStep,
      WORKFLOW_STEP.STOPPING, 'the owner waits on the source removal');
    harness.witness.commitRemoval();
    // Control: the commit alone, unannounced, moves nothing (no polling).
    t.notOk(await settleTurns(async () =>
      (await persistedOperation(harness)).workflowStep ===
        WORKFLOW_STEP.REMOVED), 'no wake, no completion');
    for (const listener of [...listeners]) {
      listener({
        partitionId: PARTITION_ID,
        replicaId: TARGET_REPLICA_ID,
        confState: {voters: ['2', '3'], votersOutgoing: []},
        commitIndex: harness.witness.commitIndex,
      });
    }
    const completed = await settleTurns(async () =>
      (await persistedOperation(harness)).workflowStep ===
        WORKFLOW_STEP.REMOVED);
    t.ok(completed, 'the relayed change completed the REPLACE');
  } finally {
    await harness.coordinator.shutdown();
  }
});

// A durable write of replica_operations that honours an expected-step CAS
// (WHERE workflow_step = ?), as the production store does, on both write
// routes (the gateway mutation and its SQL fallback).
function enforceDurableStepCas(harness) {
  const repository = harness.coordinator.repository;
  const casHolds = (operationId, expectedStep) => {
    const row = repository.getReplicaOperationRowFromCache?.(operationId);
    return !row || row.workflow_step === expectedStep;
  };
  const gateway = harness.coordinator.controlPlaneSystemTableGateway;
  const baseSubmit = gateway.submitMutation.bind(gateway);
  gateway.submitMutation = async (mutation, options) => {
    const expectedStep = mutation?.whereClause?.workflow_step;
    const operationId = mutation?.whereClause?.operation_id;
    if (typeof expectedStep === 'string' && operationId &&
        !casHolds(operationId, expectedStep)) {
      return {success: true, partitionResult: {affectedRows: 0}};
    }
    return baseSubmit(mutation, options);
  };
  const engine = harness.coordinator.sqlQueryEngine;
  const baseExecute = engine.executeQuery.bind(engine);
  engine.executeQuery = async (sql, params, options) => {
    if (typeof sql === 'string' && sql.includes('UPDATE replica_operations') &&
        sql.includes('AND workflow_step = ?') &&
        !casHolds(params.at(-2), params.at(-1))) {
      return {success: true, affectedRows: 0, changes: 0};
    }
    return baseExecute(sql, params, options);
  };
}

function staleActiveCopy(operation) {
  return {
    ...operation,
    workflowStep: WORKFLOW_STEP.ACTIVE,
    status: ReplicaStatus.ACTIVE,
    stepsHistory: operation.stepsHistory.filter((entry) =>
      entry?.step !== WORKFLOW_STEP.STOPPING),
  };
}

test('W8 (D2 boundary is durable): a stale in-memory copy cannot FAIL a ' +
  'REPLACE past its durable removal intent', async (t) => {
  const harness = await createHarness();
  try {
    await driveToRemovalIntent(harness);
    enforceDurableStepCas(harness);
    t.equal((await persistedOperation(harness)).workflowStep,
      WORKFLOW_STEP.STOPPING, 'the intent is durable');
    // A caller still holding the pre-intent (ACTIVE) copy.
    await harness.owner.failOperation(
      staleActiveCopy(harness.operation), 'Timeout in ACTIVE step');
    t.equal((await persistedOperation(harness)).workflowStep,
      WORKFLOW_STEP.STOPPING,
      'the refusal reads the durable step, not the caller\'s copy');
    // The copy's durable read also lags (it read ACTIVE before the intent
    // landed): the terminal write itself is a CAS on that step.
    const repository = harness.coordinator.repository;
    const baseRead = repository.queryReplicaOperationPersistenceAuthorityOperation
      .bind(repository);
    repository.queryReplicaOperationPersistenceAuthorityOperation =
      async (operation, options) => {
        const read = await baseRead(operation, options);
        return read ? staleActiveCopy(read) : read;
      };
    await harness.owner.failOperation(
      staleActiveCopy(harness.operation), 'Timeout in ACTIVE step');
    repository.queryReplicaOperationPersistenceAuthorityOperation = baseRead;
    t.equal((await persistedOperation(harness)).workflowStep,
      WORKFLOW_STEP.STOPPING,
      'the FAILED write is a CAS on the step it was admitted against');
    harness.witness.commitRemoval();
    await harness.coordinator.reconcileOperationProgress(
      await persistedOperation(harness));
    t.equal((await persistedOperation(harness)).workflowStep,
      WORKFLOW_STEP.REMOVED, 'the owner still completes it');
  } finally {
    await harness.coordinator.shutdown();
  }
});

async function fireHeldTimers(harness) {
  for (const handle of harness.heldTimers.splice(0)) {
    await handle.fn();
  }
}

test('W9 (R11/A11.1): the terminal-transition repair is not a second route ' +
  'to a REPLACE terminal', async (t) => {
  await t.test('a retained REMOVED is re-decided by R-1a before it is ' +
    're-asserted', async (t) => {
    const harness = await createHarness();
    try {
      await driveToRemovalIntent(harness);
      const persisted = await persistedOperation(harness);
      // A REMOVED projection held for repair while the source is still a
      // committed voter on the witness.
      armTerminalTransitionRepair(harness.owner, {
        ...persisted,
        workflowStep: WORKFLOW_STEP.REMOVED,
        status: ReplicaStatus.REMOVED,
        completedAt: Date.now(),
      }, TERMINAL_TRANSITION_REPAIR_CAUSE.PERSIST_NOT_COMMITTED);
      await fireHeldTimers(harness);
      t.equal((await persistedOperation(harness)).workflowStep,
        WORKFLOW_STEP.STOPPING, 'the repair writes no REMOVED while the ' +
          'source is a voter');
      t.notOk(harness.owner.terminalTransitionRepairStateByOperationId.has(
        harness.operation.operationId), 'the repair stood down');
    } finally {
      await harness.coordinator.shutdown();
    }
  });
  await t.test('a refused FAILED is not re-asserted past the durable intent',
    async (t) => {
      const harness = await createHarness();
      try {
        await driveToRemovalIntent(harness);
        enforceDurableStepCas(harness);
        const repository = harness.coordinator.repository;
        const baseRead = repository
          .queryReplicaOperationPersistenceAuthorityOperation.bind(repository);
        repository.queryReplicaOperationPersistenceAuthorityOperation =
          async (operation, options) => {
            const read = await baseRead(operation, options);
            return read ? staleActiveCopy(read) : read;
          };
        await harness.owner.failOperation(
          staleActiveCopy(harness.operation), 'Timeout in ACTIVE step');
        repository.queryReplicaOperationPersistenceAuthorityOperation = baseRead;
        await fireHeldTimers(harness);
        await fireHeldTimers(harness);
        t.equal((await persistedOperation(harness)).workflowStep,
          WORKFLOW_STEP.STOPPING, 'no repair write crossed the intent');
      } finally {
        await harness.coordinator.shutdown();
      }
    });
});

test('W10 (C0): the removal intent\'s witness commit index is recorded at ' +
  'the first intent write and preserved; never re-derived as 0',
async (t) => {
  const harness = await createHarness();
  try {
    await driveToRemovalIntent(harness);
    const recorded = await persistedOperation(harness);
    // Another writer's STOPPING (no intent metadata) is what the durable
    // row holds when this owner's own intent write lands idempotently.
    const bareStopping = {
      ...recorded,
      stepsHistory: recorded.stepsHistory.map((entry) =>
        entry?.step === WORKFLOW_STEP.STOPPING ?
          {step: entry.step, timestamp: entry.timestamp} : entry),
    };
    await harness.coordinator.repository.persistOperationUpdate(bareStopping);
    enforceDurableStepCas(harness);
    const stale = staleActiveCopy(recorded);
    t.ok(await harness.owner.persistReplaceRemovalIntent(stale, {
      replaceRemovalIntent: true,
      replaceWitnessReplicaId: TARGET_REPLICA_ID,
      replaceWitnessNodeId: TARGET_NODE_ID,
      replaceWitnessCommitIndex: INTENT_COMMIT_INDEX,
      replaceSourceUnreachable: false,
    }), 'the intent is durable (idempotently)');
    const durable = await persistedOperation(harness);
    const intent = parseStepsFromOperation(durable).find((entry) =>
      entry?.replaceRemovalIntent === true);
    t.equal(intent?.replaceWitnessCommitIndex, INTENT_COMMIT_INDEX,
      'the idempotent intent write still records C0 durably');
    // A second intent write never replaces the first C0.
    await harness.owner.persistReplaceRemovalIntent(staleActiveCopy(durable), {
      replaceRemovalIntent: true,
      replaceWitnessCommitIndex: INTENT_COMMIT_INDEX + 5,
    });
    const again = parseStepsFromOperation(await persistedOperation(harness))
      .filter((entry) => entry?.replaceRemovalIntent === true);
    t.same(again.map((entry) => entry.replaceWitnessCommitIndex),
      [INTENT_COMMIT_INDEX], 'the first C0 is preserved');
    // AN11 on the preserved C0: a lagging absence completes nothing.
    harness.witness.sourceVoter = false;
    harness.witness.commitIndex = INTENT_COMMIT_INDEX - 1;
    await harness.coordinator.reconcileOperationProgress(
      await persistedOperation(harness));
    t.equal((await persistedOperation(harness)).workflowStep,
      WORKFLOW_STEP.STOPPING, 'an absence below C0 is not a retirement');
  } finally {
    await harness.coordinator.shutdown();
  }
});

function parseStepsFromOperation(operation) {
  return Array.isArray(operation?.stepsHistory) ? operation.stepsHistory : [];
}
