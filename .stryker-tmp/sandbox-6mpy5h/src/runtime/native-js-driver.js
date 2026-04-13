/**
 * Native_JS_Driver — runtime driver for existing in-process JS
 * handlers running inside replicated service runtime.
 *
 * Wraps current admin command handlers (e.g. sys-admin-meta)
 * in the RuntimeDriver contract without requiring rewrites.
 * The driver resolves handler references, validates them, and
 * manages their availability lifecycle.
 *
 * Supports two handler shapes in the handlerMap:
 *   1. Plain function — simple handler (existing behavior).
 *   2. Lifecycle-capable module — object exposing prepare,
 *      start, stop, health methods. Lifecycle calls are
 *      delegated to the module directly.
 *
 * Contract rules:
 *   1. No driver writes system metadata directly.
 *   2. All driver failures return typed errors.
 *   3. Driver lifecycle calls are idempotent where possible.
 *
 * Requirements: 2.1, 2.2, 2.4, 9.4
 *
 * @module runtime/native-js-driver
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
import { NUM } from '../constants/index.js';
import { TYPEOF } from '../constants/types.js';
import { RuntimeDriver, PREPARE_STATUS, START_STATUS, HEALTH_STATUS } from './runtime-driver.js';
import { DriverValidationError, DriverLifecycleError } from './runtime-driver-errors.js';

// --- Driver-specific constants ---
const NATIVE_JS_DRIVER_LITERAL = Object.freeze(stryMutAct_9fa48("146542") ? {} : (stryCov_9fa48("146542"), {
  PREPARE: stryMutAct_9fa48("146543") ? "" : (stryCov_9fa48("146543"), 'prepare'),
  START: stryMutAct_9fa48("146544") ? "" : (stryCov_9fa48("146544"), 'start'),
  WS: stryMutAct_9fa48("146545") ? "" : (stryCov_9fa48("146545"), 'ws'),
  STOP: stryMutAct_9fa48("146546") ? "" : (stryCov_9fa48("146546"), 'stop')
}));
const NATIVE_JS_ERROR = Object.freeze(stryMutAct_9fa48("146547") ? {} : (stryCov_9fa48("146547"), {
  REF_REQUIRED: stryMutAct_9fa48("146548") ? "" : (stryCov_9fa48("146548"), 'runtime_ref is required for native_js driver'),
  REF_MUST_BE_STRING: stryMutAct_9fa48("146549") ? "" : (stryCov_9fa48("146549"), 'runtime_ref must be a string'),
  REF_EMPTY: stryMutAct_9fa48("146550") ? "" : (stryCov_9fa48("146550"), 'runtime_ref must not be empty'),
  DEFINITION_REQUIRED: stryMutAct_9fa48("146551") ? "" : (stryCov_9fa48("146551"), 'service definition is required'),
  HANDLER_NOT_FOUND: stryMutAct_9fa48("146552") ? "" : (stryCov_9fa48("146552"), 'handler not found for runtime_ref'),
  HANDLER_NOT_FUNCTION: stryMutAct_9fa48("146553") ? "" : (stryCov_9fa48("146553"), 'resolved handler is not a function'),
  HANDLER_INVALID_TYPE: stryMutAct_9fa48("146554") ? "" : (stryCov_9fa48("146554"), 'resolved handler must be a function or lifecycle module'),
  HANDLER_MAP_NOT_OBJECT: stryMutAct_9fa48("146555") ? "" : (stryCov_9fa48("146555"), 'handler map must be a non-null object'),
  REPLICA_CONTEXT_REQUIRED: stryMutAct_9fa48("146556") ? "" : (stryCov_9fa48("146556"), 'replicaContext is required'),
  SERVICE_ID_REQUIRED: stryMutAct_9fa48("146557") ? "" : (stryCov_9fa48("146557"), 'replicaContext.serviceId is required'),
  NOT_PREPARED: stryMutAct_9fa48("146558") ? "" : (stryCov_9fa48("146558"), 'driver has not been prepared for this service'),
  NOT_STARTED: stryMutAct_9fa48("146559") ? "" : (stryCov_9fa48("146559"), 'service is not running')
})); // --- Lifecycle module detection ---
const LIFECYCLE_METHODS = Object.freeze(stryMutAct_9fa48("146560") ? [] : (stryCov_9fa48("146560"), [stryMutAct_9fa48("146561") ? "" : (stryCov_9fa48("146561"), 'prepare'), stryMutAct_9fa48("146562") ? "" : (stryCov_9fa48("146562"), 'start'), stryMutAct_9fa48("146563") ? "" : (stryCov_9fa48("146563"), 'stop'), stryMutAct_9fa48("146564") ? "" : (stryCov_9fa48("146564"), 'health')])); /**
                                                                                                                                                                                                                                                                                                                                                                                                  * Check whether a resolved handler is a lifecycle-capable module.
                                                                                                                                                                                                                                                                                                                                                                                                  *
                                                                                                                                                                                                                                                                                                                                                                                                  * A lifecycle module is a non-null object exposing prepare, start,
                                                                                                                                                                                                                                                                                                                                                                                                  * stop, and health as functions.
                                                                                                                                                                                                                                                                                                                                                                                                  *
                                                                                                                                                                                                                                                                                                                                                                                                  * @param {*} handler - The resolved handler from handlerMap.
                                                                                                                                                                                                                                                                                                                                                                                                  * @return {boolean}
                                                                                                                                                                                                                                                                                                                                                                                                  */
