#!/usr/bin/env node
import {ENTRYPOINT_DEFAULT} from '../src/constants/entrypoint.js';

const defaults = {
  restApiPort: ENTRYPOINT_DEFAULT.REST_API_PORT,
  adminPort: ENTRYPOINT_DEFAULT.ADMIN_PORT,
  wsPortOffset: ENTRYPOINT_DEFAULT.WS_PORT_OFFSET,
  localhost: ENTRYPOINT_DEFAULT.LOCALHOST,
};

process.stdout.write(JSON.stringify(defaults));