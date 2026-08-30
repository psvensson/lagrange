// Single owner of the `outputTail` field of every TLC *.model.report.json.
//
// The tail is evidence context, not the verdict: the verdict fields
// (converged, temporalViolated, expectationMet, ...) are derived separately by
// scripts/model-tlc.js. Because the route report is a versioned evidence copy
// under architecture/contracts/evidence/, the tail must be byte-stable across
// runs whose model outcome is unchanged — a raw TLC tail is not (it carries
// wall-clock timestamps, the random fingerprint seed and pid, absolute parse
// paths, and a per-run trace-exploration file name). This module strips those
// run-dependent lines and bounds the remainder; on a converged run it keeps
// only the TLC no-error verdict so the tracked evidence never churns.

import {
  TLC_NO_ERROR_VERDICT,
  TLC_OUTPUT_TAIL_LINE_LIMIT,
} from './model-tlc-constants.js';

const NEWLINE = '\n';
const EMPTY_TAIL = '';

// Every TLC output line class whose content varies between two runs of the
// same model. A line matching any pattern is run-dependent and never enters a
// report tail.
const VOLATILE_TLC_OUTPUT_LINE_PATTERNS = Object.freeze([
  // Wall-clock stamps: "Starting... (2026-08-30 16:00:57)", "Progress(7) at
  // 2026-08-30 16:00:57: ...", "Finished in 00s at (...)", checkpoint lines.
  /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/u,
  // Progress lines also carry the elapsed-time-dependent queue picture.
  /^Progress\(\d+\)/u,
  // "Running breadth-first search Model-Checking with fp N and seed S with W
  // workers on C cores with M heap ... [pid: P] (host OS, JVM, ...)".
  /^Running .*Model-Checking with fp \d+ and seed /u,
  // "Parsing file /abs/checkout/path/..." and "/tmp/tlc-<random>/...".
  /^Parsing file /u,
  // Fingerprint-collision estimate depends on the per-run fp seed.
  /^\s*Estimates of the probability that TLC did not check/u,
  /^\s*because two distinct states had the same fingerprint/u,
  /^\s*calculated \(optimistic\):/u,
  // "Trace exploration spec path: .../Model_TTrace_<epoch>.tla".
  /^Trace exploration spec path: /u,
]);

function isVolatileTlcOutputLine(line) {
  return VOLATILE_TLC_OUTPUT_LINE_PATTERNS.some((pattern) =>
    pattern.test(line));
}

/**
 * Derive the deterministic `outputTail` for one TLC run.
 *
 * @param {string} output combined TLC stdout+stderr
 * @param {boolean} converged the report's convergence verdict
 * @return {string} `TLC_NO_ERROR_VERDICT` when converged; otherwise the last
 *   `TLC_OUTPUT_TAIL_LINE_LIMIT` run-independent lines of the output
 */
export function deterministicTlcOutputTail(output, converged) {
  if (converged) return TLC_NO_ERROR_VERDICT;
  const stableLines = String(output || EMPTY_TAIL)
    .split(NEWLINE)
    .filter((line) => !isVolatileTlcOutputLine(line));
  return stableLines
    .join(NEWLINE)
    .trim()
    .split(NEWLINE)
    .slice(-TLC_OUTPUT_TAIL_LINE_LIMIT)
    .join(NEWLINE);
}
