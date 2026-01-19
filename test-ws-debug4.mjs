import {test} from 'tap';
import WebSocket from 'ws';
import {AdminWebSocketAPI, MessageType} from './src/admin/admin-websocket-api.js';
import {SystemTableCache} from './src/cache/system-table-cache.js';
import {ConfigurationManager} from './src/config/configuration-manager.js';
import {LoggingService} from './src/logging/logging-service.js';

// Initialize services for tests
ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

function createPopulatedCache() {
  const cache = new SystemTableCache();
  cache.applySystemTableChange('nodes', 'INSERT', {
    id: 'node-1',
    address: 'localhost:8080',
    status: 'active',
  });
  return cache;
}

test('simple test', async (t) => {
  const cache = createPopulatedCache();
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: cache,
  });

  await api.initialize(0);

  const address = api.getFastify().server.address();
  const port = address.port;
  console.log('Port:', port);

  // Create promise for message before connecting
  const messagePromise = new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/api/admin/stream`);
    
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('Timeout waiting for message'));
    }, 2000);

    ws.on('message', (data) => {
      clearTimeout(timer);
      try {
        const msg = JSON.parse(data.toString());
        resolve({ws, msg});
      } catch (e) {
        reject(e);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  const {ws, msg} = await messagePromise;
  console.log('Got message type:', msg.type);

  t.equal(msg.type, MessageType.CACHE_DUMP, 'should receive cache_dump');

  ws.close();
  await api.shutdown();
});
