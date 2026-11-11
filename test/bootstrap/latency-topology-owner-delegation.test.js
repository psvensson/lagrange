import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {TABLES} from '../../src/constants/index.js';
import {propagatePartitionCdcVector} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {JOINING_ERROR_MSG} from '../../src/bootstrap/node-joining-constants.js';

// The joiner's propagation call, as its registration composes it.
const joinerPropagation = (service) => (messageGroupService, events, deliveryContext) =>
  propagatePartitionCdcVector(service.latencyTopology, JOINING_ERROR_MSG.LATENCY_TOPOLOGY_MISSING,
    messageGroupService, events, deliveryContext);

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
      service.seedCacheHydrationPhase.delegates
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
    const cdcEvent = {
      tableName: TABLES.NODES,
      operation: 'UPDATE',
      data: {node_id: 'node-z'},
    };

    const result = await service.seedCacheHydrationPhase.delegates
      .propagatePartitionCDCEvent(
        messageGroupService,
        [cdcEvent],
      );

    assert.equal(result.success, true);
    assert.equal(result.delegated, true);
    // The topology owner is handed the vector: its events, in order.
    assert.equal(calls.length, 1);
    assert.equal(calls[0].events.length, 1);
    assert.equal(calls[0].events[0].tableName, cdcEvent.tableName);
    assert.equal(calls[0].events[0].operation, cdcEvent.operation);
    assert.deepEqual(calls[0].events[0].data, cdcEvent.data);
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
      joinerPropagation(service)(
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
    const cdcEvent = {
      tableName: TABLES.NODES,
      operation: 'DELETE',
      data: {node_id: 'node-z'},
    };

    const result = await joinerPropagation(service)(
      messageGroupService,
      [cdcEvent],
    );

    assert.equal(result.success, true);
    assert.equal(result.delegated, true);
    // The topology owner is handed the vector: its events, in order.
    assert.equal(calls.length, 1);
    assert.equal(calls[0].events.length, 1);
    assert.equal(calls[0].events[0].tableName, cdcEvent.tableName);
    assert.equal(calls[0].events[0].operation, cdcEvent.operation);
    assert.deepEqual(calls[0].events[0].data, cdcEvent.data);
    assert.equal(calls[0].sourceMessageGroupService, messageGroupService);

    teardownEnvironment();
    t.end();
  });
