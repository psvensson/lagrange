/**
 * F3 with P1' (fix-f1): the remove-safety evaluator runs at every post-intent
 * send of a REPLACE's removal effect (the T5' re-send, the post-WAIT
 * redrive), and a safety answer there never writes FAILED - past the durable
 * removal intent only D2 fails a REPLACE. A FAIL-class answer (the safety
 * rows unavailable) withholds the re-send and is an observable safety wait.
 * (Terminal admission refuses the post-intent FAILED write regardless; red
 * without the guard is the missing typed wait, assertion 5.)
 */
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  readReplaceOwnerDiagnostic,
} from '../../src/rebalancer/operation-workflow-replace-owner.js';
import {
  REBALANCE_COORDINATOR_DEFER_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  disposeWorld,
  driveToIntent,
  openReplaceWorld,
  readPersisted,
  settleTurns,
} from './replace-real-group-harness.js';

// Past the T5' backstop window the effect is due for a re-send.
const RESEND_DUE_ADVANCE_MS = 61_000;

test('a FAIL-class remove-safety answer at a post-intent re-send withholds ' +
  'the effect and waits; it never writes FAILED', async (t) => {
  const world = await openReplaceWorld();
  try {
    world.removeEffectAnswer = {acknowledged: true,
      status: ReplicaOperationResponseStatus.INITIATED};
    await driveToIntent(world);
    world.eventsSuppressed = true;
    t.equal(world.removeEffects.length, 1, 'setup: the first effect left');
    const owner = world.coordinator.workflowOwner;
    owner.getCriticalReplicaRowsForSafety = async () => [];
    world.clockOffsetMs += RESEND_DUE_ADVANCE_MS;
    await world.coordinator.reconcileOperationProgress(
      await readPersisted(world));
    await settleTurns();
    t.equal(world.removeEffects.length, 1, 'no re-send without a safe answer');
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'the REPLACE waits at STOPPING, never FAILED');
    t.equal(world.terminalWrites.length, 0, 'no terminal write');
    t.equal(
      readReplaceOwnerDiagnostic(owner, world.operation.operationId)?.reason,
      REBALANCE_COORDINATOR_DEFER_REASON.REPLACE_REMOVE_SAFETY_BLOCKED,
      'the owner waits on the safety answer (a deferred retry is armed)');
    t.ok(owner.safetyDeferredRetryTimerByOperationId.has(
      world.operation.operationId), 'the deferred safety retry is armed');
  } finally {
    await disposeWorld(world);
  }
});
