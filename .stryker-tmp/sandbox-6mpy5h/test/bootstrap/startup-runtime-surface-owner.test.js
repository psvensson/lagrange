// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  StartupRuntimeSurfaceOwner,
} from '../../src/bootstrap/shared/startup-runtime-surface-owner.js';

test('StartupRuntimeSurfaceOwner binds control-plane services across ' +
  'message-group and partition replicas', (t) => {
  const calls = [];
  const tablePolicyService = {id: 'policy'};
  const rebalanceCoordinator = {id: 'rebalancer'};
  const owner = new StartupRuntimeSurfaceOwner({
    delegates: {
      getTablePolicyService: () => tablePolicyService,
      getRebalanceCoordinator: () => rebalanceCoordinator,
      getMessageGroupServices: () => new Map([
        ['mg-1', {
          setTablePolicyService(value) {
            calls.push(['messageGroup', 'policy', value]);
          },
          setRebalanceCoordinator(value) {
            calls.push(['messageGroup', 'rebalancer', value]);
          },
        }],
      ]),
      getPartitionServices: () => new Map([
        ['p-1', {
          setTablePolicyService(value) {
            calls.push(['partition', 'policy', value]);
          },
          setRebalanceCoordinator(value) {
            calls.push(['partition', 'rebalancer', value]);
          },
        }],
      ]),
    },
  });

  owner.bindControlPlaneServices();

  t.same(
    calls,
    [
      ['messageGroup', 'policy', tablePolicyService],
      ['messageGroup', 'rebalancer', rebalanceCoordinator],
      ['partition', 'policy', tablePolicyService],
      ['partition', 'rebalancer', rebalanceCoordinator],
    ],
    'runtime surface owner must disseminate shared control-plane owners through one path',
  );
  t.end();
});

test('StartupRuntimeSurfaceOwner notifies local admin readiness at most once',
  async (t) => {
    const calls = [];
    let notified = false;
    const owner = new StartupRuntimeSurfaceOwner({
      delegates: {
        getLocalAdminRuntimeReadyNotified: () => notified,
        setLocalAdminRuntimeReadyNotified: (value) => {
          notified = value;
        },
        getOnLocalAdminRuntimeReady: () => async (payload) => {
          calls.push(payload);
        },
        getNodeId: () => 'node-a',
        getOwner: () => ({id: 'join-owner'}),
        getSystemTableCache: () => ({id: 'cache'}),
        getCacheMutationTarget: () => ({id: 'cache'}),
        getMessageRouter: () => ({id: 'router'}),
        getPartitionServices: () => new Map(),
      },
    });

    await owner.notifyLocalAdminRuntimeReady();
    await owner.notifyLocalAdminRuntimeReady();

    t.equal(calls.length, 1, 'local admin callback must only be fired once');
    t.equal(calls[0].nodeId, 'node-a');
  });
