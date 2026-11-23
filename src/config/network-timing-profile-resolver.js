/**
 * Canonical static network timing profile resolver and applier.
 * Defines validated timing presets for Raft, transport, control-plane budgets,
 * and short readiness observation probes, reporting both requested values and
 * effective raft-rs tick-quantized timing.
 */

import {
  CONFIG_KEY,
  CONFIG_SEED_SOURCE,
  CONFIG_TABLE_COLUMN,
} from './config-constants.js';
import {ConfigurationManager} from './configuration-manager.js';
import {ENTRYPOINT_ENV} from '../constants/entrypoint.js';
import {TRANSPORT_CONFIG_KEY} from '../constants/transport.js';
import {describeEffectiveRaftRsTiming} from '../raft/raft-rs-runtime-tuning.js';

const NETWORK_TIMING_PROFILE = Object.freeze({
  DEFAULT: 'default',
  EXPERIMENTAL_WIFI_SLOW: 'experimental-wifi-slow',
});

const PROFILE_CUSTOM_ID = 'custom';
const TYPE_STRING = 'string';
const TYPE_NUMBER = 'number';
const TYPE_OBJECT = 'object';
const DOUBLE_HEARTBEAT_MULTIPLIER = 2;

const PROFILE_SELECTOR_KEY = Object.freeze({
  PROFILE: 'profile',
  PROFILE_ID: 'profileId',
});

const PROFILE_FIELD = Object.freeze({
  TICK_INTERVAL_MS: 'tickIntervalMs',
  HEARTBEAT_INTERVAL_MS: 'heartbeatIntervalMs',
  ELECTION_TIMEOUT_MIN_MS: 'electionTimeoutMinMs',
  ELECTION_TIMEOUT_MAX_MS: 'electionTimeoutMaxMs',
  TRANSPORT_MESSAGE_TIMEOUT_MS: 'transportMessageTimeoutMs',
  TRANSPORT_PING_TIMEOUT_MS: 'transportPingTimeoutMs',
  TRANSPORT_RECONNECT_INTERVAL_MS: 'transportReconnectIntervalMs',
  CONTROL_PLANE_OPERATION_BUDGET_MS: 'controlPlaneOperationBudgetMs',
  CONTROL_PLANE_READY_LEASE_MS: 'controlPlaneReadyLeaseMs',
  CONTROL_PLANE_HEARTBEAT_INTERVAL_MS: 'controlPlaneHeartbeatIntervalMs',
  CONTROL_PLANE_STALE_HEARTBEAT_MAX_AGE_MS:
    'controlPlaneStaleHeartbeatMaxAgeMs',
  CONTROL_PLANE_REPAIR_STALE_HEARTBEAT_MAX_AGE_MS:
    'controlPlaneRepairStaleHeartbeatMaxAgeMs',
  CONTROL_PLANE_QUERY_TIMEOUT_MS: 'controlPlaneQueryTimeoutMs',
  CONTROL_PLANE_SQL_QUERY_TIMEOUT_MS: 'controlPlaneSqlQueryTimeoutMs',
  SWIM_PROBE_TIMEOUT_MS: 'swimProbeTimeoutMs',
  SWIM_PROBE_INTERVAL_MS: 'swimProbeIntervalMs',
  DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS:
    'dynamicConfigStartupInitialReadTimeoutMs',
  REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS:
    'replicaOperationReadRetryTimeoutMs',
  OPERATION_PERSIST_RETRY_TIMEOUT_MS: 'operationPersistRetryTimeoutMs',
  COORDINATOR_QUERY_TIMEOUT_MS: 'coordinatorQueryTimeoutMs',
  READINESS_OBSERVATION_PROBE_TIMEOUT_MS:
    'readinessObservationProbeTimeoutMs',
});

const REQUIRED_NUMERIC_FIELDS = Object.freeze(Object.values(PROFILE_FIELD));

const ALLOWED_INPUT_KEYS = Object.freeze(new Set([
  ...REQUIRED_NUMERIC_FIELDS,
  PROFILE_SELECTOR_KEY.PROFILE,
  PROFILE_SELECTOR_KEY.PROFILE_ID,
]));

