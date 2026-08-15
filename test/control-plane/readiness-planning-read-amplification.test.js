import {test} from '../../src/test-helpers/tap.js';
import {
  createActiveNode,
  createCache,
  createMessageGroupService,
  createPublicationService,
} from './control-plane-readiness-service-test-support.js';
import {
  CONTROL_PLANE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  readSharedNodeRows,
} from '../../src/control-plane/readiness-planning-formation-source.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';

const READ_AMPLIFICATION_NOW_MS = 620000;
const NODE_COUNT = 3;

function createCountingService() {
  const nodeIds = Array.from(
    {length: NODE_COUNT},
    (_, index) => `node-${index}`,
  );
  const cache = createCache({
    nodes: nodeIds.map((id) => createActiveNode(id)),
    services: [createMessageGroupService(nodeIds[0])],
  });
  const counters = {getAllNodeReads: 0};
  const originalGetAll = cache.getAll.bind(cache);
  cache.getAll = (tableName) => {
    if (tableName === TABLES.NODES) {
      counters.getAllNodeReads += 1;
    }
    return originalGetAll(tableName);
  };
  const service = new ControlPlaneReadinessService({
    nodeId: nodeIds[0],
    systemTableCache: cache,
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => READ_AMPLIFICATION_NOW_MS,
  });
  return {service, cache, counters, nodeIds};
}

test('planning reads share one frozen node-row view instead of strict ' +
  'copies', async (t) => {
  const {service, cache} = createCountingService();
  const shared = cache.getAll(TABLES.NODES);
  const rows = readSharedNodeRows(service);
  t.equal(rows.length, NODE_COUNT, 'every cached node row is served');
  t.equal(rows[0], shared[0],
    'the planning read serves the cache’s own shared rows by reference ' +
      'instead of strict-copying the table per call (the production cache ' +
      'deep-freezes these rows via readView; the test stub does not)');
  t.end();
});

test('one planning enqueue performs one node-table read and the consumed ' +
  'bootstrap never rescans', async (t) => {
  const {service, cache, counters, nodeIds} = createCountingService();
  const owner = service.readinessPlanningSnapshotOwner;
  t.ok(owner, 'the readiness planning snapshot owner is installed');

  counters.getAllNodeReads = 0;
  owner.enqueueOwnerKeys('read-amplification-regression');
  t.equal(counters.getAllNodeReads, 1,
    'one enqueue reads the node table exactly once for the owner list and ' +
      'both formation keys');

  owner.initialBootstrapConsumed = true;
  counters.getAllNodeReads = 0;
  t.equal(owner.canConsumeInitialBootstrap(nodeIds[0]), false,
    'a consumed bootstrap answers false');
  t.equal(counters.getAllNodeReads, 0,
    'a consumed bootstrap short-circuits before any node-table scan');

  counters.getAllNodeReads = 0;
  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    [COLUMN.NODE_ID]: nodeIds[1],
    status: 'active',
    revision: 2,
  });
  service.getNodeReadinessSync(nodeIds[1]);
  t.ok(counters.getAllNodeReads <= 3,
    'one cache change plus one readiness read stay within three node-table ' +
      `reads (observed ${counters.getAllNodeReads})`);
  t.end();
});
