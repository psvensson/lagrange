/**
 * HostImportRegistry assembles runtime host imports based on
 * declared capabilities, policy allowlist, and debug-session state.
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {
  DEBUG_CAPABILITY,
  HOST_IMPORT_NAMESPACE,
  WASM_RUNTIME_ADAPTER_ERROR_MSG as ERR,
} from './debug-runtime-constants.js';

/**
 * Convert a capability array to a normalized set.
 *
 * @param {Array<string>|null|undefined} capabilities
 * @return {Set<string>}
 */
function asCapabilitySet(capabilities) {
  if (!Array.isArray(capabilities)) {
    return new Set();
  }
  return new Set(capabilities.filter(
    (cap) => typeof cap === TYPEOF.STRING &&
      cap.length > NUM.ZERO,
  ));
}

/**
 * Check whether a debug capability import is allowed.
 *
 * @param {string} capability
 * @param {Object} options
 * @param {Set<string>} options.declared
 * @param {Set<string>} options.allowed
 * @param {boolean} options.sessionActive
 * @return {boolean}
 */
function shouldInjectDebugCapability(capability, options) {
  return options.sessionActive &&
    options.declared.has(capability) &&
    options.allowed.has(capability);
}

/**
 * Host import registry for runtime adapter instantiation.
 */
class HostImportRegistry {
  /**
   * @param {Object} [options]
   * @param {Object<string, Object>} [options.baseImports] - Always-on imports.
   */
  constructor(options = {}) {
    this.baseImports = {};
    const baseImports = options.baseImports || {};
    for (const namespace of Object.keys(baseImports)) {
      this.registerBaseImport(namespace, baseImports[namespace]);
    }

    /** @type {Map<string, {namespace: string, module: Object}>} */
    this.capabilityImports = new Map();
  }

  /**
   * Register always-on imports under a namespace.
   *
   * @param {string} namespace - Host import namespace.
   * @param {Object} moduleImpl - Namespace module implementation.
   */
  registerBaseImport(namespace, moduleImpl) {
    if (!namespace ||
      typeof namespace !== TYPEOF.STRING) {
      throw new Error(ERR.IMPORT_NAMESPACE_REQUIRED);
    }
    if (!moduleImpl ||
      typeof moduleImpl !== TYPEOF.OBJECT) {
      throw new Error(ERR.IMPORT_MODULE_REQUIRED);
    }
    this.baseImports[namespace] = moduleImpl;
  }

  /**
   * Register capability-gated imports.
   *
   * @param {string} capability - Capability string.
   * @param {string} namespace - Host import namespace.
   * @param {Object} moduleImpl - Namespace module implementation.
   */
  registerCapabilityImport(capability, namespace, moduleImpl) {
    if (!capability ||
      typeof capability !== TYPEOF.STRING) {
      throw new Error(ERR.CAPABILITY_REQUIRED);
    }
    if (!namespace ||
      typeof namespace !== TYPEOF.STRING) {
      throw new Error(ERR.IMPORT_NAMESPACE_REQUIRED);
    }
    if (!moduleImpl ||
      typeof moduleImpl !== TYPEOF.OBJECT) {
      throw new Error(ERR.IMPORT_MODULE_REQUIRED);
    }
    this.capabilityImports.set(capability, {
      namespace,
      module: moduleImpl,
    });
  }

  /**
   * Build runtime imports for an execution request.
   *
   * @param {Object} options
   * @param {Array<string>} [options.declaredCapabilities]
   * @param {Array<string>} [options.allowedCapabilities]
   * @param {boolean} [options.sessionActive]
   * @return {Object<string, Object>}
   */
  buildImports(options = {}) {
    const declared = asCapabilitySet(options.declaredCapabilities);
    const allowed = asCapabilitySet(options.allowedCapabilities);
    const sessionActive = options.sessionActive === true;

    const imports = {};
    for (const namespace of Object.keys(this.baseImports)) {
      imports[namespace] = {
        ...this.baseImports[namespace],
      };
    }

    for (const [capability, record] of this.capabilityImports) {
      const isDebugCap = capability === DEBUG_CAPABILITY.TRACE ||
        capability === DEBUG_CAPABILITY.BREAKPOINT ||
        capability === DEBUG_CAPABILITY.SNAPSHOT;
      const capabilityAllowed = declared.has(capability) &&
        allowed.has(capability);
      if (!capabilityAllowed) {
        continue;
      }
      if (isDebugCap &&
        !shouldInjectDebugCapability(capability, {
          declared,
          allowed,
          sessionActive,
        })) {
        continue;
      }
      if (!imports[record.namespace]) {
        imports[record.namespace] = {};
      }
      imports[record.namespace] = {
        ...imports[record.namespace],
        ...record.module,
      };
    }

    return imports;
  }
}

/**
 * Create registry preconfigured with standard namespace slots.
 *
 * @param {Object} [options]
 * @param {Object<string, Object>} [options.baseImports]
 * @return {HostImportRegistry}
 */
function createHostImportRegistry(options = {}) {
  const registry = new HostImportRegistry({
    baseImports: options.baseImports || {},
  });
  if (!registry.baseImports[HOST_IMPORT_NAMESPACE.ENV]) {
    registry.baseImports[HOST_IMPORT_NAMESPACE.ENV] = {};
  }
  if (!registry.baseImports[HOST_IMPORT_NAMESPACE.DB]) {
    registry.baseImports[HOST_IMPORT_NAMESPACE.DB] = {};
  }
  return registry;
}

export {
  HostImportRegistry,
  createHostImportRegistry,
  shouldInjectDebugCapability,
};
