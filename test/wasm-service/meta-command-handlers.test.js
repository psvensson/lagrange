import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  handlePublishModule,
  handleGetModule,
  handleListModules,
  handleCreateService,
  handleUpdateService,
  handleScaleService,
  handleDeleteService,
  META_COMMAND_ERROR_MSG,
  COLUMN_COUNT,
} from '../../src/wasm-service/meta-command-handlers.js';
import {TABLES} from '../../src/constants/tables.js';
import {
  DIGEST_HEX_LENGTH,
  MODULE_MANIFEST_ERROR_MSG,
} from '../../src/wasm-service/module-manifest-constants.js';
import {SERVICE_PROFILE} from '../../src/constants/service.js';
import {
  WASM_SERVICE_DEFINITION_STATUS,
} from '../../src/wasm-service/wasm-service-constants.js';
import {SD_COL} from '../../src/wasm-service/wasm-service-models.js';

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
      MODULE_MANIFEST_ERROR_MSG.NAMESPACE_REQUIRED
    ));
  });

  it('returns failure when manifest is missing', () => {
    const result = handlePublishModule({});
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.MANIFEST_REQUIRED
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
      META_COMMAND_ERROR_MSG.NAMESPACE_REQUIRED
    ));
  });

  it('returns failure when name is missing', () => {
    const result = handleGetModule({
      namespace: 'acme',
      version: '1.0.0',
    });
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.NAME_REQUIRED
    ));
  });

  it('returns failure when version is missing', () => {
    const result = handleGetModule({
      namespace: 'acme',
      name: 'fraud-policy',
    });
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.VERSION_REQUIRED
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


function makeValidServiceParams(overrides = {}) {
  return {
    serviceId: 'svc-test-1',
    serviceName: 'test-service',
    handlerFunctionId: 'fn-handler-1',
    ...overrides,
  };
}

describe('handleCreateService', () => {
  it('returns success with INSERT SQL for valid params', () => {
    const result = handleCreateService(makeValidServiceParams());
    assert.equal(result.success, true);
    assert.ok(result.sql);
    assert.ok(Array.isArray(result.params));
    assert.equal(result.serviceId, 'svc-test-1');
  });

  it('returns failure when serviceId is missing', () => {
    const result = handleCreateService(
      makeValidServiceParams({serviceId: undefined})
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.SERVICE_ID_REQUIRED
    ));
  });

  it('returns failure when serviceName is missing', () => {
    const result = handleCreateService(
      makeValidServiceParams({serviceName: undefined})
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.SERVICE_NAME_REQUIRED
    ));
  });

  it('returns failure when handlerFunctionId is missing', () => {
    const result = handleCreateService(
      makeValidServiceParams({handlerFunctionId: undefined})
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.HANDLER_FUNCTION_REQUIRED
    ));
  });

  it('skips handler check for sql_engine profile', () => {
    const result = handleCreateService(makeValidServiceParams({
      handlerFunctionId: undefined,
      serviceProfile: SERVICE_PROFILE.SQL_ENGINE,
    }));
    assert.equal(result.success, true);
  });

  it('returns failure when replicaCount is even', () => {
    const result = handleCreateService(
      makeValidServiceParams({replicaCount: 4})
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.REPLICA_COUNT_ODD
    ));
  });

  it('SQL uses correct table name', () => {
    const result = handleCreateService(makeValidServiceParams());
    assert.ok(result.sql.includes(TABLES.SERVICE_DEFINITIONS));
  });
});

describe('handleUpdateService', () => {
  it('returns success with UPDATE SQL for valid params', () => {
    const result = handleUpdateService({
      serviceId: 'svc-test-1',
      readConsistency: 'eventual',
    });
    assert.equal(result.success, true);
    assert.ok(result.sql);
    assert.equal(result.serviceId, 'svc-test-1');
  });

  it('returns failure when serviceId is missing', () => {
    const result = handleUpdateService({
      readConsistency: 'eventual',
    });
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.SERVICE_ID_REQUIRED
    ));
  });

  it('returns failure when no fields to update', () => {
    const result = handleUpdateService({
      serviceId: 'svc-test-1',
    });
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.NO_FIELDS_TO_UPDATE
    ));
  });

  it('SQL includes SET clause with provided fields', () => {
    const result = handleUpdateService({
      serviceId: 'svc-test-1',
      readConsistency: 'eventual',
      writeConsistency: 'async',
    });
    assert.ok(result.sql.includes(SD_COL.READ_CONSISTENCY));
    assert.ok(result.sql.includes(SD_COL.WRITE_CONSISTENCY));
    assert.ok(result.sql.includes(SD_COL.UPDATED_AT));
  });
});

describe('handleScaleService', () => {
  it('returns success with UPDATE SQL for valid params', () => {
    const result = handleScaleService({
      serviceId: 'svc-test-1',
      replicaCount: 5,
    });
    assert.equal(result.success, true);
    assert.ok(result.sql);
    assert.equal(result.serviceId, 'svc-test-1');
  });

  it('returns failure when serviceId is missing', () => {
    const result = handleScaleService({replicaCount: 5});
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.SERVICE_ID_REQUIRED
    ));
  });

  it('returns failure when replicaCount is missing', () => {
    const result = handleScaleService({serviceId: 'svc-test-1'});
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.REPLICA_COUNT_REQUIRED
    ));
  });

  it('returns failure when replicaCount is even', () => {
    const result = handleScaleService({
      serviceId: 'svc-test-1',
      replicaCount: 4,
    });
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.REPLICA_COUNT_ODD
    ));
  });
});

describe('handleDeleteService', () => {
  it('returns success with UPDATE SQL (soft delete)', () => {
    const result = handleDeleteService({serviceId: 'svc-test-1'});
    assert.equal(result.success, true);
    assert.ok(result.sql);
    assert.equal(result.serviceId, 'svc-test-1');
  });

  it('returns failure when serviceId is missing', () => {
    const result = handleDeleteService({});
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.SERVICE_ID_REQUIRED
    ));
  });

  it('SQL sets status to inactive', () => {
    const result = handleDeleteService({serviceId: 'svc-test-1'});
    assert.ok(result.sql.includes(SD_COL.STATUS));
    assert.ok(result.params.includes(
      WASM_SERVICE_DEFINITION_STATUS.INACTIVE
    ));
  });
});
