import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  handlePublishModule,
  handleGetModule,
  handleListModules,
  META_COMMAND_ERROR_MSG,
  COLUMN_COUNT,
} from '../../src/wasm-service/meta-command-handlers.js';
import {TABLES} from '../../src/constants/tables.js';
import {
  DIGEST_HEX_LENGTH,
  MODULE_MANIFEST_ERROR_MSG,
} from '../../src/wasm-service/module-manifest-constants.js';

const DIGEST_HEX = 'a'.repeat(DIGEST_HEX_LENGTH);

function makeValidManifest(overrides = {}) {
  return {
    namespace: 'acme',
    name: 'fraud-policy',
    version: '1.0.0',
    digest: `sha256:${DIGEST_HEX}`,
    runExport: 'handle',
    exports: ['handle'],
    dependencies: [],
    capabilities: [],
    ...overrides,
  };
}

describe('handlePublishModule', () => {
  it('returns success with SQL for valid manifest', () => {
    const result = handlePublishModule({
      manifest: makeValidManifest(),
    });
    assert.equal(result.success, true);
    assert.ok(result.sql);
    assert.ok(Array.isArray(result.params));
    assert.ok(result.manifest);
  });

  it('returns failure with errors for invalid manifest', () => {
    const result = handlePublishModule({
      manifest: makeValidManifest({namespace: ''}),
    });
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      MODULE_MANIFEST_ERROR_MSG.NAMESPACE_REQUIRED,
    ));
  });

  it('returns failure when manifest is missing', () => {
    const result = handlePublishModule({});
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.MANIFEST_REQUIRED,
    ));
  });

  it('SQL uses correct table name', () => {
    const result = handlePublishModule({
      manifest: makeValidManifest(),
    });
    assert.ok(result.sql.includes(TABLES.MODULE_MANIFESTS));
  });

  it('params array has correct length', () => {
    const result = handlePublishModule({
      manifest: makeValidManifest(),
    });
    assert.equal(result.params.length, COLUMN_COUNT);
  });
});

describe('handleGetModule', () => {
  it('returns success with SELECT SQL for valid params', () => {
    const result = handleGetModule({
      namespace: 'acme',
      name: 'fraud-policy',
      version: '1.0.0',
    });
    assert.equal(result.success, true);
    assert.ok(result.sql.includes('SELECT'));
    assert.ok(result.sql.includes('WHERE'));
    assert.equal(result.params.length, 3);
  });

  it('returns failure when namespace is missing', () => {
    const result = handleGetModule({
      name: 'fraud-policy',
      version: '1.0.0',
    });
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.NAMESPACE_REQUIRED,
    ));
  });

  it('returns failure when name is missing', () => {
    const result = handleGetModule({
      namespace: 'acme',
      version: '1.0.0',
    });
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.NAME_REQUIRED,
    ));
  });

  it('returns failure when version is missing', () => {
    const result = handleGetModule({
      namespace: 'acme',
      name: 'fraud-policy',
    });
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.VERSION_REQUIRED,
    ));
  });

  it('SQL uses correct table name and WHERE clause', () => {
    const result = handleGetModule({
      namespace: 'acme',
      name: 'fraud-policy',
      version: '1.0.0',
    });
    assert.ok(result.sql.includes(TABLES.MODULE_MANIFESTS));
    assert.ok(result.sql.includes('namespace = ?1'));
    assert.ok(result.sql.includes('name = ?2'));
    assert.ok(result.sql.includes('version = ?3'));
  });
});

describe('handleListModules', () => {
  it('returns SQL without WHERE when no filters', () => {
    const result = handleListModules({});
    assert.equal(result.success, true);
    assert.ok(!result.sql.includes('WHERE'));
    assert.equal(result.params.length, 0);
  });

  it('returns SQL with namespace filter', () => {
    const result = handleListModules({namespace: 'acme'});
    assert.equal(result.success, true);
    assert.ok(result.sql.includes('WHERE'));
    assert.ok(result.sql.includes('namespace = ?1'));
    assert.equal(result.params.length, 1);
    assert.equal(result.params[0], 'acme');
  });

  it('returns SQL with namespace and name filters', () => {
    const result = handleListModules({
      namespace: 'acme',
      name: 'fraud-policy',
    });
    assert.equal(result.success, true);
    assert.ok(result.sql.includes('WHERE'));
    assert.ok(result.sql.includes('namespace = ?1'));
    assert.ok(result.sql.includes('name = ?2'));
    assert.equal(result.params.length, 2);
  });

  it('params array matches filter count', () => {
    const noFilter = handleListModules({});
    assert.equal(noFilter.params.length, 0);

    const oneFilter = handleListModules({namespace: 'acme'});
    assert.equal(oneFilter.params.length, 1);

    const twoFilters = handleListModules({
      namespace: 'acme',
      name: 'test',
    });
    assert.equal(twoFilters.params.length, 2);
  });
});
