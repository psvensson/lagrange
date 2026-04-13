/**
 * Scenario discovery for the distributed testing framework.
 * Scans a directory for JS modules exporting a `run(cluster)` function.
 * Supports filtering by scenario name.
 */

import {readdir} from 'node:fs/promises';
import {join, basename, extname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const JS_EXTENSION = '.js';
const DEFAULT_SCENARIOS_DIR = 'test/distributed/scenarios';

async function loadScenarioModule(scenarioPath) {
  const scenarioUrl = pathToFileURL(resolve(scenarioPath)).href;
  return import(scenarioUrl);
}

function isRunnableScenarioModule(module) {
  return typeof module?.run === 'function';
}

/**
 * Discover scenario modules in the given directory.
 * Each scenario is a JS file exporting a `run(cluster)` function.
 * @param {string} [scenariosDir] - Directory to scan
 * @param {{
 *   loadScenarioModule?: Function,
 * }} [options]
 * @returns {Promise<Array<{name: string, path: string}>>}
 */
async function discoverScenarios(scenariosDir, options = {}) {
  const dir = scenariosDir || DEFAULT_SCENARIOS_DIR;
  const scenarioModuleLoader =
    typeof options.loadScenarioModule === 'function' ?
      options.loadScenarioModule :
      loadScenarioModule;
  const entries = await readdir(dir);
  const candidateScenarios = entries
    .filter((entry) => extname(entry) === JS_EXTENSION)
    .map((entry) => ({
      name: basename(entry, JS_EXTENSION),
      path: join(dir, entry),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const loadedScenarios = await Promise.all(candidateScenarios.map(
    async (scenario) => {
      const scenarioModule = await scenarioModuleLoader(scenario.path);
      return {
        ...scenario,
        runnable: isRunnableScenarioModule(scenarioModule),
      };
    },
  ));

  return loadedScenarios
    .filter((scenario) => scenario.runnable === true)
    .map(({runnable: _runnable, ...scenario}) => scenario);
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

export {
  discoverScenarios,
  filterScenarios,
  DEFAULT_SCENARIOS_DIR,
  isRunnableScenarioModule,
};
