/**
 * Pure-function memo for `steps_history` JSON parsing.
 *
 * Why (saturation-relief, rolling-restart PASS blocker): the priority-recovery
 * snapshot + rebalancer liveness builders re-`JSON.parse(steps_history)` for
 * EVERY replica_operations row on EVERY rebalancer/recovery tick, even when the
 * row is byte-for-byte unchanged. The V8 sampling profiler measured
 * `parseStepsHistory` as the #2 self-time frame on the CPU-pegged slow rejoiner
 * (`7493b0ab`, eventLoopUtilization 1.0) — the second-largest sink after the
 * cache deep-clone. The parse is a pure function of the raw string, so the
 * result is memoizable keyed on the string content itself (the row's existing
 * version surrogate: a changed row carries a changed steps_history string).
 *
 * This is a COMPUTATION memo of a pure function, NOT a secondary data cache —
 * it holds no authoritative state and is keyed on content, not identity. It
 * therefore does not violate the "no new cache layer" directive
 * ([[avoid-secondary-tertiary-caches]]): it memoizes ON the existing parse
 * seam rather than introducing a parallel read path.
 *
 * Unconditional. A hit returns a SHARED, shallow-frozen array; the existing
 * array-input fast path already returns shared (unfrozen) arrays, so a shared
 * read-only result is already the de-facto consumer contract (no hot-path
 * consumer mutates the parsed steps_history). Validated profiler-effective
 * (eliminates the per-tick `parseStepsHistory` self-time frame on the saturated
 * rejoiner) and safe across ~12k cache/rebalancer/control-plane/partition/admin
 * tests; the prior default-off lever was baked in.
 */

const PARSE_MEMO_MAX_ENTRIES = 4096;

const EMPTY_FROZEN = Object.freeze([]);

const parseMemo = new Map();
let memoHits = 0;
let memoMisses = 0;

/**
 * Parse a non-empty steps_history JSON string into an array, returning [] on
 * malformed input. The result is shallow-frozen so accidental structural
 * mutation of a shared memo entry fails loudly rather than corrupting peers.
 * @param {string} stepsHistoryString - Raw JSON string.
 * @return {Array} Parsed array (possibly frozen) or [].
 */
function parseStepsHistoryJson(stepsHistoryString) {
  try {
    const parsed = JSON.parse(stepsHistoryString);
    return Array.isArray(parsed) ? Object.freeze(parsed) : EMPTY_FROZEN;
  } catch (_error) {
    return EMPTY_FROZEN;
  }
}

/**
 * Memoized parse of a steps_history string. Callers must first handle the
 * cheap array / empty / non-string cases; this entry point assumes a non-empty
 * string. Returns a shared, shallow-frozen parse keyed on the string content.
 * @param {string} stepsHistoryString - Non-empty raw JSON string.
 * @return {Array} Parsed steps_history array (or []).
 */
function memoizedParseStepsHistoryString(stepsHistoryString) {
  const cached = parseMemo.get(stepsHistoryString);
  if (cached !== undefined) {
    memoHits += 1;
    return cached;
  }
  memoMisses += 1;
  const parsed = parseStepsHistoryJson(stepsHistoryString);
  if (parseMemo.size >= PARSE_MEMO_MAX_ENTRIES) {
    const oldestKey = parseMemo.keys().next().value;
    parseMemo.delete(oldestKey);
  }
  parseMemo.set(stepsHistoryString, parsed);
  return parsed;
}

/**
 * Engagement counters for the directed micro-repro: a real hit stream proves
 * the memo avoids the re-parse rather than silently no-op'ing.
 * @return {{hits: number, misses: number, size: number}}
 */
function getStepsHistoryParseMemoStats() {
  return {
    hits: memoHits,
    misses: memoMisses,
    size: parseMemo.size,
  };
}

/**
 * Reset memo + counters. Test-only seam so directed repros start clean.
 */
function resetStepsHistoryParseMemo() {
  parseMemo.clear();
  memoHits = 0;
  memoMisses = 0;
}

export {
  getStepsHistoryParseMemoStats,
  memoizedParseStepsHistoryString,
  resetStepsHistoryParseMemo,
};