const STATIC_NETWORK_TIMING_PROFILES = Object.freeze({
  [NETWORK_TIMING_PROFILE.DEFAULT]: Object.freeze({
    [PROFILE_FIELD.TICK_INTERVAL_MS]: 20,
    [PROFILE_FIELD.HEARTBEAT_INTERVAL_MS]: 50,
    [PROFILE_FIELD.ELECTION_TIMEOUT_MIN_MS]: 1000,
    [PROFILE_FIELD.ELECTION_TIMEOUT_MAX_MS]: 2000,
    [PROFILE_FIELD.TRANSPORT_MESSAGE_TIMEOUT_MS]: 5000,
    [PROFILE_FIELD.TRANSPORT_PING_TIMEOUT_MS]: 1000,
    [PROFILE_FIELD.TRANSPORT_RECONNECT_INTERVAL_MS]: 1000,
    [PROFILE_FIELD.CONTROL_PLANE_OPERATION_BUDGET_MS]: 10000,
    [PROFILE_FIELD.CONTROL_PLANE_READY_LEASE_MS]: 15000,
    [PROFILE_FIELD.CONTROL_PLANE_HEARTBEAT_INTERVAL_MS]: 5000,
    [PROFILE_FIELD.CONTROL_PLANE_STALE_HEARTBEAT_MAX_AGE_MS]: 30000,
    [PROFILE_FIELD.CONTROL_PLANE_REPAIR_STALE_HEARTBEAT_MAX_AGE_MS]: 10000,
    [PROFILE_FIELD.CONTROL_PLANE_QUERY_TIMEOUT_MS]: 1500,
    [PROFILE_FIELD.CONTROL_PLANE_SQL_QUERY_TIMEOUT_MS]: 5000,
    [PROFILE_FIELD.SWIM_PROBE_TIMEOUT_MS]: 500,
    [PROFILE_FIELD.SWIM_PROBE_INTERVAL_MS]: 1000,
    [PROFILE_FIELD.DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS]: 300,
    [PROFILE_FIELD.REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS]: 1000,
    [PROFILE_FIELD.OPERATION_PERSIST_RETRY_TIMEOUT_MS]: 15000,
    [PROFILE_FIELD.COORDINATOR_QUERY_TIMEOUT_MS]: 30000,
    [PROFILE_FIELD.READINESS_OBSERVATION_PROBE_TIMEOUT_MS]: 1000,
  }),
  [NETWORK_TIMING_PROFILE.EXPERIMENTAL_WIFI_SLOW]: Object.freeze({
    [PROFILE_FIELD.TICK_INTERVAL_MS]: 50,
    [PROFILE_FIELD.HEARTBEAT_INTERVAL_MS]: 150,
    [PROFILE_FIELD.ELECTION_TIMEOUT_MIN_MS]: 9000,
    [PROFILE_FIELD.ELECTION_TIMEOUT_MAX_MS]: 18000,
    [PROFILE_FIELD.TRANSPORT_MESSAGE_TIMEOUT_MS]: 12000,
    [PROFILE_FIELD.TRANSPORT_PING_TIMEOUT_MS]: 3000,
    [PROFILE_FIELD.TRANSPORT_RECONNECT_INTERVAL_MS]: 5000,
    [PROFILE_FIELD.CONTROL_PLANE_OPERATION_BUDGET_MS]: 25000,
    [PROFILE_FIELD.CONTROL_PLANE_READY_LEASE_MS]: 90000,
    [PROFILE_FIELD.CONTROL_PLANE_HEARTBEAT_INTERVAL_MS]: 15000,
    [PROFILE_FIELD.CONTROL_PLANE_STALE_HEARTBEAT_MAX_AGE_MS]: 90000,
    [PROFILE_FIELD.CONTROL_PLANE_REPAIR_STALE_HEARTBEAT_MAX_AGE_MS]: 35000,
    [PROFILE_FIELD.CONTROL_PLANE_QUERY_TIMEOUT_MS]: 8000,
    [PROFILE_FIELD.CONTROL_PLANE_SQL_QUERY_TIMEOUT_MS]: 25000,
    [PROFILE_FIELD.SWIM_PROBE_TIMEOUT_MS]: 5000,
    [PROFILE_FIELD.SWIM_PROBE_INTERVAL_MS]: 8000,
    [PROFILE_FIELD.DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS]: 10000,
    [PROFILE_FIELD.REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS]: 10000,
    [PROFILE_FIELD.OPERATION_PERSIST_RETRY_TIMEOUT_MS]: 30000,
    [PROFILE_FIELD.COORDINATOR_QUERY_TIMEOUT_MS]: 45000,
    [PROFILE_FIELD.READINESS_OBSERVATION_PROBE_TIMEOUT_MS]: 1000,
  }),
});

