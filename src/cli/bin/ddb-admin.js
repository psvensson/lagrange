#!/usr/bin/env node
/**
 * DDB Admin CLI - Terminal-based administration tool for the distributed database
 * Entry point for the CLI application
 */

import {AdminCLI} from '../index.js';

const cli = new AdminCLI();
cli.start(process.argv.slice(2)).catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
