// The propagation's two required ports: construction without either fails
// typed (R11: no quieter path when the port is absent).
// - CDCGroupPropagationService.initialize: its cache is the node's
//   SystemTableCache (or read-only view), whose change port every bound
//   propagation's recipient-domain watch consumes (cdc-propagation-progress.js).
// - The source lane's topology binding (partition-cdc-obligation-progress.js):
//   the subscriber that binds a propagation answers getCDCPropagationService.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {COLUMN} from '../../src/constants/index.js';
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {CDC_GROUP_PROPAGATION_ERROR_MSG} from
  '../../src/topology/cdc-group-propagation-constants.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {CDC_TOPOLOGY_BINDING_ERROR, cdcRecipientInvocation} from
  '../../src/partition/partition-cdc-obligation-progress.js';
import {beginDurableCdcInvocation, createTopologyCache, setupConfig, teardownConfig} from
  './cdc-group-propagation-service-harness.js';

beforeEach(() => setupConfig(LATENCY_PROPAGATION_MODE.SAFE));
afterEach(teardownConfig);

const NODE_ID = 'node-a';
const tree = {getRoutingOrder: () => []};

function initialized(systemTableCache) {
  const service = new CDCGroupPropagationService({nodeId: NODE_ID, systemTableCache,
    latencyTreeService: tree, messageRouter: {deliver: async () => null}});
  service.initialize();
  return service;
}

test('CDCGroupPropagationService.initialize refuses a cache without the change port', () => {
  const rowsOnly = {get: () => null, getAll: () => [], filter: () => []};
  assert.throws(() => initialized(rowsOnly), (error) =>
    error.message === CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CACHE_CHANGE_PORT &&
    error.isCritical === true);
});

test('CDCGroupPropagationService.initialize takes the node cache or its read-only view', () => {
  const cache = createTopologyCache({nodes: [{[COLUMN.NODE_ID]: NODE_ID}]});
  assert.equal(initialized(cache).systemTableCache, cache);
  const view = createReadOnlyCache(cache);
  assert.equal(initialized(view).systemTableCache, view);
});

test('binding a propagation for a subscriber without getCDCPropagationService is refused',
  () => {
    const rawSubscriber = async () => null;
    const branch = {original: rawSubscriber, topology: null, releases: 0,
      primary: {groupId: null, route: null, cursor: null, drive: null}};
    const invocation = cdcRecipientInvocation(beginDurableCdcInvocation(), () => true, branch,
      branch.primary, {recipientsObserved: () => {}, recipientDomainChanged: () => {}}, null);
    assert.throws(() => invocation.bindTopology({}, {}, []),
      (error) => error.code === CDC_TOPOLOGY_BINDING_ERROR.CODE);
    assert.equal(branch.topology, null, 'nothing was bound');
  });
