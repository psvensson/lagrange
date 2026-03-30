import {
  waitForMetadataPublicationReadiness,
} from '../traffic-readiness-utils.js';

class StartupRuntimeHandoffOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.controlPlaneBackgroundWriterActivationPromise = null;
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
    return typeof override === 'function' ? override.bind(service) : null;
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
      return;
    }
    if (this.controlPlaneBackgroundWriterActivationPromise) {
      return this.controlPlaneBackgroundWriterActivationPromise;
    }

    this.controlPlaneBackgroundWriterActivationPromise = (async () => {
      const readinessOptions =
        this.delegates.getMetadataPublicationReadinessOptions?.() || null;
      if (readinessOptions) {
        try {
          await waitForMetadataPublicationReadiness(readinessOptions);
        } catch (error) {
          this.delegates.onMetadataPublicationReadinessDeferred?.(error);
          this.controlPlaneBackgroundWriterActivationPromise = null;
          return;
        }
      }

      if (this.delegates.isShuttingDown?.() === true) {
        this.controlPlaneBackgroundWriterActivationPromise = null;
        return;
      }
      if (this.hasActiveControlPlaneBackgroundWriters()) {
        this.controlPlaneBackgroundWriterActivationPromise = null;
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

      this.controlPlaneBackgroundWriterActivationPromise = null;
      this.delegates.onControlPlaneBackgroundWritersActivated?.();
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