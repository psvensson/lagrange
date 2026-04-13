/**
 * Runtime CDC wiring tests.
 *
 * Requirements: 7.2, 7.3
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';

test('CDCIntegrationService - runtime event handler is instantiated on initialize',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'runtime-cdc-node',
    });

    service.initialize();

    t.ok(service.cdcEventHandler, 'should instantiate cdcEventHandler');
    t.equal(
      typeof service.cdcEventHandler.handleNodeStateCDC,
      'function',
      'handler should expose handleNodeStateCDC',
    );
    t.equal(
      typeof service.cdcEventHandler.handleEpochChangeCDC,
      'function',
      'handler should expose handleEpochChangeCDC',
    );
  });

test('CDCIntegrationService - handleNodeStateCDC delegates to runtime handler path',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'runtime-cdc-node',
    });
    service.initialize();

    let callCount = 0;
    const delegatedResult = {processed: true, delegated: true};
    service.cdcEventHandler = {
      handleNodeStateCDC: (cdcEvent) => {
        callCount++;
        return {
          ...delegatedResult,
          nodeId: cdcEvent.data.node_id,
        };
      },
      handleEpochChangeCDC: () => ({applied: false}),
    };

    const result = service.handleNodeStateCDC({
      tableName: SYSTEM_TABLE_NAME.NODES,
      data: {
        node_id: 'other-node',
        status: 'ready',
      },
    });

    t.equal(callCount, 1, 'should invoke cdcEventHandler.handleNodeStateCDC exactly once');
    t.equal(result.delegated, true, 'should return delegated result');
    t.equal(result.nodeId, 'other-node', 'should preserve delegated payload');
  });

test('CDCIntegrationService - handleEpochChangeCDC delegates to runtime handler path',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'runtime-cdc-node',
    });
    service.initialize();

    let callCount = 0;
    const delegatedResult = {applied: true, epoch: 9, delegated: true};
    service.cdcEventHandler = {
      handleNodeStateCDC: () => ({processed: false}),
      handleEpochChangeCDC: () => {
        callCount++;
        return delegatedResult;
      },
    };

    const result = service.handleEpochChangeCDC({
      tableName: 'config',
      data: {
        config_key: 'config.current_epoch',
        config_value: '{}',
      },
    });

    t.equal(callCount, 1, 'should invoke cdcEventHandler.handleEpochChangeCDC exactly once');
    t.equal(result.delegated, true, 'should return delegated result');
    t.equal(result.epoch, 9, 'should preserve delegated epoch');
  });
