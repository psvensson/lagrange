// One node's log lines inside a time window, for evidence records.
//
// The runtime logs one JSON object per line with ISO-8601 `time`
// (src/logging/logging-service.js). A window keeps every line at or above
// `minLevel`, plus any line whose message matches one of `patterns` (so a
// debug-level run can keep the transaction/consensus lines without keeping
// everything), bounded to `maxLines`; and it counts every message in the
// window so what was withheld is still counted.

import {readFileSync} from 'node:fs';

const LOG_WINDOW_DEFAULT = Object.freeze({
  MIN_LEVEL: 40,
  SLACK_MS: 2000,
  LINE_CHARS: 600,
  MAX_LINES: 400,
});
const TEXT = 'utf8';
const NEWLINE = '\n';

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function inWindow(entry, fromMs, toMs, slackMs) {
  const atMs = Date.parse(entry.time);
  return atMs >= fromMs - slackMs && atMs <= toMs + slackMs;
}

function kept(entry, minLevel, patterns) {
  return entry.level >= minLevel ||
    patterns.some((pattern) => pattern.test(String(entry.msg)));
}

/**
 * @param {{logPath: string}} node
 * @param {number} fromMs
 * @param {number} toMs
 * @param {{minLevel?: number, patterns?: RegExp[], maxLines?: number}} [options]
 * @return {{lines: string[], keptCount: number, messageCounts: object}}
 */
function logLinesBetween(node, fromMs, toMs, options = {}) {
  const {
    minLevel = LOG_WINDOW_DEFAULT.MIN_LEVEL,
    patterns = [],
    maxLines = LOG_WINDOW_DEFAULT.MAX_LINES,
  } = options;
  let text = '';
  try {
    text = readFileSync(node.logPath, TEXT);
  } catch (error) {
    return {lines: [`log unreadable: ${error.message}`], keptCount: 0,
      messageCounts: {}};
  }
  const lines = [];
  const messageCounts = {};
  let keptCount = 0;
  for (const line of text.split(NEWLINE)) {
    const entry = parseLine(line);
    if (!entry || !inWindow(entry, fromMs, toMs, LOG_WINDOW_DEFAULT.SLACK_MS)) {
      continue;
    }
    const key = `${entry.level} ${entry.msg}`;
    messageCounts[key] = (messageCounts[key] ?? 0) + 1;
    if (!kept(entry, minLevel, patterns)) continue;
    keptCount++;
    if (lines.length < maxLines) {
      lines.push(line.slice(0, LOG_WINDOW_DEFAULT.LINE_CHARS));
    }
  }
  return {lines, keptCount, messageCounts};
}

export {logLinesBetween};
