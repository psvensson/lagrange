import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Host-scheduling validity budgets. A live run whose node processes were frozen by
// the HOST (thermal throttling, memory pressure, scheduler contention) is measuring
// the machine, not the system under test: its 5s staleness thresholds and 1s bounded
// waits cannot be met by ANY correct implementation. One gap longer than every
// admission threshold in the scenario, a minute of cumulative stall, or a fifth of
// wall-clock spent blocked each independently invalidate the sample.
const MAX_SINGLE_GAP_MS = 10000;
const MAX_TOTAL_GAP_MS = 60000;
const MAX_BLOCKED_PERCENT = 20;
const GAP_LOG_MSG = 'Event loop gap detected';

const HOST_SCHEDULING_BUDGET = Object.freeze({
  maxSingleGapMs: MAX_SINGLE_GAP_MS,
  maxTotalGapMs: MAX_TOTAL_GAP_MS,
  maxBlockedPercent: MAX_BLOCKED_PERCENT,
});

/**
 * The event-loop-gap watchdog logs a monotonically growing `cumulative` block with
 * every detected gap, so the LAST gap record in a node's log carries the whole run's
 * totals. Non-JSON lines are interleaved plain-text console output and are skipped.
 * @param {string} text
 * @return {Object|null}
 */
function lastCumulativeGapRecord(text) {
  const lines = text.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].includes(GAP_LOG_MSG)) continue;
    try {
      const entry = JSON.parse(lines[index]);
      if (entry?.msg === GAP_LOG_MSG && entry.cumulative) return entry.cumulative;
    } catch (_error) {
      // A truncated or plain-text line is not gap evidence; keep scanning.
    }
  }
  return null;
}

function parseLineTimeMs(line) {
  if (!line.includes('"time"')) return null;
  try {
    const ms = Date.parse(JSON.parse(line)?.time);
    return Number.isFinite(ms) ? ms : null;
  } catch (_error) {
    return null;
  }
}

// The watchdog's own blockedPercentOfWall is computed AT THE TIME OF EACH GAP
// record, so a single startup stall reads as ~90% blocked even when the node then
// runs clean for minutes. Recompute the percent against the node's full logged
// lifespan (first to last parseable log timestamp); when the span cannot be
// established the percent rule is skipped and only the two monotone budgets apply.
function blockedPercentOverLogSpan(lines, totalGapMs) {
  let firstMs = null;
  let lastMs = null;
  for (const line of lines) {
    const ms = parseLineTimeMs(line);
    if (ms === null) continue;
    if (firstMs === null) firstMs = ms;
    lastMs = ms;
  }
  if (firstMs === null || lastMs === null || lastMs <= firstMs) return null;
  return (totalGapMs / (lastMs - firstMs)) * 100;
}

// Budgets apply to the UNEXPLAINED (host-noise) share of gap time: gap time
// covered by tagged app-owned sections is system-under-test behavior and must
// stay measurable as red, never laundered into a non-measuring verdict.
function nodeExceedsBudget(node) {
  return node.unexplainedMaxGapMs > MAX_SINGLE_GAP_MS ||
    node.unexplainedTotalMs > MAX_TOTAL_GAP_MS ||
    (node.blockedPercentOfLogSpan !== null &&
      node.blockedPercentOfLogSpan > MAX_BLOCKED_PERCENT);
}

/**
 * Harvest per-node cumulative event-loop-gap totals from the local cluster's log
 * files. A node with no gap records (or an unreadable log) contributes no evidence —
 * absence proves nothing about it — but any node over budget marks the whole run's
 * timing conclusions untrustworthy.
 * @param {string} dataRoot
 * @param {number} nodeCount
 * @return {Promise<{perNode: Object[], exceeded: boolean, budget: Object}>}
 */
async function collectHostSchedulingEvidence(dataRoot, nodeCount) {
  const perNode = [];
  for (let index = 0; index < nodeCount; index += 1) {
    const nodeId = `node-${index}`;
    let text = '';
    let readError = null;
    try {
      text = await readFile(resolve(dataRoot, `${nodeId}.log`), 'utf8');
    } catch (error) {
      readError = error?.message || String(error);
    }
    if (readError) {
      perNode.push({nodeId, readError});
      continue;
    }
    const cumulative = lastCumulativeGapRecord(text);
    if (cumulative) {
      const totalGapMs = cumulative.totalGapMs ?? 0;
      // Older logs predate the tagged/unexplained split; fall back to totals
      // there (the pre-split, conservative behavior).
      const unexplainedTotalMs =
        Number.isFinite(cumulative.totalUnexplainedMs) ?
          cumulative.totalUnexplainedMs : totalGapMs;
      const unexplainedMaxGapMs =
        Number.isFinite(cumulative.maxUnexplainedGapMs) ?
          cumulative.maxUnexplainedGapMs : (cumulative.maxGapMs ?? 0);
      perNode.push({
        nodeId,
        gapCount: cumulative.gapCount ?? null,
        totalGapMs,
        maxGapMs: cumulative.maxGapMs ?? 0,
        unexplainedTotalMs,
        unexplainedMaxGapMs,
        blockedPercentOfLogSpan:
          blockedPercentOverLogSpan(text.split('\n'), unexplainedTotalMs),
      });
    }
  }
  const exceeded = perNode
    .filter((node) => !node.readError)
    .some((node) => nodeExceedsBudget(node));
  return {perNode, exceeded, budget: HOST_SCHEDULING_BUDGET};
}

export {
  HOST_SCHEDULING_BUDGET,
  collectHostSchedulingEvidence,
  lastCumulativeGapRecord,
};
