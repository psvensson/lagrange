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

    const query = this.buildSubscriptionQuery(filter);
    try {
      const results = await node.query(query);
      if (Array.isArray(results)) {
        for (const entry of results) {
          this._buffer.push(entry);
        }
      }
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
    const results = await targetNode.query(FINAL_SNAPSHOT_QUERY);
    const entries = Array.isArray(results) ? results : [];
    for (const entry of entries) {
      this._buffer.push(entry);
    }
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
          this._buffer.push({
            node_id: node.id,
            message: line,
            timestamp: new Date().toISOString(),
            level: 'info',
            source: 'container',
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
    this._node = null;
    this._filter = null;
  }
}

/**
 * Format a log entry as a single line for file output.
 * @param {Object} entry - Log entry object
 * @returns {string} Formatted line
 */
function formatLogEntry(entry) {
  const ts = entry.timestamp || '';
  const nodeId = entry.node_id || '';
  const level = entry.level || 'info';
  const message = entry.message || '';
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

export {LogCollector, formatLogEntry, compareTimestamps};
