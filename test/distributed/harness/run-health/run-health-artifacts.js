/**
 * Run health artefacts: reads one scenario directory's inputs, classifies
 * them and writes `run-health.json` and `run-health.md` beside them.
 *
 * Inputs, all optional and each reported when absent:
 *   samples.ndjson              the run's resource samples
 *   node-health.json            collectClusterHealth's answer at run end
 *   ../.full-logs/<scenario>/   the complete per-node logs (ground truth)
 *   <nodeId>.log                the curated playback logs, read only when
 *                               the complete logs are absent
 *   link-baseline.json          the lab adapter's pre/post-run link baseline
 */

import {createReadStream, existsSync} from 'node:fs';
import {appendFile, readFile, readdir, writeFile} from 'node:fs/promises';
import {basename, dirname, join} from 'node:path';
import {createInterface} from 'node:readline';
import {createGunzip} from 'node:zlib';
import {LINK_BASELINE_ENV, RUN_HEALTH_ARTIFACT} from './run-health-constants.js';
import {
  createRunHealthEvidence,
  ingestClusterHealth,
  ingestNodeLogLine,
} from './run-health-evidence.js';
import {classifyRunHealth} from './run-health-classifier.js';
import {renderRunHealthMarkdown} from './run-health-markdown.js';
import {
  arrayFilter,
  arrayMap,
  stringEndsWith,
  stringSplit,
} from './captured-intrinsics.js';

const TEXT_ENCODING = 'utf8';
const LINE_BREAK = '\n';
const JSON_INDENT = 2;
const NODE_HEALTH_FILENAME = 'node-health.json';
// Beside a run's link baseline file: the scenario directories that were
// classified against it before its post-run phase existed.
const LINK_BASELINE_CONSUMERS_SUFFIX = '.consumers';
const LOG_SOURCE = Object.freeze({FULL: 'full_log', PLAYBACK: 'playback_log'});
// A node log is named by its node id; the merged timeline and other
// underscore-prefixed logs are not node logs.
const NODE_LOG_NAME = /^[0-9a-f][0-9a-f-]+$/u;

async function readJsonIfPresent(path) {
  return existsSync(path) ? JSON.parse(await readFile(path, TEXT_ENCODING)) : null;
}

async function readSamples(scenarioDir) {
  const path = join(scenarioDir, RUN_HEALTH_ARTIFACT.SAMPLES);
  if (!existsSync(path)) return [];
  return arrayMap(arrayFilter(stringSplit(await readFile(path, TEXT_ENCODING), LINE_BREAK),
    (line) => line.length > 0),
  (line) => JSON.parse(line));
}

async function listNodeLogs(directory, suffix) {
  if (!existsSync(directory)) return [];
  return arrayMap(arrayFilter(await readdir(directory), (name) => stringEndsWith(name, suffix) &&
      NODE_LOG_NAME.test(name.slice(0, -suffix.length))),
  (name) => ({nodeId: name.slice(0, -suffix.length), path: join(directory, name)}));
}

async function ingestLogFile(evidence, {nodeId, path}, compressed) {
  const file = createReadStream(path);
  const input = compressed ? file.pipe(createGunzip()) : file;
  // A read error on the file must end the line reader, not hang it.
  file.on('error', (error) => input.destroy(error));
  for await (const line of createInterface({input, crlfDelay: Infinity})) {
    ingestNodeLogLine(evidence, nodeId, line);
  }
}

