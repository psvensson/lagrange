import {
  QUERY_ERROR_MSG,
} from '../query/query-constants.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  PARTICIPANT_ACK_FIELD,
  PARTICIPANT_ACK_RESULT,
} from '../workflow/workflow-constants.js';
import {
  MANAGED_SPLIT_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  SPLIT_OWNER_MANAGED_PHASES,
} from './partition-constants.js';
import {
  SPLIT_ACK_CATCHUP_SATISFIED_STATUSES,
  SPLIT_ACK_FAILURE_STATUSES,
  SPLIT_ACK_STATUS,
} from './split-ack-constants.js';
import {
  assertSplitRegistrationOverlapGuardClear,
  assertSplitTransitionAdmissionClear,
} from './partition-transition-overlap-guard.js';

const LOCAL_STR_PARTITION_SPLIT_WORKFLOW = 'partition:split:workflow';
const LOCAL_STR_CONTROL_PLANE_WRITE = 'control-plane:write';
const LOCAL_STR_CONTROL_PLANE_BACKPRESSURE = 'control_plane_backpressure';
const LOCAL_STR_OBJECT = 'object';

const DEFAULT_RETRY_BASE_DELAY_MS = 5000;
const MANAGED_SPLIT_MUTATION_OPTIONS = Object.freeze({
  workClass: PRESSURE_WORK_CLASS.CRITICAL,
});

/**
 * Workflow states from which the durable cutover may still be applied —
 * and, conversely, in which a source failure ack aborts the split
 * fail-safe (post-cutover failures cannot un-promote the epoch).
 * @type {ReadonlySet<string>}
 */
const PRE_CUTOVER_SPLIT_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
  PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
  PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
  PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
]));

/**
 * Lane-key suffix for runStep calls made INSIDE a FIFO owner-lane slot
 * (mirrors MERGE_OWNER_STEP_LANE_SUFFIX: the canonical lane coalesces
 * concurrent callers on one key, so owner steps use a suffixed key that
 * by construction has at most one user at a time).
 * @type {string}
 */
const SPLIT_OWNER_STEP_LANE_SUFFIX = ':owner-step';

const LOCAL_STR_SPLIT_SOURCE_EXECUTION_FAILURE =
  'split_source_execution_failure';

/**
 * Outcome variants of one lane-serialized split abort step.
 * @enum {string}
 */
const SPLIT_ABORT_OUTCOME = Object.freeze({
  ABORTED: 'aborted',
  ALREADY_ABORTED: 'already_aborted',
  REFUSED_POST_CUTOVER: 'refused_post_cutover',
});

