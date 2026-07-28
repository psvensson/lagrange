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
import {CancellationToken} from '../query/cancellation-token.js';
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
import {
  bindRequestCellArtifact,
  isRequestCellDefinition,
  projectRequestCellRuntime,
} from './request-cell-runtime-contract.js';
import {
  readRequestCellContexts,
  writeRequestCellEffects,
} from './request-cell-component-context-owner.js';
import {WasiComponentCellRuntime} from
  './wasi-component-cell-runtime.js';

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
  START_REPLICA_NO_RESULT:
    'failed to start WASM replica: lifecycle returned no startup result',
  STOP_REPLICA_FAILED: 'failed to stop WASM replica',
  VALIDATION_PIPELINE_FAILED:
    'WASM validation pipeline failed',
  DEPENDENCY_RESOLUTION_FAILED:
    'WASM dependency resolution failed',
  LOCK_VALIDATION_FAILED:
    'WASM lock validation failed',
  UNKNOWN_LIFECYCLE_FAILURE:
    'unknown lifecycle failure',
  ARTIFACT_LOADER_REQUIRED:
    'request Cell Artifact loader is unavailable',
  COMPONENT_INVOKE_FAILED:
    'request Cell Component invocation failed',
  COMPONENT_START_FAILED:
    'request Cell Component startup failed',
  RUNTIME_ACCESS_POLICY_DENIED:
    'request Cell runtime access policy is unavailable or denied',
});

const DRIVER_ACTION = Object.freeze({
  INVOKE: 'invoke',
  PREPARE: 'prepare',
  START: 'start',
  STOP: 'stop',
});

const DRIVER_FIELD = Object.freeze({
  SERVICE_ID: 'serviceId',
  SERVICE_ID_LEGACY: 'service_id',
});

const DRIVER_SEPARATOR = Object.freeze({
  DETAIL: ': ',
  ERROR_LIST: '; ',
});
const DRIVER_ENDPOINT_DEFAULT = Object.freeze({
  HOST: 'localhost',
  PROTOCOL: 'ws',
});

const DRIVER_LENGTH = Object.freeze({
  EMPTY: 0,
});
const RUNTIME_ACCESS = Object.freeze({
  DENIED_CODE: 'RUNTIME_ACCESS_DENIED',
  RESOLVED_STATUS: 'resolved',
});

function buildDriverStatusResult(status, error, detailKey, detailValue) {
  const result = {status};
  if (error) {
    result.error = error;
  }
  if (detailKey && detailValue !== undefined) {
    result[detailKey] = detailValue;
  }
  return result;
}


function buildDriverServiceScopedError(baseMessage, serviceId) {
  return `${baseMessage}${DRIVER_SEPARATOR.DETAIL}'${serviceId}'`;
}

function buildValidationFailureError(baseMessage, errors) {
  return `${baseMessage}${DRIVER_SEPARATOR.DETAIL}` +
    `${errors.join(DRIVER_SEPARATOR.ERROR_LIST)}`;
}

function resolvePreparePolicyFailure(context, definition) {
  const policies = [
    {
      error: WASM_COMPONENT_ERROR.VALIDATION_PIPELINE_FAILED,
      execute: context?.validationPipeline,
      success: 'valid',
    },
    {
      error: WASM_COMPONENT_ERROR.DEPENDENCY_RESOLUTION_FAILED,
      execute: context?.dependencyResolver,
      success: 'resolved',
    },
    {
      error: WASM_COMPONENT_ERROR.LOCK_VALIDATION_FAILED,
      execute: context?.lockValidator,
      success: 'valid',
    },
  ];
  const policy = policies.find((candidate) =>
    typeof candidate.execute === 'function');
  if (!policy) return undefined;
  const result = policy.execute.call(context, definition);
  return result[policy.success] ?
    undefined :
    buildValidationFailureError(policy.error, result.errors || []);
}

function resolveDriverServiceId(value) {
  return value?.[DRIVER_FIELD.SERVICE_ID] ??
    value?.[DRIVER_FIELD.SERVICE_ID_LEGACY] ??
    value?.definition?.[DRIVER_FIELD.SERVICE_ID] ??
    value?.definition?.[DRIVER_FIELD.SERVICE_ID_LEGACY];
}

function resolveDriverTenantId(value) {
  return value?.tenantId ??
    value?.tenant_id ??
    value?.definition?.tenantId ??
    value?.definition?.tenant_id;
}

