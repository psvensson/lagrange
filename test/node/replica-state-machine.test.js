import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ReplicaStateMachine,
  ReplicaState,
} from '../../src/node/replica-state-machine.js';

test('ReplicaStateMachine falls back to update when initial services insert is duplicated',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    let insertCalls = 0;
    let updateCalls = 0;
    const cdcIntegrationService = {
      async insertSystemTableRow() {
        insertCalls++;
        const error = new Error('UNIQUE constraint failed: services.service_id');
        error.code = 'SQLITE_CONSTRAINT_PRIMARYKEY';
        throw error;
      },
      async updateSystemTableRow(tableName, whereClause, data) {
        updateCalls++;
        t.equal(tableName, 'services', 'fallback update should target services');
        t.same(whereClause, {service_id: 'svc-1'},
          'fallback update should target the duplicated service row');
        t.equal(data.status, ReplicaState.PENDING,
          'fallback update should preserve the pending state');
        return {success: true, partitionResult: {affectedRows: 1}};
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

    t.equal(result, true, 'transition should succeed after duplicate fallback');
    t.equal(insertCalls, 1, 'initial insert should be attempted once');
    t.equal(updateCalls, 1, 'duplicate insert should fall back to one update');

    stateMachine.clear();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

test('ReplicaStateMachine uses upsert for initial services persistence when available',
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
        t.equal(data.service_id, 'svc-2', 'upsert should target the service row');
        t.equal(data.status, ReplicaState.PENDING,
          'upsert should preserve the initial pending state');
        return {success: true};
      },
      async insertSystemTableRow() {
        t.fail('insert fallback should not be used when upsert is available');
      },
      async updateSystemTableRow() {
        t.fail('update fallback should not be used when upsert is available');
      },
    };

    const stateMachine = new ReplicaStateMachine({
      nodeId: 'node-1',
      cdcIntegrationService,
    });

    const result = await stateMachine.transition('svc-2', ReplicaState.PENDING, {
      partitionId: 'partition-2',
      nodeId: 'node-1',
      reason: 'test',
      serviceId: 'svc-2',
      serviceAddress: 'node-1/partition/svc-2',
    });

    t.equal(result, true, 'transition should succeed through the upsert path');
    t.equal(upsertCalls, 1, 'initial persistence should issue exactly one upsert');

    stateMachine.clear();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
