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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { RUNTIME_KIND, RUNTIME_FIELD } from '../constants/runtime.js';
import { TYPEOF } from '../constants/types.js';
import { RuntimeDriver, PREPARE_STATUS, START_STATUS, HEALTH_STATUS } from './runtime-driver.js';
import { DriverValidationError, DriverLifecycleError } from './runtime-driver-errors.js';

// --- Driver-specific constants ---

const WASM_COMPONENT_ERROR = Object.freeze(stryMutAct_9fa48("149279") ? {} : (stryCov_9fa48("149279"), {
  DEFINITION_REQUIRED: stryMutAct_9fa48("149280") ? "" : (stryCov_9fa48("149280"), 'service definition is required'),
  REF_REQUIRED: stryMutAct_9fa48("149281") ? "" : (stryCov_9fa48("149281"), 'runtime_ref is required for wasm_component driver'),
  REF_MUST_BE_STRING: stryMutAct_9fa48("149282") ? "" : (stryCov_9fa48("149282"), 'runtime_ref must be a string'),
  REF_EMPTY: stryMutAct_9fa48("149283") ? "" : (stryCov_9fa48("149283"), 'runtime_ref must not be empty'),
  REPLICA_CONTEXT_REQUIRED: stryMutAct_9fa48("149284") ? "" : (stryCov_9fa48("149284"), 'replicaContext is required'),
  SERVICE_ID_REQUIRED: stryMutAct_9fa48("149285") ? "" : (stryCov_9fa48("149285"), 'replicaContext.serviceId is required'),
  NOT_PREPARED: stryMutAct_9fa48("149286") ? "" : (stryCov_9fa48("149286"), 'driver has not been prepared for this service'),
  NOT_STARTED: stryMutAct_9fa48("149287") ? "" : (stryCov_9fa48("149287"), 'service is not running'),
  LIFECYCLE_NOT_OBJECT: stryMutAct_9fa48("149288") ? "" : (stryCov_9fa48("149288"), 'wasmLifecycle must be a non-null object'),
  CREATE_REPLICA_FAILED: stryMutAct_9fa48("149289") ? "" : (stryCov_9fa48("149289"), 'failed to create WASM replica'),
  START_REPLICA_FAILED: stryMutAct_9fa48("149290") ? "" : (stryCov_9fa48("149290"), 'failed to start WASM replica'),
  START_REPLICA_NO_RESULT: stryMutAct_9fa48("149291") ? "" : (stryCov_9fa48("149291"), 'failed to start WASM replica: lifecycle returned no startup result'),
  STOP_REPLICA_FAILED: stryMutAct_9fa48("149292") ? "" : (stryCov_9fa48("149292"), 'failed to stop WASM replica'),
  VALIDATION_PIPELINE_FAILED: stryMutAct_9fa48("149293") ? "" : (stryCov_9fa48("149293"), 'WASM validation pipeline failed'),
  DEPENDENCY_RESOLUTION_FAILED: stryMutAct_9fa48("149294") ? "" : (stryCov_9fa48("149294"), 'WASM dependency resolution failed'),
  LOCK_VALIDATION_FAILED: stryMutAct_9fa48("149295") ? "" : (stryCov_9fa48("149295"), 'WASM lock validation failed'),
  UNKNOWN_LIFECYCLE_FAILURE: stryMutAct_9fa48("149296") ? "" : (stryCov_9fa48("149296"), 'unknown lifecycle failure')
}));
const DRIVER_ACTION = Object.freeze(stryMutAct_9fa48("149297") ? {} : (stryCov_9fa48("149297"), {
  PREPARE: stryMutAct_9fa48("149298") ? "" : (stryCov_9fa48("149298"), 'prepare'),
  START: stryMutAct_9fa48("149299") ? "" : (stryCov_9fa48("149299"), 'start'),
  STOP: stryMutAct_9fa48("149300") ? "" : (stryCov_9fa48("149300"), 'stop')
}));
const DRIVER_FIELD = Object.freeze(stryMutAct_9fa48("149301") ? {} : (stryCov_9fa48("149301"), {
  SERVICE_ID: stryMutAct_9fa48("149302") ? "" : (stryCov_9fa48("149302"), 'serviceId'),
  SERVICE_ID_LEGACY: stryMutAct_9fa48("149303") ? "" : (stryCov_9fa48("149303"), 'service_id')
}));
const DRIVER_SEPARATOR = Object.freeze(stryMutAct_9fa48("149304") ? {} : (stryCov_9fa48("149304"), {
  DETAIL: stryMutAct_9fa48("149305") ? "" : (stryCov_9fa48("149305"), ': '),
  ERROR_LIST: stryMutAct_9fa48("149306") ? "" : (stryCov_9fa48("149306"), '; ')
}));
const DRIVER_ENDPOINT_DEFAULT = Object.freeze(stryMutAct_9fa48("149307") ? {} : (stryCov_9fa48("149307"), {
  HOST: stryMutAct_9fa48("149308") ? "" : (stryCov_9fa48("149308"), 'localhost'),
  PROTOCOL: stryMutAct_9fa48("149309") ? "" : (stryCov_9fa48("149309"), 'ws')
}));
const DRIVER_LENGTH = Object.freeze(stryMutAct_9fa48("149310") ? {} : (stryCov_9fa48("149310"), {
  EMPTY: 0
}));
function buildDriverStatusResult(status, error, detailKey, detailValue) {
  if (stryMutAct_9fa48("149311")) {
    {}
  } else {
    stryCov_9fa48("149311");
    const result = stryMutAct_9fa48("149312") ? {} : (stryCov_9fa48("149312"), {
      status
    });
    if (stryMutAct_9fa48("149314") ? false : stryMutAct_9fa48("149313") ? true : (stryCov_9fa48("149313", "149314"), error)) {
      if (stryMutAct_9fa48("149315")) {
        {}
      } else {
        stryCov_9fa48("149315");
        result.error = error;
      }
    }
    if (stryMutAct_9fa48("149318") ? detailKey || detailValue !== undefined : stryMutAct_9fa48("149317") ? false : stryMutAct_9fa48("149316") ? true : (stryCov_9fa48("149316", "149317", "149318"), detailKey && (stryMutAct_9fa48("149320") ? detailValue === undefined : stryMutAct_9fa48("149319") ? true : (stryCov_9fa48("149319", "149320"), detailValue !== undefined)))) {
      if (stryMutAct_9fa48("149321")) {
        {}
      } else {
        stryCov_9fa48("149321");
        result[detailKey] = detailValue;
      }
    }
    return result;
  }
}
function buildDriverLifecycleActionError(action, message, cause) {
  if (stryMutAct_9fa48("149322")) {
    {}
  } else {
    stryCov_9fa48("149322");
    return new DriverLifecycleError(RUNTIME_KIND.WASM_COMPONENT, action, message, cause ? stryMutAct_9fa48("149323") ? {} : (stryCov_9fa48("149323"), {
      cause
    }) : undefined);
  }
}
function buildDriverServiceScopedError(baseMessage, serviceId) {
  if (stryMutAct_9fa48("149324")) {
    {}
  } else {
    stryCov_9fa48("149324");
    return stryMutAct_9fa48("149325") ? `` : (stryCov_9fa48("149325"), `${baseMessage}${DRIVER_SEPARATOR.DETAIL}'${serviceId}'`);
  }
}
function buildValidationFailureError(baseMessage, errors) {
  if (stryMutAct_9fa48("149326")) {
    {}
  } else {
    stryCov_9fa48("149326");
    return (stryMutAct_9fa48("149327") ? `` : (stryCov_9fa48("149327"), `${baseMessage}${DRIVER_SEPARATOR.DETAIL}`)) + (stryMutAct_9fa48("149328") ? `` : (stryCov_9fa48("149328"), `${errors.join(DRIVER_SEPARATOR.ERROR_LIST)}`));
  }
}
function resolvePreparePolicyFailure(context, definition) {
  if (stryMutAct_9fa48("149329")) {
    {}
  } else {
    stryCov_9fa48("149329");
    if (stryMutAct_9fa48("149332") ? context.validationPipeline : stryMutAct_9fa48("149331") ? false : stryMutAct_9fa48("149330") ? true : (stryCov_9fa48("149330", "149331", "149332"), context?.validationPipeline)) {
      if (stryMutAct_9fa48("149333")) {
        {}
      } else {
        stryCov_9fa48("149333");
        const pipelineResult = context.validationPipeline(definition);
        if (stryMutAct_9fa48("149336") ? false : stryMutAct_9fa48("149335") ? true : stryMutAct_9fa48("149334") ? pipelineResult.valid : (stryCov_9fa48("149334", "149335", "149336"), !pipelineResult.valid)) {
          if (stryMutAct_9fa48("149337")) {
            {}
          } else {
            stryCov_9fa48("149337");
            return buildValidationFailureError(WASM_COMPONENT_ERROR.VALIDATION_PIPELINE_FAILED, stryMutAct_9fa48("149340") ? pipelineResult.errors && [] : stryMutAct_9fa48("149339") ? false : stryMutAct_9fa48("149338") ? true : (stryCov_9fa48("149338", "149339", "149340"), pipelineResult.errors || (stryMutAct_9fa48("149341") ? ["Stryker was here"] : (stryCov_9fa48("149341"), []))));
          }
        }
      }
    } else if (stryMutAct_9fa48("149344") ? context.dependencyResolver : stryMutAct_9fa48("149343") ? false : stryMutAct_9fa48("149342") ? true : (stryCov_9fa48("149342", "149343", "149344"), context?.dependencyResolver)) {
      if (stryMutAct_9fa48("149345")) {
        {}
      } else {
        stryCov_9fa48("149345");
        const resolveResult = context.dependencyResolver(definition);
        if (stryMutAct_9fa48("149348") ? false : stryMutAct_9fa48("149347") ? true : stryMutAct_9fa48("149346") ? resolveResult.resolved : (stryCov_9fa48("149346", "149347", "149348"), !resolveResult.resolved)) {
          if (stryMutAct_9fa48("149349")) {
            {}
          } else {
            stryCov_9fa48("149349");
            return buildValidationFailureError(WASM_COMPONENT_ERROR.DEPENDENCY_RESOLUTION_FAILED, stryMutAct_9fa48("149352") ? resolveResult.errors && [] : stryMutAct_9fa48("149351") ? false : stryMutAct_9fa48("149350") ? true : (stryCov_9fa48("149350", "149351", "149352"), resolveResult.errors || (stryMutAct_9fa48("149353") ? ["Stryker was here"] : (stryCov_9fa48("149353"), []))));
          }
        }
      }
    } else if (stryMutAct_9fa48("149356") ? context.lockValidator : stryMutAct_9fa48("149355") ? false : stryMutAct_9fa48("149354") ? true : (stryCov_9fa48("149354", "149355", "149356"), context?.lockValidator)) {
      if (stryMutAct_9fa48("149357")) {
        {}
      } else {
        stryCov_9fa48("149357");
        const lockResult = context.lockValidator(definition);
        if (stryMutAct_9fa48("149360") ? false : stryMutAct_9fa48("149359") ? true : stryMutAct_9fa48("149358") ? lockResult.valid : (stryCov_9fa48("149358", "149359", "149360"), !lockResult.valid)) {
          if (stryMutAct_9fa48("149361")) {
            {}
          } else {
            stryCov_9fa48("149361");
            return buildValidationFailureError(WASM_COMPONENT_ERROR.LOCK_VALIDATION_FAILED, stryMutAct_9fa48("149364") ? lockResult.errors && [] : stryMutAct_9fa48("149363") ? false : stryMutAct_9fa48("149362") ? true : (stryCov_9fa48("149362", "149363", "149364"), lockResult.errors || (stryMutAct_9fa48("149365") ? ["Stryker was here"] : (stryCov_9fa48("149365"), []))));
          }
        }
      }
    }
    return undefined;
  }
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
  constructor() {
    if (stryMutAct_9fa48("149366")) {
      {}
    } else {
      stryCov_9fa48("149366");
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
    if (stryMutAct_9fa48("149367")) {
      {}
    } else {
      stryCov_9fa48("149367");
      const errors = stryMutAct_9fa48("149368") ? ["Stryker was here"] : (stryCov_9fa48("149368"), []);
      if (stryMutAct_9fa48("149371") ? !definition && typeof definition !== TYPEOF.OBJECT : stryMutAct_9fa48("149370") ? false : stryMutAct_9fa48("149369") ? true : (stryCov_9fa48("149369", "149370", "149371"), (stryMutAct_9fa48("149372") ? definition : (stryCov_9fa48("149372"), !definition)) || (stryMutAct_9fa48("149374") ? typeof definition === TYPEOF.OBJECT : stryMutAct_9fa48("149373") ? false : (stryCov_9fa48("149373", "149374"), typeof definition !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("149375")) {
          {}
        } else {
          stryCov_9fa48("149375");
          errors.push(WASM_COMPONENT_ERROR.DEFINITION_REQUIRED);
          return stryMutAct_9fa48("149376") ? {} : (stryCov_9fa48("149376"), {
            valid: stryMutAct_9fa48("149377") ? true : (stryCov_9fa48("149377"), false),
            errors
          });
        }
      }
      const ref = stryMutAct_9fa48("149378") ? definition[RUNTIME_FIELD.RUNTIME_REF] && definition.runtimeRef : (stryCov_9fa48("149378"), definition[RUNTIME_FIELD.RUNTIME_REF] ?? definition.runtimeRef);
      if (stryMutAct_9fa48("149381") ? ref === undefined && ref === null : stryMutAct_9fa48("149380") ? false : stryMutAct_9fa48("149379") ? true : (stryCov_9fa48("149379", "149380", "149381"), (stryMutAct_9fa48("149383") ? ref !== undefined : stryMutAct_9fa48("149382") ? false : (stryCov_9fa48("149382", "149383"), ref === undefined)) || (stryMutAct_9fa48("149385") ? ref !== null : stryMutAct_9fa48("149384") ? false : (stryCov_9fa48("149384", "149385"), ref === null)))) {
        if (stryMutAct_9fa48("149386")) {
          {}
        } else {
          stryCov_9fa48("149386");
          errors.push(WASM_COMPONENT_ERROR.REF_REQUIRED);
        }
      } else if (stryMutAct_9fa48("149389") ? typeof ref === TYPEOF.STRING : stryMutAct_9fa48("149388") ? false : stryMutAct_9fa48("149387") ? true : (stryCov_9fa48("149387", "149388", "149389"), typeof ref !== TYPEOF.STRING)) {
        if (stryMutAct_9fa48("149390")) {
          {}
        } else {
          stryCov_9fa48("149390");
          errors.push(WASM_COMPONENT_ERROR.REF_MUST_BE_STRING);
        }
      } else if (stryMutAct_9fa48("149393") ? ref.trim().length !== DRIVER_LENGTH.EMPTY : stryMutAct_9fa48("149392") ? false : stryMutAct_9fa48("149391") ? true : (stryCov_9fa48("149391", "149392", "149393"), (stryMutAct_9fa48("149394") ? ref.length : (stryCov_9fa48("149394"), ref.trim().length)) === DRIVER_LENGTH.EMPTY)) {
        if (stryMutAct_9fa48("149395")) {
          {}
        } else {
          stryCov_9fa48("149395");
          errors.push(WASM_COMPONENT_ERROR.REF_EMPTY);
        }
      }
      if (stryMutAct_9fa48("149399") ? errors.length <= DRIVER_LENGTH.EMPTY : stryMutAct_9fa48("149398") ? errors.length >= DRIVER_LENGTH.EMPTY : stryMutAct_9fa48("149397") ? false : stryMutAct_9fa48("149396") ? true : (stryCov_9fa48("149396", "149397", "149398", "149399"), errors.length > DRIVER_LENGTH.EMPTY)) {
        if (stryMutAct_9fa48("149400")) {
          {}
        } else {
          stryCov_9fa48("149400");
          return stryMutAct_9fa48("149401") ? {} : (stryCov_9fa48("149401"), {
            valid: stryMutAct_9fa48("149402") ? true : (stryCov_9fa48("149402"), false),
            errors
          });
        }
      }
      return stryMutAct_9fa48("149403") ? {} : (stryCov_9fa48("149403"), {
        valid: stryMutAct_9fa48("149404") ? false : (stryCov_9fa48("149404"), true)
      });
    }
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
    if (stryMutAct_9fa48("149405")) {
      {}
    } else {
      stryCov_9fa48("149405");
      const validation = this.validateDescriptor(definition);
      if (stryMutAct_9fa48("149408") ? false : stryMutAct_9fa48("149407") ? true : stryMutAct_9fa48("149406") ? validation.valid : (stryCov_9fa48("149406", "149407", "149408"), !validation.valid)) {
        if (stryMutAct_9fa48("149409")) {
          {}
        } else {
          stryCov_9fa48("149409");
          throw new DriverValidationError(this.kind, validation.errors);
        }
      }
      const preparePolicyFailure = resolvePreparePolicyFailure(context, definition);
      if (stryMutAct_9fa48("149411") ? false : stryMutAct_9fa48("149410") ? true : (stryCov_9fa48("149410", "149411"), preparePolicyFailure)) {
        if (stryMutAct_9fa48("149412")) {
          {}
        } else {
          stryCov_9fa48("149412");
          return buildDriverStatusResult(PREPARE_STATUS.FAILED, preparePolicyFailure);
        }
      }
      const serviceId = stryMutAct_9fa48("149413") ? definition[DRIVER_FIELD.SERVICE_ID] && definition[DRIVER_FIELD.SERVICE_ID_LEGACY] : (stryCov_9fa48("149413"), definition[DRIVER_FIELD.SERVICE_ID] ?? definition[DRIVER_FIELD.SERVICE_ID_LEGACY]);
      const wasmLifecycle = stryMutAct_9fa48("149414") ? context.wasmLifecycle : (stryCov_9fa48("149414"), context?.wasmLifecycle);
      if (stryMutAct_9fa48("149416") ? false : stryMutAct_9fa48("149415") ? true : (stryCov_9fa48("149415", "149416"), wasmLifecycle)) {
        if (stryMutAct_9fa48("149417")) {
          {}
        } else {
          stryCov_9fa48("149417");
          if (stryMutAct_9fa48("149420") ? typeof wasmLifecycle === TYPEOF.OBJECT : stryMutAct_9fa48("149419") ? false : stryMutAct_9fa48("149418") ? true : (stryCov_9fa48("149418", "149419", "149420"), typeof wasmLifecycle !== TYPEOF.OBJECT)) {
            if (stryMutAct_9fa48("149421")) {
              {}
            } else {
              stryCov_9fa48("149421");
              throw new DriverLifecycleError(this.kind, DRIVER_ACTION.PREPARE, WASM_COMPONENT_ERROR.LIFECYCLE_NOT_OBJECT);
            }
          }
          const replicaConfig = context.replicaConfig;
          try {
            if (stryMutAct_9fa48("149422")) {
              {}
            } else {
              stryCov_9fa48("149422");
              wasmLifecycle.createReplica(definition, replicaConfig);
            }
          } catch (cause) {
            if (stryMutAct_9fa48("149423")) {
              {}
            } else {
              stryCov_9fa48("149423");
              return buildDriverStatusResult(PREPARE_STATUS.FAILED, (stryMutAct_9fa48("149424") ? `` : (stryCov_9fa48("149424"), `${WASM_COMPONENT_ERROR.CREATE_REPLICA_FAILED}`)) + (stryMutAct_9fa48("149425") ? `` : (stryCov_9fa48("149425"), `${DRIVER_SEPARATOR.DETAIL}${cause.message}`)));
            }
          }
          this._lifecycles.set(serviceId, wasmLifecycle);
        }
      }
      this._prepared.set(serviceId, definition);
      return stryMutAct_9fa48("149426") ? {} : (stryCov_9fa48("149426"), {
        status: PREPARE_STATUS.READY
      });
    }
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
    if (stryMutAct_9fa48("149427")) {
      {}
    } else {
      stryCov_9fa48("149427");
      if (stryMutAct_9fa48("149430") ? !replicaContext && typeof replicaContext !== TYPEOF.OBJECT : stryMutAct_9fa48("149429") ? false : stryMutAct_9fa48("149428") ? true : (stryCov_9fa48("149428", "149429", "149430"), (stryMutAct_9fa48("149431") ? replicaContext : (stryCov_9fa48("149431"), !replicaContext)) || (stryMutAct_9fa48("149433") ? typeof replicaContext === TYPEOF.OBJECT : stryMutAct_9fa48("149432") ? false : (stryCov_9fa48("149432", "149433"), typeof replicaContext !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("149434")) {
          {}
        } else {
          stryCov_9fa48("149434");
          throw new DriverLifecycleError(this.kind, DRIVER_ACTION.START, WASM_COMPONENT_ERROR.REPLICA_CONTEXT_REQUIRED);
        }
      }
      const serviceId = stryMutAct_9fa48("149435") ? replicaContext[DRIVER_FIELD.SERVICE_ID] && replicaContext[DRIVER_FIELD.SERVICE_ID_LEGACY] : (stryCov_9fa48("149435"), replicaContext[DRIVER_FIELD.SERVICE_ID] ?? replicaContext[DRIVER_FIELD.SERVICE_ID_LEGACY]);
      if (stryMutAct_9fa48("149438") ? false : stryMutAct_9fa48("149437") ? true : stryMutAct_9fa48("149436") ? serviceId : (stryCov_9fa48("149436", "149437", "149438"), !serviceId)) {
        if (stryMutAct_9fa48("149439")) {
          {}
        } else {
          stryCov_9fa48("149439");
          throw new DriverLifecycleError(this.kind, DRIVER_ACTION.START, WASM_COMPONENT_ERROR.SERVICE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("149442") ? false : stryMutAct_9fa48("149441") ? true : stryMutAct_9fa48("149440") ? this._prepared.has(serviceId) : (stryCov_9fa48("149440", "149441", "149442"), !this._prepared.has(serviceId))) {
        if (stryMutAct_9fa48("149443")) {
          {}
        } else {
          stryCov_9fa48("149443");
          return buildDriverStatusResult(START_STATUS.FAILED, buildDriverServiceScopedError(WASM_COMPONENT_ERROR.NOT_PREPARED, serviceId));
        }
      }
      const lifecycle = this._lifecycles.get(serviceId);
      if (stryMutAct_9fa48("149445") ? false : stryMutAct_9fa48("149444") ? true : (stryCov_9fa48("149444", "149445"), lifecycle)) {
        if (stryMutAct_9fa48("149446")) {
          {}
        } else {
          stryCov_9fa48("149446");
          try {
            if (stryMutAct_9fa48("149447")) {
              {}
            } else {
              stryCov_9fa48("149447");
              const startResult = lifecycle.startReplica(serviceId, replicaContext.startOptions);
              if (stryMutAct_9fa48("149450") ? false : stryMutAct_9fa48("149449") ? true : stryMutAct_9fa48("149448") ? startResult : (stryCov_9fa48("149448", "149449", "149450"), !startResult)) {
                if (stryMutAct_9fa48("149451")) {
                  {}
                } else {
                  stryCov_9fa48("149451");
                  return buildDriverStatusResult(START_STATUS.FAILED, WASM_COMPONENT_ERROR.START_REPLICA_NO_RESULT);
                }
              }
              if (stryMutAct_9fa48("149454") ? startResult.started !== false : stryMutAct_9fa48("149453") ? false : stryMutAct_9fa48("149452") ? true : (stryCov_9fa48("149452", "149453", "149454"), startResult.started === (stryMutAct_9fa48("149455") ? true : (stryCov_9fa48("149455"), false)))) {
                if (stryMutAct_9fa48("149456")) {
                  {}
                } else {
                  stryCov_9fa48("149456");
                  const result = buildDriverStatusResult(START_STATUS.FAILED, (stryMutAct_9fa48("149457") ? `` : (stryCov_9fa48("149457"), `${WASM_COMPONENT_ERROR.START_REPLICA_FAILED}`)) + (stryMutAct_9fa48("149458") ? `` : (stryCov_9fa48("149458"), `${DRIVER_SEPARATOR.DETAIL}`)) + (stryMutAct_9fa48("149459") ? `` : (stryCov_9fa48("149459"), `${stryMutAct_9fa48("149462") ? startResult.error && WASM_COMPONENT_ERROR.UNKNOWN_LIFECYCLE_FAILURE : stryMutAct_9fa48("149461") ? false : stryMutAct_9fa48("149460") ? true : (stryCov_9fa48("149460", "149461", "149462"), startResult.error || WASM_COMPONENT_ERROR.UNKNOWN_LIFECYCLE_FAILURE)}`)));
                  if (stryMutAct_9fa48("149464") ? false : stryMutAct_9fa48("149463") ? true : (stryCov_9fa48("149463", "149464"), startResult.diagnostic)) {
                    if (stryMutAct_9fa48("149465")) {
                      {}
                    } else {
                      stryCov_9fa48("149465");
                      result.diagnostic = startResult.diagnostic;
                    }
                  }
                  return result;
                }
              }
              this._running.add(serviceId);
              const result = stryMutAct_9fa48("149466") ? {} : (stryCov_9fa48("149466"), {
                status: START_STATUS.RUNNING
              });
              if (stryMutAct_9fa48("149469") ? startResult || startResult.port : stryMutAct_9fa48("149468") ? false : stryMutAct_9fa48("149467") ? true : (stryCov_9fa48("149467", "149468", "149469"), startResult && startResult.port)) {
                if (stryMutAct_9fa48("149470")) {
                  {}
                } else {
                  stryCov_9fa48("149470");
                  result.endpointIntent = stryMutAct_9fa48("149471") ? {} : (stryCov_9fa48("149471"), {
                    host: stryMutAct_9fa48("149472") ? (replicaContext.endpointHost ?? replicaContext.address) && DRIVER_ENDPOINT_DEFAULT.HOST : (stryCov_9fa48("149472"), (stryMutAct_9fa48("149473") ? replicaContext.endpointHost && replicaContext.address : (stryCov_9fa48("149473"), replicaContext.endpointHost ?? replicaContext.address)) ?? DRIVER_ENDPOINT_DEFAULT.HOST),
                    port: startResult.port,
                    protocol: stryMutAct_9fa48("149474") ? replicaContext.endpointProtocol && DRIVER_ENDPOINT_DEFAULT.PROTOCOL : (stryCov_9fa48("149474"), replicaContext.endpointProtocol ?? DRIVER_ENDPOINT_DEFAULT.PROTOCOL)
                  });
                }
              }
              return result;
            }
          } catch (cause) {
            if (stryMutAct_9fa48("149475")) {
              {}
            } else {
              stryCov_9fa48("149475");
              return buildDriverStatusResult(START_STATUS.FAILED, (stryMutAct_9fa48("149476") ? `` : (stryCov_9fa48("149476"), `${WASM_COMPONENT_ERROR.START_REPLICA_FAILED}`)) + (stryMutAct_9fa48("149477") ? `` : (stryCov_9fa48("149477"), `${DRIVER_SEPARATOR.DETAIL}${cause.message}`)));
            }
          }
        }
      }

      // No lifecycle — standalone/test mode
      this._running.add(serviceId);
      const result = stryMutAct_9fa48("149478") ? {} : (stryCov_9fa48("149478"), {
        status: START_STATUS.RUNNING
      });
      if (stryMutAct_9fa48("149481") ? replicaContext.endpointHost || replicaContext.endpointPort : stryMutAct_9fa48("149480") ? false : stryMutAct_9fa48("149479") ? true : (stryCov_9fa48("149479", "149480", "149481"), replicaContext.endpointHost && replicaContext.endpointPort)) {
        if (stryMutAct_9fa48("149482")) {
          {}
        } else {
          stryCov_9fa48("149482");
          result.endpointIntent = stryMutAct_9fa48("149483") ? {} : (stryCov_9fa48("149483"), {
            host: replicaContext.endpointHost,
            port: replicaContext.endpointPort,
            protocol: stryMutAct_9fa48("149484") ? replicaContext.endpointProtocol && DRIVER_ENDPOINT_DEFAULT.PROTOCOL : (stryCov_9fa48("149484"), replicaContext.endpointProtocol ?? DRIVER_ENDPOINT_DEFAULT.PROTOCOL)
          });
        }
      }
      return result;
    }
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
    if (stryMutAct_9fa48("149485")) {
      {}
    } else {
      stryCov_9fa48("149485");
      if (stryMutAct_9fa48("149488") ? !replicaContext && typeof replicaContext !== TYPEOF.OBJECT : stryMutAct_9fa48("149487") ? false : stryMutAct_9fa48("149486") ? true : (stryCov_9fa48("149486", "149487", "149488"), (stryMutAct_9fa48("149489") ? replicaContext : (stryCov_9fa48("149489"), !replicaContext)) || (stryMutAct_9fa48("149491") ? typeof replicaContext === TYPEOF.OBJECT : stryMutAct_9fa48("149490") ? false : (stryCov_9fa48("149490", "149491"), typeof replicaContext !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("149492")) {
          {}
        } else {
          stryCov_9fa48("149492");
          throw new DriverLifecycleError(this.kind, DRIVER_ACTION.STOP, WASM_COMPONENT_ERROR.REPLICA_CONTEXT_REQUIRED);
        }
      }
      const serviceId = stryMutAct_9fa48("149493") ? replicaContext[DRIVER_FIELD.SERVICE_ID] && replicaContext[DRIVER_FIELD.SERVICE_ID_LEGACY] : (stryCov_9fa48("149493"), replicaContext[DRIVER_FIELD.SERVICE_ID] ?? replicaContext[DRIVER_FIELD.SERVICE_ID_LEGACY]);
      if (stryMutAct_9fa48("149496") ? false : stryMutAct_9fa48("149495") ? true : stryMutAct_9fa48("149494") ? serviceId : (stryCov_9fa48("149494", "149495", "149496"), !serviceId)) {
        if (stryMutAct_9fa48("149497")) {
          {}
        } else {
          stryCov_9fa48("149497");
          throw new DriverLifecycleError(this.kind, DRIVER_ACTION.STOP, WASM_COMPONENT_ERROR.SERVICE_ID_REQUIRED);
        }
      }
      const lifecycle = this._lifecycles.get(serviceId);
      if (stryMutAct_9fa48("149499") ? false : stryMutAct_9fa48("149498") ? true : (stryCov_9fa48("149498", "149499"), lifecycle)) {
        if (stryMutAct_9fa48("149500")) {
          {}
        } else {
          stryCov_9fa48("149500");
          try {
            if (stryMutAct_9fa48("149501")) {
              {}
            } else {
              stryCov_9fa48("149501");
              await lifecycle.stopReplica(serviceId);
            }
          } catch (cause) {
            if (stryMutAct_9fa48("149502")) {
              {}
            } else {
              stryCov_9fa48("149502");
              throw new DriverLifecycleError(this.kind, DRIVER_ACTION.STOP, (stryMutAct_9fa48("149503") ? `` : (stryCov_9fa48("149503"), `${WASM_COMPONENT_ERROR.STOP_REPLICA_FAILED}`)) + (stryMutAct_9fa48("149504") ? `` : (stryCov_9fa48("149504"), `${DRIVER_SEPARATOR.DETAIL}${cause.message}`)), stryMutAct_9fa48("149505") ? {} : (stryCov_9fa48("149505"), {
                cause
              }));
            }
          }
        }
      }
      this._running.delete(serviceId);
      this._prepared.delete(serviceId);
      this._lifecycles.delete(serviceId);
    }
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
    if (stryMutAct_9fa48("149506")) {
      {}
    } else {
      stryCov_9fa48("149506");
      let result;
      if (stryMutAct_9fa48("149509") ? !replicaContext && typeof replicaContext !== TYPEOF.OBJECT : stryMutAct_9fa48("149508") ? false : stryMutAct_9fa48("149507") ? true : (stryCov_9fa48("149507", "149508", "149509"), (stryMutAct_9fa48("149510") ? replicaContext : (stryCov_9fa48("149510"), !replicaContext)) || (stryMutAct_9fa48("149512") ? typeof replicaContext === TYPEOF.OBJECT : stryMutAct_9fa48("149511") ? false : (stryCov_9fa48("149511", "149512"), typeof replicaContext !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("149513")) {
          {}
        } else {
          stryCov_9fa48("149513");
          result = stryMutAct_9fa48("149514") ? {} : (stryCov_9fa48("149514"), {
            status: HEALTH_STATUS.UNKNOWN,
            detail: WASM_COMPONENT_ERROR.REPLICA_CONTEXT_REQUIRED
          });
        }
      } else {
        if (stryMutAct_9fa48("149515")) {
          {}
        } else {
          stryCov_9fa48("149515");
          const serviceId = stryMutAct_9fa48("149516") ? replicaContext[DRIVER_FIELD.SERVICE_ID] && replicaContext[DRIVER_FIELD.SERVICE_ID_LEGACY] : (stryCov_9fa48("149516"), replicaContext[DRIVER_FIELD.SERVICE_ID] ?? replicaContext[DRIVER_FIELD.SERVICE_ID_LEGACY]);
          if (stryMutAct_9fa48("149519") ? false : stryMutAct_9fa48("149518") ? true : stryMutAct_9fa48("149517") ? serviceId : (stryCov_9fa48("149517", "149518", "149519"), !serviceId)) {
            if (stryMutAct_9fa48("149520")) {
              {}
            } else {
              stryCov_9fa48("149520");
              result = stryMutAct_9fa48("149521") ? {} : (stryCov_9fa48("149521"), {
                status: HEALTH_STATUS.UNKNOWN,
                detail: WASM_COMPONENT_ERROR.SERVICE_ID_REQUIRED
              });
            }
          } else if (stryMutAct_9fa48("149524") ? false : stryMutAct_9fa48("149523") ? true : stryMutAct_9fa48("149522") ? this._prepared.has(serviceId) : (stryCov_9fa48("149522", "149523", "149524"), !this._prepared.has(serviceId))) {
            if (stryMutAct_9fa48("149525")) {
              {}
            } else {
              stryCov_9fa48("149525");
              result = stryMutAct_9fa48("149526") ? {} : (stryCov_9fa48("149526"), {
                status: HEALTH_STATUS.UNHEALTHY,
                detail: buildDriverServiceScopedError(WASM_COMPONENT_ERROR.NOT_PREPARED, serviceId)
              });
            }
          } else if (stryMutAct_9fa48("149529") ? false : stryMutAct_9fa48("149528") ? true : stryMutAct_9fa48("149527") ? this._running.has(serviceId) : (stryCov_9fa48("149527", "149528", "149529"), !this._running.has(serviceId))) {
            if (stryMutAct_9fa48("149530")) {
              {}
            } else {
              stryCov_9fa48("149530");
              result = stryMutAct_9fa48("149531") ? {} : (stryCov_9fa48("149531"), {
                status: HEALTH_STATUS.UNHEALTHY,
                detail: buildDriverServiceScopedError(WASM_COMPONENT_ERROR.NOT_STARTED, serviceId)
              });
            }
          } else {
            if (stryMutAct_9fa48("149532")) {
              {}
            } else {
              stryCov_9fa48("149532");
              const lifecycle = this._lifecycles.get(serviceId);
              const replica = lifecycle ? lifecycle.getReplica(serviceId) : stryMutAct_9fa48("149533") ? false : (stryCov_9fa48("149533"), true);
              result = replica ? stryMutAct_9fa48("149534") ? {} : (stryCov_9fa48("149534"), {
                status: HEALTH_STATUS.HEALTHY
              }) : stryMutAct_9fa48("149535") ? {} : (stryCov_9fa48("149535"), {
                status: HEALTH_STATUS.UNHEALTHY,
                detail: buildDriverServiceScopedError(WASM_COMPONENT_ERROR.NOT_STARTED, serviceId)
              });
            }
          }
        }
      }
      return result;
    }
  }
}
export { WasmComponentDriver, WASM_COMPONENT_ERROR };