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

const LOCAL_STR_EMPTY = '';
const LOCAL_STR_OPTIONS = 'Options:';
const LOCAL_STR_1Q7C4 = 'Environment Variables:';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_INDEX_JS = './index.js';
const LOCAL_STR_VR8ST = 'ERR_UNKNOWN_BUILTIN_MODULE';
const LOCAL_NUM_ONE = 1;

const VERSION = ENTRYPOINT_VERSION;

/**
 * Check for version flag.
 * @return {boolean} True if version was printed
 */
function checkVersionFlag() {
  const args = process.argv.slice(2);
  if (args.includes(ENTRYPOINT_FLAG.VERSION_LONG) || args.includes(ENTRYPOINT_FLAG.VERSION_SHORT)) {
    console.log(ENTRYPOINT_TEXT.versionLine(VERSION));
    return true;
  }
  if (args.includes(ENTRYPOINT_FLAG.HELP_LONG) || args.includes(ENTRYPOINT_FLAG.HELP_SHORT)) {
    console.log(ENTRYPOINT_TEXT.headerLine(VERSION));
    console.log(LOCAL_STR_EMPTY);
    console.log(ENTRYPOINT_TEXT.USAGE_LINE);
    console.log(LOCAL_STR_EMPTY);
    console.log(LOCAL_STR_OPTIONS);
    for (const line of ENTRYPOINT_TEXT.OPTIONS_LINES) {
      console.log(line);
    }
    console.log(LOCAL_STR_EMPTY);
    console.log(LOCAL_STR_1Q7C4);
    for (const line of ENTRYPOINT_TEXT.ENVIRONMENT_LINES) {
      console.log(line);
    }
    return true;
  }
  return false;
}

// Handle version/help flags early
if (checkVersionFlag()) {
  process.exit(LOCAL_NUM_ZERO);
}

// Load the main module (this will fail if native modules are not available)
import(LOCAL_STR_INDEX_JS).catch((err) => {
  if (err.code === LOCAL_STR_VR8ST) {
    console.error(ENTRYPOINT_TEXT.SEA_NATIVE_ERROR);
    console.error(LOCAL_STR_EMPTY);
    for (const line of ENTRYPOINT_TEXT.SEA_NATIVE_HELP) {
      console.error(line);
    }
    console.error(LOCAL_STR_EMPTY);
    for (const line of ENTRYPOINT_TEXT.SEA_RUN_INSTRUCTIONS) {
      console.error(line);
    }
    process.exit(LOCAL_NUM_ONE);
  }
  console.error(`${ENTRYPOINT_TEXT.FATAL_ERROR_PREFIX}`, err);
  process.exit(LOCAL_NUM_ONE);
});
