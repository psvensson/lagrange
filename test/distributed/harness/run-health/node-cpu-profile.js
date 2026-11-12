/**
 * Opt-in CPU profile of ONE node of a distributed run.
 *
 * `--profile-node seed` (or a node index) makes the harness start that one
 * node with Node's own sampling profiler (`--cpu-prof`, through
 * NODE_OPTIONS, which the image's `node src/index.js` entrypoint honours),
 * and collects the `.cpuprofile` the node writes when it exits into the run
 * artefacts: `<outputDir>/.cpu-profiles/<scenario>/<nodeId>.<file>`. Off by
 * default; no other node is touched.
 *
 * Node writes the profile when the process exits, so it exists only after
 * the node stopped gracefully (the harness's teardown SIGTERM, or a restart
 * a scenario performs). A node that was killed leaves none, and a reused
 * container that is never stopped leaves none; both are reported as a named
 * absence. The profiler samples every 10 ms rather than Node's 1 ms default
 * to keep a ten-minute profile at a few megabytes, because a lab run copies
 * it over the household Wi-Fi.
 *
 * It cannot run under the solve probe mark: the cluster factory refuses to
 * build any cluster there, and without a cluster no node is started.
 */

import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  arrayFilter, arrayMap, stringEndsWith, stringSplit, stringTrim,
} from './captured-intrinsics.js';

const PROFILE_NODE_SEED = 'seed';
const SEED_NODE_INDEX = 0;
const NODE_OPTIONS_ENV_KEY = 'NODE_OPTIONS';
const CPU_PROFILE_CONTAINER_DIR = '/tmp/lagrange-cpu-profile';
const CPU_PROFILE_INTERVAL_MICROSECONDS = 10000;
const CPU_PROFILE_NODE_OPTIONS = `--cpu-prof --cpu-prof-dir=${CPU_PROFILE_CONTAINER_DIR} ` +
  `--cpu-prof-interval=${CPU_PROFILE_INTERVAL_MICROSECONDS}`;
const CPU_PROFILE_SUFFIX = '.cpuprofile';
const CPU_PROFILE_OUTPUT_DIRECTORY = '.cpu-profiles';
const CPU_PROFILE_STATE = Object.freeze({COLLECTED: 'collected', UNAVAILABLE: 'unavailable'});
const CPU_PROFILE_UNAVAILABLE_REASON = Object.freeze({
  NO_PROFILE_IN_CONTAINER: 'node_wrote_no_profile',
  ARCHIVE_FAILED: 'container_archive_failed',
});
const INDEX_PATTERN = /^\d+$/u;
const OPTION_SEPARATOR = ' ';
const PATH_SEPARATOR = '/';
const TAR_BLOCK_BYTES = 512;
const TAR_FIELD = Object.freeze({
  NAME: Object.freeze([0, 100]),
  SIZE: Object.freeze([124, 136]),
  TYPE: Object.freeze([156, 157]),
  PREFIX: Object.freeze([345, 500]),
});
const TAR_REGULAR_FILE_TYPES = Object.freeze(new Set(['0', '\0', '']));
const OCTAL_RADIX = 8;
const NUL = '\0';
const LATIN1 = 'latin1';

/**
 * The node index a `--profile-node` value names.
 * @param {string|null|undefined} profileNode - `seed` or a node index.
 * @return {number|null} Null when no node is profiled.
 */
function profiledNodeIndex(profileNode) {
  if (profileNode === null || profileNode === undefined) return null;
  const value = String(profileNode);
  if (value === PROFILE_NODE_SEED) return SEED_NODE_INDEX;
  if (INDEX_PATTERN.test(value)) return Number(value);
  throw new Error(`--profile-node takes \`seed\` or a node index, got ${JSON.stringify(value)}`);
}

/**
 * The environment that starts a node under the CPU profiler, or nothing.
 * The profiled node id is remembered on the cluster for collection.
 * @param {Object} cluster - The cluster (its `_config.cpuProfileNode`).
 * @param {string} nodeId
 * @param {number} nodeIndex
 * @param {Object} env - The node environment built so far.
 * @return {Object} Entries to add to the node's environment.
 */
function cpuProfileEnvFor(cluster, nodeId, nodeIndex, env) {
  if (profiledNodeIndex(cluster._config?.cpuProfileNode) !== nodeIndex) return {};
  cluster._cpuProfiledNodeIds = new Set([...(cluster._cpuProfiledNodeIds ?? []), nodeId]);
  const existing = env[NODE_OPTIONS_ENV_KEY];
  return {[NODE_OPTIONS_ENV_KEY]: typeof existing === 'string' && existing.length > 0 ?
    [existing, CPU_PROFILE_NODE_OPTIONS].join(OPTION_SEPARATOR) : CPU_PROFILE_NODE_OPTIONS};
}

