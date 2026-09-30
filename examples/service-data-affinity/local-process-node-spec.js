// Pure node-spec, environment, and entrypoint derivation for the local-process
// owner. This module acquires no process or filesystem resource.
import {randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {dirname, parse, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validate as uuidValidate} from 'uuid';
import {
  CONFIG_KEY,
  ENV_MAPPINGS,
  LEGACY_ENV_ALIASES,
} from '../../src/config/config-constants.js';
import {resolveListenerPorts} from '../../src/config/listener-port-model.js';

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENTRYPOINT_PATH = resolve(REPOSITORY_ROOT, 'src/index.js');
const BASE_REST_PORT = 8080;
const PORT_STRIDE = 4;
const LOCAL_PROCESS_CLUSTER_FAILURE = Object.freeze({
  ACQUISITION_TIMEOUT: 'LOCAL_PROCESS_CLUSTER_ACQUISITION_TIMEOUT',
  DATA_ROOT_AUTHORITY: 'LOCAL_PROCESS_CLUSTER_DATA_ROOT_AUTHORITY',
  DUPLICATE_NODE: 'LOCAL_PROCESS_CLUSTER_DUPLICATE_NODE',
  EARLY_EXIT: 'LOCAL_PROCESS_CLUSTER_EARLY_EXIT',
  EXECUTION_CWD_FAILURE: 'LOCAL_PROCESS_CLUSTER_EXECUTION_CWD_FAILURE',
  FORCED_KILL: 'LOCAL_PROCESS_CLUSTER_FORCED_KILL',
  INVALID_NODE_SPEC: 'LOCAL_PROCESS_CLUSTER_INVALID_NODE_SPEC',
  KILL_REFUSED: 'LOCAL_PROCESS_CLUSTER_KILL_REFUSED',
  LOG_FAILURE: 'LOCAL_PROCESS_CLUSTER_LOG_FAILURE',
  NONZERO_EXIT: 'LOCAL_PROCESS_CLUSTER_NONZERO_EXIT',
  POST_FORCE_TIMEOUT: 'LOCAL_PROCESS_CLUSTER_POST_FORCE_TIMEOUT',
  RESTART_PREDECESSOR_CLOSE_TIMEOUT:
    'LOCAL_PROCESS_CLUSTER_RESTART_PREDECESSOR_CLOSE_TIMEOUT',
  RESTART_REQUIRED: 'LOCAL_PROCESS_CLUSTER_RESTART_REQUIRED',
  RESTART_REFUSED: 'LOCAL_PROCESS_CLUSTER_RESTART_REFUSED',
  RESTART_RESET_FAILURE: 'LOCAL_PROCESS_CLUSTER_RESTART_RESET_FAILURE',
  SPAWN_FAILURE: 'LOCAL_PROCESS_CLUSTER_SPAWN_FAILURE',
  STALE_RESTART: 'LOCAL_PROCESS_CLUSTER_STALE_RESTART',
  STOP_FAILURE: 'LOCAL_PROCESS_CLUSTER_STOP_FAILURE',
  STREAM_TIMEOUT: 'LOCAL_PROCESS_CLUSTER_STREAM_TIMEOUT',
  WAIT_TIMEOUT: 'LOCAL_PROCESS_CLUSTER_WAIT_TIMEOUT',
});
const NODE_SCOPED_ENVIRONMENT_NAME_PATTERN = new RegExp(
  '^(?:ADMIN_|CONTROL_PLANE_|DATA_DIR$|DEBUG$|ENDPOINT_SYNC_|' +
  'FORCE_NEW_CLUSTER$|LAGRANGE_|LATENCY_|LOG_|MESSAGE_GROUP_|NODE_|' +
  'PARTITION_|PGWIRE_|RAFT_|REBALANCER_|SEED_|TAP(?:_|$)|TEST(?:_|$)|' +
  'TRANSPORT_|WORKER_)',
  'u',
);

function environmentNameFor(configKey) {
  const match = Object.entries(ENV_MAPPINGS).find(
    ([, mappedConfigKey]) => mappedConfigKey === configKey);
  if (!match) throw new Error(`Missing environment mapping for ${configKey}`);
  return match[0];
}

const LOCAL_PROCESS_ENVIRONMENT_NAME = Object.freeze({
  ADMIN_PORT: environmentNameFor(CONFIG_KEY.ADMIN_WEBSOCKET_PORT),
  DATA_DIR: environmentNameFor(CONFIG_KEY.STORAGE_DATA_DIR),
  LOG_LEVEL: environmentNameFor(CONFIG_KEY.LOGGING_LEVEL),
  NODE_ADDRESS: environmentNameFor(CONFIG_KEY.NODE_ADDRESS),
  NODE_ID: environmentNameFor(CONFIG_KEY.NODE_ID),
  PARTITION_EVALUATION_INTERVAL_MS:
    environmentNameFor(CONFIG_KEY.PARTITION_EVALUATION_INTERVAL_MS),
  REST_PORT: environmentNameFor(CONFIG_KEY.NODE_REST_API_PORT),
  SEED_ADDRESS: environmentNameFor(CONFIG_KEY.NODE_SEED_NODE_ADDRESS),
  TRANSPORT_PORT: environmentNameFor(CONFIG_KEY.NODE_WS_PORT),
});

function createLocalProcessError(code, message, details = {}, cause = null) {
  const error = new Error(message, cause ? {cause} : undefined);
  error.code = code;
  error.details = details;
  return error;
}

function validateEnvironmentOverrides(overrides = {}) {
  const acceptedNames = new Set([
    LOCAL_PROCESS_ENVIRONMENT_NAME.PARTITION_EVALUATION_INTERVAL_MS,
  ]);
  const invalid = Object.keys(overrides).filter(
    (name) => !acceptedNames.has(name));
  if (invalid.length > 0) {
    throw createLocalProcessError(
      LOCAL_PROCESS_CLUSTER_FAILURE.INVALID_NODE_SPEC,
      `Unsupported local node environment override: ${invalid.join(', ')}`,
      {invalidEnvironmentOverrides: invalid});
  }
  const interval = overrides[
    LOCAL_PROCESS_ENVIRONMENT_NAME.PARTITION_EVALUATION_INTERVAL_MS];
  if (interval !== undefined &&
      (!Number.isSafeInteger(Number(interval)) || Number(interval) < 60000)) {
    throw createLocalProcessError(
      LOCAL_PROCESS_CLUSTER_FAILURE.INVALID_NODE_SPEC,
      'Local process environment cannot shorten production cadence',
      {evaluationInterval: interval});
  }
  return {...overrides};
}

function scrubInheritedNodeEnvironment(inherited = {}) {
  const environment = {...inherited};
  const mappedNames = [
    ...Object.keys(ENV_MAPPINGS),
    ...Object.keys(LEGACY_ENV_ALIASES),
    ...Object.values(LEGACY_ENV_ALIASES),
  ];
  for (const name of new Set(mappedNames)) delete environment[name];
  for (const name of Object.keys(environment)) {
    if (NODE_SCOPED_ENVIRONMENT_NAME_PATTERN.test(name)) delete environment[name];
  }
  return environment;
}

function dataDirectoryIsSafe(dataDir) {
  if (typeof dataDir !== 'string' || dataDir.length === 0) return false;
  const resolved = resolve(dataDir);
  return !new Set([
    parse(resolved).root,
    resolve('.'),
    REPOSITORY_ROOT,
    homedir(),
  ]).has(resolved);
}

const NODE_SPEC_FIELD_VALIDATORS = Object.freeze({
  index: (spec) => Number.isInteger(spec?.index) && spec.index >= 0,
  nodeId: (spec) => typeof spec?.nodeId === 'string' && uuidValidate(spec.nodeId),
  dataDir: (spec) => dataDirectoryIsSafe(spec?.dataDir),
  restPort: (spec) => Number.isInteger(spec?.restPort),
  adminPort: (spec) => Number.isInteger(spec?.adminPort),
  transportPort: (spec) => Number.isInteger(spec?.transportPort),
  seedAddresses: (spec) => Array.isArray(spec?.seedAddresses) &&
    spec.seedAddresses.every((address) =>
      typeof address === 'string' && address.trim().length > 0),
});

function resolveNodeSpecPorts(spec) {
  try {
    return resolveListenerPorts({
      restApiPort: spec.restPort,
      adminWebSocketPort: spec.adminPort,
      transportWebSocketPort: spec.transportPort,
    });
  } catch (cause) {
    throw createLocalProcessError(
      LOCAL_PROCESS_CLUSTER_FAILURE.INVALID_NODE_SPEC,
      'Invalid local process listener ports',
      {restPort: spec.restPort, adminPort: spec.adminPort,
        transportPort: spec.transportPort}, cause);
  }
}

function validateLocalProcessNodeSpec(spec) {
  const invalid = Object.entries(NODE_SPEC_FIELD_VALIDATORS)
    .filter(([, validator]) => !validator(spec))
    .map(([field]) => field);
  if (invalid.length > 0) {
    throw createLocalProcessError(
      LOCAL_PROCESS_CLUSTER_FAILURE.INVALID_NODE_SPEC,
      `Invalid local process node spec: ${invalid.join(', ')}`, {invalid});
  }
  const ports = resolveNodeSpecPorts(spec);
  return Object.freeze({
    index: spec.index,
    nodeId: spec.nodeId,
    dataDir: resolve(spec.dataDir),
    restPort: ports.restApiPort,
    adminPort: ports.adminWebSocketPort,
    transportPort: ports.transportWebSocketPort,
    seedAddresses: Object.freeze([...spec.seedAddresses]),
  });
}

function buildLocalNodeSpec(index, dataRoot, nodeId = randomUUID()) {
  const restPort = BASE_REST_PORT + index * PORT_STRIDE;
  const ports = resolveListenerPorts({restApiPort: restPort});
  return {
    index,
    nodeId,
    dataDir: resolve(dataRoot, `node-${index}`),
    restPort: ports.restApiPort,
    adminPort: ports.adminWebSocketPort,
    transportPort: ports.transportWebSocketPort,
    seedAddresses: index === 0 ? [] : [`localhost:${BASE_REST_PORT}`],
  };
}

function buildNodeEnvironment(spec, options) {
  const environment = scrubInheritedNodeEnvironment(options.inheritedEnvironment);
  Object.assign(environment, validateEnvironmentOverrides(
    options.environmentOverrides));
  environment[LOCAL_PROCESS_ENVIRONMENT_NAME.NODE_ID] = spec.nodeId;
  environment[LOCAL_PROCESS_ENVIRONMENT_NAME.NODE_ADDRESS] =
    `localhost:${spec.restPort}`;
  environment[LOCAL_PROCESS_ENVIRONMENT_NAME.REST_PORT] = String(spec.restPort);
  environment[LOCAL_PROCESS_ENVIRONMENT_NAME.ADMIN_PORT] = String(spec.adminPort);
  environment[LOCAL_PROCESS_ENVIRONMENT_NAME.TRANSPORT_PORT] =
    String(spec.transportPort);
  environment[LOCAL_PROCESS_ENVIRONMENT_NAME.DATA_DIR] = spec.dataDir;
  environment[LOCAL_PROCESS_ENVIRONMENT_NAME.LOG_LEVEL] = options.logLevel;
  delete environment[LOCAL_PROCESS_ENVIRONMENT_NAME.SEED_ADDRESS];
  return environment;
}

function resolveLocalProcessAcquisitionOptions(spec, options) {
  return {
    logRoot: resolve(options.logRoot || dirname(spec.dataDir)),
    createLog: options.createLogStream,
    spawn: options.spawn,
    generation: Number.isInteger(options.generation) ? options.generation : 0,
    environment: buildNodeEnvironment(spec, {
      environmentOverrides: options.environmentOverrides,
      inheritedEnvironment: options.inheritedEnvironment,
      logLevel: options.logLevel,
    }),
  };
}

function buildLocalProcessEntrypointArguments(spec) {
  const args = [ENTRYPOINT_PATH, '--data-dir', spec.dataDir];
  if (spec.seedAddresses.length > 0) args.push('--seed', spec.seedAddresses.join(','));
  return args;
}

export {
  LOCAL_PROCESS_CLUSTER_FAILURE,
  LOCAL_PROCESS_ENVIRONMENT_NAME,
  buildLocalNodeSpec,
  buildLocalProcessEntrypointArguments,
  createLocalProcessError,
  resolveLocalProcessAcquisitionOptions,
  validateEnvironmentOverrides,
  validateLocalProcessNodeSpec,
};
