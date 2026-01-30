#!/usr/bin/env node
/**
 * Single Executable Application Entry Point
 *
 * This entry point handles version/help flags before loading the main module,
 * allowing the SEA to respond to basic commands without requiring native modules.
 */

import {
  ENTRYPOINT_TEXT,
  ENTRYPOINT_VERSION,
  ENTRYPOINT_FLAG,
} from './constants/entrypoint.js';

const VERSION = ENTRYPOINT_VERSION;

/**
 * Check for version flag.
 * @return {boolean} True if version was printed
 */
function checkVersionFlag() {
  const args = process.argv.slice(2);
  if (args.includes(ENTRYPOINT_FLAG.VERSION_LONG) || args.includes(ENTRYPOINT_FLAG.VERSION_SHORT)) {
    console.log(ENTRYPOINT_TEXT.VERSION_LINE(VERSION));
    return true;
  }
  if (args.includes(ENTRYPOINT_FLAG.HELP_LONG) || args.includes(ENTRYPOINT_FLAG.HELP_SHORT)) {
    console.log(ENTRYPOINT_TEXT.HEADER_LINE(VERSION));
    console.log('');
    console.log(ENTRYPOINT_TEXT.USAGE_LINE);
    console.log('');
    console.log('Options:');
    for (const line of ENTRYPOINT_TEXT.OPTIONS_LINES) {
      console.log(line);
    }
    console.log('');
    console.log('Environment Variables:');
    for (const line of ENTRYPOINT_TEXT.ENVIRONMENT_LINES) {
      console.log(line);
    }
    return true;
  }
  return false;
}

// Handle version/help flags early
if (checkVersionFlag()) {
  process.exit(0);
}

// Load the main module (this will fail if native modules are not available)
import('./index.js').catch((err) => {
  if (err.code === 'ERR_UNKNOWN_BUILTIN_MODULE') {
    console.error(ENTRYPOINT_TEXT.SEA_NATIVE_ERROR);
    console.error('');
    for (const line of ENTRYPOINT_TEXT.SEA_NATIVE_HELP) {
      console.error(line);
    }
    console.error('');
    for (const line of ENTRYPOINT_TEXT.SEA_RUN_INSTRUCTIONS) {
      console.error(line);
    }
    process.exit(1);
  }
  console.error(`${ENTRYPOINT_TEXT.FATAL_ERROR_PREFIX}`, err);
  process.exit(1);
});
