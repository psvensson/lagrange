#!/usr/bin/env node
/**
 * Manual sanity check for the admin websocket stream.
 *
 * Usage:
 *   node scripts/debug/admin-ws-connection-check.mjs [host:port]
 */

import WebSocket from 'ws';
import {LISTENER_PORT_DEFAULT} from
  '../../src/config/listener-port-model.js';

const LOCAL_STR_HELP = '--help';
const LOCAL_STR_H = '-h';
const LOCAL_STR_1N4MF = 'Usage: node scripts/debug/admin-ws-connection-check.mjs [host:port]';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_OPEN = 'open';
const LOCAL_STR_1EBYU = 'Connected to server';
const LOCAL_STR_Y36BG = 'Waiting for cache dump...';
const LOCAL_STR_MESSAGE = 'message';
const LOCAL_STR_CACHE_DUMP = 'cache_dump';
const LOCAL_STR_AIQEQ = 'Received cache dump:';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_AFZ7C = 'Admin websocket connection check succeeded.';
const LOCAL_STR_U8W29 = 'Press Ctrl+C to keep watching or wait for close.';
const LOCAL_STR_CDC_EVENT = 'cdc_event';
const LOCAL_STR_W0BD2 = 'Failed to parse message:';
const LOCAL_STR_CLOSE = 'close';
const LOCAL_STR_QF06G = 'Disconnected from server';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_WEBSOCKET_ERROR = 'WebSocket error:';
const LOCAL_NUM_ONE = 1;

if (process.argv.includes(LOCAL_STR_HELP) || process.argv.includes(LOCAL_STR_H)) {
  console.log(
    LOCAL_STR_1N4MF,
  );
  process.exit(LOCAL_NUM_ZERO);
}

const nodeAddress = process.argv[2] ||
  `localhost:${LISTENER_PORT_DEFAULT.ADMIN_WEBSOCKET}`;
const wsUrl = `ws://${nodeAddress}/api/admin/stream`;

console.log(`Connecting to ${wsUrl}...`);

const ws = new WebSocket(wsUrl);

ws.on(LOCAL_STR_OPEN, () => {
  console.log(LOCAL_STR_1EBYU);
  console.log(LOCAL_STR_Y36BG);
});

ws.on(LOCAL_STR_MESSAGE, (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log(`Received message type: ${message.type}`);

    if (message.type === LOCAL_STR_CACHE_DUMP) {
      console.log(LOCAL_STR_AIQEQ);
      const dump = message.data || {};
      console.log(`  Nodes: ${(dump.nodes || []).length}`);
      console.log(`  Services: ${(dump.services || []).length}`);
      console.log(`  Tables: ${(dump.tables || []).length}`);
      console.log(`  Partitions: ${(dump.partitions || []).length}`);
      console.log(`  Message Groups: ${(dump.message_groups || []).length}`);
      console.log(`  Indices: ${(dump.indices || []).length}`);
      console.log(LOCAL_STR_EMPTY);
      console.log(LOCAL_STR_AFZ7C);
      console.log(LOCAL_STR_U8W29);
    } else if (message.type === LOCAL_STR_CDC_EVENT) {
      console.log(`CDC Event: ${message.operation} on ${message.table}`);
    }
  } catch (err) {
    console.error(LOCAL_STR_W0BD2, err.message);
  }
});

ws.on(LOCAL_STR_CLOSE, () => {
  console.log(LOCAL_STR_QF06G);
  process.exit(LOCAL_NUM_ZERO);
});

ws.on(LOCAL_STR_ERROR, (err) => {
  console.error(LOCAL_STR_WEBSOCKET_ERROR, err.message);
  process.exit(LOCAL_NUM_ONE);
});
