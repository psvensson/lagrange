import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {TABLES} from '../../src/constants/index.js';

function setupEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'node-a'},
    logging: {level: 'error'},
  });
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function teardownEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

test('BootstrapService partition CDC propagation requires topology owner',
  async (t) => {
    setupEnvironment();
    const service = new BootstrapService({nodeId: 'node-a'});

    await assert.rejects(
      service.seedCacheHydrationPhase
        .propagatePartitionCDCEvent(
          {},
          {
            tableName: TABLES.NODES,
            operation: 'INSERT',
            data: {node_id: 'node-z'},
          },
        ),
      /Latency topology services are not initialized/,
    );

    teardownEnvironment();
    t.end();
  });

test('BootstrapService delegates partition CDC propagation to topology owner',
  async (t) => {
    setupEnvironment();
    const calls = [];
    const service = new BootstrapService({nodeId: 'node-a'});
    service.latencyTopology = {
      cdcGroupPropagationService: {
        async propagateCDCEvent(payload) {
          calls.push(payload);
          return {success: true, delegated: true};
        },
      },
    };

    const messageGroupService = {id: 'mg-1'};
    const cdcEvent = {
      tableName: TABLES.NODES,
      operation: 'UPDATE',
      data: {node_id: 'node-z'},
    };

    const result = await service.seedCacheHydrationPhase
      .propagatePartitionCDCEvent(
        messageGroupService,
        cdcEvent,
      );

    assert.equal(result.success, true);
    assert.equal(result.delegated, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tableName, cdcEvent.tableName);
    assert.equal(calls[0].operation, cdcEvent.operation);
    assert.deepEqual(calls[0].data, cdcEvent.data);
    assert.equal(calls[0].sourceMessageGroupService, messageGroupService);

    teardownEnvironment();
    t.end();
  });

test('NodeJoiningService partition CDC propagation requires topology owner',
  async (t) => {
    setupEnvironment();
    const service = new NodeJoiningService({
      nodeId: 'node-a',
      seedNodeAddress: 'http://seed-node:8080',
    });

    await assert.rejects(
      service.propagatePartitionCDCEvent(
        {},
        {
          tableName: TABLES.NODES,
          operation: 'INSERT',
          data: {node_id: 'node-z'},
        },
      ),
      /Latency topology services are not initialized/,
    );

    teardownEnvironment();
    t.end();
  });

test('NodeJoiningService delegates partition CDC propagation to topology owner',
  async (t) => {
    setupEnvironment();
    const calls = [];
    const service = new NodeJoiningService({
      nodeId: 'node-a',
      seedNodeAddress: 'http://seed-node:8080',
    });
    service.latencyTopology = {
      cdcGroupPropagationService: {
        async propagateCDCEvent(payload) {
          calls.push(payload);
          return {success: true, delegated: true};
        },
      },
    };

    const messageGroupService = {id: 'mg-1'};
    const cdcEvent = {
      tableName: TABLES.NODES,
      operation: 'DELETE',
      data: {node_id: 'node-z'},
    };

    const result = await service.propagatePartitionCDCEvent(
      messageGroupService,
      cdcEvent,
    );

    assert.equal(result.success, true);
    assert.equal(result.delegated, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tableName, cdcEvent.tableName);
    assert.equal(calls[0].operation, cdcEvent.operation);
    assert.deepEqual(calls[0].data, cdcEvent.data);
    assert.equal(calls[0].sourceMessageGroupService, messageGroupService);

    teardownEnvironment();
    t.end();
  });
