import {
  LISTENER_PORT_DEFAULT,
  LISTENER_PORT_ENV,
  LISTENER_PORT_OFFSET,
} from '../config/listener-port-model.js';

// Keep in lockstep with package.json "version"; the drift-guard in
// test/release/version-single-source.test.js fails if they diverge. Held as a
// literal (not a package.json read) so the SEA single-executable build, which
// has no package.json on disk, still reports the right version.
const ENTRYPOINT_VERSION = '0.1.0';

const ENTRYPOINT_APP = Object.freeze({
  NAME: 'Distributed Database System',
  CLI_NAME: 'lagrange',
  PACKAGE_NAME: 'lagrange',
});

const ENTRYPOINT_FLAG = Object.freeze({
  VERSION_LONG: '--version',
  VERSION_SHORT: '-v',
  HELP_LONG: '--help',
  HELP_SHORT: '-h',
  SEED: '--seed',
  CONFIG: '--config',
  DATA_DIR: '--data-dir',
  DRY_RUN: '--dry-run',
});

const ENTRYPOINT_ENV = Object.freeze({
  NODE_ID: 'NODE_ID',
  LOG_LEVEL: 'LOG_LEVEL',
  REST_API_PORT: LISTENER_PORT_ENV.REST_API,
  ADMIN_WEBSOCKET_PORT: LISTENER_PORT_ENV.ADMIN_WEBSOCKET,
  NODE_WS_PORT: LISTENER_PORT_ENV.TRANSPORT_WEBSOCKET,
  NODE_ADVERTISED_WS_ADDRESS: 'NODE_ADVERTISED_WS_ADDRESS',
  SEED_NODE_ADDRESS: 'SEED_NODE_ADDRESS',
  JOINING_HTTP_TIMEOUT_MS: 'NODE_JOINING_HTTP_TIMEOUT_MS',
  JOINING_LEADERSHIP_WAIT_TIMEOUT_MS: 'NODE_JOINING_LEADERSHIP_WAIT_TIMEOUT_MS',
  CONTROL_PLANE_LIFECYCLE_PROBES_REQUIRED:
    'CONTROL_PLANE_LIFECYCLE_PROBES_REQUIRED',
  CONTROL_PLANE_WORK_CLASS_SCHEDULER_REQUIRED:
    'CONTROL_PLANE_WORK_CLASS_SCHEDULER_REQUIRED',
  CONTROL_PLANE_DURABLE_JOIN_SESSIONS_REQUIRED:
    'CONTROL_PLANE_DURABLE_JOIN_SESSIONS_REQUIRED',
});

const ENTRYPOINT_DEFAULT = Object.freeze({
  REST_API_PORT: LISTENER_PORT_DEFAULT.REST_API,
  // Compatibility-only export. Runtime port derivation is owned by the
  // listener-port model and no production consumer applies this offset.
  WS_PORT_OFFSET: LISTENER_PORT_OFFSET.TRANSPORT_WEBSOCKET,
  READINESS_DRAIN_DEADLINE_MS: 10000,
  LOCALHOST: 'localhost',
  HTTP_PREFIX: 'http://',
  HTTPS_PREFIX: 'https://',
  AUTO_REJOIN_BOOTSTRAP_READY_PATH: '/bootstrap/ready',
  AUTO_REJOIN_HEALTH_PATH: '/health',
  AUTO_REJOIN_PROBE_METHOD: 'GET',
  AUTO_REJOIN_PROBE_TIMEOUT_MS: 1000,
  SEED_ADDRESS_CANDIDATE_SEPARATOR: ',',
  JOIN_HINT_CLUSTER_NODE_COUNT: 2,
});

const ENTRYPOINT_REJOIN_DEFAULT = Object.freeze({
  MAX_ATTEMPTS: 4,
  BASE_DELAY_MS: 2000,
  MAX_DELAY_MS: 30000,
  BACKOFF_CAP_EXPONENT: 10,
});

const ENTRYPOINT_RUNTIME_VALUE = Object.freeze({
  JOINER: 'joiner',
  FAILED_TO_PERSIST_BOOTSTRAP_REJOIN_HINTS:
    'Failed to persist bootstrap rejoin hints',
  JOIN: 'join',
  SEED: 'seed',
  CONFIGURATION_LOADED: 'Configuration loaded',
  REATTEMPT_JOIN: 'Re-attempting cluster join after retryable failure',
  DEBUG: 'debug',
  INFO: 'info',
});

const ENTRYPOINT_SUBSYSTEM = Object.freeze({
  MAIN: 'main',
  CONFIG: 'config',
});

