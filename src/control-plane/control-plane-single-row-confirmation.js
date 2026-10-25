// Publication gate for owner operations that require one visible applied row.
// The mutation classifier owns effect meaning; the semantic owner supplies
// its zero/unknown refusal vocabulary. The original gateway receipt remains
// the error cause, including its write identity and any uncertain outcome.
import {classifyControlPlaneMutationResult} from './control-plane-mutation-outcome-classifier.js';
import {buildSystemMetadataMutationError} from './owners/system-metadata-owner-base.js';

function confirmationError(reason, effect, result, deferRetry) {
  return Object.assign(new Error(reason.message, {cause: result}), {
    code: reason.code, outcome: effect.outcome, deferRetry,
  });
}

function requireConfirmedSingleRowMutation(result, contract) {
  const effect = classifyControlPlaneMutationResult(result);
  if (effect.applied && !effect.deferred && !effect.visibilityPending &&
      effect.affectedRowsPresent && effect.affectedRows === 1) return;
  if (effect.failed || effect.terminal) {
    const error = buildSystemMetadataMutationError(result, contract);
    // Retain the whole original receipt, whose own cause remains intact.
    // This preserves outer write identity as well as any lower-level cause.
    error.cause = result;
    throw error;
  }
  if (effect.zeroAffectedRows && effect.accepted && !effect.deferred) {
    throw confirmationError(contract.changed, effect, result, false);
  }
  throw confirmationError(contract.unconfirmed, effect, result, true);
}

export {requireConfirmedSingleRowMutation};
