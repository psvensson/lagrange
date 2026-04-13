/**
 * Canonical service descriptor normalization and validation.
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
import { ALLOWED_UNIFIED_SERVICE_TYPES, SERVICE_DESCRIPTOR_FIELD, TYPEOF } from '../constants/index.js';
import { validateRuntimeDescriptor } from '../wasm-service/runtime-descriptor-validator.js';
import { ServiceDescriptorValidationError } from './service-lifecycle-errors.js';
const DESCRIPTOR_ERROR = Object.freeze(stryMutAct_9fa48("149980") ? {} : (stryCov_9fa48("149980"), {
  SERVICE_ID_REQUIRED: stryMutAct_9fa48("149981") ? "" : (stryCov_9fa48("149981"), 'serviceId is required'),
  SERVICE_ID_NOT_STRING: stryMutAct_9fa48("149982") ? "" : (stryCov_9fa48("149982"), 'serviceId must be a non-empty string'),
  SERVICE_TYPE_REQUIRED: stryMutAct_9fa48("149983") ? "" : (stryCov_9fa48("149983"), 'serviceType is required'),
  SERVICE_TYPE_UNKNOWN: stryMutAct_9fa48("149984") ? "" : (stryCov_9fa48("149984"), 'serviceType is not registered in unified service types'),
  REPLICA_COUNT_INVALID: stryMutAct_9fa48("149985") ? "" : (stryCov_9fa48("149985"), 'replicaCount must be an integer >= 0'),
  ADAPTER_RESOLUTION_REQUIRED: stryMutAct_9fa48("149986") ? "" : (stryCov_9fa48("149986"), 'adapterResolver must return exactly one adapter for serviceType')
}));

/**
 * Normalize a mixed-case descriptor into canonical camelCase fields.
 *
 * @param {Object} descriptor
 * @return {Object}
 */
function normalizeServiceDescriptor(descriptor) {
  if (stryMutAct_9fa48("149987")) {
    {}
  } else {
    stryCov_9fa48("149987");
    const serviceId = stryMutAct_9fa48("149990") ? (descriptor?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] || descriptor?.service_id) && null : stryMutAct_9fa48("149989") ? false : stryMutAct_9fa48("149988") ? true : (stryCov_9fa48("149988", "149989", "149990"), (stryMutAct_9fa48("149992") ? descriptor?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] && descriptor?.service_id : stryMutAct_9fa48("149991") ? false : (stryCov_9fa48("149991", "149992"), (stryMutAct_9fa48("149993") ? descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : (stryCov_9fa48("149993"), descriptor?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID])) || (stryMutAct_9fa48("149994") ? descriptor.service_id : (stryCov_9fa48("149994"), descriptor?.service_id)))) || null);
    return stryMutAct_9fa48("149995") ? {} : (stryCov_9fa48("149995"), {
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: stryMutAct_9fa48("149998") ? (descriptor?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] || descriptor?.service_type) && null : stryMutAct_9fa48("149997") ? false : stryMutAct_9fa48("149996") ? true : (stryCov_9fa48("149996", "149997", "149998"), (stryMutAct_9fa48("150000") ? descriptor?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] && descriptor?.service_type : stryMutAct_9fa48("149999") ? false : (stryCov_9fa48("149999", "150000"), (stryMutAct_9fa48("150001") ? descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] : (stryCov_9fa48("150001"), descriptor?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE])) || (stryMutAct_9fa48("150002") ? descriptor.service_type : (stryCov_9fa48("150002"), descriptor?.service_type)))) || null),
      [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: stryMutAct_9fa48("150005") ? (descriptor?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] || descriptor?.tenant_id) && serviceId : stryMutAct_9fa48("150004") ? false : stryMutAct_9fa48("150003") ? true : (stryCov_9fa48("150003", "150004", "150005"), (stryMutAct_9fa48("150007") ? descriptor?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] && descriptor?.tenant_id : stryMutAct_9fa48("150006") ? false : (stryCov_9fa48("150006", "150007"), (stryMutAct_9fa48("150008") ? descriptor[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] : (stryCov_9fa48("150008"), descriptor?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID])) || (stryMutAct_9fa48("150009") ? descriptor.tenant_id : (stryCov_9fa48("150009"), descriptor?.tenant_id)))) || serviceId),
      [SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]: stryMutAct_9fa48("150010") ? (descriptor?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT] ?? descriptor?.replica_count) && 0 : (stryCov_9fa48("150010"), (stryMutAct_9fa48("150011") ? descriptor?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT] && descriptor?.replica_count : (stryCov_9fa48("150011"), (stryMutAct_9fa48("150012") ? descriptor[SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT] : (stryCov_9fa48("150012"), descriptor?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT])) ?? (stryMutAct_9fa48("150013") ? descriptor.replica_count : (stryCov_9fa48("150013"), descriptor?.replica_count)))) ?? 0),
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND]: stryMutAct_9fa48("150016") ? (descriptor?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] || descriptor?.runtime_kind) && null : stryMutAct_9fa48("150015") ? false : stryMutAct_9fa48("150014") ? true : (stryCov_9fa48("150014", "150015", "150016"), (stryMutAct_9fa48("150018") ? descriptor?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] && descriptor?.runtime_kind : stryMutAct_9fa48("150017") ? false : (stryCov_9fa48("150017", "150018"), (stryMutAct_9fa48("150019") ? descriptor[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] : (stryCov_9fa48("150019"), descriptor?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND])) || (stryMutAct_9fa48("150020") ? descriptor.runtime_kind : (stryCov_9fa48("150020"), descriptor?.runtime_kind)))) || null),
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF]: stryMutAct_9fa48("150021") ? (descriptor?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF] ?? descriptor?.runtime_ref) && null : (stryCov_9fa48("150021"), (stryMutAct_9fa48("150022") ? descriptor?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF] && descriptor?.runtime_ref : (stryCov_9fa48("150022"), (stryMutAct_9fa48("150023") ? descriptor[SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF] : (stryCov_9fa48("150023"), descriptor?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF])) ?? (stryMutAct_9fa48("150024") ? descriptor.runtime_ref : (stryCov_9fa48("150024"), descriptor?.runtime_ref)))) ?? null),
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG]: stryMutAct_9fa48("150025") ? (descriptor?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG] ?? descriptor?.runtime_config) && null : (stryCov_9fa48("150025"), (stryMutAct_9fa48("150026") ? descriptor?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG] && descriptor?.runtime_config : (stryCov_9fa48("150026"), (stryMutAct_9fa48("150027") ? descriptor[SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG] : (stryCov_9fa48("150027"), descriptor?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG])) ?? (stryMutAct_9fa48("150028") ? descriptor.runtime_config : (stryCov_9fa48("150028"), descriptor?.runtime_config)))) ?? null)
    });
  }
}

