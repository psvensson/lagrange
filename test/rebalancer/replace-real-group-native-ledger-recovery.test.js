// S11 downstream discriminator: real rs-raft user group and file-backed
// PartitionService ledger apply. Ledger consensus/CDC transport is controlled;
// membership, handoff and REMOVE remain the existing real-group owners.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION as DISPOSITION} from
  '../../src/rebalancer/replica-operation-update-disposition.js';
import {clearFixtureSingletons, resetFixtureSingletons} from
  '../test-helpers/participant-transaction-fixture.js';
import {withNativeLedgerReplace, HISTORICAL_ID} from './replace-real-group-native-ledger-fixture.js';
import {readPersisted, settleTurns} from './replace-real-group-harness.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

async function driveSafeEdge(world) {
  world.eventsSuppressed = true;
  for (let turn = 0; turn < 8 && world.removeEffects.length === 0; turn += 1) {
    await world.coordinator.executeOperation(await readPersisted(world));
    await settleTurns();
    world.group.settle(() => world.group.leader() === world.targetReplicaId);
    await settleTurns();
  }
}

for (const injection of ['none', 'owned-repair', 'raw-bypass-negative']) {
  test(`S11 real ledger after SAFE: ${injection}`, () => withNativeLedgerReplace(
    async ({world, ledger, holder, retained}) => {
      const owner = world.coordinator.workflowOwner;
      const evaluate = owner.evaluateRemoveSafety.bind(owner);
      let safeEdges = 0;
      let repairResult = null;
      let visibleAfterEdge = false;
      owner.evaluateRemoveSafety = async (operation) => {
        const evaluation = await evaluate(operation);
        if (evaluation.error || safeEdges > 0) return evaluation;
        safeEdges += 1;
        if (injection === 'owned-repair') {
          repairResult = await holder.repository.persistOperationUpdate(retained,
            {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
        } else if (injection === 'raw-bypass-negative') {
          // Deliberate invalid producer: the old raw repair shape, committed
          // through actual apply. This mutation must falsify dispatch safety;
          // it is never a production compatibility path or an approved repair.
          const inserted = await ledger.gateway.submitMutation({tableName: 'replica_operations',
            operation: 'insert', row: holder.repository.buildReplicaOperationRow(retained)});
          assert.equal(inserted.partitionResult.affectedRows, 1);
        }
        visibleAfterEdge = Boolean(ledger.leader.db.prepare(
          'SELECT operation_id FROM replica_operations WHERE operation_id = ?').get(HISTORICAL_ID));
        assert.equal(world.cache.get('replica_operations', HISTORICAL_ID), undefined,
          'the historical row has not reached the incumbent through CDC');
        return evaluation;
      };
      await driveSafeEdge(world);
      assert.equal(safeEdges, 1, 'the real incumbent reached the actual SAFE boundary');
      if (injection === 'owned-repair') {
        // Collect the physical observation before asserting the discriminator:
        // on the predecessor the forbidden state is visible + REMOVE sent.
        assert.deepEqual({disposition: repairResult?.disposition,
          historicalRowVisible: visibleAfterEdge, removeEffects: world.removeEffects.length},
        {disposition: DISPOSITION.REFUSED, historicalRowVisible: false, removeEffects: 1});
        assert.equal(ledger.coordinator.repository.retainedPlacementRepairs.size, 1,
          'the actual ledger owner retains original identity while the incumbent owns its live lane');
      } else if (injection === 'raw-bypass-negative') {
        assert.equal(visibleAfterEdge, true, 'the invalid historical holder really committed');
        assert.equal(world.removeEffects.length, 0,
          'the composed prospective guard must reject this known-bad authoritative row');
      } else {
        assert.equal(visibleAfterEdge, false);
        assert.equal(world.removeEffects.length, 1,
          'a competent incumbent is not held merely because a historical projection exists');
      }
      assert.equal(world.targetReplicaId,
        (await readPersisted(world)).replicaId, 'the operation kept the real admitted target');
    }));
}
