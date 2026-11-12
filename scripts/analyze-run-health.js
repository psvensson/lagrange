#!/usr/bin/env node

// Run health of one distributed scenario directory, from its own artefacts.
//
// Reads the directory's resource samples, node logs, collected node health
// and link baseline, classifies them and prints the run-health summary. It
// reads files only: it starts no cluster, runs no lab command and contacts
// no host. With --write it also writes run-health.json and run-health.md
// into the scenario directory.
//
// Usage:
//   npm run analyze:run-health -- --scenario-dir <outputDir>/<scenario>
//       [--link-baseline <file>] [--json] [--write]

import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  buildScenarioRunHealth,
  writeScenarioRunHealth,
} from '../test/distributed/harness/run-health/run-health-artifacts.js';
import {
  renderRunHealthMarkdown,
} from '../test/distributed/harness/run-health/run-health-markdown.js';

const FLAG = Object.freeze({
  SCENARIO_DIR: '--scenario-dir',
  LINK_BASELINE: '--link-baseline',
  JSON: '--json',
  WRITE: '--write',
});
const JSON_INDENT = 2;
const USAGE = 'usage: analyze-run-health --scenario-dir <dir> ' +
  '[--link-baseline <file>] [--json] [--write]\n';

function valueOf(argv, flag) {
  const at = argv.indexOf(flag);
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null;
}

/**
 * @param {Array<string>} argv
 * @param {Function} write - (text) => void for the result.
 * @return {Promise<number>} The exit code: 0 when classified, 2 on usage.
 */
async function main(argv, write = (text) => process.stdout.write(text)) {
  const scenarioDir = valueOf(argv, FLAG.SCENARIO_DIR);
  if (scenarioDir === null) {
    process.stderr.write(USAGE);
    return 2;
  }
  const linkBaseline = valueOf(argv, FLAG.LINK_BASELINE);
  const options = {
    scenarioDir: resolve(scenarioDir),
    linkBaselinePath: linkBaseline === null ? null : resolve(linkBaseline),
  };
  const runHealth = argv.includes(FLAG.WRITE) ?
    await writeScenarioRunHealth(options) :
    await buildScenarioRunHealth(options);
  write(argv.includes(FLAG.JSON) ?
    `${JSON.stringify(runHealth, null, JSON_INDENT)}\n` :
    renderRunHealthMarkdown(runHealth));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}

export {main};
