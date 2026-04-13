/**
 * Unit tests for NodeService.
 * Tests administrative operations, service lifecycle, and health monitoring.
 * Requirements: 1.3, 2.3
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {NodeService, NodeStatus, NodeState} from '../../src/node/node-service.js';
import {NodeLifecycleStateMachine} from '../../src/node/node-lifecycle-state-machine.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {AddressManager} from '../../src/address/address-manager.js';

// Shared thread manager for all tests to avoid expensive pool creation/destruction
let sharedThreadManager = null;

test('NodeService', async (t) => {
  t.beforeEach(() => {
    NodeService.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    AddressManager.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({node: {id: 'test-node-id'}});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    // Reuse thread manager across tests to avoid expensive pool recreation
    if (!sharedThreadManager || !sharedThreadManager.isInitialized()) {
      ServiceThreadManager.resetInstance();
      sharedThreadManager = ServiceThreadManager.getInstance();
      sharedThreadManager.initialize({
        minThreads: 1,
        maxThreads: 2,
        idleTimeoutMs: 100,
      });
    }
  });

  t.afterEach(async () => {
    await NodeService.getInstance().shutdown().catch(() => {});
    NodeService.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    AddressManager.resetInstance();
    // Don't reset thread manager - reuse it
  });

  // Clean up thread manager after all tests
  t.teardown(async () => {
    if (sharedThreadManager) {
      await sharedThreadManager.shutdown().catch(() => {});
      ServiceThreadManager.resetInstance();
      sharedThreadManager = null;
    }
  });

  t.test('singleton pattern', async (t) => {
    const instance1 = NodeService.getInstance();
    const instance2 = NodeService.getInstance();

    t.equal(instance1, instance2, 'should return same instance');
    t.ok(instance1 instanceof NodeService, 'should be NodeService');
  });

  t.test('initialization', async (t) => {
    const nodeService = NodeService.getInstance();

    t.equal(nodeService.isInitialized(), false, 'should not be initialized initially');

    nodeService.initialize();

    t.equal(nodeService.isInitialized(), true, 'should be initialized after init');
    t.ok(nodeService.getNodeId(), 'should have node ID');
    t.ok(nodeService.getNodeAddress(), 'should have node address');
    t.equal(nodeService.getStatus(), NodeStatus.ACTIVE, 'should be active');
  });

  t.test('initialization with custom options', async (t) => {
    const nodeService = NodeService.getInstance();

    nodeService.initialize({
      nodeId: 'custom-node-id',
    });

    t.equal(nodeService.getNodeId(), 'custom-node-id', 'should use custom node ID');
  });

  t.test('double initialization is idempotent', async (t) => {
    const nodeService = NodeService.getInstance();

    nodeService.initialize({nodeId: 'first-id'});
    nodeService.initialize({nodeId: 'second-id'}); // Should be ignored

    t.equal(nodeService.getNodeId(), 'first-id', 'should keep first node ID');
  });

  t.test('start and stop service', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    // Start service
    const startResult = await nodeService.startService({
      type: 'custom',
      config: {name: 'test-service'},
    });

    t.ok(startResult.id, 'should return service ID');
    t.equal(startResult.type, 'custom', 'should have correct type');
    t.equal(startResult.status, 'running', 'should be running');

    // Verify service exists
    const service = nodeService.getService(startResult.id);
    t.ok(service, 'should find service');
    t.equal(service.status, 'running', 'service should be running');

    // Stop service
    const stopResult = await nodeService.stopService(startResult.id);
    t.equal(stopResult.status, 'stopped', 'should be stopped');

    // Verify service is gone
    const serviceAfter = nodeService.getService(startResult.id);
    t.equal(serviceAfter, null, 'should not find service after stop');
  });

  t.test('start service without initialization throws', async (t) => {
    const nodeService = NodeService.getInstance();

    try {
      await nodeService.startService({type: 'custom'});
      t.fail('should have thrown');
    } catch (error) {
      t.match(error.message, /not initialized/, 'should throw not initialized');
    }
  });

  t.test('start duplicate service throws', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    await nodeService.startService({
      id: 'dup-service',
      type: 'custom',
    });

    try {
      await nodeService.startService({
        id: 'dup-service',
        type: 'custom',
      });
      t.fail('should have thrown');
    } catch (error) {
      t.match(error.message, /already exists/, 'should throw already exists');
    }
  });

  t.test('stop non-existent service throws', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    try {
      await nodeService.stopService('non-existent');
      t.fail('should have thrown');
    } catch (error) {
      t.match(error.message, /not found/, 'should throw not found');
    }
  });

  t.test('get node stats', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    const stats = await nodeService.getNodeStats();

    t.ok(stats.nodeId, 'should have node ID');
    t.ok(stats.nodeAddress, 'should have node address');
    t.equal(stats.status, NodeStatus.ACTIVE, 'should be active');
    t.ok(stats.uptime >= 0, 'should have uptime');
    t.ok(stats.timestamp, 'should have timestamp');

    // CPU stats
    t.ok(stats.cpu, 'should have CPU stats');
    t.ok(stats.cpu.count > 0, 'should have CPU count');
    t.type(stats.cpu.usagePercent, 'number', 'should have CPU usage');

    // Memory stats
    t.ok(stats.memory, 'should have memory stats');
    t.ok(stats.memory.totalBytes > 0, 'should have total memory');
    t.type(stats.memory.usagePercent, 'number', 'should have memory usage');

    // Service stats
    t.ok(stats.services, 'should have service stats');
    t.type(stats.services.total, 'number', 'should have total services');

    // Platform info
    t.ok(stats.platform, 'should have platform info');
    t.ok(stats.platform.os, 'should have OS');
    t.ok(stats.platform.nodeVersion, 'should have Node version');
  });

  t.test('get service health', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    const startResult = await nodeService.startService({type: 'custom'});
    const health = await nodeService.getServiceHealth(startResult.id);

    t.equal(health.serviceId, startResult.id, 'should have service ID');
    t.equal(health.type, 'custom', 'should have type');
    t.equal(health.healthy, true, 'should be healthy');
    t.ok(health.lastHealthCheck, 'should have last health check');
  });

  t.test('get health for non-existent service throws', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    try {
      await nodeService.getServiceHealth('ghost-service');
      t.fail('should have thrown');
    } catch (error) {
      t.match(error.message, /not found/, 'should throw not found');
    }
  });

  t.test('get all services', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    await nodeService.startService({id: 'svc-1', type: 'custom'});
    await nodeService.startService({id: 'svc-2', type: 'partition'});

    const services = nodeService.getAllServices();

    t.equal(services.length, 2, 'should have 2 services');
    t.ok(services.some((s) => s.id === 'svc-1'), 'should include svc-1');
    t.ok(services.some((s) => s.id === 'svc-2'), 'should include svc-2');
  });

  t.test('get running service count', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    t.equal(nodeService.getRunningServiceCount(), 0, 'should start with 0');

    await nodeService.startService({id: 'svc-a', type: 'custom'});
    t.equal(nodeService.getRunningServiceCount(), 1, 'should have 1 running');

    await nodeService.startService({id: 'svc-b', type: 'custom'});
    t.equal(nodeService.getRunningServiceCount(), 2, 'should have 2 running');

    await nodeService.stopService('svc-a');
    t.equal(nodeService.getRunningServiceCount(), 1, 'should have 1 after stop');
  });

  t.test('message group service tracking', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    t.equal(nodeService.hasLocalMessageGroupReplica(), false, 'should have no MG initially');

    await nodeService.startService({id: 'mg-1', type: 'messageGroup'});

    t.equal(nodeService.hasLocalMessageGroupReplica(), true, 'should have MG');

    const mgReplica = nodeService.getLocalMessageGroupReplica();
    t.ok(mgReplica, 'should get MG replica');
    t.equal(mgReplica.id, 'mg-1', 'should be correct MG');
  });

  t.test('route service message', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    await nodeService.startService({id: 'route-svc', type: 'custom'});

    const result = await nodeService.routeServiceMessage('route-svc', {
      operation: 'ping',
      data: {},
    });

    t.equal(result.status, 'ok', 'should get ok response');
    t.equal(result.serviceId, 'route-svc', 'should have service ID');
  });

  t.test('route message to non-existent service throws', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    try {
      await nodeService.routeServiceMessage('ghost', {operation: 'ping'});
      t.fail('should have thrown');
    } catch (error) {
      t.match(error.message, /not found/, 'should throw not found');
    }
  });

  t.test('emits events on service lifecycle', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    const events = [];
    nodeService.on('serviceStarted', (id) => events.push({type: 'started', id}));
    nodeService.on('serviceStopped', (id) => events.push({type: 'stopped', id}));

    await nodeService.startService({id: 'event-svc', type: 'custom'});
    await nodeService.stopService('event-svc');

    t.equal(events.length, 2, 'should emit 2 events');
    t.same(events[0], {type: 'started', id: 'event-svc'});
    t.same(events[1], {type: 'stopped', id: 'event-svc'});
  });

  t.test('shutdown cleans up all services', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    await nodeService.startService({id: 'shutdown-svc-1', type: 'custom'});
    await nodeService.startService({id: 'shutdown-svc-2', type: 'custom'});

    t.equal(nodeService.getAllServices().length, 2, 'should have 2 services');

    await nodeService.shutdown();

    t.equal(nodeService.isInitialized(), false, 'should not be initialized');
    t.equal(nodeService.getStatus(), NodeStatus.STOPPED, 'should be stopped');
  });

  // Tests for NodeLifecycleStateMachine integration (Requirements: 5.1, 5.4, 5.7)

  t.test('lifecycle state machine is initialized on node init', async (t) => {
    const nodeService = NodeService.getInstance();

    // Before initialization, lifecycle state should be null
    t.equal(nodeService.getLifecycleState(), null, 'should be null before init');

    nodeService.initialize();

    // After initialization, should be in READY state
    t.equal(nodeService.getLifecycleState(), NodeState.READY, 'should be READY after init');
    t.ok(nodeService.getLifecycleStateMachine(), 'should have state machine');
  });

  t.test('getLifecycleState returns current state', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    const state = nodeService.getLifecycleState();
    t.equal(state, NodeState.READY, 'should return READY state');
    t.equal(state, 'ready', 'should be string ready');
  });

  t.test('isReady returns true when in READY state', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize();

    t.equal(nodeService.isReady(), true, 'should be ready after init');
    t.equal(nodeService.isDraining(), false, 'should not be draining');
  });

  t.test('emits lifecycleStateChange events during initialization', async (t) => {
    const nodeService = NodeService.getInstance();
    const events = [];

    nodeService.on('lifecycleStateChange', (event) => {
      events.push(event);
    });

    nodeService.initialize({nodeId: 'lifecycle-test-node'});

    // Should have emitted events for each state transition
    // STARTING -> CONNECTING -> DISCOVERING -> JOINING -> SYNCING -> READY
    t.equal(events.length, 5, 'should emit 5 state change events');

    t.equal(events[0].from, NodeState.STARTING, 'first from STARTING');
    t.equal(events[0].to, NodeState.CONNECTING, 'first to CONNECTING');
    t.equal(events[0].nodeId, 'lifecycle-test-node', 'should include nodeId');

    t.equal(events[4].from, NodeState.SYNCING, 'last from SYNCING');
    t.equal(events[4].to, NodeState.READY, 'last to READY');
  });

  t.test('emits cdcNodeStateChange events for nodes table updates', async (t) => {
    const nodeService = NodeService.getInstance();
    const cdcEvents = [];

    nodeService.on('cdcNodeStateChange', (event) => {
      cdcEvents.push(event);
    });

    nodeService.initialize({nodeId: 'cdc-test-node'});

    // Should have emitted CDC events for each state transition
    t.equal(cdcEvents.length, 5, 'should emit 5 CDC events');

    // Check last CDC event (transition to READY)
    const lastEvent = cdcEvents[4];
    t.equal(lastEvent.nodeId, 'cdc-test-node', 'should have nodeId');
    t.equal(lastEvent.state, NodeState.READY, 'should have new state');
    t.equal(lastEvent.previousState, NodeState.SYNCING, 'should have previous state');
    t.ok(lastEvent.timestamp, 'should have timestamp');
  });

  t.test('shutdown transitions through DRAINING to STOPPED', async (t) => {
    const nodeService = NodeService.getInstance();
    const events = [];

    nodeService.initialize({nodeId: 'shutdown-lifecycle-node'});

    // Clear init events and listen for shutdown events
    nodeService.on('lifecycleStateChange', (event) => {
      events.push(event);
    });

    await nodeService.shutdown();

    // Should have READY -> DRAINING -> STOPPED
    t.equal(events.length, 2, 'should emit 2 events during shutdown');

    t.equal(events[0].from, NodeState.READY, 'first from READY');
    t.equal(events[0].to, NodeState.DRAINING, 'first to DRAINING');

    t.equal(events[1].from, NodeState.DRAINING, 'second from DRAINING');
    t.equal(events[1].to, NodeState.STOPPED, 'second to STOPPED');
  });

  t.test('NodeState enum is exported correctly', async (t) => {
    t.ok(NodeState, 'NodeState should be exported');
    t.equal(NodeState.STARTING, 'starting', 'STARTING should be starting');
    t.equal(NodeState.CONNECTING, 'connecting', 'CONNECTING should be connecting');
    t.equal(NodeState.DISCOVERING, 'discovering', 'DISCOVERING should be discovering');
    t.equal(NodeState.JOINING, 'joining', 'JOINING should be joining');
    t.equal(NodeState.SYNCING, 'syncing', 'SYNCING should be syncing');
    t.equal(NodeState.READY, 'ready', 'READY should be ready');
    t.equal(NodeState.DRAINING, 'draining', 'DRAINING should be draining');
    t.equal(NodeState.STOPPED, 'stopped', 'STOPPED should be stopped');
  });

  t.test('isReady and isDraining return false before initialization', async (t) => {
    const nodeService = NodeService.getInstance();

    t.equal(nodeService.isReady(), false, 'should not be ready before init');
    t.equal(nodeService.isDraining(), false, 'should not be draining before init');
  });

  t.test('initialization can use externally managed lifecycle state machine', async (t) => {
    const nodeService = NodeService.getInstance();
    const lifecycleEvents = [];

    const externalStateMachine = new NodeLifecycleStateMachine({
      nodeId: 'external-lifecycle-node',
      initialState: NodeState.CONNECTING,
    });

    nodeService.on('lifecycleStateChange', (event) => {
      lifecycleEvents.push(event);
    });

    nodeService.initialize({
      nodeId: 'external-lifecycle-node',
      lifecycleStateMachine: externalStateMachine,
      autoTransitionLifecycle: false,
    });

    t.equal(
      nodeService.getLifecycleState(),
      NodeState.CONNECTING,
      'should preserve externally managed initial state',
    );
    t.equal(
      lifecycleEvents.length,
      0,
      'should not auto-transition when autoTransitionLifecycle=false',
    );

    externalStateMachine.transition(NodeState.DISCOVERING);
    t.equal(
      nodeService.getLifecycleState(),
      NodeState.DISCOVERING,
      'should reflect external lifecycle transitions',
    );
    t.equal(lifecycleEvents.length, 1, 'should forward external lifecycle events');
  });
});
