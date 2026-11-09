import {test} from '../../src/test-helpers/tap.js';
import {TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {createCommittedFloorHarness, floorNodeRow, FLOOR_NODE_IDS} from
  './committed-node-remove-safety-fixture.js';

const OWNER_TURN_OBSERVATION_BOUND = 50;

async function settleOwnerTurns() {
  for (let turn = 0; turn < OWNER_TURN_OBSERVATION_BOUND; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

for (const disableCommittedTrigger of [false, true]) {
  test(`finite committed-read failure recovers the retained operation (trigger disabled=${disableCommittedTrigger})`,
    async (t) => {
      // Planning is an independent legitimate wake source. Hold its delivery
      // in both arms to discriminate the committed subscription, then release
      // it below. No timer fires during the declared observation bound.
      const h = await createCommittedFloorHarness({fail: true, disableCommittedTrigger,
        holdPlanningNotifications: true});
      t.teardown(() => h.shutdown());
      const first = await h.coordinator.executeOperation(h.operation);
      t.equal(first.skipped, true, 'authority failure retains the REMOVE');
      await settleOwnerTurns();
      t.equal(h.state.effects.length, 0);
      t.equal(h.state.committedSubscriptions, 1, 'one subscription captured by production composition');
      t.equal(h.owner.safetyDeferredRetryTimerByOperationId.size, 1,
        'one retained retry timer owns the unavailable operation');
      const operationId = h.operation.operationId;
      h.state.fail = false;
      h.readiness.noteServeEligibilitySourceChange(TABLES.NODES, floorNodeRow(FLOOR_NODE_IDS[0]));
      await settleOwnerTurns();
      t.ok(h.state.heldPlanningDeliveries.length > 0, 'real planning publications are held at delivery');
      t.equal(h.state.timerFires, 0, 'the fallback clock stays frozen through the bounded observation');
      t.equal(h.state.effects.length, disableCommittedTrigger ? 0 : 1,
        'only the required committed trigger can drive this frozen-timer schedule');
      t.equal(h.operation.operationId, operationId, 'same retained operation identity');
      if (disableCommittedTrigger) {
        const row = await h.coordinator.queryOperationById(operationId);
        t.not(row.workflowStep, WORKFLOW_STEP.FAILED, 'the disabled-trigger negative stays retained');
      }
      h.releasePlanningNotifications();
      await settleOwnerTurns();
      t.equal(h.state.effects.length, 1,
        'releasing the independent planning stream also recovers through the same owner');
    });
}

test('authoritative-only peer changes wake the owner while unsafe; later safe evidence permits one effect',
  async (t) => {
    const h = await createCommittedFloorHarness({replace: true, participation: false,
      authoritativeOnlyNode: FLOOR_NODE_IDS[1]});
    t.teardown(() => h.shutdown());
    h.state.nodes[1] = {...floorNodeRow(FLOOR_NODE_IDS[1]), ready_lease_expires_at: undefined};
    let evaluations = 0;
    const evaluate = h.owner.evaluateRemoveSafety.bind(h.owner);
    h.owner.evaluateRemoveSafety = async (...args) => {
      evaluations++;
      return evaluate(...args);
    };
    t.equal(h.owner.getCachedCriticalReplicaRows(h.operation.partitionId)
      .some((row) => row.node_id === FLOOR_NODE_IDS[1]), false);
    await h.coordinator.executeOperation(h.operation);
    await settleOwnerTurns();
    const firstCount = evaluations;
    t.ok(firstCount > 0);
    h.state.nodes[1] = floorNodeRow(FLOOR_NODE_IDS[1], 999);
    h.readiness.noteServeEligibilitySourceChange(TABLES.NODES, h.state.nodes[1]);
    await settleOwnerTurns();
    t.ok(evaluations > firstCount, 'lease-only invalid-to-expired change actually re-evaluates');
    t.equal(h.state.effects.length, 0, 'a wake does not grant replacement participation');
    const unsafeCount = evaluations;
    h.readiness.noteServeEligibilitySourceChange(TABLES.NODES, h.state.nodes[1]);
    await settleOwnerTurns();
    t.equal(evaluations, unsafeCount, 'unchanged semantic notification does not spin');
    h.state.participation = true;
    h.state.nodes[1] = floorNodeRow(FLOOR_NODE_IDS[1]);
    h.readiness.noteServeEligibilitySourceChange(TABLES.NODES, h.state.nodes[1]);
    await settleOwnerTurns();
    t.equal(h.state.effects.length, 1, 'later safe evidence advances through the real effect boundary');
  });

test('committed node availability is revalidated after the last awaited intent before REMOVE',
  async (t) => {
    const h = await createCommittedFloorHarness({replace: true});
    t.teardown(() => h.shutdown());
    await h.readiness.readServeEligibility();
    const persist = h.owner.persistReplaceRemovalIntent.bind(h.owner);
    let changedAfterSafe = false;
    h.owner.persistReplaceRemovalIntent = async (...args) => {
      const result = await persist(...args);
      changedAfterSafe = true;
      h.state.nodes[1] = {...floorNodeRow(FLOOR_NODE_IDS[1]), ready_lease_expires_at: undefined};
      await h.readiness.readServeEligibility();
      return result;
    };
    await h.coordinator.executeOperation(h.operation);
    await settleOwnerTurns();
    t.equal(changedAfterSafe, true, 'SAFE reached the actual durable-intent await');
    t.equal(h.state.effects.length, 0, 'changed committed level withholds the effect');
    const row = await h.coordinator.queryOperationById(h.operation.operationId);
    t.equal(row.workflowStep, WORKFLOW_STEP.STOPPING, 'durable intent retains its owner');
    h.owner.persistReplaceRemovalIntent = persist;
    h.state.nodes[1] = floorNodeRow(FLOOR_NODE_IDS[1]);
    h.readiness.noteServeEligibilitySourceChange(TABLES.NODES, h.state.nodes[1]);
    await settleOwnerTurns();
    t.equal(h.state.effects.length, 1, 'recovery re-evaluates and permits one removal');
  });

test('remaining peer liveness degradation during evaluateRemoveSafety awaits after readCommittedNodeFloor is caught by pre-evaluation baseline',
  async (t) => {
    const h = await createCommittedFloorHarness({replace: true});
    t.teardown(() => h.shutdown());
    await h.readiness.readServeEligibility();
    const pingNode = h.owner.messageRouter.pingNode.bind(h.owner.messageRouter);
    let degradedMidEvaluation = false;
    h.owner.messageRouter.pingNode = async (...args) => {
      const ok = await pingNode(...args);
      if (!degradedMidEvaluation) {
        degradedMidEvaluation = true;
        // Remaining peer FLOOR_NODE_IDS[1] degrades during evaluateRemoveSafety
        // after readCommittedNodeFloor has already accepted the floor.
        h.state.nodes[1] = {...floorNodeRow(FLOOR_NODE_IDS[1]), ready_lease_expires_at: undefined};
        await h.readiness.readServeEligibility();
      }
      return ok;
    };
    await h.coordinator.executeOperation(h.operation);
    await settleOwnerTurns();
    t.equal(degradedMidEvaluation, true, 'peer liveness degraded during evaluateRemoveSafety after floor read');
    t.equal(h.state.effects.length, 0, 'pre-evaluation readinessEntryLevel catches mid-evaluation degradation and withholds REMOVE_REPLICA');
    const row = await h.coordinator.queryOperationById(h.operation.operationId);
    t.equal(row.workflowStep, WORKFLOW_STEP.ACTIVE, 'STOPPING intent is not persisted when inputs degraded during evaluation');
    h.owner.messageRouter.pingNode = pingNode;
    h.state.nodes[1] = floorNodeRow(FLOOR_NODE_IDS[1]);
    h.readiness.noteServeEligibilitySourceChange(TABLES.NODES, h.state.nodes[1]);
    await settleOwnerTurns();
    t.equal(h.state.effects.length, 1, 'subsequent recovery re-evaluates and permits one removal');
  });