const PROFILE_FIELD_CONFIG_KEY_MAP = Object.freeze([
  [PROFILE_FIELD.TICK_INTERVAL_MS, CONFIG_KEY.RAFT_TICK_INTERVAL_MS],
  [PROFILE_FIELD.HEARTBEAT_INTERVAL_MS, CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS],
  [
    PROFILE_FIELD.ELECTION_TIMEOUT_MIN_MS,
    CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
  ],
  [
    PROFILE_FIELD.ELECTION_TIMEOUT_MAX_MS,
    CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
  ],
  [
    PROFILE_FIELD.TRANSPORT_MESSAGE_TIMEOUT_MS,
    TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS,
  ],
  [
    PROFILE_FIELD.TRANSPORT_PING_TIMEOUT_MS,
    TRANSPORT_CONFIG_KEY.PING_TIMEOUT_MS,
  ],
  [
    PROFILE_FIELD.TRANSPORT_RECONNECT_INTERVAL_MS,
    TRANSPORT_CONFIG_KEY.RECONNECT_INTERVAL_MS,
  ],
  [
    PROFILE_FIELD.CONTROL_PLANE_OPERATION_BUDGET_MS,
    CONFIG_KEY.TIMEOUT_CONTROL_PLANE_OPERATION_BUDGET_MS,
  ],
  [
    PROFILE_FIELD.CONTROL_PLANE_READY_LEASE_MS,
    CONFIG_KEY.CONTROL_PLANE_READY_LEASE_MS,
  ],
  [
    PROFILE_FIELD.CONTROL_PLANE_HEARTBEAT_INTERVAL_MS,
    CONFIG_KEY.CONTROL_PLANE_HEARTBEAT_INTERVAL_MS,
  ],
  [
    PROFILE_FIELD.CONTROL_PLANE_STALE_HEARTBEAT_MAX_AGE_MS,
    CONFIG_KEY.CONTROL_PLANE_STALE_HEARTBEAT_MAX_AGE_MS,
  ],
  [
    PROFILE_FIELD.CONTROL_PLANE_REPAIR_STALE_HEARTBEAT_MAX_AGE_MS,
    CONFIG_KEY.CONTROL_PLANE_REPAIR_STALE_HEARTBEAT_MAX_AGE_MS,
  ],
  [
    PROFILE_FIELD.CONTROL_PLANE_QUERY_TIMEOUT_MS,
    CONFIG_KEY.TIMEOUT_CONTROL_PLANE_QUERY_TIMEOUT_MS,
  ],
  [
    PROFILE_FIELD.CONTROL_PLANE_SQL_QUERY_TIMEOUT_MS,
    CONFIG_KEY.TIMEOUT_CONTROL_PLANE_SQL_QUERY_TIMEOUT_MS,
  ],
  [
    PROFILE_FIELD.SWIM_PROBE_TIMEOUT_MS,
    CONFIG_KEY.CONTROL_PLANE_SWIM_PROBE_TIMEOUT_MS,
  ],
  [
    PROFILE_FIELD.SWIM_PROBE_INTERVAL_MS,
    CONFIG_KEY.CONTROL_PLANE_SWIM_PROBE_INTERVAL_MS,
  ],
  [
    PROFILE_FIELD.DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS,
    CONFIG_KEY.TIMEOUT_DYNAMIC_CONFIG_STARTUP_INITIAL_READ_MS,
  ],
  [
    PROFILE_FIELD.REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS,
    CONFIG_KEY.REBALANCER_REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS,
  ],
  [
    PROFILE_FIELD.OPERATION_PERSIST_RETRY_TIMEOUT_MS,
    CONFIG_KEY.REBALANCER_OPERATION_PERSIST_RETRY_TIMEOUT_MS,
  ],
  [
    PROFILE_FIELD.COORDINATOR_QUERY_TIMEOUT_MS,
    CONFIG_KEY.QUERY_COORDINATOR_QUERY_TIMEOUT_MS,
  ],
  [
    PROFILE_FIELD.READINESS_OBSERVATION_PROBE_TIMEOUT_MS,
    CONFIG_KEY.TIMEOUT_READINESS_OBSERVATION_PROBE_TIMEOUT_MS,
  ],
]);

