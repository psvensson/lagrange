/**
 * Log Collector — collects cluster logs via live query subscription
 * to the `logs` system table. Falls back to Docker container
 * stdout/stderr when the cluster is unreachable.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import {join, relative} from 'node:path';
import {
  OUTPUT,
  LOG_SUBSCRIPTION_CAPABILITY,
  CONTAINER_LOG_TAIL_LINES,
} from './constants.js';

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySort = Function.call.bind(Array.prototype.sort);
const dateToIsoString = Function.call.bind(Date.prototype.toISOString);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringLastIndexOf = Function.call.bind(String.prototype.lastIndexOf);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

// --- Earlier-run archive ----------------------------------------------------
// Every run of a scenario under one output root shares {outputDir}/{scenario}
// and {outputDir}/.full-logs/{scenario} (scripts/lab/harness.js passes no
// --output). A starting run must not read an earlier run's files as its own
// evidence, and must never destroy them either, so at cluster start the
// earlier run's artifacts MOVE, as one unit, into
//   {outputDir}/{scenario}/.previous-<earlier run start, ISO, ':' -> '-'>/
// holding every top-level entry of the scenario dir (curated *.log,
// _timeline.log, _analysis.json, events/samples/snapshots.ndjson, the
// playback manifest and viewer, debug-trace files, failure-bundle.* and
// triage-summary.*) plus the scenario's full-log dir as <archive>/.full-logs/
// (moved by the caller's archiveFullLogs hook: full-node-log-capture.js).
// Nothing of the starting run exists yet: Cluster.start archives before the
// playback recorder, the trace recorder or any node log capture starts.
// Layout: one self-contained dir per run, so one bound prunes curated and
// full logs together, and a reader that lists the current scenario dir's
// files (the failure bundle's readdir) or globs `.full-logs/*/` sees only
// the current run. Run start: the earlier run's first playback event (the
// recorder's cluster.start), else the earliest mtime of its entries.
// Bundle resolution: every path string inside the archived *.json / *.md
// artifacts (failure-bundle, triage-summary, playback manifest) is rewritten
// to its archived location, and archive.json records each original ->
// archived move (relative to the output root), so the bundle a human finds
// for an earlier run (in its archive) points at readable files of that run.
// Disk bound: ARCHIVED_SCENARIO_RUNS_KEPT archives per scenario; the oldest
// beyond the bound is deleted. That pruning is the only removal of an
// earlier run's evidence, and it is by age, never by a starting run's reset.
// It is never silent: the archive step logs it, and the new archive.json
// names the pruned archives (prunedArchives) and any partial archive (no
// archive.json, a crash mid-archive; partialArchives) that counts toward
// the bound.
const ARCHIVED_SCENARIO_RUNS_KEPT = 3;
const RUN_ARCHIVE_PREFIX = '.previous-';
const RUN_ARCHIVE_MANIFEST_FILENAME = 'archive.json';
const RUN_ARCHIVE_MANIFEST_SCHEMA_VERSION = 1;
const RUN_ARCHIVE_NAME_ATTEMPTS = 100;
const RUN_ARCHIVE_PATH_REWRITE_EXTENSIONS = Object.freeze(['.json', '.md']);
const RUN_START_SOURCE_EVENTS = OUTPUT.PLAYBACK_EVENTS_FILENAME;
const RUN_START_SOURCE_MTIME = 'mtime';
const RUN_START_SOURCE_ARCHIVE_TIME = 'archive-time';
const RUN_START_PROBE_BYTES = 65536;
const ISO_TIME_SEPARATOR = ':';
const ARCHIVE_NAME_TIME_SEPARATOR = '-';
const PATH_SEPARATOR = '/';
const PATH_TOKEN_PATTERN = /[^\s"'`()<>[\],]+/gu;
const ERROR_CODE_EXISTS = 'EEXIST';
const JSON_INDENT = 2;

