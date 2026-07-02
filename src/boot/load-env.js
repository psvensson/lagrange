/**
 * Loads a `.env` file from the current working directory into process.env.
 *
 * This module must remain the FIRST static import of the entrypoint: ESM
 * import hoisting evaluates every imported module before any entrypoint body
 * code runs, and some modules read process.env at import time, so a plain
 * function call in main() would fire too late. The SEA binary inherits this
 * automatically because sea-entry.js imports index.js.
 *
 * Variables already present in the shell environment take precedence —
 * process.loadEnvFile never overrides an existing variable, it only fills
 * unset ones. The `.env` path resolves against the working directory, not
 * the location of the binary or this file.
 */

import {existsSync} from 'node:fs';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