async function resolveRuntimeAccessTables(replicaContext) {
  const resolver = replicaContext?.queryExecutor?.getRuntimeAccessPolicy;
  if (typeof resolver !== 'function') {
    const error = new Error(WASM_COMPONENT_ERROR.RUNTIME_ACCESS_POLICY_DENIED);
    error.code = RUNTIME_ACCESS.DENIED_CODE;
    throw error;
  }
  const resolved = await resolver();
  if (resolved?.status !== RUNTIME_ACCESS.RESOLVED_STATUS ||
      !Array.isArray(resolved?.policy?.tables)) {
    const error = new Error(
      `${WASM_COMPONENT_ERROR.RUNTIME_ACCESS_POLICY_DENIED}` +
      `${resolved?.reason ? `${DRIVER_SEPARATOR.DETAIL}${resolved.reason}` : ''}`,
    );
    error.code = RUNTIME_ACCESS.DENIED_CODE;
    throw error;
  }
  return resolved.policy.tables;
}

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
  constructor(options = {}) {
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

    this._artifactLoader = options.artifactLoader || null;
    this._componentRuntime =
      options.componentRuntime || new WasiComponentCellRuntime();
    this._requestCells = new Map();
    this._replicaContexts = new Map();
  }

  setArtifactLoader(loader) {
    if (typeof loader !== 'function') {
      throw new TypeError(WASM_COMPONENT_ERROR.ARTIFACT_LOADER_REQUIRED);
    }
    this._artifactLoader = loader;
  }

  requiresRuntimeReconciliation(definition) {
    return isRequestCellDefinition(definition);
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

    if (!definition || typeof definition !== 'object') {
      errors.push(WASM_COMPONENT_ERROR.DEFINITION_REQUIRED);
      return {valid: false, errors};
    }

    const ref = definition[RUNTIME_FIELD.RUNTIME_REF] ??
      definition.runtimeRef;

    if (ref === undefined || ref === null) {
      errors.push(WASM_COMPONENT_ERROR.REF_REQUIRED);
    } else if (typeof ref !== 'string') {
      errors.push(WASM_COMPONENT_ERROR.REF_MUST_BE_STRING);
    } else if (ref.trim().length === DRIVER_LENGTH.EMPTY) {
      errors.push(WASM_COMPONENT_ERROR.REF_EMPTY);
    }

    if (errors.length > DRIVER_LENGTH.EMPTY) {
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

    const preparePolicyFailure = resolvePreparePolicyFailure(
      context,
      definition,
    );
    if (preparePolicyFailure) {
      return buildDriverStatusResult(
        PREPARE_STATUS.FAILED,
        preparePolicyFailure,
      );
    }

    const serviceId = resolveDriverServiceId(definition);

    if (isRequestCellDefinition(definition)) {
      return this.#prepareRequestCell(definition, serviceId);
    }

    return this.#prepareLegacyReplica(definition, context, serviceId);
  }

  async #prepareRequestCell(definition, serviceId) {
    if (!this._artifactLoader) {
      return buildDriverStatusResult(
        PREPARE_STATUS.FAILED,
        WASM_COMPONENT_ERROR.ARTIFACT_LOADER_REQUIRED,
      );
    }
    try {
      const runtime = projectRequestCellRuntime(definition);
      const artifact = await this._artifactLoader(runtime);
      const cell = bindRequestCellArtifact(runtime, artifact);
      const existing = this._requestCells.get(serviceId);
      if (existing &&
          (existing.bindingDigest !== cell.bindingDigest ||
           existing.payloadDigest !== cell.payloadDigest)) {
        await this._componentRuntime.stop(serviceId);
        this._running.delete(serviceId);
      }
      this._requestCells.set(serviceId, cell);
      this._prepared.set(serviceId, definition);
      return {status: PREPARE_STATUS.READY};
    } catch (cause) {
      await this._componentRuntime.stop(serviceId);
      this._running.delete(serviceId);
      this._replicaContexts.delete(serviceId);
      this._requestCells.delete(serviceId);
      this._prepared.delete(serviceId);
      return buildDriverStatusResult(
        PREPARE_STATUS.FAILED,
        `${cause.code || WASM_COMPONENT_ERROR.CREATE_REPLICA_FAILED}` +
          `${DRIVER_SEPARATOR.DETAIL}${cause.message}`,
      );
    }
  }

  #prepareLegacyReplica(definition, context, serviceId) {
    const wasmLifecycle = context?.wasmLifecycle;
    if (wasmLifecycle) {
      if (typeof wasmLifecycle !== 'object') {
        throw new DriverLifecycleError(
          this.kind, DRIVER_ACTION.PREPARE,
          WASM_COMPONENT_ERROR.LIFECYCLE_NOT_OBJECT,
        );
      }

      const replicaConfig = context.replicaConfig;
      try {
        wasmLifecycle.createReplica(definition, replicaConfig);
      } catch (cause) {
        return buildDriverStatusResult(
          PREPARE_STATUS.FAILED,
          `${WASM_COMPONENT_ERROR.CREATE_REPLICA_FAILED}` +
            `${DRIVER_SEPARATOR.DETAIL}${cause.message}`,
        );
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
        typeof replicaContext !== 'object') {
      throw new DriverLifecycleError(
        this.kind, DRIVER_ACTION.START,
        WASM_COMPONENT_ERROR.REPLICA_CONTEXT_REQUIRED,
      );
    }

    const serviceId = resolveDriverServiceId(replicaContext);
    if (!serviceId) {
      throw new DriverLifecycleError(
        this.kind, DRIVER_ACTION.START,
        WASM_COMPONENT_ERROR.SERVICE_ID_REQUIRED,
      );
    }

    if (!this._prepared.has(serviceId)) {
      return buildDriverStatusResult(
        START_STATUS.FAILED,
        buildDriverServiceScopedError(
          WASM_COMPONENT_ERROR.NOT_PREPARED,
          serviceId,
        ),
      );
    }

    const requestCell = this._requestCells.get(serviceId);
    if (requestCell) {
      return this.#startRequestCell(
        requestCell,
        replicaContext,
        serviceId,
      );
    }

    const lifecycle = this._lifecycles.get(serviceId);
    if (lifecycle) {
      return this.#startLegacyReplica(
        lifecycle,
        replicaContext,
        serviceId,
      );
    }

    return this.#startStandaloneReplica(replicaContext, serviceId);
  }

  async #startRequestCell(requestCell, replicaContext, serviceId) {
    try {
      await this._componentRuntime.start(requestCell);
      if (!await this._componentRuntime.health(serviceId)) {
        throw new Error(WASM_COMPONENT_ERROR.NOT_STARTED);
      }
      this._replicaContexts.set(serviceId, replicaContext);
      this._running.add(serviceId);
      return {status: START_STATUS.RUNNING};
    } catch (cause) {
      this._replicaContexts.delete(serviceId);
      this._running.delete(serviceId);
      return buildDriverStatusResult(
        START_STATUS.FAILED,
        `${cause.code || WASM_COMPONENT_ERROR.COMPONENT_START_FAILED}` +
          `${DRIVER_SEPARATOR.DETAIL}${cause.message}`,
      );
    }
  }

  #startLegacyReplica(lifecycle, replicaContext, serviceId) {
    try {
      const startResult = lifecycle.startReplica(
        serviceId, replicaContext.startOptions,
      );
      return this.#projectLegacyStartResult(
        startResult,
        replicaContext,
        serviceId,
      );
    } catch (cause) {
      return buildDriverStatusResult(
        START_STATUS.FAILED,
        `${WASM_COMPONENT_ERROR.START_REPLICA_FAILED}` +
          `${DRIVER_SEPARATOR.DETAIL}${cause.message}`,
      );
    }
  }

  #projectLegacyStartResult(startResult, replicaContext, serviceId) {
    if (!startResult) {
      return buildDriverStatusResult(
        START_STATUS.FAILED,
        WASM_COMPONENT_ERROR.START_REPLICA_NO_RESULT,
      );
    }
    if (startResult.started === false) {
      const result = buildDriverStatusResult(
        START_STATUS.FAILED,
        `${WASM_COMPONENT_ERROR.START_REPLICA_FAILED}` +
          `${DRIVER_SEPARATOR.DETAIL}` +
          `${startResult.error ||
            WASM_COMPONENT_ERROR.UNKNOWN_LIFECYCLE_FAILURE}`,
      );
      if (startResult.diagnostic) result.diagnostic = startResult.diagnostic;
      return result;
    }
    this._running.add(serviceId);
    const result = {status: START_STATUS.RUNNING};
    if (startResult.port) {
      result.endpointIntent = {
        host: replicaContext.endpointHost ??
          replicaContext.address ??
          DRIVER_ENDPOINT_DEFAULT.HOST,
        port: startResult.port,
        protocol: replicaContext.endpointProtocol ??
          DRIVER_ENDPOINT_DEFAULT.PROTOCOL,
      };
    }
    return result;
  }

  #startStandaloneReplica(replicaContext, serviceId) {
    // No lifecycle — standalone/test mode
    this._running.add(serviceId);

    const result = {status: START_STATUS.RUNNING};
    if (replicaContext.endpointHost &&
        replicaContext.endpointPort) {
      result.endpointIntent = {
        host: replicaContext.endpointHost,
        port: replicaContext.endpointPort,
        protocol: replicaContext.endpointProtocol ??
          DRIVER_ENDPOINT_DEFAULT.PROTOCOL,
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
        typeof replicaContext !== 'object') {
      throw new DriverLifecycleError(
        this.kind, DRIVER_ACTION.STOP,
        WASM_COMPONENT_ERROR.REPLICA_CONTEXT_REQUIRED,
      );
    }

    const serviceId = resolveDriverServiceId(replicaContext);
    if (!serviceId) {
      throw new DriverLifecycleError(
        this.kind, DRIVER_ACTION.STOP,
        WASM_COMPONENT_ERROR.SERVICE_ID_REQUIRED,
      );
    }

    const lifecycle = this._lifecycles.get(serviceId);
    if (this._requestCells.has(serviceId)) {
      await this._componentRuntime.stop(serviceId);
    }
    if (lifecycle) {
      try {
        await lifecycle.stopReplica(serviceId);
      } catch (cause) {
        throw new DriverLifecycleError(
          this.kind, DRIVER_ACTION.STOP,
          `${WASM_COMPONENT_ERROR.STOP_REPLICA_FAILED}` +
            `${DRIVER_SEPARATOR.DETAIL}${cause.message}`,
          {cause},
        );
      }
    }

    this._running.delete(serviceId);
    this._prepared.delete(serviceId);
    this._lifecycles.delete(serviceId);
    this._requestCells.delete(serviceId);
    this._replicaContexts.delete(serviceId);
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
    let result;
    if (!replicaContext ||
        typeof replicaContext !== 'object') {
      result = {
        status: HEALTH_STATUS.UNKNOWN,
        detail: WASM_COMPONENT_ERROR.REPLICA_CONTEXT_REQUIRED,
      };
    } else {
      const serviceId = resolveDriverServiceId(replicaContext);
      if (!serviceId) {
        result = {
          status: HEALTH_STATUS.UNKNOWN,
          detail: WASM_COMPONENT_ERROR.SERVICE_ID_REQUIRED,
        };
      } else if (!this._prepared.has(serviceId)) {
        result = {
          status: HEALTH_STATUS.UNHEALTHY,
          detail: buildDriverServiceScopedError(
            WASM_COMPONENT_ERROR.NOT_PREPARED,
            serviceId,
          ),
        };
      } else if (!this._running.has(serviceId)) {
        result = {
          status: HEALTH_STATUS.UNHEALTHY,
          detail: buildDriverServiceScopedError(
            WASM_COMPONENT_ERROR.NOT_STARTED,
            serviceId,
          ),
        };
      } else {
        const requestCell = this._requestCells.get(serviceId);
        const lifecycle = this._lifecycles.get(serviceId);
        const replica = requestCell ?
          await this._componentRuntime.health(serviceId) :
          lifecycle ? lifecycle.getReplica(serviceId) : true;
        if (!replica) this._running.delete(serviceId);
        result = replica ? {
          status: HEALTH_STATUS.HEALTHY,
        } : {
          status: HEALTH_STATUS.UNHEALTHY,
          detail: buildDriverServiceScopedError(
            WASM_COMPONENT_ERROR.NOT_STARTED,
            serviceId,
          ),
        };
      }
    }
    return result;
  }

  async invoke(replicaContext, invocation = {}) {
    const serviceId = resolveDriverServiceId(replicaContext);
    const cell = this._requestCells.get(serviceId);
    if (!cell) {
      throw new DriverLifecycleError(
        this.kind,
        DRIVER_ACTION.INVOKE,
        WASM_COMPONENT_ERROR.NOT_STARTED,
      );
    }
    const currentContext = {
      ...this._replicaContexts.get(serviceId),
      ...replicaContext,
    };
    const tenantId = resolveDriverTenantId(currentContext);
    const cancellationToken = new CancellationToken();
    try {
      const tables = await resolveRuntimeAccessTables(currentContext);
      return await this._componentRuntime.invoke(
        serviceId,
        invocation.args || [],
        (wallBudget) =>
          readRequestCellContexts({
            cancellationToken,
            cell,
            replicaContext: currentContext,
            serviceId,
            tables,
            tenantId,
            wallBudget,
          }),
        (effects, wallBudget) =>
          writeRequestCellEffects({
            cancellationToken,
            effects,
            replicaContext: currentContext,
            serviceId,
            tables,
            tenantId,
            wallBudget,
          }),
        (reason) => cancellationToken.cancel(reason),
        {
          beforeComponentInvoke: invocation.assertCurrentTarget,
          deadlineMs: invocation.deadlineMs,
          tables,
        },
      );
    } catch (cause) {
      if (cause?.preserveReplicaState === true) throw cause;
      await this._componentRuntime.stop(serviceId);
      this._running.delete(serviceId);
      throw new DriverLifecycleError(
        this.kind,
        DRIVER_ACTION.INVOKE,
        `${cause.code || WASM_COMPONENT_ERROR.COMPONENT_INVOKE_FAILED}` +
          `${DRIVER_SEPARATOR.DETAIL}${cause.message}`,
        {cause},
      );
    }
  }
}

function requestCellWitness(driver, replicaContext) {
  const serviceId = resolveDriverServiceId(replicaContext);
  return driver._componentRuntime.witness(serviceId);
}

export {WasmComponentDriver, WASM_COMPONENT_ERROR, requestCellWitness};
