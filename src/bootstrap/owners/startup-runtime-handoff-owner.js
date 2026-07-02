import {
  waitForMetadataPublicationReadiness,
} from '../traffic-readiness-utils.js';

const LOCAL_STR_FUNCTION = 'function';

const CONTROL_PLANE_BACKGROUND_WRITER_RETRY_DELAY_MS = 1000;

class StartupRuntimeHandoffOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.controlPlaneBackgroundWriterActivationPromise = null;
    this.controlPlaneBackgroundWriterRetryTimer = null;
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

  activateDistributedTransactionRecovery() {
    const override = this.getCompatibilityOverride(
      'activateDistributedTransactionRecovery',
    );
    if (override) {
      return override();
    }
    return this.delegates.activateDistributedTransactionRecovery?.();
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
