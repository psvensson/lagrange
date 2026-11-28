// The spent-wait report of the routable-replica wait states the count the
// wait measured: one counting authority (getRoutablePartitionServiceNodeIds)
// for the condition and for its report, never a second decoding of the rows.
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createProvisioningReadyService} from './sql-query-engine-test-support.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const PARTITION_ID = 'tbl-routable-report-p1';
const SPENT_EVENT = 'wait_bound_spent';

function createEngine(logged) {
  const cache = {
    find(type, predicate) {
      return this.getAll(type).find(predicate);
    },
    filter() {
      return [];
    },
    getAll() {
      return [];
    },
  };
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: {
      deliver: async () => buildDeliveryEnvelope({acknowledged: true}, {success: true}),
    },
    controlPlaneReadinessService: createProvisioningReadyService(cache),
    tablePartitionProvisioningTimeoutMs: 50,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.logger = {
    debug() {},
    info() {},
    warn() {},
    error: (message, context) => logged.push(context),
  };
  engine.maybeAwaitPartitionRoutingRepair = async () => false;
  return engine;
}

test('the routable-count wait reports the count its condition measured', async (t) => {
  const logged = [];
  const engine = createEngine(logged);
  // One routable row whose node identity is not a node id: the wait's
  // counting authority does not count it, so the condition never holds.
  const snapshot = {routableServices: [{node_id: 7, address: 'node-x/partition/p1'}]};
  engine.queryExecutor.getPartitionRoutingSnapshot = () => snapshot;
  engine.queryExecutor.summarizePartitionRoutingSnapshot = () => ({routableServiceCount: 1});
  t.equal(engine.getRoutablePartitionServiceNodeIds(PARTITION_ID).length, 0,
    'the counting authority counts no routable node');

  await t.rejects(engine.waitForRoutablePartitionServiceCount(PARTITION_ID, 1),
    /Timed out waiting for routable partition service/);
  const report = logged.find((context) => context?.event === SPENT_EVENT);
  t.ok(report, 'the spent wait was reported');
  t.equal(report?.lastObserved?.requiredCount, 1);
  t.equal(report?.lastObserved?.routableCount, 0,
    'the report states the count the condition measured');
  t.end();
});
