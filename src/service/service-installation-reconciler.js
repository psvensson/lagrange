import {createHash} from 'node:crypto';

import {RUNTIME_KIND} from '../constants/runtime.js';
import {
  SERVICE_INSTALL_DESIRED_STATE,
  SERVICE_INSTALL_FAILURE_CODE,
  SERVICE_INSTALL_FAILURE_PHASE,
  SERVICE_INSTALL_ROLLOUT_STATE,
} from '../control-plane/owners/service-install-catalog-owner.js';
import {resolveTimeSource} from '../time/time-source.js';

const FAILURE_ID_NAMESPACE = 'service-installation-reconciler/v1';
const SHA256_PREFIX = 'sha256:';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const TEXT_ENCODING = 'utf8';
const FAILURE_ID_SEPARATOR = '\n';
const DEFAULT_SWEEP_INTERVAL_MS = 5_000;
const ASYNC_STATE = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});
const INACTIVE_ASYNC_HANDLE = Object.freeze({state: ASYNC_STATE.INACTIVE});
const COMPLETED_OPERATION = Promise.resolve();
const ERROR_MESSAGE = Object.freeze({
  CATALOG_OWNER_REQUIRED:
    'ServiceInstallationReconciler requires an authoritative catalog owner',
  INSTALLATION_RECONCILIATION_FAILED: 'Installation reconciliation failed',
  INSTALLATION_SCAN_FAILED: 'Authoritative installation scan failed',
});
const SUPPORTED_PHASE_ONE_RUNTIME_KINDS = new Set([
  RUNTIME_KIND.OCI_CONTAINER,
  RUNTIME_KIND.WASM_COMPONENT,
]);
const UNSUPPORTED_ACTIVATION_ROLLOUT_STATES = new Set([
  SERVICE_INSTALL_ROLLOUT_STATE.RECORDED_NOT_RUNNING,
  SERVICE_INSTALL_ROLLOUT_STATE.PENDING,
  SERVICE_INSTALL_ROLLOUT_STATE.RECONCILING,
  SERVICE_INSTALL_ROLLOUT_STATE.FAILED,
]);
const NEVER_ACTIVATED_REMOVAL_STATES = new Set([
  SERVICE_INSTALL_ROLLOUT_STATE.RECORDED_NOT_RUNNING,
  SERVICE_INSTALL_ROLLOUT_STATE.FAILED,
]);
const REQUIRED_CATALOG_METHODS = Object.freeze([
  'listInstallations',
  'getRevision',
  'getPackage',
  'getFailure',
  'recordFailure',
  'recordRolloutOutcome',
]);

function buildUnsupportedActivationFailureId(installation) {
  const identity = [
    FAILURE_ID_NAMESPACE,
    installation.installationId,
    installation.revisionId,
    SERVICE_INSTALL_FAILURE_CODE.ACTIVATION_UNSUPPORTED,
    SERVICE_INSTALL_FAILURE_PHASE.ACTIVATION,
  ].join(FAILURE_ID_SEPARATOR);
  return SHA256_PREFIX + createHash(HASH_ALGORITHM)
    .update(identity, TEXT_ENCODING)
    .digest(HASH_ENCODING);
}

function isServiceInstallCatalogOwnerCompatible(catalogOwner) {
  return Boolean(catalogOwner) && REQUIRED_CATALOG_METHODS.every(
    (method) => typeof catalogOwner[method] === 'function',
  );
}

function isExpectedFailure(failure, installation, failureId) {
  return failure !== null &&
    failure.failureId === failureId &&
    failure.installationId === installation.installationId &&
    failure.revisionId === installation.revisionId &&
    failure.code === SERVICE_INSTALL_FAILURE_CODE.ACTIVATION_UNSUPPORTED &&
    failure.phase === SERVICE_INSTALL_FAILURE_PHASE.ACTIVATION &&
    failure.retryable === false;
}

class ServiceInstallationReconciler {
  constructor(options = {}) {
    if (!isServiceInstallCatalogOwnerCompatible(options.catalogOwner)) {
      throw new TypeError(ERROR_MESSAGE.CATALOG_OWNER_REQUIRED);
    }
    this.catalogOwner = options.catalogOwner;
    this.timeSource = resolveTimeSource(options);
    this.sweepIntervalMs = Number.isSafeInteger(options.sweepIntervalMs) &&
      options.sweepIntervalMs > 0 ?
      options.sweepIntervalMs : DEFAULT_SWEEP_INTERVAL_MS;
    this.logger = options.logger || console;
    this._isLeader = false;
    this._shutdown = false;
    this._generation = 0;
    this._sweepTimerState = INACTIVE_ASYNC_HANDLE;
    this._drainState = INACTIVE_ASYNC_HANDLE;
    this._rerunRequested = false;
    this._installationFlights = new Map();
  }