const LIVE_SELECT_PREFIX = 'LIVE SELECT * FROM logs';
const FINAL_SNAPSHOT_QUERY = 'SELECT * FROM logs ORDER BY timestamp';
const WHERE_CLAUSE = ' WHERE ';
const LOG_FILE_EXTENSION = '.log';
const NEWLINE = '\n';
const ZERO = 0;
const DEFAULT_LEVEL = 'info';
const FIELD_LOG_ID = 'log_id';
const FIELD_NODE_ID = 'node_id';
const FIELD_NODE_ID_ALT = 'nodeId';
const FIELD_LEVEL = 'level';
const FIELD_MESSAGE = 'message';
const FIELD_TIMESTAMP = 'timestamp';
const FIELD_SOURCE = 'source';
const SOURCE_CONTAINER = 'container';
const SOURCE_LIVE_STREAM = 'live';
const RESULT_ROWS = 'rows';
const RESULT_RESULTS = 'results';
const ENCODING_LATIN1 = 'latin1';
const ENCODING_UTF8 = 'utf8';
const DOCKER_LOG_FRAME_HEADER_BYTES = 8;
const DOCKER_LOG_FRAME_LENGTH_OFFSET = 4;
const DOCKER_LOG_FRAME_PADDING_OFFSET = 1;
const DOCKER_LOG_FRAME_PADDING_LENGTH = 3;
const DOCKER_LOG_STREAM_STDOUT = 1;
const DOCKER_LOG_STREAM_STDERR = 2;
const DOCKER_LOG_OPTION_RAW_BUFFER = 'rawBuffer';
const DOCKER_LOG_OPTION_TAIL = 'tail';
const LIVE_SELECT_UNSUPPORTED_TOKEN_SYNTAX = 'syntax';
const LIVE_SELECT_UNSUPPORTED_TOKEN_PARSE = 'parse';
const DEFAULT_LOG_SUBSCRIPTION_CAPABILITIES = Object.freeze({
  [LOG_SUBSCRIPTION_CAPABILITY.STREAM_EVENTS]: false,
  [LOG_SUBSCRIPTION_CAPABILITY.LIVE_SELECT_QUERY]: true,
});

