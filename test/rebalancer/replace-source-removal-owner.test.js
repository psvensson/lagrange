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
    harness.operation.workflowStep = WORKFLOW_STEP.STOPPING;
    harness.operation.status = ReplicaStatus.ACTIVE;
    await harness.coordinator.reconcileOperationProgress(harness.operation);
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
