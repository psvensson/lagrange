import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  registerBuiltInMetaServiceEndpoints,
  META_SERVICE_DEFINITION_REGISTRATION_ERROR,
} from '../../src/bootstrap/shared/meta-service-definition-registration.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {META_SERVICE_ID} from '../../src/constants/index.js';

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
});
