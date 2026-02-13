/**
 * Wasm_Component_Driver — runtime driver for WASM component
 * workloads running inside replicated service runtime.
 *
 * Wraps the existing WasmServiceLifecycle in the RuntimeDriver
 * contract without introducing a second lifecycle owner. The
 * driver delegates to WasmServiceLifecycle for actual replica
 * management when provided via context.
 *
 * Contract rules:
 *   1. No driver writes system metadata directly.
 *   2. All driver failures return typed errors.
 *   3. Driver lifecycle calls are idempotent where possible.
 *   4. WasmServiceLifecycle is NOT imported directly — it is
 *      accepted via context to avoid circular dependencies.
 *
 * Requirements: 3.2, 3.3, 3.5
 *
 * @module runtime/wasm-component-driver
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

const WASM_COMPONENT_ERROR = Object.freeze({
  DEFINITION_REQUIRED: 'service definition is required',
  REF_REQUIRED:
    'runtime_ref is required for wasm_component driver',
  REF_MUST_BE_STRING: 'runtime_ref must be a string',
  REF_EMPTY: 'runtime_ref must not be empty',
  REPLICA_CONTEXT_REQUIRED: 'replicaContext is required',
  SERVICE_ID_REQUIRED:
    'replicaContext.serviceId is required',
  NOT_PREPARED:
    'driver has not been prepared for this service',
  NOT_STARTED: 'service is not running',
  LIFECYCLE_NOT_OBJECT:
    'wasmLifecycle must be a non-null object',
  CREATE_REPLICA_FAILED: 'failed to create WASM replica',
  START_REPLICA_FAILED: 'failed to start WASM replica',
  STOP_REPLICA_FAILED: 'failed to stop WASM replica',
  VALIDATION_PIPELINE_FAILED:
    'WASM validation pipeline failed',
  DEPENDENCY_RESOLUTION_FAILED:
    'WASM dependency resolution failed',
  LOCK_VALIDATION_FAILED:
    'WASM lock validation failed',
});

/**
 * Wasm_Component_Driver — delegates to WasmServiceLifecycle
 * for actual WASM replica management while conforming to the
 * unified RuntimeDriver contract.
 *
 * Usage:
 *   const driver = new WasmComponentDriver();
 *   const validation = driver.validateDescriptor(definition);
 *   await driver.prepare(definition, {wasmLifecycle, replicaConfig});
 *   await driver.start(replicaContext);
 *   const health = await driver.health(replicaContext);
 *   await driver.stop(replicaContext);
 *
 * @extends RuntimeDriver
 */
class WasmComponentDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.WASM_COMPONENT);

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

    /**
     * WasmServiceLifecycle reference keyed by serviceId.
     * Stored per-service so different services can use
     * different lifecycle instances if needed.
     * @type {Map<string, Object>}
     * @private
     */
    this._lifecycles = new Map();
  }

  /**
   * Validate a service definition's runtime descriptor for
   * wasm_component runtime kind.
   *
   * Checks:
   *   - definition is present
   *   - runtime_ref is a non-empty string
   *
   * @param {Object} definition - The service definition.
   * @return {{valid: boolean, errors?: string[]}}
   */
  validateDescriptor(definition) {
    const errors = [];

    if (!definition || typeof definition !== TYPEOF.OBJECT) {
      errors.push(WASM_COMPONENT_ERROR.DEFINITION_REQUIRED);
      return {valid: false, errors};
    }

    const ref = definition[RUNTIME_FIELD.RUNTIME_REF] ??
      definition.runtimeRef;

    if (ref === undefined || ref === null) {
      errors.push(WASM_COMPONENT_ERROR.REF_REQUIRED);
    } else if (typeof ref !== TYPEOF.STRING) {
      errors.push(WASM_COMPONENT_ERROR.REF_MUST_BE_STRING);
    } else if (ref.trim().length === 0) {
      errors.push(WASM_COMPONENT_ERROR.REF_EMPTY);
    }

    if (errors.length > 0) {
      return {valid: false, errors};
    }
    return {valid: true};
  }

  /**
   * Prepare runtime artifacts for a wasm_component service.
   *
   * Optionally delegates to WasmServiceLifecycle.createReplica
   * when a lifecycle instance is provided in context.
   *
   * Idempotent: re-preparing an already-prepared service
   * updates the stored definition.
   *
   * @param {Object} definition - The service definition.
   * @param {Object} context - Optional {wasmLifecycle, replicaConfig}.
   * @return {Promise<{status: string, error?: string}>}
   */
  async prepare(definition, context) {
    const validation = this.validateDescriptor(definition);
    if (!validation.valid) {
      throw new DriverValidationError(
        this.kind, validation.errors,
      );
    }

    // --- WASM policy checks (delegated to existing owners) ---
    if (context?.validationPipeline) {
      const pipelineResult =
        context.validationPipeline(definition);
      if (!pipelineResult.valid) {
        return {
          status: PREPARE_STATUS.FAILED,
          error: WASM_COMPONENT_ERROR
            .VALIDATION_PIPELINE_FAILED +
            ': ' + (pipelineResult.errors || []).join('; '),
        };
      }
    }

    if (context?.dependencyResolver) {
      const resolveResult =
        context.dependencyResolver(definition);
      if (!resolveResult.resolved) {
        return {
          status: PREPARE_STATUS.FAILED,
          error: WASM_COMPONENT_ERROR
            .DEPENDENCY_RESOLUTION_FAILED +
            ': ' + (resolveResult.errors || []).join('; '),
        };
      }
    }

    if (context?.lockValidator) {
      const lockResult = context.lockValidator(definition);
      if (!lockResult.valid) {
        return {
          status: PREPARE_STATUS.FAILED,
          error: WASM_COMPONENT_ERROR
            .LOCK_VALIDATION_FAILED +
            ': ' + (lockResult.errors || []).join('; '),
        };
      }
    }

    const serviceId =
      definition.serviceId ?? definition.service_id;

    const wasmLifecycle = context?.wasmLifecycle;
    if (wasmLifecycle) {
      if (typeof wasmLifecycle !== TYPEOF.OBJECT) {
        throw new DriverLifecycleError(
          this.kind, 'prepare',
          WASM_COMPONENT_ERROR.LIFECYCLE_NOT_OBJECT,
        );
      }

      const replicaConfig = context.replicaConfig;
      try {
        wasmLifecycle.createReplica(definition, replicaConfig);
      } catch (cause) {
        return {
          status: PREPARE_STATUS.FAILED,
          error: `${WASM_COMPONENT_ERROR.CREATE_REPLICA_FAILED}` +
            `: ${cause.message}`,
        };
      }
      this._lifecycles.set(serviceId, wasmLifecycle);
    }

    this._prepared.set(serviceId, definition);
    return {status: PREPARE_STATUS.READY};
  }

  /**
   * Start a wasm_component service replica.
   *
   * Optionally delegates to WasmServiceLifecycle.startReplica
   * when a lifecycle instance was provided during prepare.
   * Returns an endpoint intent if the lifecycle returns port
   * and endpoint information.
   *
   * Idempotent: starting an already-running replica is a no-op.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<{status: string, endpointIntent?: Object,
   *   error?: string}>}
   */
  async start(replicaContext) {
    if (!replicaContext ||
        typeof replicaContext !== TYPEOF.OBJECT) {
      throw new DriverLifecycleError(
        this.kind, 'start',
        WASM_COMPONENT_ERROR.REPLICA_CONTEXT_REQUIRED,
      );
    }

    const serviceId = replicaContext.serviceId ??
      replicaContext.service_id;
    if (!serviceId) {
      throw new DriverLifecycleError(
        this.kind, 'start',
        WASM_COMPONENT_ERROR.SERVICE_ID_REQUIRED,
      );
    }

    if (!this._prepared.has(serviceId)) {
      return {
        status: START_STATUS.FAILED,
        error: `${WASM_COMPONENT_ERROR.NOT_PREPARED}` +
          `: '${serviceId}'`,
      };
    }

    const lifecycle = this._lifecycles.get(serviceId);
    if (lifecycle) {
      try {
        const startResult = lifecycle.startReplica(
          serviceId, replicaContext.startOptions,
        );
        this._running.add(serviceId);

        const result = {status: START_STATUS.RUNNING};
        if (startResult && startResult.port) {
          result.endpointIntent = {
            host: replicaContext.endpointHost ??
              replicaContext.address ?? 'localhost',
            port: startResult.port,
            protocol: replicaContext.endpointProtocol ?? 'ws',
          };
        }
        return result;
      } catch (cause) {
        return {
          status: START_STATUS.FAILED,
          error: `${WASM_COMPONENT_ERROR.START_REPLICA_FAILED}` +
            `: ${cause.message}`,
        };
      }
    }

    // No lifecycle — standalone/test mode
    this._running.add(serviceId);

    const result = {status: START_STATUS.RUNNING};
    if (replicaContext.endpointHost &&
        replicaContext.endpointPort) {
      result.endpointIntent = {
        host: replicaContext.endpointHost,
        port: replicaContext.endpointPort,
        protocol: replicaContext.endpointProtocol ?? 'ws',
      };
    }
    return result;
  }

  /**
   * Stop a wasm_component service replica.
   *
   * Optionally delegates to WasmServiceLifecycle.stopReplica
   * when a lifecycle instance was provided during prepare.
   * Idempotent: stopping an already-stopped replica is a no-op.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<void>}
   */
  async stop(replicaContext) {
    if (!replicaContext ||
        typeof replicaContext !== TYPEOF.OBJECT) {
      throw new DriverLifecycleError(
        this.kind, 'stop',
        WASM_COMPONENT_ERROR.REPLICA_CONTEXT_REQUIRED,
      );
    }

    const serviceId = replicaContext.serviceId ??
      replicaContext.service_id;
    if (!serviceId) {
      throw new DriverLifecycleError(
        this.kind, 'stop',
        WASM_COMPONENT_ERROR.SERVICE_ID_REQUIRED,
      );
    }

    const lifecycle = this._lifecycles.get(serviceId);
    if (lifecycle) {
      try {
        await lifecycle.stopReplica(serviceId);
      } catch (cause) {
        throw new DriverLifecycleError(
          this.kind, 'stop',
          `${WASM_COMPONENT_ERROR.STOP_REPLICA_FAILED}` +
            `: ${cause.message}`,
          {cause},
        );
      }
    }

    this._running.delete(serviceId);
    this._prepared.delete(serviceId);
    this._lifecycles.delete(serviceId);
  }

  /**
   * Check health of a wasm_component service replica.
   *
   * Verifies the service is prepared and running. When a
   * lifecycle instance is available, also checks that the
   * replica exists in the lifecycle's active replicas.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<{status: string, detail?: string}>}
   */
  async health(replicaContext) {
    if (!replicaContext ||
        typeof replicaContext !== TYPEOF.OBJECT) {
      return {
        status: HEALTH_STATUS.UNKNOWN,
        detail: WASM_COMPONENT_ERROR.REPLICA_CONTEXT_REQUIRED,
      };
    }

    const serviceId = replicaContext.serviceId ??
      replicaContext.service_id;
    if (!serviceId) {
      return {
        status: HEALTH_STATUS.UNKNOWN,
        detail: WASM_COMPONENT_ERROR.SERVICE_ID_REQUIRED,
      };
    }

    if (!this._prepared.has(serviceId)) {
      return {
        status: HEALTH_STATUS.UNHEALTHY,
        detail: `${WASM_COMPONENT_ERROR.NOT_PREPARED}` +
          `: '${serviceId}'`,
      };
    }

    if (!this._running.has(serviceId)) {
      return {
        status: HEALTH_STATUS.UNHEALTHY,
        detail: `${WASM_COMPONENT_ERROR.NOT_STARTED}` +
          `: '${serviceId}'`,
      };
    }

    const lifecycle = this._lifecycles.get(serviceId);
    if (lifecycle) {
      const replica = lifecycle.getReplica(serviceId);
      if (!replica) {
        return {
          status: HEALTH_STATUS.UNHEALTHY,
          detail: `${WASM_COMPONENT_ERROR.NOT_STARTED}` +
            `: '${serviceId}'`,
        };
      }
    }

    return {status: HEALTH_STATUS.HEALTHY};
  }
}

export {WasmComponentDriver, WASM_COMPONENT_ERROR};
