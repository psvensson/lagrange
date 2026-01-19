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

function waitForOpen(ws) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

function waitForMessage(ws, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for message'));
    }, timeout);

    ws.once('message', (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (e) {
        reject(e);
      }
    });
  });
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

  const ws = new WebSocket(`ws://localhost:${port}/api/admin/stream`);
  await waitForOpen(ws);
  console.log('Connected');

  const message = await waitForMessage(ws);
  console.log('Got message type:', message.type);

  t.equal(message.type, MessageType.CACHE_DUMP, 'should receive cache_dump');

  ws.close();
  await api.shutdown();
});
