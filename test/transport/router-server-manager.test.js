/**
 * Unit tests for RouterServerManager.
 * Tests WebSocket server lifecycle management.
 * Requirements: 1.2, 1.4
 */

import t from '../../src/test-helpers/tap.js';
import {RouterServerManager} from '../../src/transport/router-server-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';

const ports = createPortAllocator(import.meta.url);

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Clean up test environment.
 */
function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

/**
 * Create a mock logger for testing.
 * @return {Object} Mock logger.
 */
function createMockLogger() {
  return {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };
}

t.test('RouterServerManager unit tests', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
    ports.reset();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  t.test('should require nodeId in constructor', async (t) => {
    t.throws(() => {
      new RouterServerManager({
        logger: createMockLogger(),
        routerId: 'router-1',
        nodeConnections: new Map(),
        onMessage: () => {},
        onConnectionClose: () => {},
        emit: () => {},
      });
    }, /requires nodeId/, 'should throw if nodeId missing');
  });

  t.test('should require logger in constructor', async (t) => {
    t.throws(() => {
      new RouterServerManager({
        nodeId: 'node-1',
        routerId: 'router-1',
        nodeConnections: new Map(),
        onMessage: () => {},
        onConnectionClose: () => {},
        emit: () => {},
      });
    }, /requires logger/, 'should throw if logger missing');
  });

  t.test('should require routerId in constructor', async (t) => {
    t.throws(() => {
      new RouterServerManager({
        nodeId: 'node-1',
        logger: createMockLogger(),
        nodeConnections: new Map(),
        onMessage: () => {},
        onConnectionClose: () => {},
        emit: () => {},
      });
    }, /requires routerId/, 'should throw if routerId missing');
  });

  t.test('should require nodeConnections in constructor', async (t) => {
    t.throws(() => {
      new RouterServerManager({
        nodeId: 'node-1',
        logger: createMockLogger(),
        routerId: 'router-1',
        onMessage: () => {},
        onConnectionClose: () => {},
        emit: () => {},
      });
    }, /requires nodeConnections/, 'should throw if nodeConnections missing');
  });

  t.test('should require onMessage callback in constructor', async (t) => {
    t.throws(() => {
      new RouterServerManager({
        nodeId: 'node-1',
        logger: createMockLogger(),
        routerId: 'router-1',
        nodeConnections: new Map(),
        onConnectionClose: () => {},
        emit: () => {},
      });
    }, /requires onMessage/, 'should throw if onMessage missing');
  });

  t.test('should require onConnectionClose callback in constructor', async (t) => {
    t.throws(() => {
      new RouterServerManager({
        nodeId: 'node-1',
        logger: createMockLogger(),
        routerId: 'router-1',
        nodeConnections: new Map(),
        onMessage: () => {},
        emit: () => {},
      });
    }, /requires onConnectionClose/, 'should throw if onConnectionClose missing');
  });

  t.test('should require emit function in constructor', async (t) => {
    t.throws(() => {
      new RouterServerManager({
        nodeId: 'node-1',
        logger: createMockLogger(),
        routerId: 'router-1',
        nodeConnections: new Map(),
        onMessage: () => {},
        onConnectionClose: () => {},
      });
    }, /requires emit/, 'should throw if emit missing');
  });

  t.test('should create server manager with valid options', async (t) => {
    const serverManager = new RouterServerManager({
      nodeId: 'node-1',
      logger: createMockLogger(),
      routerId: 'router-1',
      wsPort: 9999,
      wsHost: 'localhost',
      nodeConnections: new Map(),
      onMessage: () => {},
      onConnectionClose: () => {},
      emit: () => {},
    });

    t.equal(serverManager.nodeId, 'node-1', 'should have nodeId');
    t.equal(serverManager.routerId, 'router-1', 'should have routerId');
    t.equal(serverManager.wsPort, 9999, 'should have wsPort');
    t.equal(serverManager.wsHost, 'localhost', 'should have wsHost');
    t.equal(serverManager.isRunning(), false, 'should not be running initially');
    t.equal(serverManager.isInProcessTransport(), false, 'should not be in-process');
  });

  t.test('should start and shutdown real WebSocket server', async (t) => {
    let serverManager = null;
    let lastBindError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const port = await ports.getAvailable();
      const candidate = new RouterServerManager({
        nodeId: 'node-1',
        logger: createMockLogger(),
        routerId: 'router-1',
        wsPort: port,
        wsHost: 'localhost',
        nodeConnections: new Map(),
        onMessage: () => {},
        onConnectionClose: () => {},
        emit: () => {},
      });

      try {
        await candidate.startServer();
        serverManager = candidate;
        break;
      } catch (error) {
        await candidate.shutdown().catch(() => {});
        if (error?.code === 'EPERM' || error?.code === 'EACCES') {
          t.pass(`socket listen not permitted in this environment: ${error.message}`);
          return;
        }
        if (error?.code === 'EADDRINUSE') {
          lastBindError = error;
          continue;
        }
        throw error;
      }
    }
    if (!serverManager && lastBindError) {
      throw lastBindError;
    }

    t.equal(serverManager.isRunning(), true, 'should be running after start');
    t.ok(serverManager.getServer(), 'should have server instance');

    await serverManager.shutdown();

    t.equal(serverManager.isRunning(), false, 'should not be running after shutdown');
    t.equal(serverManager.getServer(), null, 'should not have server after shutdown');
  });

  t.test('should start and shutdown in-process server', async (t) => {
    const port = ports.getPort();
    const serverManager = new RouterServerManager({
      nodeId: 'node-1',
      logger: createMockLogger(),
      routerId: 'router-1',
      wsPort: port,
      inProcess: true,
      nodeConnections: new Map(),
      onMessage: () => {},
      onConnectionClose: () => {},
      emit: () => {},
    });

    await serverManager.startServer();

    t.equal(serverManager.isRunning(), true, 'should be running after start');
    t.equal(serverManager.isInProcessTransport(), true, 'should be in-process');
    t.ok(serverManager.getServer(), 'should have server instance');

    await serverManager.shutdown();

    t.equal(serverManager.isRunning(), false, 'should not be running after shutdown');
    t.equal(serverManager.isInProcessTransport(), false, 'should not be in-process');
  });

  t.test('should throw on invalid port for in-process server', async (t) => {
    const serverManager = new RouterServerManager({
      nodeId: 'node-1',
      logger: createMockLogger(),
      routerId: 'router-1',
      wsPort: 'invalid',
      inProcess: true,
      nodeConnections: new Map(),
      onMessage: () => {},
      onConnectionClose: () => {},
      emit: () => {},
    });

    await t.rejects(
      serverManager.startServer(),
      /Invalid wsPort/,
      'should reject invalid port',
    );
  });

  t.test('should return empty clients set when no server', async (t) => {
    const serverManager = new RouterServerManager({
      nodeId: 'node-1',
      logger: createMockLogger(),
      routerId: 'router-1',
      nodeConnections: new Map(),
      onMessage: () => {},
      onConnectionClose: () => {},
      emit: () => {},
    });

    const clients = serverManager.getClients();
    t.ok(clients instanceof Set, 'should return a Set');
    t.equal(clients.size, 0, 'should be empty');
  });

  t.test('should handle shutdown when server not started', async (t) => {
    const serverManager = new RouterServerManager({
      nodeId: 'node-1',
      logger: createMockLogger(),
      routerId: 'router-1',
      nodeConnections: new Map(),
      onMessage: () => {},
      onConnectionClose: () => {},
      emit: () => {},
    });

    // Should not throw
    await serverManager.shutdown();
    t.pass('should handle shutdown gracefully when not started');
  });
});
