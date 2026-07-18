import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../control-plane/owner-contract-outcome.js';
import {
  CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT,
  ControlPlaneField,
  ControlPlaneMessageType,
  getControlPlaneMessageRequiredTables,
  getControlPlaneNodeStatePublicationProfile,
  isHeartbeatEscalatedControlPlaneNodeStatePublicationMode,
  resolveControlPlaneNodeStatePublicationMode,
  resolveReplayControlPlaneNodeStatePublicationMode,
} from '../../control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_KERNEL_INGRESS_LOCAL_TARGET_MODE,
} from '../../control-plane/control-plane-kernel-ingress.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {
  NODE_STATE_UPDATE_RETRY_CLASS,
} from '../../control-plane/replica-dispatch-service-constants.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../../query/query-constants.js';
import {
  STATE,
} from '../../constants/index.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  classifyTransportDeliveryOutcome,
  isDeliveredTransportDeliveryOutcome,
} from '../../transport/transport-semantic-outcome.js';
import {
  NODE_STATE_PUBLICATION_OWNER_LITERAL,
  NODE_STATE_UPDATE_PUBLICATION_DEFER_REASON,
  NODE_STATE_UPDATE_PUBLICATION_DEFER_STATE,
  NODE_STATE_UPDATE_PUBLICATION_PATH,
  NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET,
  buildNodeStateUpdateDeliveryError,
  buildNodeStateUpdatePublicationDiagnostics,
  buildNodeStateUpdatePublicationFailureAction,
  buildNodeStateUpdatePublicationFailureError,
  buildNodeStateUpdatePublicationOutcome,
  createNodeStateUpdateDeferredPublicationState,
} from './node-state-publication-outcome.js';
import {
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
} from '../node-joining-constants.js';

