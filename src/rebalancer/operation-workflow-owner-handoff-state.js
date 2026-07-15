import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import * as COORDINATOR_HANDOFF_RETRY
  from './operation-workflow-coordinator-handoff-retry.js';

const {
  COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS,
  ControlPlaneField,
  ControlPlaneMessageType,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_LOG_MSG,
  WORKFLOW_STEP,
  classifySystemPartition,
  classifyTransportDeliveryOutcome,
  isDeliveredTransportDeliveryOutcome,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_STATE = Object.freeze({
  DEFAULT: 'default',
  CRITICAL_SYSTEM_PARTITION: 'critical_system_partition',
  PRIORITY_CONTROL_PLANE_PARTITION: 'priority_control_plane_partition',
});

const COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_ACTION = Object.freeze({
  CLAIM_ONLY: 'claim_only',
  DISPATCH_AFTER_CLAIM: 'dispatch_after_claim',
});

const COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_ACTION_BY_STATE =
  Object.freeze(
    new Map([
      [
        COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_STATE.DEFAULT,
        COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_ACTION.CLAIM_ONLY,
      ],
      [
        COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_STATE
          .CRITICAL_SYSTEM_PARTITION,
        COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_ACTION
          .DISPATCH_AFTER_CLAIM,
      ],
      [
        COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_STATE
          .PRIORITY_CONTROL_PLANE_PARTITION,
        COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_ACTION
          .DISPATCH_AFTER_CLAIM,
      ],
    ]),
  );

const COORDINATOR_CREATED_OPERATION_ARM_STATE = Object.freeze({
  UNAVAILABLE: 'unavailable',
  TERMINAL: 'terminal',
  LOCALLY_OWNED_PENDING: 'locally_owned_pending',
  LOCALLY_OWNED_DISPATCHABLE: 'locally_owned_dispatchable',
  REMOTE_OWNED_DISPATCHABLE: 'remote_owned_dispatchable',
  UNSUPPORTED_WORKFLOW: 'unsupported_workflow',
});

const COORDINATOR_CREATED_OPERATION_ARM_ACTION = Object.freeze({
  SKIP: 'skip',
  CLAIM_AND_APPLY_LOCAL_PRIME: 'claim_and_apply_local_prime',
  DISPATCH_LOCAL: 'dispatch_local',
  WAKE_REMOTE_OWNER: 'wake_remote_owner',
});

const COORDINATOR_CREATED_OPERATION_ARM_ACTION_BY_STATE = Object.freeze(
  new Map([
    [
      COORDINATOR_CREATED_OPERATION_ARM_STATE.UNAVAILABLE,
      COORDINATOR_CREATED_OPERATION_ARM_ACTION.SKIP,
    ],
    [
      COORDINATOR_CREATED_OPERATION_ARM_STATE.TERMINAL,
      COORDINATOR_CREATED_OPERATION_ARM_ACTION.SKIP,
    ],
    [
      COORDINATOR_CREATED_OPERATION_ARM_STATE.LOCALLY_OWNED_PENDING,
      COORDINATOR_CREATED_OPERATION_ARM_ACTION.CLAIM_AND_APPLY_LOCAL_PRIME,
    ],
    [
      COORDINATOR_CREATED_OPERATION_ARM_STATE.LOCALLY_OWNED_DISPATCHABLE,
      COORDINATOR_CREATED_OPERATION_ARM_ACTION.DISPATCH_LOCAL,
    ],
    [
      COORDINATOR_CREATED_OPERATION_ARM_STATE.REMOTE_OWNED_DISPATCHABLE,
      COORDINATOR_CREATED_OPERATION_ARM_ACTION.WAKE_REMOTE_OWNER,
    ],
    [
      COORDINATOR_CREATED_OPERATION_ARM_STATE.UNSUPPORTED_WORKFLOW,
      COORDINATOR_CREATED_OPERATION_ARM_ACTION.SKIP,
    ],
  ]),
);

function withOwnerHandoffState(Base) {
  return class OwnerHandoffState extends Base {
    /**
     * Remote coordinator-created handoff delivery does not mutate the source
     * owner's local workflow state. Keep local operation advancement gated on
     * initialization, but allow priority remote owner wakeups to survive source
     * readiness transitions.
     *
     * @param {Object|null} operation
     * @return {boolean}
     * @private
     */
    shouldArmCoordinatorCreatedOperationWhileUninitialized(operation) {
      return (
        !!operation?.operationId &&
        !this.isCoordinatorCreatedOperationLocallyOwned(operation) &&
        this.shouldRetryCoordinatorCreatedRemoteHandoff(operation) &&
        this.isDispatchRetryableWorkflowStep(operation)
      );
    }

    buildCoordinatorCreatedRemoteHandoffRetryEvidence(
      operation,
      errorLike,
      options = {},
    ) {
      return COORDINATOR_HANDOFF_RETRY
        .buildCoordinatorCreatedRemoteHandoffRetryEvidence(
          this,
          operation,
          errorLike,
          options,
        );
    }

    resolveCoordinatorCreatedRemoteHandoffRetryAction(evidence) {
      return COORDINATOR_HANDOFF_RETRY
        .resolveCoordinatorCreatedRemoteHandoffRetryAction(evidence);
    }

    deferCoordinatorCreatedRemoteHandoffRetry(
      operation,
      errorLike,
      options = {},
    ) {
      return COORDINATOR_HANDOFF_RETRY
        .deferCoordinatorCreatedRemoteHandoffRetry(
          this,
          operation,
          errorLike,
          options,
        );
    }

    scheduleCoordinatorCreatedRemoteHandoffFollowUp(
      operation,
      delayMs,
      options = {},
    ) {
      if (this.isCoordinatorCreatedOperationLocallyOwned(operation)) {
        return false;
      }
      return super.scheduleCoordinatorCreatedRemoteHandoffFollowUp(
        operation,
        delayMs,
        options,
      );
    }

    deferCoordinatorCreatedOperationTransitionRetry(
      operationId,
      operation,
      error,
      options = {},
    ) {
      return this.deferTransitionRetry(operationId, error, {
        boundary:
          OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_OPERATION,
        workflowStep: operation?.workflowStep || null,
        partitionId: options.partitionId || operation?.partitionId || null,
        updatedAt: operation?.updatedAt,
        createdAt: operation?.createdAt,
        ...(options.includeOperationSnapshot === true ?
          {operationSnapshot: operation} :
          {}),
      });
    }

    /**
     * @param {Object|null} operation
     * @param {Error|Object} error
     * @private
     */
    handleDeferredCoordinatorCreatedRemoteHandoffRetryFailure(
      operation,
      error,
      options = {},
    ) {
      if (
        this.deferCoordinatorCreatedRemoteHandoffRetry(
          operation,
          error,
          options,
        )
      ) {
        return;
      }
      this.logger.error(
        REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_FAILED,
        {
          operationId: operation?.operationId || null,
          partitionId: operation?.partitionId || null,
          ...this.resolveCoordinatorCreatedHandoffDiagnosticDestination(
            operation,
            options,
          ).logFields,
          workflowStep: operation?.workflowStep || null,
          error: error?.message || error?.error || String(error),
          boundary:
            OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF,
        },
      );
    }

    /**
     * @param {Object|null} operation
     * @return {Promise<boolean>}
     * @private
     */
    async wakeCoordinatorCreatedRemoteOwner(operation, options = {}) {
      if (!operation?.operationId) {
        return false;
      }

      const ownerNodeId =
        this.resolveCoordinatorCreatedOperationOwnerNodeId(operation);

      // A self-owned operation must never be woken through the transport to its
      // own `${nodeId}/service/replica-dispatch` ingress. During restart
      // re-init the recovery timer (rebalance-coordinator init) starts before
      // the dispatch-service ingress handler registers (control-plane-setup.js
      // coordinator-init precedes dispatch-service-init), so the router's
      // deliverLocal self short-circuit falls through to a websocket self-send
      // that fails ROUTER_CONNECTION_CLOSED and re-drives forever. Dispatch it
      // in-process on the owner's own lane instead (mirrors the DISPATCH_LOCAL
      // arm; remote follow-up scheduling is already a no-op for self ownership).
      if (ownerNodeId && ownerNodeId === this.nodeId) {
        return this.dispatchSelfOwnedCoordinatorCreatedHandoff(operation);
      }

      if (
        !this.messageRouter ||
        typeof this.messageRouter.deliver !== 'function'
      ) {
        return false;
      }

      const target = this.buildCoordinatorCreatedDispatchIngress(ownerNodeId);
      if (!target) {
        return false;
      }

      const deliveryOptions = {
        targetNodeId: ownerNodeId,
        timeoutMs: this.replicaOperationDispatchTimeoutMs,
        deliverySource:
          OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF,
        responseContext: operation.operationId,
      };
      if (
        classifySystemPartition({
          partitionId: operation.partitionId || null,
        }).priorityControlPlane
      ) {
        deliveryOptions.deliveryPriority =
          OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL;
      }

      try {
        const response = classifyTransportDeliveryOutcome(
          await this.messageRouter.deliver(
            target,
            {
              type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
              [ControlPlaneField.OPERATION_ID]: operation.operationId,
              [ControlPlaneField.OPERATION_ROW]:
                this.buildCoordinatorCreatedDispatchRow(operation),
            },
            deliveryOptions,
          ),
        );

        if (!isDeliveredTransportDeliveryOutcome(response)) {
          const handoffError = response?.error || response;
          if (
            this.deferCoordinatorCreatedRemoteHandoffRetry(
              operation,
              response,
              options,
            )
          ) {
            return false;
          }
          throw new Error(
            this.normalizeErrorMessage(
              handoffError,
              REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
            ),
          );
        }

        if (response?.noHandler === true) {
          return this.handleDroppedNoHandlerWake(operation, options);
        }

        this.resetCreatedOperationHandoffRetryAttempts(operation.operationId);
        this.scheduleCoordinatorCreatedRemoteHandoffFollowUp(
          operation,
          COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS,
          {
            ...options,
            replaceExisting: true,
          },
        );
        return true;
      } catch (error) {
        if (
          this.deferCoordinatorCreatedRemoteHandoffRetry(
            operation,
            error,
            options,
          )
        ) {
          return false;
        }
        throw error;
      }
    }

    /**
     * ACK-before-handler-lookup: the target's router acknowledged the wake
     * but had no dispatch ingress registered (mid-startup) — the wake was
     * DROPPED, not delivered. Treating this as success left run-26's
     * follow-up ledger self-move idle in PENDING for ~9s with zero logs.
     * Route into the warning retry lane; the synthetic deferRetry marks it
     * retryable for the evidence classifier.
     *
     * @param {Object} operation
     * @return {boolean}
     * @private
     */
    handleDroppedNoHandlerWake(operation, options = {}) {
      const noHandlerError = new Error(
        REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
      );
      noHandlerError.deferRetry = true;
      if (
        this.deferCoordinatorCreatedRemoteHandoffRetry(
          operation,
          noHandlerError,
          options,
        )
      ) {
        return false;
      }
      throw noHandlerError;
    }

    /**
     * Honor a late dispatch SERVICE_RESPONSE whose pending waiter was already
     * retired (deferred / ack-timeout) so the coordinator stops re-driving a
     * duplicate dispatch. The late response only confirms the target received
     * and enqueued the dispatch, so this replaces the tight handoff retry with
     * the slower-cadence follow-up the successful-wake path arms; actual
     * completion still arrives through the normal async executor-outcome and
     * reconcile paths. Scoped to coordinator-created remote handoff deliveries
     * that carry the operation id as their response context.
     *
     * @param {Object|null} event
     * @return {Promise<void>}
     */
    async onLateDispatchDeliveryHonored(event) {
      if (
        this.isShuttingDown ||
        event?.deliverySource !==
          OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF
      ) {
        return;
      }
      const operationId = event?.responseContext || null;
      if (
        !operationId ||
        !this.createdOperationHandoffRetryTimerByOperationId.has(operationId)
      ) {
        return;
      }
      try {
        const operation =
          await this.getDeferredDispatchRetryOperation(operationId);
        if (!this.createdOperationHandoffRetryTimerByOperationId.has(operationId)) {
          return;
        }
        if (!operation) {
          // The op row is INVISIBLE (it lives in the ledger partition being
          // moved) — that is no evidence of completion. Clearing here would
          // preempt-cancel the armed follow-up, which is the only re-drive
          // for a dropped wake (run-26). Leave the timer to fire; it retries
          // from the retained snapshot.
          return;
        }
        if (this.repository.isOperationTerminal(operation)) {
          this.clearCreatedOperationHandoffRetry(operationId);
          return;
        }
        this.resetCreatedOperationHandoffRetryAttempts(operationId);
        const handoffMode =
          this.createdOperationHandoffRetryModeByOperationId.get(operationId);
        this.scheduleCoordinatorCreatedRemoteHandoffFollowUp(
          operation,
          COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS,
          {
            ...(handoffMode ? {handoffMode} : {}),
            replaceExisting: true,
          },
        );
      } catch (error) {
        this.logger.debug(
          REBALANCE_COORDINATOR_LOG_MSG.LATE_DISPATCH_HONOR_FAILED,
          {
            operationId,
            error: error?.message || String(error),
          },
        );
      }
    }

    /**
     * Dispatch a coordinator-created operation whose resolved owner is this
     * node on the canonical owner lane instead of the replica-dispatch
     * transport ingress. Routes through dispatchOperation so it acquires the
     * owner single-flight lane (no concurrent double-claim) and honors the
     * initialized/shutdown gate — during restart re-init an uninitialized owner
     * cleanly defers in-process rather than emitting a failing self-send. On a
     * transient error it re-drives through the same transition retry path the
     * DISPATCH_LOCAL arm uses, keeping the wake-up caller contract intact.
     *
     * @param {Object} operation
     * @return {Promise<boolean>}
     * @private
     */
    async dispatchSelfOwnedCoordinatorCreatedHandoff(operation) {
      this.clearCreatedOperationHandoffRetry(operation.operationId);
      try {
        const dispatchResult = await this.dispatchOperation(operation, {
          skipWhenOwnerLaneHeld: true,
        });
        return (
          dispatchResult?.success === true ||
          dispatchResult?.reason ===
            REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING
        );
      } catch (error) {
        if (
          this.deferCoordinatorCreatedOperationTransitionRetry(
            operation.operationId,
            operation,
            error,
            {
              includeOperationSnapshot: true,
              partitionId: operation.partitionId || null,
            },
          )
        ) {
          return false;
        }
        throw error;
      }
    }

    /**
     * Prime a newly created locally owned operation onto the canonical owner
     * transition lane so it does not wait for cache visibility or external
     * dispatch observation before leaving PENDING.
     *
     * Ordinary coordinator-created events remain the dispatch trigger after this
     * hook claims the durable workflow step. Critical system partitions continue
     * directly into dispatch so startup recovery is not pinned behind queue lag.
     *
     * @param {Object|null} operationInput
     * @return {Promise<boolean>}
     */
    async armCoordinatorCreatedOperation(operationInput) {
      const operationId = operationInput?.operationId || null;
      if (!operationId || this.isShuttingDown) {
        return false;
      }
      if (
        !this.isInitialized &&
        !this.shouldArmCoordinatorCreatedOperationWhileUninitialized(
          operationInput,
        )
      ) {
        return false;
      }

      const partitionId = operationInput?.partitionId || null;
      const singleFlightKey =
        this.getOperationOwnerSingleFlightKey(operationId);

      try {
        return await this.operationWorkflowRunExclusive(
          singleFlightKey,
          async () => {
            let operation =
              await this.repository.queryAuthoritativeOperationById(
                operationId,
                {
                  requireOwnerRpcRead: false,
                },
              );
            if (!operation) {
              operation = this.cloneOperationSnapshot(operationInput);
            }

            const armState =
              this.resolveCoordinatorCreatedOperationArmState(operation);
            const armAction =
              this.resolveCoordinatorCreatedOperationArmAction(armState);

            if (
              armAction ===
              COORDINATOR_CREATED_OPERATION_ARM_ACTION
                .CLAIM_AND_APPLY_LOCAL_PRIME
            ) {
              this.clearCreatedOperationHandoffRetry(operationId);
              try {
                const claimedOperation =
                  await this.claimPendingDispatchOperation(operation);
                return this.applyCoordinatorCreatedLocalOperationPrimeAction(
                  claimedOperation,
                );
              } catch (error) {
                if (
                  this.deferCoordinatorCreatedOperationTransitionRetry(
                    operationId,
                    operationInput,
                    error,
                    {partitionId},
                  )
                ) {
                  return false;
                }
                throw error;
              }
            }

            if (
              armAction ===
              COORDINATOR_CREATED_OPERATION_ARM_ACTION.DISPATCH_LOCAL
            ) {
              this.clearCreatedOperationHandoffRetry(operationId);
              try {
                const dispatchResult =
                  await this.dispatchOperationInternal(operation);
                return (
                  dispatchResult?.success === true ||
                  dispatchResult?.reason ===
                    REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING
                );
              } catch (error) {
                if (
                  this.deferCoordinatorCreatedOperationTransitionRetry(
                    operationId,
                    operation,
                    error,
                    {includeOperationSnapshot: true, partitionId},
                  )
                ) {
                  return false;
                }
                throw error;
              }
            }

            if (
              armAction !==
              COORDINATOR_CREATED_OPERATION_ARM_ACTION.WAKE_REMOTE_OWNER
            ) {
              return false;
            }

            const handoffTimeoutDecision =
              this.buildCoordinatorCreatedRemoteHandoffTimeoutDecision(
                operation,
              );
            if (handoffTimeoutDecision.shouldStop) {
              this.clearCreatedOperationHandoffRetry(operationId);
              return false;
            }

            return this.wakeCoordinatorCreatedRemoteOwner(operation);
          },
        );
      } catch (error) {
        if (
          this.deferCoordinatorCreatedRemoteHandoffRetry(operationInput, error)
        ) {
          return false;
        }
        throw error;
      }
    }

    /**
     * @param {Object|null} operation
     * @return {string}
     * @private
     */
    resolveCoordinatorCreatedLocalOperationPrimeState(operation) {
      const partitionId = operation?.partitionId || null;
      const partitionClassification = classifySystemPartition({partitionId});
      if (partitionClassification.systemTable) {
        return COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_STATE
          .CRITICAL_SYSTEM_PARTITION;
      }
      if (partitionClassification.priorityControlPlane) {
        return COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_STATE
          .PRIORITY_CONTROL_PLANE_PARTITION;
      }
      return COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_STATE.DEFAULT;
    }

    /**
     * @param {Object|null} operation
     * @return {string}
     * @private
     */
    resolveCoordinatorCreatedLocalOperationPrimeAction(operation) {
      return COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_ACTION_BY_STATE.get(
        this.resolveCoordinatorCreatedLocalOperationPrimeState(operation),
      ) || COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_ACTION.CLAIM_ONLY;
    }

    /**
     * @param {Object|null} operation
     * @return {string}
     * @private
     */
    resolveCoordinatorCreatedOperationArmState(operation) {
      if (!operation) {
        return COORDINATOR_CREATED_OPERATION_ARM_STATE.UNAVAILABLE;
      }
      if (this.repository.isOperationTerminal(operation)) {
        return COORDINATOR_CREATED_OPERATION_ARM_STATE.TERMINAL;
      }

      const locallyOwned =
        this.isCoordinatorCreatedOperationLocallyOwned(operation);
      const dispatchable = this.isDispatchRetryableWorkflowStep(operation);

      if (locallyOwned && operation.workflowStep === WORKFLOW_STEP.PENDING) {
        return COORDINATOR_CREATED_OPERATION_ARM_STATE.LOCALLY_OWNED_PENDING;
      }
      if (locallyOwned && dispatchable) {
        return (
          COORDINATOR_CREATED_OPERATION_ARM_STATE.LOCALLY_OWNED_DISPATCHABLE
        );
      }
      if (!locallyOwned && dispatchable) {
        return (
          COORDINATOR_CREATED_OPERATION_ARM_STATE.REMOTE_OWNED_DISPATCHABLE
        );
      }
      return COORDINATOR_CREATED_OPERATION_ARM_STATE.UNSUPPORTED_WORKFLOW;
    }

    /**
     * @param {string} armState
     * @return {string}
     * @private
     */
    resolveCoordinatorCreatedOperationArmAction(armState) {
      return COORDINATOR_CREATED_OPERATION_ARM_ACTION_BY_STATE.get(armState) ||
        COORDINATOR_CREATED_OPERATION_ARM_ACTION.SKIP;
    }

    /**
     * @param {Object|null} claimedOperation
     * @return {Promise<boolean>}
     * @private
     */
    async applyCoordinatorCreatedLocalOperationPrimeAction(
      claimedOperation,
    ) {
      if (!claimedOperation) {
        return false;
      }
      const primeAction =
        this.resolveCoordinatorCreatedLocalOperationPrimeAction(
          claimedOperation,
        );
      if (
        primeAction !==
        COORDINATOR_CREATED_LOCAL_OPERATION_PRIME_ACTION.DISPATCH_AFTER_CLAIM
      ) {
        return true;
      }

      const dispatchResult =
        await this.dispatchOperationInternal(claimedOperation);
      return (
        dispatchResult?.success === true ||
        dispatchResult?.reason === REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING
      );
    }
  };
}

export {withOwnerHandoffState};