const CONFIG_KEY_TO_PROFILE_FIELD = Object.freeze(
  Object.fromEntries(
    PROFILE_FIELD_CONFIG_KEY_MAP.map(([field, configKey]) => [configKey, field]),
  ),
);

const NETWORK_TIMING_ERROR_CODE = 'INVALID_NETWORK_TIMING_PROFILE';

const NETWORK_TIMING_ERROR_REASON = Object.freeze({
  UNKNOWN_PROFILE: 'unknown_profile',
  INVALID_INPUT: 'invalid_input',
  UNKNOWN_FIELD: 'unknown_field',
  NON_POSITIVE_NUMBER: 'non_positive_number',
  HEARTBEAT_BELOW_TICK: 'heartbeat_below_tick_interval',
  ELECTION_MIN_TOO_LOW: 'election_min_must_exceed_double_heartbeat',
  ELECTION_MAX_BELOW_MIN: 'election_max_below_election_min',
  TRANSPORT_TIMEOUT_BELOW_HEARTBEAT:
    'transport_timeout_must_exceed_heartbeat',
  CONFIG_MANAGER_REQUIRED: 'config_manager_required',
});

const ERROR_MESSAGE = Object.freeze({
  INVALID_INPUT:
    'Network timing profile must be a profile name string or plain object',
  CONFLICTING_SELECTORS:
    'Conflicting profile and profileId values in network timing overrides',
  CONFIG_MANAGER_REQUIRED:
    'ConfigurationManager instance is required to apply network timing profile',
});

function createInvalidProfileError(reason, message, details = {}) {
  const error = new Error(message);
  error.code = NETWORK_TIMING_ERROR_CODE;
  error.reason = reason;
  error.details = Object.freeze({...details});
  return error;
}

function isPositiveFiniteNumber(value) {
  return typeof value === TYPE_NUMBER && Number.isFinite(value) && value > 0;
}

/**
 * Single owner validation check for static/dynamic Raft timing tuples.
 * Enforces positive tick, heartbeat >= tick, electionMin > 2 * heartbeat,
 * and electionMin <= electionMax.
 *
 * @param {Object} timing
 * @return {boolean}
 */
function isValidStaticRaftTimingValues(timing = {}) {
  if (!timing || typeof timing !== TYPE_OBJECT) {
    return false;
  }
  const tickIntervalMs = timing[PROFILE_FIELD.TICK_INTERVAL_MS];
  const heartbeatIntervalMs = timing[PROFILE_FIELD.HEARTBEAT_INTERVAL_MS];
  const electionTimeoutMinMs = timing[PROFILE_FIELD.ELECTION_TIMEOUT_MIN_MS];
  const electionTimeoutMaxMs = timing[PROFILE_FIELD.ELECTION_TIMEOUT_MAX_MS];
  return isPositiveFiniteNumber(tickIntervalMs) &&
    isPositiveFiniteNumber(heartbeatIntervalMs) &&
    isPositiveFiniteNumber(electionTimeoutMinMs) &&
    isPositiveFiniteNumber(electionTimeoutMaxMs) &&
    heartbeatIntervalMs >= tickIntervalMs &&
    electionTimeoutMinMs > heartbeatIntervalMs * DOUBLE_HEARTBEAT_MULTIPLIER &&
    electionTimeoutMinMs <= electionTimeoutMaxMs;
}