/**
 * Validate a canonical service descriptor.
 *
 * @param {Object} descriptor
 * @param {Object} [options]
 * @param {Function} [options.adapterResolver]
 * @return {{valid: boolean, errors: string[], descriptor: Object}}
 */
function validateServiceDescriptor(descriptor, options = {}) {
  if (stryMutAct_9fa48("150029")) {
    {}
  } else {
    stryCov_9fa48("150029");
    const normalized = normalizeServiceDescriptor(descriptor);
    const errors = stryMutAct_9fa48("150030") ? ["Stryker was here"] : (stryCov_9fa48("150030"), []);
    const serviceId = normalized[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    const serviceType = normalized[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE];
    const replicaCount = normalized[SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT];
    if (stryMutAct_9fa48("150033") ? serviceId === null && serviceId === undefined : stryMutAct_9fa48("150032") ? false : stryMutAct_9fa48("150031") ? true : (stryCov_9fa48("150031", "150032", "150033"), (stryMutAct_9fa48("150035") ? serviceId !== null : stryMutAct_9fa48("150034") ? false : (stryCov_9fa48("150034", "150035"), serviceId === null)) || (stryMutAct_9fa48("150037") ? serviceId !== undefined : stryMutAct_9fa48("150036") ? false : (stryCov_9fa48("150036", "150037"), serviceId === undefined)))) {
      if (stryMutAct_9fa48("150038")) {
        {}
      } else {
        stryCov_9fa48("150038");
        errors.push(DESCRIPTOR_ERROR.SERVICE_ID_REQUIRED);
      }
    } else if (stryMutAct_9fa48("150041") ? typeof serviceId !== TYPEOF.STRING && serviceId.length === 0 : stryMutAct_9fa48("150040") ? false : stryMutAct_9fa48("150039") ? true : (stryCov_9fa48("150039", "150040", "150041"), (stryMutAct_9fa48("150043") ? typeof serviceId === TYPEOF.STRING : stryMutAct_9fa48("150042") ? false : (stryCov_9fa48("150042", "150043"), typeof serviceId !== TYPEOF.STRING)) || (stryMutAct_9fa48("150045") ? serviceId.length !== 0 : stryMutAct_9fa48("150044") ? false : (stryCov_9fa48("150044", "150045"), serviceId.length === 0)))) {
      if (stryMutAct_9fa48("150046")) {
        {}
      } else {
        stryCov_9fa48("150046");
        errors.push(DESCRIPTOR_ERROR.SERVICE_ID_NOT_STRING);
      }
    }
    if (stryMutAct_9fa48("150049") ? serviceType === null && serviceType === undefined : stryMutAct_9fa48("150048") ? false : stryMutAct_9fa48("150047") ? true : (stryCov_9fa48("150047", "150048", "150049"), (stryMutAct_9fa48("150051") ? serviceType !== null : stryMutAct_9fa48("150050") ? false : (stryCov_9fa48("150050", "150051"), serviceType === null)) || (stryMutAct_9fa48("150053") ? serviceType !== undefined : stryMutAct_9fa48("150052") ? false : (stryCov_9fa48("150052", "150053"), serviceType === undefined)))) {
      if (stryMutAct_9fa48("150054")) {
        {}
      } else {
        stryCov_9fa48("150054");
        errors.push(DESCRIPTOR_ERROR.SERVICE_TYPE_REQUIRED);
      }
    } else if (stryMutAct_9fa48("150057") ? false : stryMutAct_9fa48("150056") ? true : stryMutAct_9fa48("150055") ? ALLOWED_UNIFIED_SERVICE_TYPES.has(serviceType) : (stryCov_9fa48("150055", "150056", "150057"), !ALLOWED_UNIFIED_SERVICE_TYPES.has(serviceType))) {
      if (stryMutAct_9fa48("150058")) {
        {}
      } else {
        stryCov_9fa48("150058");
        errors.push(DESCRIPTOR_ERROR.SERVICE_TYPE_UNKNOWN);
      }
    }
    if (stryMutAct_9fa48("150061") ? (!Number.isFinite(replicaCount) || !Number.isInteger(replicaCount)) && replicaCount < 0 : stryMutAct_9fa48("150060") ? false : stryMutAct_9fa48("150059") ? true : (stryCov_9fa48("150059", "150060", "150061"), (stryMutAct_9fa48("150063") ? !Number.isFinite(replicaCount) && !Number.isInteger(replicaCount) : stryMutAct_9fa48("150062") ? false : (stryCov_9fa48("150062", "150063"), (stryMutAct_9fa48("150064") ? Number.isFinite(replicaCount) : (stryCov_9fa48("150064"), !Number.isFinite(replicaCount))) || (stryMutAct_9fa48("150065") ? Number.isInteger(replicaCount) : (stryCov_9fa48("150065"), !Number.isInteger(replicaCount))))) || (stryMutAct_9fa48("150068") ? replicaCount >= 0 : stryMutAct_9fa48("150067") ? replicaCount <= 0 : stryMutAct_9fa48("150066") ? false : (stryCov_9fa48("150066", "150067", "150068"), replicaCount < 0)))) {
      if (stryMutAct_9fa48("150069")) {
        {}
      } else {
        stryCov_9fa48("150069");
        errors.push(DESCRIPTOR_ERROR.REPLICA_COUNT_INVALID);
      }
    }
    const runtimeValidation = validateRuntimeDescriptor(stryMutAct_9fa48("150070") ? {} : (stryCov_9fa48("150070"), {
      runtimeKind: normalized[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND],
      runtimeRef: normalized[SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF],
      runtimeConfig: normalized[SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG]
    }));
    if (stryMutAct_9fa48("150073") ? false : stryMutAct_9fa48("150072") ? true : stryMutAct_9fa48("150071") ? runtimeValidation.valid : (stryCov_9fa48("150071", "150072", "150073"), !runtimeValidation.valid)) {
      if (stryMutAct_9fa48("150074")) {
        {}
      } else {
        stryCov_9fa48("150074");
        errors.push(...runtimeValidation.errors);
      }
    }
    if (stryMutAct_9fa48("150076") ? false : stryMutAct_9fa48("150075") ? true : (stryCov_9fa48("150075", "150076"), options.adapterResolver)) {
      if (stryMutAct_9fa48("150077")) {
        {}
      } else {
        stryCov_9fa48("150077");
        const adapter = options.adapterResolver(serviceType);
        if (stryMutAct_9fa48("150080") ? false : stryMutAct_9fa48("150079") ? true : stryMutAct_9fa48("150078") ? adapter : (stryCov_9fa48("150078", "150079", "150080"), !adapter)) {
          if (stryMutAct_9fa48("150081")) {
            {}
          } else {
            stryCov_9fa48("150081");
            errors.push(DESCRIPTOR_ERROR.ADAPTER_RESOLUTION_REQUIRED);
          }
        }
      }
    }
    return stryMutAct_9fa48("150082") ? {} : (stryCov_9fa48("150082"), {
      valid: stryMutAct_9fa48("150085") ? errors.length !== 0 : stryMutAct_9fa48("150084") ? false : stryMutAct_9fa48("150083") ? true : (stryCov_9fa48("150083", "150084", "150085"), errors.length === 0),
      errors,
      descriptor: normalized
    });
  }
}

/**
 * Assert a valid service descriptor and throw typed validation error on failure.
 *
 * @param {Object} descriptor
 * @param {Object} [options]
 * @return {Object}
 */
function assertServiceDescriptor(descriptor, options = {}) {
  if (stryMutAct_9fa48("150086")) {
    {}
  } else {
    stryCov_9fa48("150086");
    const validation = validateServiceDescriptor(descriptor, options);
    if (stryMutAct_9fa48("150089") ? false : stryMutAct_9fa48("150088") ? true : stryMutAct_9fa48("150087") ? validation.valid : (stryCov_9fa48("150087", "150088", "150089"), !validation.valid)) {
      if (stryMutAct_9fa48("150090")) {
        {}
      } else {
        stryCov_9fa48("150090");
        throw new ServiceDescriptorValidationError(validation.errors, stryMutAct_9fa48("150091") ? {} : (stryCov_9fa48("150091"), {
          serviceId: validation.descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID],
          serviceType: validation.descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]
        }));
      }
    }
    return validation.descriptor;
  }
}
export { normalizeServiceDescriptor, validateServiceDescriptor, assertServiceDescriptor };