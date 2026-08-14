const NUMERIC_ONE = 1;
const DEFAULT_ELECTION_TIMEOUT_MS = 300;
const CANDIDACY_RELUCTANCE_MULTIPLIER = 4;
const CANDIDACY_RELUCTANCE_WINDOW_MS = 10000;

/**
 * Resolve the election timeout without dereferencing torn-down timers. An
 * injected random source keeps deterministic tests on their seeded clock;
 * production keeps the base Liferaft draw.
 * @param {Object} raft
 * @param {Function} baseTimeout
 * @return {number}
 */
function resolveElectionTimeout(raft, baseTimeout) {
  const times = raft.election;
  if (!times) {
    return DEFAULT_ELECTION_TIMEOUT_MS;
  }
  const base = !raft._electionRandomSource ?
    baseTimeout() :
    Math.floor(
      raft._electionRandomSource.random() *
        (times.max - times.min + NUMERIC_ONE) +
      times.min,
    );
  if (
    raft._candidacyReluctantUntilMs != null &&
    resolveRaftNowMs(raft) < raft._candidacyReluctantUntilMs
  ) {
    return base * CANDIDACY_RELUCTANCE_MULTIPLIER;
  }
  return base;
}

function resolveRaftNowMs(raft) {
  return raft._catchupTimeSource ?
    raft._catchupTimeSource.now() :
    Date.now();
}

function deferRaftCandidacy(
  raft,
  windowMs = CANDIDACY_RELUCTANCE_WINDOW_MS,
) {
  raft._candidacyReluctantUntilMs = resolveRaftNowMs(raft) + windowMs;
  return raft;
}

function heartbeatWithEndGuard(raft, duration, baseHeartbeat) {
  if (!raft.timers) {
    return raft;
  }
  return baseHeartbeat(duration);
}

export {
  deferRaftCandidacy,
  heartbeatWithEndGuard,
  resolveElectionTimeout,
  resolveRaftNowMs,
};
