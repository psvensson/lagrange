/**
 * Log Collector — collects cluster logs via live query subscription
 * to the `logs` system table. Falls back to Docker container
 * stdout/stderr when the cluster is unreachable.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import {writeFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {OUTPUT} from './constants.js';

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

    if (typeof node.subscribeLogStream === 'function') {
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

    const query = this.buildSubscriptionQuery(filter);
    try {
      const result = await node.query(query);
      this._appendEntries(extractRows(result));
    } catch (_err) {
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
   * Req 7.6
   * @param {Object} dockerProvider - DockerProvider instance
   * @param {Array<Object>} nodes - NodeHandle instances
   */
  async collectContainerFallback(dockerProvider, nodes) {
    for (const node of nodes) {
      try {
        const logs = await dockerProvider.getContainerLogs(
          node.containerId,
        );
        const lines = typeof logs === 'string' ?
          logs.split(NEWLINE).filter((l) => l.length > ZERO) :
          [];
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

export {LogCollector, formatLogEntry, compareTimestamps};
