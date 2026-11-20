import {captureReplaceOwnerLevel, resolveReplaceOwnerEntryLevel} from
  './operation-workflow-replace-owner-wake.js';
import {
  REPLACE_EFFECT_ADMISSION, REPLACE_WAIT_REASON, admitReplaceSourceRemovalEffect,
  isPartitionReplace, recordReplaceSourceRemovalEffect,
} from './operation-workflow-replace-owner.js';
import {REBALANCER_SKIP_REASON} from './rebalancer-constants.js';

// The removal-effect boundary after SAFE for a partition REPLACE or initial
// REMOVE: null when the effect is sent now; otherwise the owner's result.
async function holdReplaceSourceRemovalEffect(
  owner, operation, replaceRemoveDispatchPhase, entryLevel) {
  if (!replaceRemoveDispatchPhase || !isPartitionReplace(operation)) {
    const resolvedEntry = resolveReplaceOwnerEntryLevel(owner, entryLevel);
    if (
      owner.isRemoveInitialDispatchPhase(operation) &&
      resolvedEntry &&
      captureReplaceOwnerLevel(owner, operation)?.levelKey !==
        resolvedEntry.levelKey
    ) {
      owner.armReplaceOwnerWait(
        operation,
        REPLACE_WAIT_REASON.EFFECT_REVALIDATION_MOVED,
        resolvedEntry,
      );
      return owner.buildSkippedOperationResult(
        REBALANCER_SKIP_REASON.SAFETY_BLOCKED,
        operation.operationId,
        {deferReason: REPLACE_WAIT_REASON.EFFECT_REVALIDATION_MOVED},
      );
    }
    return null;
  }
  const effect = await admitReplaceSourceRemovalEffect(
    owner, operation, entryLevel);
  if (effect.admission === REPLACE_EFFECT_ADMISSION.SEND) {
    return null;
  }
  return effect.admission === REPLACE_EFFECT_ADMISSION.STOPPING_OWNER ?
    owner.runReplaceStoppingOwner(operation) :
    owner.waitReplaceSourceRemovalEffect(operation, effect, entryLevel);
}

function noteReplaceSourceRemovalEffect(
  owner, operation, response, replaceRemoveDispatchPhase) {
  if (replaceRemoveDispatchPhase && isPartitionReplace(operation)) {
    recordReplaceSourceRemovalEffect(owner, operation, response);
  }
}

export {holdReplaceSourceRemovalEffect, noteReplaceSourceRemovalEffect};
