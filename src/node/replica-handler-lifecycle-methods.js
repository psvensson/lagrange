import {observeReleaseReceiver} from './participant-release-hop-observation.js';
/**
 * ReplicaHandler lifecycle + message dispatch methods.
 *
 * Owns initialization and the inbound message router entrypoint that fans
 * out to the create / remove / step-down request handlers.
 *
 * Requirements: 10.2, 3.1
 */
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {OperationType} from '../rebalancer/replica-status.js';
import {CREATE_ADMISSION_ERROR_CODE} from
  './replica-create-admission-owner.js';
import {
  REPLICA_HANDLER_DEFAULT,
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_PARTICIPANT_RELEASE_DISPATCH_KIND as DISPATCH_KIND,
} from './replica-handler-constants.js';
import {PARTICIPANT_RELEASE_ACTION, PARTICIPANT_RELEASE_RESULT_FIELD,
  PARTICIPANT_RELEASE_TYPE} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {captureParticipantReleaseDispatch, receiveParticipantRelease} from
  './replica-handler-participant-release.js';
import {runParticipantCutover} from './replica-handler-participant-cutover.js';
import {claimTerminalFailedCreateTargetCleanup} from
  './replica-handler-failed-create-publication.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const CREATE_ADMISSION_RECOVERY_NOT_STARTED = false;

function invalidCreateOperationResponse(handler) {
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.ERROR,
    {
      error: REPLICA_HANDLER_ERROR_MSG.CREATE_OPERATION_TYPE_REQUIRED,
      errorCode: CREATE_ADMISSION_ERROR_CODE.INVALID,
      nodeId: handler.nodeId,
    },
  );
}

async function dispatchCreateReplicaMessage(handler, payload) {
  const operationType = payload?.[ReplicaOperationField.OPERATION_TYPE];
  const valid = operationType === OperationType.ADD ||
    operationType === OperationType.REPLACE;
  return valid ? handler.handleCreateReplica(payload) :
    invalidCreateOperationResponse(handler);
}

const DIRECT_REPLICA_MESSAGE_HANDLERS = Object.freeze({
  [ReplicaOperationMessageType.REMOVE_REPLICA]: 'handleRemoveReplica',
  [ReplicaOperationMessageType.STEP_DOWN_REPLICA]: 'handleStepDownReplica',
  [ReplicaOperationMessageType.READ_REPLICA_MEMBERSHIP]: 'handleReadReplicaMembership',
  [ReplicaOperationMessageType.RETIRE_REPLICA_PEER]: 'handleRetireReplicaPeer',
  [ReplicaOperationMessageType.READ_COMMITTED_MEMBERSHIP]: 'handleReadCommittedMembership',
  [ReplicaOperationMessageType.CLAIM_FAILED_CREATE_CLEANUP]: 'handleClaimFailedCreateCleanup',
  [ReplicaOperationMessageType.EVALUATE_LEARNER_CATCH_UP]: 'handleEvaluateLearnerCatchUp',
  [ReplicaOperationMessageType.PROPOSE_GROWTH_PROMOTE]: 'handleProposeGrowthPromote',
  [ReplicaOperationMessageType.WITHDRAW_PROMOTION]: 'handleWithdrawPromotion',
  [ReplicaOperationMessageType.REMOVE_LEARNER]: 'handleRemoveLearner',
});

async function dispatchReplicaMessage(handler, type, payload) {
  if (type === ReplicaOperationMessageType.CREATE_REPLICA) {
    return dispatchCreateReplicaMessage(handler, payload);
  }
  const methodName = DIRECT_REPLICA_MESSAGE_HANDLERS[type];
  if (methodName) {
    return handler[methodName](payload);
  }
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.ERROR,
    {error: REPLICA_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE(type)},
  );
}

