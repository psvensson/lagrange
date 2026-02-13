/**
 * Log Analyzer — processes collected log entries to produce a
 * unified timeline and detect distributed system anomalies.
 * Runs analytical SQL queries against the `logs` table before
 * teardown.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7,
 *               13.8, 13.9
 */

import {writeFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {ANALYZER_DEFAULTS, OUTPUT} from './constants.js';

// --- SQL query constants ---
const LEADER_EVENTS_QUERY =
  'SELECT * FROM logs WHERE message LIKE ' +
  '\'%leader_elected%\' ORDER BY timestamp';
const LEADER_COUNTS_QUERY =
  'SELECT node_id, partition_id, COUNT(*) FROM logs WHERE ' +
  'message LIKE \'%leader_elected%\' GROUP BY node_id, ' +
  'partition_id';
const ERROR_ENTRIES_QUERY =
  'SELECT * FROM logs WHERE level = \'error\' ' +
  'ORDER BY timestamp';

// --- Pattern type constants ---
const PATTERN_SPLIT_BRAIN = 'split_brain';
const PATTERN_ELECTION_STORM = 'election_storm';
const PATTERN_STUCK_REBALANCING = 'stuck_rebalancing';
const PATTERN_MESSAGE_DELIVERY_FAILURE = 'message_delivery_failure';
const PATTERN_CDC_DELAY = 'cdc_delay';

// --- Severity constants ---
const SEVERITY_CRITICAL = 'critical';
const SEVERITY_WARNING = 'warning';

// --- Log level constants ---
const LEVEL_ERROR = 'error';

// --- Message matching constants ---
const REBALANCE_MARKER = 'rebalance';
const REPLICA_OPERATION_MARKER = 'replica_operation';
const REBALANCE_START_MARKER = 'start';
const REBALANCE_COMPLETE_MARKER = 'complete';
const CDC_MARKER = 'cdc';
const ROUTING_ERROR_MARKER = 'routing';
const ADDRESS_REGEX = /address[=: ]+([^\s,]+)/i;
const CDC_DELAY_REGEX = /delay[=: ]+(\d+)/i;

// --- Formatting constants ---
const NEWLINE = '\n';
const ZERO = 0;
const JSON_INDENT = 2;

/**
 * LogAnalyzer — detects distributed system anomalies from
 * collected log entries and analytical SQL query results.
 */
class LogAnalyzer {
  /**
   * @param {string} [outputDir] - Base output directory
   * @param {Object} [options] - Override analyzer thresholds
   */
  constructor(outputDir, options) {
    this._outputDir = outputDir || OUTPUT.DEFAULT_DIR;
    const opts = options || {};
    this._electionStormMultiplier =
      opts.electionStormMultiplier ??
      ANALYZER_DEFAULTS.electionStormMultiplier;
    this._stuckRebalanceTimeoutMs =
      opts.stuckRebalanceTimeoutMs ??
      ANALYZER_DEFAULTS.stuckRebalanceTimeoutMs;
    this._cdcDelayThresholdMs =
      opts.cdcDelayThresholdMs ??
      ANALYZER_DEFAULTS.cdcDelayThresholdMs;
    this._repeatedErrorThreshold =
      opts.repeatedErrorThreshold ??
      ANALYZER_DEFAULTS.repeatedErrorThreshold;
  }

  /**
   * Run analytical SQL queries against the logs table via
   * Admin API.
   * Req 13.2
   * @param {Object} node - NodeHandle instance
   * @returns {Object} { leaderEvents, leaderCounts, errorEntries }
   */
  async runAnalyticalQueries(node) {
    const leaderEvents = await node.query(LEADER_EVENTS_QUERY);
    const leaderCounts = await node.query(LEADER_COUNTS_QUERY);
    const errorEntries = await node.query(ERROR_ENTRIES_QUERY);
    return {
      leaderEvents: Array.isArray(leaderEvents) ?
        leaderEvents : [],
      leaderCounts: Array.isArray(leaderCounts) ?
        leaderCounts : [],
      errorEntries: Array.isArray(errorEntries) ?
        errorEntries : [],
    };
  }

  /**
   * Detect split-brain: two nodes claiming leadership for the
   * same partition simultaneously.
   * Req 13.3
   * @param {Array<Object>} leaderEvents - Leader election entries
   * @returns {Array<Object>} Detected split-brain anomalies
   */
  detectSplitBrain(leaderEvents) {
    const anomalies = [];
    const byPartition = groupBy(leaderEvents, 'partition_id');

    for (const [partitionId, events] of Object.entries(
      byPartition,
    )) {
      const sorted = [...events].sort(
        (a, b) => compareTimestamps(a.timestamp, b.timestamp),
      );
      for (let i = ZERO; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        if (
          current.node_id !== next.node_id &&
          current.timestamp === next.timestamp
        ) {
          anomalies.push({
            type: PATTERN_SPLIT_BRAIN,
            severity: SEVERITY_CRITICAL,
            details: {
              partition_id: partitionId,
              nodes: [current.node_id, next.node_id],
              timestamp_range: [
                current.timestamp,
                next.timestamp,
              ],
            },
          });
        }
      }
    }
    return anomalies;
  }

  /**
   * Detect election storms: partitions with leader changes
   * exceeding partitionCount * electionStormMultiplier.
   * Req 13.4
   * @param {Array<Object>} leaderCounts - Grouped counts
   *   [{node_id, partition_id, count}, ...]
   * @returns {Array<Object>} Detected election storm anomalies
   */
  detectElectionStorms(leaderCounts, partitionCount) {
    const anomalies = [];
    const threshold =
      partitionCount * this._electionStormMultiplier;
    const countsByPartition = {};

    for (const row of leaderCounts) {
      const pid = row.partition_id;
      const count = Number(row.count) || ZERO;
      countsByPartition[pid] =
        (countsByPartition[pid] || ZERO) + count;
    }

    for (const [partitionId, total] of Object.entries(
      countsByPartition,
    )) {
      if (total > threshold) {
        anomalies.push({
          type: PATTERN_ELECTION_STORM,
          severity: SEVERITY_WARNING,
          details: {
            partition_id: partitionId,
            leader_changes: total,
            threshold,
          },
        });
      }
    }
    return anomalies;
  }

  /**
   * Detect stuck rebalancing: operations not completing within
   * the configured timeout.
   * Req 13.5
   * @param {Array<Object>} logEntries - All log entries
   * @returns {Array<Object>} Detected stuck rebalance anomalies
   */
  detectStuckRebalancing(logEntries) {
    const anomalies = [];
    const operations = {};

    for (const entry of logEntries) {
      const msg = (entry.message || '').toLowerCase();
      if (
        !msg.includes(REBALANCE_MARKER) &&
        !msg.includes(REPLICA_OPERATION_MARKER)
      ) {
        continue;
      }
      const opId = extractOperationId(entry.message);
      if (!opId) continue;

      if (msg.includes(REBALANCE_START_MARKER)) {
        operations[opId] = operations[opId] || {};
        operations[opId].start = entry.timestamp;
      }
      if (msg.includes(REBALANCE_COMPLETE_MARKER)) {
        operations[opId] = operations[opId] || {};
        operations[opId].complete = entry.timestamp;
      }
    }

    for (const [opId, times] of Object.entries(operations)) {
      if (!times.start) continue;
      if (times.complete) {
        const duration =
          new Date(times.complete).getTime() -
          new Date(times.start).getTime();
        if (duration > this._stuckRebalanceTimeoutMs) {
          anomalies.push({
            type: PATTERN_STUCK_REBALANCING,
            severity: SEVERITY_WARNING,
            details: {
              operation_id: opId,
              duration_ms: duration,
              threshold_ms: this._stuckRebalanceTimeoutMs,
            },
          });
        }
      } else {
        // No completion found — flag as stuck
        anomalies.push({
          type: PATTERN_STUCK_REBALANCING,
          severity: SEVERITY_WARNING,
          details: {
            operation_id: opId,
            duration_ms: null,
            threshold_ms: this._stuckRebalanceTimeoutMs,
          },
        });
      }
    }
    return anomalies;
  }

  /**
   * Detect message delivery failures: repeated routing errors
   * to the same address.
   * Req 13.6
   * @param {Array<Object>} errorEntries - Error-level entries
   * @returns {Array<Object>} Detected routing failure anomalies
   */
  detectMessageDeliveryFailures(errorEntries) {
    const anomalies = [];
    const addressCounts = {};

    for (const entry of errorEntries) {
      const msg = (entry.message || '').toLowerCase();
      if (!msg.includes(ROUTING_ERROR_MARKER)) continue;
      const match = ADDRESS_REGEX.exec(entry.message || '');
      const address = match ? match[1] : 'unknown';
      addressCounts[address] =
        (addressCounts[address] || ZERO) + 1;
    }

    for (const [address, count] of Object.entries(
      addressCounts,
    )) {
      if (count >= this._repeatedErrorThreshold) {
        anomalies.push({
          type: PATTERN_MESSAGE_DELIVERY_FAILURE,
          severity: SEVERITY_WARNING,
          details: {
            address,
            error_count: count,
            threshold: this._repeatedErrorThreshold,
          },
        });
      }
    }
    return anomalies;
  }

  /**
   * Detect CDC propagation delays: events exceeding the
   * configured threshold.
   * Req 13.7
   * @param {Array<Object>} logEntries - All log entries
   * @returns {Array<Object>} Detected CDC delay anomalies
   */
  detectCDCDelays(logEntries) {
    const anomalies = [];

    for (const entry of logEntries) {
      const msg = (entry.message || '').toLowerCase();
      if (!msg.includes(CDC_MARKER)) continue;
      const match = CDC_DELAY_REGEX.exec(entry.message || '');
      if (!match) continue;
      const delayMs = Number(match[1]);
      if (delayMs > this._cdcDelayThresholdMs) {
        anomalies.push({
          type: PATTERN_CDC_DELAY,
          severity: SEVERITY_WARNING,
          details: {
            delay_ms: delayMs,
            threshold_ms: this._cdcDelayThresholdMs,
            node_id: entry.node_id || null,
            timestamp: entry.timestamp || null,
          },
        });
      }
    }
    return anomalies;
  }

  /**
   * Produce the complete analysis from collected logs and
   * query results.
   * Req 13.1, 13.8, 13.9
   * @param {Array<Object>} logEntries - All collected entries
   * @param {Object} queryResults - From runAnalyticalQueries
   * @param {number} partitionCount - Cluster partition count
   * @returns {Object} { timeline, errors, patterns, summary }
   */
  analyze(logEntries, queryResults, partitionCount) {
    const timeline = [...logEntries].sort(
      (a, b) => compareTimestamps(a.timestamp, b.timestamp),
    );

    const errors = logEntries.filter(
      (e) => e.level === LEVEL_ERROR,
    );

    const patterns = [
      ...this.detectSplitBrain(
        queryResults.leaderEvents || [],
      ),
      ...this.detectElectionStorms(
        queryResults.leaderCounts || [], partitionCount,
      ),
      ...this.detectStuckRebalancing(logEntries),
      ...this.detectMessageDeliveryFailures(
        queryResults.errorEntries || [],
      ),
      ...this.detectCDCDelays(logEntries),
    ];

    const byLevel = {};
    const byNode = {};
    const bySubsystem = {};
    for (const entry of logEntries) {
      const level = entry.level || 'info';
      byLevel[level] = (byLevel[level] || ZERO) + 1;
      const nodeId = entry.node_id || 'unknown';
      byNode[nodeId] = (byNode[nodeId] || ZERO) + 1;
      const subsystem = extractSubsystem(entry.message);
      bySubsystem[subsystem] =
        (bySubsystem[subsystem] || ZERO) + 1;
    }

    const anomalyTypes = [
      ...new Set(patterns.map((p) => p.type)),
    ];

    const summary = {
      total_entries: logEntries.length,
      by_level: byLevel,
      by_node: byNode,
      by_subsystem: bySubsystem,
      anomaly_count: patterns.length,
      anomaly_types: anomalyTypes,
    };

    return {timeline, errors, patterns, summary};
  }

  /**
   * Write analysis output files.
   * Writes {outputDir}/{scenarioName}/_timeline.log
   * Writes {outputDir}/{scenarioName}/_analysis.json
   * Req 13.1, 13.8
   * @param {string} scenarioName
   * @param {Object} analysis - Result from analyze()
   */
  async writeAnalysis(scenarioName, analysis) {
    const scenarioDir = join(this._outputDir, scenarioName);
    await mkdir(scenarioDir, {recursive: true});

    const timelineContent = (analysis.timeline || [])
      .map((e) => formatLogEntry(e))
      .join(NEWLINE);
    const timelinePath = join(
      scenarioDir, OUTPUT.TIMELINE_FILENAME,
    );
    await writeFile(
      timelinePath, timelineContent + NEWLINE, 'utf8',
    );

    const analysisPath = join(
      scenarioDir, OUTPUT.ANALYSIS_FILENAME,
    );
    await writeFile(
      analysisPath,
      JSON.stringify(analysis, null, JSON_INDENT) + NEWLINE,
      'utf8',
    );
  }
}

// --- Helper functions ---

/**
 * Group an array of objects by a key.
 * @param {Array<Object>} items
 * @param {string} key
 * @returns {Object} Grouped items
 */
function groupBy(items, key) {
  const groups = {};
  for (const item of items) {
    const val = item[key] || 'unknown';
    if (!groups[val]) groups[val] = [];
    groups[val].push(item);
  }
  return groups;
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

/**
 * Extract an operation ID from a log message.
 * Looks for patterns like operation_id=xxx or op=xxx.
 * @param {string} message
 * @returns {string|null}
 */
function extractOperationId(message) {
  const match = /(?:operation_id|op)[=: ]+([^\s,]+)/i
    .exec(message || '');
  return match ? match[1] : null;
}

/**
 * Extract a subsystem name from a log message.
 * Heuristic: first bracketed term or first word.
 * @param {string} message
 * @returns {string}
 */
function extractSubsystem(message) {
  if (!message) return 'unknown';
  const bracketMatch = /\[([^\]]+)\]/.exec(message);
  if (bracketMatch) return bracketMatch[1].toLowerCase();
  const firstWord = message.split(/[\s:]/)[ZERO];
  return firstWord ? firstWord.toLowerCase() : 'unknown';
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

export {LogAnalyzer};