class NodeStatePublicationOwner {
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.nodeAddress = options.nodeAddress || null;
    this.config = options.config || Object.freeze({});
    this.delegates = options.delegates || Object.freeze({});
    this.controlPlaneTargetAddress = null;
    this.pendingClusterMeshReconciliation = null;
    this.nodeStateUpdateDeferredPublication =
      createNodeStateUpdateDeferredPublicationState();
  }

  now() {
    return typeof this.delegates.getNow === 'function' ?
      this.delegates.getNow() :
      Date.now();
  }

  sleep(delayMs) {
    if (typeof this.delegates.getSleep === 'function') {
      return this.delegates.getSleep()(delayMs);
    }
    return Promise.resolve();
  }

  logger() {
    return typeof this.delegates.getLogger === 'function' ?
      this.delegates.getLogger() :
      console;
  }

  messageRouter() {
    return typeof this.delegates.getMessageRouter === 'function' ?
      this.delegates.getMessageRouter() :
      null;
  }

  controlPlaneKernelIngress() {
    return typeof this.delegates.getControlPlaneKernelIngress ===
        'function' ?
      this.delegates.getControlPlaneKernelIngress() :
      null;
  }

  getNodeCapabilities() {
    return typeof this.delegates.getNodeCapabilities === 'function' ?
      this.delegates.getNodeCapabilities() :
      [];
  }

  resolveNodeStateUpdateTargetCandidates(options = {}) {
    const controlPlaneKernelIngress = this.controlPlaneKernelIngress();
    if (typeof controlPlaneKernelIngress?.resolveNodeStateUpdateTargetCandidates !==
        'function') {
      return [];
    }
    return controlPlaneKernelIngress.resolveNodeStateUpdateTargetCandidates({
      ...options,
      allowBootstrapHints: true,
      localTargetMode:
        CONTROL_PLANE_KERNEL_INGRESS_LOCAL_TARGET_MODE.ANY_REPLICA,
      requiredTables: getControlPlaneMessageRequiredTables(
        ControlPlaneMessageType.NODE_STATE_UPDATE,
      ),
    });
  }

  shouldRetryControlPlaneNodeStateUpdate(error, publicationMode = null) {
    if (isHeartbeatEscalatedControlPlaneNodeStatePublicationMode(
      publicationMode,
    )) {
      return isRetryableControlPlaneError(error);
    }
    const message = typeof error?.message === 'string' ? error.message : '';
    return message.includes(
      NODE_STATE_PUBLICATION_OWNER_LITERAL.NO_CONNECTION_TO_NODE,
    ) ||
      message.includes(
        NODE_STATE_PUBLICATION_OWNER_LITERAL.CONNECTION_TO_NODE,
      ) &&
      message.includes(
        NODE_STATE_PUBLICATION_OWNER_LITERAL.CLOSED,
      ) ||
      message.includes(
        NODE_STATE_PUBLICATION_OWNER_LITERAL.MESSAGE_TIMEOUT,
      ) ||
      message.includes(
        NODE_STATE_PUBLICATION_OWNER_LITERAL.NO_HANDLER_REGISTERED_FOR_ADDRESS,
      ) ||
      message.includes(JOINING_ERROR_MSG.CONTROL_PLANE_TARGET_MISSING);
  }

  resolveNodeStateUpdatePublicationRetryClass(error) {
    const errorCode = getControlPlaneErrorCode(error);
    const errorMessage = getControlPlaneErrorMessage(error);
    if (errorCode === QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE ||
        errorMessage.includes(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE) ||
        errorMessage.includes(QUERY_ERROR_MSG.QUERY_ROUTING_FAILED) ||
        errorMessage.includes(QUERY_ERROR_MSG.NO_ACTIVE_SERVICE_FOR_PARTITION)) {
      return NODE_STATE_UPDATE_RETRY_CLASS.PUBLICATION_PRESSURE;
    }
    return NODE_STATE_UPDATE_RETRY_CLASS.TRANSIENT;
  }

  shouldDeferNodeStateUpdatePublication(error, publicationProfile = null) {
    if (publicationProfile?.deferOnPressure !== true) {
      return false;
    }
    return this.resolveNodeStateUpdatePublicationRetryClass(error) ===
      NODE_STATE_UPDATE_RETRY_CLASS.PUBLICATION_PRESSURE;
  }

  resolveNodeStateUpdatePublicationRetryAfterMs(error) {
    const retryAfterMs = getControlPlaneRetryAfterMs(error);
    if (retryAfterMs > 0) {
      return Math.max(1, Math.floor(retryAfterMs));
    }
    const configuredRetryAfterMs = Number(this.config?.readySignalRetryDelayMs);
    if (Number.isFinite(configuredRetryAfterMs) && configuredRetryAfterMs > 0) {
      return Math.floor(configuredRetryAfterMs);
    }
    return JOINING_DEFAULT.readySignalRetryDelayMs;
  }

  clearDeferredNodeStateUpdatePublication() {
    this.nodeStateUpdateDeferredPublication =
      createNodeStateUpdateDeferredPublicationState();
  }

  buildDeferredNodeStateUpdatePublicationOutcome(deferredPublication, nowMs) {
    const remainingRetryAfterMs = Math.max(
      0,
      deferredPublication.nextAttemptAtMs - nowMs,
    );
    const publicationDiagnostics =
      deferredPublication.publicationDiagnostics ||
      Object.freeze({
        publicationPath: NODE_STATE_UPDATE_PUBLICATION_PATH,
        nodeStatePublicationMode: deferredPublication.publicationMode,
      });
    const reasonCodes =
      deferredPublication.reason !==
        NODE_STATE_UPDATE_PUBLICATION_DEFER_REASON.NONE ?
        Object.freeze([deferredPublication.reason]) :
        Object.freeze([]);
    return buildNodeStateUpdatePublicationOutcome({
      contractState: OWNER_CONTRACT_STATE.DEFERRED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
      reasonCodes,
      retryAfterMs: remainingRetryAfterMs,
      nextAttemptAtMs: deferredPublication.nextAttemptAtMs,
      publicationMode: deferredPublication.publicationMode,
      publicationDiagnostics,
    });
  }

  resolveDeferredNodeStateUpdatePublicationOutcome(
    message,
    publicationMode,
    publicationProfile,
  ) {
    if (publicationProfile?.deferOnPressure !== true) {
      return null;
    }
    const deferredPublication = this.nodeStateUpdateDeferredPublication;
    if (deferredPublication.state !==
        NODE_STATE_UPDATE_PUBLICATION_DEFER_STATE.PENDING) {
      return null;
    }
    const nowMs = this.now();
    if (nowMs >= deferredPublication.nextAttemptAtMs) {
      this.clearDeferredNodeStateUpdatePublication();
      return null;
    }
    const deferredPublicationMode =
      resolveReplayControlPlaneNodeStatePublicationMode({
        publicationMode,
        heartbeatOnly: message?.[ControlPlaneField.HEARTBEAT_ONLY] === true,
        replayContext:
          CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT.DEFERRED_PENDING,
        state: message?.[ControlPlaneField.STATE],
      });
    const deferredMessage = deferredPublicationMode === publicationMode ?
      message :
      {
        ...message,
        [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]:
          deferredPublicationMode,
      };
    deferredPublication.message = deferredMessage;
    deferredPublication.publicationMode = deferredPublicationMode;
    deferredPublication.publicationDiagnostics = Object.freeze({
      ...(deferredPublication.publicationDiagnostics || Object.freeze({
        publicationPath: NODE_STATE_UPDATE_PUBLICATION_PATH,
      })),
      nodeStatePublicationMode: deferredPublicationMode,
    });
    this.logger().debug(JOINING_LOG_MSG.NODE_STATE_UPDATE_DEFERRED, {
      nodeId: this.nodeId,
      publicationMode: deferredPublicationMode,
      retryAfterMs: Math.max(
        0,
        deferredPublication.nextAttemptAtMs - nowMs,
      ),
      nextAttemptAtMs: deferredPublication.nextAttemptAtMs,
      reason: deferredPublication.reason,
    });
    return this.buildDeferredNodeStateUpdatePublicationOutcome(
      deferredPublication,
      nowMs,
    );
  }

  deferNodeStateUpdatePublication(options = {}) {
    const retryAfterMs =
      this.resolveNodeStateUpdatePublicationRetryAfterMs(options.error);
    const nowMs = this.now();
    const nextAttemptAtMs = nowMs + retryAfterMs;
    const deferredPublicationMode =
      resolveReplayControlPlaneNodeStatePublicationMode({
        publicationMode: options.publicationMode,
        heartbeatOnly:
          options.message?.[ControlPlaneField.HEARTBEAT_ONLY] === true,
        replayContext:
          CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT.DEFERRED_PENDING,
        state: options.message?.[ControlPlaneField.STATE],
      });
    const deferredMessage =
      deferredPublicationMode === options.publicationMode ?
        options.message :
        {
          ...options.message,
          [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]:
            deferredPublicationMode,
        };
    const publicationDiagnostics = Object.freeze({
      publicationPath: NODE_STATE_UPDATE_PUBLICATION_PATH,
      ...(options.publicationDiagnostics || Object.freeze({})),
      nodeStatePublicationMode: deferredPublicationMode,
    });
    this.nodeStateUpdateDeferredPublication =
      createNodeStateUpdateDeferredPublicationState({
        state: NODE_STATE_UPDATE_PUBLICATION_DEFER_STATE.PENDING,
        reason: NODE_STATE_UPDATE_PUBLICATION_DEFER_REASON.PUBLICATION_PRESSURE,
        retryAfterMs,
        nextAttemptAtMs,
        message: deferredMessage,
        publicationMode: deferredPublicationMode,
        publicationDiagnostics,
      });
    this.logger().warn(JOINING_LOG_MSG.NODE_STATE_UPDATE_DEFERRED, {
      nodeId: this.nodeId,
      targetAddress: options.publicationDiagnostics?.targetAddress || null,
      state: options.state,
      publicationMode: deferredPublicationMode,
      retryAfterMs,
      nextAttemptAtMs,
      reason: NODE_STATE_UPDATE_PUBLICATION_DEFER_REASON.PUBLICATION_PRESSURE,
      error: options.error?.message || null,
    });
    return this.buildDeferredNodeStateUpdatePublicationOutcome(
      this.nodeStateUpdateDeferredPublication,
      nowMs,
    );
  }

  async sendControlPlaneNodeStateUpdate(options = {}) {
    const state = options.state;
    if (!state) {
      return;
    }

    this.triggerBackgroundClusterMeshReconciliation(state);

    const publicationMode = resolveControlPlaneNodeStatePublicationMode({
      publicationMode: options.nodeStatePublicationMode,
      heartbeatOnly: options.heartbeatOnly === true,
      state,
    });
    const publicationProfile = getControlPlaneNodeStatePublicationProfile({
      publicationMode,
    });
    const message = {
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: this.nodeId,
      [ControlPlaneField.NODE_ADDRESS]: this.nodeAddress,
      [ControlPlaneField.CAPABILITIES]:
        options.capabilities ?? this.getNodeCapabilities(),
      [ControlPlaneField.STATE]: state,
      [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]: publicationMode,
    };

    if (options.heartbeatOnly === true) {
      message[ControlPlaneField.HEARTBEAT_ONLY] = true;
    }
    if (Number.isFinite(options.heartbeatAt)) {
      message[ControlPlaneField.HEARTBEAT_AT] = options.heartbeatAt;
    }
    if (Number.isFinite(options.readyLeaseExpiresAt)) {
      message[ControlPlaneField.READY_LEASE_EXPIRES_AT] =
        options.readyLeaseExpiresAt;
    }
    if (options.nodeRow && typeof options.nodeRow === 'object') {
      message[ControlPlaneField.NODE_ROW] = options.nodeRow;
    }

    const deferredOutcome =
      this.resolveDeferredNodeStateUpdatePublicationOutcome(
        message,
        publicationMode,
        publicationProfile,
      );
    if (deferredOutcome) {
      return deferredOutcome;
    }

    let targetCandidates =
      this.resolveNodeStateUpdateTargetCandidates({
        state,
        heartbeatAt: options.heartbeatAt,
      });
    if (!Array.isArray(targetCandidates)) {
      targetCandidates = [];
    }
    if (targetCandidates.length === 0 &&
        typeof this.delegates.resolveLegacyTargetCandidates ===
          'function') {
      const legacyTargetCandidates =
        this.delegates.resolveLegacyTargetCandidates({
          allowBootstrapHints: true,
          allowSelfTarget: false,
        });
      if (Array.isArray(legacyTargetCandidates)) {
        targetCandidates = legacyTargetCandidates.filter(
          (candidate, index, list) => {
            return list.indexOf(candidate) === index;
          },
        );
      }
    }
    if (targetCandidates.length === 0) {
      const publicationDiagnostics = Object.freeze({
        publicationPath: NODE_STATE_UPDATE_PUBLICATION_PATH,
        nodeStatePublicationMode: publicationMode,
      });
      const failureAction = buildNodeStateUpdatePublicationFailureAction({
        contractState: OWNER_CONTRACT_STATE.FAILED,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
      });
      this.logger().warn(JOINING_LOG_MSG.READY_SIGNAL_TARGET_MISSING, {
        nodeId: this.nodeId,
        state,
        publicationMode,
      });
      throw buildNodeStateUpdatePublicationFailureError(
        new Error(JOINING_ERROR_MSG.CONTROL_PLANE_TARGET_MISSING),
        publicationDiagnostics,
        failureAction,
      );
    }

    const deliveryTimeoutBudgetMs =
      typeof this.delegates.resolveNodeStateUpdateTimeoutMs ===
          'function' ?
        this.delegates.resolveNodeStateUpdateTimeoutMs(options) :
        null;
    const deliveryDeadlineMs =
      Number.isFinite(deliveryTimeoutBudgetMs) ?
        this.now() + deliveryTimeoutBudgetMs :
        null;
    let lastError = null;
    let sameTargetRetryCount = 0;

    for (let attempt = 0; attempt < targetCandidates.length; attempt++) {
      const targetAddress = targetCandidates[attempt];
      if (this.controlPlaneTargetAddress &&
          this.controlPlaneTargetAddress !== targetAddress) {
        this.logger().info(JOINING_LOG_MSG.CONTROL_PLANE_TARGET_UPDATED, {
          nodeId: this.nodeId,
          previousTargetAddress: this.controlPlaneTargetAddress,
          targetAddress,
          state,
          publicationMode,
        });
      }
      this.controlPlaneTargetAddress = targetAddress;

      const publicationDiagnostics =
        buildNodeStateUpdatePublicationDiagnostics(
          targetAddress,
          publicationMode,
        );

      try {
        const remainingAttempts = targetCandidates.length - attempt;
        const deliveryTimeoutMs = Number.isFinite(deliveryDeadlineMs) ?
          Math.max(
            1,
            Math.floor(
              Math.max(0, deliveryDeadlineMs - this.now()) /
                Math.max(1, remainingAttempts),
            ),
          ) :
          deliveryTimeoutBudgetMs;
        const deliveryResult = classifyTransportDeliveryOutcome(
          await this.messageRouter().deliver(
            targetAddress,
            message,
            {
              deliveryPriority: publicationProfile.deliveryPriority,
              timeoutMs: deliveryTimeoutMs,
            },
          ),
        );
        if (!isDeliveredTransportDeliveryOutcome(deliveryResult) ||
            deliveryResult?.reasonCode ===
              TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER) {
          throw buildNodeStateUpdateDeliveryError(
            deliveryResult,
            targetAddress,
          );
        }

        this.clearDeferredNodeStateUpdatePublication();
        this.logger().info(JOINING_LOG_MSG.NODE_STATE_UPDATE_SENT, {
          nodeId: this.nodeId,
          targetAddress,
          state,
          publicationMode,
        });
        if (typeof this.controlPlaneKernelIngress()?.noteSuccessfulTarget ===
            'function') {
          this.controlPlaneKernelIngress().noteSuccessfulTarget(targetAddress);
        }
        return buildNodeStateUpdatePublicationOutcome({
          publicationMode,
          publicationDiagnostics,
        });
      } catch (error) {
        error.publicationDiagnostics = publicationDiagnostics;
        lastError = error;
        const retryAfterMs = getControlPlaneRetryAfterMs(error);
        const retryableTargetFailure =
          this.shouldRetryControlPlaneNodeStateUpdate(
            error,
            publicationMode,
          );
        const isFinalAttempt = attempt >= targetCandidates.length - 1;
        const shouldRetryAlternateTargetBeforeDeferring =
          options.heartbeatOnly === true &&
          isFinalAttempt !== true &&
          this.shouldDeferNodeStateUpdatePublication(
            error,
            publicationProfile,
          );
        const shouldRetryAlternateTarget = !isFinalAttempt &&
          (retryableTargetFailure || shouldRetryAlternateTargetBeforeDeferring);
        const shouldRetrySameTarget = isFinalAttempt &&
          sameTargetRetryCount < 1 &&
          retryableTargetFailure &&
          (options.heartbeatOnly !== true ||
            isHeartbeatEscalatedControlPlaneNodeStatePublicationMode(
              publicationMode,
            ));
        const failureAction = shouldRetryAlternateTargetBeforeDeferring ?
          buildNodeStateUpdatePublicationFailureAction({
            contractState: OWNER_CONTRACT_STATE.PENDING,
            nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
            retryTarget:
              NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET
                .ALTERNATE_TARGET,
            retryAfterMs,
          }) :
          this.shouldDeferNodeStateUpdatePublication(
            error,
            publicationProfile,
          ) ?
            buildNodeStateUpdatePublicationFailureAction({
              contractState: OWNER_CONTRACT_STATE.DEFERRED,
              nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
              retryTarget:
              NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET.DEFERRED_SLOT,
              retryAfterMs,
            }) :
            shouldRetrySameTarget ?
              buildNodeStateUpdatePublicationFailureAction({
                contractState: OWNER_CONTRACT_STATE.PENDING,
                nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
                retryTarget:
                NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET.SAME_TARGET,
                retryAfterMs,
              }) :
              shouldRetryAlternateTarget ?
                buildNodeStateUpdatePublicationFailureAction({
                  contractState: OWNER_CONTRACT_STATE.PENDING,
                  nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
                  retryTarget:
                  NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET
                    .ALTERNATE_TARGET,
                  retryAfterMs,
                }) :
                buildNodeStateUpdatePublicationFailureAction({
                  contractState: OWNER_CONTRACT_STATE.FAILED,
                  nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
                  retryAfterMs,
                });

        if (failureAction.retryTarget ===
            NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET.DEFERRED_SLOT) {
          if (typeof this.controlPlaneKernelIngress()?.invalidateTarget ===
              'function') {
            this.controlPlaneKernelIngress().invalidateTarget(targetAddress);
          }
          this.controlPlaneTargetAddress = null;
          return this.deferNodeStateUpdatePublication({
            error,
            message,
            publicationMode,
            publicationDiagnostics,
            state,
          });
        }

        if (failureAction.retryTarget ===
            NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET.SAME_TARGET) {
          sameTargetRetryCount += 1;
          if (failureAction.retryAfterMs > 0) {
            await this.sleep(failureAction.retryAfterMs);
          }
          if (typeof this.controlPlaneKernelIngress()?.invalidateTarget ===
              'function') {
            this.controlPlaneKernelIngress().invalidateTarget(targetAddress);
          }
          this.logger().warn(JOINING_LOG_MSG.NODE_STATE_UPDATE_RETRYING, {
            nodeId: this.nodeId,
            targetAddress,
            nextTargetAddress: targetAddress,
            state,
            publicationMode,
            attempt: attempt + 1,
            maxAttempts: targetCandidates.length + sameTargetRetryCount,
            retryAfterMs: failureAction.retryAfterMs,
            error: error.message,
          });
          this.controlPlaneTargetAddress = null;
          targetCandidates.push(targetAddress);
          continue;
        }

        if (failureAction.retryTarget ===
            NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET.ALTERNATE_TARGET) {
          if (typeof this.controlPlaneKernelIngress()?.invalidateTarget ===
              'function') {
            this.controlPlaneKernelIngress().invalidateTarget(targetAddress);
          }
          this.logger().warn(JOINING_LOG_MSG.NODE_STATE_UPDATE_RETRYING, {
            nodeId: this.nodeId,
            targetAddress,
            nextTargetAddress: targetCandidates[attempt + 1],
            state,
            publicationMode,
            attempt: attempt + 1,
            maxAttempts: targetCandidates.length,
            error: error.message,
          });
          this.controlPlaneTargetAddress = null;
          continue;
        }

        this.logger().error(JOINING_LOG_MSG.NODE_STATE_UPDATE_FAILED, {
          nodeId: this.nodeId,
          targetAddress,
          state,
          publicationMode,
          error: error.message,
        });
        throw buildNodeStateUpdatePublicationFailureError(
          error,
          publicationDiagnostics,
          failureAction,
        );
      }
    }

    throw lastError;
  }

  triggerBackgroundClusterMeshReconciliation(state) {
    const normalizedState = String(state || '').toLowerCase();
    if (!this.messageRouter() ||
        normalizedState === STATE.DISCONNECTED ||
        normalizedState === NODE_STATE_PUBLICATION_OWNER_LITERAL.FAILED ||
        normalizedState ===
          NODE_STATE_PUBLICATION_OWNER_LITERAL.SHUTTING_DOWN ||
        normalizedState === NODE_STATE_PUBLICATION_OWNER_LITERAL.STOPPED ||
        typeof this.delegates.shouldReconnectClusterMesh !== 'function' ||
        this.delegates.shouldReconnectClusterMesh() !== true) {
      return;
    }
    if (this.pendingClusterMeshReconciliation) {
      return;
    }
    const reconciliation = Promise.resolve()
      .then(() => this.delegates.connectToClusterNodes())
      .catch((error) => {
        this.logger().warn(
          NODE_STATE_PUBLICATION_OWNER_LITERAL
            .FAILED_CLUSTER_MESH_RECONCILIATION,
          {
            nodeId: this.nodeId,
            state,
            error: error.message,
          },
        );
      })
      .finally(() => {
        if (this.pendingClusterMeshReconciliation === reconciliation) {
          this.pendingClusterMeshReconciliation = null;
        }
      });
    this.pendingClusterMeshReconciliation = reconciliation;
  }
}

export {
  NodeStatePublicationOwner,
  NODE_STATE_UPDATE_PUBLICATION_DEFER_REASON,
  NODE_STATE_UPDATE_PUBLICATION_DEFER_STATE,
  NODE_STATE_UPDATE_PUBLICATION_PATH,
  NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET,
  buildNodeStateUpdateDeliveryError,
  buildNodeStateUpdatePublicationDiagnostics,
  buildNodeStateUpdatePublicationFailureAction,
  buildNodeStateUpdatePublicationFailureError,
  buildNodeStateUpdatePublicationOutcome,
  createNodeStateUpdateDeferredPublicationState,
};