// The earlier run's first playback event is the recorder's cluster.start,
// written when that run's cluster started; only the first line is read.
async function readFirstPlaybackEventTimestamp(eventsPath) {
  let handle = null;
  try {
    handle = await open(eventsPath, 'r');
    const probe = Buffer.alloc(RUN_START_PROBE_BYTES);
    const {bytesRead} = await handle.read(probe, ZERO, RUN_START_PROBE_BYTES,
      ZERO);
    const text = probe.toString(ENCODING_UTF8, ZERO, bytesRead);
    const lineEnd = stringIndexOf(text, NEWLINE);
    const firstLine = lineEnd >= ZERO ? stringSlice(text, ZERO, lineEnd) : text;
    const timestamp = JSON.parse(firstLine)?.timestamp;
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch (_unreadable) {
    return null;
  } finally {
    await handle?.close();
  }
}

async function earliestEntryMtime(scenarioDir, names) {
  let earliest = null;
  for (const name of names) {
    try {
      const {mtimeMs} = await stat(join(scenarioDir, name));
      earliest = earliest === null ? mtimeMs : Math.min(earliest, mtimeMs);
    } catch (_vanished) {
      // An entry that vanished has no time to offer.
    }
  }
  return earliest;
}

async function determineEarlierRunStart(scenarioDir, names) {
  const fromEvents = await readFirstPlaybackEventTimestamp(
    join(scenarioDir, OUTPUT.PLAYBACK_EVENTS_FILENAME));
  if (fromEvents !== null) {
    return {at: fromEvents, source: RUN_START_SOURCE_EVENTS};
  }
  const fromMtime = await earliestEntryMtime(scenarioDir, names);
  if (fromMtime !== null) {
    return {at: Math.floor(fromMtime), source: RUN_START_SOURCE_MTIME};
  }
  return {at: Date.now(), source: RUN_START_SOURCE_ARCHIVE_TIME};
}

function runArchiveBaseName(runStartMs) {
  return RUN_ARCHIVE_PREFIX + stringReplaceAll(
    dateToIsoString(new Date(runStartMs)), ISO_TIME_SEPARATOR,
    ARCHIVE_NAME_TIME_SEPARATOR);
}

// Creates the archive dir; a name already taken (two runs that started in
// the same millisecond) gets a numeric suffix rather than a merge.
async function reserveRunArchiveDir(scenarioDir, baseName) {
  for (let attempt = ZERO; attempt < RUN_ARCHIVE_NAME_ATTEMPTS; attempt += 1) {
    const name = attempt === ZERO ? baseName :
      baseName + ARCHIVE_NAME_TIME_SEPARATOR + attempt;
    try {
      await mkdir(join(scenarioDir, name));
      return name;
    } catch (error) {
      if (error?.code !== ERROR_CODE_EXISTS) {
        throw error;
      }
    }
  }
  throw new Error(`no free run archive name for ${baseName} in ${scenarioDir}`);
}

// Rewrites one path token that names a location under rule.from (a path
// relative to the output root, matched at a path-segment boundary so any
// workspace-relative or absolute spelling of it matches) to rule.to. A
// token already inside an earlier archive is left alone; a bare scenario
// name (no separator) is not a path and never matches.
function rewritePathTokenUnder(token, rule) {
  if (stringEndsWith(token, PATH_SEPARATOR + rule.from)) {
    return stringSlice(token, ZERO, token.length - rule.from.length) + rule.to;
  }
  const marker = PATH_SEPARATOR + rule.from + PATH_SEPARATOR;
  const markerIndex = stringLastIndexOf(token, marker);
  let headLength = markerIndex + PATH_SEPARATOR.length;
  if (markerIndex < ZERO) {
    if (!stringStartsWith(token, rule.from + PATH_SEPARATOR)) {
      return null;
    }
    headLength = ZERO;
  }
  const rest = stringSlice(token,
    headLength + rule.from.length + PATH_SEPARATOR.length);
  if (stringStartsWith(rest, RUN_ARCHIVE_PREFIX)) {
    return null;
  }
  return stringSlice(token, ZERO, headLength) + rule.to + PATH_SEPARATOR +
    rest;
}

function rewriteArchivedPaths(text, rules) {
  return stringReplace(text, PATH_TOKEN_PATTERN, (token) => {
    for (const rule of rules) {
      const rewritten = rewritePathTokenUnder(token, rule);
      if (rewritten !== null) {
        return rewritten;
      }
    }
    return token;
  });
}

function isPathRewrittenArtifact(name) {
  for (const extension of RUN_ARCHIVE_PATH_REWRITE_EXTENSIONS) {
    if (stringEndsWith(name, extension)) {
      return true;
    }
  }
  return false;
}

async function rewriteArchivedArtifacts(archiveDir, names, rules) {
  const rewrittenIn = [];
  for (const name of names) {
    if (!isPathRewrittenArtifact(name)) {
      continue;
    }
    const artifactPath = join(archiveDir, name);
    let text;
    try {
      text = await readFile(artifactPath, ENCODING_UTF8);
    } catch (_notAFile) {
      continue;
    }
    const rewritten = rewriteArchivedPaths(text, rules);
    if (rewritten !== text) {
      await writeFile(artifactPath, rewritten, ENCODING_UTF8);
      rewrittenIn.push(name);
    }
  }
  return rewrittenIn;
}

async function listEntryNames(dir) {
  try {
    return await readdir(dir);
  } catch (_missing) {
    return [];
  }
}

async function hasRunArchiveManifest(archiveDir) {
  try {
    await stat(join(archiveDir, RUN_ARCHIVE_MANIFEST_FILENAME));
    return true;
  } catch (_absent) {
    return false;
  }
}

// The disk bound: keep the newest ARCHIVED_SCENARIO_RUNS_KEPT archives
// (names sort by run start); the older ones are planned for removal. A
// partial archive (no archive.json: a crash mid-archive) still counts toward
// the bound, so it is named, never silently consumed. The archive being
// written now has no manifest yet and is not partial.
async function planRunArchivePrune(scenarioDir, currentArchiveName) {
  const archives = arraySort(arrayFilter(await listEntryNames(scenarioDir),
    (name) => stringStartsWith(name, RUN_ARCHIVE_PREFIX)));
  const partialArchives = [];
  for (const name of archives) {
    if (name !== currentArchiveName &&
      !(await hasRunArchiveManifest(join(scenarioDir, name)))) {
      partialArchives.push(name);
    }
  }
  const excess = archives.length - ARCHIVED_SCENARIO_RUNS_KEPT;
  const prunedArchives = excess > ZERO ? arraySlice(archives, ZERO, excess) :
    [];
  return {partialArchives, prunedArchives};
}

function writeArchiveLogLine(line) {
  process.stderr.write(line + NEWLINE);
}

function logRunArchive(log, scenarioName, archiveName, plan) {
  log(`[harness] archive: earlier ${scenarioName} run moved into ` +
    `${archiveName} (bound: ${ARCHIVED_SCENARIO_RUNS_KEPT} kept)`);
  if (plan.prunedArchives.length > ZERO) {
    log(`[harness] archive: pruned ${plan.prunedArchives.length} ` +
      `${scenarioName} archive(s) beyond the bound: ` +
      arrayJoin(plan.prunedArchives, ', '));
  }
  if (plan.partialArchives.length > ZERO) {
    log(`[harness] archive: partial ${scenarioName} archive(s) without ` +
      `${RUN_ARCHIVE_MANIFEST_FILENAME} (a crash mid-archive; counted toward ` +
      'the bound): ' + arrayJoin(plan.partialArchives, ', '));
  }
}

/**
 * Move an earlier run's artifacts out of the scenario dir into that run's
 * archive (layout, bundle resolution and disk bound: see the Earlier-run
 * archive block above).
 * @param {{outputDir: string, scenarioName: string,
 *   archiveFullLogs?: function(string): Promise<?{from: string, to: string}>,
 *   log?: function(string): void}} options (log defaults to stderr)
 * @return {Promise<?Object>} The archive record, or null when there was no
 *   earlier run to archive.
 */
async function archivePreviousScenarioRun(
  {outputDir, scenarioName, archiveFullLogs, log},
) {
  const scenarioDir = join(outputDir, scenarioName);
  const runNames = arrayFilter(await listEntryNames(scenarioDir),
    (name) => !stringStartsWith(name, RUN_ARCHIVE_PREFIX));
  await mkdir(scenarioDir, {recursive: true});
  const runStart = await determineEarlierRunStart(scenarioDir, runNames);
  const archiveName = await reserveRunArchiveDir(scenarioDir,
    runArchiveBaseName(runStart.at));
  const archiveDir = join(scenarioDir, archiveName);
  const scenarioTail = relative(outputDir, scenarioDir);
  const archiveTail = relative(outputDir, archiveDir);
  const moved = [];
  for (const name of runNames) {
    await rename(join(scenarioDir, name), join(archiveDir, name));
    moved.push({
      from: scenarioTail + PATH_SEPARATOR + name,
      to: archiveTail + PATH_SEPARATOR + name,
    });
  }
  // Rules apply first-match: the full-log tree comes before the scenario dir
  // so a `.full-logs/{scenario}/...` path never matches the scenario rule. A
  // full-log tree that did not move gets an identity rule (to === from).
  const rules = [];
  const fullLogsMove = typeof archiveFullLogs === 'function' ?
    await archiveFullLogs(archiveDir) : null;
  if (fullLogsMove) {
    const fullLogsFrom = relative(outputDir, fullLogsMove.from);
    const fullLogsTo = fullLogsMove.moved ?
      relative(outputDir, fullLogsMove.to) : fullLogsFrom;
    rules.push({from: fullLogsFrom, to: fullLogsTo});
    if (fullLogsMove.moved) {
      moved.push({from: fullLogsFrom, to: fullLogsTo});
    }
  }
  if (moved.length === ZERO) {
    await rmdir(archiveDir);
    return null;
  }
  rules.push({from: scenarioTail, to: archiveTail});
  const pathsRewrittenIn = await rewriteArchivedArtifacts(archiveDir,
    runNames, rules);
  const plan = await planRunArchivePrune(scenarioDir, archiveName);
  const manifest = {
    schemaVersion: RUN_ARCHIVE_MANIFEST_SCHEMA_VERSION,
    scenario: scenarioName,
    runStartedAt: runStart.at,
    runStartedAtSource: runStart.source,
    archivedAt: Date.now(),
    pathsRelativeTo: 'outputDir',
    moved,
    pathsRewrittenIn,
    keptArchives: ARCHIVED_SCENARIO_RUNS_KEPT,
    prunedArchives: plan.prunedArchives,
    partialArchives: plan.partialArchives,
  };
  await writeFile(join(archiveDir, RUN_ARCHIVE_MANIFEST_FILENAME),
    JSON.stringify(manifest, null, JSON_INDENT) + NEWLINE, ENCODING_UTF8);
  for (const name of plan.prunedArchives) {
    await rm(join(scenarioDir, name), {force: true, recursive: true});
  }
  logRunArchive(typeof log === 'function' ? log : writeArchiveLogLine,
    scenarioName, archiveName, plan);
  return {archiveDir, archiveName, manifest, pruned: plan.prunedArchives};
}

/**
 * LogCollector — buffers log events from live query subscription
 * and writes structured output per scenario.
 */
class LogCollector {
  /**
   * @param {string} [outputDir] - Base output directory
   */
  constructor(outputDir) {
    this._outputDir = outputDir || OUTPUT.DEFAULT_DIR;
    this._buffer = [];
    this._node = null;
    this._filter = null;
    this._subscriptionActive = false;
    this._unsubscribeLiveStream = null;
    this._seenLogIds = new Set();
    this._entrySink = null;
  }

  /**
   * Build the subscription SQL query.
   * Req 7.3
   * @param {string} [filter] - Optional WHERE clause predicate
   * @returns {string} Subscription query string
   */
  buildSubscriptionQuery(filter) {
    if (!filter) {
      return LIVE_SELECT_PREFIX;
    }
    return LIVE_SELECT_PREFIX + WHERE_CLAUSE + filter;
  }

  /**
   * Start live query subscription on a cluster node.
   * Stores the node reference and filter for later collection.
   * Buffers received events in memory.
   * Req 7.1, 7.2
   * @param {Object} node - NodeHandle instance
   * @param {string} [filter] - Optional WHERE clause predicate
   */
  async startLiveSubscription(node, filter) {
    this._node = node;
    this._filter = filter || null;
    this._subscriptionActive = true;
    const capabilities = resolveLogSubscriptionCapabilities(node);

    if (capabilities[LOG_SUBSCRIPTION_CAPABILITY.STREAM_EVENTS]) {
      try {
        this._unsubscribeLiveStream = await node.subscribeLogStream(
          (entry) => {
            const enriched = {
              ...entry,
              [FIELD_SOURCE]: entry?.[FIELD_SOURCE] ||
                SOURCE_LIVE_STREAM,
            };
            this._appendEntry(enriched);
          },
        );
      } catch (_err) {
        this._unsubscribeLiveStream = null;
      }
    }

    if (!capabilities[LOG_SUBSCRIPTION_CAPABILITY.LIVE_SELECT_QUERY]) {
      return;
    }

    const query = this.buildSubscriptionQuery(filter);
    try {
      const result = await node.query(query);
      this._appendEntries(extractRows(result));
    } catch (err) {
      if (isUnsupportedLiveSelectError(err)) {
        return;
      }
      // Subscription may not return immediately; node stored
      // for later snapshot collection.
    }
  }

  /**
   * Run final SELECT to capture complete log history before
   * teardown.
   * Req 7.4
   * @param {Object} node - NodeHandle instance
   * @returns {Array<Object>} Complete log entries
   */
  async collectFinalSnapshot(node) {
    const targetNode = node || this._node;
    if (!targetNode) {
      return [];
    }
    const result = await targetNode.query(FINAL_SNAPSHOT_QUERY);
    const entries = extractRows(result);
    this._appendEntries(entries);
    return entries;
  }

  /**
   * Fall back to Docker container stdout/stderr collection.
   * Used when cluster is unreachable for live queries.
   * Each node's logs are read through the node's OWN provider
   * (NodeHandle.getLogs), so multi-host runs collect every host's
   * containers instead of querying one daemon for all container ids
   * (which silently returned nothing for non-primary hosts).
   * Req 7.6
   * @param {Array<Object>} nodes - NodeHandle instances
   */
  async collectContainerFallback(nodes) {
    for (const node of nodes) {
      try {
        const logs = await node.getLogs(
          {
            [DOCKER_LOG_OPTION_RAW_BUFFER]: true,
            [DOCKER_LOG_OPTION_TAIL]: CONTAINER_LOG_TAIL_LINES,
          },
        );
        const lines = extractContainerLogLines(logs);
        for (const line of lines) {
          this._appendEntry({
            [FIELD_NODE_ID]: node.id,
            [FIELD_MESSAGE]: line,
            [FIELD_TIMESTAMP]: new Date().toISOString(),
            [FIELD_LEVEL]: DEFAULT_LEVEL,
            [FIELD_SOURCE]: SOURCE_CONTAINER,
          });
        }
      } catch (_err) {
        // Node container may already be removed; skip.
      }
    }
  }

  /**
   * Get the buffered log events from the live subscription.
   * Req 7.2
   * @returns {Array<Object>} Buffered log entries
   */
  getBuffer() {
    return this._buffer;
  }

  /**
   * Get last N entries from the buffer.
   * Req 7.7
   * @param {number} n - Number of entries
   * @returns {Array<Object>} Last N log entries
   */
  getTail(n) {
    if (this._buffer.length <= n) {
      return [...this._buffer];
    }
    return this._buffer.slice(this._buffer.length - n);
  }

  /**
   * Move an EARLIER run's artifacts out of the scenario directory before
   * this run writes any. The directory is shared by every run of the
   * scenario under one output root and node ids are fresh per run, so
   * without this the failure bundle and triage read other runs' node logs
   * as this run's evidence. They are archived, never deleted (see the
   * Earlier-run archive block at the top of this module).
   * @param {string} scenarioName
   * @param {{archiveFullLogs?: Function, log?: Function}} [options]
   * @return {Promise<?Object>} The archive record, or null.
   */
  async archivePreviousScenarioRun(scenarioName, options = {}) {
    return archivePreviousScenarioRun({
      archiveFullLogs: options.archiveFullLogs,
      log: options.log,
      outputDir: this._outputDir,
      scenarioName,
    });
  }

  /**
   * Write collected logs to structured output directory.
   * Writes per-node logs to {outputDir}/{scenarioName}/{nodeId}.log
   * Writes unified timeline to
   *   {outputDir}/{scenarioName}/_timeline.log
   * Req 7.5
   * @param {string} scenarioName
   * @param {Array<Object>} logEntries
   * @param {Array<string>} nodeIds
   */
  async writeOutput(scenarioName, logEntries, nodeIds) {
    const scenarioDir = join(this._outputDir, scenarioName);
    await mkdir(scenarioDir, {recursive: true});

    // Write per-node log files
    for (const nodeId of nodeIds) {
      const nodeEntries = logEntries.filter(
        (e) => e.node_id === nodeId,
      );
      const content = nodeEntries
        .map((e) => formatLogEntry(e))
        .join(NEWLINE);
      const filePath = join(
        scenarioDir, nodeId + LOG_FILE_EXTENSION,
      );
      await writeFile(filePath, content + NEWLINE, 'utf8');
    }

    // Write unified timeline sorted by timestamp
    const sorted = [...logEntries].sort(
      (a, b) => compareTimestamps(a.timestamp, b.timestamp),
    );
    const timelineContent = sorted
      .map((e) => formatLogEntry(e))
      .join(NEWLINE);
    const timelinePath = join(
      scenarioDir, OUTPUT.TIMELINE_FILENAME,
    );
    await writeFile(
      timelinePath, timelineContent + NEWLINE, 'utf8',
    );
  }

  /**
   * Stop the live query subscription and clean up.
   */
  async stopSubscription() {
    this._subscriptionActive = false;
    if (typeof this._unsubscribeLiveStream === 'function') {
      this._unsubscribeLiveStream();
    }
    this._unsubscribeLiveStream = null;
    this._node = null;
    this._filter = null;
  }

  /**
   * Register a sink callback invoked for each appended log entry.
   * @param {Function|null} sink
   */
  setEntrySink(sink) {
    this._entrySink = typeof sink === 'function' ? sink : null;
  }

  _appendEntries(entries) {
    for (const entry of entries) {
      this._appendEntry(entry);
    }
  }

  _appendEntry(entry) {
    const normalized = normalizeLogEntry(entry);
    if (!normalized) {
      return;
    }

    const logId = extractLogId(normalized);
    if (logId) {
      if (this._seenLogIds.has(logId)) {
        return;
      }
      this._seenLogIds.add(logId);
    }

    this._buffer.push(normalized);
    if (this._entrySink) {
      this._entrySink(normalized);
    }
  }
}

/**
 * Format a log entry as a single line for file output.
 * @param {Object} entry - Log entry object
 * @returns {string} Formatted line
 */
function formatLogEntry(entry) {
  const ts = entry[FIELD_TIMESTAMP] || '';
  const nodeId = entry[FIELD_NODE_ID] ||
    entry[FIELD_NODE_ID_ALT] || '';
  const level = entry[FIELD_LEVEL] || DEFAULT_LEVEL;
  const message = entry[FIELD_MESSAGE] || '';
  return `${ts} [${nodeId}] ${level}: ${message}`;
}

/**
 * Compare two timestamp strings for sorting.
 * @param {string} a
 * @param {string} b
 * @returns {number} Comparison result
 */
function compareTimestamps(a, b) {
  if (!a && !b) return ZERO;
  if (!a) return -1;
  if (!b) return 1;
  return a < b ? -1 : a > b ? 1 : ZERO;
}

function extractRows(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (!result || typeof result !== 'object') {
    return [];
  }
  if (Array.isArray(result[RESULT_ROWS])) {
    return result[RESULT_ROWS];
  }
  if (Array.isArray(result[RESULT_RESULTS])) {
    return result[RESULT_RESULTS];
  }
  return [];
}

function normalizeLogEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const normalized = {
    ...entry,
  };

  if (normalized[FIELD_NODE_ID] === undefined &&
      normalized[FIELD_NODE_ID_ALT] !== undefined) {
    normalized[FIELD_NODE_ID] = normalized[FIELD_NODE_ID_ALT];
  }
  if (!normalized[FIELD_LEVEL]) {
    normalized[FIELD_LEVEL] = DEFAULT_LEVEL;
  }
  if (normalized[FIELD_MESSAGE] === undefined ||
      normalized[FIELD_MESSAGE] === null) {
    normalized[FIELD_MESSAGE] = '';
  }

  return normalized;
}

