import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';

import {NodeService} from '../../src/node/node-service.js';
import {LogsTableService} from '../../src/logging/logs-table-service.js';
import {JoinCleanupHandler} from '../../src/bootstrap/join-cleanup-handler.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {DataDirectoryManager} from '../../src/storage/data-directory-manager.js';
import {resetProcessRuntimeClaimForTests} from '../../src/lagrange-runtime-process-claim.js';

const CHILD_HELPER = 'test/test-helpers/natural-shutdown-child.js';
const CHILD_TIMEOUT_MS = 60000;

function resetSingletons() {
  resetProcessRuntimeClaimForTests();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  DataDirectoryManager.resetInstance();
  NodeService.resetInstance();
  LogsTableService.resetInstance();
}

test('R1 retained-resource-cause: identifies handles preventing natural exit on uncleaned start/failed-join', async () => {
  resetSingletons();
  try {
    const nodeService = NodeService.getInstance();
    nodeService.initialize({nodeId: 'test-node-r1'});
    nodeService.heartbeatInterval = setInterval(() => {}, 60000);
    nodeService.statsInterval = setInterval(() => {}, 60000);

    // Reproduce cause 1 & 2: joinCleanupHandler without complete shutdown chain leaves NodeService active
    const dummyDelegates = {
      getLogger: () => ({info() {}, warn() {}, error() {}, debug() {}}),
      getPhase: () => 'contacting_seed',
      setPhase: () => {},
      setLastError: () => {},
      getNow: () => () => Date.now(),
      getStartTime: () => Date.now(),
      getMessageGroupServices: () => new Map(),
      getPartitionServices: () => new Map(),
      stopJoiningLifecycleOwners: () => {},
      getRebalanceCoordinator: () => null,
      getLatencyTopology: () => null,
      setLatencyTopology: () => {},
      getMessageRouter: () => null,
      releaseReplicaLifecycleOwner: () => null,
      getReplicaHandler: () => null,
      getReplicaStateMachine: () => null,
      getRpcClient: () => null,
      getCdcIntegrationService: () => null,
      setCdcIntegrationService: () => {},
      getHeartbeatService: () => null,
      setHeartbeatService: () => {},
      getLeaseService: () => null,
      setLeaseService: () => {},
      getEndpointService: () => null,
      setEndpointService: () => {},
      getDispatchService: () => null,
      setDispatchService: () => {},
      setControlPlaneSystemTableGateway: () => {},
      getTransport: () => null,
      setTransport: () => {},
      setMessageRouter: () => {},
    };

    const handler = new JoinCleanupHandler({
      nodeId: 'test-node-r1',
      delegates: dummyDelegates,
    });

    await handler.cleanup();

    // On fixed code, joinCleanupHandler.cleanup() clears intervals while retaining initialized state for outer reattempts
    assert.equal(nodeService.isInitialized(), true, 'NodeService must retain initialized state for outer reattempts');
    assert.equal(nodeService.heartbeatInterval, null, 'NodeService heartbeatInterval must be cleared');
    assert.equal(nodeService.statsInterval, null, 'NodeService statsInterval must be cleared');

    // Verify LogsTableService provides stop() and cancels volatile pending flushes
    const logsTableService = LogsTableService.getInstance();
    assert.equal(typeof logsTableService.stop, 'function', 'LogsTableService must expose stop()');
    logsTableService.pendingWrites.push({logId: 'sample'});
    await logsTableService.stop();
    assert.equal(logsTableService.pendingWrites.length, 0, 'stop() must clear volatile pending writes');
    assert.equal(logsTableService.isShuttingDown, true, 'stop() must set isShuttingDown');
  } finally {
    resetSingletons();
  }
});

