// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

test('NodeJoiningService retries ready heartbeat before failing join readiness',
  async (t) => {
    initializeTestEnvironment();

    let sendAttempts = 0;
    let startCalls = 0;
    const sleepDelays = [];

    const service = new NodeJoiningService({
      nodeId: 'node-ready-retry',
      nodeAddress: 'ws://localhost:19090',
      seedNodeAddress: 'http://localhost:18080',
      config: {
        readySignalMaxAttempts: 3,
        readySignalRetryDelayMs: 1,
        readySignalRetryBackoffMultiplier: 1,
      },
      sleep: async (delayMs) => {
        sleepDelays.push(delayMs);
      },
    });
    service.cdcSubscriptionsActive = true;
    service.messageRouter = {
      getQueryDataPlaneTransportReadiness() {
        return {ready: true, state: 'ready'};
      },
    };

    service.heartbeatService = {
      sendHeartbeat: async () => {
        sendAttempts += 1;
        if (sendAttempts < 3) {
          throw new Error('Query timeout after 30000ms');
        }
      },
      start: () => {
        startCalls += 1;
      },
    };

    const originalGetInstance = NodeService.getInstance;
    NodeService.getInstance = () => ({
      getNodeStats: async () => ({
        cpu: {count: 4, usagePercent: 10},
        memory: {totalBytes: 1024, usagePercent: 20},
        diskGb: 100,
        diskUsagePercent: 30,
      }),
    });

    try {
      await service.signalReadyForReplicas();
    } finally {
      NodeService.getInstance = originalGetInstance;
    }

    t.equal(sendAttempts, 3, 'ready signal should retry transient failures');
    t.equal(
      startCalls,
      0,
      'heartbeat loop should remain frozen until control-plane activation barrier',
    );
    t.same(
      sleepDelays,
      [1, 1],
      'ready signal retries should wait between attempts',
    );
  });

test('NodeJoiningService waits for local query transport readiness before sending ready heartbeat',
  async (t) => {
    initializeTestEnvironment();

    let transportReady = false;
    let heartbeatSent = 0;
    const sleepDelays = [];

    const service = new NodeJoiningService({
      nodeId: 'node-ready-transport-gate',
      nodeAddress: 'ws://localhost:19091',
      seedNodeAddress: 'http://localhost:18081',
      config: {
        readySignalMaxAttempts: 3,
        readySignalRetryDelayMs: 1,
        readySignalRetryMaxDelayMs: 1,
        readySignalRetryBackoffMultiplier: 1,
      },
      sleep: async (delayMs) => {
        sleepDelays.push(delayMs);
        transportReady = true;
      },
    });
    service.cdcSubscriptionsActive = true;
    service.messageRouter = {
      getQueryDataPlaneTransportReadiness() {
        return transportReady ?
          {ready: true, state: 'ready'} :
          {
            ready: false,
            state: 'deferred',
            reason: 'Query/data-plane message-group transport is not configured',
            retryAfterMs: 1,
          };
      },
    };
    service.heartbeatService = {
      sendHeartbeat: async () => {
        heartbeatSent += 1;
      },
      start: () => {},
    };

    const originalGetInstance = NodeService.getInstance;
    NodeService.getInstance = () => ({
      getNodeStats: async () => ({
        cpu: {count: 4, usagePercent: 10},
        memory: {totalBytes: 1024, usagePercent: 20},
        diskGb: 100,
        diskUsagePercent: 30,
      }),
    });

    try {
      await service.signalReadyForReplicas();
    } finally {
      NodeService.getInstance = originalGetInstance;
    }

    t.equal(heartbeatSent, 1,
      'ready heartbeat should be sent once the local query transport becomes ready');
    t.same(sleepDelays, [1],
      'local query transport gating should back off before the first ready heartbeat');
  });

