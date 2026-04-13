// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  resolvePackageSource,
  RESOLUTION_SOURCE,
  RESOLVER_ERROR,
} from '../../src/wasm-service/registry-resolver.js';

/**
 * Dedicated precedence tests for registry resolution chain:
 * package override -> namespace mapping -> default mapping
 *
 * Requirements: 4.1, 4.2
 */

// --- Shared fixtures ---

const OVERRIDE_URL = 'https://override.registry.io';
const NAMESPACE_URL = 'https://namespace.registry.io';
const DEFAULT_URL = 'https://default.registry.io';

const NS = 'acme';
const PKG = 'fraud-policy';

function makeOverrides(ns, name) {
  return new Map([
    [`${ns}:${name}`, {
      namespace: ns,
      name,
      registryUrl: OVERRIDE_URL,
    }],
  ]);
}

function makeMappings(ns) {
  return new Map([
    [ns, {namespace: ns, registryUrl: NAMESPACE_URL}],
  ]);
}

const DEFAULT_MAPPING = {registryUrl: DEFAULT_URL};

// --- Precedence chain tests ---

describe('resolver precedence chain', () => {
  it('override wins when all three sources exist', () => {
    const result = resolvePackageSource(
      NS, PKG,
      makeOverrides(NS, PKG),
      makeMappings(NS),
      DEFAULT_MAPPING,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.registryUrl, OVERRIDE_URL);
    assert.equal(result.source, RESOLUTION_SOURCE.OVERRIDE);
  });

  it('namespace mapping wins when override is absent', () => {
    const result = resolvePackageSource(
      NS, PKG,
      new Map(),
      makeMappings(NS),
      DEFAULT_MAPPING,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.registryUrl, NAMESPACE_URL);
    assert.equal(result.source, RESOLUTION_SOURCE.NAMESPACE);
  });

  it('default wins when override and namespace are absent', () => {
    const result = resolvePackageSource(
      NS, PKG,
      new Map(),
      new Map(),
      DEFAULT_MAPPING,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.registryUrl, DEFAULT_URL);
    assert.equal(result.source, RESOLUTION_SOURCE.DEFAULT);
  });

  it('fails when all three sources are absent', () => {
    const result = resolvePackageSource(
      NS, PKG,
      new Map(),
      new Map(),
      null,
    );
    assert.equal(result.resolved, false);
    assert.ok(result.errors.includes(
      RESOLVER_ERROR.NO_MAPPING_FOUND,
    ));
    assert.ok(result.errors.includes(
      RESOLVER_ERROR.NO_DEFAULT_MAPPING,
    ));
  });

  it('audit info identifies override source', () => {
    const result = resolvePackageSource(
      NS, PKG,
      makeOverrides(NS, PKG),
      makeMappings(NS),
      DEFAULT_MAPPING,
    );
    assert.equal(
      result.auditInfo.source, RESOLUTION_SOURCE.OVERRIDE,
    );
    assert.equal(result.auditInfo.namespace, NS);
    assert.equal(result.auditInfo.registryUrl, OVERRIDE_URL);
  });

  it('audit info identifies namespace source', () => {
    const result = resolvePackageSource(
      NS, PKG,
      new Map(),
      makeMappings(NS),
      DEFAULT_MAPPING,
    );
    assert.equal(
      result.auditInfo.source, RESOLUTION_SOURCE.NAMESPACE,
    );
    assert.equal(result.auditInfo.namespace, NS);
    assert.equal(result.auditInfo.registryUrl, NAMESPACE_URL);
  });

  it('audit info identifies default source', () => {
    const result = resolvePackageSource(
      NS, PKG,
      new Map(),
      new Map(),
      DEFAULT_MAPPING,
    );
    assert.equal(
      result.auditInfo.source, RESOLUTION_SOURCE.DEFAULT,
    );
    assert.equal(result.auditInfo.namespace, NS);
    assert.equal(result.auditInfo.registryUrl, DEFAULT_URL);
  });
});

// --- Property-based test ---

/**
 * **Validates: Requirements 4.1, 4.2**
 *
 * Property: for any valid namespace/name, if a per-package
 * override exists, it always takes precedence regardless of
 * namespace mapping or default mapping presence.
 */
describe('resolver precedence property', () => {
  const validIdent = fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/);

  it('override always wins when present', () => {
    fc.assert(
      fc.property(
        validIdent,
        validIdent,
        (ns, name) => {
          const overrideUrl = `https://ovr.${ns}.io`;
          const overrides = new Map([
            [`${ns}:${name}`, {
              namespace: ns,
              name,
              registryUrl: overrideUrl,
            }],
          ]);
          const mappings = new Map([
            [ns, {
              namespace: ns,
              registryUrl: `https://ns.${ns}.io`,
            }],
          ]);
          const dflt = {
            registryUrl: 'https://default.io',
          };

          const result = resolvePackageSource(
            ns, name, overrides, mappings, dflt,
          );

          assert.equal(result.resolved, true);
          assert.equal(result.registryUrl, overrideUrl);
          assert.equal(
            result.source, RESOLUTION_SOURCE.OVERRIDE,
          );
          assert.equal(
            result.auditInfo.source,
            RESOLUTION_SOURCE.OVERRIDE,
          );
        },
      ),
      {numRuns: 10},
    );
  });
});
