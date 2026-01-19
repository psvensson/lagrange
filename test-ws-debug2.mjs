import {AdminWebSocketAPI} from './src/admin/admin-websocket-api.js';
import {SystemTableCache} from './src/cache/system-table-cache.js';
import {ConfigurationManager} from './src/config/configuration-manager.js';
import {LoggingService} from './src/logging/logging-service.js';
import WebSocket from 'ws';

// Initialize services
ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'debug'});

const cache = new SystemTableCache();
cache.applySystemTableChange('nodes', 'INSERT', {
  id: 'node-1',
  address: 'localhost:8080',
  status: 'active',
});

const api = new AdminWebSocketAPI({
  nodeId: 'test-node',
  systemTableCache: cache,
});

await api.initialize(0);

const address = api.getFastify().server.address();
const port = address.port;
console.log('Server listening on port', port);

const ws = new WebSocket(`ws://localhost:${port}/api/admin/stream`);

ws.on('open', () => {
  console.log('Connected');
});

ws.on('message', (data) => {
  console.log('Got message:', data.toString().substring(0, 200));
  ws.close();
});

ws.on('close', () => {
  console.log('Closed');
  api.shutdown();
});

ws.on('error', (err) => {
  console.error('Error:', err);
});

// Timeout after 5 seconds
setTimeout(() => {
  console.log('Timeout - no message received');
  console.log('Client count:', api.getClientCount());
  ws.close();
  api.shutdown();
}, 5000);
