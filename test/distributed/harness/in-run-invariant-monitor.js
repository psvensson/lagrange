// in-run-invariant-monitor — make a SINGLE run informative (DT2).
//
// `evaluateInvariants(state)` (src/control-plane/invariant-engine.js) and the
// EventLoopGapWatchdog already exist, but are only read POST-HOC: a run reports
// a binary pass/fail and you sample N times in docker to learn WHICH invariant
// broke. This monitor samples both DURING a run on the existing poll cadence and
// records (a) the first violated safety invariant + when, and (b) the max
// event-loop gap vs the raft election timeout — so one run names the bug.
//
// The core is pure and unit-testable; `monitorInRun` is the thin async driver
// the scenario/quiescence loop can adopt (read-only, O(cheap) per sample, so it
// cannot perturb the convergence it measures). NOTE: the live-run wiring is left
// to a gate-validated change — this module is the verified, reusable piece.

const DEFAULT_SAMPLE_INTERVAL_MS = 1000;

function createInvariantTimeline() {
  return {sampleCount: 0, violationCount: 0, firstViolation: null, maxGapMs: 0};
}

// Fold one sample (a list of invariant results + the current max gap) into the
// timeline. Records the FIRST failing invariant only (the originating breach),
// keeps the running max gap. `results` items are {invariantId, severity, passed,
// reason}.
function recordInvariantSample(timeline, {results = [], gapMs = 0, atMs = 0} = {}) {
  timeline.sampleCount += 1;
  if (Number.isFinite(gapMs) && gapMs > timeline.maxGapMs) {
    timeline.maxGapMs = gapMs;
  }
  const failed = results.filter((r) => r && r.passed === false);
  timeline.violationCount += failed.length;
  if (!timeline.firstViolation && failed.length > 0) {
    const first = failed[0];
    timeline.firstViolation = {
      invariantId: first.invariantId,
      severity: first.severity,
      reason: first.reason,
      atMs,
    };
  }
  return timeline;
}

// Project the timeline into a report fragment. `electionTimeoutMs` lets the
// verdict flag a freeze that blew the raft election ceiling (the CL-033/039
// signature) from a single run.
function summarizeInvariantTimeline(timeline, {electionTimeoutMs = 3000} = {}) {
  return {
    sampleCount: timeline.sampleCount,
    violationCount: timeline.violationCount,
    firstViolation: timeline.firstViolation,
    maxEventLoopGapMs: timeline.maxGapMs,
    electionTimeoutExceeded: timeline.maxGapMs >= electionTimeoutMs,
  };
}

// Thin async driver: while `shouldContinue()` holds, sample `getState()` through
// `evaluateInvariants`, read the gap via `readGapMs`, and fold into a timeline.
// All collaborators are injected so this is deterministic under test.
async function monitorInRun({
  getState,
  evaluateInvariants,
  readGapMs = () => 0,
  shouldContinue,
  intervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  electionTimeoutMs = 3000,
}) {
  const timeline = createInvariantTimeline();
  const startedAt = now();
  while (shouldContinue()) {
    const state = await getState();
    recordInvariantSample(timeline, {
      results: evaluateInvariants(state),
      gapMs: readGapMs(),
      atMs: now() - startedAt,
    });
    await sleep(intervalMs);
  }
  return summarizeInvariantTimeline(timeline, {electionTimeoutMs});
}

export {
  createInvariantTimeline,
  recordInvariantSample,
  summarizeInvariantTimeline,
  monitorInRun,
  DEFAULT_SAMPLE_INTERVAL_MS,
};