function assignReplicaHandlerLifecycleMethods(ReplicaHandler) {
  class ReplicaHandlerLifecycleMethods {
    /**
     * Initialize the replica handler.
     */
    initialize() {
      if (this.initialized) {
        return;
      }
      this.logger.info(REPLICA_HANDLER_LOG_MSG.INITIALIZING, {
        nodeId: this.nodeId,
        dataDir: this.dataDir,
      });
      this.initialized = true;
      this.startReplicaCreateAdmissionRecovery();
    }

    // Freeze the first successful pre-admission read for this handler. All
    // callers see the same in-flight or successful read. A deferred read
    // stays closed until the existing startup recovery owner tries again.
    captureStartupCleanupBeforeAdmission() {
      if (this.removedReplicaCleanupAdmissionBarrier && !this.startupCleanupReadDeferred) {
        return this.removedReplicaCleanupAdmissionBarrier;
      }
      this.startupCleanupReadDeferred = false;
      const capture = this.captureRemovedReplicaCleanupStartupAuthorities().then(
        (authorities) => {
          this.throwIfShuttingDown();
          return authorities;
        },
        (error) => {
          this.startupCleanupReadDeferred = true;
          throw error;
        },
      );
      this.removedReplicaCleanupAdmissionBarrier = capture;
      this.removedReplicaCleanupDebtSweepTask = capture.then((authorities) =>
        this.sweepRemovedReplicaCleanupDebt(authorities).finally(() => {
          if (!this.shuttingDown) this.watchGroupRetiredTombstones?.();
        }),
      ).catch((error) => {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVED_CLEANUP_SWEEP_FAILED,
          {nodeId: this.nodeId, error: error.message});
      });
      return capture;
    }

    startReplicaCreateAdmissionRecovery() {
      if (this.shuttingDown) return CREATE_ADMISSION_RECOVERY_NOT_STARTED;
      this.replicaCreateAdmissionRecoveryRearmOwner.cancel();
      const barrier = this.captureStartupCleanupBeforeAdmission().then(() =>
        this.recoverRetainedReplicaCreateAdmissions());
      this.replicaCreateAdmissionRecoveryBarrier = barrier;
      this.replicaCreateAdmissionRecoveryTask = barrier.catch((error) => {
        if (this.shuttingDown) return;
        this.logger.warn(
          REPLICA_HANDLER_LOG_MSG.CREATE_ADMISSION_RECOVERY_FAILED,
          {nodeId: this.nodeId, error: error.message},
        );
        this.replicaCreateAdmissionRecoveryRearmOwner.arm(
          () => this.startReplicaCreateAdmissionRecovery(),
          REPLICA_HANDLER_DEFAULT.CREATE_ADMISSION_RECOVERY_RETRY_MS,
        );
      });
      return barrier;
    }

    async awaitReplicaCreateAdmissionRecoveryBarrier() {
      if (this.replicaCreateAdmissionRecoveryBarrier) {
        await this.replicaCreateAdmissionRecoveryBarrier;
      }
    }

    async handleClaimFailedCreateCleanup(payload) {
      return claimTerminalFailedCreateTargetCleanup(this, payload);
    }
    /**
     * Handle incoming message (called by message router).
     * @param {Object} envelope - Message envelope.
     * @return {Promise<Object>} Response.
     */
    async handleMessage(envelope) {
      const {payload, correlationId} = envelope;
      const captured = captureParticipantReleaseDispatch(payload);
      if (captured.kind === DISPATCH_KIND.MALFORMED) {
        await this.awaitRemovedReplicaCleanupAdmissionBarrier();
        const response = await dispatchReplicaMessage(this, undefined, null);
        return {...response, correlationId};
      }
      const type = captured.kind === DISPATCH_KIND.RELEASE ? PARTICIPANT_RELEASE_TYPE :
        captured.type;
      // Release reads/pause/recovery stay available during bootstrap; this
      // does not authorize create/remove/storage shortcuts.
      if (type === PARTICIPANT_RELEASE_TYPE) {
        const {request, refusal, observationValidated} = captured;
        const response = refusal ??
          await observeReleaseReceiver(this, envelope, request, () =>
            request.action === PARTICIPANT_RELEASE_ACTION.RELEASE ?
            runParticipantCutover(this, request) :
            receiveParticipantRelease(this, request,
              observationValidated));
        return {[PARTICIPANT_RELEASE_RESULT_FIELD]: response, correlationId};
      }
      await this.awaitRemovedReplicaCleanupAdmissionBarrier();
      this.logger.debug(REPLICA_HANDLER_LOG_MSG.MESSAGE_RECEIVED, {
        type,
        correlationId,
        operationId: captured.operationId,
      });
      const response = await dispatchReplicaMessage(this, type, payload);
      // Include correlationId in response for RPC matching; a request's
      // attempt sequence is echoed so the requester drops a late answer of
      // an earlier attempt.
      const attemptSeq = payload?.[ReplicaOperationField.ATTEMPT_SEQ];
      return {
        ...response,
        ...(attemptSeq === undefined ? {} :
          {[ReplicaOperationField.ATTEMPT_SEQ]: attemptSeq}),
        correlationId,
      };
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerLifecycleMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerLifecycleMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerLifecycleMethods};