function isLifecycleModule(handler) {
  if (stryMutAct_9fa48("146565")) {
    {}
  } else {
    stryCov_9fa48("146565");
    if (stryMutAct_9fa48("146568") ? !handler && typeof handler !== TYPEOF.OBJECT : stryMutAct_9fa48("146567") ? false : stryMutAct_9fa48("146566") ? true : (stryCov_9fa48("146566", "146567", "146568"), (stryMutAct_9fa48("146569") ? handler : (stryCov_9fa48("146569"), !handler)) || (stryMutAct_9fa48("146571") ? typeof handler === TYPEOF.OBJECT : stryMutAct_9fa48("146570") ? false : (stryCov_9fa48("146570", "146571"), typeof handler !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("146572")) {
        {}
      } else {
        stryCov_9fa48("146572");
        return stryMutAct_9fa48("146573") ? true : (stryCov_9fa48("146573"), false);
      }
    }
    return stryMutAct_9fa48("146574") ? LIFECYCLE_METHODS.some(m => typeof handler[m] === TYPEOF.FUNCTION) : (stryCov_9fa48("146574"), LIFECYCLE_METHODS.every(stryMutAct_9fa48("146575") ? () => undefined : (stryCov_9fa48("146575"), m => stryMutAct_9fa48("146578") ? typeof handler[m] !== TYPEOF.FUNCTION : stryMutAct_9fa48("146577") ? false : stryMutAct_9fa48("146576") ? true : (stryCov_9fa48("146576", "146577", "146578"), typeof handler[m] === TYPEOF.FUNCTION))));
  }
} /**
  * Native_JS_Driver — executes existing in-process JS handlers
  * inside the replicated service runtime contract.
  *
  * Usage:
  *   const driver = new NativeJsDriver();
  *   const validation = driver.validateDescriptor(definition);
  *   await driver.prepare(definition, {handlerMap});
  *   await driver.start(replicaContext);
  *   const health = await driver.health(replicaContext);
  *   await driver.stop(replicaContext);
  *
  * @extends RuntimeDriver
  */
class NativeJsDriver extends RuntimeDriver {
  constructor() {
    if (stryMutAct_9fa48("146579")) {
      {}
    } else {
      stryCov_9fa48("146579");
      super(RUNTIME_KIND.NATIVE_JS); /**
                                     * Prepared handler references keyed by serviceId.
                                     * @type {Map<string, Function>}
                                     * @private
                                     */
      this._prepared = new Map(); /**
                                  * Lifecycle-capable modules keyed by serviceId.
                                  * @type {Map<string, Object>}
                                  * @private
                                  */
      this._lifecycleModules = new Map(); /**
                                          * Running service IDs.
                                          * @type {Set<string>}
                                          * @private
                                          */
      this._running = new Set();
    }
  } /**
    * Validate a service definition's runtime descriptor for
    * native_js runtime kind.
    *
    * Checks:
    *   - definition is present
    *   - runtime_ref is a non-empty string
    *
    * @param {Object} definition - The service definition.
    * @return {{valid: boolean, errors?: string[]}}
    */
  validateDescriptor(definition) {
    if (stryMutAct_9fa48("146580")) {
      {}
    } else {
      stryCov_9fa48("146580");
      const errors = stryMutAct_9fa48("146581") ? ["Stryker was here"] : (stryCov_9fa48("146581"), []);
      if (stryMutAct_9fa48("146584") ? !definition && typeof definition !== TYPEOF.OBJECT : stryMutAct_9fa48("146583") ? false : stryMutAct_9fa48("146582") ? true : (stryCov_9fa48("146582", "146583", "146584"), (stryMutAct_9fa48("146585") ? definition : (stryCov_9fa48("146585"), !definition)) || (stryMutAct_9fa48("146587") ? typeof definition === TYPEOF.OBJECT : stryMutAct_9fa48("146586") ? false : (stryCov_9fa48("146586", "146587"), typeof definition !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("146588")) {
          {}
        } else {
          stryCov_9fa48("146588");
          errors.push(NATIVE_JS_ERROR.DEFINITION_REQUIRED);
          return stryMutAct_9fa48("146589") ? {} : (stryCov_9fa48("146589"), {
            valid: stryMutAct_9fa48("146590") ? true : (stryCov_9fa48("146590"), false),
            errors
          });
        }
      }
      const ref = stryMutAct_9fa48("146591") ? definition[RUNTIME_FIELD.RUNTIME_REF] && definition.runtimeRef : (stryCov_9fa48("146591"), definition[RUNTIME_FIELD.RUNTIME_REF] ?? definition.runtimeRef);
      if (stryMutAct_9fa48("146594") ? ref === undefined && ref === null : stryMutAct_9fa48("146593") ? false : stryMutAct_9fa48("146592") ? true : (stryCov_9fa48("146592", "146593", "146594"), (stryMutAct_9fa48("146596") ? ref !== undefined : stryMutAct_9fa48("146595") ? false : (stryCov_9fa48("146595", "146596"), ref === undefined)) || (stryMutAct_9fa48("146598") ? ref !== null : stryMutAct_9fa48("146597") ? false : (stryCov_9fa48("146597", "146598"), ref === null)))) {
        if (stryMutAct_9fa48("146599")) {
          {}
        } else {
          stryCov_9fa48("146599");
          errors.push(NATIVE_JS_ERROR.REF_REQUIRED);
        }
      } else if (stryMutAct_9fa48("146602") ? typeof ref === TYPEOF.STRING : stryMutAct_9fa48("146601") ? false : stryMutAct_9fa48("146600") ? true : (stryCov_9fa48("146600", "146601", "146602"), typeof ref !== TYPEOF.STRING)) {
        if (stryMutAct_9fa48("146603")) {
          {}
        } else {
          stryCov_9fa48("146603");
          errors.push(NATIVE_JS_ERROR.REF_MUST_BE_STRING);
        }
      } else if (stryMutAct_9fa48("146606") ? ref.trim().length !== NUM.ZERO : stryMutAct_9fa48("146605") ? false : stryMutAct_9fa48("146604") ? true : (stryCov_9fa48("146604", "146605", "146606"), (stryMutAct_9fa48("146607") ? ref.length : (stryCov_9fa48("146607"), ref.trim().length)) === NUM.ZERO)) {
        if (stryMutAct_9fa48("146608")) {
          {}
        } else {
          stryCov_9fa48("146608");
          errors.push(NATIVE_JS_ERROR.REF_EMPTY);
        }
      }
      if (stryMutAct_9fa48("146612") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("146611") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("146610") ? false : stryMutAct_9fa48("146609") ? true : (stryCov_9fa48("146609", "146610", "146611", "146612"), errors.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("146613")) {
          {}
        } else {
          stryCov_9fa48("146613");
          return stryMutAct_9fa48("146614") ? {} : (stryCov_9fa48("146614"), {
            valid: stryMutAct_9fa48("146615") ? true : (stryCov_9fa48("146615"), false),
            errors
          });
        }
      }
      return stryMutAct_9fa48("146616") ? {} : (stryCov_9fa48("146616"), {
        valid: stryMutAct_9fa48("146617") ? false : (stryCov_9fa48("146617"), true)
      });
    }
  } /**
    * Prepare runtime artifacts for a native_js service definition.
    *
    * Resolves the handler reference from the provided context's
    * handlerMap. The handlerMap maps runtime_ref strings to either:
    *   - handler functions (existing behavior), or
    *   - lifecycle-capable modules (objects with prepare, start,
    *     stop, health methods).
    *
    * When a lifecycle module is resolved, its prepare() method is
    * called and the module is stored for subsequent lifecycle
    * delegation.
    *
    * Idempotent: re-preparing an already-prepared service
    * updates the handler reference.
    *
    * @param {Object} definition - The service definition.
    * @param {Object} context - Must include {handlerMap: Object}.
    * @return {Promise<{status: string, error?: string}>}
    */
  buildPrepareResult(status, fields = {}) {
    if (stryMutAct_9fa48("146618")) {
      {}
    } else {
      stryCov_9fa48("146618");
      return stryMutAct_9fa48("146619") ? {} : (stryCov_9fa48("146619"), {
        status,
        ...fields
      });
    }
  }
  buildHealthResult(status, fields = {}) {
    if (stryMutAct_9fa48("146620")) {
      {}
    } else {
      stryCov_9fa48("146620");
      return stryMutAct_9fa48("146621") ? {} : (stryCov_9fa48("146621"), {
        status,
        ...fields
      });
    }
  }
  async prepare(definition, context) {
    if (stryMutAct_9fa48("146622")) {
      {}
    } else {
      stryCov_9fa48("146622");
      const validation = this.validateDescriptor(definition);
      if (stryMutAct_9fa48("146625") ? false : stryMutAct_9fa48("146624") ? true : stryMutAct_9fa48("146623") ? validation.valid : (stryCov_9fa48("146623", "146624", "146625"), !validation.valid)) {
        if (stryMutAct_9fa48("146626")) {
          {}
        } else {
          stryCov_9fa48("146626");
          throw new DriverValidationError(this.kind, validation.errors);
        }
      }
      const ref = stryMutAct_9fa48("146627") ? definition[RUNTIME_FIELD.RUNTIME_REF] && definition.runtimeRef : (stryCov_9fa48("146627"), definition[RUNTIME_FIELD.RUNTIME_REF] ?? definition.runtimeRef);
      const serviceId = stryMutAct_9fa48("146628") ? definition.serviceId && definition.service_id : (stryCov_9fa48("146628"), definition.serviceId ?? definition.service_id);
      const handlerMap = stryMutAct_9fa48("146629") ? context.handlerMap : (stryCov_9fa48("146629"), context?.handlerMap);
      if (stryMutAct_9fa48("146632") ? !handlerMap && typeof handlerMap !== TYPEOF.OBJECT : stryMutAct_9fa48("146631") ? false : stryMutAct_9fa48("146630") ? true : (stryCov_9fa48("146630", "146631", "146632"), (stryMutAct_9fa48("146633") ? handlerMap : (stryCov_9fa48("146633"), !handlerMap)) || (stryMutAct_9fa48("146635") ? typeof handlerMap === TYPEOF.OBJECT : stryMutAct_9fa48("146634") ? false : (stryCov_9fa48("146634", "146635"), typeof handlerMap !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("146636")) {
          {}
        } else {
          stryCov_9fa48("146636");
          throw new DriverLifecycleError(this.kind, NATIVE_JS_DRIVER_LITERAL.PREPARE, NATIVE_JS_ERROR.HANDLER_MAP_NOT_OBJECT);
        }
      }
      const handler = handlerMap[ref];
      if (stryMutAct_9fa48("146639") ? false : stryMutAct_9fa48("146638") ? true : stryMutAct_9fa48("146637") ? handler : (stryCov_9fa48("146637", "146638", "146639"), !handler)) {
        if (stryMutAct_9fa48("146640")) {
          {}
        } else {
          stryCov_9fa48("146640");
          return this.buildPrepareResult(PREPARE_STATUS.FAILED, stryMutAct_9fa48("146641") ? {} : (stryCov_9fa48("146641"), {
            error: stryMutAct_9fa48("146642") ? `` : (stryCov_9fa48("146642"), `${NATIVE_JS_ERROR.HANDLER_NOT_FOUND}: '${ref}'`)
          }));
        }
      } // Lifecycle-capable module: delegate prepare and store module
      if (stryMutAct_9fa48("146644") ? false : stryMutAct_9fa48("146643") ? true : (stryCov_9fa48("146643", "146644"), isLifecycleModule(handler))) {
        if (stryMutAct_9fa48("146645")) {
          {}
        } else {
          stryCov_9fa48("146645");
          const result = await handler.prepare(definition, context);
          if (stryMutAct_9fa48("146648") ? result.status !== PREPARE_STATUS.FAILED : stryMutAct_9fa48("146647") ? false : stryMutAct_9fa48("146646") ? true : (stryCov_9fa48("146646", "146647", "146648"), result.status === PREPARE_STATUS.FAILED)) {
            if (stryMutAct_9fa48("146649")) {
              {}
            } else {
              stryCov_9fa48("146649");
              return result;
            }
          }
          this._lifecycleModules.set(serviceId, handler);
          this._prepared.set(serviceId, handler);
          return this.buildPrepareResult(PREPARE_STATUS.READY);
        }
      }
      if (stryMutAct_9fa48("146652") ? typeof handler === TYPEOF.FUNCTION : stryMutAct_9fa48("146651") ? false : stryMutAct_9fa48("146650") ? true : (stryCov_9fa48("146650", "146651", "146652"), typeof handler !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("146653")) {
          {}
        } else {
          stryCov_9fa48("146653");
          return this.buildPrepareResult(PREPARE_STATUS.FAILED, stryMutAct_9fa48("146654") ? {} : (stryCov_9fa48("146654"), {
            error: stryMutAct_9fa48("146655") ? `` : (stryCov_9fa48("146655"), `${NATIVE_JS_ERROR.HANDLER_INVALID_TYPE}: '${ref}'`)
          }));
        }
      }
      this._lifecycleModules.delete(serviceId);
      this._prepared.set(serviceId, handler);
      return this.buildPrepareResult(PREPARE_STATUS.READY);
    }
  } /**
    * Start a native_js service replica.
    *
    * For lifecycle-capable modules, delegates to module.start().
    * For plain handlers, makes the handler available for
    * invocation and returns endpoint intent from replica context.
    *
    * Idempotent: starting an already-running replica is a no-op.
    *
    * @param {Object} replicaContext - Must include {serviceId}.
    * @return {Promise<{status: string, endpointIntent?: Object,
    *   error?: string}>}
    */
  async start(replicaContext) {
    if (stryMutAct_9fa48("146656")) {
      {}
    } else {
      stryCov_9fa48("146656");
      if (stryMutAct_9fa48("146659") ? !replicaContext && typeof replicaContext !== TYPEOF.OBJECT : stryMutAct_9fa48("146658") ? false : stryMutAct_9fa48("146657") ? true : (stryCov_9fa48("146657", "146658", "146659"), (stryMutAct_9fa48("146660") ? replicaContext : (stryCov_9fa48("146660"), !replicaContext)) || (stryMutAct_9fa48("146662") ? typeof replicaContext === TYPEOF.OBJECT : stryMutAct_9fa48("146661") ? false : (stryCov_9fa48("146661", "146662"), typeof replicaContext !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("146663")) {
          {}
        } else {
          stryCov_9fa48("146663");
          throw new DriverLifecycleError(this.kind, NATIVE_JS_DRIVER_LITERAL.START, NATIVE_JS_ERROR.REPLICA_CONTEXT_REQUIRED);
        }
      }
      const serviceId = stryMutAct_9fa48("146664") ? replicaContext.serviceId && replicaContext.service_id : (stryCov_9fa48("146664"), replicaContext.serviceId ?? replicaContext.service_id);
      if (stryMutAct_9fa48("146667") ? false : stryMutAct_9fa48("146666") ? true : stryMutAct_9fa48("146665") ? serviceId : (stryCov_9fa48("146665", "146666", "146667"), !serviceId)) {
        if (stryMutAct_9fa48("146668")) {
          {}
        } else {
          stryCov_9fa48("146668");
          throw new DriverLifecycleError(this.kind, NATIVE_JS_DRIVER_LITERAL.START, NATIVE_JS_ERROR.SERVICE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("146671") ? false : stryMutAct_9fa48("146670") ? true : stryMutAct_9fa48("146669") ? this._prepared.has(serviceId) : (stryCov_9fa48("146669", "146670", "146671"), !this._prepared.has(serviceId))) {
        if (stryMutAct_9fa48("146672")) {
          {}
        } else {
          stryCov_9fa48("146672");
          return stryMutAct_9fa48("146673") ? {} : (stryCov_9fa48("146673"), {
            status: START_STATUS.FAILED,
            error: stryMutAct_9fa48("146674") ? `` : (stryCov_9fa48("146674"), `${NATIVE_JS_ERROR.NOT_PREPARED}: '${serviceId}'`)
          });
        }
      } // Lifecycle module delegation
      const mod = this._lifecycleModules.get(serviceId);
      if (stryMutAct_9fa48("146676") ? false : stryMutAct_9fa48("146675") ? true : (stryCov_9fa48("146675", "146676"), mod)) {
        if (stryMutAct_9fa48("146677")) {
          {}
        } else {
          stryCov_9fa48("146677");
          const result = await mod.start(replicaContext);
          if (stryMutAct_9fa48("146680") ? result.status !== START_STATUS.RUNNING : stryMutAct_9fa48("146679") ? false : stryMutAct_9fa48("146678") ? true : (stryCov_9fa48("146678", "146679", "146680"), result.status === START_STATUS.RUNNING)) {
            if (stryMutAct_9fa48("146681")) {
              {}
            } else {
              stryCov_9fa48("146681");
              this._running.add(serviceId);
            }
          }
          return result;
        }
      } // Plain handler path (existing behavior)
      this._running.add(serviceId);
      const result = stryMutAct_9fa48("146682") ? {} : (stryCov_9fa48("146682"), {
        status: START_STATUS.RUNNING
      }); // Provide endpoint intent if replica context has endpoint config
      if (stryMutAct_9fa48("146685") ? replicaContext.endpointHost || replicaContext.endpointPort : stryMutAct_9fa48("146684") ? false : stryMutAct_9fa48("146683") ? true : (stryCov_9fa48("146683", "146684", "146685"), replicaContext.endpointHost && replicaContext.endpointPort)) {
        if (stryMutAct_9fa48("146686")) {
          {}
        } else {
          stryCov_9fa48("146686");
          result.endpointIntent = stryMutAct_9fa48("146687") ? {} : (stryCov_9fa48("146687"), {
            host: replicaContext.endpointHost,
            port: replicaContext.endpointPort,
            protocol: stryMutAct_9fa48("146688") ? replicaContext.endpointProtocol && NATIVE_JS_DRIVER_LITERAL.WS : (stryCov_9fa48("146688"), replicaContext.endpointProtocol ?? NATIVE_JS_DRIVER_LITERAL.WS)
          });
        }
      }
      return result;
    }
  } /**
    * Stop a native_js service replica.
    *
    * For lifecycle-capable modules, delegates to module.stop().
    * For plain handlers, cleans up handler resources.
    * Idempotent: stopping an already-stopped replica is a no-op.
    *
    * @param {Object} replicaContext - Must include {serviceId}.
    * @return {Promise<void>}
    */
  async stop(replicaContext) {
    if (stryMutAct_9fa48("146689")) {
      {}
    } else {
      stryCov_9fa48("146689");
      if (stryMutAct_9fa48("146692") ? !replicaContext && typeof replicaContext !== TYPEOF.OBJECT : stryMutAct_9fa48("146691") ? false : stryMutAct_9fa48("146690") ? true : (stryCov_9fa48("146690", "146691", "146692"), (stryMutAct_9fa48("146693") ? replicaContext : (stryCov_9fa48("146693"), !replicaContext)) || (stryMutAct_9fa48("146695") ? typeof replicaContext === TYPEOF.OBJECT : stryMutAct_9fa48("146694") ? false : (stryCov_9fa48("146694", "146695"), typeof replicaContext !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("146696")) {
          {}
        } else {
          stryCov_9fa48("146696");
          throw new DriverLifecycleError(this.kind, NATIVE_JS_DRIVER_LITERAL.STOP, NATIVE_JS_ERROR.REPLICA_CONTEXT_REQUIRED);
        }
      }
      const serviceId = stryMutAct_9fa48("146697") ? replicaContext.serviceId && replicaContext.service_id : (stryCov_9fa48("146697"), replicaContext.serviceId ?? replicaContext.service_id);
      if (stryMutAct_9fa48("146700") ? false : stryMutAct_9fa48("146699") ? true : stryMutAct_9fa48("146698") ? serviceId : (stryCov_9fa48("146698", "146699", "146700"), !serviceId)) {
        if (stryMutAct_9fa48("146701")) {
          {}
        } else {
          stryCov_9fa48("146701");
          throw new DriverLifecycleError(this.kind, NATIVE_JS_DRIVER_LITERAL.STOP, NATIVE_JS_ERROR.SERVICE_ID_REQUIRED);
        }
      } // Lifecycle module delegation
      const mod = this._lifecycleModules.get(serviceId);
      if (stryMutAct_9fa48("146703") ? false : stryMutAct_9fa48("146702") ? true : (stryCov_9fa48("146702", "146703"), mod)) {
        if (stryMutAct_9fa48("146704")) {
          {}
        } else {
          stryCov_9fa48("146704");
          await mod.stop(replicaContext);
        }
      } // Clean up state for both paths
      this._running.delete(serviceId);
      this._prepared.delete(serviceId);
      this._lifecycleModules.delete(serviceId);
    }
  } /**
    * Check health of a native_js service replica.
    *
    * For lifecycle-capable modules, delegates to module.health().
    * For plain handlers, verifies the handler is prepared and
    * the service is running.
    *
    * @param {Object} replicaContext - Must include {serviceId}.
    * @return {Promise<{status: string, detail?: string}>}
    */
  async health(replicaContext) {
    if (stryMutAct_9fa48("146705")) {
      {}
    } else {
      stryCov_9fa48("146705");
      if (stryMutAct_9fa48("146708") ? !replicaContext && typeof replicaContext !== TYPEOF.OBJECT : stryMutAct_9fa48("146707") ? false : stryMutAct_9fa48("146706") ? true : (stryCov_9fa48("146706", "146707", "146708"), (stryMutAct_9fa48("146709") ? replicaContext : (stryCov_9fa48("146709"), !replicaContext)) || (stryMutAct_9fa48("146711") ? typeof replicaContext === TYPEOF.OBJECT : stryMutAct_9fa48("146710") ? false : (stryCov_9fa48("146710", "146711"), typeof replicaContext !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("146712")) {
          {}
        } else {
          stryCov_9fa48("146712");
          return this.buildHealthResult(HEALTH_STATUS.UNKNOWN, stryMutAct_9fa48("146713") ? {} : (stryCov_9fa48("146713"), {
            detail: NATIVE_JS_ERROR.REPLICA_CONTEXT_REQUIRED
          }));
        }
      }
      const serviceId = stryMutAct_9fa48("146714") ? replicaContext.serviceId && replicaContext.service_id : (stryCov_9fa48("146714"), replicaContext.serviceId ?? replicaContext.service_id);
      if (stryMutAct_9fa48("146717") ? false : stryMutAct_9fa48("146716") ? true : stryMutAct_9fa48("146715") ? serviceId : (stryCov_9fa48("146715", "146716", "146717"), !serviceId)) {
        if (stryMutAct_9fa48("146718")) {
          {}
        } else {
          stryCov_9fa48("146718");
          return this.buildHealthResult(HEALTH_STATUS.UNKNOWN, stryMutAct_9fa48("146719") ? {} : (stryCov_9fa48("146719"), {
            detail: NATIVE_JS_ERROR.SERVICE_ID_REQUIRED
          }));
        }
      }
      if (stryMutAct_9fa48("146722") ? false : stryMutAct_9fa48("146721") ? true : stryMutAct_9fa48("146720") ? this._prepared.has(serviceId) : (stryCov_9fa48("146720", "146721", "146722"), !this._prepared.has(serviceId))) {
        if (stryMutAct_9fa48("146723")) {
          {}
        } else {
          stryCov_9fa48("146723");
          return this.buildHealthResult(HEALTH_STATUS.UNHEALTHY, stryMutAct_9fa48("146724") ? {} : (stryCov_9fa48("146724"), {
            detail: stryMutAct_9fa48("146725") ? `` : (stryCov_9fa48("146725"), `${NATIVE_JS_ERROR.NOT_PREPARED}: '${serviceId}'`)
          }));
        }
      }
      if (stryMutAct_9fa48("146728") ? false : stryMutAct_9fa48("146727") ? true : stryMutAct_9fa48("146726") ? this._running.has(serviceId) : (stryCov_9fa48("146726", "146727", "146728"), !this._running.has(serviceId))) {
        if (stryMutAct_9fa48("146729")) {
          {}
        } else {
          stryCov_9fa48("146729");
          return this.buildHealthResult(HEALTH_STATUS.UNHEALTHY, stryMutAct_9fa48("146730") ? {} : (stryCov_9fa48("146730"), {
            detail: stryMutAct_9fa48("146731") ? `` : (stryCov_9fa48("146731"), `${NATIVE_JS_ERROR.NOT_STARTED}: '${serviceId}'`)
          }));
        }
      } // Lifecycle module delegation
      const mod = this._lifecycleModules.get(serviceId);
      if (stryMutAct_9fa48("146733") ? false : stryMutAct_9fa48("146732") ? true : (stryCov_9fa48("146732", "146733"), mod)) {
        if (stryMutAct_9fa48("146734")) {
          {}
        } else {
          stryCov_9fa48("146734");
          return mod.health(replicaContext);
        }
      }
      return this.buildHealthResult(HEALTH_STATUS.HEALTHY);
    }
  } /**
    * Get the resolved handler for a running service.
    * Useful for the lifecycle owner to invoke the handler.
    *
    * @param {string} serviceId - The service identifier.
    * @return {Function|undefined} The handler function, or
    *   undefined if not prepared/running.
    */
  getHandler(serviceId) {
    if (stryMutAct_9fa48("146735")) {
      {}
    } else {
      stryCov_9fa48("146735");
      if (stryMutAct_9fa48("146738") ? false : stryMutAct_9fa48("146737") ? true : stryMutAct_9fa48("146736") ? this._running.has(serviceId) : (stryCov_9fa48("146736", "146737", "146738"), !this._running.has(serviceId))) {
        if (stryMutAct_9fa48("146739")) {
          {}
        } else {
          stryCov_9fa48("146739");
          return undefined;
        }
      }
      return this._prepared.get(serviceId);
    }
  }
}
export { NativeJsDriver, NATIVE_JS_ERROR, isLifecycleModule };