async function ingestNodeLogs(evidence, scenarioDir) {
  const fullDirectory = join(dirname(scenarioDir),
    RUN_HEALTH_ARTIFACT.FULL_LOG_DIRECTORY, basename(scenarioDir));
  const fullLogs = await listNodeLogs(fullDirectory, RUN_HEALTH_ARTIFACT.FULL_LOG_SUFFIX);
  const complete = fullLogs.length > 0;
  const logs = complete ? fullLogs :
    await listNodeLogs(scenarioDir, RUN_HEALTH_ARTIFACT.PLAYBACK_LOG_SUFFIX);
  for (const log of logs) {
    let readError = null;
    try {
      await ingestLogFile(evidence, log, complete);
    } catch (error) {
      readError = String(error.message);
    }
    const node = evidence.nodes.get(log.nodeId);
    if (node === undefined) continue;
    node.logSource = complete ? LOG_SOURCE.FULL : LOG_SOURCE.PLAYBACK;
    // A log that could not be read to its end proves nothing by omission.
    node.logIsComplete = complete && readError === null;
    node.logReadError = readError;
  }
}

/**
 * Classify one scenario directory.
 * @param {Object} options
 * @param {string} options.scenarioDir - <outputDir>/<scenario>.
 * @param {string|null} [options.linkBaselinePath] - A link baseline file to
 *   use when the scenario directory holds none.
 * @return {Promise<Object>} The `runHealth` section.
 */
async function buildScenarioRunHealth({scenarioDir, linkBaselinePath = null}) {
  const evidence = createRunHealthEvidence();
  await ingestNodeLogs(evidence, scenarioDir);
  const clusterHealth = await readJsonIfPresent(join(scenarioDir, NODE_HEALTH_FILENAME));
  if (clusterHealth !== null) ingestClusterHealth(evidence, clusterHealth);
  const ownBaseline = join(scenarioDir, RUN_HEALTH_ARTIFACT.LINK_BASELINE);
  const useRunBaseline = !existsSync(ownBaseline) && linkBaselinePath !== null &&
    existsSync(linkBaselinePath);
  const linkBaseline = await readJsonIfPresent(useRunBaseline ? linkBaselinePath : ownBaseline);
  if (useRunBaseline) {
    await appendFile(`${linkBaselinePath}${LINK_BASELINE_CONSUMERS_SUFFIX}`,
      `${scenarioDir}${LINE_BREAK}`, TEXT_ENCODING);
  }
  return classifyRunHealth({
    samples: await readSamples(scenarioDir),
    evidence,
    linkBaseline,
  });
}

/**
 * Classify a scenario directory and write its run-health artefacts.
 * @param {Object} options - As buildScenarioRunHealth.
 * @return {Promise<Object>} The `runHealth` section written.
 */
async function writeScenarioRunHealth(options) {
  const runHealth = await buildScenarioRunHealth(options);
  await writeFile(join(options.scenarioDir, RUN_HEALTH_ARTIFACT.JSON),
    `${JSON.stringify(runHealth, null, JSON_INDENT)}${LINE_BREAK}`, TEXT_ENCODING);
  await writeFile(join(options.scenarioDir, RUN_HEALTH_ARTIFACT.MARKDOWN),
    renderRunHealthMarkdown(runHealth), TEXT_ENCODING);
  return runHealth;
}

/**
 * The scenario directories classified against a run's link baseline file.
 * @param {string} linkBaselinePath
 * @return {Promise<Array<string>>}
 */
async function linkBaselineConsumers(linkBaselinePath) {
  const path = `${linkBaselinePath}${LINK_BASELINE_CONSUMERS_SUFFIX}`;
  if (!existsSync(path)) return [];
  return [...new Set(arrayFilter(stringSplit(await readFile(path, TEXT_ENCODING), LINE_BREAK),
    (line) => line.length > 0))];
}

/**
 * The link baseline file the lab adapter named for this run, if any.
 * @param {Object} [environment]
 * @return {string|null}
 */
function linkBaselinePathFromEnvironment(environment = process.env) {
  const path = environment[LINK_BASELINE_ENV];
  return typeof path === 'string' && path.length > 0 ? path : null;
}

export {
  NODE_HEALTH_FILENAME,
  buildScenarioRunHealth,
  linkBaselineConsumers,
  linkBaselinePathFromEnvironment,
  writeScenarioRunHealth,
};