test('NodeJoiningService opens the ready heartbeat for control-ready metadata publication',
  async (t) => {
    initializeTestEnvironment();

    let heartbeatSent = 0;
    const sleepDelays = [];

    const service = new NodeJoiningService({
      nodeId: 'node-ready-traffic-gate',
      nodeAddress: 'ws://localhost:19093',
      seedNodeAddress: 'http://localhost:18082',
      config: {
        readySignalMaxAttempts: 3,
        readySignalRetryDelayMs: 1,
        readySignalRetryMaxDelayMs: 1,
        readySignalRetryBackoffMultiplier: 1,
      },
      sleep: async (delayMs) => {
        sleepDelays.push(delayMs);
      },
    });
    service.cdcSubscriptionsActive = true;
    service.messageRouter = {
      getQueryDataPlaneTransportReadiness() {
        return {ready: true, state: 'ready'};
      },
    };
    service.bootstrapReadinessState = {
      getSnapshot() {
        return {
          ready: false,
          phase: 'CONTROL_READY',
          state: 'warming',
          reasons: ['LEADER_METADATA_INCOMPLETE'],
          retryAfterMs: 1,
          stableWindowMs: 10000,
          stableElapsedMs: 0,
        };
      },
    };
    service.heartbeatService = {
      sendHeartbeat: async () => {
        heartbeatSent += 1;
      },
      start: () => {},
    };

    const originalGetInstance = NodeService.getInstance;
    NodeService.getInstance = () => ({
      getNodeStats: async () => ({
        cpu: {count: 4, usagePercent: 10},
        memory: {totalBytes: 1024, usagePercent: 20},
        diskGb: 100,
        diskUsagePercent: 30,
      }),
    });

    try {
      await service.signalReadyForReplicas();
    } finally {
      NodeService.getInstance = originalGetInstance;
    }

    t.equal(heartbeatSent, 1,
      'ready heartbeat should be sent while lifecycle is only blocked on leader metadata');
    t.same(sleepDelays, [],
      'metadata-publication readiness should not wait for full traffic readiness');
  });

test('NodeJoiningService opens the ready heartbeat during the lifecycle stable window',
  async (t) => {
    initializeTestEnvironment();

    let heartbeatSent = 0;
    const sleepDelays = [];

    const service = new NodeJoiningService({
      nodeId: 'node-ready-stable-window-gate',
      nodeAddress: 'ws://localhost:19094',
      seedNodeAddress: 'http://localhost:18083',
      config: {
        readySignalMaxAttempts: 3,
        readySignalRetryDelayMs: 1,
        readySignalRetryMaxDelayMs: 1,
        readySignalRetryBackoffMultiplier: 1,
      },
      sleep: async (delayMs) => {
        sleepDelays.push(delayMs);
      },
    });
    service.cdcSubscriptionsActive = true;
    service.messageRouter = {
      getQueryDataPlaneTransportReadiness() {
        return {ready: true, state: 'ready'};
      },
    };
    service.bootstrapReadinessState = {
      getSnapshot() {
        return {
          ready: false,
          phase: 'JOIN_READY',
          state: 'warming',
          reasons: ['READINESS_STABLE_WINDOW_PENDING'],
          retryAfterMs: 1,
          stableWindowMs: 10000,
          stableElapsedMs: 0,
        };
      },
    };
    service.heartbeatService = {
      sendHeartbeat: async () => {
        heartbeatSent += 1;
      },
      start: () => {},
    };

    const originalGetInstance = NodeService.getInstance;
    NodeService.getInstance = () => ({
      getNodeStats: async () => ({
        cpu: {count: 4, usagePercent: 10},
        memory: {totalBytes: 1024, usagePercent: 20},
        diskGb: 100,
        diskUsagePercent: 30,
      }),
    });

    try {
      await service.signalReadyForReplicas();
    } finally {
      NodeService.getInstance = originalGetInstance;
    }

    t.equal(heartbeatSent, 1,
      'ready heartbeat should be sent while the lifecycle stable window is pending');
    t.same(sleepDelays, [],
      'metadata-publication readiness should not wait through the stable window');
  });
