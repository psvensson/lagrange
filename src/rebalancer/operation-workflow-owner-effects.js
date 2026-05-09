/**
 * Effect command shape for operation workflow owner outcomes.
 *
 * This module declares commands only. Runtime execution remains in later
 * adapter cutover packages.
 */

import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_IDENTIFIER_VARIANTS,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_REVISION_VARIANTS,
} from './operation-workflow-owner-constants.js';

const OPERATION_WORKFLOW_EFFECT_COMMANDS =
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES;

function buildOperationWorkflowEffectCommand(outcome) {
  return Object.freeze({
    owner: outcome?.owner || OPERATION_WORKFLOW_OWNER,
    boundary:
      outcome?.boundary || OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    effectCommand:
      outcome?.effectCommand ||
        OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
    correlationKey:
      outcome?.correlationKey ||
        OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.CORRELATION_KEY_UNAVAILABLE,
    sourceRevision:
      outcome?.sourceRevision ||
        OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
  });
}

export {
  OPERATION_WORKFLOW_EFFECT_COMMANDS,
  buildOperationWorkflowEffectCommand,
};
