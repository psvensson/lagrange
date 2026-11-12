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
import {buildCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {beginDurableCdcInvocation, createDurableCdcEvent} from
  '../topology/cdc-group-propagation-service-harness.js';

// The durable subscriber contract: one vector of the table's durable events
// under a delivery invocation, answered over that exact vector. `deliver`
// hands the captured subscriber a one-member vector; `committedAnswer` is the
// controlled answer of the propagation double (never recipient evidence).
const deliver = (subscriber, {tableName, operation, data}) => subscriber(
  [createDurableCdcEvent({tableName, operation, data})], beginDurableCdcInvocation());
const committedAnswer = (messageGroup, events) =>
  buildCommittedCdcOutcome(events, messageGroup.groupId, {index: 1, term: 1});

// The latency topology's CDC group propagation service, the one seam the
// seed's propagation subscribers reach (bootstrap-service-seed-delegates.js
// propagatePartitionCDCEvent -> propagatePartitionCdcVector).
const propagationTopology = (propagateCDCEvent) => ({
  cdcGroupPropagationService: {propagateCDCEvent: async (request) => propagateCDCEvent(request)},
});

// The seed hydration passes its message group as the propagation
// subscribers' preferred service; these fixtures hydrate through the first.
const hydrationMessageGroup = (service) => service.messageGroupServices.values().next().value;

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

    const service = new BootstrapService({bootIncarnation: 1, nodeId: 'node-a'});

    // Track propagated events
    const propagatedEvents = [];

    // The propagation seam every seed subscriber reaches (the delegate's
    // propagatePartitionCdcVector -> latency topology): capture the vector
    // and answer it committed by the selected source group.
    service.latencyTopology = propagationTopology(({sourceMessageGroupService, events}) => {
      propagatedEvents.push(events);
      return committedAnswer(sourceMessageGroupService, events);
    });

    // Capture the CDC subscriber callback registered on the partition
    let capturedCdcSubscriber = null;

    const mockPartition = {
      subscribeToCDCWithHandshake: async (subscriber, options = {}) => {
        capturedCdcSubscriber = subscriber;
        return {
          subscriberId: options.subscriberId || null,
          subscriptionEpoch: 1,
        };
      },
      isLeader: false,
    };

    // Message group that is NOT the leader
    const mockMessageGroup = {
      initialized: true,
      groupId: 'mg-1',
      subscribeToCDC: async () => {},
      isLeaderReplica: () => false,
      getMetadataIngressReadiness: () => ({ready: false}),
    };

    // An operational message group that IS the leader.
    const leaderMg = {
      initialized: true,
      groupId: 'mg-1',
      subscribeToCDC: async () => {},
      isLeaderReplica: () => true,
      getMetadataIngressReadiness: () => ({ready: true}),
    };

    service.messageGroupServices = new Map([
      ['mg-1-r1', mockMessageGroup],
      ['mg-1-r2', leaderMg],
    ]);
    service.partitionServices = new Map([
      ['partitions-p1-r1', mockPartition],
    ]);

    await service.seedCacheHydrationPhase.subscribeToCDC(
      'partitions',
      'partitions-p1',
      ['partitions-p1-r1'],
      hydrationMessageGroup(service),
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

    await deliver(capturedCdcSubscriber, cdcEvent);

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
  'subscribeToCDC defers CDC delivery when the captured ingress owner is unavailable',
  async (t) => {
    setupEnvironment();

    const service = new BootstrapService({bootIncarnation: 1, nodeId: 'node-a'});
    let capturedCdcSubscriber = null;

    const mockPartition = {
      subscribeToCDCWithHandshake: async (subscriber, options = {}) => {
        capturedCdcSubscriber = subscriber;
        return {
          subscriberId: options.subscriberId || null,
          subscriptionEpoch: 1,
        };
      },
      isLeader: false,
    };

    service.partitionServices = new Map([
      ['partitions-p1-r1', mockPartition],
    ]);
    service.messageGroupServices = new Map([
      ['mg-1-r1', {
        initialized: false,
        systemTableCache: {
          get: () => null,
        },
        subscribeToCDC: async () => {},
        isLeaderReplica: () => false,
        getMetadataIngressReadiness: () => ({
          ready: false,
          reason: 'leader metadata incomplete',
          retryAfterMs: 250,
        }),
      }],
    ]);

    await service.seedCacheHydrationPhase.subscribeToCDC(
      'partitions',
      'partitions-p1',
      ['partitions-p1-r1'],
      hydrationMessageGroup(service),
    );

    assert.deepEqual(
      capturedCdcSubscriber.canAcceptCDCEvent({
        tableName: 'partitions',
        operation: 'INSERT',
        data: {partition_id: 'tbl-abc-p1', table_name: 'benchmark'},
      }),
      {
        ready: false,
        reason: 'leader metadata incomplete',
        retryAfterMs: 250,
      },
      'subscriber should expose typed readiness before partition CDC starts delivery work',
    );

    await assert.rejects(
      () => deliver(capturedCdcSubscriber, {
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
  'subscribeToCDC reuses the captured strict ingress owner before rerunning selection repair',
  async (t) => {
    setupEnvironment();

    const service = new BootstrapService({bootIncarnation: 1, nodeId: 'node-a'});
    const propagatedEvents = [];
    let capturedCdcSubscriber = null;
    let repairSelectionCalls = 0;

    service.latencyTopology = propagationTopology(({sourceMessageGroupService, events}) => {
      propagatedEvents.push(events);
      return committedAnswer(sourceMessageGroupService, events);
    });

    const mockPartition = {
      subscribeToCDCWithHandshake: async (subscriber, options = {}) => {
        capturedCdcSubscriber = subscriber;
        return {
          subscriberId: options.subscriberId || null,
          subscriptionEpoch: 1,
        };
      },
      isLeader: false,
    };

    service.partitionServices = new Map([
      ['nodes-p1-r1', mockPartition],
    ]);
    service.messageGroupServices = new Map([
      ['mg-1-r1', {
        initialized: true,
        groupId: 'mg-1',
        systemTableCache: {
          get: () => null,
        },
        subscribeToCDC: async () => {},
        isLeaderReplica: () => false,
        getMetadataIngressReadiness: () => ({
          ready: false,
          reason: 'leader metadata incomplete',
          retryAfterMs: 250,
        }),
        resolveMetadataIngressForwardSelection: async () => {
          repairSelectionCalls += 1;
          return {
            strictForwarding: true,
            strictForwardRetryAfterMs: 250,
            targets: [{
              serviceId: 'mg-1-r2',
              address: 'seed-node/message-group/mg-1-r2',
            }],
            suppressedCount: 0,
          };
        },
      }],
    ]);

    await service.seedCacheHydrationPhase.subscribeToCDC(
      'nodes',
      'nodes-p1',
      ['nodes-p1-r1'],
      hydrationMessageGroup(service),
    );

    await deliver(capturedCdcSubscriber, {
      tableName: 'nodes',
      operation: 'UPSERT',
      data: {node_id: 'node-b'},
    });

    assert.equal(
      propagatedEvents.length,
      1,
      'strict CDC propagation should stay bound to the captured ingress owner',
    );
    assert.equal(
      repairSelectionCalls,
      0,
      'captured ingress reuse should avoid re-deriving strict repair ' +
      'selection in the outer owner path',
    );

    teardownEnvironment();
    t.end();
  },
);

test(
  'subscribeToCDC keeps strict local ingress bound to the captured owner when no remote target exists yet',
  async (t) => {
    setupEnvironment();

    const service = new BootstrapService({bootIncarnation: 1, nodeId: 'node-a'});
    const propagatedEvents = [];
    let capturedCdcSubscriber = null;
    let repairSelectionCalls = 0;

    service.latencyTopology = propagationTopology(({sourceMessageGroupService, events}) => {
      propagatedEvents.push({messageGroup: sourceMessageGroupService, events});
      return committedAnswer(sourceMessageGroupService, events);
    });

    const localRelay = {
      initialized: true,
      groupId: 'mg-1',
      systemTableCache: {
        get: () => null,
      },
      subscribeToCDC: async () => {},
      isLeaderReplica: () => false,
      getMetadataIngressReadiness: () => ({
        ready: false,
        reason: 'leader metadata incomplete',
        retryAfterMs: 250,
      }),
      resolveMetadataIngressForwardSelection: async () => {
        repairSelectionCalls += 1;
        return {
          strictForwarding: true,
          strictForwardRetryAfterMs: 250,
          targets: [],
          suppressedCount: 0,
          localIngress: true,
        };
      },
    };

    const mockPartition = {
      subscribeToCDCWithHandshake: async (subscriber, options = {}) => {
        capturedCdcSubscriber = subscriber;
        return {
          subscriberId: options.subscriberId || null,
          subscriptionEpoch: 1,
        };
      },
      isLeader: false,
    };

    service.partitionServices = new Map([
      ['nodes-p1-r1', mockPartition],
    ]);
    service.messageGroupServices = new Map([
      ['mg-1-r1', localRelay],
    ]);

    await service.seedCacheHydrationPhase.subscribeToCDC(
      'nodes',
      'nodes-p1',
      ['nodes-p1-r1'],
      hydrationMessageGroup(service),
    );

    await deliver(capturedCdcSubscriber, {
      tableName: 'nodes',
      operation: 'UPSERT',
      data: {node_id: 'node-b'},
    });

    assert.equal(
      propagatedEvents.length,
      1,
      'strict local ingress should keep CDC propagation bound to the operational local message group',
    );
    assert.equal(
      propagatedEvents[0]?.messageGroup,
      localRelay,
      'strict local ingress should return the local relay as the operational ingress service',
    );
    assert.equal(
      repairSelectionCalls,
      0,
      'captured local ingress reuse should avoid rerunning outer selection repair',
    );

    teardownEnvironment();
    t.end();
  },
);

test(
  'subscribeToCDC subscribes each message group once per table',
  async (t) => {
    setupEnvironment();

    const service = new BootstrapService({bootIncarnation: 1, nodeId: 'node-a'});

    let mgSubscribeCalls = 0;
    let partitionSubscriberRegistrations = 0;

    const makePartition = () => ({
      subscribeToCDCWithHandshake: async () => {
        partitionSubscriberRegistrations += 1;
        return {
          subscriberId: 'mock-subscriber',
          subscriptionEpoch: 1,
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

    await service.seedCacheHydrationPhase.subscribeToCDC(
      'tables', 'tables-p1', [
        'tables-p1-r1',
        'tables-p1-r2',
        'tables-p1-r3',
      ], hydrationMessageGroup(service));

    assert.equal(
      mgSubscribeCalls,
      2,
      'should subscribe each message group once for the table',
    );
    assert.equal(
      partitionSubscriberRegistrations,
      3,
      'should register one propagation subscriber per partition replica',
    );

    teardownEnvironment();
    t.end();
  },
);
