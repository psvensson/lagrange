#!/usr/bin/env node
/**
 * DDB Admin CLI - Terminal-based administration tool for the distributed database
 * Entry point for the CLI application
 */

import {AdminCLI} from '../index.js';

const LOCAL_NUM_TWO = 2;
const LOCAL_STR_FATAL_ERROR = 'Fatal error:';
const LOCAL_NUM_ONE = 1;

const cli = new AdminCLI();
cli.start(process.argv.slice(LOCAL_NUM_TWO)).catch((err) => {
  console.error(LOCAL_STR_FATAL_ERROR, err.message);
  process.exit(LOCAL_NUM_ONE);
});
