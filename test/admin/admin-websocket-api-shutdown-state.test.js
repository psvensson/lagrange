import {test} from '../../src/test-helpers/tap.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize();
  LoggingService.getInstance().initialize({level: 'error'});
}

test('AdminWebSocketAPI shutdown clears initialized and listening state',
  async (t) => {
    initializeTestEnvironment();

    const api = new AdminWebSocketAPI({
      nodeId: 'admin-shutdown-state-node',
    });

    await api.initialize(0);
    t.equal(api.isInitialized(), true, 'admin API should initialize');
    t.equal(api.isListening(), true, 'admin API should listen before shutdown');

    await api.shutdown();

    t.equal(api.isInitialized(), false, 'shutdown clears initialized state');
    t.equal(api.isListening(), false, 'shutdown clears listening state');
  });

test('AdminWebSocketAPI bind conflict on initialize is tagged retryable',
  async (t) => {
    initializeTestEnvironment();

    const holder = new AdminWebSocketAPI({
      nodeId: 'admin-bind-conflict-holder',
    });
    await holder.initialize(0);
    const port = holder.fastify.server.address().port;

    const contender = new AdminWebSocketAPI({
      nodeId: 'admin-bind-conflict-contender',
    });

    let caught = null;
    try {
      await contender.initialize(port);
    } catch (err) {
      caught = err;
    }

    t.ok(caught, 'a port already in use must surface a bind error');
    t.equal(caught.code, 'EADDRINUSE', 'bind conflict reports EADDRINUSE');
    t.equal(
      caught.retryable,
      true,
      'admin bind conflict is tagged retryable so join re-attempts drain the ' +
        'port instead of fatally exiting the node',
    );

    await holder.shutdown();
  });
