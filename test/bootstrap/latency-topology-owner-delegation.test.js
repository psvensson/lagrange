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
    const service = new BootstrapService({bootIncarnation: 1, nodeId: 'node-a'});

    await assert.rejects(
      service.seedCacheHydrationPhase
        .propagatePartitionCDCEvent(
          {},
          [{
            tableName: TABLES.NODES,
            operation: 'INSERT',
            data: {node_id: 'node-z'},
          }],
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
    const service = new BootstrapService({bootIncarnation: 1, nodeId: 'node-a'});
    service.latencyTopology = {
      cdcGroupPropagationService: {
        async propagateCDCEvent(payload) {
          calls.push(payload);
          return {success: true, delegated: true};
        },
      },
    };

    const messageGroupService = {id: 'mg-1'};
    // The request carries the lane's vector as `events`, in order.
    const events = [
      {tableName: TABLES.NODES, operation: 'UPDATE', data: {node_id: 'node-z'}},
      {tableName: TABLES.NODES, operation: 'UPDATE', data: {node_id: 'node-y'}},
    ];

    const result = await service.seedCacheHydrationPhase
      .propagatePartitionCDCEvent(
        messageGroupService,
        events,
      );

    assert.equal(result.success, true);
    assert.equal(result.delegated, true);
    assert.equal(calls.length, 1, 'one request for the whole vector');
    assert.deepEqual(calls[0].events, events);
    assert.equal(Object.hasOwn(calls[0], 'tableName'), false,
      'the request carries no single-event payload beside its vector');
    assert.equal(calls[0].sourceMessageGroupService, messageGroupService);

    teardownEnvironment();
    t.end();
  });

test('NodeJoiningService partition CDC propagation requires topology owner',
  async (t) => {
    setupEnvironment();
    const service = new NodeJoiningService({
      bootIncarnation: 1,
      nodeId: 'node-a',
      seedNodeAddress: 'http://seed-node:8080',
    });

    await assert.rejects(
      service.propagatePartitionCDCEvent(
        {},
        [{
          tableName: TABLES.NODES,
          operation: 'INSERT',
          data: {node_id: 'node-z'},
        }],
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
      bootIncarnation: 1,
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
    const events = [
      {tableName: TABLES.NODES, operation: 'DELETE', data: {node_id: 'node-z'}},
      {tableName: TABLES.NODES, operation: 'INSERT', data: {node_id: 'node-y'}},
    ];

    const result = await service.propagatePartitionCDCEvent(
      messageGroupService,
      events,
    );

    assert.equal(result.success, true);
    assert.equal(result.delegated, true);
    assert.equal(calls.length, 1, 'one request for the whole vector');
    assert.deepEqual(calls[0].events, events);
    assert.equal(Object.hasOwn(calls[0], 'tableName'), false,
      'the request carries no single-event payload beside its vector');
    assert.equal(calls[0].sourceMessageGroupService, messageGroupService);

    teardownEnvironment();
    t.end();
  });