function extractLogId(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const raw = entry[FIELD_LOG_ID] ?? entry.logId ?? null;
  if (raw === null || raw === undefined) {
    return null;
  }
  const value = String(raw);
  return value.length > ZERO ? value : null;
}

function resolveLogSubscriptionCapabilities(node) {
  const capabilities = {
    ...DEFAULT_LOG_SUBSCRIPTION_CAPABILITIES,
    [LOG_SUBSCRIPTION_CAPABILITY.STREAM_EVENTS]:
      typeof node?.subscribeLogStream === 'function',
  };

  if (typeof node?.getLogSubscriptionCapabilities !== 'function') {
    return capabilities;
  }

  const provided = node.getLogSubscriptionCapabilities();
  if (!provided || typeof provided !== 'object') {
    return capabilities;
  }

  if (Object.prototype.hasOwnProperty.call(
    provided,
    LOG_SUBSCRIPTION_CAPABILITY.STREAM_EVENTS,
  )) {
    capabilities[LOG_SUBSCRIPTION_CAPABILITY.STREAM_EVENTS] =
      provided[LOG_SUBSCRIPTION_CAPABILITY.STREAM_EVENTS] === true;
  }
  if (Object.prototype.hasOwnProperty.call(
    provided,
    LOG_SUBSCRIPTION_CAPABILITY.LIVE_SELECT_QUERY,
  )) {
    capabilities[LOG_SUBSCRIPTION_CAPABILITY.LIVE_SELECT_QUERY] =
      provided[LOG_SUBSCRIPTION_CAPABILITY.LIVE_SELECT_QUERY] === true;
  }
  return capabilities;
}

