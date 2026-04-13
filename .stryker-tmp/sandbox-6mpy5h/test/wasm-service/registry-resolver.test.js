// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRegistryMapping,
  lookupNamespaceMapping,
  lookupPackageOverride,
  resolvePackageSource,
  RESOLUTION_SOURCE,
  RESOLVER_ERROR,
  OVERRIDE_KEY_SEPARATOR,
} from '../../src/wasm-service/registry-resolver.js';

// --- lookupNamespaceMapping ---

describe('lookupNamespaceMapping', () => {
  it('should find mapping from a Map', () => {
    const mappings = new Map([
      ['acme', {namespace: 'acme', registryUrl: 'https://r.acme.io'}],
    ]);
    const result = lookupNamespaceMapping('acme', mappings);
    assert.equal(result.registryUrl, 'https://r.acme.io');
  });

  it('should find mapping from an array', () => {
    const mappings = [
      {namespace: 'acme', registryUrl: 'https://r.acme.io'},
      {namespace: 'ddb', registryUrl: 'https://r.ddb.io'},
    ];
    const result = lookupNamespaceMapping('ddb', mappings);
    assert.equal(result.registryUrl, 'https://r.ddb.io');
  });

  it('should return null when namespace not found in Map', () => {
    const mappings = new Map([
      ['acme', {namespace: 'acme', registryUrl: 'https://r.acme.io'}],
    ]);
    const result = lookupNamespaceMapping('unknown', mappings);
    assert.equal(result, null);
  });

  it('should return null when namespace not found in array', () => {
    const mappings = [
      {namespace: 'acme', registryUrl: 'https://r.acme.io'},
    ];
    const result = lookupNamespaceMapping('unknown', mappings);
    assert.equal(result, null);
  });

  it('should return null for null mappings', () => {
    const result = lookupNamespaceMapping('acme', null);
    assert.equal(result, null);
  });

  it('should return null for undefined mappings', () => {
    const result = lookupNamespaceMapping('acme', undefined);
    assert.equal(result, null);
  });
});

// --- resolveRegistryMapping ---

