import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  registerBuiltInMetaServiceEndpoints,
  META_SERVICE_DEFINITION_REGISTRATION_ERROR,
} from '../../src/bootstrap/shared/meta-service-definition-registration.js';
import {SystemTableName} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {META_SERVICE_ID} from '../../src/constants/index.js';

describe('meta-service-endpoint-registration', () => {
  it('registers endpoint rows for built-in meta services', async () => {
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
      (entry) => entry.tableName === SystemTableName.SERVICE_ENDPOINTS,
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
      (entry) => entry.tableName === SystemTableName.SERVICE_ENDPOINTS,
    );
    assert.equal(endpointUpserts.length, 2);
    for (const endpoint of endpointUpserts) {
      assert.equal(endpoint.row.address, 'localhost');
      assert.equal(endpoint.row.port, 19090);
    }
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
});
