/**
 * Isolated NODE_OPTIONS helper for test child processes that clear inherited
 * runner flags while preserving census preload instrumentation when active
 * (scripts/checks/census-pre-kill-flush.js owns pre-kill coverage flushes).
 */
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {
  CENSUS_COVERAGE_DIR_ENV,
  PRELOAD_MODULE_RELATIVE,
} from '../../scripts/checks/fallback-branch-census-constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMPORT_FLAG = '--import=';
const EMPTY_OPTIONS = '';

/**
 * NODE_OPTIONS for a test child that clears inherited runner flags: empty
 * outside census collection, and only the census preload import under it.
 * @param {Object} [env]
 * @return {string}
 */
export function isolatedCensusNodeOptions(env = process.env) {
  if (!env[CENSUS_COVERAGE_DIR_ENV]) return EMPTY_OPTIONS;
  return `${IMPORT_FLAG}${pathToFileURL(path.resolve(ROOT, PRELOAD_MODULE_RELATIVE)).href}`;
}
