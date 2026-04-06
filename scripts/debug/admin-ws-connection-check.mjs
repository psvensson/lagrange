#!/usr/bin/env node
/**
 * Manual sanity check for the admin websocket stream.
 *
 * Usage:
 *   node scripts/debug/admin-ws-connection-check.mjs [host:port]
 */

import WebSocket from 'ws';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(
      'Usage: node scripts/debug/admin-ws-connection-check.mjs [host:port]',
  );
  process.exit(0);
}

const nodeAddress = process.argv[2] || 'localhost:8081';
const wsUrl = `ws://${nodeAddress}/api/admin/stream`;

console.log(`Connecting to ${wsUrl}...`);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('Connected to server');
  console.log('Waiting for cache dump...');
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log(`Received message type: ${message.type}`);

    if (message.type === 'cache_dump') {
      console.log('Received cache dump:');
      const dump = message.data || {};
      console.log(`  Nodes: ${(dump.nodes || []).length}`);
      console.log(`  Services: ${(dump.services || []).length}`);
      console.log(`  Tables: ${(dump.tables || []).length}`);
      console.log(`  Partitions: ${(dump.partitions || []).length}`);
      console.log(`  Message Groups: ${(dump.message_groups || []).length}`);
      console.log(`  Indices: ${(dump.indices || []).length}`);
      console.log('');
      console.log('Admin websocket connection check succeeded.');
      console.log('Press Ctrl+C to keep watching or wait for close.');
    } else if (message.type === 'cdc_event') {
      console.log(`CDC Event: ${message.operation} on ${message.table}`);
    }
  } catch (err) {
    console.error('Failed to parse message:', err.message);
  }
});

ws.on('close', () => {
  console.log('Disconnected from server');
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});
