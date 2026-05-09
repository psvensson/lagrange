import {
  OPERATION_WORKFLOW_EFFECT_COMMANDS,
  buildOperationWorkflowEffectCommand,
} from './operation-workflow-owner-effects.js';
import {
  OPERATION_WORKFLOW_EVIDENCE_FIELDS,
  OPERATION_WORKFLOW_IDENTIFIER_VARIANTS,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_RECORD_FIELDS,
  OPERATION_WORKFLOW_REVISION_VARIANTS,
} from './operation-workflow-owner-constants.js';
import {
  decideOperationWorkflowProgress,
} from './operation-workflow-owner-decision.js';

const OPERATION_WORKFLOW_ADAPTER_EMPTY_TEXT = '';
const OPERATION_WORKFLOW_ADAPTER_DEFAULT_CONTEXT = Object.freeze({});
const OPERATION_WORKFLOW_ADAPTER_NO_OPERATION = null;
const OPERATION_WORKFLOW_ADAPTER_COMMAND_RESULT_STATE = Object.freeze({
  APPLIED: 'applied',
  SKIPPED: 'skipped',
});

function normalizeOperationWorkflowAdapterText(value, fallback) {
  return typeof value === typeof OPERATION_WORKFLOW_ADAPTER_EMPTY_TEXT ?
    value.trim() || fallback :
    fallback;
}

function buildOperationWorkflowAdapterEvidence({
  operation,
  context,
  ports,
}) {
  const operationKey = normalizeOperationWorkflowAdapterText(
    operation?.operationId,
    OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
  );
  const sourceRevision =
    operation?.updatedAt ||
    operation?.createdAt ||
    OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE;
  return Object.freeze({
    [OPERATION_WORKFLOW_EVIDENCE_FIELDS.OWNER]: OPERATION_WORKFLOW_OWNER,
    [OPERATION_WORKFLOW_EVIDENCE_FIELDS.BOUNDARY]:
      OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    [OPERATION_WORKFLOW_EVIDENCE_FIELDS.OPERATION_KEY]: operationKey,
    [OPERATION_WORKFLOW_EVIDENCE_FIELDS.CORRELATION_KEY]: operationKey,
    [OPERATION_WORKFLOW_EVIDENCE_FIELDS.SOURCE_REVISION]: sourceRevision,
    [OPERATION_WORKFLOW_EVIDENCE_FIELDS.DURABLE_OPERATION]:
      ports.buildDurableOperationEvidence ?
        ports.buildDurableOperationEvidence(operation, context) :
        context.durableOperation,
    [OPERATION_WORKFLOW_EVIDENCE_FIELDS.WORKFLOW_HISTORY]:
      ports.readWorkflowHistory(operation, context),
    [OPERATION_WORKFLOW_EVIDENCE_FIELDS.OWNER_LEASE]:
      ports.readOwnerLease(operation, context),
    [OPERATION_WORKFLOW_EVIDENCE_FIELDS.SERIAL_DEPENDENCY]:
      context.serialDependency || ports.readSerialDependency(operation, context),
    [OPERATION_WORKFLOW_EVIDENCE_FIELDS.RETRY_BUDGET]:
      context.retryBudget || ports.readRetryBudget(operation, context),
    [OPERATION_WORKFLOW_EVIDENCE_FIELDS.TIMEOUT_BUDGET]:
      context.timeoutBudget || ports.readTimeoutBudget(context),
    [OPERATION_WORKFLOW_EVIDENCE_FIELDS.PUBLICATION_FENCE]:
      context.publicationFence || ports.readPublicationFence(operation, context),
    [OPERATION_WORKFLOW_EVIDENCE_FIELDS.DISPATCH_OBSERVATION]:
      context.dispatchObservation ||
        ports.readDispatchObservation(operation, context),
  });
}