class ManagedSplitWorkflowExecutionGateMethods {
  /**
   * Resolve the source table's identity/info/transition triple for one
   * split execution, or throw the typed not-found outcome.
   * @param {Object} partitionInfo - Source partition row.
   * @return {Object} {tableName, tableId, tableInfo, existingTransition}.
   * @private
   */
  resolveSplitAdmissionTableContext(partitionInfo) {
    const tableName = partitionInfo.table_name || partitionInfo.tableName;
    const tableId = partitionInfo.table_id || partitionInfo.tableId;
    const tableInfo = this.getTableInfo(tableName || tableId);
    if (!tableInfo) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_TABLE_NOT_FOUND);
    }
    return {
      tableName,
      tableId,
      tableInfo,
      existingTransition: this.parsePartitionTransition(tableInfo),
    };
  }

  /**
   * Assert no non-retryable in-flight transition blocks this split
   * (F23 overlap-qualified refusal, owned by the overlap guard module).
   * @param {Object} partitionInfo - Source partition row.
   * @param {string} tableId - Source table id.
   * @param {Object|null} existingTransition - Parsed table transition.
   * @return {void}
   * @private
   */
  assertSplitTransitionAdmission(partitionInfo, tableId, existingTransition) {
    assertSplitTransitionAdmissionClear(this, {
      partitionInfo,
      tableId,
      existingTransition,
    });
  }

  /**
   * Durable overlap guard (F23): refuse before registration when the
   * source key range overlaps an already-persisted in-flight
   * transition's ranges — consulted through the durable tables
   * transition rows, surviving restarts and cross-node ownership.
   * @param {Object} options
   * @param {Object} options.partitionInfo - Source partition row.
   * @param {string} options.partitionId - Source partition id.
   * @param {string} options.tableId - Source table id.
   * @param {string} options.workflowId - Registering workflow id.
   * @return {void}
   * @private
   */
  assertSplitRegistrationOverlapClear(options) {
    assertSplitRegistrationOverlapGuardClear(this, options);
  }

  /**
   * Run one owner-scoped step strictly AFTER every previously enqueued
   * step for the same owner key (FIFO).
   *
   * This exists because the canonical lane's runExclusive() COALESCES
   * concurrent callers — a second caller receives the in-flight
   * execution's promise instead of being queued — so cross-
   * acknowledgement mutations (a cutover step racing a fail-safe
   * abort) would otherwise interleave or be silently swallowed. Every
   * owner-side durable phase mutation (phase advances, the cutover
   * step, the abort step) routes through this FIFO; the step runner's
   * lane remains the execution substrate inside each slot.
   *
   * @param {string} ownerKey - Split owner key.
   * @param {Function} stepFactory - Async step to run.
   * @return {Promise<*>} The step's own settlement.
   */
  runSerializedOwnerStep(ownerKey, stepFactory) {
    const previousTail =
      this.splitOwnerLaneTailByOwnerKey.get(ownerKey) || Promise.resolve();
    const execution = previousTail
      .catch(() => {})
      .then(() => stepFactory());
    const tail = execution
      .catch(() => {})
      .finally(() => {
        if (this.splitOwnerLaneTailByOwnerKey.get(ownerKey) === tail) {
          this.splitOwnerLaneTailByOwnerKey.delete(ownerKey);
        }
      });
    this.splitOwnerLaneTailByOwnerKey.set(ownerKey, tail);
    return execution;
  }

  /**
   * Resolve the shared pressure governor for this node.
   * @return {PressureGovernor}
   * @private
   */
  getPressureGovernor() {
    if (this.pressureGovernor) {
      this.pressureGovernor.configure?.({
        messageRouter: this.messageRouter,
      });
      return this.pressureGovernor;
    }
    this.pressureGovernor = PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    });
    return this.pressureGovernor;
  }

  /**
   * Evaluate node-local pressure for split execution.
   * @param {Object} [executionContext={}]
   * @return {Object}
   * @private
   */
  evaluatePressure(executionContext = {}) {
    return this.getPressureGovernor().evaluate({
      workClass: executionContext.workClass || PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: [
        LOCAL_STR_PARTITION_SPLIT_WORKFLOW,
        LOCAL_STR_CONTROL_PLANE_WRITE,
      ],
    });
  }

  /**
   * Build a typed split deferral without creating new durable control-plane
   * writes while the local node is already hot.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  buildPressureDeferredResult(options = {}) {
    const retryAfterMs = Number.isFinite(options?.pressureDecision?.retryAfterMs) ?
      options.pressureDecision.retryAfterMs :
      DEFAULT_RETRY_BASE_DELAY_MS;
    const nextAttemptAt = new Date(this.now() + retryAfterMs).toISOString();
    return {
      success: false,
      partitionId: options.partitionId,
      tableId: options.tableId || null,
      tableName: options.tableName || null,
      workflowId: options.workflowId || null,
      targetVersion: options.targetVersion || null,
      state: PARTITION_TRANSITION_STATE.DEFERRED,
      error: LOCAL_STR_CONTROL_PLANE_BACKPRESSURE,
      retryScheduled: true,
      nextAttemptAt,
      retry: {
        attemptCount:
          options.retryMetadata?.attemptCount || 1,
        lastAttemptAt:
          options.retryMetadata?.lastAttemptAt ||
          new Date(this.now()).toISOString(),
        nextAttemptAt,
        backoffMs: retryAfterMs,
        scheduledState: PARTITION_TRANSITION_STATE.DEFERRED,
      },
      pressureAction: options?.pressureDecision?.action || null,
      pressureSummary: options?.pressureDecision?.summary || null,
    };
  }

  /**
   * Build canonical control-plane mutation options for managed split
   * lifecycle writes.
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildManagedSplitMutationOptions(options = {}) {
    return {
      ...MANAGED_SPLIT_MUTATION_OPTIONS,
      ...(options && typeof options === LOCAL_STR_OBJECT ? options : {}),
    };
  }

  /**
   * Advance the durable split phase for a given workflow.
   *
   * This is the ONLY entry point for persisting split lifecycle phase
   * transitions. Execution participants (PartitionService, child
   * partitions) MUST NOT write partition_transition_state directly.
   * They call this method through the workflow owner callback.
   *
   * @param {string} workflowId - Active workflow identifier.
   * @param {string} nextPhase - Target PARTITION_TRANSITION_STATE value.
   * @param {Object} [phaseMetadata] - Additional fields to merge into
   *   the persisted transition metadata (e.g. active_partition_version,
   *   partition_count for cutover).
   * @return {Promise<void>}
   */
  async advanceSplitPhase(
    workflowId,
    nextPhase,
    phaseMetadata = {},
    expectedPredecessorStates = PRE_CUTOVER_SPLIT_STATES,
  ) {
    if (!SPLIT_OWNER_MANAGED_PHASES.has(nextPhase)) {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_SPLIT_INVALID_PHASE_TRANSITION,
      );
    }

    const workflow =
      this.resolveWorkflowState(workflowId);
    if (this.isSplitWorkflowStateUnavailable(workflow)) {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_SPLIT_WORKFLOW_NOT_FOUND,
      );
    }

    return this.runSerializedOwnerStep(workflow.ownerKey, () =>
      this.workflowStepRunner.runStep({
        workflowId,
        ownerKey: workflow.ownerKey + SPLIT_OWNER_STEP_LANE_SUFFIX,
        stepName: nextPhase,
        execute: async ({workflow: currentWorkflow}) =>
          this.buildSplitPhaseAdvanceStepResult({
            workflowId,
            nextPhase,
            phaseMetadata,
            expectedPredecessorStates,
            currentWorkflow,
            ownership: await this.renewSplitWorkflowOwnership(workflowId),
          }),
      }),
    );
  }

  /**
   * Build one phase-advance step result after re-validating the
   * workflow's current status inside the serialized step.
   * @param {Object} input
   * @return {Object} Step result ({result: false} = refused, nothing
   *   persisted).
   * @private
   */
  buildSplitPhaseAdvanceStepResult(input) {
    if (!input.expectedPredecessorStates.has(input.currentWorkflow.status)) {
      this.logger.warn(MANAGED_SPLIT_LOG_MSG.PHASE_ADVANCE_REFUSED, {
        workflowId: input.workflowId,
        nextPhase: input.nextPhase,
        status: input.currentWorkflow.status,
      });
      return {result: false};
    }
    return {
      nextStep: input.nextPhase,
      reason: input.nextPhase,
      // The renewed ownership fence + owner identity ride the
      // transition so the storage-backed assertTransitionFence engages:
      // a stale owner's phase advance fails the exact-fence / owner
      // check instead of landing.
      fenceToken: input.ownership?.fenceToken,
      ownerId: input.ownership?.ownerId,
      updates: {
        status: input.nextPhase,
        metadata: {
          ...(input.currentWorkflow.metadata || {}),
          ...input.phaseMetadata,
        },
      },
      result: true,
    };
  }

  /**
   * Accept a typed source-side participant acknowledgement, persist it
   * through the canonical DurableWorkflowCoordinator path, and react on
   * the two owner-decided boundaries: cutover (source caught up) and
   * dissolution (source mirror removed).
   *
   * PartitionService calls this at each execution boundary instead of
   * owning split phase transitions directly.
   *
   * @param {string} workflowId - Durable workflow identity.
   * @param {Object} ack - Acknowledgement payload using
   *   PARTICIPANT_ACK_FIELD keys (participantKey, status, fenceToken,
   *   checkpoint, acknowledgedAt).
   * @return {Promise<Object>} acknowledgeParticipant result extended
   *   with {splitCutoverApplied: boolean}.
   */
  async acknowledgeSourceParticipant(workflowId, ack) {
    if (!workflowId) {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_SPLIT_WORKFLOW_NOT_FOUND,
      );
    }
    const workflow = this.resolveWorkflowState(workflowId);
    if (this.isSplitWorkflowStateUnavailable(workflow)) {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_SPLIT_WORKFLOW_NOT_FOUND,
      );
    }
    this.ensureCanonicalSplitParticipants(
      workflow.workflowId,
      workflow.metadata,
    );
    const ackResult = await this.workflowCoordinator.acknowledgeParticipant(
      workflowId,
      ack,
    );

    // A rejected acknowledgement (stale fence, out-of-graph transition,
    // duplicate, unknown participant) is a typed outcome, never silently
    // applied: short-circuit every owner reaction so a stale or
    // malformed ack can never drive a cutover, abort, or dissolution.
    if (ackResult?.result !== PARTICIPANT_ACK_RESULT.ACCEPTED) {
      this.logger.warn(MANAGED_SPLIT_LOG_MSG.ACK_REJECTED, {
        workflowId,
        result: ackResult?.result,
        currentFenceToken: ackResult?.currentFenceToken,
        receivedFenceToken: ackResult?.receivedFenceToken,
        currentStatus: ackResult?.currentStatus,
      });
      return {
        ...ackResult,
        splitCutoverApplied: false,
      };
    }

    const ackStatus = String(ack?.[PARTICIPANT_ACK_FIELD.STATUS] || '');
    let splitCutoverApplied =
      workflow.status === PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE;
    if (SPLIT_ACK_FAILURE_STATUSES.has(ackStatus)) {
      // Deliberately NOT awaited: the abort is FIFO-serialized on the
      // owner lane and may queue behind an in-flight cutover step; the
      // failing source's acknowledgement must not block on that lane.
      // FIFO enqueue order still guarantees the abort lands before any
      // cutover step enqueued after it.
      this.abortSplitOnSourceFailure(workflowId, ackStatus)
        .catch((error) => {
          this.logger.error(MANAGED_SPLIT_LOG_MSG.ABORT_DISPATCH_FAILED, {
            workflowId,
            ackStatus,
            error: error?.message || error,
          });
        });
      splitCutoverApplied = false;
    }
    if (ackStatus === SPLIT_ACK_STATUS.CATCHUP_READY) {
      splitCutoverApplied = await this.applySplitCutoverIfReady(workflowId);
    }
    if (ackStatus === SPLIT_ACK_STATUS.CLEANUP_COMPLETED) {
      await this.finalizeSplitDissolutionIfReady(workflowId);
    }

    return {
      ...ackResult,
      splitCutoverApplied,
    };
  }

  /**
   * Apply the durable split cutover once the source participant has
   * reported catch-up readiness. Single-path decision: evidence is the
   * persisted participant status; the outcome is either "applied" or
   * "awaiting source".
   * @param {string} workflowId
   * @return {Promise<boolean>} True when the durable cutover is active.
   * @private
   */
  async applySplitCutoverIfReady(workflowId) {
    const workflow = this.resolveWorkflowState(workflowId);
    if (this.isSplitWorkflowStateUnavailable(workflow)) {
      return false;
    }
    if (workflow.status ===
        PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE) {
      return true;
    }
    if (!PRE_CUTOVER_SPLIT_STATES.has(workflow.status)) {
      // Aborted (FAILED) or otherwise non-running workflows must never
      // be promoted by a late or stale CATCHUP_READY acknowledgement.
      this.logger.warn(MANAGED_SPLIT_LOG_MSG.PHASE_ADVANCE_REFUSED, {
        workflowId,
        nextPhase: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
        status: workflow.status,
      });
      return false;
    }
    if (!SPLIT_ACK_CATCHUP_SATISFIED_STATUSES.has(
      this.resolveSplitSourceParticipantStatus(workflow),
    )) {
      return false;
    }

    const catchupAdvanced = await this.advanceSplitPhase(
      workflowId,
      PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
    );
    if (catchupAdvanced !== true) {
      return false;
    }
    const cutoverApplied = await this.applySplitCutoverStep(
      workflowId,
      workflow.ownerKey,
    );
    if (cutoverApplied !== true) {
      return false;
    }
    this.logger.info(MANAGED_SPLIT_LOG_MSG.CUTOVER_APPLIED, {
      workflowId,
      tableId: workflow.tableId,
    });
    return true;
  }

  /**
   * The cutover step itself, FIFO-serialized on the owner lane: after
   * re-validating the CURRENT status, carry every non-participating
   * sibling descriptor forward into the target epoch (re-validated
   * against the authoritative partitions rows, not just the plan-time
   * snapshot), then persist the SPLIT_CUTOVER_ACTIVE transition whose
   * durable mutation promotes the epoch. Sibling promotion happens
   * inside the same lane slot so an abort can never land between the
   * promotion and the epoch write.
   * @param {string} workflowId
   * @param {string} ownerKey
   * @return {Promise<boolean>} True when the durable cutover applied.
   * @private
   */
  async applySplitCutoverStep(workflowId, ownerKey) {
    return this.runSerializedOwnerStep(ownerKey, () =>
      this.workflowStepRunner.runStep({
        workflowId,
        ownerKey: ownerKey + SPLIT_OWNER_STEP_LANE_SUFFIX,
        stepName: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
        execute: async ({workflow: currentWorkflow}) => {
          if (!PRE_CUTOVER_SPLIT_STATES.has(currentWorkflow.status) ||
              !SPLIT_ACK_CATCHUP_SATISFIED_STATUSES.has(
                this.resolveSplitSourceParticipantStatus(currentWorkflow),
              )) {
            this.logger.warn(MANAGED_SPLIT_LOG_MSG.PHASE_ADVANCE_REFUSED, {
              workflowId,
              nextPhase: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
              status: currentWorkflow.status,
            });
            return {result: false};
          }
          const siblingPartitionIds =
            this.resolveCutoverSiblingPartitionIds(currentWorkflow);
          const targetVersion = Number(
            currentWorkflow.metadata?.[
              PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION
            ],
          );
          for (const siblingPartitionId of siblingPartitionIds) {
            await this.promoteSiblingPartitionVersion(
              siblingPartitionId,
              targetVersion,
            );
          }
          // Renew the lease inside the same lane slot so the epoch-flip
          // transition carries a live fence; claim loss throws before
          // the epoch write.
          const ownership = await this.renewSplitWorkflowOwnership(
            workflowId,
          );
          return {
            nextStep: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
            reason: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
            fenceToken: ownership.fenceToken,
            ownerId: ownership.ownerId,
            updates: {
              status: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
              metadata: {
                ...(currentWorkflow.metadata || {}),
                [PARTITION_TRANSITION_METADATA_FIELD.CUTOVER_APPLIED_AT]:
                  this.now(),
                [PARTITION_TRANSITION_METADATA_FIELD.SIBLING_PARTITION_IDS]:
                  siblingPartitionIds,
              },
            },
            result: true,
          };
        },
      }),
    );
  }

  /**
   * Abort the split fail-safe on a pre-cutover source failure
   * acknowledgement: persist a FAILED transition (whose durable
   * mutation withdraws pending_partition_version, leaving the source
   * partition authoritative) and tear down the provisioned-but-never-
   * authoritative children. Post-cutover failures are recorded but
   * cannot un-promote the epoch.
   * @param {string} workflowId
   * @param {string} ackStatus - The failure SPLIT_ACK_STATUS received.
   * @return {Promise<boolean>} True when the split is (now) aborted.
   * @private
   */
  async abortSplitOnSourceFailure(workflowId, ackStatus) {
    const workflow = this.resolveWorkflowState(workflowId);
    if (this.isSplitWorkflowStateUnavailable(workflow)) {
      return false;
    }
    if (workflow.status === PARTITION_TRANSITION_STATE.FAILED) {
      return true;
    }
    if (!PRE_CUTOVER_SPLIT_STATES.has(workflow.status)) {
      this.logger.error(
        MANAGED_SPLIT_LOG_MSG.POST_CUTOVER_SOURCE_FAILURE_RECORDED,
        {workflowId, status: workflow.status, ackStatus},
      );
      return false;
    }

    // The FAILED persist AND the child teardown run in one FIFO owner-
    // lane slot: nothing can interleave a cutover between them, and any
    // cutover step enqueued later re-validates against the FAILED
    // status.
    return this.runSerializedOwnerStep(workflow.ownerKey, () =>
      this.runSplitAbortStep(workflowId, workflow.ownerKey, ackStatus));
  }

  /**
   * Execute the serialized abort step: re-validate the CURRENT status
   * inside the lane, persist FAILED (withdrawing the pending epoch),
   * then tear down the never-authoritative children and restore any
   * promoted sibling descriptors.
   * @param {string} workflowId
   * @param {string} ownerKey
   * @param {string} ackStatus - The failure SPLIT_ACK_STATUS received.
   * @return {Promise<boolean>} True when the split is (now) aborted.
   * @private
   */
  async runSplitAbortStep(workflowId, ownerKey, ackStatus) {
    const abortOutcome = await this.workflowStepRunner.runStep({
      workflowId,
      ownerKey: ownerKey + SPLIT_OWNER_STEP_LANE_SUFFIX,
      stepName: PARTITION_TRANSITION_STATE.FAILED,
      execute: async ({workflow: currentWorkflow}) =>
        this.buildSplitAbortStepResult(
          workflowId,
          ackStatus,
          currentWorkflow,
        ),
    });

    if (abortOutcome !== SPLIT_ABORT_OUTCOME.ABORTED) {
      return abortOutcome === SPLIT_ABORT_OUTCOME.ALREADY_ABORTED;
    }
    const abortedWorkflow = this.resolveWorkflowState(workflowId);
    if (!this.isSplitWorkflowStateUnavailable(abortedWorkflow)) {
      await this.teardownAbortedSplitChildren(workflowId, abortedWorkflow);
      await this.restoreAbortedSplitSiblings(abortedWorkflow);
    }
    this.logger.error(
      MANAGED_SPLIT_LOG_MSG.SPLIT_ABORTED_ON_SOURCE_FAILURE,
      {workflowId, ackStatus},
    );
    return true;
  }

  /**
   * Build the abort step result from the workflow's CURRENT status.
   * @param {string} workflowId
   * @param {string} ackStatus
   * @param {Object} currentWorkflow
   * @return {Object} Step result carrying a SPLIT_ABORT_OUTCOME.
   * @private
   */
  buildSplitAbortStepResult(workflowId, ackStatus, currentWorkflow) {
    if (currentWorkflow.status === PARTITION_TRANSITION_STATE.FAILED) {
      return {result: SPLIT_ABORT_OUTCOME.ALREADY_ABORTED};
    }
    if (!PRE_CUTOVER_SPLIT_STATES.has(currentWorkflow.status)) {
      this.logger.error(
        MANAGED_SPLIT_LOG_MSG.POST_CUTOVER_SOURCE_FAILURE_RECORDED,
        {workflowId, status: currentWorkflow.status, ackStatus},
      );
      return {result: SPLIT_ABORT_OUTCOME.REFUSED_POST_CUTOVER};
    }
    return {
      updates: {
        status: PARTITION_TRANSITION_STATE.FAILED,
        metadata: {
          ...(currentWorkflow.metadata || {}),
          [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: {
            classification: LOCAL_STR_SPLIT_SOURCE_EXECUTION_FAILURE,
            message: ackStatus,
            failedAt: new Date(this.now()).toISOString(),
            retryable: true,
          },
        },
      },
      result: SPLIT_ABORT_OUTCOME.ABORTED,
    };
  }

  /**
   * Build one canonical scheduled-retry gate result.
   * @param {Object} input - Scheduled-retry execution context.
   * @return {Object} Split execution result.
   * @private
   */
  buildScheduledRetryExecutionResult(input) {
    return {
      success: false,
      partitionId: input.partitionId,
      tableId: input.tableId,
      tableName: input.tableName,
      workflowId: input.workflowId,
      targetVersion: input.targetVersion,
      state: input.existingTransition.state,
      retryScheduled: true,
      nextAttemptAt: input.scheduledRetry.nextAttemptAt,
      retry: input.scheduledRetry,
    };
  }

  /**
   * Build one canonical admission-denied execution result.
   * @param {Object} input - Admission-denied execution context.
   * @return {Object} Split execution result.
   * @private
   */
  buildAdmissionDeniedExecutionResult(input) {
    return {
      success: false,
      partitionId: input.partitionId,
      tableId: input.tableId,
      tableName: input.tableName,
      workflowId: input.workflowId,
      targetVersion: input.targetVersion,
      state: input.deniedState,
      admission: input.compactAdmission,
      retry: input.deniedRetryMetadata,
    };
  }

  /**
   * Build an open execution-gate outcome.
   * @return {{blocked: boolean}} Open gate outcome.
   * @private
   */
  buildOpenExecutionGateOutcome() {
    return {blocked: false};
  }

  /**
   * Build a blocked execution-gate outcome.
   * @param {Object} result - Blocked execution result.
   * @return {{blocked: boolean, result: Object}} Blocked gate outcome.
   * @private
   */
  buildBlockedExecutionGateOutcome(result) {
    return {
      blocked: true,
      result,
    };
  }

  /**
   * Resolve one canonical execution-gate outcome.
   * @param {Object} input - Execution-gate evidence.
   * @return {Promise<{blocked: boolean, result?: Object}>} Gate outcome.
   * @private
   */
  async resolveExecutionGateOutcome(input) {
    if (input.scheduledRetry &&
        input.scheduledRetry.retryDue === false) {
      return this.buildBlockedExecutionGateOutcome(
        this.buildScheduledRetryExecutionResult(input),
      );
    }

    if (input.pressureDecision &&
        input.pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER) {
      return this.buildBlockedExecutionGateOutcome(
        this.buildPressureDeferredResult({
          partitionId: input.partitionId,
          tableId: input.tableId,
          tableName: input.tableName,
          retryMetadata: input.retryMetadata,
          pressureDecision: input.pressureDecision,
        }),
      );
    }

    if (input.admissionResult &&
        input.admissionResult.allowed === false) {
      const deniedState = this.resolveAdmissionDeniedState(
        input.admissionResult.decisionType,
      );
      const deniedRetryMetadata = this.buildScheduledRetryMetadata(
        input.retryMetadata,
        deniedState,
      );
      const deniedMetadata = {
        ...input.workflowMetadata,
        [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]:
          input.compactAdmission,
        [PARTITION_TRANSITION_METADATA_FIELD.RETRY]:
          deniedRetryMetadata,
      };
      await this.workflowCoordinator.updateWorkflow(input.workflowId, {
        status: deniedState,
        metadata: deniedMetadata,
      });
      return this.buildBlockedExecutionGateOutcome(
        this.buildAdmissionDeniedExecutionResult({
          partitionId: input.partitionId,
          tableId: input.tableId,
          tableName: input.tableName,
          workflowId: input.workflowId,
          targetVersion: input.targetVersion,
          deniedState,
          compactAdmission: input.compactAdmission,
          deniedRetryMetadata,
        }),
      );
    }

    return this.buildOpenExecutionGateOutcome();
  }
}

export {
  ManagedSplitWorkflowExecutionGateMethods,
};
