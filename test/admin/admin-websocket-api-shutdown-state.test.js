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
