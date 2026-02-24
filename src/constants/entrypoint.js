const ENTRYPOINT_VERSION = '1.0.0';

const ENTRYPOINT_APP = Object.freeze({
  NAME: 'Distributed Database System',
  CLI_NAME: 'distributed-db',
  PACKAGE_NAME: 'distributed-database-system',
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
  PORT: 'PORT',
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
  REST_API_PORT: 8080,
  WS_PORT_OFFSET: 2,
  READINESS_DRAIN_DEADLINE_MS: 10000,
  LOCALHOST: 'localhost',
  HTTP_PREFIX: 'http://',
});

const ENTRYPOINT_SUBSYSTEM = Object.freeze({
  MAIN: 'main',
  CONFIG: 'config',
});

const ENTRYPOINT_LOG_MSG = Object.freeze({
  STARTING: 'Distributed Database System starting',
  JOINING_CLUSTER: 'Joining existing cluster',
  FAILED_JOIN: 'Failed to join cluster',
  JOINED_CLUSTER: 'Successfully joined cluster',
  LOGS_TABLE_CONNECTED: 'Connected logging persistence to logs table',
  LOGS_TABLE_CONNECT_SKIPPED: 'Skipping logs table persistence (CDC unavailable)',
  LOGS_TABLE_CONNECT_FAILED: 'Failed to connect logs table persistence',
  LOGS_TABLE_SHUTDOWN_FAILED: 'Failed to shutdown logs table persistence',
  DYNAMIC_CONFIG_WIRING_FAILED: 'Failed to initialize runtime dynamic config wiring',
  DYNAMIC_CONFIG_WIRING_SHUTDOWN_FAILED: 'Failed to shutdown dynamic config wiring',
  STARTING_SEED: 'Starting as seed node',
  BOOTSTRAP_FAILED: 'Bootstrap failed',
  BOOTSTRAP_COMPLETED: 'Bootstrap completed',
  READINESS_TRANSITION: 'Bootstrap readiness state transitioned',
  READINESS_BLOCKED_DURATION: 'Bootstrap readiness blocker duration observed',
  READINESS_DRAINING: 'Bootstrap readiness marked draining',
  WS_STARTED: 'WebSocket server started for cross-node communication',
  WS_START_FAILED: 'Failed to start WebSocket server',
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
    '  --seed <url>     Seed node URL to join existing cluster',
    '  --config <path>  Path to configuration file',
    '  --data-dir <path>  Base directory for partition storage',
    '  --dry-run        Validate configuration without starting',
  ],
  ENVIRONMENT_LINES: [
    '  NODE_ID          Override auto-generated node ID',
    '  LOG_LEVEL        Set logging level (error, warn, info, debug)',
    '  PORT             REST API port (default: 8080); WS uses +2 offset',
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
  ENTRYPOINT_SUBSYSTEM,
  ENTRYPOINT_TEXT,
  ENTRYPOINT_VERSION,
};
