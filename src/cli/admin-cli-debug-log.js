import fs from 'fs';
import {CLI_ENV, CLI_PATH} from './cli-constants.js';

const DEBUG_LOG = process.env[CLI_ENV.DEBUG] === CLI_ENV.DEBUG_ENABLED_VALUE;
const debugLog = (msg) => {
  if (DEBUG_LOG) {
    fs.appendFileSync(CLI_PATH.DEBUG_LOG_FILE, `${new Date().toISOString()} ${msg}\n`);
  }
};

export {debugLog};