  setLeader(isLeader) {
    if (this._shutdown) return COMPLETED_OPERATION;
    if (isLeader !== true) {
      this._isLeader = false;
      this._generation += 1;
      this._rerunRequested = false;
      this._clearSweepTimer();
      return COMPLETED_OPERATION;
    }
    if (!this._isLeader) {
      this._isLeader = true;
      this._generation += 1;
      this._startSweepTimer();
    }
    return this.reconcileNow();
  }

  reconcileNow() {
    if (!this._isCurrentGeneration(this._generation)) {
      return COMPLETED_OPERATION;
    }
    if (this._drainState.state === ASYNC_STATE.ACTIVE) {
      this._rerunRequested = true;
      return this._drainState.promise;
    }
    const promise = this._drain().finally(() => {
      if (this._drainState.promise === promise) {
        this._drainState = INACTIVE_ASYNC_HANDLE;
      }
    });
    this._drainState = {state: ASYNC_STATE.ACTIVE, promise};
    return promise;
  }

  enqueueInstallation(installation) {
    const generation = this._generation;
    if (!this._isCurrentGeneration(generation)) return COMPLETED_OPERATION;
    return this._runInstallationSingleFlight(installation, generation);
  }

  whenIdle() {
    return this._drainState.state === ASYNC_STATE.ACTIVE ?
      this._drainState.promise :
      COMPLETED_OPERATION;
  }

  isShutdown() {
    return this._shutdown;
  }

  shutdown() {
    if (this._shutdown) return;
    this._shutdown = true;
    this._isLeader = false;
    this._generation += 1;
    this._rerunRequested = false;
    this._clearSweepTimer();
  }

  async _drain() {
    do {
      this._rerunRequested = false;
      const generation = this._generation;
      await this._runSweep(generation);
    } while (this._rerunRequested &&
      this._isCurrentGeneration(this._generation));
  }

  async _runSweep(generation) {
    if (!this._isCurrentGeneration(generation)) return;
    let installations;
    try {
      installations = await this.catalogOwner.listInstallations();
    } catch (error) {
      this._logError(ERROR_MESSAGE.INSTALLATION_SCAN_FAILED, error);
      return;
    }
    if (!this._isCurrentGeneration(generation)) return;
    await Promise.all(installations.map((installation) =>
      this._runInstallationSingleFlight(installation, generation)));
  }

  _runInstallationSingleFlight(installation, generation) {
    const installationId = installation?.installationId;
    if (typeof installationId !== 'string' || installationId.length === 0) {
      return COMPLETED_OPERATION;
    }
    const active = this._installationFlights.get(installationId);
    if (active) return active;
    const operation = this._reconcileInstallation(installation, generation)
      .catch((error) => {
        this._logError(ERROR_MESSAGE.INSTALLATION_RECONCILIATION_FAILED, error, {
          installationId,
        });
      })
      .finally(() => {
        if (this._installationFlights.get(installationId) === operation) {
          this._installationFlights.delete(installationId);
        }
      });
    this._installationFlights.set(installationId, operation);
    return operation;
  }

  async _reconcileInstallation(installation, generation) {
    if (!this._isCurrentGeneration(generation)) return;
    if (installation.desiredState === SERVICE_INSTALL_DESIRED_STATE.REMOVED) {
      await this._reconcileRemoval(installation, generation);
      return;
    }
    if (installation.desiredState !== SERVICE_INSTALL_DESIRED_STATE.ACTIVE &&
        installation.desiredState !== SERVICE_INSTALL_DESIRED_STATE.INSTALLED) {
      return;
    }
    if (!UNSUPPORTED_ACTIVATION_ROLLOUT_STATES.has(
      installation.rolloutState,
    )) return;
    await this._reconcileUnsupportedActivation(installation, generation);
  }

