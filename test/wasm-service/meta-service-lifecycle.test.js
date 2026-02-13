import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  isMetaService,
  createMetaServiceReplica,
  startMetaServiceReplica,
  META_LIFECYCLE_ERROR_MSG,
} from '../../src/wasm-service/meta-service-lifecycle.js';
import {META_SERVICE_ID} from '../../src/constants/index.js';
import {
  createWasmMetaDefinition,
  createAdminMetaDefinition,
} from '../../src/wasm-service/meta-service-factory.js';

describe('meta-service-lifecycle', () => {
  describe('isMetaService', () => {
    it('returns true for WASM_META', () => {
      assert.equal(isMetaService(META_SERVICE_ID.WASM_META), true);
    });

    it('returns true for ADMIN_META', () => {
      assert.equal(isMetaService(META_SERVICE_ID.ADMIN_META), true);
    });

    it('returns false for arbitrary service IDs', () => {
      assert.equal(isMetaService('my-custom-service'), false);
      assert.equal(isMetaService(''), false);
      assert.equal(isMetaService('sys-other'), false);
    });
  });

  describe('createMetaServiceReplica', () => {
    it('delegates to lifecycle.createReplica', () => {
      const calls = [];
      const mockReplica = {id: 'replica-1'};
      const mockLifecycle = {
        createReplica: (def, config) => {
          calls.push({def, config});
          return mockReplica;
        },
      };
      const definition = createWasmMetaDefinition();
      const replicaConfig = {replicaId: 'r1', replicaIds: ['r1']};

      const result = createMetaServiceReplica(
        mockLifecycle, definition, replicaConfig,
      );

      assert.equal(result, mockReplica);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].def, definition);
      assert.equal(calls[0].config, replicaConfig);
    });

    it('works with admin meta definition', () => {
      const calls = [];
      const mockReplica = {id: 'replica-2'};
      const mockLifecycle = {
        createReplica: (def, config) => {
          calls.push({def, config});
          return mockReplica;
        },
      };
      const definition = createAdminMetaDefinition();
      const replicaConfig = {replicaId: 'r2', replicaIds: ['r2']};

      const result = createMetaServiceReplica(
        mockLifecycle, definition, replicaConfig,
      );

      assert.equal(result, mockReplica);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].def.serviceId, META_SERVICE_ID.ADMIN_META);
    });

    it('throws for non-meta service IDs', () => {
      const mockLifecycle = {
        createReplica: () => ({}),
      };
      const definition = {serviceId: 'user-service'};
      const replicaConfig = {replicaId: 'r1'};

      assert.throws(
        () => createMetaServiceReplica(
          mockLifecycle, definition, replicaConfig,
        ),
        {message: META_LIFECYCLE_ERROR_MSG.NOT_META_SERVICE},
      );
    });

    it('throws when lifecycle is missing', () => {
      const definition = createWasmMetaDefinition();
      const replicaConfig = {replicaId: 'r1'};

      assert.throws(
        () => createMetaServiceReplica(
          null, definition, replicaConfig,
        ),
        {message: META_LIFECYCLE_ERROR_MSG.LIFECYCLE_REQUIRED},
      );
    });
  });

  describe('startMetaServiceReplica', () => {
    it('delegates to lifecycle.startReplica', () => {
      const calls = [];
      const startResult = {port: 8080, endpoint: {id: 'ep-1'}};
      const mockLifecycle = {
        startReplica: (id, opts) => {
          calls.push({id, opts});
          return startResult;
        },
      };
      const opts = {address: 'node-1'};

      const result = startMetaServiceReplica(
        mockLifecycle, META_SERVICE_ID.WASM_META, opts,
      );

      assert.equal(result, startResult);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].id, META_SERVICE_ID.WASM_META);
      assert.equal(calls[0].opts, opts);
    });

    it('returns port and endpoint from lifecycle', () => {
      const expectedPort = 9090;
      const expectedEndpoint = {
        endpoint_id: 'ep-2',
        service_id: META_SERVICE_ID.ADMIN_META,
      };
      const mockLifecycle = {
        startReplica: () => ({
          port: expectedPort,
          endpoint: expectedEndpoint,
        }),
      };

      const result = startMetaServiceReplica(
        mockLifecycle, META_SERVICE_ID.ADMIN_META, {},
      );

      assert.equal(result.port, expectedPort);
      assert.deepStrictEqual(result.endpoint, expectedEndpoint);
    });

    it('throws for non-meta service IDs', () => {
      const mockLifecycle = {
        startReplica: () => ({port: 8080, endpoint: {}}),
      };

      assert.throws(
        () => startMetaServiceReplica(
          mockLifecycle, 'random-service', {},
        ),
        {message: META_LIFECYCLE_ERROR_MSG.NOT_META_SERVICE},
      );
    });

    it('throws when lifecycle is missing', () => {
      assert.throws(
        () => startMetaServiceReplica(
          null, META_SERVICE_ID.WASM_META, {},
        ),
        {message: META_LIFECYCLE_ERROR_MSG.LIFECYCLE_REQUIRED},
      );
    });
  });

  describe('META_LIFECYCLE_ERROR_MSG', () => {
    it('is frozen', () => {
      assert.ok(Object.isFrozen(META_LIFECYCLE_ERROR_MSG));
    });

    it('has expected keys', () => {
      assert.ok(META_LIFECYCLE_ERROR_MSG.NOT_META_SERVICE);
      assert.ok(META_LIFECYCLE_ERROR_MSG.LIFECYCLE_REQUIRED);
    });
  });
});
