import {captureReplaceOwnerLevel, resolveReplaceOwnerEntryLevel} from
  './operation-workflow-replace-owner-wake.js';
import {
  REPLACE_EFFECT_ADMISSION, REPLACE_WAIT_REASON, admitReplaceSourceRemovalEffect,
  isPartitionReplace,
} from './operation-workflow-replace-owner.js';
import {claimReplaceRemovalEffect, finishReplaceRemovalEffect} from
  './operation-workflow-replace-owner-state.js';
import {deliveryAnswerOf, deliveryTransportOf, isDeliveredTransportDeliveryOutcome} from
  '../transport/transport-semantic-outcome.js';
import {REBALANCER_SKIP_REASON} from './rebalancer-constants.js';
import {isRemoveDispatchReceipt} from './replica-operation-constants.js';

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

async function deliverAdmittedOperationEffect(
  owner, operation, target, request, dispatchNodeId, replaceRemovePhase,
  entryLevel, onSend) {
  const isReplaceRemoval = replaceRemovePhase && isPartitionReplace(operation);
  const claim = isReplaceRemoval ? claimReplaceRemovalEffect(owner, operation) : null;
  if (isReplaceRemoval && !claim) {
    return {wait: owner.waitReplaceSourceRemovalEffect(operation,
      {reason: REPLACE_WAIT_REASON.SOURCE_REMOVAL_EFFECT_PENDING}, entryLevel)};
  }

  const {operationId} = operation;
  let receipt = false;
  try {
    onSend();
    const delivery = await owner.deliverReplicaOperationRequest(
      operation, target, request, dispatchNodeId);
    if (claim && isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery))) {
      const reply = deliveryAnswerOf(delivery);
      receipt = isRemoveDispatchReceipt(reply) && !(reply.success === false &&
        reply.reason === REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING);
    }
    return {delivery};
  } finally {
    if (claim) finishReplaceRemovalEffect(owner, operationId, claim, receipt);
  }
}

export {deliverAdmittedOperationEffect, holdReplaceSourceRemovalEffect};
