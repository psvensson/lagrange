import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  registerBuiltInMetaServiceEndpoints,
  META_SERVICE_DEFINITION_REGISTRATION_ERROR,
} from '../../src/bootstrap/shared/meta-service-definition-registration.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {META_SERVICE_ID} from '../../src/constants/index.js';
import {ServiceEndpointsOwner} from
  '../../src/control-plane/owners/service-endpoints-owner.js';
import {
  wireRuntimeEndpointPublication,
} from '../../src/runtime/runtime-endpoint-publication-wiring.js';
import {RuntimeServiceHandlerSetup} from
  '../../src/bootstrap/shared/runtime-service-handler-setup.js';
import {DependencyError} from '../../src/bootstrap/bootstrap-errors.js';
import {
  clearRegisteredControlPlaneSystemTableGateway,
  registerControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-gateway-registry.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';

const NODE_ID = 'node-a';
const LOGICAL_SERVICE_ID = 'sys-postgres-wire';
const REPLICA_ID = `${LOGICAL_SERVICE_ID}-r1`;

function createRuntimeEndpointFixture() {
  const mutations = [];
  const gateway = {
    async upsertSystemTableRow(tableName, row) {
      mutations.push({operation: 'upsert', tableName, row});
      return {success: true};
    },
    async deleteSystemTableRow(tableName, where) {
      mutations.push({operation: 'delete', tableName, where});
      return {success: true};
    },
  };
  const cache = {
    getAll(tableName) {
      if (tableName !== SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS) return [];
      return [{service_id: LOGICAL_SERVICE_ID}];
    },
  };
  const lifecycle = {
    endpointWriter: null,
    endpointRemover: null,
    setEndpointWriter(writer) {
      this.endpointWriter = writer;
    },
    setEndpointRemover(remover) {
      this.endpointRemover = remover;
    },
  };
  const owner = new ServiceEndpointsOwner({
    controlPlaneSystemTableGateway: gateway,
    systemTableCache: cache,
  });
  wireRuntimeEndpointPublication({
    nodeId: NODE_ID,
    serviceEndpointsOwner: owner,
    serviceRuntimeLifecycle: lifecycle,
    systemTableCache: cache,
  });
  return {cache, lifecycle, mutations};
}

function createHandlerSetupOptions(lifecycle) {
  return {
    nodeId: NODE_ID,
    messageRouter: {register() {}},
    cdcIntegrationService: {},
    systemTableCache: new SystemTableCache(),
    serviceLifecycleManager: {},
    serviceRuntimeLifecycle: lifecycle,
  };
}

function createRecordingLifecycle() {
  return {
    endpointWriter: null,
    endpointRemover: null,
    setEndpointWriter(writer) {
      this.endpointWriter = writer;
    },
    setEndpointRemover(remover) {
      this.endpointRemover = remover;
    },
  };
}

describe('runtime endpoint publication wiring at handler setup', () => {
  it('refuses setup when no control-plane gateway is registered', () => {
    clearRegisteredControlPlaneSystemTableGateway();
    const lifecycle = createRecordingLifecycle();
    assert.throws(
      () => RuntimeServiceHandlerSetup.create(
        createHandlerSetupOptions(lifecycle),
      ),
      (error) =>
        error instanceof DependencyError &&
        /controlPlaneSystemTableGateway/u.test(error.message),
      'a missing gateway is an explicit startup-ordering failure, ' +
        'never a silently unwired lifecycle',
    );
    assert.equal(lifecycle.endpointWriter, null);
    assert.equal(lifecycle.endpointRemover, null);
  });

  it('wires the lifecycle over the registered gateway', () => {
    const gateway = {
      async upsertSystemTableRow() {
        return {success: true};
      },
      async deleteSystemTableRow() {
        return {success: true};
      },
    };
    registerControlPlaneSystemTableGateway(gateway);
    try {
      const lifecycle = createRecordingLifecycle();
      const {runtimeServiceHandler} = RuntimeServiceHandlerSetup.create(
        createHandlerSetupOptions(lifecycle),
      );
      assert.ok(runtimeServiceHandler);
      assert.equal(typeof lifecycle.endpointWriter, 'function');
      assert.equal(typeof lifecycle.endpointRemover, 'function');
    } finally {
      clearRegisteredControlPlaneSystemTableGateway();
    }
  });
});

describe('meta-service-endpoint-registration', () => {
  it('registers only boot-owned meta endpoints', async () => {
    const upserts = [];
    const endpointIds = await registerBuiltInMetaServiceEndpoints({
      upsertRow: async (tableName, row) => {
        upserts.push({tableName, row});
      },
      nodeId: 'node-1',
      nodeAddress: 'ws://127.0.0.1:18080',
      wsPort: 18080,
    });

    assert.equal(endpointIds.length, 2);
    const endpointUpserts = upserts.filter(
      (entry) => entry.tableName === SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS,
    );
    assert.equal(endpointUpserts.length, 2);

    assert.ok(endpointUpserts.some((entry) => {
      return entry.row.service_id === META_SERVICE_ID.WASM_META &&
        entry.row.node_id === 'node-1' &&
        entry.row.address === '127.0.0.1' &&
        entry.row.port === 18080;
    }));

    assert.ok(endpointUpserts.some((entry) => {
      return entry.row.service_id === META_SERVICE_ID.ADMIN_META &&
        entry.row.node_id === 'node-1' &&
        entry.row.address === '127.0.0.1' &&
        entry.row.port === 18080;
    }));

    assert.equal(
      endpointUpserts.some((entry) =>
        entry.row.service_id === META_SERVICE_ID.POSTGRES_WIRE),
      false,
      'sys-postgres-wire is a placed runtime service, not a boot endpoint',
    );
  });

  it('derives endpoint port from nodeAddress when wsPort is not provided', async () => {
    const upserts = [];
    await registerBuiltInMetaServiceEndpoints({
      upsertRow: async (tableName, row) => {
        upserts.push({tableName, row});
      },
      nodeId: 'node-1',
      nodeAddress: 'localhost:19090',
    });

    const endpointUpserts = upserts.filter(
      (entry) => entry.tableName === SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS,
    );
    assert.equal(endpointUpserts.length, 2);
    for (const endpoint of endpointUpserts) {
      assert.equal(endpoint.row.address, 'localhost');
      assert.equal(endpoint.row.port, 19090);
    }
    assert.equal(
      endpointUpserts.some((entry) =>
        entry.row.service_id === META_SERVICE_ID.POSTGRES_WIRE),
      false,
    );
  });

  it('fails when endpoint port cannot be resolved', async () => {
    await assert.rejects(
      registerBuiltInMetaServiceEndpoints({
        upsertRow: async () => {},
        nodeId: 'node-1',
        nodeAddress: 'node-without-port',
      }),
      new RegExp(META_SERVICE_DEFINITION_REGISTRATION_ERROR.ENDPOINT_PORT_REQUIRED),
    );
  });

  it('fails when endpoint address would otherwise fall back to nodeId', async () => {
    await assert.rejects(
      registerBuiltInMetaServiceEndpoints({
        upsertRow: async () => {},
        nodeId: 'node-1',
        wsPort: 18080,
      }),
      new RegExp(
        META_SERVICE_DEFINITION_REGISTRATION_ERROR.ENDPOINT_ADDRESS_REQUIRED,
      ),
    );
  });

  it('publishes a runtime endpoint only after runtime endpoint intent', async () => {
    const {lifecycle, mutations} = createRuntimeEndpointFixture();
    assert.equal(mutations.length, 0);

    await lifecycle.endpointWriter(
      REPLICA_ID,
      'native_js',
      {host: '0.0.0.0', port: 5432, protocol: 'postgresql'},
      {causeId: 'cause-start'},
    );

    assert.equal(mutations.length, 1);
    assert.equal(mutations[0].operation, 'upsert');
    assert.equal(mutations[0].tableName, SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS);
    assert.equal(mutations[0].row.service_id, LOGICAL_SERVICE_ID);
    assert.equal(mutations[0].row.node_id, NODE_ID);
    assert.equal(
      mutations[0].row.endpoint_id,
      `${LOGICAL_SERVICE_ID}-ep-${NODE_ID}`,
    );
    assert.equal(mutations[0].row.protocol, 'postgresql');
    assert.equal(mutations[0].row.port, 5432);
    assert.equal(mutations[0].row.health_status, 'healthy');
  });

  it('removes the runtime-owned endpoint when the runtime replica stops', async () => {
    const {lifecycle, mutations} = createRuntimeEndpointFixture();
    await lifecycle.endpointWriter(
      REPLICA_ID,
      'native_js',
      {host: '0.0.0.0', port: 5432, protocol: 'postgresql'},
    );
    await lifecycle.endpointRemover(
      REPLICA_ID,
      NODE_ID,
      {causeId: 'cause-stop'},
    );

    assert.equal(mutations.length, 2);
    assert.equal(mutations[1].operation, 'delete');
    assert.equal(mutations[1].tableName, SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS);
    assert.deepEqual(mutations[1].where, {
      endpoint_id: `${LOGICAL_SERVICE_ID}-ep-${NODE_ID}`,
    });
  });

  it('fails closed when runtime replica identity matches no desired service', async () => {
    const {cache, lifecycle} = createRuntimeEndpointFixture();
    cache.getAll = () => [];
    await assert.rejects(
      lifecycle.endpointWriter(
        REPLICA_ID,
        'native_js',
        {host: '0.0.0.0', port: 5432, protocol: 'postgresql'},
      ),
      /could not resolve logical service/u,
    );
  });
});
