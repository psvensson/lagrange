/**
 * CL-031 step (c): oracle-blindness classification.
 *
 * Invariant (closure-ledger/CL-031.md, first violated invariant): a readiness/
 * settle/quiesce oracle that CANNOT READ its control-snapshot evidence must
 * fail the scenario as oracle-blind — naming the snapshot transport error —
 * never as a cluster stall/timeout. Blind verdicts are NOT adjudicable
 * cluster facts; they mean "fix the snapshot transport before reading this
 * surface" (the node-side root is the unbounded control snapshot exceeding
 * the admin websocket max payload).
 *
 * An oracle is blind AT DECISION TIME when its trailing polls could not read
 * any snapshot evidence: either every poll in the whole window was blind, or
 * the final ORACLE_BLIND_MIN_TRAILING_BLIND_POLLS (or more) consecutive
 * polls were. A single trailing transport hiccup after a long sighted run
 * does NOT flip the verdict — the genuine stall/timeout surface stands and
 * the blindness stats ride along in diagnostics instead.
 */

const ORACLE_BLIND_CLASSIFICATION = 'oracle_blind';
const ORACLE_BLIND_MIN_TRAILING_BLIND_POLLS = 2;
const ORACLE_BLIND_ERROR_UNKNOWN = 'unknown snapshot transport error';
const ZERO = 0;

function createOracleBlindnessTracker() {
  let totalPolls = ZERO;
  let blindPolls = ZERO;
  let trailingBlindPolls = ZERO;
  let trailingBlindSinceMs = null;
  let lastBlindError = null;
  let lastSightedAtMs = null;

  return {
    recordSightedPoll(nowMs = Date.now()) {
      totalPolls += 1;
      trailingBlindPolls = ZERO;
      trailingBlindSinceMs = null;
      lastSightedAtMs = nowMs;
    },
    recordBlindPoll(transportError, nowMs = Date.now()) {
      totalPolls += 1;
      blindPolls += 1;
      trailingBlindPolls += 1;
      if (trailingBlindSinceMs === null) {
        trailingBlindSinceMs = nowMs;
      }
      const normalizedError =
        typeof transportError === 'string' && transportError.length > ZERO ?
          transportError :
          transportError?.message || null;
      if (normalizedError) {
        lastBlindError = normalizedError;
      }
    },
    isBlindAtDecision() {
      if (blindPolls === ZERO) {
        return false;
      }
      return (
        trailingBlindPolls >= ORACLE_BLIND_MIN_TRAILING_BLIND_POLLS ||
        blindPolls === totalPolls
      );
    },
    summarize(nowMs = Date.now()) {
      return {
        classification: this.isBlindAtDecision() ?
          ORACLE_BLIND_CLASSIFICATION :
          null,
        totalPolls,
        blindPolls,
        trailingBlindPolls,
        trailingBlindSinceMs,
        trailingBlindElapsedMs: trailingBlindSinceMs === null ?
          ZERO :
          Math.max(ZERO, nowMs - trailingBlindSinceMs),
        lastBlindError,
        lastSightedAtMs,
        lastReadableEvidenceAgeMs: lastSightedAtMs === null ?
          null :
          Math.max(ZERO, nowMs - lastSightedAtMs),
      };
    },
  };
}

function buildOracleBlindFailureMessage({
  oracleName,
  summary,
  budgetMs = null,
  elapsedMs = null,
}) {
  const lastReadable = summary.lastReadableEvidenceAgeMs === null ?
    'never had readable evidence' :
    'last readable evidence ' +
      String(summary.lastReadableEvidenceAgeMs) +
      'ms ago';
  const budget = Number.isFinite(budgetMs) ?
    ', budgetMs=' + String(budgetMs) :
    '';
  const elapsed = Number.isFinite(elapsedMs) ?
    ', elapsedMs=' + String(elapsedMs) :
    '';
  return (
    String(oracleName) +
    ' oracle blind (classification=' +
    ORACLE_BLIND_CLASSIFICATION +
    '): the harness could not read control-snapshot evidence, so the' +
    ' underlying cluster state is NOT adjudicable as a stall/timeout' +
    ' (CL-031). Snapshot transport error: ' +
    String(summary.lastBlindError || ORACLE_BLIND_ERROR_UNKNOWN) +
    '. Blind polls ' +
    String(summary.blindPolls) +
    '/' +
    String(summary.totalPolls) +
    ' (trailing ' +
    String(summary.trailingBlindPolls) +
    ' for ' +
    String(summary.trailingBlindElapsedMs) +
    'ms, ' +
    lastReadable +
    budget +
    elapsed +
    ').'
  );
}

function markOracleBlindError(error, summary) {
  error.classification = ORACLE_BLIND_CLASSIFICATION;
  error.oracleBlind = summary;
  if (
    error.diagnostics &&
    typeof error.diagnostics === 'object' &&
    !Array.isArray(error.diagnostics)
  ) {
    error.diagnostics.oracleBlind = summary;
  } else {
    error.diagnostics = {oracleBlind: summary};
  }
  return error;
}

/**
 * Per-poll blindness signal for the active waits: the snapshot-coverage
 * probe is blind when it attempted at least one node and NO node returned a
 * readable snapshot payload (every probe witness carries a transport error).
 */
function resolveSnapshotCoverageBlindness(snapshotCoverage) {
  const probeWitnesses = Array.isArray(snapshotCoverage?.probeWitnesses) ?
    snapshotCoverage.probeWitnesses :
    [];
  if (probeWitnesses.length === ZERO) {
    return {blind: false, transportError: null};
  }
  const sighted = probeWitnesses.some(
    (witness) => witness?.snapshotQuerySucceeded === true,
  );
  if (sighted) {
    return {blind: false, transportError: null};
  }
  const firstError = probeWitnesses
    .map((witness) => witness?.error)
    .find((error) => typeof error === 'string' && error.length > ZERO);
  return {
    blind: true,
    transportError:
      snapshotCoverage?.selectedError || firstError || null,
  };
}

/**
 * Per-poll blindness signal for the ACTIVE waits, which have TWO evidence
 * channels: per-node HTTP probes (nodeDiagnostics) and the snapshot-coverage
 * probe. The oracle is blind only when the snapshot transport failed on
 * every node AND the node-level evidence shows nothing wrong (every probed
 * node active) — the gate 173105Z shape: cluster looks healthy node-by-node
 * but the gate evidence is unreadable. A non-active node diagnostic is a
 * READABLE cluster-facing fact, so the genuine timeout verdict (naming node
 * states) stands even when snapshots are unreadable.
 */
function resolveActiveWaitOracleBlindness({
  snapshotCoverage = null,
  nodeDiagnostics = [],
} = {}) {
  const coverageBlindness = resolveSnapshotCoverageBlindness(snapshotCoverage);
  if (!coverageBlindness.blind) {
    return coverageBlindness;
  }
  const diagnostics = Array.isArray(nodeDiagnostics) ? nodeDiagnostics : [];
  const hasReadableInactivityEvidence = diagnostics.some(
    (diagnostic) => diagnostic && diagnostic.active !== true,
  );
  if (hasReadableInactivityEvidence) {
    return {blind: false, transportError: null};
  }
  return coverageBlindness;
}

export {
  ORACLE_BLIND_CLASSIFICATION,
  ORACLE_BLIND_MIN_TRAILING_BLIND_POLLS,
  buildOracleBlindFailureMessage,
  createOracleBlindnessTracker,
  markOracleBlindError,
  resolveActiveWaitOracleBlindness,
  resolveSnapshotCoverageBlindness,
};