describe('resolveRegistryMapping', () => {
  const nsMappings = new Map([
    ['acme', {namespace: 'acme', registryUrl: 'https://r.acme.io'}],
    ['ddb', {namespace: 'ddb', registryUrl: 'https://r.ddb.io'}],
  ]);
  const defaultMapping = {
    registryUrl: 'https://default.registry.io',
  };

  it('should resolve via namespace mapping', () => {
    const result = resolveRegistryMapping(
      'acme', nsMappings, null, null,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.registryUrl, 'https://r.acme.io');
    assert.equal(result.source, RESOLUTION_SOURCE.NAMESPACE);
  });

  it('should include audit info for namespace resolution', () => {
    const result = resolveRegistryMapping(
      'acme', nsMappings, null, null,
    );
    assert.equal(result.auditInfo.namespace, 'acme');
    assert.equal(
      result.auditInfo.source, RESOLUTION_SOURCE.NAMESPACE,
    );
    assert.equal(
      result.auditInfo.registryUrl, 'https://r.acme.io',
    );
  });

  it('should fall back to default when ns not found', () => {
    const result = resolveRegistryMapping(
      'unknown', nsMappings, null, defaultMapping,
    );
    assert.equal(result.resolved, true);
    assert.equal(
      result.registryUrl, 'https://default.registry.io',
    );
    assert.equal(result.source, RESOLUTION_SOURCE.DEFAULT);
  });

  it('should include audit info for default resolution', () => {
    const result = resolveRegistryMapping(
      'unknown', nsMappings, null, defaultMapping,
    );
    assert.equal(result.auditInfo.namespace, 'unknown');
    assert.equal(
      result.auditInfo.source, RESOLUTION_SOURCE.DEFAULT,
    );
  });

  it('should return resolved false with no mapping/default', () => {
    const result = resolveRegistryMapping(
      'unknown', nsMappings, null, null,
    );
    assert.equal(result.resolved, false);
    assert.ok(result.errors.includes(
      RESOLVER_ERROR.NO_MAPPING_FOUND,
    ));
    assert.ok(result.errors.includes(
      RESOLVER_ERROR.NO_DEFAULT_MAPPING,
    ));
  });

  it('should prefer override over namespace mapping', () => {
    const override = {
      registryUrl: 'https://override.registry.io',
    };
    const result = resolveRegistryMapping(
      'acme', nsMappings, override, defaultMapping,
    );
    assert.equal(result.resolved, true);
    assert.equal(
      result.registryUrl, 'https://override.registry.io',
    );
    assert.equal(result.source, RESOLUTION_SOURCE.OVERRIDE);
  });

  it('should include audit info for override resolution', () => {
    const override = {
      registryUrl: 'https://override.registry.io',
    };
    const result = resolveRegistryMapping(
      'acme', nsMappings, override, null,
    );
    assert.equal(result.auditInfo.namespace, 'acme');
    assert.equal(
      result.auditInfo.source, RESOLUTION_SOURCE.OVERRIDE,
    );
  });

  it('should skip override with no registryUrl', () => {
    const result = resolveRegistryMapping(
      'acme', nsMappings, {}, null,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.source, RESOLUTION_SOURCE.NAMESPACE);
  });

  it('should return error when namespace is empty', () => {
    const result = resolveRegistryMapping(
      '', nsMappings, null, defaultMapping,
    );
    assert.equal(result.resolved, false);
    assert.ok(result.errors.includes(
      RESOLVER_ERROR.NAMESPACE_REQUIRED,
    ));
  });

  it('should accept mappings as an array', () => {
    const arrayMappings = [
      {namespace: 'acme', registryUrl: 'https://r.acme.io'},
    ];
    const result = resolveRegistryMapping(
      'acme', arrayMappings, null, null,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.registryUrl, 'https://r.acme.io');
    assert.equal(result.source, RESOLUTION_SOURCE.NAMESPACE);
  });
});


// --- lookupPackageOverride ---

describe('lookupPackageOverride', () => {
  it('should find override from a Map by namespace:name', () => {
    const overrides = new Map([
      ['acme:fraud-policy', {
        namespace: 'acme',
        name: 'fraud-policy',
        registryUrl: 'https://override.acme.io',
      }],
    ]);
    const result = lookupPackageOverride(
      'acme', 'fraud-policy', overrides,
    );
    assert.equal(result.registryUrl, 'https://override.acme.io');
  });

  it('should find override from an array', () => {
    const overrides = [
      {
        namespace: 'acme',
        name: 'fraud-policy',
        registryUrl: 'https://override.acme.io',
      },
      {
        namespace: 'ddb',
        name: 'sql-callbacks',
        registryUrl: 'https://override.ddb.io',
      },
    ];
    const result = lookupPackageOverride(
      'ddb', 'sql-callbacks', overrides,
    );
    assert.equal(result.registryUrl, 'https://override.ddb.io');
  });

  it('should return null when not found in Map', () => {
    const overrides = new Map([
      ['acme:fraud-policy', {
        namespace: 'acme',
        name: 'fraud-policy',
        registryUrl: 'https://override.acme.io',
      }],
    ]);
    const result = lookupPackageOverride(
      'acme', 'other-pkg', overrides,
    );
    assert.equal(result, null);
  });

  it('should return null when not found in array', () => {
    const overrides = [
      {
        namespace: 'acme',
        name: 'fraud-policy',
        registryUrl: 'https://override.acme.io',
      },
    ];
    const result = lookupPackageOverride(
      'acme', 'other-pkg', overrides,
    );
    assert.equal(result, null);
  });

  it('should return null for null overrides', () => {
    const result = lookupPackageOverride(
      'acme', 'fraud-policy', null,
    );
    assert.equal(result, null);
  });

  it('should return null for undefined overrides', () => {
    const result = lookupPackageOverride(
      'acme', 'fraud-policy', undefined,
    );
    assert.equal(result, null);
  });
});

