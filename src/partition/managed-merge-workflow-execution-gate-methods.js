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
  claimWorkflowOwnershipCore,
  renewWorkflowOwnershipCore,
} from './managed-workflow-ownership-core.js';
import {
  MANAGED_MERGE_ERROR_MSG,
  MANAGED_MERGE_LOG_MSG,
  MERGE_OWNER_MANAGED_PHASES,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  PRE_CUTOVER_MERGE_STATES,
} from './partition-constants.js';
import {
  MERGE_ACK_CATCHUP_SATISFIED_STATUSES,
  MERGE_ACK_FAILURE_STATUSES,
  MERGE_ACK_STATUS,
  MERGE_PARTICIPANT_KEY_SEPARATOR,
  MERGE_PARTICIPANT_PREFIX,
  isMergeSourceAckTransitionAllowed,
} from './merge-ack-constants.js';

const LOCAL_STR_PARTITION_MERGE_WORKFLOW = 'partition:merge:workflow';
const LOCAL_STR_CONTROL_PLANE_WRITE = 'control-plane:write';
const LOCAL_STR_CONTROL_PLANE_BACKPRESSURE = 'control_plane_backpressure';
const LOCAL_STR_OBJECT = 'object';

const DEFAULT_RETRY_BASE_DELAY_MS = 5000;
const MANAGED_MERGE_MUTATION_OPTIONS = Object.freeze({
  workClass: PRESSURE_WORK_CLASS.CRITICAL,
});
/**
 * Lane-key suffix for runStep calls made INSIDE a FIFO owner-lane slot.
 * The canonical lane's runExclusive() COALESCES concurrent callers on the
 * same key: a slot firing while an execute() holds the base owner key
 * would never run its step factory and silently resolve with the
 * execute's result. Slots are already strictly serialized by the FIFO,
 * so their runStep calls use this suffixed key, which by construction
 * has at most one user at a time.
 * @type {string}
 */
const MERGE_OWNER_STEP_LANE_SUFFIX = ':owner-step';

const MERGE_EXECUTION_GATE_STATE = Object.freeze({
  SCHEDULED_RETRY: 'scheduled_retry',
  PRESSURE_DEFERRED: 'pressure_deferred',
  ADMISSION_DENIED: 'admission_denied',
  ALLOWED: 'allowed',
});

class ManagedMergeWorkflowExecutionGateMethods {
  /**
   * Run one owner-scoped step strictly AFTER every previously enqueued
   * step for the same owner key (FIFO).
   *
   * This exists because the canonical lane's runExclusive() COALESCES
   * concurrent calls — a second caller receives the in-flight execution's
   * promise instead of being queued — so cross-acknowledgement mutations
   * (a cutover step racing a fail-safe abort) would otherwise interleave
   * or be silently swallowed. Every owner-side durable phase mutation
   * (phase advances, the cutover step, the abort step) routes through
   * this FIFO; the step runner's lane remains the execution substrate
   * inside each slot.
   *
   * @param {string} ownerKey - Merge owner key.
   * @param {Function} stepFactory - Async step to run.
   * @return {Promise<*>} The step's own settlement.
   */
  runSerializedOwnerStep(ownerKey, stepFactory) {
    const previousTail =
      this.mergeOwnerLaneTailByOwnerKey.get(ownerKey) || Promise.resolve();
    const execution = previousTail
      .catch(() => {})
      .then(() => stepFactory());
    const tail = execution
      .catch(() => {})
      .finally(() => {
        if (this.mergeOwnerLaneTailByOwnerKey.get(ownerKey) === tail) {
          this.mergeOwnerLaneTailByOwnerKey.delete(ownerKey);
        }
      });
    this.mergeOwnerLaneTailByOwnerKey.set(ownerKey, tail);
    return execution;
  }