function isUnsupportedLiveSelectError(err) {
  const message = String(err?.message || err || '').toLowerCase();
  return message.includes(LIVE_SELECT_UNSUPPORTED_TOKEN_SYNTAX) ||
    message.includes(LIVE_SELECT_UNSUPPORTED_TOKEN_PARSE);
}

function extractContainerLogLines(logs) {
  if (Buffer.isBuffer(logs)) {
    const demultiplexed = decodeDockerLogFrames(logs);
    const text = demultiplexed === null ?
      logs.toString(ENCODING_UTF8) :
      demultiplexed;
    return text
      .split(NEWLINE)
      .filter((line) => line.length > ZERO);
  }

  if (typeof logs !== 'string') {
    return [];
  }
  const demultiplexed = demultiplexDockerLogString(logs);
  return demultiplexed
    .split(NEWLINE)
    .filter((line) => line.length > ZERO);
}

function demultiplexDockerLogString(logPayload) {
  if (logPayload.length === ZERO) {
    return logPayload;
  }
  const framedPayload = Buffer.from(logPayload, ENCODING_LATIN1);
  const decoded = decodeDockerLogFrames(framedPayload);
  if (decoded === null) {
    return logPayload;
  }
  return decoded;
}

function decodeDockerLogFrames(payload) {
  if (!Buffer.isBuffer(payload) ||
    payload.length < DOCKER_LOG_FRAME_HEADER_BYTES) {
    return null;
  }

  let offset = ZERO;
  let frameCount = ZERO;
  const chunks = [];
  while (offset + DOCKER_LOG_FRAME_HEADER_BYTES <= payload.length) {
    const streamType = payload[offset];
    if (streamType !== DOCKER_LOG_STREAM_STDOUT &&
      streamType !== DOCKER_LOG_STREAM_STDERR) {
      return null;
    }
    for (
      let i = DOCKER_LOG_FRAME_PADDING_OFFSET;
      i < DOCKER_LOG_FRAME_PADDING_OFFSET + DOCKER_LOG_FRAME_PADDING_LENGTH;
      i++
    ) {
      if (payload[offset + i] !== ZERO) {
        return null;
      }
    }

    const frameLength = payload.readUInt32BE(
      offset + DOCKER_LOG_FRAME_LENGTH_OFFSET,
    );
    const framePayloadStart = offset + DOCKER_LOG_FRAME_HEADER_BYTES;
    const framePayloadEnd = framePayloadStart + frameLength;
    if (framePayloadEnd > payload.length) {
      return null;
    }

    if (frameLength > ZERO) {
      chunks.push(payload.subarray(framePayloadStart, framePayloadEnd));
    }
    offset = framePayloadEnd;
    frameCount++;
    if (offset === payload.length) {
      break;
    }
  }

  if (frameCount === ZERO || offset !== payload.length) {
    return null;
  }
  if (chunks.length === ZERO) {
    return '';
  }
  return Buffer.concat(chunks).toString(ENCODING_UTF8);
}

export {
  ARCHIVED_SCENARIO_RUNS_KEPT,
  LogCollector,
  formatLogEntry,
  compareTimestamps,
  extractContainerLogLines,
};
