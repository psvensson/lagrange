import {test} from '../../src/test-helpers/tap.js';
import {STATE} from '../../src/constants/index.js';
import * as adminOwner from '../../scripts/examples/admin-ws-client.js';
import {observeAdminOwner} from '../helpers/admin-owner-observation.js';

const NO_FAILURE = Symbol('no fixture failure');

async function createProbeFixture(t, {
  primary = NO_FAILURE, adminCleanup = NO_FAILURE, clusterCleanup = NO_FAILURE,
}) {
  const calls = {queries: 0, adminCloses: 0, clusterStops: 0};
  class Client {
    async query() {
      calls.queries += 1;
      if (primary !== NO_FAILURE) throw primary;
      return {results: []};
    }
    async close() {
      calls.adminCloses += 1;
      if (adminCleanup !== NO_FAILURE) throw adminCleanup;
    }
  }
  const probe = await t.mockImport('../../examples/service-data-affinity/run-formation-probe.js', {
    '../../scripts/examples/admin-ws-client.js': {...adminOwner, AdminWsClient: Client},
    '../../examples/service-data-affinity/cluster-harness.js': {
      startCluster: async () => ({
        mode: 'owned-fixture', target: 'ws://owned-fixture',
        getNodeLogs: async () => [],
        stop: async () => {
          calls.clusterStops += 1;
          if (clusterCleanup !== NO_FAILURE) throw clusterCleanup;
        },
      }),
      queryRows: async () => [{
        partition_id: 'tbl-ratings', leader_node_id: 'owner', state: STATE.NORMAL,
      }],
    },
  });
  return {probe, calls};
}

test('formation probe preserves admin primary and both independent cleanup owners', async (t) => {
  const primary = Object.freeze(new Error('participant query failed'));
  const adminCleanup = Object.assign(new Error('admin close failed'), {code: 'ADMIN_CLOSE_TIMEOUT'});
  const clusterCleanup = new Error('cluster stop failed');
  const {probe, calls} = await createProbeFixture(t, {primary, adminCleanup, clusterCleanup});
  const result = await observeAdminOwner(
    probe.runFormationProbe({local: true}).catch((error) => error), 'probe primary and cleanup');
  t.equal(result, primary, 'cluster teardown cannot replace the frozen admin primary');
  t.equal(adminOwner.getAdminCleanupFailure(result), adminCleanup);
  t.equal(probe.getFormationProbeCleanupFailure?.(result), clusterCleanup,
    'scenario owner retains cluster cleanup without labelling it admin cleanup');
  t.same(calls, {queries: 1, adminCloses: 1, clusterStops: 1});
});

test('formation probe successful body cannot hide failed cluster stop', async (t) => {
  const clusterCleanup = new Error('cluster stop failed');
  const {probe, calls} = await createProbeFixture(t, {clusterCleanup});
  const result = await observeAdminOwner(
    probe.runFormationProbe({local: true}).catch((error) => error), 'probe cleanup rejection');
  t.equal(result, clusterCleanup);
  t.equal(adminOwner.getAdminCleanupFailure(result), null,
    'cluster teardown is not owned by the admin socket helper');
  t.same(calls, {queries: 1, adminCloses: 1, clusterStops: 1});
});

test('formation probe cannot interpret a falsy cleanup rejection as success', async (t) => {
  const {probe, calls} = await createProbeFixture(t, {clusterCleanup: false});
  const result = await observeAdminOwner(
    probe.runFormationProbe({local: true}).catch((error) => error), 'falsy probe cleanup');
  t.ok(result instanceof Error);
  t.equal(result.cause, false);
  t.equal(calls.clusterStops, 1);
});
