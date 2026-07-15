import {CONFIG_KEY} from './config/config-constants.js';
import {resolveControlPlaneRolloutControls} from
  './runtime/control-plane-rollout-controls.js';
import {resolveListenerPorts} from './config/listener-port-model.js';
import {TRANSPORT_CONFIG_KEY} from './constants/transport.js';
import {resolveAdvertisedWebSocketAddress} from
  './transport/node-address-resolution.js';
import {
  ENTRYPOINT_DEFAULT,
  ENTRYPOINT_ENV,
  ENTRYPOINT_FLAG,
  ENTRYPOINT_TEXT,
} from './constants/entrypoint.js';

const LOCAL_STR_OPTIONS = 'Options:';
const LOCAL_STR_ENVIRONMENT = 'Environment:';

/**
 * Check for version flag.
 * @param {string} version
 * @return {boolean} True if version was printed.
 */
function checkVersionFlag(version) {
  const args = process.argv.slice(2);
  if (
    args.includes(ENTRYPOINT_FLAG.VERSION_LONG) ||
    args.includes(ENTRYPOINT_FLAG.VERSION_SHORT)
  ) {
    console.log(ENTRYPOINT_TEXT.versionLine(version));
    return true;
  }
  if (
    args.includes(ENTRYPOINT_FLAG.HELP_LONG) ||
    args.includes(ENTRYPOINT_FLAG.HELP_SHORT)
  ) {
    console.log(ENTRYPOINT_TEXT.headerLine(version));
    console.log('');
    console.log(ENTRYPOINT_TEXT.USAGE_LINE);
    console.log('');
    console.log(LOCAL_STR_OPTIONS);
    for (const line of ENTRYPOINT_TEXT.OPTIONS_LINES) {
      console.log(line);
    }
    console.log('');
    console.log(LOCAL_STR_ENVIRONMENT);
    for (const line of ENTRYPOINT_TEXT.ENVIRONMENT_LINES) {
      console.log(line);
    }
    return true;
  }
  return false;
}

/**
 * Parse command-line arguments.
 * @return {Object} Parsed arguments.
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const result = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === ENTRYPOINT_FLAG.DATA_DIR && i + 1 < args.length) {
      result.dataDir = args[i + 1];
      i++;
    } else if (args[i] === ENTRYPOINT_FLAG.SEED && i + 1 < args.length) {
      result.seedNodeAddress = args[i + 1];
      i++;
    } else if (args[i] === ENTRYPOINT_FLAG.CONFIG && i + 1 < args.length) {
      result.configPath = args[i + 1];
      i++;
    } else if (args[i] === ENTRYPOINT_FLAG.DRY_RUN) {
      result.dryRun = true;
    }
  }

  return result;
}

/**
 * Parse a positive millisecond value from environment input.
 * @param {string|number|undefined} value
 * @return {number|null}
 */
function parsePositiveTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return Math.floor(parsed);
}

/**
 * Resolve rollout controls from environment overrides.
 * @param {Object} env
 * @return {Object}
 */
function resolveRolloutControlsFromEnvironment(env) {
  return resolveControlPlaneRolloutControls({
    lifecycleProbes:
      env[ENTRYPOINT_ENV.CONTROL_PLANE_LIFECYCLE_PROBES_REQUIRED],
    workClassScheduler:
      env[ENTRYPOINT_ENV.CONTROL_PLANE_WORK_CLASS_SCHEDULER_REQUIRED],
    durableJoinSessions:
      env[ENTRYPOINT_ENV.CONTROL_PLANE_DURABLE_JOIN_SESSIONS_REQUIRED],
  });
}

/**
 * Resolve runtime-facing node addresses from config.
 * @param {Object} config
 * @return {Object}
 */
function resolveRuntimeAddresses(config) {
  const listenerPorts = resolveListenerPorts({
    restApiPort: config.get(CONFIG_KEY.NODE_REST_API_PORT),
    adminWebSocketPort:
      config.get(CONFIG_KEY.ADMIN_WEBSOCKET_PORT) ?? undefined,
    transportWebSocketPort:
      config.get(CONFIG_KEY.NODE_WS_PORT) ?? undefined,
  });
  const restApiPort = listenerPorts.restApiPort;
  const wsPort = listenerPorts.transportWebSocketPort;
  const nodeHttpAddress =
    config.get(CONFIG_KEY.NODE_ADDRESS) ||
    `${ENTRYPOINT_DEFAULT.LOCALHOST}:${restApiPort}`;
  const advertisedNodeWsAddress =
    resolveAdvertisedWebSocketAddress({
      advertisedAddress: config.get(
        CONFIG_KEY.NODE_ADVERTISED_WS_ADDRESS,
      ),
      nodeAddress: nodeHttpAddress,
      wsPort,
      wsHost: config.get(TRANSPORT_CONFIG_KEY.WS_HOST),
    });
  return {
    restApiPort,
    adminWebSocketPort: listenerPorts.adminWebSocketPort,
    wsPort,
    nodeHttpAddress,
    advertisedNodeWsAddress,
  };
}

export {
  checkVersionFlag,
  parseCommandLineArgs,
  parsePositiveTimeoutMs,
  resolveRuntimeAddresses,
  resolveRolloutControlsFromEnvironment,
};
