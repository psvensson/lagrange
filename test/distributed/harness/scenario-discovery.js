/**
 * Scenario discovery for the distributed testing framework.
 * Scans a directory for JS modules exporting a `run(cluster)` function.
 * Supports filtering by scenario name.
 */

import {readdir} from 'node:fs/promises';
import {join, basename, extname} from 'node:path';

const JS_EXTENSION = '.js';
const DEFAULT_SCENARIOS_DIR = 'test/distributed/scenarios';

/**
 * Discover scenario modules in the given directory.
 * Each scenario is a JS file exporting a `run(cluster)` function.
 * @param {string} [scenariosDir] - Directory to scan
 * @returns {Promise<Array<{name: string, path: string}>>}
 */
async function discoverScenarios(scenariosDir) {
  const dir = scenariosDir || DEFAULT_SCENARIOS_DIR;
  const entries = await readdir(dir);
  const scenarios = entries
    .filter((entry) => extname(entry) === JS_EXTENSION)
    .map((entry) => ({
      name: basename(entry, JS_EXTENSION),
      path: join(dir, entry),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return scenarios;
}

/**
 * Filter scenarios by name pattern.
 * @param {Array<{name: string, path: string}>} scenarios
 * @param {string} filter - Scenario name to match
 * @returns {Array<{name: string, path: string}>}
 */
function filterScenarios(scenarios, filter) {
  if (!filter) {
    return scenarios;
  }
  return scenarios.filter((s) => s.name.includes(filter));
}

export {discoverScenarios, filterScenarios, DEFAULT_SCENARIOS_DIR};
