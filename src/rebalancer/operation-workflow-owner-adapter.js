import {
  OPERATION_WORKFLOW_EFFECT_COMMANDS,
  buildOperationWorkflowEffectCommand,
} from './operation-workflow-owner-effects.js';
import {
  advanceOperationLifecycle,
  resolveOperationLifecycleEvent,
} from './operation-lifecycle.js';
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
const OPERATION_WORKFLOW_ADAPTER_FIRST_COMMAND_INDEX = 0;
const OPERATION_WORKFLOW_ADAPTER_LAST_ENTRY_OFFSET = 1;
const OPERATION_WORKFLOW_ADAPTER_EMPTY_SIDE_EFFECT_COUNT = 0;
const OPERATION_WORKFLOW_ADAPTER_NO_OPERATION = Object.freeze({
  operationId: OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
});
const OPERATION_WORKFLOW_ADAPTER_COMMAND_RESULT_STATE = Object.freeze({
  APPLIED: 'applied',
  PERSISTED: 'persisted',
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

function buildOperationWorkflowAdapterPersistedEvidence({
  persisted,
  progress,
}) {
  return Object.freeze({
    [OPERATION_WORKFLOW_RECORD_FIELDS.OPERATION_KEY]:
      normalizeOperationWorkflowAdapterText(
        progress?.operationId,
        OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
      ),
    [OPERATION_WORKFLOW_RECORD_FIELDS.COMMAND_STATE]:
      persisted?.applied === true ?
        OPERATION_WORKFLOW_ADAPTER_COMMAND_RESULT_STATE.PERSISTED :
        OPERATION_WORKFLOW_ADAPTER_COMMAND_RESULT_STATE.SKIPPED,
    effectCommand: OPERATION_WORKFLOW_ADAPTER_COMMAND_RESULT_STATE.PERSISTED,
  });
}

function buildOperationWorkflowAdapterResult({
  outcome,
  commands,
  applied,
  persisted,
  appendedEvents,
  commandResultEvidence,
}) {
  return Object.freeze({
    outcome,
    command: commands[OPERATION_WORKFLOW_ADAPTER_FIRST_COMMAND_INDEX] ||
      buildOperationWorkflowEffectCommand(OPERATION_WORKFLOW_ADAPTER_DEFAULT_CONTEXT),
    commands: Object.freeze([...commands]),
    applied,
    persisted,
    appendedEvents: Object.freeze([...appendedEvents]),
    commandResultEvidence:
      commandResultEvidence[
        commandResultEvidence.length -
          OPERATION_WORKFLOW_ADAPTER_LAST_ENTRY_OFFSET
      ],
    commandResultEvidenceRecords: Object.freeze([...commandResultEvidence]),
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
      OPERATION_WORKFLOW_EFFECT_COMMANDS
        .RETAIN_PUBLICATION_FOR_RETRY_COMMAND,
      (operation, context) => ports.retainPublicationForRetry(
        operation,
        context,
      ),
    ],
    [
      OPERATION_WORKFLOW_EFFECT_COMMANDS.MARK_ACTIVE_GATE_VISIBLE_COMMAND,
      (operation, context) => ports.markActiveGateVisible(operation, context),
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

async function executeOperationWorkflowCommands({
  commandExecutors,
  commands,
  operation,
  context,
}) {
  const commandResults = [];
  for (const command of commands) {
    const executor = commandExecutors.get(command.effectCommand);
    const applied = await executor(operation, {
      ...context,
      effectCommand: command.effectCommand,
      operationProgress: context.operationProgress,
    });
    commandResults.push(buildOperationWorkflowAdapterCommandResultEvidence({
      applied,
      command,
      operation,
    }));
  }
  return Object.freeze(commandResults);
}

function buildOperationWorkflowAdapterCommands(outcome) {
  const sideEffects = Array.isArray(outcome.sideEffects) ?
    outcome.sideEffects :
    [];
  if (sideEffects.length === OPERATION_WORKFLOW_ADAPTER_EMPTY_SIDE_EFFECT_COUNT) {
    return Object.freeze([
      buildOperationWorkflowEffectCommand({
        ...outcome,
        effectCommand: OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
      }),
    ]);
  }
  return Object.freeze(sideEffects.map((effectCommand) =>
    buildOperationWorkflowEffectCommand({
      ...outcome,
      effectCommand,
    }),
  ));
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
      const currentProgress = await ports.loadOperationProgress(
        operation,
        {
          ...context,
          evidence,
        },
      );
      const ingressEvent = resolveOperationLifecycleEvent(
        context.event || evidence,
      );
      const lifecycleResult = advanceOperationLifecycle(
        currentProgress,
        ingressEvent,
      );
      const outcome = decideOperationWorkflowProgress(
        evidence,
        currentProgress,
      );
      const persisted = await ports.persistOperationProgress({
        expectedVersion: currentProgress.version,
        progress: lifecycleResult.operationProgress,
      });
      const appendedEvents = [];
      for (const event of lifecycleResult.emittedEvents) {
        appendedEvents.push(await ports.appendOperationProgressEvent(event));
      }
      const commands = buildOperationWorkflowAdapterCommands({
        ...outcome,
        sideEffects: lifecycleResult.sideEffects,
        operationProgress: lifecycleResult.operationProgress,
      });
      const commandResultEvidence = await executeOperationWorkflowCommands({
        commandExecutors,
        commands,
        operation,
        context: {
          ...context,
          operationProgress: persisted.progress,
        },
      });
      return buildOperationWorkflowAdapterResult({
        outcome: Object.freeze({
          ...outcome,
          operationProgress: persisted.progress,
          persistedProgress: persisted.progress,
        }),
        commands,
        applied: commandResultEvidence.some((entry) =>
          entry.commandState ===
            OPERATION_WORKFLOW_ADAPTER_COMMAND_RESULT_STATE.APPLIED),
        persisted,
        appendedEvents,
        commandResultEvidence: Object.freeze([
          buildOperationWorkflowAdapterPersistedEvidence({
            persisted,
            progress: persisted.progress,
          }),
          ...commandResultEvidence,
        ]),
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
