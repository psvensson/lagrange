import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ReplicaStateMachine,
  ReplicaState,
} from '../../src/node/replica-state-machine.js';
import {REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE} from
  '../../src/node/replica-state-machine-constants.js';

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
    t.equal(stateMachine.getState('svc-pending')?.state, ReplicaState.PENDING,
      'replica should remain pending while persistence is blocked');

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
    t.equal(stateMachine.getState('svc-pending')?.state, ReplicaState.FAILED,
      'replica should eventually transition to failed');

    stateMachine.clear();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
