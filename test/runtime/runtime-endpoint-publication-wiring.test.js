import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {ServiceEndpointsOwner} from
  '../../src/control-plane/owners/service-endpoints-owner.js';
import {
  wireRuntimeEndpointPublication,
} from '../../src/runtime/runtime-endpoint-publication-wiring.js';

const NODE_ID = 'node-a';
const LOGICAL_SERVICE_ID = 'sys-postgres-wire';
const REPLICA_ID = `${LOGICAL_SERVICE_ID}-r1`;

function createFixture() {
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

describe('runtime endpoint publication wiring', () => {
  it('publishes logical service identity only after runtime endpoint intent', async () => {
    const {lifecycle, mutations} = createFixture();
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
    assert.equal(mutations[0].row.endpoint_id, `${LOGICAL_SERVICE_ID}-ep-${NODE_ID}`);
    assert.equal(mutations[0].row.protocol, 'postgresql');
    assert.equal(mutations[0].row.port, 5432);
    assert.equal(mutations[0].row.health_status, 'healthy');
  });

  it('removes the same logical endpoint when the runtime replica stops', async () => {
    const {lifecycle, mutations} = createFixture();
    await lifecycle.endpointWriter(
      REPLICA_ID,
      'native_js',
      {host: '0.0.0.0', port: 5432, protocol: 'postgresql'},
    );
    await lifecycle.endpointRemover(REPLICA_ID, NODE_ID, {causeId: 'cause-stop'});

    assert.equal(mutations.length, 2);
    assert.equal(mutations[1].operation, 'delete');
    assert.equal(mutations[1].tableName, SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS);
    assert.deepEqual(mutations[1].where, {
      endpoint_id: `${LOGICAL_SERVICE_ID}-ep-${NODE_ID}`,
    });
  });

  it('fails closed when replica identity matches no desired service', async () => {
    const {cache, lifecycle} = createFixture();
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
