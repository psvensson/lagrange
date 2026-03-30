const REJOIN_HINTS_FILENAME = 'cluster-rejoin-hints.json';
const REJOIN_HINTS_TEMP_SUFFIX = '.tmp';
const REJOIN_HINTS_WRITE_INTERVAL_MS = 1000;
const STARTUP_JOIN_MODE = Object.freeze({
  FRESH_JOIN: 'fresh_join',
  DURABLE_REJOIN: 'durable_rejoin',
  SEED: 'seed',
});

export {
  REJOIN_HINTS_FILENAME,
  REJOIN_HINTS_TEMP_SUFFIX,
  REJOIN_HINTS_WRITE_INTERVAL_MS,
  STARTUP_JOIN_MODE,
};
