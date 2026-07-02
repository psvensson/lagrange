#!/usr/bin/env node
/**
 * DDB Admin CLI - Terminal-based administration tool for the distributed database
 * Entry point for the CLI application
 */

import {AdminCLI} from '../index.js';

const LOCAL_STR_FATAL_ERROR = 'Fatal error:';

const cli = new AdminCLI();
cli.start(process.argv.slice(2)).catch((err) => {
  console.error(LOCAL_STR_FATAL_ERROR, err.message);
  process.exit(1);
});
