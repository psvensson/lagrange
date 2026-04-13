// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
const ENTRYPOINT_VERSION = stryMutAct_9fa48("54511") ? "" : (stryCov_9fa48("54511"), '1.0.0');
const ENTRYPOINT_APP = Object.freeze(stryMutAct_9fa48("54512") ? {} : (stryCov_9fa48("54512"), {
  NAME: stryMutAct_9fa48("54513") ? "" : (stryCov_9fa48("54513"), 'Distributed Database System'),
  CLI_NAME: stryMutAct_9fa48("54514") ? "" : (stryCov_9fa48("54514"), 'distributed-db'),
  PACKAGE_NAME: stryMutAct_9fa48("54515") ? "" : (stryCov_9fa48("54515"), 'distributed-database-system')
}));
const ENTRYPOINT_FLAG = Object.freeze(stryMutAct_9fa48("54516") ? {} : (stryCov_9fa48("54516"), {
  VERSION_LONG: stryMutAct_9fa48("54517") ? "" : (stryCov_9fa48("54517"), '--version'),
  VERSION_SHORT: stryMutAct_9fa48("54518") ? "" : (stryCov_9fa48("54518"), '-v'),
  HELP_LONG: stryMutAct_9fa48("54519") ? "" : (stryCov_9fa48("54519"), '--help'),
  HELP_SHORT: stryMutAct_9fa48("54520") ? "" : (stryCov_9fa48("54520"), '-h'),
  SEED: stryMutAct_9fa48("54521") ? "" : (stryCov_9fa48("54521"), '--seed'),
  CONFIG: stryMutAct_9fa48("54522") ? "" : (stryCov_9fa48("54522"), '--config'),
  DATA_DIR: stryMutAct_9fa48("54523") ? "" : (stryCov_9fa48("54523"), '--data-dir'),
  DRY_RUN: stryMutAct_9fa48("54524") ? "" : (stryCov_9fa48("54524"), '--dry-run')
}));
const ENTRYPOINT_ENV = Object.freeze(stryMutAct_9fa48("54525") ? {} : (stryCov_9fa48("54525"), {
  NODE_ID: stryMutAct_9fa48("54526") ? "" : (stryCov_9fa48("54526"), 'NODE_ID'),
  LOG_LEVEL: stryMutAct_9fa48("54527") ? "" : (stryCov_9fa48("54527"), 'LOG_LEVEL'),
  PORT: stryMutAct_9fa48("54528") ? "" : (stryCov_9fa48("54528"), 'PORT'),
  NODE_ADVERTISED_WS_ADDRESS: stryMutAct_9fa48("54529") ? "" : (stryCov_9fa48("54529"), 'NODE_ADVERTISED_WS_ADDRESS'),
  SEED_NODE_ADDRESS: stryMutAct_9fa48("54530") ? "" : (stryCov_9fa48("54530"), 'SEED_NODE_ADDRESS'),
  JOINING_HTTP_TIMEOUT_MS: stryMutAct_9fa48("54531") ? "" : (stryCov_9fa48("54531"), 'NODE_JOINING_HTTP_TIMEOUT_MS'),
  JOINING_LEADERSHIP_WAIT_TIMEOUT_MS: stryMutAct_9fa48("54532") ? "" : (stryCov_9fa48("54532"), 'NODE_JOINING_LEADERSHIP_WAIT_TIMEOUT_MS'),
  CONTROL_PLANE_LIFECYCLE_PROBES_REQUIRED: stryMutAct_9fa48("54533") ? "" : (stryCov_9fa48("54533"), 'CONTROL_PLANE_LIFECYCLE_PROBES_REQUIRED'),
  CONTROL_PLANE_WORK_CLASS_SCHEDULER_REQUIRED: stryMutAct_9fa48("54534") ? "" : (stryCov_9fa48("54534"), 'CONTROL_PLANE_WORK_CLASS_SCHEDULER_REQUIRED'),
  CONTROL_PLANE_DURABLE_JOIN_SESSIONS_REQUIRED: stryMutAct_9fa48("54535") ? "" : (stryCov_9fa48("54535"), 'CONTROL_PLANE_DURABLE_JOIN_SESSIONS_REQUIRED')
}));
const ENTRYPOINT_DEFAULT = Object.freeze(stryMutAct_9fa48("54536") ? {} : (stryCov_9fa48("54536"), {
  REST_API_PORT: 8080,
  WS_PORT_OFFSET: 2,
  READINESS_DRAIN_DEADLINE_MS: 10000,
  LOCALHOST: stryMutAct_9fa48("54537") ? "" : (stryCov_9fa48("54537"), 'localhost'),
  HTTP_PREFIX: stryMutAct_9fa48("54538") ? "" : (stryCov_9fa48("54538"), 'http://'),
  AUTO_REJOIN_HEALTH_PATH: stryMutAct_9fa48("54539") ? "" : (stryCov_9fa48("54539"), '/health'),
  AUTO_REJOIN_PROBE_TIMEOUT_MS: 1000
}));
const ENTRYPOINT_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("54540") ? {} : (stryCov_9fa48("54540"), {
  MAIN: stryMutAct_9fa48("54541") ? "" : (stryCov_9fa48("54541"), 'main'),
  CONFIG: stryMutAct_9fa48("54542") ? "" : (stryCov_9fa48("54542"), 'config')
}));
const ENTRYPOINT_LOG_MSG = Object.freeze(stryMutAct_9fa48("54543") ? {} : (stryCov_9fa48("54543"), {
  STARTING: stryMutAct_9fa48("54544") ? "" : (stryCov_9fa48("54544"), 'Distributed Database System starting'),
  DRY_RUN_COMPLETED: stryMutAct_9fa48("54545") ? "" : (stryCov_9fa48("54545"), 'Dry run completed'),
  JOINING_CLUSTER: stryMutAct_9fa48("54546") ? "" : (stryCov_9fa48("54546"), 'Joining existing cluster'),
  AUTO_REJOINING_CLUSTER: stryMutAct_9fa48("54547") ? "" : (stryCov_9fa48("54547"), 'Restarting node will auto-rejoin existing cluster'),
  AUTO_REJOIN_DECISION: stryMutAct_9fa48("54548") ? "" : (stryCov_9fa48("54548"), 'Resolved startup auto-rejoin decision'),
  FAILED_JOIN: stryMutAct_9fa48("54549") ? "" : (stryCov_9fa48("54549"), 'Failed to join cluster'),
  JOINED_CLUSTER: stryMutAct_9fa48("54550") ? "" : (stryCov_9fa48("54550"), 'Successfully joined cluster'),
  LOGS_TABLE_CONNECTED: stryMutAct_9fa48("54551") ? "" : (stryCov_9fa48("54551"), 'Connected logging persistence to logs table'),
  LOGS_TABLE_CONNECT_SKIPPED: stryMutAct_9fa48("54552") ? "" : (stryCov_9fa48("54552"), 'Skipping logs table persistence (CDC unavailable)'),
  LOGS_TABLE_CONNECT_FAILED: stryMutAct_9fa48("54553") ? "" : (stryCov_9fa48("54553"), 'Failed to connect logs table persistence'),
  LOGS_TABLE_BACKGROUND_CONNECT_FAILED: stryMutAct_9fa48("54554") ? "" : (stryCov_9fa48("54554"), 'Background logs table persistence setup failed'),
  LOGS_TABLE_SHUTDOWN_FAILED: stryMutAct_9fa48("54555") ? "" : (stryCov_9fa48("54555"), 'Failed to shutdown logs table persistence'),
  DYNAMIC_CONFIG_WIRING_FAILED: stryMutAct_9fa48("54556") ? "" : (stryCov_9fa48("54556"), 'Failed to initialize runtime dynamic config wiring'),
  DYNAMIC_CONFIG_WIRING_SHUTDOWN_FAILED: stryMutAct_9fa48("54557") ? "" : (stryCov_9fa48("54557"), 'Failed to shutdown dynamic config wiring'),
  STARTING_SEED: stryMutAct_9fa48("54558") ? "" : (stryCov_9fa48("54558"), 'Starting as seed node'),
  BOOTSTRAP_FAILED: stryMutAct_9fa48("54559") ? "" : (stryCov_9fa48("54559"), 'Bootstrap failed'),
  BOOTSTRAP_COMPLETED: stryMutAct_9fa48("54560") ? "" : (stryCov_9fa48("54560"), 'Bootstrap completed'),
  STARTUP_RUNTIME_HANDOFF: stryMutAct_9fa48("54561") ? "" : (stryCov_9fa48("54561"), 'Startup runtime handoff completed'),
  READINESS_TRANSITION: stryMutAct_9fa48("54562") ? "" : (stryCov_9fa48("54562"), 'Bootstrap readiness state transitioned'),
  READINESS_BLOCKED_DURATION: stryMutAct_9fa48("54563") ? "" : (stryCov_9fa48("54563"), 'Bootstrap readiness blocker duration observed'),
  READINESS_DRAINING: stryMutAct_9fa48("54564") ? "" : (stryCov_9fa48("54564"), 'Bootstrap readiness marked draining'),
  WS_STARTED: stryMutAct_9fa48("54565") ? "" : (stryCov_9fa48("54565"), 'WebSocket server started for cross-node communication'),
  WS_START_FAILED: stryMutAct_9fa48("54566") ? "" : (stryCov_9fa48("54566"), 'Failed to start WebSocket server'),
  ADMIN_RUNTIME_STARTED: stryMutAct_9fa48("54567") ? "" : (stryCov_9fa48("54567"), 'Admin runtime started'),
  ADMIN_RUNTIME_SQL_ENGINE_ATTACHED: stryMutAct_9fa48("54568") ? "" : (stryCov_9fa48("54568"), 'Admin runtime SQL engine attached'),
  PROCESS_BEFORE_EXIT: stryMutAct_9fa48("54569") ? "" : (stryCov_9fa48("54569"), 'Process beforeExit observed'),
  PROCESS_EXIT: stryMutAct_9fa48("54570") ? "" : (stryCov_9fa48("54570"), 'Process exit observed'),
  PROCESS_UNCAUGHT_EXCEPTION: stryMutAct_9fa48("54571") ? "" : (stryCov_9fa48("54571"), 'Process uncaught exception observed'),
  PROCESS_UNHANDLED_REJECTION: stryMutAct_9fa48("54572") ? "" : (stryCov_9fa48("54572"), 'Process unhandled rejection observed'),
  STARTUP_LIVENESS_PULSE: stryMutAct_9fa48("54573") ? "" : (stryCov_9fa48("54573"), 'Startup liveness pulse observed'),
  NODE_READY: stryMutAct_9fa48("54574") ? "" : (stryCov_9fa48("54574"), 'Node fully operational'),
  SHUTDOWN: stryMutAct_9fa48("54575") ? "" : (stryCov_9fa48("54575"), 'Shutting down...')
}));
const ENTRYPOINT_ERROR_MSG = Object.freeze(stryMutAct_9fa48("54576") ? {} : (stryCov_9fa48("54576"), {
  SYSTEM_TABLE_CACHE_REQUIRED: stryMutAct_9fa48("54577") ? "" : (stryCov_9fa48("54577"), 'System table cache required after join'),
  LIVE_QUERY_MANAGER_REQUIRED: stryMutAct_9fa48("54578") ? "" : (stryCov_9fa48("54578"), 'Live query manager required during startup')
}));
const ENTRYPOINT_TEXT = Object.freeze(stryMutAct_9fa48("54579") ? {} : (stryCov_9fa48("54579"), {
  versionLine: stryMutAct_9fa48("54580") ? () => undefined : (stryCov_9fa48("54580"), version => stryMutAct_9fa48("54581") ? `` : (stryCov_9fa48("54581"), `${ENTRYPOINT_APP.PACKAGE_NAME} v${version}`)),
  headerLine: stryMutAct_9fa48("54582") ? () => undefined : (stryCov_9fa48("54582"), version => stryMutAct_9fa48("54583") ? `` : (stryCov_9fa48("54583"), `${ENTRYPOINT_APP.NAME} v${version}`)),
  USAGE_LINE: stryMutAct_9fa48("54584") ? `` : (stryCov_9fa48("54584"), `Usage: ${ENTRYPOINT_APP.CLI_NAME} [options]`),
  OPTIONS_LINES: stryMutAct_9fa48("54585") ? [] : (stryCov_9fa48("54585"), [stryMutAct_9fa48("54586") ? "" : (stryCov_9fa48("54586"), '  --version, -v    Show version number'), stryMutAct_9fa48("54587") ? "" : (stryCov_9fa48("54587"), '  --help, -h       Show this help message'), stryMutAct_9fa48("54588") ? "" : (stryCov_9fa48("54588"), '  --seed <url>     Seed node URL to join existing cluster'), stryMutAct_9fa48("54589") ? "" : (stryCov_9fa48("54589"), '  --config <path>  Path to configuration file'), stryMutAct_9fa48("54590") ? "" : (stryCov_9fa48("54590"), '  --data-dir <path>  Base directory for partition storage'), stryMutAct_9fa48("54591") ? "" : (stryCov_9fa48("54591"), '  --dry-run        Validate configuration without starting')]),
  ENVIRONMENT_LINES: stryMutAct_9fa48("54592") ? [] : (stryCov_9fa48("54592"), [stryMutAct_9fa48("54593") ? "" : (stryCov_9fa48("54593"), '  NODE_ID          Override auto-generated node ID'), stryMutAct_9fa48("54594") ? "" : (stryCov_9fa48("54594"), '  LOG_LEVEL        Set logging level (error, warn, info, debug)'), stryMutAct_9fa48("54595") ? "" : (stryCov_9fa48("54595"), '  PORT             REST API port (default: 8080); WS uses +2 offset'), stryMutAct_9fa48("54596") ? "" : (stryCov_9fa48("54596"), '  CONTROL_PLANE_LIFECYCLE_PROBES_REQUIRED'), stryMutAct_9fa48("54597") ? "" : (stryCov_9fa48("54597"), '                   Require lifecycle probe controls (default: true)'), stryMutAct_9fa48("54598") ? "" : (stryCov_9fa48("54598"), '  CONTROL_PLANE_WORK_CLASS_SCHEDULER_REQUIRED'), stryMutAct_9fa48("54599") ? "" : (stryCov_9fa48("54599"), '                   Require work-class scheduler controls (default: true)'), stryMutAct_9fa48("54600") ? "" : (stryCov_9fa48("54600"), '  CONTROL_PLANE_DURABLE_JOIN_SESSIONS_REQUIRED'), stryMutAct_9fa48("54601") ? "" : (stryCov_9fa48("54601"), '                   Require durable join-session controls (default: true)')]),
  SEA_NATIVE_ERROR: stryMutAct_9fa48("54602") ? "" : (stryCov_9fa48("54602"), 'Error: Native modules not available.'),
  SEA_NATIVE_HELP: stryMutAct_9fa48("54603") ? [] : (stryCov_9fa48("54603"), [stryMutAct_9fa48("54604") ? "" : (stryCov_9fa48("54604"), 'The distributed database system requires native modules that'), stryMutAct_9fa48("54605") ? "" : (stryCov_9fa48("54605"), 'cannot be bundled into a single executable:'), stryMutAct_9fa48("54606") ? "" : (stryCov_9fa48("54606"), '  - better-sqlite3 (SQLite bindings)'), stryMutAct_9fa48("54607") ? "" : (stryCov_9fa48("54607"), '  - piscina (worker thread pool)')]),
  SEA_RUN_INSTRUCTIONS: stryMutAct_9fa48("54608") ? [] : (stryCov_9fa48("54608"), [stryMutAct_9fa48("54609") ? "" : (stryCov_9fa48("54609"), 'To run the system, either:'), stryMutAct_9fa48("54610") ? "" : (stryCov_9fa48("54610"), '  1. Use "npm start" with Node.js installed'), stryMutAct_9fa48("54611") ? "" : (stryCov_9fa48("54611"), '  2. Install native modules in the same directory as the executable')]),
  FATAL_ERROR_PREFIX: stryMutAct_9fa48("54612") ? "" : (stryCov_9fa48("54612"), 'Fatal error:')
}));
export { ENTRYPOINT_APP, ENTRYPOINT_DEFAULT, ENTRYPOINT_ERROR_MSG, ENTRYPOINT_ENV, ENTRYPOINT_FLAG, ENTRYPOINT_LOG_MSG, ENTRYPOINT_SUBSYSTEM, ENTRYPOINT_TEXT, ENTRYPOINT_VERSION };