  async _reconcileRemoval(installation, generation) {
    let rolloutState = installation.rolloutState;
    if (rolloutState === SERVICE_INSTALL_ROLLOUT_STATE.REMOVED) return;
    if (rolloutState !== SERVICE_INSTALL_ROLLOUT_STATE.REMOVING) {
      if (!NEVER_ACTIVATED_REMOVAL_STATES.has(rolloutState)) return;
      const removing = await this.catalogOwner.recordRolloutOutcome({
        installationId: installation.installationId,
        rolloutState: SERVICE_INSTALL_ROLLOUT_STATE.REMOVING,
      });
      if (!this._isCurrentGeneration(generation)) return;
      rolloutState = removing.rolloutState;
    }
    if (rolloutState !== SERVICE_INSTALL_ROLLOUT_STATE.REMOVING) return;
    await this.catalogOwner.recordRolloutOutcome({
      installationId: installation.installationId,
      rolloutState: SERVICE_INSTALL_ROLLOUT_STATE.REMOVED,
    });
  }

  async _reconcileUnsupportedActivation(installation, generation) {
    const failureId = buildUnsupportedActivationFailureId(installation);
    if (installation.latestFailureId === failureId) {
      await this._repairPersistedUnsupportedFailure(
        installation,
        failureId,
        generation,
      );
      return;
    }
    if (installation.latestFailureId !== null) return;
    if (!await this._hasSupportedPhaseOnePackage(installation, generation)) {
      return;
    }
    if (!await this._isFailureIdentityAvailable(
      installation,
      failureId,
      generation,
    )) return;
    const result = await this.catalogOwner.recordFailure({
      failureId,
      installationId: installation.installationId,
      failureCode: SERVICE_INSTALL_FAILURE_CODE.ACTIVATION_UNSUPPORTED,
      failurePhase: SERVICE_INSTALL_FAILURE_PHASE.ACTIVATION,
      retryable: false,
    });
    if (!this._isCurrentGeneration(generation)) return;
    if (result?.installation?.latestFailureId === failureId &&
        result.installation.rolloutState ===
          SERVICE_INSTALL_ROLLOUT_STATE.FAILED) {
      await this._settleRecordedNotRunning(result.installation, generation);
    }
  }

  async _hasSupportedPhaseOnePackage(installation, generation) {
    const revision = await this.catalogOwner.getRevision(
      installation.revisionId,
    );
    if (!this._isCurrentGeneration(generation) || revision === null) {
      return false;
    }
    const servicePackage = await this.catalogOwner.getPackage(revision.packageId);
    return this._isCurrentGeneration(generation) && servicePackage !== null &&
      SUPPORTED_PHASE_ONE_RUNTIME_KINDS.has(servicePackage.runtimeKind);
  }

  async _isFailureIdentityAvailable(installation, failureId, generation) {
    const existingFailure = await this.catalogOwner.getFailure(failureId);
    return this._isCurrentGeneration(generation) &&
      (existingFailure === null ||
        isExpectedFailure(existingFailure, installation, failureId));
  }

  async _repairPersistedUnsupportedFailure(
    installation,
    failureId,
    generation,
  ) {
    const failure = await this.catalogOwner.getFailure(failureId);
    if (!this._isCurrentGeneration(generation) ||
        !isExpectedFailure(failure, installation, failureId)) {
      return;
    }
    if (installation.rolloutState === SERVICE_INSTALL_ROLLOUT_STATE.FAILED) {
      await this._settleRecordedNotRunning(installation, generation);
    }
  }

  async _settleRecordedNotRunning(installation, generation) {
    if (!this._isCurrentGeneration(generation)) return;
    await this.catalogOwner.recordRolloutOutcome({
      installationId: installation.installationId,
      rolloutState: SERVICE_INSTALL_ROLLOUT_STATE.RECORDED_NOT_RUNNING,
    });
  }

  _isCurrentGeneration(generation) {
    return this._shutdown === false && this._isLeader === true &&
      generation === this._generation;
  }

  _startSweepTimer() {
    if (this._sweepTimerState.state === ASYNC_STATE.ACTIVE) return;
    const handle = this.timeSource.setInterval(
      () => void this.reconcileNow(),
      this.sweepIntervalMs,
    );
    this._sweepTimerState = {state: ASYNC_STATE.ACTIVE, handle};
    if (typeof handle?.unref === 'function') handle.unref();
  }

  _clearSweepTimer() {
    if (this._sweepTimerState.state === ASYNC_STATE.INACTIVE) return;
    this.timeSource.clearInterval(this._sweepTimerState.handle);
    this._sweepTimerState = INACTIVE_ASYNC_HANDLE;
  }

  _logError(message, error, details = {}) {
    if (typeof this.logger?.error !== 'function') return;
    this.logger.error(message, {...details, error: error?.message});
  }
}

export {
  ServiceInstallationReconciler,
  buildUnsupportedActivationFailureId,
  isServiceInstallCatalogOwnerCompatible,
};