  /**
   * Resolve when every currently enqueued owner-lane step for one
   * workflow has settled (fire-and-forget aborts included). Observability
   * surface for guards and diagnostics.
   * @param {string} workflowId
   * @return {Promise<void>}
   */
  async settleMergeOwnerLaneForWorkflow(workflowId) {
    const workflow = this.resolveWorkflowState(workflowId);
    const ownerKey = this.isMergeWorkflowStateUnavailable(workflow) ?
      '' : String(workflow.ownerKey || '');
    await (this.mergeOwnerLaneTailByOwnerKey.get(ownerKey) ||
      Promise.resolve());
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
   * Evaluate node-local pressure for merge execution.
   * @param {Object} [executionContext={}]
   * @return {Object}
   * @private
   */
  evaluatePressure(executionContext = {}) {
    return this.getPressureGovernor().evaluate({
      workClass: executionContext.workClass || PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: [
        LOCAL_STR_PARTITION_MERGE_WORKFLOW,
        LOCAL_STR_CONTROL_PLANE_WRITE,
      ],
    });
  }

  /**
   * Build a typed merge deferral without creating new durable control-plane
   * writes while the local node is already hot.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  buildPressureDeferredResult(options = {}) {
    const pressureDecision = options.pressureDecision || {};
    const retryAfterMs = Number.isFinite(pressureDecision.retryAfterMs) ?
      pressureDecision.retryAfterMs :
      DEFAULT_RETRY_BASE_DELAY_MS;
    const nextAttemptAt = new Date(this.now() + retryAfterMs).toISOString();
    return {
      success: false,
      sourcePartitionIds: options.sourcePartitionIds || [],
      ...this.buildMergeResultIdentity(options),
      state: PARTITION_TRANSITION_STATE.DEFERRED,
      error: LOCAL_STR_CONTROL_PLANE_BACKPRESSURE,
      retryScheduled: true,
      nextAttemptAt,
      retry: this.buildPressureDeferredRetryBlock(
        options.retryMetadata,
        nextAttemptAt,
        retryAfterMs,
      ),
      pressureAction: pressureDecision.action || null,
      pressureSummary: pressureDecision.summary || null,
    };
  }

  /**
   * Build the shared identity fields carried by every gate result.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  buildMergeResultIdentity(options) {
    return {
      tableId: options.tableId || null,
      tableName: options.tableName || null,
      workflowId: options.workflowId || null,
      targetVersion: options.targetVersion || null,
    };
  }

  /**
   * Build the retry block carried by a pressure-deferred merge result.
   * @param {Object|null} retryMetadata
   * @param {string} nextAttemptAt
   * @param {number} retryAfterMs
   * @return {Object}
   * @private
   */
  buildPressureDeferredRetryBlock(retryMetadata, nextAttemptAt, retryAfterMs) {
    return {
      attemptCount: retryMetadata?.attemptCount || 1,
      lastAttemptAt:
        retryMetadata?.lastAttemptAt ||
        new Date(this.now()).toISOString(),
      nextAttemptAt,
      backoffMs: retryAfterMs,
      scheduledState: PARTITION_TRANSITION_STATE.DEFERRED,
    };
  }

  /**
   * Build canonical control-plane mutation options for managed merge
   * lifecycle writes.
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildManagedMergeMutationOptions(options = {}) {
    return {
      ...MANAGED_MERGE_MUTATION_OPTIONS,
      ...(options && typeof options === LOCAL_STR_OBJECT ? options : {}),
    };
  }

  /**
   * Advance the durable merge phase for a given workflow.
   *
   * This is the ONLY entry point for persisting merge lifecycle phase
   * transitions. Execution participants (the source PartitionServices)
   * MUST NOT write partition_transition_state directly; they report typed
   * acknowledgements and let the workflow owner advance the phase.
   *
   * The step is FIFO-serialized against every other owner-lane mutation
   * (including the fail-safe abort), and the workflow's CURRENT status is
   * re-validated INSIDE the step: a transition whose predecessor state
   * changed while the step was queued (e.g. an abort landed first) is
   * refused, not applied.
   *
   * @param {string} workflowId - Active workflow identifier.
   * @param {string} nextPhase - Target PARTITION_TRANSITION_STATE value.
   * @param {Object} [phaseMetadata] - Additional metadata fields to merge.
   * @param {ReadonlySet<string>} [expectedPredecessorStates] - States the
   *   workflow must still be in when the step executes.
   * @return {Promise<boolean>} True when the phase was advanced.
   */
  async advanceMergePhase(
    workflowId,
    nextPhase,
    phaseMetadata = {},
    expectedPredecessorStates = PRE_CUTOVER_MERGE_STATES,
  ) {
    if (!MERGE_OWNER_MANAGED_PHASES.has(nextPhase)) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.INVALID_PHASE_TRANSITION);
    }

