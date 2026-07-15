#!/usr/bin/env node

import {ADMIN_DEFAULT} from '../src/admin/admin-constants.js';
import {ENTRYPOINT_DEFAULT} from '../src/constants/entrypoint.js';
import {TRANSPORT_DEFAULT} from '../src/constants/transport.js';

const payload = {
  restApiPort: ENTRYPOINT_DEFAULT.REST_API_PORT,
  adminPort: ADMIN_DEFAULT.WEBSOCKET_PORT,
  transportWebSocketPort: TRANSPORT_DEFAULT.WS_PORT,
  localhost: ENTRYPOINT_DEFAULT.LOCALHOST,
};

process.stdout.write(`${JSON.stringify(payload)}\n`);