// --- resolvePackageSource ---

describe('resolvePackageSource', () => {
  const nsMappings = new Map([
    ['acme', {namespace: 'acme', registryUrl: 'https://r.acme.io'}],
    ['ddb', {namespace: 'ddb', registryUrl: 'https://r.ddb.io'}],
  ]);
  const defaultMapping = {
    registryUrl: 'https://default.registry.io',
  };
  const overrides = new Map([
    ['acme:fraud-policy', {
      namespace: 'acme',
      name: 'fraud-policy',
      registryUrl: 'https://override.acme.io',
    }],
  ]);

  it('should resolve via override when found', () => {
    const result = resolvePackageSource(
      'acme', 'fraud-policy', overrides,
      nsMappings, defaultMapping,
    );
    assert.equal(result.resolved, true);
    assert.equal(
      result.registryUrl, 'https://override.acme.io',
    );
    assert.equal(result.source, RESOLUTION_SOURCE.OVERRIDE);
  });

  it('should include audit info identifying override source', () => {
    const result = resolvePackageSource(
      'acme', 'fraud-policy', overrides,
      nsMappings, defaultMapping,
    );
    assert.equal(
      result.auditInfo.source, RESOLUTION_SOURCE.OVERRIDE,
    );
    assert.equal(result.auditInfo.namespace, 'acme');
    assert.equal(
      result.auditInfo.registryUrl, 'https://override.acme.io',
    );
  });

  it('should fall through to namespace mapping when no override',
    () => {
      const result = resolvePackageSource(
        'acme', 'other-pkg', overrides,
        nsMappings, defaultMapping,
      );
      assert.equal(result.resolved, true);
      assert.equal(result.registryUrl, 'https://r.acme.io');
      assert.equal(
        result.source, RESOLUTION_SOURCE.NAMESPACE,
      );
    });

  it('should fall through to default when no override or ns map',
    () => {
      const result = resolvePackageSource(
        'unknown', 'some-pkg', overrides,
        nsMappings, defaultMapping,
      );
      assert.equal(result.resolved, true);
      assert.equal(
        result.registryUrl, 'https://default.registry.io',
      );
      assert.equal(result.source, RESOLUTION_SOURCE.DEFAULT);
    });

  it('should return error when namespace is empty', () => {
    const result = resolvePackageSource(
      '', 'fraud-policy', overrides,
      nsMappings, defaultMapping,
    );
    assert.equal(result.resolved, false);
    assert.ok(result.errors.includes(
      RESOLVER_ERROR.NAMESPACE_REQUIRED,
    ));
  });

  it('should return error when name is empty', () => {
    const result = resolvePackageSource(
      'acme', '', overrides, nsMappings, defaultMapping,
    );
    assert.equal(result.resolved, false);
    assert.ok(result.errors.includes(
      RESOLVER_ERROR.NAME_REQUIRED,
    ));
  });

  it('should work with array overrides', () => {
    const arrayOverrides = [
      {
        namespace: 'ddb',
        name: 'sql-callbacks',
        registryUrl: 'https://override.ddb.io',
      },
    ];
    const result = resolvePackageSource(
      'ddb', 'sql-callbacks', arrayOverrides,
      nsMappings, defaultMapping,
    );
    assert.equal(result.resolved, true);
    assert.equal(
      result.registryUrl, 'https://override.ddb.io',
    );
    assert.equal(result.source, RESOLUTION_SOURCE.OVERRIDE);
  });

  it('should work with null overrides', () => {
    const result = resolvePackageSource(
      'acme', 'fraud-policy', null,
      nsMappings, defaultMapping,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.registryUrl, 'https://r.acme.io');
    assert.equal(result.source, RESOLUTION_SOURCE.NAMESPACE);
  });
});

// --- OVERRIDE_KEY_SEPARATOR ---

describe('OVERRIDE_KEY_SEPARATOR', () => {
  it('should be a colon', () => {
    assert.equal(OVERRIDE_KEY_SEPARATOR, ':');
  });
});