function resolveProfileSelector(input) {
  const hasProfile = Object.hasOwn(input, PROFILE_SELECTOR_KEY.PROFILE) &&
    input[PROFILE_SELECTOR_KEY.PROFILE] !== undefined;
  const hasProfileId = Object.hasOwn(input, PROFILE_SELECTOR_KEY.PROFILE_ID) &&
    input[PROFILE_SELECTOR_KEY.PROFILE_ID] !== undefined;
  if (
    hasProfile &&
    hasProfileId &&
    input[PROFILE_SELECTOR_KEY.PROFILE] !== input[PROFILE_SELECTOR_KEY.PROFILE_ID]
  ) {
    throw createInvalidProfileError(
      NETWORK_TIMING_ERROR_REASON.INVALID_INPUT,
      ERROR_MESSAGE.CONFLICTING_SELECTORS,
    );
  }
  if (!hasProfile && !hasProfileId) {
    return {baseProfileId: NETWORK_TIMING_PROFILE.DEFAULT, baseExplicit: false};
  }
  const selector = hasProfileId ?
    input[PROFILE_SELECTOR_KEY.PROFILE_ID] :
    input[PROFILE_SELECTOR_KEY.PROFILE];
  if (
    typeof selector !== TYPE_STRING ||
    !Object.hasOwn(STATIC_NETWORK_TIMING_PROFILES, selector)
  ) {
    throw createInvalidProfileError(
      NETWORK_TIMING_ERROR_REASON.UNKNOWN_PROFILE,
      `Unknown network timing profile: ${String(selector)}`,
      {profileId: selector},
    );
  }
  return {baseProfileId: selector, baseExplicit: true};
}

function extractFieldOverrides(input) {
  const overrides = {};
  for (const key of Object.keys(input)) {
    if (!ALLOWED_INPUT_KEYS.has(key)) {
      throw createInvalidProfileError(
        NETWORK_TIMING_ERROR_REASON.UNKNOWN_FIELD,
        `Unknown network timing field: ${key}`,
        {field: key},
      );
    }
    if (
      key !== PROFILE_SELECTOR_KEY.PROFILE &&
      key !== PROFILE_SELECTOR_KEY.PROFILE_ID &&
      input[key] !== undefined
    ) {
      overrides[key] = input[key];
    }
  }
  return overrides;
}

function normalizeProfileInput(profileNameOrOverrides) {
  if (
    profileNameOrOverrides === undefined ||
    profileNameOrOverrides === null
  ) {
    return {
      baseProfileId: NETWORK_TIMING_PROFILE.DEFAULT,
      baseExplicit: false,
      overrides: {},
    };
  }
  if (typeof profileNameOrOverrides === TYPE_STRING) {
    if (!Object.hasOwn(STATIC_NETWORK_TIMING_PROFILES, profileNameOrOverrides)) {
      throw createInvalidProfileError(
        NETWORK_TIMING_ERROR_REASON.UNKNOWN_PROFILE,
        `Unknown network timing profile: ${profileNameOrOverrides}`,
        {profileId: profileNameOrOverrides},
      );
    }
    return {
      baseProfileId: profileNameOrOverrides,
      baseExplicit: true,
      overrides: {},
    };
  }
  if (
    typeof profileNameOrOverrides !== TYPE_OBJECT ||
    Array.isArray(profileNameOrOverrides)
  ) {
    throw createInvalidProfileError(
      NETWORK_TIMING_ERROR_REASON.INVALID_INPUT,
      ERROR_MESSAGE.INVALID_INPUT,
    );
  }
  const {baseProfileId, baseExplicit} =
    resolveProfileSelector(profileNameOrOverrides);
  const overrides = extractFieldOverrides(profileNameOrOverrides);
  return {baseProfileId, baseExplicit, overrides};
}

function assertPositiveFiniteFields(values) {
  for (const field of REQUIRED_NUMERIC_FIELDS) {
    if (!isPositiveFiniteNumber(values[field])) {
      throw createInvalidProfileError(
        NETWORK_TIMING_ERROR_REASON.NON_POSITIVE_NUMBER,
        `Network timing field ${field} must be a positive finite number`,
        {field, value: values[field]},
      );
    }
  }
}