    const workflow = this.resolveWorkflowState(workflowId);
    if (this.isMergeWorkflowStateUnavailable(workflow)) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.WORKFLOW_NOT_FOUND);
    }

    return this.runSerializedOwnerStep(workflow.ownerKey, () =>
      this.runMergeOwnerLaneStepWithSameOwnerResync({
        workflowId,
        ownerKey: workflow.ownerKey + MERGE_OWNER_STEP_LANE_SUFFIX,
        stepName: nextPhase,
        execute: async ({workflow: currentWorkflow}) =>
          this.buildMergePhaseAdvanceStepResult({
            workflowId,
            nextPhase,
            phaseMetadata,
            expectedPredecessorStates,
            currentWorkflow,
            ownership: await this.renewMergeWorkflowOwnership(workflowId),
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
  buildMergePhaseAdvanceStepResult(input) {
    if (!input.expectedPredecessorStates.has(input.currentWorkflow.status)) {
      this.logger.warn(MANAGED_MERGE_LOG_MSG.PHASE_ADVANCE_REFUSED, {
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
      // transition so the storage-backed assertTransitionFence engages
      // (mirrors the split owner).
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
   * Explicit participant transition graph validator (mirrors the split
   * owner): merge source participants (keyed source-partition:<id>)
   * follow the declared graph; the owner-recorded merged-target
   * provisioning outcome is admitted unconditionally.
   * @param {string} participantKey
   * @param {string|null} fromStatus
   * @param {string} toStatus
   * @return {boolean}
   * @private
   */
  isMergeParticipantTransitionAllowed(participantKey, fromStatus, toStatus) {
    if (String(participantKey || '').startsWith(
      MERGE_PARTICIPANT_PREFIX.SOURCE_PARTITION +
        MERGE_PARTICIPANT_KEY_SEPARATOR,
    )) {
      return isMergeSourceAckTransitionAllowed(fromStatus, toStatus);
    }
    return true;
  }

  /**
   * Claim durable ownership of one merge workflow for this owner (new
   * epoch), or renew an existing claim (same fence, extended lease).
   * Never throws on contention (mirrors the schema-provisioning owner).
   * @param {string} workflowId
   * @param {Object} [options]
   * @param {boolean} [options.renew] - Renew at the current fence.
   * @return {Promise<Object>} Claim result ({accepted, result, workflow}).
   * @private
   */
  async claimMergeWorkflowOwnership(workflowId, options = {}) {
    return claimWorkflowOwnershipCore(this, workflowId, options);
  }

  /**
   * Renew the ownership lease inside a serialized owner-lane step and
   * return the fence/owner identity the step's transition must carry.
   * Claim loss throws — the step must not proceed without ownership.
   * @param {string} workflowId
   * @return {Promise<Object>} {fenceToken, ownerId}.
   * @private
   */
  /**
   * Claim durable ownership at merge start (new fence epoch, mirrors
   * the split owner) and return the refusal outcome when another owner
   * holds the live lease. Exactly one node holds the lease; a refused
   * claim is a typed outcome — this node must not drive the workflow.
   * @param {string} workflowId
   * @param {string[]} sourcePartitionIds - Merge sources (log context).
   * @return {Promise<Object|null>} Refusal result, or null when claimed.
   * @private
   */
  async claimMergeWorkflowAtStart(workflowId, sourcePartitionIds) {
    const ownershipClaim = await this.claimMergeWorkflowOwnership(
      workflowId,
    );
    if (ownershipClaim.accepted !== true) {
      this.logger.info(MANAGED_MERGE_LOG_MSG.OWNERSHIP_CLAIM_REFUSED, {
        workflowId,
        sourcePartitionIds,
        result: ownershipClaim.result,
      });
      return {
        success: false,
        sourcePartitionIds,
        workflowId,
        ownership: ownershipClaim.result,
      };
    }
    this.logger.info(MANAGED_MERGE_LOG_MSG.OWNERSHIP_CLAIMED, {
      workflowId,
      fenceToken: ownershipClaim.workflow.fenceToken,
      ownerId: this.workflowOwnerId,
    });
    return null;
  }

  async renewMergeWorkflowOwnership(workflowId) {
    return renewWorkflowOwnershipCore(
      this,
      workflowId,
      MANAGED_MERGE_LOG_MSG.OWNERSHIP_LOST,
    );
  }

  /**
   * Accept a typed source-side participant acknowledgement, persist it
   * through the durable coordinator, and react on the two owner-decided
   * boundaries: cutover (both sources caught up) and dissolution (both
   * source mirrors removed).
   *
   * @param {string} workflowId - Durable workflow identity.
   * @param {Object} ack - Acknowledgement payload using
   *   PARTICIPANT_ACK_FIELD keys.
   * @return {Promise<Object>} acknowledgeParticipant result extended with
   *   {mergeCutoverApplied: boolean}.
   */
  async acknowledgeMergeSourceParticipant(workflowId, ack) {
    if (!workflowId) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.WORKFLOW_NOT_FOUND);
    }
    const workflow = this.resolveWorkflowState(workflowId);
    if (this.isMergeWorkflowStateUnavailable(workflow)) {
      throw new Error(MANAGED_MERGE_ERROR_MSG.WORKFLOW_NOT_FOUND);
    }
    this.ensureCanonicalMergeParticipants(
      workflow.workflowId,
      workflow.metadata,
    );
    const ackResult = await this.workflowCoordinator.acknowledgeParticipant(
      workflowId,
      ack,
    );

    // A rejected acknowledgement (stale fence, out-of-graph transition,
    // duplicate, unknown participant) is a typed outcome, never silently
    // applied (mirrors the split owner): short-circuit every owner
    // reaction.
    if (ackResult?.result !== PARTICIPANT_ACK_RESULT.ACCEPTED) {
      this.logger.warn(MANAGED_MERGE_LOG_MSG.ACK_REJECTED, {
        workflowId,
        result: ackResult?.result,
        currentFenceToken: ackResult?.currentFenceToken,
        receivedFenceToken: ackResult?.receivedFenceToken,
        currentStatus: ackResult?.currentStatus,
      });
      return {
        ...ackResult,
        mergeCutoverApplied: false,
      };
    }

    const ackStatus = String(ack?.[PARTICIPANT_ACK_FIELD.STATUS] || '');
    let mergeCutoverApplied =
      workflow.status === PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE;
    if (MERGE_ACK_FAILURE_STATUSES.has(ackStatus)) {
      // Deliberately NOT awaited: the abort is FIFO-serialized on the
      // owner lane and may queue behind an in-flight cutover step; the
      // failing source's acknowledgement must not block on that lane.
      // FIFO enqueue order still guarantees the abort lands before any
      // cutover step enqueued after it.
      this.abortMergeOnSourceFailure(workflowId, ackStatus)
        .catch((error) => {
          this.logger.error(MANAGED_MERGE_LOG_MSG.ABORT_DISPATCH_FAILED, {
            workflowId,
            ackStatus,
            error: error?.message || error,
          });
        });
      mergeCutoverApplied = false;
    }
    if (ackStatus === MERGE_ACK_STATUS.CATCHUP_READY) {
      mergeCutoverApplied = await this.applyMergeCutoverIfReady(workflowId);
    }
    if (ackStatus === MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED) {
      await this.finalizeMergeDissolutionIfReady(workflowId);
    }

    return {
      ...ackResult,
      mergeCutoverApplied,
    };
  }

  /**
   * Abort the merge fail-safe on a pre-cutover source failure
   * acknowledgement: persist a FAILED transition (whose durable mutation
   * withdraws pending_partition_version, leaving the source partitions
   * authoritative) and tear down the provisioned-but-never-authoritative
   * merged target. Post-cutover failures are recorded but cannot
   * un-promote the epoch.
   *
   * @param {string} workflowId
   * @param {string} ackStatus - The failure MERGE_ACK_STATUS received.
   * @return {Promise<boolean>} True when the merge is (now) aborted.
   * @private
   */
  async abortMergeOnSourceFailure(workflowId, ackStatus) {
    const workflow = this.resolveWorkflowState(workflowId);
    if (this.isMergeWorkflowStateUnavailable(workflow)) {
      return false;
    }
    if (workflow.status === PARTITION_TRANSITION_STATE.FAILED) {
      return true;
    }
    if (!PRE_CUTOVER_MERGE_STATES.has(workflow.status)) {
      this.logger.error(
        MANAGED_MERGE_LOG_MSG.POST_CUTOVER_SOURCE_FAILURE_RECORDED,
        {workflowId, status: workflow.status, ackStatus},
      );
      return false;
    }

    // The FAILED persist AND the target teardown run in one FIFO owner-
    // lane slot: nothing can interleave a cutover between them, and any
    // cutover step enqueued later re-validates against the FAILED status.
    return this.runSerializedOwnerStep(workflow.ownerKey, () =>
      this.runMergeAbortStep(
        workflowId,
        workflow.ownerKey,
        ackStatus,
        MERGE_OWNER_STEP_LANE_SUFFIX,
      ));
  }

  /**
   * Apply the durable merge cutover once every source participant has
   * reported catch-up readiness. Single-path decision: evidence is the
   * persisted participant statuses; the outcome is either "applied" or
   * "awaiting sources".
   *
   * @param {string} workflowId
   * @return {Promise<boolean>} True when the durable cutover is active.
   * @private
   */
  async applyMergeCutoverIfReady(workflowId) {
    const workflow = this.resolveWorkflowState(workflowId);
    if (this.isMergeWorkflowStateUnavailable(workflow)) {
      return false;
    }
    if (workflow.status ===
        PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE) {
      return true;
    }
    if (!PRE_CUTOVER_MERGE_STATES.has(workflow.status)) {
      // Aborted (FAILED) or otherwise non-running workflows must never be
      // promoted by a late or stale CATCHUP_READY acknowledgement.
      this.logger.warn(
        MANAGED_MERGE_LOG_MSG.CUTOVER_REFUSED_NOT_PRE_CUTOVER,
        {workflowId, status: workflow.status},
      );
      return false;
    }
    if (!this.areAllMergeSourcesAtStatus(
      workflow,
      MERGE_ACK_CATCHUP_SATISFIED_STATUSES,
    )) {
      this.logger.info(MANAGED_MERGE_LOG_MSG.CUTOVER_AWAITING_SOURCES, {
        workflowId,
        status: workflow.status,
      });
      return false;
    }

    const catchupAdvanced = await this.advanceMergePhase(
      workflowId,
      PARTITION_TRANSITION_STATE.MERGE_CATCHUP,
    );
    if (catchupAdvanced !== true) {
      return false;
    }
    const cutoverApplied = await this.applyMergeCutoverStep(
      workflowId,
      workflow.ownerKey,
    );
    if (cutoverApplied !== true) {
      return false;
    }
    this.logger.info(MANAGED_MERGE_LOG_MSG.CUTOVER_APPLIED, {
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
   * snapshot), then persist the MERGE_CUTOVER_ACTIVE transition whose
   * durable mutation promotes the epoch. Sibling promotion happens inside
   * the same lane slot so an abort can never land between the promotion
   * and the epoch write.
   * @param {string} workflowId
   * @param {string} ownerKey
   * @return {Promise<boolean>} True when the durable cutover applied.
   * @private
   */
  async applyMergeCutoverStep(workflowId, ownerKey) {
    return this.runSerializedOwnerStep(ownerKey, () =>
      this.runMergeOwnerLaneStepWithSameOwnerResync({
        workflowId,
        ownerKey: ownerKey + MERGE_OWNER_STEP_LANE_SUFFIX,
        stepName: PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
        execute: async ({workflow: currentWorkflow}) => {
          if (!PRE_CUTOVER_MERGE_STATES.has(currentWorkflow.status) ||
              !this.areAllMergeSourcesAtStatus(
                currentWorkflow,
                MERGE_ACK_CATCHUP_SATISFIED_STATUSES,
              )) {
            this.logger.warn(MANAGED_MERGE_LOG_MSG.PHASE_ADVANCE_REFUSED, {
              workflowId,
              nextPhase: PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
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
          // transition carries a live fence (mirrors the split owner).
          const ownership = await this.renewMergeWorkflowOwnership(
            workflowId,
          );
          return {
            nextStep: PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
            reason: PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
            fenceToken: ownership.fenceToken,
            ownerId: ownership.ownerId,
            updates: {
              status: PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
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
   * Build one canonical scheduled-retry gate result.
   * @param {Object} input
   * @return {Object}
   * @private
   */
  buildScheduledRetryExecutionResult(input) {
    return {
      success: false,
      sourcePartitionIds: input.sourcePartitionIds,
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
   * @param {Object} input
   * @return {Object}
   * @private
   */
  buildAdmissionDeniedExecutionResult(input) {
    return {
      success: false,
      sourcePartitionIds: input.sourcePartitionIds,
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
   * Select the single execution-gate state from normalized evidence.
   * @param {Object} input
   * @return {string}
   * @private
   */
  resolveMergeExecutionGateState(input) {
    return input.scheduledRetry?.retryDue === false ?
      MERGE_EXECUTION_GATE_STATE.SCHEDULED_RETRY :
      input.pressureDecision?.action === PRESSURE_GOVERNOR_ACTION.DEFER ?
        MERGE_EXECUTION_GATE_STATE.PRESSURE_DEFERRED :
        input.admissionResult?.allowed === false ?
          MERGE_EXECUTION_GATE_STATE.ADMISSION_DENIED :
          MERGE_EXECUTION_GATE_STATE.ALLOWED;
  }

  /**
   * Resolve one canonical execution-gate outcome for merge admission.
   * @param {Object} input - Execution-gate evidence.
   * @return {Promise<{blocked: boolean, result?: Object}>} Gate outcome.
   * @private
   */
  async resolveMergeExecutionGateOutcome(input) {
    const gateState = this.resolveMergeExecutionGateState(input);
    switch (gateState) {
    case MERGE_EXECUTION_GATE_STATE.SCHEDULED_RETRY:
      return {
        blocked: true,
        result: this.buildScheduledRetryExecutionResult(input),
      };
    case MERGE_EXECUTION_GATE_STATE.PRESSURE_DEFERRED:
      return {
        blocked: true,
        result: this.buildPressureDeferredResult({
          sourcePartitionIds: input.sourcePartitionIds,
          tableId: input.tableId,
          tableName: input.tableName,
          workflowId: input.workflowId,
          targetVersion: input.targetVersion,
          retryMetadata: input.retryMetadata,
          pressureDecision: input.pressureDecision,
        }),
      };
    case MERGE_EXECUTION_GATE_STATE.ADMISSION_DENIED: {
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
      return {
        blocked: true,
        result: this.buildAdmissionDeniedExecutionResult({
          sourcePartitionIds: input.sourcePartitionIds,
          tableId: input.tableId,
          tableName: input.tableName,
          workflowId: input.workflowId,
          targetVersion: input.targetVersion,
          deniedState,
          compactAdmission: input.compactAdmission,
          deniedRetryMetadata,
        }),
      };
    }
    default:
      return {blocked: false};
    }
  }
}

export {
  ManagedMergeWorkflowExecutionGateMethods,
};
