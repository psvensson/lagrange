/**
 * Namespace registry mapping resolver.
 *
 * Resolves a package's registry source using the precedence chain:
 * 1. Per-package override (accepted but delegated to task 2.3)
 * 2. Namespace registry mapping
 * 3. Default mapping (if configured)
 *
 * Requirements: 4.1, 4.5
 */

import {
  REGISTRY_MAPPING_FIELD as RM,
  REGISTRY_OVERRIDE_FIELD as RO,
} from './wasm-meta-models-constants.js';

// --- Resolution source identifiers ---

const RESOLUTION_SOURCE = Object.freeze({
  OVERRIDE: 'override',
  NAMESPACE: 'namespace',
  DEFAULT: 'default',
});

// --- Error message constants ---

const RESOLVER_ERROR = Object.freeze({
  NAMESPACE_REQUIRED:
    'Namespace is required for registry resolution',
  NAME_REQUIRED:
    'Package name is required for override lookup',
  NO_MAPPING_FOUND:
    'No registry mapping found for namespace',
  NO_DEFAULT_MAPPING:
    'No default registry mapping configured',
});

/**
 * Look up a namespace in the registry mappings.
 *
 * @param {string} namespace - Package namespace to look up.
 * @param {Map|Array} mappings - Registry mappings as a Map
 *   keyed by namespace, or an array of mapping objects.
 * @return {Object|null} The mapping object or null.
 */
function lookupNamespaceMapping(namespace, mappings) {
  if (!mappings) {
    return null;
  }
  if (mappings instanceof Map) {
    return mappings.get(namespace) || null;
  }
  if (Array.isArray(mappings)) {
    for (const mapping of mappings) {
      if (mapping[RM.NAMESPACE] === namespace) {
        return mapping;
      }
    }
  }
  return null;
}

/**
 * Resolve a package's registry source using the precedence chain.
 *
 * Resolution order:
 * 1. Per-package override (if provided)
 * 2. Namespace registry mapping
 * 3. Default mapping (if configured)
 *
 * @param {string} namespace - Package namespace.
 * @param {Map|Array} mappings - Namespace registry mappings.
 * @param {Object|null} overrides - Per-package override result
 *   (resolved externally by task 2.3). Expected shape:
 *   `{registryUrl: string}` or null/undefined.
 * @param {Object|null} defaultMapping - Default registry mapping.
 *   Expected shape: `{registryUrl: string}`.
 * @return {{resolved: boolean, registryUrl?: string,
 *   source?: string, auditInfo?: Object, errors?: string[]}}
 */
function resolveRegistryMapping(
  namespace, mappings, overrides, defaultMapping,
) {
  if (!namespace) {
    return {
      resolved: false,
      errors: [RESOLVER_ERROR.NAMESPACE_REQUIRED],
    };
  }

  // 1. Per-package override
  if (overrides && overrides[RM.REGISTRY_URL]) {
    return buildResolved(
      overrides[RM.REGISTRY_URL],
      RESOLUTION_SOURCE.OVERRIDE,
      namespace,
      overrides,
    );
  }

  // 2. Namespace registry mapping
  const nsMapping = lookupNamespaceMapping(namespace, mappings);
  if (nsMapping) {
    return buildResolved(
      nsMapping[RM.REGISTRY_URL],
      RESOLUTION_SOURCE.NAMESPACE,
      namespace,
      nsMapping,
    );
  }

  // 3. Default mapping
  if (defaultMapping && defaultMapping[RM.REGISTRY_URL]) {
    return buildResolved(
      defaultMapping[RM.REGISTRY_URL],
      RESOLUTION_SOURCE.DEFAULT,
      namespace,
      defaultMapping,
    );
  }

  return {
    resolved: false,
    errors: [
      RESOLVER_ERROR.NO_MAPPING_FOUND,
      RESOLVER_ERROR.NO_DEFAULT_MAPPING,
    ],
  };
}

/**
 * Build a successful resolution result with audit info.
 *
 * @param {string} registryUrl - Resolved registry URL.
 * @param {string} source - Resolution source identifier.
 * @param {string} namespace - Package namespace.
 * @param {Object} rule - The mapping rule that was selected.
 * @return {{resolved: boolean, registryUrl: string,
 *   source: string, auditInfo: Object}}
 */
function buildResolved(registryUrl, source, namespace, rule) {
  return {
    resolved: true,
    registryUrl,
    source,
    auditInfo: {
      namespace,
      source,
      registryUrl,
      ruleNamespace: rule[RM.NAMESPACE] || null,
    },
  };
}

// --- Override key separator ---

const OVERRIDE_KEY_SEPARATOR = ':';

/**
 * Build the lookup key for a per-package override.
 *
 * @param {string} namespace - Package namespace.
 * @param {string} name - Package name.
 * @return {string} Key in `namespace:name` format.
 */
function buildOverrideKey(namespace, name) {
  return `${namespace}${OVERRIDE_KEY_SEPARATOR}${name}`;
}

/**
 * Look up a per-package override from a collection.
 *
 * @param {string} namespace - Package namespace.
 * @param {string} name - Package name.
 * @param {Map|Array|null|undefined} overrides - Per-package
 *   overrides as a Map keyed by `namespace:name`, or an
 *   array of override objects with namespace/name fields.
 * @return {Object|null} The override object or null.
 */
function lookupPackageOverride(namespace, name, overrides) {
  if (!overrides) {
    return null;
  }
  const key = buildOverrideKey(namespace, name);
  if (overrides instanceof Map) {
    return overrides.get(key) || null;
  }
  if (Array.isArray(overrides)) {
    for (const entry of overrides) {
      if (
        entry[RO.NAMESPACE] === namespace &&
        entry[RO.NAME] === name
      ) {
        return entry;
      }
    }
  }
  return null;
}

/**
 * Full resolution combining per-package override lookup
 * with namespace mapping and default fallback.
 *
 * Resolution order:
 * 1. Per-package override (looked up here)
 * 2. Namespace registry mapping (via resolveRegistryMapping)
 * 3. Default mapping (via resolveRegistryMapping)
 *
 * @param {string} namespace - Package namespace.
 * @param {string} name - Package name.
 * @param {Map|Array|null} overrides - Per-package overrides.
 * @param {Map|Array} mappings - Namespace registry mappings.
 * @param {Object|null} defaultMapping - Default registry mapping.
 * @return {{resolved: boolean, registryUrl?: string,
 *   source?: string, auditInfo?: Object, errors?: string[]}}
 */
function resolvePackageSource(
  namespace, name, overrides, mappings, defaultMapping,
) {
  if (!namespace) {
    return {
      resolved: false,
      errors: [RESOLVER_ERROR.NAMESPACE_REQUIRED],
    };
  }
  if (!name) {
    return {
      resolved: false,
      errors: [RESOLVER_ERROR.NAME_REQUIRED],
    };
  }
  const override = lookupPackageOverride(
    namespace, name, overrides,
  );
  return resolveRegistryMapping(
    namespace, mappings, override, defaultMapping,
  );
}

export {
  resolveRegistryMapping,
  lookupNamespaceMapping,
  lookupPackageOverride,
  resolvePackageSource,
  RESOLUTION_SOURCE,
  RESOLVER_ERROR,
  OVERRIDE_KEY_SEPARATOR,
};
