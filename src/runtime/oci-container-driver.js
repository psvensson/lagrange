/**
 * OCI_Container_Driver — runtime driver for OCI container
 * workloads behind a feature gate.
 *
 * All lifecycle operations check the feature gate before
 * proceeding. When disabled, operations return explicit
 * unsupported errors (no silent fallback).
 *
 * Contract rules:
 *   1. No driver writes system metadata directly.
 *   2. All driver failures return typed errors.
 *   3. Driver lifecycle calls are idempotent where possible.
 *   4. Feature gate must be explicitly enabled.
 *
 * Requirements: 4.3, 4.5
 *
 * @module runtime/oci-container-driver
 */

import {RUNTIME_KIND, RUNTIME_FIELD} from '../constants/runtime.js';
import {TYPEOF} from '../constants/types.js';
import {
  RuntimeDriver,
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from './runtime-driver.js';
import {
  DriverValidationError,
  DriverLifecycleError,
} from './runtime-driver-errors.js';

// --- Driver-specific constants ---

const OCI_DIGEST_MARKER = '@sha256:';

const OCI_DRIVER_ERROR = Object.freeze({
  DEFINITION_REQUIRED:
    'service definition is required',
  REF_REQUIRED:
    'runtime_ref is required for oci_container driver',
  REF_MUST_BE_STRING: 'runtime_ref must be a string',
  REF_EMPTY: 'runtime_ref must not be empty',
  DIGEST_REQUIRED:
    'runtime_ref must contain digest pin (@sha256:)',
  REPLICA_CONTEXT_REQUIRED: 'replicaContext is required',
  SERVICE_ID_REQUIRED:
    'replicaContext.serviceId is required',
  NOT_PREPARED:
    'driver has not been prepared for this service',
  NOT_STARTED: 'service is not running',
  FEATURE_GATE_DISABLED:
    'oci_container runtime is feature-gated and currently disabled',
});

/**
 * OCI_Container_Driver — executes digest-pinned OCI container
 * workloads inside the replicated service runtime contract,
 * gated behind an explicit feature flag.
 *
 * Usage:
 *   const driver = new OciContainerDriver();
 *   driver.setFeatureGate(true);
 *   const validation = driver.validateDescriptor(definition);
 *   await driver.prepare(definition, context);
 *   await driver.start(replicaContext);
 *   const health = await driver.health(replicaContext);
 *   await driver.stop(replicaContext);
 *
 * @extends RuntimeDriver
 */
class OciContainerDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.OCI_CONTAINER);

    /**
     * Whether the OCI container feature gate is enabled.
     * @type {boolean}
     * @private
     */
    this._featureGateEnabled = false;

    /**
     * Prepared service definitions keyed by serviceId.
     * @type {Map<string, Object>}
     * @private
     */
    this._prepared = new Map();

    /**
     * Running service IDs.
     * @type {Set<string>}
     * @private
     */
    this._running = new Set();
  }

  /**
   * Enable or disable the OCI container feature gate.
   *
   * @param {boolean} enabled - Whether to enable the gate.
   */
  setFeatureGate(enabled) {
    this._featureGateEnabled = Boolean(enabled);
  }

  /**
   * Check whether the feature gate is enabled.
   *
   * @return {{enabled: boolean}}
   * @private
   */
  _checkFeatureGate() {
    return {enabled: this._featureGateEnabled};
  }

  /**
   * Validate a service definition's runtime descriptor for
   * oci_container runtime kind.
   *
   * Checks:
   *   - definition is present
   *   - runtime_ref is a non-empty string
   *   - runtime_ref contains digest pin (@sha256:)
   *
   * Note: validateDescriptor does NOT check the feature gate.
   * Validation is always allowed regardless of gate state.
   *
   * @param {Object} definition - The service definition.
   * @return {{valid: boolean, errors?: string[]}}
   */
  validateDescriptor(definition) {
    const errors = [];

    if (!definition || typeof definition !== TYPEOF.OBJECT) {
      errors.push(OCI_DRIVER_ERROR.DEFINITION_REQUIRED);
      return {valid: false, errors};
    }

    const ref = definition[RUNTIME_FIELD.RUNTIME_REF] ??
      definition.runtimeRef;

    if (ref === undefined || ref === null) {
      errors.push(OCI_DRIVER_ERROR.REF_REQUIRED);
    } else if (typeof ref !== TYPEOF.STRING) {
      errors.push(OCI_DRIVER_ERROR.REF_MUST_BE_STRING);
    } else if (ref.trim().length === 0) {
      errors.push(OCI_DRIVER_ERROR.REF_EMPTY);
    } else if (!ref.includes(OCI_DIGEST_MARKER)) {
      errors.push(OCI_DRIVER_ERROR.DIGEST_REQUIRED);
    }

    if (errors.length > 0) {
      return {valid: false, errors};
    }
    return {valid: true};
  }

  /**
   * Prepare runtime artifacts for an oci_container service.
   *
   * Checks the feature gate before proceeding. When disabled,
   * throws a DriverLifecycleError with FEATURE_GATE_DISABLED.
   *
   * Idempotent: re-preparing an already-prepared service
   * updates the stored definition.
   *
   * @param {Object} definition - The service definition.
   * @param {Object} _context - Preparation context (reserved).
   * @return {Promise<{status: string, error?: string}>}
   */
  async prepare(definition, _context) {
    const gate = this._checkFeatureGate();
    if (!gate.enabled) {
      throw new DriverLifecycleError(
        this.kind, 'prepare',
        OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
      );
    }

    const validation = this.validateDescriptor(definition);
    if (!validation.valid) {
      throw new DriverValidationError(
        this.kind, validation.errors,
      );
    }

    const serviceId =
      definition.serviceId ?? definition.service_id;

    this._prepared.set(serviceId, definition);
    return {status: PREPARE_STATUS.READY};
  }

  /**
   * Start an oci_container service replica.
   *
   * Checks the feature gate before proceeding. When disabled,
   * throws a DriverLifecycleError with FEATURE_GATE_DISABLED.
   *
   * Idempotent: starting an already-running replica is a no-op.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<{status: string, error?: string}>}
   */
  async start(replicaContext) {
    const gate = this._checkFeatureGate();
    if (!gate.enabled) {
      throw new DriverLifecycleError(
        this.kind, 'start',
        OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
      );
    }

    if (!replicaContext ||
        typeof replicaContext !== TYPEOF.OBJECT) {
      throw new DriverLifecycleError(
        this.kind, 'start',
        OCI_DRIVER_ERROR.REPLICA_CONTEXT_REQUIRED,
      );
    }

    const serviceId = replicaContext.serviceId ??
      replicaContext.service_id;
    if (!serviceId) {
      throw new DriverLifecycleError(
        this.kind, 'start',
        OCI_DRIVER_ERROR.SERVICE_ID_REQUIRED,
      );
    }

    if (!this._prepared.has(serviceId)) {
      return {
        status: START_STATUS.FAILED,
        error: `${OCI_DRIVER_ERROR.NOT_PREPARED}` +
          `: '${serviceId}'`,
      };
    }

    // Idempotent: already running is success
    this._running.add(serviceId);

    return {status: START_STATUS.RUNNING};
  }

  /**
   * Stop an oci_container service replica.
   *
   * Checks the feature gate before proceeding. When disabled,
   * throws a DriverLifecycleError with FEATURE_GATE_DISABLED.
   *
   * Idempotent: stopping an already-stopped replica is a no-op.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<void>}
   */
  async stop(replicaContext) {
    const gate = this._checkFeatureGate();
    if (!gate.enabled) {
      throw new DriverLifecycleError(
        this.kind, 'stop',
        OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
      );
    }

    if (!replicaContext ||
        typeof replicaContext !== TYPEOF.OBJECT) {
      throw new DriverLifecycleError(
        this.kind, 'stop',
        OCI_DRIVER_ERROR.REPLICA_CONTEXT_REQUIRED,
      );
    }

    const serviceId = replicaContext.serviceId ??
      replicaContext.service_id;
    if (!serviceId) {
      throw new DriverLifecycleError(
        this.kind, 'stop',
        OCI_DRIVER_ERROR.SERVICE_ID_REQUIRED,
      );
    }

    // Idempotent: remove from running and prepared
    this._running.delete(serviceId);
    this._prepared.delete(serviceId);
  }

  /**
   * Check health of an oci_container service replica.
   *
   * When the feature gate is disabled, returns unknown status
   * with FEATURE_GATE_DISABLED detail (no throw).
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<{status: string, detail?: string}>}
   */
  async health(replicaContext) {
    const gate = this._checkFeatureGate();
    if (!gate.enabled) {
      return {
        status: HEALTH_STATUS.UNKNOWN,
        detail: OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
      };
    }

    if (!replicaContext ||
        typeof replicaContext !== TYPEOF.OBJECT) {
      return {
        status: HEALTH_STATUS.UNKNOWN,
        detail: OCI_DRIVER_ERROR.REPLICA_CONTEXT_REQUIRED,
      };
    }

    const serviceId = replicaContext.serviceId ??
      replicaContext.service_id;
    if (!serviceId) {
      return {
        status: HEALTH_STATUS.UNKNOWN,
        detail: OCI_DRIVER_ERROR.SERVICE_ID_REQUIRED,
      };
    }

    if (!this._prepared.has(serviceId)) {
      return {
        status: HEALTH_STATUS.UNHEALTHY,
        detail: `${OCI_DRIVER_ERROR.NOT_PREPARED}` +
          `: '${serviceId}'`,
      };
    }

    if (!this._running.has(serviceId)) {
      return {
        status: HEALTH_STATUS.UNHEALTHY,
        detail: `${OCI_DRIVER_ERROR.NOT_STARTED}` +
          `: '${serviceId}'`,
      };
    }

    return {status: HEALTH_STATUS.HEALTHY};
  }
}

export {OciContainerDriver, OCI_DRIVER_ERROR};