const ENTRYPOINT_LOG_MSG = Object.freeze({
  STARTING: 'Distributed Database System starting',
  STALE_SOURCE_DETECTED:
    'Booted source fingerprint does not match the harness-injected fingerprint ' +
    '(stale code may be running)',
  DRY_RUN_COMPLETED: 'Dry run completed',
  JOINING_CLUSTER: 'Joining existing cluster',
  AUTO_REJOINING_CLUSTER: 'Restarting node will auto-rejoin existing cluster',
  AUTO_REJOIN_DECISION: 'Resolved startup auto-rejoin decision',
  SEED_CANDIDATE_SELECTED:
    'Selected explicit seed contact candidate by reachability probe',
  FAILED_JOIN: 'Failed to join cluster',
  JOINED_CLUSTER: 'Successfully joined cluster',
  LOGS_TABLE_CONNECTED: 'Connected logging persistence to logs table',
  LOGS_TABLE_CONNECT_SKIPPED: 'Skipping logs table persistence (CDC unavailable)',
  LOGS_TABLE_CONNECT_FAILED: 'Failed to connect logs table persistence',
  LOGS_TABLE_BACKGROUND_CONNECT_FAILED:
    'Background logs table persistence setup failed',
  LOGS_TABLE_SHUTDOWN_FAILED: 'Failed to shutdown logs table persistence',
  DYNAMIC_CONFIG_WIRING_FAILED: 'Failed to initialize runtime dynamic config wiring',
  DYNAMIC_CONFIG_WIRING_SHUTDOWN_FAILED: 'Failed to shutdown dynamic config wiring',
  STARTING_SEED: 'Starting as seed node',
  BOOTSTRAP_FAILED: 'Bootstrap failed',
  BOOTSTRAP_COMPLETED: 'Bootstrap completed',
  STARTUP_RUNTIME_HANDOFF: 'Startup runtime handoff completed',
  READINESS_TRANSITION: 'Bootstrap readiness state transitioned',
  READINESS_BLOCKED_DURATION: 'Bootstrap readiness blocker duration observed',
  READINESS_DRAINING: 'Bootstrap readiness marked draining',
  WS_STARTED: 'WebSocket server started for cross-node communication',
  WS_START_FAILED: 'Failed to start WebSocket server',
  ADMIN_RUNTIME_STARTED: 'Admin runtime started',
  ADMIN_RUNTIME_SQL_ENGINE_ATTACHED: 'Admin runtime SQL engine attached',
  PROCESS_BEFORE_EXIT: 'Process beforeExit observed',
  PROCESS_EXIT: 'Process exit observed',
  PROCESS_UNCAUGHT_EXCEPTION: 'Process uncaught exception observed',
  PROCESS_UNHANDLED_REJECTION: 'Process unhandled rejection observed',
  STARTUP_LIVENESS_PULSE: 'Startup liveness pulse observed',
  NODE_READY: 'Node fully operational',
  SHUTDOWN: 'Shutting down...',
});

const ENTRYPOINT_ERROR_MSG = Object.freeze({
  SYSTEM_TABLE_CACHE_REQUIRED: 'System table cache required after join',
  LIVE_QUERY_MANAGER_REQUIRED: 'Live query manager required during startup',
});

const ENTRYPOINT_TEXT = Object.freeze({
  versionLine: (version) => `${ENTRYPOINT_APP.PACKAGE_NAME} v${version}`,
  headerLine: (version) => `${ENTRYPOINT_APP.NAME} v${version}`,
  USAGE_LINE: `Usage: ${ENTRYPOINT_APP.CLI_NAME} [options]`,
  OPTIONS_LINES: [
    '  --version, -v    Show version number',
    '  --help, -h       Show this help message',
    '  --seed <urls>    Seed node URL(s), comma-separated, to join a cluster',
    '  --config <path>  Path to configuration file',
    '  --data-dir <path>  Base directory for partition storage',
    '  --dry-run        Validate configuration without starting',
  ],
  ENVIRONMENT_LINES: [
    '  NODE_ID          Override auto-generated node ID',
    '  LOG_LEVEL        Set logging level (error, warn, info, debug)',
    `  ${LISTENER_PORT_ENV.REST_API}    REST API port ` +
      `(default: ${LISTENER_PORT_DEFAULT.REST_API})`,
    `  ${LISTENER_PORT_ENV.ADMIN_WEBSOCKET}`,
    '                   Admin WebSocket port (default: REST_API_PORT + 1)',
    `  ${LISTENER_PORT_ENV.TRANSPORT_WEBSOCKET}     ` +
      'Transport WebSocket port (default: REST_API_PORT + 2)',
    '  CONTROL_PLANE_LIFECYCLE_PROBES_REQUIRED',
    '                   Require lifecycle probe controls (default: true)',
    '  CONTROL_PLANE_WORK_CLASS_SCHEDULER_REQUIRED',
    '                   Require work-class scheduler controls (default: true)',
    '  CONTROL_PLANE_DURABLE_JOIN_SESSIONS_REQUIRED',
    '                   Require durable join-session controls (default: true)',
  ],
  SEA_NATIVE_ERROR: 'Error: Native modules not available.',
  SEA_NATIVE_HELP: [
    'The distributed database system requires native modules that',
    'cannot be bundled into a single executable:',
    '  - better-sqlite3 (SQLite bindings)',
    '  - piscina (worker thread pool)',
  ],
  SEA_RUN_INSTRUCTIONS: [
    'To run the system, either:',
    '  1. Use "npm start" with Node.js installed',
    '  2. Install native modules in the same directory as the executable',
  ],
  FATAL_ERROR_PREFIX: 'Fatal error:',
});

export {
  ENTRYPOINT_APP,
  ENTRYPOINT_DEFAULT,
  ENTRYPOINT_ERROR_MSG,
  ENTRYPOINT_ENV,
  ENTRYPOINT_FLAG,
  ENTRYPOINT_LOG_MSG,
  ENTRYPOINT_REJOIN_DEFAULT,
  ENTRYPOINT_RUNTIME_VALUE,
  ENTRYPOINT_SUBSYSTEM,
  ENTRYPOINT_TEXT,
  ENTRYPOINT_VERSION,
};