function assertProfileInvariants(values) {
  assertPositiveFiniteFields(values);
  const tickMs = values[PROFILE_FIELD.TICK_INTERVAL_MS];
  const heartbeatMs = values[PROFILE_FIELD.HEARTBEAT_INTERVAL_MS];
  const electionMinMs = values[PROFILE_FIELD.ELECTION_TIMEOUT_MIN_MS];
  const electionMaxMs = values[PROFILE_FIELD.ELECTION_TIMEOUT_MAX_MS];
  const transportTimeoutMs = values[PROFILE_FIELD.TRANSPORT_MESSAGE_TIMEOUT_MS];
  if (heartbeatMs < tickMs) {
    throw createInvalidProfileError(
      NETWORK_TIMING_ERROR_REASON.HEARTBEAT_BELOW_TICK,
      `heartbeatIntervalMs (${heartbeatMs}) must be >= tickIntervalMs (${tickMs})`,
      {heartbeatIntervalMs: heartbeatMs, tickIntervalMs: tickMs},
    );
  }
  if (electionMinMs <= heartbeatMs * DOUBLE_HEARTBEAT_MULTIPLIER) {
    throw createInvalidProfileError(
      NETWORK_TIMING_ERROR_REASON.ELECTION_MIN_TOO_LOW,
      `electionTimeoutMinMs (${electionMinMs}) must exceed 2 * heartbeatIntervalMs (${heartbeatMs})`,
      {electionTimeoutMinMs: electionMinMs, heartbeatIntervalMs: heartbeatMs},
    );
  }
  if (electionMaxMs < electionMinMs) {
    throw createInvalidProfileError(
      NETWORK_TIMING_ERROR_REASON.ELECTION_MAX_BELOW_MIN,
      `electionTimeoutMaxMs (${electionMaxMs}) must be >= electionTimeoutMinMs (${electionMinMs})`,
      {electionTimeoutMaxMs: electionMaxMs, electionTimeoutMinMs: electionMinMs},
    );
  }
  if (transportTimeoutMs <= heartbeatMs) {
    throw createInvalidProfileError(
      NETWORK_TIMING_ERROR_REASON.TRANSPORT_TIMEOUT_BELOW_HEARTBEAT,
      `transportMessageTimeoutMs (${transportTimeoutMs}) must exceed ` +
        `heartbeatIntervalMs (${heartbeatMs})`,
      {transportMessageTimeoutMs: transportTimeoutMs, heartbeatIntervalMs: heartbeatMs},
    );
  }
}

/**
 * Validate and resolve a static network timing profile descriptor containing
 * requested parameters, effective raft-rs timing, and explicit discrepancies.
 *
 * @param {string|Object} [profileNameOrOverrides]
 * @return {Object} Frozen {profileId, requested, effective, discrepancies}.
 */
function resolveStaticNetworkTimingProfile(profileNameOrOverrides) {
  const {baseProfileId, baseExplicit, overrides} =
    normalizeProfileInput(profileNameOrOverrides);
  const baseProfile = STATIC_NETWORK_TIMING_PROFILES[baseProfileId];
  const merged = {...baseProfile, ...overrides};
  assertProfileInvariants(merged);
  const profileId = !baseExplicit && Object.keys(overrides).length > 0 ?
    PROFILE_CUSTOM_ID :
    baseProfileId;
  const raftTiming = describeEffectiveRaftRsTiming({
    tickIntervalMs: merged[PROFILE_FIELD.TICK_INTERVAL_MS],
    heartbeatMs: merged[PROFILE_FIELD.HEARTBEAT_INTERVAL_MS],
    electionMinMs: merged[PROFILE_FIELD.ELECTION_TIMEOUT_MIN_MS],
    electionMaxMs: merged[PROFILE_FIELD.ELECTION_TIMEOUT_MAX_MS],
  });
  const requested = Object.freeze({
    ...merged,
    raft: raftTiming.requested,
  });
  const effective = Object.freeze({
    ...merged,
    ...raftTiming.effective,
    [PROFILE_FIELD.HEARTBEAT_INTERVAL_MS]:
      raftTiming.effective.effectiveHeartbeatMs,
    [PROFILE_FIELD.ELECTION_TIMEOUT_MIN_MS]:
      raftTiming.effective.effectiveElectionMinMs,
    [PROFILE_FIELD.ELECTION_TIMEOUT_MAX_MS]:
      raftTiming.effective.effectiveElectionMaxMs,
  });
  return Object.freeze({
    profileId,
    requested,
    effective,
    discrepancies: raftTiming.discrepancies,
  });
}

/**
 * Resolve, validate, and apply a static network timing profile onto a
 * ConfigurationManager instance through one canonical owner.
 *
 * @param {Object} configManager
 * @param {string|Object} [profileNameOrOverrides]
 * @return {Object} Resolved frozen profile descriptor.
 */
