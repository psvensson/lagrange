import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from '../../src/control-plane/control-plane-readiness-constants.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {createMockCache, createMockCoordinator, createMockControlPlaneReadinessService, createTestRebalancer} from './test-helpers.js';

const PARTITION = 'policy-retry-user-p1';
const TABLE = 'policy-retry-user';
const FAULT_HOLD_MS = 20_000;
const RECOVERY_BOUND_MS = 120_000;
const STEP_MS = 1000;

async function runFinitePolicyFault(disableRetryTrigger) {
  const clock = new VirtualTimeSource({startMs: Date.now()});
  const cache = createMockCache({
    partitions: [{partition_id: PARTITION, table_id: TABLE, replica_count: 3}],
    tables: [],
    nodes: [1, 2, 3].map((index) => ({node_id: `node-${index}`, status: 'active',
      connection_state: 'ready', ready_lease_expires_at: clock.now() + 1_000_000})),
    services: [{service_id: `${PARTITION}-r1`, replica_id: `${PARTITION}-r1`,
      partition_id: PARTITION, service_type: 'partition', node_id: 'node-1',
      status: 'active', raft_role: 'leader'}],
  });
  let policyReads = 0;
  const policyOwner = new TablePolicyService({systemTableCache: cache,
    now: () => clock.now(), controlPlaneSystemTableGateway: {
      executeRead: async ({readFromCache}) => {
        policyReads += 1;
        return {rows: readFromCache()};
      },
    }});
  const operations = [];
  const coordinator = createMockCoordinator();
  const createOperation = coordinator.createOperation;
  coordinator.createOperation = async (move) => {
    operations.push(move);
    return createOperation(move);
  };
  coordinator.storageAdmissionService = {
    checkAdd: async () => ({decision: 'allow'}),
    checkReplace: async () => ({decision: 'allow'}),
  };
  const readiness = createMockControlPlaneReadinessService({systemTableCache: cache,
    readinessByNodeId: Object.fromEntries([1, 2, 3].map((index) => [`node-${index}`, {
      nodeId: `node-${index}`, dimensions: Object.fromEntries(
        Object.values(CONTROL_PLANE_READINESS_DIMENSION).map((name) => [name, true])),
    }])),
  });
  readiness.projectNodeLiveness = () => ({readyNow: true});
  const rebalancer = createTestRebalancer({entityId: PARTITION, nodeId: 'node-1',
    systemTableCache: cache, tablePolicyService: policyOwner,
    rebalanceCoordinator: coordinator, controlPlaneReadinessService: readiness,
    nowFn: () => clock.now(),
    setTimeoutFn: clock.setTimeout.bind(clock), clearTimeoutFn: clock.clearTimeout.bind(clock)});
  rebalancer.initialize();
  // The external cluster-readiness boundary is ready throughout. Start-delay
  // and stabilization still use the real owners and the injected clock.
  rebalancer.clusterReadinessConfirmed = true;
  rebalancer.isLeader = true;
  clock.advance(120_000);
  if (disableRetryTrigger) rebalancer.scheduleNextCheck = () => {};
  const advance = async (durationMs) => {
    for (let elapsed = 0; elapsed < durationMs; elapsed += STEP_MS) {
      clock.advance(STEP_MS);
      await rebalancer.awaitCurrentWorkIdle();
    }
  };
  try {
    rebalancer.enqueueRebalanceCheck('initial-policy-observation');
    await rebalancer.awaitCurrentWorkIdle();
    await advance(FAULT_HOLD_MS);
    assert.ok(policyReads > 0, 'the real policy owner was reached during the fault');
    assert.deepEqual(operations, [], 'no operation while table policy is unavailable');
    const readsAtRecovery = policyReads;
    // Restore the external row without a CDC event, manual owner invocation or
    // admin poll. Only the retry scheduled by the failed pass can observe it.
    cache.upsert('tables', {table_id: TABLE, table_policies: '{}'});
    await advance(RECOVERY_BOUND_MS);
    return {operations, readsAtRecovery, finalReads: policyReads};
  } finally {
    rebalancer.shutdown();
    await rebalancer.awaitCurrentWorkIdle();
    policyOwner.shutdown();
    assert.equal(clock.pendingTimerCount(), 0, 'owner shutdown cancels bounded timers');
  }
}

test('actual planning queue/timer recovers from finite missing policy; suppressing its trigger prevents progress', async () => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({logging: {level: 'error'},
    rebalancer: {periodicCheckIntervalMs: 5000, periodicCheckJitterMs: 100}});
  LoggingService.getInstance().initialize({level: 'error'});
  try {
    const positive = await runFinitePolicyFault(false);
    assert.ok(positive.operations.length > 0, 'scheduled recovery reaches the actual operation request boundary');
    assert.ok(positive.finalReads > positive.readsAtRecovery);
    const negative = await runFinitePolicyFault(true);
    assert.deepEqual(negative.operations, []);
    assert.equal(negative.finalReads, negative.readsAtRecovery, 'no invented wake after the required trigger is disabled');
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
