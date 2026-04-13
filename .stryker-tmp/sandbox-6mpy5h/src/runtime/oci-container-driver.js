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

const OCI_DIGEST_MARKER = stryMutAct_9fa48("146928") ? "" : (stryCov_9fa48("146928"), '@sha256:');
const OCI_DRIVER_ERROR = Object.freeze(stryMutAct_9fa48("146929") ? {} : (stryCov_9fa48("146929"), {
  DEFINITION_REQUIRED: stryMutAct_9fa48("146930") ? "" : (stryCov_9fa48("146930"), 'service definition is required'),
  REF_REQUIRED: stryMutAct_9fa48("146931") ? "" : (stryCov_9fa48("146931"), 'runtime_ref is required for oci_container driver'),
  REF_MUST_BE_STRING: stryMutAct_9fa48("146932") ? "" : (stryCov_9fa48("146932"), 'runtime_ref must be a string'),
  REF_EMPTY: stryMutAct_9fa48("146933") ? "" : (stryCov_9fa48("146933"), 'runtime_ref must not be empty'),
  DIGEST_REQUIRED: stryMutAct_9fa48("146934") ? "" : (stryCov_9fa48("146934"), 'runtime_ref must contain digest pin (@sha256:)'),
  REPLICA_CONTEXT_REQUIRED: stryMutAct_9fa48("146935") ? "" : (stryCov_9fa48("146935"), 'replicaContext is required'),
  SERVICE_ID_REQUIRED: stryMutAct_9fa48("146936") ? "" : (stryCov_9fa48("146936"), 'replicaContext.serviceId is required'),
  NOT_PREPARED: stryMutAct_9fa48("146937") ? "" : (stryCov_9fa48("146937"), 'driver has not been prepared for this service'),
  NOT_STARTED: stryMutAct_9fa48("146938") ? "" : (stryCov_9fa48("146938"), 'service is not running'),
  FEATURE_GATE_DISABLED: stryMutAct_9fa48("146939") ? "" : (stryCov_9fa48("146939"), 'oci_container runtime is feature-gated and currently disabled')
}));

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
    if (stryMutAct_9fa48("146940")) {
      {}
    } else {
      stryCov_9fa48("146940");
      super(RUNTIME_KIND.OCI_CONTAINER);

      /**
       * Whether the OCI container feature gate is enabled.
       * @type {boolean}
       * @private
       */
      this._featureGateEnabled = stryMutAct_9fa48("146941") ? true : (stryCov_9fa48("146941"), false);

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
  }

  /**
   * Enable or disable the OCI container feature gate.
   *
   * @param {boolean} enabled - Whether to enable the gate.
   */
  setFeatureGate(enabled) {
    if (stryMutAct_9fa48("146942")) {
      {}
    } else {
      stryCov_9fa48("146942");
      this._featureGateEnabled = Boolean(enabled);
    }
  }

  /**
   * Check whether the feature gate is enabled.
   *
   * @return {{enabled: boolean}}
   * @private
   */
  _checkFeatureGate() {
    if (stryMutAct_9fa48("146943")) {
      {}
    } else {
      stryCov_9fa48("146943");
      return stryMutAct_9fa48("146944") ? {} : (stryCov_9fa48("146944"), {
        enabled: this._featureGateEnabled
      });
    }
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
    if (stryMutAct_9fa48("146945")) {
      {}
    } else {
      stryCov_9fa48("146945");
      const errors = stryMutAct_9fa48("146946") ? ["Stryker was here"] : (stryCov_9fa48("146946"), []);
      if (stryMutAct_9fa48("146949") ? !definition && typeof definition !== TYPEOF.OBJECT : stryMutAct_9fa48("146948") ? false : stryMutAct_9fa48("146947") ? true : (stryCov_9fa48("146947", "146948", "146949"), (stryMutAct_9fa48("146950") ? definition : (stryCov_9fa48("146950"), !definition)) || (stryMutAct_9fa48("146952") ? typeof definition === TYPEOF.OBJECT : stryMutAct_9fa48("146951") ? false : (stryCov_9fa48("146951", "146952"), typeof definition !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("146953")) {
          {}
        } else {
          stryCov_9fa48("146953");
          errors.push(OCI_DRIVER_ERROR.DEFINITION_REQUIRED);
          return stryMutAct_9fa48("146954") ? {} : (stryCov_9fa48("146954"), {
            valid: stryMutAct_9fa48("146955") ? true : (stryCov_9fa48("146955"), false),
            errors
          });
        }
      }
      const ref = stryMutAct_9fa48("146956") ? definition[RUNTIME_FIELD.RUNTIME_REF] && definition.runtimeRef : (stryCov_9fa48("146956"), definition[RUNTIME_FIELD.RUNTIME_REF] ?? definition.runtimeRef);
      if (stryMutAct_9fa48("146959") ? ref === undefined && ref === null : stryMutAct_9fa48("146958") ? false : stryMutAct_9fa48("146957") ? true : (stryCov_9fa48("146957", "146958", "146959"), (stryMutAct_9fa48("146961") ? ref !== undefined : stryMutAct_9fa48("146960") ? false : (stryCov_9fa48("146960", "146961"), ref === undefined)) || (stryMutAct_9fa48("146963") ? ref !== null : stryMutAct_9fa48("146962") ? false : (stryCov_9fa48("146962", "146963"), ref === null)))) {
        if (stryMutAct_9fa48("146964")) {
          {}
        } else {
          stryCov_9fa48("146964");
          errors.push(OCI_DRIVER_ERROR.REF_REQUIRED);
        }
      } else if (stryMutAct_9fa48("146967") ? typeof ref === TYPEOF.STRING : stryMutAct_9fa48("146966") ? false : stryMutAct_9fa48("146965") ? true : (stryCov_9fa48("146965", "146966", "146967"), typeof ref !== TYPEOF.STRING)) {
        if (stryMutAct_9fa48("146968")) {
          {}
        } else {
          stryCov_9fa48("146968");
          errors.push(OCI_DRIVER_ERROR.REF_MUST_BE_STRING);
        }
      } else if (stryMutAct_9fa48("146971") ? ref.trim().length !== 0 : stryMutAct_9fa48("146970") ? false : stryMutAct_9fa48("146969") ? true : (stryCov_9fa48("146969", "146970", "146971"), (stryMutAct_9fa48("146972") ? ref.length : (stryCov_9fa48("146972"), ref.trim().length)) === 0)) {
        if (stryMutAct_9fa48("146973")) {
          {}
        } else {
          stryCov_9fa48("146973");
          errors.push(OCI_DRIVER_ERROR.REF_EMPTY);
        }
      } else if (stryMutAct_9fa48("146976") ? false : stryMutAct_9fa48("146975") ? true : stryMutAct_9fa48("146974") ? ref.includes(OCI_DIGEST_MARKER) : (stryCov_9fa48("146974", "146975", "146976"), !ref.includes(OCI_DIGEST_MARKER))) {
        if (stryMutAct_9fa48("146977")) {
          {}
        } else {
          stryCov_9fa48("146977");
          errors.push(OCI_DRIVER_ERROR.DIGEST_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("146981") ? errors.length <= 0 : stryMutAct_9fa48("146980") ? errors.length >= 0 : stryMutAct_9fa48("146979") ? false : stryMutAct_9fa48("146978") ? true : (stryCov_9fa48("146978", "146979", "146980", "146981"), errors.length > 0)) {
        if (stryMutAct_9fa48("146982")) {
          {}
        } else {
          stryCov_9fa48("146982");
          return stryMutAct_9fa48("146983") ? {} : (stryCov_9fa48("146983"), {
            valid: stryMutAct_9fa48("146984") ? true : (stryCov_9fa48("146984"), false),
            errors
          });
        }
      }
      return stryMutAct_9fa48("146985") ? {} : (stryCov_9fa48("146985"), {
        valid: stryMutAct_9fa48("146986") ? false : (stryCov_9fa48("146986"), true)
      });
    }
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
    if (stryMutAct_9fa48("146987")) {
      {}
    } else {
      stryCov_9fa48("146987");
      const gate = this._checkFeatureGate();
      if (stryMutAct_9fa48("146990") ? false : stryMutAct_9fa48("146989") ? true : stryMutAct_9fa48("146988") ? gate.enabled : (stryCov_9fa48("146988", "146989", "146990"), !gate.enabled)) {
        if (stryMutAct_9fa48("146991")) {
          {}
        } else {
          stryCov_9fa48("146991");
          throw new DriverLifecycleError(this.kind, stryMutAct_9fa48("146992") ? "" : (stryCov_9fa48("146992"), 'prepare'), OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED);
        }
      }
      const validation = this.validateDescriptor(definition);
      if (stryMutAct_9fa48("146995") ? false : stryMutAct_9fa48("146994") ? true : stryMutAct_9fa48("146993") ? validation.valid : (stryCov_9fa48("146993", "146994", "146995"), !validation.valid)) {
        if (stryMutAct_9fa48("146996")) {
          {}
        } else {
          stryCov_9fa48("146996");
          throw new DriverValidationError(this.kind, validation.errors);
        }
      }
      const serviceId = stryMutAct_9fa48("146997") ? definition.serviceId && definition.service_id : (stryCov_9fa48("146997"), definition.serviceId ?? definition.service_id);
      this._prepared.set(serviceId, definition);
      return stryMutAct_9fa48("146998") ? {} : (stryCov_9fa48("146998"), {
        status: PREPARE_STATUS.READY
      });
    }
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
    if (stryMutAct_9fa48("146999")) {
      {}
    } else {
      stryCov_9fa48("146999");
      const gate = this._checkFeatureGate();
      if (stryMutAct_9fa48("147002") ? false : stryMutAct_9fa48("147001") ? true : stryMutAct_9fa48("147000") ? gate.enabled : (stryCov_9fa48("147000", "147001", "147002"), !gate.enabled)) {
        if (stryMutAct_9fa48("147003")) {
          {}
        } else {
          stryCov_9fa48("147003");
          throw new DriverLifecycleError(this.kind, stryMutAct_9fa48("147004") ? "" : (stryCov_9fa48("147004"), 'start'), OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED);
        }
      }
      if (stryMutAct_9fa48("147007") ? !replicaContext && typeof replicaContext !== TYPEOF.OBJECT : stryMutAct_9fa48("147006") ? false : stryMutAct_9fa48("147005") ? true : (stryCov_9fa48("147005", "147006", "147007"), (stryMutAct_9fa48("147008") ? replicaContext : (stryCov_9fa48("147008"), !replicaContext)) || (stryMutAct_9fa48("147010") ? typeof replicaContext === TYPEOF.OBJECT : stryMutAct_9fa48("147009") ? false : (stryCov_9fa48("147009", "147010"), typeof replicaContext !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("147011")) {
          {}
        } else {
          stryCov_9fa48("147011");
          throw new DriverLifecycleError(this.kind, stryMutAct_9fa48("147012") ? "" : (stryCov_9fa48("147012"), 'start'), OCI_DRIVER_ERROR.REPLICA_CONTEXT_REQUIRED);
        }
      }
      const serviceId = stryMutAct_9fa48("147013") ? replicaContext.serviceId && replicaContext.service_id : (stryCov_9fa48("147013"), replicaContext.serviceId ?? replicaContext.service_id);
      if (stryMutAct_9fa48("147016") ? false : stryMutAct_9fa48("147015") ? true : stryMutAct_9fa48("147014") ? serviceId : (stryCov_9fa48("147014", "147015", "147016"), !serviceId)) {
        if (stryMutAct_9fa48("147017")) {
          {}
        } else {
          stryCov_9fa48("147017");
          throw new DriverLifecycleError(this.kind, stryMutAct_9fa48("147018") ? "" : (stryCov_9fa48("147018"), 'start'), OCI_DRIVER_ERROR.SERVICE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("147021") ? false : stryMutAct_9fa48("147020") ? true : stryMutAct_9fa48("147019") ? this._prepared.has(serviceId) : (stryCov_9fa48("147019", "147020", "147021"), !this._prepared.has(serviceId))) {
        if (stryMutAct_9fa48("147022")) {
          {}
        } else {
          stryCov_9fa48("147022");
          return stryMutAct_9fa48("147023") ? {} : (stryCov_9fa48("147023"), {
            status: START_STATUS.FAILED,
            error: (stryMutAct_9fa48("147024") ? `` : (stryCov_9fa48("147024"), `${OCI_DRIVER_ERROR.NOT_PREPARED}`)) + (stryMutAct_9fa48("147025") ? `` : (stryCov_9fa48("147025"), `: '${serviceId}'`))
          });
        }
      }

      // Idempotent: already running is success
      this._running.add(serviceId);
      return stryMutAct_9fa48("147026") ? {} : (stryCov_9fa48("147026"), {
        status: START_STATUS.RUNNING
      });
    }
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
    if (stryMutAct_9fa48("147027")) {
      {}
    } else {
      stryCov_9fa48("147027");
      const gate = this._checkFeatureGate();
      if (stryMutAct_9fa48("147030") ? false : stryMutAct_9fa48("147029") ? true : stryMutAct_9fa48("147028") ? gate.enabled : (stryCov_9fa48("147028", "147029", "147030"), !gate.enabled)) {
        if (stryMutAct_9fa48("147031")) {
          {}
        } else {
          stryCov_9fa48("147031");
          throw new DriverLifecycleError(this.kind, stryMutAct_9fa48("147032") ? "" : (stryCov_9fa48("147032"), 'stop'), OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED);
        }
      }
      if (stryMutAct_9fa48("147035") ? !replicaContext && typeof replicaContext !== TYPEOF.OBJECT : stryMutAct_9fa48("147034") ? false : stryMutAct_9fa48("147033") ? true : (stryCov_9fa48("147033", "147034", "147035"), (stryMutAct_9fa48("147036") ? replicaContext : (stryCov_9fa48("147036"), !replicaContext)) || (stryMutAct_9fa48("147038") ? typeof replicaContext === TYPEOF.OBJECT : stryMutAct_9fa48("147037") ? false : (stryCov_9fa48("147037", "147038"), typeof replicaContext !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("147039")) {
          {}
        } else {
          stryCov_9fa48("147039");
          throw new DriverLifecycleError(this.kind, stryMutAct_9fa48("147040") ? "" : (stryCov_9fa48("147040"), 'stop'), OCI_DRIVER_ERROR.REPLICA_CONTEXT_REQUIRED);
        }
      }
      const serviceId = stryMutAct_9fa48("147041") ? replicaContext.serviceId && replicaContext.service_id : (stryCov_9fa48("147041"), replicaContext.serviceId ?? replicaContext.service_id);
      if (stryMutAct_9fa48("147044") ? false : stryMutAct_9fa48("147043") ? true : stryMutAct_9fa48("147042") ? serviceId : (stryCov_9fa48("147042", "147043", "147044"), !serviceId)) {
        if (stryMutAct_9fa48("147045")) {
          {}
        } else {
          stryCov_9fa48("147045");
          throw new DriverLifecycleError(this.kind, stryMutAct_9fa48("147046") ? "" : (stryCov_9fa48("147046"), 'stop'), OCI_DRIVER_ERROR.SERVICE_ID_REQUIRED);
        }
      }

      // Idempotent: remove from running and prepared
      this._running.delete(serviceId);
      this._prepared.delete(serviceId);
    }
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
    if (stryMutAct_9fa48("147047")) {
      {}
    } else {
      stryCov_9fa48("147047");
      const gate = this._checkFeatureGate();
      const serviceId = stryMutAct_9fa48("147048") ? replicaContext?.serviceId && replicaContext?.service_id : (stryCov_9fa48("147048"), (stryMutAct_9fa48("147049") ? replicaContext.serviceId : (stryCov_9fa48("147049"), replicaContext?.serviceId)) ?? (stryMutAct_9fa48("147050") ? replicaContext.service_id : (stryCov_9fa48("147050"), replicaContext?.service_id)));
      const healthOutcome = (stryMutAct_9fa48("147051") ? gate.enabled : (stryCov_9fa48("147051"), !gate.enabled)) ? stryMutAct_9fa48("147052") ? {} : (stryCov_9fa48("147052"), {
        status: HEALTH_STATUS.UNKNOWN,
        detail: OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED
      }) : (stryMutAct_9fa48("147055") ? !replicaContext && typeof replicaContext !== TYPEOF.OBJECT : stryMutAct_9fa48("147054") ? false : stryMutAct_9fa48("147053") ? true : (stryCov_9fa48("147053", "147054", "147055"), (stryMutAct_9fa48("147056") ? replicaContext : (stryCov_9fa48("147056"), !replicaContext)) || (stryMutAct_9fa48("147058") ? typeof replicaContext === TYPEOF.OBJECT : stryMutAct_9fa48("147057") ? false : (stryCov_9fa48("147057", "147058"), typeof replicaContext !== TYPEOF.OBJECT)))) ? stryMutAct_9fa48("147059") ? {} : (stryCov_9fa48("147059"), {
        status: HEALTH_STATUS.UNKNOWN,
        detail: OCI_DRIVER_ERROR.REPLICA_CONTEXT_REQUIRED
      }) : (stryMutAct_9fa48("147060") ? serviceId : (stryCov_9fa48("147060"), !serviceId)) ? stryMutAct_9fa48("147061") ? {} : (stryCov_9fa48("147061"), {
        status: HEALTH_STATUS.UNKNOWN,
        detail: OCI_DRIVER_ERROR.SERVICE_ID_REQUIRED
      }) : (stryMutAct_9fa48("147062") ? this._prepared.has(serviceId) : (stryCov_9fa48("147062"), !this._prepared.has(serviceId))) ? stryMutAct_9fa48("147063") ? {} : (stryCov_9fa48("147063"), {
        status: HEALTH_STATUS.UNHEALTHY,
        detail: stryMutAct_9fa48("147064") ? `` : (stryCov_9fa48("147064"), `${OCI_DRIVER_ERROR.NOT_PREPARED}: '${serviceId}'`)
      }) : (stryMutAct_9fa48("147065") ? this._running.has(serviceId) : (stryCov_9fa48("147065"), !this._running.has(serviceId))) ? stryMutAct_9fa48("147066") ? {} : (stryCov_9fa48("147066"), {
        status: HEALTH_STATUS.UNHEALTHY,
        detail: stryMutAct_9fa48("147067") ? `` : (stryCov_9fa48("147067"), `${OCI_DRIVER_ERROR.NOT_STARTED}: '${serviceId}'`)
      }) : stryMutAct_9fa48("147068") ? {} : (stryCov_9fa48("147068"), {
        status: HEALTH_STATUS.HEALTHY
      });
      return healthOutcome;
    }
  }
}
export { OciContainerDriver, OCI_DRIVER_ERROR };