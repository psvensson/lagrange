import {deliverCreateWithReceipt} from './operation-workflow-create-ack-state.js';
import {captureReplaceOwnerLevel, resolveReplaceOwnerEntryLevel} from
  './operation-workflow-replace-owner-wake.js';
import {
  REPLACE_EFFECT_ADMISSION, REPLACE_WAIT_REASON, admitReplaceSourceRemovalEffect,
  isPartitionReplace,
} from './operation-workflow-replace-owner.js';
import {captureReplaceRemovalEffectTurn, claimReplaceRemovalEffect, finishReplaceRemovalEffect} from
  './operation-workflow-replace-owner-state.js';
import {deliveryAnswerOf, deliveryTransportOf, isDeliveredTransportDeliveryOutcome} from
  '../transport/transport-semantic-outcome.js';
import {REBALANCER_SKIP_REASON} from './rebalancer-constants.js';
import {isRemoveDispatchReceipt, ReplicaOperationField, ReplicaOperationResponseStatus} from
  './replica-operation-constants.js';

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

function prepareReplaceRemovalEffectTurn(owner, operation, removePhase, options) {
  return removePhase && isPartitionReplace(operation) ?
    options?.replaceRemovalEffectTurn ?? captureReplaceRemovalEffectTurn(owner, operation) : null;
}

function isBoundSourceRemovalReceipt(reply, request, nodeId) {
  const operation = reply[ReplicaOperationField.OPERATION_ID];
  const replica = reply[ReplicaOperationField.REPLICA_ID];
  if (reply.nodeId !== nodeId ||
      (operation !== undefined && operation !== request[ReplicaOperationField.OPERATION_ID]) ||
      (replica !== undefined && replica !== request[ReplicaOperationField.REPLICA_ID])) {
    return false;
  }
  // NOT_FOUND/COMPLETED can name the replica alone. An already tracked
  // removal can answer IN_PROGRESS with either of the two identities.
  switch (reply.status) {
  case ReplicaOperationResponseStatus.NOT_FOUND:
  case ReplicaOperationResponseStatus.COMPLETED:
    return replica !== undefined;
  case ReplicaOperationResponseStatus.IN_PROGRESS:
    return operation !== undefined || replica !== undefined;
  default:
    return operation !== undefined && replica !== undefined;
  }
}

function waitForSourceRemovalReceipt(owner, operation, entryLevel) {
  return {wait: owner.waitReplaceSourceRemovalEffect(operation,
    {reason: REPLACE_WAIT_REASON.SOURCE_REMOVAL_EFFECT_PENDING}, entryLevel)};
}

async function deliverAdmittedOperationEffect(
  owner, operation, target, request, dispatchNodeId, turn, entryLevel, routineCreateWake, onSend) {
  const claim = turn ? claimReplaceRemovalEffect(owner, operation, turn) : null;
  if (turn && !claim) return waitForSourceRemovalReceipt(owner, operation, entryLevel);

  const {operationId} = operation;
  let receipt = false;
  try {
    const delivery = await deliverCreateWithReceipt(
      owner, operation, dispatchNodeId, request, routineCreateWake, (createReceipt) => {
        onSend(createReceipt);
        return owner.deliverReplicaOperationRequest(operation, target, request, dispatchNodeId);
      });
    if (claim && isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery))) {
      const reply = deliveryAnswerOf(delivery);
      if (isRemoveDispatchReceipt(reply) && !(reply.success === false &&
          reply.reason === REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING)) {
        if (!isBoundSourceRemovalReceipt(reply, request, dispatchNodeId)) {
          return waitForSourceRemovalReceipt(owner, operation, entryLevel);
        }
        receipt = true;
      }
    }
    return {delivery};
  } finally {
    if (claim) finishReplaceRemovalEffect(owner, operationId, claim, receipt);
  }
}

export {
  deliverAdmittedOperationEffect, holdReplaceSourceRemovalEffect, prepareReplaceRemovalEffectTurn,
};
