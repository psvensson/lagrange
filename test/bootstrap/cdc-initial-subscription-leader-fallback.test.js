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
      subscribeToCDCWithHandshake: async (subscriber, options = {}) => {
        capturedCdcSubscriber = subscriber;
        return {
          subscriberId: options.subscriberId || null,
          subscriptionEpoch: 1,
          catchup: {
            mode: 'none',
            bufferedEventsReplayed: 0,
          },
        };
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

test(
  'subscribeToCDC subscribes each message group once per table',
  async (t) => {
    setupEnvironment();

    const service = new BootstrapService({nodeId: 'node-a'});

    let mgSubscribeCalls = 0;
    let partitionSubscriberRegistrations = 0;

    const makePartition = () => ({
      subscribeToCDCWithHandshake: async () => {
        partitionSubscriberRegistrations += 1;
        return {
          subscriberId: 'mock-subscriber',
          subscriptionEpoch: 1,
          catchup: {
            mode: 'none',
            bufferedEventsReplayed: 0,
          },
        };
      },
      isLeader: false,
    });

    const makeMessageGroup = () => ({
      subscribeToCDC: async () => {
        mgSubscribeCalls += 1;
      },
      isLeaderReplica: () => true,
    });

    service.partitionServices = new Map([
      ['tables-p1-r1', makePartition()],
      ['tables-p1-r2', makePartition()],
      ['tables-p1-r3', makePartition()],
    ]);
    service.messageGroupServices = new Map([
      ['mg-1-r1', makeMessageGroup()],
      ['mg-1-r2', makeMessageGroup()],
    ]);

    await service.subscribeToCDC('tables', 'tables-p1', [
      'tables-p1-r1',
      'tables-p1-r2',
      'tables-p1-r3',
    ]);

    assert.equal(
      mgSubscribeCalls,
      2,
      'should subscribe each message group once for the table',
    );
    assert.equal(
      partitionSubscriberRegistrations,
      6,
      'should still register callbacks for each partition replica x message group',
    );

    teardownEnvironment();
    t.end();
  },
);
