/**
 * Tests that the initial CDC subscription path in BootstrapService
 * propagates CDC events even when the local message group replica
 * is not the leader.
 *
 * Bug: subscribeToCDC() uses a hard isLeaderReplica() gate that
 * silently drops CDC events when the message group leader moves
 * to another node after bootstrap. The dynamic partition path
 * already uses resolveCdcPropagationMessageGroup() which falls
 * back correctly.
 */

import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';

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

test(
  'subscribeToCDC propagates events when local MG is not leader',
  async (t) => {
    setupEnvironment();

    const service = new BootstrapService({nodeId: 'node-a'});

    // Track propagated events
    const propagatedEvents = [];

    // Mock propagatePartitionCDCEvent to capture calls
    service.propagatePartitionCDCEvent =
      async (_messageGroup, cdcEvent) => {
        propagatedEvents.push(cdcEvent);
      };

    // Mock latencyTopology so propagatePartitionCDCEvent can resolve
    service.latencyTopology = {
      cdcGroupPropagationService: {
        propagateCDCEvent: async () => {},
      },
    };

    // Capture the CDC subscriber callback registered on the partition
    let capturedCdcSubscriber = null;

    const mockPartition = {
      subscribeToCDC: (subscriber) => {
        capturedCdcSubscriber = subscriber;
      },
      isLeader: false,
    };

    // Message group that is NOT the leader
    const mockMessageGroup = {
      subscribeToCDC: async () => {},
      isLeaderReplica: () => false,
    };

    // A fallback message group that IS the leader (on another node
    // conceptually, but available locally for propagation)
    const fallbackLeaderMg = {
      subscribeToCDC: async () => {},
      isLeaderReplica: () => true,
    };

    service.partitionServices = new Map([
      ['partitions-p1-r1', mockPartition],
    ]);
    service.messageGroupServices = new Map([
      ['mg-1-r1', mockMessageGroup],
    ]);

    // resolveCdcPropagationMessageGroup should find the fallback
    service.getLeaderMessageGroupService = () => fallbackLeaderMg;

    await service.subscribeToCDC(
      'partitions',
      'partitions-p1',
      ['partitions-p1-r1'],
    );

    assert.ok(
      capturedCdcSubscriber,
      'CDC subscriber should be registered on partition',
    );

    // Simulate a CDC event (e.g., new partition row inserted)
    const cdcEvent = {
      tableName: 'partitions',
      operation: 'INSERT',
      data: {partition_id: 'tbl-abc-p1', table_name: 'benchmark'},
      timestamp: '2026-01-01T00:00:00.000Z',
      sourcePartition: 'partitions-p1',
      sourceReplica: 'partitions-p1-r1',
    };

    await capturedCdcSubscriber(cdcEvent);

    // The event SHOULD be propagated even though the local MG
    // is not the leader. Currently it is silently dropped.
    assert.equal(
      propagatedEvents.length,
      1,
      'CDC event should be propagated via fallback message group ' +
      'when local MG is not leader',
    );

    teardownEnvironment();
    t.end();
  },
);
