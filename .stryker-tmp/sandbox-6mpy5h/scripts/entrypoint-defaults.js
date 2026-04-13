#!/usr/bin/env node
// @ts-nocheck

import {ADMIN_DEFAULT} from '../src/admin/admin-constants.js';
import {ENTRYPOINT_DEFAULT} from '../src/constants/entrypoint.js';

const payload = {
  restApiPort: ENTRYPOINT_DEFAULT.REST_API_PORT,
  adminPort: ADMIN_DEFAULT.WEBSOCKET_PORT,
  wsPortOffset: ENTRYPOINT_DEFAULT.WS_PORT_OFFSET,
  localhost: ENTRYPOINT_DEFAULT.LOCALHOST,
};

process.stdout.write(`${JSON.stringify(payload)}\n`);
