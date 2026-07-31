import {
  waitForMetadataPublicationReadiness,
} from '../traffic-readiness-utils.js';

const LOCAL_STR_FUNCTION = 'function';

const CONTROL_PLANE_BACKGROUND_WRITER_RETRY_DELAY_MS = 1000;
const TRANSACTION_RECOVERY_STATE = Object.freeze({
  NOT_STARTED: 'not_started',
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

class StartupRuntimeHandoffOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.controlPlaneBackgroundWriterActivationPromise = null;
    this.controlPlaneBackgroundWriterRetryTimer = null;
    this.transactionRecoveryState = TRANSACTION_RECOVERY_STATE.NOT_STARTED;
    this.transactionRecoverySummary = null;
    this.transactionRecoveryErrorCode = null;
    this.transactionRecoveryErrorMessage = null;
  }

  getCompatibilityService() {
    return this.delegates.getCompatibilityService?.() || null;
  }

  getCompatibilityOverride(methodName) {
    const service = this.getCompatibilityService();
    if (!service || !Object.prototype.hasOwnProperty.call(service, methodName)) {
      return null;
    }

    const override = service[methodName];
    return typeof override === LOCAL_STR_FUNCTION ? override.bind(service) : null;
  }

  hasActiveControlPlaneBackgroundWriters() {
    const override = this.getCompatibilityOverride(
      'hasActiveControlPlaneBackgroundWriters',
    );
    if (override) {
      return override();
    }

    const leaseService = this.delegates.getLeaseService?.() || null;
    const heartbeatService = this.delegates.getHeartbeatService?.() || null;
    const runningLeaseState = this.delegates.getLeaseRunningState?.();
    const runningHeartbeatState = this.delegates.getHeartbeatRunningState?.();

    const leaseRunning = !leaseService || leaseService.state === runningLeaseState;
    const heartbeatRunning = !heartbeatService ||
      heartbeatService.state === runningHeartbeatState;
    return leaseRunning && heartbeatRunning;
  }

  resolveControlPlaneBackgroundWriterRetryDelayMs(error = null) {
    const hintedDelayMs = Number(error?.retryAfterMs);
    if (Number.isFinite(hintedDelayMs) && hintedDelayMs > 0) {
      return Math.max(1, Math.floor(hintedDelayMs));
    }
    const configuredDelayMs = Number(
      this.delegates.getControlPlaneBackgroundWriterRetryDelayMs?.(),
    );
    if (Number.isFinite(configuredDelayMs) && configuredDelayMs > 0) {
      return Math.max(1, Math.floor(configuredDelayMs));
    }
    return CONTROL_PLANE_BACKGROUND_WRITER_RETRY_DELAY_MS;
  }

  clearControlPlaneBackgroundWriterRetryTimer() {
    if (!this.controlPlaneBackgroundWriterRetryTimer) {
      return;
    }
    const clearTimeoutFn = this.delegates.getClearTimeoutFn?.() || clearTimeout;
    clearTimeoutFn(this.controlPlaneBackgroundWriterRetryTimer);
    this.controlPlaneBackgroundWriterRetryTimer = null;
  }

  scheduleControlPlaneBackgroundWriterActivationRetry(error = null) {
    if (this.delegates.isShuttingDown?.() === true) {
      return;
    }
    if (this.hasActiveControlPlaneBackgroundWriters()) {
      return;
    }
    if (this.controlPlaneBackgroundWriterRetryTimer) {
      return;
    }
    const delayMs =
      this.resolveControlPlaneBackgroundWriterRetryDelayMs(error);
    const setTimeoutFn = this.delegates.getSetTimeoutFn?.() || setTimeout;
    this.controlPlaneBackgroundWriterRetryTimer = setTimeoutFn(() => {
      this.controlPlaneBackgroundWriterRetryTimer = null;
      if (this.delegates.isShuttingDown?.() === true ||
          this.hasActiveControlPlaneBackgroundWriters()) {
        return;
      }
      void this.activateControlPlaneBackgroundWriters();
    }, delayMs);
    if (typeof this.controlPlaneBackgroundWriterRetryTimer?.unref === LOCAL_STR_FUNCTION) {
      this.controlPlaneBackgroundWriterRetryTimer.unref();
    }
  }

  async activateControlPlaneBackgroundWriters() {
    const override = this.getCompatibilityOverride(
      'activateControlPlaneBackgroundWriters',
    );
    if (override) {
      return override();
    }

    if (this.delegates.isShuttingDown?.() === true) {
      return;
    }
    if (this.hasActiveControlPlaneBackgroundWriters()) {
      this.clearControlPlaneBackgroundWriterRetryTimer();
      return;
    }
    if (this.controlPlaneBackgroundWriterActivationPromise) {
      return this.controlPlaneBackgroundWriterActivationPromise;
    }
    this.clearControlPlaneBackgroundWriterRetryTimer();

    this.controlPlaneBackgroundWriterActivationPromise = (async () => {
      try {
        const readinessOptions =
          this.delegates.getMetadataPublicationReadinessOptions?.() || null;
        if (readinessOptions) {
          try {
            await waitForMetadataPublicationReadiness(readinessOptions);
          } catch (error) {
            this.delegates.onMetadataPublicationReadinessDeferred?.(error);
            this.scheduleControlPlaneBackgroundWriterActivationRetry(error);
            return;
          }
        }

        if (this.delegates.isShuttingDown?.() === true) {
          return;
        }
        if (this.hasActiveControlPlaneBackgroundWriters()) {
          this.clearControlPlaneBackgroundWriterRetryTimer();
          return;
        }

        this.delegates.beforeActivateControlPlaneBackgroundWriters?.();

        const leaseService = this.delegates.getLeaseService?.() || null;
        if (leaseService) {
          leaseService.start();
          const runningLeaseState = this.delegates.getLeaseRunningState?.();
          if (runningLeaseState !== undefined) {
            leaseService.state = runningLeaseState;
          }
        }

        const heartbeatService = this.delegates.getHeartbeatService?.() || null;
        if (heartbeatService) {
          const heartbeatStartOptions =
            this.delegates.buildHeartbeatStartOptions?.();
          if (heartbeatStartOptions === undefined) {
            heartbeatService.start();
          } else {
            heartbeatService.start(heartbeatStartOptions);
          }
          const runningHeartbeatState = this.delegates.getHeartbeatRunningState?.();
          if (runningHeartbeatState !== undefined) {
            heartbeatService.state = runningHeartbeatState;
          }
        }

        if (this.delegates.activateDistributedTransactionRecoveryOnWriterActivation !== false) {
          this.activateDistributedTransactionRecovery();
        }

        this.clearControlPlaneBackgroundWriterRetryTimer();
        this.delegates.onControlPlaneBackgroundWritersActivated?.();
      } finally {
        this.controlPlaneBackgroundWriterActivationPromise = null;
      }
    })();

    return this.controlPlaneBackgroundWriterActivationPromise;
  }

  recordDistributedTransactionRecoveryFailure(error) {
    this.transactionRecoveryState = TRANSACTION_RECOVERY_STATE.FAILED;
    this.transactionRecoverySummary = null;
    this.transactionRecoveryErrorCode =
      typeof error?.errorCode === 'string' ? error.errorCode : null;
    this.transactionRecoveryErrorMessage =
      error?.message || String(error);
  }

  recordDistributedTransactionRecoveryCompletion(summary) {
    this.transactionRecoveryState = TRANSACTION_RECOVERY_STATE.COMPLETED;
    this.transactionRecoverySummary =
      summary && typeof summary === 'object' ? summary : null;
    this.transactionRecoveryErrorCode = null;
    this.transactionRecoveryErrorMessage = null;
  }

  trackDistributedTransactionRecovery(action) {
    this.transactionRecoveryState = TRANSACTION_RECOVERY_STATE.PENDING;
    this.transactionRecoverySummary = null;
    this.transactionRecoveryErrorCode = null;
    this.transactionRecoveryErrorMessage = null;
    let result;
    try {
      result = action();
    } catch (error) {
      this.recordDistributedTransactionRecoveryFailure(error);
      throw error;
    }
    if (result && typeof result.then === LOCAL_STR_FUNCTION) {
      return result.then((summary) => {
        this.recordDistributedTransactionRecoveryCompletion(summary);
        return summary;
      }).catch((error) => {
        this.recordDistributedTransactionRecoveryFailure(error);
        throw error;
      });
    }
    this.recordDistributedTransactionRecoveryCompletion(result);
    return result;
  }

  getDistributedTransactionRecoverySnapshot() {
    const failedCount = Number(
      this.transactionRecoverySummary?.failed,
    );
    const replayFailed =
      Number.isFinite(failedCount) && failedCount > 0;
    return Object.freeze({
      state: this.transactionRecoveryState,
      ready:
        this.transactionRecoveryState ===
          TRANSACTION_RECOVERY_STATE.COMPLETED &&
        replayFailed !== true,
      summary: this.transactionRecoverySummary,
      errorCode: this.transactionRecoveryErrorCode,
      errorMessage: this.transactionRecoveryErrorMessage,
    });
  }

  activateDistributedTransactionRecovery() {
    if (
      this.delegates.isDistributedTransactionRecoveryAvailable?.() === false
    ) {
      return null;
    }
    const override = this.getCompatibilityOverride(
      'activateDistributedTransactionRecovery',
    );
    if (override) {
      return this.trackDistributedTransactionRecovery(() => override());
    }
    if (
      typeof this.delegates.activateDistributedTransactionRecovery !==
        LOCAL_STR_FUNCTION
    ) {
      return null;
    }
    return this.trackDistributedTransactionRecovery(
      () => this.delegates.activateDistributedTransactionRecovery(),
    );
  }

  flushDeferredCreateSelfHostedMetadata() {
    const override = this.getCompatibilityOverride(
      'flushDeferredCreateSelfHostedMetadata',
    );
    if (override) {
      return override();
    }
    return this.delegates.flushDeferredCreateSelfHostedMetadata?.();
  }

  startLatencyTopologyLifecycle() {
    const override = this.getCompatibilityOverride(
      'startLatencyTopologyLifecycle',
    );
    if (override) {
      return override();
    }
    return this.delegates.startLatencyTopologyLifecycle?.();
  }
}

export {StartupRuntimeHandoffOwner};
