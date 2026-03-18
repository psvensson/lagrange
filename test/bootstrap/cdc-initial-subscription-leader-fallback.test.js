/**
 * Tests that the initial CDC subscription path in BootstrapService
 * always uses an operational message-group owner and defers
 * rather than dropping CDC when that owner is temporarily unavailable.
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
      initialized: true,
      subscribeToCDC: async () => {},
      isLeaderReplica: () => false,
      getMetadataIngressReadiness: () => ({ready: false}),
    };

    // An operational message group that IS the leader.
    const leaderMg = {
      initialized: true,
      subscribeToCDC: async () => {},
      isLeaderReplica: () => true,
      isMetadataIngressReady: () => true,
    };

    service.messageGroupServices = new Map([
      ['mg-1-r1', mockMessageGroup],
      ['mg-1-r2', leaderMg],
    ]);
    service.partitionServices = new Map([
      ['partitions-p1-r1', mockPartition],
    ]);

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
      'CDC event should be propagated via the operational message-group ' +
      'leader when the local replica is not the leader',
    );

    teardownEnvironment();
    t.end();
  },
);

test(
  'subscribeToCDC defers CDC delivery when no operational message-group is ready',
  async (t) => {
    setupEnvironment();

    const service = new BootstrapService({nodeId: 'node-a'});
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

    service.partitionServices = new Map([
      ['partitions-p1-r1', mockPartition],
    ]);
    service.messageGroupServices = new Map([
      ['mg-1-r1', {
        initialized: true,
        subscribeToCDC: async () => {},
        isLeaderReplica: () => false,
        getMetadataIngressReadiness: () => ({
          ready: false,
          reason: 'leader metadata incomplete',
          retryAfterMs: 250,
        }),
      }],
    ]);

    await service.subscribeToCDC(
      'partitions',
      'partitions-p1',
      ['partitions-p1-r1'],
    );

    await assert.rejects(
      () => capturedCdcSubscriber({
        tableName: 'partitions',
        operation: 'INSERT',
        data: {partition_id: 'tbl-abc-p1', table_name: 'benchmark'},
      }),
      (error) => {
        assert.equal(error.ownerNotReady, true);
        assert.equal(error.deferRetry, true);
        assert.equal(error.retryAfterMs, 250);
        return true;
      },
      'subscriber should surface typed defer semantics so partition CDC can replay later',
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