test('R2 successful-start-natural-exit: starts and shuts down node with natural event loop exit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'natural-exit-start-'));
  try {
    const stdout = execFileSync(
      process.execPath,
      [CHILD_HELPER, 'successful-start', root, 'test-seed-r2'],
      {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: CHILD_TIMEOUT_MS,
      },
    );
    assert.ok(true, `child exited naturally: ${stdout}`);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('R3 failed-join-natural-exit: failed join unwinds resources and exits naturally', async () => {
  const root = await mkdtemp(join(tmpdir(), 'natural-exit-join-fail-'));
  try {
    const stdout = execFileSync(
      process.execPath,
      [CHILD_HELPER, 'failed-join', root, 'test-joiner-r3'],
      {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: CHILD_TIMEOUT_MS,
      },
    );
    assert.match(stdout, /caught-startup-failure/u, 'child process encountered and caught failed join');
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('R4 owned-resources-released: releases all owned workers, subscriptions, timers and runtime services', async () => {
  resetSingletons();
  try {
    let cdcMarkShuttingDownCalled = false;
    let cdcListenersCleared = false;
    const mockCdcService = {
      markShuttingDown() {
        cdcMarkShuttingDownCalled = true;
      },
      removeAllListeners() {
        cdcListenersCleared = true;
      },
    };

    let readinessShutdownCalled = false;
    const mockReadinessService = {
      shutdown() {
        readinessShutdownCalled = true;
      },
    };

    const nodeService = NodeService.getInstance();
    nodeService.initialize({nodeId: 'test-node-r4'});

    const logsTableService = LogsTableService.getInstance();
    logsTableService.pendingWrites.push({logId: 'sample-r4'});

    const dummyDelegates = {
      getLogger: () => ({info() {}, warn() {}, error() {}, debug() {}}),
      getPhase: () => 'failed',
      setPhase: () => {},
      setLastError: () => {},
      getNow: () => () => Date.now(),
      getStartTime: () => Date.now(),
      getMessageGroupServices: () => new Map(),
      getPartitionServices: () => new Map(),
      stopJoiningLifecycleOwners: () => {},
      getRebalanceCoordinator: () => ({
        controlPlaneReadinessService: mockReadinessService,
        shutdown: async () => {},
      }),
      getLatencyTopology: () => null,
      setLatencyTopology: () => {},
      getMessageRouter: () => null,
      releaseReplicaLifecycleOwner: () => null,
      getReplicaHandler: () => null,
      getReplicaStateMachine: () => null,
      getRpcClient: () => null,
      getCdcIntegrationService: () => mockCdcService,
      setCdcIntegrationService: () => {},
      getHeartbeatService: () => null,
      setHeartbeatService: () => {},
      getLeaseService: () => null,
      setLeaseService: () => {},
      getEndpointService: () => null,
      setEndpointService: () => {},
      getDispatchService: () => null,
      setDispatchService: () => {},
      setControlPlaneSystemTableGateway: () => {},
      getTransport: () => null,
      setTransport: () => {},
      setMessageRouter: () => {},
    };

    const handler = new JoinCleanupHandler({
      nodeId: 'test-node-r4',
      delegates: dummyDelegates,
    });

    await handler.cleanup();

    assert.equal(nodeService.isInitialized(), true, 'NodeService must retain initialized state');
    assert.equal(nodeService.heartbeatInterval, null, 'NodeService heartbeatInterval must be cleared');
    assert.equal(logsTableService.pendingWrites.length, 0, 'LogsTableService pending writes cleared');
    assert.equal(cdcMarkShuttingDownCalled, true, 'CDC integration service marked shutting down');
    assert.equal(cdcListenersCleared, true, 'CDC integration listeners removed');
    assert.equal(readinessShutdownCalled, true, 'Readiness service shut down');
  } finally {
    resetSingletons();
  }
});

test('R5 restart-retains-committed-obligations: preserves and resumes committed obligations across restart while cancelling volatile work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'natural-exit-restart-'));
  try {
    const stdout = execFileSync(
      process.execPath,
      [CHILD_HELPER, 'restart', root, 'test-restart-r5'],
      {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 60000,
      },
    );
    assert.match(stdout, /restart-retains-committed-obligations-ok/u, 'restart preserved and resumed obligations');
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
