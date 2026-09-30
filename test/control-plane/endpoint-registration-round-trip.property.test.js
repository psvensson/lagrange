/**
 * EndpointService is a lifecycle shell over the service endpoints owner. Its
 * former registerEndpoint/removeEndpoint wrote service_endpoints rows with
 * no boot incarnation (schema DEFAULT 0) and had no production caller, so
 * they were deleted (D5/W-4): every endpoint mutation is owned by the
 * endpoint incarnation authority.
 */

import {test} from '../../src/test-helpers/tap.js';
import {EndpointService} from
  '../../src/control-plane/endpoint-service.js';
import {
  createSystemMetadataOwners,
} from '../../src/control-plane/owners/index.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN} from '../../src/constants/index.js';

/**
 * Initialize test singletons.
 */
function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

test('EndpointService writes no endpoint row (D5/W-4): reads route through ' +
  'the injected owner and every endpoint mutation belongs to the endpoint ' +
  'incarnation authority', async (t) => {
  initEnv();

  const calls = [];
  const row = {[COLUMN.ENDPOINT_ID]: 'ep-gateway', [COLUMN.NODE_ID]: 'node-a',
    [COLUMN.BOOT_INCARNATION]: 1};
  const gateway = {
    async readRows(tableName, _sql, params) {
      calls.push({kind: 'read', tableName, params});
      return {success: true, rows: params?.[0] === 'ep-gateway' ? [row] : []};
    },
  };
  const service = new EndpointService({
    nodeId: 'local-node',
    serviceEndpointsOwner: createSystemMetadataOwners({
      controlPlaneSystemTableGateway: gateway,
    }).serviceEndpointsOwner,
  });
  service.initialize();

  t.same(await service.getEndpoint('ep-gateway'), row,
    'the read goes through the owner boundary');
  t.same(calls.map((entry) => entry.kind), ['read']);
  for (const verb of ['registerEndpoint', 'removeEndpoint', 'updateEndpoint',
    'insertEndpoint', 'upsertEndpoint']) {
    t.equal(typeof service[verb], 'undefined',
      `EndpointService has no ${verb} (no incarnation-less endpoint writer)`);
  }
  service.stop();
});

test('EndpointService requires the owner path and does not fall back to the gateway',
  async (t) => {
    initEnv();

    const service = new EndpointService({
      nodeId: 'local-node',
      controlPlaneSystemTableGateway: {
        async readRows() {
          throw new Error('gateway fallback must not be used');
        },
      },
    });

    try {
      service.initialize();
      t.fail('endpoint service should fail closed without the owner path');
    } catch (error) {
      t.match(error.message, /serviceEndpointsOwner/);
      t.equal(error.code, 'SYSTEM_METADATA_OWNER_REQUIRED');
      t.equal(error.outcome, 'owner_not_ready');
    }
  });