function tarText(block, [start, end]) {
  return stringSplit(block.toString(LATIN1, start, end), NUL)[0];
}

/**
 * The regular files of a tar archive (ustar; the Docker archive endpoint).
 * @param {Buffer} archive
 * @return {Array<{name: string, data: Buffer}>}
 */
function readTarFiles(archive) {
  const files = [];
  let offset = 0;
  while (offset + TAR_BLOCK_BYTES <= archive.length) {
    const header = archive.subarray(offset, offset + TAR_BLOCK_BYTES);
    const name = tarText(header, TAR_FIELD.NAME);
    if (name.length === 0) break;
    const size = Number.parseInt(stringTrim(tarText(header, TAR_FIELD.SIZE)), OCTAL_RADIX) || 0;
    const prefix = tarText(header, TAR_FIELD.PREFIX);
    const dataStart = offset + TAR_BLOCK_BYTES;
    if (TAR_REGULAR_FILE_TYPES.has(tarText(header, TAR_FIELD.TYPE))) {
      files.push({
        name: prefix.length > 0 ? `${prefix}${PATH_SEPARATOR}${name}` : name,
        data: archive.subarray(dataStart, dataStart + size),
      });
    }
    offset = dataStart + Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
  }
  return files;
}

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function unavailable(nodeId, reason, detail) {
  return {nodeId, state: CPU_PROFILE_STATE.UNAVAILABLE, reason, detail};
}

async function collectNodeCpuProfile({nodeId, node, directory}) {
  let archive = null;
  try {
    archive = await readStream(await node._dockerProvider.getContainerArchive(
      node.containerId, CPU_PROFILE_CONTAINER_DIR));
  } catch (error) {
    // Docker answers 404 when the directory was never created: the node did
    // not exit through Node's own exit path.
    return unavailable(nodeId, error?.statusCode === 404 ?
      CPU_PROFILE_UNAVAILABLE_REASON.NO_PROFILE_IN_CONTAINER :
      CPU_PROFILE_UNAVAILABLE_REASON.ARCHIVE_FAILED, String(error?.message ?? error));
  }
  const profiles = arrayFilter(readTarFiles(archive),
    (file) => stringEndsWith(file.name, CPU_PROFILE_SUFFIX));
  if (profiles.length === 0) {
    return unavailable(nodeId, CPU_PROFILE_UNAVAILABLE_REASON.NO_PROFILE_IN_CONTAINER,
      'the profile directory holds no .cpuprofile');
  }
  await mkdir(directory, {recursive: true});
  const paths = [];
  for (const profile of profiles) {
    const basename = stringSplit(profile.name, PATH_SEPARATOR).at(-1);
    const path = join(directory, `${nodeId}.${basename}`);
    await writeFile(path, profile.data);
    paths.push(path);
  }
  return {nodeId, state: CPU_PROFILE_STATE.COLLECTED, paths};
}

/**
 * After the nodes stopped and before their containers are removed: copy
 * every profiled node's `.cpuprofile` files into the run artefacts.
 * @param {Object} cluster - The cluster being torn down.
 * @param {Array<Array>} nodes - [nodeId, node] entries.
 * @param {Function} [write] - (text) => void for the outcome lines.
 * @return {Promise<Array<Object>>} One outcome per profiled node.
 */
async function collectCpuProfiles(cluster, nodes,
  write = (text) => process.stdout.write(text)) {
  const profiled = cluster._cpuProfiledNodeIds;
  if (profiled === undefined || profiled.size === 0) return [];
  const directory = join(String(cluster._config.outputDir), CPU_PROFILE_OUTPUT_DIRECTORY,
    String(cluster._scenarioName));
  const outcomes = [];
  for (const [nodeId, node] of arrayFilter(nodes, ([id]) => profiled.has(id))) {
    const outcome = await collectNodeCpuProfile({nodeId, node, directory});
    outcomes.push(outcome);
    write(outcome.state === CPU_PROFILE_STATE.COLLECTED ?
      `[harness] CPU profile of node ${nodeId}: ${arrayMap(outcome.paths,
        (path) => path).join(OPTION_SEPARATOR)} ` +
        '(summarize: npm run analyze:cpu-profile -- <file>)\n' :
      `[harness] CPU profile of node ${nodeId} unavailable: ${outcome.reason} ` +
        `(${outcome.detail})\n`);
  }
  return outcomes;
}

export {
  CPU_PROFILE_NODE_OPTIONS,
  CPU_PROFILE_STATE,
  CPU_PROFILE_UNAVAILABLE_REASON,
  collectCpuProfiles,
  cpuProfileEnvFor,
  profiledNodeIndex,
  readTarFiles,
};