function applyStaticNetworkTimingProfile(configManager, profileNameOrOverrides) {
  if (!configManager || typeof configManager !== TYPE_OBJECT) {
    throw createInvalidProfileError(
      NETWORK_TIMING_ERROR_REASON.CONFIG_MANAGER_REQUIRED,
      ERROR_MESSAGE.CONFIG_MANAGER_REQUIRED,
    );
  }
  const descriptor =
    resolveStaticNetworkTimingProfile(profileNameOrOverrides);
  const {requested} = descriptor;
  for (const [field, configKey] of PROFILE_FIELD_CONFIG_KEY_MAP) {
    configManager.setByPath(configKey, requested[field]);
  }
  if (!Object.isFrozen(configManager)) {
    configManager.networkTimingProfile = descriptor;
  }
  return descriptor;
}

function isResolvedProfileDescriptor(candidate) {
  return Boolean(
    candidate &&
    typeof candidate === TYPE_OBJECT &&
    typeof candidate.profileId === TYPE_STRING &&
    candidate.requested &&
    typeof candidate.requested === TYPE_OBJECT,
  );
}

function pickActiveProfileCandidate(context = {}) {
  const {networkTimingProfile, configManager, environment} = context;
  if (networkTimingProfile !== undefined && networkTimingProfile !== null) {
    return networkTimingProfile;
  }
  const manager = configManager || ConfigurationManager.getInstance();
  if (
    manager.networkTimingProfile !== undefined &&
    manager.networkTimingProfile !== null
  ) {
    return manager.networkTimingProfile;
  }
  const env = environment || process.env;
  return env[ENTRYPOINT_ENV.NETWORK_TIMING_PROFILE];
}

function resolveActiveStaticNetworkTimingProfile(context = {}) {
  const candidate = pickActiveProfileCandidate(context);
  if (candidate === undefined || candidate === null || candidate === '') {
    return null;
  }
  return isResolvedProfileDescriptor(candidate) ?
    candidate :
    resolveStaticNetworkTimingProfile(candidate);
}

function getProfileValueForConfigKey(descriptor, key) {
  if (!descriptor || typeof descriptor !== TYPE_OBJECT || !descriptor.requested) {
    return undefined;
  }
  const field = CONFIG_KEY_TO_PROFILE_FIELD[key];
  return field ? descriptor.requested[field] : undefined;
}

function resolveDynamicConfigSeedValue(key, definition, context = {}) {
  const descriptor = resolveActiveStaticNetworkTimingProfile(context);
  const profileValue = getProfileValueForConfigKey(descriptor, key);
  return profileValue !== undefined ? profileValue : definition?.defaultValue;
}

function resolveDynamicConfigReadValue(
  key,
  value,
  updatedBy,
  definition,
  context = {},
) {
  const descriptor = resolveActiveStaticNetworkTimingProfile(context);
  const profileValue = getProfileValueForConfigKey(descriptor, key);
  if (profileValue === undefined || value === profileValue) {
    return value;
  }
  const isSystemOrUnattributed =
    updatedBy === undefined ||
    updatedBy === null ||
    updatedBy === CONFIG_SEED_SOURCE.SYSTEM;
  if (!isSystemOrUnattributed) {
    return value;
  }
  const field = CONFIG_KEY_TO_PROFILE_FIELD[key];
  const defaultProfileValue =
    STATIC_NETWORK_TIMING_PROFILES[NETWORK_TIMING_PROFILE.DEFAULT]?.[field];
  if (
    value === definition?.defaultValue ||
    (descriptor.profileId !== NETWORK_TIMING_PROFILE.DEFAULT &&
      value === defaultProfileValue)
  ) {
    return profileValue;
  }
  return value;
}

function createDynamicConfigProfileResolver(options = {}) {
  const context = {
    networkTimingProfile: options.networkTimingProfile ?? null,
    configManager: options.configManager || null,
    environment: options.environment,
  };
  return {
    seedDefault: (key, definition) =>
      resolveDynamicConfigSeedValue(key, definition, context),
    resolveRead: (key, value, rowOrPayload, definition) =>
      resolveDynamicConfigReadValue(
        key,
        value,
        rowOrPayload?.[CONFIG_TABLE_COLUMN.UPDATED_BY],
        definition,
        context,
      ),
  };
}

export {
  NETWORK_TIMING_PROFILE,
  applyStaticNetworkTimingProfile,
  createDynamicConfigProfileResolver,
  isValidStaticRaftTimingValues,
  resolveStaticNetworkTimingProfile,
};
