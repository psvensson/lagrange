import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ReplicaStateMachine,
  ReplicaState,
} from '../../src/node/replica-state-machine.js';
import {REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE} from
  '../../src/node/replica-state-machine-constants.js';

const TEST_RETRY_SERVICE_ID = 'svc-retry-1';
const TEST_RETRY_PARTITION_ID = 'partition-retry-1';
const TEST_RETRY_NODE_ID = 'node-retry-1';
const TEST_RETRY_SERVICE_ADDRESS = 'node-retry-1/partition/svc-retry-1';
const TEST_RETRY_PENDING_REASON = 'pending';
const TEST_RETRY_CREATING_REASON = 'creating';
const TEST_RETRY_SYNCING_REASON = 'syncing';
const TEST_RETRY_ACTIVE_REASON = 'active';
const TEST_RETRY_PRESSURE_ERROR =
  'Distributed operation failed due to participant failures';

test('ReplicaStateMachine uses upsert for initial services persistence',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    let upsertCalls = 0;
    const cdcIntegrationService = {
      async upsertSystemTableRow(tableName, data) {
        upsertCalls++;
        t.equal(tableName, 'services', 'initial persistence should upsert services');
        t.equal(data.service_id, 'svc-1', 'upsert should target the service row');
        t.equal(data.status, ReplicaState.PENDING,
          'upsert should preserve the pending state');
        return {success: true};
      },
    };

    const stateMachine = new ReplicaStateMachine({
      nodeId: 'node-1',
      cdcIntegrationService,
    });

    const result = await stateMachine.transition('svc-1', ReplicaState.PENDING, {
      partitionId: 'partition-1',
      nodeId: 'node-1',
      reason: 'test',
      serviceId: 'svc-1',
      serviceAddress: 'node-1/partition/svc-1',
    });

    t.equal(result, true, 'transition should succeed through the upsert path');
    t.equal(upsertCalls, 1, 'initial upsert should be attempted once');

    stateMachine.clear();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

test('ReplicaStateMachine demotes transitional persistence and skips cache waits',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    const calls = [];
    const cdcIntegrationService = {
      async upsertSystemTableRow(tableName, data, options) {
        calls.push({type: 'upsert', tableName, data, options});
        return {success: true};
      },
      async updateSystemTableRow(tableName, whereClause, data, options) {
        calls.push({type: 'update', tableName, whereClause, data, options});
        return {success: true};
      },
    };

    const stateMachine = new ReplicaStateMachine({
      nodeId: 'node-1',
      cdcIntegrationService,
    });

    await stateMachine.transition('svc-3', ReplicaState.PENDING, {
      partitionId: 'partition-3',
      nodeId: 'node-1',
      reason: 'pending',
      serviceId: 'svc-3',
      serviceAddress: 'node-1/partition/svc-3',
    });
    await stateMachine.transition('svc-3', ReplicaState.CREATING, {
      partitionId: 'partition-3',
      nodeId: 'node-1',
      reason: 'creating',
      serviceId: 'svc-3',
    });

    t.equal(calls.length, 2, 'should persist both transitions');
    for (const call of calls) {
      t.equal(call.options.skipCacheWait, true,
        'replica-state persistence should not wait on cache propagation');
      t.equal(call.options.deliveryPriority, 'background',
        'transitional replica-state writes should use background delivery');
      t.equal(call.options.workClass, 'background',
        'transitional replica-state writes should use background work class');
      t.equal(call.options.coalescingKey, 'replica-state:svc-3',
        'transitional writes should share one canonical coalescing key');
    }

    stateMachine.clear();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

test('ReplicaStateMachine keeps stable-state persistence on the critical lane',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    const calls = [];
    const cdcIntegrationService = {
      async upsertSystemTableRow(tableName, data, options) {
        calls.push({type: 'upsert', tableName, data, options});
        return {success: true};
      },
      async updateSystemTableRow(tableName, whereClause, data, options) {
        calls.push({type: 'update', tableName, whereClause, data, options});
        return {success: true};
      },
    };

    const stateMachine = new ReplicaStateMachine({
      nodeId: 'node-1',
      cdcIntegrationService,
    });

    await stateMachine.transition('svc-4', ReplicaState.PENDING, {
      partitionId: 'partition-4',
      nodeId: 'node-1',
      reason: 'pending',
      serviceId: 'svc-4',
      serviceAddress: 'node-1/partition/svc-4',
    });
    await stateMachine.transition('svc-4', ReplicaState.FAILED, {
      partitionId: 'partition-4',
      nodeId: 'node-1',
      reason: 'failed',
      serviceId: 'svc-4',
      errorMessage: 'boom',
    });

    t.equal(calls.length, 3, 'should persist both service transitions plus canonical leader clear');
    const failedUpdate = calls[1];
    t.equal(failedUpdate.type, 'update', 'stable follow-up transition should use update');
    t.equal(failedUpdate.options.skipCacheWait, true,
      'stable state writes should also avoid cache-retention waits');
    t.equal(failedUpdate.options.deliveryPriority, 'critical',
      'stable state writes should remain critical');
    t.equal(failedUpdate.options.workClass, 'critical',
      'stable state writes should remain critical work');
    t.equal(failedUpdate.options.coalescingKey, 'replica-state:svc-4',
      'stable writes should use the canonical coalescing key');
    t.equal(calls[2].tableName, 'partitions',
      'stable leader loss should also clear canonical partition leader');

    stateMachine.clear();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('ReplicaStateMachine does not commit runtime state when persistence fails and allows the same transition to retry',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    let activeFailureCount = 0;
    const mutations = [];
    const stateMachine = new ReplicaStateMachine({
      nodeId: TEST_RETRY_NODE_ID,
      controlPlaneSystemTableGateway: {
        async submitMutation(mutation) {
          mutations.push(mutation);
          if (mutation.tableName === 'services' &&
              mutation.operation === 'update' &&
              mutation.data?.status === ReplicaState.ACTIVE &&
              activeFailureCount === 0) {
            activeFailureCount += 1;
            throw new Error(TEST_RETRY_PRESSURE_ERROR);
          }
          return {success: true};
        },
      },
    });

    await stateMachine.transition(TEST_RETRY_SERVICE_ID, ReplicaState.PENDING, {
      partitionId: TEST_RETRY_PARTITION_ID,
      nodeId: TEST_RETRY_NODE_ID,
      reason: TEST_RETRY_PENDING_REASON,
      serviceId: TEST_RETRY_SERVICE_ID,
      serviceAddress: TEST_RETRY_SERVICE_ADDRESS,
    });
    await stateMachine.transition(TEST_RETRY_SERVICE_ID, ReplicaState.CREATING, {
      partitionId: TEST_RETRY_PARTITION_ID,
      nodeId: TEST_RETRY_NODE_ID,
      reason: TEST_RETRY_CREATING_REASON,
      serviceId: TEST_RETRY_SERVICE_ID,
    });
    await stateMachine.transition(TEST_RETRY_SERVICE_ID, ReplicaState.SYNCING, {
      partitionId: TEST_RETRY_PARTITION_ID,
      nodeId: TEST_RETRY_NODE_ID,
      reason: TEST_RETRY_SYNCING_REASON,
      serviceId: TEST_RETRY_SERVICE_ID,
    });

    await t.rejects(
      stateMachine.transition(TEST_RETRY_SERVICE_ID, ReplicaState.ACTIVE, {
        partitionId: TEST_RETRY_PARTITION_ID,
        nodeId: TEST_RETRY_NODE_ID,
        reason: TEST_RETRY_ACTIVE_REASON,
        serviceId: TEST_RETRY_SERVICE_ID,
      }),
      new Error(TEST_RETRY_PRESSURE_ERROR),
      'retryable persistence failure should surface without committing runtime state',
    );

    t.equal(
      stateMachine.getState(TEST_RETRY_SERVICE_ID)?.state,
      ReplicaState.SYNCING,
      'failed persistence should keep the prior tracked state authoritative',
    );
    t.equal(
      stateMachine.getStateCounts()[ReplicaState.SYNCING],
      1,
      'failed persistence should keep the prior state count',
    );
    t.equal(
      stateMachine.getStateCounts()[ReplicaState.ACTIVE],
      0,
      'failed persistence should not increment the target state count',
    );

    const retryResult =
      await stateMachine.transition(TEST_RETRY_SERVICE_ID, ReplicaState.ACTIVE, {
        partitionId: TEST_RETRY_PARTITION_ID,
        nodeId: TEST_RETRY_NODE_ID,
        reason: TEST_RETRY_ACTIVE_REASON,
        serviceId: TEST_RETRY_SERVICE_ID,
      });

    t.equal(retryResult, true, 'the same transition should succeed on retry');
    t.equal(
      stateMachine.getState(TEST_RETRY_SERVICE_ID)?.state,
      ReplicaState.ACTIVE,
      'successful retry should commit the target state',
    );
    t.equal(
      mutations.filter((mutation) =>
        mutation.tableName === 'services' &&
        mutation.operation === 'update' &&
        mutation.data?.status === ReplicaState.ACTIVE,
      ).length,
      2,
      'ACTIVE persistence should be attempted twice across the failed write and retry',
    );

    stateMachine.clear();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

test('ReplicaStateMachine clears canonical partition leader when a partition replica becomes non-routable',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    const mutations = [];
    const stateMachine = new ReplicaStateMachine({
      nodeId: 'node-1',
      controlPlaneSystemTableGateway: {
        async submitMutation(mutation, options) {
          mutations.push({mutation, options});
          return {success: true};
        },
      },
    });

    await stateMachine.transition('svc-leader', ReplicaState.PENDING, {
      partitionId: 'partition-9',
      nodeId: 'node-1',
      reason: 'pending',
      serviceId: 'svc-leader',
      serviceType: 'partition',
      serviceAddress: 'node-1/partition/svc-leader',
    });
    await stateMachine.transition('svc-leader', ReplicaState.FAILED, {
      partitionId: 'partition-9',
      nodeId: 'node-1',
      reason: 'failed',
      serviceId: 'svc-leader',
      serviceType: 'partition',
      errorMessage: 'boom',
    });

    t.equal(mutations.length, 3, 'should persist service create, service failure, and leader clear');
    t.equal(mutations[0].mutation.tableName, 'services');
    t.equal(mutations[1].mutation.tableName, 'services');
    t.equal(mutations[2].mutation.tableName, 'partitions');
    t.same(mutations[2].mutation.whereClause, {
      partition_id: 'partition-9',
      leader_node_id: 'node-1',
    });
    t.same(mutations[2].mutation.data, {
      leader_node_id: null,
      updated_at: mutations[1].mutation.data.updated_at,
    });
    t.equal(
      mutations[2].options.coalescingKey,
      'partitions:leader:partition-9',
      'leader clear should coalesce by partition',
    );
    t.equal(
      mutations[2].options.deliveryPriority,
      'critical',
      'leader clear should stay on the critical lane',
    );

    stateMachine.clear();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

test('ReplicaStateMachine keeps canonical partition leader when another ' +
  'active partition replica remains on the same node',
async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({});

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});

  const mutations = [];
  const stateMachine = new ReplicaStateMachine({
    nodeId: 'node-1',
    systemTableCache: {
      filter(tableName, predicate) {
        if (tableName !== 'services') {
          return [];
        }
        return [{
          service_id: 'svc-sibling',
          replica_id: 'svc-sibling',
          service_type: 'partition',
          partition_id: 'partition-9',
          node_id: 'node-1',
          status: ReplicaState.ACTIVE,
        }].filter(predicate);
      },
    },
    controlPlaneSystemTableGateway: {
      async submitMutation(mutation, options) {
        mutations.push({mutation, options});
        return {success: true};
      },
    },
  });

  await stateMachine.transition('svc-leader', ReplicaState.PENDING, {
    partitionId: 'partition-9',
    nodeId: 'node-1',
    reason: 'pending',
    serviceId: 'svc-leader',
    serviceType: 'partition',
    serviceAddress: 'node-1/partition/svc-leader',
  });
  await stateMachine.transition('svc-leader', ReplicaState.FAILED, {
    partitionId: 'partition-9',
    nodeId: 'node-1',
    reason: 'failed',
    serviceId: 'svc-leader',
    serviceType: 'partition',
    errorMessage: 'boom',
  });

  t.equal(
    mutations.length,
    2,
    'leader clear should be suppressed when another active same-node replica still serves the partition',
  );
  t.equal(
    mutations.every(({mutation}) => mutation.tableName === 'services'),
    true,
    'only services-row mutations should be emitted in the sibling-active case',
  );

  stateMachine.clear();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('ReplicaStateMachine uses injected clock for create and update persistence',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    const persisted = [];
    const nowValues = [1234, 1234, 2345, 2345];
    const cdcIntegrationService = {
      async upsertSystemTableRow(tableName, data) {
        persisted.push({type: 'upsert', tableName, data});
        return {success: true};
      },
      async updateSystemTableRow(tableName, whereClause, data) {
        persisted.push({type: 'update', tableName, whereClause, data});
        return {success: true};
      },
    };

    const stateMachine = new ReplicaStateMachine({
      nodeId: 'node-1',
      cdcIntegrationService,
      now: () => nowValues.shift(),
    });

    const createResult = await stateMachine.transition(
      'svc-2',
      ReplicaState.PENDING,
      {
        partitionId: 'partition-2',
        nodeId: 'node-1',
        reason: 'create',
        serviceId: 'svc-2',
        serviceAddress: 'node-1/partition/svc-2',
      },
    );
    const updateResult = await stateMachine.transition(
      'svc-2',
      ReplicaState.CREATING,
      {
        partitionId: 'partition-2',
        nodeId: 'node-1',
        reason: 'update',
        serviceId: 'svc-2',
      },
    );

    t.equal(createResult, true, 'initial transition should succeed');
    t.equal(updateResult, true, 'follow-up transition should succeed');
    t.equal(persisted.length, 2, 'should persist one create and one update');
    t.equal(persisted[0].type, 'upsert', 'initial persistence should use upsert');
    t.equal(persisted[0].tableName, 'services', 'create should target services');
    t.equal(persisted[0].data.created_at, 1234,
      'create should use injected time for created_at');
    t.equal(persisted[0].data.state_entered_at, 1234,
      'create should use injected time for state_entered_at');
    t.equal(persisted[1].type, 'update', 'follow-up persistence should use update');
    t.equal(persisted[1].tableName, 'services', 'update should target services');
    t.same(persisted[1].whereClause, {service_id: 'svc-2'},
      'update should target the existing service row');
    t.equal(persisted[1].data.state_entered_at, 2345,
      'update should use injected time for state_entered_at');
    t.equal(persisted[1].data.updated_at, 2345,
      'update should use injected time for updated_at');
    t.equal(persisted[1].data.previous_state, ReplicaState.PENDING,
      'update should persist the previous state');

    stateMachine.clear();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

test('ReplicaStateMachine requires upsertSystemTableRow for initial persistence',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    const stateMachine = new ReplicaStateMachine({
      nodeId: 'node-1',
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
      },
    });

    await t.rejects(
      stateMachine.transition('svc-2', ReplicaState.PENDING, {
      partitionId: 'partition-2',
      nodeId: 'node-1',
      reason: 'test',
      serviceId: 'svc-2',
      serviceAddress: 'node-1/partition/svc-2',
      }),
      /upsertSystemTableRow/,
      'initial persistence should fail loudly without canonical upsert support',
    );

    stateMachine.clear();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

test('ReplicaStateMachine emits transitionError with stable code on invalid transition',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    const stateMachine = new ReplicaStateMachine({
      nodeId: 'node-1',
      cdcIntegrationService: {
        async upsertSystemTableRow() {
          return {success: true};
        },
      },
    });
    const errors = [];
    stateMachine.on('transitionError', (event) => {
      errors.push(event);
    });

    const result = stateMachine.transition('svc-invalid', ReplicaState.ACTIVE, {
      partitionId: 'partition-1',
      reason: 'test invalid transition',
    });

    t.equal(result, false, 'invalid transition should fail');
    t.equal(errors.length, 1, 'should emit one transitionError event');
    t.equal(
      errors[0].code,
      REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE.INVALID_TRANSITION,
      'transitionError should include stable diagnostic code',
    );
    t.equal(errors[0].currentState, null,
      'transitionError should include current state');
    t.equal(errors[0].attemptedState, ReplicaState.ACTIVE,
      'transitionError should include attempted state');

    stateMachine.clear();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

test('ReplicaStateMachine does not consume timeout budget while persistence is in flight',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    let nowValue = 1000;
    let releasePersistence = null;
    const cdcIntegrationService = {
      async upsertSystemTableRow() {
        await new Promise((resolve) => {
          releasePersistence = resolve;
        });
        return {success: true};
      },
      async updateSystemTableRow() {
        return {success: true};
      },
    };

    const stateMachine = new ReplicaStateMachine({
      nodeId: 'node-1',
      cdcIntegrationService,
      pendingTimeoutMs: 100,
      now: () => nowValue,
    });

    const transitionPromise = stateMachine.transition('svc-pending', ReplicaState.PENDING, {
      partitionId: 'partition-1',
      nodeId: 'node-1',
      reason: 'test',
      serviceId: 'svc-pending',
      serviceAddress: 'node-1/partition/svc-pending',
    });

    await Promise.resolve();

    nowValue = 1250;
    t.equal(stateMachine.checkTimeoutsNow(), 0,
      'timeout checker should ignore an unpersisted pending transition');
    t.equal(stateMachine.getState('svc-pending'), null,
      'replica should stay untracked until pending persistence commits');

    releasePersistence();
    await transitionPromise;

    nowValue = 1350;
    t.equal(stateMachine.checkTimeoutsNow(), 0,
      'timeout budget should start after persistence completes');
    t.equal(stateMachine.getState('svc-pending')?.state, ReplicaState.PENDING,
      'replica should still be pending before the post-persistence deadline');

    nowValue = 1451;
    t.equal(stateMachine.checkTimeoutsNow(), 1,
      'replica should time out once the post-persistence budget is exhausted');
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(stateMachine.getState('svc-pending')?.state, ReplicaState.FAILED,
      'replica should eventually transition to failed');

    stateMachine.clear();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