function buildOperationWorkflowAdapterCommandResultEvidence({
  applied,
  command,
  operation,
}) {
  return Object.freeze({
    [OPERATION_WORKFLOW_RECORD_FIELDS.OPERATION_KEY]:
      normalizeOperationWorkflowAdapterText(
        operation?.operationId,
        OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
      ),
    [OPERATION_WORKFLOW_RECORD_FIELDS.COMMAND_STATE]: applied === true ?
      OPERATION_WORKFLOW_ADAPTER_COMMAND_RESULT_STATE.APPLIED :
      OPERATION_WORKFLOW_ADAPTER_COMMAND_RESULT_STATE.SKIPPED,
    effectCommand: command.effectCommand,
  });
}

function buildOperationWorkflowAdapterResult({
  outcome,
  command,
  applied,
  commandResultEvidence,
}) {
  return Object.freeze({
    outcome,
    command,
    applied,
    commandResultEvidence,
  });
}

function buildOperationWorkflowCommandExecutors(ports) {
  return Object.freeze(new Map([
    [
      OPERATION_WORKFLOW_EFFECT_COMMANDS.DISPATCH_LOCAL_OWNER_COMMAND,
      (operation, context) => ports.dispatchLocalOwner(operation, context),
    ],
    [
      OPERATION_WORKFLOW_EFFECT_COMMANDS.WAKE_REMOTE_OWNER_COMMAND,
      (operation, context) => ports.wakeRemoteOwner(operation, context),
    ],
    [
      OPERATION_WORKFLOW_EFFECT_COMMANDS
        .ADVANCE_EXISTING_OPERATION_COMMAND,
      (operation, context) => ports.advanceExistingOperation(
        operation,
        context,
      ),
    ],
    [
      OPERATION_WORKFLOW_EFFECT_COMMANDS
        .RECONCILE_STALE_PROGRESS_COMMAND,
      (operation, context) => ports.reconcileStaleProgress(
        operation,
        context,
      ),
    ],
    [
      OPERATION_WORKFLOW_EFFECT_COMMANDS.RECORD_TERMINAL_SUCCESS_COMMAND,
      (operation, context) => ports.recordTerminalSuccess(operation, context),
    ],
    [
      OPERATION_WORKFLOW_EFFECT_COMMANDS.RECORD_TERMINAL_FAILURE_COMMAND,
      (operation, context) => ports.recordTerminalFailure(operation, context),
    ],
    [
      OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
      (operation, context) => ports.waitForOwnerProgress(operation, context),
    ],
  ]));
}

function createOperationWorkflowOwnerAdapter({ports}) {
  const commandExecutors = buildOperationWorkflowCommandExecutors(ports);
  return Object.freeze({
    decide(
      operation,
      context = OPERATION_WORKFLOW_ADAPTER_DEFAULT_CONTEXT,
    ) {
      return decideOperationWorkflowOwnerAdapterOutcomeForOperation({
        operation,
        context,
        ports,
      });
    },
    async run(
      operationInput,
      context = OPERATION_WORKFLOW_ADAPTER_DEFAULT_CONTEXT,
    ) {
      const operation =
        await ports.readDurableOperation(operationInput, context) ||
        OPERATION_WORKFLOW_ADAPTER_NO_OPERATION;
      const evidence = context.evidence || buildOperationWorkflowAdapterEvidence({
        operation,
        context,
        ports,
      });
      const outcome = decideOperationWorkflowProgress(evidence);
      const command = buildOperationWorkflowEffectCommand(outcome);
      const executor = commandExecutors.get(command.effectCommand);
      const applied = await executor(operation, {
        ...context,
        effectCommand: command.effectCommand,
      });
      const commandResultEvidence =
        buildOperationWorkflowAdapterCommandResultEvidence({
          applied,
          command,
          operation,
        });
      return buildOperationWorkflowAdapterResult({
        outcome,
        command,
        applied,
        commandResultEvidence,
      });
    },
  });
}

function decideOperationWorkflowOwnerAdapterOutcomeForOperation({
  operation,
  context = OPERATION_WORKFLOW_ADAPTER_DEFAULT_CONTEXT,
  ports,
}) {
  const evidence = context.evidence || buildOperationWorkflowAdapterEvidence({
    operation,
    context,
    ports,
  });
  return decideOperationWorkflowProgress(evidence);
}

export {
  createOperationWorkflowOwnerAdapter,
  decideOperationWorkflowOwnerAdapterOutcomeForOperation,
};
