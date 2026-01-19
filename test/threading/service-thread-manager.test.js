/**
 * Unit tests for ServiceThreadManager.
 * Tests worker thread pool management and service execution.
 * Requirements: 2.3, 2.4
 */

import {test} from 'tap';
import {ServiceThreadManager, ServiceStatus} from '../../src/threading/service-thread-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

test('ServiceThreadManager', async (t) => {
  t.beforeEach(() => {
    ServiceThreadManager.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({node: {id: 'test-node'}});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(async () => {
    await ServiceThreadManager.getInstance().shutdown().catch(() => {});
    ServiceThreadManager.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  t.test('singleton pattern', async (t) => {
    const instance1 = ServiceThreadManager.getInstance();
    const instance2 = ServiceThreadManager.getInstance();

    t.equal(instance1, instance2, 'should return same instance');
    t.ok(instance1 instanceof ServiceThreadManager, 'should be ServiceThreadManager');
  });

  t.test('initialization', async (t) => {
    const manager = ServiceThreadManager.getInstance();

    t.equal(manager.isInitialized(), false, 'should not be initialized initially');

    manager.initialize({minThreads: 1, maxThreads: 2});

    t.equal(manager.isInitialized(), true, 'should be initialized after init');
  });

  t.test('double initialization is idempotent', async (t) => {
    const manager = ServiceThreadManager.getInstance();

    manager.initialize({minThreads: 1, maxThreads: 2});
    manager.initialize({minThreads: 4, maxThreads: 8}); // Should be ignored

    t.equal(manager.isInitialized(), true, 'should remain initialized');
  });

  t.test('execute operation without initialization throws', async (t) => {
    const manager = ServiceThreadManager.getInstance();

    try {
      await manager.executeServiceOperation('test-service', 'ping');
      t.fail('should have thrown');
    } catch (error) {
      t.match(error.message, /not initialized/, 'should throw not initialized error');
    }
  });

  t.test('execute ping operation', async (t) => {
    const manager = ServiceThreadManager.getInstance();
    manager.initialize({minThreads: 1, maxThreads: 2});

    const result = await manager.executeServiceOperation('test-service', 'ping');

    t.equal(result.status, 'ok', 'should return ok status');
    t.equal(result.serviceId, 'test-service', 'should return service ID');
    t.ok(result.timestamp, 'should include timestamp');
  });

  t.test('register and unregister service', async (t) => {
    const manager = ServiceThreadManager.getInstance();
    manager.initialize({minThreads: 1, maxThreads: 2});

    // Register service
    const registerResult = await manager.registerService('my-service', {});
    t.ok(registerResult.success, 'should register successfully');

    // Check service exists
    const status = manager.getServiceStatus('my-service');
    t.equal(status.id, 'my-service', 'should have correct ID');
    t.equal(status.status, ServiceStatus.RUNNING, 'should be running');

    // Unregister service
    const unregisterResult = await manager.unregisterService('my-service');
    t.ok(unregisterResult.success, 'should unregister successfully');

    // Check service is gone
    const statusAfter = manager.getServiceStatus('my-service');
    t.equal(statusAfter, null, 'should not find service after unregister');
  });

  t.test('duplicate registration throws', async (t) => {
    const manager = ServiceThreadManager.getInstance();
    manager.initialize({minThreads: 1, maxThreads: 2});

    await manager.registerService('dup-service', {});

    try {
      await manager.registerService('dup-service', {});
      t.fail('should have thrown');
    } catch (error) {
      t.match(error.message, /already registered/, 'should throw already registered');
    }
  });

  t.test('unregister non-existent service throws', async (t) => {
    const manager = ServiceThreadManager.getInstance();
    manager.initialize({minThreads: 1, maxThreads: 2});

    try {
      await manager.unregisterService('non-existent');
      t.fail('should have thrown');
    } catch (error) {
      t.match(error.message, /not found/, 'should throw not found error');
    }
  });

  t.test('get all services', async (t) => {
    const manager = ServiceThreadManager.getInstance();
    manager.initialize({minThreads: 1, maxThreads: 2});

    await manager.registerService('service-1', {});
    await manager.registerService('service-2', {});

    const services = manager.getAllServices();

    t.equal(services.length, 2, 'should have 2 services');
    t.ok(services.some((s) => s.id === 'service-1'), 'should include service-1');
    t.ok(services.some((s) => s.id === 'service-2'), 'should include service-2');
  });

  t.test('get service count', async (t) => {
    const manager = ServiceThreadManager.getInstance();
    manager.initialize({minThreads: 1, maxThreads: 2});

    t.equal(manager.getServiceCount(), 0, 'should start with 0 services');

    await manager.registerService('service-a', {});
    t.equal(manager.getServiceCount(), 1, 'should have 1 service');

    await manager.registerService('service-b', {});
    t.equal(manager.getServiceCount(), 2, 'should have 2 services');

    await manager.unregisterService('service-a');
    t.equal(manager.getServiceCount(), 1, 'should have 1 service after unregister');
  });

  t.test('check service health', async (t) => {
    const manager = ServiceThreadManager.getInstance();
    manager.initialize({minThreads: 1, maxThreads: 2});

    await manager.registerService('health-service', {});

    const health = await manager.checkServiceHealth('health-service');

    t.equal(health.serviceId, 'health-service', 'should return service ID');
    t.equal(health.healthy, true, 'should be healthy');
    t.ok(health.timestamp, 'should include timestamp');
  });

  t.test('health check for non-existent service throws', async (t) => {
    const manager = ServiceThreadManager.getInstance();
    manager.initialize({minThreads: 1, maxThreads: 2});

    try {
      await manager.checkServiceHealth('ghost-service');
      t.fail('should have thrown');
    } catch (error) {
      t.match(error.message, /not found/, 'should throw not found error');
    }
  });

  t.test('get pool stats', async (t) => {
    const manager = ServiceThreadManager.getInstance();
    manager.initialize({minThreads: 1, maxThreads: 2});

    const stats = manager.getPoolStats();

    t.ok(stats, 'should return stats object');
    t.type(stats.threads, 'number', 'should have threads count');
    t.type(stats.completed, 'number', 'should have completed count');
  });

  t.test('pool stats returns null when not initialized', async (t) => {
    const manager = ServiceThreadManager.getInstance();

    const stats = manager.getPoolStats();

    t.equal(stats, null, 'should return null when not initialized');
  });

  t.test('shutdown cleans up resources', async (t) => {
    const manager = ServiceThreadManager.getInstance();
    manager.initialize({minThreads: 1, maxThreads: 2});

    await manager.registerService('shutdown-service', {});
    t.equal(manager.getServiceCount(), 1, 'should have 1 service');

    await manager.shutdown();

    t.equal(manager.isInitialized(), false, 'should not be initialized');
    t.equal(manager.getServiceCount(), 0, 'should have 0 services');
  });

  t.test('emits events on service lifecycle', async (t) => {
    const manager = ServiceThreadManager.getInstance();
    manager.initialize({minThreads: 1, maxThreads: 2});

    const events = [];
    manager.on('serviceRegistered', (id) => events.push({type: 'registered', id}));
    manager.on('serviceUnregistered', (id) => events.push({type: 'unregistered', id}));

    await manager.registerService('event-service', {});
    await manager.unregisterService('event-service');

    t.equal(events.length, 2, 'should emit 2 events');
    t.same(events[0], {type: 'registered', id: 'event-service'});
    t.same(events[1], {type: 'unregistered', id: 'event-service'});
  });
});
