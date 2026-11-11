import {test} from '../../src/test-helpers/tap.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {readReplaceOwnerDiagnostic} from '../../src/rebalancer/operation-workflow-replace-owner.js';
import {ORDINARY_PARTITION_ID, disposeWorld, driveToIntent,
  openReplaceWorld, readPersisted, setTargetRow, settleTurns} from './replace-real-group-harness.js';
test('dbg', async (t) => {
  const world = await openReplaceWorld({sourceHandler: true, replicaCount: 2,
    partitionId: ORDINARY_PARTITION_ID});
  try {
    await driveToIntent(world);
    const g = world.group;
    setTargetRow(world, ReplicaStatus.FAILED);
    const deliver = world.coordinator.messageRouter.deliver;
    let injected = false;
    world.coordinator.messageRouter.deliver = async (target, payload, options) => {
      if (payload?.type === 'RETIRE_REPLICA_PEER') { return buildDeliveryEnvelope({acknowledged: true}, {status: 'error', error: 'x'}); }
      if (!injected && payload?.type === 'CANCEL_REPLICA_REMOVAL') {
        injected = true;
        const a = g.rowDrivenRemoval(world.sourceReplicaId);
        console.log('rowDriven', JSON.stringify(a));
        console.log('settled', g.settle(() => !g.sourceCommittedVoter(world.sourceReplicaId), 400));
        await settleTurns();
      }
      const r = await deliver(target, payload, options);
      if (payload?.type === 'CANCEL_REPLICA_REMOVAL') console.log('cancel answer', JSON.stringify(r));
      return r;
    };
    for (let r = 0; r < 6; r += 1) {
      const p = await readPersisted(world);
      console.log('round', r, p.workflowStep, p.errorMessage, readReplaceOwnerDiagnostic(world.coordinator.workflowOwner, p.operationId)?.reason, 'srcvoter', g.sourceCommittedVoter(world.sourceReplicaId));
      if (r > 4) break;
      await world.coordinator.reconcileOperationProgress(p);
      await settleTurns();
      g.advance(20);
    }
  } finally { await disposeWorld(world); }
  t.pass();
});
