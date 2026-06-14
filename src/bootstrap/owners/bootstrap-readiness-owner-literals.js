const BOOTSTRAP_READINESS_OWNER_LITERAL = Object.freeze({
  STARTING: 'starting',
  BOOTSTRAPPING: 'bootstrapping',
  WARMING: 'warming',
  JOIN_READY: 'join_ready',
  DEGRADED: 'degraded',
  READINESS_PROBE_ASYNC_DIAGNOSTICS_TIMED_OUT_USING:
    'Readiness probe async diagnostics timed out; using ',
  SYNCHRONOUS_READINESS_SNAPSHOT_FALLBACK:
    'synchronous readiness snapshot fallback',
  AUTHORITY_UNAVAILABLE: 'authority_unavailable',
  NONE: 'none',
  PRESENT: 'present',
  OBSERVATION_UNAVAILABLE: 'observation_unavailable',
  DEGRADED_2: 'DEGRADED',
  MISSINGPARTITIONLEADERS: 'missingPartitionLeaders',
  MISSINGPARTITIONLEADERNODES: 'missingPartitionLeaderNodes',
  MISSINGPARTITIONLEADERADDRESSES: 'missingPartitionLeaderAddresses',
  MISSINGMESSAGEGROUPLEADERS: 'missingMessageGroupLeaders',
  MISSINGMESSAGEGROUPLEADERNODES: 'missingMessageGroupLeaderNodes',
  MISSINGMESSAGEGROUPLEADERADDRESSES: 'missingMessageGroupLeaderAddresses',
});

export {BOOTSTRAP_READINESS_OWNER_LITERAL};
